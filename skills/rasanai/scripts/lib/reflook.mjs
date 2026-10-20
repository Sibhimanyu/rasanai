// Adapted from cooked. (MIT, Copyright (c) 2026 NextWork), plugins/creator-teardown/skills/creator-teardown/scripts/look.py spoken L169-L176, find_captions L179-L224, caption medians (look function) L828-L880, face framing L883-L890, set-dressing text share L895-L935 @3b236ec; ported to Node and modified by RasanAI. Credit: third_party/cooked/.
// (upstream SHA 3b236ec8fe32343cdf38375df90f6cd71e0846d7; Apple Vision via scripts/vision/vision.swift replaces upstream's OCR and face engines)
//
// Reference look: what a reference video's face framing and burnt-in captions measure like, from sampled frames.
// Never throws for a missing engine: without Apple Vision it returns the same shape with nulls and a note.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const REFLOOK_VERSION = "reflook@1";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const VISION_SWIFT = path.join(HERE, "..", "vision", "vision.swift");
const SWIFT = "/usr/bin/swift";
const EM_PER_BOX = 1.17; // upstream EM_PER_BOX.vision: an OCR line box is about 1.17 em tall

// mirrors footage.mjs:visionSkip's check (copied, not imported)
export function visionAvailable() {
  if (process.platform !== "darwin") return { ok: false, why: "Apple Vision needs macOS" };
  if (!fs.existsSync(SWIFT)) return { ok: false, why: "/usr/bin/swift not found" };
  if (!fs.existsSync(VISION_SWIFT)) return { ok: false, why: "vision.swift missing" };
  return { ok: true, why: "" };
}

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9']/g, "");
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const round = (v, d = 0) => { const k = 10 ** d; return Math.round(v * k) / k; };

// Ratcliff-Obershelp similarity (what Python's difflib.SequenceMatcher.ratio computes), no deps
function matchChars(a, b) {
  if (!a.length || !b.length) return 0;
  let best = 0, ai = 0, bi = 0;
  const prev = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let diag = 0;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = a[i - 1] === b[j - 1] ? diag + 1 : 0;
      if (prev[j] > best) { best = prev[j]; ai = i - best; bi = j - best; }
      diag = tmp;
    }
  }
  if (!best) return 0;
  return best + matchChars(a.slice(0, ai), b.slice(0, bi)) + matchChars(a.slice(ai + best), b.slice(bi + best));
}
export function ratio(a, b) {
  const t = a.length + b.length;
  return t ? (2 * matchChars(a, b)) / t : 1;
}

// upstream spoken(): most of the line's words are said within a few seconds of t
function spoken(text, t, words) {
  const toks = text.split(/\s+/).map(norm).filter(Boolean);
  if (!toks.length || !words || !words.length) return false;
  const near = words.filter((w) => w.start >= t - 2.5 && w.start <= t + 1.5).map((w) => norm(w.text)).filter(Boolean);
  if (!near.length) return false;
  const set = new Set(near);
  const hit = toks.filter((x) => set.has(x) || near.some((n) => ratio(x, n) >= 0.7)).length;
  return hit / toks.length >= 0.6;
}

function degraded(why, extra = {}) {
  return { version: REFLOOK_VERSION, samples: 0, engine: null, face: null, face_x_samples: [], captions: null, text_share: null, notes: [why, ...(extra.notes || [])].filter(Boolean) };
}

const run = (cmd, args, timeout = 120000) => spawnSync(cmd, args, { encoding: "utf8", timeout, maxBuffer: 64 * 1024 * 1024 });

export async function sampleLook(file, { every_s = 1, max = 60, width = 720, words = null, tmp } = {}) {
  const av = visionAvailable();
  if (!av.ok) return degraded(`Apple Vision not available: faces and captions unmeasured (${av.why})`);
  if (!file || !fs.existsSync(file)) return degraded(`reflook: file not found (${file})`);
  const own = fs.mkdtempSync(path.join(tmp || os.tmpdir(), "reflook-"));
  try {
    // widen the step so a long video is still covered end to end within max samples
    let step = every_s;
    const pr = run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "json", file], 30000);
    let sw = 0, sh = 0;
    try {
      const j = JSON.parse(pr.stdout);
      const d = parseFloat(j.format?.duration);
      if (d > 0 && d / step > max) step = d / max;
      sw = j.streams?.[0]?.width || 0; sh = j.streams?.[0]?.height || 0;
    } catch {}
    const fr = run("ffmpeg", ["-v", "error", "-y", "-i", file, "-an", "-vf", `fps=1/${step},scale=${width}:-2`, "-frames:v", String(max), "-q:v", "3", path.join(own, "f%04d.jpg")], 240000);
    const jpgs = fs.readdirSync(own).filter((f) => f.endsWith(".jpg")).sort().map((f) => path.join(own, f));
    if (fr.status !== 0 && !jpgs.length) return degraded(`reflook: ffmpeg could not sample frames (${String(fr.stderr || fr.error || "").trim().split("\n").pop()})`);
    if (!jpgs.length) return degraded("reflook: no frames decoded");
    const byPath = new Map();
    const notes = [];
    for (let i = 0; i < jpgs.length; i += 40) {
      const r = run(SWIFT, [VISION_SWIFT, "--accurate", ...jpgs.slice(i, i + 40)], 120000);
      if (r.status !== 0) { notes.push(`Vision batch ${i / 40 + 1} failed: ${String(r.stderr || r.error || "").trim().split("\n").pop()}`); continue; }
      try { for (const o of JSON.parse(r.stdout)) byPath.set(o.path, o); } catch { notes.push(`Vision batch ${i / 40 + 1} returned nothing readable`); }
    }
    const samples = jpgs.map((p, i) => ({ t: i * step, o: byPath.get(p) })).filter((s) => s.o && !s.o.error);
    if (!samples.length) return degraded("Apple Vision not available: faces and captions unmeasured (Vision returned no results)", { notes });
    const n = samples.length;
    const W = width, H = sw && sh ? Math.round((width * sh) / sw) : Math.round(width * 9 / 16);
    const longSide = Math.max(W, H);

    // lines per sample, in 0..1 frame coordinates (origin top-left)
    for (const s of samples) {
      s.lines = (s.o.text_boxes || []).filter((b) => b && typeof b.text === "string" && norm(b.text) && (b.conf ?? 1) >= 0.3)
        .map((b) => ({ text: b.text.trim(), x: b.x, y: b.y, w: b.w, h: b.h, cap: false }));
      for (const ln of s.lines) {
        const nw = ln.text.split(/\s+/).length;
        ln.cap = words && words.length ? spoken(ln.text, s.t, words) : nw <= 7 && Math.abs(ln.x + ln.w / 2 - 0.5) < 0.15 && ln.h > 0.012;
      }
    }
    // upstream find_captions L195-L205: a line that reads nearly the same as one in the sample before continues its chain
    let prev = [], chains = 0;
    const longest = new Map();
    for (const s of samples) {
      const cur = [];
      for (const ln of s.lines) {
        const k = norm(ln.text);
        let r = 0, c = -1;
        for (const p of prev) if ((p.k === k || ratio(p.k, k) >= 0.8) && p.r >= r) { r = p.r; c = p.c; }
        if (c < 0) c = chains++;
        ln.run = r + 1; ln.chain = c;
        longest.set(c, Math.max(longest.get(c) || 0, r + 1));
        cur.push({ k, r: r + 1, c });
      }
      prev = cur;
    }
    // same text for more than 4 s is a title or screen text, not a caption; under 2.2% of the height is small print
    for (const s of samples) for (const ln of s.lines) {
      if (ln.cap && (longest.get(ln.chain) * step > 4 || ln.h < 0.022)) ln.cap = false;
    }
    // the densest 0.24-high band of centre-y; captions further than 0.12 from its median are dropped
    const ys = samples.flatMap((s) => s.lines.filter((l) => l.cap).map((l) => l.y + l.h / 2)).sort((a, b) => a - b);
    if (ys.length) {
      let bj = 0, bc = -1;
      for (let i = 0; i < ys.length; i++) { let k = i; while (k < ys.length && ys[k] <= ys[i] + 0.24) k++; if (k - i > bc) { bc = k - i; bj = i; } }
      let e = bj; while (e < ys.length && ys[e] <= ys[bj] + 0.24) e++;
      const band = median(ys.slice(bj, e));
      for (const s of samples) for (const ln of s.lines) if (ln.cap && Math.abs(ln.y + ln.h / 2 - band) > 0.12) ln.cap = false;
    }
    const block = (s) => s.lines.filter((l) => l.cap).sort((a, b) => a.y - b.y);
    const caps = samples.map((s) => block(s)).filter((b) => b.length);

    let captions = false;
    if (caps.length >= 0.1 * n) {
      const text = caps.flat().map((l) => l.text).join(" ");
      const letters = text.replace(/\bI\b/g, "").replace(/[^A-Za-z]/g, "");
      const up = letters.length ? [...letters].filter((c) => c >= "A" && c <= "Z").length / letters.length : 0;
      captions = {
        present: true,
        y_pct: round(100 * median(caps.map((b) => (b[0].y + b[b.length - 1].y + b[b.length - 1].h) / 2)), 1),
        x_pct: round(100 * median(caps.map((b) => b[0].x + b[0].w / 2)), 1),
        size_pct: round((100 * median(caps.flatMap((b) => b.map((l) => (l.h * H) / longSide)))) / EM_PER_BOX, 2),
        words_per_caption: Math.round(median(caps.map((b) => b.reduce((a, l) => a + l.text.split(/\s+/).length, 0)))),
        lines: Math.round(median(caps.map((b) => b.length))),
        stack_pct: round((100 * caps.filter((b) => b.length >= 2).length) / caps.length),
        case: up > 0.9 ? "upper" : up < 0.03 ? "lower" : "sentence",
        matched_by: words && words.length ? "transcript" : "heuristic",
      };
    }

    // face framing (upstream L883-L890): the largest face per sample
    const faces = samples.map((s) => [...(s.o.faces || [])].sort((a, b) => b.w * b.h - a.w * a.h)[0]).filter(Boolean);
    let face = { present_pct: 0 };
    face.present_pct = round((100 * faces.length) / n);
    const face_x_samples = faces.map((f) => round(f.x + f.w / 2, 3));
    if (faces.length) {
      const fh = median(faces.map((f) => f.h));
      face = { present_pct: face.present_pct, x_pct: round(100 * median(faces.map((f) => f.x + f.w / 2)), 1), y_pct: round(100 * median(faces.map((f) => f.y + f.h / 2)), 1), height_pct: round(100 * fh, 1), framing: fh >= 0.22 ? "close" : fh >= 0.12 ? "medium" : "wide" };
    }

    // non-caption text that is not set dressing (upstream L895-L935 idea): text in over half the samples is ignored
    const seen = new Map();
    for (const s of samples) for (const k of new Set(s.lines.map((l) => norm(l.text)))) seen.set(k, (seen.get(k) || 0) + 1);
    const cy = samples.flatMap((s) => s.lines.filter((l) => l.cap).map((l) => l.y + l.h / 2));
    const bandY = cy.length ? median(cy) : -1;
    let withText = 0;
    for (const s of samples) {
      const area = s.lines.filter((l) => !l.cap && (seen.get(norm(l.text)) || 0) <= 0.5 * n && Math.abs(l.y + l.h / 2 - bandY) > 0.04).reduce((a, l) => a + l.w * l.h, 0);
      if (area >= 0.004) withText++;
    }
    return { version: REFLOOK_VERSION, samples: n, engine: "apple-vision-accurate", face, face_x_samples, captions, text_share: round((100 * withText) / n), notes };
  } catch (e) {
    return degraded(`reflook: could not measure (${String(e && e.message || e).slice(0, 160)})`);
  } finally {
    try { fs.rmSync(own, { recursive: true, force: true }); } catch {}
  }
}
