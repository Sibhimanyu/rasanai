# Rasan crew — Tara, Kavi and Chitra

Three Blender-native character assets based on the approved isolated designs in
`reference/`, taken from the project's existing crew canon. Each has its own
silhouette and accessories. No character imagery is used on the model.

| Asset | Design | Files |
| --- | --- | --- |
| Tara | Small blue round scout, fitted head strap, brass eyepiece and tinted window | `Tara/Tara.blend`, `Tara/Tara.glb` |
| Kavi | Tall violet rounded block, brass spectacles, sculpted beard, one-point pencil with pink eraser | `Kavi/Kavi.blend`, `Kavi/Kavi.glb` |
| Chitra | Magenta teardrop, curled magenta/orange crest, lashes, three separate swatch cards | `Chitra/Chitra.blend`, `Chitra/Chitra.glb` |

`Crew.blend` brings the three characters and the latest Rasan into one editable
scene at their relative character scales. `crew-lineup.png` is its Cycles render.
The individual files include hidden `Construction • editable source` collections
with the body surfaces, swept arms and accessory geometry before baking.

## Rig and animation

Each individual character has one ten-bone skeleton: `Root`, `Body`, `Arm.L/R`,
`Foot.L/R`, `Eye.L/R`, and `Brow.L/R`. Body and arms form one closed connected
skin, with normalized blended weights. The eyes have separate `Blink` shape keys.
Rigid props follow the body or the holding arm. The pencil and swatches stay with
the screen-left arm; the other arm performs the wave.

Five named clips are included in every GLB: `IdleBreathing`, `Blink`,
`LookAround`, `Wave`, and `Walk`. These are modest demonstration gestures, with
FK controls for further posing. The walk is in place. They are not a collision
solver or a retargeted human walk. NLA tracks are muted in the saved reference
pose; unmute one matching track on the rig and, for Blink, on the eye key data.

The `.blend` files retain the native procedural construction, materials, skeleton
and actions. GLBs contain subdivided geometry, PBR materials, skin and eye morphs.
The existing Blender 5.2 eye-animation compatibility baker writes source-captured
blink samples into standard glTF weight tracks. Each model's `validation.json`
records its exact exported file hash and independent Three.js playback results.

## Reproduce

From `apps/rasan-3d/`, using Blender 5.2.2:

Build scripts run within this repository and reuse the sibling Blender morph
baker and the existing Node dependencies. The `.blend` and `.glb` assets can be
opened independently.

```bash
blender -b --python-exit-code 1 -P crew/scripts/build.py -- Tara --render
blender -b --python-exit-code 1 -P crew/scripts/build.py -- Kavi --render
blender -b --python-exit-code 1 -P crew/scripts/build.py -- Chitra --render
blender -b --python-exit-code 1 -P crew/scripts/lineup.py
npm run studio
node crew/scripts/verify.mjs
node crew/scripts/compare.mjs
```

The existing asset inspector can load each actual GLB:

- [Tara](http://127.0.0.1:5199/blender/viewer/?asset=/crew/Tara/Tara.glb&center=0.62&height=1.75)
- [Kavi](http://127.0.0.1:5199/blender/viewer/?asset=/crew/Kavi/Kavi.glb&center=1.1&height=2.75)
- [Chitra](http://127.0.0.1:5199/blender/viewer/?asset=/crew/Chitra/Chitra.glb&center=1.2&height=3)

## Visual review

Each `comparison.png` places the approved reference on the left and the Cycles
model on the right, aligned by subject bounds. `multiview.png` shows reference,
three-quarter and back. Comparisons normalize height for inspection; use
`crew-lineup.png` for the characters' actual relative scale.

The models preserve the characters' main silhouettes, faces and signature props.
Fine hair/cloth-like surface detail, tiny sculpted contours and source lighting
are not exact matches. Chitra's hidden crest volume and all backs are interpretations
of one source view. The current finish uses smooth matte clay, consistent with the
canon, rather than the reference images' finer grain.

Cycles subsurface scattering and stage illumination do not transfer directly to
glTF. The independent Three.js renders have a firmer material response. Tara's
window uses a low-coverage blue protective-glass material so the eye stays readable
through the lens in both renderers. The GLBs prioritize a smooth silhouette over
small downloads; create a separate LOD for many simultaneous mobile characters.

The Rasan walking-and-waving clip is in
`../blender/animations/rasan-walk-and-wave.mp4`: eight seconds, 900×900, 30 fps.
Its separately editable shot is `../blender/animations/Rasan-walk-and-wave.blend`.
