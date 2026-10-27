# Procedural original scoring: an optional score built to the film's events

An original score, synthesised on the user's machine in Node typed arrays (sine, triangle, filtered noise), scheduled from the film-event manifest (`motion/events.json`, `references/film-events.md`) so every musical hit sits on the picture's own absolute cue time. No samples, no network, no key, no model, no Python, no hidden cost. It is a **choice and an offline fallback, never a replacement**: the user's own track always wins, and it never replaces a real or licensed track, narration or an existing fitting plan.

## Opting in and out

| You want | Do |
|---|---|
| The original score as an option beside the others | `music.mjs --run "$RUN" --film <s> --procedural [--style "<look words>"] [--story "<story words>"] [--identity <file>] [--seed <n>] [--narrated]` (or `procedural` in `--sources`; it then comes right after the user's own track) |
| Only the original score | `--sources procedural` |
| It as the offline fallback | do nothing: with no usable track from any source (no keys, no network) and `--film`, `music.mjs` adds it; with a key or a catalog hit it stays out of the way |
| The user's own track | `--track <file>`: the user's track is picked first, the score is not even made |
| Silence | `--silent-by-choice "<reason>"` (music.mjs makes no music; `original-score.mjs render` writes nothing) |
| Without `music.mjs` | `node scripts/original-score.mjs render --events <run>/motion/events.json --run <run> [--identity <file>] [--look ".."] [--story ".."] [--seed n] [--sr 44100\|48000] --out <run>/music/score.wav` |

`sound.mjs` takes the result through its existing endpoints, with no second mixer: `fit --track score.wav --film <s>` returns the track's own plan (shape `procedural-exact`: it is already the film's length, so it is **never re-cut on bar lines**, which would move the hits); `render --plan` masters it to **-14 LUFS**, true peak at or under -1.5 dBTP; `check` measures it like any mix. A track with no `.score.json` sidecar, or a different film length, goes through the legacy fit unchanged. SFX density, voice ducking, split edits and mastering stay `sound.mjs`'s job; `sfx-plan` still places the sound effects.

## What it builds

- **A musical identity from the look and the story** (`deriveIdentity`): a family (the same seven that `music.mjs` searches by: editorial, dark-tech, playful, cinematic, raw, retro, organic), a pulse (bpm in the family's range), a key and mode, the voices (lead, pad, rhythm, bass), a signature motif of 3 to 6 notes and a cadence. Look and story words and the seed give the identity; **no event time does**, so moving a cue never changes the key, tempo or motif. A hand-written `--identity` file (`look`, `story`, `seed`, `family`, `bpm`, `mode`, `hit_event_ids`, `sections`, `motif`) wins field by field.
- **Sections** from the arc's cues: intro `[0, drop)`, peak `[drop, payoff)`, resolve `[payoff, end]` (an identity can list its own with `start_s`, `end_s`, `energy`, `instruments`). Each has an energy and a voice set: plucks and a pad; bass, percussion, plucks, pad and the motif; pad, slow motif and plucks. Three instrument families in all: plucked, sustained pad, bass and percussion.
- **Distinct entry, peak and end.** It opens already playing (a pluck on the first step, a pad under it), builds to one **peak hit on the picture event** (`hit_event_ids`, else the visual hit on the arc's drop, else the drop itself): a sub drop, a noise crash and a chord stab starting on the cue's own sample, preceded by a **designed pause** (the music gates down 0.4 to 1.1 s, only the ambience left). A lighter payoff accent sits on `payoff_at` after a short breath. The **closing chord** is struck on the logo / cta event (else `button_at`, else 0.9 s before the end), rings out under 1 s and is faded to silence on the last frames: an audible finish, **no music past the CTA**.
- **Not a loop.** Every note comes from a stateless hash of (seed, voice, step), chords come from a progression chosen phrase by phrase, and the motif is varied from phrase to phrase, so no block repeats verbatim. `check` tests the level shape for repeats.
- **Stems.** `music`, `ambience` (slow filtered noise and a quiet drone, softer under the peak) and `foley` (a short tick, whoosh or thud only for the picture events that name a `sound`, at most one per 0.35 s and 10 in all, so the SFX budget is never crowded) are written separately to `<out>-stems/`. The main WAV is music + ambience; `--with-foley` folds the foley in.

## Deterministic rules

The same events, identity and seed give the **same bytes** (on the same Node and platform: it is plain `Math.sin` and integer hashing). The output has no peak-dependent normalisation or compressor, only a memoryless soft limit, so **changing one scene cue moves only the sounds that belong to it**: the hit, its pause and its foley tick. Everything else is sample-identical (reverb tails of the moved hit are below -100 dBFS a few seconds later). Scene-local times never appear: only the absolute `at_s` of the manifest. A stale manifest is refused (exit 1); a plain `{events:[{id,t,kind}]}` list is accepted.

## Diagnostics and the gate

`original-score.mjs render` writes `<out>.score.json` (the plan, sections, hit ids, pause, ending, licence and provenance, the plan `sound.mjs` fits) and `<out>.diagnostics.json`; `original-score.mjs check --audio <file> --events <events.json>` prints the diagnostics and **exits 2** when a gate fails: clipping or a peak hotter than -1 dBFS; a duration more than one frame off; a declared hit more than **one output frame** from its cue (the onset of the strongest rise within 0.3 s of the cue), or none; unplanned silence (under -60 dBFS for 0.5 s); no designed pause before the peak; an abrupt ending (last 30 ms above -40 dBFS); music past the CTA; sections that do not differ (peak under 3 dB over the intro); an audibly repeated block. Measured: `cues[]` (cue time and frame, onset time and frame, error in ms and frames), `duration_s`, `rms_db`, `peak_dbfs`, `sections[].rms_db`, `silences[]`, `ending`, `loop`, `provenance`.

## Licence, credits and the quality downgrade

The score is original work generated from code. Its `provenance` records `samples_used: []`, and `CREDITS.txt` / `LICENSES.json` list only the samples actually used (none today). **Samples are used only when a licence-verified CC0 or permissive instrument library is available locally**: none ships with the skill (`library/sfx` holds UI and impact one-shots that `sound.mjs sfx-plan` places, not instruments), so every voice is a synthesised sine, triangle or noise voice. That is a **recorded quality downgrade** (a row in `<run>/downgrades.jsonl`, shown in the decisions drawer as "Working without"): the result is clean, in time and on the picture, but thinner than a produced track. Say so when you offer it; a real or licensed track, when the film deserves one, replaces it.

## Budget

A 20 s film renders in about a second and a 60 s film in a few; memory is a handful of stereo Float64 buses of film length (about 100 MB for 60 s at 48 kHz). No process other than the check's optional ffmpeg decode is spawned.

## Listening without ears

`tests/original-score.mjs` prints the section energies and a 0.5 s energy strip, and writes a spectrogram and a waveform PNG (`showspectrumpic`, `showwavespic`): look at them (a quiet intro, a hole before the peak, a hit, a lower resolve, a decaying close) before saying it sounds right. A human still decides if it is good.

Tests: `node scripts/tests/run-one.mjs original-score` (synthetic fixtures in `scripts/tests/fixtures/original-score/`, a made-up 20 s film).
