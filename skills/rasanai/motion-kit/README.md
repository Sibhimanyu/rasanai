# RasanAI motion kit

A curated registry of 32 named mechanics (`catalog.json`, schema_version 1, contract B): 4 per family across kinetic-type,
product-ui, shape, camera-space, sound-hit, data-evidence, texture, ending. Every item is original RasanAI work or a thin
reference to an existing verb in `runtime/` (RasanMotion, RasanShape, RasanCamera, RasanUI). No third-party code or text.

## Conventions
- Id is `<family>-<name>-v1`; a breaking change makes a new id and version, never an edit in place.
- `origin: reused-rasan` means `implementation` names an existing runtime function (`runtime/rasan-shape.js:drawOn`,
  `runtime/rasan-ui.js:kit.type`, `runtime/rasan-camera.js:stage.rack`). `origin: original` means
  `runtime/rasan-motion-kit.js:<fn>`, reached through `window.RasanMotionKit.apply(...)`.
- Everything is seek-safe: a paused GSAP timeline, no rAF, no Date, no Math.random (seeded only).
- No palette or font is hard-coded. Items take `brand_inputs` (e.g. `font.display`, `color.accent`, `tokens.ui`) from the
  film's design system and `motion_inputs` (`cues`) from the score.
- Params are bounded: numbers carry min, max, default; enums list values; strings only for labels. Clamp, never extrapolate.
- `credit` is `""` for original work. A future third-party item must fill it and add a row to `third_party/SOURCES.md`.

## Annotating a scene
Put `data-motion-kit="motion-kit:<id>@<version>"` on the clip root element, e.g.
`<section class="clip" data-motion-kit="motion-kit:sound-hit-downbeat-reveal-v1@1">`. In the scene script:
`RasanMotionKit.apply({id, timeline, target, design, motion, fps, seed, cues, props})` returns `{id, version, duration, hits}`.

## How an agent picks
1. Start from the beat, not the catalog: what should the viewer feel, and what is the one thing that moves?
2. Filter by `role` (entry, emphasis, exit, transition, background, scene, ending), then read `use_when` and `avoid_when`.
3. Check `brand_inputs` exist, `requires_assets` are present, and `cues` exist if `motion_inputs` asks for them.
4. Pick at most one mechanic per beat, and no family more than twice in a film; repetition is the AI tell.
5. Set `props` inside min/max; leave defaults unless the brief says otherwise. Record the choice in the decisions drawer.

## How to reject or invent
- Reject an item when `avoid_when` matches, an input is missing, or the beat is better as a plain cut. Say why in one line.
- Invent when no item fits: write the move in the scene, keep it seek-safe, note `motion-kit: none, custom <name>` and propose
  it as a new catalog entry (new id, params with bounds, reduced_motion text) rather than copying a third-party effect.

## W04 implementation set (exact names, `runtime/rasan-motion-kit.js`)
- kinetic-type-text-mask-reveal-v1 -> textMaskReveal({lineDelay:0.04..0.4, travel:0.4..1.4, duration:0.3..1.2, direction:up|down})
- kinetic-type-tracking-tension-v1 -> trackingTension({from:0..0.3, to:-0.06..0.1, relax:0..0.04, duration:0.3..1.5})
- product-ui-card-stack-rotation-v1 -> cardStackRotation({cards:3..6, stepOffset:8..40, duration:0.4..1.2, arc:0..80})
- shape-outline-to-solid-v1 -> outlineToSolid({drawDuration:0.3..2, fillDuration:0.1..1, fillDelay:0..0.6})
- shape-split-recombine-v1 -> splitRecombine({pieces:2..8, spread:20..300, holdDuration:0..1, duration:0.6..2.4})
- camera-space-layer-parallax-v1 -> layerParallax({layers:2..6, travel:20..400, duration:1..10, axis:x|y})
- sound-hit-downbeat-reveal-v1 -> downbeatReveal({cue:0..300, overshoot:0..0.3, duration:0.15..0.8})
- sound-hit-multi-part-contraction-v1 -> multiPartContraction({parts:2..8, compression:0.2..0.9, releaseDuration:0.1..0.8})
- sound-hit-visual-foley-hit-v1 -> visualFoleyHit({cue:0..300, intensity:0.02..0.3, duration:0.08..0.5})
- data-evidence-evidence-number-reveal-v1 -> evidenceNumberReveal({value:0..1e12, decimals:0..4, duration:0.4..3, prefix:string, suffix:string})
- texture-seeded-jitter-v1 -> seededJitter({amount:0..6, rate:2..24, seedOffset:0..999})
- ending-hold-then-cut-v1 -> holdThenCut({hold:0.3..5, cutAt:0..300})
The other original items (editorialStaggerCut, layoutReflow, componentToFullscreen, silhouetteWipe, orthoPerspectiveHandoff,
pausePayoff, axisReframe, countToObject, logoResolution, matchedEcho, seamlessLoop) are listed with `origin: original` but
are not yet implemented; the registry must report them as `implemented: false`.

## catalog-validate (acceptance one-liner, run from the repo root)
```
node -e 'const c=require("./skills/rasanai/motion-kit/catalog.json"),F=["kinetic-type","product-ui","shape","camera-space","sound-hit","data-evidence","texture","ending"],R=["id","version","label","family","role","summary","use_when","avoid_when","supports","brand_inputs","motion_inputs","params","requires_assets","seek_safe","reduced_motion","implementation","origin","license","credit","fixture"],e=[],ids=new Set,n={};for(const i of c.items){for(const k of R)if(i[k]===undefined)e.push(i.id+" missing "+k);if(ids.has(i.id))e.push("dup "+i.id);ids.add(i.id);n[i.family]=(n[i.family]||0)+1;if(!F.includes(i.family))e.push(i.id+" family");if(!/^(runtime\/[\w-]+\.js:[\w.]+)$/.test(i.implementation))e.push(i.id+" impl");for(const[k,p]of Object.entries(i.params)){if(p.type==="number"&&!(p.min<=p.default&&p.default<=p.max))e.push(i.id+"."+k+" unbounded");if(p.type==="enum"&&!p.enum.includes(p.default))e.push(i.id+"."+k+" enum")}}for(const f of F)if((n[f]||0)<4)e.push(f+" <4");console.log(JSON.stringify({items:c.items.length,per_family:n,errors:e}));process.exit(e.length?1:0)'
```
