---
id: "ascii-crt"
name: "ASCII / CRT terminal"
kind: "style-reference"
source: "lemo-opuscar"
source_url: "https://github.com/lemomo-ai/lemo-opuscar/tree/main/styles/ascii-crt"
license: "MIT"
poster: "posters/ascii-crt.jpg"
one_line: "Everything is a real character on a monospace grid, lit by the phosphor of an old monochrome CRT."
---
# ASCII / CRT terminal

Everything is a real character on a monospace grid, lit by the phosphor of an old monochrome CRT.

A reference for the design desk to blend one or two traits from, never a preset that replaces the film's bespoke system. Never cite it as the whole look; the signature features below are what a blend must keep if it names this style.

## Essence, and what it is not

A single monochrome terminal screen (P3 amber or P1 green) on curved dark glass with scanlines. Every image, including titles, landscapes, faces and subtitles, is made of real glyphs on a character grid, chosen by ink density. The camera is the screen itself and moves only by changing the grid's font size. Cold, patient, machine-calm, with a blinking cursor as suspense and one warm surprise.

Not: an image with an ASCII filter, hacker-movie green rain, a pixel-art game, or a sci-fi HUD.

## Materials

- One bitmap-style monospace font on a 1:2 cell with a glyph atlas for crisp continuous zoom; column counts per shot (title about 20, terminal 80, picture 200+).
- Density ramp from measured glyph ink coverage with ordered dither; negative space makes ASCII art readable; recognisable subjects are silhouettes with dark as sparse dim glyphs and bright as dense bold.
- CRT post: phosphor colour ramp, bloom, scanlines narrower on bright areas, slight barrel curvature, about 1 percent flicker, no RGB grille; analytic afterglow decay so frames stay deterministic.

## Colour logic

- One phosphor carries everything in its own brightness ramp; no decorative second hue.
- At most one soft second colour, for one emotional object, switched on once on a downbeat.
- Brightness (dim, normal, bold, inverse video) is the only other tool.

## Type

- Subtitles are terminal output in a reserved LOG strip at the bottom, typed word by word in sync with the voice.
- Titles are typed with key clicks as a filename, command or header; on-screen story text counts as picture.

## Motion

- Characters never move off-grid except in a declared transformation; typing, scrolling and counters jump cell to cell.
- Only grid scale, CRT physics and transformation particles move continuously; typing speed is performance (machine even and fast, human uneven).

## Camera grammar

- Static 80-column terminal, push in as cells grow, pull out, push into a single glyph to reveal inner text, scroll, clear-screen hard redraw as a cut, text becomes image as the grid shrinks, power on or off, pull back off the glass into a drawn room.
- Transitions happen on the screen (clear, redraw, scroll, power), never a crossfade.

## Signature features

Checkable traits; the frame juror and the critic look for each by name when a system claims this style.

1. Every visible thing is a real glyph on a character grid, with no raster images.
2. One phosphor colour with CRT scanlines, curvature, bloom and afterglow.
3. Subtitles are a typed LOG strip in uppercase.
4. The camera is grid-scale changes (push in and pull out by font size).
5. At most one second colour, switched on once.

## When to use

- Developer tools, CLIs, AI-agent and infrastructure stories; cold-patient moods, logs, changelogs and 'a machine wakes' beats.
- A short terminal sequence inside a longer film.

Avoid when: Consumer, colourful, warm or people-first brands; anything needing photographs or colour-coded UI.

## Source and licence

lemomo-ai/lemo-opuscar, `styles/ascii-crt/STYLE.md` (MIT, copyright 2026 LemoLab). Summarised in our words; the full guide with engine notes and variation space is at https://github.com/lemomo-ai/lemo-opuscar/tree/main/styles/ascii-crt.
