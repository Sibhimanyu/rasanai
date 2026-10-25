# Plan 01 reuse matrix

Verified against the tree on 2026-10-25. Status: reuse = exists as needed, partial = exists but incomplete, missing = nothing today.

| Requirement | Existing implementation path | Status | Gap | Owning plan |
|---|---|---|---|---|
| One logical stage vocabulary | Hardcoded tables in ~10 places: `console.mjs` STEPS (24 names) and LABELS, `lib/locks.mjs` LAYERS, `handoff.mjs` INVALIDATES; Swift `StageRoute`, `ProgressPhaseMapper`, `Session.ReviewStage.consoleStep`, `CallNotices`, `SessionDigest.StepCatalog`, `StepPanel` | partial | Tables disagree (`build` is animatic in Session, final in CallNotices, own stage in StageRoute; `styleframes` is look in Session, its own call in CallNotices). New `LogicalStage.from(legacyStep:)` in `StudioCore/Contracts.swift` is additive and unwired | 01 |
| Approval record with revision, digest, dependencies | `actions.jsonl` type `approve` (`console.mjs`), `session.locks` hash snapshots (`lib/locks.mjs`) | partial | No schema_version, revision, artifact digest or depends_on on the record. `ApprovalRecord` model exists in Swift, no writer | 01 |
| Dependency graph and approval invalidation | `handoff.mjs --revise --reopen` INVALIDATES (file moves); `locks.mjs` layer hash compare | partial | No stage dependency graph; invalidation is per-script file list, not derived from approvals | 01 |
| FilmBrief | `rasanai-brief.json`, `FilmDraft`, `BriefSeed` | partial | No communication_kind, viewer, destination, scope, takeaway, must_show, evidence_refs, assumptions. Swift `FilmBrief` model added, no producer | 01 |
| StoryTreatment | `story/chosen.json`, `story/intent.json`, `research/claims.json` | partial | Shape is by script, not a versioned contract; no stable beat ids guaranteed | 01 |
| LookContract | `look/DESIGN.md`, `look/frame.md`, `motion.md`, `video-decisions` look | partial | Raw markdown; no structured record | 01 |
| Storyboard with stable beat/shot/panel ids | `scenes.json`, `frames/shots.json`, `motion/score.json` | partial | Ids are scene ids; no shot or panel ids | 01 |
| WorkerPacket | `crew.mjs brief --role --key` | partial | Brief is prose; no typed packet with inputs and digests | 01, 09 |
| RevisionRequest with idempotency key | `actions.jsonl` comment/redo, `handoff.mjs --revise` | partial | No idempotency key; redo is not deduplicated | 01 |
| Capability (implemented/available/enabled/permitted/verified, each with reason) | Scattered: `DirectorPermissions`, `DirectorHealth`, `FilmPreflight`, `models.mjs` | missing | No single record; five states are conflated | 01 |
| Single session writer | `console.mjs` push/ask/actions; Swift app also reads/writes session files | partial | Two writers possible; no lock/ownership rule | 01 |
| Schema versioning and migration | None on session, actions, locks | missing | No schema_version anywhere; Swift models treat missing as legacy | 01 |
| Stage metadata file `lib/stages.json` / `stages.mjs` | Being created by another worker | missing (in progress) | Not in tree at time of check | 01 |
| `skill-map.mjs`, `references/film-events.md` | Not in current tree; only old `.context` copies | missing | Do not cite as existing | 01 |
| Briefing package (communication_kind, evidence_refs, assumptions) | Plan 02: `lib/briefing.mjs` extends `defaultFilmBrief` in `lib/contracts.mjs`; ledger stays `research/claims.json` (`evidence.toEvidence` reads it) | partial | Producer exists, no console writer or consumer yet | 02 |

## Plan 06 reconcile (V1), verified 2026-10-25

Source of truth: the Motion Studio (PR #188, branch `feature/motion-studio`) and Hybrid Film Studio (`phase2/hybrid-film-studio`) commits are not ancestors of `master` or this branch; their skill-side files were restored here as new files (see the Plan 06 notes in `INTEGRATION_CLOSURE_MATRIX.md`). Evidence status words follow `hybrid-film-contracts.md`; a compile is implementation evidence only.

| Requirement | Existing implementation path | Status | Gap | Owning plan |
|---|---|---|---|---|
| Motion kit catalog and runtime | `motion-kit/catalog.json`, `runtime/rasan-motion-kit.js`, `scripts/motion-kit.mjs`, `lib/motion-kit/` (restored) | partial | 21 of 32 rows implemented (12 kit mechanics + 9 reused verbs); 11 catalogued only; `implemented` now surfaced and enforced | 06 |
| Element identity (`data-el`) and index | `element-index.mjs`, `lib/element-index/` (restored); kit hosts register their own | reuse | static scan does not see runtime-created kit hosts; the browser probe does | 06 |
| Edit authority | `editor-patch.mjs`, `lib/editor-patch/` (restored); `console.mjs` `motionEditHook` (new) | reuse | the Studio side that writes `motion-edit` lines is on the branch | 06 |
| Renderer adapters | `renderer-adapters.mjs`, `lib/renderer-adapters/` (restored); HyperFrames only enabled | partial | OpenFilm / Remotion / Rive are disabled placeholders; the V8 readiness contract is new (`lib/readiness.mjs`, `lib/scene-adapter.mjs`) | 06 |
| Generated plates | `video-generation.mjs`, `lib/video-generation/` (restored); `lib/provider-jobs.mjs` (new) | partial | ComfyUI path implemented against a fake HTTP server on the branch; never run against a real model; unknown_outcome, consent, provenance added here | 06 |
| Tracking (planar quad) | `track.mjs`, `vision/track.swift` (restored), `lib/tracks.mjs` (new) | partial | manual and Apple Vision levels; no bbox producer, no mask, no SAM, no depth | 06 |
| Screen replacement | `composite.mjs`, `lib/hybrid-compositor/` (restored) | partial | perspective warp, soft edge, matte input; matte producers do not exist | 06 |
| Rasan3D actor / canon | `stage3d/character-rig.js`, `lib/canon3d.mjs`, `canon.mjs` (restored) | reuse | six emotions, no viseme channel | 06 |
| Rasan2D actor | `stage2d/`, `stage2d.mjs`, `lib/stage2d.mjs` (restored) | reuse | 31 emotions; a viseme is an emote with a `mouth` override (added) | 06 |
| Character performance tracks (C7) | `lib/character-performance.mjs` (new) | partial | data contract, pose, bridge and measured alignment; no phoneme aligner; no `cast/` writer CLI | 06 |
| Capability record (six axes) | `lib/capabilities.mjs` over Plan 01 `contracts.mjs` `Capability` | partial | no Swift view reads it | 06 |
| Incremental render, cache, OTIO | `hybrid-graph`, `render-cache`, `hybrid-render` on the branch only | missing here | Plan 09 | 09 |
