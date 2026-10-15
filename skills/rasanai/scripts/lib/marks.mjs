// marks.mjs: find the marks already burned into a video (a creator badge, a logo, a watermark).
//
//   import { findMarks, checkMarks, decodeFrames, probeVideo } from "./lib/marks.mjs";
//   const marks = await findMarks("clip.mp4", { samples: 24, exclude: { x, y, w, h } });
//   -> [{ x, y, w, h, presence }]   boxes normalised 0-1 of the frame, presence = share of sampled frames that show it
//
// A mark is a small thing that stays in the same place with the same pixels in (nearly) every frame and has crisp
// edges: a badge, a logo, a watermark. Flat static areas (a plain backdrop, a dark shirt) have no edges, so they are not
// marks; the speaker and the pictures move, so they are not either. How it works, ffmpeg only, no Python:
//   1. sample frames evenly (default 24) at about 270 px wide
//   2. per pixel: the median over the frames, and how many frames stay within a few grey levels of it (agreement)
//   3. keep pixels that agree in >= 90% of the frames AND lie on a strong edge of the median picture
//   4. drop edges that touch the solid key colour (a green or blue screen outlines the person with static edges)
//   5. connected components (after a small dilation), merge neighbours (an icon and its number), drop anything too big
//      to be a mark (a person, a picture), too faint or too diffuse
// `exclude` is a normalised box to ignore (the speaker): candidates mostly inside it are dropped, except small ones in the
// outer 8% band of the frame, where a badge sits even when it lies over the speaker's body.
// checkMarks(video, boxes, refVideo) says whether marks seen in a reference clip (the raw footage) are still visible in an
// edit, by correlating the crop under each box with the reference's median crop.
import { spawnSync } from "node:child_process";

const r3 = (x) => Math.round(x * 1000) / 1000;

export function probeVideo(file) {
  const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "format=duration:stream=width,height,r_frame_rate,duration", "-of", "json", file], { encoding: "utf8" });
  try {
    const j = JSON.parse(r.stdout), s = j.streams[0];
    const dur = parseFloat(j.format?.duration) || parseFloat(s.duration) || 0;
    return { duration: dur, width: s.width, height: s.height };
  } catch { return null; }
}

// decode frames to raw buffers. { fps | count, w, h?, gray, start, dur } -> { frames: Buffer[], w, h, times: number[] }
export function decodeFrames(video, { fps, count, w = 270, gray = false, start = 0, dur } = {}) {
  const info = probeVideo(video);
  if (!info || !(info.duration > 0)) return { frames: [], w: 0, h: 0, times: [] };
  const D = dur || info.duration - start;
  let rate = fps || (count ? count / D : 2);
  const h = Math.max(2, Math.round((w * info.height) / info.width / 2) * 2), W = w - (w % 2);
  const pix = gray ? "gray" : "rgb24", bpp = gray ? 1 : 3;
  const vf = `fps=${rate.toFixed(6)}:start_time=${(start + (count ? D / count / 2 : 0)).toFixed(3)},scale=${W}:${h}:flags=area`;
  const args = ["-v", "error", "-nostdin"];
  if (start) args.push("-ss", String(start));
  args.push("-i", video, "-an", "-t", String(D), "-vf", vf, "-f", "rawvideo", "-pix_fmt", pix, "-");
  const r = spawnSync("ffmpeg", args, { encoding: "buffer", maxBuffer: 1 << 30 });
  const sz = W * h * bpp, n = Math.floor((r.stdout?.length || 0) / sz), frames = [];
  for (let i = 0; i < n; i++) frames.push(r.stdout.subarray(i * sz, (i + 1) * sz));
  let kept = frames;
  if (count && n > count) kept = frames.slice(0, count);
  return { frames: kept, w: W, h, times: kept.map((_, i) => r3(start + (count ? D / count / 2 : 0) + i / rate)) };
}

const lumaOf = (f, px) => {
  const g = new Uint8Array(px);
  for (let i = 0; i < px; i++) g[i] = (f[i * 3] * 77 + f[i * 3 + 1] * 150 + f[i * 3 + 2] * 29) >> 8;
  return g;
};
function medianImage(grays, px) {
  const n = grays.length, med = new Uint8Array(px), tmp = new Uint8Array(n);
  for (let i = 0; i < px; i++) {
    for (let k = 0; k < n; k++) tmp[k] = grays[k][i];
    tmp.sort();
    med[i] = tmp[n >> 1];
  }
  return med;
}
// |gx| + |gy| of an image, a cheap edge strength
function edgeMap(g, W, H) {
  const e = new Uint16Array(W * H);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    e[i] = Math.abs(g[i + 1] - g[i - 1]) + Math.abs(g[i + W] - g[i - W]);
  }
  return e;
}
// the solid screen colour (green or blue), when the picture is mostly that: [r,g,b] or null
function keyColour(rgbFrames, px) {
  const f = rgbFrames[Math.floor(rgbFrames.length / 2)];
  const cnt = new Map();
  for (let i = 0; i < px; i += 3) {
    const r = f[i * 3], g = f[i * 3 + 1], b = f[i * 3 + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx - mn < 90 || mx < 90) continue;
    if (!(g === mx || b === mx)) continue;
    const k = (r >> 5) * 64 + (g >> 5) * 8 + (b >> 5), e = cnt.get(k) || (cnt.set(k, { n: 0, r: 0, g: 0, b: 0 }), cnt.get(k));
    e.n++; e.r += r; e.g += g; e.b += b;
  }
  let best = null;
  for (const e of cnt.values()) if (!best || e.n > best.n) best = e;
  if (!best || best.n / (px / 3) < 0.25) return null;
  return [best.r / best.n, best.g / best.n, best.b / best.n];
}

export async function findMarks(video, { samples = 24, exclude } = {}) {
  const info = probeVideo(video);
  if (!info) return [];
  const { frames, w: W, h: H } = decodeFrames(video, { count: samples, w: 270 });
  if (frames.length < 4) return [];
  return marksFromFrames(frames, W, H, exclude).boxes;
}

// the working part, on decoded RGB frames; returns { boxes, med } so checkMarks can reuse the median picture
export function marksFromFrames(frames, W, H, exclude) {
  const px = W * H, n = frames.length;
  const grays = frames.map((f) => lumaOf(f, px));
  const med = medianImage(grays, px);
  // agreement: how many frames stay within 16 grey levels of the median at each pixel
  const agree = new Uint8Array(px);
  for (let k = 0; k < n; k++) { const g = grays[k]; for (let i = 0; i < px; i++) if (Math.abs(g[i] - med[i]) <= 16) agree[i]++; }
  const need = Math.ceil(n * 0.9);
  const edge = edgeMap(med, W, H);
  const key = keyColour(frames, px);
  // key-colour neighbourhood (integral image of "is key"), to drop the outline of a keyed person
  let nearKey = null;
  if (key) {
    const isKey = new Uint8Array(px), mf = frames[Math.floor(n / 2)];
    for (let i = 0; i < px; i++) {
      const d = Math.hypot(mf[i * 3] - key[0], mf[i * 3 + 1] - key[1], mf[i * 3 + 2] - key[2]);
      isKey[i] = d < 70 ? 1 : 0;
    }
    const R = 4, integ = new Int32Array((W + 1) * (H + 1));
    for (let y = 0; y < H; y++) { let row = 0; for (let x = 0; x < W; x++) { row += isKey[y * W + x]; integ[(y + 1) * (W + 1) + x + 1] = integ[y * (W + 1) + x + 1] + row; } }
    nearKey = new Uint8Array(px);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const x0 = Math.max(0, x - R), x1 = Math.min(W, x + R + 1), y0 = Math.max(0, y - R), y1 = Math.min(H, y + R + 1);
      const s = integ[y1 * (W + 1) + x1] - integ[y0 * (W + 1) + x1] - integ[y1 * (W + 1) + x0] + integ[y0 * (W + 1) + x0];
      nearKey[y * W + x] = s / ((x1 - x0) * (y1 - y0)) > 0.12 ? 1 : 0;
    }
  }
  const S = new Uint8Array(px);
  for (let i = 0; i < px; i++) if (agree[i] >= need && edge[i] >= 60 && !(nearKey && nearKey[i])) S[i] = 1;
  // dilate by 3 px, label components
  const D = new Uint8Array(px), R = 3;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (S[y * W + x]) {
    for (let yy = Math.max(0, y - R); yy <= Math.min(H - 1, y + R); yy++) for (let xx = Math.max(0, x - R); xx <= Math.min(W - 1, x + R); xx++) D[yy * W + xx] = 1;
  }
  const lab = new Int32Array(px), comps = [];
  const stack = [];
  for (let s0 = 0; s0 < px; s0++) {
    if (!D[s0] || lab[s0]) continue;
    const id = comps.length + 1, c = { x0: W, y0: H, x1: -1, y1: -1, n: 0 };
    lab[s0] = id; stack.push(s0);
    while (stack.length) {
      const p = stack.pop(), x = p % W, y = (p / W) | 0;
      if (S[p]) { c.n++; if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x; if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y; }
      if (x > 0 && D[p - 1] && !lab[p - 1]) { lab[p - 1] = id; stack.push(p - 1); }
      if (x < W - 1 && D[p + 1] && !lab[p + 1]) { lab[p + 1] = id; stack.push(p + 1); }
      if (y > 0 && D[p - W] && !lab[p - W]) { lab[p - W] = id; stack.push(p - W); }
      if (y < H - 1 && D[p + W] && !lab[p + W]) { lab[p + W] = id; stack.push(p + W); }
    }
    if (c.n > 0) comps.push(c);
  }
  // merge neighbours: an icon and its number are one badge
  const gapX = W * 0.035, gapY = H * 0.012;
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < comps.length; i++) for (let j = i + 1; j < comps.length; j++) {
      const a = comps[i], b = comps[j];
      if (a.x0 - b.x1 <= gapX && b.x0 - a.x1 <= gapX && a.y0 - b.y1 <= gapY && b.y0 - a.y1 <= gapY) {
        a.x0 = Math.min(a.x0, b.x0); a.y0 = Math.min(a.y0, b.y0); a.x1 = Math.max(a.x1, b.x1); a.y1 = Math.max(a.y1, b.y1); a.n += b.n;
        comps.splice(j, 1); merged = true; break outer;
      }
    }
  }
  const boxes = [];
  for (const c of comps) {
    const bw = c.x1 - c.x0 + 1, bh = c.y1 - c.y0 + 1, area = bw * bh;
    if (c.n < 30) continue;
    if (bw / W > 0.7 || bh / H > 0.2 || area / px > 0.08) continue; // a person or a picture, not a mark
    if (bw / W < 0.03 || bh / H < 0.008) continue;
    if (c.n / area < 0.04) continue; // diffuse specks
    // contrast of the crop in the median picture
    const vals = [];
    for (let y = c.y0; y <= c.y1; y++) for (let x = c.x0; x <= c.x1; x++) vals.push(med[y * W + x]);
    vals.sort((a, b) => a - b);
    if (vals[Math.floor(vals.length * 0.95)] - vals[Math.floor(vals.length * 0.05)] < 70) continue;
    const box = { x: c.x0 / W, y: c.y0 / H, w: bw / W, h: bh / H };
    if (exclude) {
      const ox = Math.max(0, Math.min(box.x + box.w, exclude.x + exclude.w) - Math.max(box.x, exclude.x));
      const oy = Math.max(0, Math.min(box.y + box.h, exclude.y + exclude.h) - Math.max(box.y, exclude.y));
      const inside = (ox * oy) / (box.w * box.h) > 0.6;
      const outerBand = box.y > 0.92 - box.h || box.y + box.h < 0.08 || box.x + box.w < 0.08 || box.x > 0.92;
      if (inside && !outerBand) continue;
    }
    // presence: the share of frames whose pixels under the box still match the median
    let present = 0;
    for (let k = 0; k < n; k++) {
      let match = 0, tot = 0;
      for (let y = c.y0; y <= c.y1; y++) for (let x = c.x0; x <= c.x1; x++) {
        const p = y * W + x;
        if (!S[p]) continue;
        tot++;
        if (Math.abs(grays[k][p] - med[p]) <= 24) match++;
      }
      if (tot && match / tot >= 0.8) present++;
    }
    const presence = present / n;
    if (presence < 0.9) continue;
    boxes.push({ x: r3(box.x), y: r3(box.y), w: r3(box.w), h: r3(box.h), presence: r3(presence) });
  }
  boxes.sort((a, b) => b.presence - a.presence || b.w * b.h - a.w * a.h);
  return { boxes, med, W, H };
}

// Are marks seen in a reference clip still visible in a video? Correlate the crop under each box with the reference's
// median crop, frame by frame (same position and scale assumed: the edit keeps the raw frame size).
// -> [{ x, y, w, h, visible, presence }] where presence is the share of sampled frames that show the reference mark
export async function checkMarks(video, boxes, refVideo, { samples = 24 } = {}) {
  if (!boxes?.length) return [];
  const ref = decodeFrames(refVideo, { count: samples, w: 270 });
  const vid = decodeFrames(video, { count: samples, w: 270 });
  if (ref.frames.length < 4 || vid.frames.length < 4 || ref.w !== vid.w || ref.h !== vid.h) return boxes.map((b) => ({ ...b, visible: false, presence: 0 }));
  const { w: W, h: H } = ref, px = W * H;
  const refMed = medianImage(ref.frames.map((f) => lumaOf(f, px)), px);
  const vg = vid.frames.map((f) => lumaOf(f, px));
  return boxes.map((b) => {
    const x0 = Math.floor(b.x * W), x1 = Math.min(W - 1, Math.ceil((b.x + b.w) * W)), y0 = Math.floor(b.y * H), y1 = Math.min(H - 1, Math.ceil((b.y + b.h) * H));
    let present = 0;
    for (const g of vg) {
      let sa = 0, sb = 0, n = 0;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { sa += refMed[y * W + x]; sb += g[y * W + x]; n++; }
      const ma = sa / n, mb = sb / n;
      let num = 0, da = 0, db = 0;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const a = refMed[y * W + x] - ma, c = g[y * W + x] - mb;
        num += a * c; da += a * a; db += c * c;
      }
      const ncc = da > 0 && db > 0 ? num / Math.sqrt(da * db) : 0;
      if (ncc >= 0.6) present++;
    }
    const presence = r3(present / vg.length);
    return { x: b.x, y: b.y, w: b.w, h: b.h, visible: presence >= 0.8, presence };
  });
}
