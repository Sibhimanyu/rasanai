// The owner's taste answers (library/questions.json): read them from a rasanai-brief.json (`preferences`, `ending_file`,
// `series`) or from the PREFERENCES block of a request, and write the block back out for crew briefs.
//   loadPrefs(file)       -> { prefs: {<question id>: <choice id>}, ending_file, series, file }
//   parsePrefsText(text)  -> the same, from the request text's PREFERENCES / ENDING CARD FILE / SERIES lines
//   prefsBlock(p)         -> the block the briefs carry ("" when nothing is answered)
// Only known question ids and choice ids are kept; "You decide" is a missing key. Zero dependencies.
import fs from "node:fs";
import path from "node:path";
import { SKILL_DIR } from "./common.mjs";

export const QUESTIONS_FILE = path.join(SKILL_DIR, "library", "questions.json");
export function loadQuestions() {
  try {
    return JSON.parse(fs.readFileSync(QUESTIONS_FILE, "utf8")).questions || [];
  } catch {
    return [];
  }
}
export const PREF_IDS = ["pictures", "speaker", "text", "captions", "marks", "ending"];

function clean(raw) {
  const qs = loadQuestions();
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw)) {
    const q = qs.find((x) => x.id === k);
    if (!q || typeof v !== "string") continue;
    if (q.choices.some((c) => c.id === v)) out[k] = v;
  }
  return out;
}

export function parsePrefsText(text) {
  const raw = {};
  let ending_file = null, series = null;
  for (const line of String(text || "").split("\n")) {
    const m = line.match(/^\s*-?\s*([a-z]+)\s*=\s*([a-z-]+)\b/i);
    if (m && PREF_IDS.includes(m[1].toLowerCase())) raw[m[1].toLowerCase()] = m[2].toLowerCase();
    const e = line.match(/^\s*ENDING CARD FILE:\s*(.+?)\s*$/);
    if (e) ending_file = e[1];
    const s = line.match(/^\s*SERIES:\s*(.+?)\s*\((\/[^)]+)\)/);
    if (s) series = { name: s[1], slug: path.basename(s[2]), path: s[2] };
  }
  return { prefs: clean(raw), ending_file, series, file: null };
}

// a rasanai-brief.json, a bare { question: choice } map, or the request text; relative files resolve beside the brief
export function loadPrefs(file) {
  if (!file) return { prefs: {}, ending_file: null, series: null, file: null };
  const f = path.resolve(String(file));
  if (!fs.existsSync(f)) throw new Error(`preferences file not found: ${file}`);
  const text = fs.readFileSync(f, "utf8");
  let j = null;
  try {
    j = JSON.parse(text);
  } catch {}
  if (!j || typeof j !== "object") return { ...parsePrefsText(text), file: f };
  const src = j.preferences && typeof j.preferences === "object" ? j.preferences : j.fields && j.fields.preferences ? j.fields.preferences : PREF_IDS.some((k) => k in j) ? j : {};
  const ef = j.ending_file || (j.fields && j.fields.ending_file) || null;
  const series = j.series && typeof j.series === "object" ? j.series : null;
  return { prefs: clean(src), ending_file: ef ? path.resolve(path.dirname(f), String(ef)) : null, series, file: f };
}

// the block crew briefs carry (the contract's request text, labels from questions.json)
export function prefsBlock({ prefs = {}, ending_file = null, series = null } = {}) {
  const qs = loadQuestions();
  const lines = [];
  for (const id of PREF_IDS) {
    if (!prefs[id]) continue;
    const q = qs.find((x) => x.id === id);
    const c = q && q.choices.find((x) => x.id === prefs[id]);
    lines.push(`- ${id} = ${prefs[id]}${c ? ` (${c.label})` : ""}`);
  }
  const out = [];
  if (lines.length) out.push(`PREFERENCES (the owner's choices; obey them, never reinterpret; read library/questions.json for meanings):\n${lines.join("\n")}`);
  if (prefs.ending === "card" && ending_file) out.push(`ENDING CARD FILE: ${ending_file}`);
  if (series && series.path) out.push(`SERIES: ${series.name || path.basename(series.path)} (${series.path}). Read series.json there: its look (DESIGN.md) is locked, so skip the Look call, write one Story option within its rules, and auto-choose it; obey its \`rules\`.`);
  return out.join("\n");
}
