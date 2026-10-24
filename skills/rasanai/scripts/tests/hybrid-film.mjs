#!/usr/bin/env node
// hybrid-film: the seven Hybrid Film Studio fixture cases (plan section 11). Fixtures are generated at run time into a temp dir (fixtures/hybrid-film/gen.mjs).
//   node scripts/tests/hybrid-film.mjs [--keep]      prints a table of pass / fail / pending; exit 1 only when a case FAILS (pending is not a failure and never a pass)
//   also usable as: export default async function ({ ok, node, tmp })   (ok(cond, label); the table is printed and failures call ok(false))
// Cases 5 (tracking), 6 (compositor) and 8 (one hybrid film end to end: fake plate -> adopt -> sources.json -> track -> composite -> render -> track-only change) run the real scripts.
//   5 Level 1 needs swiftc and 8 needs HyperFrames (npx hyperframes) + ffmpeg: without them the case is pending with the reason, never a pass.
// A case is `pending` when the script it exercises does not exist yet, or answers a usage error (exit 2: the CLI shape differs from ADAPTERS below, so no verdict is possible).
// ADAPTERS is the one place to align command lines with the finished tools.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as G from "./fixtures/hybrid-film/gen.mjs";
import * as M from "./fixtures/hybrid-film/measure.mjs";
import { makeHyperFilm } from "./fixtures/hybrid-film/hf.mjs";

const SCRIPTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const has = (f) => fs.existsSync(path.join(SCRIPTS, f));
const run = (script, args) => {
  const r = spawnSync(process.execPath, [path.join(SCRIPTS, script), ...args], { encoding: "utf8", timeout: 120000 });
  let json = null; try { json = JSON.parse(r.stdout); } catch {}
  return { code: r.status, json, out: r.stdout, err: r.stderr };
};
const ADAPTERS = {
  graph: (film) => run("hybrid-graph.mjs", ["compile", "--run", film, "--film", film]),         // writes <film>/hybrid/edit-graph.json
  // `cache verify` lists every invalid key as a problem; a key is a hit when it is a cache dir and not in that list
  cacheStatus: (film, keys) => {
    const r = run("hybrid-graph.mjs", ["cache", "verify", "--film", film]);
    const bad = new Set(((r.json && r.json.problems) || []).map((p) => String(p).split(":")[0]));
    return { ...r, json: r.json && { hits: keys.filter((k) => !bad.has(k)), misses: keys.filter((k) => bad.has(k)) } };
  },
  track: (film, a) => run("track.mjs", [...a.slice(0, 1), "--film", film, ...a.slice(1)]),
  trackEval: (film, id, truth) => { const f = path.join(film, "truth.json"); fs.writeFileSync(f, JSON.stringify(truth)); return run("track.mjs", ["eval", "--track", path.join(film, "hybrid", "tracks", id + ".json"), "--truth", f]); },
  composite: (o) => run("composite.mjs", ["--base", o.base, "--content", o.content, "--track", o.track, ...(o.matte ? ["--matte", o.matte] : []), "--out", o.out]),
  video: (film, a) => run("video-generation.mjs", [a[0], "--film", film, ...a.slice(1)]),
  render: (film, a) => run("hybrid-render.mjs", [a[0], "--run", film, ...a.slice(1)]),
  record: (runDir, edit) => run("editor-patch.mjs", ["record", "--run", runDir, "--project", runDir, "--json", JSON.stringify(edit)]),
};
// hybrid-render.mjs needs a HyperFrames project and ffmpeg to render a scene, so the concurrent-writer contract is exercised on the cache
// every renderer publishes through (lib/render-cache produce): N processes, one key, a slow producer that logs each call.
const WRITER = `import { openCache } from ${JSON.stringify(path.join(SCRIPTS, "lib", "render-cache", "index.mjs"))};
import fs from "node:fs"; import path from "node:path";
const [dir, key, log] = process.argv.slice(1);
const r = await openCache(dir).produce(key, async (tmp) => { fs.appendFileSync(log, "p\\n"); await new Promise((s) => setTimeout(s, 700)); fs.writeFileSync(path.join(tmp, "clip.mp4"), "synthetic-clip-bytes"); return { file: "clip.mp4", meta: { expected_frames: null, color_space: "bt709", alpha: "none", time_base: "1/30", tool_version: "fixture" } }; });
process.exit(r.hit ? 0 : 3);`;

const log8 = (m) => process.stderr.write(m + "\n");
const PEND = (why) => ({ status: "pending", note: why });
const PASS = (note = "") => ({ status: "pass", note });
const FAIL = (note) => ({ status: "fail", note });
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
    const a = ADAPTERS.graph(f); if (a.code !== 0) return FAIL("graph build exit " + a.code);
    const b1 = fs.readFileSync(path.join(f, "hybrid", "edit-graph.json"));
    ADAPTERS.graph(f);
    return Buffer.compare(b1, fs.readFileSync(path.join(f, "hybrid", "edit-graph.json"))) === 0 ? PASS("deterministic") : FAIL("graph not byte-identical across runs");
  }],
  ["2 copy-edit-scene-2-only", (tmp) => {
    if (!has("hybrid-graph.mjs")) return PEND("hybrid-graph.mjs missing");
    const f = G.makeFilm(mkdir(tmp, "film2"));
    const a = ADAPTERS.graph(f); if (a.code !== 0) return FAIL("graph build exit " + a.code);
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
    const r = ADAPTERS.cacheStatus(f, Object.values(c.keys)); if (!r.json) return FAIL("cache verify gave no JSON (exit " + r.code + ")");
    const hits = new Set(r.json.hits || []);
    const wrong = [...c.expectMiss.filter((k) => hits.has(k)), ...c.expectHit.filter((k) => !hits.has(k))];
    return wrong.length ? FAIL("wrong verdict for " + wrong.length + " key(s)") : PASS("1 hit, " + c.expectMiss.length + " misses (real cache verify)");
  }],
  ["4 concurrent-same-key", (tmp) => {
    if (!has("lib/render-cache/index.mjs")) return PEND("render-cache missing");
    const dir = path.join(mkdir(tmp, "film4"), "hybrid", "cache"), log = path.join(tmp, "producer4.log");
    const key = G.sha256("concurrent-key");
    return new Promise((resolve) => {
      import("node:child_process").then(({ spawn }) => {
        const codes = []; let done = 0;
        for (let i = 0; i < 3; i++) {
          const p = spawn(process.execPath, ["--input-type=module", "-e", WRITER, dir, key, log], { stdio: "ignore" });
          p.on("close", (code) => { codes.push(code); if (++done === 3) {
            if (codes.some((c) => c !== 0)) return resolve(FAIL("exit codes " + codes));
            const calls = fs.existsSync(log) ? fs.readFileSync(log, "utf8").trim().split("\n").length : 0;
            const names = fs.readdirSync(path.join(dir, key));
            const stray = names.filter((n) => n.endsWith(".tmp") || n.startsWith(".tmp-") || n.startsWith(".work-") || n === ".lock");
            if (calls !== 1) return resolve(FAIL("producer ran " + calls + " times, want 1"));
            resolve(stray.length ? FAIL("stray files " + stray.join(",")) : PASS("3 writers, 1 producer call, one consistent key dir"));
          } });
        }
      });
    });
  }],
  ["5 synthetic-phone-corners", (tmp) => {
    if (!G.ffmpegOk()) return PEND("ffmpeg missing");
    if (!has("track.mjs")) return PEND("track.mjs missing (fixture ok)");
    const film = mkdir(tmp, "film5"), { video, truth } = G.makePhone(path.join(film, "assets"));
    const probe = spawnSync("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", video], { encoding: "utf8" });
    if (Number(probe.stdout.trim()) !== truth.frames.length) return FAIL("video frame count != truth");
    const kf = (name, idx) => { const f = path.join(film, name); fs.writeFileSync(f, JSON.stringify(idx.map((i) => truth.frames[i]))); return f; };
    // Level 0: manual quads at first / middle / last frame, interpolated to every frame (measures the interpolation against exact truth)
    const l0 = ADAPTERS.track(film, ["level0", "--asset", "assets/phone.mp4", "--id", "phone-l0", "--keyframes", kf("kf0.json", [0, 12, 23])]);
    if (l0.code !== 0) return FAIL("level0 exit " + l0.code + ": " + ((l0.json && l0.json.error) || l0.err.trim().slice(0, 120)));
    const e0 = ADAPTERS.trackEval(film, "phone-l0", truth);
    if (!e0.json || !(e0.json.max_px < 2) || e0.json.frames_over_tolerance !== 0) return FAIL("level0 reprojection error mean " + (e0.json && e0.json.mean_px) + " max " + (e0.json && e0.json.max_px) + " px (limit 2)");
    const note0 = "L0 mean " + e0.json.mean_px.toFixed(3) + " max " + e0.json.max_px.toFixed(3) + " px";
    // Level 1: Apple Vision from the first frame's quad only (no later anchors)
    if (spawnSync("/usr/bin/swiftc", ["--version"], { encoding: "utf8" }).status !== 0) return PEND(note0 + "; Level 1 needs /usr/bin/swiftc (absent): Level 1 not run");
    const l1 = ADAPTERS.track(film, ["track", "--asset", "assets/phone.mp4", "--id", "phone-l1", "--keyframes", kf("kf1.json", [0])]);
    if (l1.json && l1.json.unavailable) return PEND(note0 + "; Level 1 unavailable: " + l1.json.error);
    if (l1.code !== 0) return FAIL("level1 exit " + l1.code + ": " + ((l1.json && l1.json.error) || l1.err.trim().slice(0, 120)));
    const e1 = ADAPTERS.trackEval(film, "phone-l1", truth);
    if (!e1.json || !(e1.json.max_px < 2) || !(e1.json.mean_px < 2) || e1.json.frames_over_tolerance !== 0) return FAIL("level1 reprojection error mean " + (e1.json && e1.json.mean_px) + " max " + (e1.json && e1.json.max_px) + " px (limit 2)");
    if (e1.json.wrong_but_confident !== 0) return FAIL(e1.json.wrong_but_confident + " frame(s) wrong but confident");
    return PASS(note0 + "; L1 (Vision, first-frame quad only) mean " + e1.json.mean_px.toFixed(3) + " max " + e1.json.max_px.toFixed(3) + " px, " + e1.json.flagged_low_confidence + "/" + e1.json.frames + " frames flagged low-confidence (status " + l1.json.status + ")");
  }],
  ["6 silhouette-occlusion", (tmp) => {
    if (!G.ffmpegOk()) return PEND("ffmpeg missing");
    if (!has("composite.mjs") || !has("track.mjs")) return PEND("composite.mjs / track.mjs missing (fixture ok)");
    const W = 320, H = 180, dir = mkdir(tmp, "film6"), content = M.makeContent(path.join(dir, "content"));
    const kfs = (t, name) => { const f = path.join(dir, name); fs.writeFileSync(f, JSON.stringify([0, 12, 23].map((i) => t.frames[i]))); return f; };
    // phone: composite through the tracker's own Level 0 track file, corner error against exact truth
    const ph = G.makePhone(path.join(dir, "phone", "assets"));
    const t1 = ADAPTERS.track(path.join(dir, "phone"), ["level0", "--asset", "assets/phone.mp4", "--id", "t", "--keyframes", kfs(ph.truth, "kf-phone.json")]);
    if (t1.code !== 0) return FAIL("phone level0 failed: " + t1.err.trim().slice(0, 120));
    const o1 = path.join(dir, "o1.mp4"), c1 = ADAPTERS.composite({ base: ph.video, content, track: path.join(dir, "phone", "hybrid", "tracks", "t.json"), out: o1 });
    if (c1.code !== 0) return FAIL("composite (phone) exit " + c1.code + ": " + ((c1.json && c1.json.error) || c1.err.trim().slice(0, 120)));
    const ce = M.cornerError(o1, ph.truth.frames, { W, H });
    if (!(ce.worst < 2)) return FAIL("corner error worst " + ce.worst + " px (mean " + ce.mean + ", limit 2)");
    // occlusion: the silhouette matte must keep the foreground in front of the replaced screen
    const oc = G.makeOcclusion(path.join(dir, "occl", "assets"));
    const peak = Math.max(...oc.truth.frames.map((x) => x.occluded_fraction));
    if (!(peak > 0.2 && oc.truth.frames[0].occluded_fraction === 0)) return FAIL("occlusion truth degenerate");
    const t2 = ADAPTERS.track(path.join(dir, "occl"), ["level0", "--asset", "assets/phone.mp4", "--id", "t", "--keyframes", kfs(oc.truth, "kf-occl.json")]);
    if (t2.code !== 0) return FAIL("occlusion level0 failed: " + t2.err.trim().slice(0, 120));
    const o2 = path.join(dir, "o2.mp4"), c2 = ADAPTERS.composite({ base: oc.video, content, track: path.join(dir, "occl", "hybrid", "tracks", "t.json"), matte: oc.matte, out: o2 });
    if (c2.code !== 0) return FAIL("composite (occlusion) exit " + c2.code + ": " + ((c2.json && c2.json.error) || c2.err.trim().slice(0, 120)));
    const oo = M.occlusion(o2, oc.video, oc.matte, oc.truth.frames, { W, H });
    if (!(oo.fgTot > 1000)) return FAIL("only " + oo.fgTot + " silhouette pixels inside the screen: nothing measured");
    const match = oo.fgMatch / oo.fgTot, leak = oo.leak / oo.fgTot;
    if (match < 0.98 || leak > 0.005) return FAIL("occluded pixels show the foreground in " + (100 * match).toFixed(2) + "% (need >= 98%), bright content leaks into " + (100 * leak).toFixed(2) + "% (limit 0.5%)");
    return PASS("corner error mean " + ce.mean.toFixed(3) + " worst " + ce.worst.toFixed(3) + " px; occlusion: " + (100 * match).toFixed(2) + "% of " + oo.fgTot + " silhouette pixels equal the foreground, " + oo.leak + " leak (peak occlusion " + peak + ")");
  }],
  ["7 stale-edit-conflict", (tmp) => {
    const run = mkdir(tmp, "run7"), { edit } = G.staleEdit(run);
    const r = ADAPTERS.record(run, edit);
    const log = path.join(run, "motion", "edits.jsonl");
    if (r.code !== 1 || !r.json || r.json.conflict !== true || r.json.ok !== false) return FAIL("stale new-op edit not refused with conflict (exit " + r.code + ")");
    return fs.existsSync(log) && fs.readFileSync(log, "utf8").trim() ? FAIL("conflict appended a line") : PASS("conflict, nothing appended");
  }],
  ["8 hybrid-film-end-to-end", (tmp) => {
    if (!G.ffmpegOk()) return PEND("ffmpeg missing");
    for (const f of ["video-generation.mjs", "track.mjs", "composite.mjs", "hybrid-render.mjs", "hybrid-graph.mjs"]) if (!has(f)) return PEND(f + " missing");
    const hf = spawnSync("npx", ["--yes", "hyperframes", "--version"], { encoding: "utf8", timeout: 120000 });
    if (hf.status !== 0) return PEND("HyperFrames unavailable (npx hyperframes --version exit " + hf.status + "): scene render not run");
    const film = mkdir(tmp, "film8"); makeHyperFilm(film);
    const step = (label, r, extra = (x) => x.code === 0) => (extra(r) ? null : FAIL(label + ": exit " + r.code + " " + ((r.json && (r.json.error || r.json.unable || (r.json.sources && r.json.sources.errors))) || r.err.trim().slice(-200))));
    const plate = (seed) => {   // fake provider -> adopt: writes the asset, asset.json and the sources.json entry
      const sub = ADAPTERS.video(film, ["submit", "--provider", "fake", "--prompt", "synthetic phone plate", "--layer", "phone.plate", "--consent", "--width", "320", "--height", "180", "--fps", "30", "--duration", "1", "--seed", String(seed)]);
      let bad = step("submit", sub); if (bad) return { bad };
      const id = sub.json.job_id;
      bad = step("status", ADAPTERS.video(film, ["status", "--job", id])) || step("adopt", ADAPTERS.video(film, ["adopt", "--job", id]), (x) => x.code === 0 && x.json.sources && x.json.sources.written === true);
      return bad ? { bad } : { id };
    };
    const quad = (dx) => [[0.3 + dx, 0.2], [0.7 + dx, 0.2], [0.7 + dx, 0.8], [0.3 + dx, 0.8]];
    const retrack = (id, rel, dx0, dx1) => { const f = path.join(film, "kf.json"); fs.writeFileSync(f, JSON.stringify([{ t_s: 0, quad_norm: quad(dx0) }, { t_s: 0.9, quad_norm: quad(dx1) }])); return ADAPTERS.track(film, ["level0", "--asset", rel, "--id", id, "--keyframes", f]); };
    const rend = (...a) => ADAPTERS.render(film, ["preview", ...a]);
    const keysOf = (g) => new Map(g.nodes.map((n) => [n.id, n.content_key]));
    const A = plate(3); if (A.bad) return A.bad;
    const src = readJ(path.join(film, "hybrid", "sources.json")), asset = src.assets.find((a) => a.id === A.id);
    const aj = readJ(path.join(film, "hybrid", "generated", A.id, "asset.json"));
    if (asset.sha256 !== aj.output.sha256 || asset.rights !== "generated" || src.shot_layers[0].layer_id !== "phone.plate" || src.shot_layers[0].scene_id !== "phone") return FAIL("sources.json does not match asset.json / the layer");
    let bad = step("track", retrack("plate-a", asset.path, 0, 0));
    if (bad) return bad;
    // the graph holds a plate node keyed on the asset.json sha256, a track node, and a comp node that depends on both
    bad = step("graph compile", ADAPTERS.graph(film)); if (bad) return bad;
    let g = readJ(path.join(film, "hybrid", "edit-graph.json")); const node = (id) => g.nodes.find((n) => n.id === id);
    const comp0 = node("comp:phone");
    if (!node("source-decode:phone.plate") || !node("track:phone.plate") || !comp0) return FAIL("graph has no plate/track/comp node for phone.plate: " + g.nodes.map((n) => n.id).join(","));
    const up = new Set(), walk = (id) => { for (const d of node(id).depends_on) if (!up.has(d)) { up.add(d); walk(d); } }; walk("comp:phone");
    if (!["track:phone.plate", "source-decode:phone.plate", "scene-render:phone"].every((d) => up.has(d))) return FAIL("comp:phone depends (transitively) on " + [...up].join(","));
    if (node("source-decode:phone.plate").depends_on.length || !node("track:phone.plate").depends_on.includes("trim:phone.plate")) return FAIL("plate/track chain malformed");
    // render: scene 1 plain, scene 2 composited over the generated plate
    const r1 = rend(); bad = step("render", r1); if (bad) return bad;
    const j1 = r1.json;
    if (j1.frames !== 60 || j1.size !== "320x180" || !fs.existsSync(j1.out)) return FAIL("output " + j1.frames + " frames " + j1.size);
    if (j1.comps_rendered.join() !== "phone" || j1.scenes_rendered.join() !== "intro,phone") return FAIL("first render: scenes " + j1.scenes_rendered + " comps " + j1.comps_rendered);
    // pixels: the quad shows the scene (red body), outside it is the plate, the plain scene is untouched
    const px = (t, x, y) => { const r = spawnSync("ffmpeg", ["-v", "error", "-ss", String(t), "-i", j1.out, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 1 << 24 }).stdout; return (xx, yy) => [...r.subarray((yy * 320 + xx) * 3, (yy * 320 + xx) * 3 + 3)]; };
    const at = px(1.5), inQuad = at(110, 45), red = [180, 22, 27];
    if (inQuad.some((v, k) => Math.abs(v - red[k]) > 45)) return FAIL("pixel inside the tracked quad is " + inQuad + ", not the scene's red");
    const plain = at(2, 2); if (Math.abs(plain[0] - red[0]) < 30 && Math.abs(plain[1] - red[1]) < 30 && Math.abs(plain[2] - red[2]) < 30) return FAIL("pixel outside the quad shows the scene, not the plate");
    const k1 = keysOf(g), sc1 = Object.fromEntries(j1.scenes.map((x) => [x.scene_id, x]));
    // change ONLY the track: scene clips are reused, one comp fragment is redone, only the dependent nodes' keys move
    bad = step("retrack", retrack("plate-a", asset.path, 0.1, 0.1)); if (bad) return bad;
    const r2 = rend(); bad = step("re-render after track change", r2); if (bad) return bad;
    g = readJ(path.join(film, "hybrid", "edit-graph.json"));
    const k2 = keysOf(g), moved = [...k2].filter(([id, k]) => k1.get(id) !== k).map(([id]) => id).sort();
    const want = ["color-finish", "comp:phone", "package", "track:phone.plate"].sort();
    if (moved.join() !== want.join()) return FAIL("track-only change moved " + moved.join(",") + " (expected " + want.join(",") + ")");
    const sc2 = Object.fromEntries(r2.json.scenes.map((x) => [x.scene_id, x]));
    if (r2.json.scenes_rendered.length || r2.json.comps_rendered.join() !== "phone" || r2.json.comps_reused.length) return FAIL("track-only change re-rendered scenes " + r2.json.scenes_rendered + " comps " + r2.json.comps_rendered);
    if (sc2.intro.key !== sc1.intro.key || sc2.phone.key !== sc1.phone.key || sc2.phone.comp_key === sc1.phone.comp_key) return FAIL("cache keys: scene clips must stay, the phone comp key must change");
    if (!(r2.json.timings_ms.total < 0.7 * j1.timings_ms.total)) log8("note: second render " + r2.json.timings_ms.total + " ms vs first " + j1.timings_ms.total + " ms");
    // a repeat is all hits
    const r3 = rend(); bad = step("repeat render", r3); if (bad) return bad;
    if (r3.json.scenes_rendered.length || r3.json.comps_rendered.length) return FAIL("repeat render redid " + r3.json.scenes_rendered + r3.json.comps_rendered);
    // change ONLY the plate: until it is re-tracked the render refuses (a track of other bytes is never reused); then only that scene's comp is redone
    const B = plate(4); if (B.bad) return B.bad;
    const rb = rend();
    if (rb.code === 0 || !/no planar-quad track/.test(JSON.stringify(rb.json) + rb.err)) return FAIL("replaced plate without a track was not refused (exit " + rb.code + ")");
    bad = step("track plate B", retrack("plate-b", "assets/generated/" + B.id + ".mp4", 0.1, 0.1)); if (bad) return bad;
    const r4 = rend(); bad = step("render with plate B", r4); if (bad) return bad;
    const sc4 = Object.fromEntries(r4.json.scenes.map((x) => [x.scene_id, x]));
    if (r4.json.scenes_rendered.length || r4.json.comps_rendered.join() !== "phone" || sc4.intro.key !== sc1.intro.key || sc4.phone.key !== sc1.phone.key || sc4.phone.comp_key === sc2.phone.comp_key) return FAIL("plate-only change: scenes " + r4.json.scenes_rendered + " comps " + r4.json.comps_rendered);
    return PASS("fake plate -> adopt -> sources.json -> level0 track -> graph (plate/track/comp) -> composited render " + j1.frames + " frames in " + j1.timings_ms.total + " ms; track-only change redid 1 comp in " + (r2.json.comps_rendered.length ? r2.json.timings_ms.total : "?") + " ms moving only " + moved.join(",") + "; plate-only change redid only phone's comp; repeat = all hits");
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
