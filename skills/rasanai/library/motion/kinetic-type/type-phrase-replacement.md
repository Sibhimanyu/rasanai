---
id: "type-phrase-replacement"
name: "Phrase replacement: exits faster than entries, no dead frame"
space: "2d"
family: "kinetic-type"
references: ["motionmaxxing type and close catalogues, measured from finished launch and product films (Apache-2.0), numbers re-stated in our words"]
timing: {"frame_rate": "30 fps", "holds_ms": [0, 0], "durations_ms": {"exit_per_word": [100, 130], "entry_gap": [60, 100], "entry_settle": [500, 500], "overlap_frames": [2, 2]}, "note": "measured: exit one word per frame each 3 to 4 frames, entries 2 to 3 frames apart settling over about 15 frames"}
eases: {"key": "accelExit for leaving, softLand for arriving", "notes": "hard swap when the cut is the beat"}
camera: {"lens_mm": [50, 85], "moves": ["locked-off; the type is the thing that moves"], "rules": ["use the film's one motion grammar and clock so the performance looks like one hand", "spend it on the one or two words that matter"]}
recipe_2d: "When one phrase replaces another, exit faster than you enter and overlap by about 2 frames. Pick the exit from the table by the line's job."
recipe_3d: "Rasan3D: type stays DOM above the 3D layer (crisp, per 3d.md section 7); the devices and numbers above apply to that 2D layer."
pitfalls: ["fade-out then fade-in with an empty frame between", "exits as slow as entries", "fading a word with no outward motion or replacing icon"]
instruct: {"all": "Give the exit type from the table, the frame per word, and the overlap.", "claude": "Claude sets every line with the same entrance and highlights nothing. Ask which ONE word acts and what it physically does.", "gpt": "GPT models decorate with glow, underline or gradient. Forbid those and give the device by metaphor."}
verified: {"sources_fetched": 1, "non_wikipedia": 1, "colours": "n/a", "colour_images": [], "grid": "n/a", "timings": "measured", "recipes": "proposed", "edited": "2026-10-15"}
sources: ["https://github.com/Tejashmakwana/motionmaxxing/blob/main/references/type.md", "https://github.com/Tejashmakwana/motionmaxxing/blob/main/references/close.md"]
---

## What it is

The way a line leaves matters as much as how the next arrives. Exits are faster than entries and overlap them, so the eye keeps its reading momentum.

## The defining traits (numbers)

- Exit one word per frame, each 3 to 4 frames (up 0.07 H, fading to a light grey); entries 2 to 3 frames apart settling over about 15 frames; the next phrase begins about 2 frames before the last exit ends.
- Backspace metaphor: drop the leading words in single frames WITHOUT re-centring the survivors, then add the new words to the right.
- A phrase that ends a thought: hard-swap in ONE frame (the cut is the beat), often after a wind-up.

| Exit | Numbers | When |
|---|---|---|
| Hard vanish in steps | words 2 frames apart | short phrase, crisp grammar |
| Clip-edge wipe | a clip edge sweeps left to right through the glyphs (cutting mid-glyph) while the group slides the same way, 5 frames, accelerating | removing a typed line |
| Wind-up then hard replace | nudge right 0 -> 95 px (7.4% W), scaleX 1 -> .923, last 8 frames accelerating 13.7 -> 95 px per frame, 24 px smear, replace on the next frame | a line pulled out before the cut |
| Shrink into centre | .55 W -> .28 W -> gone in 0.24 s | oversize or central words |
| Centre-outward mask wipe | first word erases from its right, second from its left | two-part phrase |
| Staged left-to-right fade | 4 to 5 frames per word, blur up to 8 px on the last two, 0.56 s total | a phrase before a number |
| Drift up + fade | line drifts up 26 to 42 px accelerating, line 1 fades, line 2 stays | a claim line before a hard end |
| Fade to black (last phrase only) | linear 10 frames, one fully black frame | before a character-built lockup |

- If you must fade a word, pair the fade with outward motion or a replacing icon (90% -> 5% over 9 frames while phrases push out and badges grow): the eye tracks an object instead of seeing a gap.

## How to build it

Per-word spans on a frame table; exits on accelExit, a 24 px smear on the wind-up (RasanMotion M.smear with peak last). One blur grammar per film.

## What makes a cheap imitation

- A cross-dissolve of two stacked lines; a stagger with equal gaps (a metronome).

## Sources

- motionmaxxing `references/type.md` section 5 and `transitions.md` T19 (Apache-2.0, Tejas Makwana), restated in our words.
