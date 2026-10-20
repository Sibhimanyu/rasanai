# Reference measurements

Source: `../public/reference/rasan.png` (763 × 898, transparent). The failed
Three.js model is retained one directory above for comparison, not used as geometry.
The body's widest half-width is one unit. Blender uses X right, −Y forward, Z up.

| Feature | Image observation | Model specification |
|---|---|---|
| Body | Approximately x 3–760, y 130–843; widest low on the body | Width 2; base meridian height 1.9; seat Z 0.16; depth/width 0.80; small upper-head lean/lift fits the reference cap |
| Outline | Rounded triangular crown, broad lower belly, flat soft seat | Custom meridian with 31 measured control points; circumferential quad surface |
| Eyes | Centers ≈ (340, 298), (496, 296); 42 × 86 px | Width 0.116; height 0.24; face centers X ±0.21, Z 1.57 |
| Brows | Approximately 55 × 29 px including curvature | Rounded tapered swept curves; width 0.15; Z ≈1.81 |
| Arms/hands | Short body-connected arms; broad mittens; left hand higher | Varying-radius swept surfaces, merged through voxel remeshing; asymmetric rest pose |
| Feet | About 155 × 78 px each, partly covered by body | Width 0.43; depth 0.54; height 0.25, with flattened soles |
| Cap | Approximately x 145–603, y 2–215; brim sweeps to screen right | Crown loft from measured top/band profiles, fitted band, broad curled visor, dark underside, tailoring seams and side snap; reference slope retained |
| Slate | Approximately x 287–561, y 484–651 | Width 0.72; depth 0.065; slate height 0.36; rails 0.102 high |
| Opening | Upper rail rises roughly 20° from left hinge | Reference rest 0.34 rad; pivot at actual upper hinge rivet |

The face sits to screen right because the reference is slightly off-axis. Initial
camera: orthographic, azimuth −0.16 rad, elevation 0.055 rad. Perspective and hidden
back geometry cannot be uniquely recovered from one image; the depth and back are
interpretations. Prioritize the rendered silhouette and feature spacing over exact
agreement with these initial world-space measurements.

The reference has soft warm highlights, dark eyes, a nearly black cap, and broad
occlusion under the arms and visor. Cycles lights and shader detail are separate
from the reusable asset. Compare both silhouette and shaded surfaces after changes.
