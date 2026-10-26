# Style-aware rule migration (worker M03) - implemented_unvalidated

Gate: a look is on the new path when `design/<label>/medium.json` has `format: "medium-contract@1"` or `blend.json` has `medium_policy_revision >= 1` (`system.mjs mediumPolicyOf`). A grammar is on the new path when `grammar_format: "medium-grammar@2"` (`grammar-lib.mjs isMediumGrammar`). Anything else is legacy and unchanged. Nothing here was run (no check-system, no grammar command).

## 1. Code rule -> new-path behaviour (all in skills/rasanai/scripts/lib)

| Rule (legacy) | Where | medium-grammar@2 / medium policy |
|---|---|---|
| `word-choreo` technique required | grammar-lib validateGrammar | only when `uses_word_choreo: true`; `text_role` none/proof/support/primary/mixed declared; no phantom text |
| >= 6 techniques, >= 3 transitions | validateGrammar | >= 1 `native_actions` entry (id, name, what, `impl_ref` = registered id or an existing skill path); transitions optional, empty list valid |
| `ground_motion` prose >= 12 chars | validateGrammar | prose OR `{mode:"none", reason}` |
| `density.change_every_s > 0` | validateGrammar | `density.mode` in reading-led/action-led/music-led/manual/chosen (chosen needs a reason); `change_every_s` optional but > 0 when present |
| frame_device/type/image all required | validateGrammar | `frame_device.what` required; `type` only when text_role shows text; `evidence_constraints` required for proof/mixed text |
| technique-thin, frame-device-missing (P) | checkScoreGrammar | removed; frame-device is advice only; each beat still must name a declared action (`native_action` or `technique`); unknown layer or action/layer mismatch blocks |
| missing ids, bad JSON, duplicate ids, unknown layer, path outside skill | both | still errors |
| brand film card required/filled/cited/takes/palette/type match | system.mjs checkSystem | blocking only for strict brand-film (`decisions.json strict_brand_film` / `film_style_strict`, or `opts.strictFilm`); else warnings (`PS`). Brand lock (DESIGN.md palette/display face) stays blocking everywhere |
| `blend.style_refs` / `blend.references` must be empty on a branded film | checkSystem | strict only |
| blend >= 2 references | checkSystem | new path: 0-1 refs allowed when `blend.originality` (20+ chars) or `style_refs` explains the look; > 4 still a warning |
| `grammar-not-flat` vs graphic-finish card | checkSystem | strict only; else warning |
| `grammar-repeat`, identical reference sets across looks | checkSystems | warning when both looks are on the new path (`look-axes-repeat` still blocks recolours) |

## 2. Per-layer adapter (medium-rules.mjs resolveMediumRules) - consumer map for the lead

`resolveMediumRules({contract, layerId, sceneId, existingRules}) -> {hard, craft, scopedExceptions, reasons}`. The consumer passes the ids of the checks it is about to apply for that layer/scene, then enforces `hard`+`craft` and skips only checks listed in `scopedExceptions` (record the entry in its report). Unknown contract/layer/rule keeps the check. Never pass an `intentional` flag.

| Rule id (pass this) | Consumer to wire | Qualified only when |
|---|---|---|
| camera-drift, camera-motion, forced-camera-move | motion-gate / camera checks (moves-lib, camera.mjs consumers) | `motion_policy.camera_mode` locked/none/static (forced-camera-move also chosen-by-look) |
| ground-motion, continuous-motion | grammar/motion-gate ground checks | `motion_policy.ground_motion === "none"` |
| stepped-motion, curve-mix, handoff-continuity | moves-lib curve-mix / handoff quotas | `temporal_mode` stepped/mixed (curve-mix also cut-based/still) |
| intentional-hold, static-freeze | frame/motion freeze detectors (frames-lib checkShots, motion-gate) | `intentional_holds_allowed` true AND `sceneId` in `motion_policy.hold_scene_ids` |
| cadence | density / change-rate checks | `motion_policy.cadence` set (not "universal") |
| word-choreo, type-scale-quota | grammar/frames type checks | `text_policy.role` none/proof/support |
| blur-finish, soft-focus, depth-of-field, lighting-shadow, grain-glow | finish layer, frames-lib depth-craft (craftProfile) | `finish_policy.by_layer[layer]` is sharp/nearest-neighbor/none/flat (per layer: a sprite layer never blurs the proof layer) |
| multi-plane-depth | frames-lib depth rules | layer medium is flat-type (pixel, sharp-ui, flat, line, paper-flat) |

Hard (never exempt): proof-legible, text-readable, readability, safe-area, time-bounds, time-order, source-ref(s), paths, permission, rights, brand-lock, brand-constraint, logo, claim-mutation, exact-ui, qualifier, frame-blank/missing, render-failed, contrast, a11y, reduced-motion, protected-text, approval, and the contract's `invariants[kind=hard]` (returned as `invariant:<id>`). If finish cannot honour a per-layer rule, the lead must mark the effect unavailable, not apply a global filter.

## 3. Prompt migration request (for M07 / lead; M03 edits no prompts)

Remove each instruction with its validator, only for looks on the new path:
1. `references/design-desk.md` line ~50 (grammar: "8 to 12 techniques", `density change_every_s`, "three different grammars"): add the `medium-grammar@2` schema (text_role, native_actions + impl_ref, layers, optional word-choreo/camera/transitions, density.mode) and say distinct grammar ids are not a requirement when the looks differ in axes.
2. `references/design-desk.md` lines ~8, 72 (blend 2 to 4 references): single-medium looks cite `originality` or `style_refs`; never invent a hybrid to reach a count.
3. `references/design-desk.md` line ~24 (branded = brand film grammar): strict only when the user asks; otherwise brand lock = palette, type, logo, UI, declared motion limits; outside mechanisms allowed if no foreign identity.
4. `agents/design-system-designer.md` item 5 (grammar.json) and `agents/styleframe-designer.md`, `agents/frame-juror.md`: same conditions; juror judges per layer via the contract, not "glow/blur on all" or word-choreo presence.
5. Mark historical "every film needs word-choreo / ground motion / change every N s" lessons as legacy-scoped.

## 4. Lead requests / unresolved
- Fixtures: request M09 for a medium-grammar@2 grammar (text_role none, one native action, empty transitions) and a legacy grammar unchanged.
- `strict_brand_film` / `film_style_strict` in decisions.json is a new key the lead must set only from an explicit user request; no existing writer produces it.
- Score scenes may use `native_action` and `layer` keys (legacy `technique` still read); crew.mjs score schema/prompt needs the same.
- `medium.json` is read for its `format` only here; full validation is M07's `validateMediumContract`.
