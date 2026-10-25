#!/usr/bin/env node
// Reel editor: a folder of raw footage -> a cut sequence with motion-graphics cards
// between clips and overlays + captions on top, built as a HyperFrames composition
// and rendered by HyperFrames. Cards and overlays are drawn in the chosen look and
// motion personality, so they pass obey.mjs like every other RasanAI build.
// Formats: references/reel.md.
//
//   node reel.mjs scan  --footage <dir> --run <run dir> [--no-transcribe] [--lang auto|<iso>] [--model <ggml name or file>]
//        (the language is detected per clip with a multilingual whisper model when one is installed; never defaulted to an English-only model,
//         which translates other languages into English silently. Contact sheets hold one frame per ~6 s, 8 to 48 per clip.)
//        -> <run>/footage/footage.json (+ contact sheets, posters, word transcripts)
//   node reel.mjs briefs --reel <reel.json> --project-dir videos/<name>
//        -> compositions/cards/<id>.brief.md for every card/overlay Claude draws (the default; "by": "swatch" = quick engine draft)
//   node reel.mjs build --reel <reel.json> --project-dir videos/<name> [--prefs <rasanai-brief.json>] [--render] [--quality draft|looks|delivery] [--force] [--no-lint] [--render-anyway]
//        -> index.html + compositions/reel-*.html + assets/footage/*, lint, obey, (render)
//   node reel.mjs check-frames --reel <reel.json> --project-dir videos/<name> [--video <render.mp4>] [--every 0.5]
//        -> <project>/reel.frames-check.json: warnings where a graphic may cover a face or text sits under platform UI (needs footage.mjs faces; Apple Vision)
//        --prefs: the owner's taste answers win over reel.json: captions off | plain (style "clean") | styled (style "bold"); text=none warns about every overlay
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs, die, readJSON, writeFile, normalizeAspect, esc, gsapInline, chromeDumpDom, readLook, readFrontmatterDoc, SKILL_DIR } from "./lib/common.mjs";
import { resolvePreset } from "./lib/hyperframes.mjs";
import { checkSource, keptRanges, editedMap } from "./lib/cutplan.mjs";
import { stageFonts } from "./lib/fonts.mjs";
import { installLook, installDirection, upsertMarked, DIRECTION_MARK } from "./lib/install.mjs";
import { contractText } from "./lib/contract.mjs";
import { track } from "./lib/report.mjs";
import { acquireSlotSync } from "./lib/slot.mjs";
import { renderProcessEnv } from "./lib/containment.mjs"; // Plan 11 R8: render processes get a scrubbed environment
import { loadPrefs } from "./lib/prefs.mjs";
import { headsDuring, overlapShare } from "./lib/heads.mjs";
import { destinationOf, zonesFor, boxInZones } from "./lib/safezones.mjs";
import { checkFrames } from "./lib/framecheck.mjs";
import { decideLanguage, installedModels, hasWhisperCli, whisperTranscribe, englishLooks } from "./lib/lang.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = parseArgs();
const cmd = args._[0];
track(
  { scan: "Scanning your clips: length, sound, shot changes, what's said", briefs: "Writing a brief for each card and overlay", build: "Building the cut: conforming clips, placing cards, overlays and captions" }[cmd],
  { scan: "Clips scanned", briefs: "Card briefs written; Claude designs each card", build: "Cut built" }[cmd]
);
const VIDEO_EXT = /\.(mp4|mov|m4v|webm|mkv|avi|mts)$/i;
const MARK = "<!-- rasanai:reel -->";
const run = (bin, argv, opts = {}) => execFileSync(bin, argv, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024, ...opts });
const runErr = (bin, argv) => spawnSync(bin, argv, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).stderr || "";
const r3 = (v) => Math.round(v * 1000) / 1000;
const slug = (s) => String(s).toLowerCase().replace(/\.[^.]+$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "clip";

function need(bin) {
  try {
    run(bin, ["-version"]);
  } catch {
    die(`${bin} is required (install FFmpeg: brew install ffmpeg / apt install ffmpeg)`);
  }
}

// ---------------------------------------------------------------- probe
function probe(file) {
  let j;
  try {
    j = JSON.parse(run("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", file]));
  } catch (e) {
    return { file, error: `ffprobe could not read it: ${String(e.stderr || e.message).trim().split("\n").pop()}` };
  }
  const v = (j.streams || []).find((s) => s.codec_type === "video" && !(s.disposition && s.disposition.attached_pic));
  const a = (j.streams || []).find((s) => s.codec_type === "audio");
  if (!v) return { file, error: "no video stream" };
  const frac = (s) => {
    const [n, d] = String(s || "0/1").split("/").map(Number);
    return d ? n / d : n;
  };
  const rot = Number(((v.side_data_list || []).find((x) => x.rotation !== undefined) || {}).rotation ?? (v.tags && v.tags.rotate) ?? 0);
  const swap = Math.abs(rot) % 180 === 90;
  const duration = Number(j.format.duration || v.duration || 0);
  return {
    file,
    duration: r3(duration),
    width: swap ? v.height : v.width,
    height: swap ? v.width : v.height,
    rotation: rot,
    fps: r3(frac(v.avg_frame_rate) || frac(v.r_frame_rate)),
    codec: v.codec_name,
    has_audio: !!a,
    audio_lang: (a && a.tags && (a.tags.language || a.tags.LANGUAGE)) || null,
    size_mb: Math.round((Number(j.format.size || 0) / 1048576) * 10) / 10,
  };
}

// ---------------------------------------------------------------- scan
// Marker text: a clip with this transcript_error makes scan exit 3, so a missing transcriber can never pass as a normal scan.
const NO_TRANSCRIBER = "TRANSCRIBER NOT READY: no working whisper-cli + speech model, so nothing was transcribed. Ask the user once; only after a yes run `node $SKILL_DIR/scripts/transcriber.mjs install` (background, poll it), then re-run scan. If install fails, tell the user its reason and ask retry or continue without transcripts (--no-transcribe). Never choose that yourself.";
function scan() {
  if (!args.footage || !args.run) die("scan needs --footage <dir> and --run <run dir>");
  need("ffmpeg");
  const dir = path.resolve(String(args.footage));
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) die(`not a folder: ${args.footage}`);
  const files = [];
  (function walk(d, depth) {
    for (const f of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (f.name.startsWith(".")) continue;
      const p = path.join(d, f.name);
      if (f.isDirectory() && depth < 4) walk(p, depth + 1); // camera cards nest (PRIVATE/M4ROOT/CLIP, DCIM/100GOPRO)
      else if (VIDEO_EXT.test(f.name)) files.push(p);
    }
  })(dir, 0);
  if (!files.length) die(`no video files in ${dir} (looked for ${VIDEO_EXT.source})`);
  const out = path.resolve(String(args.run), "footage");
  fs.mkdirSync(out, { recursive: true });
  const ws = process.cwd();
  const rel = (p) => path.relative(ws, p);
  // the language is decided per clip, never defaulted: an English-only model translates other languages into English
  // without saying so (lib/lang.mjs). --lang <code> forces it; otherwise detected (multilingual model) or marked unverified.
  const lang = args.lang && args.lang !== true ? String(args.lang) : "auto";
  const model = args.model && args.model !== true ? String(args.model) : null;
  const warnings = [];
  const clips = [];
  const usedIds = new Set();
  for (const f of files) {
    const info = probe(f);
    let id = slug(path.basename(f));
    while (usedIds.has(id)) id += "-2";
    usedIds.add(id);
    const c = { id, name: path.relative(dir, f), path: rel(f), ...info };
    delete c.file;
    if (info.error) {
      clips.push(c);
      continue;
    }
    const D = info.duration;
    // contact sheet: evenly spaced frames, uniform 320x180 tiles. The count scales with the clip: one frame per ~6 s,
    // at least 8 and at most 48 (a 40-minute interview gets 48 frames, a 3 s shot gets 8)
    const nFrames = Math.max(8, Math.min(48, Math.ceil(D / 6)));
    const cols = nFrames <= 8 ? 4 : 6;
    const rows = Math.ceil(nFrames / cols);
    const sheet = path.join(out, `${id}-sheet.jpg`);
    try {
      run("ffmpeg", ["-y", "-loglevel", "error", "-i", f, "-vf", `fps=${(nFrames / Math.max(D, 0.5)).toFixed(6)},scale=320:180:force_original_aspect_ratio=decrease,pad=320:180:(ow-iw)/2:(oh-ih)/2:color=black,tile=${cols}x${rows}`, "-frames:v", "1", "-q:v", "4", sheet]);
      c.sheet = rel(sheet);
      c.sheet_times = Array.from({ length: nFrames }, (_, i) => r3((i * D) / nFrames));
      c.sheet_grid = `${cols}x${rows}`;
    } catch (e) {
      c.sheet_error = String(e.stderr || e.message).trim().split("\n").pop();
    }
    const poster = path.join(out, `${id}-poster.jpg`);
    try {
      run("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(r3(D * 0.3)), "-i", f, "-frames:v", "1", "-vf", "scale=640:-2", "-q:v", "4", poster]);
      c.poster = rel(poster);
    } catch {}
    // shot changes (downscaled for speed)
    const sc = runErr("ffmpeg", ["-hide_banner", "-i", f, "-vf", "scale=320:-2,select='gt(scene,0.35)',showinfo", "-an", "-f", "null", "-"]);
    c.scenes = [...sc.matchAll(/pts_time:([\d.]+)/g)].map((m) => r3(Number(m[1]))).filter((t) => t > 0.2 && t < D - 0.2);
    if (info.has_audio) {
      const si = runErr("ffmpeg", ["-hide_banner", "-i", f, "-af", "silencedetect=noise=-35dB:d=0.6", "-vn", "-f", "null", "-"]);
      const starts = [...si.matchAll(/silence_start: ([\d.]+)/g)].map((m) => Number(m[1]));
      const ends = [...si.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]));
      c.silences = starts.map((s, i) => [r3(s), r3(ends[i] ?? D)]);
      const mv = runErr("ffmpeg", ["-hide_banner", "-i", f, "-af", "volumedetect", "-vn", "-f", "null", "-"]).match(/mean_volume: (-?[\d.]+) dB/);
      c.mean_volume_db = mv ? Number(mv[1]) : null;
    }
    if (info.has_audio && !args["no-transcribe"] && !(c.mean_volume_db !== null && c.mean_volume_db < -50)) {
      const speechAt = c.silences && c.silences.length && c.silences[0][0] < 0.5 ? c.silences[0][1] : 0;
      const dec = decideLanguage({ file: f, lang, tag: info.audio_lang, duration: D, speechAt });
      c.lang = dec.lang;
      c.lang_verified = dec.verified;
      c.lang_source = dec.source;
      if (dec.warning && !warnings.includes(dec.warning)) warnings.push(dec.warning);
      if (dec.blocked) {
        c.transcript_error = dec.blocked;
        warnings.push(`${c.name}: not transcribed: ${dec.blocked}`);
      } else {
        try {
          let list;
          const modelFile = model && fs.existsSync(model) ? model : model ? (installedModels().find((m) => m.name === model.replace(/^ggml-|\.bin$/g, "")) || {}).file : (dec.model || {}).file;
          if (!(modelFile && hasWhisperCli()) && !args["allow-download"]) throw new Error(NO_TRANSCRIBER);
          if (modelFile && hasWhisperCli()) {
            const r = whisperTranscribe(f, { model: modelFile, lang: dec.lang });
            list = r.words.filter((w) => w.end > w.start).map((w) => ({ ...w, end: r3(Math.min(w.end, D)) }));
            c.model = r.model;
          } else {
            // no whisper-cli or no installed model: HyperFrames' own transcriber, with the model and language explicit
            const m = model || (dec.lang === "en" ? "small.en" : "small");
            const tdir = path.join(out, `${id}-transcript`);
            const argv = ["--yes", "hyperframes", "transcribe", f, "-d", tdir, "--json", "--model", m, "-l", dec.lang];
            run("npx", argv, { timeout: 1800000 });
            const words = readJSON(path.join(tdir, "transcript.json"));
            list = (Array.isArray(words) ? words : words.words || [])
              .map((w) => ({ text: String(w.text || w.word || "").trim(), start: r3(Number(w.start)), end: r3(Math.min(Number(w.end), D)) }))
              .filter((w) => w.text && !/^[♪♫]+$/.test(w.text) && w.end > w.start);
            c.model = m;
          }
          const wf = path.join(out, `${id}.words.json`);
          writeFile(wf, JSON.stringify(list, null, 1) + "\n");
          c.transcript = rel(wf);
          c.words = list.length;
          c.text = list.map((w) => w.text).join(" ");
          c.speech = list.length > 0 ? [list[0].start, list[list.length - 1].end] : null;
          if (dec.lang === "en" && !dec.verified) {
            const ck = englishLooks(c.text);
            if (!ck.ok) {
              c.transcript_warning = "this transcript does not read like English (" + JSON.stringify(ck) + "): the speech may be another language that an English-only model translated or garbled. Re-scan with --lang <code>.";
              warnings.push(`${c.name}: ${c.transcript_warning}`);
            }
          }
        } catch (e) {
          c.transcript_error = String(e.stderr || e.stdout || e.message).trim().split("\n").filter(Boolean).pop();
        }
      }
    }
    clips.push(c);
  }
  const result = { footage_dir: rel(dir), scanned_at: new Date().toISOString(), lang: args["no-transcribe"] ? null : lang, warnings, clips };
  writeFile(path.join(out, "footage.json"), JSON.stringify(result, null, 2) + "\n");
  // compact summary for the agent (full data is in footage.json)
  console.log(
    JSON.stringify(
      {
        footage: rel(path.join(out, "footage.json")),
        warnings: warnings.length ? warnings : undefined,
        clips: clips.map((c) => (c.error ? { id: c.id, name: c.name, error: c.error } : { id: c.id, name: c.name, duration: c.duration, size: `${c.width}x${c.height}`, fps: c.fps, audio: c.has_audio, lang: c.lang ?? null, lang_verified: c.lang_verified ?? null, words: c.words ?? null, text: c.text ? c.text.slice(0, 160) : null, scenes: c.scenes.length, sheet: c.sheet, transcript_error: c.transcript_error })),
      },
      null,
      2
    )
  );
  if (clips.some((c) => c.transcript_error === NO_TRANSCRIBER)) {
    console.error("\n" + NO_TRANSCRIBER);
    process.exitCode = 3;
  }
}

// ---------------------------------------------------------------- build
function personalityFor(motionPath, tmpDir) {
  const M = readFrontmatterDoc(fs.readFileSync(motionPath, "utf8")).fields;
  const id = M.personality === "custom" ? M.parent : M.personality;
  const out = path.join(tmpDir, "personality.json");
  const argv = [path.join(HERE, "motion-md.mjs"), "write", "--personality", id, "--out", path.join(tmpDir, "motion-check.md"), "--emit-personality", out];
  if ((M.adjustments || []).length) argv.push("--adjust", M.adjustments.join(","));
  run(process.execPath, argv);
  return { p: readJSON(out), M };
}

const TRANSITIONS = ["cut", "dissolve", "wipe"];
// the personality's own handoff when the reel says "auto"
function nativeTransition(p) {
  const t = (p.transitions || []).join(" ");
  if (/wipe|mask|grid-shift|push/.test(t)) return "wipe";
  if (/dissolve|crossfade/.test(t) && !(p.banned || []).includes("opacity-only-entrance")) return "dissolve";
  return "cut";
}

function zoneRect(zone, W, H) {
  const tall = H / W > 1.2;
  const Z = tall
    ? { top: [0.1, 0.22], center: [0.4, 0.56], "lower-third": [0.55, 0.65], captions: [0.67, 0.77] }
    : { top: [0.07, 0.22], center: [0.36, 0.64], "lower-third": [0.64, 0.8], captions: [0.83, 0.94] };
  const [a, b] = Z[zone] || Z["lower-third"];
  const x = zone === "lower-third" && !tall ? 0.05 : 0.06;
  const w = zone === "lower-third" && !tall ? 0.6 : 0.88;
  return { x: Math.round(W * x), y: Math.round(H * a), w: Math.round(W * w), h: Math.round(H * (b - a)) };
}

const cellCss = (look) => `
  #root .md-cell { --md-bg-c: ${look.bg}; --md-ink-c: ${look.ink}; --md-bg: var(--md-bg-c); --md-ink: var(--md-ink-c);
    position: absolute; overflow: hidden; color: var(--md-ink); display: grid; place-items: center; }
  #root .md-cell > .md-block { grid-area: 1 / 1; }
  #root .md-block { font-family: "${look.font}", Inter, ui-sans-serif, system-ui, sans-serif; font-weight: ${look.fontWeight};
    line-height: 1.02; letter-spacing: -0.02em; text-align: center; position: relative; will-change: transform; }
  #root .md-line { overflow: hidden; padding: 0.04em 0.06em; white-space: nowrap; }
  #root .md-line-in { display: block; }
  #root .md-word { display: inline-block; white-space: nowrap; }
  #root .md-char { display: inline-block; }
  #root .md-rule { height: max(2px, 0.045em); background: ${look.accent}; margin: 0.18em auto 0; width: 60%; transform: scaleX(0); }
  #root .md-cursor { display: inline-block; width: 0.5em; background: ${look.accent}; margin-left: 0.04em; }
  #root .md-subline { font-weight: 500; letter-spacing: 0.02em; line-height: 1.3; color: color-mix(in srgb, var(--md-ink) 78%, var(--md-bg)); }
  #root .md-rule + .md-subline { margin-top: 0.35em; }`;

// ---- face and platform-UI warnings (all warnings; unknown faces are never treated as safe)
const FACE_COVER = 0.02; // share of a head an overlay or the captions may cover (cooked. check.py FACE_COVER)
const PLATFORM_SHARE = 0.2;
// $RUN/footage/faces/<clip>.json for a clip reference: tries the reference as written, its file stem and a slug of it, then the footage.json clip id by path
function loadFaces(R, base, ws, ref, srcAbs, cache) {
  const fp = R.footage ? (path.isAbsolute(R.footage) ? R.footage : [base, ws].map((r) => path.resolve(r, R.footage)).find((p) => fs.existsSync(p)) || path.resolve(ws, R.footage)) : null;
  if (!fp) return null;
  const dirF = path.join(path.dirname(fp), "faces");
  const ids = new Set([String(ref), path.basename(String(ref)), path.basename(String(ref)).replace(/\.[^.]+$/, ""), slug(ref)]);
  try {
    const scanned = fs.existsSync(fp) ? readJSON(fp) : null;
    for (const c of (scanned && scanned.clips) || []) if (c.id && c.path && srcAbs && path.resolve(ws, c.path) === srcAbs) ids.add(c.id);
  } catch {}
  for (const id of ids) {
    const f = path.join(dirF, id + ".json");
    if (cache.has(f)) { if (cache.get(f)) return cache.get(f); continue; }
    let doc = null;
    try { if (fs.existsSync(f)) doc = readJSON(f); } catch {}
    cache.set(f, doc);
    if (doc) return doc;
  }
  return null;
}
// the clip pieces playing during [a, b] of the reel: [{ s, t0, t1 }] with source times
function clipsUnder(segs, a, b) {
  return segs.filter((x) => x.kind === "clip" && x.start < b && x.start + x.dur > a).map((x) => {
    const lo = Math.max(a, x.start), hi = Math.min(b, x.start + x.dur);
    return { s: x, t0: x.it._in + (lo - x.start) * x.rate, t1: x.it._in + (hi - x.start) * x.rate };
  });
}

// the brief Claude designs one card or overlay from (reel.mjs briefs)
function cardBrief(a, { W, H, look, fontCss, M, direction, reelTitle }) {
  const r = a.rect;
  const overlay = a.kind === "overlay";
  const text = [].concat(a.it.text || []);
  const place = overlay
    ? `An overlay on top of footage. Transparent background everywhere; the content lives inside the ${a.it.zone || "lower-third"} zone: x ${r.x}px, y ${r.y}px, ${r.w}×${r.h}px${a.it.style === "clear" ? " (no plate: legible over any footage, e.g. a soft text shadow)" : " (on a plate in the look's surface or canvas color)"}.`
    : "A full-frame card between clips: it owns the whole frame and its background (the look's canvas, or an art-directed ground from the direction).";
  return `# ${overlay ? "Overlay" : "Card"} brief: ${a.id}${reelTitle ? ` (${reelTitle})` : ""}

Design and animate this yourself, from the art direction and the motion contract below. Write \`compositions/cards/${a.id}.html\`: a HyperFrames sub-composition, ${W}×${H}, on screen for ${a.duration}s.

## What it says

${text.map((t, k) => `- Beat ${k + 1}: ${JSON.stringify(t)}`).join("\n")}${a.it.sub ? `\n- Second line: ${JSON.stringify(a.it.sub)}` : ""}

## Where it sits

${place}

## HyperFrames rules (the build refuses a file that breaks them)

- Everything inside \`<template>\`: styles, markup and scripts. The root is \`<div id="root" data-composition-id="${a.id}" data-width="${W}" data-height="${H}">\`; style it with \`#root\` (position: absolute; inset: 0).
- One paused timeline, registered as \`window.__timelines["${a.id}"]\`, at most ${a.duration}s long (the slot holds its last frame if shorter). Build it synchronously; \`gsap\` is global.
- Entrances with \`fromTo\` (the host re-seeks the card). No \`Math.random\`, \`Date\`, timers, CSS \`@keyframes\` or autoplay: every frame must come from the timeline.
- Fonts: copy these rules into the card's \`<style>\` (files are staged in assets/fonts/):

\`\`\`css
${fontCss || "/* the look's families are resolved by HyperFrames itself */"}
\`\`\`

## Look (frame.md tokens)

- canvas \`${look.bg}\`, ink \`${look.ink}\`, accent \`${look.accent}\`; display face ${look.font} ${look.fontWeight}. Full tokens: frame.md in the project root.

${direction ? direction.section : "## Art direction\n\nNo direction was compiled; follow the look and the motion contract."}
${M ? contractText(M, { W, H, video: true }) : ""}
## Scaffold

\`\`\`html
<!doctype html>
<html><head><meta charset="UTF-8" /></head>
<body>
<template>
<style>
  /* @font-face rules from above */
  #root { position: absolute; inset: 0; width: ${W}px; height: ${H}px; overflow: hidden; }
</style>
<div id="root" data-composition-id="${a.id}" data-width="${W}" data-height="${H}">
  <!-- your design -->
</div>
<script>
(function () {
  var tl = gsap.timeline({ paused: true });
  // your choreography, following the motion contract
  window.__timelines = window.__timelines || {};
  window.__timelines["${a.id}"] = tl;
})();
</script>
</template>
</body>
</html>
\`\`\`

After writing it, run \`reel.mjs build\`: obey.mjs checks this file against motion.md with everything else.
`;
}

// a card or overlay as a HyperFrames sub-composition, drawn by the tasting engine
function engineComp({ id, W, H, look, p, blocks, rect, background, plate, fontCss }) {
  const engine = fs.readFileSync(path.join(SKILL_DIR, "scripts", "lib", "engine.js"), "utf8");
  const blockHtml = blocks.map((b) => `<div class="md-block" data-content="${esc(b.text)}"${b.sub ? ` data-sub="${esc(b.sub)}"` : ""}></div>`).join("");
  const cellStyle = `left:${rect.x}px;top:${rect.y}px;width:${rect.w}px;height:${rect.h}px;${plate ? `background:${plate};border-radius:${Math.round(Math.min(rect.w, rect.h) * 0.08)}px;` : "--md-bg:transparent;"}${plate === null && !background ? "text-shadow:0 2px 18px rgba(0,0,0,.55);--md-ink:#ffffff;" : ""}`;
  return `<!doctype html>
<html>
<head><meta charset="UTF-8" /></head>
<body>
<template>
<style>
  ${fontCss}
  #root { position: absolute; inset: 0; width: ${W}px; height: ${H}px; overflow: hidden; ${background ? `background: ${background};` : ""} }
  ${cellCss(look)}
</style>
<div id="root" data-composition-id="${id}" data-width="${W}" data-height="${H}">
  <div class="md-cell" data-w="${rect.w}" data-h="${rect.h}" data-personality="${esc(p.id)}" style="${cellStyle}">${blockHtml}</div>
</div>
<script>
(function () {
  ${engine}
  var P = ${JSON.stringify(p)};
  var root = document.querySelector('[data-composition-id="${id}"]');
  var tl = gsap.timeline({ paused: true });
  window.MD.build(tl, root.querySelector(".md-cell"), P);
  window.__timelines = window.__timelines || {};
  window.__timelines["${id}"] = tl;
  document.documentElement.setAttribute("data-md-dur-${id}", String(tl.duration()));
})();
</script>
</template>
</body>
</html>
`;
}

// measure engine timelines in Chrome: one page per variant, all items at once
function measure(items, W, H, look, tmpDir, tag) {
  const engine = fs.readFileSync(path.join(SKILL_DIR, "scripts", "lib", "engine.js"), "utf8");
  const cells = items
    .map((it, i) => `<div class="md-cell" id="m${i}" data-w="${it.rect.w}" data-h="${it.rect.h}" style="left:0;top:0;width:${it.rect.w}px;height:${it.rect.h}px">${it.blocks.map((b) => `<div class="md-block" data-content="${esc(b.text)}"${b.sub ? ` data-sub="${esc(b.sub)}"` : ""}></div>`).join("")}</div>`)
    .join("");
  const html = `<!doctype html><html><head><meta charset="UTF-8">${gsapInline()}<style>#root{position:relative;width:${W}px;height:${H}px}${cellCss(look)}</style></head><body><div id="root">${cells}</div><script>${engine}</script><script>
var P=${JSON.stringify(items.map((it) => it.p))};var out=[];
document.querySelectorAll('#root .md-cell').forEach(function(c,i){var tl=gsap.timeline({paused:true});window.MD.build(tl,c,P[i]);out.push(tl.duration());});
document.body.setAttribute('data-durs',out.join(','));</script></body></html>`;
  const f = path.join(tmpDir, `measure-${tag}.html`);
  fs.writeFileSync(f, html);
  const m = chromeDumpDom(f, 8000).match(/data-durs="([^"]*)"/);
  if (!m) die("could not measure card timings in Chrome (a script error in the engine page?)", 1);
  return m[1].split(",").map(Number);
}

function captionsComp({ id, W, H, look, groups, style, total, fontCss }) {
  const tall = H / W > 1.2;
  const rect = zoneRect("captions", W, H);
  const size = Math.round((tall ? 0.068 : 0.036) * W);
  const bold = style !== "clean";
  const html = groups
    .map((g, i) => `<div class="cap" id="cap-${i}"><p class="line">${g.words.map((w, j) => `<span class="w" id="w-${i}-${j}">${esc(bold ? w.text.toUpperCase() : w.text)}</span>`).join(" ")}</p></div>`)
    .join("\n  ");
  const sets = [];
  groups.forEach((g, i) => {
    sets.push(`tl.set("#cap-${i}", { autoAlpha: 1 }, ${r3(g.in)});`, `tl.set("#cap-${i}", { autoAlpha: 0 }, ${r3(g.out)});`);
    if (bold) g.words.forEach((w, j) => sets.push(`tl.set("#w-${i}-${j}", { color: "${look.accent}" }, ${r3(Math.max(g.in, w.start))});`, `tl.set("#w-${i}-${j}", { color: "#ffffff" }, ${r3(Math.max(g.in, Math.min(w.end, g.out)))});`));
  });
  return `<!doctype html>
<html>
<head><meta charset="UTF-8" /></head>
<body>
<template>
<style>
  ${fontCss}
  #root { position: absolute; inset: 0; width: ${W}px; height: ${H}px; overflow: hidden; pointer-events: none; }
  #root .cap { position: absolute; left: ${rect.x}px; top: ${rect.y}px; width: ${rect.w}px; height: ${rect.h}px; display: flex; align-items: center; justify-content: center; text-align: center;
    font-family: "${look.font}", Inter, ui-sans-serif, system-ui, sans-serif; font-size: ${size}px; line-height: 1.1; visibility: hidden; opacity: 0;
    ${bold ? `font-weight: 800; letter-spacing: -0.01em; color: #ffffff; -webkit-text-stroke: ${Math.max(2, Math.round(size / 18))}px rgba(0,0,0,0.85); paint-order: stroke fill; text-shadow: 0 ${Math.round(size / 12)}px ${Math.round(size / 5)}px rgba(0,0,0,0.45);` : `font-weight: 600; color: ${look.ink};`} }
  ${bold ? "" : `#root .cap span.w { background: ${look.bg}; box-decoration-break: clone; -webkit-box-decoration-break: clone; padding: 0.06em 0.18em; }`}
</style>
<div id="root" data-composition-id="${id}" data-width="${W}" data-height="${H}">
  ${html}
</div>
<script>
(function () {
  var tl = gsap.timeline({ paused: true });
  ${sets.join("\n  ")}
  tl.set({}, {}, ${r3(total)});
  window.__timelines = window.__timelines || {};
  window.__timelines["${id}"] = tl;
})();
</script>
</template>
</body>
</html>
`;
}

// words -> caption groups (2-5 words, break on pauses >= 150ms and on length)
function groupWords(words, { maxWords, maxChars }) {
  const groups = [];
  let cur = [];
  const flush = () => {
    if (cur.length) groups.push({ words: cur });
    cur = [];
  };
  words.forEach((w, i) => {
    const prev = words[i - 1];
    const len = cur.map((x) => x.text).join(" ").length + w.text.length + 1;
    if (cur.length && (w.start - prev.end >= 0.15 || cur.length >= maxWords || len > maxChars || /[.!?]$/.test(prev.text))) flush();
    cur.push(w);
  });
  flush();
  groups.forEach((g, i) => {
    const next = groups[i + 1];
    g.in = Math.max(0, g.words[0].start - 0.08);
    if (i > 0) g.in = Math.max(g.in, groups[i - 1].out);
    const nextIn = next ? next.words[0].start - 0.08 : Infinity;
    g.out = Math.min(nextIn - 0.05 > g.in ? nextIn - 0.05 : Infinity, g.words[g.words.length - 1].end + 0.6);
    if (g.out - g.in < 0.5) g.out = Math.min(g.in + 0.5, next ? Math.max(nextIn, g.in + 0.5) : g.in + 0.5);
  });
  return groups;
}

async function build() {
  if (!args.reel || !args["project-dir"]) die("build needs --reel <reel.json> and --project-dir videos/<name>");
  need("ffmpeg");
  const reelPath = path.resolve(String(args.reel));
  const R = readJSON(reelPath);
  const base = path.dirname(reelPath);
  const ws = process.cwd();
  const resolveIn = (p, ...roots) => {
    if (!p) return null;
    if (path.isAbsolute(p)) return p;
    for (const r of roots) if (r && fs.existsSync(path.resolve(r, p))) return path.resolve(r, p);
    return path.resolve(ws, p);
  };
  const [W, H] = normalizeAspect(R.aspect || "9:16").split("x").map(Number);
  const prefNotes = [];
  if (args.prefs && args.prefs !== true) {
    let L;
    try { L = loadPrefs(String(args.prefs)); } catch (e) { die(e.message); }
    const c = L.prefs.captions;
    if (c) R.captions = { ...(R.captions || {}), on: c !== "off", ...(c === "plain" ? { style: "clean" } : c === "styled" ? { style: "bold" } : {}) };
    if (L.prefs.text === "none" && (R.overlays || []).length) prefNotes.push(`text=none: the reel has ${R.overlays.length} overlay(s); the owner wants no writing on screen (cards and overlays that carry words)`);
  }
  const FPS = Number(R.fps || 30);
  if (!(FPS >= 12 && FPS <= 120)) die("fps must be between 12 and 120");
  const footageDir = R.footage_dir ? resolveIn(R.footage_dir, base, ws) : null;
  const overlays = R.overlays || [];
  const problems = [];
  // type:"cut" items (a word-aligned cut decision file) expand into consecutive clip items, one per kept range
  const cutDocs = new Map(); // abs cut file -> { file, doc, segments, map, root }
  const items = [];
  (R.timeline || []).forEach((it, i) => {
    if (!it || it.type !== "cut") return items.push(it);
    const where = `timeline[${i}]${it.label ? ` (${it.label})` : ""}`;
    if (!it.cut) return problems.push(`${where}: a cut item needs cut: the path of a footage/cuts/<clip>.cut.json`);
    const file = resolveIn(it.cut, base, ws);
    if (!fs.existsSync(file)) return problems.push(`${where}: cut file not found: ${it.cut}`);
    if (it.join && !["cut", "dissolve"].includes(it.join)) problems.push(`${where}: join must be cut or dissolve`);
    let c = cutDocs.get(file);
    if (!c) {
      let doc;
      try { doc = readJSON(file); } catch (e) { return problems.push(`${where}: could not read ${it.cut}: ${e.message}`); }
      if (doc.schema !== "rasanai.cut.v1" || !Array.isArray(doc.words)) return problems.push(`${where}: ${it.cut} is not a rasanai.cut.v1 file`);
      const root = path.resolve(path.dirname(file), "..", "..");
      const srcAbs = resolveIn(doc.source && doc.source.path, footageDir, base, ws, root);
      const trAbs = doc.transcript && doc.transcript.file ? resolveIn(doc.transcript.file, root, base, ws) : null;
      const chk = checkSource(doc, { sourceFile: srcAbs && fs.existsSync(srcAbs) ? srcAbs : null, transcriptFile: trAbs && fs.existsSync(trAbs) ? trAbs : null });
      if (!chk.ok) return problems.push(...chk.problems.map((m) => `${where}: ${m}`));
      const kr = keptRanges(doc, { fps: FPS });
      if (!kr.segments.length) return problems.push(`${where}: ${kr.notes.join("; ") || "nothing is kept"}`);
      c = { file: path.relative(ws, file), doc, segments: kr.segments, map: editedMap(doc, kr.segments), root };
      cutDocs.set(file, c);
    }
    const { cut: _c, join, ...rest } = it;
    c.segments.forEach((sg, k) => items.push({ ...rest, type: "clip", clip: c.doc.source.path, in: sg.in, out: sg.out, transition_in: k === 0 ? it.transition_in : join || "cut", _cut: { file: c.file, clip: c.doc.clip, rev: c.doc.head, seg: k }, _cutRoot: c.root }));
  });
  if (!items.length) problems.push("timeline is empty");
  const clipsUsed = items.filter((it) => (it.type || "clip") === "clip");
  if (!clipsUsed.length) problems.push("the timeline has no footage clips (use the video routes for an all-graphics piece)");
  // who draws each card / overlay: Claude (default: authored from the brief `reel.mjs briefs` writes),
  // "swatch" (RasanAI's quick preview engine, for drafts), or a ready composition file (src)
  const cardsBy = R.cards_by || "claude";
  const authorOf = (x) => (x.src ? "src" : x.by || cardsBy);
  const needsMotion = items.some((it) => it.type === "card") || overlays.length || items.some((it) => it.transition_in && !/^(cut|auto)$/.test(it.transition_in));
  const motionPath = R.motion ? resolveIn(R.motion, base, ws) : null;
  if (needsMotion && (!motionPath || !fs.existsSync(motionPath))) problems.push(`motion.md not found (${R.motion || "reel.motion is missing"}): cards, overlays and transitions are drawn in the chosen motion`);
  const lookPath = R.look && R.look.frame ? resolveIn(R.look.frame, base, ws) : R.look && R.look.preset ? resolvePreset(R.look.preset) : null;
  const designMd = R.look && R.look.design_md ? resolveIn(R.look.design_md, base, ws) : null;
  if (lookPath && !fs.existsSync(lookPath)) problems.push(`look frame not found: ${R.look.frame}`);
  if (designMd && !fs.existsSync(designMd)) problems.push(`brand reference not found: ${R.look.design_md}`);
  const directionSrc = R.direction ? resolveIn(R.direction, base, ws) : null;
  if (directionSrc && !fs.existsSync(directionSrc)) problems.push(`direction not found: ${R.direction} (compile it with direction.mjs compile)`);
  const musicSrc = R.music && R.music.path ? resolveIn(R.music.path, base, ws) : null;
  if (musicSrc && !fs.existsSync(musicSrc)) problems.push(`music not found: ${R.music.path}`);

  const probes = {};
  items.forEach((it, i) => {
    const where = `timeline[${i}]${it.label ? ` (${it.label})` : ""}`;
    const type = it.type || "clip";
    if (type === "clip") {
      const src = resolveIn(it.clip, footageDir, base, ws, it._cutRoot);
      if (!src || !fs.existsSync(src)) return problems.push(`${where}: clip not found: ${it.clip}`);
      const info = (probes[src] = probes[src] || probe(src));
      if (info.error) return problems.push(`${where}: ${info.error}`);
      const a = Number(it.in ?? 0), b = Number(it.out ?? info.duration);
      if (!(a >= 0) || !(b > a)) problems.push(`${where}: in/out must satisfy 0 <= in < out (got ${it.in}..${it.out})`);
      if (b > info.duration + 0.05) problems.push(`${where}: out ${b}s is past the clip's end (${info.duration}s)`);
      if (it.rate && !(Number(it.rate) >= 0.25 && Number(it.rate) <= 4)) problems.push(`${where}: rate must be 0.25-4`);
      if (it.transition_in && !["auto", ...TRANSITIONS].includes(it.transition_in)) problems.push(`${where}: transition_in must be one of auto, ${TRANSITIONS.join(", ")}`);
      if (it.fit && !["cover", "contain", "blur"].includes(it.fit)) problems.push(`${where}: fit must be cover, contain or blur`);
      it._src = src;
      it._info = info;
      it._in = a;
      it._out = Math.min(b, info.duration);
    } else if (type === "card") {
      if (it.src) {
        const s = resolveIn(it.src, base, ws);
        if (!fs.existsSync(s)) problems.push(`${where}: card src not found: ${it.src}`);
        else if (!/data-composition-id="([^"]+)"/.test(fs.readFileSync(s, "utf8"))) problems.push(`${where}: card src has no data-composition-id`);
        else if (!/<template[\s>]/i.test(fs.readFileSync(s, "utf8"))) problems.push(`${where}: card src must be a sub-composition (everything inside <template>), not a standalone page`);
        else {
          const t = fs.readFileSync(s, "utf8");
          const cw = Number((t.match(/data-width="(\d+)"/) || [])[1]), ch = Number((t.match(/data-height="(\d+)"/) || [])[1]);
          if (cw && ch && (cw !== W || ch !== H)) problems.push(`${where}: card src is ${cw}x${ch} but the reel is ${W}x${H}; build the card at the reel's aspect`);
        }
        it._srcFile = s;
        if (!(Number(it.duration) > 0)) problems.push(`${where}: a src card needs a duration`);
      } else {
        if (!it.text || (Array.isArray(it.text) && !it.text.length)) problems.push(`${where}: a card needs text (or src: a composition file)`);
        if (!["claude", "swatch"].includes(authorOf(it))) problems.push(`${where}: by must be "claude" or "swatch"`);
        if (authorOf(it) === "claude" && !(Number(it.duration) > 0)) problems.push(`${where}: a card needs a duration`);
      }
    } else problems.push(`${where}: type must be clip, card or cut`);
  });
  overlays.forEach((o, i) => {
    if (!o.text) problems.push(`overlays[${i}]: text is required`);
    if (o.anchor != null) {
      const a = o.anchor;
      if (typeof a !== "object" || !a.cut || !a.word) problems.push(`overlays[${i}]: anchor needs cut (the cut file) and word (a word id)`);
      else {
        if (a.lead_s != null && !(Number(a.lead_s) >= 0)) problems.push(`overlays[${i}]: anchor.lead_s must be 0 or more`);
        if (!(Number(o.start) >= 0)) o.start = 0; // placeholder; the anchor sets the real start
      }
    } else if (!(Number(o.start) >= 0)) problems.push(`overlays[${i}]: start (seconds on the reel's timeline) is required`);
    if (o.zone && !["top", "center", "lower-third"].includes(o.zone)) problems.push(`overlays[${i}]: zone must be top, center or lower-third`);
    if (!["claude", "swatch"].includes(authorOf(o))) problems.push(`overlays[${i}]: by must be "claude" or "swatch"`);
    if (authorOf(o) === "claude" && !(Number(o.duration) > 0)) problems.push(`overlays[${i}]: an overlay needs a duration`);
  });
  if (R.captions && R.captions.words_per_group != null && !(Number.isInteger(R.captions.words_per_group) && R.captions.words_per_group >= 1 && R.captions.words_per_group <= 6)) problems.push("captions.words_per_group must be an integer 1-6 (words shown per caption group)");
  if (R.reference_profile != null && (typeof R.reference_profile !== "string" || !fs.existsSync(resolveIn(R.reference_profile, base, ws)))) problems.push("reference_profile must be the path of an existing reference/profile.json (its caption density sets the group size)");
  if (problems.length) die(`reel.json has ${problems.length} problem(s):\n- ${problems.join("\n- ")}`);

  // ---- project
  const dir = path.resolve(String(args["project-dir"]));
  if (dir === ws) die("never build into the workspace root; use videos/<name>");
  const idx = path.join(dir, "index.html");
  // protect an index.html someone wrote; HyperFrames' starter file from our own init is fine
  const ownInit = fs.existsSync(path.join(dir, ".hyperframes", "reel", "created"));
  if (cmd !== "briefs" && fs.existsSync(idx) && !fs.readFileSync(idx, "utf8").includes(MARK) && !ownInit && !args.force) die(`${path.relative(ws, idx)} was not written by the reel editor; re-run with --force to replace it`);
  if (!fs.existsSync(path.join(dir, "hyperframes.json"))) {
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    const res = { "1920x1080": "landscape", "1080x1920": "portrait", "1080x1080": "square" }[`${W}x${H}`];
    const argv = ["--yes", "hyperframes", "init", path.basename(dir), "--non-interactive", "--skill=general-video", ...(res ? [`--resolution=${res}`] : [])];
    try {
      run("npx", argv, { cwd: path.dirname(dir), env: { ...process.env, HYPERFRAMES_SKIP_SKILLS: "1" }, timeout: 300000 });
    } catch (e) {
      if (!fs.existsSync(path.join(dir, "hyperframes.json"))) die(`hyperframes init failed:\n${e.stderr || e.message}`);
    }
    writeFile(path.join(dir, ".hyperframes", "reel", "created"), new Date().toISOString() + "\n");
  }
  const tmpDir = path.join(dir, ".hyperframes", "reel");
  fs.mkdirSync(tmpDir, { recursive: true });
  const { p, M } = motionPath ? personalityFor(motionPath, tmpDir) : { p: null, M: null };
  const fontWarnings = [];
  // the look lands in the project's frame.md (fonts staged, @font-face section) so Claude's cards read the same tokens
  let fontCss = "";
  if (designMd || lookPath) {
    const r = await installLook(dir, designMd ? { designMd, mode: R.look.mode } : { frame: lookPath, presetDir: R.look.preset && !R.look.frame ? path.dirname(lookPath) : null });
    fontWarnings.push(...r.notes.filter((n) => !/^frame\.md converted/.test(n)));
    fontCss = r.fontCss || "";
  }
  const look = readLook(fs.existsSync(path.join(dir, "frame.md")) ? path.join(dir, "frame.md") : null);
  if (!designMd && !lookPath) {
    const staged0 = await stageFonts([{ family: look.font, weights: [400, 500, 600, 700, 800] }], dir);
    fontWarnings.push(...staged0.warnings);
    look.font = staged0.families[look.font] || look.font;
    fontCss = staged0.css;
  }
  let dirInstalled = null;
  if (directionSrc) {
    dirInstalled = installDirection(dir, directionSrc);
    if (fs.existsSync(path.join(dir, "frame.md"))) fs.writeFileSync(path.join(dir, "frame.md"), upsertMarked(fs.readFileSync(path.join(dir, "frame.md"), "utf8"), DIRECTION_MARK, dirInstalled.section));
  }
  const Mfields = motionPath ? readFrontmatterDoc(fs.readFileSync(motionPath, "utf8")).fields : null;
  // ---- Claude-authored cards and overlays: the files Claude writes from the briefs
  const cardDir = path.join(dir, "compositions", "cards");
  const authored = [];
  items.forEach((it, i) => { if (it.type === "card" && authorOf(it) === "claude") authored.push({ kind: "card", i, it, id: `card-${String(i + 1).padStart(2, "0")}`, rect: { x: 0, y: 0, w: W, h: H }, duration: Number(it.duration) }); });
  overlays.forEach((o, i) => { if (authorOf(o) === "claude") authored.push({ kind: "overlay", i, it: o, id: `overlay-${String(i + 1).padStart(2, "0")}`, rect: zoneRect(o.zone || "lower-third", W, H), duration: Number(o.duration) }); });
  if (args["briefs-only"] || cmd === "briefs") {
    fs.mkdirSync(cardDir, { recursive: true });
    const written = authored.map((a) => {
      const f = path.join(cardDir, `${a.id}.brief.md`);
      writeFile(f, cardBrief(a, { W, H, look, fontCss, M: Mfields, direction: dirInstalled, reelTitle: R.title }));
      return { id: a.id, kind: a.kind, brief: path.relative(ws, f), write: path.relative(ws, path.join(cardDir, `${a.id}.html`)), done: fs.existsSync(path.join(cardDir, `${a.id}.html`)) };
    });
    console.log(JSON.stringify({ ok: true, project_dir: path.relative(ws, dir), briefs: written, next: written.some((w) => !w.done) ? "Author each card: read its brief, write the file it names (a HyperFrames sub-composition), then run reel.mjs build." : "All cards are authored: run reel.mjs build." }, null, 2));
    return;
  }
  const missing = [];
  for (const a of authored) {
    const f = path.join(cardDir, `${a.id}.html`);
    if (!fs.existsSync(f)) { missing.push(`${a.id} (${a.kind}${a.it.text ? ` "${[].concat(a.it.text).join(" / ").slice(0, 30)}"` : ""})`); continue; }
    const t = fs.readFileSync(f, "utf8");
    if (!/<template[\s>]/i.test(t) || !t.includes(`data-composition-id="${a.id}"`) || !t.includes(`__timelines["${a.id}"]`) && !t.includes(`__timelines['${a.id}']`)) missing.push(`${a.id}: the file must be a sub-composition (inside <template>) with root data-composition-id="${a.id}" and window.__timelines["${a.id}"]`);
    a.src = `compositions/cards/${a.id}.html`;
  }
  if (missing.length) die(`${missing.length} card(s)/overlay(s) are Claude's to draw and are missing or malformed:\n- ${missing.join("\n- ")}\nRun: node reel.mjs briefs --reel ${path.relative(ws, reelPath)} --project-dir ${path.relative(ws, dir)} and author each brief's file (or set "by": "swatch" for a quick draft).`);
  // GSAP as a local file (lint rejects the library inline: it contains Math.random/Date.now)
  fs.mkdirSync(path.join(dir, "assets", "vendor"), { recursive: true });
  fs.copyFileSync(path.join(SKILL_DIR, "scripts", "vendor", "gsap.min.js"), path.join(dir, "assets", "vendor", "gsap.min.js"));
  if (motionPath) fs.copyFileSync(motionPath, path.join(dir, "motion.md"));
  const E = p ? p.easing : null;
  const onScale = (sec) => {
    if (!p) return sec;
    const S = p.tempo.scale_ms;
    return S.reduce((a, b) => (Math.abs(b - sec * 1000) < Math.abs(a - sec * 1000) ? b : a), S[0]) / 1000;
  };
  const tDefault = R.transition_default || "auto";

  // ---- stage footage: each used segment re-encoded to the reel's frame (crop/fit, fps, dense keyframes)
  const assetDir = path.join(dir, "assets", "footage");
  fs.mkdirSync(assetDir, { recursive: true });
  const keep = new Set();
  const staged = [];
  clipsUsed.forEach((it, k) => {
    const st = fs.statSync(it._src);
    const fit = it.fit || R.fit || "cover";
    const fx = it.focus && it.focus.x !== undefined ? Number(it.focus.x) : 0.5;
    const fy = it.focus && it.focus.y !== undefined ? Number(it.focus.y) : 0.5;
    const key = crypto.createHash("sha1").update(JSON.stringify([it._src, st.size, st.mtimeMs, it._in, it._out, W, H, FPS, fit, fx, fy])).digest("hex").slice(0, 10);
    const name = `${slug(path.basename(it._src))}-${key}.mp4`;
    const outFile = path.join(assetDir, name);
    keep.add(name);
    if (!fs.existsSync(outFile)) {
      const vf =
        fit === "cover"
          ? `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}:(iw-${W})*${fx}:(ih-${H})*${fy}`
          : fit === "contain"
            ? `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=${look.bg.replace("#", "0x")}`
            : null;
      const filter = vf
        ? ["-vf", `${vf},fps=${FPS},setsar=1,format=yuv420p`]
        : ["-filter_complex", `[0:v]split=2[a][b];[a]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=40:2,eq=brightness=-0.08[bg];[b]scale=${W}:${H}:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,fps=${FPS},setsar=1,format=yuv420p[v]`, "-map", "[v]", "-map", "0:a?"];
      try {
        run("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(it._in), "-i", it._src, "-t", String(r3(it._out - it._in)), ...filter, "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-g", String(Math.round(FPS)), "-keyint_min", String(Math.round(FPS)), "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", outFile], { timeout: 1800000 });
      } catch (e) {
        die(`could not stage ${it.clip}: ${String(e.stderr || e.message).trim().split("\n").pop()}`);
      }
    }
    it._asset = `assets/footage/${name}`;
    it._staged = probe(outFile);
    staged.push(it._asset);
  });
  for (const f of fs.readdirSync(assetDir)) if (!keep.has(f) && f.endsWith(".mp4")) fs.rmSync(path.join(assetDir, f));

  // ---- cards: engine compositions sized to their requested length
  const compDir = path.join(dir, "compositions");
  fs.mkdirSync(compDir, { recursive: true });
  for (const f of fs.readdirSync(compDir)) if (/^reel-/.test(f)) fs.rmSync(path.join(compDir, f));
  const engineItems = [];
  items.forEach((it, i) => {
    if (it.type === "card" && authorOf(it) === "swatch") {
      const texts = Array.isArray(it.text) ? it.text : [it.text];
      engineItems.push({ kind: "card", i, it, rect: { x: 0, y: 0, w: W, h: H }, blocks: texts.map((t, j) => ({ text: t, sub: j === texts.length - 1 ? it.sub || "" : "" })) });
    }
  });
  overlays.forEach((o, i) => { if (authorOf(o) === "swatch") engineItems.push({ kind: "overlay", i, it: o, rect: zoneRect(o.zone || "lower-third", W, H), blocks: [{ text: o.text, sub: o.sub || "" }] }); });
  if (engineItems.length) {
    const minHold = p.holds.min_ms;
    engineItems.forEach((e) => (e.p = p));
    const d0 = measure(engineItems, W, H, look, tmpDir, "a");
    engineItems.forEach((e) => (e.p = { ...p, demo: { ...p.demo, hold_ms: Math.max(p.demo.hold_ms, minHold) + 1000 } }));
    const d1 = measure(engineItems, W, H, look, tmpDir, "b");
    engineItems.forEach((e, k) => {
      const baseHold = Math.max(p.demo.hold_ms, minHold);
      const slope = Math.max(0.001, d1[k] - d0[k]); // seconds of timeline per +1s of hold
      const want = Number(e.it.duration) || d0[k];
      let hold = baseHold + ((want - d0[k]) / slope) * 1000;
      e.warn = null;
      if (hold < minHold) {
        e.warn = `${e.kind} ${e.i + 1} ("${String(e.blocks[0].text).slice(0, 24)}"): ${want}s is shorter than this motion allows (min ${r3(d0[k] - ((baseHold - minHold) / 1000) * slope)}s with its ${minHold}ms hold); using the minimum`;
        hold = minHold;
      }
      e.p = { ...p, demo: { ...p.demo, hold_ms: Math.round(hold) } };
      e.dur = r3(d0[k] + ((hold - baseHold) / 1000) * slope);
    });
  }
  const warnings = [...fontWarnings, ...engineItems.filter((e) => e.warn).map((e) => e.warn), ...prefNotes];

  // ---- timeline
  let t = 0;
  let prevClip = null;
  const segs = [];
  let z = 1;
  items.forEach((it, i) => {
    const type = it.type || "clip";
    if (type === "clip") {
      const rate = Number(it.rate || 1);
      const dur = r3((it._out - it._in) / rate);
      let tr = it.transition_in || tDefault;
      if (tr === "auto") tr = p ? nativeTransition(p) : "cut";
      if (!prevClip || prevClip !== segs[segs.length - 1]) tr = "cut";
      if (tr === "dissolve" && p && (p.banned || []).includes("opacity-only-entrance")) {
        warnings.push(`timeline[${i}]: this motion bans opacity-only entrances, so the dissolve became a wipe`);
        tr = "wipe";
      }
      let d = tr === "cut" ? 0 : onScale(0.5);
      d = Math.min(d, dur * 0.4, prevClip ? prevClip.dur * 0.4 : 0);
      if (tr !== "cut" && p && !p.tempo.scale_ms.some((s) => Math.abs(s - d * 1000) <= s * 0.15)) {
        warnings.push(`timeline[${i}]: clips too short for a ${tr} on this motion's scale; cut instead`);
        tr = "cut";
        d = 0;
      }
      const start = r3(t - d);
      const s = { kind: "clip", i, it, start, dur, rate, tr, d, z: z++, audio: it._staged.has_audio && !it.mute, volume: it.volume === undefined ? 1 : Number(it.volume) };
      segs.push(s);
      prevClip = s;
      t = r3(start + dur);
    } else {
      const e = engineItems.find((x) => x.kind === "card" && x.i === i);
      const a = authored.find((x) => x.kind === "card" && x.i === i);
      const dur = e ? e.dur : r3(Number(it.duration));
      segs.push({ kind: "card", i, it, e, a, start: r3(t), dur, z: z++ });
      t = r3(t + dur);
    }
  });
  const total = r3(t);
  const anchorLog = [];
  const overlaySegs = [
    ...engineItems.filter((e) => e.kind === "overlay").map((e) => ({ e, it: e.it, i: e.i, dur0: e.dur })),
    ...authored.filter((a) => a.kind === "overlay").map((a) => ({ a, it: a.it, i: a.i, dur0: a.duration, id: a.id, src: a.src })),
  ].sort((x, y) => x.i - y.i).map((o) => {
    let start = r3(Number(o.it.start)), dur0 = o.dur0;
    const an = o.it.anchor;
    if (an) {
      // reel time of a cut word: its segment's start plus its offset in the staged clip (same formula as the captions)
      const at = (file, id) => {
        const c = file ? cutDocs.get(resolveIn(file, base, ws)) : null;
        const e = c ? c.map.find((x) => x.id === id) : null;
        const s = e ? segs.find((x) => x.kind === "clip" && x.it._cut && x.it._cut.file === c.file && x.it._cut.seg === e.seg) : null;
        return s ? { a: r3(s.start + (e.src_start - s.it._in) / s.rate), b: r3(s.start + (e.src_end - s.it._in) / s.rate) } : null;
      };
      const w = at(an.cut, an.word);
      const text = [].concat(o.it.text).join(" / ").slice(0, 30);
      if (!w) {
        warnings.push(`anchor-unresolved: overlay ${o.i + 1} "${text}" points at ${an.word}, which is not in the cut; re-anchor it or set start`);
        anchorLog.push({ overlay: o.i + 1, word: an.word, resolved_at: null });
        return { ...o, start, dur: 0 };
      }
      start = r3(Math.max(0, w.a - (an.lead_s == null ? 0.1 : Number(an.lead_s))));
      if (an.hold_to) {
        const h = at(an.cut, an.hold_to);
        if (!h) warnings.push(`anchor-unresolved: overlay ${o.i + 1} "${text}" holds to ${an.hold_to}, which is not in the cut; its own duration (${dur0}s) is used`);
        else if (o.e) warnings.push(`overlay ${o.i + 1} "${text}": hold_to is ignored for a swatch overlay (its length comes from the motion); it keeps ${dur0}s`);
        else dur0 = r3(h.b - start + 0.3);
      }
      anchorLog.push({ overlay: o.i + 1, word: an.word, resolved_at: start });
    }
    if (start >= total) warnings.push(`overlay ${o.i + 1} starts at ${start}s, after the reel ends (${total}s); dropped`);
    return { ...o, start, dur: r3(Math.min(dur0, total - start)) };
  }).filter((o) => o.dur > 0.2);

  // ---- captions: transcript words remapped through the cuts
  let groups = [];
  const cap = R.captions && R.captions.on !== false ? R.captions : null;
  if (cap) {
    const fp = R.footage ? resolveIn(R.footage, base, ws) : null;
    const scanned = fp && fs.existsSync(fp) ? readJSON(fp) : { clips: [] };
    const words = [];
    for (const s of segs.filter((x) => x.kind === "clip" && x.audio && x.it.captions !== false)) {
      if (s.it._cut) {
        // a cut item: the corrected words of its decision file (display text), restricted to this kept range
        const cd = [...cutDocs.values()].find((x) => x.file === s.it._cut.file);
        const lo = s.start + s.d;
        for (const w of cd.map.filter((e) => e.seg === s.it._cut.seg)) {
          const a = r3(s.start + (w.src_start - s.it._in) / s.rate), b = r3(s.start + (w.src_end - s.it._in) / s.rate);
          if (a < lo - 0.01) continue;
          const fix = (R.captions.replace || {})[w.text.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "")];
          words.push({ text: fix || w.text, start: a, end: Math.min(b, s.start + s.dur) });
        }
        continue;
      }
      const c = scanned.clips.find((cl) => cl.path && path.resolve(ws, cl.path) === s.it._src);
      if (!c || !c.transcript) {
        warnings.push(`captions: no transcript for ${s.it.clip} (run scan without --no-transcribe, and set reel.footage to its footage.json)`);
        continue;
      }
      const list = readJSON(path.resolve(ws, c.transcript));
      const lo = s.start + s.d;
      for (const w of list) {
        if (w.start < s.it._in - 0.02 || w.end > s.it._out + 0.05) continue;
        const a = r3(s.start + (w.start - s.it._in) / s.rate), b = r3(s.start + (Math.min(w.end, s.it._out) - s.it._in) / s.rate);
        if (a < lo - 0.01) continue;
        const fix = (R.captions.replace || {})[w.text.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "")];
        words.push({ text: fix || w.text, start: a, end: Math.min(b, s.start + s.dur) });
      }
    }
    const tall = H / W > 1.2;
    let nWords = tall ? 3 : 5, maxChars = tall ? 18 : 34, fromDna = null;
    if (Number.isInteger(cap.words_per_group) && cap.words_per_group >= 1 && cap.words_per_group <= 6) fromDna = { n: cap.words_per_group, src: "reel.json captions.words_per_group" };
    else if (R.reference_profile) {
      try {
        const prof = readJSON(resolveIn(R.reference_profile, base, ws));
        const ov = (prof.style_overrides || {}).caption_words_per_unit, m = (prof.metrics || {}).caption_words_per_unit;
        const v = ov != null ? Number(ov) : m && m.confidence !== "unmeasured" && m.value != null ? Number(m.value) : null;
        if (Number.isFinite(v)) fromDna = { n: Math.min(6, Math.max(1, Math.round(v))), src: `Reference DNA (${prof.id || "profile"})` };
      } catch (e) { warnings.push(`captions: could not read reference_profile (${e.message})`); }
    }
    if (fromDna) {
      nWords = fromDna.n; maxChars = tall ? Math.round(nWords * 6) : nWords * 7;
      warnings.push(`captions: ${nWords} words a group from ${fromDna.src}`);
    }
    groups = groupWords(words.sort((x, y) => x.start - y.start), { maxWords: nWords, maxChars });
    groups.forEach((g) => (g.out = Math.min(g.out, total)));
    groups = groups.filter((g) => g.out - g.in > 0.1);
    for (const o of overlaySegs) if ((o.it.zone || "lower-third") === "lower-third" && H / W > 1.2 && groups.some((g) => g.in < o.start + o.dur && g.out > o.start)) warnings.push(`overlay ${o.i + 1} sits just above the captions while they run; check the frame`);
  }

  // ---- preflight: faces and platform UI (warnings only)
  {
    const dest = destinationOf({ destination: R.destination || null, aspect: R.aspect || "9:16" });
    const zones = zonesFor(dest, R.aspect || "9:16");
    const facesCache = new Map(), unknownSeen = new Set();
    // opt-in: reels with no destination and no faces files build exactly as before (no new warnings)
    const optIn = !!R.destination;
    let anyFaces = false;
    const unknownMsgs = [];
    const pieces = [
      ...overlaySegs.map((o) => ({ id: "overlay", label: `overlay ${o.i + 1} "${[].concat(o.it.text || "").join(" / ").slice(0, 30)}"`, rect: zoneRect(o.it.zone || "lower-third", W, H), a: o.start, b: o.start + o.dur, ui: "overlay-in-platform-ui", face: "overlay-on-face" })),
      ...groups.map((g, k) => ({ id: "captions", label: "the captions", group: k, rect: zoneRect("captions", W, H), a: g.in, b: g.out, ui: "caption-in-platform-ui", face: "caption-on-face" })),
    ];
    const frac = (r) => ({ x: r.x / W, y: r.y / H, w: r.w / W, h: r.h / H });
    const noted = new Set();
    for (const p of pieces) {
      const box = frac(p.rect);
      const hit = boxInZones(box, zones, { minShare: PLATFORM_SHARE }).filter((z) => z.zone !== "margin")[0];
      if (optIn && hit && !noted.has(p.ui + (p.group === undefined ? p.label : ""))) { noted.add(p.ui + (p.group === undefined ? p.label : "")); warnings.push(`${p.ui}: ${p.label} sits ${Math.round(hit.share * 100)}% under the ${hit.zone} on ${dest}; move it inside the safe area`); }
      for (const u of clipsUnder(segs, p.a, p.b)) {
        const key = String(u.s.it.clip);
        const doc = loadFaces(R, base, ws, key, u.s.it._src, facesCache);
        if (doc) anyFaces = true;
        const head = doc ? headsDuring(doc, u.t0, u.t1) : { unknown: true, reason: "no faces file" };
        const h = head.unknown ? null : head;
        if (!h) {
          if (!unknownSeen.has(key)) { unknownSeen.add(key); unknownMsgs.push(`face-unknown: faces not checked for ${key} (${head.reason}); run footage.mjs faces --run "$RUN"`); }
          // a doubtful (low confidence) head is still checked, flagged as unsure
          if (head.box && overlapShare(box, head.box) >= FACE_COVER) { const k = p.face + "?" + p.label; if (!noted.has(k)) { noted.add(k); warnings.push(`${p.face}: ${p.label} may cover a face (low-confidence detection) at ${r3(p.a)}s; check the frame`); } }
          continue;
        }
        const share = overlapShare(box, h);
        if (share >= FACE_COVER) { const k = p.face + p.label; if (!noted.has(k)) { noted.add(k); warnings.push(`${p.face}: ${p.label} covers ${Math.round(share * 100)}% of the speaker's head at ${r3(p.a)}s; move it to another zone or time`); } }
      }
    }
    if (optIn || anyFaces) warnings.push(...unknownMsgs);
  }

  // ---- write compositions
  const wrote = [];
  const put = (rel, text) => {
    writeFile(path.join(dir, rel), text);
    wrote.push(rel);
  };
  for (const s of segs.filter((x) => x.kind === "card")) {
    if (s.a) {
      s.id = s.a.id;
      s.src = s.a.src; // Claude's own composition, mounted in place
    } else if (s.e) {
      s.id = `reel-card-${String(s.i + 1).padStart(2, "0")}`;
      put(`compositions/${s.id}.html`, engineComp({ id: s.id, W, H, look, p: s.e.p, blocks: s.e.blocks, rect: s.e.rect, background: look.bg, plate: undefined, fontCss }));
    } else {
      const text = fs.readFileSync(s.it._srcFile, "utf8");
      s.id = text.match(/data-composition-id="([^"]+)"/)[1];
      const rel = `compositions/reel-src-${slug(path.basename(s.it._srcFile))}.html`;
      put(rel, text);
      s.src = rel;
    }
  }
  overlaySegs.forEach((o, k) => {
    if (o.a) return; // Claude's own composition, mounted in place
    o.id = `reel-overlay-${String(k + 1).padStart(2, "0")}`;
    const style = o.e.it.style || "plate";
    put(`compositions/${o.id}.html`, engineComp({ id: o.id, W, H, look, p: o.e.p, blocks: o.e.blocks, rect: o.e.rect, background: null, plate: style === "plate" ? look.bg : null, fontCss }));
  });
  if (groups.length) put("compositions/reel-captions.html", captionsComp({ id: "reel-captions", W, H, look, groups, style: cap.style || "bold", total, fontCss }));

  let musicRel = null;
  if (musicSrc) {
    musicRel = `assets/music-bed${path.extname(musicSrc) || ".mp3"}`;
    fs.mkdirSync(path.join(dir, "assets"), { recursive: true });
    fs.copyFileSync(musicSrc, path.join(dir, musicRel));
  }
  const lanes = (pts) => `data-automation='${JSON.stringify({ version: 1, lanes: [{ target: "volume", points: pts }] })}'`;
  const media = [];
  const tweens = [];
  for (const s of segs) {
    if (s.kind === "clip") {
      const n = String(s.i + 1).padStart(2, "0");
      const track = s.z % 2 ? 0 : 1;
      media.push(`<div class="seg" id="seg-${n}" style="z-index:${s.z}"><video id="v-${n}" src="${s.it._asset}" data-start="${s.start}" data-duration="${s.dur}" data-media-start="0"${s.rate !== 1 ? ` data-playback-rate="${s.rate}"` : ""} data-track-index="${track}" muted playsinline></video></div>`);
      if (s.audio) {
        const next = segs[segs.indexOf(s) + 1];
        const fin = s.d > 0 ? [{ t: 0, v: 0 }, { t: s.d, v: 1 }] : [{ t: 0, v: 1 }];
        const fout = next && next.kind === "clip" && next.d > 0 ? [{ t: r3(s.dur - next.d), v: 1 }, { t: s.dur, v: 0 }] : [];
        const pts = [...fin, ...fout];
        media.push(`<audio id="a-${n}" src="${s.it._asset}" data-start="${s.start}" data-duration="${s.dur}" data-media-start="0"${s.rate !== 1 ? ` data-playback-rate="${s.rate}"` : ""} data-volume="${s.volume}" data-track-index="${10 + track}"${pts.length > 1 ? ` ${lanes(pts)}` : ""}></audio>`);
      }
      if (s.tr === "dissolve") tweens.push(`tl.fromTo("#seg-${n}", { opacity: 0 }, { opacity: 1, duration: ${s.d}, ease: "${E.enter}" }, ${s.start});`);
      if (s.tr === "wipe") tweens.push(`tl.fromTo("#seg-${n}", { clipPath: "inset(0% 100% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: ${s.d}, ease: "${E.enter}" }, ${s.start});`);
    } else {
      media.push(`<div id="slot-${s.id}" class="slot" style="z-index:${s.z}" data-composition-id="${s.id}" data-composition-src="${s.src || `compositions/${s.id}.html`}" data-start="${s.start}" data-duration="${s.dur}" data-track-index="2" data-width="${W}" data-height="${H}"></div>`);
    }
  }
  overlaySegs.forEach((o) => media.push(`<div id="slot-${o.id}" class="slot" style="z-index:500" data-composition-id="${o.id}" data-composition-src="${o.src || `compositions/${o.id}.html`}" data-start="${o.start}" data-duration="${o.dur}" data-track-index="3" data-width="${W}" data-height="${H}"></div>`));
  if (groups.length) media.push(`<div id="slot-reel-captions" class="slot" style="z-index:600" data-composition-id="reel-captions" data-composition-src="compositions/reel-captions.html" data-start="0" data-duration="${total}" data-track-index="4" data-width="${W}" data-height="${H}"></div>`);
  if (musicRel) {
    const full = R.music.volume === undefined ? 0.8 : Number(R.music.volume);
    const duck = R.music.duck === undefined ? 0.18 : Number(R.music.duck);
    const pts = [{ t: 0, v: 0 }, { t: 0.4, v: full }];
    // duck under every clip that keeps its own sound
    for (const s of segs.filter((x) => x.kind === "clip" && x.audio && x.volume > 0)) {
      const a = Math.max(0.5, s.start), b = s.start + s.dur;
      pts.push({ t: r3(a - 0.3), v: full }, { t: r3(a), v: duck }, { t: r3(b - 0.1), v: duck }, { t: r3(b + 0.2), v: full });
    }
    pts.push({ t: r3(Math.max(0.5, total - 1.5)), v: full }, { t: total, v: 0 });
    const clean = pts.sort((x, y) => x.t - y.t).filter((q, k, arr) => q.t >= 0 && q.t <= total && (k === 0 || q.t > arr[k - 1].t));
    media.push(`<audio id="music-bed" src="${musicRel}" data-start="0" data-duration="${total}" data-media-start="${Number(R.music.start || 0)}" data-volume="1" data-track-index="20" ${lanes(clean)}></audio>`);
  }

  const index = `<!doctype html>
${MARK}
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=${W}, height=${H}" />
<title>${esc(R.title || "Reel")}</title>
<script src="assets/vendor/gsap.min.js"></script>
<style>
  ${fontCss}
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: #000; }
  #root { position: relative; width: ${W}px; height: ${H}px; overflow: hidden; background: #000; }
  #root .seg { position: absolute; inset: 0; }
  #root .seg video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  #root .slot { position: absolute; inset: 0; }
</style>
</head>
<body>
<div id="root" data-composition-id="root" data-start="0" data-duration="${total}" data-width="${W}" data-height="${H}" data-fps="${FPS}">
  ${media.join("\n  ")}
</div>
<script>
  window.__timelines = window.__timelines || {};
  var tl = gsap.timeline({ paused: true });
  ${tweens.join("\n  ")}
  tl.set({}, {}, ${total});
  window.__timelines["root"] = tl;
</script>
</body>
</html>
`;
  put("index.html", index);

  // the edit decision list as built, for the console timeline and revisions
  const edl = {
    title: R.title || null,
    aspect: `${W}x${H}`,
    fps: FPS,
    total_s: total,
    motion: M ? (M.personality === "custom" ? `${M.parent}+${(M.adjustments || []).join("+")}` : M.personality) : null,
    items: segs.map((s) => (s.kind === "clip" ? { n: s.i + 1, kind: "clip", label: s.it.label || path.basename(s.it._src), clip: s.it.clip, in: s.it._in, out: s.it._out, start: s.start, duration: s.dur, transition_in: s.tr, audio: s.audio, poster: null, ...(s.it._cut ? { cut: s.it._cut } : {}) } : { n: s.i + 1, kind: "card", label: s.e || s.a ? [].concat(s.it.text).join(" / ") : s.id, by: s.a ? "claude" : s.e ? "swatch" : "src", start: s.start, duration: s.dur, transition_in: "cut" })),
    overlays: overlaySegs.map((o) => ({ text: o.it.text, zone: o.it.zone || "lower-third", start: o.start, duration: o.dur, by: o.a ? "claude" : "swatch" })),
    captions: groups.length ? { groups: groups.length, style: cap.style || "bold" } : null,
    ...(cutDocs.size ? { cuts: [...cutDocs.values()].filter((c) => segs.some((s) => s.it && s.it._cut && s.it._cut.file === c.file)).map((c) => ({ file: c.file, clip: c.doc.clip, rev: c.doc.head, segments: c.segments })) } : {}),
    ...(anchorLog.length ? { anchors: anchorLog } : {}),
    music: musicRel,
    warnings,
  };
  put("reel.edl.json", JSON.stringify(edl, null, 2) + "\n");

  // ---- checks
  const checks = {};
  const lint = args["no-lint"] ? null : spawnSync("npx", ["--yes", "hyperframes", "lint", dir, "--json"], { encoding: "utf8", timeout: 300000, maxBuffer: 64 * 1024 * 1024 });
  if (!lint) checks.lint = { skipped: true };
  else try {
    const lj = JSON.parse(lint.stdout.slice(lint.stdout.indexOf("{")));
    checks.lint = { ok: lint.status === 0, errors: lj.errorCount ?? (lj.errors || []).length ?? null, warnings: lj.warningCount ?? null, findings: (lj.findings || lj.issues || []).filter((f) => (f.severity || f.level) === "error").slice(0, 12) };
  } catch {
    checks.lint = { ok: lint.status === 0, output: (lint.stdout + lint.stderr).trim().split("\n").slice(-15).join("\n") };
  }
  if (p) {
    const ob = spawnSync(process.execPath, [path.join(HERE, "obey.mjs"), "--project", dir], { encoding: "utf8", timeout: 600000 });
    checks.obey = { exit: ob.status, summary: (ob.stdout || "").split("\n")[0], status: ob.status === 0 ? "clean" : ob.status === 2 ? "violations" : "could-not-run" };
    if (ob.status !== 0) checks.obey.detail = (ob.stdout + ob.stderr).trim().split("\n").slice(0, 30).join("\n");
  }
  let rendered = null;
  if (args.render) {
    if (checks.lint && !checks.lint.skipped && !checks.lint.ok) die(`lint failed; not rendering:\n${JSON.stringify(checks.lint, null, 2)}`);
    if (checks.obey && checks.obey.exit !== 0 && !args["render-anyway"]) die(`obey: ${checks.obey.status}; not rendering (fix, waive, or pass --render-anyway):\n${checks.obey.detail || checks.obey.summary}`);
    const outFile = path.join(dir, "renders", `${slug(R.title || path.basename(dir))}.mp4`);
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    const q = String(args.quality || "looks");
    // one render at a time (and one the machine's memory can carry): take a render slot around the hyperframes render (lib/slot.mjs)
    const slot = acquireSlotSync({ label: `reel ${path.basename(dir)}`, managed: args.managed ? true : undefined }); // Plan 09 P9: --managed / RASANAI_MANAGED=1 = fail closed
    if (slot.blocked) die(`render not started: ${slot.state} (${slot.reason_code}); queued work stays queued, nothing renders past the cap`);
    let rr;
    try { rr = spawnSync("npx", ["--yes", "hyperframes", "render", dir, "-o", outFile, "--fps", String(FPS), "--quality", q, "--skill=general-video"], { encoding: "utf8", timeout: 3600000, maxBuffer: 64 * 1024 * 1024, env: renderProcessEnv() }); }
    finally { slot.release(); }
    if (rr.status !== 0 || !fs.existsSync(outFile)) die(`render failed:\n${(rr.stdout + rr.stderr).trim().split("\n").slice(-25).join("\n")}`);
    const info = probe(outFile);
    rendered = { file: path.relative(ws, outFile), duration: info.duration, size: `${info.width}x${info.height}`, audio: info.has_audio };
  }
  console.log(JSON.stringify({ ok: true, project_dir: path.relative(ws, dir), total_s: total, clips: segs.filter((s) => s.kind === "clip").length, cards: segs.filter((s) => s.kind === "card").length, overlays: overlaySegs.length, caption_groups: groups.length, music: musicRel, edl: path.relative(ws, path.join(dir, "reel.edl.json")), wrote, warnings, checks, rendered }, null, 2));
}

// rendered-frame checks: does a graphic cover a face, is text under platform UI (warnings; needs a render)
async function checkFramesCmd() {
  if (!args.reel || !args["project-dir"]) die("check-frames needs --reel <reel.json> and --project-dir videos/<name>");
  const reelPath = path.resolve(String(args.reel));
  const R = readJSON(reelPath);
  const base = path.dirname(reelPath), ws = process.cwd();
  const dir = path.resolve(String(args["project-dir"]));
  const edlPath = path.join(dir, "reel.edl.json");
  if (!fs.existsSync(edlPath)) die("no reel.edl.json in the project folder: build the reel first");
  const edl = readJSON(edlPath);
  let video = args.video && args.video !== true ? path.resolve(String(args.video)) : null;
  if (!video) {
    const found = [];
    for (const d of [path.join(dir, "renders"), dir]) if (fs.existsSync(d)) for (const f of fs.readdirSync(d)) if (/\.mp4$/i.test(f)) found.push(path.join(d, f));
    video = found.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0] || null;
  }
  if (!video || !fs.existsSync(video)) die("no render found: pass --video <render.mp4>");
  const cache = new Map(), faces = {};
  for (const it of edl.items || []) {
    if (it.kind !== "clip" || !it.clip || faces[it.clip]) continue;
    const doc = loadFaces(R, base, ws, it.clip, null, cache);
    if (doc) faces[it.clip] = doc;
  }
  const aspect = R.aspect || "9:16";
  const every = Number(args.every) > 0 ? Number(args.every) : 0.5;
  const res = await checkFrames({ video, edl, faces, destination: destinationOf({ destination: R.destination || null, aspect }), aspect, every });
  if (res.ok === false) die((res.skipped || []).join("; ") || "could not check the frames");
  writeFile(path.join(dir, "reel.frames-check.json"), JSON.stringify({ video: path.relative(ws, video), ...res }, null, 2) + "\n");
  console.log(JSON.stringify({ ok: true, findings: res.findings, samples: res.samples, skipped: res.skipped && res.skipped.length ? res.skipped : undefined, wrote: path.relative(ws, path.join(dir, "reel.frames-check.json")) }, null, 2));
}

if (cmd === "scan") scan();
else if (cmd === "check-frames") await checkFramesCmd();
else if (cmd === "build" || cmd === "briefs") await build();
else die("usage: reel.mjs scan --footage <dir> --run <run> | build --reel <reel.json> --project-dir <dir> [--render] | check-frames --reel <reel.json> --project-dir <dir> [--video <mp4>]");
