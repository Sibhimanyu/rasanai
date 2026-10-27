// One bus / automation definition for every mix route (addendum 2 section 4). Planning is pure (no audio tool, no model call); only mixRevisionOf, writeBusPlan and busPlanForRun at the end read or write the run's audio/ records. Status: implemented_unvalidated.
//
//   dbToLinear(db), linearToDb(lin)                  the ONLY conversion pair; everything in a plan is dB, conversion happens in renderBoundary
//   aggregateReductions(list, policy)                bounded-max over overlapping reductions (never a product), trapezoid attack/hold/release
//   busPlan({direction, sound_resolved, cues, voice_spans, music, stems, profile, silence_windows, film_s, mix_policy_revision})
//   busPlanDigest(plan)                              the digest mix-receipt records under `automation`
//   renderBoundary(plan, route, {renderer})          declarative element specs for "hyperframes" | "ffmpeg-quick" | "ffmpeg-reel"
//   ROLE_IDS                                         role-bearing element ids / groups
//
// Producers/consumers (named, not wired here): ENG-INT-2 calls busPlan from S/soundplan.mjs (writes audio/automation.json = plan.music_automation
// record + digest) and renderBoundary from S/video.mjs audio-lock, S/reel.mjs, S/handoff.mjs, L/quick-film.mjs (hostHtml AND audioArgs from ONE plan).
// L/mix-receipt.mjs currentInputs reads audio/automation.json and records the digest. L/sfx-layers.mjs and L/music-*.mjs hand cues/music in.
//
// Rules this file enforces by construction:
//  - a speech reduction is derived ONLY from voice spans (their ids); a cue/SFX id offered as a speech source is rejected with a flag;
//  - ordinary clicks/toggles/accents never reduce the music (ordinary_sfx_duck is always false); a prominent event may carry a bounded reduction ONLY with a stated reason;
//  - dramatic silence is an authored interval (silence_windows[].authored === true with a reason), never automatic;
//  - overlapping reductions combine by bounded-max (policy "bounded-max"), capped at max_total_db;
//  - a reduction is a gain lane on the continuing bed: never a trim, restart or re-instantiation.
import fs from "node:fs";
import path from "node:path";
import { canonicalDigest } from "./contracts.mjs";
import { duckEnvelope, automationPath, automationRecord } from "./mix-receipt.mjs";
import { stemBuses } from "./music-arrangement.mjs";

const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);
const T = (x) => (typeof x === "string" ? x.trim() : x == null ? "" : String(x).trim());
const num = (x, d = null) => (x !== null && x !== "" && x !== undefined && Number.isFinite(Number(x)) ? Number(x) : d);
const r3 = (x) => (x == null ? x : Math.round(x * 1000) / 1000);
const r2 = (x) => (x == null ? x : Math.round(x * 100) / 100);

export const MIX_BUS_VERSION = 1;
export const dbToLinear = (db) => Math.pow(10, db / 20);
export const linearToDb = (lin) => (lin > 0 ? 20 * Math.log10(lin) : -Infinity);

// role-bearing ids and groups (explicit, so no renderer-side name classifier is needed to know what an element is)
export const ROLE_IDS = Object.freeze({
  music: { id: "music-bed", role: "music", group: "music" },
  voice: { prefix: "voice", role: "voice", group: "voiceover" },
  sfx: { prefix: "sfx", role: "sfx", group: "sfx" },
  ambience: { prefix: "ambience", role: "ambience", group: "ambience" },
});
export const AGGREGATE_DEFAULT = Object.freeze({ policy: "bounded-max", max_total_db: 12, attack_s: 0.3, hold_s: 0.4, release_s: 0.8 });
export const MAX_LANE_POINTS = 32; // trace: lane under 32 points (reel dedupe dropped points; engine allows 512)
const REASONS = new Set(["speech", "prominent_event", "authored_silence"]);

// ---- bounded aggregation -----------------------------------------------------------------------------------------------------------------------
// list: [{reason, start_s, end_s, depth_db (positive = how far the music goes down), source_id, attack_s?, hold_s?, release_s?}]
// -> {points:[[t,db<=0]], applied[], ignored[], flags[]}. Each reduction is a trapezoid; the result is the DEEPEST of them at every instant, never their sum or product.
export function aggregateReductions(list, policy = {}) {
  const P = { ...AGGREGATE_DEFAULT, ...(isObj(policy) ? policy : {}), policy: "bounded-max" };
  const flags = [], applied = [], ignored = [];
  for (const r of arr(list)) {
    const a = num(r && r.start_s), b = num(r && r.end_s), d = Math.abs(num(r && r.depth_db, 0));
    if (a == null || b == null || b <= a || !(d > 0) || !REASONS.has(T(r && r.reason))) { ignored.push({ ...(isObj(r) ? r : {}), why: "invalid reduction (needs start_s<end_s, depth_db>0, a known reason)" }); continue; }
    applied.push({ reason: T(r.reason), start_s: a, end_s: b, depth_db: Math.min(d, P.max_total_db), source_id: T(r.source_id) || null, attack_s: Math.max(0.02, num(r.attack_s, P.attack_s)), hold_s: Math.max(0, num(r.hold_s, P.hold_s)), release_s: Math.max(0.05, num(r.release_s, P.release_s)) });
    if (d > P.max_total_db) flags.push({ check: "depth-capped", message: `a ${T(r.reason)} reduction of ${r2(d)} dB was capped at ${P.max_total_db} dB: a deeper reduction is a blanket mute, not a mix` });
  }
  if (!applied.length) return { points: [[0, 0]], applied, ignored, flags, aggregate: P };
  // trapezoid i: 0 dB at s-attack, -depth at s, held to e+hold, back to 0 at e+hold+release (the lead mirrors duckEnvelope: the dip starts BEFORE the span)
  const lines = applied.map((r) => { const t0 = Math.max(0, r.start_s - r.attack_s), t1 = r.start_s, t2 = r.end_s + r.hold_s, t3 = t2 + r.release_s; return { t0, t1, t2, t3, d: r.depth_db }; });
  const val = (L, t) => (t <= L.t0 || t >= L.t3 ? 0 : t < L.t1 ? -L.d * (t - L.t0) / (L.t1 - L.t0 || 1) : t <= L.t2 ? -L.d : -L.d * (1 - (t - L.t2) / (L.t3 - L.t2)));
  const knots = [...new Set([0, ...lines.flatMap((L) => [L.t0, L.t1, L.t2, L.t3])].map(r3))].sort((x, y) => x - y);
  const pts = [], env = (t) => Math.min(0, ...lines.map((L) => val(L, t)));
  for (let i = 0; i < knots.length; i++) {
    pts.push([knots[i], r2(env(knots[i]))]);
    if (i + 1 < knots.length) { // crossings inside the interval: the max of linear pieces bends where two pieces meet
      const a = knots[i], b = knots[i + 1], cross = [];
      for (let x = 0; x < lines.length; x++) for (let y = x + 1; y < lines.length; y++) {
        const fa = val(lines[x], a + 1e-6), fb = val(lines[x], b - 1e-6), ga = val(lines[y], a + 1e-6), gb = val(lines[y], b - 1e-6);
        const da = fa - ga, db = fb - gb;
        if (da * db < 0) { const t = a + (b - a) * (da / (da - db)); cross.push(r3(t)); }
      }
      for (const t of cross.sort((p, q) => p - q)) if (t > a && t < b) pts.push([t, r2(env(t))]);
    }
  }
  const dedup = pts.filter((p, i) => i === 0 || p[0] > pts[i - 1][0]);
  return { points: thinPoints(dedup, MAX_LANE_POINTS, flags), applied, ignored, flags, aggregate: P };
}
// drop the least significant interior points until the lane fits (keeps first, last and the deepest turning points)
function thinPoints(points, max, flags) {
  let p = points.slice();
  if (p.length <= max) return p;
  const before = p.length;
  while (p.length > max) {
    let best = -1, bestErr = Infinity;
    for (let i = 1; i < p.length - 1; i++) {
      const [t0, v0] = p[i - 1], [t1, v1] = p[i], [t2, v2] = p[i + 1];
      const err = Math.abs(v1 - (v0 + (v2 - v0) * ((t1 - t0) / ((t2 - t0) || 1))));
      if (err < bestErr) { bestErr = err; best = i; }
    }
    if (best < 0) break;
    p.splice(best, 1);
  }
  flags.push({ check: "lane-thinned", message: `the music lane was thinned from ${before} to ${p.length} points (least significant first)` });
  return p;
}

// ---- the plan ----------------------------------------------------------------------------------------------------------------------------------
// voice_spans: [{id, start_s, end_s}]  (ids of the VOICE elements: the only legal speech-reduction sources)
// cues: [{id, start_s, duration_s?, gain_db? | volume?, prominent?, reduce_music?:{depth_db, reason}, role?}]
// music: {base_db? | volume? (linear), baseline_gap_db? (measured music-under-voice level gap, dB), id?, source?, section?}
// silence_windows: [{start_s, end_s, authored:true, reason}]  (an interval without authored:true + reason is ignored)
export function busPlan({ direction = null, sound_resolved = null, cues = [], voice_spans = [], music = {}, stems = {}, profile = null, silence_windows = [], film_s = null, mix_policy_revision = null, aggregate = {} } = {}) {
  const flags = [], reductions = [];
  const rev = mix_policy_revision ?? (direction && direction.mix_policy_revision) ?? null;
  const M = isObj(music) ? music : {};
  const musicBase = num(M.base_db, M.volume != null && num(M.volume) > 0 ? linearToDb(num(M.volume)) : -14);
  const resolved = isObj(sound_resolved) && isObj(sound_resolved.resolved) ? sound_resolved.resolved : isObj(sound_resolved) ? sound_resolved : {};
  const agg = { ...AGGREGATE_DEFAULT, ...(isObj(aggregate) ? aggregate : {}), policy: "bounded-max" };

  // speech: from voice spans ONLY. Depth follows the actual baseline gap when measured, else the repo's 5 dB lane; a music-led direction keeps more presence.
  const spans = arr(voice_spans).filter((s) => T(s && s.id) && num(s.end_s) > num(s.start_s));
  const cueIds = new Set(arr(cues).map((c) => T(c && c.id)));
  for (const s of spans) if (cueIds.has(T(s.id))) flags.push({ check: "speech-source-rejected", message: `${T(s.id)} is a cue id: an effect never feeds a speech reduction` });
  const voiceSpans = spans.filter((s) => !cueIds.has(T(s.id)));
  if (voiceSpans.length) {
    const gap = num(M.baseline_gap_db), target = num(M.target_gap_db, 12);
    const base = gap != null ? Math.max(0, target - gap) : resolved.music_role === "led" ? 3 : resolved.music_role === "sparse" ? 4 : 5;
    const depth = Math.min(base, agg.max_total_db);
    if (gap != null && base === 0) flags.push({ check: "speech-space-already-present", message: `the bed already sits ${r2(gap)} dB under the voice: no extra reduction is added` });
    if (depth > 0) {
      const env = duckEnvelope(voiceSpans.map((s) => ({ start_s: s.start_s, end_s: s.end_s })), { depth_db: depth, max_depth_db: agg.max_total_db, attack_s: agg.attack_s, hold_s: agg.hold_s, release_s: agg.release_s, film_s });
      for (const f of env.flags) flags.push(f);
      env.lanes.forEach(([a, b], i) => { // merged short gaps: one reduction per merged lane, source ids = the voice spans it covers
        const ids = voiceSpans.filter((s) => num(s.start_s) >= a - 1e-6 && num(s.end_s) <= b + 1e-6).map((s) => T(s.id));
        reductions.push({ reason: "speech", start_s: r3(a), end_s: r3(b), depth_db: depth, source_id: ids.join("+") || `speech-${i}` });
      });
    }
  }
  // prominent events: optional, bounded, ONLY with a stated reason; everything else leaves the music alone
  for (const c of arr(cues)) {
    const id = T(c && c.id), want = c && c.reduce_music;
    if (!id) continue;
    if (!want) continue;
    const reason = T(isObj(want) ? want.reason : ""), depth = Math.abs(num(isObj(want) ? want.depth_db : want, 0));
    if (!c.prominent) { flags.push({ check: "ordinary-reduction-ignored", message: `${id} asked for a music reduction but is not a prominent event: ordinary effects never reduce the music` }); continue; }
    if (!reason) { flags.push({ check: "reduction-reason-missing", message: `${id}: a prominent-event reduction needs a stated reason` }); continue; }
    if (!(depth > 0)) continue;
    const a = num(c.start_s, 0);
    reductions.push({ reason: "prominent_event", start_s: r3(a), end_s: r3(a + Math.max(0.1, num(c.duration_s, 0.4))), depth_db: Math.min(depth, 4), source_id: id, note: reason, attack_s: 0.05, hold_s: 0.15, release_s: 0.5 });
  }
  // authored silence: explicit intervals only
  for (const w of arr(silence_windows)) {
    if (!(w && w.authored === true && T(w.reason))) { flags.push({ check: "silence-not-authored", message: "a silence window without authored:true and a reason was ignored: dramatic silence is never automatic" }); continue; }
    if (num(w.end_s) > num(w.start_s)) reductions.push({ reason: "authored_silence", start_s: r3(num(w.start_s)), end_s: r3(num(w.end_s)), depth_db: agg.max_total_db, source_id: T(w.id) || "authored-silence", note: T(w.reason), attack_s: 0.2, hold_s: 0, release_s: 0.6 });
  }
  const A = aggregateReductions(reductions, agg);
  for (const f of A.flags) flags.push(f);
  const lanePoints = A.points.length > 1 || A.points[0][1] !== 0 ? A.points : [];
  // headroom note for the summed mix is a flag, not a claim: the plan cannot measure
  const sfxBase = 0;
  const plan = {
    version: MIX_BUS_VERSION, units: "dB", mix_policy_revision: rev,
    buses: {
      voice: { id_prefix: ROLE_IDS.voice.prefix, group: ROLE_IDS.voice.group, base_db: 0, sources: voiceSpans.map((s) => T(s.id)) },
      music: { id: ROLE_IDS.music.id, group: ROLE_IDS.music.group, base_db: r2(musicBase), source: T(M.source) || T(M.id) || null, section: T(M.section) || null, stem: stemIdentity(stems, "music") },
      sfx: { id_prefix: ROLE_IDS.sfx.prefix, group: ROLE_IDS.sfx.group, base_db: sfxBase },
      ambience: { id_prefix: ROLE_IDS.ambience.prefix, group: ROLE_IDS.ambience.group, base_db: -18 },
    },
    cues: arr(cues).map((c, i) => ({ id: T(c && c.id) || `sfx-${i}`, n: i, start_s: num(c && c.start_s, 0), duration_s: num(c && c.duration_s), gain_db: num(c && c.gain_db, c && num(c.volume) > 0 ? linearToDb(num(c.volume)) : 0), role: ROLE_IDS.sfx.role })),
    reductions: A.applied.map((r) => ({ reason: r.reason, start_s: r.start_s, end_s: r.end_s, depth_db: r.depth_db, source_id: r.source_id })),
    music_automation: lanePoints,
    aggregate: { policy: "bounded-max", max_total_db: agg.max_total_db, attack_s: agg.attack_s, hold_s: agg.hold_s, release_s: agg.release_s },
    ordinary_sfx_duck: false,
    profile: profile ? (T(profile.id || profile) || null) : null,
    film_s: film_s == null ? null : num(film_s),
    flags,
  };
  plan.digest = busPlanDigest(plan);
  return plan;
}
const STEM_PART_KEYS = ["percussion", "bass", "harmony", "texture"]; // = music-arrangement STEM_PARTS (not imported: that lib imports nothing from here and this one stays dependency-light)
function stemIdentity(stems, name) {
  const s = isObj(stems) ? stems[name] : null;
  if (!s) {
    // a multi-part stem set (music-arrangement stemBuses) names each genuine part under its own key and has no single `music` entry: read the per-part keys
    const parts = name === "music" && isObj(stems) ? STEM_PART_KEYS.filter((k) => stems[k]) : [];
    if (!parts.length) return null;
    const ids = Object.fromEntries(parts.map((k) => [k, one(stems[k])]));
    const all = parts.every((k) => ids[k].genuine_stem === true);
    return { file: null, kind: all ? "stem" : "stereo_file", genuine_stem: all, parts: ids }; // genuine only when EVERY named part is a real stem: a stereo file never passes as one
  }
  return one(s);
}
const one = (s) => (isObj(s) ? { file: s.file || null, kind: s.kind || (s.genuine_stem === true ? "stem" : "stereo_file"), genuine_stem: s.genuine_stem === true } : { file: T(s), kind: "unknown", genuine_stem: false });
// digest of what a renderer would be told (flags and the digest itself excluded so a flag wording change never marks a mix stale)
export const busPlanDigest = (plan) => canonicalDigest({ v: plan.version, units: plan.units, rev: plan.mix_policy_revision ?? null, buses: plan.buses, cues: plan.cues, reductions: plan.reductions, lane: plan.music_automation, aggregate: plan.aggregate, duck: plan.ordinary_sfx_duck });

// ---- renderer boundary -------------------------------------------------------------------------------------------------------------------------
// The one place dB becomes a renderer unit. Returns declarative specs; ENG-INT-2 stamps them into HTML / ffmpeg args.
//  hyperframes / ffmpeg-reel: data-volume is LINEAR 0..1+; a lane (data-automation, volume target, v linear, t from the clip start) REPLACES the static level:
//    data-volume is 1 whenever a lane is present and the lane carries the absolute linear value, so data-volume x lane never compounds.
//  ffmpeg-quick: per-input `volume=<dB>dB` (static) and `volume='<expr>':eval=frame` for the lane (expr = pow(10, dB/20)); amix normalize=0 with explicit gain; dropout_transition=0.
export function renderBoundary(plan, route = "hyperframes", { renderer = {}, voice_ids = null } = {}) {
  const R = ["hyperframes", "ffmpeg-quick", "ffmpeg-reel"].includes(route) ? route : "hyperframes";
  const bed = plan.buses.music, lane = arr(plan.music_automation), hasLane = lane.length > 1;
  const voiceIds = arr(voice_ids || plan.buses.voice.sources);
  const absLin = (t) => { const v = lane.length ? interp(lane, t) : 0; return r3(dbToLinear(bed.base_db + v)); };
  const elements = [];
  // bed
  const bedEl = { id: bed.id, role: "music", audio_group: bed.group, track_role: "bed", continuous_source: true };
  if (R === "ffmpeg-quick") {
    bedEl.volume_db = bed.base_db;
    if (hasLane) bedEl.volume_expr = laneExpr(lane, bed.base_db);
  } else {
    bedEl["data-volume"] = hasLane ? 1 : r3(dbToLinear(bed.base_db));
    if (hasLane) bedEl["data-automation"] = { version: 1, lanes: [{ target: "volume", points: dedupLane(lane.map(([t, v]) => ({ t: r3(t), v: absLin(t) }))) }] };
  }
  // carve: explicitly disabled in every case (the gain lane, if any, is the only music reduction); voice sources are recorded for reading back
  bedEl["data-fx-carve"] = { enabled: false };
  bedEl.carve = { enabled: false, voice_sources: voiceIds, why: voiceIds.length ? "the bus plan's gain lane carries the speech space; a second carve would reduce twice" : "no voice on this bed" };
  elements.push(bedEl);
  // voices
  for (const id of voiceIds) elements.push({ id, role: "voice", audio_group: ROLE_IDS.voice.group, "data-volume": 1 });
  // sfx: role-bearing id per cue, own linear level, no lane, no carve, never a speech source
  for (const c of plan.cues) {
    const e = { id: /^sfx-/.test(c.id) ? c.id : `sfx-${c.n}`, cue_id: c.id, role: "sfx", audio_group: ROLE_IDS.sfx.group, speech_source: false };
    if (R === "ffmpeg-quick") e.volume_db = r2(c.gain_db); else e["data-volume"] = r3(dbToLinear(c.gain_db));
    elements.push(e);
  }
  const mixer = R === "ffmpeg-quick"
    ? { branch: "ffmpeg amix", args: "amix=inputs=N:normalize=0:duration=longest:dropout_transition=0", gain: "explicit per-input volume; headroom before summing is a flag, not a claim", assumed: "the user's ffmpeg honours normalize=0 and dropout_transition=0; the version string is recorded in the receipt" }
    : { branch: "hyperframes engine mixAudioTracksFlat", gain: "engine sums elements; lane values multiply data-volume (hence data-volume 1 with a lane)", assumed: "records its dependence on the engine's amix branch (normalize / padded constant-N); the repo does not control it and does not claim to" };
  return {
    route: R, units_in: "dB", units_out: R === "ffmpeg-quick" ? "dB per input (volume=)" : "linear (data-volume, lane v)",
    plan_digest: plan.digest, elements, mixer,
    renderer: { renderer: T(renderer.renderer) || null, version: T(renderer.version) || null },
    preserves: { continuous_source_playhead: true, tails: true, note: "a reduction is a gain lane on the running bed: no trim, restart or re-instantiation" },
    final: "loudness / true peak follow the destination profile with measured evidence; conformance is not a balance claim",
  };
}
function interp(lane, t) {
  if (t <= lane[0][0]) return lane[0][1];
  for (let i = 1; i < lane.length; i++) if (t <= lane[i][0]) { const [a, va] = lane[i - 1], [b, vb] = lane[i]; return va + (vb - va) * ((t - a) / ((b - a) || 1)); }
  return lane[lane.length - 1][1];
}
const dedupLane = (pts) => pts.filter((p, i) => i === 0 || p.t > pts[i - 1].t);
// piecewise-linear in dB over time: ffmpeg `volume` expression (dB eval=frame), nested if(lt(t,...))
function laneExpr(lane, baseDb) {
  let e = String(r2(baseDb + lane[lane.length - 1][1]));
  for (let i = lane.length - 1; i >= 1; i--) {
    const [a, va] = lane[i - 1], [b, vb] = lane[i];
    e = `if(lt(t,${r3(b)}),${r2(baseDb + va)}+(${r2(vb - va)})*(t-${r3(a)})/${r3((b - a) || 1)},${e})`;
  }
  // the expression yields dB; ffmpeg's volume expression is read as linear amplitude, so the dB value is converted inside it (still the one boundary)
  return `pow(10,(if(lt(t,${r3(lane[0][0])}),${r2(baseDb + lane[0][1])},${e}))/20)`;
}

// ---- route I/O (the only impure part: named consumers are S/video.mjs audio-lock, S/reel.mjs, S/handoff.mjs, S/sound.mjs fit, L/quick-film.mjs) -------------------
// mix_policy_revision of a run (audio/direction.json), 1 when absent: a revision-1 or legacy run keeps every route's old numbers.
export function mixRevisionOf(run) {
  try { const d = JSON.parse(fs.readFileSync(path.join(String(run), "audio", "direction.json"), "utf8")); return Number(d && d.mix_policy_revision) >= 2 ? 2 : 1; } catch { return 1; }
}
// audio/automation.json = automationRecord(busPlan(...)), the single path mix-receipt currentInputs reads. Atomic write; never throws (a route's audio stays usable).
export function writeBusPlan(run, plan) {
  try {
    const f = automationPath(run);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    const tmp = `${f}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, JSON.stringify(automationRecord(plan), null, 2) + "\n");
    fs.renameSync(tmp, f);
    return { ok: true, file: path.relative(String(run), f), plan_digest: plan.digest };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
}

const rj = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
// The one way a route builds its plan from a run's own records (direction.sound.resolved, contract voice spans, motion/cues.json, audio/arrangement.json stems), so every route
// asks busPlan the same question. o: {music:{base_db|volume,...}, voice_spans (override), cues (override), film_s, silence_windows}. Revision 2 only: callers gate on mixRevisionOf(run).
export function busPlanForRun(run, o = {}) {
  const R = String(run);
  const dir = rj(path.join(R, "audio", "direction.json")), con = rj(path.join(R, "audio", "contract.json")), doc = rj(path.join(R, "motion", "cues.json")), arrg = rj(path.join(R, "audio", "arrangement.json"));
  const spans = o.voice_spans || arr(con && con.vo).filter((v) => num(v.end_s) > num(v.start_s)).map((v) => ({ id: T(v.segment_id) || T(v.shot_id), start_s: num(v.start_s), end_s: num(v.end_s) }));
  const cues = o.cues || arr(doc && doc.cues).filter((c) => c && c.resolved !== false && c.timing).map((c) => {
    const prominent = c.intensity === "prominent" || ["impact", "stinger", "riser"].includes(c.role);
    return { id: c.id, start_s: num(c.timing.sfx_onset_s, 0), duration_s: num(c.duration_s), gain_db: c.gain && num(c.gain.db) != null ? num(c.gain.db) : 0, prominent, ...(prominent && isObj(c.music_reduction) && c.music_reduction.reason ? { reduce_music: { depth_db: c.music_reduction.depth_db, reason: c.music_reduction.reason } } : {}) };
  });
  return busPlan({ direction: dir, sound_resolved: dir && dir.sound || null, cues, voice_spans: spans, music: isObj(o.music) && (o.music.base_db != null || o.music.volume != null) ? o.music : { ...(o.music || {}), ...(spans.length ? {} : { base_db: 0 }) }, stems: o.stems || stemBuses(arrg) || {}, silence_windows: o.silence_windows || [], film_s: o.film_s ?? (dir && dir.film_s) ?? null, mix_policy_revision: mixRevisionOf(R) >= 2 ? 2 : null });
}
