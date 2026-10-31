// Music and SFX analysis in pure JS (Node >= 20 + ffmpeg/ffprobe; no Python, no npm deps).
// Used by sound.mjs (analyze / fit / render / sfx-plan / check) and music.mjs.
//
// Pipeline (references/sound.md has the reasoning; numbers come from the R4 research):
//   decode      ffmpeg -> f32le mono 22.05 kHz
//   frames      2048-pt STFT, hop 512 (23 ms): RMS, 64 log bands (dB), spectral flux (onset
//               strength, full band and < 150 Hz), chroma, 12-band timbre
//   tempo       windowed autocorrelation of the onset envelope x log-normal prior at 120 BPM
//   beats       Ellis dynamic-programming beat tracker (tightness 100), then a local linear fit
//               per beat for sub-frame precision
//   downbeats   4/4 assumed; the beat phase where kick (< 150 Hz flux), onsets and chord
//               changes are strongest
//   bars        per-bar energy (dB), chroma, timbre, accent
//   sections    Foote checkerboard novelty on the bar self-similarity + energy jumps, snapped
//               to 4-bar phrases
//   ending      ring-out (final hit then decay), stop (hit then silence), fade (mastered
//               fade-out) or cut (ends mid-flow: a loop clip)
//   loudness    ffmpeg ebur128 (integrated, LRA, true peak)
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync, spawnSync } from "node:child_process";

export const SR = 22050;
export const HOP = 512;
export const NFFT = 2048;
export const FPS = SR / HOP;
const f2t = (i) => (i * HOP) / SR;
const t2f = (t) => Math.round((t * SR) / HOP);
export const r3 = (x) => (x == null || !Number.isFinite(x) ? x : Math.round(x * 1000) / 1000);
export const r1 = (x) => (x == null || !Number.isFinite(x) ? x : Math.round(x * 10) / 10);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const median = (a) => {
  if (!a.length) return 0;
  const s = Float64Array.from(a).sort();
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const pct = (a, p) => {
  if (!a.length) return 0;
  const s = Float64Array.from(a).sort();
  return s[clamp(Math.round((p / 100) * (s.length - 1)), 0, s.length - 1)];
};
const cos = (a, b) => {
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    d += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? d / Math.sqrt(na * nb) : 0;
};
export const dbToLin = (db) => Math.pow(10, db / 20);

// ---------------------------------------------------------------- ffmpeg I/O

export function toolsAvailable() {
  const ok = (bin) => spawnSync(bin, ["-version"], { stdio: "ignore" }).status === 0;
  return { ffmpeg: ok("ffmpeg"), ffprobe: ok("ffprobe") };
}

export function requireTools() {
  const t = toolsAvailable();
  if (!t.ffmpeg || !t.ffprobe) {
    const e = new Error("ffmpeg and ffprobe are required for sound analysis (macOS: `brew install ffmpeg`; Debian/Ubuntu: `apt install ffmpeg`)");
    e.code = "NO_FFMPEG";
    throw e;
  }
}

export function probeDuration(file) {
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file], { encoding: "utf8" });
  return Number(out.trim()) || 0;
}

export function hasAudioStream(file) {
  const out = execFileSync("ffprobe", ["-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", file], { encoding: "utf8" });
  return out.trim().length > 0;
}

// mono float PCM (or interleaved when channels > 1)
export function decode(file, { sr = SR, channels = 1, start, duration } = {}) {
  const argv = ["-v", "error", "-nostdin"];
  if (start != null) argv.push("-ss", String(start));
  argv.push("-i", file);
  if (duration != null) argv.push("-t", String(duration));
  argv.push("-vn", "-f", "f32le", "-ac", String(channels), "-ar", String(sr), "-");
  const buf = execFileSync("ffmpeg", argv, { maxBuffer: 1 << 30 });
  const n = Math.floor(buf.length / 4);
  return new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + n * 4));
}

// EBU R128 via ffmpeg: integrated LUFS, LRA, true peak (dBTP) and the 100 ms momentary /
// 3 s short-term log (for "first second at full level" and per-span checks).
export function loudness(file, { start, end, frames = false } = {}) {
  const argv = ["-hide_banner", "-nostats"];
  if (start != null) argv.push("-ss", String(start));
  if (end != null) argv.push("-to", String(end));
  argv.push("-i", file, "-vn", "-af", `ebur128=peak=true${frames ? ":framelog=info" : ":framelog=verbose"}`, "-f", "null", "-");
  const r = spawnSync("ffmpeg", argv, { encoding: "utf8", maxBuffer: 1 << 28 });
  const err = String(r.stderr || "");
  const sum = err.slice(err.lastIndexOf("Summary:"));
  const num = (re) => {
    const m = sum.match(re);
    return m ? Number(m[1]) : null;
  };
  const out = {
    lufs: num(/I:\s+(-?[\d.]+|-inf)\s+LUFS/),
    lra: num(/LRA:\s+(-?[\d.]+)\s+LU/),
    true_peak: num(/Peak:\s+(-?[\d.]+|-inf)\s+dBFS/),
  };
  if (frames) {
    out.frames = [];
    for (const m of err.matchAll(/t:\s*([\d.]+)\s+TARGET:[^M]*M:\s*(-?[\d.]+|-inf)\s+S:\s*(-?[\d.]+|-inf)/g)) {
      out.frames.push({ t: Number(m[1]), M: Number(m[2]), S: Number(m[3]) });
    }
  }
  return out;
}

// loudness of a stem over a set of spans only (e.g. music while the VO speaks)
export function loudnessOver(file, spans) {
  if (!spans.length) return null;
  const sel = spans.map(([a, b]) => `between(t\\,${a.toFixed(3)}\\,${b.toFixed(3)})`).join("+");
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-vn", "-af", `aselect='${sel}',asetpts=N/SR/TB,ebur128`, "-f", "null", "-"], { encoding: "utf8", maxBuffer: 1 << 28 });
  const err = String(r.stderr || "");
  const m = err.slice(err.lastIndexOf("Summary:")).match(/I:\s+(-?[\d.]+)\s+LUFS/);
  return m ? Number(m[1]) : null;
}

// ---------------------------------------------------------------- FFT

const fftCache = new Map();
function fftTables(n) {
  if (fftCache.has(n)) return fftCache.get(n);
  const rev = new Uint32Array(n);
  const bits = Math.log2(n);
  for (let i = 0; i < n; i++) {
    let r = 0;
    for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
    rev[i] = r;
  }
  const cosT = new Float64Array(n / 2);
  const sinT = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) {
    cosT[i] = Math.cos((2 * Math.PI * i) / n);
    sinT[i] = -Math.sin((2 * Math.PI * i) / n);
  }
  const t = { rev, cosT, sinT };
  fftCache.set(n, t);
  return t;
}

// in-place iterative radix-2
export function fft(re, im) {
  const n = re.length;
  const { rev, cosT, sinT } = fftTables(n);
  for (let i = 0; i < n; i++) {
    const j = rev[i];
    if (j > i) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const step = n / size;
    for (let i = 0; i < n; i += size) {
      for (let j = 0, k = 0; j < half; j++, k += step) {
        const a = i + j, b = a + half;
        const tr = re[b] * cosT[k] - im[b] * sinT[k];
        const ti = re[b] * sinT[k] + im[b] * cosT[k];
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
      }
    }
  }
}

// ---------------------------------------------------------------- frame features

const NB = 64; // log bands for flux
const NT = 12; // timbre bands

export function frameFeatures(y, { sr = SR, hop = HOP, nfft = NFFT } = {}) {
  const n = Math.max(1, Math.floor(y.length / hop) + 1);
  const bins = nfft / 2 + 1;
  const win = new Float64Array(nfft);
  for (let i = 0; i < nfft; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / nfft);
  const binF = (b) => (b * sr) / nfft;
  const logEdges = (lo, hi, k) => Array.from({ length: k + 1 }, (_, i) => lo * Math.pow(hi / lo, i / k));
  const be = logEdges(30, Math.min(11000, sr / 2 - 1), NB);
  const te = logEdges(60, Math.min(10000, sr / 2 - 1), NT);
  const bandOf = new Int16Array(bins).fill(-1);
  const timOf = new Int16Array(bins).fill(-1);
  const pcOf = new Int8Array(bins).fill(-1);
  for (let b = 1; b < bins; b++) {
    const f = binF(b);
    for (let k = 0; k < NB; k++) if (f >= be[k] && f < be[k + 1]) { bandOf[b] = k; break; }
    for (let k = 0; k < NT; k++) if (f >= te[k] && f < te[k + 1]) { timOf[b] = k; break; }
    if (f >= 55 && f <= 4200) pcOf[b] = ((Math.round(12 * Math.log2(f / 440)) + 69) % 12 + 12) % 12;
  }
  let lowBands = 0;
  while (lowBands < NB && be[lowBands + 1] <= 150) lowBands++;
  lowBands = Math.max(lowBands, 2);

  const rms = new Float32Array(n);
  const bandDb = new Float32Array(n * NB);
  const timbre = new Float32Array(n * NT);
  const chroma = new Float32Array(n * 12);
  const re = new Float64Array(nfft);
  const im = new Float64Array(nfft);
  const bp = new Float64Array(NB);
  const tp = new Float64Array(NT);
  for (let i = 0; i < n; i++) {
    const c = i * hop - nfft / 2;
    let ss = 0;
    for (let k = 0; k < nfft; k++) {
      const idx = c + k;
      const v = idx >= 0 && idx < y.length ? y[idx] : 0;
      ss += v * v;
      re[k] = v * win[k];
      im[k] = 0;
    }
    rms[i] = Math.sqrt(ss / nfft);
    fft(re, im);
    bp.fill(0);
    tp.fill(0);
    for (let b = 1; b < bins; b++) {
      const p = re[b] * re[b] + im[b] * im[b];
      if (bandOf[b] >= 0) bp[bandOf[b]] += p;
      if (timOf[b] >= 0) tp[timOf[b]] += p;
      if (pcOf[b] >= 0) chroma[i * 12 + pcOf[b]] += p;
    }
    for (let k = 0; k < NB; k++) bandDb[i * NB + k] = 10 * Math.log10(bp[k] + 1e-10);
    for (let k = 0; k < NT; k++) timbre[i * NT + k] = 10 * Math.log10(tp[k] + 1e-10);
  }
  // top_db clipping (80 dB below the loudest band value), then spectral flux
  let mx = -Infinity;
  for (let i = 0; i < bandDb.length; i++) if (bandDb[i] > mx) mx = bandDb[i];
  const floor = mx - 80;
  for (let i = 0; i < bandDb.length; i++) if (bandDb[i] < floor) bandDb[i] = floor;
  const onset = new Float32Array(n);
  const low = new Float32Array(n);
  for (let i = 1; i < n; i++) {
    let s = 0, l = 0;
    for (let k = 0; k < NB; k++) {
      const d = bandDb[i * NB + k] - bandDb[(i - 1) * NB + k];
      if (d > 0) {
        s += d;
        if (k < lowBands) l += d;
      }
    }
    onset[i] = s / NB;
    low[i] = l / lowBands;
  }
  return { n, rms, onset, low, chroma, timbre, bandDb };
}

// ---------------------------------------------------------------- tempo + beats

export function estimateTempo(onset, { fps = FPS, lo = 50, hi = 220, center = 120 } = {}) {
  const n = onset.length;
  const W = Math.min(n, Math.round(8 * fps));
  const maxLag = Math.min(W - 1, Math.ceil((60 * fps) / lo));
  const minLag = Math.max(1, Math.floor((60 * fps) / hi));
  const acf = new Float64Array(maxLag + 1);
  const hopW = Math.max(1, Math.round(2 * fps));
  const hann = Float64Array.from({ length: W }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / Math.max(1, W - 1)));
  let windows = 0;
  const seg = new Float64Array(W);
  for (let s = 0; s + W <= n; s += hopW) {
    let m = 0;
    for (let i = 0; i < W; i++) m += onset[s + i];
    m /= W;
    for (let i = 0; i < W; i++) seg[i] = (onset[s + i] - m) * hann[i];
    let z = 0;
    for (let i = 0; i < W; i++) z += seg[i] * seg[i];
    if (z <= 1e-9) continue;
    for (let L = minLag; L <= maxLag; L++) {
      let a = 0;
      for (let i = 0; i + L < W; i++) a += seg[i] * seg[i + L];
      acf[L] += a / z;
    }
    windows++;
  }
  if (!windows) return { bpm: 120, period: (60 * fps) / 120, confidence: 0 };
  let best = -1, bestV = -Infinity;
  const score = new Float64Array(maxLag + 1);
  for (let L = minLag; L <= maxLag; L++) {
    const bpm = (60 * fps) / L;
    const prior = Math.exp(-0.5 * Math.pow(Math.log2(bpm / center), 2));
    score[L] = (acf[L] / windows) * prior;
    if (score[L] > bestV) { bestV = score[L]; best = L; }
  }
  let period = best;
  if (best > minLag && best < maxLag) {
    const a = score[best - 1], b = score[best], c = score[best + 1];
    const d = a - 2 * b + c;
    if (d < 0) period = best + clamp((0.5 * (a - c)) / d, -0.5, 0.5);
  }
  return { bpm: (60 * fps) / period, period, confidence: acf[best] / windows };
}

// Ellis (2007) DP beat tracker, as in librosa.beat.beat_track
export function trackBeats(onset, period, { tightness = 100 } = {}) {
  const n = onset.length;
  let sd = 0;
  const m = mean(onset);
  for (let i = 0; i < n; i++) sd += (onset[i] - m) ** 2;
  sd = Math.sqrt(sd / Math.max(1, n - 1)) || 1;
  const P = period;
  const half = Math.round(P);
  const local = new Float64Array(n);
  const g = [];
  for (let k = -half; k <= half; k++) g.push(Math.exp(-0.5 * Math.pow((k * 32) / P, 2)));
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = -half; k <= half; k++) {
      const j = i + k;
      if (j >= 0 && j < n) s += (onset[j] / sd) * g[k + half];
    }
    local[i] = s;
  }
  const cum = new Float64Array(n);
  const back = new Int32Array(n).fill(-1);
  const wMin = Math.round(P / 2), wMax = Math.round(2 * P);
  const txcost = new Float64Array(wMax + 1);
  for (let d = 1; d <= wMax; d++) txcost[d] = -tightness * Math.pow(Math.log(d / P), 2);
  let first = true;
  const thresh = 0.01 * Math.max(...local);
  for (let i = 0; i < n; i++) {
    let bv = -Infinity, bj = -1;
    for (let d = wMin; d <= wMax; d++) {
      const j = i - d;
      if (j < 0) break;
      const v = cum[j] + txcost[d];
      if (v > bv) { bv = v; bj = j; }
    }
    if (bj >= 0 && !(first && local[i] < thresh)) {
      cum[i] = local[i] + bv;
      back[i] = bj;
    } else cum[i] = local[i];
    if (first && local[i] >= thresh) first = false;
  }
  // last beat: the last local max of cum that is >= half the median of the local maxima
  const maxima = [];
  for (let i = 1; i < n - 1; i++) if (cum[i] > cum[i - 1] && cum[i] >= cum[i + 1]) maxima.push(i);
  const med = median(maxima.map((i) => cum[i]));
  let tail = n - 1;
  for (let k = maxima.length - 1; k >= 0; k--) if (cum[maxima[k]] >= 0.5 * med) { tail = maxima[k]; break; }
  const beats = [];
  for (let i = tail; i >= 0; i = back[i]) {
    beats.push(i);
    if (back[i] < 0) break;
  }
  beats.reverse();
  return { frames: beats, local };
}

// sub-frame smoothing: each beat time from a local linear fit over +/-4 beats
function smoothBeats(times) {
  const out = [];
  for (let i = 0; i < times.length; i++) {
    const a = Math.max(0, i - 4), b = Math.min(times.length - 1, i + 4);
    if (b - a < 3) { out.push(times[i]); continue; }
    let sk = 0, st = 0, skk = 0, skt = 0, c = 0;
    for (let k = a; k <= b; k++) { sk += k; st += times[k]; skk += k * k; skt += k * times[k]; c++; }
    const slope = (c * skt - sk * st) / (c * skk - sk * sk);
    const icpt = (st - slope * sk) / c;
    const pred = icpt + slope * i;
    // follow the fit only for small corrections (sub-frame precision); keep real tempo changes
    out.push(Math.abs(pred - times[i]) <= 0.6 * (slope || 0.5) ? pred : times[i]);
  }
  return out;
}

// Best rigid grid near bpm0 (comb over the onset envelope, +/-1.5%, 0.01 BPM, quarter-frame
// phase). Accepted only when the DP beats never drift from it (16-beat windows, median < 35 ms).
function rigidGrid(onset, bpm0, raw, t0, t1) {
  const n = onset.length;
  const at = (x) => { const i = Math.floor(x), f = x - i; return i + 1 < n ? onset[i] * (1 - f) + onset[i + 1] * f : 0; };
  const a = t0 * FPS, b = t1 * FPS;
  const comb = (bpm, ph) => { const P = (60 * FPS) / bpm; let s = 0, c = 0; for (let x = a + ph; x < b; x += P) { s += at(x); c++; } return c ? s / c : 0; };
  let best = { v: -1 };
  for (let bpm = bpm0 * 0.985; bpm <= bpm0 * 1.015; bpm += 0.02) {
    const P = (60 * FPS) / bpm;
    for (let ph = 0; ph < P; ph += 0.25) { const v = comb(bpm, ph); if (v > best.v) best = { v, bpm, ph }; }
  }
  for (let bpm = best.bpm - 0.02; bpm <= best.bpm + 0.02; bpm += 0.002) {
    const P = (60 * FPS) / bpm;
    for (let ph = Math.max(0, best.ph - 1); ph < Math.min(P, best.ph + 1); ph += 0.05) { const v = comb(bpm, ph); if (v > best.v) best = { v, bpm, ph }; }
  }
  const period = 60 / best.bpm;
  const start = (a + best.ph) / FPS;
  const beats = [];
  for (let t = start; t <= t1 + 0.02; t += period) beats.push(t);
  let k = start; while (k - period >= Math.max(-0.04, t0 - 0.05)) { k -= period; beats.unshift(k); }
  const dev = raw.map((r) => { const j = Math.round((r - start) / period); return r - (start + j * period); });
  // windows without a real pulse (ambient passages) can't confirm or refute the grid
  const pulse = raw.map((r) => { const i = Math.round(r * FPS); let m = 0; for (let k = Math.max(0, i - 1); k <= Math.min(n - 1, i + 1); k++) m = Math.max(m, onset[k]); return m; });
  const allW = [];
  for (let i = 0; i + 8 <= dev.length; i += 8) allW.push([raw[i], median(dev.slice(i, i + 16)), mean(pulse.slice(i, i + 16))]);
  const pMed = median(allW.map((w) => w[2]));
  const wins = allW.filter((w) => w[2] >= 0.5 * pMed);
  // the DP tracker may lock onto the off-beat or a subdivision for a while (constant offset of
  // 1/4, 1/3 or 1/2 beat); only a drifting offset means the tempo isn't really constant
  const subs = [0, 1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4, 1].map((f) => f * period);
  const off = (m) => Math.min(...subs.map((s) => Math.abs(Math.abs(m) - s)));
  const bad = wins.filter(([, m]) => off(m) > 0.03).length;
  if (!wins.length || bad > Math.floor(0.15 * wins.length)) return null;
  return { beats, period, bpm: best.bpm };
}

// exact transient near t (the attack a splice must keep): steepest energy rise within +/-win
export function transientNear(y, t, { sr = SR, win = 0.03, minRiseDb = 3 } = {}) {
  const fl = 64, fh = 32;
  const a = Math.max(0, Math.floor((t - win) * sr) - fl);
  const b = Math.min(y.length - fl, Math.ceil((t + win) * sr) + fl);
  if (b - a < fl * 4) return { t, rise: 0 };
  const e = [];
  for (let s = a; s + fl <= b; s += fh) {
    let z = 0;
    for (let k = 0; k < fl; k++) z += y[s + k] * y[s + k];
    e.push(10 * Math.log10(z / fl + 1e-12));
  }
  let best = -1, bestD = 0;
  for (let i = 2; i < e.length; i++) {
    const d = e[i] - e[i - 2];
    const ti = (a + (i - 1) * fh) / sr;
    if (Math.abs(ti - t) > win) continue;
    const w = d - 4 * Math.abs(ti - t) / win; // prefer the one nearest the grid
    if (w > bestD) { bestD = w; best = i; }
  }
  if (best < 0 || bestD < minRiseDb) return { t, rise: r1(bestD) };
  return { t: (a + (best - 2) * fh + fl / 2) / sr, rise: r1(bestD) };
}

// ---------------------------------------------------------------- track analysis

// Full analysis; the returned object keeps private arrays (_y, _barFeat...) for fit/render.
// publicAnalysis() strips them for printing.
export function analyzeTrack(file, { quick = false } = {}) {
  requireTools();
  if (!fs.existsSync(file)) throw new Error(`track not found: ${file}`);
  const y = decode(file);
  const duration = y.length / SR;
  if (duration < 3) throw new Error(`${path.basename(file)} is ${duration.toFixed(1)} s long: too short to analyse as music`);
  const F = frameFeatures(y);
  const n = F.n;
  const fdb = Float32Array.from(F.rms, (v) => 20 * Math.log10(v + 1e-9));
  const loud = pct(Array.from(fdb), 99);
  let firstA = 0, lastA = n - 1;
  while (firstA < n - 1 && fdb[firstA] < loud - 45) firstA++;
  while (lastA > 0 && fdb[lastA] < loud - 35) lastA--;
  const first_audible = f2t(firstA);
  const last_audible = Math.min(duration, f2t(lastA) + HOP / SR);

  // tempo + beats
  const T = estimateTempo(F.onset);
  const { frames: bf } = trackBeats(F.onset, T.period);
  let raw = bf.map(f2t).filter((t) => t >= first_audible - 0.05 && t <= last_audible + 0.05);
  if (raw.length < 8) throw new Error(`no steady beat found in ${path.basename(file)} (fewer than 8 beats)`);
  const ibis = raw.slice(1).map((t, i) => t - raw[i]);
  const ibiMed = median(ibis);
  const ibiDev = ibis.filter((d) => Math.abs(d - ibiMed) < 0.5 * ibiMed);
  const tempo_cv = ibiDev.length > 2 ? Math.sqrt(mean(ibiDev.map((d) => (d - mean(ibiDev)) ** 2))) / mean(ibiDev) : 1;
  // grid-produced music: a rigid grid (exact BPM + phase) beats per-beat estimates for splicing
  const rigid = rigidGrid(F.onset, 60 / ibiMed, raw, first_audible, last_audible);
  const beats = rigid ? rigid.beats : smoothBeats(raw);
  let beat_s = rigid ? rigid.period : median(beats.slice(1).map((t, i) => t - beats[i]));

  // flux peaks lead the attack by up to a frame: shift the whole grid onto the measured transients
  {
    const offs = [];
    const step = Math.max(1, Math.floor(beats.length / 96));
    for (let i = 0; i < beats.length; i += step) {
      const tr = transientNear(y, beats[i], { win: 0.04, minRiseDb: 6 });
      if (tr.rise >= 6) offs.push(tr.t - beats[i]);
    }
    if (offs.length >= 8) {
      const off = median(offs);
      if (Math.abs(off) > 0.002 && Math.abs(off) < 0.04) for (let i = 0; i < beats.length; i++) beats[i] += off;
      while (beats.length && beats[0] < 0) beats.shift();
      if (beats.length && beats[0] - beat_s >= -0.03 && beats[0] - beat_s >= first_audible - 0.05) beats.unshift(Math.max(0, beats[0] - beat_s));
    }
  }
  // double time: above 135 BPM with the kick on every other tracked beat, the real beat is half
  let folded = false;
  if (60 / beat_s > 135 && beats.length >= 16) {
    const lowAt = (t) => { const i = t2f(t); let m = 0; for (let k = Math.max(0, i - 1); k <= Math.min(n - 1, i + 1); k++) m = Math.max(m, F.low[k]); return m; };
    const ev = mean(beats.filter((_, i) => i % 2 === 0).map(lowAt)), od = mean(beats.filter((_, i) => i % 2 === 1).map(lowAt));
    if (Math.max(ev, od) > 1.4 * Math.min(ev, od)) {
      const keep = ev >= od ? 0 : 1;
      const half = beats.filter((_, i) => i % 2 === keep);
      beats.length = 0;
      beats.push(...half);
      beat_s *= 2;
      folded = true;
    }
  }
  // downbeat phase: kick flux + onset + chord change at the beat
  const onsetAt = (t, arr) => {
    const i = t2f(t);
    let m = 0;
    for (let k = Math.max(0, i - 1); k <= Math.min(n - 1, i + 1); k++) m = Math.max(m, arr[k]);
    return m;
  };
  const chromaSpan = (t0, t1) => {
    const v = new Float64Array(12);
    for (let i = Math.max(0, t2f(t0)); i < Math.min(n, t2f(t1)); i++) for (let c = 0; c < 12; c++) v[c] += F.chroma[i * 12 + c];
    return v;
  };
  const beatChroma = beats.map((t, i) => chromaSpan(t, beats[i + 1] ?? t + beat_s));
  const harm = beats.map((_, i) => (i ? 1 - cos(beatChroma[i], beatChroma[i - 1]) : 0));
  const lowB = beats.map((t) => onsetAt(t, F.low));
  const onB = beats.map((t) => onsetAt(t, F.onset));
  const nz = (a) => { const m = mean(a) || 1; return a.map((v) => v / m); };
  const [lowN, onN, harmN] = [nz(lowB), nz(onB), nz(harm)];
  const phaseScore = [0, 1, 2, 3].map((p) => {
    const idx = beats.map((_, i) => i).filter((i) => i % 4 === p);
    return mean(idx.map((i) => lowN[i] + 0.5 * onN[i] + 0.6 * harmN[i]));
  });
  let phase = phaseScore.indexOf(Math.max(...phaseScore));
  const sortedPS = [...phaseScore].sort((a, b) => b - a);
  const downbeat_confidence = sortedPS[0] > 0 ? (sortedPS[0] - sortedPS[1]) / sortedPS[0] : 0;
  const barLayer = (phase) => {
  const bars = beats.filter((_, i) => i % 4 === phase);
  const bar_s = beats.length > phase + 4 ? median(bars.slice(1).map((t, i) => t - bars[i])) : 4 * beat_s;

  // per-bar features
  const nbar = bars.length;
  const barEnd = (i) => bars[i + 1] ?? Math.min(last_audible, bars[i] + bar_s);
  const bar_db = [], barChroma = [], barTim = [], barAccent = [];
  for (let i = 0; i < nbar; i++) {
    const a = Math.max(0, t2f(bars[i])), b = Math.max(a + 1, Math.min(n, t2f(barEnd(i))));
    let ms = 0;
    const ch = new Float64Array(12), tb = new Float64Array(NT);
    for (let k = a; k < b; k++) {
      ms += F.rms[k] * F.rms[k];
      for (let c = 0; c < 12; c++) ch[c] += F.chroma[k * 12 + c];
      for (let c = 0; c < NT; c++) tb[c] += F.timbre[k * NT + c];
    }
    bar_db.push(10 * Math.log10(ms / (b - a) + 1e-12));
    const cm = Math.max(...ch) || 1;
    barChroma.push(Array.from(ch, (v) => v / cm));
    barTim.push(Array.from(tb, (v) => v / (b - a)));
    barAccent.push(onsetAt(bars[i], F.onset) + onsetAt(bars[i], F.low));
  }
  // timbre z-scored across bars, so similarity reflects instrumentation changes
  const tMean = Array.from({ length: NT }, (_, c) => mean(barTim.map((v) => v[c])));
  const tSd = Array.from({ length: NT }, (_, c) => Math.sqrt(mean(barTim.map((v) => (v[c] - tMean[c]) ** 2))) || 1);
  const barFeat = barTim.map((v, i) => [...barChroma[i], ...v.map((x, c) => (0.5 * (x - tMean[c])) / tSd[c])]);

  // sections: Foote novelty (checkerboard, half-width 4 bars, gaussian taper) + energy jumps
  const K = 4;
  const nov = new Float64Array(nbar);
  for (let i = 0; i < nbar; i++) {
    let s = 0;
    for (let a = -K; a < K; a++) for (let b = -K; b < K; b++) {
      const ia = clamp(i + a, 0, nbar - 1), ib = clamp(i + b, 0, nbar - 1);
      const sign = (a < 0) === (b < 0) ? 1 : -1;
      const w = Math.exp(-((a + 0.5) ** 2 + (b + 0.5) ** 2) / (2 * (K / 2) ** 2));
      s += sign * w * cos(barFeat[ia], barFeat[ib]);
    }
    nov[i] = Math.max(0, s);
  }
  const nmax = Math.max(...nov) || 1;
  const e2 = (i) => mean(bar_db.slice(Math.max(0, i), Math.min(nbar, i + 2)));
  const jump = bar_db.map((_, i) => (i >= 2 ? e2(i) - mean(bar_db.slice(i - 2, i)) : 0));
  const score = Array.from(nov, (v, i) => v / nmax + clamp(Math.abs(jump[i]) / 6, 0, 1));
  const thr = pct(score.slice(2, -2), 75);
  const cand = [];
  for (let i = 2; i < nbar - 1; i++) if (score[i] >= score[i - 1] && score[i] >= (score[i + 1] ?? 0) && score[i] > thr) cand.push(i);
  const snap = (c) => (Math.abs(c - Math.round(c / 4) * 4) <= 1 ? Math.round(c / 4) * 4 : c);
  let bounds = [...new Set([0, ...cand.map(snap).filter((b) => b > 0 && b < nbar), nbar])].sort((a, b) => a - b);
  // merge sections shorter than 4 bars (drop the weaker boundary)
  let changed = true;
  while (changed) {
    changed = false;
    for (let k = 1; k < bounds.length - 1; k++) {
      if (bounds[k] - bounds[k - 1] < 4 || bounds[k + 1] - bounds[k] < 4) {
        const nb = bounds[k + 1] - bounds[k] < 4 && k + 1 < bounds.length - 1 ? k + 1 : k;
        const drop = score[bounds[nb]] < score[bounds[k]] ? nb : k;
        bounds.splice(drop, 1);
        changed = true;
        break;
      }
    }
  }
  const sections = [];
  for (let k = 0; k + 1 < bounds.length; k++) {
    const a = bounds[k], b = bounds[k + 1];
    const db = mean(bar_db.slice(a, b));
    sections.push({ n: k + 1, bar0: a, bar1: b, bars: b - a, t0: r3(bars[a]), t1: r3(b < nbar ? bars[b] : barEnd(nbar - 1)), db: r1(db) });
  }
  const top = Math.max(...sections.map((s) => s.db));
  sections.forEach((s, k) => {
    const d = s.db - top;
    s.tier = d > -1.5 ? "peak" : d > -5 ? "mid" : "low";
    s.jump_db = r1(k ? s.db - sections[k - 1].db : 0);
    s.label = k === 0 && s.tier !== "peak" ? "intro" : k === sections.length - 1 && s.tier === "low" ? "outro" : s.jump_db >= 3 ? (s.tier === "peak" ? "drop" : "lift") : s.jump_db <= -3 ? "breakdown" : s.tier === "peak" ? "peak" : "verse";
  });

    return { bars, bar_s, nbar, barEnd, bar_db, barChroma, barAccent, barFeat, sections, top };
  };
  let { bars, bar_s, nbar, barEnd, bar_db, barChroma, barAccent, barFeat, sections, top } = barLayer(phase);
  // ending (a final hit lands on a "1": when the kick can't decide the downbeat, the hit does)
  let ending = detectEnding({ F, fdb, loud, bars, beats, bar_s, beat_s, last_audible, duration, top, bar_db });
  let downbeat_from = "kick and chord changes";
  if (ending.natural && ending.hit != null && downbeat_confidence < 0.15) {
    const bi = beats.findIndex((t) => Math.abs(t - ending.hit) < 0.1);
    if (bi >= 0 && bi % 4 !== phase) {
      phase = bi % 4;
      ({ bars, bar_s, nbar, barEnd, bar_db, barChroma, barAccent, barFeat, sections, top } = barLayer(phase));
      ending = detectEnding({ F, fdb, loud, bars, beats, bar_s, beat_s, last_audible, duration, top, bar_db });
      downbeat_from = "the final hit";
    }
  }

  const strong_sections = sections
    .filter((s) => (s.tier === "peak" && s.bars >= 4) || (s.tier === "mid" && s.bars >= 8))
    .sort((a, b) => b.db - a.db)
    .map((s) => ({ n: s.n, t0: s.t0, t1: s.t1, bars: s.bars, db: s.db, tier: s.tier, jump_db: s.jump_db, label: s.label }));

  const startThresh = top - 6;
  const start_candidates = [];
  for (const s of sections) for (let b = s.bar0; b < s.bar1; b += 4) {
    if (bar_db[b] >= startThresh) start_candidates.push({ t: r3(bars[b]), bar: b, section: s.n, db: r1(bar_db[b]), left_s: r1(last_audible - bars[b]) });
  }

  const covered = bars.length ? (Math.min(last_audible, barEnd(nbar - 1)) - bars[0]) / Math.max(0.001, last_audible - first_audible) : 0;
  const problems = [], warnings = [];
  if (tempo_cv > 0.04 && !rigid) problems.push(`tempo is not steady (beat-interval variation ${(tempo_cv * 100).toFixed(1)}% > 4%): bar-line edits will drift; prefer another track or edit by ear`);
  if (!sections.some((s) => s.tier === "peak" && s.bars >= 8) && !sections.some((s) => s.db >= top - 1.5 && s.bars >= 8)) warnings.push("no strong section lasts 8 bars: the track may feel flat or never lift");
  if (covered < 0.9) warnings.push(`the bar grid covers ${(covered * 100).toFixed(0)}% of the track (beatless passages): edits there are less reliable`);
  if (downbeat_confidence < 0.08 && downbeat_from !== "the final hit") warnings.push("the downbeat is ambiguous (weak kick): bar lines may sit on beat 3; check the first splice by ear");
  const bpm = 60 / beat_s;
  if (bpm > 140 && bpm <= 180 && !folded) warnings.push(`${Math.round(bpm)} BPM may be double time (${Math.round(bpm / 2)} BPM felt): check that a 4-bar phrase (${(16 * beat_s).toFixed(1)} s) sounds like a phrase before trusting phrase-level edits`);
  if (bpm < 60 || bpm > 180) warnings.push(`tempo ${bpm.toFixed(0)} BPM is outside 60-180: treat it as ${bpm < 60 ? "double" : "half"} time for pacing`);

  const lo = quick ? {} : loudness(file);
  const A = {
    file: path.resolve(file),
    duration: r3(duration),
    bpm: rigid ? Math.round((rigid.bpm / (folded ? 2 : 1)) * 100) / 100 : r1(60 / beat_s),
    tempo_folded: folded,
    beat_s: r3(beat_s),
    bar_s: r3(bar_s),
    meter: "4/4 (assumed)",
    tempo_cv: r3(tempo_cv),
    tempo_stable: tempo_cv <= 0.04 || !!rigid,
    grid: rigid ? "rigid (quantised track: exact tempo)" : "tracked (beats follow the playing)",
    downbeat_phase: phase,
    downbeat_confidence: r3(downbeat_confidence),
    downbeat_from,
    first_audible: r3(first_audible),
    last_audible: r3(last_audible),
    grid_coverage: r3(covered),
    loudness: { lufs: lo.lufs ?? null, lra: lo.lra ?? null, true_peak: lo.true_peak ?? null },
    sections,
    strong_sections,
    start_candidates,
    ending,
    beats: beats.map(r3),
    bars: bars.map(r3),
    bar_db: bar_db.map(r1),
    usable: problems.length === 0,
    problems,
    warnings,
  };
  Object.defineProperties(A, {
    _y: { value: y },
    _F: { value: F },
    _bars: { value: bars },
    _barDb: { value: bar_db },
    _barFeat: { value: barFeat },
    _barChroma: { value: barChroma },
    _barAccent: { value: barAccent },
    _top: { value: top },
  });
  return A;
}

function detectEnding({ F, fdb, loud, bars, beats, bar_s, beat_s, last_audible, duration, top, bar_db }) {
  const n = F.n;
  const la = t2f(last_audible);
  // onset peaks in the last 25 s
  const peaks = [];
  for (let i = Math.max(1, la - Math.round(25 * FPS)); i < Math.min(n - 1, la + 1); i++) {
    if (F.onset[i] > F.onset[i - 1] && F.onset[i] >= F.onset[i + 1]) peaks.push(i);
  }
  const allPk = [];
  for (let i = 1; i < n - 1; i++) if (F.onset[i] > F.onset[i - 1] && F.onset[i] >= F.onset[i + 1]) allPk.push(F.onset[i]);
  // the final hit is a strong onset: >= 60th percentile of peaks and >= half a typical beat
  const beatOn = beats.map((b) => { const i = t2f(b); let m = 0; for (let k = Math.max(0, i - 1); k <= Math.min(n - 1, i + 1); k++) m = Math.max(m, F.onset[k]); return m; });
  const strongOn = Math.max(pct(allPk, 60), 0.5 * median(beatOn));
  const lvlAfter = (i, sec) => {
    let m = -120;
    for (let k = i; k < Math.min(n, i + Math.round(sec * FPS)); k++) m = Math.max(m, fdb[k]);
    return m;
  };
  const snapGrid = (t) => {
    let best = t, bd = 0.12;
    for (const b of beats) if (Math.abs(b - t) < bd) { bd = Math.abs(b - t); best = b; }
    return best;
  };
  const endSilent = duration - last_audible > 0.25; // file goes quiet before it ends
  const lastLvl = mean(Array.from(fdb.slice(Math.max(0, la - Math.round(0.5 * FPS)), la + 1)));
  const out = { natural: false, type: "unknown", hit: null, last_audible: r3(last_audible), tail_s: null };

  // ring-out / stop: the last strong onset at high level, followed by no comparable onset
  for (let k = peaks.length - 1; k >= 0; k--) {
    const i = peaks[k];
    const s = F.onset[i];
    if (s < strongOn) continue;
    const lvl = lvlAfter(i, 0.15);
    if (lvl < loud - 12) continue;
    const after = peaks.filter((j) => j > i + Math.round(0.35 * FPS));
    const busy = after.filter((j) => F.onset[j] > 0.5 * s).length;
    const tHit = f2t(i);
    const tail = last_audible - tHit;
    if (busy > 1 || tail > 14) break;
    const decayed = lastLvl < lvl - 8 || endSilent;
    if (tail >= 0.8 && tail <= 12 && decayed) {
      // the band may keep playing past the last accent and stop on the next downbeat: that stop is the ending
      let h = snapGrid(tHit);
      const lv = (t) => { const a = Math.max(0, t2f(t)), b = Math.min(n, t2f(t + 0.1)); let m = 0; for (let k = a; k < b; k++) m += F.rms[k] * F.rms[k]; return 10 * Math.log10(m / Math.max(1, b - a) + 1e-12); };
      let td = null;
      for (let t = h; t < Math.min(last_audible, h + 2 * bar_s); t += 0.05) if (lv(t) >= lvl - 9) td = t + 0.1;
      if (td != null && td - h > 0.3) {
        const bl = bars.find((b) => Math.abs(b - td) <= 0.15 && b > h);
        if (bl != null && last_audible - bl >= 0.5) h = bl;
      }
      Object.assign(out, { natural: true, type: "ring-out", hit: r3(h), tail_s: r1(last_audible - h) });
      return out;
    }
    if (tail < 0.8 && endSilent) {
      Object.assign(out, { natural: true, type: "stop", hit: r3(snapGrid(tHit)), tail_s: r1(last_audible - snapGrid(tHit)) });
      return out;
    }
    break;
  }
  // quick decay: full level, then down 20+ dB within 0.8-5 s with no final hit (the track
  // resolves and dies away by itself): a usable ending, hit = the bar where the decay starts
  {
    const lvl = (t) => { const a = Math.max(0, t2f(t)), b = Math.min(n, t2f(t + 0.5)); let m = 0; for (let k = a; k < b; k++) m += F.rms[k] * F.rms[k]; return 10 * Math.log10(m / Math.max(1, b - a) + 1e-12); };
    let td = null;
    for (let t = last_audible - 0.5; t > last_audible - 8; t -= 0.1) if (lvl(t) >= loud - 9) { td = t + 0.5; break; }
    if (td != null && last_audible - td >= 0.6 && last_audible - td <= 5 && lvl(td - 0.5) - lvl(Math.max(td, last_audible - 0.5)) >= 18) {
      const cand = bars.filter((b) => b <= td + 0.05 && b >= td - bar_s * 1.05);
      const hb = cand.length ? cand[cand.length - 1] : td;
      Object.assign(out, { natural: true, type: "decay", hit: r3(hb), tail_s: r1(last_audible - hb) });
      return out;
    }
  }
  // mastered fade-out: steady energy decline over the last bars with the rhythm still going
  const lastBars = bars.map((b, i) => [b, bar_db[i]]).filter(([b]) => b > last_audible - 16 && b < last_audible - 0.5);
  if (lastBars.length >= 4) {
    const xs = lastBars.map((_, i) => i), ys = lastBars.map(([, d]) => d);
    const mx = mean(xs), my = mean(ys);
    const slope = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / (xs.reduce((s, x) => s + (x - mx) ** 2, 0) || 1);
    if (slope <= -1.2) {
      let fs0 = lastBars[0][0];
      for (let i = 1; i < lastBars.length; i++) if (lastBars[i - 1][1] - lastBars[i][1] < 0.6 && ys[i - 1] > top - 4) fs0 = lastBars[i][0];
      Object.assign(out, { type: "fade", fade_start: r3(fs0), tail_s: r1(last_audible - fs0) });
      return out;
    }
  }
  // ends at full level: a loop clip or a truncated file
  if (lastLvl > loud - 10 && !endSilent) out.type = "cut";
  return out;
}

export function publicAnalysis(A, { full = false } = {}) {
  const o = { ...A };
  if (!full) {
    o.beats_count = A.beats.length;
    delete o.beats;
    o.bars = A.bars;
  }
  return o;
}

// short human line: "112 BPM · strong from 0:18 (drop) · real ending at 1:31 · -14.2 LUFS"
export const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
export function summarize(A) {
  const s = A.strong_sections[0];
  const e = A.ending;
  const end = e.natural ? `real ending (${e.type === "stop" ? "stops" : e.type === "decay" ? "dies away" : "rings out"} at ${mmss(e.hit)})` : e.type === "fade" ? `fades out from ${mmss(e.fade_start)}` : e.type === "cut" ? "no ending (loop clip)" : "no clear ending";
  return [`${Math.round(A.bpm)} BPM`, s ? `strong from ${mmss(s.t0)}${s.label === "drop" ? " (drop)" : ""}` : "no strong section", end, `${Math.round(A.duration)} s`].join(" · ");
}

// ---------------------------------------------------------------- fit (edit plan)

// The picture flexes, the music doesn't: choose a start on a strong phrase bar, an ending
// (the track's own, a button, or a fade), and at most one forward bar-line splice; the film
// length may move by up to `flex` seconds so the music ends on its own ending. Never loops
// unless nothing else fits, and then it says so (needs_longer).
export function fitTrack(A, opts = {}) {
  const D = Number(opts.film);
  if (!(D > 0)) throw new Error("--film <seconds> required");
  const flex = opts.flex != null ? Number(opts.flex) : 1.0;
  // 25 ms equal-power crossfade starting 15 ms before the incoming downbeat: measured on real
  // splices it keeps 85-90% of the attack (30 ms started 10 ms early kept 60-65%)
  const xfade = opts.xfade != null ? Number(opts.xfade) : 0.025;
  const preroll = opts.preroll != null ? Number(opts.preroll) : 0.015;
  const soft = !!opts.softStart;
  const bars = A._bars, bdb = A._barDb, feat = A._barFeat, chroma = A._barChroma;
  const nb = bars.length, bs = A.bar_s, top = A._top;
  const E = A.ending;
  const startThresh = top - (soft ? 12 : 6);
  const endT = E.last_audible;
  const hit = E.hit;
  const secStart = new Set(A.sections.map((s) => s.bar0));
  const secOf = (i) => A.sections.find((s) => i >= s.bar0 && i < s.bar1) || A.sections[A.sections.length - 1];
  const phrase = new Set();
  for (const s of A.sections) for (let b = s.bar0; b < s.bar1; b += 4) phrase.add(b);
  const starts = [...phrase].sort((a, b) => a - b).filter((i) => endT - bars[i] > 4);
  const accents = A._barAccent;
  const accMed = median(accents);

  // a short pickup before the first downbeat plays when the edit starts from the top
  const pickup = bars[0] - A.first_audible > 0.05 && bars[0] - A.first_audible < bs;
  const sT = (i) => (i === 0 && pickup ? Math.max(0, A.first_audible - 0.01) : bars[i]);
  const startPen = (i) => Math.max(0, startThresh - (bdb[i] + (bdb[i + 1] ?? bdb[i])) / 2) / 1.5 + (secStart.has(i) ? 0 : 0.1);
  const durPen = (L) => 0.25 * Math.abs(L - D);
  const splice = (j, k) => {
    // bar k should be a plausible successor of bar j-1: compare with its true predecessor k-1
    const pj = Math.max(0, j - 1), pk = Math.max(0, k - 1);
    const cPrev = cos(chroma[pj], chroma[pk]);
    const fPrev = cos(feat[pj], feat[pk]);
    const cNext = cos(chroma[j] || chroma[pj], chroma[k]);
    const dE = Math.abs(bdb[pj] - bdb[pk]);
    return { cost: 2 * (1 - cPrev) + (1 - fPrev) + dE / 6 + 0.5 * (1 - cNext), chroma_sim: r3(cPrev), energy_step_db: r1(bdb[k] - bdb[pj]) };
  };
  const cands = [];
  const push = (c) => cands.push(c);

  const hitBar = hit != null ? bars.reduce((bi, b, i) => (Math.abs(b - hit) < Math.abs(bars[bi] - hit) ? i : bi), 0) : null;
  if (E.natural) {
    for (const i of starts) {
      const L = endT - sT(i);
      if (Math.abs(L - D) <= flex) push({ shape: "backtimed", segs: [[i, null]], L, base: 0, cost: startPen(i) + durPen(L) });
    }
    // head + natural-ending tail: one forward splice on bar lines
    for (const i of starts) {
      for (let j = i + 2; j < nb && bars[j] - sT(i) <= D + flex; j++) {
        const need = D - (bars[j] - sT(i));
        for (let k = j + 1; k < nb; k++) {
          if (bars[k] > hit + 0.05) break;
          const L = bars[j] - sT(i) + (endT - bars[k]);
          if (Math.abs(L - D) > flex) continue;
          const sp = splice(j, k);
          const align = ((j - i) % 4 ? 0.2 : 0) + (hitBar != null && (hitBar - k) % 4 ? 0.2 : 0);
          push({ shape: "head+tail", segs: [[i, j], [k, null]], L, base: 0.3, cost: 0.3 + sp.cost + align + startPen(i) + durPen(L), sp, need });
        }
      }
    }
  }
  if (E.type === "fade") {
    for (const i of starts) {
      const L = endT - sT(i);
      if (Math.abs(L - D) <= flex) push({ shape: "own-fade", segs: [[i, null]], L, base: 1.1, cost: 1.1 + startPen(i) + durPen(L) });
    }
  }
  // button: hard stop on a strong downbeat, one beat rings, a hit SFX carries the end card
  for (const i of starts) {
    for (let e = i + 4; e < nb; e++) {
      const head = bars[e] - sT(i);
      if (head > D - 1.2) break;
      if (head < D - 2.2) continue;
      if (bars[e] + A.beat_s > endT) break;
      const strong = bdb[e] >= top - 8 && accents[e] >= accMed;
      const hold = D - head;
      push({ shape: "button", segs: [[i, e]], L: D, hold, base: 1.0, cost: 1.0 + (strong ? 0 : 0.6) + ((e - i) % 4 ? 0.25 : 0) + 0.2 * Math.abs(hold - 1.6) + startPen(i) });
    }
  }
  // designed fade ending on a bar line
  for (const i of starts) {
    for (let e = i + 4; e < nb; e++) {
      const L = bars[e] - sT(i);
      if (L > D + flex) break;
      if (L < D - flex) continue;
      push({ shape: "fade", segs: [[i, e]], L, base: 1.3, cost: 1.3 + ((e - i) % 4 ? 0.3 : 0) + startPen(i) + durPen(L) });
    }
  }
  let needs_longer = false;
  if (!cands.length) {
    needs_longer = true;
    // last resort: repeat one whole block of >= 8 bars once (a backward splice), flagged
    const s0 = starts.length ? starts.reduce((b, i) => (startPen(i) < startPen(b) ? i : b), starts[0]) : 0;
    const endIdx = E.natural ? null : nb - 1;
    const endTime = E.natural ? endT : bars[nb - 1];
    for (let x = s0 + 8; x < nb; x++) {
      for (let y = s0; y <= x - 8; y++) {
        const L = bars[x] - sT(s0) + (endTime - bars[y]);
        if (Math.abs(L - D) > flex) continue;
        const sp = splice(x, y);
        const sec = secStart.has(y) ? 0 : 0.3;
        push({ shape: "repeat", segs: [[s0, x], [y, endIdx]], L, base: 1.5, cost: 1.5 + sp.cost + sec + startPen(s0) + durPen(L) + (E.natural ? 0 : 1), sp, repeat: [y, x] });
      }
    }
  }
  const material = endT - (starts.length ? bars[starts[0]] : A.first_audible);
  cands.sort((a, b) => a.cost - b.cost);

  // moments: reveal wants a section start (a drop/lift), the logo wants the ending hit
  const withMoments = cands.slice(0, 400).map((c) => {
    const p = buildPlan(A, c, { D, xfade, preroll, refine: false });
    let mc = 0;
    if (opts.reveal != null) mc += 0.6 * momentCost(p, Number(opts.reveal), "reveal");
    if (opts.logo != null) mc += 0.6 * momentCost(p, Number(opts.logo), "logo");
    return { c, total: c.cost + mc };
  });
  withMoments.sort((a, b) => a.total - b.total);
  if (!withMoments.length) {
    return {
      version: 1, track: A.file, track_duration: A.duration, bpm: A.bpm, bar_s: A.bar_s, beat_s: A.beat_s,
      film_target: D, film_duration: null, needs_longer: true, shape: null, segments: [], joins: [],
      why: `The track has ${material.toFixed(1)} s of usable music; a ${D} s film cannot be scored without looping it twice or more.`,
      suggest: [`pick a track of at least ${Math.ceil(D + 4)} s (music.mjs --film ${D})`, `or cut the film to about ${Math.floor(material)} s so this track plays once`],
    };
  }
  const best = buildPlan(A, withMoments[0].c, { D, xfade, preroll, refine: true });
  best.cost = r3(withMoments[0].total);
  best.needs_longer = needs_longer;
  if (needs_longer) {
    best.why += ` The track is too short for ${D} s without repeating a section: ask for a track of at least ${Math.ceil(D + 4)} s.`;
    best.suggest = [`pick a track of at least ${Math.ceil(D + 4)} s (music.mjs --film ${D})`, `or cut the film to about ${Math.floor(material)} s so this track plays once`];
  }
  // alternatives: distinct shapes first
  const seen = new Set([withMoments[0].c.shape + withMoments[0].c.segs[0][0]]);
  best.alternatives = [];
  for (const w of withMoments.slice(1)) {
    const key = w.c.shape + w.c.segs[0][0];
    if (seen.has(key)) continue;
    seen.add(key);
    const p = buildPlan(A, w.c, { D, xfade, preroll, refine: false });
    best.alternatives.push({ shape: p.shape, film_duration: p.film_duration, cost: r3(w.total), starts_at: p.segments[0].src_in, why: p.why });
    if (best.alternatives.length >= 3) break;
  }
  if (opts.reveal != null) best.moments.reveal = snapMoment(best, Number(opts.reveal), "reveal");
  if (opts.logo != null) best.moments.logo = snapMoment(best, Number(opts.logo), "logo");
  else if (best.ending.film_hit != null) best.moments.logo = { asked: null, t: best.ending.film_hit, on: best.shape === "button" ? "button downbeat" : "ending hit", shift_s: null };
  if (opts.scenes && opts.scenes.length) best.scenes = snapScenes(best, opts.scenes, opts);
  return best;
}

function momentCost(p, t, kind) {
  const bs = p.bar_s;
  const dDown = nearestDist(p.grid.downbeats, t) / bs;
  if (kind === "reveal") {
    const secs = p.grid.section_starts.filter((s) => s.tier !== "low" || s.jump_db >= 2).map((s) => s.t);
    return Math.min(3, Math.min(secs.length ? nearestDist(secs, t) / bs : 9, 0.5 + dDown));
  }
  if (p.ending.film_hit != null) return Math.min(3, Math.min(Math.abs(t - p.ending.film_hit) / bs, 0.5 + dDown));
  return Math.min(3, 0.5 + dDown);
}
const nearestDist = (arr, t) => arr.reduce((m, x) => Math.min(m, Math.abs(x - t)), Infinity);
const nearest = (arr, t) => arr.reduce((b, x) => (Math.abs(x - t) < Math.abs(b - t) ? x : b), arr[0]);

function buildPlan(A, c, { D, xfade, preroll, refine }) {
  const bars = A._bars, y = A._y, E = A.ending, bs = A.bar_s;
  const tr = (t) => (refine ? transientNear(y, t).t : t);
  const segs = [];
  const joins = [];
  let film = 0;
  const srcEnd = (idx) => (idx == null ? E.last_audible : bars[idx]);
  let fade_out = null, fade_in = 0, button = null, repeat = null, tail = null;
  c.segs.forEach(([a, b], k) => {
    let src_in = tr(bars[a]);
    let src_out;
    if (c.shape === "button" && k === c.segs.length - 1) src_out = bars[b] + Math.min(A.beat_s, 0.6);
    else src_out = b == null ? E.last_audible : k < c.segs.length - 1 ? tr(bars[b]) : bars[b];
    if (k === 0 && a === 0 && bars[0] - A.first_audible > 0.05 && bars[0] - A.first_audible < bs) src_in = Math.max(0, A.first_audible - 0.01); // keep a pickup
    const len = src_out - src_in;
    segs.push({ src_in: r3(src_in), src_out: r3(src_out), film_in: r3(film), film_out: r3(film + len) });
    if (k > 0) {
      const prev = segs[k - 1];
      joins.push({ film_t: r3(film), src_from: prev.src_out, src_to: r3(src_in), xfade_s: xfade, preroll_s: preroll, chroma_sim: c.sp ? c.sp.chroma_sim : null, energy_step_db: c.sp ? c.sp.energy_step_db : null });
    }
    film += len;
  });
  if (c.shape === "button") {
    const last = segs[segs.length - 1];
    const land = last.film_out - Math.min(A.beat_s, 0.6);
    fade_out = { film_start: r3(land + 0.02), dur: r3(last.film_out - land - 0.02), curve: "qua" };
    button = { film_t: r3(land), suggest: "impact-bass-1", volume: 0.5, why: "hard stop on a strong downbeat: a low hit and the ring of that beat carry the end card" };
    // the stopped beat rings on as a diffuse tail (two echo stages, darkened) under the hold
    tail = { src_in: r3(last.src_out - (last.film_out - land)), src_out: r3(last.src_out), film_at: r3(land), gain_db: -5 };
    film = D;
  } else if (c.shape === "fade") {
    const len = Math.min(3, Math.max(1.5, 2 * bs));
    fade_out = { film_start: r3(film - len), dur: r3(len), curve: "par" };  // ffmpeg "par": even dB steps (its "exp" is -25 dB in the first sixth)
  }
  if (segs[0].src_in > 0.05) fade_in = 0.01; // de-click only: the music is already playing
  if (c.shape === "repeat") repeat = { src: [r3(bars[c.repeat[0]]), r3(bars[c.repeat[1]])], seconds: r3(bars[c.repeat[1]] - bars[c.repeat[0]]) };

  // film-time grid
  const downbeats = [], section_starts = [];
  for (const s of segs) {
    for (let i = 0; i < bars.length; i++) {
      const b = bars[i];
      if (b >= s.src_in - 0.02 && b < s.src_out - 0.05) downbeats.push(r3(s.film_in + (b - s.src_in)));
    }
    for (const sec of A.sections) {
      if (sec.t0 >= s.src_in - 0.05 && sec.t0 < s.src_out - 0.5) section_starts.push({ t: r3(s.film_in + (sec.t0 - s.src_in)), tier: sec.tier, jump_db: sec.jump_db, label: sec.label, src: sec.t0 });
    }
  }
  // the grid continues through a button's end-card hold
  const lastDb = downbeats[downbeats.length - 1] ?? 0;
  for (let t = lastDb + bs; t < film + 0.01; t += bs) downbeats.push(r3(t));
  let film_hit = null, tail_s = null, kind = "fade";
  if (c.shape === "backtimed" || c.shape === "head+tail" || (c.shape === "repeat" && E.natural)) {
    const s = segs[segs.length - 1];
    film_hit = r3(s.film_in + (E.hit - s.src_in));
    tail_s = r3(film - film_hit);
    kind = "natural";
  } else if (c.shape === "button") {
    film_hit = button.film_t;
    tail_s = r3(film - film_hit);
    kind = "button";
  } else if (c.shape === "own-fade") kind = "track fade";
  const whyStart = (() => {
    const s0 = segs[0].src_in;
    const sec = A.sections.find((x) => Math.abs(x.t0 - s0) < 0.1);
    return s0 < 0.1 ? "from the top" : `from ${mmss(s0)}${sec ? ` (a ${sec.label} section start)` : " (a phrase bar)"}`;
  })();
  const why = {
    backtimed: `Plays ${whyStart} straight to the track's own ending: no edits.`,
    "head+tail": `Plays ${whyStart}, then jumps forward on a bar line at ${mmss(joins[0]?.film_t ?? 0)} to the track's own ending (${Math.round((xfade || 0.025) * 1000)} ms crossfade).`,
    "own-fade": `Plays ${whyStart} into the track's own fade-out.`,
    button: `Plays ${whyStart} and stops dead on a strong downbeat at ${mmss(button?.film_t ?? 0)}; a hit carries the last ${r1(D - (button?.film_t ?? D))} s.`,
    fade: `Plays ${whyStart} and fades over the last ${fade_out ? r1(fade_out.dur) : 2} s, ending on a bar line (last resort: the track has no usable ending here).`,
    repeat: `Repeats one ${repeat ? Math.round(repeat.seconds / bs) : 8}-bar block once (${repeat ? mmss(repeat.src[0]) : ""}-${repeat ? mmss(repeat.src[1]) : ""}): a listener may notice. Needs a longer track.`,
  }[c.shape];
  return {
    version: 1,
    track: A.file,
    track_duration: A.duration,
    bpm: A.bpm,
    bar_s: A.bar_s,
    beat_s: A.beat_s,
    film_target: D,
    film_duration: r3(film),
    flex_s: r3(film - D),
    shape: c.shape,
    why,
    needs_longer: false,
    segments: segs,
    joins,
    fade_in_s: fade_in,
    fade_out,
    end_fade_s: 0.03,
    ending: { kind, film_hit, tail_s },
    button_sfx: button,
    button_tail: tail,
    repeat,
    grid: { downbeats, section_starts },
    moments: {},
    scenes: null,
  };
}

// key moments move to the music: reveal -> section start (<= 1 bar) else downbeat; logo -> hit
function snapMoment(p, t, kind) {
  const bs = p.bar_s;
  if (kind === "logo" && p.ending.film_hit != null && Math.abs(p.ending.film_hit - t) <= 1.5 * bs) {
    return { asked: r3(t), t: p.ending.film_hit, on: p.shape === "button" ? "button downbeat" : "ending hit", shift_s: r3(p.ending.film_hit - t) };
  }
  if (kind === "reveal") {
    const secs = p.grid.section_starts.filter((s) => s.tier !== "low" || s.jump_db >= 2);
    const s = secs.length ? secs.reduce((b, x) => (Math.abs(x.t - t) < Math.abs(b.t - t) ? x : b)) : null;
    if (s && Math.abs(s.t - t) <= bs + 0.01) return { asked: r3(t), t: s.t, on: `section start (${s.label})`, shift_s: r3(s.t - t) };
  }
  const d = nearest(p.grid.downbeats, t);
  const out = { asked: r3(t), t: d, on: "downbeat", shift_s: r3(d - t) };
  if (Math.abs(d - t) > p.bar_s) out.note = "moved more than a bar: re-fit with this moment weighted, or move the scene";
  return out;
}

// scene boundaries onto the bar grid: key moments first, then each cut to the nearest downbeat
// when it moves <= 0.3 bar, else to beat 3 (half bar). Not every cut must land on a downbeat.
function snapScenes(p, scenes, opts) {
  const bs = p.bar_s;
  const Dfilm = p.film_duration;
  const asked = [];
  let t = 0;
  for (const s of scenes) {
    const st = s.start_s != null ? Number(s.start_s) : t;
    const du = Number(s.duration ?? s.duration_s) || 0;
    asked.push({ n: s.n ?? asked.length + 1, title: s.title || `Scene ${asked.length + 1}`, type: s.type || "", start: st, duration: du });
    t = st + du;
  }
  const half = [];
  for (const d of p.grid.downbeats) half.push(d, r3(d + bs / 2));
  const minDur = (a) => Math.max(1.0, 0.6 * a.duration);
  const revealIdx = asked.findIndex((a) => /product_intro|reveal/i.test(a.type) || /reveal/i.test(a.title));
  const logoIdx = asked.length - 1;
  const out = asked.map((a) => ({ ...a, new_start: a.start, snapped_to: "kept" }));
  out[0].new_start = 0;
  out[0].snapped_to = "film start";
  for (let i = 1; i < out.length; i++) {
    const a = out[i];
    let target = null, on = null;
    if (i === revealIdx && p.moments.reveal) { target = p.moments.reveal.t; on = p.moments.reveal.on; }
    else if (i === revealIdx) {
      const m = snapMoment(p, a.start, "reveal");
      target = m.t; on = m.on;
    } else if (i === logoIdx && logoIdx > 0 && p.ending.film_hit != null && /branding|cta|logo|end/i.test(`${a.type} ${a.title}`)) {
      // the logo scene opens a bar before the hit so the logo lands on it
      const land = p.moments.logo ? p.moments.logo.t : p.ending.film_hit;
      const st = nearest(p.grid.downbeats, land - bs);
      target = st; on = `downbeat 1 bar before the ${p.shape === "button" ? "button" : "ending hit"} (logo lands at ${land}s)`;
    }
    if (target == null) {
      const d = nearest(p.grid.downbeats, a.start);
      if (Math.abs(d - a.start) <= 0.3 * bs) { target = d; on = "downbeat"; }
      else { target = nearest(half, a.start); on = "beat 3"; }
    }
    const prev = out[i - 1];
    if (target - prev.new_start < minDur(prev) || Dfilm - target < 0.8) continue; // too tight: keep as asked
    a.new_start = r3(target);
    a.snapped_to = on;
  }
  // keep order; last scene absorbs the film length
  for (let i = 1; i < out.length; i++) if (out[i].new_start <= out[i - 1].new_start + 0.5) { out[i].new_start = out[i].start; out[i].snapped_to = "kept"; }
  return out.map((a, i) => {
    const end = i + 1 < out.length ? out[i + 1].new_start : Dfilm;
    return { n: a.n, title: a.title, start: r3(a.new_start), duration: r3(end - a.new_start), asked_start: r3(a.start), asked_duration: r3(a.duration), shift_s: r3(a.new_start - a.start), snapped_to: a.snapped_to };
  });
}

// ---------------------------------------------------------------- render

export function planFilter(plan) {
  const parts = [];
  const labels = [];
  const segs = plan.segments;
  segs.forEach((s, i) => {
    const j = plan.joins[i]; // join after this segment
    const jPrev = plan.joins[i - 1];
    const xf = j ? j.xfade_s : 0;
    const pre = jPrev ? jPrev.preroll_s : 0;
    const a = Math.max(0, s.src_in - pre);
    const b = s.src_out + (j ? Math.max(0, j.xfade_s - j.preroll_s) : 0);
    parts.push(`[0:a]atrim=start=${a.toFixed(4)}:end=${b.toFixed(4)},asetpts=PTS-STARTPTS[s${i}]`);
    labels.push(`s${i}`);
    void xf;
  });
  let cur = labels[0];
  for (let i = 1; i < labels.length; i++) {
    const d = plan.joins[i - 1].xfade_s;
    parts.push(`[${cur}][${labels[i]}]acrossfade=d=${d}:c1=qsin:c2=qsin[x${i}]`);
    cur = `x${i}`;
  }
  const D = plan.film_duration;
  if (plan.button_tail) {
    const t = plan.button_tail;
    const len = Math.max(0.05, t.src_out - t.src_in);
    parts.push(`[0:a]atrim=start=${t.src_in.toFixed(4)}:end=${t.src_out.toFixed(4)},asetpts=PTS-STARTPTS,afade=t=out:st=0:d=${len.toFixed(3)}:curve=qua,apad=pad_dur=4,aecho=0.8:0.9:67|131|199|283|379|491|619|773|947|1151|1381|1657|1979:0.6|0.48|0.384|0.307|0.246|0.197|0.157|0.126|0.101|0.081|0.064|0.052|0.041,aecho=0.8:0.8:23|37|53|71:0.5|0.4|0.3|0.22,lowpass=f=5000,volume=${t.gain_db}dB,adelay=${Math.round(t.film_at * 1000)}:all=1[tail]`);
    const fo = plan.fade_out;
    parts.push(`[${cur}]${fo ? `afade=t=out:st=${fo.film_start.toFixed(4)}:d=${fo.dur.toFixed(4)}:curve=qua,` : ""}apad=pad_dur=0.01[mn]`);
    parts.push(`[mn][tail]amix=inputs=2:normalize=0:duration=longest[mx]`);
    cur = "mx";
  }
  const post = [`apad=whole_dur=${D.toFixed(4)}`, `atrim=end=${D.toFixed(4)}`];
  if (plan.fade_in_s) post.push(`afade=t=in:st=0:d=${plan.fade_in_s}`);
  if (plan.fade_out && !plan.button_tail) post.push(`afade=t=out:st=${plan.fade_out.film_start.toFixed(4)}:d=${plan.fade_out.dur.toFixed(4)}:curve=par`);
  if (plan.end_fade_s) post.push(`afade=t=out:st=${(D - plan.end_fade_s).toFixed(4)}:d=${plan.end_fade_s}`);
  parts.push(`[${cur}]${post.join(",")}[out]`);
  return parts.join(";");
}

// premix -> measure -> static gain + 4x-oversampled limiter at -1.5 dBTP (research recipe A)
export function renderPlan(plan, out, { lufs = -14, tp = -1.5 } = {}) {
  requireTools();
  if (!plan.segments || !plan.segments.length) throw new Error("the plan has no segments (needs_longer with no fallback): pick a longer track");
  if (!fs.existsSync(plan.track)) throw new Error(`track not found: ${plan.track}`);
  const tmp = path.join(os.tmpdir(), `rasa-bed-${process.pid}-${Date.now()}.wav`);
  const graph = planFilter(plan);
  execFileSync("ffmpeg", ["-y", "-v", "error", "-i", plan.track, "-filter_complex", graph, "-map", "[out]", "-ar", "48000", "-c:a", "pcm_f32le", tmp]);
  const m = masterFile(tmp, out, { lufs, tp });
  fs.rmSync(tmp, { force: true });
  const post = m;
  const gain = m.gain_db;
  return { out: path.resolve(out), duration: r3(probeDuration(out)), lufs: post.lufs, true_peak: post.true_peak, lra: post.lra, gain_db: r1(gain), filter: graph };
}

// Master a file (audio, or a video whose picture is copied untouched): measure, static gain,
// 4x-oversampled true-peak limiter, one corrective pass when the limiter ate loudness.
export function masterFile(input, out, { lufs = -14, tp = -1.5 } = {}) {
  requireTools();
  const pre = loudness(input);
  if (pre.lufs == null) throw new Error(`could not measure the loudness of ${input} (silent?)`);
  let gain = lufs - pre.lufs;
  const lim = dbToLin(tp).toFixed(4);
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  const isVideo = /\.(mp4|mov|m4v|webm|mkv)$/i.test(out);
  const codec = isVideo ? ["-c:v", "copy", "-c:a", "aac", "-b:a", "256k"] : /\.wav$/i.test(out) ? ["-c:a", "pcm_s24le"] : /\.mp3$/i.test(out) ? ["-c:a", "libmp3lame", "-b:a", "320k"] : /\.(m4a|aac)$/i.test(out) ? ["-c:a", "aac", "-b:a", "256k"] : [];
  // AAC can overshoot the limiter: encoded files get 0.5 dB more headroom
  const ceiling = isVideo || /\.(m4a|aac|mp3)$/i.test(out) ? dbToLin(tp - 0.5).toFixed(4) : lim;
  const run = () => execFileSync("ffmpeg", ["-y", "-v", "error", "-i", input, ...(isVideo ? ["-map", "0:v:0?", "-map", "0:a:0"] : []), "-af", `volume=${gain.toFixed(2)}dB,aresample=192000,alimiter=limit=${ceiling}:attack=1:release=50:level=disabled,aresample=48000`, "-ar", "48000", ...codec, out]);
  run();
  let post = loudness(out);
  if (post.lufs != null && lufs - post.lufs > 0.4) {
    gain += Math.min(3, lufs - post.lufs);
    run();
    post = loudness(out);
  }
  return { out: path.resolve(out), lufs: post.lufs, true_peak: post.true_peak, lra: post.lra, gain_db: r1(gain), input_lufs: pre.lufs, input_true_peak: pre.true_peak };
}

// ---------------------------------------------------------------- SFX probe

// sync point (hit: the transient; swell: the crest), lead silence, audible end, harshness
export function probeSfx(file) {
  requireTools();
  const sr = 44100;
  const y = decode(file, { sr });
  const dur = y.length / sr;
  const hop = Math.round(0.005 * sr), fl = Math.round(0.05 * sr);
  const db = [], tt = [];
  for (let s = 0; s + 1 <= y.length; s += hop) {
    let z = 0, c = 0;
    for (let k = s; k < Math.min(y.length, s + fl); k++) { z += y[k] * y[k]; c++; }
    db.push(10 * Math.log10(z / Math.max(1, c) + 1e-12));
    tt.push(s / sr);
  }
  const peak = Math.max(...db);
  let a = 0, b = db.length - 1;
  while (a < db.length - 1 && db[a] < peak - 40) a++;
  while (b > 0 && db[b] < peak - 40) b--;
  const lead = tt[a];
  const end = Math.min(dur, tt[b] + fl / sr);
  const loudest = tt[db.indexOf(peak)] + fl / (2 * sr);
  // onset: steepest 10 ms rise
  const fine = [];
  const fh = Math.round(0.002 * sr), ff = Math.round(0.004 * sr);
  for (let s = 0; s + ff <= y.length; s += fh) {
    let z = 0;
    for (let k = s; k < s + ff; k++) z += y[k] * y[k];
    fine.push(10 * Math.log10(z / ff + 1e-12));
  }
  let on = 0, bestD = -Infinity;
  for (let i = 5; i < fine.length; i++) {
    const d = fine[i] - fine[i - 5];
    if (d > bestD && fine[i] > peak - 20) { bestD = d; on = ((i - 5) * fh + ff) / sr; }
  }
  const kind = loudest - lead > 0.25 ? "swell" : "hit";
  const sync = kind === "swell" ? loudest : on;
  // spectrum share above 5 kHz and in 2-5 kHz
  const N = 2048;
  const re = new Float64Array(N), im = new Float64Array(N);
  let hi = 0, pres = 0, tot = 0;
  const w = Float64Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
  const aS = Math.floor(lead * sr), bS = Math.ceil(end * sr);
  for (let s = aS; s + N <= Math.max(aS + N, bS) && s + N <= y.length; s += N / 2) {
    for (let k = 0; k < N; k++) { re[k] = y[s + k] * w[k]; im[k] = 0; }
    fft(re, im);
    for (let k = 1; k <= N / 2; k++) {
      const f = (k * sr) / N, p = re[k] * re[k] + im[k] * im[k];
      tot += p;
      if (f > 5000) hi += p;
      else if (f > 2000) pres += p;
    }
  }
  let tpk = 0;
  for (let i = 0; i < y.length; i++) tpk = Math.max(tpk, Math.abs(y[i]));
  const pctHi = tot ? Math.round((100 * hi) / tot) : 0, pctPres = tot ? Math.round((100 * pres) / tot) : 0;
  const warnings = [];
  if (pctHi > 35) warnings.push("harsh: >35% of energy above 5 kHz (lowpass 7-9 kHz or high-shelf -4 dB at 6 kHz, or pick another)");
  if (pctPres > 60 && end - lead > 0.5) warnings.push("piercing: >60% of energy at 2-5 kHz on a >0.5 s sound (peaking -3 dB at 3.2 kHz, or play 3 dB quieter)");
  if (lead > 0.1) warnings.push(`lead silence ${lead.toFixed(2)} s: place by sync_point, not the file start`);
  if (dur - end > 1) warnings.push(`${(dur - end).toFixed(1)} s of trailing silence: the file length is not the crest; trim to audible_end`);
  return { file: path.resolve(file), duration: r3(dur), kind, sync_point: r3(sync), lead_silence: r3(lead), audible_end: r3(end), pct_2_5k: pctPres, pct_above_5k: pctHi, peak_dbfs: r1(20 * Math.log10(tpk + 1e-12)), warnings };
}

// ---------------------------------------------------------------- repeat / loop detection

// Finds verbatim repeats: runs where 0.25 s blocks at lag L are near-identical (cos > thr).
// A restart of the opening (a looped file) or a long verbatim repeat is an audible loop.
export function findRepeats(y, { sr = SR, minRun = 6, thr = 0.99 } = {}) {
  const F = frameFeatures(y, { sr });
  const per = Math.max(1, Math.round((0.25 * sr) / HOP)); // 0.25 s blocks, starting at every frame
  const D = 12 + NB / 2;
  const nfb = F.n - per;
  if (nfb < per * 8) return [];
  // per-frame vectors, then running block sums so a block can start at any frame (lag precision = 1 frame)
  const fv = new Float64Array(F.n * D);
  const fe = new Float64Array(F.n);
  for (let i = 0; i < F.n; i++) {
    for (let c = 0; c < 12; c++) fv[i * D + c] = F.chroma[i * 12 + c];
    for (let k = 0; k < NB / 2; k++) fv[i * D + 12 + k] = F.bandDb[i * NB + 2 * k] + F.bandDb[i * NB + 2 * k + 1];
    fe[i] = F.rms[i] * F.rms[i];
  }
  const blk = (i) => {
    const v = new Float64Array(D);
    let ms = 0;
    for (let f = i; f < i + per; f++) { for (let d = 0; d < D; d++) v[d] += fv[f * D + d]; ms += fe[f]; }
    const cm = Math.max(...v.slice(0, 12)) || 1;
    for (let c = 0; c < 12; c++) v[c] /= cm;
    let em = 0;
    for (let k = 12; k < D; k++) em += v[k];
    em /= D - 12;
    for (let k = 12; k < D; k++) v[k] = (v[k] - em) / (20 * per);
    return { v, lvl: 10 * Math.log10(ms / per + 1e-12) };
  };
  const B = [];
  for (let i = 0; i < nfb; i++) B.push(blk(i));
  const loud = pct(B.map((b) => b.lvl), 95);
  const fps = sr / HOP;
  const minL = Math.round(4 * fps);
  const need = Math.round((minRun * fps) / per); // consecutive matching blocks
  const runs = [];
  for (let L = minL; L < nfb - need * per; L++) {
    let run = 0, start = 0;
    for (let i = 0; i + L < nfb; i += per) {
      const a = B[i], b = B[i + L];
      const same = a.lvl > loud - 30 && b.lvl > loud - 30 && Math.abs(a.lvl - b.lvl) < 1.5 && cos(a.v, b.v) > thr;
      if (same) { if (!run) start = i; run++; }
      if (!same || i + L + per >= nfb) {
        if (run >= need) runs.push({ from: start / fps, to: (start + run * per) / fps, at: (start + L) / fps, lag: L / fps, seconds: (run * per) / fps });
        run = 0;
      }
    }
  }
  runs.sort((a, b) => b.seconds - a.seconds);
  const kept = [];
  for (const r of runs) if (!kept.some((k) => Math.abs(k.lag - r.lag) < 1 || (r.from < k.to && k.from < r.to && Math.abs(r.at - k.at) < 2))) kept.push(r);
  return kept.map((r) => ({ from: r1(r.from), to: r1(r.to), repeats_at: r1(r.at), lag_s: r1(r.lag), seconds: r1(r.seconds) }));
}

// the SFX budget, one table read by sound.mjs (sfx-plan and check) and slop.mjs (sfx-overload): sounds per second, per
// one-second window, the share of visual events that may get a sound, hero and whoosh spacing
export const SFX_BUDGET = {
  narrated: { perSec: 1 / 2, perWindow: 3, share: 1 / 3, heroEvery: 15, heroMax: 3, whooshEvery: 20 },
  unnarrated: { perSec: 1 / 1.2, perWindow: 3, share: 1 / 2, heroEvery: 10, heroMax: 6, whooshEvery: 10 },
  reel: { perSec: 1, perWindow: 4, share: 1 / 2, heroEvery: 8, heroMax: 6, whooshEvery: 8 },
};
export const sfxMode = ({ format, narrated } = {}) => (format === "reel" ? "reel" : narrated ? "narrated" : "unnarrated");
// the most SFX a film of `dur` seconds should carry; sfx-plan places up to it, the checks allow one more (rounding)
export const sfxLimit = (mode, dur) => Math.max(1, Math.floor(dur * SFX_BUDGET[mode].perSec));
export const sfxOver = (count, mode, dur) => count > sfxLimit(mode, dur) + 1;

// onset strength envelope at film time (for "the music already hits here")
export function onsetProfile(file) {
  const y = decode(file);
  const F = frameFeatures(y);
  const pk = [];
  for (let i = 1; i < F.n - 1; i++) if (F.onset[i] > F.onset[i - 1] && F.onset[i] >= F.onset[i + 1]) pk.push(F.onset[i] + F.low[i]);
  const p75 = pct(pk, 75);
  return {
    strongAt(t, win = 0.06) {
      let m = 0;
      for (let i = Math.max(0, t2f(t - win)); i <= Math.min(F.n - 1, t2f(t + win)); i++) m = Math.max(m, F.onset[i] + F.low[i]);
      return { strength: m, strong: m > p75 };
    },
  };
}

// ---------------------------------------------------------------- film shape: designed breaks and split edits
// (onetake / lemo-opuscar: "at least two real silences; at least two J-cuts or L-cuts"; sound.mjs check, references/sound.md)

// momentary level in dB over W-second windows (the payoff check's 100 ms windows)
export function momentaryDb(y, W = 0.1, sr = SR) {
  const n = Math.floor(y.length / sr / W), out = [];
  for (let i = 0; i < n; i++) {
    let z = 0; const a = Math.floor(i * W * sr), b = Math.floor((i + 1) * W * sr);
    for (let k = a; k < b; k++) z += y[k] * y[k];
    out.push(10 * Math.log10(z / Math.max(1, b - a) + 1e-12));
  }
  return out;
}

// designed breaks: stretches of at least minS seconds at least dropDb under the median momentary level, not in the first
// headS seconds, not in the last tailS seconds and not after the last sound. A stretch is counted in whole windows, so
// minS is rounded down to the windows that must be wholly inside it (0.25 s -> 2 windows of 100 ms).
export function designedBreaks(mom, W, { dropDb = 10, minS = 0.25, headS = 0.5, tailS = 1.0 } = {}) {
  const live = mom.filter((v) => v > -80).sort((a, b) => a - b);
  const median = live.length ? live[Math.floor(live.length / 2)] : -120;
  const need = Math.max(1, Math.floor(minS / W + 1e-9)), dur = mom.length * W;
  let lastLive = -1; mom.forEach((v, i) => { if (v > median - dropDb) lastLive = i; });
  const breaks = [];
  let i = 0;
  while (i < mom.length) {
    if (mom[i] >= median - dropDb) { i++; continue; }
    let j = i; while (j < mom.length && mom[j] < median - dropDb) j++;
    const from = i * W, to = j * W;
    if (j - i >= need && from >= headS - 1e-9 && to <= dur - tailS + 1e-9 && j <= lastLive) breaks.push({ from: Math.round(from * 100) / 100, to: Math.round(to * 100) / 100, depth_db: Math.round((median - Math.min(...mom.slice(i, j))) * 10) / 10 });
    i = j;
  }
  return { median: Math.round(median * 10) / 10, breaks };
}

// speech phrases [start, end] from a VO stem: windows well above the stem's own noise count as speech; a pause of gapS or more
// starts a new phrase. Relative to the loud end of the stem so a quiet or a hot stem both work.
export function speechPhrases(y, { sr = SR, step = 0.05, gapS = 0.25, minS = 0.15 } = {}) {
  const lv = momentaryDb(y, step, sr);
  const s = [...lv].sort((a, b) => a - b), ref = s.length ? s[Math.floor(s.length * 0.9)] : -120, thr = Math.max(-55, ref - 25);
  const spans = [];
  let s0 = null, last = -9;
  for (let i = 0; i < lv.length; i++) {
    if (lv[i] <= thr) continue;
    const t = i * step;
    if (s0 == null) s0 = t; else if (t - last > gapS) { spans.push([s0, last + step]); s0 = t; }
    last = t;
  }
  if (s0 != null) spans.push([s0, last + step]);
  return spans.filter((p) => p[1] - p[0] >= minS);
}

// phrases from word timings [{start, end}] in film seconds, merged across pauses shorter than gapS
export function phrasesFromWords(words, gapS = 0.25) {
  const ws = words.filter((w) => Number.isFinite(w.start)).map((w) => [w.start, Number.isFinite(w.end) ? w.end : w.start + 0.2]).sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const w of ws) { const l = out[out.length - 1]; if (l && w[0] - l[1] <= gapS) l[1] = Math.max(l[1], w[1]); else out.push([...w]); }
  return out;
}

// J-cuts (a phrase starts minS..maxS before a cut and runs past it) and L-cuts (a phrase that began before a cut ends
// minS..maxS after it), by cut. `fits` are the cuts with a phrase boundary within maxS that no split edit uses yet.
export function splitEdits(cuts, phrases, { minS = 0.15, maxS = 1.5 } = {}) {
  const j = [], l = [], fits = [];
  for (const c of cuts) {
    const hasJ = phrases.some(([s, e]) => c - s >= minS && c - s <= maxS && e > c + 0.05);
    const hasL = phrases.some(([s, e]) => s < c - 0.05 && e - c >= minS && e - c <= maxS);
    if (hasJ) j.push(c);
    if (hasL) l.push(c);
    if (!hasJ && !hasL && phrases.some(([s, e]) => (s > c && s - c <= maxS) || (e < c && c - e <= maxS))) fits.push(c);
  }
  return { j, l, count: new Set([...j, ...l]).size, fits };
}

// ---------------------------------------------------------------- wave 7 helpers (all uncalibrated: callers only warn)
// Ideas from onetake / mortiflix / lemo-opuscar / group2 notes (.context/reaudit); the code is ours.

// decode through an ffmpeg -af chain (mono f32, SR)
export function decodeFiltered(file, af, { sr = SR } = {}) {
  const buf = execFileSync("ffmpeg", ["-v", "error", "-nostdin", "-i", file, "-vn", "-af", af, "-f", "f32le", "-ac", "1", "-ar", String(sr), "-"], { maxBuffer: 1 << 30 });
  const n = Math.floor(buf.length / 4);
  return new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + n * 4));
}

// mean-square level in dB of y over [a, b] seconds
export function windowDb(y, a, b, sr = SR) {
  let z = 0, c = 0;
  for (let i = Math.max(0, Math.floor(a * sr)); i < Math.min(y.length, Math.floor(b * sr)); i++) { z += y[i] * y[i]; c++; }
  return c ? 10 * Math.log10(z / c + 1e-12) : -120;
}

// onset times (s) of the audible hits in y: spectral-flux peaks (full band + low band) above the 75th percentile of all peaks
export function onsetTimes(y) {
  const F = frameFeatures(y);
  const pk = [];
  for (let i = 1; i < F.n - 1; i++) if (F.onset[i] > F.onset[i - 1] && F.onset[i] >= F.onset[i + 1]) pk.push({ i, v: F.onset[i] + F.low[i] });
  const p75 = pct(pk.map((p) => p.v), 75);
  return pk.filter((p) => p.v > p75).map((p) => r3(f2t(p.i)));
}

// share of the cuts that land within tolS of an onset, and the near misses (tolS..nearS away) with the move that would fix them
export function cutOnsetShare(cuts, onsets, { tolS = 0.08, nearS = 0.3 } = {}) {
  let hit = 0;
  const near = [];
  for (const c of cuts) {
    const o = onsets.reduce((b, x) => (Math.abs(x - c) < Math.abs(b - c) ? x : b), onsets[0]);
    if (o == null) continue;
    const d = o - c;
    if (Math.abs(d) <= tolS) hit++;
    else if (Math.abs(d) <= nearS) near.push({ cut: r3(c), onset: r3(o), off_ms: Math.round(d * 1000), move_cut_ms: Math.round(d * 1000) });
  }
  return { cuts: cuts.length, on_onset: hit, share: cuts.length ? r3(hit / cuts.length) : null, near_misses: near };
}

// low-frequency share per 0.5 s window of a file: the energy under `cut` Hz over the whole band, windows louder than -50 dB only
export function lowShare(file, { cut = 300, W = 0.5 } = {}) {
  const all = decode(file);
  const low = decodeFiltered(file, `lowpass=f=${cut},lowpass=f=${cut}`);
  const rows = [];
  for (let t = 0; t + W <= all.length / SR + 1e-9; t += W) {
    const ea = Math.pow(10, windowDb(all, t, t + W) / 10), el = Math.pow(10, windowDb(low, t, t + W) / 10);
    const db = 10 * Math.log10(ea + 1e-12);
    if (db > -50) rows.push({ t: r3(t), db: r1(db), share: r3(Math.min(1, el / (ea + 1e-12))) });
  }
  return rows;
}

// bit-identity of a mix: sha256 of the decoded 48 kHz stereo s16 PCM (the container and the picture do not matter) plus a 100 ms
// level envelope so a change can be located and sized when the hash differs
export function audioFingerprint(file) {
  const r = spawnSync("ffmpeg", ["-v", "error", "-nostdin", "-i", file, "-vn", "-map", "0:a:0", "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", "-f", "hash", "-hash", "sha256", "-"], { encoding: "utf8" });
  const m = String(r.stdout || "").match(/SHA256=([0-9a-f]{64})/i);
  const env = momentaryDb(decode(file), 0.1).map((v) => Math.round(v * 10) / 10);
  return { pcm_sha256: m ? m[1].toLowerCase() : null, duration: r3(probeDuration(file)), env_100ms_db: env };
}
// locked vs now: identical hash, else the windows whose level moved by more than 0.5 dB (either side above -50 dB)
export function compareFingerprint(lock, now) {
  if (lock.pcm_sha256 && lock.pcm_sha256 === now.pcm_sha256) return { identical: true };
  const a = lock.env_100ms_db || [], b = now.env_100ms_db || [];
  const moved = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? -120, y = b[i] ?? -120;
    if ((x > -50 || y > -50) && Math.abs(x - y) > 0.5) moved.push(i);
  }
  const spans = [];
  for (const i of moved) { const l = spans[spans.length - 1]; if (l && i - l[1] <= 2) l[1] = i; else spans.push([i, i]); }
  return { identical: false, duration_was: lock.duration, duration_now: now.duration, moved_windows: moved.length, spans_s: spans.slice(0, 8).map(([s, e]) => [r1(s * 0.1), r1((e + 1) * 0.1)]), only_encoding: !moved.length && Math.abs((lock.duration || 0) - (now.duration || 0)) < 0.05 };
}

// the speech cleanup chain for user footage (group2 11): rumble out, denoise, gate the room between words, mud cut, presence lift,
// 3:1 compression, loudness. Order matters: denoise before the gate so the gate does not chop the noise floor's pumping.
export function speechChain({ lufs = -16, denoise = true } = {}) {
  return [
    "highpass=f=80",
    denoise ? "afftdn=nr=12:nf=-45:tn=1" : null,
    "agate=threshold=0.015:ratio=2:attack=8:release=220:range=0.25",
    "equalizer=f=250:t=q:w=1.2:g=-2.5",
    "equalizer=f=3200:t=q:w=1:g=2",
    "acompressor=threshold=-21dB:ratio=3:attack=12:release=180:makeup=3",
    `loudnorm=I=${lufs}:TP=-1.5:LRA=9`,
  ].filter(Boolean).join(",");
}

// BPM chosen from the picture's hit times (mortiflix idea): scan lo..hi, for each tempo the best grid phase, and keep the tempo whose
// worst hit sits closest to a beat, as a fraction of the beat (so a fast tempo cannot win just by having more beats). Within `tie` of the best,
// prefer a tempo inside `prefer` [a, b] (the style's range), nearest its middle.
export function bpmFromHits(hits, { lo = 70, hi = 140, step = 0.5, prefer = null, tie = 0.02 } = {}) {
  const hs = [...new Set(hits.filter((h) => Number.isFinite(h)).map((h) => Math.round(h * 1000) / 1000))].sort((a, b) => a - b);
  if (hs.length < 3) return null;
  const rows = [];
  for (let bpm = lo; bpm <= hi + 1e-9; bpm += step) {
    const beat = 60 / bpm;
    let best = null;
    for (const h0 of hs) {
      const errs = hs.map((h) => { const r = (((h - h0) % beat) + beat) % beat; return Math.min(r, beat - r); });
      const worst = Math.max(...errs);
      if (!best || worst < best.worst) best = { worst, errs, phase: ((h0 % beat) + beat) % beat };
    }
    rows.push({ bpm, beat, worst: best.worst, frac: best.worst / beat, errs: best.errs, phase: best.phase });
  }
  const minFrac = Math.min(...rows.map((r) => r.frac));
  const ok = rows.filter((r) => r.frac <= minFrac + tie);
  const mid = prefer ? (prefer[0] + prefer[1]) / 2 : null;
  const inP = prefer ? ok.filter((r) => r.bpm >= prefer[0] && r.bpm <= prefer[1]) : [];
  const pool = inP.length ? inP : ok;
  const pick = pool.sort((a, b) => (mid != null ? Math.abs(a.bpm - mid) - Math.abs(b.bpm - mid) : 0) || a.frac - b.frac)[0];
  const runner = rows.filter((r) => Math.abs(r.bpm - pick.bpm) >= 3).sort((a, b) => a.frac - b.frac).slice(0, 2).map((r) => ({ bpm: r.bpm, max_err_ms: Math.round(r.worst * 1000) }));
  return { bpm: pick.bpm, beat_s: r3(pick.beat), phase_s: r3(pick.phase), max_err_ms: Math.round(pick.worst * 1000), mean_err_ms: Math.round((pick.errs.reduce((a, b) => a + b, 0) / pick.errs.length) * 1000), hits: hs.length, per_hit_ms: pick.errs.map((e) => Math.round(e * 1000)), runners_up: runner };
}

// hit treatments (spotting table in references/sound.md): what the music and the sound do around a picture hit
export const HIT_TREATMENTS = {
  direct: "a music accent and the SFX land on the frame itself (measured offset under 40 ms)",
  anticipation: "the bed pulls back (a rest, a filter dip or a riser) half a beat to one beat before, then the hit lands at full level",
  aftermath: "the hit speaks alone on the frame; the music answers on the next beat (a swell, a tail, a low hit)",
  "no-hit": "the picture moves and nothing sounds: a fade, a dissolve, a parallax, text easing in",
};
const TREAT_BY_KIND = [[/^(fade|dissolve|parallax|ambient|ease|wipe-soft)/i, "no-hit"], [/^(crash|slam|shock|glitch|smash|break)/i, "aftermath"], [/^(reveal|payoff|drop|turn|brand)/i, "anticipation"]];
export function treatHits(hits, grid) {
  return hits.map((h) => {
    const t = Number(h.t), kind = String(h.kind || "hit");
    const treatment = HIT_TREATMENTS[h.treatment] ? h.treatment : (TREAT_BY_KIND.find(([re]) => re.test(kind)) || [null, "direct"])[1];
    const beat = grid ? grid.beat_s : null;
    const off = beat ? (((t - grid.phase_s) % beat) + beat) % beat : null;
    const err = off == null ? null : Math.min(off, beat - off) * (off <= beat - off ? 1 : -1);
    return { t: r3(t), kind, treatment, beat_off_ms: err == null ? null : Math.round(err * 1000), spot: HIT_TREATMENTS[treatment], nudge_ms: err != null && Math.abs(err) > 0.06 ? -Math.round(err * 1000) : 0 };
  });
}

// ---- sound from continuous picture curves (onetake idea: camera air scales with |d log zoom / dt|^1.3, brush noise with stroke speed)
// A curve is {id, kind, log?, points:[[t, v]...]} or {t0, dt, v:[...]} in film seconds. Activity = |dv/dt|^1.3 (of ln v for a scale), scaled by its
// own 95th percentile, smoothed (40 ms attack, 250 ms release). Still picture = silence.
export function curvePoints(c) {
  if (Array.isArray(c.points)) return c.points.map((p) => (Array.isArray(p) ? [Number(p[0]), Number(p[1])] : [Number(p.t), Number(p.v)])).filter((p) => p.every(Number.isFinite)).sort((a, b) => a[0] - b[0]);
  if (Array.isArray(c.v) && c.dt > 0) return c.v.map((v, i) => [(Number(c.t0) || 0) + i * c.dt, Number(v)]).filter((p) => p.every(Number.isFinite));
  return [];
}
export function curveActivity(c, { rate = 100 } = {}) {
  const P = curvePoints(c);
  if (P.length < 3) return null;
  const log = c.log != null ? !!c.log : /zoom|scale|dive/i.test(String(c.kind));
  const t0 = P[0][0], t1 = P[P.length - 1][0], n = Math.max(2, Math.ceil((t1 - t0) * rate));
  const at = (t) => { let lo = 0, hi = P.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (P[m][0] <= t) lo = m; else hi = m; } const a = P[lo], b = P[hi]; const u = b[0] > a[0] ? Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0]))) : 0; return a[1] + (b[1] - a[1]) * u; };
  const f = (v) => (log ? Math.log(Math.max(1e-6, v)) : v);
  const raw = [];
  for (let i = 0; i < n; i++) { const t = t0 + i / rate; raw.push(Math.pow(Math.abs(f(at(t + 0.5 / rate)) - f(at(t - 0.5 / rate))) * rate, 1.3)); }
  const sorted = [...raw].sort((a, b) => a - b), p95 = sorted[Math.floor(sorted.length * 0.95)] || 1e-9;
  const aA = Math.exp(-1 / (0.04 * rate)), aR = Math.exp(-1 / (0.25 * rate));
  let s = 0;
  const act = raw.map((v) => { const x = Math.min(1, v / (p95 || 1e-9)); s = x > s ? aA * s + (1 - aA) * x : aR * s + (1 - aR) * x; return s; });
  return { t0, t1, rate, act };
}
const TEXTURE_BY_KIND = [[/brush|draw|stroke|scribble|ink/i, "brush"], [/shake|impact|rumble|thrust/i, "rumble"]];
// render one curve to a mono 48 kHz 16-bit WAV: seeded noise shaped by the activity (louder and brighter with speed), silent when still
export function renderTexture(c, out, { sr = 48000, peak = 0.5 } = {}) {
  const A = curveActivity(c);
  if (!A || A.t1 - A.t0 < 0.2) return null;
  const kind = (TEXTURE_BY_KIND.find(([re]) => re.test(String(c.kind))) || [null, "air"])[1];
  const n = Math.round((A.t1 - A.t0) * sr), pcm = new Int16Array(n);
  let h = 2166136261 >>> 0;
  for (const ch of String(c.id || c.kind)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  let st = h || 1;
  const rnd = () => { st ^= st << 13; st >>>= 0; st ^= st >>> 17; st ^= st << 5; st >>>= 0; return st / 2147483648 - 1; };
  let lp = 0, hp = 0, grain = 0;
  const hpC = Math.exp((-2 * Math.PI * (kind === "brush" ? 1200 : kind === "rumble" ? 20 : 250)) / sr);
  for (let i = 0; i < n; i++) {
    const a = A.act[Math.min(A.act.length - 1, Math.floor((i / sr) * A.rate))];
    const w = rnd();
    const lpC = Math.exp((-2 * Math.PI * (kind === "rumble" ? 180 : kind === "brush" ? 5000 + 2500 * a : 1500 + 3500 * a)) / sr);
    lp = lpC * lp + (1 - lpC) * w;
    hp = hpC * hp + (1 - hpC) * lp;
    let v = lp - hp;
    if (kind === "brush") { grain = 0.9995 * grain + 0.0005 * rnd(); v *= 0.6 + 4 * Math.abs(grain) ; }
    const edge = Math.min(1, i / (0.02 * sr), (n - 1 - i) / (0.02 * sr));
    const amp = a < 0.03 ? 0 : Math.pow(a, 0.8);
    pcm[i] = Math.max(-32767, Math.min(32767, Math.round(v * 3 * amp * edge * peak * 32767)));
  }
  const hdr = Buffer.alloc(44);
  hdr.write("RIFF", 0); hdr.writeUInt32LE(36 + n * 2, 4); hdr.write("WAVEfmt ", 8); hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(1, 22);
  hdr.writeUInt32LE(sr, 24); hdr.writeUInt32LE(sr * 2, 28); hdr.writeUInt16LE(2, 32); hdr.writeUInt16LE(16, 34); hdr.write("data", 36); hdr.writeUInt32LE(n * 2, 40);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.concat([hdr, Buffer.from(pcm.buffer)]));
  const live = A.act.filter((v) => v >= 0.03).length / A.act.length;
  return { texture: kind, start: r3(A.t0), duration_s: r3(A.t1 - A.t0), active_share: r3(live) };
}

// How well a film-length bed fits the story's arc, from the audio itself (0.1 s momentary dB, ffmpeg-decoded; no tags, no BPM).
// arc = { intro_until, drop_at, break: [from, to] | null, payoff_at, button_at } (music-lib readArc). Four parts, 25 points each:
//   intro  a sparse start: the intro sits at least 6 dB under the body's median level
//   lift   a lift or drop at the turn: the 1.5 s after drop_at is at least 5 dB over the 1.5 s before it
//   break  a break before the end card: the quietest 0.25 s in the break window (else the last 4 s before the button) is 10 dB under the body
//   peak   the loudest second of the film falls between the turn and the payoff's tail (never in the intro or the outro)
// `file` is a bed already cut to the film (the fitted preview), so the numbers are what the film will get.
// The payoff lift, ONE definition for arcFit and the sound check (sound.mjs flat-payoff): the level of the 1.0 s from T minus the level of the 1.5 s before T, in 100 ms
// windows of the momentary energies (mom = per-window dB, W = window s). Needs 1.5 s before T; returns null when it does not fit.
export const PAYOFF_LIFT_NEED_DB = 2;
export function payoffLiftDb(mom, W, T) {
  const n = mom.length;
  const mean = (a, b) => { const i0 = Math.max(0, Math.round(a / W)), i1 = Math.min(n, Math.round(b / W)); if (i1 <= i0) return -120; let z = 0; for (let i = i0; i < i1; i++) z += Math.pow(10, mom[i] / 10); return 10 * Math.log10(z / (i1 - i0)); };
  if (!(T >= 1.5) || T + 1.0 > n * W + 0.05) return null;
  return mean(T, T + 1.0) - mean(T - 1.5, T);
}
export function arcFit(file, arc, film) {
  const y = decode(file), W = 0.1, mom = momentaryDb(y, W), n = mom.length;
  const dur = Math.min(n * W, film || n * W);
  const mean = (a, b) => { const i0 = Math.max(0, Math.round(a / W)), i1 = Math.min(n, Math.round(b / W)); if (i1 <= i0) return -120; let z = 0; for (let i = i0; i < i1; i++) z += Math.pow(10, mom[i] / 10); return 10 * Math.log10(z / (i1 - i0) + 1e-12); };
  const cl = (x) => Math.max(0, Math.min(1, x));
  const drop = arc.drop_at, button = Math.min(arc.button_at, dur);
  const bodyWin = mom.slice(Math.round(drop / W), Math.round(button / W)).filter((v) => v > -80).sort((a, b) => a - b);
  const body = bodyWin.length ? bodyWin[Math.floor(bodyWin.length / 2)] : -120;
  const introEnd = Math.max(1, Math.min(arc.intro_until ?? drop * 0.7, drop));
  const introDb = mean(0.3, introEnd), introBelow = body - introDb;
  const lift = mean(drop, drop + 1.5) - mean(Math.max(0, drop - 1.5), drop);
  const b0 = arc.break ? arc.break[0] : Math.max(drop + 1, button - 4), b1 = arc.break ? arc.break[1] : button - 0.2;
  let low = 1e9;
  for (let t = Math.max(0, b0 - 0.2); t + 0.25 <= Math.min(b1 + 0.2, dur) + 1e-9; t += W) low = Math.min(low, mean(t, t + 0.25));
  const breakBelow = low === 1e9 ? 0 : body - low;
  let best = -1e9, bestAt = 0;
  for (let t = 0; t + 1 <= dur + 1e-9; t += W) { const v = mean(t, t + 1); if (v > best) { best = v; bestAt = t + 0.5; } }
  const peakOk = bestAt >= drop - 0.5 && bestAt <= (arc.payoff_at ?? button) + 2.5;
  const payoffLift = arc.payoff_at != null && arc.payoff_at > arc.drop_at + 1 ? payoffLiftDb(mom, W, arc.payoff_at) : null;
  const parts = { intro: Math.round(cl(introBelow / 6) * 25), lift: Math.round(cl(lift / 5) * 25), break: Math.round(cl(breakBelow / 10) * 25), peak: peakOk ? 25 : 8 };
  // the payoff must lift too (the sound check fails a flat payoff, unless a deep break sits right before it: then the dip is the lift)
  const pb = arc.payoff_at != null ? (() => { let lo = 1e9; for (let t = Math.max(0, arc.payoff_at - 2); t < arc.payoff_at; t += W) lo = Math.min(lo, mom[Math.round(t / W)] ?? 1e9); return lo === 1e9 ? 0 : body - lo; })() : 99;
  const payoffFlat = payoffLift != null && payoffLift < PAYOFF_LIFT_NEED_DB && pb < 6;
  const score = Math.max(0, parts.intro + parts.lift + parts.break + parts.peak - (payoffFlat ? 10 : 0));
  const problems = [];
  if (payoffFlat) problems.push(`flat payoff at ${r1(arc.payoff_at)} s: ${r1(payoffLift)} dB over the 1.5 s before it (the sound check needs +${PAYOFF_LIFT_NEED_DB})`);
  if (parts.intro < 12) problems.push(`no sparse intro: the first ${r1(introEnd)} s are ${r1(introBelow)} dB under the body (needs 6)`);
  if (parts.lift < 12) problems.push(`no lift at the turn (${r1(drop)} s): ${r1(lift)} dB over the 1.5 s before it (needs 5)`);
  if (parts.break < 12) problems.push(`no break before the end card (${r1(b0)}-${r1(b1)} s): only ${r1(breakBelow)} dB under the body (needs 10)`);
  if (!peakOk) problems.push(`the loudest second is at ${r1(bestAt)} s, not between the turn and the payoff`);
  return { score, parts, payoff_lift_db: payoffLift == null ? null : r1(payoffLift), intro_below_db: r1(introBelow), lift_db: r1(lift), break_below_db: r1(breakBelow), loudest_at_s: r1(bestAt), body_db: r1(body), problems };
}

// ---------------------------------------------------------------- platform loudness and the layered mix (lib/mix.mjs)

// web/social -14 LUFS, keynote -16 (room playback), broadcast -23 (EBU R128); true-peak ceilings in dBTP. "house" is the legacy -14 / -1.5.
export const LOUDNESS_TARGETS = Object.freeze({
  web: { lufs: -14, tp: -1.5, label: "web / social" },
  keynote: { lufs: -16, tp: -1.5, label: "keynote / event screen" },
  broadcast: { lufs: -23, tp: -1.0, label: "broadcast (EBU R128)" },
});
export const loudnessTarget = (platform) => (typeof platform === "object" && platform ? { lufs: platform.lufs ?? -14, tp: platform.tp ?? -1.5 } : LOUDNESS_TARGETS[platform] || LOUDNESS_TARGETS.web);
// the master path for a platform name: the same measure, static gain and true-peak limiter masterFile always did, with the platform's numbers
export function masterForPlatform(input, out, platform = "web") {
  const t = loudnessTarget(platform);
  return masterFile(input, out, { lufs: t.lufs, tp: t.tp });
}
// the stem mix: music + SFX + VO stems, carved and ducked, SFX on the beat grid and hit points, mastered through masterFile. See lib/mix.mjs mixFilm for the spec.
export async function mixFilm(spec, out, opts) {
  const { mixFilm: run } = await import("./mix.mjs");
  return run(spec, out, opts);
}
