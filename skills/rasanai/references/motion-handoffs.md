# Motion handoffs

A handoff is a DECLARED boundary where one piece of motion continues into the next scene, shot or composition. Declare it only when the viewer should read one movement. A cut, snap or impact is also declared, as a deliberate break. Status of everything here: implemented, unvalidated; nothing has been played back.

Pieces: the record (`scripts/lib/sequence-contract.mjs normalizeHandoff`, stored in `creative/beat-plans.json beats.<id>.handoff`), the math (`scripts/lib/motion-handoff.mjs`: `toScreenSpace`, `wrapAngle`, `seamTolerances`, `seamReport`, `planHandoff`), and the runtime helper (`RasanMotion.continueFrom`, `RasanMotion.stateAt` in `runtime/rasan-motion.js`).

## Boundary conditions per carried property

Name only what survives; `carry` is exact. Everything not carried is free to change.

| carry | state at the boundary | units | the incoming side must |
|---|---|---|---|
| `position` | `{x,y}` | px (or `frame_fraction`) in `final_screen` | start on the same point |
| `velocity` | `{x,y}` per second | px/s | start with the same speed and heading: no stop, no restart from rest |
| `scale`, `scale_rate` | ratio, ratio per second | ratio | start at the same size, growing or shrinking at the same rate |
| `rotation`, `angular` | degrees, deg/s | degrees, wrapped to (-180, 180] | start at the same angle (359 and -1 are one angle), same spin |
| `camera_relation` | named relation (locked, following, framed on X) | any, compared exactly | keep the same camera relation |
| `mask_state` | named or numeric mask state | any, compared exactly | start with the layer masked the same way |
| `settle` | declared resting target and character | any, compared exactly | settle on that target once; never start a second ease |

Position without velocity means "same place, starts at rest". Add `velocity` for one continuous movement. A continued action carries its own `action_id` and `progress` so the ease is not reset (`seamReport` flags `easing_reset`).

## One coordinate space

Seams compare in `final_screen`: pixels at the output size (or frame fraction), origin top-left, y down, degrees, scale ratio. Scene-local, parent, world and camera values are converted first with `toScreenSpace(state, chain, {output})`. `chain` lists transform levels from the object outward; each level `{id, kind, translate, scale, rotate, origin, velocity, scale_rate, angular, inverse?, applied?}` keeps its own origin (rotation and scale act about it). Mark `applied:true` for a level the state already contains (a position read from the DOM after the camera moved includes the camera), and give a camera `inverse:true` when the world reaches the screen through the inverse of the camera's own transform. `toScreenSpace` skips applied or repeated levels and reports them, so parent or camera motion is never added twice. The chain is bounded (16 levels).

## Intentional discontinuities

A `cut`, `snap` or `impact` handoff carries no continuity and says why in `intentional_discontinuity.reason` (and optionally which `properties`). `seamReport` marks those properties `exempt`: derivative continuity is not forced on a hit or a snap. Do not declare `continuous` and then list the same property as both carried and discontinuous (the contract rejects it).

## Time, units, tolerances

Boundary time is the score's (`boundary.time_s` and tick, with the score's own frame): never assume 30 fps, never keep a second clock. The boundary frame belongs to the INCOMING side (end exclusive); `planHandoff().frame_policy` gives `outgoing_last_frame = frame - 1`, so no endpoint frame is drawn twice. Tolerances come from `seamTolerances(output, overrides)`: relative to the output diagonal and never below the output's precision (position about 0.15% of the diagonal, velocity about 2% per second or 10% of the faster side, scale 0.5%, rotation 0.25 degrees, spin 2 deg/s or 10%). Pass `output {width,height,precision_px}`; without it a 1920x1080 frame is assumed and the report says so.

## Making the incoming motion start from the outgoing state

`planHandoff(handoff, {score, output, outgoing, incoming, spring})` returns one `channels` entry per carried scalar (`position.x`, `position.y`, `scale`, `rotation`) with `{t0_s, x0, v0, to, z, w}`. The scene animator feeds each to `RasanMotion.continueFrom({t0, x0, v0, to, z, w})`: a closed-form damped spring that starts at `x0` with speed `v0` and settles on `to`. It is a pure function of time with no state and no previous frame, so seeking frames in any order, or restarting an interrupted render at any frame, gives identical values, and the cost per frame is constant. `RasanMotion.stateAt(fn, t)` reads `{x, v}` of any value function with `.velocity` (`springTrack`, `continueFrom`) to hand over from the outgoing side. `rasan-camera.js` is unchanged: its moves are plain eased offsets, so a camera seam is converted with `toScreenSpace` (camera level, `inverse:true`) rather than needing a new camera API.

## Review obligation

`seamReport` is mathematical: it reports pass, fail, exempt, not_carried or not_assessable per property, with units and the tolerance used. It always returns `visual_acceptance: "unreviewed"` and `playback_review_required: true`. A passing report does not show that the seam reads as one movement, and a failing report on a deliberate break is not a defect. Only playback of the seam (watching the frames around the boundary at the output size) settles it; static checks never substitute. Missing state is `not_assessable`, never a pass.
