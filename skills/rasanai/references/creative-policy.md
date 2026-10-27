# Creative policy: which instruction wins

One resolved policy decides what the crew is told. `scripts/lib/creative-policy.mjs` (`resolveCreativePolicy`) builds it from the existing production policy (`lib/rules.mjs`); it is a pure function (no network, model, CLI or file access) and its output is the same for the same inputs. The plan (`crew/plan.json` policy) is the authority; `creative/effective-policy.json` is a readable projection of it and carries the same digest.

## Resolution order

A lower layer never silently overrides a higher one.

1. Operating safety and truthful constraints: permissions, install restrictions, CLI construction, console protocol, resume, the approval order (Brief, Story, Look, Storyboard/animatic, Build, Final), the claims ledger.
2. Explicit current user decisions and granted delegation (per-film constraints beat saved settings).
3. Current approved artifacts (a pinned medium, register or ambition level is not changed retroactively; a new instruction that disagrees is reported).
4. Identity and rights constraints (brand requirements, rights ledger).
5. Inferred communication needs (launch, formal, documentary, title...).
6. Medium-specific craft guidance and capability states.
7. Historical preferences and defaults (pace presets, house show-off style).

An approved aesthetic may relax a stylistic default. It cannot make an unsupported claim true or grant missing rights.

## What it resolves

Pace and budget, research ceilings (time and source count, never widened), review budget (critic and fix rounds), model plan (a single-model choice wins over any role split), scheduling strategy, brand requirements, medium and capability state, ambition level and spectacle, language register. Each field records the winning rule, its layer and any supporting rules; every rule has a stable ID, authority, applicability, reason and source.

Permitted, with no relaxation of evidence or permissions: formal or abstract language, an editorial metaphor with truthful proof, a quiet Maximal treatment (Maximal is ambition, not density; the replayable moment may be quiet), and a deliberately minimal or typography-only film.

## Pace rules every pace shares

- Local indexed creative references and one bounded idea pass are allowed at every pace. Web precedent searches use the pace's existing source and time allowance. When it is spent, develop concepts from what exists and report which references were not reached (`budget_exhausted`); never expand spend silently.
- Scheduling follows continuity ownership groups and ready jobs: independent scenes run in parallel up to the worker cap, a continuous action has one owner. One agent per scene is the outcome of independence, not a fixed rule.
- Spectacle is earned by the story and the brief, not mandatory; a formal or minimal brief needs none.

## Status and conflicts

`status` is `resolved`, `conflict` or `missing_input`. Routine defaults are resolved from authority and are not conflicts. Report only: two rules at the same layer disagreeing, an approved pin versus a new instruction, a protected field someone tried to change, native settings versus the engine plan on a material field (current user intent wins, one sentence goes into the prompt), a required brand or medium with no source. Do not turn each into a question; ask only for a material unresolved one.

## Revisions

`creative_policy_revision` 1 is legacy and unchanged (the resolver returns the legacy production policy). 2 is the v3 behavior, opt-in on new plans only. Any other value is `unsupported_policy`: stop new dispatch; an existing run keeps its original contract and approved concepts. Use `creativePolicyOn(plan)`, not `=== 1`.

## Error codes

`CREATIVE_ERROR_CODES` (exported): policy_conflict, unsupported_policy, required_commitment_unbound, intentional_absence_unresolved, owner_missing, continuity_cycle, medium_unresolved, capability_unavailable, stale_input, temporal_evidence_missing, material_deviation, approval_missing, budget_exhausted, not_assessable. Messages name the artifact, the commitment and the repair phase. A code guides status and notes; it adds no control and authorizes no repair.

## Deferred acceptance cases (specs, not run)

Policy
- POL-01 Every pace x model plan (fast/standard/thorough x recommended/opus/sonnet/settings) resolves coherent fields; single-model choices set `single_model_wins`; digests differ only where fields differ.
- POL-02 Same inputs twice give an identical digest; key order of inputs does not matter.
- POL-03 Explicit user constraint beats an approved-default and a saved setting; the loser appears under `overridden`.
- POL-04 An approved artifact pinning `medium.selected` plus a contrary new instruction: the approved value stays, a `policy_conflict` names both rules.
- POL-05 Native settings and engine plan disagree on `model.choice`: one notice conflict with exact fields, user intent used.
- POL-06 A constraint trying to change `permissions.install` or `claims.unsupported_allowed`: kept, `policy_conflict` blocked.
- POL-07 `creative_policy_revision` 3 or "x": `unsupported_policy`, policy null; revision 1 returns the legacy policy, no `creative_v3`.
- POL-08 `brand.required` with no brand reference: `missing_input` with the actionable reason; no new question raised.

Runtime
- RUN-01 Fast pace: assembled launch text allows local references and the idea pass, keeps 2 min / 6 sources, drops the precedent-researcher ban (effective content, not a new sentence nobody reads).
- RUN-02 Fast pace plan with a single continuous action: schedule has one owner, no fixed per-scene swarm.
- RUN-03 Independent scenes still launch together up to the cap of 10.
- RUN-04 A quiet Maximal treatment: ambition Maximal, spectacle `earned_quiet_ok`, no density added.
- RUN-05 A launch using an editorial metaphor: allowed; claims ledger remains authority, unsupported claim not made true.
- RUN-06 A formal or title film: register formal, spectacle none required.
- RUN-07 Permission/CLI construction, console protocol, resume text identical before and after.
- RUN-08 `effective-policy.json` digest equals the plan policy digest; `checkPolicyDigest` returns `stale_input` after a plan change.
