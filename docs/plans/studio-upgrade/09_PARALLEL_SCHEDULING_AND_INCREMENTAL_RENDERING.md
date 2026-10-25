# Plan 09 - Parallel production scheduling and incremental rendering

**Repository:** `Sibhimanyu/rasanai`  
**Executor:** Sonnet implementation lead and scoped Sonnet workers  
**Sequence:** 09 of 14 implementation stages; coordinator is Plan 00  
**Prerequisite:** Plan 08 integrated as implementation, not yet pipeline-tested.  
**Research snapshot:** 2026-10-25; public HEAD inspected at `20ea14748daaee007cb4eaf5ba8aee91c09b1c4a`. Local HEAD wins.

## Execution and verification policy

Implement this plan inside the actual RasanAI checkout. Read `00_EXECUTE_IN_ORDER.md` and the predecessor handoff first, then only the repository files relevant to your assignment. Preserve existing working features and uncommitted changes. All proposed filenames/APIs below must be reconciled with the local checkout; extend an equivalent existing implementation instead of creating a duplicate.

**Testing requires the user's explicit approval, including in Plan 14.** Implement Plans 01-13, integrate the changes, and author fixtures/tests without executing them. Then stop at `awaiting_test_approval`, report the implemented candidate, and present the proposed testing scope, commands and resource/usage implications. Do not enter Plan 14 automatically. Only a subsequent explicit user instruction approving testing authorizes its agreed scope; this plan, silence, a general instruction to continue implementation, or approval of a film's Story/Look does not.

Until that approval, no unit/integration suites, agent film trials, browser/render smokes, GUI QA, live provider probes, end-to-end runs or benchmarks may run, whether directly, through workers, hooks or CI. Read-only inspection, syntax/schema parsing, type checks and compilation remain permitted only when they execute no tests, workflows or runtime probes. Hold any operation that would trigger tests; do not disable safeguards to bypass them. Record implementation as `implemented_unvalidated`. Preserve normal product runtime safeguards and creative approvals. See [Testing approval gate](TESTING_APPROVAL_GATE.md).

The implementation lead owns shared entrypoints and schema changes. Use parallel Sonnet workers for genuinely independent file-owned tasks; do not manufacture concurrency or let workers edit the same shared files. No remote push, public release, paid dependency purchase, new paid generation, destructive migration or permission escalation is authorized by this document alone.

## Repository entrypoints to locate

Start with these current or previously documented locations; verify their local equivalents before editing. Read only the symbols relevant to your assigned lane. Shared entrypoints remain lead-owned.

- `skills/rasanai/scripts/crew.mjs`
- `skills/rasanai/scripts/lib/slot.mjs`
- `skills/rasanai/scripts/finish.mjs`
- `skills/rasanai/scripts/video.mjs`
- `skills/rasanai/scripts/reel.mjs`
- `skills/rasanai/references/film-events.md`

## Outcome

Reduce elapsed production time through independent jobs, reuse and changed-region work, without multiplying creative inconsistency or renderer contention. Extend any Hybrid Film Studio graph/cache implementation already present. Do not build a second scheduler, cache or writable timeline when equivalent code exists.

The lead implementing this plan may use many file-disjoint workers. The runtime scheduler being implemented must choose a useful production crew for each film, not blindly launch 8-12 agents for every short video.

## P1. Compile a dependency graph of actual production work

Derive jobs from approved artifacts and capabilities. Nodes include research/capture, treatment, look specimens, storyboard groups, asset preparation, voice/music, scene groups, render fragments, compositing, mix, finishing and delivery. A node declares inputs, outputs, owning role, resource class, prerequisites, approval dependencies, cache policy and estimated resource demand.

Only ready nodes may run. Storyboard jobs require the chosen Story and Look revisions. Final scene builds require approved storyboard inputs. Script-independent asset preparation can overlap where permission and input readiness permit; it cannot invent the story in advance.

Keep one owner for the overall story, shared components, timing authority and integrated film. Scheduling a task does not give it permission to rewrite its upstream decision. User waiting states are real barriers, not reasons to fabricate an approval.

## P2. Partition by continuity and work size

Group strongly coupled shots under one builder: continuous camera moves, shared simulations, character interactions and persistent objects across cuts. Independent product demonstrations with explicit entry/exit contracts can be parallel jobs.

A boundary contract specifies semantic objects, positions/units, camera/crop, scale, color treatment, start/end time and, when continuity requires it, velocity and transform state. Do not make every boundary a continuous morph; a purposeful cut is a valid low-coupling boundary.

Use task-size thresholds to avoid agents that spend more time loading context than doing work. A simple sting may need one builder. Start ordinary multi-shot production with roughly 3-4 ready build workers, and expand only when ready independent tasks, provider capacity and observed throughput justify it. These are configurable starting policies, not measured optimal values.

## P3. Separate resource pools

Maintain independent limits for model jobs, browser capture, video rendering, encoding and optional neural generation. Reuse the existing cross-process render slot limiter; account for renderer-internal workers so concurrency is not multiplied invisibly.

A machine running several films shares the heavy-resource pool. Respect memory pressure, provider throttling, queue age, budgets and user pause. Never disable the render limiter just because the agent cap is high. Prioritize interactive revision previews over noncritical background variants without starving long tasks.

A deterministic supervisor monitors processes and emits progress. Do not keep an LLM repeatedly polling a file or waiting for an encode to finish. Use actual completion signals and existing transport to update Studio.

## P4. Make jobs resumable and stale results rejectable

Each job records an ID, attempt, input/approval digest, lease owner, lease generation/fencing token, start/checkpoint/completion state, output manifest and provider job ID where present. The lead's acceptance operation is compare-and-swap against the expected generation and input digest.

A heartbeat alone is not enough to authorize publication: a paused old worker can wake after a replacement starts. Only the current lease generation may commit its result. Stage into a private temporary output and atomically publish after ownership checks. Preserve logs for the rejected stale attempt.

Use bounded retry/backoff for transient failures. Do not blindly repeat a provider submission after a timeout; reconcile its known ID or enter `unknown_outcome`. Retry only when duplicate cost/work is controlled or explicitly approved. Cancel obsolete local work promptly when an upstream revision invalidates it.

## P5. Compile render dependencies from the existing authority

Derive the render graph from `motion/score.json`, route-specific cut authority, scene code, asset manifests and approved layer/effect settings. `motion/events.json` remains derived and is rebuilt through its existing exporter. The graph never becomes a second editable score.

Include transitive dependencies: shared font/component changes affect all consumers; a text change can affect layout; a time change can affect adjacent transitions, music, masks, captions and procedural motion. Unknown dynamic dependencies trigger conservative invalidation. Never report an unaffected cache hit merely because a scene filename stayed the same.

A content key includes normalized source/configuration, source-byte hashes, relevant upstream keys, runtime and tool versions, fonts, seeds, dimensions, rational frame rate, local and global time origins, color/alpha conventions, shutter/grade and codec settings. Exclude secrets, random temp paths and wall-clock timestamps unless they actually define intended output.

Store verified artifact checksums and media specifications separately from rebuildable cache indexes. Publish atomically, pin active/final outputs, and enforce disk limits without deleting in-use data. Cache namespaces must not reveal unauthorized media across projects.

## P6. Implement changed-region rendering honestly

Do not assume HyperFrames supports arbitrary full-film frame ranges. Inspect the installed API/documentation without running probes now; implement a capability boundary and defer real behavior verification to 14.

Preferred paths are, in order: existing verified scene/fragment support; an isolated scene/group host preserving exact time and dependencies; a full continuity-group rerender; finally a full-film rerender when correctness requires it. A fallback is slower, not a failure to disguise.

Handle transition overlaps and motion-blur shutters by rendering the required incoming/outgoing time handles. Preserve global-time signals when isolating a scene. State-dependent effects must use a reproducible checkpoint or be grouped into a larger render; arbitrary seeking is not safe merely because a function accepts `t`.

Use consistent intermediate media specifications. Preserve alpha and premultiplication where needed. Do not blindly concatenate independently encoded MP4 segments with incompatible headers, timestamps or frame rates. Assemble at the chosen time base with verified frame counts, then encode/mux using the existing delivery path.

Keep the music/voice timeline continuous. Reuse audio when a purely visual edit leaves it unchanged; remap or remix only actual dependencies. Apply a film-wide finish consistently: either cache the appropriate pre-finish intermediates and finish once, or prove per-fragment finishing uses identical deterministic global settings and boundary handling. Never double-apply blur, grain or grade.

## P7. Progressive revision experience

Prioritize an affected-frame or low-cost preview, then the changed shot group, then final assembly. Show explicit stages: source changed, preview pending, preview ready, final rendering and final ready. Preserve the previous delivered version until a new valid file is published.

Show which work was reused and which was rebuilt, based on actual dependency results. Do not display instant success from an overlay preview before the source transaction and render have completed. Plan 10 supplies the native UI; this stage supplies truthful events.

## P8. Performance evidence hooks

Record critical-path duration, queue wait, active agent time, render/encode duration, peak memory where available, cache hits/misses and invalidation causes. Separate cold and warm results. Capture failures and total token consumption, not only successful-worker latency.

Do not assert linear speedup from worker count. Plan 14 measures bounded concurrency levels on matched tasks and selects defaults from quality, throughput and cost, not the maximum number of processes the host can launch.

## Parallel lanes

Graph compiler, continuity grouping, job/lease supervisor, resource pools, artifact cache, fragment renderer/assembly and progress telemetry are separate candidate lanes. Lead owns shared job contracts, score interactions and integration. Reuse implemented Phase 2 modules; workers fill gaps rather than fork them.

## Implementation handoff

Deliver a real scheduler used by the existing crew, bounded resource pools, coherent scene grouping, stale-output rejection, incremental render/cache integration and visible fallbacks. Register P01-P10 without running them. Plan 10 receives revision progress and job events; Plan 11 strengthens recovery/privacy and shares the same job state.

## Deferred verification

In 14 exercise 1/2/4-worker production and higher settings only when justified, verify actual overlap, compare incremental and clean outputs, seek out of order, change shared fonts, modify transition boundaries, interrupt writes, exhaust disk, pause/resume and reject late worker results. Compare output within a declared environment-specific tolerance; cross-platform bit identity is not assumed.

## P9. Make resource admission fail closed and budget-aware

Static inspection of the existing `scripts/lib/slot.mjs` shows paths that continue without a slot when the lock directory is unwritable or waiting times out, and a path that renders after a low-memory wait. Preserve useful locking code but replace silent bypass behavior in the managed production path with `queued`, `resource_blocked`, a safe cancellation, or an explicit supported lower-resource choice. A timeout is not permission to ignore the configured cap. Do not globally disable old runtime guards.

Acquire a resource bundle without deadlocks: reserve in a stable order, or atomically reserve all needed pools. A task must not hold an encoder slot forever while waiting for a browser held by the reverse dependency. Avoid nested double-counting when an outer render already owns a slot. Lease reclamation checks owner identity/generation; age alone is not proof a live long render died.

Before launching parallel model/generation work, reserve each job's budget from the same remaining allowance. Reservations include known already-running commitments and bounded repair headroom; reconcile reported actuals and release unused reservations idempotently. Unknown subscription usage stays unknown and uses conservative concurrency, not fictional dollar precision. A retry cannot obtain a second untracked reservation for the same operation.

Add admission reason codes and visible queue states. Fairness and cancellation must work across films: a new interactive preview can receive priority without starving all older jobs. No scheduler tuning benchmark runs before user testing approval.

## P10. Make cache validity explainable

For every reuse decision, record why the artifact is reusable, its producing manifest, freshness/rights conditions and source dependencies. A missing dependency declaration falls back conservatively. Reusing a rendered frame and accepting a creative decision are different operations; cache success cannot approve a storyboard or waive a claim.

Do not cache arbitrary model tool side effects as though they were pure function results. Immutable generated media can be reused; a prior successful remote submission cannot be replayed to imply a new job exists. Keep that distinction explicit in job types.

## Revision 2 handoff requirement

Update the relevant row in [INTEGRATION_CLOSURE_MATRIX.md](INTEGRATION_CLOSURE_MATRIX.md) with actual source wiring and pending case IDs. Read only the applicable [rule migrations](RULE_MIGRATION_MAP.md) and [reference decisions](REFERENCE_REUSE_MATRIX.md). These documents do not authorize testing.

## Package navigation

[Coordinator and global policy](00_EXECUTE_IN_ORDER.md) | [Source ledger](RESEARCH_SOURCES.md) | [Deferred cases](DEFERRED_TEST_MATRIX.md).

Next: [Native directing, meaningful approvals and precise revisions](10_NATIVE_DIRECTING_AND_REVISION_UX.md). Continue after integration; do not run pipeline tests between stages.
