# Plan 14 - Final integration, pipeline testing, repairs and acceptance

**Repository:** `Sibhimanyu/rasanai`  
**Executor:** Sonnet implementation lead and scoped Sonnet workers  
**Sequence:** 14 of 14 implementation stages; coordinator is Plan 00  
**Prerequisite:** Plan 13 integrated as implementation AND a subsequent explicit user approval of the proposed testing scope recorded. Without that approval, this entire testing stage is blocked.  
**Research snapshot:** 2026-10-25; public HEAD inspected at `20ea14748daaee007cb4eaf5ba8aee91c09b1c4a`. Local HEAD wins.

## Execution and verification policy

Implement this plan inside the actual RasanAI checkout. Read `00_EXECUTE_IN_ORDER.md` and the predecessor handoff first, then only the repository files relevant to your assignment. Preserve existing working features and uncommitted changes. All proposed filenames/APIs below must be reconciled with the local checkout; extend an equivalent existing implementation instead of creating a duplicate.

**Testing requires the user's explicit approval, including in Plan 14.** Implement Plans 01-13, integrate the changes, and author fixtures/tests without executing them. Then stop at `awaiting_test_approval`, report the implemented candidate, and present the proposed testing scope, commands and resource/usage implications. Do not enter Plan 14 automatically. Only a subsequent explicit user instruction approving testing authorizes its agreed scope; this plan, silence, a general instruction to continue implementation, or approval of a film's Story/Look does not.

Until that approval, no unit/integration suites, agent film trials, browser/render smokes, GUI QA, live provider probes, end-to-end runs or benchmarks may run, whether directly, through workers, hooks or CI. Read-only inspection, syntax/schema parsing, type checks and compilation remain permitted only when they execute no tests, workflows or runtime probes. Hold any operation that would trigger tests; do not disable safeguards to bypass them. Record implementation as `implemented_unvalidated`. Preserve normal product runtime safeguards and creative approvals. See [Testing approval gate](TESTING_APPROVAL_GATE.md).

The implementation lead owns shared entrypoints and schema changes. Use parallel Sonnet workers for genuinely independent file-owned tasks; do not manufacture concurrency or let workers edit the same shared files. No remote push, public release, paid dependency purchase, new paid generation, destructive migration or permission escalation is authorized by this document alone.

## Repository entrypoints to locate

Start with these current or previously documented locations; verify their local equivalents before editing. Read only the symbols relevant to your assigned lane. Shared entrypoints remain lead-owned.

- `skills/rasanai/scripts/tests/`
- `skills/rasanai/scripts/selftest.mjs`
- `skills/rasanai/scripts/benchmark.mjs`
- `skills/rasanai/scripts/regression.mjs`
- `apps/macos/Tests/`
- `apps/macos/Package.swift`

## T0. Mandatory user approval before the testing stage

**Do not execute any testing instructions below unless the user explicitly approved testing after the implementation handoff.** Reaching this file, completing Plan 13, receiving a worker recommendation, or reading earlier instructions to execute all plans does not lift the gate.

Before T1, verify an actual user approval message exists and matches the proposed scope. Record its conversation/message reference or exact wording, candidate commit/digest, approved cases, commands, resource/provider limits and approval time in the implementation ledger. No approval has been granted by this package; do not manufacture one. A limited approval permits only the specified subset.

Without approval, prepare the implementation and proposed-test summary, set `awaiting_test_approval`, and stop. Do not launch, queue or leave any automatic/background testing job behind. Once permission is received, continue with the approved portions of T1-T11. If permission is withdrawn, stop safely. Scope expansion, new paid services or materially changed testing requires a new decision; ordinary repairs/reruns are covered only within the original agreed scope and limits.

Testing approval is separate from publication, pushing, dependency purchases, destructive migrations and production-data access. Keep those permission boundaries intact. See [Testing approval gate](TESTING_APPROVAL_GATE.md).

Do not run the entire suite after every tiny fix. Group by dependency and failure risk, rerun affected checks, then run a final regression sweep after integration stabilizes. Use bounded test workers and the shared render/resource limits; parallel testing must not corrupt shared fixtures.

## T1. Establish the exact candidate and pending scope

Record candidate commit, local uncommitted changes, runtime versions, host capabilities and the implementation ledger. Confirm 01-13 are integrated, including current local implementations that superseded earlier tasks. Check that shared interfaces and entrypoints are actually wired.

Read the deferred-case registry and classify each feature as core, optional enabled, optional unavailable, licensing-blocked or genuinely deferred. An interface stub is not an implemented optional adapter. Missing core functionality blocks core acceptance; optional unavailable services must fail gracefully without breaking ordinary films.

Use disposable project libraries and owned/synthetic media. Preserve original projects, previous final films and the selected baseline. Keep the candidate and baseline worktrees isolated. Do not reset the user's real workspace to run comparisons.

## T2. Within the approved scope, execute cheap checks before expensive generation

Inventory current test/build commands from the actual repo. Validate syntax, types, schema compatibility, internal links, registration, migrations and pure deterministic units first. Then run relevant integration tests. Only after these succeed should real browser renders and agent film trials begin.

Known baseline command locations to reconcile, not blindly assume:

```bash
# Only after explicit user testing approval.
# From repository root; inspect source before running commands or help that may execute code.
node skills/rasanai/scripts/selftest.mjs
node skills/rasanai/scripts/tests/run-one.mjs events

# From apps/macos; use the current package's documented test/build workflow.
swift test
```

Some tools may require explicit dependencies or write fixtures; record those actions. Do not invent flags such as `--skip-render` or `--dry-run` unless the current implementation supports them. Discover the new suite entrypoints added by 01-13 and write an exact reproducible command manifest.

Treat pre-existing failures as baseline failures only with actual baseline evidence. Do not dismiss a failing telemetry test merely because an old status note mentions two failures. Record whether the candidate changed it and whether it affects the required user journey.

## T3. Verify contracts, compatibility and security

Run approval-version, schema-migration, action-idempotency, file-ownership, path-containment, private-data export and unknown-capability cases before live provider access. Verify a stale Story/Look approval cannot trigger a new storyboard or accept an old worker result.

Test old projects opening, resuming and producing a valid output through preserved paths. Verify a new optional field does not break older supported readers. An unsupported schema must produce an explicit error rather than silently discard essential meaning.

Test synthetic malicious URLs, escaping symlinks, archive traversal and injected instructions without contacting unsafe destinations or reading unrelated private files. Confirm keys/private paths are redacted and rendered scenes cannot obtain provider credentials. If required sandboxing is unavailable, restrict and label the affected capability.

## T4. Verify deterministic media and local revisions

Use small, low-cost synthetic compositions first. Exercise arbitrary seek order, cold reload, missing fonts/assets, fractional FPS, scene/global time origins, transitions, blur handles, masks, audio tails and final mux. Compare like-for-like outputs in the same environment using declared tolerances and perceptual review where appropriate.

Perform a text change, position/scale edit, audio-line change, look change and scene reorder. Inspect changed and reused graph nodes. Compare the resulting incremental film against a clean full render. Check shared dependency invalidation by changing a font/component and by altering a transition that affects neighbors.

Verify real editable-source changes, successful undo/redo, superseded-result rejection and that the previous final remains available on failure. Count frames and inspect PTS/duration, audio continuity, color/alpha behavior and actual file hashes. A nonempty MP4 file is not enough.

## T5. Run the native five-call journey

On a supported Mac, open the real built app in a disposable library. Exercise Brief -> Story -> Look -> Storyboard -> Build -> Final, including back navigation, a changed selection, inherited series/Just make it behavior and app restart. Confirm native and browser-console actions share the same meaning.

Inspect Story text choices, Look comparison frames and Storyboard shot panels as distinct interfaces. Play the animatic with actual audio. Verify that the user can keep context visible while details scroll, that primary actions stay accessible, and that small/large windows, fullscreen, zoom/letterbox and high-DPI pointer mapping work.

Use keyboard navigation and accessibility tooling. Perform a marked-frame revision, deterministic property edit, Undo, pause/resume and export. Confirm each visible state corresponds to real source/render state. A build that compiles but cannot be opened on this host is `GUI not_run`, never native UI passed.

## T6. Run bounded real film-production trials

Execute a representative core set rather than every optional combination:

1. A broad product introduction, using verified capabilities and real/clearly labeled illustrative assets.
2. A single-feature film for the same product, proving its story differs appropriately.
3. A technical explainer or tutorial with required factual relationships.
4. A brand/identity or thematic motion film, allowing appropriate abstraction.
5. A short low-complexity sting or revision scenario, verifying the lightweight path.

Use the same-product five-format corpus for story-level comparisons even when not all variants need full delivery renders. Add character, footage/music and hybrid cases when those routes are in the accepted shipping scope. At least one real end-to-end selected film must run through native Studio and deliver a valid final; CLI-only evidence does not establish app workflow success.

For the ChatGPT case, do not use the example treatment as an exact expected answer. Judge concrete communication, suitable scope and supported demonstrations. "Desire" should fail when it substitutes for the proposition, not merely because a string appears anywhere in a valid brand treatment.

Do not rerun all research and candidate generation for a local correction. Observe whether the actual scheduler/packet/cache implementation avoids that waste.

## T7. Exercise optional providers and interchange only when authorized

For each configured optional model/provider, verify actual host capability, model/workflow identity, rights, submit/status/result/cancel mapping and timeout reconciliation. Use a minimal authorized sample and record cost/usage; no model download or paid request without the existing required consent.

A fake provider fixture verifies protocol handling, not neural-video quality. A bounding box fixture does not verify segmentation. For the hybrid phone scene, check real corner tracking/perspective and foreground masks separately; show the supported fallback when either is unavailable.

For character dialogue, inspect identity, expression, gesture continuity and actual lip/word timing if advertised. For OTIO/editor export, relink a package and perform at least one actual supported-editor round trip where the editor is available. Unsupported or untested adapters remain disabled/experimental with explicit limits.

## T8. Fault injection and recovery

In disposable fixtures, interrupt a worker during source write, cache publication, final encode and remote-job waiting. Simulate memory/resource pressure, full disk, truncated log, app termination, lease expiry, stale-worker return and rate limiting. Verify no duplicate director, no stale final overwrite and no automatic uncertain paid resubmission.

Resume from saved artifacts and approvals, not from the beginning of the film. Check resource-slot cleanup and that cancelling one film cannot stop another user's external queue. Test version recovery and missing linked media with actionable errors rather than silent placeholders.

## T9. Measure efficiency and creative quality

Run matched cold/warm and revision scenarios against a real baseline where possible. Fix input brief/assets, dimensions/FPS, quality, model policy and hardware. Vary concurrency through a bounded set, beginning with 1, 2 and 4 useful workers; higher levels require enough independent tasks and provider/memory headroom.

Measure total usage including retries, time to each useful output, critical-path time, render/encode time, queue/user wait, cache reuse and memory. Do not treat API-equivalent estimates as actual subscription charges. Report slower and losing cases as well as wins. A single run is labeled as such; authorize repeats before spending a large evaluation budget.

Use Plan 13's blind review packets for communication/craft and obtain actual human review for creative preference. Model grades can flag issues but cannot fill the human-review field. The claims "more professional," "faster" or "cheaper" must each be supported by their corresponding evidence rather than a clean test suite alone.

## T10. Coverage and evidence matrix

Every executed case has an ID, plan, user testing-approval reference and authorized scope, input/candidate versions, exact command or manual steps, expected result, observed result, evidence paths and status. Cases outside the approved scope remain `not_run`. Fill in the authored case IDs from the predecessor ledgers; no empty success checkboxes.

| Case family | Minimum evidence required |
|---|---|
| F01-F06 / Plan 01 | Stage mapping, old-run reads, approval invalidation and writer ownership |
| B01-B06 / Plan 02 | Facts/brand/audience routing, source freshness and assumptions |
| S01-S08 / Plan 03 | Different format structures, copy separation and truth-preserving review |
| L01-L06 / Plan 04 | Comparable styleframes, selected-look propagation and visual consistency |
| E01-E08 / Plan 05 | Multiple panels where needed, timing reconciliation and coherent transitions |
| V01-V10 / Plan 06 | Real primitives/renders, honest hybrid/character capability states |
| A01-A07 / Plan 07 | Listened mix, intended cue offsets, voice checks and stable tails |
| K01-K08 / Plan 08 | Actual context/usage, preserved facts and cache authorization |
| P01-P10 / Plan 09 | Useful concurrency, cache correctness and stale-result rejection |
| U01-U10 / Plan 10 | Native approval/revision journey, pointer mapping and Undo |
| R01-R10 / Plan 11 | Recovery, privacy, containment and license blockers |
| D01-D09 / Plan 12 | Destination variants, accessibility outputs and delivery relinking |
| Q01-Q08 / Plan 13 | Grader failure detection, blind comparison and honest reporting |

These are test-family prefixes, not the research-source IDs used in `RESEARCH_SOURCES.md`. Prefix reports with the plan number to avoid ambiguity, for example `plan03/S01` versus research source `S01`.

## T11. Repair and acceptance rules

Route a failing case to its owning module with a bounded packet: input fixture, observed output, failing assertion, relevant trace and expected behavior. Preserve other passing modules. Re-run the targeted case and directly affected dependencies, then the final core regression set. Do not fix a failure by weakening a valid requirement or marking the test skipped without an explicit scope decision.

Core acceptance requires all required core cases to pass with no unresolved data-loss, factual, approval, security or invalid-media blocker. Optional capabilities can be separately blocked or experimental only when that scope is visible and ordinary workflows remain intact. No numerical pass-rate threshold should hide a critical failing case.

If budget, permissions, software or host environment prevents completion, deliver the implemented code and an accurate partial validation report. Do not pretend every feature is complete or make an unsupported promise to continue in the background. Keep the candidate unreleased until required missing validation and permissions are resolved.

## Final deliverables

Produce `IMPLEMENTATION_REPORT.md`, `VALIDATION_REPORT.md`, `PERFORMANCE_REPORT.md`, `KNOWN_LIMITS.md`, the exact command/fixture manifest, selected real film outputs with permitted source packages, and the updated capability/implementation ledgers. Record actual commits and evidence paths, not hypothetical output filenames.

Separate: implemented; verified core; verified optional; experimental; failed; not run; licensing/environment blocked; human creative review pending. Summarize what changed for the user, what was reused, measured token/speed outcomes and the remaining release decision. Do not publish, change an appcast, push or submit to Heresay unless separately authorized.

## Audit additions to the authorized validation batch

Before every test batch, verify the actual user authorization reference and approved scope. Do not interpret this file, a worker packet, a previous film approval or an agent-created JSON flag as consent. No test approval is granted by this package. See [TESTING_APPROVAL_GATE.md](TESTING_APPROVAL_GATE.md).

The approval request must identify candidate commit plus any uncommitted diff digest, suites/cases, live-provider permissions, usage/resource limits, and whether targeted repair reruns are included. A narrow approval for unit tests excludes GUI, renders, graders and live agents. Pause before broader scope or a materially different implementation; record lineage for authorized repair commits. Approval withdrawal stops new dispatch and safely stops owned active work where possible.

Include the added audit cases from [DEFERRED_TEST_MATRIX.md](DEFERRED_TEST_MATRIX.md), but only those within the approved batch. Start with the authorization/transaction/scheduler boundaries when permitted: old Undo with a later edit, changed payload under the same action ID, stale preview receipt, slot failure/timeout, budget over-admission and the suspected `sourceResearch` policy-scope branch.

Do not reuse a successful assertion from a different candidate to fill a current evidence row. Existing evidence can be retained as historical with its producing revision. Complete the integration-closure rows with observed results only after actual authorized runs.

## Revision 2 handoff requirement

Update the relevant row in [INTEGRATION_CLOSURE_MATRIX.md](INTEGRATION_CLOSURE_MATRIX.md) with actual source wiring and pending case IDs. Read only the applicable [rule migrations](RULE_MIGRATION_MAP.md) and [reference decisions](REFERENCE_REUSE_MATRIX.md). These documents do not authorize testing.

## Package navigation

[Coordinator and global policy](00_EXECUTE_IN_ORDER.md) | [Source ledger](RESEARCH_SOURCES.md) | [Deferred cases](DEFERRED_TEST_MATRIX.md).

Without testing approval, finish at `awaiting_test_approval` with implementation and proposed-test summaries only. After authorized testing, finish with evidence-backed acceptance and limitations. Publication remains a separate permission.
