// Pixel metrics for the frame gate (scripts/frame-gate.mjs). Zero dependencies: Node + ffmpeg.
//
// Frames are decoded by ffmpeg as raw rgb24 at 480 px wide (area-averaged, so encoder noise falls away), one buffer
// per frame; every metric below runs on that buffer. The definitions are the ones .context/night/r1-scripts measured
// the reference films with (measure.py, ground.py, comp.py), ported without OpenCV:
//
//   ground       tiles of 15 px whose luminance std is under 1.2 are "empty ground". ground range = p95 - p5 of their
//                mean L*; ground chroma = median of hypot(a*, b*) of their means.
//   soft         tiles of 24 px with structure (grey std > 10): soft when Laplacian variance / variance < 0.06, i.e.
//                the structure there is blurred. soft = soft tiles / structure tiles.
//   colourful    Hasler-Susstrunk colourfulness: sqrt(sd_rg^2 + sd_yb^2) + 0.3 sqrt(mu_rg^2 + mu_yb^2), rg = R - G,
//                yb = (R + G) / 2 - B.
//   sat          mean HSV saturation, percent.
//   hist         16 x 8 x 8 HSV histogram, compared by Bhattacharyya distance (hard cuts: > 0.35).
//   thumb/edge   a 60 x 33 luma thumbnail and a 30 x 16 edge-density map, for the composition-change count.
//   boldFrame    the frame's ground colour, the tallest giant glyph and the largest ink mass, for the boldness check
//                (defined above the function; not from r1-scripts).
import { spawn, spawnSync } from "node:child_process";

export const W = 480;

// ------------------------------------------------------------------ ffmpeg
export function ffmpegOk() {
  const r = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" });
  return !r.error && r.status === 0;
}
export function probe(file) {
  const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,avg_frame_rate,nb_frames:format=duration", "-of", "json", file], { encoding: "utf8" });
  if (r.error || r.status !== 0) return null;
  try {
    const j = JSON.parse(r.stdout), s = (j.streams || [])[0];
    if (!s) return null;
    return { width: s.width, height: s.height, duration: Number(j.format && j.format.duration) || 0 };
  } catch { return null; }
}
const evenH = (w, h) => Math.max(2, Math.round((W * h) / w / 2) * 2);

// Decode a still (png/jpg/webp...) to { width, height, rgb } at 480 px wide.
export function decodeStill(file) {
  const p = probe(file);
  if (!p) throw new Error(`cannot read ${file} (ffprobe)`);
  const h = evenH(p.width, p.height);
  const r = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-frames:v", "1", "-vf", `scale=${W}:${h}:flags=area`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 1 << 28 });
  if (r.error || r.status !== 0 || r.stdout.length < W * h * 3) throw new Error(`cannot decode ${file}`);
  return { width: W, height: h, rgb: new Uint8Array(r.stdout.buffer, r.stdout.byteOffset, W * h * 3), src: p };
}

// Stream a video's frames at `fps`, calling onFrame({t, width, height, rgb}) for each; resolves with the frame count.
export function decodeVideo(file, { fps = 4, onFrame }) {
  const p = probe(file);
  if (!p) return Promise.reject(new Error(`cannot read ${file} (ffprobe)`));
  const h = evenH(p.width, p.height), size = W * h * 3;
  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", ["-v", "error", "-i", file, "-vf", `fps=${fps},scale=${W}:${h}:flags=area`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { stdio: ["ignore", "pipe", "pipe"] });
    let chunks = [], have = 0, n = 0, err = "";
    ff.stderr.on("data", (d) => { err += d; });
    ff.stdout.on("data", (d) => {
      chunks.push(d); have += d.length;
      if (have < size) return;
      let buf = Buffer.concat(chunks);
      while (buf.length >= size) {
        onFrame({ t: n / fps, width: W, height: h, rgb: new Uint8Array(buf.subarray(0, size)) });
        buf = buf.subarray(size); n++;
      }
      chunks = buf.length ? [buf] : []; have = buf.length;
    });
    ff.on("error", reject);
    ff.on("close", (code) => (code === 0 || n > 0 ? resolve({ frames: n, src: { ...p, height: p.height } }) : reject(new Error(`ffmpeg: ${err.trim().slice(0, 200)}`))));
  });
}

// ------------------------------------------------------------------ colour
const LIN = new Float64Array(256);
for (let i = 0; i < 256; i++) { const c = i / 255; LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
const fLab = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
const Lof = (Y) => 116 * fLab(Y) - 16;
// L* of a grey level 0..255 / of a linear Y: a lookup over 1024 steps of Y
const L_LUT = new Float32Array(1025);
for (let i = 0; i <= 1024; i++) L_LUT[i] = Lof(i / 1024);
export function rgbToLab(r, g, b) {
  const lr = LIN[r | 0], lg = LIN[g | 0], lb = LIN[b | 0];
  const X = (0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb) / 0.95047, Y = 0.2126729 * lr + 0.7151522 * lg + 0.072175 * lb, Z = (0.0193339 * lr + 0.119192 * lg + 0.9503041 * lb) / 1.08883;
  const fx = fLab(X), fy = fLab(Y), fz = fLab(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

const pct = (arr, q) => {
  if (!arr.length) return NaN;
  const a = Float64Array.from(arr).sort(), i = (a.length - 1) * q / 100, lo = Math.floor(i), hi = Math.ceil(i);
  return a[lo] + (a[hi] - a[lo]) * (i - lo);
};
export { pct as percentile };
export const median = (arr) => pct(arr, 50);

// ------------------------------------------------------------------ one frame
// -> { groundRange, groundChroma, emptyShare, soft, structure, colourful, sat, hist, thumb, edge, meanL }
export function frameMetrics(img) {
  const { width: w, height: h, rgb } = img;
  const n = w * h;
  const L = new Float32Array(n), grey = new Float32Array(n);
  let sumRG = 0, sumYB = 0, sumRG2 = 0, sumYB2 = 0, satSum = 0, sumL = 0;
  const hist = new Float64Array(16 * 8 * 8);
  for (let i = 0; i < n; i++) {
    const r = rgb[i * 3], g = rgb[i * 3 + 1], b = rgb[i * 3 + 2];
    const Y = 0.2126729 * LIN[r] + 0.7151522 * LIN[g] + 0.072175 * LIN[b];
    const l = L_LUT[Math.min(1024, Math.round(Y * 1024))]; L[i] = l; sumL += l;
    grey[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    const rg = r - g, yb = 0.5 * (r + g) - b;
    sumRG += rg; sumYB += yb; sumRG2 += rg * rg; sumYB2 += yb * yb;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    satSum += mx ? d / mx : 0;
    let hh = 0;
    if (d) { if (mx === r) hh = ((g - b) / d + 6) % 6; else if (mx === g) hh = (b - r) / d + 2; else hh = (r - g) / d + 4; hh *= 30; }
    hist[Math.min(15, (hh / 180 * 16) | 0) * 64 + Math.min(7, ((mx ? d / mx : 0) * 8) | 0) * 8 + Math.min(7, (mx / 256 * 8) | 0)]++;
  }
  const mRG = sumRG / n, mYB = sumYB / n;
  const colourful = Math.sqrt(Math.max(0, sumRG2 / n - mRG * mRG) + Math.max(0, sumYB2 / n - mYB * mYB)) + 0.3 * Math.sqrt(mRG * mRG + mYB * mYB);

  // ground: 15 px tiles with luminance std < 1.2
  const T = 15, tm = [], tc = [];
  let tiles = 0;
  for (let y = 0; y + T <= h; y += T) for (let x = 0; x + T <= w; x += T) {
    tiles++;
    let s = 0, s2 = 0, sr = 0, sg = 0, sb = 0;
    for (let yy = y; yy < y + T; yy++) for (let xx = x; xx < x + T; xx++) { const i = yy * w + xx, l = L[i]; s += l; s2 += l * l; sr += rgb[i * 3]; sg += rgb[i * 3 + 1]; sb += rgb[i * 3 + 2]; }
    const c = T * T, m = s / c, sd = Math.sqrt(Math.max(0, s2 / c - m * m));
    if (sd < 1.2) { tm.push(m); const lab = rgbToLab(sr / c, sg / c, sb / c); tc.push(Math.hypot(lab[1], lab[2])); }
  }
  const groundOk = tm.length > 10;

  // soft content: 24 px tiles with structure whose high-frequency share of the variance is low
  const S = 24;
  let content = 0, soft = 0;
  const gt = new Float32Array(S * S);
  for (let y = 0; y < h - S; y += S) for (let x = 0; x < w - S; x += S) {
    let s = 0, s2 = 0;
    for (let yy = 0; yy < S; yy++) for (let xx = 0; xx < S; xx++) { const v = grey[(y + yy) * w + x + xx]; gt[yy * S + xx] = v; s += v; s2 += v * v; }
    const c = S * S, m = s / c, vr = s2 / c - m * m;
    if (Math.sqrt(Math.max(0, vr)) <= 10) continue;
    content++;
    // Laplacian [0 1 0; 1 -4 1; 0 1 0] with reflect-101 borders inside the tile
    let ls = 0, ls2 = 0;
    const at = (yy, xx) => gt[(yy < 0 ? -yy : yy >= S ? 2 * S - 2 - yy : yy) * S + (xx < 0 ? -xx : xx >= S ? 2 * S - 2 - xx : xx)];
    for (let yy = 0; yy < S; yy++) for (let xx = 0; xx < S; xx++) { const v = at(yy - 1, xx) + at(yy + 1, xx) + at(yy, xx - 1) + at(yy, xx + 1) - 4 * at(yy, xx); ls += v; ls2 += v * v; }
    const lm = ls / c, lv = ls2 / c - lm * lm;
    if (lv / vr < 0.06) soft++;
  }

  // composition thumbnails: 8 x 8 block luma (60 x 33), and edge density in 16 x 16 blocks (30 x 16)
  const tw = Math.floor(w / 8), th = Math.floor(h / 8), thumb = new Float32Array(tw * th);
  for (let by = 0; by < th; by++) for (let bx = 0; bx < tw; bx++) {
    let s = 0;
    for (let yy = 0; yy < 8; yy++) for (let xx = 0; xx < 8; xx++) s += grey[(by * 8 + yy) * w + bx * 8 + xx];
    thumb[by * tw + bx] = s / 64;
  }
  const ew = Math.floor(w / 16), eh = Math.floor(h / 16), edge = new Float32Array(ew * eh);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const gx = grey[i - w + 1] + 2 * grey[i + 1] + grey[i + w + 1] - grey[i - w - 1] - 2 * grey[i - 1] - grey[i + w - 1];
    const gy = grey[i + w - 1] + 2 * grey[i + w] + grey[i + w + 1] - grey[i - w - 1] - 2 * grey[i - w] - grey[i - w + 1];
    if (gx * gx + gy * gy > 120 * 120) { const bx = Math.floor(x / 16), by = Math.floor(y / 16); if (bx < ew && by < eh) edge[by * ew + bx] += 1 / 256; }
  }

  return {
    groundRange: groundOk ? pct(tm, 95) - pct(tm, 5) : null, groundChroma: groundOk ? median(tc) : null, emptyShare: tm.length / tiles,
    soft: content ? soft / content : 0, structure: content / (Math.floor((h - 1) / S) * Math.floor((w - 1) / S) || 1),
    colourful, sat: 100 * satSum / n, meanL: sumL / n, hist, thumb, edge,
  };
}

// ------------------------------------------------------------------ boldness (one frame)
// The frame's ground is its commonest colour (the mode of a 10-unit L*a*b* grid, then the mean of that bin); `near` is
// the share of the frame within dE 12 of it. Ink is every pixel more than dE 20 from the ground; its 4-connected
// components 8% H or taller are measured (height, stroke = 2 x the deepest chamfer distance inside, fill = area / box).
// A giant glyph is a component >= 15% H whose stroke is >= 1.2% H but <= 0.4 of its height and that fills <= 60% of
// its box: a letter, numeral, ring or icon drawn big, not a solid photo or panel (those fail the stroke ratio or the
// fill), not a hairline UI box (fails the stroke) and not a surround spanning the whole frame. obj is the largest component's share of the frame (a thing that
// fills 40% of it). Calibrated in .context/round4 (agent X): FILM-D vs FILM-E and the reference films.
export const BOLD = { nearDE: 12, inkDE: 20, minH: 0.08, glyphH: 15, strokeMin: 1.2, strokeRatio: 0.4, glyphFill: 0.6 };
// -> { gL, ga, gb, near, glyph (the tallest giant glyph, % H, 0 when none), obj (largest ink component, share of frame) }
export function boldFrame(img) {
  const { width: w, height: h, rgb } = img, n = w * h;
  const Ls = new Float32Array(n), As = new Float32Array(n), Bs = new Float32Array(n), bins = new Map();
  for (let i = 0; i < n; i++) {
    const [L, a, b] = rgbToLab(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]); Ls[i] = L; As[i] = a; Bs[i] = b;
    const k = (Math.floor(L / 10) * 100 + Math.floor(a / 10) + 50) * 100 + Math.floor(b / 10) + 50;
    const e = bins.get(k); if (e) { e[0]++; e[1] += L; e[2] += a; e[3] += b; } else bins.set(k, [1, L, a, b]);
  }
  let best = null; for (const e of bins.values()) if (!best || e[0] > best[0]) best = e;
  const g = [best[1] / best[0], best[2] / best[0], best[3] / best[0]];
  // ink mask and its chamfer (3-4) distance to the ground
  const D = new Int32Array(n); let near = 0;
  for (let i = 0; i < n; i++) { const d = Math.hypot(Ls[i] - g[0], As[i] - g[1], Bs[i] - g[2]); if (d < BOLD.nearDE) near++; D[i] = d > BOLD.inkDE ? 1e9 : 0; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (!D[i]) continue; let v = Math.min(D[i], x > 0 ? D[i - 1] + 3 : 3);
    if (y > 0) { v = Math.min(v, D[i - w] + 3); if (x > 0) v = Math.min(v, D[i - w - 1] + 4); if (x < w - 1) v = Math.min(v, D[i - w + 1] + 4); } else v = Math.min(v, 3);
    D[i] = v;
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x; if (!D[i]) continue; let v = Math.min(D[i], x < w - 1 ? D[i + 1] + 3 : 3);
    if (y < h - 1) { v = Math.min(v, D[i + w] + 3); if (x < w - 1) v = Math.min(v, D[i + w + 1] + 4); if (x > 0) v = Math.min(v, D[i + w - 1] + 4); } else v = Math.min(v, 3);
    D[i] = v;
  }
  // components
  const seen = new Uint8Array(n), st = new Int32Array(n);
  let glyph = 0, obj = 0;
  for (let s = 0; s < n; s++) {
    if (!D[s] || seen[s]) continue;
    let sp = 0, x0 = w, x1 = 0, y0 = h, y1 = 0, area = 0, md = 0; st[sp++] = s; seen[s] = 1;
    while (sp) {
      const i = st[--sp], x = i % w, y = (i / w) | 0; area++; if (D[i] > md) md = D[i];
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x > 0 && D[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; st[sp++] = i - 1; }
      if (x < w - 1 && D[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; st[sp++] = i + 1; }
      if (y > 0 && D[i - w] && !seen[i - w]) { seen[i - w] = 1; st[sp++] = i - w; }
      if (y < h - 1 && D[i + w] && !seen[i + w]) { seen[i + w] = 1; st[sp++] = i + w; }
    }
    if (area / n > obj) obj = area / n;
    const bh = y1 - y0 + 1, bw = x1 - x0 + 1;
    if (bh < BOLD.minH * h || (bw >= 0.98 * w && bh >= 0.98 * h)) continue; // a surround that spans the whole frame is the rest of the ground, not a glyph
    const hp = 100 * bh / h, stroke = 100 * (2 * md / 3) / h;
    if (hp >= BOLD.glyphH && stroke >= BOLD.strokeMin && stroke / hp <= BOLD.strokeRatio && area / (bw * bh) <= BOLD.glyphFill && hp > glyph) glyph = hp;
  }
  return { gL: g[0], ga: g[1], gb: g[2], near: near / n, glyph, obj };
}

// Bhattacharyya distance of two histograms (0 identical .. 1 disjoint), what cv2.compareHist gives
export function histDistance(a, b) {
  let s = 0, sa = 0, sb = 0;
  for (let i = 0; i < a.length; i++) { s += Math.sqrt(a[i] * b[i]); sa += a[i]; sb += b[i]; }
  return Math.sqrt(Math.max(0, 1 - s / Math.sqrt(sa * sb)));
}
const meanAbs = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };

// Hard cuts (histogram distance > 0.35, at least one sample apart) and composition changes (thumbnail luma moves
// > 6% or edge map > 5% from the composition's first frame, 0.4 s apart at least). feats: [{t, hist, thumb, edge}]
export function cutsAndCompositions(feats, dur, { cutT = 0.35, compMin = 0.4 } = {}) {
  const cuts = [0];
  for (let i = 1; i < feats.length; i++) if (histDistance(feats[i - 1].hist, feats[i].hist) > cutT) cuts.push(feats[i].t);
  const comps = [0];
  let ref = feats[0];
  for (let i = 1; i < feats.length; i++) {
    const f = feats[i], d = meanAbs(f.thumb, ref.thumb) / 255, de = meanAbs(f.edge, ref.edge);
    if ((d > 0.06 || de > 0.05) && f.t - comps[comps.length - 1] >= compMin) { comps.push(f.t); ref = f; }
  }
  return { cuts, compositions: comps.length, shots: cuts.map((c, i) => [c, i + 1 < cuts.length ? cuts[i + 1] : dur]) };
}
