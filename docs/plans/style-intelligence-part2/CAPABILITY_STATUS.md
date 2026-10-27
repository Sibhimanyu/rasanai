# Capability status - Style Intelligence Part 2

Honest state as authored. Nothing is verified. A medium is at best `implemented_unvalidated`; compiling, a demo or example existing is not evidence. Source of truth: `skills/rasanai/library/styles/meta/` and `scripts/lib/medium-index.mjs` (states: reference_only, implemented_unvalidated, verified_for_scope, unavailable_here, disabled, not_permitted).

## 12 families (`_families.json`)

flat-vector-geometric, illustrated-cel, pixel-retro, paper-collage, painterly-ink, clay-stopmotion, isometric-worlds, dimensional-product, diagram-data, footage-graphics, expressive-type, abstract-procedural. All are metadata over existing style ids. A family can exist with no buildable profile; only the profiles below have an execution profile. Families without one are reference-only.

## 8 profiles (execution id, capability ref `style.<execution id>`)

| profile file | execution id | runtime file(s) | status |
|---|---|---|---|
| flat-vector.json | flat-vector-native | runtime/medium-graphic.js | implemented_unvalidated, never rendered |
| line-art.json | line-drawing-native | runtime/medium-graphic.js | implemented_unvalidated |
| dataviz.json | evidence-diagram | runtime/medium-graphic.js | implemented_unvalidated |
| collage.json | paper-collage-native | runtime/medium-paper.js | implemented_unvalidated |
| pixel.json | pixel-native | runtime/medium-pixel.js | implemented_unvalidated |
| living-screencast.json | pixel-companion | runtime/medium-pixel-companion.js | implemented_unvalidated |
| cel-boil.json | cel-performance | runtime/medium-cel.js (needs Rasan2D) | implemented_unvalidated, Rasan2D API unconfirmed |
| iso-infographic.json | isometric-system | runtime/medium-isometric.js | implemented_unvalidated |

Shared: runtime/medium-surface.js. If the index or capability registry reports lower, the lower state wins. `evidence.basis` is `authored-unvalidated` for all; no receipt exists. All capability `verified` flags are false. Availability on a given Mac (stale installed Studio bundle) is unknown.

## Reference only

Examples under `library/medium-examples/` are `authored-unvalidated` or `original-unreviewed`. Per-medium selection, fit, adaptations, rules, contract, learning are code that was never executed.
