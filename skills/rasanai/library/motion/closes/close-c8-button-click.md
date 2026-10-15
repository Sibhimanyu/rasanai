---
id: "close-c8-button-click"
name: "C8 Button click, cut before release"
space: "2d"
family: "closes"
references: ["motionmaxxing close catalogue: measured from 53 finished endings of launch and product films (Apache-2.0), numbers re-stated in our words"]
timing: {"frame_rate": "30 fps (frame counts as measured; the source clips ran 24 to 60 fps and are converted)", "holds_ms": [0, 0], "note": "measured resolved-hold range; the gate for any film is 0.6 to 1.4 s unless the close is a motion that ends mid-move (hold 0). any energy"}
eases: {"key": "snapSettle, accelExit, crashOut (RasanMotion measured eases)", "notes": "an arrival decelerates; every close is one beat, usually smaller than the climax before it"}
camera: {"lens_mm": [50, 85], "moves": ["locked-off 2D; the scale of the mark is the move"], "rules": ["the mark is the last thing; at most one tagline", "a hard cut into the close, no crossfade"]}
recipe_2d: "RasanUI cursor.click(button, { at, depth: 0.81, targetDepth: 0.8 }) with M.snap on the button bloom; M.smear on the label for the one frame; the pre-cut shrink on accelExit."
recipe_3d: "Rasan3D: keep the mark as DOM above the 3D layer (crisp, per 3d.md); the scale track and holds above apply to the 2D layer; the 3D hero may do the last camera move under it."
pitfalls: ["A logo plus a 'Download' pill plus a cursor that presses it is a web CTA footer with a cursor: it works only as the product's own control, never as an add-on under a lockup", "a resolved hold over 1.4 s (the CTA beat stays at or under 25% of the film)", "a static logo with nothing alive in the hold"]
instruct: {"all": "Give the entry scale track with frame counts, the hold in seconds, what stays alive during it, and what precedes it. State that the mark never scales from zero.", "claude": "Claude tends to fade the logo up with a bounce plus a tagline and hold it 3 to 5 s. Ask for the scale track by frame and the hold by seconds.", "gpt": "GPT models tend to write a gradient glow and a 'Get started' pill. Forbid both and give the numbers."}
verified: {"sources_fetched": 1, "non_wikipedia": 1, "colours": "n/a", "colour_images": [], "grid": "n/a", "timings": "measured", "recipes": "proposed", "edited": "2026-10-15"}
sources: ["https://github.com/Tejashmakwana/motionmaxxing/blob/main/references/close.md"]
---
## What it is

C8 Button click, cut before release. When to use it: Playful, consumer and developer CTAs where the viewer's next action is the click; any energy level. Works when the button is the PRODUCT'S OWN control and the film cuts before the release.

Brand personalities it suits: playful, consumer, developer. Avoid: a click ripple, showing the result, a CTA footer. Seen in: four measured variants.

## The defining traits (numbers)

- Entry: A button (0.46 W x 0.19 H at the centre, label 6% H) blooms from 0.60x on snapSettle (0.60 -> .72 -> .79 -> .84 -> .87 -> .91 -> .93 -> .94 -> .96 at 10 f -> .97 at 12 f -> .99 at 16 f -> 1.0 at 20 f); the first frame is already 31% of the travel, blur 5 -> 2 -> 1 -> 0 over 4 frames. A cursor 5.1x its settled size, mostly below the frame, blurred 5 px, scales about its tip 5.1 -> 3.45 -> 3.0 -> ... -> 1.0 over 0.87 s; the click lands while it is still creeping.
- Track: The click is ONE frame (0.93 s): button x1.021 and a fill flash, the label becomes a 95 px horizontal smear (0.44 W) with 25 px glow (12, 7 px over the next frames), the cursor compresses to .847 with its tip pushed down 0.03 H and relaxes over 6 frames. Next frame: the product's own next state (a bracket) appears instantly, no fade.
- Alive during the hold: Pre-cut shrink 0.23 s: button .947 -> .74, bracket -> .76, cursor -> .75, accelerating, biggest step on the last frame; HARD CUT at maximum velocity. The release is never shown. Simpler variants end on maximum compression (button .14 -> .11 W = .81) or squash to 79% and recover with the camera still moving.
- Before it: None on the button (0 s); if the next scene is an icon plate use C4.
- Hold: none (ends mid-move). Universal rules for every close: resolved hold 0.6 to 1.4 s (a mark registers in about 0.5 s, a name in about 1 s); something stays alive for the whole hold: a creep, a sweep, a sway, a flicker (a static logo reads as a slide); the mark never scales up from zero and never fades up: it arrives oversized (1.5 to 3.75x) or in discrete steps and decelerates in.

## How to build it

RasanUI cursor.click(button, { at, depth: 0.81, targetDepth: 0.8 }) with M.snap on the button bloom; M.smear on the label for the one frame; the pre-cut shrink on accelExit.

Frames are at 30 fps; at another rate, keep the SECONDS and recompute the frame counts. Use the film's own ground: an inverted dark or white ground on the cut is an option, not a recipe (follow the brand's own surface).

## What makes a cheap imitation

- A logo plus a 'Download' pill plus a cursor that presses it is a web CTA footer with a cursor: it works only as the product's own control, never as an add-on under a lockup
- A fade-out, a glow on every layer, a tagline plus a URL plus a button, or a hold of 3 to 5 s with only a slow contraction (it reads as dead air).

## Sources

- motionmaxxing `references/close.md` (Apache-2.0, Tejas Makwana; credit row in `third_party/motionmaxxing/README.md`): numbers re-stated in our words.
