// Adapted from cooked. (MIT, Copyright (c) 2026 NextWork), plugins/creator-teardown/skills/creator-teardown/scripts/format_check.py features/_within/diffs/name/group L58-L206 @3b236ec; ported to Node and modified by RasanAI. Credit: third_party/cooked/.
// Also adapted from match.py near/rules L163-L248 @3b236ec (tolerance rows and `near`), ported to Node and modified by RasanAI.
// Reference DNA: group measured references by format, drop outliers, aggregate medians with confidence, compare a draft.
// The profile carries editing measurements only: no palette, type, logo or footage.
import { sha1OfJSON } from "./fingerprint.mjs";

export const PROFILE_SCHEMA = "rasanai.reference-profile.v1";
export const REFPROFILE_VERSION = "refprofile@1";

// Upstream constants (format_check.py L58-L67). SCREEN_TEXT replaces upstream's graphics share: percent of samples
// with non-caption on-screen text (reflook text_share).
export const FMT = { FACE_PCT: 50, SCREEN_FACE: 30, SCREEN_TEXT: 50, SPLIT_FACE_Y: 62, SIDE_SHARE: 0.2, WORDS_DIFF: 1, WORDS_X: 2.0, Y_POINTS: 15, SIZE_X: 1.5, SHOT_X: 2.5, LENGTH_X: 3.0, SHOT_SLOW: 4.0, MIN_KEPT: 3 };
const SPLIT_TEXT = 30; // upstream SPLIT_GFX

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const r2 = (v) => (v == null ? v : Math.round(v * 100) / 100);

// ---------- format features ----------
export function formatFeatures(numbers) {
  const N = numbers || {}, look = N.look || null;
  const face = (look && look.face) || {};
  const cap = look ? look.captions : null;
  const tshare = num(look && look.text_share) ?? 0;
  const fp = num(face.present_pct);
  const [w, h] = Array.isArray(N.size) ? N.size : [0, 0];
  let frame;
  if (w > h) frame = "16:9";
  else if (fp && (num(face.y_pct) || 0) >= FMT.SPLIT_FACE_Y && tshare >= SPLIT_TEXT) frame = "split";
  else frame = (w || look) ? "full" : null;
  const xs = ((look && look.face_x_samples) || []).filter((x) => typeof x === "number");
  const two = xs.length >= 10 && Math.min(xs.filter((x) => x < 0.4).length, xs.filter((x) => x > 0.6).length) >= FMT.SIDE_SHARE * xs.length;
  const kind = fp == null ? null : two ? "two people" : fp >= FMT.FACE_PCT ? "talking head"
    : fp <= FMT.SCREEN_FACE && tshare >= FMT.SCREEN_TEXT ? "screen recording" : "b-roll";
  let captions;
  if (cap == null) captions = null;           // no OCR engine: unknown, matches anything
  else if (!cap || cap.present === false) captions = false;
  else if (cap.present == null) captions = null;
  else captions = { words: num(cap.words_per_caption), y: num(cap.y_pct), size: num(cap.size_pct), upper: cap.case === "upper" };
  return { id: N.id ?? N.source ?? N.fingerprint ?? null, frame, kind, captions,
    shot_s: num(N.shots && N.shots.median_s), length_s: num(N.duration_s) };
}

const within = (a, b, x) => !a || !b || Math.max(a, b) <= x * Math.min(a, b); // null or 0: not measured, matches
const KIND_WORDS = { "talking head": "a talking head", "two people": "two people", "screen recording": "a screen recording", "b-roll": "b-roll" };

// How f differs from the group's seed, in plain words. Empty: same format.
export function formatDiffs(a, b) {
  const out = [];
  if (a.frame && b.frame && a.frame !== b.frame) out.push(`${b.frame} frame, not ${a.frame}`);
  if (a.kind && b.kind && a.kind !== b.kind) out.push(`${KIND_WORDS[b.kind]}, not ${KIND_WORDS[a.kind]}`);
  const ca = a.captions, cb = b.captions;
  if (ca != null && cb != null) {
    if (Boolean(ca) !== Boolean(cb)) out.push(!cb ? "no captions" : "captions where the others have none");
    else if (ca && cb) {
      const wa = ca.words, wb = cb.words;
      if (wa != null && wb != null && Math.abs(wa - wb) > FMT.WORDS_DIFF && !within(wa, wb, FMT.WORDS_X)) out.push(`${wb} word${wb !== 1 ? "s" : ""} a caption, not ${wa}`);
      if (ca.y != null && cb.y != null && Math.abs(ca.y - cb.y) > FMT.Y_POINTS) out.push(`captions at ${Math.round(cb.y)}% height, not ${Math.round(ca.y)}%`);
      if (!within(ca.size, cb.size, FMT.SIZE_X)) out.push(`caption size ${cb.size}%, not ${ca.size}%`);
      if (ca.upper !== cb.upper) out.push(cb.upper ? "upper-case captions" : "captions not in upper case");
    }
  }
  if (!within(a.shot_s, b.shot_s, FMT.SHOT_X) && Math.min(a.shot_s, b.shot_s) < FMT.SHOT_SLOW) out.push(`shots ${b.shot_s} s, not ${a.shot_s} s`);
  if (!within(a.length_s, b.length_s, FMT.LENGTH_X)) out.push(`${Math.round(b.length_s)} s long, not ${Math.round(a.length_s)} s`);
  return out;
}

// A format in plain words, e.g. "talking-head videos with short caption lines".
function formatName(f) {
  const kind = { "talking head": "talking-head videos", "two people": "two-person videos", "screen recording": "screen recordings", "b-roll": "b-roll videos" }[f.kind] || "videos";
  const frame = { "16:9": " in 16:9", split: " in split screen" }[f.frame] || "";
  const c = f.captions;
  let caps = "";
  if (c === false) caps = ", no captions";
  else if (c) {
    const w = c.words || 0;
    caps = w <= 2 ? " with word captions" : w <= 5 ? " with short caption lines" : " with sentence captions";
    if (c.upper) caps = caps.replace(" with ", " with upper-case ");
  }
  return kind + frame + caps;
}
const FEATURES = ["frame", "kind", "captions", "shot_s", "length_s"];
const measured = (r) => FEATURES.filter((k) => r[k] != null).length;

export function groupFormats(rows) {
  const seen = new Set(), uniq = [];
  for (const r of rows || []) if (!seen.has(r.id)) { seen.add(r.id); uniq.push(r); }
  // Seeds: most measured first (an unmeasured feature matches anything, so it must not seed), then input order.
  const sorted = uniq.map((r, i) => [r, i]).sort((x, y) => measured(y[0]) - measured(x[0]) || x[1] - y[1]).map((x) => x[0]);
  const groups = [];
  for (const r of sorted) {
    const g = groups.find((g) => !formatDiffs(g[0], r).length);
    if (g) g.push(r); else groups.push([r]);
  }
  let best = [];
  for (const g of groups) if (g.length > best.length) best = g; // first wins on a full tie
  for (const g of groups) { // matching the seed is not transitive: a row that matches the kept seed joins it
    if (g === best) continue;
    const join = g.filter((r) => !formatDiffs(best[0], r).length);
    best.push(...join);
    const rest = g.filter((r) => formatDiffs(best[0], r).length);
    g.length = 0; g.push(...rest);
  }
  const live = groups.filter((g) => g.length);
  live.sort((x, y) => (y === best) - (x === best) || y.length - x.length);
  const label = (g) => formatName(g.find((r) => measured(r) === FEATURES.length) || g[0]);
  const left_out = live.filter((g) => g !== best).flat().map((r) => ({ id: r.id, why: `${formatName(r)} (${formatDiffs(best[0], r).join("; ")})` }));
  const n = uniq.length, k = best.length, fmt = best.length ? label(best) : "videos";
  const consistent = k > n / 2;
  const applied = consistent && k >= FMT.MIN_KEPT;
  let line;
  if (!left_out.length) line = n > 1 ? `All ${n} videos share one format: ${fmt}.` : n === 1 ? `One video: ${fmt}.` : "No videos.";
  else if (applied) line = `Using ${k} of ${n}: ${n - k} look like a different format. The profile copies their ${fmt}.`;
  else if (consistent) line = `Too few videos to pick one format (${k} of ${n} match): the profile uses all ${n}. More videos of one kind give a truer profile.`;
  else line = `These ${n} videos are edited in different ways, so the profile mixes them. ${k > 1 ? `${k} of them are ${fmt}. ` : ""}More videos edited the same way give a truer profile.`;
  return { consistent, applied, groups: live.map((g) => ({ name: label(g), ids: g.map((r) => r.id) })), kept: best.map((r) => r.id), left_out, line };
}

// ---------- aggregate ----------
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
const median = (a) => pct(a, 0.5);
const mode = (a) => { const c = new Map(); for (const x of a) c.set(x, (c.get(x) || 0) + 1); let best = null, bn = 0; for (const [k, v] of c) if (v > bn) { best = k; bn = v; } return best; };
const dig = (o, path) => path.split(".").reduce((x, k) => (x == null ? undefined : x[k]), o);
const idOf = (n) => n.id ?? n.source ?? n.fingerprint;

// key -> [method, extractor(numbers) -> number | string | null, kind "num" | "cat"]
const METRICS = {
  median_shot_s: ["robust cuts, median", (n) => num(dig(n, "shots.median_s")), "num"],
  cuts_per_min: ["robust cuts, median", (n) => num(dig(n, "cuts.per_min")), "num"],
  jump_cut_share: ["cut kinds, median", (n) => num(dig(n, "kinds.kind_share.jump")), "num"],
  punch_zooms_per_min: ["zoom detector, median", (n) => num(dig(n, "kinds.zoom.per_min")), "num"],
  punch_scale: ["zoom detector, median", (n) => num(dig(n, "kinds.zoom.scale")), "num"],
  zoom_on: ["zoom detector, most common", (n) => dig(n, "kinds.zoom.on") || null, "cat"],
  push_per_min: ["zoom detector, median", (n) => { const z = dig(n, "kinds.zooms"); const d = num(n.duration_s); return Array.isArray(z) && d ? z.filter((x) => x.kind === "push").length / (d / 60) : null; }, "num"],
  wpm: ["transcript, median", (n) => num(dig(n, "kinds.speech.wpm")), "num"],
  max_pause_s: ["transcript, median", (n) => num(dig(n, "kinds.speech.max_pause_s")), "num"],
  caption_present_share: ["share of references with captions", (n) => { const c = dig(n, "look.captions"); return c == null ? null : c && c.present !== false ? 1 : 0; }, "num"],
  caption_words_per_unit: ["on-screen text, median", (n) => num(dig(n, "look.captions.words_per_caption")), "num"],
  caption_y_pct: ["on-screen text, median", (n) => num(dig(n, "look.captions.y_pct")), "num"],
  caption_size_pct: ["on-screen text, median", (n) => num(dig(n, "look.captions.size_pct")), "num"],
  caption_case: ["on-screen text, most common", (n) => dig(n, "look.captions.case") || null, "cat"],
  face_present_pct: ["face samples, median", (n) => num(dig(n, "look.face.present_pct")), "num"],
  face_y_pct: ["face samples, median", (n) => num(dig(n, "look.face.y_pct")), "num"],
  face_height_pct: ["face samples, median", (n) => num(dig(n, "look.face.height_pct")), "num"],
  framing: ["face samples, most common", (n) => dig(n, "look.face.framing") || null, "cat"],
  still_share: ["frame energy, median", (n) => num(dig(n, "energy.still_share")), "num"],
  dominant_curve: ["motion curves, most common", (n) => dig(n, "motion.dominant_family") || null, "cat"],
};
export const METRIC_KEYS = Object.keys(METRICS);

export function aggregate(numbersList, keptIds, { applied = false } = {}) {
  const keep = keptIds ? new Set(keptIds) : null;
  const list = (numbersList || []).filter((n) => !keep || keep.has(idOf(n)));
  const out = {};
  for (const [key, [method, get, kind]] of Object.entries(METRICS)) {
    const vals = list.map((n) => [idOf(n), get(n)]).filter(([, v]) => v != null);
    const n = vals.length;
    if (!n) { out[key] = { value: null, n: 0, spread: null, method, confidence: "unmeasured", sources: [] }; continue; }
    const v = vals.map((x) => x[1]);
    out[key] = {
      value: kind === "num" ? r2(median(v)) : mode(v), n,
      spread: kind === "num" && n >= 2 ? [r2(pct(v, 0.25)), r2(pct(v, 0.75))] : null,
      method, confidence: n >= 3 && applied ? "high" : "low", sources: vals.map((x) => x[0]),
    };
  }
  return out;
}

// ---------- profile ----------
const WHY_UNMEASURED = {
  median_shot_s: "no shot data", cuts_per_min: "no cut data", jump_cut_share: "no cut kinds", punch_zooms_per_min: "no zoom data",
  punch_scale: "no punch zooms found", zoom_on: "no punch zooms found", push_per_min: "no zoom data",
  wpm: "no transcript", max_pause_s: "no transcript",
  caption_present_share: "no on-screen text reading", caption_words_per_unit: "no captions found", caption_y_pct: "no captions found",
  caption_size_pct: "no on-screen text found", caption_case: "no captions found",
  face_present_pct: "no face reading", face_y_pct: "no face reading", face_height_pct: "no face reading", framing: "no face reading",
  still_share: "no energy data", dominant_curve: "no motion data",
};

export function buildProfile({ refs, numbersById, previous = null }) {
  const nb = numbersById || {};
  const readable = (refs || []).filter((r) => r.included !== false && nb[r.id]);
  const rows = readable.map((r) => ({ ...formatFeatures(nb[r.id]), id: r.id }));
  const fmt = groupFormats(rows);
  const useIds = fmt.applied ? fmt.kept : rows.map((r) => r.id);
  const why = new Map(fmt.applied ? fmt.left_out.map((l) => [l.id, l.why]) : []);
  const byRow = new Map(rows.map((r) => [r.id, r]));
  const numbers = readable.map((r) => ({ ...nb[r.id], id: r.id }));
  const metrics = aggregate(numbers, useIds, { applied: fmt.applied });
  const fps = (refs || []).map((r) => r.fingerprint).filter(Boolean).sort();
  const first = numbers.find((n) => n.analysis_version);
  const warnings = [];
  if (readable.length < FMT.MIN_KEPT) warnings.push(`${readable.length} readable reference${readable.length === 1 ? "" : "s"}: confidence stays low (3 to 6 references of one kind give a usable profile).`);
  else if (!fmt.applied) warnings.push("The references are mixed or too few of one format: every reading is low confidence.");
  const unmeasured = METRIC_KEYS.filter((k) => metrics[k].confidence === "unmeasured").map((k) => `${k}: ${WHY_UNMEASURED[k]}`);
  return {
    schema: PROFILE_SCHEMA,
    id: "ref-" + sha1OfJSON(fps).slice(0, 8),
    created: new Date().toISOString(),
    measured_with: { deconstruct: (first && first.analysis_version) || null, refprofile: REFPROFILE_VERSION },
    references: (refs || []).map((r) => {
      const row = byRow.get(r.id);
      const unread = r.included === false || !nb[r.id];
      const out = !unread && !useIds.includes(r.id);
      return {
        id: r.id, file: r.file, fingerprint: r.fingerprint || null,
        format: row ? formatName(row) : null,
        included: !unread && !out,
        why_left_out: unread ? (r.why_left_out || "could not be read") : out ? why.get(r.id) || "differs from the kept format" : null,
        rights: r.rights || "analysis_only",
        numbers: r.fingerprint ? `refs/${r.fingerprint}.numbers.json` : null,
      };
    }),
    format: { consistent: fmt.consistent, applied: fmt.applied, line: fmt.line, groups: fmt.groups },
    metrics,
    qualitative: (previous && previous.qualitative) || {},
    outliers: fmt.applied ? fmt.left_out.map((l) => ({ id: l.id, why: l.why })) : [],
    unmeasured, warnings,
    style_overrides: (previous && previous.style_overrides) || {},
  };
}

// Override if present, else the measured value when confidence is not "unmeasured", else null.
export function effectiveMetric(profile, key) {
  const o = profile && profile.style_overrides;
  if (o && Object.prototype.hasOwnProperty.call(o, key) && o[key] != null) return o[key];
  const m = profile && profile.metrics && profile.metrics[key];
  return m && m.confidence !== "unmeasured" && m.value != null ? m.value : null;
}

export function profileMarkdown(profile) {
  const P = profile, L = [];
  const refs = P.references || [], kept = refs.filter((r) => r.included), out = refs.filter((r) => !r.included);
  L.push(`# Reference profile ${P.id}`, "");
  L.push("## What was measured", "");
  L.push(`${refs.length} reference${refs.length === 1 ? "" : "s"} were measured once each with the same tools used on drafts (${(P.measured_with && P.measured_with.deconstruct) || "deconstruct"}, ${REFPROFILE_VERSION}). Only editing habits are kept: shot length, cut kinds, zoom punches, speech pace, caption density and face framing. No palette, type, logo or footage is stored.`, "");
  const m = P.metrics || {};
  for (const k of METRIC_KEYS) if (m[k] && m[k].confidence !== "unmeasured") L.push(`- ${k}: ${m[k].value}${m[k].spread ? ` (middle half ${m[k].spread[0]} to ${m[k].spread[1]})` : ""}, ${m[k].n} reference${m[k].n === 1 ? "" : "s"}, ${m[k].confidence} confidence.`);
  L.push("", "## Which references counted", "", (P.format && P.format.line) || "", "");
  for (const r of kept) L.push(`- Counted: ${r.id} (${r.format || "format unknown"}), ${r.file}`);
  for (const r of out) L.push(`- Left out: ${r.id}, ${r.why_left_out}. ${r.file}`);
  L.push("", "## What could not be measured", "");
  if ((P.unmeasured || []).length) for (const u of P.unmeasured) L.push(`- ${u}`); else L.push("- Everything was measured.");
  for (const w of P.warnings || []) L.push(`- Note: ${w}`);
  L.push("", "## How it is used", "");
  L.push("The motion score gets a Reference DNA section (median shot, zoom punches, caption density), and a reel takes its caption group size from here when it points at this profile. It is a guide, not a metronome: the brief, the product truth and any brand film grammar weigh more, and no interval is ever turned into a fixed beat. `profile-compare` re-measures a draft and reports differences as warnings only.", "");
  L.push("## Overrides", "");
  const o = P.style_overrides || {};
  if (Object.keys(o).length) for (const [k, v] of Object.entries(o)) L.push(`- ${k}: ${JSON.stringify(v)} (set by hand; wins over the measurement)`);
  else L.push("- None. Put a value in `style_overrides` in profile.json (for example `caption_words_per_unit`: 2) to win over a measurement.");
  return L.join("\n") + "\n";
}

// ---------- compare ----------
// [relative, absolute] tolerance rows (match.py rules(): cuts, zooms, zoom size, caption words/height, wpm); median_shot_s is ours.
export const MATCH_TOL = { cuts_per_min: [0.35, 2], punch_zooms_per_min: [0.4, 1.5], punch_scale: [0.1, 0.06], caption_words_per_unit: [0, 1], caption_y_pct: [0, 6], wpm: [0.12, 10], median_shot_s: [0.35, 0.5] };
export const near = (a, b, [rel, abs]) => Math.abs(a - b) <= Math.max(abs, rel * Math.abs(a));

export function compareProfile(profile, ours, { brandLocked = false } = {}) {
  const mine = aggregate([{ ...ours, id: "draft" }], ["draft"]);
  const findings = [], compared = [], skipped = [];
  for (const [key, tol] of Object.entries(MATCH_TOL)) {
    const ref = effectiveMetric(profile, key), mv = mine[key] && mine[key].value;
    if (ref == null) { skipped.push({ metric: key, why: "not measured in the references" }); continue; }
    if (mv == null) { skipped.push({ metric: key, why: "not measured in the draft" }); continue; }
    compared.push(key);
    if (near(ref, mv, tol)) continue;
    const overridden = profile.style_overrides && profile.style_overrides[key] != null;
    findings.push({
      check: "reference-deviation", severity: "warning", metric: key, ours: mv, reference: ref, tolerance: tol,
      confidence: overridden ? "override" : profile.metrics[key].confidence,
      note: brandLocked && (key === "cuts_per_min" || key === "median_shot_s") ? "brand film grammar wins; reported only"
        : `draft ${mv} against reference ${ref}`,
    });
  }
  return { ok: true, verdict: compared.length ? (findings.length ? "deviates" : "match") : "n/a", findings, compared, skipped };
}
