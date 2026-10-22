# Backlog: planned and not done

Moved out of `.context/TODO.md` (local, not in git) on 2026-10-15 so it survives. State: master is 1.17.0 plus later work; waves 6 to 8 (P0.1 rest, P0.3 to P0.5, R1 to R4, P1.1 to P1.7, P2.1 to P2.6; PRs #80, #81, #83) are done and merged, untested by the owner's choice. Sources and licences: `SOURCES.md`. How to add an item: `INTAKE.md`.

Sizes: S under 1 h of agent work, M a few hours, L a day or more.

Rules that hold for every item:
- Work in a new worktree off `origin/master` (`git worktree add .context/wt-<name> -b <branch> origin/master`); never touch another session's working tree.
- Opus plans and reviews; Sonnet subagents build infra (scripts, checks, docs, releases); anything that makes a film (writing, scoring, building, critiquing) is Opus end to end.
- Measurement beats rules: a new check is a warning, calibrated on the reference films and our films before it may be an error.
- No visible windows in tests (headless Chrome through `lib/cdp.mjs`). No Python audio libraries (librosa and numba crash this Mac): Node and ffmpeg.
- Tests, when asked for: `scripts/tests/<name>.mjs`, default export `async ({ ok, node, tmp, env })`, registered in `selftest.mjs`'s list; `selftest`'s `node()` ignores per-call env, so a test needing its own `RASANAI_HOME` spawns the scripts itself.
- Studio is pure native SwiftUI. Protect owner choices (brand row, splash, toolbar order). Verify with `swift build` and code reading, not by popping windows.
- Be token-conscious: estimate cost before any long Opus film run, offer a cheap path, ask first.
- A release bumps `skills/rasanai/VERSION`, `skills/rasa-director/VERSION`, `.claude-plugin/plugin.json` and the marketplace bridge version, adds a CHANGELOG section, merges, tags; it never runs tests. Use `scripts/release.mjs` (see RELEASING.md).

## B1. P3.1 Translated versions without rebuilding

- Source: onetake (PolyForm Noncommercial: ideas only). Size: M to L.
- What: a second language is `?lang=` text plus a time warp on the same composition, verified pixel-identical outside the text areas, with per-language reading time (`scripts/lib/reading.mjs` already counts CJK).
- Spec: the composition reads its strings from a language table (`?lang=<code>`); a re-timer stretches or compresses holds by the longer line's reading time; `fixcheck.mjs` (the regression diff) checks that frames outside the text boxes are pixel-identical between the base and the translation. Verify first what exists: SKILL.md has one `--lang` mention.
- Done when: one film re-rendered in a second language, with the diff report.

## B2. P3.2 Hand-drawn cartoon route

- Source: ClaudeAnimationBase (MIT; ideas, add a credit folder if anything is copied), OpenMontage ink-theater mocap puppet idea (AGPL: idea only, group2 19). Size: L.
- What: a new route, runtime and guide: p5.js plus p5.brush, a character with acted emotions, line boil reseeded 12 times a second, flat 2D, no pure black or white, "no text, show it", "something happens in every scene", reads timing sheet, a transition at every seam. The mocap puppet (CMU mocap) is a later add-on (M to L).
- Done when: a 15 s cartoon film passes the motion gate; the route is listed in the format picker as proven.
- Status (W5, video-upgrade branch): PARTLY DONE. Built as original code, not p5.brush: `stage2d/` (Rasan2D: five views, 31 emotions, time-addressable actions, 12 Hz seeded boil, style layers, multi-actor depth order, stateless `renderAt`), `stage2d.mjs`, `lib/canon.mjs`, the `character-cartoon` route, the character-designer role and the `cartoon` format (status `partial`). Passed by test (`tests/stage2d.mjs`): 31/31 distinct, A-B-A and cold-render identical pixels, independent actor jitter, planted feet, `check` failing broken canon / unseeded randomness / actor out of frame / missing runtime, and the synthetic 15 s film through `motion-gate.mjs`. Still open: a real film made through the crew with a Look, a model-sheet approval and the Animatic (so the picker stays `partial`, not proven); talking (mouth shapes); the CMU mocap puppet add-on.

## B3. P3.3 New pipelines

- Source: OpenMontage (AGPL: pipeline ideas only); cooked. (MIT, `plugins/ai-editor/skills/clips/scripts/clips.py` @3b236ec, adapt with credit in `third_party/cooked/`). Size: L each.
- What: a clip factory first (one long video or podcast to several shorts; `formats.json` `shorter-versions` and `podcast-clips` are `soon`), then documentary montage and screen-demo; podcast-repurpose and audiogram; adjacent-cut redundancy for reels.
- Spec (clip factory): `footage.mjs clips --run "$RUN" --clip <id> [--min 20] [--max 40] [--top 8]` on the clip's existing word transcript (never a second transcription): sentences (end on `. ? !` or a gap ≥ 1.2 s), windows that open on a sentence of ≥ 4 words and close on a complete sentence, features (energy over the median, wpm, a hook in the first 3 s, laughs, named things, numbers, a connective opening "and/but/so…" = leans back, promo phrases), scored as in clips.py `feature_score` L252-260 but with names and numbers capped so they never decide alone, plus our intelligibility test (the window reads alone: `bites`' `standalone_guess`); greedy non-overlapping shortlist (`shortlist` L314-322) and a near-duplicate filter (two windows sharing ≥ 50% of words keep the better one). Output `footage/clips.json` = `[{ id, from_word, to_word, in, out, score, why, text }]`, word ids from `lib/cutplan.mjs`. Each approved clip becomes its own child run that points at the parent's source and transcript (`cut.json` with only that range kept) and goes through the reel route's Look, Cut, Build and Final and the usual gates. Two speakers are never framed as one talking head (speaker field). Trim pads as clips.py `trim` L417-463 (−0.12 s, +0.35 s, never into a neighbouring word).
- Done when: one 10 to 30 minute authorised recording yields 3 distinct candidates with exact word ranges and one finished short that passes the existing gates; `formats.json` `podcast-clips`/`shorter-versions` move to `partial`.

## B4. P3.4 Math and diagram scenes via ManimGX

- Source: academa-labs/manimgx (MIT; licence to re-verify). Size: L.
- What: ManimGX (Rust/wgpu, Manim CE API, about 90 times faster, runs in the browser) as a renderer for math and diagram beats in the faceless-explainer route, composited as a clip; its `inspect` storyboard and overlap report before render.
- Done when: an explainer beat is rendered by ManimGX and passes the gates; credit folder `third_party/manimgx/` created.

## B5. P3.5 Reference-vs-draft review UI in Studio

- Source: NullMotion viewer (no licence: idea only). Size: M to L.
- What: the user's reference clip beside the animatic or final, one synced playhead. Native SwiftUI only (`apps/macos/Sources/RasanAIStudio/`); coordinate with whoever is editing Studio; protect owner choices.
- cooked. adds the interaction reference (MIT, `lib/ai_editor/review.py`: transcript spans cut/restore/pause, notes pinned to a card, caption or word, `.prev` snapshots). Waves 3 of the cooked plan built the transcript review (`CutTranscriptView.swift`) and word-anchored notes; the side-by-side reference player is still open. Spec: in the Final and Animatic panels, a second AVPlayer with the user's reference clip (from `reference/profile.json` references), one shared clock, a "match cut points" toggle that jumps both to the nearest cut, and the `profile-compare` findings listed under it. Native only.

## B6. R5 optional and later

- motionmaxxing 11: brand capture hygiene (drop blank images, flag screenshot-not-product media, isolated element shots, ink from the largest heading, accent from imagery, dismiss cookie banners; verify against HyperFrames capture first). M. Source: motionmaxxing (Apache-2.0).
- motionmaxxing 13: human blind A/B page in Studio (giveaway warning when resolution, fps or duration differ; "picture silent first, then each soundtrack alone"). S. Native; goes with B5.
- mortiflix 7: per-line voice recording booth for the user's own narration (hold-to-talk, clipped/quiet/too short flags, takes per line) in Studio. M to L. AGPL: idea only.
- mortiflix 8: original-score engine (Strudel, harmony lock, intensity curve against the blueprint, MIDI). L, heavy, optional. AGPL: idea only.
- mortiflix 9: publish approved films (Upload-Post or Postiz). M, probably out of scope.
- lemo 12: original score and foley from an event list: the Node synthesis engine is DONE (W8: `scripts/original-score.mjs`, `references/procedural-music.md`); still open: a licence-verified CC0 instrument sample library (97 CC0 instruments in lemo-opuscar, each licence to verify) to replace the synthesised voices. L, low priority. Source: lemo-opuscar (MIT).
- lemo 11: offline narration fallback (Kokoro or edge-tts) appears DONE: `scripts/voice.mjs` mentions both. Verify the model licence is recorded in `SOURCES.md`. S.
- group2 19: mocap puppet for the cartoon route (with B2). M to L. group2 21: first and last frame generated plates (gbro idea), only for a generative-video route. L, optional. group2 22: the small items above.
- animate 4: seamless-loop check for reels (`review.mjs` LOOP: diff(last, first) at most the typical consecutive diff; audio tail folded). S, low.
- cooked. product-video (MIT, @3b236ec, `skills/product-video/scripts/crawl.mjs`, `record.mjs`; ideas from brag via cooked): scroll the page section by section before a screenshot so scroll-in content is not blank, dismiss overlays first, name each captured UI state and keep its source URL, blur personal data by default, never press anything that creates, pays or publishes without a yes, and fail grounding (no fake screen) when a claimed feature is not on the captured page. Verify against the brand researcher's current capture first; most of it may exist. Idea only unless code is ported (then credit in `third_party/cooked/`).

## B7. The Studio budget picker

- Source: OpenMontage (per-action budget caps; AGPL: idea only). Size: M.
- What: `crew.mjs plan --budget lean|standard|full` exists (1.17.0, `crew/budget.json` prints a token estimate per phase and in total). Studio does not show it. Add a picker on the Brief call (native SwiftUI): lean, standard, full, each with the estimate and what it drops, writing the chosen value into the brief file for the skill to read.
- Spec text from P1.1: lean = one script (not three), one look, the film builder writes its own boards, one fix round, one critic lens (film) plus one A/B; standard = today's defaults with two fix rounds; full = today. Estimates per phase come from measured runs (Motion Director score about 250k tokens, builder about 300k, critic pass about 75k, A/B about 50k). `crew.mjs status` should report spend so far (sum of agent usage if available, else phase counts); record actual usage per phase in the run so the estimates stay honest.
- Done when: a lean film is made for about 0.8M tokens or less and the estimate is within plus or minus 30%.
- Files: `apps/macos/Sources/RasanAIStudio/*` (Brief page, session decoding), `skills/rasanai/scripts/crew.mjs`. Coordinate with the Studio session.

## B8. Tests for waves 6 to 8

- Not done by the owner's choice (2026-10-15: "implementation only"). Wave 8 was integrated without running the selftest, any render or any new test; the selftest assertions that the new behaviour changes were rewritten to match, but not run. Every new check is a warning and uncalibrated.
- When asked: run `node skills/rasanai/scripts/selftest.mjs` and fix what the rewritten assertions got wrong; then add one `scripts/tests/<name>.mjs` per new module, at least: `lib/reading.mjs` (one formula: 0.6 s + 0.3 s a word, 15% render slack, CJK), `lib/emphasis.mjs` (curve peak against the planned peak), `lib/slot.mjs`, `lib/chrome-lint.mjs`, `lib/precedent.mjs`, `lib/frame-guards.mjs` (seam-blank, flash-over-cap), `lib/gate-lessons.mjs`, `fixcheck.mjs`, `uikit.mjs`, `voice.mjs verify`, `crew.mjs thumbs`/`marks`/`ab`/`plan --budget`, `intent.json` schema checks, structure-critic edits applying to `intent.json`, `chosen.json` and `scenes.json` together. Existing: `scripts/tests/orbs.mjs`, `styles.mjs`.
- Then calibrate the warnings on the reference films (Kinso, Sovra, OpenAI "Refreshed.", Google "Ask", mexicat p(doom)) and our FILM-C/D/E/F; promote a warning to an error only when the references pass and our weak films fail. The calibration films live in the local `.context/` (not in git): if lost, re-collect them.
- Known misses to recheck (from P1.7): camera cut-ins and moves under heavy DOF blur are not counted; Kinso's icon strip rising read as a tilt; carry for an object shrinking below 0.2 or a non-uniformly scaled pill; boldness reads live action as always bold (footage-led routes are exempt now); Google "Ask" fails boldness at 17% (decide: accept, or credit product photography); `competing-heroes` calibrated on 11 films, `no-split-edits` on 1.

## B9. FILM-F, the proof film (paused by the owner: do not start without asking)

- Source: our own. Size: L (tokens): lean path about 0.6 to 0.9M, full about 1.2 to 2.5M. Ask the owner which.
- What: the proof film for round 5 and the story rebuild (blind A/B, retrospective, echo, camera, boldness, intent-first story). The ChatGPT test brief; the old script is the niche one the structure critic rejected, so first re-run the story step with the rebuilt pipeline, then build FILM-F on the lean path.
- State (local, may be lost; `.context/film-f/RESUME.md`): paused 2026-10-14 at the film-builder step. Done: baseline D/E, 13 boards (juror ok), music edit (Ketsa, "Devolution"), motion score (big_moments 56%, echo, signature "push-through"), `video.mjs write/storyboard/inject`. Next: re-dispatch the film builder with the build note, then assemble, sfx, audio lock, draft-1, gates, critics, blind A/B, finish, retrospective, REPORT.md.
- Done when: FILM-F.mp4 plus REPORT.md; D/E/F side by side with numbers (boldness, echo, camera, carry, text, sound, critic scores, A/B verdicts); then the next release.

## B11. Precedent rows from awesome-opus5-5-videos

- Source: yihui-dev/awesome-opus5-5-videos (list MIT, prompts belong to their creators: link, never copy). Size: M.
- Partly done (W11): 20 curated, link-verified technique rows in `library/benchmarks/video-techniques.json` (not in the motionmaxxing precedent file: those rows carry no URL or pin), 17 pinned GitHub files from lemo-opuscar, opus-video-skills and ClaudeAnimationBase plus 3 index rows from the list (aschapmann-724497, jackfriks-338762, ror-fly-880547; clips not reviewed by a human), and a three-fixture A/B benchmark (`scripts/benchmark.mjs`).
- Still not done: the list's other ~700 entries and the ~45 full structured prompts (deliberately not imported); `moments.mjs precedent` does not read the new catalogue; a human review of the three index clips; local fixtures for VT-04 generative Three.js terrain, VT-13 palette-preserving grade, VT-14 interface walkthrough, VT-15 vertical short and VT-20 opening and end echo (`local_fixture.kind` is null for them); the 9:16 and 3D-character fixtures; a human blind A/B verdict on any pair (all are pending-human-review); an earlier-behaviour baseline (origin/master has none of the tools, so baselines are degraded variants).
- Done when: the rows above have fixtures and a juror has reviewed at least one pair per fixture; `SOURCES.md` TOOK updated.

## B12. Recurring 3D characters from the canon

- Source: iart-ai/webgl-animation-skills, svenkatreddy/universal-video-skills (MIT, ideas only); our own code. Size: L.
- Done in W6 on the current runtime (the upstream `Sibhimanyu/rasan-3d` is not merged, nothing pulled): `stage3d/character-rig.js` (RasanCharacter3D: loadCharacter, poseAt, validateCanon, canonViews, renderModelSheet; actions look, point, hop, react, walk, turn, carry as pure functions of t; prop attachment; permitted outfit swaps), `scripts/canon.mjs` (check, validate, seal, plate, sheet, scaffold), `lib/canon3d.mjs`, the `3d-rig` medium in `lib/canon.mjs`, `cast-canon-*` warnings in `lib/scene-contract.mjs`, the crew's character role, `scripts/tests/canon3d.mjs`. Verified: one rig id in two separately rendered scenes with the check's numbers (IoU 1.0, palette 0.0 against the plate), A-B-A and independent renders identical, a changed body ratio, a hidden scarf, a removed ear, a recolour, a stale identity copy and an edited shared rig all caught, a permitted pose change and uniform scale not.
- Still open: a rigged GLB actor with skeleton clips (needs the unmerged upstream rig and `AnimationMixer.setTime(t)`); calibrating the visual thresholds on actors other than the synthetic fixture and on GPU renders.

## B13. Storyboard editing inside the Animatic (Studio)

- Source: wonderunit/storyboarder (no licence detected: idea only), motion-canvas (MIT, idea only). Size: M to L.
- What: in the native Animatic page, the scene strip shows each scene's `states` stills (`scenes.mjs states`), drag to reorder (a structure note), drag a scene edge to change its duration (a timing note), and a note pinned to a state. All of it writes notes, never the score directly. Native SwiftUI only; goes with B5; protect owner choices.

## B14. Kinetic type craft audit

- Source: iart-ai/kinetic-typography-skills, Liamrjohnston/remotion-motion-graphics-skill (MIT, ideas only; no Remotion). Size: S to M.
- What: check `references/vocabulary.md` and `library/motion/kinetic-type/` for text-to-shape morphs, variable-font axis choreography and word-level timing on sound; add a recipe only where none exists, GSAP only.

## B15. Calibrate the research warnings with real films

- Source: our own. Size: M (tokens: renders of the reference films and FILM-D/E only, no new film).
- What: run the new warnings (motion-busy, energy-flat, energy-arc-off, calm-beat-busy, result-unheld, first-frame-*, seam-continuity-missing, seam-colour-jump, phone-small-text, states-thin, continuity-break, hero-in-ui-zone, shared-hook-kind, logo-only-ending) on the B8 reference films and our films; set thresholds where the references pass; promote nothing to an error without that. The brief's rendered before/after tests (A to F) and blind review belong here, when the owner asks; also the tests for `lib/film-energy.mjs`, `lib/scene-contract.mjs`, `lib/locks.mjs` and `lib/safezones.mjs`.

## B16. Reference DNA, part 2

- Source: cooked. (MIT, @3b236ec): `creator-teardown/scripts/sound.py` (`voice_mask` L69-85, `onsets` L88-109, `classify` L112-153, `music` L156-201), `look.py` (`caption_colours` L317-442, `stem_ratio`/`weight_of` L287-302, `word_effect` L602-760, graphics density L895-935), `graphics.py` (`fit_ease` L93-116, clean plates L151-218). Size: M (sound), L (look and graphics).
- What: music-under-voice level and motivated SFX density per minute in `lib/deconstruct.mjs soundArc` (Node STFT on ffmpeg f32le, reuse `lib/audio.mjs`; port the code, which tests < 120 Hz only, not the docstring); caption fill, stroke, box, weight and word effect (karaoke, highlight, pill, reveal) into `reflook.mjs`; persistent-graphic entrance curves.
- Why deferred: the slice ships without them; caption colour needs k-means and contours (a small typed-array k-means is fine; no opencv.js unless measured worth it).
- Done when: `research.mjs profile` reports `music_under_voice_db`, `sfx_per_min` and `caption_word_effect` with confidence on 3 authorised references, and `profile-compare` compares them (warnings).

## B17. Localized revisions and selective renders (cooked plan wave 5)

- Source: cooked. (MIT, @3b236ec): `style-edit/scripts/edit.py` `still_frames` L176-211, `frames_at` L932-941, `changed_ranges` L963-990, `patch` L1035-1083 (`PATCH_PAD_S` 0.5, `PATCH_MAX_SHARE` 0.6), `splice` L993-1025; `overlays/SKILL.md` L137-142; `references/changes.md`. Size: M (stills), L (patch).
- What: first, selective stills: `finish.mjs stills --at 15.4 | --at 12-16` (five stills at 0.04/0.25/0.5/0.75/0.96 of a range) from the current composition, without a full render. Then a dependency manifest per render (`render.manifest.json`: sha1 of every composition file, asset, font, music, motion.md and global settings, plus per-scene/item time ranges from `reel.edl.json` or `final.scenes`); a change set is local only when every changed hash belongs to items whose ranges are known; padded 0.5 s; more than 60% changed, a change to music, duration, fonts, grade or shared runtime → full render with the reason printed. Patch only after verifying HyperFrames can render a time window deterministically (`hyperframes render` range support: verify first, it is not known); splice by re-encoding the whole film once, audio cut on exact sample offsets; prove untouched intervals with `fixcheck.mjs --touched`. Content hashes only, never mtimes (cooked's speculative cache uses mtime: do not copy that). Keep the approved MP4 untouched; write the patched one beside it.
- Done when: a one-card change in a multi-scene film re-renders only that window (or prints why not), `fixcheck` shows untouched frames identical, and the approved version is still there.

## B18. Scoped preferences (Feature H)

- Source: cooked. (MIT, @3b236ec) `plugins/ai-editor/skills/taste/SKILL.md` L27-38 (scope question), idea only. Size: M.
- What: `lessons.mjs` rows gain `scope: "film" | "reference" | "series" | "all"` (default `"film"` for a correction, `"all"` only when the user says "always" or answers so) and `scope_ref` (run id, profile id or series path); `lessonsBlock` filters by the current run, profile and series; dedupe stays on normalised rule text within one scope; `lessons.mjs list --scope` and `drop` let the user see and undo. A reference-style correction writes `reference/profile.json` `style_overrides`, never `metrics`. No GitHub-issue upload, no second taste store.
- Done when: a caption-size correction applies at the chosen scope, does not reach an unrelated branded film, survives `research.mjs profile` re-measuring, and can be listed and dropped.

## B10. Smaller open items

- Studio shows the new data (P0.4) shipped in #83; a Studio beta cut waits on the owner.
- Release: master is ahead of 1.17.0 where noted; a release needs the owner's ask.

## B19. Video-upgrade outstanding blockers (W12)

- Not verified: end-to-end creative-agent production with the new routes and modules; a GitHub Linux run of `.github/workflows/checks.yml` (regression baselines are macOS arm64); a human blind A/B (report says pending-human-review).
- Known red tests, not fixed: the stale `scenes.mjs rejects an unknown transition and a zero duration` assertion (zero durations are now filled from reading time by design); W8 added `procedural` to the music source chain, so the `music:` chain assertions in `selftest.mjs` may need the new last entry (seen in a quick run, not compared with master).
- Open items: rigged GLB actors (B12), quick-preview versus a real lean film's spend (`references/quick-film.md`), calibration of the new warnings, licence-unverified repos (PDoomVideo, shipvideo, claude-opus-5-5-demo) stay ideas only.
