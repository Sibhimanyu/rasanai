# Asset-directed compositing

Real imagery is part of the composition. Decide per subject whether it is authored geometry, truthful product capture, licensed or supplied imagery, or an explicitly authorized asset. Planning only: nothing here acquires, generates or renders.

## Asset brief per subject

Purpose, required identity, framing and resolution, acceptable source types, alpha/mask needs, colour treatment, supported view changes, rights and provenance, and what would break the idea. Use source-ready assets first (supplied, real capture, approved public demo, existing original). External generation or stock needs permission, rights, data-transmission and spend scope; without them, propose an equally deliberate supported visual idea, not a low-quality icon.

## Representation map

One subject, several representations: hero, closeup (diagnostic), silhouette, material, repeat, final. Use only those that serve the film. A closeup that claims to come from a part must overlap that part of the same source. Editorial interpretation is marked in the contract and never presented as product internals, anatomy or a technical diagram.

## Helper

`lib/asset-compositing.mjs`: `planAssetCompositing({subjects, assets, anchors, crops})` returns `{plan, masks, alpha, occlusion, capabilityState, digest, invalidation, review, errors, warnings, unknown}`.

- subjects: `{id, asset_id, representation, finish: flat|spatial, purpose, region_id?, anchor_id?, needs_alpha?, occludes?, occluded_by?, z_index?, requires_views?, requires_rotation?, editorial_interpretation?, sensitive?, acquisition?: {authorized}}`
- assets: shot-layer source shape (`id, rights, sha256, media{width,height}`) plus optional `has_alpha, alpha_inspected, mask{ref,sha256,inspected,edge_quality}, depth{ref}, views[], rights_status, sensitive`
- anchors: the `planAnchors` result (shared region/anchor IDs; times stay score seconds there)
- crops: `{id, subject_id, rect{x,y,w,h} source fractions, out{w,h} px, fit: cover|contain, region_id?, emerges_from?{part, part_rect}, accept_upscale?, max_upscale?}`

Rules: no unseen viewpoint from one image; no stretch; density under 1 (upscaling) is unavailable unless explicitly accepted, and then fidelity is not claimed; inspiration-only or unresolved rights are unavailable; unauthorized acquisition is unavailable with no hidden fallback; a mask or alpha that was never inspected keeps the state `uncertain` and edge quality `not_inspected`; flat collage is not forced into 3D lighting, while spatial finish needs depth/matte for contact and occlusion. Rights authority stays `license-register.mjs` and `provenance.mjs`.

## Injection path

Optional additive shot-layer fields in `hybrid/sources.json`: `crop, region_id, anchor_id, mask_sha256, fit, plan_digest`. `hybrid-compositor.compositingFields(layer)` reads them, `validateSources` checks them, and `hybrid-graph` adds them to the layer's `trim` node key so a changed crop, region, anchor, mask or plan digest invalidates every dependent node (scoped invalidation for W11). Layers without them behave exactly as before.

## Later evidence (not produced here)

Identity across transformations, crop correspondence, edge quality, source resolution, visible seams, rights. Fields for W09 are in `review`; none are observed by the planner.

## Deferred cases

AST-01 to AST-10 (source quality, unseen view, crop correspondence, uninspected alpha, private content, spend/transmission, flat collage, contact/occlusion, macro resolution, post-approval change) plus REF/CRF observation. Specs only; not run.
