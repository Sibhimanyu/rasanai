# Vocabulary: art-directing in code

The working vocabulary Claude uses to turn a direction ("a slow push on the device, rim-lit, warm negative grade, whip pan into the reveal") into build instructions a frame worker can execute without interpreting anything. Each term has a one-line definition and a recipe with numbers for HTML, CSS, GSAP, SVG or canvas. The taxonomy (`taxonomy/dimensions/*.json`) says **which** terms a film uses; this file says **how** each one is built. The rules for when to use them are in `references/craft.md`.

## Conventions

- **World.** All scene layers sit inside one wrapper, `#world`. The virtual camera is a transform on `#world` only; objects animate inside it. Set `transform-origin` to the point of interest before scaling.
- **Depth factor d.** Per layer: about 0.2 for the far background, 1 for content, 3–6 for a near foreground. A camera move of distance D moves each layer D × d.
- **Deterministic.** Every tween lives on the paused GSAP timeline (no CSS animations or transitions, no `requestAnimationFrame`). All randomness is seeded (for example mulberry32) and sampled on the **integer frame index**, so every seek renders the same frame.
- **Numbers** are for 1920×1080 at 30 or 60 fps. Sizes as "% of short side" hold in every aspect. Durations are starting values: the film's `motion.md` duration scale wins.
- **Cost.** Full-frame SVG filters and large blurs are slow to render. Pre-blur static layers once, keep blur radii under about 40 px, and prefer a 256–512 px noise tile over a full-frame `feTurbulence`.
- **Specify, don't describe.** Every instruction names the element, the property, the values, the ease and the time: "the card scales 0.96 → 1 with opacity 0 → 1 in 0.45 s on `power3.out` at 2.4 s", never "the card pops in nicely".

## Writing a scene's build instruction

Compile each scene into labelled blocks, in this order (quote all copy verbatim; unquoted text gets paraphrased):

```
Scene 3: "The reveal" · 4.5 s · 1920x1080
Beats:    0.0 cursor enters from right edge on an arc (0.6 s, power3.out) → 0.8 click on "Send" (press 0.1 s) →
          0.9 panel scales from the button 0.96→1 (0.45 s, power3.out) → 1.6 line "Replies in 2 minutes." mask-rises (0.5 s, expo.out) → hold to 4.5
Copy:     "Replies in 2 minutes."
Camera:   T2 focus zoom 1.0→1.6x on the composer, 0.8 s power3.inOut at 0.2, then locked
Depth:    bg d=0.2 (blurred app chrome), content d=1; no occluder
Light:    key upper-left warm #fff1e0 12% soft-light; rim 1px on right edges; shadows fall down-right
Grade:    warm negative (lift 5%, warm +4%, sat 0.9, grain 4% per-frame)
Sound:    click on the press frame (0.8 s); soft land on panel settle (1.35 s); no whoosh
Spectacle: none (restraint; the spectacle beat is scene 5)
Negatives: no fade-up on the line, no overshoot on the panel, no idle motion during the hold
Handoff out: panel at x 960, y 540, scale 1.6 (world), opacity 1, still → carried into scene 4
```

---

## 1. Camera

### Shot sizes and angles

| Term | What it is | Recipe |
|---|---|---|
| Extreme close-up (ECU) | One detail fills the frame (a digit, a button). | World scale so the detail spans 60–90% of frame width; crop everything else out of frame. |
| Close-up (CU) | One object or component fills the frame. | Subject 50–70% of frame height; context cropped. |
| Medium shot | The subject with a little context. | Subject 30–50% of frame height; some surroundings visible. |
| Wide / establishing | The whole scene or the full interface, for orientation. | Everything in frame with 8–12% margins; hold briefly, then push in. |
| Insert / cutaway | A quick cut to a detail, then back. | A 0.6–1.5 s shot of the detail at ECU, hard cuts in and out. |
| Top-down / flat-lay | Looking straight down at a surface. | Orthographic, no perspective; objects arranged on a table plane; shadows directly under. |
| Low angle | Looking up at the subject: power, scale. | In a `perspective: 1200px` container, `rotateX(-8deg to -15deg)` on the world; subject bottom anchored. |
| High angle | Looking down at the subject: overview, smallness. | `rotateX(10deg to 20deg)` on the world; subject slightly smaller. |
| Dutch angle | A tilted horizon: unease, energy. | `rotate(6deg to 15deg)` on the world, static or drifting 1–2°; use once. |
| Isometric | 3D shown without perspective at fixed 30° axes. | `transform: rotateX(54.736deg) rotateZ(45deg)` on a flat plane, or draw on a 30° grid; no vanishing point. |
| Orthographic 3D | 3D objects without perspective distortion. | Three.js `OrthographicCamera`; or CSS 3D with `perspective: none`. |

### Movement

| Term | What it is | Recipe |
|---|---|---|
| Locked-off | The frame never moves. | No world transform at any time; all change is objects moving inside the frame. |
| Push-in / dolly-in | The camera moves toward the subject; near layers grow faster (parallax). | Each layer scales 1 → 1 + k·d (world k = 0.04–0.08 over the shot), `power1.inOut`; ease over a window about 10% longer than the shot so it never settles on screen. |
| Pull-back / dolly-out | The camera moves away, revealing context. | Inverse of push-in; bring new elements in at the edges as they enter frame. |
| Zoom (optical) | Magnification with no parallax: flat, "lens" feel. | Uniform scale on `#world` only (no per-layer difference). |
| Focus zoom (screen-studio) | A zoom into a UI region so the action fills the frame. | World scale 1 → 1.3–2.5× with `transform-origin` at the target, 0.6–0.9 s `power3.inOut`, then hold locked; zoom back to 1× before the next target. |
| Crash zoom | A violent, fast punch-in: impact, comedy. | Scale 1 → 1.5–2 in 0.15–0.25 s `expo.in`; radial blur (scaled low-opacity copies) at peak; optional 1–2 frame white flash. |
| Snap zoom | An instantaneous scale jump. | `tl.set('#world', {scale: 1.4})` on a beat; optional 2-frame 3% overshoot settle. |
| Punch-in | A cut-like scale step within the same shot. | Instant world scale step 1 → 1.15–1.25 on a downbeat. |
| Truck / track | The camera moves sideways; layers slide at depth-dependent rates. | translateX of each layer by D × d (floor 1:1, distant structures ×0.2), 1.5–3 s `power2.inOut`. |
| Pan | The camera rotates on the spot; almost no parallax. | 2D: translateX of the whole world (equal on all layers). 3D: `rotateY(5–20deg)` on a `preserve-3d` world for edge keystone. |
| Tilt | The camera rotates vertically on the spot. | translateY of the whole world, or `rotateX` in a perspective container. |
| Pedestal / crane | The camera rises or falls; a crane reveal rises over a subject. | translateY the world plus a small `rotateX` tilt; unmask the content revealed below; 1.5–3 s `power2.inOut`. |
| Arc / orbit | The camera circles the subject. | Three.js camera orbit (preferred); CSS `rotateY` on a `preserve-3d` group; 2D fake: layers counter-translate on a sine with depth-weighted amplitude. |
| Whip pan | A pan so fast it blurs, often hiding a cut. | translateX 0 → ±frame width in 0.15–0.3 s `expo.inOut`; directional blur (`feGaussianBlur stdDeviation="40 0"`, or 4–6 offset copies at falling opacity) peaking at max velocity; cut at the blur peak. |
| Dolly zoom (Vertigo) | Subject stays the same size while the background stretches or compresses. | Subject layer scale constant; background layer scales 1 → 1.3 while the world pulls back (or Three.js: move the camera back while narrowing fov). Needs 2+ separated planes. |
| Rack focus / focus pull | Focus shifts from one plane to another. | Crossfade `filter: blur()` between planes (foreground 0 → 8 px while background 8 → 0 px), 0.5–0.8 s, plus 1–2% world scale "focus breathing". Blur layers, never the whole frame. |
| Handheld | Small organic camera shake. | Seeded 1D noise on world x/y (1–4 px) and rotation (0.1–0.5°) at 0.5–2 Hz, sampled per frame. "Micro-shake" = sub-pixel. |
| Snorricam | The subject is fixed while the world swings around it. | Subject layer fixed at center; background gets handheld noise plus larger rotation and translation. |
| Bullet time | Time freezes while the camera keeps moving. | Hold the subject timelines (`timeScale(0)` or held progress) while the camera orbit and parallax continue; debris held in place. |
| Speed ramp / time remap | The action speeds up and slows down within one shot. | Nest the action in a child timeline and tween its **progress** with `CustomEase` or `expo.inOut` (fast → slow on the hit → fast), or tween `timeScale` 1 → 0.2 → 1. Never wall-clock time. |
| Freeze frame | The action stops dead, often with a label. | Hold child-timeline progress; keep a 1–2% world push so the frame still lives; optional flash plus label. |
| Through-object move | The camera passes through a window, keyhole or letter into the next scene. | Scale the aperture element up until it exceeds the frame (1 → 8–20×, `power3.in`, 0.4–0.6 s) with the next scene revealed inside it. |
| Camera journey (oner) | One continuous camera move across a large world with rests at each station. | Lay stations out on one big world; tween world x/y/scale between them (sweep 0.6–1.2 s `power3.inOut`), rest 1.5–2.5 s at each while the station's content resolves. |
| Motivated camera | A move caused by the action. | Tie each camera tween's start to an event (a click, a landing, the voiceover naming the thing). |

## 2. Lenses and optics

| Term | What it is | Recipe |
|---|---|---|
| Wide lens (14–24 mm) | Exaggerated space and distortion. | Short `perspective` (600–900 px) on 3D containers; stronger parallax (foreground d = 5–6). |
| Normal lens (35–50 mm) | Natural, documentary perspective. | `perspective` 1200–1600 px; foreground d ≈ 2–3. |
| Telephoto (85–135 mm+) | Compressed, flattened depth. | Long `perspective` (2500 px+) or orthographic; weak parallax (d range 0.7–1.3); blurred background. |
| Macro | Extreme detail at very shallow focus. | ECU framing, background blur 12–20 px, contrast reduced 10% on far planes. |
| Shallow depth of field | Only one plane is sharp. | Blur non-subject planes 6–20 px by distance; lower their contrast 5–15%. |
| Bokeh | Out-of-focus light discs. | Blurred radial-gradient discs (screen blend, 20–60% opacity), seeded positions; anamorphic bokeh = discs scaled Y 1.4–1.6. Only with a motivated light source. |
| Anamorphic | Widescreen lens with oval bokeh and horizontal flares. | 2.39:1 letterbox bars; oval bokeh; horizontal streak flares (below); slight edge falloff (vignette 20%). |
| Anamorphic flare | A thin horizontal streak through a bright source. | A 2–4 px tall linear-gradient streak (bluish #8fb4ff center to transparent, 40–80% of frame width), screen blend, tracking the source; faint ghost discs on the opposite side. |
| Lens flare (spherical) | Ghost circles and glare from a bright source. | Radial ghosts along the line from the source through center, 10–25% screen. Rarely; tie to a visible source. |
| Tilt-shift | A band of focus that makes scenes look miniature. | Sharp horizontal band (25–35% of height); blur rising to 8–14 px above and below (masked blurred copies); saturation +10%. |
| Vignette | Darkened frame edges. | Radial gradient overlay, transparent center → black at 20–35%, multiply. Static. |
| Chromatic aberration | Color fringing at the edges. | 3 channel copies (via `feColorMatrix`) offset 1–3 px radially, screen; edges only; animate only for 2–6 frames on an impact. |
| Barrel / fisheye distortion | Straight lines bow outward. | WebGL shader, or SVG `feDisplacementMap` with a radial map (canvas pipeline). |
| Diffusion filter (Pro-Mist) | Highlights bloom softly and blacks lift slightly. | Bloom (blurred bright copy 20–40 px at 20–30% screen) plus a 2–4% black lift. |
| Motion blur | Streaking along the direction of fast movement. | Directional SVG blur proportional to velocity; a smear frame (a stretched duplicate for 1–2 frames); or 4–6 averaged subframes if the renderer supports it. Never across a cut. |
| 180° shutter | Natural, filmic blur. | Blur length about half the per-frame travel distance. |
| 45–90° shutter | Staccato, crisp, strobing motion. | No motion blur on fast moves; optionally quantize positions per frame. |
| On twos / threes | Animation held for 2 or 3 frames per drawing: handmade feel. | Drive poses from `Math.floor(frame / 2)` (or 3) with seeded variation; `steps()` eases. |
| Overcrank / undercrank | Slow motion / sped-up motion. | `timeScale` 0.25–0.5 / 1.5–3 on the child timeline. |

## 3. Lighting

Every scene has one named source with a direction and a color; every gradient, highlight, rim and shadow agrees with it. Options and full prompts: `taxonomy/dimensions/lighting.json`.

| Term | What it is | Recipe |
|---|---|---|
| Key light | The main source that models the subject. | Linear-gradient overlay on each subject from the key side: #fff1e0 → transparent across 60% of its width, 12–18% soft-light. |
| Fill light | A weaker light on the shadow side. | Opposite-side gradient at a third to a half of the key's opacity, slightly cool (#e3ebff). |
| Key-to-fill ratio | How dark the shadow side is: 1:1 flat, 3:1 commercial, 8:1 dramatic. | Set fill opacity = key opacity ÷ ratio. |
| Rim / edge light | A bright line along the far edge. | 1–2 px inset highlight (`box-shadow: inset -1px 0 0 rgba(255,255,255,.6)`) or a masked gradient stroke; plus a 6–12 px outer glow at 10–15%. |
| High-key | Bright, low contrast, few shadows. | Backgrounds #f4f4f2–#fafaf8; contact shadows only (blur 3–5% of object height, 8–14%). |
| Low-key / chiaroscuro | Dark scene, subject carved out by a hard key. | Background #0b0b0d–#15151a; elliptical light pool on the subject; shadow side ≤ 12% brightness. |
| Split side light | Hard 90° side light cutting the subject in half. | Gradient with a sharp transition (stops 48%/52%) from lit (white 20–30% soft-light) to shadow (black 35–50% multiply). |
| Silhouette / backlight | Dark subject against a bright field. | Bright background (flat or radial glow); subject solid dark; 1–3 px light wrap on the outline. |
| Top light | Light straight down; shadows pooled under objects. | Vertical gradient per subject (lit top); ellipse shadows under objects (height 12–18% of width). |
| Motivated light / practical | Light from a visible source in the scene (a lamp, a screen). | Place the source; derive the key direction and color from it; add its glow and spill. |
| Screen glow | The product's screen lights its surroundings. | Surroundings 8–18% brightness; spill radial in the UI's dominant color at 20–35% screen; update the spill when the UI changes. |
| Neon practical | A glowing tube or sign lighting a dark scene. | 3–6 px core plus stacked glows (4 px 90%, 16 px 50%, 48 px 20%, same hue); colored spill on nearby surfaces 15–30% screen; flicker seeded, only as an event. |
| Colored gels | Off-screen colored lights washing the subject. | Two opposite-side gradients in two hues at 30–45% color/overlay, overlapping 10–20%; switch colors only on downbeats. |
| Mixed warm/cool | Two sources of different temperature. | Warm key #ffcf9e 15–22% from one named source; cool spill #b9ccff 10–15% from another. |
| Color temperature | Warmth of a light in kelvin. | Tungsten 3200K ≈ #ffc58f–#ffd9a8; daylight 5600K ≈ #fff8f0; overcast 6500–7500K ≈ #eef3ff; blue hour 9000K+ ≈ #9fb8ff. |
| Golden hour | Low warm sun, long soft shadows. | Warm key #ffb870 20–30% from a low side; shadows 2–4× object height, blue-violet #3a3f7a at 25–35%; glowing rims facing the sun. |
| Blue hour | Deep blue ambient with warm practicals. | Ambient gradient #5b6fb3 → #1f2a52; warm practicals #ffc27a with 2-radius glows switching on on beats. |
| Overcast | Diffuse, shadowless, cool. | No directional key; contact shadows only; cool overlay #eef3ff 6–10% soft-light. |
| Hard noon | High hard sun, crisp dark shadows. | Shadows 0–2 px blur, straight down, 45–60%; saturation +10–20%. |
| Window light | Soft side daylight with falloff, maybe blind stripes. | Broad gradient from one side (18–25% soft-light) to darkening (10–15% multiply) on the far side; optional skewed soft bands. |
| Volumetric light / god rays | Visible beams through haze. | 3–7 blurred conic or linear gradient beams (20–40 px blur, screen, 12–25% overall); dust motes only inside the beams; once, at the reveal. |
| Atmospheric haze | Far layers paler and lower in contrast. | Overlay the background color at 15% per plane; `contrast(0.9/0.8/0.7)` by distance. |
| Spotlight pool | A bounded circle of light isolating one subject. | Full-frame black overlay 85–90% with a radial-gradient hole; snap on with `set()` on a beat or move over 0.3–0.5 s. |
| Studio sweep | A seamless curved backdrop with softboxes. | Radial background brightest just behind the product; long soft highlight bands on the product (white 25–45%, 10–20 px blur, clipped); contact shadow or floor reflection. |
| Specular sweep / glint | One band of highlight passing over a glossy surface. | Linear-gradient band at 20–25° (white 55–75% at center, 12–20% of object width), clipped to the object, −30% → 130% in 0.5–0.7 s `power2.inOut`, once, after landing. |
| Bloom | A glow bleeding from bright areas. | Duplicate the bright layer, blur 12–40 px, screen at 30–60%; Three.js `UnrealBloomPass`. Judge it at 1:1. |
| Negative fill | Deepening one side of a subject by removing light. | Multiply a dark gradient (black 15–25%) on the side away from the key. |

## 4. Color grade and film stock

A grade is a global transform after lighting. Film-stock names never go to a builder as-is: break them into the parameters below. Options and full prompts: `taxonomy/dimensions/color-grade.json`.

### Parameters and how to set each

| Parameter | What it controls | Recipe |
|---|---|---|
| White balance | Warm or cool cast. | `feColorMatrix` channel gains (warm: R ×1.03–1.06, B ×0.94–0.97), or a multiply solid (warm #fff0e0 / cool #eef4ff at 50–80%). |
| Tint | Green–magenta axis. | G ×1.01–1.03 (green) or R and B ×1.02 (magenta). |
| Black point / lift | Whether shadows reach true black. | `feComponentTransfer` type linear per channel: `intercept` = the lift (0.03–0.1), `slope` = 1 − lift − headroom. Tinted lift: a solid dark color in `mix-blend-mode: lighten`. |
| Crush | Shadows clamped to black. | Table curve starting '0 0 0.12 …' so the bottom ~15% maps to 0. |
| White point / roll-off | How highlights compress before white. | Top of the table curve below 1 (0.95–0.97) for a soft roll-off; clip to 1 early for hard slide-film highlights. |
| Contrast curve | S-curve strength. | `feComponentTransfer` type table, e.g. soft '0 0.05 0.3 0.58 0.8 0.95', hard '0 0 0.12 0.5 0.9 1 1'; or CSS `contrast(0.9–1.3)`. |
| Saturation | Overall color intensity. | `feColorMatrix type="saturate" values="0.4–1.3"`. |
| Split tone | One hue in the shadows, another in the highlights. | Shadow tint: dark solid in `lighten` blend; highlight tint: light solid in `multiply` blend. |
| Hue shift | Moving one range (greens toward teal, reds toward orange). | `feColorMatrix type="matrix"` channel mixing; a shader for precise ranges. |
| Gradient map | Luminance mapped between two colors. | Desaturate, then `feComponentTransfer` table per channel from the shadow color to the highlight color. |
| Grain | Film texture. | Seeded noise tile, overlay or soft-light, 3–12%; per-frame re-roll by jumping the tile offset each frame. |
| Halation | Red-orange glow around bright edges and lights. | Threshold the bright areas (steep `feComponentTransfer` table), blur 6–20 px, tint #ff4a1c, screen 20–40%, highlights only. |
| Vignette | Edge falloff. | Radial gradient, multiply, 15–35%. |

Canonical grade filter (warm negative), applied to `#world` or to photo layers:

```html
<svg width="0" height="0" style="position:absolute"><filter id="grade" color-interpolation-filters="sRGB">
  <feColorMatrix type="matrix" values="1.04 0 0 0 0  0 1 0 0 0  0 0 0.94 0 0  0 0 0 1 0"/>   <!-- warm +4% -->
  <feComponentTransfer>                                                                  <!-- lift 5%, soft roll-off -->
    <feFuncR type="table" tableValues="0.05 0.3 0.58 0.8 0.93 0.97"/>
    <feFuncG type="table" tableValues="0.05 0.3 0.58 0.8 0.93 0.97"/>
    <feFuncB type="table" tableValues="0.05 0.3 0.58 0.8 0.93 0.97"/>
  </feComponentTransfer>
  <feColorMatrix type="saturate" values="0.9"/>
</filter></svg>
<style>#world { filter: url(#grade); }</style>
```

Split tone with two overlays (above the content, below the texture):

```css
.tone-shadows    { position:absolute; inset:0; background:#0f3a40; mix-blend-mode:lighten;  }  /* shadows lift toward teal */
.tone-highlights { position:absolute; inset:0; background:#ffe0c2; mix-blend-mode:multiply; }  /* highlights pull toward orange */
```

### Grades and stocks, decomposed

| Look | WB / tint | Blacks | Curve / highlights | Saturation | Split tone | Texture |
|---|---|---|---|---|---|---|
| Clean neutral | neutral | brand darkest | normal | 1.0 | none | 2% dither only if banding |
| Crushed high-contrast | neutral | crushed | hard S, clip | 1.05–1.1 | none | none |
| Pastel matte (lifted blacks) | neutral | lift 10%, tinted floor | soft, top 0.96 | 0.8–0.85 | tinted floor | grain ≤ 3% |
| Bleach bypass | slightly cool | deep | hard S + luminance overlay 35–50% | 0.45–0.55 | none | grain 5–8% |
| Teal and orange | neutral | teal floor | contrast 1.1 | 1.1 | shadows #0f3a40, highlights #ffe0c2 | optional |
| Subtle split tone | neutral | cool floor #10161f | 1.03 | 0.95 | highlights #fff4e6 | none |
| Cross-process | channel-mixed | magenta-blue floor | contrast 1.25, highlights clip | 1.3 | yellow-green highs, blue lows | grain 6–10% |
| Warm negative (Portra-like) | warm +4% | lift 5% | soft roll-off 0.97 | 0.9, greens lower | none | fine grain 3–5% |
| Tungsten night (500T / CineStill-like) | cool ambient, warm practicals | teal floor | contrast 1.08 | 0.95 | teal lows | grain 6–9%, red halation 8–16 px |
| Slide film (Ektachrome-like) | slightly cool | clean 0–2% | firm, highlights clip | 1.2 | none | very fine 2–4% |
| Kodachrome-like | warm | dense | contrast 1.12 | 1.25, reds and yellows up | none | fine 3–5% |
| Muted green (Fuji-like) | cool-green | lift 4%, cool floor | soft | 0.85 | cool lows | fine 3–5% |
| Print film (2383-like) | warm highs | neutral-cool | soft toe and shoulder | 1.05 | warm highs, cool lows | 3–5% |
| High-contrast B&W (Tri-X-like) | — | deep | hard | 0 (luminance matrix) | none | 7–10%, coarse |
| Tinted monochrome | one hue | tinted | 1.05 | 0 then tint | shadow + highlight of one hue | 4–8% |
| Duotone grade | — | shadow color | contrast 1.1 before map | map | two colors | optional |
| Day-for-night | strong blue | crisp | brightness 0.45–0.55, contrast 1.1 | 0.4–0.5 | darkened sky | none |
| Desaturated documentary | neutral-cool | slight lift | 0.95–1.0 | 0.65–0.75 | none | 2–4% if clean digital |
| Cool clinical | cool | neutral-cool | 1.08 | 0.8 (accent exempt) | none | none |
| Faded warm vintage | yellow-warm | lift 10%, warm floor | 0.92 | 0.75 | warm | grain 8–12%, vignette 25–30%, gate weave |
| Bright and airy | slight warm | lift 10% | brightness 1.06–1.1, contrast 0.9 | 0.85 | none | ≤ 2% |
| Video tape (VHS / DV) | slight green | crushed | blooming highs | 1.15, hot reds | none | chroma offset 2–4 px, 0.6–1 px blur, scanlines |

Other stock shorthand: **Super 8 / 16 mm** = heavy grain 12–18%, gate weave 0.5–1.5 px, flicker ±3–5%, soft edges, vignette 30%; **Ilford HP5** = B&W softer than Tri-X with finer grain; **Vision3 250D** = clean daylight negative, neutral, fine grain.

**Brand check.** After grading, the logo, UI and accent stay within roughly delta-E 5 of the brand hex; otherwise grade only the photographic and atmospheric layers.

## 5. Editing and transitions

| Term | What it is | Recipe |
|---|---|---|
| Hard cut | An instant change of shot. | A clip boundary (`data-start` / `data-duration`), on a downbeat or up to 2 frames early. |
| Jump cut | A cut within the same shot that skips time. | Same framing, content jumps forward; 2–4 in quick succession for energy. |
| Match cut | Outgoing and incoming shots share a shape, position, color or motion. | The out-element and in-element share x, y, size, shape and color at the seam (FLIP-style handoff); write the handoff numbers. |
| Cut on action | Cutting in the middle of a movement so it continues. | Cut at peak velocity; the incoming shot continues the same direction and speed. |
| Cut-the-curve | A phrase or object slides across the seam unfinished. | Out: x 0 → −230 px on `power4.in`; in: +230 → 0 on `power4.out`, same duration (≈ 0.25 s each). |
| Waterfall cut | Words fall away one by one into the cut. | Exit stagger ~0.022 s per word; the last word dies exactly at the cut; incoming entry gaps shrink ×0.84 per word. |
| Smash cut | An abrupt jump from quiet to loud (or calm to chaos). | Hard cut plus an audio jump; often after a held silence of 0.3–0.8 s. |
| Flash frame | 1–2 frames of white (or black) at a seam. | A full-frame layer at opacity 1 for 1–2 frames on the cut. |
| Punch-in | A scale cut within one shot. | Instant world scale 1 → 1.15–1.25 on the beat. |
| Invisible cut | A cut hidden inside a whip or behind a passing object. | Cut at the whip's blur peak, or while a foreground object covers ≥ 95% of the frame. |
| Object wipe | A foreground object crosses the frame and reveals the next shot. | A large element translates across in 0.3–0.5 s; the scene swaps while it covers the frame. |
| Push / slide | The next scene pushes the current one out. | Both containers translate together by the frame width, 0.35–0.5 s `power3.inOut`, in the film's direction. |
| Cover / reveal | The next scene slides over (cover) or the current slides off to reveal (reveal). | Translate one container only. |
| Wipe | A moving edge replaces one shot with another. | `clip-path: inset()` (linear), `polygon()` (diagonal), `circle()` (radial) or a conic mask (clock), 0.35–0.5 s `power3.inOut`. |
| Iris | A circle closes to a point or opens from one. | `clip-path: circle(r at x y)` from 0 to 150% of the diagonal, 0.3–0.5 s, centered on the subject. |
| Color-field wipe | A solid band of color crosses the frame. | A full-bleed accent rectangle scaleX 0 → 1 from one edge (0.2 s), holds 1–2 frames, exits the other side; optional second band 60–80 ms behind. |
| Flood and contract | A shape grows to fill the frame, then contracts into the next scene. | Circle scale to ≥ 1.2× the frame diagonal in ~0.3 s `power3.in`, swap, contract onto the next scene's element. |
| Zoom-through | Flying into an element to reach the next scene. | Exit: scale 1 → 1.2 `power3.in` 0.2 s, opacity split to a linear tween, cut at opacity 0.15; entry: 0.75 → 1 `expo.out` 0.5 s. |
| Inverse zoom | Pulling back out of a detail to arrival or payoff. | Entry from scale 1.2–1.4 → 1 `expo.out` 0.5–0.7 s. |
| Shared-element morph | One element transforms into the next scene's element. | Tween position, size, radius and color between the two states (FLIP); morph paths with MorphSVG or flubber; container before content. |
| Dissolve / crossfade | One shot fades through the other. | Opacity crossfade of scene containers, 0.5–1.0 s; only for time passing or mood, never between busy layouts. |
| Dip to color | Fade through black, white or a color. | Fade out to a color layer, then in; 0.3–0.6 s total. |
| Luma-matte transition | The next shot is revealed through a moving brightness pattern. | `mask-image` with an animated gradient or noise texture; WebGL dissolve for organic edges. |
| Glitch transition | Slices displace and channels split across the seam. | Seeded `clip-path` bands offset ±20–80 px plus RGB split, 4–8 frames. |
| Light-leak / film-burn transition | Warm light blows out the frame at the seam. | Large blurred warm radial blobs (orange / magenta) sweeping across in screen blend, peaking near white on the cut, 0.4–0.8 s. |
| Page turn / paper tear | A physical sheet peels or tears away. | A 3D `rotateY` peel with a moving shadow, or a torn-edge SVG mask translating off. |
| J-cut | The next shot's audio starts before its picture. | The audio element's `data-start` 0.3–1.0 s earlier than the visual clip boundary. |
| L-cut | The current shot's audio continues over the next picture. | Audio ends 0.3–1.0 s after the visual boundary. |
| Beat-cut | Cutting on the music's grid. | Cut times from the analysed beat grid (`hyperframes beats`); major changes on downbeats, minor on off-beats. |
| Montage | A rapid sequence of shots that builds an idea. | 0.4–1.2 s shots on the beat, one idea each, a consistent framing rule. |
| Cold open | The film starts mid-action, before any title. | Frame 0 is the action; the title arrives after the hook. |
| Pattern interrupt | One deliberate change that re-hooks attention. | Change exactly one thing (color field, scale, direction, sound) every 2.5–5 s in short pieces. |
| End card / lockup / button | The final frame and the final punctuating move. | Lockup lands, one settle, holds 2–3 s; the "button" is one last small move or hit on the final beat. |
| Lower third | A name or label in the lower part of the frame. | Bottom 20–30% band inside safe areas; mask-rise in 0.4 s, hold ≥ reading time, exit 0.25 s. |
| Super | Text superimposed over picture. | Sentence case, ≥ 3.5% of short side, a scrim or shadow only if contrast needs it. |

## 6. Animation principles

| Term | What it is | Recipe |
|---|---|---|
| Ease out (decelerate) | Fast start, soft landing: entrances. | `power3.out` / `expo.out` (or `cubic-bezier(0.16, 1, 0.3, 1)`). |
| Ease in (accelerate) | Slow start, fast end: exits and impacts. | `power2.in`; `power4.in` / `expo.in` for slams. |
| Ease in-out | Slow, fast, slow: moves on screen and camera. | `power2.inOut` / `power3.inOut`; `sine.inOut` for dreamy drift. |
| Linear | Constant speed. | `none`; only tickers, marquees, progress, opacity splits. |
| Arrive fast, land soft | Most of the travel in the first third, a long settle. | `expo.out`; each frame covers ~12–19% of the remaining distance. |
| Spring | Physics-like motion defined by stiffness and damping. | Critically damped ≈ `expo.out`; slight bounce ≈ `back.out(1.2)`; `elastic.out(1, 0.4)` only for springy styles. |
| Overshoot | Passing the target and settling back. | `back.out(1.2–1.6)`, ≤ 8%, single settle, transforms only; never on type, logos or values. |
| Anticipation | A small counter-move before the main move. | −4 to −8 px (or scale 0.95) for 60–120 ms, then the move; or `back.in` on exits. |
| Follow-through / drag | Parts keep moving after the main body stops. | Children (shadow, trailing panel) run the same tween 1–3 frames later or with a softer ease. |
| Overlapping action | The next motion starts before the previous one ends. | Stagger offsets shorter than each item's duration. |
| Secondary action | A supporting motion caused by the primary one. | The sparkline draws as the number counts; dust puffs on a landing. It must have a cause. |
| Squash and stretch | Volume-preserving deformation on impact. | scaleX/scaleY inverse (1.15/0.87) at the contact point for 2–4 frames; playful styles only. |
| Arcs | Natural motion travels on curves. | MotionPathPlugin, or x linear with y `power2.out` for a throw arc. |
| Staging | Presenting one idea unmistakably. | One focal element moves; everything else holds or dims 30–50%. |
| Timing | The number of frames a move takes, which gives it weight. | Light and small: 0.2–0.35 s; medium: 0.4–0.6 s; heavy or large: 0.6–1.0 s. |
| Exaggeration | Pushing a pose or move past reality for clarity. | The spectacle beat only: e.g. the final word lands 1.3–1.4× oversized, then settles to true size. |
| Hold | An element on screen after arriving, for its reading time. | Reading time only, and it still carries secondary motion (its slow carry toward its exit, the cursor's next arc, the next element arriving); no idle motion, no still stretch of 0.8 s. |
| Moving hold | A hold that keeps the frame alive through the camera, not the element. | A T1 push of 2–4% on the world; the elements stay still. |
| Stagger | Offsetting identical motions across items. | `stagger: {each: 0.03–0.12, from: "start" | "center" | "edges"}`; total under 0.5 s; seeded if random. |
| Cascade / ripple / domino | A stagger that spreads from an origin. | `from: [x, y]` of the cause (the clicked button); each offset < duration. |
| Hit point / accent | The frame where a motion lands on the beat. | Align the tween's end (the settle) to the beat time, not its start. |
| Pose to pose | Animating between designed key states. | Define each state's full property set; tween between them; design the poses first (style frames). |
| Velocity matching | Speed continuity across a seam. | Same direction and px/s on both sides of the cut; cut at peak velocity. |

## 7. Motion-design techniques

| Term | What it is | Recipe |
|---|---|---|
| Kinetic typography | Type that moves to carry meaning and rhythm. | SplitText (lines, words or chars); name the unit and direction; words on voiceover or beat cues. |
| Line mask reveal | Text rises from behind an invisible edge. | Each line in an `overflow: hidden` wrapper; `yPercent: 100 → 0`, 0.4–0.6 s `expo.out`, lines 0.06–0.1 s apart. |
| Mask reveal | Content revealed by an animated clip. | `clip-path: inset(0 100% 0 0) → inset(0 0 0 0)`, 0.4–0.7 s `power3.inOut`. |
| Trim paths / draw-on | A stroke draws itself along its path. | `stroke-dasharray` = path length, `stroke-dashoffset` length → 0 (DrawSVG); butt caps, or gate opacity so a round cap doesn't show a dot at 0. |
| Shape morph | One shape becomes another. | MorphSVG or flubber with matched point counts, 0.4–0.8 s `power2.inOut`. |
| Self-assembly | Pieces fly in and build the object or the world. | Elements from seeded scattered positions to their layout positions, staggered outward from the origin object, `expo.out`, each 0.4–0.6 s. |
| Odometer / slot roll | Digits roll vertically into a number. | Per-digit columns translateY; fixed digit count; tabular figures; count **to** the value on `expo.out`; never past it. |
| Count-up | A number climbs to its value. | Tween a proxy object and write `textContent` each update; `expo.out`; tabular figures; ≤ 2 s. |
| Typewriter | Characters appear one at a time. | Char reveal with `steps(n)`; 12–18 chars/s; caret blinks only while typing is due. |
| Scramble / decode | Random characters resolve into the text. | ScrambleText with a seeded character set, 0.5–1 s. |
| Split-flap | Characters flip like an airport board. | Per-character top/bottom halves `rotateX` in `preserve-3d`, 0.15–0.25 s per flip, housing recoil 1–2 px. |
| Ticker / marquee | A continuous scrolling band of text. | Linear translateX of a duplicated strip, speed constant (e.g. 120–200 px/s); only if the idea is literally a feed. |
| Progress ring / bar | A value shown filling. | `stroke-dashoffset` on a circle or `scaleX` on a bar from the left, `power2.out`, ending exactly on the value. |
| Ken Burns | Slow pan and zoom on a still image. | Scale 1 → 1.04–1.08 plus a 1–3% translate over the shot, `power1.inOut`. Not on everything. |
| Parallax / 2.5D | Layers at different depths moving at different rates. | 3+ planes with depth factors; CSS `perspective` + `translateZ`, or Three.js. |
| Liquid / metaball | Blobs that merge and separate. | SVG `feGaussianBlur` (10–20 px) then `feColorMatrix` alpha threshold (alpha × 20 − 9) on a group of circles. |
| Particles / confetti | Many small elements from an emitter. | Canvas or DOM, seeded positions and velocities, settled or gone within the scene; only when motivated. |
| Shockwave ring | An expanding ring from an impact. | Circle scale 0 → 3–5× with opacity 1 → 0 and stroke width 6 → 1 px, 0.4–0.6 s `power2.out`. |
| Trails / echo | Fading copies following a moving element. | 3–6 copies lagging 1–2 frames each with opacity stepping down 60% → 10%. |
| Smear frame | A stretched frame that sells a very fast move. | For 1–2 frames, scale the element 1.5–3× along the direction of travel with 30–60% opacity ghosting. |
| RGB split | Color channels separating. | 3 channel copies offset 2–8 px, screen blend, 2–6 frames. |
| Displacement / turbulence | Organic warping of an image. | SVG `feTurbulence` (seeded) into `feDisplacementMap` scale 5–30; step the seed on the timeline. |
| Wiggle | Procedural jitter. | Seeded noise with explicit frequency (Hz) and amplitude (px or degrees); CustomWiggle. |
| Match move / tracked graphics | Graphics locked to moving footage. | Per-frame x, y, scale and rotation keyframes from external tracking data applied to the overlay. |
| Screen replacement | UI placed onto a device or screen in footage or a mockup. | Corner-pinned via `matrix3d` (4-point perspective) or a tracked plane; add screen glare at 5–10%. |
| Spatial UI demo (cursor-led) | A cursor drives the product while the camera follows. | See craft.md §3 (cursor) and focus zoom above. |
| Spectacle beat | The one exaggerated moment of the film. | Name it in the plan; e.g. 1.3× oversized landing plus the signature transition plus the hero hit. |

## 8. Texture

| Term | What it is | Recipe |
|---|---|---|
| Film grain | Fine random photographic noise. | A seeded 256–512 px noise tile, overlay or soft-light at 3–6% (felt) or 8–12% (visible); per-frame: jump the tile offset every frame; static: attach it to the artwork. |
| Digital noise | Colored sensor noise. | Chromatic noise tile, 2–5%, per-frame. |
| Halation | Red-orange glow around bright edges. | Bright-pass → blur 6–20 px → tint #ff4a1c → screen 20–40%, highlights only. |
| Gate weave | The whole frame wobbling slightly, as in projection. | Seeded 0.3–1 px translate of the whole frame each frame. |
| Flicker / density breathing | Brightness varying frame to frame. | Seeded ±2–4% brightness on an overlay per frame. |
| Dust and scratches | Specks and lines on film. | Pre-drawn dust sprites and vertical scratch lines, seeded appearance for 1–3 frames each, 20–40%. |
| Light leak | Warm light bleeding in from the edges. | Large blurred warm radial blobs (orange, magenta) drifting slowly, screen 20–40%. |
| Paper grain | The fiber of paper. | Scanned paper texture, multiply at 8–15%, static and attached to the artwork. |
| Halftone | Images made of dots. | SVG pattern mask of dots sized by luminance, or a shader; dot pitch 4–10 px. |
| Risograph | Two or three spot inks with misregistration and grain. | 2–3 flat ink layers in multiply with 1–3 px offsets; grain 8–12% per ink. |
| Photocopy | High-contrast degraded copy. | Threshold (steep curve), noise 10–15%, slightly skewed edges. |
| Line boil | Hand-drawn lines that shimmer between drawings. | 3 variants of the displacement (different `feTurbulence` seeds) cycled every 2–3 frames with `steps()`. |
| Scanlines / CRT | Horizontal lines of a screen. | `repeating-linear-gradient` 2–3 px period at 10–20% multiply; optional RGB phosphor mask. |
| VHS | Analog tape artifacts. | Chroma offset 2–4 px, 0.6–1 px blur, tracking band (a seeded horizontal displaced strip) every few seconds, noise 6–10%. |
| Pixelation / dither | Low-resolution or ordered-dither look. | Render small and scale up with `image-rendering: pixelated`; Bayer dither pattern via a shader or pre-rendered tiles. |
| Vignette | Darker frame edges. | Radial gradient, multiply 20–35%, static. |
| Anti-banding dither | Invisible noise to stop gradients banding. | Static noise at 1.5–2%. |

## 9. Typography

| Term | What it is | Recipe |
|---|---|---|
| Display vs text | Faces drawn for large sizes vs reading sizes. | Display at ≥ 8% of short side; text faces for anything under that. |
| Weight | Stroke thickness (100–900). | Hierarchy through contrast, e.g. 300 against 800; animate `font-variation-settings: "wght"` on variable fonts. |
| Width | Condensed to extended. | Variable `wdth` axis (e.g. 75–125); condensed for tall stacks, extended for wordmarks. |
| Optical size | Designs adjusted for size. | `font-optical-sizing: auto` or the `opsz` axis matched to the rendered px size. |
| Tracking | Overall letter spacing. | Display −0.03 to −0.05 em; body 0 to +0.01 em; small caps labels +0.06 to +0.1 em; wide tracking (0.2–0.35 em) reads cinematic or luxury. |
| Kerning | Spacing between specific letter pairs. | `font-kerning: normal`; check large display pairs by eye on stills. |
| Leading | Line spacing. | Display 0.9–1.05; body 1.3–1.5. |
| Measure | Line length. | ≤ ~35 characters per line on screen; 2 lines per block at most. |
| Tabular figures | Equal-width digits so counters don't jitter. | `font-variant-numeric: tabular-nums` on every changing number. |
| Lockup | A fixed arrangement of logo and wordmark (or headline and subline). | Positions and ratios locked; the lockup moves as one unit. |
| Eyebrow / kicker | A small label above a headline. | Caps with +0.08 em tracking at 2.2–2.8% of short side; at most twice per film. |
| Hierarchy | Ordering text by importance. | At least 3 sizes, display ≥ 2.5× body, 2 weights; one display line per frame. |
| Per-unit animation | Animating lines, words or characters. | Lines for statements, words for emphasis, characters only for a signature moment (SplitText). |
| Type on a path | Text following a curve. | SVG `<textPath>`; animate `startOffset`. |
| Type as mask | Footage or image visible inside letterforms. | `background-clip: text` or an SVG `<mask>` with the text; the image moves inside the type. |
| Outline type | Letters as strokes only. | `-webkit-text-stroke: 2–3px`, transparent fill; or SVG text with stroke; draw-on with dashoffset. |
| Variable-font animation | Animating weight or width over time. | Tween `font-variation-settings` via a CSS custom property on the timeline. |
| Sentence case | Only the first word capitalized. | Default for headlines and supers. |

## 10. Sound

Rules and numbers in full: `references/sound.md`.

| Term | What it is | Recipe |
|---|---|---|
| Music bed | The music under the film. | Edited to picture on bar lines; starts on a strong section; −14 LUFS master. |
| Beat grid / BPM | The track's tempo and beat positions. | Analyse the track; snap scene boundaries and key moments to bars. |
| Downbeat | Beat 1 of a bar. | Structural cuts and the reveal land here (±1 frame). |
| Bar / phrase | A measure of beats; a group of bars (usually 4 or 8). | Section changes on phrase boundaries; never splice mid-phrase. |
| Drop | The moment energy returns after a build or breakdown. | The hero reveal lands on it. |
| Breakdown | A stripped-down, quieter section. | Calm scenes sit here. |
| Button | A final hit or resolved chord that ends the music. | Aligned to the end-card landing, with a ≤ 2 s tail. |
| Backtiming | Aligning the track's natural ending to the film's end. | Start the track at (film end − track end) and edit backward on bar lines. |
| Hit point / sync point | The frame a sound must land on. | The sound's measured sync point (transient or crest) on the contact frame; audio never leads picture by more than 1 frame. |
| Whoosh | An air-movement sound for fast travel. | Crest at the move's peak velocity; only on a signature spatial transition. |
| Riser | A rising build into a moment. | Crest exactly on the reveal downbeat; cut within 1 frame after. |
| Impact / hit | A sharp percussive accent. | Layered: transient (2–5 kHz) + body (150–800 Hz) + sub (40–60 Hz, 0.3–1 s decay); ≤ 1 per 15 s. |
| Sub drop | A deep falling bass hit. | On the hero reveal only; owns the sub range. |
| UI sounds | Clicks, ticks, pops, toggles. | Short (< 150 ms), dry, mono, lowpassed at 10–12 kHz, VO −14 to −20 LU; 3+ variants rotated. |
| Stinger / sonic logo | A short musical signature. | On the logo lockup, unless the music already hits it. |
| Room tone / ambience | The background air of a space. | −30 to −40 dB under everything for documentary or footage films; never silence. |
| Foley | Recreated physical sounds. | Match material and scale of the on-screen cause (paper, glass, wood). |
| Ducking | Lowering music under the voice. | Music at VO −12 LU (±3), measured per voice span; envelope, not a flat duck. |
| J-cut / L-cut | Audio leading or trailing a picture cut. | See Editing: audio `data-start` earlier or later than the visual boundary. |
| Mickey-Mousing | A sound for every motion. | A smell: sound at most the causal events, leave ≥ ⅓ unsounded. |
| LUFS | Integrated loudness. | −14 LUFS ±1 for web and social; true peak ≤ −1 dBTP on the encoded file. |
| See and say | Voice and picture naming the same thing at the same time. | Each noun the voice says is on screen within ±6 frames. |

## 11. Real 3D (Rasan3D)

Recipes for scenes the score puts in `3d` or `hybrid`. API, numbers and rules: `references/3d.md`. Camera keys are `[t, value, ease]`; world units are metres.

| Term | What it is | Recipe |
|---|---|---|
| Flat-to-depth | The 2D scene's last frame is the 3D scene's first; then the flat thing lifts into space. | `const g = k.layout({ at: 0, distance: D })`; the object (`k.panel` with the same screenshot, unlit face) at the outgoing element's exact px rect (`g.userData.pxPerUnit`); hold 0.1–0.3 s, then a camera arc of 20–35° plus a 0.3–0.8 m crane on `power3.inOut`. |
| Depth-to-flat | The 3D move lands exactly on the next 2D scene's first frame. | Lay the object out with `k.layout({ at: <end> })`; the camera's last key is that pose; hold 2+ frames before the cut. |
| Camera-through | One camera move crosses the cut. | Scene N flies into an opening (a screen, a window, a letter's counter) on a wide lens (24–35 mm); scene N+1 opens moving the same direction at the same speed; cut at peak speed under motion blur. |
| Exploded view | The real UI separated into its layers in depth. | Each layer a `k.panel` with its real screenshot, z offsets 0.05–0.3 m, separated in 0.6–1 s on the film's move ease, staggered 60–100 ms from the back; arc the camera 20–30°; close back as the line lands. |
| Orbit / arc (3D) | The camera circles the subject. | `camera.pos: k.orbit({ center, radius, height, from: -15, to: 25, t0, t1, ease: "power2.inOut" })`, 15–60° per shot, eased, then held. Never a constant-speed 360°. |
| Crane / pedestal | The camera rises or falls. | Raise `pos.y` and `target.y` together 0.3–1.5 m over 1.2–2.5 s on `power3.inOut`; reveals scale or arrival. |
| Push-in (3D dolly) | The camera moves toward the subject. | `pos` along the view axis 10–30% of the distance; near objects grow faster than far ones (parallax). |
| Dolly zoom | The subject holds its size while the background stretches. | Move `pos` back 40–80% while `lens` goes 35 → 85 mm (or the reverse), both on the same ease and window; once per film. |
| Rack focus | Focus moves from one plane to another. | `fstop: 1.8–2.8`, `focus: [[t0, d1], [t1, d2, "power2.inOut"]]` over 0.4–0.8 s; the eye follows the sharp plane. |
| Motion blur (3D) | Streaks on fast motion, like a real shutter. | On by default (`motionBlur: { shutter: 0.5 }`, a 180° shutter); samples adapt to how far things travel. Keep it on for whips and fly-throughs. |
| Depth of field (3D) | Real lens blur in front of and behind the focus. | `camera.fstop`: 2–2.8 for a product hero, 4–5.6 for a readable UI slab; focus defaults to the target. |
| Extruded logo | The official mark as a physical object. | `await k.svgUrl("assets/logo.svg", { width, depth: 2–6% of width, material })`; one key light; lands on the music's hit, its shadow settling a frame later. |
| Extruded type | Real 3D type in the brand's font. | `await k.extrudeText("Word", { font: "assets/fonts/<brand>.ttf", size, depth: 0.2–0.35 × size, material })`; display only (never body text). |
| Type in space | Flat type sitting on a surface in the world. | `k.text({...})` as a texture on a plane or a `k.panel` face; nothing under ~48 px on screen. |
| Point cloud resolve | Points that assemble into the object. | `k.surfacePoints(mesh, 20000–80000, seed)`; each point from a seeded scatter to its surface position on `expo.out`, staggered from the centre; the solid mesh fades in under the last 10%. |
| Pinned label | A 2D label riding on a 3D point. | `onDraw(t, k)`: `const p = k.toScreen(point)`; set the DOM element's transform to `p.x, p.y`; hide it when `!p.visible`. |
| Shadow catcher | A shadow on the 2D ground under a 3D object. | `k.ground({ y })`: transparent, only the shadow; the key light's `dir` sets where it falls; agree with any 2D shadows. |
| Light rig | One motivated key and what supports it. | `k.rig("three-point" \| "top-soft" \| "rim" \| "low-key" \| "window", { key, rim, dir })`. |

