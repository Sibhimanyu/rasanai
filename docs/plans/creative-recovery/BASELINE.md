# Baseline (RASANAI-CREATIVE-RECOVERY-20261026)

Status: `implemented_unvalidated`. Nothing was run, tested, rendered, committed or installed. Only `node --check` (syntax) was used.

## What the integration started from

- Repo: `/Users/sibhi-zstch1643/conductor/workspaces/motion-graphics-skill/luxembourg`, branch `Sibhimanyu/preview-screen-controls-fix`.
- HEAD: `746d6a96d8e07139b80685d26230a6f3d03ca405` ("Studio: honest chat status, blocked-command banner, stage layout fit"). The spec's inspected baseline `9f67ccb76ccd...` is not this HEAD; every anchor was located by symbol, not line number.
- Engine / skill version: `skills/rasanai/VERSION` = **1.27.0** (Studio's own version is not touched: `apps/macos/**` is frozen).
- Existing changes before the integration lead started: the eight lanes' output was already uncommitted (27 modified tracked files under `skills/rasanai`: agents, references, `frame-gate.mjs`, `lib/frames-lib.mjs`, `lib/look.mjs`, `lib/moves-lib.mjs`, `lib/packets.mjs`, `lib/storyboard.mjs`, `motion-gate.mjs`, `obey.mjs`; new: `lib/creative-contract.mjs`, `lib/creative-references.mjs`, `lib/proof-integrity.mjs`, `lib/creative-handoff.mjs`, `library/creative-reference-index.json`, `library/creative-examples/`, `references/creative-quality.md`, `references/creative-reference-intake.md`, `scripts/tests/creative-recovery/`, and `docs/plans/creative-recovery/TEST_APPROVAL_REQUEST.md`). Unrelated untracked work that is not part of this task and was left alone: `apps/rasan-3d/blender/**` renders and `.blend1` files, `12`, `fc-clean.png`, `fi-clean.png`.
- Frozen paths (`apps/macos/**`, `skills/rasanai/console/**`, `scripts/console.mjs`, `scripts/lib/stages.json`): `git diff HEAD --name-only` over them is empty.

## Equivalents that already existed at HEAD (extended, not duplicated)

| Spec anchor | Existing symbol at HEAD | Used as |
|---|---|---|
| `planCrew(p)` / DIRECT_ROUTES / `directFilm` | `crew.mjs` `planCrew`, `DIRECT_ROUTES`, `lean && p.direct` branch, `if (!lean)` jury | additive `creative` branches and a post-pass |
| `contextFor` gate | `productionGate(run, role, key, P)`, `storyboardBoundary(run, {mode:"full"})` | strict variants for the new policy |
| packet handoff | `compilePacket` (`lib/packets.mjs`), `crew/packets/<role>.json` receipts | W07 mandatory creative sections |
| research/design dispatch | `research-lead`, `design-researcher`, `design-system-designer`, `design.mjs compare-plan` / `look-payload` / `choose-system` | references, brief, comparison-plan attachment |
| styleframes / boards / jury | `styleframe-designer`, `frame-designer`, `frame-juror` checks in `checkRole`; `frames.mjs init/shots-check/refs/gate` | policy-aware checks, sidecar review |
| reference stills | `frames-lib.collectRefs`, `frames/refs.json` | extended with the selected creative references' lawful images |
| verdict check | `checkShots`, `checkVerdict` (+ lane additions `craftProfile`, `checkCreativeReview`) | called with `creativePolicy` |
| concept gate | `concept-critic` check, `story/concept-check.json` (`Q` list, `conceptV2`) | two new keys under the policy |
| Motion Director check | `checkScore` in `case "motion-director"` | + execution-map verification |
| approval state | `session.json` steps (`status`, `by`), `actions.jsonl` + `consumed.json` + `rejected.json`, `approvals.json`, `storyboard/approvals.json` | read-only, through lane code `resolveStageConsent` / `stageConsentContext` |
| skill loading | `skill-map.mjs` `resolveRoute`, `BASE_DEEPER`, `SKILL.md` phase table | `CREATIVE_DEEPER` |
| scheduling graph | `lib/graph.mjs` (not changed; derived from `plan.phases`; Director-only phases do not gate) | none |

Things that did NOT exist and had to be built (all in new `scripts/lib/creative-run.mjs`, a leaf helper shared by `crew.mjs`, `frames.mjs`, `design.mjs`): the run-side glue for pins, look style, references, the provisional brief, brief revisions, reference stills and the readiness gate.

Fields the lanes guessed that do not exist at HEAD are listed in `KNOWN_LIMITS.md` ("Lane guesses").
