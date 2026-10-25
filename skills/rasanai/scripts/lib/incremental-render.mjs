// Changed-region rendering, honestly (Plan 09 P6). Pure planning: nothing here renders, probes HyperFrames or runs ffmpeg. lib/hybrid-render (restored from phase2/hybrid-film-studio)
// executes the plan this module produces, and every fallback it chooses is written into the result so a slower path is never disguised.
//
// The capability boundary, in order of preference (the first that is SAFE and SUPPORTED wins; each skipped step is recorded with its reason):
//   1. verified_fragment   an existing, verified frame-range / fragment render. NONE is known in this tree: the earlier probe (lib/hybrid-render/PROBE.md, hyperframes 0.8.193,
//                          2026-10-24) found no time-range flag. This step is enabled only by <film>/hybrid/render-capabilities.json recording a verified range render for the
//                          INSTALLED version (Plan 14 writes that after measuring). It is not probed here.
//   2. scene_host          one scene as its own standalone host project (a sub-composition on a scene-local clock). Safe for a scene with hard cuts on both sides and no
//                          global-time signal, no unchecked state and no unknown dynamic dependency.
//   3. group_host          the changed scene PLUS the neighbours across every overlapping transition, in one host that keeps their relative times (transition overlaps need both).
//   4. continuity_group    every scene of the continuity group (lib/graph.mjs partitionScenes: persistent characters/objects/cameras, travelling seams), over the contiguous span.
//   5. full_film           everything. Required when correctness needs it: an inline scene, unknown dynamic dependencies, a global-time signal off the film start, state-dependent
//                          effects with no checkpoint beyond the group, a composited scene inside a multi-scene host, or a film-wide input changed.
//
// Assembly: clips are joined at ONE time base (the film's rational fps) only when every clip has the same codec, pixel format, size, frame rate and colour space, and the frame count
// is verified; independently encoded MP4s with different headers are never concatenated blindly (assemblyCheck refuses). Audio is a separate continuous timeline (reused when the edit is
// visual only). The film-wide finish (grade, grain, shutter blur) is applied ONCE over the assembled picture; per-fragment finishing is refused.
import fs from "node:fs";
import path from "node:path";
import { boundaryTime } from "./render-keys.mjs";

export const RENDER_PATHS = Object.freeze(["verified_fragment", "scene_host", "group_host", "continuity_group", "full_film"]);
const SEVERITY = Object.fromEntries(RENDER_PATHS.map((p, i) => [p, i]));
const arr = (x) => (Array.isArray(x) ? x : []);
const sid = (sc, i) => (sc && sc.id != null ? String(sc.id) : sc && sc.n != null ? `s${sc.n}` : `s${i + 1}`);
const STATEFUL = /\b(sim(ulation)?|physics|particle|feedback|trail|accumulat|persist|cloth|fluid|verlet|spring[-_ ]?chain|rigid[-_ ]?body)\w*/i;

// the capability boundary: what each preference step can honestly do here. Reads documentation/records only.
export function capabilityBoundary({ film = null, hyperframes_version = "unknown" } = {}) {
  const recFile = film ? path.join(film, "hybrid", "render-capabilities.json") : null;
  let rec = null; try { rec = recFile && fs.existsSync(recFile) ? JSON.parse(fs.readFileSync(recFile, "utf8")) : null; } catch { rec = null; }
  const verifiedRange = !!(rec && rec.fragment_range && rec.fragment_range.verified === true && String(rec.fragment_range.hyperframes_version) === String(hyperframes_version));
  return {
    schema_version: 1,
    hyperframes_version,
    verified_fragment: verifiedRange
      ? { supported: true, verified: true, source: "hybrid/render-capabilities.json", note: "a verified range render is recorded for this exact HyperFrames version" }
      : { supported: false, verified: false, why: rec && rec.fragment_range ? `a range render was recorded for hyperframes ${rec.fragment_range.hyperframes_version}, not the installed ${hyperframes_version}` : "no verified frame-range / fragment render is recorded; the earlier probe (lib/hybrid-render/PROBE.md, 0.8.193) found no time-range flag. Not re-probed: Plan 14 verifies and records it" },
    scene_host: { supported: true, verified: false, basis: "an earlier phase's recorded probe (PROBE.md); unverified in this tree until Plan 14", limits: ["scene-local clock only", "a scene must be a sub-composition (data-composition-src)", "no audio per scene", "a transition that samples the next scene is not handled by a single-scene host"] },
    group_host: { supported: true, verified: false, basis: "the same host with several adjacent scene hosts kept at their relative times (lib/hybrid-render/host.mjs buildGroupHost)", limits: ["a contiguous span", "composited (comp) scenes are not supported inside it"] },
    continuity_group: { supported: true, verified: false, basis: "group_host over the whole continuity group's span" },
    full_film: { supported: true, verified: true, basis: "the ordinary full render" },
  };
}

export const shutterHandleFrames = (shutter) => { const a = shutter && Number(shutter.angle ?? shutter.shutter_angle ?? (Number(shutter.shutter) > 0 ? Number(shutter.shutter) * 360 : 0)); return a > 0 ? Math.max(1, Math.ceil(a / 360)) : 0; };

// Does a scene depend on state that arbitrary seeking cannot reproduce? (a function accepting `t` is not proof that seeking is safe)
export function stateDependent(sceneDef, depsScene, checkpoint = false) {
  const text = JSON.stringify(sceneDef || {});
  const reasons = [];
  if (STATEFUL.test(text)) reasons.push("the score names a stateful effect (simulation, particles, feedback, trail, physics)");
  if (depsScene && depsScene.nondeterministic && depsScene.nondeterministic.length) reasons.push(`unseeded randomness or wall-clock in the code (${depsScene.nondeterministic.slice(0, 2).join("; ")})`);
  return { state_dependent: reasons.length > 0, checkpointed: !!checkpoint, reasons };
}

// o: { changed:[scene ids to re-render], score, deps (render-keys sceneDeps), partition (graph.mjs partitionScenes), comp_scenes:Set, checkpoints:Set, caps (capabilityBoundary), film_wide:[reasons] }
// -> { units:[{ kind, path, scenes:[ids, contiguous span], reasons, handles, fallbacks }], film_wide, notes }
export function planIncremental(o = {}) {
  const S = arr(o.score && o.score.scenes), ids = S.map(sid), idx = new Map(ids.map((id, i) => [id, i]));
  const caps = o.caps || capabilityBoundary({});
  const changed = [...new Set(arr(o.changed).filter((c) => idx.has(c)))].sort((a, b) => idx.get(a) - idx.get(b));
  const comp = o.comp_scenes instanceof Set ? o.comp_scenes : new Set(arr(o.comp_scenes));
  const groupOf = new Map(); for (const g of arr(o.partition && o.partition.groups)) for (const s of g.scenes) groupOf.set(s, g);
  const shutterFrames = shutterHandleFrames(o.score && (o.score.shutter || (o.score.finish && o.score.finish.shutter)));
  const fullFilm = (why) => ({ units: [{ kind: "film", path: "full_film", scenes: ids.slice(), reasons: why, handles: [], fallbacks: [] }], film_wide: true, notes: [] });
  if (arr(o.film_wide).length) return fullFilm(arr(o.film_wide).map((r) => `film-wide input changed: ${r}`));
  if (!changed.length) return { units: [], film_wide: false, notes: ["nothing to re-render"] };
  if (!o.deps) return fullFilm(["scene code was not read: its dependencies are unknown, so only a full render is correct"]);

  const per = [];
  for (const id of changed) {
    const i = idx.get(id), d = o.deps.scenes[id], bt = boundaryTime(o.score, id), g = groupOf.get(id);
    const skipped = []; // the preference steps passed over, and why
    let pathName = caps.verified_fragment.supported ? "verified_fragment" : "scene_host";
    let widen = [id], reasons = [], handles = [];
    if (!caps.verified_fragment.supported) skipped.push({ step: "verified_fragment", why: caps.verified_fragment.why });
    const need = (p, why) => { if (SEVERITY[p] > SEVERITY[pathName]) { skipped.push({ step: pathName, why }); pathName = p; } reasons.push(why); };
    if (!d || !d.entry) need("full_film", d ? "inline scene in index.html: it has no host of its own" : "no dependency record for this scene");
    else {
      if (d.conservative && d.dynamic.some((x) => /dynamic|remote|missing|outside|scan bound/.test(x))) need("full_film", `unknown dynamic dependencies (${d.dynamic.slice(0, 2).join("; ")}): isolation cannot be trusted`);
      const st = stateDependent(S[i], d, o.checkpoints && o.checkpoints.has(id));
      if (st.state_dependent && !st.checkpointed) { const span = g && g.scenes.length > 1 ? "continuity_group" : "full_film"; need(span, `state-dependent effect with no reproducible checkpoint (${st.reasons[0]}): ${span === "continuity_group" ? "the whole group is re-rendered" : "only a full render is safe"}`); }
      if (d.global_time && (bt.start_s ?? 0) > 0) need("full_film", "the scene reads a global-time signal and starts after 0: a scene-local host would change its clock");
      if (bt.prev || bt.next) {
        for (const [side, nb] of [["incoming", bt.prev], ["outgoing", bt.next]]) {
          if (!nb) continue;
          widen.push(nb.id);
          handles.push({ scene: nb.id, side, kind: nb.kind, overlap_s: nb.overlap_s, why: `the ${nb.kind} transition overlaps ${nb.id}'s time: both sides are rendered together`, shutter_handle_frames: shutterFrames || 0 });
        }
        need("group_host", `a ${[bt.prev, bt.next].filter(Boolean).map((x) => x.kind).join(" and ")} transition overlaps a neighbour: the single-scene host cannot sample it`);
      } else if (shutterFrames) handles.push({ scene: id, side: "both", kind: "shutter", shutter_handle_frames: shutterFrames, why: `motion-blur shutter needs ${shutterFrames} frame(s) of handle each side of the cut; the film-wide finish supplies the blur once over the assembled picture` });
      if (g && g.scenes.length > 1 && (pathName === "scene_host" || pathName === "group_host" || pathName === "verified_fragment")) {
        const strong = g.reasons && g.reasons.length;
        if (strong) { widen = g.scenes.slice(); need("continuity_group", `scenes ${g.scenes.join(", ")} are one continuity group (${g.reasons[0]}): re-rendered together`); }
      }
      if (comp.has(id) && SEVERITY[pathName] > SEVERITY["scene_host"]) need("full_film", "a composited (comp) scene cannot sit inside a multi-scene host: only a full render is implemented");
    }
    per.push({ id, path: pathName, widen, reasons, handles, fallbacks: skipped });
  }
  // merge overlapping spans into units; one full_film unit absorbs everything
  if (per.some((p) => p.path === "full_film")) { const why = per.filter((p) => p.path === "full_film").flatMap((p) => p.reasons); const u = fullFilm(why); u.units[0].fallbacks = per.flatMap((p) => p.fallbacks); return u; }
  const spans = per.map((p) => { const ix = p.widen.map((s) => idx.get(s)); return { lo: Math.min(...ix), hi: Math.max(...ix), ...p }; }).sort((a, b) => a.lo - b.lo);
  const units = [];
  for (const sp of spans) {
    const last = units[units.length - 1];
    if (last && sp.lo <= last.hi + 0) { last.hi = Math.max(last.hi, sp.hi); last.path = SEVERITY[sp.path] > SEVERITY[last.path] ? sp.path : last.path; last.reasons.push(...sp.reasons); last.handles.push(...sp.handles); last.fallbacks.push(...sp.fallbacks); last.changed.push(sp.id); }
    else units.push({ lo: sp.lo, hi: sp.hi, path: sp.path, reasons: sp.reasons.slice(), handles: sp.handles.slice(), fallbacks: sp.fallbacks.slice(), changed: [sp.id] });
  }
  const out = units.map((u) => ({ kind: u.lo === u.hi && (u.path === "scene_host" || u.path === "verified_fragment") ? "scene" : "group", path: u.path, scenes: ids.slice(u.lo, u.hi + 1), changed: u.changed, reasons: [...new Set(u.reasons)], handles: u.handles, fallbacks: u.fallbacks }));
  return { units: out, film_wide: false, notes: [shutterFrames ? `motion-blur shutter handle: ${shutterFrames} frame(s)` : null].filter(Boolean) };
}

// join check: refuses a stream-copy concat across incompatible clips. probes: [{ file, codec, pix_fmt, width, height, fps (string a/b), color_space, frames, alpha? }]
export function assemblyCheck(probes, { fps = null, total_frames = null, expect_alpha = "none" } = {}) {
  const problems = [];
  if (!probes.length) return { ok: false, problems: ["no clips"] };
  const sig = (p) => [p.codec, p.pix_fmt, `${p.width}x${p.height}`, p.fps, p.color_space || "unknown"].join("/");
  const first = sig(probes[0]);
  for (const p of probes) if (sig(p) !== first) problems.push(`clip ${path.basename(p.file || "?")} is ${sig(p)}, the first is ${first}: independently encoded clips with different headers, time bases or colour are not concatenated blindly (re-encode to one intermediate spec is the only safe join, and is not implemented: render the span again at the film's settings)`);
  if (fps) { const want = `${fps.num}/${fps.den}`; for (const p of probes) if (p.fps && p.fps !== want && Math.abs(eval01(p.fps) - fps.num / fps.den) > 1e-6) problems.push(`clip ${path.basename(p.file || "?")} runs at ${p.fps}, the film's time base is ${want}`); }
  if (total_frames !== null) { const n = probes.reduce((a, p) => a + (p.frames || 0), 0); if (n !== total_frames) problems.push(`clips total ${n} frames, the timeline needs ${total_frames}`); }
  if (expect_alpha === "premultiplied" || expect_alpha === "straight") for (const p of probes) if (!/a/.test(p.pix_fmt || "")) problems.push(`clip ${path.basename(p.file || "?")} has no alpha (${p.pix_fmt}) but the intermediate convention is ${expect_alpha}`);
  return { ok: !problems.length, problems, convention: { alpha: expect_alpha, premultiplied_required_for_comp: true } };
}
const eval01 = (s) => { const m = String(s).match(/^(\d+)\/(\d+)$/); return m ? Number(m[1]) / Number(m[2]) : Number(s); };

// audio is one continuous timeline. A VISUAL-ONLY edit (no node of kind sound-mix changed, no scene start or duration moved) reuses the existing mix untouched.
// o: { changed_node_kinds:[...], timing_changed:boolean, receipt, current_inputs, reuseDecision (lib/mix-receipt.mjs reuseDecision) }
export function audioPlan(o = {}) {
  const kinds = new Set(arr(o.changed_node_kinds));
  const soundChanged = kinds.has("sound-mix") || kinds.has("voice") || kinds.has("music") || kinds.has("mix");
  const visualOnly = o.timing_changed === false && !soundChanged; // unknown (null/undefined) is NOT visual-only
  // the authority for reuse is the mix receipt's input digests (score revision, cues, direction, contract, stems), never a file name or the kind of edit
  const reuse = o.receipt && typeof o.reuseDecision === "function" ? o.reuseDecision({ receipt: o.receipt, current: o.current_inputs }) : null;
  const reuseMix = !!(reuse && reuse.reuse === true);
  return { visual_only: visualOnly, timing_changed: o.timing_changed ?? null, reuse_existing_mix: reuseMix, reuse_detail: reuse, remix: reuseMix ? [] : ["music edit points", "voice/sfx cue times", "ducking envelopes", "mix receipt"], note: reuseMix ? "the mix receipt still matches its inputs: the audio timeline stays continuous and is reused, not remixed" : reuse ? `the mix is not reused: ${reuse.reason}` : "no mix receipt to compare with: the mix cannot be shown to match, so it is rebuilt from its inputs (only the cues that depend on the change are remapped)" };
}

// the film-wide finish is applied once. Fragments are PRE-finish intermediates; a fragment whose node already carries a grade/blur would be finished twice.
export function finishPlan({ nodes = [], finish_cfg = null } = {}) {
  const doubled = nodes.filter((n) => n && n.kind === "scene-render" && n.finish_applied);
  return { applied_once: true, over: "the assembled pre-finish picture", cached_intermediates: "pre-finish scene fragments (hybrid/cache)", per_fragment_finish: "refused", double_apply_risk: doubled.map((n) => n.id), shutter_blur_needs: "finish.mjs renders the project itself in phase-shifted passes: a shutter-blur delivery is a full-film pass regardless of how the preview was assembled", cfg: finish_cfg };
}

// what was reused vs rebuilt, from the REAL results (never from intent). results: [{ id, action: "reused"|"rendered"|"composited"|"failed", path?, render_ms? }]
export function reusedVsRebuilt(results = [], causes = []) {
  const by = (a) => results.filter((r) => r.action === a).map((r) => r.id);
  return { reused: by("reused"), rebuilt: [...by("rendered"), ...by("composited")], failed: by("failed"), invalidation_causes: causes, basis: "from the render results and the dependency keys, not from what was planned" };
}
