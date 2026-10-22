#!/usr/bin/env node
// Evidence-grounded technical and documentary films (W9). Every number, geometry and measurement on screen comes from documented source material;
// a sketch says SCHEMATIC. Method and the eight recipes: references/evidence.md and library/evidence/*.md. No second facts database: measurements point at
// research/claims.json, the truth sheet and sources.json by id.
//   node evidence.mjs ingest --run <RUN> --source <authorized csv|json|xyz|glb|gltf|obj|png|jpg> --kind <recipe> [--out <RUN>/evidence/manifest.json]
//                            --origin "<who made it, where from>" --source-type user-supplied|public-record|licensed|research-source --permission authorized|owned|public-domain|licensed
//                            [--url <page>] [--license <l>] [--attribution <text>] [--unit <u>] [--id <id>] [--meta '<json>'] [--note <processing note>] [--claim <measurement-id>=<claim-id>]...
//                            synthetic test data: --synthetic (then --source-type/--permission default to synthetic-fixture / fixture)
//   node evidence.mjs check --run <RUN> [--strict] [--json] [--recipe <r>] [--scene <scene.json>] [--aspect 9:16 | --crop x,y,w,h] [--preview <preview.json>]
//   node evidence.mjs scene-data --run <RUN> --recipe <r> [--out <RUN>/evidence/scene.json] [--aspect 16:9|9:16|1:1|4:5] [--locale en-US] [--objects a,b] [--column <name>]
//   node evidence.mjs preview --run <RUN> --recipe <r> --out <dir> [--times 0.4,1.4,3.2] [--video [--fps 12]]      (headless Chrome, no window; not run: <reason> without it)
//   node evidence.mjs ledger --run <RUN>      grounded measurements -> research/evidence.claims.json (the claims format slop.mjs reads; fixtures are never claims)
//   node evidence.mjs recipes                 the eight recipes and the data each works from
// Exit: 0 ok, 2 refused or the check found errors (each diagnostic has a code and an actionable fix), 1 could not run (usage, no Chrome).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { parseArgs } from "./lib/common.mjs";
import { ingest, checkEvidence, writeLedger, RECIPES, RECIPE_FORMAT, EvidenceError, evidenceDir, loadManifest } from "./lib/evidence.mjs";
import { sceneData, preview } from "./lib/evidence-scene.mjs";

const args = parseArgs();
const cmd = args._[0];
const str = (v) => (v && v !== true ? String(v) : "");
const out = (o, code = 0) => { console.log(JSON.stringify(o, null, 2)); process.exit(code); };
const usage = (m) => out({ ok: false, error: m, usage: "evidence.mjs ingest|check|scene-data|preview|ledger|recipes (see the header of scripts/evidence.mjs)" }, 1);
const runDir = () => { const r = str(args.run); if (!r) usage("--run <RUN> required"); if (!fs.existsSync(r)) usage(`run folder not found: ${path.basename(r)}`); return path.resolve(r); };
const fail = (e) => { if (e instanceof EvidenceError) out({ ok: false, code: e.code, error: e.message, fix: e.fix, ...(e.detail ? { detail: e.detail } : {}) }, 2); throw e; };

if (cmd === "recipes") out({ ok: true, recipes: RECIPES.map((r) => ({ id: r, works_from: RECIPE_FORMAT[r], guide: `library/evidence/${r}.md` })) });
else if (cmd === "ingest") {
  const run = runDir(), source = str(args.source), kind = str(args.kind);
  if (!source) usage("--source <file> required");
  if (!kind) usage(`--kind <recipe> required (${RECIPES.join(", ")})`);
  let meta = {};
  try { if (str(args.meta)) meta = JSON.parse(str(args.meta)); if (str(args["meta-file"])) meta = { ...meta, ...JSON.parse(fs.readFileSync(str(args["meta-file"]), "utf8")) }; } catch (e) { usage(`--meta is not valid JSON: ${e.message}`); }
  const claims = {};
  for (const c of String(args.claim && args.claim !== true ? args.claim : "").split(",").filter(Boolean)) { const [m, id] = String(c).split("="); if (m && id) claims[m] = id; }
  try {
    const r = ingest({ run, source, kind, out: str(args.out) || undefined, id: str(args.id) || undefined, origin: str(args.origin) || undefined, url: str(args.url) || undefined, sourceType: str(args["source-type"]) || undefined, permission: str(args.permission) || undefined, permissionNote: str(args["permission-note"]) || undefined, license: str(args.license) || undefined, attribution: str(args.attribution) || undefined, synthetic: !!args.synthetic, unit: str(args.unit) || undefined, meta, note: str(args.note) || undefined, claims: Object.keys(claims).length ? claims : undefined });
    out({ ok: true, manifest: r.manifest, object: { id: r.object.id, format: r.object.format, content_hash: r.object.content_hash, source_type: r.object.source_type, permission: r.object.permission.status, synthetic: r.object.synthetic, file: r.object.file }, measurements: r.measurements, warnings: r.warnings });
  } catch (e) { fail(e); }
} else if (cmd === "check") {
  const run = runDir();
  const crops = [];
  for (const a of str(args.aspect).split(";").filter(Boolean)) crops.push(a);
  if (str(args.crop)) crops.push(str(args.crop));
  let r;
  try { r = checkEvidence(run, { strict: !!args.strict, recipe: str(args.recipe) || undefined, scene: str(args.scene) || undefined, crops, previewFile: str(args.preview) || undefined }); } catch (e) { fail(e); }
  if (args.json) out(r, r.ok ? 0 : 2);
  console.log(`evidence check${r.strict ? " --strict" : ""}: ${r.ok ? "ok" : "FAILED"} (${r.objects} object(s), ${r.measurements} measurement(s)${r.scene ? `, scene ${r.scene}` : ""})`);
  for (const d of r.errors) console.log(`  error ${d.code} [${d.where}]: ${d.message}\n    fix: ${d.fix}`);
  for (const d of r.warnings) console.log(`  warn  ${d.code} [${d.where}]: ${d.message}\n    fix: ${d.fix}`);
  process.exit(r.ok ? 0 : 2);
} else if (cmd === "scene-data") {
  const run = runDir(), recipe = str(args.recipe);
  if (!recipe) usage(`--recipe <recipe> required (${RECIPES.join(", ")})`);
  try {
    const scene = sceneData(run, recipe, { aspect: str(args.aspect) || undefined, locale: str(args.locale) || undefined, objects: str(args.objects) || undefined, column: str(args.column) || undefined, claimsChange: !!args["claims-change"], mode: args.schematic ? "schematic" : undefined });
    const f = path.resolve(str(args.out) || path.join(evidenceDir(run), "scene.json"));
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, JSON.stringify(scene, null, 2) + "\n");
    out({ ok: true, scene: path.relative(run, f), recipe, mode: scene.mode, aspect: scene.aspect, elements: scene.elements.length, blocked: scene.blocked || null, disclosure: !!scene.disclosure, next: scene.blocked ? "ingest the missing source: nothing is invented" : "node evidence.mjs check, then preview" });
  } catch (e) { fail(e); }
} else if (cmd === "preview") {
  const run = runDir(), recipe = str(args.recipe);
  if (!recipe) usage("--recipe <recipe> required");
  const dir = path.resolve(str(args.out) || path.join(evidenceDir(run), "preview"));
  try {
    let sf = path.resolve(str(args.scene) || path.join(evidenceDir(run), "scene.json")), scene = null, raw = null;
    if (fs.existsSync(sf)) { raw = fs.readFileSync(sf, "utf8"); try { scene = JSON.parse(raw); } catch { scene = null; } }
    if (!scene || scene.recipe !== recipe || str(args.aspect) && scene.aspect !== str(args.aspect)) { scene = sceneData(run, recipe, { aspect: str(args.aspect) || undefined, locale: str(args.locale) || undefined }); raw = JSON.stringify(scene, null, 2) + "\n"; fs.mkdirSync(path.dirname(sf), { recursive: true }); fs.writeFileSync(sf, raw); }
    if (scene.blocked) out({ ok: false, code: "survey-blocked-no-points", error: scene.blocked, fix: "ingest the missing source: nothing is invented" }, 2);
    const r = await preview(run, scene, dir, { times: str(args.times) ? str(args.times).split(",") : undefined, video: !!args.video, fps: str(args.fps) || undefined, sceneSha: crypto.createHash("sha256").update(raw).digest("hex") });
    if (!r.ok) out({ ...r, ok: false }, 1);
    out({ ok: true, out: path.relative(process.cwd(), dir) || ".", frames: r.frames.map((f) => f.file), deterministic: r.deterministic, rects: r.rects, video: r.video, note: r.deterministic ? "the same time rendered the same pixels" : "NOT deterministic: seek A, B, A gave different pixels" }, r.deterministic ? 0 : 2);
  } catch (e) { fail(e); }
} else if (cmd === "ledger") {
  const run = runDir();
  if (!loadManifest(run)) out({ ok: false, code: "manifest-missing", error: "no evidence manifest", fix: "ingest first" }, 2);
  out(writeLedger(run));
} else usage(cmd ? `unknown command "${cmd}"` : "a command is required");
