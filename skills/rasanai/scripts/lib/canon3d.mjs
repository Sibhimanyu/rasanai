// The on-model check for a recurring 3D actor (wave W6): everything behind `canon.mjs`. Rasan3D draws the actor through the thin adapter
// stage3d/character-rig.js; this file validates its canon (identity.json, the same file and validator as the painted 2D actor, medium
// "3d-rig"), seals and plates it, scaffolds scenes, and checks every 3D scene of a film against the canon.
//
// What "on-model" can assert, and what it cannot:
//   STRUCTURAL (exact, errors): same identity id; the scene's identity copy has the run's digest; the rig asset hash is the sealed one;
//     every fixed trait's part is in the scene's actor, attached and visible; the attachment points exist; each proportion, relative to the
//     body width, is within 4% of the canon (a uniform scale of the whole actor is fine, one stretched axis is not); every locked palette
//     key is the canon's colour on the live materials (a permitted outfit swap is read from the rig's own record).
//   VISUAL (a metric, never proof): the live actor, cloned at its rest pose, is rendered as the standardized FRONT and QUARTER views
//     (camera_reference) through a second Rasan3D stage (the shared WebGL renderer), normalised (cropped to its silhouette, resampled to a
//     48x64 grid) and compared with the canon plate: silhouette IoU, aspect, per-band widths, palette histogram. Inside the pass thresholds
//     the numbers support "same actor" but do not prove it; between pass and fail the case is UNCERTAIN and is tagged needs-frame-juror
//     (a person or the frame juror looks at the review image); beyond the fail thresholds, or an empty silhouette, it fails.
//   A pose, an action, a camera or a light change moves none of these: the structural read and the views are taken at the rig's rest pose.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { createRequire } from "node:module";
import { loadIdentity, validateIdentity, validateCast, rigAssetHash, identityDigest, castCanonWarnings } from "./canon.mjs";
import { STAGE, install, withComposition, collect } from "./stage3d.mjs";

export const RIG = createRequire(import.meta.url)("../../stage3d/character-rig.js");
export const traitsFor3d = RIG.traitFeatures;
export const usesCharacter3d = (file) => /RasanCharacter3D\.|assets\/three\/character-rig\.js/.test(fs.readFileSync(file, "utf8"));
export const FIXTURE = path.join(STAGE, "templates", "original-actor-3d.json");
const exists = (p) => !!p && fs.existsSync(p);
const readJSON = (f) => JSON.parse(fs.readFileSync(f, "utf8"));

// ------------------------------------------------------------------ validation
export function validate3d(identity, baseDir) {
  return validateIdentity(identity, { medium: "3d-rig", strict: true, baseDir, traits: traitsFor3d });
}

// ------------------------------------------------------------------ the visual metric (pure: tested without a browser)
// Recorded with every plate (canon-plate.json). Calibrated on the fixture actor with software GL: a clean re-render of the same rig in any
// scene scores IoU 1.0 / palette 0.0, so the pass lines are tight; a body 30% wider (the body mesh alone, half hidden by the head, arms and
// scarf) scores IoU 0.97 / region 0.03: UNCERTAIN, which is why the structural read, not this metric, is what fails a drifted body.
// Uncalibrated on other actors: a plate recorded on one GPU is compared on that GPU (RASANAI_GL=cpu is the deterministic path).
export const THRESHOLDS = {
  grid: [48, 64],
  iou: { pass: 0.985, fail: 0.93 },       // silhouette overlap, 1 is identical
  aspect: { pass: 0.03, fail: 0.08 },      // |w/h - w/h| / w/h of the silhouette boxes
  region: { pass: 0.02, fail: 0.08 },      // largest difference in the width share of the head / torso / legs thirds
  palette: { pass: 0.02, fail: 0.15 },     // half the L1 distance between 64-bin colour histograms of opaque pixels
};

export function normalizeView(view) {
  const [GW, GH] = THRESHOLDS.grid;
  const { w, h } = view;
  const buf = Buffer.from(view.rgba, "base64");
  if (buf.length < w * h * 4) return { empty: true, reason: "short pixel buffer" };
  let x0 = w, y0 = h, x1 = -1, y1 = -1, area = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (buf[(y * w + x) * 4 + 3] >= 128) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; area++; }
  if (x1 < 0 || area < 40) return { empty: true, reason: "no silhouette" };
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const grid = Buffer.alloc(GW * GH);
  for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
    const sx0 = x0 + Math.floor((gx * bw) / GW), sx1 = x0 + Math.max(Math.floor(((gx + 1) * bw) / GW), Math.floor((gx * bw) / GW) + 1);
    const sy0 = y0 + Math.floor((gy * bh) / GH), sy1 = y0 + Math.max(Math.floor(((gy + 1) * bh) / GH), Math.floor((gy * bh) / GH) + 1);
    let s = 0, n = 0;
    for (let y = sy0; y < sy1; y++) for (let x = sx0; x < sx1; x++) { s += buf[(y * w + x) * 4 + 3]; n++; }
    grid[gy * GW + gx] = n ? Math.round(s / n) : 0;
  }
  const bands = [0, 1, 2].map((b) => {
    let tot = 0, rows = 0;
    for (let y = y0 + Math.floor((b * bh) / 3); y < y0 + Math.floor(((b + 1) * bh) / 3); y++) { let c = 0; for (let x = x0; x <= x1; x++) if (buf[(y * w + x) * 4 + 3] >= 128) c++; tot += c / bw; rows++; }
    return rows ? tot / rows : 0;
  });
  const hist = new Array(64).fill(0);
  let opaque = 0;
  for (let i = 0; i < w * h; i++) {
    if (buf[i * 4 + 3] < 250) continue;
    hist[(buf[i * 4] >> 6) * 16 + (buf[i * 4 + 1] >> 6) * 4 + (buf[i * 4 + 2] >> 6)]++; opaque++;
  }
  return { empty: false, aspect: bw / bh, fill: area / (bw * bh), bands, grid: grid.toString("base64"), palette: hist.map((c) => (opaque ? c / opaque : 0)), box: [x0, y0, bw, bh] };
}

export function compareViews(plate, test, T = THRESHOLDS) {
  if (!test || test.empty) return { verdict: "fail", reasons: [`the actor has no silhouette in this view (${test && test.reason})`], metrics: null };
  if (!plate || plate.empty) return { verdict: "uncertain", reasons: ["the plate has no silhouette to compare with"], metrics: null };
  const a = Buffer.from(plate.grid, "base64"), b = Buffer.from(test.grid, "base64");
  let inter = 0, uni = 0;
  for (let i = 0; i < a.length; i++) { const p = a[i] >= 128, q = b[i] >= 128; if (p && q) inter++; if (p || q) uni++; }
  const iou = uni ? inter / uni : 0;
  const aspect = Math.abs(test.aspect - plate.aspect) / plate.aspect;
  const region = Math.max(...plate.bands.map((v, i) => Math.abs(v - test.bands[i])));
  const palette = 0.5 * plate.palette.reduce((s, v, i) => s + Math.abs(v - test.palette[i]), 0);
  const m = { iou: +iou.toFixed(4), aspect: +aspect.toFixed(4), region: +region.toFixed(4), palette: +palette.toFixed(4) };
  const reasons = [];
  let verdict = "pass";
  const judge = (name, v, bad) => { const t = T[name]; if (bad ? v < t.fail : v > t.fail) { verdict = "fail"; reasons.push(`${name} ${v.toFixed(3)} is beyond the fail line ${t.fail}`); } else if (verdict !== "fail" && (bad ? v < t.pass : v > t.pass)) { verdict = "uncertain"; reasons.push(`${name} ${v.toFixed(3)} is between the pass line ${t.pass} and the fail line ${t.fail}`); } };
  judge("iou", iou, true); judge("aspect", aspect, false); judge("region", region, false); judge("palette", palette, false);
  return { verdict, reasons, metrics: m };
}

// a review image for a person or the frame juror: the scene's actor on the left, the plate's silhouette (grey) on the right
function crc32(buf) { let c, crc = ~0; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return ~crc >>> 0; }
export function encodePng(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
export function reviewPng(view, plateNorm) {
  const w = view.w, h = view.h, out = Buffer.alloc(w * 2 * h * 4, 255);
  const src = Buffer.from(view.rgba, "base64");
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, o = (y * w * 2 + x) * 4, a = src[i + 3] / 255;
    for (let c = 0; c < 3; c++) out[o + c] = Math.round(src[i + c] * a + 240 * (1 - a));
  }
  if (plateNorm && !plateNorm.empty) {
    const [GW, GH] = THRESHOLDS.grid, g = Buffer.from(plateNorm.grid, "base64"), [bx, by, bw, bh] = plateNorm.box;
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
      const v = g[Math.min(GH - 1, Math.floor((y * GH) / bh)) * GW + Math.min(GW - 1, Math.floor((x * GW) / bw))];
      if (v >= 128) { const o = (((by + y) * w * 2) + w + bx + x) * 4; out[o] = out[o + 1] = out[o + 2] = 90; }
    }
  }
  return encodePng(w * 2, h, out);
}

// ------------------------------------------------------------------ pages: a host project with the runtime, a scaffolded scene
const q = (v) => JSON.stringify(v);
export function sceneText(o) {
  let t = fs.readFileSync(path.join(STAGE, "templates", "scene-character-3d.html"), "utf8");
  const H = o.height || 1080, W = o.width || 1920;
  const camera = o.camera || { pos: [[0, [0.35, 0.62, 4.3]]], target: [[0, [0, 0.46, 0]]], lens: [[0, 50]] };
  const vars = {
    FRAME_ID: o.frame, W, H, DURATION: o.duration || 6, CANVAS: o.canvas || "#efe6d4", KEY: o.key || "#fff1e2", KEY_DIR: q(o.keyDir || [-0.55, 0.85, 0.65]),
    CANON_JSON: JSON.stringify(o.identity), SPEC_JSON: JSON.stringify(o.spec || { actions: [] }), CAMERA_JSON: JSON.stringify(camera), BUILD_EXTRA: o.buildExtra || "",
  };
  return t.replace(/\{\{(\w+)\}\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
}
function hostProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rasanai-canon3d-"));
  install(dir);
  const file = path.join(dir, "host.html");
  fs.writeFileSync(file, `<!doctype html><html><head><meta charset="utf-8"></head><body><div data-width="480" data-height="640"></div>
<script src="assets/three/rasan3d.js"></script><script src="assets/three/character-rig.js"></script></body></html>`);
  return { dir, file, done: () => fs.rmSync(dir, { recursive: true, force: true }) };
}
async function inHost(fn) {
  const h = hostProject();
  try { return await withComposition(h.file, "check", fn); } finally { h.done(); }
}

// the canon's own standardized views, rendered fresh from identity.json
export async function canonViewsOf(identity) {
  return inHost(async (b) => b.eval(`RasanCharacter3D.canonViews(${q(identity)}, { identity: ${q(identity)} })`, { await: true }));
}
export async function modelSheetOf(identity, outPng) {
  const r = await inHost(async (b) => b.eval(`RasanCharacter3D.renderModelSheet(${q(identity)})`, { await: true }));
  fs.mkdirSync(path.dirname(outPng), { recursive: true });
  fs.writeFileSync(outPng, Buffer.from(r.png.replace(/^data:image\/png;base64,/, ""), "base64"));
  return { file: outPng, width: r.width, height: r.height };
}

// ------------------------------------------------------------------ seal and plate
export function seal(file) {
  const idn = loadIdentity(file);
  const v = validate3d({ ...idn, rig_hash: undefined }, path.dirname(file));
  if (v.errors.length) return { ok: false, errors: v.errors };
  idn.rig_hash = rigAssetHash(idn, path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(idn, null, 2) + "\n");
  return { ok: true, rig_hash: idn.rig_hash };
}
export async function makePlate(identityFile, outFile) {
  const idn = loadIdentity(identityFile);
  const v = validate3d(idn, path.dirname(identityFile));
  if (v.errors.length) return { ok: false, errors: v.errors };
  const views = await canonViewsOf(idn);
  const plate = { schema_version: 1, id: idn.id, identity_digest: identityDigest(idn), rig_hash: rigAssetHash(idn, path.dirname(identityFile)), builder: idn.rig, thresholds: THRESHOLDS, views: {}, note: "The canon plate: normalised front and quarter silhouettes of the sealed rig at its rest pose (camera_reference views). A metric alone never proves identity; uncertain cases go to frame-juror visual review." };
  for (const [n, view] of Object.entries(views)) plate.views[n] = normalizeView(view);
  fs.writeFileSync(outFile, JSON.stringify(plate, null, 1) + "\n");
  return { ok: true, file: outFile, views: Object.keys(plate.views) };
}

// ------------------------------------------------------------------ the check
const sceneFile = (file, s, n) => {
  const base = path.basename(file).toLowerCase();
  const id = String((s && s.id) || "").toLowerCase();
  return (id && base.includes(id)) || base.startsWith(String(n).padStart(2, "0") + "-") || new RegExp(`(^|[^0-9])0*${n}[-_.]`).test(base) && /scene|frame|^0*\d/.test(base);
};

export async function checkCanon({ run, project = null, scene = null, only = null }) {
  const findings = [], couldNot = [], reviews = [], report = { run, characters: [], scenes: [] };
  const add = (f) => findings.push(f);
  const sf = path.join(run, "motion", "score.json");
  if (!exists(sf)) return { status: "no-score", ok: false, findings: [{ severity: "error", rule: "no-score", message: `no score at ${sf}`, fix: "write motion/score.json first" }], report, couldNot, reviews };
  const score = readJSON(sf);
  const chars = (score.cast || []).filter((c) => c && c.kind === "character");
  if (!chars.length) return { status: "no-characters", ok: true, findings, report, couldNot, reviews };
  // 1. the canon files and the score's link
  const idents = {};
  const vc = validateCast(score, run, { traitsByMedium: { "3d-rig": traitsFor3d } });
  for (const row of vc.rows) {
    for (const e of row.errors) add({ severity: "error", rule: e.rule, cast: row.id, message: e.message, fix: e.fix });
    for (const w of row.warnings) add({ severity: "warning", rule: w.rule, cast: row.id, message: w.message, fix: w.fix });
  }
  for (const c of chars) {
    const file = c.canon ? path.resolve(run, String(c.canon)) : null;
    if (!exists(file)) continue;
    let idn; try { idn = loadIdentity(file); } catch { continue; }
    if (idn.medium !== "3d-rig") { report.characters.push({ id: c.id, medium: idn.medium, skipped: "painted 2D actors are checked by stage2d.mjs check" }); continue; }
    if (only && c.id !== only) continue;
    idents[c.id] = { idn, file, dir: path.dirname(file) };
    const v = validate3d(idn, path.dirname(file));
    for (const e of v.errors) if (!findings.some((f) => f.cast === c.id && f.rule === e.rule && f.message === e.message)) add({ severity: "error", rule: e.rule, cast: c.id, message: e.message, fix: e.fix });
    for (const w of v.warnings) if (!findings.some((f) => f.cast === c.id && f.rule === w.rule)) add({ severity: "warning", rule: w.rule, cast: c.id, message: w.message, fix: w.fix });
    report.characters.push({ id: c.id, medium: "3d-rig", digest: identityDigest(idn), rig_hash: idn.rig_hash || null, features: v.features.map((f) => f.trait) });
  }
  // 2. per-scene cast states (the scene contract's own cast-canon warnings, filtered by --scene)
  for (const w of castCanonWarnings(score, run)) {
    const m = w.match(/scene (\d+)/);
    if (scene != null && m && Number(m[1]) !== Number(scene)) continue;
    const [rule] = w.split(":");
    if (!/3d|cast/.test(rule)) continue;
    if (!findings.some((f) => f.message === w)) add({ severity: "warning", rule, message: w, fix: "scenes carry state, never identity: see the canon" });
  }
  const ids = Object.keys(idents);
  if (!ids.length) return finish();
  // 3. the plates
  const plates = {};
  for (const id of ids) {
    const { idn, dir } = idents[id];
    const pf = path.join(dir, "canon-plate.json");
    if (!exists(pf)) { add({ severity: "warning", rule: "plate-missing", cast: id, message: `cast/${id}/canon-plate.json does not exist: the visual check compares with a plate rendered now from identity.json, which cannot see a changed canon`, fix: `node scripts/canon.mjs plate --run <run> --id ${id}` }); continue; }
    const plate = readJSON(pf);
    if (idn.rig_hash && plate.rig_hash !== idn.rig_hash) add({ severity: "error", rule: "plate-stale", cast: id, message: `the canon plate was made for rig ${String(plate.rig_hash).slice(0, 12)}, the sealed rig is ${String(idn.rig_hash).slice(0, 12)}`, fix: "re-plate after an approved change: canon.mjs plate" });
    plates[id] = plate;
  }
  // 4. the browser: the canon against its plate, and every 3D scene that draws a recurring actor
  const files = [];
  if (project) {
    const sc = Array.isArray(score.scenes) ? score.scenes : [];
    let all = [];
    try { all = collect(project).filter(usesCharacter3d); } catch { /* none */ }
    for (const f of all) {
      const idx = sc.findIndex((s, i) => sceneFile(f, s, s.n != null ? s.n : i + 1));
      const n = idx >= 0 ? (sc[idx].n != null ? sc[idx].n : idx + 1) : null;
      if (scene != null && n !== Number(scene)) continue;
      files.push({ file: f, n });
    }
    if (scene != null && !files.length) add({ severity: "warning", rule: "scene-not-found", message: `no 3D composition with a recurring actor matches scene ${scene} in ${project}`, fix: "name the composition after the scene id or its number" });
  }
  // the shared rig is the lead builder's: a project copy of the adapter must be the skill's file, byte for byte
  if (project) {
    const mine = path.join(project, "assets", "three", "character-rig.js"), skill = path.join(STAGE, "character-rig.js");
    if (exists(mine) && fs.readFileSync(mine, "utf8") !== fs.readFileSync(skill, "utf8")) add({ severity: "error", rule: "shared-rig-modified", message: `${path.relative(project, mine)} differs from the skill's stage3d/character-rig.js: scene animators reference the shared rig, they never modify it`, fix: "restore it with stage3d.mjs install (the lead builder owns the rig; a rig change is a canon decision)" });
  }
  const reviewDir = (id) => path.join(idents[id].dir, "review");
  async function visual(name, views, id, n) {
    const plate = plates[id];
    for (const vn of ["front", "quarter"]) {
      const norm = normalizeView(views[vn]);
      const ref = plate ? plate.views[vn] : null;
      const cmp = ref ? compareViews(ref, norm, plate.thresholds || THRESHOLDS) : { verdict: "uncertain", reasons: ["no plate to compare with"], metrics: null };
      report.scenes.push({ scene: n, file: name, cast: id, view: vn, verdict: cmp.verdict, metrics: cmp.metrics, thresholds: plate ? plate.thresholds || THRESHOLDS : THRESHOLDS, proof: "a metric, never proof of identity" });
      if (cmp.verdict === "pass") continue;
      fs.mkdirSync(reviewDir(id), { recursive: true });
      const png = path.join(reviewDir(id), `${(name || "canon").replace(/[^\w.-]+/g, "_")}-${vn}.png`);
      fs.writeFileSync(png, reviewPng(views[vn], ref));
      const where = n != null ? `scene ${n}` : name;
      if (cmp.verdict === "fail") add({ severity: "error", rule: "silhouette-drift", scene: n, cast: id, view: vn, message: `${where}: the ${vn} silhouette of ${id} is off-model: ${cmp.reasons.join("; ")}`, fix: "the rig is the canon: remove what the scene changed about the body (scale, parts, colours); see the review image", image: path.relative(run, png) });
      else { add({ severity: "review", rule: "needs-frame-juror", scene: n, cast: id, view: vn, message: `${where}: the ${vn} view of ${id} is UNCERTAIN (${cmp.reasons.join("; ")}): a metric cannot say; the frame juror looks at the review image and the model sheet`, fix: "frame-juror visual review (tagged uncertain-metric)", image: path.relative(run, png) }); reviews.push({ cast: id, scene: n, view: vn, image: png }); }
    }
  }
  try {
    // the canon's own render against its plate (catches an adapter or canon change the plate does not know)
    if (scene == null) for (const id of ids) {
      const views = await canonViewsOf(idents[id].idn);
      await visual("canon", views, id, null);
    }
    for (const { file, n } of files) {
      const rel = path.relative(project, file);
      const r = await withComposition(file, "check", async (b, { ready }) => {
        for (const s of ready.stages || []) if (s.error) add({ severity: "error", rule: "build-failed", scene: n, message: `${rel}: the 3D scene failed to build: ${s.error}`, fix: "fix the scene (a character-rig error names the rule)" });
        const keys = await b.eval(`Object.keys(window.__rasanCharacters || {})`);
        if (!keys.length) add({ severity: "warning", rule: "no-actor", scene: n, message: `${rel}: no RasanCharacter3D actor registered (is loadCharacter called in build(k)?)`, fix: "load the actor with RasanCharacter3D.loadCharacter(identity, k)" });
        const out = [];
        for (const key of keys) {
          const cid = key.split("#")[0];
          const c = idents[cid];
          if (!c) { add({ severity: "error", rule: "cast-undeclared", scene: n, cast: cid, message: `${rel}: draws actor ${cid}, which is not a 3d-rig character in score.cast`, fix: "declare the actor in score.cast with its canon" }); continue; }
          const st = await b.eval(`(function(){ var r = window.__rasanCharacters[${q(key)}]; var v = RasanCharacter3D.validateCanon(r, ${q(c.idn)}, { expectDigest: ${q(identityDigest(c.idn))} }); return { ok: v.ok, findings: v.findings, measured: v.measured }; })()`);
          for (const f of st.findings) add({ severity: f.severity === "warning" ? "warning" : "error", rule: f.rule, scene: n, cast: cid, message: `${rel}: ${f.message}`, fix: f.fix, detail: f.proportion || f.part || f.key || null });
          // determinism of the pose layer: A-B-A on the live rig
          const aba = await b.eval(`(function(){ var r = window.__rasanCharacters[${q(key)}], S = ${q({ actions: [{ kind: "hop", at: 0.2, duration: 0.8 }, { kind: "look", at: 0.5, duration: 1.2, target: [1, 1, 1] }] })}; function h(t) { r.poseAt(t, S); return RasanCharacter3D.poseHash(r); } var a = h(0.9), b = h(2.1), a2 = h(0.9); return { same: a === a2, differs: a !== b }; })()`);
          if (!aba.same) add({ severity: "error", rule: "not-seek-safe", scene: n, cast: cid, message: `${rel}: the actor's pose carries state between seeks (A-B-A differs)`, fix: "poses are a pure function of t: do not store pose state in the scene" });
          const views = await b.eval(`RasanCharacter3D.canonViews(window.__rasanCharacters[${q(key)}], { identity: ${q(c.idn)} })`, { await: true });
          await visual(rel, views, cid, n);
          out.push({ key, ok: st.ok, measured: { ratios: st.measured.ratios, colours: Object.fromEntries(Object.entries(st.measured.parts).filter(([, p]) => p.colour).map(([k, p]) => [k, p.colour])), swapped: st.measured.colors_swapped, attach: Object.keys(st.measured.attach) } });
        }
        return out;
      });
      report.scenes.push({ scene: n, file: rel, actors: r.map((x) => ({ key: x.key, structural_ok: x.ok, measured: x.measured })) });
    }
  } catch (e) {
    couldNot.push(String(e.message || e).split("\n")[0]);
  }
  return finish();
  function finish() {
    const errors = findings.filter((f) => f.severity === "error").length;
    const status = errors ? "violations" : couldNot.length ? "could-not-run" : reviews.length ? "needs-review" : "clean";
    return { status, ok: !errors && !couldNot.length, findings, report, couldNot, reviews, errors, warnings: findings.filter((f) => f.severity === "warning").length, review: reviews.length };
  }
}

// ------------------------------------------------------------------ scaffold
export function scaffoldScene({ project, frame, duration, identityFile, spec, camera, canvas, width, height, key, keyDir, buildExtra, force }) {
  const idn = loadIdentity(identityFile);
  const v = validate3d(idn, path.dirname(identityFile));
  if (v.errors.length) throw new Error("the canon has errors: " + v.errors.map((e) => `${e.rule}: ${e.message}`).join("; "));
  const file = path.join(project, "compositions", "frames", `${frame}.html`);
  if (exists(file) && !force) throw new Error(`${file} exists (pass --force)`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, sceneText({ frame, duration, identity: idn, spec, camera, canvas, width, height, key, keyDir, buildExtra }));
  const inst = install(project);
  return { file, runtime: inst.dir };
}
