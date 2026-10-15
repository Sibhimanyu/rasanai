# Scale dive: one camera through levels of a world

A scale dive carries the viewer from the whole to the smallest part (a year, then one day, then one half hour, then a slot) or the reverse, with no cut: each level lives inside the one before. It is the route when the story is "inside there is a place for you" and the carry is containment, not an object or a cause. The idea comes from onetake-style continuous-camera films (PolyForm Noncommercial: ideas only, everything here is our own code and words).

## When to use it

- The subject nests: calendar -> day -> gap -> block; city -> street -> window -> screen; a document -> a page -> a line -> a word; a table -> a row -> a cell.
- The payoff is at the bottom of the dive (what you find there is also what makes the whole: the yellow slot found at 300x is the yellow the year ends in).
- Not for a product that has no honest nesting (a dive into nothing is a zoom transition).

## The five rules

1. **Aim at a screen position and the LOG of the zoom, not a world position.** A camera spring in world space swings a frame-width for every pixel of lag at 300x; the same spring in screen space lags and settles the same at any scale. `M.scaleDive` does this: the zoom is exponential in time (constant octaves per second), the anchor point of the world stays under a chosen screen point, and that screen point may travel linearly to the centre (`screenTo`).
2. **Ease only the ends.** The log zoom runs at a constant rate in the middle (a dive that eases mid-way reads as a drift, not a fall); a short ease in and out of `ends` (default 0.12 of the run) lands without a jolt. A single constant-octave plunge (about 9 frames at x1.6 a frame, no ease) is `M.dive`.
3. **Each level is drawn in its own units.** A day is a 1440 px page placed in a 24 px cell, type set at normal sizes, so text stays crisp at any zoom. Never scale a bitmap past its natural size (asset preflight).
4. **Detail fades in by on-screen size, not by time.** A level is drawn only while its on-screen width is in a useful range: it fades in between about 0.04 and 0.08 of the frame width and out between 3 and 6 widths (`M.scaleDive` `levels: [{ el, size }]`, `appear`, `leave`). Typical: a day's hours appear over a cell of 70 to 260 px, titles over 380 to 700 px, a minute ruler over 2,600 to 5,000 px; neighbours' text steps back to 25% at the deepest level. The year never draws 364 pages.
5. **Time on both ends of a big step.** A 3.8-log-unit jump (1x to 44x) needs at least 0.9 s; if the framing must hold at the bottom, give the dive its full duration and hold dead still there. When the subject is not at one fixed anchor, re-aim the anchor to the subject: the residual error must shrink as the zoom grows.

## Numbers from the cases

- Dive 1 (year to day): 1 -> 40x in about 1.8 s; a scan along the day at 40 -> 46x; a held breath at 46 -> 50x; dive 2 (day to half hour): 50 -> 300x in 1.4 s; inside, dead still at 300x for about 2 s; then a whip back out to 1x.
- Blur and glow that must be a constant size on screen are divided by the zoom (the CSS px of an element under `scale(z)` is multiplied by z): `blur_px_screen / z`. At high DPR the render surface needs DPR x zoom of resolution; draw a level into a canvas only while its size on screen is within what it needs.
- The film's sound follows the picture: the camera's speed (the derivative of log zoom) drives the air under the dive (about its 1.3 power), and its depth the brightness; hold silences around the one landing.

## Build

```js
var M = RasanMotion.kit(tl, { seed: "film/05" });
M.scaleDive("#world", { at: 1.8, dur: 1.8, from: 1, to: 40, anchor: [wx, wy], screen: [W * 0.62, H * 0.5], screenTo: [W / 2, H / 2],
  levels: [{ el: "#year", size: 1560 }, { el: "#day", size: 24 }, { el: "#slot", size: 0.4 }] });
```

Test: render the whole path at three zooms (1x, 40x, 300x) and check every level's text is crisp and no level draws below its appear size. Pair with `references/cinematography.md` (the camera in 3D) and `library/motion/closes/close-c7-dive-into-logo.md` for the constant-octave logo dive.
