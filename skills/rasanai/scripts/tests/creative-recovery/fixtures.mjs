// Creative-recovery fixtures (W09). Invented brands, synthetic data. Import-safe: constants and pure builders only;
// no fs writes, no network, no spawn. AUTHORED, NOT RUN: no testing approved (see docs/plans/creative-recovery/TEST_APPROVAL_REQUEST.md).
import path from "node:path";
import { fileURLToPath } from "node:url";

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const LIB = path.join(HERE, "..", "..", "lib");

// Guard so `node --test <dir>` discovery cannot execute these by accident. This env var is a safety latch,
// NOT user approval: only the user's actual answer to TEST_APPROVAL_REQUEST.md authorizes a batch.
export const approved = (lane) => process.env.CREATIVE_RECOVERY_APPROVED === lane || process.env.CREATIVE_RECOVERY_APPROVED === "all";
export const skipUnless = (lane) => (approved(lane) ? false : `no test approval for lane "${lane}" (set CREATIVE_RECOVERY_APPROVED=${lane} only after the user approves)`);

// Contract-named imports. Resolved lazily so a missing lane module fails the case, not discovery.
export const load = (name) => import(path.join(LIB, name));

export const sha = (c) => c.repeat(64).slice(0, 64);

// ---- reference index (invented sources; no real media) ----
export const refRow = (o = {}) => ({
  id: "ref-demo-01", source_url: "https://example.invalid/case/demo-01", kind: "professional-case",
  format_tags: ["product-launch"], shot_tags: ["ui-demo"], principle: "Original summary: show the product changing state.",
  avoid_copying: ["logo", "scene composition"], evidence_level: "source-description", media: [],
  verified_at: "2026-10-26", runtime_family: "dom-gsap", complexity: "medium", ...o,
});
export const mediaRow = (id = "m1") => ({ path: `fixtures/${id}.png`, sha256: sha("a"), rights_basis: "synthetic test image, authored for this suite", scope: "reference-only" });
export const assignment = (o = {}) => ({ format: "product-launch", product: "Lumio Notes (invented)", shot_kinds: ["ui-demo"], brand: {}, constraints: [], ...o });

// ---- creative brief ----
export const brief = (o = {}) => ({
  schema_version: 1, creative_policy_revision: 1, revision: 1, mode: "proposal",
  pins: { brief: null, story: null, look: null, storyboard: null },
  communication_kind: "whole-product-introduction",
  promise: "Lumio Notes turns a messy meeting into three decisions", premise: "Notes sort themselves into decisions as the viewer watches",
  native_material: [{ id: "atom-1", kind: "ui", source_ref: "src-1" }],
  opening: { event: "A cluttered page tidies into three lines", why_watch: "Shows the payoff first" },
  signature_events: [{ id: "sig-1", beat_ids: ["beat-2"], before: "scattered notes", change: "they snap into rows", after: "three decisions", proof_refs: ["claim-1"], why_motion: "the sorting is the claim", must_preserve: ["three decisions"], fallback: "static before/after pair" }],
  payoff: { event: "Rows lock", resolves: "the promise" },
  visual_strategy: { protagonist: "the page", progression: "mess to order", rhythm: "slow then snap", restraint: "one accent", sound_role: "tick on lock" },
  repetition_intent: [], do_not_substitute: ["A card title is not the specified visual event"],
  references: { selection_ref: "creative/references.json", digest: null },
  effort: { focus_event_ids: ["sig-1"], round_limit: 2, source: "existing resolved production budget" },
  decision_authority: "existing user stage approvals; this record grants none", ...o,
});
export const pin = (stage, d = "d1") => ({ artifact_ref: `${stage}/artifact.json`, artifact_digest: sha(d), revision: 1, source_action_id: `act-${stage}-1` });

// ---- consent state (parsed read-only, as the coordinator would supply) ----
export const consentInput = (o = {}) => ({
  stage: "look", expectedDigest: sha("l"),
  session: { steps: { look: { status: "waiting" } } },
  appliedActions: [], approvals: [], explicitDelegations: [], ...o,
});
export const chooseAction = (o = {}) => ({ id: "act-look-1", kind: "choose", stage: "look", selected: "look-b", digest: sha("l"), ...o });

// ---- review envelope ----
export const review = (o = {}) => ({
  schema_version: 1, stage: "storyboard", input_digest: sha("i"), artifact_digests: [{ path: "boards/s2.png", sha256: sha("b") }],
  reviewer: { role: "frame-juror", job_id: "job-1", independent_of_builder: true },
  evidence: { kind: "images", observed_refs: ["boards/s2.png"], basis: "self-reported" },
  judgments: [], set_level: { progression: "ok", repetition: "justified", signature: "present" }, result: "ready", limitations: [], ...o,
});

// ---- proof contract ----
export const proof = (o = {}) => ({
  id: "proof-1", beat_id: "beat-3", source_refs: ["src-1"],
  source_text: "Members earn a bonus after 3 completed lessons in a week, except trial accounts.",
  intended_claim: "bonus after 3 lessons per week, not for trials", transformation_kind: "paraphrase",
  protected_entities: ["trial accounts"], protected_quantities: ["3", "week"], protected_conditions: ["except trial accounts"],
  supported_outputs: ["Earn a bonus after 3 lessons a week (not for trials)"], illustrative: false, review_status: "pending", ...o,
});

// ---- packet / handoff ----
export const mapping = (o = {}) => ({ event_id: "sig-1", beat_id: "beat-2", shot_ids: ["s2"], board_refs: ["boards/s2.png"], source_files: ["scenes/s2.html"], sample_times_s: [4.0], produced_artifact_refs: ["scenes/s2.html"], input_digest: sha("p"), declared_deviations: [], ...o });
