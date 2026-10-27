// Music arrangement across the film (Addendum 2, section 6). PURE: no I/O, no audio tool, no model, nothing rendered. implemented_unvalidated.
// It sits ON TOP of lib/music-fit.mjs (labelEstimates, editBoundaries, fitGuard), lib/music-lib.mjs (ENDINGS), lib/mix-bus.mjs (units) and the
// sound-choices energy triple. Time is the film score's seconds (basis "score"); musical markers are ANNOTATIONS on that score, never a clock.
//
//   placeSections(A, plan, film_s)        analysed sections (SOURCE time) mapped through the fit plan's segments into FILM time; nothing invented
//   resolveEnding(o)                      an intentional ending or a valid resolved edit; explicit abrupt endings and silence stay valid
//   planArrangement(o)                    optional analytical roles + (stems verified only) per-part dB lanes, or (stereo) sections/edits/crossfades only
//   annotateAccents(accents, o)           where selected accents/cuts sit against real markers: a report; nothing is moved, protected reads are never crushed
//   stemBuses(arrangement)                the genuine stems as bus inputs (the shape mix-bus busPlan({stems}) takes), [] / null for a stereo file
//   arrangementImpact(before, after)      music swap -> re-evaluate the edit; gain-only change -> no rebuild
//   proceduralHooks(arrangement)          the additive hooks procedural-score.buildPlan({arrangement}) honours
//
// Rules (references/music-arrangement.md): a stem is a real input, never inferred; a stereo file never gets per-instrument control; a null tempo stays null.
import { canonicalDigest, SCHEMA_VERSION } from "./contracts.mjs";
import { labelEstimates, editBoundaries } from "./music-fit.mjs";
import { ENDINGS } from "./music-lib.mjs";

export const ARRANGEMENT_VERSION = 1;
export const ROLES = Object.freeze(["establishment", "development", "emphasis", "resolution"]); // optional analytical labels, not a required four-part form
export const STEM_PARTS = Object.freeze(["percussion", "bass", "harmony", "texture"]);
export const ENDING_KINDS = Object.freeze([...ENDINGS, "resolved_cadence", "crossfade"]);
const ABRUPT = new Set(["cut", "stop", "none"]);

const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);
const T = (x) => (typeof x === "string" ? x.trim() : x == null ? "" : String(x).trim());
const num = (x, d = null) => (x !== null && x !== "" && x !== undefined && Number.isFinite(Number(x)) ? Number(x) : d);
const r3 = (x) => (x == null ? x : Math.round(x * 1000) / 1000);
const r2 = (x) => (x == null ? x : Math.round(x * 100) / 100);

// ---- sections in film time -----------------------------------------------------------------------------------------------------------------
// A: analyzeTrack output (sections[{t0,t1,label,tier,db}]) or catalog sections. plan: sound.mjs fit plan { segments:[{src_in,src_out,film_start,film_end}] };
// without a plan the track is assumed to play whole from film 0 (identity). Sections cut by a segment edge are clipped, never extended.
export function placeSections(A, plan = null, film_s = null) {
  const secs = arr(A && A.sections).map((s) => ({ t0: num(s.t0 ?? s.start), t1: num(s.t1 ?? s.end), label: T(s.label) || null, tier: T(s.tier) || null, db: num(s.db), energy: num(s.energy) })).filter((s) => s.t0 != null && s.t1 != null && s.t1 > s.t0);
  const segs = arr(plan && plan.segments).map((g) => ({ si: num(g.src_in, 0), so: num(g.src_out), fs: num(g.film_start, 0), fe: num(g.film_end) })).filter((g) => g.so != null && g.fe != null);
  const out = [];
  for (const s of secs) {
    if (!segs.length) { out.push({ ...s, src_t0: s.t0, src_t1: s.t1 }); continue; }
    for (const g of segs) {
      const a = Math.max(s.t0, g.si), b = Math.min(s.t1, g.so);
      if (b - a <= 0.05) continue;
      out.push({ ...s, t0: r3(g.fs + (a - g.si)), t1: r3(g.fs + (b - g.si)), src_t0: a, src_t1: b });
    }
  }
  out.sort((a, b) => a.t0 - b.t0);
  const F = num(film_s);
  return F == null ? out : out.filter((s) => s.t0 < F).map((s) => ({ ...s, t1: Math.min(s.t1, F) }));
}

// ---- endings ---------------------------------------------------------------------------------------------------------------------------------
// o: { choice? (one of ENDING_KINDS), film_s, A, labels?, plan?, track_ending? (catalog ending), origin: "procedural"|"stereo", music_led, sections? (film time),
//      silence_by_choice?, fade_s? }
// -> { kind, source, valid, chosen, at_s, crossfade_s?, fade_s?, uncertain, warnings[], why }
// Order: an explicit choice (abrupt and silence included) > the track's own natural ending when its end plays out > a resolved edit into the track's last
// section (crossfade, no fade-out) > a procedural cadence > a fade only as the declared last resort.
export function resolveEnding(o = {}) {
  const A = isObj(o.A) ? o.A : {};
  const labels = o.labels || labelEstimates(A);
  const film = num(o.film_s);
  const warnings = [];
  const choice = T(o.choice).toLowerCase();
  if (o.silence_by_choice) return { kind: "none", source: "explicit", valid: true, chosen: true, at_s: film, uncertain: false, warnings, why: `silence by choice: ${T(o.silence_by_choice) || "no reason given"}` };
  if (choice) {
    if (!ENDING_KINDS.includes(choice)) return { kind: "unknown", source: "explicit", valid: false, chosen: true, at_s: film, uncertain: true, warnings: [`"${choice}" is not one of ${ENDING_KINDS.join(", ")}`], why: "unrecognised ending choice: nothing is imposed" };
    const abrupt = ABRUPT.has(choice);
    return { kind: choice, source: "explicit", valid: true, chosen: true, at_s: film, ...(choice === "fade" ? { fade_s: r2(num(o.fade_s, 1.5)) } : {}), ...(choice === "crossfade" ? { crossfade_s: r2(num(o.crossfade_s, 0.75)) } : {}), uncertain: !labels.grid_usable && choice === "crossfade", warnings, why: abrupt ? "an explicitly chosen abrupt ending or silence is valid, not a defect" : `the chosen ${choice} ending` };
  }
  if (o.origin === "procedural") return { kind: "resolved_cadence", source: "procedural_cadence", valid: true, chosen: false, at_s: film, uncertain: false, warnings, why: "the procedural score closes on its own cadence on the end cue (procedural-score ending), then rings out" };
  const secs = arr(o.sections);
  const segs = arr(o.plan && o.plan.segments);
  const lastSeg = segs.length ? segs[segs.length - 1] : null;
  const material = num(A.duration, num(o.plan && o.plan.track_duration));
  const playsToEnd = !lastSeg ? (material == null || film == null || Math.abs(material - film) <= 1.5) : material != null && num(lastSeg.src_out, 0) >= material - 0.75;
  const natural = (A.ending && A.ending.natural === true) || ["ring-out", "decay", "stop"].includes(T(o.track_ending));
  if (playsToEnd && natural) {
    const type = T(A.ending && A.ending.type) || T(o.track_ending) || "ring-out";
    return { kind: ENDINGS.includes(type) ? type : "ring-out", source: "track_natural", valid: true, chosen: false, at_s: film, uncertain: labels.tempo.status !== "detected", warnings, why: "the track's own ending plays out under the film's last moment; no fade is laid over it" };
  }
  // an edit that ends before the track does: resolve by crossfading into the track's final section (when one is analysed), at a section start (never a guessed bar)
  const closing = [...secs].reverse().find((s) => (s.label === "outro" || s.tier === "low" || s === secs[secs.length - 1]) && s.t1 - s.t0 >= 2);
  if (closing && lastSeg && !playsToEnd) {
    warnings.push("the closing section is an analysed estimate: listen to the join before approving");
    return { kind: "crossfade", source: "edit_to_ending_section", valid: true, chosen: false, at_s: r3(closing.t0), crossfade_s: r2(num(o.crossfade_s, labels.grid_usable ? 0.75 : 1.0)), target_section: { t0: closing.t0, t1: closing.t1, label: closing.label }, uncertain: true, warnings, why: `the edit lands on the start of the track's closing section (${closing.label || "last section"}) with a short crossfade, instead of an abrupt cut or a laid-over fade` };
  }
  warnings.push("no natural ending and no analysed closing section: a fade is the last resort, not a style choice; keep the track whole or pick another passage if the ending matters");
  return { kind: "fade", source: "fallback_fade", valid: true, chosen: false, at_s: film, fade_s: r2(num(o.fade_s, 1.5)), uncertain: true, warnings, why: "a fade is declared as the fallback because nothing better is verifiable for this track" };
}

// ---- the arrangement -------------------------------------------------------------------------------------------------------------------------
// o: {
//   film_s, A (analyzeTrack output or null), plan (fit plan, optional), sections (film-time sections, optional: else placeSections(A, plan)),
//   sound_resolved (resolveSound().resolved or its .resolved: music_role, energy{perceived, development}), music_role?, development? ("steady"|"gentle_rise"|"playful_phrases"|"punctuated"|"build"),
//   stems: { verified:boolean, files:{percussion?, bass?, harmony?, texture?} (real files) }  // verified must be true AND files present; never inferred
//   origin: "stereo"|"procedural"|"stems", music_led, trim_authorized, scene_boundaries:[t], accents:[{id,t,kind?,protected?:[{start_s,end_s}]}], protected_reads:[{start_s,end_s}],
//   ending: { choice?, silence_by_choice?, fade_s?, crossfade_s? }, track_ending, track_id, silence_windows:[{start_s,end_s,authored,reason}]
// }
export function planArrangement(o = {}) {
  const A = isObj(o.A) ? o.A : null;
  const film = num(o.film_s);
  const flags = [];
  const labels = A ? labelEstimates(A) : null;
  const resolved = isObj(o.sound_resolved) && isObj(o.sound_resolved.resolved) ? o.sound_resolved.resolved : isObj(o.sound_resolved) ? o.sound_resolved : {};
  const role = T(o.music_role) || T(resolved.music_role) || null;
  const development = T(o.development) || T(resolved.energy && resolved.energy.development) || "steady";
  const perceived = T(resolved.energy && resolved.energy.perceived) || null;
  const origin = o.origin || (o.stems && o.stems.verified === true ? "stems" : "stereo");

  if (role === "none") return finish({ mode: "none", flags: [{ check: "music-none", message: "the direction has no music: nothing to arrange" }], film, labels, development, role, perceived, origin: "none", roles: [], edits: { allowed: [], boundaries: null }, annotations: [], ending: null, stems: null, track_id: null, o });

  const sections = arr(o.sections).length ? arr(o.sections).map((s) => ({ ...s, t0: num(s.t0), t1: num(s.t1) })) : placeSections(A, o.plan, film);
  const bounds = A && labels ? editBoundaries(A, labels) : { basis: "none", uncertain: true, bars: [], sections: [], note: "no analysis: edit by ear or keep the track whole" };
  if (!labels && origin !== "procedural") flags.push({ check: "no-analysis", message: "no analysis was supplied: sections, tempo and edit boundaries are all unknown and none is invented" });
  if (labels && labels.tempo.status !== "detected") flags.push({ check: `tempo-${labels.tempo.status}`, message: labels.note || `tempo ${labels.tempo.status}: ${labels.tempo.reasons.join("; ") || "bar lines are an estimate"}` });

  // roles: optional, analytical, from the analysed energy of the placed sections (or the supplied energy); never a required four-part shape
  const energyOf = (s) => (s.energy != null ? s.energy : s.db != null ? s.db : s.tier === "peak" ? 3 : s.tier === "low" ? 0 : s.tier ? 1.5 : null);
  const known = sections.filter((s) => energyOf(s) != null);
  const spread = known.length >= 2 ? Math.max(...known.map(energyOf)) - Math.min(...known.map(energyOf)) : 0;
  const roles = [];
  if (sections.length >= 2) {
    const top = known.length >= 2 && spread >= 2 ? known.reduce((a, b) => (energyOf(b) > energyOf(a) ? b : a)) : null;
    sections.forEach((s, i) => {
      let r = i === 0 ? "establishment" : i === sections.length - 1 && sections.length > 2 ? "resolution" : "development";
      if (top && s === top && i > 0) r = "emphasis";
      roles.push({ id: `arr-${i + 1}`, role: r, start_s: r3(s.t0), end_s: r3(s.t1), section_ref: { label: s.label || null, tier: s.tier || null, src_t0: s.src_t0 ?? null, src_t1: s.src_t1 ?? null }, basis: "score", estimated: true, derived_from: energyOf(s) != null ? "section_energy" : "section_order" });
    });
  } else if (sections.length === 1) flags.push({ check: "single-passage", message: "one continuous analysed passage: no arrangement roles are assigned (roles are optional)" });

  // stems: only when verified AND real files are named for the part. A stereo file never gets per-part control.
  const stemFiles = isObj(o.stems && o.stems.files) ? o.stems.files : {};
  const verified = !!(o.stems && o.stems.verified === true) && STEM_PARTS.some((p) => T(stemFiles[p]));
  if (o.stems && o.stems.verified !== true && (o.stems.available === true || Object.keys(stemFiles).length)) flags.push({ check: "stems-unverified", message: "stems are claimed but not verified: they are not used; the stereo file is arranged by sections and edits only" });
  let stems = null;
  if (verified && role !== "none") {
    const parts = STEM_PARTS.filter((p) => T(stemFiles[p]));
    const lanes = {};
    for (const p of parts) lanes[p] = stemLane(p, roles, development, role, film);
    stems = { genuine: true, parts: Object.fromEntries(parts.map((p) => [p, { file: T(stemFiles[p]), genuine_stem: true, kind: "stem", automation: lanes[p] }])), units: "dB", missing: STEM_PARTS.filter((p) => !parts.includes(p)), note: "dB offsets from each stem's own level, to be carried as bus gains; parts without a verified file are not controlled" };
  }
  const mode = role === "none" ? "none" : stems ? "stems" : origin === "procedural" ? "procedural" : "stereo";

  // edits: what is permitted for THIS material (never more than editBoundaries offers)
  const allowed = [];
  if (mode === "stereo") {
    if (bounds.basis === "bars" || bounds.basis === "bars_uncertain") allowed.push({ kind: "section_choice", note: "pick a passage by analysed section" }, { kind: "bar_edit", uncertain: bounds.uncertain, note: "edits on the analysed bar grid" }, { kind: "crossfade", note: "short crossfade at a bar or section start" });
    else if (bounds.basis === "sections_only") allowed.push({ kind: "section_choice", note: "section starts are estimates" }, { kind: "crossfade", uncertain: true, note: "crossfade at an analysed section start only" });
    else allowed.push({ kind: "keep_whole", note: "no structure found: keep the track whole or edit by ear" });
  } else if (mode === "stems") allowed.push({ kind: "stem_gain", note: "entry/withdrawal of verified parts as bus gains" }, { kind: "crossfade", uncertain: !(labels && labels.grid_usable) });
  else if (mode === "procedural") allowed.push({ kind: "procedural_energy", note: "section energy and ending through procedural-score hooks" });
  if (o.music_led && !o.trim_authorized) { allowed.length = 0; allowed.push({ kind: "keep_whole", note: "a music-led film keeps its track whole unless the user authorized an edit (fitGuard)" }); }

  const ending = resolveEnding({ ...(isObj(o.ending) ? o.ending : {}), film_s: film, A: A || {}, labels: labels || labelEstimates({}), plan: o.plan, track_ending: o.track_ending, origin: mode === "procedural" ? "procedural" : "stereo", sections });
  for (const w of ending.warnings) flags.push({ check: "ending", message: w });

  // scene boundaries: the music stays one continuous identity across them; a boundary may never RESTART the music
  const sceneB = arr(o.scene_boundaries).map(num).filter((t) => t != null);
  const continuity = { across_scene_boundaries: true, scene_boundaries: sceneB.length, restart_at_boundary: false, note: "music identity is carried across every visual scene boundary; an edit or role change that coincides with one is a choice, not a default" };
  const annotations = annotateAccents(arr(o.accents), { A: A || {}, labels, protected_reads: o.protected_reads, sections });
  return finish({ mode, flags, film, labels, development, role, perceived, origin, roles, edits: { allowed, boundaries: { basis: bounds.basis, uncertain: bounds.uncertain, sections: arr(bounds.sections).length, bars: arr(bounds.bars).length } }, annotations, ending, stems, track_id: T(o.track_id) || null, continuity, o });
}

// the lane for one verified part, dB offsets over film time [[t, db]]. Parts enter/withdraw with the roles; development shapes the amount. Empty roles -> flat (no lane).
function stemLane(part, roles, development, musicRole, film) {
  if (!roles.length) return [];
  const OFF = -24; // "withdrawn" is a gain offset, not silence unless the direction says so
  const level = (r) => {
    const R = r.role;
    const calm = development === "steady";
    if (part === "harmony" || part === "texture") return R === "emphasis" ? 0 : calm || R !== "resolution" ? 0 : -3;
    if (part === "bass") return R === "establishment" ? (calm ? -3 : OFF) : R === "development" ? (development === "build" ? -3 : -1.5) : R === "emphasis" ? 0 : -6;
    // percussion: enters later, leaves for the resolution; a sparse bed brings it in less
    if (musicRole === "sparse" || development === "steady") return R === "emphasis" ? -6 : OFF;
    return R === "establishment" ? OFF : R === "development" ? (development === "build" || development === "punctuated" ? -6 : -3) : R === "emphasis" ? 0 : -12;
  };
  const pts = [];
  for (const r of roles) {
    const v = level(r);
    const last = pts[pts.length - 1];
    if (last && last[1] === v) continue;
    // entries/exits are short ramps starting at the role boundary (a ramp never starts before the section it belongs to)
    if (last) pts.push([r3(Math.max(last[0], r.start_s - 0.001)), last[1]]);
    pts.push([r3(r.start_s), v]);
  }
  if (num(film) != null && pts.length && pts[pts.length - 1][0] < film) pts.push([r3(film), pts[pts.length - 1][1]]);
  return pts.length > 1 || (pts[0] && pts[0][1] !== 0) ? pts : [];
}

function finish(x) {
  const rec = {
    version: ARRANGEMENT_VERSION, schema_version: SCHEMA_VERSION, status: "implemented_unvalidated", basis: "score",
    mode: x.mode, origin: x.origin, track_id: x.track_id, music_role: x.role, development: x.development, perceived_energy: x.perceived,
    tempo: x.labels ? { status: x.labels.tempo.status, bpm: x.labels.tempo.bpm, grid_usable: x.labels.grid_usable } : { status: "undetected", bpm: null, grid_usable: false },
    roles: x.roles, edits: x.edits, ending: x.ending, annotations: x.annotations,
    stems: x.stems, continuity: x.continuity || null, flags: x.flags,
  };
  rec.procedural = x.mode === "procedural" ? proceduralHooks(rec) : null;
  rec.digest = canonicalDigest({ v: rec.version, mode: rec.mode, track: rec.track_id, roles: rec.roles.map((r) => [r.role, r.start_s, r.end_s]), edits: rec.edits.allowed.map((e) => e.kind), end: rec.ending && [rec.ending.kind, rec.ending.at_s, rec.ending.crossfade_s ?? null], stems: rec.stems && Object.fromEntries(Object.entries(rec.stems.parts).map(([k, v]) => [k, v.file])) });
  rec.gain_digest = canonicalDigest({ lanes: rec.stems ? Object.fromEntries(Object.entries(rec.stems.parts).map(([k, v]) => [k, v.automation])) : null });
  return rec;
}

// ---- accents -----------------------------------------------------------------------------------------------------------------------------------
// accents: [{id, t, kind?, protected?: [{start_s,end_s}]}]. Each is compared with the nearest REAL marker: an analysed section start, or a bar when the grid is
// usable. The score's time is never changed: the row carries `offset_s` and `suggestion` (move the music edit, or leave the accent), and an accent inside a
// protected read or product proof window is reported as protected and never suggested to move. markers are annotations.
export function annotateAccents(accents, { A = {}, labels = null, protected_reads = [], sections = [], tol_s = 0.12 } = {}) {
  const lab = labels || labelEstimates(A);
  const markers = [];
  for (const s of arr(sections)) if (num(s.t0) != null) markers.push({ t: num(s.t0), kind: "section_start", label: s.label || null, uncertain: true });
  if (lab.grid_usable) for (const b of arr(A.bars)) if (num(b) != null) markers.push({ t: num(b), kind: "bar", uncertain: lab.tempo.status !== "detected" });
  const prot = arr(protected_reads).filter((p) => num(p && p.start_s) != null && num(p && p.end_s) != null);
  return arr(accents).map((a) => {
    const t = num(a && a.t);
    if (t == null) return { id: T(a && a.id) || null, t: null, marker: null, note: "accent has no time" };
    const mine = [...prot, ...arr(a.protected)].some((p) => t >= num(p.start_s) - 1e-6 && t <= num(p.end_s) + 1e-6);
    let best = null;
    for (const m of markers) { const d = Math.abs(m.t - t); if (!best || d < best.d) best = { ...m, d }; }
    const near = best && best.d <= tol_s;
    return {
      id: T(a.id) || null, t: r3(t), kind: T(a.kind) || null, basis: "score",
      marker: best ? { kind: best.kind, t: r3(best.t), label: best.label || null, uncertain: best.uncertain } : null,
      offset_s: best ? r3(best.t - t) : null, on_marker: !!near,
      protected: mine,
      suggestion: !best ? "no analysed marker: place by ear" : near ? "already on a marker" : mine ? "inside a protected read: the accent stays; shift the music edit instead, or leave it" : best.d <= 0.5 ? "optional: nudge the music edit (not the picture) onto this marker" : "far from any marker: leave it",
      moves_score: false,
      tempo_status: lab.tempo.status,
    };
  });
}

// ---- stems as bus inputs -------------------------------------------------------------------------------------------------------------------------
// The shape mix-bus busPlan({stems}) reads is `{ music: {file, genuine_stem, kind} }`; each genuine part is also exposed under its own name so a caller that
// models separate music buses can use it. Returns null for a stereo file (never fabricated).
export function stemBuses(arrangement) {
  const s = arrangement && arrangement.stems;
  if (!s || s.genuine !== true) return null;
  const out = {};
  for (const [k, v] of Object.entries(s.parts)) out[k] = { file: v.file, kind: "stem", genuine_stem: true, automation_db: v.automation };
  return out;
}

// ---- what a change costs ---------------------------------------------------------------------------------------------------------------------------
// before/after: planArrangement outputs (or null). A different track, sections, edits or stem set -> the edit must be re-evaluated; the same arrangement with
// different dB lanes only -> gain only (no visual rebuild, no re-edit).
export function arrangementImpact(before, after) {
  if (!before || !after) return { edit_reevaluation: !!after, gain_only: false, why: before ? "arrangement removed" : "first arrangement" };
  const ident = (a) => canonicalDigest({ t: a.track_id, m: a.mode, r: a.roles.map((r) => [r.start_s, r.end_s]), e: a.ending && [a.ending.kind, a.ending.at_s], s: a.stems && Object.fromEntries(Object.entries(a.stems.parts).map(([k, v]) => [k, v.file])) });
  const same = ident(before) === ident(after);
  return { edit_reevaluation: !same, gain_only: same && before.gain_digest !== after.gain_digest, unchanged: same && before.gain_digest === after.gain_digest, rebuild_visuals: false, why: same ? "same track, sections, edits and stems: at most a gain lane changed" : "the track, its sections, its edit or its stem set changed: re-evaluate the music edit (fitGuard) and its timing impact (trackChangeImpact)" };
}

// ---- procedural hooks ----------------------------------------------------------------------------------------------------------------------------
// -> the additive input procedural-score.buildPlan({arrangement}) understands; null when the arrangement says nothing procedural can honour.
export function proceduralHooks(arrangement) {
  if (!arrangement) return null;
  const e = arrangement.ending;
  const section_energy = {};
  const byRole = { establishment: 0.45, development: 0.65, emphasis: 0.85, resolution: 0.5 };
  const names = ["intro", "peak", "resolve"];
  const rs = arr(arrangement.roles);
  if (rs.length === 3) rs.forEach((r, i) => { section_energy[names[i]] = byRole[r.role] ?? 0.6; });
  const scale = { low: 0.8, medium: 1, high: 1.15 }[arrangement.perceived_energy] ?? 1;
  const ending = e && ["ring-out", "decay", "stop", "cut", "resolved_cadence"].includes(e.kind) ? e.kind : null;
  if (!Object.keys(section_energy).length && scale === 1 && !ending) return null;
  return { version: ARRANGEMENT_VERSION, energy_scale: scale, ...(Object.keys(section_energy).length ? { section_energy } : {}), ...(ending ? { ending } : {}) };
}
