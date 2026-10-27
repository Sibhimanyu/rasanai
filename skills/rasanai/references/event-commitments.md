# Event commitments: making the approved promise binding

Applies to briefs with `creative_policy_revision >= 2`. Revision 1 briefs validate and travel exactly as before. Everything here is additive and structural: it grants no approval, consumes no approval action and never calls a model. `signature_events` (creative/brief.json) stays the only event collection; extension data refers to its ids.

## Where commitments live

- The selected treatment declares what it promises: `extensions.creative_thinking.commitments[]` = `{id, requirement: required|supporting, kind?, label?, beat_ids?, event_id?, deferred?, phase?}`.
- An event answers a commitment by `event_id` on the commitment, by `commitment_ids` in the event's `extensions.creative_thinking`, or by sharing its id.
- A film that deliberately has no discrete signature action declares `extensions.creative_thinking.commitment_basis` on the brief: `{kind: "intentional_no_discrete_event", reason, commitments:[{id, must_preserve, review_method}], commitment_ids:[treatment commitment ids it covers], approval_source, unresolved_event_ids: []}`.
- Event extension (additive, per event): `requirement`, `state` (proposed|bound|implemented|reviewed|unavailable), `scope`, `narrative_purpose`, `medium_commitments` or `capability_state`, `object_ids`, `continuity_owner`, `interval_s`, `audience_reads[{id, window_s:[start,end]}]` (score seconds, ordered read references), `review_plan{method, interval_s, limitations}`, `evidence{artifact_digest, produced_artifact_refs, review_ref, observed_refs}`, `evidence_boundary`.

## What each phase requires of a required event

| Phase | Must be present |
|---|---|
| proposal | nothing; unresolved ideas are allowed and never approved |
| story | id, before/change/after, `narrative_purpose` (the defining event of the chosen treatment is bound, not deferred) |
| look | plus `medium_commitments` or `capability_state` |
| storyboard | plus shot ids (or beat ids with `interval_s`), `audience_reads`, `object_ids`, one `continuity_owner`, `scope`, `review_plan` |
| build | all of the above, `state` at least `bound`; gaps are errors, not warnings |

Supporting events owe only structure. Gaps before the phase are warnings.

## Reconciling (`reconcileCommitments`)

`reconcileCommitments({treatment, events, absences, pins, phase?})` returns `{bound, unresolved, intentionally_absent, incompatible}` (commitment ids) plus `details`, `problems` (each names the commitment, treatment, beats, the responsible phase and the repair) and `quiet_film`. Rules:

- bound: an event answers it and, when `phase` is given, that event has no binding gap.
- intentionally_absent: a `commitment_basis` that lists the commitment id explicitly, names alternatives with must_preserve and review_method, defers nothing and whose `approval_source` matches a current approval pin (digest or source_action_id).
- unresolved: no event and no approved absence (a "deferred" note is exactly this), an absence that is not approved, or an event with gaps for the phase.
- incompatible: bound and also declared absent; the only bound event is `unavailable`, was downgraded to supporting, or sits on other beats than promised. Material changes go through the current stage revision and consent resolver.
- No keyword is read from any reason string. A quiet film passes only when `quiet_film.passes_as_quiet` is true (no events, nothing required open, resolved basis).

An empty `signature_events` is valid for a deliberate editorial film. It is incomplete when a treatment commitment is still open, when the basis is unapproved at build, or (at build) when there is neither a basis nor a `signature_events_reason`.

## Truth rules

- `state: implemented|reviewed` needs digest-bearing `evidence`; the enum alone is a claim, labelled `claimed_state_is_claim` in packets and the review packet. Evidence citing a digest outside `currentDigests` is `stale_input`.
- An execution map with matching ids proves traceability only. Handoff findings carry `semantic: "not_assessable"`.
- A structured material deviation (`{material:true}` or `kind: capability_blocked|deviation_requested`) or ids in `capability_blocked_events` / `deviation_requested_events` on a required event is the error `material_deviation`; it is never fulfilled and never silently substituted.
- Editorial causality is not product causality: keep `evidence_boundary` with the event, and keep protected entities, quantities and conditions under the existing proof-integrity checks.

## Wiring status (proposed; the lead applies)

Interfaces are in `lib/creative-contract.mjs` (`reconcileCommitments`, `validateEventCommitments`, `resolveIntentionalAbsence`, `eventBindingGaps`, `treatmentCommitments`) and `lib/creative-handoff.mjs` (`resolveOwnership` continuity groups, `buildCreativeInputs` sections `event-commitments`, `ordered-reads`, `continuity-ownership`, `buildReviewPacket` commitments). `validateCreativeBrief` and `creativeReadiness` call them for revision 2. creative-run.mjs must pass `treatment`/`absences` into `creativeGate`; crew.mjs `creativeTraceProblems` must replace its empty-event return (see the lead report).

## Deferred cases (specs, not run)

| Case | Setup | Expect |
|---|---|---|
| EVT-01 | rev 2 build brief, `signature_events: []`, treatment commitment `c1` deferred, no basis | `c1` unresolved; error `required_commitment_unbound` naming treatment, beat and `story`; not quiet |
| EVT-02 | empty events, resolved `commitment_basis` covering the quiet-film commitments with a current pin | `passes_as_quiet: true`, no error; review packet carries `review_basis` |
| EVT-03 | required event at storyboard with no `continuity_owner` or shot/interval | `owner_missing` / `required_commitment_unbound` before scheduling |
| EVT-04 | handoff result with `capability_blocked_events` or `{material:true}` deviation for a required event | error `material_deviation`; finding `materially_deviated` |
| EVT-05 | mapping with a non-material declared deviation text (easing) | no error; warning path only, `trace_only` |
| EVT-06 | correction changes a protected quantity | not in this module: existing proof-integrity check still errors independently |
| EVT-07 | `state: reviewed` with no evidence | error `state_unevidenced` |
| EVT-08 | event binding edited after approval with no consumed action | pin digest mismatch: `pin_stale` from existing `creativePinsCurrent`; absence approval no longer matches a current pin |
| TMP-01 | `audience_reads` window `[4,2]` | error `bad_interval` |
| TMP-02 | reads on an old score revision | not here: W05 `normalizeReads` marks stale; this module only checks ordering |
| TMP-03/04/05/07 | reviewer judgments | no structural check; `ordered-reads` and `review_plan` are delivered to the reviewer |
| TMP-06/08 | recurring subject, held ending | no rule here; nothing flags recurrence or a quota |
| REV-03 | execution map with matching ids, self-reported success | handoff finding `semantic: not_assessable`, `traceability: true`; never a pass |
