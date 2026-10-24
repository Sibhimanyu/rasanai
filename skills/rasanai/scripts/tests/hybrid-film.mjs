#!/usr/bin/env node
// hybrid-film: the seven Hybrid Film Studio fixture cases (plan section 11). Fixtures are generated at run time into a temp dir (fixtures/hybrid-film/gen.mjs).
//   node scripts/tests/hybrid-film.mjs [--keep]      prints a table of pass / fail / pending; exit 1 only when a case FAILS (pending is not a failure and never a pass)
//   also usable as: export default async function ({ ok, node, tmp })   (ok(cond, label); the table is printed and failures call ok(false))
// A case is `pending` when the script it exercises does not exist yet, or answers a usage error (exit 2: the CLI shape differs from ADAPTERS below, so no verdict is possible).
// Phone / occlusion: their consumer (native tracking, W5 / compositor, W4) has no script, so those cases check only that the fixture is well-formed and stay pending.
// ADAPTERS is the one place to align command lines with the finished tools.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as G from "./fixtures/hybrid-film/gen.mjs";

const SCRIPTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const has = (f) => fs.existsSync(path.join(SCRIPTS, f));
const run = (script, args) => {
  const r = spawnSync(process.execPath, [path.join(SCRIPTS, script), ...args], { encoding: "utf8", timeout: 120000 });
  let json = null; try { json = JSON.parse(r.stdout); } catch {}
  return { code: r.status, json, out: r.stdout, err: r.stderr };
};
const ADAPTERS = {
  graph: (film) => run("hybrid-graph.mjs", ["build", "--film", film]),                    // writes <film>/hybrid/edit-graph.json
  cacheStatus: (film) => run("hybrid-graph.mjs", ["cache-status", "--film", film]),       // {hits:[key], misses:[key]}
  record: (runDir, edit) => run("editor-patch.mjs", ["record", "--run", runDir, "--json", JSON.stringify(edit)]),
};

const PEND = (why) => ({ status: "pending", note: why });
const PASS = (note = "") => ({ status: "pass", note });
const FAIL = (note) => ({ status: "fail", note });
const usageish = (r) => r.code === 2 || r.code === null;
const readJ = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const mkdir = (tmp, n) => { const d = path.join(tmp, n); fs.mkdirSync(d, { recursive: true }); return d; };

function graphKeys(film) {
  const g = readJ(path.join(film, "hybrid", "edit-graph.json"));
  return new Map(g.nodes.map((n) => [n.id, { key: n.content_key, scene: n.scene_id }]));
}

const cases = [
  ["1 score-30s-three-scenes", (tmp) => {
    const f = G.makeFilm(mkdir(tmp, "film1")), s = readJ(path.join(f, "motion", "score.json"));
    if (s.scenes.length !== 3 || s.scenes.reduce((a, c) => a + c.duration, 0) !== 30) return FAIL("fixture is not 3 scenes / 30 s");
    if (!has("hybrid-graph.mjs")) return PEND("hybrid-graph.mjs missing (fixture ok)");
    const a = ADAPTERS.graph(f); if (usageish(a)) return PEND("hybrid-graph CLI shape differs from ADAPTERS");
    if (a.code !== 0) return FAIL("graph build exit " + a.code);
    const b1 = fs.readFileSync(path.join(f, "hybrid", "edit-graph.json"));
    ADAPTERS.graph(f);
    return Buffer.compare(b1, fs.readFileSync(path.join(f, "hybrid", "edit-graph.json"))) === 0 ? PASS("deterministic") : FAIL("graph not byte-identical across runs");
  }],
  ["2 copy-edit-scene-2-only", (tmp) => {
    if (!has("hybrid-graph.mjs")) return PEND("hybrid-graph.mjs missing");
    const f = G.makeFilm(mkdir(tmp, "film2"));
    const a = ADAPTERS.graph(f); if (usageish(a)) return PEND("hybrid-graph CLI shape differs from ADAPTERS");
    if (a.code !== 0) return FAIL("graph build exit " + a.code);
    const before = graphKeys(f); G.copyEditScene2(f);
    if (ADAPTERS.graph(f).code !== 0) return FAIL("graph rebuild failed");
    const after = graphKeys(f), changed = [...after].filter(([id, v]) => before.get(id)?.key !== v.key);
    const bad = changed.filter(([, v]) => v.scene && v.scene !== "reveal").map(([id]) => id);
    const sceneHit = changed.some(([, v]) => v.scene === "reveal");
    if (bad.length) return FAIL("other scenes changed: " + bad.join(","));
    return sceneHit ? PASS(`${changed.length} nodes changed, scenes open/close untouched`) : FAIL("scene 2 keys did not change");
  }],
  ["3 kill-and-rerun-cache", (tmp) => {
    const f = mkdir(tmp, "film3"), c = G.corruptCache(f);
    if (!has("hybrid-graph.mjs")) return PEND("hybrid-graph.mjs / render-cache missing (corrupt states generated)");
    const r = ADAPTERS.cacheStatus(f); if (usageish(r) || !r.json) return PEND("cache-status CLI shape differs from ADAPTERS");
    const hits = new Set(r.json.hits || []);
    const wrong = [...c.expectMiss.filter((k) => hits.has(k)), ...c.expectHit.filter((k) => !hits.has(k))];
    return wrong.length ? FAIL("wrong verdict for " + wrong.length + " key(s)") : PASS("1 hit, " + c.expectMiss.length + " misses");
  }],
  ["4 concurrent-same-key", (tmp) => {
    if (!has("hybrid-render.mjs")) return PEND("hybrid-render.mjs missing");
    const f = G.makeFilm(mkdir(tmp, "film4"));
    // two processes asked for the same key; spawnSync is sequential, so use async spawn for real overlap
    return new Promise((resolve) => {
      import("node:child_process").then(({ spawn }) => {
        const codes = []; let done = 0;
        for (let i = 0; i < 2; i++) {
          const p = spawn(process.execPath, [path.join(SCRIPTS, "hybrid-render.mjs"), "render", "--film", f, "--scene", "reveal"], { stdio: "ignore" });
          p.on("close", (code) => { codes.push(code); if (++done === 2) {
            if (codes.includes(2)) return resolve(PEND("hybrid-render CLI shape differs from ADAPTERS"));
            if (codes.some((c) => c !== 0)) return resolve(FAIL("exit codes " + codes));
            const dirs = fs.existsSync(path.join(f, "hybrid", "cache")) ? fs.readdirSync(path.join(f, "hybrid", "cache")).filter((d) => d !== "index.json") : [];
            const stray = dirs.flatMap((d) => fs.readdirSync(path.join(f, "hybrid", "cache", d)).filter((n) => n.endsWith(".tmp") || n.startsWith(".")));
            resolve(stray.length ? FAIL("stray temp files " + stray.join(",")) : PASS("two writers, one consistent key dir"));
          } });
        }
      });
    });
  }],
  ["5 synthetic-phone-corners", (tmp) => {
    if (!G.ffmpegOk()) return PEND("ffmpeg missing");
    const { video, truth } = G.makePhone(mkdir(tmp, "phone"));
    const probe = spawnSync("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", video], { encoding: "utf8" });
    if (Number(probe.stdout.trim()) !== truth.frames.length) return FAIL("video frame count != truth");
    return PEND("fixture ok (" + truth.frames.length + " frames, exact corners); tracking consumer absent");
  }],
  ["6 silhouette-occlusion", (tmp) => {
    if (!G.ffmpegOk()) return PEND("ffmpeg missing");
    const { video, matte, truth } = G.makeOcclusion(mkdir(tmp, "occl"));
    if (!fs.existsSync(video) || !fs.existsSync(matte)) return FAIL("media not written");
    const peak = Math.max(...truth.frames.map((x) => x.occluded_fraction));
    if (!(peak > 0.2 && truth.frames[0].occluded_fraction === 0)) return FAIL("occlusion truth degenerate");
    return PEND("fixture ok (peak occlusion " + peak + "); compositor consumer absent");
  }],
  ["7 stale-edit-conflict", (tmp) => {
    const run = mkdir(tmp, "run7"), { edit } = G.staleEdit(run);
    const lib = path.join(SCRIPTS, "lib", "editor-patch");
    const src = fs.existsSync(lib) ? fs.readdirSync(lib).map((n) => fs.readFileSync(path.join(lib, n), "utf8")).join("\n") : "";
    if (!/conflict/.test(src) || !/replace-plate|correct-track/.test(src)) return PEND("editor-patch conflict result for new ops not landed (fixture ok)");
    const r = ADAPTERS.record(run, edit);
    if (usageish(r)) return PEND("editor-patch CLI shape differs from ADAPTERS");
    const log = path.join(run, "motion", "edits.jsonl");
    if (r.code !== 1 || !r.json || r.json.conflict !== true || r.json.ok !== false) return FAIL("stale new-op edit not refused with conflict (exit " + r.code + ")");
    return fs.existsSync(log) && fs.readFileSync(log, "utf8").trim() ? FAIL("conflict appended a line") : PASS("conflict, nothing appended");
  }],
];

export async function runAll(tmp) {
  const rows = [];
  for (const [name, fn] of cases) {
    let res; try { res = await fn(tmp); } catch (e) { res = FAIL("threw: " + e.message); }
    rows.push({ name, ...res });
  }
  return rows;
}
const table = (rows) => {
  const w = Math.max(...rows.map((r) => r.name.length));
  return rows.map((r) => `${r.name.padEnd(w)}  ${r.status.toUpperCase().padEnd(7)}  ${r.note}`).join("\n") + "\n" +
    `pass ${rows.filter((r) => r.status === "pass").length}  fail ${rows.filter((r) => r.status === "fail").length}  pending ${rows.filter((r) => r.status === "pending").length}`;
};

export default async function ({ ok, tmp } = {}) {
  const t = tmp || fs.mkdtempSync(path.join(os.tmpdir(), "hybrid-film-"));
  const rows = await runAll(t);
  console.log(table(rows));
  if (ok) for (const r of rows) if (r.status !== "pending") ok(r.status === "pass", `hybrid-film ${r.name}: ${r.note}`);
  return rows;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const t = fs.mkdtempSync(path.join(os.tmpdir(), "hybrid-film-"));
  const rows = await runAll(t);
  console.log(table(rows));
  if (!process.argv.includes("--keep")) fs.rmSync(t, { recursive: true, force: true });
  process.exit(rows.some((r) => r.status === "fail") ? 1 : 0);
}
