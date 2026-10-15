---
id: "close-c5-mosaic-pixel-resolve"
name: "C5 Mosaic / pixel dissolve into the mark"
space: "2d"
family: "closes"
references: ["motionmaxxing close catalogue: measured from 53 finished endings of launch and product films (Apache-2.0), numbers re-stated in our words"]
timing: {"frame_rate": "30 fps (frame counts as measured; the source clips ran 24 to 60 fps and are converted)", "holds_ms": [700, 1400], "note": "measured resolved-hold range; the gate for any film is 0.6 to 1.4 s unless the close is a motion that ends mid-move (hold 0). medium, building energy"}
eases: {"key": "cruise, accelExit (RasanMotion measured eases)", "notes": "an arrival decelerates; every close is one beat, usually smaller than the climax before it"}
camera: {"lens_mm": [50, 85], "moves": ["locked-off 2D; the scale of the mark is the move"], "rules": ["the mark is the last thing; at most one tagline", "a hard cut into the close, no crossfade"]}
recipe_2d: "A canvas or SVG grid with a per-cell hard visibility step driven by a coverage table (RasanUI.step or a drive function of time); the mark as a mask over the dot grid, density ramping 0 -> 1 in 5 steps."
recipe_3d: "Rasan3D: keep the mark as DOM above the 3D layer (crisp, per 3d.md); the scale track and holds above apply to the 2D layer; the 3D hero may do the last camera move under it."
pitfalls: ["A field of squares dissolving into the mark is the same default as C2 in different clothes", "Use it only when the texture really is the brand's and the wipe is built from the scene's own geometry", "a resolved hold over 1.4 s (the CTA beat stays at or under 25% of the film)", "a static logo with nothing alive in the hold"]
instruct: {"all": "Give the entry scale track with frame counts, the hold in seconds, what stays alive during it, and what precedes it. State that the mark never scales from zero.", "claude": "Claude tends to fade the logo up with a bounce plus a tagline and hold it 3 to 5 s. Ask for the scale track by frame and the hold by seconds.", "gpt": "GPT models tend to write a gradient glow and a 'Get started' pill. Forbid both and give the numbers."}
verified: {"sources_fetched": 1, "non_wikipedia": 1, "colours": "n/a", "colour_images": [], "grid": "n/a", "timings": "measured", "recipes": "proposed", "edited": "2026-10-15"}
sources: ["https://github.com/Tejashmakwana/motionmaxxing/blob/main/references/close.md"]
---
## What it is

C5 Mosaic / pixel dissolve into the mark. When to use it: Technical, digital or data brands whose own texture is pixels or a lattice; a field that must become a logo or a screen.

Brand personalities it suits: technical, data, infrastructure, pixel. Avoid: gradient glows, fades, an opacity dissolve. Seen in: three measured closes.

## The defining traits (numbers)

- Entry: Real hard-edged cells (1.5 to 2.5% of the width) with stepped coverage, never opacity: 90% -> 60% -> 35% -> 10% -> 0 over 0.33 s, opening from the bottom; or a 12 -> 20 cell grid retreating to the corners in 3 steps over 0.27 s. The mark inherits the scene's texture: a flame fills inside its silhouette with sparse 2 to 3 px dots on a 6 px grid, then dense dots, then solid rising from the base (58% at 0.23 s, solid at 0.56 s); the wordmark resolves with a solid front sweeping left to right through 5 px squares and tiny crosses, the first three letters at 0.30 s, whole by 0.60 s.
- Track: Preceding wipe built from the scene's own geometry: a stair-notched wave flooding left from x .73 while the world jerks left by accelerating offsets (-.01, -.04, -.10, -.14, -.29, -.41, -.63, -.86 W, one repeated frame).
- Alive during the hold: Alive hold: the flame tip sways +-1% W in an irregular 1 s rhythm on 2-frame holds. The measured 3.66 s alive hold is a single-clip outlier; in a film the end hold stays at or under 1.4 s.
- Before it: The scene's own texture (pixels, a lattice, a repeated wave shape), never 'a transition was needed'.
- Hold: 0.7 to 1.4 s resolved. Universal rules for every close: resolved hold 0.6 to 1.4 s (a mark registers in about 0.5 s, a name in about 1 s); something stays alive for the whole hold: a creep, a sweep, a sway, a flicker (a static logo reads as a slide); the mark never scales up from zero and never fades up: it arrives oversized (1.5 to 3.75x) or in discrete steps and decelerates in.

## How to build it

A canvas or SVG grid with a per-cell hard visibility step driven by a coverage table (RasanUI.step or a drive function of time); the mark as a mask over the dot grid, density ramping 0 -> 1 in 5 steps.

Frames are at 30 fps; at another rate, keep the SECONDS and recompute the frame counts. Use the film's own ground: an inverted dark or white ground on the cut is an option, not a recipe (follow the brand's own surface).

## What makes a cheap imitation

- A field of squares dissolving into the mark is the same default as C2 in different clothes
- Use it only when the texture really is the brand's and the wipe is built from the scene's own geometry
- A fade-out, a glow on every layer, a tagline plus a URL plus a button, or a hold of 3 to 5 s with only a slow contraction (it reads as dead air).

## Sources

- motionmaxxing `references/close.md` (Apache-2.0, Tejas Makwana; credit row in `third_party/motionmaxxing/README.md`): numbers re-stated in our words.
