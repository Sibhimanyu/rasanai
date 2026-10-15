---
id: "close-c4-icon-on-white"
name: "C4 Icon on white, settling from 1.86x"
space: "2d"
family: "closes"
references: ["motionmaxxing close catalogue: measured from 53 finished endings of launch and product films (Apache-2.0), numbers re-stated in our words"]
timing: {"frame_rate": "30 fps (frame counts as measured; the source clips ran 24 to 60 fps and are converted)", "holds_ms": [500, 500], "note": "measured resolved-hold range; the gate for any film is 0.6 to 1.4 s unless the close is a motion that ends mid-move (hold 0). low energy"}
eases: {"key": "launch, softLand (RasanMotion measured eases)", "notes": "an arrival decelerates; every close is one beat, usually smaller than the climax before it"}
camera: {"lens_mm": [50, 85], "moves": ["locked-off 2D; the scale of the mark is the move"], "rules": ["the mark is the last thing; at most one tagline", "a hard cut into the close, no crossfade"]}
recipe_2d: "M.snap(icon, { at, from: { scale: 1.86 }, to: { scale: 1 }, firstFrameShare: 0.16, tail: 74, ease: 'launch' }); the 'launch' curve (cubic-bezier .05,.7,.1,1) has the right long tail."
recipe_3d: "Rasan3D: keep the mark as DOM above the 3D layer (crisp, per 3d.md); the scale track and holds above apply to the 2D layer; the 3D hero may do the last camera move under it."
pitfalls: ["A near-endless asymptote must not hide a hold longer than the gate: the CTA beat stays under a quarter of the film", "a resolved hold over 1.4 s (the CTA beat stays at or under 25% of the film)", "a static logo with nothing alive in the hold"]
instruct: {"all": "Give the entry scale track with frame counts, the hold in seconds, what stays alive during it, and what precedes it. State that the mark never scales from zero.", "claude": "Claude tends to fade the logo up with a bounce plus a tagline and hold it 3 to 5 s. Ask for the scale track by frame and the hold by seconds.", "gpt": "GPT models tend to write a gradient glow and a 'Get started' pill. Forbid both and give the numbers."}
verified: {"sources_fetched": 1, "non_wikipedia": 1, "colours": "n/a", "colour_images": [], "grid": "n/a", "timings": "measured", "recipes": "proposed", "edited": "2026-10-15"}
sources: ["https://github.com/Tejashmakwana/motionmaxxing/blob/main/references/close.md"]
---
## What it is

C4 Icon on white, settling from 1.86x. When to use it: A mark that is a pure shape (a triangle and a dot); minimal, premium or consumer brands; follow a dark glowing scene.

Brand personalities it suits: minimalist, pure shape icon, premium consumer. Avoid: a wordmark, a tagline, a fade. Seen in: one measured close.

## The defining traits (numbers)

- Entry: A hard cut to flat white; a black rounded shape (0.13 W x 0.20 H above a 0.05 W dot, corner radius 10 px settling to 5) is ONE transform at x .50. No fade, no wordmark, no tagline.
- Track: Scale after the cut (s): 1.864 (0) -> 1.654 (+0.04) -> 1.568 (+0.07) -> 1.449 (+0.14) -> 1.284 (+0.34) -> 1.21 (+0.47) -> 1.144 (+0.67) -> 1.10 (+0.87) -> 1.07 (+1.07) -> 1.025 (+1.47) -> 1.008 (+1.87) -> 1.001 (+2.27) -> 1.0 (+2.47). The first 0.13 s covers 48% of the travel; 0.33 s covers 67%; the last 0.5% takes two seconds.
- Alive during the hold: The settle IS the motion (about 2.5 s of an ever-slowing creep), then 0.5 s static. This is the only close whose moving time is long: its alive part is the asymptote, so the resolved hold is still 0.5 s.
- Before it: A dark, glowing scene, then a hard cut to white.
- Hold: 0.5 to 0.5 s resolved. Universal rules for every close: resolved hold 0.6 to 1.4 s (a mark registers in about 0.5 s, a name in about 1 s); something stays alive for the whole hold: a creep, a sweep, a sway, a flicker (a static logo reads as a slide); the mark never scales up from zero and never fades up: it arrives oversized (1.5 to 3.75x) or in discrete steps and decelerates in.

## How to build it

M.snap(icon, { at, from: { scale: 1.86 }, to: { scale: 1 }, firstFrameShare: 0.16, tail: 74, ease: 'launch' }); the 'launch' curve (cubic-bezier .05,.7,.1,1) has the right long tail.

Frames are at 30 fps; at another rate, keep the SECONDS and recompute the frame counts. Use the film's own ground: an inverted dark or white ground on the cut is an option, not a recipe (follow the brand's own surface).

## What makes a cheap imitation

- A near-endless asymptote must not hide a hold longer than the gate: the CTA beat stays under a quarter of the film
- A fade-out, a glow on every layer, a tagline plus a URL plus a button, or a hold of 3 to 5 s with only a slow contraction (it reads as dead air).

## Sources

- motionmaxxing `references/close.md` (Apache-2.0, Tejas Makwana; credit row in `third_party/motionmaxxing/README.md`): numbers re-stated in our words.
