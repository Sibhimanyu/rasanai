// Music shortlisting (Addendum 2 section 2). Pure: it ranks candidate records it is handed, picks up to three that are genuinely different, and
// revises the shortlist from a request. It reads no audio, runs no tool, calls no provider and downloads nothing; the analysis it uses (labelEstimates
// of analyzeTrack output, stems.verified, catalog-evidence evidenceFor/rightsByUse) was produced elsewhere.
//
//   normalizeConstraints({hard, preferences})   HARD constraints (a candidate that breaks one is excluded) kept apart from RANKING preferences (a nudge)
//                                               and from tag-derived estimates (never a constraint; they only explain a score)
//   rankCandidates(candidates, o)               -> { ranked[{id, score, reasons[], evidence_state, rights, stems, sections[], bpm, ...}], excluded[{id, reason}] }
//   pickThree(ranked)                           -> { options (<=3, different family AND energy), note }: fewer is an honest result, never padded
//   reviseShortlist(prev, request)              Keep this track / More like this / Warmer / Less corporate / Less percussion / Calmer section (or the same in words)
//   candidateFromOption(option, catalogRow)     a music.mjs option (+ its catalog row) as a candidate
//   buildShortlistRecord(...) / previewPlan(...) the stored record and the (unrendered) loudness-matched excerpt plan
//
// Consumers: scripts/music.mjs (wired: --sound / audio/sound-choices.json, --constraints, --revise, writes music/shortlist.json); ENG-INT-2's soundplan
// may read music/shortlist.json. Evidence state is only what catalog-evidence can back with an entry for the exact file version: nothing here marks a
// track auditioned.
import { familyOf, rightsByUse, evidenceFor, evidenceRank, MUSIC_FAMILIES } from "./catalog-evidence.mjs";
import { labelEstimates } from "./music-fit.mjs";

const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);
const T = (x) => (typeof x === "string" ? x.trim() : x == null ? "" : String(x).trim());
const num = (x, d = null) => (x !== null && x !== "" && x !== undefined && Number.isFinite(Number(x)) ? Number(x) : d);
const r1 = (x) => Math.round(x * 10) / 10;
const lc = (x) => T(x).toLowerCase();
const list = (x) => (Array.isArray(x) ? x : typeof x === "string" ? x.split(/[,|;]/) : []).map(lc).filter(Boolean);

export const SHORTLIST_VERSION = 1;
export const ENERGY_BANDS = ["low", "medium", "high"];
// energy implied by a family when nothing better is known: an ESTIMATE, labelled as one in the reasons
const FAMILY_ENERGY = { spacious_ambient: "low", warm_acoustic: "low", restrained_electronic: "medium", playful_rhythmic: "medium", cinematic_development: "medium", bold_percussion: "high" };
// the feeling words -> families (a ranking preference, never a constraint)
const FEELING_FAMILIES = { calm: ["spacious_ambient", "warm_acoustic"], warm: ["warm_acoustic", "restrained_electronic"], playful: ["playful_rhythmic"], bold: ["bold_percussion", "restrained_electronic"], dramatic: ["cinematic_development", "bold_percussion"] };
// visual-style words -> families (mirrors music.mjs FAMILIES' match patterns, expressed in the six)
const STYLE_WORDS = [
  [/swiss|editorial|minimal|grid|clean|mono|bauhaus|type|dark|neon|terminal|code|developer/i, "restrained_electronic"],
  [/playful|flat|pastel|illustrat|cartoon|friendly|toy|bouncy|fun/i, "playful_rhythmic"],
  [/luxury|cinematic|premium|elegant|serif|noir|keynote|restrain/i, "cinematic_development"],
  [/brutal|grunge|zine|punk|raw|collage|xerox/i, "bold_percussion"],
  [/organic|wellness|nature|calm|warm|craft|hand|paper|earth/i, "warm_acoustic"],
  [/ambient|spacious|airy|air|soft/i, "spacious_ambient"],
];
const PERCUSSION = /\b(drums?|percussion|beat|breakbeat|kick|snare|hi-?hats?|claps?|tabla|cajon)\b/i;
const STOCK = /\b(corporate|business|presentation|inspirational|inspiring|uplifting|motivational|positive|happy|success|background music)\b/i;
const WARM_WORDS = /\b(warm|acoustic|organic|wooden|analog|soft|pads?|strings?|piano)\b/i;

// ---- constraints --------------------------------------------------------------------------------------------------------------------------
// raw: { hard: {exclude_terms[], exclude_instruments[], exclude_genres[], exclude_families[], exclude_ids[], vocals:"none"|"allowed", min_duration_s, require_verified_stems},
//        preferences: {families[], energy, warmth, less_corporate, less_percussion, calm, avoid_recent, ...} }  -> hard and preferences never merge.
// Whatever came from a tag or a guess belongs in `estimates` and is only ever used to explain a score.
export function normalizeConstraints(raw = {}) {
  const r = isObj(raw) ? raw : {};
  const h = isObj(r.hard) ? r.hard : {}, p = isObj(r.preferences) ? r.preferences : {};
  const instruments = list(h.exclude_instruments), genres = list(h.exclude_genres), terms = list(h.exclude_terms);
  const hard = {
    exclude_instruments: instruments, exclude_genres: genres,
    exclude_terms: [...new Set([...terms, ...instruments, ...genres])],
    exclude_families: list(h.exclude_families).filter((f) => MUSIC_FAMILIES.includes(f)),
    exclude_ids: list(h.exclude_ids),
    vocals: h.vocals === "none" || h.vocals === "allowed" ? h.vocals : null,
    min_duration_s: num(h.min_duration_s),
    require_verified_stems: h.require_verified_stems === true,
  };
  const preferences = {
    families: list(p.families).filter((f) => MUSIC_FAMILIES.includes(f)),
    energy: ENERGY_BANDS.includes(lc(p.energy)) ? lc(p.energy) : null,
    warmth: Math.max(-1, Math.min(1, num(p.warmth, 0))),
    less_corporate: p.less_corporate === true,
    less_percussion: Math.max(0, Math.min(1, num(p.less_percussion, p.less_percussion === true ? 1 : 0))),
    calm: Math.max(0, Math.min(1, num(p.calm, 0))),
    avoid_recent: p.avoid_recent !== false,
  };
  return { version: SHORTLIST_VERSION, hard, preferences, estimates: { note: "tag-derived values (family, energy, vocals, instrumentation read from tags or names) explain a score and are never a constraint" }, scope: T(r.scope) || "session" };
}

// ---- one candidate, read honestly ----------------------------------------------------------------------------------------------------------
// c: a catalog row, or candidateFromOption(): { id, title, artist, source, family[] (style tags), families[], bpm, duration, ending, strong_from, sections[], energy, vocals,
//    instrumentation[], notes, stems{available, verified, files[]}, analysis (analyzeTrack output), sha256, licence/host/..., rights, evidence_state, listened, origin, file }
function read(c, ctx) {
  const id = T(c.id);
  const fams = (Array.isArray(c.families) && c.families.length ? c.families.filter((f) => MUSIC_FAMILIES.includes(f)) : []).concat(familyOf(c)).filter((f, i, a) => a.indexOf(f) === i);
  const ev = id ? evidenceFor(id, c.sha256 || null, { evidence: ctx.evidence }) : { state: null, stale: [] };
  // a state claimed by a row counts only when an evidence entry for these bytes backs it; the baseline is metadata_reviewed, never auditioned
  const state = ev.state || "metadata_reviewed";
  const claimed = T(c.evidence_state);
  const unbacked = (claimed && evidenceRank(claimed) > evidenceRank(state)) || (c.listened === true && evidenceRank(state) < 1);
  const lab = labelEstimates(c.analysis || {});
  const claimedBpm = num(c.bpm);
  // measured tempo wins; a catalog tag is a claim (confidence "claimed"); no usable tempo stays null: ambient/rubato is usable and no grid is invented
  let bpm;
  if (c.analysis) bpm = lab.tempo.status === "undetected" ? { value: null, confidence: "undetected", note: lab.note || null } : { value: lab.tempo.bpm, confidence: lab.tempo.status === "detected" ? "measured" : "uncertain", claimed: claimedBpm, reasons: lab.tempo.reasons };
  else bpm = { value: claimedBpm, confidence: claimedBpm ? "claimed" : "undetected" };
  let tempoDisagrees = false;
  if (c.analysis && claimedBpm && bpm.value) { const q = bpm.value / claimedBpm; tempoDisagrees = ![1, 2, 0.5].some((m) => Math.abs(q / m - 1) <= 0.08); }
  const stemsClaimed = !!(isObj(c.stems) ? c.stems.available === true || (isObj(c.stems) && !Array.isArray(c.stems) && Object.keys(c.stems).length > 0 && c.stems.available === undefined) : false);
  const stemsVerified = !!(isObj(c.stems) && c.stems.available !== false && c.stems.verified === true && (c.origin === "user" || evidenceRank(state) >= 1));
  let energy = ENERGY_BANDS.includes(lc(c.energy)) ? lc(c.energy) : null, energyEstimated = false;
  if (!energy) { energy = FAMILY_ENERGY[fams[0]] || "medium"; energyEstimated = true; }
  const sections = arr(c.sections).map((s) => ({ t0: num(s.t0), t1: num(s.t1), label: T(s.label) || null, tier: T(s.tier) || null })).filter((s) => s.t0 != null && s.t1 != null);
  const rights = rightsByUse(c);
  const dur = num(c.duration, num(c.analysis && c.analysis.duration));
  return { id, c, fams, state, unbacked, bpm, tempoDisagrees, stemsClaimed, stemsVerified, energy, energyEstimated, sections, rights, dur, vocals: lc(c.vocals) || null, instr: list(c.instrumentation), text: `${T(c.title)} ${T(c.notes)} ${T(c.mood)} ${arr(c.family).join(" ")}` };
}

const bandIdx = (e) => Math.max(0, ENERGY_BANDS.indexOf(e));

// ---- ranking ------------------------------------------------------------------------------------------------------------------------------
// o: { sound (a sound-choices record, unused except by callers), resolved (resolveSound().resolved), brief_style, film_s, narrated, recent_use (ids or families), constraints (normalizeConstraints output or raw), preferences, evidence }
export function rankCandidates(candidates, o = {}) {
  const K = normalizeConstraints(isObj(o.constraints) && o.constraints.hard && o.constraints.preferences ? o.constraints : { hard: o.constraints && o.constraints.hard, preferences: { ...(o.constraints && o.constraints.preferences), ...(o.preferences || {}) } });
  const resolved = isObj(o.resolved) ? o.resolved : null;
  const film = num(o.film_s);
  const narrated = o.narrated != null ? !!o.narrated : resolved ? resolved.voice_role === "carrier" : false;
  const wantEnergy = K.preferences.energy || (resolved && resolved.energy && resolved.energy.perceived) || null;
  const feeling = resolved && resolved.feeling && resolved.feeling.value;
  const wantFams = [...new Set([...K.preferences.families, ...(FEELING_FAMILIES[feeling] || []), ...STYLE_WORDS.filter(([re]) => re.test(T(o.brief_style))).map(([, f]) => f)])];
  const recent = new Set(arr(o.recent_use).map(String));
  const ctx = { evidence: o.evidence };
  const ranked = [], excluded = [];
  for (const raw of arr(candidates)) {
    if (!isObj(raw) || !T(raw.id)) continue;
    const r = read(raw, ctx);
    const out = (reason) => excluded.push({ id: r.id, reason });
    // ---- hard exclusions: only facts, licences and the user's own hard constraints
    if (raw.blocked) { out(`blocked: ${arr(raw.problems)[0] || "licence note blocks this library"}`); continue; }
    if (K.hard.exclude_ids.includes(lc(r.id))) { out("excluded by the user"); continue; }
    if (r.rights.sync_into_film === false) { out(`rights: ${r.rights.why.sync_into_film}`); continue; }
    if (raw.usable === false && raw.origin !== "user") { out(`not usable: ${arr(raw.problems)[0] || "failed the quality gate"}`); continue; }
    const need = K.hard.min_duration_s ?? (film ? film + 4 : null);
    if (need && r.dur != null && r.dur < need && raw.origin !== "user") { out(`${r.dur} s is shorter than the ${Math.round(need)} s the film needs: a short track is not looped to fill it`); continue; }
    if (r.fams.some((f) => K.hard.exclude_families.includes(f)) && r.fams.every((f) => K.hard.exclude_families.includes(f))) { out(`family ${r.fams[0]} excluded by the user`); continue; }
    const hit = K.hard.exclude_terms.find((t) => new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i").test(`${r.text} ${r.instr.join(" ")}`));
    if (hit) { out(`excluded term "${hit}" (the user's hard constraint) appears in its record`); continue; }
    if (r.vocals === "present" && (narrated || K.hard.vocals === "none")) { out("vocals under a voiceover (or vocals excluded by the user)"); continue; }
    if (K.hard.require_verified_stems && !r.stemsVerified) { out("verified stems were required: this track has none verified (a claimed stem set is not verified)"); continue; }

    // ---- soft score parts, each with a reason (0-100 total)
    const reasons = [], parts = {};
    let famFit = 0.5;
    if (wantFams.length) { const i = r.fams.findIndex((f) => wantFams.includes(f)); famFit = i === 0 ? 1 : i > 0 ? 0.75 : 0.15; reasons.push(i >= 0 ? `family ${r.fams[i]} suits the ${feeling && FEELING_FAMILIES[feeling] ? feeling + " feeling" : "brief"}` : `family ${r.fams[0] || "unknown"} is not among the ones asked for`); }
    parts.fit = 22 * famFit;
    let en = 0.6;
    if (wantEnergy) { const d = Math.abs(bandIdx(r.energy) - bandIdx(wantEnergy)); en = d === 0 ? 1 : d === 1 ? 0.45 : 0; reasons.push(`${r.energy} energy${r.energyEstimated ? " (estimated from its family)" : ""} vs ${wantEnergy} wanted`); }
    parts.energy = 16 * en;
    let space = 0.7;
    if (narrated) {
      space = 0.7 - (r.energy === "high" ? 0.35 : r.energy === "medium" ? 0.1 : -0.2) - (r.vocals === "possible" ? 0.2 : 0) - (r.instr.length > 4 ? 0.15 : 0) + (r.vocals === "none" ? 0.15 : 0);
      space = Math.max(0, Math.min(1, space));
      reasons.push(space >= 0.7 ? "leaves room for a voice" : "may crowd a voice (estimated)");
    }
    parts.narration_space = 12 * space;
    const density = r.instr.length ? Math.min(1, r.instr.length / 6) : null;
    parts.arrangement = density == null ? 4 : 8 * (1 - Math.abs(density - (wantEnergy ? (bandIdx(wantEnergy) + 1) / 3.5 : 0.5)));
    const usable = r.sections.filter((s) => s.t1 - s.t0 >= 8);
    const strongFrom = num(raw.strong_from);
    parts.sections = r.sections.length ? 6 * Math.min(1, usable.length / 2) : 2;
    if (r.sections.length) reasons.push(`${usable.length} usable section(s)`);
    const longEnough = film && r.dur != null ? Math.min(1, r.dur / (film * 1.5)) : 0.6;
    parts.duration = 6 * longEnough;
    const END = { stop: 1, decay: 1, "ring-out": 0.85, cut: 0.6, fade: 0.45, none: 0.25, unknown: 0.5 };
    const endType = T(raw.ending && raw.ending.type || raw.ending);
    parts.ending = 5 * (END[endType] ?? 0.5) + 3 * (strongFrom != null && r.dur ? Math.max(0, 1 - strongFrom / (r.dur * 0.5)) : 0.5);
    if (endType) reasons.push(endType === "fade" ? "fades out (a real ending is better)" : `${endType} ending`);
    parts.stems = r.stemsVerified ? 5 : r.stemsClaimed ? 1 : 0; // claimed stems earn almost nothing until verified
    if (r.stemsClaimed && !r.stemsVerified) reasons.push("stems claimed but not verified: not counted");
    // reuse
    let reuse = 0;
    if (K.preferences.avoid_recent && (recent.has(r.id) || r.fams.some((f) => recent.has(f)))) { reuse = recent.has(r.id) ? 8 : 4; reasons.push(recent.has(r.id) ? "used recently: ranked down" : "its family was used recently: ranked down a little"); }
    parts.reuse = -reuse;
    // tempo: only a measured disagreement counts; unknown tempo is neutral
    let tempo = 0;
    if (r.tempoDisagrees) { tempo = -4; reasons.push(`claimed ${raw.bpm} BPM, measured ${r.bpm.value} BPM: the measurement is used`); }
    else if (r.bpm.confidence === "undetected") reasons.push("no beat grid found: usable by phrase and by ear, no grid is assumed");
    parts.tempo = tempo;
    // session / preference nudges
    let pref = 0;
    if (K.preferences.warmth) { const w = (WARM_WORDS.test(r.text) || r.fams[0] === "warm_acoustic" ? 1 : 0) - (r.fams[0] === "bold_percussion" || r.fams[0] === "restrained_electronic" ? 0.5 : 0); pref += K.preferences.warmth * w * 6; if (w) reasons.push(K.preferences.warmth > 0 ? "warmer, as asked" : "less warm, as asked"); }
    if (K.preferences.less_corporate && STOCK.test(r.text)) { pref -= 8; reasons.push("reads as stock-corporate: ranked down"); }
    if (K.preferences.less_percussion) { const p = PERCUSSION.test(r.text) || r.instr.some((i) => PERCUSSION.test(i)) || r.fams[0] === "bold_percussion" ? 1 : 0; pref -= K.preferences.less_percussion * p * 8; if (p) reasons.push("percussion-forward: ranked down"); }
    if (K.preferences.calm) pref += K.preferences.calm * (r.energy === "low" ? 6 : r.energy === "high" ? -6 : 0);
    parts.preferences = pref;
    if (r.unbacked) reasons.push("claims an audition no evidence entry backs: treated as metadata_reviewed");
    if (r.state === "metadata_reviewed") reasons.push("metadata reviewed only: nobody has listened (listen before committing)");
    const base = raw.score != null ? 0.15 * Math.min(100, Math.max(0, Number(raw.score))) : 0; // a measured quality score (music.mjs judge) adds a little, never dominates
    const total = Math.max(0, Math.min(100, Object.values(parts).reduce((a, b) => a + b, 0) + base));
    ranked.push({
      id: r.id, title: T(raw.title) || r.id, score: r1(total), reasons, parts: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, r1(v)])),
      families: r.fams, energy: r.energy, energy_estimated: r.energyEstimated, origin: T(raw.origin) || T(raw.source) || null, artist: T(raw.artist) || null,
      evidence_state: r.state, listened: evidenceRank(r.state) >= 1,
      rights: { ref: isObj(raw.rights) && T(raw.rights.ref) || `rights:${r.id}`, by_use: { sync_into_film: r.rights.sync_into_film, bundle_in_app: r.rights.bundle_in_app, upload_to_provider: r.rights.upload_to_provider, serve_preview: r.rights.serve_preview }, conditions: r.rights.conditions, note: "a recommendation is not consent: per-film consent is a crew/rights.jsonl event" },
      stems: { claimed: r.stemsClaimed, verified: r.stemsVerified },
      sections: r.sections, bpm: r.bpm, duration: r.dur, file: raw.file || null, sha256: raw.sha256 || null,
    });
  }
  ranked.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return { ranked, excluded, constraints: K, wanted: { energy: wantEnergy, families: wantFams, narrated } };
}

// ---- three that are really different ---------------------------------------------------------------------------------------------------------
// different primary family AND different energy band from every option already taken; never a near-duplicate; fewer is a result, not a failure
export function pickThree(ranked, { max = 3 } = {}) {
  const rows = arr(ranked && ranked.ranked ? ranked.ranked : ranked);
  const options = [];
  const skipped = [];
  for (const c of rows) {
    if (options.length >= Math.min(3, max)) break;
    const clash = options.find((o) => o.families[0] === c.families[0] || o.energy === c.energy || (o.artist && c.artist && o.artist === c.artist && o.families[0] === c.families[0]));
    if (clash) { skipped.push({ id: c.id, reason: `near-duplicate of ${clash.id} (${clash.families[0] === c.families[0] ? "same family" : "same energy"})` }); continue; }
    options.push({ ...c, picked_for: `${c.families[0] || "unclassified"} · ${c.energy} energy` });
  }
  const limit = Math.min(3, max);
  const note = options.length >= limit ? null
    : options.length === 0 ? "No playable candidate remains after the exclusions: say so, and offer your own track, a different direction or no music."
    : `Only ${options.length} genuinely different playable candidate${options.length === 1 ? "" : "s"} (different family and energy): the list is not padded with near-duplicates.`;
  return { options, note, skipped };
}

// ---- revisions --------------------------------------------------------------------------------------------------------------------------------
const ACTIONS = [
  ["keep", /\b(keep|stay with|stick with|lock|use this|go with this)\b/i],
  ["calmer_section", /\b(calmer|quieter|softer|gentler|less intense)\s+(section|part|bit|passage|moment)\b|\bcalm(er)? (section|part)\b/i],
  ["less_percussion", /\b(less|fewer|no|without|softer)\s+(percussion|drums?|beats?|rhythm)\b|\bdrop the drums\b/i],
  ["less_corporate", /\b(less|not so|too)\s+corporate\b|\bnot corporate\b|\bless (stock|generic|business)\b/i],
  ["warmer", /\b(warmer|warm(er)? tone|more (organic|acoustic|human|intimate))\b/i],
  ["more_like", /\b(more like (this|that|it)|similar|another like|like this one)\b/i],
  ["calmer", /\b(calmer|quieter|slower|more relaxed|less busy)\b/i],
];
export function parseRevision(request) {
  if (!isObj(request)) request = { text: T(request) };
  const out = [];
  if (request.action && ACTIONS.some(([k]) => k === request.action)) out.push(request.action);
  const text = T(request.text);
  for (const [k, re] of ACTIONS) if (re.test(text) && !out.includes(k)) out.push(k);
  return out;
}

// prev: a shortlist record or { options|ranked, selected, constraints, liked[], revision, candidates?, rank_opts? }.
// request: { action?, text?, track_id?, save_preference? }. -> { revision, actions[], constraints, selected, liked[], section_request, saved_preferences, rerank, note }
// The like is SESSION-scoped. It is promoted to a stored preference only when the request says save_preference:true, and even then this function only reports the request:
// the caller writes it through the existing preference path. A preview selection never authorizes provider spending (needs_consent stays false here and generation stays off).
export function reviseShortlist(prev = {}, request = {}) {
  const p = isObj(prev) ? prev : {};
  const req = isObj(request) ? request : { text: T(request) };
  const actions = parseRevision(req);
  const revision = Math.max(1, Math.floor(num(p.revision, 1))) + 1;
  const options = arr(p.options).length ? arr(p.options) : arr(p.ranked);
  const targetId = T(req.track_id) || T(p.selected && p.selected.id || p.selected) || (options[0] && options[0].id) || null;
  const target = options.find((o) => o.id === targetId) || arr(p.candidates).find((o) => o && o.id === targetId) || null;
  const K = normalizeConstraints({ hard: p.constraints && p.constraints.hard, preferences: { ...(p.constraints && p.constraints.preferences) } });
  const pr = K.preferences;
  const liked = arr(p.liked).filter((l) => l && l.id).map((l) => ({ ...l }));
  let selected = p.selected ? (isObj(p.selected) ? p.selected : { id: String(p.selected) }) : null;
  let section_request = null;
  const notes = [];
  for (const a of actions) {
    if (a === "keep" && targetId) { selected = { id: targetId, kept: true, section: selected && selected.id === targetId ? selected.section || null : null }; if (!liked.some((l) => l.id === targetId)) liked.push({ id: targetId, scope: "session", saved: false, why: "kept", at_revision: revision }); notes.push(`keeping ${targetId}`); }
    else if (a === "more_like" && targetId) {
      if (!liked.some((l) => l.id === targetId)) liked.push({ id: targetId, scope: "session", saved: false, why: "more like this", at_revision: revision });
      const f = target && (target.families || familyOf(target) || []);
      if (f && f.length) pr.families = [...new Set([...f.slice(0, 1), ...pr.families])];
      const e = target && (target.energy || FAMILY_ENERGY[f && f[0]]);
      if (ENERGY_BANDS.includes(e)) pr.energy = e;
      notes.push(`more like ${targetId}: same family and energy asked for, the track itself is excluded so the list is not the same track again`);
      K.hard.exclude_ids = [...new Set([...K.hard.exclude_ids, lc(targetId)])];
    }
    else if (a === "warmer") { pr.warmth = Math.min(1, pr.warmth + 0.6); notes.push("warmer: warm families and words ranked up"); }
    else if (a === "less_corporate") { pr.less_corporate = true; notes.push("less corporate: stock-library markers ranked down (a ranking preference, not a ban on any instrument)"); }
    else if (a === "less_percussion") { pr.less_percussion = Math.min(1, pr.less_percussion + 0.6); notes.push("less percussion: percussion-forward tracks ranked down"); }
    else if (a === "calmer") { pr.calm = Math.min(1, pr.calm + 0.6); notes.push("calmer: lower-energy tracks ranked up"); }
    else if (a === "calmer_section" && targetId) {
      // the section of the SAME track with the lowest tier that is still long enough; null when the track has no analysed sections (nothing is invented)
      const secs = arr(target && target.sections).filter((s) => num(s.t0) != null && num(s.t1) != null && s.t1 - s.t0 >= 6);
      const rank = { low: 0, mid: 1, peak: 2 };
      const calm = secs.slice().sort((x, y) => (rank[x.tier] ?? 1) - (rank[y.tier] ?? 1) || (x.t0 - y.t0))[0] || null;
      section_request = { track_id: targetId, want: "calmer", section: calm ? { t0: calm.t0, t1: calm.t1, label: calm.label || null, tier: calm.tier || null } : null, reason: calm ? "lowest-energy analysed section long enough to use (an estimate from loudness, not a listening judgement)" : "no analysed sections: the track is kept whole or edited by ear" };
      if (calm) selected = { id: targetId, kept: true, section: section_request.section };
      notes.push(calm ? `calmer section of ${targetId}: ${calm.t0}-${calm.t1} s` : `no analysed calmer section for ${targetId}`);
    }
  }
  if (!actions.length) notes.push("no known revision found in the request: nothing changed; try Keep this track, More like this, Warmer, Less corporate, Less percussion or Calmer section");
  const constraints = { ...K, scope: "session" };
  const saved = req.save_preference === true ? { requested: true, preferences: { families: pr.families, energy: pr.energy, warmth: pr.warmth, less_corporate: pr.less_corporate, less_percussion: pr.less_percussion }, note: "an explicit save: the caller writes it through the existing preference path; this record does not" } : { requested: false, preferences: null };
  if (liked.length) for (const l of liked) l.saved = req.save_preference === true && l.id === targetId ? "requested" : l.saved || false;
  let rerank = null;
  if (arr(p.candidates).length) {
    const rr = rankCandidates(p.candidates, { ...(p.rank_opts || {}), constraints });
    rerank = { ...rr, picks: pickThree(rr) };
  }
  return { version: SHORTLIST_VERSION, revision, actions, constraints, selected, liked, section_request, saved_preferences: saved, rerank, needs_consent: false, generation: "unchanged: choosing or revising a preview is not approval for generation or any hidden provider spending", note: notes.join("; ") };
}

// ---- records -----------------------------------------------------------------------------------------------------------------------------------
// a music.mjs option (+ its catalog row) as a candidate; the option's analysis facts win over the row's claims
export function candidateFromOption(o, row = null, analysis = null) {
  const base = isObj(row) ? { ...row } : {};
  const c = { ...base, id: o.id, title: o.title || base.title, mood: o.mood, origin: o.origin || base.origin, file: o.file, sha256: o.sha256 || base.sha256 || null, score: o.score, usable: o.usable, blocked: o.blocked, problems: o.problems, duration: o.duration ?? base.duration, strong_from: o.strong_from ?? base.strong_from, ending: o.ending || base.ending, sections: arr(o.sections).length ? o.sections : base.sections, listened: base.listened === true ? true : o.listened === true };
  if (analysis) c.analysis = analysis;
  else if (o.bpm != null && !row) c.bpm = o.bpm;
  if (isObj(o.stems)) c.stems = { available: true, verified: true, files: Object.values(o.stems).flat().map(String) }; // a user's folder holds real stem files (the paths exist); catalog rows keep their own claim
  if (o.library) c.library = o.library;
  if (o.origin === "user") { c.commercial_ok = true; c.licence = c.licence || o.license; } // the user's own declaration; recorded as theirs
  return c;
}

// the stored record: source, rejection reasons, chosen section, rights, file identity, evidence state, selected revision
export function buildShortlistRecord({ picks, ranked, selected = null, revision = 1, constraints = null, film_s = null, sound_digest = null, prev_revision = null } = {}) {
  const opts = arr(picks && picks.options);
  const rows = arr(ranked && ranked.ranked);
  const entry = (o) => ({ id: o.id, source: o.origin, rights: o.rights, file_identity: { file: o.file, sha256: o.sha256 }, evidence_state: o.evidence_state, listened: o.listened, stems: o.stems, bpm: o.bpm, families: o.families, energy: o.energy, score: o.score, reasons: o.reasons.slice(0, 8), chosen_section: selected && selected.id === o.id ? selected.section || null : null });
  return {
    version: SHORTLIST_VERSION, revision, prev_revision, film_s, sound_digest, status: "implemented_unvalidated",
    options: opts.map(entry), considered: rows.length,
    rejected: [...arr(ranked && ranked.excluded), ...arr(picks && picks.skipped)],
    selected, note: picks ? picks.note : null,
    constraints, session_only: true,
  };
}

// excerpt plan only: which passage, which section, the target level. No audio is rendered; leveling is separate from file identity and from delivery mastering.
// o: { start_s, end_s } (the visual passage), target_lufs (default -23, the comparison level, not the delivery target)
export function previewPlan(options, { passage = null, target_lufs = -23 } = {}) {
  return {
    version: SHORTLIST_VERSION, rendered: false, basis: "plan_only",
    passage: passage && num(passage.start_s) != null ? { start_s: num(passage.start_s), end_s: num(passage.end_s) } : null,
    leveling: { target_lufs, applies_to: "preview excerpt only; source files and delivery mastering are untouched", measured: null },
    excerpts: arr(options).map((o) => ({
      id: o.id, file_identity: { file: o.file || null, sha256: o.sha256 || null },
      section: o.chosen_section || (arr(o.sections).find((s) => s.tier === "peak") || arr(o.sections)[0] || null),
      allowed: o.rights && o.rights.by_use ? o.rights.by_use.serve_preview !== false : true,
      why_not: o.rights && o.rights.by_use && o.rights.by_use.serve_preview === false ? "the host's terms do not allow serving a copy: link to the host's page instead" : null,
    })),
  };
}
