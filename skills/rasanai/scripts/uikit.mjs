#!/usr/bin/env node
// The native-UI rebuild kit: RasanUI (product primitives from the film's brand tokens, a cursor with press physics on its own
// top layer, typing only inside a real input field, readability helpers and a check) for paused GSAP timelines.
// references/ui-rebuild.md. Adapted in part from motionmaxxing (Apache-2.0, Tejas Makwana), runtime/native-ui. Modified.
//
//   node uikit.mjs install --project videos/<name>     copies the runtime into <project>/assets/rasan-ui/
//   node uikit.mjs check   --project videos/<name> [--json]
//                                   compositions that call RasanUI load it after GSAP from an installed copy, on a paused
//                                   timeline, with no Math.random / wall clock / rAF / setTimeout, call U.finish(), and
//                                   either mark a captured rebuild (captured: true + source) or say so. Exit 0 clean, 2 violations.
import fs from "node:fs";
import path from "node:path";
import { parseArgs, die } from "./lib/common.mjs";
import { installUI, collect, usesUI } from "./lib/uikit.mjs";

const args = parseArgs();
const cmd = args._[0];
const out = (o, code = 0) => { console.log(JSON.stringify(o, null, 2)); process.exit(code); };
const str = (v) => (v && v !== true ? String(v) : "");

function checkProject(project) {
  const findings = [];
  const add = (severity, rule, file, message, fix) => findings.push({ severity, rule, file: path.relative(project, file) || file, message, fix });
  const files = collect(project).filter(usesUI);
  const have = fs.existsSync(path.join(project, "assets", "rasan-ui", "rasan-ui.js"));
  for (const f of files) {
    const t = fs.readFileSync(f, "utf8");
    if (/\.html?$/i.test(f)) {
      const iR = t.search(/rasan-ui\.js/), iG = t.search(/gsap(\.min)?\.js/);
      if (!have) add("error", "runtime-missing", f, "calls RasanUI but assets/rasan-ui/ is not installed", "node uikit.mjs install --project <dir> (video.mjs inject does it when a composition names RasanUI)");
      if (iR < 0 && !/RasanUI\s*=/.test(t)) add("error", "runtime-not-loaded", f, "calls RasanUI without loading rasan-ui.js", 'add <script src="../../assets/rasan-ui/rasan-ui.js"></script> after GSAP (relative to the composition)');
      if (iR >= 0 && iG >= 0 && iR < iG) add("error", "script-order", f, "rasan-ui.js loads before GSAP", "load GSAP first");
      if (!/paused\s*:\s*true/.test(t)) add("warning", "timeline-not-paused", f, "no gsap.timeline({ paused: true }) found; the kit adds its clock to a paused timeline", "create the timeline paused and register it on window.__timelines");
    }
    if (/Math\.random\s*\(|Date\.now\s*\(|performance\.now\s*\(|requestAnimationFrame\s*\(|setTimeout\s*\(|setInterval\s*\(/.test(t)) add("error", "nondeterministic", f, "Math.random, the wall clock, rAF or a timer next to RasanUI", "every state must be a pure function of the timeline time; the kit is seeded (RasanUI.kit(tl, { seed }))");
    if (/\.mount\s*\(/.test(t) && !/captured\s*:\s*true/.test(t)) add("warning", "not-captured", f, "mounts a UI that is not marked captured: true (with source), so the slop lint treats it as generic UI", 'rebuild a real captured screen and pass { captured: true, source: "research/screens.json#<id>" }');
    if (/\.cursor\s*\(/.test(t) && !/\.check\s*\(/.test(t)) add("warning", "no-check", f, "builds a UI with a cursor but never calls U.check({ at: [...] })", "run U.check at the beats the proof lands on and fix every warning");
    if (!/\.finish\s*\(/.test(t)) add("error", "no-finish", f, "never calls U.finish(): the clock is not on the timeline, so nothing moves", "call U.finish() last");
  }
  const errors = findings.filter((x) => x.severity === "error").length;
  return { project, files: files.map((f) => path.relative(project, f)), runtime_installed: have, findings, errors, warnings: findings.length - errors, status: files.length ? (errors ? "violations" : "clean") : "no-ui-kit" };
}

if (cmd === "install") {
  const root = path.resolve(str(args.project) || die("--project <videos/name> required"));
  if (!fs.existsSync(root)) die(`not found: ${root}`);
  const inst = installUI(root);
  out({ ok: true, ...inst, dir: path.relative(process.cwd(), inst.dir), use: '<script src="../../assets/rasan-ui/rasan-ui.js"></script> after GSAP (relative to the composition), then var U = RasanUI.kit(tl, { tokens, W, H, seed })' });
} else if (cmd === "check") {
  const project = path.resolve(str(args.project) || ".");
  const r = checkProject(project);
  if (args.json) out(r, r.errors ? 2 : 0);
  if (r.status === "no-ui-kit") console.log("uikit: no composition calls RasanUI");
  else if (!r.findings.length) console.log(`uikit: clean (${r.files.length} file(s))`);
  for (const f of r.findings) console.log(`${f.severity === "error" ? "ERROR" : "warn "} ${f.rule}  ${f.file}: ${f.message} -> ${f.fix}`);
  process.exit(r.errors ? 2 : 0);
} else die("usage: uikit.mjs install|check (see the header)");
