---
id: "glass-product"
name: "Glass product render"
kind: "style-reference"
source: "lemo-opuscar"
source_url: "https://github.com/lemomo-ai/lemo-opuscar/tree/main/styles/glass-product"
license: "MIT"
poster: "posters/glass-product.jpg"
one_line: "A fictional glass-and-metal hero object in a black studio, lit by strip lights, with light travelling inside it."
---
# Glass product render

A fictional glass-and-metal hero object in a black studio, lit by strip lights, with light travelling inside it.

A reference for the design desk to blend one or two traits from, never a preset that replaces the film's bespoke system. Never cite it as the whole look; the signature features below are what a blend must keep if it names this style.

## Essence, and what it is not

One hero object of glass, metal and light floating in an infinite black studio. Long strips behind and beside it turn clear glass into a thin white outline with rainbow edges and show the internals like a display case. Slow, exact, every cut and sweep on a beat. Material and light are the subject.

Not: a white-cyclorama catalogue shot, a wireframe HUD, a keynote slide, or a copy of a real product silhouette.

## Materials

- Studio built from emissive strip planes (tall side strips, a far horizon strip, a soft top box, a sweep strip behind the camera), not a photo HDRI: the strips are real geometry so highlights, refraction and dispersion move physically.
- Clear glass with high transmission, near-zero roughness, IOR about 1.5, dispersion on; frosted glass needs something bright behind or inside it or it reads as grey plastic.
- Metals (satin, chrome, brushed) give the transparency something to be read against; anything inside transmissive glass is opaque.
- Black gloss floor with a blurred mirror, radial fade and procedural caustics; no horizon line; neutral tone mapping, no grain.

## Colour logic

- The world is neutral: black, greys, strip-reflection white, the metals' own tints.
- One accent family reserved for LIGHT (emission, caustic rings, a dispersion line on UI), optionally drifting between two neighbouring hues; chosen from what the product does, never from a brand.
- Dispersion rainbows only at thick glass edges and in caustics, never as a gradient on surfaces or type.

## Type

- Ultra-thin (weight 200) very wide-tracked grotesk for titles, large and centred in the upper third, with a diagonal glint synced to the sweep light.
- Subtitles as a slab of frosted glass filled with the live blurred frame, light weight, near-white.
- Product name and slogan are title cards, not subtitle lines.

## Motion

- Everything eased and on ones; the camera always drifts (orbit or push-in), never locked and never handheld.
- Exploded view: parts spread along the axis (about 2x product size) with a small tilt and spin, hover, then a very short ease-in snap shut on a downbeat.
- Light pulses and sweeps are events on the beat grid, never free animation; silence before a release.

## Camera grammar

- Sweep over a dark object, slow high 3/4 orbit, macro rack focus from shell to inner part, exploded view with its axis about 40 degrees to the lens, straight-on front for a declaration, top-down on the floor for an effect leaving the object, low orbit for weight, slow pull-back into negative space for type.
- Cuts on beats or a sweep passing through black; never dissolves or wipes.

## Signature features

Checkable traits; the frame juror and the critic look for each by name when a system claims this style.

1. Strip-light sweeps draw the object's contour out of black; the object is never lit by a flat even key.
2. Glass edges carry visible dispersion and the floor carries caustics that react to events.
3. Parts explode along an axis and snap shut on a downbeat.
4. Exactly one accent colour family, used only as emitted light; everything else neutral.
5. Titles are ultra-thin, wide-tracked and centred; subtitles are frosted glass.
6. The camera is never still.

## When to use

- Hardware and consumer-tech launches, beauty, packaging, anything with an invisible mechanism that can be made visible as light inside glass.
- Software launches that want one tangible hero object (an app icon as a glass object) in 3D scenes only.

Avoid when: Flat 2D UI-led product films, brand systems that forbid depth and finish, tiny budgets (it needs real 3D and a per-frame environment bake).

## Source and licence

lemomo-ai/lemo-opuscar, `styles/glass-product/STYLE.md` (MIT, copyright 2026 LemoLab). Summarised in our words; the full guide with engine notes and variation space is at https://github.com/lemomo-ai/lemo-opuscar/tree/main/styles/glass-product.
