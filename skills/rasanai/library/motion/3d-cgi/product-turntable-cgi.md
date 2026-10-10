---
id: "product-turntable-cgi"
name: "Product CGI turntable, done right (rotate to land, light that agrees)"
space: "3d"
family: "3d-cgi"
references: ["Apple product films (CG hero shots, e.g. the iPhone 15 Pro 'Titanium' ad)", "studio product photography (softbox, gradient reflections)", "virtual product studios (key + fill + rim + 1-2 catch lights)"]
timing: {"frame_rate":"30 fps comp; motion blur on, 180 degree shutter (0.5)","holds_ms":[400,900],"durations_ms":[900,1400,2200],"rotation_per_beat_deg":[15,40],"hero_shot_s":[4,8]}
eases: {"reposition":"power3.inOut","land":"expo.out","drift":"sine.inOut","never":"none","notes":"rotation is a sequence of turn-then-hold, never a constant-speed spin; every key carries its ease"}
camera: {"lens_mm":[85,135],"moves":["15-40 degree arc around the product","slow push-in of 2-5 percent during a hold","macro crane along an edge at 100-200 mm, f/2.0-2.8"],"rules":["the product turns to composed angles and rests; the camera moves one leg per shot","lights stay fixed in the room, so reflections slide across the surface as the product turns","f/2.0-2.8 for hero and macro, f/4+ when a UI face must stay readable","lead the subject: camera starts 0.1-0.2 s after the product's own move"]}
recipe_2d: "GSAP fallback for a flat product cut-out: perspective 1200px on the wrapper, rotateY keys [-14deg -> 10deg] with 'power3.inOut' over 1.4 s and a 0.6 s hold; a sheen is a linear-gradient mask (mask-image) on a white overlay with mix-blend-mode: soft-light whose background-position-x tweens with the same ease; a contact shadow ellipse scaleX tracks cos(rotateY). It reads as a card, not an object: use only when no 3D scene is allowed."
recipe_3d: "Rasan3D: product from k.svg / GLB in build; k.material('ceramic'|'brushed-metal'|'chrome'); k.rig('top-soft',{dir:[-0.5,1,0.6],shadows:true,shadowSoftness:10}); k.ground({y:0,shadowOpacity:0.35}); environment {preset:'studio',intensity:0.9}; a gradient 'softbox' plane (k.material('emissive') or a ShaderMaterial) placed to be reflected; pose: product.rotation.y = k.at(t,[[0,-0.35],[0.8,-0.35],[2.2,0.25,'power3.inOut'],[3.4,0.25],[4.8,0.9,'power3.inOut']]); camera.pos/target/lens keys with fstop 2.8; post {bloom:{strength:0.25,threshold:1.15},grain:0.015,vignette:0.1}; leave motionBlur default (or false when finish.mjs blurs)."
pitfalls: ["constant-speed 360 degree spin in a void: the three.js demo, and the gate warns linear-drift and never-rests","one flat light: metal and glass need big gradient reflectors, a flat key makes chrome look grey","lights that rotate with the product (reflections frozen to the surface)","bloom on everything: only the emissive softbox strip and the accent may exceed the threshold","a floor with no contact shadow: the product floats","camera at 24-35 mm for a hero: the product bulges; use 85 mm and up","perfect CGI: no edge falloff, no slight imperfection in the floor or reflector (xo3d: believable imperfection is a discipline)"]
instruct: {"all":"Block the shot at real scale in metres (a phone is 0.15), lights fixed in the room, the product turns in discrete moves of 15-40 degrees with a hold after each, 85-135 mm lens, f/2.8. Name every ease. Give the metal something to reflect: one large gradient softbox and one thin strip light. Only the strip and the accent are emissive (HDR); everything else stays under the bloom threshold. Never Math.random, Date or a free-running loop.","claude":"You tend to over-glow and to add an orbit that never stops: forbid both. State the three rest poses (angle, camera position, lens) before writing code, then write pose() as a table of keys. Cap emissive intensity at 3 and bloom strength at 0.3. Write the camera as key arrays with an ease on every key, and describe what the viewer reads at each hold.","gpt":"You tend to reach for a continuous rotation (mesh.rotation.y += 0.01 or t * speed) and for Math.random in shaders: rotation must come from k.at(t, keys) with rests, randomness only from k.rng(seed). Do not create your own WebGLRenderer or OrbitControls, do not load an HDRI from a URL (environment: 'studio' only), and do not use MeshNormalMaterial or a torus knot as a placeholder."}
verified: {"sources_fetched":4,"non_wikipedia":4,"colours":"n/a","colour_images":[],"grid":"n/a","timings":"proposed","recipes":"aligned","edited":"2026-10-03"}
sources: ["https://xo3d.co.uk/resources/3d-rendering/product-rendering/lighting-guide/", "https://www.squareshot.com/post/guide-to-light-for-product-photography-expert-tips", "https://vflatworld.com/blogs/behind-the-scenes/one-light-product-photography-setups", "https://9to5mac.com/2023/09/14/first-iphone-15-pro-ad-titanium/"]
---
## What it is

The 3D product shot in a launch film: one object, a studio that is really a set of reflectors, and a camera that arrives, lets the object be read, and leaves. The "turntable" in the name is a lighting convention (the object moves, the room does not), not a licence to spin. The iPhone 15 Pro "Titanium" ad combines CGI with product photography; it is a CG story about material (raw metal falling from space and forming the frame) ending on a close-up of the finished phone (9to5mac). That is the register: the material and the light are the message.

## The defining traits (numbers)

- **Lights: 3 to 6.** A hero render uses key, fill, rim and one or two catch lights; more looks over-lit (xo3d). HDRI or an environment is the base for reflections, directed "pin" lights shape metal and gloss.
- **Key at about 45 degrees, a fill, a back light for separation** (squareshot: the one-light setup is a single source at 45 degrees with a foam-board reflector; the professional setup is key, fill and backlight). The "fill 50-70 percent of the key" ratio is a common convention that the fetched page does not state: proposed. Softer is bigger relative to the subject; the larger the source, the softer the highlight.
- **Reflective products want gradients, not points.** Large softboxes, white bounce cards and black flags to carve dark edges (a studio convention; squareshot confirms softboxes and bounce cards). In Rasan3D: a big emissive gradient plane plus a thin strip, both off-camera, both reflected.
- **Lens 85-135 mm** for the hero (compressed, flattering; 3d.md section 4), 100-200 mm macro for a detail pass, f/2.0-2.8. Our own derivation from the lens table: at 120 mm and 0.9 m subject distance the horizontal field is about 0.27 m (36 mm sensor, so field = 0.9 x 36 / 120), right for a handheld product.
- **Rotation lands.** 15-40 degrees reads as "look at this", 180 degrees as "the other side" (3d.md section 8). Hold 400-900 ms after each turn so the highlight rolls to rest.
- **Camera tiers:** T0 locked, T1 2-5 percent push during a hold, T2 a focus move to a feature. One crash move per film.
- **Material pass on the last frame:** the hero resolves to its brand colour; the accent is the one emissive thing.

## How to build it

### 3D (Rasan3D)

```js
Rasan3D.stage({
  id: "04-hero", canvas, timeline: tl, duration: 6, fps: 30,
  camera: {
    pos:    [[0, [0.10, 0.22, 1.10]], [1.6, [0.22, 0.20, 0.98], "power3.inOut"], [3.2, [0.22, 0.20, 0.98]], [4.8, [-0.12, 0.24, 0.90], "sine.inOut"]],
    target: [[0, [0, 0.09, 0]], [1.6, [0, 0.09, 0], "power3.inOut"]],
    lens:   [[0, 100], [4.8, 120, "sine.inOut"]],
    fstop: 2.8,
  },
  environment: { preset: "studio", intensity: 0.9 }, toneMapping: "neutral",
  post: { bloom: { strength: 0.25, threshold: 1.15 }, grain: 0.015, vignette: 0.10 },
  async build(k) {
    const { THREE } = k;
    k.rig("top-soft", { dir: [-0.5, 1, 0.6], intensity: 1.0, shadows: true, shadowSoftness: 10 });
    k.ground({ y: 0, shadowOpacity: 0.35 });
    // hero: the official mark or a GLB, in the product's own material
    const hero = await k.svgUrl("assets/logo.svg", { width: 0.12, depth: 0.012, bevel: 0.002, material: k.material("brushed-metal", { color: "#c9ccd1" }) });
    hero.position.y = 0.09; k.scene.add(hero);
    // the room's reflectors: a gradient softbox and a strip. HDR only here.
    const box = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.9), new THREE.ShaderMaterial({
      toneMapped: false, side: THREE.DoubleSide,
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: "varying vec2 vUv; void main(){ float g = smoothstep(0.0,1.0,vUv.y); float e = smoothstep(0.0,0.08,vUv.x) * smoothstep(1.0,0.92,vUv.x); gl_FragColor = vec4(vec3(2.2) * mix(0.35,1.0,g) * e, 1.0); }" }));
    box.position.set(-0.9, 0.7, 0.7); box.lookAt(0, 0.1, 0); k.scene.add(box);
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 1.2), k.material("emissive", { color: "#ffffff", intensity: 3 }));
    strip.position.set(0.8, 0.4, -0.6); strip.lookAt(0, 0.1, 0); k.scene.add(strip);
    return { hero };
  },
  pose(t, k) {
    k.objects.hero.rotation.y = k.at(t, [[0, -0.35], [0.8, -0.35], [2.2, 0.25, "power3.inOut"], [3.4, 0.25], [4.8, 0.9, "power3.inOut"]]);
  },
});
```

- Rotation is expressed as turn-hold-turn keys; the gate sees every ease. Declare nothing: each turn lands, and each rest is reading time with the next turn or a light sweep starting within 1.5 s, so `never-rests` does not fire and the motion gate sees no freeze.
- The softbox and strip never move, so highlights slide as the product turns. If a reflection must stay on a feature, move the softbox in `pose` with the same key array (still a function of `t`).
- Glass or gel hero: give the stage an opaque `background` (3d.md section 5), glass refracts only what the 3D layer draws.
- A UI face on the product (screen) is a `k.panel` with `k.image`, unlit, so its colours stay exact; the lit bezel around it carries the reflections.
- Cost: one shadow-casting light, transmission on the hero only (3d.md section 10).

### 2D fallback

```js
gsap.set("#prod", { transformPerspective: 1200, rotationY: -14 });
tl.to("#prod", { rotationY: 10, duration: 1.4, ease: "power3.inOut" }, 0.4)
  .to("#sheen", { backgroundPositionX: "-160%", duration: 1.4, ease: "power3.inOut" }, 0.4)
  .to("#shadow", { scaleX: 0.86, duration: 1.4, ease: "power3.inOut" }, 0.4);
```
`#sheen` is `mask-image: linear-gradient(105deg, transparent 40%, #000 50%, transparent 60%)` over a white `soft-light` layer clipped to the product alpha. It is a convincing 15-20 degree turn, not a rotation to the back.

### A 6 s hero plan (the same shot as the code, as a table)

| Time (s) | Product | Camera | Light | Purpose |
|---|---|---|---|---|
| 0.0-0.8 | rest at -20 degrees (rotation.y -0.35 rad) | 100 mm, 1.1 m away, f/2.8 | softbox gradient reflects on the left face | the first read: shape and material |
| 0.8-2.2 | turn to +14 degrees (0.25 rad), `power3.inOut` | arc of 12 degrees begins at 1.0 s (0.2 s after the turn starts) | strip light crosses the bevel as it turns | the highlight rolls: this is the money frame |
| 2.2-3.4 | hold | 3 percent push (lens 100 to 103) | none changes | the viewer reads the mark |
| 3.4-4.8 | turn to +52 degrees | crane up 0.04 m, lens 100 to 120 | rim catches the far edge | the second face, a detail |
| 4.8-6.0 | hold | rest | accent lights (one emissive element) | end card |

Check list: lights are in world space (not parented to the product); the shadow softens with the product's height above the floor (contact is sharp, far is soft); no keyed value has the same speed on two consecutive legs; the last frame's reflections are as composed as the first. If the product has a screen, the screen face is unlit and carries the real UI; the bezel is lit.

## What makes a cheap imitation

- The product spins at constant speed in a void with one light: reads as a stock three.js demo.
- Flat or point lighting on metal: chrome needs large gradients and dark flags to define its edges.
- Reflections that rotate with the object (lights parented to the model).
- No ground contact: no soft shadow, no occlusion where the product meets the floor.
- Everything glows: bloom above the threshold on UI white and lit surfaces.
- Wrong lens: 24-35 mm on a small object bulges it; 85 mm and up flatters it.
- Hold missing: the turn never settles, so the highlight never reads.
- Too clean: xo3d's own caution that perfect CGI light is "easy to make too perfect"; add a faint floor gradient, a slightly uneven reflector falloff, and a little grain.

## Sources

- https://xo3d.co.uk/resources/3d-rendering/product-rendering/lighting-guide/ — hero renders typically use 3 to 6 lights (key, fill, rim, plus 1 or 2 pinned catch lights); HDRI gives ambient and reflections alongside directed lights; believable imperfection against "too perfect" CGI (fetched 2026-10-03).
- https://www.squareshot.com/post/guide-to-light-for-product-photography-expert-tips — one-light setup at 45 degrees with foam-board fill, three-point key, fill and backlight; softboxes, diffusers, bounce cards (fetched 2026-10-03). It does not give a fill ratio.
- https://vflatworld.com/blogs/behind-the-scenes/one-light-product-photography-setups — ceiling bounce, side window-light softbox, backlight for a gradient of highlights; white reflectors opposite control shadow depth (fetched 2026-10-03).
- https://9to5mac.com/2023/09/14/first-iphone-15-pro-ad-titanium/ — the "Titanium" ad: raw titanium falling from space forms the frame, CGI plus product photography, ends on a close-up (fetched 2026-10-03). Frame rate and CG breakdown are not stated there: unverified.
- Local, not a URL: skills/rasanai/references/3d.md (lens table, rigs, materials, cost). The 0.27 m field-of-view figure and the fixed-lights, turning-product construction are our own derivations. Apple's internal pipeline is unverified (the one article claiming it returned HTTP 403).
