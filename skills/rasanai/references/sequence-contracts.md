# Sequence contracts (Connected Sequence Craft)

Status: implemented_unvalidated. Nothing here has been run, rendered or watched. Active only for plans with `creative_policy_revision >= 2`; revision 1 output and projects without sequence records are untouched. Code: `scripts/lib/sequence-contract.mjs` (pure, no I/O). Not linked from SKILL.md (guidance routing is ENG-INT-3).

## Common envelope

Every record: `{id, kind, version:1, basis:"score", approved_input_revisions:{name:{revision?, digest?}}, semantic_digest}`.

- Ids are stable (event, motif, anchor, asset, layer, capture ids). Records refer to each other by id and never copy.
- Time is the score's (`motion/score.json`, `scripts/lib/timing.mjs`). Seconds are authored; intervals are `[start, end)`, carried as seconds plus integer microsecond ticks plus, when a score is supplied, the score's own frame range. No 30 fps assumption, no second clock. Musical markers are annotations.
- `semantic_digest` covers meaning only (not `notes`, not `approved_input_revisions`). A changed meaning with an old digest reads as stale.
- Normalization is pure and idempotent. It grants no consent, fills in no approval, mutates no input. A missing or unauthored fact stays missing so `checkSequence` can report it.
- Readers reject stale pins and unresolved references (a reference list the caller does not supply is skipped, not guessed).
- Error codes: `SEQUENCE_ERROR_CODES` reuses `CREATIVE_ERROR_CODES` names (`stale_input`, `owner_missing`, `capability_unavailable`, `policy_conflict`, `not_assessable`, `approval_missing`) and adds sequence codes (`sequence_*`, `motif_*`, `handoff_*`, `optics_*`, `product_*`, `attention_*`).

## The five records

| Record | Stored in | Producer | Consumer |
|---|---|---|---|
| Motif direction | `treatment.extensions.creative_thinking.motifs[]` (approved with the Story pin); events add `extensions.creative_thinking.motif_ids` | Look/Director (SQ-MOTIF owns continuity use) | `creative-contract` (validate, slice), `creative-handoff` (packet section `motifs`), continuity-plan |
| Motion handoff | `creative/beat-plans.json` `beats.<id>.handoff` -> `creative/plans/<beat>.json` | Sequence owner (SQ-HANDOFF `motion-handoff.mjs`) | transition adapter, runtime, reviewer |
| Optical treatment | `beats.<id>.optics` | Look + compositing owner (SQ-OPTICS `optical-treatments.mjs`) | compositor/runtime, reviewer |
| Product choreography | `beats.<id>.product` | Storyboard/Director (SQ-PRODUCT `product-choreography.mjs`) | production packet, reviewer |
| Attention sequence | storyboard shot `reads[]` (`storyboard.mjs` `READ_FIELDS`, SQ-ATTENTION) | Storyboard/editor | Motion Director, review |

`signature_events` stays the only event collection. No competing required-event array exists; `treatmentCommitments` is unaffected.

### Motif (`normalizeMotif`)

| Field | Meaning |
|---|---|
| `identity {label, description, kind}` | what the motif is; `kind` in `STATIC_KINDS` (font, logo, palette, ...) is forced to be `recurring` |
| `invariants[]` | what stays recognizable |
| `roles[{id, interval, role, authored, reason, event_ids, anchor_ids}]` | `role` in `guide_attention, reveal_region, frame_evidence, link_compositions, resolve_identity, other` (`other` needs `reason`) |
| `progression[{state, interval, role_id}]` | state progression |
| `relation` | `continuous` (one accountable object through an action) or `recurring` (separate appearances sharing a visual language) |
| `absent_ok` | a film may legitimately not need the motif |

A role change between consecutive roles must be authored (`authored:true` plus `reason`). A role marked `inferred:true` or `source:"repetition"` is rejected. A static logo/font/palette never forces one ownership group.

### Handoff (`normalizeHandoff(raw, score)`)

`handoff_kind` (`continuous | cut | snap | impact`; `kind` on the sealed record is the record type), `from`/`to` `{beat_id, event_id, shot_id}`, `boundary {time_s, tick, frame}` on the score, `coordinate_space` (must be `final_screen`: scene-local, parent, world and camera values are converted first), `units {position, time, angle, scale}`, `state` (outgoing boundary values), `carry[]` from `position, velocity, scale, scale_rate, rotation, angular, camera_relation, mask_state, settle`, `intentional_discontinuity {reason, properties[]}`, `owner`, `motif_id`.

Conditional rules: continuous needs an owner and a non-empty `carry` (exactly what survives); cut/snap/impact need an `intentional_discontinuity.reason`; a carried property cannot also be a listed discontinuity; carried numeric properties need explicit units; a carried property with no `state` value is a warning (runtime measures or producer states it).

### Optics (`normalizeOptics`)

`ops[{id, kind, tier, label, layers{select, protect}, source_layer_id, coordinate_space, mask_source, crop, order, sampling{resolution_scale}, params[{param, fn, keys[[t_s,v]]}], interval, protected_reads[{id, ref, interval}], channel, compose_with[], capability{op_id, state}, creative_decision}]` plus `dependency_digest`. Kinds: `motion_blur, focus_blur, stylized_distortion, soft_material, edge_treatment, mask` (distinct operations). Tiers: stylized distortion is enhancement, the rest essential. Rules: a layer selection is required (no whole-frame fallback); two operations on the same `channel` and layer while overlapping need one owner or mutual `compose_with`; a blur or distortion cannot target a layer during its protected read; "refraction" is rejected as a label for a stylized distortion; an essential operation whose capability is `unavailable` needs a recorded `creative_decision` (otherwise an error), `uncertain` is a warning. Capability states come from the plan or from the caller's inventory (`spatial-fields capabilityInventory().ops` fits); they are never assumed.

### Product (`normalizeProduct`)

`stages[{stage, interval, source_state_ref{kind capture|demonstration, id, digest, revision}, labels, conditions, simplifications, anchor_ids, reading_window{interval, min_s}}]`; stage order `context -> action -> result -> isolate -> hold` (only those the claim needs). Every stage binds to an approved capture state or to content labelled as demonstration; result/isolate/hold need a reading window inside the stage; Studio depictions need `ui:"current-dark"` (dark sidebar plus Describe...Final stepper; the old light UI is retired). A capture whose pinned digest differs from the current capture is stale and blocks that beat.

### Attention (`normalizeAttention`)

`reads[{order, target_ref{kind object|region|text_group, id}, interval, intended_understanding, transfer_change, competing[{ref, treatment}], protected_read{required, min_s_basis}}]`. Orders are unique and follow time; a required protected read cites its basis (a text-performance role or a product reading window, never a universal hold); protected reads of different targets may not overlap.

## Staleness

`staleSequenceRefs(records, current)` returns `[{record_id, record_kind, code, ref_kind, ref, message}]`:

1. an `approved_input_revisions` entry whose digest/revision differs from `current.revisions[name]` (and `score` vs `current.score_revision`);
2. a record whose recomputed `semantic_digest` differs from `current.digests[id]`;
3. a reference (event, beat, shot, motif, anchor, layer, mask, target, capture, demonstration, object) missing from the matching `current` list;
4. a capture bound by a digest the current capture no longer has.

`sequenceDigest(records)` is one order-independent digest over (kind, id, meaning) for the revision stamps.

## `checkSequence`

`checkSequence({motifs, handoffs, optics, product, attention, events, score, capabilities, current}) -> {ok, errors, warnings, records, digest, stale, playback_review_required}`. It checks shape, score-range intervals, authored roles, carry/units, filter ownership, source-state binding and attention ordering. Nothing in it proves a movement reads well: `playback_review_required` lists every handoff, optic, product and attention record that still needs a temporal playback observation.

## Wiring: producer -> artifact -> consumer

| Link | State |
|---|---|
| treatment motifs -> `validateCreativeBrief` (rev >= 2; errors only from the storyboard phase for completeness gaps, always for identity, authored-role and reference faults) | wired in `creative-contract.mjs` (`validateMotifBindings`) |
| treatment motifs -> `creativeSlice({treatment})` (only the motifs the slice's events use) | wired, caller must pass `treatment` (proposed for the existing callers) |
| event `motif_ids` -> `creative-handoff` projection (`EXT_KEYS`, review packet, `motifs` section in `buildCreativeInputs`) | wired |
| sequence records -> `assessCompletion` via `contract.sequence` and `review.sequence_results` (lowers state only, withholds `ready` without playback evidence) | wired in `creative-completion.mjs`; callers (finish, video deliver, reel, hybrid render, quick-film promote) do not yet pass `contract.sequence` (proposed, ENG-INT-2) |
| beat plan keys `handoff`, `optics`, `product` -> `packets.beatDeclarations/beatPlanNeeds` -> `writeScenePlans` | proposed (ENG-INT-1) |
| `checkSequence` gate before dispatch (`creative-run.mjs` gate reasons) and motif read at `crew.mjs plan` | proposed (ENG-INT-1) |
| records -> runtime op | proposed (SQ-HANDOFF/OPTICS/PRODUCT libs plus `medium-wiring RUNTIME_FILES`) |
