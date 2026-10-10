#!/usr/bin/env node
// Motion grammars (library/grammars/<id>.json): the ONE motion language a film commits to (a frame device, type and image
// behaviour, transitions, 8 to 12 techniques with a build route each). The Director picks one for the direct branded path
// (look/grammar.json); the design desk gives each of the three looks its own (design/<L>/grammar.json). The Motion Director
// names score.grammar and, per beat, a technique and a frame_device; crew.mjs check holds the score to the file.
// RASANAI_GRAMMAR_LIBRARY points at another folder (tests).
//   node grammar.mjs list                       -> every grammar {id, name, flat_ok, fits, techniques}
//   node grammar.mjs show <id>                  -> the whole grammar
//   node grammar.mjs pick --run <run> [--flat] [--exclude a,b] [--count 3]
//        -> grammars that fit the story shape and the brand constraints, best first. --flat (brand-flat film, FILM-STYLE says
//           no 3D / blur / grain; also set when the run's FILM-STYLE.json says so) keeps only flat_ok grammars
//   node grammar.mjs write --run <run> --id <id> [--label Sure|Bold|Wild] [--out <path>] [--brand <DESIGN.md>]
//        -> copies the grammar into the run: look/grammar.json (or design/<label>/grammar.json, or --out); when a brand
//           DESIGN.md exists (--brand, or the run's decisions.json brand) its canvas / ink / accent replace the grammar's palette
//   node grammar.mjs check --file <grammar.json>   -> the schema (exit 0, or 2 with the problems)
// Zero dependencies; output is JSON.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { parseArgs, die, writeFile } from "./lib/common.mjs";
import { readDesignMd } from "./lib/design-md.mjs";
import { loadGrammars, loadGrammar, validateGrammar, runGrammarPath, grammarLibDir } from "./lib/grammar-lib.mjs";

const readJ = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
const strip = ({ _file, ...g }) => g;
const FLAT_RE = /\b(flat|no 3d|no motion blur|no blur|no grain|never 3d)\b/i;

// the run's story shape, as words: route, kind, format, the chosen story's shape
function shapeText(run) {
  const dec = readJ(path.join(run, "decisions.json")) || {}, br = readJ(path.join(run, "brief.json")) || {}, ch = readJ(path.join(run, "story", "chosen.json")) || {};
  const f = br.fields || br;
  const plan = readJ(path.join(run, "crew", "plan.json")) || {};
  return [dec.route, plan.route, dec.format, dec.kind, f.kind, f.sentence, f.brief, ch.shape, ch.device, ch.kind, ch.title].filter((x) => typeof x === "string").join(" ").toLowerCase();
}
const SHAPES = [["launch ladder", /launch|promo|product|reveal|announce|feature|demo|ad\b/], ["explainer", /explain|how|topic|faceless|tutorial|concept/], ["brand film", /brand|manifesto|identity|company|story/], ["music video", /music|lyric|song/], ["reel", /reel|showreel|sizzle/]];
const runIsFlat = (run) => { const c = readJ(path.join(run, "brand-film", "FILM-STYLE.json")); return !!c && FLAT_RE.test(`${(c.slots || {}).motionVocabulary || ""} ${(c.slots || {}).notes || ""}`); };
const tie = (run, id) => parseInt(crypto.createHash("sha1").update(`${run}|${id}`).digest("hex").slice(0, 6), 16);

const args = parseArgs();
const cmd = args._[0];
if (cmd === "list") {
  const all = loadGrammars();
  console.log(JSON.stringify({ library: grammarLibDir(), grammars: all.map((g) => ({ id: g.id, name: g.name, flat_ok: g.flat_ok, fits: g.fits, techniques: (g.techniques || []).length })) }, null, 2));
} else if (cmd === "show") {
  const id = args._[1] || args.id;
  if (!id) die("usage: grammar.mjs show <id>");
  const g = loadGrammar(String(id));
  if (!g) die(`no grammar "${id}" (have ${loadGrammars().map((x) => x.id).join(", ") || "none"})`);
  console.log(JSON.stringify(strip(g), null, 2));
} else if (cmd === "pick") {
  if (!args.run) die("--run <run dir> required");
  const run = path.resolve(String(args.run));
  const flat = !!args.flat || runIsFlat(run);
  const ex = new Set(String(args.exclude && args.exclude !== true ? args.exclude : "").split(",").map((s) => s.trim()).filter(Boolean));
  const count = Math.max(1, Number(args.count) || 3);
  const text = shapeText(run);
  const shapes = SHAPES.filter(([, re]) => re.test(text)).map(([n]) => n);
  let pool = loadGrammars();
  if (!pool.length) die(`no grammars in ${grammarLibDir()}`);
  const dropped = [];
  pool = pool.filter((g) => { if (ex.has(g.id)) return false; if (flat && g.flat_ok === false) { dropped.push(g.id); return false; } return true; });
  const rows = pool.map((g) => {
    const fits = (g.fits || []).map((x) => String(x).toLowerCase());
    const hit = fits.filter((f) => shapes.some((s) => f.includes(s) || s.includes(f)) || (f.length > 3 && text.includes(f)));
    return { id: g.id, name: g.name, flat_ok: g.flat_ok, score: hit.length, why: hit.length ? `fits ${hit.join(", ")}` : "no stated fit for this story shape (still allowed)", _t: tie(run, g.id) };
  }).sort((a, b) => b.score - a.score || a._t - b._t).slice(0, count).map(({ _t, ...r }) => r);
  console.log(JSON.stringify({ flat, shape: shapes, excluded: [...ex], dropped_not_flat: dropped, picks: rows }, null, 2));
} else if (cmd === "write") {
  if (!args.run || !args.id || args.id === true) die("--run <run dir> and --id <grammar id> required");
  const run = path.resolve(String(args.run));
  const g = loadGrammar(String(args.id));
  if (!g) die(`no grammar "${args.id}" (have ${loadGrammars().map((x) => x.id).join(", ") || "none"})`);
  const out = args.out && args.out !== true ? path.resolve(String(args.out)) : runGrammarPath(run, args.label && args.label !== true ? String(args.label) : "");
  const res = strip(g);
  // a brand's DESIGN.md wins over the grammar's palette; the devices stay
  let brandFile = args.brand && args.brand !== true ? path.resolve(String(args.brand)) : null;
  if (!brandFile) { const d = readJ(path.join(run, "decisions.json")) || {}; if (d.brand && d.use_brand !== false && fs.existsSync(path.resolve(String(d.brand)))) brandFile = path.resolve(String(d.brand)); }
  let merged = null;
  if (brandFile) {
    try {
      const R = readDesignMd(brandFile).roles || {};
      if (R.canvas && R.ink && R.accent) {
        res.palette = { ...res.palette, ground: R.canvas, ink: R.ink, accent: R.accent, note: `brand palette from ${path.basename(path.dirname(brandFile)) || "DESIGN.md"}/${path.basename(brandFile)} overrides the grammar's; the devices stay` };
        merged = path.relative(process.cwd(), brandFile);
      }
    } catch (e) { die(`brand DESIGN.md can't be read: ${e.message}`); }
  }
  writeFile(out, JSON.stringify(res, null, 2) + "\n");
  console.log(JSON.stringify({ ok: true, id: g.id, file: path.relative(process.cwd(), out), brand_palette: merged }, null, 2));
} else if (cmd === "check") {
  if (!args.file || args.file === true) die("--file <grammar.json> required");
  const f = path.resolve(String(args.file));
  if (!fs.existsSync(f)) die(`${args.file} not found`);
  const g = readJ(f);
  const r = g === null ? { errors: ["not valid JSON"], warnings: [] } : validateGrammar(g);
  console.log(JSON.stringify({ ok: !r.errors.length, id: g && g.id, errors: r.errors, warnings: r.warnings }, null, 2));
  process.exit(r.errors.length ? 2 : 0);
} else die("usage: grammar.mjs list | show <id> | pick --run R [--flat] [--exclude a,b] [--count 3] | write --run R --id <id> [--label L] [--out path] | check --file grammar.json");
