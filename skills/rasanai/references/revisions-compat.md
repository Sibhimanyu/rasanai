# Revisions, compatibility and scoped learning (V3)

Status: implemented_unvalidated. Source: `lib/impact.mjs`, `lib/revision-bind.mjs`, `lib/revision-events.mjs`, `lib/revision-intent.mjs`, `lib/lessons-scope.mjs`, `lib/medium-learning.mjs`. No new store, queue or timing authority: revisions stay in `revisions/requests.jsonl` and `crew/revisions.jsonl`; lessons stay in `lessons.jsonl`.

## Policy revisions

| Plan marker | Mode | Behavior |
|---|---|---|
| absent | legacy | unchanged; no creative checks |
| 1 | recovery | unchanged semantics: strict consent, creative checks, no commitments |
| 2 | v3 | added deliberately, on new plans or an explicit revision; commitments, temporal reads, identities |
| anything else | unsupported | files stay readable; NEW dispatch stops (`unsupported_policy`) before any packet is written. No permissive legacy fallback |

`revision-bind.mjs policyCompat(plan)` returns `{mode, revision, creative_on, v3, strict_consent, dispatch_allowed, code?, message?}`. A re-plan must carry the saved marker forward (`carriedRevision(prevPlan)`); it never lifts 1 to 2 or drops 2 to legacy. Saved runs are never migrated silently: adopting revision 2 is an explicit user revision that shows what changes and writes a NEW revision with a receipt (`buildMigrationReceipt`: original preserved, bindings only from real consumed actions, unbound items listed, `retroactive_approval: false`, `validated_against_new_requirements: false`). Reading a legacy film is not validating it.

## Dependency identity

Identity keys are `kind:id` (`brief`, `story`, `look`, `policy[:field]`, `event:<id>`, `object:<id>`, `score`, `font`, `shaping`, `anchor:<id>`, `material`, `camera`, `asset`, `copy`). `impact.mjs`: `identityMap(parts)` digests values; `consumerIdentity(reads, map)` is one digest over just the keys a job/review/binding reads; `diffIdentity(before, after)`; `affectedClosure({consumers, changes})` returns `{stale, keep, reasons, full_rebuild}`. A consumer is stale only if it reads a changed key or is built from a stale consumer. A one-event edit never rebuilds the film; `full_rebuild` is true only for a brief change or when no consumer declares its reads (cannot be narrowed).

Change scopes (`impact.mjs CHANGE_SCOPES`, `revision-intent.mjs classifyChangeScope`): `copy_spelling`, `asset_correction`, `timing_adjustment`, `material_change`, `event_substitution`, `new_story`. An intensifier ("punchier") refines existing motion: it authorises no new premise, no provider spend, no denser information. Two scopes at once, or an unrecognised one, asks first. `buildChangeRecord` keeps affected commitments, reason, real source action, old/new artifact identities and the invalidation; on a revision >= 2 run `buildRevisionRequest` stores `change_scope` on the request line (legacy requests are byte-identical).

## Resume and late results

`revision-bind.mjs lateResultVerdict({recorded, current, reads})` rejects a result whose event/object/policy/Look/score/font/anchor identity moved while it ran (`disposition: "old_reference"`: kept as reference, never published as current). `revision-events.mjs staleByIdentityEvents(run, currentKeys)` marks unfinished revisions stale through the existing `markStale`; events may carry `identity {keys, reads}` and `invalidation {stale, keep, causes}`. `checkRenderReceipt` compares an `identity` digest when the accepted record carries one; `bindAnnotation` takes `currentAnchors`. Recompute only the affected closure; never rerun the whole film for a missing review envelope.

## Equality consumers and dropped projections

Exported as `REVISION_CONSUMER_INVENTORY` and `PROJECTION_GAPS` in `revision-bind.mjs` (exact anchors and replacements). Summary: `creative-run.mjs creativeOn` (`=== 1`) and its two brief/selection writers (hard-code 1), `scripts/storyboard.mjs strict()` (`=== 1`), `crew.mjs` plan re-plan branch (`prev ... === 1` erases a 2) and the `--creative-policy` parser; the many `creativeOn(...)` sites in `crew.mjs`, `design.mjs`, `frames.mjs` follow once `creativeOn` is fixed; `skill-map.mjs` has no equality check; `motion-gate.mjs`/`obey.mjs`/`moves-lib.mjs` use truthy tests (pass 2, also pass an unsupported 3). Serializers that drop new fields: `packets.mjs` packet body, continuity group identity (`continuity-plan.mjs` -> `jobs.mjs`), the storyboard look pin, the render receipt writer.

## Scoped learning

See `references/learn.md` (V3 section). Lessons carry scope, applicability, source quote and confidence; the current explicit instruction sets same-topic leans aside for that film with provenance; one negative film never becomes a global ban; a rejected candidate only stops itself repeating inside its project.

## Deferred acceptance specs (authored, not run)

| ID | Setup | Expected observation |
|---|---|---|
| MIG-01 | Open a plan with `creative_policy_revision: 1` and approved Story/Look | `policyCompat` -> `recovery`; no file rewritten; approvals unchanged |
| MIG-02 | A revision-2 brief passes through the packet body / look pin / continuity identity | the new fields appear in the digest (after the proposed patches) or activation is refused; never silently dropped |
| MIG-03 | Plan marker `3` or `"x"` | `policyCompat` -> `unsupported`, `dispatch_allowed:false`, code `unsupported_policy`; existing files still read; a re-plan keeps the marker |
| MIG-04 | "make it punchier" | `classifyChangeScope`: `timing_adjustment`, guards all false; premise/proof not in the stale set |
| MIG-05 | "the logo is wrong" on one beat | `asset_correction`; `affectedClosure` stales only consumers that read `asset:<logo>`; research/Story kept |
| MIG-06 | "the voice is out of sync" | `timing_adjustment`; stale: score bindings in range, audio alignment, transitions, build; Look/copy/events kept |
| MIG-07 | A museum or card film rejected | `canPromoteRejection` without scope fails; with scope the lesson is a scoped lean; no genre ban in `projectRepeatAvoid` for other projects |
| MIG-08 | Saved energetic-type preference, note "quiet typography" | `instructionFromNote` overrides it; `resolveAgainstInstruction` sets it aside with the provenance string, not deleted |
| RUN-07 | Story/Look/Storyboard files without consumed approvals | no consent inferred; `buildMigrationReceipt` never binds a signature event without a consumed `source_action_id` |
| RUN-08 | Permission/CLI/default/UI code changed in a native-prompt-only task | scope audit (W12) flags it; this lane touches none (only lib/agents/references files) |
| EDGE-11 | Original mega-plan archive recovered later | original files and IDs untouched; a reconciliation note says this version is not a byte-preserving revision |

Not validated by any run; case results belong to the deferred test pass.
