---
id: "type-key-word-devices"
name: "Key-word emphasis devices (selection box, reticle, loop, accent, size jump)"
space: "2d"
family: "kinetic-type"
references: ["motionmaxxing type and close catalogues, measured from finished launch and product films (Apache-2.0), numbers re-stated in our words"]
timing: {"frame_rate": "30 fps", "holds_ms": [400, 700], "durations_ms": {"selection_box": [130, 170], "reticle_draw": [370, 370], "loop_draw": [750, 750], "loop_hold": [700, 700]}, "note": "measured; fire only after the line is readable"}
eases: {"key": "hard steps for selection boxes; cruise for dashes; softLand for size convergence", "notes": "one device per line, chosen by metaphor"}
camera: {"lens_mm": [50, 85], "moves": ["locked-off; the type is the thing that moves"], "rules": ["use the film's one motion grammar and clock so the performance looks like one hand", "spend it on the one or two words that matter"]}
recipe_2d: "Choose ONE device per line by the film's metaphor and never combine two on a line: selection boxes for a product-mechanic film (text-selection), a hand-drawn loop for editorial, a reticle for technical, accent colour or a size jump for the rest. Time the device to start when the line is readable."
recipe_3d: "Rasan3D: type stays DOM above the 3D layer (crisp, per 3d.md section 7); the devices and numbers above apply to that 2D layer."
pitfalls: ["an underline or a glow (a second object that competes with the word)", "two devices on one line", "starting the highlight before the sentence is readable"]
instruct: {"all": "Say which device, on which word, at which frame after the line completes.", "claude": "Claude sets every line with the same entrance and highlights nothing. Ask which ONE word acts and what it physically does.", "gpt": "GPT models decorate with glow, underline or gradient. Forbid those and give the device by metaphor."}
verified: {"sources_fetched": 1, "non_wikipedia": 1, "colours": "n/a", "colour_images": [], "grid": "n/a", "timings": "measured", "recipes": "proposed", "edited": "2026-10-15"}
sources: ["https://github.com/Tejashmakwana/motionmaxxing/blob/main/references/type.md", "https://github.com/Tejashmakwana/motionmaxxing/blob/main/references/close.md"]
---

## What it is

When one word carries the claim, a single device says which. The device is picked from the film's metaphor, so it belongs to the film's world.

## The defining traits (numbers)

| Device | Numbers | Metaphor |
|---|---|---|
| Selection boxes | a solid rectangle behind a word for 4 to 5 frames each (0.13 to 0.17 s), ONE empty frame between boxes, the word dims (it does not invert), hard cut in and out, fired the instant the line is complete | prompt or text selection (a product mechanic) |
| Hand-drawn loop | a 5 px round-capped stroke, about 9 held poses on 2-frame holds on a 12 fps clock over 0.75 s, drawn from under an object, held about 0.7 s, exits as a new curl, behind text and card | editorial, hand-made |
| Reticle box | four thin lines drawn by travelling dashes in sequence over about 0.37 s, locked to the line's drift | technical, lock-on |
| Accent word | accent colour on the argument noun, the rest in ink; or 10 to 40% larger; a different face only as the film's one deliberate second voice | any |
| Size jump | key words enter 1.44 to 2x larger and converge to the line (numerals 2x the words) | any |
| Gradient clipped to glyphs | one word only | an "AI" moment |

- Timing: the highlight starts when the line is readable (selection boxes at completion; a loop about 0.6 s after the words are readable). The sentence is read first, then marked.

## How to build it

Boxes: absolutely positioned divs behind the word, shown by hard steps (RasanUI.step or a frame table), one empty frame between. Reticle: four SVG lines with stroke-dashoffset tweens in sequence (0.09 s each). Loop: an SVG path with ~9 stepped pose frames (stepped ease, not a smooth draw).

## What makes a cheap imitation

- A smooth animated underline; a glow behind the word; a highlighter swipe on every line.
- The device runs the whole line instead of the one word.

## Sources

- motionmaxxing `references/type.md` section 6 (Apache-2.0, Tejas Makwana), restated in our words.
