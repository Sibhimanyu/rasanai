#!/usr/bin/env node
// The on-model canon of a recurring 3D actor (wave W6): validate it, seal it, plate it, put it in a scene, and check every 3D scene of a film.
//
//   node canon.mjs check    --run <run> [--project <videos/name>] [--scene <n>] [--id <cast id>] [--json]
//   node canon.mjs validate --file <identity.json>                       the identity alone (strict: what every scene depends on)
//   node canon.mjs seal     --file <identity.json> | --run <run> --id <id>      stamps rig_hash: later proportion, trait, material or rig-file changes are errors
//   node canon.mjs plate    --run <run> --id <id> | --file <identity.json> [--out <canon-plate.json>]   the plate the visual check compares with
//   node canon.mjs sheet    --canon <identity.json> --out <png>          the model sheet: front, quarter, side, back, then look/point/hop/react/walk
//   node canon.mjs scaffold --project <videos/name> --frame <id> --duration <s> --canon <identity.json> [--spec <actions.json>]
//                           [--camera <camera.json>] [--canvas "#efe6d4"] [--width 1920 --height 1080] [--force]
//
// check reads motion/score.json: every score.cast character whose identity.json says medium "3d-rig" is validated (structure, seal, plate),
// each scene's cast_state is read against it (the scene contract's cast-canon warnings), and, with --project, every composition that draws
// the actor (RasanCharacter3D) is loaded in headless Chrome and held to the canon: fixed traits present and visible, proportions relative to
// the body width, locked palette, attachment points, A-B-A pose determinism, then the standardized front and quarter silhouettes against
// the plate. A metric never proves identity: an uncertain view is reported as `review` (needs-frame-juror) with an image, not as an error.
// Exit 0 = clean (reviews and warnings allowed), 2 = violations, 1 = could not run.
import fs from "node:fs";
import path from "node:path";
import { parseArgs, die } from "./lib/common.mjs";
import { loadIdentity } from "./lib/canon.mjs";
import { validate3d, seal, makePlate, modelSheetOf, checkCanon, scaffoldScene } from "./lib/canon3d.mjs";
import { track } from "./lib/report.mjs";
import { noteDowngrade } from "./lib/downgrade.mjs";

process.env.RASANAI_GL = process.env.RASANAI_GL || "cpu"; // software rendering: the same pixels on every run
const args = parseArgs();
const cmd = args._[0];
const str = (v) => (v && v !== true ? String(v) : "");
const exists = (p) => !!p && fs.existsSync(p);
const out = (o, code = 0) => { console.log(JSON.stringify(o, null, 2)); process.exit(code); };
const identityFile = () => {
  if (str(args.file)) return path.resolve(str(args.file));
  if (str(args.run) && str(args.id)) return path.resolve(str(args.run), "cast", str(args.id), "identity.json");
  return die("--file <identity.json> or --run <run> --id <cast id> required");
};

if (cmd === "check") {
  const run = path.resolve(str(args.run) || die("--run <run> required"));
  if (!exists(run)) die(`run not found: ${run}`);
  track("Checking the recurring 3D actor against its canon", "On-model check done");
  const project = str(args.project) ? path.resolve(str(args.project)) : null;
  const r = await checkCanon({ run, project, scene: args.scene != null && args.scene !== true ? Number(args.scene) : null, only: str(args.id) || null });
  for (const c of r.couldNot || []) noteDowngrade({ run, what: "the on-model canon check", instead: "structural checks only", why: String(c).slice(0, 200), impact: "the recurring 3D actor's silhouette was not compared with the plate" });
  const code = r.errors ? 2 : (r.couldNot || []).length ? 1 : 0;
  if (args.json) out({ ...r }, code);
  console.log(`canon: ${r.status}: ${r.report.characters.length} character(s); ${r.errors || 0} error(s), ${r.warnings || 0} warning(s), ${r.review || 0} for frame-juror review`);
  for (const f of r.findings) console.log(`  [${f.severity.toUpperCase()}] ${f.rule}${f.cast ? ` (${f.cast})` : ""}${f.scene != null ? ` scene ${f.scene}` : ""}\n      ${f.message}\n      fix: ${f.fix}${f.image ? `\n      image: ${f.image}` : ""}`);
  for (const s of r.report.scenes.filter((x) => x.verdict)) console.log(`  ${s.file}${s.scene != null ? ` (scene ${s.scene})` : ""} ${s.cast} ${s.view}: ${s.verdict}${s.metrics ? ` iou ${s.metrics.iou} aspect ${s.metrics.aspect} region ${s.metrics.region} palette ${s.metrics.palette}` : ""}`);
  for (const c of r.couldNot || []) console.log(`  [COULD NOT RUN] ${c}`);
  process.exit(code);
} else if (cmd === "validate") {
  const f = identityFile();
  let idn; try { idn = loadIdentity(f); } catch (e) { out({ ok: false, error: e.message }, 2); }
  const v = validate3d(idn, path.dirname(f));
  out({ ok: v.ok, id: idn.id, errors: v.errors, warnings: v.warnings, features: v.features.map((x) => x.trait) }, v.ok ? 0 : 2);
} else if (cmd === "seal") {
  const r = seal(identityFile());
  out(r, r.ok ? 0 : 2);
} else if (cmd === "plate") {
  const f = identityFile();
  const o = path.resolve(str(args.out) || path.join(path.dirname(f), "canon-plate.json"));
  try { const r = await makePlate(f, o); out(r, r.ok ? 0 : 2); } catch (e) { console.error(`could not run: ${e.message}`); process.exit(1); }
} else if (cmd === "sheet") {
  const f = path.resolve(str(args.canon) || identityFile());
  const o = path.resolve(str(args.out) || die("--out <png> required"));
  try { out({ ok: true, ...(await modelSheetOf(loadIdentity(f), o)) }); } catch (e) { console.error(`could not run: ${e.message}`); process.exit(1); }
} else if (cmd === "scaffold") {
  const project = path.resolve(str(args.project) || die("--project <videos/name> required"));
  const frame = str(args.frame) || die("--frame <frame_id> required");
  const duration = Number(args.duration) || die("--duration <seconds> required");
  const rd = (f) => JSON.parse(fs.readFileSync(path.resolve(f), "utf8"));
  try {
    const r = scaffoldScene({ project, frame, duration, identityFile: path.resolve(str(args.canon) || die("--canon <identity.json> required")), spec: str(args.spec) ? rd(str(args.spec)) : null, camera: str(args.camera) ? rd(str(args.camera)) : null, canvas: str(args.canvas) || undefined, width: Number(args.width) || undefined, height: Number(args.height) || undefined, force: !!args.force });
    out({ ok: true, file: path.relative(process.cwd(), r.file), runtime: path.relative(process.cwd(), r.runtime), next: "Edit SPEC.actions (look, point, hop, react, walk, turn, carry), the camera and the set; then stage3d.mjs stills, stage3d.mjs check and canon.mjs check --run <run> --project <project>." });
  } catch (e) { die(e.message); }
} else die("usage: canon.mjs check|validate|seal|plate|sheet|scaffold … (see the header)");
