# Cinematography: the camera kit and the recipe catalogue

Flat films fail on light, depth and focus, not on timing. `RasanCamera` (`runtime/rasan-camera.js`) gives a composition a real camera: a 3D world built from a focal length, camera moves, depth of field by distance with rack focus, contact shadows, glass, rim light, a key light on a tinted ground that never stands still, speed trails, and grain. It is one browser file with no build step. It is deterministic and seek-safe on the scene's paused GSAP timeline, and it works in stills (styleframes and design boards use the same calls).

This page is the catalogue: each recipe as calls, with the numbers and the reference film that shows it. The numbers come from the measured reference films (R1: Kinso, Sovra, Google "AI Mode", OpenAI "Refreshed", mexicat p(doom), Video-98327). Use them as defaults, not as ceilings.

```bash
node "$SKILL_DIR/scripts/camera.mjs" install --project videos/<name>   # assets/rasan-camera/ (+ assets/vendor/gsap-plugins.min.js)
node "$SKILL_DIR/scripts/camera.mjs" check   --project videos/<name>   # loaded, paused timeline passed in, no randomness, extras within budget
node "$SKILL_DIR/scripts/camera.mjs" demo    --out /tmp/camera-demo    # four reference shots, strip.png, determinism report
```

`video.mjs inject` installs the kit when a composition, `STORYBOARD.md` or a styleframe references `RasanCamera`. It always installs the GSAP plugins bundle, and it adds the missing script tags right after the GSAP tag of compositions that already exist.

## Setup

```html
<script src="../../assets/gsap/gsap.min.js"></script>                 <!-- the composition's GSAP -->
<script src="../../assets/vendor/gsap-plugins.min.js"></script>        <!-- optional: SplitText, CustomEase, ... (registers itself) -->
<script src="../../assets/rasan-camera/rasan-camera.js"></script>      <!-- defines window.RasanCamera -->
<script>
  const tl = gsap.timeline({ paused: true });
  const cam = RasanCamera.stage(document.querySelector("#root"), { lens_mm: 35, tl, duration: 6 });
  cam.ground({ tint: "#f5efe9", falloff: 12, blobs: ["#ffb08a", "#bcd9c5"] })   // ground first, then the key light
     .keyLight({ side: "top-left", color: "#fff5ea", intensity: 0.9, vignette: 0.16 });
  cam.place("#strip", { x: 960, y: 540, z: 0, ry: -9 });
  cam.glass("#strip").shadowLadder("#strip", { elevation: 3 });
  cam.dof({ focus: "#strip", aperture: 1.25 });
  cam.push(0.07, { at: 0, duration: 6, ease: "power1.out" });
  cam.grain({ amount: 0.03 });
  window.__timelines["scene-3"] = tl;
</script>
```

- `stage(root, {lens_mm, tl, duration, fps, aspect, origin, trails})` puts a stage under the root's content: ground, floor shadows, the 3D view and an effects layer on top (vignette, grain, burst). `duration` (or the root's `data-duration`) keeps the ground, grain and drift alive between moves. Without `tl` it is a still: it renders T=0 by itself, or call `cam.seek(t)`.
- `place(el, {x, y, z, rx, ry, rz, scale, anchor, keepSize, dof, plane, shade, trail, fray, haze, opacity})` moves the element into the 3D world. `x, y` is where the anchor sits in frame pixels at z = 0, and z is depth (negative is farther). `anchor` is `[0..1, 0..1]` or a child selector: "put this tick at this point and rotate about it" (x1's frame 04 in one call). `keepSize` compensates perspective so a far word keeps its layout size. Calling `place` again changes the base pose.
- `move(el, {x, y, z, rx, ry, rz, scale, opacity, at:[x, y]}, {at, duration, ease})` moves a layer on the timeline to absolute values.
- Camera legs are relative and add up when they overlap: `dolly(dz)`, `truck(dx, dy)`, `orbit(yaw, pitch, {target})`, `push(fraction)`, `pan/tilt/roll(deg)`, `zoom(mm)` (magnifies and changes perspective), `dollyZoom(mm)` (the vertigo shot), and `drift({push, sway, float, period})` (the hold is never static). Each leg takes `{at, duration, ease}`.
- `cam.state(t)` reports what the camera sees at t (perspective, focus distance, each layer's screen position and blur), for checks. `cam.budget()` counts the budgeted extras.

Rules that keep 3D from flattening (the kit follows them; follow them in your own markup too):
- `filter`, `opacity < 1`, `overflow: hidden`, `mix-blend-mode`, `backdrop-filter`, `clip-path` and `mask` on an ancestor of a 3D layer flatten it. The kit puts them only on leaf layers. Clip with the composition root, never with a 3D parent.
- `place` moves the element into the world. Style placed elements by id or class, not through a parent selector. Positioned 2D overlays stay above the stage. A static element in the root paints under it.
- Do not set `filter` on a placed element itself; put it on a child. The kit owns the layer's filter for depth of field, trails and glow.
- Tilt at most two axes, up to about 35 degrees, for readable UI (x1: steeper tilts make type look sheared). The tabletop slab, at 50 to 60 degrees, is a deliberate exception.

## A. Staging and framing

| # | Recipe | Calls and numbers | Reference |
|---|---|---|---|
| 1 | Hero-component isolation | One component, rebuilt as DOM at 3 to 6x native, 25 to 95% of frame height, at most 2 lines and about 25 characters. `cam.place("#pill", {x: 960, y: 560, scale: 1})`, everything else deleted, not shrunk. | Kinso strip (93% H), Sovra pill, Google slab, OpenAI |
| 2 | Crop past the frame edge | Place so 10 to 40% of the component leaves frame. The active part (caret, newest word, button) stays in the central 60%. `cam.place("#prompt", {x: 760, y: 560, scale: 2.4, anchor: ".caret"})`, then `cam.push(0.05, {duration: 3})`. | Sovra prompt, pdoom bar |
| 3 | Caret-follow camera | Hold the newest word at 55 to 65% W: per word, `cam.truck(wordWidth, 0, {at, duration: 0.3, ease: "power2.out"})` plus one slow `cam.push(0.04)` across the line. Measure word widths from layout once, never from the clock. | Sovra, pdoom |
| 4 | Tabletop slab | `stage({lens_mm: 24..35})` (perspective 0.65 to 1.0 W). `place(slab, {rx: 50..60, rz: -20..-27, anchor: [0.5, 0.36]})`, slide on a 1.2 to 2.0 s `expo.out` `move`, focus band from `dof` (recipe 11). Screen corner radius about 6% of the slab width. | Google AI Mode (demo shot B) |
| 5 | Lean-back entrance that settles | `place(card, {rx: 20, scale: 1.05})`, then `move(card, {rx: 0, scale: 1}, {duration: 0.7, ease: "expo.out"})`. Resting UI within ±5 degrees of frontal. | Google, Kinso pill landing |
| 6 | Shot-scale ladder | ECU over 60% H, CU 30 to 60%, MS 50 to 80% at 1.5 to 2x, WS under 50% (once). Cut-to-cut scale change of at least 1.5x plus one more axis: angle, focal point or ground. Change `scale`/`z` or `lens_mm` per shot. | Kinso, Sovra |
| 7 | Exploded z-layers / parallax | 3 to 5 planes 50 to 300 px apart at 50 mm, total depth under about 15% of the perspective. `place(glow, {z: -240})`, `place(card, {z: 0})`, `place(cursor, {z: 120})`, then `orbit(6, 0, {target: card})`. | Sovra ribbon, Kinso word behind strip |
| 8 | Off-centre focal point | Focal point on a thirds node in at least half the shots. Hand-off across a cut under 15% W: the next shot's `place` puts its hero where the last one ended. | Sovra, Kinso inbox |

The lens: `perspective = width x mm / 36` (`RasanCamera.perspectiveFor(mm, width)`). At 1920 wide: 24 mm = 1280 px, 35 mm = 1867, 50 mm = 2667, 85 mm = 4533, 135 mm = 7200. `perspective: 1000px` on a 1000 px card is a 19 mm wide angle: dramatic, entrances only. A layer at twice the eye distance appears at half size.

## B. Depth and lens

| # | Recipe | Calls and numbers | Reference |
|---|---|---|---|
| 9 | Defocused giant word behind sharp UI | Word 30 to 40% H: `place(word, {z: -1500, keepSize: true, fray: 0.9})`. UI sharp in front: `dof({focus: strip, aperture: 1.25, fray: 0.9})`. The word blurs to 1.5 to 2% H with noise-displaced edges (fray: turbulence 0.085, displacement scaled to the blur). `glass(strip)` lets it show through the rim. | Kinso "here", "somewhere" (demo shot A) |
| 10 | Rack focus | `rack(word, {at, duration: 0.4..0.67, ease: "power2.inOut"})` (12 to 20 frames). Focus eases in 1/distance, like a lens. Rack to an element (it follows the layer) or a z value. Add `{aperture}` to open or close the iris during the rack. | Kinso, Google slab transitions |
| 11 | Tilt-shift focus band | A laid-back plane gets a band automatically when it is large, tilted and its blur really varies across it. Copies of the plane at `levels` blur steps (3 to 5) are masked in plane space along the depth gradient (x1's sharp/soft pair, generalised). About 35% of frame height sharp; ends 0.8 to 1.1% H. `dof({focus: 260, aperture: 1.0, levels: 4})`. Content that types or counts stays in step (copies resync on change). | Google tabletop (demo shot B) |
| 12 | Atmospheric distance | `dof({haze: 0.2..0.35})`: layers behind the focus lose up to 45% contrast and 35% saturation and sink toward the ground's lightness (20 to 35% per plane back). | Sovra back panels, Kinso word |
| 13 | Real motion blur | Designed in: every layer gets a speed trail along its screen motion (180 degree shutter equivalent, from its velocity at t and t - 1/fps). Drafts and stills show it. At delivery `finish.mjs blur` scales the trails to 2/samples and its shutter makes the smear. For plain GSAP moves outside the stage: `RasanCamera.blurTrail(tl, el)` reads the element's x/y tweens, or pass `{dx, dy, at, duration, ease}`. | Sovra cursor (5.5% W smear), pdoom bar exit |
| 14 | Zoom-burst exit | `push(0.3, {duration: 0.4, ease: "power3.in"})` plus `burst({at, duration: 0.35, lines: 40..60, opacity: 0.2..0.4, center})` into a hard cut. Budgeted. | pdoom (demo shot D) |

Aperture: `aperture` is the blur, in % of frame height, of something at twice the focus distance. 1.0 to 1.6 reads as product photography; 2 and up is macro. `max` (default 5% H) caps the foreground blow-up. Per layer: `place(el, {dof: false})` keeps type sharp whatever the focus.

## C. Light and ground

| # | Recipe | Calls and numbers | Reference |
|---|---|---|---|
| 15 | Tinted gradient ground | `ground({tint, falloff: 4..20, angle})`: chroma 2 to 4 in the empty areas, L* range 4 to 20. Brand white still works: a 1 to 2 chroma warm or cool tint with a 4 to 8 L* falloff reads as lit paper, not void. Anti-banding grain is on by default (`grain: 0.02`). | Kinso (peach to sage, L* 20), Sovra (black to violet), v98327 |
| 16 | Off-frame key light that turns | `keyLight({side: "top-left" or [x, y] fractions, may be off frame, color, intensity, spread, vignette: 0.1..0.3})`, a wash over 30 to 60% of the frame. On the story turn: `keyTurn({color, intensity, side}, {at, duration: 0.5..1.0})`, an L* change of 10 to 20. Call `ground` before `keyLight`. | Sovra violet bloom (demo shot C), Kinso warm/cool swap |
| 17 | Living mesh blobs | `ground({blobs: [2 to 4 palette colours], positions, drift: 0.03, period: 8..12})`: soft radial colour fields drifting on seeded sines, finite and deterministic. | Kinso, Sovra |
| 18 | Border comet | `lightComet(el, {at, duration: 1.2..2.0, laps: 1, length: 0.15..0.25, color, width: 1.5..2})`: a tapered streak with a 12 to 24 px halo travels the rounded border and fades out over the last 20%. Budgeted. | Sovra prompt box (demo shot C) |
| 19 | Brand-colour rim glow | `rimLight(el, {colors: [brand colours in order], spread: 30..60, opacity: 0.4..0.75, edge: 2..3, spin: {deg, at, duration}})`: a blurred conic halo behind the object and a crisp colour edge on it. Brand colours only (the product's own functional colours count: a tick green, a focus blue). | Google (demo shot B) |
| 20 | Bloom on the emphasised word | `bloom(el, {amount, to, at, duration, radius: 12..28})`. Inactive words at 25 to 35% opacity, the active one at 100%. Give glowing type padding of at least twice the radius. Budgeted. | Sovra karaoke (demo shot C) |
| 21 | Light sweep / sheen | `sheen(el, {at, duration: 0.5..0.8, angle: 20..30, width: 0.15..0.25, strength, blend: "soft-light" or "normal"})`: one pass, the "real glass" and "done" punctuation. On a white card use `blend: "normal"` on a coloured child (an icon, a button); on glass or dark, `soft-light`. | Sovra button and logo, Google pill |
| 22 | Grain, halation, vignette | `grain({amount: 0.02..0.04})`, re-seeded every frame from T; 0.01 to 0.02 on brand-flat. Vignette comes with `keyLight` (10 to 30%). Halation on a hero: `halation(el, {color: "#ff6a3d", radius, amount})`. Film-wide halation belongs to `finish.mjs grade`. | v98327, pdoom, Sovra, Kinso |

## D. Surfaces and content

| # | Recipe | Calls and numbers | Reference |
|---|---|---|---|
| 23 | Glass card | `glass(el, {rim: 12..20, blur: 16..24, tone: "light"/"dark", stroke})`: a translucent rim with backdrop blur and saturate, a 1 px stroke, a top highlight and an inner edge on the solid face. | Kinso strip (demo A), Sovra player (demo C) |
| 24 | Floating shadow stack | `shadowLadder(el, {elevation: 1..5, alpha})`: Aceternity's five layers scaled by elevation and tinted to the ground's hue (never neutral black). `alpha: true` follows the element's shape. Grounded objects add `contactShadow(el, {mode: "floor"})`: an ellipse under the lowest projected edge that tracks the object. `mode: "plane"` is a tight shadow in the object's own plane (a slab on the table). Without the ground shadow, 3D reads as a skewed div (x1). | Kinso pill, Google slabs, x1 frames 01 and 05 |
| 25 | Real, colourful content | Colourfulness p90 of at least 40: photos, album art, real icons, faces. At least one full-colour area of 10% of the frame or more in a third of the shots. Use images, not canvases, inside banded planes. | Sovra album art, Google photos, Kinso icons |
| - | Light falloff across a plane | Solid surfaces placed with a tilt over 8 degrees get `shade` automatically: the far edge a few percent darker in the ground's hue, a touch of light on the near edge. `place(el, {shade: 0})` turns it off; `shade(el, 0.1)` sets it. | x1 composer planes |

## E. Type

Type sizes and splits are composition work, not the camera's. The camera supplies the depth and light around them.

| # | Recipe | Calls and numbers | Reference |
|---|---|---|---|
| 26 | Giant-vs-tiny ladder | p90/p10 of the biggest line at least 6; 10 to 25% of frames with a line of 20% H or more; one moment at 35 to 60% H; small type at 3 to 4% H. A giant word behind the UI is `place(word, {z: -1200..-1600, keepSize: true})`. | Kinso (39%), pdoom (72%), OpenAI (88%) |
| 27 | Word split by a UI object | Gap = component width + 8 to 12%; letters part over 8 to 12 frames, `power3.out`. The UI sits in the gap: `place(strip, {x: gapCentre})` (demo A: "no|se" with the strip as the i). | Kinso "some|where" |
| 28 | Karaoke emphasis | 0.25 to 0.45 s per word, 3 lines at most, then `bloom` on the active word (budget) or opacity only. | Sovra |
| 29 | Per-word blur ramp | Blur 10 px and 30% opacity per word, staggered 3 to 5 frames, on the hero line only. GSAP SplitText (the plugins bundle) splits it. | Sovra, Google |
| 30 | Type as object | Echo trails of 3 to 6 copies at 1 to 2% H; a chromatic split on the fastest frame: `chromaticSplit(word, {peak: 5..8, at, duration: 0.3..0.45})` (budgeted). | pdoom, Kinso |

## F. Motion grammar

| # | Recipe | Calls and numbers | Reference |
|---|---|---|---|
| 31 | The carrier | One layer moves across beats with `move`. Each transformation takes 0.4 to 0.9 s and can rotate 60 to 90 degrees, with 4 to 6 transformations before a hard cut. | Kinso strip to pill, Sovra |
| 32 | Velocity-matched cut | Out: the last leg uses `power3.in`/`expo.in` over 8 to 12 frames. In: the next shot's first leg uses `expo.out` from frame one, in the same direction. Trails show the speed on both sides of the cut. | Google, pdoom, Sovra |
| 33 | Front-loaded eases and long tails | Legs default to `expo.out`/`power2.out` (landings and pushes) and `power2.inOut` (orbits, pans). 50 to 60% of moves peak in their first third. Every hold drifts: `drift({push: 0.01..0.02, sway: 0.2..0.4, period: 7..10})` or a slow `push(0.03..0.07)` across the shot. | Google, v98327, Kinso holds |
| 34 | Counter as tension | Seek-safe counters: a proxy tween whose setter writes `toLocaleString()`, `expo.in`, `tabular-nums` (the demo's badges). | Kinso badges, Sovra progress |
| 35 | Swell rings | 2 to 4 copies at 1.4 to 1.8x each, staggered 3 to 5 frames, ending near 3x, opacity 100 to 20% (RasanShape or GSAP). | Sovra |
| 36 | Impact punctuation | A halftone disc about 50% W for 6 to 10 frames (RasanShape `dissolve` halftone), or the `burst`. | Kinso, v98327 |
| 37 | Cursor at video scale | 12 to 17% H for a hero click, a curved path over 0.5 to 0.8 s, the trail on the travel, press at 0.85 to 0.9 scale for 3 to 4 frames. Place the cursor as a layer at z 80 to 150 so the depth of field softens it when focus is on the UI. | Sovra hand (16.7% H) |
| 38 | Frame chrome | Mono type at 1.0 to 1.5% H, 30 to 50% opacity, inside the 5% safe margin. Keep it outside the stage (positioned in the root) so it never blurs. | pdoom, v20023 |

## G. Abstract plates

Plates come from `art.mjs plate` (or an `abstract` row in the art plan; `references/imagery.md`): palette-locked abstract renders. The kit makes them move. All of it is a pure function of the timeline time (seek-safe, byte-identical double render), subtle by default.

| # | Recipe | Calls and numbers | Reference |
|---|---|---|---|
| 39 | Living plate ground | `cam.flowGround({src: "assets/art/plate-ground.png", tint: "<the plate's ground>", drift: 0.02, breathe: 0.025, flow: 0.03, warp: 0.02, period: 12..16})`: replaces the flat ground. The plate drifts 2% of the frame and breathes +2.5% on seeded sines; a seeded `feTurbulence` field slides under it (3% per period) through a `feDisplacementMap` of 2% of the frame, so its folds ripple in place. `tint` keeps shadows and haze in the ground's hue. Call it before `keyLight`. Without a file: `{palette: [...ramp], ground, variant, calm}` draws the plate live (an in-page gradient map; a rendered file is smoother). Off a stage: `RasanCamera.flowGround(el, {src, tl, duration})`. | Kinso (peach to sage field), Sovra (violet glow) |
| 40 | Plate behind the UI | A calm plate (`calm 0.5`) as the ground plus `dof({haze: 0.25})`: the UI sharp in front, the plate soft and lower in contrast behind it. Keep text contrast (a light plate under dark type, or glass on the card). | Kinso inbox on the field |
| 41 | Zoom through a plate | `cam.plateTransition({at: <the cut>, src: "assets/art/plate-through.png", duration: 0.8..1.1, from: 1, to: 2.4, center: [x, y]})`: the plate fades up over 42% of the window while it swells (exponential zoom, constant felt speed), covers the cut, and opens on the next beat over the last 38%. Budgeted (2 per film); off a stage `RasanCamera.plateTransition(tl, {at, src, host})`. A vortex or a horizon plate reads as travel; give the next beat's first leg an `expo.out` in the same direction. | Sovra beat changes |
| 42 | End-card field | The end card sits on a plate in the brand colours (`horizon` or `fold`, `calm 0.3`), flowGround on, the logo file on top with clear space; nothing else moves. | Kinso, Sovra end cards |

## H. Camera from meaning, and the echo

Each beat names its camera as one of eight kinds, and one shot is the signature (the move is chosen from what the beat buys: locked where the UI or type acts, a push toward the importance-3 hero, a pull-out for scale; one signature shot, on the peak). The kit's legs map onto them:

| Kind | RasanCamera | When |
|---|---|---|
| locked | no leg (a `drift` on the ground only) | the UI or the type itself acts |
| push-in | `push(0.06..0.15)`, `dolly(-dz)`, `zoom(mm)` | toward what matters; T1 to T3 |
| pull-out | `push(-f)`, `dolly(+dz)` | reveal the context, the payoff wide |
| pan-truck | `truck(dx, 0)`, `pan(deg)`, `orbit(yaw)` | follow an action across, a caret, a row |
| tilt | `truck(0, dy)`, `tilt(deg)` | down a list, a stream, a page |
| rotate | `roll(deg)` | a turn of the world, rarely |
| handheld-drift | `drift({sway, float})` | a lived-in hold; never on small type |
| whip | `truck` or `pan` in 0.15 to 0.3 s with trails, into a cut | the signature seam, once |

The score's `camera` per beat starts with the kind ("push-in: toward the slot, 1.0 s expo.out") and `signature_shot: {beat, move, why}` names the one shot. `motion-gate.mjs` reports each beat's measured camera beside it and warns `camera-monotone` only when no beat names a camera, or the film never moves (`references/craft.md` "Camera from meaning" has the measure and the reference table). The film's ending also echoes its opening (`echo: {opening, ending, change}`; craft.md "Echo"): a camera that opened on the composer can close on it, pulled out.

## Budgets

`chromaticSplit`, `halation`/`bloom`, `lightComet`, `burst` and `plateTransition` are budgeted extras: hero only, at most 3 of each per film (plateTransition: 2), each with a reason in the score's `budget` entries. `camera.mjs check` warns `over-budget` and `cam.budget()` counts them at runtime. Using the same effect on every element is still the tell. Ground (a flat tinted ground or a flowGround plate), key light, shadows, glass, depth of field, trails and grain are the default finish, not extras.

## The demo, and what it proves

`camera.mjs demo` renders four shots of a fictional product, "Murmur", one per reference grammar: Kinso (a giant defocused "no|se" split by a glass strip, badges counting, rack to the word), Google (a 28 mm tabletop slab with a focus band, a peach-to-violet brand rim and a diagonal slide), Sovra (a near-black violet ground, a key light that blooms on the turn, a light comet on a dark glass prompt, foreground cover art out of focus) and a depth stack (three cards with haze by distance, an orbit, a sheen, a push and a burst into the cut). It checks that every function changes the frame over time, that every frame is byte-identical when seeked again in reverse order, and that two separate browser launches render byte-identical frames (software GL; `--gpu` for the Mac's GPU). About 20 s.

## Limits

- The focus band copies a plane's DOM (3 to 5 copies). Copies resync when the plane's HTML changes, and canvases are re-drawn into them, but a canvas inside a banded plane renders differently depending on seek history (found by the demo's double render). Use an image (canvas.toDataURL) for art on tilted slabs.
- `backdrop-filter` inside the 3D world sees only what Chrome composites behind that layer. The glass rim still reads as a translucent rim when there is nothing to refract.
- Trails approximate direction per layer from its centre (axis-aligned blur after undoing the layer's roll). A spinning layer gets no rotational blur; use `finish.mjs blur` for that.
- Floor shadows are 2D, drawn on the ground under every 3D layer.
