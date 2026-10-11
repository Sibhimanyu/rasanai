# The shape kit: RasanShape

Core GSAP moves boxes: position, scale, opacity, rotation. The reference films (the Eye intro, the Lilium specimen, the pixel manifesto) move **shapes**: an `a` turns into an `o`, a round pupil narrows to a slit, a signature draws itself, ink smears the frame, a photo breaks into pixels, letters scatter and land as LOVE. That is shape-level motion, and it needs a small kit on top of GSAP. `RasanShape` is that kit: one browser file, no build step, deterministic and seek-safe, driven by the scene's own paused GSAP timeline.

## Installing and checking

```bash
node "$SKILL_DIR/scripts/shape.mjs" install --project videos/<name>     # writes assets/rasan-shape/rasan-shape.js and its vendored flubber (MIT)
node "$SKILL_DIR/scripts/shape.mjs" check   --project videos/<name>     # the runtime is present when a composition calls RasanShape
node "$SKILL_DIR/scripts/shape.mjs" demo    --out <dir>                 # a test page exercising every function, rendered headlessly to a strip
```

`video.mjs inject` installs the runtime when a composition references `RasanShape`, so the usual path needs no step. Load it before the scene's script:

```html
<script src="../../assets/rasan-shape/rasan-shape.js"></script>   <!-- relative to the composition; defines window.RasanShape -->
```

## The one rule: the paused timeline drives everything

Every function takes the scene's `tl` (a **paused** GSAP timeline) and an `at` time on it, and adds tweens or time-addressed callbacks to that timeline. Nothing runs on its own clock, nothing uses `Math.random`, `Date.now` or `requestAnimationFrame`, and every state is a pure function of the timeline's time. So the same time always renders the same pixels, scrubbing backwards works, and HyperFrames renders it frame by frame. If you find yourself writing a `setInterval`, a CSS animation or a loop that advances a variable, stop: put it on `tl`. Randomness comes only from a `seed`.

```js
const tl = gsap.timeline({ paused: true });
window.__timelines = window.__timelines || {};
window.__timelines["scene-3"] = tl;           // as the composition contract says
```

## The API

All options are optional unless shown. `at` is seconds on `tl`; `ease` is a GSAP ease name.

### `RasanShape.morph(tl, pathEl, toD, {at, duration, ease, maxSegmentLength})`
Morphs an SVG `<path>`'s `d` into the path data `toD` through flubber interpolators sampled by the timeline's progress. Different point counts and open or closed shapes are fine; `maxSegmentLength` (px, default 10) sets how finely the shapes are sampled (smaller is smoother and heavier).

```js
RasanShape.morph(tl, document.querySelector("#a"), "M60 20 C 90 20 100 50 100 80 ...", { at: 1.2, duration: 0.45, ease: "power2.inOut", maxSegmentLength: 4 });
```

### `RasanShape.drawOn(tl, svgOrPaths, {at, duration, stagger, ease, reverse})`
Stroke draw-on (or draw-off with `reverse: true`) with dash offsets. Pass an `<svg>` (every stroked path in document order) or an array of paths. `stagger` is the delay between strokes, so a handwritten word draws stroke by stroke.

```js
RasanShape.drawOn(tl, document.querySelector("#signature"), { at: 4.0, duration: 1.2, stagger: 0.05, ease: "power1.inOut" });
```

### `RasanShape.followPath(tl, el, pathEl, {at, duration, ease, rotate})`
Moves `el` along an SVG path with `getPointAtLength`; `rotate: true` turns the element to the path's tangent. The path is the motion, so a hidden path with `fill: none` is enough. Use it for the pen tip, a ball's arc, a cursor.

```js
RasanShape.followPath(tl, document.querySelector("#ball"), document.querySelector("#arc"), { at: 3.0, duration: 0.8, ease: "power1.inOut" });
```

### `RasanShape.split(el, {by: "chars"|"words"|"lines"})`
Splits an element's text into spans that **keep layout** (same wrapping and spacing, inline-block spans) and returns them. Keep the line readable at rest: every span is back in place when the scatter is not running.

```js
const chars = RasanShape.split(document.querySelector("#love"), { by: "chars" });
```

### `RasanShape.scatter(tl, spans, {at, from, seed, settle})`
Deterministic letter (or icon) scatter and settle. `from: "random-seeded"` gives each span a seeded random vector and spin; `from: "radius"` throws them outward from the element's centre. They fly apart and come to rest over `settle` seconds as scattered pieces.

```js
RasanShape.scatter(tl, chars, { at: 18.0, from: "random-seeded", seed: 7, settle: 0.6 });
```

### `RasanShape.ink(tl, el, {at, duration, mode: "smear"|"blot"|"wipe"})`
Ink and liquid transitions: an SVG `feTurbulence` plus `feDisplacementMap` filter whose seeded parameters (`baseFrequency`, `scale`) are animated by the timeline. `smear` drags the frame sideways like a wet brush, `blot` spreads a stain outward, `wipe` is a hard ink edge. Put it on a full-frame layer (an ink cut-out or a black div) and the incoming scene sits underneath.

```js
RasanShape.ink(tl, document.querySelector("#ink"), { at: 6.2, duration: 0.6, mode: "smear" });
```

### `RasanShape.dissolve(tl, imgOrCanvas, {at, duration, mode: "pixel"|"halftone"|"dither", cell})`
Image to pixels, halftone dots or ordered dither, on a canvas, quantised by the timeline so it is deterministic. `cell` is the block size in px. It dissolves a layer **out**; the next object enters under it with an ordinary tween (scale and opacity) as the cells clear. Always decode the image first (a loaded `<img>` or one painted to canvas before the timeline is built).

```js
RasanShape.dissolve(tl, document.querySelector("#hand"), { at: 14.4, duration: 0.7, mode: "pixel", cell: 16 });
```

### `RasanShape.squash(tl, el, {at, duration, amount, axis})` and `RasanShape.smear(tl, el, {at, frames, direction, length})`
`squash` is squash and stretch with volume kept: `amount` 0.1 to 0.25, `axis` `"x"|"y"` the axis it compresses along, then a rebound with a 3 to 8% overshoot. `smear` adds a stretched, blurred copy of `el` for `frames` (1 to 3) frames on a fast move, along `direction` (degrees, or `"x"`/`"y"`) for `length` px. Both belong with the `character` motion language.

```js
RasanShape.squash(tl, ball, { at: 3.8, duration: 0.3, amount: 0.18, axis: "y" });
RasanShape.smear(tl, ball, { at: 3.55, frames: 2, direction: 90, length: 60 });
```

### `RasanShape.stepped(tl, {fps: 12|8})`
Steps the scene on twos (12 fps) or threes (8 fps): the timeline's time is quantised for the scene, so pixel art and hand-drawn motion read as animated at a frame rate rather than interpolated. Call it once per scene, **after** the tweens are added. Keep type and the camera smooth on a second timeline (the scene's other layers), or they will chatter.

```js
RasanShape.stepped(tl, { fps: 12 });
```

## Recipes for the reference clips' signature moves

Each is a recipe on the paused timeline; times are relative to the beat.

**A letter turns into another (the `a` to `o`).** Both glyphs as SVG paths from one font (opentype outline, or `art.mjs trace` of the letter). `morph` with `maxSegmentLength: 4` and a small squash on the way, so it reads as a rewrite rather than a crossfade:
```js
RasanShape.squash(tl, a, { at: 1.1, duration: 0.2, amount: 0.1, axis: "x" });
RasanShape.morph(tl, a, O_D, { at: 1.2, duration: 0.45, ease: "power2.inOut", maxSegmentLength: 4 });
```

**The pupil goes round to slit.** The eye is a drawn SVG (see the art director's `illustration`). Pupil path morphs to the slit; fibres in the iris draw on; the highlight lags 0.08 s; a blink is a clip-path `ry` 1 to 0.05 to 1:
```js
RasanShape.morph(tl, pupil, SLIT_D, { at: 4.2, duration: 0.4, ease: "power3.inOut" });
RasanShape.drawOn(tl, iris, { at: 4.0, duration: 0.6, stagger: 0.01 });
tl.to(highlight, { x: 6, y: -4, duration: 0.4, ease: "power3.inOut" }, 4.28);
```

**The signature draws itself.** `art.mjs hand --text "Tiago" --out art/assets/sig.svg` gives one path per stroke in order. Draw it on and let a pen tip run ahead on a hidden head path:
```js
RasanShape.drawOn(tl, sig, { at: 9.0, duration: 1.2, stagger: 0.04, ease: "power1.inOut" });
RasanShape.followPath(tl, pen, sigHeadPath, { at: 9.0, duration: 1.2, ease: "power1.inOut" });
```

**An ink smear is the transition.** A full-frame ink layer smears across while the next scene is already under it; the outgoing content smears and scales 1.04 as it is struck:
```js
RasanShape.ink(tl, ink, { at: 6.2, duration: 0.5, mode: "smear" });
RasanShape.smear(tl, outgoing, { at: 6.2, frames: 2, direction: "x", length: 80 });
```

**A pixel dissolve.** The graded cut-out breaks into big pixels; the next object lands as the cells clear:
```js
RasanShape.dissolve(tl, hand, { at: 14.4, duration: 0.7, mode: "pixel", cell: 24 });
tl.from(nextMark, { scale: 0.9, opacity: 0, duration: 0.5, ease: "back.out(1.4)" }, 14.7);
```

**Letters scatter, then LOVE is spelled by objects.** Split by chars; scatter and settle; an icon takes each letter slot in turn, then the real glyph replaces it:
```js
const L = RasanShape.split(word, { by: "chars" });
RasanShape.scatter(tl, L, { at: 18.0, from: "random-seeded", seed: 7, settle: 0.6 });
slots.forEach((slot, i) => { tl.set(slot.icon, { autoAlpha: 1 }, 16.0 + i * 0.3); tl.set(slot.icon, { autoAlpha: 0 }, 16.25 + i * 0.3); tl.set(L[i], { autoAlpha: 1 }, 16.25 + i * 0.3); });
```

**A callout box with a connector line.** The box lands with a small overshoot, its label types on, and the connector draws from the box to the point on the specimen:
```js
tl.from(box, { scale: 0.9, opacity: 0, duration: 0.4, ease: "back.out(1.4)" }, 2.0);
RasanShape.drawOn(tl, connector, { at: 2.25, duration: 0.7, ease: "power2.inOut" });
```

**An image inside the letters.** The photo sits in a div masked by the word (CSS `mask-image` of an SVG text, or `clip-path` from the glyph paths) and moves a little behind it; the letters arrive by `split`:
```js
const chars = RasanShape.split(word, { by: "chars" });
tl.from(chars, { y: 24, opacity: 0, duration: 0.5, stagger: 0.04, ease: "back.out(1.4)" }, 1.0);
tl.fromTo(photo, { scale: 1.08, xPercent: -3 }, { scale: 1, xPercent: 3, duration: 1.6, ease: "power1.inOut" }, 1.0);
```

## Checklist before you hand back

- Every `RasanShape` call is on a paused `tl` and nothing else animates the scene. Scrubbing to 3.2 s and back gives the same frame.
- Path morphs have both states from one master drawing, so the interpolation reads as a deformation; stroke widths are set in the SVG, not scaled by CSS (a scaled stroke changes the draw-on length).
- `dissolve` images are decoded before the timeline is built; `ink` layers are full-frame and sit above the incoming scene only for the transition.
- `stepped` is applied once, last, and only to the layers that should be stepped.
- Eases follow `motion.md` (the `character` language allows `back.out`, a small `elastic.out` and stepped eases; nothing else bounces). Words stay readable at rest.
- Look at a 24 fps strip of every hero move (`crew.mjs strip --fps 24 --from <t0> --to <t1>`): the morph's in-betweens are where it fails, and a 2 fps sheet cannot show them.
