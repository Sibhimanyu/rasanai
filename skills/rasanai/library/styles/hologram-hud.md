---
id: "hologram-hud"
name: "Sci-fi hologram HUD"
kind: "style-reference"
source: "lemo-opuscar"
source_url: "https://github.com/lemomo-ai/lemo-opuscar/tree/main/styles/hologram-hud"
license: "MIT"
poster: "posters/hologram-hud.jpg"
one_line: "An object scanned into a glowing wireframe; target boxes lock onto its parts and numbers roll from garbage glyphs into the real value."
---
# Sci-fi hologram HUD

An object scanned into a glowing wireframe; target boxes lock onto its parts and numbers roll from garbage glyphs into the real value.

A reference for the design desk to blend one or two traits from, never a preset that replaces the film's bespoke system. Never cite it as the whole look; the signature features below are what a blend must keep if it names this style.

## Essence, and what it is not

The subject is always a line wireframe made of light above a round projector pad on a near-black stage, never a rendered object. Everything reads as scanned data: a scan plane grows the model, parts pull apart along assembly axes, numbers are computed on screen. Three depth layers are always present: a background dot grid, the subject, and a foreground HUD.

Not: a type-led keynote, a drafting sheet, or a product render. The subject stays a wireframe.

## Materials

- Near-black stage tinted by the hue, a dot grid, a strong vignette; a perspective projector pad with concentric rings, ticks and rays.
- Additive wireframe strokes with depth fog (near bright, far about 25 percent) and two glow passes; hot near-white edges only for what matters now; real CAD topology, every part physically connected.
- Optional solid hologram: Fresnel times a scrolling interlace; text always sits on its own dark plate with corner ticks, never over the wireframe.

## Colour logic

- One cold hue plus one warm accent (mint/orange, violet/lime, ice-blue/red) chosen from the subject.
- The accent is spent on locked values only: a number turns accent at the frame it becomes true; white is heat (active edges, one-frame flashes).

## Type

- A condensed technical all-caps sans (light for big numbers and the name with wide tracking, medium for labels) plus a mono for micro data; numbers are monospaced and the decimal point a small square.
- Subtitles are HUD: a dark plate with corner brackets and voiceprint bars; the title rolls in like a value.

## Motion

- Everything on ones; glyph scrambling steps every frame; target lock snaps from oversized and rotated to fit in about 0.2 s with a 3-frame white flash on the downbeat.
- Explode along each piece's own assembly axis; leader lines in about 0.5 s; values lock right to left; finished values dock into a side rail; real motion blur only inside whips; no cuts or fades inside the scene.

## Camera grammar

- Orbit camera: high 3/4 slow orbit craning down, top-down plan, eye-level profile, push-in then drift, whip following the target box, orbit around a part's own axis, lateral dolly along a long part, pull back plus loupe (frame in frame), turntable 360.
- The subject is at least a third of frame height at every key moment; cards on one side, chip rail on the other.

## Signature features

Checkable traits; the frame juror and the critic look for each by name when a system claims this style.

1. The subject is a light-line wireframe over a projector pad, never a solid render.
2. Target boxes snap on and numbers roll from garbage glyphs into the real value, turning the accent colour as they lock.
3. Three depth layers: a dot grid, the subject, and a parallax HUD with corner brackets.
4. Parts explode along their own assembly axes.
5. Every text block sits on its own dark plate.

## When to use

- Hardware and tech teardowns, spec walkthroughs, AI and sensor products, anything with named parts and measurable values.
- A scan or analysis sequence inside a longer film.

Avoid when: Warm, human or editorial brands; software UI stories; stories with no parts or numbers.

## Source and licence

lemomo-ai/lemo-opuscar, `styles/hologram-hud/STYLE.md` (MIT, copyright 2026 LemoLab). Summarised in our words; the full guide with engine notes and variation space is at https://github.com/lemomo-ai/lemo-opuscar/tree/main/styles/hologram-hud.
