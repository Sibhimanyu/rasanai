# Medium performance: make each chosen medium do its own work

Review questions, conditioned on the chosen event. They are never universal minimums. Code: `scripts/lib/medium-rules.mjs` (`MEDIUM_BEHAVIORS`, `resolveMediumPerformance`, `scopeDiagnostics`), `capabilities.mjs` (`mediumExecutionEvidence`), `perf-evidence.mjs` (`recordMediumEvidence`), `character-performance.mjs` (`actingCoverage`, `contactCoverage`, `expressionDiscontinuities`), `medium-adaptations.mjs` (`routePerformanceGaps`).

## Evidence ladder

none < declared < source_present < executed < visually_demonstrated. Source presence is not execution; execution is not a visual demonstration. A profile is `available` only when its defining behaviour (not only its texture) was seen working. Executed or source-only is `uncertain`; a closed gate or no evidence is `unavailable`. Say so before it becomes a promise. If the chosen behaviour cannot be preserved, route the change through Look or Storyboard revision; never relabel the fallback as the same style.

## Defining behaviour by language

| Language | Defining behaviour | Weak substitute |
|---|---|---|
| Character | intention, pose, eyeline, anticipation, reaction, contact | mascot beside text; idle bobbing |
| Paper | cut, fold, layer, material continuity | texture behind ordinary cards |
| Line | drawing order, weight, relations emerging | stroke filter on a slide |
| Pixel | deliberate grid, stepping, glyph legibility | downsampled UI that loses evidence |
| Diagram | relationship revealed in causal order | line growth around a paragraph |
| Isometric | space, occlusion, scale, motivated camera | tilted rectangles with a 3D label |
| Typography | the words perform or argue | interchangeable entrance effects |
| Footage | selection, duration, juxtaposition, source meaning | unrelated stock behind claims |

A character may stay still while a reaction reads. A flat vector film need not imitate material physics. A hybrid keeps accurate UI on a sharp evidence layer.

## Two authorities

- Factual: facts, proof, safety, rights, brand locks, approvals (`HARD_RULE_IDS`, rule kinds authorization/fact/brand/format/resource). A medium never qualifies them. Reduced motion and accessibility stay factual.
- Taste: craft preferences. A selected visual language (formal, typographic, procedural, hybrid) may scope them to the layers and intervals they govern. Depth, grain, lighting and fluency quotas become scoped diagnostics: listed as review with the reason, never silently deleted, never applied to a layer or scene that the look excludes. Intentional stillness and stepped timing are recorded so fluency metrics do not punish them.

## Acting and contact

Character treatments carry a pose sheet, expression states, emotion arc and object contacts in the approved direction. `actingCoverage` and `contactCoverage` read only what the tracks declare. Whether it reads on screen is a visual, temporal judgement (frame/interval review), not a source check. Unsupported human-like acting is disclosed before it is promised. No outside mascot or demo story is imported.

## Status

All of this is implemented_unvalidated: no profile is promoted to visually verified by source review. Later approval may authorize one bounded native-medium sequence whose result must show the defining behaviour.

## Deferred cases (specs only, not run)

`MEDIUM_PERFORMANCE_CASES` in medium-rules.mjs: MED-01 to MED-08, EDGE-01, EDGE-06, EDGE-07.
