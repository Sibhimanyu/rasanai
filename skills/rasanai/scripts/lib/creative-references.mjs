// Automatic visual precedents (Plan 01 contract B): pick up to four useful references for a new film from library/creative-reference-index.json.
// Pure and deterministic: no fs, no network, no media processing, no model. The lead reads the index, the run's available media and the
// user's own references, calls selectCreativeReferences(), and maps permitted stills into frames/refs.json (frames-lib.collectRefs stays the collector).
// Evidence is stated, never assumed: a row with no lawful media is a text description, and descriptions never certify visual parity.
import { createHash } from "node:crypto";

const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);
const str = (x, d = "") => (typeof x === "string" ? x : d);
const lc = (x) => str(x).trim().toLowerCase();
const tagsOf = (x) => arr(x).map(lc).filter(Boolean);

export const REFERENCE_KINDS = Object.freeze(["professional-case", "technique", "original-example", "local-breakdown"]);
// How much a row can support. Only "visual" (lawful, present media) lets a juror compare pictures; the rest are words or unreviewed sources.
export const EVIDENCE_LEVELS = Object.freeze(["source-description", "technique-data", "local-breakdown", "original-unreviewed", "visual"]);
export const MEDIA_SCOPES = Object.freeze(["reference-only"]);
// What the whole selection supports, best first.
export const SELECTION_EVIDENCE = Object.freeze(["visual", "original-source", "text-only", "none"]);

const SHA = /^[0-9a-f]{64}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
// Roles that may be handed pictures; writers and critics of words get principles only.
const VISUAL_ROLES = new Set(["styleframe-designer", "frame-juror", "builder", "scene-animator", "motion-director", "look-designer"]);

function rowsOf(index) {
  if (Array.isArray(index)) return index;
  return isObj(index) ? arr(index.entries) : [];
}

// A stable 0..1 tie-break from seed+id: the seed never outranks a score, it only orders equals.
function tieBreak(seed, id) {
  const h = createHash("sha256").update(`${seed}:${id}`).digest();
  return h.readUInt32BE(0) / 0xffffffff;
}

function mediaOk(m) {
  return isObj(m) && str(m.path) && SHA.test(str(m.sha256)) && str(m.rights_basis).trim() && MEDIA_SCOPES.includes(m.scope);
}

// ---------------------------------------------------------------- validation
// Authored capability, not run during implementation. allowedRoots: path prefixes a media path may sit under (string check; no fs).
export function validateReferenceIndex(index, { allowedRoots = [] } = {}) {
  const errors = [], warnings = [];
  const err = (code, path, message) => errors.push({ code, path, message });
  const warn = (code, path, message) => warnings.push({ code, path, message });
  const rows = rowsOf(index);
  if (!rows.length) { err("index.empty", "$", "the index has no entries"); return { ok: false, errors, warnings }; }
  const ids = new Set();
  rows.forEach((r, i) => {
    const p = `entries[${i}]`;
    if (!isObj(r)) return err("row.shape", p, "a row is an object");
    if (!/^[a-z0-9][a-z0-9-]*$/.test(str(r.id))) err("row.id", `${p}.id`, "id is a lowercase slug");
    else if (ids.has(r.id)) err("row.id.duplicate", `${p}.id`, `duplicate id ${r.id}`);
    else ids.add(r.id);
    if (!REFERENCE_KINDS.includes(r.kind)) err("row.kind", `${p}.kind`, `kind is one of ${REFERENCE_KINDS.join(", ")}`);
    if (!EVIDENCE_LEVELS.includes(r.evidence_level)) err("row.evidence", `${p}.evidence_level`, `evidence_level is one of ${EVIDENCE_LEVELS.join(", ")}`);
    if (!str(r.principle).trim()) err("row.principle", `${p}.principle`, "principle is an original summary of what to learn");
    for (const f of ["format_tags", "shot_tags", "avoid_copying"]) if (!Array.isArray(r[f])) err("row.array", `${p}.${f}`, `${f} is an array`);
    if (!arr(r.avoid_copying).length) warn("row.avoid", `${p}.avoid_copying`, "say what must not be copied");
    if (!DATE.test(str(r.verified_at))) err("row.verified", `${p}.verified_at`, "verified_at is YYYY-MM-DD");
    const url = str(r.source_url), local = str(r.local_ref);
    if (!/^https:\/\//.test(url) && !local) err("row.source", `${p}.source_url`, "source_url is https, or local_ref names a path inside the skill");
    if (local && (local.startsWith("/") || local.split("/").includes(".."))) err("row.local_ref", `${p}.local_ref`, "local_ref is relative and stays inside the skill");
    const media = arr(r.media);
    media.forEach((m, j) => {
      const mp = `${p}.media[${j}]`;
      if (!isObj(m)) return err("media.shape", mp, "media is an object");
      const mpath = str(m.path);
      if (!mpath || mpath.startsWith("/") || mpath.split("/").includes("..")) err("media.path", `${mp}.path`, "media path is relative and stays inside an allowed root");
      else if (allowedRoots.length && !allowedRoots.some((root) => mpath === root || mpath.startsWith(root.replace(/\/?$/, "/")))) err("media.root", `${mp}.path`, "media path is outside the allowed roots");
      if (!SHA.test(str(m.sha256))) err("media.sha256", `${mp}.sha256`, "the full 64-hex sha256 is required");
      if (!str(m.rights_basis).trim()) err("media.rights", `${mp}.rights_basis`, "name the specific permission or licence; public availability is not permission");
      if (!MEDIA_SCOPES.includes(m.scope)) err("media.scope", `${mp}.scope`, `scope is ${MEDIA_SCOPES.join(" | ")}`);
    });
    if (r.evidence_level === "visual" && !media.some(mediaOk)) err("row.visual", `${p}.evidence_level`, "visual evidence needs at least one lawful media entry");
    if (r.evidence_level !== "visual" && media.length) warn("row.media", `${p}.media`, "media is listed but evidence_level is not visual");
    if (r.kind === "original-example" && r.evidence_level !== "original-unreviewed" && r.evidence_level !== "visual") warn("row.original", `${p}.evidence_level`, "an unrendered original is original-unreviewed");
  });
  return { ok: errors.length === 0, errors, warnings };
}

// ---------------------------------------------------------------- selection
// Which of a row's media can actually be shown: lawful per the index and present in what the run has (matched by sha256, else path).
function usableMedia(row, availableMedia) {
  const have = arr(availableMedia).filter(isObj);
  if (!have.length) return [];
  return arr(row.media).filter(mediaOk).filter((m) => have.some((a) => lc(a.sha256) === lc(m.sha256) || (a.path && a.path === m.path)));
}

function wants(assignment, story, look) {
  const a = isObj(assignment) ? assignment : {};
  const s = isObj(story) ? story : {};
  const l = isObj(look) ? look : {};
  return {
    kind: lc(a.communication_kind || a.kind || s.communication_kind),
    format: lc(a.format || a.tile),
    shots: tagsOf([...arr(a.shot_kinds), ...arr(a.shotKinds), ...arr(s.shot_kinds)]),
    tags: tagsOf([...arr(a.tags), ...arr(s.tags), ...arr(l.tags)]),
    avoid: tagsOf([...arr(a.avoid), ...arr(a.avoid_tags), ...arr(l.avoid), ...arr(l.avoid_tags)]),
    runtimes: tagsOf([...arr(a.runtime_families), ...arr(l.runtime_families)]),
    // no references wanted at all: a real choice by the user, honoured, not an error
    none: a.references === false || a.no_references === true,
  };
}

function scoreRow(row, w, media) {
  const reasons = [];
  let score = 0;
  const fmt = tagsOf(row.format_tags), shots = tagsOf(row.shot_tags), kinds = tagsOf(row.comm_kinds);
  // 1. communication task before aesthetics
  const kindHit = w.kind && kinds.includes(w.kind);
  const fmtHit = (w.format && fmt.includes(w.format)) || (w.kind && fmt.includes(w.kind));
  if (kindHit) { score += 40; reasons.push(`same communication task (${w.kind})`); }
  if (fmtHit) { score += 24; reasons.push("same format"); }
  // 2. the shots this film needs
  const shotHits = shots.filter((t) => w.shots.includes(t));
  if (shotHits.length) { score += Math.min(3, shotHits.length) * 8; reasons.push(`shot purpose: ${shotHits.join(", ")}`); }
  const tagHits = [...new Set([...fmt, ...shots])].filter((t) => w.tags.includes(t));
  if (tagHits.length) { score += Math.min(2, tagHits.length) * 4; reasons.push(`brief tags: ${tagHits.join(", ")}`); }
  // 3. brand / medium compatibility
  if (w.runtimes.length && row.runtime_family) {
    if (w.runtimes.includes(lc(row.runtime_family))) { score += 4; reasons.push(`runs on ${row.runtime_family}`); } else score -= 6;
  }
  // 4. a picture beats a description; an unreviewed original beats nothing
  if (media.length) { score += 10; reasons.push("lawful visual input available"); }
  else if (row.evidence_level === "original-unreviewed") score += 2;
  return { score, reasons, kindHit, fmtHit, shotHits };
}

export function selectCreativeReferences({ index, assignment, story = null, look = null, userReferences = [], availableMedia = [], seed = 0, limit = 4 } = {}) {
  const w = wants(assignment, story, look);
  const cap = Math.max(0, Math.min(4, Number.isFinite(limit) ? Math.floor(limit) : 4));
  const selected = [], unavailable = [], taken = new Set();
  if (w.none || !cap) return { selected, unavailable, evidenceLevel: "none" };

  // The user's own references win outright (they carry their own permission); limit to leave room for one same-format example.
  const users = arr(userReferences).filter((u) => isObj(u) || str(u));
  users.slice(0, Math.max(1, cap - 1)).forEach((u, i) => {
    const o = isObj(u) ? u : { path: u };
    const id = str(o.id) || `user-ref-${i + 1}`;
    const ref = str(o.path || o.file || o.url);
    taken.add(id);
    selected.push({
      id, score: 1000 - i, reasons: ["the user supplied this reference"],
      transferable: [str(o.principle) || "what the user pointed at: the feel they want, in their words"],
      notTransferable: ["the exact scenes, logo, music or media unless the user owns or licensed them"],
      mediaRefs: ref ? [{ path: ref, sha256: str(o.sha256) || null, rights_basis: "supplied by the user", scope: "reference-only" }] : [],
      kind: "user", evidence_level: ref && !/^https?:/.test(ref) ? "visual" : "source-description", shot_tags: [],
    });
  });

  const rows = rowsOf(index).filter((r) => isObj(r) && str(r.id));
  const ranked = [];
  for (const row of rows) {
    if (taken.has(row.id)) continue;
    const banned = tagsOf(row.not_for_kinds);
    if (w.kind && banned.includes(w.kind)) { unavailable.push({ id: row.id, reason: `not proof for a ${w.kind} film` }); continue; }
    const clash = [...tagsOf(row.format_tags), ...tagsOf(row.shot_tags), ...tagsOf(row.look_tags)].filter((t) => w.avoid.includes(t));
    if (clash.length) { unavailable.push({ id: row.id, reason: `conflicts with the brand or look: ${clash.join(", ")}` }); continue; }
    const media = usableMedia(row, availableMedia);
    const s = scoreRow(row, w, media);
    if (s.score <= 0 && !s.reasons.length) { unavailable.push({ id: row.id, reason: "no match for this film's task or shots" }); continue; }
    ranked.push({ row, media, ...s, tie: tieBreak(seed, row.id) });
  }
  const order = (a, b) => b.score - a.score || a.tie - b.tie || (a.row.id < b.row.id ? -1 : 1);
  ranked.sort(order);

  const push = (r) => {
    if (selected.length >= cap || taken.has(r.row.id)) return false;
    taken.add(r.row.id);
    const row = r.row;
    selected.push({
      id: row.id, score: r.score, reasons: r.reasons.length ? r.reasons : ["general craft principle"],
      transferable: [str(row.principle)].filter(Boolean),
      notTransferable: arr(row.avoid_copying).map(String),
      mediaRefs: r.media.map((m) => ({ path: m.path, sha256: m.sha256, rights_basis: m.rights_basis, scope: m.scope })),
      kind: row.kind, evidence_level: r.media.length ? "visual" : str(row.evidence_level), shot_tags: tagsOf(row.shot_tags),
    });
    return true;
  };
  // 1-2 same-format / same-task examples (not technique rows), then one contrasting principle (technique, or a shot kind nothing chosen covers yet).
  const same = ranked.filter((r) => (r.kindHit || r.fmtHit) && r.row.kind !== "technique");
  let sameTaken = 0;
  for (const r of same) { if (sameTaken >= 2 || selected.length >= cap) break; if (push(r)) sameTaken++; }
  const covered = () => new Set(selected.flatMap((s) => s.shot_tags));
  const contrast = ranked.find((r) => !taken.has(r.row.id) && (r.row.kind === "technique" || tagsOf(r.row.shot_tags).some((t) => !covered().has(t))));
  if (contrast) push(contrast);
  for (const r of ranked) if (selected.length < cap) push(r);

  // Anything ranked but not chosen is simply not needed; report why so the Director can see the shortlist was a choice.
  for (const r of ranked) if (!taken.has(r.row.id)) unavailable.push({ id: r.row.id, reason: "ranked below the limit" });

  const visual = selected.some((s) => s.mediaRefs.length && s.evidence_level === "visual");
  const original = selected.some((s) => s.kind === "original-example");
  const evidenceLevel = !selected.length ? "none" : visual ? "visual" : original ? "original-source" : "text-only";
  return { selected, unavailable, evidenceLevel };
}

// ---------------------------------------------------------------- packet for one role / shot
// Words for everyone; pictures only for roles that look at pictures, only lawful ones, only the shots that match. Limitations are always stated.
export function referencePacket(selection, { role, shotKind = null } = {}) {
  const sel = isObj(selection) ? selection : {};
  let items = arr(sel.selected);
  const kind = lc(shotKind);
  if (kind) {
    const fit = items.filter((s) => arr(s.shot_tags).map(lc).includes(kind) || s.kind === "user");
    // keep the user's picks and what fits this shot; if nothing fits, the two best overall (never an empty brief)
    items = fit.length ? fit : items.slice(0, 2);
  }
  const principles = items.map((s) => ({ id: s.id, principle: arr(s.transferable)[0] || "", avoid: arr(s.notTransferable), why: arr(s.reasons) }));
  const visualInputs = VISUAL_ROLES.has(lc(role)) ? items.flatMap((s) => arr(s.mediaRefs).map((m) => ({ source_id: s.id, ...m }))) : [];
  const limitations = [];
  const level = sel.evidenceLevel || "none";
  if (level === "none") limitations.push("No reference was selected. Work from the brief and the approved Look; do not ask the user for inspiration.");
  if (level === "text-only") limitations.push("References are source descriptions only: no pictures were available or licensed. They teach a principle; they do not show what good looks like and cannot certify visual parity.");
  if (level === "original-source") limitations.push("The nearest references are unreviewed original sources and descriptions, not rendered films. Treat them as teaching, not as a quality bar.");
  if (level === "visual") limitations.push("Pictures are reference-only: learn the principle, never copy the scene, logo, music or media.");
  if (items.some((s) => s.kind === "technique")) limitations.push("Technique rows are craft ideas, not evidence of visual quality.");
  if (VISUAL_ROLES.has(lc(role)) && !visualInputs.length && items.length) limitations.push("No lawful image is attached for this shot; do not claim a visual comparison.");
  return { principles, visualInputs, limitations, sourceIds: items.map((s) => s.id) };
}
