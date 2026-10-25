# Plan 01 - Shared contracts, approval boundaries and compatibility

**Repository:** `Sibhimanyu/rasanai`  
**Executor:** Sonnet implementation lead and scoped Sonnet workers  
**Sequence:** 01 of 14 implementation stages; coordinator is Plan 00  
**Prerequisite:** Plan 00 integrated as implementation, not yet pipeline-tested.  
**Research snapshot:** 2026-10-25; public HEAD inspected at `20ea14748daaee007cb4eaf5ba8aee91c09b1c4a`. Local HEAD wins.

## Execution and verification policy

Implement this plan inside the actual RasanAI checkout. Read `00_EXECUTE_IN_ORDER.md` and the predecessor handoff first, then only the repository files relevant to your assignment. Preserve existing working features and uncommitted changes. All proposed filenames/APIs below must be reconciled with the local checkout; extend an equivalent existing implementation instead of creating a duplicate.

**Testing requires the user's explicit approval, including in Plan 14.** Implement Plans 01-13, integrate the changes, and author fixtures/tests without executing them. Then stop at `awaiting_test_approval`, report the implemented candidate, and present the proposed testing scope, commands and resource/usage implications. Do not enter Plan 14 automatically. Only a subsequent explicit user instruction approving testing authorizes its agreed scope; this plan, silence, a general instruction to continue implementation, or approval of a film's Story/Look does not.

Until that approval, no unit/integration suites, agent film trials, browser/render smokes, GUI QA, live provider probes, end-to-end runs or benchmarks may run, whether directly, through workers, hooks or CI. Read-only inspection, syntax/schema parsing, type checks and compilation remain permitted only when they execute no tests, workflows or runtime probes. Hold any operation that would trigger tests; do not disable safeguards to bypass them. Record implementation as `implemented_unvalidated`. Preserve normal product runtime safeguards and creative approvals. See [Testing approval gate](TESTING_APPROVAL_GATE.md).

The implementation lead owns shared entrypoints and schema changes. Use parallel Sonnet workers for genuinely independent file-owned tasks; do not manufacture concurrency or let workers edit the same shared files. No remote push, public release, paid dependency purchase, new paid generation, destructive migration or permission escalation is authorized by this document alone.

## Repository entrypoints to locate

Start with these current or previously documented locations; verify their local equivalents before editing. Read only the symbols relevant to your assigned lane. Shared entrypoints remain lead-owned.

- `skills/rasanai/scripts/crew.mjs`
- `skills/rasanai/scripts/console.mjs`
- `skills/rasanai/references/film-events.md`
- `apps/macos/Sources/StudioCore`

## Outcome

Establish one compatible contract for the improved production workflow before specialist workers change behavior. Do not rewrite the media engine. Replace ambiguous stage naming, stale-result handling and implicit ownership with explicit metadata around existing artifacts.

## Inspect and reconcile

Read the current skill entrypoint, `references/workflows/shared-contract.md`, `scripts/crew.mjs`, `scripts/skill-map.mjs`, `references/film-events.md`, Motion Studio contracts, Hybrid Film Studio implementations if present, `apps/macos/README.md`, and the actual Swift session/action models. Source observations R01-R07 in the research ledger identify the inspected baseline; local code takes precedence.

Create a reuse matrix: requirement -> existing implementation path -> status from source inspection -> gap -> owning plan. In particular locate semantic edit IDs, event exports, cache nodes, provider jobs, track data, character canon, budget accounting and current storyboard UI. Missing functionality is implemented later by the assigned owner, not re-created here.

## Implementation tasks

### F1. Define stage semantics without breaking old runs

Introduce logical stages `brief`, `story`, `look`, `storyboard`, `build`, `final`. Map existing `animatic`/`preview` transport keys to the appropriate logical stage through compatibility readers; retain supported legacy actions. A saved old run must not be rewritten on read.

Make `storyboard` a five-call approval, with build as activity. Exact mappings belong in one engine registry used to generate/read native mappings, not two unrelated hardcoded tables. Record inherited decisions separately from human approvals. A registered series look can satisfy Look; a model's opinion cannot.

### F2. Version approvals and artifacts

Use the repo's established schema naming conventions. Proposed additions are illustrative contracts, not a forced file-format replacement:

```json
{
  "schema_version": 1,
  "stage": "look",
  "artifact_ref": "design/chosen.json",
  "artifact_digest": "sha256-of-canonical-content",
  "revision": 3,
  "approved_by": "user",
  "source_action_id": "stable-action-id",
  "depends_on": [{"stage":"story","revision":2,"digest":"..."}]
}
```

An approved revision is immutable. Later edits create a new revision and a computed invalidation set. A text-only correction need not reopen unrelated approvals; a new proposition, claim or look requires the appropriate renewed decision. Preserve the last valid delivered version while descendants rebuild.

### F3. Freeze shared input and output contracts

Write a compact contract record for:

- `FilmBrief`: communication kind, viewer, destination, scope, single takeaway, duration/aspect, must-show items, evidence references, sound/accessibility needs and approval mode.
- `StoryTreatment`: audience-facing title, logline, narrative progression, meaningful beat events, exact copy/VO, claim coverage, not final camera coordinates.
- `LookContract`: brand tokens, visual hierarchy, typography, composition rules, material/camera/motion language and exclusions.
- `Storyboard`: stable beat/shot/panel IDs, start/action/end states, reading windows, transitions, asset references and timing source. Final timing remains in the existing authored score.
- `WorkerPacket`: task, input digests, output paths, model policy, ownership, stop conditions and acceptance metadata.
- `RevisionRequest`: exact film/source revision, semantic target, intended change, preservation constraints and idempotency key.
- `Capability`: available, implemented, enabled, permitted and verified are separate states, each with evidence/reason.

Do not require every scene to use the same visual engine. Carry immutable input IDs across layers.

### F4. Define invalidation centrally

Proposition/claims change -> affected story and descendants. Look change -> affected design/storyboard/build/finish, not product research. Shot timing change -> dependent events, audio alignment and transitions. Local element change -> its shot and any genuinely dependent shared assets/seams. Export encoding change -> assembly/delivery only where mathematically valid.

Return an impact preview before applying user-facing changes. Use stable IDs rather than array indexes. A render graph or element index must name the source revision it derives from.

### F5. Ownership and persistence

Keep the existing single live-session writer. New control-plane JSON is either appended under an existing lock or atomically replaced by its designated owner. Validate project-relative paths and reject symlink escapes. Include crash-safe staging and recovery metadata but leave full supervision behavior to Plan 11.

Consolidate conflicts between Studio Fast-mode instructions and engine direct/deep planning into one runtime policy interface for Plan 09. Do not resolve the conflict by blindly launching a worker per scene.

### F6. Preserve upgrade safety

Read older schema versions through adapters; preserve unknown optional fields where feasible. Back up only within authorized project locations. No destructive bulk migration. Unsupported required schemas fail with a clear explanation and leave the project intact. Feature-dependent data is optional for old runs.

## Parallel lanes and integration

Use separate workers for engine schemas/readers, Swift Codable models, migration/compatibility helpers, and dormant contract fixtures. The lead owns `crew.mjs`, `console.mjs`, central routing and final wiring. Only one worker may change a shared schema at a time.

## Implementation handoff

Deliver a frozen contract revision, reuse matrix, stage/action compatibility map, input-digest helpers, invalidation API, additive Swift models and code paths that consume them. Register pending verification IDs F01-F06. Compilation/syntax inspection may be recorded; no runtime test result exists yet.

## Deferred verification for Plan 14 - only after explicit user approval

Exercise legacy project open with no mutation; story/look/storyboard ordering; inherited vs explicit approvals; stale result rejection; duplicate actions; path traversal and escaping symlinks; corrupted/partial metadata; and a change that invalidates only the correct descendants. Check that reading a run does not consume actions.

## Research basis

R01-R07 for repository boundaries; S01/S05 for distinct production outputs. The strict user-facing ordering is a RasanAI product decision, not a claim that every studio uses an identical process.

## F7. Resolve policy once; do not leave competing instruction sources

Add a small rule-resolution interface to the existing policy/compiler layer, not a new orchestration framework. Each effective rule records `rule_id`, scope, kind (`authorization`, `fact`, `brand`, `format`, `craft_preference`, `resource`), source, version, applicability and override reason. Authorization and factual restrictions are checked independently; a style preference cannot override them. If binding requirements conflict, return a conflict instead of picking whichever prompt was loaded last.

The lead maintains [RULE_MIGRATION_MAP.md](RULE_MIGRATION_MAP.md). Trace every changed creative rule through prompts, model addenda, validators, the skill read map, native pace settings and saved preferences. Retiring a mandatory twist in a writer is incomplete if a checker still requires one. Studio Fast, engine direct/deep and the resource scheduler consume the same resolved production policy. Do not add another silent precedence rule in each consumer.

The inspected `crew.mjs` has a possible scope defect: `sourceResearch()` refers to `full`, while the visible `const full` is inside `planCrew()`. Inspect local code before changing it. Pass an explicit policy argument or derive it from the same policy object; do not rely on a caller-local variable. This is a static finding, not a reproduced runtime failure. Author the non-direct public-source fixture now and run it only after testing approval.

## F8. Freeze cross-stage interfaces to remove forward-dependency traps

Plans 05/07 share timing, 06/09 share rendering, and 08/09 share task/cache metadata. Define their small interface shapes here so earlier stages can integrate with the existing implementation without importing a later module that does not yet exist. Use an explicit unavailable result for a genuinely absent optional capability, not a fake success stub. The later owner replaces the compatible implementation, not the contract.

Record which existing artifact owns each field, which projections are derived, and which module can mutate it. Keep the creative artifact dependency graph separate from the transient execution-job graph; the latter is derived from approved input revisions. Stable artifact identity must not depend on which worker happens to build it.

A stage's implementation handoff requires connected entrypoints, not just files. Complete the [INTEGRATION_CLOSURE_MATRIX.md](INTEGRATION_CLOSURE_MATRIX.md) row with actual caller -> producer -> persisted result -> consumer paths and deferred case IDs. That is source-inspection evidence only, never validation.

## Revision 2 handoff requirement

Update the relevant row in [INTEGRATION_CLOSURE_MATRIX.md](INTEGRATION_CLOSURE_MATRIX.md) with actual source wiring and pending case IDs. Read only the applicable [rule migrations](RULE_MIGRATION_MAP.md) and [reference decisions](REFERENCE_REUSE_MATRIX.md). These documents do not authorize testing.

## Package navigation

[Coordinator and global policy](00_EXECUTE_IN_ORDER.md) | [Source ledger](RESEARCH_SOURCES.md) | [Deferred cases](DEFERRED_TEST_MATRIX.md).

Next: [Brief, facts, brand and audience routing](02_BRIEF_EVIDENCE_BRAND_AND_AUDIENCE.md). Continue after integration; do not run pipeline tests between stages.
