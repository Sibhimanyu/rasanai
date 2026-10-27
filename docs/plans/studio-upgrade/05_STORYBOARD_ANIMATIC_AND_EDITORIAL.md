# Plan 05 - Storyboard, timed animatic and editorial intelligence

**Repository:** `Sibhimanyu/rasanai`  
**Executor:** Sonnet implementation lead and scoped Sonnet workers  
**Sequence:** 05 of 14 implementation stages; coordinator is Plan 00  
**Prerequisite:** Plan 04 integrated as implementation, not yet pipeline-tested.  
**Research snapshot:** 2026-10-25; public HEAD inspected at `20ea14748daaee007cb4eaf5ba8aee91c09b1c4a`. Local HEAD wins.

## Execution and verification policy

Implement this plan inside the actual RasanAI checkout. Read `00_EXECUTE_IN_ORDER.md` and the predecessor handoff first, then only the repository files relevant to your assignment. Preserve existing working features and uncommitted changes. All proposed filenames/APIs below must be reconciled with the local checkout; extend an equivalent existing implementation instead of creating a duplicate.

**Testing requires the user's explicit approval, including in Plan 14.** Implement Plans 01-13, integrate the changes, and author fixtures/tests without executing them. Then stop at `awaiting_test_approval`, report the implemented candidate, and present the proposed testing scope, commands and resource/usage implications. Do not enter Plan 14 automatically. Only a subsequent explicit user instruction approving testing authorizes its agreed scope; this plan, silence, a general instruction to continue implementation, or approval of a film's Story/Look does not.

Until that approval, no unit/integration suites, agent film trials, browser/render smokes, GUI QA, live provider probes, end-to-end runs or benchmarks may run, whether directly, through workers, hooks or CI. Read-only inspection, syntax/schema parsing, type checks and compilation remain permitted only when they execute no tests, workflows or runtime probes. Hold any operation that would trigger tests; do not disable safeguards to bypass them. Record implementation as `implemented_unvalidated`. Preserve normal product runtime safeguards and creative approvals. See [Testing approval gate](TESTING_APPROVAL_GATE.md).

The implementation lead owns shared entrypoints and schema changes. Use parallel Sonnet workers for genuinely independent file-owned tasks; do not manufacture concurrency or let workers edit the same shared files. No remote push, public release, paid dependency purchase, new paid generation, destructive migration or permission escalation is authorized by this document alone.

## Repository entrypoints to locate

Start with these current or previously documented locations; verify their local equivalents before editing. Read only the symbols relevant to your assigned lane. Shared entrypoints remain lead-owned.

- `skills/rasanai/scripts/frames.mjs`
- `skills/rasanai/scripts/crew.mjs`
- `skills/rasanai/references/score.md`
- `skills/rasanai/references/styleframes.md`
- `skills/rasanai/agents/motion-director.md`

## Outcome

Translate the approved story and selected look into an understandable sequence of shots, then timed playback. Editorial choices must serve meaning and readability before decorative transitions. A storyboard is not a row of unrelated beautiful keyframes, and an animatic is not necessarily a finished animated film.

## E1. Enforce the stage boundary

Require approved or explicitly inherited Story and Look digests before full storyboard work is scheduled. Reject outdated inputs. Keep a small exploratory sketch distinguishable from a full storyboard. Map current `frames`, `styleframes`, `animatic` and `preview` records compatibly to the user-visible Storyboard stage.

The user gets one Storyboard review containing panels and timed playback. Do not add another sixth approval for animatic or force them to approve each shot individually. A "Just make it" run can auto-decide this stage under its existing policy while recording the decision and retaining Final.

## E2. Build shot and panel records

Reuse `frames/shots.json` or its local equivalent. Each shot binds to a story beat, selected look revision and evidence. Store:

```json
{
  "shot_id":"shot-writing-01",
  "beat_id":"beat-writing",
  "purpose":"show rough notes becoming a useful invitation",
  "panels":[
    {"id":"p1","state":"source notes visible","image_ref":"frames/p1.png"},
    {"id":"p2","state":"request and result relationship established","image_ref":"frames/p2.png"},
    {"id":"p3","state":"result readable","image_ref":"frames/p3.png"}
  ],
  "copy_refs":["approved-copy-id"],
  "focal_read":"the useful invitation",
  "timing":{"status":"provisional","duration_s":6},
  "transition_out":{"relation":"another example","kind":"cut","carrier":null},
  "sound_intent":{"role":"supportive","cue_refs":[]}
}
```

Use one panel when it explains a static beat; use multiple panels when an action or relationship needs them. Do not require three panels mechanically. Preserve editable elements and reused assets in the code representation, not just PNGs.

## E3. Separate semantic order from final timing authority

Story beats define meaning/order constraints. The board defines composition/action and provisional timing. Once narration/music and durations are reconciled, write the approved result through the existing score writer. After that, `motion/score.json` is the canonical scene timing; board playback derives timings from its revision. Never allow score and storyboard files to drift as independent editable timelines.

Use the existing seconds-based authoring convention with explicit rational frame-rate metadata where needed. Derive frame indices consistently; do not repeatedly round accumulated durations. Store start/end conventions and distinguish scene-local from film time. Regenerate `motion/events.json` from authored inputs rather than editing it.

## E4. Implement editorial decisions

For each beat and seam evaluate:

- What new understanding, proof or experience does this add?
- What is the single most important thing to notice now?
- Is there enough time to read/understand it at the intended display size and locale?
- Does the cut express continuation, contrast, example, cause, scale change or intentional separation?
- Does a transition falsely imply that separate contexts are one continuous process?
- Is a hard cut clearer than a morph/camera move?
- Does the ending resolve the actual promise rather than add an unrelated slogan?

Remove or combine redundant beats only through a versioned proposal. Changes that alter approved meaning return to the relevant story decision; mere shot subdivision need not reopen Story. Never change copy merely to accommodate a visually attractive transition without recording it.

Allow pauses, restraint and long explanatory holds. Do not enforce one idea every fixed number of seconds, a peak at a universal percentage, identical shot lengths, an effect at every seam or constant camera movement. Those can be style-specific options with evidence, not hard gates.

## E5. Reconcile voice, music and boards efficiently

The future production workflow may prepare permitted narration and music after Story selection and refine them alongside Look/boards. Use the real selected audio when available; label scratch audio and provisional timings explicitly. A music-led film's source track is authoritative unless the user authorizes an edit. A product demo's proof/readability must not be crushed to match an arbitrary beat grid.

Choose a timing reconciliation point before the user's Storyboard approval. Later audio replacement computes its impact rather than silently retiming every scene. Reuse Plan 07's audio contract when integrated; do not make a second audio timeline here.

## E6. Create animatic playback from the same plan

Implement a cheap deterministic animatic using board panels, essential spatial changes, selected/scratch audio and transition annotations. Label fidelity honestly. A screen of still panels should not pretend to be the finished film. Make notes anchor to shot, panel, time and current revision.

A user note "this is hard to understand" should become an editorial revision request, not automatically a request for more animation. Preserve selected story, look and unaffected panels.

## Parallel lanes

Workers: board schema/adapters; shot planning prompt; deterministic animatic assembler; editorial review logic; timing/event bridge; native panel/playback payloads; deferred fixtures. One editor owns film-wide shot order and seam meanings. One lead owns score/console writes.

## Implementation handoff

Deliver full storyboard scheduling after Look, panel and shot representations, score reconciliation, real timed-playback code paths, anchored annotations and editorial revision handling. Register E01-E08 as deferred. Do not render an animatic during implementation.

## Deferred verification

Test one-to-many beat/panel mapping, insufficient reading time, diagram mechanism clarity, legitimate hard cuts, continuous-camera handoffs, narration retiming, silent preview, changed storyboard revision, old `animatic` action mapping and restart at Storyboard. Review a real timed sequence in 14; JSON correctness does not establish comprehensibility.

## Research basis

S01/S05 distinguish production stages; S09 supports purposeful transitions including simple cuts; S02/S04 support product-native clarity. Runtime synchronization follows R05, not a new independent clock.

## E7. Approve a storyboard snapshot, not a moving target

A Storyboard approval pins panel content, approved copy, look, chosen audio or explicitly declared scratch status, and the reconciled timing revision. Full storyboard work stays after Look. A scratch-voice animatic can communicate an idea, but final voice timing is not automatically approved by approving that scratch version. If actual audio changes essential reading windows, shot order or meaning, propose the affected timing revision in the same Storyboard surface before final build.

Distinguish meaningful change from harmless regeneration. A lost thumbnail regenerated from identical source should not reopen a creative decision. A new shot that changes a product demonstration should. Document these classifications centrally rather than using a blanket rule that either invalidates everything or preserves all approvals.

Use intervals with explicit start-inclusive/end-exclusive semantics for material ranges, and preserve source time, shot-local time and film time separately. Retimes use a recorded mapping, including reverse/freeze behavior if supported. This mapping feeds notes, captions, tracks and export; do not independently infer it in each system.

Story, board and score are not three editable copies of the same schedule. A proposed timing delta is committed through the canonical score/cut writer; projections name the accepted revision. If an upstream choice changes while panels render, keep the old preview labeled and reject the obsolete panel set as current output.

## Revision 2 handoff requirement

Update the relevant row in [INTEGRATION_CLOSURE_MATRIX.md](INTEGRATION_CLOSURE_MATRIX.md) with actual source wiring and pending case IDs. Read only the applicable [rule migrations](RULE_MIGRATION_MAP.md) and [reference decisions](REFERENCE_REUSE_MATRIX.md). These documents do not authorize testing.

## Package navigation

[Coordinator and global policy](00_EXECUTE_IN_ORDER.md) | [Source ledger](RESEARCH_SOURCES.md) | [Deferred cases](DEFERRED_TEST_MATRIX.md).

Next: [Visual production, hybrid footage and recurring characters](06_VISUAL_PRODUCTION_AND_HYBRID_MEDIA.md). Continue after integration; do not run pipeline tests between stages.
