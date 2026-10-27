# Sound revisions: scope and invalidation (Addendum 2, section 7)

Status: implemented_unvalidated. Nothing here was run, rendered, listened to or tested; the code was only syntax-checked.

A sound note is classified to a SCOPE (`lib/impact.mjs AUDIO_SCOPES`). The scope names the identity keys it moves; `soundConsumers` names what reads each key; the closure is what is re-done. Everything else, including unchanged pictures, is kept. A note never silently changes a source or style decision: a different track, a different music source, or removing the voiceover goes to the person first.

## Note kinds (`lib/sound-controls.mjs NOTE_KINDS`)

| Kind (said as) | Scope | Re-done | Kept | Needs the person |
|---|---|---|---|---|
| `level` (existing), `keep_music_audible` ("I can't hear the music") | `gain_eq` | mix, audio review | all pictures, cues, music choice, script | no |
| `softer_effects` ("softer effects") | `effects_policy` | cue layers, cue preparation, mix, audio review | pictures, music, script | no (the effects choice is the person's; a note applies it as asked) |
| `less_percussion` on a file with VERIFIED stems | `gain_eq` | mix, audio review | everything else | no |
| `less_percussion` on a stereo file | `music_section` (proposed) | proposes a calmer/sparser section or a different track; nothing is filtered or split | everything, until accepted | yes: no stem control exists, a different track is a source decision |
| `calmer_section` | `music_section` | music edit points, mix, audio review (and cue/motion relations if the film is music-led) | track, style, pictures | only when music-led |
| `swap_music` (existing) | `music_track` | music selection, music edit, mix, review; the edit is re-evaluated | script, look | yes |
| `remove_voiceover` | `voiceover` | voice timing, ducking, durations and reading time (timing changes), mix, review | the script text (approved copy untouched), look, music source | yes |
| `swap_voice`, `edit_line` (existing) | voice regeneration (`voice-cache.voiceRevisionImpact`) | the regenerated lines, their dependents, ducking, mix | script truth, other lines | per existing rules |
| `resolve_ending` | `ending` | music tail or last section, closing cue, mix, review | pictures, rest of the music | no |
| cue source change | `cue_source` | cue layers, cue preparation, mix, review | pictures, music | no |
| timing / track edit points | `timing_edit` | cue and motion relations only where the score moved, mix, review, and only the scenes whose timing moved | everything else | no |

Existing kinds (`swap_music`, `swap_voice`, `edit_line`, `remove_cue`, `add_cue`, `level`, `silence`, `other`) keep their records byte for byte; only the new kinds add `effect.scope`, `scope_invalidates`, `scope_keeps`, `visuals_rebuilt`, `needs_user`, `proposal`, and `requires_user_decision`.

## Mute / solo

Mute and solo are audition only (`audio/mix-state.json`, `setMuteSolo`). They are not a mix input: `currentInputs` in `lib/mix-receipt.mjs` reads score, cues, direction, contract, stems and `audio/automation.json`, never `mix-state.json`. `incremental-render.audioPlan` refuses to reuse a mix when the inputs it is handed carry an audition key and says so (`audition_leak`). Applying a mute as a delivery change is a separate, explicit level/stem note.

## Cache and reuse

Every reuse decision asks the receipt, never a filename: `mix-receipt.reuseDecision` (selected source and section, stem identity, bus-plan digest, cue digest, processor identity, profile), wrapped for callers by `revision-bind.audioReuseGate`. A project without `mix_policy_revision` on its direction is legacy: its receipt is read with the old keys and its audio intent is unchanged. Cached narration lines are reused on their key AND their file hash (`voice-cache.verifyCachedSegment`).

## Distinct states (`controlPayload().technical.states`)

`unresolved_rights`, `absent_audio`, `missing_stems`, `intentional_silence`, `unvalidated_audio`: five separate `{state, why}` entries. Silence chosen on purpose is a decision, not an absence; unvalidated audio means no measured receipt matches, not that the mix is bad.

## Wiring (honest)

Implemented as libraries. Callers: `soundNoteRevision` and `controlPayload` (reached by `soundplan.mjs`, console `soundHook`); `audioPlan({sound_scope})`, `soundChangeImpact`, `audioReuseGate`, `voiceRevisionImpact`, `sequenceChangeImpact` have no engine caller yet (patch proposals to ENG-INT-1 and ENG-INT-2 in the lane report).
