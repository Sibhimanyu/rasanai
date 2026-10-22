# Quick preview: a fast, optional single-HTML film prototype

`quick-preview` is an **opt-in** way to get a first draft of a simple film in minutes. It does not replace the full production, it adds no sixth user decision and needs no cloud. The five calls (Brief, Story, Look, Animatic, Final), `crew.mjs --budget lean|standard|full`, the default direct path and the meaning of "Just make it" are exactly as before; a quick draft is shown in the Animatic like any other draft, and the Final still passes the usual gates and credits.

The idea (one HTML scene, a seeked clock, headless Chromium, scene-error checks, ffmpeg) comes from diggerhq/shipvideo, which had no verified licence: **idea only**, nothing copied (`third_party/SOURCES.md`). The code, the adapter and these notes are original.

## When (and when not)

Valid for a film of **10 to 40 s** made mainly from a prompt, a permitted URL's already captured public data, a short script or existing basic art assets: one title, one diagram or mechanism of 2 to 4 steps, one end card. **Not** for regulated or claim-bearing films, footage cuts, long films, music videos, brand films, series, several 3D rigs, or brand-perfect finished deliverables. `scaffold` refuses those with exit 2, status `needs-full-crew`, and writes an `upgrade` row to `<RUN>/quick/upgrades.jsonl`: a quick preview is never a silent, incomplete film.

## The commands (`scripts/quick-film.mjs`)

```sh
node skills/rasanai/scripts/quick-film.mjs scaffold --run <RUN> --project <PROJECT> --duration 30
node skills/rasanai/scripts/quick-film.mjs check    --project <PROJECT> --json
node skills/rasanai/scripts/quick-film.mjs render   --project <PROJECT> --out <PROJECT>/renders/quick-preview.mp4
node skills/rasanai/scripts/quick-film.mjs promote  --run <RUN> --project <PROJECT> [--budget lean|standard|full]
node skills/rasanai/scripts/quick-film.mjs bench    --brief <quick brief.json>      # the numbers below
```

| Step | What it does |
|---|---|
| `scaffold` | reads `<RUN>/quick/brief.json` (print the template with `--print-brief-template`; `agents/quick-builder.md` says what goes in) and the approved Look, validates both, stages fonts, writes `quick.json`, `compositions/quick/index.html`, a HyperFrames host `index.html` that mounts it (vendored GSAP, no CDN) |
| `check` | measures, in headless Chrome with no network: console errors and uncaught exceptions, missing assets and fonts, the visible text of each beat at fixed timestamps, blank frames (a flat frame for 2 samples = a blank cut), a timeline bounded to the brief's duration, **A-B-A and cold-browser seek identity**, and text readability (`lib/reading.mjs`, a warning: new gates start at warning severity). Before anything runs it refuses remote scripts, iframes, remote or unlisted images, `<audio>`/`<video>` tags and video-as-frames, unseeded randomness, wall-clock time and timers, network calls, user secrets and private paths, and an edited adapter. A composition with an unsafe reference is never loaded. Exit 0 ok, 2 findings, 1 could not run (`not run: <reason>`) |
| `render` | runs the check first (a failing check renders nothing), seeks every frame (jpeg capture, software GL by default) and encodes with ffmpeg; music and sfx from `quick.json` are mixed (silent previews say so). `--engine hyperframes` renders the host with `hyperframes render` instead, when the project has `hyperframes.json`. Writes `<mp4 base>.json` (hashes, fps, time to first draft) |
| `promote` | records the quick draft as the film's **origin** and hands over to the normal flow without restarting (below) |

## The composition and its clock

`PROJECT/compositions/quick/index.html` is a HyperFrames **sub-composition** (everything inside one `<template>`, one `#root` with `data-composition-id="quick"`), so the same file renders in the normal HyperFrames host. It registers one paused GSAP timeline on `window.__timelines["quick"]`, the contract every HyperFrames film already follows.

CSS keyframes, WAAPI and per-frame (`rAF`) code are not part of a GSAP timeline, so the composition carries a small **virtual-time adapter** (fenced, original, `lib/quick-film.mjs` `VT_SRC`): it wraps that one timeline's `seek/time/totalTime`, so a seek to `t` also sets every CSS/WAAPI animation's `currentTime` to `t`, steps the scene's own virtual `raf` queue at 60 ticks per second, and calls `window.render(t)` if the file defines one. A backward seek **rebuilds** the scene and replays forward, so A-B-A and a cold seek give the same pixels. The adapter lives only in the quick composition: no global clock patch, nothing is installed for ordinary films (`general-video` and every other route are untouched; the test asserts it).

The same file also renders through `hyperframes render` (`--engine hyperframes`): on the 12 s test film the two engines agree within a mean 1.5 to 2.9 % per channel (codec and timing rounding) and the rAF-driven dot lands on the same pixel column (152 vs 152 and 341 vs 340 of 480), so the adapter drives CSS, WAAPI and rAF there too.

## Promotion (`promote`)

Requires a rendered preview whose recorded hashes match the composition and brief (an edited file is a `stale-preview`). Writes `<RUN>/quick/`: `origin.json` (`origin: "quick-html-draft"`, composition hash, the actual preview's hash, duration, fps), `storyboard.json`, `score.json` (a **seed** for the Motion Director, never `motion/score.json`), `look.json` (the approved Look inputs and their hash), `brief.json`, `composition.html`, `preview.mp4`, and `upgrades.jsonl`; `decisions.json` gets a `quick_preview` entry; the draft's music and image credits go to `<RUN>/music/CREDITS-quick-preview.txt`, where `deliver.mjs` already looks. It then prints the normal next steps: `crew.mjs plan --run <RUN> ... --budget <b>` (members read `quick/` as their start; nothing restarts), `video.mjs write/inject`, `obey.mjs`, `slop.mjs`, `motion-gate.mjs`, render, `video.mjs deliver`. If the quick draft passes those gates it may be delivered as it is; a more ambitious build reuses the same copy, assets, storyboard and Look, and any extra animation that needs the full crew is logged as an upgrade.

## Measured: time to first draft and model demand

Method (`quick-film.mjs bench --brief <brief>`): the machine half is timed with wall clocks (scaffold, check, render, software GL, one machine under other load); the model half is the text the model must read and write, estimated as characters / 4 (an **estimate**, labelled as one): the builder role + this file + the brief it reads, the brief it writes (the composition is generated by code), against the crew's own plan for the same film from `crew.mjs plan --budget lean` (its planning table, not an actual spend).

Measured on 2026-10-22, 30 s synthetic three-beat fixture, 1280x720, 30 fps, `RASANAI_GL=cpu`, macOS arm64, other agents running (load average about 10):

| | quick-preview | lean crew |
|---|---|---|
| model dispatches before the first draft | 1 (the brief; 0 if the owner writes `quick/brief.json`) | 12 (design research, research, lead, story edit, design system, concept gate, thumbs, score, build, review, retrospective) |
| model text (estimate) | about 3.3k tokens read and written (3,088 read: this file, the builder role and the brief; 232 written: the brief). A model that hand-writes the HTML instead writes about 2.1k more | ~1.0M planned tokens (`crew.mjs plan --budget lean`) |
| machine time to first draft | 46.5 s total on the CDP engine: scaffold 0.005 s, check 10.0 s, render 36.4 s (900 frames). With the HyperFrames engine the same render took 15.6 s (check 10.0 s + 15.6 s about 26 s) | not measurable offline: it is model-bound |

Verdict: on the two axes that can be measured, quick-preview is observably cheaper: one model step instead of twelve, and a few thousand tokens against the lean plan's ~1.0M, with a first draft file about 46 s after the brief exists. Those compare different ambitions (a template film against a crafted one) and the lean figure is the crew's plan, not a recorded spend, and the lean time-to-first-draft was not measured (it is model-bound). So quick-preview stays **experimental and opt-in, never a default**, until a real lean film's recorded tokens and time sit beside it (`crew.mjs check --tokens` keeps those). The model-demand figures are estimates and the lean time cannot be measured without paid model passes; no claim beyond those numbers is made. The preview is a **draft**: a 3-beat template film is not what the full crew's art department, moves pass and critics produce, and it is not meant to be.

## Files

`scripts/quick-film.mjs`, `scripts/lib/quick-film.mjs`, `scripts/tests/quick-film.mjs` (synthetic fixture `tests/fixtures/quick-film/`), `agents/quick-builder.md`.
