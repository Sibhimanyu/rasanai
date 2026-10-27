// Narration as approved copy, a confirmed pronunciation glossary and a per-line cache (Plan 07 A4, A7 continuity).
// Pure data and hashing: nothing here speaks, transcribes or plays audio (voice.mjs does, and consults this).
//
//   glossary:   validateGlossary(g), applyGlossary(text, g, locale)      only USER-CONFIRMED names and terms change what is spoken
//   copy:       bindToCopy(lines, approvedCopy)                          a narration line is an approved copy line, or it is flagged
//   cache:      lineKey(o), segmentRecord(o), planRegeneration(o)         key = text + voice + model/version + locale + settings + glossary
//   continuity: reconcileReplacement(o)                                  a replaced line keeps its neighbours' pauses and the music automation
//   check:      transcriptCheck(o)                                       heard words vs the script, reported WITH uncertainty
//   reuse:      verifyCachedSegment(seg, o), voiceRevisionImpact(o)     Addendum 2: a cached line is reused on its key AND its file hash (never its name); a voiceover change names what it re-does
//   voice:      voiceAuthorization(voice)                                never clone by default; a cloned voice needs a recorded authorization
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { canonicalDigest, SCHEMA_VERSION } from "./contracts.mjs";
import { audioScopeImpact } from "./impact.mjs";

const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);
const T = (x) => (typeof x === "string" ? x.trim() : x == null ? "" : String(x).trim());
const num = (x, d = null) => (x !== null && x !== "" && x !== undefined && Number.isFinite(Number(x)) ? Number(x) : d);
const r3 = (x) => (x == null ? x : Math.round(x * 1000) / 1000);
const norm = (s) => T(s).toLowerCase().replace(/[^\p{L}\p{N}\s']/gu, " ").split(/\s+/).filter(Boolean);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ---- glossary --------------------------------------------------------------------------------------------------------------------------------
// { entries: [{ term, spoken, locale?, confirmed_by: "user", confirmed_at?, source?, note? }] }
// An entry the user has not confirmed is a PROPOSAL: it is listed, never applied, and the voice is not changed behind the person's back.
export function validateGlossary(g) {
  const errors = [], warnings = [];
  for (const [i, e] of arr(g && g.entries).entries()) {
    if (!T(e.term)) errors.push(`entry ${i + 1}: term is empty`);
    if (!T(e.spoken)) errors.push(`entry ${i + 1} (${T(e.term)}): spoken respelling is empty`);
    if (T(e.confirmed_by) && T(e.confirmed_by) !== "user") warnings.push(`entry ${i + 1} (${T(e.term)}): confirmed_by ${JSON.stringify(e.confirmed_by)} is not the user; it is treated as a proposal`);
  }
  return { ok: !errors.length, errors, warnings };
}
export const isConfirmed = (e) => isObj(e) && T(e.confirmed_by) === "user";
export function applyGlossary(text, glossary, locale = "en") {
  let out = String(text ?? "");
  const applied = [], proposed = [];
  const lang = T(locale).toLowerCase().split("-")[0];
  // longest term first so "Rasan AI" wins over "Rasan"
  const entries = arr(glossary && glossary.entries).filter((e) => T(e.term) && T(e.spoken)).sort((a, b) => T(b.term).length - T(a.term).length);
  for (const e of entries) {
    if (e.locale && T(e.locale).toLowerCase().split("-")[0] !== lang) continue;
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])${esc(T(e.term))}(?=$|[^\\p{L}\\p{N}])`, "gu");
    if (!re.test(out)) continue;
    if (!isConfirmed(e)) { proposed.push({ term: T(e.term), spoken: T(e.spoken), why: "not confirmed by the user: not applied" }); continue; }
    out = out.replace(re, (m, pre) => `${pre}${T(e.spoken)}`);
    applied.push({ term: T(e.term), spoken: T(e.spoken) });
  }
  return { text: out, applied, proposed_unconfirmed: proposed };
}
export const glossaryDigest = (g) => canonicalDigest(arr(g && g.entries).filter(isConfirmed).map((e) => [T(e.term), T(e.spoken), T(e.locale)]).sort());

// ---- narration is bound to approved copy -----------------------------------------------------------------------------------------------------
// lines: [{id?, text, copy_ref?, shot_id?}]; approvedCopy: [{id, text}] (the storyboard/story copy). Wording is compared on words, not punctuation.
export function bindToCopy(lines, approvedCopy) {
  const byId = new Map(arr(approvedCopy).map((c) => [c.id, c]));
  const byText = new Map(arr(approvedCopy).map((c) => [norm(c.text).join(" "), c]));
  const rows = arr(lines).map((l, i) => {
    const text = T(l.text);
    const ref = l.copy_ref ? byId.get(l.copy_ref) : byText.get(norm(text).join(" "));
    if (!ref) return { index: i + 1, id: l.id || null, text, status: "not_approved_copy", message: l.copy_ref ? `copy ${JSON.stringify(l.copy_ref)} is not in the approved copy` : "this line matches no approved copy: new narration wording is a copy change, and routes back to the copy owner" };
    const same = norm(ref.text).join(" ") === norm(text).join(" ");
    return { index: i + 1, id: l.id || null, text, copy_ref: ref.id, shot_id: l.shot_id || null, status: same ? "bound" : "diverged", ...(same ? {} : { approved_text: ref.text, message: "the narration wording differs from the approved copy: either the copy changes (recorded) or the line returns to it" }) };
  });
  return { rows, ok: rows.every((r) => r.status === "bound"), unbound: rows.filter((r) => r.status !== "bound").map((r) => r.index) };
}

// ---- voice authorization ----------------------------------------------------------------------------------------------------------------------
// voice: { id, provider, model, version, kind: "stock" | "user_owned" | "licensed" | "cloned", authorization: { by, ref, scope } }
export function voiceAuthorization(voice) {
  const v = isObj(voice) ? voice : {};
  const kind = T(v.kind) || "stock";
  if (kind === "cloned") {
    const a = isObj(v.authorization) ? v.authorization : {};
    return T(a.by) && T(a.ref)
      ? { ok: true, kind, note: `a cloned voice, authorized by ${T(a.by)} (${T(a.ref)}); scope: ${T(a.scope) || "unspecified"}` }
      : { ok: false, kind, error: "a cloned voice needs a recorded authorization (who consented and where): voices are never cloned by default, and never from someone else's recording" };
  }
  return { ok: true, kind, note: kind === "stock" ? "a stock voice (the default): no cloning" : `${kind} voice` };
}

// ---- the cache ---------------------------------------------------------------------------------------------------------------------------------
// o: { text, spoken_text?, voice: {id, provider, model, version}, locale, settings: {speed, style, ...}, glossary_digest }
// A display name alone never identifies a voice: provider, model and VERSION are in the key.
export function lineKey({ text, spoken_text = null, voice = {}, locale = "en", settings = {}, glossary_digest = "" } = {}) {
  return canonicalDigest({
    text: T(spoken_text ?? text), voice: { id: T(voice.id), provider: T(voice.provider), model: T(voice.model), version: T(voice.version) },
    locale: T(locale).toLowerCase(), settings: isObj(settings) ? settings : {}, glossary: glossary_digest || "",
  });
}
// one narrated segment on disk. All numbers are MEASURED by the caller (ffprobe / silencedetect); absent = null, never defaulted to a nice value.
export function segmentRecord(o = {}) {
  const f = isObj(o.format) ? o.format : {};
  const s = isObj(o.silence) ? o.silence : {};
  const h = isObj(o.handles) ? o.handles : {};
  const c = isObj(o.context) ? o.context : {};
  const voice = isObj(o.voice) ? o.voice : {};
  const rec = {
    schema_version: SCHEMA_VERSION,
    segment_id: T(o.segment_id), shot_id: T(o.shot_id) || null, copy_ref: T(o.copy_ref) || null,
    text: T(o.text), spoken_text: T(o.spoken_text ?? o.text), locale: T(o.locale) || "en",
    voice: { id: T(voice.id), provider: T(voice.provider), model: T(voice.model), version: T(voice.version), kind: T(voice.kind) || "stock" },
    settings: isObj(o.settings) ? o.settings : {},
    glossary_digest: T(o.glossary_digest),
    file: T(o.file) || null, file_digest: T(o.file_digest) || null,
    format: { sample_rate: num(f.sample_rate), channels: num(f.channels), channel_layout: T(f.channel_layout) || null, duration_s: num(f.duration_s) },
    silence: { lead_s: num(s.lead_s), trail_s: num(s.trail_s) },
    handles: { head_s: num(h.head_s), tail_s: num(h.tail_s) }, // how much a splice may move into the clip's own silence without touching speech
    context: { prev_segment: T(c.prev_segment) || null, next_segment: T(c.next_segment) || null, gap_before_s: num(c.gap_before_s), gap_after_s: num(c.gap_after_s), film_start_s: num(c.film_start_s), music_duck: arr(c.music_duck) },
    words: arr(o.words),
  };
  rec.key = lineKey({ text: rec.text, spoken_text: rec.spoken_text, voice: rec.voice, locale: rec.locale, settings: rec.settings, glossary_digest: rec.glossary_digest });
  return rec;
}

// cache: { segments: [segmentRecord] }; next: { lines: [{segment_id, shot_id, text, copy_ref}], voice, locale, settings, glossary }
// -> which segments are reused, which regenerate, and which others are GENUINE dependents (timing) or merely need their assumptions re-checked.
export function planRegeneration({ cache = {}, lines = [], voice = {}, locale = "en", settings = {}, glossary = null } = {}) {
  const gd = glossaryDigest(glossary);
  const prev = new Map(arr(cache.segments).map((s) => [s.segment_id, s]));
  const rows = arr(lines).map((l, i) => {
    const gl = applyGlossary(l.text, glossary, locale);
    const key = lineKey({ text: l.text, spoken_text: gl.text, voice, locale, settings, glossary_digest: gd });
    const old = prev.get(l.segment_id);
    const status = !old ? "new" : old.key === key ? "reuse" : "regenerate";
    return { index: i, segment_id: l.segment_id, shot_id: l.shot_id || (old && old.shot_id) || null, key, spoken_text: gl.text, glossary_applied: gl.applied, glossary_proposed: gl.proposed_unconfirmed, status, reasons: status === "regenerate" ? changedFields(old, { text: l.text, spoken_text: gl.text, voice, locale, settings, glossary_digest: gd }) : [] };
  });
  const regen = rows.filter((r) => r.status !== "reuse");
  const voiceChanged = regen.some((r) => r.reasons.includes("voice") || r.reasons.includes("model"));
  // genuine timing dependents: only the shots OWNING a regenerated segment (their duration may move); downstream shifts follow through commitTiming, not here
  const timing_dependents = [...new Set(regen.map((r) => r.shot_id).filter(Boolean))];
  // neighbours: kept as-is, but their assumptions (level, pace, pause) were made against the OLD neighbour; a different voice or model invalidates them
  const neighbours = [];
  rows.forEach((r, i) => {
    if (r.status !== "reuse") return;
    const touching = [rows[i - 1], rows[i + 1]].filter((n) => n && n.status !== "reuse");
    if (!touching.length) return;
    const o = prev.get(r.segment_id);
    const differs = touching.some((n) => { const po = prev.get(n.segment_id); return !po || n.reasons.includes("voice") || n.reasons.includes("model") || (o && po && (o.voice.id !== voice.id || o.voice.model !== voice.model || o.voice.version !== voice.version)); });
    neighbours.push({ segment_id: r.segment_id, recheck: differs ? ["level_match", "pace", "pause_to_neighbour", "music_duck"] : ["pause_to_neighbour", "music_duck"], neighbour_voice_differs: differs, regenerate: false });
  });
  return {
    reuse: rows.filter((r) => r.status === "reuse").map((r) => r.segment_id),
    regenerate: regen.map((r) => r.segment_id), rows, timing_dependents, neighbours,
    mixed_voices: voiceChanged && regen.length < rows.length ? "a regenerated line has a different voice or model from lines that were kept: listen across the join, or regenerate the neighbours too (a display name does not make two voices identical)" : null,
    summary: `${rows.length - regen.length} reused, ${regen.length} to regenerate`,
  };
}
function changedFields(old, now) {
  if (!old) return ["new"];
  const r = [];
  if (T(old.text) !== T(now.text)) r.push("text");
  else if (T(old.spoken_text) !== T(now.spoken_text)) r.push("pronunciation");
  if (old.voice.id !== T(now.voice.id)) r.push("voice");
  if (old.voice.provider !== T(now.voice.provider) || old.voice.model !== T(now.voice.model) || old.voice.version !== T(now.voice.version)) r.push("model");
  if (T(old.locale).toLowerCase() !== T(now.locale).toLowerCase()) r.push("locale");
  if (canonicalDigest(old.settings) !== canonicalDigest(now.settings || {})) r.push("settings");
  if (T(old.glossary_digest) !== T(now.glossary_digest) && !r.includes("pronunciation")) r.push("glossary");
  return r.length ? r : ["key"];
}

// ---- A7: a replaced line is not spliced blindly ------------------------------------------------------------------------------------------------
// o: { old: segmentRecord, next: segmentRecord (the regenerated one), prev?: segmentRecord, after?: segmentRecord }
// -> what to do with the pauses, and the timing/music consequences. A PROPOSAL: committing a duration goes through lib/timing.mjs commitTiming.
export function reconcileReplacement({ old, next, prev = null, after = null, tol_s = 0.02 } = {}) {
  const issues = [], actions = [];
  const same = (a, b) => a != null && b != null && a === b;
  if (!old || !next) return { ok: false, issues: [{ check: "missing-segment", message: "reconcileReplacement needs the old and the regenerated segment" }] };
  if (!same(old.format.sample_rate, next.format.sample_rate) && old.format.sample_rate != null && next.format.sample_rate != null) issues.push({ check: "sample-rate", message: `sample rate ${old.format.sample_rate} -> ${next.format.sample_rate}: resample to the mix rate before splicing` });
  if (old.format.channels != null && next.format.channels != null && old.format.channels !== next.format.channels) issues.push({ check: "channel-layout", message: `channels ${old.format.channels} -> ${next.format.channels}: conform to the stem's layout (do not rely on the clip being mono)` });
  const dOld = old.format.duration_s, dNew = next.format.duration_s;
  const delta = dOld != null && dNew != null ? r3(dNew - dOld) : null;
  if (delta == null) issues.push({ check: "duration-unmeasured", message: "a segment's duration was not measured: the timing consequence is unknown, not zero" });
  // pauses: keep the neighbours' gap the person heard; absorb a difference in the clip's own leading/trailing silence within its handles
  const want = { before: old.context.gap_before_s, after: old.context.gap_after_s };
  const lead = next.silence.lead_s, trail = next.silence.trail_s, oLead = old.silence.lead_s, oTrail = old.silence.trail_s;
  if (prev && want.before != null && lead != null && oLead != null && Math.abs(lead - oLead) > tol_s) {
    const slide = r3(oLead - lead); // positive: the new clip needs to start later within its slot
    const room = slide >= 0 ? Infinity : num(next.handles.head_s, 0);
    if (Math.abs(slide) <= room) actions.push({ action: "trim_or_pad_head", segment_id: next.segment_id, seconds: slide, why: "keep the pause after the previous line as it was" });
    else issues.push({ check: "pause-before", message: `the new line starts ${r3(lead - oLead)} s ${lead > oLead ? "later" : "earlier"} and its head handle (${num(next.handles.head_s, 0)} s) cannot absorb it: the pause to the previous line changes` });
  }
  if (after && want.after != null && trail != null && oTrail != null && Math.abs(trail - oTrail) > tol_s) {
    const slide = r3(oTrail - trail);
    const room = slide >= 0 ? Infinity : num(next.handles.tail_s, 0);
    if (Math.abs(slide) <= room) actions.push({ action: "trim_or_pad_tail", segment_id: next.segment_id, seconds: slide, why: "keep the pause before the next line as it was" });
    else issues.push({ check: "pause-after", message: `the new line leaves ${r3(trail - oTrail)} s ${trail > oTrail ? "more" : "less"} trailing silence than before and its tail handle cannot absorb it: the pause to the next line changes` });
  }
  const diffVoice = old.voice.id !== next.voice.id || old.voice.model !== next.voice.model || old.voice.version !== next.voice.version || old.voice.provider !== next.voice.provider;
  if (diffVoice) issues.push({ check: "voice-differs", message: "the replacement uses a different voice or model: level, pace and room tone of the neighbours were set against the old one and are not assumed to match" });
  const music = delta == null || Math.abs(delta) < tol_s ? { shift: 0, note: "duration unchanged: music automation stays" } : { shift_after_s: delta, note: `the music ducks around this line: its envelope after ${next.context.film_start_s ?? "the line"} shifts by ${delta} s and keeps its attack and release shapes (re-derived by duckEnvelope, not stretched)` };
  return {
    ok: !issues.some((i) => ["sample-rate", "channel-layout", "pause-before", "pause-after"].includes(i.check)),
    issues, actions, duration_delta_s: delta,
    timing_proposal: delta != null && Math.abs(delta) >= tol_s && next.shot_id ? { shot_id: next.shot_id, duration_delta_s: delta, via: "lib/timing.mjs commitTiming (the one schedule); never retimed here" } : null,
    music_automation: music, neighbours_recheck: diffVoice,
  };
}

// ---- transcript vs script: a check with uncertainty -------------------------------------------------------------------------------------------
function lev(a, b) { const d = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d; }
function ops(a, b) { // word-level edit script (substitute / delete / insert) via the Levenshtein table
  const d = lev(a, b); const out = []; let i = a.length, j = b.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1] && d[i][j] === d[i - 1][j - 1]) { i--; j--; }
    else if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + 1) { out.push({ op: "changed", want: a[i - 1], heard: b[j - 1] }); i--; j--; }
    else if (i > 0 && d[i][j] === d[i - 1][j] + 1) { out.push({ op: "missing", want: a[i - 1] }); i--; }
    else { out.push({ op: "extra", heard: b[j - 1] }); j--; }
  }
  return out.reverse();
}
// o: { lines: [{n, text}], heard: [{n, text}] | string[] (one transcript string per line), names: [], glossary, transcriber: {name, model}, confidence? }
// A transcript is itself an estimate: every finding says "may", and nothing is called a pronunciation error as fact. Material words: names, numbers, 5+ letters.
export function transcriptCheck({ lines = [], heard = [], names = [], glossary = null, transcriber = {} } = {}) {
  if (!arr(heard).length) return { status: "unchecked", reason: "no transcript was produced: the narration was not compared with the script (that is not a pass)", lines: [], names: [] };
  const H = arr(heard).map((h) => (typeof h === "string" ? h : T(h && h.text)));
  const nameSet = [...new Set([...arr(names).map(T), ...arr(glossary && glossary.entries).filter(isConfirmed).map((e) => T(e.term))].filter(Boolean))];
  const rows = arr(lines).map((l, i) => {
    const want = norm(l.text), got = norm(H[i] || "");
    const d = ops(want, got), errs = d.length;
    const material = (w) => w && (/\d/.test(w) || w.length >= 5 || nameSet.some((nm) => norm(nm).includes(w)));
    const findings = d.filter((o) => material(o.want) || (o.op === "extra" && material(o.heard)));
    return { n: l.n ?? i + 1, text: l.text, heard: H[i] || "", wer: want.length ? r3(errs / want.length) : 0, material: findings.map((f) => ({ ...f, message: f.op === "missing" ? `"${f.want}" may be missing` : f.op === "changed" ? `"${f.want}" may have been heard as "${f.heard}"` : `"${f.heard}" may have been added` })) };
  });
  const nm = nameSet.map((name) => {
    const w = norm(name).join(" ");
    const wanted = rows.filter((r) => norm(r.text).join(" ").includes(w));
    if (!wanted.length) return { name, status: "not_in_script" };
    const missing = wanted.filter((r) => !norm(r.heard).join(" ").includes(w));
    return { name, status: missing.length ? "not_heard_as_written" : "heard", lines: missing.map((r) => r.n), message: missing.length ? `"${name}" may not have been pronounced as written on line(s) ${missing.map((r) => r.n).join(", ")}: check by ear, then add a user-confirmed respelling to the glossary` : undefined };
  });
  return {
    status: "checked", uncertain: true,
    basis: `${T(transcriber.name) || "a speech-to-text pass"}${transcriber.model ? ` (${transcriber.model})` : ""}: its own errors look like narration errors, so every finding is a prompt to listen, not a verdict`,
    lines: rows, names: nm,
    review: rows.filter((r) => r.material.length).map((r) => r.n),
  };
}

// ---- Addendum 2 (W3 AUD-REV): reuse is proved, not assumed -------------------------------------------------------------------------------------------
// A planRegeneration "reuse" row says the TEXT/VOICE key is unchanged. Before the file is used, the file itself must still be the one recorded: present, and (when a digest was
// recorded) hashing to it. A matching filename alone is never accepted. seg: segmentRecord; o: { run, hash:true }.
// -> { state: "verified"|"unverified"|"missing"|"changed", usable, why }  (unverified = the segment carries no file_digest: usable only as a scratch preview, never as delivery evidence)
export function verifyCachedSegment(seg, { run = ".", hash = true } = {}) {
  if (!isObj(seg) || !T(seg.file)) return { state: "missing", usable: false, why: "the segment names no audio file" };
  const f = path.isAbsolute(seg.file) ? seg.file : path.resolve(String(run), seg.file);
  let buf = null; try { buf = fs.readFileSync(f); } catch { return { state: "missing", usable: false, why: `${seg.file} is not on disk` }; }
  if (!T(seg.file_digest)) return { state: "unverified", usable: false, why: "no recorded file digest: the file is not shown to be the one that was generated" };
  if (!hash) return { state: "unverified", usable: false, why: "hash check skipped" };
  const got = crypto.createHash("sha256").update(buf).digest("hex");
  return got === T(seg.file_digest).replace(/^sha256:/, "") ? { state: "verified", usable: true, why: "the file hashes to the recorded digest" } : { state: "changed", usable: false, why: "the file differs from the recorded digest" };
}

// What a voiceover change re-does. Script truth is preserved in every case: this never edits copy. o: { plan (planRegeneration result), removed (voiceover turned off), narrated_after,
// receipt, current_inputs, reuseDecision (lib/mix-receipt.mjs) }. -> { script_truth_kept:true, regenerate, timing_dependents, rechecks:[dependency names], scope, invalidates, mix_reusable, ... }
export function voiceRevisionImpact({ plan = null, removed = false, narrated_after = true, music_led = false, receipt = null, current_inputs = null, reuseDecision = null } = {}) {
  const regen = arr(plan && plan.regenerate), dependents = arr(plan && plan.timing_dependents);
  const touched = removed ? [] : regen.length === 0 ? [] : dependents;
  if (!removed && !regen.length) return { script_truth_kept: true, regenerate: [], timing_dependents: [], rechecks: [], scope: null, invalidates: [], visuals_rebuilt: false, mix_reusable: true, note: "every line is reused: nothing in sound or timing moves" };
  const sc = audioScopeImpact("voiceover", touched, { music_led, narrated: removed ? false : narrated_after !== false });
  const rechecks = removed ? ["duration of the shots that were paced by the voice", "reading time of on-screen text", "music level and ducking (no speech left to duck for)"] : ["duration of the shots owning regenerated lines", "reading time", "ducking envelopes", ...arr(plan && plan.neighbours).length ? ["level and pace against neighbouring lines"] : []];
  // the mix receipt decides whether the old mix is reusable; here it cannot be, because a voice identity key moved, but the question is asked of the receipt, never of a filename
  const reuse = receipt && typeof reuseDecision === "function" ? reuseDecision({ receipt, current: current_inputs }) : null;
  return { script_truth_kept: true, copy_untouched: true, regenerate: regen, timing_dependents: dependents, rechecks, scope: "voiceover", invalidates: sc.invalidates, keeps: sc.keeps, visuals_rebuilt: sc.visuals_rebuilt, needs_user: removed ? true : sc.needs_user, mix_reusable: !!(reuse && reuse.reuse === true), mix_reuse_detail: reuse, note: removed ? "removing the voiceover keeps the script text as the approved copy and re-derives durations, reading time and ducking; the person confirms because it changes how the film plays" : "only the regenerated lines and the things that depend on their length are re-done" };
}
