#!/usr/bin/env node
// refs.mjs: automatic reference-film ingestion. The owner's own reference films made the redesign work when they were broken down by hand
// (.context/creative-research/R5, R6); this does the measuring part itself and prepares the reading part for agents/reference-analyst.md.
//
//   node refs.mjs ingest    <video|dir|url>[,more] --run <run> [--no-whisper] [--max 4]
//        -> <run>/refs/<id>/ { sheets/s_NN.jpg (4x3 tiles, 2-3 fps), bar-frames/*.png, scene_score.tsv, audio/{music-map.json, ebur_curve.tsv,
//           bands_per_sec.tsv, sfx_events.json, words.json}, stats.json, source.private.json } and <run>/refs/index.json
//        stats.json: cuts at 0.1/0.25/0.4, shot list (median/p10/p90), music event map (BPM, hits, breaks), ebur128 curve + LUFS + LRA, band energy
//        per second, SFX onsets (and per 10 s), whisper word timings, a sound-mode guess (vo|song|instrumental|sfx-led), type-follows-audio sync,
//        hook timing. URLs come through yt-dlp when installed. The source file is only read: its path lives only in source.private.json.
//   node refs.mjs summarize --run <run>      -> <run>/refs/summary.json (shared rules + bounded per-film targets the gates and writers read)
//   node refs.mjs check     --run <run>      -> validates every <id>/breakdown.json (the reference-analyst's output)
//   node refs.mjs targets   --run <run>      -> the bounded per-film targets, one JSON line
//   node refs.mjs promote   <move-id> --run <run> --approved   -> copies <run>/refs/moves-proposed/<move-id>.json into library/moves (a person approves first)
//   node refs.mjs list      --run <run>
// References inform, never copy: no frame, audio or exact type of a reference goes into a film (references/reference-films.md in SKILL.md terms).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { parseArgs } from "./lib/common.mjs";
import { analyse, median, pct, r1, r2 } from "./lib/refs-stats.mjs";
import { summarizeRefs, checkBreakdown, MOVE_RE } from "./lib/ref-targets.mjs";

const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VIDEO_EXT = /\.(mp4|mov|m4v|webm|mkv|avi)$/i;
const args = parseArgs();
const cmd = args._[0];
const out = (o, code = 0) => { process.stdout.write(JSON.stringify(o, null, 2) + "\n"); process.exit(code); };
const die = (m, code = 1) => { process.stderr.write(`refs: ${m}\n`); process.exit(code); };
const usage = (m) => die(`${m}\nusage: refs.mjs ingest <video|dir|url> --run <run> | summarize|check|targets|list --run <run> | promote <move-id> --run <run> --approved`, 2);
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const writeJson = (p, o) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(o, null, 2) + "\n"); };
if (!["ingest", "summarize", "check", "targets", "promote", "list"].includes(cmd)) usage(cmd ? `unknown command "${cmd}"` : "no command");
if (typeof args.run !== "string" || !args.run) usage("--run <run> is required");
const RUN = path.resolve(args.run), REFS = path.join(RUN, "refs");
const slug = (s) => String(s).toLowerCase().replace(/\.[^.]+$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 28) || "ref";
const have = (bin) => !spawnSync(bin, ["--version"], { stdio: "ignore" }).error;

function idFor(file) {
  const st = fs.statSync(file), fd = fs.openSync(file, "r"), buf = Buffer.alloc(Math.min(1 << 20, st.size));
  fs.readSync(fd, buf, 0, buf.length, 0); fs.closeSync(fd);
  return `${slug(path.basename(file))}-${crypto.createHash("sha1").update(buf).update(String(st.size)).digest("hex").slice(0, 6)}`;
}
function expand(inputs) {
  const files = [], notes = [];
  for (const raw of inputs) {
    const x = raw.trim().replace(/^~(?=\/|$)/, process.env.HOME || "~");
    if (!x) continue;
    if (/^https?:\/\//i.test(x)) {
      if (!have("yt-dlp")) { notes.push({ input: x, skipped: "yt-dlp is not installed (brew install yt-dlp); download the film yourself and pass the file" }); continue; }
      const dest = path.join(REFS, "_downloads", crypto.createHash("sha1").update(x).digest("hex").slice(0, 8));
      fs.mkdirSync(dest, { recursive: true });
      const r = spawnSync("yt-dlp", ["--no-playlist", "-f", "bv*[height<=720]+ba/b[height<=720]/b", "--merge-output-format", "mp4", "-o", path.join(dest, "source.%(ext)s"), x], { encoding: "utf8", maxBuffer: 1 << 26 });
      const f = fs.existsSync(dest) ? fs.readdirSync(dest).find((n) => VIDEO_EXT.test(n)) : null;
      if (r.status !== 0 || !f) { notes.push({ input: x, skipped: `yt-dlp failed: ${String(r.stderr || "").trim().split("\n").pop()}` }); continue; }
      files.push({ file: path.join(dest, f), label: slug(new URL(x).pathname.split("/").filter(Boolean).pop() || new URL(x).hostname), url: x });
    } else {
      const p = path.resolve(x);
      if (!fs.existsSync(p)) { notes.push({ input: x, skipped: "not found" }); continue; }
      if (fs.statSync(p).isDirectory()) for (const n of fs.readdirSync(p).sort()) { if (VIDEO_EXT.test(n)) files.push({ file: path.join(p, n), label: slug(n) }); }
      else if (VIDEO_EXT.test(p)) files.push({ file: p, label: slug(path.basename(p)) });
      else notes.push({ input: x, skipped: "not a video file" });
    }
  }
  return { files, notes };
}

if (cmd === "ingest") {
  const raw = args._.slice(1).join(",").split(",");
  if (!raw.filter(Boolean).length) usage("give a video, a folder or a URL");
  if (!have("ffmpeg") || spawnSync("ffprobe", ["-version"], { stdio: "ignore" }).error) die("ffmpeg/ffprobe not found on PATH");
  const { files, notes } = expand(raw);
  const max = Math.max(1, Number(args.max) || 4);
  const index = readJson(path.join(REFS, "index.json")) || { version: 1, refs: [] };
  const done = [];
  for (const f of files.slice(0, max)) {
    const id = idFor(f.file), dir = path.join(REFS, id);
    fs.mkdirSync(dir, { recursive: true });
    process.stderr.write(`refs: ingest ${id}\n`);
    try {
      const stats = analyse(f.file, dir, { log: (m) => process.stderr.write(`  ${id}: ${m}\n`), noWhisper: !!args["no-whisper"] });
      stats.id = id;
      writeJson(path.join(dir, "stats.json"), stats);
      writeJson(path.join(dir, "source.private.json"), { id, path: f.url ? null : f.file, url: f.url || null, label: f.label, note: "private: never copy this path, the frames or the audio into a film; the reference informs, it is never placed" });
      const row = { id, label: f.label, duration_s: stats.video.duration_s, sound_mode: stats.sound_mode.mode, shots: stats.shots.count, status: "measured" };
      index.refs = index.refs.filter((x) => x.id !== id).concat(row);
      done.push(row);
    } catch (e) { notes.push({ input: f.file, skipped: `analysis failed: ${String(e.message || e).slice(0, 200)}` }); }
  }
  if (files.length > max) notes.push({ skipped: `${files.length - max} more film(s) beyond --max ${max}` });
  index.updated = new Date().toISOString();
  writeJson(path.join(REFS, "index.json"), index);
  fs.mkdirSync(path.join(REFS, "moves-proposed"), { recursive: true });
  out({ ok: done.length > 0, ingested: done, notes, next: done.length ? `dispatch reference-analyst once per id (sheets + stats.json -> breakdown.json, breakdown.md), then: node scripts/refs.mjs summarize --run ${args.run}` : "nothing was ingested" }, done.length ? 0 : 1);
}

if (cmd === "list") {
  const idx = readJson(path.join(REFS, "index.json")) || { refs: [] };
  out({ refs: idx.refs.map((r) => ({ ...r, breakdown: fs.existsSync(path.join(REFS, r.id, "breakdown.json")) })), summary: fs.existsSync(path.join(REFS, "summary.json")) });
}

if (cmd === "summarize") {
  const s = summarizeRefs(RUN);
  if (!s) die(`no ingested references in ${REFS}; run: refs.mjs ingest <video> --run <run>`);
  writeJson(path.join(REFS, "summary.json"), s);
  out({ ok: true, file: "refs/summary.json", films: s.films.length, shot_median_s: s.rules.shot_length.median_s, sfx_per_10s: s.rules.sfx.per_10s_median, sound_mode: s.rules.sound_mode.dominant, targets: s.targets });
}

if (cmd === "targets") { const s = readJson(path.join(REFS, "summary.json")); out(s ? s.targets : { none: true }); }

if (cmd === "check") {
  const idx = readJson(path.join(REFS, "index.json"));
  if (!idx || !idx.refs.length) die("no refs/index.json: ingest first");
  const mi = readJson(path.join(SKILL_DIR, "library", "moves", "index.json")), moveIds = new Set(((mi && mi.moves) || []).map((m) => m.id));
  const P = [], W = [], films = [];
  for (const r of idx.refs) {
    const dir = path.join(REFS, r.id);
    if (!fs.existsSync(path.join(dir, "stats.json"))) { P.push(`${r.id}: stats.json is missing`); continue; }
    const b = readJson(path.join(dir, "breakdown.json")), c = checkBreakdown(b, r.id, moveIds);
    if (!fs.existsSync(path.join(dir, "breakdown.md"))) P.push(`${r.id}: breakdown.md is missing`);
    P.push(...c.P); W.push(...c.W); films.push(r.id);
  }
  out({ ok: P.length === 0, problems: P, warnings: W, films }, P.length ? 2 : 0);
}

if (cmd === "promote") {
  const id = args._[1];
  if (!id || !MOVE_RE.test(id)) usage("give the proposed move id (kebab-case)");
  if (!args.approved) die("promote needs --approved: a person approves a proposed move first (show them <run>/refs/moves-proposed/" + id + ".json)", 2);
  const src = path.join(REFS, "moves-proposed", `${id}.json`), mv = readJson(src);
  if (!mv) die(`${src} is missing or not valid JSON`);
  const lib = path.join(SKILL_DIR, "library", "moves"), idxFile = path.join(lib, "index.json"), index = readJson(idxFile);
  if (!index || !Array.isArray(index.moves)) die("library/moves/index.json is unreadable");
  if (mv.id !== id) die(`the file's id is "${mv.id}", expected "${id}"`);
  if (index.moves.some((m) => m.id === id) || fs.existsSync(path.join(lib, `${id}.json`))) die(`a move "${id}" already exists in library/moves`, 2);
  const miss = ["name", "family", "description", "use_when", "carriers", "beat_roles", "recipe"].filter((k) => mv[k] == null || mv[k] === "");
  if (miss.length) die(`the proposed move lacks ${miss.join(", ")}`, 2);
  const bad = (mv.carriers || []).filter((c) => !(index.carrier_kinds || []).includes(c) && !["world-image", "object", "word-line"].includes(c));
  const n = Math.max(0, ...index.moves.map((m) => m.n || 0)) + 1;
  const file = { ...mv, n, source: (mv.source || []).map((s) => ({ video: s.video, brand: s.brand, start_s: s.start_s, end_s: s.end_s })), needs: mv.needs || [] };
  fs.writeFileSync(path.join(lib, `${id}.json`), JSON.stringify(file, null, 2) + "\n");
  index.moves.push({ id, n, name: mv.name, family: mv.family, file: `${id}.json`, use_when: mv.use_when, carriers: mv.carriers, beat_roles: mv.beat_roles, runtime: (mv.recipe && mv.recipe.runtime) || [], duration_s: mv.duration_s || { min: 1, max: 3 }, needs: mv.needs || [] });
  fs.writeFileSync(idxFile, JSON.stringify(index, null, 2) + "\n");
  out({ ok: true, promoted: id, n, file: `library/moves/${id}.json`, unknown_carriers: bad, note: "run: node scripts/moves.mjs list to see it; commit it with the skill's Unreleased notes" });
}
