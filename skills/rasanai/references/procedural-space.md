# Procedural forms, fields and spatial choreography

Forms and fields that repeat, change and enclose, beyond moving panels. This is a planning layer over mechanics that already exist; it is not a second renderer, and it promises no arbitrary topology or physics. Status: implemented, not validated (nothing here has been run, rendered or demonstrated).

A capability menu, not a style template. No film gets particles, chrome, a tunnel or lens distortion because they exist. Use one when the approved concept needs that relationship (many from one, a field that becomes a room, detail that becomes a system).

## What exists, what was added

| Need | Mechanic | Where |
|---|---|---|
| Endless seeded instanced field (position, yaw, scale, colour, presence per cell) | `Rasan3DLib.instanceField` | stage3d/glsl.js (as `k.instanceField`) |
| Path to spatial curve, thicken, draw by arc length | `Rasan3DLib.tube` | stage3d/glsl.js |
| DOM repeats, draw-on, follow path, morph | `RasanShape.scatter / drawOn / followPath / morph` | runtime/rasan-shape.js |
| Attraction, follow chain, rope, jelly (pre-baked at 240 Hz, sampled by time) | `RasanSim.magnet / follow / verlet / jelly` | runtime/rasan-sim.js |
| Flow plate, lens-ish warp, chromatic split | `RasanCamera plateField / flowGround / warpDef / chromaticSplit` | runtime/rasan-camera.js |
| Camera through a stable scene (DOM 3D) | `RasanCamera` dolly, truck, orbit, push, keys; `cam.perspective(t)`, `cam.place(el, p)` | runtime/rasan-camera.js |
| Camera through a stable scene (3D) | Rasan3D camera keys, stage projection | stage3d/rasan3d.js |
| Materials | `k.material` matte, clay, ceramic, plastic, concrete, paper, chrome, brushed-metal, glass, frosted-glass, gummy, emissive | stage3d/rasan3d.js |
| Inventory, selection, validation, cost, digest | `capabilityInventory`, `planSpatialOps` | scripts/lib/spatial-fields.mjs (new) |

Audit result: no gap that needs a runtime wrapper, so `runtime/rasan-space.js` was not created. Wave/separation/aggregation are scene-authored functions of (cell, time) or baked tables; the planner marks them `uncertain`, not shipped solvers.

## Two spaces, no shared transform

Forms live in `dom3d` (RasanCamera stage, DOM layers) or `rasan3d` (the Three.js stage). There is no shared world/screen transform between them, so a camera move carries only forms of its own space, and a continuous representation change cannot cross them (make it editorial). The planner rejects the mismatch with `capability_unavailable`.

## Inputs and result

`planSpatialOps({ forms, fields, camera, material, representation, score, host })` returns `{ ops, representation, capabilityState, hostCost, digest, errors, notes }`.

- forms: `{ id, op, space?, interval:{start,end}, seed, count?, texture_px?, region_id?, params? }`. IDs match `ID_RE` shared with composition-anchors; `region_id` is the W14 region.
- fields: `{ id, op, form_id?, bodies?, interval, seed, params? }`. A simulated field's cost is `ceil(240 * seconds) * bodies * 4` floats.
- camera: `{ id, space, kind, interval, form_ids?, dof?, bloom? }`, `form_ids` are the forms that share the transform.
- material: `{ id, form_id, kind: matte|reflective|translucent|emissive, name?, accept_surrogate? }`.
- representation: `{ id, steps:[{form_id, level}], identity_survives, properties_may_change?, transition: continuous|editorial, camera_id? }`. Levels: detail, object, many, field, system, environment, consequence. It records which identity survives and what may change. It carries no product or scientific claim (a `claim` field is `material_deviation`); abstract fields are not quantitative evidence.

Intervals are score seconds on the existing score (no timing authority here). Every op reports `available | uncertain | unavailable` plus reasons, and the overall `capabilityState` is the worst. Error codes are the shared taxonomy: `stale_input`, `temporal_evidence_missing`, `capability_unavailable`, `material_deviation`, `owner_missing` (two fields driving one form at once), `budget_exhausted`.

## Capability states

`capabilityInventory()` keeps four evidence levels apart per op: `source_inspected`, `executable_dependency` (files present on disk, not that they ran), `exercised` and `visually_demonstrated` (both null: unknown until authorized evidence). A folder of shaders is not a tested rendering feature. Unavailable stays explicit: `field_coherent_flow_3d`, `deform_mesh_3d`, `refraction_arbitrary` (each names an alternative where one exists).

## Material honesty

A flat card is never presented as a sculptural, reflective or translucent form. In `dom3d`, reflective and translucent are `material_deviation` unless the plan sets `accept_surrogate: true`; then the op carries a disclosed `surrogate` note. Reflective and translucent in `rasan3d` stay `uncertain` (look depends on the environment map and the final-quality pass). If the approved mechanism needs unsupported topology, refraction or simulation, say so before promising it; the change from a sculpture to a flat card is a material creative deviation.

## Determinism and cost

Every form and field names a seed. Params that ask for wall clock, frame history, rAF loops or unseeded randomness are `stale_input`. All results must seek: reuse pose(t), the seeded `instanceField` generator and RasanSim's baked table. Cost is reported per metric (`instances`, `elements`, `sim_floats`, `texture_px`, `post_passes`) against limits the caller takes from the real host; without them the planner uses marked planning ceilings, not measurements. Over a limit is `budget_exhausted` for W10 to admit, never an automatic quality downgrade.

## Wiring (proposed, not done here)

- Producer: Motion Director / scene builder calls `planSpatialOps` for a spatial beat; the packet carries the result; `digest` joins the scene's input identity.
- Runtime files: no new file. INT-ENGINE-A passes the runtime files an op needs through `runtimeFilesFor(contract, extra)` in lib/medium-wiring.mjs (`rasan-sim.js`, `rasan-camera.js`, `rasan-shape.js`; the 3D stage installs its own `assets/three`).
- Consumers: W10 admits `hostCost`; W06 groups one owner per continuous action (the field-overlap rule mirrors it); W09 reviews a representative operation with its camera move.

## Deferred acceptance (specified, not run): SPC-01 to SPC-10

- SPC-01 inventory: every op lists its dependencies; a missing file turns the op `unavailable`.
- SPC-02 seeking: a form/field with no seed, or with a clock/frame-history param, is `stale_input`.
- SPC-03 seek parity (authorized render only): frames at t in two orders are identical for instanceField, a baked sim and a camera key.
- SPC-04 camera: a camera sharing a form from the other space is `capability_unavailable`.
- SPC-05 material: reflective on a dom3d form without `accept_surrogate` is `material_deviation`; with it, disclosed.
- SPC-06 representation: object, many, field, environment with a named surviving identity and a transition; a `claim` is rejected.
- SPC-07 ownership: two overlapping fields on one form give `owner_missing`.
- SPC-08 cost: a plan over a host limit gives `budget_exhausted`, no downgrade.
- SPC-09 unsupported: coherent 3D flow and mesh deformation stay `unavailable` with the alternative.
- SPC-10 review (authorized): a representative complete operation with its camera move shows hierarchy, continuity, legibility, material consistency. More polygons or motion are not quality.

REF/CRF observation: sampled reference appearances (repeated primitives into fields, reflective sculptural forms, a field that becomes an enclosing space) do not prove source technique or engine capability; no parity is claimed.
