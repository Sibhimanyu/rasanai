# Style worlds: choosing one

A **style world** is the picture language of a film: material, type attitude, motion grammar, shader finish, imagery, sound. The atlas in `library/styles/atlas/` is the menu: 34 worlds, one JSON each (`<id>.json`) plus `index.json`. This replaces "dark keynote, glass cards, clean sans" as the unspoken default: that look is world 30 and should be one choice among 34, usually paired with another world, not the whole film.

Look up an entry: `node scripts/design.mjs style-world --id riso-print`. The menu: `style-world --list`. A ranked pick for a product: `node scripts/design.mjs style-worlds --product "<what it is>" --tone "<how it should feel>" [--brand DESIGN.md | --run <run>] [--count 3]`. The ranking is a first cut from the entries' `fits` and `avoid` lists; you still judge it against the story and the `when_not` line.

## How to choose

1. **Start from the product truth and the tone, not from a style.** Write one line for each: what the product does and what the film should make people feel. The style world carries the feeling; the product truth stays unmistakable.
2. **Read `fits` and `avoid` on both axes.** A world must fit the product (what it is) and the tone (how it feels). Warm clay on a security tool, or glitch on a bank, fails one axis and reads as a mistake, not a choice.
3. **Ask what the world MEANS here.** Pixel art means levels and unlocks. A blueprint means "engineered". Particles mean nothing unless the story says what they are. If you cannot say what the world means for this product in one sentence, drop it.
4. **Check feasibility.** `build.engine` says B (a runtime or recipe exists), R (reference only, the builder hand-codes it) or G (a gap). A hard build is a budget question, not a veto, but say it. `build.medium_runtime` and `stage3d_recipe` name what exists. Papercraft and clay are digital unless Codex plates are used: say "digital clay", never claim stop-motion.
5. **Check the proof beat.** If the film needs the real UI as proof, the world must let a real capture sit INSIDE it as a screen plate (device, window, billboard, game screen). Worlds marked "cannot carry readable screens" (clay, sketchbook, stop-motion, rotoscope) show the UI on a prop, never redrawn in the style. When the Studio app is shown, it is the current dark sidebar UI with the Describe...Final dot stepper (`docs/brand/studio-ui/`), never the retired light UI.
6. **Blend at most two.** One world for the picture, optionally one for the finish (for example pixel world plus CRT grain). Three worlds in one film is a collage with no grammar.
7. **Pick the sound with the world.** Each entry carries a sound `mode` (vo-kinetic, instrumental-arc, sfx-led, song-lyric) and a palette tied to the material. Sound is part of the world, not an afterthought.

## Three looks, three worlds

The three looks the user picks from must be three **different worlds**, not three tints of one. They should differ in material, in finish and in sound mode. `style-worlds --count 3` penalises picks that share a sound mode, a first shader pass or a medium runtime.

**Branded launches keep the lock.** Brand colour, brand type and the logo stay in all three looks. What varies is the world: for example pixel game, collage, editorial. Each entry's `brand_lock` says how the brand colour, type and logo map into that world (the brand colour takes a named role, such as ink A in riso or the signal colour of a game palette; the brand face always sets the real claim line). The design desk writes `style_world: "<atlas id>"` in `design/<label>/blend.json`; `design.mjs look-payload` shows it on each look, and on a brand-locked run `check-systems` and `look-payload` refuse two looks that share a world.

## The menu

| # | id | Fits (first three) | NOT for | Sound mode | Finish (rasan-fx) |
|---|----|--------------------|---------|-----------|-------------------|
| 1 | `pixel-world` | dev tools, games, creative tools | finance trust, healthcare, luxury; avoid if the film needs to look like the real app… | sfx-led | pixelate, crt |
| 2 | `pixel-companion` | dev tools, agents, automations | if the mascot is not the product's agent; no random sprite quota | sfx-led | pixelate |
| 3 | `voxel-diorama` | infra, cloud, build / compose products | precise data stories | instrumental-arc | posterise, grain |
| 4 | `clay` | friendly consumer, kids, food | dense UI; claymation can't carry readable screens, so show the UI on a clay "device" | sfx-led | grain |
| 5 | `paper-cut` | storytelling, education, nature | fast-clicky B2B dashboards | instrumental-arc | grain |
| 6 | `collage-newsprint` | culture, media, community | precise enterprise | sfx-led | halftone, grain |
| 7 | `riso-print` | indie, design, creative | when colours must be exact brand (limit to 3 inks anyway) | instrumental-arc | riso, grain |
| 8 | `kinetic-type-only` | manifestos, rebrands, strong copy | when the product demo is the point, or weak copy | vo-kinetic | grain |
| 9 | `swiss-grid` | fintech, dev infra, B2B | generic execution with no bold idea | vo-kinetic | - |
| 10 | `brutalist` | indie dev tools, anti-corporate challengers, creative studios | health/trust, premium | sfx-led | dither |
| 11 | `isometric-diorama` | infra, logistics, finance flow | emotion-led brand stories | instrumental-arc | grain |
| 12 | `soft-3d` | consumer apps, hardware, delightful brands | Overused in 2020-22; avoid default pastel blobs without a concept | instrumental-arc | aberration, grain |
| 13 | `liquid-chrome` | AI, creative, music | slow tempo (reads as screensaver) | instrumental-arc | posterise, aberration |
| 14 | `glitch-datamosh` | AI, security, music | Overused as "tech" shorthand; avoid for reliability brands unless the glitch is the story | sfx-led | glitch, aberration, crt, grain |
| 15 | `dot-matrix-led` | hardware, transit, data | long reading text | sfx-led | ledmatrix, aberration |
| 16 | `ascii-terminal` | dev tools, CLIs, agents | consumer lifestyle or anything non-technical | sfx-led | posterise, crt, grain |
| 17 | `line-art` | concept stories, wellness, education | data-heavy demos | instrumental-arc | grain |
| 18 | `sketchbook` | human-centred products, creative tools, education | anything needing exact UI proof | instrumental-arc | grain |
| 19 | `rotoscope` | stories with people, music, health | Needs footage, which RasanAI doesn't generate; avoid if no footage | instrumental-arc | posterise, grain |
| 20 | `toon-3d` | games, creative apps, youth brands | anything that must not look cheap without heavy craft | sfx-led | posterise |
| 21 | `y2k-aero` | Gen-Z consumer, music, fashion | enterprise | instrumental-arc | aberration, posterise, grain |
| 22 | `retro-os` | dev tools, creative tools, indie | if it signals "old/obsolete" | sfx-led | dither, crt |
| 23 | `blueprint` | hardware, infra, engineering tools | emotional consumer stories | sfx-led | posterise, grain |
| 24 | `hud-fui` | AI, agents, security | warm consumer tones | sfx-led | crt, aberration, grain |
| 25 | `particle-field` | AI, data, music | particles that mean nothing (AI wallpaper) | instrumental-arc | aberration, grain |
| 26 | `cinematic-ai-worlds` | AI image/video tools, travel, ambitious consumer brands | claims it can't prove; AI worlds feel generic fast | instrumental-arc | grain, aberration, posterise |
| 27 | `photo-collage-surreal` | creative AI, culture, music | where authenticity of real people matters | sfx-led | halftone, posterise |
| 28 | `editorial-magazine` | media, writing tools, finance with a point of view | fast, noisy products | vo-kinetic | halftone, grain |
| 29 | `minimal-luxury` | premium hardware, high-end tools, wellness | premium hardware, high-end tools, wellness; avoid when the audience expects energy | instrumental-arc | grain |
| 30 | `dark-keynote` | SaaS, dev tools with UI proof | being the only look of the film (it is the default that makes films alike) | vo-kinetic | grain |
| 31 | `bauhaus` | design tools, education, systems products | anything sensory/organic | instrumental-arc | grain |
| 32 | `sticker-maximal` | consumer, social, creator tools | serious B2B | sfx-led | - |
| 33 | `data-story` | analytics, fintech, research | when you have no real data (never fabricate) | vo-kinetic | - |
| 34 | `stop-motion-tabletop` | hardware, creative tools, food | flat lighting that exposes the fake | sfx-led | grain |

Every entry's full `when_not` list, type and colour rules, motion grammar hints, Codex recipe (prompt template and image count), build recipe and examples are in its JSON. Example links marked `unverified-from-memory` were not checked: confirm the URL before citing it in a brief. `surfaced-by-search-not-refetched` links came from the research search and have not been re-opened.

## When NOT to use a world (the short rules)

- **Dark keynote (30):** not as the whole film. It is the default that makes films look alike. Use it only when the brief needs UI proof, paired with one other world.
- **Swiss grid (9), minimal luxury (29), editorial (28):** not when the product has no point of view or the copy is weak; they expose it. Swiss executed generically looks like every B2B film, so it needs one bold idea.
- **Glitch (14), HUD (24), ASCII/terminal (16), blueprint (23):** not for reassurance brands (health, finance trust, family), and not warm consumer tones.
- **Pixel (1), retro OS (22), Y2K (21):** not when the film must look like the real product throughout (use a pixel mascot over the real UI instead, world 2), and not where "old" reads as "obsolete".
- **Clay (4), paper (5), sketchbook (18), stop-motion (34):** not for dense UI proof or data stories; and never present digital paper or clay as shot stop-motion.
- **Particles (25), liquid chrome (13), soft 3D (12):** not without a concept for what the form means; they are the "AI wallpaper" and "pastel blob" tells. Liquid on a slow tempo reads as a screensaver.
- **Cinematic AI worlds (26):** not for claims the film cannot prove, and not without the depth and parallax pipeline; say when AI imagery must be disclosed.
- **Rotoscope (19):** not without real footage.
- **Data story (33):** not without real data. Never fabricate a chart.
- **Kinetic type only (8):** not when the demo is the point or the copy is weak.

## The shader finish: runtime/rasan-fx.js

Worlds that list `effects` are finished with the shader pack (glitch, crt, halftone, ledmatrix, riso, dither, pixelate, aberration, grain, posterise/gradient-map). It is seek-safe and deterministic, driven by timeline time, and works with GSAP: `fx.fromTo(tl, 0, "glitch", {amount: 0}, {amount: 1, duration: 0.4}); fx.drive(tl);`. The constraint to remember: WebGL cannot read live DOM, so the source is an image, a canvas the scene draws into, or a one-time DOM snapshot (static). Details are in the header comment of `runtime/rasan-fx.js`. Presets (`RasanFX.preset("vhs")`): vhs, arcade, gameboy, riso-print, newsprint, cmyk, led-board, dither-1bit, datamosh, gradient-map, crt-terminal.

## The art block (palette, type, finish, image direction)

Every atlas file carries `art` (`format: style-art@1`): 3 named `palettes` {bg, bg2, ink, accent, accent2, words} with `brand_lock.slots` (which slots take the brand colour, which stay style-fixed), `type.pairings` (display + text, OFL Google Fonts with `google` links, case, scale in cqw, tracking), `finish` (rasan-fx passes with params, plus `css` kinds that story boards and style frames draw cheaply), `composition` (grid, safe area, fill, where the product UI sits), `codex` (prompt template with {subject} {action} {setting}, camera, lighting, material, palette-locked colour rule, texture, negatives, aspect, consistency hooks, sprite-sheet rules, 2 filled examples), and `do` / `dont` / `cheap_ways` (the 3 usual ways the style goes cheap).

When a concept gives no `style`, `resolveStyle` (lib/concept-schema.mjs) fills palette and font from the art block: `style.palette_id` / `style.pairing_id` pick a variant, the first is the default, and a brand colour (`brand.colour`) fills the slots marked `brand`. Boards and style frames load the fonts and draw the finish. Preview of every style: `node scripts/style-frames.mjs atlas-preview` -> `library/styles/atlas/preview/<id>.png` and `all.png` (the contact sheet).
