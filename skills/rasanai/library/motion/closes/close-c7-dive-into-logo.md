---
id: "close-c7-dive-into-logo"
name: "C7 Dive into the logo to enter the product"
space: "2d"
family: "closes"
references: ["motionmaxxing close catalogue: measured from 53 finished endings of launch and product films (Apache-2.0), numbers re-stated in our words"]
timing: {"frame_rate": "30 fps (frame counts as measured; the source clips ran 24 to 60 fps and are converted)", "holds_ms": [0, 0], "note": "measured resolved-hold range; the gate for any film is 0.6 to 1.4 s unless the close is a motion that ends mid-move (hold 0). medium, precise energy"}
eases: {"key": "cruise (RasanMotion measured eases)", "notes": "an arrival decelerates; every close is one beat, usually smaller than the climax before it"}
camera: {"lens_mm": [50, 85], "moves": ["locked-off 2D; the scale of the mark is the move"], "rules": ["the mark is the last thing; at most one tagline", "a hard cut into the close, no crossfade"]}
recipe_2d: "M.dive(logo, { at, frames: 9, perStep: 1.6, origin: [ux, uy] }); the unit hand-off is a hard step (no fade) to the container; for a deeper dive through several levels use M.scaleDive and references/scale-dive.md."
recipe_3d: "Rasan3D: keep the mark as DOM above the 3D layer (crisp, per 3d.md); the scale track and holds above apply to the 2D layer; the 3D hero may do the last camera move under it."
pitfalls: ["The zoom must never slow (no ease): an eased zoom reads as a drift, not a fall", "Do not aim at the frame centre; aim at the feature", "a resolved hold over 1.4 s (the CTA beat stays at or under 25% of the film)", "a static logo with nothing alive in the hold"]
instruct: {"all": "Give the entry scale track with frame counts, the hold in seconds, what stays alive during it, and what precedes it. State that the mark never scales from zero.", "claude": "Claude tends to fade the logo up with a bounce plus a tagline and hold it 3 to 5 s. Ask for the scale track by frame and the hold by seconds.", "gpt": "GPT models tend to write a gradient glow and a 'Get started' pill. Forbid both and give the numbers."}
verified: {"sources_fetched": 1, "non_wikipedia": 1, "colours": "n/a", "colour_images": [], "grid": "n/a", "timings": "measured", "recipes": "proposed", "edited": "2026-10-15"}
sources: ["https://github.com/Tejashmakwana/motionmaxxing/blob/main/references/close.md"]
---
## What it is

C7 Dive into the logo to enter the product. When to use it: Developer and tool brands whose logo has a feature that can be a container (an underscore or a caret becoming an input).

Brand personalities it suits: developer, tool, AI tool. Avoid: an eased push-in, a crossfade into the product. Seen in: one measured close.

## The defining traits (numbers)

- Entry: A constant-octave dive: scale 1, 1.02, 1.15, 1.46, 2.28, 4.52, 8.98, 14.67, 21.9 at 0, .067, .133, .2, .267, .333, .4, .467, .533 s (x1.5 to 2 per 0.067 s, no hold at frame 0). The origin follows the feature (the underscore), not the frame centre; the wordmark grows and exits right.
- Track: The underscore becomes a white pill (0.68 H tall at 0.73 s, 0.93 H at 1.08 s) that fades in place over 3 frames, then 3 blank frames, then a rounded box zooms OUT (top and bottom y .05/.98 -> .16/.88 -> .22/.82 -> .25/.78 over 0.62 s; stroke 10 -> 4 px).
- Alive during the hold: None: the next scene's cutout is rising when the clip ends.
- Before it: A logo whose detail is the next scene's container.
- Hold: none (ends mid-move). Universal rules for every close: resolved hold 0.6 to 1.4 s (a mark registers in about 0.5 s, a name in about 1 s); something stays alive for the whole hold: a creep, a sweep, a sway, a flicker (a static logo reads as a slide); the mark never scales up from zero and never fades up: it arrives oversized (1.5 to 3.75x) or in discrete steps and decelerates in.

## How to build it

M.dive(logo, { at, frames: 9, perStep: 1.6, origin: [ux, uy] }); the unit hand-off is a hard step (no fade) to the container; for a deeper dive through several levels use M.scaleDive and references/scale-dive.md.

Frames are at 30 fps; at another rate, keep the SECONDS and recompute the frame counts. Use the film's own ground: an inverted dark or white ground on the cut is an option, not a recipe (follow the brand's own surface).

## What makes a cheap imitation

- The zoom must never slow (no ease): an eased zoom reads as a drift, not a fall
- Do not aim at the frame centre; aim at the feature
- A fade-out, a glow on every layer, a tagline plus a URL plus a button, or a hold of 3 to 5 s with only a slow contraction (it reads as dead air).

## Sources

- motionmaxxing `references/close.md` (Apache-2.0, Tejas Makwana; credit row in `third_party/motionmaxxing/README.md`): numbers re-stated in our words.
