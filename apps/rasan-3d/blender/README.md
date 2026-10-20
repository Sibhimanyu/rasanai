# Rasan — Blender character asset

This is the Blender-native reconstruction of `../public/reference/rasan.png`.
The earlier procedural Three.js/Remotion project remains in the parent folder.
This asset is built from editable custom surfaces in Blender, rendered with Cycles,
rigged, and exported to glTF. The viewer loads the exported file.

## Deliverables

- `Rasan.blend`: editable model, source surfaces, materials, stage, skeleton and actions.
- `Rasan.glb`: character geometry, PBR materials, one skeleton, two blink morphs and nine named clips.
- `renders/`: reference, front, both profiles, three-quarter and back, with transparent backgrounds and contact shadows.
- `comparisons/`: reference/Cycles and Cycles/Three.js comparisons; review sheets.
- `animations/`: action pose renders, clip metadata and a demonstration MP4.
- `animations/rasan-walk-and-wave.mp4`: eight-second staged walk, turn and standing wave.
- `animations/Rasan-walk-and-wave.blend`: editable shot, separate from the reusable asset.
- `scripts/`: reproducible modeling, rigging, render, export and playback validation.
- `textures/`: portable normal maps baked from the cap's procedural wool shader.
- `validation.json`: measurements from the actual exported GLB and Three.js playback.
- `PROPORTIONS.md`: measurements and assumptions made from the single source image.

## Build and inspect

Blender 5.2.2 was used. Set `BLENDER` to your executable if it is not on PATH.
Commands below start in `apps/rasan-3d/`:

```bash
npm install --legacy-peer-deps
blender --background --python-exit-code 1 --python blender/scripts/build.py -- --rig --export
blender --background blender/Rasan.blend --python-exit-code 1 --python blender/scripts/render.py -- --views
blender --background blender/Rasan.blend --python-exit-code 1 --python blender/scripts/render.py -- --poses
node blender/scripts/compare.mjs
npm run studio
# Open http://127.0.0.1:5199/blender/viewer/
node blender/scripts/verify.mjs
node blender/scripts/demo.mjs
```

Rebuild the staged short clip with `scripts/action_clip.py -- --build` on
`Rasan.blend`, then run that script on `animations/Rasan-walk-and-wave.blend` with
`-- --render --engine=eevee`. It renders numbered `frame-0001.png` through
`frame-0240.png` into `animations/walk-and-wave/`. Encode at 30 fps. The shot uses
the asset's existing Walk and Wave actions, adds world-space travel and a turn,
and uses Eevee for its local preview render. The saved shot defaults to Cycles.

`build.py -- --preview --render` makes a quick unrigged reference render. Omit
`--preview` for full resolution. Cycles renders use CPU, without changing global
preferences. Add `--rebake` to the build to regenerate the cap's normal maps after
editing its geometry, UVs or wool shader; otherwise existing maps are reused.
`verify.mjs` and `demo.mjs` use Playwright's Chromium; on another machine set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to a Chromium executable.

Open `Rasan.blend` for direct editing. `Rasan • export` contains the final meshes
and armature. `Construction • editable source surfaces` is hidden from viewport
and render; enable it to edit the original ring-based body and closed swept arms.
`Stage • Cycles only` contains the lights, camera and shadow catcher. Rebuilding
overwrites generated files, so save hand-edited variants under a different name.

## Geometry and materials

The rounded triangular body is a custom meridian mesh, with a gently flattened
seat, a small upper-head lean/fit correction and asymmetric arm poses. Closed variable-radius swept arms and mittens are
voxel-unioned at the shoulders, relaxed and subdivided. The forearms are positioned
outside the belly so raising them does not tear open a fused contact patch.
The build rejects disconnected or nonmanifold skin surfaces.

The cap has a tailored crown loft measured from the original silhouette, a separate
fitted band, and a broad curved visor with a rolled lip and dark underside. An inner
cloth seat follows the head surface to close gaps beneath the band. Panel
seams follow the loft rather than converging into a pinched beret pole. Native cap
surfaces and modifiers are retained in the hidden construction collection; edit the
measurements in `scripts/cap.py` to rebuild them. The clapper
has solid beveled rails, clipped diagonal inlays, a slate, writing rules, hinge
plate and two rivets. Its moving rail is bound to the upper hinge pivot.

Cycles uses soft key/fill/rim lights, world fill, clay subsurface scattering,
rough wool and glossy eyes. Geometry has no image billboards and uses no generated
character imagery. The reference image is used only for review.

The current look uses a richer golden-yellow body, lower ambient fill and a stronger
soft key for deeper shadows below the cap, hands and slate. The rebuilt cap follows
the original reference's sloping crown and curled visor. Add `--cap-level` when
building for a level-worn variant of the same tailored shape. The `Hat` bone remains
available for posing. `comparisons/cap-before-after.png` shows the cap rebuild with
the previous version on the left.
`comparisons/cap-reference-detail.png` shows the original cap and the rebuilt cap
at matching scale, original on the left.

## Controls

Blender: X right, −Y front, Z up. glTF: X right, Y up, Z front. Body half-width is 1.
Select `RasanRig` and enter Pose Mode:

| Bone/control | Purpose |
|---|---|
| `Root` | Travel, jump and whole-character rotation |
| `Body` | Tilt, breathing, squash/stretch about the seat; local Y is vertical |
| `UpperArm.L/R`, `Forearm.L/R`, `Hand.L/R` | Shoulder, elbow and mitten FK |
| `Foot.L/R` | Independent steps and foot posing |
| `Eye.L/R` | Gaze offsets; each eye mesh also has an independent `Blink` shape key |
| `Brow.L/R` | Raise, tilt and expression |
| `Hat` | Attached cap with independent secondary motion |
| `Board` | Attached prop translation and tilt |
| `Clapper` | Upper hinge rotation; rest opening is 0.34 radians |

In NLA Editor, unmute exactly the action track you want to play. For `Blink`, also
unmute the `Blink` track on each eye's shape-key datablock. Tracks are muted in the
saved file so the initial view is the reference pose. Each clip starts at frame 1.

| Exported clip | Behavior |
|---|---|
| `IdleBreathing` | Gentle volume-preserving body breathing |
| `Blink` | Independent eye morphs close and reopen together |
| `LookAround` | Eyes track side to side, with brow movement |
| `HappyBounce` | Two small bounces with squash/stretch and raised brows |
| `Wave` | Screen-right arm releases the slate and waves |
| `Walk` | Two in-place step cycles, body bob and sway |
| `JumpAndLand` | Anticipation, jump, landing compression and recovery |
| `RaiseClapperboard` | Prop lift with matched arm targets |
| `SnapClapperboard` | Hinge closure, small recoil, then reopening |

Rig suffixes follow the character's left/right, not the viewer's. Demonstration
actions keep gestures within this model's intended range. Larger poses need weight
and silhouette review. There is no collision solver or automatic retargeting.

## Export and frame seeking

The export bakes accessory modifiers into meshes. The Blender file retains the
editable construction surfaces. Skin weights are normalized, and glTF uses ordinary
skeletal tracks and morph-weight tracks. `write_morphs.py` is an explicit Blender
5.2 compatibility step: the NLA exporter emitted zero eye weights for this asset,
so it replaces those two animation samplers with samples captured from the Blender
source actions. It does not recreate geometry or author a second blink animation.

`viewer/player.js` separates the character from the scene. Its `seek()` always
resets and evaluates an absolute time; it does not integrate elapsed frame deltas.
Its paused GSAP timeline is suitable for seeking from a HyperFrames composition:

```js
import { loadRasan } from './viewer/player.js';
const rasan = await loadRasan('./Rasan.glb');
scene.add(rasan.root);
const motion = rasan.timeline('Wave', () => renderer.render(scene, camera));
// Your composition's deterministic frame callback:
motion.seek(frame / fps, false);
// Or evaluate without GSAP:
rasan.seek('Wave', frame / fps);
```

The included page is an asset inspector with orbit, action selection and scrubbing.
It is intentionally small; no editor or scene-specific animation is embedded in
the character. No HyperFrames package is needed to inspect the GLB.

## Visual assessment and limits

The comparison sheets are the evidence for fidelity. This is a recognizably closer
organic reconstruction than the earlier primitive-based render, but it is **not an
exact reconstruction of the reference**. Fine fabric wrinkles,
hand contours and lighting still differ. Hidden back geometry
and body depth are interpretations of a single image.

The GLB preserves geometry, colors, roughness, metalness, specular/sheen parameters,
rig and actions. The wool bump is baked to three embedded tangent-space normal maps
(also supplied in `textures/`). Cycles subsurface scattering does not transfer
as-is; Three.js has a firmer body response. Its soft shadow approximation also differs from Cycles.
`comparisons/cycles-vs-three.png` shows those differences directly. The GLB favors
the subdivided silhouette over download size; a separate LOD would be appropriate
for mobile or many simultaneous characters.

The validation report checks skin weights, nine clip names, finite evaluated
geometry, deterministic out-of-order seeking, blink playback and browser errors.
It also records sampled edge stretching to make deformation problems visible.
These checks complement the pose renders; they do not establish aesthetic fidelity.

Review sheet order: `reference-vs-blender.png` is original / Cycles;
`cycles-vs-three.png` is Cycles / GLB in Three.js. `multiview.png` reads reference,
front, left profile / right profile, three-quarter, back. `pose-sheet.png` reads
wave, jump, raise, snap, blink. The MP4 shows all nine exported actions in that
file's metadata order; its lighting is the independent Three.js viewer's.
