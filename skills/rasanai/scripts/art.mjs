#!/usr/bin/env node
// The art department's tool: the film's asset list, generated and treated pictures, vector line art, handwriting.
// Zero dependencies (Node >= 20, ffmpeg + ffprobe). JSON on stdout, problems on stderr. Never opens a window.
//
//   node art.mjs plan --run R                 -> R/art/plan.json: {style, grammar, assets: [{id, kind, prompt, treatments, used_by}]}
//        derived from the chosen script's shows (built_from object|photo, and any show naming a drawn thing), the grammar and the look.
//        The art-director agent fills and edits it. An existing plan is kept unless --force.
//   node art.mjs make --run R [--only id,..] [--force]
//        illustration|icon|photo|texture|cutout|lineart rows -> imagegen.mjs batch (the first generated asset is the style anchor,
//        passed as a reference to the rest); handwriting rows -> `hand`; row.treatments are applied after. Writes R/art/assets/<id>.png|svg
//        and R/art/assets.json {style, anchor, assets: [{id, kind, path, source, prompt, ...}], todo: [{id, reason, prompt}]}.
//        Image generation unavailable (IMAGEGEN not ready): says so and writes the todo list (exit 0); it never fails silently.
//   node art.mjs cutout --in a.png --out b.png [--tol 40] [--pad 0]
//        background removal: `npx hyperframes remove-background` (u2net) when it works, else a flood-fill from the edges on a plain
//        ground (RASANAI_CUTOUT=flood skips the tool); trimmed to its content.
//        --object: a GENERAL object / background matte instead (any subject: products, animals, buildings, people) with BiRefNet lite
//        (MIT, ONNX, onnxruntime-node; ~224 MB, downloaded on demand into ~/.cache/rasanai/models). [--matte-out m.png] [--no-trim]
//   node art.mjs depth --in a.png --out depth.png [--bits 8|16] [--size 518] [--flip]
//        a depth map (white = near) with Depth Anything V2 Small (Apache-2.0, ONNX, onnxruntime-node; ~99 MB, downloaded on demand).
//        Bake it once; runtime/rasan-image-fx.js reads it for depth parallax. Never run at render time.
//   node art.mjs plates --in a.png [--depth d.png] [--out dir] [--splits 0.4,0.7] [--feather 3] [--grow 6]
//        a depth split into far / mid / near RGBA layers (dir/far.png, mid.png, near.png, plates.json): every layer behind another has
//        the nearer content inpainted away (push-pull fill), so a camera move never shows a hole. Stack them with translate/scale at
//        the `parallax` factors in plates.json (far 0, near 1), or let rasan-image-fx.js do depth parallax on the whole picture.
//   node art.mjs mockup --in a.png --template billboard|poster-wall|phone|laptop|bus-shelter --out m.png [--size 1920x1080] [--fit cover|contain]
//        [--grain 0.012] [--parts]       corner-pin a picture onto a built-in procedural template with the light matched; writes m.png and m.json
//        (the quad, in pixels and in 0..1, for the live corner-pin in rasan-image-fx.js); --parts also writes m.back.png and m.over.png
//        (the scene under and the glass/frame over the picture, to layer it live).  --list prints the templates.
//        Your own plate (a generated "blank hoarding"): --bg plate.png --corners "x,y,x,y,x,y,x,y" (TL TR BR BL, plate pixels) [--over o.png] [--aspect 1.78]
//   node art.mjs world init|check|make|lock --run R      the world bible (art/world.json, lib/world-bible.mjs): anchor, 30-45 word style line, sheets, palette,
//        used_by per image. `check` is the reuse gate (conditional: 3+ uses per image and more than 6 images are warnings, zero photos is valid, no still static > 1.2 s is an error); `make` generates the anchor first,
//        then the sheets, then the rest with the anchor as --ref (imagegen.mjs batch --world), then bakes each image's `derive` (depth, plates, cutout).
//   node art.mjs treat --in a.png --out b.png --op gradient-map|duotone|halftone|dither|pixelate|xray|grade [--colors c1,c2,..] [--cell N]
//        gradient-map also takes [--dither L] (grey levels of seeded noise before the ramp: no banding) [--grain 0.01] [--seed N]
//   node art.mjs treat --in a.png --out b.png --halftone-collage [--card #f6f1e4] [--ink #1b1a18] [--cell N] [--keyline px] [--tilt deg] [--shadow 0.32]
//        [--grain 0.03] [--seed N] [--field #hex] [--no-cutout]     the gbro paper-collage piece (library/styles/halftone-collage.md): the picture cut
//        out (its own alpha, else cutout()), a greyscale halftone in the ink over the cardstock colour, a ~2 px cream keyline, paper grain, a seeded
//        tilt under 1.5 degrees, one soft shadow down and right; a transparent PNG with room for the shadow (--field flattens it on a colour).
//        As a plan treatment: "halftone-collage" (or "halftone-collage:card=#e0783c").
//   node art.mjs trace --in a.png --out b.svg [--colors N] [--lineart] [--max 900]   vendored imagetracerjs: real <path>s
//   node art.mjs hand --text "..." --out b.svg [--font script|simplex] [--size 120] [--weight W] [--color #111] [--spacing 0]
//        single-stroke handwriting from the vendored Hershey fonts: one <path> per glyph stroke, in writing order (ready for draw-on)
//   node art.mjs check --run R                every asset exists (or is an explicit todo), every show that names an object or photo
//        maps to an asset, one style (every generated asset shares the anchor), sizes are enough for where they are used
//   node art.mjs plate --out p.png --palette c1,c2,.. [--ground #hex] [--variant fold|vortex|horizon|ribbon] [--aspect 16:9|9:16]
//        [--seed N] [--width W] [--engine auto|procedural|imagegen] [--ramp c1,c2,..] [--grain 0.01] [--calm 0..1] [--flip]
//        an abstract plate (an atmospheric ground, a depth layer behind UI, a plate to zoom through, an end-card field):
//        imagegen.mjs with the plate recipe when IMAGEGEN=ready (engine auto|imagegen), else the procedural plate (RasanCamera.plate
//        drawn headless in Chrome: blurred radial/linear fields and shapes bent by seeded noise, warped by feTurbulence/feDisplacementMap).
//        Either way it is gradient-mapped onto the ordered palette ramp (dithered, plus grain), so no off-palette hue can survive.
//   node art.mjs recipe --palette c1,c2,.. [--ground #hex] [--variant V] [--aspect A]   the plate prompt and ramp, as JSON (no image)
//        `abstract` rows in plan.json ({id, kind: "abstract", variant, aspect, palette?|ramp?, ground?, seed?}) are made by `make` the same way.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { parseArgs } from "./lib/common.mjs";
import { noteDowngrade } from "./lib/downgrade.mjs";
import * as pngio from "./lib/png-io.mjs";
import { depthMap, objectMatte } from "./lib/image-ml.mjs";
import { splitLayers } from "./lib/layers.mjs";
import { mockup as buildMockup, templateInfo, buildTemplate, TEMPLATE_IDS } from "./lib/mockup.mjs";
import { loadWorld, checkWorld, batchPlan, skeleton, lockWorld, worldPath } from "./lib/world-bible.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = parseArgs();
const cmd = args._[0];
const str = (v) => (v == null || v === true ? "" : String(v));
const err = (s) => process.stderr.write(s + "\n");
const out = (o) => process.stdout.write(JSON.stringify(o, null, 2) + "\n");
function fail(msg, code = 1) { err(`PROBLEM: ${msg}`); process.exit(code); }
const abs = (p) => path.resolve(String(p));
const exists = (p) => !!p && fs.existsSync(p);
const jsonMaybe = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const writeJSON = (p, o) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(o, null, 2) + "\n"); };
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "asset";
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const clamp = (v, a = 0, b = 255) => (v < a ? a : v > b ? b : v);

const KINDS = ["illustration", "icon", "photo", "cutout", "texture", "lineart", "handwriting", "abstract"];
const GENERATED = new Set(["illustration", "icon", "photo", "texture", "cutout", "lineart"]);
const OPS = ["gradient-map", "duotone", "halftone", "dither", "pixelate", "xray", "grade"];
// the least pixels (shorter side) an asset needs at the size it is shown at (a plan row may say min_px)
const MIN_PX = { texture: 1280, photo: 768, cutout: 768, illustration: 768, lineart: 768, icon: 192, abstract: 1080 };

// ------------------------------------------------------------------ pixels: ffmpeg decodes, we paint, our own PNG writer encodes
function dims(p) {
  const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", p], { encoding: "utf8" });
  const m = String(r.stdout).trim().match(/^(\d+)x(\d+)/);
  return m ? { width: +m[1], height: +m[2] } : { width: 0, height: 0 };
}
function readImage(p, maxW = 0) {
  if (!exists(p)) fail(`not found: ${p}`);
  const d = dims(p);
  if (!d.width) fail(`cannot read ${p} as a picture (ffprobe found no video stream)`);
  let w = d.width, h = d.height;
  const vf = [];
  if (maxW && w > maxW) { h = Math.max(1, Math.round((h * maxW) / w)); w = maxW; vf.push(`scale=${w}:${h}:flags=lanczos`); }
  const r = spawnSync("ffmpeg", ["-v", "error", "-i", p, ...(vf.length ? ["-vf", vf.join(",")] : []), "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgba", "-"], { maxBuffer: 1 << 30 });
  if (r.status !== 0 || r.stdout.length !== w * h * 4) fail(`ffmpeg could not decode ${p}: ${String(r.stderr).slice(0, 200)}`);
  return { w, h, data: new Uint8ClampedArray(r.stdout.buffer, r.stdout.byteOffset, r.stdout.length) };
}
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const b = Buffer.alloc(12 + data.length);
  b.writeUInt32BE(data.length, 0); b.write(type, 4, "latin1"); Buffer.from(data).copy(b, 8);
  b.writeUInt32BE(crc32(b.subarray(4, 8 + data.length)), 8 + data.length);
  return b;
}
function writePng(p, img) {
  const { w, h, data } = img;
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; Buffer.from(data.buffer, data.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 6 })), chunk("IEND", Buffer.alloc(0))]));
}
function hex(c) {
  let s = String(c).trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(s)) s = s.replace(/./g, (x) => x + x);
  if (!/^[0-9a-f]{6}$/i.test(s)) fail(`"${c}" is not a hex colour (#rgb or #rrggbb)`);
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}
const colorList = (v, dflt) => (str(v) ? str(v).split(",").map((s) => s.trim()).filter(Boolean) : dflt).map(hex);
const lumaAt = (d, i) => (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
function ramp(stops, t) {
  if (stops.length === 1) return stops[0];
  const x = clamp(t, 0, 1) * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(x)), f = x - i;
  return [0, 1, 2].map((k) => stops[i][k] + (stops[i + 1][k] - stops[i][k]) * f);
}
const BAYER = (() => { // 8x8 ordered-dither matrix, values in (0,1)
  let m = [[0]];
  for (let n = 1; n < 8; n *= 2) { const s = m.length, o = Array.from({ length: s * 2 }, () => Array(s * 2).fill(0)); for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) { const v = m[y][x] * 4; o[y][x] = v; o[y][x + s] = v + 2; o[y + s][x] = v + 3; o[y + s][x + s] = v + 1; } m = o; }
  return m.map((r) => r.map((v) => (v + 0.5) / 64));
})();

// ------------------------------------------------------------------ treatments
// a stateless per-pixel hash in [0, 1): the seeded dither and grain (same seed, same pixels)
const hashPx = (i, seed) => { let x = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(seed + 1, 0xc2b2ae35); x ^= x >>> 15; x = Math.imul(x, 0x2c1b3c6d); x ^= x >>> 12; x = Math.imul(x, 0x297a2d39); x ^= x >>> 15; return (x >>> 0) / 4294967296; };
// grain: seeded luminance noise of +-amount (0.01 = 1%), the same on every channel so it never shifts a hue
function addGrain(img, amount, seed = 1) {
  const d = img.data, k = amount * 255 * 2;
  for (let i = 0, p = 0; i < d.length; i += 4, p++) { const n = (hashPx(p, seed + 101) + hashPx(p, seed + 202) - 1) * k; d[i] = clamp(d[i] + n); d[i + 1] = clamp(d[i + 1] + n); d[i + 2] = clamp(d[i + 2] + n); }
  return img;
}
function treat(img, op, { colors = [], cell = 0, dither = 0, grain = 0, seed = 1 }) {
  const { w, h, data: d } = img;
  const o = new Uint8ClampedArray(d.length);
  const put = (i, c, a = d[i + 3]) => { o[i] = c[0]; o[i + 1] = c[1]; o[i + 2] = c[2]; o[i + 3] = a; };
  if (op === "gradient-map") {
    const stops = colors.length ? colors : colorList("", ["#14072e", "#c1272d", "#ff9d00", "#fff3c4"]);
    // dither (in grey levels): triangular noise on the 8-bit luma before the ramp, so a smooth field maps without bands
    const dk = dither / 255;
    for (let i = 0, p = 0; i < d.length; i += 4, p++) put(i, ramp(stops, lumaAt(d, i) + (dk ? (hashPx(p, seed) + hashPx(p, seed + 1) - 1) * dk : 0)));
    if (grain > 0) addGrain({ data: o }, grain, seed);
  } else if (op === "duotone") {
    const stops = colors.length >= 2 ? colors.slice(0, 2) : colorList("", ["#101820", "#f2efe6"]);
    for (let i = 0; i < d.length; i += 4) put(i, ramp(stops, lumaAt(d, i)));
  } else if (op === "xray") {
    const tint = colors[0] || hex("#7fe9ff"), ground = colors[1] || hex("#02090e");
    for (let i = 0; i < d.length; i += 4) { const l = clamp((1 - lumaAt(d, i) - 0.12) * 1.5, 0, 1); put(i, [0, 1, 2].map((k) => ground[k] + (tint[k] - ground[k]) * l)); }
  } else if (op === "grade") {
    const sh = colors[0], hi = colors[1];
    for (let i = 0; i < d.length; i += 4) {
      const l = lumaAt(d, i);
      const c = [0, 1, 2].map((k) => { let v = d[i + k] / 255; v = (v - 0.5) * 1.14 + 0.5; v = l + (v - l) * 1.15; return v; });
      const rgb = c.map((v, k) => { let x = v * 255; if (sh) x += (sh[k] - x) * 0.18 * (1 - l); if (hi) x += (hi[k] - x) * 0.18 * l; return x; });
      put(i, rgb);
    }
  } else if (op === "pixelate") {
    const n = Math.max(2, cell || Math.round(Math.max(w, h) / 64));
    for (let by = 0; by < h; by += n) for (let bx = 0; bx < w; bx += n) {
      let r = 0, g = 0, b = 0, a = 0, c = 0;
      for (let y = by; y < Math.min(h, by + n); y++) for (let x = bx; x < Math.min(w, bx + n); x++) { const i = (y * w + x) * 4; r += d[i]; g += d[i + 1]; b += d[i + 2]; a += d[i + 3]; c++; }
      let col = [r / c, g / c, b / c];
      if (colors.length) col = colors.reduce((best, p) => { const e = (p[0] - col[0]) ** 2 + (p[1] - col[1]) ** 2 + (p[2] - col[2]) ** 2; return e < best.e ? { e, p } : best; }, { e: Infinity, p: colors[0] }).p;
      for (let y = by; y < Math.min(h, by + n); y++) for (let x = bx; x < Math.min(w, bx + n); x++) put((y * w + x) * 4, col, a / c);
    }
  } else if (op === "dither") {
    const n = Math.max(1, cell || 1), pal = colors.length >= 2 ? colors : colorList("", ["#111111", "#f4f1ea"]);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, by = Math.floor(y / n), bx = Math.floor(x / n);
      const v = lumaAt(d, i) * (pal.length - 1), k = clamp(Math.floor(v + BAYER[by % 8][bx % 8]), 0, pal.length - 1);
      put(i, pal[k]);
    }
  } else if (op === "halftone") {
    const n = Math.max(3, cell || 8), ink = colors[0] || hex("#111111"), paper = colors[1] || hex("#f4f1ea");
    const ang = Math.PI / 4, ca = Math.cos(ang), sa = Math.sin(ang), sums = new Map();
    const key = (u, v) => `${Math.floor(u / n)},${Math.floor(v / n)}`;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const u = x * ca + y * sa, v = -x * sa + y * ca, k = key(u, v), i = (y * w + x) * 4;
      let s = sums.get(k); if (!s) sums.set(k, (s = { l: 0, c: 0 })); s.l += lumaAt(d, i); s.c++;
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const u = x * ca + y * sa, v = -x * sa + y * ca, s = sums.get(key(u, v)), mean = s.l / s.c;
      const cu = (Math.floor(u / n) + 0.5) * n, cv = (Math.floor(v / n) + 0.5) * n;
      const r = n * 0.74 * Math.sqrt(1 - mean), dist = Math.hypot(u - cu, v - cv), cov = clamp(r - dist + 0.5, 0, 1);
      put((y * w + x) * 4, [0, 1, 2].map((k2) => paper[k2] + (ink[k2] - paper[k2]) * cov));
    }
  } else fail(`unknown --op "${op}": ${OPS.join(" | ")}`);
  return { w, h, data: o };
}
function runTreat(inp, outp, op, colors, cell, extra = {}) {
  const img = readImage(inp);
  const res = treat(img, op, { colors: colors.map((c) => (Array.isArray(c) ? c : hex(c))), cell: Number(cell) || 0, dither: Number(extra.dither) || 0, grain: Number(extra.grain) || 0, seed: Number(extra.seed) || 1 });
  writePng(outp, res);
  return { width: res.w, height: res.h };
}

// ------------------------------------------------------------------ cutout
function floodCutout(img, tol, pad) {
  const { w, h, data: d } = img;
  const border = [];
  for (let x = 0; x < w; x++) { border.push((x) * 4, ((h - 1) * w + x) * 4); }
  for (let y = 1; y < h - 1; y++) { border.push((y * w) * 4, (y * w + w - 1) * 4); }
  const opaque = border.filter((i) => d[i + 3] > 200);
  if (!opaque.length) return { ok: false, reason: "the picture's edge is already transparent" };
  const med = (k) => { const v = opaque.map((i) => d[i + k]).sort((a, b) => a - b); return v[v.length >> 1]; };
  const bg = [med(0), med(1), med(2)];
  const dist = (i) => Math.hypot(d[i] - bg[0], d[i + 1] - bg[1], d[i + 2] - bg[2]);
  const spread = opaque.reduce((s, i) => s + dist(i), 0) / opaque.length;
  if (spread > tol) return { ok: false, reason: `the ground is not plain (its edge varies by ${spread.toFixed(0)} colour steps on average; tolerance ${tol})` };
  const gone = new Uint8Array(w * h), stack = [];
  const push = (x, y) => { const k = y * w + x; if (!gone[k] && dist(k * 4) <= tol) { gone[k] = 1; stack.push(k); } };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (stack.length) {
    const k = stack.pop(), x = k % w, y = (k / w) | 0;
    if (x > 0) push(x - 1, y); if (x < w - 1) push(x + 1, y); if (y > 0) push(x, y - 1); if (y < h - 1) push(x, y + 1);
  }
  const o = new Uint8ClampedArray(d);
  let removed = 0;
  for (let k = 0; k < w * h; k++) {
    if (gone[k]) { o[k * 4 + 3] = 0; removed++; continue; }
    // feather the pixels that touch the removed ground and are close to its colour
    const x = k % w, y = (k / w) | 0;
    const nb = (x > 0 && gone[k - 1]) || (x < w - 1 && gone[k + 1]) || (y > 0 && gone[k - w]) || (y < h - 1 && gone[k + w]);
    if (nb) { const e = dist(k * 4); if (e < tol * 1.8) o[k * 4 + 3] = Math.round(d[k * 4 + 3] * clamp((e - tol) / (tol * 0.8), 0.15, 1)); }
  }
  return { ok: true, img: { w, h, data: o }, removed_pct: Math.round((removed / (w * h)) * 100), ground: bg };
}
function trimToContent(img, pad = 0) {
  const { w, h, data: d } = img;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return null;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
  const nw = x1 - x0 + 1, nh = y1 - y0 + 1, o = new Uint8ClampedArray(nw * nh * 4);
  for (let y = 0; y < nh; y++) o.set(d.subarray(((y + y0) * w + x0) * 4, ((y + y0) * w + x0 + nw) * 4), y * nw * 4);
  return { w: nw, h: nh, data: o };
}
function hasAlpha(p) {
  try { const img = readImage(p); for (let i = 3; i < img.data.length; i += 4) if (img.data[i] < 250) return true; } catch { /* no */ }
  return false;
}
function cutout(inp, outp, { tol = 40, pad = 0 } = {}) {
  const forceFlood = /^flood$/i.test(process.env.RASANAI_CUTOUT || "");
  let method = null, tried = null;
  if (!forceFlood) {
    const tmp = outp + ".u2net.png";
    const r = spawnSync("npx", ["--yes", "hyperframes", "remove-background", inp, "-o", tmp], { encoding: "utf8", timeout: 300000 });
    if (r.status === 0 && exists(tmp) && hasAlpha(tmp)) {
      const t = trimToContent(readImage(tmp), pad);
      if (t) { writePng(outp, t); method = "u2net"; }
    } else tried = `hyperframes remove-background did not produce a cut-out (${String(r.stderr || r.error || "").trim().split("\n").pop().slice(0, 120)})`;
    fs.rmSync(tmp, { force: true });
  }
  let removed = null;
  if (!method) {
    const f = floodCutout(readImage(inp), tol, pad);
    if (!f.ok) fail(`cutout: ${f.reason}${tried ? `; ${tried}` : ""}. Re-make the picture on a plain flat ground, or install the background-removal model (npx hyperframes remove-background --help)`, 2);
    const t = trimToContent(f.img, pad);
    if (!t) fail("cutout: nothing is left after removing the ground", 2);
    writePng(outp, t);
    method = "flood-fill"; removed = f.removed_pct;
  }
  const d = dims(outp);
  return { method, ...(removed != null ? { removed_pct: removed } : {}), ...(tried ? { note: tried } : {}), ...d };
}

// ------------------------------------------------------------------ halftone paper collage (library/styles/halftone-collage.md)
// A picture becomes one piece of the gbro-style collage: cut out (its own alpha, else cutout()), a greyscale halftone in the ink
// over the cardstock colour (the screen is multiplied onto the card, so the card shows through the paper between the dots), a 2 px cream
// keyline (the knife's highlight; width follows the picture: `keyline`), paper grain on the piece, a hand-set tilt under 2 degrees
// (seeded, never dead straight), and one soft shadow down and to the right. The result is a transparent PNG larger than the input by
// the shadow's room. `field` (a hex) flattens it onto that colour with a margin, for a preview or a poster. Our own code; the
// look's numbers come from the two gbro skills (MIT).
function chamferOutside(mask, w, h) { // distance (px) from each pixel to the nearest inside pixel; 0 inside
  const d = new Float32Array(w * h), INF = 1e9;
  for (let i = 0; i < d.length; i++) d[i] = mask[i] ? 0 : INF;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; let v = d[i];
    if (x > 0) v = Math.min(v, d[i - 1] + 1);
    if (y > 0) { v = Math.min(v, d[i - w] + 1); if (x > 0) v = Math.min(v, d[i - w - 1] + 1.414); if (x < w - 1) v = Math.min(v, d[i - w + 1] + 1.414); }
    d[i] = v;
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x; let v = d[i];
    if (x < w - 1) v = Math.min(v, d[i + 1] + 1);
    if (y < h - 1) { v = Math.min(v, d[i + w] + 1); if (x < w - 1) v = Math.min(v, d[i + w + 1] + 1.414); if (x > 0) v = Math.min(v, d[i + w - 1] + 1.414); }
    d[i] = v;
  }
  return d;
}
function boxBlurAlpha(a, w, h, r) { // three box passes per axis: a close match to a gaussian of sigma ~ r / 1.2
  r = Math.max(1, Math.round(r));
  const pass = (src, dst, horizontal) => {
    const n = horizontal ? w : h, lines = horizontal ? h : w, step = horizontal ? 1 : w, lstep = horizontal ? w : 1, div = 2 * r + 1;
    for (let l = 0; l < lines; l++) {
      const base = l * lstep, at = (i) => src[base + Math.min(n - 1, Math.max(0, i)) * step];
      let s = 0;
      for (let i = -r; i <= r; i++) s += at(i);
      for (let i = 0; i < n; i++) { dst[base + i * step] = s / div; s += at(i + r + 1) - at(i - r); }
    }
  };
  let cur = a;
  for (let p = 0; p < 3; p++) { const t = new Float32Array(w * h), o = new Float32Array(w * h); pass(cur, t, true); pass(t, o, false); cur = o; }
  return cur;
}
function halftoneCollage(inp, outp, o = {}) {
  let img = readImage(inp), method = "own alpha";
  let hasA = false;
  for (let i = 3; i < img.data.length; i += 4) if (img.data[i] < 250) { hasA = true; break; }
  if (!hasA && !o.noCutout) {
    const tmp = outp + ".cut.png"; const c = cutout(inp, tmp); img = readImage(tmp); fs.rmSync(tmp, { force: true }); method = c.method;
  }
  const scale = Math.max(1, Math.max(img.w, img.h) / 1080);
  const cell = Math.max(3, Number(o.cell) || Math.round(4 * scale)), key = Math.max(1.5, Number(o.keyline) || 2 * scale);
  const card = hex(o.card || "#f6f1e4"), ink = hex(o.ink || "#1b1a18"), cream = hex("#fcf8ed"), seed = Number(o.seed) || 1;
  const tilt = o.tilt != null && o.tilt !== "" ? Number(o.tilt) : (hashPx(7, seed) < 0.5 ? -1 : 1) * (0.3 + hashPx(11, seed) * 1.1); // 0.3 to 1.4 degrees, either way, seeded
  const blur = 7 * scale, offx = 5 * scale, offy = 8 * scale, M = Math.ceil(key + Math.max(offx, offy) + blur * 2.2 + 4);
  const W = img.w + 2 * M, H = img.h + 2 * M;
  // body: greyscale halftone, ink dots on the card colour, alpha kept
  const ht = treat(img, "halftone", { colors: [ink, card], cell });
  const body = new Uint8ClampedArray(W * H * 4), mask = new Uint8Array(W * H);
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) { const s = (y * img.w + x) * 4, d = ((y + M) * W + x + M) * 4; body.set(ht.data.subarray(s, s + 4), d); if (ht.data[s + 3] > 127) mask[(y + M) * W + x + M] = 1; }
  const dist = chamferOutside(mask, W, H), pa = new Float32Array(W * H), pc = new Float32Array(W * H * 3);
  for (let i = 0; i < W * H; i++) {
    const oa = body[i * 4 + 3] / 255, ka = mask[i] ? 1 : Math.max(0, Math.min(1, key - dist[i] + 0.5));
    pa[i] = Math.max(oa, ka);
    for (let c = 0; c < 3; c++) pc[i * 3 + c] = pa[i] > 0 ? (body[i * 4 + c] * oa + cream[c] * (pa[i] - oa)) / pa[i] : 0; // the keyline fills what the body does not
  }
  // paper grain on the piece: fine per-pixel plus a coarser fibre, the same on every channel
  const g = (Number(o.grain) || 0.03) * 255 * 2;
  for (let i = 0; i < W * H; i++) if (pa[i] > 0) { const n = (hashPx(i, seed + 5) + hashPx(i, seed + 6) - 1) * g + (hashPx(((i % W) >> 2) + (((i / W) | 0) >> 2) * 7919, seed + 9) - 0.5) * g * 0.6; for (let c = 0; c < 3; c++) pc[i * 3 + c] = clamp(pc[i * 3 + c] + n); }
  // tilt: bilinear, premultiplied, about the centre
  let qa = pa, qc = pc;
  if (Math.abs(tilt) > 0.001) {
    qa = new Float32Array(W * H); qc = new Float32Array(W * H * 3);
    const th = (-tilt * Math.PI) / 180, ct = Math.cos(th), st = Math.sin(th), cx = W / 2, cy = H / 2;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const sx = ct * (x - cx) - st * (y - cy) + cx, sy = st * (x - cx) + ct * (y - cy) + cy;
      if (sx < 0 || sy < 0 || sx >= W - 1 || sy >= H - 1) continue;
      const x0 = sx | 0, y0 = sy | 0, fx = sx - x0, fy = sy - y0, i00 = y0 * W + x0, w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
      const a = pa[i00] * w00 + pa[i00 + 1] * w10 + pa[i00 + W] * w01 + pa[i00 + W + 1] * w11;
      qa[y * W + x] = a;
      if (a > 0) for (let c = 0; c < 3; c++) qc[(y * W + x) * 3 + c] = (pc[i00 * 3 + c] * pa[i00] * w00 + pc[(i00 + 1) * 3 + c] * pa[i00 + 1] * w10 + pc[(i00 + W) * 3 + c] * pa[i00 + W] * w01 + pc[(i00 + W + 1) * 3 + c] * pa[i00 + W + 1] * w11) / a;
    }
  }
  // one soft shadow: the piece's alpha, blurred, moved down and right, a warm dark at 32%
  const sh = boxBlurAlpha(qa, W, H, blur), so = Math.max(0, Math.min(1, Number(o.shadow == null ? 0.32 : o.shadow))), sc = [44, 30, 18];
  const dx = Math.round(offx), dy = Math.round(offy), out = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, sxp = x - dx, syp = y - dy, sa = sxp >= 0 && syp >= 0 && sxp < W && syp < H ? sh[syp * W + sxp] * so : 0, a = qa[i], oa = a + sa * (1 - a);
    out[i * 4 + 3] = Math.round(oa * 255);
    if (oa > 0) for (let c = 0; c < 3; c++) out[i * 4 + c] = Math.round((qc[i * 3 + c] * a + sc[c] * sa * (1 - a)) / oa);
  }
  let res = { w: W, h: H, data: out };
  if (o.field) { // flatten on a flat colour field with a quiet fibre, a margin of a quarter of the piece around it
    const f = hex(o.field), mx = Math.round(W * 0.25), my = Math.round(H * 0.25), FW = W + 2 * mx, FH = H + 2 * my, fd = new Uint8ClampedArray(FW * FH * 4);
    for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
      const i = (y * FW + x) * 4, sx = x - mx, sy = y - my, s = sx >= 0 && sy >= 0 && sx < W && sy < H ? (sy * W + sx) * 4 : -1, a = s >= 0 ? out[s + 3] / 255 : 0, n = (hashPx(y * FW + x, seed + 13) - 0.5) * 10;
      for (let c = 0; c < 3; c++) fd[i + c] = clamp((s >= 0 ? out[s + c] * a : 0) + (f[c] + n) * (1 - a));
      fd[i + 3] = 255;
    }
    res = { w: FW, h: FH, data: fd };
  }
  writePng(outp, res);
  return { width: res.w, height: res.h, cell, keyline_px: Math.round(key * 10) / 10, tilt_deg: Math.round(tilt * 100) / 100, cutout: method, field: o.field || null };
}

// ------------------------------------------------------------------ trace (vendored imagetracerjs, the Unlicense)
function trace(inp, outp, { colors = 8, lineart = false, max = 900 }) {
  const ImageTracer = createRequire(import.meta.url)(path.join(HERE, "vendor", "imagetracer.js"));
  const img = readImage(inp, max);
  const { w, h, data } = img;
  let opts, ink = "#111111";
  if (lineart) {
    // grayscale, Otsu threshold, pure black on white (transparent counts as white)
    const g = new Uint8Array(w * h), hist = new Array(256).fill(0);
    for (let k = 0; k < w * h; k++) { const i = k * 4, a = data[i + 3] / 255; const v = Math.round((lumaAt(data, i) * 255) * a + 255 * (1 - a)); g[k] = v; hist[v]++; }
    let sum = 0; for (let t = 0; t < 256; t++) sum += t * hist[t];
    let wB = 0, sB = 0, best = 0, thr = 128;
    for (let t = 0; t < 256; t++) { wB += hist[t]; if (!wB) continue; const wF = w * h - wB; if (!wF) break; sB += t * hist[t]; const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) ** 2; if (v > best) { best = v; thr = t; } }
    for (let k = 0; k < w * h; k++) { const v = g[k] <= thr ? 0 : 255; data[k * 4] = data[k * 4 + 1] = data[k * 4 + 2] = v; data[k * 4 + 3] = 255; }
    opts = { numberofcolors: 2, colorsampling: 0, pal: [{ r: 0, g: 0, b: 0, a: 255 }, { r: 255, g: 255, b: 255, a: 255 }], ltres: 1, qtres: 1, pathomit: 12, blurradius: 0, strokewidth: 0, roundcoords: 1, viewbox: true, desc: false };
  } else {
    opts = { numberofcolors: Math.max(2, Number(colors) || 8), colorquantcycles: 3, ltres: 1, qtres: 1, pathomit: 16, blurradius: 0, strokewidth: 0, roundcoords: 1, viewbox: true, desc: false };
  }
  let svg = ImageTracer.imagedataToSVG({ width: w, height: h, data }, opts);
  // one <path> per shape, with an id; the paper-white shapes of a line trace are dropped; a line trace becomes outlines (stroke, no fill) so it can draw on
  let n = 0;
  svg = svg.replace(/<path\b[^>]*?\/>/g, (m) => {
    const fill = (m.match(/fill="([^"]*)"/) || [])[1] || "";
    const d = (m.match(/\sd="([^"]*)"/) || [])[1];
    if (!d) return "";
    if (lineart) {
      if (/rgb\(\s*255\s*,\s*255\s*,\s*255\s*\)/.test(fill) || /rgb\(\s*0\s*,\s*0\s*,\s*0\s*\)/.test(fill) === false) return "";
      return `<path id="t${++n}" d="${d}" fill="none" stroke="${ink}" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/>`;
    }
    const op = (m.match(/opacity="([^"]*)"/) || [])[1];
    return `<path id="t${++n}" d="${d}" fill="${fill}"${op && op !== "1" ? ` opacity="${op}"` : ""}/>`;
  });
  if (!/xmlns=/.test(svg)) svg = svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
  if (!n) fail("trace found no shapes (is the picture blank?)", 2);
  fs.mkdirSync(path.dirname(outp), { recursive: true });
  fs.writeFileSync(outp, svg + "\n");
  return { paths: n, width: w, height: h, bytes: svg.length };
}

// ------------------------------------------------------------------ hand (vendored Hershey single-stroke fonts)
function hand(text, outp, { font = "script", size = 120, weight = 0, color = "#111111", spacing = 0 }) {
  const f = jsonMaybe(path.join(HERE, "vendor", "hershey", `${font === "simplex" ? "simplex" : "script"}.json`));
  if (!f) fail(`font "${font}" is missing (vendor/hershey/${font}.json); fonts: script | simplex`);
  const s = size / f.height, sw = weight || Math.max(1.5, size / 16);
  const paths = [];
  let y0 = 0, minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, skipped = 0, glyphN = 0;
  const lines = String(text).split(/\\n|\n/);
  for (const line of lines) {
    let x0 = 0;
    for (const ch of line) {
      if (ch === " ") { x0 += f.space * s + spacing; continue; }
      const g = f.glyphs[ch];
      if (!g) { skipped++; continue; }
      glyphN++;
      for (const sub of g.d.split("M").filter((t) => t.trim())) {
        const pts = sub.replace(/L/g, " ").trim().split(/\s+/).map((p) => p.split(",").map(Number)).filter((p) => p.length === 2 && p.every(Number.isFinite));
        if (!pts.length) continue;
        const pp = pts.map(([x, y]) => [+(x0 + x * s).toFixed(2), +(y0 + y * s).toFixed(2)]);
        if (pp.length === 1) pp.push([pp[0][0] + 0.01, pp[0][1]]); // a dot
        for (const [x, y] of pp) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
        paths.push({ glyph: ch, d: "M" + pp.map((p) => p.join(" ")).join(" L") });
      }
      x0 += g.o * s + spacing;
    }
    y0 += size * 1.35;
  }
  if (!paths.length) fail("hand: no drawable characters in --text");
  const m = Math.ceil(sw);
  const vb = [Math.floor(minX - m), Math.floor(minY - m), Math.ceil(maxX - minX + 2 * m), Math.ceil(maxY - minY + 2 * m)];
  const body = paths.map((p, i) => `  <path id="s${String(i + 1).padStart(3, "0")}" data-glyph="${p.glyph.replace(/"/g, "&quot;").replace(/&/g, "&amp;").replace(/</g, "&lt;")}" d="${p.d}"/>`).join("\n");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.join(" ")}" width="${vb[2]}" height="${vb[3]}" fill="none" stroke="${color}" stroke-width="${+sw.toFixed(2)}" stroke-linecap="round" stroke-linejoin="round">\n${body}\n</svg>\n`;
  fs.mkdirSync(path.dirname(outp), { recursive: true });
  fs.writeFileSync(outp, svg);
  return { strokes: paths.length, glyphs: glyphN, skipped, width: vb[2], height: vb[3], font: f.name };
}

// ------------------------------------------------------------------ abstract plates
// A plate is atmosphere, not a subject: flowing organic shapes in soft gradients, in the film's own colours only.
// Both engines end in the same lock: the picture's luma runs along the ordered palette ramp (gradient-map, dithered, grain).
const PLATE_VARIANTS = ["fold", "vortex", "horizon", "ribbon"];
const PLATE_SIZES = { "16:9": [1920, 1080], "9:16": [1080, 1920], "1:1": [1440, 1440], "4:5": [1080, 1350] };
const PLATE_SHAPES = {
  fold: "One large S-curve fold sweeps through the frame: a deep lobe of colour on one side lifting to a bright lit edge, a quieter field on the other with a soft dark hollow",
  vortex: "A soft vortex: colour and light turn slowly around a deep, soft-edged core, a few broad arms spiralling in",
  horizon: "A horizon glow: the curved rim of a vast soft body low in the frame, a thin bright edge of light along it and a haze of colour rising above",
  ribbon: "One broad ribbon of colour crosses the frame on a diagonal with a single turn in it, lit along one edge and shaded along the other, a fainter ribbon behind it",
};
const toHex = (c) => "#" + c.map((v) => Math.round(clamp(v)).toString(16).padStart(2, "0")).join("");
const lumOf = (c) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
function hslOf([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return { h: -1, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60; if (h < 0) h += 360;
  return { h, s, l };
}
// the ramp: the palette as one ordered path the gradient map runs along. A dark ground starts it (light grows out of the dark);
// a light ground sits in the middle between the warm and the cool colours (Kinso: coral, peach, cream, sage), or ends it.
function plateRamp(palette, ground) {
  const cols = [...new Set(palette.map((s) => toHex(hex(s))))];
  if (cols.length < 2) fail("a plate needs 2+ palette colours (--palette c1,c2,..)");
  const g = ground ? toHex(hex(ground)) : cols.slice().sort((a, b) => lumOf(hex(b)) - lumOf(hex(a)))[0];
  const rest = cols.filter((c) => c !== g), L = (c) => lumOf(hex(c));
  if (L(g) < 0.35) return [g, ...rest.sort((a, b) => L(a) - L(b))];
  const warm = rest.filter((c) => { const { h, s } = hslOf(hex(c)); return s > 0.12 && (h < 75 || h >= 300); });
  const cool = rest.filter((c) => !warm.includes(c));
  if (warm.length && cool.length) return [...warm.sort((a, b) => L(a) - L(b)), g, ...cool.sort((a, b) => L(b) - L(a))];
  return [...rest.sort((a, b) => L(a) - L(b)), g];
}
function colourWord(c) {
  const { h, s, l } = hslOf(hex(c));
  const [r0, , b0] = hex(c), chroma = (Math.max(...hex(c)) - Math.min(...hex(c))) / 255;
  if (chroma < 0.07 || h < 0) return l > 0.88 ? (r0 > b0 + 4 ? "warm white" : r0 + 4 < b0 ? "cool white" : "white") : l < 0.12 ? "near-black" : l > 0.6 ? "pale grey" : "grey";
  const names = [[10, "red"], [22, "coral"], [38, "orange"], [52, "amber"], [68, "yellow"], [95, "lime"], [150, "green"], [178, "sage teal"], [200, "cyan"], [228, "blue"], [255, "indigo"], [282, "violet"], [318, "magenta"], [345, "pink"], [361, "red"]];
  let n = names.find(([lim]) => h < lim)[1];
  if (n === "coral" && l > 0.72) n = "peach";
  if (n === "sage teal" && s < 0.35) n = "sage";
  const tone = l > 0.85 ? "pale " : l > 0.7 ? "soft " : l < 0.12 ? "near-black " : l < 0.3 ? "deep " : "";
  return `${tone}${s < 0.3 && l >= 0.12 && l <= 0.85 ? "dusty " : ""}${n}`;
}
function plateRecipe({ ramp, variant = "fold", aspect = "16:9" }) {
  const g = ramp[0] && lumOf(hex(ramp[0])) < 0.35 ? ramp[0] : ramp.slice().sort((a, b) => lumOf(hex(b)) - lumOf(hex(a)))[0];
  const dark = lumOf(hex(g)) < 0.35, words = [...new Set(ramp.map(colourWord))];
  const portrait = /^9:16|4:5$/.test(aspect);
  return [
    "Abstract visual, flowing organic shapes, soft gradients, minimal composition.",
    `${PLATE_SHAPES[variant] || PLATE_SHAPES.fold}.`,
    `Only these colours, blended as smooth luminous gradients: ${words.join(", ")}, on a ${colourWord(g)} ground${dark ? ", the light glowing out of the dark" : ", light and airy"}.`,
    "Silky and softly lit, like folded light-catching fabric or liquid glass seen very close: a gentle highlight along each fold, deep soft shadows between, smooth tonal transitions, a whisper of fine grain.",
    `${portrait ? "A vertical composition, the flow running top to bottom" : "A wide composition"}, with one calm open area where type can sit.`,
    "No text, no letters, no numbers, no objects, no logos, no people, no UI, no frames or borders, no watermark, no hard geometric shapes.",
  ].join(" ");
}
// the procedural plate: RasanCamera.plate draws the grey field headless (software GL, deterministic), then the ramp maps it
async function renderProceduralPlate({ out: outp, ramp, ground, variant, width, height, seed, grain, warp, bend, calm, flip }) {
  const { launch } = await import("./lib/cdp.mjs");
  if (!process.env.RASANAI_GL) process.env.RASANAI_GL = "cpu";
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rasan-plate-"));
  const rt = path.join(HERE, "..", "runtime", "rasan-camera.js");
  const o = { width, height, ramp, ground: ground || null, variant, seed, grey: true, ...(warp != null ? { warp } : {}), ...(bend != null ? { bend } : {}), ...(calm ? { calm } : {}), ...(flip ? { flip: true } : {}) };
  fs.writeFileSync(path.join(tmp, "plate.html"), `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#000;overflow:hidden}</style></head><body><div id="h" style="position:relative;width:${width}px;height:${height}px"></div><script src="${pathToFileURL(rt).href}"></script><script>window.__plate = RasanCamera.plate("#h", ${JSON.stringify(o)});</script></body></html>`);
  const b = await launch({ width, height });
  let png;
  try {
    await b.open(pathToFileURL(path.join(tmp, "plate.html")).href);
    await b.eval("new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(r); }); })", { await: true });
    const bad = b.logs.filter((l) => /exception|error/i.test(l));
    if (bad.length) throw new Error(bad.join(" | ").slice(0, 300));
    png = await b.screenshot();
  } finally { await b.close(); }
  const field = path.join(tmp, "field.png");
  fs.writeFileSync(field, png);
  const img = readImage(field);
  const res = treat(img, "gradient-map", { colors: ramp.map(hex), dither: 1.5, grain, seed });
  writePng(outp, res);
  fs.rmSync(tmp, { recursive: true, force: true });
  return { width: res.w, height: res.h };
}
async function plateCmd(onlyRecipe = false) {
  const variant = str(args.variant) || "fold", aspect = str(args.aspect) || "16:9";
  if (!PLATE_VARIANTS.includes(variant)) fail(`--variant must be one of ${PLATE_VARIANTS.join(", ")}`);
  const list = (v) => str(v).split(",").map((s) => s.trim()).filter(Boolean);
  const ground = str(args.ground) ? toHex(hex(str(args.ground))) : null;
  const ramp = str(args.ramp) ? list(args.ramp).map((c) => toHex(hex(c))) : plateRamp(list(args.palette), ground);
  if (ramp.length < 2) fail("--palette c1,c2,.. (2+ colours) or --ramp c1,c2,.. required");
  const prompt = plateRecipe({ ramp, variant, aspect });
  if (onlyRecipe) { out({ ok: true, variant, aspect, ramp, ground: ground || null, prompt }); return; }
  const outp = abs(str(args.out) || fail("--out <png> required"));
  let [width, height] = PLATE_SIZES[aspect] || (/^\d+x\d+$/.test(aspect) ? aspect.split("x").map(Number) : fail(`--aspect must be one of ${Object.keys(PLATE_SIZES).join(", ")} or WxH`));
  if (Number(args.width) > 0) { const k = Number(args.width) / width; width = Math.round(width * k); height = Math.round(height * k); }
  const seed = Number(args.seed) || 1, grain = args.grain !== undefined ? Number(args.grain) || 0 : 0.01;
  const engine = str(args.engine) || "auto";
  let used = "procedural", note = null;
  if (engine === "imagegen" || engine === "auto") {
    const ig = imagegenState();
    if (ig.state === "ready") {
      const raw = outp.replace(/\.png$/i, "") + ".gen.png";
      const r = spawnSync(process.execPath, [path.join(HERE, "imagegen.mjs"), "generate", "--prompt", prompt, "--out", raw, "--aspect", aspect, ...(args.force ? ["--force"] : [])], { encoding: "utf8", timeout: 1200000 });
      if (r.status === 0 && exists(raw)) {
        const img = readImage(raw);
        writePng(outp, treat(img, "gradient-map", { colors: ramp.map(hex), dither: 1.5, grain, seed }));
        used = "imagegen";
      } else { note = `image generation failed (${String(r.stderr || "").trim().split("\n").pop().slice(0, 140)}); drew the procedural plate`; noteDowngrade({ run: args.run, what: "image generation", instead: "a procedural plate", why: note.slice(0, 160), impact: "the plate is abstract, not a generated picture" }); }
    } else if (engine === "auto") noteDowngrade({ run: args.run, what: "image generation", instead: "a procedural plate", why: `${ig.state}: ${ig.reason}`, impact: "the plate is abstract, not a generated picture" });
    else if (engine === "imagegen") fail(`image generation is unavailable (${ig.state}: ${ig.reason}); use --engine procedural`, 3);
  }
  let d = { width, height };
  if (used === "procedural") d = await renderProceduralPlate({ out: outp, ramp, ground, variant, width, height, seed, grain, warp: args.warp !== undefined ? Number(args.warp) : null, bend: args.bend !== undefined ? Number(args.bend) : null, calm: Number(args.calm) || 0, flip: !!args.flip });
  const side = { engine: used, variant, aspect, ramp, ground, seed, grain, ...(Number(args.calm) ? { calm: Number(args.calm) } : {}), ...(args.flip ? { flip: true } : {}), lock: "gradient-map", prompt, ...d, ...(note ? { note } : {}) };
  fs.writeFileSync(outp + ".json", JSON.stringify(side, null, 2) + "\n");
  out({ ok: true, out: outp, ...side });
}

// ------------------------------------------------------------------ the run: plan, make, check
const runDir = () => abs(str(args.run) || fail("--run <run dir> required"));
const ART = (run, ...p) => path.join(run, "art", ...p);
const DRAWN = /\b(draw(?:n|ing)?|sketch\w*|illustrat\w*|line[- ]?art|outline|silhouette|diagram|x[- ]?ray|engrav\w*|hand[- ]?(?:drawn|written|lettered)|handwrit\w*|signature|icons?|pictogram|logo ?mark|glyph|ink|eye|iris|flower|lily|botanical|specimen)\b/i;
const PLATE_RE = /\b(abstract (?:plate|field|ground|render)|gradient field|colou?r field|ground plate|flow(?:ing)? ground|zoom through (?:a|the) plate)\b/i;
const grammarOf = (run) => {
  const g = jsonMaybe(path.join(run, "look", "grammar.json"));
  return g && (g.id || g.grammar) ? String(g.id || g.grammar) : (jsonMaybe(path.join(run, "motion", "score.json")) || {}).grammar || null;
};
function styleFrom(run, grammar) {
  let md = ""; try { md = fs.readFileSync(path.join(run, "look", "DESIGN.md"), "utf8"); } catch { /* none */ }
  const imagery = ((md.split(/^##\s+Imagery\s*$/mi)[1] || "").split(/^##\s/m)[0] || "").trim().replace(/\s+/g, " ");
  const palette = [...new Set((md.match(/#[0-9a-fA-F]{6}\b/g) || []).map((s) => s.toLowerCase()))].slice(0, 6);
  const pixel = grammar === "pixel-collage";
  return {
    palette, line_weight: pixel ? "hard 1-pixel edges on a 32x32 grid, no anti-aliased curves" : "one consistent line weight (about 2% of the picture's height), round caps",
    rendering: imagery ? imagery.slice(0, 280) : pixel ? "flat pixel-art icons, limited palette, no gradients" : "flat vector illustration, no gradients, no outlines glow, no 3D render look",
    lighting: pixel ? "none (flat colour)" : "soft, even studio light with one gentle shadow side; no dramatic rim light",
    avoid: "stock-photo staging, glossy 3D renders, rainbow gradients, extra text or logos in the picture, watermarks, six-fingered hands",
    ...(palette.length ? {} : { todo: "art-director: no palette found in look/DESIGN.md; name the film's colours" }),
  };
}
function plan() {
  const run = runDir(), file = ART(run, "plan.json");
  if (exists(file) && !args.force) { out({ ok: true, plan: file, kept: true, note: "an existing plan is kept (use --force to rebuild it)" }); return; }
  const chosen = jsonMaybe(path.join(run, "story", "chosen.json"));
  if (!chosen || !Array.isArray(chosen.beats)) fail(`no chosen script at ${path.join(run, "story", "chosen.json")} (the plan is derived from its shows)`);
  const grammar = grammarOf(run), pixel = grammar === "pixel-collage";
  const assets = [], seen = new Set();
  chosen.beats.forEach((b, bi) => {
    const beatId = String(b.id || b.name || `b${bi + 1}`);
    for (const r of Array.isArray(b.shows) ? b.shows : []) {
      if (!r || typeof r !== "object") continue;
      const bf = norm(r.built_from), text = `${r.show || ""} ${r.line || ""}`;
      const art = bf === "object" || bf === "photo";
      const drawn = DRAWN.test(String(r.show || ""));
      const plate = PLATE_RE.test(String(r.show || ""));
      if (!art && !drawn && !plate) continue;
      let kind = plate ? "abstract" : bf === "photo" ? "photo" : /handwrit|signature|hand[- ]?lettered/i.test(text) ? "handwriting" : /line[- ]?art|x[- ]?ray|outline|engrav/i.test(text) ? "lineart" : /\bicons?\b|pictogram|pixel/i.test(text) || pixel && bf === "object" ? "icon" : /texture|swatch|paper (?:ground|texture)|grain(?:y)? (?:ground|plate|texture)/i.test(text) ? "texture" : "illustration";
      let id = slug(`${beatId}-${r.line || kind}`), n = 2;
      while (seen.has(id)) id = `${slug(`${beatId}-${r.line || kind}`)}-${n++}`;
      seen.add(id);
      const treatments = [];
      if (kind === "photo" && (pixel || /cut[- ]?out|gradient|grade|duotone/i.test(text))) treatments.push("cutout");
      if (/gradient[- ]?map|hot grade/i.test(text) || (pixel && kind === "photo")) treatments.push("gradient-map");
      else if (/duotone/i.test(text)) treatments.push("duotone");
      if (/halftone[- ]?(paper[- ]?)?collage|paper collage|cut-?outs? with (a )?cream/i.test(text)) treatments.push("halftone-collage");
      else if (/halftone/i.test(text)) treatments.push("halftone");
      if (/x[- ]?ray/i.test(text)) treatments.push("xray");
      const row = { id, kind, prompt: kind === "handwriting" ? String(r.line || "").trim() : `${String(r.show || r.line).trim().replace(/\s+/g, " ").slice(0, 320)}`, treatments, used_by: [`${beatId}: ${String(r.line || "").trim()}`], from: { beat: bi + 1, built_from: bf || null } };
      if (kind === "handwriting") row.text = row.prompt;
      if (kind === "abstract") Object.assign(row, { variant: (String(r.show).match(/\b(fold|vortex|horizon|ribbon)\b/i) || [, "fold"])[1].toLowerCase(), aspect: "16:9", treatments: [] });
      assets.push(row);
    }
  });
  // an atmospheric film (the brand film's measured finish route) gets ground plates as a standard asset: a calm ground and
  // a plate to zoom through. Never on the graphic route (the brand's films are flat), unless a show asks for a colour field.
  const route = (() => { try { const m = fs.readFileSync(path.join(run, "brand-film", "FILM-STYLE.md"), "utf8").match(/Route:\s*(atmospheric|graphic)/i); if (m) return m[1].toLowerCase(); } catch { /* none */ } return ((jsonMaybe(path.join(run, "brand-film", "FILM-STYLE.json")) || {}).finish || {}).route || null; })();
  if (route === "atmospheric" && !assets.some((a) => a.kind === "abstract")) {
    assets.push({ id: "plate-ground", kind: "abstract", variant: "fold", aspect: "16:9", calm: 0.5, seed: 1, prompt: "the film's living ground (flowGround): a calm abstract plate in the palette", treatments: [], used_by: ["film: the ground under every beat (cam.flowGround)"], from: { route } });
    assets.push({ id: "plate-through", kind: "abstract", variant: "vortex", aspect: "16:9", seed: 2, prompt: "a plate to zoom through between beats (plateTransition)", treatments: [], used_by: ["film: the transition into the turn (cam.plateTransition)"], from: { route } });
  }
  const p = { version: 1, grammar, style: styleFrom(run, grammar), assets, note: "the art-director agent fills and edits this: one prompt per picture, one style for all; kinds: " + KINDS.join(" | ") };
  writeJSON(file, p);
  out({ ok: true, plan: file, assets: assets.length, kinds: assets.reduce((m, a) => ((m[a.kind] = (m[a.kind] || 0) + 1), m), {}), style_todo: !!p.style.todo });
}
function stylePrompt(style) {
  const bits = [];
  if (style.rendering) bits.push(`rendering: ${style.rendering}`);
  if (style.line_weight) bits.push(`line weight: ${style.line_weight}`);
  if (style.lighting) bits.push(`lighting: ${style.lighting}`);
  if (style.palette && style.palette.length) bits.push(`palette: ${style.palette.join(", ")}`);
  return bits.join("; ");
}
function imagegenState() {
  if (/^(off|0|false|no)$/i.test(process.env.RASANAI_IMAGEGEN || "")) return { state: "off", reason: "RASANAI_IMAGEGEN=off" };
  try {
    const r = spawnSync(process.execPath, [path.join(HERE, "imagegen.mjs"), "status"], { encoding: "utf8", timeout: 15000 });
    const j = JSON.parse(r.stdout || "{}");
    return { state: j.state || "unknown", reason: j.reason || "" };
  } catch { return { state: "unknown", reason: "imagegen.mjs status failed" }; }
}
const parseTreatment = (t) => { const i = String(t).indexOf(":"); return i < 0 ? { op: String(t), colors: [], cell: 0 } : { op: String(t).slice(0, i), ...(() => { const rest = String(t).slice(i + 1); const cell = (rest.match(/cell=(\d+)/) || [])[1]; return { colors: rest.replace(/cell=\d+/, "").split(",").map((s) => s.trim()).filter(Boolean), cell: cell ? +cell : 0 }; })() }; };
function applyTreatments(file, row) {
  let cur = file;
  const done = [];
  row.treatments.forEach((t, i) => {
    const { op, colors, cell } = parseTreatment(t);
    const dst = file.replace(/\.png$/, `.t${i + 1}.png`);
    if (op === "cutout") { cutout(cur, dst); done.push("cutout"); }
    else if (op === "halftone-collage") { halftoneCollage(cur, dst, { card: (String(t).match(/card=(#[0-9a-f]{3,6})/i) || [])[1], seed: i + 1 }); done.push(op); }
    else if (OPS.includes(op)) { runTreat(cur, dst, op, colors.map(hex), cell); done.push(op); }
    else { err(`NOTE: ${row.id}: unknown treatment "${t}" skipped`); return; }
    cur = dst;
  });
  if (cur === file) return null;
  const final = file.replace(/\.png$/, ".treated.png");
  fs.copyFileSync(cur, final);
  for (let i = 1; i <= row.treatments.length; i++) fs.rmSync(file.replace(/\.png$/, `.t${i}.png`), { force: true });
  return { path: final, applied: done };
}
function make() {
  const run = runDir(), pf = ART(run, "plan.json"), P = jsonMaybe(pf);
  if (!P || !Array.isArray(P.assets)) fail(`no plan at ${pf}: run art.mjs plan --run <run> first`);
  const only = str(args.only) ? new Set(str(args.only).split(",").map((s) => s.trim())) : null;
  const af = ART(run, "assets.json"), prev = jsonMaybe(af) || {};
  const rows = P.assets.filter((r) => r && r.id && (!only || only.has(r.id)));
  if (only) for (const id of only) if (!rows.some((r) => r.id === id)) fail(`--only ${id}: not in plan.json`);
  for (const r of rows) { if (!KINDS.includes(r.kind)) fail(`asset ${r.id}: kind "${r.kind}" is not one of ${KINDS.join(", ")}`); r.treatments = Array.isArray(r.treatments) ? r.treatments : []; }
  const assets = new Map((prev.assets || []).map((a) => [a.id, a]));
  const todo = [];
  const ig = imagegenState();
  const ASSETS = ART(run, "assets");
  const made = [], skipped = [];
  // handwriting never needs image generation
  for (const r of rows.filter((x) => x.kind === "handwriting")) {
    const outp = path.join(ASSETS, `${r.id}.svg`);
    if (exists(outp) && !args.force) { skipped.push(r.id); continue; }
    const res = hand(r.text || r.prompt, outp, { font: r.font || "script", size: Number(r.size) || 120, color: (P.style && P.style.ink) || "#111111" });
    assets.set(r.id, { id: r.id, kind: r.kind, path: path.relative(run, outp), source: "hershey", prompt: r.text || r.prompt, strokes: res.strokes, used_by: r.used_by || [] });
    made.push(r.id);
  }
  // abstract plates: the plate recipe through imagegen when it is ready, else the procedural plate; gradient-mapped onto the
  // palette ramp either way (art.mjs plate). Never a todo for want of image generation: every film can have plates.
  if (ig.state !== "ready" && rows.some((x) => x.kind === "abstract")) noteDowngrade({ run, what: "image generation", instead: "procedural plates", why: `${ig.state}: ${ig.reason}`, impact: "abstract plates are drawn, not generated" });
  for (const r of rows.filter((x) => x.kind === "abstract")) {
    const outp = path.join(ASSETS, `${r.id}.png`);
    if (exists(outp) && !args.force) { skipped.push(r.id); continue; }
    const own = Array.isArray(r.ramp) && r.ramp.length ? r.ramp : null;
    const pal = own || (Array.isArray(r.palette) && r.palette.length ? r.palette : (P.style && P.style.palette) || []);
    if (pal.length < 2) { todo.push({ id: r.id, kind: r.kind, reason: "abstract plate: no palette (plan.style.palette, or the row's palette or ramp, needs 2+ colours)", prompt: r.prompt || "" }); continue; }
    const ground = r.ground || (P.style && P.style.ground) || "";
    const pa = ["plate", "--out", outp, own ? "--ramp" : "--palette", pal.join(","), "--variant", r.variant || "fold", "--aspect", r.aspect || "16:9", "--seed", String(r.seed || 1), "--engine", ig.state === "ready" ? "auto" : "procedural", ...(ground ? ["--ground", ground] : []), ...(r.calm ? ["--calm", String(r.calm)] : []), ...(r.flip ? ["--flip"] : []), ...(args.force ? ["--force"] : [])];
    const pr = spawnSync(process.execPath, [path.join(HERE, "art.mjs"), ...pa], { encoding: "utf8", timeout: 1500000, env: { ...process.env } });
    let pj = {}; try { pj = JSON.parse(pr.stdout); } catch { /* none */ }
    if (pr.status !== 0 || !exists(outp)) { todo.push({ id: r.id, kind: r.kind, reason: `abstract plate failed: ${String(pr.stderr || "").trim().split("\n").pop() || "no picture written"}`.slice(0, 200), prompt: pj.prompt || r.prompt || "" }); continue; }
    assets.set(r.id, { id: r.id, kind: r.kind, path: path.relative(run, outp), source: pj.engine === "imagegen" ? "imagegen" : "procedural", variant: pj.variant, ramp: pj.ramp, seed: pj.seed, prompt: pj.prompt, applied: ["gradient-map"], used_by: r.used_by || [], ...dims(outp) });
    made.push(r.id);
  }
  const gen = rows.filter((x) => GENERATED.has(x.kind));
  const needing = gen.filter((r) => args.force || !exists(path.join(ASSETS, `${r.id}.png`)));
  let anchor = (P.style && P.style.anchor) || prev.anchor || (P.assets.find((r) => GENERATED.has(r.kind)) || {}).id || null;
  if (needing.length && ig.state !== "ready") {
    err(`NOTE: image generation is unavailable (${ig.state}: ${ig.reason}); ${needing.length} asset(s) are written to the todo list, not generated`);
    noteDowngrade({ run, what: "image generation", instead: "a todo list of hand-made assets", why: `${ig.state}: ${ig.reason}`, impact: `${needing.length} picture(s) are not generated` });
    for (const r of needing) todo.push({ id: r.id, kind: r.kind, reason: `image generation unavailable (${ig.state}): ${ig.reason}`.slice(0, 200), prompt: r.prompt });
  } else if (needing.length) {
    const style = stylePrompt(P.style || {});
    const ground = "isolated on one plain flat light-grey (#e8e8e8) background, nothing else in the frame, full object visible with margin";
    const imgs = [];
    const rowOf = (id) => P.assets.find((r) => r.id === id);
    const list = needing.slice();
    const anchorRow = anchor && rowOf(anchor);
    if (anchorRow && GENERATED.has(anchorRow.kind) && !list.some((r) => r.id === anchor)) list.unshift(anchorRow);
    for (const r of list) {
      const plain = r.kind === "cutout" || r.kind === "icon" ? `. ${ground}` : r.kind === "lineart" ? ". Black ink line drawing on a pure white background, no shading, no fill, clean continuous lines" : r.kind === "texture" ? ". A seamless texture, no objects, no text" : "";
      imgs.push({ id: r.id, prompt: `${r.prompt}${plain}`, out: path.join("assets", `${r.id}.png`), aspect: r.aspect || (r.kind === "texture" ? "16:9" : r.kind === "photo" ? "4:5" : "1:1"), ...(r.style_ref ? { refs: [path.resolve(run, r.style_ref)] } : {}) });
    }
    if (!anchor || !imgs.some((i) => i.id === anchor)) anchor = imgs[0].id;
    // an anchor that is already made still goes first as a reference: it is in the batch (skipped) so the rest follow it
    const anchorFile = path.join(ASSETS, `${anchor}.png`);
    const batch = { aspect: "1:1", style, avoid: (P.style && P.style.avoid) || "", anchor, images: imgs };
    const bf = ART(run, "images.json");
    writeJSON(bf, batch);
    const r = spawnSync(process.execPath, [path.join(HERE, "imagegen.mjs"), "batch", "--plan", bf, ...(args.force ? ["--force"] : []), "--concurrency", str(args.concurrency) || "3"], { encoding: "utf8", timeout: 3600000, maxBuffer: 64 * 1024 * 1024 });
    let res = {}; try { res = JSON.parse(r.stdout); } catch { /* none */ }
    const failed = new Map(((res.failed || []).map((f) => [f.id, f.error])));
    if (r.status === 3) for (const x of imgs) todo.push({ id: x.id, kind: (rowOf(x.id) || {}).kind, reason: "image generation unavailable at batch time", prompt: x.prompt });
    else if (r.status !== 0 && !res.done && !res.skipped) fail(`imagegen batch failed: ${String(r.stderr).split("\n").filter(Boolean).slice(-3).join(" | ")}`, 2);
    for (const x of imgs) {
      const row = rowOf(x.id), file = path.join(ASSETS, `${x.id}.png`);
      if (failed.has(x.id) || !exists(file)) { if (r.status !== 3) todo.push({ id: x.id, kind: row.kind, reason: `generation failed: ${String(failed.get(x.id) || "no picture written").slice(0, 160)}`, prompt: x.prompt }); continue; }
      if (only && !only.has(x.id) && assets.has(x.id)) continue;
      const entry = { id: x.id, kind: row.kind, path: path.relative(run, file), source: "imagegen", anchor, prompt: x.prompt, treatments: row.treatments, used_by: row.used_by || [], ...dims(file) };
      if (row.kind === "cutout") { try { const cf = file.replace(/\.png$/, ".cut.png"); const c = cutout(file, cf); entry.cutout = path.relative(run, cf); entry.cutout_method = c.method; } catch (e) { entry.note = "cutout failed: see the todo"; } }
      const base = entry.cutout ? path.join(run, entry.cutout) : file;
      if (row.treatments.length) { const t = applyTreatments(base, { id: x.id, treatments: row.treatments.filter((t0) => !(row.kind === "cutout" && t0 === "cutout")) }); if (t) { entry.treated = path.relative(run, t.path); entry.applied = t.applied; } }
      assets.set(x.id, entry);
      made.push(x.id);
    }
    void anchorFile;
  }
  // rows done before and not touched now keep their entries; a todo replaces a stale entry
  for (const t of todo) assets.delete(t.id);
  const keepTodo = (prev.todo || []).filter((t) => !assets.has(t.id) && !todo.some((x) => x.id === t.id) && !made.includes(t.id));
  const doc = { version: 1, style: P.style || {}, anchor, imagegen: ig.state, assets: [...assets.values()], todo: [...keepTodo, ...todo], made_at: new Date().toISOString() };
  writeJSON(af, doc);
  out({ ok: true, assets: af, made, skipped, todo: doc.todo.length, imagegen: ig.state, anchor, ...(doc.todo.length ? { note: "some assets are on the todo list (see assets.json todo): do them by hand, or say in ART.md why the film goes without" } : {}) });
}
function check() {
  const run = runDir(), P = jsonMaybe(ART(run, "plan.json")), A = jsonMaybe(ART(run, "assets.json")) || { assets: [], todo: [] };
  const problems = [], warnings = [];
  if (!P || !Array.isArray(P.assets)) fail(`no art plan at ${ART(run, "plan.json")} (art.mjs plan --run <run>)`);
  const st = P.style || {};
  for (const k of ["palette", "line_weight", "rendering", "lighting"]) if (!(Array.isArray(st[k]) ? st[k].length : String(st[k] || "").trim())) problems.push(`style-missing: plan.style.${k} is empty (one style for every asset)`);
  if (st.todo) warnings.push(`style-todo: ${st.todo}`);
  const byId = new Map((A.assets || []).map((a) => [a.id, a]));
  const todoIds = new Map((A.todo || []).map((t) => [t.id, t]));
  const seen = new Set();
  for (const r of P.assets) {
    if (!r || !r.id) { problems.push("an asset row has no id"); continue; }
    if (seen.has(r.id)) problems.push(`duplicate asset id ${r.id}`); seen.add(r.id);
    if (!KINDS.includes(r.kind)) problems.push(`asset ${r.id}: kind "${r.kind}" is not one of ${KINDS.join(", ")}`);
    if (!String(r.prompt || r.text || "").trim()) problems.push(`asset ${r.id}: no prompt`);
    if (!Array.isArray(r.used_by) || !r.used_by.length) warnings.push(`asset ${r.id}: used_by is empty (which beat or line uses it?)`);
    const a = byId.get(r.id), t = todoIds.get(r.id) || (r.todo ? { reason: r.todo } : null);
    if (a) {
      const files = [a.path, a.cutout, a.treated].filter(Boolean);
      for (const f of files) if (!exists(path.resolve(run, f))) problems.push(`asset ${r.id}: ${f} is missing on disk`);
      const main = path.resolve(run, a.treated || a.cutout || a.path || "");
      if (/\.png$/i.test(main) && exists(main)) {
        const d = dims(main), need = Number(r.min_px) || MIN_PX[r.kind] || 0, small = Math.min(d.width, d.height);
        if (r.kind !== "icon" && small < need && !/\.(cut|treated)\.png$/.test(main)) problems.push(`asset ${r.id}: ${d.width}x${d.height} is smaller than the ${need}px it needs at the size it is used (set min_px on the row if it is shown small)`);
        else if (small < need && !/\.(cut|treated)\.png$/.test(main)) warnings.push(`asset ${r.id}: ${d.width}x${d.height} is under ${need}px`);
        else if (small < need) warnings.push(`asset ${r.id}: the ${a.cutout ? "cut-out" : "treated"} picture is ${d.width}x${d.height} (under ${need}px): fine if it is shown smaller than the frame`);
      }
    } else if (t) { if (String(t.reason || "").trim().length < 8) problems.push(`asset ${r.id}: a todo needs a reason (8+ characters)`); else warnings.push(`asset ${r.id}: todo (${String(t.reason).slice(0, 90)})`); }
    else problems.push(`asset ${r.id}: not made and not a todo (art.mjs make --run <run> --only ${r.id}, or give it a todo with a reason)`);
  }
  // every show that names an object or a photo maps to an asset
  const chosen = jsonMaybe(path.join(run, "story", "chosen.json"));
  if (chosen && Array.isArray(chosen.beats)) {
    const used = P.assets.flatMap((r) => (r.used_by || []).map((u) => norm(u)));
    chosen.beats.forEach((b, bi) => {
      for (const r of Array.isArray(b.shows) ? b.shows : []) {
        const bf = norm(r && r.built_from);
        if (bf !== "object" && bf !== "photo") continue;
        const line = norm(r.line);
        if (!line || !used.some((u) => u.includes(line) || (line.length > 6 && line.includes(u.split(":").pop().trim()) && u.split(":").pop().trim().length > 6))) problems.push(`show-unmapped: beat ${bi + 1} "${String(r.line || "").slice(0, 50)}" is built from ${bf} and no asset names it in used_by`);
      }
    });
  }
  // one style: every generated asset shares the anchor
  const gen = (A.assets || []).filter((a) => a.source === "imagegen" && a.kind !== "abstract"); // plates are their own family, locked by the ramp
  const anchors = new Set(gen.map((a) => a.anchor).filter(Boolean));
  if (anchors.size > 1) problems.push(`style-split: generated assets follow ${anchors.size} different anchors (${[...anchors].join(", ")}): regenerate the odd ones against the anchor ${A.anchor}`);
  const noAnchor = gen.filter((a) => !a.anchor);
  if (noAnchor.length) problems.push(`style-split: ${noAnchor.map((a) => a.id).join(", ")} were generated without the style anchor`);
  if (A.anchor && gen.length > 1 && !byId.has(A.anchor)) warnings.push(`the style anchor ${A.anchor} is not an asset any more`);
  // the world bible, when the film has one: the reuse gate (conditional; only a still static > 1.2 s is an error)
  const wf = worldPath(run);
  if (exists(wf)) { try { const g = checkWorld(loadWorld(wf), { run }); for (const p of g.problems) problems.push(`world: ${p}`); for (const x of g.warnings) warnings.push(`world: ${x}`); } catch (e) { problems.push(`world: ${e.message}`); } }
  const res = { ok: problems.length === 0, assets: P.assets.length, made: byId.size, todo: todoIds.size, problems, warnings };
  out(res);
  if (problems.length) { for (const p of problems) err(`PROBLEM: ${p}`); process.exit(1); }
}


// ------------------------------------------------------------------ depth, object cutout, plates, mockups, world bible
async function depthCmd() {
  const inp = abs(str(args.in) || fail("--in <png> required")), outp = abs(str(args.out) || fail("--out <png> required"));
  const bits = Number(args.bits) === 16 ? 16 : 8, t0 = Date.now();
  let d; try { d = await depthMap(inp, { size: Number(args.size) || 518, flip: !!args.flip }); } catch (e) { fail(`depth: ${e.message}`, 2); }
  pngio.writeGrey(outp, d.w, d.h, d.v, bits);
  out({ ok: true, out: outp, width: d.w, height: d.h, bits, model: d.model, licence: "Apache-2.0", near: "white", seconds: +((Date.now() - t0) / 1000).toFixed(1) });
}
async function cutoutObject(inp, outp, { pad = 0, trim = true, matteOut = "" } = {}) {
  const m = await objectMatte(inp), img = readImage(inp);
  const o = new Uint8ClampedArray(img.data);
  for (let i = 0; i < m.v.length; i++) { const a = clamp((m.v[i] - 0.04) / 0.92, 0, 1); o[i * 4 + 3] = Math.round(o[i * 4 + 3] * a); }
  if (matteOut) pngio.writeGrey(matteOut, m.w, m.h, m.v, 8);
  const res = { w: img.w, h: img.h, data: o }, t = trim ? trimToContent(res, pad) : res;
  if (!t) fail("cutout --object: nothing is left after removing the background", 2);
  writePng(outp, t);
  return { method: "birefnet-lite", model: m.model, licence: "MIT", ...dims(outp) };
}
async function platesCmd() {
  const inp = abs(str(args.in) || fail("--in <png> required")), dir = abs(str(args.out) || path.join(path.dirname(inp), `${path.basename(inp).replace(/\.[^.]+$/, "")}-plates`));
  fs.mkdirSync(dir, { recursive: true });
  const img = pngio.readImage(inp, { maxW: Number(args.max) || 1920, maxH: Number(args.max) || 1920 });
  let dpath = str(args.depth) ? abs(args.depth) : path.join(dir, "depth.png");
  if (!str(args.depth)) { const d = await depthMap(inp, {}); pngio.writeGrey(dpath, d.w, d.h, d.v, 8); }
  const dp = pngio.readPlane(dpath, { w: img.w, h: img.h });
  const splits = (str(args.splits) || "0.4,0.7").split(",").map(Number).filter((x) => x > 0 && x < 1).sort((a, b) => a - b);
  const layers = splitLayers(img, { v: dp.v }, { splits, feather: Number(args.feather) || 3, grow: Number(args.grow) || 6, choke: args.choke === undefined ? 1 : Number(args.choke) });
  const rows = [];
  for (const L of layers) { const f = path.join(dir, `${L.id}.png`); pngio.writePng(f, { w: img.w, h: img.h, data: L.rgba }); rows.push({ id: L.id, file: path.relative(dir, f), depth_min: L.depth_min, depth_max: L.depth_max, parallax: L.parallax }); }
  const doc = { source: inp, width: img.w, height: img.h, depth: path.relative(dir, dpath), order: "far to near: stack in this order, same size, same origin", layers: rows, how: "translate each layer by camera * parallax * strength (strength about 2-3% of the width) and scale by 1 + zoom * (0.3 + 0.7 * parallax); the far layer is a full, hole-free plate" };
  writeJSON(path.join(dir, "plates.json"), doc);
  out({ ok: true, dir, ...doc });
}
const sizeArg = (v) => { const m = String(v || "").match(/^(\d+)x(\d+)$/); return m ? [+m[1], +m[2]] : [1920, 1080]; };
function mockupCmd() {
  if (args.list) return out({ ok: true, templates: templateInfo() });
  const outp = abs(str(args.out) || fail("--out <png> required (a directory with --plate-only)")), [W, H] = sizeArg(args.size);
  const base = outp.replace(/\.png$/i, "");
  if (args["plate-only"]) { // the scene without the picture: back.png under, over.png above, and the quad to pin with the live runtime
    const id = str(args.template) || "billboard", t = buildTemplate(id, W, H);
    fs.mkdirSync(outp, { recursive: true });
    pngio.writePng(path.join(outp, "back.png"), t.back); pngio.writePng(path.join(outp, "over.png"), t.over);
    const doc = { template: id, size: [W, H], quad_px: t.quad.map((p) => p.map((v) => +v.toFixed(1))), quad: t.quad.map((p) => [+(p[0] / W).toFixed(5), +(p[1] / H).toFixed(5)]), aspect: +t.aspect.toFixed(4), radius: t.radius, emissive: t.emissive, files: { back: "back.png", over: "over.png" } };
    writeJSON(path.join(outp, "mockup.json"), doc); return out({ ok: true, dir: outp, ...doc });
  }
  const inp = abs(str(args.in) || fail("--in <png> required"));
  let corners = null;
  if (str(args.corners)) { const n = str(args.corners).split(/[,\s]+/).map(Number); if (n.length !== 8 || n.some((v) => !Number.isFinite(v))) fail('--corners needs 8 numbers: "x,y,x,y,x,y,x,y" (top-left, top-right, bottom-right, bottom-left)'); corners = [[n[0], n[1]], [n[2], n[3]], [n[4], n[5]], [n[6], n[7]]]; }
  const tpl = str(args.template) || "billboard";
  if (!str(args.bg) && !TEMPLATE_IDS.includes(tpl)) fail(`--template must be one of ${TEMPLATE_IDS.join(", ")}`);
  let r; try { r = buildMockup(inp, { template: tpl, size: [W, H], bg: str(args.bg) ? abs(args.bg) : null, corners, over: str(args.over) ? abs(args.over) : null, aspect: args.aspect ? Number(args.aspect) : null, radius: args.radius !== undefined ? Number(args.radius) : null, fit: str(args.fit) || "cover", grain: args.grain !== undefined ? Number(args.grain) : 0.012, seed: Number(args.seed) || 1 }); } catch (e) { fail(`mockup: ${e.message}`, 2); }
  pngio.writePng(outp, r.img);
  const files = { out: path.basename(outp) };
  if (args.parts) { pngio.writePng(`${base}.back.png`, r.back); pngio.writePng(`${base}.over.png`, r.over); files.back = path.basename(`${base}.back.png`); files.over = path.basename(`${base}.over.png`); }
  const doc = { template: str(args.bg) ? "custom" : tpl, size: [W, H], quad_px: r.quad.map((p) => p.map((v) => +v.toFixed(1))), quad: r.quad.map((p) => [+(p[0] / W).toFixed(5), +(p[1] / H).toFixed(5)]), aspect: +r.aspect.toFixed(4), radius: r.radius, emissive: r.emissive, files };
  writeJSON(`${base}.json`, doc);
  out({ ok: true, out: outp, ...doc });
}
async function worldCmd() {
  const sub = args._[1], run = runDir(), wf = worldPath(run);
  if (sub === "init") {
    if (exists(wf) && !args.force) fail(`${wf} exists (--force to replace it)`);
    const chosen = jsonMaybe(path.join(run, "story", "chosen.json")), cs = chosen && (Array.isArray(chosen.shots) ? chosen.shots : chosen.concept && Array.isArray(chosen.concept.shots) ? chosen.concept.shots : null), shots = cs ? cs.map((sh, i) => String((sh && sh.id) || `s${String(i + 1).padStart(2, "0")}`)) : chosen && Array.isArray(chosen.beats) ? chosen.beats.map((_, i) => `s${String(i + 1).padStart(2, "0")}`) : []; // the concept's shot ids (s01...), else the beats'
    writeJSON(wf, skeleton({ name: str(args.name), aspect: str(args.aspect) || "16:9", shots }));
    return out({ ok: true, world: wf, next: "fill name/place/subject/style_line (30-45 words)/palette/prompts, then `art.mjs world check`, then `art.mjs world make`" });
  }
  if (!exists(wf)) fail(`no world bible at ${wf} (art.mjs world init --run <run>)`);
  const w = loadWorld(wf);
  if (sub === "check") {
    const r = checkWorld(w, { run }); out(r);
    if (!r.ok) { for (const p of r.problems) err(`PROBLEM: ${p}`); process.exit(1); }
    return;
  }
  if (sub === "lock") { writeJSON(wf, lockWorld(w)); return out({ ok: true, hashes: w.hashes }); }
  if (sub === "make") {
    const g = checkWorld(w, { run });
    const blocking = g.problems.filter((p) => /^(style-line|palette|anchor|images|image \S+: (no prompt|no file|role|needs|derive|the prompt))/.test(p));
    if (blocking.length) { for (const p of blocking) err(`PROBLEM: ${p}`); fail("the world bible is not ready to generate (fix the problems above; reuse/static problems can wait until the shots are planned)", 1); }
    const ig = imagegenState();
    if (ig.state !== "ready") { noteDowngrade({ run, what: "image generation", instead: "no world images", why: `${ig.state}: ${ig.reason}`, impact: "the world bible's pictures are not generated" }); return out({ ok: false, imagegen: ig.state, reason: ig.reason, note: "image generation is unavailable: the world images are todos" }); }
    if (!w.hashes || !w.hashes.anchor) { lockWorld(w); writeJSON(wf, w); }
    const r = spawnSync(process.execPath, [path.join(HERE, "imagegen.mjs"), "batch", "--world", wf, "--concurrency", str(args.concurrency) || "3", ...(args.force ? ["--force"] : []), ...(str(args.only) ? ["--only", str(args.only)] : [])], { encoding: "utf8", timeout: 3600000, maxBuffer: 64 * 1024 * 1024 });
    let res = {}; try { res = JSON.parse(r.stdout); } catch { /* none */ }
    if (r.status !== 0 && !res.done) fail(`world batch failed: ${String(r.stderr).split("\n").filter(Boolean).slice(-3).join(" | ")}`, 2);
    // bake the derivatives each image asked for
    const derived = [];
    for (const im of w.images) {
      const f = path.resolve(run, im.file); if (!exists(f)) continue;
      im.derivatives = Array.isArray(im.derivatives) ? im.derivatives : [];
      const have = (k) => im.derivatives.some((d) => d.kind === k && exists(path.resolve(run, d.file)));
      const dir = path.join(path.dirname(f), "derived");
      for (const k of im.derive || []) {
        if (have(k)) continue;
        const dst = path.join(dir, `${im.id}.${k === "plates" ? "plates" : k === "depth" ? "depth.png" : "cut.png"}`);
        const a = k === "depth" ? ["depth", "--in", f, "--out", dst] : k === "cutout" ? ["cutout", "--object", "--in", f, "--out", dst] : ["plates", "--in", f, "--out", dst, ...(have("depth") ? ["--depth", path.resolve(run, im.derivatives.find((d) => d.kind === "depth").file)] : [])];
        const rr = spawnSync(process.execPath, [path.join(HERE, "art.mjs"), ...a], { encoding: "utf8", timeout: 900000 });
        if (rr.status === 0) { im.derivatives.push({ kind: k, file: path.relative(run, k === "plates" ? path.join(dst, "plates.json") : dst) }); derived.push(`${im.id}:${k}`); } else err(`NOTE: ${im.id}: ${k} failed (${String(rr.stderr).trim().split("\n").pop().slice(0, 140)})`);
      }
    }
    writeJSON(wf, w);
    return out({ ok: r.status === 0, made: (res.done || []).map((d) => d.id), skipped: (res.skipped || []).map((d) => d.id), failed: res.failed || [], derived, world: wf });
  }
  fail("usage: art.mjs world init|check|make|lock --run <run>");
}

// ------------------------------------------------------------------ main
if (cmd === "plan") plan();
else if (cmd === "make") make();
else if (cmd === "check") check();
else if (cmd === "depth") await depthCmd();
else if (cmd === "plates") await platesCmd();
else if (cmd === "mockup") mockupCmd();
else if (cmd === "world") await worldCmd();
else if (cmd === "cutout" && args.object) {
  const inp = abs(str(args.in) || fail("--in <png> required")), outp = abs(str(args.out) || fail("--out <png> required"));
  let r; try { r = await cutoutObject(inp, outp, { pad: Number(args.pad) || 0, trim: !args["no-trim"], matteOut: str(args["matte-out"]) ? abs(args["matte-out"]) : "" }); } catch (e) { fail(`cutout --object: ${e.message}`, 2); }
  out({ ok: true, out: outp, ...r });
} else if (cmd === "cutout") {
  const inp = abs(str(args.in) || fail("--in <png> required")), outp = abs(str(args.out) || fail("--out <png> required"));
  out({ ok: true, out: outp, ...cutout(inp, outp, { tol: Number(args.tol) || 40, pad: Number(args.pad) || 0 }) });
} else if (cmd === "treat" && args["halftone-collage"]) {
  const inp = abs(str(args.in) || fail("--in <png> required")), outp = abs(str(args.out) || fail("--out <png> required"));
  out({ ok: true, op: "halftone-collage", out: outp, ...halftoneCollage(inp, outp, { cell: args.cell, keyline: args.keyline, card: str(args.card), ink: str(args.ink), tilt: args.tilt === true ? "" : args.tilt, grain: args.grain, shadow: args.shadow, seed: args.seed, field: str(args.field), noCutout: !!args["no-cutout"] }) });
} else if (cmd === "treat") {
  const inp = abs(str(args.in) || fail("--in <png> required")), outp = abs(str(args.out) || fail("--out <png> required")), op = str(args.op);
  if (!OPS.includes(op)) fail(`--op must be one of ${OPS.join(", ")}`);
  out({ ok: true, op, out: outp, ...runTreat(inp, outp, op, str(args.colors) ? str(args.colors).split(",").map((s) => s.trim()).filter(Boolean) : [], args.cell, { dither: args.dither, grain: args.grain, seed: args.seed }) });
} else if (cmd === "trace") {
  const inp = abs(str(args.in) || fail("--in <png> required")), outp = abs(str(args.out) || fail("--out <svg> required"));
  out({ ok: true, out: outp, ...trace(inp, outp, { colors: Number(args.colors) || 8, lineart: !!args.lineart, max: Number(args.max) || 900 }) });
} else if (cmd === "hand") {
  const text = str(args.text) || fail('--text "<words>" required'), outp = abs(str(args.out) || fail("--out <svg> required"));
  out({ ok: true, out: outp, ...hand(text, outp, { font: str(args.font) || "script", size: Number(args.size) || 120, weight: Number(args.weight) || 0, color: str(args.color) || "#111111", spacing: Number(args.spacing) || 0 }) });
} else if (cmd === "plate") await plateCmd();
else if (cmd === "recipe") await plateCmd(true);
else fail("usage: art.mjs plan|make|cutout|depth|plates|mockup|world|treat|trace|hand|check|plate|recipe … (see the header)");
