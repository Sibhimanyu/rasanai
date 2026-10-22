// benchmark.mjs (W11): the technique catalogue, the three fixture films, and the A/B evaluation. It REUSES the existing tools and runs them as processes:
// motion-gate.mjs, slop.mjs, stage2d.mjs (check, canon), reads.mjs, quick-film.mjs, events.mjs, original-score.mjs, sound.mjs, evidence.mjs and crew.mjs ab.
// It has no quality score of its own: a gate's own pass / fail and its own numbers are copied through, and human preference stays "pending-human-review".
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SCRIPTS = path.join(HERE, "..");
export const SKILL = path.join(SCRIPTS, "..");
export const FX = path.join(SCRIPTS, "tests", "fixtures", "benchmark");
export const CATALOG = path.join(SKILL, "library", "benchmarks", "video-techniques.json");
export const DEFAULT_OUT = path.join(FX, "generated");
const rj = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
const r3 = (x) => (x == null ? null : Math.round(x * 1000) / 1000);
const tool = (name) => path.join(SCRIPTS, name);

// ------------------------------------------------------------------------------------------------------------------------------ the catalogue
export const CATEGORIES = ["kinetic typography", "CSS/SVG/GSAP motion", "pure Canvas scene", "generative Three.js terrain", "3D product turntable", "hand-painted line boil", "two-stage character acting", "transformation transition", "data visual", "subtitle and reading pacing", "visual storytelling with no words", "sound-driven cut", "palette-preserving grade", "interface walkthrough", "vertical short", "code-rendered explainer", "archival evidence", "measured teardown", "single continuous camera", "memorable opening and end echo"];
const REQUIRED = ["id", "category", "techniques", "original_url", "source_repo", "source_commit", "what_to_learn", "what_not_to_copy", "local_fixture"];
// fields that would carry another creator's prompt, transcript or media: never allowed in a row
const FORBIDDEN_FIELDS = /^(prompt|prompt_text|prompt_partial|text|transcript|script|caption|poster_url|video_url|still|image|media|download|audio|track)$/i;
const MEDIA_URL = /\.(mp4|mov|webm|webp|png|jpe?g|gif|mp3|wav|m4a|svg)(\?|#|$)/i;

export function loadCatalog(file = CATALOG) { return rj(file); }

export function validateCatalog(cat) {
  const P = [];
  const rows = Array.isArray(cat && cat.rows) ? cat.rows : [];
  if (rows.length !== 20) P.push(`expected 20 technique rows, found ${rows.length}`);
  const ids = new Set(), cats = new Set();
  const pins = (cat && cat.pins) || {};
  for (const r of rows) {
    const at = `row ${r.id || "?"}`;
    for (const k of REQUIRED) if (r[k] === undefined || r[k] === "" || (Array.isArray(r[k]) && !r[k].length)) P.push(`${at}: ${k} is missing`);
    for (const k of Object.keys(r)) if (FORBIDDEN_FIELDS.test(k)) P.push(`${at}: field "${k}" may not exist (no copied prompts or media)`);
    if (ids.has(r.id)) P.push(`${at}: duplicate id`); ids.add(r.id);
    cats.add(r.category);
    if (!/^https:\/\//.test(r.original_url || "")) P.push(`${at}: original_url must be an https link`);
    if (MEDIA_URL.test(r.original_url || "")) P.push(`${at}: original_url points at a media file`);
    if (!pins[r.source_repo]) P.push(`${at}: ${r.source_repo} is not one of the pinned repositories`);
    else if (pins[r.source_repo] !== r.source_commit) P.push(`${at}: source_commit ${r.source_commit} differs from the pin ${pins[r.source_repo]}`);
    if (/github\.com/.test(r.original_url || "") && !String(r.original_url).includes(`/${r.source_repo}/blob/${r.source_commit}/`)) P.push(`${at}: the GitHub link is not pinned to ${r.source_commit}`);
    if (!r.license) P.push(`${at}: license provenance is missing`);
    if (typeof r.verified !== "boolean") P.push(`${at}: verified must be true or false`);
    const lf = r.local_fixture;
    if (!lf || typeof lf !== "object" || !("kind" in lf)) P.push(`${at}: local_fixture needs { kind, ref, note }`);
    if (lf && lf.kind === "benchmark-fixture" && !loadFixtures().some((f) => f.id === lf.ref)) P.push(`${at}: local_fixture ${lf.ref} is not a benchmark fixture`);
    if (String(r.what_to_learn || "").length > 400) P.push(`${at}: what_to_learn is long: it is a one-line technique in our words`);
  }
  for (const c of CATEGORIES) if (!cats.has(c)) P.push(`category "${c}" has no row`);
  return { ok: !P.length, problems: P, rows: rows.length, verified: rows.filter((r) => r.verified === true).length };
}

// network, explicit and optional: every original_url must answer 200; an index row must also differ from a bogus slug (404). Writes verified / verified_on / verification.
export async function verifySources({ write = false, file = CATALOG, fetchImpl = fetch } = {}) {
  const cat = loadCatalog(file), out = [], today = new Date().toISOString().slice(0, 10);
  const head = async (u) => { try { const r = await fetchImpl(u, { redirect: "follow", headers: { "user-agent": "Mozilla/5.0 (rasanai benchmark verify)" }, signal: AbortSignal.timeout(20000) }); return r.status; } catch (e) { return `error: ${e.message}`; } };
  for (const r of cat.rows) {
    const s = await head(r.original_url);
    let ok = s === 200, how = `GET ${r.original_url} -> ${s}`;
    if (ok && r.index_slug) {
      const bogus = r.original_url.replace(r.index_slug, "zz-not-a-real-slug-000000");
      const sb = await head(bogus);
      ok = sb === 404;
      how += `; a made-up slug gives ${sb} (so the 200 is real)`;
    }
    out.push({ id: r.id, ok, how });
    if (write) { r.verified = ok; r.verified_on = today; r.verification = how; }
  }
  if (write) fs.writeFileSync(file, JSON.stringify(cat, null, 2) + "\n");
  return { ok: out.every((o) => o.ok), results: out };
}

// ------------------------------------------------------------------------------------------------------------------------------ fixtures
export function loadFixtures() { return rj(path.join(FX, "fixtures.json")).fixtures; }
export const fixtureById = (id) => loadFixtures().find((f) => f.id === id);

// ------------------------------------------------------------------------------------------------------------------------------ processes
export function sh(cmd, args, o = {}) { return spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 1 << 28, timeout: o.timeout || 900000, env: { ...process.env, RASANAI_GL: process.env.RASANAI_GL || "cpu", ...(o.env || {}) }, cwd: o.cwd }); }
const node = (script, args, o) => sh(process.execPath, [tool(script), ...args], o);
const parseJson = (s) => { try { return JSON.parse(s); } catch { const i = String(s).indexOf("{"); if (i >= 0) { try { return JSON.parse(String(s).slice(i)); } catch { /* fall through */ } } return null; } };
export function haveFfmpeg() { const a = sh("ffmpeg", ["-version"]), b = sh("ffprobe", ["-version"]); return !a.error && a.status === 0 && !b.error && b.status === 0; }

// real wall-clock seconds and the peak resident memory of this process tree (node + Chrome helpers), sampled with ps
export async function measured(fn) {
  const t0 = Date.now(); let peak = 0, stop = false;
  const sample = () => {
    const r = spawnSync("ps", ["-axo", "pid=,ppid=,rss="], { encoding: "utf8" });
    if (r.status !== 0) return;
    const kids = new Map(), rss = new Map();
    for (const l of r.stdout.split("\n")) { const m = l.trim().split(/\s+/).map(Number); if (m.length < 3 || m.some((x) => !Number.isFinite(x))) continue; rss.set(m[0], m[2]); (kids.get(m[1]) || kids.set(m[1], []).get(m[1])).push(m[0]); }
    let sum = 0; const q = [process.pid], seen = new Set();
    while (q.length) { const p = q.pop(); if (seen.has(p)) continue; seen.add(p); sum += rss.get(p) || 0; for (const c of kids.get(p) || []) q.push(c); }
    peak = Math.max(peak, sum);
  };
  const timer = setInterval(() => { if (!stop) sample(); }, 700);
  sample();
  let value, error;
  try { value = await fn(); } catch (e) { error = e; }
  stop = true; clearInterval(timer); sample();
  if (error) throw error;
  return { value, render_s: r1((Date.now() - t0) / 1000), peak_rss_mb: Math.round(peak / 1024), memory_basis: "ps rss summed over this process and its descendants, sampled every 0.7 s (a lower bound: short spikes can be missed)" };
}
// run a child process without blocking the event loop (so measured() can sample while it works)
export function run(cmd, args, o = {}) {
  return new Promise((resolve) => {
    const c = spawn(cmd, args, { env: { ...process.env, RASANAI_GL: process.env.RASANAI_GL || "cpu", ...(o.env || {}) }, cwd: o.cwd });
    let out = "", err = "";
    c.stdout.on("data", (d) => { out += d; }); c.stderr.on("data", (d) => { err += d; });
    c.on("error", (e) => resolve({ status: 1, stdout: out, stderr: String(e.message) }));
    c.on("close", (code) => resolve({ status: code, stdout: out, stderr: err }));
  });
}
const nodeA = (script, args, o) => run(process.execPath, [tool(script), ...args], o);

export function probe(file) {
  if (!file || !fs.existsSync(file)) return null;
  const r = sh("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,width,height,r_frame_rate,nb_frames,duration,sample_rate", "-show_entries", "format=duration", "-of", "json", file]);
  const j = parseJson(r.stdout); if (!j) return null;
  const v = (j.streams || []).find((s) => s.codec_type === "video"), a = (j.streams || []).find((s) => s.codec_type === "audio");
  if (!v) return null;
  const [n, d] = String(v.r_frame_rate || "0/1").split("/").map(Number);
  return { file, width: v.width, height: v.height, fps: r3(n / (d || 1)), duration_s: r3(Number((j.format || {}).duration || v.duration)), frames: Number(v.nb_frames) || null, audio: !!a, sample_rate: a ? Number(a.sample_rate) : null };
}

// the matching-settings check: same size, same frame rate, lengths within one frame (an A/B of different lengths or rates compares nothing)
export function matchSettings(a, b) {
  const P = [];
  if (!a || !b) return { ok: false, problems: ["a render could not be probed"] };
  if (a.width !== b.width || a.height !== b.height) P.push(`size differs: ${a.width}x${a.height} vs ${b.width}x${b.height}`);
  if (Math.abs(a.fps - b.fps) > 0.01) P.push(`fps differs: ${a.fps} vs ${b.fps}`);
  const frame = 1 / Math.max(1, Math.min(a.fps, b.fps));
  if (Math.abs(a.duration_s - b.duration_s) > frame + 1e-6) P.push(`length differs: ${a.duration_s} s vs ${b.duration_s} s (more than one frame)`);
  return { ok: !P.length, problems: P };
}

// ------------------------------------------------------------------------------------------------------------------------------ gates (the existing tools, summarised)
// status: pass | fail | could-not-run | not-applicable. A gate never reports pass when it did not run.
const gate = (name, r, extra = {}) => {
  const j = parseJson(r.stdout);
  const status = r.status === 0 ? "pass" : r.status === 2 ? "fail" : "could-not-run";
  return { gate: name, status, exit: r.status, json: j, ...extra };
};
const na = (name, why) => ({ gate: name, status: "not-applicable", reason: why });
const findingsOf = (j) => ((j && (j.findings || j.errors)) || []).filter((f) => typeof f === "object").slice(0, 6).map((f) => `${f.rule || f.code || "finding"}${f.severity ? ` (${f.severity})` : ""}: ${String(f.msg || f.why || f.where || f.message || "").slice(0, 140)}`);
const summarize = (g) => {
  const j = g.json; const out = { gate: g.gate, status: g.status, exit: g.exit ?? null };
  if (g.reason) out.reason = g.reason;
  if (g.status === "fail" || g.status === "could-not-run") { const f = findingsOf(j); if (f.length) out.findings = f; else if (g.stderr) out.findings = [g.stderr.trim().split("\n").pop().slice(0, 200)]; }
  return out;
};

export async function videoGates(video, o = {}) {
  const gates = [];
  const mg = await nodeA("motion-gate.mjs", ["--video", video, "--json", ...(o.events ? ["--events", o.events] : [])]);
  const g = gate("motion-gate", mg); gates.push(g);
  const m = (g.json && g.json.measured) || {};
  const metrics = g.json ? { fluency_score: m.fluency && m.fluency.score, coverage: m.coverage, longest_still_s: m.longest_still_s, end_card_hold_s: m.end_card_hold_s, echo_score: m.echo && m.echo.score, camera_kinds: m.camera && m.camera.kinds, frames: m.frames } : null;
  return { gates, metrics };
}

// audio: the soundtrack extracted from the render and checked against the film-event manifest by original-score check (cue timing in frames) and sound.mjs check
export async function audioGates(video, eventsFile, fps, duration, tmp, sidecar = null) {
  const wav = path.join(tmp, "audio.wav");
  const ex = sh("ffmpeg", ["-v", "error", "-y", "-i", video, "-vn", "-ac", "2", "-ar", "48000", "-c:a", "pcm_s24le", wav]);
  if (ex.status !== 0 || !fs.existsSync(wav)) return { gates: [na("original-score check", "the render has no audio stream"), na("sound check", "the render has no audio stream")], audio_error_frames: null };
  // the score's sidecar names the declared hit ids: it travels with the extracted audio so the check holds the film to them
  if (sidecar && exists(sidecar)) fs.copyFileSync(sidecar, path.join(tmp, "audio.score.json"));
  const sc = await nodeA("original-score.mjs", ["check", "--audio", wav, "--events", eventsFile, "--fps", String(fps)]);
  const snd = await nodeA("sound.mjs", ["check", "--audio", wav, "--film", String(duration), "--events", eventsFile]);
  const gs = [gate("original-score check", sc), gate("sound check", snd)];
  const cues = ((gs[0].json || {}).cues || []).filter((c) => c.required);
  const errs = cues.map((c) => (c.found === false ? null : Math.abs(c.err_frames)));
  return { gates: gs, audio_error_frames: cues.length && errs.every((e) => e != null) ? Math.max(...errs) : null, audio_cues: cues.map((c) => ({ id: c.id, at_s: c.at_s, err_frames: c.err_frames, found: c.found })) };
}

// ------------------------------------------------------------------------------------------------------------------------------ building the fixture films
const exists = (f) => fs.existsSync(f);
const mkdir = (d) => fs.mkdirSync(d, { recursive: true });
const writeJson = (f, o) => { mkdir(path.dirname(f)); fs.writeFileSync(f, JSON.stringify(o, null, 2) + "\n"); };
const encodeArgs = ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-map_metadata", "-1", "-movflags", "+faststart"];

async function buildCharacter(dir, fx) {
  const film = path.join(dir, "film"); mkdir(film);
  const r = await nodeA("stage2d.mjs", ["film", "--out", film, "--fps", String(fx.fps), "--workers", "3"]);
  if (r.status !== 0) return { error: `stage2d film failed: ${(r.stderr || r.stdout).trim().split("\n").pop()}` };
  const mp4 = path.join(film, "pim-and-the-pear.mp4");
  const project = path.join(dir, "project");
  fs.rmSync(project, { recursive: true, force: true });
  const sc = await nodeA("stage2d.mjs", ["scaffold", "--project", project, "--frame", "01-film", "--duration", String(fx.duration_s), "--sequence", path.join(SKILL, "stage2d", "fixtures", "demo-sequence.json"), "--canon", path.join(SKILL, "stage2d", "fixtures", "original-actor.json")]);
  if (sc.status !== 0) return { error: `stage2d scaffold failed: ${sc.stderr.trim().split("\n").pop()}` };
  const run_ = path.join(dir, "run"); mkdir(path.join(run_, "motion"));
  fs.copyFileSync(path.join(SCRIPTS, "tests", "fixtures", "reads", "actor-15s-score.json"), path.join(run_, "motion", "score.json"));
  return { video: mp4, project, run: run_, extras: ["model-sheet.png", "turn.png", "action-extremes.png", "emotions-1.png", "emotions-2.png"].map((f) => path.join(film, f)).filter(exists) };
}

async function buildProduct(dir, fx) {
  const run_ = path.join(dir, "run"), project = path.join(dir, "project");
  fs.rmSync(run_, { recursive: true, force: true }); fs.rmSync(project, { recursive: true, force: true });
  mkdir(path.join(run_, "quick")); mkdir(path.join(run_, "motion"));
  const brief = rj(path.join(FX, "product-launch.brief.json"));
  writeJson(path.join(run_, "quick", "brief.json"), brief);
  let r = await nodeA("quick-film.mjs", ["scaffold", "--run", run_, "--project", project]);
  if (r.status !== 0) return { error: `quick-film scaffold failed: ${r.stdout.slice(0, 300)}` };
  const silent = path.join(dir, "silent.mp4");
  r = await nodeA("quick-film.mjs", ["render", "--project", project, "--out", silent, "--fps", String(fx.fps)]);
  if (r.status !== 0) return { error: `quick-film render failed: ${r.stdout.slice(-300)}` };
  // the film's events: the quick composition's own cut times (wipe cover, push, end card), one music peak on the end card
  const plan = (parseJson(r.stdout) || {});
  const T1 = brief.duration_s * 0.28, T2 = brief.duration_s * 0.78, cover = T1 + 0.15, endAt = T2 + 0.6;
  void plan;
  const score = { _synthetic: "SYNTHETIC benchmark fixture product-launch: invented film, no real product.", duration: brief.duration_s, fps: fx.fps, brand: "Synthetic fixture",
    music_arc: { intro_until: 3, drop_at: r3(cover), payoff_at: r3(T2 + 0.05), button_at: brief.duration_s },
    scenes: [
      { n: 1, id: "title", start: 0, end: r3(cover), duration: r3(cover), line: "", events: [{ t: 1.0, what: "title lands", sound: "key" }] },
      { n: 2, id: "settings", start: r3(cover), end: r3(T2 + 0.05), duration: r3(T2 + 0.05 - cover), line: "", events: [{ t: 3.0, what: "dial moves", sound: "key" }] },
      { n: 3, id: "reveal", start: r3(T2 + 0.05), end: brief.duration_s, duration: r3(brief.duration_s - T2 - 0.05), line: "", events: [{ id: "e-reveal", t: r3(endAt - (T2 + 0.05)), what: "end card lands: the reveal", sound: "reveal" }] },
    ],
    seams: [{ from: 1, to: 2, kind: "cut" }, { from: 2, to: 3, kind: "cut", sound: "whoosh" }] };
  writeJson(path.join(run_, "motion", "score.json"), score);
  r = await nodeA("events.mjs", ["export", "--run", run_, "--fps", String(fx.fps)]);
  if (r.status !== 0) return { error: `events export failed: ${(r.stdout + r.stderr).slice(0, 300)}` };
  const events = path.join(run_, "motion", "events.json");
  const identity = path.join(dir, "identity.json");
  writeJson(identity, { seed: 11, look: "warm dark studio, one amber accent", story: "a quiet build, one clear reveal, a calm close", hit_event_ids: ["e-reveal"] });
  const wav = path.join(dir, "score.wav");
  r = await nodeA("original-score.mjs", ["render", "--events", events, "--run", run_, "--identity", identity, "--fps", String(fx.fps), "--out", wav]);
  if (r.status !== 0) return { error: `original-score render failed: ${(r.stdout + r.stderr).slice(0, 300)}` };
  const mp4 = path.join(dir, "product-launch.mp4");
  r = await run("ffmpeg", ["-v", "error", "-y", "-i", silent, "-i", wav, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", mp4]);
  if (r.status !== 0) return { error: `ffmpeg mux failed: ${r.stderr.slice(-200)}` };
  return { video: mp4, project, run: run_, events, score_wav: wav, identity, events_baseline_shift_s: 0.8 };
}

async function buildEvidence(dir, fx) {
  const R = path.join(dir, "run"); fs.rmSync(R, { recursive: true, force: true }); mkdir(R); mkdir(path.join(dir, "seg"));
  const ing = (file, kind, id) => nodeA("evidence.mjs", ["ingest", "--run", R, "--source", path.join(FX, "evidence-explainer", file), "--kind", kind, "--id", id, "--synthetic", "--origin", "benchmark fixture author (invented numbers, not real data)"]);
  for (const [f, k, id] of [["pallet-loads.csv", "data-physical", "pallets"], ["span-options.csv", "engineering-briefing", "spans"], ["pallet-heights.csv", "data-physical", "heights"]]) { const r = await ing(f, k, id); if (r.status !== 0) return { error: `evidence ingest ${f} failed: ${r.stdout.slice(0, 300)}` }; }
  const segs = [["data-physical", "pallets", 18], ["engineering-briefing", "spans", 14], ["data-physical", "heights", 13]];
  const files = [], previews = [];
  for (const [i, [recipe, obj, dur]] of segs.entries()) {
    const sf = path.join(dir, "seg", `s${i + 1}.json`);
    let r = await nodeA("evidence.mjs", ["scene-data", "--run", R, "--recipe", recipe, "--objects", obj, "--out", sf]);
    if (r.status !== 0) return { error: `evidence scene-data ${obj} failed: ${r.stdout.slice(0, 300)}` };
    const sc = rj(sf); sc.duration = dur; writeJson(sf, sc);
    const od = path.join(dir, "seg", `o${i + 1}`);
    r = await nodeA("evidence.mjs", ["preview", "--run", R, "--recipe", recipe, "--scene", sf, "--out", od, "--video", "--fps", String(fx.fps)]);
    if (r.status !== 0) return { error: `evidence preview ${obj} failed: ${(r.stdout + r.stderr).slice(0, 300)}` };
    files.push(path.join(od, `${recipe}.mp4`)); previews.push(path.join(od, "preview.json"));
  }
  const list = path.join(dir, "concat.txt");
  fs.writeFileSync(list, files.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join("\n") + "\n");
  const mp4 = path.join(dir, "evidence-explainer.mp4");
  const r = await run("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", list, ...encodeArgs, "-r", String(fx.fps), mp4]);
  if (r.status !== 0) return { error: `ffmpeg concat failed: ${r.stderr.slice(-200)}` };
  // the run's own scene.json (first segment) so `evidence check` has a scene to read
  fs.copyFileSync(path.join(dir, "seg", "s1.json"), path.join(R, "evidence", "scene.json"));
  return { video: mp4, run: R, previews, scenes: segs.map((_, i) => path.join(dir, "seg", `s${i + 1}.json`)) };
}

// the deliberately degraded BASELINE variant of each fixture, built from the same render (never presented as an earlier version of the product)
async function buildDegraded(id, dir, built, fx) {
  const out = path.join(dir, "baseline.mp4");
  if (id === "character-story") {
    const r = await run("ffmpeg", ["-v", "error", "-y", "-i", built.video, "-vf", `fps=3,fps=${fx.fps}`, ...encodeArgs, out]);
    return r.status === 0 ? { video: out, kind: "degraded-variant", name: "stepped-motion", what: "the same film with motion decimated to 3 distinct pictures per second (every frame held 5 times)" } : { error: r.stderr.slice(-200) };
  }
  if (id === "product-launch") {
    const shift = built.events_baseline_shift_s, ms = Math.round(shift * 1000);
    const r = await run("ffmpeg", ["-v", "error", "-y", "-i", built.video, "-map", "0:v", "-map", "0:a", "-c:v", "copy", "-af", `adelay=${ms}|${ms},atrim=0:${fx.duration_s}`, "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", out]);
    return r.status === 0 ? { video: out, kind: "degraded-variant", name: "late-audio", what: `the same picture with the whole soundtrack ${shift} s late (${Math.round(shift * fx.fps)} frames at ${fx.fps} fps), so the music peak misses the end-card hit` } : { error: r.stderr.slice(-200) };
  }
  if (id === "evidence-explainer") {
    const zoom = 1.5;
    const r = await run("ffmpeg", ["-v", "error", "-y", "-i", built.video, "-vf", `crop=iw/${zoom}:ih/${zoom}:iw/2-iw/${zoom}/2:ih/2-ih/${zoom}/2,scale=${fx.width}:${fx.height}:flags=lanczos`, ...encodeArgs, "-r", String(fx.fps), out]);
    return r.status === 0 ? { video: out, kind: "degraded-variant", name: "tight-crop", transform: { zoom, cx: 0.5, cy: 0.5 }, what: `the same film cropped to the centre ${zoom}x, so edge labels are cut off` } : { error: r.stderr.slice(-200) };
  }
  return { error: `no degraded variant defined for ${id}` };
}

export async function buildFixture(id, outRoot = DEFAULT_OUT) {
  const fx = fixtureById(id); if (!fx) throw new Error(`unknown fixture "${id}" (${loadFixtures().map((f) => f.id).join(", ")})`);
  if (!haveFfmpeg()) return { id, status: "not run", reason: "ffmpeg / ffprobe not found on PATH" };
  const dir = path.join(outRoot, id); mkdir(dir);
  const builder = { "character-story": buildCharacter, "product-launch": buildProduct, "evidence-explainer": buildEvidence }[id];
  let built;
  try { built = await measured(() => builder(dir, fx)); } catch (e) { return { id, status: "not run", reason: `build threw: ${e.message}` }; }
  const b = built.value;
  if (b.error) return { id, status: "not run", reason: b.error };
  let deg;
  try { deg = await measured(() => buildDegraded(id, dir, b, fx)); } catch (e) { return { id, status: "not run", reason: `degraded variant threw: ${e.message}` }; }
  if (deg.value.error) return { id, status: "not run", reason: `degraded variant: ${deg.value.error}` };
  const after = path.join(dir, "after.mp4"), base = path.join(dir, "baseline.mp4");
  fs.copyFileSync(b.video, after);
  if (path.resolve(deg.value.video) !== path.resolve(base)) fs.copyFileSync(deg.value.video, base);
  const rec = {
    id, built_at: new Date().toISOString(), after: "after.mp4", baseline: "baseline.mp4",
    after_build: { render_s: built.render_s, peak_rss_mb: built.peak_rss_mb, memory_basis: built.memory_basis, wall_clock_note: `this machine (${process.platform}-${process.arch}), headless Chrome frame capture + ffmpeg, software GL` },
    baseline_build: { render_s: deg.render_s, peak_rss_mb: deg.peak_rss_mb, note: "time to derive the degraded variant from the finished render, not a second full render" },
    baseline_kind: deg.value.kind, baseline_name: deg.value.name, baseline_what: deg.value.what, baseline_transform: deg.value.transform || null,
    master_baseline: "not available: origin/master has none of stage2d, quick-film, original-score, events, evidence or regression (checked with git ls-tree on the merge base), so no honest earlier-behaviour render of these fixtures exists",
    project: b.project ? path.relative(outRoot, b.project) : null, run: b.run ? path.relative(outRoot, b.run) : null,
    events: b.events ? path.relative(outRoot, b.events) : null, score_sidecar: b.score_wav ? path.relative(outRoot, b.score_wav.replace(/\.wav$/, ".score.json")) : null, previews: (b.previews || []).map((p) => path.relative(outRoot, p)), scenes: (b.scenes || []).map((p) => path.relative(outRoot, p)),
    extras: (b.extras || []).map((p) => path.relative(outRoot, p)),
  };
  writeJson(path.join(dir, "build.json"), rec);
  return { id, status: "built", dir, ...rec };
}

// ------------------------------------------------------------------------------------------------------------------------------ evaluating one fixture
function stills(video, times, outDir, tag) {
  mkdir(outDir); const out = [];
  const dur = (probe(video) || {}).duration_s || 0;
  for (const t of times.filter((x) => x < dur - 0.1)) { const f = path.join(outDir, `${tag}-${String(t).replace(".", "_")}s.png`); const r = sh("ffmpeg", ["-v", "error", "-y", "-ss", String(t), "-i", video, "-frames:v", "1", f]); if (r.status === 0 && exists(f)) out.push(f); }
  return out;
}

const overflowOf = (rects, canvas, tf) => {
  // largest part of any measured label rectangle outside the frame, in pixels of the render (a crop transform moves the frame over the rectangles)
  let worst = 0, which = null;
  for (const [k, r] of Object.entries(rects || {})) {
    if (!r || typeof r.x !== "number") continue;
    let { x, y, w, h } = r;
    if (tf) { x = (x - (tf.cx - 0.5 / tf.zoom)) * tf.zoom; y = (y - (tf.cy - 0.5 / tf.zoom)) * tf.zoom; w *= tf.zoom; h *= tf.zoom; }
    const o = Math.max(0, -x, -y, x + w - 1, y + h - 1);
    const px = o * Math.max(canvas.w, canvas.h);
    if (px > worst) { worst = px; which = k; }
  }
  return { px: Math.round(worst * 10) / 10, label: which };
};

async function projectGates(fx, build, outRoot, videoFile, kind) {
  // gates that need the fixture's own project or run: only for the candidate that IS that project's render
  const gates = [], extra = {};
  const P = build.project && path.join(outRoot, build.project), R = build.run && path.join(outRoot, build.run);
  const own = kind === "after";
  const NA = (n) => na(n, own ? "no project for this fixture" : "this variant is a post-processed copy: it has no composition of its own");
  if (fx.id === "character-story") {
    if (!own) return { gates: [NA("stage2d check"), NA("stage2d canon"), NA("reads check"), NA("slop")], extra };
    const ck = await nodeA("stage2d.mjs", ["check", "--project", P, "--json"]); const g1 = gate("stage2d check", ck); gates.push(g1);
    const st = ((((g1.json || {}).files || [])[0] || {}).stages || [])[0];
    extra.seek_identity = st ? { value: st.deterministic === true, source: "stage2d check: the same time seeked A-B-A gives the same pixels (including the 12 Hz boil)" } : { value: null, source: "stage2d check gave no stage data" };
    gates.push(gate("stage2d canon", await nodeA("stage2d.mjs", ["canon", "--file", path.join(SKILL, "stage2d", "fixtures", "original-actor.json"), "--json"])));
    gates.push(gate("reads check", await nodeA("reads.mjs", ["check", "--run", R, "--json"])));
    const sl = await nodeA("slop.mjs", ["--project", P, "--video", videoFile, "--json"]); gates.push(gate("slop", sl));
    extra.text_clipping = { max_px: 0, basis: "the film has no on-screen text (wordless); slop text-cropped found nothing" };
    extra.slop = slopSummary(gates[gates.length - 1]);
  } else if (fx.id === "product-launch") {
    if (!own) return { gates: [NA("quick-film check"), NA("slop"), na("obey", "quick-film has no motion.md"), NA("events check")], extra };
    const ck = await nodeA("quick-film.mjs", ["check", "--project", P, "--json"]); const g1 = gate("quick-film check", ck); gates.push(g1);
    const sk = ((g1.json || {}).measured || {}).seek;
    extra.seek_identity = sk ? { value: sk.ABA === true && sk.A_after_C === true && sk.cold === true, source: "quick-film check: A-B-A, A after C and a cold seek all give the same pixels" } : { value: null, source: "quick-film check gave no seek data" };
    const sl = await nodeA("slop.mjs", ["--project", P, "--video", videoFile, "--json"]); const gs = gate("slop", sl); gates.push(gs);
    extra.slop = slopSummary(gs);
    const cropped = ((gs.json || {}).findings || []).filter((f) => f.rule === "text-cropped");
    extra.text_clipping = { max_px: cropped.length ? null : 0, findings: cropped.length, basis: cropped.length ? "slop.mjs text-cropped findings (a line crossing the frame edge or outside the safe area)" : "slop.mjs text-cropped: none found in the real DOM at 10 fps" };
    gates.push(na("obey", "quick-film compositions have no motion.md (obey.mjs reads one)"));
    gates.push(gate("events check", await nodeA("events.mjs", ["check", "--run", R])));
  } else if (fx.id === "evidence-explainer") {
    if (!own) return { gates: [NA("evidence check")], extra };
    const sc = path.join(outRoot, build.scenes[0]);
    const ck = await nodeA("evidence.mjs", ["check", "--run", R, "--strict", "--json", "--scene", sc]); gates.push(gate("evidence check", ck));
    const prev = (build.previews || []).map((p) => rj(path.join(outRoot, p)));
    extra.seek_identity = { value: prev.length ? prev.every((p) => p.deterministic === true) : null, source: "evidence preview: the same time rendered the same pixels in every segment" };
  }
  return { gates, extra };
}
function slopSummary(g) {
  const f = ((g.json || {}).findings || []);
  return { errors: (g.json || {}).errors ?? null, warnings: (g.json || {}).warnings ?? null, subject_lost: f.filter((x) => x.rule === "subject-lost").length, rules: [...new Set(f.filter((x) => x.severity === "error").map((x) => x.rule))] };
}

async function evaluate({ fx, kind, video, build, outRoot, buildInfo, eventsFile, variant, sidecarFile = null, previews = null }) {
  const info = probe(video);
  const c = { kind, file: video, settings: info, build: buildInfo || null, variant: variant || null };
  if (!info) { c.status = "not run"; c.reason = "the render is missing or unreadable"; return c; }
  const vg = await videoGates(video);
  let gates = [...vg.gates]; c.hero_metrics = vg.metrics;
  if (build) { const pg = await projectGates(fx, build, outRoot, video, kind); gates.push(...pg.gates); Object.assign(c, pg.extra); }
  if (fx.id === "evidence-explainer" && previews) {
    const tf = kind === "baseline" && variant && variant.transform ? variant.transform : null;
    const per = previews.map((p) => overflowOf(p.rects, p.canvas, tf)); const w = per.sort((a, b) => b.px - a.px)[0] || { px: null };
    c.text_clipping = { max_px: w.px, label: w.label || null, basis: tf ? `label rectangles the renderer records (the SCHEMATIC badge) mapped through the ${tf.zoom}x crop` : "label rectangles the renderer records (the SCHEMATIC badge) against the frame edge; chart labels are laid out inside the plot and are not recorded as rectangles" };
  }
  if (fx.audio && eventsFile && info.audio) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rasanai-bench-"));
    try { const ag = await audioGates(video, eventsFile, fx.fps, fx.duration_s, tmp, sidecarFile); gates.push(...ag.gates); c.audio_timing_error_frames = ag.audio_error_frames; c.audio_cues = ag.audio_cues; } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  } else { c.audio_timing_error_frames = null; c.audio_note = fx.audio ? "no audio stream in this render" : "this fixture has no soundtrack"; }
  c.gates = gates.map(summarize);
  const ran = c.gates.filter((g) => g.status !== "not-applicable");
  c.technical = { passed: ran.filter((g) => g.status === "pass").length, failed: ran.filter((g) => g.status === "fail").length, could_not_run: ran.filter((g) => g.status === "could-not-run").length, not_applicable: c.gates.length - ran.length };
  c.status = "measured";
  return c;
}

// the numeric rows a loser can show up in: lower is better for all of them
const LOWER_BETTER = [
  ["gates failed", (c) => c.technical && c.technical.failed],
  ["audio timing error (frames)", (c) => c.audio_timing_error_frames],
  ["max text clipping (px)", (c) => (c.text_clipping ? c.text_clipping.max_px : null)],
  ["longest still (s)", (c) => (c.hero_metrics ? c.hero_metrics.longest_still_s : null)],
  ["render seconds", (c) => (c.build ? c.build.render_s : null)],
  ["peak memory (MB)", (c) => (c.build ? c.build.peak_rss_mb : null)],
];
const HIGHER_BETTER = [["fluency score", (c) => (c.hero_metrics ? c.hero_metrics.fluency_score : null)], ["motion coverage", (c) => (c.hero_metrics ? c.hero_metrics.coverage : null)], ["echo score", (c) => (c.hero_metrics ? c.hero_metrics.echo_score : null)]];

export function compare(base, after) {
  const losing = [], winning = [];
  const add = (name, b, a, lowerBetter) => {
    if (typeof b !== "number" || typeof a !== "number" || a === b) return;
    const afterBetter = lowerBetter ? a < b : a > b;
    (afterBetter ? winning : losing).push({ metric: name, baseline: b, after: a });
  };
  for (const [n, f] of LOWER_BETTER) add(n, f(base), f(after), true);
  for (const [n, f] of HIGHER_BETTER) add(n, f(base), f(after), false);
  return { losing_cases: losing, winning_metrics: winning };
}

// run one fixture. A missing candidate is "not run": no comparison, never a win.
export async function runFixture(id, { outRoot = DEFAULT_OUT, baseline = null, after = null, seed = null } = {}) {
  const fx = fixtureById(id); if (!fx) throw new Error(`unknown fixture "${id}"`);
  const dir = path.join(outRoot, id); mkdir(dir);
  const bj = path.join(dir, "build.json"), build = exists(bj) ? rj(bj) : null;
  const afterF = after ? path.resolve(after) : build && exists(path.join(dir, build.after)) ? path.join(dir, build.after) : null;
  const baseF = baseline ? path.resolve(baseline) : build && exists(path.join(dir, build.baseline)) ? path.join(dir, build.baseline) : null;
  const result = { schema: "rasanai-benchmark-result/1", fixture: id, title: fx.title, probes: fx.probes, synthetic: fx.synthetic, human_review: { status: "pending-human-review", note: "no juror has reviewed this pair; nothing here is a preference or a creativity score" }, ran_at: new Date().toISOString() };
  const own = (f, k) => build && !(k === "after" ? after : baseline) && f;
  const usesFixtureAfter = !!(build && afterF && !after), usesFixtureBase = !!(build && baseF && !baseline);
  if (!afterF || !baseF) {
    result.status = "not run"; result.outcome = "not run";
    result.reason = [!afterF && `the after render is missing (${after || path.join(dir, "after.mp4")})`, !baseF && `the baseline render is missing (${baseline || path.join(dir, "baseline.mp4")})`].filter(Boolean).join("; ") + ": run `benchmark.mjs build` or pass --baseline and --after";
    result.candidates = { baseline: baseF ? { file: baseF, status: "found" } : { status: "not run", reason: "missing" }, after: afterF ? { file: afterF, status: "found" } : { status: "not run", reason: "missing" } };
    result.losing_cases = []; result.winning_metrics = [];
    writeJson(path.join(dir, "result.json"), result);
    return result;
  }
  const eventsFile = build && build.events ? path.join(outRoot, build.events) : null;
  const prevs = build && build.previews ? build.previews.map((p) => rj(path.join(outRoot, p))) : null;
  const sidecarFile = build && build.score_sidecar ? path.join(outRoot, build.score_sidecar) : null;
  const A = await evaluate({ fx, kind: "after", sidecarFile, previews: usesFixtureAfter ? prevs : null, video: afterF, build: usesFixtureAfter ? build : null, outRoot, buildInfo: usesFixtureAfter ? build.after_build : null, eventsFile: usesFixtureAfter ? eventsFile : (eventsFile && fx.audio ? eventsFile : null) });
  const B = await evaluate({ fx, kind: "baseline", sidecarFile, previews: usesFixtureBase ? prevs : null, video: baseF, build: usesFixtureBase ? build : null, outRoot, buildInfo: usesFixtureBase ? build.baseline_build : null, eventsFile: fx.audio ? eventsFile : null, variant: usesFixtureBase ? { name: build.baseline_name, transform: build.baseline_transform } : null });
  result.candidates = { baseline: B, after: A };
  result.baseline_kind = usesFixtureBase ? { kind: build.baseline_kind, name: build.baseline_name, what: build.baseline_what, master_baseline: build.master_baseline } : { kind: "supplied", what: "a baseline render supplied with --baseline" };
  result.settings_match = matchSettings(A.settings, B.settings);
  if (!result.settings_match.ok) {
    result.status = "refused"; result.outcome = "not comparable"; result.reason = `matching-settings check failed: ${result.settings_match.problems.join("; ")}`;
    result.losing_cases = []; result.winning_metrics = [];
    writeJson(path.join(dir, "result.json"), result);
    return result;
  }
  // stills (fixed seconds, same for both) and the blinded A/B strips through crew.mjs ab
  const times = fx.still_times;
  result.stills = { baseline: stills(baseF, times, path.join(dir, "stills"), "baseline").map((f) => path.relative(outRoot, f)), after: stills(afterF, times, path.join(dir, "stills"), "after").map((f) => path.relative(outRoot, f)) };
  const abRun = path.join(dir, "ab-run"); fs.rmSync(abRun, { recursive: true, force: true }); mkdir(abRun);
  const ab = await nodeA("crew.mjs", ["ab", "--run", abRun, "--a", baseF, "--b", afterF, "--seed", seed || `benchmark-${id}`]);
  const abj = parseJson(ab.stdout);
  if (ab.status === 0 && abj && abj.ok) {
    result.ab = { status: "labels-made", labels: "X and Y; which one is the after render is recorded only in ab-run/crew/ab-1.json and is not in the juror's brief", record: path.relative(outRoot, path.join(abRun, "crew", "ab-1.json")), juror_brief: path.relative(outRoot, path.join(abRun, "crew", "prompts", "ab-juror-1.md")), strips: ["rows.png", "phone-X.png", "phone-Y.png"].map((f) => path.relative(outRoot, path.join(abRun, "crew", "ab-1", "strips", f))).filter((f) => exists(path.join(outRoot, f))), seed: seed || `benchmark-${id}`, verdict: "pending-human-review" };
  } else result.ab = { status: "not run", reason: `crew.mjs ab failed: ${(ab.stderr || ab.stdout).trim().split("\n").pop()}` };
  const cmp = compare(B, A);
  // the failed-gate count in the metric table must use the same common set
  const drop = new Set(["gates failed", ...(usesFixtureBase ? ["render seconds", "peak memory (MB)"] : [])]);
  cmp.losing_cases = cmp.losing_cases.filter((x) => !drop.has(x.metric)); cmp.winning_metrics = cmp.winning_metrics.filter((x) => !drop.has(x.metric));
  if (usesFixtureBase) result.metrics_note = "render seconds and peak memory of the baseline are the cost of deriving the degraded copy from the finished render, so they are reported but not compared with the after render's full build";
  result.losing_cases = cmp.losing_cases; result.winning_metrics = cmp.winning_metrics;
  const names = (c) => new Map(c.gates.filter((g) => g.status !== "not-applicable").map((g) => [g.gate, g.status]));
  const nb = names(B), na2 = names(A), common = [...nb.keys()].filter((k) => na2.has(k));
  const bf = common.filter((k) => nb.get(k) !== "pass").length, af = common.filter((k) => na2.get(k) !== "pass").length;
  result.gates_compared = { common, baseline_not_passing: bf, after_not_passing: af, note: "only gates that ran on BOTH renders are counted; gates that need the fixture's own composition ran on the after render only" };
  { const row = { metric: "technical gates not passing (gates run on both)", baseline: bf, after: af }; if (af > bf) result.losing_cases.unshift(row); else if (af < bf) result.winning_metrics.unshift(row); }
  result.status = "compared";
  result.outcome = af < bf ? "technical-gates-favour-after" : af > bf ? "technical-gates-favour-baseline" : "technical-gates-tie";
  result.outcome_note = "an outcome about the existing technical gates only. It is not a preference and not a creativity score; human preference is pending-human-review.";
  writeJson(path.join(dir, "result.json"), result);
  return result;
}

// ------------------------------------------------------------------------------------------------------------------------------ the report
export function collectResults(outRoot = DEFAULT_OUT) {
  return loadFixtures().map((f) => { const p = path.join(outRoot, f.id, "result.json"); return exists(p) ? rj(p) : { fixture: f.id, title: f.title, status: "not run", outcome: "not run", reason: `no result.json: run \`benchmark.mjs run --fixture ${f.id}\``, candidates: {}, losing_cases: [], winning_metrics: [], human_review: { status: "pending-human-review" } }; });
}

const cell = (v, d = "n/a") => (v == null || v === "" ? d : String(v));
export function buildReport(outRoot = DEFAULT_OUT) {
  const results = collectResults(outRoot);
  const rows = results.map((r) => {
    const A = (r.candidates && r.candidates.after) || {}, B = (r.candidates && r.candidates.baseline) || {};
    const one = (c) => c.status === "measured" ? ({ technical_pass: c.technical.failed === 0 && c.technical.could_not_run === 0, gates: c.gates, seek_identity: c.seek_identity || null, max_text_clipping: c.text_clipping || null, hero_metrics: c.hero_metrics || null, audio_timing_error_frames: c.audio_timing_error_frames, render_seconds: c.build ? c.build.render_s : null, peak_memory_mb: c.build ? c.build.peak_rss_mb : null, memory_basis: c.build ? c.build.memory_basis || null : null, settings: c.settings && { size: `${c.settings.width}x${c.settings.height}`, fps: c.settings.fps, duration_s: c.settings.duration_s } }) : { status: c.status || "not run", reason: c.reason || null };
    return { fixture: r.fixture, title: r.title, status: r.status, outcome: r.outcome, reason: r.reason || null, baseline_kind: r.baseline_kind || null, settings_match: r.settings_match || null, metrics_note: r.metrics_note || null, gates_compared: r.gates_compared || null, baseline: one(B), after: one(A), losing_cases: r.losing_cases || [], winning_metrics: r.winning_metrics || [], stills: r.stills || null, ab: r.ab || null, human_review: r.human_review };
  });
  const compared = rows.filter((r) => r.status === "compared");
  return { schema: "rasanai-benchmark-report/1", generated_at: new Date().toISOString(), platform: `${process.platform}-${process.arch}`, node: process.version,
    summary: { fixtures: rows.length, compared: compared.length, not_run: rows.filter((r) => r.status === "not run").length, refused: rows.filter((r) => r.status === "refused").length, wins_claimed: 0, note: "the report never claims a win: an outcome names which side the existing technical gates favour, and human preference is pending-human-review" },
    catalogue: (() => { try { const v = validateCatalog(loadCatalog()); return { rows: v.rows, verified: v.verified, valid: v.ok }; } catch (e) { return { error: e.message }; } })(),
    fixtures: rows };
}

export function reportMarkdown(rep) {
  const L = [];
  L.push("# Benchmark report", "", `Generated ${rep.generated_at} on ${rep.platform}, Node ${rep.node}. Fixtures are synthetic, unbranded and locally generated; none is a real product film or a claim.`, "",
    `Fixtures ${rep.summary.fixtures}; compared ${rep.summary.compared}; not run ${rep.summary.not_run}; refused ${rep.summary.refused}. **Human blind preference is pending-human-review for every pair.** No visual creativity score exists in this report.`, "");
  if (rep.catalogue && !rep.catalogue.error) L.push(`Technique catalogue: ${rep.catalogue.rows} rows, ${rep.catalogue.verified} with a verified original link, ${rep.catalogue.valid ? "valid" : "INVALID"}.`, "");
  for (const f of rep.fixtures) {
    L.push(`## ${f.fixture}: ${f.title}`, "");
    if (f.status === "not run") { L.push(`**Status: not run.** ${f.reason || ""}`, "", "No comparison was made, so nothing here is a win.", ""); continue; }
    if (f.status === "refused") { L.push(`**Status: refused.** ${f.reason}`, ""); continue; }
    L.push(`**Status:** ${f.status}. **Technical outcome:** ${f.outcome} (the existing gates only).`, `**Baseline is a ${f.baseline_kind.kind}:** ${f.baseline_kind.name || ""}: ${f.baseline_kind.what}.`);
    if (f.baseline_kind.master_baseline) L.push(`Earlier-behaviour baseline: ${f.baseline_kind.master_baseline}.`);
    L.push("", "| Evidence | Baseline | After |", "| --- | --- | --- |");
    const row = (n, g) => L.push(`| ${n} | ${cell(g(f.baseline))} | ${cell(g(f.after))} |`);
    row("Technical gates", (c) => c.gates ? `${c.gates.filter((g) => g.status === "pass").length} pass, ${c.gates.filter((g) => g.status === "fail").length} fail, ${c.gates.filter((g) => g.status === "could-not-run").length} could not run, ${c.gates.filter((g) => g.status === "not-applicable").length} n/a` : null);
    row("Seek identity", (c) => c.seek_identity ? `${c.seek_identity.value}` : null);
    row("Max text clipping (px)", (c) => c.max_text_clipping ? (c.max_text_clipping.max_px ?? `${c.max_text_clipping.findings} findings`) : null);
    row("Fluency score (motion-gate)", (c) => c.hero_metrics && c.hero_metrics.fluency_score);
    row("Motion coverage", (c) => c.hero_metrics && c.hero_metrics.coverage);
    row("Longest still (s)", (c) => c.hero_metrics && c.hero_metrics.longest_still_s);
    row("Audio timing error (frames)", (c) => c.audio_timing_error_frames);
    row("Real render seconds", (c) => c.render_seconds);
    row("Peak memory (MB)", (c) => c.peak_memory_mb);
    if (f.metrics_note) L.push("", `Note: ${f.metrics_note}.`);
    L.push("", "Gates in detail:");
    for (const [n, c] of [["after", f.after], ["baseline", f.baseline]]) for (const g of c.gates || []) L.push(`- ${n} / ${g.gate}: ${g.status}${g.reason ? ` (${g.reason})` : ""}${g.findings ? `: ${g.findings.join(" | ")}` : ""}`);
    L.push("", f.losing_cases.length ? "Losing cases (metrics where the after render is worse):" : "Losing cases: none in the measured metrics (this does not mean the after render is better to a person).");
    for (const c of f.losing_cases) L.push(`- ${c.metric}: baseline ${c.baseline}, after ${c.after}`);
    if (f.winning_metrics.length) { L.push("", "Metrics where the after render is better:"); for (const c of f.winning_metrics) L.push(`- ${c.metric}: baseline ${c.baseline}, after ${c.after}`); }
    if (f.stills) { L.push("", "Stills:"); for (const k of ["baseline", "after"]) L.push(`- ${k}: ${(f.stills[k] || []).map((s) => `[${path.basename(s)}](${s})`).join(", ")}`); }
    if (f.ab) { L.push("", `Blind A/B: ${f.ab.status}.${f.ab.strips ? ` Strips: ${f.ab.strips.map((s) => `[${path.basename(s)}](${s})`).join(", ")}.` : ""} Juror brief: ${f.ab.juror_brief || "n/a"}. Verdict: **pending-human-review**.`); }
    L.push("");
  }
  L.push("## Manual review", "", "Status: pending-human-review for every fixture. Open the stills and the X / Y strips, record a verdict with `crew.mjs check --role ab-juror`, and do not read the order file first.", "");
  return L.join("\n");
}

export function writeReport(outRoot = DEFAULT_OUT) {
  const rep = buildReport(outRoot);
  mkdir(outRoot);
  writeJson(path.join(outRoot, "report.json"), rep);
  fs.writeFileSync(path.join(outRoot, "BENCHMARK_REPORT.md"), reportMarkdown(rep));
  return { report: rep, json: path.join(outRoot, "report.json"), md: path.join(outRoot, "BENCHMARK_REPORT.md") };
}

export const hashFile = (f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
