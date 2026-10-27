// Purpose-aware SFX direction (Addendum 2, section 5). Pure: no I/O, no clock, no renderer. Status: implemented_unvalidated.
//
// A cue says WHY a sound exists (purpose), which layers carry it (movement / accent / texture / tail / ui, one job each), when each layer sits against the
// visible action (leads / confirms / trails), and what it asks of the music. Times are derived from the score through cues.mjs resolveCue; nothing here stores
// film time (layerTimes() computes it on demand from an event's score-derived picture onset).
//
//   effectsPolicy(choice, o)            Subtle / Expressive / Minimal-none -> {budget_scale, allow_prominent, ordinary_music_reduction:"none", ...}; the choice is binding
//   scaledBudget(budget, policy)        the SFX_BUDGET row (lib/audio.mjs, read-only, passed in) scaled by the policy
//   planCueLayers(cue, o)               one cue -> one perceptual event with 0..n layers (a small UI action = one quiet layer; some moments = none)
//   layerTimes(plan, picture_s, sync)   film-time starts of each layer for a given picture onset (derived, never stored)
//   eventDensity(cues, o)               editorial density: a multi-layer event counts ONCE
//   resourceLayers(cues, o)             technical resources: EVERY layer counts, plus peak overlap and summed level
//   coherentFamily(selection, o)        one library family per film; flags stitched packs, repeats, constant stereo movement
//   pickVariation(pool, used)           round-robin inside a family so identical samples do not repeat
//
// Consumers: S/sound.mjs sfx-plan (selection, placement, audio_meta_sfx) and `check` (counts) are ENG-INT-2's; the patch proposals are in
// references/sfx-layering.md. cues.mjs overlapReport is the cluster view of the same data.
import { LAYER_ROLES, CUE_INTENSITIES, leadOf, normalizeCue } from "./cues.mjs";
import { sfxFamilyOf } from "./catalog-evidence.mjs";

const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);
const T = (x) => (typeof x === "string" ? x.trim() : x == null ? "" : String(x).trim());
const num = (x, d = null) => (x !== null && x !== "" && x !== undefined && Number.isFinite(Number(x)) ? Number(x) : d);
const r3 = (x) => (x == null ? x : Math.round(x * 1000) / 1000);

export { LAYER_ROLES };
// layer role -> the catalog job (library/sfx/families.json jobs) and the useful_role a candidate must carry
export const LAYER_JOBS = Object.freeze({
  movement: { job: "movement", useful_role: "transition" },
  accent: { job: "accent_impact", useful_role: "accent" },
  texture: { job: "environmental_bed", useful_role: "ambience" },
  tail: { job: "development_transition", useful_role: "stinger" },
  ui: { job: "interface_action", useful_role: "ui" },
});
// relative level of a layer against the cue's own gain, and the shift per intensity (dB; units stay dB until a renderer boundary, mix-bus.mjs dbToLinear)
const ROLE_DB = { movement: -3, accent: 0, texture: -9, tail: -6, ui: -2 };
const INTENSITY_DB = { light: -4, medium: 0, prominent: 2 };
// default offsets (s) against the event: a movement leads the action, an accent confirms it, a texture/tail trails it
const ROLE_OFFSET = { movement: -0.12, accent: 0.01, texture: 0.04, tail: 0.08, ui: 0.01 };
const ROLE_BODY = { movement: 0.35, accent: 0.18, texture: 0.5, tail: 0.15, ui: 0.1 };
const ROLE_TAIL = { movement: 0.1, accent: 0.25, texture: 0.6, tail: 0.9, ui: 0.08 };
const DEFAULT_BUDGET = { perSec: 1 / 1.2, perWindow: 3, share: 1 / 2, heroEvery: 10, heroMax: 6, whooshEvery: 10 }; // = SFX_BUDGET.unnarrated; pass the real row in o.budget

// ---- effects choice -> policy ---------------------------------------------------------------------------------------------------------------
// choice: "subtle" | "expressive" | "minimal_none" | "unset", or a sound-choices resolved.effects block ({choice, roles:{sfx}}), or an SFX role.
// o: {floor: "signature_only"|"none" (effects_floor), role (override), silent}
export function effectsPolicy(choice, o = {}) {
  const blk = isObj(choice) ? choice : null;
  const c = T(blk ? blk.choice : choice);
  const role = T(o.role || (blk && blk.roles && blk.roles.sfx)) || null;
  const floor = o.floor === "none" ? "none" : "signature_only";
  const base = { ordinary_music_reduction: "none", prominent_music_reduction: "request_with_reason" }; // an ordinary click never asks the mix for a duck
  const mk = (r, p) => ({ choice: c || "unset", role: r, ...base, ...p });
  if (o.silent === true || role === "none" || (c === "minimal_none" && !role && floor === "none"))
    return mk("none", { budget_scale: 0, allow_prominent: false, signature_cap: 0, binding: true, note: "no effects: nothing but the music and voice chosen" });
  if (role === "signature_only" || (c === "minimal_none" && !role))
    return mk("signature_only", { budget_scale: 0, allow_prominent: false, signature_cap: "hero_max", binding: true, note: "only declared signature moves carry one sound; every other effect is off (the plan keeps them: see the sound.mjs patch)" });
  if (role === "sparse" || c === "subtle")
    return mk("sparse", { budget_scale: 0.5, allow_prominent: false, signature_cap: "hero_max", binding: true, note: "subtle is binding: about half the budget, light/medium variants only, even if the library holds dramatic impacts" });
  if (role === "causal" || c === "expressive")
    return mk("causal", { budget_scale: 1, allow_prominent: true, signature_cap: "hero_max", binding: true, note: "expressive: visible causes get a sound; selected prominent events may be big, still not every hit" });
  return mk(role, { budget_scale: 1, allow_prominent: true, signature_cap: "hero_max", binding: false, note: "no effects choice: the legacy density rules apply unchanged" });
}
// the SFX_BUDGET row scaled by a policy. Always floors at 1 where sounds are allowed at all; a zero policy yields zeroes
export function scaledBudget(budget, policy) {
  const b = isObj(budget) ? budget : DEFAULT_BUDGET, p = isObj(policy) ? policy : effectsPolicy("unset");
  const k = num(p.budget_scale, 1);
  if (k === 0 && p.role === "signature_only") return { ...b, perSec: 0, share: 0, heroMax: b.heroMax, signature_only: true };
  if (k === 0) return { ...b, perSec: 0, perWindow: 0, share: 0, heroMax: 0, heroEvery: Infinity, whooshEvery: Infinity };
  if (k === 1) return { ...b, heroMax: p.allow_prominent ? b.heroMax : 0 };
  return { ...b, perSec: b.perSec * k, perWindow: Math.max(1, Math.round(b.perWindow * k)), share: b.share * k, heroMax: p.allow_prominent ? Math.ceil(b.heroMax * k) : 0, heroEvery: b.heroEvery / k, whooshEvery: b.whooshEvery / k };
}

// ---- one cue -> one perceptual event with layers ------------------------------------------------------------------------------------------
const PROMINENT_ROLES = new Set(["impact", "stinger", "riser"]);
export function intensityOf(cue, policy) {
  let i = CUE_INTENSITIES.includes(cue.intensity) ? cue.intensity : PROMINENT_ROLES.has(cue.role) ? "prominent" : cue.role === "transition" ? "medium" : "light";
  const clamped = i === "prominent" && !(policy && policy.allow_prominent);
  if (clamped) i = "medium";
  return { intensity: i, clamped };
}
// cue: a normalizeCue record (or raw). o: {sound_resolved, family, intensity, event:{id, signature, speech}, catalog:[index rows | {[id]: row}], narrated}
export function planCueLayers(cueIn, o = {}) {
  const cue = cueIn && cueIn.role && cueIn.intended_offset_s !== undefined ? cueIn : normalizeCue(cueIn);
  const res = isObj(o.sound_resolved) ? o.sound_resolved : null;
  const policy = effectsPolicy(res ? res.effects : "unset", { silent: res && res.silent === true, role: res && res.sfx_role });
  const ev = isObj(o.event) ? o.event : {};
  const pid = cue.perceptual_event_id || `pe-${cue.event_id || cue.id}`;
  const notes = [];
  const out = (layers, extra = {}) => ({ perceptual_event_id: pid, cue: cue.id, event_id: cue.event_id, purpose: cue.purpose || null, family: o.family || cue.family || null, intensity: extra.intensity || null, layers, music_reduction: null, ordinary_music_reduction: "none", policy, notes, ...extra });
  if (policy.role === "none") { notes.push("effects policy: none, the cue is not played"); return out([], { dropped: "effects_none" }); }
  if (policy.role === "signature_only" && !(ev.signature || cue.purpose === "signature" || cue.signature)) { notes.push("Minimal: only declared signature moves carry a sound"); return out([], { dropped: "not_signature" }); }
  const { intensity, clamped } = intensityOf({ ...cue, intensity: o.intensity || cue.intensity }, policy);
  if (clamped) notes.push("prominent request lowered to medium: the effects choice does not allow prominent events");
  const cat = (ref) => (Array.isArray(o.catalog) ? o.catalog.find((r) => r.id === ref) : isObj(o.catalog) ? o.catalog[ref] : null) || null;
  const speech = cue.speech_word_s != null || ev.speech === true;
  const narr = o.narrated === true;
  const authored = cue.layers && cue.layers.length;
  // 1) authored layers win; 2) otherwise the minimum layer set the intensity and role justify, each with its own job
  let roles;
  if (authored) roles = cue.layers.map((l) => l.role);
  else if (cue.role === "ui" || (intensity === "light" && ["accent", "foley", "ui"].includes(cue.role))) roles = [cue.role === "ui" ? "ui" : "accent"];
  else if (cue.role === "transition") roles = intensity === "medium" ? ["movement"] : ["movement", "accent"];
  else if (cue.role === "riser") roles = ["movement", "texture"];
  else if (intensity === "prominent") roles = ["movement", "accent", "tail"]; // airy movement, restrained accent, decaying tail: three jobs
  else if (cue.role === "ambience") roles = ["texture"];
  else roles = ["accent"];
  const layers = roles.map((role, i) => {
    const a = authored ? cue.layers[i] : null;
    const off = a ? a.onset.offset_s : role === "accent" || role === "ui" ? cue.intended_offset_s : cue.intent === "anticipate" && role === "movement" ? Math.min(ROLE_OFFSET.movement, cue.intended_offset_s) : ROLE_OFFSET[role];
    const asset = (a && a.asset_ref) || (i === 0 ? cue.source.asset || cue.source.sample || cue.source.file : null) || null;
    const row = cat(asset);
    const tailFile = row && row.tail && num(row.tail.trailing_s);
    const gain = (a ? a.gain_db : ROLE_DB[role]) + (cue.gain.db || 0) + INTENSITY_DB[intensity] + (speech ? -3 : 0) + (narr ? -2 : 0);
    return {
      role, asset_ref: asset, ...(asset ? {} : { select: { ...LAYER_JOBS[role], intensity, family: o.family || cue.family || null } }), // no asset yet: the selector picks by job within the film's family
      gain_db: r3(gain),
      pan: a && a.pan != null ? a.pan : role === "movement" && cue.spatial.intent === "positional" ? cue.spatial.pan : role === "movement" ? 0 : cue.spatial.pan != null ? cue.spatial.pan : 0, // movement only travels when the cue says so: no constant stereo sweep
      tonal: a && a.tonal ? a.tonal : role === "accent" && intensity !== "light" ? { mode: "restrained", match_music: true } : { mode: "unpitched" },
      onset: { basis: "event", offset_s: r3(off), lead: leadOf(off) },
      body_s: a && a.body_s != null ? a.body_s : cue.duration_s != null && i === 0 ? cue.duration_s : ROLE_BODY[role],
      tail_s: a && a.tail_s != null ? a.tail_s : tailFile != null ? r3(tailFile) : ROLE_TAIL[role],
      keep_tail: true, // a tail is never trimmed to the next cue
    };
  });
  const prominent = intensity === "prominent";
  const mr = prominent && policy.allow_prominent ? { requested: true, depth_hint_db: cue.music_reduction && cue.music_reduction.depth_db != null ? cue.music_reduction.depth_db : -2, reason: (cue.music_reduction && cue.music_reduction.reason) || `prominent ${cue.role}${cue.purpose ? ` (${cue.purpose})` : ""}: the music steps back only enough for this event`, start_offset_s: -0.05, hold_s: r3(Math.max(...layers.map((l) => l.body_s || 0))), consumed_by: "mix-bus busPlan reductions[reason=prominent_event]" } : null;
  return out(layers, {
    intensity,
    voice: { relation: speech ? "under_speech: layer levels lowered, never a speech duck source" : "clear" },
    music: { ordinary_reduction: "none", prominent_reduction: mr ? "requested" : "none" },
    music_reduction: mr,
  });
}

// film-time starts of each layer (derived at call time from the score-derived picture onset, so nothing stored goes stale on a retime)
// sync: {[asset_ref]: the file's sync_point_s}: the layer's ACCENT lands at picture + offset, so the file starts earlier by its sync point
export function layerTimes(plan, picture_s, sync = {}) {
  return arr(plan && plan.layers).map((l) => {
    const peak = (l.asset_ref && num(sync[l.asset_ref])) || 0;
    const accent = picture_s + l.onset.offset_s;
    return { role: l.role, asset_ref: l.asset_ref, start_s: r3(Math.max(0, accent - peak)), accent_s: r3(accent), end_s: r3(Math.max(0, accent - peak) + (l.body_s || 0) + (l.tail_s || 0)), lead: l.onset.lead };
  });
}

// ---- density: one perceptual event vs the real layers --------------------------------------------------------------------------------------
const layersOf = (c) => (c.layers && c.layers.length ? c.layers : [{ role: c.role === "ui" ? "ui" : "accent", gain_db: c.gain ? c.gain.db : 0, onset: { offset_s: c.intended_offset_s || 0 }, body_s: c.duration_s, tail_s: null }]);
const pictureOf = (c) => (c.timing && c.timing.picture_onset_s != null ? c.timing.picture_onset_s : num(c.t, 0));
// cues: resolved cues (or plans with {perceptual_event_id, layers, t}). A group is ONE event only while it shares the event id AND its pictures sit within window_s;
// layers that merely share a label but spread across the film stay separate events (overload is never hidden by relabeling).
export function eventDensity(cues, { film_s = null, budget = null, policy = null, window_s = 0.5, max_layers_per_event = 4 } = {}) {
  const groups = new Map();
  for (const c of arr(cues).filter((x) => x && x.resolved !== false)) {
    const key = c.perceptual_event_id || c.event_id || c.id, t = pictureOf(c);
    let g = (groups.get(key) || []).find((x) => Math.abs(x.t - t) <= window_s);
    if (!g) { g = { key, t, cues: [], layers: 0 }; groups.set(key, [...(groups.get(key) || []), g]); }
    g.cues.push(c.id); g.layers += layersOf(c).length;
  }
  const events = [...groups.values()].flat().sort((a, b) => a.t - b.t);
  const b = scaledBudget(budget || DEFAULT_BUDGET, policy), flags = [];
  const multi = events.filter((e) => e.layers > 1);
  const piles = events.filter((e) => e.layers > max_layers_per_event);
  if (piles.length) flags.push({ check: "layer_pile", events: piles.map((e) => e.key), message: `${piles.length} event(s) stack more than ${max_layers_per_event} layers: an event keeps one job per layer` });
  if (events.length >= 4 && multi.length / events.length > 0.5) flags.push({ check: "layered_everywhere", message: "more than half the events are layered: layering is for reveals and key moments, not a texture on every cue" });
  let over = null;
  if (film_s && b.perSec > 0) { const limit = Math.max(1, Math.floor(film_s * b.perSec)); if (events.length > limit + 1) over = { limit, events: events.length }; if (over) flags.push({ check: "event_density", message: `${events.length} perceptual events in ${r3(film_s)} s against about ${limit}` }); }
  let maxWin = 0;
  for (const e of events) maxWin = Math.max(maxWin, events.filter((x) => x.t >= e.t && x.t < e.t + 1).length);
  if (b.perWindow > 0 && maxWin > b.perWindow) flags.push({ check: "event_window", message: `${maxWin} perceptual events within one second (limit ${b.perWindow})` });
  return { events: events.length, multi_layer_events: multi.length, per_event: events.map((e) => ({ event: e.key, t: r3(e.t), layers: e.layers, cues: e.cues })), max_events_in_1s: maxWin, flags };
}

// technical resources: every layer counts. Peak overlap and the summed level (power sum of the layer gains) over the busiest instant.
export function resourceLayers(cues, { film_s = null, budget = null, policy = null, max_sum_db = 6 } = {}) {
  const spans = [];
  for (const c of arr(cues).filter((x) => x && x.resolved !== false)) {
    const pic = pictureOf(c);
    for (const l of layersOf(c)) {
      const off = l.onset ? num(l.onset.offset_s, 0) : 0;
      const t0 = c.timing && c.timing.sfx_onset_s != null && !c.layers ? c.timing.sfx_onset_s : pic + off;
      spans.push({ cue: c.id, role: l.role, t0, t1: t0 + (num(l.body_s, 0.3) || 0) + (num(l.tail_s, 0) || 0), db: num(l.gain_db, 0) });
    }
  }
  let peak = 0, peakDb = -Infinity, peakAt = null;
  for (const s of spans) {
    const live = spans.filter((x) => x.t0 <= s.t0 && x.t1 > s.t0);
    const db = 10 * Math.log10(live.reduce((a, x) => a + Math.pow(10, x.db / 10), 0));
    if (live.length > peak) peak = live.length;
    if (db > peakDb) { peakDb = db; peakAt = s.t0; }
  }
  const b = scaledBudget(budget || DEFAULT_BUDGET, policy), flags = [];
  if (peak > Math.max(b.perWindow * 2, 2) && b.perWindow > 0) flags.push({ check: "layers_overlap", message: `${peak} layers sound at once (limit ${Math.max(b.perWindow * 2, 2)})` });
  if (spans.length && peakDb > max_sum_db) flags.push({ check: "summed_level", at_s: r3(peakAt), message: `layers sum to ${r3(peakDb)} dB at ${r3(peakAt)} s (limit ${max_sum_db} dB relative to the cue gain): thin the stack` });
  if (film_s) for (const s of spans) if (s.t1 > film_s + 0.01) { flags.push({ check: "tail_past_end", cue: s.cue, message: `${s.role} layer of ${s.cue} rings past the film end (${r3(s.t1)} s > ${r3(film_s)} s): shorten it with a fade, never a hard cut` }); }
  return { layers: spans.length, cues: arr(cues).length, peak_simultaneous: peak, summed_peak_db: spans.length ? r3(peakDb) : null, summed_peak_at_s: peakAt == null ? null : r3(peakAt), flags };
}

// ---- one sonic family per film --------------------------------------------------------------------------------------------------------------
// selection: [{asset_ref|id, pack, family?, job?, role?, pan?}] (the chosen files or planned layers). o.families: parsed families.json (default: read via catalog-evidence)
export function coherentFamily(selection, { families = null, primary = null } = {}) {
  const items = arr(selection).filter(isObj);
  const famDoc = isObj(families) ? families : null;
  const fam = (it) => it.family || sfxFamilyOf({ pack: it.pack }, famDoc);
  const count = {};
  for (const it of items) { const f = fam(it) || "unknown"; count[f] = (count[f] || 0) + 1; }
  const best = Object.entries(count).filter(([k]) => k !== "unknown").sort((a, b) => b[1] - a[1])[0];
  const main = primary || (best && best[0]) || null;
  const compat = new Set(arr(famDoc && famDoc.families).filter((f) => f.id === main).flatMap((f) => arr(f.compatible_with)));
  for (const f of arr(famDoc && famDoc.families)) if (arr(f.compatible_with).includes(main)) compat.add(f.id);
  const stray = items.filter((it) => { const f = fam(it); return f && main && f !== main && !compat.has(f); }).map((it) => ({ ref: it.asset_ref || it.id || null, family: fam(it) }));
  const unknown = items.filter((it) => !fam(it)).length;
  const refs = {};
  for (const it of items) { const k = it.asset_ref || it.id; if (k) refs[k] = (refs[k] || 0) + 1; }
  const repeats = Object.entries(refs).filter(([, n]) => n > 2).map(([ref, n]) => ({ ref, count: n }));
  const mov = items.filter((it) => it.role === "movement");
  const panned = mov.filter((it) => Math.abs(num(it.pan, 0)) > 0.15);
  const constant_stereo_movement = mov.length >= 3 && panned.length / mov.length >= 0.7;
  const flags = [];
  if (stray.length) flags.push({ check: "stitched_packs", message: `${stray.length} sound(s) come from families unrelated to ${main}: one family per film (a cross-family pairing is a hypothesis until auditioned)` });
  if (repeats.length) flags.push({ check: "identical_repeats", message: `${repeats.map((r) => `${r.ref} x${r.count}`).join(", ")}: vary within the family (pickVariation)` });
  if (constant_stereo_movement) flags.push({ check: "constant_stereo_movement", message: "movement sounds pan on nearly every cue: keep most centered, move the stereo image only where the picture travels" });
  return { primary: main, families: count, stray, unknown, repeats, constant_stereo_movement, coherent: !stray.length && !constant_stereo_movement, flags };
}

// least-recently-used pick inside a family pool: pool [{id,...}], used [ids in order of use]. Returns the pool item or null. Deterministic.
export function pickVariation(pool, used = []) {
  const p = arr(pool).filter(isObj);
  if (!p.length) return null;
  const last = (id) => { const i = arr(used).lastIndexOf(id); return i; }; // -1 = never used
  return [...p].sort((a, b) => last(a.id) - last(b.id))[0];
}
