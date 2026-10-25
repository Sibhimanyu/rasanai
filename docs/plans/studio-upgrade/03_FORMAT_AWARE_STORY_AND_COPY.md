# Plan 03 - Format-aware story generation and audience-facing copy

**Repository:** `Sibhimanyu/rasanai`  
**Executor:** Sonnet implementation lead and scoped Sonnet workers  
**Sequence:** 03 of 14 implementation stages; coordinator is Plan 00  
**Prerequisite:** Plan 02 integrated as implementation, not yet pipeline-tested.  
**Research snapshot:** 2026-10-25; public HEAD inspected at `20ea14748daaee007cb4eaf5ba8aee91c09b1c4a`. Local HEAD wins.

## Execution and verification policy

Implement this plan inside the actual RasanAI checkout. Read `00_EXECUTE_IN_ORDER.md` and the predecessor handoff first, then only the repository files relevant to your assignment. Preserve existing working features and uncommitted changes. All proposed filenames/APIs below must be reconciled with the local checkout; extend an equivalent existing implementation instead of creating a duplicate.

**Testing requires the user's explicit approval, including in Plan 14.** Implement Plans 01-13, integrate the changes, and author fixtures/tests without executing them. Then stop at `awaiting_test_approval`, report the implemented candidate, and present the proposed testing scope, commands and resource/usage implications. Do not enter Plan 14 automatically. Only a subsequent explicit user instruction approving testing authorizes its agreed scope; this plan, silence, a general instruction to continue implementation, or approval of a film's Story/Look does not.

Until that approval, no unit/integration suites, agent film trials, browser/render smokes, GUI QA, live provider probes, end-to-end runs or benchmarks may run, whether directly, through workers, hooks or CI. Read-only inspection, syntax/schema parsing, type checks and compilation remain permitted only when they execute no tests, workflows or runtime probes. Hold any operation that would trigger tests; do not disable safeguards to bypass them. Record implementation as `implemented_unvalidated`. Preserve normal product runtime safeguards and creative approvals. See [Testing approval gate](TESTING_APPROVAL_GATE.md).

The implementation lead owns shared entrypoints and schema changes. Use parallel Sonnet workers for genuinely independent file-owned tasks; do not manufacture concurrency or let workers edit the same shared files. No remote push, public release, paid dependency purchase, new paid generation, destructive migration or permission escalation is authorized by this document alone.

## Repository entrypoints to locate

Start with these current or previously documented locations; verify their local equivalents before editing. Read only the symbols relevant to your assigned lane. Shared entrypoints remain lead-owned.

- `skills/rasanai/agents/script-writer.md`
- `skills/rasanai/agents/script-editor.md`
- `skills/rasanai/agents/story-planner.md`
- `skills/rasanai/scripts/story.mjs`
- `skills/rasanai/references/story.md`

## Outcome

Produce a story treatment that says what the film communicates, how the idea develops and what the audience sees as evidence. Do not generate vague emotional nouns as a substitute for a proposition. Do not confuse a story treatment with final shot staging.

The inspected writer requires a villain, reversal, fixed peak window and "ban the obvious" pass (R03). Change the associated planners, schemas, validators, model addenda and critic instructions together; changing one prompt while an old validator still demands a twist will not solve the problem.

## S1. Introduce conditional story grammars

Implement original house guidance for these communication types. Structures below are candidate patterns, not compulsory formulas:

| Kind | Starting narrative logic | Required evidence or development |
|---|---|---|
| Whole-product introduction | Proposition -> selected demonstrations -> cumulative usefulness -> invitation | Representative capabilities support the promise |
| Single-feature announcement | Relevant task -> feature behavior -> visible improvement -> availability/next step | What actually changed; no invented problem |
| Workflow demo | Desired outcome -> relevant steps -> product responses -> completed result | Reproducible actions and actual state changes |
| Technical/educational explainer | Question -> needed context -> mechanism -> consequence -> takeaway | Correct mental model and causal relationships |
| Brand manifesto | Observation -> developing idea/metaphor -> implications -> position | Distinctive, coherent belief; not necessarily UI |
| Identity reveal | Element -> system behavior -> applications -> identity resolution | The identity system, not fake product features |
| Performance ad | Immediate relevance -> one benefit/proof -> action | Specific benefit, reason to believe and fitting CTA |
| Teaser | Controlled clues -> anticipation -> partial reveal -> destination/date | Intentional uncertainty, verified promised event |
| Event opener | Motif/theme -> development -> collective energy -> event resolution | Audience and event-specific meaning |
| Evidence case study | Baseline/question -> intervention -> result -> qualified interpretation | Source-linked numbers and faithful charts |
| Character short | Desire/obstacle/action/consequence where appropriate | Performance and understandable changes of state |
| Music/lyric film | Musical/lyrical progression -> coherent visual treatment | The actual audio/lyrics; do not rewrite the song |
| Footage-led story | Available material -> selects -> meaningful edit -> resolution | What was actually recorded; no invented coverage |

A villain, twist, hero peak, universal product reveal deadline or same-percentage climax is not required across this registry. Keep them as optional tools. Allow "Meet X" and "Introducing" when they serve the assignment. Allow purposeful abstraction and metaphor without hiding a product demonstration behind it. Do not penalize true shared benefits merely because a competitor can also claim them.

## S2. Separate semantic fields

Use stable IDs and distinct fields for `treatment_title`, `internal_beat_label`, `viewer_takeaway`, `on_screen`, `voiceover`, `visual_event`, `evidence_refs`, `relation_to_previous` and provisional duration/reading demand.

`treatment_title` must help a person choose a film. `internal_beat_label` never silently leaks into rendered text. `on_screen` can be empty: not every beat needs a headline. Captions may intentionally repeat speech, so replace the universal "voice never repeats the image/text" rule with a channel-role decision.

A good visual event states a starting state, a meaningful action/change and an end state. "A premium gradient animates behind Desire" is not a useful demonstration. "Rough notes become a usable invitation" is meaningful without prematurely fixing camera or type choreography.

## S3. Make treatment generation efficient without flattening choice

Default balanced workflow: one strong scoped writer proposes three compact treatments with materially different communication approaches; one independent editor examines the set. Retain supported alternative multi-writer/deep modes. Escalate to an independent extra writer only when diversity, clarity or evidence is insufficient.

Do not generate three fully choreographed films, three rendered hero moves or dozens of mandatory discarded concepts before Story selection. One selected treatment receives detailed development later. Rough feasibility notes are allowed; full boards are not.

Preserve three user choices unless an existing explicit "you decide", series or budget choice authorizes fewer. Do not silently convert a choice into auto-approval to save tokens. Label treatment cards by their actual premise; Sure/Bold/Wild may be secondary tags, not instructions to abandon the brief.

## S4. Replace punitive creative gates with format-aware review

Separate mechanical/factual errors from creative concerns:

- Errors: unsupported claims, missing must-show coverage without approval, impossible ordering, malformed IDs, inaccessible source, deceptive UI, contradictory duration/data, missing required qualifications.
- Creative concerns: unclear proposition, weak beat contribution, poor breadth/depth match, generic copy, repetitive options, visual idea unrelated to the product or brand, unearned abstraction.
- Optional craft choices: reversal, motif, metaphor, crescendo, early logo, hard cut, silence. Assess their purpose; do not require or ban them globally.

Produce a short structured review with issue ID, affected beat, evidence, severity and targeted fix. The editor can accept a simple clear film. Avoid endless "rewrite bolder" loops. Use one focused revision by default and escalate genuine unresolved communication issues without hiding them.

Trace old rules across `references/intent.md`, `product-first.md`, `launch-film.md`, story checking helpers, the story planner, move inventor/juror, model-specific addenda and shared workflow rules. Replace conflicting universal constraints in code and docs, retaining a legacy reader for saved films. Do not weaken provenance or factual checks.

## S5. Implement format-matched reference retrieval

Retrieve a few relevant house examples by communication kind and beat role. Keep a license/provenance record and original summaries; do not copy studio scripts. Use S02 for product-focused clarity, S03 for metaphorical progression, S06 for identity development, S07/S08 for placement-specific scope. None defines a universal launch template.

## S6. Worked ChatGPT treatment fixture

Use an illustrative, frozen evidence set with no claim of a new release. Three candidate directions could include a capability sequence, one coherent project from rough material to a result, and follow-up refinement as the central idea. The generator should choose actual demonstrations from available proof, not hardcode all three.

Example beat object:

```json
{
  "id":"beat-writing",
  "internal_beat_label":"Writing demonstration",
  "viewer_takeaway":"I can start with rough notes rather than polished copy.",
  "on_screen":"Turn these notes into an invitation.",
  "voiceover":null,
  "visual_event":{"before":"three rough event notes","change":"request produces an invitation draft","after":"short useful invitation"},
  "evidence_refs":["writing-example-capture"],
  "duration_provisional_s":6,
  "camera_plan":null
}
```

This is an original example and not a real product recording. A live user film must use verified available capabilities and actual captured/generated outputs. The final evaluation must not require these exact words.

Include a negative fixture whose sequence is only "Desire / Possibility / Transformation" without supported meaning, plus a positive manifesto fixture where an abstract term is justified. This prevents a brittle banned-word fix.

## Parallel lanes

Use workers for grammar registry; treatment schema/readers; generation prompt and candidate diversity; editor/lint rules; legacy validator migration; and dormant fixture authoring. The lead owns changes to central `crew.mjs` dispatch and `story.mjs` CLI routing. Do not let prompt and validator workers independently redefine the schema.

## Implementation handoff

Deliver real generation routing, compatible formats, updated writer/editor/planner instructions, mechanical validation code, changed critic behavior, native treatment-card payloads and fixture inputs. Update the skill read map. Mark S01-S08 unvalidated. The next plan receives a selected treatment, not an unfinished creative brief.

## Deferred verification

In Plan 14 evaluate the same product as whole-product intro, feature announcement, tutorial, explainer and identity reveal. Check distinct appropriate structures; no mandatory twist; valid simple opening; preserved claims; no strategy labels leaking into copy; clear treatment titles; no full storyboard before Look; successful read of legacy stories. Use blinded human judgment for professional quality, not a model assigning itself a perfect score.

## S7. Add a semantic coverage ledger instead of more dramatic formulas

For every treatment, map each required takeaway to the beat that communicates it and the evidence or visual event that carries it. Record intentionally excluded material and why. A sequence of nouns cannot satisfy this mapping merely by placing a claim ID beside a vague title. Conversely, legitimate metaphor, a shared category benefit or a plain product introduction is not automatically generic.

Before spending on alternative treatments, classify the communication assignment and select applicable review criteria. Compare candidates by substantive differences: proof selection, information order, user perspective and visual premise. Do not force every candidate onto a different decorative device, synonym or intensity label. Keep the chosen story as meaning and proposed words; final composition remains downstream.

The old failure must be repaired in generation and acceptance. Use [RULE_MIGRATION_MAP.md](RULE_MIGRATION_MAP.md) to remove obsolete required `villain`, `turn`, peak-percentage and universal opening restrictions from all applicable consumers. Preserve legacy parsing without forcing new treatments to invent dummy fields to pass it. Never use filler such as `not-applicable villain` as the new format's hidden requirement.

Add counterexamples to the deferred fixtures: a clear feature demonstration without a twist; an intentional identity-film abstraction; a broad product film with several uses; and a valid simple opening. The same rules must also reject a vague product film whose labels never communicate the promised behavior. Judge meaning, not whether a banned string appears.

## Revision 2 handoff requirement

Update the relevant row in [INTEGRATION_CLOSURE_MATRIX.md](INTEGRATION_CLOSURE_MATRIX.md) with actual source wiring and pending case IDs. Read only the applicable [rule migrations](RULE_MIGRATION_MAP.md) and [reference decisions](REFERENCE_REUSE_MATRIX.md). These documents do not authorize testing.

## Package navigation

[Coordinator and global policy](00_EXECUTE_IN_ORDER.md) | [Source ledger](RESEARCH_SOURCES.md) | [Deferred cases](DEFERRED_TEST_MATRIX.md).

Next: [Look development and film-wide creative direction](04_LOOK_ART_DIRECTION_AND_CONTINUITY.md). Continue after integration; do not run pipeline tests between stages.
