// Impact preview: what a change would make stale. A PREVIEW only: it never applies, moves or rewrites anything.
// Ids are stable ids (beat/shot/panel), never array indexes.
import { descendants, logicalStage, STAGES } from "./stages.mjs";
import { canonicalDigest } from "./contracts.mjs";

const uniq = (a) => [...new Set(a)];
const rest = (stale) => STAGES.filter((s) => !stale.includes(s));
const out = (stale, reason, extra = {}) => { const st = STAGES.filter((s) => stale.includes(s)); return { stale: st, keep: rest(st), reason, preview: true, ...extra }; };

// kind: what changed inside the stage.
//   story:      options.proposition (claims/proposition changed) | text-only (default)
//   storyboard: options.timing (beat durations or order changed) | copy-only (default)
//   final:      options.encoding (export settings only)
// ids: stable ids touched; echoed back so the UI can show "beats b2, b5".
export function impact(changedStage, ids = [], options = {}) {
  const st = logicalStage(changedStage);
  const touched = uniq((Array.isArray(ids) ? ids : []).filter((i) => typeof i === "string" && i));
  if (!st) return { stale: [], keep: [...STAGES], reason: `unknown stage ${JSON.stringify(changedStage)}`, preview: true, ids: touched };
  const o = options || {};
  const extra = { ids: touched, audio_alignment: false, transitions: false };
  switch (st) {
    case "brief":
      return out(descendants("brief"), "the brief changed: everything built from it is stale", extra);
    case "story":
      if (o.proposition) return out(descendants("story"), "the proposition or claims changed: look, storyboard, build and final are stale", extra);
      return out(["storyboard", "build", "final"].filter((s) => s !== "look"), "text-only fix: the look holds; only storyboard copy and what is built from it is stale", { ...extra, copy_only: true });
    case "look":
      // Plan 04 L6: a bounded look revision ("same typography, less glossy") names what stays fixed and always keeps the story.
      // options.downstream_started === false (the Look is still being chosen): nothing downstream exists yet, so nothing is stale.
      if (o.bounded || (Array.isArray(o.fixed) && o.fixed.length)) {
        const fixed = uniq(["story", ...(Array.isArray(o.fixed) ? o.fixed.filter((f) => typeof f === "string" && f) : [])]);
        const lx = { ...extra, bounded: true, fixed, story_preserved: true };
        if (o.downstream_started === false) return out([], "bounded look revision before the storyboard started: only the look's own frames are redrawn; story and everything else holds", lx);
        return out(["storyboard", "build", "final"], "bounded look revision: only the frames and build outputs drawn from the changed look parts are stale; brief and story hold", lx);
      }
      return out(["storyboard", "build", "final"], "the look changed: storyboard, build and final are stale; brief and story hold", extra);
    case "storyboard":
      if (o.timing) return out(["build", "final"], "timing changed: build and final are stale, and audio alignment and transitions must be redone", { ...extra, audio_alignment: true, transitions: true });
      return out(["build", "final"], "storyboard copy changed: build and final are stale", { ...extra, copy_only: true });
    case "build":
      return out(["final"], "the build changed: the final is stale", extra);
    case "final":
      return out(o.encoding ? ["final"] : ["final"], o.encoding ? "export encoding only: re-encode the final, nothing upstream is touched" : "the final changed", extra);
  }
  return out([], "no impact", extra);
}

// ---- V3 (W11): dependency identity and the affected closure ------------------------------------------------------------------------------------
// impact() above answers "which STAGES go stale". These answer "which individual outputs": a local edit invalidates only what READS the changed identity.
// Identity keys are "<kind>:<id>" (id optional: "policy" alone is the whole policy). Nothing is stored here: the caller (the lead's resume / stale-result path,
// lib/job-control.mjs staleByIdentity, lib/jobs.mjs commit/accept current_identity_digest) passes digests in and gets a verdict out. Additive: impact() is unchanged.
export const IDENTITY_KINDS = Object.freeze(["brief", "story", "look", "policy", "event", "object", "score", "font", "shaping", "anchor", "material", "camera", "asset", "copy",
  // Addenda 1+2 (additive): sound and sequence identities. A key with a colon ("cue:c1") is always accepted; these names let a plain object part ({ cue: { c1: ... } }) expand.
  "sound_choice", "music_shortlist", "effects_policy", "mix_plan", "renderer", "cue", "music", "voice", "motif", "handoff", "optics", "product", "attention"]);

// parts: { event:{ id: value|digest }, object:{...}, policy:{ field: value }, font:{...}, ... } or a flat { "event:e1": value }. -> { "kind:id": sha256 } (values are digested, never copied)
export function identityMap(parts = {}) {
  const out = {};
  const o = parts && typeof parts === "object" ? parts : {};
  for (const [k, v] of Object.entries(o)) {
    if (k.includes(":")) { out[k] = canonicalDigest(v); continue; }
    if (!IDENTITY_KINDS.includes(k)) continue;
    if (v && typeof v === "object" && !Array.isArray(v)) { for (const [id, x] of Object.entries(v)) out[`${k}:${id}`] = canonicalDigest(x); }
    else out[k] = canonicalDigest(v === undefined ? null : v);
  }
  return out;
}
// one digest for a set of identity keys a consumer reads (a job, a review, a score binding): changes only when one of THOSE keys changes.
export function consumerIdentity(reads = [], map = {}) {
  const keys = [...new Set((Array.isArray(reads) ? reads : []).filter((x) => typeof x === "string" && x))].sort();
  return canonicalDigest(keys.map((k) => [k, ...Object.entries(map).filter(([mk]) => depMatch(k, mk)).sort(([a], [b]) => (a < b ? -1 : 1))]));
}
// a dependency key d matches a changed key c when equal, or one is the whole-kind / prefix of the other ("policy" <-> "policy:pace")
const depMatch = (d, c) => d === c || c.startsWith(d + ":") || d.startsWith(c + ":");

// before / after: identityMap results. -> { changed:[keys], added:[keys], removed:[keys] }
export function diffIdentity(before = {}, after = {}) {
  const b = before || {}, a = after || {};
  const changed = [], added = [], removed = [];
  for (const k of Object.keys(a)) { if (!(k in b)) added.push(k); else if (a[k] !== b[k]) changed.push(k); }
  for (const k of Object.keys(b)) if (!(k in a)) removed.push(k);
  return { changed: changed.sort(), added: added.sort(), removed: removed.sort() };
}

// consumers: [{ id, kind?: "job"|"score_binding"|"implementation"|"review"|"board"|"output", reads:[identity keys], after?:[consumer ids it is built from] }]
// changes: keys that changed (diffIdentity changed+added+removed, or an explicit list). -> { stale:[ids], keep:[ids], reasons:{ id: [why] }, full_rebuild:false, causes:[keys] }
// A consumer is stale when it reads a changed key, or is built from a stale consumer (transitive). Everything else is kept: a one-event edit never rebuilds the whole film.
// full_rebuild is true only when a "brief" key changed (the brief is the root of everything) or when no consumer declared what it reads (unknown dependencies cannot be narrowed).
export function affectedClosure({ consumers = [], changes = [] } = {}) {
  const cs = (Array.isArray(consumers) ? consumers : []).filter((c) => c && c.id != null).map((c) => ({ ...c, id: String(c.id), reads: Array.isArray(c.reads) ? c.reads.map(String) : null, after: Array.isArray(c.after) ? c.after.map(String) : [] }));
  const ch = [...new Set((Array.isArray(changes) ? changes : []).map(String))];
  const reasons = {}, stale = new Set();
  const why = (id, r) => { (reasons[id] ||= []).push(r); stale.add(id); };
  const undeclared = cs.filter((c) => c.reads === null);
  for (const c of cs) {
    if (c.reads === null) continue;
    for (const d of c.reads) for (const k of ch) if (depMatch(d, k)) why(c.id, `reads ${k}`);
  }
  for (const c of undeclared) if (ch.length) why(c.id, "declares no reads: a change cannot be shown not to reach it");
  let grew = true;
  while (grew) { grew = false; for (const c of cs) if (!stale.has(c.id) && c.after.some((a) => stale.has(a))) { why(c.id, `built from stale ${c.after.find((a) => stale.has(a))}`); grew = true; } }
  const full = ch.some((k) => k === "brief" || k.startsWith("brief:")) || (ch.length > 0 && undeclared.length === cs.length && cs.length > 0);
  return { stale: cs.filter((c) => stale.has(c.id)).map((c) => c.id), keep: cs.filter((c) => !stale.has(c.id)).map((c) => c.id), reasons, full_rebuild: full, causes: ch };
}

// The six scopes of a requested change (spec 14) -> what they touch. A scope never widens itself: "punchier" is `timing_adjustment` or `motion`, never `new_story`.
export const CHANGE_SCOPES = Object.freeze({
  copy_spelling: { stage: "storyboard", kinds: ["copy"], invalidates: ["text_ops", "frames_with_copy", "build_of_those_units"], keeps: ["story", "look", "events", "score", "anchors"], new_premise: false },
  asset_correction: { stage: "build", kinds: ["asset"], invalidates: ["units_showing_asset", "asset_compositing_of_those_units"], keeps: ["story", "look", "events", "score", "other_assets"], new_premise: false, narrative_subject_exception: "unless the asset IS the narrative subject (identity, logo as story)" },
  timing_adjustment: { stage: "storyboard", kinds: ["score", "anchor"], invalidates: ["score_bindings_in_range", "audio_alignment", "transitions_in_range", "build"], keeps: ["story", "look", "copy", "events"], new_premise: false },
  material_change: { stage: "look", kinds: ["material", "camera"], invalidates: ["units_using_material", "spatial_ops_of_those_units"], keeps: ["story", "copy", "events", "score"], new_premise: false },
  event_substitution: { stage: "story", kinds: ["event", "score", "object"], invalidates: ["event_score_bindings", "event_implementations", "event_reviews", "continuity_group_of_event"], keeps: ["brief", "look_meaning", "unrelated_events"], new_premise: false, needs_confirmation: true },
  new_story: { stage: "story", kinds: ["story", "event"], invalidates: ["look_dependents", "storyboard", "build", "final"], keeps: ["brief"], new_premise: true, needs_confirmation: true },
});
export function changeScopeImpact(scope, ids = [], options = {}) {
  const s = CHANGE_SCOPES[scope];
  if (!s) return { ok: false, error: `unknown change scope ${JSON.stringify(scope)} (known: ${Object.keys(CHANGE_SCOPES).join(", ")})` };
  const base = impact(s.stage, ids, { proposition: scope === "new_story" || scope === "event_substitution", timing: scope === "timing_adjustment", bounded: scope === "material_change", fixed: scope === "material_change" ? ["story", "copy", "events"] : undefined, downstream_started: options.downstream_started });
  return { ok: true, scope, ...s, stage_impact: base, local: scope !== "new_story", full_rebuild: scope === "new_story" };
}

// ---- Addendum 2 (W3 AUD-REV): sound identity and scoped audio invalidation ---------------------------------------------------------------------------
// The same machinery as above (identityMap / diffIdentity / affectedClosure), fed the sound inputs, so "softer effects" re-does the effects and the mix, never the picture,
// and a gain change re-does the mix and its review only. Pure: nothing is stored or applied. Callers: lib/sound-controls.mjs (note scope), lib/incremental-render.mjs
// (audioPlan.sound_scope), lib/voice-cache.mjs (voiceRevisionImpact); the lead's resume path may pass the same maps to staleByIdentity.
const isO = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const A = (x) => (Array.isArray(x) ? x : []);
const LEVEL_FIELDS = ["gain_db", "gain", "level", "level_db", "volume", "pan"];
const dropLevel = (c) => Object.fromEntries(Object.entries(c).filter(([k]) => !LEVEL_FIELDS.includes(k)));
const pickLevel = (c) => Object.fromEntries(Object.entries(c).filter(([k]) => LEVEL_FIELDS.includes(k)));

// parts (every one optional; an absent part contributes no key, so an old project's map is simply smaller):
//   choices:{choices:{voiceover,pace,feeling,effects,music_source,user_track}} (lib/sound-choices.mjs record, or its inner `choices`)
//   shortlist:{revision, selected}   effects_policy:{budget_scale, allow_prominent,...}   bus_plan:{buses, reductions, music_automation, aggregate} (lib/mix-bus.mjs busPlan)
//   processor:{renderer, version, filter_graph_digest}   cues:[{id,...}]   music:{id, file_digest, section, stems_verified}   voice:{segments:[{segment_id,key,file_digest}]}
// -> parts for identityMap(). A cue's LEVEL fields live under mix_plan (a gain change is a mix change), the rest under cue (its source and timing).
export function soundIdentityParts({ choices = null, shortlist = null, effects_policy = null, bus_plan = null, processor = null, cues = null, music = null, voice = null } = {}) {
  const out = {};
  if (isO(choices)) out.sound_choice = isO(choices.choices) ? choices.choices : choices;
  if (isO(shortlist)) out.music_shortlist = { revision: shortlist.revision ?? null, selected: shortlist.selected ?? null };
  if (isO(effects_policy)) out.effects_policy = effects_policy;
  if (isO(bus_plan)) {
    const mix = { reductions: A(bus_plan.reductions), automation: A(bus_plan.music_automation), aggregate: bus_plan.aggregate ?? null };
    for (const [b, v] of Object.entries(isO(bus_plan.buses) ? bus_plan.buses : {})) mix[`bus.${b}`] = v;
    out.mix_plan = { ...(isO(out.mix_plan) ? out.mix_plan : {}), ...mix };
  }
  if (isO(processor)) out.renderer = { [String(processor.renderer || "unknown")]: { version: processor.version ?? null, filter_graph_digest: processor.filter_graph_digest ?? null } };
  if (Array.isArray(cues)) {
    out.cue = {}; const lv = {};
    for (const c of cues.filter((x) => isO(x) && x.id != null)) { out.cue[String(c.id)] = dropLevel(c); lv[`cue.${c.id}`] = pickLevel(c); }
    out.mix_plan = { ...(out.mix_plan || {}), ...lv };
  }
  if (isO(music)) out.music = { track: { id: music.id ?? null, file_digest: music.file_digest ?? null }, section: music.section ?? null, stems: music.stems_verified === true };
  if (isO(voice)) out.voice = Object.fromEntries(A(voice.segments).filter((s) => isO(s) && s.segment_id != null).map((s) => [String(s.segment_id), { key: s.key ?? null, file_digest: s.file_digest ?? null }]));
  return out;
}

const VISUAL_READS = ["brief", "story", "look", "policy", "event", "object", "font", "shaping", "anchor", "material", "camera", "asset", "copy", "score"];
// the audio consumers and exactly which identities each reads. opts.music_led: a track the film is edited to also moves cue/motion relations; narrated: voice consumers exist.
export function soundConsumers({ music_led = false, narrated = true } = {}) {
  const c = [
    { id: "music_selection", kind: "implementation", reads: ["sound_choice:music_source", "sound_choice:feeling", "sound_choice:pace", "sound_choice:user_track", "music_shortlist"] },
    { id: "music_edit", kind: "implementation", reads: ["music:track", "music:section"], after: ["music_selection"] },
    { id: "cue_layers", kind: "implementation", reads: ["sound_choice:effects", "effects_policy", "cue"] },
    { id: "cue_preparation", kind: "implementation", reads: ["cue", "effects_policy", "event", "score"], after: ["cue_layers"] },
    { id: "cue_motion_relations", kind: "implementation", reads: ["score", "event", ...(music_led ? ["music:track", "music:section"] : [])] },
    ...(narrated ? [
      { id: "voice_timing", kind: "implementation", reads: ["voice", "sound_choice:voiceover"] },
      { id: "ducking", kind: "implementation", reads: ["voice", "mix_plan:reductions", "mix_plan:aggregate", "sound_choice:voiceover"], after: ["voice_timing"] },
    ] : []),
    { id: "mix", kind: "output", reads: ["mix_plan", "renderer", "cue", "music", "voice", "score", "sound_choice:voiceover", "effects_policy"], after: ["cue_preparation", "music_edit", ...(narrated ? ["ducking"] : [])] },
    { id: "audio_review", kind: "review", reads: [], after: ["mix"] },
    { id: "visual_renders", kind: "output", reads: VISUAL_READS },
  ];
  return c;
}

// The audio scopes a sound note can have: the identity keys each one moves. Consumers come from soundConsumers, so the table never drifts from what a consumer reads.
export const AUDIO_SCOPES = Object.freeze({
  gain_eq:        { changes: ["mix_plan:bus"], timing: false, needs_user: false, source_decision: false, label: "gain / EQ / bus level" },
  effects_policy: { changes: ["effects_policy", "sound_choice:effects"], timing: false, needs_user: false, source_decision: false, label: "effects amount or policy" },
  cue_source:     { changes: ["cue:source"], timing: false, needs_user: false, source_decision: false, label: "a cue's source sound" },
  music_section:  { changes: ["music:section"], timing: false, needs_user: false, source_decision: false, label: "a different part of the same track", reevaluate_edit: true },
  music_track:    { changes: ["music:track", "music:section", "sound_choice:music_source"], timing: false, needs_user: true, source_decision: true, label: "a different track", reevaluate_edit: true },
  timing_edit:    { changes: ["score"], timing: true, needs_user: false, source_decision: false, label: "timing or track edit points" },
  voiceover:      { changes: ["voice", "sound_choice:voiceover", "score"], timing: true, needs_user: true, source_decision: false, label: "voiceover added, removed or re-voiced", script_truth_kept: true },
  ending:         { changes: ["music:section"], timing: false, needs_user: false, source_decision: false, label: "how the sound ends" },
});

// before / after: identityMap results (soundIdentityParts through identityMap). -> { changes, closure, visuals_rebuilt, stale, keep, needs_user }
export function soundChangeImpact({ before = {}, after = {}, music_led = false, narrated = true } = {}) {
  const d = diffIdentity(before, after);
  const changes = [...d.changed, ...d.added, ...d.removed];
  const cl = affectedClosure({ consumers: soundConsumers({ music_led, narrated }), changes });
  const source = changes.filter((k) => k === "sound_choice:music_source" || k === "music:track" || k === "music_shortlist:selected");
  return { changes: d, closure: cl, stale: cl.stale, keep: cl.keep, visuals_rebuilt: cl.stale.includes("visual_renders"), needs_user: source.length ? { why: "a different music source or track is a source/style decision, not a mix tweak", keys: source } : null, reevaluate_edit: music_led && changes.some((k) => k.startsWith("music:")) };
}

// scope name -> what it touches, from the table above + the consumers. ids: stable ids touched (echoed). -> { ok, scope, ...entry, invalidates:[consumer ids], keeps:[...], visuals_rebuilt, stage_impact }
export function audioScopeImpact(scope, ids = [], { music_led = false, narrated = true } = {}) {
  const s = AUDIO_SCOPES[scope];
  if (!s) return { ok: false, error: `unknown audio scope ${JSON.stringify(scope)} (known: ${Object.keys(AUDIO_SCOPES).join(", ")})` };
  const cl = affectedClosure({ consumers: soundConsumers({ music_led, narrated }), changes: s.changes });
  const needsUser = s.needs_user || (scope === "music_section" && music_led);
  return { ok: true, scope, ...s, needs_user: needsUser, invalidates: cl.stale, keeps: cl.keep, visuals_rebuilt: cl.stale.includes("visual_renders"), reasons: cl.reasons, stage_impact: impact(s.timing ? "storyboard" : "final", ids, s.timing ? { timing: true } : {}), preview: true };
}
