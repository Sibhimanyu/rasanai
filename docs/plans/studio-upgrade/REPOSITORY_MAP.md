# Repository map and integration authority

**Snapshot:** `20ea14748daaee007cb4eaf5ba8aee91c09b1c4a`, public master inspected 2026-10-25. These paths are a navigation map, not an instruction to overwrite files. Read local `CLAUDE.md`/`AGENTS.md`, current manifests and status first. Preserve changes newer than the snapshot.

## Observed architecture

| Area | Existing location / interface | Owner rule |
|---|---|---|
| Skill entrypoint and workflow routing | `skills/rasanai/SKILL.md`, `references/workflows/`, `scripts/skill-map.mjs` | Lead registers changes; keep entrypoint compact |
| Crew and task packets | `skills/rasanai/scripts/crew.mjs`, `agents/`, `references/crew.md` | Lead integrates shared dispatch and policy |
| Story and copy | `agents/script-writer.md`, script editor/planner roles, `scripts/story.mjs`, `references/story.md`, `references/script.md`, `references/intent.md` | Change prompts, schemas and gates together |
| Brand/design/look | Existing `DESIGN.md` adapters, `scripts/design.mjs`, design desk/library and chosen-look files | One selected visual contract per film revision |
| Storyboard/styleframes | Existing `frames.mjs`, shots/boards, `references/styleframes.md`, crew storyboard writer | Panels express chosen Story+Look; final timing derives from score |
| Timing/events | `motion/score.json`, `scripts/events.mjs`, `references/film-events.md` | Score authored; events derived, never independently hand-edited |
| Visual primitives | `runtime/rasan-motion*`, shape/camera/UI runtimes, motion kit, `stage3d/`, Rasan2D | Shared runtime owner; scene workers consume frozen APIs |
| Rendering/finish | `scripts/video.mjs`, `finish.mjs`, `reel.mjs`, `quick-film.mjs` and `scripts/lib/slot.mjs` | Reuse render limits and existing formats; no second master clock |
| Audio | `scripts/sound.mjs`, `music.mjs`, `voice.mjs`, score events and word timings | Cue plans refer to canonical timing |
| Motion Studio editing | `reference-motion.mjs`, `motion-kit.mjs`, `element-index.mjs`, `editor-patch.mjs` | Derived index, semantic IDs, append-only edit transactions |
| Optional adapters | `renderer-adapters.mjs` and current implementation counterparts | Disabled placeholders do not count as complete |
| Session transport | `scripts/console.mjs`, live `session.json`, `actions.jsonl` | Engine owns session writes; UI appends supported locked actions |
| Native app | `apps/macos/Sources/RasanAIStudio/`, `apps/macos/Sources/StudioCore/` | Preserve SwiftUI/AppKit/player structure; no web-app rewrite |
| Browser console | `skills/rasanai/console/index.html` | Share the same approval/action semantics |
| Evaluation/tests | `scripts/benchmark.mjs`, `regression.mjs`, `selftest.mjs`, `scripts/tests/`, `apps/macos/Tests/` | Author throughout; execute in Plan 14 only after explicit user approval |
| Sources/licenses | `skills/rasanai/third_party/SOURCES.md`, existing notices/intake/backlog | Preserve provenance; each dependency/media category separately |

Some rows contain grouped names from the prior inspected repository documentation rather than a full directory enumeration. Locate exact current files/symbols before assigning write ownership. A moved file is not permission to create a duplicate at the old path.

## Proposed new metadata (reuse equivalent current modules)

The names below are suggestions, not claims that these files already exist:

- `docs/plans/studio-upgrade/implementation-status.json`: plan/task implementation and deferred verification state.
- `docs/plans/studio-upgrade/contracts.md`: compact shared versions and authority map.
- `<run>/production/approvals.json`: revision-bound approvals if current approval storage lacks an equivalent.
- `<run>/production/tasks.jsonl`: job/lease events if no existing supervisor log provides the required semantics.
- `<run>/production/packets/`: role-specific packets with exact artifact digests, or the current `crew/prompts/` equivalent.
- `<run>/production/reports/`: non-secret telemetry and evaluation reports, or the current reporting location.

Do not create these merely to match a plan. Plan 01 chooses one canonical location after inventory; later workers use it. Existing Hybrid Film Studio paths such as `hybrid/sources.json`, derived edit graph, cache metadata, job provenance and character tracks should be reused if already implemented locally.

## Sources of truth

1. User brief and explicit approvals define creative intent and permitted work.
2. Research/claims and brand assets define factual and identity constraints.
3. Selected Story defines meaning, copy and beat order; selected Look defines visual language.
4. Storyboard defines detailed shots/panels and proposed timings until reconciliation; final authored timing belongs to the existing score or route cut authority.
5. Event timelines, shot indexes, render graphs, cache indexes and UI projections are derived.
6. Session state is written by the existing engine; UI sends actions rather than competing writes.
7. The edit log and checkpoints govern revision/undo; a UI preview is not committed source.

## Known contradictions to reconcile, not copy forward

The inspected script prompt applies drama rules broadly while format guidance is narrower. The native Fast description launches all scenes while engine direct mode favors one film builder. Prior plans request repeated smoke tests while the user's current instruction requires explicit approval before any testing. Resolve each explicitly through Plans 01/03/08/09 and Plan 00's test policy; do not leave conflicting instructions in different files.

Public status records partial implementation and missing validation. The local checkout may contain completed work. Classify capabilities from code and existing evidence without running the pipeline until explicit user testing approval permits Plan 14. `superseded_by_existing` means no redundant rewrite is needed, not that missing validation can be fabricated.

## Read budget

Do not send this full map, fourteen plans, every source document and all project history to every worker. The lead resolves actual symbols and provides a narrowed packet. Keep mandatory authority/security rules and the relevant approved creative artifacts; exclude unrelated routes and rejected ideas.

## Revision 2 static findings to reconcile locally

- `scripts/lib/slot.mjs`: managed admission currently has fail-open paths on timeout/unwritable slot directory and memory timeout (A01). Plans 09/11 own the compatible correction.
- `scripts/lib/editor-patch/index.mjs`: checkpoint Undo, duplicate action handling and preview acceptance need explicit revision/payload/output identity protections (A02). Plans 10/11 own them.
- `scripts/crew.mjs`: inspect the `full` reference in `sourceResearch` against actual lexical scope before changing the policy interface (A03).

No finding above was reproduced by execution. Local code may already differ. Use the [integration closure matrix](INTEGRATION_CLOSURE_MATRIX.md) and [rule migration map](RULE_MIGRATION_MAP.md) to avoid partial fixes.
