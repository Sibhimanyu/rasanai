# Final closure report: Creative Recovery Part 1 + Style Intelligence Part 2

Group RASANAI-FINAL-CLOSURE-20261026. Static audit and minimal integration patches only.

**Status: `blocked_unvalidated`** (not `awaiting_test_approval`): the source is wired, but an installed Studio does not carry it (see Blocker 1). Nothing here is tested, rendered, GUI-checked or run, and nothing is claimed validated or award-winning.

## Baseline

- Branch `Sibhimanyu/preview-screen-controls-fix`. HEAD before this pass: `689d5dad` (commits `4692f6e9` Part 1, `0482e3bb` Part 2, `689d5dad` candidate note). The closure patches are in the commit that adds this report.
- Skill `VERSION` 1.27.0 on this branch. `origin/master` is 1.28.0. This branch is 7 commits ahead of and 24 behind the merge base `c3f0dc2c`.
- Owner's untracked Rasan 3D files (Blender backups, walk-and-wave frames), `12`, `fc-clean.png`, `fi-clean.png` were left alone.
- No in-flight Part 2 work existed at audit time: all nine lanes had finished and been committed.
- Frozen paths (`apps/macos/Sources/**`, `apps/macos/Resources/**`, `skills/rasanai/console/**`, `scripts/console.mjs`, stage definitions) are unchanged by the Part 1, Part 2 and closure commits (verified with `git diff --stat` / `git status`).

## PART2_STATUS

**merged-but-unvalidated** (committed on this branch, not on master, not in any installed app). Heresay labels all eight earlier briefs "fixed" with a "testing comes later" note; the code state is "implemented, never executed".

## USER_UI_PRESERVED

Source-inspected, not GUI-tested. No native or console file changed. Look/Story card payload keys are unchanged (`design.mjs` `look-payload`/`lookCard` untouched; `compare-plan` only gained additive fields). Studio's choose/approve values (`String` id, `{use:"direct",mode}`, `approve` on `animatic`) are all read by `look.mjs`. Strict consent applies only to plans with `creative_policy_revision: 1`; legacy plans keep the old behaviour. No helper writes `session.json` or consumes actions. A prepared file, brand-derived Look, Fast/lean mode or recommendation never approves a stage.

## TESTING_STATUS

NOT RUN, NOT AUTHORIZED.

## Active-runtime wiring (C1)

| Edge | Status |
|---|---|
| plan -> creative opt-in (`crew.mjs` plan) | wired; default for new DIRECT_ROUTES plans, footage/lyric/caption excluded |
| references/brief -> Story | wired (`creativePrepare`, `creativeContext`) |
| Story proof contracts -> editor | wired; missing file now a problem when a proof-kind signature event exists (field name guessed) |
| Story pin -> medium selection | wired; now waits for `creative/medium-judgments.json` instead of picking without judgments |
| selection -> Look (compare-plan, `medium.json`, choose) | wired; Look digest includes the medium digest |
| Look -> boards and jury | wired; lean plans keep the frame-juror pass |
| score -> execution map | wired; builders/animators can now register and edit their own rows; motion-director must stamp the policy marker |
| packets -> builders | wired; shortlist now receives the medium; packet digest covers the medium projection only when present |
| medium runtime -> project | wired via `video.mjs inject` (`--run`, or default from `<run>/videos/` when `look/medium.json` exists); docs now pass `--run` |
| builder -> review | wired, builder-asserted; visual result is `not_assessable` without a render; critic judges renders |
| Final gate | **advisory only** (`creative gate` is a Director-run CLI; `console.mjs`/`finish.mjs` are out of scope) |

## Style execution (C2): 8 profiles

All eight are **source implemented, partly wired, unvalidated** (`verified: false`, no render has ever run): flat vector, line art, paper/collage, native pixel, pixel + sharp UI, cel acting, isometric, evidence diagram.

- Cel is the riskiest: its Rasan2D calls (`createRenderer`, `destroy`, `boil.amp=0`, catch/hold) are unconfirmed. After this pass its capability row is available only if `rasan2d.js` text contains `createRenderer` and `boil`, otherwise `implemented_unvalidated` with a fit condition.
- Pixel font is Latin-only; pixel profiles now list unsupported scripts, so fit warns before a build.
- Line art: absolute path commands only. Evidence diagram sets mode: two sets only. Collage is vector-cut paper, not photographed stop-motion.
- Fixed now: medium override of the unconditional "show off" text; `fluency`/`creep` scoped by contract; `slop.mjs` finish checks respect `by_layer`; `obey.mjs` checks the runtime is referenced; crew checks fail a build that never calls its runtime; hybrid contracts must keep a sharp evidence layer; depth/dimensional craft qualifies isometric, cel and diagram layers.

## Suitability (C3)

No category bans (no B2B/SaaS/finance rule anywhere); brand preferences cannot block, only named profile/family/execution/action/tag constraints can. Counts unchanged (Looks default 3, never reduced; `--count` now floors at 3). No path writes an approval. Fixed now: adequacy no longer passes on all-unknown fits; exact-UI proof policy now raises the proof-layer condition; script derived from locale; stale selection after a Story change is ignored and warned; blocked states without a capability record now block; Director told how to record a user-named/excluded medium in `decisions.medium_direction`.

## Decision safety (C4)

Frozen files clean. Fixed now: Look revision invalidation (selected id from `decisions.json`, no mtimes); case-insensitive Story id and `pitches.json` option ids; `inheritedOk` requires a real consumed choose/approve/submit/decide/decide-rest on the right step.

## Remaining blockers and risks

1. **Installed engine drift (blocker).** Studio bundles a frozen copy (`scripts/build-app.sh` copies `skills/rasanai` into `Contents/Resources/Engine/rasanai`; `DirectorRuntime.swift` prefers it). The installed `/Applications/RasanAI Studio.app` is 0.24.2 / engine 1.28.0 and contains none of this code. A Studio trial runs legacy code until this branch is merged with master, version-bumped and released through `scripts/release.mjs`. `~/.claude/skills/rasanai` symlinks to this checkout, so a Claude Code session does load the branch. Six skill files changed on both sides and will conflict: `SKILL.md`, `references/console.md`, `references/workflows/shared-contract.md`, `scripts/crew.mjs`, `scripts/frame-gate.mjs`, `scripts/motion-gate.mjs`. Master also adds `director.mjs` and `lib/director-launch.mjs`. The merge was not attempted.
2. **Strict gates fail closed.** If the Look pick value is not the system label or `look.system`, or `pitches.json` ids differ from `chosen.json` beyond case/prefix, a gate reads stale and stays closed with a readable message. Watch for this in the first trial.
3. **Final gate is advisory**, and review envelopes written by agents do not prove an image was understood.
4. **Scene-lane test cases (MS-25..44)** need a loader for the CommonJS `createXScene` runtimes; `reviewCopying` has no export.
5. **Unenforced rules:** cadence, word-choreo, type-scale-quota, stepped-motion, ground-motion, `living-ground`, `finish-layer`, `late-peak`, `strict_brand_film`/`film_style_strict` (nothing writes them), profile fields `hard_exclusions` / `text_constraints` (now only pixel) / `blocks`.
6. **No assets/dependencies confirmed:** no bundled font, no GSAP guarantee in the crew host page, no example previews, no reference media (all references text-only), licences not audited per asset.
7. **Native Look card with a single-look confirm** (`awaiting`, no `styles[]`) is unverified; Swift is frozen.
8. **Process deviations:** M01 ran a one-off data-conversion script and W02 ran a read-only import of its module, both against the no-run rule. Outputs from those two lanes are less trusted.
9. **Unmeasured costs:** all token figures below come from the repo's own estimates, not measurements.

## FUTURE TEST REQUEST (proposal only, do not execute)

Ask the owner for approval in two tiers, separately.

**Tier 1, pure/static (no model, no render, no browser).** Latches are skip-guards, not approval.
- `CREATIVE_RECOVERY_APPROVED=pure node --test skills/rasanai/scripts/tests/creative-recovery/pure.test.mjs` (28 cases)
- `STYLE_PART2_APPROVED=pure node --test skills/rasanai/scripts/tests/style-intelligence-part2/pure.test.mjs` (about 32 cases)
- `STYLE_PART2_APPROVED=static node --test skills/rasanai/scripts/tests/style-intelligence-part2/governance.static.test.mjs`
- Exclude: scene lane (MS-25..44), all side-effect/journey files, `selftest.mjs`, `eval.mjs`. Expect failures from guessed result shapes; these are findings, not regressions.

**Tier 2, one-attempt trial.** One 10-15 s, two-scene, one-Look English-learning film from the original problematic brief, no supplied inspiration, interactive Brief/Story/Look/Storyboard answers by the owner, local code rendering at modest preview size, no image/video providers, no retries, no fix rounds. Proposed flow: `crew.mjs plan --direct --budget lean --length 12 --scenes 2`, `console.mjs serve`, per-role `brief`/`check`, `video.mjs inject --run <RUN>`, local `hyperframes render`, `crew.mjs creative gate --stage final`. Estimated subagent spend roughly 0.7M-1.4M tokens (the repo's own unmeasured estimate), zero third-party provider cost. Stop after the first attempt, at 1.5x the approved estimate, on any approval-gate refusal, provider request, render failure, detected stale engine, or frozen-file edit need.
- **Precondition:** Blocker 1 must be resolved (merge/release or run from source), and the owner must pick which. Rebuilding or reinstalling Studio quits the app and kills a running director.

## NEXT_ACTION

Decide how to resolve Blocker 1 (merge master and release, or trial from source), then request approval for Tier 1 only. Do not request Tier 2 until Tier 1 results are in.
