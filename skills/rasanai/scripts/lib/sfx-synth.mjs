// Synthesised SFX, made with ffmpeg only (lavfi sources + filters), deterministic (every noise source has a fixed seed) and written as 48 kHz stereo WAV.
// Kinds: riser, impact, whoosh, stinger, subdrop, tick. A film's "sound palette" is 3-5 of these tied to its carrier (library/sfx/palettes.json),
// rendered once per film into <run>/audio/palette/ with a palette.json the mix reads.
//   synth(kind, out, params)  -> { out, kind, duration, sync_point_s, params }
//   renderPalette({ carrier, keyHz, seed, dir, mode }) -> { carrier, key_hz, sounds:[{id,role,kind,file,duration,sync_point_s,gain_db,pan}] }
// sync_point_s: seconds from the file start to the moment that must land on the picture's hit (riser: its end; whoosh: its crest; impact/tick/stinger: its onset).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SFX_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "library", "sfx");
export const PALETTE_FILE = path.join(SFX_DIR, "palettes.json");
const r3 = (x) => Math.round(x * 1000) / 1000;
const seedOf = (s) => parseInt(crypto.createHash("sha1").update(String(s)).digest("hex").slice(0, 7), 16);
const LIM = "alimiter=limit=0.7:attack=2:release=40:level=disabled";

function ff(argv, out) {
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-nostdin", ...argv, "-ar", "48000", "-ac", "2", "-c:a", "pcm_f32le", out], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffmpeg synth failed: ${(r.stderr || "").trim().split("\n").slice(-2).join(" ")}`);
}
const noise = (d, seed, c = "pink") => `anoisesrc=d=${d}:c=${c}:r=48000:seed=${seed}:a=0.9`;

// sine whose frequency glides f0 -> f1 (exponential in time, rate k): exact phase, no clicks
const glide = (f0, f1, k, d, amp = 0.9) => `aevalsrc='${amp}*sin(2*PI*(${f1}*t+(${f0}-${f1})/${k}*(1-exp(-${k}*t))))':d=${d}:s=48000`;

export const KINDS = {
  // a 2-4 s build that ends on its sync point: noise opening in three bands + a rising tone, cut clean on the hit
  riser({ dur = 3, seed = 1, lo = 220, hi = 1800 } = {}) {
    const g = [
      `${noise(dur, seed)},asplit=3[n1][n2][n3]`,
      `[n1]lowpass=f=900,volume='0.5*pow(t/${dur},1.2)':eval=frame[b1]`,
      `[n2]bandpass=f=2800:t=h:w=2200,volume='0.7*pow(t/${dur},2.2)':eval=frame[b2]`,
      `[n3]highpass=f=6000,volume='0.6*pow(t/${dur},3.2)':eval=frame[b3]`,
      `aevalsrc='0.35*sin(2*PI*(${lo}*t+(${hi}-${lo})*t*t*t/(3*${dur}*${dur})))*pow(t/${dur},2)':d=${dur}:s=48000[tn]`,
      `[b1][b2][b3][tn]amix=inputs=4:normalize=0,volume=2.2,highpass=f=180,afade=t=out:st=${r3(dur - 0.04)}:d=0.04,aecho=0.7:0.5:90:0.25,${LIM}[o]`,
    ].join(";");
    return { argv: ["-filter_complex", g, "-map", "[o]"], duration: dur, sync_point_s: dur };
  },
  // sub drop + body + noise crack; sync point is the onset
  impact({ dur = 1.6, seed = 2, f = 52, tail = 1 } = {}) {
    const g = [
      `${glide(f * 2.4, f, 14, dur, 1)},volume='exp(-t*${r3(2.6 / tail)})':eval=frame[sub]`,
      `${noise(0.5, seed, "white")},lowpass=f=3200,highpass=f=300,volume='exp(-t*20)':eval=frame[crack]`,
      `${noise(dur, seed + 7)},lowpass=f=500,volume='0.5*exp(-t*${r3(3.2 / tail)})':eval=frame[rum]`,
      `[sub][crack][rum]amix=inputs=3:normalize=0,aecho=0.8:0.55:70|140:0.3|0.18,${LIM}[o]`,
    ].join(";");
    return { argv: ["-filter_complex", g, "-map", "[o]"], duration: dur, sync_point_s: 0 };
  },
  // filtered noise swell, louder in one channel first (dir "lr" or "rl"), crest at 0.6 of its length
  whoosh({ dur = 0.7, seed = 3, f = 1900, dir = "lr" } = {}) {
    const crest = r3(dur * 0.6);
    const env = (shift) => `volume='pow(sin(PI*min(1\\,max(0\\,(t-${shift})/(${dur}-${Math.abs(shift) * 2})))),2)':eval=frame`;
    const a = dir === "rl" ? 0.08 : 0;
    const b = dir === "rl" ? 0 : 0.08;
    const g = [
      `${noise(dur, seed)},bandpass=f=${f}:t=h:w=${Math.round(f * 0.9)},highpass=f=300,asplit=2[x][y]`,
      `[x]${env(a)}[l]`,
      `[y]${env(b)}[r]`,
      `[l][r]amerge=inputs=2,afade=t=in:d=${r3(dur * 0.35)},afade=t=out:st=${r3(dur * 0.7)}:d=${r3(dur * 0.3)},volume=1.6,${LIM}[o]`,
    ].join(";");
    return { argv: ["-filter_complex", g, "-map", "[o]"], duration: dur, sync_point_s: crest };
  },
  // a short tonal motif in the film's key: root, fifth, octave, decaying; for logos and the button
  stinger({ dur = 1.3, root = 220, seed = 4, color = "bright" } = {}) {
    const ratios = color === "dark" ? [1, 1.5, 2, 0.5] : color === "open" ? [1, 1.5, 2, 3] : [1, 1.5, 2, 2.5];
    const gains = [0.5, 0.32, 0.28, 0.14];
    const voices = ratios.map((rt, i) => `aevalsrc='${gains[i]}*sin(2*PI*${r3(root * rt)}*t)*exp(-t*${3.2 + i * 0.8})*min(1\\,t*80)':d=${dur}:s=48000[v${i}]`);
    const g = [...voices, `${noise(0.12, seed, "white")},highpass=f=5000,volume='0.25*exp(-t*40)':eval=frame,apad=whole_dur=${dur}[tk]`, `[v0][v1][v2][v3][tk]amix=inputs=5:normalize=0,aecho=0.8:0.4:120:0.22,afade=t=out:st=${r3(dur * 0.6)}:d=${r3(dur * 0.4)},${LIM}[o]`].join(";");
    return { argv: ["-filter_complex", g, "-map", "[o]"], duration: dur, sync_point_s: 0 };
  },
  // a falling sine with no noise: a held breath before a cut, or a weighty button
  subdrop({ dur = 1.4, f = 70, seed = 5 } = {}) {
    void seed;
    const g = `${glide(f * 1.6, f * 0.45, 3.2, dur, 1)},volume='exp(-t*1.8)':eval=frame,afade=t=in:d=0.01,${LIM}[o]`;
    return { argv: ["-filter_complex", g, "-map", "[o]"], duration: dur, sync_point_s: 0 };
  },
  // a short causal click for a dot landing, a word snapping: pitched pop + noise tick
  tick({ dur = 0.18, f = 1400, seed = 6 } = {}) {
    const g = [
      `${glide(f * 1.8, f, 60, dur, 0.8)},volume='exp(-t*38)':eval=frame[p]`,
      `${noise(dur, seed, "white")},highpass=f=4000,volume='0.3*exp(-t*70)':eval=frame[n]`,
      `[p][n]amix=inputs=2:normalize=0,${LIM}[o]`,
    ].join(";");
    return { argv: ["-filter_complex", g, "-map", "[o]"], duration: dur, sync_point_s: 0 };
  },
};

export function synth(kind, out, params = {}) {
  const k = KINDS[kind];
  if (!k) throw new Error(`unknown SFX kind ${kind}; known: ${Object.keys(KINDS).join(", ")}`);
  const seed = params.seed ?? seedOf(`${kind}:${out}`);
  const s = k({ ...params, seed });
  ff(s.argv, out);
  return { out: path.resolve(out), kind, duration: r3(s.duration), sync_point_s: r3(s.sync_point_s), params: { ...params, seed } };
}

// ---------------------------------------------------------------- palettes

export function loadPalettes() {
  return JSON.parse(fs.readFileSync(PALETTE_FILE, "utf8"));
}

// the carrier is one of the palettes' keys (dot, word-line, icon-set, palette-field, dither-edge, ui-plane) or anything else (falls back to "default")
export function paletteFor(carrier) {
  const P = loadPalettes();
  const id = String(carrier || "").toLowerCase().replace(/[^a-z]+/g, "-");
  const hit = Object.keys(P.carriers).find((k) => id === k || id.includes(k) || (P.carriers[k].aliases || []).some((a) => id.includes(a)));
  return { id: hit || "default", ...(P.carriers[hit] || P.carriers.default) };
}

// a film's palette: 3-5 sounds in the film's key (keyHz sets stinger, riser and tick pitch), rendered to <dir>
export function renderPalette({ carrier, keyHz = 220, seed = "film", dir, only } = {}) {
  if (!dir) throw new Error("renderPalette needs a dir");
  const P = paletteFor(carrier);
  const sounds = [];
  for (const s of P.sounds) {
    if (only && !only.includes(s.id)) continue;
    const params = { ...s.params };
    if (s.kind === "stinger") params.root = r3(keyHz * (s.params.octave || 1));
    if (s.kind === "tick") params.f = r3(keyHz * (s.params.mult || 6));
    if (s.kind === "riser") { params.lo = r3(keyHz); params.hi = r3(keyHz * 8); }
    delete params.octave; delete params.mult;
    const file = path.join(dir, `${s.id}.wav`);
    const r = synth(s.kind, file, { ...params, seed: seedOf(`${seed}:${s.id}`) });
    sounds.push({ id: s.id, role: s.role, kind: s.kind, file: path.relative(dir, file), duration: r.duration, sync_point_s: r.sync_point_s, gain_db: s.gain_db ?? 0, pan: s.pan ?? 0, why: s.why });
  }
  const rec = { carrier: P.id, key_hz: keyHz, seed, character: P.character, sounds };
  fs.writeFileSync(path.join(dir, "palette.json"), JSON.stringify(rec, null, 2) + "\n");
  return rec;
}
