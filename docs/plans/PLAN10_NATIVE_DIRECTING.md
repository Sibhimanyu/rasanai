# Plan 10 handoff: native directing, scoped revisions and trustworthy edits

Status: implemented_unvalidated (compile-checked only; nothing was opened or run). The engine writes live state; Studio reads it and appends actions (R07). The browser console sends the same payloads.

## Actions (an `actions.jsonl` line: `{id, ts, step, type, value, note}`; use step `render`)

| type | value | engine | answer |
|---|---|---|---|
| `motion-edit` | `{ edit: {...contract D...} }` (also top-level `edit`) | `handleMotionEditAction`: a typed edit, or a `modify`/`retime` with `fields.position {dx,dy}` (fractions of the frame), `scale` (multiplier), `text`, `color`, `start`/`duration`, is recorded, checkpointed and applied in ONE source transaction; anything else becomes a scoped packet (`motion/packets/<id>.md`) | `session.edit_results[]`: `{id, ok, status, conflict, duplicate, error, current, needs_reselect}` |
| `motion-edit` | `{ restore_of: <edit id> }` | `restoreAsNewVersion`: the current state is checkpointed first, the earlier state written as `<id>.restoreN` | feed line |
| `revision-request` | `note` + `{ anchor:{beat_id,shot_id,element_id,t,time_range,region_norm,frame_ref,render_revision_id,index_build_digest}, pinned:{film,approval_revision,build_revision,render_revision_id,source_digest}, beats? }` | `revisionHook` -> `lib/revision-intent.mjs` | `session.revision_requests[]`; `<run>/revisions/requests.jsonl` |
| `revision-confirm` | `{ idempotency_key, accept }` | accept -> `accepted`, decline -> `reverted` | same |
| `job-control` | `{ op: pause\|resume\|cancel\|retry\|logs\|capabilities, job_id?, approve_duplicate? }` | `lib/job-control.mjs` | `session.job_control` (redacted), `session.run_status`, `crew/capabilities.json` |
| `comment` | (unchanged) | any step: also read once by `classifyFeedback` (`intent_category`, `interpretation`) | the note carries them |

## Edit lines (`motion/edits.jsonl`, latest per id wins; additive fields)

`payload_digest`, `affected_properties`, `base_state {element_digest, values|file_digest}`, `result_state {file_digest, element_digest, values}`, `inverse {element_id, values}`, `dependencies {scene_id, element_id, file, downstream_stale, keeps}`, `receipt {..., verified:{output_sha,file}, unavailable:[...]}`, `conflict {reason, at}`, `stale_binding`, `render_revision_id`, `frame_ref`. Status: `requested, accepted, applied, preview_ready, rendered, failed, reverted, stale, conflicted`.

## Rules Studio relies on

1. `rendered` / `preview_ready` exist only with a matching receipt (`checkRenderReceipt`); a nonempty file is refused.
2. Undo never erases later unrelated changes: inverse patch, exact-state checkpoint restore, or a conflict with `restore_as_new_version`.
3. The same action id with the same payload is a retry; with a different payload it is a conflict.
4. A stale element index or a different render is never used as the target (`PointerResolver`, `bindAnnotation`); the note is kept and the person reselects.
5. `source_changed` is announced on every accepted source change (`crew/revisions.jsonl`); nothing here marks it rendered.

Commands: `editor-patch.mjs mark --receipt <file|revision id>`, `undo [--as-new-version]`, `restore`.

Plan 10 typography note (engine): a bare `note` at animatic/render/final that `classifyFeedback` reads as typography ("don't use this font", "change the font", "make the text bigger") is ALSO recorded as a look-class `typography` revision request (`lib/revision-intent.mjs`; key from the action id; `console.mjs typographyNoteHook`). Scope is the whole film unless an anchor names a beat/shot/element; story, claims, palette, layout and copy stay; impact is the bounded look revision (storyboard, build and final stale). "Avoid font X" is a structured `avoid` entry, kept as a user-scoped style lesson (`lessons.mjs`, source = the note) and honoured as `font_avoid` by `lib/visual-bible.mjs` / `lib/look.mjs checkLookFonts` (a violation is reported, not silently used). "This font" with no anchor gets one confirm question (`revision-confirm`). The reply says queued and that no time estimate exists. Unrecognised notes keep the legacy path. Fixture: `skills/rasanai/scripts/tests/fixtures/plan10/11-typography-note.json` (authored, not run).
