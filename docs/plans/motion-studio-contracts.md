# Motion Studio: frozen v1 contracts (lead-owned, do not edit)

Source plan: Heresay briefs RASANAI-MOTION-STUDIO-2026-10-24 (parts 1-4). Paths below are relative to repo root; skill root = `skills/rasanai/`.
Baseline: 68a5609. Integration branch: `feature/motion-studio` (lead only). Workers commit locally in their own worktree; never push.

## Ground rules (every worker)
- Additive only. Own NEW files only. Never edit: SKILL.md, crew.mjs, video.mjs, console.mjs, events.mjs, skill-map.mjs, Package.swift, any existing Swift file, README/CHANGELOG. If a core file needs a change, put a <=15-line patch sketch in your handoff.
- Zero-dependency Node `.mjs` (ESM), match existing scripts' style: header comment with usage, JSON to stdout, exit 0 ok / 1 failed check / 2 usage error. No Python (librosa/numba crash on this Mac). No `npm install`.
- Use `execFile`/`spawnSync` with arg arrays, never shell strings with user paths. Reject path escape (`..`, symlink out of root), remote URLs/scripts in scene code.
- Motion is pure function of time: paused GSAP timeline, no rAF, no Date/Math.random (seeded PRNG only).
- Native Studio UI = pure SwiftUI, dark UI (see docs/brand/studio-ui/README.md and Theme.swift/StudioDesign.swift for tokens). No WKWebView. Never draw the retired light "Watch the first cut" UI.
- Studio never rewrites scene files/score; it only sends actions via the existing `actions.jsonl` transport (see StudioCore/RunTransport.swift).
- Existing name clash: `scripts/motionkit.mjs` + `runtime/rasan-motion.js` (RasanMotion verbs) ALREADY EXIST. The NEW things are `scripts/motion-kit.mjs`, `runtime/rasan-motion-kit.js`, `motion-kit/catalog.json` (a registry of mechanics that wraps/reuses RasanMotion, RasanShape, RasanCamera, RasanUI). Do not modify the old ones; reuse them.
- Testing: ONE small fixture-driven smoke per module (cheap, <30 s, no full renders, no `selftest.mjs` run). Swift workers: one `swift build` at the end, serialized with `until mkdir /tmp/rasanai-swift.lock 2>/dev/null; do sleep 5; done; ...; rmdir /tmp/rasanai-swift.lock`. Heavy renders: only through `scripts/lib/slot.mjs`.
- Handoff (<=15 lines): LANE, BASE, COMMIT, FILES, PUBLIC INTERFACE, WORKING, NOT RUN, INTEGRATION STEPS (for lead), RISKS.

## A. `<run>/reference-motion.json` (schema_version 1)
{ schema_version:1, reference_id, source:{kind:"linked-file"|"url-notes"|"manual-notes", sha256, rights:"inspiration-only"|"owned"|"licensed", basename},
  analysis:{ duration_s, fps_observed, aspect, width, height, has_audio, cuts_s:[], shots:[{start_s,end_s,framing,motion_role,observations:[],confidence:"high|medium|low"}], palette_observed:[], type_treatment:[], motion_patterns:[], sound_hits_s:[], energy_arc:[0..1 per shot], uncertainties:[] },
  recipe:[{observation, viewer_effect, transferable_mechanic, candidate_move, not_transferable:[]}],   // filled by reference-recipe lib
  use:{ transfer:"rhythm-and-mechanics-only", never_reuse:["logos","footage","unlicensed_audio","verbatim_copy"] } }
Absolute paths only in the run's private source manifest, never in this file. Fast mode caps ~24 sampled frames at <=640px.

## B. `motion-kit/catalog.json` (schema_version 1)
{ schema_version:1, items:[{ id:"<family>-<name>-v1", version:1, label, family, role:"entry|emphasis|exit|transition|background|scene|ending", summary, use_when, avoid_when,
  supports:["dom-gsap"|"stage3d"], brand_inputs:[..], motion_inputs:[..], params:{name:{type:"number|string|enum|boolean",min,max,default,enum}},
  requires_assets:[], seek_safe:true, reduced_motion:"<behaviour>", implementation:"runtime/rasan-motion-kit.js:<fnName>" | "runtime/rasan-shape.js:<fn>" ...,
  origin:"original|reused-rasan", license:"RasanAI MIT", credit:"", fixture:"motion-kit/fixtures/<id>.html"|null }] }
Families: kinetic-type, product-ui, shape, camera-space, sound-hit, data-evidence, texture, ending. Target 24-40 items, >=4 per family.
Scene annotation: `data-motion-kit="motion-kit:<id>@<version>"` on the clip root element. JS: `window.RasanMotionKit.apply({id, timeline, target, design, motion, fps, seed, cues, props})` returns `{id, version, duration, hits:[t_s...]}`; binds only to the supplied paused GSAP timeline.

## C. `<project>/motion/element-index.json` (schema_version 1, DERIVED)
{ schema_version:1, build_digest:"sha256 of scene sources", film_version, frame_size:{w,h}, items:[{ element_id:"scene-2.hero-title", scene_id, kind:"text|image|shape|ui|3d|video", label, source_file, source_key, z, active_s:[a,b], editable:[ "text","position","scale","color","timing","motion_preset" ], bounds_samples:[{t_s,x,y,w,h}] (px in frame_size), capability:"dom|projected-3d|raster" }] }
Author convention in scene HTML: `data-el="scene-2.hero-title"` (+ optional `data-el-label`, `data-el-editable="text,color"`). IDs stable across rebuilds; never DOM index or CSS hash. Raster/footage layers: kind video/image, editable only clip-level (no text). Stale if build_digest differs.

## D. `<run>/motion/edits.jsonl` (append-only, schema_version 1 per line)
{ schema_version:1, id:"edit-001", film_version, time_s, scene_id, element_id|null, region_norm:{x,y,w,h}|null, operation:"modify|retime|reorder|replace|remove", fields:{}, instruction, source:"studio-final|cli", status:"requested|accepted|applied|rendered|failed|reverted", status_at, note, patch:{files:[],digest}|null }
Status lines are appended (latest line per id wins). Idempotent on id. Never mark `applied` before source changed AND new preview exists. Checkpoint of affected authored files kept at `<run>/motion/checkpoints/<id>/`. Studio action envelope: existing actions.jsonl line with `kind:"motion-edit"` and the D object under `edit`.

## E. Renderer adapters (`scripts/renderer-adapters.mjs`)
`doctor` -> JSON {adapters:[{id:"hyperframes"|"remotion"|"openfilm"|"rive", available, reason, license_status, enabled(feature flag), limits}]}. hyperframes is the only default. Others disabled unless env `RASANAI_ADAPTER_<ID>=1` AND license note shown; absence never breaks default rendering. Semantic interface: {id, available(), analyze(project), renderPreview(project,opts), renderFinal(project,opts)} as plain .mjs objects.

## Swift model contract (W13, Codable, all new fields optional, unknown keys ignored)
StudioCore/MotionStudio/: MotionReferenceSummary (A), MotionKitItem (B), MotionElementIndex/MotionElementHit (C), MotionEditRequest/MotionEditStatus (D), `MotionEditEnvelope.action(...)` building the actions.jsonl line, safe project-relative path helper. UI lanes (W09/W10/W11) consume these types; until W13 lands they code against the shapes above via their own small private structs named `*Draft` is NOT allowed: import the W13 types (lead merges W13 first; W09-W11 receive its file contents in their prompt).

## Ownership (new namespaces only)
W01 scripts/reference-motion.mjs, scripts/lib/reference-motion/**
W02 scripts/lib/reference-recipe/**
W03 motion-kit/catalog.json, motion-kit/README.md, motion-kit/fixtures/** (catalog-only fixtures)
W04 runtime/rasan-motion-kit.js
W05 scripts/motion-kit.mjs, scripts/lib/motion-kit/**
W06 scripts/element-index.mjs, scripts/lib/element-index/**
W07 scripts/editor-patch.mjs, scripts/lib/editor-patch/**
W08 stage3d/recipes/**
W09 apps/macos/Sources/RasanAIStudio/MotionReferenceUI/**
W10 apps/macos/Sources/RasanAIStudio/MotionInspectorUI/**
W11 apps/macos/Sources/RasanAIStudio/MotionLibraryUI/**
W12 scripts/renderer-adapters.mjs, scripts/lib/renderer-adapters/**
W13 apps/macos/Sources/StudioCore/MotionStudio/**
W14 docs/plans/motion-studio-licenses.md (+ notices under skills/rasanai/third_party/motion-studio/); provides a SOURCES.md subsection as a text file docs/plans/motion-studio-sources-section.md for the lead to splice
W15 skills/rasanai/references/motion-studio.md
W16 scripts/tests/fixtures/motion-studio/**, scripts/tests/motion-studio.mjs
