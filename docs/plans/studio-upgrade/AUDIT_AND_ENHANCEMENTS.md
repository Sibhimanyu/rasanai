# Audit and enhancements - revision 2

Prepared 2026-10-25. **Deliverable: revised plans only. No repository changes, pipeline runs or tests.**

## Review scope and limits

Reviewed the coordinator, all fourteen numbered plans, their supporting source/coverage/deferred-case material, and the earlier Motion Studio/Hybrid Film Studio scope. Re-read the public RasanAI HEAD and targeted crew, render-slot, source-register and editor transaction code through the GitHub connection. It returned the same public baseline, `20ea14748daaee007cb4eaf5ba8aee91c09b1c4a`. Local/unpushed changes were not accessible and may supersede findings.

All named reference groups were assessed for reuse relevance in [REFERENCE_REUSE_MATRIX.md](REFERENCE_REUSE_MATRIX.md). Selected key upstream files and current official Claude/GSAP documentation were re-read; this is not a full code/security/license audit of every upstream repository. Fresh versus inherited evidence is marked. No reference code was run, installed or copied into RasanAI.

## Most consequential changes

| Finding or opportunity | Revision made | Plans |
|---|---|---|
| The user requires approval, not merely waiting until the last stage | Explicit stop, candidate/scope request, human approval reference, no indirect tests through hooks/workers/CI | 00, all, 14 |
| Updating story prompts alone can leave old mandatory-drama validators | A concrete rule migration inventory across prompts, schemas, addenda, checks and Studio settings | 01/03/08 |
| Upstream recipes contain mutually incompatible style prescriptions | Reuse matrix separates transferable mechanics from style-specific constraints, media and setup instructions | 04/06/08 |
| Forward references and helper-only implementation can leave disconnected modules | Small shared interfaces plus caller-to-consumer implementation receipts; actual source wiring required | 01/all |
| Proof can drift while copy/layout/translation change | Protected claim/qualifier links and a semantic coverage ledger reaching storyboard/delivery | 02/03/12 |
| Storyboard approval can become stale after real audio arrives | Pin panel/copy/look/audio/timing snapshot, reconcile material changes without restarting unrelated decisions | 05/07 |
| Scene regeneration can overwrite a user's precise edit | Stable editable properties and conflict-aware preservation through existing source/edit authority | 06/10 |
| Current Undo restores snapshots without current-state comparison | Semantic inverse or compare-and-swap restore; later unrelated edits must survive | 10/11 |
| Current rendered status can accept an unrelated nonempty preview | Require matching source/edit/job/media receipt; pointer targets bind to displayed revision | 10 |
| Current resource limiter can continue without slot or enough memory | Explicit managed queue/block/cancel behavior, ordered pool admission and ownership-aware leases | 09/11 |
| Parallel workers can overcommit one shared budget | Atomic reservation/reconciliation and separate model/render/encode/neural resource accounting | 09 |
| Performance claims can hide quality or failed-work cost | Held-out cases, fair attribution and human/model evaluation separation, all deferred to consent | 13/14 |

Additional static concern: the visible `sourceResearch` code references `full` outside the caller-local declaration shown in `planCrew`. Plan 01 requires checking local lexical scope and fixing the actual policy branch if needed. This is not claimed as a reproduced error.

## What was deliberately not added

No new renderer migration, mandatory cloud model, global Python environment, giant plugin collection, second editable timeline or standing twelve-agent crew per film. Existing modules remain the first reuse choice. Optional capabilities remain named deliverables with honest blockers; a disabled placeholder is not complete.

The plans do not hard-code the sample ChatGPT story. They improve communication selection, copy/evidence separation and format-specific evaluation. Intentional abstraction, simple cuts, restrained motion and straightforward product introductions remain legitimate when suited to the brief.

## How to execute the revised package

Keep the same sequence: **01-13 implementation -> STOP -> user testing approval -> approved scope of 14**. Parallel workers operate within the active plan with exclusive ownership. The lead passes the small relevant rule/source/closure subset, not this entire package, into every worker.

At the stop, provide source changes, implemented/unvalidated status, real wiring receipts, blockers and the proposed bounded test batch. Do not claim tested, production-ready, faster or cheaper. Do not publish or send to Heresay without separate authorization.

## Evidence pointers

A01-A03 in [RESEARCH_SOURCES.md](RESEARCH_SOURCES.md) support repository findings. A04-A08 support selected reference-review decisions. A09-A13 support current tooling/permission/caching/license cautions. Source summaries are evidence for design choices, not proof of the finished product's quality or speed.