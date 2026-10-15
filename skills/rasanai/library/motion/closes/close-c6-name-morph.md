---
id: "close-c6-name-morph"
name: "C6 Logo morph from a previous identity"
space: "2d"
family: "closes"
references: ["motionmaxxing close catalogue: measured from 53 finished endings of launch and product films (Apache-2.0), numbers re-stated in our words"]
timing: {"frame_rate": "30 fps (frame counts as measured; the source clips ran 24 to 60 fps and are converted)", "holds_ms": [0, 0], "note": "measured resolved-hold range; the gate for any film is 0.6 to 1.4 s unless the close is a motion that ends mid-move (hold 0). high energy"}
eases: {"key": "accelExit, softLand, popOver (RasanMotion measured eases)", "notes": "an arrival decelerates; every close is one beat, usually smaller than the climax before it"}
camera: {"lens_mm": [50, 85], "moves": ["locked-off 2D; the scale of the mark is the move"], "rules": ["the mark is the last thing; at most one tagline", "a hard cut into the close, no crossfade"]}
recipe_2d: "Per-glyph snap flips 2 to 2.4 frames apart (type-name-morphs in library/motion/kinetic-type); icon rotation via M.camera to: { rotation } on accelDown curve; the badge M.snap with 'crashIn'-like overshoot of 4%."
recipe_3d: "Rasan3D: keep the mark as DOM above the 3D layer (crisp, per 3d.md); the scale track and holds above apply to the 2D layer; the 3D hero may do the last camera move under it."
pitfalls: ["Both names must be visible from ONE lockup: never crossfade the words", "a resolved hold over 1.4 s (the CTA beat stays at or under 25% of the film)", "a static logo with nothing alive in the hold"]
instruct: {"all": "Give the entry scale track with frame counts, the hold in seconds, what stays alive during it, and what precedes it. State that the mark never scales from zero.", "claude": "Claude tends to fade the logo up with a bounce plus a tagline and hold it 3 to 5 s. Ask for the scale track by frame and the hold by seconds.", "gpt": "GPT models tend to write a gradient glow and a 'Get started' pill. Forbid both and give the numbers."}
verified: {"sources_fetched": 1, "non_wikipedia": 1, "colours": "n/a", "colour_images": [], "grid": "n/a", "timings": "measured", "recipes": "proposed", "edited": "2026-10-15"}
sources: ["https://github.com/Tejashmakwana/motionmaxxing/blob/main/references/close.md"]
---
## What it is

C6 Logo morph from a previous identity. When to use it: A rename, a rebrand, 'from X to Y'; a high-energy launch; about 1.05 s in all.

Brand personalities it suits: rebrand, rename, high energy launch. Avoid: a crossfade, a flash at the swap. Seen in: one measured close.

## The defining traits (numbers)

- Entry: Per-glyph flip with a fixed left anchor (x .49): an anticipation spread of +26% over 0.19 s, then the second flip at 0.70 to 0.83 s; incoming glyphs arrive violet and darken left to right. The old icon (a rosette) spins clockwise, accelerating (8 deg at 0.47 s, 35 at 0.53, 128 at 0.60, 275 at 0.67, 336 at 0.70, about 30 deg per frame) while shrinking 153 -> 133 px; a cross-dissolve over 8 frames (new badge opacity 0, .1, .35, .6, .85, 1) on the same centre; the new badge scales .68 -> .85 -> 1.02 -> 1.04 peak (4% overshoot) -> 1.0.
- Track: New badge rotation continues clockwise and decelerates (-139 deg at 0.77 s, -85, -56, -31, -8, 0 at 1.03 s); no glow or flash at the swap.
- Alive during the hold: No hold: it ends mid-rotation, still moving on the last frame.
- Before it: A lockup that already shows the old name.
- Hold: none (ends mid-move). Universal rules for every close: resolved hold 0.6 to 1.4 s (a mark registers in about 0.5 s, a name in about 1 s); something stays alive for the whole hold: a creep, a sweep, a sway, a flicker (a static logo reads as a slide); the mark never scales up from zero and never fades up: it arrives oversized (1.5 to 3.75x) or in discrete steps and decelerates in.

## How to build it

Per-glyph snap flips 2 to 2.4 frames apart (type-name-morphs in library/motion/kinetic-type); icon rotation via M.camera to: { rotation } on accelDown curve; the badge M.snap with 'crashIn'-like overshoot of 4%.

Frames are at 30 fps; at another rate, keep the SECONDS and recompute the frame counts. Use the film's own ground: an inverted dark or white ground on the cut is an option, not a recipe (follow the brand's own surface).

## What makes a cheap imitation

- Both names must be visible from ONE lockup: never crossfade the words
- A fade-out, a glow on every layer, a tagline plus a URL plus a button, or a hold of 3 to 5 s with only a slow contraction (it reads as dead air).

## Sources

- motionmaxxing `references/close.md` (Apache-2.0, Tejas Makwana; credit row in `third_party/motionmaxxing/README.md`): numbers re-stated in our words.
