// A series is a saved setup plus memory: <library root>/Series/<slug>/series.json (+ DESIGN.md, end-card, reference).
// The Studio and scripts/series.mjs read and write the same file; paths inside it are relative to the series folder.
import fs from "node:fs";
import path from "node:path";
import { loadQuestions } from "./prefs.mjs";

export const seriesFile = (dir) => path.join(path.resolve(String(dir)), "series.json");
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function readSeries(dir) {
  const f = seriesFile(dir);
  if (!fs.existsSync(f)) throw new Error(`no series.json in ${dir}`);
  let j;
  try {
    j = JSON.parse(fs.readFileSync(f, "utf8"));
  } catch (e) {
    throw new Error(`${f} is not valid JSON: ${e.message}`);
  }
  if (!j || typeof j !== "object") throw new Error(`${f} is not a series`);
  return j;
}
export function writeSeries(dir, j) {
  j.modified = new Date().toISOString();
  const f = seriesFile(dir);
  const tmp = `${f}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(j, null, 2) + "\n");
  fs.renameSync(tmp, f);
  return j;
}
const abs = (dir, p) => (p ? path.resolve(String(dir), String(p)) : null);

export function showSeries(dir) {
  const j = readSeries(dir);
  const d = path.resolve(String(dir));
  const look = abs(d, j.look), ending = abs(d, j.ending_file || j.ending), reference = abs(d, j.reference);
  return {
    name: j.name, slug: j.slug || path.basename(d), path: d, format: j.format || null, aspect: j.aspect || null, length: j.length ?? null,
    brief: j.brief || null, preferences: j.preferences || {}, brand: j.brand || null,
    look: look ? { file: look, exists: fs.existsSync(look) } : null,
    ending_file: ending ? { file: ending, exists: fs.existsSync(ending) } : null,
    reference: reference ? { file: reference, exists: fs.existsSync(reference) } : null,
    rules: j.rules || [], episodes: j.episodes || [],
  };
}

export function addRule(dir, { text, film }) {
  text = String(text || "").trim();
  if (!text) throw new Error("--text required");
  const j = readSeries(dir);
  j.rules = Array.isArray(j.rules) ? j.rules : [];
  const hit = j.rules.find((r) => norm(r.text) === norm(text));
  if (hit) return { ...hit, deduped: true };
  const n = j.rules.reduce((m, r) => Math.max(m, Number(String(r.id || "").replace(/\D/g, "")) || 0), 0) + 1;
  const rule = { id: `r${n}`, text, from_film: film && film !== true ? String(film) : null, at: new Date().toISOString() };
  j.rules.push(rule);
  writeSeries(dir, j);
  return rule;
}

export function setPref(dir, question, choice) {
  const q = loadQuestions().find((x) => x.id === question);
  if (!q) throw new Error(`--question must be one of ${loadQuestions().map((x) => x.id).join(", ")}`);
  const j = readSeries(dir);
  j.preferences = j.preferences && typeof j.preferences === "object" ? j.preferences : {};
  if (choice === "unsure" || choice === "auto" || choice === "none-set") delete j.preferences[question];
  else if (!q.choices.some((c) => c.id === choice)) throw new Error(`--choice for ${question} must be one of ${q.choices.map((c) => c.id).join(", ")} (or "unsure" to clear it)`);
  else j.preferences[question] = choice;
  writeSeries(dir, j);
  return { question, choice: j.preferences[question] || null, preferences: j.preferences };
}

// the block crew briefs carry: the series' rules (and a line on what is locked)
export function seriesRulesBlock(dir) {
  let j;
  try {
    j = readSeries(dir);
  } catch {
    return "";
  }
  const rules = (j.rules || []).filter((r) => r && r.text);
  if (!rules.length) return "";
  const lines = rules.map((r) => `- ${r.text}${r.from_film ? ` (said on ${r.from_film})` : ""}`);
  return `## Rules of the series "${j.name || path.basename(String(dir))}"\n\nThe owner taught these on earlier episodes of this series. They apply to this episode: obey them, and do not make the owner say them again.\n\n${lines.join("\n")}\n`;
}
