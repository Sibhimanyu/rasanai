# 3D decisions

## Source and workflow

Approved images control appearance. Rasan's source is `public/reference/rasan.png`;
the other isolated references are in `crew/reference/`. The external archive also
keeps the original crew bible, approved lineup, remaining character cutouts and
the original Blender reconstruction brief. The image wins when older text differs.

Continue modeling in `blender/` and `crew/`. The `src/` Three.js/Remotion project
is an earlier procedural prototype. The GLB inspector loads exported models;
the prototype's studio still constructs its own character procedurally.

## Rasan

The measured meridian body has a small upper-head lean/lift and closed swept
arms, welded and relaxed into one skin. The cap was rebuilt after an earlier
beret-like result failed review. Its longitudinal crown loft has real front/back
depth, a fitted band, forward curled visor, dark underside, seams and snap.
The inner seat ends just inside the head, closing air gaps beneath the band.

The user explicitly chose the source's sloping cap. `--cap-level` remains an
optional experiment. Check both profiles after visor edits: a prior projected
attachment created an ear-like folded corner from the side.

Body colour is `FFBE20`, roughness .54, restrained subsurface scattering. Lower
ambient fill and a strong broad key produce richer gold and deeper soft shadows.
Use the current Blender values, rather than the older Three.js material presets.

## Tara, Kavi and Chitra

- Tara has a round custom body, welded nubs and a strap ending at the eyepiece
  rather than passing through its opening. Hollow machined housing, brass trim
  and a thin-coverage blue window keep the eye readable. Full refractive coverage
  obscured the eye; the window still differs between Cycles and Three.js.
- Kavi has a rounded block, spectacles, a continuous U-shaped beard with fine
  overlapping locks and two moustache sweeps. Upright locks around a full ring
  read too much like teeth and were replaced. The six-sided pencil has one point,
  cedar, ferrule crimps and a pink eraser.
- Chitra has a teardrop body and swept crest volumes with an orange under-sweep,
  grooves and tapered lashes. Separate depth layers prevent swatch-card overlaps
  from creating the coplanar artifacts found in the first iteration.

The finish is smooth matte clay. Large poses need collision and silhouette review;
the current FK rigs provide modest demonstration gestures.

## Rig/export

Rasan has 17 bones / nine clips; each new character has ten bones / five clips.
All have separate eye blink morphs. NLA tracks are muted in saved reference files.

Blender 5.2 sampled this asset's NLA eye weights as zeros. `write_morphs.py`
replaces those exported samplers with samples captured from the Blender actions.
Keep this compatibility step. It changes neither geometry nor the authored blink.
Rasan's wool detail uses three embedded tangent-space normal maps.

Export may leave evaluated pose values behind. The crew builder resets and updates
the pose after export, before saving. The shared-scene loader asserts zero foot
offsets. Preserve this fix so default native poses stand flat.

The shared loader evaluates absolute time and resets actions on seek. The paused
GSAP adapter is ready for later HyperFrames integration. A full editor was not built.

## Video and limits

The native short uses existing Walk/Wave clips plus scene travel, braking, a turn
and two blinks. Its saved shot defaults to Cycles; the MP4 uses Eevee 32 samples.
Render animation in one call for Eevee reuse; separate per-frame calls were slow.
The longer sampler is captured from the actual GLB viewer.

Cycles scattering/stage illumination differ from glTF. Fine cap wrinkles, hair,
mittens and hidden backs remain interpretations. Topology and playback checks do
not establish exact visual fidelity; inspect source/render pairs before approval.
