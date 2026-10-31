// Depth-based layer split for 2.5D camera moves ("plates"): near / mid / far RGBA layers cut from one picture by its depth map.
// Each layer behind another has the nearer content INPAINTED away (a push-pull fill: coarse colour from the surrounding pixels, pulled
// into the hole) so a camera move never shows a hole. Our own code. Pure Node, deterministic (no random).
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// separable box max (grow = true) or min (grow = false) over a Uint8 mask, radius r px
function morph(mask, w, h, r, grow) {
  if (r <= 0) return mask;
  const t = new Uint8Array(w * h), o = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = grow ? 0 : 1;
    for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) { const m = mask[y * w + k]; if (grow ? m : !m) { v = grow ? 1 : 0; break; } }
    t[y * w + x] = v;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = grow ? 0 : 1;
    for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) { const m = t[k * w + x]; if (grow ? m : !m) { v = grow ? 1 : 0; break; } }
    o[y * w + x] = v;
  }
  return o;
}
function boxBlur(a, w, h, r, passes = 2) {
  let src = Float32Array.from(a), tmp = new Float32Array(w * h);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) { let s = 0, n = 0; const row = y * w; for (let x = -r; x < w; x++) { const add = x + r, rem = x - r - 1; if (add < w) { s += src[row + add]; n++; } if (rem >= 0) { s -= src[row + rem]; n--; } if (x >= 0) tmp[row + x] = s / n; } }
    for (let x = 0; x < w; x++) { let s = 0, n = 0; for (let y = -r; y < h; y++) { const add = y + r, rem = y - r - 1; if (add < h) { s += tmp[add * w + x]; n++; } if (rem >= 0) { s -= tmp[rem * w + x]; n--; } if (y >= 0) src[y * w + x] = s / n; } }
  }
  return src;
}

// Push-pull inpaint: rgba Uint8ClampedArray (w x h), hole = Uint8 (1 = fill this pixel). Returns a new RGBA with the holes painted.
export function inpaint(rgba, w, h, hole) {
  const lv = [];
  { const c = new Float32Array(w * h * 3), a = new Float32Array(w * h); for (let i = 0; i < w * h; i++) if (!hole[i]) { a[i] = 1; c[i * 3] = rgba[i * 4]; c[i * 3 + 1] = rgba[i * 4 + 1]; c[i * 3 + 2] = rgba[i * 4 + 2]; } lv.push({ w, h, c, a }); }
  while (lv[lv.length - 1].w > 1 || lv[lv.length - 1].h > 1) {
    const s = lv[lv.length - 1], nw = Math.max(1, (s.w + 1) >> 1), nh = Math.max(1, (s.h + 1) >> 1);
    const c = new Float32Array(nw * nh * 3), a = new Float32Array(nw * nh);
    for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
      let sa = 0, sr = 0, sg = 0, sb = 0, n = 0;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) { const xx = Math.min(s.w - 1, x * 2 + dx), yy = Math.min(s.h - 1, y * 2 + dy), i = yy * s.w + xx; n++; sa += s.a[i]; sr += s.c[i * 3]; sg += s.c[i * 3 + 1]; sb += s.c[i * 3 + 2]; }
      const o = y * nw + x; a[o] = sa / n; c[o * 3] = sr / n; c[o * 3 + 1] = sg / n; c[o * 3 + 2] = sb / n;
    }
    lv.push({ w: nw, h: nh, c, a });
  }
  const top = lv[lv.length - 1];
  if (top.a[0] <= 0) return new Uint8ClampedArray(rgba); // nothing known anywhere: leave it
  // filled colour per level, coarse to fine
  let filled = new Float32Array(3); filled[0] = top.c[0] / top.a[0]; filled[1] = top.c[1] / top.a[0]; filled[2] = top.c[2] / top.a[0];
  for (let l = lv.length - 2; l >= 0; l--) {
    const s = lv[l], cs = lv[l + 1], f = new Float32Array(s.w * s.h * 3);
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
      const fx = Math.max(0, Math.min(cs.w - 1, (x + 0.5) / 2 - 0.5)), fy = Math.max(0, Math.min(cs.h - 1, (y + 0.5) / 2 - 0.5));
      const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(cs.w - 1, x0 + 1), y1 = Math.min(cs.h - 1, y0 + 1), tx = fx - x0, ty = fy - y0;
      const i = y * s.w + x, a = s.a[i];
      for (let k = 0; k < 3; k++) {
        const up = (filled[(y0 * cs.w + x0) * 3 + k] * (1 - tx) + filled[(y0 * cs.w + x1) * 3 + k] * tx) * (1 - ty) + (filled[(y1 * cs.w + x0) * 3 + k] * (1 - tx) + filled[(y1 * cs.w + x1) * 3 + k] * tx) * ty;
        f[i * 3 + k] = s.c[i * 3 + k] + (1 - a) * up;
      }
    }
    filled = f;
  }
  const o = new Uint8ClampedArray(rgba);
  for (let i = 0; i < w * h; i++) if (hole[i]) { o[i * 4] = filled[i * 3]; o[i * 4 + 1] = filled[i * 3 + 1]; o[i * 4 + 2] = filled[i * 3 + 2]; o[i * 4 + 3] = 255; }
  return o;
}

const NAMES = { 2: ["far", "near"], 3: ["far", "mid", "near"], 4: ["far", "mid-far", "mid-near", "near"] };
// img {w,h,data RGBA}, depth {v Float32 0..1, near = 1, same size}. splits ascending depth thresholds (n-1 of them).
// -> [{id, depth_min, depth_max, parallax, rgba}] far to near. Layer k covers every pixel at or nearer than splits[k-1] (so layers stack
// without gaps), with everything nearer than splits[k] painted out of it.
export function splitLayers(img, depth, { splits = [0.4, 0.7], feather = 3, grow = 6, choke = 1 } = {}) {
  const { w, h, data } = img, n = splits.length + 1, names = NAMES[n] || Array.from({ length: n }, (_, i) => `layer-${i + 1}`);
  const layers = [];
  for (let k = 0; k < n; k++) {
    const lo = k === 0 ? 0 : splits[k - 1], hi = k === n - 1 ? 1.0001 : splits[k];
    // alpha: everything at or nearer than this layer's lower bound
    let own = new Uint8Array(w * h);
    if (k === 0) own.fill(1); else for (let i = 0; i < w * h; i++) own[i] = depth.v[i] >= lo ? 1 : 0;
    if (k > 0 && choke > 0) own = morph(own, w, h, choke, false);
    const a = k === 0 ? new Float32Array(w * h).fill(1) : boxBlur(own, w, h, Math.max(1, feather), 2);
    // hole: nearer content (it belongs to a layer in front), grown a little so its edge halo is not copied back
    let hole = new Uint8Array(w * h), any = false;
    for (let i = 0; i < w * h; i++) if (depth.v[i] >= hi) { hole[i] = 1; any = true; }
    if (any) hole = morph(hole, w, h, grow, true);
    const filled = any ? inpaint(data, w, h, hole) : new Uint8ClampedArray(data);
    const o = new Uint8ClampedArray(w * h * 4);
    let sum = 0, cnt = 0;
    for (let i = 0; i < w * h; i++) {
      o[i * 4] = filled[i * 4]; o[i * 4 + 1] = filled[i * 4 + 1]; o[i * 4 + 2] = filled[i * 4 + 2];
      o[i * 4 + 3] = Math.round(255 * clamp01(a[i]) * (data[i * 4 + 3] / 255));
      if (depth.v[i] >= lo && depth.v[i] < hi) { sum += depth.v[i]; cnt++; }
    }
    layers.push({ id: names[k], depth_min: +lo.toFixed(3), depth_max: +Math.min(1, hi).toFixed(3), mean_depth: cnt ? +(sum / cnt).toFixed(3) : +lo.toFixed(3), parallax: 0, rgba: o });
  }
  const far = layers[0].mean_depth, near = layers[n - 1].mean_depth, span = Math.max(1e-3, near - far);
  for (const L of layers) L.parallax = +clamp01((L.mean_depth - far) / span).toFixed(3); // 0 = background speed, 1 = nearest speed
  return layers;
}
