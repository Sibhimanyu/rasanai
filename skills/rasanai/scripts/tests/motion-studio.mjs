#!/usr/bin/env node
// Motion Studio smoke runner: one cheap smoke per module, each skipped when the module is not in the tree yet.
//
//   node skills/rasanai/scripts/tests/motion-studio.mjs [--only <name>] [--seek] [--keep]
//     modules: reference-motion, motion-kit, element-index, editor-patch, renderer-adapters, recipes
//     --only <name>  run one module     --seek  also run the heavy A->B->A and shuffled seek-identity capture (opt-in, in a render slot)
//     --keep         keep the generated fixture project (path printed) instead of deleting it
//   For each present module the runner builds the synthetic fixture (fixtures/motion-studio/build.mjs) once, then runs the module's own
//   smoke: scripts/tests/<name>.mjs when it exists, else scripts/tests/<name>-smoke.mjs, else `node <module script> --help` must exit 0 or 2
//   (a load check only). The fixture project is passed as env MOTION_STUDIO_FIXTURE (a built project dir) and MOTION_STUDIO_REFERENCE
//   (the synthetic reference.mp4). Prints a PASS/FAIL/SKIP table, JSON on the last line; exit 1 when any module FAILs, 2 on usage.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS = path.resolve(HERE, "..");
const SKILL = path.resolve(SCRIPTS, "..");
const argv = process.argv.slice(2);
const opt = (k) => { const i = argv.indexOf("--" + k); return i < 0 ? null : (argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : true); };

// module -> files that mean "present" (any of them)
const MODULES = {
  "reference-motion": [path.join(SCRIPTS, "reference-motion.mjs")],
  "motion-kit": [path.join(SCRIPTS, "motion-kit.mjs"), path.join(SKILL, "motion-kit/catalog.json"), path.join(SKILL, "runtime/rasan-motion-kit.js")],
  "element-index": [path.join(SCRIPTS, "element-index.mjs")],
  "editor-patch": [path.join(SCRIPTS, "editor-patch.mjs")],
  "renderer-adapters": [path.join(SCRIPTS, "renderer-adapters.mjs")],
  "recipes": [path.join(SKILL, "stage3d/recipes")],
};
const only = opt("only");
if (only && only !== true && !MODULES[only]) { console.error(`unknown module "${only}"; one of ${Object.keys(MODULES).join(", ")}`); process.exit(2); }
const names = only && only !== true ? [only] : Object.keys(MODULES);

const rows = [];
let fixtureDir = null;
const fixture = () => {
  if (fixtureDir) return fixtureDir;
  fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "motion-studio-fx-"));
  const r = spawnSync(process.execPath, [path.join(HERE, "fixtures/motion-studio/build.mjs"), "--out", fixtureDir], { encoding: "utf8" });
  if (r.status !== 0) throw new Error("fixture build failed: " + (r.stdout + r.stderr).slice(0, 300));
  return fixtureDir;
};

for (const name of names) {
  const present = MODULES[name].filter((p) => fs.existsSync(p));
  if (!present.length) { rows.push({ module: name, status: "SKIP", detail: "not present" }); continue; }
  try {
    const fx = fixture();
    const env = { ...process.env, MOTION_STUDIO_FIXTURE: fx, MOTION_STUDIO_REFERENCE: path.join(fx, "reference.mp4"), MOTION_STUDIO_EDITS: path.join(fx, "edits.jsonl") };
    const own = [path.join(HERE, `${name}.mjs`), path.join(HERE, `${name}-smoke.mjs`)].find((p) => fs.existsSync(p) && p !== fileURLToPath(import.meta.url));
    let cmd, ok = (r) => r.status === 0;
    if (own) cmd = [own];
    else {
      const script = present.find((p) => p.endsWith(".mjs"));
      if (!script) { rows.push({ module: name, status: "PASS", detail: "files present (no smoke yet): " + present.map((p) => path.relative(SKILL, p)).join(", ") }); continue; }
      cmd = [script, "--help"]; ok = (r) => r.status === 0 || r.status === 2;
    }
    const r = spawnSync(process.execPath, cmd, { encoding: "utf8", env, timeout: 30000 });
    const tail = (r.stdout + r.stderr).trim().split("\n").filter(Boolean).slice(-1)[0] || "";
    rows.push({ module: name, status: ok(r) ? "PASS" : "FAIL", detail: `${own ? "smoke" : "load check"} ${path.relative(SCRIPTS, cmd[0])} exit ${r.status}${r.error ? " " + r.error.message : ""}${ok(r) ? "" : ": " + tail.slice(0, 160)}` });
  } catch (e) { rows.push({ module: name, status: "FAIL", detail: String(e.message || e).slice(0, 200) }); }
}

if (opt("seek")) {
  try {
    const dir = fixture();
    const r = spawnSync(process.execPath, [path.join(HERE, "seek-identity.mjs"), "--project", dir], { encoding: "utf8", timeout: 300000 });
    rows.push({ module: "seek-identity", status: r.status === 0 ? "PASS" : "FAIL", detail: `exit ${r.status}${r.status === 0 ? "" : ": " + (r.stdout + r.stderr).slice(0, 200).replace(/\s+/g, " ")}` });
  } catch (e) { rows.push({ module: "seek-identity", status: "FAIL", detail: String(e.message || e).slice(0, 200) }); }
}

const w = Math.max(...rows.map((r) => r.module.length));
for (const r of rows) console.log(`${r.status.padEnd(5)} ${r.module.padEnd(w)}  ${r.detail}`);
if (fixtureDir) { if (opt("keep")) console.log(`fixture kept: ${fixtureDir}`); else fs.rmSync(fixtureDir, { recursive: true, force: true }); }
const failed = rows.filter((r) => r.status === "FAIL").length;
console.log(JSON.stringify({ ok: failed === 0, pass: rows.filter((r) => r.status === "PASS").length, fail: failed, skip: rows.filter((r) => r.status === "SKIP").length, rows }));
process.exit(failed ? 1 : 0);
