// Motion fluency, measured on a rendered film: does it move like a person animated it?
// A zero-dependency port of the R5 prototype (numpy + OpenCV DIS flow) to Node + ffmpeg:
// frames decoded by ffmpeg as grey rawvideo at 480 px wide (native fps, capped at 30), motion found by
// pyramid block matching with sub-pixel refinement on the blocks that changed, moving regions tracked
// frame to frame, and per move: visible duration, the time to half the distance (t50, the curve's shape),
// overshoot (a settle), straightness (arcs). Film level: distinct simultaneous motions, dead frames,
// camera frames, cuts between two poses at rest.
//
// All speeds are in % of the frame WIDTH per second, so any resolution and 24/30/60 fps compare.
// Calibrated 2026-10-11 against the reference films in .context/attachments and three RasanAI films
// (.context/night/done-W7.md has the table). Used by motion-gate.mjs (the `fluency` checks).
import { spawn, spawnSync } from "node:child_process";

export const AW = 480; // analysis width
const B = 12; // block size (px at AW)
const MOVE_T = 2.0; // %W/s: a block counts as moving
const PIX_T = 6; // grey levels: a pixel changed
const CONC_W = Number(process.env.FLUENCY_CONC_W) || 3; // a moving block weighs its changed pixels x this (capped at the block) in the motion histogram

// ---------------------------------------------------------------- decoding
export function probe(file) {
  const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate:format=duration", "-of", "json", file], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffprobe could not read ${file}`);
  const j = JSON.parse(r.stdout), s = j.streams[0];
  const [n, d] = String(s.r_frame_rate).split("/").map(Number);
  return { w: s.width, h: s.height, fps: d ? n / d : n, duration: Number(j.format.duration) || 0 };
}

// stream grey frames to onFrame(Uint8Array) without holding the film in memory
function decode(file, { fps, aw, ah, start, dur }, onFrame) {
  return new Promise((resolve, reject) => {
    const a = ["-v", "error"];
    if (start) a.push("-ss", String(start));
    a.push("-i", file);
    if (dur) a.push("-t", String(dur));
    a.push("-an", "-vf", `fps=${fps},scale=${aw}:${ah}:flags=area,format=gray`, "-f", "rawvideo", "-pix_fmt", "gray", "-");
    const p = spawn("ffmpeg", a, { stdio: ["ignore", "pipe", "pipe"] });
    const size = aw * ah;
    let buf = Buffer.alloc(0), err = "";
    p.stdout.on("data", (chunk) => {
      buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
      while (buf.length >= size) {
        onFrame(new Uint8Array(buf.subarray(0, size)));
        buf = buf.subarray(size);
      }
    });
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg failed: ${err.trim().split("\n").pop() || code}`))));
  });
}

// ---------------------------------------------------------------- block matching
function half(src, w, h) {
  const w2 = w >> 1, h2 = h >> 1, out = new Uint8Array(w2 * h2);
  for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) {
    const o = 2 * y * w + 2 * x;
    out[y * w2 + x] = (src[o] + src[o + 1] + src[o + w] + src[o + w + 1] + 2) >> 2;
  }
  return { d: out, w: w2, h: h2 };
}
// sum of |cur(x+u, y+v) - prev(x, y)| over the window [x0, x0+n) x [y0, y0+n); Infinity when out of bounds
function sad(P, C, w, h, x0, y0, n, u, v, best) {
  if (x0 + u < 0 || y0 + v < 0 || x0 + u + n > w || y0 + v + n > h || x0 < 0 || y0 < 0 || x0 + n > w || y0 + n > h) return Infinity;
  let s = 0;
  for (let y = 0; y < n; y++) {
    let po = (y0 + y) * w + x0, co = (y0 + y + v) * w + x0 + u;
    for (let x = 0; x < n; x++) { const d = P[po++] - C[co++]; s += d < 0 ? -d : d; }
    if (s >= best) return s;
  }
  return s;
}
function refine(P, C, w, h, x0, y0, n, u0, v0, r) {
  let bu = u0, bv = v0, bc = sad(P, C, w, h, x0, y0, n, u0, v0, Infinity);
  for (let v = v0 - r; v <= v0 + r; v++) for (let u = u0 - r; u <= u0 + r; u++) {
    if (u === u0 && v === v0) continue;
    const c = sad(P, C, w, h, x0, y0, n, u, v, bc);
    if (c < bc) { bc = c; bu = u; bv = v; }
  }
  return { u: bu, v: bv, c: bc };
}

// ---------------------------------------------------------------- the analysis
export async function analyse(file, { start = null, dur = null, series = false } = {}) {
  const meta = probe(file);
  let fps = meta.fps < 31 ? Math.min(30, meta.fps) : 30;
  if (Math.abs(meta.fps - 23.976) < 0.05 || Math.abs(meta.fps - 24) < 0.01) fps = meta.fps;
  const ah = Math.max(2, Math.round((meta.h * AW) / meta.w / 2) * 2);
  const W = AW, H = ah, total = W * H;
  const gw = Math.floor(W / B), gh = Math.floor(H / B), nb = gw * gh;
  const k = (100 * fps) / W; // px/frame -> %W/s
  const mvPx = MOVE_T / k;
  const rec = [], compsPerFrame = [];
  let prev = null, prevL1 = null, prevL2 = null, prevVec = new Float32Array(nb * 2);
  let fi = 0;
  const vec = new Float32Array(nb * 2), mov = new Uint8Array(nb), chg = new Int32Array(nb), res = new Float64Array(nb);
  await decode(file, { fps, aw: W, ah: H, start, dur }, (cur) => {
    const L1 = half(cur, W, H), L2 = half(L1.d, L1.w, L1.h);
    if (!prev) { prev = cur; prevL1 = L1; prevL2 = L2; fi++; return; }
    let adSum = 0, resSum = 0, movPx = 0, energy = 0;
    vec.fill(0); mov.fill(0); chg.fill(0);
    // per block: changed pixels, the residual if nothing moved
    for (let by = 0; by < gh; by++) for (let bx = 0; bx < gw; bx++) {
      const b = by * gw + bx;
      let n = 0, s = 0;
      for (let y = by * B; y < by * B + B; y++) { let o = y * W + bx * B; for (let x = 0; x < B; x++, o++) { const d = cur[o] - prev[o]; const a = d < 0 ? -d : d; s += a; if (a > PIX_T) n++; } }
      chg[b] = n; res[b] = s; adSum += s;
    }
    // edge pixels outside the block grid still count toward the mean difference
    for (let y = 0; y < H; y++) for (let x = (y < gh * B ? gw * B : 0); x < W; x++) { const d = cur[y * W + x] - prev[y * W + x]; adSum += d < 0 ? -d : d; }
    for (let b = 0; b < nb; b++) {
      if (chg[b] < 3) continue;
      const bx = b % gw, by = (b / gw) | 0, x0 = bx * B, y0 = by * B;
      // coarse search at 1/4 (8x8 window around the block centre, +-10 = +-40 px at full)
      const cx2 = ((x0 + B / 2) >> 2) - 4, cy2 = ((y0 + B / 2) >> 2) - 4;
      let best = { u: 0, v: 0, c: sad(prevL2.d, L2.d, L2.w, L2.h, cx2, cy2, 8, 0, 0, Infinity) };
      for (let v = -10; v <= 10; v++) for (let u = -10; u <= 10; u++) {
        const c = sad(prevL2.d, L2.d, L2.w, L2.h, cx2, cy2, 8, u, v, best.c);
        if (c < best.c) best = { u, v, c };
      }
      const cx1 = ((x0 + B / 2) >> 1) - 4, cy1 = ((y0 + B / 2) >> 1) - 4;
      const r1 = refine(prevL1.d, L1.d, L1.w, L1.h, cx1, cy1, 8, best.u * 2, best.v * 2, 2);
      let cand = refine(prev, cur, W, H, x0, y0, B, r1.u * 2, r1.v * 2, 2);
      // predictors: the same block last frame and the left / upper neighbours (smooth fields)
      const preds = [[Math.round(prevVec[b * 2]), Math.round(prevVec[b * 2 + 1])]];
      if (bx > 0 && mov[b - 1]) preds.push([Math.round(vec[(b - 1) * 2]), Math.round(vec[(b - 1) * 2 + 1])]);
      if (by > 0 && mov[b - gw]) preds.push([Math.round(vec[(b - gw) * 2]), Math.round(vec[(b - gw) * 2 + 1])]);
      for (const [pu, pv] of preds) {
        if (pu === cand.u && pv === cand.v) continue;
        const r = refine(prev, cur, W, H, x0, y0, B, pu, pv, 1);
        if (r.c < cand.c) cand = r;
      }
      const c0 = res[b];
      // sub-pixel: the equiangular (V) fit through the SAD costs on each axis; it also tells a sub-pixel move (a sharp
      // V whose bottom is off zero) from a fade or an appearance (a flat cost surface that no shift explains)
      let fu = cand.u, fv = cand.v, est = cand.c;
      const cl = sad(prev, cur, W, H, x0, y0, B, cand.u - 1, cand.v, Infinity), cr = sad(prev, cur, W, H, x0, y0, B, cand.u + 1, cand.v, Infinity);
      const cu = sad(prev, cur, W, H, x0, y0, B, cand.u, cand.v - 1, Infinity), cd = sad(prev, cur, W, H, x0, y0, B, cand.u, cand.v + 1, Infinity);
      if (isFinite(cl) && isFinite(cr)) { const sl = Math.max(cl, cr) - cand.c; if (sl > 0) { const o = Math.max(-0.5, Math.min(0.5, (cl - cr) / (2 * sl))); fu += o; est -= sl * Math.abs(o); } }
      if (isFinite(cu) && isFinite(cd)) { const sl = Math.max(cu, cd) - cand.c; if (sl > 0) { const o = Math.max(-0.5, Math.min(0.5, (cu - cd) / (2 * sl))); fv += o; est -= sl * Math.abs(o); } }
      if (!(Math.max(0, est) < 0.65 * c0)) continue; // no shift explains the change: a fade or an appearance, not a move
      const mag = Math.hypot(fu, fv);
      res[b] = cand.c;
      if (mag < mvPx) continue;
      vec[b * 2] = fu; vec[b * 2 + 1] = fv; mov[b] = 1;
      movPx += chg[b]; energy += chg[b] * mag * k;
    }
    for (let b = 0; b < nb; b++) resSum += res[b];
    // distinct motions: connected peaks in an (angle x log-speed) histogram of moving blocks, weighted by changed pixels
    let conc = 0;
    if (movPx >= total * 0.0015) {
      let smin = Infinity;
      for (let b = 0; b < nb; b++) if (mov[b]) smin = Math.min(smin, Math.log(Math.hypot(vec[b * 2], vec[b * 2 + 1]) + 1e-6) / Math.log(1.6));
      const Hh = new Float64Array(256);
      for (let b = 0; b < nb; b++) if (mov[b]) {
        const u = vec[b * 2], v = vec[b * 2 + 1];
        const ai = Math.min(15, Math.max(0, Math.floor(((Math.atan2(v, u) + Math.PI) / (2 * Math.PI)) * 16)));
        const si = Math.min(15, Math.max(0, Math.floor(Math.log(Math.hypot(u, v) + 1e-6) / Math.log(1.6) - smin)));
        Hh[ai * 16 + si] += Math.min(B * B, chg[b] * CONC_W);
      }
      const on = new Uint8Array(256);
      for (let i = 0; i < 256; i++) on[i] = Hh[i] >= total * 0.0015 ? 1 : 0;
      const lab = new Int32Array(256);
      let L = 0;
      for (let i = 0; i < 256; i++) {
        if (!on[i] || lab[i]) continue;
        L++; const st = [i]; lab[i] = L;
        while (st.length) {
          const q = st.pop(), a = (q / 16) | 0, s = q % 16;
          for (let da = -1; da <= 1; da++) for (let ds = -1; ds <= 1; ds++) {
            const a2 = (a + da + 16) % 16, s2 = s + ds; // the angle axis wraps
            if (s2 < 0 || s2 > 15) continue;
            const j = a2 * 16 + s2;
            if (on[j] && !lab[j]) { lab[j] = L; st.push(j); }
          }
        }
      }
      conc = L;
    }
    // camera: one similarity transform (shift + zoom) explains most textured blocks and is not the identity
    let cam = 0;
    if (movPx > total * 0.02) {
      const pts = [];
      for (let by = 1; by < gh - 1; by++) for (let bx = 1; bx < gw - 1; bx++) {
        const b = by * gw + bx;
        let g = 0;
        for (let y = by * B + 1; y < by * B + B - 1; y += 2) for (let x = bx * B + 1; x < bx * B + B - 1; x += 2) { const o = y * W + x; g += Math.abs(cur[o + 1] - cur[o - 1]) + Math.abs(cur[o + W] - cur[o - W]); }
        if (g / 25 > 20) pts.push([bx * B + B / 2 - W / 2, by * B + B / 2 - H / 2, mov[b] ? vec[b * 2] : 0, mov[b] ? vec[b * 2 + 1] : 0]);
      }
      if (pts.length > 20) {
        let use = pts, s = 0, tx = 0, ty = 0;
        for (let it = 0; it < 3; it++) {
          // least squares for u = s*x + tx, v = s*y + ty
          let sxx = 0, sx = 0, sy = 0, su = 0, sv = 0, sxu = 0, n = use.length;
          for (const [x, y, u, v] of use) { sxx += x * x + y * y; sx += x; sy += y; su += u; sv += v; sxu += x * u + y * v; }
          const det = sxx * n - (sx * sx + sy * sy);
          s = det ? (sxu * n - sx * su - sy * sv) / det : 0;
          tx = (su - s * sx) / n; ty = (sv - s * sy) / n;
          use = pts.filter(([x, y, u, v]) => Math.hypot(u - (s * x + tx), v - (s * y + ty)) < 0.6);
          if (use.length < 10) break;
        }
        const disp = Math.max(Math.hypot(tx, ty), Math.abs(s) * Math.hypot(W, H) / 2);
        if (use.length / pts.length > 0.55 && disp > mvPx * 1.5) cam = 1;
      }
    }
    // moving regions: 8-connected moving blocks, then co-moving neighbours merged (one card = one element)
    const seen = new Uint8Array(nb), comps = [];
    for (let b = 0; b < nb; b++) {
      if (!mov[b] || seen[b]) continue;
      const st = [b]; seen[b] = 1;
      let n = 0, wsum = 0, vx = 0, vy = 0, sp = 0, x0 = W, y0 = H, x1 = 0, y1 = 0;
      while (st.length) {
        const q = st.pop(), qx = q % gw, qy = (q / gw) | 0, wq = chg[q];
        n++; wsum += wq; vx += vec[q * 2] * wq; vy += vec[q * 2 + 1] * wq; sp += Math.hypot(vec[q * 2], vec[q * 2 + 1]) * wq;
        x0 = Math.min(x0, qx * B); y0 = Math.min(y0, qy * B); x1 = Math.max(x1, qx * B + B); y1 = Math.max(y1, qy * B + B);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = qx + dx, ny = qy + dy;
          if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
          const j = ny * gw + nx;
          if (mov[j] && !seen[j]) { seen[j] = 1; st.push(j); }
        }
      }
      if (wsum < total * 0.001) continue;
      comps.push({ box: [x0, y0, x1 - x0, y1 - y0], vx: vx / wsum, vy: vy / wsum, spd: sp / wsum, area: wsum });
    }
    compsPerFrame.push(mergeComoving(comps));
    let chgPx = 0; for (let b = 0; b < nb; b++) chgPx += chg[b];
    rec.push({ t: fi / fps, energy: energy / total, moving: movPx / total, changed: chgPx / total, ad: adSum / total, resid: resSum / total, cam, conc });
    prevVec.set(vec);
    prev = cur; prevL1 = L1; prevL2 = L2; fi++;
  });
  return summarise(rec, compsPerFrame, { fps, k, W, H, file, series });
}

function mergeComoving(comps, gap = 12, vtol = 0.15) {
  let changed = true;
  while (changed && comps.length > 1) {
    changed = false;
    outer: for (let i = 0; i < comps.length; i++) for (let j = i + 1; j < comps.length; j++) {
      const a = comps[i], b = comps[j];
      const [ax, ay, aw, ah] = a.box, [bx, by, bw, bh] = b.box;
      const gx = Math.max(0, Math.max(ax, bx) - Math.min(ax + aw, bx + bw)), gy = Math.max(0, Math.max(ay, by) - Math.min(ay + ah, by + bh));
      if (gx > gap || gy > gap) continue;
      const sp = Math.max(Math.hypot(a.vx, a.vy), Math.hypot(b.vx, b.vy), 1e-6);
      if (Math.hypot(a.vx - b.vx, a.vy - b.vy) > vtol * sp) continue;
      const wa = a.area, wb = b.area, w = wa + wb;
      const x0 = Math.min(ax, bx), y0 = Math.min(ay, by), x1 = Math.max(ax + aw, bx + bw), y1 = Math.max(ay + ah, by + bh);
      comps[i] = { box: [x0, y0, x1 - x0, y1 - y0], vx: (a.vx * wa + b.vx * wb) / w, vy: (a.vy * wa + b.vy * wb) / w, spd: (a.spd * wa + b.spd * wb) / w, area: w };
      comps.splice(j, 1); changed = true;
      break outer;
    }
  }
  return comps;
}

const median = (a) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pct = (a, p) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y), i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const rnd = (v, d = 3) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);

function summarise(rec, compsPerFrame, { fps, k, W, file, series }) {
  const n = rec.length;
  if (n < 10) throw new Error(`${file}: too few frames to measure (${n})`);
  const AD = rec.map((r) => r.ad), RS = rec.map((r) => r.resid);
  // cuts: a frame-difference spike the motion cannot explain
  const cuts = [];
  for (let i = 0; i < n; i++) {
    const nb = [...AD.slice(Math.max(0, i - 6), i), ...AD.slice(i + 1, Math.min(n, i + 7))];
    const base = nb.length ? median(nb) : 0;
    if (AD[i] > Math.max(6, 3.5 * base) && RS[i] > 0.55 * AD[i] && (!cuts.length || i - cuts[cuts.length - 1] > 3)) cuts.push(i);
  }
  const cutset = new Set(cuts);
  const valid = rec.map((_, i) => !cutset.has(i));
  const V = rec.filter((_, i) => valid[i]);
  const dead = V.map((r) => r.changed < 0.0005), act = V.filter((r) => r.moving >= 0.0005);
  // holds: still runs of 0.5 s or more
  const holds = [];
  let run = 0;
  for (const d of [...dead, false]) { if (d) run++; else { if (run / fps >= 0.5) holds.push(run / fps); run = 0; } }
  // ---- move tracking (IoU on flow-shifted boxes, one frame of grace)
  let tracks = [], live = [];
  compsPerFrame.forEach((comps, f) => {
    if (cutset.has(f)) { tracks.push(...live); live = []; return; }
    const used = new Set(), next = [];
    for (const tr of live) {
      const b = tr.boxes[tr.boxes.length - 1], [vx, vy] = tr.v[tr.v.length - 1];
      const pb = [b[0] + vx, b[1] + vy, b[2], b[3]];
      let best = 0.15, bi = -1;
      comps.forEach((c, j) => {
        if (used.has(j)) return;
        const cb = c.box;
        const ix = Math.max(0, Math.min(pb[0] + pb[2], cb[0] + cb[2]) - Math.max(pb[0], cb[0]));
        const iy = Math.max(0, Math.min(pb[1] + pb[3], cb[1] + cb[3]) - Math.max(pb[1], cb[1]));
        const inter = ix * iy, u = pb[2] * pb[3] + cb[2] * cb[3] - inter, iou = u > 0 ? inter / u : 0;
        if (iou > best) { best = iou; bi = j; }
      });
      if (bi >= 0) { const c = comps[bi]; used.add(bi); tr.boxes.push(c.box); tr.v.push([c.vx, c.vy]); tr.s.push(c.spd); tr.gap = 0; next.push(tr); }
      else if (++tr.gap <= 1) { tr.boxes.push(tr.boxes[tr.boxes.length - 1]); tr.v.push([0, 0]); tr.s.push(0); next.push(tr); }
      else tracks.push(tr);
    }
    comps.forEach((c, j) => { if (!used.has(j)) next.push({ f0: f, boxes: [c.box], v: [[c.vx, c.vy]], s: [c.spd], gap: 0 }); });
    live = next;
  });
  tracks.push(...live);
  const moves = [];
  for (const tr of tracks) {
    let s = tr.s.slice(), v = tr.v.slice();
    while (s.length && s[s.length - 1] === 0) { s.pop(); v.pop(); }
    if (s.length < 4) continue;
    const sk = s.map((x) => x * k), peak = Math.max(...sk);
    if (peak < 6) continue;
    const pk = sk.indexOf(peak);
    v = v.map((q, i) => { const a = v[Math.max(0, i - 1)], c = v[Math.min(v.length - 1, i + 1)]; return [(a[0] + 2 * q[0] + c[0]) / 4, (a[1] + 2 * q[1] + c[1]) / 4]; }); // [1 2 1]: block noise is not a curve
    const dx = v.reduce((a, q) => a + q[0], 0), dy = v.reduce((a, q) => a + q[1], 0);
    const arc = v.reduce((a, q) => a + Math.hypot(q[0], q[1]), 0), net = Math.hypot(dx, dy);
    const dir = [dx / (net || 1), dy / (net || 1)];
    const proj = v.map((q) => q[0] * dir[0] + q[1] * dir[1]), pmax = Math.max(...proj.map(Math.abs));
    const over = net > 3 && proj.slice(pk + 1).filter((p) => p < -0.06 * pmax).length >= 2;
    const curve = Array.from({ length: 12 }, (_, i) => { const x = (i * (sk.length - 1)) / 11, lo = Math.floor(x), hi = Math.min(sk.length - 1, lo + 1); return (sk[lo] + (sk[hi] - sk[lo]) * (x - lo)) / peak; });
    moves.push({ t0: tr.f0 / fps, f0: tr.f0, f1: tr.f0 + s.length, dur: s.length / fps, peak, peak_pos: pk / (s.length - 1), onset: sk[0] / peak, straight: arc > 0 ? net / arc : 1, net: (net * 100) / W, over, curve });
  }
  const M = moves.filter((m) => m.net >= 2.0);
  const durs = M.map((m) => m.dur);
  let dent = NaN;
  if (durs.length >= 8) {
    const cnt = {};
    for (const d of durs) { const f = Math.round(d * fps); cnt[f] = (cnt[f] || 0) + 1; }
    const p = Object.values(cnt).map((c) => c / durs.length);
    dent = -p.reduce((a, q) => a + q * Math.log(q), 0) / Math.log(Math.min(durs.length, 30));
  }
  const t50 = (c) => { const cum = [0]; for (let i = 1; i < c.length; i++) cum.push(cum[i - 1] + (c[i] + c[i - 1]) / 2); const T = cum[cum.length - 1]; for (let i = 1; i < cum.length; i++) if (cum[i] / T >= 0.5) { const a = cum[i - 1] / T, b = cum[i] / T; return (i - 1 + (0.5 - a) / ((b - a) || 1)) / (c.length - 1); } return 1; };
  const T50 = M.filter((m) => m.dur >= 0.3 && m.net >= 3 && !m.over).map((m) => t50(m.curve));
  const trips = M.filter((m) => m.net > 3);
  const conc = act.map((r) => r.conc);
  // cut continuity
  let carry = 0, still = 0;
  const E = rec.map((r) => r.energy), MF = rec.map((r) => r.moving);
  for (const c of cuts) {
    const b = E.slice(Math.max(0, c - 3), c), a = E.slice(c + 1, c + 4), bm = MF.slice(Math.max(0, c - 3), c), am = MF.slice(c + 1, c + 4);
    if (!b.length || !a.length) continue;
    const mb = mean(b) > 1.0 && mean(bm) > 0.01, ma = mean(a) > 1.0 && mean(am) > 0.01;
    if (mb && ma) carry++;
    if (!mb && !ma) still++;
  }
  const secs = n / fps;
  const out = {
    file, fps: rnd(fps, 3), seconds: rnd(secs, 2),
    dead_frac: rnd(mean(dead.map(Number))), holds_ge_0_5s: holds.length, hold_s_total: rnd(holds.reduce((a, b) => a + b, 0), 2),
    moving_frac_mean: rnd(mean(V.map((r) => r.moving))), energy_mean: rnd(mean(V.map((r) => r.energy)), 2),
    camera_frac: rnd(mean(V.map((r) => r.cam))),
    conc_mean: rnd(mean(conc), 2), conc_ge2: rnd(mean(conc.map((c) => (c >= 2 ? 1 : 0)))), conc_ge3: rnd(mean(conc.map((c) => (c >= 3 ? 1 : 0)))),
    moves: M.length, moves_per_s: rnd(M.length / secs, 2),
    move_dur_med: rnd(median(durs)), long_move_share: rnd(durs.length ? mean(durs.map((d) => (d >= 0.5 ? 1 : 0))) : NaN),
    dur_entropy: rnd(dent), shape_iqr: rnd(T50.length >= 8 ? pct(T50, 0.75) - pct(T50, 0.25) : NaN),
    overshoot_share: rnd(M.length ? mean(M.map((m) => (m.over ? 1 : 0))) : NaN),
    hard_start_share: rnd(M.length ? mean(M.map((m) => (m.peak_pos < 0.12 && m.onset > 0.6 ? 1 : 0))) : NaN),
    arc_share: rnd(trips.length ? mean(trips.map((m) => (m.straight < 0.9 ? 1 : 0))) : NaN),
    cuts: cuts.length, cuts_per_min: rnd((cuts.length / secs) * 60, 1),
    cut_carry: cuts.length ? rnd(carry / cuts.length) : null, cut_still: cuts.length ? rnd(still / cuts.length) : null,
  };
  if (series) out._series = { t: rec.map((r) => rnd(r.t, 3)), energy: E.map((e) => rnd(e, 2)), conc: rec.map((r) => r.conc), cam: rec.map((r) => r.cam), cuts: cuts.map((c) => rnd(c / fps, 3)), moves: M.map((m) => ({ t0: rnd(m.t0, 3), dur: rnd(m.dur, 3), net: rnd(m.net, 2), over: m.over, straight: rnd(m.straight, 3), t50: m.dur >= 0.3 && m.net >= 3 && !m.over ? rnd(t50(m.curve), 3) : null })) };
  return out;
}

// ---------------------------------------------------------------- the gate
// key, op, threshold, weight, the plain-language failure. Pass = weighted score >= PASS. Thresholds were set on this
// port's own measurements (done-W7.md): between the RasanAI films and the references' lower tail.
export const PASS = 0.7;
export const FLUENCY = [
  ["shape_iqr", ">=", 0.18, 3, "every move has the same curve shape: give each kind of move its own curve (launch, glide, settle, exit, drift); RasanMotion picks them by role"],
  ["conc_ge2", ">=", 0.55, 2, "one thing moves at a time: start the next gesture at 55-75% of the last one, trail secondaries 2-4 frames behind their parent, keep a living layer (camera, ground)"],
  ["move_dur_med", ">=", 0.32, 2, "moves snap and die (median visible move too short): longer settles, durations from distance (0.7-1.2 s for travels over 10% of the frame)"],
  ["overshoot_share", ">=", 0.065, 2, "nothing ever overshoots or settles: give about 1 move in 8 (hero landings) a 3-8% spring settle"],
  ["dur_entropy", ">=", 0.8, 1, "durations sit on a few fixed values: derive each duration from its travel and size, jitter +-8%"],
  ["arc_share", ">=", 0.35, 1, "paths are ruler-straight: bend travels longer than 3% of the frame into arcs (a 4-12% bow)"],
  ["dead_frac", "<=", 0.3, 1, "too many frames where nothing moves at all: keep a living layer (camera drift, ambient on the ground) through holds"],
  ["cut_still", "<=", 0.12, 1, "cuts land between two poses at rest: cut on action, carry motion through the cut"],
];
// a declared stillness style (an editorial film like OpenAI's "Refreshed.") waives the checks that measure constant activity,
// and keeps the ones that measure how each move is shaped
export const STILLNESS_WAIVES = ["dead_frac", "cut_still", "conc_ge2"];

export const MIN_MOVES = 15; // under this many tracked moves the statistics say nothing (an 11 s type sting has 14)
export function scoreFluency(res, { stillness = false } = {}) {
  let score = 0, wsum = 0;
  const checks = [];
  for (const [key, op, thr, w, msg] of FLUENCY) {
    const v = res[key];
    if (v == null) { checks.push({ key, value: null, want: `${op} ${thr}`, ok: null, note: "not enough moves to measure" }); continue; }
    if (stillness && STILLNESS_WAIVES.includes(key)) { checks.push({ key, value: v, want: `${op} ${thr}`, ok: null, note: "waived: declared stillness style" }); continue; }
    const ok = op === "<=" ? v <= thr : v >= thr;
    wsum += w; score += w * (ok ? 1 : 0);
    checks.push({ key, value: v, want: `${op} ${thr}`, ok, weight: w, ...(ok ? {} : { message: msg }) });
  }
  const s = wsum ? Math.round((score / wsum) * 1000) / 1000 : null;
  if ((res.moves || 0) < MIN_MOVES) return { score: s, pass: null, insufficient: true, note: `only ${res.moves || 0} moves tracked (${MIN_MOVES} needed to judge)`, checks };
  return { score: s, pass: s != null && s >= PASS, checks };
}
