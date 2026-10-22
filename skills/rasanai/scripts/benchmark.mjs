#!/usr/bin/env node
// benchmark.mjs (W11): the technique catalogue and the three-fixture A/B evaluation. Offline except `verify-sources`. Method: references/benchmark.md.
//
//   node benchmark.mjs list [--json]                   the 20 technique rows (id, category, local fixture, verified) and the three fixture films
//   node benchmark.mjs validate                        the catalogue's rules (20 rows, no prompt/media fields, pinned provenance); exit 2 when it breaks one
//   node benchmark.mjs build [--fixture <id>|all] [--out <dir>]      generate the fixture film(s) headlessly (Chrome frames + ffmpeg) and their degraded baseline variant
//   node benchmark.mjs run [--fixture <id>|all] [--baseline <mp4>] [--after <mp4>] [--out <dir>] [--seed <s>] [--build]
//        checks matching length / fps / size, captures stills, runs the existing gates (motion-gate, slop, obey, stage2d, reads, events, sound, evidence),
//        and makes blinded X / Y labels and strips with crew.mjs ab. A missing render is "not run", never a win.
//   node benchmark.mjs report [--out <dir>]            writes BENCHMARK_REPORT.md and report.json from the runs (no invented creativity score)
//   node benchmark.mjs verify-sources [--write]        NETWORK: fetches each original_url once to verify it and (with --write) records the result in the catalogue
// Exit 0 ok, 2 a rule broken / a render refused or not run, 1 unable (bad arguments).
import path from "node:path";
import { parseArgs } from "./lib/common.mjs";
import { loadCatalog, validateCatalog, loadFixtures, buildFixture, runFixture, writeReport, verifySources, DEFAULT_OUT, SKILL } from "./lib/benchmark.mjs";

const args = parseArgs();
const cmd = args._[0] || "help";
const str = (k) => (args[k] && args[k] !== true ? String(args[k]) : null);
const out = (o, code = 0) => { console.log(JSON.stringify(o, null, 2)); process.exit(code); };
const outRoot = path.resolve(str("out") || DEFAULT_OUT);
const pick = () => { const f = str("fixture") || "all"; const all = loadFixtures().map((x) => x.id); if (f === "all") return all; if (!all.includes(f)) out({ ok: false, error: `unknown fixture "${f}" (${all.join(", ")}, all)` }, 1); return [f]; };

if (cmd === "help" || args.help) { console.log(import.meta.url && (await import("node:fs")).readFileSync(new URL(import.meta.url), "utf8").split("\n").filter((l) => l.startsWith("//")).map((l) => l.replace(/^\/\/ ?/, "")).join("\n")); process.exit(0); }
else if (cmd === "list") {
  const cat = loadCatalog(), fx = loadFixtures(), v = validateCatalog(cat);
  const rows = cat.rows.map((r) => ({ id: r.id, category: r.category, verified: r.verified, local_fixture: r.local_fixture && r.local_fixture.kind ? `${r.local_fixture.kind}: ${r.local_fixture.ref}` : "not built", original_url: r.original_url }));
  if (args.json) out({ ok: true, techniques: rows, fixtures: fx.map((f) => ({ id: f.id, duration_s: f.duration_s, fps: f.fps, size: `${f.width}x${f.height}`, probes: f.probes })), catalogue: { rows: v.rows, verified: v.verified, valid: v.ok } });
  console.log(`technique catalogue: ${v.rows} rows, ${v.verified} verified, ${v.ok ? "valid" : "INVALID"} (${path.relative(process.cwd(), path.join(SKILL, "library", "benchmarks", "video-techniques.json"))})`);
  for (const r of rows) console.log(`  ${r.id}  ${r.category.padEnd(34)} ${r.verified ? "verified  " : "unverified"}  ${r.local_fixture}`);
  console.log("\nfixture films:");
  for (const f of fx) console.log(`  ${f.id.padEnd(20)} ${String(f.duration_s).padStart(2)} s  ${f.width}x${f.height} @ ${f.fps}  ${f.probes.join("; ")}`);
  process.exit(0);
} else if (cmd === "validate") {
  const v = validateCatalog(loadCatalog());
  out({ ok: v.ok, rows: v.rows, verified: v.verified, problems: v.problems }, v.ok ? 0 : 2);
} else if (cmd === "build") {
  const res = [];
  for (const id of pick()) { console.error(`building ${id} ...`); const r = await buildFixture(id, outRoot); res.push({ id, status: r.status, reason: r.reason || null, render_s: r.after_build && r.after_build.render_s, peak_rss_mb: r.after_build && r.after_build.peak_rss_mb, dir: r.dir }); }
  out({ ok: res.every((r) => r.status === "built"), out: outRoot, fixtures: res }, res.every((r) => r.status === "built") ? 0 : 2);
} else if (cmd === "run") {
  const ids = pick();
  if ((str("baseline") || str("after")) && ids.length !== 1) out({ ok: false, error: "--baseline / --after need exactly one --fixture" }, 1);
  const res = [];
  for (const id of ids) {
    if (args.build) { const b = await buildFixture(id, outRoot); if (b.status !== "built") console.error(`build ${id}: ${b.reason}`); }
    console.error(`running ${id} ...`);
    const r = await runFixture(id, { outRoot, baseline: str("baseline"), after: str("after"), seed: str("seed") });
    res.push({ fixture: id, status: r.status, outcome: r.outcome, reason: r.reason || null });
  }
  out({ ok: res.every((r) => r.status === "compared"), out: outRoot, results: res, next: "node benchmark.mjs report" }, res.every((r) => r.status === "compared") ? 0 : 2);
} else if (cmd === "report") {
  const w = writeReport(outRoot);
  out({ ok: true, summary: w.report.summary, report: w.json, markdown: w.md });
} else if (cmd === "verify-sources") {
  const r = await verifySources({ write: !!args.write });
  out({ ok: r.ok, written: !!args.write, results: r.results }, r.ok ? 0 : 2);
} else out({ ok: false, error: `unknown command "${cmd}"; use list|validate|build|run|report|verify-sources` }, 1);
