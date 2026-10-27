# Continuity ownership and the dependency graph

One accountable owner per **continuous action**, never one worker per scene. `scripts/lib/continuity-plan.mjs` (`planContinuity`) computes the groups from data the film already has; it never dispatches, spawns or calls a model. The scheduler (crew) consumes the result.

## What joins shots into one group (temporal)

- A signature event that spans several shots or beats (unless it is marked `continuous: false` or scoped `independent`, `refrain`, `montage`, `series`, `parallel`).
- A temporal seam in `look/continuity.json`: `same_object`, `causal_handoff`, `temporal_continuation`. A `visual_analogy` and a `deliberate_discontinuity` never join.
- A non-static object flagged `temporal: true` (a carried word, a character, a prop in contact across cuts).
- A shared anchor or region crossing a boundary (a typographic rule, grid cell, field), unless it is `static` or `continuous: false`.
- An explicit plan assignment naming several shots for one owner.

## What does not

A shared **static** asset (font, logo, palette, icon, texture, or anything with `creates_temporal_dependency: false`) is read concurrently by every group. It is listed in `shared_static_assets` and is never an edge that forces an owner. An object that shows up in separate groups with no temporal link produces the warning `object_shared_without_temporal_link`: mark it static or temporal.

## Output

`{groups, dependencies, ready, cycles, blocked, shared_static_assets, errors, warnings, digest}`.
Each group has `id`, `shots`, `beats`, `owner`, `owner_source` (declared, derived, missing, conflict), `reasons`, `depends_on`, `state`, `priority`, `identity_digest`, `blocked_by`.
Each dependency has `from`, `to`, `kind` (job, asset, event, gate, shared_static), `ref`, `temporal`, `satisfied`, `reason`.

- **Owner.** From the events' `continuity_owner`, the assignment, or the object `owner`. A required event with no owner, or two different owners for one action, blocks the group with `owner_missing`. A group with no required event gets a derived owner.
- **Ready.** A group is ready when it has an owner, no unmet dependency (jobs complete, gates approved and current), and no cycle. `ready` is ordered by risk: the group with a required event and the most shots goes first, and is reviewed before broad dependents start.
- **Cycles.** `continuity_cycle` with the chain. Repair: separate shared static assets from temporal dependencies, or assign the whole dependent sequence to one owner. Nothing in the cycle is built meanwhile.
- **Missing shared asset.** Blocks exactly its dependents (`stale_input`, `approval_missing`). Never substitute another visual mechanism to keep going.

## Jobs and resume

`createJob` accepts `continuity: {group_id, owner, depends_on, identity_digest, event_ids, object_ids, shots}`. A legacy job has none of this and is byte-identical. `identity_digest` (object, event, owner and score digests of the group) joins the job id only when given. `commit` and `accept` take `current_identity_digest`: a result built on an older identity is refused (`identity_changed`) even if the filename matches. `cancelObsolete({stale_groups})` cancels only that group's jobs; `staleByIdentity(run, {group: digest})` lists what to rerun; `dependencyState(run, jobId)` says whether a job's edges are met; `groupProgress(run)` summarises groups. Recovery resumes from these durable records, not by rerunning every scene.

## Boundary contracts and editorial breaks

Store entering and exiting object state, visibility, transform, velocity, depth order, camera, audio cue and the exact score interval. A cut that intentionally breaks spatial continuity is recorded as `deliberate_discontinuity`; do not require false physical matching.

## Cost and resource hand-off

`admissionHandoff(plan, {max_concurrent, reserve_integration, est})` returns batches of ready groups (one slot reserved for integration and review), each with an `op_id` (`continuity:<group_id>`) for `reserveBudget`. At low concurrency independent groups are batched; a group is never split to fill idle slots.

Existing parts reused: `CONTINUITY_TYPES`, `seamRelation`, `isTemporalLink` (`continuity.mjs`), `resolveOwnership({continuity})` (`creative-handoff.mjs`), the jobs DAG and budget reservations (`jobs.mjs`). Anchor and region IDs come from `composition-anchors.mjs`; owner shape from the event commitments (`creative-contract.mjs`).
