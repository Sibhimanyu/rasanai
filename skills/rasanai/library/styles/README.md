# Style references

26 look references for the design desk, imported from two MIT-licensed repositories (credits and what was taken: `third_party/lemo-opuscar/`, `third_party/mg-styles-15/`). They are **references to blend from, never presets**: a design-system designer pulls one to three that fit the brief, takes one or two traits from each (a material, a colour rule, a camera move) and writes the film's own system; each system then lists its own `## Signature features`. Unbranded films only, like the rest of the library (a branded film takes its look from the brand film card).

Each `<slug>.md`: frontmatter (`id`, `name`, `kind: style-reference`, `source`, `source_url`, `license`, `poster`, `one_line`), then the sections `## Essence, and what it is not`, `## Materials`, `## Colour logic`, `## Type`, `## Motion`, `## Camera grammar`, `## Signature features` (3 to 6 numbered, checkable traits), `## When to use`, `## Source and licence`. `posters/<slug>.jpg` is a 480 px still from the source repo's own demo film. `scripts/tests/styles.mjs` checks all of it.

Find one: `grep -il "<words>" library/styles/*.md`, or read the table below.

| id | style | one line | source |
|---|---|---|---|
| [glass-product](glass-product.md) | Glass product render | A fictional glass-and-metal hero object in a black studio, lit by strip lights, with light travelling inside it. | lemo-opuscar |
| [dark-keynote](dark-keynote.md) | Dark tech keynote | A software launch where the interface is the star: near-black stage, hairline grid, one accent, snap-grid motion. | lemo-opuscar |
| [dataviz](dataviz.md) | Data storytelling | A chart that tells a story: real data drawn mark by mark on cream paper by a red-blue pencil with pinned handwritten notes. | lemo-opuscar |
| [blueprint](blueprint.md) | Blueprint | White technical line work on uneven Prussian blue cyanotype, drawn in drafting order, with annotations that move. | lemo-opuscar |
| [halftone-dossier](halftone-dossier.md) | Halftone dossier | A retro print case file: cream archive paper, overprinted halftone dots, heavy headlines with misregistered shadows, slamming rubber stamps. | lemo-opuscar |
| [art-deco](art-deco.md) | Art Deco | Black lacquer, engraved gold line and airbrushed geometry: a 1930s poster that moves, built on a centre axis. | lemo-opuscar |
| [ascii-crt](ascii-crt.md) | ASCII / CRT terminal | Everything is a real character on a monospace grid, lit by the phosphor of an old monochrome CRT. | lemo-opuscar |
| [swiss-motion](swiss-motion.md) | Swiss motion graphics | International Typographic Style in motion: a modular grid, one typeface, one signal colour, movement as exact as a printing press. | lemo-opuscar |
| [living-screencast](living-screencast.md) | Living screencast | A walkthrough that looks like a real screen recording, with a low-resolution mascot living in the high-resolution interface and acting out what the software does. | lemo-opuscar |
| [hologram-hud](hologram-hud.md) | Sci-fi hologram HUD | An object scanned into a glowing wireframe; target boxes lock onto its parts and numbers roll from garbage glyphs into the real value. | lemo-opuscar |
| [iso-infographic](iso-infographic.md) | Isometric infographic | A system diagram comes alive: an isometric diorama of flat three-tone blocks, thin ink labels and Isotype numbers. | lemo-opuscar |
| [flat-vector](flat-vector.md) | Flat vector 2D | The canonical explainer look: solid colour shapes, geometric characters, elastic entrances, one continuous flat world. | mg-styles-15 |
| [line-art](line-art.md) | Line art, one line | A single constant-width line draws, extends and transforms into the next shape; the whole film is one continuous stroke. | mg-styles-15 |
| [isometric](isometric.md) | Isometric 2.5D | A miniature world in true isometric projection that builds itself: no vanishing point, buildings that grow, rail-style camera. | mg-styles-15 |
| [3d-render](3d-render.md) | 3D render (C4D/Blender finish) | Soft, satisfying CGI: candy materials, cloner-array ripples, physics-feel jiggle and a held hero composition. | mg-styles-15 |
| [cel-boil](cel-boil.md) | Cel animation and line boil | Hand-made frame-by-frame magic: ink linework that re-draws every two frames, smear frames and hand-drawn FX on a paper ground. | mg-styles-15 |
| [collage](collage.md) | Collage and cut-out | Photo cut-outs with white scissor edges and halftone on newsprint, puppet-jointed, stepped at 12 fps. | mg-styles-15 |
| [liquid](liquid.md) | Liquid motion | Shapes flow, stretch, drip and merge like thick glossy paint; a logo condenses from a drop. | mg-styles-15 |
| [morph](morph.md) | Shape morph chain | One hero shape continuously becomes six to eight meaningful icons, on the beat, through simple intermediate forms. | mg-styles-15 |
| [bauhaus](bauhaus.md) | Bauhaus geometric | Circles, triangles and rectangles on a strict modular grid, in primaries on cream, each move an integer number of modules on a beat. | mg-styles-15 |
| [synthwave](synthwave.md) | Retro: synthwave, VHS, Y2K | A period medium aesthetic: neon perspective grid, striped sun, chrome type, VHS tracking glitches, acid Y2K chrome. | mg-styles-15 |
| [aurora-glass](aurora-glass.md) | Aurora gradient and glassmorphism | Large blurred colour blobs drifting under frosted translucent glass cards: slow, translucent, expensive. | mg-styles-15 |
| [hanazi](hanazi.md) | Variety-show kinetic captions (hanazi) | Emotional decorative captions with multi-layer outlines, elastic pops and hand-drawn burst, sweat and sparkle marks. | mg-styles-15 |
| [paperclip](paperclip.md) | Bold-outline sticker explainer | Photo cut-outs turned stickers with thick white outlines, flat icons and exact charts on one giant canvas with a continuous camera. | mg-styles-15 |
| [pixel](pixel.md) | Pixel art / 8-bit | Big chunky pixels, a limited palette, low-fps sprite animation and stepped timing, integer-scaled with nearest neighbour. | mg-styles-15 |
| [hud](hud.md) | Cyberpunk HUD / FUI | Film-grade fictional UI: cyan wireframe, rotating rings, radar sweep, rolling data, lock-on brackets that flip to alert orange. | mg-styles-15 |
| [riso](riso.md) | Risograph print | A three-ink print on cream paper: screens at their own angles, overprints instead of mixed colours, plates off register, ink dropouts, on 2s. | animate |
| [sketchbook](sketchbook.md) | Sketchbook | Graphite and one accent colour on a warm page: pencilled, inked, scribbled, hand lettering narrates, the page is the world. | animate |
| [manim-math](manim-math.md) | Manim-style math | Coloured math on a near-black stage: written-on serif type, drawn curves, transforming equations, a tracker with a live readout. | animate |
| [halftone-collage](halftone-collage.md) | Halftone paper collage | One flat, bold colour field and three to six black-and-white halftone cut-outs with cream keylines and soft paper shadows, assembled from empty. | gbro |

A fourth source, `pyang5166/gbro-collage-broll` and `gbro-collage-info` (MIT; `source: "gbro"`), adds the halftone paper collage; `scripts/art.mjs treat --halftone-collage` makes its picture treatment.

A third source, `cth9191/animate` (MIT, `third_party/animate/`), adds the three print and drawing looks above. Its files use `source: "animate"` and the same nine sections.

## Prompt bank (not a style slug)

`prompts/opuscar-prompts.md` digests the 98 style prompts of the OPUSCAR 98 styleboard (lemo-opuscar, MIT): one reusable recipe per medium (a blend of named traits, a palette with hexes, texture and motion habits, one signature shot, an Avoid list), with film names, characters, years and credit lines stripped. Read it for the SHAPE of a bespoke look and its Avoid lists; it is not in the library index and its entries are not valid `blend.style_refs` slugs. Find one: `grep -i "<words>" library/styles/prompts/opuscar-prompts.md`.
