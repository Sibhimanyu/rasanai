# The film-event manifest: one timeline for picture, audio, subtitles and QA

`motion/score.json` stays the authored truth. `<run>/motion/events.json` is a **derived manifest**: every time the film cares about, in film seconds, computed once so music, sound, captions, the gates and delivery stop computing their own copies. It is never hand-written and never a second place to edit: change `motion/score.json`, run the export again. A direct edit of `events.json` is overwritten, with a warning.

```sh
node scripts/events.mjs export --run <run> [--score <file>] [--out <file>] [--fps <n>] [--audio-meta <file>] [--sfx <sfx-plan.json>]
node scripts/events.mjs check  --run <run> [--events <file>]
node scripts/events.mjs diff   --a <events.json> --b <events.json>
```

JSON on stdout, problems and warnings on stderr. Exit 0 pass (`diff`: identical), 2 invalid, stale or hand-edited (`diff`: they differ), 1 unable (a file missing, bad arguments). Offline: no network, no API, no key. Same inputs give the same bytes.

## What it reads

| Source | Where (first found) | Used for |
|---|---|---|
| the score | `motion/score.json` (or `--score`) | scenes, seams, scene events, film hits, `music_arc` |
| word alignments | `motion/audio_meta.json`, `audio_meta.json`, `audio/audio_meta.json` (or `--audio-meta`) | `word_start` events |
| the sfx plan | `motion/sfx-plan.json`, `audio/sfx-plan.json`, `sfx-plan.json` (or `--sfx`) | measured `foley_hit` times |

A source that is not there is recorded as `{"path": null, "sha256": null, "status": "missing"}`. Nothing is invented: no words without alignments, no foley beyond what the score says has a `sound` (or the sfx plan lists), no beats, no silence.

## The manifest

```jsonc
{
  "schema_version": 1,
  "derived": "DERIVED by events.mjs export ...",
  "source": { "score": "motion/score.json", "sha256": "<sha256 of the score bytes>",
              "audio_meta": { "path": "motion/audio_meta.json", "sha256": "...", "status": "present" },
              "sfx_plan":   { "path": null, "sha256": null, "status": "missing" } },
  "duration_s": 30, "fps": 30,
  "scenes": [ { "id": "reveal", "n": 2, "start_s": 9, "end_s": 21 } ],
  "events": [
    { "id": "scene-reveal-start", "at_s": 9, "frame": 270, "kind": "scene_start", "scene": "reveal", "beat": "reveal", "source_ref": "scenes[1]" },
    { "id": "e-reveal", "at_s": 9.5, "frame": 285, "kind": "visual_hit", "scene": "reveal", "beat": "reveal", "scene_t_s": 0.5,
      "attrs": { "what": "...", "sound": "reveal", "word": "reveal" }, "source_ref": "scenes[1].events[0]" },
    { "id": "foley-e-reveal", "at_s": 9.51, "frame": 285, "kind": "foley_hit", "origin": "sfx_plan", "of": "e-reveal", "scene": "reveal", "source_ref": "sfx_plan.cues[1]" },
    { "id": "word-reveal-2", "at_s": 9.48, "frame": 284, "kind": "word_start", "word": "reveal", "end_s": 9.9, "scene": "reveal", "scene_t_s": 0.48, "source_ref": "audio_meta.voices[0].words[1]" }
  ],
  "sync": [ { "id": "sync-e-reveal", "hit": "e-reveal", "word": "reveal", "word_event": "word-reveal-2", "foley": "foley-e-reveal",
              "status": "aligned", "max_err_s": 0.03, "max_err_frames": 0.9, "within_one_frame": true } ]
}
```

- **Order:** `at_s`, then kind precedence (`scene_start`, `seam`, `music_cue`, `visual_hit`, `foley_hit`, `word_start`), then `id`.
- **Seconds are the truth.** `frame = round(at_s * fps)` is added beside them; the float is kept (rounded only to 1e-6 s to remove float noise). `fps` is the score's `fps`, `--fps`, or 30.
- **Scene-local to film time exactly once.** Scene events (`scenes[].events[].t`) and word starts (`audio_meta.voices[].words[].start`) are in scene seconds; the export adds the scene's `start` once and keeps the local value as `scene_t_s`. Film-level `hits[].t` are already film seconds. A scene event whose `t` lies past its scene is refused (a film time written as a scene time).
- **Stable ids.** Your `id` when the score event has one, else `hit-<scene id>-<index>`; `scene-<id>-start`; `seam-<from id>-<to id>`; `music-<drop|payoff|button|intro|break-start|break-end>`; `foley-<hit id>`; `word-<scene id>-<index>`. Give an event an `id` when a sfx plan or another file points at it.
- **Refused (exit 2, nothing written):** NaN or missing times, negative times, impossible durations (scene or film, `fps` outside 1 to 240), unsupported kinds, duplicate event or scene ids, a word out of bounds (past its scene or the film), a scene with no id and no `n`, any event, seam, cue or voice that names a scene not in the score.
- **Sync.** An event with `word` is compared with the `word_start` of that text in its scene (the nearest) and its foley. `max_err_frames` is the spread of the picture, foley and word times. Within one frame is `within_one_frame: true`; beyond it the export prints a `sync-off` warning with the measured error (it stays exit 0). No matching word: `status: "no-alignment"`, no error is made up.
- **Stale detection.** `source.sha256` (and each source's) is checked by every reader. If the score, the word alignments or the sfx plan changed since the export, or a source that was missing now exists, the manifest is stale: `check` exits 2 and the consumers refuse it. `check` also fails a manifest that differs from a fresh derivation of unchanged sources (a hand edit).

## Mapping from the score's fields

| Manifest | Score field in this repo |
|---|---|
| `scene`, `beat` | `scenes[].id` (else `n` padded to 2 digits); `beat` is `scenes[].beat` if present, else the id |
| scene start / end | `scenes[].start` and `duration` or `end` (starts follow durations) |
| `scene_start` | one per scene |
| `seam` | `seams[]` (`from`, `to`, `kind`, `sound`), at the incoming scene's start |
| `visual_hit` | `scenes[].events[]` (`t` scene seconds, `what`, `sound`, `kind`, `word`, `on_word`, `name`, `x`, `treatment`, `id`) and film-level `hits[]` (`t` film seconds) |
| `music_cue` | `music_arc` `intro_until`, `drop_at`, `payoff_at`, `button_at`, `break[0]`, `break[1]` (only the numbers that are there) |
| `foley_hit` | the sfx plan's `cues[]` (`event`, `t`, `scene`, `kind`) when it exists, else the score events that name a `sound` (`origin: "score"`) |
| `word_start` | `audio_meta.json` `voices[{frame, words[{text, start, end}]}]` (`frame` is the scene `n` or id) |
| `attrs` | the free-text and cue fields of the score event (`what`, `sound`, `size`, `group`, `x`, `on_word`, `name`, `treatment`, `cue_kind` for its `kind`) |

## Consumers (each reads it only when it is given one or finds a fresh one; a legacy run changes nothing)

- `sound.mjs sfx-plan --events <events.json>`: the manifest's picture hits (and sounded seams) are the cue times; the SFX budgets, priorities and the legal sample chain are unchanged. Also the logo, payoff and cut lookups in `sound.mjs check`. A stale manifest is refused.
- `music.mjs`: with `--events <events.json>`, or a fresh `<run>/motion/events.json`, the picture's hit times are its hits, seams and the arc's drop, payoff, button and break end. BPM is still scanned, and tracks are still chosen and fitted as before (the user's own track first).
- `voice.mjs verify --project ... --events <events.json>` (or `events.json` beside `--score`): scene starts and picture hits are the on-screen events of see-and-say.
- `motion-gate.mjs --events <events.json>` (or `events.json` beside `--plan`): the same events and the word times for see-and-say; `--vo` still wins.
- `video.mjs deliver`: a fresh manifest's word times make the `.srt`, and `film-events.json` joins the delivery folder as build metadata: ids, times, frames, kinds, scenes, words and sync, with no score free text (`attrs`), no `source_ref` text beyond field paths, and no path outside the run (an absolute or escaping source path is dropped).
- `crew.mjs check --role motion-director`: only when `motion/events.json` exists, a stale or invalid manifest, a score that no longer derives, and picture/foley/word beyond one frame are warnings (`events-manifest`, `events-sync`).

The Motion Director authors score events as valid references: `t` in scene seconds inside the scene, a unique `id` when something points at it, `sound` when it has a cue, `word` when it lands on a spoken word, a scene `id` or `n` everywhere (`agents/motion-director.md`).

Tests: `node scripts/tests/run-one.mjs events` (fixtures in `scripts/tests/fixtures/events/` are synthetic: a made-up 30 s film).

## Not the same thing as an event commitment

`events.json` is the derived timing manifest. The creative brief's `signature_events` (creative/brief.json) are the approved, canonical event commitments, and nothing in the manifest creates, replaces or satisfies one. A manifest hit with the same id is traceability of time only. Which commitments are bound, open, intentionally absent or incompatible is decided from the selected treatment, the brief's events and the approval pins: see `event-commitments.md`.
