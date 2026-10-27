# Optical treatments (coordinated optics)

Status: implemented_unvalidated. Nothing here has been run, rendered or watched. Active only for plans with `creative_policy_revision >= 2`; revision 1 output is unchanged.

Code: `scripts/lib/optical-treatments.mjs` (plan, check, ownership), `runtime/rasan-optics.js` (composer), record shape in `scripts/lib/sequence-contract.mjs` (`normalizeOptics`, `checkSequence`).

## What the stack really offers (audit)

| Need | Source in the repo | State |
|---|---|---|
| Layer-targeted focus blur | CSS `blur()` composed by `RasanOptics`; `RasanCamera.dof` (depth-based, another owner) | available (unexercised) |
| Soft material | diffusion plus lifted contrast on a flat layer (`material_2d_surrogate`) | uncertain |
| Masks | CSS `mask-image` radial feather, `clip-path` inset (`RasanOptics`); hard circle = `RasanShape.iris/flood` | available; alpha-asset masks stay uncertain until inspected |
| Edge treatment | 1-4 px rim in the composed filter | available |
| Motion blur | axis-aligned `feGaussianBlur` (x or y); the delivery shutter is `finish.mjs` | uncertain |
| Stylized distortion | seeded `feTurbulence` + `feDisplacementMap` (`lens_distortion`) | uncertain |
| Physical refraction, caustics | none | unavailable, never faked |

States mean "a mechanism exists in source". `exercised` and `visually_demonstrated` are always unknown until authorized playback evidence exists.

## Authoring rules

- Six distinct operations: `motion_blur`, `focus_blur`, `stylized_distortion`, `soft_material`, `edge_treatment`, `mask`. A blur is not a distortion and neither is a motion blur; never merge them.
- Every operation declares: `layers.select` (never the whole frame), `layers.protect`, `source_layer_id` (the identifiable source when a processed copy exists), `coordinate_space`, `mask_source`, `crop`, `order` (compositing order), `sampling.resolution_scale`, `params` (score-second keys with `linear | smooth | hold`), `interval` (score seconds), `protected_reads`.
- Blur and distortion params are fractions of frame width, so they survive a change of output size. Filters run before the layer's transform: edges and material scale with the layer.
- Keys start and end at the neutral value at the interval edges (the runtime holds the first key before and after an interval otherwise).
- No whole-frame blur or glow as a fallback. Soft material is diffusion on selected layers; background colour and light direction support a lit material (`material.background`, `material.light_direction_deg`); an intentionally flat graphic language sets `material.flat: true` and stays valid.
- Protected reads (primary copy, proof, product evidence) come from text-performance / product reading windows. A blur, distortion or mask may not select a protected layer during its read; the runtime also skips protected elements and their ancestors or descendants.

## Filter ownership

One writer per element. `RasanOptics.apply` composes every operation for an element into one `style.filter` (and one mask) from one tween. Two operations in the same channel (`blur`, `distort`, `material`, `edge`, `mask`) on the same layer while overlapping need an owner each or both must name the other in `compose_with`. A helper that already writes the layer (for example `RasanCamera.dof` on blur) is declared in `externalWriters` and conflicts the same way. The composed stack is ordered by `order`.

## Essential, enhancement, deferred

- Essential: masks, selective layer targeting, deterministic focus control, a coherent soft material where selected (also motion blur and edge treatment in the record tiers).
- Enhancement: a bounded stylized distortion. Label it "stylized"; the check rejects "refraction" in its label. Never describe a blur or displacement as physical refraction.
- Deferred: advanced optics needing unsupported capabilities. They are reported, not built.

An essential operation whose capability is `unavailable` returns a `creative_deviation` (`blocking: true`) the director resolves BEFORE production with a recorded `creative_decision`. Nothing is substituted. An unavailable enhancement is dropped and reported without blocking foundational work. `uncertain` operations stay in the plan and owe a playback review.

## Existing blur rules, scoped (not banned)

- `slop.mjs` blur-in budget counts blur-in entrances. On a rev>=2 run, a blur tween on a target that a declared `focus_blur` or `soft_material` operation owns is a focus treatment and is not counted. No optics plan means the old count.
- `obey.mjs` `fast-no-shutter` does not fire for a target owned by a declared `motion_blur` operation (RasanOptics puts the blur on those layers). No optics plan means the old rule.
- `medium-rules` `blur-finish`, `soft-focus`, `depth-of-field` still qualify blur on a sharp medium: `planOptics` reports a conflict instead of overriding the medium decision.

## Determinism and limits

Pure function of timeline time; seeded turbulence; no clock, no `Math.random`, no rAF. Cost bounds: 8 owned elements, 4 filter functions per element, blur clamp 0.08 of frame width. `shape.mjs check` verifies load order, a paused timeline and no clock calls for compositions that use `RasanOptics`.

Install: `node scripts/shape.mjs install --project <dir> --optics`.
