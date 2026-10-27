# Implementation report: RasanAI Creative Recovery (integration lead)

**State: `implemented_unvalidated` / `awaiting_test_approval`.** Syntax only (`node --check` on every changed `.mjs`). No test, script run, render, network, model call, commit, install or build. No test approval exists; `TEST_APPROVAL_REQUEST.md` is a request, not permission.

## What is wired

Gate: `crew/plan.json` `creative_policy_revision: 1`, set by `crew.mjs plan` for a NEW plan on a `DIRECT_ROUTES` route that is not footage-led (`--creative-policy 1|off` overrides; a re-plan keeps the saved value, so a legacy run never gains it). No UI field, no new stage key or action. Legacy plans take the old branches unchanged.

1. **Consent**: `contextFor` calls `productionGate(..., {strict:true, contexts})` and `storyboardBoundary(..., {requireConsent:true})`; `scripts/storyboard.mjs` and `pinInputs` follow the plan's marker (`--source-action` for an inherit note). Heroes need the Story consent, boards / frame / art / motion need Story + Look, build needs the Storyboard approval. Prepared files, a Claude-closed `done`, raw or unconsumed actions are not consent. `graph.mjs` untouched.
2. **Plan shape**: a `creative-brief` Director phase, `creative-revise-story` / `creative-revise-look` phases, no builder-drawn boards on lean (post-Look `styleframe-designer` + one `frame-juror` pass kept), brand / series Look staged as a confirm instead of a Director-closed `done`, a branded film's styleframes call becomes a show.
3. **Creative inputs**: `crew.mjs creative init|check|revise|gate|status`; automatic `creative/references.json` from the local index (text-only limits stated; no question to the user); provisional `creative/brief.json` skeleton that holds writers and later roles until filled; new brief revisions after Story / Look / Storyboard with confirmed pins only, previous revisions kept; `design.mjs compare-plan` carries `creative_intent`; `frames.mjs refs` adds lawful reference stills; `film.look_style` written at `frames.mjs init`.
4. **Proof**: `story/proof-contracts.json` (writer output), `validateProofContract` mechanical errors and `requiredReviewInputs` into the script-editor context, `story/proof-review.json` validated with `validateProofReview`, two new concept-check keys.
5. **Handoff / trace**: packets get `profile` (with derived `vision`) and approval pins; dispatch `ctx.creative` / `ctx.references` (`creativeSlice` pointer, `referencePacket`); Motion Director check verifies `creative/execution-map.json`; builder checks require produced artifacts or declared deviations (`validateCreativeHandoff`); `--observed-reads` records the supervisor's image reads on the receipt.
6. **Craft policy**: `checkShots` / `checkVerdict` / frame-gate get a `creativePolicy` (look style class, real bindings); `review` severity is surfaced as notes, not problems; `validateMoves` gets `creativePolicy` + `profiles` at the crew's move-inventor check.
7. **Review and Final**: the frame juror's `creative/reviews/storyboard-r<N>.json` is required and validated (stale against board digests, evidence, independence); the film critic's `creative/reviews/final-r<N>.json` is required for `ship`; `crew.mjs creative gate --stage final` reports `not_reviewed` instead of a pass.
8. **Loading**: `skill-map.mjs` `CREATIVE_DEEPER` (scene routes only), `SKILL.md` paragraph, "New creative policy" sections in the phase guides, new `references/creative-examples-teaching.md` (copy of `04_CREATIVE_EXAMPLES.md`, header added).

## Files changed by the integration lead

`scripts/crew.mjs`, `scripts/design.mjs`, `scripts/frames.mjs`, `scripts/skill-map.mjs`, `SKILL.md`, `references/workflows/*` (brief, story, look, art, animatic, final, shared-contract, source-safety, failure), new `scripts/lib/creative-run.mjs`, new `references/creative-examples-teaching.md`; minimal module fixes in `scripts/lib/look.mjs`, `scripts/lib/storyboard.mjs`, `scripts/storyboard.mjs`, `scripts/lib/packets.mjs`, `scripts/lib/creative-handoff.mjs` (listed in `KNOWN_LIMITS.md`). Docs: the five files in `docs/plans/creative-recovery/`.

## Blocked / partly blocked

See `INTEGRATION_RECEIPTS.md` rows 5, 13 and `KNOWN_LIMITS.md`: one-look Look confirm cannot use `look-payload` (three systems only; native rendering unverified); the final boundary is workflow + critic-check enforcement, not a hard stop in `console.mjs` / `finish.mjs` (frozen / out of scope); `scripts/moves.mjs check` and `graph.mjs` unchanged; all reference rows are text-only.

## Open risks

Fail-closed gates may stall a new-policy run if the Studio actions do not match the lane's reading of `session.json` / `consumed.json`; a model-written brief, proof review or review envelope can be well-formed and wrong; every runtime behaviour, prompt wording and the lane tests are unexecuted; an installed Studio runs its bundled (stale) engine, which has none of this.

Digests of this candidate are in `TEST_APPROVAL_REQUEST.md`.
