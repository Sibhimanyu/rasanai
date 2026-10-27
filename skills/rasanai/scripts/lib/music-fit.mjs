// Structural music fit, honestly labelled (Plan 07 A3). It sits ON TOP of lib/audio.mjs (analyzeTrack, fitTrack) and music.mjs; it does not
// re-analyse anything and runs no audio tool.
//
//   labelEstimates(A)               what the analysis KNOWS vs ESTIMATES: tempo detected | uncertain | undetected (bpm null: never a fabricated 120),
//                                   meter assumed, sections estimated; thresholds are heuristics, named below
//   editBoundaries(A, labels)       where an edit may land structurally (bars when the grid is trusted, section starts when it is not, else none)
//   fitGuard(plan, A, o)            a fit plan is refused when the track is too short (no endless loop), when a music-led film would be trimmed
//                                   without authorization, or when a loop was not declared
//   cutBeatReport(cuts, A, labels)  how cuts sit against the grid: a report, never a goal (cuts are not forced onto beats)
//   trackRecord(o) / proceduralRights(rec)   rights, edits, gain automation and version of the chosen track; procedural music is not copyright-free
//   trackChangeImpact(o)            swapping a track = a bounded timing impact (lib/impact.mjs), not a story regeneration
import { canonicalDigest, SCHEMA_VERSION } from "./contracts.mjs";
import { impact } from "./impact.mjs";

const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);
const T = (x) => (typeof x === "string" ? x.trim() : x == null ? "" : String(x).trim());
const num = (x, d = null) => (x !== null && x !== "" && x !== undefined && Number.isFinite(Number(x)) ? Number(x) : d);
const r3 = (x) => (x == null ? x : Math.round(x * 1000) / 1000);

// heuristic thresholds (uncalibrated; the values lib/audio.mjs already warns on): changing them is a decision, not a fix
export const THRESHOLDS = Object.freeze({ min_grid_coverage: 0.25, trusted_grid_coverage: 0.6, weak_downbeat: 0.15, plausible_bpm: [60, 180] });

export function labelEstimates(A) {
  const a = isObj(A) ? A : {};
  const bpm = num(a.bpm), cov = num(a.grid_coverage), dbc = num(a.downbeat_confidence);
  const undetected = bpm == null || bpm <= 0 || (cov != null && cov < THRESHOLDS.min_grid_coverage) || a.tempo_failed === true;
  const reasons = [];
  if (!undetected) {
    if (a.tempo_stable === false) reasons.push("the tempo drifts (tracked beats follow the playing)");
    if (a.tempo_folded) reasons.push("double/half time was folded: check by ear");
    if (cov != null && cov < THRESHOLDS.trusted_grid_coverage) reasons.push(`the grid covers ${Math.round(cov * 100)}% of the track`);
    if (dbc != null && dbc < THRESHOLDS.weak_downbeat) reasons.push("the downbeat is ambiguous (bar lines may sit on beat 3)");
    if (bpm < THRESHOLDS.plausible_bpm[0] || bpm > THRESHOLDS.plausible_bpm[1]) reasons.push(`${Math.round(bpm)} BPM is outside ${THRESHOLDS.plausible_bpm.join("-")}: treat as double or half time`);
  }
  const status = undetected ? "undetected" : reasons.length ? "uncertain" : "detected";
  return {
    schema_version: SCHEMA_VERSION,
    tempo: { status, bpm: undetected ? null : bpm, basis: undetected ? "beat detection did not find a usable grid; no tempo is stated" : a.grid || null, reasons, confidence: cov },
    meter: { status: "assumed", value: "4/4", note: "the analysis assumes 4/4; it does not detect meter" },
    downbeat: { status: undetected ? "undetected" : dbc != null && dbc < THRESHOLDS.weak_downbeat ? "uncertain" : "estimated", confidence: dbc, from: a.downbeat_from || null },
    sections: { status: arr(a.sections).length ? "estimated" : "none", count: arr(a.sections).length },
    ending: { natural: !!(a.ending && a.ending.natural), type: a.ending && a.ending.type || null },
    grid_usable: !undetected,
    // a label is not a verdict on the track: music with no detectable tempo (ambient, rubato) can still be right for the film
    note: undetected ? "tempo undetected: do not snap edits or cuts to a grid; place edits by phrase and by ear, or keep the track whole" : undefined,
  };
}

// Where a structural edit may land. A trusted grid -> bars; an uncertain grid -> bars flagged uncertain; no grid -> section starts only; nothing -> none.
export function editBoundaries(A, labels = labelEstimates(A)) {
  const sections = arr(A && A.sections).map((s) => ({ t: num(s.start ?? s.t), name: T(s.name) || null })).filter((s) => s.t != null);
  if (labels.grid_usable) return { basis: labels.tempo.status === "detected" ? "bars" : "bars_uncertain", uncertain: labels.tempo.status !== "detected", bars: arr(A.bars).map(r3), sections, phrase_bars: 4 };
  if (sections.length) return { basis: "sections_only", uncertain: true, bars: [], sections, note: "no usable bar grid: only the analysed section starts are offered, and those are estimates" };
  return { basis: "none", uncertain: true, bars: [], sections: [], note: "no structure found: edit by ear or keep the track whole" };
}

// plan: sound.mjs fit output. o: { music_led, trim_authorized, loop_declared, film_s, user_track }
export function fitGuard(plan, A, { music_led = false, trim_authorized = false, loop_declared = false, film_s = null, user_track = false } = {}) {
  const errors = [], warnings = [];
  const p = isObj(plan) ? plan : {};
  const material = num(p.track_duration, num(A && A.duration));
  const film = num(film_s, num(p.film_duration, num(p.film_target)));
  const segs = arr(p.segments);
  // an audible repeat = two segments whose source ranges overlap
  let repeats = 0;
  for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
    const a = [num(segs[i].src_in, 0), num(segs[i].src_out, Infinity)], b = [num(segs[j].src_in, 0), num(segs[j].src_out, Infinity)];
    if (a[0] < b[1] && b[0] < a[1]) repeats++;
  }
  if (p.repeat) repeats = Math.max(repeats, 1);
  if (p.needs_longer || (material != null && film != null && film > material + 4 && !loop_declared)) errors.push({ check: "track-too-short", message: `the track has ${material ?? "?"} s of music for a ${film ?? "?"} s film: pick a longer track or shorten the film; looping a short track under a longer film is not a fit`, suggest: arr(p.suggest) });
  if (repeats > 1 && !loop_declared) errors.push({ check: "endless-loop", message: `the plan repeats source music ${repeats} times: a short track is not looped to fill a film` });
  else if (repeats === 1 && !loop_declared) warnings.push({ check: "one-repeat", message: "one section repeats once to reach the film length: listen to the join; prefer a longer track" });
  if (music_led) {
    const trimmed = segs.length > 1 || (num(segs[0] && segs[0].src_in, 0) > 0.05) || (film != null && material != null && film < material - 1);
    if (trimmed && !trim_authorized) errors.push({ check: "music-led-trim", message: "this film is tied to its track: the plan trims or re-arranges it, and the user has not authorized an edit. Keep the track whole and fit the picture to it." });
  }
  if (user_track && !music_led && p.shape && p.shape !== "backtimed" && p.shape !== "fade") warnings.push({ check: "user-track-edited", message: `the user's own track gets a "${p.shape}" edit: say so in the sound note; their track is preferred, not rearranged silently` });
  return { ok: !errors.length, errors, warnings, repeats, material_s: material, film_s: film };
}

// cuts: [{t}] or [number]. Never moves a cut. Informational only (no minimum share is demanded).
export function cutBeatReport(cuts, A, labels = labelEstimates(A), { tol_s = 0.08 } = {}) {
  const ts = arr(cuts).map((c) => (isObj(c) ? num(c.t) : num(c))).filter((t) => t != null);
  if (!labels.grid_usable) return { forced: false, grid_basis: "none", cuts: ts.length, on_beat: null, note: "no usable grid: cuts are not compared with beats" };
  const beats = arr(A.beats).map(Number);
  const near = (t) => beats.length && Math.min(...beats.map((b) => Math.abs(b - t))) <= tol_s;
  const on = ts.filter(near).length;
  return { forced: false, grid_basis: labels.tempo.status, cuts: ts.length, on_beat: on, share: ts.length ? r3(on / ts.length) : null, tolerance_s: tol_s, note: "a report, not a target: a cut belongs where the picture needs it, and proof and readability are not crushed to a grid" };
}

// ---- the track record ------------------------------------------------------------------------------------------------------------------------
// o: { id, source: user|catalog|ai|procedural|library, file, file_digest, rights:{licence, attribution, declared_by, url, provenance[]}, edits[], gain_automation[[t,db]], version, analysis_digest, music_led }
// additive (omitted from the record, and from the digest, when not given): section {t0,t1,label,reason}, evidence_state (metadata_reviewed|auditioned|approved_in_finished_mix: carried
// as given by catalog-evidence evidenceFor, never raised here), rights_ref (the crew/rights.jsonl asset id), rights_by_use {sync_into_film,bundle_in_app,upload_to_provider,serve_preview}
// (catalog-evidence rightsByUse), stems {available, verified, files[]} (verified only when a real set was checked), shortlist_revision.
export function trackRecord(o = {}) {
  const rights = isObj(o.rights) ? o.rights : {};
  const rec = {
    schema_version: SCHEMA_VERSION,
    id: T(o.id) || null, source: T(o.source) || "unknown", file: T(o.file) || null, file_digest: T(o.file_digest) || null,
    music_led: !!o.music_led,
    rights: {
      licence: T(rights.licence) || null, attribution: T(rights.attribution) || null, url: T(rights.url) || null,
      declared_by: T(rights.declared_by) || (o.source === "user" ? "user" : null), // a user's own track: their declaration, recorded as theirs
      provenance: arr(rights.provenance).map(String),
    },
    edits: arr(o.edits).map((e) => ({ kind: T(e.kind) || "edit", at_s: num(e.at_s), src_in_s: num(e.src_in_s), src_out_s: num(e.src_out_s), authorized_by: T(e.authorized_by) || null, note: T(e.note) || undefined })),
    gain_automation: arr(o.gain_automation).filter((p) => Array.isArray(p) && p.length === 2).map(([t, d]) => [Number(t), Number(d)]),
    analysis_digest: T(o.analysis_digest) || null,
    version: Math.max(1, Math.floor(num(o.version, 1))),
  };
  rec.rights = { ...rec.rights, ...proceduralRights(rec) };
  const extra = selectionFields(o);
  Object.assign(rec, extra);
  rec.digest = canonicalDigest({ f: rec.file_digest || rec.file, e: rec.edits, g: rec.gain_automation, v: rec.version, ...(extra.section ? { s: extra.section } : {}) });
  return rec;
}
const STATES = ["metadata_reviewed", "auditioned", "approved_in_finished_mix"];
function selectionFields(o) {
  const out = {};
  if (isObj(o.section) && num(o.section.t0) != null && num(o.section.t1) != null) out.section = { t0: num(o.section.t0), t1: num(o.section.t1), label: T(o.section.label) || null, reason: T(o.section.reason) || null };
  if (o.evidence_state !== undefined) out.evidence_state = STATES.includes(o.evidence_state) ? o.evidence_state : "metadata_reviewed";
  if (T(o.rights_ref)) out.rights_ref = T(o.rights_ref);
  if (isObj(o.rights_by_use)) out.rights_by_use = Object.fromEntries(["sync_into_film", "bundle_in_app", "upload_to_provider", "serve_preview"].map((k) => [k, [true, false].includes(o.rights_by_use[k]) ? o.rights_by_use[k] : null]));
  if (isObj(o.stems)) out.stems = { available: o.stems.available === true, verified: o.stems.available === true && o.stems.verified === true, files: arr(o.stems.files).map(String) };
  if (o.shortlist_revision !== undefined && num(o.shortlist_revision) != null) out.shortlist_revision = Math.max(1, Math.floor(num(o.shortlist_revision)));
  return out;
}
// Procedural / generated music is not copyright-free by default: its samples, tools and terms still need provenance. -> { status, why }
export function proceduralRights(rec) {
  const procedural = ["procedural", "ai", "generated"].includes(rec.source);
  if (!procedural) return { status: rec.rights && (rec.rights.licence || rec.rights.declared_by) ? "declared" : "undeclared", why: rec.rights && rec.rights.licence ? `licence: ${rec.rights.licence}` : "no licence or declaration recorded" };
  const prov = arr(rec.rights && rec.rights.provenance);
  return prov.length
    ? { status: "provenance_recorded", why: `provenance: ${prov.slice(0, 4).join("; ")}; review the generator's terms and any samples before release`, copyright_free: false }
    : { status: "unreviewed", why: "procedural or generated music is not automatically copyright-free: record the tool, its terms and any samples used", copyright_free: false };
}

// ---- a track change is a bounded timing impact --------------------------------------------------------------------------------------------
// o: { before: trackRecord, after: trackRecord, shot_ids[], music_led, section_changes: [shot ids whose music section moved] }
export function trackChangeImpact({ before = null, after = null, shot_ids = [], music_led = false, section_changes = [] } = {}) {
  const ids = [...new Set([...arr(shot_ids), ...arr(section_changes)].map(String))];
  const imp = impact("storyboard", ids, { timing: true });
  const rights = !before || !after ? "n/a" : before.rights && after.rights && (before.rights.licence !== after.rights.licence || before.rights.status !== after.rights.status) ? "changed" : "same";
  return {
    kind: "track_change", from: before && before.id || null, to: after && after.id || null,
    impact: imp, story_regenerated: false, look_regenerated: false,
    needs_user_authorization: !!music_led,
    authorization_note: music_led ? "a music-led film is tied to its track: swapping it changes the film's schedule and needs the user's say-so" : null,
    rights_changed: rights, rights_review: rights === "changed" || (after && after.rights && ["unreviewed", "undeclared"].includes(after.rights.status)) ? "review the new track's rights before the final" : null,
    propose_in: "Storyboard (same surface): the affected shots get a proposed timing revision through commitTiming; nothing is silently retimed",
  };
}
