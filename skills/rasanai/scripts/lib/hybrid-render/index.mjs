// hybrid-render/index.mjs: planning and running of fragment renders (graph + cache come from W1 and are imported lazily).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildHost, parseHosts } from "./host.mjs";
import { renderHost, assemble, probeVideo, hyperframesVersion } from "./engine.mjs";
import { slotCount } from "../slot.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS = path.resolve(HERE, "..", "..");
const need = (cond, msg) => { if (!cond) { const e = new Error(msg); e.unable = true; throw e; } };

// W1 modules: absent means a clear "unable", never a silent substitute
export async function loadDeps() {
  const graphCli = path.join(SCRIPTS, "hybrid-graph.mjs"), cacheMod = path.join(HERE, "..", "render-cache", "index.mjs");
  need(fs.existsSync(graphCli), `hybrid-graph.mjs is not present (${graphCli}): the edit graph (contract C2, W1) is required to know which scenes changed`);
  need(fs.existsSync(cacheMod), `lib/render-cache/index.mjs is not present: the content-addressed cache (contract C3, W1) is required`);
  const cache = await import(cacheMod);
  need(typeof cache.openCache === "function" && typeof cache.cacheKey === "function", "lib/render-cache/index.mjs does not export openCache/cacheKey (contract C3)");
  return { graphCli, ...cache };
}

function graphCmd(deps, sub, args) {
  const r = spawnSync("node", [deps.graphCli, sub, ...args], { encoding: "utf8", maxBuffer: 64 << 20 });
  let json = null; try { json = JSON.parse(r.stdout); } catch {}
  return { code: r.status, json, err: r.stderr };
}

export function resolvePaths(args) {
  const run = path.resolve(String(args.run || args.film || ""));
  need(args.run || args.film, "--run <run> (or --film <film>) is required");
  const film = path.resolve(String(args.film || run));
  const project = path.resolve(String(args.project || [film, run].find((d) => fs.existsSync(path.join(d, "index.html"))) || film));
  need(fs.existsSync(path.join(project, "index.html")), `no index.html in ${project} (pass --project <hyperframes dir>)`);
  const cacheDir = path.resolve(String(args["cache-dir"] || path.join(film, "hybrid", "cache")));
  return { run, film, project, cacheDir };
}

// compile the graph (writes <film>/hybrid/edit-graph.json) and report what changed against the previous one
export function loadGraph(deps, P, { quiet } = {}) {
  const base = ["--run", P.run, ...(P.film !== P.run ? ["--film", P.film] : [])];
  const pre = graphCmd(deps, "affected", base);            // informational: compares with the graph still on disk
  const c = graphCmd(deps, "compile", base);
  need(c.code === 0, `hybrid-graph compile failed (exit ${c.code}): ${(c.err || "").trim().split("\n").slice(-3).join(" | ")}`);
  const gp = path.join(P.film, "hybrid", "edit-graph.json");
  const graph = JSON.parse(fs.readFileSync(gp, "utf8"));
  return { graph, graph_changed: pre.json && pre.code === 0 ? { changed: pre.json.changed, scenes_to_render: pre.json.scenes_to_render } : null };
}

export function sceneNodes(graph) { return graph.nodes.filter((n) => n.kind === "scene-render" && n.scene_id); }

export function planScenes(deps, graph, cache, mode, project) {
  const fps = graph.fps || { num: 30, den: 1 };
  const hf = hyperframesVersion();
  const html = fs.readFileSync(path.join(project, "index.html"), "utf8");
  const hosts = parseHosts(html);
  return sceneNodes(graph).map((n) => {
    const o = n.output || {};
    const f = { num: o.fps_num || fps.num, den: o.fps_den || fps.den };
    const key = deps.cacheKey({ kind: "hybrid-render/scene-clip", v: 1, node_key: n.content_key, mode, hyperframes: hf, fps: f, width: o.width || graph.frame_size.w, height: o.height || graph.frame_size.h });
    const hit = cache.lookup(key, { deep: false });
    const host = hosts.find((h) => h.composition_id === n.scene_id || h.el_id === n.scene_id || h.el_id === `slot-${n.scene_id}`);
    const dur = host ? host.duration_s : null;
    return { node: n, scene_id: n.scene_id, key, fps: f, width: o.width || graph.frame_size.w, height: o.height || graph.frame_size.h, duration_s: dur,
      expected_frames: dur ? Math.round(dur * f.num / f.den) : null, hit: hit.hit, miss_reason: hit.hit ? null : hit.reason, file: hit.hit ? hit.file : null };
  });
}

async function pool(items, n, fn) {
  const q = [...items]; const out = [];
  await Promise.all(Array.from({ length: Math.max(1, n) }, async () => { while (q.length) { const it = q.shift(); out.push(await fn(it)); } }));
  return out;
}

export function findAudio(run, explicit) {
  if (explicit) return path.resolve(String(explicit));
  for (const rel of ["audio/mix.wav", "audio/final-mix.wav", "audio/mix.m4a", "audio/final.wav", "audio/music.wav", "audio/music.mp3", "audio/music.m4a"]) if (fs.existsSync(path.join(run, rel))) return path.join(run, rel);
  return null;
}

// preview | delivery
export async function renderFilm({ args, mode, log = (s) => process.stderr.write(s + "\n") }) {
  const deps = await loadDeps(); const P = resolvePaths(args);
  const cache = deps.openCache(P.cacheDir);
  const t0 = Date.now();
  const { graph, graph_changed } = loadGraph(deps, P);
  let plan = planScenes(deps, graph, cache, mode, P.project);
  need(plan.length > 0, "the edit graph has no scene-render nodes");
  const lacking = plan.filter((p) => !p.duration_s); need(!lacking.length, `scene(s) ${lacking.map((p) => p.scene_id).join(", ")} have no composition host in ${path.join(P.project, "index.html")}`);
  const first = args.scene && args.scene !== true ? String(args.scene) : null;
  if (first) need(plan.some((p) => p.scene_id === first), `scene "${first}" is not in the graph (${plan.map((p) => p.scene_id).join(", ")})`);
  const todo = plan.filter((p) => !p.hit).sort((a, b) => (b.scene_id === first) - (a.scene_id === first));
  const results = new Map();
  if (args["dry-run"]) {
    return { ok: true, dry_run: true, mode, scenes_to_render: todo.map((p) => p.scene_id), scenes_reused: plan.filter((p) => p.hit).map((p) => p.scene_id), miss_reasons: Object.fromEntries(todo.map((p) => [p.scene_id, p.miss_reason])), graph_changed };
  }
  let done = 0, sumMs = 0;
  await pool(todo, Math.min(slotCount() || 1, todo.length), async (p) => {
    const hostDir = path.join(P.film, "hybrid", "hosts", p.scene_id);
    const r = await cache.produce(p.key, async (tmp) => {
      const h = buildHost({ project: P.project, hostDir, sceneId: p.scene_id });
      const out = path.join(tmp, `${p.scene_id}.mp4`);
      const rr = await renderHost({ hostDir, outFile: out, fps: p.fps, mode, workers: args.workers, label: `hybrid-render ${p.scene_id}` });
      const pv = probeVideo(out);
      if (!pv) throw new Error(`scene ${p.scene_id}: rendered file is unreadable`);
      if (Math.abs(pv.frames - p.expected_frames) > 1) throw new Error(`scene ${p.scene_id}: ${pv.frames} frames rendered, ${p.expected_frames} expected (frame drift)`);
      if (pv.frames !== p.expected_frames) log(`warning: scene ${p.scene_id}: ${pv.frames} frames vs ${p.expected_frames} computed (rounding of a fractional duration); the rendered count is authoritative`);
      p.render_ms = rr.ms; p.frames = pv.frames; p.probe = pv;
      return { file: out, meta: { expected_frames: pv.frames, sample_rate: null, color_space: pv.color_space, alpha: "none", time_base: `1/${p.fps.num}*${p.fps.den}`, tool_version: `hyperframes ${hyperframesVersion()} ${mode}` } };
    }, { label: `hybrid-render ${p.scene_id}`, deep: false });
    p.file = r.file; p.hit = true; p.produced = r.produced; p.frames = p.frames ?? r.meta.expected_frames;
    done++; sumMs += p.render_ms || 0;
    const left = todo.length - done;
    log(`[${done}/${todo.length}] scene ${p.scene_id} ${r.produced ? `rendered in ${p.render_ms} ms` : "produced by another process"}${left ? `, ETA ~${Math.round((sumMs / done) * left / 1000)} s` : ""}`);
  });
  const clips = plan.map((p) => { const g = cache.lookup(p.key, { deep: false }); need(g.hit, `scene ${p.scene_id} has no valid cached clip after render`); cache.touch(p.key); return { ...p, file: g.file, frames: g.meta.expected_frames }; });
  const totalFrames = clips.reduce((n, c) => n + c.frames, 0), fps = clips[0].fps;
  for (const c of clips) need(c.fps.num === fps.num && c.fps.den === fps.den && c.width === clips[0].width && c.height === clips[0].height, "scenes disagree on fps or frame size; a re-encode assembly is not implemented");
  const sig = new Set(clips.map((c) => { const pv = probeVideo(c.file); return `${pv.codec}/${pv.pix_fmt}/${pv.width}x${pv.height}`; }));
  need(sig.size === 1, `scene clips differ in codec/pix_fmt/size (${[...sig].join(" vs ")}); stream-copy concat is unsafe`);
  const outFile = path.resolve(String(args.out || path.join(P.film, "hybrid", "renders", `${mode}.mp4`)));
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const audio = findAudio(P.run, args.audio);
  const durationS = totalFrames * fps.den / fps.num;
  const ta = Date.now();
  const final = await assemble({ clips: clips.map((c) => c.file), audio, outFile, totalFrames, fps, durationS, delivery: mode === "delivery" });
  if (mode === "delivery") {   // the delivered version is pinned: its clips survive any purge
    const pf = path.join(P.film, "hybrid", "renders", "delivered.json");
    try { for (const k of JSON.parse(fs.readFileSync(pf, "utf8")).keys || []) cache.unpin(k); } catch {}
    for (const c of clips) cache.pin(c.key);
    fs.writeFileSync(pf, JSON.stringify({ schema_version: 1, keys: clips.map((c) => c.key), file: path.relative(P.film, outFile), frames: totalFrames }, null, 2) + "\n");
  }
  return {
    ok: true, mode, out: outFile, frames: totalFrames, duration_s: Number(durationS.toFixed(6)), fps, size: `${final.width}x${final.height}`, audio: audio ? path.relative(P.run, audio) : null,
    scenes: clips.map((c) => ({ scene_id: c.scene_id, action: todo.some((t) => t.scene_id === c.scene_id) ? "rendered" : "reused", frames: c.frames, render_ms: c.render_ms ?? null, miss_reason: c.miss_reason, key: c.key })),
    scenes_rendered: todo.map((p) => p.scene_id), scenes_reused: plan.filter((p) => !todo.includes(p)).map((p) => p.scene_id),
    timings_ms: { total: Date.now() - t0, assemble: Date.now() - ta }, cache: cache.stats(), graph_changed,
  };
}

export async function status(args) {
  const deps = await loadDeps(); const P = resolvePaths(args);
  const cache = deps.openCache(P.cacheDir);
  const { graph } = loadGraph(deps, P);
  const modes = {};
  for (const mode of ["preview", "delivery"]) {
    const plan = planScenes(deps, graph, cache, mode, P.project);
    const out = path.join(P.film, "hybrid", "renders", `${mode}.mp4`);
    modes[mode] = { scenes: plan.map((p) => ({ scene_id: p.scene_id, state: p.hit ? "ready" : cache.state(p.key), miss_reason: p.miss_reason })), up_to_date: plan.every((p) => p.hit), output: fs.existsSync(out) ? { file: out, size_bytes: fs.statSync(out).size } : null };
  }
  return { ok: true, graph_source_digest: graph.source_digest, modes, cache: cache.stats() };
}

export async function purge(args) {
  const deps = await loadDeps(); const P = resolvePaths(args);
  const cache = deps.openCache(P.cacheDir);
  const mb = args["max-mb"] && args["max-mb"] !== true ? Number(args["max-mb"]) : null;
  need(args.all || mb !== null, "purge needs --all or --max-mb <n> (the delivered version stays pinned either way)");
  return { ok: true, ...cache.purge({ all: !!args.all, maxBytes: mb !== null ? mb * 1048576 : undefined, dryRun: !!args["dry-run"] }), cache: cache.stats() };
}

// ---- bench: cold vs warm vs one-scene change -------------------------------------------------------------------------------------------
function shadow(src, dst, copy) {   // symlink every top-level entry, but copy the named ones so they can be edited
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src)) {
    if (["hybrid", "renders", "node_modules", ".git"].includes(e) && !copy.includes(e)) continue;
    const from = path.join(src, e), to = path.join(dst, e);
    if (copy.includes(e)) fs.cpSync(from, to, { recursive: true, filter: (f) => !/[\\/]hybrid[\\/](cache|hosts|renders)([\\/]|$)/.test(f) });
    else fs.symlinkSync(from, to);
  }
}

export async function bench(args) {
  const deps = await loadDeps(); const P = resolvePaths(args);
  const mode = args.mode === "delivery" ? "delivery" : "preview";
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rasanai-hr-bench-"));
  const cacheDir = path.join(tmp, "cache");
  const base = { ...args, "cache-dir": cacheDir, scene: undefined, out: path.join(tmp, "out.mp4") };
  const timed = async (a, label) => { const t = Date.now(); const r = await renderFilm({ args: a, mode }); return { label, wall_ms: Date.now() - t, scenes_rendered: r.scenes_rendered, scenes_reused: r.scenes_reused, frames: r.frames, per_scene_ms: Object.fromEntries(r.scenes.filter((s) => s.render_ms).map((s) => [s.scene_id, s.render_ms])), assemble_ms: r.timings_ms.assemble }; };
  const du = (d) => { let n = 0; const w = (p) => { for (const e of fs.readdirSync(p, { withFileTypes: true })) { const f = path.join(p, e.name); e.isDirectory() ? w(f) : (n += fs.statSync(f).size); } }; try { w(d); } catch {} return n; };
  const cold = await timed(base, "cold (empty cache)");
  const cacheBytes = du(cacheDir);
  const warm = await timed(base, "warm (everything cached)");
  // one scene changes: edit it in a shadow copy of the film (score scene + its composition file), same cache
  const graph = JSON.parse(fs.readFileSync(path.join(P.film, "hybrid", "edit-graph.json"), "utf8"));
  const ids = sceneNodes(graph).map((n) => n.scene_id);
  const target = args.scene && args.scene !== true ? String(args.scene) : ids[Math.floor(ids.length / 2)];
  need(ids.includes(target), `bench scene "${target}" not in the graph`);
  const runC = path.join(tmp, "run"), filmC = P.film === P.run ? runC : path.join(tmp, "film"), projC = P.project === P.film ? filmC : P.project === P.run ? runC : P.project;
  shadow(P.run, runC, ["motion", "hybrid", "compositions", "index.html"].filter((e) => fs.existsSync(path.join(P.run, e))));
  if (filmC !== runC) shadow(P.film, filmC, ["hybrid", "compositions", "index.html"].filter((e) => fs.existsSync(path.join(P.film, e))));
  const sp = path.join(runC, "motion", "score.json"), score = JSON.parse(fs.readFileSync(sp, "utf8"));
  const sc = (score.scenes || []).find((s, i) => String(s.id ?? `s${s.n}`) === target || `s${i + 1}` === target);
  need(sc, `scene "${target}" not found in the score copy`);
  sc.bench_edit = "bench-" + Date.now(); fs.writeFileSync(sp, JSON.stringify(score, null, 2));
  const host = parseHosts(fs.readFileSync(path.join(projC, "index.html"), "utf8")).find((h) => h.composition_id === target || h.el_id === target || h.el_id === `slot-${target}`);
  if (host && host.src && fs.existsSync(path.join(projC, host.src))) fs.appendFileSync(path.join(projC, host.src), `\n<!-- bench edit ${sc.bench_edit} -->\n`);
  const change = await timed({ ...base, run: runC, film: filmC, project: projC }, `one scene changed (${target})`);
  const ratio = cold.wall_ms / change.wall_ms;
  const minRender = Math.min(...Object.values(cold.per_scene_ms).filter(Boolean));
  const perScene = Object.values(cold.per_scene_ms), sumRender = perScene.reduce((a, b) => a + b, 0);
  const res = { ok: true, mode, scenes: ids.length, cold, warm, one_scene_change: change, speedup_vs_cold: Number(ratio.toFixed(2)), target_3x_met: ratio >= 3, cache_bytes_after_cold: cacheBytes, cache_bytes_after_change: du(cacheDir), measured: ["wall time", "frames", "disk bytes"], not_measured: ["CPU/GPU use", "peak RAM"], tokens: 0 };
  if (ratio < 3) res.bottleneck = `a scene render costs ${Math.round(minRender)}-${Math.round(Math.max(...perScene))} ms each, of which a fixed HyperFrames startup (npx + Chrome launch) of several seconds dominates for short scenes; ${ids.length} scenes cannot give ${Math.min(3, ids.length)}x unless the scenes are long (sum of scene renders ${sumRender} ms vs the single re-render ${Object.values(change.per_scene_ms).reduce((a, b) => a + b, 0)} ms); the ceiling is about ${ids.length}x for equal scenes`;
  if (!args.keep) fs.rmSync(tmp, { recursive: true, force: true }); else res.kept = tmp;
  return res;
}
