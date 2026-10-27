# Composition and derived transitions

One set of moving anchors and the regions hanging off them. A rule, the image window beside it and the label inside both read the same anchor at the same time, so edges agree by construction. Status: implemented, not validated.

## What exists, what was added

| Need | Mechanic | Where |
|---|---|---|
| Anchor/region evaluation and one-tween binding to a paused GSAP timeline | `RasanLayout.anchorAt / rectAt / bind` | runtime/rasan-layout.js (new; also loads in Node) |
| Plan, validate, sample bounds, digest; derive a boundary | `planAnchors`, `deriveTransition` | scripts/lib/composition-anchors.mjs (new) |
| Circular reveals, flood, push/scale | `RasanShape.iris/flood`, `RasanCamera` | existing runtime |
| Platform UI zones (advisory) | `zonesFor`, `boxInZones` | scripts/lib/safezones.mjs |

Grammar files (`editorial-grid.json`, `glyph-chain.json`) stay source material: their colours, quotas and no-overlap rules are grammar-specific defaults and are not imported here. A new arrangement is just anchors and regions.

## Model

Units: fractions of the frame (x, y from the top-left). Times: seconds on the existing score; no clock is added. `RasanLayout.bind` places one proxy tween at the timeline position you give it, so seeking is pure. A keyframe's `ease` shapes the segment ending there; unknown eases evaluate linear and make the state `uncertain`.

- anchor: `{ id, keyframes:[{t,x?,y?,ease?}] | at:{x,y} | follow:{anchor,dx,dy} }`
- region: `{ id, kind: rule|cell|window|type_group|crop|layer|focal, layer, edges:{left,right,top,bottom} | rect, role?, group_id?, media?:{crop} }`; an edge is a number, an anchor id or `{anchor,d}`. `group_id` names a W13 text group; `media.crop` is fractions of the source picture.

`planAnchors({regions,anchors,score,frame,destination?}) -> { ok, regions, anchors, bounds:{id:[{t,x,y,w,h}]}, sample_times, runtime, digest, capabilityState, errors, warnings, bleeds, safe_zone }`. `runtime` is the plan handed to `RasanLayout.bind`. Bleeding regions are reported, not rejected (deliberate crops are allowed); `safe_zone` only notes reading-role regions over platform UI. Cycles are `continuity_cycle`; reversed or out-of-score keyframes are `stale_input`; no score leaves times `uncertain`.

## Derived transitions

`deriveTransition({from,to,invariants},{plan,score}) -> { ok, mechanism, interval, regions, bounds, digest, capabilityState, unresolved_invariants, steps, errors, notes }`. `from`/`to` = `{at (score s), region_id?, anchor_id?, features:[{type}]}`; invariants are what the boundary must carry: `spatial_anchor, shape, camera, motion_direction, color, identity, contrast`. A mechanism is derived only when both views carry the declared invariant; otherwise it is listed under `unresolved_invariants` and the state is `uncertain`/`unavailable`. `contrast` (hard cut) needs a note stating the meaning. The bridge region `tr:<from>:<to>` runs between the two regions' bounds at the two score times. Mechanisms (options, not a quota): rule_becomes_boundary, field_opens_to_detail, window_becomes_counter (uncertain, needs W13 outlines), foreground_cover, zoom_representation, color_field_wash, object_carry (uncertain, needs a W06 owner), hard_cut.

## Deferred cases (specs, not run)

- CMP-01 two regions on one anchor stay edge-aligned at every sample time.
- CMP-02 same inputs give the same `digest`; moving one keyframe changes it.
- CMP-03 keyframe outside the score or reversed: named error; no score: `uncertain`.
- CMP-04 anchor `follow` cycle: `continuity_cycle`.
- CMP-05 unknown anchor in a region edge: `stale_input` naming region and anchor.
- CMP-06 region leaving the frame is listed in `bleeds`, not rejected; crop outside the picture is an error.
- CMP-07 reading-role region over a destination overlay appears in `safe_zone.notes` only.
- CMP-08 declared `shape` invariant missing from the incoming view: unresolved, not a guessed transition.
- CMP-09 hard cut without a note: unresolved; with a note: available.
- CMP-10 observed (later, authorized): a bound layout seeks identically in any order; at reduced size the intended subject and hierarchy survive; background colour change alone does not count as composition development.
- REF/CRF: sampled editorial and portfolio clips are evidence of intent only; no reference parity follows from code presence.

## Limits

Easing is the table in `RasanLayout.EASES`; GSAP-only eases are `uncertain`. Layout is a plan plus a binder; nothing here measures a rendered frame. W05 carries ids in the storyboard, W06 groups continuous boundaries, W13 supplies text groups (`group_id`), W16 supplies crops. Injection of `rasan-layout.js` is proposed, not wired.
