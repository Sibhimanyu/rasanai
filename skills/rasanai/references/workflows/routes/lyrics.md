# Route: lyric videos and music to video (`music-to-video`)

> Moved verbatim from the former single `SKILL.md`. References such as "§3d", "rule 18", "below" and "above" point into the sibling guides: the five-call contract and the hard rules are in [shared-contract](../shared-contract.md); the phase guides are listed in `SKILL.md`.

### Story for a song (route `music-to-video`)

A track with fixed lyrics needs one concept, one visual world and a plate per lyric section in which every line becomes a picture, not three scripts. The playbook is `references/lyric-video.md` (what makes a lyric video people rewind; the format `treatment.mjs` checks); the words and music come from `music/lyrics.json` and `music/audio.json` (above; `references/lyrics.md`).

```bash
node $SKILL_DIR/scripts/crew.mjs plan --run "$RUN" --route music-to-video --subject "<song>" [--public] [--length <s>]   # precedent researcher only with --public: the artist's and genre's visual conventions
node $SKILL_DIR/scripts/crew.mjs brief --run "$RUN" --role treatment-writer --key Sure|Bold|Wild                      # three treatment writers in parallel (agents/treatment-writer.md)
node $SKILL_DIR/scripts/crew.mjs check --run "$RUN" --role treatment-writer --key <label>                              # runs treatment.mjs check with the lyrics and the audio, and wants story/TREATMENT-<label>.md
```

Each writer starts from `treatment.mjs skeleton` (plates per section, starts snapped to downbeats) and returns `story/treatment-<label>.json` plus `story/TREATMENT-<label>.md`. A treatment that fails `treatment.mjs check` (every line covered once, plates contiguous and on the beat grid, varied idioms, a recurring motif, escalating hooks, one owned accent, 3D present, energy that follows the song) goes back to its writer with what it names; two rewrites at most, then the Director writes it. Sure is the obvious-in-hindsight format for this song, Bold a strong formal conceit with a signal running through it, Wild the one a studio would put on its reel.

Push `story` with `stories: [{id, angle, title, logline (≤ 12 words), treatment_md: "$RUN/story/TREATMENT-<label>.md", plates: [{id, title, start, end, idiom, space, energy}], concept, last_line}]` and `recommended`; the page shows the three treatments as tabs, each read from its TREATMENT-<label>.md. Answers: `choose <id>` → copy that treatment to `$RUN/story/chosen-treatment.json` (and its words to `chosen-treatment.md`; the Motion Director reads both), record `memory.mjs record --step concept --value <concept> --mode confirmed`, close `story`, and go to the Look. A `note` → send it to that writer (`SendMessage` or a fresh dispatch with the note), re-check, re-push. `more` → three new treatments on new concepts.

## Where the rest of the lyric-video steps live

- Lyrics first (`lyrics.mjs align` / `audio`) and the `RasanMusic` composition runtime: the `music-to-video` bullets of the Brief in [brief-and-research](../brief-and-research.md).
- A lyric video has no look picker (the treatment's `style_bible` is the look): the first paragraph of the Look call in [look-and-design](../look-and-design.md).
- A lyric video builds its animatic from the plates against the real track (`treatment.mjs scenes`): the start of the Animatic in [music-animatic-build](../music-animatic-build.md).

## Deeper references for this guide

The canonical homes of the detail this guide points at (read the one the current step needs):

| Need | Read |
|---|---|
| lyric videos: the treatment format, idioms, hooks, karaoke rules, the show-off bar | `references/lyric-video.md`, `agents/treatment-writer.md`, `scripts/treatment.mjs` |
| word timings and the music runtime (`lyrics.mjs`, `RasanMusic`) | `references/lyrics.md` |
