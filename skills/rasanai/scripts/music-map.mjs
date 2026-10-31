#!/usr/bin/env node
// music-map.mjs: the music EVENT MAP of a film (R6: the owner's favourite films cut on music events, not on a metronome grid).
//   node music-map.mjs make  --audio <track|mix|video> --out <music-map.json> [--bars] [--json]   (--bars adds downbeats, per-bar dB, sections and the ending: the map a take is edited from)
//        -> { duration, bpm, bpm_confidence, onsets:[{t, strength}], hits:[{t, rise_db}], breaks:[{from,to,depth_db}], thin:[{from,to}], cut_points:[t], ... }
//        Made BEFORE imagery and picture planning (phase order: music map ahead of imagery): the picture is planned to land on hits / break edges / riser ends.
//   node music-map.mjs check --video <final.mp4> [--map <music-map.json>] [--run <run>] [--vo] [--tol 0.15] [--json]
//        -> the final render's cuts and big visual hits against the music's events: each should land within 150 ms of one. Error when under 50% of the
//           cuts do in a film with no voice; a VO film (cuts follow the words) reports it as a warning only. Also reports the share on the BPM grid
//           (informational: the favourites sit near chance, 24%, because the picture follows events, not a grid).
// Node + ffmpeg only (lib/audio.mjs: pure-JS FFT); no Python, no librosa.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { analyzeTrack, decode, frameFeatures, estimateTempo, momentaryDb, designedBreaks, HOP, SR, r3, r1, probeDuration, hasAudioStream, cutOnsetShare } from "./lib/audio.mjs";

const f2t = (i) => (i * HOP) / SR;
const pctile = (a, p) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; };

// withBars: also the bar grid for editing a take to picture (lib/music-edit.mjs): downbeats, per-bar energy, section boundaries, the ending
export function makeMap(file, { withBars = false } = {}) {
  const y = decode(file);
  const dur = y.length / SR;
  const F = frameFeatures(y);
  // onsets: local maxima of the spectral-flux onset curve (plus the low band so a kick counts), a floor at the 60th percentile
  const pk = [];
  for (let i = 1; i < F.n - 1; i++) if (F.onset[i] > F.onset[i - 1] && F.onset[i] >= F.onset[i + 1]) pk.push({ i, v: F.onset[i] + F.low[i] });
  const floor = pctile(pk.map((p) => p.v), 60), top = pctile(pk.map((p) => p.v), 92);
  const onsets = [];
  for (const p of pk) if (p.v >= floor && (!onsets.length || f2t(p.i) - onsets[onsets.length - 1].t >= 0.08)) onsets.push({ t: r3(f2t(p.i)), strength: r3(p.v) });
  // hits: strong onsets whose broadband level jumps at least 6 dB over the 0.3 s before (a crash, a drop, a kick after a gap)
  const mom = momentaryDb(y, 0.05), hits = [];
  for (const o of onsets) {
    if (o.strength < top) continue;
    const k = Math.round(o.t / 0.05); if (k < 2 || k + 2 >= mom.length) continue;
    const before = mom.slice(Math.max(0, k - 6), k - 1), after = Math.max(...mom.slice(k, k + 3));
    const rise = after - (before.reduce((a, b) => a + b, 0) / Math.max(1, before.length));
    if (rise >= 6 && (!hits.length || o.t - hits[hits.length - 1].t >= 0.4)) hits.push({ t: o.t, rise_db: r1(rise) });
  }
  const m100 = momentaryDb(y, 0.1);
  const br = designedBreaks(m100, 0.1, { dropDb: 8, minS: 0.4, headS: 0.5, tailS: 0.5 });
  // thinning before a drop: a 0.5-1 s stretch 4-8 dB under the median that ends on a hit
  const med = br.median, thin = [];
  for (const h of hits) { const k = Math.round(h.t / 0.1); let j = k - 1; while (j > 0 && m100[j] < med - 3 && m100[j] > med - 8) j--; const from = (j + 1) * 0.1; if (h.t - from >= 0.4 && h.t - from <= 1.2) thin.push({ from: r3(from), to: h.t }); }
  const tempo = estimateTempo(F.onset);
  const bpm = Math.round(tempo.bpm * 10) / 10;
  const cut_points = [...new Set([...hits.map((h) => h.t), ...br.breaks.flatMap((b) => [b.from, b.to]), ...onsets.filter((o) => o.strength >= top * 0.7).map((o) => o.t)].map((t) => r3(t)))].sort((a, b) => a - b);
  let grid = {};
  if (withBars) { try { const A = analyzeTrack(file, { quick: true }); grid = { bar_s: A.bar_s, downbeats: A.bars, bar_db: A.bar_db, downbeat_confidence: A.downbeat_confidence, sections: A.sections, ending: A.ending }; } catch (e) { grid = { grid_error: String(e.message).slice(0, 120) }; } }
  return { version: 1, source: path.basename(file), duration: r3(dur), bpm, ...grid, bpm_confidence: r3(tempo.confidence), onsets, hits, breaks: br.breaks, thin, cut_points, median_db: br.median,
    note: "cut and land big visual hits within 150 ms of an onset / hit / break edge; end each riser ON the visual hit; 2-4 big hits per 50 s; the first world flip is the loudest hit" };
}

// visual change times of a render: hard cuts / full-frame changes by ffmpeg scene detection (frame-accurate)
export function visualCuts(video, thr = 0.3) {
  let out = "";
  try { out = execFileSync("ffmpeg", ["-v", "info", "-nostdin", "-i", video, "-vf", `select='gt(scene,${thr})',showinfo`, "-an", "-f", "null", "-"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 1 << 28 }); } catch (e) { out = String((e && (e.stderr || e.stdout)) || ""); }
  return [...out.matchAll(/pts_time:([\d.]+)/g)].map((m) => +m[1]).filter((t) => t > 0.2);
}

export function checkSync({ video, map = null, vo = false, tol = 0.15 } = {}) {
  const res = { ok: true, errors: [], warnings: [], measured: {} };
  if (!video || !fs.existsSync(video)) { res.ok = false; res.errors.push("music-sync: --video is required"); return res; }
  const cuts = visualCuts(video, 0.3), big = visualCuts(video, 0.5);
  res.measured.cuts = cuts.length; res.measured.big_visual_hits = big.length;
  if (!hasAudioStream(video)) { res.measured.skipped = "the render has no audio"; res.warnings.push("music-sync: the render has no audio stream"); return res; }
  const M = map || makeMap(video);
  const ev = [...M.onsets.map((o) => o.t)];
  res.measured.bpm = M.bpm;
  if (cuts.length < 4) { res.measured.skipped = `${cuts.length} hard cut(s): needs 4 to measure (a morph-led film changes without cuts)`; return res; }
  const R = cutOnsetShare(cuts, ev, { tolS: tol, nearS: 0.4 });
  res.measured.cuts_on_music = R.on_onset; res.measured.share_on_music = R.share; res.measured.near_misses = R.near_misses.slice(0, 8);
  if (big.length) { const RB = cutOnsetShare(big, M.hits.length ? M.hits.map((h) => h.t) : ev, { tolS: tol, nearS: 0.4 }); res.measured.big_hits_on_music = RB.on_onset; res.measured.big_hit_share = RB.share; }
  // grid share (informational)
  if (M.bpm > 0) { const per = 60 / M.bpm, phase = M.onsets.length ? M.onsets[0].t % per : 0; res.measured.share_on_grid = r3(cuts.filter((c) => { const d = Math.abs(((c - phase) % per + per) % per); return Math.min(d, per - d) <= tol; }).length / cuts.length); res.measured.grid_chance = r3(Math.min(1, 2 * tol / per)); }
  const share = R.share ?? 0, msg = `${R.on_onset} of ${cuts.length} cuts (${Math.round(share * 100)}%) land within ${Math.round(tol * 1000)} ms of a music event`;
  const fix = (R.near_misses || []).slice(0, 3).map((n) => `${n.cut} s -> ${n.onset} s (${n.off_ms} ms)`).join("; ");
  if (vo) { if (share < 0.3) res.warnings.push(`music-sync: ${msg} (a voice-led film cuts on the words; check the cuts that fall in the gaps). ${fix ? "Slides: " + fix : ""}`); }
  else if (share < 0.5) { res.ok = false; res.errors.push(`music-sync: ${msg} (at least 50% in a film with no voice). Slide the cuts onto the nearest hit: ${fix || "re-cut to the music map"}`); }
  else if (share < 0.7) res.warnings.push(`music-sync: ${msg} (70% is the favourites' level)`);
  return res;
}

function main() {
  const argv = process.argv.slice(2), cmd = argv.shift(), a = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) { const k = argv[i].slice(2); a[k] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true; }
  const fail = (m) => { process.stderr.write(m + "\n"); process.exit(1); };
  if (cmd === "make") {
    if (!a.audio || a.audio === true || !a.out || a.out === true) fail("usage: music-map.mjs make --audio <file> --out <music-map.json>");
    const M = makeMap(path.resolve(a.audio), { withBars: !!a.bars });
    fs.mkdirSync(path.dirname(path.resolve(a.out)), { recursive: true });
    fs.writeFileSync(path.resolve(a.out), JSON.stringify(M, null, 2) + "\n");
    console.log(JSON.stringify({ ok: true, out: a.out, bpm: M.bpm, onsets: M.onsets.length, hits: M.hits.length, breaks: M.breaks.length, cut_points: M.cut_points.length }));
  } else if (cmd === "check") {
    if (!a.video || a.video === true) fail("usage: music-map.mjs check --video <final.mp4> [--map f] [--run dir] [--vo]");
    let map = null, vo = !!a.vo;
    if (a.map && a.map !== true) { try { map = JSON.parse(fs.readFileSync(path.resolve(a.map), "utf8")); } catch { fail(`cannot read ${a.map}`); } }
    if (a.run && a.run !== true && !vo) { try { const mj = JSON.parse(fs.readFileSync(path.join(path.resolve(a.run), "audio", "mix.mix.json"), "utf8")); vo = !!(mj.stems && mj.stems.vo); } catch {} }
    const r = checkSync({ video: path.resolve(a.video), map, vo, tol: a.tol ? Number(a.tol) : 0.15 });
    if (map) r.measured.map_hits = map.hits ? map.hits.length : null;
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.ok ? 0 : 2);
  } else fail("usage: music-map.mjs make|check ...");
}
import { fileURLToPath } from "node:url";
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
