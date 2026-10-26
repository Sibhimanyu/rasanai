# Known limits and open risks

Status: `implemented_unvalidated`. Everything below is from static reading; no behaviour was run.

## Process deviations (disclosed)

- **W02 ran a read-only import of `creative-references.mjs`** to validate its index. That breaks the no-run rule of `00_RULES_UI_AND_TESTING.md` (no script or module execution before approval). It was read-only and wrote nothing, but it was a run. Nothing from it is evidence; the module and index are treated as unvalidated.
- Inert profile ids: `living-ground`, `finish-layer`, `late-peak` are named in lane text (craft / moves guidance) but nothing selects them: no schema field, no check, no code path reads them. They are documentation-only until a later change defines where a profile is selected (the integration only passes `brief.profiles[]` / the moves file's `profiles[]` to `validateMoves`, whose profile ids are `atom-mining`, `bridged`, `full-frame-hero`, `dense-chain`).

## Deployment

- **Stale installed bundle.** Studio runs its bundled engine. Editing this checkout does not change what an installed Studio (or any `~/.claude/skills/rasanai` copy) runs, and `creative_policy_revision` is only set by this `crew.mjs`. A run started by a stale bundle gets no marker and the legacy behaviour; that is a deployment issue, not a creative failure. The version this candidate would report is `skills/rasanai/VERSION` = 1.27.0, unchanged (no release, no bundle build, no appcast).
- No build, package, install or hook was run.

## Lane guesses that were wrong or unverifiable (checked against real code)

| Guess | Reality at HEAD | Handling |
|---|---|---|
| plan shot-assignment field (`plan.assignments` / `shot_groups` / `groups` / `tasks`) | `crew/plan.json` has none; a task key is a scene number (`3`), a board range (`4-6`, or `1-N` when the scene count is unknown), or a role key (`film`, `lead`, `score`, `seams`, `frames-1`, `film-1`, `Sure`, `Set`) | `resolveOwnership` fixed: `1-N` is whole-film; only `scene-animator` and `frame-designer` keys are shot-scoped (`packets.mjs` `SHOT_SCOPED`, `buildCreativeInputs`); other roles get the whole film's intent; the unresolved-key blocker is raised only on a run with `creative/brief.json` (it would otherwise have changed legacy packets) |
| board path fields (`board`, `board_png`, ...) | real boards are `frames/<id>.png` and `frames/<id>.html`; `shots.json` shots carry no board path | the lane's fallback `frames/<id>.png` matches; no change |
| `profile.vision` | model profiles (`lib/models.mjs`) have no `vision` field | `visionOf(prof)` in `crew.mjs`: false only for harness `"other"` or an explicit `vision:false`; passed as `profile: {...prof, vision}` for new-policy plans only |
| session `unconfirmed` marker | `session.json` has no such field; closing a step the user answered records `by: "user"` (`console.mjs` push), a Claude-closed step has no `by` | `resolveStageConsent` already requires `status:"done"` and `by:"user"` plus a consumed `choose/approve/submit` action; the `unconfirmed` test is dead code, harmless |
| selected story id (`chosen.json` `id` / `story_id`) | `chosen.json` is written by the Director, no fixed id field; the console's choose value may be an id, a label or an index | `stageConsentContext` now passes a candidate list (id, story_id, label, key, name); `resolveStageConsent` compares against any of them and does not compare numeric values (fail-open on the id comparison only, never on consent itself) |
| `pinInputs` takes `requireConsent` | it did not (lane note was only in the request) | `lib/storyboard.mjs` `pinInputs` now accepts and forwards `requireConsent` / `consent`; `scripts/storyboard.mjs` derives strictness from `crew/plan.json` and takes `--source-action <id>` for an inherit note |
| brief approval has a resolver | `resolveStageConsent` covers story / look / storyboard only | `approvalPins` pins the Brief only when a Story consent exists, with `legacy_basis` naming that consumed action |

## Behaviours that are implemented but could not be made complete

1. **One-look Look confirm (brand / series / lean) is not expressible through `design.mjs look-payload`** (it dies unless exactly three systems exist). The integration changes the brand and series Director steps to push `look` with status `awaiting` and wait for the user's consumed action; how the native Look card renders an `awaiting` Look with no `styles[]` is unverified and the native source is frozen. If it does not render, the new-policy brand / series path stalls at the gate (fail-closed) rather than skipping the user. Narrow blocker, no UI edit.
2. **A series (or any run) whose Story / Look the Director auto-chose** is never treated as approved on the strength of an `inherit.reason` note: it needs a consumed action id (`--source-action`) or the user's confirm. Series films therefore ask for a confirmation they did not need before.
3. **The final publication boundary is a workflow + critic check, not a hard stop.** `crew.mjs creative gate --stage final` reports `not_reviewed` / `needs_user` / `blocked` and exits 2, the critic check refuses a `ship` without a ready, observed-image review, and the Final guide says to label the result honestly. `console.mjs` and `finish.mjs` (frozen / outside the integration files) do not call it, so a Director that skips the step is not stopped by code.
4. **Review envelopes are written by agents.** `independent_of_builder` and `observed_refs` are the reviewer's own statements; the supervisor can add `--observed-reads` to the packet receipt but nothing proves an image was understood. `checkCreativeReview` only validates form, currency and evidence kind.
5. **Proof protection against boards is partial.** `protectedText` is passed to `checkShots` only for a contract that carries explicit `shot_ids` (no guess from a beat name). Meaning is the script editor's job (`validateProofReview` checks completeness and currency, never correctness).
6. **Text-only references.** Every row of `library/creative-reference-index.json` has `media: []` (lane note); no run can have a visual reference until a lawful media entry is added. References teach principles and cannot certify visual parity.
7. **`graph.mjs` stays on legacy.** `creative-*` phases are Director-only nodes tagged with a `stage`; the scheduler never gates on them. Build readiness in the graph is derived from the existing approvals, so a graph state of "ready" can precede `contextFor`'s stricter refusal; the refusal (`die`) wins at dispatch.
8. **`scripts/moves.mjs check`** (standalone CLI) was not changed; only the crew's `move-inventor` check passes `creativePolicy` to `validateMoves`.
9. **Animatic-then-build order.** The guides say Build follows the user's animatic approval; the plan also has an `animatic-draft` push of the built film. On a new-policy plan the phase text now says the Storyboard was approved before the build. If a real run builds before any Storyboard approval, `film-builder` / `scene-animator` dispatch is refused until it exists.
10. **Native consumers of `crew/plan.json` / `session.json`** (frozen Swift) were not inspected for the new additive keys (`creative_policy_revision`, the `creative-*` phase names). JSON key additions are expected to be ignored; unverified.
11. **Packet size.** Mandatory creative sections are never shortened; on a large film the packet can pass the 60% budget guard for optional slices only (they go by reference). Effect on token spend is unmeasured.
12. **Lane test files** (`scripts/tests/creative-recovery/`) were authored against guessed API shapes (listed in their `manifest.json` `unknowns`); they were not updated for the integration's module fixes and were not run.
