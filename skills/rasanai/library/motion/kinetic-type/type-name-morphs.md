---
id: "type-name-morphs"
name: "Name and identity morphs (per-glyph flip, backspace, survivor, two masks)"
space: "2d"
family: "kinetic-type"
references: ["motionmaxxing type and close catalogues, measured from finished launch and product films (Apache-2.0), numbers re-stated in our words"]
timing: {"frame_rate": "60 fps source", "holds_ms": [0, 300], "durations_ms": {"glyph_flip_slot": [33, 40], "squash": [50, 50], "grow": [100, 130], "anticipation_spread": [190, 190], "second_flip": [130, 130]}, "note": "measured at 60 fps then restated in ms"}
eases: {"key": "softLand for the spread; linear steps for per-glyph slots", "notes": "a fixed left anchor keeps the eye from travelling"}
camera: {"lens_mm": [50, 85], "moves": ["locked-off; the type is the thing that moves"], "rules": ["use the film's one motion grammar and clock so the performance looks like one hand", "spend it on the one or two words that matter"]}
recipe_2d: "One name becomes another without a crossfade. Pick a recipe: per-glyph flip, backspace and retype, survivor letters, two soft masks, or a scramble that snaps to the exact glyph count. Keep one fixed anchor (left edge, centre or a carrier dot)."
recipe_3d: "Rasan3D: type stays DOM above the 3D layer (crisp, per 3d.md section 7); the devices and numbers above apply to that 2D layer."
pitfalls: ["a crossfade between the names", "re-centring the survivors on each step (they must hold their positions)", "a morph with no anchor, so the eye has to search"]
instruct: {"all": "Give the old and new name, the recipe, the anchor, and the frame per glyph.", "claude": "Claude sets every line with the same entrance and highlights nothing. Ask which ONE word acts and what it physically does.", "gpt": "GPT models decorate with glow, underline or gradient. Forbid those and give the device by metaphor."}
verified: {"sources_fetched": 1, "non_wikipedia": 1, "colours": "n/a", "colour_images": [], "grid": "n/a", "timings": "measured", "recipes": "proposed", "edited": "2026-10-15"}
sources: ["https://github.com/Tejashmakwana/motionmaxxing/blob/main/references/type.md", "https://github.com/Tejashmakwana/motionmaxxing/blob/main/references/close.md"]
---

## What it is

Identity changes (a rename, a rebrand, a word inside a line that changes meaning) are shown as a build the viewer can follow. The mechanism is visible, so the morph feels made.

## The defining traits (numbers)

- Per-glyph flip: left to right at 2 to 2.4 frames per glyph at 60 fps (0.033 to 0.04 s); fixed left anchor; the outgoing glyph squashes up to a hairline at y .49 in 0.05 s; the incoming grows from a hairline at y .54 to full in 0.10 to 0.13 s; two thin strokes at different heights are visible mid-swap; outgoing glyphs shift from black to a dark violet, incoming start dark violet and brighten.
- Second flip: an anticipation spread (the slots fan right by +26% over 0.19 s on softLand) first; the outgoing word squashes away in place at the expanded positions (0.83 to 1.02 s), no slide, no fade; the new glyphs arrive violet and darken left to right.
- Word inside a line: swap per letter at 3.42, 3.46, 3.54, 3.63 s, each blurring and dropping 0.03 H for 2 frames, the new glyph arriving with the roll.
- Question becomes name: TWO independent soft masks, the erase front running left to right about 0.1 s ahead of the reveal front, a 25 to 45 px leading edge, the wordmark revealed in place and the mark sliding back over the text as the name's tail. Never a crossfade.
- Ring of letters becomes a title: scramble, hard-switch to exactly the glyph count, two glyphs start at +-90 degrees and unwind over 0.30 s on softLand, no elastic.
- Backspace: one letter per 2 frames right to left; the remaining letters do not re-centre. Survivor: every word leaves except the one that stays and scales.

## How to build it

Per-glyph spans with transform-origin at the baseline hairline; per-glyph M.snap-like steps on a frame table (scaleY 1 -> 0.02 in 3 frames, 0.02 -> 1 in 6 to 8 frames); colour via RasanMotion.mix in OKLab for the violet ramp; masks as two clip-paths whose fronts are linear functions of time.

## What makes a cheap imitation

- A crossfade or a typewriter backspace on a centred line (the survivors slide).
- Every glyph on one frame: the left-to-right sweep IS the readable mechanism.

## Sources

- motionmaxxing `references/type.md` sections 5, 6 and 9 and `close.md` C6 (Apache-2.0, Tejas Makwana), restated in our words.
