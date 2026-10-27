#!/usr/bin/env node
// Visual production desk (Plan 06): one entrypoint over the capability surface, pinned dependencies, edit reconciliation, tracks and character performance.
// Zero dependencies. JSON on stdout. Exit 0 ok, 1 failed check / blocked, 2 usage error. Nothing here renders, generates, tracks or downloads: it reads files and reports.
//
//   node production.mjs capabilities [--adapters] [--only <prefix>] [--verified <file.json>]
//        -> implemented / available_on_host / enabled / permission_status / license_status / verification_status per capability, a ui_state (ready | experimental |
//           test_only | unavailable) and the reason it is blocked. A catalog row is not a capability: kit rows are implemented only if their code exists. The project-wide
//           GSAP licence blocker is listed, and is not cleared by any flag.
//   node production.mjs pins write|check --project <dir> [--skill-dir <dir>]
//        -> <project>/motion/pins.json: font files (sha256), runtime versions, accepted generated media. `check` reports drift and, with --scenes, the impact.
//   node production.mjs migrate --project <dir> --reason "<why>"        record an update as a versioned migration (drift + the scenes it touches) and re-pin
//   node production.mjs readiness --project <dir> --evidence <file.json>   fonts / textures / video / accepted media against the pins; existence is not readiness
//   node production.mjs overrides --run <run> [--project <dir>] [--scene <id>]
//        -> user edits (motion/edits.jsonl) against the rebuilt element index: carried vs conflicts (a missing id is a conflict, never a nearest-pixel guess)
//   node production.mjs lint --file <scene.html>[,<file>]                 determinism rules: wall clock, unseeded random, free-running loop, render-time network, remote assets
//   node production.mjs track check --track <file> [--asset <media>] [--cuts 3.2,8.0]    structure, source binding, health spans and the fallbacks to offer
//   node production.mjs track plan --treatment screen_replacement|text_behind_subject|pin --track <file> [--mask <file>]
//   node production.mjs performance check --file <performance.json> [--identity <identity.json>] [--fps 30]
//   node production.mjs performance pose --file <performance.json> --t <s>      pose at an absolute scene time (pure)
//   node production.mjs performance actions --file <performance.json>            the action list the rig takes (Rasan2D emotes with mouth overrides, Rasan3D reacts) + what it cannot drive
//   node production.mjs performance continuity --a <perf.json> --b <perf.json>   two scenes of one actor
//   node production.mjs external review --source <url|repo> --license <id> [--files a,b]    an outside scene example: untrusted data, never run or copied
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "./lib/common.mjs";
import { SKILL_DIR } from "./lib/common.mjs";
import { registryReport, probeHost } from "./lib/capabilities.mjs";
import { buildPins, pinDrift, pinsPath, migrationImpact, recordMigration, evaluateReadiness, reconcileOverrides, lintDeterminism, reviewExternalScene } from "./lib/readiness.mjs";
import { validateTrack, healthOf, planTreatment } from "./lib/tracks.mjs";
import { validatePerformance, poseAt, toRigActions, checkContinuity } from "./lib/character-performance.mjs";

const args = parseArgs();
const [cmd, sub] = args._;
const out = (o, code = 0) => { process.stdout.write(JSON.stringify(o, null, 2) + "\n"); process.exit(code); };
const usage = (m) => out({ ok: false, error: m, usage: "production.mjs capabilities|pins|migrate|readiness|overrides|lint|track|performance|external (see the header)" }, 2);
const val = (k) => (args[k] === true || args[k] == null ? null : String(args[k]));
const need = (k) => val(k) || usage(`--${k} is required`);
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(path.resolve(f), "utf8")); } catch (e) { return out({ ok: false, error: `cannot read ${f}: ${e.message}` }, 2); } };
const project = () => { const p = path.resolve(need("project")); if (!fs.existsSync(p)) usage(`project not found: ${p}`); return fs.realpathSync(p); };
const skillDir = () => (val("skill-dir") ? path.resolve(val("skill-dir")) : SKILL_DIR);
const sceneSources = (proj) => {
  const dir = path.join(proj, "compositions"), res = [];
  if (!fs.existsSync(dir)) return res;
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) { const f = path.join(dir, d.name, "index.html"); if (d.isDirectory() && fs.existsSync(f)) res.push({ scene_id: d.name, source: fs.readFileSync(f, "utf8") }); }
  return res;
};

switch (cmd) {
  case "capabilities": {
    let adapters = [];
    if (args.adapters) { const { ADAPTERS, describe } = await import("./lib/renderer-adapters/index.mjs"); adapters = await Promise.all(ADAPTERS.filter((a) => a.id !== "hyperframes").map(describe)); }
    const verification = val("verified") ? readJson(val("verified")) : {};
    const rep = registryReport({ host: probeHost(), skillRoot: skillDir(), adapters, verification });
    const only = val("only");
    const caps = only ? rep.capabilities.filter((c) => c.id.startsWith(only)) : rep.capabilities;
    const count = (s) => caps.filter((c) => c.ui_state === s).length;
    out({ ok: !rep.invalid.length, generated_at: rep.generated_at, distribution_blockers: rep.distribution_blockers, summary: { total: caps.length, ready: count("ready"), experimental: count("experimental"), test_only: count("test_only"), unavailable: count("unavailable") }, capabilities: caps, invalid: rep.invalid }, rep.invalid.length ? 1 : 0);
    break;
  }
  case "pins": {
    const proj = project();
    if (sub === "write") {
      const pins = buildPins({ project: proj, skillDir: skillDir() });
      fs.mkdirSync(path.dirname(pinsPath(proj)), { recursive: true });
      fs.writeFileSync(pinsPath(proj), JSON.stringify(pins, null, 2) + "\n");
      out({ ok: true, wrote: path.relative(proj, pinsPath(proj)), fonts: pins.fonts.length, runtimes: Object.keys(pins.runtimes), neural_media: pins.neural_media.length });
    } else if (sub === "check") {
      if (!fs.existsSync(pinsPath(proj))) out({ ok: true, pinned: false, note: "no motion/pins.json: this film is not pinned yet (production.mjs pins write)" });
      const cur = buildPins({ project: proj, skillDir: skillDir() }), d = pinDrift(readJson(pinsPath(proj)), cur);
      out({ ok: d.pinned, pinned: true, drift: d.drift, added: d.added, impact: d.drift.length ? migrationImpact(d.drift, sceneSources(proj)) : null, next: d.drift.length ? "a change to a pinned font, runtime or accepted plate is a versioned migration: production.mjs migrate --reason ..." : null }, d.pinned ? 0 : 1);
    } else usage("pins write|check");
    break;
  }
  case "migrate": {
    const proj = project(), reason = need("reason");
    if (!fs.existsSync(pinsPath(proj))) usage("no motion/pins.json to migrate from");
    const cur = buildPins({ project: proj, skillDir: skillDir() }), d = pinDrift(readJson(pinsPath(proj)), cur);
    if (!d.drift.length) out({ ok: true, note: "nothing drifted; nothing to migrate" });
    const impact = migrationImpact(d.drift, sceneSources(proj));
    const rec = recordMigration(proj, { drift: d.drift, impact, reason, by: val("by") || "user" });
    fs.writeFileSync(pinsPath(proj), JSON.stringify(cur, null, 2) + "\n");
    out({ ok: true, migration: rec });
    break;
  }
  case "readiness": {
    const proj = project(), pins = fs.existsSync(pinsPath(proj)) ? readJson(pinsPath(proj)) : {};
    const r = evaluateReadiness({ pins, evidence: val("evidence") ? readJson(val("evidence")) : {}, projectRoot: proj });
    out({ ok: r.ok, ...r, pinned: Object.keys(pins).length > 0 }, r.ok ? 0 : 1);
    break;
  }
  case "overrides": {
    const run = path.resolve(need("run"));
    const { latestAll, resolveProject } = await import("./lib/editor-patch/index.mjs");
    const proj = val("project") ? path.resolve(val("project")) : resolveProject(run);
    const idxFile = path.join(proj, "motion", "element-index.json");
    if (!fs.existsSync(idxFile)) out({ ok: false, error: "no motion/element-index.json: run element-index.mjs build first" }, 1);
    const edits = latestAll(run).filter((e) => !val("scene") || e.scene_id === val("scene"));
    const r = reconcileOverrides({ edits, index: readJson(idxFile) });
    out({ ok: r.ok, ...r }, r.ok ? 0 : 1);
    break;
  }
  case "lint": {
    const files = need("file").split(",");
    const rows = files.map((f) => ({ file: f, ...lintDeterminism(fs.readFileSync(path.resolve(f), "utf8"), { file: f }) }));
    out({ ok: rows.every((r) => r.ok), files: rows }, rows.every((r) => r.ok) ? 0 : 1);
    break;
  }
  case "track": {
    if (sub === "check") {
      const t = readJson(need("track"));
      let source;
      if (val("asset")) { const { createHash } = await import("node:crypto"); source = { sha256: createHash("sha256").update(fs.readFileSync(path.resolve(val("asset")))).digest("hex") }; }
      const v = validateTrack(t, source), cuts = (val("cuts") || "").split(",").map(Number).filter(Number.isFinite);
      out({ ok: v.ok, ...v, health: healthOf(t, { cuts_s: cuts }) }, v.ok ? 0 : 1);
    } else if (sub === "plan") {
      const r = planTreatment({ treatment: need("treatment"), track: readJson(need("track")), mask: val("mask") ? readJson(val("mask")) : undefined });
      out({ ok: r.mode !== "refused", ...r }, r.mode === "refused" ? 1 : 0);
    } else usage("track check|plan");
    break;
  }
  case "performance": {
    if (sub === "continuity") { const r = checkContinuity(readJson(need("a")), readJson(need("b"))); out(r, r.ok ? 0 : 1); }
    const doc = readJson(need("file"));
    if (sub === "check") {
      const identity = val("identity") ? readJson(val("identity")) : undefined;
      const r = validatePerformance(doc, { identity, fps: Number(val("fps")) || 30, baseDir: val("identity") ? path.dirname(path.resolve(val("identity"))) : undefined });
      out({ ok: r.ok, errors: r.errors, warnings: r.warnings, alignment: { ...r.alignment, rows: undefined } }, r.ok ? 0 : 1);
    } else if (sub === "pose") out({ ok: true, pose: poseAt(doc, Number(need("t"))) });
    else if (sub === "actions") out({ ok: true, ...toRigActions(doc) });
    else usage("performance check|pose|actions|continuity");
    break;
  }
  case "external": {
    if (sub !== "review") usage("external review");
    const files = (val("files") || "").split(",").filter(Boolean).map((p) => ({ path: p, text: fs.existsSync(p) && fs.statSync(p).isFile() && fs.statSync(p).size < 2e6 ? fs.readFileSync(p, "utf8") : undefined }));
    out({ ok: true, ...reviewExternalScene({ source: val("source"), license: val("license"), files }) });
    break;
  }
  default: usage(cmd ? `unknown command ${cmd}` : "no command");
}
