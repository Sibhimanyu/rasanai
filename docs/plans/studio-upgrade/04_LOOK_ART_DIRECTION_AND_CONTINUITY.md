# Plan 04 - Look development and film-wide creative direction

**Repository:** `Sibhimanyu/rasanai`  
**Executor:** Sonnet implementation lead and scoped Sonnet workers  
**Sequence:** 04 of 14 implementation stages; coordinator is Plan 00  
**Prerequisite:** Plan 03 integrated as implementation, not yet pipeline-tested.  
**Research snapshot:** 2026-10-25; public HEAD inspected at `20ea14748daaee007cb4eaf5ba8aee91c09b1c4a`. Local HEAD wins.

## Execution and verification policy

Implement this plan inside the actual RasanAI checkout. Read `00_EXECUTE_IN_ORDER.md` and the predecessor handoff first, then only the repository files relevant to your assignment. Preserve existing working features and uncommitted changes. All proposed filenames/APIs below must be reconciled with the local checkout; extend an equivalent existing implementation instead of creating a duplicate.

**Testing requires the user's explicit approval, including in Plan 14.** Implement Plans 01-13, integrate the changes, and author fixtures/tests without executing them. Then stop at `awaiting_test_approval`, report the implemented candidate, and present the proposed testing scope, commands and resource/usage implications. Do not enter Plan 14 automatically. Only a subsequent explicit user instruction approving testing authorizes its agreed scope; this plan, silence, a general instruction to continue implementation, or approval of a film's Story/Look does not.

Until that approval, no unit/integration suites, agent film trials, browser/render smokes, GUI QA, live provider probes, end-to-end runs or benchmarks may run, whether directly, through workers, hooks or CI. Read-only inspection, syntax/schema parsing, type checks and compilation remain permitted only when they execute no tests, workflows or runtime probes. Hold any operation that would trigger tests; do not disable safeguards to bypass them. Record implementation as `implemented_unvalidated`. Preserve normal product runtime safeguards and creative approvals. See [Testing approval gate](TESTING_APPROVAL_GATE.md).

The implementation lead owns shared entrypoints and schema changes. Use parallel Sonnet workers for genuinely independent file-owned tasks; do not manufacture concurrency or let workers edit the same shared files. No remote push, public release, paid dependency purchase, new paid generation, destructive migration or permission escalation is authorized by this document alone.

## Repository entrypoints to locate

Start with these current or previously documented locations; verify their local equivalents before editing. Read only the symbols relevant to your assigned lane. Shared entrypoints remain lead-owned.

- `skills/rasanai/scripts/design.mjs`
- `skills/rasanai/references/design-desk.md`
- `skills/rasanai/agents/design-system-designer.md`
- `skills/rasanai/agents/art-director.md`

## Outcome

Make a film look intentionally art-directed across all shots rather than like unrelated good-looking scenes. Choose a visual language for the approved story before producing the full storyboard. Preserve RasanAI's identity in Studio; the films themselves follow their selected brand/look, not the app's UI theme.

## L1. Use a representative comparison beat

Select one approved story beat that exercises the likely typography, product imagery and hierarchy. Develop the alternative looks using that same content. Default to one representative styleframe per look; allow an explicitly justified second frame when it reveals a real uncertainty, such as combining interface proof with a dimensional object. Do not automatically make opening/peak/end frames for every rejected look.

Keep three options where the user expects three, but avoid forcing a "Wild" option outside brand constraints. A supplied brand can yield distinct composition, material or motion treatments without changing the logo, factual UI or approved colors. Preserve saved-series defaults with explicit provenance. No full storyboard or production scene should be dispatched before the selected Look is committed.

The future product must render styleframe candidates during normal film use; the implementation agent must not run that pipeline while developing this plan. Author the path and its fixtures now; execution waits for 14.

## L2. Compile one compact visual bible

Extend `DESIGN.md` and the existing motion contract, rather than adding another unrelated design system. Produce a machine-readable projection with source digest for workers:

- Role-based palette, contrast intentions and permitted accents.
- Exact font asset identities, weight/size roles, line breaking and locale fallback.
- Layout grid, safe regions, relative hierarchy, spacing and treatment of screenshots/UI.
- Material/light/camera conventions where relevant, including when depth is unnecessary.
- Motion vocabulary, relative timing, motion emphasis and allowed exceptions.
- Transition vocabulary linked to semantic relationships, not a mandatory effect inventory.
- Image/illustration treatment, texture and finishing limits.
- Continuity anchors: recurring object identities, screens, framing, character canon and sound motif references.

Separate hard brand constraints from creative defaults. A deliberate exception needs a local rationale and approval when it changes a brand constraint; it should not force a global new rule for every future film.

## L3. Plan variation within consistency

Define what stays constant across the film and what can vary. Examples: typography and interface geometry remain stable while shot scale changes; one accent identifies a focal action while background density changes by beat. Do not equate visual consistency with identical layouts or one ease on every movement.

Track a few meaningful film-wide commitments, not dozens of automatic cinematic effects. Avoid adding grain, blur, vignette, chromatic aberration, continuous camera drift or 3D solely because the renderer supports them. Do not globally ban them either. Connect each major treatment to the intended communication.

## L4. Reference-to-principle translation

Reuse the current design library, reference recipes and provenance ledger. For each selected reference record the principle, its evidence, how it transfers to this brand and what must not be copied. Prefer a small relevant set over a large mood board read by every worker.

The web case studies support distinct design strategies (S02-S08); they do not supply reusable source art. Do not bundle videos, commercial fonts, source logos or paid skill content without applicable rights. Keep inspiration links and original analysis apart from distributable assets.

## L5. Make continuity a shared implementation contract

At storyboard/build time, a single owner supplies the shared product interface, character canon, camera conventions and reusable motifs. Scene workers receive the projected relevant subset. They may request a change but cannot independently redefine the shared component.

Continuity has types: same object, visual analogy, causal handoff, temporal continuation or deliberate discontinuity. A hard cut between separate contexts is valid. A smoothly traveling object must not imply false product synchronization or causality.

## L6. Native Look screen integration

Show comparable frame cards with a short description of the consequential differences. Keep technical detail collapsed. Preserve the film preview, choice controls and action bar while detailed text scrolls internally. Do not convert the Look screen into a giant gallery of downloaded references or introduce a full-width web app inside SwiftUI.

Approve a precise look revision. A new request such as "same typography, less glossy" creates a bounded look revision, preserves Story, and invalidates only dependent frames/build outputs. Show which parts remain fixed.

## Parallel lanes

Workers: look projection/schema; candidate generation/templates; existing design/motion contract integration; reference provenance; native card payloads; and dormant visual contract fixtures. Lead integrates shared actions and crew routing. Each worker has disjoint owned files.

## Implementation handoff

Deliver a working look-selection code path, projected visual bible, continuity metadata, candidate budget policy and updated art/scene worker packets. Prepare cases for supplied brand, no brand, saved series, missing font and a mixed 2D/3D treatment. Mark L01-L06 unvalidated.

## Deferred verification

In 14 verify that each look depicts the same story content, the chosen brand survives, rejected looks trigger no production build, missing assets are explicit, localized text fits, a look revision preserves the story, and combined scene outputs read as one film. Human creative review assesses coherence; palette and font checks alone cannot prove taste.

## Research basis

S01/S02/S04/S06/S08 and R07. The proposed cheaper comparison strategy is RasanAI's design choice, not a measured token-saving claim.

## L7. Keep reference techniques subordinate to the chosen visual language

Every imported recipe carries applicability and exclusions. Cartoon-specific restrictions, maximal kinetic typography, random technique selection and always-moving holds are not universal quality laws. Apply only the relevant approved recipe; permit intentional stillness, simple cuts and restrained typography. The source reuse decisions are in [REFERENCE_REUSE_MATRIX.md](REFERENCE_REUSE_MATRIX.md).

Normalize recipe units before reuse. Frame counts in a 60 fps example become a duration or an explicitly frame-locked choice at the film's actual rate; pixel distances and velocity examples identify their reference dimensions. Do not paste them unchanged into a 24 fps vertical output. Retain the recipe's supported runtime and version, rather than importing a second live clock.

Show why look options differ in consequential terms: hierarchy, density, material, framing and motion character. A color swap alone is not three art directions. Keep the approved story beat and evidence identical in the comparison. If a requested treatment is impossible with the available assets, identify that limitation before committing the look rather than inventing proof later.

## Revision 2 handoff requirement

Update the relevant row in [INTEGRATION_CLOSURE_MATRIX.md](INTEGRATION_CLOSURE_MATRIX.md) with actual source wiring and pending case IDs. Read only the applicable [rule migrations](RULE_MIGRATION_MAP.md) and [reference decisions](REFERENCE_REUSE_MATRIX.md). These documents do not authorize testing.

## Package navigation

[Coordinator and global policy](00_EXECUTE_IN_ORDER.md) | [Source ledger](RESEARCH_SOURCES.md) | [Deferred cases](DEFERRED_TEST_MATRIX.md).

Next: [Storyboard, timed animatic and editorial intelligence](05_STORYBOARD_ANIMATIC_AND_EDITORIAL.md). Continue after integration; do not run pipeline tests between stages.
