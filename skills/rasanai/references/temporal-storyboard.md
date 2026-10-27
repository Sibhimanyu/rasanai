# Temporal storyboard: reads, cause before reaction, editorial sequence

A shot is a time-dependent argument: a visible cause, an action, a consequence and what the viewer is meant to notice and understand, in order. This page is the contract for the storyboard stage's additive temporal fields. Library: `scripts/lib/storyboard.mjs` (records, `normalizeReads`) and `scripts/lib/editorial.mjs` (`evaluateTemporal`). Timing authority stays the score (`motion/score.json`); nothing here is a second timeline, and nothing re-times, lengthens or accelerates a shot.

## Fields (all optional, inside the existing shot record)

| Field | Meaning |
|---|---|
| `reads[]` | ordered audience reads: `id`, `event_id`, `what_to_notice`, `what_to_understand`, `source_interval` (`start_s`/`end_s` in score seconds, or a `beat_ref` the score carries; `timebase` and `score_revision` kept as written), `attention_target`, `minimum_read_basis` (`{min_s, assumption}`), `competing_reads[]` (`{id, why_followable}`), `accessibility_dependency` |
| `bindings` | `initial`, `action`, `consequence`: each `{panel_id, state, event_id, start_s, end_s, anticipation?{motivated, reason}}` |
| `camera_intent` | `{motivation, move?, event_id?}`: why the camera does what it does |
| `sound_intent.relation` | how sound relates to the picture (answers, leads, counters, silence) |
| `composition` | the neighbour inventory: `focal_subject`, `scale`, `framing`, `ground`, `density`, `action_register`, `adjacent_relation`, `anchor_ids`, `text_roles`, `representation_level`, `repeat_reason?` (anchor ids and text roles come from `composition-anchors.mjs` / `text-performance.mjs`) |
| `transition_out.cut_function` | what the cut does: `cause`, `contrast`, `ellipsis`, `viewpoint`, `evidence`, `rhythmic_punctuation`, `separation` (alongside the existing `relation`) |
| panel `event_id`, `phase`, `score_revision` | which event and phase a panel shows, and the score revision it was drawn against |

A revision 1 board has none of these and is normalized, validated, digested and approved exactly as before.

## Reads against the score

`normalizeReads(reads, score) -> {intervals, errors}` resolves each read to `[start, end)` score time (integer ticks, `timing.mjs`), keeping the timebase and `beat_ref`. Errors use `CREATIVE_ERROR_CODES` from `creative-policy.mjs`:

- `temporal_evidence_missing`, kind `reversed`: the read ends before it begins (TMP-01); kind `unresolved` or `no_score`: no window the score can resolve (never invented).
- `stale_input`, kind `stale`: the read names an older score revision (TMP-02). The window is kept as written and marked `stale`; nothing is re-timed.
- `stale_input`, kind `out_of_bounds`: outside `0..score total`.

Reads may overlap when independent channels cooperate; the Director records why in `competing_reads[].why_followable`.

## Judging (findings, never rewrites)

`evaluateTemporal(shots, ctx)` (also run inside `evaluateFilm` when a shot carries temporal fields) reports:

- `read-window-short` (TMP-03, TMP-05): a read needs more than its window by its own stated `minimum_read_basis`. Repairs offered: fewer messages, different staging, more time; never speed up a causal action, never override the user's duration or budget. No fixed words-per-second for all media; no basis, no verdict (listed under `unassessed`).
- `reaction-before-cause` (TMP-04): consequence starts before its action, unless the concept motivates anticipation.
- `reads-overlap-unexplained`, `read-stale`, `action-before-initial-state`, `no-consequence` (a demo with no visible result).
- `composition-reset` (TMP-07): three or more neighbouring shots with the same full composition fingerprint and no progression of the consequence, without a `repeat_reason`. Evidence is the shot ids and the fingerprint, not a card keyword ban. An intentional repeated subject advancing one arc (TMP-06) or with a stated `repeat_reason` is allowed.
- Endings (TMP-08): no universal tiny-ending, biggest-type or sub-second rule; a held ending that resolves the opening and gives its reads their window is allowed.

## Approval, snapshots, invalidation

One review, as before (Brief > Story > Look > Storyboard/animatic > Build > Final). `makeSnapshot` adds `temporal` (per shot digest plus score revision) only when reads exist; `classifySnapshotChange` then reports `reads_changed` (meaning changed) and `reads_stale` (score or audio revision moved; route timing). `audioReplacementImpact` lists the shots whose reads are stale. An approved board proves the user chose the depicted direction, not that the motion works; a timed animatic proves coarse pace and order, not finished acting, semantics or material performance.

## Deferred case specs (authored, not run)

- TMP-01: a read with `end_s < start_s` -> error `temporal_evidence_missing`/`reversed`, no interval emitted.
- TMP-02: a read with `score_revision` different from the score's -> `stale_input`/`stale`, interval kept and `stale: true`.
- TMP-03: word departure and destination reads inside the window identity needs -> `read-window-short` naming the read and a focused timing repair.
- TMP-04: `bindings.consequence.start_s < bindings.action.start_s`, no anticipation -> `reaction-before-cause`; with a motivated anticipation -> no finding.
- TMP-05: a dense UI read with `min_s` over its window -> `read-window-short` with reduce/reframe/more-time options, no acceleration.
- TMP-06: five shots of one subject with differing consequence states -> no `composition-reset`.
- TMP-07: eight shots with one identical fingerprint and one consequence state -> one `composition-reset` naming those shot ids.
- TMP-08: a last shot with `ends_by` and a read whose window meets its `min_s` -> no ending finding.
- KND-04 (instructional-explainer): sourced relationship readable step by step, cause before result; analogy limits stay visible.
- KND-10 (evidence-case-study): attributed permitted result read with its qualifier (a protected text role); no invented graph without a `source_ref`.
- KND-12 (music-lyric-film): lyric/sync windows set the reads; picture-to-music relation stated; no launch grammar.
- KND-13 (footage-led-story): speaker/source meaning orders the cuts, each with a `cut_function`; generated shots are labelled and never read as recorded.
  (`KIND_TEMPORAL_EXPECTATIONS` in `editorial.mjs` holds these four as reviewer data.)

All status: implemented_unvalidated.
