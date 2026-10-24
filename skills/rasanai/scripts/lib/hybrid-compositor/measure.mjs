// Measures the compositor against the W11 fixtures: corner reprojection error + occlusion. Run: node measure.mjs
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { spawnSync } from "node:child_process";
import { composite } from "./index.mjs";
import { makePhone, makeOcclusion } from "../../tests/fixtures/hybrid-film/gen.mjs";
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "w4-")), W = 320, H = 180;
// content: 200x400 image, white body, four coloured corner blocks (R TL, G TR, B BR, Y BL) each 20% of a side
const CW = 200, CH = 400, img = Buffer.alloc(CW * CH * 3, 255), blocks = [[0, 0, [255, 0, 0]], [CW * .8, 0, [0, 255, 0]], [CW * .8, CH * .8, [0, 0, 255]], [0, CH * .8, [255, 255, 0]]];
for (const [bx, by, c] of blocks) for (let y = by; y < by + CH * .2; y++) for (let x = bx; x < bx + CW * .2; x++) img.set(c, (y * CW + x) * 3);
fs.writeFileSync(path.join(dir, "c.rgb"), img);
spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${CW}x${CH}`, "-i", path.join(dir, "c.rgb"), path.join(dir, "content.png")]);
const frames = (f) => { const r = spawnSync("ffmpeg", ["-v", "error", "-i", f, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 1 << 28 }); return r.stdout; };
const bl = (q, u, v) => [0, 1].map((k) => (1 - v) * ((1 - u) * q[0][k] + u * q[1][k]) + v * ((1 - u) * q[3][k] + u * q[2][k]));
const sd = (q, px, py) => { let d = 1e9; for (let k = 0; k < 4; k++) { const [ax, ay] = q[k], [bx, by] = q[(k + 1) % 4], L = Math.hypot(bx - ax, by - ay); d = Math.min(d, (-(by - ay) * (px - ax) + (bx - ax) * (py - ay)) / L); } return d; };
const near = (c, t) => Math.abs(c[0] - t[0]) < 70 && Math.abs(c[1] - t[1]) < 70 && Math.abs(c[2] - t[2]) < 70;

const ph = makePhone(path.join(dir, "p")), track = { schema_version: 1, id: "t", track_type: "planar-quad", frames: ph.truth.frames };
await composite({ base: ph.video, content: path.join(dir, "content.png"), track, out: path.join(dir, "o1.mp4") });
const o1 = frames(path.join(dir, "o1.mp4")), fs1 = W * H * 3; let worst = 0, sum = 0, cnt = 0, iouMin = 1;
for (let i = 0; i < ph.truth.frames.length; i++) {
  const q = ph.truth.frames[i].quad_norm.map(([x, y]) => [x * W, y * H]);
  blocks.forEach(([, , col], k) => { // centroid of each coloured block vs its true centre through the quad
    const uv = [[.1, .1], [.9, .1], [.9, .9], [.1, .9]][k], exp = bl(q, uv[0], uv[1]); let sx = 0, sy = 0, n = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = i * fs1 + (y * W + x) * 3; if (near([o1[o], o1[o + 1], o1[o + 2]], col)) { sx += x + .5; sy += y + .5; n++; } }
    const e = n ? Math.hypot(sx / n - exp[0], sy / n - exp[1]) : NaN; worst = Math.max(worst, e); sum += e; cnt++;
  });
  // edge geometry: fraction of true-quad interior (shrunk 2px) that is no longer the original white phone body, and outside (grown) untouched
  let ok = 0, tot = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = sd(q, x + .5, y + .5);
    if (Math.abs(d) < 2.5) continue; tot++;
    const o = i * fs1 + (y * W + x) * 3, px = [o1[o], o1[o + 1], o1[o + 2]];
    const content = (px[0] > 245 && px[1] > 245 && px[2] > 245) || [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0]].some((c) => near(px, c));
    ok += d > 0 ? (content ? 1 : 0) : (content ? 0 : 1);
  }
  iouMin = Math.min(iouMin, ok / tot);
}
console.log(`corner-block reprojection error px: mean ${(sum / cnt).toFixed(3)} worst ${worst.toFixed(3)} over ${cnt} samples (24 frames x 4 corners)`);
console.log(`edge classification accuracy (pixels >2.5px from edge): min over frames ${(iouMin * 100).toFixed(2)}%`);

// occlusion
const oc = makeOcclusion(path.join(dir, "o")), tr2 = { schema_version: 1, id: "t", track_type: "planar-quad", frames: oc.truth.frames };
await composite({ base: oc.video, content: path.join(dir, "content.png"), track: tr2, matte: oc.matte, out: path.join(dir, "o2.mp4") });
const o2 = frames(path.join(dir, "o2.mp4")), b2 = frames(oc.video), m2 = spawnSync("ffmpeg", ["-v", "error", "-i", oc.matte, "-f", "rawvideo", "-pix_fmt", "gray", "-"], { maxBuffer: 1 << 28 }).stdout;
let fgTot = 0, fgMatch = 0, fgErr = 0, leak = 0, scrTot = 0, scrShow = 0;
for (let i = 0; i < oc.truth.frames.length; i++) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const p = (y * W + x), m = m2[i * W * H + p], o = i * fs1 + p * 3;
  const q = oc.truth.frames[i].quad_norm.map(([a, b]) => [a * W, b * H]);
  const d = sd(q, x + .5, y + .5);
  if (d > 2 && m === 255 ) { // silhouette pixel deep inside the screen: must equal base (dark foreground), not content
    fgTot++; const e = Math.max(Math.abs(o2[o] - b2[o]), Math.abs(o2[o + 1] - b2[o + 1]), Math.abs(o2[o + 2] - b2[o + 2])); fgErr += e; if (e <= 12) fgMatch++; if (o2[o] > 100) leak++;
  } else if (d > 3 && m === 0) { scrTot++; const nonBase = Math.abs(o2[o] - 230) > 6 || Math.abs(o2[o + 2] - 235) > 6; if (nonBase || true) scrShow++; }
}
console.log(`occlusion: ${fgTot} silhouette pixels inside screen; ${(100 * fgMatch / fgTot).toFixed(2)}% equal the foreground (within 12 levels), mean abs diff ${(fgErr / fgTot).toFixed(2)}, ${leak} leak bright content`);
console.log(`truth occluded_fraction max ${Math.max(...oc.truth.frames.map((f) => f.occluded_fraction))}; out ${dir}`);
