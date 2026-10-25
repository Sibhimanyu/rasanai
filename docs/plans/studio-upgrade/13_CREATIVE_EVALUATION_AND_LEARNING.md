# Plan 13 - Creative evaluation, measurable efficiency and bounded learning

**Repository:** `Sibhimanyu/rasanai`  
**Executor:** Sonnet implementation lead and scoped Sonnet workers  
**Sequence:** 13 of 14 implementation stages; coordinator is Plan 00  
**Prerequisite:** Plan 12 integrated as implementation, not yet pipeline-tested.  
**Research snapshot:** 2026-10-25; public HEAD inspected at `20ea14748daaee007cb4eaf5ba8aee91c09b1c4a`. Local HEAD wins.

## Execution and verification policy

Implement this plan inside the actual RasanAI checkout. Read `00_EXECUTE_IN_ORDER.md` and the predecessor handoff first, then only the repository files relevant to your assignment. Preserve existing working features and uncommitted changes. All proposed filenames/APIs below must be reconciled with the local checkout; extend an equivalent existing implementation instead of creating a duplicate.

**Testing requires the user's explicit approval, including in Plan 14.** Implement Plans 01-13, integrate the changes, and author fixtures/tests without executing them. Then stop at `awaiting_test_approval`, report the implemented candidate, and present the proposed testing scope, commands and resource/usage implications. Do not enter Plan 14 automatically. Only a subsequent explicit user instruction approving testing authorizes its agreed scope; this plan, silence, a general instruction to continue implementation, or approval of a film's Story/Look does not.

Until that approval, no unit/integration suites, agent film trials, browser/render smokes, GUI QA, live provider probes, end-to-end runs or benchmarks may run, whether directly, through workers, hooks or CI. Read-only inspection, syntax/schema parsing, type checks and compilation remain permitted only when they execute no tests, workflows or runtime probes. Hold any operation that would trigger tests; do not disable safeguards to bypass them. Record implementation as `implemented_unvalidated`. Preserve normal product runtime safeguards and creative approvals. See [Testing approval gate](TESTING_APPROVAL_GATE.md).

The implementation lead owns shared entrypoints and schema changes. Use parallel Sonnet workers for genuinely independent file-owned tasks; do not manufacture concurrency or let workers edit the same shared files. No remote push, public release, paid dependency purchase, new paid generation, destructive migration or permission escalation is authorized by this document alone.

## Repository entrypoints to locate

Start with these current or previously documented locations; verify their local equivalents before editing. Read only the symbols relevant to your assigned lane. Shared entrypoints remain lead-owned.

- `skills/rasanai/scripts/benchmark.mjs`
- `skills/rasanai/scripts/regression.mjs`
- `skills/rasanai/scripts/crew.mjs`
- `skills/rasanai/scripts/slop.mjs`
- `skills/rasanai/scripts/lessons.mjs`
- `skills/rasanai/scripts/tests/`

## Outcome

Implement the evidence system that will determine whether these changes actually improve films, usability, cost and speed. Do not run it yet. Plan 14 is the first execution of the accumulated validation program, but only after the user explicitly approves testing.

Extend the existing benchmark, regression, gates and lessons systems. Do not create a second global quality score or treat an agent's confident self-report as evidence. T05 supports separating task outcomes from transcripts and combining code, model and human evaluation; the film-specific design here is original to this plan.

## Q1. Separate three acceptance dimensions

**Technical correctness:** valid artifacts, no missing assets, sound timing and media specs, deterministic behavior within the declared environment, approval integrity, backward compatibility and safe recovery.

**Communication and craft:** appropriate story structure, proposition clarity, adequate proof, audience-facing copy, readability, meaningful visual events, coherent art direction, editorial flow and sound direction. These depend on the brief and format.

**Efficiency:** total model usage, rejected-option work, critical-path latency, cache reuse, revision cost and resource contention under matched conditions.

A cheaper bad film is not a win. A perfect encode is not proof of persuasive storytelling. A model-judge preference is not a human preference. Report all three dimensions separately and retain their evidence.

## Q2. Build a representative fixture corpus

Use owned or synthetic inputs with clear labels and permission. Include at least these fixture families:

| Fixture | What it distinguishes |
|---|---|
| One product, general launch | Representative breadth and a coherent proposition |
| Same product, single-feature announcement | Focused proof rather than unrelated capability parade |
| Same product, tutorial | Accurate steps and understandable interface states |
| Same product, technical explainer | Mechanism and mental-model progression |
| Same product, identity/brand film | Visual-system or belief development, not forced UI demo |
| Short sting with existing brand | Small crew and lightweight path |
| Character short | Stable identity and meaningful performance |
| Music/lyric film | Track-led timing, not mandatory product-launch grammar |
| Footage/reel or presenter | Respect actual material and transcript meaning |
| Hybrid phone advertisement | Quad tracking, masking and editable overlay distinction |
| Revision suite | Local copy change, structural reorder, look swap and audio edit |
| Legacy and adverse cases | Old project, missing assets, provider unavailable, restart and stale actions |

The illustrative ChatGPT brief is useful, but current real capabilities and UI must be verified before a real demonstration. Keep synthetic product fixtures for deterministic regression without relying on changing services. Expected outputs specify meaning and constraints, not the exact script "Start with what you have."

Never bundle another studio's film or paid prompt pack as a training fixture without rights. References can be linked and analyzed through original notes. Keep evaluation holdouts separate from examples fed to generators.

## Q3. Grade by the communication assignment

Create concise rubrics for each communication kind. Ask whether the scope of proof matches the promise, what each beat adds, whether visual changes support meaning, and whether the final takeaway follows from the film. A feature film can have one task; a broad launch may need several. A manifesto may use legitimate abstraction.

Do not score all films against a mandatory villain, twist, peak percentage, shot count or technique count. Do not automatically fail a true benefit because competitors share it. A vague heading is a problem when it substitutes for useful communication, not because a forbidden-word list includes it.

Represent findings with severity, target beat/shot/time, evidence, confidence and a concrete proposed repair. A grader can return `unknown` or `not_observed`. Claims and privacy violations remain hard blockers; subjective taste is reviewable and waivable only through the existing appropriate user decision.

## Q4. Support blind comparison and human calibration

Build matched A/B review sheets and playback with randomized left/right or A/B order, hidden version/model labels and the same brief, duration/spec and relevant source evidence. Keep the mapping outside the judge packet. Record which conditions differ.

Reuse a real earlier-version baseline when available; otherwise produce a baseline in an isolated checkout during user-approved Plan 14. Do not deliberately degrade a new output and label it the old system. Do not compare a cheap derived video operation with a complete generation as if the runtimes were equivalent.

Use an independent review context for model grading rather than the creator's scratchpad. Sample order-swapped comparisons to detect positional effects. Model judges assist triage; retain `pending_human_review` until a person actually assesses creative preference. Store human disagreement instead of forcing unanimity.

## Q5. Instrument fair cost and speed comparisons

Record hardware, OS, renderer/model/runtime versions, task/asset hashes, dimensions, frame rate, quality setting, resource limits, cache state and failures. Separate time to treatment, time to approved board, time to first draft, final render and revision turnaround. Exclude user waiting from active-compute time but report it separately.

Include retries and rejected work in total usage. Keep provider counters and billing estimates separate. A one-run result is a measurement, not a reliable general speedup; label sample sizes and variability. Use repeated trials for stochastic creative tasks only within the authorized budget, not an automatic expensive benchmark explosion.

Predeclare the task comparisons and quality criteria before running. Do not choose only the winning examples. Performance acceptance requires no unexplained quality or correctness regression and an honest record of cases where caching/concurrency does not help. Set numerical targets only with an actual baseline and user/project expectations; do not promise a percentage from theory.

## Q6. Learn from feedback without growing a prompt monster

Record a lesson only with its source observation, scope, rationale and confidence. Prefer a small corrective test or reusable helper when the issue is deterministic. Keep taste preferences scoped to the user, brand, series or format that supplied them. A user disliking one speech bubble does not establish a universal ban on dialogue balloons.

Avoid automatic accumulation of conflicting hard rules. Deduplicate, expire or review obsolete lessons, and preserve the distinction between fact/safety constraints and stylistic preference. Proposed global craft changes require evidence and human review; they cannot override new user instructions or inject retrieved content as authority.

## Parallel lanes

Corpus/fixture metadata, per-format rubrics, A/B presentation, telemetry/report generation, existing-gate integration and scoped lessons can be implemented independently. The lead owns reporting semantics and benchmark command registration. Tests and fixtures are authored only; no graders, models or films run in this plan.

## Implementation handoff

Deliver executable evaluation infrastructure, a case registry covering every earlier plan, original/safe fixtures, baseline provenance rules, honest reports and bounded learning. Register Q01-Q08 and prepare the complete pending verification list for the approval request. Stop at `awaiting_test_approval`; do not dispatch Plan 14. Do not mark any creative improvement or cost reduction as proven at this stage.

## Deferred verification

After explicit user approval, Plan 14 executes only the authorized cases, measures matched outputs, reports failures and records human review separately. It also verifies that the evaluation harness can fail a deliberately broken synthetic case; a permanently green grader is not useful.

## Q7. Keep the improvement test independent of the new prompts

Pre-register matched cases and criteria before executing anything. A fixture example used to teach the writer cannot also establish generalization by being the only evaluation brief. Keep held-out products, unusual brand constraints, valid restrained films and difficult revision histories out of runtime examples.

Measure failure and repair cost as well as successful output. Classify `not_run`, invalid evidence, grader failure and production failure separately. If a judge prefers animation density merely because it looks expensive, compare it against human judgments on a valid calm film and fix the rubric rather than forcing the generator to add motion.

Use one meaningful change at a time in approved comparison experiments where practical: story policy, context packaging, concurrency or caching. A comparison that changes all four cannot attribute its result to parallelism alone. Respect the approved trial budget and report single-run uncertainty; do not silently launch a factorial benchmark.

The implementation handoff includes an exact proposed test inventory and the candidate version, but not a pre-approved execution token. Human creative preference, permission to test and permission to release are three different decisions.

## Revision 2 handoff requirement

Update the relevant row in [INTEGRATION_CLOSURE_MATRIX.md](INTEGRATION_CLOSURE_MATRIX.md) with actual source wiring and pending case IDs. Read only the applicable [rule migrations](RULE_MIGRATION_MAP.md) and [reference decisions](REFERENCE_REUSE_MATRIX.md). These documents do not authorize testing.

## Package navigation

[Coordinator and global policy](00_EXECUTE_IN_ORDER.md) | [Source ledger](RESEARCH_SOURCES.md) | [Deferred cases](DEFERRED_TEST_MATRIX.md).

**STOP after this implementation handoff.** Set `awaiting_test_approval`, report what changed and what remains unvalidated, and present the candidate revision, proposed cases/commands, expected usage and blockers. Ask the user to approve testing, then wait. [Plan 14](14_FINAL_INTEGRATION_TESTING_AND_ACCEPTANCE.md) may begin only after explicit user approval; its presence here is not permission to execute it.
