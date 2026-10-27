# SFX layering and purpose (Addendum 2, section 5)

Status: implemented_unvalidated. Nothing here has been auditioned; library jobs, intensities and families are metadata estimates (`library/sfx/families.json`).
Code: `scripts/lib/sfx-layers.mjs` (planning), `scripts/lib/cues.mjs` (cue shape, `overlapReport`). Time comes only from `motion/score.json` through `resolveCue`; layers store an offset against an event, never film time.

## Job taxonomy (catalog `job`)
| Job | Layer role | Light | Medium | Prominent |
|---|---|---|---|---|
| interface_action | ui | soft click/tick, one quiet sample | tactile press | not used |
| movement | movement | brush/air | whoosh for a real travel | long sweep, signature moves only |
| material_contact | accent | tap, landing | thud, settle | heavy contact |
| accent_impact | accent | ping | hit | impact, stinger (reveal / logo) |
| development_transition | tail / movement | short decay | riser, swell | riser into a reveal |
| environmental_bed | texture | room tone | slow texture | rare, never constant |

## Cue shape (all new fields optional; a legacy cue is unchanged)
`{id, event, role, purpose, family, intensity: light|medium|prominent, perceptual_event_id?, music_reduction?:{depth_db, reason}, layers:[{role: movement|accent|texture|tail|ui, asset_ref, gain_db, pan, tonal, onset:{basis:"event", offset_s, lead: leads|confirms|trails}, body_s, tail_s}]}`.
- One layer = one job. A reveal may use an airy movement (leads), a restrained tonal accent (confirms), a decaying tail (trails). A small UI action is one quiet layer. Some moments need none.
- `offset_s` is where the layer's ACCENT sits against the event; the file starts earlier by its measured sync point (`layerTimes`). Exact alignment is a decision tied to the event, not the file's first sample. Reuse `INTENTS` on_picture / anticipate / trail / synchronous.
- Tails are kept (`keep_tail`): never trimmed to the next cue; a tail past the film end is flagged (`tail_past_end`) to be faded.

## Effects choice is binding
`effectsPolicy(choice)`: Subtle -> role sparse, scale 0.5, no prominent. Expressive -> causal, scale 1, prominent allowed. Minimal -> signature_only (declared signature moves only, at most hero_max), None -> no cue. Prominent requests under Subtle are lowered to medium. No whoosh on every movement (signature moves only, existing `whooshEvery`), no hit on every word. Ordinary cues carry `ordinary_music_reduction:"none"`: AUD-MIX never receives a duck request from them. A prominent cue may carry `music_reduction` (reason stated), consumed by `busPlan` as `reductions[reason=prominent_event]`; an effect never feeds the speech reduction.

## Density: events vs layers
`eventDensity` counts a multi-layer event once (same event id and picture within 0.5 s); it flags `layer_pile` (>4 layers on one event) and `layered_everywhere` (>50% of events layered), so relabeling never hides overload. `resourceLayers` counts every layer, peak simultaneous layers and the power-summed level. `overlapReport(resolvedCues,{window_s})` (cues.mjs) clusters cues by onset and flags events/layers per window, stacked prominent events, riser+impact stacks.

## Family coherence
One `families.json` family per film (`coherentFamily`); `compatible_with` pairs are hypotheses. Flags: stitched unrelated packs, a sample used more than twice (`pickVariation` = least recently used within the family), movement panned on nearly every cue.

## Patch proposals (owner: ENG-INT-2 unless stated)
1. `S/sound.mjs` ~346 (sfx-plan) + `L/audio-direction.mjs sfxExpectation` (AUD-DIRECTION; no owner this job, so the sound.mjs-only form is given). `sfxExpectation` returns `required:false` for signature_only, so every cue is dropped (Minimal acts as none). Replace
   `if (expect.required === false) { for (...) skipped.push(...); cand = []; }` with
   ```js
   const sigOnly = expect.role === "signature_only";
   if (expect.required === false && !sigOnly) { for (const e of cand) skipped.push({ event: e.id, t: e.t, why: `audio direction: ${expect.why}` }); cand = []; }
   else {
     if (sigOnly) { const keep = []; for (const e of cand) { if (e.signature && keep.length < BUDGET[mode].heroMax) keep.push(e); else skipped.push({ event: e.id, t: e.t, why: "Minimal effects: only declared signature moves carry a sound" }); } cand = keep; }
     const win = ...unchanged silence-window handling...
   }
   ```
   (`mode` must be computed before this block; it is currently set ~370, move that line up.) Cleaner alternative in `audio-direction.mjs`: `required: role === "causal" || role === "sparse" || role === "signature_only"` plus `signature_only: role === "signature_only"`.
2. sfx-plan: after `audioDirection()`, `const policy = effectsPolicy(sound.resolved.effects, {floor})` when `audio/sound-choices.json` exists; `B = scaledBudget(BUDGET[mode], policy)` replaces `BUDGET[mode]` for `maxCount`, `perWindow`, `heroMax`; no policy file = unchanged. Selection: restrict candidates to one family (`coherentFamily` over picks; `pickVariation(pool, usedIds)` for repeats); call `planCueLayers(cue,{sound_resolved, family, event, catalog})` for cues that carry layers/intensity; skip prominent kinds when `!policy.allow_prominent`.
3. `check` (~877): count `eventDensity(cues).events` for the "SFX density" and "SFX pile-up" rules (one perceptual event per multi-layer cue) and `resourceLayers(cues).layers/peak_simultaneous/summed_peak_db` for the technical/summed-level warnings; print both numbers. Add `overlapReport` flags as warnings.
4. `audio_meta_sfx` (~530), additive: one entry per layer, `{frame, file, offset_s, duration_s, volume, event: perceptual_event_id, layer: role}`; a single-layer legacy cue keeps its exact current entry (no `event`/`layer` keys added when `layers` is absent). Level is `gain_db` converted at the renderer boundary only (`dbToLinear`, mix-bus.mjs).
5. `L/audio.mjs SFX_BUDGET` stays read-only; pass the row in (`scaledBudget(SFX_BUDGET[mode], policy)`).
