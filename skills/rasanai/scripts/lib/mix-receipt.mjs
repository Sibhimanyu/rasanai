// Mix and delivery as data (Plan 07 A5, A9): destination loudness profiles, honest measurement evaluation, dialogue-first ducking, preserved tails and
// a receipt that names the exact inputs of a mix so an old cached file can never stand in for a new one.
// Runs no audio tool: measurements come from lib/audio.mjs loudness()/probe (sound.mjs check) and are passed in.
//
//   PROFILES, resolveProfile(p)         named destination profiles; "rasanai-house" is the repo's existing default (-14 LUFS, -1.5 dBTP limit)
//   measureRecord(raw), evaluateMeasures(m, o)    integrated / short-term loudness, true peak, clipping, channels, sample rate, duration; silence handled
//   duckEnvelope(spans, o)              music/ambience gain under speech with a depth cap and merged gaps (no pumping)
//   stemSet(files), tailsPreserved(clips, o)
//   mixInputs(o), mixDigests(inputs), receipt(o), receiptMatches(r, current), cachedMixName(base, ext, digests), reuseDecision(o)
//   currentInputs(run), readReceipt(run, kind), writeReceipt(run, r)
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { canonicalDigest, SCHEMA_VERSION } from "./contracts.mjs";
import { scoreRevision } from "./timing.mjs";

const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);
const T = (x) => (typeof x === "string" ? x.trim() : x == null ? "" : String(x).trim());
const num = (x, d = null) => (x !== null && x !== "" && x !== undefined && Number.isFinite(Number(x)) ? Number(x) : d);
const r1 = (x) => (x == null ? x : Math.round(x * 10) / 10);
const r3 = (x) => (x == null ? x : Math.round(x * 1000) / 1000);
const rjson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

// ---- destination profiles ------------------------------------------------------------------------------------------------------------------
// integrated_lufs / tolerance_lu: the target and how far a measurement may sit from it; true_peak_max_db: the CHECK ceiling; true_peak_limit_db: where the
// limiter works (lower, for headroom). There is no universal online number: a profile is a named destination, picked per film.
export const HOUSE_PROFILE_ID = "rasanai-house";
export const PROFILES = Object.freeze({
  "rasanai-house": { id: "rasanai-house", label: "RasanAI house default (web video)", integrated_lufs: -14, tolerance_lu: 1, true_peak_max_db: -1.0, true_peak_limit_db: -1.5, encoded_extra_headroom_db: 0.5, origin: "the values scripts/sound.mjs check and master used before profiles existed (kept until measured and deliberately changed)" },
  "ebu-r128": { id: "ebu-r128", label: "EBU R128 broadcast", integrated_lufs: -23, tolerance_lu: 0.5, true_peak_max_db: -1.0, true_peak_limit_db: -1.0, encoded_extra_headroom_db: 0.5, origin: "EBU R128 (-23 LUFS, -1 dBTP)" },
  "atsc-a85": { id: "atsc-a85", label: "ATSC A/85 broadcast", integrated_lufs: -24, tolerance_lu: 2, true_peak_max_db: -2.0, true_peak_limit_db: -2.0, encoded_extra_headroom_db: 0.5, origin: "ATSC A/85 (-24 LKFS, -2 dBTP)" },
});
// p: a profile id, or { base?: id, ...overrides } (custom: every field is the person's choice and is recorded as custom)
export function resolveProfile(p = HOUSE_PROFILE_ID) {
  if (typeof p === "string") return PROFILES[p] ? { ...PROFILES[p] } : { ...PROFILES[HOUSE_PROFILE_ID], requested: p, fell_back: true, note: `unknown profile ${JSON.stringify(p)}: the house profile was used` };
  const base = PROFILES[T(p.base)] || PROFILES[HOUSE_PROFILE_ID];
  const out = { ...base, ...p, id: T(p.id) || `custom-${canonicalDigest(p).slice(0, 8)}`, custom: true };
  for (const k of ["integrated_lufs", "tolerance_lu", "true_peak_max_db", "true_peak_limit_db"]) out[k] = num(p[k], base[k]);
  return out;
}

// ---- measurement ---------------------------------------------------------------------------------------------------------------------------------
// raw: lib/audio.mjs loudness() output {lufs, lra, true_peak} plus whatever the caller probed: {short_term_max, clipped_samples, total_samples, channels, sample_rate, duration, has_audio, peak_dbfs}
export function measureRecord(raw = {}) {
  const lufs = num(raw.lufs ?? raw.integrated_lufs);
  return {
    integrated_lufs: lufs == null || lufs < -69 ? null : lufs, // ffmpeg ebur128 prints -inf (parsed null/-70) for silence: loudness is UNDEFINED there, not -70
    short_term_max_lufs: num(raw.short_term_max ?? raw.short_term_max_lufs),
    lra: num(raw.lra), true_peak_db: num(raw.true_peak ?? raw.true_peak_db),
    clipped_samples: num(raw.clipped_samples), total_samples: num(raw.total_samples),
    channels: num(raw.channels), sample_rate: num(raw.sample_rate), duration_s: num(raw.duration ?? raw.duration_s),
    has_audio: raw.has_audio !== false,
  };
}
// o: { profile, expected_duration_s, frame_s, expected_channels, expected_sample_rate, silent_by_choice (reason), audio_expected }
export function evaluateMeasures(m, { profile = HOUSE_PROFILE_ID, expected_duration_s = null, frame_s = 1 / 30, expected_channels = null, expected_sample_rate = null, silent_by_choice = "", audio_expected = true } = {}) {
  const P = typeof profile === "string" || !profile.integrated_lufs ? resolveProfile(profile) : profile;
  const issues = [], measures = { ...m };
  const add = (severity, check, message, fix) => issues.push({ severity, check, message, ...(fix ? { fix } : {}) });
  // silence has its own path: loudness is undefined, and a silent film is a decision, not a pass or a failure by number
  if (!m.has_audio) {
    return silentVerdict({ P, why: "the file has no audio stream", silent_by_choice, audio_expected, measures, issues, kind: "no_audio_stream" });
  }
  if (m.integrated_lufs == null) {
    return silentVerdict({ P, why: "the audio is silence: integrated loudness is undefined (not 0, not -70)", silent_by_choice, audio_expected, measures, issues, kind: "silence_only" });
  }
  const dl = m.integrated_lufs - P.integrated_lufs;
  if (Math.abs(dl) > P.tolerance_lu) add("error", "integrated-loudness", `${r1(m.integrated_lufs)} LUFS against ${P.integrated_lufs} +/-${P.tolerance_lu} for ${P.id}`, `gain the master by ${r1(-dl)} dB, then re-limit at ${P.true_peak_limit_db} dBTP`);
  if (m.true_peak_db != null && m.true_peak_db > P.true_peak_max_db) add("error", "true-peak", `${r1(m.true_peak_db)} dBTP is over the ${P.true_peak_max_db} dBTP ceiling for ${P.id}`, `limit at ${P.true_peak_limit_db} dBTP (4x oversampled) before encoding, then re-check the encoded file`);
  if (m.clipped_samples != null && m.clipped_samples > 0) add("error", "clipping", `${m.clipped_samples} clipped sample(s)${m.total_samples ? ` (${(100 * m.clipped_samples / m.total_samples).toFixed(4)}%)` : ""}`, "lower the gain before the limiter, or fix the stem that clips");
  else if (m.clipped_samples == null) add("info", "clipping-unmeasured", "clipping was not measured: this is not a pass");
  if (m.short_term_max_lufs != null && m.short_term_max_lufs > P.integrated_lufs + 8) add("warning", "short-term-peak", `the loudest 3 s window is ${r1(m.short_term_max_lufs)} LUFS, ${r1(m.short_term_max_lufs - P.integrated_lufs)} LU over the target: a section may feel much louder than the rest`);
  if (expected_duration_s != null && m.duration_s != null && Math.abs(m.duration_s - expected_duration_s) > Math.max(frame_s, 0.04)) add("error", "duration", `audio is ${r3(m.duration_s)} s, the film is ${r3(expected_duration_s)} s`, "re-render the mix to the film length (a tail may have been cut: see tailsPreserved)");
  if (expected_channels != null && m.channels != null && m.channels !== expected_channels) add("warning", "channels", `${m.channels} channel(s), expected ${expected_channels}`);
  if (expected_sample_rate != null && m.sample_rate != null && m.sample_rate !== expected_sample_rate) add("warning", "sample-rate", `${m.sample_rate} Hz, expected ${expected_sample_rate}`);
  return {
    state: "measured", ok: !issues.some((i) => i.severity === "error"), profile: P.id, profile_origin: P.origin || (P.custom ? "custom" : undefined), issues, measures,
    // not claimed from metadata: a mono sum can cancel and a phone speaker drops the low end; both need a listen in the final validation
    deferred: [{ check: "mono_downmix", why: "needs a listen or a measured mono sum in final validation; channel count does not prove mono compatibility" }, { check: "phone_speaker", why: "needs a listen on a small speaker in final validation; loudness numbers do not prove it" }],
  };
}
function silentVerdict({ P, why, silent_by_choice, audio_expected, measures, issues, kind }) {
  if (T(silent_by_choice)) return { state: "silent_by_choice", ok: true, kind, profile: P.id, reason: T(silent_by_choice), issues, measures, note: `${why}; the direction chose a silent deliverable, so no loudness target applies` };
  if (!audio_expected) return { state: "silent", ok: true, kind, profile: P.id, issues, measures, note: `${why}; no audio was expected (a no-VO, no-music film is complete)` };
  issues.push({ severity: "error", check: kind === "no_audio_stream" ? "no-audio" : "silent-mix", message: `${why}, but audio was expected: this is an audio failure (generation or assembly), not a silent deliverable`, fix: "re-run the stem that should carry sound, or record a silent-by-choice reason in audio/direction.json" });
  return { state: "audio_missing", ok: false, kind, profile: P.id, issues, measures };
}

// ---- dialogue first, without pumping -------------------------------------------------------------------------------------------------------------
// spans: [{start_s, end_s}] of speech (film time). -> { points: [[t, db]], ducks, flags }. Spans closer than merge_gap_s share one duck, depth is capped, and
// the release is slow: the three things that make a duck pump. Defaults follow references/sound.md (3-6 dB lane, 0.25 s early, 0.4 s hold, 0.8 s back).
export function duckEnvelope(spans, { depth_db = 5, max_depth_db = 9, merge_gap_s = 1.2, lead_s = 0.25, attack_s = 0.3, hold_s = 0.4, release_s = 0.8, film_s = null } = {}) {
  const depth = Math.min(Math.abs(depth_db), max_depth_db);
  const S = arr(spans).map((s) => [num(s.start_s ?? s[0]), num(s.end_s ?? s[1])]).filter(([a, b]) => a != null && b != null && b > a).sort((x, y) => x[0] - y[0]);
  const lanes = [];
  for (const [a, b] of S) { const l = lanes[lanes.length - 1]; if (l && a - l[1] < merge_gap_s) l[1] = Math.max(l[1], b); else lanes.push([a, b]); }
  const pts = [[0, 0]];
  for (const [a, b] of lanes) {
    const down = Math.max(0, a - lead_s), floorAt = down + attack_s, up = b + hold_s;
    if (down > pts[pts.length - 1][0]) pts.push([r3(down), 0]);
    pts.push([r3(floorAt), -depth], [r3(up), -depth], [r3(up + release_s), 0]);
  }
  const end = film_s != null ? film_s : null;
  if (end != null && pts[pts.length - 1][0] < end) pts.push([r3(end), 0]);
  const flags = [];
  const film = end ?? (lanes.length ? lanes[lanes.length - 1][1] + hold_s + release_s : 0);
  if (film > 0 && (lanes.length / film) * 10 > 4) flags.push({ check: "pumping-risk", message: `${lanes.length} ducks in ${r1(film)} s: the bed will pump; widen merge_gap_s or duck the whole spoken section as one` });
  if (Math.abs(depth_db) > max_depth_db) flags.push({ check: "depth-capped", message: `depth ${depth_db} dB capped at ${max_depth_db} dB: a deeper duck is a blanket mute, not a mix` });
  if (release_s < 0.3) flags.push({ check: "fast-release", message: "a release under 0.3 s is audible as pumping" });
  return { points, ducks: lanes.length, lanes, depth_db: depth, flags };
}

// ---- stems and tails -----------------------------------------------------------------------------------------------------------------------------
// files: { vo, music, sfx, ambience: path|null } -> which stems exist; a pre-mixed bed is labelled, never passed off as separate stems
export function stemSet(files = {}) {
  const names = ["vo", "music", "sfx", "ambience"];
  const have = names.filter((n) => T(files[n]));
  const out = { stems: Object.fromEntries(have.map((n) => [n, T(files[n])])), separate: have.length >= 2, missing: names.filter((n) => !have.includes(n)) };
  if (T(files.combined) && !out.separate) out.combined = T(files.combined);
  out.note = out.separate ? "separate stems: dialogue, music and effects can be balanced and ducked on their own" : out.combined ? "only a pre-mixed track: ducking and per-stem fixes are not possible, say so in the mix note" : "no stems recorded";
  return out;
}
// clips: [{id, kind: "music"|"vo"|"sfx", audible_end_s, assembled_end_s, ends_with?: "cut"|"fade"}] (film time). A tail cut by assembly is an error unless declared.
export function tailsPreserved(clips, { film_s = null, tol_s = 0.02 } = {}) {
  const issues = [];
  for (const c of arr(clips)) {
    const a = num(c.audible_end_s), b = num(c.assembled_end_s);
    if (a == null || b == null) { issues.push({ severity: "info", clip: c.id, check: "tail-unmeasured", message: "tail not measured: not a pass" }); continue; }
    if (b < a - tol_s && !["cut", "fade"].includes(c.ends_with)) issues.push({ severity: "error", clip: c.id, check: "tail-cut", message: `${c.kind || "clip"} ${c.id} is cut ${r3(a - b)} s before its audible end (assembly trimmed the tail); declare ends_with: "fade" or "cut" if it is intended` });
    if (film_s != null && a > film_s + tol_s && !["cut", "fade"].includes(c.ends_with)) issues.push({ severity: "warning", clip: c.id, check: "tail-past-film", message: `${c.id} rings ${r3(a - film_s)} s past the film's end: extend the film's audio tail or fade it deliberately` });
  }
  return { ok: !issues.some((i) => i.severity === "error"), issues };
}

// ---- A9: the receipt --------------------------------------------------------------------------------------------------------------------------------
const fileDigest = (f) => { try { return crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex"); } catch { return null; } };
// o: { score, score_revision, cues_digest, direction_digest, contract_digest, stems: {name: path|{file, digest}}, automation: {...}, profile, run }
export function mixInputs({ score = null, score_revision = null, cues_digest = null, direction_digest = null, contract_digest = null, stems = {}, automation = {}, profile = HOUSE_PROFILE_ID, run = null } = {}) {
  const st = {};
  for (const [k, v] of Object.entries(isObj(stems) ? stems : {})) {
    const d = isObj(v) ? v.digest || (v.file && fileDigest(run ? path.resolve(run, v.file) : v.file)) : v && fileDigest(run ? path.resolve(String(run), String(v)) : String(v));
    st[k] = d || null; // an unreadable stem is null, which never equals a real digest
  }
  const P = resolveProfile(profile);
  return { score: score_revision || (score ? scoreRevision(score) : null), cues: cues_digest, direction: direction_digest, contract: contract_digest, stems: st, automation: canonicalDigest(automation), profile: canonicalDigest({ id: P.id, l: P.integrated_lufs, p: P.true_peak_limit_db }) };
}
export function mixDigests(inputs) {
  const stems = Object.fromEntries(Object.entries(inputs.stems || {}).sort(([a], [b]) => a.localeCompare(b)));
  const parts = { score: inputs.score, cues: inputs.cues, direction: inputs.direction, contract: inputs.contract, stems, automation: inputs.automation, profile: inputs.profile };
  return { ...parts, mix: canonicalDigest(parts) };
}
// kind: "preview" | "delivery". The receipt names exactly what the mix was made from.
export function receipt({ kind = "preview", inputs, profile = HOUSE_PROFILE_ID, output = {}, measures = null, created_at = null } = {}) {
  const P = resolveProfile(profile), digests = mixDigests(inputs);
  return {
    schema_version: SCHEMA_VERSION, kind: kind === "delivery" ? "delivery" : "preview",
    digests, profile: { id: P.id, integrated_lufs: P.integrated_lufs, true_peak_limit_db: P.true_peak_limit_db, custom: !!P.custom },
    output: { file: T(output.file) || null, file_digest: T(output.file_digest) || null },
    measures, created_at: created_at || new Date().toISOString(),
  };
}
// is this receipt still true for the inputs as they are now? -> { reusable, stale: [names that differ] }
export function receiptMatches(r, current) {
  if (!isObj(r) || !isObj(r.digests)) return { reusable: false, stale: ["receipt"], reason: "no receipt: the mix cannot be shown to match its inputs" };
  const now = mixDigests(current), then = r.digests;
  const stale = [];
  for (const k of ["score", "cues", "direction", "contract", "automation", "profile"]) if ((then[k] ?? null) !== (now[k] ?? null)) stale.push(k);
  const names = new Set([...Object.keys(then.stems || {}), ...Object.keys(now.stems || {})]);
  for (const n of names) if (((then.stems || {})[n] ?? null) !== ((now.stems || {})[n] ?? null) || ((now.stems || {})[n] ?? null) === null) stale.push(`stem:${n}`);
  return { reusable: !stale.length, stale, reason: stale.length ? `changed since the mix was made: ${stale.join(", ")}` : "every input digest matches" };
}
// a content-addressed name: the same base never names two different mixes
export const cachedMixName = (base, ext, digests) => `${base}.${String(digests.mix).slice(0, 12)}.${String(ext).replace(/^\./, "")}`;
// the one question a renderer asks before reusing a cached mix file
// o: { receipt, current (mixInputs), file (the candidate cached path) }
export function reuseDecision({ receipt: r, current, file = "" }) {
  const m = receiptMatches(r, current);
  if (!m.reusable) return { reuse: false, reason: m.reason, stale: m.stale };
  const want = String(mixDigests(current).mix).slice(0, 12);
  // an unchanged FILENAME proves nothing: the receipt must match AND the named file must be the one the receipt made
  if (file && r.output && r.output.file && path.basename(r.output.file) !== path.basename(file)) return { reuse: false, reason: "the cached file is not the file this receipt recorded", stale: ["output"] };
  return { reuse: true, reason: m.reason, digest: want };
}

// ---- files -------------------------------------------------------------------------------------------------------------------------------------------
export const receiptPath = (run, kind) => path.join(String(run), "audio", `mix-receipt-${kind === "delivery" ? "delivery" : "preview"}.json`);
export const readReceipt = (run, kind) => rjson(receiptPath(run, kind));
export function writeReceipt(run, r) {
  const f = receiptPath(run, r.kind);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = `${f}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(r, null, 2) + "\n");
  fs.renameSync(tmp, f);
  return { ok: true, file: path.relative(String(run), f) };
}
// what the run's mix inputs are NOW (score revision, cue digest, direction, contract, the contract's stems, the ducking automation file when present)
export function currentInputs(run, { profile = HOUSE_PROFILE_ID } = {}) {
  const R = String(run);
  const score = rjson(path.join(R, "motion", "score.json"));
  const cues = rjson(path.join(R, "motion", "cues.json"));
  const dir = rjson(path.join(R, "audio", "direction.json"));
  const con = rjson(path.join(R, "audio", "contract.json")) || rjson(path.join(R, "storyboard", "audio.json"));
  const auto = rjson(path.join(R, "audio", "automation.json")) || {};
  const stems = { ...(isObj(con && con.stems) ? con.stems : {}) };
  if (con && con.file && !Object.keys(stems).length) stems.music = con.file; // a legacy contract: the one file it names
  return mixInputs({ score, cues_digest: cues && cues.digest || null, direction_digest: dir ? canonicalDigest(dir) : null, contract_digest: con ? con.digest || canonicalDigest(con) : null, stems, automation: auto, profile, run: R });
}
