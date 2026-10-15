---
id: "close-c3-emblem-blur-down"
name: "C3 Emblem enters oversized and blurred"
space: "2d"
family: "closes"
references: ["motionmaxxing close catalogue: measured from 53 finished endings of launch and product films (Apache-2.0), numbers re-stated in our words"]
timing: {"frame_rate": "30 fps (frame counts as measured; the source clips ran 24 to 60 fps and are converted)", "holds_ms": [670, 670], "note": "measured resolved-hold range; the gate for any film is 0.6 to 1.4 s unless the close is a motion that ends mid-move (hold 0). low energy"}
eases: {"key": "snapSettle, softLand (RasanMotion measured eases)", "notes": "an arrival decelerates; every close is one beat, usually smaller than the climax before it"}
camera: {"lens_mm": [50, 85], "moves": ["locked-off 2D; the scale of the mark is the move"], "rules": ["the mark is the last thing; at most one tagline", "a hard cut into the close, no crossfade"]}
recipe_2d: "M.snap(emblem, { at, from: { scale: 2.8 }, to: { scale: 1 }, firstFrameShare: 0.35, tail: 9, ease: 'softLand' }) with a blur that halves every 2 frames (a stepped filter via M.smear on both axes or a 5-step CSS blur); the name types with U.type-style per-glyph steps 2 frames apart (no caret)."
recipe_3d: "Rasan3D: keep the mark as DOM above the 3D layer (crisp, per 3d.md); the scale track and holds above apply to the 2D layer; the 3D hero may do the last camera move under it."
pitfalls: ["An oversized arrival is the law that an arrival decelerates, not a rule that every logo starts big", "The mosaic, the typed name and the petal outro are one film's signature: use rarely", "If scale was already spent earlier in the film, let the mark arrive at its own size", "a resolved hold over 1.4 s (the CTA beat stays at or under 25% of the film)", "a static logo with nothing alive in the hold"]
instruct: {"all": "Give the entry scale track with frame counts, the hold in seconds, what stays alive during it, and what precedes it. State that the mark never scales from zero.", "claude": "Claude tends to fade the logo up with a bounce plus a tagline and hold it 3 to 5 s. Ask for the scale track by frame and the hold by seconds.", "gpt": "GPT models tend to write a gradient glow and a 'Get started' pill. Forbid both and give the numbers."}
verified: {"sources_fetched": 1, "non_wikipedia": 1, "colours": "n/a", "colour_images": [], "grid": "n/a", "timings": "measured", "recipes": "proposed", "edited": "2026-10-15"}
sources: ["https://github.com/Tejashmakwana/motionmaxxing/blob/main/references/close.md"]
---
## What it is

C3 Emblem enters oversized and blurred. When to use it: Quiet, editorial or consumer-premium brands; a name typed after its emblem.

Brand personalities it suits: quiet, editorial, premium consumer. Avoid: glow, particles, a fade-out. Seen in: one measured close.

## The defining traits (numbers)

- Entry: The emblem enters at about 0.28 W, blurred 18 px and tinted (a pale violet), then every 2-frame step halves the excess: width .28 -> .19 -> .14 -> .12 -> .10; blur 18 -> 9 -> 4 -> 2 -> 0.6 -> 0; colour darkens to ink; sharp at 0.33 s. It never scales up from zero.
- Track: Excess halves every 2 frames (a decaying exponential in steps): 0.28 -> 0.19 -> 0.14 -> 0.12 -> 0.10 W. The lockup follows: the emblem creeps left, then two 52 px steps coincident with the first letters, travel 0.12 W in total.
- Alive during the hold: The one allowed STATIC hold: 0.67 s after the settle. Then the signature outro: five petals swing counterclockwise about 100 degrees into a cluster while the name backspaces one letter per step right to left (survivors do not re-centre); it ends on the cluster, no text, no fade.
- Before it: A hard-edged mosaic (12 x 12 cells) at peak for 2 frames, retreating to the corners in 3 steps over 0.27 s, over blurred soft blobs; the page goes near-white to cream over 0.6 s. Variant: the logo held full at frame 0 and shrunk on snapSettle (scaleX 1.46 -> 1.0 in 8 frames, excess x0.72 per frame), creeping to .96 by 0.8 s, then ONE frame to nothing at about 1.0 s.
- Hold: 0.67 to 0.67 s resolved. Universal rules for every close: resolved hold 0.6 to 1.4 s (a mark registers in about 0.5 s, a name in about 1 s); something stays alive for the whole hold: a creep, a sweep, a sway, a flicker (a static logo reads as a slide); the mark never scales up from zero and never fades up: it arrives oversized (1.5 to 3.75x) or in discrete steps and decelerates in.

## How to build it

M.snap(emblem, { at, from: { scale: 2.8 }, to: { scale: 1 }, firstFrameShare: 0.35, tail: 9, ease: 'softLand' }) with a blur that halves every 2 frames (a stepped filter via M.smear on both axes or a 5-step CSS blur); the name types with U.type-style per-glyph steps 2 frames apart (no caret).

Frames are at 30 fps; at another rate, keep the SECONDS and recompute the frame counts. Use the film's own ground: an inverted dark or white ground on the cut is an option, not a recipe (follow the brand's own surface).

## What makes a cheap imitation

- An oversized arrival is the law that an arrival decelerates, not a rule that every logo starts big
- The mosaic, the typed name and the petal outro are one film's signature: use rarely
- If scale was already spent earlier in the film, let the mark arrive at its own size
- A fade-out, a glow on every layer, a tagline plus a URL plus a button, or a hold of 3 to 5 s with only a slow contraction (it reads as dead air).

## Sources

- motionmaxxing `references/close.md` (Apache-2.0, Tejas Makwana; credit row in `third_party/motionmaxxing/README.md`): numbers re-stated in our words.
