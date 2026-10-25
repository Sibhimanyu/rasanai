# Shared contracts (schema_version 1)

Source of truth: `skills/rasanai/scripts/lib/contracts.mjs` and `lib/stages.json` (read via `lib/stages.mjs`). Status: implemented_unvalidated; nothing run. Old records without `schema_version` read as version 0 (`readLegacy`); a newer version than supported is refused with `unsupported_schema_version`.

## Stage registry (`stages.json`)

Order: brief, story, look, storyboard, build, final. Dependencies: story<-brief; look<-story; storyboard<-story,look; build<-storyboard; final<-build. Legacy step names map in (brief: brief/research/brand/route/footage; story: story/direction/films/concept/scenes; look: look/motion/styleframes; storyboard: storyboard/animatic/reel/transitions/voice/music/keyframes/plan; build: build; final: final/render). Transport aliases: preview and animatic -> storyboard.

## Approval record (`approvalRecord`)

`schema_version, stage, artifact_ref, artifact_digest, revision (integer >= 1, never reused), approved_by, source_action_id, depends_on[{stage, revision, digest}]`. Frozen. `approvalCurrent` is false when a recorded dependency changed revision or digest. Digest = sha256 of key-sorted JSON (`canonicalDigest`).

## Records (factory defaults; every record carries `schema_version`)

- FilmBrief: communication_kind, viewer, destination, scope, takeaway, duration, aspect, must_show[], evidence_refs[], sound{music, voiceover}, accessibility{captions, reduced_motion_safe}, approval_mode (every_stage | key_stages | final_only | autonomous). Required: communication_kind, viewer, destination, takeaway.
- StoryTreatment: proposition, claims[], beats[] (each beat a unique stable `id`).
- LookContract: name, palette[], type{}, motion_language, do[], dont[].
- Storyboard: timing_source (estimate | voiceover | music | manual), beats[] with shots[] with panels[]; every beat, shot and panel has a stable unique `id`.
- WorkerPacket: packet_id, stage, task, inputs[], output_ref, allowed_paths[], depends_on[], budget{}.
- RevisionRequest: idempotency_key, stage, target_ids[], instruction, base_revision, pinned{film, approval_revision, build_revision, render_revision_id, source_digest}, target{beat_id, shot_id, element_id, time_range}, annotation, intent_category, impact, status (requested | accepted | applied | preview_ready | rendered | failed | reverted | stale | conflicted). `revisionKey` = digest of stage, sorted target_ids, trimmed instruction, base_revision.
- Capability: id plus five states, each `{value: boolean, reason}` (implemented, available, enabled, permitted, verified); a false state must give a reason; `usable` needs all five true. (Plan 06 `capabilities.mjs` adds a sixth axis on top.)

`safePath(root, rel)` resolves paths inside the project and refuses escapes and symlink exits.
