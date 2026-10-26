# Testing request - NOT permission

**Current authorization: no testing has been approved.** State: `awaiting_test_approval`. Nothing in this file or in `skills/rasanai/scripts/tests/creative-recovery/` has been executed.

Authored cases: 36 (C01-C36) plus C12b. Manifest: `skills/rasanai/scripts/tests/creative-recovery/manifest.json`.

- Candidate commit and dirty-diff digest: HEAD `746d6a96d8e07139b80685d26230a6f3d03ca405` (branch `Sibhimanyu/preview-screen-controls-fix`) plus the uncommitted working tree under `skills/rasanai`: tracked diff (`git diff HEAD -- skills/rasanai`, 42 files, +991 / -129) sha256 `2423b106485f92d22b80d34f8bfe8844c4b038468c7c4e4f283131632876dc51`; 18 untracked files (sha256 of the sorted per-file sha256 list) `8c091ddfb6a44408f1126dc607d6a88ed4d3171df1ee351ace40e0762634a172`. Nothing is committed. The unrelated untracked `apps/rasan-3d/blender/**`, `12`, `fc-clean.png`, `fi-clean.png` are not part of the candidate. The digests change with any further edit.
- Source/bundled engine version the trial would use: the source checkout engine `skills/rasanai/VERSION` = 1.27.0 (unchanged). C35 version sources: `skills/rasanai/VERSION` and the Studio bundle's embedded copy, which is NOT rebuilt here: an installed Studio would run its own (stale) bundled engine, not this candidate, until the user authorizes a bundling step. Batches 1 and 2 import this checkout directly.
- Implemented changes and unvalidated limitations: see `IMPLEMENTATION_REPORT.md` (what is wired), `INTEGRATION_RECEIPTS.md` (every connection, producer / consumer / fallback / lines) and `KNOWN_LIMITS.md` (blocked rows, lane guesses, the W02 import deviation, the stale-bundle caveat). All of it is `implemented_unvalidated`. API shapes beyond `01_CONTRACTS.md` were guessed in the tests (manifest `unknowns`), and the integration added `scripts/lib/creative-run.mjs`, strict-consent wiring in `crew.mjs` / `scripts/storyboard.mjs`, and four small module fixes that the authored tests do not know about: expect some test repair before any pass.
- Proposed batches (approve each separately):
  1. **Units, lane `pure`**: `CREATIVE_RECOVERY_APPROVED=pure node --test skills/rasanai/scripts/tests/creative-recovery/pure.test.mjs` - C01-C16, C19, C23-C34. Node only, no network, no model, no render, no GUI, no writes.
  2. **File-system / host, lane `film`**: `CREATIVE_RECOVERY_APPROVED=film node --test skills/rasanai/scripts/tests/creative-recovery/film.side-effects.test.mjs` - C12b, C17, C18, C20, C21, C22, C35, C36. Temp dirs under the OS temp folder, removed afterwards. C22 is blocked until a pre-change payload baseline exists; C35 is blocked until the version sources are named; native decode in C21/C22 would need a visible Studio window.
  3. **Model/render creative review (not authored as automatic)**: the model-judgment halves of C06, C08, C24, C27 and the later creative comparison. Needs a provider, rendering and user-supplied assets; excluded unless separately approved.
- Approval of units never authorizes a film trial.
- Fixture data: invented brand "Lumio Notes", synthetic JSON only (`fixtures.mjs`); no private run copies, commercial footage or network.
- Local resources and provider usage ceiling: batch 1 is seconds of CPU and no files; batch 2 writes small temp files under the OS temp folder and removes them; batch 3 needs a model provider, rendering and user-supplied assets: its provider usage ceiling is UNKNOWN and is not requested here (it is disclosed and asked separately before any run)
- Narrow repair/rerun cycles: proposed, not approved: at most 2 per failing case, only on the files the failure names (the authored tests, `scripts/lib/creative-run.mjs`, or the module the failure points at); no widening of scope, no repair of a frozen file (they stay blocked and are reported)
- Excluded: publication, pushes, purchases, CI/hook wiring, broader trials, any test of the frozen UI files

Ask: "Do you approve this specific testing batch for this candidate and these limits?"

Record the user's actual response and scope here once given: (none yet). A previous film approval, an env var or an agent-written flag is not approval. Report every case as passed, failed, blocked or not run from actual evidence; none is prefilled.
