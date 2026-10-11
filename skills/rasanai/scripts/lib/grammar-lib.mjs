// Motion grammars: ONE grammar per film (a frame device, type and image behaviour, transitions and a list of
// techniques), each beat spends a different technique of it. The library is <skill>/library/grammars/<id>.json;
// RASANAI_GRAMMAR_LIBRARY points at another folder (the selftest uses fixtures). Shared by grammar.mjs, crew.mjs
// (checkScore, contextFor, promptFor) and lib/system.mjs (the design desk's gate). Zero dependencies.
import fs from "node:fs";
import path from "node:path";
import { SKILL_DIR } from "./common.mjs";

export const grammarLibDir = () => (process.env.RASANAI_GRAMMAR_LIBRARY ? path.resolve(process.env.RASANAI_GRAMMAR_LIBRARY) : path.join(SKILL_DIR, "library", "grammars"));
const readJ = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return undefined; } };
export const grammarFiles = () => { try { return fs.readdirSync(grammarLibDir()).filter((f) => f.endsWith(".json")).sort().map((f) => path.join(grammarLibDir(), f)); } catch { return []; } };
// back-compat: a skill with no grammar library (or an env override pointing at nothing) asks nothing of a look
export const hasGrammarLibrary = () => grammarFiles().length > 0;
export function loadGrammars() {
  const out = [];
  for (const f of grammarFiles()) { const g = readJ(f); if (g && typeof g === "object") out.push({ ...g, _file: f }); }
  return out;
}
export const loadGrammar = (id) => loadGrammars().find((g) => g.id === id) || null;
// the film's grammar: <run>/look/grammar.json (null when none; undefined when it is not valid JSON)
export const runGrammarPath = (run, label) => (label ? path.join(run, "design", label, "grammar.json") : path.join(run, "look", "grammar.json"));
export const readRunGrammar = (run, label) => { const f = runGrammarPath(run, label); return fs.existsSync(f) ? readJ(f) : null; };

const str = (v, min = 3) => typeof v === "string" && v.trim().length >= min;
const strs = (v, min) => Array.isArray(v) && v.length >= min && v.every((x) => str(x, 2));
const KEBAB = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
// the schema: { errors, warnings }
export function validateGrammar(g) {
  const errors = [], warnings = [];
  if (!g || typeof g !== "object" || Array.isArray(g)) return { errors: ["grammar is not a JSON object"], warnings };
  const E = (m) => errors.push(m);
  if (!(typeof g.id === "string" && KEBAB.test(g.id))) E('id must be kebab-case ("editorial-grid")');
  if (!str(g.name)) E("name is missing");
  if (!str(g.source, 10)) E("source is missing (what reference it is distilled from, described: no files)");
  for (const [k, subs] of [["frame_device", ["what", "moves"]], ["type", ["classes", "behaviour"]], ["image", ["treatment", "behaviour"]]]) {
    if (!g[k] || typeof g[k] !== "object") { E(`${k} is missing ({ ${subs.join(", ")} })`); continue; }
    for (const s of subs) if (!str(g[k][s], 8)) E(`${k}.${s} is missing or too short (8+ characters)`);
  }
  if (!strs(g.transitions, 3)) E("transitions needs at least 3 named transitions (strings)");
  const T = Array.isArray(g.techniques) ? g.techniques : null;
  if (!T) E("techniques is missing (a list of { id, name, what, route })");
  else {
    if (T.length < 6) E(`techniques has ${T.length} entries; a grammar needs at least 6 (8 to 12 in the library)`);
    else if (T.length < 8) warnings.push(`techniques has ${T.length} entries (8 to 12 is the library's range)`);
    const seen = new Set();
    T.forEach((t, i) => {
      const at = `techniques[${i}]${t && t.id ? ` (${t.id})` : ""}`;
      if (!t || typeof t !== "object") { E(`${at} is not an object`); return; }
      if (!(typeof t.id === "string" && KEBAB.test(t.id))) E(`${at}: id must be kebab-case`);
      else if (seen.has(t.id)) E(`${at}: duplicate technique id`);
      else seen.add(t.id);
      if (!str(t.name)) E(`${at}: name is missing`);
      if (!str(t.what, 10)) E(`${at}: what is missing (what the viewer sees)`);
      if (!str(t.route, 10)) E(`${at}: route is missing (the concrete build: HTML/GSAP, or Rasan3D)`);
    });
  }
  if (!str(g.signature, 8)) E("signature is missing (how the film's end lands in the grammar)");
  if (!(g.density && Number(g.density.change_every_s) > 0)) E("density.change_every_s must be a number of seconds above 0");
  if (!g.palette || typeof g.palette !== "object") E("palette is missing ({ ground, ink, accent, note })");
  else for (const k of ["ground", "ink", "accent"]) if (!str(g.palette[k], 3)) E(`palette.${k} is missing`);
  if (!strs(g.do, 2)) E("do needs at least 2 entries");
  if (!strs(g.dont, 2)) E("dont needs at least 2 entries");
  if (!strs(g.fits, 1)) E("fits needs at least 1 entry (the story shapes it suits)");
  if (typeof g.flat_ok !== "boolean") E("flat_ok must be true or false (false when the grammar needs 3D, blur or glow)");
  return { errors, warnings };
}

// ids of the grammar's techniques the score names, with their entries (for inlining)
export function techniquesNamed(g, ids) {
  const want = new Set(ids.filter(Boolean));
  return ((g && g.techniques) || []).filter((t) => t && want.has(t.id));
}

// The score rules when the run has a grammar file. Returns { P, W } (ids lead each message).
export function checkScoreGrammar(g, score, S, N) {
  const P = [], W = [];
  if (g === undefined) { P.push("grammar-invalid: look/grammar.json is not valid JSON"); return { P, W }; }
  const ids = new Set((g.techniques || []).map((t) => t && t.id).filter(Boolean));
  const gid = String(score.grammar || "").trim();
  if (!gid) P.push(`grammar-missing: score.grammar is not set: name the film's grammar ("${g.id}"; look/grammar.json), and give every beat a technique of it and a frame_device`);
  else if (g.id && gid !== g.id) W.push(`score.grammar is "${gid}" but look/grammar.json is "${g.id}"`);
  const used = [];
  S.forEach((s, i) => {
    const n = s.n || i + 1, t = String(s.technique || "").trim();
    if (!t) P.push(`technique-unknown: scene ${n} names no technique (one of: ${[...ids].join(", ")})`);
    else if (!ids.has(t)) P.push(`technique-unknown: scene ${n} technique "${t}" is not in the grammar "${g.id}" (${[...ids].join(", ")})`);
    else {
      used.push(t);
      if (i > 0 && String(S[i - 1].technique || "").trim() === t) P.push(`technique-repeat: scenes ${n - 1} and ${n} both use "${t}": spend a different technique on each beat`);
    }
    if (!String(s.frame_device || "").trim()) P.push(`frame-device-missing: scene ${n} has no frame_device (what the frame device does in this beat: "${String((g.frame_device || {}).moves || "").slice(0, 70)}")`);
  });
  const want = Math.min(N || S.length, 6);
  if (want > 0 && new Set(used).size < want) W.push(`technique-thin: ${new Set(used).size} distinct grammar techniques across ${S.length} beats (aim for ${want}): the grammar is the film's one language, but each beat spends a different part of it`);
  return { P, W };
}
