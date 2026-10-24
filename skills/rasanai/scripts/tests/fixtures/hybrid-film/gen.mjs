// Deterministic generators for the hybrid-film fixtures (plan section 11). Nothing binary is committed: everything is written into a temp dir at test time.
// Synthetic media: raw frames rasterised in Node, encoded by ffmpeg (no Python). Truth files (corner coordinates, occlusion) are exact, not estimated.
//   makeFilm(dir)            30 s, three-scene film dir: motion/score.json (+ hybrid/sources.json shell)
//   copyEditScene2(dir)      change the line of scene 2 only (score.json rewritten, same ids)
//   corruptCache(dir)        a cache dir holding every bad state C3 says must be a miss
//   makePhone(dir)           phone.mp4 + phone.truth.json (known TL,TR,BR,BL per frame, display-oriented, normalised)
//   makeOcclusion(dir)       phone.mp4 + matte.mkv (gray, 255 = silhouette in front) + occlusion.truth.json
//   staleEdit(dir)           a run dir with a recorded film_version and an edit written against an older one
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

export const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");
const writeJ = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o, null, 2) + "\n"); };

export const ffmpegOk = () => spawnSync("ffmpeg", ["-version"]).status === 0;

export function baseScore() {
  return {
    _synthetic: "SYNTHETIC TEST FIXTURE: a made-up 30 s film with no real product or claim. Never ship it.",
    duration: 30, fps: 30, brand: "Synthetic Example Co",
    scenes: [
      { n: 1, id: "open", start: 0, end: 9, duration: 9, line: "a quiet start", events: [{ t: 1.2, what: "synthetic key press", sound: "key" }] },
      { n: 2, id: "reveal", start: 9, end: 21, duration: 12, line: "the reveal", events: [{ id: "e-reveal", t: 0.5, what: "synthetic reveal", sound: "reveal", word: "reveal" }] },
      { n: 3, id: "close", start: 21, end: 30, duration: 9, line: "the close", events: [{ t: 8, what: "synthetic logo lands", kind: "logo" }] },
    ],
    seams: [{ from: 1, to: 2, kind: "cut" }, { from: 2, to: 3, kind: "cut" }],
  };
}

export function makeFilm(dir) {
  writeJ(path.join(dir, "motion", "score.json"), baseScore());
  writeJ(path.join(dir, "hybrid", "sources.json"), { schema_version: 1, assets: [], shot_layers: [] });
  return dir;
}

export function copyEditScene2(dir) {
  const f = path.join(dir, "motion", "score.json");
  const s = JSON.parse(fs.readFileSync(f, "utf8"));
  s.scenes[1].line = "the reveal, now with a new headline";
  fs.writeFileSync(f, JSON.stringify(s, null, 2) + "\n");
  return s;
}

// C3 bad states. Each key dir must be a miss; "good" is the one valid hit. Frame counts are declared, never probed here.
export function corruptCache(dir) {
  const cache = path.join(dir, "hybrid", "cache");
  const mk = (key, bytes, meta, extra) => {
    const d = path.join(cache, key); fs.mkdirSync(d, { recursive: true });
    if (bytes) fs.writeFileSync(path.join(d, "out.mp4"), bytes);
    if (meta) writeJ(path.join(d, "meta.json"), meta);
    if (extra) extra(d);
  };
  const good = Buffer.from("synthetic-artifact-bytes-0123456789");
  const meta = (b, o = {}) => ({ key: "", expected_frames: 30, sample_rate: null, color_space: "bt709", alpha: "none", time_base: "1/30", sha256: sha256(b), size_bytes: b.length, created_at: "2000-01-01T00:00:00Z", tool_version: "fixture", ...o });
  const keys = {
    good: sha256("good"), truncated: sha256("truncated"), noMeta: sha256("no-meta"), badSum: sha256("bad-sum"),
    tempOnly: sha256("temp-only"), badFrames: sha256("bad-frames"),
  };
  mk(keys.good, good, meta(good, { key: keys.good }));
  mk(keys.truncated, good.subarray(0, 10), meta(good, { key: keys.truncated }));           // killed mid-write after meta: size/sha mismatch
  mk(keys.noMeta, good, null);                                                              // artifact without meta.json
  mk(keys.badSum, Buffer.from("tampered-bytes-0123456789012345"), meta(good, { key: keys.badSum, size_bytes: 31 }));
  mk(keys.tempOnly, null, null, (d) => fs.writeFileSync(path.join(d, ".out.mp4.tmp"), "partial")); // only a temp file survived the kill
  mk(keys.badFrames, good, meta(good, { key: keys.badFrames, expected_frames: -1 }));       // declared frame count impossible
  writeJ(path.join(cache, "index.json"), { schema_version: 1, note: "rebuildable metadata only", keys: Object.values(keys) });
  return { cache, keys, expectHit: [keys.good], expectMiss: Object.values(keys).filter((k) => k !== keys.good) };
}

// ---- synthetic video
const W = 320, H = 180, FPS = 12, N = 24;

// Phone quad (display-oriented, normalised) at frame i: translates right and rotates slightly. Convex, TL,TR,BR,BL.
export function phoneQuad(i) {
  const u = i / (N - 1), ang = (-8 + 16 * u) * Math.PI / 180;
  const cx = 0.38 + 0.24 * u, cy = 0.5, hw = 0.12, hh = 0.30; // half sizes in normalised units; aspect corrected below
  const asp = W / H;
  return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => {
    const px = x * asp * Math.cos(ang) - y * Math.sin(ang), py = x * asp * Math.sin(ang) + y * Math.cos(ang);
    return [+(cx + px / asp).toFixed(6), +(cy + py).toFixed(6)];
  });
}
const inConvex = (q, x, y) => {
  let s = 0;
  for (let k = 0; k < 4; k++) {
    const [ax, ay] = q[k], [bx, by] = q[(k + 1) % 4];
    const c = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
    if (c !== 0) { if (s && Math.sign(c) !== s) return false; s = Math.sign(c); }
  }
  return true;
};
// Silhouette: an ellipse sweeping across the phone from frame 8 to 20 (normalised centre / radii).
export function silhouette(i) {
  const u = Math.min(1, Math.max(0, (i - 8) / 12));
  return { cx: 0.2 + 0.6 * u, cy: 0.55, rx: 0.07, ry: 0.28, active: i >= 8 && i <= 20 };
}
const inEll = (e, x, y) => e.active && ((x - e.cx) / e.rx) ** 2 + ((y - e.cy) / e.ry) ** 2 <= 1;

function encode(frames, pixFmt, outArgs, out) {
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", pixFmt, "-s", `${W}x${H}`, "-r", String(FPS), "-i", "-", ...outArgs, out], { input: frames, maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error("ffmpeg failed: " + String(r.stderr));
}

function rgbFrames(withSil) {
  const bufs = [];
  for (let i = 0; i < N; i++) {
    const f = Buffer.alloc(W * H * 3), q = phoneQuad(i), e = silhouette(i);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const nx = (x + 0.5) / W, ny = (y + 0.5) / H, o = (y * W + x) * 3;
      let c = [40 + (x >> 3) % 2 * 10, 60, 90]; // backdrop with a faint stripe so motion is visible
      if (inConvex(q, nx, ny)) c = [230, 230, 235];
      if (withSil && inEll(e, nx, ny)) c = [10, 10, 10];
      f[o] = c[0]; f[o + 1] = c[1]; f[o + 2] = c[2];
    }
    bufs.push(f);
  }
  return Buffer.concat(bufs);
}

export function makePhone(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const video = path.join(dir, "phone.mp4");
  encode(rgbFrames(false), "rgb24", ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "12", "-g", "1"], video);
  const truth = {
    schema_version: 1, asset: "phone.mp4", width: W, height: H, fps_num: FPS, fps_den: 1, timebase: "source_pts_seconds", winding: "TL,TR,BR,BL",
    tolerance_px: 2, frames: Array.from({ length: N }, (_, i) => ({ t_s: i / FPS, quad_norm: phoneQuad(i) })),
  };
  writeJ(path.join(dir, "phone.truth.json"), truth);
  return { video, truth };
}

export function makeOcclusion(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const video = path.join(dir, "phone.mp4"), matte = path.join(dir, "matte.mkv");
  encode(rgbFrames(true), "rgb24", ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "12", "-g", "1"], video);
  const g = [];
  for (let i = 0; i < N; i++) {
    const f = Buffer.alloc(W * H), e = silhouette(i);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) f[y * W + x] = inEll(e, (x + 0.5) / W, (y + 0.5) / H) ? 255 : 0;
    g.push(f);
  }
  encode(Buffer.concat(g), "gray", ["-c:v", "ffv1", "-pix_fmt", "gray"], matte);
  // exact occluded fraction of the phone quad per frame (screen pixels hidden by the silhouette)
  const frames = [];
  for (let i = 0; i < N; i++) {
    const q = phoneQuad(i), e = silhouette(i); let inQ = 0, hid = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const nx = (x + 0.5) / W, ny = (y + 0.5) / H;
      if (inConvex(q, nx, ny)) { inQ++; if (inEll(e, nx, ny)) hid++; }
    }
    frames.push({ t_s: i / FPS, quad_norm: q, occluded_fraction: +(inQ ? hid / inQ : 0).toFixed(4) });
  }
  const truth = { schema_version: 1, asset: "phone.mp4", matte: "matte.mkv", width: W, height: H, fps_num: FPS, fps_den: 1, matte_semantics: "255 = silhouette in front of the screen", frames };
  writeJ(path.join(dir, "occlusion.truth.json"), truth);
  return { video, matte, truth };
}

export function staleEdit(dir) {
  const film_version = "fv-0002";
  writeJ(path.join(dir, "motion", "score.json"), baseScore());
  writeJ(path.join(dir, "motion", "film-version.json"), { film_version });
  const edit = { id: "stale-1", operation: "transform", status: "requested", scene_id: "reveal", layer_id: "reveal.phone", film_version: "fv-0001", original: { x: 0.4 }, proposed: { x: 0.5 } };
  return { current: film_version, edit };
}
