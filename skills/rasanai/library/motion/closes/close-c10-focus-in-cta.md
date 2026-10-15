---
id: "close-c10-focus-in-cta"
name: "C10 CTA words focusing in place, with a character-built logo"
space: "2d"
family: "closes"
references: ["motionmaxxing close catalogue: measured from 53 finished endings of launch and product films (Apache-2.0), numbers re-stated in our words"]
timing: {"frame_rate": "30 fps (frame counts as measured; the source clips ran 24 to 60 fps and are converted)", "holds_ms": [1000, 1200], "note": "measured resolved-hold range; the gate for any film is 0.6 to 1.4 s unless the close is a motion that ends mid-move (hold 0). low, growing energy"}
eases: {"key": "cruise, softInOut (RasanMotion measured eases)", "notes": "an arrival decelerates; every close is one beat, usually smaller than the climax before it"}
camera: {"lens_mm": [50, 85], "moves": ["locked-off 2D; the scale of the mark is the move"], "rules": ["the mark is the last thing; at most one tagline", "a hard cut into the close, no crossfade"]}
recipe_2d: "M.colour / opacity linear tween for the last phrase; an element-per-word focus (autoAlpha .12 -> 1 with blur 8 -> 0, 4 frames each); a RasanUI.shimmer-style band for the sweep on a fixed 0.708 s period (repeat count, never infinite)."
recipe_3d: "Rasan3D: keep the mark as DOM above the 3D layer (crisp, per 3d.md); the scale track and holds above apply to the 2D layer; the 3D hero may do the last camera move under it."
pitfalls: ["A mascot-built lockup is C2 in disguise: same default warning applies", "a resolved hold over 1.4 s (the CTA beat stays at or under 25% of the film)", "a static logo with nothing alive in the hold"]
instruct: {"all": "Give the entry scale track with frame counts, the hold in seconds, what stays alive during it, and what precedes it. State that the mark never scales from zero.", "claude": "Claude tends to fade the logo up with a bounce plus a tagline and hold it 3 to 5 s. Ask for the scale track by frame and the hold by seconds.", "gpt": "GPT models tend to write a gradient glow and a 'Get started' pill. Forbid both and give the numbers."}
verified: {"sources_fetched": 1, "non_wikipedia": 1, "colours": "n/a", "colour_images": [], "grid": "n/a", "timings": "measured", "recipes": "proposed", "edited": "2026-10-15"}
sources: ["https://github.com/Tejashmakwana/motionmaxxing/blob/main/references/close.md"]
---
## What it is

C10 CTA words focusing in place, with a character-built logo. When to use it: Consumer or playful brands with a mascot or avatar; quiet energy that grows.

Brand personalities it suits: playful, consumer, character. Avoid: static hold, rainbow gradients. Seen in: one measured close.

## The defining traits (numbers)

- Entry: Sequence (24 fps source, from the cut): the last phrase fades LINEARLY over 0.4 s, one fully black frame, the avatar appears at its biggest (0.14 W) and shrinks about its fixed centre (0.12 W at +0.04 s, 0.07 at +0.25, 0.06 at +0.6; halo 22 -> 3 px; no translation, no overshoot), the logo builds as in C2 starting 0.08 s later, and the CTA words focus in place (opacity .12 -> 1, blur 8 -> 0 px, 4 frames each, back to back) starting 0.04 s after the unsquash begins so they are sharp 0.05 s after the logo goes solid.
- Track: Geometry: CTA 7.2% H em, x .40 to .66, top y .41; avatar about .02 W left of the first word; wordmark semibold 9% H centred below at (.39, .54); the lockup about .30 W x .20 H; 95% of the frame stays black.
- Alive during the hold: A pink band (about 130 px, 7 px glow) sweeps left to right across the CTA glyphs at about 55 px per frame, repeating with a 0.708 s period; one-frame shear glitches on the TOP half of the logo only; ends mid-sweep; about 1.0 s of fully resolved lockup.
- Before it: A black field and one phrase to fade.
- Hold: 1 to 1.2 s resolved. Universal rules for every close: resolved hold 0.6 to 1.4 s (a mark registers in about 0.5 s, a name in about 1 s); something stays alive for the whole hold: a creep, a sweep, a sway, a flicker (a static logo reads as a slide); the mark never scales up from zero and never fades up: it arrives oversized (1.5 to 3.75x) or in discrete steps and decelerates in.

## How to build it

M.colour / opacity linear tween for the last phrase; an element-per-word focus (autoAlpha .12 -> 1 with blur 8 -> 0, 4 frames each); a RasanUI.shimmer-style band for the sweep on a fixed 0.708 s period (repeat count, never infinite).

Frames are at 30 fps; at another rate, keep the SECONDS and recompute the frame counts. Use the film's own ground: an inverted dark or white ground on the cut is an option, not a recipe (follow the brand's own surface).

## What makes a cheap imitation

- A mascot-built lockup is C2 in disguise: same default warning applies
- A fade-out, a glow on every layer, a tagline plus a URL plus a button, or a hold of 3 to 5 s with only a slow contraction (it reads as dead air).

## Sources

- motionmaxxing `references/close.md` (Apache-2.0, Tejas Makwana; credit row in `third_party/motionmaxxing/README.md`): numbers re-stated in our words.
