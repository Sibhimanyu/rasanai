# motion.md contract

`motion.md` sits at the project root next to `frame.md`. `frame.md` says what things look like; `motion.md` says how they move. It is written by `scripts/motion-md.mjs` (from a motion language, a swatch or a design system, via `scripts/lib/fluent.mjs`) and enforced by `scripts/obey.mjs` on the build and `scripts/motion-gate.mjs` (fluency) on the draft.

**Why it looks like this.** The old contract was a duration grid (±15%), a three-ease whitelist, one stagger and an overshoot ban, and obey errored on anything else (custom eases included). R5 (`.context/night/R5-motion-fluency.md`) measured that exactly those four things are the strongest machine tells: one curve shape on every move (t50 spread 0.09–0.17 vs 0.24–0.48 in the references), durations on a grid, a metronome stagger, nothing ever settling. "Precise" had been turned into "uniform". The contract now keeps a language's *signature* (its eases, pace and bans) and enforces *variety*: a curve per role, durations from distance, overlap, irregular cascades, a settle budget, arcs and a living camera.

## Format

YAML frontmatter where **each top-level key is on one line with a JSON value** (valid YAML that parses without a YAML library; a trailing `# comment` is tolerated; multi-line lists are not read). Then a prose body.

```yaml
---
personality: "lang-precise"
parent: null
language: "precise"
adjustments: []
tempo: {"scale_ms":[200,300,450,700,1000]}
durations: {"base_ms":250,"travel_ms":500,"area_ms":140,"min_ms":320,"max_ms":1260,"jitter":0.08,"exit_k":0.65,"pace":0.9}
easing: {"enter":"expo.out","exit":"expo.in","move":"expo.inOut"}
curves: {"launch":"cubic-bezier(0.05,0.7,0.1,1)","glide":"cubic-bezier(0.2,0,0,1)","expressive":"cubic-bezier(0.4,0.14,0.3,1)","exit":"expo.in","settle":"spring(0.68,12)","snap":"expo.out","drift":"sine.inOut","move":"expo.inOut"}
mix: {"min_gestures":12,"min_families":4,"max_share":0.4,"max_duration_share":0.4}
overlap: {"next_at":[0.55,0.75],"trail_frames":[2,4]}
stagger: {"each_ms":80,"amount_max_ms":480,"distribution":"power2.in","jitter_frames":1}
overshoot: {"share":0.15,"max_pct":8}
arcs: {"min_travel_pct":3,"bow_pct":[4,12]}
camera: {"push_pct":[1.5,4],"drift_pct_s":[0.5,1.5]}
holds: {"min_ms":900}
stillness: false
entrances: ["clip-rise"]
exits: ["clip-drop"]
transitions: ["hard-cut","grid-shift"]
banned: ["fade-up-slide","fade-slide","bounce","blur-in","opacity-only-entrance"]
runtime: "gsap"
decided_by: "confirmed"
waivers: []
---
```

| Key | Meaning |
|---|---|
| `personality`, `language`, `parent`, `adjustments` | where the motion came from: `lang-<term>` (a motion-language term in `taxonomy/dimensions/motion-language.json`), a swatch id from `personalities/`, a design system, or `"custom"` (adjusted, with its parent and adjectives) |
| `tempo.scale_ms` | the language's **pace**: reference lengths short to long. Not a grid; swatches and engines read it, and it scales `durations` |
| `durations` | the distance formula: `base + travel x sqrt(travel / frame diagonal) + area x sqrt(area / frame area)`, clamped to `min`..`max` ms, jittered ±`jitter`, exits x`exit_k`. `pace` = the middle `scale_ms` value / 500 ms |
| `easing` | the language's signature curves (enter, exit, move). They stay in the family as `snap`, `exit` and `move` |
| `curves` | a curve per role: `launch`, `glide`, `expressive`, `exit`, `settle`, `snap`, `drift`, `move`. GSAP names, `cubic-bezier(x1,y1,x2,y2)` or `spring(damping, omega)`; `RasanMotion.ease(name)` turns any of them into an ease function (no CustomEase needed) |
| `mix` | what obey enforces once a film has `min_gestures` gestures: at least `min_families` curve families, no curve on more than `max_share` of gestures, no duration (to the frame) on more than `max_duration_share` |
| `overlap` | the next gesture starts at 55–75% of the last; secondaries trail by 2–4 frames |
| `stagger` | the average spacing, the largest total spread, the distribution curve and ±1 frame of jitter. Never a constant step |
| `overshoot` | the settle budget: the share of gestures that may overshoot and the largest overshoot in % of the travel. `{share: 0}` = landings are exact (rigid languages) |
| `arcs` | travels longer than `min_travel_pct` of the frame bend by `bow_pct` of their length (100 = straight paths, rigid languages) |
| `camera` | the living frame: a push of `push_pct` over a shot, or a drift of `drift_pct_s` of the frame a second |
| `holds.min_ms` | reading time between an element arriving and leaving |
| `stillness` | a declared stillness style (an editorial film like OpenAI's "Refreshed."): the gate waives the activity checks and keeps the shape checks |
| `entrances`, `exits`, `transitions` | advisory vocabulary |
| `banned` | pattern names that fail the check; each has a signature below |
| `decided_by`, `waivers` | `confirmed` or `auto`; violations the user accepted (see Waivers) |

**Per language** (`lib/fluent.mjs`, the taxonomy's `contract.curves` and `contract.overshoot`): eased languages (precise, snappy, smooth...) settle 15% of moves at up to 8%; soft languages (cinematic, luxurious, organic, floating...) 12% at up to 4% with a softer spring; spring languages (elastic, springy, playful, character...) half the moves at up to 25%; rigid languages (mechanical, robotic, linear, stepped, glitchy) keep the `overshoot` ban, straight paths and need 3 curve families, not 4.

**Brand-derived.** The brand film card's `Easing:` line sets `easing` (the signature) and the settle budget; a brand whose films settle softly gets a soft settle. The brand never collapses the film to one curve.

**Old files** (written before these keys) are still read: missing keys take the defaults above, an explicit `overshoot` ban still bans.

## The vocabulary: RasanMotion

`runtime/rasan-motion.js`, installed into `assets/rasan-motion/` by `node scripts/motionkit.mjs install --project <dir>` with the project's `motion.md` baked in. Verbs take what moves and where, never an ease or a duration: `travel` (on an arc, curve by distance, children dragging, speed-softening), `land` (a settle within the budget), `enter` (mask, wipe, scale, focus, fly), `exit`, `cascade` (irregular offsets and durations), `follow` (a secondary 2–4 frames behind), `camera` (a push or drift on a world wrapper), `ambient` (a finite quiet life on a background layer). Each returns `{start, end, dur, next}`; `next` is 55–75% into the move, so the next verb overlaps. Seeded, seek-safe. `M.audit()` reports the mix the kit wrote; `motionkit.mjs demo` renders a headless strip of the tell next to every verb; `motionkit.mjs check` checks a project's use.

## Tween classes

`obey.mjs` loads each composition in headless Chrome with GSAP, walks every tween on every timeline registered on `window.__timelines`, samples each tween's real start and end values by seeking the paused timeline (`css: {...}` wrappers flattened), and **samples its ease** (201 points), so a cubic-bezier, a spring, a CustomEase or a RasanMotion curve is judged by its shape: t50 (the time to half the distance), t90, the overshoot and a family (`snap`, `decelerate`, `glide`, `soft`, `symmetric`, `accelerate`, `settle`, `linear`, `stepped`). Then it classifies each tween; the first matching rule wins:

| Class | Rule |
|---|---|
| exempt | zero duration (`set()`, cuts); non-element targets (counter proxies, a render clock); tweens of `innerText`, `textContent`, `innerHTML` or `value` |
| camera | the target is, or sits inside, an element marked `data-obey="camera"` (RasanMotion.camera marks its world) |
| enter | opacity / autoAlpha ≤ 0.2 → ≥ 0.8; uniform scale ≤ 0.8 → ≥ 0.95; `scaleX` or `scaleY` ≤ 0.05 → ≥ 0.95; `yPercent`/`xPercent` \|≥ 80\| → \|≤ 5\|; `clip-path: inset()` ≥ 45% → ≤ 5%; blur > 2px → ≤ 0.5px |
| exit | the reverse of each enter rule |
| move | anything else |

Enter, exit and move tweens are the film's **gestures**. A staggered tween is one gesture, judged per element (the spread is subtracted); a repeating tween's duration is one iteration.

## Rules

| Rule | Severity | Check |
|---|---|---|
| `implicit-ease` | error | no ease given (GSAP's default power1.out, the generic look). Timeline `defaults: {ease}` counts as given |
| `dominant-ease` | error | one curve shape moves more than `mix.max_share` (40%) of the film's gestures |
| `few-curves` | error | fewer than `mix.min_families` (4) curve families in the film |
| `duration-grid` | error / warning | one duration (the same frame count at 30 fps) on more than `mix.max_duration_share` (40%) of gestures; a warning when three durations cover over 60% |
| `even-stagger` | error | a constant GSAP stagger (a number, or `each`/`amount` with no ease, not random, not a grid) over 4 or more elements |
| `uniform-cascade` | error | 4 or more tweens in one file with the same properties, curve and duration (±1 frame) starting at an even spacing (±1 frame): a metronome of one gesture |
| `overshoot-over-budget` | error | more gestures overshoot than `overshoot.share` (+5 points of tolerance) |
| `overshoot-too-big` | warning | a gesture overshoots more than 1.5x `overshoot.max_pct` |
| `no-settle` | warning | 16+ gestures and none settles, in a language with a settle budget |
| `snap-and-die` | warning | over a quarter of the travels longer than 10% of the frame take under 0.5 s |
| `camera-too-short` | error | a camera tween under 1.0 s |
| `hold-too-short` | warning | per element: from the end of its entrance to the start of its next exit < `holds.min_ms` x 0.85 |
| `opaque-motion` | warning | a file whose motion lives in a `render(t)` function driven by one clock tween: obey cannot see it, the fluency gate on the draft judges it |
| `banned:<name>` | error | the tween matches a banned signature (below) |
| `non-gsap` | error | CSS `@keyframes`, anime.js, or WAAPI `animate([...])` in a composition file |
| `unknown-ban` | error | motion.md bans a name that has no signature |

The mix rules (dominant-ease through snap-and-die) are judged on the whole film once it has `mix.min_gestures` (12) gestures. A preview page whose root carries `data-obey-mix="off"` (the tasting swatches, which show one language's signature) is not judged. obey prints the mix it measured (`mix: N gestures, top curve %, top duration %, settles %, families`).

**Could not run** (exit 1, never waivable, never a pass): headless Chrome failed; a script error stopped the page; a file defines tweens but none registered at runtime; or no tweens were found anywhere. A CDN copy of GSAP is swapped for the vendored copy, and a templated sub-composition is given GSAP, so neither needs the network.

Exit codes: **0** clean (warnings allowed), **2** violations, **1** could not run. `--json` prints the full report.

## Banned-pattern signatures

Every banned name has a signature here and in `scripts/lib/signatures.mjs` (shared by obey.mjs and board.mjs). "Opacity" means opacity or autoAlpha.

| Name | Signature |
|---|---|
| `fade-up-slide` | one tween: opacity ≤ 0.2 → ≥ 0.8 **and** `y` or `yPercent` from > 4 to within ±2 of 0. The generic default entrance |
| `fade-slide` | opacity ≤ 0.2 → ≥ 0.8 **and** any of `x`, `y`, `xPercent`, `yPercent` changes by > 4 (reported once when `fade-up-slide` also matches) |
| `linear-entrance` | enter-class tween with ease `none` / `linear` |
| `bounce` | ease family `bounce` (a floor bounce). Elastic and spring settles are overshoots, judged by the budget |
| `overshoot` | ease family `back` or `elastic`, or a sampled overshoot over 0.5%. Banned only by rigid languages (and by a brand or a user who asks); elsewhere overshoot is a budget |
| `blur-in` | enter-class tween starting at blur > 2px |
| `scale-pop` | enter-class tween with uniform scale < 0.8 → ≥ 0.95 |
| `opacity-only-entrance` | enter-class tween animating only opacity / autoAlpha |

## The draft: fluency

`motion-gate.mjs --video <draft.mp4>` measures the rendered film (`lib/fluency.mjs`: block-matching motion on 480 px grey frames, moving regions tracked into moves) and fails a film whose weighted fluency score is under 0.70: curve-shape spread (t50 IQR ≥ 0.18, weight 3), two or more motions at once (≥ 55% of active frames, 2), median visible move (≥ 0.32 s, 2), settle share (≥ 6.5%, 2), duration spread (entropy ≥ 0.8), arcs (≥ 35% of travels), dead frames (≤ 30%), cuts between poses at rest (≤ 12%). Under 15 tracked moves it says so instead of judging. `stillness` waives dead frames, cuts at rest and concurrency. `node motion-gate.mjs fluency --video <film>` prints the measurement alone. The calibration table is in `.context/night/done-W7.md`.

## Adjectives (`motion-md.mjs write --adjust a,b`)

Applied left to right; a later one can override an earlier one. Durations follow the pace (`scale_ms`), so every adjective that scales the pace scales the distance formula too.

| Adjective | Edit |
|---|---|
| slower | pace x1.4, stagger x1.2, holds x1.3 |
| faster | pace x0.7, stagger x0.8, holds x0.8 |
| calmer | softer signature curves (expo / power3–4 / back → power2; elastic / circ / bounce → sine), a softer settle and a 4% budget, pace x1.15, stagger x1.3, holds x1.15 |
| punchier | sharper signature curves (power1–2 → power4, sine → power3, circ → expo), pace x0.75, stagger x0.8, holds x0.9 |
| bouncier | enter → `back.out(1.7)`, move → `back.inOut(1.4)`; removes the `overshoot` ban; a 30% budget at 15% and a springier settle |
| stiffer | back / elastic / bounce → power3; bans `bounce`; settles shrink to 6% of gestures at 3% |

Values round to 10 ms. The result is `personality: "custom"` with `parent` and `adjustments`, re-previewed before it is locked.

## Waivers

A violation the user accepts at the render gate is recorded with:

```bash
node <skill>/scripts/obey.mjs waive --project videos/<name> --rule "<rule as printed>" [--target "<target as printed>"]
```

This writes `{"rule":"dominant-ease"}` or `{"rule":"banned:overshoot","target":"#logo"}` into the `waivers` line. Without `--target`, the rule is waived everywhere. The bare-string form is also accepted. Targets are obey's labels: `#id` when the element has an id, else `tag.class:index "text"`. Waived findings still print, marked WAIVED, and don't fail the check. A malformed `waivers` value stops obey with a message.
