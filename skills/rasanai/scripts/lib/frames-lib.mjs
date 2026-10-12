// Styleframes and design boards (references/styleframes.md): the shot list rules, the juror's verdict, the reference
// stills a run has, side-by-side sheets, the draft-vs-board match (SSIM) and the console payload. Zero dependencies:
// Node + ffmpeg (+ headless Chrome for labelled sheets, with an ffmpeg fallback). Used by scripts/frames.mjs and crew.mjs.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

export const SIZES = ["ECU", "CU", "MS", "WS", "TYPE"];
export const KINDS = ["title", "ui-demo", "object", "type", "photo", "wide", "end"];
export const VERDICTS = ["at-par", "close", "below"];
export const frameId = (i) => String(i + 1).padStart(2, "0");

const exists = (p) => !!p && fs.existsSync(p);
const readJ = (p) => { try { return exists(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null; } catch { return undefined; } };
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const words = (s) => new Set(norm(s).split(" ").filter((w) => w.length >= 4));
const IMG = /\.(png|jpe?g|webp)$/i;
const VID = /\.(mp4|mov|webm|m4v|mkv)$/i;

// ---------------------------------------------------------------- the shot list
export function framesDir(run) { return path.join(run, "frames"); }
export function readShots(file) {
  const j = readJ(file);
  if (j === null || j === undefined) return j;
  const shots = Array.isArray(j) ? j : Array.isArray(j.shots) ? j.shots : [];
  const film = (!Array.isArray(j) && j.film && typeof j.film === "object") ? j.film : {};
  shots.forEach((s, i) => { if (s && !s.id) s.id = frameId(i); });
  return { film, shots };
}
const pctOf = (x) => { const n = Number(x && typeof x === "object" ? x.pct ?? x.h_pct ?? x.h : x); return Number.isFinite(n) ? n : null; };
export function typeStats(shot) {
  const T = Array.isArray(shot.type) ? shot.type.filter((t) => t && typeof t === "object") : [];
  const readable = T.filter((t) => t.readable !== false && String(t.text || "").trim());
  const sizes = T.map(pctOf).filter((n) => n != null && n > 0);
  return { lines: readable.length, chars: readable.reduce((a, t) => a + String(t.text).trim().length, 0), biggest: sizes.length ? Math.max(...sizes) : 0, smallest: sizes.length ? Math.min(...sizes) : 0 };
}
function angleOf(a) {
  if (a == null || a === "") return null;
  if (typeof a === "string") return /^(frontal|tabletop|top|overhead|flat)/i.test(a.trim()) ? { kind: a.trim().toLowerCase() } : { kind: "named", text: a };
  if (typeof a === "object") { const r = { rx: Number(a.rx) || 0, ry: Number(a.ry) || 0, rz: Number(a.rz) || 0 }; return { kind: "tilt", ...r }; }
  return null;
}
const filled = (v) => v != null && (typeof v === "object" ? Object.values(v).some((x) => String(x ?? "").trim()) : String(v).trim() !== "");

// The rules of references/styleframes.md (from R1 §4: R3, R4, R5, R8, R11, R20). Returns {errors, warnings, stats}.
export function checkShots(doc, { duration = null } = {}) {
  const E = [], W = [];
  if (!doc || !Array.isArray(doc.shots)) return { errors: ["frames/shots.json is missing or has no shots[]"], warnings: W, stats: {} };
  const S = doc.shots, film = doc.film || {};
  const dur = Number(film.duration) || Number(duration) || null;
  if (S.length < 3) E.push(`shot-count: ${S.length} shots (one per beat; at least 3: open, peak, end)`);
  const ids = S.map((s) => String(s.id));
  if (new Set(ids).size !== ids.length) E.push("shot-ids: every shot needs a unique id (01, 02, ...)");
  S.forEach((s, i) => {
    const id = s.id || frameId(i);
    const miss = ["beat", "size", "hero", "angle", "focus", "light", "ground", "crop", "device"].filter((k) => !filled(s[k]));
    if (!Array.isArray(s.type)) miss.push("type");
    if (miss.length) E.push(`shot-fields: ${id} is missing ${miss.join(", ")}`);
    if (s.size && !SIZES.includes(String(s.size).toUpperCase())) E.push(`shot-size: ${id} size "${s.size}" (one of ${SIZES.join(", ")})`);
    if (s.kind && !KINDS.includes(s.kind)) W.push(`shot-kind: ${id} kind "${s.kind}" (one of ${KINDS.join(", ")}: the juror matches reference stills by kind)`);
    const L = s.light && typeof s.light === "object" ? s.light : null;
    if (filled(s.light) && !(L ? String(L.key || L.side || "").trim() && String(L.color || L.colour || "").trim() : /(left|right|top|above|below|behind|front|back)/i.test(String(s.light)) && /(#[0-9a-f]{3,8}|warm|cool|white|neutral|[a-z]+ ?light)/i.test(String(s.light)))) E.push(`light: ${id} names its key's side and colour ({key: "upper-left", color: "#fff4e6"})`);
    const a = angleOf(s.angle);
    if (a && a.kind === "tilt") {
      const big = ["rx", "ry", "rz"].filter((k) => Math.abs(a[k]) > 0.5);
      if (big.length > 2 || ["rx", "ry", "rz"].some((k) => Math.abs(a[k]) > 35)) W.push(`tilt-steep: ${id} rotates ${big.map((k) => `${k} ${a[k]}`).join(", ")}: keep a tilt to two axes and 35 degrees or less, or the type shears and reads italic`);
    }
    const hp = Number(s.hero_pct);
    const sz = String(s.size || "").toUpperCase();
    const ts = typeStats(s);
    if (s.kind === "end") { if (ts.biggest && ts.biggest < 8) W.push(`end-small: ${id} (end card) sets its line at ${ts.biggest}% H: the end line is large (8% H or more)`); }
    else if (sz === "TYPE") { if (Math.max(ts.biggest, hp || 0) < 12) E.push(`hero-small: ${id} is a TYPE shot whose biggest line is ${Math.max(ts.biggest, hp || 0)}% H (a type shot is statement size: 12% H or more)`); }
    else if (!(hp >= 25)) E.push(`hero-small: ${id} hero_pct ${Number.isFinite(hp) ? hp : "missing"} (the hero takes at least 25% of the frame height; set hero_pct)`);
  });
  // no two consecutive shots share size AND hero
  for (let i = 1; i < S.length; i++) {
    const a = S[i - 1], b = S[i];
    if (String(a.size).toUpperCase() === String(b.size).toUpperCase() && norm(a.hero) && norm(a.hero) === norm(b.hero)) E.push(`size-repeat: ${a.id} and ${b.id} share size ${String(b.size).toUpperCase()} and hero "${b.hero}": change the size, or the hero, between neighbours`);
  }
  const sizes = new Set(S.map((s) => String(s.size || "").toUpperCase()).filter((x) => SIZES.includes(x)));
  if ((dur == null || dur >= 20) && S.length >= 3 && sizes.size < 3) E.push(`sizes-few: ${sizes.size} shot size(s) (${[...sizes].join(", ")}); a film of 20 s or more uses at least 3`);
  const ws = S.filter((s) => String(s.size).toUpperCase() === "WS").length, wsMax = Math.max(1, Math.round((dur || 30) / 30));
  if (ws > wsMax) E.push(`ws-many: ${ws} wide shots (at most ${wsMax}: one per 30 s; a wide shot is the whole app, and the whole app is a screenshot)`);
  // text load outside one declared density shot
  const dens = S.filter((s) => s.density === true || (film.density_shot && String(film.density_shot) === String(s.id)));
  if (dens.length > 1) E.push(`density-many: ${dens.length} density shots (at most 1 per film)`);
  for (const s of S) {
    if (dens.includes(s)) continue;
    const t = typeStats(s);
    if (t.lines > 2 || t.chars > 30) E.push(`text-heavy: ${s.id} shows ${t.lines} readable line(s), ${t.chars} characters (2 lines and about 30 characters at most, UI labels included; mark soft or cropped text "readable": false, or declare this the one density shot)`);
  }
  // giant moments and type contrast
  const big = S.map((s) => Math.max(typeStats(s).biggest, String(s.size).toUpperCase() === "TYPE" ? Number(s.hero_pct) || 0 : 0));
  const biggestAny = Math.max(0, ...S.map((s, i) => Math.max(big[i], Number(s.hero_pct) || 0)));
  if (biggestAny < 35) E.push(`no-giant: no moment of 35% H or more (the biggest is ${biggestAny}% H): one line or object fills the frame somewhere`);
  const giantShare = big.filter((x) => x >= 20).length / Math.max(1, S.length);
  if (giantShare < 0.1) W.push(`giant-rare: ${Math.round(giantShare * 100)}% of shots have a line of 20% H or more (refs 12 to 53%)`);
  const bl = big.filter((x) => x > 0).sort((a, b) => a - b);
  if (bl.length >= 3) {
    const q = (p) => bl[Math.min(bl.length - 1, Math.max(0, Math.round((p / 100) * (bl.length - 1))))];
    const r = q(90) / Math.max(0.01, q(10));
    if (r < 5) W.push(`scale-flat: the biggest line's p90/p10 across the shots is ${Math.round(r * 10) / 10}x (refs 6 to 23x): go giant somewhere and tiny somewhere else, or carry the contrast in object scale`);
  }
  // anchor monotony
  if (S.length >= 4) {
    const count = {};
    for (const s of S) if (norm(s.anchor) && s.transforms !== true) count[norm(s.anchor)] = (count[norm(s.anchor)] || 0) + 1;
    for (const [k, c] of Object.entries(count)) if (c / S.length > 0.5) E.push(`anchor-monotony: "${k}" anchors ${c} of ${S.length} shots (50% at most unless it transforms: mark the appearances where it becomes something else "transforms": true)`);
  }
  // the device recurs
  const dev = norm(film.device);
  if (!dev) W.push("device-missing: film.device names the recurring graphic device (the carrier, a frame chrome, an accent dot, a light comet)");
  // heroes: open, peak, end
  const heroes = Array.isArray(film.heroes) ? film.heroes.map(String) : [];
  if (heroes.length !== 3) E.push(`heroes: film.heroes names ${heroes.length} frame id(s); name 3 (open, peak, end), the hero styleframes`);
  else for (const h of heroes) if (!ids.includes(h)) E.push(`heroes: "${h}" is not a shot id`);
  return { errors: E, warnings: W, stats: { shots: S.length, sizes: [...sizes], ws, biggest_pct: biggestAny, giant_share: Math.round(giantShare * 100) / 100 } };
}

export function boardFiles(dir, doc) {
  return (doc && Array.isArray(doc.shots) ? doc.shots : []).map((s, i) => {
    const id = String(s.id || frameId(i));
    const html = path.join(dir, `${id}.html`), png = path.join(dir, `${id}.png`);
    return { id, beat: s.beat, html, png, has_html: exists(html), has_png: exists(png) };
  });
}

// ---------------------------------------------------------------- the juror's verdict
export function checkVerdict(v, doc, { refsAvailable = 0 } = {}) {
  const E = [], W = [];
  if (!v || typeof v !== "object") return { errors: ["frames/verdict.json is missing or not valid JSON"], warnings: W };
  const F = Array.isArray(v.frames) ? v.frames : [];
  const ids = (doc && doc.shots ? doc.shots : []).map((s, i) => String(s.id || frameId(i)));
  for (const id of ids) if (!F.some((f) => f && String(f.id) === id)) E.push(`verdict: frame ${id} has no verdict`);
  F.forEach((f, i) => {
    const id = f && f.id != null ? f.id : `#${i + 1}`;
    if (!f || !VERDICTS.includes(f.verdict)) { E.push(`verdict: frame ${id} verdict must be at-par, close or below`); return; }
    const fixes = (Array.isArray(f.fixes) ? f.fixes : []).filter((x) => String(x || "").trim().length >= 20);
    if (f.verdict !== "at-par" && !fixes.length) E.push(`verdict: frame ${id} is ${f.verdict} with no specific fix (a fix names what to change and by how much: "drop the card 120 px so the tick sits on the focus band", 20+ characters)`);
    if (refsAvailable && !(f.ref && String(f.ref.image || "").trim())) E.push(`verdict: frame ${id} names no reference still (the run has ${refsAvailable}): judge it next to a still of the same kind`);
    else if (!refsAvailable && !(f.ref && (String(f.ref.image || "").trim() || String(f.ref.source || "").trim()))) W.push(`verdict: frame ${id} names no reference (no stills in the run: cite a showcase line instead, ref.source)`);
    if (f.ref && String(f.ref.image || "").trim() && !String(f.ref.why || "").trim()) W.push(`verdict: frame ${id}'s reference has no why (why this still is the same kind of frame)`);
  });
  const below = F.filter((f) => f && f.verdict === "below").length;
  if (!String(v.summary || "").trim()) W.push("verdict: no summary (one line: how the set stands against the references)");
  return { errors: E, warnings: W, below, at_par: F.filter((f) => f && f.verdict === "at-par").length };
}

// ---------------------------------------------------------------- reference stills
function walk(d, depth = 4, acc = []) {
  if (depth < 0 || !exists(d)) return acc;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, depth - 1, acc); else acc.push(p);
  }
  return acc;
}
const isSheet = (f) => /(^|[-_/])(sheet|contact|tile)[^/]*\.(png|jpe?g)$/i.test(f);
function duration(file) {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" });
  return Number(String(r.stdout || "").trim()) || 0;
}
export function extractFrames(video, outDir, n = 6, prefix = "f") {
  const d = duration(video);
  if (!(d > 0)) return [];
  fs.mkdirSync(outDir, { recursive: true });
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = Math.round(((i + 0.5) / n) * d * 100) / 100;
    const f = path.join(outDir, `${prefix}-${String(i + 1).padStart(2, "0")}.jpg`);
    if (!exists(f)) spawnSync("ffmpeg", ["-y", "-v", "error", "-ss", String(t), "-i", video, "-frames:v", "1", "-vf", "scale=960:-2", "-q:v", "3", f]);
    if (exists(f)) out.push({ image: f, t });
  }
  return out;
}
// Every reference still the run has, by origin (the juror sorts them by kind: title vs title, UI demo vs UI demo).
export function collectRefs(run, { skillDir = null, extract = true, perVideo = 6 } = {}) {
  const stills = [], videos = [];
  const add = (image, origin, source, extra = {}) => stills.push({ image, origin, source, ...extra });
  const cache = path.join(run, "frames", "refs");
  const sources = [
    ["brand-film", path.join(run, "brand-film")],
    ["reference", path.join(run, "research", "films", "reference")],
    ["precedent", path.join(run, "research", "films")],
    ["moment", path.join(run, "references", "moments")],
  ];
  const seen = new Set();
  for (const [origin, dir] of sources) {
    for (const f of walk(dir)) {
      if (seen.has(f)) continue;
      seen.add(f);
      if (origin === "precedent" && f.startsWith(path.join(run, "research", "films", "reference"))) continue;
      if (IMG.test(f) && !isSheet(f)) add(f, origin, path.relative(run, path.dirname(f)));
      else if (VID.test(f)) videos.push({ file: f, origin });
    }
  }
  // stills the Director put in frames/refs/ by hand (or extracted before)
  for (const f of walk(cache, 1)) if (IMG.test(f) && !seen.has(f)) { seen.add(f); add(f, /^moment-|^video-/.test(path.basename(f)) ? "extracted" : "user", "frames/refs"); }
  // a video with no stills next to it: pull evenly spaced frames into frames/refs/
  if (extract) for (const v of videos) {
    const dir = path.dirname(v.file);
    if (stills.some((s) => path.dirname(s.image) === dir || s.image.startsWith(dir + path.sep))) continue;
    const tag = `video-${v.origin}-${path.basename(dir)}-${path.basename(v.file).replace(/\.[^.]+$/, "")}`.replace(/[^a-z0-9-]+/gi, "-").slice(0, 80);
    for (const x of extractFrames(v.file, cache, perVideo, tag)) if (!seen.has(x.image)) { seen.add(x.image); add(x.image, v.origin, path.relative(run, v.file), { t: x.t }); }
  }
  // no stills at all: the library's showcase films, in words
  const descriptions = [];
  if (skillDir) {
    const sd = path.join(skillDir, "library", "showcases");
    if (exists(sd)) for (const f of fs.readdirSync(sd).filter((x) => x.endsWith(".json"))) {
      const j = readJ(path.join(sd, f));
      if (j && j.id) descriptions.push({ id: j.id, title: j.title, kind: j.kind, world: j.world, file: path.join(sd, f) });
    }
  }
  const byOrigin = {};
  for (const s of stills) byOrigin[s.origin] = (byOrigin[s.origin] || 0) + 1;
  return { stills, by_origin: byOrigin, descriptions };
}

// ---------------------------------------------------------------- sheets
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
// rows: [[{image, label}], ...] -> one PNG. Headless Chrome for labels; ffmpeg tiles (no labels) when Chrome is missing.
export function gridSheet(rows, outPng, { cellW = 640, title = "", screenshot = null } = {}) {
  rows = rows.filter((r) => r && r.length);
  if (!rows.length) throw new Error("nothing to put on the sheet");
  fs.mkdirSync(path.dirname(path.resolve(outPng)), { recursive: true });
  const cols = Math.max(...rows.map((r) => r.length));
  const cellH = Math.round((cellW * 9) / 16);
  if (screenshot) {
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#151515;color:#ddd;font:500 15px/1.25 -apple-system,Helvetica,Arial,sans-serif}h1{font-size:17px;margin:0;padding:12px 12px 0;color:#fff}.r{display:grid;grid-template-columns:repeat(${cols},${cellW}px);gap:10px;padding:10px 12px}figure{margin:0}img{width:${cellW}px;height:${cellH}px;object-fit:contain;background:#000;display:block}figcaption{padding:5px 2px 0;height:36px;overflow:hidden}figure.ours img{outline:3px solid #f2c94c;outline-offset:-3px}</style></head><body>${title ? `<h1>${esc(title)}</h1>` : ""}${rows.map((r) => `<div class="r">${r.map((c) => `<figure class="${c.ours ? "ours" : ""}">${c.image ? `<img src="file://${esc(path.resolve(c.image))}">` : `<div style="width:${cellW}px;height:${cellH}px;background:#222"></div>`}<figcaption>${esc(c.label || "")}</figcaption></figure>`).join("")}</div>`).join("")}</body></html>`;
    const tmp = path.join(os.tmpdir(), `rasanai-frames-sheet-${process.pid}-${Date.now()}.html`);
    fs.writeFileSync(tmp, html);
    try {
      screenshot(`file://${tmp}`, outPng, cols * cellW + (cols - 1) * 10 + 24, (title ? 34 : 0) + rows.length * (cellH + 41 + 10) + 10, 6000);
    } catch { /* fall through to ffmpeg */ } finally { fs.rmSync(tmp, { force: true }); }
    if (exists(outPng)) return { sheet: outPng, labels: true };
  }
  // ffmpeg: each cell scaled and padded to cellW x cellH, rows hstacked, then vstacked
  const inputs = [], filters = [], rowLabels = [];
  let k = 0;
  rows.forEach((r, ri) => {
    const cells = [];
    for (let c = 0; c < cols; c++) {
      const cell = r[c];
      if (cell && cell.image && exists(cell.image)) inputs.push("-i", cell.image);
      else inputs.push("-f", "lavfi", "-i", `color=c=0x222222:s=${cellW}x${cellH}`);
      filters.push(`[${k}:v]scale=${cellW}:${cellH}:force_original_aspect_ratio=decrease,pad=${cellW}:${cellH}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,format=rgb24[c${k}]`);
      cells.push(`[c${k}]`);
      k++;
    }
    filters.push(cols > 1 ? `${cells.join("")}hstack=inputs=${cols}[r${ri}]` : `${cells[0]}copy[r${ri}]`);
    rowLabels.push(`[r${ri}]`);
  });
  filters.push(rows.length > 1 ? `${rowLabels.join("")}vstack=inputs=${rows.length}[out]` : `${rowLabels[0]}copy[out]`);
  const r = spawnSync("ffmpeg", ["-y", "-v", "error", ...inputs, "-filter_complex", filters.join(";"), "-map", "[out]", "-frames:v", "1", outPng], { encoding: "utf8" });
  if (r.status !== 0 || !exists(outPng)) throw new Error(`ffmpeg could not draw the sheet: ${(r.stderr || "").trim().split("\n").pop()}`);
  return { sheet: outPng, labels: false };
}

// ---------------------------------------------------------------- SSIM on a 160x90 grey downscale
export function grey(file, t = null, w = 160, h = 90) {
  const a = ["-v", "error"];
  if (t != null) a.push("-ss", String(t));
  a.push("-i", file, "-frames:v", "1", "-vf", `scale=${w}:${h}:flags=area`, "-f", "rawvideo", "-pix_fmt", "gray", "-");
  const r = spawnSync("ffmpeg", a, { maxBuffer: 1 << 24 });
  if (r.status !== 0 || !r.stdout || r.stdout.length < w * h) return null;
  return r.stdout.subarray(0, w * h);
}
export function ssim(A, B, w = 160, h = 90, win = 8, step = 4) {
  const C1 = (0.01 * 255) ** 2, C2 = (0.03 * 255) ** 2;
  let sum = 0, n = 0;
  for (let y = 0; y + win <= h; y += step) for (let x = 0; x + win <= w; x += step) {
    let ma = 0, mb = 0;
    for (let j = 0; j < win; j++) for (let i = 0; i < win; i++) { const p = (y + j) * w + x + i; ma += A[p]; mb += B[p]; }
    const N = win * win; ma /= N; mb /= N;
    let va = 0, vb = 0, cv = 0;
    for (let j = 0; j < win; j++) for (let i = 0; i < win; i++) { const p = (y + j) * w + x + i; const da = A[p] - ma, db = B[p] - mb; va += da * da; vb += db * db; cv += da * db; }
    va /= N - 1; vb /= N - 1; cv /= N - 1;
    sum += ((2 * ma * mb + C1) * (2 * cv + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2)); n++;
  }
  return n ? Math.round((sum / n) * 1000) / 1000 : null;
}

// ---------------------------------------------------------------- the score's beats <-> the boards
// a score scene's board: its `board` (a path or an id), else the shot whose beat names the scene's id, else by position
export function boardFor(scene, i, doc) {
  const S = doc && doc.shots ? doc.shots : [];
  if (scene && scene.board) {
    const b = String(scene.board), base = path.basename(b).replace(/\.(png|html)$/i, "");
    const hit = S.find((s) => String(s.id) === base || String(s.id) === b);
    if (hit) return hit;
  }
  const byBeat = S.find((s) => scene && (norm(s.beat) && (norm(s.beat) === norm(scene.id) || norm(s.beat) === norm(scene.title))));
  if (byBeat) return byBeat;
  return S[i] || null;
}
export function heroesAgree(a, b) {
  const A = words(a), B = words(b);
  if (!A.size || !B.size) return norm(a) === norm(b) || !norm(a) || !norm(b);
  for (const w of A) if (B.has(w)) return true;
  return norm(a).includes(norm(b)) || norm(b).includes(norm(a));
}

// ---------------------------------------------------------------- the console payload
export function buildPayload(run, { rel = (p) => p } = {}) {
  const dir = framesDir(run);
  const doc = readShots(path.join(dir, "shots.json"));
  if (!doc) throw new Error("frames/shots.json is missing or invalid");
  const v = readJ(path.join(dir, "verdict.json")) || {};
  const VF = Array.isArray(v.frames) ? v.frames : [];
  const heroes = Array.isArray(doc.film.heroes) ? doc.film.heroes.map(String) : [];
  const frames = doc.shots.map((s, i) => {
    const id = String(s.id || frameId(i)), png = path.join(dir, `${id}.png`);
    const jv = VF.find((f) => f && String(f.id) === id) || {};
    const ref = jv.ref && (jv.ref.image || jv.ref.source) ? { image: jv.ref.image ? rel(path.isAbsolute(jv.ref.image) ? jv.ref.image : path.resolve(run, jv.ref.image)) : null, source: jv.ref.source || null, why: jv.ref.why || null } : null;
    const ang = angleOf(s.angle);
    const angle = !ang ? null : ang.kind === "tilt" ? ["rx", "ry", "rz"].filter((k) => ang[k]).map((k) => `${k} ${ang[k]}°`).join(" ") || "frontal" : ang.text || ang.kind;
    const focus = s.focus && typeof s.focus === "object" ? [s.focus.sharp && `sharp: ${s.focus.sharp}`, s.focus.soft && `soft: ${s.focus.soft}`].filter(Boolean).join("; ") : s.focus || null;
    const light = s.light && typeof s.light === "object" ? `${s.light.key || s.light.side || ""} ${s.light.color || s.light.colour || ""}`.trim() : s.light || null;
    return {
      id, beat: s.beat || null, title: s.line || s.beat || `Frame ${id}`, image: exists(png) ? rel(png) : null, ref,
      shot: { size: String(s.size || "").toUpperCase() || null, angle, hero: s.hero || null, focus, light },
      caption: s.caption || [String(s.size || "").toUpperCase(), s.hero].filter(Boolean).join(" · "),
      verdict: VERDICTS.includes(jv.verdict) ? jv.verdict : null,
      fixes: Array.isArray(jv.fixes) && jv.fixes.length ? jv.fixes : undefined,
    };
  });
  const sheet = exists(path.join(dir, "sheet.png")) ? rel(path.join(dir, "sheet.png")) : null;
  const below = frames.filter((f) => f.verdict === "below").map((f) => f.id);
  return {
    question: "Do these frames look like your film?",
    context: `${frames.length} frames, one per beat; the three big ones are the hero frames (open, peak, end). Each sits next to a reference still of the same kind. Comment on any frame, ask for a redo, or approve and Claude animates between them.`,
    frames, heroes, sheet, recommended: below.length ? "redo" : "approve",
    ...(below.length ? { redo_suggested: below } : {}),
    // older pages read these
    images: frames.filter((f) => f.image).map((f) => f.image), captions: frames.filter((f) => f.image).map((f) => `${f.id} · ${f.title}`),
  };
}

// ---------------------------------------------------------------- the frame kit (fallback when RasanCamera is not installed)
// The two things x1 proved and that a still needs: a lit tinted ground with grain and vignette, and optical depth of
// field (a sharp copy and a blurred copy of the same plane, masked against each other). RasanCamera (assets/rasan-camera/,
// camera.mjs install) is the full rig; this is the floor.
export const KIT_CSS = `/* RasanAI frame kit (frames.mjs init): lit ground, grain, vignette. RasanCamera supersedes it when installed. */
.rk-frame{position:absolute;inset:0;overflow:hidden}
.rk-ground{position:absolute;inset:0;background:
  radial-gradient(60% 70% at var(--kx,30%) var(--ky,20%), var(--key,rgba(255,255,255,.9)) 0%, transparent 70%),
  radial-gradient(90% 90% at 85% 115%, var(--shade,rgba(0,0,0,.10)), transparent 70%),
  linear-gradient(180deg, var(--g0,#f2f2f1), var(--g1,#e6e6e4))}
.rk-grain{position:absolute;inset:-50%;pointer-events:none;opacity:var(--grain,.04);mix-blend-mode:multiply;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .9 0'/></filter><rect width='240' height='240' filter='url(%23n)'/></svg>")}
.rk-vignette{position:absolute;inset:0;pointer-events:none;background:radial-gradient(140% 110% at 50% 45%, transparent 55%, var(--vig,rgba(20,20,30,.12)) 100%)}
.rk-stage{position:absolute;inset:0;perspective:var(--persp,2200px);perspective-origin:50% 45%}
.rk-plane{position:absolute;transform-style:preserve-3d}
.rk-shadow{position:absolute;border-radius:50%;background:radial-gradient(closest-side, rgba(0,0,0,var(--sa,.28)), transparent);filter:blur(var(--sb,18px));pointer-events:none}
`;
export const KIT_JS = `// RasanAI frame kit: optical depth of field and contact shadows for stills. RasanCamera supersedes it when installed.
// <div data-dof="<mask for the sharp band>" data-dof-soft="<mask for the rest>" data-dof-blur="10"> ... </div>
// RK.contactShadow(el, {spread: 1.1, opacity: .28, blur: 18}) puts a soft shadow on the ground under a floating element.
(function(){
  function dof(){ document.querySelectorAll('[data-dof]').forEach(function(e){
    if (e.__rkDof) return; e.__rkDof = 1;
    var c = e.cloneNode(true); c.removeAttribute('data-dof'); c.__rkDof = 1;
    c.style.filter = 'blur(' + (e.dataset.dofBlur || 8) + 'px)';
    c.style.webkitMaskImage = c.style.maskImage = e.dataset.dofSoft;
    e.style.webkitMaskImage = e.style.maskImage = e.dataset.dof;
    e.after(c);
  }); }
  function contactShadow(el, o){ o = o || {}; var r = el.getBoundingClientRect(), s = document.createElement('div');
    var sp = o.spread || 1.1, w = r.width * sp, h = Math.max(24, r.height * (o.flat || 0.12));
    s.className = 'rk-shadow'; s.style.left = (r.left + (r.width - w) / 2) + 'px'; s.style.top = (r.bottom - h * 0.45) + 'px';
    s.style.width = w + 'px'; s.style.height = h + 'px'; s.style.setProperty('--sa', o.opacity || .28); s.style.setProperty('--sb', (o.blur || 18) + 'px');
    (o.parent || el.parentNode).insertBefore(s, el); return s; }
  window.RK = { dof: dof, contactShadow: contactShadow };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', dof); else dof();
})();
`;
