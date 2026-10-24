// Motion-kit catalog loading and validation (contract B). Zero-dependency.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_CATALOG = path.resolve(HERE, "../../../motion-kit/catalog.json");
export const FAMILIES = ["kinetic-type", "product-ui", "shape", "camera-space", "sound-hit", "data-evidence", "texture", "ending"];
export const ROLES = ["entry", "emphasis", "exit", "transition", "background", "scene", "ending"];
const SUPPORTS = ["dom-gsap", "stage3d"];
const PTYPES = ["number", "string", "enum", "boolean"];

export function loadCatalog(file) {
  const p = path.resolve(file || DEFAULT_CATALOG);
  if (!fs.existsSync(p)) { const e = new Error(`catalog not found: ${p}`); e.code = "NOCATALOG"; throw e; }
  let data;
  try { data = JSON.parse(fs.readFileSync(p, "utf8")); } catch (err) { throw new Error(`catalog is not valid JSON: ${err.message}`); }
  return { file: p, data, items: Array.isArray(data.items) ? data.items : [] };
}

export function findItem(items, id, version) {
  return items.find((i) => i.id === id && (version == null || Number(i.version) === Number(version))) || null;
}

export function validateCatalog(data) {
  const errors = [], warnings = [];
  const err = (id, m) => errors.push(`${id}: ${m}`);
  if (!data || typeof data !== "object") return { errors: ["catalog is not an object"], warnings, stats: {} };
  if (data.schema_version !== 1) err("catalog", "schema_version must be 1");
  if (!Array.isArray(data.items)) { err("catalog", "items must be an array"); return { errors, warnings, stats: {} }; }
  const seen = new Set(), perFamily = {};
  for (const [n, it] of data.items.entries()) {
    const id = it && it.id ? it.id : `items[${n}]`;
    if (!it || typeof it !== "object") { err(id, "not an object"); continue; }
    if (seen.has(it.id)) err(id, "duplicate id");
    seen.add(it.id);
    for (const k of ["id", "label", "family", "role", "summary", "use_when", "avoid_when", "implementation", "reduced_motion"])
      if (typeof it[k] !== "string" || !it[k].trim()) err(id, `missing string field ${k}`);
    if (!Number.isInteger(it.version) || it.version < 1) err(id, "version must be a positive integer");
    if (it.family && !FAMILIES.includes(it.family)) err(id, `unknown family ${it.family}`);
    if (it.role && !ROLES.includes(it.role)) err(id, `unknown role ${it.role}`);
    if (it.id && it.family && !it.id.startsWith(`${it.family}-`)) warnings.push(`${id}: id should start with family "${it.family}-"`);
    if (it.id && !/-v\d+$/.test(it.id)) warnings.push(`${id}: id should end with -v<N>`);
    if (!Array.isArray(it.supports) || !it.supports.length || it.supports.some((s) => !SUPPORTS.includes(s))) err(id, "supports must be a non-empty list of dom-gsap|stage3d");
    for (const k of ["brand_inputs", "motion_inputs", "requires_assets"]) if (!Array.isArray(it[k])) err(id, `${k} must be an array`);
    if (it.seek_safe !== true) err(id, "seek_safe must be true");
    if (it.implementation && !/^[\w./-]+\.js:\w+$/.test(it.implementation)) err(id, "implementation must look like path.js:fnName");
    if (!it.params || typeof it.params !== "object") err(id, "params must be an object");
    else for (const [pn, pd] of Object.entries(it.params)) {
      if (!pd || !PTYPES.includes(pd.type)) { err(id, `param ${pn}: bad type`); continue; }
      if (pd.type === "number") {
        if (typeof pd.min === "number" && typeof pd.max === "number" && pd.min > pd.max) err(id, `param ${pn}: min > max`);
        if (typeof pd.default === "number" && ((typeof pd.min === "number" && pd.default < pd.min) || (typeof pd.max === "number" && pd.default > pd.max))) err(id, `param ${pn}: default out of range`);
      }
      if (pd.type === "enum" && (!Array.isArray(pd.enum) || !pd.enum.includes(pd.default))) err(id, `param ${pn}: default not in enum`);
    }
    if (!["original", "reused-rasan"].includes(it.origin)) err(id, "origin must be original|reused-rasan");
    if (typeof it.license !== "string" || !it.license) err(id, "missing license");
    if (it.fixture != null && typeof it.fixture !== "string") err(id, "fixture must be string or null");
    perFamily[it.family] = (perFamily[it.family] || 0) + 1;
  }
  for (const f of FAMILIES) if ((perFamily[f] || 0) < 4) warnings.push(`family ${f} has ${perFamily[f] || 0} items (target >= 4)`);
  if (data.items.length < 24 || data.items.length > 40) warnings.push(`${data.items.length} items (target 24-40)`);
  return { errors, warnings, stats: { items: data.items.length, per_family: perFamily } };
}
