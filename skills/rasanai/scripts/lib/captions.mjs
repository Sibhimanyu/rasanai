// Plan 12 D3/D4: caption, transcript and descriptive-transcript generation from the film's REAL word timings.
// Extends (does not replace) the Plan-0 `lib/deliver.mjs` `srtCues`/`srtText`, which stay for existing deliveries (an old film still reads).
//
//   buildCues(words, policy)     phrase grouping by sentence end, pause and length in GRAPHEMES (CJK counted wide); hold from the speech
//                                span plus configurable padding. No English reading-speed law: `reading_rate_cps` is null unless the
//                                owner or a verified profile sets one, and then it is recorded as a configured value with its source.
//   addNonSpeech(cues, cues.json) meaningful non-speech audio ([door slams]) only where a cue carries caption text
//   srtText / vttText            real escaping and timestamps (no millisecond carry bug, no "-->" inside text, no blank line in a cue)
//   retime(cues, entries)        move cues with the edit (timing.mapOldToNew) so a variant's captions match ITS cut
//   syncCheck()                  inside the film, ordered, no overlap, readable (against the policy), same duration basis as the variant
//   transcriptText / descriptiveTranscript   the text alternatives; descriptions are AUTHORED, a missing one is reported, never invented
//   burnInDecision()             burn-in optional unless the profile requires it; never over footage that already has captions
// Pure. No ffmpeg, no files except `writeSidecars` which stages and renames atomically.
import fs from "node:fs";
import path from "node:path";
import { SCHEMA_VERSION } from "./contracts.mjs";
import { mapOldToNew } from "./timing.mjs";
import { atomicWrite } from "./recovery.mjs";

const arr = (x) => (Array.isArray(x) ? x : []);
const str = (x, d = "") => (typeof x === "string" ? x : d);
const num = (x, d = null) => (Number.isFinite(Number(x)) && x !== null && x !== "" ? Number(x) : d);

// ---- policy: all of it is configuration -------------------------------------------------------------------------------------------------------
// defaults are starting points marked `configured_default`; a profile's `captions.policy_values` or a CLI flag overrides them.
export const DEFAULT_POLICY = Object.freeze({
  max_line_units: 38, max_lines: 2,              // "units" = grapheme clusters, CJK/Hangul/fullwidth counted as 2
  pause_break_s: 0.7, max_cue_s: 7,
  min_hold_s: 1, pad_after_speech_s: 0.4,         // hold = max(min_hold_s, speech + pad), up to the next cue
  reading_rate_cps: null,                         // characters per second: null = no reading-speed rule applied (none is universal)
  gap_s: 0.04, source: "configured_default", verified_at: null, needs_validation: true,
});
export const policyFrom = (o = {}) => ({ ...DEFAULT_POLICY, ...(o && typeof o === "object" ? Object.fromEntries(Object.entries(o).filter(([k]) => k in DEFAULT_POLICY)) : {}) });

const seg = typeof Intl !== "undefined" && typeof Intl.Segmenter === "function" ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;
const wide = (cp) => (cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe30 && cp <= 0xfe6f) || (cp >= 0xff00 && cp <= 0xff60) || (cp >= 0xffe0 && cp <= 0xffe6) || (cp >= 0x20000 && cp <= 0x3fffd);
export function units(text) {
  const parts = seg ? [...seg.segment(str(text))].map((s) => s.segment) : [...str(text)];
  return parts.reduce((n, g) => n + (wide(g.codePointAt(0)) ? 2 : /^\p{M}+$/u.test(g) ? 0 : 1), 0);
}
// CJK and Thai have no spaces between words: join words without a space when both sides are such text
const NOSPACE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]$/u;
const NOSPACE_START = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}，。、！？：；）」』】]/u;
const joinWords = (ws) => ws.reduce((s, w, i) => (i === 0 ? w.text : s + (NOSPACE.test(s) && NOSPACE_START.test(w.text) || /^[,.;:!?%)\]]/.test(w.text) ? "" : " ") + w.text), "");
const SENTENCE_END = /[.!?…。！？؟]["'”’)\]」』]*$/u;

// words: [{ text, start, end }] in FILM time. -> [{ start, end, text, lines[], kind: "speech" }]
export function buildCues(words, policy = {}) {
  const P = policyFrom(policy);
  const W = arr(words).map((w) => ({ text: str(w.text).trim(), start: num(w.start), end: num(w.end, num(w.start)) })).filter((w) => w.text && w.start !== null).sort((a, b) => a.start - b.start);
  const cues = []; let cur = [];
  const limit = P.max_line_units * P.max_lines;
  const flush = () => { if (cur.length) cues.push({ start: cur[0].start, speech_end: cur[cur.length - 1].end, text: joinWords(cur), kind: "speech" }); cur = []; };
  for (const w of W) {
    if (cur.length) {
      const prev = cur[cur.length - 1];
      if (units(joinWords([...cur, w])) > limit || w.start - prev.end > P.pause_break_s || w.end - cur[0].start > P.max_cue_s) flush();
    }
    cur.push(w);
    if (SENTENCE_END.test(w.text)) flush();
  }
  flush();
  cues.forEach((c, i) => {
    const next = cues[i + 1] ? cues[i + 1].start - P.gap_s : Infinity;
    let hold = Math.max(P.min_hold_s, c.speech_end - c.start + P.pad_after_speech_s);
    if (P.reading_rate_cps) hold = Math.max(hold, units(c.text) / P.reading_rate_cps); // only when a rate was configured
    c.end = Math.max(c.speech_end, Math.min(c.start + hold, next));
    c.lines = breakLines(c.text, P);
    delete c.speech_end;
  });
  return cues;
}
// break a cue into <= max_lines lines of <= max_line_units, balanced, at spaces when there are any, else at grapheme boundaries (CJK / Thai)
export function breakLines(text, P = DEFAULT_POLICY) {
  const t = str(text).replace(/\s+/g, " ").trim();
  if (units(t) <= P.max_line_units || P.max_lines < 2) return [t];
  const words = t.split(" ");
  if (words.length > 1) {
    let best = null;
    for (let i = 1; i < words.length; i++) { const a = words.slice(0, i).join(" "), b = words.slice(i).join(" "); const d = Math.abs(units(a) - units(b)); if (!best || d < best.d) best = { a, b, d }; }
    if (best && units(best.a) <= P.max_line_units && units(best.b) <= P.max_line_units) return [best.a, best.b];
  }
  const g = seg ? [...seg.segment(t)].map((s) => s.segment) : [...t];
  let acc = 0, at = g.length >> 1;
  for (let i = 0; i < g.length; i++) { acc += wide(g[i].codePointAt(0)) ? 2 : 1; if (acc >= units(t) / 2) { at = i + 1; break; } }
  // keep closing punctuation off the start of line two
  while (at < g.length && /^[，。、！？：；）」』】,.;:!?)\]]$/.test(g[at])) at++;
  return [g.slice(0, at).join("").trim(), g.slice(at).join("").trim()].filter(Boolean);
}

// cuesDoc: motion/cues.json (Plan 07). A non-speech caption needs authored text (`caption_text` or `caption.text`) AND `caption.meaningful !== false`.
export function addNonSpeech(speechCues, cuesDoc, { hold_s = 1.2 } = {}) {
  const added = [], unlabelled = [];
  for (const c of arr(cuesDoc && cuesDoc.cues)) {
    const text = str(c.caption_text) || str(c.caption && c.caption.text);
    const onset = num(c.timing && c.timing.picture_onset_s, num(c.t));
    if (onset === null) continue;
    if (!text) { if (c.meaningful === true || (c.caption && c.caption.meaningful === true)) unlabelled.push({ cue: c.id, role: c.role, why: "marked meaningful but has no caption text: author it, it is not guessed" }); continue; }
    if (c.caption && c.caption.meaningful === false) continue;
    added.push({ start: onset, end: onset + hold_s, text: `[${text.replace(/^\[|\]$/g, "")}]`, lines: [`[${text.replace(/^\[|\]$/g, "")}]`], kind: "non_speech", cue: c.id });
  }
  const all = [...arr(speechCues), ...added].sort((a, b) => a.start - b.start || (a.kind === "speech" ? -1 : 1));
  // a non-speech caption never overlaps speech: it is trimmed to end before the next cue starts
  all.forEach((c, i) => { const n = all[i + 1]; if (c.kind === "non_speech" && n && c.end > n.start) c.end = Math.max(c.start + 0.2, n.start - 0.04); });
  return { cues: all, non_speech_added: added.length, unlabelled };
}

// ---- formats ---------------------------------------------------------------------------------------------------------------------------------
const ms = (t) => Math.max(0, Math.round(Number(t) * 1000));
function stamp(t, sep) { const m = ms(t); const p = (n, l = 2) => String(n).padStart(l, "0"); return `${p(Math.floor(m / 3600000))}:${p(Math.floor(m / 60000) % 60)}:${p(Math.floor(m / 1000) % 60)}${sep}${p(m % 1000, 3)}`; }
export const srtStamp = (t) => stamp(t, ",");
export const vttStamp = (t) => stamp(t, ".");
// a cue's text must not contain a blank line (it would end the cue) or an arrow (parsers read it as a timing line)
const cleanLine = (s) => String(s).replace(/\r\n?|\u2028|\u2029/g, "\n").replace(/-->/g, "→").replace(/\u0000/g, "");
const linesOf = (c) => cleanLine(arr(c.lines).length ? c.lines.join("\n") : c.text).split("\n").map((l) => l.trim()).filter(Boolean);
export function srtText(cues) {
  return arr(cues).map((c, i) => `${i + 1}\n${srtStamp(c.start)} --> ${srtStamp(c.end)}\n${linesOf(c).map((l) => l.replace(/&/g, "&amp;").replace(/</g, "&lt;")).join("\n")}\n`).join("\n");
}
const vttEsc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// opts.language: BCP 47 tag (header NOTE only; WebVTT has no language header); opts.rtl adds a Unicode isolate-free cue as is (the player applies bidi)
export function vttText(cues, { note = "" } = {}) {
  const head = `WEBVTT${note ? `\n\nNOTE ${cleanLine(note).replace(/\n+/g, " ")}` : ""}\n\n`;
  return head + arr(cues).map((c, i) => `${c.cue ? `${String(c.cue).replace(/[\s-]+-->.*/, "").replace(/\s+/g, "-")}\n` : `${i + 1}\n`}${vttStamp(c.start)} --> ${vttStamp(c.end)}\n${linesOf(c).map(vttEsc).join("\n")}\n`).join("\n");
}

// ---- keep the captions with the edit ----------------------------------------------------------------------------------------------------------
// entries: timing.mapOldToNew entries [{ old:[s,e], new:[s,e] }] (what the variant's cut did to the parent's timeline); cues outside every kept span are dropped and reported
export function retime(cues, entries, { keep = null } = {}) {
  const out = [], dropped = [];
  for (const c of arr(cues)) {
    if (keep && !keep.some(([a, b]) => c.start >= a && c.start < b)) { dropped.push({ text: c.text, start: c.start, why: "its span was cut from this variant" }); continue; }
    const s = mapOldToNew(entries, c.start), e = mapOldToNew(entries, c.end);
    if (!(e > s)) { dropped.push({ text: c.text, start: c.start, why: "it collapsed to nothing in the new timing" }); continue; }
    out.push({ ...c, start: s, end: e });
  }
  return { cues: out, dropped };
}

export function syncCheck(cues, { duration_s = null, policy = {}, expect_words = null } = {}) {
  const P = policyFrom(policy), problems = [], warnings = [];
  let prevEnd = -Infinity, prevSpeechEnd = -Infinity;
  arr(cues).forEach((c, i) => {
    const at = `cue ${i + 1}`;
    if (!(c.end > c.start)) problems.push(`${at}: ends before it starts`);
    if (c.start < 0) problems.push(`${at}: starts before 0`);
    if (duration_s !== null && c.end > duration_s + 0.05) problems.push(`${at}: ends at ${c.end.toFixed(2)}s, after the film ends (${duration_s}s): the captions do not match this cut`);
    if (c.start < prevEnd - 1e-6 && c.kind === "speech" && i && arr(cues)[i - 1].kind === "speech") problems.push(`${at}: overlaps the previous cue`);
    if (c.start < prevSpeechEnd - 1e-6 && c.kind === "speech") problems.push(`${at}: overlaps earlier speech`);
    if (linesOf(c).length > P.max_lines) warnings.push(`${at}: more than ${P.max_lines} lines`);
    if (linesOf(c).some((l) => units(l) > P.max_line_units)) warnings.push(`${at}: a line is over ${P.max_line_units} units`);
    if (P.reading_rate_cps && c.kind === "speech" && units(c.text) / (c.end - c.start) > P.reading_rate_cps) warnings.push(`${at}: faster than the configured ${P.reading_rate_cps} chars/s`);
    prevEnd = Math.max(prevEnd, c.end); if (c.kind === "speech") prevSpeechEnd = Math.max(prevSpeechEnd, c.end);
  });
  if (expect_words !== null) { const have = arr(cues).filter((c) => c.kind === "speech").reduce((n, c) => n + str(c.text).split(/\s+/).filter(Boolean).length, 0); if (have < expect_words * 0.9) warnings.push(`captions hold ${have} words but the voice has ${expect_words}: speech may be uncaptioned`); }
  return { ok: !problems.length, problems, warnings, policy_source: P.source, policy_needs_validation: P.needs_validation };
}

// ---- text alternatives -----------------------------------------------------------------------------------------------------------------------
export function transcriptText(cues, { title = "", language = "", speaker = null } = {}) {
  const head = [title && `Transcript: ${title}`, language && `Language: ${language}`].filter(Boolean).join("\n");
  const body = arr(cues).map((c) => `[${vttStamp(c.start).slice(0, 8)}] ${c.kind === "non_speech" ? c.text : (speaker ? `${speaker}: ` : "") + linesOf(c).join(" ")}`).join("\n");
  return (head ? head + "\n\n" : "") + body + "\n";
}
// beats: [{ id, start_s, end_s, description?: "what the viewer must SEE to understand", essential_visual?: bool }]
// A beat whose visual carries meaning but has no authored description is listed under `missing`: status stays needs_authoring.
export function descriptiveTranscript(beats, cues, { title = "" } = {}) {
  const missing = [], rows = [];
  for (const b of arr(beats)) {
    const d = str(b.description).trim();
    if (!d && b.essential_visual !== false) missing.push({ beat: b.id, start_s: b.start_s ?? null, why: "this beat shows something the viewer must understand and no description was authored" });
    rows.push({ start: num(b.start_s, 0), text: d ? `(Visual) ${d}` : null, beat: b.id });
  }
  for (const c of arr(cues)) rows.push({ start: c.start, text: c.kind === "non_speech" ? c.text : linesOf(c).join(" "), beat: null });
  rows.sort((a, b) => a.start - b.start);
  const text = (title ? `Descriptive transcript: ${title}\n\n` : "") + rows.filter((r) => r.text).map((r) => `[${vttStamp(r.start).slice(0, 8)}] ${r.text}`).join("\n") + "\n";
  return { text, missing, status: missing.length ? "needs_authoring" : "complete_for_authored_beats", note: "descriptions are written by the story/storyboard owner (Plan 02 accessibility needs), never generated from pixels here" };
}

// footage_has_captions: layers that already carry visible captions (a presenter reel, a talking head with burned subtitles)
export function burnInDecision({ profile = {}, brief = {}, footage_has_captions = false, owner_choice = null } = {}) {
  const policy = str(profile.captions && profile.captions.policy);
  const required = policy === "burned_in_required";
  if (footage_has_captions) return { burn_in: false, sidecar: true, why: "the footage already shows captions: burning more would duplicate them; the sidecar file is still delivered", duplicate_avoided: true };
  if (owner_choice === true) return { burn_in: true, sidecar: true, why: "the owner chose burn-in" };
  if (required) return { burn_in: true, sidecar: true, why: "the destination profile asks for burned-in captions (sound assumed off); this follows the profile record, which may need validation", needs_validation: !!profile.needs_validation };
  return { burn_in: false, sidecar: true, why: "burn-in is optional here; captions are delivered as sidecar files" };
}

// stage both files and rename: a caption pair is never half written. dir/<name>.<lang>.srt|vtt
export function writeSidecars(dir, name, cues, { language = "und", note = "" } = {}) {
  const base = path.join(dir, `${name}.${language}`);
  const files = { srt: `${base}.srt`, vtt: `${base}.vtt` };
  atomicWrite(files.srt, srtText(cues)); atomicWrite(files.vtt, vttText(cues, { note }));
  return { srt: path.basename(files.srt), vtt: path.basename(files.vtt), cues: cues.length, schema_version: SCHEMA_VERSION };
}
export function readJson(file) { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; } }
