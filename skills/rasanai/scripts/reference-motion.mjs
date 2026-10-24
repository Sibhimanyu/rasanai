#!/usr/bin/env node
// Reference motion: measure a reference video (or take manual notes) into <run>/reference-motion.json (contract A).
// ffmpeg/ffprobe only, no Python, deterministic for the same file. The source file is only read, never copied; its
// absolute path lives solely in <run>/reference-source.private.json. Estimates are labelled, never exact curves.
//
//   node reference-motion.mjs ingest    --run <dir> --path <video> --rights inspiration-only|owned|licensed
//   node reference-motion.mjs analyze   --run <dir> [--fast]            (uses the ingested file)
//   node reference-motion.mjs analyze   --run <dir> --manual-notes "<text>" [--rights ...]   (no video: empty measurements)
//   node reference-motion.mjs summarize --run <dir> --for crew          (<= 60-line text packet)
//   node reference-motion.mjs check     --run <dir>                     (validates reference-motion.json)
// JSON on stdout (summarize prints text). Exit 0 ok, 1 failed check / missing reference, 2 usage error.
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "./lib/common.mjs";
import { safeVideoPath, sha256File, sha256Text, probe, haveTools, RIGHTS, round } from "./lib/reference-motion/probe.mjs";
import { detectCuts, sampleFrames, palette, buildShots, audioHits } from "./lib/reference-motion/analyze.mjs";
import { emptyDoc, aspectOf, standardUncertainties, motionPatterns, validate, summarize } from "./lib/reference-motion/doc.mjs";

const args = parseArgs();
const cmd = args._[0];
const out = (o, code = 0) => { process.stdout.write(JSON.stringify(o, null, 2) + "\n"); process.exit(code); };
const fail = (msg, code = 1) => { process.stderr.write(`reference-motion: ${msg}\n`); process.exit(code); };
const usage = (msg) => fail(`${msg}\nusage: reference-motion.mjs ingest|analyze|summarize|check --run <dir> [...]`, 2);

if (!["ingest", "analyze", "summarize", "check"].includes(cmd)) usage(cmd ? `unknown command "${cmd}"` : "no command");
if (typeof args.run !== "string" || !args.run) usage("--run <dir> is required");
const RUN = path.resolve(args.run);
const DOC = path.join(RUN, "reference-motion.json"), PRIV = path.join(RUN, "reference-source.private.json");
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const writeJson = (p, o) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(o, null, 2) + "\n"); };

function rights() {
  const r = args.rights === undefined ? "inspiration-only" : args.rights;
  if (!RIGHTS.includes(r)) usage(`--rights must be one of ${RIGHTS.join("|")}`);
  return r;
}

if (cmd === "ingest") {
  if (!args.path) usage("--path <video> is required");
  if (args.rights === undefined || args.rights === true) usage("--rights is required (inspiration-only|owned|licensed)");
  const r = rights();
  if (!haveTools()) fail("ffmpeg/ffprobe not found on PATH");
  let file;
  try { file = safeVideoPath(args.path); } catch (e) { fail(e.message); }
  let meta;
  try { meta = probe(file); } catch (e) { fail(e.message); }
  const sha256 = sha256File(file), basename = path.basename(file);
  writeJson(PRIV, { schema_version: 1, path: file, sha256, rights: r, basename, probe: meta, note: "private: absolute path, never copy into reference-motion.json" });
  out({ ok: true, reference_id: "ref-" + sha256.slice(0, 12), source: { kind: "linked-file", sha256, rights: r, basename }, probe: meta, private_manifest: path.basename(PRIV) });
}

if (cmd === "analyze") {
  const prior = fs.existsSync(DOC) ? (() => { try { return readJson(DOC); } catch { return null; } })() : null;
  let doc;
  if (args["manual-notes"] !== undefined) {
    const notes = typeof args["manual-notes"] === "string" ? args["manual-notes"].trim() : "";
    if (!notes) usage("--manual-notes needs text");
    doc = emptyDoc({ kind: "manual-notes", sha256: sha256Text(notes), rights: rights(), basename: "manual-notes" });
    doc.analysis.uncertainties = [
      `Manual notes only, nothing was measured: "${notes.replace(/\s+/g, " ").slice(0, 400)}"`,
      "Durations, cuts, palette, energy and sound hits are unknown; treat every claim in the notes as the owner's description.",
    ];
  } else {
    if (!fs.existsSync(PRIV)) fail(`no reference ingested in ${RUN}. Run: reference-motion.mjs ingest --run <dir> --path <video> --rights ..., or analyze --manual-notes "<text>"`);
    let priv;
    try { priv = readJson(PRIV); } catch { fail("reference-source.private.json is unreadable"); }
    if (!haveTools()) fail("ffmpeg/ffprobe not found on PATH");
    let file;
    try { file = safeVideoPath(priv.path); } catch (e) { fail(`the ingested reference is no longer usable: ${e.message}`); }
    if (sha256File(file) !== priv.sha256) fail("the reference file changed since ingest (sha256 differs); ingest it again");
    const fast = !!args.fast;
    const meta = probe(file);
    if (!(meta.duration_s > 0)) fail("could not determine the video duration");
    doc = emptyDoc({ kind: "linked-file", sha256: priv.sha256, rights: priv.rights, basename: priv.basename });
    const cuts = detectCuts(file, fast, meta.duration_s);
    const frames = sampleFrames(file, meta.duration_s, fast);
    const shots = buildShots(meta.duration_s, cuts, frames);
    const audio = meta.has_audio ? audioHits(file, meta.duration_s) : { hits: [], ok: false };
    const A = doc.analysis;
    Object.assign(A, { duration_s: meta.duration_s, fps_observed: meta.fps_observed, aspect: aspectOf(meta.width, meta.height), width: meta.width, height: meta.height, has_audio: meta.has_audio });
    A.cuts_s = cuts;
    A.energy_arc = shots.map((s) => s._energy);
    A.shots = shots.map(({ _energy, ...s }) => s);
    A.palette_observed = palette(frames);
    A.sound_hits_s = audio.hits;
    A.motion_patterns = motionPatterns(A.shots, cuts, meta.duration_s, audio.hits);
    A.mode = fast ? "fast" : "full";
    A.sampled_frames = frames.length;
    A.uncertainties = standardUncertainties();
    if (fast) A.uncertainties.push(`Fast mode: ${frames.length} sampled frames at 64x36 statistics; short shots and subtle moves can be missed.`);
    if (meta.has_audio && !audio.ok) A.uncertainties.push("Audio stream present but could not be decoded; sound hits are empty.");
    if (!meta.has_audio) A.uncertainties.push("No audio stream: sound hits are empty, not zero-impact.");
    if (!cuts.length) A.uncertainties.push("No cuts found; dissolves, wipes and in-shot transitions are not detected.");
  }
  if (prior && Array.isArray(prior.recipe) && prior.source?.sha256 === doc.source.sha256) doc.recipe = prior.recipe; // keep the recipe lane's work
  const errs = validate(doc);
  if (errs.length) fail("internal error, produced an invalid file: " + errs.join("; "));
  writeJson(DOC, doc);
  out({ ok: true, file: path.basename(DOC), reference_id: doc.reference_id, kind: doc.source.kind, shots: doc.analysis.shots.length, cuts: doc.analysis.cuts_s.length, sound_hits: doc.analysis.sound_hits_s.length, mode: doc.analysis.mode || null });
}

function loadDoc() {
  if (!fs.existsSync(DOC)) fail(`no reference-motion.json in ${RUN}. Ingest and analyze a reference first (or analyze --manual-notes "<text>").`);
  try { return readJson(DOC); } catch { fail("reference-motion.json is not valid JSON"); }
}

if (cmd === "summarize") {
  if (args.for !== undefined && args.for !== "crew") usage('--for must be "crew"');
  const doc = loadDoc();
  const errs = validate(doc);
  if (errs.length) fail("reference-motion.json is invalid, run check: " + errs[0]);
  process.stdout.write(summarize(doc) + "\n");
  process.exit(0);
}

if (cmd === "check") {
  const doc = loadDoc();
  const errs = validate(doc);
  out({ ok: errs.length === 0, errors: errs, reference_id: doc.reference_id || null }, errs.length ? 1 : 0);
}
