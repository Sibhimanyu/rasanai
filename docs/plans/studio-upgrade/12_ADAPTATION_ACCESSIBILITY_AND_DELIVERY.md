# Plan 12 - Audience adaptation, accessibility and professional delivery

**Repository:** `Sibhimanyu/rasanai`  
**Executor:** Sonnet implementation lead and scoped Sonnet workers  
**Sequence:** 12 of 14 implementation stages; coordinator is Plan 00  
**Prerequisite:** Plan 11 integrated as implementation, not yet pipeline-tested.  
**Research snapshot:** 2026-10-25; public HEAD inspected at `20ea14748daaee007cb4eaf5ba8aee91c09b1c4a`. Local HEAD wins.

## Execution and verification policy

Implement this plan inside the actual RasanAI checkout. Read `00_EXECUTE_IN_ORDER.md` and the predecessor handoff first, then only the repository files relevant to your assignment. Preserve existing working features and uncommitted changes. All proposed filenames/APIs below must be reconciled with the local checkout; extend an equivalent existing implementation instead of creating a duplicate.

**Testing requires the user's explicit approval, including in Plan 14.** Implement Plans 01-13, integrate the changes, and author fixtures/tests without executing them. Then stop at `awaiting_test_approval`, report the implemented candidate, and present the proposed testing scope, commands and resource/usage implications. Do not enter Plan 14 automatically. Only a subsequent explicit user instruction approving testing authorizes its agreed scope; this plan, silence, a general instruction to continue implementation, or approval of a film's Story/Look does not.

Until that approval, no unit/integration suites, agent film trials, browser/render smokes, GUI QA, live provider probes, end-to-end runs or benchmarks may run, whether directly, through workers, hooks or CI. Read-only inspection, syntax/schema parsing, type checks and compilation remain permitted only when they execute no tests, workflows or runtime probes. Hold any operation that would trigger tests; do not disable safeguards to bypass them. Record implementation as `implemented_unvalidated`. Preserve normal product runtime safeguards and creative approvals. See [Testing approval gate](TESTING_APPROVAL_GATE.md).

The implementation lead owns shared entrypoints and schema changes. Use parallel Sonnet workers for genuinely independent file-owned tasks; do not manufacture concurrency or let workers edit the same shared files. No remote push, public release, paid dependency purchase, new paid generation, destructive migration or permission escalation is authorized by this document alone.

## Repository entrypoints to locate

Start with these current or previously documented locations; verify their local equivalents before editing. Read only the symbols relevant to your assigned lane. Shared entrypoints remain lead-owned.

- `skills/rasanai/scripts/video.mjs`
- `skills/rasanai/scripts/reel.mjs`
- `skills/rasanai/scripts/voice.mjs`
- `skills/rasanai/scripts/finish.mjs`
- `apps/macos/Sources/RasanAIStudio/`
- `skills/rasanai/references/deliver.md`

## Outcome

One approved film can become appropriate destination variants without losing its story, proof, brand or readability. Export useful media and editable source packages with honest limits; do not equate resizing with adaptation or a baked video with native editable motion components.

Reuse existing exports, captions, safe-zone handling, series settings and any Phase 2 OTIO work. S10 supports planning accessibility early; S11 supports distinguishing communication objectives. Specific platform requirements must be checked against current official specifications rather than embedded as eternal constants.

## D1. Introduce versioned destination profiles

A destination profile records audience/context, aspect and resolution, expected playback size, duration constraints, sound assumptions, captions, safe regions, delivery codec/color/audio requirements and the source/date of any external platform rule. Distinguish a user-selected house preference from an official requirement.

Store verified-at and source fields. Unknown or outdated requirements produce a warning and configurable export, not an invented compliance badge. Do not silently change a project's target spec because a global profile was updated; offer migration with an impact summary.

The creative brief already holds placement intent from Plan 02. Use it to choose whether a variant needs a clearer opening, a shorter demonstration, a different CTA or merely reflow. Do not force the same short-ad opening onto a conference film or a website explainer.

## D2. Adapt content deliberately

Build variants as revision-scoped descendants of approved artifacts. Preserve story/claim IDs and identify which beats are retained, shortened, removed or newly requested. A new claim or substantially different narrative needs the appropriate approval, not just an export toggle.

Reflow components for vertical/square layouts using the existing design system. Preserve the focal subject and the readable proof. Recompose when necessary; center-cropping a wide interface is not acceptable if it removes the result or qualifier. Treat a cropped real screenshot as a crop, not a rewritten interface.

Reconcile timing after layout or copy changes: a longer translation may need a longer hold; a shorter cut changes cue positions and transition handles. Use the same authority and invalidation graph. Do not regenerate already-valid assets, research or story candidates merely because the aspect changed.

Offer a muted-safe version when the placement calls for it. This does not mean every film requires redundant large headings; essential meaning should survive through appropriate visible content and captions.

## D3. Support real localization, not string replacement

Keep approved copy, claims, product names, units and qualifiers mapped across languages. Allow a translation draft and approval state separate from the original. Use the user's pronunciation glossary and verified interface language; never invent localized UI functionality.

Handle text shaping, bidirectionality, line breaking, font coverage and locale-specific number formatting. Do not blindly mirror every scene for RTL: reading order can change while product logos, media and real UI keep their valid orientation. Font substitution must be visible when brand type lacks glyphs, not silently reverted to a generic default.

Use actual localized voice timings for word highlights and lip cues. Low-confidence alignment remains reviewable. Captions need appropriate phrase grouping, readable holds and line lengths; a hardcoded English reading-speed threshold is not a universal standard.

## D4. Make accessibility deliverables explicit

Implement captions, transcript and descriptive-transcript/audio-description paths appropriate to the requested audience and content. Captions can include meaningful non-speech audio, not only spoken words. A silent visual explanation can still require a textual description of what the viewer must understand.

Keep caption files synchronized with the final edit and delivered variant. Provide supported sidecar formats such as SRT/VTT with real escaping/timestamp handling. Burn-in remains optional unless the destination requires it. Avoid duplicate visible captions when source footage already contains them.

Check readable contrast and important visual distinctions without relying on color alone. Support a deliberate reduced-motion film variant where requested, separate from reduced animation in Studio's UI. Include flashing-risk checks and applicable guidance in the final acceptance process; do not mark a video accessible solely because it has subtitles or a script that claims compliance.

Native playback/export controls need accessible labels and keyboard operation. Accessibility requirements influence Story and Storyboard through Plan 02, not only a final patch on the encoded file.

## D5. Export a useful, honest package

Use a delivery manifest listing output version, target profile, frame count/duration/time base, audio spec, color/alpha conventions, captions, stems when real, source project, hashes and permitted provenance/credits. Include only authorized redistributable assets; flag external linked files that cannot be bundled.

Preserve original user media. Export source/editable material separately from baked previews and masters. Never include provider credentials, raw private logs, unrelated source documents or absolute private filesystem paths in a handoff. Run the redaction/containment policies from Plan 11.

A failed export must leave the previous successful deliverable intact. Make an export folder atomic where practical, with a clear failure record outside the deliverable rather than a partially valid-looking package.

## D6. Professional timeline interchange

Use the official OpenTimelineIO representation/library at a pinned compatible version (T08), or the established repo adapter. Keep an optional sidecar dependency isolated so ordinary video production does not suddenly require a new global Python installation.

Represent clips, source ranges, track order, transitions, gaps and rational rates accurately. Include handles when available; distinguish missing handles from zero-duration transitions. Map audio stems and caption references honestly. Maintain source relinking through relative paths and a manifest.

GSAP/Three.js/HTML scenes can be supplied as rendered proxies plus source links/metadata. They do not become native editable animation layers in another editor automatically. Label baked effects and unsupported features. Offer FCPXML/AAF/other adapters only after their actual installed support and destination round trip are checked in 14; a valid `.otio` JSON file is not proof every editor imports it.

## D7. Native export controls

Show the selected profile, variant, actual render status, required accessibility files and package contents. Keep a simple primary export action; advanced codecs/stems/interchange are secondary. Explain unavailable capabilities without advertising them as complete. Preserve prior export choices per project or series only when explicitly saved.

## Parallel lanes

Profile/variant compiler, layout/localization, captions/accessibility, media package/provenance, OTIO adapter and native export controls can have distinct owners. Lead owns delivery entrypoints, timing changes and schema integration. Do not run encodes, localization trials or editor imports now.

## Implementation handoff

Deliver actual variant routing, structured destination profiles, caption/transcript generation, safe delivery packaging and implemented interchange capability reporting. Register D01-D09. The final plan receives export fixtures and exact manual/editor requirements, not a claim of compatibility.

## Deferred verification

In 14 inspect vertical/square/wide outputs, small-screen readability, RTL/CJK or other selected locale fixtures, long copy, caption gaps/overlaps, missing glyphs, audio-description/transcript paths, stripped private data, packaged relinking and at least one supported editor round trip where available. Mark unavailable editor testing `not_run` and withhold that compatibility claim.

## D8. Export a dependency closure with honest editability

Generate export contents from accepted artifact dependencies, not by zipping the whole project directory. Include exactly the permitted source code, media, captions, real stems, component versions, font requirements and relink metadata needed by that output. Preserve license notices; if a font/media asset cannot be redistributed, record the missing external requirement instead of embedding it. No full private research or source-provider log belongs in the package by default.

Report each delivered element as source-editable, property-editable, clip-editable, baked or unavailable. Do not call a rendered 3D shot an editable rig in an external editor. An interchange adapter emits a loss report for unsupported effects, time warps, transition handles or subtitle behavior; a clean JSON serialization is not a verified editor round trip.

Variant manifests link to their parent creative revision and store any approved copy/timing changes. Updating a shared asset or translation invalidates the relevant variants without replacing unrelated delivered versions. A destination-profile update does not silently mutate an already accepted export.

## Revision 2 handoff requirement

Update the relevant row in [INTEGRATION_CLOSURE_MATRIX.md](INTEGRATION_CLOSURE_MATRIX.md) with actual source wiring and pending case IDs. Read only the applicable [rule migrations](RULE_MIGRATION_MAP.md) and [reference decisions](REFERENCE_REUSE_MATRIX.md). These documents do not authorize testing.

## Package navigation

[Coordinator and global policy](00_EXECUTE_IN_ORDER.md) | [Source ledger](RESEARCH_SOURCES.md) | [Deferred cases](DEFERRED_TEST_MATRIX.md).

Next: [Creative evaluation, measurable efficiency and bounded learning](13_CREATIVE_EVALUATION_AND_LEARNING.md). Continue after integration; do not run pipeline tests between stages.
