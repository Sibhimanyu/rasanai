// Plan 12 D3: localization that is more than string replacement.
//
//   translationRecord()   one approved copy item mapped to one locale: source id + source digest, the draft text, a SEPARATE approval
//                         state (draft | reviewed | approved), protected tokens (numbers, units, names, qualifiers), glyph needs
//   checkTranslation()    numbers/units by value (provenance.numberDrift), protected tokens (evidence.checkProtected), stale source,
//                         unverified interface strings; never edits the text, only reports
//   uiString()            a localized interface label is used only if it was verified in the product (source + date); never invented
//   scriptInfo()          direction, shaping, line-break strategy and font needs from the text itself (Unicode properties)
//   fontPlan()            coverage of the brand font vs the text; a substitution is VISIBLE (named, with the missing glyphs), never silent
//   mirrorPolicy()        RTL changes reading order, not logos / media / real UI / charts / numerals' source orientation
//   formatNumber()        locale number formatting through Intl, with the approved numeric value carried alongside
//   glossary              pronunciation entries per locale used by the voice step
//   alignment()           word timings from the localized voice; low-confidence words are flagged for review, never smoothed away
// Pure; no network, no model calls, no files except the small helpers at the bottom.
import fs from "node:fs";
import path from "node:path";
import { SCHEMA_VERSION, canonicalDigest } from "./contracts.mjs";
import { numberDrift } from "./provenance.mjs";
import { checkProtected } from "./evidence.mjs";
import { atomicWrite } from "./recovery.mjs";

const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);
const str = (x, d = "") => (typeof x === "string" ? x : d);

export const APPROVAL_STATES = Object.freeze(["draft", "reviewed", "approved"]);
export const textDigest = (t) => canonicalDigest(str(t).normalize("NFC")).slice(0, 16);

// source: { id, text, locale?, protected?: { numbers, product_names, required_qualifiers, quoted_text }, claim_ids?: [] }
export function translationRecord({ id, source, locale, text = "", state = "draft", approved_by = null, translator = null, number_map = [], ui_strings = [] } = {}) {
  const s = isObj(source) ? source : {};
  return {
    schema_version: SCHEMA_VERSION, id: str(id) || `${str(s.id)}:${locale}`, locale: str(locale), source_id: str(s.id), source_digest: textDigest(s.text),
    claim_ids: arr(s.claim_ids), text: str(text).normalize("NFC"), text_digest: textDigest(text),
    state: APPROVAL_STATES.includes(state) ? state : "draft", approved_by: state === "approved" ? approved_by : null,
    // the translation's approval is bound to THIS text and THIS source: any change makes it a draft again (see `currentState`)
    approved_digest: state === "approved" ? textDigest(text) : null, approved_source_digest: state === "approved" ? textDigest(s.text) : null,
    translator: translator ? { kind: str(translator.kind, "unknown"), name: str(translator.name) || null } : null,
    protected: isObj(s.protected) ? s.protected : {}, number_map: arr(number_map), ui_strings: arr(ui_strings),
  };
}
// the state it is really in now: approval does not survive an edit of either text
export function currentState(rec, source) {
  if (rec.state !== "approved") return { state: rec.state, stale: false };
  if (rec.approved_digest !== textDigest(rec.text)) return { state: "draft", stale: true, why: "the translated text changed after approval" };
  if (source && rec.approved_source_digest !== textDigest(source.text)) return { state: "draft", stale: true, why: "the approved source copy changed after this translation was approved" };
  return { state: "approved", stale: false };
}

// ui_strings: [{ id, source_label, localized, verified_in_product, source, verified_at }]
export function uiString(entry) {
  const e = isObj(entry) ? entry : {};
  if (e.verified_in_product === true && e.source && e.verified_at) return { ok: true, text: str(e.localized), verified: true };
  return { ok: false, text: null, problem: "unverified_ui_language", why: "the localized interface label was not verified in the product (no source and date): a localized UI is never invented; show the original-language UI or ask for a real capture" };
}

export function checkTranslation(rec, source = {}) {
  const problems = [];
  const st = currentState(rec, source);
  if (st.stale) problems.push({ problem: "approval_stale", why: st.why });
  const drift = numberDrift(str(source.text), rec.text, { number_map: rec.number_map });
  for (const d of drift.drift) problems.push({ problem: "number_drift", why: d.why });
  const prot = checkProtected({ protected: rec.protected }, rec.text);
  // product names stay as names; required qualifiers must be present in the target (as the owner-approved translation of the qualifier)
  for (const m of prot.missing) problems.push({ problem: "protected_token_missing", token: m, why: `"${m}" is protected: propose, do not drop (the owner approves any change)` });
  for (const u of arr(rec.ui_strings)) { const r = uiString(u); if (!r.ok) problems.push({ problem: r.problem, id: u.id, why: r.why }); }
  if (!rec.text.trim()) problems.push({ problem: "empty_translation", why: "nothing to show for this locale" });
  return { ok: !problems.length, problems, state: st.state, publishable: st.state === "approved" && !problems.length };
}

// ---- script, direction, shaping, line breaking -----------------------------------------------------------------------------------------------
const SCRIPTS = [
  ["arabic", /\p{Script=Arabic}/u, { rtl: true, shaping: "contextual joining: needs a shaping engine (CoreText, HarfBuzz), never per-letter placement", linebreak: "space and punctuation; no letter-spacing (it breaks joining)", digits: "locale decides Arabic-Indic vs Western digits; the approved value is kept" }],
  ["hebrew", /\p{Script=Hebrew}/u, { rtl: true, shaping: "simple, but bidi applies", linebreak: "space and maqaf", digits: "Western digits usual" }],
  ["devanagari", /\p{Script=Devanagari}/u, { rtl: false, shaping: "conjuncts and reordering: needs a shaping engine", linebreak: "space; no break inside a conjunct", digits: "locale decides" }],
  ["thai", /\p{Script=Thai}/u, { rtl: false, shaping: "stacking marks: needs a shaping engine", linebreak: "no spaces between words: needs a dictionary segmenter (Intl.Segmenter) to break lines and group captions", digits: "locale decides" }],
  ["cjk", /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u, { rtl: false, shaping: "none beyond glyph choice per locale (Han unification: the locale picks the glyph variant)", linebreak: "break between most characters but not before closing punctuation or after opening punctuation (kinsoku); Korean breaks at spaces", digits: "Western usual" }],
  ["latin", /\p{Script=Latin}/u, { rtl: false, shaping: "none", linebreak: "spaces and hyphens", digits: "locale decides separators" }],
];
const RTL_LOCALES = /^(ar|he|fa|ur|ps|sd|ug|yi|dv)(-|$)/i;
export function scriptInfo(text, locale = "") {
  const t = str(text);
  const present = SCRIPTS.filter(([, re]) => re.test(t)).map(([name, , info]) => ({ script: name, ...info }));
  const rtlText = present.some((p) => p.rtl), rtlLocale = RTL_LOCALES.test(str(locale));
  const mixed = rtlText && present.some((p) => !p.rtl);
  return {
    scripts: present.map((p) => p.script), direction: rtlText || rtlLocale ? "rtl" : "ltr", mixed_direction: mixed,
    bidi: rtlText || rtlLocale ? (mixed ? "embedded LTR runs (numbers, product names, Latin words) inside RTL text: use Unicode bidi isolation, check punctuation placement" : "RTL paragraph") : "none",
    needs_shaping_engine: present.some((p) => /shaping engine|contextual/.test(p.shaping)),
    needs_dictionary_segmenter: present.some((p) => p.script === "thai"),
    line_break: present.map((p) => `${p.script}: ${p.linebreak}`),
    segmenter_available: typeof Intl !== "undefined" && typeof Intl.Segmenter === "function",
    notes: present.map((p) => `${p.script}: ${p.digits}`),
  };
}

// coverage: [[lo, hi], ...] code point ranges the brand font supports; unknown coverage is reported as unknown, not as fine.
export function missingGlyphs(text, coverage) {
  if (!Array.isArray(coverage) || !coverage.length) return null;
  const miss = new Set();
  for (const ch of str(text).normalize("NFC")) {
    const cp = ch.codePointAt(0);
    if (cp <= 0x20 || cp === 0x200c || cp === 0x200d || (cp >= 0x200e && cp <= 0x200f) || (cp >= 0x2066 && cp <= 0x2069)) continue; // controls, joiners and bidi marks need no glyph of their own
    if (!coverage.some(([lo, hi]) => cp >= lo && cp <= hi)) miss.add(ch);
  }
  return [...miss];
}
// brand: { family, coverage?: ranges }  fallbacks: [{ family, coverage?, licence_note? }]
export function fontPlan({ text, brand, fallbacks = [] } = {}) {
  const miss = missingGlyphs(text, brand && brand.coverage);
  if (miss === null) return { ok: true, status: "coverage_unknown", family: brand && brand.family, warning: "glyph coverage of the brand font was not provided: it is not assumed to cover this text; check before delivery" };
  if (!miss.length) return { ok: true, status: "covered", family: brand.family };
  const next = arr(fallbacks).find((f) => { const m = missingGlyphs(text, f.coverage); return Array.isArray(m) && !m.length; });
  return {
    ok: !!next, status: next ? "substituted" : "missing_glyphs", requested: brand.family, used: next ? next.family : null, missing_glyphs: miss.slice(0, 40),
    visible: true, notice: next ? `the brand font ${brand.family} has no glyphs for ${miss.slice(0, 8).join(" ")}${miss.length > 8 ? "..." : ""}: ${next.family} is used for them and the substitution is listed in the delivery manifest` : `no recorded font covers ${miss.slice(0, 8).join(" ")}: the text would render as boxes; choose a font with coverage or an owner-approved fallback`,
    needs_owner_choice: !next,
  };
}

// elements: [{ id, kind: "text"|"logo"|"media"|"real_ui"|"chart"|"icon"|"layout", directional?: bool }]
export function mirrorPolicy(elements, direction = "ltr") {
  if (direction !== "rtl") return { mirror: [], keep: arr(elements).map((e) => e.id), note: "left-to-right: nothing is mirrored" };
  const mirror = [], keep = [];
  for (const e of arr(elements)) {
    if (["logo", "media", "real_ui", "chart"].includes(e.kind)) keep.push(e.id);          // valid orientation; a mirrored logo or real UI is wrong
    else if (e.kind === "text" || e.kind === "layout" || (e.kind === "icon" && e.directional)) mirror.push(e.id); // reading order and directional cues
    else keep.push(e.id);
  }
  return { mirror, keep, note: "RTL changes reading order and directional cues. Logos, footage, real interface captures and charts keep their valid orientation." };
}

// the approved value stays the authority; the formatted string is what the viewer reads
export function formatNumber(value, locale, opts = {}) {
  let formatted;
  try { formatted = new Intl.NumberFormat(locale || "en", opts).format(value); } catch { formatted = String(value); }
  return { value, locale, formatted, locale_supported: Intl.NumberFormat.supportedLocalesOf([locale || "en"]).length > 0 };
}

// ---- pronunciation glossary ------------------------------------------------------------------------------------------------------------------
export const glossaryFile = (run) => path.join(path.resolve(String(run)), "delivery", "glossary.json");
export function readGlossary(run) { try { return arr(JSON.parse(fs.readFileSync(glossaryFile(run), "utf8")).entries); } catch { return []; } }
// entry: { term, locale, spoken_as?, ipa?, source: "owner"|"provider"|..., note? }
export function addGlossary(run, entry) {
  if (!entry || !entry.term || !entry.locale || !(entry.spoken_as || entry.ipa)) return { ok: false, reason: "term, locale and spoken_as or ipa are required" };
  const cur = readGlossary(run).filter((e) => !(e.term === entry.term && e.locale === entry.locale));
  const row = { term: String(entry.term), locale: String(entry.locale), spoken_as: entry.spoken_as || null, ipa: entry.ipa || null, source: entry.source || "owner", at: new Date().toISOString() };
  atomicWrite(glossaryFile(run), JSON.stringify({ schema_version: SCHEMA_VERSION, entries: [...cur, row] }, null, 2) + "\n");
  return { ok: true, entry: row };
}
export const glossaryFor = (entries, locale) => arr(entries).filter((e) => e.locale === locale || e.locale === str(locale).split("-")[0]);

// ---- alignment of a localized voice ----------------------------------------------------------------------------------------------------------
// words: [{ text, start, end, confidence? }] from the LOCALIZED voice (audio_meta voices words or a transcript). A word with no confidence is `unscored`.
export function alignment(words, { min_confidence = 0.6, locale = "" } = {}) {
  const w = arr(words).filter((x) => str(x.text).trim() && Number.isFinite(Number(x.start)));
  const out = w.map((x) => {
    const c = Number.isFinite(Number(x.confidence)) ? Number(x.confidence) : null;
    return { text: String(x.text).trim(), start: Number(x.start), end: Number(x.end ?? x.start), confidence: c, review: c !== null && c < min_confidence, unscored: c === null };
  });
  const low = out.filter((x) => x.review);
  return {
    locale, words: out, low_confidence: low.map((x) => ({ text: x.text, start: x.start, confidence: x.confidence })),
    scored: out.filter((x) => !x.unscored).length, unscored: out.filter((x) => x.unscored).length,
    status: !out.length ? "no_timings" : low.length ? "needs_review" : out.some((x) => x.unscored) ? "partially_scored" : "ok",
    note: "word highlights and lip cues use THESE timings (the localized voice), never the source language's; low-confidence words stay reviewable",
    min_confidence_is_a_default: true,
  };
}
