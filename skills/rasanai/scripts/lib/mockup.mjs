// Corner-pin mockups: a picture warped onto a template's screen quad, with the light matched (shade, glass glare, grain).
// Built-in templates are drawn procedurally (no assets, no network, deterministic): billboard, poster-wall, phone, laptop, bus-shelter.
// Each template is {back, over, quad, aspect, radius, emissive}: `back` is the scene under the picture, `over` the glass, frame and glare
// above it. The same quad drives the live corner-pin in runtime/rasan-image-fx.js (the JSON this writes), so a mockup can be a baked PNG
// or a live, animated surface. Our own code.
import { readImage } from "./png-io.mjs";

// ------------------------------------------------------------------ tiny rasteriser (RGBA 8-bit, anti-aliased scanline polygons)
const hash2 = (x, y, s) => { let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul((s | 0) + 1, 2147483647); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
export function vnoise(x, y, s = 1) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0, s), b = hash2(x0 + 1, y0, s), c = hash2(x0, y0 + 1, s), d = hash2(x0 + 1, y0 + 1, s);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}
const hexRGB = (c) => { if (Array.isArray(c)) return c; let s = String(c).replace("#", ""); if (s.length === 3) s = s.replace(/./g, (x) => x + x); return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)]; };
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const canvas = (w, h, fill = [0, 0, 0, 0]) => { const data = new Uint8ClampedArray(w * h * 4); if (fill[3] || fill[0] || fill[1] || fill[2]) for (let i = 0; i < w * h; i++) { data[i * 4] = fill[0]; data[i * 4 + 1] = fill[1]; data[i * 4 + 2] = fill[2]; data[i * 4 + 3] = fill[3] ?? 255; } return { w, h, data }; };
// shade helpers: (x, y) -> [r, g, b, a?]
export const solid = (c, a = 1) => { const k = hexRGB(c); return () => [k[0], k[1], k[2], a]; };
export const linear = (x0, y0, x1, y1, stops) => {
  const st = stops.map(([t, c, a]) => [t, hexRGB(c), a ?? 1]), dx = x1 - x0, dy = y1 - y0, L = dx * dx + dy * dy || 1;
  return (x, y) => {
    const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / L));
    let i = 0; while (i < st.length - 2 && t > st[i + 1][0]) i++;
    const f = Math.max(0, Math.min(1, (t - st[i][0]) / (st[i + 1][0] - st[i][0] || 1))), c = mix(st[i][1], st[i + 1][1], f);
    return [c[0], c[1], c[2], st[i][2] + (st[i + 1][2] - st[i][2]) * f];
  };
};
export const radial = (cx, cy, r, stops) => { const lin = linear(0, 0, 1, 0, stops); return (x, y) => lin(Math.hypot(x - cx, y - cy) / r, 0); };
export function fillPoly(img, pts, shade, alpha = 1) {
  const { w, h, data } = img, fn = typeof shade === "function" ? shade : solid(shade);
  let y0 = Infinity, y1 = -Infinity; for (const p of pts) { if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
  y0 = Math.max(0, Math.floor(y0)); y1 = Math.min(h - 1, Math.ceil(y1));
  const cov = new Float32Array(w), SUB = 4, n = pts.length;
  for (let y = y0; y <= y1; y++) {
    cov.fill(0); let minx = w, maxx = -1;
    for (let s = 0; s < SUB; s++) {
      const sy = y + (s + 0.5) / SUB, xs = [];
      for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; if ((a[1] <= sy && b[1] > sy) || (b[1] <= sy && a[1] > sy)) xs.push(a[0] + ((sy - a[1]) / (b[1] - a[1])) * (b[0] - a[0])); }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const xa = Math.max(0, xs[k]), xb = Math.min(w, xs[k + 1]); if (xb <= xa) continue;
        const ia = Math.floor(xa), ib = Math.floor(xb);
        if (ia === ib) cov[ia] += (xb - xa) / SUB; else { cov[ia] += (ia + 1 - xa) / SUB; for (let x = ia + 1; x < ib; x++) cov[x] += 1 / SUB; if (ib < w) cov[ib] += (xb - ib) / SUB; }
        if (ia < minx) minx = ia; if (ib > maxx) maxx = Math.min(w - 1, ib);
      }
    }
    for (let x = minx; x <= maxx; x++) {
      const c = cov[x]; if (c <= 0) continue;
      const col = fn(x + 0.5, y + 0.5), sa = Math.min(1, c) * (col[3] ?? 1) * alpha, i = (y * w + x) * 4, da = data[i + 3] / 255, oa = sa + da * (1 - sa);
      if (oa <= 0) continue;
      data[i] = (col[0] * sa + data[i] * da * (1 - sa)) / oa; data[i + 1] = (col[1] * sa + data[i + 1] * da * (1 - sa)) / oa; data[i + 2] = (col[2] * sa + data[i + 2] * da * (1 - sa)) / oa; data[i + 3] = oa * 255;
    }
  }
}
// rounded rectangle outline points in plane coordinates, `seg` points per corner
const rrect = (x0, y0, x1, y1, r, seg = 6) => {
  const pts = [], c = [[x1 - r, y0 + r, -90], [x1 - r, y1 - r, 0], [x0 + r, y1 - r, 90], [x0 + r, y0 + r, 180]];
  for (const [cx, cy, a0] of c) for (let s = 0; s <= seg; s++) { const a = ((a0 + (90 * s) / seg) * Math.PI) / 180; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return pts;
};

// ------------------------------------------------------------------ homography: unit square (u, v) <-> quad [TL, TR, BR, BL]
export function unitToQuad(q) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q, dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2, sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
  let g = 0, hh = 0;
  if (Math.abs(sx) > 1e-9 || Math.abs(sy) > 1e-9) { const den = dx1 * dy2 - dx2 * dy1; g = (sx * dy2 - dx2 * sy) / den; hh = (dx1 * sy - sx * dy1) / den; }
  return [x1 - x0 + g * x1, x3 - x0 + hh * x3, x0, y1 - y0 + g * y1, y3 - y0 + hh * y3, y0, g, hh, 1];
}
const applyH = (m, u, v) => { const w = m[6] * u + m[7] * v + m[8]; return [(m[0] * u + m[1] * v + m[2]) / w, (m[3] * u + m[4] * v + m[5]) / w]; };
function invert3(m) {
  const [a, b, c, d, e, f, g, h, i] = m, A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
  return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
}

// ------------------------------------------------------------------ the warp
// src {w,h,data}, quad px points, panel aspect (w/h of the print area), corner radius (fraction of the panel height), `shade(x,y)` -> 0..2 light multiplier
export function pinInto(dst, src, quad, { aspect = 16 / 9, radius = 0, fit = "cover", shade = null, grain = 0, seed = 1, softness = 0.6 } = {}) {
  // fit the picture to the panel's aspect first (cover crops, contain pads with transparent), then warp the unit square onto the quad
  const sa = src.w / src.h; let u0 = 0, v0 = 0, u1 = 1, v1 = 1;
  if (fit === "cover") { if (sa > aspect) { const k = aspect / sa; u0 = (1 - k) / 2; u1 = u0 + k; } else { const k = sa / aspect; v0 = (1 - k) / 2; v1 = v0 + k; } }
  else if (fit === "contain") { if (sa > aspect) { const k = aspect / sa; v0 = -(1 / k - 1) / 2; v1 = v0 + 1 / k; } else { const k = sa / aspect; u0 = -(1 / k - 1) / 2; u1 = u0 + 1 / k; } }
  const H = unitToQuad(quad), Hi = invert3(H);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of quad) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
  x0 = Math.max(0, Math.floor(x0) - 1); y0 = Math.max(0, Math.floor(y0) - 1); x1 = Math.min(dst.w - 1, Math.ceil(x1) + 1); y1 = Math.min(dst.h - 1, Math.ceil(y1) + 1);
  const rr = radius * 1; // radius is in units of panel height; the mask works in panel coordinates (u * aspect, v)
  const inside = (u, v) => {
    if (u < 0 || u > 1 || v < 0 || v > 1) return 0;
    if (rr <= 0) return 1;
    const px = u * aspect, py = v, r = rr, cx = Math.min(Math.max(px, r), aspect - r), cy = Math.min(Math.max(py, r), 1 - r);
    const d = Math.hypot(px - cx, py - cy) - r; // signed, in panel-height units
    return d <= 0 ? 1 : 0;
  };
  const sw = src.w, sh = src.h, sd = src.data, SS = [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]];
  const sample = (u, v, o) => { // bilinear, u,v in the picture's own unit square
    const fx = Math.max(0, Math.min(sw - 1, (u0 + (u1 - u0) * u) * sw - 0.5)), fy = Math.max(0, Math.min(sh - 1, (v0 + (v1 - v0) * v) * sh - 0.5));
    const xa = Math.floor(fx), ya = Math.floor(fy), xb = Math.min(sw - 1, xa + 1), yb = Math.min(sh - 1, ya + 1), tx = fx - xa, ty = fy - ya;
    for (let k = 0; k < 4; k++) o[k] = (sd[(ya * sw + xa) * 4 + k] * (1 - tx) + sd[(ya * sw + xb) * 4 + k] * tx) * (1 - ty) + (sd[(yb * sw + xa) * 4 + k] * (1 - tx) + sd[(yb * sw + xb) * 4 + k] * tx) * ty;
  };
  const tmp = [0, 0, 0, 0], d = dst.data;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    let cov = 0, r = 0, g = 0, b = 0, a = 0;
    for (const [ox, oy] of SS) {
      const [u, v] = applyH(Hi, x + ox, y + oy);
      if (!inside(u, v)) continue;
      sample(u, v, tmp); const ta = tmp[3] / 255; cov++; r += tmp[0] * ta; g += tmp[1] * ta; b += tmp[2] * ta; a += ta;
    }
    if (!cov) continue;
    const alpha = a / 4, k = a > 0 ? 1 / a : 0; let cr = r * k, cg = g * k, cb = b * k;
    if (shade) { const m = shade(x + 0.5, y + 0.5); cr *= m; cg *= m; cb *= m; }
    if (grain) { const n = (hash2(x, y, seed) + hash2(x, y, seed + 7) - 1) * grain * 255 * 2; cr += n; cg += n; cb += n; }
    const i = (y * dst.w + x) * 4, sa2 = Math.min(1, alpha * (cov >= 4 ? 1 : 0.95)) * (softness > 0 && cov < 4 ? 1 : 1);
    d[i] = cr * sa2 + d[i] * (1 - sa2); d[i + 1] = cg * sa2 + d[i + 1] * (1 - sa2); d[i + 2] = cb * sa2 + d[i + 2] * (1 - sa2); d[i + 3] = Math.max(d[i + 3], sa2 * 255);
  }
}
export function overInto(dst, over) {
  const d = dst.data, o = over.data;
  for (let i = 0; i < d.length; i += 4) { const a = o[i + 3] / 255; if (!a) continue; d[i] = o[i] * a + d[i] * (1 - a); d[i + 1] = o[i + 1] * a + d[i + 1] * (1 - a); d[i + 2] = o[i + 2] * a + d[i + 2] * (1 - a); d[i + 3] = Math.max(d[i + 3], o[i + 3]); }
}

// ------------------------------------------------------------------ built-in templates
// every template draws in unit coordinates (0..1 of the frame) so it works at any size. `T(x, y)` -> px.
const sky = (W, H, top, mid, bot, hz) => linear(0, 0, 0, H * hz, [[0, top], [0.55, mid], [1, bot]]);
function ground(back, W, H, hz, a, b) { fillPoly(back, [[0, H * hz], [W, H * hz], [W, H], [0, H]], linear(0, H * hz, 0, H, [[0, a], [1, b]])); }
function hills(back, W, H, hz, col, amp, seed, y0) {
  const pts = [[0, H * hz]]; for (let i = 0; i <= 48; i++) { const x = (i / 48) * W; pts.push([x, H * (y0 - amp * vnoise(i * 0.18, 3, seed) - amp * 0.5 * vnoise(i * 0.5, 9, seed))]); } pts.push([W, H * hz]);
  fillPoly(back, pts, col);
}
function frameAround(back, H4, plane, pad, col, rad = 0) { // a frame / bezel: the screen plane enlarged by `pad` (u, v units), drawn through the same homography
  const pts = rrect(-pad[0], -pad[1], 1 + pad[0], 1 + pad[1], rad, 6).map(([u, v]) => applyH(H4, u, v));
  fillPoly(back, pts, col);
}

const TEMPLATES = {
  billboard: {
    about: "a roadside hoarding on two steel posts at dusk, slight perspective, a lamp bar along the top", aspect: 2.4, radius: 0, emissive: false,
    draw(W, H) {
      const T = (x, y) => [x * W, y * H], back = canvas(W, H, [0, 0, 0, 255]), over = canvas(W, H);
      fillPoly(back, [[0, 0], [W, 0], [W, H], [0, H]], sky(W, H, "#9fb7d1", "#e9d4c0", "#f4e4cf", 0.72));
      hills(back, W, H, 0.72, "#9fb0b4", 0.07, 4, 0.72); hills(back, W, H, 0.76, "#6f8791", 0.06, 11, 0.76);
      ground(back, W, H, 0.74, "#59655c", "#2f3733");
      fillPoly(back, [T(0, 0.9), T(1, 0.86), T(1, 1), T(0, 1)], "#3a3d3f");
      const quad = [T(0.2, 0.16), T(0.84, 0.1), T(0.84, 0.5), T(0.2, 0.52)], H4 = unitToQuad(quad);
      for (const u of [0.18, 0.8]) { const top = applyH(H4, u, 1), bx = top[0]; fillPoly(back, [[bx - W * 0.011, top[1]], [bx + W * 0.011, top[1]], [bx + W * 0.014, H * 0.84], [bx - W * 0.014, H * 0.84]], linear(bx - 20, 0, bx + 20, 0, [[0, "#3b4248"], [1, "#1f2428"]])); }
      frameAround(back, H4, null, [0.012, 0.045], "#2a2f34");
      frameAround(back, H4, null, [0.006, 0.02], "#14181b");
      // catwalk + lamp bar above the panel
      const lampA = applyH(H4, 0.04, -0.07), lampB = applyH(H4, 0.96, -0.07);
      for (let i = 0; i < 6; i++) { const t = (i + 0.5) / 6, p = [lampA[0] + (lampB[0] - lampA[0]) * t, lampA[1] + (lampB[1] - lampA[1]) * t]; fillPoly(over, rrect(0, 0, 1, 1, 0.5, 4).map(([a, b]) => [p[0] + (a - 0.5) * W * 0.02, p[1] + (b - 0.5) * H * 0.01]), "#fff6d8"); fillPoly(over, rrect(0, 0, 1, 1, 0.5, 8).map(([a, b]) => [p[0] + (a - 0.5) * W * 0.12, p[1] + (b + 0.4) * H * 0.07]), radial(p[0], p[1] + H * 0.03, W * 0.06, [[0, "#fff2c8", 0.22], [1, "#fff2c8", 0]]), 1); }
      const shade = (x, y) => 0.88 + 0.16 * (1 - (y - H * 0.1) / (H * 0.45));
      return { back, over, quad, shade };
    },
  },
  "poster-wall": {
    about: "a printed poster pasted on a plaster wall, side light, soft shadow, paper edge", aspect: 2 / 3, radius: 0, emissive: false,
    draw(W, H) {
      const T = (x, y) => [x * W, y * H], back = canvas(W, H, [0, 0, 0, 255]), over = canvas(W, H);
      fillPoly(back, [[0, 0], [W, 0], [W, H], [0, H]], (x, y) => { const n = 0.5 * vnoise(x / 90, y / 90, 3) + 0.3 * vnoise(x / 24, y / 24, 5) + 0.2 * vnoise(x / 6, y / 6, 8), l = 1.08 - 0.5 * Math.hypot((x - W * 0.05) / W, (y - H * 0.05) / H); return [(205 + n * 28) * l, (196 + n * 26) * l, (184 + n * 24) * l, 1]; });
      fillPoly(back, [T(0, 0.9), T(1, 0.9), T(1, 1), T(0, 1)], linear(0, H * 0.9, 0, H, [[0, "#5a5048"], [1, "#2c2622"]]));
      fillPoly(back, [T(0, 0.9), T(1, 0.9), T(1, 0.91), T(0, 0.91)], "#2a2420");
      const quad = [T(0.36, 0.1), T(0.64, 0.115), T(0.64, 0.8), T(0.36, 0.82)], H4 = unitToQuad(quad);
      const sh = rrect(-0.02, -0.01, 1.07, 1.05, 0, 2).map(([u, v]) => applyH(H4, u, v)); fillPoly(back, sh.map(([x, y]) => [x + W * 0.012, y + H * 0.014]), solid("#3a2f26", 0.35));
      frameAround(back, H4, null, [0.012, 0.008], "#f4f0e8");
      // tape strips
      for (const u of [0.1, 0.9]) { const p = applyH(H4, u, -0.002); fillPoly(over, [[p[0] - W * 0.02, p[1] - H * 0.008], [p[0] + W * 0.02, p[1] - H * 0.014], [p[0] + W * 0.02, p[1] + H * 0.018], [p[0] - W * 0.02, p[1] + H * 0.024]], solid("#efe3b6", 0.6)); }
      // a slow side light across the paper
      fillPoly(over, sh, linear(quad[0][0], 0, quad[1][0], 0, [[0, "#ffffff", 0.14], [0.5, "#ffffff", 0], [1, "#000000", 0.12]]));
      return { back, over, quad, shade: (x) => 0.97 + 0.05 * Math.sin(x / 300) };
    },
  },
  phone: {
    about: "a phone held at a three-quarter angle on a soft studio ground, glass glare across the screen", aspect: 9 / 19.5, radius: 0.045, emissive: true,
    draw(W, H) {
      const T = (x, y) => [x * W, y * H], back = canvas(W, H, [0, 0, 0, 255]), over = canvas(W, H);
      fillPoly(back, [[0, 0], [W, 0], [W, H], [0, H]], radial(W * 0.5, H * 0.45, W * 0.75, [[0, "#f1ece6"], [1, "#b9b2aa"]]));
      fillPoly(back, [T(0, 0.82), T(1, 0.82), T(1, 1), T(0, 1)], linear(0, H * 0.82, 0, H, [[0, "#cdc6bd", 0.7], [1, "#8d867d"]]));
      const quad = [T(0.42, 0.14), T(0.595, 0.11), T(0.60, 0.86), T(0.415, 0.82)], H4 = unitToQuad(quad);
      const body = (pad, ex = 0) => rrect(-pad, -pad * 0.46 - ex, 1 + pad, 1 + pad * 0.46 + ex, 0.1, 8).map(([u, v]) => applyH(H4, u, v));
      const bd = body(0.07); fillPoly(back, bd.map(([x, y]) => [x + W * 0.025, y + H * 0.03]), radial(W * 0.52, H * 0.88, W * 0.28, [[0, "#000000", 0.38], [1, "#000000", 0]]), 1);
      fillPoly(back, bd, linear(W * 0.36, 0, W * 0.66, 0, [[0, "#5b5f66"], [0.5, "#2b2e33"], [1, "#6c7078"]]));
      fillPoly(back, body(0.045), "#08090a");
      // dynamic island + glass glare
      const isl = rrect(0.36, 0.012, 0.64, 0.034, 0.011, 4).map(([u, v]) => applyH(H4, u, v)); fillPoly(over, isl, "#050506");
      const gl = [applyH(H4, 0.05, 0), applyH(H4, 0.62, 0), applyH(H4, 0.2, 1), applyH(H4, -0.15, 1)]; fillPoly(over, gl, linear(quad[0][0], quad[0][1], quad[2][0], quad[2][1], [[0, "#ffffff", 0.16], [0.5, "#ffffff", 0.03], [1, "#ffffff", 0]]));
      return { back, over, quad, shade: null };
    },
  },
  laptop: {
    about: "an open laptop on a desk, lid tilted back, warm lamp light from the left", aspect: 16 / 10, radius: 0.004, emissive: true,
    draw(W, H) {
      const T = (x, y) => [x * W, y * H], back = canvas(W, H, [0, 0, 0, 255]), over = canvas(W, H);
      fillPoly(back, [[0, 0], [W, 0], [W, H], [0, H]], linear(0, 0, 0, H * 0.62, [[0, "#cfd2d4"], [1, "#e3dccf"]]));
      fillPoly(back, [T(0, 0.64), T(1, 0.64), T(1, 1), T(0, 1)], (x, y) => { const n = vnoise(x / 60, y / 8, 2); return [138 + n * 22, 108 + n * 16, 80 + n * 12, 1]; });
      fillPoly(back, [T(0, 0.64), T(1, 0.64), T(1, 0.645), T(0, 0.645)], "#4b3a2b");
      const quad = [T(0.25, 0.1), T(0.75, 0.1), T(0.77, 0.6), T(0.23, 0.6)], H4 = unitToQuad(quad);
      fillPoly(back, [T(0.19, 0.64), T(0.81, 0.64), T(0.87, 0.78), T(0.13, 0.78)].map(([x, y]) => [x + W * 0.01, y + H * 0.03]), solid("#000", 0.3));
      frameAround(back, H4, null, [0.022, 0.034], "#1d1f22", 0.012);
      fillPoly(back, [T(0.2, 0.612), T(0.8, 0.612), T(0.86, 0.755), T(0.14, 0.755)], linear(0, H * 0.61, 0, H * 0.76, [[0, "#c7c9cc"], [1, "#a9acb0"]]));
      fillPoly(back, [T(0.2, 0.606), T(0.8, 0.606), T(0.8, 0.617), T(0.2, 0.617)], "#8d9094");
      fillPoly(back, [T(0.23, 0.63), T(0.77, 0.63), T(0.81, 0.7), T(0.19, 0.7)], "#7b7e82");
      fillPoly(back, [T(0.4, 0.715), T(0.6, 0.715), T(0.61, 0.74), T(0.39, 0.74)], "#b6b9bd");
      fillPoly(back, [T(0.14, 0.755), T(0.86, 0.755), T(0.87, 0.775), T(0.13, 0.775)], "#85888c");
      fillPoly(over, [applyH(H4, 0, 0), applyH(H4, 0.55, 0), applyH(H4, 0.2, 1), applyH(H4, 0, 1)], linear(quad[0][0], quad[0][1], quad[2][0], quad[2][1], [[0, "#ffffff", 0.1], [0.6, "#ffffff", 0.02], [1, "#ffffff", 0]]));
      fillPoly(over, [T(0, 0), T(0.5, 0), T(0.35, 1), T(0, 1)], linear(0, 0, W * 0.5, 0, [[0, "#ffb866", 0.13], [1, "#ffb866", 0]]));
      return { back, over, quad, shade: null };
    },
  },
  "bus-shelter": {
    about: "a backlit advert panel in a bus shelter at dusk, wet pavement reflecting the glow", aspect: 2 / 3, radius: 0, emissive: true,
    draw(W, H) {
      const T = (x, y) => [x * W, y * H], back = canvas(W, H, [0, 0, 0, 255]), over = canvas(W, H);
      fillPoly(back, [[0, 0], [W, 0], [W, H], [0, H]], sky(W, H, "#27324d", "#6b6f94", "#e0a08c", 0.62));
      // far buildings
      for (let i = 0; i < 14; i++) { const x = (i / 14) * W * 1.05, bw = W * (0.05 + 0.03 * vnoise(i, 1, 6)), bh = H * (0.12 + 0.2 * vnoise(i * 2, 4, 6)); fillPoly(back, [[x, H * 0.62], [x, H * 0.62 - bh], [x + bw, H * 0.62 - bh], [x + bw, H * 0.62]], "#2c3148"); }
      fillPoly(back, [T(0, 0.62), T(1, 0.62), T(1, 1), T(0, 1)], linear(0, H * 0.62, 0, H, [[0, "#3a3d4d"], [1, "#16181f"]]));
      fillPoly(back, [T(0, 0.9), T(1, 0.9), T(1, 0.93), T(0, 0.93)], "#575a66");
      const quad = [T(0.39, 0.17), T(0.61, 0.155), T(0.61, 0.73), T(0.39, 0.715)], H4 = unitToQuad(quad);
      // shelter: roof slab, side posts, rear glass
      fillPoly(back, [T(0.1, 0.08), T(0.9, 0.06), T(0.92, 0.115), T(0.08, 0.125)], linear(0, H * 0.06, 0, H * 0.125, [[0, "#5d6270"], [1, "#2f333d"]]));
      for (const x of [0.1, 0.9]) fillPoly(back, [[W * (x - 0.012), H * 0.12], [W * (x + 0.012), H * 0.12], [W * (x + 0.012), H * 0.9], [W * (x - 0.012), H * 0.9]], "#262a33");
      fillPoly(back, [T(0.112, 0.125), T(0.888, 0.125), T(0.888, 0.9), T(0.112, 0.9)], solid("#8fa3c4", 0.12));
      frameAround(back, H4, null, [0.03, 0.03], "#2b2f39");
      // light spill + reflection on the wet ground
      fillPoly(over, [[0, 0], [W, 0], [W, H], [0, H]], radial(W * 0.5, H * 0.44, W * 0.34, [[0, "#ffdca8", 0.2], [1, "#ffdca8", 0]]));
      fillPoly(over, [T(0.3, 0.93), T(0.7, 0.93), T(0.74, 1), T(0.26, 1)], linear(0, H * 0.93, 0, H, [[0, "#ffdca8", 0.35], [1, "#ffdca8", 0.05]]));
      fillPoly(over, [applyH(H4, 0.1, 0), applyH(H4, 0.4, 0), applyH(H4, -0.1, 1), applyH(H4, -0.4, 1)].map(([x, y]) => [x + 0, y]), linear(quad[0][0], 0, quad[1][0], 0, [[0, "#ffffff", 0], [0.4, "#ffffff", 0.08], [1, "#ffffff", 0]]));
      return { back, over, quad, shade: null };
    },
  },
};
export const TEMPLATE_IDS = Object.keys(TEMPLATES);
export const templateInfo = () => TEMPLATE_IDS.map((id) => ({ id, about: TEMPLATES[id].about, panel_aspect: +TEMPLATES[id].aspect.toFixed(3), emissive: TEMPLATES[id].emissive }));

// build one template at W x H -> {back, over, quad, aspect, radius, emissive, shade}
export function buildTemplate(id, W = 1920, H = 1080) {
  const t = TEMPLATES[id];
  if (!t) throw new Error(`unknown template "${id}" (${TEMPLATE_IDS.join(", ")})`);
  return { id, aspect: t.aspect, radius: t.radius, emissive: t.emissive, ...t.draw(W, H) };
}
// compose: template (or your own plate + corners) + picture -> RGBA
export function mockup(srcPath, { template = "billboard", size = [1920, 1080], bg = null, corners = null, over = null, aspect = null, radius = null, fit = "cover", grain = 0.012, seed = 1 } = {}) {
  const [W, H] = size;
  let back, ov, quad, asp, rad, shade = null, emissive = false;
  if (bg) {
    if (!corners) throw new Error("a custom plate needs corners (x,y of the panel's top-left, top-right, bottom-right, bottom-left, in the plate's pixels)");
    const b = readImage(bg, { exact: { w: W, h: H } }); back = b; ov = over ? readImage(over, { exact: { w: W, h: H } }) : canvas(W, H);
    quad = corners; asp = aspect || Math.hypot(corners[1][0] - corners[0][0], corners[1][1] - corners[0][1]) / Math.max(1, Math.hypot(corners[3][0] - corners[0][0], corners[3][1] - corners[0][1])); rad = radius ?? 0; emissive = true;
  } else {
    const t = buildTemplate(template, W, H); back = t.back; ov = t.over; quad = corners || t.quad; asp = aspect || t.aspect; rad = radius ?? t.radius; shade = t.emissive ? null : t.shade; emissive = t.emissive;
  }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of quad) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
  const longest = Math.max(x1 - x0, y1 - y0) * 1.5;
  const src = readImage(srcPath, { maxW: Math.round(longest), maxH: Math.round(longest) });
  const out = { w: W, h: H, data: new Uint8ClampedArray(back.data) };
  pinInto(out, src, quad, { aspect: asp, radius: rad, fit, shade, grain, seed });
  overInto(out, ov);
  return { img: out, back, over: ov, quad, aspect: asp, radius: rad, emissive };
}
