# Rule migration map - replace conflicts, do not stack more prompts

Owner: Plan 01 establishes the registry, Plan 03 updates story-related consumers, Plan 08 compiles applicable rules, Plan 09 consumes resource policy. This is a bounded migration list, not an additional creative agent or a new evaluation run.

Inspect actual local occurrences before assigning edits. Existing source references: [Research ledger](RESEARCH_SOURCES.md), particularly R03/R04/R07 and A01-A06.

| Rule or conflict | Inspect | Required resolution | Main owner |
|---|---|---|---|
| Every script needs villain/reversal | Writer/planner, intent schema, `story.mjs`, critics, model addenda | Optional narrative mechanism, required only by the selected grammar; no dummy filler fields | 03 |
| Peak must sit in one percentage range and be longest | Intent/reading helpers, score gates, review prompts | Intent-specific emphasis/readability, not universal mathematical story law | 03/05 |
| Familiar opening or feature sequence automatically rejected | Writer Never/Show off, script editor, house lessons | Accept when it serves scope and evidence; reject weak communication, not familiar language | 03 |
| Voice cannot repeat visible material | Shared/writer/audio guidance, captions | Intentional channel roles; captions may repeat speech and accessibility may require reinforcement | 03/07/12 |
| Every cut carries an object or elaborate transition | Moves prompts, seam checks, imported recipes | Semantic relationship determines cut; continuity contracts only when continuity is intended | 04/05 |
| Every hold must keep moving | Cartoon and kinetic recipes, motion gates | Scope to selected style; permit deliberate stillness and explanatory reading holds | 04/05 |
| Every film follows a beat grid or sound per visual hit | Score/music/SFX planners, imported guidelines | Respect audio-led briefs; allow picture-led timing, silence and intentional cue offset | 05/07 |
| Broad launch treated as exactly one feature | `directFilm`, product-first guidance, Brief classifier | Separate communication scope from runtime route and builder count | 02/03/09 |
| Studio Fast splits all scenes; direct path keeps one builder | Studio pace prompt, crew route planning | One policy snapshot; group by dependency/continuity and task size | 01/08/09 |
| Legacy lean skips options or boards | Crew budget branches and native stage mapping | Preserve explicitly chosen creative approvals; economy affects unselected detail first | 03/04/08 |
| Source-specific frame/pixel values become global defaults | Imported technique records | Normalize duration, rate and dimensions or mark explicit frame-locked scope | 04/06 |
| Hard lessons silently accumulate | `lessons.mjs`, packet composition, style/personality files | Scoped, versioned, reviewable rules with source and retirement reasons | 08/13 |
| Slot failure means render without cap | `scripts/lib/slot.mjs` | Managed jobs queue/block/cancel; no silent resource-cap bypass | 09/11 |
| End of implementation implies permission to test | Coordinator, workers, hooks, prior handoffs | STOP after 13; explicit user permission and scope before any Plan 14 job | 00/all |

Each migrated rule records its old locations, new applicability predicate, affected validators, compatibility handling, and deferred cases. A grep match is a lead to inspect, not a request to delete every matching word. Existing saved projects remain readable. Facts, rights, permissions and source integrity remain binding even when style rules are relaxed.

**Implementation closure:** writer, schema, gate, user-facing wording and relevant model addenda agree on the new rule. Only source/static inspection is allowed before testing approval; runtime behavior remains unvalidated.