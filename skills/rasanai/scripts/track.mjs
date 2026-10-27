#!/usr/bin/env node
// Planar-quad tracking for hybrid films (contract C5, docs/plans/hybrid-film-contracts.md). Zero-dependency Node + ffmpeg + (Level 1) Apple Vision
// through vision/track.swift. Works with no ComfyUI and no SAM; no network; no Python.
//   node track.mjs level0 --film <dir> --asset <path in film> --id <track-id> --keyframes <json>
//        Level 0: manual quad keyframes interpolated to every source frame (needs only ffprobe).
//   node track.mjs track  --film <dir> --asset <path in film> --id <track-id> (--quad x1,y1,...,x8,y8 [--at <t_s>] | --keyframes <json>)
//        Level 1: Apple Vision (object tracker + rectangle detection + homography registration) from the first keyframe, forwards and
//        backwards. Later keyframes are correction anchors (the tracker snaps to them and continues).
//        --no-detect turns rectangle detection off (propagation only: tracker + registration), to measure how much the detector carries.
//   node track.mjs check  --film <dir> --id <track-id> [--asset <path>]     validate a track file (C5)
//   node track.mjs eval   --track <track.json> --truth <phone.truth.json>   pixel error against fixture truth (measurement only)
// Keyframes json: [{ "t_s": 0, "quad_norm": [[x,y],[x,y],[x,y],[x,y]] }]  TL,TR,BR,BL, display-oriented, normalised, top-left origin.
// Writes <film>/hybrid/tracks/<id>.json. stdout: one JSON object. Exit 0 ok, 1 unable or failed check, 2 usage.
// Level 1 needs /usr/bin/swiftc (or swift) on macOS; without it the result is { ok:false, unavailable:true } and Level 0 still works.
// TRACKING NOTES (measured, see docs/plans in the lane handoff): Vision's registration reports shifts with y up and warps target->reference;
// it only reaches ~2 px per call, so the Swift side iterates it. Bounding-box tracking alone is never perspective-correct.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { validateTrack, healthOf } from "./lib/tracks.mjs"; // Plan 06 V5: strict source binding, health spans

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SWIFT_SRC = path.join(HERE, "vision", "track.swift");
const out = (o, code = 0) => { process.stdout.write(JSON.stringify(o, null, 2) + "\n"); process.exit(code); };
const die = (msg, code = 1, extra = {}) => out({ ok: false, error: msg, ...extra }, code);

const argv = process.argv.slice(2);
const cmd = argv[0];
const opt = (n) => { const i = argv.indexOf(n); return i > 0 && i + 1 < argv.length ? argv[i + 1] : null; };
const r6 = (v) => Math.round(v * 1e6) / 1e6;

// ---- paths: inside the film only (no `..`, no symlink escape)
function safeInFilm(film, rel) {
  if (!rel || path.isAbsolute(rel) || rel.split(/[\\/]/).includes("..")) die(`unsafe path: ${rel}`, 2);
  const root = fs.realpathSync(film), abs = path.join(root, rel);
  if (!fs.existsSync(abs)) die(`asset not found: ${rel}`, 1);
  const real = fs.realpathSync(abs);
  if (real !== root && !real.startsWith(root + path.sep)) die(`path escapes the film: ${rel}`, 2);
  return real;
}
const safeId = (id) => { if (!id || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id) || id.includes("..")) die(`unsafe track id: ${id}`, 2); return id; };
const sha256File = (f) => { const h = crypto.createHash("sha256"); const fd = fs.openSync(f, "r"); const b = Buffer.alloc(1 << 20); let n; while ((n = fs.readSync(fd, b, 0, b.length, null)) > 0) h.update(b.subarray(0, n)); fs.closeSync(fd); return h.digest("hex"); };

// ---- media: source PTS per frame (truth for VFR) and the frames themselves, display-oriented
function probePts(asset) {
  const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "frame=pts_time,best_effort_timestamp_time", "-show_entries", "format=duration", "-of", "json", asset], { encoding: "utf8", maxBuffer: 1 << 28 });
  if (r.status !== 0) die("ffprobe could not read the asset (is ffmpeg installed?)", 1);
  const j = JSON.parse(r.stdout);
  const times = (j.frames || []).map((f) => Number(f.pts_time ?? f.best_effort_timestamp_time)).filter((v) => Number.isFinite(v));
  if (!times.length) die("no video frames in the asset", 1);
  return { times, duration_s: Number(j.format?.duration) || times[times.length - 1] };
}
function extractFrames(asset, dir) {
  fs.mkdirSync(dir, { recursive: true });
  // scale by sample aspect ratio (display pixels), cap the width: rotation is applied by ffmpeg's autorotate
  const vf = "scale=trunc(iw*sar/2)*2:ih,setsar=1,scale='min(960,iw)':-2";
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-i", asset, "-map", "0:v:0", "-fps_mode", "passthrough", "-vf", vf, path.join(dir, "f_%06d.png")], { maxBuffer: 1 << 26 });
  if (r.status !== 0) die("ffmpeg could not extract frames: " + String(r.stderr).split("\n")[0], 1);
}
// Plan 06 V5: the media this track's coordinates are about. Display orientation matters: a phone clip stored 1920x1080 with a 90 degree rotation tag is 1080x1920 on screen.
function sourceBlock(asset, duration_s) {
  const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,sample_aspect_ratio:stream_side_data=rotation:stream_tags=rotate", "-of", "json", asset], { encoding: "utf8" });
  let s = {}; try { s = JSON.parse(r.stdout).streams[0] || {}; } catch {}
  const w = Number(s.width) || 0, h = Number(s.height) || 0;
  const [sn, sd] = String(s.sample_aspect_ratio || "1:1").split(":").map(Number), sar = sn > 0 && sd > 0 ? sn / sd : 1;
  const rot0 = Number((s.side_data_list || []).map((d) => d.rotation).find((x) => x != null) ?? (s.tags || {}).rotate ?? 0) || 0;
  const rotation_deg = ((Math.round(-rot0 / 90) * 90) % 360 + 360) % 360; // negated ffprobe displaymatrix rotation (ffmpeg's autorotate turns the picture by that much); 90/270 swap the display size, which is what the coordinates need
  const dw = Math.trunc(w * sar), swap = rotation_deg === 90 || rotation_deg === 270;
  return { rotation_deg, display_width: swap ? h : dw, display_height: swap ? dw : h, stored_width: w, stored_height: h, sample_aspect_ratio: sar, time_base: "source_pts_seconds", duration_s };
}
const nearest = (times, t) => times.reduce((b, v, i) => (Math.abs(v - t) < Math.abs(times[b] - t) ? i : b), 0);

function readKeyframes() {
  const kfFile = opt("--keyframes"), quad = opt("--quad");
  let kfs;
  if (kfFile) { try { kfs = JSON.parse(fs.readFileSync(kfFile, "utf8")); } catch { die("keyframes json unreadable", 2); } }
  else if (quad) {
    const v = quad.split(",").map(Number);
    if (v.length !== 8 || v.some((x) => !Number.isFinite(x))) die("--quad needs 8 numbers: TLx,TLy,TRx,TRy,BRx,BRy,BLx,BLy", 2);
    kfs = [{ t_s: Number(opt("--at") ?? 0), quad_norm: [[v[0], v[1]], [v[2], v[3]], [v[4], v[5]], [v[6], v[7]]] }];
  } else die("give --keyframes <json> or --quad", 2);
  if (!Array.isArray(kfs) || !kfs.length) die("no keyframes", 2);
  for (const k of kfs) if (!Number.isFinite(k.t_s) || !Array.isArray(k.quad_norm) || k.quad_norm.length !== 4 || !k.quad_norm.every((p) => p.length === 2 && p.every(Number.isFinite))) die("bad keyframe entry", 2);
  return kfs.sort((a, b) => a.t_s - b.t_s);
}

// ---- geometry (mirrors StudioCore/Tracking/TrackGeometry.swift)
const area = (q) => q.reduce((s, a, k) => { const b = q[(k + 1) % 4]; return s + (a[0] * b[1] - b[0] * a[1]); }, 0) / 2;
export const convexWound = (q) => area(q) > 1e-9 && q.every((a, k) => { const b = q[(k + 1) % 4], c = q[(k + 2) % 4]; return (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) > 0; });
const bbox = (q) => { const xs = q.map((p) => p[0]), ys = q.map((p) => p[1]); const x = Math.min(...xs), y = Math.min(...ys); return [x, y, Math.max(...xs) - x, Math.max(...ys) - y]; };
const lerpQ = (a, b, u) => a.map((p, k) => [p[0] + (b[k][0] - p[0]) * u, p[1] + (b[k][1] - p[1]) * u]);
const frameRow = (t_s, q, confidence, origin, extra = {}) => ({ t_s: r6(t_s), quad_norm: q.map((p) => [r6(p[0]), r6(p[1])]), bbox_norm: bbox(q).map(r6), confidence: r6(confidence), origin, ...extra });

// the C1 asset id: --asset-id, else the id hybrid/sources.json gives this path (so the graph can find the track), else the file name
function assetIdFor(film, rel, abs) {
  if (opt("--asset-id")) return opt("--asset-id");
  try { const src = JSON.parse(fs.readFileSync(path.join(film, "hybrid", "sources.json"), "utf8")); const a = (src.assets || []).find((x) => x.path === rel); if (a) return a.id; } catch {}
  return path.basename(abs);
}

function writeTrack(film, id, doc) {
  const dir = path.join(film, "hybrid", "tracks");
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, id + ".json"), tmp = path.join(dir, `.${id}.json.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(doc, null, 2) + "\n");
  fs.renameSync(tmp, f);
  return f;
}

export function validate(doc, assetDigest, duration) {
  const errors = [], warnings = [];
  if (doc.schema_version !== 1) errors.push(`unknown schema_version ${doc.schema_version}`);
  if (assetDigest && doc.source_digest !== assetDigest) errors.push("source_digest is stale: re-track");
  let last = -Infinity;
  for (const f of doc.frames || []) {
    if (!(f.t_s > last)) errors.push(`t_s not strictly increasing at ${f.t_s}`);
    last = f.t_s;
    if (duration != null && f.t_s > duration + 1e-6) errors.push(`t_s ${f.t_s} beyond asset duration`);
    if (doc.track_type === "planar-quad" && !convexWound(f.quad_norm)) errors.push(`quad not convex TL,TR,BR,BL at t=${f.t_s}`);
    if (f.confidence < 0.5) warnings.push(`low confidence ${f.confidence.toFixed(2)} at t=${f.t_s}`);
  }
  return { errors, warnings };
}

// ---- Level 0
function level0() {
  const film = opt("--film"), id = safeId(opt("--id"));
  if (!film || !fs.existsSync(film)) die("--film dir required", 2);
  const asset = safeInFilm(film, opt("--asset"));
  const kfs = readKeyframes(), { times } = probePts(asset);
  const frames = times.map((t) => {
    const hit = kfs.find((k) => Math.abs(k.t_s - t) < 1e-3);
    if (hit) return frameRow(t, hit.quad_norm, 1, "manual");
    if (t <= kfs[0].t_s) return frameRow(t, kfs[0].quad_norm, 0.6, "interpolated");
    if (t >= kfs[kfs.length - 1].t_s) return frameRow(t, kfs[kfs.length - 1].quad_norm, 0.6, "interpolated");
    const i = kfs.findLastIndex((k) => k.t_s < t);
    return frameRow(t, lerpQ(kfs[i].quad_norm, kfs[i + 1].quad_norm, (t - kfs[i].t_s) / (kfs[i + 1].t_s - kfs[i].t_s)), 0.9, "interpolated");
  });
  const doc = { schema_version: 1, id, asset_id: assetIdFor(film, opt("--asset"), asset), track_type: "planar-quad", source_digest: sha256File(asset), timebase: "source_pts_seconds", source: sourceBlock(asset, times[times.length - 1]), frames, corrections: [], status: "manual", level: 0 };
  const file = writeTrack(film, id, doc);
  out({ ok: true, level: 0, file, frames: frames.length, status: doc.status });
}

// ---- Level 1
function compileSwift() {
  if (!fs.existsSync(SWIFT_SRC)) die("vision/track.swift missing", 1);
  const key = crypto.createHash("sha256").update(fs.readFileSync(SWIFT_SRC)).digest("hex").slice(0, 16);
  const dir = path.join(os.tmpdir(), "rasanai-track-" + key), bin = path.join(dir, "track");
  if (fs.existsSync(bin)) return [bin];
  fs.mkdirSync(dir, { recursive: true });
  const c = spawnSync("/usr/bin/swiftc", ["-O", SWIFT_SRC, "-o", bin], { encoding: "utf8", timeout: 240000 });
  if (c.status === 0 && fs.existsSync(bin)) return [bin];
  if (fs.existsSync("/usr/bin/swift")) return ["/usr/bin/swift", SWIFT_SRC];
  die("Level 1 tracking needs Swift (swiftc) on this Mac; Level 0 manual keyframes still work.", 1, { unavailable: true });
}
function runVision(runner, framesDir, kfIdx) {
  const kf = path.join(framesDir, "..", `kf-${path.basename(framesDir)}.json`);
  fs.writeFileSync(kf, JSON.stringify(kfIdx));
  const r = spawnSync(runner[0], [...runner.slice(1), "--frames", framesDir, "--keyframes", kf, ...(argv.includes("--no-detect") ? ["--no-detect"] : [])], { encoding: "utf8", maxBuffer: 1 << 28, timeout: 900000 });
  let j; try { j = JSON.parse(r.stdout); } catch { j = null; }
  if (r.status !== 0 || !j?.ok) die("Vision tracker failed: " + (j?.error || String(r.stderr).trim().split("\n").pop() || "no output"), 1, { unavailable: r.status === null });
  return j;
}

function track() {
  const film = opt("--film"), id = safeId(opt("--id"));
  if (!film || !fs.existsSync(film)) die("--film dir required", 2);
  const asset = safeInFilm(film, opt("--asset"));
  const kfs = readKeyframes(), { times, duration_s } = probePts(asset);
  const runner = compileSwift();
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "rasanai-trk-"));
  try {
    const fwdDir = path.join(work, "fwd");
    extractFrames(asset, fwdDir);
    const names = fs.readdirSync(fwdDir).filter((n) => n.endsWith(".png")).sort();
    if (names.length !== times.length) die(`frame count mismatch (${names.length} images vs ${times.length} pts)`, 1);
    const kIdx = kfs.map((k) => ({ index: nearest(times, k.t_s), quad_norm: k.quad_norm }));
    const first = kIdx[0].index;
    const samples = new Map(); let W = 0;
    const fwd = runVision(runner, fwdDir, kIdx.filter((k) => k.index >= first)); W = fwd.width;
    for (const s of fwd.samples) samples.set(s.index, s);
    if (first > 0) { // backwards from the first keyframe, over a reversed view of the frames
      const revDir = path.join(work, "rev"); fs.mkdirSync(revDir);
      names.forEach((n, i) => fs.symlinkSync(path.join(fwdDir, names[names.length - 1 - i]), path.join(revDir, `f_${String(i).padStart(6, "0")}.png`)));
      const back = runVision(runner, revDir, [{ index: names.length - 1 - first, quad_norm: kIdx[0].quad_norm }]);
      for (const s of back.samples) { const idx = names.length - 1 - s.index; if (!samples.has(idx)) samples.set(idx, { ...s, index: idx }); }
    }
    const frames = [];
    for (let i = 0; i < times.length; i++) {
      const s = samples.get(i);
      if (!s) continue;
      const q = s.quad_norm;
      if (!convexWound(q)) continue; // never write an invalid quad
      frames.push(frameRow(times[i], q, s.manual ? 1 : s.confidence, s.manual ? "manual" : "vision", s.reproj_err_px == null ? {} : { reproj_err_px: r6(s.reproj_err_px) }));
    }
    const tracked = frames.filter((f) => f.origin === "vision");
    const low = tracked.filter((f) => f.confidence < 0.5).length;
    const status = !tracked.length || tracked.every((f) => f.confidence < 0.2) ? "failed" : low ? "needs-correction" : "tracked";
    const corrections = kfs.slice(1).map((k) => ({ t_s: r6(times[nearest(times, k.t_s)]), quad_norm: k.quad_norm, note: "manual keyframe anchor" }));
    const warnings = [];
    if (low) warnings.push(`${low} of ${tracked.length} tracked frames below confidence 0.5: review or correct them`);
    if (frames.length < times.length) warnings.push(`${times.length - frames.length} frames had no valid quad and were left out`);
    const doc = { schema_version: 1, id, asset_id: assetIdFor(film, opt("--asset"), asset), track_type: "planar-quad", source_digest: sha256File(asset), timebase: "source_pts_seconds", source: sourceBlock(asset, duration_s), frames, corrections, status, level: 1, warnings };
    const v = validate(doc, doc.source_digest, duration_s);
    if (v.errors.length) die("tracker produced an invalid track: " + v.errors[0], 1, { errors: v.errors });
    const file = writeTrack(film, id, doc);
    const errs = tracked.map((f) => f.reproj_err_px).filter((e) => e != null);
    out({ ok: status !== "failed", level: 1, file, frames: frames.length, status, low_confidence_frames: low, frame_width_px: W,
      mean_reproj_err_px: errs.length ? r6(errs.reduce((a, b) => a + b, 0) / errs.length) : null, warnings }, status === "failed" ? 1 : 0);
  } finally { fs.rmSync(work, { recursive: true, force: true }); }
}

function check() {
  const film = opt("--film"), id = safeId(opt("--id"));
  const f = path.join(film || ".", "hybrid", "tracks", id + ".json");
  if (!fs.existsSync(f)) die("track file not found", 1);
  const doc = JSON.parse(fs.readFileSync(f, "utf8"));
  let digest = null, dur = null;
  if (opt("--asset")) { const a = safeInFilm(film, opt("--asset")); digest = sha256File(a); dur = probePts(a).duration_s; }
  const v = validate(doc, digest, dur);
  // Plan 06 V5: the strict check (orientation, display size, time base, quad order, corrections) and where the track breaks, with the fallbacks to offer
  const cuts = opt("--cuts") ? String(opt("--cuts")).split(",").map(Number).filter(Number.isFinite) : [];
  const strict = validateTrack(doc, digest ? { sha256: digest, duration_s: dur } : undefined);
  const health = healthOf(doc, { cuts_s: cuts });
  const errors = [...new Set([...v.errors, ...strict.errors.filter((e) => !/source_digest is stale/.test(e) || !v.errors.some((x) => /source_digest is stale/.test(x)))])];
  out({ ok: !errors.length, errors, warnings: [...new Set([...v.warnings, ...strict.warnings])], health }, errors.length ? 1 : 0);
}

// Reprojection error against fixture truth (exact corners): mean corner distance in px, per frame and overall. Measurement only.
function evalTrack() {
  const doc = JSON.parse(fs.readFileSync(opt("--track"), "utf8")), truth = JSON.parse(fs.readFileSync(opt("--truth"), "utf8"));
  const W = truth.width, H = truth.height, rows = [];
  for (const f of doc.frames) {
    const t = truth.frames.find((x) => Math.abs(x.t_s - f.t_s) < 1e-3);
    if (!t) continue;
    const e = f.quad_norm.reduce((s, p, k) => s + Math.hypot((p[0] - t.quad_norm[k][0]) * W, (p[1] - t.quad_norm[k][1]) * H), 0) / 4;
    rows.push({ t_s: f.t_s, err_px: r6(e), confidence: f.confidence, origin: f.origin });
  }
  const errs = rows.map((r) => r.err_px), sorted = [...errs].sort((a, b) => a - b);
  const flagged = rows.filter((r) => r.confidence < 0.5), badUnflagged = rows.filter((r) => r.err_px > (truth.tolerance_px ?? 2) && r.confidence >= 0.5);
  out({ ok: true, frames: rows.length, mean_px: r6(errs.reduce((a, b) => a + b, 0) / errs.length), p95_px: sorted[Math.floor(0.95 * (sorted.length - 1))], max_px: Math.max(...errs),
    tolerance_px: truth.tolerance_px ?? null, frames_over_tolerance: rows.filter((r) => r.err_px > (truth.tolerance_px ?? 2)).length,
    flagged_low_confidence: flagged.length, wrong_but_confident: badUnflagged.length, rows });
}

if (cmd === "level0") level0();
else if (cmd === "track") track();
else if (cmd === "check") check();
else if (cmd === "eval") evalTrack();
else die("usage: track.mjs level0|track|check|eval (see the header)", 2);
