// Medium adaptations (M02): a mitigation is a NEW explicit candidate definition, never a silent mutation of the
// original and never prose alone. Pure and import-safe: no file, network, process or model access, no writes.
// Each proposal carries its own layer contract and is marked for full re-evaluation (proof, palette, bounds,
// capability); the base profile is reported unchanged. Nothing here grants approval, capability or timing.
// Catalog entries are original authored metadata (provenance below), unvalidated until an authorized scope checks them.

export const ADAPTATION_FORMAT = "medium-adaptation@1";

// Reason codes an adaptation may legitimately resolve. Facts, rights, brand bans, user exclusions, missing real
// evidence and disabled/unpermitted capabilities are never adaptable: they need a user or lead decision.
export const ADAPTABLE_REASON_CODES = Object.freeze([
  "proof_legibility_unassessed",
  "proof_needs_separate_layer",
  "protected_text_unreadable_risk",
  "locale_text_support",
  "optional_asset_missing",
]);

const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);
const str = (x, d = "") => (typeof x === "string" ? x : d);
const clone = (x) => JSON.parse(JSON.stringify(x === undefined ? null : x));

// Starting catalog. `applies_to` empty = any profile. `layers` are layer-contract seeds in the medium-contract@1 shape;
// the host medium (the profile being adapted) fills `{host}` roles. renderer_ref stays null until a real adapter is named.
export const DEFAULT_ADAPTATION_CATALOG = Object.freeze([
  {
    id: "proof-layer-hybrid",
    summary: "Exact proof (UI, copy, qualifiers) sits on a full-resolution sharp layer; the chosen medium carries everything else.",
    applies_to: { profile_ids: [], family_ids: [], execution_ids: [] },
    resolves: ["proof_legibility_unassessed", "proof_needs_separate_layer", "protected_text_unreadable_risk", "locale_text_support"],
    layers: [
      { id: "proof", role: "evidence", medium: "sharp-ui", renderer_ref: null, protected_refs: "from-proof-needs" },
      { id: "host", role: "editorial", medium: "{host}", renderer_ref: null, protected_refs: [] },
    ],
    finish_policy: { by_layer: { proof: "sharp", host: "native-to-medium" } },
    text_policy: { role: "proof-and-support", full_resolution_layers: ["proof"] },
    limitations: ["Two visual languages must feel related; the host medium must not decorate over or crop the proof layer."],
    provenance: "original authored metadata",
  },
  {
    id: "proof-inset-hold",
    summary: "The chosen medium leads; the exact proof appears as a held, full-resolution inset at the moment it is needed, then yields.",
    applies_to: { profile_ids: [], family_ids: [], execution_ids: [] },
    resolves: ["proof_legibility_unassessed", "proof_needs_separate_layer", "protected_text_unreadable_risk"],
    layers: [
      { id: "host", role: "environment", medium: "{host}", renderer_ref: null, protected_refs: [] },
      { id: "proof", role: "evidence", medium: "sharp-ui", renderer_ref: null, protected_refs: "from-proof-needs" },
    ],
    finish_policy: { by_layer: { proof: "sharp", host: "native-to-medium" } },
    text_policy: { role: "proof-and-support", full_resolution_layers: ["proof"] },
    limitations: ["Hold length is set by the score or footage authority, not by this record."],
    provenance: "original authored metadata",
  },
  {
    id: "pixel-companion-over-sharp-proof",
    summary: "Pixel pairing: an original pixel companion on its own grid beside the exact interface on a sharp layer.",
    applies_to: { profile_ids: [], family_ids: ["pixel-retro"], execution_ids: [] },
    resolves: ["proof_legibility_unassessed", "proof_needs_separate_layer", "protected_text_unreadable_risk"],
    layers: [
      { id: "proof", role: "evidence", medium: "sharp-ui", renderer_ref: null, protected_refs: "from-proof-needs" },
      { id: "guide", role: "editorial", medium: "pixel", renderer_ref: null, protected_refs: [] },
    ],
    finish_policy: { by_layer: { proof: "sharp", guide: "nearest-neighbor" } },
    text_policy: { role: "proof-and-support", full_resolution_layers: ["proof"], pixel_font_required: false },
    limitations: ["The companion is editorial; it must not imply a product feature or mechanic that does not exist."],
    provenance: "original authored metadata",
  },
  {
    id: "original-stand-in-for-optional-asset",
    summary: "An optional, non-evidentiary asset is replaced by an original compatible drawing; real product evidence is never substituted.",
    applies_to: { profile_ids: [], family_ids: [], execution_ids: [] },
    resolves: ["optional_asset_missing"],
    layers: [],
    finish_policy: { by_layer: {} },
    text_policy: null,
    limitations: ["Custom drawing is unverified until checked in an authorized scope.", "Never used for exact UI, product internals or any claim."],
    provenance: "original authored metadata",
  },
]);

// -> {ok, errors:[{code,path,message}]}
export function validateAdaptationCatalog(catalog) {
  const errors = [];
  if (!Array.isArray(catalog)) return { ok: false, errors: [{ code: "not_array", path: "", message: "catalog must be an array" }] };
  const seen = new Set();
  catalog.forEach((a, i) => {
    const p = `[${i}]`;
    if (!isObj(a) || !str(a.id)) return errors.push({ code: "bad_entry", path: p, message: "entry needs an id" });
    if (seen.has(a.id)) errors.push({ code: "dup_id", path: `${p}.id`, message: `duplicate adaptation id ${a.id}` });
    seen.add(a.id);
    const unknown = arr(a.resolves).filter((c) => !ADAPTABLE_REASON_CODES.includes(c));
    if (!arr(a.resolves).length || unknown.length) errors.push({ code: "bad_resolves", path: `${p}.resolves`, message: `resolves must be non-empty and adaptable; got ${unknown.join(", ") || "none"}` });
  });
  return { ok: !errors.length, errors };
}

const matches = (list, v) => !arr(list).length || (v != null && arr(list).includes(v));
function appliesTo(entry, profile) {
  const a = isObj(entry.applies_to) ? entry.applies_to : {};
  return matches(a.profile_ids, profile.id) && matches(a.family_ids, profile.family_id) && matches(a.execution_ids, profile.execution_id);
}

// -> {candidates:[...], unresolved_reasons:[...]}: explicit candidate definitions; `assessment` is an
// assessMediumEligibility result ({state, reasons}). Every candidate must be re-assessed as its own profile before use.
export function proposeMediumAdaptations(profile, assessment, adaptationCatalog = DEFAULT_ADAPTATION_CATALOG, context = {}) {
  const p = isObj(profile) ? profile : {};
  const reasons = arr(assessment && assessment.reasons);
  const adaptable = reasons.filter((r) => ADAPTABLE_REASON_CODES.includes(r.code));
  const fixed = reasons.filter((r) => !ADAPTABLE_REASON_CODES.includes(r.code) && (r.severity || "") !== "info");
  const proofNeeds = arr(context.proofNeeds);
  const candidates = [];
  const coveredCodes = new Set();
  for (const entry of arr(adaptationCatalog)) {
    if (!isObj(entry) || !appliesTo(entry, p)) continue;
    const hits = adaptable.filter((r) => arr(entry.resolves).includes(r.code));
    if (!hits.length) continue;
    hits.forEach((r) => coveredCodes.add(r.code));
    const proofRefs = proofNeeds.flatMap((n) => [...arr(n.claim_refs), ...arr(n.required_text_refs)]);
    candidates.push({
      format: ADAPTATION_FORMAT,
      candidate_id: `${str(p.id, "unknown")}+${entry.id}`,
      base_profile_id: p.id ?? null,
      base_family_id: p.family_id ?? null,
      adaptation_id: entry.id,
      summary: entry.summary,
      resolves: hits.map((r) => ({ code: r.code, constraint_ref: r.constraint_ref ?? null })),
      layers: arr(entry.layers).map((l) => {
        const o = clone(l);
        if (o.medium === "{host}") o.medium = p.family_id || p.id || "host";
        if (o.protected_refs === "from-proof-needs") o.protected_refs = proofRefs.slice();
        return o;
      }),
      finish_policy: clone(entry.finish_policy),
      text_policy: clone(entry.text_policy),
      limitations: arr(entry.limitations).slice(),
      layer_contract_required: arr(entry.layers).length > 0,
      needs_reevaluation: true,
      assessment_status: "pending",
      original_unchanged: true,
      state: "implemented_unvalidated",
      provenance: entry.provenance || null,
    });
  }
  // Adaptable reasons nobody covers stay visible; fixed (non-adaptable) reasons are never relabelled as solved.
  const unresolved_reasons = [
    ...adaptable.filter((r) => !coveredCodes.has(r.code)).map((r) => ({ code: r.code, detail: "no catalog adaptation covers this" })),
    ...fixed.map((r) => ({ code: r.code, detail: "not adaptable; needs a user or lead decision" })),
  ];
  return { candidates, unresolved_reasons };
}

// ---- V3 W08 (additive): performance-gap routing --------------------------------------------------------------------------------------------------
// A medium whose defining behaviour is uncertain/unavailable (medium-rules resolveMediumPerformance state rows) is NOT adapted silently: this returns the decisions the
// Director must put to the person through the existing Look/Storyboard revision. It never relabels a fallback as the same style and grants no approval or capability.
// rows: resolveMediumPerformance(...).states -> [{ behavior, language, state, level, disclosure, commitment_id, kind: "disclose-before-promise"|"propose-revision", options:[...] }]
export function routePerformanceGaps(rows, { profile = null } = {}) {
  const p = isObj(profile) ? profile : {};
  return arr(rows).filter((r) => isObj(r) && r.state && r.state !== "available").map((r) => ({
    commitment_id: r.commitment_id ?? null,
    language: r.language ?? null,
    behavior: r.behavior ?? null,
    state: r.state,
    level: r.level ?? "none",
    route: r.state === "unavailable" ? "look-or-storyboard-revision" : "disclose-then-confirm",
    disclosure: r.disclosure || `${r.behavior || "this behaviour"} is ${r.state}`,
    options: [
      "keep the medium and weaken the commitment, stated plainly",
      "choose a different medium or custom direction through Look revision",
      ...(r.state === "uncertain" ? ["authorize one bounded native-medium sequence to demonstrate it before relying on it"] : []),
    ],
    relabel_as_same_style: false,
    base_profile_id: p.id ?? null,
    state_label: "implemented_unvalidated",
  }));
}
