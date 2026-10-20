# Rasan 3D — current handoff

Last updated: 20 October 2026. The user is putting the 3D work aside to resume later.
Start here, then read `RESUME.md`. The primary assets are the Blender files and
exported GLBs. The older procedural Three.js project remains as history.

## Completed deliverables

| Deliverable | Current file | State |
| --- | --- | --- |
| Rasan | `blender/Rasan.blend`, `blender/Rasan.glb` | Editable model, 17-bone rig, two eye morphs, nine clips |
| Latest action short | `blender/animations/rasan-walk-and-wave.mp4` | 8 seconds, 900×900, 30 fps, silent; walk, stop, turn, wave |
| Editable action shot | `blender/animations/Rasan-walk-and-wave.blend` | Separate baked shot; reusable asset remains separate |
| Clip sampler | `blender/animations/rasan-demo.mp4` | 18 seconds, 900×900, 30 fps; nine GLB clips |
| Tara | `crew/Tara/Tara.blend`, `crew/Tara/Tara.glb` | Blue round scout, strapped brass eyepiece |
| Kavi | `crew/Kavi/Kavi.blend`, `crew/Kavi/Kavi.glb` | Tall violet writer, spectacles, beard, pointed pencil with pink eraser |
| Chitra | `crew/Chitra/Chitra.blend`, `crew/Chitra/Chitra.glb` | Magenta teardrop, swept crest, lashes and swatch fan |
| Shared scene | `crew/Crew.blend` | Four real character rigs at their relative scales |
| Family preview | `crew/crew-lineup.png` | Cycles portrait of Tara, Kavi, Chitra and Rasan |
| Convenience package | `crew/rasan-crew-models.zip` | New models, GLBs, renders, shared scene and source scripts |

The three new models each have ten bones, two eye morphs and five basic clips.
Each model folder has renders, comparisons, clip metadata and `validation.json`
bound to the exported GLB by SHA-256. Hidden construction collections retain
editable source surfaces and accessory modifiers.

## User decisions to preserve

- Use real Blender geometry, materials, rigs and GLBs. No AI-generated character
  images, billboards or image-plane substitutes for geometry.
- The approved source images control appearance. The failed primitive-based
  Three.js reconstruction is historical context, not the modeling target.
- Rasan should retain richer golden-yellow colour and deeper soft shadows.
- The user explicitly chose **the original reference's sloping newsboy cap**.
  Preserve the tailored crown, curved visor, band and side snap. The level-worn
  experiment has not received equivalent visual review.
- Hands are smooth nubs. No fingers, knuckles, noses or added mouths. Kavi's
  pencil has one point and a pink eraser. Keep props sensibly held and clear of faces.
- The optional choice of which characters to build was skipped. Tara, Kavi and
  Chitra were built as the stated first-three default. Laya, Rasika and Mala
  have **not** been built in this Blender asset pipeline.
- Exact fidelity has not been signed off. Fine sculpting, cap wrinkles, hair,
  hands, hidden geometry and renderer responses still differ from the references.

## Documentation

- `RESUME.md`: ready-to-paste continuation prompt and first-session checks.
- `DECISIONS.md`: geometry, materials, cap, rig and export decisions.
- `TODO.md`: remaining characters and review priorities.
- `RESTORE.md`, `BACKUP-LOCATION.md`: independent archive and recovery.
- `blender/README.md`, `blender/PROPORTIONS.md`: Rasan controls, measurements and commands.
- `crew/README.md`: the other models, inspector links and reproducibility.
- `handoff/legacy-threejs-HANDOFF.md`: the original prototype handoff, preserved
  as history. Its old status/limitations do not describe the Blender assets.

## Reopen without rebuilding

Open `crew/Crew.blend`, an individual `.blend`, or the latest MP4. A rebuild is
not required to inspect or animate the current files. From this directory:

```bash
npm ci --legacy-peer-deps
npm run studio -- --host 127.0.0.1 --port 5199 --strictPort
```

Visit `http://127.0.0.1:5199/blender/viewer/` for the actual Rasan GLB. Crew URLs
are in `crew/README.md`. The root `/` page is the older procedural prototype.
The server was running at handoff; a later session should check before starting it.

## Source map

| Script | Responsibility |
| --- | --- |
| `blender/scripts/build.py` | Rasan body, face, props, materials, stage and native file |
| `blender/scripts/cap.py` | Measured crown, band, visor, seat, seams and side snap |
| `blender/scripts/rig.py` | Rasan skeleton, skinning, nine actions and export |
| `blender/scripts/bake_fabric.py` | Three portable cap normal maps; use `--rebake` after geometry/UV/shader changes |
| `blender/scripts/write_morphs.py` | Shared Blender 5.2 eye-animation export compatibility baker |
| `blender/scripts/render.py` | Rasan Cycles views and action poses |
| `blender/scripts/action_clip.py` | Native walk-to-wave shot |
| `blender/scripts/verify.mjs`, `demo.mjs` | Independent GLB validation and nine-clip video |
| `blender/viewer/player.js` | Shared GLTFLoader, absolute seeking and paused GSAP adapter |
| `crew/scripts/build.py` | Tara/Kavi/Chitra geometry, props, rigs and five actions |
| `crew/scripts/lineup.py` | Shared scene; asserts planted reference feet after loading |
| `crew/scripts/verify.mjs`, `compare.mjs` | Export validation and visual review sheets |

Use the component READMEs for exact build commands. A quick Rasan preview build
overwrites `Rasan.blend` with an unrigged version; the final build uses
`--rig --export`. Save manual variants separately before running a generator.

## Validation at this checkpoint

- All four GLB hashes match their reports. Rasan's nine clips and the crew's
  15 clips pass independent playback checks, including deterministic seeking,
  finite deformed positions, bounded sampled stretching, normalized skin weights,
  real eye blinks and zero browser errors.
- Native crew poses are reset after export. A first-iteration raised-foot cache
  was fixed; the shared-scene loader asserts planted feet from saved files.
- The action short is 240 frames / 8 seconds. The sampler is 540 frames / 18 seconds.
- Prototype tests/typecheck passed earlier. They cover `src/`, not Blender
  geometry, and are not evidence of aesthetic fidelity.

## Environment and traps

- Apple Silicon; Blender 5.2.2 LTS, Node 22.23.1, npm 10.9.8, FFmpeg 8.1.2.
- Blender CLI: `/opt/homebrew/bin/blender`; app:
  `/Users/sibhi-zstch1643/Applications/Blender.app`.
- Cycles CPU is reliable here; a Metal Cycles attempt hung. The short uses
  Eevee 32 samples; its saved shot defaults to Cycles. Renderer responses differ.
- Playback checks need Chromium. Scripts find the local Playwright cache;
  set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` on another machine when needed.
- Do not edit viewer JavaScript during screenshot rendering: Vite HMR can destroy
  its WebGL context. Render Eevee animation in one call for context reuse.
- Blender: X right, −Y forward, Z up. glTF: Y up. Bone local Y is often vertical;
  use bone rest matrices when converting world-space controls.
- After export, run the GLB verifier and inspect actual render comparisons.

## Git and preservation

Original branch: `Sibhimanyu/studio-fixes-0171`. The whole `apps/rasan-3d/` tree
is untracked and has not been committed or pushed. The external archive captures
ignored outputs and reference context independently of Git; see `BACKUP-LOCATION.md`.
No branch rename, Git stash, release or publication is part of this checkpoint.
Any future repository release must use `scripts/release.mjs`.
