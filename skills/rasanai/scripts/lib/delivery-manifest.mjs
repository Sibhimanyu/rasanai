// Plan 12 D5/D8: an honest delivery package built from the ACCEPTED dependency closure, not by zipping the project.
//
//   closure()          from the accepted output artifact, walk `depends_on` to exactly the elements that output needs. Unaccepted
//                      artifacts in the chain are problems. Nothing outside the closure is listed or copied (no research, no logs).
//   decide()           per element: include | external_requirement | blocked | missing. Rights (Plan 11 provenance), redistribution,
//                      licence notices (license-register.exportNotices), root containment (containment.resolveInRoots)
//   editability()      every element is labelled source-editable | property-editable | clip-editable | baked | unavailable
//   buildManifest()    output version, target profile pin, frames / duration / time base, audio, colour / alpha, captions, REAL stems,
//                      source project (name + digest, never a path), hashes, provenance and credits, notices, external requirements
//   buildPackage()     stage in a hidden folder beside the exports, copy (never move: originals are preserved), verify hashes,
//                      redact + re-scan (Plan 11 exportSafe), then ONE rename. A failure removes the staging folder and writes a failure
//                      record OUTSIDE the package under <run>/delivery/failures/. The previous deliverable and `latest.json` stay as they were.
//   verifyPackage()    re-hash, no absolute / private paths, no leaks, every path inside the package
// An accepted export folder is never overwritten or edited: a new export gets a new id.
// No encodes. Copies and hashes files only; run it deliberately.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { SCHEMA_VERSION, canonicalDigest } from "./contracts.mjs";
import { resolveInRoots } from "./containment.mjs";
import { exportSafe, findLeaks, redact } from "./redact.mjs";
import { rightsStatus, deliveryProvenance, rightsGate } from "./provenance.mjs";
import { exportNotices, distributionGate } from "./license-register.mjs";
import { atomicWrite } from "./recovery.mjs";

const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);
const str = (x, d = "") => (typeof x === "string" ? x : d);
const num = (x, d = null) => (Number.isFinite(Number(x)) && x !== null && x !== "" ? Number(x) : d);

export const EDITABILITY = Object.freeze(["source-editable", "property-editable", "clip-editable", "baked", "unavailable"]);
// where each role lives inside a package. Source/editable material is separate from baked previews and masters.
export const LAYOUT = Object.freeze({ master: "masters", preview: "previews", caption: "captions", transcript: "captions", stem: "audio/stems", source: "source", media: "media", font: "fonts", licence: "licences", interchange: "interchange", component: "source/components", proxy: "interchange/proxies" });

export const sha256File = (file) => { const h = crypto.createHash("sha256"); const fd = fs.openSync(file, "r"); try { const buf = Buffer.alloc(1 << 20); let n; while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) h.update(buf.subarray(0, n)); } finally { fs.closeSync(fd); } return h.digest("hex"); };

// what a person can DO with this element once it is in an external tool or the package. Honest by kind, not by hope.
export function editability(el) {
  const k = str(el.kind) || str(el.role);
  if (EDITABILITY.includes(el.editability) && !el.__derive) return { label: el.editability, why: "declared by the producer" };
  if (["master", "preview", "rendered_video", "rendered_shot", "proxy", "render_3d", "gsap_scene_proxy", "threejs_scene_proxy", "html_scene_proxy"].includes(k)) return { label: "baked", why: "rendered pixels: an editor can trim and place it, not edit the motion or the rig inside it" };
  if (["scene_source", "html", "gsap_source", "threejs_source", "component", "source"].includes(k)) return { label: "source-editable", why: "code or project source in RasanAI's own format; an external video editor does not read it as layers" };
  if (["caption", "transcript", "descriptive_transcript", "score", "copy", "cues"].includes(k)) return { label: "property-editable", why: "text or data whose values can be changed, then re-rendered or re-imported" };
  if (["stem", "audio", "music", "voice", "sfx", "media", "footage"].includes(k)) return { label: "clip-editable", why: "a real media clip: trim, move, mix" };
  if (["rig", "rig_3d", "particle_sim", "shader", "live_preview"].includes(k)) return { label: "unavailable", why: "no editable form travels outside RasanAI; only a baked render does" };
  if (["font", "licence", "notice"].includes(k)) return { label: "unavailable", why: "a requirement or notice, not editable content" };
  return { label: "baked", why: "unknown kind: treated as baked, the safe label" };
}

// artifacts: [{ id, accepted: bool, depends_on: [id], elements?: [elementId] }]; root: the output artifact id
export function closure(artifacts, root) {
  const by = new Map(arr(artifacts).map((a) => [a.id, a]));
  const seen = new Set(), order = [], problems = [];
  const walk = (id, trail) => {
    if (seen.has(id)) return;
    const a = by.get(id);
    if (!a) { problems.push({ artifact: id, problem: "missing_artifact", why: `${trail.join(" > ")} depends on an artifact that is not recorded` }); return; }
    if (trail.includes(id)) { problems.push({ artifact: id, problem: "cycle" }); return; }
    seen.add(id); order.push(id);
    if (a.accepted !== true) problems.push({ artifact: id, problem: "not_accepted", why: "only accepted artifacts enter an export: " + id });
    for (const d of arr(a.depends_on)) walk(d, [...trail, id]);
  };
  walk(root, []);
  const elementIds = [...new Set(order.flatMap((id) => arr(by.get(id) && by.get(id).elements)))];
  return { artifacts: order, element_ids: elementIds, problems, excluded_artifacts: by.size - order.length };
}

// el: { id, role, kind?, path, redistributable?: true|false|"unknown", rights_id?, licence_id?, external?: bool, sha256?, editability?, note? }
export function decide(el, { roots = [], run = null, register = null } = {}) {
  const base = { id: el.id, role: str(el.role) || "media", kind: str(el.kind) || str(el.role) || "media" };
  const ed = editability(el);
  const out = (decision, extra = {}) => ({ ...base, editability: ed.label, editability_why: ed.why, decision, ...extra });
  if (el.external === true) return out("external_requirement", { why: "a linked external file: it is referenced, never copied", name: path.basename(str(el.path)) || el.id });
  if (el.rights_id && run) { const r = rightsStatus(run, el.rights_id); if (r.status !== "granted") return out("blocked", { why: `rights are ${r.status}: ${r.reason || ""}`.trim(), rights: r.status, remediation: "replace the asset, ask the rights holder again, export without it, or keep the source as it is; nothing was deleted" }); }
  if (el.redistributable === false || el.redistributable === "unknown" || (el.redistributable !== true && ["font", "media", "footage", "music"].includes(base.kind) && el.redistributable === undefined)) return out("external_requirement", { why: el.redistributable === false ? "not redistributable: recorded as a missing external requirement" : "redistribution is not established: not embedded", name: el.name || path.basename(str(el.path)) || el.id });
  if (!str(el.path)) return out("missing", { why: "no file path recorded" });
  const r = resolveInRoots(roots, el.path, { mustExist: true });
  if (!r.ok) return out(r.reason === "missing" ? "missing" : "blocked", { why: r.error, reason: r.reason });
  return out("include", { abs: r.path, sha256: null, size: fs.statSync(r.path).size, licence_id: el.licence_id || null });
}

const safeName = (p) => path.basename(String(p)).replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^\.+/, "") || "file";

// spec: { export_id, output:{version, element_id, frames, duration_s, time_base:{num,den}, audio:{...}, colour:{...}, alpha}, profile, variant, artifacts, root_artifact, elements, captions:[ids], stems:[ids], source_project:{name}, ledger?, claim_items?, layers?, licence_ids?, credits? }
export function planPackage(spec, { roots = [], run = null, register = null, now = Date.now() } = {}) {
  const S = isObj(spec) ? spec : {};
  const cl = closure(S.artifacts, S.root_artifact);
  const byId = new Map(arr(S.elements).map((e) => [e.id, e]));
  const wanted = cl.element_ids.map((id) => byId.get(id)).filter(Boolean);
  const unknownEls = cl.element_ids.filter((id) => !byId.has(id));
  const decisions = wanted.map((e) => decide(e, { roots, run, register }));
  const licIds = [...new Set([...arr(S.licence_ids), ...wanted.map((e) => e.licence_id).filter(Boolean)])];
  const notices = exportNotices(licIds, register);
  const external = [...decisions.filter((d) => d.decision === "external_requirement").map((d) => ({ id: d.id, role: d.role, why: d.why, name: d.name || null })), ...notices.external_requirements];
  const problems = [...cl.problems, ...unknownEls.map((id) => ({ artifact: id, problem: "element_not_described", why: "an accepted artifact names an element the spec does not describe" })), ...decisions.filter((d) => d.decision === "blocked").map((d) => ({ artifact: d.id, problem: "blocked", why: d.why })), ...decisions.filter((d) => d.decision === "missing").map((d) => ({ artifact: d.id, problem: "missing", why: d.why }))];
  const master = decisions.find((d) => d.id === (S.output && S.output.element_id));
  if (!master || master.decision !== "include") problems.push({ artifact: S.output && S.output.element_id, problem: "output_not_includable", why: "the film itself must be an included, existing, redistributable file" });
  const assets = decisions.filter((d) => d.decision === "include" || d.decision === "blocked").map((d) => ({ id: d.id, role: d.role, sha256: null, licence: d.licence_id || null, rights: d.rights || "unchecked" }));
  return { schema_version: SCHEMA_VERSION, closure: cl, decisions, external_requirements: external, notices: notices.notices, licence_ids: licIds, problems, ok: !problems.length, assets, distribution_gate: distributionGate(register), now };
}

export function buildManifest(spec, plan, { now = new Date().toISOString(), hashes = new Map(), paths = new Map(), run = null } = {}) {
  const S = spec, O = S.output || {};
  const els = plan.decisions.map((d) => ({
    id: d.id, role: d.role, kind: d.kind, decision: d.decision, editability: d.editability, editability_why: d.editability_why,
    path: paths.get(d.id) || null, sha256: hashes.get(d.id) || null, size: d.size ?? null, why: d.why || null, name: d.name || null,
  }));
  const pick = (ids) => arr(ids).map((id) => els.find((e) => e.id === id)).filter(Boolean);
  const prov = deliveryProvenance({ ledger: arr(S.ledger), items: S.claim_items || {}, assets: plan.assets.map((a) => ({ ...a, sha256: hashes.get(a.id) || a.sha256 })), layers: arr(S.layers), run, version: O.version || null });
  const m = {
    schema_version: SCHEMA_VERSION, kind: "delivery_manifest", export_id: S.export_id, created_at: now, status: "complete",
    output: { version: O.version ?? null, file: (els.find((e) => e.id === O.element_id) || {}).path || null, sha256: hashes.get(O.element_id) || null, frames: num(O.frames), duration_s: num(O.duration_s), time_base: O.time_base || null, audio: O.audio || null, colour: O.colour || null, alpha: O.alpha === true },
    target_profile: S.profile ? { id: S.profile.id, version: S.profile.version, digest: S.profile.digest || null, kind: S.profile.kind || null, state: S.profile.state || null, needs_validation: S.profile.needs_validation !== false, note: S.profile.note || "measured against this record; not a platform approval" } : null,
    variant: S.variant ? { id: S.variant.id, locale: S.variant.locale || null, parent: S.variant.parent || null, approved_copy_timing_changes: arr(S.variant.changes) } : null,
    captions: pick(S.captions), stems: pick(S.stems).map((s) => ({ ...s, real: true })),
    source_project: { name: safeName(str(S.source_project && S.source_project.name) || "project"), digest: S.source_project && S.source_project.digest || null },
    elements: els, external_requirements: plan.external_requirements, notices: plan.notices,
    provenance: { ok: prov.ok, claim_ids: prov.claim_ids, assets: prov.assets, reconstructions: prov.reconstructions, checks: prov.checks, credits: arr(S.credits) },
    rights_gate: rightsGate(prov), distribution_gate: plan.distribution_gate,
    editability_summary: EDITABILITY.reduce((o, k) => ({ ...o, [k]: els.filter((e) => e.editability === k).map((e) => e.id) }), {}),
    loss_report: S.loss_report || null,
    warnings: arr(S.warnings),
    not_included: "everything outside the accepted dependency closure: research, provider logs, unrelated documents, credentials, absolute paths",
  };
  m.digest = canonicalDigest({ ...m, created_at: null, digest: null }).slice(0, 16);
  return m;
}

export const exportsDir = (run) => path.join(path.resolve(String(run)), "exports");
export const failuresDir = (run) => path.join(path.resolve(String(run)), "delivery", "failures");

export function buildPackage({ run, spec, roots = [], register = null, exportsRoot = null, now = new Date().toISOString(), hooks = {} } = {}) {
  const id = str(spec && spec.export_id);
  if (!/^[A-Za-z0-9._-]{3,80}$/.test(id)) return { ok: false, reason: "invalid_export_id", note: "export_id: 3 to 80 of A-Z a-z 0-9 . _ -" };
  const root = path.resolve(exportsRoot || exportsDir(run));
  const finalDir = path.join(root, id);
  if (fs.existsSync(finalDir)) return { ok: false, reason: "export_exists", note: "an accepted export is never overwritten or edited: choose a new export_id" };
  const plan = planPackage(spec, { roots, run, register });
  if (!plan.ok) return failure(run, id, "plan_blocked", { problems: plan.problems }, null);
  const stage = path.join(root, `.staging-${id}-${process.pid}`);
  try {
    fs.mkdirSync(stage, { recursive: true });
    const hashes = new Map(), paths = new Map(), used = new Set();
    for (const d of plan.decisions) {
      if (d.decision !== "include") continue;
      const dir = LAYOUT[d.role] || LAYOUT[d.kind] || "media";
      let name = safeName(d.abs), n = 1; while (used.has(`${dir}/${name}`)) name = `${n++}-${safeName(d.abs)}`;
      const rel = `${dir}/${name}`; used.add(rel);
      fs.mkdirSync(path.join(stage, dir), { recursive: true });
      fs.copyFileSync(d.abs, path.join(stage, rel), fs.constants.COPYFILE_EXCL); // a copy: the original media stays where it is
      const before = sha256File(d.abs), after = sha256File(path.join(stage, rel));
      if (before !== after) throw Object.assign(new Error(`copy of ${d.id} does not match its source`), { code: "copy_mismatch" });
      hashes.set(d.id, after); paths.set(d.id, rel);
      if (typeof hooks.afterCopy === "function") hooks.afterCopy(d.id, rel); // fault-injection point for Plan 14 fixtures; unused in production
    }
    // licence notices travel with the work
    for (const nt of plan.notices) if (nt.file) { /* the register names a file inside the skill; embedding is a producer choice recorded below */ }
    fs.mkdirSync(path.join(stage, "licences"), { recursive: true });
    fs.writeFileSync(path.join(stage, "licences", "NOTICES.json"), JSON.stringify({ notices: plan.notices, external_requirements: plan.external_requirements }, null, 2) + "\n");
    const manifest = buildManifest(spec, plan, { now, hashes, paths, run });
    const safe = exportSafe(manifest);
    if (!safe.ok) throw Object.assign(new Error("the manifest still contains private material after redaction"), { code: "leak" });
    fs.writeFileSync(path.join(stage, "MANIFEST.json"), JSON.stringify(safe.value, null, 2) + "\n");
    const check = verifyPackage(stage);
    if (!check.ok) throw Object.assign(new Error("the staged package failed verification: " + check.problems.slice(0, 3).join("; ")), { code: "verify" });
    if (typeof hooks.beforePublish === "function") hooks.beforePublish(stage);
    const dfd = (() => { try { return fs.openSync(stage, "r"); } catch { return null; } })(); if (dfd !== null) { try { fs.fsyncSync(dfd); } catch {} fs.closeSync(dfd); }
    fs.renameSync(stage, finalDir); // the one atomic step
    atomicWrite(path.join(root, "latest.json"), JSON.stringify({ schema_version: SCHEMA_VERSION, export_id: id, manifest: `${id}/MANIFEST.json`, digest: safe.value.digest, published_at: now }, null, 2) + "\n");
    return { ok: true, export_id: id, dir: finalDir, manifest: safe.value, external_requirements: plan.external_requirements };
  } catch (e) {
    try { fs.rmSync(stage, { recursive: true, force: true }); } catch {}
    return failure(run, id, e.code || "export_failed", { message: redact(e.message) }, e);
  }
}
function failure(run, id, reason, detail, err) {
  const rec = { schema_version: SCHEMA_VERSION, kind: "export_failure", export_id: id, reason, detail: exportSafe(detail).value, at: new Date().toISOString(), previous_deliverable: "unchanged", note: "this record is outside the package; no partial package was left behind" };
  if (run) try { atomicWrite(path.join(failuresDir(run), `${id}-${Date.now()}.json`), JSON.stringify(rec, null, 2) + "\n"); } catch {}
  return { ok: false, reason, ...detail, failure_record: true, previous_deliverable_intact: true };
}

export function verifyPackage(dir) {
  const problems = [];
  let m; try { m = JSON.parse(fs.readFileSync(path.join(dir, "MANIFEST.json"), "utf8")); } catch { return { ok: false, problems: ["MANIFEST.json is missing or not JSON"] }; }
  const realRoot = fs.realpathSync(dir);
  for (const e of arr(m.elements)) {
    if (e.decision !== "include") continue;
    if (!e.path || path.isAbsolute(e.path) || e.path.split(/[\\/]/).includes("..")) { problems.push(`${e.id}: path is absolute or escapes the package`); continue; }
    const f = path.join(dir, e.path);
    let rp; try { rp = fs.realpathSync(f); } catch { problems.push(`${e.id}: ${e.path} is missing`); continue; }
    if (rp !== realRoot && !rp.startsWith(realRoot + path.sep)) { problems.push(`${e.id}: resolves outside the package`); continue; }
    if (e.sha256 && sha256File(f) !== e.sha256) problems.push(`${e.id}: checksum differs from the manifest`);
  }
  const textLike = /\.(json|md|txt|srt|vtt|otio|html|js|css)$/i;
  const walk = (d) => { for (const n of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, n.name); if (n.isDirectory()) walk(p); else if (textLike.test(n.name) && fs.statSync(p).size < 8 * 2 ** 20) { const leaks = findLeaks(fs.readFileSync(p, "utf8")); if (leaks.length) problems.push(`${path.relative(dir, p)}: ${leaks[0].kind} found (${leaks[0].sample})`); } } };
  walk(dir);
  return { ok: !problems.length, problems, files: arr(m.elements).filter((e) => e.decision === "include").length };
}
