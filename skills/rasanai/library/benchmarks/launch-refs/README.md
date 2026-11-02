# House reference films for launch films

Three launch films the owner supplied, analysed with `scripts/refs.mjs` (Node + ffmpeg) and read by hand. Only breakdowns and small contact sheets are kept: no video, no audio, no frames beyond one 1 fps contact sheet each. They inform, never copy (SOURCES.md: analysed only, not redistributed).

| id | film | length | sound | logo | carrier |
|---|---|---|---|---|---|
| `minase` | Minase launch (Video-4679) | 41.5 s | voice-over + bed | 3 | UI cards + an up-arrow chip |
| `kinso` | Kinso launch (Video-78313) | 46.4 s | instrumental, no voice | 3 | a coral orb (local) |
| `sovra` | Sovra.fm launch (Video-75914) | 52.2 s | instrumental | 1 (end card) | none: ribbons bookend, a DJ orb is a product character |

Each folder: `breakdown.md` / `breakdown.json` (the reference-analyst shape, plus `corrections`), `beats.json` (the beat table: copy, carrier state, transition in, density, logo), `stats.json` (refs.mjs output), `words.json`, `music-map.json`, `thumbs/1fps-contact-sheet.jpg` (one cell per second, 8 per row). `summary.json` is `refs.mjs summarize` over both.

## What they share (the launch grammar, measured)

- 12 to 16 **beats** in 41 to 46 s (median 2.8 to 3.7 s). Count beats, not shots: the scene detector sees ground flips and fast in-frame changes, never a morph or a word swap.
- **Plain cuts: none that matter.** refs.mjs finds 13 (Minase) and 5 (Kinso) frame-difference spikes at 0.4; they are ground flips, masks and carried changes on music hits. Gates must not read a spike as a plain cut unless the score says so.
- **Texture and light differ by film**: Minase steps and flickers on white; Kinso is smooth on a coral gradient; Sovra is smooth, dark and lit by moving purple glow. Never judge a film by one of them alone.
- **Logo 3 times**, small: the meet, at most one more, the end card.
- **Scene variety, not one carrier**: each beat is its own scene with its own move (a carrier, where one exists, is local); **one thought per beat**, lines of 3 to 9 words (the longest, 11 to 14, build word by word).
- **Dense and sparse alternate** (5 to 6 alternations); the ground flips on a music hit.

Read `references/launch-grammar.md` for the rules and `references/score.md` for the score's beat fields. In a launch run these are loaded by default (`crew.mjs houseRefsContext`) unless the user's own references are in `<run>/refs`.

## Corrections to refs.mjs

- Minase has a voice-over (92 words) that reads each on-screen line; the sound-mode guess `vo` is right.
- Kinso has no voice: the whisper transcript ("I'm going to go") is a mishearing of the music. Mode `instrumental`.
- Shot counts (21, 8) and cut counts (13, 5) are not the film's structure; `beats.json` is.
