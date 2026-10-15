# RasanAI internal design and motion library

Internal knowledge for the design desk and the Motion Director. It is never shown to the user as a menu and never offered as "pick a style". Per film the desk researches the subject, then BLENDS entries from here into three bespoke design systems (each a DESIGN.md with motion and camera language) and instructs the animating model from the entry's tokens, rules and build brief.

## Layout and formats
- `systems/<domain>/<id>.md` — design systems. Domains: `movements` (graphic-design canon), `studios` (studios, brands, title design, broadcast, editorial), `vernacular` (era, regional and medium looks), `material` (print, craft and 3D material looks).
- `motion/<family>/<id>.md` — animation, camera and 3D techniques (traditional, kinetic-type, ui-motion, cinematic, 3d-cgi, npr-3d, simulation, stop-motion, collage, data-viz, glitch, other).
- `styles/<id>.md` — style references (lemo-opuscar, mg-styles-15; MIT): the design desk pulls 1 to 3 per look and cites their slugs in `blend.json` `style_refs`. Not indexed by `library.mjs index`.
- `index/<letter>.json` — per-author index fragments, merged by the release step into `index.json`, which `scripts/library.mjs` reads.
- `EDITING.md` — per-entry verification status and the remaining gaps (generated from the frontmatter).
- Entry format: see `.context/library-spec.md`. Frontmatter is one key per line, each value valid JSON, `id` equals the filename. `blends_with` / `clashes_with` hold only ids of existing entries (free-text clashes live in the body's Blending notes). The key `verified` (added in the edit pass) records: `sources_fetched`, `non_wikipedia`, `colours`, `colour_images`, `grid`, `timings`, `recipes`, `edited`.

## Verification status legend
- **measured** — a value taken from a real image of the work (collection or case-study image) with `pal.py`-style k-means sampling; the image URL is in `palette.evidence` and `verified.colour_images`.
- **sourced** — a value stated by a source the entry cites (a guideline, a foundry page, a published spec).
- **proposed** — a designer's judgement or a plausible reading, labelled as such. Usable as a starting point, never as a claim about the original.
- **partial** — some roles measured or sourced, the rest proposed.
- Fonts: every `free_alternative` is checked against Google Fonts' own metadata (family exists, weights listed are available); originals that are commercial are named as the reference only.
- Entries without a `verified` key have not had the edit pass: they carry the researchers' original sourcing and unchecked numbers (see EDITING.md).

## Coverage
Systems: movements (39), studios (33), vernacular (26), material (13). Motion: kinetic type, UI motion, cinematic camera languages, traditional animation, stop-motion, collage, data in space, simulation, NPR and toon 3D, ray-marched abstract, product and architectural CGI, glitch, liquid and isometric. Counts per domain and per-entry status: EDITING.md.

## How the design desk uses it
1. Research the subject first (the crew's researchers), then pick two to four entries that fit its content and audience (`good_for` / `not_for`, tags in the index), at most one or two as the dominant voice.
2. Blend by role, not by average: take palette logic from one entry, type and grid from another, motion language from a third. `blends_with` lists combinations that hold; `clashes_with` and each Blending notes section say what breaks.
3. Translate to the film's DESIGN.md: tokens (palette roles, type with real free fonts, grid, shape, texture), motion (ms timings, GSAP eases, entrances, camera), and for 3D scenes the Rasan3D recipe (materials, rigs, passes, camera keys).
4. Instruct the model with the entry's build brief, then check the cheap tells. Treat anything marked proposed as a default to be judged on a rendered still, not as authority.
5. Never name the entry to the user as a preset; the film gets its own system.
