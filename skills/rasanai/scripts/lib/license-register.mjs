// Plan 11 R6: the licence register, checked against the ACTUAL files and versions. Data lives in third_party/license-register.json (one record per kind of thing: code, bundled runtime,
// plugin, model weights, font, stock/generated media, reference material, brand asset). Intake rules stay in third_party/INTAKE.md; provenance of what we took stays in SOURCES.md.
//
//   loadRegister()        the JSON, validated
//   inventory(root)       read-only: does every recorded file exist, does its header still say the recorded version / licence, and is any vendored file NOT covered by a record?
//   unresolved(reg)       everything whose status is unresolved or blocked, plus the open distribution blockers (merged with lib/capabilities.mjs DISTRIBUTION_BLOCKERS)
//   distributionGate()    { ok:false } while a blocker is open. A flag, an environment variable or a label never changes this; only a dated edit to the register does
//   exportNotices(ids)    which licence texts and credits a package must carry for the records it includes; an unresolved record is listed as an external requirement, not embedded
// Missing licence = unresolved, not permission. Ideas-only sources stay ideas only. No network, no model, no writes.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DISTRIBUTION_BLOCKERS } from "./capabilities.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SKILL_ROOT = path.resolve(HERE, "..", "..");
export const REGISTER_FILE = path.join(SKILL_ROOT, "third_party", "license-register.json");
const KINDS = ["code", "bundled_runtime", "plugin", "model_weights", "font", "stock_generated_media", "reference_material", "brand_asset"];
const STATUSES = ["cleared", "conditional", "unresolved", "ideas_only", "not_bundled", "blocked"];
const arr = (x) => (Array.isArray(x) ? x : []);

export function loadRegister(file = REGISTER_FILE) {
  let reg; try { reg = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { return { ok: false, problems: [`register unreadable: ${e.message}`], register: null }; }
  const problems = [], ids = new Set();
  for (const r of arr(reg.records)) {
    if (!r.id || ids.has(r.id)) problems.push(`duplicate or missing id ${r.id}`); ids.add(r.id);
    if (!KINDS.includes(r.kind)) problems.push(`${r.id}: kind ${r.kind} is not one of ${KINDS.join(", ")}`);
    if (!STATUSES.includes(r.status)) problems.push(`${r.id}: status ${r.status} is not one of ${STATUSES.join(", ")}`);
    if (r.status === "cleared" && !(r.licence_spdx || r.licence_name)) problems.push(`${r.id}: cleared without a licence`);
    if (r.status === "cleared" && !(r.licence_file || r.header_evidence)) problems.push(`${r.id}: cleared without a licence file or header evidence`);
    if (r.status === "unresolved" && !r.action) problems.push(`${r.id}: unresolved needs the action that would resolve it`);
  }
  for (const k of KINDS) if (!arr(reg.records).some((r) => r.kind === k)) problems.push(`no record of kind ${k}`);
  return { ok: !problems.length, problems, register: reg };
}

const VENDOR_DIRS = [["scripts/vendor", /\.(js|mjs)$/], ["scripts/vendor/gsap-plugins", /\.js$/], ["runtime/vendor", /\.js$/], ["stage3d", /\.min\.js$/]];
// root: the skill folder. -> { ok, findings:[{record,problem}], uncovered:[files] }  (read-only)
export function inventory(root = SKILL_ROOT, reg = null) {
  const L = reg || loadRegister(path.join(root, "third_party", "license-register.json"));
  if (!L.register) return { ok: false, findings: [{ record: null, problem: L.problems[0] }], uncovered: [] };
  const findings = [];
  for (const r of L.register.records) {
    for (const f of arr(r.files)) {
      if (/[*]/.test(f)) { const dir = path.join(root, path.dirname(f)); if (!fs.existsSync(dir)) findings.push({ record: r.id, problem: `recorded location is gone: ${f}` }); continue; }
      const abs = path.join(root, f);
      if (!fs.existsSync(abs)) { findings.push({ record: r.id, problem: `recorded file is gone: ${f}` }); continue; }
      if (r.id.startsWith("gsap") && r.version && fs.statSync(abs).isFile() && /\.(js|mjs)$/.test(abs)) { // the GSAP headers carry "<Name> <version>"; other records name their version by hand
        let head = ""; try { const fd = fs.openSync(abs, "r"); const b = Buffer.alloc(2048); const n = fs.readSync(fd, b, 0, b.length, 0); fs.closeSync(fd); head = b.subarray(0, n).toString("utf8"); } catch {}
        const m = /\*\s*[A-Za-z0-9]+\s+(\d+\.\d+\.\d+)/.exec(head);
        if (m && m[1] !== r.version) findings.push({ record: r.id, problem: `${f} says version ${m[1]}, the register records ${r.version}: recheck the licence at the actual version` });
        if (!m) findings.push({ record: r.id, problem: `${f}: no version found in its header; the licence cannot be confirmed for this file` });
      }
    }
    if (r.licence_file) { const lf = path.join(root, r.licence_file); if (!fs.existsSync(lf)) findings.push({ record: r.id, problem: `licence file missing: ${r.licence_file}` }); }
    if (r.status === "cleared" && r.licence_file === undefined && !r.header_evidence) findings.push({ record: r.id, problem: "cleared with no licence evidence" });
  }
  const covered = (rel) => L.register.records.some((r) => arr(r.files).some((f) => f === rel || (f.endsWith("/") && rel.startsWith(f)) || (f.includes("*") && rel.startsWith(f.slice(0, f.indexOf("*"))))));
  const uncovered = [];
  for (const [dir, re] of VENDOR_DIRS) { let names = []; try { names = fs.readdirSync(path.join(root, dir)); } catch { continue; } for (const n of names) { const rel = `${dir}/${n}`; if (re.test(n) && fs.statSync(path.join(root, rel)).isFile() && !covered(rel)) uncovered.push(rel); } }
  for (const u of uncovered) findings.push({ record: null, problem: `vendored file with no register record (unresolved): ${u}` });
  return { ok: !findings.length, findings, uncovered };
}

export function unresolved(reg = null) {
  const L = reg || loadRegister();
  const recs = L.register ? L.register.records : [];
  const blockers = [...arr(L.register && L.register.distribution_blockers).filter((b) => b.status === "open").map((b) => ({ id: b.id, scope: b.scope, cleared_by: b.cleared_by })), ...DISTRIBUTION_BLOCKERS.filter((b) => b.status === "open" && !arr(L.register && L.register.distribution_blockers).some((x) => /gsap/.test(x.id) && /gsap/.test(b.id))).map((b) => ({ id: b.id, scope: b.applies_to, cleared_by: b.cleared_by }))];
  return { records: recs.filter((r) => ["unresolved", "blocked"].includes(r.status)).map((r) => ({ id: r.id, kind: r.kind, status: r.status, action: r.action || null, blocker: r.blocker || null })), blockers };
}
export function distributionGate(reg = null) {
  const u = unresolved(reg);
  return { ok: u.blockers.length === 0, blockers: u.blockers, note: u.blockers.length ? "a recorded project-wide blocker is open: no feature flag, label, checkbox or environment variable changes this; only licensing advice or written permission and a dated edit to the register do" : "" };
}
// records an export package would include -> { notices:[{id, licence, file}], external_requirements:[{id, why}] }
export function exportNotices(ids, reg = null) {
  const L = reg || loadRegister(); const by = new Map(arr(L.register && L.register.records).map((r) => [r.id, r]));
  const notices = [], external = [];
  for (const id of ids) {
    const r = by.get(id);
    if (!r) { external.push({ id, why: "no register record: unresolved, not embedded" }); continue; }
    if (["unresolved", "blocked", "ideas_only", "not_bundled"].includes(r.status)) { external.push({ id, why: `${r.status}: ${r.action || "not redistributed"}` }); continue; }
    notices.push({ id, licence: r.licence_spdx || r.licence_name, file: r.licence_file || null, holder: r.holder || null });
  }
  return { notices, external_requirements: external };
}
