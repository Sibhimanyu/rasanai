#!/usr/bin/env node
// original-score.mjs: an optional ORIGINAL score for a film, synthesised offline in Node from the film-event manifest, and its check.
// No samples, no network, no key, no model, no Python; ffmpeg only decodes a non-WAV file for `check`. Method: references/procedural-music.md.
//
//   node original-score.mjs render --events <events.json> --out <score.wav> [--run <run>] [--identity <identity.json>] [--look "<look words>"] [--story "<story words>"]
//        [--seed <n>] [--sr 44100|48000] [--duration <s>] [--fps <n>] [--narrated] [--with-foley] [--no-stems] [--silent-by-choice "<reason>"]
//        events.json is the derived manifest of `events.mjs export` (refused when stale) or a plain {events:[{id,t,kind}]} list. Writes the stereo 24-bit WAV (music + ambience;
//        foley joins with --with-foley), <out>.score.json (the plan, the sections, the hit ids, the licence and provenance, the quality downgrade and the plan sound.mjs
//        fit / render take) and, unless --no-stems, <out>-stems/{music,ambience,foley}.wav. Same events + identity + seed = the same bytes.
//   node original-score.mjs check --audio <file> --events <events.json> [--fps <n>] [--diagnostics <file>]
//        JSON diagnostics: cue / frame alignment, duration, RMS, peak, clipping, sections, silences, the ending, a loop test, licence provenance. Exit 2 when a gate fails:
//        clipping or a hot peak, a duration off by more than a frame, a declared hit more than one output frame from its cue, unplanned silence, an abrupt or dead ending,
//        music past the CTA, sections that do not differ in energy, an audibly repeated block.
//   node original-score.mjs help
//
// JSON on stdout, problems on stderr. Exit 0 pass, 2 failed gate, 1 unable (bad arguments, a file missing, --silent-by-choice).
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "./lib/common.mjs";
import { noteDowngrade } from "./lib/downgrade.mjs";
import { loadManifest } from "./lib/film-events.mjs";
import { resolveIdentity, normalizeEvents, sectionsFromEvents, renderScore, wavBytes, scaleBus, identityPlan, sidecarPath, readSidecar, readWav, sha256, DEFAULT_SR, SCORE_SCHEMA, r3 } from "./lib/procedural-score.mjs";

const args = parseArgs();
const cmd = args._[0] || "help";
const str = (v) => (v && v !== true ? String(v) : null);
const HELP = fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").filter((l) => l.startsWith("//")).map((l) => l.replace(/^\/\/ ?/, "")).join("\n");
const done = (o, code) => { console.log(JSON.stringify(o, null, 2)); process.exit(code); };
const unable = (m, extra = {}) => { console.error(`unable: ${m}`); done({ ok: false, unable: m, ...extra }, 1); };
if (cmd === "help" || args.help) { console.log(HELP); process.exit(0); }

// events: the manifest (stale refused) or a plain list
function readEvents(file, run) {
  if (!file) unable("--events <events.json> is required");
  const f = path.resolve(file);
  if (!fs.existsSync(f)) unable(`events file not found: ${f}`);
  const m = loadManifest(f, { run: run || undefined });
  if (m.ok) return { input: m.manifest, sha: sha256(fs.readFileSync(f)), manifest: true };
  if (!m.notManifest) unable(m.error);
  return { input: m.raw, sha: sha256(fs.readFileSync(f)), manifest: false };
}

if (cmd === "render") {
  if (str(args["silent-by-choice"]) || args["silent-by-choice"]) {
    console.error(`silent by choice (${str(args["silent-by-choice"]) || "no reason given"}): no score rendered`);
    done({ ok: true, silent_by_choice: str(args["silent-by-choice"]) || true, out: null }, 0);
  }
  const out = str(args.out);
  if (!out) unable("--out <score.wav> is required");
  const run = str(args.run);
  const ev = readEvents(str(args.events), run);
  const sr = args.sr != null ? Number(args.sr) : DEFAULT_SR;
  if (![44100, 48000].includes(sr)) unable("--sr must be 44100 or 48000");
  let identity;
  try {
    identity = resolveIdentity(str(args.identity) ? path.resolve(String(args.identity)) : null, { look: str(args.look), story: str(args.story), seed: str(args.seed), narrated: args.narrated ? true : null });
  } catch (e) { unable(`--identity: ${e.message}`); }
  const opts = { sr, duration: args.duration != null ? Number(args.duration) : undefined, fps: args.fps != null ? Number(args.fps) : undefined, withFoley: !!args["with-foley"] };
  let r;
  try { r = renderScore(ev.input, identity, opts); } catch (e) { unable(`render failed: ${e.message}`); }
  const wav = path.resolve(out);
  fs.mkdirSync(path.dirname(wav), { recursive: true });
  fs.writeFileSync(wav, r.wav);
  const side = {
    schema_version: SCORE_SCHEMA, origin: "procedural", tool: "original-score.mjs render", wav: path.basename(wav), sha256: sha256(r.wav),
    events: { sha256: ev.sha, manifest: ev.manifest }, sr, channels: 2, bit_depth: 24, duration_s: r.plan.duration_s, fps: r.plan.fps, bpm: r.plan.bpm, key: r.plan.key, seed: r.plan.seed,
    identity: r.plan.identity, sections: r.plan.sections, hits: r.plan.hits, pause: r.plan.pause, gates: r.plan.gates, ending: r.plan.ending, foley: r.plan.foley, with_foley: !!opts.withFoley,
    families: [...new Set(r.plan.notes.map((n) => ({ pluck: "plucked", bell: "plucked", lead: "plucked", stab: "plucked", pad: "sustained pad", bass: "bass and percussion", kick: "bass and percussion", snare: "bass and percussion", hat: "bass and percussion" })[n.voice]).filter(Boolean))],
    notes: r.plan.notes.length, license: r.provenance, quality_downgrade: r.provenance.quality_downgrade, samples_used: [],
    sound_plan: identityPlan(wav, r.plan),
  };
  fs.writeFileSync(sidecarPath(wav), JSON.stringify(side, null, 2) + "\n");
  const stems = [];
  if (!args["no-stems"]) {
    const dir = wav.replace(/\.[^.\\/]+$/, "") + "-stems";
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, bus] of [["music", r.stems.music], ["ambience", r.stems.ambience], ["foley", r.stems.foley]]) {
      const f = path.join(dir, `${name}.wav`);
      fs.writeFileSync(f, wavBytes(scaleBus(bus, name === "foley" ? 0.7 : name === "music" ? 0.78 : 1), sr, r.frames));
      stems.push(f);
    }
  }
  noteDowngrade({ run, what: "sampled instruments in the original score", instead: "synthesised sine / triangle / noise voices", why: "no licence-verified instrument sample library ships with the skill", impact: "thinner than a produced track; pick a real track (--track) to replace it" });
  const diag = checkFile(wav, ev.input, { fps: opts.fps });
  fs.writeFileSync(wav.replace(/\.[^.\\/]+$/, "") + ".diagnostics.json", JSON.stringify(diag, null, 2) + "\n");
  for (const p of diag.problems) console.error(`problem: ${p}`);
  done({ ok: diag.ok, out: wav, sidecar: sidecarPath(wav), stems, sha256: side.sha256, duration_s: r.plan.duration_s, bpm: r.plan.bpm, key: r.plan.key, hits: r.plan.hits, sections: diag.sections, diagnostics: wav.replace(/\.[^.\\/]+$/, "") + ".diagnostics.json", problems: diag.problems, warnings: diag.warnings }, diag.ok ? 0 : 2);
}

if (cmd === "check") {
  const audio = str(args.audio);
  if (!audio) unable("--audio <file> is required");
  if (!fs.existsSync(path.resolve(audio))) unable(`audio not found: ${audio}`);
  const ev = readEvents(str(args.events), str(args.run));
  const diag = checkFile(path.resolve(audio), ev.input, { fps: args.fps != null ? Number(args.fps) : undefined });
  if (str(args.diagnostics)) fs.writeFileSync(path.resolve(String(args.diagnostics)), JSON.stringify(diag, null, 2) + "\n");
  for (const p of diag.problems) console.error(`problem: ${p}`);
  done(diag, diag.ok ? 0 : 2);
}

console.error(`unknown command "${cmd}"\n${HELP}`);
process.exit(1);

// ---------------------------------------------------------------------------------------------------- the check
function loadAudio(file) {
  const buf = fs.readFileSync(file);
  let w = readWav(buf);
  if (!w) {
    // any other container: ffmpeg decodes to 48 kHz stereo float (the only place this script calls it)
    const raw = execFileSync("ffmpeg", ["-v", "error", "-nostdin", "-i", file, "-vn", "-f", "f32le", "-ac", "2", "-ar", "48000", "-"], { maxBuffer: 1 << 30 });
    const n = Math.floor(raw.length / 8), L = new Float32Array(n), R = new Float32Array(n);
    for (let i = 0; i < n; i++) { L[i] = raw.readFloatLE(i * 8); R[i] = raw.readFloatLE(i * 8 + 4); }
    w = { sr: 48000, channels: [L, R], frames: n };
  }
  return w;
}
function dbv(x) { return 10 * Math.log10(Math.max(1e-12, x)); }

function checkFile(file, evInput, { fps } = {}) {
  const side = readSidecar(file);
  const norm = normalizeEvents(evInput, { fps });
  const events = norm.events, F = norm.fps;
  const w = loadAudio(file), sr = w.sr, n = w.frames;
  const L = w.channels[0], R = w.channels[1] || w.channels[0];
  const problems = [], warnings = [];
  const dur = n / sr;
  const mono = new Float32Array(n);
  let peak = 0, clipped = 0, sumsq = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.abs(L[i]), b = Math.abs(R[i]);
    if (a > peak) peak = a; if (b > peak) peak = b;
    if (a >= 0.999 || b >= 0.999) clipped++;
    mono[i] = (L[i] + R[i]) / 2; sumsq += mono[i] * mono[i];
  }
  const pre = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + mono[i] * mono[i];
  const ms = (a, b) => { const i0 = clamp(Math.floor(a * sr), 0, n), i1 = clamp(Math.floor(b * sr), 0, n); return i1 > i0 ? (pre[i1] - pre[i0]) / (i1 - i0) : 0; };
  const rmsDb = dbv(sumsq / Math.max(1, n));
  const peakDb = 20 * Math.log10(Math.max(1e-9, peak));

  // the film's length, to the frame
  const expect = norm.duration_s;
  const durErrFrames = Math.abs(dur - expect) * F;
  if (durErrFrames > 1) problems.push(`duration: the audio is ${r3(dur)} s but the film is ${r3(expect)} s (${r3(durErrFrames)} frames off; the limit is 1 frame)`);
  if (clipped > 0) problems.push(`clipping: ${clipped} sample frame(s) at full scale: the track is clipped (peak ${r3(peakDb)} dBFS)`);
  else if (peak > 0.891) problems.push(`peak: ${r3(peakDb)} dBFS is hotter than -1.0 dBFS: no headroom for the master's true-peak limiter`);

  // the level track and the sections
  const W = 0.05, nW = Math.floor(dur / W), lv = [];
  for (let i = 0; i < nW; i++) lv.push(dbv(ms(i * W, (i + 1) * W)));
  const secs = side?.sections || sectionsFromEvents(events, expect, side?.identity).map((s) => ({ name: s.name, start_s: s.start_s, end_s: s.end_s }));
  const endCue = side?.ending?.cue_at_s ?? null;
  const sectionRows = secs.map((s) => ({ name: s.name, start_s: s.start_s, end_s: s.end_s, rms_db: r3(dbv(ms(s.start_s, Math.min(s.end_s, endCue != null ? endCue : s.end_s)))) }));
  const intro = sectionRows[0], peakSec = sectionRows.slice(1).reduce((a, b) => (b.rms_db > a.rms_db ? b : a), sectionRows[1] || sectionRows[0]);
  const lift = peakSec && intro ? r3(peakSec.rms_db - intro.rms_db) : null;
  if (sectionRows.length >= 3 && lift != null && lift < 3) problems.push(`sections: the loudest section (${peakSec.name}) is only ${lift} dB above the intro: the sections do not differ in energy (needs 3 dB)`);

  // cue / frame alignment: the onset of the strongest rise within +-0.3 s of each cue
  const env1 = (t0, t1) => { // 3 ms RMS at a 1 ms hop, in dB
    const a = Math.max(0, Math.floor(t0 * sr)), b = Math.min(n, Math.floor(t1 * sr)), hop = Math.round(sr / 1000), win = Math.round(sr * 0.003), out = [];
    for (let i = a; i + win <= b; i += hop) out.push({ t: i / sr, db: dbv((pre[i + win] - pre[i]) / win) });
    return out;
  };
  const onsetNear = (t) => {
    const e = env1(t - 0.3, t + 0.3 + 0.01);
    let best = -1e9, at = null;
    for (let i = 0; i + 4 < e.length; i++) { const j = e[i + 3].db - e[i].db; if (j > best) { best = j; at = e[i + 3].t; } }
    return { onset_s: at, jump_db: r3(best) };
  };
  const byId = new Map(events.map((e) => [e.id, e]));
  const cueT = (name) => { const e = events.find((x) => x.kind === "music_cue" && x.cue === name); return e ? e.at_s : null; };
  let required = [];
  if (side) required = side.hits.map((h) => { const e = byId.get(h.id); const t = e ? e.at_s : h.id === "music-drop" ? cueT("drop_at") : h.id === "music-payoff" ? cueT("payoff_at") : null; return { id: h.id, role: h.role, at_s: t, missing: t == null }; });
  else {
    const drop = cueT("drop_at");
    const vh = events.filter((e) => e.kind === "visual_hit");
    const c = drop != null ? vh.filter((e) => Math.abs(e.at_s - drop) <= 0.25).sort((a, b) => Math.abs(a.at_s - drop) - Math.abs(b.at_s - drop))[0] : null;
    if (c) required.push({ id: c.id, role: "peak", at_s: c.at_s }); else if (drop != null) required.push({ id: "music-drop", role: "peak", at_s: drop });
  }
  const cues = [];
  let maxErrFrames = 0;
  for (const r of required) {
    if (r.missing) { problems.push(`hit ${r.id}: the score declares this hit but the events no longer have it: render the score again from the current events`); cues.push({ id: r.id, role: r.role, required: true, found: false }); continue; }
    const o = onsetNear(r.at_s);
    const errFrames = o.onset_s == null ? null : (o.onset_s - r.at_s) * F;
    const row = { id: r.id, role: r.role, required: true, at_s: r3(r.at_s), frame: Math.round(r.at_s * F), onset_s: o.onset_s == null ? null : r3(o.onset_s), onset_frame: o.onset_s == null ? null : Math.round(o.onset_s * F), err_ms: o.onset_s == null ? null : r3((o.onset_s - r.at_s) * 1000), err_frames: errFrames == null ? null : r3(errFrames), jump_db: o.jump_db };
    row.found = o.jump_db >= 6;
    row.within_one_frame = row.found && Math.abs(errFrames) <= 1;
    if (!row.found) problems.push(`hit ${r.id} at ${r3(r.at_s)} s: no onset (a rise of 6 dB or more) within 0.3 s: the music has no hit on this cue`);
    else if (!row.within_one_frame) problems.push(`hit ${r.id} at ${r3(r.at_s)} s: the onset is at ${row.onset_s} s, ${r3(errFrames)} frames away (the limit is 1 frame at ${F} fps): the audio is misaligned with the picture`);
    if (row.found) maxErrFrames = Math.max(maxErrFrames, Math.abs(errFrames));
    cues.push(row);
  }
  // causal foley, informational: where a stem exists its ticks are the picture's own
  for (const f of side?.foley || []) { const e = byId.get(f.id); if (e) cues.push({ id: f.id, role: "foley", required: false, at_s: r3(e.at_s), planned_at_s: f.at_s, moved: Math.abs(e.at_s - f.at_s) > 1e-6 }); }

  // silences: the designed pause and the ending are allowed; everything else under -60 dBFS for 0.5 s is a dropout
  const allowed = [...(side?.gates || []).map((g) => [g.from - 0.1, g.to + 0.1])];
  const silences = [];
  let run = 0;
  for (let i = 0; i <= lv.length; i++) {
    if (i < lv.length && lv[i] < -60) run++;
    else { if (run * W >= 0.5) { const a = (i - run) * W, b = i * W; silences.push({ from_s: r3(a), to_s: r3(b), designed: allowed.some(([x, y]) => a >= x && b <= y) || (endCue != null && a >= endCue) }); } run = 0; }
  }
  for (const s of silences) if (!s.designed) problems.push(`silence: ${s.from_s}-${s.to_s} s is under -60 dBFS: the score dropped out (a designed pause keeps the ambience and ends in a hit)`);
  // the designed pause: it must be there (a 10 dB dip below the median) when the score says it made one
  const live = lv.filter((v) => v > -80).sort((a, b) => a - b), median = live.length ? live[Math.floor(live.length / 2)] : -120;
  const pauseRow = side?.pause ? (() => { const a = side.pause.from, b = side.pause.to; const lo = dbv(ms(a + 0.05, b - 0.01)); return { from_s: a, to_s: b, level_db: r3(lo), below_median_db: r3(median - lo) }; })() : null;
  if (pauseRow && pauseRow.below_median_db < 8) problems.push(`pause: the designed pause ${pauseRow.from_s}-${pauseRow.to_s} s is only ${pauseRow.below_median_db} dB under the median level (needs 8): there is no pause before the hit`);

  // the ending: faded to nothing on the last frames, no dead air, nothing past the CTA
  const last30 = dbv(ms(dur - 0.03, dur));
  const audible = lv.findLastIndex((v) => v > -50);
  const lastAudible = audible < 0 ? null : (audible + 1) * W;
  const ctaEv = events.filter((e) => e.kind === "visual_hit" && /^(logo|cta|end)/i.test(String(e.attrs?.cue_kind || e.id))).sort((a, b) => b.at_s - a.at_s)[0];
  const ending = { last_audible_s: lastAudible == null ? null : r3(lastAudible), last_30ms_db: r3(last30), cue_at_s: endCue, cta_at_s: ctaEv ? ctaEv.at_s : null };
  if (last30 > -40) problems.push(`ending: the last 30 ms is at ${r3(last30)} dBFS: the track is cut off, not finished (a final fade to silence is needed)`);
  if (lastAudible == null) problems.push("ending: the track is silent");
  else if (dur - lastAudible > 1.5) warnings.push(`ending: ${r3(dur - lastAudible)} s of silence at the end (the film's logo / CTA is early, or the score stopped early)`);
  if (ctaEv && lastAudible != null && lastAudible - ctaEv.at_s > 1.3) problems.push(`music past the CTA: audible ${r3(lastAudible - ctaEv.at_s)} s after the logo / CTA at ${r3(ctaEv.at_s)} s (the music stops on it)`);
  // an audible finish: the closing chord is clearly there (above the ambience) and then decays
  if (endCue != null) { const fin = dbv(ms(endCue, endCue + 0.4)), before = dbv(ms(endCue - 1.2, endCue - 0.2)); ending.finish_db = r3(fin); ending.before_db = r3(before); if (fin < before - 9) warnings.push(`ending: the closing chord (${r3(fin)} dBFS) is much quieter than the bar before it (${r3(before)} dBFS)`); }

  // a bed that loops: windows of the level track that repeat verbatim 6 s or more apart
  const lv2 = [];
  for (let i = 0; i < Math.floor(dur / 0.1); i++) lv2.push(dbv(ms(i * 0.1, (i + 1) * 0.1)));
  const winN = 40, minLag = 60;
  let loop = { checked: lv2.length > winN + minLag, worst_corr: null, at_s: null, lag_s: null };
  if (loop.checked) {
    for (let a = 0; a + winN + minLag <= lv2.length; a += 5) for (let lag = minLag; a + lag + winN <= lv2.length; lag += 5) {
      let ma = 0, mb = 0; for (let k = 0; k < winN; k++) { ma += lv2[a + k]; mb += lv2[a + lag + k]; } ma /= winN; mb /= winN;
      let sab = 0, saa = 0, sbb = 0; for (let k = 0; k < winN; k++) { const x = lv2[a + k] - ma, y = lv2[a + lag + k] - mb; sab += x * y; saa += x * x; sbb += y * y; }
      if (saa / winN < 9 || sbb / winN < 9) continue; // a flat stretch (3 dB std) repeats trivially
      const c = sab / Math.sqrt(saa * sbb + 1e-12);
      if (loop.worst_corr == null || c > loop.worst_corr) loop = { checked: true, worst_corr: r3(c), at_s: a / 10, lag_s: lag / 10 };
    }
    if (loop.worst_corr != null && loop.worst_corr > 0.995) problems.push(`loop: the level shape of ${loop.at_s}-${r3(loop.at_s + winN / 10)} s repeats at ${r3(loop.at_s + loop.lag_s)} s (correlation ${loop.worst_corr}): an audibly looped block`);
  }

  const lic = side ? side.license : null;
  const provenance = side
    ? { origin: "procedural", sidecar: path.basename(sidecarPath(file)), license: lic.license, samples_used: lic.samples_used, credits: lic.credits, quality_downgrade: lic.quality_downgrade, seed: lic.seed, identity: lic.identity, sha256_matches: side.sha256 === sha256(fs.readFileSync(file)) }
    : { origin: "unknown", note: "no .score.json beside the file: licence and provenance are not known to this tool (the user's own or a catalog track keeps its own entry in music/LICENSES.json)" };
  if (side && !provenance.sha256_matches) warnings.push("provenance: the file differs from the one the sidecar describes (re-rendered, mastered or edited since)");
  return {
    ok: problems.length === 0, file, sr, channels: w.channels.length, duration_s: r3(dur), expected_duration_s: r3(expect), fps: F, duration_err_frames: r3(durErrFrames),
    rms_db: r3(rmsDb), peak_dbfs: r3(peakDb), clipped_samples: clipped, median_db: r3(median), sections: sectionRows, section_lift_db: lift, pause: pauseRow,
    cues, hits: { required: required.length, max_err_frames: r3(maxErrFrames), all_within_one_frame: cues.filter((c) => c.required).every((c) => c.within_one_frame) },
    silences, ending, loop, provenance, problems, warnings,
  };
}
function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
