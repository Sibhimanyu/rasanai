// Typed direct-manipulation operations (contract C6): transform (move|resize|rotate), property (recolor|text|reorder), trim (nudge).
// Values are exact (`original` / `proposed` objects keyed by x,y,scale,rotation,color,text,z,start,duration). Stale film_version,
// build_digest or element_digest returns {ok:false, conflict:true, current} and appends nothing. Undo/redo append inverse records.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import * as core from "./index.mjs";
import { locate, innerOf, setText, setToken, getAttr, sceneRoot } from "./html.mjs";

export const TYPED_OPS = ["transform", "property", "trim"];
export const KINDS = { move: "transform", resize: "transform", rotate: "transform", recolor: "property", text: "property", reorder: "property", nudge: "trim" };
const KEYS = { move: ["x", "y"], resize: ["scale"], rotate: ["rotation"], recolor: ["color"], text: ["text"], reorder: ["z"], nudge: ["start", "duration"] };
const OPTIONAL = { nudge: ["start", "duration"] }; // at least one of these
const TOKENS = {
  x: ["--el-x", "data-x"], y: ["--el-y", "data-y"], scale: ["--el-scale", "--scale", "data-scale"],
  rotation: ["--el-rotate", "--el-rotation", "data-rotate"], color: ["--el-color", "--color", "data-color"], z: ["--el-z", "data-z"],
};
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const fail = (msg) => { const e = new Error(msg); e.userFacing = true; return e; };
const r2 = (n) => Math.round(n * 100) / 100;
const unesc = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
export const isTyped = (edit) => !!edit && TYPED_OPS.includes(edit.operation);

function tokenRead(open, name) {
  const m = name.startsWith("--") ? new RegExp(`${name}\\s*:\\s*([^;"']*)`).exec(open) : new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`).exec(open);
  return m ? m[1].trim() : null;
}
// -> {name, raw} of the first token convention present on the open tag
function tokenFind(open, key) {
  for (const n of TOKENS[key]) { const v = tokenRead(open, n); if (v !== null) return { name: n, raw: v }; }
  return null;
}
// current on-disk values for one element: {values, digest, file, code}
export function readElement(run, project, edit) {
  const src = core.sourceFileFor(run, project, edit);
  if (!src || !fs.existsSync(src.abs)) return null;
  const code = fs.readFileSync(src.abs, "utf8");
  let loc;
  try { loc = locate(code, edit.element_id); } catch { return null; }
  const values = {};
  for (const k of Object.keys(TOKENS)) {
    const t = tokenFind(loc.open, k);
    if (t) values[k] = k === "color" ? t.raw : Number.isFinite(Number(t.raw)) ? Number(t.raw) : t.raw;
  }
  const inner = innerOf(code, loc);
  if (!/<[A-Za-z!/]/.test(inner)) values.text = unesc(inner);
  const s = getAttr(loc.open, "data-start"), d = getAttr(loc.open, "data-duration");
  if (s !== null && Number.isFinite(Number(s))) values.start = Number(s);
  if (d !== null && Number.isFinite(Number(d))) values.duration = Number(d);
  return { values, digest: sha(code.slice(loc.start, loc.end)), file: src.rel, abs: src.abs, code };
}
export const same = (a, b) => (typeof a === "number" || typeof b === "number" ? Math.abs(Number(a) - Number(b)) < 0.006 : String(a).trim().toLowerCase() === String(b).trim().toLowerCase());

// ---------------------------------------------------------------- validation + stale detection (record time)
export function validateTyped(edit) {
  const kind = edit.fields && edit.fields.kind;
  if (!KINDS[kind] || KINDS[kind] !== edit.operation) throw fail(`${edit.operation} needs fields.kind in ${Object.keys(KINDS).filter((k) => KINDS[k] === edit.operation).join("|")}`);
  if (!edit.element_id) throw fail("typed edits need an element_id");
  const keys = KEYS[kind];
  const p = edit.proposed;
  if (!p || typeof p !== "object") throw fail("proposed values are required");
  if (OPTIONAL[kind]) { if (!OPTIONAL[kind].some((k) => p[k] !== undefined)) throw fail(`proposed needs ${OPTIONAL[kind].join(" or ")}`); }
  else for (const k of keys) if (p[k] === undefined) throw fail(`proposed.${k} is required for ${kind}`);
  for (const k of Object.keys(p)) if (!keys.includes(k)) throw fail(`proposed.${k} is not part of ${kind}`);
  if (edit.original != null && typeof edit.original !== "object") throw fail("original must be an object");
  for (const k of keys) if (p[k] !== undefined && k !== "color" && k !== "text" && !Number.isFinite(Number(p[k]))) throw fail(`proposed.${k} must be a number`);
  if (kind === "resize" && !(Number(p.scale) > 0)) throw fail("proposed.scale must be > 0");
  if (kind === "nudge" && ((p.start !== undefined && p.start < 0) || (p.duration != null && !(Number(p.duration) > 0)))) throw fail("start must be >= 0 and duration > 0");
  if (kind === "recolor" && /[<>"'`;]|url\s*\(|javascript:/i.test(String(p.color))) throw fail("unsafe color value");
  return kind;
}
// -> null when fresh, else {reason, current}
export function staleCheck(run, project, edit, index) {
  const cur = readElement(run, project, edit);
  const current = { film_version: index ? index.film_version ?? null : null, build_digest: index ? index.build_digest ?? null : null, element_digest: cur ? cur.digest : null, values: cur ? cur.values : null };
  let reason = null;
  if (index && edit.film_version != null && index.film_version != null && String(edit.film_version) !== String(index.film_version)) reason = "film_version is stale";
  else if (index && edit.build_digest != null && index.build_digest != null && edit.build_digest !== index.build_digest) reason = "build digest is stale";
  else if (index) {
    const item = (index.items || []).find((i) => i.element_id === edit.element_id);
    if (!item) reason = "element not in element-index";
    else if (item.scene_id !== edit.scene_id) reason = "scene does not match the element";
  }
  if (!reason && !cur) reason = "element not found in a unique scene file";
  if (!reason && edit.element_digest != null && edit.element_digest !== cur.digest) reason = "element changed since it was read";
  if (!reason && edit.original && cur) {
    for (const k of Object.keys(edit.original)) if (!(k in cur.values) || !same(cur.values[k], edit.original[k])) { reason = `original ${k} differs from the source`; break; }
  }
  return reason ? { reason, current } : null;
}

// ---------------------------------------------------------------- apply
function setKey(code, el, key, value) {
  const open = locate(code, el).open;
  const t = tokenFind(open, key);
  if (!t) throw fail(`no ${key} token on data-el="${el}" (looked for ${TOKENS[key].join(", ")}): not a simple change`);
  return setToken(code, el, t.name, value);
}
function applyValues(code, el, kind, v) {
  if (kind === "text") return setText(code, el, v.text);
  if (kind === "nudge") {
    const loc = locate(code, el), root = sceneRoot(code);
    if (!root) throw fail("scene has no data-start/data-duration root to bound a retime");
    if (loc.start === root.index) throw fail("retiming the scene itself changes the film events (needs_events_export)");
    const s0 = Number(getAttr(loc.open, "data-start")), d0 = Number(getAttr(loc.open, "data-duration"));
    if (!Number.isFinite(s0) || !Number.isFinite(d0)) throw fail("element has no data-start/data-duration: not a simple retime");
    const start = v.start != null ? Number(v.start) : s0, dur = v.duration != null ? Number(v.duration) : d0;
    if (start < 0 || dur <= 0 || start + dur > root.duration + 1e-6) throw fail(`retime leaves the scene (${start}+${dur} > ${root.duration}s)`);
    code = setToken(code, el, "data-start", start);
    return setToken(code, el, "data-duration", dur);
  }
  for (const k of KEYS[kind]) code = setKey(code, el, k, k === "color" ? v[k] : r2(Number(v[k])));
  return code;
}
// write `values` into the element's source file; atomic. -> {file, digest}
function writeValues(run, project, edit, kind, values) {
  const cur = readElement(run, project, edit);
  if (!cur) throw fail("element not found in a unique scene file");
  const code = applyValues(cur.code, edit.element_id, kind, values);
  if (code === cur.code) throw fail("the edit changes nothing in the source");
  locate(code, edit.element_id);
  const tmp = `${cur.abs}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, code);
  fs.renameSync(tmp, cur.abs);
  return { file: cur.file, digest: core.digestOf(project, [cur.file]) };
}
// Plan 10 U7: write a set of property values (a semantic inverse patch) into one element, atomically; other elements and properties are untouched.
// values: { text?, start?, duration?, x?, y?, scale?, rotation?, color?, z? } -> {file, digest}
export function writeKeys(run, project, edit, values) {
  const cur = readElement(run, project, edit);
  if (!cur) throw fail("element not found in a unique scene file");
  let code = cur.code;
  const v = { ...values };
  if (v.text !== undefined) { code = applyValues(code, edit.element_id, "text", { text: v.text }); delete v.text; }
  if (v.start !== undefined || v.duration !== undefined) { code = applyValues(code, edit.element_id, "nudge", { start: v.start, duration: v.duration }); delete v.start; delete v.duration; }
  for (const k of Object.keys(v)) { if (!TOKENS[k]) throw fail(`cannot restore ${k}`); code = setKey(code, edit.element_id, k, k === "color" ? v[k] : r2(Number(v[k]))); }
  if (code === cur.code) throw fail("the restore changes nothing in the source");
  locate(code, edit.element_id);
  const tmp = `${cur.abs}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, code);
  fs.renameSync(tmp, cur.abs);
  return { file: cur.file, digest: core.digestOf(project, [cur.file]) };
}
const wantOriginal = (edit, kind, cur) => {
  const o = {};
  for (const k of KEYS[kind]) if (k in cur.values) o[k] = cur.values[k];
  return o;
};
// apply a recorded typed edit (checkpoint must exist). Returns {ok:false, conflict:true,...} when original no longer matches.
export function applyTyped(run, project, id) {
  const edit = core.need(run, id);
  if (["applied", "preview_ready", "rendered", "reverted"].includes(edit.status)) throw fail(`edit ${id} is already ${edit.status}`);
  const kind = validateTyped(edit);
  if (!fs.existsSync(path.join(run, "motion", "checkpoints", id, "manifest.json"))) throw fail(`checkpoint first: run \`checkpoint --id ${id}\` before apply-simple`);
  const cur = readElement(run, project, edit);
  if (!cur) throw fail("element not found in a unique scene file");
  const must = edit.original || {};
  for (const k of Object.keys(must)) if (!(k in cur.values) || !same(cur.values[k], must[k])) return { ok: false, conflict: true, id, error: `refused: original ${k} no longer equals the source`, current: { element_digest: cur.digest, values: cur.values } };
  let w;
  try { w = writeValues(run, project, edit, kind, edit.proposed); } catch (e) { return { ok: false, simple: false, id, step: "needs_model", reason: e.message }; }
  const original = edit.original || wantOriginal(edit, kind, cur);
  const after = readElement(run, project, edit);
  const line = core.appendStatus(run, id, {
    original, patch: { files: [w.file], digest: w.digest }, status: edit.status === "requested" ? "accepted" : edit.status, note: "apply-simple changed the source; mark applied next",
    base_state: { file_digest: edit.base_state && edit.base_state.file_digest ? edit.base_state.file_digest : null, element_digest: cur.digest, values: original },
    result_state: { file_digest: w.digest, element_digest: after ? after.digest : null, values: edit.proposed }, affected_properties: Object.keys(edit.proposed || {}),
  });
  return { ok: true, simple: true, id, file: w.file, digest: w.digest, status: line.status, element_digest: after ? after.digest : readElement(run, project, edit).digest };
}

// ---------------------------------------------------------------- undo / redo (inverse records)
function chain(run, id) { // ids derived from this one, newest last
  return core.readLines(run).filter((l) => l.inverse_of === id || l.redo_of === id).map((l) => l.id);
}
function derive(run, project, src, id, extra) {
  const line = {
    schema_version: 1, id, film_version: src.film_version ?? null, time_s: src.time_s, scene_id: src.scene_id, element_id: src.element_id, region_norm: src.region_norm ?? null,
    operation: src.operation, fields: src.fields, instruction: extra.instruction, source: src.source, status: "requested", status_at: new Date().toISOString(), note: extra.note, patch: null,
    original: extra.original, proposed: extra.proposed, ...(extra.link),
  };
  core.appendLine(run, line);
  core.checkpoint(run, id, { project });
  return line;
}
export function undoTyped(run, project, id, newId = null, payloadDigest = null) {
  const edit = core.need(run, id);
  if (!isTyped(edit)) throw fail("not a typed edit");
  if (!["accepted", "applied", "preview_ready", "rendered"].includes(edit.status)) throw fail(`refused: edit ${id} is ${edit.status}, nothing to undo`);
  const kind = validateTyped(edit);
  if (!edit.original) throw fail("refused: edit has no recorded original values");
  const cur = readElement(run, project, edit);
  if (!cur) throw fail("element not found in a unique scene file");
  for (const k of Object.keys(edit.proposed)) if (!same(cur.values[k], edit.proposed[k])) return { ok: false, conflict: true, id, error: `refused: ${k} changed since this edit; undo the later edits first`, current: { element_digest: cur.digest, values: cur.values } };
  const invId = newId || `${id}.undo${chain(run, id).filter((x) => x.includes(".undo")).length + 1}`;
    derive(run, project, edit, invId, { instruction: `undo ${id}`, note: `inverse of ${id}`, original: edit.proposed, proposed: edit.original, link: { inverse_of: id, ...(payloadDigest ? { payload_digest: payloadDigest } : {}), affected_properties: Object.keys(edit.proposed || {}) } });
  const w = writeValues(run, project, edit, kind, edit.original);
  core.appendStatus(run, invId, { patch: { files: [w.file], digest: w.digest }, status: "accepted" });
  core.appendStatus(run, id, { status: "reverted", conflict: null, note: `reverted by ${invId}` });
  return { ok: true, id, status: "reverted", inverse_id: invId, restored: [w.file], digest: w.digest, element_digest: readElement(run, project, edit).digest };
}
export function redoTyped(run, project, id) {
  const edit = core.need(run, id);
  if (!isTyped(edit)) throw fail("not a typed edit");
  if (edit.status !== "reverted") throw fail(`refused: edit ${id} is ${edit.status}; only a reverted edit can be redone`);
  const kind = validateTyped(edit);
  const cur = readElement(run, project, edit);
  if (!cur) throw fail("element not found in a unique scene file");
  for (const k of Object.keys(edit.original || {})) if (!same(cur.values[k], edit.original[k])) return { ok: false, conflict: true, id, error: `refused: ${k} changed since the undo`, current: { element_digest: cur.digest, values: cur.values } };
  const newId = `${id}.redo${chain(run, id).filter((x) => x.includes(".redo")).length + 1}`;
    derive(run, project, edit, newId, { instruction: `redo ${id}`, note: `redo of ${id} (new id)`, original: edit.original, proposed: edit.proposed, link: { redo_of: id } });
  const w = writeValues(run, project, edit, kind, edit.proposed);
  core.appendStatus(run, newId, { patch: { files: [w.file], digest: w.digest }, status: "accepted" });
  return { ok: true, id: newId, redo_of: id, status: "accepted", file: w.file, digest: w.digest, element_digest: readElement(run, project, edit).digest };
}

// A client (Studio) may send undo/redo as a NEW record carrying fields.revert_of:<id>. It is an undo of that id under the same conflict
// rules: the target's own original/proposed are used (the record's values are ignored), a changed element returns {ok:false, conflict:true}
// and appends nothing. The new record takes the client's id. Redo = revert_of the undo record.
export const isRevert = (edit) => !!edit && isTyped(edit) && !!edit.fields && typeof edit.fields.revert_of === "string" && edit.fields.revert_of !== "";
export function revertTyped(run, project, edit, payloadDigest = null) {
  const target = core.latest(run, edit.fields.revert_of);
  if (!target) throw fail(`refused: no edit ${edit.fields.revert_of} to revert`);
  if (target.id === edit.id) throw fail("refused: an edit cannot revert itself");
  const r = undoTyped(run, project, target.id, edit.id, payloadDigest);
  return r.ok ? { ...r, id: edit.id, reverted: target.id } : r;
}

// ---------------------------------------------------------------- check (recorded state equals disk)
export function checkTyped(run, project, edit, problems) {
  let kind;
  try { kind = validateTyped(edit); } catch (e) { problems.push(e.message); return; }
  const cur = readElement(run, project, edit);
  if (!cur) { problems.push(`no unique source for ${edit.element_id}`); return; }
  const all = core.readLines(run);
  const latestIds = []; const seen = new Set();
  for (let i = all.length - 1; i >= 0; i--) if (!seen.has(all[i].id)) { seen.add(all[i].id); latestIds.unshift(all[i]); }
  const pos = latestIds.findIndex((l) => l.id === edit.id);
  // a later typed edit on the same element and keys supersedes this one's recorded state
  const keysOf = (e) => Object.keys(e.proposed || {});
  if (latestIds.slice(pos + 1).some((l) => isTyped(l) && l.element_id === edit.element_id && keysOf(l).some((k) => keysOf(edit).includes(k)))) return;
  const want = edit.status === "reverted" ? edit.original : ["accepted", "applied", "preview_ready", "rendered"].includes(edit.status) ? edit.proposed : null;
  if (!want) return;
  for (const k of KEYS[kind]) if (want[k] !== undefined && !same(cur.values[k], want[k])) problems.push(`${k} on disk is ${JSON.stringify(cur.values[k])}, recorded ${JSON.stringify(want[k])}`);
}

// ---------------------------------------------------------------- describe (client reads digests + values before an edit)
export function describe(run, project, elementId, sceneId) {
  const index = core.readIndex(project);
  const edit = { element_id: elementId, scene_id: sceneId };
  const cur = readElement(run, project, edit);
  if (!cur) return { ok: false, error: `element ${elementId} not found in a unique scene file` };
  return { ok: true, element_id: elementId, element_digest: cur.digest, film_version: index ? index.film_version ?? null : null, build_digest: index ? index.build_digest ?? null : null, values: cur.values, file: cur.file };
}

// ---------------------------------------------------------------- simple tokens: "move headline 10% right", "resize hero 1.2x", "recolor cta #ff0000", ...
const DIRS = { right: [1, 0], left: [-1, 0], up: [0, -1], down: [0, 1] };
export function parseSimple(text, project, run) {
  const t = String(text).trim();
  let m;
  const find = (name) => {
    const index = core.readIndex(project);
    const items = (index && index.items) || [];
    const n = name.trim().toLowerCase().replace(/^the\s+/, "");
    const hits = items.filter((i) => i.element_id.toLowerCase() === n || i.element_id.toLowerCase().split(".").pop() === n || (i.label && String(i.label).toLowerCase() === n));
    if (hits.length !== 1) throw fail(hits.length ? `"${name}" matches ${hits.length} elements; use the full element id` : `no element called "${name}" in the element-index`);
    return hits[0];
  };
  let el, kind, delta;
  if ((m = /^(?:move|nudge)\s+(.+?)\s+(-?[\d.]+)\s*(%|px)\s+(right|left|up|down)$/i.exec(t))) { el = find(m[1]); kind = "move"; delta = { amount: Number(m[2]), unit: m[3], dir: DIRS[m[4].toLowerCase()] }; }
  else if ((m = /^(?:resize|scale)\s+(.+?)\s+(?:by\s+)?([\d.]+)\s*(x|%)$/i.exec(t))) { el = find(m[1]); kind = "resize"; delta = { factor: m[3] === "%" ? Number(m[2]) / 100 : Number(m[2]) }; }
  else if ((m = /^rotate\s+(.+?)\s+(-?[\d.]+)\s*(?:deg|°)?$/i.exec(t))) { el = find(m[1]); kind = "rotate"; delta = { deg: Number(m[2]) }; }
  else if ((m = /^(?:recolor|color)\s+(.+?)\s+(?:to\s+)?(#[0-9a-f]{3,8}|[a-z]+)$/i.exec(t))) { el = find(m[1]); kind = "recolor"; delta = { color: m[2] }; }
  else if ((m = /^(?:set text of|text)\s+(.+?)\s*[:=]\s*(.+)$/i.exec(t))) { el = find(m[1]); kind = "text"; delta = { text: m[2] }; }
  else if ((m = /^(?:delay|start)\s+(.+?)\s+(-?[\d.]+)\s*s$/i.exec(t))) { el = find(m[1]); kind = "nudge"; delta = { start_by: Number(m[2]) }; }
  else if ((m = /^(?:bring|send)\s+(.+?)\s+(forward|backward)$/i.exec(t))) { el = find(m[1]); kind = "reorder"; delta = { z_by: /forward/i.test(m[2]) ? 1 : -1 }; }
  else throw fail(`could not read "${t}" (try: move headline 10% right | resize hero 1.2x | rotate logo 15 | recolor cta #ff0000 | text title: Hello | delay title 0.5s | bring logo forward)`);
  const edit = { element_id: el.element_id, scene_id: el.scene_id, operation: KINDS[kind], fields: { kind } };
  const cur = readElement(run, project, edit);
  if (!cur) throw fail(`element ${el.element_id} not found in a unique scene file`);
  const v = cur.values, need = (k) => { if (v[k] === undefined) throw fail(`no ${k} token on ${el.element_id}: not a simple change`); return Number(v[k]); };
  let proposed;
  if (kind === "move") {
    const fr = core.frameSize(project), dx = delta.dir[0] * delta.amount, dy = delta.dir[1] * delta.amount;
    proposed = {};
    if (dx) proposed.x = r2(need("x") + (delta.unit === "%" ? (dx / 100) * fr.w : dx));
    if (dy) proposed.y = r2(need("y") + (delta.unit === "%" ? (dy / 100) * fr.h : dy));
    // keep both keys so original/proposed shape is stable
    for (const k of ["x", "y"]) if (proposed[k] === undefined) proposed[k] = need(k);
  } else if (kind === "resize") proposed = { scale: r2((v.scale === undefined ? 1 : Number(v.scale)) * delta.factor) };
  else if (kind === "rotate") proposed = { rotation: r2((v.rotation === undefined ? 0 : Number(v.rotation)) + delta.deg) };
  else if (kind === "recolor") proposed = { color: delta.color };
  else if (kind === "text") proposed = { text: delta.text };
  else if (kind === "nudge") proposed = { start: r2(need("start") + delta.start_by) };
  else proposed = { z: need("z") + delta.z_by };
  edit.proposed = proposed;
  edit.original = {};
  for (const k of Object.keys(proposed)) if (k in v) edit.original[k] = v[k];
  edit.element_digest = cur.digest;
  edit.instruction = t;
  return edit;
}
