// Plan 11 R5/R8: factual and brand authority end to end, and rights as DEPENDENCIES.
//
//   stampClaim(item, record)         put the claim-ledger id (and the digest of what it said) on a script beat / storyboard shot / graphic / caption / translation / delivery item
//   carryCheck({ledger, items})      every claim-bearing item names a ledger id; the id exists, may be used, is fresh and has not changed since the item was stamped; its numbers and
//                                    protected text survived the fitting, shortening or translation
//   numberDrift(source, text, o)     numbers and units compared by VALUE (locale separators, non-Latin digits, unit aliases): a figure may be re-formatted, never changed
//   mediaAuthority(layers)           a video or image model never draws a logo, screenshot, chart, UI or factual demonstration; editorial reconstructions are labelled
//   brandAssetUse(use, asset)        approved role, clear space, minimum size, forbidden modifications; an override needs the owner's approval record
//   referenceUse(ref)                inspiration is not permission to reuse another creator's footage, music, typeface or code
//   deliveryProvenance(...)          what a delivered film depends on: claim ids, assets with rights status, labelled reconstructions
//   rights store (crew/rights.jsonl) recordRights / rightsStatus / authorizationFor / rightsGate: a withdrawn permission stops UNAUTHORIZED REUSE (artifact-cache validateHit consults
//                                    authorization.allowed) and offers the owner remediation; it never deletes source work
// No model, no network, no I/O except the rights file under the run.
import fs from "node:fs";
import path from "node:path";
import { canonicalDigest } from "./contracts.mjs";
import { checkProtected, freshness, FRESHNESS_DAYS } from "./evidence.mjs";
import { appendJsonl, readJsonl } from "./recovery.mjs";

const arr = (x) => (Array.isArray(x) ? x : []);
const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const str = (x) => (typeof x === "string" ? x : "");

// ---- claim ids carried through every stage --------------------------------------------------------------------------------------------
export const CARRIERS = Object.freeze(["script_beats", "storyboard_shots", "graphics", "captions", "translations", "delivery"]);
export const claimDigest = (rec) => canonicalDigest({ a: rec && rec.assertion, q: rec && rec.qualification, s: rec && rec.source }).slice(0, 16); // same basis as evidence.evidenceRefs
export function stampClaim(item, rec) {
  if (!rec || !rec.id) return { ...item };
  return { ...item, claim_ids: [...new Set([...arr(item && item.claim_ids), rec.id])], claim_digests: { ...(isObj(item && item.claim_digests) ? item.claim_digests : {}), [rec.id]: claimDigest(rec) } };
}
const idsOf = (it) => [...new Set([...arr(it && it.claim_ids), ...(it && it.claim_ref ? [it.claim_ref] : [])])];

// ---- numbers and units: compared by value -----------------------------------------------------------------------------------------------
const ZEROS = [0x30, 0x660, 0x6f0, 0x966, 0x9e6, 0xa66, 0xae6, 0xb66, 0xbe6, 0xc66, 0xce6, 0xd66, 0xe50, 0xed0, 0xf20, 0x1040, 0xff10];
const asciiDigits = (s) => String(s).replace(/\p{Nd}/gu, (ch) => { const cp = ch.codePointAt(0); const z = ZEROS.find((x) => cp >= x && cp <= x + 9); return z === undefined ? ch : String(cp - z); });
const UNIT_ALIAS = { percent: "%", "per cent": "%", "٪": "%", "％": "%", "×": "x", times: "x", sec: "s", secs: "s", seconds: "s", second: "s", min: "min", mins: "min", minutes: "min", minute: "min", hrs: "h", hr: "h", hours: "h", hour: "h", days: "d", day: "d", gb: "gb", mb: "mb", kb: "kb", ms: "ms" };
const unitOf = (u) => { const k = String(u || "").trim().toLowerCase(); return UNIT_ALIAS[k] || k; };
// "1,200" -> {1200} or {1.2}: a lone separator followed by exactly three digits is a thousands separator in one locale and a decimal in another, so BOTH readings are kept
function candidates(raw) {
  const s = raw.replace(/[\s  ']/g, "");
  const out = new Set();
  const add = (n) => { if (Number.isFinite(n)) out.add(Number(n.toPrecision(12))); };
  const dots = (s.match(/\./g) || []).length, commas = (s.match(/,/g) || []).length;
  if (!dots && !commas) add(Number(s));
  else if (dots && commas) { const dec = s.lastIndexOf(".") > s.lastIndexOf(",") ? "." : ","; const grp = dec === "." ? "," : "."; add(Number(s.split(grp).join("").replace(dec, "."))); }
  else { const sep = dots ? "." : ",", n = dots || commas; const parts = s.split(sep); const lastLen = parts[parts.length - 1].length;
    if (n > 1) add(Number(parts.join(""))); // 1.234.567
    else if (lastLen === 3) { add(Number(parts.join(""))); add(Number(parts[0] + "." + parts[1])); } // thousands separator or decimal point: both readings are kept
    else add(Number(parts[0] + "." + parts[1])); }
  return out;
}
const QTY = /(\d{1,3}(?:[\u00a0\u202f' ]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)*)\s*(%|٪|％|×|x\b|percent\b|per cent\b|times\b|ms\b|s\b|secs?\b|seconds?\b|mins?\b|minutes?\b|hrs?\b|hours?\b|days?\b|[kmbg]b?\b)?/giu;
export function quantities(text) {
  const out = [];
  for (const m of asciiDigits(text).matchAll(QTY)) out.push({ raw: m[0].trim(), values: candidates(m[1]), unit: unitOf(m[2]) });
  return out;
}
// source: approved text. text: the shortened / fitted / translated text. opts.number_map: [{ from: "10x", to: "10 مرات" }] human-approved exceptions.
// -> { ok, drift:[{ source, why }] } . Every source quantity must appear in the target with the same value (any locale reading) and unit; extra new numbers are reported too.
export function numberDrift(source, text, { number_map = [] } = {}) {
  const src = quantities(source), tgt = quantities(text), used = new Set(), drift = [];
  const mapped = new Set(arr(number_map).map((m) => asciiDigits(str(m.from)).toLowerCase()));
  for (const q of src) {
    if (mapped.has(q.raw.toLowerCase())) continue;
    const i = tgt.findIndex((t, k) => !used.has(k) && t.unit === q.unit && [...q.values].some((v) => t.values.has(v)));
    if (i >= 0) used.add(i); else drift.push({ source: q.raw, why: `the number ${q.raw} (unit ${q.unit || "none"}) is missing or changed` });
  }
  tgt.forEach((t, k) => { if (!used.has(k) && !arr(number_map).some((m) => asciiDigits(str(m.to)).toLowerCase().includes(t.raw.toLowerCase()))) drift.push({ source: null, why: `a number ${t.raw} appears that the approved text does not contain` }); });
  return { ok: !drift.length, drift };
}

// items: { script_beats, storyboard_shots, graphics, captions, translations, delivery }: arrays of { id, text?, claim_ids?, claim_digests?, makes_claim?, source_text?, number_map?, locale? }
// ledger: evidence records (lib/evidence.mjs evidenceRecord shape). -> { ok, problems:[{carrier,item,problem}], carried:{ids,...} }
export function carryCheck({ ledger = [], items = {}, now = Date.now(), policy = FRESHNESS_DAYS } = {}) {
  const byId = new Map(arr(ledger).map((r) => [r.id, r]));
  const problems = [], carried = new Set();
  for (const carrier of CARRIERS) for (const it of arr(items[carrier])) {
    const ids = idsOf(it), label = it && (it.id ?? it.n ?? "?");
    const bad = (problem, extra = {}) => problems.push({ carrier, item: label, problem, ...extra });
    const text = str(it && it.text);
    const hasNumbers = quantities(text).some((q) => q.unit || [...q.values].some((v) => v >= 10)); // a figure: has a unit or is 10 or more ("step 2" is not a claim)
    if (!ids.length) { if (it && (it.makes_claim === true || (hasNumbers && it.makes_claim !== false && carrier !== "translations"))) bad("claim_without_ledger_id", { note: "a statement of fact or a figure must name its claim-ledger id (or be marked makes_claim: false)" }); continue; }
    for (const id of ids) {
      carried.add(id);
      const rec = byId.get(id);
      if (!rec) { bad("unknown_claim_id", { id }); continue; }
      if (rec.type === "synthetic_example" || rec.permitted_use === "none") bad("claim_not_permitted", { id, permitted_use: rec.permitted_use, type: rec.type });
      const fr = freshness(rec, { now, policy }); if (fr && fr.fresh === false) bad("claim_stale", { id, detail: fr.reason || null });
      const was = it.claim_digests && it.claim_digests[id];
      if (was && was !== claimDigest(rec)) bad("claim_changed_since_stamped", { id, note: "the ledger entry changed after this item was written: re-confirm the item against it" });
      const base = str(it.source_text) || str(rec.assertion);
      if (text && base) {
        const nd = numberDrift(base, text, { number_map: it.number_map });
        if (!nd.ok && (carrier === "translations" || str(it.source_text) || hasNumbers)) for (const d of nd.drift) bad("number_drift", { id, detail: d.why });
        const pr = checkProtected(rec, it.source_text ? text : text);
        if (!pr.ok && carrier !== "translations" && carrier !== "captions") bad("protected_text_missing", { id, missing: pr.missing });
      }
    }
  }
  return { ok: !problems.length, problems, carried: [...carried].sort() };
}

// ---- no invented logos, screenshots, charts ------------------------------------------------------------------------------------------------
const GENERATED = new Set(["video_model", "image_model", "generative"]);
const MUST_BE_DETERMINISTIC = new Set(["logo", "wordmark", "screenshot", "ui", "chart", "graph", "data_text", "factual_demo", "product_demo"]);
// layers: [{ id, source, depicts:[...], asset_sha?, brand_asset_id?, editorial_reconstruction?, visible_label?, supported_behavior?, performance_claim? }]
export function mediaAuthority(layers) {
  const problems = [];
  for (const l of arr(layers)) {
    const bad = (problem, extra = {}) => problems.push({ layer: l && l.id, problem, ...extra });
    const dep = arr(l && l.depicts).map((x) => String(x).toLowerCase());
    if (GENERATED.has(l && l.source)) { const hit = dep.filter((d) => MUST_BE_DETERMINISTIC.has(d)); if (hit.length) bad("generated_model_depicts_exact_asset", { depicts: hit, fix: "composite the verified brand / UI / chart asset as a deterministic layer over the generated plate" }); }
    if (l && l.source === "deterministic" && dep.some((d) => ["logo", "wordmark", "screenshot", "ui"].includes(d)) && !(l.asset_sha || l.brand_asset_id)) bad("exact_asset_without_source", { fix: "name the verified asset (sha256 or brand asset id) this layer was built from" });
    if (l && l.editorial_reconstruction) {
      if (!str(l.visible_label)) bad("reconstruction_unlabelled", { fix: "label an editorial reconstruction of a UI sequence in the film or its delivery notes" });
      if (l.supported_behavior !== true) bad("reconstruction_behavior_unverified", { fix: "it may only depict behaviour the product is known to support" });
      if (l.performance_claim) bad("reconstruction_makes_performance_claim", { claim: String(l.performance_claim).slice(0, 80) });
    }
  }
  return { ok: !problems.length, problems };
}

// ---- brand assets and references -----------------------------------------------------------------------------------------------------------------
// asset: { id, role, allowed_roles?, clear_space_ratio?, min_size_px?, forbidden_modifications?: [], rights? }   use: { asset_id, role, size_px?, clear_space_ratio?, modifications?: [], override?: { approval_id } }
export function brandAssetUse(use, asset) {
  const p = [];
  if (!asset) return { ok: false, problems: ["the asset is not in the approved brand manifest"] };
  const roles = arr(asset.allowed_roles).length ? asset.allowed_roles : [asset.role].filter(Boolean);
  if (use.role && roles.length && !roles.includes(use.role)) p.push(`role ${use.role} is not approved for this asset (approved: ${roles.join(", ")})`);
  if (asset.clear_space_ratio != null && use.clear_space_ratio != null && use.clear_space_ratio < asset.clear_space_ratio) p.push(`clear space ${use.clear_space_ratio} is under the required ${asset.clear_space_ratio}`);
  if (asset.min_size_px != null && use.size_px != null && use.size_px < asset.min_size_px) p.push(`size ${use.size_px}px is under the minimum ${asset.min_size_px}px`);
  const forbid = new Set(arr(asset.forbidden_modifications).map(String));
  const hit = arr(use.modifications).filter((m) => forbid.has(String(m)));
  if (hit.length && !(use.override && use.override.approval_id)) p.push(`forbidden modification(s): ${hit.join(", ")}; a change to the brand contract needs the owner's approval record, not a worker override`);
  return { ok: !p.length, problems: p };
}
const REUSE_OK = new Set(["owned", "licensed", "cc0", "public_domain", "cc_by", "written_permission"]);
// ref: { id, kind: "inspiration"|"reuse", asset_type, rights?: { permission, source } }
export function referenceUse(ref) {
  if (!ref || ref.kind !== "reuse") return { ok: true, note: "inspiration: patterns and principles only; nothing of the reference's own footage, music, typefaces or code is reused" };
  const perm = ref.rights && ref.rights.permission;
  return REUSE_OK.has(perm) && ref.rights.source ? { ok: true } : { ok: false, problems: [`reusing another creator's ${ref.asset_type || "material"} needs recorded permission and its source; inspiration is not permission`] };
}

// ---- rights as dependencies ----------------------------------------------------------------------------------------------------------------------
const rightsFile = (run) => path.join(path.resolve(String(run)), "crew", "rights.jsonl");
export const RIGHTS_STATUS = Object.freeze(["granted", "withdrawn", "expired", "unresolved"]);
// event: { asset_id, status, scope?: "project"|"user", source?, reason?, by? }
export function recordRights(run, event) {
  if (!event || !event.asset_id || !RIGHTS_STATUS.includes(event.status)) return { ok: false, reason: "asset_id and a status of " + RIGHTS_STATUS.join("|") + " are required" };
  const row = { schema_version: 1, at: new Date().toISOString(), asset_id: String(event.asset_id), status: event.status, scope: event.scope || "project", source: event.source || null, reason: event.reason ? String(event.reason).slice(0, 300) : null, by: event.by || "owner" };
  appendJsonl(rightsFile(run), row, { sync: true });
  return { ok: true, row };
}
export function rightsStatus(run, assetId) {
  let cur = null; for (const e of readJsonl(rightsFile(run)).events) if (e.asset_id === assetId) cur = e;
  return cur ? { status: cur.status, since: cur.at, reason: cur.reason } : { status: "unresolved", since: null, reason: "no rights record: unresolved is not permission" };
}
// for lib/artifact-cache.mjs validateHit: wanted.authorization = authorizationFor(run, refs). refs: asset ids the cached entry depends on.
export function authorizationFor(run, refs = []) {
  const blocked = arr(refs).map((id) => ({ id, ...rightsStatus(run, id) })).filter((r) => ["withdrawn", "expired"].includes(r.status));
  return { allowed: !blocked.length, blocked };
}
export const REMEDIATION = Object.freeze(["replace the asset (the film's structure and approvals are kept)", "ask the rights holder again and record the new permission", "export the film without the affected layer", "keep the source work as it is: nothing was deleted"]);

// the manifest a delivery carries. items as in carryCheck; assets: [{ id, sha256, role, licence?, source? }]
export function deliveryProvenance({ ledger = [], items = {}, assets = [], layers = [], run = null, version = null } = {}) {
  const car = carryCheck({ ledger, items });
  const media = mediaAuthority(layers);
  const assetRows = arr(assets).map((a) => ({ id: a.id, sha256: a.sha256 || null, role: a.role || null, licence: a.licence || null, source: a.source || null, rights: run ? rightsStatus(run, a.id).status : "unchecked" }));
  return {
    schema_version: 1, version, claim_ids: car.carried, assets: assetRows,
    reconstructions: arr(layers).filter((l) => l && l.editorial_reconstruction).map((l) => ({ layer: l.id, label: l.visible_label || null })),
    checks: { claims: { ok: car.ok, problems: car.problems }, media_authority: media },
    ok: car.ok && media.ok && assetRows.every((a) => ["granted", "unchecked"].includes(a.rights)),
  };
}
// the delivery gate over a manifest: unresolved or withdrawn rights block publication of a NEW final (they never touch existing files)
export function rightsGate(manifest) {
  const blocked = arr(manifest && manifest.assets).filter((a) => !["granted", "unchecked"].includes(a.rights));
  return { ok: !blocked.length, blocked: blocked.map((a) => ({ id: a.id, rights: a.rights })), remediation: blocked.length ? REMEDIATION : [] };
}
