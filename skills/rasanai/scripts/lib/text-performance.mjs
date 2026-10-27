// Typography as a performer (W13): role-aware planning of glyph / word / line operations over text that stays real, logical text.
// It PLANS and VALIDATES. It renders nothing, calls no model and has no clock: every interval is seconds on the existing score (motion/score.json) and
// is checked against it when given. The operations map onto mechanics that already exist (RasanShape.split / followPath / morph / scatter and the three
// ops runtime/rasan-type.js adds); unknown capability stays "uncertain" and an operation that cannot be done safely is "unavailable" with the reason,
// never silently replaced by a crossfade dressed up as a morph.
//
// Logical text vs rendered fragments: a group's `logical.text` is the accessible reading (aria-label on the host, DOM order). Fragments are presentation
// only, and every planned op reports `logical_text_unchanged: true` plus the final reading order. Simple readable text keeps plain DOM/font rendering
// (no ops, nothing to plan); an op that needs glyph outlines (word_to_form, negative_space_reveal, counter_passage) is only offered when the font record
// says outlines exist AND rights are not restricted, and even then it is "uncertain" (contour compatibility is unproven until exercised under authorization).
//
// Roles: primary_reading | supporting_reading | texture | identity_asset | product_evidence | qualifier. Only `texture` is expendable. A protected group
// that gets a fragmenting op must name a `read` interval (score seconds) where its whole phrase stands legible, and no fragmenting op of that group may
// overlap that interval. Cropping, oversized or tiny type is not banned; the selected direction decides. Unassigned roles are treated as protected.
//
// States per op and overall (worst of): available | uncertain | unavailable. Error codes come from the shared taxonomy (stale_input,
// temporal_evidence_missing, capability_unavailable, material_deviation, not_assessable).
//
// Consumers (proposed wiring, not done here): the scene builder packet carries the planTextOps result for a text beat; the dependencyDigest joins the
// scene's input identity so a font or copy change invalidates it; the storyboard (W05) holds region_id/anchor_id/read references; W09 reviews the read intervals.
// Shares anchor/region IDs with lib/composition-anchors.mjs (same ID_RE; planAnchors result may be passed as `anchors` to verify them).
import fs from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { ID_RE, digestOf } from "./composition-anchors.mjs";
import { CREATIVE_ERROR_CODES as E } from "./creative-policy.mjs";

const typeRt = createRequire(import.meta.url)("../../runtime/rasan-type.js");

export const TEXT_ROLES = ["primary_reading", "supporting_reading", "texture", "identity_asset", "product_evidence", "qualifier"];
const PROTECTED = new Set(["primary_reading", "supporting_reading", "identity_asset", "product_evidence", "qualifier", "unassigned"]);
const STATE_RANK = { available: 0, uncertain: 1, unavailable: 2 };

// op -> { granularity: allowed fragment sizes, fragmenting: breaks the phrase while it runs, outline: needs glyph outlines, mechanics, roles that may not take it }
export const TEXT_OPS = {
  outline_fill_exchange: { granularity: ["chars", "words", "lines"], fragmenting: false, outline: false, mechanics: "RasanType.outlineFill (stroke stays, fill alpha is the progress)", forbid: [] },
  masked_fragment_reveal: { granularity: ["chars", "words", "lines"], fragmenting: false, outline: false, mechanics: "RasanShape.split + RasanType.maskReveal (clip-path inset per fragment)", forbid: [] },
  controlled_reorder: { granularity: ["chars", "words"], fragmenting: true, outline: false, mechanics: "RasanShape.split + RasanType.reorder (translate only; final state is the phrase)", forbid: ["identity_asset", "qualifier", "product_evidence"] },
  path_following: { granularity: ["chars", "words"], fragmenting: true, outline: false, mechanics: "RasanShape.followPath", forbid: ["identity_asset"] },
  repeated_field: { granularity: ["words", "lines"], fragmenting: true, outline: false, mechanics: "RasanShape.scatter / cloned spans; texture copies only, the read group stays separate", forbid: ["identity_asset", "qualifier", "product_evidence"] },
  word_to_form: { granularity: ["words", "chars"], fragmenting: true, outline: true, mechanics: "RasanShape.morph (flubber) between a glyph path and a form path; fallback masked_fragment_reveal", forbid: ["identity_asset"] },
  negative_space_reveal: { granularity: ["words", "lines"], fragmenting: true, outline: true, mechanics: "clip/mask from glyph outlines; no existing helper, scene-authored SVG mask", forbid: [] },
  counter_passage: { granularity: ["chars"], fragmenting: true, outline: true, mechanics: "scale/camera passage through an open counter; needs counter geometry and RasanCamera", forbid: [] },
  image_letter_overlap: { granularity: ["chars", "words"], fragmenting: false, outline: false, mechanics: "DOM blend / background-clip text; no existing helper, scene-authored", forbid: [] },
};
const UNEXERCISED = new Set(["negative_space_reveal", "counter_passage", "image_letter_overlap", "word_to_form"]);

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const arr = (v) => (Array.isArray(v) ? v : []);
const num = (v) => typeof v === "number" && Number.isFinite(v);
const err = (code, ref, message) => ({ code, ref, message });
const worst = (states) => states.reduce((a, s) => (STATE_RANK[s] > STATE_RANK[a] ? s : a), "available");

// copy: [{ id, text, lang?, dir?, role?, read?: [{start,end}] }] or { id: "text" }.  roles: { id: role } or [{ id, role }] (overrides copy[].role)
// -> { groups[], errors[], warnings[], digest }
export function projectTextRoles(copy, { roles = {} } = {}) {
  const errors = [], warnings = [];
  const items = Array.isArray(copy) ? copy : isObj(copy) ? Object.entries(copy).map(([id, text]) => ({ id, text })) : [];
  const rmap = Array.isArray(roles) ? Object.fromEntries(roles.filter(isObj).map((r) => [r.id, r.role])) : isObj(roles) ? roles : {};
  const groups = [], seen = new Set();
  items.forEach((it, order) => {
    if (!isObj(it) || !ID_RE.test(String(it.id))) { errors.push(err(E.stale_input, "copy", `text group id must match ${ID_RE}`)); return; }
    if (seen.has(it.id)) { errors.push(err(E.stale_input, it.id, "duplicate text group id")); return; }
    seen.add(it.id);
    if (typeof it.text !== "string" || !it.text.length) { errors.push(err(E.stale_input, it.id, "text group has no text")); return; }
    let role = rmap[it.id] !== undefined ? rmap[it.id] : it.role;
    if (role === undefined || role === null) { role = "unassigned"; warnings.push(`${it.id}: no role given; treated as protected`); }
    else if (!TEXT_ROLES.includes(role)) { errors.push(err(E.stale_input, it.id, `unknown role "${role}" (${TEXT_ROLES.join("|")})`)); return; }
    const info = typeRt.scriptInfo(it.text);
    const reads = arr(it.read).filter((r) => isObj(r) && num(r.start) && num(r.end) && r.end >= r.start).map((r) => ({ start: r.start, end: r.end, ...(r.allow === "distort" ? { allow: "distort" } : {}) }));
    groups.push({
      id: it.id, role, protected: PROTECTED.has(role), expendable: role === "texture",
      logical: { text: it.text, lang: it.lang || null, dir: it.dir || (info.rtl ? "rtl" : "ltr"), reading_order: order, script: info },
      protected_read_intervals: reads,
    });
  });
  const digest = digestOf(groups.map((g) => ({ id: g.id, role: g.role, text: g.logical.text, lang: g.logical.lang, dir: g.logical.dir, order: g.logical.reading_order, reads: g.protected_read_intervals })));
  return { groups, errors, warnings, digest };
}

// font = { family, weight?, style?, path?, sha256?, rights?: open|licensed|restricted|unknown, outline_source?: static-ttf|svg-paths|none, shaping?: browser-dom|... }
// -> { family, weight, style, file, sha256, sha256_source, rights, outline_source, shaping_method, state, identity_digest }
export function fontIdentity(font) {
  const f = isObj(font) ? font : {};
  let sha = typeof f.sha256 === "string" && /^[0-9a-f]{64}$/i.test(f.sha256) ? f.sha256.toLowerCase() : null, src = sha ? "declared" : null;
  if (!sha && f.path) { try { sha = createHash("sha256").update(fs.readFileSync(f.path)).digest("hex"); src = "computed"; } catch { /* unreadable stays unknown */ } }
  const id = {
    family: f.family || null, weight: f.weight || 400, style: f.style || "normal", file: f.path || null, sha256: sha, sha256_source: src,
    rights: f.rights || "unknown", outline_source: f.outline_source || "unknown", shaping_method: f.shaping || "browser-dom",
  };
  id.state = !id.family ? "unavailable" : sha && id.shaping_method === "browser-dom" ? "available" : "uncertain";
  id.identity_digest = digestOf({ family: id.family, weight: id.weight, style: id.style, sha256: id.sha256, rights: id.rights, outline_source: id.outline_source, shaping_method: id.shaping_method });
  return id;
}

const overlaps = (a, b) => a.start < b.end && b.start < a.end;

// Protected reading intervals as one list for the other lanes (optics protectedReads, attention protected_read, handoff holds).
// roles = projectTextRoles() result -> [{ id, ref, group_id, role, interval:{start,end}, basis:"score" }]. Only protected groups; ids are stable (`read:<group>:<n>`).
export function protectedReadsOf(roles) {
  const out = [];
  for (const g of arr(roles && roles.groups)) if (g.protected) arr(g.protected_read_intervals).forEach((r, i) => out.push({ id: `read:${g.id}:${i}`, ref: g.id, group_id: g.id, role: g.role, interval: { start: r.start, end: r.end }, basis: "score" }));
  return out;
}

// ops = [{ id, op, group_id, granularity?, anchor_id?, region_id?, interval: {start,end}, read?: {start,end}, params? }]
// roles = the projectTextRoles() result.  anchors = optional planAnchors() result (verifies anchor_id / region_id).  score = { duration } (optional).
// -> { ops[], fontIdentity, dependencyDigest, capabilityState, errors[], notes[] }
export function planTextOps({ roles, font, ops = [], anchors = null, score = null } = {}) {
  const errors = [], notes = [];
  const groups = Object.fromEntries(arr(roles && roles.groups).map((g) => [g.id, g]));
  const fid = fontIdentity(font);
  const dur = isObj(score) ? (num(score.duration) ? score.duration : num(score.duration_s) ? score.duration_s : null) : null;
  const known = anchors && anchors.ok ? new Set([...arr(anchors.regions).map((r) => r.id), ...arr(anchors.anchors).map((a) => a.id)]) : null;
  if (!roles || !arr(roles.groups).length) errors.push(err(E.stale_input, "roles", "planTextOps needs a projectTextRoles() result"));
  if (!dur) notes.push("no score duration given: intervals are not checked against the score (unknown stays unknown)");
  if (!known && ops.some((o) => o && (o.anchor_id || o.region_id))) notes.push("no anchor plan supplied: anchor_id/region_id are format-checked only");

  const planned = [];
  const byGroup = {};
  for (const o of arr(ops)) {
    const out = { id: o && o.id, op: o && o.op, group_id: o && o.group_id, status: "unavailable", reasons: [] };
    const bad = (code, msg) => { errors.push(err(code, out.id || "op", msg)); out.reasons.push(msg); };
    const spec = o && TEXT_OPS[o.op];
    const g = o && groups[o.group_id];
    if (!isObj(o) || !ID_RE.test(String(o.id))) { bad(E.stale_input, `op id must match ${ID_RE}`); planned.push(out); continue; }
    if (!spec) { bad(E.capability_unavailable, `unknown op "${o.op}" (${Object.keys(TEXT_OPS).join("|")})`); planned.push(out); continue; }
    if (!g) { bad(E.stale_input, `group "${o.group_id}" is not in the projected roles`); planned.push(out); continue; }
    for (const k of ["anchor_id", "region_id"]) {
      if (o[k] === undefined) continue;
      if (!ID_RE.test(String(o[k]))) bad(E.stale_input, `${k} must match ${ID_RE}`);
      else if (known && !known.has(o[k])) bad(E.stale_input, `${k} "${o[k]}" is not in the supplied anchor plan`);
    }
    const iv = o.interval;
    if (!isObj(iv) || !num(iv.start) || !num(iv.end) || iv.end < iv.start) bad(E.temporal_evidence_missing, "interval {start,end} in score seconds is required and may not be reversed");
    else if (dur && (iv.start < 0 || iv.end > dur)) bad(E.stale_input, `interval ${iv.start}..${iv.end} is outside the score (0..${dur})`);

    // script limits and granularity
    const gran = o.granularity || spec.granularity[spec.granularity.length > 1 && g.logical.script.charSplit === "unavailable" ? 1 : 0];
    let state = "available";
    if (!spec.granularity.includes(gran)) bad(E.capability_unavailable, `${o.op} supports ${spec.granularity.join("/")}, not "${gran}"`);
    const si = g.logical.script;
    if (gran === "chars" && si.charSplit === "unavailable") { bad(E.capability_unavailable, `per-character fragments are unsafe for this script (${si.notes.join("; ")}); use words or lines`); out.alternative = { granularity: spec.granularity.includes("words") ? "words" : "lines" }; }
    else if (gran === "chars" && si.charSplit === "uncertain") { state = "uncertain"; out.reasons.push(si.notes.join("; ")); }
    if ((gran === "words") && si.wordSplit === "uncertain") { state = "uncertain"; out.reasons.push("word fragments of this script unverified"); }
    if (o.op === "path_following" && (si.rtl || si.complex)) bad(E.capability_unavailable, "path-following per fragment would break shaping for this script");

    // role rules
    if (spec.forbid.includes(g.role)) bad(E.capability_unavailable, `${o.op} is not allowed on ${g.role} text (it must not be fragmented, repeated or reordered)`);
    const reads = arr(g.protected_read_intervals).slice();
    if (isObj(o.read) && num(o.read.start) && num(o.read.end)) reads.push({ start: o.read.start, end: o.read.end });
    if (g.protected && spec.fragmenting) {
      if (!reads.length) bad(E.temporal_evidence_missing, `${g.role} text needs a read interval (score seconds) where the whole phrase stands legible before ${o.op}`);
      else if (isObj(iv) && num(iv.start) && reads.some((r) => overlaps(iv, r))) bad(E.material_deviation, `${o.op} overlaps a protected read interval of ${g.id}`);
    }

    // distortion (additive): an op the caller marks `distorts` (crop, warp, scale past legibility) may not run inside a protected read unless that read says allow:"distort"
    if (g.protected && o.distorts === true && !spec.fragmenting && isObj(iv) && num(iv.start) && num(iv.end)) {
      const hit = reads.find((r) => overlaps(iv, r) && r.allow !== "distort");
      if (hit) bad(E.material_deviation, `${o.op} is marked distorting and overlaps a protected read interval of ${g.id}`);
    }

    // font and outline needs
    if (spec.outline) {
      if (fid.rights === "restricted") bad(E.capability_unavailable, "font rights are restricted: glyph outlines may not be extracted");
      else if (fid.outline_source === "none") { bad(E.capability_unavailable, "font has no outline source; use masked_fragment_reveal or a match-cut instead (disclose: not a morph)"); out.fallback = "masked_fragment_reveal"; }
      else { state = "uncertain"; out.reasons.push(fid.outline_source === "unknown" ? "outline source not declared" : "contour compatibility, counters and winding unproven"); if (fid.rights === "unknown") out.reasons.push("font rights unknown"); }
    }
    if (UNEXERCISED.has(o.op) && state === "available") state = "uncertain";
    if (UNEXERCISED.has(o.op)) out.reasons.push("not exercised in this repo yet; unknown until authorized evidence");
    if (fid.state === "unavailable") bad(E.stale_input, "font identity has no family");
    else if (fid.state === "uncertain" && state === "available") { state = "uncertain"; out.reasons.push("font file hash or shaping method not established, so layout across font load is unverified"); }

    const failed = errors.some((e) => e.ref === out.id);
    Object.assign(out, {
      role: g.role, granularity: gran, anchor_id: o.anchor_id || null, region_id: o.region_id || null, interval: isObj(iv) ? { start: iv.start, end: iv.end } : null,
      status: failed ? "unavailable" : state, mechanics: spec.mechanics, params: o.params || null,
      rendered: { kind: spec.outline ? "dom-fragments+svg-path" : "dom-fragments", granularity: gran },
      distorts: o.distorts === true, logical_text_unchanged: true, final_reading_order: g.logical.reading_order, read_intervals: reads,
    });
    (byGroup[g.id] = byGroup[g.id] || []).push(out);
    planned.push(out);
  }
  // two fragmenting ops of one group may not run at once (one owner per text action)
  for (const list of Object.values(byGroup)) {
    const fr = list.filter((p) => TEXT_OPS[p.op].fragmenting && p.interval && p.status !== "unavailable");
    for (let i = 0; i < fr.length; i++) for (let j = i + 1; j < fr.length; j++) if (overlaps(fr[i].interval, fr[j].interval)) {
      errors.push(err(E.material_deviation, fr[j].id, `${fr[i].id} and ${fr[j].id} fragment the same group at the same time`)); fr[j].status = "unavailable"; fr[j].reasons.push("overlaps another fragmenting op on this group");
    }
  }

  const capabilityState = errors.some((e) => e.code === E.stale_input && !planned.length) ? "unavailable" : worst([fid.state === "unavailable" ? "unavailable" : "available", ...planned.map((p) => p.status)]);
  const dependencyDigest = digestOf({
    font: fid.identity_digest, roles: roles && roles.digest,
    ops: planned.map((p) => ({ id: p.id, op: p.op, group: p.group_id, gran: p.granularity, anchor: p.anchor_id, region: p.region_id, interval: p.interval, status: p.status, reads: p.read_intervals })),
    anchors: anchors && anchors.digest ? anchors.digest : null,
  });
  return { ops: planned, fontIdentity: fid, dependencyDigest, capabilityState, errors, notes };
}
