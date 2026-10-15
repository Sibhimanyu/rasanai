# UI rebuild kit (RasanUI)

A launch film shows the real product, redrawn for video: one captured screen rebuilt as DOM in the film's own look, magnified until it reads, with a cursor that behaves like a person's. `RasanUI` (`runtime/rasan-ui.js`) is that kit. It is one browser file with no build step, deterministic and seek-safe on the scene's paused GSAP timeline, and it draws the parts that make "real product" read and the generic "vibe-coded card" impossible to write. Adapted in part from motionmaxxing (Apache-2.0, Tejas Makwana), `runtime/native-ui`; see `third_party/` for the licence.

```
node "$SKILL_DIR/scripts/uikit.mjs" install --project videos/<name>     # assets/rasan-ui/ (video.mjs inject does it when a composition names RasanUI)
node "$SKILL_DIR/scripts/uikit.mjs" check   --project videos/<name>     # runtime installed and loaded after GSAP, no clocks or timers, finish() called, captured marker
```

```html
<script src="../../assets/rasan-ui/rasan-ui.js"></script>   <!-- after GSAP; defines window.RasanUI -->
```

## Use it for

A beat whose proof is a piece of the product (a screen, a form, a list, a notification, a thread) and the capture is too small or too static to use as it is (`product-first.md`: captured or faithfully recreated, on screen within 3 s). Rebuild only the one component that moves; keep the product's copy, order and icons from `research/screens.json`. A beat that is only a screenshot with a slow push does not need it.

## The calls

```js
var tl = gsap.timeline({ paused: true });
var U = RasanUI.kit(tl, { tokens: BRAND, W: 1920, H: 1080, seed: "film/04" });
var world = U.world("#world", [{ t: 0, s: 1, fx: 960, fy: 540 }, { t: 3, s: 1.7, fx: 1240, fy: 610, ease: "glide" }]);   // ONE camera group
var app  = U.mount("#world", { name: "Kinso", captured: true, source: "research/screens.json#orders", w: 1180, h: 720, fillW: 0.62 });
U.sidebar(app, { brand: { name: "Kinso", logo: "research/brand/assets/mark.svg" }, items: [{ icon: "inbox", label: "Orders", active: true, count: 12 }] });
var main = U.main(app);
U.header(main, { title: "Orders", sub: "Fulfilment queue", actions: [{ label: "Export" }] });
var q  = U.input(main, { label: "Search orders", placeholder: "Name or order number" });
var go = U.button(main, { label: "Create order", kind: "primary" });
U.list(main, { rows: [{ avatar: "Priya Raman", title: "Priya Raman", sub: "Order 4821 shipped", value: "$48.00" }] });
U.hero(app);                                                   // the one object the proof is about
var cur = U.cursor({ at: 0.3, from: { x: 1700, y: 900 } });    // its own top layer; exactly one
var a = cur.click(q, { at: 1.2 });                             // press-down time; the move arrives `park` frames before it
var t = U.type(q, "Priya Raman", { at: a.end + 0.1, rate: "read" });
cur.click(go, { at: t.end + 0.6, react: "pressed" });          // a hard state step on the frame the target bottoms out
U.step(toggleEl, "data-on", [[4.2, ""]]);                      // any timed hard state: toggles, a "sent" colour
cur.exit({ at: 5.2 });
U.check({ at: [1.0, 2.5, 4.0] });                              // warnings, not silence
U.finish();                                                    // LAST: puts the one clock on the timeline
```

| call | what it does |
|---|---|
| `RasanUI.kit(tl, { tokens, W, H, fps, seed, stage })` | the kit on your paused timeline. `tokens` is the film's captured brand (below). W/H default to the stage's `data-width` / `data-height`. |
| `U.mount(parent, { name, captured, source, w, h, x, y, scale \| fillW })` | a product surface in the brand. `captured: true` needs `source` and writes `data-ui="captured"` (+ `data-ui-source`); without it the surface is `data-ui="invented"`. `fillW: 0.62` scales it to that share of the frame width. |
| `U.main` `sidebar` `header` `panel` `button` `input` `toggle` `chip` `avatar` `row` `list` `table` `tabs` `notification` `message` | the primitives. Every colour, radius, font and space is a token variable. Built-in glyphs: `RasanUI.glyphs` (search, plus, check, arrow, bell, inbox, user, gear, chevron, list, chart, send); real product icons come as `<svg>` html, an image path or one to two letters. |
| `U.cursor({ at, from, size, tone, color, scale, world })` | one cursor on its own top layer. `.move(target, { at \| end, dur, bow, ease })`, `.click(target, { at, park, depth, targetDepth, lag, heavy, react })`, `.exit({ at, to })`. A target is an element or `{x, y}`. |
| `U.type(inputEl, text, { at, rate, hold })` | typing; `rate`: `"recognise"` (82/s), `"read"` (22/s), `"author"` (36/s, default), `"fill"` (70/s) or a number. Throws unless the target came from `U.input`. |
| `U.world(el, keys)` | the camera group. `keys: [{ t, s, fx, fy, ease }]`: at time `t`, world point `(fx, fy)` sits at the frame centre at zoom `s`. The cursor follows it exactly because both are pure functions of time. |
| `U.step(el, attr, [[t, value], ...])` | a hard attribute step (value `null` removes it): toggle flips, a colour step, a "sent" state. |
| `U.hero(el)` `U.read(el)` `U.texture(el)` | mark the proof: the hero fragment, text that must be read, text that is allowed to be texture. Row titles, button labels, header titles, input values, notification and message bodies are `read` already. |
| `U.check({ at, minText, heroW, strict, log })` | the readability check (below). Returns `{ ok, warnings: [{ rule, message }], stats }`; `strict: true` throws. |
| `U.finish()` | registers the clock. Call it last; nothing moves without it. |
| `RasanUI.fitScale({ H, textPx, frac })`, `fillScale({ W, w, fill })` | the build scale that lands a UI font at `frac` of the frame height, or a surface at a share of the width. |

## Brand tokens in, not zinc

`tokens` takes what RasanAI already produces: `{ colors: { canvas, ink, accent, surface?, muted?, border? }, fonts: { display, body, mono? }, radii: { sm, md, lg }, spacing: { base } }` (a `frame.md` / design-system read), or the `roles` / `fonts` / `radii` of `brand.mjs read`. `canvas`, `ink` and `accent` are required and the kit throws without them: there is no neutral fallback palette. `surface`, `muted` and `border` are derived from the brand's own canvas and ink when the capture has none; the on-accent colour is picked by contrast. Missing fonts, radii or spacing fall back and show up as a `tokens-defaulted` warning in `U.check`. Take radii, stroke weight and type from the capture (`research/screens.md`), not from taste.

## The slop tells it will not draw

- **No status-dot label . value cards.** `row` needs a title and an icon, an avatar or a sub line; there is no dot option; `chip` is a plain label.
- **No greeting headers.** "Good morning", "Welcome back", "Hello" and friends throw in any title, label, sub or typed text. Use the product's real title.
- **No placeholder copy.** Lorem ipsum, "John Doe", "Acme", "Project Alpha", "Your Brand Here" throw. Take the words from the capture; an invented item you keep goes in NOTE.md.
- **No identity-free notifications or messages.** A notification needs an icon or app, a title (the sender or subject) and a real sentence.
- **No browser chrome, traffic lights or bezel.** The kit draws none; the surface is flat.

## Cursor and press physics

- The cursor lives on its own layer, the last child of the stage and outside the camera group (`U.world` moves the content; the cursor is mapped through the same pose and scales by its own factor). Exactly one at a time. Tip-anchored; art follows the ground (white arrow with a dark edge on dark, black on pale; `color` for a film that wants the accent).
- Travel is a quadratic arc (a seeded bow, never a ruler line), front-loaded (about 85% of the distance in the first 55% of the time, then a creep), a duration from the distance with a seeded plus or minus 8%, and a lean toward the travel up to 20 degrees at peak speed. It arrives `park` frames before the press: 2 for an obvious button, 3 to 5 for a switch, more when the camera must settle first (finish any camera zoom before the press).
- Press: the cursor goes 2 frames down to `depth` (default 0.81, clamped to 0.71-0.90) and 3 frames back up to 1.0. The target reaches its minimum 0 or 1 frame after the cursor's minimum (`lag`, default 1) at `targetDepth` (default 0.80, clamped to 0.63-0.97), down in 2 frames and back up in 6 (`heavy: true`: 6 and 10), with no overshoot. Asymmetric on purpose: a fast squeeze and a slower release read as a spring-loaded button. The response lives in the UI: `react: "pressed"` is a hard state step (CSS on `[data-state]`) on the frame the target bottoms out, never a graphic on the cursor.
- **No ripple ring.** There is no ring in the kit and `U.check` warns on any `ripple` / `click-ring` class. Use one only if the film already speaks in thin accent rings.
- Leave by accelerating off the frame (`cur.exit`), or park behind blurred; never vanish in the middle of the UI.
- Frame values are quantised to the film's fps; every time you pass is rounded to a frame.

## Typing only in a field

`U.type` works only on a field made by `U.input`: it has a placeholder to clear, a caret and a value. The placeholder clears 1 frame before the caret appears, the first glyph lands 2 frames after it, the caret is solid while typing and blinks only in the hold after (0.26 s phases), and the text arrives in seeded bursts of 1 to 3 glyphs with uneven gaps and a pause of 6 or more frames after a space, never one glyph per frame on a metronome. Pick the rate by what the viewer must do (`rate`). Typed code or multi-line text belongs in `RasanMotion`'s `M.type`, still magnified to the same floor.

## Drag and drop, agent work, dense scrolls, a terminal (1.1.0)

Four more calls for the beats a product demo repeats. All are pure functions of time like the rest; the recipes are the measured order of reactions (adapted in idea from motionmaxxing's UI demo notes, Apache-2.0), not a look.

```js
var d = U.drag(card, uploader, { at: 2.0, consume: false });      // -> { start, crest, drop, end, next, hold }
cur.click(card, { at: 2.0 });  cur.move(uploader, { end: d.drop });   // the cursor holds the card's top edge, then travels with it
var s = U.shimmer(statusEl, { at: 3.2, passes: 2 });              // status words, then two shimmer passes -> { start, shimmer, end, next }
U.scroll(logCol, { at: 5.0, dur: 1.84, distance: 5200 });          // an accelerating dense scroll that brakes onto a short list
U.terminal("#panel", { title: "build", at: 1.0, speed: 0.035, lines: [{ cmd: "npm run build" }, { out: "compiled in 1.2 s" }, { pause: 0.5 }, { pill: "done" }] });
```

| call | what it does | numbers |
|---|---|---|
| `U.drag(item, target, { at, lift, travel, tilt, consume, dropScale, grow, hover })` | the reaction stack, earliest first: the target grows 4% over 14 frames ending on the drop and takes `data-hover` 0.4 s before it; the card RISES (11 frames, `lift` px = 35% of its height), HOLDS 2 frames at the crest, travels slow-fast-slow on a bowed path while it tilts -8 deg over 8 frames and back to 0 by the drop; the drop is ONE frame (card at the target centre at `dropScale` 0.67, `data-state="dropped"` on the target). `consume: true`: the card shrinks to nothing about its own centre in 3 frames with a 10 px blur (it was eaten, it does not fly to a slot). | travel 0.35 to 0.9 s from the distance |
| `U.shimmer(textEl, { at, words, passes, band, pass, gap, tone })` | the agent "thinking": status words arrive whole, each from blur 12 px and opacity 0.1 to sharp in 4.5 frames, 4 frames apart; then TWO passes of a brighter copy of the text under a moving band masked to the glyphs, in the accent hue. No spinner, no dots, never per character. | band 0.35 of the text width; a pass 13 frames (0.42 s) and a 6-frame gap |
| `U.scroll(col, { at, dur, distance, settle, n })` | a dense chat or log that is already moving on frame `at` and accelerates the whole run: slow first (the first 0.4 s of 1.84 moves about 7%), growing continuously to a peak (about 250 px per frame on a 5000 px run), then a quadratic brake over `settle` frames onto a short readable list. One group, no blur. Let the viewport run EMPTY after the last block, hold the landing still 0.8 s, and step new system events in whole (`U.step`) so they ride the scroll. | dur 1.84 s, `settle` 9 frames, `n` 2.4 |
| `U.terminal(parent, { title, at, speed, lines })` | a code or terminal panel: `cmd` types with a `$` prompt at `speed` s per glyph (seeded jitter of 40%, a longer beat after a space), `out` / `outs` print whole on ONE frame, `pause` is seconds with a blinking caret, `pill` is a status chip on one frame. Brand-token colours (ink ground, canvas text, accent prompt), mono from the tokens; every line is `data-ru-read`, so `U.check` holds it to the 0.04 H text floor. | `speed` 0.035 s per glyph |

Agent-working beat order (the measured one): act (send) -> 3 empty frames -> the marker arrives -> status words -> two shimmer passes -> the user's prompt returns as a right-aligned bubble (opacity 0.2 -> 1 over 0.4 s, text NOT shrunk) -> a left-to-right wipe of the status (about 5 frames) plus a check drawn on (2 to 3 frames) -> the result status (smaller) -> result cards at near full size 2 frames apart -> the layout scrolls up 0.04 H accelerating -> the next status begins and stays unresolved at the cut. One hue for "the machine is acting" (typing, scan, sweep, shimmer, halo) and a second signal (green) ONLY for "done", never on the same object at once. To show "a lot of work": at least three items in progress at once, about 0.9 s per step, a concrete verb plus a number per row.

Drag recipes: a card dragged into a field (reaction stack above, the hand pinned to the card's top edge); a stack dragged into an uploader (the stack and cursor on their own layer, hold still 11 frames, travel together 16 frames on a `softInOut` with a smear of 0.08 W along the path, no press flash; the drop is the cards shrinking about their own centres in 3 frames each, 1 frame apart, then the cursor to nothing in 9 frames); items collected into a folder (four items from four edges on 3-frame staggers, a grab that lifts 0.03 H, a curved drag scaling 0.14 -> 0.09 W, folder and cursor vanishing on ONE frame; the result may spring +0.06 H as the film's single overshoot); a card dragged over another (press to 0.72, slow-fast-slow, the dragged card painted above its neighbour, which slides the other way). Overshoot saved for one payoff reads as reward.

## Cursor-driven simulations (RasanSim)

When something should react to the cursor with physics (dots pulled toward it, a trail that lags and overshoots, a jelly that wobbles, a rope on a pin), a live physics loop is NOT seek-safe (each frame depends on the frames before it). `runtime/rasan-sim.js` pre-simulates the whole run once at 240 Hz from a seeded start and samples the table by time, so any frame is a pure function of `T`:

```js
var path = function (t) { return cur.pos(t); };                       // the RasanUI cursor's position as a function of time (or RasanSim.path([[t, x, y], ...]))
var m = RasanSim.magnet(path, dots, { duration: 4, radius: 220, pull: 1400, home: 22, damp: 5, seed: "film/04" });
RasanSim.bind(tl, m, function (s) { els.forEach(function (e, i) { e.style.translate = s.x(i) + "px " + s.y(i) + "px"; }); }, { at: 0 });
```

`magnet(target, bodies, o)`, `follow(target, { n, k, damp })` (a chain, each springing to the one before), `jelly(target, { k, damp, stretch })` (`s.extra(0, 0..2)` = sx, sy, rot), `verlet(target, { n, len, gravity, iter })` (a rope pinned to the target). Rules: the path must itself be a pure function of time; draw in the composition; bake once at build, never inside a tween callback; keep `duration` to the beat plus 0.3 s of settle.

## Readability: the hard gate (G1)

The render must show the readable object with text at 0.04 of the frame height or more and the hero fragment at 0.55 of the frame width or more (or cropped by the frame edge). Captured UI is 12 to 14 px, about 0.015 H: magnify it, by `fillW` / `scale` at build time or by the world camera, never by shrinking the proof. `U.check({ at: [...] })` seeks to each time, measures the rendered DOM (text sizes include every ancestor transform) and warns:

| rule | when |
|---|---|
| `text-too-small` | a `read` text under 0.04 H while visible in the frame (`texture` text and off-frame text are exempt) |
| `hero-too-small` | the `hero` under 0.55 W and not cropped by the frame at a sampled time |
| `no-hero` | nothing marked with `U.hero` |
| `cursor-not-top`, `cursor-in-camera` | the cursor layer is not the last child of the stage, or sits inside a transformed group |
| `click-ring` | a ripple or ring class is present |
| `typing-outside-field` | typed text outside an `.ru-input` |
| `tokens-defaulted`, `no-finish` | tokens fell back to generic values; the clock is not on the timeline |

Texture-size text (volume, "real product", nothing in it must be read) is allowed: mark it `U.texture(el)` and give it distinct silhouettes so the rhythm survives without words. Run the check at the beats the proof lands on and fix every warning; `strict: true` makes it a build error. Show ONE object per frame; when two are needed (the prompt, then the result) cut or move the camera between them, never side by side.

## The captured marker

A faithful rebuild of a real product screen carries `data-ui="captured"` (set by `U.mount({ captured: true, source })`, or `RasanUI.markCaptured(el, source)`) so the slop lint can tell it from generic UI and exempt it. The marker is a claim: `source` must name the capture (`research/screens.json#<id>`), the copy must match it, and an invented surface stays `data-ui="invented"` and is judged as generic UI. Do not put the attribute on anything you drew from memory.

## Determinism and seek-safety

Every state is a pure function of the timeline time `T`. The kit adds one linear clock tween to the timeline you pass in; its setter reads `tl.time()` and redraws every channel (cursor, press, target reaction, typing, caret, toggles, world pose). No `Math.random` (jitter is a seeded hash of `seed` and an index), no wall clock, no `requestAnimationFrame`, no `setTimeout`. Seek anywhere, in any order, any number of times: the DOM is the same (the selftest seeks 14 times in three orders and compares the DOM). Build the UI before you call `U.cursor` (targets are measured from layout when the call is made, with the world at its first pose), and call `U.finish()` last. Drive the camera with `U.world` when a cursor follows it; if you drive the content with another kit, keep the cursor in stage coordinates.

## Sequence for a beat

1. Rebuild the screen from `research/screens.json` and the brand (`mount`, primitives), `captured: true` with its source.
2. Choose the hero and the read text; build at the scale that clears the gate, or set the `U.world` poses that do.
3. Time the chain in the order cause then effect: the cursor enters, parks, presses; the UI responds on the same frame; type into the field; the result lands (a `step`, a row, a notification).
4. `U.check`, fix, `U.finish()`, then the usual `motionkit.mjs check` / `obey.mjs` / frame gate.
