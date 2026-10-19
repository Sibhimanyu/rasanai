// Speech helpers shared by reel.mjs and footage.mjs: which whisper models are installed, which language a clip speaks,
// whisper-cli's JSON turned into word timings, and a cheap check that an "English" transcript is not a translation.
//
// Why this exists: an English-only model (small.en) given Tamil or Spanish speech translates it into English without
// saying so. So the language is decided FIRST, never defaulted: detected with a multilingual model when one is installed
// (whisper-cli -dl), given by the user (--lang), or, when neither is possible, the transcript is marked unverified and
// checked for translation tells. A model is never downloaded here; the caller says what to ask the user.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

// RASANAI_WHISPER_MODELS (a folder of ggml-*.bin) replaces the default cache, so tests and odd installs are exact
export const MODEL_DIRS = () => (process.env.RASANAI_WHISPER_MODELS ? [process.env.RASANAI_WHISPER_MODELS] : [path.join(os.homedir(), ".cache", "hyperframes", "whisper", "models")]);

// installed ggml models: [{name: "small.en", multilingual: false, file}]
export function installedModels() {
  const out = [];
  for (const d of MODEL_DIRS()) {
    let names = [];
    try { names = fs.readdirSync(d); } catch { continue; }
    for (const f of names) {
      const m = f.match(/^ggml-(.+)\.bin$/);
      if (m && !/^silero|^for-tests/.test(m[1])) out.push({ name: m[1], multilingual: !/\.en$/.test(m[1]), file: path.join(d, f) });
    }
  }
  return out;
}
const RANK = ["large-v3-turbo", "large-v3", "large-v2", "large", "medium", "small", "base", "tiny"];
const rank = (n) => { const i = RANK.findIndex((r) => n.replace(/\.en$/, "").startsWith(r)); return i < 0 ? 99 : i; };
export function pickModel({ multilingual }) {
  return installedModels().filter((m) => m.multilingual === multilingual && !/-q\d/.test(m.name)).sort((a, b) => rank(a.name) - rank(b.name))[0] || installedModels().filter((m) => m.multilingual === multilingual).sort((a, b) => rank(a.name) - rank(b.name))[0] || null;
}
// whisper-cli is looked for where Homebrew, Studio's managed tools and HyperFrames' own source build put it, not only on PATH:
// a build under ~/.cache/hyperframes/whisper/whisper.cpp is never on PATH, and a sandboxed director may not have /opt/homebrew/bin.
export function whisperCandidates() {
  const home = os.homedir();
  return [process.env.HYPERFRAMES_WHISPER_PATH, path.join(home, "Library", "Application Support", "RasanAI", "Tools", "bin", "whisper-cli"),
    "/opt/homebrew/bin/whisper-cli", "/usr/local/bin/whisper-cli",
    path.join(home, ".cache", "hyperframes", "whisper", "whisper.cpp", "build", "bin", "whisper-cli"),
    path.join(home, ".cache", "hyperframes", "whisper", "whisper.cpp", "build", "whisper-cli")].filter(Boolean);
}
let _whisperBin;
export function whisperBin() {
  if (_whisperBin && fs.existsSync(_whisperBin)) return _whisperBin;
  const w = spawnSync("which", ["whisper-cli"], { encoding: "utf8" });
  const onPath = w.status === 0 ? String(w.stdout).trim().split("\n")[0] : "";
  const found = [onPath, ...whisperCandidates()].filter(Boolean).find((p) => { try { fs.accessSync(p, fs.constants.X_OK); return true; } catch { return false; } });
  _whisperBin = found || null;
  return found || "whisper-cli";
}
export const hasWhisperCli = () => { const b = whisperBin(); return b !== "whisper-cli" || spawnSync(whisperBin(), ["--version"], { encoding: "utf8" }).status === 0; };

// a 16 kHz mono wav of [start, start+dur] seconds (whisper-cli reads wav, mp3, flac, ogg)
export function extractWav(src, dest, { start = 0, dur = 0 } = {}) {
  const argv = ["-v", "error", "-y"];
  if (start > 0) argv.push("-ss", String(start));
  argv.push("-i", src);
  if (dur > 0) argv.push("-t", String(dur));
  argv.push("-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", dest);
  const r = spawnSync("ffmpeg", argv, { encoding: "utf8" });
  return r.status === 0 && fs.existsSync(dest);
}

// the language a wav speaks, by whisper-cli -dl with a multilingual model. null when it can't be told.
export function detectLanguage(wav) {
  const m = pickModel({ multilingual: true });
  if (!m || !hasWhisperCli()) return null;
  const r = spawnSync(whisperBin(), ["-m", m.file, "-f", wav, "-dl", "-np"], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, timeout: 120000 });
  const mm = String(r.stderr || "").concat(String(r.stdout || "")).match(/auto-detected language:\s*([a-z]{2,3})\s*\(p\s*=\s*([\d.]+)\)/i);
  return mm ? { lang: mm[1].toLowerCase(), p: Number(mm[2]), model: m.name } : null;
}

// whisper-cli -ojf -sow -ml 1 JSON -> [{text, start, end, conf}] in seconds, from a wav that begins at `offset` seconds of the source
export function wordsFromWhisperJson(j, offset = 0) {
  const r3 = (v) => Math.round(v * 1000) / 1000;
  const out = [];
  for (const seg of j.transcription || []) {
    const text = String(seg.text || "").trim();
    if (!text || /^\[.*\]$/.test(text) || /^[♪♫\s]+$/.test(text)) continue;
    const toks = (seg.tokens || []).filter((t) => !/^\[_.*_\]$/.test(String(t.text || "").trim()));
    const ps = toks.map((t) => Number(t.p)).filter((p) => Number.isFinite(p));
    const conf = ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : null;
    const s = Number(seg.offsets && seg.offsets.from) / 1000, e = Number(seg.offsets && seg.offsets.to) / 1000;
    if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) continue;
    out.push({ text, start: r3(s + offset), end: r3(e + offset), conf: conf == null ? null : r3(conf) });
  }
  return out;
}

// transcribe a media file with whisper-cli. opts: {model: file, lang, prompt, start, dur, tmp}. Returns {words, language, model}
export function whisperTranscribe(src, opts) {
  const tmp = opts.tmp || fs.mkdtempSync(path.join(os.tmpdir(), "rasanai-wh-"));
  fs.mkdirSync(tmp, { recursive: true });
  const wav = path.join(tmp, "in.wav");
  if (!extractWav(src, wav, { start: opts.start || 0, dur: opts.dur || 0 })) throw new Error("ffmpeg could not read the audio");
  const base = path.join(tmp, "out");
  const argv = ["-m", opts.model, "-f", wav, "-ojf", "-of", base, "-sow", "-ml", "1", "-l", opts.lang || "en", "-np"];
  if (opts.prompt) argv.push("--prompt", String(opts.prompt).slice(0, 400));
  const r = spawnSync(whisperBin(), argv, { encoding: "utf8", maxBuffer: 128 * 1024 * 1024, timeout: opts.timeout || 3600000 });
  if (r.status !== 0 || !fs.existsSync(base + ".json")) throw new Error(String(r.stderr || r.error || "whisper-cli failed").trim().split("\n").filter(Boolean).pop());
  const j = JSON.parse(fs.readFileSync(base + ".json", "utf8"));
  const words = wordsFromWhisperJson(j, opts.start || 0);
  if (!opts.tmp) fs.rmSync(tmp, { recursive: true, force: true });
  return { words, language: (j.result && j.result.language) || opts.lang || null, model: path.basename(opts.model) };
}

const EN_STOP = new Set("the a an and or of to in on at for with from is it its this that as be are was were you your we our i my me not no so but if then than into all one they he she his her them there what when how who which have has had do does did can will would just about out up".split(" "));
// does this transcript read like English? A translation by an English-only model reads fine, so this catches the opposite tell:
// an English transcript of non-English speech full of non-ASCII letters, or with almost no English function words.
export function englishLooks(text) {
  const words = String(text || "").toLowerCase().match(/[\p{L}']+/gu) || [];
  if (words.length < 8) return { ok: true, words: words.length };
  const nonAscii = words.filter((w) => /[^\x00-\x7f]/.test(w)).length / words.length;
  const stop = words.filter((w) => EN_STOP.has(w)).length / words.length;
  return { ok: nonAscii < 0.15 && stop > 0.12, words: words.length, non_ascii: Math.round(nonAscii * 100) / 100, stopwords: Math.round(stop * 100) / 100 };
}

// Decide how to transcribe one clip. Returns {lang, verified, model, source, warning?, blocked?}
//   lang given (not "auto")  -> that language; english -> the .en model is fine, else a multilingual model is needed
//   lang auto / unset        -> the audio stream's language tag, then whisper-cli -dl on a speech window, else unverified "en"
export function decideLanguage({ file, lang, tag, duration, speechAt = 0 }) {
  const want = lang && lang !== "auto" ? String(lang).toLowerCase() : null;
  const multi = pickModel({ multilingual: true });
  const en = pickModel({ multilingual: false });
  const isEn = (l) => l === "en" || l === "eng";
  if (want) {
    if (isEn(want)) return { lang: "en", verified: true, model: en || multi, source: "--lang" };
    return multi ? { lang: want, verified: true, model: multi, source: "--lang" } : { lang: want, verified: true, model: null, blocked: `needs a multilingual whisper model (ggml-small.bin, about 466 MB): ask the user once, and only after a yes run \`node $SKILL_DIR/scripts/transcriber.mjs install --model small\` (if it fails, give the user its reason and ask retry or skip; never skip on your own)`, source: "--lang" };
  }
  const t = tag && !/^(und|zxx|mis|mul)$/i.test(tag) ? String(tag).slice(0, 2).toLowerCase() : null;
  if (t && !isEn(t)) {
    return multi ? { lang: t, verified: false, model: multi, source: "stream tag" } : { lang: t, verified: false, model: null, blocked: `the file's audio is tagged "${tag}" but only English-only whisper models are installed (they translate other languages into English without saying so): ask the user before downloading ggml-small.bin (about 466 MB), or pass --lang en to force`, source: "stream tag" };
  }
  if (multi) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rasanai-lang-"));
    try {
      const wav = path.join(dir, "w.wav");
      const start = Math.max(0, Math.min(speechAt, Math.max(0, (duration || 30) - 30)));
      if (extractWav(file, wav, { start, dur: 30 })) {
        const d = detectLanguage(wav);
        if (d) return { lang: d.lang, verified: d.p >= 0.6, model: isEn(d.lang) ? en || multi : multi, source: `whisper-cli -dl (p ${d.p})`, p: d.p };
      }
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    return { lang: "en", verified: false, model: multi, source: "detection failed, assumed English" };
  }
  return { lang: "en", verified: false, model: en, source: "no multilingual model installed: the language could not be detected", warning: "Language not verified: only an English-only whisper model is installed, which translates other languages into English without saying so. If the speech is not English, pass --lang <code> and install ggml-small.bin (about 466 MB, ask the user first)." };
}
