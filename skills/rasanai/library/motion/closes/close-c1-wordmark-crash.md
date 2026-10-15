---
id: "close-c1-wordmark-crash"
name: "C1 Wordmark crash-in, then a perpetual contraction"
space: "2d"
family: "closes"
references: ["motionmaxxing close catalogue: measured from 53 finished endings of launch and product films (Apache-2.0), numbers re-stated in our words"]
timing: {"frame_rate": "30 fps (frame counts as measured; the source clips ran 24 to 60 fps and are converted)", "holds_ms": [1200, 1440], "note": "measured resolved-hold range; the gate for any film is 0.6 to 1.4 s unless the close is a motion that ends mid-move (hold 0). high, then a long creep energy"}
eases: {"key": "snapSettle, cruise, gentleIn (RasanMotion measured eases)", "notes": "an arrival decelerates; every close is one beat, usually smaller than the climax before it"}
camera: {"lens_mm": [50, 85], "moves": ["locked-off 2D; the scale of the mark is the move"], "rules": ["the mark is the last thing; at most one tagline", "a hard cut into the close, no crossfade"]}
recipe_2d: "M.snap(name, { at, from: { scale: 3.75 }, to: { scale: 1 }, firstFrameShare: 0.53, tail: 19, ease: 'softLand', smear: false }); then M.camera(name, { at: landed, dur: 0.9, to: { scale: 0.93 }, curve: 'gentleIn' }). Streaks: M.smear(name, { at, frames: 5, px: 60, axis: 'x' }) (ONE blur grammar: smear, not shutter)."
recipe_3d: "Rasan3D: keep the mark as DOM above the 3D layer (crisp, per 3d.md); the scale track and holds above apply to the 2D layer; the 3D hero may do the last camera move under it."
pitfalls: ["It is also the premium pastiche an AI reaches for to look expensive: use it only if the brand is dark and weighty AND the film has not already spent its scale", "A halo only at the event, never as wallpaper", "Do not make it the automatic last move of every film", "a resolved hold over 1.4 s (the CTA beat stays at or under 25% of the film)", "a static logo with nothing alive in the hold"]
instruct: {"all": "Give the entry scale track with frame counts, the hold in seconds, what stays alive during it, and what precedes it. State that the mark never scales from zero.", "claude": "Claude tends to fade the logo up with a bounce plus a tagline and hold it 3 to 5 s. Ask for the scale track by frame and the hold by seconds.", "gpt": "GPT models tend to write a gradient glow and a 'Get started' pill. Forbid both and give the numbers."}
verified: {"sources_fetched": 1, "non_wikipedia": 1, "colours": "n/a", "colour_images": [], "grid": "n/a", "timings": "measured", "recipes": "proposed", "edited": "2026-10-15"}
sources: ["https://github.com/Tejashmakwana/motionmaxxing/blob/main/references/close.md"]
---
## What it is

C1 Wordmark crash-in, then a perpetual contraction. When to use it: Premium or technical brands, high energy, a light film that needs a heavy last beat. Needs a hard cut into an inverted dark ground.

Brand personalities it suits: premium, dark, technical, weighty. Avoid: a tagline, a bounce, a glow on every layer, a fade-out. Seen in: two measured dark sign-offs.

## The defining traits (numbers)

- Entry: A lowercase wordmark in white, weight 480 to 500, arrives at 3.5 to 3.75x its settled size (ink wider than the frame) on `snapSettle`, then creeps on `cruise`; `crashIn` only if it should punch past its mark. Settled ink is only 0.27 to 0.28 of the frame width: the empty field plus its glow is the hold.
- Track: Scale: 3.75 -> 2.29 (frame 1, 39% of the whole collapse in ONE frame) -> 1.90 -> 1.72 -> 1.55 -> 1.42 -> 1.33 (f6) -> 1.21 (f8) -> 1.12 (f10) -> 1.07 (f12) -> 1.04 (f14) -> 1.00 (f20, 0.67 s) -> 0.97 (f30) -> 0.93 (f36). A second measured version: 3.51 -> 2.47 -> 2.10 -> 1.57 -> 1.34 (f6 = 0.2 s, 86% of the drop) -> 1.0 at 0.6 s -> 0.84 at 1.06 s -> 0.57 on the last frame.
- Alive during the hold: The contraction never stops (no dead frame): after landing it keeps shrinking and ACCELERATES in the last 0.2 s (0.26 -> 0.23 -> 0.17 of the width), the glow flickers slightly, and the film ends visible, mid-shrink.
- Before it: A hard cut into an inverted dark ground (near-black, never a gradient crossfade). Decay on the cut: 64 to 96 scaled low-alpha copies as radial zoom streaks (about 60 px at the cut, halving each frame to about 2 px by f5) plus a cyan-left and amber-right fringe of about 15 px; ALL streaks, fringes and core blur reach zero in 5 frames. Rest glow in three layers (3 px, 15 px at alpha 0.6, 45 px at alpha 0.22) and a halo that scales with the name, only at the event.
- Hold: 1.2 to 1.44 s resolved. Universal rules for every close: resolved hold 0.6 to 1.4 s (a mark registers in about 0.5 s, a name in about 1 s); something stays alive for the whole hold: a creep, a sweep, a sway, a flicker (a static logo reads as a slide); the mark never scales up from zero and never fades up: it arrives oversized (1.5 to 3.75x) or in discrete steps and decelerates in.

## How to build it

M.snap(name, { at, from: { scale: 3.75 }, to: { scale: 1 }, firstFrameShare: 0.53, tail: 19, ease: 'softLand', smear: false }); then M.camera(name, { at: landed, dur: 0.9, to: { scale: 0.93 }, curve: 'gentleIn' }). Streaks: M.smear(name, { at, frames: 5, px: 60, axis: 'x' }) (ONE blur grammar: smear, not shutter).

Frames are at 30 fps; at another rate, keep the SECONDS and recompute the frame counts. Use the film's own ground: an inverted dark or white ground on the cut is an option, not a recipe (follow the brand's own surface).

## What makes a cheap imitation

- It is also the premium pastiche an AI reaches for to look expensive: use it only if the brand is dark and weighty AND the film has not already spent its scale
- A halo only at the event, never as wallpaper
- Do not make it the automatic last move of every film
- A fade-out, a glow on every layer, a tagline plus a URL plus a button, or a hold of 3 to 5 s with only a slow contraction (it reads as dead air).

## Sources

- motionmaxxing `references/close.md` (Apache-2.0, Tejas Makwana; credit row in `third_party/motionmaxxing/README.md`): numbers re-stated in our words.
