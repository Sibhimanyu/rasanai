// One speech-engine ladder for vo.mjs and voice.mjs, plus the small helpers they share:
// quota detection, phonetic name matching, clip conditioning (trim, headroom), per-line pacing.
// Node + ffmpeg only. No Python audio libraries (librosa/numba crash this Mac); edge-tts is a CLI we only detect, never a dependency.
// Ladder: ElevenLabs / OpenAI (keys) -> HeyGen (media-use + heygen CLI) -> Kokoro (model on disk) -> edge-tts (CLI, uvx or pipx) -> macOS say.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync, execFileSync } from "node:child_process";
import { findSkill } from "./hyperframes.mjs";

export const ENGINE_ORDER = ["elevenlabs", "openai", "heygen", "kokoro", "edge", "say"];
export const orderEngines = (list) => [...list].sort((a, b) => ENGINE_ORDER.indexOf(a.id) - ENGINE_ORDER.indexOf(b.id));

const sh = (bin, argv, opts = {}) => spawnSync(bin, argv, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, ...opts });
const have = (bin) => sh("which", [bin]).status === 0;
const keyOf = (...names) => names.map((n) => process.env[n]).find((v) => v && String(v).trim()) || null;
const disabled = () => String(process.env.RASANAI_VO_DISABLE || "").split(",").map((s) => s.trim()).filter(Boolean); // e.g. RASANAI_VO_DISABLE=heygen (tests, quota)

export const kokoroDir = () => [process.env.RASANAI_KOKORO_DIR, process.cwd()].filter(Boolean).find((d) => fs.existsSync(path.join(d, "kokoro-v1.0.onnx")) && fs.existsSync(path.join(d, "voices-v1.0.bin"))) || null;

// the edge-tts launcher: the CLI on PATH (or RASANAI_EDGE_TTS), else uvx / pipx run. Detection only: nothing is installed here.
export function detectEdge() {
  const env = process.env.RASANAI_EDGE_TTS;
  if (env && fs.existsSync(env)) return { cmd: env, pre: [], via: "RASANAI_EDGE_TTS" };
  if (have("edge-tts")) return { cmd: "edge-tts", pre: [], via: "PATH" };
  if (have("uvx")) return { cmd: "uvx", pre: ["edge-tts"], via: "uvx (fetches edge-tts on first use)" };
  if (have("pipx")) return { cmd: "pipx", pre: ["run", "edge-tts"], via: "pipx (fetches edge-tts on first use)" };
  return null;
}

// every engine, in ladder order, each with ok / why. extra: nothing needed today; kept so callers can add engines.
export function engineLadder() {
  const mu = findSkill("media-use"), tts = mu && path.join(mu, "audio", "scripts", "heygen-tts.mjs");
  const edge = detectEdge();
  const off = disabled();
  const list = [
    { id: "elevenlabs", ok: !!keyOf("RASANAI_ELEVENLABS_API_KEY", "ELEVENLABS_API_KEY"), why: "ELEVENLABS_API_KEY set", note: "paid; best quality. Disclose an AI voice where the platform asks." },
    { id: "openai", ok: !!keyOf("OPENAI_API_KEY"), why: "OPENAI_API_KEY set", note: "paid; steerable with a tone instruction. Disclose an AI voice." },
    { id: "heygen", ok: !!(tts && fs.existsSync(tts) && have("heygen")), why: "needs media-use and the heygen CLI signed in", note: "free allowance is limited: a quota error stops it and the next engine speaks", tts },
    { id: "kokoro", ok: have("kokoro-tts") && !!kokoroDir(), why: have("kokoro-tts") ? "the kokoro-tts CLI is installed but kokoro-v1.0.onnx and voices-v1.0.bin are not on disk (RASANAI_KOKORO_DIR or the cwd); they are not downloaded here (Apache-2.0 weights, ~330 MB: ask first)" : "the kokoro-tts CLI is not installed", note: "offline, Apache-2.0 weights" },
    { id: "edge", ok: !!edge, why: "the edge-tts CLI is not installed (also not via uvx or pipx); it needs the network: Microsoft's online voices, no key", note: "free, online, neural voices", edge },
    { id: "say", ok: process.platform === "darwin" && !spawnSync("say", ["-v", "?"], { stdio: "ignore" }).error, why: "macOS say (free, offline)", note: "robotic: a scratch track for timing, not for a finished film" },
  ];
  return orderEngines(list).map((e) => (off.includes(e.id) ? { ...e, ok: false, why: `${e.id} disabled by RASANAI_VO_DISABLE` } : e));
}

// ---------------------------------------------------------------- quota
export const QUOTA_RE = /seconds?\s+left|renews?\s+(next|in|on)|out of (voice )?(credits?|seconds|minutes)|quota|insufficient (credits?|balance|funds)|credits? (exhausted|used up|depleted)|usage limit|payment required|billing|(credit|quota|usage|monthly|daily|free|plan) limit (reached|exceeded)|allowance/i;
export const isQuotaError = (s) => QUOTA_RE.test(String(s || "")) && !/rate.?limit|too many requests|\b429\b/i.test(String(s || "")) ; // a 429 rate limit passes with a wait, it is not an empty allowance
export const errText = (err) => [err && err.stderr, err && err.stdout, err && err.message].map((x) => (x ? String(x) : "")).join("\n").trim();

// ---------------------------------------------------------------- names: phonetic matching
const lev = (a, b) => {
  const m = a.length, n = b.length;
  if (!m || !n) return Math.max(m, n);
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
};
// a coarse consonant skeleton: first letter kept, z/x -> s, c/q -> k/s, ph -> f, doubles collapsed, vowels and h/w/y dropped.
// "RasanAI", "Razan AI", "Rosson AI", "Rasaan AI", "Raisin AI", "Russinai" all give "rsn".
export const phoneticKey = (s) => {
  let t = String(s || "").toLowerCase().replace(/[^a-z]/g, "");
  if (!t) return "";
  t = t.replace(/ph/g, "f").replace(/[zx]/g, "s").replace(/ck|q|c(?=[aou])/g, "k").replace(/c/g, "s").replace(/(.)\1+/g, "$1");
  return t[0] + t.slice(1).replace(/[aeiouyhw]+/g, "");
};
// a variant must be close in spelling AND share the consonant skeleton, so "Motion" / "Nation" never pass for "Notion"
const winMatch = (win, want) => want.length >= 4 && lev(win, want) <= Math.max(1, Math.round(want.length * 0.25)) && phoneticKey(win) === phoneticKey(want);
const keyNear = (a, b) => !!a && !!b && (a === b || (Math.min(a.length, b.length) >= 4 && lev(a, b) <= 1));
// is `name` (e.g. "RasanAI") heard in `heard` (whisper's text)? Exact, then a phonetic / edit-distance match over every window of heard words.
export function nameHeard(name, heard) {
  const nm = String(name || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  const hw = String(heard || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  if (!nm.length) return true;
  if (hw.join(" ").includes(nm.join(" "))) return true;
  const want = nm.join(""), wantKey = phoneticKey(want);
  for (let size = 1; size <= nm.length + 2; size++) for (let k = 0; k + size <= hw.length; k++) {
    const win = hw.slice(k, k + size).join("");
    if (winMatch(win, want)) return true;
  }
  return false;
}
// brand names the voices say wrongly; the respelling goes into the TTS text on the one retake (never on take 1 unless the person confirmed it)
export const KNOWN_RESPELL = { RasanAI: "Rah-sun A I", Rasan: "Rah-sun" };
export function respellKnown(text, names = []) {
  const map = { ...KNOWN_RESPELL };
  let out = String(text);
  for (const [a, b] of Object.entries(map)) if (names.length === 0 || names.some((n) => phoneticKey(n) === phoneticKey(a))) out = out.replace(new RegExp(`\\b${a}\\b`, "g"), b);
  return out;
}

// ---------------------------------------------------------------- synth (the sync engines)
// text -> raw audio file `raw` (any format ffmpeg reads). speed 1 = the voice's own pace. Throws with the engine's own error text.
export function synthRaw(eng, text, raw, { voice, lang = "en", speed = 1 } = {}) {
  const t = fs.mkdtempSync(path.join(os.tmpdir(), "rasanai-synth-"));
  try {
    if (eng.id === "heygen") execFileSync("node", [eng.tts, text, "-o", raw, ...(voice ? ["--voice", voice] : []), "--lang", lang, ...(speed && speed !== 1 ? ["--speed", String(speed)] : [])], { stdio: ["ignore", "pipe", "pipe"], timeout: 180000 }); // heygen-tts.mjs takes --speed
    else if (eng.id === "kokoro") {
      const inp = path.join(t, "in.txt"); fs.writeFileSync(inp, text);
      execFileSync("kokoro-tts", [inp, raw, "--voice", voice || "af_sarah", "--speed", String(speed), "--lang", lang === "en" ? "en-us" : lang], { cwd: kokoroDir(), stdio: ["ignore", "pipe", "pipe"], timeout: 300000 });
    } else if (eng.id === "edge") {
      const e = eng.edge || detectEdge();
      if (!e) throw new Error("edge-tts is not available");
      const mp3 = path.join(t, "raw.mp3"), pct = Math.round((speed - 1) * 100);
      const v = voice || ({ en: "en-US-AriaNeural", fr: "fr-FR-DeniseNeural", de: "de-DE-KatjaNeural", es: "es-ES-ElviraNeural", hi: "hi-IN-SwaraNeural", ta: "ta-IN-PallaviNeural", ja: "ja-JP-NanamiNeural" }[lang] || "en-US-AriaNeural");
      execFileSync(e.cmd, [...e.pre, "--text", text, "--voice", v, `--rate=${pct >= 0 ? "+" : ""}${pct}%`, "--write-media", mp3], { stdio: ["ignore", "pipe", "pipe"], timeout: 180000 });
      execFileSync("ffmpeg", ["-v", "error", "-y", "-i", mp3, "-f", "wav", raw]); // native rate kept
    } else if (eng.id === "say") {
      const v = voice || process.env.RASANAI_SAY_VOICE || "Samantha";
      const r = spawnSync("say", ["-v", v, "-o", raw, "--file-format=WAVE", "--data-format=LEF32@48000", text], { encoding: "utf8" });
      if (r.status !== 0) throw new Error(`say failed: ${(r.stderr || "").trim().slice(0, 120)}`);
    } else throw new Error(`${eng.id} is not a local engine`);
  } finally { fs.rmSync(t, { recursive: true, force: true }); }
}

// ---------------------------------------------------------------- clip conditioning
export const TRIM_AF = "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.04,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.08,areverse";
// true peak (dBTP) of a file, null if unreadable
export function truePeak(file) {
  const r = sh("ffmpeg", ["-nostats", "-hide_banner", "-i", file, "-af", "ebur128=peak=true", "-f", "null", "-"]);
  const tail = String(r.stderr || "").split("Summary:").pop() || "";
  const m = tail.match(/True peak:\s*\n?\s*Peak:\s*(-?[\d.]+|-inf)\s*dBFS/);
  return m && m[1] !== "-inf" ? Number(m[1]) : null;
}
// trim lead/tail silence, then bring the true peak to <= tpDb (default -3 dBTP, headroom for the mix); a clipped source cannot be repaired, only kept off 0 dBFS.
// rate/channels: pass null to keep the source's own (the mix runs at 48 kHz; an engine's higher rate is never thrown away).
export function conditionClip(input, out, { tpDb = -3, rate = null, channels = null, trim = true, tempo = 1 } = {}) { // tempo: say's -r barely moves its pace, so say's speed is a time-stretch (atempo) here
  const t = fs.mkdtempSync(path.join(os.tmpdir(), "rasanai-cond-"));
  try {
    const mid = path.join(t, "mid.wav");
    const argv = ["-v", "error", "-y", "-i", input, ...(trim || tempo !== 1 ? ["-af", [trim ? TRIM_AF : null, tempo !== 1 ? `atempo=${Math.max(0.5, Math.min(2, tempo))}` : null].filter(Boolean).join(",")] : []), "-c:a", "pcm_f32le", mid];
    if (sh("ffmpeg", argv).status !== 0) throw new Error("ffmpeg could not trim the take");
    const tp = truePeak(mid);
    const gain = tp == null ? 0 : Math.min(0, tpDb - tp);
    const af = [gain < -0.05 ? `volume=${gain.toFixed(2)}dB` : null, `alimiter=limit=${Math.pow(10, tpDb / 20).toFixed(4)}:level=disabled`].filter(Boolean).join(",");
    const o = ["-v", "error", "-y", "-i", mid, "-af", af, ...(rate ? ["-ar", String(rate)] : []), ...(channels ? ["-ac", String(channels)] : []), "-c:a", "pcm_s24le", out];
    if (sh("ffmpeg", o).status !== 0) throw new Error("ffmpeg could not set the headroom");
    return { tp_before: tp, gain_db: Math.round(gain * 100) / 100 };
  } finally { fs.rmSync(t, { recursive: true, force: true }); }
}

// ---------------------------------------------------------------- pacing
export const countWords = (s) => String(s || "").split(/\s+/).filter((w) => /[A-Za-z0-9À-￿]/.test(w)).length;
// sentences of a line: split after . ! ? when another sentence starts; a lone line stays one
export function splitSentences(text) {
  const parts = String(text).trim().split(/(?<=[.!?]["')\]]?)\s+(?=["'(\[]?[A-Z0-9À-￿])/).map((s) => s.trim()).filter(Boolean);
  const out = [];
  for (const p of parts) { if (out.length && countWords(p) < 2) out[out.length - 1] += ` ${p}`; else out.push(p); } // a one-word tail ("Done.") stays with its sentence
  return out.length ? out : [String(text).trim()];
}
export const GAP = { comma: 0.18, sentence: 0.45, question: 0.5, ellipsis: 0.7, beat: 0.9, inside: 0.25 };
// the silence after a clip, from the script: an explicit gap_after wins; else punctuation; a beat change is longest
export function gapAfter(text, { explicit, beatChange = false, inside = false } = {}) {
  if (Number.isFinite(explicit)) return Math.max(0, explicit);
  if (beatChange) return GAP.beat;
  if (inside) return GAP.inside;
  const t = String(text).trim();
  if (/(\.\.\.|…)["')\]]?$/.test(t)) return GAP.ellipsis;
  if (/\?["')\]]?$/.test(t)) return GAP.question;
  if (/[.!]["')\]]?$/.test(t)) return GAP.sentence;
  if (/[,;:—-]$/.test(t)) return GAP.comma;
  return GAP.sentence;
}
export const PACE = { lo: 2.3, hi: 2.7, target: 2.5 };
// speed that would land a clip of `words` words and `dur` seconds on the target rate (clamped), or null when it is already in range / too short to judge
export function paceFix(words, dur, speed = 1) {
  if (words < 4 || !(dur > 0.3)) return null;
  const wps = words / dur;
  if (wps >= PACE.lo && wps <= PACE.hi) return null;
  return Math.max(0.7, Math.min(1.3, Math.round(speed * (PACE.target / wps) * 100) / 100));
}

// ---------------------------------------------------------------- names in whisper's text
const normTok = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

// words: [{text,start,end}] from whisper. Wherever a window of heard words is a phonetic variant of a name ("Razan AI" for RasanAI), replace it by the name's own words,
// so the line's word error rate and the name check judge the voice, not whisper's spelling. Exact hits and non-matches are left alone.
export function canonicalizeHeard(words, names = []) {
  let ws = words.map((w) => ({ ...w }));
  const hits = [];
  for (const name of names) {
    const toks = String(name).split(/\s+/).map(normTok).filter(Boolean);
    if (!toks.length) continue;
    const want = toks.join("");
    const out = [];
    for (let k = 0; k < ws.length;) {
      let took = 0, bestD = Infinity;
      for (let size = 1; size <= toks.length + 2 && k + size <= ws.length; size++) {
        const win = ws.slice(k, k + size), joined = win.map((w) => normTok(w.text)).join("");
        if (joined === want) { took = -size; break; } // exact: leave it
        const d = lev(joined, want);
        if (winMatch(joined, want) && d <= bestD) { took = size; bestD = d; } // the closest window, the longer on a tie
      }
      if (took > 0) {
        const win = ws.slice(k, k + took), t0 = win[0].start, t1 = win[win.length - 1].end ?? win[win.length - 1].start;
        hits.push({ name, heard: win.map((w) => w.text).join(" ") });
        toks.forEach((tk, d) => out.push({ ...win[0], text: tk, start: t0 + ((t1 - t0) * d) / toks.length, end: t0 + ((t1 - t0) * (d + 1)) / toks.length }));
        k += took;
      } else { out.push(ws[k]); k += took < 0 ? -took : 1; }
    }
    ws = out;
  }
  return { words: ws, hits };
}
