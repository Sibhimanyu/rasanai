// Plan 06 V3 + V8: deterministic scenes, render readiness, pinned dependencies, and edits that survive regeneration.
//
//   V3  one seekable clock; every frame a function of absolute time. `lintDeterminism` reads scene source for what breaks that (wall clock, unseeded randomness,
//       a free-running loop, a network request at render time, remote assets); `compareSeekOrder` is the check that a forward pass and a shuffled pass render the same
//       frames; `precomputed` is how stateful physics stays seek-safe (deterministic precompute + checkpoints keyed to the inputs, never a running simulation).
//   V8  the adapter contract around an existing scene runtime (prepare approved local inputs, report readiness, evaluate an absolute time, report semantic element metadata,
//       dispose), the readiness check ("the file exists" is not readiness: fonts must have LOADED, video must DECODE, models must be the accepted ones), the pins in the
//       project manifest (font files, runtime versions, accepted generated media; an update is a versioned migration with a stated impact), the reconciliation of user edits
//       with a regenerated scene (stable ids; a missing id is a conflict, never a nearest-pixel guess), and the review of untrusted external scene examples.
//
// Pure functions over data and files; nothing here launches a browser, a renderer or a model. The evidence a readiness check needs is produced by the render adapters.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { canonicalDigest, SCHEMA_VERSION } from "./contracts.mjs";

const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);
const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");
const fileSha = (f) => sha256(fs.readFileSync(f));

// ================================================================================ V3: determinism
// Static rules over scene source (HTML/JS). Each rule: id, regex, why. `errors` break a render; `warnings` need a stated reason.
const SEEDED = /\b(mulberry32|seedrandom|rng\s*\(|hash2?\s*\(|seedOf|hashStr)\b/;
export const DETERMINISM_RULES = [
  { id: "wall-clock", sev: "error", re: /\b(Date\.now\s*\(|new\s+Date\s*\(\s*\)|performance\.now\s*\(|process\.hrtime)/, why: "motion that reads the clock differs on every render and every seek" },
  { id: "unseeded-random", sev: "error", re: /\bMath\.random\s*\(/, why: "unseeded randomness: use a seeded PRNG or a stateless hash of (element, index, seed)" },
  { id: "free-running-loop", sev: "error", re: /\b(requestAnimationFrame|setInterval)\s*\(/, why: "a free-running loop is a second clock; the single paused timeline drives everything" },
  { id: "timer-driven-motion", sev: "warn", re: /\bsetTimeout\s*\(/, why: "a timer is wall time; fine for a one-off setup, never for animating" },
  { id: "render-time-network", sev: "error", re: /\b(fetch\s*\(|XMLHttpRequest|WebSocket|EventSource|navigator\.sendBeacon|import\s*\(\s*["']https?:)/, why: "a request at render time: assets are local and approved, and a frame must not depend on the network" },
  { id: "remote-asset", sev: "error", re: /(src|href)\s*=\s*["']https?:\/\/|url\(\s*["']?https?:\/\/|@import\s+(url\()?["']?https?:/i, why: "remote assets are not part of an approved, pinned build" },
  { id: "css-time-animation", sev: "warn", re: /(^|[;{\s])animation(-name)?\s*:\s*(?!none)[^;]+\b\d+(\.\d+)?m?s\b/m, why: "a CSS animation runs on the document clock, which a seek does not move; drive it from the timeline or a Web Animations seek" },
  { id: "accumulating-state", sev: "warn", re: /\b(\w+)\s*(\+=|-=|\*=)\s*[^;]*\b(dt|delta|elapsed)\b/, why: "state that accumulates per tick depends on how many ticks ran (seek order); precompute and checkpoint it" },
];
export function lintDeterminism(source, { file = "" } = {}) {
  const text = String(source || ""), findings = [];
  for (const r of DETERMINISM_RULES) {
    const m = text.match(r.re);
    if (!m) continue;
    if (r.id === "unseeded-random" && SEEDED.test(text) && !/Math\.random/.test(text)) continue;
    const line = text.slice(0, m.index).split("\n").length;
    findings.push({ rule: r.id, severity: r.sev, file, line, evidence: m[0].slice(0, 60), why: r.why });
  }
  return { ok: !findings.some((f) => f.severity === "error"), findings };
}

// a seek order that is not 0,1,2,...: a deterministic shuffle (so the check itself is repeatable) with the first sample revisited at the end (A-B-A)
export function seekOrderPlan(times, seed = 7) {
  const t = [...times];
  let a = (seed | 0) >>> 0;
  const rnd = () => { a = (a + 0x6D2B79F5) | 0; let x = Math.imul(a ^ (a >>> 15), 1 | a); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  for (let i = t.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [t[i], t[j]] = [t[j], t[i]]; }
  return { forward: [...times], shuffled: t, revisit: times.length ? [times[0]] : [] };
}
// forward/shuffled: { "<t>": "<frame hash>" } maps. Equal at every time = the same clock in any order; cold start is a separate pass of the same map from a fresh process.
export function compareSeekOrder(forward, shuffled) {
  const diffs = [];
  for (const k of Object.keys(forward)) if (shuffled[k] !== forward[k]) diffs.push({ t: Number(k), forward: forward[k], other: shuffled[k] ?? null });
  return { ok: !diffs.length && Object.keys(forward).length > 0, compared: Object.keys(forward).length, differing: diffs };
}

// Stateful physics without a running simulation: step the model with a FIXED dt from a seeded initial state, store a checkpoint every `every` steps, and answer any time by
// resuming from the nearest earlier checkpoint. The cache is keyed to a digest of the inputs: change a parameter and the key changes (a stale cache is a miss, never a hit).
export function mulberry32(seed) { let a = (seed | 0) >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function precomputed({ inputs, seed = 1, dt = 1 / 120, duration, every = 60, init, step }) {
  const key = canonicalDigest({ inputs, seed, dt, every, init: typeof init === "function" ? init.toString() : init, step: step.toString() });
  const checkpoints = []; // [{ n, state }]
  // steps take their own seeded randomness from (seed, step index), never a shared running stream, so resuming from a checkpoint reproduces them exactly
  const clone = (s) => JSON.parse(JSON.stringify(s));
  let s = typeof init === "function" ? init(mulberry32(seed)) : clone(init);
  checkpoints.push({ n: 0, state: clone(s) });
  const total = Math.ceil(duration / dt);
  for (let n = 1; n <= total; n++) { s = step(s, dt, mulberry32(seed ^ Math.imul(n, 0x9E3779B1)), n); if (n % every === 0) checkpoints.push({ n, state: clone(s) }); }
  return {
    key, dt, checkpoints: checkpoints.length,
    stateAt(t) {
      const n = Math.max(0, Math.min(total, Math.round(t / dt)));
      const cp = [...checkpoints].reverse().find((c) => c.n <= n) || checkpoints[0];
      let st = clone(cp.state);
      for (let k = cp.n + 1; k <= n; k++) st = step(st, dt, mulberry32(seed ^ Math.imul(k, 0x9E3779B1)), k);
      return st;
    },
  };
}

// ================================================================================ V8: the adapter contract and readiness
export const ADAPTER_METHODS = ["prepare", "readiness", "evaluate", "elements", "dispose"];
export const ADAPTER_CONTRACT = {
  prepare: "(project, { approved_inputs }) -> load only approved local inputs (fonts, textures, footage, accepted models); never fetch",
  readiness: "() -> { fonts, textures, video, models } evidence: fonts LOADED, textures decoded, video frames decodable, models present and hash-matched",
  evaluate: "(t_s, { subframe }) -> render the scene at an ABSOLUTE time (and sub-frame sample); no state between calls",
  elements: "() -> [{ element_id, kind, bounds, editable }] semantic metadata (data-el identities), not pixels",
  dispose: "() -> release only what prepare created (browser, GL contexts, decoders, temp files)",
};
export function checkAdapter(a) {
  const missing = ADAPTER_METHODS.filter((m) => typeof (a && a[m]) !== "function");
  return { ok: !missing.length && typeof (a && a.id) === "string", missing };
}

// pins: the project manifest block (see buildPins). evidence: what the adapter measured:
//   { fonts: [{ family, file?, loaded: bool }], textures: [{ id, decoded: bool }], video: [{ asset_id, decoded_frames: n, expected_frames?: n }], models: [{ id, sha256 }] }
// A pinned item with no evidence is `unverified`, not ready: existence is not readiness.
export function evaluateReadiness({ pins = {}, evidence = {}, projectRoot = null } = {}) {
  const items = [];
  const push = (kind, id, status, reason) => items.push({ kind, id, status, reason });
  const ev = { fonts: arr(evidence.fonts), textures: arr(evidence.textures), video: arr(evidence.video), models: arr(evidence.models) };
  for (const f of arr(pins.fonts)) {
    if (projectRoot && f.file) {
      const p = path.join(projectRoot, f.file);
      if (!fs.existsSync(p)) { push("font", f.family || f.file, "missing", `pinned file ${f.file} is not in the project`); continue; }
      if (fileSha(p) !== f.sha256) { push("font", f.family || f.file, "mismatch", `${f.file} differs from the pinned bytes`); continue; }
    }
    const e = ev.fonts.find((x) => (x.family || "").toLowerCase() === String(f.family || "").toLowerCase());
    push("font", f.family || f.file, !e ? "unverified" : e.loaded ? "ready" : "missing", !e ? "no evidence the browser loaded this face (the file existing does not count)" : e.loaded ? "" : "the face did not load in the render page");
  }
  for (const t of ev.textures) push("texture", t.id, t.decoded ? "ready" : "missing", t.decoded ? "" : "the texture did not decode");
  for (const v of ev.video) {
    const ok = v.decoded_frames > 0 && (v.expected_frames == null || v.decoded_frames >= v.expected_frames);
    push("video", v.asset_id, ok ? "ready" : "missing", ok ? "" : `decoded ${v.decoded_frames || 0} of ${v.expected_frames ?? "?"} frames`);
  }
  for (const m of arr(pins.neural_media)) {
    const e = ev.models.find((x) => x.id === m.id);
    push("neural_media", m.id, !e ? "unverified" : e.sha256 === m.sha256 ? "ready" : "mismatch", !e ? "no evidence this accepted plate was decoded" : e.sha256 === m.sha256 ? "" : "the plate on disk is not the accepted output");
  }
  const blocking = items.filter((i) => i.status !== "ready");
  return { ok: !blocking.length, ready: !blocking.length, items, blocking };
}

// ================================================================================ V8: pins in the project manifest
// <project>/motion/pins.json (schema_version 1): fonts (file + sha256 + family), runtimes (name -> version + sha256 of the skill's runtime source),
// neural media (accepted generated plates: asset id, output sha256, asset.json digest). A film that has pins never changes underneath its approval:
// a changed pin is reported as drift and becomes a versioned migration (recordMigration) with an impact.
export const pinsPath = (project) => path.join(project, "motion", "pins.json");
export const migrationsPath = (project) => path.join(project, "motion", "migrations.jsonl");
const RUNTIMES = [
  { name: "rasan-motion", rel: ["runtime", "rasan-motion.js"], re: /var VERSION = "([^"]+)"/ },
  { name: "rasan-motion-kit", rel: ["runtime", "rasan-motion-kit.js"], re: /var LIB_VERSION = "([^"]+)"/ },
  { name: "rasan3d", rel: ["stage3d", "rasan3d.js"], re: /var VERSION = "([^"]+)"/ },
  { name: "rasan2d", rel: ["stage2d", "runtime", "rasan2d.js"], re: /var VERSION = "([^"]+)"/ },
  { name: "character-rig", rel: ["stage3d", "character-rig.js"], re: /var VERSION = "([^"]+)"/ },
];
export function runtimeVersions(skillDir) {
  const out = {};
  for (const r of RUNTIMES) {
    const f = path.join(skillDir, ...r.rel);
    if (!fs.existsSync(f)) continue;
    const src = fs.readFileSync(f, "utf8");
    out[r.name] = { version: (src.match(r.re) || [])[1] || null, source_sha256: sha256(src) };
  }
  return out;
}
const FONT_EXT = /\.(woff2?|ttf|otf)$/i;
export function scanFonts(project) {
  const out = [], dirs = ["assets/fonts", "fonts", "assets/brand/fonts"];
  for (const d of dirs) {
    const dir = path.join(project, d);
    if (!fs.existsSync(dir)) continue;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!e.isFile() || !FONT_EXT.test(e.name)) continue;
      const rel = path.join(d, e.name);
      out.push({ family: e.name.replace(FONT_EXT, "").replace(/[-_]?(regular|bold|italic|light|medium|semibold|black|variable)\b.*$/i, "").replace(/[-_]+/g, " ").trim() || e.name, file: rel, sha256: fileSha(path.join(project, rel)) });
    }
  }
  return out.sort((a, b) => a.file.localeCompare(b.file));
}
export function acceptedNeuralMedia(project) {
  const dir = path.join(project, "hybrid", "generated"), out = [];
  if (!fs.existsSync(dir)) return out;
  for (const id of fs.readdirSync(dir)) {
    const a = path.join(dir, id, "asset.json");
    if (!fs.existsSync(a)) continue;
    try { const j = JSON.parse(fs.readFileSync(a, "utf8")); if (j.output && j.output.sha256) out.push({ id, output_path: j.output.path, sha256: j.output.sha256, model_id: j.model_id || null, workflow_digest: j.workflow_digest || null, asset_digest: sha256(fs.readFileSync(a)) }); } catch {}
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}
export function buildPins({ project, skillDir }) {
  return { schema_version: SCHEMA_VERSION, fonts: scanFonts(project), runtimes: runtimeVersions(skillDir), neural_media: acceptedNeuralMedia(project) };
}
// current state vs the stored pins -> [{ kind, id, from, to }]. A pin present in the file that no longer matches is drift; new things are `added` (informational).
export function pinDrift(stored, current) {
  const drift = [], added = [];
  const by = (xs, k) => new Map(arr(xs).map((x) => [x[k], x]));
  for (const [kind, key, field] of [["font", "file", "sha256"], ["neural_media", "id", "sha256"]]) {
    const sk = kind === "font" ? "fonts" : "neural_media", cur = by(current[sk], key);
    for (const p of arr(stored[sk])) { const c = cur.get(p[key]); if (!c) drift.push({ kind, id: p[key], from: p[field], to: null, why: "removed" }); else if (c[field] !== p[field]) drift.push({ kind, id: p[key], from: p[field], to: c[field], why: "bytes changed" }); }
    for (const c of arr(current[sk])) if (!by(stored[sk], key).has(c[key])) added.push({ kind, id: c[key] });
  }
  for (const [n, p] of Object.entries(stored.runtimes || {})) { const c = (current.runtimes || {})[n]; if (!c) drift.push({ kind: "runtime", id: n, from: p.version, to: null, why: "removed" }); else if (c.source_sha256 !== p.source_sha256) drift.push({ kind: "runtime", id: n, from: p.version, to: c.version, why: "source changed" }); }
  return { drift, added, pinned: !drift.length };
}
// what an update touches. scenes: [{ scene_id, source }] (the scene HTML) -> the scenes that use the thing, so the invalidation is bounded, not "rebuild everything"
export function migrationImpact(drift, scenes = []) {
  const uses = (s, d) => (d.kind === "runtime" ? s.source.includes(d.id === "rasan-motion" ? "RasanMotion" : d.id === "rasan-motion-kit" ? "RasanMotionKit" : d.id === "rasan3d" ? "Rasan3D" : d.id === "rasan2d" ? "Rasan2D" : d.id) : d.kind === "font" ? new RegExp(String(d.id).split("/").pop().replace(/\.[a-z0-9]+$/i, "").replace(/[-_]/g, "[ _-]?"), "i").test(s.source) : s.source.includes(d.id));
  const hit = new Set();
  for (const d of drift) for (const s of scenes) if (uses(s, d)) hit.add(s.scene_id);
  return { invalidates_scenes: [...hit].sort(), unaffected_scenes: scenes.map((s) => s.scene_id).filter((id) => !hit.has(id)).sort(), requires: "re-approval of the Final if any scene changes; earlier approvals stand because Story, Look and Storyboard inputs are unchanged" };
}
export function recordMigration(project, { drift, impact, reason, by = "user" }) {
  const rec = { schema_version: SCHEMA_VERSION, id: "mig-" + canonicalDigest({ drift, at: Date.now() }).slice(0, 10), at: new Date().toISOString(), by, reason: String(reason || ""), drift, impact };
  fs.mkdirSync(path.dirname(migrationsPath(project)), { recursive: true });
  fs.appendFileSync(migrationsPath(project), JSON.stringify(rec) + "\n");
  return rec;
}

// ================================================================================ V8: edits survive regeneration
// edits: the latest line per id from motion/edits.jsonl (lib/editor-patch latestAll). index: motion/element-index.json of the REBUILT scenes.
// An edit carries over only when its element id still exists AND the properties it changes are still editable on that element. Anything else is a conflict
// the person resolves: the nearest element by position is never substituted.
const FIELD_PROP = { text: "text", color: "color", position: "position", x: "position", y: "position", scale: "scale", timing: "timing", start: "timing", duration: "timing", motion_preset: "motion_preset", preset: "motion_preset" };
export function reconcileOverrides({ edits, index }) {
  const items = new Map(arr(index && index.items).map((i) => [i.element_id, i]));
  const carried = [], conflicts = [], skipped = [];
  for (const e of arr(edits)) {
    if (!["accepted", "applied", "rendered"].includes(e.status)) { skipped.push({ id: e.id, status: e.status }); continue; }
    if (!e.element_id) { carried.push({ id: e.id, mode: "region", note: "a region edit has no element identity; it is re-applied as a note, never matched by pixels" }); continue; }
    const it = items.get(e.element_id);
    if (!it) { conflicts.push({ id: e.id, element_id: e.element_id, code: "missing_id", message: `${e.element_id} is not in the rebuilt scenes (removed or renamed); choose the replacement element, drop the edit, or restore the id` }); continue; }
    const wanted = [...new Set(Object.keys(e.fields || {}).map((k) => FIELD_PROP[k] || k))];
    const bad = wanted.filter((p) => !arr(it.editable).includes(p));
    if (bad.length) { conflicts.push({ id: e.id, element_id: e.element_id, code: "property_not_editable", message: `${e.element_id} no longer allows editing ${bad.join(", ")} (it is now ${it.kind}, editable: ${arr(it.editable).join(", ") || "none"})` }); continue; }
    if (e.element_kind && e.element_kind !== it.kind) { conflicts.push({ id: e.id, element_id: e.element_id, code: "kind_changed", message: `${e.element_id} was ${e.element_kind} and is now ${it.kind}` }); continue; }
    carried.push({ id: e.id, element_id: e.element_id, mode: "override", fields: e.fields || {}, scene_id: it.scene_id });
  }
  return { ok: !conflicts.length, carried, conflicts, skipped };
}
// a builder must consume the carried overrides or explicitly reconcile them: the gate a regeneration passes before it replaces a scene file
export function regenerationGate({ edits, index, scene_id }) {
  const r = reconcileOverrides({ edits: arr(edits).filter((e) => !scene_id || e.scene_id === scene_id), index });
  return { allowed: r.ok, ...r, rule: "regeneration may not overwrite an adjusted element: apply `carried` after the rebuild, or resolve every conflict first" };
}

// ================================================================================ V8: untrusted external scene examples
// An example from outside (a repo, a gallery, a pasted HTML scene) is DATA. It is never installed, run, or copied into a film. A reviewer may extract ONE mechanic
// (the idea and a small reimplementation) and must record where it came from. files: [{ path, text? }]
const DANGEROUS_FILES = [
  [/(^|\/)package\.json$/, "install scripts"], [/(^|\/)(install|setup|postinstall)\.(sh|js|mjs|ps1)$/i, "setup script"], [/(^|\/)\.env/, "credentials file"],
  [/\.(mp4|mov|webm|mkv|wav|mp3|m4a|psd|ai|ttf|otf|woff2?)$/i, "media or font with its own rights"], [/(^|\/)(Makefile|Dockerfile)$/i, "build script"],
];
const DANGEROUS_TEXT = [
  [/\b(child_process|execSync|spawnSync|eval\s*\(|new\s+Function\s*\()/, "executes code"], [/(sk-[A-Za-z0-9]{16,}|api[_-]?key\s*[:=]|Bearer\s+[A-Za-z0-9._-]{16,})/i, "credentials"],
  [/\b(fetch|XMLHttpRequest|WebSocket)\b|https?:\/\/(?!www\.w3\.org)/, "network or remote assets"], [/(replicate\.com|api\.openai\.com|fal\.ai|runwayml|higgsfield)/i, "hosted provider config"],
  [/\b(watermark|logo)\b.*\b(crop|cover|remove|mask)\b|\b(crop|cover|remove)\b.*\bwatermark\b/i, "removes a watermark"],
];
export function reviewExternalScene({ source, license, files = [] } = {}) {
  const findings = [];
  if (!source || !/^https?:\/\/|^[\w.-]+\/[\w.-]+/.test(String(source))) findings.push({ code: "no_source", message: "the example's origin (URL or repo) must be recorded" });
  for (const f of files) {
    for (const [re, why] of DANGEROUS_FILES) if (re.test(f.path)) findings.push({ code: "do_not_import", path: f.path, message: `${f.path}: ${why}; not copied, not run` });
    if (typeof f.text === "string") for (const [re, why] of DANGEROUS_TEXT) if (re.test(f.text)) findings.push({ code: "untrusted_content", path: f.path, message: `${f.path}: ${why}; read as text only` });
  }
  if (!license || !String(license).trim()) findings.push({ code: "no_license", message: "no licence recorded: ideas only, nothing is reused verbatim" });
  return { trusted: false, executable: false, source: source || null, license: license || null, findings, may_extract_mechanic: !findings.some((x) => x.code === "no_source") };
}
// the only thing that leaves a review: one reviewed mechanic with provenance. Anything missing makes it ideas-only.
export function mechanicRecord({ source, license, notices = [], reviewer, mechanic, summary, reimplemented_in, reviewed_at } = {}) {
  const missing = ["source", "license", "reviewer", "mechanic", "summary", "reimplemented_in"].filter((k) => !{ source, license, reviewer, mechanic, summary, reimplemented_in }[k]);
  return { ok: !missing.length, missing, record: missing.length ? null : { schema_version: SCHEMA_VERSION, kind: "extracted_mechanic", trusted: false, source, license, notices: arr(notices), reviewer, reviewed_at: reviewed_at || new Date().toISOString(), mechanic, summary, reimplemented_in, copied_media: false, copied_code_verbatim: false } };
}
