# animate, in RasanAI

Reference: [cth9191/animate](https://github.com/cth9191/animate), MIT (`LICENSE`, copyright 2026 cth9191). A Claude skill for animated explainers with a code kit per style (`styles/<name>/STYLE.md` + `kit.js`), a format guide and measuring tools for references.

| Here | From | Used by |
|---|---|---|
| `LICENSE` | `LICENSE` (exact copy) | |
| `library/styles/riso.md`, `sketchbook.md`, `manim-math.md` (and their `posters/*.jpg`, the source's own `sample.png`, resized to 480 px) | `styles/riso/STYLE.md`, `styles/sketchbook/STYLE.md`, `styles/math/STYLE.md` (measured numbers, palettes, motion habits and frame checklists, summarised in our words and condensed to the nine-section house format) | the design desk (`references/design-desk.md`) |

Ideas built as our own code, no text or code taken: the robust reference-cut measure (`scripts/lib/deconstruct.mjs`: used by `research.mjs deconstruct` and brandfilm's cuts; the idea of `tools/measure/shotlog.py`) and the film-wide print finish (`finish.mjs grade --print riso`; the idea of `styles/riso/kit.js`; the report carries a credit row).

Not taken: the style kits' code, the hero characters, the demos, the audio, the fonts.
