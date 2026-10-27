# motion-studio fixtures (synthetic)

Invented product "Lumen Ledger". Nothing here is a real brand. Never ship it.

`node build.mjs --out <dir> [--variant landscape|vertical]` assembles a project folder: copies `project/`, adds the vendored GSAP,
generates `assets/beat.wav` (ffmpeg lavfi, click every 0.5 s, picture hit at 11.0 s) and `reference.mp4` (13 s of synthetic cuts and beeps),
and derives `motion/events.json` with `events.mjs export`. Generated media is never committed.
`edits.sample.jsonl` is one contract-D line targeting `scene-1.hero-title` (text change).
`--variant vertical` switches the stage to 1080x1920 (9:16).
