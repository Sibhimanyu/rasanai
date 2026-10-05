#!/usr/bin/env node
// Presenter films: a talking head shot on a green or blue screen (or any single-subject talking clip) is keyed out
// and put in front of generated image plates that move with designed camera moves, with motion graphics and
// captions on top. The voice is the spine: the clip plays whole, nothing is trimmed. Playbook: references/presenter.md.
// Zero dependencies beyond Node >= 20, ffmpeg/ffprobe and `npx hyperframes`. Progress on stderr, JSON on stdout.
//
//   node presenter.mjs key    --clip <video> --out <dir> [--color auto|green|blue|#rrggbb] [--similarity 0-1] [--blend 0-1] [--matte auto|chroma|ai]
//        -> <dir>/presenter.webm (VP9 alpha, no audio), <dir>/key.json, <dir>/key-check.png (3 frames over grey and magenta)
//   node presenter.mjs beats  --transcript <words.json> --out <beats.json> [--min 2.5] [--max 9] [--duration <s>] [--clip <id>]
//        -> {duration, beats: [{id, start, end, text, words: [i0, i1]}]}; reads a bare word array, {words}, or reel scan's footage.json
//   node presenter.mjs check  --plan <plan.json> [--beats <beats.json>] [--key <key.json>] [--imagegen ready|off] [--json]
//        exit 0 pass (warnings allowed), 2 errors found, 1 could not run. Prints one line per finding, or JSON with --json:
//        {ok, errors, warnings, findings: [{level, beat, code, message, fix}]}
//   node presenter.mjs plates --plan <plan.json> [--look <DESIGN.md>] --out <images.json> [--dir <plates dir>]
//        -> the batch plan for `imagegen.mjs batch` (one image per generated plate, anchor = the first one)
//   node presenter.mjs stills --plan <plan.json> --key <key.json> --plates <plates dir> --out <dir> [--look <DESIGN.md>]
//        -> <dir>/<beat id>.png at each beat's middle (plate with camera move + keyed presenter in layout + graphic boxes) and stills.json
//   node presenter.mjs build  --plan <plan.json> --key <key.json> --plates <plates dir> --project-dir videos/<name>
//        [--captions <words.json>] [--look <DESIGN.md>] [--motion <motion.md>] [--refresh-scaffolds] [--force] [--no-lint]
//        -> a HyperFrames project: index.html (track 0 plates, 1 presenter, 2 graphics, 3 captions), compositions/graphics/*,
//           briefs/graphics/*, assets/*; runs `hyperframes lint` and prints {ok, project, index, graphics, lint, ...}
//
// plan.json (version 1): {clip, aspect, style: {lock, avoid}, beats: [{id, start, end, say, layout, side?, plate: {id, kind, prompt,
//   camera, reuse?}|null, graphics: [{type, text, items?, sub?, at, out, zone}], transition_in}]}. at/out are absolute clip seconds.
// Layouts: presenter-full | presenter-left | presenter-right | presenter-corner | presenter-only | plate-only | split.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs, die, readJSON, writeFile, normalizeAspect, esc, readLook, readFrontmatterDoc, gsapInline, SKILL_DIR } from "./lib/common.mjs";
import { decodePng } from "./lib/png.mjs";
import { stageFonts } from "./lib/fonts.mjs";
import { installLook } from "./lib/install.mjs";
import { track } from "./lib/report.mjs";

void gsapInline;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = parseArgs();
const cmd = args._[0];
track(
  { key: "Keying the presenter out of the footage", beats: "Splitting the speech into beats", plates: "Planning the image plates", stills: "Compositing a still for every beat", build: "Building the presenter film" }[cmd],
  { key: "Presenter keyed", beats: "Beats written", plates: "Image plan written", stills: "Stills written", build: "Presenter film built" }[cmd]
);

const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const err = (m) => process.stderr.write(m + "\n");
const words = (s) => String(s || "").trim().split(/\s+/).filter(Boolean);
const safeId = (s) => String(s).replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "x";

const LAYOUTS = ["presenter-full", "presenter-left", "presenter-right", "presenter-corner", "presenter-only", "plate-only", "split"];
const CAMERAS = ["push-in", "pull-out", "pan-left", "pan-right", "tilt-up", "tilt-down", "drift", "parallax", "static"];
const GFX_TYPES = ["kinetic-title", "callout", "stat", "lower-third", "list", "quote", "diagram", "label"];
const ZONES = ["left", "right", "top", "bottom", "center"];

// ------------------------------------------------------------------ ffmpeg plumbing
function sh(bin, argv, opts = {}) {
  const r = spawnSync(bin, argv, { encoding: opts.buffer ? "buffer" : "utf8", maxBuffer: 1024 * 1024 * 1024, timeout: opts.timeout || 600000, input: opts.input });
  if (r.error) throw new Error(`${bin}: ${r.error.message}`);
  if (r.status !== 0) {
    const e = String(r.stderr || "").trim().split("\n").filter(Boolean).slice(-3).join(" | ");
    throw new Error(`${bin} failed: ${e}`);
  }
  return r;
}
function need(bin) {
  const r = spawnSync(bin, ["-version"], { encoding: "utf8" });
  if (r.error || r.status !== 0) die(`PROBLEM: ${bin} is required (brew install ffmpeg / apt install ffmpeg)`);
}
function probe(file) {
  let j;
  try {
    j = JSON.parse(sh("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", file]).stdout);
  } catch (e) {
    die(`PROBLEM: ffprobe could not read ${file}: ${e.message}`);
  }
  const v = (j.streams || []).find((s) => s.codec_type === "video" && !(s.disposition && s.disposition.attached_pic));
  const a = (j.streams || []).find((s) => s.codec_type === "audio");
  if (!v) die(`PROBLEM: ${file} has no video stream`);
  const frac = (s) => {
    const [n, d] = String(s || "0/1").split("/").map(Number);
    return d ? n / d : n;
  };
  const rot = Number(((v.side_data_list || []).find((x) => x.rotation !== undefined) || {}).rotation ?? (v.tags && v.tags.rotate) ?? 0);
  const swap = Math.abs(rot) % 180 === 90;
  return {
    width: swap ? v.height : v.width,
    height: swap ? v.width : v.height,
    fps: r2(frac(v.avg_frame_rate) || frac(v.r_frame_rate) || 30),
    duration: r3(Number(j.format.duration || v.duration || 0)),
    has_audio: !!a,
  };
}
// one frame as raw RGBA. `alpha` decodes VP9 alpha (ffmpeg's native vp9 decoder drops it).
function frameRGBA(file, t, w, h, { alpha = false, vf = null } = {}) {
  const f = vf || `scale=${w}:${h}:flags=lanczos`;
  const argv = ["-v", "error", ...(alpha ? ["-c:v", "libvpx-vp9"] : []), "-ss", String(Math.max(0, t)), "-i", file, "-frames:v", "1", "-vf", f, "-f", "rawvideo", "-pix_fmt", "rgba", "-"];
  const out = sh("ffmpeg", argv, { buffer: true }).stdout;
  if (out.length < w * h * 4) throw new Error(`could not read a frame at ${t}s from ${path.basename(file)}`);
  return out.subarray(0, w * h * 4);
}
function writePng(file, rgba, w, h) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  sh("ffmpeg", ["-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${w}x${h}`, "-i", "-", "-frames:v", "1", file], { input: Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength) });
}

// ------------------------------------------------------------------ tiny RGBA canvas + 5x7 bitmap text (the stock ffmpeg has no drawtext)
const GLYPHS = {
  A: ".###./#...#/#...#/#####/#...#/#...#/#...#", B: "####./#...#/#...#/####./#...#/#...#/####.", C: ".###./#...#/#..../#..../#..../#...#/.###.",
  D: "####./#...#/#...#/#...#/#...#/#...#/####.", E: "#####/#..../#..../####./#..../#..../#####", F: "#####/#..../#..../####./#..../#..../#....",
  G: ".###./#...#/#..../#.###/#...#/#...#/.###.", H: "#...#/#...#/#...#/#####/#...#/#...#/#...#", I: ".###./..#../..#../..#../..#../..#../.###.",
  J: "..###/...#./...#./...#./...#./#..#./.##..", K: "#...#/#..#./#.#../##.../#.#../#..#./#...#", L: "#..../#..../#..../#..../#..../#..../#####",
  M: "#...#/##.##/#.#.#/#.#.#/#...#/#...#/#...#", N: "#...#/##..#/#.#.#/#..##/#...#/#...#/#...#", O: ".###./#...#/#...#/#...#/#...#/#...#/.###.",
  P: "####./#...#/#...#/####./#..../#..../#....", Q: ".###./#...#/#...#/#...#/#.#.#/#..#./.##.#", R: "####./#...#/#...#/####./#.#../#..#./#...#",
  S: ".####/#..../#..../.###./....#/....#/####.", T: "#####/..#../..#../..#../..#../..#../..#..", U: "#...#/#...#/#...#/#...#/#...#/#...#/.###.",
  V: "#...#/#...#/#...#/#...#/#...#/.#.#./..#..", W: "#...#/#...#/#...#/#.#.#/#.#.#/##.##/#...#", X: "#...#/#...#/.#.#./..#../.#.#./#...#/#...#",
  Y: "#...#/#...#/.#.#./..#../..#../..#../..#..", Z: "#####/....#/...#./..#../.#.../#..../#####",
  0: ".###./#...#/#..##/#.#.#/##..#/#...#/.###.", 1: "..#../.##../..#../..#../..#../..#../.###.", 2: ".###./#...#/....#/...#./..#../.#.../#####",
  3: "####./....#/....#/.###./....#/....#/####.", 4: "...#./..##./.#.#./#..#./#####/...#./...#.", 5: "#####/#..../####./....#/....#/#...#/.###.",
  6: "..##./.#.../#..../####./#...#/#...#/.###.", 7: "#####/....#/...#./..#../.#.../.#.../.#...", 8: ".###./#...#/#...#/.###./#...#/#...#/.###.",
  9: ".###./#...#/#...#/.####/....#/...#./.##..",
  ".": "...../...../...../...../...../.##../.##..", ",": "...../...../...../...../.##../..#../.#...", ":": "...../.##../.##../...../.##../.##../.....",
  "-": "...../...../...../#####/...../...../.....", "'": ".##../..#../.#.../...../...../...../.....", "?": ".###./#...#/....#/...#./..#../...../..#..",
  "!": "..#../..#../..#../..#../..#../...../..#..", "/": "....#/....#/...#./..#../.#.../#..../#....", "%": "##..#/##..#/...#./..#../.#.../#..##/#..##",
  "+": "...../..#../..#../#####/..#../..#../.....", "(": "...#./..#../.#.../.#.../.#.../..#../...#.", ")": ".#.../..#../...#./...#./...#./..#../.#...",
  _: "...../...../...../...../...../...../#####", "=": "...../...../#####/...../#####/...../.....", "&": ".##../#..#./#.#../.#.../#.#.#/#..#./.##.#",
};
const GLYPH_ROWS = Object.fromEntries(Object.entries(GLYPHS).map(([k, v]) => [k, v.split("/")]));
function textWidth(s, k) {
  return String(s).length * 6 * k - k;
}
function fitText(s, k, maxW) {
  s = String(s).toUpperCase().replace(/[^A-Z0-9 .,:'?!/%+()_=&-]/g, " ").replace(/\s+/g, " ").trim();
  if (textWidth(s, k) <= maxW) return s;
  while (s.length > 1 && textWidth(s + "..", k) > maxW) s = s.slice(0, -1);
  return s.trimEnd() + "..";
}
class Canvas {
  constructor(w, h, bg = [0, 0, 0, 255]) {
    this.w = w;
    this.h = h;
    this.d = new Uint8ClampedArray(w * h * 4);
    this.fill(bg);
  }
  fill([r, g, b, a]) {
    for (let i = 0; i < this.d.length; i += 4) { this.d[i] = r; this.d[i + 1] = g; this.d[i + 2] = b; this.d[i + 3] = a; }
  }
  px(x, y, [r, g, b, a]) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4, A = a / 255;
    this.d[i] = this.d[i] * (1 - A) + r * A;
    this.d[i + 1] = this.d[i + 1] * (1 - A) + g * A;
    this.d[i + 2] = this.d[i + 2] * (1 - A) + b * A;
    this.d[i + 3] = 255;
  }
  rect(x, y, w, h, col) {
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    for (let yy = Math.max(0, y); yy < Math.min(this.h, y + h); yy++) for (let xx = Math.max(0, x); xx < Math.min(this.w, x + w); xx++) this.px(xx, yy, col);
  }
  stroke(x, y, w, h, t, col) {
    this.rect(x, y, w, t, col); this.rect(x, y + h - t, w, t, col); this.rect(x, y, t, h, col); this.rect(x + w - t, y, t, h, col);
  }
  text(s, x, y, k, col, shadow = true) {
    s = fitText(s, k, this.w - x - k);
    const draw = (ox, oy, c) => {
      let cx = x + ox;
      for (const ch of s) {
        const rows = GLYPH_ROWS[ch];
        if (rows) for (let r = 0; r < 7; r++) for (let q = 0; q < 5; q++) if (rows[r][q] === "#") this.rect(cx + q * k, y + oy + r * k, k, k, c);
        cx += 6 * k;
      }
    };
    if (shadow) draw(k, k, [0, 0, 0, 200]);
    draw(0, 0, col);
  }
  // alpha-over an RGBA bitmap, optionally clipped to a rect
  blit(src, sw, sh, dx, dy, clip = null) {
    dx = Math.round(dx); dy = Math.round(dy);
    const cx0 = clip ? Math.max(0, Math.round(clip.x)) : 0, cy0 = clip ? Math.max(0, Math.round(clip.y)) : 0;
    const cx1 = clip ? Math.min(this.w, Math.round(clip.x + clip.w)) : this.w, cy1 = clip ? Math.min(this.h, Math.round(clip.y + clip.h)) : this.h;
    for (let y = Math.max(cy0, dy); y < Math.min(cy1, dy + sh); y++) {
      for (let x = Math.max(cx0, dx); x < Math.min(cx1, dx + sw); x++) {
        const si = ((y - dy) * sw + (x - dx)) * 4, a = src[si + 3];
        if (!a) continue;
        const di = (y * this.w + x) * 4, A = a / 255;
        this.d[di] = this.d[di] * (1 - A) + src[si] * A;
        this.d[di + 1] = this.d[di + 1] * (1 - A) + src[si + 1] * A;
        this.d[di + 2] = this.d[di + 2] * (1 - A) + src[si + 2] * A;
        this.d[di + 3] = 255;
      }
    }
  }
  save(file) {
    writePng(file, this.d, this.w, this.h);
  }
}
// the colour behind the presenter in a framed panel: the look's darker ground, or a dark neutral
function panelFill(look) {
  const lum = (h) => { const [r, g, b] = hexRGB(h); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  if (!look || look.defaulted?.includes("colors")) return "#14120f";
  return lum(look.bg) <= lum(look.ink) ? look.bg : look.ink;
}
const hexRGB = (h, a = 255) => {
  const s = String(h || "#000000").replace("#", "");
  const f = s.length === 3 ? s.split("").map((c) => c + c).join("") : s.slice(0, 6).padEnd(6, "0");
  return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16)).concat(a);
};

// ------------------------------------------------------------------ layout geometry (shared by check, stills and build)
const isTall = (W, H) => H / W > 1.2;
// Zones as fractions of the frame; left/right become bands in a tall frame.
const CAP_BAND = { wide: [0.84, 0.11], tall: [0.67, 0.1] }; // y and height (fractions) reserved for captions
function zoneRect(zone, W, H, caps = false) {
  const Z = isTall(W, H)
    ? { top: [0.06, 0.07, 0.88, 0.2], left: [0.06, 0.07, 0.88, 0.2], center: [0.06, 0.3, 0.88, 0.2], right: [0.06, 0.3, 0.88, 0.2], bottom: [0.06, 0.8, 0.88, 0.14] }
    : { left: [0.04, 0.2, 0.32, 0.6], right: [0.64, 0.2, 0.32, 0.6], top: [0.1, 0.06, 0.8, 0.22], bottom: [0.1, 0.72, 0.8, 0.2], center: [0.2, 0.3, 0.6, 0.4] };
  const z = [...(Z[zone] || Z.center)];
  if (caps && !isTall(W, H) && zone === "bottom") { z[1] = 0.6; z[3] = 0.2; } // lifted above the caption band
  return { x: Math.round(z[0] * W), y: Math.round(z[1] * H), w: Math.round(z[2] * W), h: Math.round(z[3] * H) };
}
const NOMINAL_SUBJECT = { x: 0.32, y: 0.18, w: 0.36, h: 0.82 }; // head and shoulders with some head room, when no key.json is given

// Where the keyed presenter lands in a layout. The video is cover-fitted into the frame; the layout then scales it about
// the frame's bottom centre and translates it so the measured subject box lands where the layout wants it.
// Returns the transform (s, tx, ty), the clip window, the panel decoration, the plate window and the subject box in frame px.
function geom(layout, key, W, H, side = "left") {
  const tall = isTall(W, H);
  const vw0 = (key && key.width) || W, vh0 = (key && key.height) || H;
  const c = Math.max(W / vw0, H / vh0), vw = vw0 * c, vh = vh0 * c, ox = (W - vw) / 2, oy = (H - vh) / 2;
  const sb = (key && key.subject) || NOMINAL_SUBJECT;
  const S = { x: ox + sb.x * vw, y: oy + sb.y * vh, w: sb.w * vw, h: sb.h * vh };
  const cx = S.x + S.w / 2;
  const full = { x: 0, y: 0, w: W, h: H, r: 0 };
  const g = { layout, s: 1, tx: 0, ty: 0, clip: full, deco: null, hidden: false, plateClip: null, vid: { vw, vh, ox, oy } };
  const place = (target) => { g.tx = target - (W / 2 + g.s * (cx - W / 2)); };
  const radius = 0; // square panels: the frame is drawn from transform-animated bars (lint bans animating left/top/width/height)
  if (layout === "presenter-left" || layout === "presenter-right") {
    if (tall) { g.s = 0.62; place(W / 2); }
    else {
      g.s = 0.8;
      place(layout === "presenter-left" ? 0.27 * W : 0.73 * W);
      const bw = S.w * g.s, left = W / 2 + g.s * (S.x - W / 2) + g.tx;
      g.tx += clamp(left, 0.02 * W, 0.98 * W - bw) - left;
    }
  } else if (layout === "presenter-corner") {
    g.s = tall ? 0.5 : 0.38;
    const m = Math.round(0.03 * W), Pw = W * g.s, Ph = H * g.s, Px = W - m - Pw, Py = H - Math.round(0.04 * H) - Ph;
    g.tx = Px - (W / 2 - Pw / 2);
    g.ty = Py - (H - Ph);
    g.clip = { x: Math.round(Px), y: Math.round(Py), w: Math.round(Pw), h: Math.round(Ph), r: radius };
    g.deco = { ...g.clip };
  } else if (layout === "split") {
    const P = tall
      ? { x: Math.round(0.04 * W), y: Math.round(0.47 * H), w: Math.round(0.92 * W), h: Math.round(0.5 * H), r: radius }
      : { x: side === "right" ? Math.round(0.515 * W) : Math.round(0.03 * W), y: Math.round(0.05 * H), w: Math.round(0.455 * W), h: Math.round(0.9 * H), r: radius };
    g.s = clamp(Math.min((0.88 * P.w) / S.w, P.h / Math.max(S.h, 1)), 0.5, 1);
    place(P.x + P.w / 2);
    g.ty = P.y + P.h - H;
    g.clip = P;
    g.deco = { ...P };
    g.plateClip = tall ? { x: 0, y: 0, w: W, h: P.y } : side === "right" ? { x: 0, y: 0, w: Math.round(0.5 * W), h: H } : { x: Math.round(0.5 * W), y: 0, w: Math.round(0.5 * W), h: H };
  } else if (layout === "plate-only") g.hidden = true;
  g.box = { x: W / 2 + g.s * (S.x - W / 2) + g.tx, y: H + g.s * (S.y - H) + g.ty, w: S.w * g.s, h: S.h * g.s };
  return g;
}
// the part of the frame the presenter holds in a layout (panel layouts hold the whole panel)
function occupied(layout, key, W, H, side) {
  const g = geom(layout, key, W, H, side);
  if (g.hidden) return null;
  return layout === "presenter-corner" || layout === "split" ? g.clip : g.box;
}
// The rectangle a graphic may use in a zone for a layout. Left and right zones are the free space beside the presenter's real box
// (the key.json subject box moved by the layout), less a 4% gutter; a side with under 22% of the frame width free is blocked.
function graphicRect(zone, layout, key, W, H, side, caps = false) {
  const std = zoneRect(zone, W, H, caps);
  if ((zone !== "left" && zone !== "right") || isTall(W, H)) return { rect: std, blocked: false, free: null };
  const occ = occupied(layout, key, W, H, side);
  if (!occ) return { rect: std, blocked: false, free: 1 };
  const margin = 0.03 * W, gutter = 0.04 * W;
  const freeW = zone === "left" ? occ.x : W - (occ.x + occ.w);
  const free = Math.max(0, freeW) / W;
  if (free < 0.22) return { rect: std, blocked: true, free };
  const w = Math.min(std.w, Math.round(freeW - margin - gutter));
  const x = zone === "left" ? Math.round(margin) : Math.round(W - margin - w);
  return { rect: { x, y: std.y, w, h: std.h }, blocked: false, free };
}
// "left 36% free, right 15% free" beside the presenter in a layout (for fix messages)
function freeText(layout, key, W, H, side) {
  const occ = occupied(layout, key, W, H, side);
  if (!occ) return "the whole frame is free";
  const l = Math.max(0, Math.round((occ.x / W) * 100)), r = Math.max(0, Math.round(((W - occ.x - occ.w) / W) * 100));
  return `free beside the presenter: left ${l}% of the frame width, right ${r}% (a graphic needs 22%)`;
}
// which side the presenter stands on in a layout (null when none), and which side each image keeps calm
const presenterSide = (b) => (b.layout === "presenter-left" ? "left" : b.layout === "presenter-right" ? "right" : b.layout === "split" ? (b.side === "right" ? "right" : "left") : null);
function plateSides(plan, defs) {
  const use = new Map();
  for (const b of plan.beats) {
    const sd = presenterSide(b);
    if (!sd || !b.plate || !b.plate.id) continue;
    const d = defs.get(b.plate.id), img = d && d.kind === "reuse" ? d.image : b.plate.id;
    const u = use.get(img) || { left: 0, right: 0, first: sd };
    u[sd] += b.end - b.start;
    use.set(img, u);
  }
  const out = new Map();
  for (const [img, u] of use) out.set(img, u.left > u.right ? "left" : u.right > u.left ? "right" : u.first);
  return out;
}
function overlapFrac(zone, occ) {
  if (!occ) return 0;
  const x = Math.max(0, Math.min(zone.x + zone.w, occ.x + occ.w) - Math.max(zone.x, occ.x));
  const y = Math.max(0, Math.min(zone.y + zone.h, occ.y + occ.h) - Math.max(zone.y, occ.y));
  return (x * y) / (zone.w * zone.h);
}

// camera moves: scale and sideways/vertical shift (fractions of the frame; positive = the picture moves right / down)
const CAM = {
  "push-in": { s0: 1, s1: 1.12, x0: 0, x1: 0, y0: 0, y1: 0 },
  "pull-out": { s0: 1.12, s1: 1, x0: 0, x1: 0, y0: 0, y1: 0 },
  "pan-left": { s0: 1.12, s1: 1.12, x0: -0.05, x1: 0.05, y0: 0, y1: 0 }, // the camera pans left: the picture slides right
  "pan-right": { s0: 1.12, s1: 1.12, x0: 0.05, x1: -0.05, y0: 0, y1: 0 },
  "tilt-up": { s0: 1.12, s1: 1.12, x0: 0, x1: 0, y0: -0.05, y1: 0.05 },
  "tilt-down": { s0: 1.12, s1: 1.12, x0: 0, x1: 0, y0: 0.05, y1: -0.05 },
  drift: { s0: 1.08, s1: 1.08, x0: -0.02, x1: 0.02, y0: 0.012, y1: -0.012 },
  parallax: { s0: 1, s1: 1.1, x0: 0, x1: 0, y0: 0, y1: 0 },
  static: { s0: 1, s1: 1, x0: 0, x1: 0, y0: 0, y1: 0 },
};
const camAt = (move, p) => {
  const c = CAM[move] || CAM.static;
  return { s: c.s0 + (c.s1 - c.s0) * p, x: c.x0 + (c.x1 - c.x0) * p, y: c.y0 + (c.y1 - c.y0) * p };
};

// ------------------------------------------------------------------ plan reading
function readPlan(p) {
  if (!p) die("PROBLEM: --plan <plan.json> is required");
  if (!fs.existsSync(p)) die(`PROBLEM: plan not found: ${p}`);
  let plan;
  try {
    plan = readJSON(p);
  } catch (e) {
    die(`PROBLEM: ${p} is not valid JSON: ${e.message}`);
  }
  if (!plan || !Array.isArray(plan.beats) || !plan.beats.length) die(`PROBLEM: ${p} has no beats[]`);
  return plan;
}
// plates by id: the first beat that names an id defines it; reuse resolves to the image of the plate it points at
function resolvePlates(plan) {
  const defs = new Map();
  for (const b of plan.beats) {
    const p = b.plate;
    if (!p || !p.id) continue;
    const prev = defs.get(p.id);
    if (!prev || (!prev.prompt && p.prompt) || (!prev.kind && p.kind)) defs.set(p.id, { ...(prev || {}), ...Object.fromEntries(Object.entries(p).filter(([, v]) => v != null && v !== "")) });
  }
  const imageOf = (id, seen = new Set()) => {
    const d = defs.get(id);
    if (!d || seen.has(id)) return id;
    seen.add(id);
    return d.kind === "reuse" && d.reuse ? imageOf(d.reuse, seen) : id;
  };
  for (const d of defs.values()) { d.kind = d.kind || (d.reuse ? "reuse" : "generated"); d.image = imageOf(d.id); }
  return defs;
}
function planSize(plan) {
  const [W, H] = normalizeAspect(plan.aspect || "16:9").split("x").map(Number);
  return { W, H };
}
function readLookSafe(file) {
  if (!file || !fs.existsSync(file)) return readLook(null);
  try {
    return readLook(file);
  } catch {
    return readLook(null);
  }
}
function imagerySection(file) {
  if (!file || !fs.existsSync(file)) return null;
  const t = fs.readFileSync(file, "utf8");
  const m = t.match(/^##\s+Imagery[^\n]*\n([\s\S]*?)(?=^##\s|(?![\s\S]))/m);
  if (!m) return null;
  const body = m[1].replace(/```[\s\S]*?```/g, " ").replace(/[#*_`>|]/g, " ").replace(/^\s*[-•]\s+/gm, "").replace(/\s+/g, " ").trim();
  return body ? words(body).slice(0, 80).join(" ") : null;
}

// ------------------------------------------------------------------ key
function hsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return [h, mx ? d / mx : 0, mx];
}
const inBand = (x, y, w, h, bw, bh) => x < bw || x >= w - bw || y < bh || y >= h - bh;

// Edge band, subject box, centre patch and spill of keyed RGBA frames.
function measureKeyed(frames, w, h, spill) {
  const bw = Math.max(3, Math.round(w * 0.06)), bh = Math.max(3, Math.round(h * 0.06));
  let bandN = 0, bandT = 0, cN = 0, cO = 0, edgeN = 0, spillN = 0;
  let ux0 = 1e9, uy0 = 1e9, ux1 = -1, uy1 = -1;
  const touches = { top: false, bottom: false, left: false, right: false };
  const colMin = Math.max(3, Math.round(0.015 * h)), rowMin = Math.max(3, Math.round(0.015 * w));
  for (const f of frames) {
    const cols = new Int32Array(w), rows = new Int32Array(h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (f[(y * w + x) * 4 + 3] > 127) { cols[x]++; rows[y]++; }
    let x0 = -1, x1 = -1, y0 = -1, y1 = -1;
    for (let x = 0; x < w; x++) if (cols[x] >= colMin) { if (x0 < 0) x0 = x; x1 = x; }
    for (let y = 0; y < h; y++) if (rows[y] >= rowMin) { if (y0 < 0) y0 = y; y1 = y; }
    const has = x0 >= 0 && y0 >= 0;
    const t = has ? { top: y0 <= 1, bottom: y1 >= h - 2, left: x0 <= 1, right: x1 >= w - 2 } : touches;
    for (const k of Object.keys(touches)) touches[k] = touches[k] || t[k];
    if (has) { ux0 = Math.min(ux0, x0); uy0 = Math.min(uy0, y0); ux1 = Math.max(ux1, x1); uy1 = Math.max(uy1, y1); }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const a = f[(y * w + x) * 4 + 3];
        if (inBand(x, y, w, h, bw, bh)) {
          // a subject standing in the edge band (torso at the bottom, say) is not a keying failure there
          const skip = has && ((t.bottom && y >= h - bh && x >= x0 - bw && x <= x1 + bw) || (t.top && y < bh && x >= x0 - bw && x <= x1 + bw) || (t.left && x < bw && y >= y0 - bh && y <= y1 + bh) || (t.right && x >= w - bw && y >= y0 - bh && y <= y1 + bh));
          if (!skip) { bandN++; if (a <= 25) bandT++; }
        }
        if (spill && a > 200 && x > 2 && y > 2 && x < w - 3 && y < h - 3) {
          const edge = f[(y * w + x - 2) * 4 + 3] < 30 || f[(y * w + x + 2) * 4 + 3] < 30 || f[((y - 2) * w + x) * 4 + 3] < 30 || f[((y + 2) * w + x) * 4 + 3] < 30;
          if (edge) {
            edgeN++;
            const i = (y * w + x) * 4, r = f[i], g = f[i + 1], b = f[i + 2];
            if (spill === "green" ? g - Math.max(r, b) > 18 : b - Math.max(r, g) > 18) spillN++;
          }
        }
      }
    }
    if (has) {
      const px0 = Math.round(x0 + 0.3 * (x1 - x0)), px1 = Math.round(x0 + 0.7 * (x1 - x0)), py0 = Math.round(y0 + 0.3 * (y1 - y0)), py1 = Math.round(y0 + 0.7 * (y1 - y0));
      for (let y = py0; y <= py1; y++) for (let x = px0; x <= px1; x++) { cN++; if (f[(y * w + x) * 4 + 3] >= 230) cO++; }
    }
  }
  const box = ux1 >= 0 ? { x: ux0 / w, y: uy0 / h, w: (ux1 - ux0 + 1) / w, h: (uy1 - uy0 + 1) / h } : null;
  return { border: bandN ? bandT / bandN : 0, centre: cN ? cO / cN : 0, box, touches, spill: edgeN ? spillN / edgeN : 0 };
}

function chromaFilter(hex, sim, blend, type, fmt) {
  return `chromakey=0x${hex}:${sim}:${blend},despill=type=${type},format=${fmt}`;
}
const toHex = (rgb) => rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

async function key() {
  if (!args.clip || !args.out) die("PROBLEM: key needs --clip <video> and --out <dir>");
  need("ffmpeg");
  const clip = path.resolve(String(args.clip));
  if (!fs.existsSync(clip)) die(`PROBLEM: clip not found: ${args.clip}`);
  const out = path.resolve(String(args.out));
  fs.mkdirSync(out, { recursive: true });
  const info = probe(clip);
  const D = info.duration;
  if (!(D > 0.3)) die(`PROBLEM: ${args.clip} is ${D}s long; nothing to key`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rasa-key-"));
  const AW = Math.min(480, info.width) - (Math.min(480, info.width) % 2), AH = Math.round((AW * info.height) / info.width / 2) * 2;
  const times = [0.1, 0.3, 0.5, 0.7, 0.9].map((q) => r3(Math.min(D - 0.05, q * D)));
  times.forEach((t, i) => sh("ffmpeg", ["-y", "-v", "error", "-ss", String(t), "-i", clip, "-frames:v", "1", "-vf", `scale=${AW}:${AH}`, path.join(tmp, `s${i + 1}.png`)]));
  const src = times.map((_, i) => decodePng(path.join(tmp, `s${i + 1}.png`)));

  // ---- which screen is it? the outer 6% of five frames
  const warnings = [];
  const bw = Math.max(3, Math.round(AW * 0.06)), bh = Math.max(3, Math.round(AH * 0.06));
  let total = 0, nG = 0, nB = 0;
  const gS = [[], [], []], bS = [[], [], []];
  for (const im of src) {
    for (let y = 0; y < AH; y += 2) for (let x = 0; x < AW; x += 2) {
      if (!inBand(x, y, AW, AH, bw, bh)) continue;
      const i = (y * AW + x) * 3, r = im.rgb[i], g = im.rgb[i + 1], b = im.rgb[i + 2], [hu, sa, va] = hsv(r, g, b);
      total++;
      if (hu >= 80 && hu <= 160 && sa > 0.35 && va > 0.15) { nG++; gS[0].push(r); gS[1].push(g); gS[2].push(b); }
      else if (hu >= 190 && hu <= 250 && sa > 0.35 && va > 0.15) { nB++; bS[0].push(r); bS[1].push(g); bS[2].push(b); }
    }
  }
  const matte = String(args.matte || "auto");
  const colorArg = String(args.color || "auto").toLowerCase();
  let color = null, type = "green";
  const med = (S) => S.map(median);
  if (/^#?[0-9a-f]{6}$/.test(colorArg)) {
    color = colorArg.replace("#", "");
    const [hu] = hsv(...hexRGB(color).slice(0, 3));
    type = hu >= 190 && hu <= 270 ? "blue" : "green";
  } else if (colorArg === "green" || (colorArg === "auto" && nG / total >= 0.6)) {
    color = nG / total >= 0.3 ? toHex(med(gS)) : "00b140";
  } else if (colorArg === "blue" || (colorArg === "auto" && nB / total >= 0.6)) {
    color = nB / total >= 0.3 ? toHex(med(bS)) : "0047bb";
    type = "blue";
  }
  if (colorArg === "blue") type = "blue";
  let method = matte === "ai" ? "ai" : matte === "chroma" ? "chroma" : color ? "chroma" : "ai";
  if (method === "chroma" && !color) { color = "00b140"; warnings.push("no green or blue screen found at the edges; keyed on the default green anyway (--matte chroma)"); }

  const webm = path.join(out, "presenter.webm");
  const fmtOut = "yuva420p";
  let similarity = null, blend = null, tuned = null;
  if (method === "chroma") {
    blend = args.blend !== undefined ? Number(args.blend) : 0.06;
    const evalSim = (sim) => {
      const f = chromaFilter(color, sim, blend, type, "rgba");
      const raw = sh("ffmpeg", ["-v", "error", "-framerate", "1", "-i", path.join(tmp, "s%d.png"), "-vf", f, "-f", "rawvideo", "-pix_fmt", "rgba", "-"], { buffer: true }).stdout;
      const n = AW * AH * 4, frames = [];
      for (let i = 0; i < times.length; i++) frames.push(raw.subarray(i * n, (i + 1) * n));
      return measureKeyed(frames, AW, AH, type);
    };
    if (args.similarity !== undefined) {
      similarity = Number(args.similarity);
      tuned = evalSim(similarity);
    } else {
      let best = null;
      for (let sim = 0.06; sim <= 0.2201; sim += 0.02) {
        const s = r2(sim), m = evalSim(s);
        const score = m.border - 3 * Math.max(0, 0.98 - m.centre);
        if (!best || score > best.score) best = { s, m, score };
        if (m.border >= 0.97 && m.centre >= 0.98) { best = { s, m, score, pass: true }; break; }
      }
      similarity = best.s;
      tuned = best.m;
      if (!best.pass) warnings.push(`no similarity between 0.06 and 0.22 clears the edges (${Math.round(best.m.border * 100)}% transparent) and keeps the subject solid (${Math.round(best.m.centre * 100)}%): uneven-lighting or a screen that is not one colour`);
    }
    // lighting: how much the screen's brightness varies along the edge
    const lum = [];
    for (let k = 0; k < gS[0].length || k < bS[0].length; k += 7) {
      const S = type === "green" ? gS : bS;
      if (S[0][k] !== undefined) lum.push(0.2126 * S[0][k] + 0.7152 * S[1][k] + 0.0722 * S[2][k]);
    }
    if (lum.length > 20) {
      const mean = lum.reduce((a, b) => a + b, 0) / lum.length, sd = Math.sqrt(lum.reduce((a, b) => a + (b - mean) ** 2, 0) / lum.length);
      if (mean > 0 && sd / mean > 0.18) warnings.push("uneven-lighting");
    }
    err(`KEY ${color} ${type} similarity ${similarity} blend ${blend}`);
    const vf = chromaFilter(color, similarity, blend, type, fmtOut);
    try {
      sh("ffmpeg", ["-y", "-v", "error", "-i", clip, "-an", "-vf", vf, "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-auto-alt-ref", "0", "-b:v", "0", "-crf", "30", "-g", String(Math.max(1, Math.round(info.fps))), "-row-mt", "1", "-deadline", "good", "-cpu-used", "4", webm], { timeout: 3600000 });
    } catch (e) {
      die(`PROBLEM: could not encode the keyed video: ${e.message}`);
    }
  } else {
    err("KEY ai matte (hyperframes remove-background); this is slow on CPU");
    const r = spawnSync("npx", ["--yes", "hyperframes", "remove-background", clip, "-o", webm], { encoding: "utf8", timeout: 3600000, maxBuffer: 64 * 1024 * 1024 });
    if (r.status !== 0 || !fs.existsSync(webm)) die(`PROBLEM: remove-background failed:\n${String(r.stdout + r.stderr).trim().split("\n").slice(-8).join("\n")}`);
    warnings.push("ai-matte");
    color = null;
    type = null;
  }

  // ---- verify on the file we actually wrote (alpha survives lossy VP9 only if we look at the encoded result)
  const finals = times.map((t) => frameRGBA(webm, t, AW, AH, { alpha: true }));
  const m = measureKeyed(finals, AW, AH, type);
  if (!m.box) die("PROBLEM: the keyed video is empty: nothing was left after keying. Try --color, --similarity or --matte ai");
  if (m.touches.bottom || m.touches.left || m.touches.right || m.touches.top) warnings.push("subject-touches-edge");
  if (method === "chroma" && m.spill > 0.15) warnings.push("spill");
  const subject = { x: r3(m.box.x), y: r3(m.box.y), w: r3(m.box.w), h: r3(m.box.h) };
  const keyJson = {
    method, color: color ? "#" + color : null, similarity, blend, width: info.width, height: info.height, fps: info.fps, duration: info.duration, has_audio: info.has_audio,
    subject, head: { x: r3(subject.x + subject.w / 2), y: subject.y },
    border_transparent: r3(m.border), center_opaque: r3(m.centre), warnings: [...new Set(warnings)],
    webm: "presenter.webm", clip,
  };
  writeFile(path.join(out, "key.json"), JSON.stringify(keyJson, null, 2) + "\n");

  // ---- key-check.png: three frames over grey (top) and over magenta (bottom), labelled
  const TW = 640, TH = Math.round((TW * AH) / AW / 2) * 2, pad = 10, head = 30, foot = 26;
  const cv = new Canvas(pad + 3 * (TW + pad), head + 2 * (TH + pad) + foot, [24, 24, 28, 255]);
  cv.text(`PRESENTER KEY ${keyJson.method.toUpperCase()} ${keyJson.color || ""} SIM ${similarity ?? "-"} BLEND ${blend ?? "-"}`, pad, 8, 2, [240, 240, 240, 255]);
  const kt = [0.2, 0.5, 0.8].map((q) => r3(q * D));
  kt.forEach((t, i) => {
    const f = frameRGBA(webm, t, TW, TH, { alpha: true });
    [[128, 128, 128], [255, 0, 255]].forEach((bg, row) => {
      const x = pad + i * (TW + pad), y = head + row * (TH + pad);
      cv.rect(x, y, TW, TH, [...bg, 255]);
      cv.blit(f, TW, TH, x, y);
      cv.text(`${row ? "OVER MAGENTA" : "OVER GREY"} T=${t}S`, x + 6, y + 6, 2, [255, 255, 255, 255]);
    });
  });
  cv.text(`EDGES ${Math.round(m.border * 100)}% TRANSPARENT  SUBJECT ${Math.round(m.centre * 100)}% SOLID  ${keyJson.warnings.join(" ").toUpperCase()}`, pad, cv.h - foot + 6, 2, keyJson.warnings.length ? [255, 210, 90, 255] : [160, 230, 160, 255]);
  cv.save(path.join(out, "key-check.png"));
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(JSON.stringify({ ok: true, ...keyJson, key: path.join(out, "key.json"), webm_path: webm, check: path.join(out, "key-check.png") }, null, 2));
}

// ------------------------------------------------------------------ beats
function loadWords(file, clipId) {
  if (!fs.existsSync(file)) die(`PROBLEM: transcript not found: ${file}`);
  let j;
  try {
    j = readJSON(file);
  } catch (e) {
    die(`PROBLEM: ${file} is not valid JSON: ${e.message}`);
  }
  let list = Array.isArray(j) ? j : Array.isArray(j.words) ? j.words : null;
  if (!list && Array.isArray(j.clips)) {
    // reel scan's footage.json: the clip's transcript file holds the words
    const c = (clipId && j.clips.find((x) => x.id === clipId)) || j.clips.find((x) => x.transcript);
    if (!c || !c.transcript) die("PROBLEM: that footage.json has no transcript (scan ran with --no-transcribe, or the clip has no speech)");
    const tp = [c.transcript, path.resolve(path.dirname(file), "..", c.transcript), path.resolve(path.dirname(file), path.basename(c.transcript))].find((p) => fs.existsSync(p));
    if (!tp) die(`PROBLEM: transcript ${c.transcript} named by ${file} was not found`);
    return loadWords(tp);
  }
  if (!list) die(`PROBLEM: ${file} is neither a word array, {words: [...]}, nor a reel scan footage.json`);
  const w = list
    .map((x) => ({ text: String(x.text ?? x.word ?? "").trim(), start: Number(x.start), end: Number(x.end) }))
    .filter((x) => x.text && Number.isFinite(x.start) && Number.isFinite(x.end) && !/^[♪♫]+$/.test(x.text));
  if (!w.length) die(`PROBLEM: ${file} has no words`);
  return w.sort((a, b) => a.start - b.start);
}

function beats() {
  if (!args.transcript || !args.out) die("PROBLEM: beats needs --transcript <words.json> and --out <beats.json>");
  const W = loadWords(path.resolve(String(args.transcript)), args.clip ? String(args.clip) : null);
  const min = Number(args.min ?? 2.5), max = Number(args.max ?? 9);
  if (!(min > 0 && max > min)) die("PROBLEM: need 0 < --min < --max");
  const fixedDur = args.duration !== undefined ? Number(args.duration) : null;
  if (fixedDur !== null) {
    // --duration is the clip's length: words past it are timestamp noise, nothing may end after it
    for (let i = W.length - 1; i > 0 && W[i].start >= fixedDur; i--) W.pop();
    W.forEach((w) => { w.end = Math.min(w.end, fixedDur); });
  }
  const dur = fixedDur !== null ? fixedDur : r2(W[W.length - 1].end + 0.3);
  // 1. sentence ends and pauses
  let segs = [];
  let cur = [0];
  for (let i = 0; i < W.length - 1; i++) {
    const brk = /[.?!]["'”’)]*$/.test(W[i].text) || W[i + 1].start - W[i].end >= 0.35;
    if (brk) { segs.push([cur[0], i]); cur = [i + 1]; }
  }
  segs.push([cur[0], W.length - 1]);
  const span = (s) => W[s[1]].end - W[s[0]].start;
  // 2. merge what is shorter than min into the neighbour that makes the shorter result
  for (let guard = 0; guard < 500; guard++) {
    const k = segs.findIndex((s) => span(s) < min);
    if (k < 0 || segs.length === 1) break;
    const left = k > 0 ? W[segs[k][1]].end - W[segs[k - 1][0]].start : Infinity;
    const right = k < segs.length - 1 ? W[segs[k + 1][1]].end - W[segs[k][0]].start : Infinity;
    if (left === Infinity && right === Infinity) break;
    if (left <= right) segs.splice(k - 1, 2, [segs[k - 1][0], segs[k][1]]);
    else segs.splice(k, 2, [segs[k][0], segs[k + 1][1]]);
  }
  // 3. split what is longer than max at the biggest pause that leaves both halves >= min (else the word nearest the middle)
  const split = (s) => {
    if (span(s) <= max || s[1] - s[0] < 1) return [s];
    let best = -1, bestGap = -1;
    for (let i = s[0]; i < s[1]; i++) {
      const a = W[i].end - W[s[0]].start, b = W[s[1]].end - W[i + 1].start;
      if (a < Math.min(min, span(s) / 3) || b < Math.min(min, span(s) / 3)) continue;
      const gap = W[i + 1].start - W[i].end;
      if (gap > bestGap) { bestGap = gap; best = i; }
    }
    if (best < 0) {
      const mid = (W[s[0]].start + W[s[1]].end) / 2;
      best = s[0];
      for (let i = s[0]; i < s[1]; i++) if (Math.abs(W[i].end - mid) < Math.abs(W[best].end - mid)) best = i;
    }
    return [...split([s[0], best]), ...split([best + 1, s[1]])];
  };
  segs = segs.flatMap(split);
  // 4. tile the timeline: boundaries sit in the middle of the pause between beats, so the plan covers the speech without gaps
  const out = segs.map((s, i) => {
    const start = i === 0 ? 0 : r2((W[segs[i - 1][1]].end + W[s[0]].start) / 2);
    const end = i === segs.length - 1 ? (fixedDur !== null ? r2(fixedDur) : r2(Math.max(dur, W[s[1]].end))) : r2((W[s[1]].end + W[segs[i + 1][0]].start) / 2);
    return { id: `b${i + 1}`, start, end, text: W.slice(s[0], s[1] + 1).map((w) => w.text).join(" "), words: [s[0], s[1]] };
  });
  const result = { duration: out[out.length - 1].end, words: W.length, min, max, beats: out };
  writeFile(path.resolve(String(args.out)), JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify({ ok: true, out: String(args.out), beats: out.length, duration: result.duration, lengths: out.map((b) => r2(b.end - b.start)) }, null, 2));
}

// ------------------------------------------------------------------ check
const SLOP = ["stunning", "breathtaking", "8k", "4k", "hyper-realistic", "hyperrealistic", "ultra-detailed", "masterpiece", "trending on artstation", "octane render", "unreal engine", "award-winning", "epic"];
const TEXT_WORDS = /\b(text|texts|letters?|lettering|words?|signage|signs?|logos?|watermarks?|typography|captions?|subtitles?|inscriptions?|handwriting|written|writing|labels?|headlines?|slogans?)\b/i;

function check() {
  const planFile = path.resolve(String(args.plan || ""));
  const plan = readPlan(args.plan ? planFile : null);
  const findings = [];
  const add = (level, beat, code, message, fix) => findings.push({ level, beat: beat || null, code, message, fix: fix || "" });
  const { W, H } = planSize(plan);
  let keyJ = null, beatsJ = null;
  if (args.key) { try { keyJ = readJSON(String(args.key)); } catch { die(`PROBLEM: cannot read --key ${args.key}`); } }
  if (args.beats) { try { beatsJ = readJSON(String(args.beats)); } catch { die(`PROBLEM: cannot read --beats ${args.beats}`); } }
  const imagegen = String(args.imagegen || "ready");
  const B = plan.beats;
  const planDur = Number(B[B.length - 1].end);
  const duration = Number((beatsJ && beatsJ.duration) || (keyJ && keyJ.duration) || planDur);

  // basics and the speech is covered
  B.forEach((b, i) => {
    b.id = b.id || `b${i + 1}`;
    if (!Number.isFinite(Number(b.start)) || !Number.isFinite(Number(b.end)) || Number(b.end) <= Number(b.start)) add("error", b.id, "beat-time", `${b.id} has no usable start/end (${b.start} to ${b.end})`, `give ${b.id} a start and an end with end > start`);
  });
  if (findings.some((f) => f.code === "beat-time")) return report(findings, plan, duration);
  const first = Number(B[0].start);
  if (first > 0.2) add("error", B[0].id, "coverage-start", `the first beat starts at ${first}s; the speech may begin before that`, `start ${B[0].id} at 0`);
  for (let i = 1; i < B.length; i++) {
    const gap = Number(B[i].start) - Number(B[i - 1].end);
    if (gap > 0.15) add("error", B[i].id, "coverage-gap", `${r2(gap)}s of speech falls between ${B[i - 1].id} and ${B[i].id}`, `extend ${B[i - 1].id} to ${B[i].start} (or start ${B[i].id} at ${B[i - 1].end})`);
    if (gap < -0.05) add("error", B[i].id, "coverage-overlap", `${B[i - 1].id} and ${B[i].id} overlap by ${r2(-gap)}s`, `end ${B[i - 1].id} where ${B[i].id} starts (${B[i].start})`);
  }
  const lastEnd = Number(B[B.length - 1].end);
  if ((beatsJ || keyJ) && lastEnd < duration - 0.3) add("error", B[B.length - 1].id, "coverage-end", `the last beat ends at ${lastEnd}s but the clip runs ${r2(duration)}s`, `extend ${B[B.length - 1].id} to ${r2(duration)}`);
  if (lastEnd > duration + 0.05 && (beatsJ || keyJ)) add("warning", B[B.length - 1].id, "coverage-long", `the last beat ends at ${lastEnd}s, after the clip (${r2(duration)}s)`, `end ${B[B.length - 1].id} at ${r2(duration)}`);
  B.forEach((b, i) => {
    const d = b.end - b.start;
    if (d < 1.5) add("error", b.id, "beat-short", `${b.id} is ${r2(d)}s; a beat needs 1.5 to 12 s`, i > 0 ? `merge ${b.id} into ${B[i - 1].id}` : `merge ${b.id} into ${B[1] ? B[1].id : "the next beat"}`);
    if (d > 12) add("error", b.id, "beat-long", `${b.id} is ${r2(d)}s; a beat needs 1.5 to 12 s`, `split ${b.id} at the biggest pause in its words`);
    if (i === 0 && b.transition_in && b.transition_in !== "cut") add("warning", b.id, "first-transition", `the first beat's transition_in is "${b.transition_in}"`, `set ${b.id}.transition_in to "cut"`);
    if (!b.say) add("warning", b.id, "no-say", `${b.id} has no "say" (what is spoken)`, `copy the beat's words into ${b.id}.say`);
  });

  // layouts
  B.forEach((b) => {
    if (!LAYOUTS.includes(b.layout)) add("error", b.id, "layout-invalid", `${b.id} layout "${b.layout}" is not one of ${LAYOUTS.join(", ")}`, `set ${b.id}.layout to a listed layout`);
  });
  let run = 1;
  for (let i = 1; i < B.length; i++) {
    run = B[i].layout === B[i - 1].layout ? run + 1 : 1;
    if (run === 4) add("error", B[i].id, "layout-run", `${run} beats in a row use ${B[i].layout} (b${i - 2} to ${B[i].id})`, `change ${B[i].id} to a different layout (a cutaway, presenter-corner or split)`);
  }
  const distinct = new Set(B.map((b) => b.layout));
  if (duration >= 30 && distinct.size < 3) add("error", null, "layout-variety", `${distinct.size} distinct layout(s) in ${r2(duration)}s; a film this long needs at least 3`, "vary the layouts: add a plate-only cutaway and a presenter-left or presenter-right beat");
  const plateOnly = B.filter((b) => b.layout === "plate-only");
  const poTotal = plateOnly.reduce((s, b) => s + (b.end - b.start), 0);
  if (poTotal > 0.35 * Math.max(duration, 1)) add("error", null, "plate-only-share", `plate-only beats are ${Math.round((100 * poTotal) / duration)}% of the runtime (limit 35%)`, "turn some plate-only beats into presenter-left/right beats; the person should stay on screen most of the time");
  plateOnly.forEach((b) => { if (b.end - b.start > 6) add("error", b.id, "plate-only-long", `${b.id} is a ${r2(b.end - b.start)}s cutaway (limit 6s)`, `shorten ${b.id} or give half of it a presenter layout`); });

  // plates
  const defs = resolvePlates(plan);
  B.forEach((b) => {
    const p = b.plate;
    if (b.layout === "presenter-only" && p) add("warning", b.id, "plate-ignored", `${b.id} is presenter-only but names plate ${p.id}; it will not be shown`, `set ${b.id}.plate to null or change its layout`);
    if (!p && b.layout !== "presenter-only") add("error", b.id, "plate-missing", `${b.id} (${b.layout}) has no plate`, `give ${b.id} a plate, or make its layout presenter-only`);
    if (p && !p.id) add("error", b.id, "plate-id", `${b.id}'s plate has no id`, `give the plate an id like "p${B.indexOf(b) + 1}"`);
  });
  const real = [...defs.values()].filter((d) => d.kind === "generated" || d.kind === "designed");
  if (!real.length) add("error", null, "no-plate", "the plan has no generated or designed plate", "give at least one beat a plate with kind generated (or designed)");
  const genIds = real.filter((d) => d.kind === "generated");
  const maxGen = Math.ceil(duration / 3.5);
  if (genIds.length > maxGen) add("error", null, "too-many-plates", `${genIds.length} generated plates in ${r2(duration)}s (limit ${maxGen}: cost and pacing)`, `drop ${genIds.length - maxGen} plate(s): hold one image across two beats or reuse an earlier plate with a new camera move`);
  const held = new Map();
  B.forEach((b) => { if (b.plate && b.plate.id) held.set(b.plate.id, (held.get(b.plate.id) || 0) + (b.end - b.start)); });
  for (const [id, t] of held) {
    const d = defs.get(id);
    if (d && d.kind !== "reuse" && t < 2.5) add("error", B.find((b) => b.plate && b.plate.id === id).id, "plate-hold", `plate ${id} is on screen ${r2(t)}s in total (minimum 2.5s)`, `merge its beat into a neighbour or hold ${id} through the next beat`);
  }
  for (const d of defs.values()) {
    const where = (B.find((b) => b.plate && b.plate.id === d.id) || {}).id;
    if (d.kind === "reuse") {
      const tgt = d.reuse ? defs.get(d.reuse) : null;
      if (!tgt || tgt.id === d.id || (tgt.kind === "reuse" && tgt.image === d.id)) add("error", where, "reuse-missing", `plate ${d.id} reuses "${d.reuse}", which is not a plate in this plan`, `point reuse at an existing plate id (${[...defs.keys()].filter((k) => k !== d.id).join(", ") || "none yet"})`);
      continue;
    }
    if (!["generated", "designed", "reuse"].includes(d.kind)) add("error", where, "plate-kind", `plate ${d.id} kind "${d.kind}" is not generated, designed or reuse`, `set kind to "generated"`);
    const pr = String(d.prompt || "");
    if (words(pr).length < 12) add("error", where, "prompt-short", `plate ${d.id}'s prompt is ${words(pr).length} words (minimum 12): a short prompt gets a generic picture`, `describe subject, setting, lens, light, palette and where the person will stand (12+ words)`);
    if (d.kind === "generated") {
      const tm = pr.match(TEXT_WORDS);
      if (tm) add("error", where, "prompt-text", `plate ${d.id}'s prompt mentions "${tm[0]}"; image models draw letters badly and it spoils the plate`, `remove "${tm[0]}" from the prompt (put the words in a graphic instead)`);
      const low = pr.toLowerCase();
      for (const s of SLOP) if (new RegExp(`(^|[^a-z0-9])${s.replace(/[-]/g, "[- ]?")}($|[^a-z0-9])`, "i").test(low)) add("error", where, "prompt-slop", `plate ${d.id}'s prompt says "${s}", a slop word that flattens the picture`, `replace "${s}" with something concrete: a lens, a light, a material, a place`);
      if (imagegen === "off") add("warning", where, "imagegen-off", `plate ${d.id} is generated but image generation is off; it will be drawn as a designed backdrop`, `no change needed, or set kind to "designed" and describe the backdrop`);
    }
    if (!d.camera) add("error", where, "camera-missing", `plate ${d.id} has no camera move`, `set camera to one of ${CAMERAS.join(", ")}`);
    else if (!CAMERAS.includes(d.camera)) add("error", where, "camera-invalid", `plate ${d.id} camera "${d.camera}" is not one of ${CAMERAS.join(", ")}`, `use a listed camera move`);
  }
  // prompts must differ
  const seen = new Map();
  for (const d of real) {
    const k = String(d.prompt || "").toLowerCase().replace(/\s+/g, " ").trim();
    if (!k) continue;
    if (seen.has(k)) add("error", (B.find((b) => b.plate && b.plate.id === d.id) || {}).id, "prompt-duplicate", `plates ${seen.get(k)} and ${d.id} have the same prompt`, `make ${d.id} a "reuse" of ${seen.get(k)} with a different camera move, or write a new prompt`);
    else seen.set(k, d.id);
  }
  // beats naming the same plate id again must not contradict the first
  const cams = [];
  B.forEach((b, i) => { const pc = b.plate && (b.plate.camera || (defs.get(b.plate.id) || {}).camera); const prev = B[i - 1]; if (pc && !(prev && prev.plate && prev.plate.id === b.plate.id)) cams.push(pc); });
  if (cams.length >= 3) {
    const counts = {};
    cams.forEach((c) => (counts[c] = (counts[c] || 0) + 1));
    const [top, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    if (n / cams.length > 0.6) add("error", null, "camera-monotone", `${n} of ${cams.length} plates use "${top}"`, `change ${Math.ceil(n - 0.6 * cams.length)} of them to other moves (pan-left, tilt-up, drift, pull-out...)`);
  }
  // style lock
  const lock = words(plan.style && plan.style.lock).length;
  if (lock < 12 || lock > 80) add("error", null, "style-lock", `style.lock is ${lock} words (needs 12 to 80)`, "write the one look every image obeys: medium, light, palette, lens, grain");

  // graphics
  B.forEach((b) => {
    (b.graphics || []).forEach((g, n) => {
      const tag = `${b.id} graphic ${n + 1} (${g.type})`;
      if (!GFX_TYPES.includes(g.type)) add("error", b.id, "graphic-type", `${tag}: type must be one of ${GFX_TYPES.join(", ")}`, "use a listed type");
      if (!ZONES.includes(g.zone)) add("error", b.id, "graphic-zone", `${tag}: zone "${g.zone}" must be one of ${ZONES.join(", ")}`, "use a listed zone");
      const at = Number(g.at), out = Number(g.out);
      if (!Number.isFinite(at) || !Number.isFinite(out) || out <= at) add("error", b.id, "graphic-time", `${tag}: needs at < out in seconds (got ${g.at} to ${g.out})`, `set at and out as absolute clip seconds inside ${b.start}-${b.end}`);
      else if (at < b.start - 0.01 || out > b.end + 0.01) add("error", b.id, "graphic-outside", `${tag} runs ${at}-${out}s but ${b.id} is ${b.start}-${b.end}s`, `move it inside the beat (at ${Math.max(at, b.start)}, out ${Math.min(out, b.end)}), or move it to the beat it belongs to`);
      const txt = [].concat(g.text ?? "").join(" ");
      if (g.type === "kinetic-title" && words(txt).length > 8) add("error", b.id, "graphic-long", `${tag}: ${words(txt).length} words (titles are 8 words at most)`, "cut the title to its strongest 2 to 5 words");
      else if (words(txt).length > 16) add("warning", b.id, "graphic-long", `${tag}: ${words(txt).length} words is a lot to read in ${r2(out - at)}s`, "cut it down");
      if (ZONES.includes(g.zone) && LAYOUTS.includes(b.layout)) {
        const gr = graphicRect(g.zone, b.layout, keyJ, W, H, b.side, !!args.captions);
        const other = g.zone === "left" ? "right" : "left";
        if (gr.blocked) { add("error", b.id, "zone-blocked", `${tag}: only ${Math.round(gr.free * 100)}% of the frame is free on the ${g.zone} in ${b.layout} (needs 22%)`, `move the ${g.type} to zone ${other}, or change ${b.id}'s layout to ${g.zone === "left" ? "presenter-right" : "presenter-left"} (${freeText(b.layout, keyJ, W, H, b.side)})`); return; }
        const f = overlapFrac(gr.rect, occupied(b.layout, keyJ, W, H, b.side));
        if (f >= 0.4) add("error", b.id, "graphic-in-presenter", `${tag} sits in the ${g.zone} zone, where the presenter stands in ${b.layout}`, `move the ${g.type} to zone ${suggestZone(b.layout, keyJ, W, H, b.side)} (${freeText(b.layout, keyJ, W, H, b.side)}; top and bottom zones are for presenter-left, presenter-right and presenter-corner)`);
        else if (f >= 0.25) add("warning", b.id, "graphic-near-presenter", `${tag} in the ${g.zone} zone overlaps the presenter by ${Math.round(f * 100)}% in ${b.layout}`, `move the ${g.type} to zone ${suggestZone(b.layout, keyJ, W, H, b.side)} (${freeText(b.layout, keyJ, W, H, b.side)}; top and bottom zones are for presenter-left, presenter-right and presenter-corner)`);
      }
    });
  });
  // captions: a bottom graphic sits where the captions run
  if (args.captions && !isTall(W, H)) {
    B.forEach((b) => (b.graphics || []).forEach((g, n) => {
      if (g.zone !== "bottom") return;
      const z = zoneRect("bottom", W, H), by = CAP_BAND.wide[0] * H;
      if (z.y + z.h > by) add("warning", b.id, "caption-collision", `${b.id} graphic ${n + 1} (${g.type}) is in the bottom zone, which the captions use`, `build lifts bottom graphics above the caption band (to y ${Math.round(zoneRect("bottom", W, H, true).y)}-${Math.round(zoneRect("bottom", W, H, true).y + zoneRect("bottom", W, H, true).h)} px); keep the text to one line, or use another zone`);
    }));
  }
  // a plate keeps one side calm; a reuse that puts the presenter on its busy side fights the picture
  const sides = plateSides(plan, defs);
  B.forEach((b) => {
    const sd = presenterSide(b);
    if (!sd || !b.plate || !b.plate.id) return;
    const d = defs.get(b.plate.id), img = d && d.kind === "reuse" ? d.image : b.plate.id, keep = sides.get(img);
    if (keep && keep !== sd) add("warning", b.id, "plate-side-conflict", `${b.id} puts the presenter on the ${sd}, but plate ${img} keeps its ${keep} third clear for the person`, `use presenter-${keep} (or split with side ${keep}) here, or give ${b.id} a different plate`);
  });
  return report(findings, plan, duration);
}
function suggestZone(layout, key, W, H, side) {
  const occ = occupied(layout, key, W, H, side);
  return ZONES.map((z) => [z, overlapFrac(zoneRect(z, W, H), occ)]).sort((a, b) => a[1] - b[1])[0][0];
}
function report(findings, plan, duration) {
  const errors = findings.filter((f) => f.level === "error").length, warnings = findings.filter((f) => f.level === "warning").length;
  if (args.json) console.log(JSON.stringify({ ok: errors === 0, errors, warnings, duration: r2(duration), findings }, null, 2));
  else {
    for (const f of findings) console.log(`${f.level.toUpperCase()} ${f.beat || "plan"} ${f.code}: ${f.message}${f.fix ? ` -> ${f.fix}` : ""}`);
    console.log(`${errors} error(s), ${warnings} warning(s) in ${plan.beats.length} beats`);
  }
  process.exit(errors ? 2 : 0);
}

// ------------------------------------------------------------------ plates
function plates() {
  if (!args.plan || !args.out) die("PROBLEM: plates needs --plan <plan.json> and --out <images.json>");
  const planFile = path.resolve(String(args.plan));
  const plan = readPlan(planFile);
  const { W, H } = planSize(plan);
  const dir = path.resolve(String(args.dir || path.join(path.dirname(planFile), "plates")));
  const defs = resolvePlates(plan);
  const imagery = imagerySection(args.look ? String(args.look) : null);
  const sides = plateSides(plan, defs);
  const avoid = [...new Set([...String((plan.style && plan.style.avoid) || "").split(/\s*,\s*/).filter(Boolean), "text", "letters", "logos", "watermarks"])].join(", ");
  const images = [];
  for (const d of defs.values()) {
    if (d.kind !== "generated") continue;
    let prompt = String(d.prompt || "").trim().replace(/[.\s]+$/, "");
    const sd = sides.get(d.id);
    // one clause, on the side of the plate's longest use; never when the prompt already asks for room
    if (sd && !/\bthirds?\b|\bcalm\b|\buncluttered\b/i.test(prompt)) prompt += isTall(W, H) ? ". Keep the lower half calm and uncluttered: a person will stand there" : `. Keep the ${sd} third calm and uncluttered: a person will stand there`;
    images.push({ id: d.id, prompt, out: path.join(dir, `${d.id}.png`), aspect: plan.aspect || "16:9" });
  }
  const style = imagery || String((plan.style && plan.style.lock) || "");
  const batch = { aspect: plan.aspect || "16:9", style, avoid, refs: [], ...(images[0] ? { anchor: images[0].id } : {}), images };
  writeFile(path.resolve(String(args.out)), JSON.stringify(batch, null, 2) + "\n");
  console.log(JSON.stringify({ ok: true, out: String(args.out), images: images.length, anchor: batch.anchor || null, style_from: imagery ? "DESIGN.md ## Imagery" : "plan.style.lock", plates_dir: dir, ids: images.map((i) => i.id), reuse: [...defs.values()].filter((d) => d.kind === "reuse").map((d) => d.id), designed: [...defs.values()].filter((d) => d.kind === "designed").map((d) => d.id) }, null, 2));
}

// ------------------------------------------------------------------ spans: consecutive beats on one plate with one camera are one clip
function plateSpans(plan, defs) {
  const spans = [];
  for (const b of plan.beats) {
    const p = b.plate && b.plate.id && b.layout !== "presenter-only" ? b.plate : null;
    if (!p) continue;
    const d = defs.get(p.id) || { id: p.id, kind: "generated" };
    const camera = p.camera || d.camera || "static";
    const last = spans[spans.length - 1];
    if (last && last.plate === p.id && last.camera === camera && last.beats[last.beats.length - 1].end >= b.start - 0.05 && last.beats[last.beats.length - 1] === plan.beats[plan.beats.indexOf(b) - 1]) {
      last.beats.push(b);
      last.end = b.end;
    } else spans.push({ plate: p.id, image: d.image || p.id, kind: d.kind, camera, start: b.start, end: b.end, beats: [b], prompt: d.prompt || "" });
  }
  return spans;
}
function spanFor(spans, beat) {
  return spans.find((s) => s.beats.includes(beat));
}

// ------------------------------------------------------------------ stills
function stills() {
  if (!args.plan || !args.key || !args.plates || !args.out) die("PROBLEM: stills needs --plan, --key, --plates <dir> and --out <dir>");
  need("ffmpeg");
  const plan = readPlan(path.resolve(String(args.plan)));
  const keyFile = path.resolve(String(args.key));
  const key = readJSON(keyFile);
  const webm = path.join(path.dirname(keyFile), key.webm || "presenter.webm");
  if (!fs.existsSync(webm)) die(`PROBLEM: ${webm} not found (run presenter.mjs key first)`);
  const platesDir = path.resolve(String(args.plates));
  const out = path.resolve(String(args.out));
  fs.mkdirSync(out, { recursive: true });
  const { W, H } = planSize(plan);
  const look = readLookSafe(args.look ? String(args.look) : null);
  const defs = resolvePlates(plan);
  const spans = plateSpans(plan, defs);
  const bg = hexRGB(look.bg), accent = hexRGB(look.accent), ink = hexRGB(look.ink);
  const K = Math.max(2, Math.round(Math.max(W, H) / 640));
  const results = [];
  for (const b of plan.beats) {
    const t = r3((b.start + b.end) / 2);
    const g = geom(b.layout, key, W, H, b.side);
    const cv = new Canvas(W, H, [...bg.slice(0, 3), 255]);
    const missing = [];
    const sp = spanFor(spans, b);
    if (sp) {
      const file = path.join(platesDir, `${sp.image}.png`);
      const clipR = g.plateClip || { x: 0, y: 0, w: W, h: H };
      if (fs.existsSync(file)) {
        const dim = probe(file), c0 = Math.max(W / dim.width, H / dim.height);
        const cam = camAt(sp.camera, clamp((t - sp.start) / Math.max(0.01, sp.end - sp.start), 0, 1));
        const sw = Math.ceil(dim.width * c0 * cam.s), sh = Math.ceil(dim.height * c0 * cam.s);
        const x0 = clamp(Math.round((sw - W) / 2 - cam.x * W), 0, Math.max(0, sw - W)), y0 = clamp(Math.round((sh - H) / 2 - cam.y * H), 0, Math.max(0, sh - H));
        const px = frameRGBA(file, 0, W, H, { vf: `scale=${sw}:${sh}:flags=lanczos,crop=${W}:${H}:${x0}:${y0}` });
        // a split plate is centred in its own half (its subject is not cut by the frame centre)
        const sdx = g.plateClip && !isTall(W, H) ? clipR.x + clipR.w / 2 - W / 2 : 0, sdy = g.plateClip && isTall(W, H) ? clipR.y + clipR.h / 2 - H / 2 : 0;
        cv.blit(px, W, H, sdx, sdy, clipR);
      } else {
        // a designed (or not yet generated) plate: the look's ground with a gradient and its description
        for (let y = 0; y < H; y++) { const sh2 = 0.75 + 0.25 * (1 - y / H); for (let x = clipR.x; x < clipR.x + clipR.w; x++) { const i = (y * W + x) * 4; cv.d[i] = bg[0] * sh2; cv.d[i + 1] = bg[1] * sh2; cv.d[i + 2] = bg[2] * sh2; } }
        cv.text(`PLATE ${sp.plate} (${sp.kind === "generated" ? "IMAGE MISSING" : sp.kind.toUpperCase()})`, clipR.x + 24 * K / 2, H * 0.12, K + 1, ink);
        const lines = String(sp.prompt || "").slice(0, 150);
        cv.text(lines, clipR.x + 24 * K / 2, H * 0.12 + 12 * K, K, [ink[0], ink[1], ink[2], 200]);
        if (sp.kind === "generated") missing.push(sp.image);
      }
    }
    if (!g.hidden) {
      const s = g.s, w = Math.round(g.vid.vw * s), h = Math.round(g.vid.vh * s);
      const X = W / 2 + s * (g.vid.ox - W / 2) + g.tx, Y = H + s * (g.vid.oy - H) + g.ty;
      if (g.deco) {
        cv.rect(g.deco.x, g.deco.y, g.deco.w, g.deco.h, [...hexRGB(panelFill(look)).slice(0, 3), 235]);
      }
      const fr = frameRGBA(webm, clamp(t, 0, Math.max(0, key.duration - 0.1)), w, h, { alpha: true });
      cv.blit(fr, w, h, X, Y, g.clip);
      if (g.deco) cv.stroke(g.deco.x, g.deco.y, g.deco.w, g.deco.h, Math.max(2, K), accent);
    }
    (b.graphics || []).forEach((gr) => {
      const z = graphicRect(ZONES.includes(gr.zone) ? gr.zone : "center", b.layout, key, W, H, b.side).rect;
      cv.rect(z.x, z.y, z.w, z.h, [...accent.slice(0, 3), 46]);
      cv.stroke(z.x, z.y, z.w, z.h, Math.max(2, K - 1), [...accent.slice(0, 3), 255]);
      cv.rect(z.x, z.y, z.w, 9 * K + 6, [...accent.slice(0, 3), 235]);
      cv.text(String(gr.type).toUpperCase(), z.x + 6, z.y + 4, K, [0, 0, 0, 255], false);
      cv.text([].concat(gr.text ?? "").join(" / "), z.x + 10, z.y + 9 * K + 18, K + 1, [255, 255, 255, 255]);
      cv.text(`${gr.at}-${gr.out}S`, z.x + 10, z.y + z.h - 9 * K, K, [255, 255, 255, 190]);
    });
    cv.rect(0, 0, W, 11 * K + 8, [0, 0, 0, 150]);
    cv.text(`${b.id}  ${b.layout}  ${sp ? sp.camera : "NO PLATE"}  ${b.start}-${b.end}S`, 10, 6, K, [255, 255, 255, 255], false);
    const tag = "LAYOUT PREVIEW", tk = Math.max(1, K - 1);
    cv.rect(W - textWidth(tag, tk) - 16, H - 7 * tk - 14, textWidth(tag, tk) + 12, 7 * tk + 10, [0, 0, 0, 170]);
    cv.text(tag, W - textWidth(tag, tk) - 10, H - 7 * tk - 9, tk, [255, 255, 255, 230], false);
    const file = path.join(out, `${safeId(b.id)}.png`);
    cv.save(file);
    results.push({ beat: b.id, file, t, layout: b.layout, plate: sp ? sp.plate : null, camera: sp ? sp.camera : null, say: b.say || "", missing_plate_image: missing.length > 0 });
  }
  writeFile(path.join(out, "stills.json"), JSON.stringify({ aspect: `${W}x${H}`, stills: results }, null, 2) + "\n");
  console.log(JSON.stringify({ ok: true, out, count: results.length, size: `${W}x${H}`, stills: results.map((r) => ({ beat: r.beat, file: r.file, t: r.t, layout: r.layout, plate: r.plate, camera: r.camera })), missing_plate_images: [...new Set(results.filter((r) => r.missing_plate_image).map((r) => r.plate))] }, null, 2));
}

// ------------------------------------------------------------------ build
const MARK = "<!-- rasanai:presenter -->";
const SCAFFOLD = "rasanai:scaffold";

function groupWords(ws, { maxWords, maxChars }) {
  const groups = [];
  let cur = [];
  const flush = () => { if (cur.length) groups.push({ words: cur }); cur = []; };
  ws.forEach((w, i) => {
    const prev = ws[i - 1];
    const len = cur.map((x) => x.text).join(" ").length + w.text.length + 1;
    if (cur.length && (w.start - prev.end >= 0.15 || cur.length >= maxWords || len > maxChars || /[.!?]$/.test(prev.text))) flush();
    cur.push(w);
  });
  flush();
  groups.forEach((g, i) => {
    const next = groups[i + 1];
    g.in = Math.max(0, g.words[0].start - 0.08);
    if (i > 0) g.in = Math.max(g.in, groups[i - 1].out);
    const nextIn = next ? next.words[0].start - 0.08 : Infinity;
    g.out = Math.min(nextIn - 0.05 > g.in ? nextIn - 0.05 : Infinity, g.words[g.words.length - 1].end + 0.6);
    if (g.out - g.in < 0.5) g.out = Math.min(g.in + 0.5, next ? Math.max(nextIn, g.in + 0.5) : g.in + 0.5);
  });
  return groups;
}

// where a caption group sits: the centred band, or the free column beside the presenter / panel
function captionRect(b, key, W, H) {
  const tall = isTall(W, H), band = tall ? CAP_BAND.tall : CAP_BAND.wide;
  const base = { x: Math.round(0.06 * W), y: Math.round(band[0] * H), w: Math.round(0.88 * W), h: Math.round(band[1] * H), col: false };
  if (!b || tall) return base;
  const g = geom(b.layout, key, W, H, b.side), m = 0.03 * W;
  let x0 = null, x1 = null;
  if (b.layout === "presenter-left") { x0 = g.box.x + g.box.w + m; x1 = W - m; }
  else if (b.layout === "presenter-right") { x0 = m; x1 = g.box.x - m; }
  else if (b.layout === "split" && g.plateClip) { x0 = g.plateClip.x + m; x1 = g.plateClip.x + g.plateClip.w - m; }
  else if (b.layout === "presenter-corner") { x0 = m; x1 = g.clip.x - m; }
  if (x0 === null || x1 - x0 < 0.28 * W) return base;
  return { ...base, x: Math.round(x0), w: Math.round(x1 - x0), col: true };
}
function captionsComp({ id, W, H, look, groups, total, fontCss }) {
  const tall = isTall(W, H);
  const rect = tall ? { x: Math.round(0.06 * W), y: Math.round(0.67 * H), w: Math.round(0.88 * W), h: Math.round(0.1 * H) } : { x: Math.round(0.06 * W), y: Math.round(0.83 * H), w: Math.round(0.88 * W), h: Math.round(0.11 * H) };
  const size = Math.round((tall ? 0.068 : 0.036) * W);
  const html = groups.map((g, i) => `<div class="cap" id="cap-${i}" style="left:${g.rect.x}px;top:${g.rect.y}px;width:${g.rect.w}px;height:${g.rect.h}px;${g.rect.col ? `font-size:${Math.round(size * 0.82)}px;` : ""}"><p class="line">${g.words.map((w, j) => `<span class="w" id="w-${i}-${j}">${esc(w.text.toUpperCase())}</span>`).join(" ")}</p></div>`).join("\n  ");
  const sets = [];
  groups.forEach((g, i) => {
    sets.push(`tl.set("#cap-${i}", { autoAlpha: 1 }, ${r3(g.in)});`, `tl.set("#cap-${i}", { autoAlpha: 0 }, ${r3(g.out)});`);
    g.words.forEach((w, j) => sets.push(`tl.set("#w-${i}-${j}", { color: "${look.accent}" }, ${r3(Math.max(g.in, w.start))});`, `tl.set("#w-${i}-${j}", { color: "#ffffff" }, ${r3(Math.max(g.in, Math.min(w.end, g.out)))});`));
  });
  return `<!doctype html>
<html>
<head><meta charset="UTF-8" /></head>
<body>
<template>
<style>
  ${fontCss}
  #root { position: absolute; inset: 0; width: ${W}px; height: ${H}px; overflow: hidden; pointer-events: none; }
  #root .cap { position: absolute; left: ${rect.x}px; top: ${rect.y}px; width: ${rect.w}px; height: ${rect.h}px; display: flex; align-items: center; justify-content: center; text-align: center;
    font-family: "${look.font}", Inter, ui-sans-serif, system-ui, sans-serif; font-size: ${size}px; line-height: 1.1; visibility: hidden; opacity: 0;
    font-weight: 800; letter-spacing: -0.01em; color: #ffffff; -webkit-text-stroke: ${Math.max(2, Math.round(size / 18))}px rgba(0,0,0,0.85); paint-order: stroke fill; text-shadow: 0 ${Math.round(size / 12)}px ${Math.round(size / 5)}px rgba(0,0,0,0.45); }
</style>
<div id="root" data-composition-id="${id}" data-width="${W}" data-height="${H}">
  ${html}
</div>
<script>
(function () {
  var tl = gsap.timeline({ paused: true });
  ${sets.join("\n  ")}
  tl.set({}, {}, ${r3(total)});
  window.__timelines = window.__timelines || {};
  window.__timelines["${id}"] = tl;
})();
</script>
</template>
</body>
</html>
`;
}

// the scaffold of one graphic: simple, in its zone, correct timing; the scene animators replace it with something designed
function graphicScaffold({ id, g, rect, W, H, dur, look, fontCss, ease }) {
  const text = [].concat(g.text ?? "").map(String);
  const items = (Array.isArray(g.items) && g.items.length ? g.items : text.length > 1 ? text : String(text[0] || "").split(/\s*\|\s*|\n/).filter(Boolean)).map(String);
  const unit = Math.round(W * (isTall(W, H) ? 0.02 : 0.0125));
  const inEase = ease.enter, outEase = ease.exit;
  const body = {
    "kinetic-title": `<h1 class="mask">${text.join(" ").split(/\s+/).map((w) => `<span class="m"><span class="w">${esc(w)}</span></span>`).join(" ")}</h1>`,
    callout: `<div class="pill"><span class="t">${esc(text.join(" "))}</span></div>`,
    stat: `<div class="stat"><div class="num">${esc(text[0] || "")}</div>${text[1] || g.sub ? `<div class="sub">${esc(g.sub || text[1])}</div>` : ""}</div>`,
    "lower-third": `<div class="lt"><span class="bar"></span><div><div class="name">${esc(text[0] || "")}</div>${text[1] || g.sub ? `<div class="sub">${esc(g.sub || text[1])}</div>` : ""}</div></div>`,
    list: `<ul class="list">${items.map((t) => `<li><span class="b"></span><span>${esc(t)}</span></li>`).join("")}</ul>`,
    quote: `<blockquote class="quote"><span class="q">${esc(text.join(" "))}</span></blockquote>`,
    diagram: `<div class="diagram"><div class="cap2">DIAGRAM</div><div class="t">${esc(text.join(" "))}</div></div>`,
    label: `<div class="tag"><span class="t">${esc(text.join(" "))}</span></div>`,
  }[g.type] || `<div class="pill"><span class="t">${esc(text.join(" "))}</span></div>`;
  const iD = ease.inDur || 0.55, oD = ease.outDur || 0.35, sg = ease.stagger ?? 0.08;
  const exitAt = r3(Math.max(iD + (ease.hold || 0.5), dur - oD - 0.05));
  const anim = {
    "kinetic-title": `tl.fromTo("#${id} .w", { yPercent: 115 }, { yPercent: 0, duration: ${iD}, ease: "${inEase}", stagger: ${sg} }, 0);\n  tl.to("#${id} .w", { yPercent: -115, duration: ${oD}, ease: "${outEase}", stagger: ${sg} }, ${exitAt});`,
    list: `tl.fromTo("#${id} li", { clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)", duration: ${iD}, ease: "${inEase}", stagger: ${sg} }, 0);\n  tl.to("#${id} .list", { clipPath: "inset(0 0 0 100%)", duration: ${oD}, ease: "${outEase}" }, ${exitAt});`,
  }[g.type] || `tl.fromTo("#${id} .box > *", { clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)", duration: ${iD}, ease: "${inEase}" }, 0);\n  tl.to("#${id} .box > *", { clipPath: "inset(0 0 0 100%)", duration: ${oD}, ease: "${outEase}" }, ${exitAt});`;
  const font = `font-family: "${look.font}", Inter, ui-sans-serif, system-ui, sans-serif;`;
  return `<!doctype html>
<!-- ${SCAFFOLD}: ${id} is a placeholder the scene animator replaces; keep the root id, the data-composition-id and the window.__timelines key -->
<html>
<head><meta charset="UTF-8" /></head>
<body>
<template>
<style>
  ${fontCss}
  #${id} { position: absolute; inset: 0; width: ${W}px; height: ${H}px; overflow: hidden; pointer-events: none; ${font} color: ${look.ink}; }
  #${id} .box > * { max-width: 100%; }
  #${id} .box { position: absolute; left: ${rect.x}px; top: ${rect.y}px; width: ${rect.w}px; height: ${rect.h}px; display: flex; align-items: center; justify-content: ${g.zone === "right" ? "flex-end" : g.zone === "left" ? "flex-start" : "center"}; }
  #${id} .mask { font-size: ${Math.round(Math.min(unit * 7, rect.w / Math.max(3, Math.max(...text.join(" ").split(/\s+/).map((x) => x.length)) * 0.62)))}px; font-weight: 800; line-height: 1.02; letter-spacing: -0.02em; text-align: ${g.zone === "right" ? "right" : g.zone === "left" ? "left" : "center"}; text-shadow: 0 ${unit / 2}px ${unit * 2}px rgba(0,0,0,0.45); color: #fff; }
  #${id} .m { display: inline-block; overflow: hidden; vertical-align: top; padding-bottom: 0.08em; }
  #${id} .w { display: inline-block; }
  #${id} .pill, #${id} .tag { display: inline-flex; padding: ${unit}px ${unit * 2}px; background: ${look.bg}; color: ${look.ink}; border: ${Math.max(2, unit / 4)}px solid ${look.accent}; border-radius: ${unit * 1.2}px; font-size: ${unit * 3}px; font-weight: 700; }
  #${id} .tag { font-size: ${unit * 2}px; text-transform: uppercase; letter-spacing: 0.08em; }
  #${id} .num { font-size: ${Math.round(Math.min(unit * 14, rect.w / Math.max(2, String(text[0] || "").length * 0.78), rect.h * 0.55))}px; font-weight: 800; line-height: 0.95; color: ${look.accent}; text-shadow: 0 ${unit / 2}px ${unit * 2}px rgba(0,0,0,0.4); }
  #${id} .sub { font-size: ${unit * 2.6}px; font-weight: 600; margin-top: ${unit}px; color: #fff; text-shadow: 0 2px ${unit}px rgba(0,0,0,0.6); }
  #${id} .lt { display: flex; gap: ${unit * 1.5}px; align-items: stretch; background: ${look.bg}; padding: ${unit * 1.2}px ${unit * 2}px; border-radius: ${unit}px; }
  #${id} .lt .bar { width: ${unit / 1.5}px; background: ${look.accent}; border-radius: 4px; }
  #${id} .lt .name { font-size: ${unit * 3.2}px; font-weight: 800; }
  #${id} .list { list-style: none; margin: 0; padding: ${unit * 1.5}px ${unit * 2}px; background: ${look.bg}; border-radius: ${unit}px; display: flex; flex-direction: column; gap: ${unit * 1.2}px; font-size: ${unit * 2.8}px; font-weight: 600; }
  #${id} .list li { display: flex; gap: ${unit * 1.4}px; align-items: center; }
  #${id} .list .b { width: ${unit * 1.2}px; height: ${unit * 1.2}px; border-radius: 50%; background: ${look.accent}; flex: none; }
  #${id} .quote { margin: 0; padding-left: ${unit * 2.5}px; border-left: ${unit / 1.4}px solid ${look.accent}; font-size: ${unit * 4}px; font-weight: 600; font-style: italic; line-height: 1.15; text-shadow: 0 2px ${unit * 1.5}px rgba(0,0,0,0.6); color: #fff; }
  #${id} .diagram { width: 100%; height: 100%; border: ${Math.max(2, unit / 4)}px dashed ${look.accent}; border-radius: ${unit}px; background: rgba(0,0,0,0.35); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: ${unit}px; font-size: ${unit * 2.6}px; color: #fff; }
  #${id} .cap2 { font-size: ${unit * 1.6}px; letter-spacing: 0.2em; color: ${look.accent}; }
</style>
<div id="${id}" data-composition-id="${id}" data-width="${W}" data-height="${H}">
  <div class="box">${body}</div>
</div>
<script>
(function () {
  var tl = gsap.timeline({ paused: true });
  ${anim}
  tl.set({}, {}, ${r3(dur)});
  window.__timelines = window.__timelines || {};
  window.__timelines["${id}"] = tl;
})();
</script>
</template>
</body>
</html>
`;
}

function designedScaffold({ id, W, H, dur, look, fontCss, label }) {
  return `<!doctype html>
<!-- ${SCAFFOLD}: ${id} is a placeholder backdrop the scene animator replaces with the designed plate (see briefs/plates/${id}.md) -->
<html>
<head><meta charset="UTF-8" /></head>
<body>
<template>
<style>
  ${fontCss}
  #${id} { position: absolute; inset: 0; width: ${W}px; height: ${H}px; overflow: hidden; background: radial-gradient(120% 90% at 30% 20%, ${look.accent}33, transparent 60%), linear-gradient(160deg, ${look.bg}, #000); font-family: "${look.font}", Inter, sans-serif; }
  #${id} .tag { position: absolute; left: 4%; top: 6%; color: ${look.ink}; opacity: 0.35; font-size: ${Math.round(W * 0.012)}px; letter-spacing: 0.2em; text-transform: uppercase; }
</style>
<div id="${id}" data-composition-id="${id}" data-width="${W}" data-height="${H}"><div class="tag">${esc(label)}</div></div>
<script>
(function () {
  var tl = gsap.timeline({ paused: true });
  tl.set({}, {}, ${r3(dur)});
  window.__timelines = window.__timelines || {};
  window.__timelines["${id}"] = tl;
})();
</script>
</template>
</body>
</html>
`;
}

function loadMotion(motionFile, tmpDir) {
  try {
    const M = readFrontmatterDoc(fs.readFileSync(motionFile, "utf8")).fields;
    const id = M.personality === "custom" ? M.parent : M.personality;
    const outP = path.join(tmpDir, "personality.json");
    const argv = [path.join(HERE, "motion-md.mjs"), "write", "--personality", id, "--out", path.join(tmpDir, "motion-check.md"), "--emit-personality", outP];
    if ((M.adjustments || []).length) argv.push("--adjust", M.adjustments.join(","));
    execFileSync(process.execPath, argv, { stdio: "ignore" });
    return readJSON(outP);
  } catch {
    return null;
  }
}

async function build() {
  if (!args.plan || !args.key || !args.plates || !args["project-dir"]) die("PROBLEM: build needs --plan, --key, --plates <dir> and --project-dir videos/<name>");
  need("ffmpeg");
  const ws = process.cwd();
  const planFile = path.resolve(String(args.plan));
  const plan = readPlan(planFile);
  const keyFile = path.resolve(String(args.key));
  const key = readJSON(keyFile);
  const webm = path.join(path.dirname(keyFile), key.webm || "presenter.webm");
  if (!fs.existsSync(webm)) die(`PROBLEM: ${webm} not found (run presenter.mjs key first)`);
  const platesDir = path.resolve(String(args.plates));
  const dir = path.resolve(String(args["project-dir"]));
  if (dir === ws) die("PROBLEM: never build into the workspace root; use videos/<name>");
  const { W, H } = planSize(plan);
  const FPS = 30;
  const warnings = [];
  const B = plan.beats;
  B.forEach((b, i) => { b.id = safeId(b.id || `b${i + 1}`); });
  const total = r3(Math.max(Number(key.duration) || 0, 0) || Number(B[B.length - 1].end));
  if (Number(B[B.length - 1].end) > total + 0.5) warnings.push(`the last beat ends at ${B[B.length - 1].end}s, after the clip (${total}s)`);
  // nothing may run past the clip
  for (let i = B.length - 1; i > 0 && Number(B[i].start) >= total - 0.05; i--) { warnings.push(`beat ${B[i].id} starts at or after the end of the clip (${total}s); dropped`); B.pop(); }
  B.forEach((b) => { if (Number(b.end) > total) b.end = total; });
  const defs = resolvePlates(plan);
  const spans = plateSpans(plan, defs);

  // ---- project shell
  const idx = path.join(dir, "index.html");
  const created = path.join(dir, ".hyperframes", "presenter", "created");
  if (fs.existsSync(idx) && !fs.readFileSync(idx, "utf8").includes(MARK) && !fs.existsSync(created) && !args.force) die(`PROBLEM: ${path.relative(ws, idx)} was not written by the presenter builder; re-run with --force to replace it`);
  if (!fs.existsSync(path.join(dir, "hyperframes.json"))) {
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    const res = { "1920x1080": "landscape", "1080x1920": "portrait", "1080x1080": "square" }[`${W}x${H}`];
    const r = spawnSync("npx", ["--yes", "hyperframes", "init", path.basename(dir), "--non-interactive", "--skill=general-video", ...(res ? [`--resolution=${res}`] : [])], { cwd: path.dirname(dir), env: { ...process.env, HYPERFRAMES_SKIP_SKILLS: "1" }, encoding: "utf8", timeout: 300000 });
    if (!fs.existsSync(path.join(dir, "hyperframes.json"))) {
      // offline or no npx: the three files HyperFrames needs
      warnings.push(`hyperframes init did not run (${String(r.stderr || r.error || "").trim().split("\n").pop() || "no output"}); wrote hyperframes.json by hand`);
      writeFile(path.join(dir, "hyperframes.json"), JSON.stringify({ $schema: "https://hyperframes.heygen.com/schema/hyperframes.json", registry: "https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry", paths: { blocks: "compositions", components: "compositions/components", assets: "assets" }, media: { autoProxy: true }, authoringSkill: "general-video" }, null, 2) + "\n");
      writeFile(path.join(dir, "meta.json"), JSON.stringify({ name: path.basename(dir) }) + "\n");
    }
    writeFile(created, new Date().toISOString() + "\n");
  }
  const tmpDir = path.join(dir, ".hyperframes", "presenter");
  fs.mkdirSync(tmpDir, { recursive: true });

  // ---- look, fonts, motion
  let fontCss = "";
  const lookFile = args.look ? path.resolve(String(args.look)) : null;
  if (lookFile && fs.existsSync(lookFile)) {
    try {
      const r = await installLook(dir, { designMd: lookFile });
      fontCss = r.fontCss || "";
      warnings.push(...r.notes.filter((n) => !/^frame\.md converted/.test(n)));
    } catch (e) {
      warnings.push(`could not read ${path.basename(lookFile)} as a design system (${String(e.message).split("\n")[0]}); using the default look`);
    }
  }
  const look = readLookSafe(fs.existsSync(path.join(dir, "frame.md")) ? path.join(dir, "frame.md") : null);
  if (!fontCss) {
    try {
      const st = await stageFonts([{ family: look.font, weights: [400, 600, 700, 800] }], dir);
      look.font = st.families[look.font] || look.font;
      fontCss = st.css;
      warnings.push(...st.warnings);
    } catch (e) {
      warnings.push(`fonts: ${String(e.message).split("\n")[0]}`);
    }
  }
  const motionFile = args.motion ? path.resolve(String(args.motion)) : fs.existsSync(path.join(dir, "motion.md")) ? path.join(dir, "motion.md") : null;
  if (motionFile && motionFile !== path.join(dir, "motion.md")) fs.copyFileSync(motionFile, path.join(dir, "motion.md"));
  const pers = motionFile ? loadMotion(motionFile, tmpDir) : null;
  const easing = pers && pers.easing;
  const noBlur = !!(pers && (pers.banned || []).some((b) => /blur/.test(b)));
  const stepped = (e) => /^steps/.test(String(e || ""));
  const E = { enter: (easing && easing.enter) || "power3.out", exit: (easing && easing.exit) || "power2.in", move: (easing && easing.move) || "power2.inOut" };
  const camEase = stepped(E.move) ? "none" : E.move;
  // the scaffolds follow motion.md: durations on its scale, its stagger, its minimum hold
  const scale = (pers && pers.tempo && pers.tempo.scale_ms) || [250, 450, 700];
  const snap = (sec) => scale.reduce((a, b) => (Math.abs(b - sec * 1000) < Math.abs(a - sec * 1000) ? b : a), scale[0]) / 1000;
  E.inDur = snap(0.55); E.outDur = snap(0.35); E.stagger = pers && pers.stagger && pers.stagger.each_ms ? pers.stagger.each_ms / 1000 : 0.08; E.hold = pers && pers.holds && pers.holds.min_ms ? pers.holds.min_ms / 1000 : 0.5;

  // ---- assets
  fs.mkdirSync(path.join(dir, "assets", "vendor"), { recursive: true });
  fs.copyFileSync(path.join(SKILL_DIR, "scripts", "vendor", "gsap.min.js"), path.join(dir, "assets", "vendor", "gsap.min.js"));
  fs.copyFileSync(webm, path.join(dir, "assets", "presenter.webm"));
  let hasAudio = false;
  const clipCandidates = [key.clip, plan.clip && path.resolve(ws, plan.clip), plan.clip && path.resolve(path.dirname(planFile), plan.clip), plan.clip && path.resolve(path.dirname(planFile), "..", "..", plan.clip)].filter(Boolean);
  const clipSrc = clipCandidates.find((p) => fs.existsSync(p));
  if (key.has_audio === false) warnings.push("the clip has no audio track; the film is silent");
  else if (!clipSrc) warnings.push(`the source clip was not found (tried ${clipCandidates.join(", ") || "nothing"}); the film has no voice. Pass a key.json written by this machine or fix plan.clip`);
  else {
    try {
      sh("ffmpeg", ["-y", "-v", "error", "-i", clipSrc, "-vn", "-ac", "2", "-ar", "48000", "-c:a", "pcm_s16le", path.join(dir, "assets", "voice.wav")], { timeout: 900000 });
      hasAudio = true;
    } catch (e) {
      warnings.push(`could not extract the voice: ${e.message}`);
    }
  }
  const usedImages = new Map();
  const plateEls = [];
  const tweens = [];
  const gAt = (n) => r3(n);
  const comps = [];

  // ---- plates (track 0): one clip per span, camera on the .cam wrapper, transition on the .trw wrapper, split crop on .pbox
  const platesOut = path.join(dir, "assets", "plates");
  fs.mkdirSync(platesOut, { recursive: true });
  const TR = { cut: "cut", "match-cut": "cut", "blur-dissolve": "dissolve", dissolve: "dissolve", crossfade: "dissolve", "light-leak": "dissolve", push: "push", whip: "push", wipe: "wipe", "shape-mask": "wipe", iris: "iris" };
  const simplified = [];
  spans.forEach((sp, n) => {
    const k = n + 1, first = sp.beats[0];
    const prevBeat = B[B.indexOf(first) - 1];
    const prevSpan = prevBeat ? spans.find((s) => s.beats.includes(prevBeat)) : null;
    const trName = TR[first.transition_in || "cut"] || "cut";
    if (first.transition_in && !TR[first.transition_in]) simplified.push(`${first.id}: "${first.transition_in}" is built as a cut`);
    if (first.transition_in && ["match-cut", "whip", "shape-mask", "light-leak"].includes(first.transition_in)) simplified.push(`${first.id}: "${first.transition_in}" is built as a simple ${trName}; the scene animators can replace it`);
    const trDur = trName === "cut" || !prevSpan || prevSpan.end < first.start - 0.05 ? 0 : snap(first.transition_in === "whip" ? 0.25 : 0.6);
    if (prevSpan && trDur) prevSpan.holdUntil = Math.max(prevSpan.holdUntil || 0, first.start + trDur);
    sp.k = k;
    sp.trName = trName;
    sp.trDur = trDur;
  });
  spans.forEach((sp) => {
    const k = sp.k, first = sp.beats[0], start = gAt(sp.start), dur = gAt(Math.min(Math.max(sp.end, sp.holdUntil || 0), total) - sp.start);
    const imgFile = path.join(platesDir, `${sp.image}.png`);
    let inner = "";
    const hostId = `plate-${k}`;
    if (fs.existsSync(imgFile)) {
      if (!usedImages.has(sp.image)) { fs.copyFileSync(imgFile, path.join(platesOut, `${safeId(sp.image)}.png`)); usedImages.set(sp.image, true); }
      inner = `<img id="${hostId}" class="clip" src="assets/plates/${safeId(sp.image)}.png" alt="" data-start="${start}" data-duration="${dur}" data-track-index="0">`;
    } else {
      // designed (or a generated image that is missing): a sub-composition the animators draw
      if (sp.kind === "generated") warnings.push(`plate ${sp.image}: ${path.relative(ws, imgFile)} is missing; mounted a designed backdrop scaffold in its place`);
      const cid = `plate-${safeId(sp.image)}`;
      const rel = `compositions/plates/${safeId(sp.image)}.html`;
      const exists = fs.existsSync(path.join(dir, rel));
      if (!exists || (args["refresh-scaffolds"] && fs.readFileSync(path.join(dir, rel), "utf8").includes(SCAFFOLD))) writeFile(path.join(dir, rel), designedScaffold({ id: cid, W, H, dur: total, look, fontCss, label: `plate ${sp.image} (designed)` }));
      writeFile(path.join(dir, "briefs", "plates", `${safeId(sp.image)}.md`), `# Designed plate ${sp.image}\n\nWrite: \`${rel}\` (a HyperFrames sub-composition: <template>, root id and data-composition-id \`${cid}\`, \`window.__timelines["${cid}"]\`, full frame ${W}x${H}).\n\nWhat it must be: ${sp.prompt || "(no description in the plan)"}\n\nOn screen ${r2(sp.start)}s to ${r2(sp.end)}s (camera: ${sp.camera}, applied by the project's index.html to this plate's wrapper). The presenter is keyed over it: ${sp.beats.map((b) => `${b.id} ${b.layout}`).join(", ")}. Keep the area the presenter stands in calm. No text in the plate; titles are separate graphics. Look: ${path.relative(ws, path.join(dir, "frame.md"))}. The scaffold file is a gradient placeholder.\n`);
      inner = `<div id="${hostId}" class="slot" data-composition-id="${cid}" data-composition-src="${rel}" data-start="${start}" data-duration="${dur}" data-track-index="0" data-width="${W}" data-height="${H}"></div>`;
    }
    plateEls.push(`<div class="pbox" id="pbox-${k}" style="z-index:${10 + k}"><div class="pfit" id="pfit-${k}"><div class="trw" id="trw-${k}"><div class="cam" id="cam-${k}" data-obey="camera">${inner}</div></div></div></div>`);
    // camera
    const c = CAM[sp.camera] || CAM.static;
    if (sp.camera !== "static") tweens.push(`tl.fromTo("#cam-${k}", { scale: ${r3(c.s0)}, x: ${Math.round(c.x0 * W)}, y: ${Math.round(c.y0 * H)} }, { scale: ${r3(c.s1)}, x: ${Math.round(c.x1 * W)}, y: ${Math.round(c.y1 * H)}, duration: ${gAt(sp.end - sp.start)}, ease: "${camEase}" }, ${start});`);
    // transition in
    if (sp.trDur) {
      if (sp.trName === "dissolve") tweens.push(`tl.fromTo("#trw-${k}", { opacity: 0${noBlur ? "" : ', filter: "blur(16px)"'} }, { opacity: 1${noBlur ? "" : ', filter: "blur(0px)"'}, duration: ${sp.trDur}, ease: "${E.enter}" }, ${start});`);
      if (sp.trName === "push") tweens.push(`tl.fromTo("#trw-${k}", { xPercent: 100 }, { xPercent: 0, duration: ${sp.trDur}, ease: "${E.enter}" }, ${start});`);
      if (sp.trName === "wipe") tweens.push(`tl.fromTo("#trw-${k}", { clipPath: "inset(0% 100% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: ${sp.trDur}, ease: "${E.enter}" }, ${start});`);
      if (sp.trName === "iris") tweens.push(`tl.fromTo("#trw-${k}", { clipPath: "circle(0% at 50% 50%)" }, { clipPath: "circle(80% at 50% 50%)", duration: ${sp.trDur}, ease: "${E.enter}" }, ${start});`);
    }
    // split layouts crop the plate to its half
    if (sp.beats.some((b) => b.layout === "split")) {
      for (const b of sp.beats) {
        const pc = geom(b.layout, key, W, H, b.side).plateClip;
        const r = pc || { x: 0, y: 0, w: W, h: H };
        const sdx = pc && !isTall(W, H) ? Math.round(pc.x + pc.w / 2 - W / 2) : 0, sdy = pc && isTall(W, H) ? Math.round(pc.y + pc.h / 2 - H / 2) : 0;
        tweens.push(`tl.set("#pfit-${k}", { x: ${sdx}, y: ${sdy} }, ${gAt(b.start)});`);
        tweens.push(`tl.set("#pbox-${k}", { clipPath: "inset(${r.y}px ${W - r.x - r.w}px ${H - r.y - r.h}px ${r.x}px)" }, ${gAt(b.start)});`);
      }
    }
    void first;
  });

  // ---- presenter (track 1): layout tweens land at each beat's start
  const states = B.map((b) => ({ b, g: geom(b.layout, key, W, H, b.side) }));
  const bar = Math.max(3, Math.round(W / 640));
  const stateVars = (g, prev) => {
    const clip = g.clip, c = `inset(${clip.y}px ${W - clip.x - clip.w}px ${H - clip.y - clip.h}px ${clip.x}px)`;
    const wrap = `{ x: ${Math.round(g.tx)}, y: ${Math.round(g.ty)}, scale: ${r3(g.s)} }`;
    const d = g.deco || (prev && prev.deco) || { x: 0, y: 0, w: W, h: H };
    const op = g.deco && !g.hidden ? 1 : 0;
    const sx = r3(d.w / W), sy = r3(d.h / H);
    const decoBars = [
      ["#pd-fill", `x: ${d.x}, y: ${d.y}, scaleX: ${sx}, scaleY: ${sy}`],
      ["#pd-t", `x: ${d.x}, y: ${d.y}, scaleX: ${sx}, scaleY: 1`],
      ["#pd-b", `x: ${d.x}, y: ${d.y + d.h - bar}, scaleX: ${sx}, scaleY: 1`],
      ["#pd-l", `x: ${d.x}, y: ${d.y}, scaleX: 1, scaleY: ${sy}`],
      ["#pd-r", `x: ${d.x + d.w - bar}, y: ${d.y}, scaleX: 1, scaleY: ${sy}`],
    ];
    return { wrap, clip: `{ clipPath: "${c}", opacity: ${g.hidden ? 0 : 1}`, decoBars, decoOp: op };
  };
  const emitSet = (v, at) => [`tl.set("#pres-wrap", ${v.wrap}, ${at});`, `tl.set("#pres-clip", ${v.clip} }, ${at});`, ...v.decoBars.map(([sel, vars]) => `tl.set("${sel}", { ${vars} }, ${at});`), `tl.set(".pd", { opacity: ${v.decoOp} }, ${at});`];
  let prevG = null;
  states.forEach(({ b, g }, i) => {
    const v = stateVars(g, prevG);
    const same = prevG && prevG.layout === g.layout && JSON.stringify([prevG.s, prevG.tx, prevG.ty, prevG.clip]) === JSON.stringify([g.s, g.tx, g.ty, g.clip]);
    if (i === 0) tweens.push(...emitSet(v, 0));
    else if (!same) {
      const prevDur = B[i - 1].end - B[i - 1].start;
      const d = r3(Math.min(snap(0.5), prevDur * 0.6));
      const cut = (b.transition_in || "cut") === "cut";
      if (cut || d < 0.15) tweens.push(...emitSet(v, gAt(b.start)));
      else {
        const at = gAt(b.start - d);
        tweens.push(`tl.to("#pres-wrap", { ...${v.wrap}, duration: ${d}, ease: "${camEase}" }, ${at});`, `tl.to("#pres-clip", ${v.clip}, duration: ${d}, ease: "${camEase}" }, ${at});`, ...v.decoBars.map(([sel, vars]) => `tl.to("${sel}", { ${vars}, duration: ${d}, ease: "${camEase}" }, ${at});`), `tl.to(".pd", { opacity: ${v.decoOp}, duration: ${d}, ease: "${camEase}" }, ${at});`);
      }
    }
    prevG = g;
    // parallax: a slight counter-move of the presenter layer against the push
    const sp = spanFor(spans, b);
    if (sp && sp.camera === "parallax" && sp.beats[0] === b && !g.hidden) tweens.push(`tl.fromTo("#pres-par", { x: ${Math.round(0.006 * W)} }, { x: ${-Math.round(0.006 * W)}, duration: ${gAt(sp.end - sp.start)}, ease: "none" }, ${gAt(sp.start)});`);
  });

  // ---- graphics (track 2)
  const graphics = [];
  const slots = [];
  const occupiedNote = (b) => {
    const g = geom(b.layout, key, W, H, b.side);
    return g.hidden ? "nothing (plate-only: the presenter is hidden)" : `the box x ${Math.round(g.box.x)}-${Math.round(g.box.x + g.box.w)}, y ${Math.round(g.box.y)}-${Math.round(g.box.y + g.box.h)} px${g.deco ? ` inside a framed panel (${g.clip.x},${g.clip.y} ${g.clip.w}x${g.clip.h})` : ""}`;
  };
  for (const b of B) {
    (b.graphics || []).forEach((g, n) => {
      const num = n + 1, id = `gfx-${b.id}-${num}`, rel = `compositions/graphics/${b.id}-${num}.html`, file = path.join(dir, rel);
      const at = clamp(Number(g.at), Number(b.start), Number(b.end) - 0.3), out = clamp(Number(g.out), at + 0.3, Number(b.end));
      const dur = r3(out - at);
      const zone = ZONES.includes(g.zone) ? g.zone : "center";
      const gres = graphicRect(zone, b.layout, key, W, H, b.side, !!args.captions);
      const rect = gres.rect;
      if (gres.blocked) warnings.push(`${b.id} graphic ${num} sits in a blocked ${zone} zone for ${b.layout}; run presenter.mjs check`);
      const existing = fs.existsSync(file);
      const mine = existing && fs.readFileSync(file, "utf8").includes(SCAFFOLD);
      let scaffolded = false;
      if (!existing || (mine && args["refresh-scaffolds"])) { writeFile(file, graphicScaffold({ id, g: { ...g, zone }, rect, W, H, dur, look, fontCss, ease: E })); scaffolded = true; }
      writeFile(path.join(dir, "briefs", "graphics", `${b.id}-${num}.md`), `# Graphic ${b.id}-${num}: ${g.type}

**What:** a ${g.type}${g.text ? ` that says ${JSON.stringify([].concat(g.text).join(" / "))}` : ""}${g.sub ? ` (sub-line: ${JSON.stringify(g.sub)})` : ""}${Array.isArray(g.items) ? `; items: ${g.items.map((x) => JSON.stringify(x)).join(", ")}` : ""}.
**When:** ${at}s to ${out}s of the film (${dur}s long; inside the beat ${b.id}, ${b.start}-${b.end}s). The slot is this composition's whole length: it starts at t=0 inside it, build the entrance first and the exit in the last ~0.4s.
**Where:** zone \`${zone}\` = x ${rect.x}, y ${rect.y}, ${rect.w}x${rect.h} px of the ${W}x${H} frame. Stay inside it.
**The words being spoken:** ${JSON.stringify(b.say || "")}
**Layout of this beat:** ${b.layout}${b.side ? ` (side ${b.side})` : ""}. The presenter occupies ${occupiedNote(b)}. Never cover the face.
**Over what:** plate ${b.plate ? b.plate.id : "none"}${b.plate && defs.get(b.plate.id) && defs.get(b.plate.id).prompt ? ` (${JSON.stringify(defs.get(b.plate.id).prompt)})` : ""}. Make the type readable over a photograph: a plate, a shadow or a solid panel.
${g.note || g.brief ? `**Note from the visual plan:** ${g.note || g.brief}\n` : ""}**Write:** \`${rel}\`. It currently holds ${scaffolded || mine ? "a plain scaffold" : "your own file"}; replace it with a designed one in the look (\`frame.md\`, \`motion.md\`): a HyperFrames sub-composition inside <template>, root id and \`data-composition-id\` \`${id}\`, one paused GSAP timeline at \`window.__timelines["${id}"]\`, ${W}x${H}, seek-safe, no \`repeat: -1\`, never tween the slot itself.
`);
      slots.push(`<div id="slot-${id}" class="slot" style="z-index:200" data-composition-id="${id}" data-composition-src="${rel}" data-start="${gAt(at)}" data-duration="${dur}" data-track-index="2" data-width="${W}" data-height="${H}"></div>`);
      graphics.push({ id, beat: b.id, type: g.type, file: rel, brief: `briefs/graphics/${b.id}-${num}.md`, at, out, zone, scaffolded: scaffolded || (mine && !args["refresh-scaffolds"]) });
    });
  }

  // ---- captions (track 3)
  let groups = [];
  if (args.captions) {
    const cw = loadWords(path.resolve(String(args.captions)));
    groups = groupWords(cw, { maxWords: isTall(W, H) ? 3 : 5, maxChars: isTall(W, H) ? 18 : 34 });
    groups.forEach((g) => (g.out = Math.min(g.out, total)));
    groups = groups.filter((g) => g.out - g.in > 0.1);
    groups.forEach((g) => { const mid = (g.in + g.out) / 2; g.rect = captionRect(B.find((b) => mid >= b.start && mid < b.end) || B[B.length - 1], key, W, H); });
    if (groups.length) writeFile(path.join(dir, "compositions", "captions.html"), captionsComp({ id: "captions", W, H, look, groups, total, fontCss }));
  }
  if (groups.length) slots.push(`<div id="slot-captions" class="slot" style="z-index:300" data-composition-id="captions" data-composition-src="compositions/captions.html" data-start="0" data-duration="${total}" data-track-index="3" data-track-kind="captions" data-width="${W}" data-height="${H}"></div>`);

  // ---- index.html
  const html = `<!doctype html>
${MARK}
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=${W}, height=${H}" />
<title>${esc(plan.title || "Presenter film")}</title>
<script src="assets/vendor/gsap.min.js"></script>
<style>
  ${fontCss}
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: ${look.bg}; }
  #root { position: relative; width: ${W}px; height: ${H}px; overflow: hidden; background: ${look.bg}; }
  #root .pbox, #root .pfit, #root .trw, #root .cam, #root #pres-clip, #root #pres-wrap, #root #pres-par, #root .slot { position: absolute; inset: 0; }
  #root .cam img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  #root #presenter { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  #root #pres-clip { z-index: 100; }
  #root .pd { position: absolute; left: 0; top: 0; z-index: 99; transform-origin: 0 0; opacity: 0; pointer-events: none; }
  #root #pd-fill { width: ${W}px; height: ${H}px; background: ${panelFill(look)}; }
  #root #pd-t, #root #pd-b { width: ${W}px; height: ${bar}px; background: ${look.accent}; }
  #root #pd-l, #root #pd-r { width: ${bar}px; height: ${H}px; background: ${look.accent}; }
</style>
</head>
<body>
<div id="root" data-composition-id="root" data-start="0" data-duration="${total}" data-width="${W}" data-height="${H}" data-fps="${FPS}">
  ${plateEls.join("\n  ")}
  <div class="pd" id="pd-fill"></div><div class="pd" id="pd-t"></div><div class="pd" id="pd-b"></div><div class="pd" id="pd-l"></div><div class="pd" id="pd-r"></div>
  <div id="pres-clip"><div id="pres-wrap"><div id="pres-par"><video id="presenter" class="clip" src="assets/presenter.webm" muted playsinline data-start="0" data-duration="${total}" data-track-index="1"></video></div></div></div>
  ${hasAudio ? `<audio id="voice" src="assets/voice.wav" data-start="0" data-duration="${total}" data-volume="1" data-track-index="10"></audio>` : ""}
  ${slots.join("\n  ")}
</div>
<script>
  window.__timelines = window.__timelines || {};
  var tl = gsap.timeline({ paused: true });
  gsap.set("#pres-wrap", { transformOrigin: "50% 100%" });
  ${tweens.join("\n  ")}
  tl.set({}, {}, ${total});
  window.__timelines["root"] = tl;
</script>
</body>
</html>
`;
  writeFile(idx, html);
  writeFile(path.join(dir, "presenter.plan.json"), JSON.stringify(plan, null, 2) + "\n");

  // ---- checks
  let lint;
  if (args["no-lint"]) lint = { skipped: true, reason: "--no-lint" };
  else {
    const r = spawnSync("npx", ["--yes", "hyperframes", "lint", dir, "--json"], { encoding: "utf8", timeout: 120000, killSignal: "SIGKILL", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 });
    if (r.error && r.error.code === "ETIMEDOUT") { lint = { ok: true, timed_out: true, note: "hyperframes lint did not finish in 120s and was stopped; run `npx hyperframes lint` yourself" }; warnings.push("hyperframes lint timed out (120s)"); }
    else try {
      const lj = JSON.parse(r.stdout.slice(r.stdout.indexOf("{")));
      const fs2 = lj.findings || lj.issues || [];
      lint = { ok: r.status === 0, errors: lj.errorCount ?? fs2.filter((f) => (f.severity || f.level) === "error").length, warnings: lj.warningCount ?? fs2.filter((f) => (f.severity || f.level) === "warning").length, findings: fs2.filter((f) => (f.severity || f.level) === "error").slice(0, 12) };
    } catch {
      const o = (r.stdout + r.stderr).trim().split("\n").slice(-12).join("\n");
      lint = r.status === 0 ? { ok: true, output: o } : { ok: false, ran: false, output: o };
    }
  }
  let obey = null;
  if (motionFile) {
    const ob = spawnSync(process.execPath, [path.join(HERE, "obey.mjs"), "--project", dir], { encoding: "utf8", timeout: 180000, killSignal: "SIGKILL" });
    if (ob.error && ob.error.code === "ETIMEDOUT") obey = { timed_out: true, status: "could-not-run" };
    else obey = { exit: ob.status, summary: (ob.stdout || "").split("\n")[0], status: ob.status === 0 ? "clean" : ob.status === 2 ? "violations" : "could-not-run" };
  }
  console.log(JSON.stringify({ ok: !lint || lint.ok !== false || lint.skipped === true, project: path.relative(ws, dir) || dir, index: path.relative(ws, idx), duration: total, size: `${W}x${H}`, beats: B.length, plates: spans.map((s) => ({ plate: s.plate, image: s.image, start: s.start, end: s.end, camera: s.camera })), graphics, captions: groups.length, voice: hasAudio, lint, obey, transitions_simplified: simplified, warnings }, null, 2));
}

if (cmd === "key") await key();
else if (cmd === "beats") beats();
else if (cmd === "check") check();
else if (cmd === "plates") plates();
else if (cmd === "stills") stills();
else if (cmd === "build") await build();
else die("usage: presenter.mjs key --clip <video> --out <dir> | beats --transcript <words.json> --out <beats.json> | check --plan <plan.json> | plates --plan <plan.json> --out <images.json> | stills --plan --key --plates --out | build --plan --key --plates --project-dir videos/<name>");
