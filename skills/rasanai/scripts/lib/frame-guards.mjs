// Three picture guards on a rendered film, all WARNINGS (uncalibrated; thresholds from the research: lemo 6, mortiflix 4, group2 6).
// ffmpeg decodes small frames (no window); nothing here writes a file.
//   whiteFlashes(video)                 flash-over-cap: a run of 1-3 frames where over ~60% of the picture is near-white (luma >= 235)
//                                       while the frames 4 either side are under 30%: it reads as a blank frame
//   seamBlanks(video, seams)            seam-blank: a frame from 10% to 90% of a transition that is blown out (over 50% near-white),
//                                       flooded (over 60% one colour found in neither neighbouring scene) or emptied (edge detail under
//                                       30% of both neighbours'). A seam with `flood: true` / data_seam "flood" opts out
//   holdDrift(video, items)             hold-frame-drift: the render's settled frame of a beat against the approved styleframe: 8x8 dHash
//                                       Hamming distance over 14/64, or a 160x90 SSIM under 0.55
// Each returns [] when ffmpeg cannot decode (the gate lists that as skipped, never as passed).
import fs from "node:fs";
import { spawnSync } from "node:child_process";

export const GUARD = { white_luma: 235, flash_share: 0.6, flash_neighbour: 0.3, flash_max_frames: 3, flash_reach: 4, blown: 0.5, flooded: 0.6, emptied: 0.3, hash_max: 14, ssim_min: 0.55 };

const ff = (argv) => spawnSync("ffmpeg", ["-v", "error", "-nostdin", ...argv], { maxBuffer: 1 << 29 });
export function probeFps(video) {
  const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=r_frame_rate", "-of", "default=nw=1:nk=1", video], { encoding: "utf8" });
  const [a, b] = String(r.stdout || "").trim().split("/").map(Number);
  return a > 0 ? a / (b || 1) : 30;
}
// raw frames at w x h: [{ t, px }] (px = Buffer of w*h*ch)
export function decodeFrames(video, { w = 64, h = 36, pix = "gray", from = 0, to = null, fps = null } = {}) {
  const ch = pix === "gray" ? 1 : 3, rate = fps || probeFps(video);
  const argv = [...(from > 0 ? ["-ss", String(from)] : []), ...(to != null ? ["-to", String(to)] : []), "-i", video, "-vf", `${fps ? `fps=${fps},` : ""}scale=${w}:${h}:flags=area`, "-f", "rawvideo", "-pix_fmt", pix, "-"];
  const r = ff(argv);
  if (r.status !== 0 || !r.stdout || !r.stdout.length) return [];
  const n = Math.floor(r.stdout.length / (w * h * ch)), out = [];
  for (let i = 0; i < n; i++) out.push({ t: from + i / rate, px: r.stdout.subarray(i * w * h * ch, (i + 1) * w * h * ch) });
  return out;
}
const share = (px, f) => { let c = 0; for (let i = 0; i < px.length; i++) if (f(px[i])) c++; return c / px.length; };

export function whiteFlashes(video) {
  const fr = decodeFrames(video, { w: 64, h: 36, pix: "gray" });
  if (fr.length < 10) return [];
  const sh = fr.map((f) => share(f.px, (v) => v >= GUARD.white_luma));
  const out = [];
  for (let i = 0; i < sh.length; i++) {
    if (sh[i] <= GUARD.flash_share) continue;
    let j = i; while (j + 1 < sh.length && sh[j + 1] > GUARD.flash_share) j++;
    const n = j - i + 1, a = sh[i - GUARD.flash_reach], b = sh[j + GUARD.flash_reach];
    if (n <= GUARD.flash_max_frames && (a == null || a < GUARD.flash_neighbour) && (b == null || b < GUARD.flash_neighbour)) out.push({ t: +fr[i].t.toFixed(2), share: Math.max(...sh.slice(i, j + 1)), n });
    i = j;
  }
  return out;
}

const edge = (px, w, h, ch) => { // mean gradient magnitude of the luma
  const L = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) L[i] = ch === 1 ? px[i] : 0.299 * px[i * 3] + 0.587 * px[i * 3 + 1] + 0.114 * px[i * 3 + 2];
  let s = 0, n = 0;
  for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) { s += Math.abs(L[y * w + x + 1] - L[y * w + x]) + Math.abs(L[(y + 1) * w + x] - L[y * w + x]); n++; }
  return s / Math.max(1, n);
};
const buckets = (px) => { const m = new Map(); for (let i = 0; i < px.length; i += 3) { const k = (px[i] >> 5) * 64 + (px[i + 1] >> 5) * 8 + (px[i + 2] >> 5); m.set(k, (m.get(k) || 0) + 1); } const n = px.length / 3; for (const [k, v] of m) m.set(k, v / n); return m; };

// seams: [{ t, dur?, from, to, flood? }] (t = the cut or the transition's centre, dur = the transition's length, default 0.5 s)
export function seamBlanks(video, seams) {
  const W = 64, H = 36, out = [], rate = probeFps(video);
  for (const sm of seams || []) {
    if (sm.flood === true || String(sm.data_seam || "") === "flood") continue;
    const dur = Number(sm.dur) > 0 ? Number(sm.dur) : 0.5, t0 = Math.max(0, sm.t - dur / 2), t1 = sm.t + dur / 2, pad = 0.15;
    const fr = decodeFrames(video, { w: W, h: H, pix: "rgb24", from: Math.max(0, t0 - pad), to: t1 + pad, fps: rate });
    if (fr.length < 3) continue;
    const before = fr.filter((f) => f.t < t0 + 1e-6).slice(-1)[0] || fr[0], after = fr.filter((f) => f.t > t1 - 1e-6)[0] || fr[fr.length - 1];
    const inside = fr.filter((f) => f.t >= t0 + 0.1 * dur - 1e-6 && f.t <= t0 + 0.9 * dur + 1e-6);
    const bB = buckets(before.px), bA = buckets(after.px), eB = edge(before.px, W, H, 3), eA = edge(after.px, W, H, 3);
    for (const f of inside) {
      let blown = 0; for (let i = 0; i < f.px.length; i += 3) if (f.px[i] >= GUARD.white_luma && f.px[i + 1] >= GUARD.white_luma && f.px[i + 2] >= GUARD.white_luma) blown++;
      blown /= f.px.length / 3;
      const mine = buckets(f.px);
      let top = 0, topK = -1; for (const [k, v] of mine) if (v > top) { top = v; topK = k; }
      const foreign = (bB.get(topK) || 0) < 0.1 && (bA.get(topK) || 0) < 0.1;
      const e = edge(f.px, W, H, 3);
      let kind = null, pct = 0;
      if (blown > GUARD.blown) { kind = "blown out"; pct = blown; }
      else if (top > GUARD.flooded && foreign) { kind = "flooded with one colour"; pct = top; }
      else if (eB > 2 && eA > 2 && e < GUARD.emptied * eB && e < GUARD.emptied * eA) { kind = "emptied of detail"; pct = 1 - e / Math.max(eA, eB); }
      if (kind) { out.push({ t: +f.t.toFixed(2), seam: `${sm.from ?? "?"}>${sm.to ?? "?"}`, kind, pct }); break; }
    }
  }
  return out;
}

// SSIM on non-overlapping 8x8 blocks of two w x h grey images
export function ssim(a, b, w, h) {
  const C1 = 6.5025, C2 = 58.5225; let sum = 0, n = 0;
  for (let by = 0; by + 8 <= h; by += 8) for (let bx = 0; bx + 8 <= w; bx += 8) {
    let ma = 0, mb = 0; for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { ma += a[(by + y) * w + bx + x]; mb += b[(by + y) * w + bx + x]; }
    ma /= 64; mb /= 64; let va = 0, vb = 0, cv = 0;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const da = a[(by + y) * w + bx + x] - ma, db = b[(by + y) * w + bx + x] - mb; va += da * da; vb += db * db; cv += da * db; }
    va /= 63; vb /= 63; cv /= 63;
    sum += ((2 * ma * mb + C1) * (2 * cv + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2)); n++;
  }
  return n ? sum / n : 1;
}
// 8x8 difference hash of a w x h grey image (box-averaged to 9x8): 64 bits as an array of 0/1
export function dHash(g, w, h) {
  const cell = (cx, cy) => { const x0 = Math.floor((cx * w) / 9), x1 = Math.max(x0 + 1, Math.floor(((cx + 1) * w) / 9)), y0 = Math.floor((cy * h) / 8), y1 = Math.max(y0 + 1, Math.floor(((cy + 1) * h) / 8)); let s = 0, n = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { s += g[y * w + x]; n++; } return s / n; };
  const bits = []; for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits.push(cell(x, y) < cell(x + 1, y) ? 1 : 0);
  return bits;
}
const grey160 = (file) => { const r = ff(["-i", file, "-vf", "scale=160:90:flags=area", "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "gray", "-"]); return r.status === 0 && r.stdout && r.stdout.length >= 160 * 90 ? r.stdout.subarray(0, 160 * 90) : null; };
const grabGrey = (video, t) => { const r = ff(["-ss", String(Math.max(0, t)), "-i", video, "-vf", "scale=160:90:flags=area", "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "gray", "-"]); return r.status === 0 && r.stdout && r.stdout.length >= 160 * 90 ? r.stdout.subarray(0, 160 * 90) : null; };

// items: [{ id, t, still }] (t = the beat's settled frame, film seconds; still = the approved board's file)
export function holdDrift(video, items) {
  const out = [];
  for (const it of items || []) {
    if (!it.still || !fs.existsSync(it.still)) continue;
    const a = grabGrey(video, it.t), b = grey160(it.still);
    if (!a || !b) continue;
    const ha = dHash(a, 160, 90), hb = dHash(b, 160, 90), d = ha.reduce((s, v, i) => s + (v !== hb[i] ? 1 : 0), 0), s = ssim(a, b, 160, 90);
    if (d > GUARD.hash_max || s < GUARD.ssim_min) out.push({ id: it.id, t: +it.t.toFixed(2), hamming: d, ssim: +s.toFixed(2) });
  }
  return out;
}
