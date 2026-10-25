# RasanAI - Sequenced Studio Upgrade / Implementation Coordinator

**Revision 2: audited and enhanced. Start here. Implement 01-13, then STOP for explicit testing approval.**

This package consolidates the Motion Studio plan, the Hybrid Film Studio plan, the motion-graphics story research, and the subsequent efficiency and professional-production research. It is an implementation roadmap for a Sonnet agent working inside `Sibhimanyu/rasanai`, not a claim that these features have been implemented or validated.

Research date: **2026-10-25**. Public repository snapshot: `20ea14748daaee007cb4eaf5ba8aee91c09b1c4a`. The user's local checkout may be newer. Inspect and preserve it before making changes. Never revert local work to this research snapshot.

## 0. What this audited revision changes

This revision preserves the fourteen-stage order and original scope, and supersedes earlier packages for this upgrade. It adds concrete rule migration, end-to-end wiring receipts, stronger edit/undo correctness, render-output provenance, resource admission and scope-aware source reuse. Read [AUDIT_AND_ENHANCEMENTS.md](AUDIT_AND_ENHANCEMENTS.md) for findings and evidence limits. This is a planning/static-source review; no RasanAI pipeline or tests were executed.

The lead reads [RULE_MIGRATION_MAP.md](RULE_MIGRATION_MAP.md) and [INTEGRATION_CLOSURE_MATRIX.md](INTEGRATION_CLOSURE_MATRIX.md); workers receive only relevant rows. Use [REFERENCE_REUSE_MATRIX.md](REFERENCE_REUSE_MATRIX.md) instead of re-researching or installing every external skill. An unresolved optional dependency never becomes a fake completed capability and never authorizes extra expenditure.

Package control is authoritative for this implementation task: **01-13 -> implementation report -> explicit user approval -> only the authorized Plan 14 scope**. A local plan file or a worker cannot grant approval. Prior Heresay tasks with repeated-smoke instructions are superseded for this consolidated upgrade; they have not been edited or withdrawn by this package.

## 1. Product outcome

A film should communicate the right idea for its purpose, look and sound coherent, remain editable, use the user's brand and real facts, and avoid unnecessary agent work. Preserve HyperFrames, Rasan3D/Rasan2D, existing motion primitives, the native SwiftUI Studio, the file-based console protocol and the existing authoring authority. This is not a Remotion rewrite, a second timeline editor or an invitation to install every external skill.

The central example is the user's failed ChatGPT launch concept headed "Desire." Fix the decision process that produced that vague treatment, not just that word. A broad product introduction, a single-feature announcement, a tutorial and an identity film need different structures. The revised system must choose among them from the brief, not force villains, dramatic reversals, metaphor bans or one mandatory peak position onto every film.

## 2. Three distinct sequences

### Implementation sequence: the order in which to change this repository

Execute **01 -> 02 -> 03 -> 04 -> 05 -> 06 -> 07 -> 08 -> 09 -> 10 -> 11 -> 12 -> 13 -> STOP: AWAIT USER TESTING APPROVAL -> 14 (approved scope only)**. Each plan has parallel worker lanes inside it. Continue through Plans 01-13 when each implementation handoff is integrated. Reaching Plan 14 does not authorize any testing.

This strict stage order is deliberate. Do not start all fourteen plans against incompatible evolving contracts. Read-only reconnaissance and authoring a later stage's fixtures are permitted early, but do not merge later-stage behavior ahead of its prerequisites. A worker finishing early can help another independent task within the active plan.

### Film creation sequence: the behavior the finished product must implement

**Brief -> Story -> Look -> Storyboard with timed animatic -> Build -> Final.** There are five creative approvals: Brief, Story, Look, Storyboard, Final. Build is activity, not a sixth approval.

- Story decides the communication, beat progression, exact proposed copy and demonstrations. It can describe meaningful visual events, but does not lock finished composition or choreography.
- Look decides the visual language using comparable representative styleframes from the approved story. These are not a full storyboard.
- Storyboard translates the approved story and look into shots, panels, actions, editorial relationships and timed playback. Full storyboard production begins only after Look is approved or explicitly inherited.
- Small rough sketches needed to understand a treatment may exist before Look, but are labeled exploratory. No automatic motion-rough production for all rejected stories.
- Existing "Just make it" and saved-series behavior can resolve approvals automatically only under the user's existing authorization. Final remains visible. A stage is recorded as inherited/auto-decided, never silently omitted.
- Provider, rights and permission consent are operational controls, not extra creative choices.

### Development verification sequence: when to test this upgrade

**Implement 01-13 first, then stop and wait for explicit user approval to test.** Plan 14 is approval-gated, not an automatic final step. This supersedes both the earlier repeated-smoke instructions and the earlier instruction to begin testing automatically at the end.

## 3. Testing policy - explicit and binding

During Plans 01-13 and until explicit testing approval has been received:

1. Do not run a real film, an agent production trial, a renderer/browser smoke, a live model request, GUI visual QA, a benchmark, or an end-to-end test.
2. Author test code and fixtures as part of the implementation, but leave execution to user-authorized Plan 14. Defer unit and integration suites too, so the policy cannot be bypassed by renaming a pipeline test.
3. Syntax checks, schema-file parsing, type checking, diff inspection and compilation are permitted only when they do not invoke rendering, generation, browser probes, test hooks or application workflows. Read a script before assuming it is compilation-only. Do not run build scripts that silently execute smoke tests.
4. Use `implemented_unvalidated` after a code handoff. Do not write "passes," "works," "rendered," "tested" or a speedup percentage without evidence from a real run.
5. Preserve old CI definitions and production runtime validation. Do not add a universal `skip_tests`, remove checks, fabricate success records or turn off safety gates in shipping code.
6. Keep changes local unless the user separately authorizes a push. Do not bypass protected-branch checks or alter CI policy to conceal untested code.
7. Missing runtime knowledge remains a documented capability assumption and a final-stage test case. Implement capability negotiation and an honest fallback rather than pretending the uncertainty is resolved.

After Plan 13, stop at `awaiting_test_approval`. Provide an implementation summary and a proposed test scope, candidate revision, exact commands/manual steps, expected provider/resource use, and known blockers. Ask the user for permission to begin that testing and wait; do not launch it while awaiting a reply. Record the actual approval message and its scope before dispatching any Plan 14 worker. No worker or agent may approve on the user's behalf. See [Testing approval gate](TESTING_APPROVAL_GATE.md).

Only after explicit approval may Plan 14 run the authorized checks, native interactions, renders and bounded trials. Limit targeted repair reruns to that approved scope and budget. Broader testing, new paid usage or materially changed scope requires renewed permission. If an environment, credential, license or review is unavailable, record `blocked` or `not_run`; never convert it to a pass. No release or broad "validated" claim before the required final evidence exists.

Do not indirectly trigger tests through background workers, hooks, CI, pushes, pull requests or build scripts. Hold the triggering operation rather than disabling a safety check or bypassing a hook. Preserve ordinary product runtime validation; this gate controls development testing of this upgrade.

This postponement trades earlier feedback for fewer repeated pipeline runs. Keep the upgrade isolated and reversible because integration defects may only be discovered at the end.

## 4. First actions for the implementation lead

1. Inspect `git status`, local branch and HEAD, repository instruction files, previous implementation ledgers, recent source changes and the existing model/harness configuration. Do not reset, stash, discard or overwrite the user's changes.
2. Read `REPOSITORY_MAP.md`, `COVERAGE_AND_SUPERSESSION.md` and the local equivalents of the listed contracts. This is an inventory, not a new planning project.
3. Record a baseline commit/reference and preserve existing delivered films and benchmark artifacts without rerunning them. Baseline production runs, if needed, happen only after testing approval in Plan 14 in an isolated checkout.
4. Establish an integration branch/worktree according to the repo's existing conventions. Create `docs/plans/studio-upgrade/implementation-status.json` (proposed location) with plan, task, owner, input contract version, files, commit, status, pending checks and blockers.
5. Read-only audit workers may simultaneously map engine contracts, native UI and legacy paths, skill/crew routing, and dependency/license evidence. They return paths and findings, not thousands of lines of source.
6. Implement Plan 01's interfaces before workers depending on them write integrations. The lead alone owns central schema migrations and shared entrypoint wiring.
7. Dispatch scoped jobs for the current plan, integrate their code, record the handoff and continue to the next implementation plan through 13. Do not ask for routine approval between 01-13. After 13, stop and request explicit testing approval; never dispatch Plan 14 automatically.

## 5. Sonnet worker policy

Use the user's requested Sonnet model available in the actual harness. Prefer Sonnet 5.5 where genuinely available; resolve the configured supported identifier instead of inventing a CLI model string. Record the actual model. Do not silently upgrade to a more expensive model or change the account/provider.

Aim for **up to 8-12 useful parallel implementation workers** when the active plan contains that many independent tasks. Smaller plans should use fewer. Scale to available provider limits, memory and useful work; an idle agent is not progress. Do not spawn recursive teams or one agent per tiny function. Keep the lead responsible for contracts, integration and conflict resolution.

Use isolated worktrees when supported. Otherwise assign disjoint files and enforce one writer per file. Each job must have:

```json
{
  "task_id": "P03-copy-lint",
  "plan": 3,
  "contract_version": 1,
  "base_revision": "actual-local-revision",
  "inputs": ["specific required paths"],
  "write_allowlist": ["specific owned module or test paths"],
  "forbidden_writes": ["shared entrypoints owned by the lead"],
  "outputs": ["implementation and deferred fixtures"],
  "verification_mode": "explicit_user_approval_required",
  "test_approval_ref": null,
  "status": "assigned"
}
```

Workers return changed paths, commit/patch, a concise explanation, pending verification and blockers. They must not paste complete code or research into the lead's conversation. Workers needing a shared change request it from the owner. A handoff from an obsolete contract/base must be reconciled before integration.

Stop or reclaim workers that repeat exploration without useful output. Retry transient provider errors with backoff; do not burn tokens in loops. Do not promise work continues after the supervising session ends. Persist actual job state and stop or explicitly hand over owned processes before ending.

**Development concurrency is not film-production concurrency.** Plan 09 will implement an adaptive runtime scheduler; do not bake an 8-12-agent minimum into every 30-second film.

## 6. Shared architecture rules

- `motion/score.json` remains the authored timing authority for scene-based films; existing cut/reel authority remains for footage-led routes. `motion/events.json`, indexes, render graphs and review sheets are derived. No independent writable second timeline.
- Add typed intent/approval metadata around existing files. Do not change every legacy JSON format wholesale merely to make it look uniform.
- `console.mjs` remains the live `session.json` writer. SwiftUI reads snapshots and appends supported actions under the existing action lock. A native inspector must not write scene files directly.
- Story, look and storyboard approvals pin exact content revisions. A late worker cannot overwrite a newer choice.
- Brand assets, claims, rights, source permissions and privacy survive every path, including neural footage and revisions.
- Feature flags are capability and rollout controls, not a substitute for implementation. Disabled placeholders are not complete adapters.
- Use original glue code and preserve required licenses. Repository code licensing does not automatically license videos, music, prompts, models, fonts, trademarks or a commercial skill pack.
- Exact render behavior and editability depend on engine capability. Rendered footage remains clip-editable, not magically editable as live DOM objects.

## 7. Completion and handoff states

Implementation states: `not_started`, `in_progress`, `implemented_unvalidated`, `blocked`, `superseded_by_existing`.

Track the coordination gate separately as `awaiting_test_approval`, `approved_for_scoped_testing`, `testing_in_progress`, or `validation_finished`. Only an explicitly user-authorized Plan 14 may add evidence-backed acceptance states: `validated`, `experimental_validated`, `failed`, `not_run`. Store state and evidence separately. A source file existing is not proof of correct behavior.

Each plan's handoff must contain: current commit, files touched, migrated schemas, backward-compatibility decisions, entrypoints wired, fixtures authored, static checks actually run, pipeline checks deferred, known limitations, next plan and exact inputs it can consume.

The final summary distinguishes core completion, optional capabilities, environment blockers, human creative review and release permission. No invented before/after metrics. No publication or Heresay submission is part of this execution package unless separately requested.

## 8. Reading and context budget

The lead reads this file, the repository map and plan index. Each worker reads this policy plus its own plan, contract and relevant source excerpts. Do not load all fourteen implementation plans or every reference skill into every worker. Sources are in `RESEARCH_SOURCES.md`; read only those mapped to the current issue. The reference documents explain why, not instructions to be executed blindly.

## 9. Plan index

| Order | Plan | Primary outcome |
|---|---|---|
| 01 | [Shared contracts, approval boundaries and compatibility](01_FOUNDATIONS_CONTRACTS_AND_COMPATIBILITY.md) | Shared contracts, revision approvals and legacy compatibility |
| 02 | [Brief, facts, brand and audience routing](02_BRIEF_EVIDENCE_BRAND_AND_AUDIENCE.md) | Grounded brief, brand, proof scope and audience |
| 03 | [Format-aware story generation and audience-facing copy](03_FORMAT_AWARE_STORY_AND_COPY.md) | Appropriate story structures and concrete copy |
| 04 | [Look development and film-wide creative direction](04_LOOK_ART_DIRECTION_AND_CONTINUITY.md) | Comparable looks and coherent creative direction |
| 05 | [Storyboard, timed animatic and editorial intelligence](05_STORYBOARD_ANIMATIC_AND_EDITORIAL.md) | Shot panels, editorial relationships and timed animatic |
| 06 | [Visual production, hybrid footage and recurring characters](06_VISUAL_PRODUCTION_AND_HYBRID_MEDIA.md) | Existing motion, hybrid footage, tracking and characters |
| 07 | [Sound, music and voice as part of the film](07_SOUND_MUSIC_AND_VOICE_DIRECTION.md) | Intentional music, voice, cues and mix |
| 08 | [Token-efficient production and selective skill routing](08_TOKEN_EFFICIENCY_AND_SKILL_ROUTING.md) | Selective packets/skills, reuse and honest token telemetry |
| 09 | [Parallel production scheduling and incremental rendering](09_PARALLEL_SCHEDULING_AND_INCREMENTAL_RENDERING.md) | Useful parallel jobs, cache and changed-region renders |
| 10 | [Native directing, meaningful approvals and precise revisions](10_NATIVE_DIRECTING_AND_REVISION_UX.md) | Native approvals, targeted revisions and real Undo |
| 11 | [Recoverable production, security and trustworthy provenance](11_RELIABILITY_SECURITY_AND_PROVENANCE.md) | Crash recovery, permission/privacy and provenance |
| 12 | [Audience adaptation, accessibility and professional delivery](12_ADAPTATION_ACCESSIBILITY_AND_DELIVERY.md) | Audience variants, accessibility and professional handoff |
| 13 | [Creative evaluation, measurable efficiency and bounded learning](13_CREATIVE_EVALUATION_AND_LEARNING.md) | Evaluation infrastructure and scoped learning; no execution yet |
| 14 | [Final integration, pipeline testing, repairs and acceptance](14_FINAL_INTEGRATION_TESTING_AND_ACCEPTANCE.md) | After explicit user approval only: execute the agreed tests, films, UI checks and measurements |

## 10. Prompt to start the implementation

> Read `00_EXECUTE_IN_ORDER.md`. Implement Plans 01 through 13 in sequence with scoped parallel Sonnet workers, exclusive file ownership and coordinated integration. Reuse existing work and preserve Story -> Look -> Storyboard and the five creative approvals. Author tests but do not execute any tests, pipeline runs, renders, GUI QA or benchmarks. After Plan 13, report the implementation as unvalidated, show the proposed testing scope, and STOP at `awaiting_test_approval`. Do not enter Plan 14 until I explicitly approve testing. My approval applies only to the agreed scope; silence, general implementation permission and film approvals do not count. Preserve safeguards, do not push or publish, and report genuine blockers.

## Supporting files

[Repository map](REPOSITORY_MAP.md) | [Research sources](RESEARCH_SOURCES.md) | [Coverage and supersession](COVERAGE_AND_SUPERSESSION.md) | [Deferred verification matrix](DEFERRED_TEST_MATRIX.md) | [Worker handoff template](WORKER_HANDOFF_TEMPLATE.md) | [Testing approval gate](TESTING_APPROVAL_GATE.md).