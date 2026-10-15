---
id: "manim-math"
name: "Manim-style math"
kind: "style-reference"
source: "animate"
source_url: "https://github.com/cth9191/animate/tree/main/plugins/animate/skills/animate/styles/math"
license: "MIT"
poster: "posters/manim-math.jpg"
one_line: "Coloured math on a near-black stage: serif type that is written on, curves that are drawn, equations that transform, a tracker with a live readout, smooth on 1s."
---
# Manim-style math

Coloured math on a near-black stage: serif type that is written on, curves that are drawn, equations that transform, a tracker with a live readout, smooth on 1s.

A reference for the design desk to blend one or two traits from, never a preset that replaces the film's bespoke system. Never cite it as the whole look; the signature features below are what a blend must keep if it names this style. It promises rigour, so it works only when the math on screen is true.

## Essence, and what it is not

An idea with a picture: a formula, a proof, a function, a rate, a geometric fact. One quiet stage, clean vector strokes, no texture, no grain, no wobble; colour does the explaining, motion explains too (drawing a side defines it, a square appearing is "squaring", a Transform is a substitution, a sweep is "for every angle"). The camera stays still, or makes one slow eased push.

Not: an equation poster with decorative motion, a whiteboard, code-on-screen, or any look that pops formulas in or types them like a terminal. Not matched: the hero character, the kit and the demo's specific proof.

## Materials

- Stage `#0e0e10`, flat; never pure black. Strokes are vector, fills are the stroke colour at 14 to 35% alpha. Number planes are blue lines at 14 to 42% alpha. Captions sit on a black rectangle at 75% alpha.
- Building order follows the argument: sides, then squares, then cells, then the count, then the sum; axes before ticks, ticks before labels.

## Colour logic

- Each quantity gets ONE colour and keeps it everywhere: in the formula, on the figure, in labels, in readouts and in captions. A term that changes identity (a to cos theta) keeps its colour through the transform.
- The source's constants: red `#fc6255`, green `#83c167`, yellow `#f7d96f` (often the result or the whole), blue `#58c4dd` (often the angle or parameter), teal `#5cd0b3`, gold `#f0ac5f`, purple `#9a72ac`, maroon `#c55f73`, pink `#d147bd`, orange `#ff862f`; white for operators; greys `#bbb` / `#888` / `#444` for axes, labels and guides. Pure `#ffff00` only for a flash.
- Write the colour code down first (quantity to colour) before building anything.

## Type

- A serif for all math and prose (Cambria first, because it has a real italic, then a Latin Modern or STIX stack); mono only for code. TeX conventions: variables italic, digits, function names and units upright, binary operators spaced, superscripts at 0.6 size, a true minus sign.
- At 1080 x 1920: main formula 90 to 110 px, a second line 60 to 70, figure labels 40 to 52, tick labels 28 to 32, captions about 50, nothing under 28. No label crosses a stroke or another label; labels sit on the side of a segment away from the figure and fade when the segment gets short.

## Motion

- On 1s, eased with the sigmoid "smooth" (inflection about 10) or there-and-back for an indicate; never linear except a value a tracker drives.
- Run times about a second: write 0.7 to 1.0 s, draw a curve 0.5 to 1.0, transform 0.8 to 1.0, fade in 0.3 to 0.5, flash 0.4 to 0.5. Lag ratio about 1.2 to 1.4 across the glyphs of a write, 0.5 across sibling objects.
- Write = the outline draws over each glyph's first half and the fill fades in over its second, lagged left to right. Transform = match terms by id: the ones that stay glide, the ones that change cross-fade while they move.
- Trackers: a value moves smoothly; the dot, drop lines and readouts are recomputed from it every frame. Every readout comes from the same tracker as the picture, rounded so the displayed arithmetic is exact (show sin squared as 1 minus the rounded cos squared).
- At 120 BPM on 60 fps an 8th is exactly 15 frames; stay on 8ths.

## Camera grammar

- Locked. At most one slow, eased push. Formula at the top, figure in the middle, readouts low left, a hero low right if any, caption low centre; everything inside the safe area.

## Signature features

1. A near-black stage with serif math, each quantity in one consistent colour across formula, figure, labels, readouts and captions.
2. Formulas are written on glyph by glyph, never popped or typed; equations transform by matching terms.
3. Axes, curves and shapes are drawn on (outline first, fill after), in the order of the argument.
4. A tracker moves a dot while a live readout is computed from the same value, and the displayed numbers add up exactly.
5. Smooth on 1s, no grain, no wobble, no drop shadow, a still camera.

## When to use

- Maths and science explainers, a rate or a proof, any product whose claim is a calculation that can be shown honestly (pricing logic, latency, compound growth) when the figures are true.

Avoid when: warm lifestyle or brand films, anything where the numbers are not real, short social loops that need texture and personality.

## Source and licence

cth9191/animate, `styles/math/STYLE.md` (MIT, copyright 2026 cth9191). Summarised in our words, the colour constants being manim's; see https://github.com/cth9191/animate/tree/main/plugins/animate/skills/animate/styles/math and `third_party/animate/`.
