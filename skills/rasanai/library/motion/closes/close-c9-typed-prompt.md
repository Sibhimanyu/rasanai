---
id: "close-c9-typed-prompt"
name: "C9 Typed CTA prompt, cut before send"
space: "2d"
family: "closes"
references: ["motionmaxxing close catalogue: measured from 53 finished endings of launch and product films (Apache-2.0), numbers re-stated in our words"]
timing: {"frame_rate": "30 fps (frame counts as measured; the source clips ran 24 to 60 fps and are converted)", "holds_ms": [0, 500], "note": "measured resolved-hold range; the gate for any film is 0.6 to 1.4 s unless the close is a motion that ends mid-move (hold 0). low to medium energy"}
eases: {"key": "gentleIn, accelExit (RasanMotion measured eases)", "notes": "an arrival decelerates; every close is one beat, usually smaller than the climax before it"}
camera: {"lens_mm": [50, 85], "moves": ["locked-off 2D; the scale of the mark is the move"], "rules": ["the mark is the last thing; at most one tagline", "a hard cut into the close, no crossfade"]}
recipe_2d: "RasanUI U.input + U.type (rate 'author' or 'read'), cursor.click on send; the handoff is a hard step to an empty card."
recipe_3d: "Rasan3D: keep the mark as DOM above the 3D layer (crisp, per 3d.md); the scale track and holds above apply to the 2D layer; the 3D hero may do the last camera move under it."
pitfalls: ["Never show the result; the viewer's own action is the CTA", "a resolved hold over 1.4 s (the CTA beat stays at or under 25% of the film)", "a static logo with nothing alive in the hold"]
instruct: {"all": "Give the entry scale track with frame counts, the hold in seconds, what stays alive during it, and what precedes it. State that the mark never scales from zero.", "claude": "Claude tends to fade the logo up with a bounce plus a tagline and hold it 3 to 5 s. Ask for the scale track by frame and the hold by seconds.", "gpt": "GPT models tend to write a gradient glow and a 'Get started' pill. Forbid both and give the numbers."}
verified: {"sources_fetched": 1, "non_wikipedia": 1, "colours": "n/a", "colour_images": [], "grid": "n/a", "timings": "measured", "recipes": "proposed", "edited": "2026-10-15"}
sources: ["https://github.com/Tejashmakwana/motionmaxxing/blob/main/references/close.md"]
---
## What it is

C9 Typed CTA prompt, cut before send. When to use it: Developer and AI-tool brands where the CTA is 'type what you want' and the action transfers to the viewer.

Brand personalities it suits: developer, AI tool. Avoid: showing the result, a tagline, a button. Seen in: three measured closes.

## The defining traits (numbers)

- Entry: A white ground, a thin tall caret (0.008 W x 0.25 H) that NEVER blinks, 38 graphemes typed with a human cadence; scale hard-cuts large -> wide (x0.42) -> close-up (x1.57), each in the same frame as a content jump; the send arrow (0.14 W x 0.21 H) has just arrived 0.18 W right of the last glyph; the send is never shown. Bar version: a white bar .71 x .13 (radius H/4), a 40-character request typed over 1.07 s, a pointer at (.89, .80) at 3.20 s decaying x0.72 per 2-frame step, parked on send at 3.80 s (no press, no hover).
- Track: Contract 4.00 to 4.43 s (bar .70 -> .64 W on gentleIn, biggest step last), then a HARD replacement at 4.47 s by an empty white card (.83 x .85) on a one-step-darker ground: the card is the proof of the click and the container for the next scene.
- Alive during the hold: Action ends on the handoff; hold 0 to 0.5 s. Click-then-handoff variant: cursor parks on send 0.48 s while the camera regrows to 1.13x, a disc 1 -> .94 -> .63 -> 1.0 -> 1.055, rings born on the press frame (the one ring film), cursor accelerates off, last frame hard-jumps to an empty bordered card.
- Before it: A typed prompt that is the product's real input field.
- Hold: 0 to 0.5 s resolved. Universal rules for every close: resolved hold 0.6 to 1.4 s (a mark registers in about 0.5 s, a name in about 1 s); something stays alive for the whole hold: a creep, a sweep, a sway, a flicker (a static logo reads as a slide); the mark never scales up from zero and never fades up: it arrives oversized (1.5 to 3.75x) or in discrete steps and decelerates in.

## How to build it

RasanUI U.input + U.type (rate 'author' or 'read'), cursor.click on send; the handoff is a hard step to an empty card.

Frames are at 30 fps; at another rate, keep the SECONDS and recompute the frame counts. Use the film's own ground: an inverted dark or white ground on the cut is an option, not a recipe (follow the brand's own surface).

## What makes a cheap imitation

- Never show the result; the viewer's own action is the CTA
- A fade-out, a glow on every layer, a tagline plus a URL plus a button, or a hold of 3 to 5 s with only a slow contraction (it reads as dead air).

## Sources

- motionmaxxing `references/close.md` (Apache-2.0, Tejas Makwana; credit row in `third_party/motionmaxxing/README.md`): numbers re-stated in our words.
