# The orbs kit: RasanOrbs

The "AI is working" mark for films about AI products: a small dotted sphere that shows what the agent is doing. Nine states, each a different motion, in two sizes designed separately (64 for a chat-avatar scale, 20 for inline-text scale). A port of [thinking-orbs](https://github.com/Jakubantalik/thinking-orbs) (MIT, credit in `third_party/thinking-orbs/`) to a seek-safe canvas runtime: one browser file, no build step, driven by the scene's own paused GSAP timeline.

| State | Reads as |
|---|---|
| `working` | particles on tilted orbits |
| `searching` | a scan meridian sweeps a dotted globe |
| `solving` | bands scramble, then click back solved |
| `listening` | a waveform rolls through the rings |
| `connecting` | a constellation wires itself |
| `weaving` | three strands plait around the sphere |
| `composing` | an undulating multi-band sash |
| `breathing` | a ring slowly morphing |
| `shaping` | a dotted outline: circle, triangle, square |

## Use

`video.mjs inject` installs it (`assets/rasan-orbs/rasan-orbs.js`) when a composition calls `RasanOrbs`. Load it after GSAP:

```js
const tl = gsap.timeline({ paused: true });
const orb = RasanOrbs.mount("#thinking", { state: "searching", size: 64, tl, at: 0, duration: 6 });
orb.to("composing", 2.4, 0.5);      // at 2.4 s, dissolve into composing over 0.5 s
```

Options: `state`; `size` (64, 20, `"hero"`, or any number); `tl` + `duration` (the scene's length, so the clock covers the whole scene) + `at`; or `time: () => T`, or none and call `orb.seek(T)`; `t0` (the orb's own clock starts here; default 0); `speed` (default 1); `color` (`"#rrggbb"`: the brand colour; default monochrome); `theme` (`"dark"` default: light dots for a dark ground, `"light"`: dark dots); `transition` (default dissolve length 0.5 s); `dpr` (canvas pixels per CSS pixel, default 2); `label` (the aria-label). Returns `{ canvas, to(state, at, dur), seek(T), stateAt(T) }`.

## Rules

- **Pure in T.** Every frame is a function of the timeline time: seek in any order, same pixels. No `Math.random`, wall clock or `requestAnimationFrame` in the kit; do not add any around it. Keep `duration` at the scene's length: past the tween's end the timeline stops redrawing.
- **Sizes.** 64 and 20 are separate designs (dot count, dot size and speed tuned for each), not a scale. Another number draws the nearest design and scales it: up to 32 the 20, above that the 64. `"hero"` is the 64 at 256 px; the dots scale with it, so a hero reads as a large dotted sphere. Use 20 beside text, 64 as an avatar, hero when the orb is the picture.
- **Ink.** Monochrome by default (depth as grey). `color` draws one colour with depth as alpha, so it sits on any ground; keep it to the brand's accent.
- **State per verb.** Pick the state that matches what the product says it is doing (`searching` for retrieval, `composing` for writing, `connecting` for integrations). One state per beat; change it with `to()` when the product's verb changes, never to decorate.
- **Budget.** One to three orbs on screen; each is a few hundred dots redrawn per frame on a 2D canvas, cheap.

Tests: `scripts/tests/orbs.mjs` (geometry against the library's golden vectors; byte-identical reseeks in headless Chrome).
