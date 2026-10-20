# Rasan 3D: handoff

Last updated 2026-10-20. Rasan, the yellow RasanAI mascot, is built in code as a rigged 3D character.
The project has a reusable motion library, a declarative scene system, a browser preview studio
and Remotion renders. Everything lives in this folder (`apps/rasan-3d/`).

For the architecture, the commands and how to extend things, read `README.md`. This file covers
the state of the work, the decisions behind it and what to do next.

## Status

| Area | State |
|---|---|
| Character model (body, face, cap, arms, feet, clapperboard) | Done; matched to the reference over ~10 render-and-compare rounds |
| Rig (squash, gaze, blink, squint, happy eyes, brows, arm grips, hinge) | Done |
| Motion library (20 motions + 7 expressions) | Done |
| Scene system (data-driven clips, camera keys, lighting, transitions, audio) | Done |
| Preview studio | Done |
| Demo animation (8 s, 30 fps) | Rendered: landscape, portrait, transparent PNGs |
| Tests | 17 passing (`npm test`), `tsc` clean |
| Git | **Not committed.** It sits untracked in the `Sibhimanyu/studio-fixes-0171` workspace, a branch for unrelated work. Move it to its own branch or repo before committing. |

## What's where

```
apps/rasan-3d/
  HANDOFF.md            this file
  README.md             architecture, commands, how to modify / extend
  public/reference/     rasan.png (source of truth) + rasan-faceless.png
  public/audio/         hop.wav, clap.wav (synthesized placeholder SFX)
  src/                  the code (see README layout)
  tests/                animation.test.ts
  scripts/              shot.mjs (headless studio screenshot), compare.mjs (reference | render),
                        sheet.mjs (contact sheet), silhouette.mjs (measures the reference outline)
  handoff/renders/      rasan-demo.mp4 (1920×1080), rasan-demo-portrait.mp4 (1080×1920),
                        alpha-sample-f150.png
  handoff/review/       every review image from the build:
                        v1…v10.png       model iterations, front view
                        cmp4…cmp10.png   reference | render side by side (cmp10 = final)
                        az*.png, angles.png   ¾ / side / back views
                        sheet-a.jpg, zoom-a.jpg, final-land.jpg, final-port*.jpg   motion contact sheets
                        still-clap.png, still-cheer.png, studio-ui.png
  out/                  (gitignored) render outputs; out/alpha/ holds the full 240-frame transparent sequence (85 MB)
```

Source of the reference: `.context/working-crew/assets/stage/ra-work-faced.png`, the approved
smooth-clay canon (see `.context/crew/BIBLE.md`). `.context/crew/3d/` and
`docs/brand/crew/3d/ra.js` hold an earlier, simpler Three.js test of Ra. This project replaces it
and doesn't depend on it.

## Run it

```bash
cd apps/rasan-3d
npm install --legacy-peer-deps      # @vitejs/plugin-react 6 has a babel-8 peer conflict; legacy peers is fine
npm run studio                      # http://127.0.0.1:5199
npm run render                      # out/rasan-demo.mp4
npm run render:portrait             # out/rasan-demo-portrait.mp4
npm run render:frames               # out/frames/ PNG sequence
npm run render:alpha                # out/alpha/ transparent PNGs
npm test && npm run typecheck
```

A full 240-frame render takes about a minute on this Mac (`--gl=angle`, concurrency 4).

## Key decisions

- **Units and space.** One unit is the body's widest half-width. Body space has its origin at the
  seat, with +z toward the viewer and +x as Rasan's left. The body outline (`BODY_PROFILE`) comes
  from the reference's alpha mask, measured row by row.
- **The reference is seen from ~9° to Rasan's right.** That's why his face sits right of centre
  in it. The studio's "Reference" camera preset (az −0.16) matches it.
- **Pose = flat named numbers** that all mascots share. Motions are pure functions of time, so
  any frame can be evaluated alone, the studio's scrub matches the export, and the tests can prove it.
- **The cap is cocked:** yaw 0.95 swings the brim toward his left, and it sits high enough to
  clear both brows. Pushing it lower or wider covers the brows; this broke several times while tuning.
- **The left hand works the clapper,** lifting its free end (`armL.toClapper`), because the
  hinge is on his right. The opening is capped (`openAngle` 0.62, demo `open` 0.62) so the clapper
  and hand stay below the eyes.
- **Arms are live tubes** (Bézier spine, parallel-transport frames). Each arm starts inside the
  body at the front-side and keeps its midpoint just outside the surface, so it hugs the body.
- **Lighting is baked from softbox Lightformers,** so there's no HDR download. It uses
  NeutralToneMapping (ACES washed out the yellow), a VSM key shadow at 0.55 intensity, and two
  contact-shadow layers.
- **The background is CSS behind a transparent canvas,** which makes the alpha export trivial.

## Known gaps and next steps

1. **Shoulder join.** The arm tubes sink into the body and show a soft crease up close. Options: a
   small SDF/metaball blend at the shoulder, or skinning the arms into the body mesh (Blender is
   installed at `/opt/homebrew/bin/blender`).
2. **Arms read slightly thin and long in profile** compared with the reference's stubby forearms.
   Try thicker radius, a shorter reach and shoulders further forward.
3. **Skin tone.** Rasan is a touch more orange and shinier than the reference. Tune
   `RASAN.color.body`, `bodyTint()` in `Rasan.tsx` and `clayMaterial` roughness.
4. **No ambient-occlusion pass.** N8AO (`@react-three/postprocessing` is installed) would add
   contact darkening under the arms and cap. Check it stays deterministic in Remotion and disable
   it for alpha renders.
5. **Hop-in is a ¾ profile.** The landing beats read well, but the first hop starts partly off-frame
   during the 0.25 s fade-in. Shift `fromX` or the first camera key if it feels abrupt.
6. **Real SFX and music.** Replace `public/audio/*.wav`; cues are in `demo.ts` `audio`.
7. **The other crew** (Tara, Kavi, Chitra, Laya, Rasika, Mala). Each one needs a `RigSpec`, a
   component and a registry entry. The motion library already reads proportions from the rig.
8. **Alpha video.** If a single file is needed, encode `out/alpha/` to ProRes 4444 or VP9 with ffmpeg.

## Gotchas

- **macOS is case-insensitive.** `props/clapperboard.ts` next to `Clapperboard.tsx` made Vite
  resolve the wrong file, so the layout file is now `boardLayout.ts`. Restart Vite with `--force`
  after renames like that.
- `scripts/shot.mjs` needs the studio running on :5199. It uses the cached Playwright
  headless shell with `--use-angle=metal`. Set `UI=1` to capture the full studio UI instead of the
  bare viewport.
- Don't use librosa/numba Python for any audio work on this Mac; it segfaults and pops dialogs.
  Use ffmpeg/Node.
- Verification here has been headless only: no visible windows were opened.
