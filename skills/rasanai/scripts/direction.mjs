#!/usr/bin/env node
// The direction: the user's creative decisions as taxonomy terms, compiled into the
// art-direction brief (DIRECTION.md) Claude designs and animates from.
//   node direction.mjs compile --decisions <decisions.json> --out <dir>
//        -> <dir>/DIRECTION.md + <dir>/direction.json (resolved terms, style name, formula)
//   node direction.mjs suggest --dimension visual-style [--decisions <decisions.json>] [--count 3] [--recent a,b] [--exclude a,b]
//        -> candidates for a "you decide" dimension, coherent with the picks so far, away from the generic default
//   node direction.mjs menu (--dims visual-style,color | --group look) [--decisions <decisions.json>]
//        -> the console payload for choosing those dimensions (terms, definitions, looks, uses)
//   node direction.mjs directions --decisions <decisions.json> --out <dir> [--count 3] [--exclude ids] [--brand DESIGN.md --mode m]
//        [--aspect 16:9] [--headline "..."] [--sub "..."] [--no-images]
//        -> <dir>/directions.json: complete directions (whole style combinations) as cards, each with a board image
//   node direction.mjs pick-direction --directions <dir>/directions.json --id <id> --decisions <decisions.json>
//        -> merges that direction's picks into decisions.json (what the user already picked wins)
//   node direction.mjs analyze   -> the reference-analysis template (every category, valid term ids)
//   node direction.mjs compare   -> the two-reference comparison template
// decisions.json: { "subject": "...", "picks": { "<dimension>": "<id>"|["<id>"], "<dimension>:<facet>": "<id>" },
//                   "decided_by": { "<dimension>": "user"|"agent"|"brand" }, "notes": { "<dimension>": "..." },
//                   "brand": "<DESIGN.md path>", "avoid": ["..."] }
import { resolveBrandPath } from "./lib/run-brand.mjs";
import fs from "node:fs";
import path from "node:path";
import { parseArgs, die, readJSON, writeFile, readFrontmatterDoc } from "./lib/common.mjs";
import { loadTaxonomy } from "./lib/taxonomy.mjs";
import { resolvePicks, styleName, formula, promptParagraph, directionMd, suggest, directions, STACK_ORDER } from "./lib/direction.mjs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readDesignMd } from "./lib/design-md.mjs";
import { directionSection } from "./lib/system.mjs";
import { track, report } from "./lib/report.mjs";

const args = parseArgs();
const cmd = args._[0];
track(
  { directions: `Composing ${args.count || 3} complete directions from the style combinations`, compile: "Compiling the direction into DIRECTION.md", "pick-direction": "Applying the direction you picked" }[cmd],
  { directions: "Directions ready, each with a board in your words", compile: "DIRECTION.md written: the art-direction brief Claude animates from", "pick-direction": "Direction applied to the plan" }[cmd]
);
const readDecisions = () => (args.decisions ? readJSON(path.resolve(String(args.decisions))) : { picks: {} });

if (cmd === "compile") {
  const D = readDecisions();
  if (!args.out) die("--out <dir> required");
  const { entries, problems } = resolvePicks(D.picks || {});
  if (problems.length) die(`decisions have ${problems.length} problem(s):\n- ${problems.join("\n- ")}`);
  if (!entries.length) die("no decisions to compile");
  const avoid = [...(D.avoid || [])];
  let brandName = null;
  const brandFile = D.use_brand === false ? null : resolveBrandPath(D.brand, args.decisions ? path.dirname(path.resolve(String(args.decisions))) : null);
  if (brandFile) {
    const B = readDesignMd(brandFile, { mode: D.brand_mode });
    brandName = path.basename(D.brand);
    avoid.push(...B.donts.map((x) => `${x} (brand reference)`));
  }
  const motionPath = D.motion && fs.existsSync(path.resolve(String(D.motion))) ? path.resolve(String(D.motion)) : null;
  if (motionPath) {
    const M = readFrontmatterDoc(fs.readFileSync(motionPath, "utf8")).fields;
    if ((M.banned || []).length) avoid.push(`Banned motion patterns (machine-checked): ${M.banned.join(", ")}`);
  }
  const md = directionMd({ entries, subject: D.subject, decidedBy: D.decided_by || {}, notes: D.notes || {}, brand: brandName, motionMd: motionPath ? path.basename(motionPath) : null, avoid });
  const out = path.resolve(String(args.out));
  // a bespoke design system (design.mjs choose-system): its own words lead the art direction
  writeFile(path.join(out, "DIRECTION.md"), md + directionSection(D));
  const resolved = {
    style_name: styleName(entries),
    formula: formula(entries),
    brief: promptParagraph(entries, { subject: D.subject }),
    picks: Object.fromEntries(entries.map((e) => [e.facet ? `${e.dimension.id}:${e.facet.id}` : e.dimension.id, e.options.map((o) => ({ id: o.id, term: o.term }))])),
    decided_by: D.decided_by || {},
    subject: D.subject || null,
  };
  writeFile(path.join(out, "direction.json"), JSON.stringify(resolved, null, 2) + "\n");
  console.log(JSON.stringify({ ok: true, direction: path.relative(process.cwd(), path.join(out, "DIRECTION.md")), ...resolved, open_dimensions: STACK_ORDER.filter((d) => !resolved.picks[d]) }, null, 2));
} else if (cmd === "directions") {
  if (!args.out) die("--out <dir> required");
  const D = readDecisions();
  const out = path.resolve(String(args.out));
  const r = directions(D.picks || {}, { count: Math.max(2, Math.min(6, Number(args.count || 3))), exclude: String(args.exclude || "").split(",").filter(Boolean), seed: String(args.seed || D.subject || "") });
  if (!r.directions.length) die("no directions left (every combination was excluded)");
  // each card's image: that direction's look as a board on the user's words (in the brand's colors and fonts with --brand)
  if (!args["no-images"]) {
    const here = path.dirname(fileURLToPath(import.meta.url));
    for (const [i, d] of r.directions.entries()) {
      report(`Drawing direction ${i + 1} of ${r.directions.length}: ${d.name}`);
      const dir = path.join(out, d.id);
      writeFile(path.join(dir, "decisions.json"), JSON.stringify({ subject: D.subject, picks: d.picks }, null, 2));
      const a = ["looks", "--decisions", path.join(dir, "decisions.json"), "--out", path.join(dir, "look"), "--count", "2", "--stills", "--seed", d.id, "--aspect", String(args.aspect || "16:9")];
      if (args.headline) a.push("--headline", String(args.headline));
      if (args.sub) a.push("--sub", String(args.sub));
      if (args.brand) a.push("--brand", String(args.brand));
      if (args.mode) a.push("--mode", String(args.mode));
      const run = spawnSync(process.execPath, [path.join(here, "design.mjs"), ...a], { encoding: "utf8", timeout: 120000, env: { ...process.env, RASANAI_QUIET: "1" } });
      const png = path.join(dir, "look", "A", "board.png");
      if (run.status === 0 && fs.existsSync(png)) {
        d.image = path.relative(process.cwd(), png);
        // the board is this direction's look: picking the direction picks it too (no second "pick a look")
        d.looks = path.relative(process.cwd(), path.join(dir, "look", "looks.json"));
      }
      else d.image_error = (run.stderr || "").trim().split("\n").pop() || "board did not render";
    }
  }
  const manifest = { ...r, created: new Date().toISOString() };
  writeFile(path.join(out, "directions.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log(JSON.stringify({ ok: true, file: path.relative(process.cwd(), path.join(out, "directions.json")), recommended: r.recommended, passed_over: r.passed_over, directions: r.directions.map((d) => ({ id: d.id, name: d.name, terms: d.terms, rare: d.rare, image: d.image || null })) }, null, 2));
} else if (cmd === "pick-direction") {
  if (!args.directions || !args.id || !args.decisions) die("--directions <directions.json> --id <id> --decisions <decisions.json> required");
  const M = readJSON(path.resolve(String(args.directions)));
  const d = (M.directions || []).find((x) => x.id === String(args.id));
  if (!d) die(`no direction ${args.id} (have ${(M.directions || []).map((x) => x.id).join(", ")})`);
  const dp = path.resolve(String(args.decisions));
  const D = fs.existsSync(dp) ? readJSON(dp) : { picks: {} };
  const userPicked = new Set(Object.keys(D.picks || {}));
  D.picks = { ...d.picks, ...(D.picks || {}) };
  D.decided_by = D.decided_by || {};
  for (const k of Object.keys(d.picks)) if (!userPicked.has(k)) D.decided_by[k] = "user";
  D.direction_card = { id: d.id, name: d.name };
  // the card's board is the look: set it, so the Look step doesn't ask again (variations stay one command away)
  let look = null;
  if (d.looks && fs.existsSync(path.resolve(d.looks))) {
    const M = readJSON(path.resolve(d.looks));
    const L = (M.looks || [])[0];
    if (L) {
      for (const [k, v] of Object.entries(L.picks || {})) if (!userPicked.has(k)) D.picks[k] = v;
      if (M.brand) D.brand = D.brand || M.brand;
      D.look = { frame: L.frame, name: `${d.name} (${L.name})`, palette: L.palette, type: L.type, from_direction: d.id };
      look = D.look;
    }
  }
  writeFile(dp, JSON.stringify(D, null, 2) + "\n");
  console.log(JSON.stringify({ ok: true, direction: d.name, look: look ? { frame: look.frame, name: look.name } : null, picks: D.picks, decisions: path.relative(process.cwd(), dp) }, null, 2));
} else if (cmd === "suggest") {
  if (!args.dimension) die("--dimension required");
  const D = readDecisions();
  const r = suggest(String(args.dimension), D.picks || {}, { count: Number(args.count || 3), recent: String(args.recent || "").split(",").filter(Boolean), exclude: String(args.exclude || "").split(",").filter(Boolean), seed: String(args.seed || D.subject || "") });
  if (!r) die(`no dimension ${args.dimension}`);
  console.log(JSON.stringify(r, null, 2));
} else if (cmd === "menu") {
  const T = loadTaxonomy();
  const D = readDecisions();
  const want = args.dims ? String(args.dims).split(",") : T.dimensions.filter((d) => !args.group || d.group === args.group).map((d) => d.id);
  const dims = want.map((id) => T.byId[id]).filter(Boolean).map((d) => ({
    id: d.id, name: d.name, group: d.group, question: d.question, controls: d.controls, pick: d.pick,
    families: d.families || [],
    options: d.options.map((o) => ({ id: o.id, term: o.term, family: o.family, what: o.what, looks: o.looks, use: o.use, conveys: o.conveys })),
    facets: (d.facets || []).map((f) => ({ id: f.id, name: f.name, options: f.options.map((o) => ({ id: o.id, term: o.term, what: o.what })) })),
    picked: [].concat((D.picks || {})[d.id] || []),
  }));
  console.log(JSON.stringify({ dimensions: dims }, null, 2));
} else if (cmd === "analyze" || cmd === "compare") {
  const T = loadTaxonomy();
  const cats = STACK_ORDER.map((id) => T.byId[id]).filter(Boolean);
  if (cmd === "analyze") {
    console.log(`# Reference analysis (fill every category from what you can see; use the term ids)\n\n${cats.map((d) => `## ${d.name} (${d.id})\nSTYLE: <term id${d.pick.max > 1 ? "(s)" : ""}>\nEVIDENCE: <what visually indicates it>\nCONFIDENCE: High | Medium | Low\nCLOSE ALTERNATIVES: <term ids it could be confused with>\nValid: ${d.options.map((o) => o.id).join(", ")}\n`).join("\n")}\n## STYLE FORMULA\n<one line per decision, most defining first, joined with " + ">\n\nThen write the picks into decisions.json (dimension -> term id) and compile.`);
  } else {
    console.log(`# Comparison: reference A vs reference B\n\n| Dimension | A | B |\n|---|---|---|\n${cats.map((d) => `| ${d.name} | | |`).join("\n")}\n\n## The decisions that make them feel different\n1. <dimension: A's term vs B's term, and what it changes perceptually>\n2.\n3.\n4.\n`);
  }
} else die("usage: direction.mjs compile|suggest|menu|analyze|compare (see the header)");
