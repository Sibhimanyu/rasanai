// Runs one test module on its own, outside selftest.mjs: node scripts/tests/run-one.mjs <name>
// Same interface as the selftest ({ok, node, tmp, env}); exit 1 if any case failed.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const name = process.argv[2];
if (!name || !fs.existsSync(path.join(HERE, `${name}.mjs`))) { console.error(`usage: run-one.mjs <test name>; no scripts/tests/${name || "<name>"}.mjs`); process.exit(1); }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `rasa-${name}-`));
const env = { ...process.env, RASANAI_HOME: path.join(tmp, "home") };
let failed = 0;
const ok = (n, cond, detail = "") => { console.log(`${cond ? "ok  " : "FAIL"}  ${n}${!cond && detail ? `\n      ${detail}` : ""}`); if (!cond) failed++; };
const node = (script, args, opts = {}) => spawnSync(process.execPath, [path.join(HERE, "..", script), ...args], { encoding: "utf8", env, cwd: opts.cwd || tmp, timeout: 180000 });
await (await import(path.join(HERE, `${name}.mjs`))).default({ ok, node, tmp, env });
console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
