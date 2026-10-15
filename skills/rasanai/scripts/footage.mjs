#!/usr/bin/env node
// The footage desk's scripts (references/sources.md): what a post house does to a client's rushes before anyone cuts, with only what is
// installed (ffmpeg, whisper-cli; Apple Vision through /usr/bin/swift as an optional macOS step). Originals are never modified. Everything
// lands under $RUN/footage/ and every step can be re-run.
//
//   node footage.mjs ingest   --footage <dir>[,<dir>] --run <run> [--hash full] [--proxy 720]
//        -> footage/ingest.json: every video, audio and still (deep walk): fingerprint, facts (size, fps, VFR, colour transfer -> rec709|hlg|pq|log?,
//           creation time, camera), bins (folder + camera + day), dual-system audio matched to clips by envelope cross-correlation, optional proxies
//   node footage.mjs shots    --run <run> [--threshold 10] [--every 6] [--no-strips]
//        -> footage/shots.json: shots from ffmpeg scdet, a keyframe and a 4-frame strip per shot, long takes sampled every N s, per-shot quality
//           (focus, exposure, clipping, motion, frozen, black) and per-clip audio clipping, with flags
//   node footage.mjs vision   --run <run>      (optional: macOS + /usr/bin/swift) faces, people, saliency, labels and on-screen text per keyframe, with sensitive-text flags
//   node footage.mjs transcribe --run <run> [--lang auto|<iso>] [--names names.txt] [--channels-as-speakers]
//        -> footage/transcripts/<clip>.words.json ({text,start,end,conf,speaker}), transcript.md, names.json (self-introductions). The language is detected, never
//           defaulted (lib/lang.mjs); a language that needs a model that is not installed is reported, never downloaded
//   node footage.mjs bites    --run <run> [--min 1.5 --max 25]
//        -> footage/bites-candidates.json: sentences from the word timings with word-aligned in/out (first start - 0.08, last end + 0.12), pace, confidence, fillers
//   node footage.mjs clean-speech (--in <clip> | --run <run> --clip <id>) [--out <file>] [--lufs -16] [--no-denoise]
//        -> the speech cleanup chain for a talking clip (lib/audio.mjs speechChain: high-pass 80 Hz, denoise, gate, mud cut, presence, 3:1 compression, loudnorm -16);
//           a wav next to the footage under <run>/footage/clean/ (or --out), a video keeps its picture untouched. The original is never modified; the chain is
//           for the user's own speech rushes, never for a music or room-tone track. ffmpeg without afftdn/agate runs the rest and says so.
//   node footage.mjs merge-log | check-log | check-selects [--min-good 8] | check-paper --paper <story/paper-X.json> [--length s]
//        -> the checks the crew's footage roles are accepted by (exit 2 with the problems listed)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs, die, writeFile } from "./lib/common.mjs";
import { track } from "./lib/report.mjs";
import { noteDowngrade } from "./lib/downgrade.mjs";
import { decideLanguage, whisperTranscribe, hasWhisperCli, englishLooks, installedModels } from "./lib/lang.mjs";
import { speechChain } from "./lib/audio.mjs";
import { r3, jsonMaybe, FD, checkLog, mergeLogs, checkSelects, checkPaper } from "./lib/footage-lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = parseArgs();
const cmd = args._[0];
track(
  { ingest: "Reading what's on your cards: files, formats, frame rates", shots: "Finding every shot and checking focus, exposure and sound", vision: "Finding faces, people and on-screen text (on this Mac only)", transcribe: "Transcribing what's said, in the language it's said", bites: "Marking the quotable sentences", "check-paper": "Checking the paper edit against the footage" }[cmd],
  { ingest: "Footage read", shots: "Shots found", vision: "Frames read", transcribe: "Transcribed", bites: "Sentences marked", "check-paper": "Paper edit checked" }[cmd]
);
const out = (o, code = 0) => { console.log(JSON.stringify(o, null, 2)); process.exit(code); };
const run = args.run && args.run !== true ? path.resolve(String(args.run)) : null;
const need = () => run || die("--run <run dir> required");
const ws = process.cwd();
const rel = (p) => path.relative(ws, p);
const sh = (bin, argv, opts = {}) => spawnSync(bin, argv, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, ...opts });
const slug = (s) => String(s).toLowerCase().replace(/\.[^.]+$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "clip";
const VIDEO = /\.(mp4|mov|m4v|webm|mkv|avi|mts|mxf)$/i, AUDIO = /\.(wav|aif|aiff|m4a|mp3|flac|aac)$/i, STILL = /\.(jpe?g|heic|png|dng|tiff?)$/i;
const SKIPD = new Set(["node_modules", ".git", "renders", ".Trash", "Library"]);
const expand = (p) => path.resolve(String(p).trim().replace(/^~(?=\/|$)/, os.homedir()));
const need1 = (bin, flag = "-version") => { if (sh(bin, [flag]).status !== 0) die(`${bin} is required (brew install ffmpeg)`); };

function fingerprint(file, full) {
  const st = fs.statSync(file);
  const h = crypto.createHash("sha1");
  h.update(String(st.size));
  const fd = fs.openSync(file, "r");
  try {
    if (full) { const b = Buffer.alloc(1 << 20); let n; let pos = 0; while ((n = fs.readSync(fd, b, 0, b.length, pos)) > 0) { h.update(b.subarray(0, n)); pos += n; } }
    else { const b = Buffer.alloc(1 << 20); let n = fs.readSync(fd, b, 0, b.length, 0); h.update(b.subarray(0, n)); if (st.size > 2 << 20) { n = fs.readSync(fd, b, 0, b.length, st.size - (1 << 20)); h.update(b.subarray(0, n)); } }
  } finally { fs.closeSync(fd); }
  return h.digest("hex").slice(0, 16);
}

function probeFull(file) {
  const r = sh("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", file]);
  if (r.status !== 0) return { error: String(r.stderr).trim().split("\n").pop() };
  const j = JSON.parse(r.stdout);
  const v = (j.streams || []).find((s) => s.codec_type === "video" && !(s.disposition && s.disposition.attached_pic));
  const a = (j.streams || []).find((s) => s.codec_type === "audio");
  const frac = (s) => { const [n, d] = String(s || "0/1").split("/").map(Number); return d ? n / d : n; };
  const tags = { ...(j.format && j.format.tags), ...(v && v.tags) };
  const t = (k) => { const key = Object.keys(tags).find((x) => x.toLowerCase() === k.toLowerCase()); return key ? tags[key] : null; };
  const o = { duration: r3(Number(j.format.duration || (v && v.duration) || (a && a.duration) || 0)), size_mb: Math.round((Number(j.format.size || 0) / 1048576) * 10) / 10, audio: a ? { channels: a.channels, rate: Number(a.sample_rate), lang: (a.tags && a.tags.language) || null } : null };
  if (v) {
    const rot = Number(((v.side_data_list || []).find((x) => x.rotation !== undefined) || {}).rotation ?? (v.tags && v.tags.rotate) ?? 0);
    const swap = Math.abs(rot) % 180 === 90;
    const rf = frac(v.r_frame_rate), af = frac(v.avg_frame_rate);
    const ct = v.color_transfer || "", cp = v.color_primaries || "";
    const base = path.basename(file);
    // log is flagged when tagged oddly, or the name says so; untagged log is judged later by shots (low saturation + compressed range)
    const color = /arib-std-b67/.test(ct) ? "hlg" : /smpte2084/.test(ct) ? "pq" : /log|slog|clog|vlog|logc/i.test(ct) || /(^|[^a-z])(log|slog\d?|clog\d?|vlog|logc)([^a-z]|$)/i.test(base) ? "log?" : ct || cp ? "rec709" : "unknown";
    Object.assign(o, { width: swap ? v.height : v.width, height: swap ? v.width : v.height, rotation: rot, fps: r3(af || rf), vfr: !!(rf && af && Math.abs(rf - af) / rf > 0.02), codec: v.codec_name, color, color_transfer: ct || null, pix_fmt: v.pix_fmt || null });
  }
  o.created = t("creation_time") || t("com.apple.quicktime.creationdate");
  o.camera = [t("com.apple.quicktime.make"), t("com.apple.quicktime.model") || t("model")].filter(Boolean).join(" ") || null;
  o.timecode = t("timecode") || (v && v.tags && v.tags.timecode) || null;
  return o;
}

// 100 Hz loudness envelope of a file's first `secs` seconds (mono, 2 kHz, from ffmpeg's raw output)
function envelope(file, secs) {
  const r = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-t", String(secs), "-vn", "-ac", "1", "-ar", "2000", "-f", "s16le", "-"], { maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0 || !r.stdout.length) return null;
  const n = Math.floor(r.stdout.length / 2 / 20), env = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let k = 0; k < 20; k++) s += Math.abs(r.stdout.readInt16LE((i * 20 + k) * 2)); env[i] = s / 20; }
  return env;
}
const zs = (e) => { let m = 0; for (const v of e) m += v; m /= e.length; let sd = 0; for (const v of e) sd += (v - m) ** 2; sd = Math.sqrt(sd / e.length) || 1; return e.map((v) => (v - m) / sd); };
// where does `clip` start inside `ext` (a longer recording)? offset in seconds and a confidence (peak over the mean absolute correlation)
function syncOffset(clipFile, extFile) {
  const a = envelope(clipFile, 90), b = envelope(extFile, 600);
  if (!a || !b || a.length < 200 || b.length < a.length) return null;
  const A = zs(a), B = zs(b);
  const lagMax = Math.min(B.length - A.length, 60000);
  let best = -Infinity, bestLag = 0, sumAbs = 0, cnt = 0;
  const step = 1;
  for (let lag = 0; lag <= lagMax; lag += step) {
    let s = 0;
    for (let i = 0; i < A.length; i += 2) s += A[i] * B[i + lag];
    s /= A.length / 2;
    sumAbs += Math.abs(s); cnt++;
    if (s > best) { best = s; bestLag = lag; }
  }
  const conf = best / ((sumAbs / cnt) || 1);
  return { offset_s: r3(bestLag / 100), confidence: r3(conf), score: r3(best) };
}

// ---------------------------------------------------------------- ingest
function ingest() {
  need();
  need1("ffmpeg"); need1("ffprobe");
  if (!args.footage || args.footage === true) die("--footage <dir>[,<dir>] required");
  const roots = String(args.footage).split(",").map(expand);
  const files = { video: [], audio: [], still: [] };
  for (const root of roots) {
    if (!fs.existsSync(root)) die(`not found: ${root}`);
    const stat = fs.statSync(root);
    if (stat.isFile()) { (VIDEO.test(root) ? files.video : AUDIO.test(root) ? files.audio : STILL.test(root) ? files.still : []).push({ root: path.dirname(root), p: root }); continue; }
    (function walk(d, depth) {
      if (depth > 8) return;
      for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        if (e.name.startsWith(".")) continue;
        const p = path.join(d, e.name);
        if (e.isDirectory()) { if (!SKIPD.has(e.name)) walk(p, depth + 1); }
        else if (VIDEO.test(e.name)) files.video.push({ root, p });
        else if (AUDIO.test(e.name)) files.audio.push({ root, p });
        else if (STILL.test(e.name)) files.still.push({ root, p });
      }
    })(root, 0);
  }
  if (!files.video.length && !files.still.length) die(`no video or stills under ${roots.join(", ")}`);
  const full = args.hash === "full";
  const used = new Set();
  const clips = [];
  for (const { root, p } of files.video) {
    const info = probeFull(p);
    let id = slug(path.basename(p));
    while (used.has(id)) id += "-2";
    used.add(id);
    const c = { id, name: path.relative(root, p), path: p, fingerprint: fingerprint(p, full), ...info };
    const folder = path.relative(root, path.dirname(p)) || ".";
    c.bin = slug(`${folder === "." ? path.basename(root) : folder}${info.camera ? "-" + info.camera : ""}${info.created ? "-" + String(info.created).slice(0, 10) : ""}`) || "root";
    clips.push(c);
  }
  const audio = files.audio.map(({ root, p }) => ({ name: path.relative(root, p), path: p, fingerprint: fingerprint(p, false), ...probeFull(p) }));
  // dual-system sound: match each external recording to the clips it covers
  const syncs = [];
  if (audio.length && !args["no-sync"]) {
    for (const c of clips.filter((x) => x.audio && !x.error)) {
      const near = audio.filter((a) => path.dirname(a.path) === path.dirname(c.path) || path.dirname(path.dirname(a.path)) === path.dirname(path.dirname(c.path)));
      const cand = (near.length ? near : audio).slice(0, 12);
      let best = null;
      for (const a of cand) { const s = syncOffset(c.path, a.path); if (s && (!best || s.confidence > best.confidence)) best = { audio: a.name, ...s }; }
      if (best && best.score >= 0.4 && best.confidence >= 2.5) { c.sync = best; syncs.push({ clip: c.id, ...best }); }
    }
  }
  const stills = files.still.map(({ root, p }) => ({ name: path.relative(root, p), path: p, fingerprint: fingerprint(p, false) }));
  const bins = {};
  for (const c of clips) (bins[c.bin] ||= { id: c.bin, clips: [], duration_s: 0 }), bins[c.bin].clips.push(c.id), (bins[c.bin].duration_s = r3(bins[c.bin].duration_s + (c.duration || 0)));
  // proxies: 720p CFR H.264 with a 1 s GOP, outside the repo (the cache), named by the fingerprint
  if (args.proxy) {
    const h = Number(args.proxy) || 720;
    const dir = path.join(os.homedir(), ".rasanai", "cache", "proxies");
    fs.mkdirSync(dir, { recursive: true });
    for (const c of clips) {
      if (c.error || !c.width) continue;
      const f = path.join(dir, `${c.fingerprint}-${h}.mp4`);
      if (!fs.existsSync(f)) {
        const fps = Math.round(c.fps || 30);
        const r = sh("ffmpeg", ["-v", "error", "-y", "-i", c.path, "-vf", `scale=-2:${h}`, "-r", String(fps), "-fps_mode", "cfr", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-g", String(fps), "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", f]);
        if (r.status !== 0) { c.proxy_error = String(r.stderr).trim().split("\n").pop(); continue; }
      }
      c.proxy = f;
    }
  }
  const total = clips.reduce((a, c) => a + (c.duration || 0), 0);
  const warns = [];
  const nv = clips.filter((c) => c.vfr).length; if (nv) warns.push(`${nv} clip(s) have a variable frame rate (phone footage): the proxy and the cut are conformed to a constant rate`);
  const nl = clips.filter((c) => c.color === "log?" || c.color === "hlg" || c.color === "pq").length; if (nl) warns.push(`${nl} clip(s) are log or HDR: they need a normalising transform before the grade`);
  const bad = clips.filter((c) => c.error); if (bad.length) warns.push(`${bad.length} file(s) ffprobe could not read`);
  const result = { ingested_at: new Date().toISOString(), roots: roots.map((r) => r), clips, audio, stills, bins: Object.values(bins), sync: syncs, total_s: r3(total), warnings: warns };
  fs.mkdirSync(FD(run), { recursive: true });
  writeFile(FD(run, "ingest.json"), JSON.stringify(result, null, 2) + "\n");
  out({ ok: true, ingest: rel(FD(run, "ingest.json")), clips: clips.length, duration_s: r3(total), audio_files: audio.length, stills: stills.length, bins: Object.values(bins).map((b) => `${b.id} (${b.clips.length})`), synced: syncs.length, vfr: nv, log_or_hdr: nl, proxies: args.proxy ? clips.filter((c) => c.proxy).length : "skipped (--proxy 720 makes them)", warnings: warns });
}

// ---------------------------------------------------------------- shots
const parseMeta = (txt) => {
  const frames = [];
  let cur = null;
  for (const line of String(txt).split("\n")) {
    const f = line.match(/^frame:\d+\s+pts:\d+\s+pts_time:([\d.]+)/);
    if (f) { cur = { t: Number(f[1]) }; frames.push(cur); continue; }
    const k = line.match(/^lavfi\.([\w.]+)=([-\d.eE]+)/);
    if (k && cur) cur[k[1]] = Number(k[2]);
  }
  return frames;
};
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

function shots() {
  need();
  need1("ffmpeg");
  const ing = jsonMaybe(FD(run, "ingest.json")) || die("run footage.mjs ingest first");
  const thr = Number(args.threshold) || 10;
  const every = Number(args.every) || 6;
  const kdir = FD(run, "keyframes");
  fs.mkdirSync(kdir, { recursive: true });
  const result = { threshold: thr, every_s: every, clips: [] };
  for (const c of ing.clips) {
    if (c.error || !c.width) continue;
    const src = c.proxy && fs.existsSync(c.proxy) ? c.proxy : c.path;
    const D = c.duration;
    // one analysis pass: cuts (scdet), then quality per sampled frame (signalstats, blurdetect, siti) at 2 fps on a small picture
    const sc = sh("ffmpeg", ["-hide_banner", "-i", src, "-vf", `scale=320:-2,scdet=threshold=${thr}`, "-an", "-f", "null", "-"]).stderr;
    let cuts = [...String(sc).matchAll(/lavfi\.scd\.time:\s*([\d.]+)/g)].map((m) => Number(m[1])).filter((t) => t > 0.25 && t < D - 0.25);
    const merged = [];
    for (const t of cuts) if (!merged.length || t - merged[merged.length - 1] > 0.4) merged.push(r3(t));
    const q = parseMeta(sh("ffmpeg", ["-hide_banner", "-v", "error", "-i", src, "-vf", "fps=2,scale=320:-2,signalstats,blurdetect,siti,metadata=print:file=-", "-an", "-f", "null", "-"]).stdout);
    let frozen = [], black = [];
    {
      const fz = sh("ffmpeg", ["-hide_banner", "-i", src, "-vf", "freezedetect=n=-60dB:d=1.5", "-an", "-f", "null", "-"]).stderr;
      const fs0 = [...String(fz).matchAll(/freeze_start:\s*([\d.]+)/g)].map((m) => Number(m[1])), fe = [...String(fz).matchAll(/freeze_end:\s*([\d.]+)/g)].map((m) => Number(m[1]));
      frozen = fs0.map((s, i) => [s, fe[i] ?? D]);
      const bk = sh("ffmpeg", ["-hide_banner", "-i", src, "-vf", "blackdetect=d=0.4:pix_th=0.1", "-an", "-f", "null", "-"]).stderr;
      black = [...String(bk).matchAll(/black_start:([\d.]+) black_end:([\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
    }
    let audioFlags = [];
    if (c.audio) {
      const ae = sh("ffmpeg", ["-hide_banner", "-i", src, "-af", "astats=metadata=0:reset=0", "-vn", "-f", "null", "-"]).stderr;
      const pk = [...String(ae).matchAll(/Peak level dB:\s*(-?[\d.]+|-inf)/g)].map((m) => Number(m[1])).filter(Number.isFinite);
      const clipN = [...String(ae).matchAll(/Number of clipped samples:\s*(\d+)/g)].map((m) => Number(m[1]));
      if ((pk.length && Math.max(...pk) >= -0.3) && (clipN.length ? Math.max(...clipN) > 20 : true)) audioFlags.push("clipped-audio");
      const mv = String(sh("ffmpeg", ["-hide_banner", "-i", src, "-af", "volumedetect", "-vn", "-f", "null", "-"]).stderr).match(/mean_volume:\s*(-?[\d.]+) dB/);
      c.mean_volume_db = mv ? Number(mv[1]) : null;
    }
    const bounds = [0, ...merged, D];
    const list = [];
    bounds.slice(1).forEach((e, i) => {
      const s = bounds[i];
      list.push({ id: `${c.id}-s${String(i + 1).padStart(2, "0")}`, in: r3(s), out: r3(e), len: r3(e - s) });
    });
    let n = 0;
    for (const s of list) {
      const rows = q.filter((f) => f.t >= s.in && f.t < s.out);
      const g = (k) => mean(rows.map((r) => r[k]).filter(Number.isFinite));
      const yavg = g("signalstats.YAVG"), ymax = Math.max(...rows.map((r) => r["signalstats.YMAX"] ?? 0), 0), ymin = Math.min(...rows.map((r) => r["signalstats.YMIN"] ?? 255), 255), sat = g("signalstats.SATAVG"), blur = g("blur"), ti = g("siti.ti");
      const flags = [];
      if (rows.length) {
        if (yavg < 45) flags.push("underexposed");
        if (yavg > 205) flags.push("overexposed");
        if (ymax >= 253 && yavg > 150) flags.push("clipped-highlights");
        if (blur != null && blur > 6.5) flags.push("soft-focus");
        if (ti != null && ti > 25 && s.len > 1.5) flags.push("shaky-or-fast");
        if (sat != null && sat < 20 && ymax - ymin < 150) flags.push("flat-or-log");
      }
      if (frozen.some(([a, b]) => a < s.out && b > s.in && Math.min(b, s.out) - Math.max(a, s.in) > s.len * 0.6)) flags.push("frozen");
      if (black.some(([a, b]) => a < s.out && b > s.in && Math.min(b, s.out) - Math.max(a, s.in) > s.len * 0.6)) flags.push("black");
      s.quality = { exposure: yavg == null ? null : r3(yavg), clipped_hi: ymax >= 253, saturation: sat == null ? null : r3(sat), blur: blur == null ? null : r3(blur), motion_ti: ti == null ? null : r3(ti), samples: rows.length };
      s.flags = [...flags, ...audioFlags.filter(() => s === list[0])];
      // keyframes: the middle, plus one every `every` s inside a long take
      const times = [r3(s.in + s.len / 2)];
      if (s.len > every * 1.5) for (let t = s.in + every / 2; t < s.out - 0.5; t += every) times.push(r3(t));
      s.keyframes = [...new Set(times)].sort((a, b) => a - b).slice(0, 24).map((t, k) => {
        const f = path.join(kdir, `${s.id}${k ? "-" + k : ""}.jpg`);
        if (!fs.existsSync(f)) sh("ffmpeg", ["-v", "error", "-y", "-ss", String(t), "-i", src, "-frames:v", "1", "-vf", "scale=480:-2", "-q:v", "4", f]);
        return { t, file: rel(f) };
      });
      s.keyframe = s.keyframes[0] && s.keyframes[0].file;
      if (!args["no-strips"] && n < 600 && s.len >= 0.8) {
        const f = path.join(kdir, `${s.id}-strip.jpg`);
        sh("ffmpeg", ["-v", "error", "-y", "-ss", String(s.in), "-t", String(s.len), "-i", src, "-vf", `fps=${(4 / Math.max(s.len, 0.5)).toFixed(5)},scale=240:-2,tile=4x1`, "-frames:v", "1", "-q:v", "5", f]);
        if (fs.existsSync(f)) s.strip = rel(f);
        n++;
      }
    }
    result.clips.push({ clip: c.id, bin: c.bin, duration: D, shots: list, audio_flags: audioFlags, frozen, black });
  }
  writeFile(FD(run, "shots.json"), JSON.stringify(result, null, 2) + "\n");
  const all = result.clips.flatMap((c) => c.shots);
  const flagged = {};
  for (const s of all) for (const f of s.flags) flagged[f] = (flagged[f] || 0) + 1;
  out({ ok: true, shots: rel(FD(run, "shots.json")), clips: result.clips.length, count: all.length, flagged, note: "Look at the keyframes and strips before logging. ffmpeg here has no drawtext, so stringouts are contact strips, not burnt-in timecode." });
}

// ---------------------------------------------------------------- vision (optional)
const SENSITIVE = [[/[\w.+-]+@[\w-]+\.[\w.-]+/, "email"], [/\b(sk|pk|api|key|token|secret)[-_ ]?[a-z0-9]{16,}\b/i, "key-or-token"], [/\b\+?\d[\d\s().-]{8,}\d\b/, "phone-or-number"], [/\b(password|passwd|pwd)\b\s*[:=]/i, "password"]];
const visionSkip = (why) => { noteDowngrade({ run, what: "Apple Vision (faces, saliency, labels, on-screen text)", instead: "the footage log without them", why: String(why).slice(0, 200) }); out({ ok: true, skipped: true, why }); };
function vision() {
  need();
  const sj = jsonMaybe(FD(run, "shots.json")) || die("run footage.mjs shots first");
  const swift = "/usr/bin/swift";
  if (process.platform !== "darwin" || !fs.existsSync(swift)) visionSkip("Apple Vision needs macOS and /usr/bin/swift; the log works without face boxes, saliency, labels and on-screen text");
  const keyframes = sj.clips.flatMap((c) => c.shots.flatMap((s) => s.keyframes.map((k) => ({ s, k }))));
  const abs = keyframes.map(({ k }) => path.resolve(ws, k.file));
  const results = new Map();
  for (let i = 0; i < abs.length; i += 40) {
    const r = sh(swift, [path.join(HERE, "vision", "vision.swift"), ...abs.slice(i, i + 40)], { timeout: 300000 });
    if (r.status !== 0) { visionSkip(`swift could not run Vision (${String(r.stderr).trim().split("\n").pop()}); continuing without it`); }
    try { for (const o of JSON.parse(r.stdout)) results.set(o.path, o); } catch { visionSkip("Vision returned nothing readable; continuing without it"); }
  }
  let faces = 0, sens = 0;
  for (const c of sj.clips) for (const s of c.shots) {
    const rs = s.keyframes.map((k) => results.get(path.resolve(ws, k.file))).filter((o) => o && !o.error);
    if (!rs.length) continue;
    const text = [...new Set(rs.flatMap((o) => o.text || []))];
    const hits = [...new Set(text.flatMap((t) => SENSITIVE.filter(([re]) => re.test(t)).map(([, n]) => n)))];
    const mid = rs[0];
    s.vision = { faces: Math.max(...rs.map((o) => (o.faces || []).length)), face_boxes: mid.faces || [], people: Math.max(...rs.map((o) => o.humans || 0)), saliency: mid.saliency || [], labels: [...new Map(rs.flatMap((o) => o.labels || []).map((l) => [l.id, l])).values()].slice(0, 8), text, sensitive: hits };
    faces += s.vision.faces ? 1 : 0; sens += hits.length ? 1 : 0;
  }
  writeFile(FD(run, "shots.json"), JSON.stringify(sj, null, 2) + "\n");
  out({ ok: true, keyframes: keyframes.length, shots_with_faces: faces, shots_with_sensitive_text: sens, note: sens ? "Sensitive text on screen (emails, keys, numbers): the logger lists each in `sensitive` with what to do (default: blur)." : undefined });
}

// ---------------------------------------------------------------- transcribe
const FILLERS = new Set(["um", "uh", "er", "erm", "hmm", "mm", "ah"]);
function transcribe() {
  need();
  if (!hasWhisperCli()) die("whisper-cli is not installed (brew install whisper-cpp); nothing else is used for footage transcripts");
  const ing = jsonMaybe(FD(run, "ingest.json")) || die("run footage.mjs ingest first");
  const lang = args.lang && args.lang !== true ? String(args.lang) : "auto";
  const names = args.names && args.names !== true && fs.existsSync(String(args.names)) ? fs.readFileSync(String(args.names), "utf8").split("\n").map((s) => s.trim()).filter(Boolean) : [];
  const prompt = names.length ? `Names: ${names.join(", ")}.` : null;
  const tdir = FD(run, "transcripts");
  fs.mkdirSync(tdir, { recursive: true });
  const md = [];
  const warnings = [], summary = [];
  const intros = {};
  for (const c of ing.clips) {
    if (c.error || !c.audio) continue;
    const dec = decideLanguage({ file: c.path, lang, tag: c.audio.lang, duration: c.duration });
    if (dec.warning && !warnings.includes(dec.warning)) warnings.push(dec.warning);
    if (dec.blocked || !dec.model) { warnings.push(`${c.id}: not transcribed: ${dec.blocked || "no whisper model installed"}`); summary.push({ clip: c.id, lang: dec.lang, error: dec.blocked || "no model" }); continue; }
    try {
      let words = [], model = null;
      const stereo = args["channels-as-speakers"] && c.audio.channels === 2;
      if (stereo) {
        for (const [ch, sp] of [["c0", "S1"], ["c1", "S2"]]) {
          const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rasanai-ch-"));
          const mono = path.join(tmp, `${ch}.wav`);
          sh("ffmpeg", ["-v", "error", "-y", "-i", c.path, "-vn", "-af", `pan=mono|c0=${ch}`, "-ar", "16000", "-c:a", "pcm_s16le", mono]);
          const r = whisperTranscribe(mono, { model: dec.model.file, lang: dec.lang, prompt, tmp });
          words.push(...r.words.map((w) => ({ ...w, speaker: sp }))); model = r.model;
          fs.rmSync(tmp, { recursive: true, force: true });
        }
        words.sort((a, b) => a.start - b.start);
      } else {
        const r = whisperTranscribe(c.path, { model: dec.model.file, lang: dec.lang, prompt });
        words = r.words.map((w) => ({ ...w, speaker: "S1" })); model = r.model;
      }
      words = words.map((w) => ({ ...w, end: r3(Math.min(w.end, c.duration)) })).filter((w) => w.end > w.start);
      fs.writeFileSync(path.join(tdir, `${c.id}.words.json`), JSON.stringify(words, null, 1) + "\n");
      const text = words.map((w) => w.text).join(" ");
      const low = words.filter((w) => w.conf != null && w.conf < 0.5);
      let note = "";
      if (dec.lang === "en" && !dec.verified) { const ck = englishLooks(text); if (!ck.ok) { note = " (does not read like English: re-run with --lang)"; warnings.push(`${c.id}: the transcript does not read like English ${JSON.stringify(ck)}: the speech may be another language; re-run with --lang <code>`); } }
      md.push(`## ${c.id}  (${c.name}, ${c.duration} s, ${dec.lang}${dec.verified ? "" : ", language unverified"}${note})`, "");
      let line = [], t0 = null, sp = null;
      const flush = () => { if (line.length) md.push(`[${fmt(t0)}] ${sp}: ${line.join(" ")}`); line = []; };
      for (const w of words) { if (t0 == null || w.speaker !== sp || w.start - (line.last ?? w.start) > 1.2) { flush(); t0 = w.start; sp = w.speaker; } line.push(w.conf != null && w.conf < 0.5 ? `${w.text}?` : w.text); line.last = w.end; }
      flush();
      md.push("");
      for (const m of text.matchAll(/\b(?:I'm|I am|my name is|this is)\s+([A-Z][\p{L}'-]+(?:\s+[A-Z][\p{L}'-]+)?)/gu)) (intros[m[1]] ||= { title: null, aliases: [], said_at: [] }).said_at.push({ clip: c.id, t: words.find((w) => text.indexOf(w.text) >= 0)?.start ?? 0 });
      summary.push({ clip: c.id, lang: dec.lang, verified: dec.verified, words: words.length, low_confidence: low.length, fillers: words.filter((w) => FILLERS.has(w.text.toLowerCase().replace(/[^a-z]/g, ""))).length, model });
    } catch (e) { warnings.push(`${c.id}: ${String(e.message).split("\n").pop()}`); summary.push({ clip: c.id, error: String(e.message).split("\n").pop() }); }
  }
  writeFile(FD(run, "transcript.md"), `# Transcript\n\n(words marked ? are under 50% confidence; the names glossary is footage/names.json)\n\n${md.join("\n")}\n`);
  const nf = FD(run, "names.json");
  const prev = jsonMaybe(nf) || {};
  for (const n of names) prev[n] ||= { title: null, aliases: [], said_at: [] };
  for (const [n, v] of Object.entries(intros)) prev[n] ||= v;
  writeFile(nf, JSON.stringify(prev, null, 2) + "\n");
  out({ ok: true, transcript: rel(FD(run, "transcript.md")), clips: summary, names: Object.keys(prev), warnings, models_installed: installedModels().map((m) => m.name), note: "Speakers are S1 unless --channels-as-speakers (one mic per stereo channel). The user confirms names once; a wrong name never reaches a caption." });
}
const fmt = (t) => `${String(Math.floor(t / 60)).padStart(2, "0")}:${(t % 60).toFixed(1).padStart(4, "0")}`;

// ---------------------------------------------------------------- bites: candidate sentences from word timings
function bites() {
  need();
  const ing = jsonMaybe(FD(run, "ingest.json")) || die("run footage.mjs ingest first");
  const min = Number(args.min) || 1.5, max = Number(args.max) || 25;
  const list = [];
  const files = fs.existsSync(FD(run, "transcripts")) ? fs.readdirSync(FD(run, "transcripts")).filter((f) => f.endsWith(".words.json")) : [];
  for (const f of files) {
    const clip = f.replace(/\.words\.json$/, "");
    const words = jsonMaybe(FD(run, "transcripts", f));
    if (!Array.isArray(words) || !words.length) continue;
    const dur = (ing.clips.find((c) => c.id === clip) || {}).duration || Infinity;
    let cur = [];
    const close = () => {
      if (!cur.length) return;
      const a = cur[0], b = cur[cur.length - 1], len = b.end - a.start;
      const text = cur.map((w) => w.text).join(" ");
      if (len >= min && len <= max) {
        const confs = cur.map((w) => w.conf).filter((x) => x != null);
        const fill = cur.filter((w) => FILLERS.has(w.text.toLowerCase().replace(/[^a-z]/g, ""))).length;
        list.push({ id: `c${String(list.length + 1).padStart(3, "0")}`, clip, speaker: a.speaker || "S1", in: r3(Math.max(0, a.start - 0.08)), out: r3(Math.min(dur, b.end + 0.12)), len: r3(len), text, words: cur.length, wps: r3(cur.length / len), conf: confs.length ? r3(confs.reduce((x, y) => x + y, 0) / confs.length) : null, fillers: fill, starts_cap: /^[A-Z]/.test(text), ends_stop: /[.!?]$/.test(text), standalone_guess: /^[A-Z]/.test(text) && /[.!?]$/.test(text) && !/^(and|but|so|because|which|that|then|or)\b/i.test(text) });
      }
      cur = [];
    };
    for (let i = 0; i < words.length; i++) {
      const w = words[i], prev = words[i - 1];
      if (prev && (w.start - prev.end >= 0.7 || w.speaker !== prev.speaker || /[.!?]$/.test(prev.text))) close();
      cur.push(w);
    }
    close();
  }
  writeFile(FD(run, "bites-candidates.json"), JSON.stringify({ min, max, count: list.length, candidates: list }, null, 2) + "\n");
  out({ ok: true, candidates: rel(FD(run, "bites-candidates.json")), count: list.length, note: "Candidates are a draft: the selects producer rates them, joins the ones that belong together and writes footage/selects.json" });
}

// ---------------------------------------------------------------- speech cleanup
function cleanSpeech() {
  need1("ffmpeg");
  let src = args.in && args.in !== true ? path.resolve(String(args.in)) : null;
  if (!src && run && args.clip && args.clip !== true) {
    const ing = jsonMaybe(FD(run, "ingest.json"));
    const c = ((ing && (ing.clips || ing.files)) || []).find((x) => x.id === args.clip || slug(x.path || "") === args.clip);
    if (c && c.path) src = c.path;
  }
  if (!src || !fs.existsSync(src)) die("--in <clip> (or --run <run> --clip <id> from ingest.json) is required, and must exist");
  const isVideo = VIDEO.test(src);
  const dest = args.out && args.out !== true ? path.resolve(String(args.out)) : path.join(run || path.dirname(src), ...(run ? ["footage", "clean"] : ["clean"]), `${slug(path.basename(src))}${isVideo ? ".mp4" : ".wav"}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (path.resolve(dest) === path.resolve(src)) die("--out must not be the original file");
  const have = String(sh("ffmpeg", ["-hide_banner", "-filters"]).stdout || "");
  const chain = speechChain({ lufs: args.lufs != null && args.lufs !== true ? Number(args.lufs) : -16, denoise: !args["no-denoise"] && /\bafftdn\b/.test(have) }).split(",").filter((n) => { const f = n.split("=")[0]; return !/^(afftdn|agate|acompressor|loudnorm|equalizer|highpass)$/.test(f) || new RegExp("\\b" + f + "\\b").test(have); }).join(",");
  const argv = ["-v", "error", "-y", "-i", src, ...(isVideo ? ["-map", "0:v:0", "-map", "0:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k"] : ["-vn", "-c:a", "pcm_s16le"]), "-af", chain, "-ar", "48000", dest];
  const r = sh("ffmpeg", argv);
  if (r.status !== 0 || !fs.existsSync(dest)) { noteDowngrade({ run: run || undefined, what: "speech cleanup of a rush", instead: "the original audio", why: String(r.stderr || "ffmpeg failed").trim().split("\n").pop().slice(0, 200) }); die(`the cleanup chain failed: ${String(r.stderr || "").trim().split("\n").pop()}`); }
  out({ ok: true, in: rel(src), out: rel(dest), chain, note: "a first listen is still the user's: this is a safe default, not a mastering pass" });
}

// ---------------------------------------------------------------- checks
function report(name, { P, W }, extra = {}) { out({ ok: !P.length, check: name, problems: P, warnings: W, ...extra }, P.length ? 2 : 0); }

if (cmd === "ingest") ingest();
else if (cmd === "shots") shots();
else if (cmd === "vision") vision();
else if (cmd === "transcribe") transcribe();
else if (cmd === "bites") bites();
else if (cmd === "clean-speech") cleanSpeech();
else if (cmd === "merge-log") { need(); out({ ok: true, rows: mergeLogs(run), log: rel(FD(run, "log.json")) }); }
else if (cmd === "check-log") { need(); report("log", checkLog(run)); }
else if (cmd === "check-selects") { need(); report("selects", checkSelects(run, { minGood: args["min-good"] != null ? Number(args["min-good"]) : 8 })); }
else if (cmd === "check-paper") {
  need();
  if (!args.paper || args.paper === true) die("--paper <story/paper-X.json> required");
  const r = checkPaper(run, path.resolve(String(args.paper)), { length: Number(args.length) || 0 });
  report("paper edit", r, { stats: r.stats });
} else die("usage: footage.mjs ingest|shots|vision|transcribe|bites|clean-speech|merge-log|check-log|check-selects|check-paper … (see the header)");
