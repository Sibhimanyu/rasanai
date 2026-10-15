---
id: "dataviz"
name: "Data storytelling"
kind: "style-reference"
source: "lemo-opuscar"
source_url: "https://github.com/lemomo-ai/lemo-opuscar/tree/main/styles/dataviz"
license: "MIT"
poster: "posters/dataviz.jpg"
one_line: "A chart that tells a story: real data drawn mark by mark on cream paper by a red-blue pencil with pinned handwritten notes."
---
# Data storytelling

A chart that tells a story: real data drawn mark by mark on cream paper by a red-blue pencil with pinned handwritten notes.

A reference for the design desk to blend one or two traits from, never a preset that replaces the film's bespoke system. Never cite it as the whole look; the signature features below are what a blend must keep if it names this style.

## Essence, and what it is not

The chart is the film. Every mark is a real number and every movement is a meaningful chart operation (a mark lands, an axis grows, the scale changes, a series morphs, a note is pinned). Three layers make it a story: a human scale (handwritten notes), a performer (a physical pencil drawing each mark) and sonification (each mark a pitch).

Not: a dashboard, a keynote with charts, or decoration; never altered numbers.

## Materials

- Warm cream paper with fixed-seed fibre noise and a faint dot grid in world space; dark warm ink for axes and series, pale warm grey for grid and zero line, a mono for ticks.
- Marks with a thin ink ring so pale values stay visible; a short pop and ripple on landing, ripples suppressed when marks arrive faster than 0.1 s.
- Pencil handwriting with graphite grain; leaders that end in an un-closed ring; a real hex pencil, blue half and red half, only its tip in frame; notes pinned in data space so rescales keep layout.

## Colour logic

- Colour encodes one thing, the value: a diverging ramp centred on a meaningful reference mean, or one sequential ramp; everything else is ink on cream.
- Honesty beats drama: pale values stay pale, never stretch a ramp to exaggerate.
- Two pencil leads carry meaning: blue for memory and human notes, red for records and warnings; a lead change marks a turn.

## Type

- Caption is the figure caption: a text serif, ink, left-aligned with the chart, two lines at most, hairline rule above and a small mono kicker for the range drawn so far.
- Chart headline set in world space above the plot; notes in a handwriting face.

## Motion

- The rhythm of the data is the rhythm of the film; accelerate by dividing the beat, not by changing tempo.
- Pencil acting: lift, tap with shadow meeting the tip, tiny rebound; it can flinch, hesitate or exit.
- Rescales read as ratchet clicks; morphs are staggered sweeps; no fades to blank, every transition is a chart operation.

## Camera grammar

- A 2D camera over one sheet; one continuous take, hard cuts rare. Extreme close-up on one mark, full view first then dive, pull-back as axes grow, tracking the pencil with the newest mark at about 60 percent width, a Dutch angle creeping in for escalation, a punch-in and shake for a surprise, locked-off for a morph, lateral pan across notes for recollection.
- When the real axis scrolls off-screen, pin its tick labels to a frozen strip at the frame edge.

## Signature features

Checkable traits; the frame juror and the critic look for each by name when a system claims this style.

1. Every mark corresponds to a real number from a cited dataset; nothing is invented.
2. A visible pencil draws the marks and flinches or hesitates at surprises.
3. Colour encodes value only, on a diverging or sequential ramp centred on a stated mean.
4. Handwritten notes are pinned to marks in data space.
5. Transitions are chart operations (axis growth, rescale, morph), never fades.

## When to use

- Reports, explainers and launches whose proof is a number or a trend (growth, benchmarks, before/after), research and policy films.
- A single chart beat inside a longer film: borrow the pinned note and the honest ramp.

Avoid when: Stories with no real data, glossy consumer-tech launches, brands that need a screen-native look.

## Source and licence

lemomo-ai/lemo-opuscar, `styles/dataviz/STYLE.md` (MIT, copyright 2026 LemoLab). Summarised in our words; the full guide with engine notes and variation space is at https://github.com/lemomo-ai/lemo-opuscar/tree/main/styles/dataviz.
