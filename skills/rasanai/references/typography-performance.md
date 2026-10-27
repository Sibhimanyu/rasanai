# Typography as a performer

Text that carries the composition, not only text that enters a box. This is a planning layer over mechanics that already exist; it is not a second renderer. Status: implemented, not validated (nothing here has been run).

## What exists, what was added

| Need | Mechanic | Where |
|---|---|---|
| Split into chars / words / lines, aria-label kept | `RasanShape.split` | runtime/rasan-shape.js |
| Path-following type, morph (needs a path), scatter, circular reveals | `followPath`, `morph`, `scatter`, `iris`, `flood` | runtime/rasan-shape.js |
| Outline/fill exchange, per-fragment masked reveal, controlled reorder, script split safety | `RasanType.outlineFill`, `maskReveal`, `reorder`, `scriptInfo` | runtime/rasan-type.js (new) |
| Role projection, op planning, font identity, digest | `projectTextRoles`, `planTextOps`, `fontIdentity` | scripts/lib/text-performance.mjs (new) |

Simple readable text keeps plain DOM and the staged font. Plan ops only where a beat needs glyph-level performance.

## Logical text versus fragments

`logical.text` is the reading (aria-label on the host, DOM order, unchanged by every op). Fragments are presentation. Every planned op reports `logical_text_unchanged: true` and the final reading order. RTL and complex scripts (Arabic, Hebrew, Indic, Thai, Khmer, Myanmar...) are never split into characters: the op is `unavailable` with an `alternative` granularity. Latin per-character splits are `uncertain` (kerning and ligatures are lost unless the host sets them).

## Roles

`primary_reading | supporting_reading | texture | identity_asset | product_evidence | qualifier`. Only `texture` is expendable; an unassigned role is treated as protected. A protected group given a fragmenting op must name a `read` interval (score seconds) where the whole phrase is legible, and the op may not overlap it. Qualifiers, product evidence and identity assets cannot be reordered, repeated or (identity) path-set. Large crops and microtype are not banned: the selected direction decides; only the required phrase needs its own legible state.

## Operations (`TEXT_OPS`)

outline_fill_exchange, masked_fragment_reveal, controlled_reorder, path_following, repeated_field (available through existing mechanics); word_to_form, negative_space_reveal, counter_passage (need glyph outlines: offered only when the font record has an outline source and rights are not restricted, and even then `uncertain`); image_letter_overlap (scene-authored, `uncertain`). With no outlines, word_to_form returns `unavailable` plus `fallback: masked_fragment_reveal`; say aloud it is a mask, not a morph. The Director decides whether the fallback changes the approved passage.

## API

```js
import { projectTextRoles, planTextOps, fontIdentity } from "scripts/lib/text-performance.mjs";
const roles = projectTextRoles([{ id:"t1", text:"Ship it", role:"primary_reading" }, ...], { roles: { t2:"texture" } });
const plan = planTextOps({ roles, font:{ family, weight, path, rights, outline_source }, anchors /* planAnchors() result, optional */,
  score:{ duration }, ops:[{ id:"o1", op:"masked_fragment_reveal", group_id:"t1", granularity:"words", region_id:"cell-a",
  interval:{ start:1.0, end:1.8 }, read:{ start:2.0, end:3.0 } }] });
// -> { ops[], fontIdentity, dependencyDigest, capabilityState: available|uncertain|unavailable, errors[], notes[] }
```

Times are score seconds only. IDs match `ID_RE` from composition-anchors.mjs and are shared with anchors/regions. `dependencyDigest` covers font identity, projected roles and the op list (id, op, group, granularity, anchor, region, interval, status, reads) plus the anchor plan digest, so a font swap or copy edit changes it. Errors use the shared codes (`stale_input`, `temporal_evidence_missing`, `capability_unavailable`, `material_deviation`).

## Deferred cases (specs, not run)

- TYP-01 role projection: unassigned role becomes protected; unknown role is a named error.
- TYP-02 qualifier/product evidence given controlled_reorder or repeated_field: `capability_unavailable`.
- TYP-03 primary text fragmenting op with no read interval: `temporal_evidence_missing`; with overlapping read: `material_deviation`.
- TYP-04 Arabic/Devanagari with `chars`: unavailable, alternative words/lines; Latin chars: uncertain.
- TYP-05 word_to_form with `outline_source: none`: unavailable with fallback; with restricted rights: unavailable.
- TYP-06 identical inputs give an identical `dependencyDigest`; changing the font hash changes it.
- TYP-07 op interval outside the score or reversed: named error; no score: noted, not invented.
- TYP-08 two overlapping fragmenting ops on one group: second is unavailable.
- TYP-09 observed (later, authorized): a built beat seeks identically in any order and the final phrase equals `logical.text`; layout identical before and after font load.
- TYP-10 observed: product proof and qualifiers unchanged through the passage; a letter-tween count alone is not a pass.
- REF/CRF: sampled reference stills do not prove source technique; no parity claim follows from this module.

## Limits

Kerning/shaping beyond the browser (`shaping: browser-dom`) is unverified. `fontIdentity` reads the font file to hash it when `path` is given; nothing else touches the disk. Injection of `rasan-type.js` is proposed, not wired (see the W13/W14 report).

## Sequence addendum: protected reads and distortion (implemented_unvalidated)

- `protectedReadsOf(roles)` lists every protected group's read intervals as `{id:"read:<group>:<n>", ref, interval, basis:"score"}` for optics `protectedReads`, attention `protected_read` and handoff holds.
- An op marked `distorts:true` (crop, warp, oversized scale) that overlaps a protected read is `material_deviation` unless that read carries `allow:"distort"`. Outside the read, expressive type may crop or distort freely.
- Runtime: `RasanType.inRead(t, reads)` (pure) and `RasanType.holdRead(tl, target, {reads, at, duration, t0})` clear fragment distortion inside a read; place it after the effect tweens.
