# Entire videos: how RasanAI plugs into each HyperFrames workflow

RasanAI decides everything creative; the HyperFrames workflow builds. The workflows ask nothing when `BRIEF.md` exists (the state row in `/hyperframes`), so RasanAI pre-writes the files each workflow reads and names the remaining hook points in BRIEF.md's **Customizations**. Scripts: `scenes.mjs` (scene list → STORYBOARD.md / SCRIPT.md), `video.mjs` (`init`, `capture`, `write`, `inject`, `audio-lock`), plus the preview scripts (`tasting.mjs --scenes`, `transition-menu.mjs`, `voice.mjs`, `music.mjs`) and `obey.mjs`.

## Route table

| Route | RasanAI steps used | RasanAI pre-writes (`video.mjs write`) | Hook points during the build |
|---|---|---|---|
| `product-launch-video` | all 14 | BRIEF.md, frame.md (the look: build-frame from a preset, a design direction, or the converted DESIGN.md; fonts staged; + contract + direction), DIRECTION.md, motion.md, STORYBOARD.md, SCRIPT.md, music bed, DISPATCH.md | audio `--voice <id> --provider heygen` · sketch pass → console · `inject` after `frame-packets.mjs` · DISPATCH to frame workers · `audio-lock` after `fetch-sfx` · `obey` after verify · render gate |
| `faceless-explainer` | all 14 | same as above | same (audio `--voice <id>`) |
| `pr-to-video` | all 14; Look fixed to `code-editorial` | same; frame.md is always built from `code-editorial` | project folder from `scripts/project-dir.mjs --pr <ref>`; run its `fetch-pr.mjs` / `ingest.mjs` before Story; code scenes need `source_excerpt`; then as above |
| `general-video` | all 14 | same; frames go to `compositions/frames/NN-*.html` | as above |
| `music-to-video` | Brief, Brand, Route, Direction, Story, Look (a frame preset: required), Motion, Style frames, Music (the track, required), Plan; Scenes/Transitions/Voice skipped (the workflow plans cuts from the beat grid; hard cuts) | BRIEF.md, frame.md (verbatim preset copy: its gate requires it), motion.md, DISPATCH.md, `assets/bgm.mp3` (converted with ffmpeg if needed) | DISPATCH to every frame worker (the contract lives there and in motion.md, not frame.md) · `obey` after verify · render gate |
| `talking-head-recut` | Brief, Brand, Route, Direction, Look (overlay card style), Motion (optional: described in the style fields), Music (optional), Plan | BRIEF.md with the style fields (`footage`) | the chosen motion's feel goes into the `footage` style fields (no DISPATCH or obey: the workflow owns its overlay code) · render gate |
| `reel` (RasanAI's reel editor) | Brief, Brand, Route, Footage, Direction, Story, Look, Motion, Style frames, Cut, Music, Plan | nothing: `reel.mjs build` writes the whole project (references/reel.md) | lint + obey + render run inside `reel.mjs build`; render gate in the console |
| `embedded-captions` | Brief, Brand, Route, Direction, Look (caption identity), Plan | BRIEF.md with the style fields (`footage`) | render gate |
| `motion-graphics` (single unit) | see workflows/routes/motion-graphics.md (the "Single units" guide) | `handoff.mjs` (references/handoff.md) | DISPATCH to every subagent · `obey` · render gate |

`scenes.mjs` accepts the four story routes; for `music-to-video` the scenes come from the chosen treatment instead (`treatment.mjs scenes --treatment story/chosen-treatment.json --lyrics music/lyrics.json --out scenes.json`: one scene per plate, durations from the plate windows, each carrying `plate`, `idiom`, `space`, `energy`, `start`, `end`, `lines` (indices into lyrics.json), `motifs`, `ground`; `references/lyric-video.md`). The track is not fitted or cut; the plates are cut to it. `video.mjs init` runs `npx hyperframes init --skill=<route>` for every route except the footage routes, where it only creates the folder (their workflows set the project up from the footage).

## scenes.json (input to scenes.mjs; also the Scenes panel's payload)

```json
{
  "title": "Tally: launch film",
  "message": "Tally turns receipts into books in one tap",
  "arc": "Before-After-Bridge",
  "audience": "freelancers who dread tax season",
  "aspect": "16:9",
  "music": "warm minimal pulse",
  "narration": true,
  "voice": { "id": "<heygen voice id>", "name": "Maya", "direction": "Warm, unhurried.", "provider": "heygen" },
  "transition_default": "blur-crossfade",
  "scenes": [
    {
      "title": "Shoebox",
      "on_screen": "Tax season. Again.",
      "visual": "A drift of paper receipts piles up and blurs the frame",
      "voiceover": "Every spring, the shoebox wins.",
      "duration": 4,
      "type": "hook",
      "persuasion": "pattern interrupt",
      "beat": "problem",
      "intensity": "high",
      "blueprint": "kinetic-type-beats",
      "asset_candidates": "none — pure typography beat"
    }
  ]
}
```

- Required: `message`, 2–24 scenes, each with a positive `duration` and `visual` or `on_screen`.
- `transition_in` (per scene, ignored on scene 1) falls back to `transition_default`, then `cut`. Valid values: `cut`, or a registry type from the workflow's `scripts/lib/transitions.json` (`crossfade`, `blur-crossfade`, `push-slide`, `zoom-through`, `squeeze`…) optionally followed by `LEFT|RIGHT|UP|DOWN` and a duration (`push-slide LEFT 0.5s`). It sits on the incoming frame.
- `type` (launch films): `hook`, `pain_point`, `product_intro`, `feature_showcase`, `benefit_highlight`, `social_proof`, `branding`, `cta`. `persuasion`/`beat` are free text read by the frame workers.
- `blueprint`: only ids that exist in `hyperframes-animation/blueprints/`; omit it to let the workflow choose.
- `intensity`: `low` · `medium` · `high` → `motion_intensity` in the frame block; the contract maps it to the scale's longer / middle / shorter durations with the same eases.
- `narration: false` (or no voiceover lines) → no SCRIPT.md. Voiced durations are re-timed to the real narration by the workflow's `sync-durations`.
- Optional per scene: `narrativeRole`, `keyMessage`, `notes`, `delivery` (SCRIPT.md), `code` + `source_excerpt` (pr-to-video: a fenced diff ≤ 12 lines).
- `music`: a mood string (the storyboard's `music:` field) or `null` for none. A chosen track is locked separately (`video-decisions.json` → `audio-lock`).

Everything a frame worker must honour is written **inside** its `## Frame N — Title` block (workers only see their packet and frame.md). The output is parsed with the workflow's own `parseStoryboard` before it's written.

## video-decisions.json (input to `video.mjs write`)

```json
{
  "route": "product-launch-video",
  "message": "Tally turns receipts into books in one tap",
  "content": "https://tally.example",
  "destination": "website",
  "aspect": "16:9",
  "language": "en",
  "audience": "freelancers who dread tax season",
  "angle": "Before-After-Bridge",
  "concept": { "title": "The Shoebox Wins", "text": "Paper chaos gives way to one calm tap." },
  "look": { "frame": ".rasanai/<ts>/looks/B/frame.md", "name": "Swiss / International Typographic Style" },
  "direction": ".rasanai/<ts>/direction",
  "brand": "DESIGN.md",
  "motion": ".rasanai/<ts>/motion.md",
  "storyboard_dir": ".rasanai/<ts>/plan",
  "voice": { "id": "<heygen voice id>", "name": "Maya", "provider": "heygen" },
  "music": { "path": ".rasanai/<ts>/bed.wav", "title": "Warm Pulse" },
  "keyframes": [{ "scene": "s1", "image": ".rasanai/<ts>/frames/s1.png" }, { "scene": "s2", "image": ".rasanai/<ts>/frames/s2.png" }],
  "mode": "collaborative",
  "confirmed": { "aspect": true, "look": true, "voice": true, "destination": false, "language": false },
  "receipts": { "stated": ["aspect 16:9 (from the request)"], "agent": ["Motion language: precise, passed over smooth (the generic default)"] },
  "footage": null,
  "assets": [{ "path": "assets/logo.svg", "role": "logo" }]
}
```

- `look`: `{ "preset": "<id>" }`, `{ "frame": "<frame.md>", "name": "<look name>" }` (a design direction from `design.mjs looks`, or the user's own frame spec), `{ "design_md": "DESIGN.md", "mode": "dark" }` (the project's brand reference, converted; references/brand.md) or `{ "design_md": …, "preset": "<id>" }` (the brand remixed onto a preset's layout). Fonts are staged into `assets/fonts/` with an `@font-face` section in frame.md.
- `direction`: a compiled direction folder (`direction.mjs compile --out`); installs `DIRECTION.md`, appends its binding summary to frame.md and DISPATCH.md, and `inject` adds it to every frame packet (references/direction.md).
- `music`: `{ "path", "title" }` (the exact bed: normally the one `sound.mjs render` edited to picture and mastered; locked with `audio-lock`), `{ "mood": "..." }`, or `"none"`.
- `keyframes`: the animatic's approved key frames, one per scene (`[{scene, image}]`, or plain paths). `write` copies them to `assets/keyframes/<scene>.png` and tells the workflow (BRIEF.md Customizations and DISPATCH.md) that each is its scene's visual target. `styleframes` is read the same way.
- `mode: "autonomous"` (after "Just make it", the `decide-rest` action) sets `storyboard: no`, so the workflow skips its sketch pass; otherwise the sketch pass and layout gate run and are relayed to the console.
- `confirmed`: only answers the user actually gave; those are recorded into HyperFrames' own preference store (media-use `prefs.mjs`). Agent decisions are never recorded as preferences.
- Footage routes: `motion` and `storyboard_dir` are optional; `footage` holds the style fields the workflow would otherwise ask (e.g. `{"caption_style": "bold pop, 2 words per line", "position": "lower third", "accent": "#FFB000"}`).
- `write` validates every input before writing anything. A project with built frames is refused unless `--revise`, which moves compositions, snapshots, renders, index.html, the audio metas, frame packets and storyboard.html into `.superseded/<stamp>/`.

## What `write` produces

- **BRIEF.md**: canonical frontmatter (`workflow`, `flow: automation`, `storyboard`, `message`, `aspect`, `language`, `length`, `style_preset`, `voice`…), Intent, Assets, **Customizations** (design step done, plan approved, voice flag, `audio-lock` and `inject` instructions, the obey check), Notes with receipts.
- **frame.md**: from a preset, built by the workflow's `build-frame.mjs --preset <id> --hyperframes <dir>` (brand-remixed onto the capture or onto `look.design_md`); from a design direction or the brand's own DESIGN.md, written by `lib/install.mjs` with fonts staged and a "Font loading" section. Then the **motion contract** and the **art direction** are upserted at the end (idempotent; markers `<!-- rasanai:motion-contract -->`, `<!-- rasanai:direction -->`). music-to-video keeps its verbatim preset copy (the contract and direction go into DISPATCH.md).
- **motion.md**, **STORYBOARD.md**, **SCRIPT.md** (narrated), the music bed, **DISPATCH.md** (the contract plus what's decided; appended to every frame worker and repair dispatch).

## Build-time commands

```bash
node $SKILL_DIR/scripts/video.mjs inject --project-dir videos/<name> --run "$RUN"                  # after frame-packets.mjs
node $SKILL_DIR/scripts/video.mjs audio-lock --project-dir videos/<name> --music videos/<name>/assets/music-bed.<ext>   # after fetch-sfx
node $SKILL_DIR/scripts/obey.mjs --project videos/<name>                                              # after verify, before render
node $SKILL_DIR/scripts/finish.mjs all --project videos/<name> --out <final.mp4>                      # the delivery render only: film-wide motion blur + one grade (references/finish.md); drafts use the workflow's render
```

The finish replaces the workflow's own delivery render for the final: it renders the project itself (oversampled), so run it after the gates. Rasan3D scenes then set `motionBlur: false` (a whip-speed 3D move keeps shutter 0.25): `references/3d.md` §4.

- `inject` upserts the contract into every `.hyperframes/frame-packets/NN.md` (not `_*`), refusing any packet that would pass the workflow's 48,000-byte cap. Re-running is safe.
- `audio-lock` copies the track to `assets/music-bed.<ext>` and points the `bgm` entry of `audio_meta.json` / `audio_engine_meta.json` at it (volume 0.12 under narration, 0.9 without), clearing `bgm_pending`.
- `obey` checks every file in `compositions/frames/`; the assembled `index.html` and `compositions/captions.html` are reported as `skipped` (the workflow owns them). Exit 0 clean · 2 violations · 1 could not run.

## Footage editing

- **A folder of clips to cut** (reels, recaps, b-roll edits, cut-ins, graphics between and on top of clips): the `reel` route, `references/reel.md`.
- **One continuous talking-head clip**: `embedded-captions` (plain captions) or `talking-head-recut` (designed overlay cards). RasanAI directs their style (Look, Motion) and pre-answers their style questions in BRIEF.md.
