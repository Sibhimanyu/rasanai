# lemo-opuscar, in RasanAI

Reference: [lemomo-ai/lemo-opuscar](https://github.com/lemomo-ai/lemo-opuscar) by LemoLab, MIT (`LICENSE`, `NOTICE`). A Claude Opus-made library of film styles, each a STYLE.md (essence and what it is not, materials, colour logic, type, motion, camera grammar, sound, pitfalls, engine notes, variation space) plus a demo film.

| Here | From | Used by |
|---|---|---|
| `LICENSE` | `LICENSE` (exact copy) | |
| `library/styles/<slug>.md` for 11 styles (glass-product, dark-keynote, dataviz, blueprint, halftone-dossier, art-deco, ascii-crt, swiss-motion, living-screencast, hologram-hud, iso-infographic) | `styles/<slug>/STYLE.md` sections 1 to 6, 8 (summarised in our words, condensed, with a "signature features" list we added) | the design desk (`references/design-desk.md`), the design-system designers |
| `library/styles/posters/<slug>.jpg` | `styles/<slug>/poster.jpg` (resized to 480 px wide) | the style files |
| The shape of the style files (essence and what it is not, materials, colour logic, type, motion, camera grammar) | `styles/_template/STYLE.md` (the structure, not the text) | DESIGN.md "Motion and camera" and the library styles |

The STYLE.md files' sound palettes, pitfalls, engine and variation sections were not taken. Not taken: demo code, audio, fonts, voices, DEMO.md files, the other styles.

## Added in the motion and looks library (wave 7)

| Here | From | Used by |
|---|---|---|
| `library/styles/prompts/opuscar-prompts.md`: 98 style recipes (medium blend, palette with hexes, texture and motion habits, signature shot, Avoid list), film names, characters, years and credit lines stripped | `styleboard/opuscar98_styles.json` (`prompt_en`, `blend_en`, `render`, `dim`, `style_en`; condensed, MIT) | the design desk, as the SHAPE of a bespoke look |
| `library/grammars/catalogue-cards.json` (grammar for a catalogue film: an "ALL N" hook, a running index, a tick-bar HUD, chapter = hue, a pace ladder, onsets on drum hits) | `styles/pictogram-motion/STYLE.md` (the structure, in our words) | `scripts/grammar.mjs` |
| `taxonomy/devices.json` entries `medium-per-beat`, `five-accelerating`, `euler-path-reveal`, `old-lesson-ghosts` | the microgame, one-line and whiteboard STYLE.md notes (the ideas, in our words) | the story crew |
