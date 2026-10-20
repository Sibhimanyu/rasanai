// Adapted from cooked. (MIT, Copyright (c) 2026 NextWork), plugins/creator-teardown/skills/creator-teardown/scripts/check.py face_cover L563-L571 (FACE_COVER 0.02; heads from the clean background L615) @3b236ec; ported to Node and modified by RasanAI. Credit: third_party/cooked/.
// (upstream SHA 3b236ec8fe32343cdf38375df90f6cd71e0846d7; no clean plate here, so the SOURCE frame's heads are compared with the RENDERED frame's faces; Apple Vision via scripts/vision/vision.swift)
//
// Rendered-frame checks for a reel: is a graphic covering the speaker's face, is text under platform UI.
// All findings are warnings (uncalibrated). Never throws for a missing engine: it returns ok with skipped[] notes.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { destinationOf, zonesFor, boxInZones } from "./safezones.mjs";

export const FRAMECHECK_VERSION = "framecheck@1";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const VISION_SWIFT = path.join(HERE, "..", "vision", "vision.swift");
const SWIFT = "/usr/bin/swift";
const MIN_CONF = 0.5;      // source head confidence worth checking
const MIN_OVERLAP = 0.3;   // a render face overlapping the source head by this much means the head is still visible
const HIDDEN_SHARE = 0.5;  // flag when at least this share of a window's samples lost the head
const STEP_S = 0.5;        // default source head sampling step (faces doc step_s overrides)

const run = (cmd, args, timeout = 120000) => spawnSync(cmd, args, { encoding: "utf8", timeout, maxBuffer: 64 * 1024 * 1024 });
const r3 = (v) => Math.round(v * 1000) / 1000;
const r2 = (v) => Math.round(v * 100) / 100;

function visionAvailable() {
  if (process.platform !== "darwin") return "Apple Vision needs macOS";
  if (!fs.existsSync(SWIFT)) return "/usr/bin/swift not found";
  if (!fs.existsSync(VISION_SWIFT)) return "vision.swift missing";
  return "";
}

// share of the smaller box that the two boxes overlap (a raw face sits inside an expanded head, so this is ~1 for the same person)
function overlap(a, b) {
  const iw = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const ih = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const m = Math.min(a.w * a.h, b.w * b.h);
  return m > 0 ? (iw * ih) / m : 0;
}

// the clip item playing at timeline time t -> { item, src } with the source time that frame shows, or null
function clipAt(items, t) {
  for (const it of items) {
    if (it.kind !== "clip" || !it.clip) continue;
    const st = it.start ?? 0, d = it.duration ?? 0;
    if (t < st - 1e-6 || t >= st + d) continue;
    const span = (it.out ?? 0) - (it.in ?? 0);
    const rate = d > 0 && span > 0 ? span / d : 1;
    return { item: it, src: (it.in ?? 0) + (t - st) * rate };
  }
  return null;
}

// heads (conf >= MIN_CONF) the source had around source time `ts`; null when the faces doc does not cover it
function sourceHeads(doc, ts) {
  const heads = doc && Array.isArray(doc.heads) ? doc.heads : null;
  if (!heads || !heads.length) return null;
  const step = doc.step_s || STEP_S;
  let best = null;
  for (const h of heads) if (typeof h.t === "number" && Math.abs(h.t - ts) <= step && (!best || Math.abs(h.t - ts) < Math.abs(best.t - ts))) best = h;
  if (!best) return null;
  return (best.boxes || []).filter((b) => (b.conf ?? 1) >= MIN_CONF);
}

export async function checkFrames({ video, edl, faces = {}, destination = null, aspect = null, every = 0.5, max = 120 } = {}) {
  const out = { ok: true, samples: 0, findings: [], skipped: [] };
  if (!video || !fs.existsSync(video)) { out.ok = false; out.skipped.push(`framecheck: video not found (${video})`); return out; }
  if (!edl || typeof edl !== "object") { out.ok = false; out.skipped.push("framecheck: no edl"); return out; }
  const why = visionAvailable();
  if (why) { out.skipped.push(`Apple Vision not available: rendered frames unchecked (${why})`); return out; }

  const items = Array.isArray(edl.items) ? edl.items : [];
  // windows: every overlay and every card
  const wins = [];
  for (const o of edl.overlays || []) wins.push({ element: `overlay "${[].concat(o.text || "").join(" / ").slice(0, 40)}"`, start: o.start, dur: o.duration, kind: "overlay" });
  for (const it of items) if (it.kind === "card") wins.push({ element: `card ${it.n ?? ""} "${String(it.label || "").slice(0, 40)}"`.replace("  ", " "), start: it.start, dur: it.duration, kind: "card" });
  wins.sort((a, b) => a.start - b.start);
  const valid = wins.filter((w) => Number.isFinite(w.start) && w.dur > 0);
  if (!valid.length) { out.skipped.push("framecheck: no overlay or card windows in the edl"); return out; }

  // sample times, capped overall (evenly thinned)
  const times = [];
  valid.forEach((w, wi) => { for (let t = w.start; t < w.start + w.dur - 1e-6; t += every) times.push({ wi, t: r3(t) }); });
  let picked = times;
  if (times.length > max) { const k = times.length / max; picked = Array.from({ length: max }, (_, i) => times[Math.floor(i * k)]); }

  const own = fs.mkdtempSync(path.join(os.tmpdir(), "framecheck-"));
  try {
    const files = [];
    for (let i = 0; i < picked.length; i++) {
      const f = path.join(own, `f${String(i).padStart(4, "0")}.jpg`);
      const r = run("ffmpeg", ["-v", "error", "-y", "-ss", String(picked[i].t), "-i", video, "-an", "-frames:v", "1", "-vf", "scale=720:-2", "-q:v", "3", f], 60000);
      files.push(r.status === 0 && fs.existsSync(f) ? f : null);
    }
    const byPath = new Map();
    const ok = files.filter(Boolean);
    for (let i = 0; i < ok.length; i += 40) {
      const r = run(SWIFT, [VISION_SWIFT, "--accurate", ...ok.slice(i, i + 40)], 180000);
      if (r.status !== 0) { out.skipped.push(`Vision batch ${i / 40 + 1} failed: ${String(r.stderr || r.error || "").trim().split("\n").pop()}`); continue; }
      try { for (const o of JSON.parse(r.stdout)) byPath.set(o.path, o); } catch { out.skipped.push(`Vision batch ${i / 40 + 1} returned nothing readable`); }
    }
    const zones = zonesFor(destinationOf({ destination, aspect }), aspect);
    const per = valid.map(() => ({ n: 0, hiddenN: 0, checked: 0, ts: [], hiddenTs: [], unknownClips: new Set(), text: new Map() }));

    picked.forEach((s, i) => {
      const o = files[i] ? byPath.get(files[i]) : null;
      if (!o || o.error) return;
      out.samples++;
      const P = per[s.wi];
      P.n++;
      // text under platform UI
      for (const b of o.text_boxes || []) {
        if (!b || !(b.w > 0) || (b.conf ?? 1) < 0.3) continue;
        const hit = boxInZones(b, zones).filter((z) => z.zone !== "margin");
        if (hit.length) { const k = String(b.text || "").trim(); const e = P.text.get(k) || { zone: hit[0].zone, share: hit[0].share, n: 0, ts: [] }; e.n++; e.ts.push(s.t); P.text.set(k, e); }
      }
      // face hidden: only where a clip plays under the window
      const under = clipAt(items, s.t);
      if (!under) return;
      const clip = under.item.clip;
      const doc = faces[clip];
      if (!doc) { P.unknownClips.add(clip); return; }
      const heads = sourceHeads(doc, under.src);
      if (!heads) { P.unknownClips.add(clip); return; }
      if (!heads.length) return; // source had no confident head here
      P.checked++;
      P.ts.push(s.t);
      const seen = heads.some((h) => (o.faces || []).some((f) => overlap(f, h) >= MIN_OVERLAP));
      if (!seen) { P.hiddenN++; P.hiddenTs.push(s.t); }
    });

    const flagged = new Set();
    valid.forEach((w, wi) => {
      const P = per[wi];
      const end = w.start + w.dur;
      for (const clip of P.unknownClips) {
        if (flagged.has(clip)) continue;
        flagged.add(clip);
        out.findings.push({ check: "face-unknown", severity: "warning", at: r2(w.start), until: r2(end), element: w.element, observed: { share: null, samples: P.n }, source: "rendered_frame", message: `face not checked for ${clip}: no head data for the moment under ${w.element}`, fix: "run footage.mjs faces --run \"$RUN\" for this clip, then check the frames again" });
      }
      if (P.checked && P.hiddenN / P.checked >= HIDDEN_SHARE) {
        out.findings.push({ check: "face-hidden", severity: "warning", at: r2(Math.min(...P.hiddenTs)), until: r2(Math.min(end, Math.max(...P.hiddenTs) + every)), element: w.element, observed: { share: r2(P.hiddenN / P.checked), samples: P.checked }, source: "rendered_frame", message: `a graphic may cover the speaker's face: the head seen in the source is not visible in ${P.hiddenN} of ${P.checked} rendered samples`, fix: "move the graphic out of the head area (usually lower third or a side), shrink it, or shorten it" });
      }
      for (const [text, e] of P.text) {
        out.findings.push({ check: "text-under-platform-ui", severity: "warning", at: r2(Math.min(...e.ts)), until: r2(Math.min(end, Math.max(...e.ts) + every)), element: w.element, observed: { share: e.share, samples: e.n, zone: e.zone, text: text.slice(0, 60) }, source: "rendered_frame", message: `text "${text.slice(0, 40)}" sits under the ${e.zone} of ${zones.id} in the rendered frame`, fix: "move the text clear of the platform UI and the safe margin" });
      }
    });
    return out;
  } finally {
    try { fs.rmSync(own, { recursive: true, force: true }); } catch {}
  }
}
