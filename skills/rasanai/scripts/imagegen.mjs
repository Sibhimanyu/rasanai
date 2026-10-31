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
//        An existing <out> is kept (the result says "skipped": true) unless --force, or its sidecar hash (prompt + aspect + transparency +
//        model + the reference files' bytes) no longer matches the request: a changed prompt or reference regenerates the plate ("stale": true;
//        --keep-stale keeps it). Sidecars from before the hash existed are kept as they are.
//        --transparent: an opaque PNG (no alpha: the tool ignored the ask) is regenerated once on a flat #00FF00 and keyed (colorkey + despill),
//        and every transparent result has alpha >= 250 snapped to 255. Identical bytes from two parallel runs (a collision) are regenerated once.
//   node imagegen.mjs batch (--plan <images.json> | --world <art/world.json>) [--concurrency 3] [--only id,id] [--force]
//     --world: the film's world bible (lib/world-bible.mjs): the anchor is made first, then the character/object sheets (`needs`), then every shot, each with the anchor (and its sheets) as --ref
//     plan: {aspect, style, avoid, refs: [...], anchor?: "<id>", images: [{id, prompt, out, aspect?, refs?, needs?: [id], transparent?}]}
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
import crypto from "node:crypto";
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

export function buildInstruction({ prompt, aspect, w, h, refs, transparent, part, keyed = false }) {
  return [
    "Use your built-in image generation tool to create exactly one image. Do not write code, do not call an API or run a Python script, do not ask questions, and do not touch any other file.",
    refs.length ? (refs.length > 1 ? "The attached images are references for style, palette and composition. They are not edit targets: make a new image." : "The attached image is a reference for style, palette and composition. It is not an edit target: make a new image.") : "",
    `Image to create: ${prompt}`,
    `Aspect ratio: ${aspectWords(aspect, w, h)}.`,
    /sprite[\s-]?sheet/i.test(String(prompt)) ? "This is a sprite sheet: use a flat chroma-green background (#00FF00), an equal grid of cells with the same size and spacing, one pose or state per cell, and no text, labels, numbers or grid lines." : "",
    keyed ? "Draw the subject alone on a perfectly flat, solid, pure green background (#00FF00, chroma-key green) that fills the whole frame: no shadow, no floor, no gradient, no vignette, no green light or reflections on the subject, and no green anywhere in the subject. Do not try to make the background transparent." : transparent ? "Use a plain transparent background (the subject alone, no backdrop, no shadow plane)." : "",
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
    ? `format=rgba,scale=${w}:${h}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black@0,setsar=1,format=rgba,lutrgb=a='if(gte(val,250),255,val)'`
    : `scale=${w}:${h}:force_original_aspect_ratio=increase:flags=lanczos,crop=${w}:${h},setsar=1`;
  const tmp = dest.replace(/(\.[a-z0-9]+)$/i, ".norm$1");
  const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-i", src, "-vf", vf, "-frames:v", "1", ...(/\.jpe?g$/i.test(dest) ? ["-q:v", "2"] : []), tmp], { encoding: "utf8" });
  if (r.status !== 0 || !fs.existsSync(tmp)) throw new Error(`ffmpeg could not normalise the image: ${(r.stderr || "").trim().split("\n").pop()}`);
  fs.renameSync(tmp, dest);
}

// ------------------------------------------------------------------ plate identity, transparency, collisions
const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");
const md5File = (p) => crypto.createHash("md5").update(fs.readFileSync(p)).digest("hex");
// what makes a plate THIS plate: the full prompt, aspect, transparency, an explicitly asked model, and the bytes of every reference
function plateHash({ fullPrompt, aspect, transparent, model, refs }) {
  const r = refs.map((f) => { try { return [path.basename(f), sha256(fs.readFileSync(f))]; } catch { return [path.basename(f), "missing"]; } });
  return sha256(JSON.stringify({ p: String(fullPrompt).trim(), a: aspectKey(aspect), t: !!transparent, m: model || "", r })).slice(0, 16);
}
const readSide = (outAbs) => { try { return JSON.parse(fs.readFileSync(outAbs + ".json", "utf8")); } catch { return {}; } };
// share of pixels with alpha < 250 (null when ffmpeg could not read it)
function transparentShare(p) {
  const r = spawnSync("ffmpeg", ["-v", "error", "-i", p, "-vf", "format=rgba,alphaextract,scale=480:-2:flags=area,format=gray", "-frames:v", "1", "-f", "rawvideo", "-"], { maxBuffer: 1 << 24 });
  if (r.status !== 0 || !r.stdout || !r.stdout.length) return null;
  let n = 0; for (const v of r.stdout) if (v < 250) n++;
  return n / r.stdout.length;
}
const OPAQUE_BELOW = 0.003, KEYED_MIN = 0.02;
// key a flat #00FF00 ground out: colorkey, then despill the green off the edges (the colours are not recoloured anywhere else)
function keyGreen(src, dest) {
  const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-i", src, "-vf", "format=rgba,colorkey=color=0x00FF00:similarity=0.28:blend=0.1,format=gbrap,despill=type=green,format=rgba", "-frames:v", "1", dest], { encoding: "utf8" });
  return r.status === 0 && fs.existsSync(dest);
}
// parallel runs that return the same bytes: another plate of this process, or a sibling sidecar in the folder, already holds this md5
const SEEN = new Map();
function collision(md5, outAbs) {
  const o = SEEN.get(md5);
  if (o && o !== outAbs) return o;
  try {
    for (const f of fs.readdirSync(path.dirname(outAbs))) {
      if (!f.endsWith(".json")) continue;
      const other = path.join(path.dirname(outAbs), f.slice(0, -5));
      if (other === outAbs || !fs.existsSync(other)) continue;
      let j; try { j = JSON.parse(fs.readFileSync(path.join(path.dirname(outAbs), f), "utf8")); } catch { continue; }
      if (j && j.md5 === md5) return other;
    }
  } catch {}
  return null;
}

// ------------------------------------------------------------------ generate one image
// opts: {prompt, fullPrompt?, out, aspect, refs[], transparent, model?, timeout, force, id?}
async function generateOne(o) {
  const outAbs = path.resolve(o.out);
  const label = o.id || path.basename(outAbs);
  const side = outAbs + ".json";
  const fullPrompt = o.fullPrompt || o.prompt;
  const refs = (o.refs || []).map((r) => path.resolve(r));
  const hash = plateHash({ fullPrompt, aspect: o.aspect, transparent: !!o.transparent, model: o.model || "", refs });
  if (!o.force && fs.existsSync(outAbs) && fs.statSync(outAbs).size > 0) {
    const meta = readSide(outAbs);
    const stale = !!meta.hash && meta.hash !== hash;
    if (!stale || args["keep-stale"]) {
      const d = dims(outAbs);
      return { ok: true, skipped: true, ...(stale ? { stale: true } : {}), ...(meta.hash ? {} : { hash_known: false }), out: outAbs, ...d, raw: rawPath(outAbs), seconds: meta.seconds ?? 0, model: meta.model ?? null, session: meta.session ?? null, log: null };
    }
    err(`IMAGE ${label} is stale (its prompt, aspect, model or reference images changed since it was made): regenerating`);
  }
  const bin = findCodex(ENV);
  const [w, h] = normalizeAspect(o.aspect).split("x").map(Number);
  const aspect = aspectKey(o.aspect);
  const dir = path.dirname(outAbs);
  fs.mkdirSync(dir, { recursive: true });
  const part = outAbs + ".part.png";
  const logFile = outAbs.replace(/\.[a-z0-9]+$/i, "") + ".codex.log";
  for (const r of refs) if (!fs.existsSync(r)) return { ok: false, error: `reference image not found: ${r}`, out: outAbs };
  let keyedMode = false;
  let instruction = buildInstruction({ prompt: fullPrompt, aspect, w, h, refs, transparent: !!o.transparent, part });

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
        const md5 = md5File(raw);
        const other = collision(md5, outAbs);
        if (other) throw new Error(`the image is byte-identical to ${path.basename(other)} (two parallel runs returned the same file)`);
        const notes = [];
        let from = raw;
        if (o.transparent) {
          const share = transparentShare(raw);
          if (!keyedMode && share !== null && share < OPAQUE_BELOW) {
            // the tool ignored "transparent" and drew a ground: ask again on flat green and key it
            keyedMode = true;
            err(`IMAGE ${label} came back opaque for a transparent ask: regenerating on a flat #00FF00 to key`);
            instruction = buildInstruction({ prompt: fullPrompt, aspect, w, h, refs, transparent: false, keyed: true, part });
            const e = new Error("regen-green"); e.regen = true; throw e;
          }
          if (keyedMode) {
            const kf = raw.replace(/\.raw\.png$/, ".keyed.png");
            const ks = keyGreen(raw, kf) ? transparentShare(kf) : null;
            if (ks !== null && ks >= KEYED_MIN) { from = kf; notes.push("keyed from a flat #00FF00 plate (the tool returned an opaque image for the transparent ask)"); }
            else notes.push("WARNING: transparent was asked but the image is opaque and keying it failed (no flat green to remove): this plate has a background");
          }
        }
        normalise(from, outAbs, w, h, !!o.transparent);
        if (from !== raw) try { fs.rmSync(from, { force: true }); } catch {}
        try { fs.rmSync(part, { force: true }); } catch {}
        SEEN.set(md5, outAbs);
        const seconds = Math.round((Date.now() - t0) / 1000);
        const d = dims(outAbs);
        fs.writeFileSync(side, JSON.stringify({ prompt: o.prompt, full_prompt: fullPrompt, model, refs, aspect, transparent: !!o.transparent, hash, md5, ...(keyedMode ? { keyed: true } : {}), ...(notes.length ? { notes } : {}), seconds, session: r.session, created: new Date().toISOString() }, null, 2));
        if (!o.model) rememberModel(model, ENV);
        return { ok: true, out: outAbs, ...d, raw, seconds, model, session: r.session, log: logFile, ...(keyedMode ? { keyed: true } : {}), ...(notes.length ? { notes } : {}) };
      } catch (e) { if (e.regen) continue; lastErr = e.message; }
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
  if (args.world && args.world !== true) { // a world bible (art/world.json): its plan is written beside it, anchor first, sheets before the shots that need them
    const { loadWorld, batchPlan } = await import("./lib/world-bible.mjs");
    const wp = path.resolve(args.world), world = loadWorld(wp);
    const bp = wp.replace(/\.json$/i, "") + ".batch.json";
    fs.writeFileSync(bp, JSON.stringify(batchPlan(world, path.dirname(path.dirname(wp)), bp), null, 2));
    args.plan = bp;
  }
  if (!args.plan || args.plan === true) fail("batch needs --plan <images.json> (or --world <art/world.json>)");
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
  const anchorOut = plan.anchor ? rel(plan.images.find((i) => i.id === plan.anchor).out) : null;
  // `needs: [id]` = another image of the plan that is a reference for this one (a character or object sheet): made before it, passed as --ref
  const needFiles = (im) => (im.needs || []).map((id) => { const o = plan.images.find((x) => x.id === id); return o ? rel(o.out) : null; }).filter(Boolean);
  const needed = new Set(plan.images.flatMap((i) => i.needs || []));
  const refsOf = (im, anchorFile) => [...new Set([...(plan.refs || []).map(rel), ...(im.refs || []).map(rel), ...needFiles(im), ...(anchorFile && im.id !== plan.anchor ? [anchorFile] : [])])];
  const missingOut = (im) => !fs.existsSync(rel(im.out)) || fs.statSync(rel(im.out)).size === 0;
  const anchorRedo = !!plan.anchor && !args["keep-stale"] && wanted.some((im) => im.id === plan.anchor) && (force || missingOut(plan.images.find((i) => i.id === plan.anchor)) || isStale(plan.images.find((i) => i.id === plan.anchor), null));
  // a plate whose sidecar hash no longer matches its prompt / aspect / transparency / references is stale (an older sidecar with no hash is kept)
  function isStale(im, anchorFile) {
    if (args["keep-stale"]) return false;
    const meta = readSide(rel(im.out));
    return !!meta.hash && meta.hash !== plateHash({ fullPrompt: full(im), aspect: im.aspect || plan.aspect, transparent: !!im.transparent, model: "", refs: refsOf(im, anchorFile) });
  }
  const staleIds = [];
  const todo = wanted.filter((im) => {
    if (force || missingOut(im)) return true;
    const st = (anchorRedo && im.id !== plan.anchor && fs.existsSync(rel(im.out)) && !!readSide(rel(im.out)).hash) || isStale(im, anchorOut && fs.existsSync(anchorOut) ? anchorOut : null);
    if (st) staleIds.push(im.id);
    return st;
  });
  if (staleIds.length) err(`BATCH ${staleIds.length} stale plate(s) (prompt, references or anchor changed): ${staleIds.join(", ")}`);
  const skipped = wanted.filter((im) => !todo.includes(im)).map((im) => ({ id: im.id, out: rel(im.out) }));
  if (todo.length) requireReady();
  const done = [], failed = [];
  err(`BATCH ${todo.length} image(s) to make, ${skipped.length} skipped, concurrency ${conc}`);

  const make = async (im, extraRefs) => {
    const refs = [...(plan.refs || []).map(rel), ...(im.refs || []).map(rel), ...needFiles(im).filter((f) => fs.existsSync(f)), ...extraRefs];
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
  const runPool = async (list) => {
    let next = 0;
    const worker = async () => {
      while (next < list.length) {
        const im = list[next++];
        await make(im, anchorFile && im !== anchorIm ? [anchorFile] : []);
      }
    };
    await Promise.all(Array.from({ length: Math.min(conc, list.length) }, worker));
  };
  await runPool(queue.filter((im) => needed.has(im.id))); // sheets first, so the shots that need them can use them as references
  await runPool(queue.filter((im) => !needed.has(im.id)));

  const resultPath = planPath.replace(/\.json$/i, "") + ".result.json";
  const result = { ok: failed.length === 0, plan: planPath, result: resultPath, done, skipped, ...(staleIds.length ? { stale_regenerated: staleIds } : {}), failed, finished: new Date().toISOString() };
  // --concept <concept.json> (with --world): write each plate's path into the shots that use it (shot.image), so the story board and style frames show the real plate
  if (args.concept && args.concept !== true && args.world && args.world !== true) {
    try {
      const { loadWorld, linkShotImages } = await import("./lib/world-bible.mjs");
      const wp = path.resolve(args.world), cp = path.resolve(args.concept), cj = JSON.parse(fs.readFileSync(cp, "utf8"));
      const target = Array.isArray(cj.shots) ? cj : cj.concept && Array.isArray(cj.concept.shots) ? cj.concept : null;
      if (target) {
        const r = linkShotImages(target, loadWorld(wp), path.dirname(path.dirname(wp)), { force: !!args.relink });
        fs.writeFileSync(cp, JSON.stringify(cj, null, 2));
        result.shots_linked = r.linked.length; if (r.unknown.length) result.unknown_shots = r.unknown;
        fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));
      } else err("--concept has no shots[]; nothing linked");
    } catch (e) { err(`could not link plates into the concept: ${e.message}`); }
  }
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
