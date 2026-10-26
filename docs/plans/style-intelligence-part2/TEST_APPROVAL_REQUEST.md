# Testing approval request - Style Intelligence Part 2

Status: **implemented_unvalidated / awaiting_test_approval**. This file is a request, not a grant of permission. Nothing described here has been run.

## Implementation candidate

- Actual branch/commit: Sibhimanyu/preview-screen-controls-fix @ 0482e3bb5ec4d7bc2a90582c5275d37647f57be7 (all lanes committed; working tree clean for skills/ and docs/ apart from the owner's untracked Rasan 3D files)
- Candidate diff: commit 0482e3bb5ec4d7bc2a90582c5275d37647f57be7; earlier lane-time digest superseded. No approval is claimed.
- Previous Creative Recovery dependency state: implemented, unvalidated (docs/plans/creative-recovery/TEST_APPROVAL_REQUEST.md still awaiting approval)
- Engine source/version the approved run would load: to be filled by the lead
- Implemented profile/module/entrypoint list: to be filled by the lead from the lane receipts (M01-M08)
- Missing or unvalidated capabilities: every new profile and example is unvalidated; see `unknowns` per case in CASE_REGISTRY.json
- Static operations performed (not test results): case authoring and `node --check` syntax checks of the five `.mjs` files only

## Authored cases

64 cases (MS-01 to MS-64) plus one extra MS-49b, all `not_run`, observed output and evidence null. Single source of truth: `docs/plans/style-intelligence-part2/CASE_REGISTRY.json` (input, expected requirement, proposed command, host, data, unknowns per case). Test files: `skills/rasanai/scripts/tests/style-intelligence-part2/`. Each file skips unless `STYLE_PART2_APPROVED=<lane>` is set; the variable is a latch, not approval.

| Lane | File | Cases | Side effects |
|---|---|---|---|
| pure | pure.test.mjs | MS-01..24, 45, 48, 49, 53..58 | none |
| scene | scene.synthetic.test.mjs | MS-25..44 | none planned; host needs UNKNOWN |
| journey | journey.side-effects.test.mjs | MS-46, 47, 49b, 50, 51, 52 | os tmpdir (removed), git read |
| static | governance.static.test.mjs | MS-59..62 (MS-63, 64 protocol only, blocked) | read-only |

Order if approved: pure, then scene, then journey, then static. Existing native approval journeys on a supported Mac and any film comparison are NOT covered by these files and need their own request.

## Proposed testing batch (to be completed by the user's choice)

- Exact case IDs from 06_DEFERRED_VERIFICATION.md: (user selects; default proposal is lane `pure` only)
- Exact commands (proposed from source inspection of the creative-recovery runner style, not yet executed): `STYLE_PART2_APPROVED=pure node --test skills/rasanai/scripts/tests/style-intelligence-part2/pure.test.mjs` and the analogous lane commands; per-case `--test-name-pattern="^MS-NN "` forms are in CASE_REGISTRY.json
- Unit-only, render, native UI, model grading or production-film scope: unit-only for pure/static; synthetic scene state for scene (no render, no screenshots, no goldens); permission for pure units is not permission for scene, journey, render, native UI or film trials
- Local host/tools/dependencies needed: Node with the repo's existing modules; git for MS-47 (needs `STYLE_PART2_BASE` and `STYLE_PART2_CANDIDATE`); no installs
- Synthetic/owned/private data and external-data handling: synthetic only (invented brand "Lumio Notes", invented text); no private data, no network
- Any model/provider and estimated usage allowance: none; no model or provider calls; zero spend
- Renderer/agent concurrency and resource limits: none needed (single Node process, serial)
- Repetition budget and whether bounded repair reruns are included: one run per approved lane; repair reruns NOT included unless the user states a bound
- Candidate lineage allowed for those repairs: none unless stated
- Existing outputs to preserve and disposable workspace: preserve everything in the worktree; journey cases use os tmpdir only and delete it
- Stop conditions and expected report artifacts: stop on first unexpected side effect (any write outside tmpdir, network, spawn other than git read); report per-case status, command, exit code and limitations; an UNKNOWN/missing export fails the case, it is never skipped to pass

## Deferred, separately gated (NOT part of this batch)

- MS-63 quality measured beyond effects: a later authorized blind comparison must include quiet and high-energy briefs, judge meaning, craft and suitability by actual human assessment (a model jury may assist but cannot replace the user), and must not score by effect count or self-assessed quality. The model jury cannot impersonate the user.
- MS-64 cost and speed measured separately: a later authorized comparison must record token categories, attempts, critical-path time, render time, retries, media generation and asset reuse separately, with matched baseline and new runs, cold and warm. No invented savings or subscription charges; report slower and unsuccessful cases. Keep brief, assets, duration, model and hardware comparable.
- Optional provider cases and rights-sensitive cases are gated separately.

Ask: 'Implementation is complete but unvalidated. Do you approve this specific testing batch and its stated resource/data scope?'

Wait for the user's explicit answer. Record the actual message/reference and approved limits in `approval_ref`. No worker, JSON file, hook, CI job or background process can authorize or start testing. Silence, timeout, a film Look approval and a request to continue implementation are not substitutes. Reapproval is required for materially broader scope or new spending. If approval is withdrawn (revoked), stop safely at once, leave artifacts in place and record the revocation.
