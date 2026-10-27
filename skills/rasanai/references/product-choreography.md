# Product choreography

How a product behavior is shown, bound to approved source states. Planner: `scripts/lib/product-choreography.mjs` (`planChoreography`). Runtime helpers: `runtime/rasan-ui.js` (`U.reveal`, `U.isolate`, `U.follow`, `U.hold`, next to the existing cursor, type, drag, world). Status: implemented, unvalidated. Active only for plans with `creative_policy_revision >= 2`; the plan lands under the `product` key of the beat's entry in `creative/beat-plans.json`.

## Stages

`context -> action -> result -> isolate -> hold`. Plan only the stages the claim needs; the order is fixed, no repeats, and an `action` always has a `result`.

| Claim kind | Stages |
|---|---|
| `state` ("this is what it looks like") | context, hold |
| `capability` ("do X, Y happens") | context, action, result, hold |
| `flow` (steps plus a detail that must survive) | context, action, result, isolate, hold |
| `detail` (one value or region) | result, isolate, hold |
| `result` | result, hold |

A beat may name its own `stages`; the kind table is only the default.

## Binding rules

- Every stage names a `source_state_ref`: `{kind:"capture", id}` (an entry in `research/screens.json`) or `{kind:"demonstration", id}` (clearly labelled demonstration content, visible label required).
- The beat names a `claim_id` in the claims ledger. The planner stamps it (`stampClaim`) and carry-checks it (`carryCheck`: unknown, stale, not permitted, changed, number drift). Screens are deterministic layers from a capture (`mediaAuthority`), never generated images.
- Customer messages, testimonials, metrics, logos and social proof need a source (capture or ledger claim). They are never invented to finish an animation, and demonstration content never stands in for them.
- Anchors: each stage's window, content, highlight, supporting language and camera name anchor ids from the `composition-anchors` plan (`anchor_roles` or `anchor_ids`). Consecutive stages should share one; otherwise the planner reports a declared re-anchor. Unknown anchor ids are errors.
- Time is score seconds only. Reading floors follow content and context: orientation (a new screen costs more), words at a reading rate, an isolate re-read. They are floors, not comprehension checks; an authored window shorter than the content suggests is a warning, a stage interval shorter than its floor is an error.

## Allowed simplifications

Declared per stage; each carries its rule. `crop_to_region`, `scale_up`, `dim_non_target` (opacity only, no whole-frame blur or glow), `omit_unrelated_chrome`, `compress_wait`, `reduce_rows`, `demonstration_data`. The last three need a visible label or condition. Forbidden, and blocking: `invent_function`, `invent_message`, `invent_social_proof`, `invent_metric`, `change_result_values`, `restyle_to_light`, `fake_cursor_result`. Anything else is an error.

## Blocked states

`planChoreography` returns `blocked: true` and a `blocks[]` entry (`code`, `stage`, `capture_id` or `claim_id`, `message`) for: a stage with no source state, a capture id absent from the approved captures, an outdated or superseded capture, a digest or product-version mismatch, withdrawn/expired/unresolved rights, a `reference-only` capture, an unbound or stale claim, a forbidden simplification, an unsourced message or metric. The affected beat is blocked until the capture is supplied or an approved alternative (recapture, or labelled demonstration content) is bound. There is no silent substitute. Captures older than 180 days only warn.

## Studio UI rule

When the product is RasanAI Studio (`depicts_studio` or a RasanAI product name), every capture must be the current dark UI: dark window, left sidebar, toolbar dot stepper Describe . Setup . Brief . Story . Look . Preview . Final (`docs/brand/studio-ui/README.md`). A capture flagged `ui:"light"`, `retired_ui`, living under `archive/old-ui` or `OLD-do-not-use`, or whose text shows retired wording (Animatic, "Watch the first cut", "review the animatic", "Apply N notes") is blocked. A capture that does not declare `ui:"dark"` is blocked as unverified; real screenshots (`screencapture -l`) are preferred. The planner imports no image.

## Runtime mapping

`runtime[]` ops: `context -> mount` (a faithful rebuild marked captured with its `source`, or the capture itself), `action -> cursor/type/drag`, `result -> U.reveal`, `isolate -> U.isolate` (target at full strength, others dimmed by opacity; magnify with `U.world` keys on the shared anchor), `hold -> U.hold` (protected read; `U.check` warns when the hold is under its floor). `U.follow(el, fn)` rides an element on a shared anchor position. All are pure functions of T, so arbitrary-order seeking gives the same state.

## Proposed wiring (not applied by this lane)

ENG-INT-1: `packets.beatDeclarations/beatPlanNeeds` learn the `product` key; `writeScenePlans` writes `planChoreography(...).record` and `runtime`. ENG-INT-3: `agents/motion-director.md` names the stages, binding rules, blocked states and Studio rule above.
