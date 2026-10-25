// Render dependency compiler and content keys (Plan 09 P5). Pure and file-reading only: nothing is rendered, no browser is launched.
//
// The render graph is DERIVED from the existing authorities: motion/score.json (timing, seams, effects), the route's cut authority, the scene code
// (index.html + sub-compositions), asset manifests and the layer/effect settings. motion/events.json stays derived (lib/timing.mjs writeEvents).
// This module never becomes a second editable score: it reads, hashes and reports. lib/hybrid-graph (restored from phase2/hybrid-film-studio) builds the node
// graph and calls sceneDeps() here for the part it never had: what is INSIDE a scene (code bytes, includes, fonts, shared components).
//
//   scrub(obj, {root})               drops secrets, wall-clock stamps and temp paths so a key never carries them
//   scanSource(text, {file})         static scan of one html/js/css file: local refs, remote refs, fonts, dynamic or non-deterministic constructs
//   closure(project, entryRel)       the include tree of one entry file with byte digests (bounded)
//   sceneDeps({project, score, ...}) -> { scenes: { <id>: { entry, files, fonts, dynamic, global_time, conservative, ... } }, shared, project_digest }
//   consumersOf(deps, ref)           transitive: every scene that includes a changed font/component/asset
//   boundaryTime(score, sceneId)     the neighbours whose time a scene's transition reads (a hard cut is a low-coupling boundary: none)
//   renderKeyBody(o) / renderKey(o)  the full key body and its digest
//   invalidationCauses(oldBody, newBody) which parts of a key changed, as readable causes (cache-miss reasons, evidence hooks)
//
// UNKNOWN dynamic dependencies (fetch/import(), eval, remote URLs, a scene file that cannot be read, an inline scene in index.html) make the scene CONSERVATIVE: its key
// then includes a digest of the whole project tree, so any change rebuilds it. Never report an unaffected hit just because a scene file name stayed the same.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { canonicalDigest } from "./contracts.mjs";

export const KEY_SCHEMA = 1;
const TEXT_EXT = new Set([".html", ".htm", ".js", ".mjs", ".css", ".svg", ".md", ".txt"]);
const CONFIG_EXT = new Set([".json"]);
const FONT_EXT = new Set([".woff2", ".woff", ".ttf", ".otf"]);
const SKIP_DIRS = new Set(["hybrid", "renders", "node_modules", ".git", ".hyperframes", "snapshots", "exports", "crew", ".DS_Store"]);
const MAX_FILES = 400, MAX_DEPTH = 6, MAX_BYTES = 64 << 20;
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const rf = (f) => { try { return fs.readFileSync(f); } catch { return null; } };
const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);

// ---- scrub: nothing secret, temporary or wall-clock goes into a key ---------------------------------------------------------------------
const SECRET_KEY = /(^|[_-])(secret|token|password|passwd|api[_-]?key|apikey|authorization|auth|credential|cookie|bearer|private[_-]?key)s?($|[_-])/i;
const VOLATILE_KEY = /(^|_)(created|updated|generated|completed|started|finished|modified|rendered|produced|retrieved)_at$|^(wall_?clock|timestamp|now|date)$|(^|_)timestamp$|^mtime$|^pid$|^tmp(_?dir|_?path)?$/i;
const TEMP_PATH = (s) => typeof s === "string" && (s.startsWith(os.tmpdir() + path.sep) || /^\/(tmp|var\/folders|private\/var\/folders|private\/tmp)\//.test(s) || /[\\/]\.tmp-|\.work-[0-9a-f]/.test(s));
// `intended_time: [..keys]` on the object lists wall-clock keys that really define the output (a burned-in date); those are kept
export function scrub(v, { root = null, keep = [] } = {}) {
  const keepSet = new Set(keep);
  const go = (x, key) => {
    if (Array.isArray(x)) return x.map((i) => go(i, key)).filter((i) => i !== undefined);
    if (isObj(x)) {
      const kk = new Set([...keepSet, ...arr(x.intended_time)]);
      const out = {};
      for (const k of Object.keys(x).sort()) {
        if (k === "intended_time") continue;
        if (SECRET_KEY.test(k)) continue;
        if (VOLATILE_KEY.test(k) && !kk.has(k)) continue;
        const r = go(x[k], k);
        if (r !== undefined) out[k] = r;
      }
      return out;
    }
    if (typeof x === "string") {
      if (TEMP_PATH(x)) return undefined;
      if (root && path.isAbsolute(x) && x.startsWith(path.resolve(root) + path.sep)) return path.relative(root, x); // a path inside the project is its relative name
      return x;
    }
    if (typeof x === "number" && !Number.isFinite(x)) return null;
    return x;
  };
  return go(v, "");
}

// ---- digests ----------------------------------------------------------------------------------------------------------------------
// config (json): normalized = parsed and key-sorted, so key order and spacing never change a key. source code and media: the BYTES.
export function fileDigest(file) {
  const buf = rf(file);
  if (!buf) return { exists: false, bytes_sha256: null, kind: "missing" };
  const ext = path.extname(file).toLowerCase();
  const bytes = sha(buf);
  if (CONFIG_EXT.has(ext)) { try { return { exists: true, kind: "config", bytes_sha256: bytes, normalized_sha256: canonicalDigest(scrub(JSON.parse(buf.toString("utf8")))), size: buf.length }; } catch { /* invalid json is hashed as bytes */ } }
  return { exists: true, kind: TEXT_EXT.has(ext) ? "source" : FONT_EXT.has(ext) ? "font" : "asset", bytes_sha256: bytes, size: buf.length };
}
// the value that goes into a key for a file: normalized for config, bytes otherwise
export const keyDigest = (d) => (d.kind === "config" && d.normalized_sha256 ? d.normalized_sha256 : d.bytes_sha256);

// digest of the whole project tree: the CONSERVATIVE input for a scene whose dependencies cannot be fully known
export function projectTreeDigest(project) {
  const root = path.resolve(project), rows = [];
  let bytes = 0;
  const walk = (d, depth) => {
    if (depth > 12 || rows.length > 5000) return;
    let ents = []; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents.sort((a, b) => a.name.localeCompare(b.name))) {
      if (SKIP_DIRS.has(e.name)) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else if (e.isFile()) { try { const st = fs.statSync(p); bytes += st.size; rows.push([path.relative(root, p), st.size > MAX_BYTES ? `size:${st.size}` : fileDigest(p).bytes_sha256]); } catch {} }
    }
  };
  walk(root, 0);
  return { digest: canonicalDigest(rows), files: rows.length, truncated: rows.length > 5000 || bytes > 8 * MAX_BYTES };
}

// ---- scanning one file --------------------------------------------------------------------------------------------------------------
const ATTR_SRC = /\b(?:src|href|data-composition-src|data-src|poster)\s*=\s*("([^"]*)"|'([^']*)')/gi;
const CSS_URL = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]+))\s*\)/gi;
const CSS_IMPORT = /@import\s+(?:url\()?\s*["']([^"']+)["']/gi;
const JS_IMPORT = /(?:^|[\s;])(?:import\s+(?:[^'"]*?\sfrom\s+)?|export\s+[^'"]*?\sfrom\s+)["']([^"']+)["']/g;
const FONT_FACE = /@font-face\s*\{[^}]*font-family\s*:\s*["']?([^;"'}]+)["']?/gi;
const FONT_USE = /font-family\s*:\s*([^;}"]+)/gi;
const DYNAMIC = [
  [/\bfetch\s*\(/, "fetch()"], [/\bimport\s*\(/, "dynamic import()"], [/\bXMLHttpRequest\b/, "XMLHttpRequest"], [/\beval\s*\(/, "eval()"], [/\bnew\s+Function\b/, "new Function"],
  [/\bdocument\.cookie\b|\blocalStorage\b|\bsessionStorage\b/, "browser storage"], [/\blocation\.(search|hash)\b/, "location query"],
];
const NONDET = [[/\bMath\.random\s*\(/, "Math.random() (unseeded)"], [/\bDate\.now\s*\(|\bnew\s+Date\s*\(\s*\)/, "wall-clock Date"], [/\bperformance\.now\s*\(/, "performance.now()"]];
const GLOBAL_TIME = /global[_-]?time|film[_-]?time|data-global-start|window\.__rasan(?:Film)?Time|__hf(?:Global)?Time/i;
const GENERIC_FONTS = new Set(["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "ui-serif", "ui-sans-serif", "ui-monospace", "inherit", "initial", "unset", "emoji", "math", "fangsong"]);

// -> { refs:[{kind:"local"|"remote"|"data", ref}], font_faces:[family], font_uses:[family], dynamic:[reason], nondeterministic:[reason], global_time:boolean }
export function scanSource(text, { file = "" } = {}) {
  const t = String(text || ""), refs = [], seen = new Set();
  const add = (ref) => {
    const r = String(ref || "").trim();
    if (!r || r.startsWith("#") || /^(mailto|tel|javascript):/i.test(r) || seen.has(r)) return;
    seen.add(r);
    refs.push({ kind: /^data:/i.test(r) ? "data" : /^(https?:)?\/\//i.test(r) ? "remote" : "local", ref: r.split(/[?#]/)[0] === "" ? r : (/^data:/i.test(r) || /^(https?:)?\/\//i.test(r) ? r : r.split(/[?#]/)[0]) });
  };
  for (const m of t.matchAll(ATTR_SRC)) add(m[2] ?? m[3]);
  for (const m of t.matchAll(CSS_URL)) add(m[1] ?? m[2] ?? m[3]);
  for (const m of t.matchAll(CSS_IMPORT)) add(m[1]);
  if (/\.(m?js)$/i.test(file) || /<script[^>]*type\s*=\s*["']module/i.test(t)) for (const m of t.matchAll(JS_IMPORT)) add(m[1]);
  const faces = [...t.matchAll(FONT_FACE)].map((m) => m[1].trim().toLowerCase());
  const uses = new Set();
  for (const m of t.matchAll(FONT_USE)) for (const f of m[1].split(",")) { const n = f.replace(/!important/i, "").replace(/["']/g, "").trim().toLowerCase(); if (n && !GENERIC_FONTS.has(n) && !/^(var|calc)\(/.test(n)) uses.add(n); }
  const dynamic = DYNAMIC.filter(([re]) => re.test(t)).map(([, why]) => why);
  const nondet = NONDET.filter(([re]) => re.test(t)).map(([, why]) => why);
  return { refs, font_faces: [...new Set(faces)], font_uses: [...uses], dynamic, nondeterministic: nondet, global_time: GLOBAL_TIME.test(t) };
}

function within(root, from, ref) {
  const base = ref.startsWith("/") ? path.join(root, ref) : path.resolve(path.dirname(from), ref);
  const rel = path.relative(root, base);
  return rel && !rel.startsWith("..") && !path.isAbsolute(rel) ? { abs: base, rel } : null;
}

// the include tree of one entry (html/js/css are followed; fonts and media are leaves). Bounded; anything it cannot follow is reported, never ignored.
export function closure(project, entryRel) {
  const root = path.resolve(project);
  const files = new Map(), problems = [], remote = [], dynamic = [], nondet = [], faces = new Set(), uses = new Set();
  let globalTime = false, truncated = false;
  const visit = (rel, depth) => {
    if (files.has(rel)) return;
    if (files.size >= MAX_FILES || depth > MAX_DEPTH) { truncated = true; return; }
    const abs = path.join(root, rel), d = fileDigest(abs);
    files.set(rel, { rel, kind: d.kind, digest: d.exists ? keyDigest(d) : null, bytes_sha256: d.bytes_sha256 });
    if (!d.exists) { problems.push(`${rel}: referenced file is missing`); return; }
    const ext = path.extname(rel).toLowerCase();
    if (!TEXT_EXT.has(ext) || ext === ".md" || ext === ".txt") return;
    const sc = scanSource(rf(abs).toString("utf8"), { file: rel });
    dynamic.push(...sc.dynamic.map((w) => `${rel}: ${w}`)); nondet.push(...sc.nondeterministic.map((w) => `${rel}: ${w}`));
    sc.font_faces.forEach((f) => faces.add(f)); sc.font_uses.forEach((f) => uses.add(f));
    if (sc.global_time) globalTime = true;
    for (const r of sc.refs) {
      if (r.kind === "data") continue;
      if (r.kind === "remote") { remote.push(`${rel}: ${r.ref}`); continue; }
      const w = within(root, abs, r.ref);
      if (!w) { problems.push(`${rel}: ${r.ref} points outside the project`); continue; }
      visit(w.rel, depth + 1);
    }
  };
  visit(entryRel, 0);
  const fontFiles = [...files.values()].filter((f) => f.kind === "font");
  const unbacked = [...uses].filter((u) => !faces.has(u)); // named, with no @font-face: resolved by the machine or by hyperframes itself
  return {
    entry: entryRel, files: [...files.values()].sort((a, b) => a.rel.localeCompare(b.rel)), font_files: fontFiles, font_faces: [...faces].sort(), font_families_unbacked: unbacked.sort(),
    remote, dynamic, nondeterministic: nondet, global_time: globalTime, problems, truncated,
  };
}

// scenes -> entry file. Sub-compositions (data-composition-src) are the scene hosts; an inline scene has no file of its own (-> conservative).
function hostsOf(indexHtml) {
  const out = [];
  for (const m of indexHtml.matchAll(/<div\b[^>]*\sdata-composition-src\s*=[^>]*>/g)) {
    const get = (n) => { const a = m[0].match(new RegExp(`\\s${n}\\s*=\\s*("([^"]*)"|'([^']*)')`)); return a ? (a[2] ?? a[3]) : null; };
    out.push({ id: get("id"), composition_id: get("data-composition-id"), src: get("data-composition-src") });
  }
  return out;
}
const sceneIdOf = (sc, i) => (sc && sc.id != null ? String(sc.id) : sc && sc.n != null ? `s${sc.n}` : `s${i + 1}`);

// -> { schema_version, project_digest, scenes: { id: {...} }, shared: { ref: [scene ids] }, unknown: [reasons], global: {...} }
export function sceneDeps({ project, score = null, indexRel = "index.html" } = {}) {
  const root = path.resolve(project || ".");
  const idxBuf = rf(path.join(root, indexRel));
  const hosts = idxBuf ? hostsOf(idxBuf.toString("utf8")) : [];
  const scenesIn = arr(score && score.scenes);
  const tree = projectTreeDigest(root);
  const scenes = {}, shared = {}, unknown = [];
  const indexClosure = idxBuf ? closure(root, indexRel) : null;
  scenesIn.forEach((sc, i) => {
    const id = sceneIdOf(sc, i);
    const h = hosts.find((x) => x.composition_id === id || x.id === id || x.id === `slot-${id}` || (x.src && path.basename(x.src).replace(/\.html$/, "") === id));
    let entry = h && h.src ? within(root, path.join(root, indexRel), h.src) : null;
    if (!entry) { const guess = path.join("compositions", `${id}.html`); if (fs.existsSync(path.join(root, guess))) entry = { rel: guess }; }
    const c = entry ? closure(root, entry.rel) : null;
    const reasons = [];
    if (!c) reasons.push(idxBuf ? "inline scene in index.html (no file of its own)" : "no index.html to read the scene from");
    else {
      if (c.problems.length) reasons.push(...c.problems);
      if (c.remote.length) reasons.push(...c.remote.map((r) => `remote reference ${r}`));
      if (c.dynamic.length) reasons.push(...c.dynamic.map((r) => `dynamic: ${r}`));
      if (c.truncated) reasons.push("include tree larger than the scan bound");
    }
    // the root document's own code (shared helpers, inlined GSAP, styles) is a dependency of every scene it hosts
    const rootFiles = indexClosure ? indexClosure.files.filter((f) => !c || !c.files.some((x) => x.rel === f.rel)).filter((f) => !hosts.some((x) => x.src && path.relative(root, path.join(root, x.src)) === f.rel)) : [];
    const rec = {
      id, entry: entry ? entry.rel : null,
      files: c ? c.files : [], root_files: rootFiles, fonts: c ? { files: c.font_files, faces: c.font_faces, unbacked: c.font_families_unbacked } : { files: [], faces: [], unbacked: [] },
      dynamic: reasons, nondeterministic: c ? c.nondeterministic : [],
      global_time: c ? c.global_time || (indexClosure ? indexClosure.global_time : false) : true, // unknown = assume it reads global time
      conservative: reasons.length > 0,
    };
    // the digest that goes into the key: this scene's include tree plus the root document's shared code; conservative scenes add the whole tree
    rec.code_digest = canonicalDigest({ files: rec.files.map((f) => [f.rel, f.digest]), root: rec.root_files.map((f) => [f.rel, f.digest]), fonts_unbacked: rec.fonts.unbacked });
    rec.conservative_digest = rec.conservative ? tree.digest : null;
    scenes[id] = rec;
    for (const f of [...rec.files, ...rec.root_files]) if (f.rel !== rec.entry) (shared[f.rel] = shared[f.rel] || []).includes(id) || shared[f.rel].push(id);
    if (rec.conservative) unknown.push({ scene: id, reasons });
  });
  return { schema_version: KEY_SCHEMA, derived: true, note: "derived from the scene code and score; never edited", project_digest: tree.digest, scenes, shared, unknown, root_closure_ok: !!indexClosure };
}
// transitive consumers of a changed ref (font, component, asset, helper script): every scene whose include tree contains it
export const consumersOf = (deps, ref) => [...new Set([...(deps.shared[ref] || []), ...Object.values(deps.scenes).filter((s) => s.entry === ref).map((s) => s.id), ...Object.values(deps.scenes).filter((s) => s.conservative).map((s) => s.id)])].sort();

// ---- time ----------------------------------------------------------------------------------------------------------------------------
const HARD = /^(cut|hard[-_ ]?cut|none|straight[-_ ]?cut)?$/i;
// which neighbouring scenes a scene's transitions read. A transition overlaps its neighbour's time; a hard cut does not: it is the valid low-coupling boundary.
export function boundaryTime(score, sceneId) {
  const S = arr(score && score.scenes), idx = S.findIndex((s, i) => sceneIdOf(s, i) === String(sceneId));
  if (idx < 0) return { found: false, prev: null, next: null };
  const seams = arr(score && score.seams);
  let start = 0; const starts = S.map((s) => { const x = start; start += Number(s.duration) || 0; return x; });
  const seamKind = (from, to) => { const m = seams.find((x) => Number(x.from) === from && Number(x.to) === to); return m ? String(m.kind || "") : null; };
  const n = (i) => (S[i] && S[i].n != null ? Number(S[i].n) : i + 1);
  const tr = (i) => (S[i] && S[i].transition != null ? (isObj(S[i].transition) ? String(S[i].transition.kind || "") : String(S[i].transition)) : null);
  const side = (j, kind) => ({ id: sceneIdOf(S[j], j), start_s: starts[j], duration_s: Number(S[j].duration) || 0, kind: kind || "cut", overlap_s: null });
  const prevKind = idx > 0 ? (seamKind(n(idx - 1), n(idx)) ?? tr(idx - 1) ?? tr(idx)) : null;
  const nextKind = idx < S.length - 1 ? (seamKind(n(idx), n(idx + 1)) ?? tr(idx) ?? tr(idx + 1)) : null;
  const coupled = (k) => k !== null && !HARD.test(k);
  return {
    found: true, start_s: starts[idx], duration_s: Number(S[idx].duration) || 0,
    prev: idx > 0 && coupled(prevKind) ? side(idx - 1, prevKind) : null, next: idx < S.length - 1 && coupled(nextKind) ? side(idx + 1, nextKind) : null,
    prev_is_hard_cut: idx > 0 && !coupled(prevKind), next_is_hard_cut: idx < S.length - 1 && !coupled(nextKind),
  };
}

// ---- the key ---------------------------------------------------------------------------------------------------------------------------
const rat = (f) => (isObj(f) && f.num > 0 && f.den > 0 ? { num: Number(f.num), den: Number(f.den) } : null);
// o: { kind, id, config (normalized + scrubbed), sources:[{ref, digest}], upstream_keys:[], runtime:{hyperframes, ffmpeg, node, skill, component}, fonts:[{family, sha256}],
//      seed, dimensions:{w,h}, fps:{num,den}, time:{local_origin_s, global_origin_s|null, global_dependent, neighbours}, color:{space, range, alpha}, shutter, grade, codec:{...}, extra }
// Rational fps only: a float fps is refused (29.97 and 30000/1001 would otherwise key differently and one would be wrong).
export function renderKeyBody(o = {}) {
  const fps = rat(o.fps);
  const problems = [];
  if (!fps) problems.push("fps must be rational {num, den}");
  const dims = o.dimensions && o.dimensions.w > 0 && o.dimensions.h > 0 ? { w: Number(o.dimensions.w), h: Number(o.dimensions.h) } : null;
  if (!dims) problems.push("dimensions {w, h} are required");
  const t = o.time || {};
  const body = {
    v: KEY_SCHEMA, kind: o.kind || "render", id: o.id || "",
    config: scrub(o.config ?? null),
    sources: arr(o.sources).map((s) => ({ ref: String(s.ref), digest: s.digest ?? null })).sort((a, b) => a.ref.localeCompare(b.ref)),
    upstream: arr(o.upstream_keys).slice().sort(),
    runtime: scrub(o.runtime || {}),
    fonts: arr(o.fonts).map((f) => ({ family: String(f.family || "").toLowerCase(), sha256: f.sha256 ?? null })).sort((a, b) => a.family.localeCompare(b.family) || String(a.sha256).localeCompare(String(b.sha256))),
    seed: o.seed ?? null,
    dimensions: dims, fps,
    time: { local_origin_s: t.local_origin_s ?? 0, global_origin_s: t.global_dependent ? (t.global_origin_s ?? null) : null, global_dependent: !!t.global_dependent, neighbours: scrub(t.neighbours || null) },
    color: { space: (o.color && o.color.space) || "bt709", range: (o.color && o.color.range) || "tv", alpha: (o.color && o.color.alpha) || "none" }, // none | straight | premultiplied
    shutter: scrub(o.shutter ?? null), grade: scrub(o.grade ?? null), codec: scrub(o.codec ?? null),
    conservative: o.conservative_digest || null,
    extra: scrub(o.extra ?? null),
  };
  return { body, problems };
}
export function renderKey(o) {
  const { body, problems } = renderKeyBody(o);
  return { key: canonicalDigest(body), body, problems };
}
// which parts of a key body changed: the human-readable cause list behind a miss ("font X changed", "time origin moved", ...)
export function invalidationCauses(a, b) {
  if (!a) return [{ part: "all", why: "no previous key: a cold build" }];
  const out = [];
  const same = (x, y) => canonicalDigest(x ?? null) === canonicalDigest(y ?? null);
  const label = { config: "scene or layer configuration", sources: "source bytes", upstream: "an upstream result", runtime: "runtime or tool version", fonts: "a font", seed: "the seed", dimensions: "frame size", fps: "frame rate", time: "time origin, neighbours or global time", color: "colour / alpha convention", shutter: "motion-blur shutter", grade: "grade", codec: "codec settings", conservative: "an undeclared dependency (conservative whole-project key)", extra: "extra inputs", kind: "node kind", id: "node id" };
  for (const k of Object.keys(label)) if (!same(a[k], b[k])) out.push({ part: k, why: label[k] + " changed" + (k === "sources" ? ": " + changedRefs(a.sources, b.sources).join(", ") : "") });
  return out;
}
function changedRefs(a = [], b = []) {
  const A = new Map(a.map((x) => [x.ref, x.digest])), B = new Map(b.map((x) => [x.ref, x.digest]));
  return [...new Set([...A.keys(), ...B.keys()])].filter((r) => A.get(r) !== B.get(r)).sort().slice(0, 12);
}

// the key inputs for one scene-render node, from sceneDeps + score. hybrid-graph passes this into its node key so the scene's CODE and fonts are part of it.
export function sceneKeyInputs({ deps, score, sceneId, runtime = {} }) {
  const d = deps && deps.scenes[sceneId];
  if (!d) return { known: false, conservative_digest: deps ? deps.project_digest : null, note: "no scene dependency record: whole-project key" };
  const bt = boundaryTime(score, sceneId);
  return {
    known: true,
    sources: [...d.files, ...d.root_files].map((f) => ({ ref: f.rel, digest: f.digest })),
    fonts: [...d.fonts.files.map((f) => ({ family: path.basename(f.rel).replace(/\.[^.]+$/, ""), sha256: f.digest })), ...d.fonts.unbacked.map((u) => ({ family: u, sha256: null }))],
    time: { local_origin_s: 0, global_origin_s: bt.found ? bt.start_s : null, global_dependent: d.global_time || d.conservative, neighbours: { prev: bt.prev, next: bt.next } },
    conservative_digest: d.conservative_digest, dynamic: d.dynamic, nondeterministic: d.nondeterministic, runtime,
  };
}
