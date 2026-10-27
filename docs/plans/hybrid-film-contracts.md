# Hybrid Film Studio (Phase 2): frozen v1 contracts (lead-owned, do not edit)

Source plan: RasanAI Hybrid Film Studio Phase 2 implementation plan (sections 4, 13, 14, 15). Paths are relative to the repo root; skill root = `skills/rasanai/`; `<film>` = the project dir, `<run>` = the run dir (as in `motion-studio-contracts.md`).
Branch: `phase2/hybrid-film-studio`, based on `origin/master`. Workers commit locally in their own worktree; never push. Lead integrates by dependency.
This file extends, never replaces, `docs/plans/motion-studio-contracts.md` (contracts A-E there stay in force).

## Ground rules (every worker)
- Additive. Own your globs (OWNERSHIP table) only. A core or lead-only file that needs a change gets a <=15-line patch sketch in your handoff, not an edit.
- Zero-dependency Node `.mjs` (ESM), existing scripts' style: header comment with usage, JSON to stdout, exit 0 ok / 1 failed check or unable / 2 usage error (`events.mjs` uses 2 for invalid/stale and 1 for unable; each new CLI states its own table in its header). `execFile`/`spawnSync` with arg arrays; reject `..` and symlink escape on every asset path.
- **No Python on this Mac** (librosa/numba segfault and pop crash dialogs): Node + ffmpeg only. The optional SAM sidecar (W6) is the single exception: it is never started by default, never auto-installed, and absent Python is a clean "unavailable", not an error. Tell every subagent.
- **Swift builds are serialized**: `until mkdir /tmp/rasanai-swift.lock 2>/dev/null; do sleep 5; done; swift build ...; rmdir /tmp/rasanai-swift.lock`. One build at the end of a lane. A GUI build is not an end-to-end test.
- **No DMG, no Sparkle appcast, no release changes.** Releases only through `scripts/release.mjs` and only when the owner asks. Candidate artifacts only.
- **Docs site (`docs/index.html`, `docs/assets/**`) is out of scope.** Never edit it.
- **GSAP drag-editing is flag-gated pending licence review** (GSAP Standard No-Charge licence restricts competing no-code visual animation builders). Direct manipulation of GSAP-authored DOM ships behind `RASANAI_HYBRID_DIRECT_EDIT=1`, default off, with the review item recorded in `docs/plans/hybrid-film-dependencies.md`. Never hide the risk.
- **LTX weights are never bundled and never default-on.** Providers (ComfyUI, LTX, SAM) are opt-in via `RASANAI_HYBRID_<ID>=1` (renderer-adapters style) and consent; the fake provider is the only default-available one.
- Preserve: the five creative calls (Brief, Story, Look, Animatic, Final); HyperFrames as the default renderer; `motion/score.json` as the only authored timeline (new files are derived or subordinate); `console.mjs` as the only writer of live session state; Studio only appends actions to `actions.jsonl` and never edits scene files; old films still open and render.
- Privacy: no untrusted network during frame rendering; linked sources are opt-in; credentials only in their provider store, never in JSON or logs; `inspiration-only` references never become output assets.
- Testing: one small fixture-driven smoke per module (<30 s, no full renders, no `selftest.mjs`). Heavy renders only through `scripts/lib/slot.mjs` (one render/inference slot).
- Handoff (<=15 lines): LANE, BASE, COMMIT, FILES, PUBLIC INTERFACE, WORKING, NOT RUN, INTEGRATION STEPS (for lead), RISKS, plus the status word (below) for each feature.

## Common document rules (C1-C8)
UTF-8 JSON with `schema_version` (integer 1); stable semantic ids (never DOM index or CSS hash); paths relative to the approved root; explicit units (`_s` seconds, `_norm` 0..1, px); derived documents carry `source_digest` or `content_key`. `null` = unknown, never zero. Unknown optional keys ignored; unknown required version fails with a clear message; a migration reader accepts older runs. Digest = lowercase hex sha256 over canonical JSON (sorted keys) or file bytes.

## C1. `<film>/hybrid/sources.json` (authored, optional)
Owner: W4 (schema reader/validator in `lib/hybrid-compositor/`); written by the agent or a CLI of W2, never by Studio.
Required: `schema_version:1`; `assets[]` {`id`, `path` (inside `assets/`), `rights:"owned"|"licensed"|"generated"|"inspiration-only"`, `sha256`, `media:{fps_num, fps_den, width, height}`}; `shot_layers[]` {`scene_id`, `layer_id` ("<scene_id>.<name>"), `kind:"owned-footage"|"generated-plate"|"image"`, `asset_id`, `in_s`, `duration_s`, `render_role:"background"|"foreground"|"matte"|"screen-content"`, `z_index`}.
Subordinate to existing scene/shot ids; the footage/reel cut files stay the authority for trim and order. No free-standing `timeline.json`.
Validation: every `asset_id` resolves; `sha256` equals the file; path passes sandbox (no escape/symlink out); `rights:"inspiration-only"` rejected as a render source; fractional fps kept as the exact fraction; `in_s + duration_s` within asset duration (probed); `layer_id` unique and `scene_id` exists in `motion/score.json`.

## C2. `<film>/hybrid/edit-graph.json` (derived, never hand-edited)
Owner: W1 (`scripts/hybrid-graph.mjs`, `scripts/lib/hybrid-graph/**`). Consumers: W2, W10, W7 (invalidation), W8 (read-only).
Required: `schema_version:1`; `source_digest` (of score + cut decisions + C1 + effects + events); `fps:{num,den}`; `frame_size:{w,h}`; `nodes[]` in stable order, one per stage kind `source-decode|trim|track|mask|perspective-warp|scene-render|comp|color-finish|sound-mix|package`, each {`id`, `kind`, `scene_id|null`, `content_key`, `depends_on:[node ids]`, `output:{kind:"video|audio|alpha|data", width, height, fps_num, fps_den, pix_fmt, color_space, alpha}`, `status:"stale|ready|rendering|failed"`}.
Compiler checks `motion/events.json` freshness with `events.mjs check` and re-derives it with `events.mjs export` when stale; it never rewrites the score.
Validation: acyclic (reject cycles), every `depends_on` id exists, ids unique, deterministic (same inputs give byte-identical file), nodes' `content_key` equals C3 key inputs; a hand edit is detected by recompute and overwritten with a warning (as `events.json`).

## C3. Content-addressed cache: `<film>/hybrid/cache/index.json` + `cache/<key>/<artifact>`
Owner: W1 (`scripts/lib/render-cache/**`). Consumers: W2, W7, W10.
The index is rebuildable metadata only; binaries are truth. Publish atomically (write temp in the key dir, fsync, rename) under a per-key lock. Key = sha256 of: normalised node definition; content digests of source bytes; direct dependencies' keys; skill/build version and component version; exact time range; width x height; fractional fps; engine and codec settings; colour pipeline; seeds; shutter/blur/grade settings; external model/workflow identity. Never: clocks, temp paths, undocumented env, tokens.
Required per artifact (`meta.json` beside it): `key`, `expected_frames`, `sample_rate|null`, `color_space`, `alpha:"none|straight|premultiplied"`, `time_base`, `sha256`, `size_bytes`, `created_at`, `tool_version`. Eviction: LRU under a user cap; the delivered version is pinned; in-use keys never evicted.
Validation: a file without valid `meta.json` or with a checksum/frame-count mismatch is a miss, never a hit; killed-mid-write leaves no hit; same node twice gives the same key; changing one scene's text changes only that scene's key and its downstream keys (the Wave 1 proof).

## C4. Generation jobs: `<film>/hybrid/jobs.jsonl` + `hybrid/generated/<job-id>/asset.json`
Owner: W3 (`scripts/video-generation.mjs`, `scripts/lib/video-generation/**`; fake provider + ComfyUI adapter).
Job log lines (append-only, latest per `job_id` wins): {`schema_version:1`, `job_id`, `idempotency_key`, `state`, `state_at`, `provider`, `layer_id|null`, `cost_estimate|null`, `note`}. States: `requested`, `awaiting-consent`, `queued`, `running`, `preview-ready`, `accepted`, `delivery-ready`, `failed`, `cancelled`; `failed`, `cancelled` and `delivery-ready` are terminal and idempotent.
`asset.json` (final provenance): `model_id`, `model_revision`, `workflow_digest`, `prompt`, `reference_inputs[{sha256, rights}]`, `config{seed, aspect, duration_s, width, height, fps_num, fps_den}`, `provider_job_id`, `output{path, sha256}`, `cost{estimate, actual|null}`. Auth is redacted everywhere.
Validation: a retry with the same `idempotency_key` never starts a second paid/charged job; no job leaves `awaiting-consent` without a recorded consent line; the workflow must be on an approved list and its paths sandboxed (no arbitrary submitted code); no token or absolute private path appears in log, asset.json or any package; `hybrid/sources.json` references an output only in `accepted` or later.

## C5. Tracks: `<film>/hybrid/tracks/<track-id>.json`
Owner: W5 produces and corrects (native tracking service); W4 consumes (perspective/matte); W6 may write mask tracks.
Required: `schema_version:1`, `id`, `asset_id`, `track_type:"bbox"|"planar-quad"|"mask"`, `source_digest` (of the asset bytes), `timebase:"source_pts_seconds"`, `frames[]` {`t_s`, `quad_norm` (TL,TR,BR,BL), `bbox_norm` [x,y,w,h], `confidence` 0..1, `origin:"manual|vision|sam|interpolated|corrected"`}, `corrections[]`, `status:"tracked|needs-correction|manual|failed"`.
Coordinates are display-oriented (after pixel aspect, rotation and crop), normalised. Samples are keyed to original source PTS, not CFR frame numbers. Mask tracks name a PNG/alpha asset or run-length data with a declared decoder, colour and alpha mode.
Validation: `source_digest` equals the asset; `t_s` strictly increasing and within asset duration; quad is convex with TL,TR,BR,BL winding; confidence below 0.5 yields a warning, never silent invention; rotated/non-square-pixel fixture round-trips; stale digest means "re-track", never reuse.

## C6. Edits: `<run>/motion/edits.jsonl` (existing, extended compatibly)
Owner: W7 (`scripts/editor-patch.mjs`, `scripts/lib/editor-patch/**`). Swift types: W8 (`Direct*.swift`) reads and writes through the existing `MotionEditEnvelope` and `actions.jsonl` (`kind:"motion-edit"`).
Shipped baseline (do not break): `operation` is one of `modify|retime|reorder|replace|remove`; statuses `requested|accepted|applied|rendered|failed|reverted`; append-only, latest line per id wins, idempotent on id; optional `build_digest`; today a stale `film_version`/`build_digest` or unknown element is downgraded to a region edit.
Additions (all optional, old lines remain valid): `asset_id`, `track_id`, `layer_id`, `build_digest`, `original` (exact original values), `proposed` (exact proposed values), `preview_digest`; new `operation` values `transform|trim|replace-plate|correct-track|mask-refine|performance|property`.
Resolved: `conflict` is a result code, not a status. For NEW operations a stale `film_version`, `build_digest` or element digest returns `{ok:false, conflict:true, current:{...}}` (exit 1) and appends nothing, so the client can refresh and rebase; legacy operations keep the shipped region-downgrade. The status vocabulary and `requested -> accepted -> applied -> rendered` order do not change; never `applied` before source changed AND a new preview exists.
Checkpoints under `<run>/motion/checkpoints/<id>/` also cover sidecars (`hybrid/sources.json`, `hybrid/tracks/<id>.json`, `cast/**/performance/*.json`); `undo` restores them and invalidates the matching C3 keys.
Validation: `editor-patch.mjs check` proves recorded state equals disk, including sidecars; `original` must equal the on-disk value at apply time or the apply is refused; redo after undo is a new id.

## C7. Character performance: `<film>/cast/<character-id>/performance/<scene-id>.json`
Owner: W9 (`scripts/character-performance.mjs`, `scripts/lib/character-performance/**`); render bridge into `stage3d` is a patch sketch for the lead.
Required: `schema_version:1`, `character_id`, `scene_id`, `canon_digest` (existing canon/identity digest from `scripts/lib/canon3d.mjs`), `audio:{source, sha256}`, scene-local seconds; `visemes[]` {`t_s`, `viseme`, `weight`}, `expressions[]` (envelopes), `gestures[]` (clip id or key poses), `targets[]` {gaze|head|body, keyframes}, `foot_plants[]` (hold intervals), `continuity{in, out}` pose constraints at scene boundaries.
Pose is `pose(t)` from this document only: no accumulated simulation, no hidden RNG state, no network at render time.
Validation: `canon_digest` matches the canon; times sorted and inside the scene; viseme times match `audio_meta.json` word times within one frame; two scenes of one actor agree at the boundary (`continuity`); same file gives identical pose at the same `t` in any seek order (A-B-A).

## C8. Delivery: `<film>/exports/<export-id>/manifest.json` (+ `.otio`)
Owner: W10 (`scripts/timeline-export.mjs doctor|otio|validate|package`, `scripts/lib/timeline-export/**`).
Required: `schema_version:1`, `export_id`, `composition_version`, `timebase:{fps_num, fps_den}`, `tracks[]` (owned footage, generated plates, code-rendered scene proxies, music, VO, SFX, captions; with trims/handles and layer order), `audio_stems[]`, `media[]` (relative path, sha256, safe copy or pointer), `rights[]`, `missing[]`, `warnings[]` (flattened transitions, unsupported features).
`.otio` uses `RationalTime` at the project rate and media paths relative to the package. Written by an installed pinned OpenTimelineIO serializer or validated by it; OTIO fields are never invented from memory. FCPXML/AAF only after a real import round trip.
Validation: parse round trip keeps clip durations and order; every media path resolves after the package is moved; no absolute or private path or credential in the package. Only claim an editor (Final Cut, Premiere, Resolve) that was actually tested.

## Feature flags and defaults
`RASANAI_HYBRID_DIRECT_EDIT` (off, licence review), `RASANAI_HYBRID_COMFYUI`, `RASANAI_HYBRID_LTX` (never default, weights never bundled), `RASANAI_HYBRID_SAM` (optional sidecar), `RASANAI_HYBRID_OTIO` (needs a pinned SDK). All off by default; the hybrid layer is invisible to a film with no `hybrid/` folder. `renderer-adapters.mjs doctor` stays hyperframes-only by default and is not widened by this phase.

## Status words (used in every ledger, handoff and `hybrid-film-status.md`)
| Word | Means |
|---|---|
| Implemented | Code exists and its local fixture/API smoke passes. |
| Integrated | Connected to an existing RasanAI flow (console, Studio actions, skill routing) and exercised through that connection. |
| Verified | The whole relevant end-to-end workflow ran on a real project with real media, and the artifacts exist. |

Never substitute one for another. **Stubs, safe fallbacks, fake providers, compile-only GUI passes (`swift build` with no window run), and any feature whose ComfyUI, LTX, SAM or OpenTimelineIO dependency was unavailable are never "Verified"**; at most Implemented, with "integration pending" and the reason. `Experimental` is allowed only when marked, hidden by default and reversible.

| Feature | Minimum for Verified |
|---|---|
| Incremental render | Real one-scene edit; unchanged fragments reused; correct assembled MP4/audio; interruption recovery; benchmark recorded |
| Hybrid footage layers | Owned video + editable overlays in one film, correct alpha/timebase, no AI provider |
| ComfyUI generation | Real opt-in generation on a configured provider; fake-API fixture alone is Implemented |
| Tracking | Tracked quad + screen replacement with correction and a test; SAM masks only after real supported inference |
| Direct edit | Studio select/drag/commit, conflict, undo/redo, restart persistence, checked in a real visible window |
| Character performance | Two-scene identity consistency, viseme/gesture times match audio |
| OTIO export | Parse round trip, portable media, separate stems, honest unsupported-feature notes |
| Stability | Old non-hybrid films still build; five calls unchanged; no undeclared cloud/model dependency |

## Waves
| Wave | Scope | Exit proof |
|---|---|---|
| 0 | Inventory HEAD, freeze this file, allocate globs, launch workers, open the ledger (<=10 min of lead time) | Contracts committed; ownership table agreed |
| 1 | W1 graph+cache, W2 render, W7 edit ops, W8 native editor, W11 fixtures | One local text edit re-renders only one shot |
| 2 | W3 ComfyUI/fake provider, W4 compositor, W5 tracking, W6 optional masks | Owned phone shot with tracked four-corner screen replacement plus optional generated backdrop |
| 3 | W9 character performance, W10 OTIO, W12 docs and sample projects | Two-scene actor; OTIO package opens after moving folders |
| 4 | One representative hybrid film, Studio review, pinned dependency ledger, measured benchmark, status report | `docs/plans/hybrid-film-status.md` truthful; old films still build |
P0 (existing reliability and incremental render) integrates first; P1/P2 foundations run concurrently but merge by dependency. No agent is described as running unless it started.

## Placement (new paths)
Skill: `scripts/{hybrid-graph,hybrid-render,video-generation,character-performance,timeline-export}.mjs`; `scripts/lib/{hybrid-graph,hybrid-render,render-cache,video-generation,hybrid-compositor,character-performance,timeline-export}/`; `scripts/tests/fixtures/hybrid-film/`; `references/hybrid-film-studio.md`; `tools/segmentation/` (optional sidecar). Docs: `docs/plans/hybrid-film-{contracts,dependencies,status}.md`. Per film: `hybrid/{sources.json,edit-graph.json,cache/,jobs.jsonl,generated/,tracks/}`, `cast/<actor>/performance/<scene>.json`, `motion/edits.jsonl` (existing), `exports/<export-id>/`. Existing `StudioCore` and `RasanAIStudio` targets stay in place; new `.swift` files live under the existing source dirs (SwiftPM globs them; no `Package.swift` edit unless the lead assigns it).

## OWNERSHIP (exact, disjoint globs; skill root `skills/rasanai/` unless a path starts with `apps/` or `docs/`)
| Worker | Lane | Owns (only these) | Contract |
|---|---|---|---|
| W1 | Graph + cache | `skills/rasanai/scripts/hybrid-graph.mjs`, `skills/rasanai/scripts/lib/hybrid-graph/**`, `skills/rasanai/scripts/lib/render-cache/**` | C2, C3 |
| W2 | Fragment render | `skills/rasanai/scripts/hybrid-render.mjs`, `skills/rasanai/scripts/lib/hybrid-render/**` | C2/C3 consumer |
| W3 | Video generation (ComfyUI, fake provider) | `skills/rasanai/scripts/video-generation.mjs`, `skills/rasanai/scripts/lib/video-generation/**` | C4 |
| W4 | Compositor | `skills/rasanai/scripts/lib/hybrid-compositor/**`, `skills/rasanai/scripts/composite.mjs` | C1, C5 consumer |
| W5 | Tracking (native Vision) | `apps/macos/Sources/StudioCore/Tracking/**`, `apps/macos/Sources/RasanAIStudio/Tracking*.swift`, `skills/rasanai/scripts/track.mjs`, `skills/rasanai/scripts/vision/track.swift` | C5 |
| W6 | Optional SAM sidecar | `skills/rasanai/tools/segmentation/**` | C5 mask tracks |
| W7 | Editor-patch ops | `skills/rasanai/scripts/editor-patch.mjs`, `skills/rasanai/scripts/lib/editor-patch/**` | C6 |
| W8 | Native direct editing | `apps/macos/Sources/RasanAIStudio/Direct*.swift`, `apps/macos/Sources/StudioCore/EditGeometry.swift` | C6 client |
| W9 | Character performance | `skills/rasanai/scripts/character-performance.mjs`, `skills/rasanai/scripts/lib/character-performance/**` | C7 |
| W10 | OTIO export | `skills/rasanai/scripts/timeline-export.mjs`, `skills/rasanai/scripts/lib/timeline-export/**` | C8 |
| W11 | Fixtures and tests | `skills/rasanai/scripts/tests/fixtures/hybrid-film/**`, `skills/rasanai/scripts/tests/hybrid-film.mjs` | all |
| W12 | Docs and rights | `skills/rasanai/references/hybrid-film-studio.md`, `docs/plans/hybrid-film-dependencies.md` | ledger |

Lead-only (workers read, never write; changes arrive as <=15-line patch sketches queued to one owner): `skills/rasanai/SKILL.md`, `skills/rasanai/scripts/skill-map.mjs`, `skills/rasanai/scripts/console.mjs`, `apps/macos/Package.swift`, `README.md` (and `apps/macos/README.md`), every `CHANGELOG.md`, this file, `docs/plans/hybrid-film-status.md`, `scripts/release.mjs`, and shipped files not listed above (`events.mjs`, `element-index.mjs`, `motion-kit.mjs`, `quick-film.mjs`, `renderer-adapters.mjs`, `crew.mjs`, `video.mjs`, `finish.mjs`, existing Swift files such as `MotionBridge.swift`, `MotionModels.swift`, `MotionStudioStore.swift`).
Rules: W5 and W8 write only their exact Swift globs above (W8 uses `MotionStudio/*` types, does not edit them). W7 is the only writer of `edits.jsonl` semantics; W1 is the only writer of cache keys; W11 owns shared fixtures (others may read them, and request additions). Two workers never patch the same integration failure; the lead assigns it to one.
