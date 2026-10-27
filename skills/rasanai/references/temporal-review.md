# Temporal review and the common Final assessment

One pure helper, `scripts/lib/creative-completion.mjs`, decides what a Final writer may say about an output: `assessCompletion({approvals, contract, output, review, limits}) -> {state, reasons, allowedLabels, nextDecisions, evidence, commitments, limitations}`. It reuses `creativeReadiness` (structure, pins, review currentness, independence, the states `ready | revise | blocked | needs_user | not_reviewed`) and adds the temporal, semantic and human layers. It reads no file, renders nothing and calls no model. A run with `creative_policy_revision` absent or 1 and no required commitments gets exactly `creativeReadiness`'s state, plus labels.

## Five evidence classes, assessed separately

1. Structural: schema, IDs, pins, ownership, asset existence. Metadata mappings and declared scene types stay here.
2. Technical: a real output with a sha256, duration, frame rate; factual, rights, permission and mechanical failures (these block `ready` and are never waived by a builder).
3. Temporal: per required commitment, an observed interval in score time, tied to the current output digest and frame rate, with a temporal method (`temporal_playback`, `dense_sequence`, `frame_strip`). Stills, contact sheets, metadata, file extensions and movement metrics are not temporal evidence: an MP4 may be a still image with a moving cursor.
4. Semantic: an independent retell written before the approved intent was read, then compared. Observed tool reads show access, not comprehension.
5. Human: the user's own current Final decision or an aesthetic waiver (`kind: aesthetic`, `source_action_id`, artifact digest). The assessment never creates one.

## Review method

Retell first (`blind-review.retellPacket` withholds intent, commitment wording and builder notes), then compare with the commitments (`compareRetell`). Inspect the defining interval and the seams, not four even stills. Per commitment return `fulfilled | partially_fulfilled | missing | materially_changed | stale | not_assessable` in `review.commitment_results[]`: `{commitment_id, result, artifact_digest, interval:{start_s,end_s}, method, observed, formal?, involves_text?, text_role?}`. Formal passages state hierarchy, invariant, transformation, contrast and resolution (3+) instead of a literal retell. Judge reading copy and visual texture each by its own job; text as image is an artistic subject and removing it is not a universal test. A deliberate quiet film can pass without a raised motion ratio; a retained character is not automatically repetition. Questions: `rubrics.temporalRubricFor(kind, {formal})`.

## States and labels## Attention sequence in playback (addendum 1)

Ordered attention reads (`order`, `target_ref`, `transfer_change`, `protected_read`; see `temporal-storyboard.md`) are assessed in playback only. `temporalRubricFor(kind, {attention: true, connected_motion: true})` appends `ATTENTION_QUESTIONS` (order, transfer, competition, protected read held) and `CONNECTED_MOTION_QUESTIONS` (seams, intermediate states), and sets `playback_review_required` and `automated_check_limits`. `blind-review.attentionPacket` lists the intervals to watch in order and withholds intended understanding and transfer; the reviewer records what the eye met and understood (method `temporal_playback`, `dense_sequence` or `frame_strip`), then `compareAttention` sets it beside the authored reads: `matched`, `different` or `not_assessable` (no or non-temporal observation), never an automatic pass. A mismatch is a finding with a time. Deferred cases CSC-19..21 (ordered targets; competing emphasis; required text protected during its read) are not run. Status implemented_unvalidated.

## States and labels

- Required commitments = reconciled treatment commitments that are bound plus non-`supporting` signature events (revision 2 only). Intentional absences owe nothing.
- Missing, stale or non-temporal evidence: `not_reviewed` (never inferred success). Open commitment or `repair_scope: concept`: `revise`, then `needs_user` at `limits.round_limit` (or the brief's `effort.round_limit`). Reviewer without vision, or `not_assessable`: `needs_user`.
- `allowedLabels`: `draft` whenever the output is playable (an imperfect draft is always disclosable); `reviewed_with_limits` when a current review exists and the state is not `not_reviewed`/`blocked`; `ready` only for state `ready`. Missing temporal evidence blocks `ready`, not disclosure. `completionStatusLine(assessment)` gives the honest sentence for the existing status/note slot.
- `nextDecisions`: `fix_blockers`, `repair_local`, `revise_stage` (concept wrong, consent), `run_review`, `final_decision` (the existing Final control), `accept_draft`.

## Final-writer inventory (call-site patches, none applied here)

Every path that presents a render as Final must call `assessCompletion` (build the inputs from `creative-run.mjs` helpers: `approvalPins`, `latestReview`, `normalizeReviewPaths`, `creative/brief.json`, the output's `sha256File`) and print/store `completionStatusLine`:

| Writer | Anchor | What it must do |
|---|---|---|
| `scripts/console.mjs` | `push` of step `render`/`final` (~l.694-708, where `s.steps[args.step] = next`) | run the assessment for status `awaiting|done`; add `creative_completion` to the pushed step data and put `completionStatusLine` in the existing note slot; never change the approve action or step order |
| `scripts/crew.mjs` | `creativeFinalReviewProblems` (~l.2246-2257) and `creative gate` (~l.3515-3522) | build the review inputs with `commitment_results`; `ship` requires `assessCompletion(...).state === "ready"`; `gate` returns the assessment instead of bare `creativeGate`; film-critic dispatch (~l.900) cites this reference and `retellPacket` |
| `lib/creative-run.mjs` `creativeGate` | l.243 | for revision >= 2 delegate to `assessCompletion` (output digest from the newest render) |
| `scripts/lib/deliver.mjs` via `video.mjs deliver` | `deliver()` / NOTE.md writer | include the status line and state in NOTE.md; a not-ready output is delivered labelled draft |
| `scripts/finish.mjs` | end of a final (non-draft) render | record the output digest, duration and fps so the assessment's `output` is real |
| `scripts/quick-film.mjs` | `render` and `promote` | quick preview stays `draft`; `promote` does not carry a reviewed claim |
| `scripts/reel.mjs` (footage cuts, render ~l.1098) and `scripts/presenter.mjs` | the final render step | same call with the run's brief; no brief means state `not_reviewed`, label `draft` |
| `scripts/hybrid-render.mjs` | final composite output | same call |
| `scripts/delivery.mjs` and `lib/delivery-manifest.mjs` | `package build` / `buildPackage` (masters) | embed the assessment label in MANIFEST; an export of a not-ready master is labelled draft |
| `scripts/director.mjs` `isFinished` (l.95) | reads `steps.final.status === "done"` only | no change needed; the user's approve decision stays the gate |
| `scripts/handoff.mjs` | prompt text for external builders | no render; add one line telling the builder a Final is a draft until reviewed |

No new action, control ID, setting or approval step is introduced. The user's Final decision stays the user's.

## Limits

Metrics can flag suspicious sameness or a missing interval; they cannot prove emotional force or originality, and no claim of machine originality detection is made. Status: implemented_unvalidated.

## Deferred acceptance cases (specs, not run)

- REV-01: still-image MP4 with a moving cursor -> `not_reviewed`, label `draft`, reason `temporal_method_insufficient`.
- REV-02: review observed an older digest -> `not_reviewed`, `temporal_evidence_stale`.
- REV-03: retell not recorded as written before intent -> `not_reviewed`, `semantic_retell_not_blind`.
- REV-04: one required commitment `missing` -> `revise`; at round limit -> `needs_user` with the draft still disclosable.
- REV-05: deliberate quiet film, all required commitments `fulfilled`, no motion metric -> `ready`.
- REV-06: formal passage with only a narrative retell -> `formal_read_incomplete`; with 3+ formal terms -> accepted.
- REV-07: reviewer `vision: false` -> `needs_user`, `reviewer_cannot_see`.
- REV-08: `repair_scope: concept` -> `needs_user`, next decision `revise_stage`.
- RUN-01..08: each Final writer in the table above prints the assessment label; a revision 1 run is byte-identical to `creativeGate`; a rights failure -> `blocked`; no brief -> `not_reviewed` with label `draft`; resumed and quick-film paths behave the same; a stale human decision does not make `ready`; an aesthetic waiver without action id and digest is rejected by `creativeReadiness`.
- EDGE-08: output exists but is unplayable -> `blocked`; output missing -> `not_reviewed`, no labels.
