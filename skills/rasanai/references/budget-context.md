# Budget, context and progressive commitment

Status: implemented_unvalidated. All figures are proposed starting values or estimates; no saving percentage or film price is claimed. Observed usage (`lib/usage.mjs`) is kept apart from estimates and reservations.

## Progressive commitment (`budget.mjs commitmentGate`)

Brief > Story > Look > Storyboard/animatic > Build > Final is unchanged; no screen is added. Before Story approval: a small concept pool and evidence sufficiency only. Before Look approval: compact representative look samples, not a film per style. A rejected or still-pending option is never animated or built. After Storyboard approval and production authorization, `orderDefiningAction` runs the most uncertain defining action (one bounded attempt, one review round) before its dependents; independent ready work is not starved. A tiny authorized sequence does not authorize the whole film (`authorization.scope`).

## Reservations (`reservationPlan`, `transferUnused`)

Phases: development, proof_assets, production, review, repair, as shares of the person's own limit (null limit = shares only, nothing invented). Unused capacity moves forward only, never below the review/repair floors, never above the limit.

## Context (`packets.mjs`)

Mandatory event, proof, claim, qualifier, copy, privacy and pin content is never truncated. Pressure only moves optional material by reference and lowers the number of attached mechanisms (`mechanismSectionsFor`, from W07 `mechanismPacketSection`, original-first, reference-only). Receipt `context` is labelled `basis: estimate`. The packet digest gains `mechanism_digest` only when mechanisms attach, so legacy digests and `PACKET_VERSION` (1) are unchanged.

## Admission and retries (`resource-pools.mjs`)

`creativeAdmission` = commitment gate, then spend/authorization disclosure (`spendDisclosure`), then the existing `preAdmission`. `classifyFailure` separates capability failure (`capability_unavailable`) from insufficient spend (`budget_exhausted`). `retryDecision`: an identical failure is diagnosed before any retry or new worker; spend exhaustion stops and preserves outputs. On shortfall `budgetTradeoff` states the real tradeoff and keeps the central mechanism; cheaper cards never keep the ambitious label.

## Telemetry (`usage.mjs creativeTelemetry`)

Counts only (candidates, accepted/rejected before build, events, continuity groups, retries, tool errors, stale results, invalidated work), requested vs actual model, context estimate; no credentials, private text or reasoning traces.

## Deferred acceptance specs (authored, not run)

- BUD-01: `commitmentGate({kind:"production",option:"rejected"}, ...)` -> admit false, defer says concept stays compact.
- BUD-02: `spendDisclosure({tokens:N}, {limit_tokens:<N})` -> admit false, `budget_exhausted`, `budgetTradeoff` offered; no spend.
- BUD-03: compile a packet with a qualifier and a tiny `packet_budget` in `productionPolicy`: `pressure.pressure` true, qualifier present verbatim, `context.mandatory_truncated` false.
- BUD-04 / POL-06: `allocate({role, policy:{resources:{model:{choice:"sonnet"}}}, requested:"opus"})` -> `fast:false`, `model:null`, `requested_ignored`; no escalation after a failed attempt.
- BUD-05: `retryDecision([sameFailure], sameFailure)` -> `retry:false`, diagnose first, `new_workers:false`.
- BUD-06: `orderDefiningAction` puts the uncertain defining job first, dependents held, independents ordered next.
- BUD-07: `creativeTelemetry` with only `context_estimate_tokens` -> `estimates.basis:"estimate"`, observed counters null.
- BUD-08: `researchCapacityPlan({pace:"fast"})` -> reduces breadth/redundancy, keeps concept development and approvals.
- EDGE-09: `spendDisclosure({provider:"x", transmits:true}, {providers:[]})` -> admit false, `approval_missing`.
- EDGE-10: `commitmentGate({kind:"production",sequence_id:"s2"}, {authorization:{scope:"sequence",ids:["s1"]}, approvals:all})` -> deferred.
