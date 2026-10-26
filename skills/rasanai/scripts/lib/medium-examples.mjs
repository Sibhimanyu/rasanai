// Worked-example retrieval by medium AND communication problem (Part 2, M08). implemented_unvalidated.
// The index is DERIVED, not another catalog to maintain: it reads the `creative-example@1` metadata the runtime workers (M04/M05/M06) wrote next to their
// own example sources under library/medium-examples/<execution_id>/ (example.json, <name>.example.json, or any *.json whose `format` is creative-example@1;
// one object, an array, or { examples: [] }). This module never executes, renders or imports an example: it only reads JSON and checks that named paths exist.
// Rules enforced here (guardrails 00 and spec 03 section 4):
//   - source_ref and runtime_ref/assets paths must exist inside the skill (a nonexistent path rejects the row, never "assumed there")
//   - preview_ref stays null until a real, permitted file exists AND the row carries a receipt for it; an upstream demo's quality is never local proof
//   - every row names its rights basis; adapted outside code must name its third_party/SOURCES.md entry; a reference PRINCIPLE is kept apart from implementation CODE
//   - retrieval needs the selected medium AND a communication-problem match; one or two rows per task; popularity is not a signal
// Pure apart from the fs reads in buildExampleIndex; no network, no model, no side effects at import.
import fs from "node:fs";
import path from "node:path";
import { SKILL_DIR } from "./common.mjs";

export const EXAMPLE_FORMAT = "creative-example@1";
export const INDEX_VERSION = 1;
export const EXAMPLES_DIR = "library/medium-examples";
// authored-unvalidated: source written, never run. original-unreviewed: matches the creative-reference index wording. visual / verified need a real receipt.
export const EVIDENCE_STATUS = Object.freeze(["authored-unvalidated", "original-unreviewed", "source-description", "visual", "verified"]);
// original-code: written for RasanAI; adapted-code: outside code ported (needs third_party entry); reference-principle: an idea restated, no code or asset taken
export const SOURCE_ROLES = Object.freeze(["original-code", "adapted-code", "reference-principle"]);
export const MAX_PER_TASK = 2;

const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);
const str = (x, d = "") => (typeof x === "string" ? x : d);
const words = (s) => String(s || "").toLowerCase().match(/[a-z0-9]+/g) || [];
const STOP = new Set(["the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "without", "is", "are", "be", "it", "its", "that", "this", "one", "two", "into", "from", "as", "by"]);
const keyWords = (s) => words(s).filter((w) => w.length > 2 && !STOP.has(w));

// a path is usable only when it is relative, has no traversal, and stays inside the skill root (string check first, then fs)
function insideSkill(root, rel) {
  const r = str(rel).trim();
  if (!r || path.isAbsolute(r) || /^[a-z][a-z0-9+.-]*:/i.test(r)) return null;
  const abs = path.resolve(root, r.split("#")[0]);
  const back = path.relative(root, abs);
  if (!back || back.startsWith("..") || path.isAbsolute(back)) return null;
  return abs;
}
const exists = (root, rel) => { const a = insideSkill(root, rel); try { return !!a && fs.existsSync(a); } catch { return false; } };

// ---------------------------------------------------------------- validation
// -> { ok, errors:[{code,path,message}], warnings, row }  (row = the normalized, honest record; evidence never upgraded here)
export function validateExample(raw, { skillRoot = SKILL_DIR, sourceFile = null } = {}) {
  const errors = [], warnings = [];
  const err = (code, p, message) => errors.push({ code, path: p, message });
  const warn = (code, p, message) => warnings.push({ code, path: p, message });
  if (!isObj(raw)) { err("row.shape", "$", "an example is an object"); return { ok: false, errors, warnings, row: null }; }
  if (raw.format !== EXAMPLE_FORMAT) err("row.format", "format", `format is ${EXAMPLE_FORMAT}`);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(str(raw.id))) err("row.id", "id", "id is a lowercase slug");
  const profiles = arr(raw.profile_ids).map(str).filter(Boolean);
  if (!profiles.length) err("row.profiles", "profile_ids", "name the medium profile(s) this teaches");
  if (!str(raw.problem).trim()) err("row.problem", "problem", "state the communication problem the example solves");
  if (!str(raw.native_action).trim()) err("row.action", "native_action", "state the medium's native action");
  const status = str(raw.evidence_status, "authored-unvalidated");
  if (!EVIDENCE_STATUS.includes(status)) err("row.evidence", "evidence_status", `one of ${EVIDENCE_STATUS.join(", ")}`);
  // source: must exist; a nonexistent runtime path is a rejection, not a warning
  if (!str(raw.source_ref).trim()) err("source.missing", "source_ref", "an example needs its exact local source path");
  else if (!exists(skillRoot, raw.source_ref)) err("source.path", "source_ref", `${raw.source_ref} is not a file inside the skill: rejected, not assumed`);
  for (const [i, a] of arr(raw.assets).entries()) { const p = isObj(a) ? a.path : a; if (!exists(skillRoot, p)) err("asset.path", `assets[${i}]`, `asset ${p} is not inside the skill`); else if (isObj(a) && !str(a.rights_basis).trim()) err("asset.rights", `assets[${i}].rights_basis`, "each asset states its own rights; a code licence does not cover fonts, sprites, audio or video"); }
  if (raw.runtime_ref != null) {
    const ref = str(raw.runtime_ref).trim();
    if (!ref) err("runtime.shape", "runtime_ref", "runtime_ref is a skill path (optionally #export) or null");
    else if (!exists(skillRoot, ref)) err("runtime.path", "runtime_ref", `${ref} does not exist: the example would depend on a runtime that is not there`);
  }
  // rights and role
  if (!str(raw.rights_basis).trim()) err("rights.missing", "rights_basis", "state the exact rights basis (original code and synthetic data, or the licence and source)");
  const role = str(raw.source_role, "original-code");
  if (!SOURCE_ROLES.includes(role)) err("role.value", "source_role", `one of ${SOURCE_ROLES.join(", ")}`);
  if (role === "adapted-code") {
    const tp = raw.third_party;
    if (!isObj(tp) || !str(tp.sources_entry).trim() || !str(tp.licence || tp.license).trim()) err("rights.third_party", "third_party", "adapted code names its third_party/SOURCES.md entry and licence; nothing is adapted before that entry exists");
  }
  if (role === "reference-principle" && str(raw.source_ref).trim() && /\.(m?js|ts|html|css|svg)$/i.test(str(raw.source_ref))) warn("role.principle_has_code", "source_role", "a reference-principle row points at code: say adapted-code or original-code instead");
  // preview and receipts: no preview without a real file; no visual/verified claim without a receipt that names it
  const preview = raw.preview_ref == null ? null : str(raw.preview_ref).trim();
  const receipts = arr(raw.verification_receipts);
  let previewOk = false;
  if (preview) {
    if (!exists(skillRoot, preview)) err("preview.path", "preview_ref", `${preview} does not exist: keep preview_ref null until a real permitted file exists`);
    else if (!receipts.some((r) => isObj(r) && str(r.ref).trim() && str(r.scope).trim() && /^[0-9a-f]{64}$/i.test(str(r.sha256)))) err("preview.receipt", "preview_ref", "a preview needs a verification receipt (ref, scope, sha256) for the same file");
    else previewOk = true;
  }
  if (["visual", "verified"].includes(status) && !previewOk) err("evidence.unearned", "evidence_status", `${status} needs a real preview file and a receipt; authored source is not rendered evidence`);
  if (status === "verified" && !receipts.length) err("evidence.receipt", "verification_receipts", "verified needs receipts");
  if (raw.upstream_quality_claim != null) warn("evidence.upstream", "upstream_quality_claim", "an upstream demo's look is not proof the example works here; this field is ignored");
  if (!arr(raw.do_not_copy).length) warn("row.do_not_copy", "do_not_copy", "say what must not be copied");
  if (!arr(raw.not_for).length) warn("row.not_for", "not_for", "say what this is no proof of");
  if (errors.length) return { ok: false, errors, warnings, row: null };
  const row = {
    format: EXAMPLE_FORMAT, id: raw.id, profile_ids: profiles, problem: str(raw.problem).trim(), native_action: str(raw.native_action).trim(),
    kind: str(raw.kind, "positive"), // positive | boundary: a boundary row teaches what NOT to do and is retrievable as a contrast
    source_ref: raw.source_ref, preview_ref: previewOk ? preview : null, evidence_status: previewOk ? status : (["visual", "verified"].includes(status) ? "authored-unvalidated" : status),
    event_refs: arr(raw.event_refs), assets: arr(raw.assets), rights_basis: str(raw.rights_basis).trim(), source_role: role,
    third_party: role === "adapted-code" ? raw.third_party : null, learn: arr(raw.learn).map(str), do_not_copy: arr(raw.do_not_copy).map(str), not_for: arr(raw.not_for).map(str),
    comm_kinds: arr(raw.comm_kinds).map(str), runtime_ref: raw.runtime_ref == null ? null : raw.runtime_ref, verification_receipts: previewOk ? receipts : [],
    index_file: sourceFile,
  };
  return { ok: true, errors, warnings, row };
}

function readJson(file) { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return undefined; } }
const rowsIn = (j) => (Array.isArray(j) ? j : isObj(j) && Array.isArray(j.examples) ? j.examples : isObj(j) && j.format === EXAMPLE_FORMAT ? [j] : []);

// -> { index_version, records:[normalized rows], rejected:[{file, id, errors}], scanned:[files], absent }  Deterministic: same tree, same index.
// `absent` is true when the examples directory does not exist yet (the runtime workers have not landed): an empty index, never a fabricated one.
export function buildExampleIndex({ skillRoot = SKILL_DIR, dir = EXAMPLES_DIR } = {}) {
  const base = path.join(skillRoot, dir);
  const records = [], rejected = [], scanned = [], seen = new Set();
  let absent = false;
  let subs = [];
  try { subs = fs.readdirSync(base, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort(); } catch { absent = true; }
  for (const sub of subs) {
    let files = [];
    try { files = fs.readdirSync(path.join(base, sub)).filter((f) => f === "example.json" || /\.example\.json$/.test(f)).sort(); } catch {}
    for (const f of files) {
      const rel = `${dir}/${sub}/${f}`;
      const j = readJson(path.join(base, sub, f));
      scanned.push(rel);
      if (j === undefined) { rejected.push({ file: rel, id: null, errors: [{ code: "file.json", path: "$", message: "unreadable JSON" }] }); continue; }
      for (const raw of rowsIn(j)) {
        const v = validateExample(raw, { skillRoot, sourceFile: rel });
        if (!v.ok) { rejected.push({ file: rel, id: isObj(raw) ? raw.id || null : null, errors: v.errors }); continue; }
        if (seen.has(v.row.id)) { rejected.push({ file: rel, id: v.row.id, errors: [{ code: "row.id.duplicate", path: "id", message: "duplicate id" }] }); continue; }
        seen.add(v.row.id); records.push(v.row);
      }
    }
  }
  return { index_version: INDEX_VERSION, records, rejected, scanned, absent };
}

// ---------------------------------------------------------------- retrieval
// query: { medium: profile id or execution id (required), problem: the communication problem in words (required), kind: communication kind id (optional),
//          have_assets:[paths] (optional), allow_boundary: true (include contrast rows), limit (1..2, default 2), exclude:[ids already used on this film] }
// -> { selected:[compact rows], excluded:[{id, reason}], counts, read_order }. Selection never reads source; the caller opens source_ref only for the mechanics the treatment calls for.
export function retrieveExamples(query = {}, index = buildExampleIndex()) {
  const q = query || {};
  const medium = str(q.medium).trim();
  const problemWords = new Set(keyWords(q.problem));
  const excluded = [];
  if (!medium) return { selected: [], excluded: [{ id: "*", reason: "no selected medium: examples are retrieved by medium, never by popularity" }], counts: { pool: 0, returned: 0 }, read_order: [] };
  if (!problemWords.size) return { selected: [], excluded: [{ id: "*", reason: "no communication problem stated: retrieval needs medium AND problem" }], counts: { pool: 0, returned: 0 }, read_order: [] };
  const limit = Math.max(1, Math.min(MAX_PER_TASK, Number(q.limit) || MAX_PER_TASK));
  const skip = new Set(arr(q.exclude).map(String));
  const have = new Set(arr(q.have_assets).map(String));
  const scored = [];
  for (const r of index.records) {
    if (!r.profile_ids.includes(medium) && !(r.index_file || "").includes(`/${medium}/`)) continue; // other medium: silent
    if (skip.has(r.id)) { excluded.push({ id: r.id, reason: "already used on this film" }); continue; }
    if (r.kind === "boundary" && !q.allow_boundary) { excluded.push({ id: r.id, reason: "boundary/contrast row: only on request" }); continue; }
    if (q.kind && r.comm_kinds.length && !r.comm_kinds.includes(q.kind)) { excluded.push({ id: r.id, reason: `taught for ${r.comm_kinds.join(", ")}, not ${q.kind}` }); continue; }
    if (q.kind && r.not_for.some((n) => words(n).includes(String(q.kind).toLowerCase()))) { excluded.push({ id: r.id, reason: `marked not for ${q.kind}` }); continue; }
    const miss = r.assets.map((a) => (isObj(a) ? a.path : a)).filter((p) => !have.has(p) && !exists(SKILL_DIR, p));
    if (miss.length) { excluded.push({ id: r.id, reason: `needs assets not present: ${miss.join(", ")}` }); continue; }
    const hay = new Set([...keyWords(r.problem), ...keyWords(r.native_action), ...r.learn.flatMap(keyWords)]);
    const hits = [...problemWords].filter((w) => hay.has(w)).length;
    if (!hits) { excluded.push({ id: r.id, reason: "same medium but a different communication problem" }); continue; }
    // problem overlap decides; a positive row outranks its boundary twin; the id is only a stable tie-break (no popularity, no recency)
    scored.push({ r, s: hits * 2 + (r.kind === "positive" ? 1 : 0) });
  }
  scored.sort((a, b) => b.s - a.s || a.r.id.localeCompare(b.r.id));
  const picked = scored.slice(0, limit).map((x) => x.r);
  for (const x of scored.slice(limit)) excluded.push({ id: x.r.id, reason: `beyond the ${limit} example limit` });
  return {
    selected: picked.map(compact), excluded: excluded.slice(0, 12), counts: { pool: index.records.length, returned: picked.length },
    read_order: ["write the treatment from the brief first", "then read only the mechanics you need from source_ref", "never copy the whole composition or its wording", "preview_ref null means nothing has been rendered"],
  };
}

// the compact row a prompt or packet may carry (no source text); `evidence` says in words what the row supports
export function compact(r) {
  return {
    id: r.id, profile_ids: r.profile_ids, problem: r.problem, native_action: r.native_action, kind: r.kind, source_ref: r.source_ref, preview_ref: r.preview_ref,
    evidence_status: r.evidence_status, evidence: evidenceLine(r), rights_basis: r.rights_basis, source_role: r.source_role, learn: r.learn, do_not_copy: r.do_not_copy, not_for: r.not_for,
    runtime_ref: r.runtime_ref,
  };
}
export function evidenceLine(r) {
  if (r.evidence_status === "verified" || r.evidence_status === "visual") return `${r.evidence_status}: only for the exact unchanged scope its receipts cover`;
  if (r.evidence_status === "source-description") return "description only: no frame was measured";
  return "authored source, not run or rendered: a teaching mechanism, not proof it works or looks right here";
}

// ---------------------------------------------------------------- lead registration (no writes here)
// The exact lines the lead pastes into lead-owned files. Returned as data so nothing is applied from a worker lane.
export function registrationRequests(index = buildExampleIndex()) {
  return {
    recipe_index: index.records.map((r) => ({ call: "lib/recipe-index.mjs GUIDES/E(...)", record: { id: `example-${r.id}`, layer: "recipe", path: r.source_ref, runtime: r.runtime_ref ? "dom-gsap" : "any", capabilities: [r.native_action, r.problem], license_basis: r.rights_basis, limits: `${evidenceLine(r)}; ${r.not_for.join("; ")}`.slice(0, 240), implemented: true } })),
    reference_index: index.records.map((r) => ({ call: "library/creative-reference-index.json entries[]", row: { id: `ex-${r.id}`, kind: "original-example", evidence_level: "original-unreviewed", local_ref: r.source_ref, principle: r.learn.join("; ") || r.problem, avoid_copying: r.do_not_copy, shot_tags: [], format_tags: r.profile_ids } })),
    rejected: index.rejected.map((x) => ({ file: x.file, id: x.id, why: x.errors.map((e) => `${e.code}: ${e.message}`) })),
  };
}
