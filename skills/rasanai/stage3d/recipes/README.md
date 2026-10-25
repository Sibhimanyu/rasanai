# Rasan3D recipes

Original, ready-made 3D moves on the existing Rasan3D stage (`../rasan3d.js`). Each is a module
`{ id, label, summary, params, requires, plan, camera, build }`, listed with its parameter bounds in `index.json`.
They add no renderer, no clock and no random source: motion is a pure function of `t` on the scene's one paused GSAP
timeline, and every asset is a project-relative local file (URLs, `..` and absolute paths are refused).

| id | what it does | needs |
|---|---|---|
| `product-slab-evidence` | slab with the real screenshot turns face-on; camera settles on one region, on-axis, legibility measured | screenshot |
| `title-extrude-lockup` | the 2D title's pixel rect lifts into extruded brand type and lands beside the extruded logo | logoSvg, static TTF (else flat plane, flagged) |
| `icon-portal-through` | camera dollies through an icon's opening; the next scene's first frame fills the frame at the hold | iconSvg, nextFrame |
| `hero-turntable` | object turns, eases to rest on its hero yaw, camera ends on-axis; triangle/material budget enforced | Object3D or .glb |
| `character-handoff` | crew character walks, then hands the beat from look to an emotion (RasanCharacter3D) | identity.json (3d-rig, rig.kind code) |
| `focus-pull` | rack focus in focus on exactly the supplied event frame | nothing |

## Use

Install the project (`node scripts/stage3d.mjs install --project <p>` copies `recipes/` into `assets/three/recipes/`),
then load after `rasan3d.js`: `common.js`, then the recipe file(s) (and `character-rig.js` for the character).

```js
const R = RasanRecipes.get("product-slab-evidence"), O = { screenshot: "assets/shot.png", aspect: 1.6667 };
Rasan3D.stage({ id, canvas, timeline: tl, duration: R.plan(O).duration, camera: R.camera(O),
  async build(k) { rec = await R.build(k, O); return rec.objects; }, pose(t, k) { rec.pose(t, k); } });
```

- `plan(opts)` is pure (runs in Node): `{ duration, hits }`, hits are on the frame grid. `build` returns the same plus `pose`.
- `camera(opts)` returns the declarative keys, so the gate reads the eases. Merge by hand if you add your own.
- `k.image` is a Promise: `build` is async, always `await` it.
- `warnings` on the build result lists downgrades (no TTF, no next frame, over budget in `warn` mode): surface them.
- Parameters are clamped to the bounds in `index.json`; a bad enum or a non-number throws.

## Limits, stated plainly

- A flat or reference image is never turned into a rigged mesh. `character-handoff` rigs only `rig.kind: "code"` with a
  known builder; for `glb`, `painted-2d` or no identity it returns `{ rigged: false, reason, fallback }` and does nothing.
- `icon-portal-through` masks by size (`holeFraction`), so the icon's opening should be roughly round or square.
- Not seen yet in a real browser: only `product-slab-evidence` has been through the gate. Run
  `node scripts/stage3d.mjs check` on any scene that uses another recipe.

## Check

`node check.mjs` (add `--write` to regenerate `index.json`): imports every recipe, matches `index.json` to the exports,
checks bounds, frame-grid hits, determinism-forbidden APIs and the exact-seam maths. `examples/slab-evidence.html` is a
small scene for `stage3d.mjs check`.
