# Delivery package and narration check

## `video.mjs deliver`: the Final's folder

```bash
node scripts/video.mjs deliver --run <run> --project videos/<name> [--out <dir, default videos/<name>/deliver>] [--rerun]
```

Run it after the finish render passes the gates. It writes one folder and prints JSON (`files`, `poster`, `render`, `draft`, `missing`):

| File | From |
|---|---|
| `<name>.mp4` | the newest finished render in `renders/` (names with draft / preview / strip / test are skipped; a draft only if nothing else exists, and NOTE.md warns) |
| `poster.jpg` | the score's hero beat (`id: hero`, else the highest-energy beat) at its `peak_t`; with no score, the settled frame with the most frame-filling mass (ffmpeg) |
| `<name>.srt` | narrated films: `audio_meta.json` voice word timings (seconds into the beat, put on film time), else a film-time `transcript.json`. Cues break at sentence ends, pauses over 0.7 s, 2 x 38 characters or 5 s, and each is held at least max(1.8 s, speech + 0.6 s). An unnarrated film gets none. |
| `CREDITS.txt` | the run's `music/CREDITS*.txt` (the one naming the planned track; `LICENSES.json` as the fallback), the CC0 sfx packs the project uses (`library/sfx/CREDITS.md`), reference moments (`references/moments/credits.json`), the fonts in `assets/fonts/`, `third_party/*/NOTICE` |
| `build.sh` | `finish.mjs all` (or `npx hyperframes@<pinned> render`) for this project into the folder. The run does not record the flags it used: the finish flags are the defaults of `references/finish.md`, and the script says so. |
| `NOTE.md` | every gate's latest numbers, read from the run: motion gate, slop, obey, sound check (`crew/*.json`), frame gate with boldness (`frames/gate.json`), the latest critic round per lens, A/B verdicts (`crew/ab-N.json`), waivers (motion.md `waivers`, `shape_waiver`) and board deviations with their reasons, `downgrades.jsonl`, and every swapped decision (`decisions_history`) |

Nothing is invented: what the run does not hold is listed under **Missing** in NOTE.md. slop, obey and the sound check print to the console and are not saved by their scripts, so on a normal run they are Missing; `--rerun` runs them on the render and records the results as `<run>/crew/{obey,slop,sound}-deliver.json` (about 20 s) before the note is written. The note is honest, not flattering: a failing gate stays in it.

## `voice.mjs verify`: the narration against its script

```bash
node scripts/voice.mjs verify --audio vo.wav --script lines.json [--names "Brand,Product"] [--captions captions.json | --srt x.srt | --project videos/<name>] [--run <run>]
```

Transcribes the voiceover with `whisper-cli` and the model `footage.mjs transcribe` uses (no name prompt, so a name the voice mangles is not rescued), aligns it word by word to the script (`lines.json`: a list of strings or `{text}`; or one line per row in a .txt) and reports the word error rate per line.

- error `line-wer`: a line over 0.2 (`--max-wer`); warning over 0.1. Re-record, or respell hard words phonetically in the TTS text.
- error `name-misheard`: a `--names` word that was not heard as written (the product name!). Respell it for the TTS only; keep the caption spelled right. A name not in the script is a warning.
- error `caption-too-short`: a caption (from `--captions` json, `--srt`, or `<project>/compositions/captions.html` elements with `data-start` and `data-duration`/`data-end`) on screen for less than max(1.8 s, its speech + 0.6 s).
- Exit 0 clean (warnings allowed), 2 findings, 1 could not run (no `whisper-cli`, no model, unreadable audio: "could not run" on stderr and a row in `downgrades.jsonl`; install with `brew install whisper-cpp` and `hyperframes models install`). Exit 1 is never a pass.
