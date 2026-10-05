#!/usr/bin/env node
// Image generation through the Codex CLI on the user's ChatGPT plan (no API key). Zero dependencies (Node >= 20, ffmpeg).
// Each image is one `codex exec` run of Codex's built-in image tool (~1.5 min). JSON on stdout, progress on stderr.
//
//   node imagegen.mjs status [--kv]
//     -> {ok, state: "ready"|"off"|"no-codex"|"signed-out", codex, auth, model, models, reason}   (exit 0 always)
//        --kv prints one line: IMAGEGEN=<state> IMAGEGEN_MODEL=<model> IMAGEGEN_CODEX=<path>
//        never runs `codex exec`; RASANAI_IMAGEGEN=off turns it off; RASANAI_CODEX_BIN picks the binary
//   node imagegen.mjs generate (--prompt "<text>" | --prompt-file <f>) --out <file.png>
//        [--aspect 16:9|9:16|1:1|4:5|WxH] [--ref a.png,b.png] [--transparent] [--model <id>] [--timeout 600] [--force]
//     -> {ok, out, width, height, raw, seconds, model, session, log}
//        writes <out> (cover-cropped to 1920x1080 / 1080x1920 / 1080x1080 / 1080x1350 / WxH), <name>.raw.png (as
//        Codex made it), <out>.json (prompt, full_prompt, model, refs, aspect, seconds, session, created).
//        An existing <out> is kept (the result says "skipped": true) unless --force.
//   node imagegen.mjs batch --plan <images.json> [--concurrency 3] [--only id,id] [--force]
//     plan: {aspect, style, avoid, refs: [...], anchor?: "<id>", images: [{id, prompt, out, aspect?, refs?, transparent?}]}
//     -> writes <plan minus .json>.result.json and prints {ok, result, done: [{id,out,seconds}], skipped: [...], failed: [{id,error}]}
//        full prompt = "<prompt>. Style: <style>. Avoid: <avoid>."; existing outs are skipped unless --force; the anchor
//        image is made first and passed as an extra reference to every other image. Paths are relative to the plan.
//   node imagegen.mjs sheet --plan <images.json> --out <sheet.jpg>     contact sheet of every image, labelled with its id
//
// Exit codes: 0 ok; 1 usage or internal error; 2 a generation failed after its retry (batch: any failed);
// 3 image generation unavailable (state is not "ready").
//
// How Codex is driven (verified against codex-cli 0.149):
//   codex exec -m <model> --skip-git-repo-check -s workspace-write -C <out dir> [-i ref ...] -   (the prompt is stdin)
// The prompt goes on stdin with "-" BEFORE the -i flags: -i takes several values and would swallow a trailing prompt.
// Codex saves the image to $CODEX_HOME/generated_images/<session id>/ and, asked to, copies it to <out>.part.png.
// A model the ChatGPT account does not support moves on to the next candidate (lib/codex.mjs imageModels) and the
// working one is remembered in $RASANAI_HOME/imagegen.json.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { spawn, spawnSync } from "node:child_process";
import { parseArgs, normalizeAspect, ASPECTS } from "./lib/common.mjs";
import { findCodex, codexHome, imageModels, loginStatus, rememberModel, forgetModel, rememberedModel } from "./lib/codex.mjs";

const args = parseArgs();
const cmd = args._[0];
const ENV = process.env;
const err = (s) => process.stderr.write(s + "\n");
const out = (o) => process.stdout.write(JSON.stringify(o, null, 2) + "\n");
function fail(msg, code = 1) { err(`PROBLEM: ${msg}`); process.exit(code); }
const MODEL_ERR = /not supported when using Codex with a ChatGPT account|model[^\n]{0,80}not found|does not exist|unknown model|invalid model|model_not_found/i;

// ------------------------------------------------------------------ status
function status() {
  const models = imageModels(ENV);
  const base = { codex: null, auth: null, model: models[0] || null, models };
  if (/^(off|0|false|no)$/i.test(ENV.RASANAI_IMAGEGEN || "")) return { ok: false, state: "off", ...base, reason: "RASANAI_IMAGEGEN=off: image generation is switched off" };
  const bin = findCodex(ENV);
  if (!bin) return { ok: false, state: "no-codex", ...base, reason: "the Codex CLI was not found: npm install -g @openai/codex, then codex login (or set RASANAI_CODEX_BIN)" };
  const st = loginStatus(bin, ENV);
  if (!st.signed_in) return { ok: false, state: "signed-out", ...base, codex: bin, reason: "Codex is not signed in: run codex login and choose ChatGPT" };
  return { ok: true, state: "ready", ...base, codex: bin, auth: st.auth, reason: `signed in with ${st.auth === "chatgpt" ? "ChatGPT" : "an API key"}` };
}

function requireReady() {
  const s = status();
  if (!s.ok) { err(`PROBLEM: image generation is unavailable (${s.state}): ${s.reason}`); out(s); process.exit(3); }
  return s;
}

// ------------------------------------------------------------------ small helpers
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function splitList(v) { return v === true || v == null ? [] : String(v).split(",").map((s) => s.trim()).filter(Boolean); }
function isPng(p) {
  try { const fd = fs.openSync(p, "r"); const b = Buffer.alloc(8); fs.readSync(fd, b, 0, 8, 0); fs.closeSync(fd); return b.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) && fs.statSync(p).size > 100; } catch { return false; }
}
function dims(p) {
  const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", p], { encoding: "utf8" });
  const m = String(r.stdout).trim().match(/^(\d+)x(\d+)/);
  return m ? { width: +m[1], height: +m[2] } : { width: 0, height: 0 };
}
function aspectWords(a, w, h) {
  const named = { "16:9": "landscape 16:9 widescreen", "9:16": "portrait 9:16 vertical", "1:1": "square 1:1", "4:5": "portrait 4:5" };
  if (named[a]) return named[a];
  const r = w / h;
  return `${r > 1.05 ? "landscape" : r < 0.95 ? "portrait" : "square"} ${w}:${h} (width to height ${r.toFixed(2)})`;
}
function aspectKey(a) { const s = String(a || "16:9").trim().toLowerCase(); return ASPECTS[s] ? s : s; }

export function buildInstruction({ prompt, aspect, w, h, refs, transparent, part }) {
  return [
    "Use your built-in image generation tool to create exactly one image. Do not write code, do not call an API or run a Python script, do not ask questions, and do not touch any other file.",
    refs.length ? (refs.length > 1 ? "The attached images are references for style, palette and composition. They are not edit targets: make a new image." : "The attached image is a reference for style, palette and composition. It is not an edit target: make a new image.") : "",
    `Image to create: ${prompt}`,
    `Aspect ratio: ${aspectWords(aspect, w, h)}.`,
    transparent ? "Use a plain transparent background (the subject alone, no backdrop, no shadow plane)." : "",
    `When the image is generated, copy the generated PNG file to exactly this path: ${part}`,
    "Reply with only that path.",
  ].filter(Boolean).join("\n\n");
}

// children are killed with the CLI (Ctrl-C, or the Director stopping it): no orphaned Codex runs on the user's plan
const LIVE = new Set();
const killAll = () => { for (const pid of LIVE) { try { process.kill(-pid, "SIGKILL"); } catch {} } };
process.on("exit", killAll);
for (const sg of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sg, () => { killAll(); process.exit(130); });

// run codex once; resolves {code, timedOut, log, session}
function runCodex({ bin, model, dir, refs, instruction, timeout, logFile }) {
  return new Promise((resolve) => {
    const a = ["exec", "-m", model, "--skip-git-repo-check", "-s", "workspace-write", "-C", dir];
    a.push("-"); // the prompt is stdin; before -i, which would swallow it
    for (const r of refs) a.push("-i", r);
    const fd = fs.openSync(logFile, "w");
    const child = spawn(bin, a, { cwd: dir, env: ENV, detached: true, stdio: ["pipe", fd, fd] });
    LIVE.add(child.pid);
    let timedOut = false, done = false;
    const killGroup = (sig) => { try { process.kill(-child.pid, sig); } catch { try { child.kill(sig); } catch {} } };
    const t = setTimeout(() => { timedOut = true; killGroup("SIGTERM"); setTimeout(() => killGroup("SIGKILL"), 4000).unref(); }, timeout * 1000);
    const finish = (code) => {
      if (done) return; done = true; clearTimeout(t); LIVE.delete(child.pid);
      killGroup("SIGKILL"); // stragglers of the group (tool subprocesses)
      try { fs.closeSync(fd); } catch {}
      let log = ""; try { log = fs.readFileSync(logFile, "utf8"); } catch {}
      const m = log.match(/session id:\s*([0-9a-zA-Z-]{8,})/i);
      resolve({ code, timedOut, log, session: m ? m[1] : null });
    };
    child.on("error", (e) => { try { fs.appendFileSync(logFile, `spawn error: ${e.message}\n`); } catch {} finish(-1); });
    child.on("close", (code) => finish(code));
    child.stdin.on("error", () => {});
    child.stdin.end(instruction);
  });
}

function newestPng(dir, since) {
  let best = null;
  try {
    for (const f of fs.readdirSync(dir)) {
      if (!/\.png$/i.test(f)) continue;
      const p = path.join(dir, f), st = fs.statSync(p);
      if (st.mtimeMs < since - 2000 || !isPng(p)) continue;
      if (!best || st.mtimeMs > best.m) best = { p, m: st.mtimeMs };
    }
  } catch {}
  return best && best.p;
}

// the image a run made: the file we asked for, else the newest PNG of ITS OWN session folder (never "newest anywhere")
function retrieve({ part, session, since }) {
  if (isPng(part)) return part;
  if (session) return newestPng(path.join(codexHome(ENV), "generated_images", session), since);
  return null;
}

// cover-crop and scale to w x h (lanczos); transparent output is padded, never cropped
function normalise(src, dest, w, h, transparent) {
  const vf = transparent
    ? `format=rgba,scale=${w}:${h}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black@0,setsar=1`
    : `scale=${w}:${h}:force_original_aspect_ratio=increase:flags=lanczos,crop=${w}:${h},setsar=1`;
  const tmp = dest.replace(/(\.[a-z0-9]+)$/i, ".norm$1");
  const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-i", src, "-vf", vf, "-frames:v", "1", ...(/\.jpe?g$/i.test(dest) ? ["-q:v", "2"] : []), tmp], { encoding: "utf8" });
  if (r.status !== 0 || !fs.existsSync(tmp)) throw new Error(`ffmpeg could not normalise the image: ${(r.stderr || "").trim().split("\n").pop()}`);
  fs.renameSync(tmp, dest);
}

// ------------------------------------------------------------------ generate one image
// opts: {prompt, fullPrompt?, out, aspect, refs[], transparent, model?, timeout, force, id?}
async function generateOne(o) {
  const outAbs = path.resolve(o.out);
  const label = o.id || path.basename(outAbs);
  const side = outAbs + ".json";
  if (!o.force && fs.existsSync(outAbs) && fs.statSync(outAbs).size > 0) {
    let meta = {}; try { meta = JSON.parse(fs.readFileSync(side, "utf8")); } catch {}
    const d = dims(outAbs);
    return { ok: true, skipped: true, out: outAbs, ...d, raw: rawPath(outAbs), seconds: meta.seconds ?? 0, model: meta.model ?? null, session: meta.session ?? null, log: null };
  }
  const bin = findCodex(ENV);
  const [w, h] = normalizeAspect(o.aspect).split("x").map(Number);
  const aspect = aspectKey(o.aspect);
  const dir = path.dirname(outAbs);
  fs.mkdirSync(dir, { recursive: true });
  const part = outAbs + ".part.png";
  const logFile = outAbs.replace(/\.[a-z0-9]+$/i, "") + ".codex.log";
  const refs = (o.refs || []).map((r) => path.resolve(r));
  for (const r of refs) if (!fs.existsSync(r)) return { ok: false, error: `reference image not found: ${r}`, out: outAbs };
  const fullPrompt = o.fullPrompt || o.prompt;
  const instruction = buildInstruction({ prompt: fullPrompt, aspect, w, h, refs, transparent: !!o.transparent, part });

  let candidates = o.model ? [o.model] : imageModels(ENV);
  const t0 = Date.now();
  let attempts = 0, retried = false, lastErr = "no attempt ran", lastLog = null;
  let mi = 0;
  while (mi < candidates.length) {
    const model = candidates[mi];
    attempts++;
    try { fs.rmSync(part, { force: true }); } catch {}
    const since = Date.now();
    const r = await runCodex({ bin, model, dir, refs, instruction, timeout: Number(o.timeout) || 600, logFile });
    lastLog = logFile;
    const src = retrieve({ part, session: r.session, since });
    if (src) {
      try {
        const raw = rawPath(outAbs);
        fs.copyFileSync(src, raw);
        normalise(raw, outAbs, w, h, !!o.transparent);
        try { fs.rmSync(part, { force: true }); } catch {}
        const seconds = Math.round((Date.now() - t0) / 1000);
        const d = dims(outAbs);
        fs.writeFileSync(side, JSON.stringify({ prompt: o.prompt, full_prompt: fullPrompt, model, refs, aspect, seconds, session: r.session, created: new Date().toISOString() }, null, 2));
        if (!o.model) rememberModel(model, ENV);
        return { ok: true, out: outAbs, ...d, raw, seconds, model, session: r.session, log: logFile };
      } catch (e) { lastErr = e.message; }
    } else if (MODEL_ERR.test(r.log)) {
      lastErr = `model ${model} is not usable on this account`;
      err(`IMAGE ${label} model ${model} rejected, trying the next`);
      if (model === rememberedModel(ENV)) forgetModel(ENV);
      mi++; continue;
    } else {
      lastErr = r.timedOut ? `Codex timed out after ${o.timeout || 600}s` : `Codex made no image (exit ${r.code}): ${tail(r.log)}`;
    }
    if (retried) break;
    retried = true; // one retry on any other failure, same model
    err(`IMAGE ${label} retrying: ${lastErr}`);
  }
  return { ok: false, error: lastErr, out: outAbs, log: lastLog, attempts };
}
const rawPath = (p) => p.replace(/\.[a-z0-9]+$/i, "") + ".raw.png";
function tail(log) {
  const lines = String(log).split("\n").map((s) => s.trim()).filter((s) => s && !/^(hook|SessionStart|Stop)/i.test(s));
  const e = lines.filter((l) => /error|fail|denied|refus|cannot|can't|unable|policy/i.test(l));
  return (e.length ? e : lines).slice(-2).join(" | ").slice(0, 300) || "no output";
}

// ------------------------------------------------------------------ commands
async function cmdGenerate() {
  let prompt = args.prompt;
  if (args["prompt-file"]) { try { prompt = fs.readFileSync(args["prompt-file"], "utf8").trim(); } catch (e) { fail(`cannot read --prompt-file: ${e.message}`); } }
  if (!prompt || prompt === true) fail("generate needs --prompt \"<text>\" or --prompt-file <file>");
  if (!args.out || args.out === true) fail("generate needs --out <file.png>");
  if (!args.force && fs.existsSync(args.out)) { /* skip path needs no codex */ } else requireReady();
  const res = await generateOne({ prompt, out: args.out, aspect: args.aspect, refs: splitList(args.ref), transparent: !!args.transparent, model: args.model && args.model !== true ? args.model : null, timeout: args.timeout, force: !!args.force });
  if (!res.ok) { err(`PROBLEM: ${res.error}`); out(res); process.exit(2); }
  out(res);
}

async function cmdBatch() {
  if (!args.plan || args.plan === true) fail("batch needs --plan <images.json>");
  const planPath = path.resolve(args.plan);
  let plan; try { plan = JSON.parse(fs.readFileSync(planPath, "utf8")); } catch (e) { fail(`cannot read plan ${args.plan}: ${e.message}`); }
  if (!Array.isArray(plan.images) || !plan.images.length) fail("the plan has no images[]");
  const base = path.dirname(planPath);
  const rel = (p) => path.resolve(base, p);
  const ids = new Set();
  for (const im of plan.images) {
    if (!im.id || !im.prompt || !im.out) fail(`every image needs id, prompt and out (got ${JSON.stringify(im).slice(0, 80)})`);
    if (ids.has(im.id)) fail(`duplicate image id "${im.id}"`);
    ids.add(im.id);
  }
  if (plan.anchor && !ids.has(plan.anchor)) fail(`anchor "${plan.anchor}" is not one of the images`);
  const only = new Set(splitList(args.only));
  for (const o of only) if (!ids.has(o)) fail(`--only names unknown image "${o}"`);
  const force = !!args.force;
  const conc = Math.max(1, Math.min(8, Number(args.concurrency) || 3));
  const full = (im) => {
    const p = String(im.prompt).trim().replace(/[.\s]+$/, "");
    return `${p}.${plan.style ? ` Style: ${String(plan.style).trim().replace(/[.\s]+$/, "")}.` : ""}${plan.avoid ? ` Avoid: ${String(plan.avoid).trim().replace(/[.\s]+$/, "")}.` : ""}`;
  };
  const wanted = plan.images.filter((im) => !only.size || only.has(im.id));
  const todo = wanted.filter((im) => force || !fs.existsSync(rel(im.out)) || fs.statSync(rel(im.out)).size === 0);
  const skipped = wanted.filter((im) => !todo.includes(im)).map((im) => ({ id: im.id, out: rel(im.out) }));
  if (todo.length) requireReady();
  const done = [], failed = [];
  err(`BATCH ${todo.length} image(s) to make, ${skipped.length} skipped, concurrency ${conc}`);

  const make = async (im, extraRefs) => {
    const refs = [...(plan.refs || []).map(rel), ...(im.refs || []).map(rel), ...extraRefs];
    const r = await generateOne({ id: im.id, prompt: im.prompt, fullPrompt: full(im), out: rel(im.out), aspect: im.aspect || plan.aspect, refs: [...new Set(refs)], transparent: !!im.transparent, timeout: args.timeout, force: true });
    if (r.ok) { done.push({ id: im.id, out: r.out, seconds: r.seconds, model: r.model }); err(`IMAGE ${im.id} done ${r.seconds}s`); }
    else { failed.push({ id: im.id, error: r.error }); err(`IMAGE ${im.id} failed ${r.error}`); }
    return r.ok;
  };

  let anchorFile = null;
  const anchorIm = plan.anchor && plan.images.find((i) => i.id === plan.anchor);
  let queue = todo;
  if (anchorIm) {
    if (todo.includes(anchorIm)) {
      const okA = await make(anchorIm, []);
      if (!okA) err(`anchor ${anchorIm.id} failed: the rest are made without it`);
      queue = todo.filter((i) => i !== anchorIm);
    }
    if (fs.existsSync(rel(anchorIm.out))) anchorFile = rel(anchorIm.out);
  }
  let next = 0;
  const worker = async () => {
    while (next < queue.length) {
      const im = queue[next++];
      await make(im, anchorFile && im !== anchorIm ? [anchorFile] : []);
    }
  };
  await Promise.all(Array.from({ length: Math.min(conc, queue.length) }, worker));

  const resultPath = planPath.replace(/\.json$/i, "") + ".result.json";
  const result = { ok: failed.length === 0, plan: planPath, result: resultPath, done, skipped, failed, finished: new Date().toISOString() };
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));
  out(result);
  process.exit(failed.length ? 2 : 0);
}

// ---- contact sheet (ffmpeg here has no drawtext, so the labels are drawn with a tiny 5x7 font into small PNGs)
const FONT = {
  A: "0e 11 11 1f 11 11 11", B: "1e 11 11 1e 11 11 1e", C: "0e 11 10 10 10 11 0e", D: "1e 11 11 11 11 11 1e", E: "1f 10 10 1e 10 10 1f",
  F: "1f 10 10 1e 10 10 10", G: "0e 11 10 17 11 11 0f", H: "11 11 11 1f 11 11 11", I: "0e 04 04 04 04 04 0e", J: "07 02 02 02 02 12 0c",
  K: "11 12 14 18 14 12 11", L: "10 10 10 10 10 10 1f", M: "11 1b 15 15 11 11 11", N: "11 11 19 15 13 11 11", O: "0e 11 11 11 11 11 0e",
  P: "1e 11 11 1e 10 10 10", Q: "0e 11 11 11 15 12 0d", R: "1e 11 11 1e 14 12 11", S: "0f 10 10 0e 01 01 1e", T: "1f 04 04 04 04 04 04",
  U: "11 11 11 11 11 11 0e", V: "11 11 11 11 11 0a 04", W: "11 11 11 15 15 15 0a", X: "11 11 0a 04 0a 11 11", Y: "11 11 0a 04 04 04 04",
  Z: "1f 01 02 04 08 10 1f", 0: "0e 11 13 15 19 11 0e", 1: "04 0c 04 04 04 04 0e", 2: "0e 11 01 02 04 08 1f", 3: "1f 02 04 02 01 11 0e",
  4: "02 06 0a 12 1f 02 02", 5: "1f 10 1e 01 01 11 0e", 6: "06 08 10 1e 11 11 0e", 7: "1f 01 02 04 08 08 08", 8: "0e 11 11 0e 11 11 0e",
  9: "0e 11 11 0f 01 02 0c", "-": "00 00 00 1f 00 00 00", _: "00 00 00 00 00 00 1f", ".": "00 00 00 00 00 0c 0c",
};
const CRC = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
function crc32(b) { let c = -1; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }
function labelPng(text, width, height, scale = 3) {
  const px = Buffer.alloc(width * height, 0x18); // dark grey ground
  let x0 = 6;
  for (const ch of String(text).toUpperCase()) {
    const g = FONT[ch];
    if (g) g.split(" ").forEach((hex, row) => { const bits = parseInt(hex, 16); for (let col = 0; col < 5; col++) if (bits & (1 << (4 - col))) for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) { const x = x0 + col * scale + dx, y = Math.floor((height - 7 * scale) / 2) + row * scale + dy; if (x < width && y < height) px[y * width + x] = 0xf0; } });
    x0 += 6 * scale;
  }
  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y++) px.copy(raw, y * (width + 1) + 1, y * width, (y + 1) * width);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

function cmdSheet() {
  if (!args.plan || args.plan === true) fail("sheet needs --plan <images.json>");
  if (!args.out || args.out === true) fail("sheet needs --out <sheet.jpg>");
  const planPath = path.resolve(args.plan);
  let plan; try { plan = JSON.parse(fs.readFileSync(planPath, "utf8")); } catch (e) { fail(`cannot read plan: ${e.message}`); }
  const base = path.dirname(planPath);
  const items = (plan.images || []).map((im) => ({ id: im.id, file: path.resolve(base, im.out) })).filter((i) => fs.existsSync(i.file));
  const missing = (plan.images || []).filter((im) => !fs.existsSync(path.resolve(base, im.out))).map((im) => im.id);
  if (!items.length) fail("none of the plan's images exist yet");
  const TW = 480, TH = 270, LH = 30, cols = Math.min(4, items.length), rows = Math.ceil(items.length / cols);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rasanai-sheet-"));
  const inputs = [], filters = [];
  items.forEach((it, i) => {
    const lp = path.join(tmp, `l${i}.png`);
    fs.writeFileSync(lp, labelPng(it.id, TW, LH));
    inputs.push("-i", it.file, "-i", lp);
    filters.push(`[${i * 2}:v]scale=${TW}:${TH}:force_original_aspect_ratio=decrease,pad=${TW}:${TH}:(ow-iw)/2:(oh-ih)/2:color=black,format=rgb24[t${i}]`, `[${i * 2 + 1}:v]format=rgb24[n${i}]`, `[t${i}][n${i}]vstack[c${i}]`);
  });
  const layout = items.map((_, i) => `${(i % cols) * TW}_${Math.floor(i / cols) * (TH + LH)}`).join("|");
  const chain = items.length === 1 ? `[c0]copy[o]` : `${items.map((_, i) => `[c${i}]`).join("")}xstack=inputs=${items.length}:layout=${layout}:fill=black[o]`;
  fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
  const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", ...inputs, "-filter_complex", [...filters, chain].join(";"), "-map", "[o]", "-frames:v", "1", ...(/\.jpe?g$/i.test(args.out) ? ["-q:v", "3"] : []), path.resolve(args.out)], { encoding: "utf8" });
  fs.rmSync(tmp, { recursive: true, force: true });
  if (r.status !== 0) fail(`ffmpeg could not build the sheet: ${(r.stderr || "").trim().split("\n").pop()}`);
  out({ ok: true, out: path.resolve(args.out), images: items.map((i) => i.id), missing, columns: cols, rows });
}

// ------------------------------------------------------------------ main
async function main() {
  if (cmd === "status") {
    const s = status();
    if (args.kv) { const q = (v) => (/\s/.test(v) ? JSON.stringify(v) : v); console.log(`IMAGEGEN=${s.state} IMAGEGEN_MODEL=${q(s.model || "")} IMAGEGEN_CODEX=${q(s.codex || "")}`); }
    else out(s);
    return;
  }
  if (cmd === "generate") return cmdGenerate();
  if (cmd === "batch") return cmdBatch();
  if (cmd === "sheet") return cmdSheet();
  fail("usage: imagegen.mjs status [--kv] | generate --prompt <text> --out <file> [--aspect --ref --transparent --model --timeout --force] | batch --plan <images.json> [--concurrency --only --force] | sheet --plan <images.json> --out <sheet.jpg>");
}
main().catch((e) => fail(`internal error: ${e && e.stack || e}`));
