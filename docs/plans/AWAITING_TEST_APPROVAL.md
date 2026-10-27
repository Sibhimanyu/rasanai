# Awaiting test approval

State: `awaiting_test_approval`. Plans 01-13 are `implemented_unvalidated`. Nothing in this candidate has been run: no test suite, benchmark, grader, model, render, GUI session or provider call. No approval exists, none was created, and this document is not one. Plan 14 has not started and nothing is scheduled.

Three separate decisions belong to the person: permission to test, human creative preference, and permission to release. This request covers only the first.

## Candidate

- Base commit `68a5609b25990dc9244ce84fcc24121fa1020486` on `Sibhimanyu/site-nav-jumps`, skill version 1.24.0, plus the uncommitted work of Plans 01-13 in this worktree. The uncommitted diff digest is computed by `node skills/rasanai/scripts/eval.mjs inventory` (read-only; it only runs git) and changes whenever any file changes, so quote the digest it prints at approval time, not one written here.
- What was built (one line per plan; wiring and files are in `INTEGRATION_CLOSURE_MATRIX.md`, which is the source of truth): 01 stage contracts and approval invalidation; 02 briefing, evidence and brand authority; 03 story grammars and treatments; 04 comparable looks and visual bible; 05 storyboard, timing authority and animatic; 06 motion primitives, readiness, tracking and optional providers; 07 audio direction, mix receipts and voice checks; 08 production policy, packets and honest usage; 09 jobs, leases, resource pools, caches and the schedule; 10 native directing (Studio): call bar, revision strip, direct manipulation; 11 recovery, containment, privacy, provenance and the licence register; 12 destination profiles, variants, captions, accessibility and delivery packages; 13 evaluation machinery, case registry, scoped lessons and the testing approval gate.
- Plan 13 adds: `lib/rubrics.mjs`, `lib/blind-review.mjs`, `lib/eval-metrics.mjs`, `lib/eval-corpus.mjs`, `lib/lessons-scope.mjs`, `lib/case-registry.mjs`, `lib/test-approval.mjs`, `scripts/eval.mjs`, fixtures under `tests/fixtures/plan13/` and `plan14/`, optional scope fields on `lessons.mjs add`, `crew.mjs eval` (forwards), and a refusal at the start of `selftest.mjs`.

## What is unvalidated

Everything. In particular: all 139 deferred cases (`plan01/F01` ... `plan14/G03`) are `pending_implementation_and_user_approved_validation`; no case has ever passed. Verification so far was `node --check`, JSON parsing and, for some plans, a compile-only `swift build`. Claims that are open and must not be repeated as facts: that any change makes films better, faster or cheaper; that any editor imports the OTIO output; that renders are seek-stable; that recovery paths survive a real crash; that the native Studio screens behave; that lessons, rubrics or graders work. Human creative preference is `pending_human_review` for every comparison.

## Case registry and fixtures

`node skills/rasanai/scripts/eval.mjs registry` lists every id with its fixture paths (read-only). Mapping rules are in `lib/case-registry.mjs`.

- `fixture_pending` (no authored fixture): `plan01/F01` to `plan01/F09` (Plan 01 authored no fixtures), `plan02/B05`, `plan03/S05`. Everything else maps to an authored fixture; run `eval.mjs registry` for the live list because the concurrent Plan 12 work may add or rename files.
- Inferred mapping (plans 02 and 03 named their fixtures by topic; the case assignment is a guess from file names, marked `inferred_from_filename`): review it before relying on it.
- Fixtures are data. Only Plan 13 and Plan 14 fixtures have an executable scenario runner (`eval.mjs fixtures check`). For other plans a fixture records inputs and expectations; executing it needs the plan's own entrypoints or a manual procedure, and a runner for those is written under approval.

## Proposed testing scope (grouped; approve any subset, narrower is fine)

Cheapest first. Each group is a separate approval line; approving one never covers another.

| Group | Cases | What runs | Command to reconcile (not yet approved) |
|---|---|---|---|
| 1. unit / schema | 70 | Pure functions, schema checks, fixture structure, gate cases. No browser, no model, no network | `node skills/rasanai/scripts/eval.mjs fixtures check`; `cd apps/macos && swift test` for the Swift unit tests (a build plus tests; takes CPU and disk, no network) |
| 2. integration | 35 | Scripts and sessions against disposable folders; no film generation | `node skills/rasanai/scripts/selftest.mjs --quick` (it also runs a local console server) |
| 3. renders | 18 | Real headless Chrome renders, ffmpeg encodes, audio analysis on small synthetic compositions | `node skills/rasanai/scripts/selftest.mjs` (full) plus per-case procedures to be written |
| 4. native GUI | 8 | The built Studio app in a disposable library; needs a visible window and a person watching | manual journey, no command |
| 5. optional providers | 1 | A minimal authorized sample per configured provider; any paid call, model download or account use needs its own consent and limit | none until a provider is named |
| 6. graders / human review | 2 | Blind packets from `lib/blind-review.mjs`, model grading in an independent context, then a named person; `Q09` also needs a calm film and a dense film rendered | per Q04/Q05 procedures |
| 7. agent film trials | 5 | Real crew film runs (the heavy group): `plan03/S01`, `S08`, `S10`, `plan08/K08`, `plan09/P10` | pre-registered comparisons only (see below) |

Notes. `tests/run-one.mjs`, `benchmark.mjs` and `regression.mjs` named by the plans are not in this checkout (they exist only in old `.context` worktrees); `selftest.mjs` (which imports every `tests/*.mjs`) is the real entrypoint, so groups 2 and 3 are the whole suite rather than single cases. The selftest runs everything or, with `--quick`, skips Chrome-heavy parts. `swift test` is not gated by the JS gate (no JS entrypoint); approve it by name or do not run it. CI (`.github/workflows/ci.yml`) calls `selftest.mjs`; with the gate it will now refuse until a record exists on that machine. That is intended; whether CI should ever carry an approval is your separate decision.

## Request template: fields the person fills in

Nothing below is granted by this document. Each line is a blank for the person to answer; an unanswered line means no.

- Repair / rerun scope: are reruns after a fix included? `none` (a failure is reported and stops), `same cases only` (rerun the failing cases on a repaired candidate, only if the approved commit is still an ancestor, i.e. `--repairs true`), or `new approval needed`. Default: none.
- Per group (each a separate answer; `excluded` unless the person says `included`):
  - unit: included / excluded
  - integration: included / excluded
  - render: included / excluded
  - gui: included / excluded
  - provider: included / excluded (names the provider)
  - grader: included / excluded
  - agent_film: included / excluded
- Candidate: commit plus uncommitted-diff digest, computed at approval time with this read-only command (not run here; it only reads git):
  `cd <repo> && { git rev-parse HEAD; git diff HEAD --binary; git ls-files -o --exclude-standard -z | sort -z | xargs -0 shasum -a 256; } | shasum -a 256`
  `node skills/rasanai/scripts/eval.mjs inventory` prints the same candidate (commit, `uncommitted_diff_sha256`, untracked count, digest) and is what the approval record binds to; quote that digest in the approval. Any later file change makes a new digest and needs a new approval unless repairs are allowed.
- Live-provider permissions: allowed providers (named, or `none`); paid calls allowed yes/no with a spend cap; model downloads yes/no; account or credential use yes/no; network access yes/no. Default: none, no paid call, no download, no network.
- Usage and resource limits: max wall-clock seconds (`--max-wall-s`), max model usage or run count for agent_film, max concurrent Chrome/ffmpeg processes, max disk written, and whether your real library may be touched (default: never; disposable folders only).

## Expected usage and resource implications

No figures are promised. Group 1 is minutes of CPU. Groups 2-3 spawn local servers, headless Chrome and ffmpeg and write temp folders. Group 4 needs your Mac, display and attention. Group 7 consumes model usage in proportion to films run, and retries and rejected work count; the pre-registration (`eval-metrics.mjs preregister`) fixes cases x comparisons x two sides against a run budget you set, and refuses a plan that exceeds it or changes more than one factor. Baselines come from a real earlier version, or an isolated checkout built only after approval; a degraded candidate is never used as the old system. A single run is labelled a measurement.

## Blockers and known limits (independent of approval)

- GSAP licence (`distribution_blockers.gsap-license`, status open): the Standard License restriction on competing visual animation builders is unresolved for distribution; Plan 14 cannot clear it and no flag or label does.
- Not read or verified: Remotion framework terms, Rive terms, generation-model licences.
- No OS sandbox for render processes, no isolated scene origin, no network block for generated scene code, DNS rebinding window between URL check and fetch, console session token printed in a URL (see `renderIsolation()` / `boundaryReview()`).
- OTIO editor round trips need the editors installed (DaVinci Resolve, Final Cut Pro, Premiere Pro, Avid, the OTIO viewer); an unavailable editor stays `not_run` and no compatibility is claimed.
- The approval seal stops accidental dispatch and agent shortcuts; it is not a defence against a hostile process in the same account.

## How approval is recorded

An approval record is made by a person at a terminal, not by an agent: `node skills/rasanai/scripts/eval.mjs approval record --wording "<your exact words>" --kinds unit --cases <ids> --commands "<exact command>" --max-wall-s <n> --repairs false`, then type the confirmation line it prints (it names the candidate digest). It refuses inside Claude Code, Conductor, Codex and CI, and without a terminal. The record, its seal and a dispatch ledger live outside the repo (`<state dir>/test-approval/`). Narrow stays narrow: kinds, case ids and command strings are exact (no wildcards); a changed candidate needs a new approval unless `--repairs true` and the approved commit is still an ancestor; `eval.mjs approval withdraw` stops new dispatch immediately (active owned work is stopped by its owner). Check without dispatching: `eval.mjs approval status` and `eval.mjs approval check --kinds ... --cases ...`.

## Approval request wording (for the lead to show the user)

> RasanAI Plans 01-13 are implemented but unvalidated (candidate: base commit 68a5609 plus the uncommitted diff, digest to be shown by `eval.mjs inventory`). Nothing has been tested. May I test? Please choose any subset, each separately: (1) unit and schema checks (70 cases, no renders or models); (2) integration against disposable folders (35); (3) real renders on small synthetic films (18); (4) native Studio GUI on your Mac (8); (5) optional providers (1, needs a named provider and a spend limit); (6) blind model grading then your own review; (7) real agent film trials (5, pre-registered, with a run budget you set). Say whether repair reruns within the same scope are included, the wall-clock limit, whether any paid or live provider call is allowed, and I will not go beyond what you name. Approving tests is not approval to publish, push, buy a licence or touch your real library. You can withdraw at any time.

Until a reply of that kind arrives, stop here.
