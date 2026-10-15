---
id: "type-acts-out-the-word"
name: "Type that acts out the word"
space: "2d"
family: "kinetic-type"
references: ["motionmaxxing type and close catalogues, measured from finished launch and product films (Apache-2.0), numbers re-stated in our words"]
timing: {"frame_rate": "30 fps", "holds_ms": [600, 1400], "durations_ms": {"act": [200, 700], "word_gap_frames": [2, 12]}, "note": "measured: words land 2 to 12 frames apart; the act itself is one gesture of 0.2 to 0.7 s"}
eases: {"key": "softLand for the settle of the acting word, crashOut into a cut", "notes": "the same clock as the rest of the film"}
camera: {"lens_mm": [50, 85], "moves": ["locked-off; the type is the thing that moves"], "rules": ["use the film's one motion grammar and clock so the performance looks like one hand", "spend it on the one or two words that matter"]}
recipe_2d: "Pick the ONE or TWO words of the film whose meaning has a physical form and build the form on the type itself (CSS letter-spacing, a clip-path bar, a transform on a single span), on the same eases and frame clock as every other move. Everything else stays plain."
recipe_3d: "Rasan3D: type stays DOM above the 3D layer (crisp, per 3d.md section 7); the devices and numbers above apply to that 2D layer."
pitfalls: ["acting out every line (the importance budget: at most a quarter of beats are the point)", "a different gimmick per word, so there is no film grammar", "a metaphor image where a measure would do (a counted or watched quantity is believed; a bigger number is not)"]
instruct: {"all": "Name the key word, what it physically does, its frame timing, and which other words stay still.", "claude": "Claude sets every line with the same entrance and highlights nothing. Ask which ONE word acts and what it physically does.", "gpt": "GPT models decorate with glow, underline or gradient. Forbid those and give the device by metaphor."}
verified: {"sources_fetched": 1, "non_wikipedia": 1, "colours": "n/a", "colour_images": [], "grid": "n/a", "timings": "measured", "recipes": "proposed", "edited": "2026-10-15"}
sources: ["https://github.com/Tejashmakwana/motionmaxxing/blob/main/references/type.md", "https://github.com/Tejashmakwana/motionmaxxing/blob/main/references/close.md"]
---

## What it is

The idea: a key word that has a physical meaning does that thing to itself, so the viewer understands before they finish reading it. A word that does what it says needs no explanation and cannot be mistaken for a slide. The craft is choosing the one or two words per film, not animating many.

## The defining traits (numbers)

- Physical words: a bar slices "splitting" in two; "with leverage" widens its own letter-spacing; "more expensive" tightens; "heavier" sags under a weight; a word too big for the frame makes the camera pan across it to read it.
- Leaving words: in "we draw attention to something important", every word leaves except "important", which stays and scales.
- The product acts INSIDE the sentence: a toggle replaces the verb "complete" and flips to DONE; a prompt box opens in the gap between two words; a cursor drags a misplaced word into place.
- Abstract nouns (a number of users, privacy, speed, "the top 1%") become an object or quantity the viewer can count or watch: a hundred identical dots with all dimming but one; a coin scanned into a ghost of dots; a grid of hundreds that keeps flowing past.
- A claim that is a consequence is shown as the consequence (a line crosses a threshold and a notification fires), not written large.
- A centred statement paces to speech and keeps its position fixed; a second visual voice (the product, an object, a cursor) moves behind or beside it. Scale is intonation: the smallest line can be the aside, the biggest is the word that would be said loudest; spend the giant size once and let the ending get smaller.

## How to build it

One span per acting word; the act is one gesture (a clip-path bar, a letter-spacing tween, a scale, a translate) of 0.2 to 0.7 s landing on a beat. Words around it hold still. Keep to one word per line and at most a quarter of the film's beats.

## What makes a cheap imitation

- Every word gets a wiggle; the act is decorative, not the meaning.
- A title, a sub-line and a kicker on every beat (centred line after centred line on a flat ground is a slide deck).
- A glow, underline or gradient on the key word instead of an act.

## Sources

- motionmaxxing `references/type.md` sections 0.1 and 0.2 (Apache-2.0, Tejas Makwana; credit in `third_party/motionmaxxing/README.md`), restated in our words.
