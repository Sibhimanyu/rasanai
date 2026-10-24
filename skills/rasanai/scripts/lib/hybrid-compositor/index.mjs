// Hybrid compositor (W4). Perspective-warps replacement content into a tracked quad (C5), soft-edges it, and lets a matte
// put foreground in front. Node + ffmpeg only: ffmpeg decodes/encodes raw RGB, the warp is exact per-pixel inverse homography.
//   composite({base, content, track, matte?, out, ...}) -> {frames, fps, width, height, out}
//   readTrack(file|obj), quadAt(track, t_s), homography(src, dst), validateSources(doc, opts)   (C1 reader/validator)
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn, spawnSync } from "node:child_process";

export function probe(file) {
  const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-count_frames", "-show_entries", "stream=width,height,r_frame_rate,nb_read_frames,duration", "-show_entries", "format=duration", "-of", "json", file], { encoding: "utf8" });
  if (r.status !== 0) throw new Error("ffprobe failed for " + file + ": " + r.stderr);
  const j = JSON.parse(r.stdout), s = j.streams[0] || {};
  const [n, d] = String(s.r_frame_rate || "0/1").split("/").map(Number);
  return { width: s.width, height: s.height, fps_num: n, fps_den: d || 1, fps: n / (d || 1), frames: Number(s.nb_read_frames) || null, duration_s: Number(s.duration || j.format?.duration) || null };
}

// ---- C5 track
export function readTrack(src) {
  const t = typeof src === "string" ? JSON.parse(fs.readFileSync(src, "utf8")) : src;
  if (t.schema_version !== 1) throw new Error(`track schema_version ${t.schema_version} unsupported (need 1)`);
  if (!Array.isArray(t.frames) || !t.frames.length) throw new Error("track has no frames");
  if (t.track_type && t.track_type !== "planar-quad") throw new Error(`track_type ${t.track_type} is not a planar-quad track`);
  let prev = -Infinity; const warnings = [];
  for (const f of t.frames) {
    if (!(f.t_s > prev)) throw new Error("track t_s must be strictly increasing");
    prev = f.t_s;
    if (!Array.isArray(f.quad_norm) || f.quad_norm.length !== 4) throw new Error(`track frame at ${f.t_s} has no quad_norm`);
    if (!convexTLTRBRBL(f.quad_norm)) throw new Error(`quad at ${f.t_s}s is not convex TL,TR,BR,BL`);
    if (typeof f.confidence === "number" && f.confidence < 0.5) warnings.push(`low confidence ${f.confidence} at ${f.t_s}s`);
  }
  if (t.status === "failed") throw new Error("track status is failed: re-track");
  return { ...t, warnings };
}
function convexTLTRBRBL(q) {
  let s = 0;
  for (let k = 0; k < 4; k++) {
    const [ax, ay] = q[k], [bx, by] = q[(k + 1) % 4], [cx, cy] = q[(k + 2) % 4];
    const c = (bx - ax) * (cy - by) - (by - ay) * (cx - bx);
    if (c === 0) return false; if (s && Math.sign(c) !== s) return false; s = Math.sign(c);
  }
  return s > 0; // screen coords (y down): clockwise TL,TR,BR,BL has positive cross
}
// Quad at time t: linear interpolation between samples (keyed to source PTS), clamped at the ends.
export function quadAt(track, t) {
  const fr = track.frames;
  if (t <= fr[0].t_s) return fr[0].quad_norm;
  if (t >= fr[fr.length - 1].t_s) return fr[fr.length - 1].quad_norm;
  let lo = 0, hi = fr.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (fr[m].t_s <= t) lo = m; else hi = m; }
  const u = (t - fr[lo].t_s) / (fr[hi].t_s - fr[lo].t_s);
  return fr[lo].quad_norm.map((p, k) => [p[0] + (fr[hi].quad_norm[k][0] - p[0]) * u, p[1] + (fr[hi].quad_norm[k][1] - p[1]) * u]);
}

// ---- geometry
// Homography H (row-major 9, h33=1) mapping each src[k] to dst[k] (4 point pairs).
export function homography(src, dst) {
  const A = [], b = [];
  for (let k = 0; k < 4; k++) {
    const [x, y] = src[k], [u, v] = dst[k];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  const n = 8;
  for (let i = 0; i < n; i++) {
    let p = i; for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
    [A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]];
    if (Math.abs(A[i][i]) < 1e-12) throw new Error("degenerate quad");
    for (let r = i + 1; r < n; r++) { const f = A[r][i] / A[i][i]; for (let c = i; c < n; c++) A[r][c] -= f * A[i][c]; b[r] -= f * b[i]; }
  }
  const h = new Array(8);
  for (let i = n - 1; i >= 0; i--) { let s = b[i]; for (let c = i + 1; c < n; c++) s -= A[i][c] * h[c]; h[i] = s / A[i][i]; }
  return [...h, 1];
}

// ---- raw ffmpeg io
function decoder(args, w, h, ch) {
  const p = spawn("ffmpeg", ["-v", "error", ...args, "-f", "rawvideo", "-pix_fmt", ch === 1 ? "gray" : "rgb24", "-"], { stdio: ["ignore", "pipe", "pipe"] });
  let err = ""; p.stderr.on("data", (d) => { err += d; });
  const size = w * h * ch; let buf = Buffer.alloc(0); const it = p.stdout[Symbol.asyncIterator]();
  let done = false;
  return {
    async next() { // next frame or null at EOF
      while (buf.length < size && !done) { const r = await it.next(); if (r.done) done = true; else buf = Buffer.concat([buf, r.value]); }
      if (buf.length < size) return null;
      const f = buf.subarray(0, size); buf = buf.subarray(size); return f;
    },
    kill() { p.stdout.destroy(); p.kill("SIGKILL"); },
    get err() { return err; },
  };
}

export const CRF_DEFAULT = 14;
// opts: base, content (video or image path), track (path|obj), matte (optional gray video/image: 255 = foreground in front),
//       out, feather_px (1), loop_content (true), crf, fit ("fill"|"cover"|"contain", default "fill": content fills the quad).
export async function composite(opts) {
  const { base, content, out } = opts;
  const track = readTrack(opts.track);
  const bi = probe(base), W = bi.width, H = bi.height, fps = bi.fps;
  const feather = opts.feather_px ?? 1;
  const isImg = /\.(png|jpe?g|webp|bmp|tiff?)$/i.test(content);
  const ci = isImg ? probe(content) : probe(content);
  const CW = ci.width, CH = ci.height;
  const total = opts.max_frames ?? bi.frames ?? Math.round((bi.duration_s || 0) * fps);

  const dBase = decoder(["-i", base], W, H, 3);
  const dCont = decoder(isImg ? ["-loop", "1", "-i", content, "-vf", `fps=${bi.fps_num}/${bi.fps_den}`] : [...(opts.loop_content === false ? [] : ["-stream_loop", "-1"]), "-i", content, "-vf", `fps=${bi.fps_num}/${bi.fps_den}`], CW, CH, 3);
  let dMat = null;
  if (opts.matte) {
    const mi = probe(opts.matte);
    const still = /\.(png|jpe?g|webp|bmp)$/i.test(opts.matte);
    dMat = decoder([...(still ? ["-loop", "1"] : []), "-i", opts.matte, "-vf", `scale=${W}:${H}:flags=bilinear,fps=${bi.fps_num}/${bi.fps_den}`], W, H, 1);
  }
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  const enc = spawn("ffmpeg", ["-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${W}x${H}`, "-r", `${bi.fps_num}/${bi.fps_den}`, "-i", "-", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", String(opts.crf ?? CRF_DEFAULT), "-preset", "medium", out], { stdio: ["pipe", "ignore", "pipe"] });
  let encErr = ""; enc.stderr.on("data", (d) => { encErr += d; });
  const encDone = new Promise((res) => enc.on("close", res));

  let n = 0;
  for (; n < total; n++) {
    const fb = await dBase.next(); if (!fb) break;
    const fc = await dCont.next(); const fm = dMat ? await dMat.next() : null;
    const o = Buffer.from(fb);
    if (fc) warpFrame(o, fc, fm, W, H, CW, CH, quadAt(track, n / fps).map(([x, y]) => [x * W, y * H]), feather);
    if (!enc.stdin.write(o)) await new Promise((r) => enc.stdin.once("drain", r));
  }
  enc.stdin.end(); await encDone; dBase.kill(); dCont.kill(); dMat?.kill();
  if (!fs.existsSync(out) || fs.statSync(out).size === 0) throw new Error("encode failed: " + encErr);
  return { out, frames: n, fps, width: W, height: H, warnings: track.warnings };
}

// Inverse-warp content into dst frame (in place). q = four px corners TL,TR,BR,BL. Coverage = signed edge distance (soft, antialiased)
// times (1 - matte). Edge pixels sample content clamped to its border.
export function warpFrame(dst, src, matte, W, H, CW, CH, q, feather = 1) {
  const Hinv = homography(q, [[0, 0], [CW, 0], [CW, CH], [0, CH]]); // output px -> content px
  const edges = [];
  for (let k = 0; k < 4; k++) {
    const [ax, ay] = q[k], [bx, by] = q[(k + 1) % 4], len = Math.hypot(bx - ax, by - ay) || 1;
    edges.push([-(by - ay) / len, (bx - ax) / len, ax, ay]); // inward normal for clockwise (y-down) winding
  }
  const pad = Math.ceil(feather) + 1;
  const x0 = Math.max(0, Math.floor(Math.min(...q.map((p) => p[0])) - pad)), x1 = Math.min(W - 1, Math.ceil(Math.max(...q.map((p) => p[0])) + pad));
  const y0 = Math.max(0, Math.floor(Math.min(...q.map((p) => p[1])) - pad)), y1 = Math.min(H - 1, Math.ceil(Math.max(...q.map((p) => p[1])) + pad));
  const [h0, h1, h2, h3, h4, h5, h6, h7] = Hinv;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const px = x + 0.5, py = y + 0.5;
    let d = Infinity;
    for (const [nx, ny, ax, ay] of edges) d = Math.min(d, (px - ax) * nx + (py - ay) * ny);
    let a = d / feather + 0.5; if (a <= 0) continue; if (a > 1) a = 1;
    if (matte) a *= 1 - matte[y * W + x] / 255;
    if (a <= 0) continue;
    const w = h6 * px + h7 * py + 1, u = (h0 * px + h1 * py + h2) / w - 0.5, v = (h3 * px + h4 * py + h5) / w - 0.5;
    const iu = Math.floor(u), iv = Math.floor(v), fu = u - iu, fv = v - iv;
    const cx0 = Math.min(CW - 1, Math.max(0, iu)), cx1 = Math.min(CW - 1, Math.max(0, iu + 1)), cy0 = Math.min(CH - 1, Math.max(0, iv)), cy1 = Math.min(CH - 1, Math.max(0, iv + 1));
    const i00 = (cy0 * CW + cx0) * 3, i10 = (cy0 * CW + cx1) * 3, i01 = (cy1 * CW + cx0) * 3, i11 = (cy1 * CW + cx1) * 3, o = (y * W + x) * 3;
    for (let c = 0; c < 3; c++) {
      const s = (src[i00 + c] * (1 - fu) + src[i10 + c] * fu) * (1 - fv) + (src[i01 + c] * (1 - fu) + src[i11 + c] * fu) * fv;
      dst[o + c] = dst[o + c] * (1 - a) + s * a + 0.5;
    }
  }
}

// ---- C1 reader/validator. doc = parsed sources.json. opts: {root (film dir), sceneIds:Set|null, probe:(abs)=>{duration_s}|null}
export function validateSources(doc, opts = {}) {
  const errors = [], warnings = [];
  if (doc?.schema_version !== 1) return { ok: false, errors: [`sources.json schema_version ${doc?.schema_version} unsupported (need 1)`], warnings };
  const root = opts.root ? fs.realpathSync(opts.root) : null, assets = new Map();
  for (const a of doc.assets || []) {
    if (!a.id || assets.has(a.id)) { errors.push(`asset id missing or duplicate: ${a.id}`); continue; }
    assets.set(a.id, a);
    if (!["owned", "licensed", "generated", "inspiration-only"].includes(a.rights)) errors.push(`asset ${a.id}: bad rights ${a.rights}`);
    const m = a.media || {};
    if (![m.fps_num, m.fps_den, m.width, m.height].every((v) => Number.isInteger(v) && v > 0)) errors.push(`asset ${a.id}: media needs integer fps_num, fps_den, width, height`);
    if (root && a.path) {
      const abs = path.resolve(root, a.path), rel = path.relative(root, abs);
      if (path.isAbsolute(a.path) || rel.startsWith("..") || !rel.split(path.sep)[0].startsWith("assets")) { errors.push(`asset ${a.id}: path escapes assets/`); continue; }
      if (!fs.existsSync(abs)) { errors.push(`asset ${a.id}: file missing`); continue; }
      const real = fs.realpathSync(abs);
      if (path.relative(root, real).startsWith("..")) { errors.push(`asset ${a.id}: symlink leaves the film root`); continue; }
      if (crypto.createHash("sha256").update(fs.readFileSync(real)).digest("hex") !== a.sha256) errors.push(`asset ${a.id}: sha256 does not match file`);
      a._abs = real;
    }
  }
  const seen = new Set();
  for (const l of doc.shot_layers || []) {
    if (seen.has(l.layer_id)) errors.push(`duplicate layer_id ${l.layer_id}`); seen.add(l.layer_id);
    if (!String(l.layer_id).startsWith(l.scene_id + ".")) errors.push(`layer_id ${l.layer_id} must be "<scene_id>.<name>"`);
    if (opts.sceneIds && !opts.sceneIds.has(l.scene_id)) errors.push(`layer ${l.layer_id}: scene_id ${l.scene_id} not in score`);
    const a = assets.get(l.asset_id);
    if (!a) { errors.push(`layer ${l.layer_id}: asset_id ${l.asset_id} does not resolve`); continue; }
    if (a.rights === "inspiration-only") errors.push(`layer ${l.layer_id}: inspiration-only asset cannot be a render source`);
    if (!["background", "foreground", "matte", "screen-content"].includes(l.render_role)) errors.push(`layer ${l.layer_id}: bad render_role`);
    if (opts.probe && a._abs) {
      const p = opts.probe(a._abs);
      if (p?.duration_s != null && l.in_s + l.duration_s > p.duration_s + 1e-6) errors.push(`layer ${l.layer_id}: in_s+duration_s exceeds asset duration ${p.duration_s}`);
    }
  }
  return { ok: !errors.length, errors, warnings };
}
