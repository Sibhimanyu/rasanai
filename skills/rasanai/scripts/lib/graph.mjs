// Production dependency graph and scheduler (Plan 09 P1/P2). DERIVED every time from what exists: crew/plan.json (the crew's phases and members), the approvals (Story, Look,
// Storyboard), motion/score.json (scenes, seams, durations), look/continuity.json (shared components and seam contracts), crew/ledger.jsonl (what was accepted), crew/jobs/ and the
// capabilities. It is NOT a second plan, a second score or a second scheduler: crew.mjs `schedule` asks it which members are READY, the Director dispatches exactly those, and
// everything is recomputed on the next call. The render-level graph (scene-render, comp, color-finish, sound-mix, package nodes with content keys) is lib/hybrid-graph (restored from
// phase2/hybrid-film-studio); this graph links to it, it does not duplicate it.
//
//   compileGraph({ run, plan, policy, score, continuity, ledger, caps, estimate })  -> { nodes, groups, boundaries, barriers, digest }
//   committedStages(run)                         which user calls are committed NOW (brief, story, look, storyboard, final)
//   partitionScenes(score, continuity, opts)     continuity groups + boundary contracts (P2)
//   chooseWorkers({ policy, graph, observed, throttle })  how many build workers to start / expand to, and why (P2: never blindly 8-12)
//   schedule(o)                                  node states, the ready set, user barriers, worker count, resource demand per ready node
//
// Rules: only ready nodes run; a user wait is a real barrier (no approval is fabricated); storyboard work needs the chosen Story and Look; final scene builds need the approved
// storyboard; ONE owner keeps story, shared components, timing and the integrated film (owner roles below); scheduling a node grants no right to rewrite its upstream decision.
import fs from "node:fs";
import path from "node:path";
import { canonicalDigest } from "./contracts.mjs";
import { ancestors } from "./stages.mjs";
import { lookCommitted } from "./look.mjs";
import { storyDigest, lookDigest, snapshotRun } from "./storyboard.mjs";
import { TRAVELING_KINDS } from "./continuity.mjs";
import { scoreRevision } from "./timing.mjs";

export const GRAPH_SCHEMA = 1;
export const NODE_KINDS = Object.freeze(["research", "capture", "treatment", "look_specimen", "storyboard_group", "asset_prep", "voice", "music", "scene_group", "render_fragment", "composite", "mix", "finish", "delivery", "review"]);
// the resource class a node draws on (lib/resource-pools.mjs POOLS), or "model_job" for agent work
export const KIND_RESOURCE = Object.freeze({ research: "model_job", capture: "browser_capture", treatment: "model_job", look_specimen: "model_job", storyboard_group: "model_job", asset_prep: "browser_capture", voice: "model_job", music: "model_job", scene_group: "model_job", render_fragment: "video_render", composite: "video_render", mix: "encode", finish: "video_render", delivery: "encode", review: "model_job" });
// kind -> the stage whose commit it needs upstream (stages.mjs). Approvals required = the user calls among that stage's ancestors.
export const KIND_STAGE = Object.freeze({ research: "brief", capture: "brief", treatment: "story", look_specimen: "look", storyboard_group: "storyboard", asset_prep: "brief", voice: "storyboard", music: "storyboard", scene_group: "build", render_fragment: "build", composite: "build", mix: "build", finish: "build", delivery: "final", review: "build" });
const USER_CALLS = ["story", "look", "storyboard"];
// ONE owner for each shared thing (the plan: story, shared components, timing, the integrated film). A node owned by another role may ask, never redefine.
export const OWNERS = Object.freeze({ story: "script-writer/story owner (the chosen treatment)", shared_components: "lead builder (film-builder or the lead scene-animator)", timing: "motion-director (motion/score.json)", integrated_film: "film-builder / lead builder" });

const PHASE_KIND = {
  research: "research", "research-lead": "research", "design-research": "research", "footage-audit": "research", "footage-log": "research", selects: "research", "brand-film": "capture",
  story: "treatment", "story-plan": "treatment", "story-edit": "treatment", "story-revise": "treatment", "story-escalate": "treatment", treatments: "treatment", "visual-writers": "treatment", moves: "treatment", "moves-jury": "treatment", "moves-roughs": "treatment",
  "design-system": "look_specimen", "design-systems": "look_specimen", "look-series": "look_specimen", "look-auto": "look_specimen", "look-heroes": "look_specimen", styleframes: "look_specimen", "styleframes-show": "look_specimen", "styleframes-call": "look_specimen",
  thumbs: "storyboard_group", art: "storyboard_group", boards: "storyboard_group", "frames-jury": "storyboard_group", "style-match-boards": "storyboard_group", "concept-gate": "storyboard_group", moments: "storyboard_group", score: "storyboard_group", keyframes: "storyboard_group", "keyframes-review": "storyboard_group", "storyboard-record": "storyboard_group",
  "audio-direction": "music",
  build: "scene_group", lead: "scene_group", spike: "scene_group", animate: "scene_group", "animate-graphics": "scene_group", seams: "scene_group", "animatic-draft": "scene_group",
  review: "review", "review-film": "review", "style-match-draft": "review",
};
// brief-stage phases that start together (the plan says "in parallel"): they depend on nothing but the brief
const PARALLEL_STARTERS = new Set(["research", "design-research", "footage-audit", "brand-film"]);
// known artifacts a phase leaves (when the phase is accepted); unknown phases are tracked by the crew ledger only
const PHASE_OUT = { story: ["story/pitches.json"], "design-system": ["look/DESIGN.md"], "design-systems": ["look/DESIGN.md"], score: ["motion/score.json"], "storyboard-record": ["storyboard/storyboard.json"], "audio-direction": ["audio/direction.json"], research: ["research/claims.json"], "research-lead": ["story/truth.md"], build: ["index.html"], animate: ["compositions/"], seams: ["index.html"] };

const rj = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
const has = (f) => { try { return fs.statSync(f).isFile(); } catch { return false; } };
const arr = (x) => (Array.isArray(x) ? x : []);
const keyOf = (role, key) => `${role}|${key || ""}`;

// ---- what the person has committed ---------------------------------------------------------------------------------------------------
export function committedStages(run) {
  const r = path.resolve(String(run));
  const out = { brief: has(path.join(r, "brief.json")) || has(path.join(r, "crew", "plan.json")), story: !!storyDigest(r), look: lookCommitted(r).committed, storyboard: false, final: false };
  const reasons = { storyboard: "no approved storyboard snapshot and no recorded 'Just make it' decision" };
  const ap = rj(path.join(r, "storyboard", "approvals.json"));
  const recs = arr(ap && ap.records);
  const dec = rj(path.join(r, "storyboard", "decision.json"));
  if (recs.length) {
    let cur = null; try { cur = snapshotRun(r, { check: true }); } catch { cur = null; }
    if (cur && cur.ok && cur.current === false) { reasons.storyboard = "the approved storyboard no longer matches the Story, Look or panels: it must be approved again"; }
    else { out.storyboard = true; reasons.storyboard = null; }
  } else if (dec && arr(dec.decisions).some((d) => d && d.decision === "auto")) { out.storyboard = true; reasons.storyboard = null; }
  const sess = rj(path.join(r, "session.json"));
  const fin = sess && sess.steps && sess.steps.final;
  if (fin && /approved|accepted|done|delivered/i.test(String(fin.status || ""))) out.final = true;
  return { ...out, reasons, digests: { story: (storyDigest(r) || {}).digest || null, look: (lookDigest(r) || {}).digest || null, storyboard: recs.length ? (recs[recs.length - 1].artifact_digest || null) : null } };
}

// ---- P2: partition by continuity ------------------------------------------------------------------------------------------------------
const STRONG_LINKS = new Set(["same_object", "causal_handoff", "temporal_continuation"]);
const COUPLING_COMPONENTS = new Set(["character", "object", "camera"]); // persistent things that live across cuts
const endpointId = (e) => (e && typeof e === "object" ? String(e.scene_id || e.beat_id || e.id || "") : String(e || ""));
const sid = (sc, i) => (sc && sc.id != null ? String(sc.id) : sc && sc.n != null ? `s${sc.n}` : `s${i + 1}`);
const BOUNDARY_FIELDS = ["semantic_objects", "positions_units", "camera_crop", "scale", "color_treatment", "start_end_time"]; // velocity_transform only when continuity requires it
// -> { groups:[{id, scenes:[ids], reasons:[...], owner, oversized}], boundaries:[{from, to, kind, coupling, contract, missing}], basis }
export function partitionScenes(score, continuity = null, { max_group_scenes = 6 } = {}) {
  const S = arr(score && score.scenes), ids = S.map(sid), n = S.length;
  const parent = ids.map((_, i) => i); const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const why = ids.map(() => new Set());
  const union = (a, b, reason) => { const ra = find(a), rb = find(b); if (ra !== rb) { const keep = Math.min(ra, rb), drop = Math.max(ra, rb); parent[drop] = keep; for (const x of why[drop]) why[keep].add(x); } why[find(a)].add(reason); };
  const index = new Map(ids.map((id, i) => [id, i]));
  const sceneN = new Map(S.map((s, i) => [String(s && s.n != null ? s.n : i + 1), i]));
  const seamKind = (i) => { const m = arr(score && score.seams).find((x) => String(x.from) === String(S[i] && S[i].n != null ? S[i].n : i + 1) && String(x.to) === String(S[i + 1] && S[i + 1].n != null ? S[i + 1].n : i + 2)); return m ? String(m.kind || "") : (S[i] && S[i].transition ? String(typeof S[i].transition === "object" ? S[i].transition.kind || "" : S[i].transition) : ""); };
  const boundaries = [];
  for (let i = 0; i < n - 1; i++) {
    const k = seamKind(i), traveling = TRAVELING_KINDS.includes(k);
    const link = arr(continuity && continuity.links).find((l) => (endpointId(l.from) === ids[i] && endpointId(l.to) === ids[i + 1]) || (endpointId(l.from) === ids[i + 1] && endpointId(l.to) === ids[i]));
    const linkStrong = !!link && STRONG_LINKS.has(link.type);
    let coupling = "low", reason = null;
    if (traveling) { coupling = "strong"; reason = `seam ${ids[i]}->${ids[i + 1]} is a ${k}: something travels across the cut`; }
    else if (linkStrong) { coupling = "strong"; reason = `continuity link ${link.id || ""} (${link.type}) joins ${ids[i]} and ${ids[i + 1]}`; }
    if (coupling === "strong") union(i, i + 1, reason);
    boundaries.push({ from: ids[i], to: ids[i + 1], kind: traveling ? k : link && link.type === "deliberate_discontinuity" ? "hard_cut" : k && !/^(cut|hard[-_ ]?cut|none)$/i.test(k) ? k : "hard_cut", coupling, link: link ? { id: link.id || null, type: link.type, object_id: link.object_id || null, boundary: link.boundary || null } : null, _i: i });
  }
  // a persistent character / object / camera used by several scenes (even across hard cuts, even not adjacent) keeps those scenes under one builder
  for (const comp of arr(continuity && continuity.shared_components)) {
    if (!COUPLING_COMPONENTS.has(comp.kind)) continue;
    const users = Object.entries((continuity && continuity.scenes) || {}).filter(([, r]) => arr(r && r.uses).includes(comp.id)).map(([s]) => index.get(s)).filter((x) => x !== undefined).sort((a, b) => a - b);
    for (let k = 1; k < users.length; k++) union(users[0], users[k], `${comp.kind} ${comp.id} persists across scenes ${ids[users[0]]} and ${ids[users[k]]}`);
  }
  const by = new Map();
  ids.forEach((id, i) => { const r = find(i); (by.get(r) || by.set(r, []).get(r)).push(id); });
  const groups = [...by.entries()].sort((a, b) => a[0] - b[0]).map(([root, scenes], g) => ({ id: `g${g + 1}`, scenes, reasons: [...why[root]], owner: scenes.length > 1 ? "one builder (strongly coupled shots)" : "independent (own builder, entry/exit contracts)", oversized: scenes.length > max_group_scenes }));
  const groupOf = new Map(); groups.forEach((g) => g.scenes.forEach((s) => groupOf.set(s, g.id)));
  const cross = boundaries.filter((b) => groupOf.get(b.from) !== groupOf.get(b.to)).map((b) => {
    const t0 = S[b._i], t1 = S[b._i + 1];
    const contract = b.kind === "hard_cut" ? { hard_cut: true, note: "a purposeful cut is a valid low-coupling boundary: no morph is required, only agreed end/start times" } : (b.link && b.link.boundary) || null;
    const required = b.kind === "hard_cut" ? ["start_end_time"] : [...BOUNDARY_FIELDS, ...(b.link && /same_object|causal_handoff|temporal_continuation/.test(b.link.type || "") ? ["velocity_transform"] : [])];
    const missing = required.filter((f) => !(contract && (contract[f] !== undefined && contract[f] !== null)) && f !== "start_end_time"); // times come from the score
    return { from: b.from, to: b.to, kind: b.kind, link: b.link, group_from: groupOf.get(b.from), group_to: groupOf.get(b.to), contract, required_fields: required, start_end_time: { from_end_s: arr(score.scenes).slice(0, b._i + 1).reduce((a, s) => a + (Number(s.duration) || 0), 0), to_start_s: arr(score.scenes).slice(0, b._i + 1).reduce((a, s) => a + (Number(s.duration) || 0), 0) }, missing, status: missing.length ? "needs_contract" : "specified", writer: OWNERS.shared_components, _t: [t0 && t0.id, t1 && t1.id] };
  }).map(({ _t, ...x }) => x);
  return { groups, boundaries: cross, basis: "derived from seams, continuity links and persistent components; thresholds are proposed starting values", scenes: ids.length };
}

// ---- P2: how many build workers ---------------------------------------------------------------------------------------------------------
export function readObserved(run) {
  const f = path.join(path.resolve(String(run)), "crew", "throughput.jsonl");
  try { return fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch { return []; }
}
const tputOf = (rows, n) => { const r = rows.filter((x) => x.workers === n && x.items_per_min > 0); return r.length ? r.reduce((a, x) => a + x.items_per_min, 0) / r.length : null; };
// o: { policy, ready_independent (ready scene groups/animators), total_s, scenes, observed:[{workers, items_per_min, queue_wait_s}], throttled:boolean, usage_known:boolean, max }
// A starting policy and rules for moving it; nothing here is a measured optimum (Plan 14 calibrates). Never "8-12 agents for every short video".
export function chooseWorkers(o = {}) {
  const pol = o.policy && o.policy.resources || {};
  const env = Number(process.env.RASANAI_BUILD_WORKERS);
  const start = Number.isFinite(env) && env >= 1 ? env : Math.max(1, Number(pol.build_workers && pol.build_workers.start || pol.parallel_workers) || 3);
  const cap = Math.max(start, Math.min(8, Number(o.max) || start + 2));
  const reasons = [];
  const ready = Math.max(0, Number(o.ready_independent) || 0);
  const simple = (Number(o.scenes) > 0 && Number(o.scenes) <= 2) || (Number(o.total_s) > 0 && Number(o.total_s) <= 15) || (o.policy && o.policy.execution && o.policy.execution.build_shape === "direct");
  if (simple) return { workers: 1, start, cap, basis: "proposed", reasons: ["a simple sting or direct film is one builder: more agents would spend more time loading context than working"] };
  let w = Math.min(start, Math.max(1, ready));
  reasons.push(`start ${start} (policy build_workers), ${ready} ready independent task(s)`);
  if (o.usage_known === false) { w = Math.min(w, 2); reasons.push("subscription usage is unreported: concurrency held conservatively at 2"); }
  if (o.throttled) { w = Math.max(1, w - 1); reasons.push("the provider asked to slow down: one fewer worker"); }
  const obs = arr(o.observed);
  const wait = obs.length ? obs[obs.length - 1].queue_wait_s : null;
  if (wait !== null && wait !== undefined && wait > 120) { w = Math.max(1, w - 1); reasons.push(`the heavy-resource queue wait is ${Math.round(wait)} s: more workers would only queue`); }
  else if (!o.throttled && o.usage_known !== false && ready > w && w < cap) {
    const a = tputOf(obs, w), b = tputOf(obs, w - 1);
    if (a !== null && (b === null || a >= b * 1.15) && (wait === null || wait === undefined || wait < 60)) { w += 1; reasons.push(`observed throughput at ${w - 1} workers (${a.toFixed(2)}/min) still rose >=15% over ${w - 2}: one more, because ${ready - (w - 1)} independent task(s) are still ready`); }
    else reasons.push("no observed throughput gain that would justify another worker: staying put");
  }
  return { workers: Math.max(1, Math.min(w, cap)), start, cap, basis: "proposed", observed_rows: obs.length, reasons };
}

// ---- compile --------------------------------------------------------------------------------------------------------------------------
function requiredApprovals(kind, stage = null) {
  const st = stage || KIND_STAGE[kind] || "build";
  const anc = new Set(ancestors(st));
  return USER_CALLS.filter((c) => anc.has(c));
}
const lastEvents = (ledger) => { const m = new Map(); for (const r of arr(ledger)) if (r && r.role) m.set(keyOf(r.role, r.key), r); return m; };

export function compileGraph(o = {}) {
  const run = path.resolve(String(o.run));
  const plan = o.plan || rj(path.join(run, "crew", "plan.json")) || { phases: [] };
  const score = o.score !== undefined ? o.score : rj(path.join(run, "motion", "score.json"));
  const continuity = o.continuity !== undefined ? o.continuity : rj(path.join(run, "look", "continuity.json"));
  const nodes = [], byId = new Map();
  const add = (n) => { const node = { inputs: [], outputs: [], prerequisites: [], approvals: [], cache_policy: { cacheable: false, job_type: "tool_side_effect", why: "agent work is accepted by its check, not replayed from a cache" }, est: null, ...n }; nodes.push(node); byId.set(node.id, node); return node; };
  const estimate = typeof o.estimate === "function" ? o.estimate : () => null;
  // 1. the crew's own phases, in plan order
  let prevStagePhases = [], lastInStage = new Map(), lastPhaseIds = [];
  const phases = arr(plan.phases);
  const kindOf = (ph) => PHASE_KIND[ph.phase] || (ph.stage === "storyboard" ? "storyboard_group" : "scene_group");
  const idsOfPhase = new Map();
  for (const ph of phases) {
    const kind = kindOf(ph), stage = ph.stage || KIND_STAGE[kind] || "build"; // plan.annotatePhases already tags production phases with their stage
    const members = arr(ph.dispatch).length ? ph.dispatch : [{ role: null, key: null, director_step: true }]; // a Director-only phase is still a node (a deterministic step)
    const directorOnly = !arr(ph.dispatch).length; // the crew ledger never records a Director step, so it is listed but never gates a later node (it would deadlock the graph)
    const prev = PARALLEL_STARTERS.has(ph.phase) ? [] : (lastInStage.get(stage) || []);
    const mine = [];
    for (const m of members) {
      const id = `${ph.phase}${m.role ? ":" + m.role : ""}${m.key ? ":" + m.key : ""}`;
      add({ id, kind, phase: ph.phase, role: m.role || "director", key: m.key || null, director_step: !!m.director_step, stage, resource_class: m.director_step ? "none" : KIND_RESOURCE[kind] || "model_job", prerequisites: prev.slice(),
        approvals: arr(ph.requires_committed).length ? arr(ph.requires_committed).filter((c) => USER_CALLS.includes(c)) : requiredApprovals(kind, stage), outputs: [...(PHASE_OUT[ph.phase] || []).map((p) => ({ ref: p })), ...(m.role ? [{ ref: `crew/ledger:ok:${m.role}|${m.key || ""}` }] : [])], inputs: [{ ref: "crew/plan.json" }],
        owner: ph.phase === "seams" || ph.phase === "lead" || ph.phase === "build" ? OWNERS.integrated_film : ph.phase === "score" || ph.phase === "storyboard-record" ? OWNERS.timing : ph.phase === "story" ? OWNERS.story : null,
        est: m.role ? { tokens: estimate(m.role, m.key), basis: "proposed estimate (crew TOKENS), not a measurement" } : null,
        cache_policy: m.role ? { cacheable: false, job_type: "tool_side_effect", why: "agent work: accepted by crew.mjs check, never replayed" } : { cacheable: true, job_type: "pure_artifact", why: "a deterministic Director step over declared inputs" }, spawn_rule: ph.when || null });
      mine.push(id);
    }
    idsOfPhase.set(ph.phase, (idsOfPhase.get(ph.phase) || []).concat(mine));
    // the next phase in the same stage waits for this one (members of one phase are parallel peers)
    if (!directorOnly) lastInStage.set(stage, mine);
  }
  // 2. the production tail DERIVED from the score and the audio contract (these are not plan phases; they are the work after the scenes exist)
  const scenes = arr(score && score.scenes), ids = scenes.map(sid);
  const part = score && scenes.length ? partitionScenes(score, continuity) : { groups: [], boundaries: [], scenes: 0 };
  const buildDone = (idsOfPhase.get("build") || []).concat(idsOfPhase.get("seams") || []);
  const lastBuild = (idsOfPhase.get("seams") || idsOfPhase.get("animate") || idsOfPhase.get("build") || []).slice();
  const audio = rj(path.join(run, "audio", "contract.json")) || rj(path.join(run, "storyboard", "audio.json"));
  const voiceNode = audio && (audio.vo || (audio.voice && audio.voice.lines)) ? add({ id: "voice:narration", kind: "voice", role: "voice.mjs", stage: "storyboard", resource_class: "model_job", approvals: ["story", "look"], prerequisites: (idsOfPhase.get("storyboard-record") || []).slice(), inputs: [{ ref: "audio/contract.json" }], outputs: [{ ref: "audio/voice-cache.json" }], cache_policy: { cacheable: true, job_type: "immutable_media", why: "per-line voice cache keyed by line text, voice, engine and glossary (lib/voice-cache.mjs)" } }) : null;
  const musicNode = audio && audio.kind && audio.kind !== "none" && audio.file ? add({ id: "music:track", kind: "music", role: "music.mjs", stage: "storyboard", resource_class: "model_job", approvals: ["story", "look"], prerequisites: [], inputs: [{ ref: "audio/contract.json" }], outputs: [{ ref: String(audio.file) }], cache_policy: { cacheable: true, job_type: "immutable_media", why: "a chosen track is an immutable file with a recorded checksum" } }) : null;
  const frag = [];
  for (const g of part.groups) {
    const gnode = add({ id: `scene_group:${g.id}`, kind: "scene_group", role: g.scenes.length > 1 ? "film-builder|scene-animator (one builder for the group)" : "scene-animator", key: g.scenes.join("+"), stage: "build", resource_class: "model_job", approvals: ["story", "look", "storyboard"], prerequisites: (idsOfPhase.get("lead") || idsOfPhase.get("storyboard-record") || []).slice(), inputs: [{ ref: "motion/score.json" }, { ref: "look/continuity.json" }], outputs: g.scenes.map((s) => ({ ref: `compositions/${s}.html` })), continuity_group: g, owner: OWNERS.shared_components, cache_policy: { cacheable: false, job_type: "tool_side_effect", why: "agent-built scene code is accepted by its checks" } });
    for (const s of g.scenes) frag.push(add({ id: `render_fragment:${s}`, kind: "render_fragment", role: "hybrid-render.mjs", key: s, stage: "build", resource_class: "video_render", approvals: ["story", "look", "storyboard"], prerequisites: [gnode.id], inputs: [{ ref: `compositions/${s}.html` }, { ref: "motion/score.json" }, { ref: "hybrid/edit-graph.json" }], outputs: [{ ref: `hybrid/cache/<content_key>/${s}.mp4` }], cache_policy: { cacheable: true, job_type: "immutable_media", key_inputs: "lib/render-keys.mjs + lib/hybrid-graph content_key", why: "a fragment is reused only when its content key and every dependency still match" }, est: { render_s: null, mem_mb: null, basis: "unknown until observed; no estimate is invented" } }));
  }
  const fragIds = frag.map((n) => n.id);
  const comp = fragIds.length ? add({ id: "composite:film", kind: "composite", role: "hybrid-render.mjs", stage: "build", resource_class: "encode", approvals: ["story", "look", "storyboard"], prerequisites: fragIds.slice(), inputs: [{ ref: "hybrid/cache" }], outputs: [{ ref: "hybrid/renders/preview.mp4" }], cache_policy: { cacheable: true, job_type: "immutable_media", why: "assembled at one time base with verified frame counts" }, owner: OWNERS.integrated_film }) : null;
  const mix = add({ id: "mix:film", kind: "mix", role: "soundplan.mjs", stage: "build", resource_class: "encode", approvals: ["story", "look", "storyboard"], prerequisites: [voiceNode, musicNode].filter(Boolean).map((n) => n.id), inputs: [{ ref: "audio/contract.json" }, { ref: "motion/cues.json" }], outputs: [{ ref: "audio/mix-receipt-delivery.json" }], cache_policy: { cacheable: true, job_type: "immutable_media", why: "reused when the mix receipt still matches its inputs (lib/mix-receipt.mjs reuseDecision); reused untouched on a visual-only edit" } });
  const fin = add({ id: "finish:film", kind: "finish", role: "finish.mjs", stage: "build", resource_class: "video_render", approvals: ["story", "look", "storyboard"], prerequisites: [comp && comp.id, mix.id].filter(Boolean), inputs: [{ ref: "hybrid/renders" }], outputs: [{ ref: "renders/" }], cache_policy: { cacheable: true, job_type: "immutable_media", why: "film-wide finish is applied ONCE over the assembled picture; per-fragment finishing is not used" }, owner: OWNERS.integrated_film });
  add({ id: "delivery:film", kind: "delivery", role: "deliver.mjs", stage: "final", resource_class: "encode", approvals: ["story", "look", "storyboard"], user_barrier: "final", prerequisites: [fin.id, ...(idsOfPhase.get("review") || [])], inputs: [{ ref: "renders/" }], outputs: [{ ref: "deliver/" }], cache_policy: { cacheable: false, job_type: "tool_side_effect", why: "delivery publishes files; the previous delivered file stays until a new valid one exists" } });
  // 3. validate: acyclic, ids unique, prerequisites exist
  const problems = [];
  for (const n of nodes) n.prerequisites = n.prerequisites.filter((p) => { if (!byId.has(p)) { problems.push(`${n.id}: prerequisite ${p} does not exist`); return false; } return true; });
  const state = new Map();
  const visit = (id, trail) => { if (state.get(id) === 2) return; if (state.get(id) === 1) { problems.push(`cycle: ${[...trail, id].join(" -> ")}`); return; } state.set(id, 1); for (const p of byId.get(id).prerequisites) visit(p, [...trail, id]); state.set(id, 2); };
  for (const n of nodes) visit(n.id, []);
  const digest = canonicalDigest({ nodes: nodes.map((n) => [n.id, n.prerequisites, n.approvals]), score: score ? scoreRevision(score) : null, groups: part.groups.map((g) => g.scenes) });
  return { schema_version: GRAPH_SCHEMA, derived: true, note: "derived from crew/plan.json, the approvals, motion/score.json and the continuity contract; never edited, never a second plan", digest, nodes, groups: part.groups, boundaries: part.boundaries, problems, owners: OWNERS };
}

// ---- schedule -------------------------------------------------------------------------------------------------------------------------
// o: compileGraph options plus { committed (default committedStages(run)), caps: { [capability id]: boolean }, jobs: [job records], observed, throttled, usage_known }
// node state: done | running | needs_work | ready | waiting (prerequisites) | waiting_on_approval (a user wait: a REAL barrier) | blocked (capability or graph problem)
export function schedule(o = {}) {
  const run = path.resolve(String(o.run));
  const graph = compileGraph(o);
  const plan = o.plan || rj(path.join(run, "crew", "plan.json")) || {};
  const committed = o.committed || committedStages(run);
  const gated = !!plan.look_gate; // plans written before the Look gate keep running: their approvals are not enforced, and the node says so
  const last = lastEvents(o.ledger);
  const jobs = new Map(arr(o.jobs).map((j) => [j.node_id, j]));
  const st = new Map();
  const stateOf = (n) => {
    if (st.has(n.id)) return st.get(n.id);
    let s, why = null, barrier = null;
    const ev = n.role && n.role !== "director" ? last.get(keyOf(n.role, n.key)) : null;
    const job = jobs.get(n.id);
    if (n.director_step) { const done = n.outputs.length > 0 && n.outputs.every((o) => !o.ref.startsWith("crew/ledger") && has(path.join(run, o.ref))); const r0 = { state: done ? "done" : "director_step", why: done ? null : "a Director step (run the named scripts); it is listed, not dispatched, and does not gate later members", barrier: null }; st.set(n.id, r0); return r0; }
    if (ev && ev.event === "ok") s = "done";
    else if (job && job.state === "completed") s = "done";
    else if (job && (job.state === "running" || job.state === "leased")) s = "running";
    else if (ev && ev.event === "brief") s = "running";
    else if (job && job.state === "unknown_outcome") { s = "blocked"; why = "provider outcome unknown: reconcile, never resubmit"; }
    else if (ev && ev.event === "fail") s = "needs_work";
    else s = null;
    if (s === "done" || s === "running") { const r = { state: s, why, barrier }; st.set(n.id, r); return r; }
    // not started: why can it not start yet?
    const missingApprovals = n.approvals.filter((c) => !committed[c]);
    if (missingApprovals.length && gated) { s = "waiting_on_approval"; barrier = missingApprovals[0]; why = `waits for the person's ${missingApprovals.join(" and ")} call${missingApprovals.length > 1 ? "s" : ""}${committed.reasons && committed.reasons[missingApprovals[0]] ? ": " + committed.reasons[missingApprovals[0]] : ""}`; }
    else if (n.user_barrier && !committed[n.user_barrier]) { s = n.state0 || "waiting_on_approval"; barrier = n.user_barrier; why = `waits for the person's ${n.user_barrier} decision (not fabricated)`; }
    else {
      const pend = n.prerequisites.filter((p) => stateOf(byId.get(p)).state !== "done");
      if (pend.length) { s = "waiting"; why = `waits for ${pend.slice(0, 4).join(", ")}${pend.length > 4 ? ` and ${pend.length - 4} more` : ""}`; }
      else if (n.needs_capability && !(o.caps && o.caps[n.needs_capability])) { s = "blocked"; why = `capability ${n.needs_capability} is not available here`; }
      else if (graph.problems.length) { s = "blocked"; why = `graph problem: ${graph.problems[0]}`; }
      else s = ev && ev.event === "fail" ? "needs_work" : "ready";
    }
    const r = { state: s, why, barrier, legacy_unenforced: !gated && missingApprovals.length > 0 }; st.set(n.id, r); return r;
  };
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const out = graph.nodes.map((n) => { const r = stateOf(n); return { id: n.id, kind: n.kind, phase: n.phase || null, role: n.role, key: n.key, stage: n.stage, resource_class: n.resource_class, state: r.state, why: r.why, barrier: r.barrier || null, legacy_unenforced: !!r.legacy_unenforced, approvals: n.approvals, prerequisites: n.prerequisites, owner: n.owner || null, cache_policy: n.cache_policy, est: n.est, spawn_rule: n.spawn_rule || null }; });
  const ready = out.filter((n) => (n.state === "ready" || n.state === "needs_work") && n.role !== "director");
  const readyBuild = ready.filter((n) => n.kind === "scene_group" || (n.kind === "scene_group" && n.phase === "animate"));
  const sceneCount = arr(o.score !== undefined ? o.score && o.score.scenes : (rj(path.join(run, "motion", "score.json")) || {}).scenes).length;
  const total_s = arr((o.score !== undefined ? o.score : rj(path.join(run, "motion", "score.json")) || {}).scenes).reduce((a, s) => a + (Number(s.duration) || 0), 0);
  const policy = o.policy || plan.policy || null;
  const workers = chooseWorkers({ policy, ready_independent: readyBuild.length, scenes: sceneCount, total_s, observed: o.observed || readObserved(run), throttled: !!o.throttled, usage_known: o.usage_known });
  const barriers = [...new Set(out.filter((n) => n.state === "waiting_on_approval").map((n) => n.barrier))];
  const modelReady = ready.filter((n) => n.resource_class === "model_job");
  // model jobs: at most `workers` build workers; other ready model work (research writers, critics) is not build work and keeps its own parallelism
  const dispatchNow = [...ready.filter((n) => n.resource_class !== "model_job" || n.kind !== "scene_group"), ...modelReady.filter((n) => n.kind === "scene_group").slice(0, workers.workers)];
  return {
    schema_version: GRAPH_SCHEMA, graph_digest: graph.digest, derived: true,
    summary: out.reduce((a, n) => { a[n.state] = (a[n.state] || 0) + 1; return a; }, {}),
    ready: ready.map((n) => n.id), dispatch_now: dispatchNow.map((n) => n.id), held_for_workers: modelReady.filter((n) => n.kind === "scene_group").slice(workers.workers).map((n) => n.id),
    workers, barriers, user_waits: barriers.map((b) => ({ call: b, state: "waiting_on_the_person", note: "a real barrier: nothing here approves it for them" })),
    committed: { brief: committed.brief, story: committed.story, look: committed.look, storyboard: committed.storyboard, final: committed.final }, look_gate: gated,
    groups: graph.groups, boundaries: graph.boundaries, problems: graph.problems, owners: graph.owners,
    resource_demand: Object.entries(ready.reduce((a, n) => { a[n.resource_class] = (a[n.resource_class] || 0) + 1; return a; }, {})).map(([pool, ready_nodes]) => ({ pool, ready_nodes })),
    nodes: out,
  };
}
// the digest of what a node was built from NOW (job input digest): the approved Story/Look/Storyboard digests, the score revision and the node identity
export function inputDigestFor(run, node, committed = null) {
  const c = committed || committedStages(run);
  const score = rj(path.join(path.resolve(String(run)), "motion", "score.json"));
  return canonicalDigest({ node: node.id, story: node.approvals.includes("story") ? c.digests.story : null, look: node.approvals.includes("look") ? c.digests.look : null, storyboard: node.approvals.includes("storyboard") ? c.digests.storyboard : null, score: node.kind === "scene_group" || node.kind === "render_fragment" || node.kind === "composite" || node.kind === "mix" || node.kind === "finish" ? (score ? scoreRevision(score) : null) : null });
}
