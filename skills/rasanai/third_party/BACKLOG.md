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

## B3. P3.3 New pipelines

- Source: OpenMontage (AGPL: pipeline ideas only). Size: L each.
- What: a clip factory (one long video to many shorts with captions; the clear gap, since RasanAI has reel, presenter and talking-head-recut), documentary montage, screen-demo. Also small items from group2 22: podcast-repurpose and audiogram pipeline, adjacent-cut redundancy for reels (diversify clip search).
- Spec: each pipeline is a format option in `formats.mjs` with its own route, source mode (`research.mjs sources`) and story pass; reuse the footage tools (`footage.mjs`, `reel.mjs`).

## B4. P3.4 Math and diagram scenes via ManimGX

- Source: academa-labs/manimgx (MIT; licence to re-verify). Size: L.
- What: ManimGX (Rust/wgpu, Manim CE API, about 90 times faster, runs in the browser) as a renderer for math and diagram beats in the faceless-explainer route, composited as a clip; its `inspect` storyboard and overlap report before render.
- Done when: an explainer beat is rendered by ManimGX and passes the gates; credit folder `third_party/manimgx/` created.

## B5. P3.5 Reference-vs-draft review UI in Studio

- Source: NullMotion viewer (no licence: idea only). Size: M to L.
- What: the user's reference clip beside the animatic or final, one synced playhead. Native SwiftUI only (`apps/macos/Sources/RasanAIStudio/`); coordinate with whoever is editing Studio; protect owner choices.

## B6. R5 optional and later

- motionmaxxing 11: brand capture hygiene (drop blank images, flag screenshot-not-product media, isolated element shots, ink from the largest heading, accent from imagery, dismiss cookie banners; verify against HyperFrames capture first). M. Source: motionmaxxing (Apache-2.0).
- motionmaxxing 13: human blind A/B page in Studio (giveaway warning when resolution, fps or duration differ; "picture silent first, then each soundtrack alone"). S. Native; goes with B5.
- mortiflix 7: per-line voice recording booth for the user's own narration (hold-to-talk, clipped/quiet/too short flags, takes per line) in Studio. M to L. AGPL: idea only.
- mortiflix 8: original-score engine (Strudel, harmony lock, intensity curve against the blueprint, MIDI). L, heavy, optional. AGPL: idea only.
- mortiflix 9: publish approved films (Upload-Post or Postiz). M, probably out of scope.
- lemo 12: original score and foley from an event list (97 CC0 instruments; pluck.py needs numba, banned, so a Node engine). L, low priority. Source: lemo-opuscar (MIT).
- lemo 11: offline narration fallback (Kokoro or edge-tts) appears DONE: `scripts/voice.mjs` mentions both. Verify the model licence is recorded in `SOURCES.md`. S.
- group2 19: mocap puppet for the cartoon route (with B2). M to L. group2 21: first and last frame generated plates (gbro idea), only for a generative-video route. L, optional. group2 22: the small items above.
- animate 4: seamless-loop check for reels (`review.mjs` LOOP: diff(last, first) at most the typical consecutive diff; audio tail folded). S, low.

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
- What: precedent rows for `moments.mjs precedent` from the list's `data/videos.json`: slug, category, tech tags, post and remake links, plus OUR one-line technique per row. Start with the ~45 full structured prompts; skip the 207 partial ones (post text only).
- Why deferred: the 716 motionmaxxing rows already cover most techniques, and every row must be stripped of brand names, characters and songs before it ships (INTAKE rule), which needs a careful read per row.
- Done when: rows carry no third-party names or prompt text, `SOURCES.md` TOOK updated.

## B10. Smaller open items

- Studio shows the new data (P0.4) shipped in #83; a Studio beta cut waits on the owner.
- Release: master is ahead of 1.17.0 where noted; a release needs the owner's ask.
