# Plan 08 - Token-efficient production and selective skill routing

**Repository:** `Sibhimanyu/rasanai`  
**Executor:** Sonnet implementation lead and scoped Sonnet workers  
**Sequence:** 08 of 14 implementation stages; coordinator is Plan 00  
**Prerequisite:** Plan 07 integrated as implementation, not yet pipeline-tested.  
**Research snapshot:** 2026-10-25; public HEAD inspected at `20ea14748daaee007cb4eaf5ba8aee91c09b1c4a`. Local HEAD wins.

## Execution and verification policy

Implement this plan inside the actual RasanAI checkout. Read `00_EXECUTE_IN_ORDER.md` and the predecessor handoff first, then only the repository files relevant to your assignment. Preserve existing working features and uncommitted changes. All proposed filenames/APIs below must be reconciled with the local checkout; extend an equivalent existing implementation instead of creating a duplicate.

**Testing requires the user's explicit approval, including in Plan 14.** Implement Plans 01-13, integrate the changes, and author fixtures/tests without executing them. Then stop at `awaiting_test_approval`, report the implemented candidate, and present the proposed testing scope, commands and resource/usage implications. Do not enter Plan 14 automatically. Only a subsequent explicit user instruction approving testing authorizes its agreed scope; this plan, silence, a general instruction to continue implementation, or approval of a film's Story/Look does not.

Until that approval, no unit/integration suites, agent film trials, browser/render smokes, GUI QA, live provider probes, end-to-end runs or benchmarks may run, whether directly, through workers, hooks or CI. Read-only inspection, syntax/schema parsing, type checks and compilation remain permitted only when they execute no tests, workflows or runtime probes. Hold any operation that would trigger tests; do not disable safeguards to bypass them. Record implementation as `implemented_unvalidated`. Preserve normal product runtime safeguards and creative approvals. See [Testing approval gate](TESTING_APPROVAL_GATE.md).

The implementation lead owns shared entrypoints and schema changes. Use parallel Sonnet workers for genuinely independent file-owned tasks; do not manufacture concurrency or let workers edit the same shared files. No remote push, public release, paid dependency purchase, new paid generation, destructive migration or permission escalation is authorized by this document alone.

## Repository entrypoints to locate

Start with these current or previously documented locations; verify their local equivalents before editing. Read only the symbols relevant to your assigned lane. Shared entrypoints remain lead-owned.

- `skills/rasanai/scripts/crew.mjs`
- `skills/rasanai/scripts/skill-map.mjs`
- `skills/rasanai/agents/`
- `skills/rasanai/references/workflows/`
- `skills/rasanai/scripts/lib/models.mjs`

## Outcome

Reduce unnecessary model work without reducing the quality of the selected story or removing useful creative approvals. A worker receives a small, sufficient, current task packet, uses maintained tools for deterministic operations, and returns evidence rather than a long narration. This stage changes how the finished RasanAI pipeline spends tokens; it does not authorize production trials during implementation.

Reuse `crew.mjs brief`, `skill-map.mjs`, existing model adaptation, budget supervision, cached assets and current telemetry. Inspect the actual host's context injection, including project instructions and subagent skills; a short user prompt alone is not proof of a small model context. T01-T04 describe the relevant provider behavior, which must be checked against the installed harness.

## K1. Make the production policy explicit

Replace contradictory Fast, lean, direct and deep instructions with a shared policy object consumed by Studio and the crew. Preserve backwards-compatible settings readers. Separate these dimensions:

- Creative choices: how many treatments and looks are presented; inherited choices; explicit user overrides.
- Exploration depth: normal, limited or expanded when evidence warrants it.
- Execution resources: model selection, concurrent tasks, context budget and spend limits.
- Render quality: rough, preview or delivery; never silently relabel a rough as delivery.

A fast setting should not automatically force a different story type or remove the Story/Look distinction. Preserve the selected number of user-facing alternatives; save first by making unchosen alternatives concise. Plans 03 and 04 define the efficient default: compact treatment alternatives, one independent editorial review, and comparable representative look frames. Expand only the selected direction. A user requesting deep exploration may spend more, with the difference disclosed.

Do not invent universal token caps from character counts. Establish configurable starting budgets, record them as proposed, and calibrate in 14. A highly constrained technical brief or a long character film can need more context than a simple sting.

## K2. Compile role-specific input packets

Introduce a deterministic packet compiler at the existing `crew.mjs brief` boundary, not a second agent scheduler. A packet contains:

| Component | Rule |
|---|---|
| Shared essentials | Small safety, authority, brand, determinism and ownership contract |
| Task objective | One concrete deliverable and its acceptance conditions |
| Approved context | Only relevant claims, selected story beats, chosen look tokens and storyboard shots |
| Technique guidance | A few applicable recipes/examples, not every installed skill |
| Input references | Paths, revision IDs and content digests; explicitly identify missing inputs |
| Tool boundary | Allowed tools, writable files, immutable assets and shared interfaces |
| Output contract | Artifact paths, structured result, findings and usage where observable |

Keep mandatory factual qualifications and privacy constraints even if the packet is large. If compression would lose essential information, report the budget pressure and allocate appropriate context; do not silently truncate safety-critical material or approved copy.

Use task-aware extraction before model summarization: select JSON fields, document sections and asset metadata deterministically. If a semantic summary is needed, store it once with provenance and a source digest, then validate relevant facts against the original. Avoid repeated summarization chains that progressively alter the brief.

## K3. Retrieve skills by purpose, format and technique

The retrieval order is universal contract -> communication-kind guide -> selected visual/runtime recipe -> failure-recovery guidance only when needed. Do not preload unrelated character, 3D, footage, lyrics and renderer-adapter manuals into a flat product-launch task.

The source collection is already catalogued in RasanAI's provenance register (R06/P01-P12). Reuse existing intake and normalized recipes. Do not rediscover the same repositories for every film. Do not concatenate external SKILL.md files or import their instructions wholesale: a no-text cartoon rule and a dense kinetic-type rule are not both global requirements.

Maintain a lightweight recipe index with capabilities, required assets, supported runtime, applicable communication kinds, expected resource class, license basis and known limits. Return a bounded shortlist, not the entire catalog. Unknown or unimplemented recipes are excluded from executable suggestions unless the task is explicitly to implement them.

## K4. Replace repetitive reasoning with deterministic operations

Use scripts for asset inventories, schema validation, text-length measurement, dimension lookup, timeline arithmetic, style-token extraction, media probing, dependency resolution, file assembly and checksums. Reuse maintained rendering/motion primitives rather than asking an agent to recreate boilerplate.

Do not replace editorial judgment with a simplistic score. Choosing the main proposition, deciding whether proof is persuasive and judging a meaningful transition remain creative work. A model is appropriate when new interpretation is actually required, not merely because a subprocess completed.

Workers write source and detailed evidence to files. Return concise fields such as `status`, `artifacts`, `input_digest`, `findings`, `deferred_checks`, `usage` and `needs_decision`. The lead reads relevant artifacts on demand; it does not ingest every successful worker's code and scratch notes.

## K5. Separate three cache layers

**Artifact cache:** avoid a model invocation when the same authorized inputs already have a valid accepted result. Key on all material inputs, policy/recipe versions, model configuration where relevant, and approval state. An old fact can be stale despite identical text; enforce freshness and authorization. Scope sensitive material by project/user. Cache hits are accepted only after metadata and dependency validation.

**Runtime/component reuse:** avoid regenerating established rendering and layout code. This is not a guarantee of lower token usage; measure the resulting work and repair rate.

**Provider prompt cache:** where the existing provider interface exposes it, place stable content before variable task input and record actual cache counters. Cached input still occupies context, and output/reasoning is not made free. Treat cache eligibility, lifetime, pricing and concurrency behavior as provider/model-specific. Do not bolt a direct API key path onto subscription-based CLI users merely to obtain caching.

Artifact caching must not return a private source to another project, use a superseded approval, or repeat a provider operation whose outcome is unknown. Plan 09 supplies the common dependency-key implementation; use its interface rather than a separate incompatible cache format.

## K6. Allocate models by task with quality constraints

Discover supported models and actual configuration. Respect the user's model choice and budget. Prefer Sonnet for implementation and suitable production work; do not hardcode a nonexistent Sonnet 5.5 API ID. Strong story or visual-direction work must not be silently downgraded to an incapable model to satisfy a cost target.

A model that fails a bounded task can receive a focused repair packet or escalate within the authorized policy. Do not rerun the full crew. Record why an escalation happened and whether its result improved the task in 14. Avoid default maximum-effort reasoning for deterministic bookkeeping; retain sufficient reasoning for genuinely difficult design decisions.

## K7. Record usage without pretending estimates are measurements

Extend existing telemetry to distinguish, when exposed by the provider: uncached input, cache creation, cache reads, output, reasoning-token inclusion, model turns, retries and failed/cancelled work. Do not double-count reasoning if the provider already includes it in output. Unknown counters are null, not zero.

Report API-equivalent estimates separately from actual billed cost and subscription usage. Track active work time separately from user-approval waits, rate-limit waits and rendering. Record tokens spent on rejected alternatives and repeated research so avoidable work is visible.

Redact private inputs and credentials in telemetry. A packet's estimated token size is an estimate unless calculated by the applicable tokenizer; token-count requests that call a service are deferred to final-stage evaluation if needed.

## Parallel lanes

Assign packet compiler, recipe retrieval, policy/model mapping, telemetry, cache-interface integration and documentation/fixtures to separate owners. The lead edits central `crew.mjs` and skill-map registration from bounded patches. Do not ask every worker to read the complete external research collection.

## Implementation handoff

Deliver actual dispatch packet compilation, small result schemas, selective reference routing, unified settings policy, cache hooks and honest usage fields. Author cases K01-K08 and mark them unvalidated. Plan 09 receives packet versioning, resource-class metadata and counters; it provides runtime scheduling and concrete cache execution.

## Deferred verification

In 14 compare the old and revised packet sizes on matched tasks, inspect injected contexts, confirm mandatory facts survive compression, check stale/private cache rejection, and measure total usage including failed workers. Evaluate quality as well as tokens; do not claim an 80% overall saving from a hypothetical input-packet example.

## K8. Build a source intake and rule budget, not a larger prompt collection

Consult [REFERENCE_REUSE_MATRIX.md](REFERENCE_REUSE_MATRIX.md) once during implementation. For each selected upstream mechanic record the precise file/blob or commit, license evidence, adaptation mode, RasanAI destination, and scoped rule IDs. Unselected repos remain references, not dependencies. A successful lookup does not authorize installation or code copying.

The packet compiler should emit a receipt of included sections, recipe IDs, input digests and omitted optional material. Prefer deterministic extraction. Keep approved copy and qualifiers intact. Fetch additional authorized context on demand instead of shortening essential evidence to fit an arbitrary target. Place stable shared material before task-specific material only where the provider's actual prompt/cache path supports that arrangement.

Measure startup injection as well as the visible task packet after testing is authorized: project instructions, preloaded skills, tool schemas and inherited context can dominate. Do not attach every skill to a worker's startup `skills` field; the current Claude Code documentation describes full skill content injection. Resume the same worker for a narrowly related repair when its context remains valid; start a fresh one when independence or an input revision requires it. Both choices must respect the supported harness, not invented tool calls.

Avoid duplicating work through speculation. While the user chooses Story or Look, run only reusable, low-risk tasks that are independent of that choice and already authorized. Do not quietly develop all rejected alternatives in the name of keeping agents busy. Every token-consuming job must state which useful artifact it will produce.

## Revision 2 handoff requirement

Update the relevant row in [INTEGRATION_CLOSURE_MATRIX.md](INTEGRATION_CLOSURE_MATRIX.md) with actual source wiring and pending case IDs. Read only the applicable [rule migrations](RULE_MIGRATION_MAP.md) and [reference decisions](REFERENCE_REUSE_MATRIX.md). These documents do not authorize testing.

## Package navigation

[Coordinator and global policy](00_EXECUTE_IN_ORDER.md) | [Source ledger](RESEARCH_SOURCES.md) | [Deferred cases](DEFERRED_TEST_MATRIX.md).

Next: [Parallel production scheduling and incremental rendering](09_PARALLEL_SCHEDULING_AND_INCREMENTAL_RENDERING.md). Continue after integration; do not run pipeline tests between stages.
