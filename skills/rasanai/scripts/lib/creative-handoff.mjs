// Creative handoff (contract D, W07): what a worker is given of the approved creative intent, and how its output is traced back to it.
// Pure helpers. Import-safe: no CLI dispatch, network, render, spawn or write at load. fs is only read when a function is called.
// Delivery is not understanding: this module records what was SENT and what a tool log OBSERVED, apart from what the worker SAYS.
// It never fabricates image analysis: a comparison with no observation is `not_assessable`, and a mapping with no rendered observation is a trace, not a visual pass.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { canonicalDigest } from "./contracts.mjs";

const arr = (x) => (Array.isArray(x) ? x : []);
const str = (x) => (x == null ? "" : String(x));
const readJSON = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
const STAGES = ["brief", "story", "look", "storyboard"];
const norm = (v) => String(v).replace(/^0+(?=\d)/, "");

// full content hash, streamed (no head/tail sampling): creative artifact identity is the whole file
export function sha256File(p) {
  try {
    const h = crypto.createHash("sha256"), fd = fs.openSync(p, "r"), buf = Buffer.alloc(1 << 20);
    try { for (let n; (n = fs.readSync(fd, buf, 0, buf.length, null)) > 0;) h.update(buf.subarray(0, n)); } finally { fs.closeSync(fd); }
    return h.digest("hex");
  } catch { return null; }
}

// a path shown to a worker: relative to the run, else a label; never an absolute private path
const shown = (run, p, label) => {
  if (!p) return null;
  const r = path.relative(run, path.resolve(run, p));
  return r && !r.startsWith("..") && !path.isAbsolute(r) ? r.split(path.sep).join("/") : `external:${label || path.basename(String(p))}`;
};

export const shotId = (s) => (s && (s.id ?? s.shot ?? s.n)) != null ? str(s.id ?? s.shot ?? s.n) : null;
const shotBeats = (s) => [s && s.beat, s && s.beat_id, s && s.scene, ...arr(s && s.beat_ids)].filter((v) => v != null).map(str);

// ---- ownership: which shots and beats does this task own? ----------------------------------
// Resolves a task key against the current plan assignments and the storyboard: an id, a list ("s1,s2"), a range ("s2-s4", "2..4", by storyboard order),
// or a named group the plan carries (plan.assignments | shot_groups | groups | tasks, as {key:[ids]}, {key:{shots,beats}} or [{key,shots,beats}]).
// Returns {whole, resolved, shotIds, beatIds, basis}. Unresolvable => resolved:false (the caller reports a named blocker, it does not widen the task).
export function resolveOwnership({ key, plan = {}, shots = [], beats = [] }) {
  const list = arr(shots), ids = list.map(shotId);
  const bids = (s) => shotBeats(s);
  if (key == null || key === "" || /^(film|all|whole|1-N)$/i.test(String(key))) return { whole: true, resolved: true, shotIds: ids.filter(Boolean), beatIds: [], basis: "whole-film task" };
  const k = String(key);
  const pick = (idSet) => {
    const sel = list.filter((s) => idSet.has(norm(shotId(s))) || bids(s).some((b) => idSet.has(norm(b))));
    const beatIds = [...new Set([...sel.flatMap(bids), ...[...idSet].filter((i) => arr(beats).some((b) => [b.id, b.n, b.beat].some((v) => v != null && norm(v) === i)))])];
    return { shotIds: sel.map(shotId).filter(Boolean), beatIds };
  };
  // 1. a named group in the plan
  for (const f of [plan.assignments, plan.shot_groups, plan.groups, plan.tasks]) {
    if (!f) continue;
    const entry = Array.isArray(f) ? f.find((g) => g && [g.key, g.id, g.name].some((v) => v != null && str(v) === k)) : f[k];
    if (entry == null) continue;
    const g = Array.isArray(entry) ? { shots: entry } : entry;
    const set = new Set([...arr(g.shots), ...arr(g.shot_ids), ...arr(g.beats), ...arr(g.beat_ids)].map((v) => norm(v)));
    const r = pick(set);
    if (r.shotIds.length || r.beatIds.length) return { whole: false, resolved: true, ...r, basis: "plan assignment" };
  }
  // 2. ids, lists and ranges over the storyboard order
  const set = new Set();
  for (const tok of k.split(/[,\s]+/).filter(Boolean)) {
    const m = tok.match(/^(.+?)(?:\.\.|:|-{1,2}(?=[A-Za-z]*\d))(.+)$/);
    const a = m ? ids.findIndex((i) => i != null && norm(i) === norm(m[1])) : -1, b = m ? ids.findIndex((i) => i != null && norm(i) === norm(m[2])) : -1;
    if (m && a >= 0 && b >= 0) for (let i = Math.min(a, b); i <= Math.max(a, b); i++) set.add(norm(ids[i]));
    else set.add(norm(tok));
  }
  const r = pick(set);
  if (r.shotIds.length || r.beatIds.length) return { whole: false, resolved: true, ...r, basis: "id or range" };
  return { whole: false, resolved: false, shotIds: [], beatIds: [], basis: `key ${k} matches no plan assignment, shot or beat` };
}

// ---- inputs the worker must be given -------------------------------------------------------
const BOARD_KEYS = ["board", "board_png", "board_ref", "still", "frame", "styleframe", "png"];
function boardOf(run, s) {
  const id = shotId(s);
  const cands = [...BOARD_KEYS.map((k) => s && s[k]).filter((v) => typeof v === "string"), ...(id ? [`frames/${id}.png`, `frames/${id}.jpg`] : [])];
  for (const c of cands) { const abs = path.resolve(run, c); if (fs.existsSync(abs)) return { path: c, abs }; }
  return cands[0] ? { path: cands[0], abs: null } : null;
}
const eventShots = (ev, shots, owned) => shots.filter((s) => {
  const id = shotId(s);
  return (arr(ev.shot_ids).map(str).includes(id) || shotBeats(s).some((b) => arr(ev.beat_ids).map(str).includes(b))) && (!owned || owned.has(id));
});

// -> {mandatorySections:[{id,content}], inputRefs, requiredVisualInputs, blockers, creative:bool}
// Optional extras on the one argument object: `profile` ({vision:false} marks the harness without image reads), `visionRole` (a configured vision-capable role to route judging to).
export function buildCreativeInputs({ run, role, key = null, plan = {}, creativeBrief, selection = null, shots = [], approvalPins = null, profile = null, visionRole = null }) {
  const out = { mandatorySections: [], inputRefs: [], requiredVisualInputs: [], blockers: [], creative: false };
  const b = creativeBrief;
  if (!b || typeof b !== "object" || !(b.creative_policy_revision >= 1)) return out; // not a creative-policy run: nothing is added
  out.creative = true;
  const list = arr(Array.isArray(shots) ? shots : shots && shots.shots);
  // only the roles whose key names shots or beats are shot-scoped; every other role's key (film, lead, score, seams, frames-1, film-1, Sure ...) is not an ownership key, so it gets the whole film's intent
  const own = resolveOwnership({ key: ["scene-animator", "frame-designer"].includes(role) ? key : null, plan, shots: list, beats: arr(plan.beats) });
  if (!own.resolved) out.blockers.push({ code: "ownership_unresolved", key: str(key), message: `cannot resolve which shots and beats task ${str(key)} owns (${own.basis}); the plan needs an assignment for it. No context was silently dropped or widened.` });
  const ownedShots = new Set(own.shotIds), ownedBeats = new Set(own.beatIds);
  const mine = (ev) => own.whole || arr(ev.shot_ids).some((i) => ownedShots.has(str(i))) || arr(ev.beat_ids).some((i) => ownedBeats.has(str(i)));
  const events = arr(b.signature_events), myEvents = events.filter(mine);

  const pins = {}; for (const s of STAGES) pins[s] = (approvalPins && approvalPins[s]) || (b.pins && b.pins[s]) || null;
  out.mandatorySections.push({ id: "creative-intent", content: { promise: b.promise ?? null, premise: b.premise ?? null, opening: b.opening ?? null, payoff: b.payoff ?? null, visual_strategy: b.visual_strategy ?? null, do_not_substitute: arr(b.do_not_substitute), repetition_intent: arr(b.repetition_intent), decision_authority: "the person's existing stage approvals; this record grants none" } });
  // event invariants are never shortened: before/change/after, proof refs, what must be preserved and the fallback travel whole
  out.mandatorySections.push({ id: "event-invariants", content: myEvents.map((e) => ({ id: e.id, beat_ids: arr(e.beat_ids), shot_ids: arr(e.shot_ids), before: e.before ?? null, change: e.change ?? null, after: e.after ?? null, proof_refs: arr(e.proof_refs), why_motion: e.why_motion ?? null, must_preserve: arr(e.must_preserve), fallback: e.fallback ?? null })) });
  out.mandatorySections.push({ id: "approval-pins", content: pins });
  out.mandatorySections.push({ id: "assigned-shots", content: { whole_film: own.whole, shot_ids: own.shotIds, beat_ids: own.beatIds, basis: own.basis } });

  // references: one or two useful ones for a shot worker, not the whole selection
  const sel = selection && arr(selection.selected).slice(0, own.whole ? 4 : 2);
  if (sel && sel.length) out.mandatorySections.push({ id: "reference-principles", content: sel.map((r) => ({ id: r.id, transferable: r.transferable ?? null, not_transferable: r.notTransferable ?? null, reasons: arr(r.reasons).slice(0, 3) })), optional_detail: true });

  // visual targets: the approved board of each owned shot, then reference media of the chosen references
  const noVision = profile && profile.vision === false;
  const avail = (abs) => (!abs ? "missing" : noVision ? (visionRole ? `route_to:${visionRole}` : "unavailable_no_vision_harness") : "available");
  const seen = new Set();
  for (const s of list.filter((s) => own.whole || ownedShots.has(shotId(s)))) {
    const bd = boardOf(run, s); if (!bd) continue;
    const ev = myEvents.find((e) => eventShots(e, [s]).length);
    const sha = bd.abs ? sha256File(bd.abs) : null;
    if (seen.has(bd.path)) continue; seen.add(bd.path);
    out.requiredVisualInputs.push({ path: shown(run, bd.path), sha256: sha, purpose: "approved board: the target this shot's render is compared with", target_shot: shotId(s), target_event: ev ? ev.id : null, availability: avail(bd.abs) });
  }
  for (const r of sel || []) for (const m of arr(r.mediaRefs)) {
    const p = typeof m === "string" ? m : m && m.path; if (!p) continue;
    const abs = path.resolve(run, p), exists = fs.existsSync(abs);
    out.requiredVisualInputs.push({ path: shown(run, p, r.id), sha256: (m && m.sha256) || (exists ? sha256File(abs) : null), purpose: `reference ${r.id}: reference-only, learn the principle, do not copy`, target_shot: own.shotIds[0] || null, target_event: myEvents[0] ? myEvents[0].id : null, availability: avail(exists) });
  }
  out.inputRefs = out.requiredVisualInputs.map((v) => ({ path: v.path, sha256: v.sha256, availability: v.availability }));
  if (out.requiredVisualInputs.some((v) => v.availability === "unavailable_no_vision_harness")) out.blockers.push({ code: "vision_unavailable", message: "this harness cannot read images and no vision-capable role is configured: visual judging is unavailable, not passed. No silent model or account upgrade." });
  return out;
}

// what was sent, apart from tool reads and the worker's own claim; delivery is never labelled understanding
export function deliveryRecord({ sections = [], requiredVisualInputs = [], observedReads = [], selfReport = null }) {
  return {
    sent: { sections: sections.map((s) => ({ id: s.id, digest: canonicalDigest(s.content) })), visual_inputs: requiredVisualInputs.map((v) => ({ path: v.path, sha256: v.sha256, availability: v.availability })) },
    observed_tool_reads: arr(observedReads),
    worker_self_report: selfReport,
    note: "sent = what the packet carried; observed_tool_reads = what the harness log shows was opened; neither proves the worker understood an image",
  };
}

// ---- validate a worker's result against the packet ---------------------------------------
const MAP_FIELDS = ["event_id", "beat_id", "shot_ids", "board_refs", "source_files", "sample_times_s", "produced_artifact_refs", "input_digest", "declared_deviations"];
// result: {status, creative?:{mappings:[...], implemented_events?:[ids], missing_events?:[ids], deviated_events?:[ids]}, input_digest, pins?, usage}
// evidence: {run?, renderObservations?:[{event_id|shot_id, image_ref}], files?: {path: bool}}. No rendered evidence => visual 'not_assessable', never a pass.
export function validateCreativeHandoff({ packetReceipt, result, expectedPins = null, expectedEvents = [], evidence = {} }) {
  const errors = [], warnings = [], findings = [];
  const E = (code, message, extra = {}) => errors.push({ code, message, ...extra });
  const r = result && typeof result === "object" ? result : null;
  if (!r) return { ok: false, errors: [{ code: "no_result", message: "no result object" }], warnings, findings, visual: "not_assessable" };
  const cr = r.creative && typeof r.creative === "object" ? r.creative : {};
  const maps = arr(cr.mappings);
  const exists = (p) => (evidence.files && p in evidence.files ? !!evidence.files[p] : evidence.run ? fs.existsSync(path.resolve(evidence.run, str(p))) : null);

  if (packetReceipt && r.input_digest && packetReceipt.input_digest && !String(packetReceipt.input_digest).startsWith(String(r.input_digest).slice(0, 12))) E("stale_input", "result input_digest does not match the packet: the worker may have read stale inputs");
  const pins = (r.pins || cr.pins) || null;
  if (expectedPins) for (const s of STAGES) {
    const want = expectedPins[s]; if (!want) continue;
    const wd = want.artifact_digest || want, got = pins && pins[s] && (pins[s].artifact_digest || pins[s]);
    if (!got) warnings.push({ code: "pin_not_echoed", message: `result does not echo the ${s} pin`, stage: s });
    else if (String(got) !== String(wd)) E("stale_pin", `${s} pin differs from the current approval: the work is on an outdated artifact`, { stage: s });
  }
  const byEvent = new Map();
  for (const m of maps) {
    if (!m || typeof m !== "object") { E("bad_mapping", "a mapping is not an object"); continue; }
    for (const f of MAP_FIELDS) if (!(f in m)) E("mapping_field", `mapping ${m.event_id || "?"} lacks ${f}`, { event_id: m.event_id || null });
    if (m.event_id) byEvent.set(m.event_id, m);
    if (m.input_digest && packetReceipt && packetReceipt.input_digest && !String(packetReceipt.input_digest).startsWith(String(m.input_digest).slice(0, 12)) && m.input_digest !== packetReceipt.packet_digest) E("stale_mapping", `mapping ${m.event_id} was produced against a different input digest`, { event_id: m.event_id });
    for (const t of arr(m.sample_times_s)) if (typeof t !== "number" || !Number.isFinite(t) || t < 0) E("bad_sample_time", `mapping ${m.event_id}: sample time ${t} is not a non-negative number of seconds on the score timebase`, { event_id: m.event_id });
    for (const p of [...arr(m.source_files), ...arr(m.produced_artifact_refs)]) if (exists(p) === false) E("missing_artifact", `mapping ${m.event_id} references ${p}, which does not exist`, { event_id: m.event_id, path: p });
  }
  const claimed = new Set([...arr(cr.implemented_events), ...maps.map((m) => m && m.event_id)].filter(Boolean));
  for (const id of arr(cr.implemented_events)) if (!byEvent.has(id)) E("unmapped_event", `event ${id} is claimed implemented with no mapping`, { event_id: id });
  const obs = arr(evidence.renderObservations).filter((o) => o && o.image_ref);
  const missing = new Set(arr(cr.missing_events)), deviated = new Set(arr(cr.deviated_events));
  for (const ev of arr(expectedEvents)) {
    const id = typeof ev === "string" ? ev : ev && ev.id; if (!id) continue;
    const m = byEvent.get(id), seen = obs.some((o) => o.event_id === id || (m && arr(m.shot_ids).includes(o.shot_id)));
    if (!claimed.has(id) && !missing.has(id)) { E("event_unaccounted", `signature event ${id} is neither mapped nor reported missing`, { event_id: id }); findings.push({ event_id: id, state: "unaccounted" }); continue; }
    if (missing.has(id) && !m) { findings.push({ event_id: id, state: "reported_missing" }); continue; }
    const devs = [...arr(m && m.declared_deviations), ...(deviated.has(id) ? ["reported deviated"] : [])];
    findings.push({ event_id: id, state: seen ? "trace_and_render_observed" : "trace_only", visual: seen ? "observed_needs_review" : "not_assessable", deviations: devs, note: seen ? "a render observation exists: a reviewer still judges it" : "mapping proves traceability, not visual completion" });
  }
  if (!r.usage) warnings.push({ code: "usage_missing", message: "no actual usage reported" });
  if (r.status === "ok" && missing.size) warnings.push({ code: "ok_with_missing", message: `status ok but events reported missing: ${[...missing].join(", ")}` });
  return { ok: !errors.length, errors, warnings, findings, visual: obs.length ? "observed_needs_review" : "not_assessable" };
}

// ---- compare observed layouts with targets -------------------------------------------------
// targets: [{id, shot_id, event_id, time_s, expect:{element_ids, focal_region, scale, arrangement, text_density, topology, layout_family}}]
// observed: [{target_id|shot_id, time_s, image_ref, element_ids, layout:{...same keys}}], supplied by existing render/frame tooling. lookProfile: {fps, handles_s, repetition_intent:[[shotIds]]}.
const LAYOUT_ENUMS = ["focal_region", "arrangement", "topology", "layout_family"];
const DENSITY = ["none", "low", "medium", "high"];
export function compareCreativeTargets({ targets = [], observed = [], lookProfile = {} }) {
  const findings = [];
  const frame = lookProfile.fps > 0 ? 1 / lookProfile.fps : 1 / 30;
  const tol = Math.max(frame, Number(lookProfile.handles_s) || 0);
  const obsFor = (t) => arr(observed).filter((o) => o && ((o.target_id && o.target_id === t.id) || (!o.target_id && o.shot_id != null && o.shot_id === t.shot_id)));
  for (const t of arr(targets)) {
    const os = obsFor(t).filter((o) => o.image_ref || o.layout || o.element_ids);
    if (!os.length) { findings.push({ target_id: t.id, shot_id: t.shot_id ?? null, status: "not_assessable", differences: [], note: "no observation of this target" }); continue; }
    if (!os.some((o) => o.image_ref)) { findings.push({ target_id: t.id, shot_id: t.shot_id ?? null, status: "not_assessable", differences: [], note: "layout data without an output image: nothing visual was observed" }); continue; }
    // timing: the observation nearest the target time on the score timebase
    let o = os[0];
    if (typeof t.time_s === "number") { o = os.slice().sort((a, b) => Math.abs((a.time_s ?? 1e9) - t.time_s) - Math.abs((b.time_s ?? 1e9) - t.time_s))[0]; }
    const diffs = [];
    if (typeof t.time_s === "number" && typeof o.time_s === "number" && Math.abs(o.time_s - t.time_s) > tol) diffs.push({ field: "time_s", expected: t.time_s, observed: o.time_s, note: `outside one frame or the transition handle (${tol.toFixed(3)}s)` });
    const ex = t.expect || {}, ol = o.layout || {};
    const wantIds = arr(ex.element_ids), haveIds = new Set(arr(o.element_ids).map(str));
    const lostIds = wantIds.filter((i) => !haveIds.has(str(i)));
    if (lostIds.length) diffs.push({ field: "element_ids", expected: wantIds, observed: [...haveIds], note: `absent: ${lostIds.join(", ")}` });
    for (const f of LAYOUT_ENUMS) if (ex[f] != null && ol[f] != null && str(ex[f]) !== str(ol[f])) diffs.push({ field: f, expected: ex[f], observed: ol[f] });
    if (typeof ex.scale === "number" && typeof ol.scale === "number" && ex.scale > 0 && Math.abs(ol.scale / ex.scale - 1) > 0.25) diffs.push({ field: "scale", expected: ex.scale, observed: ol.scale, note: "more than 25% apart" });
    if (ex.text_density != null && ol.text_density != null && Math.abs(DENSITY.indexOf(ol.text_density) - DENSITY.indexOf(ex.text_density)) > 1 && DENSITY.includes(ol.text_density) && DENSITY.includes(ex.text_density)) diffs.push({ field: "text_density", expected: ex.text_density, observed: ol.text_density });
    const unchecked = [...Object.keys(ex).filter((k) => k !== "element_ids" && (ol[k] == null))];
    findings.push({ target_id: t.id, shot_id: t.shot_id ?? null, status: diffs.length ? "differs" : "match", differences: diffs, unchecked, image_ref: o.image_ref, note: diffs.length ? "a reviewer decides whether the difference is a defect" : "the observed layout data agrees with the target; this is not a taste judgment" });
  }
  findings.push(...repetitionSignal({ observed, lookProfile }));
  return { findings };
}

// layout-family signal: the same rendered arrangement under different names. A flag for a reviewer, never a verdict.
const bucket = (v, edges) => (typeof v === "number" ? edges.filter((e) => v >= e).length : null);
export const layoutSignature = (o) => {
  const l = (o && o.layout) || {};
  return canonicalDigest([l.focal_region ?? null, bucket(l.scale, [0.15, 0.4, 0.7]), l.arrangement ?? null, l.text_density ?? null, l.topology ?? null]);
};
export function repetitionSignal({ observed = [], lookProfile = {} }) {
  const rows = arr(observed).filter((o) => o && o.layout && o.shot_id != null).sort((a, b) => (a.time_s ?? 0) - (b.time_s ?? 0));
  const declared = arr(lookProfile.repetition_intent).map((g) => new Set(arr(g).map(str)));
  const groups = new Map();
  for (const o of rows) { const s = layoutSignature(o); groups.set(s, [...(groups.get(s) || []), str(o.shot_id)]); }
  const out = [];
  for (const [, ids] of groups) {
    const uniq = [...new Set(ids)];
    if (uniq.length < 3 && !(rows.length >= 4 && uniq.length >= 2 && uniq.length / rows.length >= 0.5)) continue;
    const dec = declared.some((d) => uniq.every((i) => d.has(i)));
    out.push({ kind: "repetition_signal", shot_ids: uniq, declared: dec, requires_reviewer: true, advisory: true, note: dec ? "matches an approved repetition intent; the reviewer confirms it still reads as deliberate" : "same focal region, scale, arrangement, density and topology across these shots (names ignored): a reviewer decides if this is a template or a deliberate comparison or continuous scene" });
  }
  return out;
}

// ---- compact review packet: the critic sees the comparison, not the builder's prose ----------
export function buildReviewPacket({ creativeBrief, shots = [], mappings = [], comparison = null, requiredVisualInputs = [], proofObligations = [] }) {
  const list = arr(Array.isArray(shots) ? shots : shots && shots.shots);
  const maps = new Map(arr(mappings).filter(Boolean).map((m) => [m.event_id, m]));
  const cmp = comparison && arr(comparison.findings);
  return {
    events: arr(creativeBrief && creativeBrief.signature_events).map((e) => {
      const m = maps.get(e.id) || null, ids = arr(m ? m.shot_ids : e.shot_ids).map(str);
      return {
        event_id: e.id, before: e.before ?? null, change: e.change ?? null, after: e.after ?? null, must_preserve: arr(e.must_preserve),
        approved_board: requiredVisualInputs.filter((v) => v.target_event === e.id || ids.includes(str(v.target_shot))).map((v) => ({ path: v.path, sha256: v.sha256 })),
        draft_samples: m ? arr(m.produced_artifact_refs).map((p, i) => ({ path: p, time_s: arr(m.sample_times_s)[i] ?? null })) : [],
        shots: list.filter((s) => ids.includes(shotId(s))).map(shotId),
        proof_obligations: arr(proofObligations).filter((p) => arr(e.proof_refs).includes(p.id)),
        declared_deviations: arr(m && m.declared_deviations),
        comparison: cmp ? cmp.filter((f) => f.status && ids.includes(str(f.shot_id))) : [],
        traced: !!m,
      };
    }),
    repetition: cmp ? cmp.filter((f) => f.kind === "repetition_signal") : [],
    note: "trace and comparison data only: not a visual pass; a reviewer judges the images",
  };
}
