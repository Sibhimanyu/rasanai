# motion.md contract

`motion.md` sits at the project root next to `frame.md`. `frame.md` says what things look like; `motion.md` says how they move. It is written by `scripts/motion-md.mjs` and enforced by `scripts/obey.mjs`.

## Format

YAML frontmatter where **each top-level key is on one line with a JSON value**. That is valid YAML and parses without a YAML library. A trailing `# comment` is tolerated; multi-line YAML lists are **not** read, so keep every value on one line. Then a prose body.

```yaml
---
personality: "editorial-mask"
parent: null
adjustments: []
tempo: {"scale_ms":[250,450,700,1000,1400]}
easing: {"enter":"expo.out","exit":"power2.in","move":"expo.inOut"}
stagger: {"each_ms":120}
holds: {"min_ms":1000}
entrances: ["mask-wipe"]
exits: ["mask-wipe-out"]
transitions: ["mask-push","hard-cut"]
banned: ["fade-up-slide","fade-slide","bounce","overshoot","scale-pop","blur-in"]
runtime: "gsap"
decided_by: "confirmed"
waivers: []
---
```

| Key | Meaning |
|---|---|
| `personality` | `lang-<term>` for a motion-language term (`taxonomy/dimensions/motion-language.json`, the usual case), a preview-swatch id from `personalities/`, or `"custom"` when adjusted |
| `language` | the motion-language term (null for a swatch id) |
| `parent`, `adjustments` | what a custom (adjusted) motion came from (`lang-<term>` or a swatch id) and the adjectives applied |
| `tempo.scale_ms` | the allowed tween durations |
| `easing` | the enter / exit / move eases (GSAP names; `steps(N)` and `none` allowed) |
| `stagger.each_ms`, `holds.min_ms` | the stagger between units, and the minimum hold after an element has arrived |
| `entrances`, `exits`, `transitions` | advisory vocabulary for the builder (not checked) |
| `banned` | pattern names that fail the check; each needs a signature below |
| `decided_by` | `confirmed` (the user chose) or `auto` ("you decide") |
| `waivers` | violations the user accepted (see Waivers) |

**Easing is brand-derived.** `easing` and `banned` come from the brand film card's `Easing:` line when one exists: a brand whose films settle softly gets a soft settle (a slight lift or overshoot, `back.out` on UI and words settling into a line) and the `overshoot` ban is removed; a strictly mechanical brand keeps `expo`/`power` and the ban (`craft.md`, "Easing personality"). A "precise" personality is chosen only when the brand's own motion is precise.

The body's "How it moves" prose is copied into DISPATCH.md. For a custom personality it opens with a note that the frontmatter wins wherever the parent's prose disagrees.

## Tween classes

`obey.mjs` loads each composition in headless Chrome with GSAP, walks every tween on every timeline registered on `window.__timelines`, and samples each tween's real start and end values by seeking the paused timeline. `css: {...}` wrappers are flattened. Then it classifies each tween; the first matching rule wins:

| Class | Rule |
|---|---|
| exempt | zero duration (`set()`, cuts); non-element targets (counter proxies); tweens of `innerText`, `textContent`, `innerHTML` or `value` |
| camera | the tween's target is, or sits inside, an element marked `data-obey="camera"` (checked right after exempt, before every enter / exit / move rule) |
| enter | opacity / autoAlpha ≤ 0.2 → ≥ 0.8 |
| exit | opacity / autoAlpha ≥ 0.8 → ≤ 0.2 |
| enter | uniform scale ≤ 0.8 → ≥ 0.95 |
| exit | uniform scale ≥ 0.95 → ≤ 0.2 |
| enter / exit | `scaleX` or `scaleY` alone ≤ 0.05 → ≥ 0.95 (a rule drawing out, letters growing from a baseline) / the reverse |
| enter / exit | `yPercent` or `xPercent` \|≥ 80\| → \|≤ 5\| (a mask rise) / the reverse |
| enter / exit | `clip-path: inset()` largest side ≥ 45% → ≤ 5% / the reverse |
| enter / exit | blur > 2px → ≤ 0.5px / the reverse |
| move | anything else (shifts, pushes, pulses, partial scale changes) |

**camera:** a shot-length move of a frame or plate (a push-in, pan or drift on a generated image), marked `data-obey="camera"`; it is not a way to dodge the scale for UI elements. A camera tween is exempt from `duration-off-scale` and the hold rules but must last at least 1.0 s (`camera-too-short`), must name its ease (`implicit-ease` and `custom-ease` still error), and that ease must be in `easing.move`'s family or `sine.inOut`, `power1.inOut` or `none` (a camera may drift linearly; `ease-outside-set` otherwise). Banned signatures still apply, except `linear-entrance`, which cannot apply to a camera. An element marked `data-obey="camera"` that contains text is an error, `camera-on-content`: text and UI follow the scale. Presenter films mark each plate's camera wrapper; the presenter's 0.5 s layout moves are not camera moves and sit on the scale with `easing.move`.

Staggered tweens are judged per element: the stagger spread is subtracted from GSAP's total duration. A repeating tween's duration is one iteration. A tween with a `keyframes: [...]` array is classified on its overall start and end values, and each step's own duration must be on the scale. A staggered tween is labelled by its first target.

## Rules

| Rule | Severity | Check |
|---|---|---|
| `implicit-ease` | error | no ease given (GSAP falls back to its default `power1.out`, the generic look). Timeline `defaults: {ease}` counts as given. |
| `custom-ease` | error | the ease is a function (CustomEase, `gsap.parseEase(...)`, inline), so it can't be verified. Use the named ease. |
| `ease-outside-set` | error | ease family + direction is none of `easing.enter/exit/move`. Parameters are ignored: `back.out(1.7)` = `back.out`, `steps(4)` = `steps(12)`. |
| `ease-class-mismatch` | warning | the ease is in the set but isn't this class's ease |
| `duration-off-scale` | error | per-element duration not within ±15% of any `tempo.scale_ms` value |
| `stagger-off` | warning | stagger `each` (or `amount / (n−1)`) not within ±15% of `stagger.each_ms` |
| `hold-too-short` | warning | per element: from the end of its entrance to the start of its next exit < `holds.min_ms` × 0.85 |
| `banned:<name>` | error | the tween matches a banned signature (below) |
| `non-gsap` | error | CSS `@keyframes`, anime.js, or WAAPI `animate([...])` in a composition file |
| `unknown-ban` | error | motion.md bans a name that has no signature |

**Could not run** (exit 1, never waivable, never a pass): headless Chrome failed; a script error stopped the page; a file defines tweens but none registered at runtime; or no tweens were found anywhere (nothing was checked). A CDN copy of GSAP in a composition is swapped for the vendored copy, and a templated sub-composition, which gets GSAP from its host, is given it, so neither case needs the network.

Exit codes: **0** clean (warnings allowed), **2** violations, **1** could not run. `--json` prints the full report.

## Banned-pattern signatures

Every banned name must have a signature here and in `scripts/lib/signatures.mjs` (shared by obey.mjs and board.mjs). "Opacity" below means opacity or autoAlpha.

| Name | Signature |
|---|---|
| `fade-up-slide` | one tween: opacity ≤ 0.2 → ≥ 0.8 **and** `y` or `yPercent` from > 4 to within ±2 of 0. The generic default entrance. |
| `fade-slide` | opacity ≤ 0.2 → ≥ 0.8 **and** any of `x`, `y`, `xPercent`, `yPercent` changes by > 4 (reported once when `fade-up-slide` also matches) |
| `linear-entrance` | enter-class tween with ease `none` / `linear` |
| `bounce` | ease family `bounce` or `elastic` |
| `overshoot` | ease family `back` |
| `blur-in` | enter-class tween starting at blur > 2px |
| `scale-pop` | enter-class tween with uniform scale < 0.8 → ≥ 0.95 |
| `opacity-only-entrance` | enter-class tween animating only opacity / autoAlpha |

## Adjectives (`motion-md.mjs write --adjust a,b`)

Applied left to right; a later one can override an earlier one.

| Adjective | Edit |
|---|---|
| slower | durations ×1.4, stagger ×1.2, holds ×1.3 |
| faster | durations ×0.7, stagger ×0.8, holds ×0.8 |
| calmer | softer ease families (expo / power3–4 / back → power2; elastic / circ / bounce → sine), durations ×1.15, stagger ×1.3, holds ×1.15 |
| punchier | sharper ease families (power1–2 → power4, sine → power3, circ → expo), durations ×0.75, stagger ×0.8, holds ×0.9 |
| bouncier | enter → `back.out(1.7)`, move → `back.inOut(1.4)`; removes the `overshoot` ban |
| stiffer | back / elastic / bounce → power3; adds the `overshoot` and `bounce` bans |

Values round to 10 ms. The result is `personality: "custom"` with `parent` and `adjustments`, and it is always re-previewed before it is locked.

## Waivers

A violation the user accepts at the render gate is recorded with:

```bash
node <skill>/scripts/obey.mjs waive --project videos/<name> --rule "<rule as printed>" [--target "<target as printed>"]
```

This writes `{"rule":"banned:overshoot","target":"#logo"}` into the `waivers` line. Without `--target`, the rule is waived everywhere. The bare-string form (`"banned:overshoot"`) is also accepted. Targets are obey's labels: `#id` when the element has an id, else `tag.class:index "text"`. Waived findings still print, marked WAIVED, and don't fail the check. A malformed `waivers` value stops obey with a message rather than being ignored.
