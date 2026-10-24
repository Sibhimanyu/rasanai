// Pixel measurements of a composited fixture video against the exact fixture truth (numbers and logic as lib/hybrid-compositor/measure.mjs).
//   makeContent(dir) -> content.png: 200x400, white body, four coloured corner blocks (R TL, G TR, B BR, Y BL), each 20% of a side
//   cornerError(video, truthFrames, {W,H}) -> { mean, worst, samples }   px distance of every coloured block's centroid to its true place in the quad
//   occlusion(video, base, matte, truthFrames, {W,H}) -> { fgTot, fgMatch, leak }   silhouette pixels deep inside the screen vs the original (foreground) frame
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const CW = 200, CH = 400;
const BLOCKS = [[0, 0, [255, 0, 0]], [CW * .8, 0, [0, 255, 0]], [CW * .8, CH * .8, [0, 0, 255]], [0, CH * .8, [255, 255, 0]]];
const raw = (f, fmt) => spawnSync("ffmpeg", ["-v", "error", "-i", f, "-f", "rawvideo", "-pix_fmt", fmt, "-"], { maxBuffer: 1 << 29 }).stdout;
const bl = (q, u, v) => [0, 1].map((k) => (1 - v) * ((1 - u) * q[0][k] + u * q[1][k]) + v * ((1 - u) * q[3][k] + u * q[2][k]));
const sd = (q, px, py) => { let d = 1e9; for (let k = 0; k < 4; k++) { const [ax, ay] = q[k], [bx, by] = q[(k + 1) % 4], L = Math.hypot(bx - ax, by - ay); d = Math.min(d, (-(by - ay) * (px - ax) + (bx - ax) * (py - ay)) / L); } return d; };
const near = (c, t) => Math.abs(c[0] - t[0]) < 70 && Math.abs(c[1] - t[1]) < 70 && Math.abs(c[2] - t[2]) < 70;

export function makeContent(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const img = Buffer.alloc(CW * CH * 3, 255);
  for (const [bx, by, c] of BLOCKS) for (let y = by; y < by + CH * .2; y++) for (let x = bx; x < bx + CW * .2; x++) img.set(c, (y * CW + x) * 3);
  const rgb = path.join(dir, "content.rgb"), png = path.join(dir, "content.png");
  fs.writeFileSync(rgb, img);
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${CW}x${CH}`, "-i", rgb, png]);
  if (r.status !== 0) throw new Error("content.png failed");
  return png;
}

export function cornerError(video, truthFrames, { W, H }) {
  const o = raw(video, "rgb24"), fsz = W * H * 3; let worst = 0, sum = 0, n = 0;
  if (o.length < truthFrames.length * fsz) return { mean: NaN, worst: NaN, samples: 0, frames_decoded: Math.floor(o.length / fsz) };
  for (let i = 0; i < truthFrames.length; i++) {
    const q = truthFrames[i].quad_norm.map(([x, y]) => [x * W, y * H]);
    BLOCKS.forEach(([, , col], k) => {
      const uv = [[.1, .1], [.9, .1], [.9, .9], [.1, .9]][k], exp = bl(q, uv[0], uv[1]); let sx = 0, sy = 0, c = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const p = i * fsz + (y * W + x) * 3; if (near([o[p], o[p + 1], o[p + 2]], col)) { sx += x + .5; sy += y + .5; c++; } }
      const e = c ? Math.hypot(sx / c - exp[0], sy / c - exp[1]) : Infinity;   // a block that is not found at all is an infinite error, never skipped
      worst = Math.max(worst, e); sum += e; n++;
    });
  }
  return { mean: sum / n, worst, samples: n };
}

export function occlusion(video, base, matte, truthFrames, { W, H }) {
  const o = raw(video, "rgb24"), b = raw(base, "rgb24"), m = raw(matte, "gray"), fsz = W * H * 3;
  let fgTot = 0, fgMatch = 0, leak = 0;
  for (let i = 0; i < truthFrames.length; i++) {
    const q = truthFrames[i].quad_norm.map(([a, c]) => [a * W, c * H]);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const p = y * W + x, d = sd(q, x + .5, y + .5);
      if (d > 2 && m[i * W * H + p] === 255) {
        const k = i * fsz + p * 3; fgTot++;
        if (Math.max(Math.abs(o[k] - b[k]), Math.abs(o[k + 1] - b[k + 1]), Math.abs(o[k + 2] - b[k + 2])) <= 12) fgMatch++;
        if (o[k] > 100) leak++;
      }
    }
  }
  return { fgTot, fgMatch, leak };
}
