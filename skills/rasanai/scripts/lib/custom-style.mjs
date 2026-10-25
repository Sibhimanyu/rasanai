// User-owned reusable film styles: <library>/Styles/<slug>/{style.json, DESIGN.md, grammar.json, recipe.json, blend.json,
// specimen.html, SOUND.md?, PREVIEW.md, previews/, history/<revision>.json}. The library root is the Studio's (Brands and Series
// live beside Styles); it is NEVER inside the skill. A style is built on the existing syntax (DESIGN.md read by design-md.mjs,
// grammar.json in grammar-lib.mjs's schema, recipe/blend/specimen as the design desk writes them): no new style syntax.
// customize() takes a CLOSED schema of edits, classifies each one (safe / character-altering / fundamentally different), refuses
// unknown properties and brand-lock conflicts, and always writes a NEW style; the base is never touched. bindSnapshot() copies a
// style's DESIGN.md, grammar and revision into a run so later edits never change an approved film. Zero dependencies.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { SKILL_DIR } from "./common.mjs";
import { readDesignMd, parseColor, contrast } from "./design-md.mjs";
import { VOCAB, validateRecipe } from "./vocab.mjs";
import { validateGrammar } from "./grammar-lib.mjs";
import { checkSystem, chooseSystem } from "./system.mjs";

export const STYLE_FILES = ["DESIGN.md", "grammar.json", "recipe.json", "blend.json", "specimen.html"];
export const rh = (B, r) => { const v = B.roles[r]; return Array.isArray(v) ? v[0] || null : typeof v === "string" ? v : null; };
const readJ = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
const exists = (f) => fs.existsSync(f);
const write = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const inside = (child, parent) => { const r = path.relative(path.resolve(parent), path.resolve(child)); return r === "" || (!r.startsWith("..") && !path.isAbsolute(r)); };

// ---------------------------------------------------------------- the library root
// The Studio passes --library (its projectRoot, default ~/Documents/RasanAI). With no flag: $RASANAI_LIBRARY, else
// $RASANAI_HOME/library when RASANAI_HOME is set (tests, portable setups), else ~/Documents/RasanAI.
export function libraryRoot(arg, env = process.env) {
  const root = arg && arg !== true ? String(arg) : env.RASANAI_LIBRARY ? env.RASANAI_LIBRARY : env.RASANAI_HOME ? path.join(env.RASANAI_HOME, "library") : path.join(os.homedir(), "Documents", "RasanAI");
  const abs = path.resolve(root);
  if (inside(abs, SKILL_DIR)) throw new Error(`the library (${abs}) is inside the installed skill: user styles live outside it, beside Brands and Series (never in skills/rasanai/library/styles/)`);
  return abs;
}
export const stylesDir = (lib) => path.join(lib, "Styles");
export const slugify = (n) => String(n).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
function cleanName(name) {
  const n = String(name === true || name == null ? "" : name).trim();
  if (n.length < 2 || n.length > 60 || /[\u0000-\u001f/\\:]/.test(n)) throw new Error('--name must be 2 to 60 characters with no slashes, colons or control characters (e.g. --name "Warm Ink")');
  if (!slugify(n)) throw new Error("--name needs letters or digits");
  return n;
}

// ---------------------------------------------------------------- hashing (a style is byte-for-byte checkable)
export function dirHash(dir) {
  const h = crypto.createHash("sha256");
  const walk = (d, rel = "") => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const r = path.join(rel, e.name);
      if (e.isDirectory()) walk(path.join(d, e.name), r);
      else { h.update(r + "\0"); h.update(fs.readFileSync(path.join(d, e.name))); h.update("\0"); }
    }
  };
  walk(path.resolve(dir));
  return h.digest("hex");
}
const fileHash = (f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");

// ---------------------------------------------------------------- loading
export function loadStyle(dir) {
  const d = path.resolve(String(dir));
  const meta = readJ(path.join(d, "style.json"));
  if (!meta || typeof meta !== "object") throw new Error(`${d} is not a style (no valid style.json)`);
  for (const f of STYLE_FILES) if (!exists(path.join(d, f))) throw new Error(`${d}: ${f} is missing`);
  const B = readDesignMd(path.join(d, "DESIGN.md"));
  return { dir: d, meta, B, md: fs.readFileSync(path.join(d, "DESIGN.md"), "utf8"), recipe: readJ(path.join(d, "recipe.json")), blend: readJ(path.join(d, "blend.json")), grammar: readJ(path.join(d, "grammar.json")) };
}

export function listStyles(lib) {
  const root = stylesDir(lib);
  const out = [];
  if (!exists(root)) return out;
  for (const e of fs.readdirSync(root, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name.startsWith(".")) continue;
    const m = readJ(path.join(root, e.name, "style.json"));
    if (!m) continue;
    out.push({ slug: e.name, id: m.id, name: m.name, revision: m.revision, version: m.version, origin: m.origin, parent: m.parent ? `${m.parent.id}@${m.parent.revision}` : null, brand_locked: !!m.brand_lock, path: path.join(root, e.name), created: m.created });
  }
  return out.sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

const signatureFeatures = (md) => {
  const sec = (md.match(/^## Signature features[^\n]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m) || [])[1] || "";
  return sec.split("\n").filter((l) => /^\s*(\d+\.|[-*])\s+\S/.test(l)).map((l) => l.replace(/^\s*(\d+\.|[-*])\s+/, "").trim());
};
const DEFAULT_SETTINGS = () => ({ pacing: { tempo: 1 }, shape_density: "balanced", motion: { intensity: 1 }, sound: { instruments: [] }, character_notes: {} });

const PREVIEW_MD = (name) => `# ${name}: preview acceptance

A preview is accepted when the owner has looked at it and said so; nothing here approves a film by itself.

- [ ] \`custom-style.mjs test --style <dir> --duration 20 --out <dir>/previews\` ran: contact strip and MP4 exist (the report says "not run: <reason>" when Chrome or ffmpeg is missing).
- [ ] Title, hero object, camera move, two signature movements, transition and end card read in the style's colours and type.
- [ ] \`custom-style.mjs check --style <dir>\` passes (design.mjs check-system, grammar.mjs check, style.json).
- [ ] If this is a variant: \`custom-style.mjs compare\` was reviewed and the consequences of any character-altering edit were accepted.

## Known limitations

- The test film is code-driven from the style's palette, type, radii, motion contract and grammar; its signature movements are generic archetypes (staggered entrance, landing stamp) labelled with the grammar's own technique names. It diagnoses colour, type and rhythm; it is not a storyboard for a real film.
- Web fonts load over the network when they are not installed; offline, the browser's fallback face draws (the report records which faces loaded).
- Pixels can differ across GPU drivers; the renderer uses software GL (RASANAI_GL=cpu) when asked.
`;

// ---------------------------------------------------------------- create (extract from a run)
export function createFromRun(lib, runArg, nameArg, { label, brand } = {}) {
  const name = cleanName(nameArg);
  const run = path.resolve(String(runArg));
  if (!exists(run)) throw new Error(`run ${runArg} not found`);
  const dec = readJ(path.join(run, "decisions.json")) || {};
  const lab = label && label !== true ? String(label) : (dec.design_system && dec.design_system.label) || (dec.look && dec.look.system);
  if (!lab) throw new Error("the run has no chosen design system (decisions.json design_system.label): pass --label Sure|Bold|Wild");
  const src = path.join(run, "design", lab);
  for (const f of ["DESIGN.md", "recipe.json", "blend.json", "specimen.html"]) if (!exists(path.join(src, f))) throw new Error(`${path.relative(process.cwd(), src)}/${f} is missing: a style is extracted from a complete design system`);
  const gsrc = [path.join(src, "grammar.json"), path.join(run, "look", "grammar.json")].find(exists);
  if (!gsrc) throw new Error("the run's look has no grammar.json: a style carries ONE motion grammar (grammar.mjs write --run <run> --label <label>)");
  const gv = validateGrammar(readJ(gsrc));
  if (gv.errors.length) throw new Error(`the run's grammar is invalid: ${gv.errors[0]}`);
  const B = readDesignMd(path.join(src, "DESIGN.md"));
  const brandFile = brand && brand !== true ? path.resolve(String(brand)) : dec.brand && dec.use_brand !== false && exists(path.resolve(String(dec.brand))) ? path.resolve(String(dec.brand)) : null;
  let brand_lock = null;
  if (brandFile) {
    const BR = readDesignMd(brandFile);
    brand_lock = { source: brandFile, roles: Object.fromEntries(ROLES.filter((r) => rh(BR, r)).map((r) => [r, rh(BR, r)])), display: BR.fonts.display ? BR.fonts.display.family : null, body: BR.fonts.body ? BR.fonts.body.family : null };
  }
  const blend = readJ(path.join(src, "blend.json")) || {};
  const root = stylesDir(lib);
  let slug = slugify(name), n = 2;
  while (exists(path.join(root, slug))) slug = `${slugify(name)}-${n++}`;
  const tmp = path.join(root, `.tmp-${slug}-${process.pid}`);
  fs.mkdirSync(tmp, { recursive: true });
  try {
    for (const f of ["DESIGN.md", "recipe.json", "blend.json", "specimen.html"]) fs.copyFileSync(path.join(src, f), path.join(tmp, f));
    fs.copyFileSync(gsrc, path.join(tmp, "grammar.json"));
    const now = new Date().toISOString();
    const meta = {
      id: slug, name, version: 1, revision: "r1", origin: "run", design_path: "DESIGN.md", grammar_path: "grammar.json", sound_path: null, preview_path: "previews/comparison.png",
      signature_features: signatureFeatures(fs.readFileSync(path.join(tmp, "DESIGN.md"), "utf8")),
      license_sources: [...new Set([...(blend.references || []).map((r) => `library/styles/${r && r.id}`), ...(blend.style_refs || []).map((r) => `library/styles/${typeof r === "string" ? r : r && r.id}`)].filter((s) => !/\/(undefined|null)$/.test(s)))],
      created_from: { run: run, label: lab, system_name: B.name, at: now }, parent: null, settings: DEFAULT_SETTINGS(), brand_lock, created: now,
    };
    write(path.join(tmp, "style.json"), JSON.stringify(meta, null, 2) + "\n");
    write(path.join(tmp, "PREVIEW.md"), PREVIEW_MD(name));
    fs.mkdirSync(path.join(tmp, "previews"));
    writeHistory(tmp, meta, { changes: null, consequences: [] });
    fs.renameSync(tmp, path.join(root, slug));
  } catch (e) {
    fs.rmSync(tmp, { recursive: true, force: true });
    throw e;
  }
  return { ok: true, slug, name, revision: "r1", path: path.join(root, slug), brand_locked: !!brand_lock };
}

function writeHistory(dir, meta, { changes, consequences }) {
  const rec = {
    revision: meta.revision, version: meta.version, style: meta.id, name: meta.name, created: meta.created, parent: meta.parent || null,
    settings: meta.settings, changes: changes || null, consequences: consequences || [],
    files: Object.fromEntries(STYLE_FILES.map((f) => [f, exists(path.join(dir, f)) ? fileHash(path.join(dir, f)) : null])),
  };
  write(path.join(dir, "history", `${meta.revision}.json`), JSON.stringify(rec, null, 2) + "\n");
}

// ---------------------------------------------------------------- the closed schema of edits
const HEX = /^#[0-9a-f]{6}$/i;
const FONT = /^[A-Za-z0-9][A-Za-z0-9 \-]{1,58}$/;
const TEXT = (v) => typeof v === "string" && v.trim().length >= 10 && v.length <= 240 && !/[\u0000-\u001f`<>]/.test(v);
const ROLES = ["canvas", "ink", "accent", "support", "surface", "muted"];
const num = (lo, hi) => (v) => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
const oneOf = (list) => (v) => typeof v === "string" && list.includes(v);
const note = (s) => (v) => s.replace("{v}", String(v));
export const SCHEMA = {
  ...Object.fromEntries(ROLES.map((r) => [`palette.${r}`, { cls: "safe", ok: (v) => typeof v === "string" && HEX.test(v), why: "a #rrggbb colour", brand: "palette" }])),
  "fonts.display": { cls: "safe", ok: (v) => typeof v === "string" && FONT.test(v), why: "a font family name (letters, digits, spaces, hyphens)", brand: "type" },
  "fonts.body": { cls: "safe", ok: (v) => typeof v === "string" && FONT.test(v), why: "a font family name (letters, digits, spaces, hyphens)", brand: "type" },
  "pacing.tempo": { cls: "safe", ok: num(0.5, 2), why: "a number from 0.5 (slower) to 2 (faster)" },
  shape_density: { cls: "safe", ok: oneOf(VOCAB.density), why: `one of ${VOCAB.density.join(", ")}` },
  "sound.instruments": { cls: "safe", ok: (v) => Array.isArray(v) && v.length >= 1 && v.length <= 8 && v.every((x) => typeof x === "string" && /^[A-Za-z0-9][A-Za-z0-9 \-]{1,38}$/.test(x)), why: "1 to 8 instrument names" },
  "motion.intensity": { cls: "safe", ok: num(0.5, 1.5), why: "a number from 0.5 (quieter moves) to 1.5 (bigger moves)" },
  "material.surface": { cls: "character", ok: oneOf(VOCAB.surface), why: `one of ${VOCAB.surface.join(", ")}`, conseq: note("Surfaces are drawn as {v} everywhere: every card, panel and hero object changes material, so every approved preview of this style no longer represents it.") },
  "material.texture": { cls: "character", ok: oneOf(VOCAB.texture), why: `one of ${VOCAB.texture.join(", ")}`, conseq: note("The texture becomes {v}: grain, paper and halftone character of every frame changes.") },
  "layout.preset": { cls: "character", ok: oneOf(VOCAB.layout), why: "a recipe layout (vocab.mjs)", conseq: note("The composition family becomes {v}: where things sit in a frame changes everywhere.") },
  "lighting.logic": { cls: "character", ok: TEXT, why: "10 to 240 characters of plain text", conseq: () => "The lighting logic is rewritten in the Motion and camera section the animators build from: depth, shadow and highlight behaviour changes." },
  "camera.grammar": { cls: "character", ok: TEXT, why: "10 to 240 characters of plain text", conseq: () => "The camera grammar is rewritten: how the camera moves (or stays locked) changes for every scene." },
  "motion.vocabulary": { cls: "character", ok: TEXT, why: "10 to 240 characters of plain text", conseq: () => "The motion vocabulary is rewritten: which entrances, exits and moves the style may use changes, so signature movements will look different." },
};
// breaking the style's core drawing / rendering medium: never an edit, always a new independent style
const FUNDAMENTAL = /^(medium|drawing_medium|rendering_medium|render_engine|renderer|dimension|dimensionality|core_medium|style\.medium)(\.|$)/;
const TOP_KEYS = ["version", "changes", "approve_character_changes", "note"];

// classify and validate a parsed changes.json against the base style. Never mutates anything.
export function classifyChanges(S, spec) {
  const out = { safe: [], character: [], fundamental: [], unknown: [], invalid: [], brand_conflicts: [], errors: [], brand_options: null, consequences: [] };
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) { out.errors.push("the changes file must be a JSON object { \"changes\": { \"<property>\": value } }"); return out; }
  for (const k of Object.keys(spec)) if (!TOP_KEYS.includes(k)) { out.unknown.push(k); out.errors.push(`unknown top-level key "${k}" (allowed: ${TOP_KEYS.join(", ")})`); }
  if (spec.approve_character_changes !== undefined && typeof spec.approve_character_changes !== "boolean") out.errors.push("approve_character_changes must be true or false");
  const ch = spec.changes;
  if (!ch || typeof ch !== "object" || Array.isArray(ch) || !Object.keys(ch).length) { out.errors.push("\"changes\" must be an object with at least one property"); return out; }
  const lock = S.meta.brand_lock;
  for (const [k, v] of Object.entries(ch)) {
    if (FUNDAMENTAL.test(k)) { out.fundamental.push(k); out.errors.push(`"${k}" changes the style's core drawing or rendering medium: that makes a fundamentally different style, so it is not an edit. Make a new independent style instead (custom-style.mjs create --from-run <run> --name "<new name>" from a film drawn that way)`); continue; }
    const def = Object.prototype.hasOwnProperty.call(SCHEMA, k) ? SCHEMA[k] : null;
    if (!def) { out.unknown.push(k); out.errors.push(`unknown property "${k}": not applied (allowed: ${Object.keys(SCHEMA).join(", ")})`); continue; }
    if (!def.ok(v)) { out.invalid.push(k); out.errors.push(`"${k}" must be ${def.why}`); continue; }
    if (lock && def.brand) {
      const want = def.brand === "palette" ? lock.roles[k.split(".")[1]] : lock.display && k === "fonts.display" ? lock.display : k === "fonts.body" ? lock.body : null;
      if (want && String(want).toLowerCase() !== String(v).toLowerCase()) { out.brand_conflicts.push(k); out.errors.push(`brand lock: ${k} is ${want} in the locked brand (${path.basename(path.dirname(lock.source))}); a film in this brand cannot take ${v}`); continue; }
    }
    (def.cls === "safe" ? out.safe : out.character).push(k);
    if (def.cls === "character") out.consequences.push({ property: k, from: currentValue(S, k), to: v, consequence: def.conseq(v) });
  }
  if (out.brand_conflicts.length) out.brand_options = ["pacing.tempo", "shape_density", "sound.instruments", "motion.intensity", "motion.vocabulary", "camera.grammar", "lighting.logic", "material.surface", "material.texture", "layout.preset"].filter((p) => !(lock && SCHEMA[p].brand));
  return out;
}
function currentValue(S, k) {
  const r = (S.recipe && S.recipe.recipe) || {}, s = S.meta.settings || {};
  const map = { "material.surface": r.surface, "material.texture": r.texture, "layout.preset": r.layout, "lighting.logic": (s.character_notes || {}).lighting, "camera.grammar": (s.character_notes || {}).camera, "motion.vocabulary": (s.character_notes || {}).vocabulary };
  return map[k] ?? null;
}

// ---------------------------------------------------------------- applying edits
function swapAll(text, pairs) {
  // two phases, so a swap of two colours (or fonts) does not collide
  let t = text;
  pairs.forEach(([a], i) => { t = t.replace(new RegExp(esc(a), "gi"), `\u0001${i}\u0002`); });
  pairs.forEach(([, b], i) => { t = t.split(`\u0001${i}\u0002`).join(b); });
  return t;
}
const MARK_A = "<!-- custom-style:begin -->", MARK_B = "<!-- custom-style:end -->";
function motionBlock(settings) {
  const L = [];
  const s = settings || DEFAULT_SETTINGS();
  if (s.pacing && s.pacing.tempo !== 1) L.push(`- **Pacing (custom).** Run every duration above at tempo x${s.pacing.tempo} (divide each duration by ${s.pacing.tempo}); holds keep their order.`);
  if (s.motion && s.motion.intensity !== 1) L.push(`- **Move intensity (custom).** Scale every travel distance, push and scale-change above by ${s.motion.intensity}.`);
  if (s.shape_density && s.shape_density !== "balanced") L.push(`- **Shape density (custom).** ${s.shape_density === "airy" ? "Fewer, larger shapes with more empty ground" : "More, smaller shapes; fill the ground"}.`);
  const n = s.character_notes || {};
  if (n.camera) L.push(`- **Camera grammar (custom).** ${n.camera}`);
  if (n.lighting) L.push(`- **Lighting logic (custom).** ${n.lighting}`);
  if (n.vocabulary) L.push(`- **Motion vocabulary (custom).** ${n.vocabulary}`);
  return L.length ? `${MARK_A}\n${L.join("\n")}\n${MARK_B}\n` : "";
}
function applyMotionBlock(md, settings) {
  let t = md.replace(new RegExp(`${esc(MARK_A)}[\\s\\S]*?${esc(MARK_B)}\\n?`, "g"), "");
  const block = motionBlock(settings);
  if (!block) return t;
  const m = t.match(/^##\s+Motion and camera[^\n]*\n[\s\S]*?(?=\n##\s|(?![\s\S]))/mi);
  if (!m) throw new Error("DESIGN.md has no Motion and camera section to carry the edits");
  const end = m.index + m[0].length;
  return t.slice(0, end).replace(/\n*$/, "\n") + block + (t.slice(end).startsWith("\n") ? t.slice(end) : "\n" + t.slice(end));
}
const soundMd = (name, inst) => `# ${name}: sound identity\n\nInstruments the score and foley draw from, in order of importance:\n\n${inst.map((x) => `- ${x}`).join("\n")}\n`;

// returns { ok, slug, path, ... } or { ok:false, ... } and writes nothing on a rejection
export function customize(styleDir, changesFile, nameArg) {
  const S = loadStyle(styleDir);
  const name = cleanName(nameArg);
  let spec;
  try {
    if (fs.statSync(changesFile).size > 100000) throw new Error("the changes file is over 100 KB");
    spec = JSON.parse(fs.readFileSync(changesFile, "utf8"));
  } catch (e) { return { ok: false, rejected: true, errors: [`the changes file can't be read as JSON: ${e.message}`], classification: null }; }
  const cls = classifyChanges(S, spec);
  const view = { safe: cls.safe, character_altering: cls.character, fundamentally_different: cls.fundamental, unknown: cls.unknown, invalid: cls.invalid, brand_conflicts: cls.brand_conflicts };
  if (cls.errors.length) return { ok: false, rejected: true, classification: view, errors: cls.errors, ...(cls.brand_options ? { brand_permitted_options: cls.brand_options } : {}) };
  if (cls.character.length && spec.approve_character_changes !== true) return { ok: false, rejected: true, needs_approval: true, classification: view, consequences: cls.consequences, errors: ['character-altering edits change what this style is: review "consequences", then set "approve_character_changes": true in the changes file (a new version is written either way; the base stays as it is)'] };
  const root = path.dirname(S.dir);
  let slug = slugify(name);
  if (exists(path.join(root, slug))) return { ok: false, rejected: true, classification: view, errors: [`a style "${slug}" already exists: customize never overwrites; pick another --name`] };

  const ch = spec.changes;
  const tmp = path.join(root, `.tmp-${slug}-${process.pid}`);
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  try {
    for (const f of [...STYLE_FILES, "SOUND.md"]) if (exists(path.join(S.dir, f))) fs.copyFileSync(path.join(S.dir, f), path.join(tmp, f));
    if (exists(path.join(S.dir, "history"))) fs.cpSync(path.join(S.dir, "history"), path.join(tmp, "history"), { recursive: true });
    fs.mkdirSync(path.join(tmp, "previews"));
    const T = (f) => path.join(tmp, f);
    let texts = { "DESIGN.md": S.md, "recipe.json": fs.readFileSync(T("recipe.json"), "utf8"), "specimen.html": fs.readFileSync(T("specimen.html"), "utf8") };
    const pairs = [];
    const roleOwners = {};
    for (const r of ROLES) if (rh(S.B, r)) (roleOwners[rh(S.B, r).toLowerCase()] = roleOwners[rh(S.B, r).toLowerCase()] || []).push(r);
    for (const k of cls.safe.filter((x) => x.startsWith("palette."))) {
      const role = k.split(".")[1], old = rh(S.B, role);
      if (!old) throw new Error(`the style has no ${role} colour to change`);
      if (roleOwners[old.toLowerCase()].length > 1 && !roleOwners[old.toLowerCase()].every((r) => ch[`palette.${r}`] !== undefined && String(ch[`palette.${r}`]).toLowerCase() === String(ch[k]).toLowerCase())) throw new Error(`palette.${role} ${old} is also used by ${roleOwners[old.toLowerCase()].filter((r) => r !== role).join(", ")}: change them together to the same colour`);
      if (String(ch[k]).toLowerCase() !== old.toLowerCase() && !pairs.some(([a]) => a.toLowerCase() === old.toLowerCase())) pairs.push([old, String(ch[k]).toLowerCase()]);
    }
    const fontPairs = [];
    const dF = S.B.fonts.display && S.B.fonts.display.family, bF = S.B.fonts.body && S.B.fonts.body.family;
    if (ch["fonts.display"] !== undefined && ch["fonts.body"] === undefined && dF && bF && dF === bF) throw new Error("display and body share one family: change fonts.display and fonts.body together");
    if (ch["fonts.body"] !== undefined && ch["fonts.display"] === undefined && dF && bF && dF === bF) throw new Error("display and body share one family: change fonts.display and fonts.body together");
    for (const [k, old] of [["fonts.display", dF], ["fonts.body", bF]]) if (ch[k] !== undefined && old && old !== ch[k]) { fontPairs.push([old, ch[k]]); fontPairs.push([old.replace(/ /g, "+"), String(ch[k]).replace(/ /g, "+")]); }
    for (const f of Object.keys(texts)) {
      if (pairs.length) texts[f] = swapAll(texts[f], pairs);
      if (fontPairs.length) { let t = texts[f]; fontPairs.forEach(([a], i) => { t = t.split(a).join(`\u0001${i}\u0002`); }); fontPairs.forEach(([, b], i) => { t = t.split(`\u0001${i}\u0002`).join(b); }); texts[f] = t; }
    }
    const rec = JSON.parse(texts["recipe.json"]);
    if (!rec.recipe) throw new Error("recipe.json has no recipe");
    if (ch.shape_density !== undefined) rec.recipe.density = ch.shape_density;
    if (ch["material.surface"] !== undefined) rec.recipe.surface = ch["material.surface"];
    if (ch["material.texture"] !== undefined) rec.recipe.texture = ch["material.texture"];
    if (ch["layout.preset"] !== undefined) rec.recipe.layout = ch["layout.preset"];
    const rp = validateRecipe(rec.recipe);
    if (rp.length) throw new Error(`the edited recipe would not draw: ${rp[0]}`);
    rec.name = name;
    texts["recipe.json"] = JSON.stringify(rec, null, 2) + "\n";

    const settings = JSON.parse(JSON.stringify(S.meta.settings || DEFAULT_SETTINGS()));
    settings.character_notes = settings.character_notes || {};
    if (ch["pacing.tempo"] !== undefined) settings.pacing = { tempo: ch["pacing.tempo"] };
    if (ch.shape_density !== undefined) settings.shape_density = ch.shape_density;
    if (ch["motion.intensity"] !== undefined) settings.motion = { intensity: ch["motion.intensity"] };
    if (ch["sound.instruments"] !== undefined) settings.sound = { instruments: ch["sound.instruments"].map((x) => x.trim()) };
    if (ch["camera.grammar"] !== undefined) settings.character_notes.camera = ch["camera.grammar"].trim();
    if (ch["lighting.logic"] !== undefined) settings.character_notes.lighting = ch["lighting.logic"].trim();
    if (ch["motion.vocabulary"] !== undefined) settings.character_notes.vocabulary = ch["motion.vocabulary"].trim();
    let md = applyMotionBlock(texts["DESIGN.md"], settings);
    md = md.replace(/^(name:\s*).*$/m, `$1${JSON.stringify(name)}`).replace(/^# .*$/m, `# ${name}`);
    texts["DESIGN.md"] = md;
    for (const [f, t] of Object.entries(texts)) write(T(f), t);
    if (settings.sound.instruments.length) write(T("SOUND.md"), soundMd(name, settings.sound.instruments));

    // the new style must itself read, contrast and validate
    const B2 = readDesignMd(T("DESIGN.md"));
        for (const r of ["canvas", "ink", "accent"]) if (rh(B2, r) !== (ch[`palette.${r}`] ? String(ch[`palette.${r}`]).toLowerCase() : rh(S.B, r))) throw new Error(`the edited DESIGN.md did not take ${r} (${rh(B2, r)}): the colour is written in a form this editor does not replace`);
    if (contrast(rh(B2, "ink"), rh(B2, "canvas")) < 4.5) throw new Error(`ink ${rh(B2, "ink")} on canvas ${rh(B2, "canvas")} is ${contrast(rh(B2, "ink"), rh(B2, "canvas")).toFixed(2)}:1 (needs 4.5:1): a safe variation stays legible`);
    if (ch["fonts.display"] && B2.fonts.display.family !== ch["fonts.display"]) throw new Error("the edited DESIGN.md did not take the display font");
    const gv = validateGrammar(readJ(T("grammar.json")));
    if (gv.errors.length) throw new Error(`grammar.json: ${gv.errors[0]}`);
    const now = new Date().toISOString();
    const parentRev = S.meta.revision || `r${S.meta.version || 1}`;
    const version = (S.meta.version || 1) + 1;
    const meta = {
      ...S.meta, id: slug, name, version, revision: `r${version}`, origin: "customized", sound_path: settings.sound.instruments.length ? "SOUND.md" : S.meta.sound_path || null,
      signature_features: signatureFeatures(md), license_sources: S.meta.license_sources || [],
      created_from: S.meta.created_from, parent: { id: S.meta.id, name: S.meta.name, revision: parentRev, hash: dirHash(S.dir) }, settings, created: now,
      revision_notes: [{ revision: `r${version}`, at: now, changes: ch, classes: { safe: cls.safe, character_altering: cls.character }, consequences: cls.consequences, note: typeof spec.note === "string" ? spec.note.slice(0, 300) : null }, ...(S.meta.revision_notes || [])],
    };
    write(T("style.json"), JSON.stringify(meta, null, 2) + "\n");
    write(T("PREVIEW.md"), PREVIEW_MD(name));
    writeHistory(tmp, meta, { changes: ch, consequences: cls.consequences });
    const sys = checkSystem(tmp, { offline: true, label: slug });
    if (sys.P.length) throw new Error(`design check-system (structure): ${sys.P[0]}`);
    fs.renameSync(tmp, path.join(root, slug));
    return { ok: true, slug, name, revision: meta.revision, path: path.join(root, slug), parent: meta.parent, classification: view, consequences: cls.consequences, warnings: sys.W, next: `custom-style.mjs compare --base ${S.dir} --candidate ${path.join(root, slug)} --out ${path.join(root, slug, "previews", "comparison.png")}` };
  } catch (e) {
    fs.rmSync(tmp, { recursive: true, force: true });
    return { ok: false, rejected: true, classification: view, errors: [e.message] };
  }
}

// ---------------------------------------------------------------- snapshot into a run
// <run>/style-snapshot/{DESIGN.md, grammar.json, revision.json}: copies, read-only, with the style's revision and hashes.
// With asLook the snapshot also becomes the film's look (design/Custom/ -> design.mjs choose-system's own path).
export function bindSnapshot(styleDir, runArg, { asLook = false, rebind = false } = {}) {
  const S = loadStyle(styleDir);
  const run = path.resolve(String(runArg));
  if (!exists(run)) throw new Error(`run ${runArg} not found`);
  const dest = path.join(run, "style-snapshot");
  if (exists(path.join(dest, "revision.json")) && !rebind) {
    const cur = readJ(path.join(dest, "revision.json"));
    if (cur && cur.style_id === S.meta.id && cur.revision === S.meta.revision) return { ok: true, kept: true, snapshot: dest, ...cur };
    throw new Error(`the run already holds a snapshot of ${cur && cur.style_id}@${cur && cur.revision}: an approved film keeps its style (pass --rebind to replace it on purpose)`);
  }
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  const rec = { style_id: S.meta.id, name: S.meta.name, revision: S.meta.revision, version: S.meta.version, source: S.dir, style_hash: dirHash(S.dir), bound_at: new Date().toISOString(), files: {}, brand_lock: S.meta.brand_lock ? { source: S.meta.brand_lock.source } : null, settings: S.meta.settings };
  for (const f of ["DESIGN.md", "grammar.json", "recipe.json", "blend.json", "specimen.html", ...(S.meta.sound_path ? ["SOUND.md"] : [])]) {
    const d = path.join(dest, f);
    fs.copyFileSync(path.join(S.dir, f), d);
    fs.chmodSync(d, 0o444);
    rec.files[f] = fileHash(d);
  }
  write(path.join(dest, "revision.json"), JSON.stringify(rec, null, 2) + "\n");
  fs.chmodSync(path.join(dest, "revision.json"), 0o444);
  const dp = path.join(run, "decisions.json");
  const D = readJ(dp) || {};
  D.custom_style = { id: S.meta.id, name: S.meta.name, revision: S.meta.revision, hash: rec.style_hash, snapshot: path.relative(process.cwd(), dest) };
  write(dp, JSON.stringify(D, null, 2) + "\n");
  let look = null;
  if (asLook) {
    const dd = path.join(run, "design", "Custom");
    fs.mkdirSync(dd, { recursive: true });
    for (const f of ["DESIGN.md", "grammar.json", "recipe.json", "blend.json", "specimen.html"]) fs.copyFileSync(path.join(dest, f), path.join(dd, f));
    look = chooseSystem(run, "Custom", dp);
  }
  return { ok: true, kept: false, snapshot: dest, ...rec, look: look ? look.design_md : null };
}

// ---------------------------------------------------------------- inspect / check
export function inspectStyle(dir) {
  const S = loadStyle(dir);
  const sys = checkSystem(S.dir, { offline: true, label: S.meta.id });
  const gv = validateGrammar(S.grammar);
  const hist = exists(path.join(S.dir, "history")) ? fs.readdirSync(path.join(S.dir, "history")).filter((f) => f.endsWith(".json")).sort() : [];
  return {
    ok: true, id: S.meta.id, name: S.meta.name, revision: S.meta.revision, version: S.meta.version, origin: S.meta.origin, path: S.dir, parent: S.meta.parent || null,
    palette: Object.fromEntries(ROLES.filter((r) => rh(S.B, r)).map((r) => [r, rh(S.B, r)])), fonts: { display: S.B.fonts.display && S.B.fonts.display.family, body: S.B.fonts.body && S.B.fonts.body.family },
    grammar: S.grammar && S.grammar.id, settings: S.meta.settings, signature_features: S.meta.signature_features, license_sources: S.meta.license_sources,
    brand_lock: S.meta.brand_lock ? { source: S.meta.brand_lock.source, locked: ["palette", "type", "logo"], allowed_edits: ["pacing.tempo", "shape_density", "sound.instruments", "motion.intensity", "motion.vocabulary", "camera.grammar", "lighting.logic", "material.*", "layout.preset"] } : null,
    history: hist, hash: dirHash(S.dir), structure: { problems: sys.P, warnings: sys.W }, grammar_errors: gv.errors,
    editable_properties: Object.fromEntries(Object.entries(SCHEMA).map(([k, v]) => [k, { class: v.cls, accepts: v.why }])),
  };
}

const STYLE_JSON_KEYS = ["id", "name", "version", "origin", "design_path", "grammar_path", "sound_path", "signature_features", "license_sources", "created_from", "preview_path"];
export function checkMeta(S) {
  const P = [];
  for (const k of STYLE_JSON_KEYS) if (!(k in S.meta)) P.push(`style.json is missing "${k}"`);
  if (S.meta.id && S.meta.id !== path.basename(S.dir)) P.push(`style.json id "${S.meta.id}" is not the folder name "${path.basename(S.dir)}"`);
  if (!/^r\d+$/.test(String(S.meta.revision))) P.push("style.json revision must look like r1");
  if (!exists(path.join(S.dir, "history", `${S.meta.revision}.json`))) P.push(`history/${S.meta.revision}.json is missing`);
  if (S.meta.sound_path && !exists(path.join(S.dir, S.meta.sound_path))) P.push(`sound_path ${S.meta.sound_path} is missing`);
  if (S.meta.brand_lock) {
    for (const r of ["canvas", "ink", "accent"]) if (S.meta.brand_lock.roles[r] && rh(S.B, r) && S.meta.brand_lock.roles[r].toLowerCase() !== rh(S.B, r).toLowerCase()) P.push(`brand lock: ${r} is ${rh(S.B, r)} but the locked brand's is ${S.meta.brand_lock.roles[r]}`);
    if (S.meta.brand_lock.display && S.B.fonts.display && S.meta.brand_lock.display.toLowerCase() !== S.B.fonts.display.family.toLowerCase()) P.push(`brand lock: display face is ${S.B.fonts.display.family} but the locked brand's is ${S.meta.brand_lock.display}`);
  }
  return P;
}

export function copyForCheck(dir, tmpRoot) {
  const d = path.join(tmpRoot, "check", path.basename(path.resolve(dir)));
  fs.rmSync(d, { recursive: true, force: true });
  fs.mkdirSync(d, { recursive: true });
  for (const f of [...STYLE_FILES, "SOUND.md"]) if (exists(path.join(dir, f))) fs.copyFileSync(path.join(dir, f), path.join(d, f));
  return d;
}
