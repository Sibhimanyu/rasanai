// Launch-film gates measured from the RENDERED video (Node + ffmpeg only, 4 fps): the failures the older gates let through on
// the 1.36 film "26keys-launch" (one dark ground for 45 s, tiny type in a vast frame, 8 s that read as still, a 13 s hook).
//   scale          foreground coverage per frame (the 4%-trimmed bbox of non-ground pixels / frame) and display-scale type per beat
//   atmosphere     "lit": colour light in the frame (median chroma, saturated-light share p90, how much the chroma changes over the film). A dark ground lit by moving
//                  colour glow (Sovra.fm) is atmosphere; a flat, unlit, static void (the 26keys v6 film) is not. Calibrated on all three owner references (Minase, Kinso, Sovra) + v6.
//   grounds        the ground families used (dark / light / colour) and how often the brand colour is on screen
//   stillness      "meaningful change": edge pixels that appear where there was no edge within ~1 % of the frame width half a second
//                  earlier. Uniform drift, blur and creep (a blurred key crawling) move edges by less than that and count as nothing.
//   texture        motion texture at the file's NATIVE frame rate (held-then-jump frames = stepped, big content change on most frames = flicker); a
//                  readout and two warnings (never all smooth, never all stutter), not a failure: stepped motion is a designed contrast
//                  (references/launch-grammar.md "Motion texture"). Stepped holds of 3 frames or less count as motion in the stillness measure.
//   hook           the hook + turn beats (up to the reveal) as a share of the film
// MEASURED DEFECTS stay hard: an unlit, empty or low-coverage frame (scale-coverage), meaningful stillness, photosensitivity and unreadable text. Everything the research found unsourced
// (a minimum display-scale type size, a texture share, an end-card length) is guidance: a warning that asks the score to explain the change (departures [{rule, why}]), a note once it does.
//   readable exposure  each essential line's SETTLED, UNOCCLUDED time against about 2.7 to 3 words per second (lib/readable-exposure.mjs): a warning from the composition's DOM, never a failure
// Text size comes from the HTML composition's DOM (frame-gate's domTextProject), passed in as textRows [{t, bigPct}] (bigPct = the
// tallest visible ink as % of frame height) or measured here when the project is given and no rows were passed.
//   node lib/launch-gates.mjs --video <mp4> [--project <dir>] [--score <score.json>] [--text-rows <json>] [--end-hold 4.0] [--json]
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { grammarWaivers } from "./gate-profile.mjs";
import { readableExposure } from "./readable-exposure.mjs";

export const LAUNCH_GATE = {
  fps: 4, W: 640, H: 360,
  coverage_min: 0.30,       // median foreground coverage: v6 0.24, the two references 0.51 and 0.73
  giant_pct: 9,             // display-scale type: ink height as % of frame height
  small_pct: 5, small_share: 0.5,
  ground_min_share: 0.08,   // a ground family must hold this share of the frames to count as used
  brand_min_share: 0.15,
  still_error_s: 2.0, still_warn_s: 1.6, // v6 longest 3.0 s, references 1.5 s (a warning at the spec's 1.2 s would flag both)
  novel_px: 200,            // new edge pixels (of 640x360) per 0.5 s for a sample to count as changed
  hook_warn: 0.25, hook_error: 0.35,
  // texture (native fps, 160x90 gray). Minase: ~160 held-jumps in 41 s (about 39 per 10 s), flicker 6.5-9 s, ~40% of its runtime non-smooth by this measure
  tex_W: 160, tex_H: 90, tex_dup: 0.1, tex_jump: 1.0, tex_big: 8, tex_hold_s: 0.1, tex_bin_s: 0.5, tex_stepped_min: 2, tex_flicker_frac: 0.4,
  // photosensitivity (WCAG 2.3.1 / Ofcom): a large swing of the whole frame's mean luma (>= flash_swing of 255, opposite directions) is a flash; more than 3 flashes in any second warns
  flash_swing: 50, flash_max_per_s: 3,
  // atmosphere: lit when ANY of: saturated light is strong on the busiest frames, the median frame carries colour, or the colour of the film changes a lot over time
  lit_sat_p90: 0.05, lit_chroma_med: 6, lit_chroma_sd: 5, tail_lit_max_s: 4.0, tail_ambient_min: 0.4,
  nonsmooth_min: 0.15, nonsmooth_max: 0.6, // the doctrine aims at 15-40%; the render measure warns only past 60% (it also counts footage that is genuinely busy)
};

const median = (a) => { const s = a.filter((v) => Number.isFinite(v)).sort((p, q) => p - q); return s.length ? s[s.length >> 1] : 0; };
const r2 = (v) => Math.round(v * 100) / 100;
const jr = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };

function decode(video, { fps, W, H }) {
  const r = spawnSync("ffmpeg", ["-v", "error", "-i", video, "-vf", `fps=${fps},scale=${W}:${H}:flags=area`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 1 << 30 });
  if (r.error || r.status !== 0 || !r.stdout || !r.stdout.length) throw new Error(`ffmpeg could not decode ${video}: ${String(r.error || r.stderr || "").slice(0, 160)}`);
  const fsz = W * H * 3;
  return { buf: r.stdout, n: Math.floor(r.stdout.length / fsz), fsz };
}

const hueOf = (r, g, b) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return [0, 0, mx / 255]; let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h = (h * 60 + 360) % 360; return [h, d / mx, mx / 255]; };
const hexRgb = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(h || "")); return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : null; };
const hueGap = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

// the per-frame pixel measures on a stride-4 grid (160x90)
function pixelMeasures(dec, { W, H }, accentHue) {
  const S = 4, gw = W / S, gh = H / S, rows = [], hueHist = new Float64Array(36);
  for (let i = 0; i < dec.n; i++) {
    const o = i * dec.fsz, px = (x, y, c) => dec.buf[o + ((y * S) * W + x * S) * 3 + c];
    const bd = Math.max(2, Math.round(gh * 0.06)), ring = [[], [], []];
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) if (y < bd || y >= gh - bd || x < bd || x >= gw - bd) for (let c = 0; c < 3; c++) ring[c].push(px(x, y, c));
    const gr = ring.map((a) => { a.sort((p, q) => p - q); return a[a.length >> 1]; });
    const luma = 0.299 * gr[0] + 0.587 * gr[1] + 0.114 * gr[2], chroma = Math.max(...gr) - Math.min(...gr);
    const family = chroma >= 40 ? "colour" : luma < 80 ? "dark" : luma > 185 ? "light" : "colour";
    const colc = new Int32Array(gw), rowc = new Int32Array(gh); let cnt = 0, brand = 0;
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      const r = px(x, y, 0), g = px(x, y, 1), b = px(x, y, 2);
      if (Math.max(Math.abs(r - gr[0]), Math.abs(g - gr[1]), Math.abs(b - gr[2])) > 40) { cnt++; colc[x]++; rowc[y]++; }
      const [h, s, v] = hueOf(r, g, b);
      if (s >= 0.35 && v >= 0.25) { hueHist[Math.floor(h / 10) % 36]++; if (accentHue != null && hueGap(h, accentHue) <= 25) brand++; }
    }
    const trim = (arr, q) => { let tot = 0; for (const v of arr) tot += v; if (!tot) return [-1, -1]; let a = 0, lo = -1, hi = -1; for (let k = 0; k < arr.length; k++) { a += arr[k]; if (lo < 0 && a >= tot * q) lo = k; if (a >= tot * (1 - q)) { hi = k; break; } } return [lo, hi]; };
    const [x0, x1] = trim(colc, 0.04), [y0, y1] = trim(rowc, 0.04);
    const cov = cnt / (gw * gh) >= 0.002 && x0 >= 0 && y0 >= 0 ? ((x1 - x0 + 1) * (y1 - y0 + 1)) / (gw * gh) : 0;
    rows.push({ t: i / 4, cov, family, luma, chroma, brandShare: brand / (gw * gh), groundHue: chroma >= 25 ? hueOf(gr[0], gr[1], gr[2])[0] : null });
  }
  let best = 0; for (let k = 1; k < 36; k++) if (hueHist[k] > hueHist[best]) best = k;
  return { rows, autoHue: hueHist[best] > 0 ? best * 10 + 5 : null };
}

// new-edge energy per sample: edge pixels now with no edge within R px `lag` samples ago, plus the reverse (edges that vanished)
function noveltySeries(dec, { W, H }, lag = 2, R = 6) {
  const N = W * H, E = [], D = [], out = [];
  const gray = (o, p) => (dec.buf[o + p * 3] * 77 + dec.buf[o + p * 3 + 1] * 150 + dec.buf[o + p * 3 + 2] * 29) >> 8;
  const dil = (e) => {
    const t = new Uint8Array(N), o = new Uint8Array(N), pre = new Int32Array(Math.max(W, H) + 1);
    for (let y = 0; y < H; y++) { pre[0] = 0; for (let x = 0; x < W; x++) pre[x + 1] = pre[x] + e[y * W + x]; for (let x = 0; x < W; x++) t[y * W + x] = pre[Math.min(W, x + R + 1)] - pre[Math.max(0, x - R)] > 0 ? 1 : 0; }
    for (let x = 0; x < W; x++) { pre[0] = 0; for (let y = 0; y < H; y++) pre[y + 1] = pre[y] + t[y * W + x]; for (let y = 0; y < H; y++) o[y * W + x] = pre[Math.min(H, y + R + 1)] - pre[Math.max(0, y - R)] > 0 ? 1 : 0; }
    return o;
  };
  for (let i = 0; i < dec.n; i++) {
    const o = i * dec.fsz, g = new Uint8Array(N), e = new Uint8Array(N);
    for (let p = 0; p < N; p++) g[p] = gray(o, p);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const p = y * W + x; if (Math.abs(g[p + 1] - g[p - 1]) + Math.abs(g[p + W] - g[p - W]) > 50) e[p] = 1; }
    E.push(e); D.push(dil(e));
    if (i >= lag) { let a = 0; const pe = E[i - lag], pd = D[i - lag]; for (let p = 0; p < N; p++) { if (e[p] && !pd[p]) a++; if (pe[p] && !D[i][p]) a++; } out.push(a); } else out.push(null);
    if (i >= lag) { E[i - lag] = null; D[i - lag] = null; }
  }
  return out;
}

// atmosphere from the 4 fps frames (stride 4): per-frame mean chroma (max-min), share of saturated light (s >= .35, v >= .25)
function atmosphereOf(dec, { W, H }, G) {
  const S = 4, gw = W / S, gh = H / S, chroma = [], sat = [];
  for (let i = 0; i < dec.n; i++) {
    const o = i * dec.fsz; let c = 0, k = 0;
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) { const p = o + ((y * S) * W + x * S) * 3, r = dec.buf[p], g = dec.buf[p + 1], b = dec.buf[p + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b); c += mx - mn; if (mx >= 64 && (mx - mn) / mx >= 0.35) k++; }
    chroma.push(c / (gw * gh)); sat.push(k / (gw * gh));
  }
  const q = (a, p) => { const t = [...a].sort((x, y) => x - y); return t[Math.min(t.length - 1, Math.floor(t.length * p))] || 0; };
  const mean = chroma.reduce((a, b) => a + b, 0) / (chroma.length || 1), sd = Math.sqrt(chroma.reduce((a, b) => a + (b - mean) ** 2, 0) / (chroma.length || 1));
  const m = { chroma_median: r2(q(chroma, 0.5)), chroma_sd: r2(sd), sat_p90: r2(q(sat, 0.9)) };
  m.lit = m.sat_p90 >= G.lit_sat_p90 || m.chroma_median >= G.lit_chroma_med || m.chroma_sd >= G.lit_chroma_sd;
  return m;
}
// ambient motion in the last tail_s seconds: mean abs RGB change between frames 1 s apart (light sweeps, glow drift, a bloom) that the edge measure cannot see
function tailAmbient(dec, { W, H }, fps, tailS) {
  const n = dec.n, k = Math.max(1, Math.round(tailS * fps)), lag = fps, S = 8; let tot = 0, cnt = 0;
  for (let i = Math.max(lag, n - k); i < n; i++) { const a = i * dec.fsz, b = (i - lag) * dec.fsz; for (let y = 0; y < H; y += S) for (let x = 0; x < W; x += S) { const p = (y * W + x) * 3; tot += Math.abs(dec.buf[a + p] - dec.buf[b + p]) + Math.abs(dec.buf[a + p + 1] - dec.buf[b + p + 1]) + Math.abs(dec.buf[a + p + 2] - dec.buf[b + p + 2]); cnt += 3; } }
  return cnt ? r2(tot / cnt) : 0;
}

// dead runs: stretches of samples with no meaningful change, the film's last run (the end-card hold) reported apart
export function deadRuns(nov, thr, fps) {
  let end = nov.length; while (end > 0 && (nov[end - 1] == null || nov[end - 1] < thr)) end--;
  const runs = []; let s0 = null;
  for (let i = 0; i < end; i++) { const dead = nov[i] != null && nov[i] < thr; if (dead) { if (s0 == null) s0 = i; } else if (s0 != null) { runs.push({ at: r2(s0 / fps), s: r2((i - s0) / fps) }); s0 = null; } }
  return { runs, tail_s: r2((nov.length - end) / fps) };
}

// motion texture of the render at its native frame rate. A frame pair is a DUPLICATE (mean abs gray diff < tex_dup), a JUMP (> tex_jump) or a BIG change
// (> tex_big: a card or image swapped). held-jump = a jump preceded by 1..hold frames of duplicates that a jump preceded (stepped motion: "on twos or threes").
// Bins of tex_bin_s: stepped when >= tex_stepped_min held-jumps; flicker when >= tex_flicker_frac of the pairs are BIG changes. Static holds (a slate) have no jump on
// either side, so they are never stepped; smooth motion has no duplicates, so it is never stepped either.
export function textureOf(d, fps, G = LAUNCH_GATE) {
  const n = d.length, hold = Math.max(1, Math.round(G.tex_hold_s * fps)), bin = Math.max(2, Math.round(G.tex_bin_s * fps));
  const hj = new Uint8Array(n); let held = 0;
  for (let i = 2; i < n; i++) if (d[i] > G.tex_jump) {
    let h = 0; while (i - 1 - h > 0 && d[i - 1 - h] < G.tex_dup && h < hold) h++;
    if (h >= 1 && i - 1 - h > 0 && d[i - 1 - h] > G.tex_jump) { hj[i] = 1; held++; }
  }
  let stepped = 0, flicker = 0, nonsmooth = 0, bins = 0; const timeline = [];
  for (let s0 = 0; s0 < n; s0 += bin) {
    let h = 0, big = 0, c = 0; for (let i = s0; i < Math.min(n, s0 + bin); i++) { h += hj[i]; if (d[i] > G.tex_big) big++; c++; }
    const fl = c >= 4 && big / c >= G.tex_flicker_frac, st = !fl && h >= G.tex_stepped_min;
    bins++; if (fl) flicker++; if (st) stepped++; if (fl || st) nonsmooth++;
    timeline.push(fl ? "F" : st ? "S" : ".");
  }
  const dur = n / fps;
  return { source_fps: r2(fps), held_jumps: held, held_jumps_per_10s: r2(dur ? (held / dur) * 10 : 0), stepped_share: r2(stepped / bins), flicker_share: r2(flicker / bins), nonsmooth_share: r2(nonsmooth / bins), timeline: timeline.join("") };
}

function textureMeasure(video, G) {
  const pr = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=r_frame_rate", "-of", "csv=p=0", video], { encoding: "utf8" });
  const [a, b] = String(pr.stdout || "30/1").trim().split("/").map(Number); let fps = b ? a / b : a; if (!(fps >= 10 && fps <= 120)) fps = 30;
  const { tex_W: W, tex_H: H } = G, P = W * H;
  const r = spawnSync("ffmpeg", ["-v", "error", "-i", video, "-vf", `scale=${W}:${H}:flags=area,format=gray`, "-f", "rawvideo", "-"], { maxBuffer: 1 << 30 });
  if (r.error || r.status !== 0 || !r.stdout || r.stdout.length < P * 3) return null;
  const buf = r.stdout, n = Math.floor(buf.length / P), d = new Float64Array(n), mean = new Float64Array(n);
  for (let i = 0; i < n; i++) { let s = 0; const o = i * P; for (let k = 0; k < P; k++) s += buf[o + k]; mean[i] = s / P; }
  for (let i = 1; i < n; i++) { let t = 0; const o = i * P, p = o - P; for (let k = 0; k < P; k++) t += Math.abs(buf[o + k] - buf[p + k]); d[i] = t / P; }
  const tx = textureOf(d, fps, G);
  // flashes: a big mean-luma step then a big step back the other way, counted per sliding 1 s window (only swings of the WHOLE frame move the mean this much)
  const sw = []; for (let i = 1; i < n; i++) { const dl = mean[i] - mean[i - 1]; if (Math.abs(dl) >= G.flash_swing) sw.push({ i, s: Math.sign(dl) }); }
  const fl = []; for (let k = 1; k < sw.length; k++) if (sw[k].s !== sw[k - 1].s) fl.push(sw[k].i);
  let worst = 0, at = 0; for (let a = 0, b = 0; b < fl.length; b++) { while (fl[b] - fl[a] >= fps) a++; if (b - a + 1 > worst) { worst = b - a + 1; at = fl[a] / fps; } }
  tx.max_flashes_per_s = worst; tx.flash_at_s = r2(at);
  return tx;
}

export function beatsOf(score) {
  const sc = score && Array.isArray(score.scenes) ? score.scenes : [];
  return sc.filter((s) => Number.isFinite(+s.start) && Number.isFinite(+s.end)).map((s) => ({ id: s.id, role: String(s.beat || s.role || ""), start: +s.start, end: +s.end }));
}

export async function launchGates({ video, project = null, score = null, textRows = null, endHold = 4.0, opts = {} } = {}) {
  const G = { ...LAUNCH_GATE, ...opts }, findings = [], measured = {};
  const add = (check, severity, message) => findings.push({ check, severity, message });
  const dec = decode(path.resolve(video), G), dur = dec.n / G.fps;
  const sc = typeof score === "string" ? jr(score) : score, beats = beatsOf(sc), dep = grammarWaivers(sc || {}).waived;
  const accentHex = sc && ((sc.style && sc.style.palette && sc.style.palette.accent) || (sc.accent && sc.accent.colour) || (sc.accent && sc.accent.color) || null);
  const ac = hexRgb(accentHex), accentHue = ac ? hueOf(...ac)[0] : null;
  let { rows, autoHue } = pixelMeasures(dec, G, accentHue);
  const brandHue = accentHue ?? autoHue;
  if (accentHue == null && autoHue != null) { // no palette known (a reference film): the most common saturated hue stands in for the brand colour
    rows = pixelMeasures(dec, G, autoHue).rows;
  }
  const win = beats.length ? beats : Array.from({ length: Math.max(1, Math.ceil(dur / 4.5)) }, (_, k) => ({ id: `w${k + 1}`, role: "", start: k * 4.5, end: Math.min(dur, (k + 1) * 4.5) }));
  const inWin = (b) => rows.filter((r) => r.t >= b.start - 1e-6 && r.t < b.end - 1e-6);

  // 1 scale
  const cov = median(rows.map((r) => r.cov));
  measured.coverage_median = r2(cov);
  const atm = atmosphereOf(dec, G, G); measured.atmosphere = atm;
  // small content is an ERROR only in a flat, unlit void with little brand colour (the 26keys v6 film); in a frame lit by colour glow and light (Sovra.fm) it is a warning
  const brandPre = rows.filter((r) => r.brandShare >= 0.01 || (r.family === "colour" && r.groundHue != null && (accentHue ?? autoHue) != null && hueGap(r.groundHue, accentHue ?? autoHue) <= 30)).length / rows.length;
  if (cov < G.coverage_min) {
    if (!atm.lit && brandPre < G.brand_min_share) add("scale-coverage", "error", `foreground content fills a median ${r2(cov)} of the frame (at least ${G.coverage_min}) in a flat, unlit ground with little brand colour: everything is small in a vast empty frame; scale the content up or light and fill the frame`);
    else add("scale-coverage", "warning", `foreground content fills a median ${r2(cov)} of the frame (${G.coverage_min} is typical); fine when the frame is lit and moving (a dark ground with colour glow), but check that small type is not lost`);
  }
  if (!textRows && project) {
    try {
      const { domTextProject } = await import("../frame-gate.mjs");
      const times = rows.map((r) => r.t), d = await domTextProject(project, times);
      if (d.rows) textRows = d.rows.map((x, i) => ({ t: times[i], bigPct: x.bigPct, blocks: x.blocks })); else measured.text_unmeasured = d.could_not_run;
    } catch (e) { measured.text_unmeasured = [String(e.message).slice(0, 120)]; }
  }
  if (textRows && textRows.length) {
    const perBeat = win.map((b) => { const v = textRows.filter((r) => r.t >= b.start - 1e-6 && r.t < b.end - 1e-6).map((r) => r.bigPct || 0); return { id: b.id, role: b.role, max_pct: r2(Math.max(0, ...v)) }; });
    measured.type_max_pct_by_beat = perBeat;
    measured.type_tallest_pct = r2(Math.max(0, ...perBeat.map((b) => b.max_pct)));
    const small = perBeat.filter((b) => b.max_pct < G.small_pct).length;
    measured.beats_small_type_share = r2(small / perBeat.length);
    if (measured.type_tallest_pct < G.giant_pct) { const why = dep["display-scale"]; // no source sets a minimum type size: a default with a reason, not a failure
      if (why) add("scale-display-type", "note", `departs by choice (${why}): the tallest type is ${measured.type_tallest_pct}% of the frame height (${G.giant_pct}% is the default for one beat)`);
      else add("scale-display-type", "warning", `no beat has display-scale type: the tallest type is ${measured.type_tallest_pct}% of the frame height (${G.giant_pct}% in one beat is the default, not a law): make the key line big, or record { rule: "display-scale", why } in score.departures`); }
    if (textRows.some((r) => r.blocks)) { const ts = textRows.map((r) => r.t).filter(Number.isFinite), step = ts.length > 1 ? Math.max(1e-3, (ts[ts.length - 1] - ts[0]) / (ts.length - 1)) : 1 / G.fps, ex = readableExposure(textRows, step); measured.readable_exposure = ex.summary; for (const fd of ex.findings) add(fd.check, fd.severity, fd.message); }
    if (small / perBeat.length > G.small_share) add("scale-small-type", "warning", `${small} of ${perBeat.length} beats have their largest type under ${G.small_pct}% of the frame height`);
  } else measured.type_skipped = "no DOM text measure (no --project)";

  // 2 grounds
  const share = {}; for (const r of rows) share[r.family] = (share[r.family] || 0) + 1 / rows.length;
  const used = Object.keys(share).filter((k) => share[k] >= G.ground_min_share);
  measured.ground_families = Object.fromEntries(Object.entries(share).map(([k, v]) => [k, r2(v)]));
  measured.ground_by_beat = win.map((b) => { const f = {}; for (const r of inWin(b)) f[r.family] = (f[r.family] || 0) + 1; return { id: b.id, family: Object.entries(f).sort((a, b2) => b2[1] - a[1])[0]?.[0] || null }; });
  const lightVaries = atm.lit && atm.chroma_sd >= G.lit_chroma_sd && atm.sat_p90 >= G.lit_sat_p90; // one ground with strong moving colour light (a bloom that changes across beats) counts
  measured.ground_light_variation = lightVaries;
  if (used.length < 2 && !lightVaries) add("ground-variety", "error", `the film uses one ground family (${used[0] || "none"}) for its whole length and its light does not vary: alternate grounds (dark, white-light, brand gradient or colour) between beats, or move coloured light across them`);
  const brandFrames = rows.filter((r) => r.brandShare >= 0.01 || (r.family === "colour" && r.groundHue != null && brandHue != null && hueGap(r.groundHue, brandHue) <= 30)).length / rows.length;
  measured.brand_colour_share = r2(brandFrames); measured.brand_colour_source = accentHue != null ? `palette accent ${accentHex}` : autoHue != null ? `most common saturated hue (${autoHue} deg; no palette)` : "none found";
  if (brandFrames < G.brand_min_share) add("ground-brand-colour", "warning", `the brand colour is on screen in ${Math.round(brandFrames * 100)}% of the frames (about ${Math.round(G.brand_min_share * 100)}% or more): carry the brand colour through the grounds, not only the cards`);

  // 3 stillness
  const nov = noveltySeries(dec, G), { runs, tail_s } = deadRuns(nov, G.novel_px, G.fps);
  const longest = runs.reduce((m, r) => (r.s > m.s ? r : m), { s: 0, at: 0 });
  measured.longest_unchanged_s = longest.s; measured.longest_unchanged_at_s = longest.at; measured.unchanged_runs_ge_1s = runs.filter((r) => r.s >= 1);
  measured.unchanged_share = r2(runs.filter((r) => r.s >= 1).reduce((s, r) => s + r.s, 0) / dur); measured.tail_still_s = tail_s;
  if (longest.s > G.still_error_s) add("meaningful-stillness", "error", `${longest.s} s from ${longest.at} s has no meaningful change (only drift, blur or creep; ${G.still_error_s} s at most): give that beat a real event (a new element, a word swap, a camera move)`);
  else if (longest.s > G.still_warn_s) add("meaningful-stillness", "warning", `${longest.s} s from ${longest.at} s has no meaningful change (${G.still_warn_s} s is the comfortable limit)`);
  { const amb = tail_s > 0 ? tailAmbient(dec, G, G.fps, tail_s) : 0; measured.tail_ambient = amb;
    const okLit = tail_s <= G.tail_lit_max_s + 1 / G.fps && amb >= G.tail_ambient_min; // a settled end frame of 2 to 4 s is the starting value (more for a URL or several calls to action)
    if (tail_s > endHold + 1 / G.fps && !okLit) add("meaningful-stillness-tail", "warning", `the film is unchanged for its last ${tail_s} s (an end-card hold is ${endHold} s at most, about ${G.tail_lit_max_s} s when ambient light keeps moving)`); }

  // 3b texture: a readout, with two warnings. Stepped motion is never a stillness failure (its holds are <= 3 frames; the 0.5 s novelty lag above sees the jumps).
  try {
    const tx = textureMeasure(path.resolve(video), G);
    if (tx) {
      measured.texture = tx;
      if (tx.max_flashes_per_s > G.flash_max_per_s) add("photosensitivity-flash", "warning", `${tx.max_flashes_per_s} large full-frame luminance flashes within one second near ${tx.flash_at_s} s (${G.flash_max_per_s} per second at most, WCAG 2.3.1 / Ofcom)`, "keep a flicker burst's ground constant and change only part of the frame, keep the luminance swing small, never alternate full-frame black and white or flash saturated red");
      const soft = (check, msg) => (dep.texture ? add(check, "note", `departs by choice (${dep.texture}): ${msg}`) : add(check, "warning", `${msg} (a default, not a law: record { rule: "texture", why } in score.departures to keep it)`));
      if (dur >= 20 && tx.nonsmooth_share === 0) soft("texture-all-smooth", "no stepped or flicker section found in the render, every beat moves smoothly. A crisp smooth film can be right; a stepped collage or a flicker burst usually adds energy, with the calm beats kept smooth");
      else if (tx.nonsmooth_share > G.nonsmooth_max) soft("texture-all-stutter", `${Math.round(tx.nonsmooth_share * 100)}% of the film is stepped or flicker (about 15-40% is the starting value): let the calm beats (meet, payoff, end) move smoothly`);
    }
  } catch (e) { measured.texture_unmeasured = String(e.message).slice(0, 120); }

  // 4 hook
  const meet = beats.find((b) => /meet|reveal/i.test(b.role));
  const hookBeats = beats.filter((b) => /^(hook|turn)/i.test(b.role));
  if (beats.length && hookBeats.length) {
    const hookEnd = meet ? meet.start : Math.max(...hookBeats.map((b) => b.end)), total = Math.max(...beats.map((b) => b.end));
    measured.hook_s = r2(hookEnd); measured.hook_share = r2(hookEnd / total);
    if (hookEnd / total > G.hook_error) add("hook-length", "error", `the hook and turn run ${r2(hookEnd)} s, ${Math.round(100 * hookEnd / total)}% of the film (${Math.round(G.hook_error * 100)}% at most): cut it to the felt problem, the pivot, then the reveal`);
    else if (hookEnd / total > G.hook_warn) add("hook-length", "warning", `the hook and turn run ${r2(hookEnd)} s, ${Math.round(100 * hookEnd / total)}% of the film (under ${Math.round(G.hook_warn * 100)}% is the target)`);
  } else measured.hook_skipped = "no score beats";
  measured.duration_s = r2(dur);
  return { ok: !findings.some((f) => f.severity === "error"), findings, measured };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const { parseArgs } = await import("./common.mjs");
  const a = parseArgs();
  if (!a.video) { console.error("usage: node lib/launch-gates.mjs --video <mp4> [--project <dir>] [--score <score.json>] [--text-rows <json>]"); process.exit(1); }
  const rows = a["text-rows"] ? jr(String(a["text-rows"])) : null; // [{t, bigPct}] from frame-gate's --json frames (saves a second DOM pass)
  const res = await launchGates({ video: String(a.video), project: a.project ? path.resolve(String(a.project)) : null, score: a.score ? String(a.score) : null, textRows: Array.isArray(rows) && rows.length ? rows : null, endHold: Number(a["end-hold"]) || 4.0 });
  console.log(JSON.stringify(res, null, 2));
  process.exit(res.ok ? 0 : 2);
}
