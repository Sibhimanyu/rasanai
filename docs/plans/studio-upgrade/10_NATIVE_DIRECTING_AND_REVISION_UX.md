# Plan 10 - Native directing, meaningful approvals and precise revisions

**Repository:** `Sibhimanyu/rasanai`  
**Executor:** Sonnet implementation lead and scoped Sonnet workers  
**Sequence:** 10 of 14 implementation stages; coordinator is Plan 00  
**Prerequisite:** Plan 09 integrated as implementation, not yet pipeline-tested.  
**Research snapshot:** 2026-10-25; public HEAD inspected at `20ea14748daaee007cb4eaf5ba8aee91c09b1c4a`. Local HEAD wins.

## Execution and verification policy

Implement this plan inside the actual RasanAI checkout. Read `00_EXECUTE_IN_ORDER.md` and the predecessor handoff first, then only the repository files relevant to your assignment. Preserve existing working features and uncommitted changes. All proposed filenames/APIs below must be reconciled with the local checkout; extend an equivalent existing implementation instead of creating a duplicate.

**Testing requires the user's explicit approval, including in Plan 14.** Implement Plans 01-13, integrate the changes, and author fixtures/tests without executing them. Then stop at `awaiting_test_approval`, report the implemented candidate, and present the proposed testing scope, commands and resource/usage implications. Do not enter Plan 14 automatically. Only a subsequent explicit user instruction approving testing authorizes its agreed scope; this plan, silence, a general instruction to continue implementation, or approval of a film's Story/Look does not.

Until that approval, no unit/integration suites, agent film trials, browser/render smokes, GUI QA, live provider probes, end-to-end runs or benchmarks may run, whether directly, through workers, hooks or CI. Read-only inspection, syntax/schema parsing, type checks and compilation remain permitted only when they execute no tests, workflows or runtime probes. Hold any operation that would trigger tests; do not disable safeguards to bypass them. Record implementation as `implemented_unvalidated`. Preserve normal product runtime safeguards and creative approvals. See [Testing approval gate](TESTING_APPROVAL_GATE.md).

The implementation lead owns shared entrypoints and schema changes. Use parallel Sonnet workers for genuinely independent file-owned tasks; do not manufacture concurrency or let workers edit the same shared files. No remote push, public release, paid dependency purchase, new paid generation, destructive migration or permission escalation is authorized by this document alone.

## Repository entrypoints to locate

Start with these current or previously documented locations; verify their local equivalents before editing. Read only the symbols relevant to your assigned lane. Shared entrypoints remain lead-owned.

- `apps/macos/Sources/RasanAIStudio/`
- `apps/macos/Sources/StudioCore/`
- `skills/rasanai/console/index.html`
- `skills/rasanai/scripts/console.mjs`
- `skills/rasanai/scripts/editor-patch.mjs`
- `skills/rasanai/scripts/element-index.mjs`

## Outcome

Make the workflow understandable and controllable without turning Studio into a prompt console or a full traditional editing application. Every screen should explain the decision the user is making, preserve context while details scroll, and translate feedback into the smallest valid revision.

Keep RasanAI's native SwiftUI shell, visual identity, crew characters, current player and file protocol. R07 documents the current engine boundary: the engine writes live session state; Studio reads it and appends actions. Adapt current views, do not replace the app with a web view or create a second engine server.

## U1. Make the five creative calls visibly different

| Call | Primary material | Approve action means |
|---|---|---|
| Brief | Editable communication assignment, assets, audience and assumptions | These are the inputs and intended outcome |
| Story | Treatment title, premise, meaningful beat sequence, copy and proof | This idea and communication order are approved |
| Look | Comparable representative frames and concise visual-language explanation | This visual system is approved, not every future shot |
| Storyboard | Shot/panel sequence, actions, timings and animatic playback | This detailed visual execution and timing are approved |
| Final | Actual rendered film, versions, findings and delivery status | This output version is accepted or has explicit revisions |

Build progress appears between Storyboard and Final; it is not a sixth approval. Show inherited/auto-approved stages under existing Just make it/series permissions, with the source of that decision. Keep the user's ability to revisit them without silently changing saved series defaults.

Use audience-facing treatment names; internal beat labels do not become film headings. Explicitly label styleframes and animatics as such. Never present a slideshow as a finished animated preview or a low-resolution proxy as delivery quality.

## U2. Keep the workspace stable and accessible

Preserve persistent navigation, player/choice context and primary action areas. Long scripts, explanation panels, notes and reference lists scroll within their own constrained panels. Do not force the entire workspace off screen to reach the next action. Compact thumbnails must remain identifiable; use native resizing and sensible window-width behavior rather than fixed oversized cards.

Support keyboard navigation, discoverable focus, readable labels, accessible control names and non-color status indications. Preserve shortcuts already implemented where compatible; do not invent conflicting global bindings. Respect reduced-motion preferences for app chrome without silently altering the authored film.

The crew presentation should clarify who is working and why. Avoid large decorative overlays that hide the actual choice or output. Keep technical diagnostics expandable and secondary to the film.

## U3. Turn feedback into a scoped revision

A revision request pins the film/approval/build revision plus the target beat, shot, semantic element or time range. Keep the user's exact note, any region annotation, intent category, dependency impact and status.

Examples:

- "The story feels generic" targets the treatment/proposition, not random colors.
- "Keep this idea, make it less busy" targets shot density, hierarchy and motion choices, not the approved factual claim.
- "The ending is weak" targets the payoff/close and dependent transitions, not the entire film.
- "Move this title up" uses a deterministic property edit where supported, not a new writer agent.
- "Use this look instead" previews the downstream invalidation and preserves the selected story unless the user changes it.

Do not guess a destructive broad rewrite from ambiguous feedback. Present one concise interpretation with the affected scope when material; avoid a long interrogation for routine local edits. The current approval revision remains valid until a new choice is committed.

## U4. Extend direct manipulation without bypassing the engine

Reuse `data-el`, the derived element index and append-only edit transactions. Map pointer coordinates through the actual video content rectangle, including letterboxing, scaling, crop, fullscreen and high-DPI backing pixels. A bounding box from an old build must not target a new element silently.

Dragging/resizing can show an ephemeral overlay preview in Studio. Commit through the normal action queue with expected revision/digest; the engine validates and applies the source edit. On rejection, restore the displayed committed state and explain the conflict. Debounce/coalesce a drag into one meaningful transaction rather than hundreds of agent messages.

Text, color, position, scale and supported timing changes should use direct deterministic patching when the underlying component exposes those properties. Unsupported animation or source structures route to a scoped model packet. Raster footage remains clip-editable; pointing at a depicted object is not proof it exists as an editable layer.

## U5. Make undo, versions and progress trustworthy

Use the existing edit log/checkpoint mechanism with idempotent action IDs and atomic application. Undo restores the actual accepted source state and invalidates downstream artifacts; it is not just a UI reversal. Redo verifies that the original target still exists. Concurrent actions are ordered through the shared lock, never through two independent view models writing files.

Display `requested`, `accepted`, `applied`, `preview_ready`, `rendered`, `failed`, `reverted` and `stale/conflicted` distinctly as compatible additions to current states. A source digest change is not a completed render; an overlay preview is not proof the source changed.

Retain the last delivered film while a revision builds. Compare Original/Updated at matched times where their timelines still correspond. For retimed versions, explicitly map correspondence rather than pretending the same timestamp shows the same beat.

Use actual job state for Working, Waiting for you, Paused, Rate-limited, Stopped and Failed. Show estimated usage as estimated and missing metrics as unavailable. Do not reset the visible stage or repeat an already answered question on reconnect.

## U6. Integrate capabilities and recovery controls

Only show usable optional adapters as ready. A model installation, license/permission blocker or unsupported host has a clear explanation and safe alternative. Do not ask users to configure technical dependencies when the ordinary code-rendered path can fulfill the brief.

Expose Pause/Resume, cancel an owned job, show relevant logs and retry a failed step. Never call a global provider interrupt for a task running on a shared external queue. Keep raw credentials and private paths out of UI error strings and screenshots used in evaluation.

Keep browser-console parity for core approvals and revisions where it is an existing supported surface; share payload contracts rather than maintaining subtly different story state machines.

## Parallel lanes

Assign stage views, revision intent/target models, player coordinate mapping, inspector/undo controls, progress/capability UI and browser-console payload parity separately. Lead integrates navigation, shared model decoding and action registration. Do not run the native app to inspect layout during this plan; record window scenarios for 14.

## Implementation handoff

Deliver functioning view wiring and engine actions, not disconnected mock screens. Preserve native branding and shortcuts. Register U01-U10 covering five-call navigation, local edit, source-digest conflict, undo/redo, pause/resume, window sizing, keyboard accessibility, old runs, variant versions and optional dependency states.

## Deferred verification

Plan 14 opens the real app on macOS, performs the five-call journey and revisions, inspects small/large windows and player modes, exercises keyboard/accessibility behavior and verifies that native actions alter the intended source and delivered film. A Swift build alone is not UI acceptance.

## U7. Make Undo revision-safe, not just checkpoint-based

The inspected editor implementation restores checkpoint files without first comparing current contents with the edit's recorded post-state. It also records an edit as rendered when a supplied preview file merely exists and is nonempty. Strengthen these boundaries before widening direct manipulation. These are source-inspection findings, not reproduced runtime failures.

An edit records base state, resulting state, affected semantic properties, operation payload digest and dependencies. Prefer an inverse semantic patch for supported properties. Whole-file checkpoint restore is permitted only when the current file digest still matches the expected post-state; otherwise report a conflict or propose an explicit version restoration. Never erase later unrelated changes when undoing an earlier title change. If arbitrary model-generated changes cannot be safely inverted, say so and provide a non-destructive restore-as-new-version option.

Apply source writes and their edit-log transition within one owned transaction or recoverable journal. Hold the correct writer lock across compare, patch and publication; locking only the log append does not prevent lost source updates. Identical action ID plus identical payload is a retry. Identical ID plus different payload is a conflict, not successful deduplication.

## U8. Bind every preview and pointer target to the rendered revision

A render receipt names the edit ID, accepted source/score/look digests, build job/attempt, media settings and output checksum. Only a receipt matching the requested revision may move the edit to `rendered`. An old nonempty MP4/PNG is not evidence of the new edit.

A pointer/annotation attaches to the displayed render revision and corresponding time mapping. A stale element index cannot be silently used against the new picture. Region-only fallback may preserve the user's note, but it does not authorize applying it to an unconfirmed different object. Show the conflict with the original annotated frame and a path to reselect.

## Revision 2 handoff requirement

Update the relevant row in [INTEGRATION_CLOSURE_MATRIX.md](INTEGRATION_CLOSURE_MATRIX.md) with actual source wiring and pending case IDs. Read only the applicable [rule migrations](RULE_MIGRATION_MAP.md) and [reference decisions](REFERENCE_REUSE_MATRIX.md). These documents do not authorize testing.

## Package navigation

[Coordinator and global policy](00_EXECUTE_IN_ORDER.md) | [Source ledger](RESEARCH_SOURCES.md) | [Deferred cases](DEFERRED_TEST_MATRIX.md).

Next: [Recoverable production, security and trustworthy provenance](11_RELIABILITY_SECURITY_AND_PROVENANCE.md). Continue after integration; do not run pipeline tests between stages.
