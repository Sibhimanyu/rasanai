---
id: "close-c2-built-from-parts"
name: "C2 Logo built from parts"
space: "2d"
family: "closes"
references: ["motionmaxxing close catalogue: measured from 53 finished endings of launch and product films (Apache-2.0), numbers re-stated in our words"]
timing: {"frame_rate": "30 fps (frame counts as measured; the source clips ran 24 to 60 fps and are converted)", "holds_ms": [600, 1200], "note": "measured resolved-hold range; the gate for any film is 0.6 to 1.4 s unless the close is a motion that ends mid-move (hold 0). medium energy"}
eases: {"key": "snapSettle, cruise (RasanMotion measured eases)", "notes": "an arrival decelerates; every close is one beat, usually smaller than the climax before it"}
camera: {"lens_mm": [50, 85], "moves": ["locked-off 2D; the scale of the mark is the move"], "rules": ["the mark is the last thing; at most one tagline", "a hard cut into the close, no crossfade"]}
recipe_2d: "Per-part M.snap steps one frame apart (each part's tail 3 to 6 frames); a one-frame solid is a RasanUI.step / G.set of fill on the exact frame; glyph-per-frame via a per-glyph M.snap with opacity 0 -> 1 over 5 frames and a letter-spacing tween from +20 to -3 px."
recipe_3d: "Rasan3D: keep the mark as DOM above the 3D layer (crisp, per 3d.md); the scale track and holds above apply to the 2D layer; the 3D hero may do the last camera move under it."
pitfalls: ["'The lockup is built from the film's motif' and 'a small dot becomes the logo's dot' appear in nearly every AI direction, so a film that ends this way by default reads as one designer's reel in a new colourway", "Choose it only when the brand's own mark really is made of repeated parts", "Otherwise the logo arrives by cause (a click, a result, a camera move, the end of a motion)", "a resolved hold over 1.4 s (the CTA beat stays at or under 25% of the film)", "a static logo with nothing alive in the hold"]
instruct: {"all": "Give the entry scale track with frame counts, the hold in seconds, what stays alive during it, and what precedes it. State that the mark never scales from zero.", "claude": "Claude tends to fade the logo up with a bounce plus a tagline and hold it 3 to 5 s. Ask for the scale track by frame and the hold by seconds.", "gpt": "GPT models tend to write a gradient glow and a 'Get started' pill. Forbid both and give the numbers."}
verified: {"sources_fetched": 1, "non_wikipedia": 1, "colours": "n/a", "colour_images": [], "grid": "n/a", "timings": "measured", "recipes": "proposed", "edited": "2026-10-15"}
sources: ["https://github.com/Tejashmakwana/motionmaxxing/blob/main/references/close.md"]
---
## What it is

C2 Logo built from parts. When to use it: A mark made of simple geometry (stems, bars, a line that hollows) for developer, enterprise or playful brands that want a constructed feel, and only when the build IS the brand's idea.

Brand personalities it suits: developer, enterprise, playful, geometric mark. Avoid: a logo that assembles from particles or confetti. Seen in: three measured builds.

## The defining traits (numbers)

- Entry: The mark is assembled in discrete steps, never scaled from zero and never typed. Three measured builds: five rectangles (three stems with gaps and two blocks under the gaps; the mark is about 0.11 W wide) over 7 frames; a 1 px line growing symmetrically from the centre (12 -> 265 px over 0.5 s in alternating big and small steps) that unsquashes in 8 discrete steps into a hollow outline, holds hollow 0.12 s and turns SOLID in one frame; and 12 bars (6 pale back bars left to right, 6 gradient front bars right to left) with a wordmark that appears one glyph per frame while tracking collapses from +20 to -3 px.
- Track: Stems: one blue stem with a wide haze, then three cyan stems with a bloom, then the lower blocks appear, then the stems turn black one by one (frames 1.50 to 1.57 s), haze gone. Line to solid: line 0.5 s, unsquash 0.33 s in steps (0, .13, .23, .55, .62, .85, .91, .98, 1), hollow 0.12 s, solid in ONE frame, settle to 0.22 W in 0.4 s.
- Alive during the hold: The mark never holds still: a 0.11 -> 0.10 W creep over 0.7 s then a faster shrink (0.07 W in 0.16 s with 2 px blur), or a lockup shrinking 1.0 -> 0.835 over 0.8 s, accelerating, then a hard cut to the next UI.
- Before it: A UI that breathes or a scene whose motif is the same repeated part; the resolved lockup holds 0.6 to 1.2 s.
- Hold: 0.6 to 1.2 s resolved. Universal rules for every close: resolved hold 0.6 to 1.4 s (a mark registers in about 0.5 s, a name in about 1 s); something stays alive for the whole hold: a creep, a sweep, a sway, a flicker (a static logo reads as a slide); the mark never scales up from zero and never fades up: it arrives oversized (1.5 to 3.75x) or in discrete steps and decelerates in.

## How to build it

Per-part M.snap steps one frame apart (each part's tail 3 to 6 frames); a one-frame solid is a RasanUI.step / G.set of fill on the exact frame; glyph-per-frame via a per-glyph M.snap with opacity 0 -> 1 over 5 frames and a letter-spacing tween from +20 to -3 px.

Frames are at 30 fps; at another rate, keep the SECONDS and recompute the frame counts. Use the film's own ground: an inverted dark or white ground on the cut is an option, not a recipe (follow the brand's own surface).

## What makes a cheap imitation

- 'The lockup is built from the film's motif' and 'a small dot becomes the logo's dot' appear in nearly every AI direction, so a film that ends this way by default reads as one designer's reel in a new colourway
- Choose it only when the brand's own mark really is made of repeated parts
- Otherwise the logo arrives by cause (a click, a result, a camera move, the end of a motion)
- A fade-out, a glow on every layer, a tagline plus a URL plus a button, or a hold of 3 to 5 s with only a slow contraction (it reads as dead air).

## Sources

- motionmaxxing `references/close.md` (Apache-2.0, Tejas Makwana; credit row in `third_party/motionmaxxing/README.md`): numbers re-stated in our words.
