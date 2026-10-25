// Plan 12 D2: variants are revision-scoped DESCENDANTS of approved artifacts, not export toggles.
//
//   variantRecord()     the record: parent revision (story / look / storyboard / score digests), profile pin, locale, beats with
//                       a disposition (retained | shortened | removed | new), claim ids carried, assets and translations depended on
//   diffBeats()         recompute the dispositions from the parent's beats and the variant's beats; claim ids never change silently
//   approvalNeeded()    a NEW claim or a substantially different narrative needs the proper approval (not an export toggle)
//   reflowPlan()        vertical / square layouts: focal subject + readable proof survive; recompose, never blind-centre-crop
//   cropCheck()         a crop that drops the result or the qualifier is rejected; a cropped real screenshot stays labelled a crop
//   invalidate()        which variants a shared-asset / translation / copy / aspect change makes stale (others are untouched)
//   mutedSafe()         essential meaning survives with sound off, through visible text or captions (not redundant big headings)
// Timing after a copy or layout change goes through lib/timing.mjs `reconcile` and `commitTiming` (the score is the one authority).
// Pure functions plus small atomic file helpers under <run>/delivery/variants/.
import fs from "node:fs";
import path from "node:path";
import { SCHEMA_VERSION, canonicalDigest } from "./contracts.mjs";
import { impact } from "./impact.mjs";
import { atomicWrite } from "./recovery.mjs";

const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);
const str = (x, d = "") => (typeof x === "string" ? x : d);
const uniq = (a) => [...new Set(a)];

export const DISPOSITIONS = Object.freeze(["retained", "shortened", "removed", "new"]);
export const variantsDir = (run) => path.join(path.resolve(String(run)), "delivery", "variants");

// beats: [{ id, claim_ids?, duration_s?, copy_ids?, asset_ids?, narrative_role? }]
export function diffBeats(parentBeats, variantBeats, { tolerance_s = 0.05 } = {}) {
  const P = new Map(arr(parentBeats).map((b) => [b.id, b])), V = new Map(arr(variantBeats).map((b) => [b.id, b]));
  const rows = [];
  for (const [id, p] of P) {
    const v = V.get(id);
    if (!v) { rows.push({ beat_id: id, disposition: "removed", claim_ids: arr(p.claim_ids), parent_duration_s: p.duration_s ?? null }); continue; }
    const shorter = Number.isFinite(p.duration_s) && Number.isFinite(v.duration_s) && v.duration_s < p.duration_s - tolerance_s;
    const changedCopy = canonicalDigest(arr(p.copy_ids).slice().sort()) !== canonicalDigest(arr(v.copy_ids).slice().sort()) && arr(v.copy_ids).length < arr(p.copy_ids).length;
    rows.push({ beat_id: id, disposition: shorter || changedCopy ? "shortened" : "retained", claim_ids: arr(v.claim_ids), parent_duration_s: p.duration_s ?? null, duration_s: v.duration_s ?? null });
  }
  for (const [id, v] of V) if (!P.has(id)) rows.push({ beat_id: id, disposition: "new", claim_ids: arr(v.claim_ids), duration_s: v.duration_s ?? null });
  const parentClaims = uniq(arr(parentBeats).flatMap((b) => arr(b.claim_ids)));
  const variantClaims = uniq(arr(variantBeats).flatMap((b) => arr(b.claim_ids)));
  const newClaims = variantClaims.filter((c) => !parentClaims.includes(c));
  const droppedClaims = parentClaims.filter((c) => !variantClaims.includes(c));
  const count = (d) => rows.filter((r) => r.disposition === d).length;
  return { rows, counts: { retained: count("retained"), shortened: count("shortened"), removed: count("removed"), new: count("new") }, new_claims: newClaims, dropped_claims: droppedClaims, order_changed: orderChanged(parentBeats, variantBeats) };
}
function orderChanged(a, b) {
  const pa = arr(a).map((x) => x.id), vb = arr(b).map((x) => x.id);
  const common = pa.filter((id) => vb.includes(id)), commonV = vb.filter((id) => pa.includes(id));
  return canonicalDigest(common) !== canonicalDigest(commonV);
}

// A new claim, a new beat that carries a claim, a reordered argument or more than `max_new_share` of new beats is not an adaptation.
export function approvalNeeded(diff, { max_new_share = 0.25, narrative_change = false } = {}) {
  const reasons = [];
  if (diff.new_claims.length) reasons.push(`new claim id(s): ${diff.new_claims.join(", ")}: each needs the ledger's evidence and the story approval`);
  const newBeats = diff.rows.filter((r) => r.disposition === "new");
  const carrying = newBeats.filter((r) => arr(r.claim_ids).length);
  if (carrying.length && !diff.new_claims.length) reasons.push("a new beat carries an existing claim in a new place: the story owner should confirm the argument still holds");
  if (diff.rows.length && newBeats.length / diff.rows.length > max_new_share) reasons.push(`${newBeats.length} of ${diff.rows.length} beats are new: this is a different narrative, not a variant`);
  if (diff.order_changed) reasons.push("the beats were reordered: a different argument order needs the story approval");
  if (narrative_change) reasons.push("the requester marked the narrative as substantially different");
  if (diff.dropped_claims.length) reasons.push(`claim(s) dropped: ${diff.dropped_claims.join(", ")}; allowed if the qualifier-bearing claims that remain still stand alone (listed so the owner can see it)`);
  const blocking = reasons.filter((r) => !r.startsWith("claim(s) dropped"));
  return { needs_approval: blocking.length > 0, approval_stage: blocking.length ? "story" : null, reasons };
}

// parent: { story_digest, look_digest, storyboard_digest, score_revision, approvals?: [{stage, digest}] } (the digests the parent was approved at)
export function variantRecord({ id, parent, profile, locale = null, beats = [], parentBeats = [], reasons = [], assets = [], translations = [], needs = [], narrative_change = false } = {}) {
  const diff = diffBeats(parentBeats, beats);
  const appr = approvalNeeded(diff, { narrative_change });
  const rec = {
    schema_version: SCHEMA_VERSION, id: str(id), kind: "variant",
    parent: { story_digest: parent && parent.story_digest || null, look_digest: parent && parent.look_digest || null, storyboard_digest: parent && parent.storyboard_digest || null, score_revision: parent && parent.score_revision || null, creative_revision: parent && parent.creative_revision || null },
    profile: { id: profile && profile.id, version: profile && profile.version, digest: profile && profile.profile_digest || null },
    locale, needs: arr(needs), reasons: arr(reasons),
    beats: diff.rows, claim_ids: uniq(arr(beats).flatMap((b) => arr(b.claim_ids))),
    depends_on: { asset_ids: uniq(arr(assets)), translation_ids: uniq(arr(translations)) },
    approval: { ...appr, state: appr.needs_approval ? "pending_story_approval" : "inherited_from_parent" },
    status: appr.needs_approval ? "blocked_on_approval" : "planned", created_at: new Date().toISOString(),
  };
  rec.digest = canonicalDigest({ p: rec.parent, pr: rec.profile, l: locale, b: rec.beats, d: rec.depends_on }).slice(0, 16);
  return rec;
}
export function writeVariant(run, rec) { const f = path.join(variantsDir(run), `${rec.id}.json`); atomicWrite(f, JSON.stringify(rec, null, 2) + "\n"); return f; }
export function readVariants(run) {
  let names = []; try { names = fs.readdirSync(variantsDir(run)).filter((n) => n.endsWith(".json")); } catch { return []; }
  return names.map((n) => { try { return JSON.parse(fs.readFileSync(path.join(variantsDir(run), n), "utf8")); } catch { return null; } }).filter(Boolean);
}

// ---- reflow: recompose, do not centre-crop --------------------------------------------------------------------------------------------------
const aspectNum = (a) => { const m = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(str(a)); return m ? Number(m[1]) / Number(m[2]) : null; };
// elements: [{ id, kind: "ui"|"screenshot"|"text"|"logo"|"media"|"chart"|"caption", role?: "focal"|"proof"|"result"|"qualifier"|"support", box:{x,y,w,h} (fractions of the parent frame), real?: bool }]
export function reflowPlan({ parent_aspect, target_aspect, elements = [] } = {}) {
  const pa = aspectNum(parent_aspect), ta = aspectNum(target_aspect);
  if (!pa || !ta) return { ok: false, problems: ["aspect must look like 16:9"] };
  if (Math.abs(pa - ta) < 0.01) return { ok: true, strategy: "none", note: "same aspect: no reflow", steps: [] };
  const must = elements.filter((e) => ["focal", "proof", "result", "qualifier"].includes(e.role));
  const steps = [], problems = [];
  for (const e of elements) {
    const keep = ["focal", "proof", "result", "qualifier"].includes(e.role);
    if (e.kind === "ui" || e.kind === "screenshot") {
      const step = { id: e.id, action: "recompose", how: ta < pa ? "stack the interface region and its result vertically, or move to a tighter panel; the qualifier stays beside the result it qualifies" : "re-centre on the focal region at readable size", keeps: keep ? e.role : null };
      if (e.kind === "screenshot" || e.real) { step.label = "crop"; step.note = "a real screenshot is only ever cropped or scaled: the interface is not redrawn, and the crop is labelled as a crop in the manifest"; }
      steps.push(step);
    } else if (e.kind === "text" || e.kind === "caption") steps.push({ id: e.id, action: "relayout", how: "re-run text fitting for the new frame and safe regions" });
    else if (e.kind === "logo") steps.push({ id: e.id, action: "reposition", how: "keep orientation, clear space and minimum size from the brand contract" });
    else steps.push({ id: e.id, action: keep ? "keep_in_frame" : "reposition", how: "keep the subject inside the new frame" });
  }
  if (!must.some((e) => e.role === "focal")) problems.push("no element is marked focal: the plan cannot promise to preserve the focal subject");
  return { ok: !problems.length, strategy: "recompose_via_design_system", steps, problems, preserves: must.map((e) => ({ id: e.id, role: e.role })), regenerates_assets: false, regenerates_story: false };
}

const area = (b) => Math.max(0, b.w) * Math.max(0, b.h);
const overlap = (a, b) => { const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)), y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)); return x * y; };
// crop: {x,y,w,h} fractions of the source; must: elements that have to stay readable (result, qualifier, proof, focal)
export function cropCheck({ crop, elements = [], min_visible = 0.98 } = {}) {
  const problems = [];
  if (!isObj(crop) || !(crop.w > 0 && crop.h > 0)) return { ok: false, problems: ["no crop rectangle"] };
  for (const e of elements) {
    if (!isObj(e.box) || !area(e.box)) continue;
    const must = ["result", "qualifier", "proof", "focal"].includes(e.role);
    const seen = overlap(crop, e.box) / area(e.box);
    if (must && seen < min_visible) problems.push({ id: e.id, role: e.role, visible: Math.round(seen * 100) / 100, why: `the crop shows ${Math.round(seen * 100)}% of the ${e.role}: a centre-crop that drops the ${e.role} is rejected; recompose instead` });
  }
  // a qualifier must stay with its result: if the result is visible and its qualifier is not, the claim is misrepresented
  const result = elements.find((e) => e.role === "result"), qual = elements.find((e) => e.role === "qualifier");
  if (result && qual && overlap(crop, result.box) / (area(result.box) || 1) >= min_visible && overlap(crop, qual.box) / (area(qual.box) || 1) < min_visible && !problems.some((p) => p.id === qual.id)) problems.push({ id: qual.id, role: "qualifier", why: "the result is shown without its qualifier" });
  const labelled = elements.filter((e) => e.kind === "screenshot" || e.real).map((e) => ({ id: e.id, label: "crop", note: "a cropped real screenshot is a crop, not a rewritten interface" }));
  return { ok: !problems.length, problems, labelled };
}

// ---- invalidation ---------------------------------------------------------------------------------------------------------------------------
// change: { kind: "shared_asset"|"translation"|"copy"|"aspect"|"profile"|"locale_glossary", ids?: [], locale? }
// -> { stale: [variantId], keep: [variantId], per: {id: why}, stage_impact }. Only variants that depend on the change are stale; accepted exports are never touched.
export function invalidate(variants, change) {
  const per = {}, ids = new Set(arr(change.ids));
  for (const v of arr(variants)) {
    const d = v.depends_on || {};
    let why = null;
    if (change.kind === "shared_asset" && arr(d.asset_ids).some((a) => ids.has(a))) why = "uses a changed shared asset";
    else if (change.kind === "translation" && arr(d.translation_ids).some((t) => ids.has(t))) why = "uses a changed translation";
    else if (change.kind === "locale_glossary" && change.locale && v.locale === change.locale) why = `pronunciation glossary for ${change.locale} changed`;
    else if (change.kind === "copy" && arr(v.beats).some((b) => ids.has(b.beat_id))) why = "a beat's copy changed";
    else if (change.kind === "aspect" && (!change.profile_id || (v.profile && v.profile.id === change.profile_id))) why = "its layout depends on the changed aspect";
    else if (change.kind === "profile" && v.profile && ids.has(v.profile.id)) why = "its destination profile changed (offer a migration; the accepted export is not changed)";
    if (why) per[v.id] = why;
  }
  const stale = Object.keys(per);
  const stage = change.kind === "aspect" ? impact("build", [], {}) : change.kind === "copy" ? impact("storyboard", [...ids], {}) : change.kind === "translation" ? impact("storyboard", [...ids], {}) : impact("final", [], { encoding: true });
  return { stale, keep: arr(variants).map((v) => v.id).filter((id) => !(id in per)), per, stage_impact: { stale: stage.stale, keep: stage.keep, reason: stage.reason }, regenerates_valid_assets: false, regenerates_research: false, regenerates_story: false, accepted_exports_untouched: true };
}

// ---- muted-safe ------------------------------------------------------------------------------------------------------------------------------
// meanings: [{ id, essential: bool, via_voice: bool, visible_text?: bool, caption?: bool, visual?: bool }]
export function mutedSafe(meanings) {
  const lost = arr(meanings).filter((m) => m.essential && !(m.visible_text || m.caption || m.visual));
  return { ok: !lost.length, lost: lost.map((m) => m.id), note: lost.length ? "these essential meanings exist only in sound: add captions or visible content (a big heading is not required)" : "every essential meaning has a visible carrier" };
}
