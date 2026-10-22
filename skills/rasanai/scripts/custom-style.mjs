#!/usr/bin/env node
// User-owned reusable film styles, kept OUTSIDE the skill: <library>/Styles/<slug>/ (the library is the Studio's, beside Brands and
// Series; --library, else $RASANAI_LIBRARY, else $RASANAI_HOME/library, else ~/Documents/RasanAI). A style is the existing syntax
// (DESIGN.md, grammar.json, recipe.json, blend.json, specimen.html) plus style.json, history/<revision>.json and previews/.
//   node custom-style.mjs list      --library <dir>
//   node custom-style.mjs create    --library <dir> --from-run <RUN> --name "Warm Ink" [--label Sure|Bold|Wild] [--brand DESIGN.md]
//   node custom-style.mjs inspect   --style <style-dir>
//   node custom-style.mjs customize --style <style-dir> --changes <changes.json> --name "Night Ink" [--preview]
//        changes.json: { "changes": { "<property>": value, ... }, "approve_character_changes": true, "note": "..." }
//        (a CLOSED schema: `inspect` lists every property; unknown ones, brand-lock conflicts and a different medium are refused.)
//        Writes a NEW style next to the base; the base is never touched. Exit 0 written, 2 refused / needs approval, 1 could not run.
//   node custom-style.mjs compare   --base <style-dir> --candidate <style-dir> --out <comparison.png> [--duration 20]
//   node custom-style.mjs test      --style <style-dir> --duration 20 --out <dir>      (15-30 s code-driven diagnostic film)
//   node custom-style.mjs check     --style <style-dir>                      (style.json, grammar.mjs check, design.mjs check-system)
//   node custom-style.mjs bind      --style <style-dir> --run <RUN> [--as-look] [--rebind]   (a snapshot into the run: later edits never change the film)
// Chrome or ffmpeg missing: the report says "not run: <reason>" (never passed). Zero dependencies; references/custom-styles.md.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs, die } from "./lib/common.mjs";
import { libraryRoot, listStyles, createFromRun, inspectStyle, customize, bindSnapshot, loadStyle, checkMeta, copyForCheck } from "./lib/custom-style.mjs";
import { validateGrammar } from "./lib/grammar-lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = parseArgs();
const cmd = args._[0];
const COMMANDS = ["list", "create", "inspect", "customize", "compare", "test", "check", "bind"];
const val = (k) => (args[k] && args[k] !== true ? String(args[k]) : null);
const need = (k) => { const v = val(k); if (!v) die(`--${k} required (custom-style.mjs ${cmd})`); return v; };
const out = (o, code = 0) => { console.log(JSON.stringify(o, null, 2)); process.exit(code); };
if (!cmd || !COMMANDS.includes(cmd)) die(`usage: custom-style.mjs ${COMMANDS.join("|")} ... (see the header)`);

try {
  if (cmd === "list") {
    const lib = libraryRoot(val("library"));
    out({ ok: true, library: lib, styles: listStyles(lib) });
  } else if (cmd === "create") {
    const lib = libraryRoot(val("library"));
    out(createFromRun(lib, need("from-run"), need("name"), { label: val("label"), brand: val("brand") }));
  } else if (cmd === "inspect") {
    out(inspectStyle(need("style")));
  } else if (cmd === "customize") {
    const r = customize(need("style"), path.resolve(need("changes")), need("name"));
    if (r.ok && args.preview) {
      const { compareStyles } = await import("./lib/style-film.mjs");
      const cmp = await compareStyles(need("style"), r.path, path.join(r.path, "previews", "comparison.png"));
      r.preview = cmp.ok ? { status: "ok", comparison: cmp.out } : { status: `not run: ${cmp.reason}` };
    }
    out(r, r.ok ? 0 : 2);
  } else if (cmd === "compare") {
    const { compareStyles } = await import("./lib/style-film.mjs");
    const r = await compareStyles(need("base"), need("candidate"), need("out"), { duration: val("duration") });
    out(r, r.ok ? 0 : 1);
  } else if (cmd === "test") {
    const { testStyle } = await import("./lib/style-film.mjs");
    const r = await testStyle(need("style"), need("out"), { duration: val("duration") || 20, fps: Number(val("fps")) || 12 });
    const unavailable = typeof r.report.mp4 === "string" || typeof r.report.strip === "string";
    out({ ok: r.ok, ...r.report }, r.ok ? 0 : unavailable ? 1 : 2);
  } else if (cmd === "check") {
    const S = loadStyle(need("style"));
    const P = checkMeta(S), W = [];
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "custom-style-check-"));
    const cp = copyForCheck(S.dir, tmp); // the gates write caches and temp files: never into the user's style
    const g = spawnSync(process.execPath, [path.join(HERE, "grammar.mjs"), "check", "--file", path.join(cp, "grammar.json")], { encoding: "utf8" });
    let gj = {}; try { gj = JSON.parse(g.stdout); } catch {}
    if (g.status !== 0) for (const m of gj.errors || [g.stderr.trim() || "grammar.mjs check failed"]) P.push(`grammar: ${m}`);
    for (const m of gj.warnings || []) W.push(`grammar: ${m}`);
    const gv = validateGrammar(S.grammar);
    if (gv.errors.length && g.status === 0) P.push(`grammar: ${gv.errors[0]}`);
    let system = null;
    const { chromeStatus } = await import("./lib/style-film.mjs");
    const ch = chromeStatus();
    if (!ch.ok) system = `not run: ${ch.reason} (structure was checked without the browser)`;
    else {
      const a = ["check-system", "--dir", cp, "--offline", "--label", S.meta.id];
      const bl = S.meta.brand_lock && fs.existsSync(S.meta.brand_lock.source) ? S.meta.brand_lock.source : null;
      if (bl) a.push("--brand", bl);
      const d = spawnSync(process.execPath, [path.join(HERE, "design.mjs"), ...a], { encoding: "utf8", timeout: 240000 });
      let dj = {}; try { dj = JSON.parse(d.stdout); } catch {}
      system = d.status === 0 ? "ok" : `failed (exit ${d.status})`;
      if (d.status !== 0) for (const m of dj.problems || [(d.stderr || d.stdout || "design.mjs check-system failed").trim().slice(0, 300)]) P.push(`design.mjs check-system: ${m}`);
      for (const m of dj.warnings || []) W.push(`design.mjs check-system: ${m}`);
    }
    fs.rmSync(tmp, { recursive: true, force: true });
    out({ ok: !P.length, style: S.meta.id, revision: S.meta.revision, problems: P, warnings: W, grammar_check: g.status === 0 ? "ok" : "failed", check_system: system }, P.length ? 2 : 0);
  } else if (cmd === "bind") {
    out(bindSnapshot(need("style"), need("run"), { asLook: !!args["as-look"], rebind: !!args.rebind }));
  }
} catch (e) {
  die(e.message);
}
