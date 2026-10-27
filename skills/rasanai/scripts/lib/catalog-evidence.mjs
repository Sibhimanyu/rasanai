// catalog-evidence.mjs: audition evidence, rights by use and families for the music catalog and the SFX library. Pure functions plus
// ONE read-only file reader (LIB/music/evidence.json). No writes, no network, no audio. Status: implemented_unvalidated.
//
//   EVIDENCE_STATES                 metadata_reviewed < auditioned < approved_in_finished_mix (a ranking, never a score)
//   familyOf(entry)                 music row -> the six addendum families (table below, an ESTIMATE from style tags, never listening)
//   sfxFamilyOf(entry, families)    sfx row -> a coherent sound-family id from LIB/sfx/families.json (grouping by pack character)
//   rightsByUse(entry)              four SEPARATE permissions: sync_into_film, bundle_in_app, upload_to_provider, serve_preview.
//                                   true = the licence/host terms allow it; false = they forbid it; null = unreviewed, which is NOT permission.
//   validateTrackEvidence(entry, {evidence})   a catalog row: no unearned audition claim, rights never broader than the licence, stems honest
//   validateSfxEntry(entry, {families, evidence})   an sfx row: job / intensity / role / family vocabulary, same evidence and rights rules
//   validateEvidenceEntry(e)        one row of evidence.json
//   evidenceFor(assetId, version)   what evidence.json says about THIS asset version (a filename repeated in another version is stale, not proof)
//
// Consumers (named, per the lane rule): music-shortlist.mjs (AUD-MUSIC) reads evidenceFor + rightsByUse + familyOf when ranking and
// excluding; music-lib.mjs validateCatalog (AUD-MUSIC) may call validateTrackEvidence for the new optional fields; sfx-layers.mjs
// (AUD-SFX) reads sfxFamilyOf for coherentFamily. Nothing here is wired into a running path yet: the integration owners add the calls.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const LIBRARY_DIR = path.join(HERE, "..", "..", "library");
export const EVIDENCE_FILE = path.join(LIBRARY_DIR, "music", "evidence.json");
export const SFX_FAMILIES_FILE = path.join(LIBRARY_DIR, "sfx", "families.json");

const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);
const T = (x) => (typeof x === "string" ? x.trim() : x == null ? "" : String(x).trim());

// ---- evidence states ------------------------------------------------------------------------------------------------------------------
export const EVIDENCE_STATES = Object.freeze(["metadata_reviewed", "auditioned", "approved_in_finished_mix"]);
const STATE_RANK = Object.freeze({ metadata_reviewed: 0, auditioned: 1, approved_in_finished_mix: 2 });
export const evidenceRank = (s) => (s in STATE_RANK ? STATE_RANK[s] : -1);
// methods that count as a listening: anything else (measured, tagged, "same filename") is metadata
export const LISTENING_METHODS = Object.freeze(["listened_full", "listened_sections", "listened_in_context"]);

// ---- the six music families -----------------------------------------------------------------------------------------------------------
export const MUSIC_FAMILIES = Object.freeze(["restrained_electronic", "warm_acoustic", "playful_rhythmic", "spacious_ambient", "bold_percussion", "cinematic_development"]);
// the existing 12 style tags -> the six. An ESTIMATE from names, not from listening: several tags are loose (lo-fi is warm but rarely
// acoustic; retro covers house carpets and synthpop; raw and cinematic have no/one catalog track). Order = primary first.
export const STYLE_TO_FAMILY = Object.freeze({
  editorial: ["restrained_electronic"],
  "dark-tech": ["restrained_electronic"],
  playful: ["playful_rhythmic"],
  cinematic: ["cinematic_development"],
  raw: ["bold_percussion"],
  retro: ["restrained_electronic", "playful_rhythmic"],
  organic: ["warm_acoustic"],
  "lo-fi": ["warm_acoustic"],
  "ambient-pop": ["spacious_ambient"],
  "indie-electronic": ["restrained_electronic"],
  chill: ["spacious_ambient"],
  reel: ["playful_rhythmic"],
});
// the one note-driven refinement: a track whose own notes say breakbeat is also a percussion-forward candidate
const NOTE_FAMILY = Object.freeze([[/\bbreakbeat\b/i, "bold_percussion"]]);

export function familyOf(entry) {
  const e = isObj(entry) ? entry : {};
  const out = [];
  for (const tag of arr(e.family).map((t) => T(t).toLowerCase())) for (const f of STYLE_TO_FAMILY[tag] || []) if (!out.includes(f)) out.push(f);
  for (const [re, f] of NOTE_FAMILY) if (re.test(T(e.notes)) && !out.includes(f)) out.push(f);
  return out;
}

// ---- rights by use --------------------------------------------------------------------------------------------------------------------
export const RIGHTS_USES = Object.freeze(["sync_into_film", "bundle_in_app", "upload_to_provider", "serve_preview"]);
const BLOCKED_LICENCE = /\b(nc|nd|sa|non-?commercial|no-?derivatives?|share-?alike)\b|-nc|-nd|-sa/i; // mirrors music-lib BLOCKED_LICENCE
const isFreeLicence = (l) => /free licen[cs]e/i.test(l);
const isCC0 = (l) => /^cc0|public domain/i.test(l);
const isCCBY = (l) => /^cc[- ]by\b/i.test(l);

// entry: a music catalog row ({licence, host, mirror_ok, fetch, commercial_ok, requires_credit, restrictions, source, url}) or an sfx row
// ({licence, pack}). Computed from the BASE licence/host fields, never from a stored `rights` block, so a stored block cannot widen itself.
// -> { sync_into_film, bundle_in_app, upload_to_provider, serve_preview, why:{<use>:string}, conditions:[string] }
// Permission to synchronize a track into a finished film is not permission to bundle the raw audio, mirror it, serve a preview or send it
// to a provider. Mixkit and host:"upstream" rows always come out bundle=false, upload=false, preview=false.
export function rightsByUse(entry) {
  const e = isObj(entry) ? entry : {};
  const licence = T(e.licence);
  const upstream = T(e.host) === "upstream" || e.mirror_ok === false || /mixkit/i.test(`${T(e.source)} ${T(e.url)} ${licence}`);
  const blocked = !!licence && BLOCKED_LICENCE.test(licence) && !isFreeLicence(licence);
  const why = {};
  const conditions = [];
  if (e.requires_credit || isCCBY(licence)) conditions.push("credit line required in the film description");
  if (T(e.restrictions)) conditions.push(T(e.restrictions));

  let sync = null;
  if (e.commercial_ok === false) { sync = false; why.sync_into_film = "commercial use is not allowed"; }
  else if (blocked) { sync = false; why.sync_into_film = `licence "${licence}" carries an NC, ND or SA term`; }
  else if (!licence) why.sync_into_film = "no licence recorded: unreviewed, not permission";
  else { sync = true; why.sync_into_film = `${licence} allows use in a finished film${e.restrictions ? " within the listed restrictions" : ""}`; }

  let bundle = null;
  if (upstream) { bundle = false; why.bundle_in_app = "host is upstream: the licence/terms do not allow redistributing the raw file"; }
  else if (blocked) { bundle = false; why.bundle_in_app = "licence blocks redistribution"; }
  else if (T(e.host) === "self" && e.mirror_ok === true) { bundle = true; why.bundle_in_app = `${licence || "licence"} allows redistribution (mirror_ok); host self`; }
  else if (!T(e.host) && (isCC0(licence) || isCCBY(licence))) { bundle = true; why.bundle_in_app = `${licence} allows redistribution of the file (already part of the library)`; }
  else why.bundle_in_app = "not established: unreviewed, not permission";

  let upload = null;
  if (upstream) { upload = false; why.upload_to_provider = "host is upstream: do not send the raw file to a third party"; }
  else if (blocked) { upload = false; why.upload_to_provider = "licence blocks redistribution"; }
  else if (isCC0(licence)) { upload = true; why.upload_to_provider = "CC0 sets no limit on the file (the provider's own terms still need a per-provider check)"; }
  else { why.upload_to_provider = "unreviewed: attribution carriage and the provider's terms are not checked, so this is not permission"; }

  let preview = null;
  if (upstream) { preview = false; why.serve_preview = "host is upstream: never prefetched or served (metadata and the host's own page only)"; }
  else if (blocked) { preview = false; why.serve_preview = "licence blocks redistribution"; }
  else if ((T(e.host) === "self" && e.mirror_ok === true) || (!T(e.host) && (isCC0(licence) || isCCBY(licence)))) { preview = true; why.serve_preview = "redistributable file: a preview is a copy the licence allows"; }
  else why.serve_preview = "not established: unreviewed, not permission";

  return { sync_into_film: sync, bundle_in_app: bundle, upload_to_provider: upload, serve_preview: preview, why, conditions };
}

// a stored rights block must never be more permissive than what the base licence/host fields give
function checkRights(entry, id, errors, warnings) {
  const r = entry.rights;
  if (r === undefined) { warnings.push(`${id}: no rights block (optional): treat every use as unreviewed`); return; }
  if (!isObj(r)) { errors.push(`${id}: rights must be an object`); return; }
  const base = rightsByUse(entry);
  for (const u of RIGHTS_USES) {
    if (![true, false, null].includes(r[u])) { errors.push(`${id}: rights.${u} must be true, false or null (unreviewed)`); continue; }
    if (r[u] === true && base[u] !== true) errors.push(`${id}: rights.${u} is true but the licence/host fields give ${base[u] === false ? "false" : "unreviewed"} (${base.why[u]})`);
  }
  for (const k of ["ref", "terms_version", "checked_on"]) if (!T(r[k])) errors.push(`${id}: rights.${k} missing`);
}

// ---- evidence file --------------------------------------------------------------------------------------------------------------------
// evidence.json entry: { asset_id, version (the asset's sha256 or catalog version: WHICH bytes were judged), state, reviewer, reviewer_kind
// ("human"|"model"), method (LISTENING_METHODS for auditioned and above), context { purpose, film?, section?, monitoring? } (approved_in_finished_mix
// also needs context.film and context.mix_receipt), at (ISO), notes? }
export function validateEvidenceEntry(e) {
  const errors = [];
  if (!isObj(e)) return ["evidence entry must be an object"];
  const id = T(e.asset_id) || "(no asset_id)";
  if (!T(e.asset_id)) errors.push("asset_id missing");
  if (!T(e.version)) errors.push(`${id}: version missing (an asset id alone does not identify which bytes were judged)`);
  if (!EVIDENCE_STATES.includes(e.state)) errors.push(`${id}: state must be one of ${EVIDENCE_STATES.join(", ")}`);
  if (!T(e.reviewer)) errors.push(`${id}: reviewer missing`);
  if (!T(e.method)) errors.push(`${id}: method missing`);
  if (!isObj(e.context) || !T(e.context.purpose)) errors.push(`${id}: context.purpose missing`);
  if (!T(e.at) || Number.isNaN(Date.parse(e.at))) errors.push(`${id}: at must be an ISO timestamp`);
  if (evidenceRank(e.state) >= 1 && !LISTENING_METHODS.includes(e.method)) errors.push(`${id}: state ${e.state} needs a listening method (${LISTENING_METHODS.join(", ")}), got "${T(e.method)}"`);
  if (e.state === "approved_in_finished_mix" && !(isObj(e.context) && T(e.context.film) && T(e.context.mix_receipt))) errors.push(`${id}: approved_in_finished_mix needs context.film and context.mix_receipt`);
  return errors;
}

export function readEvidence(file = EVIDENCE_FILE) {
  try {
    const j = JSON.parse(fs.readFileSync(file, "utf8"));
    return { version: j && j.version || 1, entries: arr(j && j.entries), error: null };
  } catch (err) {
    return { version: 1, entries: [], error: err && err.code === "ENOENT" ? null : String(err && err.message || err) };
  }
}

// -> { asset_id, version, state, entries[], stale[] }. state = the highest state backed by a VALID entry for this exact version, else null
// (null = no evidence recorded; the catalog row's own evidence_state "metadata_reviewed" is a metadata claim, not an evidence entry).
// Entries recorded against a different version of the same asset id are returned in `stale`, never counted.
export function evidenceFor(assetId, version = null, opts = {}) {
  const all = arr(opts.evidence || readEvidence(opts.file).entries).filter((e) => isObj(e) && e.asset_id === assetId);
  const same = (e) => version == null || e.version === version || e.sha256 === version || e.hash === version;
  const entries = all.filter((e) => same(e) && !validateEvidenceEntry(e).length);
  const stale = all.filter((e) => !same(e));
  let state = null;
  for (const e of entries) if (state === null || evidenceRank(e.state) > evidenceRank(state)) state = e.state;
  return { asset_id: assetId, version, state, entries, stale };
}

// shared: a row may only claim an evidence state (or listened:true) that an evidence entry for its own version supports
function checkAuditionClaim(entry, id, version, evidence, errors) {
  const claimed = entry.evidence_state;
  if (claimed !== undefined && !EVIDENCE_STATES.includes(claimed)) { errors.push(`${id}: evidence_state "${claimed}" is not one of ${EVIDENCE_STATES.join(", ")}`); return; }
  const need = Math.max(evidenceRank(claimed), entry.listened === true ? 1 : 0);
  if (need < 1) return;
  const have = evidenceFor(id, version, { evidence });
  if (evidenceRank(have.state) < need) errors.push(`${id}: claims ${entry.listened === true && need === 1 ? "listened:true / auditioned" : claimed} but evidence.json has no valid entry for this asset version (${have.stale.length ? "only stale entries for other versions" : "none"}); a listening is evidenced, not asserted`);
}

// ---- music row ------------------------------------------------------------------------------------------------------------------------
const ENERGY = ["low", "medium", "high"];
const VOCALS = ["none", "possible", "present"];
// entry: a catalog.json track row; opts.evidence: evidence entries (default: read evidence.json). -> { ok, errors[], warnings[] }
export function validateTrackEvidence(entry, opts = {}) {
  const errors = [];
  const warnings = [];
  const e = isObj(entry) ? entry : null;
  if (!e) return { ok: false, errors: ["track row must be an object"], warnings };
  const id = T(e.id) || "(no id)";
  const evidence = opts.evidence || readEvidence(opts.file).entries;
  checkAuditionClaim(e, id, e.sha256 || null, evidence, errors);
  if (e.listened === true && e.evidence_state === undefined) warnings.push(`${id}: listened:true without an evidence_state`);
  if (e.families !== undefined) {
    if (!Array.isArray(e.families) || !e.families.length) errors.push(`${id}: families must be a non-empty array`);
    else for (const f of e.families) if (!MUSIC_FAMILIES.includes(f)) errors.push(`${id}: family "${f}" is not one of ${MUSIC_FAMILIES.join(", ")}`);
  }
  if (e.energy != null && !ENERGY.includes(e.energy)) errors.push(`${id}: energy must be ${ENERGY.join("|")} or null`);
  if (e.vocals != null && !VOCALS.includes(e.vocals)) errors.push(`${id}: vocals must be ${VOCALS.join("|")} or null`);
  if (e.instrumentation != null && !Array.isArray(e.instrumentation)) errors.push(`${id}: instrumentation must be an array or null`);
  const claimsSomething = e.energy != null || e.vocals != null || (Array.isArray(e.instrumentation) && e.instrumentation.length);
  if (claimsSomething && !arr(e.estimated).length && evidenceFor(id, e.sha256 || null, { evidence }).state === null) warnings.push(`${id}: energy/vocals/instrumentation set with neither estimated[] nor evidence`);
  if (e.stems !== undefined) {
    const s = e.stems;
    if (!isObj(s) || typeof s.available !== "boolean") errors.push(`${id}: stems must be {available:boolean, verified:boolean, files:[]}`);
    else {
      if (s.available && !arr(s.files).length) errors.push(`${id}: stems.available needs files[] (a claimed stem set is not a stem set)`);
      if (s.verified === true && !s.available) errors.push(`${id}: stems.verified without stems.available`);
      if (s.verified === true && evidenceRank(evidenceFor(id, e.sha256 || null, { evidence }).state) < 1) errors.push(`${id}: stems.verified needs an evidence entry for this version`);
    }
  }
  checkRights(e, id, errors, warnings);
  return { ok: !errors.length, errors, warnings };
}

// ---- sfx row --------------------------------------------------------------------------------------------------------------------------
export const SFX_JOBS = Object.freeze(["interface_action", "movement", "material_contact", "accent_impact", "development_transition", "environmental_bed"]);
export const SFX_INTENSITIES = Object.freeze(["light", "medium", "prominent"]);
// the subset of cues.mjs CUE_ROLES a library sound can fill (music_hit, vo_highlight and lip_sync are not library sounds)
export const SFX_USEFUL_ROLES = Object.freeze(["accent", "impact", "transition", "ui", "foley", "ambience", "riser", "stinger"]);

export function readSfxFamilies(file = SFX_FAMILIES_FILE) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return { version: 1, families: [] }; }
}
// -> the family id of an sfx row (by its pack), or null. families: the parsed families.json (default: read it)
export function sfxFamilyOf(entry, families = null) {
  const e = isObj(entry) ? entry : {};
  const f = isObj(families) ? families : readSfxFamilies();
  for (const fam of arr(f.families)) if (arr(fam.packs).includes(e.pack)) return fam.id;
  return null;
}

// entry: an sfx index.json file row; opts.families: parsed families.json; opts.evidence: evidence entries (sfx audition claims need one)
export function validateSfxEntry(entry, opts = {}) {
  const errors = [];
  const warnings = [];
  const e = isObj(entry) ? entry : null;
  if (!e) return { ok: false, errors: ["sfx row must be an object"], warnings };
  const id = T(e.id) || "(no id)";
  for (const k of ["id", "file", "pack", "licence", "source"]) if (!T(e[k])) errors.push(`${id}: ${k} missing`);
  if (e.job !== undefined && !SFX_JOBS.includes(e.job)) errors.push(`${id}: job "${e.job}" is not one of ${SFX_JOBS.join(", ")}`);
  if (e.intensity !== undefined && !SFX_INTENSITIES.includes(e.intensity)) errors.push(`${id}: intensity "${e.intensity}" is not one of ${SFX_INTENSITIES.join(", ")}`);
  if (e.useful_role !== undefined && !SFX_USEFUL_ROLES.includes(e.useful_role)) errors.push(`${id}: useful_role "${e.useful_role}" is not one of ${SFX_USEFUL_ROLES.join(", ")}`);
  if (e.family !== undefined) {
    const f = isObj(opts.families) ? opts.families : readSfxFamilies();
    if (!arr(f.families).some((x) => x.id === e.family)) errors.push(`${id}: family "${e.family}" is not in families.json`);
    else if (sfxFamilyOf(e, f) !== e.family) errors.push(`${id}: family "${e.family}" does not list pack "${e.pack}"`);
  }
  if (e.clean_onset !== undefined && !(isObj(e.clean_onset) && typeof e.clean_onset.clean === "boolean")) errors.push(`${id}: clean_onset must be {clean:boolean, ...}`);
  if (e.tail !== undefined && !(isObj(e.tail) && Number.isFinite(e.tail.trailing_s))) errors.push(`${id}: tail must carry numeric trailing_s`);
  if ((e.job !== undefined || e.intensity !== undefined) && !arr(e.estimated).includes("intensity") && e.intensity !== undefined) warnings.push(`${id}: intensity set but not labelled estimated`);
  checkAuditionClaim(e, id, e.sha256 || e.file || null, opts.evidence || readEvidence(opts.file).entries, errors);
  checkRights(e, id, errors, warnings);
  return { ok: !errors.length, errors, warnings };
}
