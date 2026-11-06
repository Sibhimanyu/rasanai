// Grammar readout: render-side measures of a film's visual grammar, from the RENDERED video only (zero-dependency Node + ffmpeg).
// Ported from the night-1106 analyst scripts (metrics.mjs, layout.mjs). Bands come from the four house reference films
// (Minase, Kinso, TaskShelf, Sovra); they are guidance for warnings and for the reference juror, never hard errors.
//   bleed_share         share of frames where content crosses a frame side
//   density_cv/sparse_s edge-density rhythm per second (variation) and seconds with almost nothing on screen
//   stepped_share       seconds that move in held-then-jump steps;  nonsmooth_share = stepped + flicker
//   unchanged_share     share of the film in still runs of 1 s or more; longest_still_s the longest run
//   events_per_10s      visual events (scene score >= 0.08, merged within 0.25 s) per 10 s
//   headline_card_share frames that look like a headline over a centred card (heuristic, best effort)
//   node lib/grammar-readout.mjs --video <mp4> [--json]
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ref numbers (findings table): Minase / Kinso / TaskShelf / Sovra. A band is [min, max]; null = open.
export const BANDS = {
  bleed_share: { band: [0.15, null], refs: [0.89, 0.18, 0.54, 0.18], note: "type or UI that crosses a frame edge (references .18-.89; ours sat at .12-.14)" },
  density_cv: { band: [0.5, null], refs: [0.6, 0.79, 0.74, 0.62], note: "density rhythm: dense and sparse seconds alternate" },
  sparse_s: { band: [1, null], refs: [2, 6, 3, 8], note: "seconds with almost nothing on screen (a breath)" },
  stepped_share: { band: [null, null], refs: [0.37, 0, 0, 0], note: "designed contrast, not a requirement" },
  nonsmooth_share: { band: [0.15, 0.6], refs: [0.52, 0.08, 0.2, 0.02], note: "stepped or flicker seconds" },
  unchanged_share: { band: [null, 0.1], refs: [0.06, 0.1, 0.01, 0.02], note: "still runs of 1 s or more" },
  longest_still_s: { band: [null, 1.5], refs: [1.5, 1.5, 1.0, 1.25], note: "longest unchanged stretch" },
  events_per_10s: { band: [null, null], refs: [null, null, null, null], note: "readout only" },
  headline_card_share: { band: [null, 0.18], refs: [0.05, 0, 0, 0.06], note: "headline over a centred card (pixel heuristic, noisy: refs measure .05-.17, ours .19-.21; the analyst's frame count had ours at .20-.60)" },
};

const W = 192, H = 108, FPS = 4;
const ff = (args, enc) => spawnSync("ffmpeg", ["-v", "error", ...args], { maxBuffer: 1 << 30, encoding: enc || undefined });
const r2 = (v) => Math.round(v * 100) / 100;

function sceneScores(video, withStats) {
  const vf = `scale=320:-2,select='gte(scene\\,0)'${withStats ? "" : ""},metadata=print:file=-`;
  const out = ff(["-i", video, "-vf", vf, "-an", "-f", "null", "-"], "utf8").stdout || "";
  const fr = []; let cur = null;
  for (const l of out.split("\n")) {
    let m = l.match(/pts_time:([\d.]+)/); if (m) { cur = { t: +m[1], s: 0 }; fr.push(cur); continue; }
    m = l.match(/scene_score=([\d.]+)/); if (m && cur) cur.s = +m[1];
  }
  return fr;
}

// overrides: measures another gate already took on the same film (launch-gates passes its texture and stillness numbers so the two never disagree)
export function grammarReadout(video, overrides = {}) {
  const raw = ff(["-i", video, "-vf", `fps=${FPS},scale=${W}:${H}:flags=area,format=gray`, "-f", "rawvideo", "-"]).stdout;
  const N = raw ? Math.floor(raw.length / (W * H)) : 0;
  if (N < 4) throw new Error(`grammar-readout: ffmpeg could not decode ${video}`);
  const rows = [];
  for (let k = 0; k < N; k++) {
    const o = k * W * H, px = (x, y) => raw[o + y * W + x];
    let n = 0, eL = 0, eR = 0, eT = 0, eB = 0, topN = 0, topMinX = W, topMaxX = 0, lowN = 0, lowMinX = W, lowMaxX = 0, lowMinY = H, lowMaxY = 0;
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const g = Math.abs(px(x + 1, y) - px(x - 1, y)) + Math.abs(px(x, y + 1) - px(x, y - 1));
      if (g <= 40) continue;
      n++; if (x < W * 0.04) eL++; if (x > W * 0.96) eR++; if (y < H * 0.05) eT++; if (y > H * 0.95) eB++;
      if (y >= H * 0.08 && y < H * 0.32) { topN++; topMinX = Math.min(topMinX, x); topMaxX = Math.max(topMaxX, x); }
      else if (y >= H * 0.36 && y < H * 0.94) { lowN++; lowMinX = Math.min(lowMinX, x); lowMaxX = Math.max(lowMaxX, x); lowMinY = Math.min(lowMinY, y); lowMaxY = Math.max(lowMaxY, y); }
    }
    const bleed = (eL + eR) > H * 0.25 || (eT + eB) > W * 0.25;
    // headline over a centred card: edge ink in the top band spanning a fair width, and a block below that is centred, narrower than the frame and tall
    const topW = topN > 25 ? (topMaxX - topMinX) / W : 0, lowW = lowN > 60 ? (lowMaxX - lowMinX) / W : 0, lowH = lowN > 60 ? (lowMaxY - lowMinY) / H : 0;
    const lowCx = lowN > 60 ? (lowMaxX + lowMinX) / 2 / W : 0;
    const card = topW >= 0.25 && lowW >= 0.3 && lowW <= 0.78 && lowH >= 0.35 && Math.abs(lowCx - 0.5) < 0.06;
    rows.push({ dens: n / (W * H), bleed, card });
  }
  const dur = N / FPS;
  const perSec = []; for (let s = 0; s * FPS < N; s++) { const w = rows.slice(s * FPS, s * FPS + FPS); perSec.push(w.reduce((a, r) => a + r.dens, 0) / w.length); }
  const mean = perSec.reduce((a, b) => a + b, 0) / perSec.length || 1e-9;
  const cv = Math.sqrt(perSec.reduce((a, b) => a + (b - mean) ** 2, 0) / perSec.length) / mean;
  const sparse = perSec.filter((d) => d < 0.015).length;

  // native-fps scene scores: stepped / smooth / flicker per second, unchanged runs, events
  const fr = sceneScores(video);
  const out = { duration_s: r2(dur) };
  if (fr.length > 8) {
    const d2 = fr[fr.length - 1].t || dur, fps = fr.length / d2, win = Math.max(1, Math.round(fps));
    let stepped = 0, flicker = 0, secs = 0;
    for (let i = 0; i + win <= fr.length; i += win) {
      const w = fr.slice(i, i + win), m = w.reduce((a, f) => a + f.s, 0) / w.length;
      const held = w.filter((f) => f.s < 0.0015).length / w.length, big = w.filter((f) => f.s >= 0.12).length;
      secs++; if (big >= 4) flicker++; else if (m > 0.004 && held >= 0.4) stepped++;
    }
    out.stepped_share = r2(stepped / secs); out.nonsmooth_share = r2((stepped + flicker) / secs);
    // unchanged: runs of frames with essentially no scene change (>= 1 s)
    let run = 0, still = 0, longest = 0; const flush = () => { const s = run / fps; if (s >= 1) { still += s; } longest = Math.max(longest, s); run = 0; };
    for (const f of fr) { if (f.s < 0.0015) run++; else flush(); } flush();
    out.unchanged_share = r2(still / d2); out.longest_still_s = r2(longest);
    const ev = []; for (const f of fr) if (f.s >= 0.08 && (!ev.length || f.t - ev[ev.length - 1] > 0.25)) ev.push(f.t);
    out.events_per_10s = r2(ev.length / d2 * 10);
  }
  out.bleed_share = r2(rows.filter((r) => r.bleed).length / N);
  out.density_cv = r2(cv); out.sparse_s = sparse;
  out.headline_card_share = r2(rows.filter((r) => r.card).length / N);
  for (const [k, v] of Object.entries(overrides)) if (Number.isFinite(v)) out[k] = v;
  out.bands = compareBands(out);
  return out;
}

export function compareBands(m) {
  const res = {};
  for (const [k, b] of Object.entries(BANDS)) {
    const v = m[k]; if (v == null) continue;
    const [lo, hi] = b.band; const status = lo != null && v < lo ? "below" : hi != null && v > hi ? "above" : "in";
    res[k] = { value: v, band: b.band, refs: b.refs, status, note: b.note };
  }
  return res;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const i = process.argv.indexOf("--video"), v = i > 0 ? process.argv[i + 1] : process.argv[2];
  if (!v) { console.error("usage: node lib/grammar-readout.mjs --video <mp4>"); process.exit(1); }
  const video = path.resolve(v), ov = {};
  if (!process.argv.includes("--quick")) { // the gates' own texture and stillness numbers (calibrated on the references); --quick skips that pass
    try {
      const { launchGates } = await import("./launch-gates.mjs"), g = (await launchGates({ video })).measured;
      Object.assign(ov, { stepped_share: g.texture && g.texture.stepped_share, nonsmooth_share: g.texture && g.texture.nonsmooth_share, unchanged_share: g.unchanged_share, longest_still_s: g.longest_unchanged_s });
    } catch { /* keep the readout's own scene-score estimate */ }
  }
  console.log(JSON.stringify(grammarReadout(video, ov), null, 2));
}
