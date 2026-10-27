# Motif roles

A motif is a recurring visual idea the Look or Director chooses on purpose. A film may have none. It is authored once (identity, invariants, roles, states) and referenced by id from events and beats; it is never inferred from a shape that happens to repeat.

## Supported roles

`guide_attention` (leads the eye to the next read), `reveal_region` (opens or uncovers an area), `frame_evidence` (holds proof or product in view), `link_compositions` (carries the eye or the action across a boundary), `resolve_identity` (settles into the film's mark or final statement), `other` (named in words; use sparingly).

## Authoring a role

Each entry in `roles[]` gives `id`, `role`, an `interval` on the motion score (`{start_s, end_s}`, score time, never frames), the shot or beat it lives in, and a `state_id` into `states[]`. Each state says what the motif looks like and where it stands when the role ends. State what must stay recognizable (`invariants`: silhouette, hue family, proportion, rhythm) and what may change (scale, position, density, material, role). A role change is a written decision, not a side effect of repetition.

## Continuous or recurring

If one object really travels through an action, mark it `continuous`: one owner builds the whole action and receives the prior and required outgoing state. If separate scenes only share a look, mark it `recurring`: each scene builds its own appearance from the shared language and the previous state. When unsure, choose `recurring`.

## Two original examples

1. A thin ink line starts as a horizon under the opening phrase (`guide_attention`), bends down to underline the one number the claim rests on (`frame_evidence`), and ends as the baseline of the closing wordmark (`resolve_identity`). Invariant: one stroke weight and one warm grey. May change: length, curvature, position. Continuous across the three shots, one owner.
2. A small paper-fold corner appears on three unrelated cards (`link_compositions`, then `reveal_region`, then `other: quiet sign-off`). Invariant: right-angle fold and the card's paper tone. May change: size and which card carries it. Recurring: each card is built separately, none owns the others.

Reference films are inspiration for relationships only; never copy their shapes, copy or timing.
