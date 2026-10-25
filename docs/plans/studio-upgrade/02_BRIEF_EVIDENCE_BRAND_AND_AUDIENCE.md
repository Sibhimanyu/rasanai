# Plan 02 - Brief, facts, brand and audience routing

**Repository:** `Sibhimanyu/rasanai`  
**Executor:** Sonnet implementation lead and scoped Sonnet workers  
**Sequence:** 02 of 14 implementation stages; coordinator is Plan 00  
**Prerequisite:** Plan 01 integrated as implementation, not yet pipeline-tested.  
**Research snapshot:** 2026-10-25; public HEAD inspected at `20ea14748daaee007cb4eaf5ba8aee91c09b1c4a`. Local HEAD wins.

## Execution and verification policy

Implement this plan inside the actual RasanAI checkout. Read `00_EXECUTE_IN_ORDER.md` and the predecessor handoff first, then only the repository files relevant to your assignment. Preserve existing working features and uncommitted changes. All proposed filenames/APIs below must be reconciled with the local checkout; extend an equivalent existing implementation instead of creating a duplicate.

**Testing requires the user's explicit approval, including in Plan 14.** Implement Plans 01-13, integrate the changes, and author fixtures/tests without executing them. Then stop at `awaiting_test_approval`, report the implemented candidate, and present the proposed testing scope, commands and resource/usage implications. Do not enter Plan 14 automatically. Only a subsequent explicit user instruction approving testing authorizes its agreed scope; this plan, silence, a general instruction to continue implementation, or approval of a film's Story/Look does not.

Until that approval, no unit/integration suites, agent film trials, browser/render smokes, GUI QA, live provider probes, end-to-end runs or benchmarks may run, whether directly, through workers, hooks or CI. Read-only inspection, syntax/schema parsing, type checks and compilation remain permitted only when they execute no tests, workflows or runtime probes. Hold any operation that would trigger tests; do not disable safeguards to bypass them. Record implementation as `implemented_unvalidated`. Preserve normal product runtime safeguards and creative approvals. See [Testing approval gate](TESTING_APPROVAL_GATE.md).

The implementation lead owns shared entrypoints and schema changes. Use parallel Sonnet workers for genuinely independent file-owned tasks; do not manufacture concurrency or let workers edit the same shared files. No remote push, public release, paid dependency purchase, new paid generation, destructive migration or permission escalation is authorized by this document alone.

## Repository entrypoints to locate

Start with these current or previously documented locations; verify their local equivalents before editing. Read only the symbols relevant to your assigned lane. Shared entrypoints remain lead-owned.

- `skills/rasanai/scripts/formats.mjs`
- `skills/rasanai/scripts/research.mjs`
- `skills/rasanai/scripts/brand.mjs`
- `skills/rasanai/agents/research-lead.md`

## Outcome

Turn an underspecified request into a useful communication assignment without inventing facts or asking the user dozens of questions. Distinguish "a launch video for ChatGPT" from "an announcement of a newly released ChatGPT feature." For the former, use a general product-introduction assumption unless evidence or the user's words identify an actual new release; show that assumption in the Brief.

## Implementation tasks

### B1. Separate communication kind from rendering route

Keep existing routes such as `product-launch-video`, `faceless-explainer` and `reel`. Add an orthogonal `communication_kind`: whole-product introduction, single-feature announcement, workflow demo, instructional explainer, brand manifesto, identity reveal, performance ad, teaser, event opener, evidence case study, character short, music/lyric film or footage-led story.

Each kind records audience knowledge, purpose, promised outcome, proof requirement, expected next action and appropriate channel roles. Unknown intent gets a visible assumption, not a fabricated launch date. A saved preference is a default with provenance, not a new instruction that overrides the user.

### B2. Build one consolidated briefing package

Reuse current researchers and claims ledger. Capture source URL/file, retrieved timestamp, exact supported assertion, qualification, product/plan/version availability when relevant, permitted use and owner confirmation. Distinguish public evidence, user-provided facts, synthetic examples and unverified interpretations.

Parallelize nonduplicated product verification, screen inventory and supplied brand-kit parsing. One research lead resolves disagreements and produces a small packet. Prefer the supplied brand kit over general internet styling; flag inconsistencies without silently replacing it. Do not send every raw web page to every downstream agent.

Use existing cached research when its source identity, scope and freshness satisfy the new brief. Recheck volatile availability, pricing and newly announced features. Do not use a blanket cache TTL for all facts. Missing evidence remains `unknown`; no invented metrics or fake UI interactions.

### B3. Make the promise and proof match

Add `promise_scope` and `must_show`. A product-wide introduction may need representative breadth; a single-feature film needs focused evidence. Do not globally force every launch to one use case or every launch to a feature montage.

Represent each demonstration with a claim ID, permitted visual source and expected observable change. Editorial highlighting of a real interface is allowed when clearly not presented as an actual product behavior. A generated background must not count as proof of a factual capability.

### B4. Add destination and accessibility constraints early

Record placement, aspect, duration envelope, sound-on/sound-off assumptions, intended device, locale, caption policy, required qualifications and call to action. Distinguish website hero, paid feed ad, organic social, conference screen, tutorial and sales presentation. These are communication profiles, not simply export dimensions.

Do not hardcode rapidly changing platform limits without a dated source. Unknown platform rules become configurable defaults that need final validation. Caption needs and description of essential visual information belong in the brief, not only the export screen (S10).

### B5. Define a reference-analysis packet

Reuse the existing reference-motion system. Store observations separately from interpretations and desired transfers. Examples: measured cut times vs inferred mood; observed typography vs a claim about psychological effectiveness. Store rights and non-transferable elements. No copying another creator's film, voice, trademark, distinctive art or commercial prompt pack.

Reference selection filters by communication kind, audience and beat purpose before visual similarity. An identity-film reference can inform typography but must not dictate the script of a product tutorial.

### B6. Native and browser Brief integration

Expose one concise assignment with editable fields and a "RasanAI assumed" disclosure. Reuse existing source/privacy controls. Clarify only materially consequential missing facts; do not reopen previously answered choices. Store corrections as explicit versioned actions and invalidate only downstream work that depends on them.

## Example contract

```json
{
  "communication_kind":"whole-product-introduction",
  "promise_scope":"representative-breadth",
  "audience_knowledge":"knows the name; uncertain about useful applications",
  "takeaway":"unfinished questions and material can become useful work",
  "assumptions":[{"field":"launch_scope","value":"general introduction, not a new release"}],
  "must_show":[{"id":"use-writing","claim_ref":"verified-claim-id"}],
  "destination":{"placement":"website","aspect":"16:9","sound":"supported-not-required"}
}
```

The example is illustrative. Do not turn it into the default story for every product.

## Parallel lanes

Assign kind/profile registry, evidence/freshness, brand-asset mapping and native Brief model changes to separate workers. The lead owns routing integration and the final consolidated briefing format. Tests are authored but not executed.

## Implementation handoff

Deliver the registry, evidence/rights readers, packet compiler, cached-research policy and Brief UI action mapping. Add fixtures for ambiguous launch requests, supplied kits, stale product claims, conflicting sources, footage-led inputs and multiple locales. Register B01-B06 for final verification.

## Deferred verification

Check that a generic ChatGPT brief does not invent a new release, broad vs narrow scope differs, real claims remain grounded, image/website content cannot inject instructions, supplied brand tokens persist and the same inputs generate a stable normalized briefing. Verify no unauthorized local-file reads or uploads.

## Research basis

S02/S04: product-native demonstrations; S07/S08: different communication tasks for the same brand; S10/S11: accessibility and destination planning; T10: official ChatGPT capability reference when constructing a real demonstration. These sources motivate the design, not an automatic recipe.

## B7. Make the proof contract inspectable from brief to delivery

For each must-show demonstration record source state, permitted action, observed result, qualifications, evidence references and what would misrepresent it. Link these to stable copy/beat/shot IDs. Workers can highlight and crop real results but cannot silently replace the essential interaction with a more attractive invented one. Distinguish a genuine capability, an illustrative example and an unverified proposition at the data level.

Mark quoted user text, factual numbers, product names and required qualifiers as protected content. Rewriting for brevity or localization proposes a replacement with its qualification preserved; layout code cannot silently delete it. Keep fact freshness separate from asset byte identity: an unchanged screenshot does not prove a feature remains available.

Use frozen synthetic evidence for fixtures and live, dated evidence for actual commercial claims. The ChatGPT example is a communication-quality target, not a bundled current-capability certification. Do not copy an example output from this package into a real launch film and present it as a captured result.

Emit one compact `evidence_refs` projection for downstream packets. Do not duplicate raw pages in Story, Look, each shot, the review and the export. The full evidence remains retrievable in the authorized project store.

## Revision 2 handoff requirement

Update the relevant row in [INTEGRATION_CLOSURE_MATRIX.md](INTEGRATION_CLOSURE_MATRIX.md) with actual source wiring and pending case IDs. Read only the applicable [rule migrations](RULE_MIGRATION_MAP.md) and [reference decisions](REFERENCE_REUSE_MATRIX.md). These documents do not authorize testing.

## Package navigation

[Coordinator and global policy](00_EXECUTE_IN_ORDER.md) | [Source ledger](RESEARCH_SOURCES.md) | [Deferred cases](DEFERRED_TEST_MATRIX.md).

Next: [Format-aware story generation and audience-facing copy](03_FORMAT_AWARE_STORY_AND_COPY.md). Continue after integration; do not run pipeline tests between stages.
