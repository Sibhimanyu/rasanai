# Lyric videos: every word on its sung start, every frame on the beat

A lyric video is a film whose clock is the song. Two JSON files make that exact, and one small browser runtime reads them: nothing in a scene is timed by eye.

| File | Made by | Holds |
|---|---|---|
| `lyrics.json` | `lyrics.mjs align` | lines and words with `start`, `end`, `conf`; the user's own text |
| `audio.json` | `lyrics.mjs audio` | tempo, beats, downbeats, sections, kick/snare/hat (and vocal) onsets, 100 Hz envelopes |
| `rasan-music.js` | `stage3d/` (`stage3d.mjs install` puts it in `assets/three/` beside `rasan3d.js`; `video.mjs inject --runtime` for a film with no 3D scene) | `window.RasanMusic`: pure functions of time over both files |

Pure Node + ffmpeg + whisper.cpp (the `whisper-cli` and models `transcriber.mjs install` sets up). Python is never needed. **demucs**, if installed, is used automatically (it isolates vocals and drums); without it the tool works on the mix and says `source.vocals: "mix"`.

## Commands

```bash
# 1. Word timings for the user's lyrics (one lyric line per text line; [Chorus] markers and blank lines are ignored)
node scripts/lyrics.mjs align --track song.mp3 --lyrics lyrics.txt --out lyrics.json
#   [--lang en] [--stems vocals.wav|<stems dir>] [--no-stems] [--models small.en,large-v3-turbo] [--work <cache dir>]
#   no --lyrics: the transcription becomes the text (lines cut at gaps and sentence ends); say so and let the user correct it

# 2. The music's hooks
node scripts/lyrics.mjs audio --track song.mp3 --out audio.json          # [--stems <vocals.wav|stems dir>] [--no-stems]

# 3. Measure against a ground truth in the same format (matches words in order)
node scripts/lyrics.mjs check --lyrics lyrics.json --truth truth.json

# What is installed; --fetch downloads the large-v3-turbo model (574 MB) that times singing best
node scripts/lyrics.mjs models [--fetch]
```

`align` prints `low_confidence`: words whose time was inferred (held notes, a pause, a misheard word, interpolated). Look at those first; if the film leans on one (a hook word, a reveal), listen to it or give the user a one-line question in the console.

### lyrics.json

```json
{"lines":[{"i":0,"text":"I see sparks of AGI in your eyes","start":1.41,"end":5.88,
  "words":[{"w":"I","start":1.41,"end":2.35,"conf":0.98}, ...]}],
 "source":{"track":"song.mp3","lyrics":"text","lang":"en","vocals":"demucs|mix|stems-file"},"method":"...","stats":{...}}
```

Text is the user's, with typographic quotes (`“ ”`, `’`). `end` is the next word's start when the voice is legato, else when the voice stops (with a vocal stem: 15 dB under the word's level). `conf` < 0.5 is low; `interpolated: true` marks words nothing in the transcription matched (spread between neighbours by syllables, conf 0.2). A word may carry `syl: [[s,e],...]` (spelled-out acronyms) if a hand-corrected file has it; `wordProgress` uses it.

### audio.json

`{duration, bpm, beat_period, time_signature, beats[], downbeats[], sections[{name,start,end}], fps:100, rms[], low[], mid[], high[], (vocal[], drums[], bass[], other[] with stems), onsets:{kick:[[t,strength]], snare, hat, (vocal)}}`. Envelopes are 0..1 (99.5th percentile), 2 decimals. Sections come from the same analysis `sound.mjs` uses (intro, lift, drop, peak, breakdown, verse, outro): names are energy roles, not "chorus"; find a chorus by its lyric line instead. Kick and hat onsets are good with a drum stem; **snare is the weakest** (about half of them right even with stems): use `kick` and `beats` for anything that must be exact, `snare`/`hat` for texture.

**Downbeat phase is a guess from the accents.** A track that opens on a kick at exactly 0 s can come out one beat late (the beat grid is right, the bar starts a beat after it). Look at `downbeats[0]` against the first strong beat when the film cuts on downbeats; a track with a short lead-in reads right (the self-test's click track starts at 0.3 s).

## In the composition

Load the data **before the timeline is built** (inline it, or fetch it in an async build). The runtime is a classic script.

```html
<script src="assets/three/rasan-music.js"></script>
<script>
  RasanMusic.load(LYRICS, AUDIO);                       // objects or JSON strings; sync
  const L = RasanMusic.lyrics, A = RasanMusic.audio;
  const drop = L.get("sudden drop");                    // by content, quotes-insensitive; get(text, nth) for repeats
  RasanMusic.gsapWords(tl, drop, document.querySelectorAll("#drop .w"),
    { from: { autoAlpha: 0, y: 24 }, to: { autoAlpha: 1, y: 0 }, ease: "power3.out" });
</script>
```

| Call | Returns |
|---|---|
| `lyrics.get(text, nth)` / `find(text)` / `findWords("p(doom)")` | line (throws if missing) / lines / words |
| `lyrics.lineAt(t)`, `lastLine(t)`, `nextLine(t)`, `wordAt(t)`, `lastWord(t)`, `linesIn(t0,t1)` | the line or word at a time |
| `wordProgress(word, t)` | 0 before `start`, 1 from `end`, linear between |
| `lineCharProgress(line, t)` | characters of the line sung so far (per-glyph wipes) |
| `audio.beatAt(t)`, `timeOfBeat(i)`, `nearestBeat(t)`, `lastBeatBefore(t)`, `beatPhase(t)` | continuous beat index and its inverse |
| `audio.barAt(t)`, `timeOfBar(i)`, `lastDownbeatBefore(t)`, `barPhase(t)`, `section(t)` | bars from the downbeats |
| `audio.env(name, t)`, `envPeak(name, t, w)` | `rms` `low` `mid` `high` (`vocal` `drums` `bass` `other` with stems), 0..1 |
| `audio.hit(kind, t, halfLife)` | decaying pulse of `kick` `snare` `hat` `vocal`: strength at the hit, halves every `halfLife` s |
| `audio.events(kind, t0, t1)` | the onsets `[[t, strength]]` in a window |
| `audio.sample(t)` | all of the above in one object |
| `gsapWords(tl, line, elements, {from,to,ease,duration,offset,position})` | one `fromTo` tween per word at the word's exact start |

`gsapWords` duration defaults to the word's length clamped to 0.12-0.5 s, so a word is fully in by the time it ends. When the motion contract applies, pass `duration: 0.3` (a value from its scale): the tween still starts exactly on the word. Use `position` to subtract a scene's start when its timeline is scene-local. Everything else is a pure function of `t`, so it works inside `tl.to({}, {onUpdate})`, a Rasan3D `pose(t, k)` and a canvas draw alike: no `Date.now()`, no `Math.random()`.

## How the film uses it

1. **Find lines by content, never by time.** `L.get("sudden drop")`, not `9.5`. When the user fixes a lyric or swaps the track, re-run `align` and the film follows. Scene windows come from the lines: a scene starts on the **last beat before** its first line (`A.lastBeatBefore(line.start)`), or on the downbeat before it for a section change, and ends where the next scene starts (hard cuts, no gaps).
2. **Karaoke rules (every scene).**
   - Every line is readable and **synced per word**: a word appears or highlights exactly at its `start` and completes by its `end`. Anticipation is fine (words shown dim up to ~0.4 s early); highlighting never runs ahead of the voice.
   - Each scene integrates the lyric graphically and differently (written by a spark, riding a curve, typed as tokens, stamped on a form, masked as `[MASK]` that unmasks as sung). The words are part of the image, not subtitles on top.
   - Default emphasis: the sung part full strength, the unsung part about 30-40%.
   - Keep lyric text inside the title-safe area (96 px at 1080p) and clear of any HUD corners.
   - A word may deliberately break the rule (it highlights backwards, slides the wrong way) only when the lyric is about disobeying; say so in the decisions drawer.
3. **Audio hooks for motion.** Camera or scale pushes on `hit("kick", t, 0.12)`; glow, bloom or grain on `env("high", t)`; type weight or width on `env("low", t)`; a held lyric breathes with `env("vocal", t)`; one visual step per beat with `beatAt(t)`; a scene-wide arc with `barAt(t)` and `section(t)`. Pulses are multiplied into a base value, never replace it (`scale = 1 + 0.06 * kick`), and strength is a hit's loudness, so quiet hits move less.
4. **Cut on beats.** Every scene cut, camera move start and big reveal lands on `timeOfBeat(n)`; the biggest ones on a downbeat. Hold the lyric still on the beat where the voice rests.
5. **Check before the render.** `gsapWords` puts each word's tween at its `start`, so the motion contract sees real tweens. After the render, scrub three words per scene and confirm the frame at `word.start` shows the word arriving (the render gate does the same for captions).

## Accuracy (measured on the pdoom song, 227 words)

Ground truth: the `data/lyrics.json` of the pdoom music video (demucs vocals, two CTC models, hand-corrected). Same lyric text in, absolute word-start error against it:

| Setup | median | p90 | within 80 ms | within 150 ms | time |
|---|---|---|---|---|---|
| mix only, whisper small.en (what a default install has) | 60 ms | 280 ms | 59% | 77% | 19 s |
| mix only, 3 whisper models (small.en, medium.en, large-v3-turbo) | 50 ms | 280 ms | 63% | 78% | 56 s |
| demucs vocals + 3 models | 50 ms | 247 ms | 60% | 79% | 3 min (demucs on CPU) |

Word **ends** (the voice dropping) are 60 ms median; with a vocal stem p90 falls from 376 to 230 ms. About one word in five is off by more than 150 ms: nearly all of them are the first word after a held note or a pause, or words buried under a backing pad, and about half of the ones over 300 ms carry `conf` < 0.5. Median error is far below one frame at 24 fps (42 ms is one frame; 50-60 ms is one to two). For a hook word that must be exact, check it by ear.

How it works, so you can reason about failures: whisper.cpp's DTW token times land on the end of each sung word (about 60 ms early, hence the `+0.08 s` bias), so a legato word starts where the previous one ended; several models and inputs (mix, band-passed mix, vocal stem, with and without context) are fused by the median per word; the user's text is matched to each transcription at character level; each start is snapped to the nearest vocal onset in a 10 ms spectral-flux curve of the voice band; after a pause or held note the start comes from the word's own end instead. The bias, the 1.5 s pause threshold and the onset thresholds were tuned on this one song: re-check with `check` when you have a hand-corrected file for another.

Install for the tightest result: `npx hyperframes transcribe <any audio> --json` once (whisper.cpp + small.en), `node scripts/lyrics.mjs models --fetch` (large-v3-turbo), and demucs (`pip install demucs`, or point `RASAN_DEMUCS` at its binary).
