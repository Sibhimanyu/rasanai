# Rasan 3D

For the current state, read [HANDOFF.md](HANDOFF.md). Later sessions should start
with [RESUME.md](RESUME.md). Backup/recovery: [RESTORE.md](RESTORE.md) and
[BACKUP-LOCATION.md](BACKUP-LOCATION.md).

The **Blender-native reconstruction** is in [`blender/`](blender/README.md): editable
`Rasan.blend`, animated `Rasan.glb`, Cycles multiviews, comparisons and a standalone
GLB inspector. Start there for the reusable character asset. The procedural
Three.js/Remotion prototype below is retained for reference.

**Tara, Kavi and Chitra** are in [`crew/`](crew/README.md), with individual native
files, animated GLBs and `crew/Crew.blend` containing all four characters. The
latest short is `blender/animations/rasan-walk-and-wave.mp4` (8 seconds).

## Historical procedural prototype

Rasan, the RasanAI mascot, as a code-built, rigged 3D character. Three.js and React Three Fiber
handle modelling and rendering, Remotion handles frame-accurate video, and Vite runs the preview studio.
Everything is procedural: there are no model files and no network assets. The reference image is
`public/reference/rasan.png`.

## Commands

```bash
npm install --legacy-peer-deps   # once
npm run studio                   # preview studio at http://127.0.0.1:5199
npm run remotion                 # Remotion Studio (timeline, props)
npm run render                   # 1920×1080 MP4      -> out/rasan-demo.mp4
npm run render:portrait          # 1080×1920 MP4      -> out/rasan-demo-portrait.mp4
npm run render:frames            # PNG sequence       -> out/frames/
npm run render:alpha             # transparent PNGs   -> out/alpha/
npm run render:still             # one PNG            -> out/still.png
npm test                         # determinism, scene config, rig controls
npm run typecheck
node scripts/shot.mjs out.png "t=4&cam=threeQuarter"   # headless studio screenshot (studio running)
```

Renders use `--gl=angle` (Metal through ANGLE on Apple Silicon).

## Layout

```
src/
  core/        pose channels, motion clips + layered evaluator, easing, RigSpec
  geometry/    surface-of-revolution builder + surface lookup, live tubes (arms, brows)
  materials/   clay, felt, glossy-eye and brass recipes; seeded procedural textures
  characters/
    rasan/     proportions (measured from the reference), shape, cap geometry, rig solve, <Rasan>
    registry.ts / components.tsx    character key -> rig / component
  motions/     body.ts, face.ts, arms.ts, index.ts (the shared library)
  expressions/ expression presets (happy, curious, surprised, confused, determined, ...)
  props/       clapperboard layout (hinge, grip points) + <Clapperboard>
  stage/       lighting presets, <Stage> (softbox env map, key/fill/rim, floor + contact shadows)
  scene/       SceneDef types, evaluateScene(), <SceneView>, scenes/ (demo + motion showcases)
  studio/      the preview app
  remotion/    compositions (landscape, portrait, alpha)
tests/
```

## How it fits together

1. **Pose**: a flat record of named numbers (`src/core/pose.ts`), such as `body.stretch`, `eyeL.blink`,
   `browR.tilt`, `armR.grip` and `prop.clap`. Every mascot shares these names.
2. **Motions**: pure functions `(localTime, params, ctx) -> partial pose`. A motion is `add` (offsets
   stack), `set` (overrides, cross-faded by weight) or both at once (`{ set, add }`).
3. **Clips**: put motions on a timeline with `start`, `duration`, `speed`, `weight`, `fadeIn`,
   `fadeOut` and `layer`. `evaluatePose(clips, t)` layers them over the character's rest pose, then
   clamps the result to safe limits.
4. **Rig solve** (`characters/rasan/rig.ts`): turns a pose into transforms. It handles
   volume-preserving squash about the seat, eyes and brows that slide on the body surface, arms
   with reach limits that hug the body, hands that blend between free targets and grip points on
   the board, and the clapper hinge.
5. **Scene**: a `SceneDef` is plain data: characters with clips, camera keys, lighting, background,
   props, transitions and audio cues. `evaluateScene(scene, t)` is pure, and the studio and Remotion
   both call it with `t = frame / fps`. Any frame renders the same whether you play, scrub or export.

## Modify Rasan

- Proportions, colours, eye, brow, cap, arm and board placement live in
  `src/characters/rasan/proportions.ts`. The body outline is `BODY_PROFILE`, measured from the
  reference silhouette (`scripts/silhouette.mjs`).
- The cap shape is in `capGeometry.ts` (crown profile, panel seams, forward pull, brim lip).
- For materials, see `src/materials/materials.ts`.
- Check your change with the studio's **Reference → side/overlay** views and the camera presets.

## Add an animation

```ts
// src/motions/body.ts (or a new file), then register it in src/motions/index.ts
export const shimmy = defineMotion({
  name: 'shimmy', description: 'Side-to-side shimmy.', duration: 1.2, mode: 'add',
  defaults: { amount: 1 },
  sample: (t, p) => ({ 'body.roll': 0.08 * p.amount * Math.sin(t * 14) * Math.exp(-t * 2) }),
});
```

It appears in the studio's Animation menu automatically. To build a scene, copy
`src/scene/scenes/demo.ts`, then list it in `SCENES` (`scene/scenes/showcase.ts`) and add a
`<Composition>` in `src/remotion/Root.tsx`. Keep motions closed-form in time: no state, no integration.

## Add another character

1. Write its `RigSpec` (shoulders, rest hands, reach, feet, rest pose) and a component that takes
   `{ pose, wireframe }` and solves it, following `characters/rasan/`.
2. Register it in `characters/registry.ts` and `characters/components.tsx`.
3. Reuse the library: motions read the `RigSpec`, so the same hops, waves and expressions fit the
   new mascot's proportions.

## Known limitations

- The arms are tubes that sink into the body rather than one skinned mesh. Up close the
  shoulder join reads as a soft crease, not a seamless blend.
- Soft shadows come from contact shadows plus a VSM key light. There is no screen-space AO
  pass. It was left out to keep renders fast and deterministic.
- The demo SFX (`public/audio`) are synthesized placeholders.
- The transparent export is a PNG sequence. To get an alpha video, encode it to ProRes 4444 or
  VP9 with ffmpeg.
