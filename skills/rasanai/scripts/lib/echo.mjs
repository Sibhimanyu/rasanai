// Does the ending echo the opening? ("the end is the start, changed": animate / ClaudeAnimationBase.) Measured on a render:
// the opening's key frame (the first settled, non-blank composition in the first 3 s, at the end of its hold; a bare
// gradient counts as blank) against two ending frames: the end card (the stillest non-blank frame of the last 3.5 s, not
// its exit or fade) and the stillest frame of the 5 s before the end card began (the story's last beat); the closer
// counts. Colour frames from ffmpeg (160x90, 10 fps, no window).
// Similarity (0..1), three parts:
//   palette  RGB histogram intersection (4x4x4 bins): the same ground and accents
//   mass     where the foreground sits (pixels off the ground colour, an 8x6 grid; cosine): the same composition
//   edges    where the structure sits (edge density, an 8x6 grid; cosine): type, lines, shapes in the same places
//   echo = 0.4 palette + 0.3 mass + 0.3 edges
// A rhyme is echo >= ECHO.rhyme; the same frame unchanged (echo-identical) is a mean pixel difference under
// ECHO.same_px with edges and mass >= ECHO.same_layout. Calibrated 2026-10-14 on the reference films (craft.md "Echo").
//
//   import { measureEcho } from "./lib/echo.mjs";
//   const e = measureEcho(mp4);   // -> { echo, palette, mass, edges, identical, opening: { t }, ending: { t, which }, candidates }
//   node lib/echo.mjs <film.mp4> [--png <dir>]     the numbers (and the key frames as PNGs, for the eye)
import { spawnSync } from "node:child_process";
import path from "node:path";

export const EW = 160, EH = 90, EFPS = 10;
export const ECHO = {
  rhyme: 0.55, // echo at least this: the ending rhymes with the opening
  same_px: 3, same_layout: 0.97, // the same frame: mean RGB difference under this AND mass and edges at least this
  open_s: 3, open_max_s: 6, // the opening key frame lies in the first 3 s (6 s when the first 3 s are blank)
  settle_share: 0.004, settle_n: 3, // settled: under 0.4% of pixels change visibly for 3 steps (0.3 s)
  blank_std: 4, blank_edges: 0.002, // blank: grey spread under 4 (one flat colour), or almost no edges (a bare gradient ground)
  card_same: 0.8, // walking back from the end card, a frame whose layout (mass and edges) is this similar is still the end card
  card_window_s: 3.5, // the end card: the stillest frame of the film's last 3.5 s
  pre_window_s: 5, // the pre-end frame: the stillest frame within this long before the end card began
};

export function decodeRGB(file) {
  const r = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-an", "-vf", `fps=${EFPS},scale=${EW}:${EH}:flags=area,format=rgb24`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 2 ** 31 });
  if (r.status !== 0) throw new Error(`ffmpeg could not read ${path.basename(file)}: ${String(r.stderr || "").trim().split("\n").pop()}`);
  const sz = EW * EH * 3, n = Math.floor(r.stdout.length / sz), out = [];
  for (let i = 0; i < n; i++) out.push(r.stdout.subarray(i * sz, (i + 1) * sz));
  return out;
}

const grey = (f) => { const g = new Float32Array(EW * EH); for (let i = 0; i < g.length; i++) g[i] = 0.299 * f[i * 3] + 0.587 * f[i * 3 + 1] + 0.114 * f[i * 3 + 2]; return g; };
function std(g) { let m = 0; for (const v of g) m += v; m /= g.length; let s = 0; for (const v of g) s += (v - m) ** 2; return Math.sqrt(s / g.length); }
// the features of one frame
export function features(f) {
  const g = grey(f);
  const hist = new Float32Array(64);
  for (let i = 0; i < EW * EH; i++) hist[((f[i * 3] >> 6) << 4) | ((f[i * 3 + 1] >> 6) << 2) | (f[i * 3 + 2] >> 6)]++;
  for (let k = 0; k < 64; k++) hist[k] /= EW * EH;
  // the ground: the median colour of the border ring
  const ring = [];
  for (let x = 0; x < EW; x++) ring.push(x, (EH - 1) * EW + x);
  for (let y = 0; y < EH; y++) ring.push(y * EW, y * EW + EW - 1);
  const med = (c) => { const v = ring.map((p) => f[p * 3 + c]).sort((a, b) => a - b); return v[v.length >> 1]; };
  const ground = [med(0), med(1), med(2)];
  const GX = 8, GY = 6, mass = new Float32Array(GX * GY), edges = new Float32Array(GX * GY);
  for (let y = 1; y < EH - 1; y++) for (let x = 1; x < EW - 1; x++) {
    const p = y * EW + x, c = Math.min(GY - 1, (y * GY / EH) | 0) * GX + Math.min(GX - 1, (x * GX / EW) | 0);
    if (Math.abs(f[p * 3] - ground[0]) + Math.abs(f[p * 3 + 1] - ground[1]) + Math.abs(f[p * 3 + 2] - ground[2]) > 45) mass[c]++;
    if (Math.abs(g[p + 1] - g[p - 1]) + Math.abs(g[p + EW] - g[p - EW]) > 24) edges[c]++;
  }
  let ne = 0; for (const v of edges) ne += v;
  return { hist, mass, edges, blank: std(g) < ECHO.blank_std || ne / (EW * EH) < ECHO.blank_edges, rgb: f };
}
const cos = (a, b) => { let ab = 0, aa = 0, bb = 0; for (let i = 0; i < a.length; i++) { ab += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i]; } return aa && bb ? ab / Math.sqrt(aa * bb) : aa === bb ? 1 : 0; };
export function similarity(A, B) {
  let palette = 0;
  for (let k = 0; k < 64; k++) palette += Math.min(A.hist[k], B.hist[k]);
  const mass = cos(A.mass, B.mass), edges = cos(A.edges, B.edges);
  let d = 0;
  for (let i = 0; i < A.rgb.length; i++) d += Math.abs(A.rgb[i] - B.rgb[i]);
  const px = d / A.rgb.length;
  const r3 = (x) => Math.round(x * 1000) / 1000;
  return { echo: r3(0.4 * palette + 0.3 * mass + 0.3 * edges), palette: r3(palette), mass: r3(mass), edges: r3(edges), px: Math.round(px * 10) / 10, identical: px < ECHO.same_px && mass >= ECHO.same_layout && edges >= ECHO.same_layout };
}

// share of pixels that changed visibly, per step
function steps(frames) {
  const out = [1];
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1], b = frames[i];
    let n = 0;
    for (let p = 0; p < EW * EH; p++) if (Math.abs(a[p * 3] - b[p * 3]) + Math.abs(a[p * 3 + 1] - b[p * 3 + 1]) + Math.abs(a[p * 3 + 2] - b[p * 3 + 2]) > 24) n++;
    out.push(n / (EW * EH));
  }
  return out;
}

export function measureEcho(file, { frames = null } = {}) {
  const F = frames || decodeRGB(file);
  if (F.length < 10) throw new Error(`${path.basename(file)} has ${F.length} frames`);
  const S = steps(F), n = F.length, feat = new Map();
  const ft = (i) => { if (!feat.has(i)) feat.set(i, features(F[i])); return feat.get(i); };
  const settled = (i) => { for (let k = 1; k <= ECHO.settle_n; k++) if (i + k < n && S[i + k] > ECHO.settle_share) return false; return S[i] <= ECHO.settle_share * 3; };
  // the opening: the first settled non-blank frame in 3 s, at the end of its settled run (6 s when the first 3 s are blank); else the stillest non-blank one
  let open = null;
  for (const lim of [ECHO.open_s, ECHO.open_max_s]) {
    const last = Math.min(n - 1, Math.round(lim * EFPS));
    for (let i = 1; i <= last && open == null; i++) if (!ft(i).blank && settled(i)) open = i;
    // ... held to the end of that settled run (a line typing on counts as settled: the opening is the whole line)
    if (open != null) while (open + 1 <= last && !ft(open + 1).blank && settled(open + 1)) open++;
    if (open == null) {
      const c = []; for (let i = 1; i <= last; i++) if (!ft(i).blank) c.push(i);
      if (c.length) open = c.sort((a, b) => S[a] - S[b])[0];
    }
    if (open != null) break;
  }
  if (open == null) return { echo: null, note: "the first 6 s are blank: no opening frame to compare" };
  // stillness around a frame: the mean change over +-0.2 s; the stillest non-blank frame of a window, the later on a tie
  const calm = (i) => { let m = 0, k = 0; for (let j = Math.max(1, i - 2); j <= Math.min(n - 1, i + 2); j++) { m += S[j]; k++; } return m / k; };
  const stillest = (lo, hi) => { let best = null; for (let i = Math.max(lo, open + 1); i <= hi; i++) if (!ft(i).blank && (best == null || calm(i) <= calm(best) + 1e-4)) best = i; return best; };
  // the end card: the stillest non-blank frame of the last 3.5 s (not its exit or a fade out); it began where, walking
  // back, the layout (mass and edges) stops matching it
  const card = stillest(n - 1 - Math.round(ECHO.card_window_s * EFPS), n - 1) ?? n - 1;
  const layout = (a, b) => { const s = similarity(a, b); return (s.mass + s.edges) / 2; };
  let cardStart = card;
  while (cardStart - 1 > open && !ft(cardStart - 1).blank && layout(ft(cardStart - 1), ft(card)) >= ECHO.card_same) cardStart--;
  // the pre-end frame: the stillest non-blank frame in the 5 s before the end card began (the story's last beat)
  const pre = cardStart - 3 > open ? stillest(cardStart - Math.round(ECHO.pre_window_s * EFPS), cardStart - 3) : null;
  const O = ft(open);
  const cands = [{ which: "end card", i: card, ...similarity(O, ft(card)) }];
  if (pre != null) cands.push({ which: "before the end card", i: pre, ...similarity(O, ft(pre)) });
  const best = cands.slice().sort((a, b) => b.echo - a.echo)[0];
  const t = (i) => Math.round((i / EFPS) * 100) / 100;
  return {
    echo: best.echo, palette: best.palette, mass: best.mass, edges: best.edges, px: best.px,
    identical: cands.some((c) => c.identical) && best.identical,
    opening: { t: t(open) }, ending: { t: t(best.i), which: best.which },
    candidates: cands.map((c) => ({ which: c.which, t: t(c.i), echo: c.echo, palette: c.palette, mass: c.mass, edges: c.edges, px: c.px })),
    end_card_from: t(cardStart),
  };
}

if (process.argv[1] && process.argv[1].endsWith("echo.mjs")) {
  const file = process.argv[2];
  if (!file) { console.error("usage: node lib/echo.mjs <film.mp4> [--png <dir>]"); process.exit(1); }
  const e = measureEcho(file);
  console.log(JSON.stringify(e));
  const pi = process.argv.indexOf("--png");
  if (pi > 0 && e.echo != null) {
    const dir = process.argv[pi + 1], base = path.basename(file, path.extname(file));
    for (const [tag, t] of [["open", e.opening.t], ...e.candidates.map((c, k) => [`end${k}`, c.t])]) spawnSync("ffmpeg", ["-y", "-v", "error", "-ss", String(t), "-i", file, "-frames:v", "1", "-vf", "scale=320:-2", path.join(dir, `${base}-${tag}.png`)]);
  }
}
