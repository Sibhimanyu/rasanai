// earshot adapter: an OPTIONAL, isolated dependency (Leonxlnx/earshot, MIT, https://github.com/Leonxlnx/earshot). It is the "ears" and a bank of 252 code-made
// sound effects. HARD RULES: it runs ONLY as a subprocess of its own venv (default ~/.cache/rasanai/earshot-venv, Python 3.12 made by uv); nothing here
// imports or spawns the system Python (librosa/numba on Python 3.14 crashes this Mac). EARSHOT_BIN overrides the binary; EARSHOT_DISABLE=1 turns it off.
//   available()                       -> true when the binary exists (cheap, no process spawned)
//   sfxList({kind,category}) / sfxRender(id,out,{dur,apex,pitch,weight,peak,seed}) / kitInit / kitRender / kitCheck / measure / sheet / critique
//   launchKit()                       -> the `launch` preset kit (placement against the music bed and the cut), written once to the cache
//   renderCue(kind,{at,dir,name,...}) -> a bank sound for a cue kind, aimed at the picture: {file, role, sound, sync_point_s, offset_s, duration_s, level_db, bed_db}
//   setup({print})                    -> creates the venv with uv + Python 3.12, or returns the exact steps when uv is missing
// critique's verdict and score are NEVER used (it rated a weak film 1.0 and an excellent one 0.897); only techFindings() reads its technical rows, as warnings.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

export const HOME = path.join(os.homedir(), ".cache", "rasanai");
export const VENV = path.join(HOME, "earshot-venv");
export const SOURCE = "earshot @ git+https://github.com/Leonxlnx/earshot@main";
const r3 = (x) => Math.round(x * 1000) / 1000;

// how far a cue's peak sits over the bed at its time, dB: the kit's bed_db (a number or [lo, hi]) else the fallback, always inside 0-6 dB
export function overBed(bedDb, fallback = 3) {
  const v = Array.isArray(bedDb) ? (Number(bedDb[0]) + Number(bedDb[bedDb.length - 1])) / 2 : Number(bedDb);
  const x = Number.isFinite(v) && bedDb != null ? v : fallback;
  return Math.max(0, Math.min(6, x));
}

export function binPath() {
  if (process.env.EARSHOT_BIN) return process.env.EARSHOT_BIN;
  return path.join(VENV, process.platform === "win32" ? "Scripts" : "bin", process.platform === "win32" ? "earshot.exe" : "earshot");
}
export function available() {
  if (process.env.EARSHOT_DISABLE === "1") return false;
  try { fs.accessSync(binPath(), fs.constants.X_OK); return true; } catch { return false; }
}

// one call, with a timeout. Returns the parsed --json result; throws a short error otherwise. The environment is scrubbed of anything that could pull in another Python.
export function run(argv, { timeout = 120000, json = true } = {}) {
  if (!available()) throw new Error("earshot is not installed (node scripts/sound.mjs earshot-setup)");
  const env = { ...process.env, PYTHONNOUSERSITE: "1", PYTHONDONTWRITEBYTECODE: "1", PYTHONUNBUFFERED: "1" };
  delete env.PYTHONPATH; delete env.PYTHONHOME;
  const r = spawnSync(binPath(), [...argv, ...(json ? ["--json"] : [])], { encoding: "utf8", timeout, maxBuffer: 128 * 1024 * 1024, env });
  if (r.error) throw new Error(`earshot ${argv[0]} ${r.error.code === "ETIMEDOUT" ? `timed out after ${timeout / 1000} s` : r.error.message}`);
  if (r.status !== 0) throw new Error(`earshot ${argv.slice(0, 2).join(" ")} failed: ${String(r.stderr || r.stdout).trim().split("\n").slice(-2).join(" ").slice(0, 300)}`);
  if (!json) return String(r.stdout);
  const s = String(r.stdout);
  try { return JSON.parse(s); } catch { const m = s.match(/\{[\s\S]*\}\s*$/); if (m) return JSON.parse(m[0]); throw new Error(`earshot ${argv[0]}: output is not JSON`); }
}

export const sfxList = ({ kind, category } = {}) => run(["sfx", "list", ...(kind ? ["--kind", kind] : []), ...(category ? ["--category", category] : [])], { timeout: 60000 });
export function sfxRender(id, out, { dur, apex, pitch, weight, peak, seed } = {}) {
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  const a = ["sfx", "render", id, "-o", path.resolve(out)];
  if (dur != null) a.push("--dur", String(r3(dur)));
  if (apex != null) a.push("--apex", String(r3(apex)));
  if (pitch != null) a.push("--pitch", String(pitch));
  if (weight != null) a.push("--weight", String(r3(weight)));
  if (peak != null) a.push("--peak", String(peak));
  if (seed != null) a.push("--seed", String(seed));
  return run(a, { timeout: 60000 });
}
export const kitInit = (out, preset = "launch") => run(["kit", "init", "--preset", preset, "-o", path.resolve(out), "--force"], { timeout: 60000 });
export const kitRender = (kit, dir) => run(["kit", "render", path.resolve(kit), "--out", path.resolve(dir)], { timeout: 180000 });
export const kitCheck = (kit, dir) => run(["kit", "check", path.resolve(kit), ...(dir ? ["--out", path.resolve(dir)] : [])], { timeout: 180000 });
export const measure = (files, { light = false } = {}) => run(["measure", ...(light ? ["--light"] : []), ...[].concat(files).map((f) => path.resolve(f))], { timeout: 180000 });
export function sheet(file, out, { video, cues, from, to, detail, width } = {}) {
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  const a = ["sheet", path.resolve(file), "-o", path.resolve(out)];
  if (video) a.push("--video", path.resolve(video));
  if (cues) a.push("--cues", typeof cues === "string" ? cues : cues.join(","));
  if (from != null) a.push("--from", String(from));
  if (to != null) a.push("--to", String(to));
  if (detail) a.push("--detail", detail);
  if (width) a.push("--width", String(width));
  return run(a, { timeout: 300000 });
}
export const critique = (file, { video, fast = true } = {}) => run(["critique", path.resolve(file), ...(video ? ["--video", path.resolve(video)] : []), ...(fast ? ["--fast"] : [])], { timeout: 300000 });

// ---- the launch kit: which bank sound plays each role and where it sits against the cut (cached; no models)
let KIT = null;
export function launchKit() {
  if (KIT) return KIT;
  const f = path.join(HOME, "earshot-kit-launch.json");
  if (!fs.existsSync(f)) { fs.mkdirSync(HOME, { recursive: true }); kitInit(f, "launch"); }
  return (KIT = JSON.parse(fs.readFileSync(f, "utf8")));
}

// sfx-plan cue kinds -> kit roles (null: use the first bank sound whose `kinds` has it, see BANK_KIND)
export const ROLE_OF = { click: "land.light", type: "key", key: "key", land: "land", snap: "snap", pop: "pop", toast: "click.confirm", count: "bell", reveal: "hit", logo: "hit", whoosh: "whoosh.short", riser: "riser", glitch: null, error: null };
const BANK_KIND = { glitch: "glitch", error: "error" };
// the named roles of the brief: cut hit, sub hit, riser into cut, whoosh, tap, pop, ding, glitch, shutter, chime
export const ROLES = { "cut-hit": "hit", "sub-hit": "drop", riser: "riser", whoosh: "whoosh.short", "whoosh-long": "whoosh.long", tap: "land.light", pop: "pop", ding: "click.confirm", glitch: null, shutter: "snap", chime: "bell" };
const WHOOSH_FAMILY = /^(whoosh_fast|whoosh_big|pro_whoosh_big|swish|swipe)\//;
const hash = (o) => crypto.createHash("sha1").update(JSON.stringify(o)).digest("hex").slice(0, 8);
const bankCache = {};
function bankPick(kind) {
  if (!bankCache[kind]) { try { bankCache[kind] = (sfxList({ kind }).sounds || []).map((s) => s.id); } catch { bankCache[kind] = []; } }
  return bankCache[kind][0] || null;
}

// one bank sound for a cue kind, aimed at the picture. `at` is the picture's hit time in the film; the launch kit's offset_ms puts it against the cut
// (taps lead, whoosh peaks land after). Returns the file and the second of the FILE that must meet `at + offset_s` (sync_point_s), or null when the kind has no bank sound.
export function renderCue(kind, { at = 1, dir, name, signature = false, index = 0, role: roleIn } = {}) {
  const kit = launchKit();
  let role = roleIn || ROLE_OF[kind];
  if (role === "whoosh.short" && signature) role = "whoosh.long";
  const spec = role ? kit.roles[role] : null;
  const sound = spec ? spec.sound : BANK_KIND[kind] ? bankPick(BANK_KIND[kind]) : null;
  if (!sound) return null;
  const align = spec ? spec.align : "onset";
  const knobs = {};
  if (WHOOSH_FAMILY.test(sound)) knobs.apex = r3(Math.max(0.25, Math.min(0.55, at)));
  if (spec && Array.isArray(spec.pitches) && spec.pitches.length) knobs.pitch = spec.pitches[index % spec.pitches.length];
  if (kind === "riser") knobs.dur = r3(Math.max(0.6, Math.min(2.5, at)));
  const levelDb = spec && Number.isFinite(spec.level_db) ? spec.level_db : -6;
  knobs.weight = r3(Math.pow(10, levelDb / 20));
  const file = path.join(dir, `${(name || `${role || kind}`).replace(/[^\w.-]+/g, "-")}-${hash([sound, knobs])}.wav`);
  let meta;
  const side = file.replace(/\.wav$/, ".json");
  if (fs.existsSync(file) && fs.existsSync(side)) meta = JSON.parse(fs.readFileSync(side, "utf8"));
  else { meta = sfxRender(sound, file, knobs).meta; fs.writeFileSync(side, JSON.stringify(meta)); }
  const sync = align === "peak" ? meta.peak_s : align === "end" ? meta.end_s : meta.onset_s;
  return { file, role: role || kind, sound, align, sync_point_s: r3(sync), offset_s: r3((spec && spec.offset_ms ? spec.offset_ms : 0) / 1000), duration_s: r3(meta.end_s || meta.dur_s), level_db: levelDb, bed_db: spec ? spec.bed_db : null, min_gap_ms: spec ? spec.min_gap_ms || null : null, knobs };
}

// the film's earshot palette: one bank sound per named role, rendered once into dir (palette.json beside them, same shape as renderPalette's)
export function renderPalette({ dir, seed = "film", roles = ["cut-hit", "sub-hit", "riser", "whoosh", "tap", "pop", "ding", "glitch", "shutter", "chime"] } = {}) {
  if (!dir) throw new Error("renderPalette needs a dir");
  fs.mkdirSync(dir, { recursive: true });
  const sounds = [];
  roles.forEach((r, i) => {
    const kitRole = ROLES[r];
    const c = renderCue(r === "glitch" ? "glitch" : "x", { at: 1, dir, name: r, index: i, role: kitRole || undefined });
    if (!c) return;
    sounds.push({ id: r, role: r, kind: "earshot", engine: "earshot", sound: c.sound, file: path.relative(dir, c.file), duration: c.duration_s, sync_point_s: c.sync_point_s, offset_s: c.offset_s, gain_db: c.level_db, bed_db: c.bed_db, pan: 0 });
  });
  const rec = { carrier: "earshot", engine: "earshot", seed, character: "earshot bank (launch preset): one bank sound per role, placed against the bed and the cut by the kit", sounds };
  fs.writeFileSync(path.join(dir, "palette.json"), JSON.stringify(rec, null, 2) + "\n");
  return rec;
}

// critique's TECHNICAL rows only, as warning strings. Never its verdict or score; never a block.
export function techFindings(res) {
  const out = [];
  const m = Object.fromEntries((res && res.metrics || []).map((x) => [x.metric, x]));
  const ev = (res && res.events) || {};
  const ts = (a) => a.slice(0, 6).map((t) => `${Number(t).toFixed(1)} s`).join(", ");
  if (m.true_peak && Number.isFinite(m.true_peak.value) && m.true_peak.value > -1) out.push({ kind: "true-peak", text: `true peak ${m.true_peak.value} dBTP is over -1 dBTP (${m.true_peak.basis || "measured"}): lower the master limiter ceiling` });
  if (m.end_silence_s && Number.isFinite(m.end_silence_s.value) && m.end_silence_s.value > 1) out.push({ kind: "dead-air", text: `${m.end_silence_s.value} s of dead air at the end: trim the tail or end the picture on the last sound` });
  if (Array.isArray(ev.visual_without_any_sound) && ev.visual_without_any_sound.length) out.push({ kind: "silent-cuts", text: `${ev.visual_without_any_sound.length} cut(s) with no sound under them at ${ts(ev.visual_without_any_sound)}` });
  if (Array.isArray(ev.visual_without_onset) && ev.visual_without_onset.length && m.cuts_with_sound && m.cuts_with_sound.status && m.cuts_with_sound.status !== "ok") out.push({ kind: "cuts-missing-accents", text: `${ev.visual_without_onset.length} cut(s) without an onset within 100 ms at ${ts(ev.visual_without_onset)} (${Math.round(m.cuts_with_sound.value * 100)}% have one)` });
  return out;
}

// the setup command: venv + pip through uv, Python 3.12 only. Never the system Python.
export function setup({ print = false } = {}) {
  const uv = spawnSync("uv", ["--version"], { encoding: "utf8" });
  const hasUv = !uv.error && uv.status === 0;
  const steps = [
    `uv venv --python 3.12 ${VENV}`,
    `uv pip install --python ${path.join(VENV, "bin", "python")} "${SOURCE}"`,
    `${binPath()} sfx list --json   # a 252-sound check, no models`,
  ];
  if (!hasUv || print) return { ok: false, uv: hasUv, installed: available(), steps, note: hasUv ? "dry run: nothing was changed" : "uv is missing: install it (brew install uv, or https://docs.astral.sh/uv/), then run these steps; never use the system Python (librosa/numba on Python 3.14 crashes it)" };
  if (available()) return { ok: true, uv: true, installed: true, venv: VENV, steps: [], note: "already installed" };
  fs.mkdirSync(HOME, { recursive: true });
  const env = { ...process.env, PYTHONNOUSERSITE: "1" };
  for (const [i, c] of [["venv", ["venv", "--python", "3.12", VENV]], ["pip", ["pip", "install", "--python", path.join(VENV, "bin", "python"), SOURCE]]]) {
    const r = spawnSync("uv", c, { encoding: "utf8", env, timeout: 600000 });
    if (r.status !== 0) return { ok: false, uv: true, installed: false, failed: i, error: String(r.stderr || r.error || "").slice(-400), steps };
  }
  return { ok: available(), uv: true, installed: available(), venv: VENV, steps };
}
