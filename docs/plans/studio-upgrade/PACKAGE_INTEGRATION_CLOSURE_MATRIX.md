# Integration closure - prove wiring in source before requesting tests

This matrix specifies handoff evidence. It does not claim any feature exists or works. The lead fills actual local paths/symbols and references the implementing commit/diff; source inspection is not a test pass. This avoids a late handoff consisting only of isolated helpers or prompt files.

| Plan | Producer/entrypoint to locate | Persisted or returned artifact | Required consumers to wire | Source-level handoff evidence |
|---|---|---|---|---|
| 01 | Existing session/action and crew policy boundaries | Stage/policy/approval versions | Engine, native models, browser console | Same stage and authority mapping; no second writer |
| 02 | Brief/source researchers and brand intake | Brief + evidence projection | Story writer and native Brief | Claim/capture/qualifier identities retained |
| 03 | Existing story generation/check CLI | Treatment + semantic coverage | Story cards, editor, later board planner | New grammar accepted without obsolete mandatory fields |
| 04 | Existing design selection/compiler | Chosen look + relevant recipe rules | Look cards, board/scene packets | Same comparison content; chosen look digest propagated |
| 05 | Frames/score/timing reconciliation | Approved storyboard snapshot | Animatic, builder, captions/audio | One timing authority; versioned interpretation of scratch audio |
| 06 | Scene/motion/hybrid providers | Prepared assets + scene modules | Render graph and inspector | Real configured route reaches adapter; missing capability explicit |
| 07 | Voice/music/SFX and score integration | Stem/cue manifests | Animatic and final mix/delivery | Current audio revisions consumed; no stale filename reuse |
| 08 | `crew.mjs brief`/skill map policy | Bounded worker packet + receipt | Actual agent dispatch | Compiled packet is used, not merely written beside old prompt |
| 09 | Existing crew/supervisor/render entrypoints | Jobs, reservations, cache receipts | Scene/render workers and progress UI | No old bypass route still launches unbounded work |
| 10 | Native/browser edit actions | Transaction and target render identity | Source patcher, preview player, Undo | Source writes and Undo share concurrency protection |
| 11 | Existing supervisor/export containment | Recovery journal + provenance | Resume, render launch, delivery | Startup/recovery reads same durable state as normal execution |
| 12 | Existing export/variant commands | Versioned output/package manifest | Native export and selected editor adapter | Export uses accepted revision and permitted dependency closure |
| 13 | Existing benchmark/lessons hooks | Dormant corpus/rubric/report machinery | User-approved Plan 14 runner | Cases registered without being executed by build or hooks |
| 14 | User-approved batch controller | Real evidence tied to candidate | Validation report, capability acceptance | Empty/missing approval prevents dispatch |

For each row also record `existing_path`, `changed_symbol`, `caller`, `consumer`, `input_revision`, `output_version`, `error_path`, `optional_dependency`, `deferred_case_ids`, and `implementation_status`. A future dependency is an explicit interface dependency with an owner, never a hidden stub that returns success.

Cross-stage interface ownership is frozen in 01: timing (05/07), scene/render (06/09), packet/cache/job (08/09), revision/transaction (10/11), and provenance/export (11/12). Keep implementations in existing modules where possible. Do not create generic framework layers just to fill this table.

After 13, use these receipts to prepare the test approval request. Missing core wiring is an implementation blocker. Missing optional external software is a capability blocker with a disclosed fallback, not grounds to secretly drop a requested feature.