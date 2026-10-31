// Sound source adapters, used only when their key is set (or, for ACE-Step, when the person has installed it). Nothing is shipped, borrowed or installed.
// The person's own `--track` always wins over every adapter (music.mjs: the "user" source comes first and stops the chain).
//   adapters()                      -> [{id, kind: "music"|"sfx"|"tts", on, why, licence, caveat}]
//   elevenMusic({prompt, seconds, out})   ElevenLabs Music        (key ELEVENLABS_API_KEY or RASANAI_ELEVENLABS_API_KEY)
//   elevenSfx({prompt, seconds, out})     ElevenLabs sound effects (same key)
//   stableAudio({prompt, seconds, out})   Stable Audio 2 API       (STABILITY_API_KEY or RASANAI_STABILITY_API_KEY)
//   freesoundSfx({query, out, minS, maxS}) Freesound, CC0 only     (FREESOUND_API_KEY)
//   aceStep({prompt, seconds, out, lyrics}) a local ACE-Step install run as an isolated child process (ACESTEP_CMD)
// Each returns { file, vendor, licence, caveat, prompt } and throws on failure; callers record licence + caveat in LICENSES.json.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

export const env = (...names) => names.map((n) => process.env[n]).find((v) => v && String(v).trim()) || null;
export const KEY = {
  eleven: () => env("RASANAI_ELEVENLABS_API_KEY", "ELEVENLABS_API_KEY"),
  stable: () => env("RASANAI_STABILITY_API_KEY", "STABILITY_API_KEY"),
  freesound: () => env("RASANAI_FREESOUND_API_KEY", "FREESOUND_API_KEY"),
  acestep: () => env("ACESTEP_CMD"),
};
const UA = "RasanAI/sound-sources";

// licence caveats, printed whenever an adapter is used. (verify) = a secondary source said it; check the vendor's own terms page.
export const CAVEATS = {
  elevenlabs: "ElevenLabs film/ad use is UNVERIFIED: one 2026 guide says self-serve plans exclude film, TV and studio games; Enterprise covers them. Commercial rights start on the paid Starter tier. Confirm on elevenlabs.io/terms before a launch film is used as an ad, and record the plan active on the generation date.",
  stable: "Stable Audio: commercial use under the Stability AI terms or Community Licence (revenue thresholds apply) (verify). Record the plan and the generation date.",
  freesound: "Freesound: only CC0 files are used (filter license:'Creative Commons 0'), so no attribution is needed; the file's own licence page is saved. CC BY and CC BY-NC are never pulled.",
  localgen: "Local ACE-Step 1.5 (MIT code and weights; the model card says generated music may be used commercially). Runs in its own uv venv (Python 3.12) as a subprocess, only with --allow-generation. Generated songs can resemble training material: keep the seed and prompt in LICENSES.json.",
  acestep: "ACE-Step runs locally from the person's own install; weights licence (Apache-2.0 / MIT family) must be checked against the model card of the exact version installed (verify). Never installed by RasanAI.",
};
export const warn = (id, log = (m) => process.stderr.write(m + "\n")) => log(`sound: licence caveat (${id}): ${CAVEATS[id]}`);

export function adapters() {
  return [
    { id: "local-gen", kind: "music", on: localGen.available(), why: localGen.available() ? "ACE-Step 1.5 in ~/.cache/rasanai/acestep-venv" : "not installed: node scripts/music.mjs local-setup", licence: "MIT (code and weights; model card says commercial use allowed)", caveat: CAVEATS.localgen },
    { id: "elevenlabs-music", kind: "music", on: !!KEY.eleven(), why: "ELEVENLABS_API_KEY", licence: "vendor plan at generation time", caveat: CAVEATS.elevenlabs },
    { id: "elevenlabs-sfx", kind: "sfx", on: !!KEY.eleven(), why: "ELEVENLABS_API_KEY", licence: "vendor plan at generation time", caveat: CAVEATS.elevenlabs },
    { id: "elevenlabs-tts", kind: "tts", on: !!KEY.eleven(), why: "ELEVENLABS_API_KEY (scripts/vo.mjs)", licence: "vendor plan; disclose an AI voice", caveat: CAVEATS.elevenlabs },
    { id: "stable-audio", kind: "music+sfx", on: !!KEY.stable(), why: "STABILITY_API_KEY", licence: "Stability terms / Community Licence", caveat: CAVEATS.stable },
    { id: "freesound-cc0", kind: "sfx", on: !!KEY.freesound(), why: "FREESOUND_API_KEY", licence: "CC0 only", caveat: CAVEATS.freesound },
    { id: "ace-step-local", kind: "music", on: !!KEY.acestep() && fs.existsSync(String(KEY.acestep()).split(/\s+/)[0]), why: "ACESTEP_CMD (an executable that takes --prompt --duration --out [--lyrics])", licence: "per model card", caveat: CAVEATS.acestep },
  ];
}

const need = (k, what) => { if (!k) throw new Error(`${what} is not set`); return k; };
const save = (out, bytes) => { fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true }); fs.writeFileSync(out, bytes); return out; };
const base = () => process.env.RASANAI_ELEVENLABS_API_BASE || "https://api.elevenlabs.io";

export async function elevenMusic({ prompt, seconds, out }) {
  const key = need(KEY.eleven(), "ELEVENLABS_API_KEY");
  const res = await fetch(`${base()}/v1/music?output_format=mp3_44100_128`, { method: "POST", headers: { "xi-api-key": key, "content-type": "application/json", "user-agent": UA }, body: JSON.stringify({ prompt: String(prompt).slice(0, 2000), music_length_ms: Math.round(Math.min(300, Math.max(10, seconds)) * 1000), model_id: "music_v1", force_instrumental: true }), signal: AbortSignal.timeout(600000) });
  if (!res.ok) throw new Error(`ElevenLabs Music HTTP ${res.status} ${(await res.text()).slice(0, 160)}`);
  return { file: save(out, Buffer.from(await res.arrayBuffer())), vendor: "elevenlabs/music_v1", licence: "vendor plan at generation time", caveat: CAVEATS.elevenlabs, prompt, date: new Date().toISOString() };
}
export async function elevenSfx({ prompt, seconds = 2, out }) {
  const key = need(KEY.eleven(), "ELEVENLABS_API_KEY");
  const res = await fetch(`${base()}/v1/sound-generation?output_format=mp3_44100_128`, { method: "POST", headers: { "xi-api-key": key, "content-type": "application/json", "user-agent": UA }, body: JSON.stringify({ text: prompt, duration_seconds: Math.min(22, Math.max(0.5, seconds)), prompt_influence: 0.4 }), signal: AbortSignal.timeout(120000) });
  if (!res.ok) throw new Error(`ElevenLabs SFX HTTP ${res.status} ${(await res.text()).slice(0, 160)}`);
  return { file: save(out, Buffer.from(await res.arrayBuffer())), vendor: "elevenlabs/sound-generation", licence: "vendor plan at generation time", caveat: CAVEATS.elevenlabs, prompt, date: new Date().toISOString() };
}
export async function stableAudio({ prompt, seconds, out }) {
  const key = need(KEY.stable(), "STABILITY_API_KEY");
  const form = new FormData();
  form.set("prompt", String(prompt).slice(0, 900));
  form.set("duration", String(Math.min(190, Math.max(1, Math.ceil(seconds)))));
  form.set("output_format", "mp3");
  const res = await fetch("https://api.stability.ai/v2beta/audio/stable-audio-2/text-to-audio", { method: "POST", headers: { authorization: `Bearer ${key}`, accept: "audio/*", "user-agent": UA }, body: form, signal: AbortSignal.timeout(600000) });
  if (!res.ok) throw new Error(`Stable Audio HTTP ${res.status} ${(await res.text()).slice(0, 160)}`);
  return { file: save(out, Buffer.from(await res.arrayBuffer())), vendor: "stability/stable-audio-2", licence: "Stability terms at generation time", caveat: CAVEATS.stable, prompt, date: new Date().toISOString() };
}
// CC0 only: the licence filter is applied by Freesound and checked again on every result. The HQ preview is used (an original needs the person's OAuth login).
export async function freesoundSfx({ query, out, minS = 0.2, maxS = 6 }) {
  const token = need(KEY.freesound(), "FREESOUND_API_KEY");
  const u = new URL("https://freesound.org/apiv2/search/text/");
  u.searchParams.set("query", query);
  u.searchParams.set("filter", `license:"Creative Commons 0" duration:[${minS} TO ${maxS}]`);
  u.searchParams.set("fields", "id,name,username,license,url,duration,previews");
  u.searchParams.set("sort", "rating_desc");
  u.searchParams.set("page_size", "5");
  u.searchParams.set("token", token);
  const res = await fetch(u, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`Freesound HTTP ${res.status}`);
  const hit = ((await res.json()).results || []).find((r) => /publicdomain\/zero|Creative Commons 0/i.test(r.license) && r.previews && r.previews["preview-hq-mp3"]);
  if (!hit) throw new Error(`Freesound: no CC0 result for "${query}"`);
  const a = await fetch(hit.previews["preview-hq-mp3"], { headers: { "user-agent": UA }, signal: AbortSignal.timeout(60000) });
  if (!a.ok) throw new Error(`Freesound preview HTTP ${a.status}`);
  return { file: save(out, Buffer.from(await a.arrayBuffer())), vendor: "freesound", licence: "CC0-1.0", caveat: CAVEATS.freesound, url: hit.url, id: hit.id, title: hit.name, author: hit.username, duration: hit.duration, prompt: query, date: new Date().toISOString() };
}
// A local ACE-Step install, run as a separate process so its Python stack (PyTorch, never librosa/numba here) cannot take this process down.
// ACESTEP_CMD is an executable (a wrapper script the person wrote or the project's CLI) taking: --prompt <text> --duration <s> --out <wav> [--lyrics <file>].
export async function aceStep({ prompt, seconds, out, lyrics }) {
  const cmd = need(KEY.acestep(), "ACESTEP_CMD").split(/\s+/);
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  const argv = [...cmd.slice(1), "--prompt", prompt, "--duration", String(Math.round(seconds)), "--out", out];
  if (lyrics) { const lf = out + ".lyrics.txt"; fs.writeFileSync(lf, lyrics); argv.push("--lyrics", lf); }
  const r = spawnSync(cmd[0], argv, { encoding: "utf8", timeout: 20 * 60 * 1000, maxBuffer: 1 << 26, env: { ...process.env, PYTORCH_ENABLE_MPS_FALLBACK: "1" } });
  if (r.status !== 0 || !fs.existsSync(out)) throw new Error(`ACE-Step failed: ${(r.stderr || r.error || "").toString().trim().split("\n").slice(-2).join(" ").slice(0, 200)}`);
  return { file: out, vendor: "ace-step/local", licence: "per the installed model card", caveat: CAVEATS.acestep, prompt, date: new Date().toISOString() };
}

// ---- local-gen: ACE-Step 1.5 (MIT) in ~/.cache/rasanai/acestep-venv, Python 3.12 made by uv. Never the system Python (librosa/numba on 3.14 crashes this Mac).
export const localGen = (() => {
  const HOME = path.join(os.homedir(), ".cache", "rasanai");
  const VENV = process.env.ACESTEP_VENV || path.join(HOME, "acestep-venv");
  const MODELS = path.join(HOME, "acestep-models"), SRC = path.join(HOME, "acestep-src");
  const RUNNER = path.join(path.dirname(fileURLToPath(import.meta.url)), "acestep_run.py");
  const py = () => path.join(VENV, process.platform === "win32" ? "Scripts" : "bin", process.platform === "win32" ? "python.exe" : "python");
  const REQUIRED = ["acestep-v15-turbo", "vae", "Qwen3-Embedding-0.6B", "acestep-5Hz-lm-0.6B"];
  const hasWeights = (d) => { try { return fs.readdirSync(path.join(MODELS, d)).some((f) => /\.(safetensors|bin)$/.test(f)); } catch { return false; } };
  const cleanEnv = () => { const e = { ...process.env, PYTHONNOUSERSITE: "1", PYTHONDONTWRITEBYTECODE: "1", PYTHONUNBUFFERED: "1", PYTORCH_ENABLE_MPS_FALLBACK: "1", TOKENIZERS_PARALLELISM: "false" }; delete e.PYTHONPATH; delete e.PYTHONHOME; return e; };
  const status = () => {
    if (process.env.LOCALGEN_DISABLE === "1") return { installed: false, why: "LOCALGEN_DISABLE=1" };
    if (process.platform !== "darwin" && !fs.existsSync(py())) return { installed: false, why: "not installed" };
    const missing = []; if (!fs.existsSync(py())) missing.push("venv"); if (!fs.existsSync(path.join(SRC, "acestep"))) missing.push("source"); for (const d of REQUIRED) if (!hasWeights(d)) missing.push(d);
    return missing.length ? { installed: false, why: "missing: " + missing.join(", ") } : { installed: true, venv: VENV, models: MODELS };
  };
  const available = () => status().installed;
  // node scripts/music.mjs local-setup: uv venv on Python 3.12, the MIT source, the turbo DiT + VAE + text encoder + 0.6B planner (about 7.6 GB of weights, 1.3 GB of packages)
  function setup({ log = (m) => process.stderr.write(m + "\n") } = {}) {
    const uv = ["/opt/homebrew/bin/uv", "/usr/local/bin/uv"].find((p) => fs.existsSync(p)) || "uv";
    if (spawnSync(uv, ["--version"], { encoding: "utf8" }).status !== 0) return { ok: false, steps: ["install uv: brew install uv", "node scripts/music.mjs local-setup"] };
    fs.mkdirSync(HOME, { recursive: true });
    const run = (cmd, a, o = {}) => { log("local-setup: " + [path.basename(cmd), ...a].join(" ").slice(0, 140)); const r = spawnSync(cmd, a, { stdio: ["ignore", "inherit", "inherit"], env: cleanEnv(), ...o }); if (r.status !== 0) throw new Error(`${path.basename(cmd)} ${a[0]} failed`); };
    try {
      if (!fs.existsSync(path.join(SRC, "acestep"))) run("git", ["clone", "--depth", "1", "https://github.com/ace-step/ACE-Step-1.5", SRC]);
      if (!fs.existsSync(py())) run(uv, ["venv", "--python", "3.12", VENV]);
      if (spawnSync(py(), ["-I", "-c", "import acestep"], { env: cleanEnv() }).status !== 0) run(uv, ["pip", "install", "-p", py(), "-e", SRC]);
      const code = "from huggingface_hub import snapshot_download as s,sys;d=sys.argv[1]\ns('ACE-Step/Ace-Step1.5',local_dir=d,allow_patterns=['acestep-v15-turbo/*','vae/*','Qwen3-Embedding-0.6B/*','config.json'])\ns('ACE-Step/acestep-5Hz-lm-0.6B',local_dir=d+'/acestep-5Hz-lm-0.6B')";
      if (REQUIRED.some((d) => !hasWeights(d))) run(py(), ["-c", code.replace("snapshot_download as s,sys", "snapshot_download as s\nimport sys"), MODELS]);
    } catch (e) { return { ok: false, error: e.message }; }
    return { ok: available(), ...status() };
  }
  // one runner call = one model load, then `count` candidates (seeds spaced). job: {caption, lyrics, instrumental, bpm, keyscale, duration, count, seed, out_dir, name}
  function generate(job, { timeout = 40 * 60 * 1000 } = {}) {
    const st = status(); if (!st.installed) throw new Error("local-gen is not installed (" + st.why + "): node scripts/music.mjs local-setup");
    fs.mkdirSync(job.out_dir, { recursive: true });
    const jf = path.join(job.out_dir, `.${job.name || "cand"}.job.json`);
    fs.writeFileSync(jf, JSON.stringify(job));
    const r = spawnSync(py(), ["-I", RUNNER, jf], { encoding: "utf8", timeout, maxBuffer: 1 << 26, env: cleanEnv(), cwd: SRC });
    const line = String(r.stdout || "").trim().split("\n").filter((l) => l.startsWith("{")).pop();
    if (r.status !== 0 || !line) throw new Error("local-gen failed: " + String(r.stderr || r.error || "").trim().split("\n").slice(-2).join(" ").slice(0, 300));
    return JSON.parse(line);
  }
  return { HOME, VENV, MODELS, SRC, status, available, setup, generate };
})();

// ---- the prompt builder: "generate long, then edit to picture". ACE-Step has no timestamps and only roughly obeys section lengths, so the clip is made
// LONGER than the film (film + extra, 15-30 s) with a clear section plan (intro, [verse], build, drop/chorus, breakdown, final chorus, outro) at the asked BPM.
// scripts/lib/music-edit.mjs then maps the take (bars, downbeats, energy) and cuts the sections that fit the arc onto the picture's marks.
// What ACE-Step 1.5's own prompt guide (docs/en/Tutorial.md) says works, and what this builder does with it:
//   - the CAPTION carries the whole story in one voice (style, mood, BPM, instruments, vocal type, the section-by-section energy), the LYRICS field carries only structure tags and sung text, and the two must agree
//   - short section tags with ONE modifier ("[Chorus - explosive]", "[Breakdown - low energy]"), never stacked tags (the model sings them as lyrics); blank line between sections
//   - [Drop] / [Build] / [Breakdown] are real tags; energy words ([low energy] [building energy] [explosive]) give the contrast; instrumental sections say [Instrumental]
//   - singing: 6-10 syllables a line, one line per ~2 bars, the hook sung twice (repeated inside a long chorus and again in the final chorus), uppercase in the chorus for intensity, no energy modifier on a verse (a "soft" verse was mumbled), language set (vocal_language), a vocal descriptor in the caption (voice type, "clear crisp diction"), bpm + 4/4 as an anchor
//   - duration: the vocal sections get at least 2 bars per line, and the whole clip stays under about 60 s (30-60 s is the stable range; longer repeats)
//   buildLocalPrompt({arc, film, bpm, mood, style, lyrics, mode, narrated, exclusions, extra, voice, language}) -> {caption, lyrics, instrumental, bpm, duration, language, timesignature, sections, notes}
export function buildLocalPrompt({ arc, film, bpm = 120, mood = "", style = "", lyrics = "", mode = "instrumental-arc", narrated = false, exclusions = [], keyscale = "", extra = 20, voice = "", language = "en" } = {}) {
  const T = Math.max(10, Math.round(Number(film) || 30));
  bpm = Math.max(60, Math.min(180, Math.round(Number(bpm) || 120)));
  const a = arc || {};
  const bar = 240 / bpm;
  const G = T + Math.max(15, Math.min(30, Number(extra) || 20));
  const total = Math.max(12, 2 * Math.round(G / bar / 2));
  const song = mode === "song-lyric" && String(lyrics).trim();
  const lines = String(lyrics || "").split(/\n+/).map((l) => l.trim().replace(/^\[.*\]$/, "")).filter(Boolean);
  const hasBreak = Array.isArray(a.break) && a.break.length === 2 && Number(a.break[1]) > Number(a.break[0]);
  // sections in order: [kind, tag, weight, min bars]; the verse exists only for a song (its first lines), a build always, a breakdown always (it is the film's breath before the end card)
  const plan = song && lines.length >= 2
    ? [["intro", "Intro - low energy", 0.08, 2], ["verse", "Verse", 0.14, 4], ["build", "Build - building energy", 0.06, 2], ["drop", "Chorus - explosive", 0.24, 4], ["break", "Breakdown - low energy", 0.1, 2], ["payoff", "Final Chorus - explosive", 0.24, 4], ["outro", "Outro - one last hit", 0.08, 2]]
    : [["intro", "Intro - low energy", 0.12, 2], ["build", "Build - building energy", 0.14, 2], ["drop", song ? "Chorus - explosive" : "Drop - explosive", 0.26, 4], ["break", "Breakdown - low energy", 0.12, 2], ["payoff", song ? "Final Chorus - explosive" : "Final Drop - explosive", 0.26, 4], ["outro", "Outro - one last hit", 0.1, 2]];
  const split = song && lines.length >= 2 ? Math.ceil(lines.length / 2) : 0;
  const verseLines = split ? lines.slice(0, split) : [], hookLines = split ? lines.slice(split) : song ? lines : [];
  const sec = plan.map(([kind, tag, w, min]) => ({ kind, tag, bars: Math.max(min, 2 * Math.round((w * total) / 2)) }));
  const need = (k, n) => { const s = sec.find((x) => x.kind === k); if (s && n) s.bars = Math.max(s.bars, Math.max(4, 2 * n)); };
  need("verse", verseLines.length); need("drop", hookLines.length); need("payoff", hookLines.length);
  // bring the bar count back to the target by trimming/growing the two big sections (the drop and the final chorus), never under their minimums
  const sum = () => sec.reduce((x, s) => x + s.bars, 0);
  const big = ["drop", "payoff"].map((k) => sec.find((s) => s.kind === k));
  for (let g = 0; sum() !== total && g < 200; g++) { const s = big[g % 2], d = total > sum() ? 2 : -2; const floor = Math.max(4, 2 * (hookLines.length || 0)); if (s.bars + d >= floor) s.bars += d; else if (sum() - total > 0 && g > 20) break; }
  let t0 = 0;
  for (const s of sec) { s.from = +t0.toFixed(2); t0 += s.bars * bar; s.to = +t0.toFixed(2); }
  const duration = Math.ceil(t0);
  const notes = [];
  const syl = (l) => (l.toLowerCase().match(/[aeiouy]+/g) || []).length;
  for (const l of lines) if (song && syl(l) > 10) notes.push("lyric line over 10 syllables (the guide says 6-10; a long line is rushed or dropped): " + l);
  const parts = sec.map((s) => {
    const head = "[" + s.tag + "]";
    if (song && s.kind === "verse" && verseLines.length) return [head, ...verseLines].join("\n");
    if (song && (s.kind === "drop" || s.kind === "payoff") && hookLines.length) { const hk = hookLines.map((l) => l.toUpperCase()), rep2 = s.bars >= 4 * hk.length; /* the hook sung twice in a long section: about 2 bars a line sings clearly, 4 bars a line is stretched into vowels */ return [head, ...hk, ...(rep2 ? hk : [])].join("\n"); }
    return head + "\n[Instrumental]";
  });
  const contrast = ["a sparse intro, one soft pad and a quiet pulse, no drums", "a rising build with a riser and filtered drums", "a massive full-band drop, heavy kick, deep bass and a bright lead, much louder than the intro", "a stripped breakdown with only pads and air, drums out, far quieter", "a huge final chorus, even bigger than the first, ending on one clean final hit"];
  const vox = voice || "female vocal, clear crisp diction, confident, catchy hook";
  const langName = { en: "English", es: "Spanish", fr: "French", de: "German", hi: "Hindi", ja: "Japanese", ko: "Korean", zh: "Chinese", pt: "Portuguese", it: "Italian" }[language] || language;
  const cap = [style || "modern electronic pop launch film score", mood, bpm + " BPM, 4/4, steady tempo", ...contrast, song ? vox + ", sung in " + langName + ", lyrics clearly sung and easy to understand" : "instrumental, no vocals", "clean modern production, wide stereo, tight low end", ...(exclusions || []).slice(0, 4).map((x) => "no " + x)].filter(Boolean).join(", ");
  return { caption: cap.slice(0, 900), lyrics: parts.join("\n\n"), instrumental: !song, bpm, keyscale, timesignature: "4", language, duration, sections: sec.map((s) => ({ ...s, seconds: +(s.bars * bar).toFixed(1) })), notes: song ? [...notes, lines.length + " lyric lines: " + verseLines.length + " in the verse, " + hookLines.length + " in the chorus, sung again in the final chorus; force-align afterwards: node scripts/vo.mjs lyrics --track <song> --lyrics <file> --out <dir>"] : notes };
}
