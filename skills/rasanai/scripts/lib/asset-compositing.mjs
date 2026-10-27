// Asset-directed compositing plan (W16). PLANS and VALIDATES how real imagery is used as part of a composition; it renders nothing,
// calls no provider, acquires nothing and has no clock. Pure and deterministic: same input -> same digest.
//   planAssetCompositing({ subjects, assets, anchors, crops }) -> { plan, masks, alpha, occlusion, capabilityState, digest, invalidation, review, errors, warnings, unknown }
//
// Authorities it reads (never replaces): asset records come from the film's hybrid/sources.json shape (id, rights, sha256, media{width,height}, optional
// has_alpha / mask / depth / views); rights stay in lib/license-register.mjs + lib/provenance.mjs (rightsStatus), so a caller may pass `rights_status`
// per asset from provenance.rightsStatus(run, id).status. `anchors` is the object returned by composition-anchors.planAnchors (regions/anchors/digest)
// so region and anchor IDs are the shared W14 IDs; no second timing authority (times, if any, stay score seconds in the anchor plan).
//
// Units: crop rects and subject regions are fractions of the SOURCE image (x,y from top-left; w,h); `out` is target pixels. Pixel density = source
// pixels covered by the crop divided by target pixels (>= 1 means no upscaling).
// capabilityState: available | uncertain | unavailable. "available" never claims a clean cutout or a render: alpha/mask quality stays `not_inspected`
// until a later authorized review records it (`mask.inspected === true` with its sha256). Sampled reference images do not prove technique.
//
// Consumers (wired by the lead/INT, not here): the Motion Director writes the returned `plan` into hybrid/sources.json layers as the optional additive
// `crop`, `region_id`, `anchor_id`, `mask_sha256`, `plan_digest` fields (see hybrid-compositor `compositingFields`, hybrid-graph key extras); W11 reads
// `invalidation`; W09 reads `review`. Extending shot layers is the only injection path; there is no new renderer.
import { digestOf } from "./composition-anchors.mjs";
import { CREATIVE_ERROR_CODES as E } from "./creative-policy.mjs";

export const ASSET_COMPOSITING_VERSION = 1;
export const REPRESENTATIONS = Object.freeze(["hero", "closeup", "silhouette", "material", "repeat", "final"]);
export const FINISHES = Object.freeze(["flat", "spatial"]);   // flat collage may mix photo and graphic; spatial needs contact/depth
export const FITS = Object.freeze(["cover", "contain"]);        // never "stretch"
const REUSABLE_RIGHTS = new Set(["owned", "licensed", "generated"]);
const BAD_RIGHTS_STATUS = new Set(["withdrawn", "expired", "unresolved"]);
const RANK = { available: 0, uncertain: 1, unavailable: 2 };
const arr = (v) => (Array.isArray(v) ? v : []);
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const num = (v) => typeof v === "number" && Number.isFinite(v);
const err = (code, ref, message) => ({ code, ref, message });
const r4 = (x) => Math.round(x * 1e4) / 1e4;
const worse = (a, b) => (RANK[b] > RANK[a] ? b : a);

function rectProblem(r) {
  if (!isObj(r) || ![r.x, r.y, r.w, r.h].every(num)) return "rect needs numeric x, y, w, h (fractions of the source)";
  if (r.w <= 0 || r.h <= 0) return "rect must have positive w and h";
  if (r.x < 0 || r.y < 0 || r.x + r.w > 1 + 1e-9 || r.y + r.h > 1 + 1e-9) return "rect lies outside the source image";
  return null;
}
const center = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const inside = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

export function planAssetCompositing({ subjects = [], assets = [], anchors = null, crops = [] } = {}) {
  const errors = [], warnings = [], unknown = [];
  let state = "available";
  const A = new Map();
  for (const a of arr(assets)) { if (isObj(a) && a.id != null) A.set(String(a.id), a); }
  const regionIds = new Set([...arr(anchors && anchors.regions), ...arr(anchors && anchors.anchors)].map((x) => x && x.id).filter(Boolean));
  const haveAnchors = !!(anchors && (arr(anchors.regions).length || arr(anchors.anchors).length));
  const bad = (code, ref, msg, st = "unavailable") => { errors.push(err(code, ref, msg)); state = worse(state, st); };
  const soft = (ref, msg, st = "uncertain") => { unknown.push(`${ref}: ${msg}`); state = worse(state, st); };

  const plan = { version: ASSET_COMPOSITING_VERSION, subjects: [], crops: [] }, masks = [], alpha = [], occlusion = [];
  const invalidation = { subjects: {}, crops: {}, anchors_digest: (anchors && anchors.digest) || null };
  const review = { edge_identity: [], crop_correspondence: [], resolution: [], rights: [], seams: [] };
  const subjectById = new Map();

  const checkRef = (ref, kind, id) => {
    if (id == null) return;
    if (!haveAnchors) soft(ref, `${kind} "${id}" cannot be checked: no anchor plan supplied`);
    else if (!regionIds.has(id)) bad(E.stale_input, ref, `${kind} "${id}" is not in the anchor plan`, "uncertain");
  };

  for (const s of arr(subjects)) {
    if (!isObj(s) || !s.id) { bad(E.stale_input, "subjects", "subject without an id", "uncertain"); continue; }
    const id = String(s.id);
    if (subjectById.has(id)) { bad(E.stale_input, id, "duplicate subject id", "uncertain"); continue; }
    const a = A.get(String(s.asset_id));
    const rep = s.representation || "hero";
    if (!REPRESENTATIONS.includes(rep)) bad(E.stale_input, id, `representation "${rep}" is not one of ${REPRESENTATIONS.join(", ")}`, "uncertain");
    const finish = s.finish || "flat";
    if (!FINISHES.includes(finish)) bad(E.stale_input, id, `finish "${finish}" is not one of ${FINISHES.join(", ")}`, "uncertain");
    const entry = { id, purpose: s.purpose || null, representation: rep, finish, asset_id: s.asset_id ?? null, region_id: s.region_id ?? null, anchor_id: s.anchor_id ?? null, state: "available", reasons: [] };
    const sub = (st, reason) => { entry.state = worse(entry.state, st); entry.reasons.push(reason); state = worse(state, st); };
    checkRef(id, "region", s.region_id); checkRef(id, "anchor", s.anchor_id);
    if (s.editorial_interpretation) entry.editorial_interpretation = true;   // internal contract mark: must not read as product internals / anatomy / diagram fact

    // source identity + rights (read-only against the existing ledger)
    if (!a) {
      // no source asset: the idea must be re-directed to a supported visual, never silently iconised
      const acq = isObj(s.acquisition) ? s.acquisition : null;
      if (acq && acq.authorized === true) sub("uncertain", "asset not yet present: acquisition was authorized elsewhere; nothing is fetched here");
      else { sub("unavailable", "no source asset and acquisition is not authorized (spend / data transmission / rights); propose a supported visual idea instead"); errors.push(err(E.capability_unavailable, id, "no asset and no authorized acquisition: no hidden provider or stock fallback")); }
    } else {
      if (a.rights === "inspiration-only") { sub("unavailable", "inspiration-only asset cannot be a render source"); errors.push(err(E.capability_unavailable, id, "inspiration-only asset")); }
      else if (a.rights != null && !REUSABLE_RIGHTS.has(a.rights)) { sub("unavailable", `unknown rights "${a.rights}"`); errors.push(err(E.capability_unavailable, id, "rights not in owned|licensed|generated")); }
      else if (a.rights == null) sub("uncertain", "rights not recorded on the asset");
      if (a.rights_status && BAD_RIGHTS_STATUS.has(a.rights_status)) { sub("unavailable", `rights status ${a.rights_status}: unresolved is not permission`); errors.push(err(E.capability_unavailable, id, `rights ${a.rights_status}`)); }
      if (a.sensitive === true || s.sensitive === true) { sub("uncertain", "private-looking or sensitive content: existing privacy/source policy decides reuse"); review.rights.push({ subject: id, asset_id: a.id, note: "sensitive content flagged" }); }
      if (!a.sha256) sub("uncertain", "asset has no sha256 (source identity unverifiable)");
      const m = a.media || {};
      if (!(num(m.width) && num(m.height) && m.width > 0 && m.height > 0)) sub("uncertain", "asset media width/height unknown (resolution and aspect unchecked)");
      // unseen viewpoints: a single image cannot supply them
      const have = new Set(arr(a.views).map(String));
      if (!have.size) have.add("front");
      for (const v of arr(s.requires_views)) {
        if (!have.has(String(v))) { sub("unavailable", `view "${v}" is not in the source; a single image cannot honestly give unseen geometry`); errors.push(err(E.capability_unavailable, id, `unseen view "${v}"; needs an explicit supported asset method`)); }
      }
      if (s.requires_rotation === true && have.size < 2 && finish === "spatial") sub("unavailable", "rotation of a complex object from one image is not supported; a 2D card tilt is not a rotation");
    }

    // alpha / mask / depth / occlusion
    const needsAlpha = s.needs_alpha === true || rep === "silhouette" || arr(s.occludes).length > 0 || arr(s.occluded_by).length > 0;
    if (needsAlpha) {
      const mk = a && isObj(a.mask) ? a.mask : null;
      const hasAlpha = !!(a && a.has_alpha === true);
      const rec = { subject: id, asset_id: s.asset_id ?? null, source: mk ? "mask" : hasAlpha ? "alpha" : "none", ref: mk ? (mk.ref ?? mk.path ?? null) : null, sha256: mk ? (mk.sha256 ?? null) : null, inspected: !!((mk && mk.inspected === true) || (hasAlpha && a.alpha_inspected === true)), edge_quality: "not_inspected" };
      if (rec.inspected) rec.edge_quality = (mk && mk.edge_quality) || a.alpha_edge_quality || "inspected";
      (mk ? masks : alpha).push(rec);
      if (!mk && !hasAlpha) { sub("uncertain", "needs a matte or alpha and none exists; extraction is a later authorized step and its quality is unknown"); rec.edge_quality = "missing"; }
      else if (!rec.inspected) sub("uncertain", "mask/alpha edge never visually inspected: cutout quality is not demonstrated");
      if (mk && !mk.sha256) sub("uncertain", "mask has no sha256 (a path does not prove a clean cutout or its identity)");
      review.edge_identity.push({ subject: id, asset_id: s.asset_id ?? null, mask_sha256: rec.sha256, inspected: rec.inspected, check: "edge quality, identity across transformations" });
    }
    if (arr(s.occludes).length || arr(s.occluded_by).length) {
      for (const o of [...arr(s.occludes).map((x) => ({ with: x, dir: "in_front_of" })), ...arr(s.occluded_by).map((x) => ({ with: x, dir: "behind" }))]) {
        const rec = { subject: id, with: String(o.with), relation: o.dir, z: num(s.z_index) ? s.z_index : null, depth_ref: a && isObj(a.depth) ? (a.depth.ref ?? null) : null, needs_depth: finish === "spatial", evidence: "not_observed" };
        occlusion.push(rec);
        if (rec.needs_depth && !rec.depth_ref) sub("uncertain", `spatial occlusion with "${rec.with}" has no depth/matte reference; contact and edge relation unverified`);
        if (!subjectById.has(String(o.with)) && !arr(subjects).some((x) => x && String(x.id) === String(o.with))) sub("uncertain", `occlusion partner "${o.with}" is not a planned subject`);
      }
    }
    if (finish === "spatial") review.seams.push({ subject: id, check: "contact, depth order and light direction at the current temporal edge" });
    else review.seams.push({ subject: id, check: "flat language kept deliberately; do not force 3D lighting" });

    plan.subjects.push(entry);
    subjectById.set(id, entry);
    invalidation.subjects[id] = { asset_sha256: a ? a.sha256 ?? null : null, asset_media: a ? a.media ?? null : null, mask_sha256: a && isObj(a.mask) ? a.mask.sha256 ?? null : null, region_id: entry.region_id, anchor_id: entry.anchor_id, finish, representation: rep };
  }

  const seenCrop = new Set();
  for (const c of arr(crops)) {
    if (!isObj(c) || !c.id) { bad(E.stale_input, "crops", "crop without an id", "uncertain"); continue; }
    const id = String(c.id);
    if (seenCrop.has(id)) { bad(E.stale_input, id, "duplicate crop id", "uncertain"); continue; }
    seenCrop.add(id);
    const sub = subjectById.get(String(c.subject_id));
    const assetId = c.asset_id ?? (sub ? sub.asset_id : null);
    const a = A.get(String(assetId));
    const entry = { id, subject_id: c.subject_id ?? null, asset_id: assetId ?? null, rect: c.rect ?? null, region_id: c.region_id ?? null, representation: c.representation || "closeup", fit: c.fit || "cover", out: c.out ?? null, state: "available", reasons: [] };
    const cs = (st, reason) => { entry.state = worse(entry.state, st); entry.reasons.push(reason); state = worse(state, st); };
    if (!sub) cs("uncertain", `crop names unknown subject "${c.subject_id}"`);
    if (!FITS.includes(entry.fit)) { cs("unavailable", `fit "${entry.fit}" is not allowed (${FITS.join(", ")}); stretch is never planned`); errors.push(err(E.capability_unavailable, id, "stretch is not a supported fit")); }
    checkRef(id, "region", c.region_id);
    const rp = rectProblem(c.rect);
    if (rp) { cs("unavailable", rp); errors.push(err(E.stale_input, id, rp)); }
    if (!a) cs("uncertain", "crop source asset unknown: resolution and aspect unchecked");
    else if (!rp) {
      const m = a.media || {};
      if (num(m.width) && num(m.height) && isObj(c.out) && num(c.out.w) && num(c.out.h) && c.out.w > 0 && c.out.h > 0) {
        const sw = c.rect.w * m.width, sh = c.rect.h * m.height;
        const density = r4(Math.min(sw / c.out.w, sh / c.out.h));
        const srcAspect = sw / sh, outAspect = c.out.w / c.out.h;
        entry.density = density; entry.source_px = { w: Math.round(sw), h: Math.round(sh) }; entry.aspect = { source: r4(srcAspect), out: r4(outAspect) };
        if (density < 1) {
          if (c.accept_upscale === true && num(c.max_upscale) && 1 / density <= c.max_upscale) { cs("uncertain", `upscaled ${r4(1 / density)}x by explicit approval: fidelity is not claimed`); }
          else { cs("unavailable", `source covers ${Math.round(sw)}x${Math.round(sh)}px for a ${c.out.w}x${c.out.h} target (${r4(density)}x): report the limit or choose an approved alternative; do not stretch and claim fidelity`); errors.push(err(E.capability_unavailable, id, "resolution inadequate for this crop")); }
        }
        if (Math.abs(srcAspect / outAspect - 1) > 0.01) {
          if (entry.fit === "cover") { entry.aspect.note = "container aspect differs: cover trims the crop evenly, no distortion"; }
          else entry.aspect.note = "container aspect differs: contain letterboxes, no distortion";
          entry.preserve_aspect = true;
        }
        review.resolution.push({ crop: id, asset_id: a.id, density, source_px: entry.source_px, out: c.out });
      } else cs("uncertain", "crop output size or asset size unknown: resolution and aspect unchecked");
      // correspondence: a detail that purports to emerge from a part must lie over that part
      if (isObj(c.emerges_from)) {
        const pr = rectProblem(c.emerges_from.part_rect);
        if (pr) cs("uncertain", `emerges_from.part_rect: ${pr}`);
        else if (!inside(center(c.emerges_from.part_rect), c.rect) && !inside(center(c.rect), c.emerges_from.part_rect)) { cs("unavailable", "crop does not overlap the part it purports to show"); errors.push(err(E.material_deviation, id, "crop/source correspondence broken")); }
        entry.emerges_from = { part: c.emerges_from.part ?? null, part_rect: c.emerges_from.part_rect ?? null };
        review.crop_correspondence.push({ crop: id, subject: c.subject_id ?? null, part: entry.emerges_from.part, check: "the detail emerges from the same part of the same source" });
      }
    }
    plan.crops.push(entry);
    invalidation.crops[id] = { asset_sha256: a ? a.sha256 ?? null : null, rect: c.rect ?? null, out: c.out ?? null, region_id: entry.region_id, fit: entry.fit };
  }

  if (!plan.subjects.length && !plan.crops.length) { state = "uncertain"; unknown.push("no subjects or crops supplied"); }
  const digestBasis = { plan, masks, alpha, occlusion, invalidation, state };
  return { ok: !errors.length, plan, masks, alpha, occlusion, capabilityState: state, digest: "sha256:" + digestOf(digestBasis), invalidation, review, errors, warnings, unknown };
}
