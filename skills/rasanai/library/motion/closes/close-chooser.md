---
id: "close-chooser"
name: "Choose a close: brand personality to close, and the hold rules"
space: "2d"
family: "closes"
references: ["motionmaxxing close catalogue: measured from 53 finished endings (Apache-2.0), restated in our words"]
timing: {"frame_rate":"30 fps","holds_ms":[600,1400],"durations_ms":{"resolved_hold":[600,1400],"cta_beat_share_of_film_max_pct":[25,25]},"note":"the gate: resolved end-card hold 0.6 to 1.4 s; the whole CTA beat at most a quarter of the film; something alive for the whole hold"}
eases: {"key":"snapSettle, softLand, gentleIn, accelExit","notes":"an arrival decelerates; the ending is smaller than the climax"}
camera: {"lens_mm":[50,85],"moves":["locked-off 2D"],"rules":["one close per film (a UI act followed by one build or sign-off is the only pairing seen)","start from the film's idea; the table is a menu of signatures, and a close picked from a menu is a default"]}
recipe_2d: "Start from the idea: the mark's job in the film (the button, the toggle, the result, a word in the sentence) often IS the close and needs no table row. Otherwise pick by personality from the table, use ONE close, give the resolved lockup 0.6 to 1.4 s with something alive in it, keep the whole CTA beat at or under 25% of the film, and end mid-motion or on a one-frame placeholder rather than fading out."
recipe_3d: "Rasan3D: the close is DOM above the 3D layer; the 3D hero may do the last camera move under it."
pitfalls: ["a resolved hold of 3 to 5 s with only a slow contraction (dead air)","a fade-out by default (end mid-motion, on a one-frame placeholder, or on a hard cut; a calm brand may end calmly after sustained motion)","a logo plus a Download pill plus a cursor (a web footer with a cursor)","more than one tagline (at most one line, 0.05 H, light grey, under the name)","the logo scaled up from zero or faded up"]
instruct: {"all":"State the chosen close by id, its hold in seconds, what is alive during it, and the frame the film ends on.","claude":"Claude fades the logo up with a bounce, adds a tagline and holds it 3 to 5 s. Give the close id and the scale track.","gpt":"GPT models add a gradient glow and a Get started button. Forbid both."}
verified: {"sources_fetched":1,"non_wikipedia":1,"colours":"n/a","colour_images":[],"grid":"n/a","timings":"measured","recipes":"proposed","edited":"2026-10-15"}
sources: ["https://github.com/Tejashmakwana/motionmaxxing/blob/main/references/close.md"]
---

## What it is

The chooser for the ten closes (`close-c1-...` to `close-c10-...`) and the universal rules that every close obeys. The numbers are measured from finished films; the gate is ours.

## The defining traits (numbers)

| Brand personality | Pick | Why | Energy | Hold | Avoid |
|---|---|---|---|---|---|
| Technical, infrastructure, data | C5 mosaic or pixel resolve with a motif wipe; or C7 dive | the mark is made of the scene's own texture; alive hold | medium, building | 0.7 to 1.4 s alive | gradient glows, fades |
| Developer, AI tool | C9 typed prompt cut before send; or C7 dive into the logo | the viewer's action is the CTA; no logo needed | low to medium, precise | 0 to 0.5 s | showing the result, a tagline |
| Playful, consumer | C10 character-built lockup; or C8 button click cut before release | the character carries the build; the click feels real | medium, lively, no overshoot | 1.0 s with sweeps | static hold, rainbow gradients |
| Premium, dark | C1 wordmark crash with radial streaks | weight and arrival; an inverted ground | high, then a long creep | 1.2 to 1.4 s | tagline, bounce |
| Quiet, editorial, enterprise | C3 emblem blur-down with typed name; or C2 bar-built mark | restraint; slow reveal | low | 0.67 s static then the outro | glow, particles |
| Rebrand, "from X to Y" | C6 per-glyph morph with icon spin | both names visible from one lockup | high, 1.05 s | 0 s | crossfade |
| Minimalist consumer (a pure shape icon) | C4 icon on white | large start settling for 2.5 s | low | 0.5 s static | wordmark, tagline |

Universal rules, each with the measured reason:

- Resolved lockup hold 0.6 to 1.4 s (HARD): a mark registers in about 0.5 s and a name in about 1 s; the rest is the viewer waiting. The whole CTA beat is at most 25% of the film (4 s of 16). If the film runs long, add a proof beat or a second CTA action, never more logo time.
- Something stays alive for the whole hold: a creeping scale (1.008 -> 1.001 over 2 s), an accelerating contraction in the last 0.2 s, a flame sway of +-1% W, a sweep on a fixed period (0.708 s), a flicker in the glow, a one-frame glitch on the top half only. The one allowed static hold is 0.5 to 0.67 s after a settle.
- The mark arrives large (1.5 to 3.75x) and comes down, never up from zero or faded up; a calm brand may arrive at 1.1x on a long ease. The rule is that it decelerates in.
- Size a lockup per layout: wordmark ink 0.22 to 0.38 W (modal 0.27 to 0.28), icon 0.05 to 0.14 W, gap 0.02 to 0.06 W, centred at y 0.50, about 95% of the frame empty. At most one tagline.
- Do not fade the lockup out by default. If you must reach black, fade ONLY the last text phrase (linear 10 frames), hold one fully black frame, then build the lockup.
- Light ground: flip to a dark sign-off on the cut; last act dark or glowing: flip to flat white; character-built lockup: pure black. These are options, not a recipe; follow the brand's own surface, never a gradient crossfade.
- Plan scenes that shorten, then let the last linger (tagline 1.7 s -> phrase 1.5 s -> icon 0.8 s -> wordmark 1.44 s), linked by hard cuts, no hold over 0.5 s before the last scene.
- When the audio carries the name, complete the wordmark reveal 0.16 s before it is spoken.

## How to build it

See the individual close entries for scale tracks and recipes in RasanMotion verbs (M.snap, M.dive, M.smear).

## What makes a cheap imitation

- The AI-default ending: a fade-up with a bounce, a tagline, a gradient glow and a 3 to 5 s hold.
- Always ending with the carrier dot becoming the logo's dot, or a lockup built from the motif (C2 only when it is this brand's idea).
- Starting every logo at 3.5x because "start big": spend scale once.

## Sources

- motionmaxxing `references/close.md` (Apache-2.0, Tejas Makwana; credit in `third_party/motionmaxxing/README.md`).
