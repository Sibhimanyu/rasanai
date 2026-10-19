# Footage reels: `reel.mjs`

Cut a folder of raw clips into a reel or edit: segments in any order, motion-graphics **cards between clips**, **overlays on top** (names, places, callouts), **captions** from what's said, and a music bed that ducks under speech. `reel.mjs` writes a HyperFrames composition; HyperFrames lints and renders it; `obey.mjs` checks every card, overlay and transition against motion.md.

Needs FFmpeg (ffmpeg + ffprobe), the HyperFrames CLI (`npx hyperframes`), and Chrome (as for previews).

## scan

```bash
node reel.mjs scan --footage <folder> --run <run dir> [--no-transcribe] [--lang auto|<iso>] [--model <ggml name or file>]
```


`--no-transcribe` is only for a user who explicitly chose to continue without transcripts. A missing transcriber makes `scan` exit 3 ("TRANSCRIBER NOT READY"); see SKILL.md, Footage reels, for the ask, `transcriber.mjs install` and the retry-or-skip rule.
Walks the folder (up to four levels deep, for camera cards; `.mp4 .mov .m4v .webm .mkv .avi .mts`) and writes `<run>/footage/footage.json`:

```json
{
  "footage_dir": "raw",
  "lang": "auto",
  "warnings": [],
  "clips": [
    {
      "id": "a001-interview", "name": "A001_interview.mp4", "path": "raw/A001_interview.mp4",
      "duration": 7.831, "width": 1920, "height": 1080, "rotation": 0, "fps": 29.97, "codec": "h264",
      "has_audio": true, "size_mb": 6,
      "sheet": ".rasanai/<ts>/footage/a001-interview-sheet.jpg", "sheet_times": [0, 0.979, "…"],
      "poster": ".rasanai/<ts>/footage/a001-interview-poster.jpg",
      "scenes": [3.2], "silences": [[5.1, 6.0]], "mean_volume_db": -18.2,
      "transcript": ".rasanai/<ts>/footage/a001-interview.words.json", "words": 23,
      "text": "Hi, I'm Maya. We opened our first cafe in Lisbon…", "speech": [0.05, 7.6]
    }
  ]
}
```

- `width`/`height` are as displayed (phone rotation applied).
- `sheet`: evenly spaced frames, one per ~6 s of the clip (at least 8, at most 48; 4×2 tiles for 8, else 6 columns; 320×180 each); `sheet_times` are their source times and `sheet_grid` the layout.
- `scenes`: shot changes (source seconds). `silences`: `[start, end]` spans under −35 dB for ≥ 0.6 s.
- `*.words.json`: `[{text, start, end}]` in source seconds, from whisper-cli (or `hyperframes transcribe` when whisper-cli is missing). **The language is decided per clip, never defaulted** (`lib/lang.mjs`): `--lang`, else the audio stream's tag, else `whisper-cli -dl` with a multilingual model when one is installed, else English **unverified** (`lang_verified: false`, a warning, and a check that the text reads like English), because an English-only model (`small.en`) translates other languages into English without saying so. A language that needs a model that is not installed is not transcribed and not downloaded: the clip gets a `transcript_error` and a warning, and the Director asks the user first (`ggml-small.bin`, about 466 MB). Each clip records `lang`, `lang_verified` and `lang_source`. Clips quieter than −50 dB aren't transcribed. A failed transcription is recorded as `transcript_error`; the clip is still usable.

## reel.json (input to build)

```json
{
  "title": "Slow Pour reel",
  "aspect": "9:16",
  "fps": 30,
  "footage_dir": "raw",
  "footage": ".rasanai/<ts>/footage/footage.json",
  "look": { "preset": "editorial-forest" },
  "motion": ".rasanai/<ts>/motion.md",
  "transition_default": "auto",
  "fit": "cover",
  "captions": { "on": true, "style": "bold", "replace": { "cafe": "café" } },
  "music": { "path": ".rasanai/<ts>/music/warm.mp3", "volume": 0.7, "duck": 0.15, "start": 0 },
  "timeline": [
    { "type": "card", "text": "Slow Pour", "sub": "Lisbon", "duration": 2.5 },
    { "type": "clip", "clip": "A001_interview.mp4", "in": 0, "out": 3.45, "label": "Maya intro" },
    { "type": "clip", "clip": "B002_broll street.mov", "in": 1, "out": 4, "mute": true },
    { "type": "clip", "clip": "phone_clip.mp4", "in": 0, "out": 3, "transition_in": "wipe", "rate": 1.5 },
    { "type": "clip", "clip": "A001_interview.mp4", "in": 3.4, "out": 7.83, "fit": "blur", "focus": { "x": 0.5, "y": 0.4 } },
    { "type": "card", "text": ["Come and see us"], "sub": "slowpour.pt", "duration": 3 },
    { "type": "card", "src": "videos/logo-sting/compositions/index.html", "duration": 3 }
  ],
  "overlays": [
    { "text": "Maya Costa", "sub": "Founder, Slow Pour", "zone": "lower-third", "start": 4.0, "duration": 3, "style": "plate" }
  ]
}
```

**Top level**
- `aspect`: `9:16` (default), `16:9`, `1:1`, `4:5`. `fps`: 12–120 (default 30); every clip is conformed to it.
- `footage_dir`: where `clip` names resolve (paths may also be relative to reel.json or the workspace, or absolute).
- `footage`: the scan's footage.json; captions need it (they read each clip's transcript).
- `look`: `{preset}`, `{frame}` (a design direction's frame.md or your own spec) or `{design_md, mode}` (the project's brand). Installed as the project's frame.md; every family is staged into `assets/fonts/` (a preset's own files, else Google Fonts, else Fontshare); a family that can't be staged becomes Inter, with a warning.
- `motion`: required when there are cards, overlays or non-cut transitions (Claude's cards follow its contract; obey checks them).
- `transition_default`: for clips without their own `transition_in` (default `auto`).
- `fit`: default framing for clips (see below).

**Timeline items** play in order.
- `clip`: `clip` (file), `in`/`out` (source seconds; `out` defaults to the clip's end), `label`, `mute`, `volume` (0–3.98, default 1), `rate` (0.25–4), `fit` (`cover`: fill and crop, aimed with `focus.x`/`focus.y` 0–1; `contain`: letterbox in the look's background; `blur`: the clip over a blurred copy of itself), `transition_in` (`auto` = the motion's own handoff: a clip-path wipe for mask/wipe/push personalities, a dissolve for crossfade ones, otherwise a cut; `cut`; `dissolve`; `wipe`), `captions: false` to leave a clip uncaptioned.
- `card`: `text` (a string, or an array of beats), `sub`, `duration`, and who draws it:
  - `by: "claude"` (the default, or `"cards_by"` at the top level): Claude designs and animates it. `reel.mjs briefs` writes `compositions/cards/card-NN.brief.md` (text, size, duration, placement, the art direction, the motion contract, the fonts, HyperFrames' sub-composition rules and a scaffold); Claude writes `compositions/cards/card-NN.html`; `build` mounts it and refuses while it is missing or malformed (no `<template>`, wrong `data-composition-id`, no `window.__timelines["card-NN"]`).
  - `by: "swatch"`: RasanAI's preview engine draws it in the look's background and the motion language, its hold stretched to `duration` (raised to the motion's minimum with a warning). For quick drafts only.
- `card` (`src`): a HyperFrames sub-composition file (everything inside `<template>`; for example `compositions/index.html` of a unit built with `/motion-graphics`), mounted for `duration` seconds. Its `data-composition-id` is kept. It must be built at the reel's size (checked) and in the reel's motion: `obey.mjs` checks it like every card, so a card made in another personality stops the render. It's copied into `compositions/`; asset files it references (images, fonts) must be copied into the reel project at the same relative paths.

Transitions apply between two consecutive clips only (cards cut in and out; they animate themselves). A dissolve on a motion that bans opacity-only entrances becomes a wipe; a transition that can't fit the motion's duration scale becomes a cut (both warned). Transitions overlap the clips by one scale step near 0.5 s, so the reel is that much shorter than the sum of its items.

**Overlays**: `text`, `sub`, `start` (seconds on the reel's timeline, see `reel.edl.json` for item start times), `duration`, `zone` (`lower-third` default, `top`, `center`; each brief gives the exact rectangle), `style` (`plate`: on a panel in the look's surface or canvas; `clear`: legible over any footage), and `by` like cards (Claude by default: `compositions/cards/overlay-NN.html`, transparent everywhere outside its zone).

**Look and direction**: `look` is `{preset}`, `{frame}` (a design direction's frame.md) or `{design_md, mode}` (the project's brand); it is installed as the project's `frame.md` with staged fonts. `direction` (a compiled direction folder) installs `DIRECTION.md` and puts its summary in frame.md and in every card brief.

**Captions**: `on`, `style` (`bold`: uppercase, heavy, white with a dark stroke, the spoken word in the look's accent; `clean`: sentence case on a plate), `replace` (word → correction, matched case-insensitively without punctuation). Words come from each clip's transcript, mapped through the cut (in/out, rate, position); groups of up to 3 words (9:16) or 5 (wider), breaking at pauses ≥ 150 ms and sentence ends, one group on screen at a time, in the captions zone (just below the lower-third zone).

**Music**: `path`, `volume` (default 0.8), `duck` (level under clips that keep their sound, default 0.18), `start` (offset into the track). Fades in over 0.4 s and out over the last 1.5 s.

## build

```bash
node reel.mjs briefs --reel <reel.json> --project-dir videos/<name>          # card/overlay briefs for Claude
node reel.mjs build --reel <reel.json> --project-dir videos/<name> [--render] [--quality draft|looks|delivery] [--no-lint] [--render-anyway] [--force]
```

1. Validates everything first (files exist, in/out inside each clip, types, zones) and lists every problem at once.
2. Creates the project with `hyperframes init` if needed. Refuses to overwrite an `index.html` it didn't write, unless `--force`.
3. Stages each used segment into `assets/footage/` (only the used range, conformed to the reel's frame, fps and 1 s keyframes; cached by content, stale files removed).
4. Measures every engine card and overlay in Chrome and sizes its hold to the requested duration.
5. Writes `index.html` (muted `<video>` + matching `<audio>` per segment, transition tweens on untimed wrappers, sub-composition slots for cards/overlays/captions, the music bed with a volume lane), `compositions/reel-card-NN.html`, `reel-overlay-NN.html`, `reel-captions.html`, `motion.md`, and `reel.edl.json` (the cut as built: every item's start and duration, overlays, caption groups, warnings) for the console.
6. Runs `hyperframes lint` and `obey.mjs`. With `--render`, a lint error or an obey violation stops before rendering (`--render-anyway` overrides obey only); the render goes to `videos/<name>/renders/<title>.mp4` and is probed.

Output JSON: `total_s`, counts, `warnings`, `checks.lint`, `checks.obey`, `rendered {file, duration, size, audio}`.

## Console

- `footage` step: payload `clips` (footage.json's clips) → cards with contact sheet, facts and transcript; action `submit {include: [clip ids]}`.
- `reel` step: payload `timeline`, `overlays`, `captions`, `clips: [{name, duration}]`, optional `edl` (reel.edl.json) and `video` (a draft render) → the editable cut, a timing strip and the draft player; action `submit {timeline, overlays, captions}` (numbers already numeric; a card text with `|` arrives as an array of beats).
