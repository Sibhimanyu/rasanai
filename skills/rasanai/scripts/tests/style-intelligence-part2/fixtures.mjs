// style-intelligence-part2 fixtures. Invented brands, synthetic data only. Import-safe: constants and pure builders;
// no fs writes, no network, no spawn. AUTHORED, NOT RUN: no testing approved (see docs/plans/style-intelligence-part2/TEST_APPROVAL_REQUEST.md).
import path from "node:path";
import { fileURLToPath } from "node:url";

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SKILL = path.join(HERE, "..", "..", "..");
export const LIB = path.join(HERE, "..", "..", "lib");
export const REPO = path.join(SKILL, "..", "..");

// Safety latch so `node --test <dir>` discovery cannot execute cases by accident. NOT user approval:
// only the user's answer to TEST_APPROVAL_REQUEST.md authorizes a batch. Lanes: pure | scene | journey | static | all.
export const approved = (lane) => process.env.STYLE_PART2_APPROVED === lane || process.env.STYLE_PART2_APPROVED === "all";
export const skipUnless = (lane) => (approved(lane) ? false : `no test approval for lane "${lane}" (set STYLE_PART2_APPROVED=${lane} only after the user approves)`);

export const load = (name) => import(path.join(LIB, name));
// Resolve an export by contract name; a missing lane fails the case (never skips, never passes).
export const need = async (mod, fn) => {
  const m = await load(mod);
  if (typeof m[fn] !== "function") throw new Error(`UNKNOWN/MISSING: ${mod} does not export ${fn} (lane API not landed or renamed; adjust API map in fixtures.mjs)`);
  return m[fn];
};
// API name map, filled from the REAL export lines (read statically, never executed) of scripts/lib/medium-*.mjs and runtime/medium-*.js.
// `need(mod, fn)` only loads ESM modules from scripts/lib, so only those owners carry `fns`. Test calls pass `fns[key]` names to `need`.
// Contract-named modules (use need("<file>", "<export>") directly): medium-index.mjs {buildMediumIndex, resolveMediumProfile, validateMediumProfile, mediumSummary, readMediumMetadata, mediumState, capabilityStates, safeSkillPath},
//   medium-fit.mjs {assessMediumEligibility, assessMediumFit, selectMediumShortlist, buildMediumSelection, validateFitDecision, proposeMediumAdaptations, MEDIUM_FIT_CASES},
//   medium-adaptations.mjs {proposeMediumAdaptations, validateAdaptationCatalog, DEFAULT_ADAPTATION_CATALOG}, medium-rules.mjs {resolveMediumRules, HARD_RULE_IDS, CRAFT_QUALIFIERS},
//   medium-contract.mjs {validateMediumContract, projectMediumForWorker, mediumContractCurrent, mediumContractDigest}, medium-wiring.mjs (glue, not in the contract list).
export const API = {
  examples: { mod: "medium-examples.mjs", fns: { buildIndex: "buildExampleIndex", retrieve: "retrieveExamples", registration: "registrationRequests", evidenceLine: "evidenceLine" } }, // UNKNOWN: no copy reviewer export ("reviewCopying" unmapped on purpose: MS-54 fails as UNKNOWN); argument shapes differ from the placeholder calls in pure.test.mjs
  lessons: { mod: "medium-learning.mjs", fns: { retrieve: "selectMediumLessons", extract: "extractMediumLesson", toArgs: "toLessonArgs" } }, // UNKNOWN: "record" unmapped (persisting goes through lessons-scope buildLesson via toLessonArgs; lessons-scope has no medium/film/communication-kind scope, see KNOWN_LIMITS); arg shapes unverified
  // Runtime modules are CommonJS/UMD files in runtime/ (browser globals or module.exports), NOT loadable by `need`; their normalized build/stateAt/phases contract assumed by scene.synthetic.test.mjs does NOT exist:
  //   medium-surface.js {createMediumScene, createSurface, rng, rngFor, quantize, frameTime, ease, makeTransform, parsePath, pointAt}; medium-graphic.js {createFlatVectorScene, createLineDrawingScene, createEvidenceDiagramScene};
  //   medium-paper.js {createPaperCollageScene}; medium-pixel.js {fit, palette, step, hold, camera, parallax, defineSprite, measureText, bayer, tileAssemble, surface, bind};
  //   medium-pixel-companion.js {mount, measureWorldBounds, worldToScreen, place, poseAt, digestOf, overlaps, disclosure}; medium-cel.js {createMediumScene, boilOffset, drawingFrame, compile, normalizeBindings};
  //   medium-isometric.js {createMediumScene, makeProjection, depthOrder, tones, compile, cameraAt, normalizeBindings}. Scene objects expose setTime/describeElements/destroy, not build/stateAt/phases.
  vector: { mod: null, fns: {} }, paper: { mod: null, fns: {} }, pixel: { mod: null, fns: {} }, character: { mod: null, fns: {} }, iso: { mod: null, fns: {} }, // UNKNOWN: scene-lane cases (MS-25..44) cannot resolve; they fail as UNKNOWN until an adapter is written
};
export const sha = (c) => c.repeat(64).slice(0, 64);
export const text = (x) => JSON.stringify(x).toLowerCase();

// ---- profiles / assignment ----
export const profile = (o = {}) => ({
  format: "medium-profile@1", id: "pixel", family_id: "pixel-retro", style_refs: ["pixel"], execution_id: "pixel-native",
  summary: "Original sprites on a pixel grid", visual_material: ["indexed shapes"], native_actions: ["tile-assemble", "sprite-act"],
  story_affordances: ["progression"], risks: ["small exact UI becomes unreadable"],
  proof_policy: { exact_ui: "assess-legibility", protected_text: "readable-or-separate-layer", claim_mutation: "forbidden" },
  runtime_refs: [], example_refs: [], asset_needs: [], capability_ref: null, preferred_assignments: [], hard_exclusions: [],
  evidence: { basis: "authored-unvalidated", receipt_refs: [] }, provenance_refs: [], ...o,
});
export const caps = (o = {}) => ({ implemented: true, available: true, enabled: true, permitted: true, verified: false, ...o });
export const assignment = (o = {}) => ({
  brief_pin: { digest: sha("b"), revision: 1 }, story_pin: { digest: sha("s"), revision: 1 }, communication_kind: "workflow-demo",
  audience_context: "people learning to correct work emails (invented)", takeaway: "understand and reuse a correction", tone_intent: ["clear"],
  destination: { aspect: "16:9", viewing_size: "phone", sound: "optional" },
  proof_needs: [{ id: "proof-1", kind: "exact-ui", claim_refs: ["c1"], required_text_refs: ["copy-1"], precision: "exact" }],
  brand: { hard_constraints: [], motion_constraints: [], inferred_preferences: [] },
  user_direction: { named_media: [], excluded_media: [], source_action_id: null }, assets: [], capabilities: [],
  resolved_policy_ref: "existing-production-policy", constraints_revision: sha("c"), ...o,
});
export const contract = (o = {}) => ({
  format: "medium-contract@1", candidate_id: "look-b", profile_id: "living-screencast", family_id: "pixel-retro", execution_id: "pixel-companion",
  pins: { story_digest: sha("s"), comparison_content_digest: sha("k"), profile_digest: sha("p") },
  visual_premise: "An original companion helps the viewer notice the real correction",
  layers: [
    { id: "proof", role: "evidence", medium: "sharp-ui", renderer_ref: "existing-ui-adapter", protected_refs: ["copy-1", "screen-1"] },
    { id: "guide", role: "editorial", medium: "pixel", renderer_ref: "pixel-adapter", protected_refs: [] },
  ],
  invariants: [{ id: "proof-legible", kind: "hard", description: "Correction and qualifier stay readable", source_refs: ["proof-1"] }, { id: "crisp-sprite", kind: "medium", description: "Sprite stays on its grid" }],
  native_actions: [{ id: "guide-attend", serves: "attention to the correction", event_binding: null }],
  text_policy: { role: "proof-and-support", full_resolution_layers: ["proof"], pixel_font_required: false },
  motion_policy: { temporal_mode: "mixed", camera_mode: "chosen-by-look", intentional_holds_allowed: true },
  finish_policy: { by_layer: { proof: "sharp", guide: "nearest-neighbor" } }, sound_intent: { silence_allowed: true },
  evidence_boundaries: { editorial_metaphor_is_product_ui: false }, example_refs: [], limitations: [], decision_authority: "existing Look approval", ...o,
});
export const grammar = (o = {}) => ({ grammar_format: "medium-grammar@2", text_role: "none", ground_motion: "none", density: "reading-led", native_actions: ["line-draw"], transitions: [], ...o });
