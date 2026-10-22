#!/usr/bin/env node
// The speech transcriber (whisper.cpp's whisper-cli + a ggml model): check it, install it for real, prove it works.
//
//   node transcriber.mjs status  [--model <name>]                       is a working transcriber installed? (never installs)
//   node transcriber.mjs install [--model small|small.en|...] [--reason-file <path>]
//                                                                      install whatever is missing, then PROVE it by transcribing a
//                                                                      1 s silent wav. Exit 0 only when that worked.
//
// Output: one JSON line on stdout {ready, whisper, model, step, reason}. Exit 0 ready, 3 not ready (reason says why, in plain words).
// Progress goes to stderr. Run `install` ONLY after the person said yes; if it exits 3, tell them the reason and ask whether to
// retry or continue without transcripts. A failed install is never a reason to carry on silently (references/workflows/routes/footage.md, footage reels).
// Used by the director (background + poll: the model download is about 466 MB) and by RasanAI Studio's tool setup.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { whisperBin, hasWhisperCli, installedModels, MODEL_DIRS } from "./lib/lang.mjs";

const args = (() => { const o = { _: [] }; const a = process.argv.slice(2); for (let i = 0; i < a.length; i++) { if (a[i].startsWith("--")) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith("--") ? a[++i] : true; } else o._.push(a[i]); } return o; })();
const cmd = args._[0] || "status";
const home = os.homedir();
const managedBin = path.join(home, "Library", "Application Support", "RasanAI", "Tools", "bin");
const say = (m) => process.stderr.write(m + "\n");
const SIZES = { "small": 466e6, "small.en": 487e6, "base": 142e6, "base.en": 142e6 };
const wantModel = typeof args.model === "string" ? args.model.replace(/^ggml-|\.bin$/g, "") : "small";

function which(name) {
  const dirs = [...(process.env.PATH || "").split(path.delimiter), managedBin, "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"];
  return dirs.map((d) => path.join(d, name)).find((p) => { try { fs.accessSync(p, fs.constants.X_OK); return true; } catch { return false; } });
}
function tail(r) { return String((r && (r.stderr || r.stdout)) || (r && r.error && r.error.message) || "").trim().split("\n").filter(Boolean).slice(-2).join(" | ").slice(0, 300); }
function modelChoice() {
  const have = installedModels().filter((m) => !/-q\d/.test(m.name));
  return have.find((m) => m.name === wantModel) || have.find((m) => m.multilingual) || have[0] || null;
}

// proves the pair works: whisper-cli loads the model and reads a 1 s silent wav. Returns null when fine, else the reason.
function prove(bin, model) {
  const ff = which("ffmpeg");
  if (!ff) return "ffmpeg is not installed, so the transcriber could not be tested";
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rasanai-whisper-"));
  try {
    const wav = path.join(tmp, "silence.wav");
    const g = spawnSync(ff, ["-v", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=16000:cl=mono", "-t", "1", "-c:a", "pcm_s16le", wav], { encoding: "utf8" });
    if (g.status !== 0) return "could not make the test sound: " + tail(g);
    const r = spawnSync(bin, ["-m", model, "-f", wav, "-ojf", "-of", path.join(tmp, "out"), "-np"], { encoding: "utf8", timeout: 180000, maxBuffer: 64 * 1024 * 1024 });
    if (r.status !== 0 || !fs.existsSync(path.join(tmp, "out.json"))) return `whisper-cli could not run the model (${path.basename(model)}): ${tail(r) || "no output"}`;
    return null;
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

function finish(o) {
  if (args["reason-file"] && o.reason) try { fs.writeFileSync(String(args["reason-file"]), o.reason); } catch {}
  console.log(JSON.stringify(o));
  process.exit(o.ready ? 0 : 3);
}

function status(install) {
  const bin = hasWhisperCli() ? whisperBin() : null;
  const model = modelChoice();
  return { bin, model: model && model.file };
}

async function download(url, dest, minBytes) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const part = dest + ".part";
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) throw new Error(`the download answered HTTP ${res.status}`);
  const total = Number(res.headers.get("content-length")) || 0;
  const out = fs.createWriteStream(part);
  let got = 0, last = 0;
  try {
    for await (const chunk of res.body) {
      if (!out.write(chunk)) await new Promise((ok) => out.once("drain", ok));
      got += chunk.length;
      if (got - last > 20e6) { last = got; say(`Downloading the speech model: ${Math.round(got / 1e6)}${total ? " of " + Math.round(total / 1e6) : ""} MB`); }
    }
    await new Promise((ok, bad) => out.end((e) => (e ? bad(e) : ok())));
  } catch (e) { out.destroy(); fs.rmSync(part, { force: true }); throw e; }
  if (got < minBytes || (total && got < total)) { fs.rmSync(part, { force: true }); throw new Error(`the download stopped early (${Math.round(got / 1e6)} MB)`); }
  fs.renameSync(part, dest);
}

if (cmd === "status") {
  const s = status();
  if (!s.bin) finish({ ready: false, whisper: null, model: s.model, step: "whisper-cli", reason: "the transcriber program (whisper-cli) is not installed" });
  if (!s.model) finish({ ready: false, whisper: s.bin, model: null, step: "model", reason: "no speech model is installed" });
  const bad = prove(s.bin, s.model);
  finish({ ready: !bad, whisper: s.bin, model: s.model, step: bad ? "verify" : "done", reason: bad || undefined });
} else if (cmd === "install") {
  let { bin, model } = status();
  // 1. the program
  if (!bin) {
    const brew = which("brew");
    const problems = [];
    if (brew) {
      say("Installing whisper-cpp with Homebrew (a minute or two)...");
      const r = spawnSync(brew, ["install", "whisper-cpp"], { encoding: "utf8", timeout: 900000, env: { ...process.env, HOMEBREW_NO_AUTO_UPDATE: "1", HOMEBREW_NO_ENV_HINTS: "1" } });
      if (r.status !== 0) problems.push("Homebrew could not install whisper-cpp: " + tail(r));
      bin = hasWhisperCli() ? whisperBin() : null;
    } else problems.push("Homebrew is not installed");
    if (!bin) {
      const git = which("git"), cmake = which("cmake");
      const dir = path.join(home, ".cache", "hyperframes", "whisper", "whisper.cpp");
      if (git && cmake) {
        say("Building whisper.cpp from source (a few minutes)...");
        fs.mkdirSync(path.dirname(dir), { recursive: true });
        let r = fs.existsSync(path.join(dir, "CMakeLists.txt")) ? { status: 0 } : spawnSync(git, ["clone", "--depth", "1", "https://github.com/ggml-org/whisper.cpp.git", dir], { encoding: "utf8", timeout: 300000, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
        if (r.status === 0) r = spawnSync(cmake, ["-B", "build", "-DCMAKE_BUILD_TYPE=Release"], { cwd: dir, encoding: "utf8", timeout: 300000 });
        if (r.status === 0) r = spawnSync(cmake, ["--build", "build", "--config", "Release", "-j"], { cwd: dir, encoding: "utf8", timeout: 1800000 });
        if (r.status !== 0) problems.push("building whisper.cpp failed: " + tail(r));
        bin = hasWhisperCli() ? whisperBin() : null;
      } else problems.push(`building it needs ${[!git && "git", !cmake && "cmake"].filter(Boolean).join(" and ")}, which ${!git && !cmake ? "are" : "is"} not installed`);
    }
    if (!bin) finish({ ready: false, whisper: null, model: model && model.file, step: "whisper-cli", reason: "The transcriber program could not be installed: " + problems.join("; ") + ". Install it yourself with `brew install whisper-cpp` (install Homebrew first from https://brew.sh if needed), then retry." });
  }
  // 2. the model
  if (!model) {
    const dest = path.join(MODEL_DIRS()[0], `ggml-${wantModel}.bin`);
    say(`Downloading the speech model ggml-${wantModel} (about ${Math.round((SIZES[wantModel] || 466e6) / 1e6)} MB)...`);
    try { await download(`https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${wantModel}.bin`, dest, (SIZES[wantModel] || 40e6) * 0.9); }
    catch (e) { finish({ ready: false, whisper: bin, model: null, step: "model", reason: `The speech model could not be downloaded: ${e.message || e}. Check the internet connection (huggingface.co must be reachable), then retry.` }); }
    model = { file: dest };
  }
  // 3. proof
  const bad = prove(bin, model.file);
  finish({ ready: !bad, whisper: bin, model: model.file, step: bad ? "verify" : "done", reason: bad ? "The transcriber is installed but does not work: " + bad : undefined });
} else {
  console.error("usage: transcriber.mjs status|install [--model small] [--reason-file <path>]");
  process.exit(1);
}
