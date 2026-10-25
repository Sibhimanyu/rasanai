# Plan 06 - Visual production, hybrid footage and recurring characters

**Repository:** `Sibhimanyu/rasanai`  
**Executor:** Sonnet implementation lead and scoped Sonnet workers  
**Sequence:** 06 of 14 implementation stages; coordinator is Plan 00  
**Prerequisite:** Plan 05 integrated as implementation, not yet pipeline-tested.  
**Research snapshot:** 2026-10-25; public HEAD inspected at `20ea14748daaee007cb4eaf5ba8aee91c09b1c4a`. Local HEAD wins.

## Execution and verification policy

Implement this plan inside the actual RasanAI checkout. Read `00_EXECUTE_IN_ORDER.md` and the predecessor handoff first, then only the repository files relevant to your assignment. Preserve existing working features and uncommitted changes. All proposed filenames/APIs below must be reconciled with the local checkout; extend an equivalent existing implementation instead of creating a duplicate.

**Testing requires the user's explicit approval, including in Plan 14.** Implement Plans 01-13, integrate the changes, and author fixtures/tests without executing them. Then stop at `awaiting_test_approval`, report the implemented candidate, and present the proposed testing scope, commands and resource/usage implications. Do not enter Plan 14 automatically. Only a subsequent explicit user instruction approving testing authorizes its agreed scope; this plan, silence, a general instruction to continue implementation, or approval of a film's Story/Look does not.

Until that approval, no unit/integration suites, agent film trials, browser/render smokes, GUI QA, live provider probes, end-to-end runs or benchmarks may run, whether directly, through workers, hooks or CI. Read-only inspection, syntax/schema parsing, type checks and compilation remain permitted only when they execute no tests, workflows or runtime probes. Hold any operation that would trigger tests; do not disable safeguards to bypass them. Record implementation as `implemented_unvalidated`. Preserve normal product runtime safeguards and creative approvals. See [Testing approval gate](TESTING_APPROVAL_GATE.md).

The implementation lead owns shared entrypoints and schema changes. Use parallel Sonnet workers for genuinely independent file-owned tasks; do not manufacture concurrency or let workers edit the same shared files. No remote push, public release, paid dependency purchase, new paid generation, destructive migration or permission escalation is authorized by this document alone.

## Repository entrypoints to locate

Start with these current or previously documented locations; verify their local equivalents before editing. Read only the symbols relevant to your assigned lane. Shared entrypoints remain lead-owned.

- `skills/rasanai/runtime`
- `skills/rasanai/stage3d`
- `skills/rasanai/scripts/video.mjs`
- `skills/rasanai/scripts/reel.mjs`
- `skills/rasanai/scripts/renderer-adapters.mjs`

## Outcome

Finish or integrate the already-planned visual capabilities without restarting the renderer architecture. Deliver editable deterministic scenes, optional generated plates, accurate tracking/compositing and reusable character performance behind honest capability reporting. The earlier Motion Studio and Hybrid Film Studio plans are inputs; this consolidated plan owns remaining gaps and integration.

## V1. Reconcile existing work

Use the reuse matrix from 01. The inspected public ledger reported incomplete mechanics and unverified adapters, but do not assume the user's local checkout remains in that state. Inspect source and prior evidence; reuse completed code. Treat a function stub or successful compile as implementation evidence only, not proof of visual behavior.

Prefer current HTML/GSAP/RasanShape/RasanUI/RasanCamera and Rasan3D. Rive, Remotion, Motion Canvas and OpenFilm remain optional interoperability or reference work; adding an engine is not itself an improvement. Do not make Python, a model download or a new cloud account mandatory for ordinary films.

## V2. Reusable mechanics, not repeated whole-film templates

Complete the missing high-value motion-kit implementations actually exposed to the user. Catalog availability must reflect implemented capability, not a row's existence. Every primitive accepts deterministic time/seed, relevant tokens, dimensions and stable element IDs. Reuse maintained text fitting, clipping, camera and interface helpers. Add only a small focused example for each mechanic.

Let workers compose these mechanics for each message. Do not hardcode one opening/reveal/outro into every film. Recipe selection filters by purpose, brand, time/readability and engine cost, not decorative novelty alone.

Register semantic `data-el` identities, actual editable properties and output bounds. Raster footage is clip-level editable. A composite's child identity cannot be guessed from its pixels. Persist source revision information for the inspector and targeted revisions.

## V3. Deterministic rendering and scene ownership

Use one seekable clock and absolute-time evaluation. No wall-clock-dependent motion, unseeded randomness, render-time network requests or accumulated simulation state that changes with seek order. Stateful physics must use deterministic precomputation/checkpoints keyed to inputs. Wait for fonts/assets and define sub-frame sampling consistently.

Keep approved copy, actual UI screens and product logos in controllable programmatic layers. Isolate scene modules. One owner maintains shared interface components, camera continuity and cross-shot objects. Rendering/encoding orchestration is delegated to Plan 09, using the same capabilities and artifact keys.

## V4. Optional generated video plates

Reuse a provider interface or implement a minimal one: capability discovery, estimate, consent, submit, status, retrieve, cancel/reconcile. ComfyUI's queue and job ID protocol is a suitable first configurable adapter (T06), but installed workflows and model licenses must be discovered, not assumed.

Generated media is an immutable cached asset with provider/model/workflow identity, input hashes, prompt, seed when supported, source rights, output checksum, duration and actual cost when reported. A seed does not guarantee reproducibility across model/backend changes. Store the accepted output itself.

Do not place unsupported factual product behavior inside neural footage. Keep verified UI/text over the generated plate. Do not submit sensitive user inputs to a hosted provider without applicable consent. A missing local model or external dependency is a visible unavailable capability, not an invitation to silently download gigabytes or use a different paid model.

Submitting a job has side effects. A timeout with uncertain completion becomes `unknown_outcome`; query the same job rather than blindly resubmit. Never clear another person's ComfyUI queue or interrupt shared work merely to cancel this film.

## V5. Tracking, screen replacement and occlusion

Distinguish object bounding boxes, planar four-corner tracks, semantic masks and depth. A bounding box is not a silhouette and does not by itself support perspective-correct screen replacement. Apple's tracking APIs are one local option (T07); segmentation such as SAM is optional and requires its own installation/license/capability check.

Persist tracks against the source checksum, exact orientation, time base and dimensions. For screen replacement use an ordered quad/homography, handle corner swaps/occlusion, and allow correction keyframes. For text behind a person use an actual mask or an explicitly limited fallback. Do not present a rectangular crop as person segmentation.

Expose low-confidence spans, scene cuts and lost tracks; provide keep-source, manual correction or simpler treatment. Avoid black-frame failure. Handle premultiplied alpha, color conversion, letterboxing and foreground edges consistently. Add fixtures now; processing and visual checks wait for 14.

## V6. Recurring character performance

Reuse existing canon/identity files and Rasan2D/Rasan3D. Add or finish reusable expression, gesture, pose and viseme tracks linked to actual dialogue timing. Retain stable identity, proportions, materials and rig versions across scenes. A supplied still is reference art, not a rigged model.

Use absolute-time animation evaluation for supported rigs. A code-built actor or painted 2D fallback must be labeled accurately. Lip-sync alignment is measured and corrected where needed, not described as frame-perfect without evidence. Keep model sheets and user-owned character assets private by default and out of distributable templates unless licensed.

## V7. Capability and licensing surface

Report `implemented`, `available_on_host`, `enabled`, `permission_status`, `license_status` and `verification_status` separately. UI must not show unavailable kit moves as ready. Source-code licenses, model weights and media rights are different records. GSAP use in a visual animation builder requires the project-wide review described in 11; a hidden feature flag or "AI writes code" label is not legal clearance.

## Parallel lanes

This stage can support the largest useful implementation fan-out: motion primitives, element instrumentation, deterministic scene adapters, generation jobs, planar tracking, segmentation/compositing, character performance, capability registry and deferred fixtures. Aim for 8-12 only when ownership really permits it. The lead owns shared runtime versioning and renderer entrypoint wiring. No heavy renderer jobs are launched during this stage.

## Implementation handoff

Deliver source integrations into the existing production route, honest capability flags, local asset/provenance records, rendering/scene contracts and every user-visible fall-back. Register V01-V10 pending checks. Experimental optional integrations remain clearly labeled until 14 proves them.

## Deferred verification

Run seek-order and cold-start determinism; font readiness; supported motion mechanics; 2D/3D seams; bbox vs quad/mask behavior; corrected screen track; low-confidence occlusion recovery; generated-asset job reconciliation; rig consistency; and one actual selected optional provider when permitted. No adapter is accepted on a mock-only test.

## V8. Formalize render readiness and protect authored edits

Use one minimal adapter contract around existing scene runtimes: prepare approved local inputs, report readiness, evaluate a requested absolute time/subframe, report semantic element metadata, and dispose owned resources. Readiness includes required fonts, textures, video decode and models; `file exists` is insufficient. Do not introduce OpenFilm's renderer just to obtain this interface. Its time-based page contract is a reference pattern, not a runtime replacement or a cross-platform pixel-equality guarantee.

Pin the actual font files, runtime version and accepted neural media to the project manifest. Automatic dependency updates must not change an already approved film in the middle of a build. Any update becomes a versioned migration with a stated invalidation impact.

User edits must survive regeneration. Store supported element overrides through the existing edit/source authority, linked to stable IDs and compatible property schemas. A builder consumes or explicitly reconciles them; it cannot overwrite an adjusted title because it rebuilt the scene. Missing/renamed IDs become conflicts, not nearest-pixel guesses. Full scene source remains authoritative; do not create an independent writable override timeline.

Treat externally sourced scene examples as untrusted input. Extract only reviewed mechanics with provenance and required notices. Do not automatically install every reference, execute its setup instructions, copy its media, crop out watermarks or import its credentials/providers.

## Revision 2 handoff requirement

Update the relevant row in [INTEGRATION_CLOSURE_MATRIX.md](INTEGRATION_CLOSURE_MATRIX.md) with actual source wiring and pending case IDs. Read only the applicable [rule migrations](RULE_MIGRATION_MAP.md) and [reference decisions](REFERENCE_REUSE_MATRIX.md). These documents do not authorize testing.

## Package navigation

[Coordinator and global policy](00_EXECUTE_IN_ORDER.md) | [Source ledger](RESEARCH_SOURCES.md) | [Deferred cases](DEFERRED_TEST_MATRIX.md).

Next: [Sound, music and voice as part of the film](07_SOUND_MUSIC_AND_VOICE_DIRECTION.md). Continue after integration; do not run pipeline tests between stages.
