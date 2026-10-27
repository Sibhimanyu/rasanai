// Medium registry (Part 2, M01): a DERIVED index of medium families and execution profiles over the existing style library.
// Canonical style references stay in library/styles/<slug>.md; optional metadata lives in library/styles/meta/<id>.json (one profile each,
// plus meta/_families.json for the family records). This module joins them with style frontmatter, real file references and capability
// records. It is not a second catalog: a style MD, a metadata file or a directory never makes anything executable. A profile is
// `implemented` only when it names runtime_refs and every one of them is a real file inside the skill; descriptions, remote popularity and
// metadata never set implemented / available / enabled / permitted / verified.
// Import-safe: no network, model, process, render or write. `readStyleRecords` / `readMediumMetadata` read files only when CALLED.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { SKILL_DIR, readFrontmatterDoc } from "./common.mjs";

export const MEDIUM_INDEX_FORMAT = "medium-index@1";
export const MEDIUM_PROFILE_FORMAT = "medium-profile@1";
export const MEDIUM_FAMILY_FORMAT = "medium-family@1";
// descriptive categories over the existing capability flags (Part 2, contract 8); not a new registry
export const MEDIUM_STATES = Object.freeze(["reference_only", "implemented_unvalidated", "verified_for_scope", "unavailable_here", "disabled", "not_permitted"]);
export const BASIS_VALUES = Object.freeze(["authored-unvalidated", "fixture-only", "verified-scope"]);
export const META_DIR = "library/styles/meta";

const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);
const str = (x, d = "") => (typeof x === "string" ? x : d);
const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const HEX64 = /^[0-9a-f]{64}$/i;
// text that marks a not-yet-real reference: never persisted as an implementation
const PLACEHOLDER = /(^|[\s/_-])(todo|tbd|fixme|placeholder|exact|registered|path\/to|your-|xxx)([\s/_.-]|$)|<[^>]*>|\.\.\.|^\s*$/i;

const err = (code, p, message) => ({ code, path: p, message });
const sortedUnique = (a) => [...new Set(a)].sort();
const stable = (v) => (Array.isArray(v) ? `[${v.map(stable).join(",")}]` : isObj(v) ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}` : JSON.stringify(v === undefined ? null : v));
const sha = (v) => createHash("sha256").update(stable(v)).digest("hex");

// A repo-relative path that stays inside the skill. -> {ok, reason}
export function safeSkillPath(ref) {
  const s = str(ref);
  if (!s || PLACEHOLDER.test(s)) return { ok: false, code: "placeholder_ref", reason: "empty or placeholder reference" };
  if (path.isAbsolute(s) || /^[a-z]+:/i.test(s) || s.includes("\\") || s.includes("\0")) return { ok: false, code: "escaping_path", reason: "must be a relative skill path" };
  const n = path.posix.normalize(s.split("#")[0]);
  if (n === ".." || n.startsWith("../") || n.startsWith("/")) return { ok: false, code: "escaping_path", reason: "path leaves the skill root" };
  return { ok: true, path: n };
}

// ---- reading (explicit calls only) ---------------------------------------------------------------------------
// -> [{id, name, source, source_url, license, one_line, file}] from library/styles/*.md frontmatter, sorted by id.
export function readStyleRecords(skillRoot = SKILL_DIR) {
  const dir = path.join(skillRoot, "library", "styles");
  const out = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".md") && x !== "README.md").sort()) {
    try {
      const { fields } = readFrontmatterDoc(fs.readFileSync(path.join(dir, f), "utf8"));
      if (str(fields.kind) !== "style-reference" || !str(fields.id)) continue;
      out.push({ id: fields.id, name: str(fields.name), source: str(fields.source), source_url: str(fields.source_url), license: str(fields.license), one_line: str(fields.one_line), file: `library/styles/${f}` });
    } catch { /* an unreadable style file is simply not a style record */ }
  }
  return out;
}

// -> {profiles:[...], families:[...], errors:[{file,message}]}. Files starting with "_" hold families ({families:[...]}); the rest are one profile each.
export function readMediumMetadata(skillRoot = SKILL_DIR) {
  const dir = path.join(skillRoot, META_DIR);
  const res = { profiles: [], families: [], errors: [] };
  let files = [];
  try { files = fs.readdirSync(dir).filter((x) => x.endsWith(".json")).sort(); } catch { return res; }
  for (const f of files) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      if (f.startsWith("_")) res.families.push(...arr(j.families));
      else res.profiles.push({ ...j, _meta_file: `${META_DIR}/${f}` });
    } catch (e) { res.errors.push({ file: `${META_DIR}/${f}`, message: e.message }); }
  }
  return res;
}

// ---- capability state ----------------------------------------------------------------------------------------
// The five states stay separate. `capability` is an existing record ({implemented:{value,reason},...} from capabilities.mjs, or its flat surface()).
const flag = (cap, key, flatKey) => {
  if (!isObj(cap)) return { value: null, reason: "no capability record" };
  const v = cap[key];
  if (isObj(v) && "value" in v) return { value: !!v.value, reason: str(v.reason) };
  if (flatKey && typeof cap[flatKey] === "boolean") return { value: cap[flatKey], reason: "" };
  return { value: null, reason: "not reported" };
};
export function capabilityStates(cap) {
  return {
    implemented: flag(cap, "implemented", "implemented"), available: flag(cap, "available", "available_on_host"),
    enabled: flag(cap, "enabled", "enabled"),
    permitted: isObj(cap) && isObj(cap.permitted) ? flag(cap, "permitted") : { value: isObj(cap) && typeof cap.permission_status === "string" ? ["granted", "per_job", "not_required"].includes(cap.permission_status) : null, reason: "" },
    verified: isObj(cap) && isObj(cap.verified) ? flag(cap, "verified") : { value: isObj(cap) && typeof cap.verification_status === "string" ? cap.verification_status === "verified" : null, reason: "" },
  };
}
// Descriptive category; "unknown" capability facts never read as available.
export function mediumState({ runtimeImplemented, states, basis }) {
  if (!runtimeImplemented) return "reference_only";
  if (states.enabled.value === false) return "disabled";
  if (states.permitted.value === false) return "not_permitted";
  if (states.available.value === false) return "unavailable_here";
  return states.verified.value === true && basis === "verified-scope" ? "verified_for_scope" : "implemented_unvalidated";
}

// ---- validation ----------------------------------------------------------------------------------------------
// context: {styleIds:Set|array, familyIds:Set|array, capabilityIds:Set|array, skillRoot, fileExists(rel)->bool, allowCustom:boolean}
// A named/custom style is a validated ORIGINAL profile (`custom:true`) that references only allowed current primitives (existing runtime files); it is never auto-installed.
export function validateMediumProfile(profile, context = {}) {
  const errors = [], warnings = [];
  const ctx = context || {};
  const set = (x) => (x instanceof Set ? x : new Set(arr(x)));
  const styleIds = set(ctx.styleIds), familyIds = set(ctx.familyIds), capIds = set(ctx.capabilityIds);
  const skillRoot = ctx.skillRoot || SKILL_DIR;
  const exists = typeof ctx.fileExists === "function" ? ctx.fileExists : (rel) => { try { return fs.existsSync(path.join(skillRoot, rel)); } catch { return false; } };
  const p = profile;
  if (!isObj(p)) return { ok: false, errors: [err("bad_type", "", "a medium profile is an object")], warnings };
  if (p.format !== MEDIUM_PROFILE_FORMAT) errors.push(err("bad_format", "format", `format must be ${MEDIUM_PROFILE_FORMAT}`));
  if (!ID.test(str(p.id))) errors.push(err("bad_id", "id", "id is a lowercase slug"));
  if (!ID.test(str(p.family_id))) errors.push(err("bad_id", "family_id", "family_id is a lowercase slug"));
  else if (familyIds.size && !familyIds.has(p.family_id)) errors.push(err("unknown_family", "family_id", `unknown family ${p.family_id}`));
  if (p.execution_id !== undefined && !ID.test(str(p.execution_id))) errors.push(err("bad_id", "execution_id", "execution_id is a lowercase slug"));
  if (!Array.isArray(p.style_refs)) errors.push(err("bad_type", "style_refs", "style_refs is an array of existing style ids"));
  else {
    if (!p.style_refs.length && !(p.custom === true && ctx.allowCustom)) errors.push(err("no_style_ref", "style_refs", "a profile names at least one existing style reference (custom original profiles need allowCustom)"));
    p.style_refs.forEach((s, i) => { if (styleIds.size && !styleIds.has(s)) errors.push(err("unknown_style_ref", `style_refs[${i}]`, `unknown style id ${JSON.stringify(s)}`)); });
    if (new Set(p.style_refs).size !== p.style_refs.length) errors.push(err("duplicate_alias", "style_refs", "style_refs repeats an id"));
  }
  for (const k of ["native_actions", "visual_material", "story_affordances", "risks", "asset_needs", "preferred_assignments", "hard_exclusions", "aliases", "example_refs", "runtime_refs"]) {
    if (p[k] !== undefined && !(Array.isArray(p[k]) && p[k].every((x) => typeof x === "string" || ((k === "hard_exclusions" || k === "asset_needs") && isObj(x))))) errors.push(err("bad_type", k, `${k} is an array of strings${k === "asset_needs" ? " or {id, kind, required, original_alternative, evidence} objects" : ""}`));
  }
  arr(p.aliases).forEach((a, i) => { if (!ID.test(str(a))) errors.push(err("bad_id", `aliases[${i}]`, "alias is a lowercase slug")); });
  if (new Set(arr(p.aliases)).size !== arr(p.aliases).length) errors.push(err("duplicate_alias", "aliases", "aliases repeat an id"));
  arr(p.hard_exclusions).forEach((h, i) => { if (!isObj(h) || !str(h.constraint) || !str(h.reason)) errors.push(err("bad_exclusion", `hard_exclusions[${i}]`, "a hard exclusion names an actual constraint and a reason: {constraint, reason}")); });
  for (const k of ["runtime_refs", "example_refs"]) {
    arr(p[k]).forEach((r, i) => {
      const s = safeSkillPath(r);
      if (!s.ok) return errors.push(err(s.code, `${k}[${i}]`, `${s.reason}: ${JSON.stringify(r)}`));
      if (k === "runtime_refs" && !exists(s.path)) errors.push(err("missing_runtime_ref", `runtime_refs[${i}]`, `${s.path} is not in this skill`));
      if (k === "example_refs" && !exists(s.path)) warnings.push(err("missing_example_ref", `example_refs[${i}]`, `${s.path} is not in this skill`));
    });
  }
  if (p.capability_ref !== null && p.capability_ref !== undefined) {
    if (!/^[a-z0-9][a-z0-9._-]*$/i.test(str(p.capability_ref)) || PLACEHOLDER.test(str(p.capability_ref))) errors.push(err("placeholder_ref", "capability_ref", "capability_ref must be an existing capability id"));
    else if (capIds.size && !capIds.has(p.capability_ref)) errors.push(err("unknown_capability_ref", "capability_ref", `no capability record ${p.capability_ref}`));
  }
  if (p.proof_policy !== undefined && !isObj(p.proof_policy)) errors.push(err("bad_type", "proof_policy", "proof_policy is an object"));
  const ev = p.evidence;
  if (ev !== undefined) {
    if (!isObj(ev) || !BASIS_VALUES.includes(ev.basis)) errors.push(err("bad_evidence", "evidence.basis", `basis is one of ${BASIS_VALUES.join(", ")}`));
    else if (ev.basis === "verified-scope" && !arr(ev.receipt_refs).length) errors.push(err("verified_without_receipt", "evidence.receipt_refs", "verified-scope needs a receipt; compiling or an upstream video is not evidence"));
  }
  if (p.verified === true && !(isObj(ev) && ev.basis === "verified-scope")) errors.push(err("verified_without_receipt", "verified", "verified:true needs evidence.basis verified-scope with receipts"));
  if (!arr(p.runtime_refs).length) warnings.push(err("not_executable", "runtime_refs", "no runtime_refs: reference only, never advertised as buildable"));
  return { ok: errors.length === 0, errors, warnings };
}

// ---- the index -----------------------------------------------------------------------------------------------
// {skillRoot, styleRecords, recipeIndex, capabilities, metadata:{profiles,families}, fileExists}
// recipeIndex (lib/recipe-index.mjs buildIndex()) is consulted only to confirm a runtime_ref that points at a catalog row ("motion-kit/catalog.json#<id>") is implemented.
// -> {format:'medium-index@1', records, families, excluded:[{id,reason}], source_digest}
export function buildMediumIndex({ skillRoot = SKILL_DIR, styleRecords = [], recipeIndex = null, capabilities = [], metadata = {}, fileExists } = {}) {
  const exists = typeof fileExists === "function" ? fileExists : (rel) => { try { return fs.existsSync(path.join(skillRoot, rel)); } catch { return false; } };
  const styles = new Map(arr(styleRecords).filter((s) => isObj(s) && s.id).map((s) => [s.id, s]));
  const caps = new Map((isObj(capabilities) && capabilities.details ? capabilities.details : arr(capabilities)).filter((c) => isObj(c) && c.id).map((c) => [c.id, c]));
  const recipes = new Map(arr(recipeIndex && recipeIndex.records).filter((r) => r && r.id).map((r) => [r.id, r]));
  const excluded = [];

  // families: first-class metadata even when nothing can execute
  const families = new Map();
  for (const f of arr(metadata.families)) {
    if (!isObj(f) || !ID.test(str(f.id))) { excluded.push({ id: str(f && f.id, "?"), reason: "family needs a slug id" }); continue; }
    if (families.has(f.id)) { excluded.push({ id: f.id, reason: "duplicate family id" }); continue; }
    families.set(f.id, f);
  }
  const familyIds = new Set(families.keys());
  const styleIds = new Set(styles.keys());
  const capIds = new Set(caps.keys());

  const claimed = new Map(); // id / execution / alias -> profile id
  const records = [];
  for (const raw of arr(metadata.profiles).slice().sort((a, b) => str(a && a.id).localeCompare(str(b && b.id)))) {
    const v = validateMediumProfile(raw, { styleIds, familyIds, capabilityIds: capIds, skillRoot, fileExists: exists, allowCustom: raw && raw.custom === true });
    if (!v.ok) { excluded.push({ id: str(raw && raw.id, "?"), reason: v.errors.map((e) => `${e.code} ${e.path}`).join("; ") }); continue; }
    const names = sortedUnique([raw.id, ...(raw.execution_id ? [raw.execution_id] : []), ...arr(raw.aliases)]);
    const clash = names.find((n) => claimed.has(n) && claimed.get(n) !== raw.id);
    if (clash) { excluded.push({ id: raw.id, reason: `duplicate_alias ${clash} (already ${claimed.get(clash)})` }); continue; }
    for (const n of names) claimed.set(n, raw.id);

    // implemented = every runtime ref is a real file or an implemented catalog row; an empty list is never implemented
    const refs = arr(raw.runtime_refs).map((r) => safeSkillPath(r).path);
    const refOk = (r) => { const [, row] = r.split("#"); if (row) { const rec = recipes.get(row); return !!rec && rec.implemented === true; } return exists(r); };
    const runtimeImplemented = refs.length > 0 && refs.every(refOk);
    const cap = raw.capability_ref ? caps.get(raw.capability_ref) || null : null;
    const states = capabilityStates(cap);
    if (!runtimeImplemented) states.implemented = { value: false, reason: refs.length ? "a runtime_ref is not implemented in this skill" : "no runtime_refs: described, not built" };
    else if (states.implemented.value === null) states.implemented = { value: true, reason: "" };
    const basis = isObj(raw.evidence) ? raw.evidence.basis : "authored-unvalidated";
    const state = mediumState({ runtimeImplemented, states, basis });
    const fam = families.get(raw.family_id);
    records.push({
      id: raw.id, family_id: raw.family_id, family_name: str(fam && fam.name), execution_id: str(raw.execution_id) || null, aliases: names.filter((n) => n !== raw.id),
      style_refs: arr(raw.style_refs).slice(), summary: str(raw.summary), visual_material: arr(raw.visual_material), native_actions: arr(raw.native_actions),
      story_affordances: arr(raw.story_affordances), risks: arr(raw.risks), proof_policy: isObj(raw.proof_policy) ? raw.proof_policy : {},
      runtime_refs: refs, example_refs: arr(raw.example_refs), asset_needs: arr(raw.asset_needs), capability_ref: raw.capability_ref || null,
      preferred_assignments: arr(raw.preferred_assignments), hard_exclusions: arr(raw.hard_exclusions),
      // integration fix: medium-fit reads text_constraints.unsupported_scripts from the record; it was not carried through
      ...(isObj(raw.text_constraints) ? { text_constraints: raw.text_constraints } : {}),
      state, implemented: runtimeImplemented, buildable: state === "implemented_unvalidated" || state === "verified_for_scope", verified: state === "verified_for_scope",
      capability_states: states, evidence: { basis, receipt_refs: arr(raw.evidence && raw.evidence.receipt_refs) },
      owner_lane: str(raw.owner_lane) || null, custom: raw.custom === true,
      // credit fields travel with the style reference they came from
      provenance: arr(raw.style_refs).map((s) => styles.get(s)).filter(Boolean).map((s) => ({ style_ref: s.id, source: s.source, source_url: s.source_url, license: s.license, file: s.file })),
      provenance_refs: arr(raw.provenance_refs), meta_file: str(raw._meta_file) || null,
      warnings: v.warnings.map((w) => w.code),
    });
  }
  records.sort((a, b) => a.id.localeCompare(b.id));

  const outFamilies = [...families.values()].sort((a, b) => a.id.localeCompare(b.id)).map((f) => {
    const members = records.filter((r) => r.family_id === f.id);
    const cands = arr(f.existing_reference_candidates);
    return {
      id: f.id, name: str(f.name), strength: str(f.strength), style_refs: sortedUnique(cands.filter((c) => styleIds.has(c))),
      unresolved_style_refs: sortedUnique(cands.filter((c) => !styleIds.has(c))), profile_ids: members.map((m) => m.id),
      buildable: members.some((m) => m.buildable), verified: false, // a family is never verified; only an execution profile can be, for one scope
    };
  });
  const body = { records, families: outFamilies, excluded: excluded.sort((a, b) => a.id.localeCompare(b.id)) };
  return { format: MEDIUM_INDEX_FORMAT, ...body, source_digest: sha({ body, styles: [...styles.values()].map((s) => [s.id, s.source, s.license]).sort() }) };
}

// -> {ok, profile, canonical_id, aliases, missing:[]}. Order: profile id, execution id / alias, then a style id that belongs to exactly one profile.
export function resolveMediumProfile(index, id) {
  const recs = arr(index && index.records);
  const q = str(id).trim().toLowerCase();
  const fail = (code, message, missing = [q]) => ({ ok: false, profile: null, canonical_id: null, aliases: [], missing, code, message });
  if (!q) return fail("unknown_id", "no medium id given", []);
  const hit = recs.find((r) => r.id === q) || recs.find((r) => r.aliases.includes(q));
  if (hit) return { ok: true, profile: hit, canonical_id: hit.id, aliases: hit.aliases.slice(), missing: [] };
  const byStyle = recs.filter((r) => r.style_refs.includes(q));
  if (byStyle.length === 1) return { ok: true, profile: byStyle[0], canonical_id: byStyle[0].id, aliases: byStyle[0].aliases.slice(), missing: [] };
  if (byStyle.length > 1) return fail("ambiguous_style_ref", `style ${q} belongs to several profiles: ${byStyle.map((r) => r.id).join(", ")}`, []);
  return fail("unknown_id", `no medium profile or alias ${JSON.stringify(q)}`);
}

// compact retrieval record: no guides, no source code
export function mediumSummary(profile) {
  const p = isObj(profile) ? profile : {};
  return {
    id: str(p.id), family_id: str(p.family_id), execution_id: p.execution_id || null, summary: str(p.summary),
    native_actions: arr(p.native_actions).slice(0, 8), risks: arr(p.risks).slice(0, 4), state: str(p.state, "reference_only"),
    buildable: p.buildable === true, verified: p.verified === true, style_refs: arr(p.style_refs).slice(), asset_needs: arr(p.asset_needs).slice(),
    hard_exclusions: arr(p.hard_exclusions).map((h) => (isObj(h) ? h.constraint : String(h))),
  };
}
