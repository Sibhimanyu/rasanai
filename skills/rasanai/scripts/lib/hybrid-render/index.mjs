// hybrid-render/index.mjs: planning and running of fragment renders (graph + cache come from W1 and are imported lazily).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildHost, buildGroupHost, parseHosts } from "./host.mjs";
import { renderHost, assemble, probeVideo, hyperframesVersion } from "./engine.mjs";
import { slotCount } from "../slot.mjs";
import { planComps, renderComp } from "./comp.mjs";
// Plan 09: scene dependencies and content keys, changed-region planning with visible fallbacks, truthful revision events and performance evidence
import { sceneDeps } from "../render-keys.mjs";
import { capabilityBoundary, planIncremental, assemblyCheck, audioPlan, finishPlan, reusedVsRebuilt } from "../incremental-render.mjs";
import { partitionScenes } from "../graph.mjs";
import { emitRevision, newRevisionId } from "../revision-events.mjs";
import { recordPerf } from "../perf-evidence.mjs";
import { publishDeliveredPointer } from "../publish-txn.mjs";
import { readReceipt, currentInputs, reuseDecision } from "../mix-receipt.mjs";
import { finalCompletion } from "../final-label.mjs";

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
  const base = ["--run", P.run, ...(P.film !== P.run ? ["--film", P.film] : []), "--project", P.project]; // the project holds the scene code the keys must include (Plan 09 P5)
  const pre = graphCmd(deps, "affected", base);            // informational: compares with the graph still on disk
  const c = graphCmd(deps, "compile", base);
  need(c.code === 0, `hybrid-graph compile failed (exit ${c.code}): ${(c.err || "").trim().split("\n").slice(-3).join(" | ")}`);
  const gp = path.join(P.film, "hybrid", "edit-graph.json");
  const graph = JSON.parse(fs.readFileSync(gp, "utf8"));
  // graph-level change only: hybrid-graph's own scenes_to_render also counts nodes absent from the cache under their node key, but this renderer stores
  // fragments under its own derived keys, so that list would claim every scene is stale; the render plan (scenes_rendered / comps_rendered) is the truth
  const sceneOf = new Map(graph.nodes.map((n) => [n.id, n.scene_id]));
  return { graph, graph_changed: pre.json && pre.code === 0 ? { changed: pre.json.changed, scenes_changed: [...new Set(pre.json.changed.map((id) => sceneOf.get(id)).filter(Boolean))] } : null };
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
// Plan 09 P7: the render emits revision events that state only what the results prove (lib/revision-events.mjs), and a refusal to admit (resource_blocked) is reported as blocked,
// never as success. A failed or blocked render leaves the previously delivered film exactly as it was.
export async function renderFilm(o) {
  const ctx = { revision_id: null, emitted: [] };
  try { return await renderFilmBody(o, ctx); }
  catch (e) {
    if (ctx.run && ctx.revision_id) emitRevision(ctx.run, { revision_id: ctx.revision_id, stage: e.resource_blocked ? "blocked" : "failed", film: ctx.film, source: ctx.source, scope: ctx.scope || null, queue: e.resource_blocked ? { state: e.state, reason_code: e.reason_code } : null, note: String(e.message).slice(0, 400) });
    throw e;
  }
}
async function renderFilmBody({ args, mode, log = (s) => process.stderr.write(s + "\n") }, ctx) {
  const deps = await loadDeps(); const P = resolvePaths(args);
  const cache = deps.openCache(P.cacheDir);
  const t0 = Date.now();
  const { graph, graph_changed } = loadGraph(deps, P);
  let plan = planScenes(deps, graph, cache, mode, P.project);
  need(plan.length > 0, "the edit graph has no scene-render nodes");
  const lacking = plan.filter((p) => !p.duration_s); need(!lacking.length, `scene(s) ${lacking.map((p) => p.scene_id).join(", ")} have no composition host in ${path.join(P.project, "index.html")}`);
  const first = args.scene && args.scene !== true ? String(args.scene) : null;
  if (first) need(plan.some((p) => p.scene_id === first), `scene "${first}" is not in the graph (${plan.map((p) => p.scene_id).join(", ")})`);
  const comps = planComps(deps, graph, cache, mode, plan, P.film, new Set(plan.map((p) => p.scene_id)));
  const compHit = new Set(comps.filter((c) => c.hit).map((c) => c.scene_id));   // a cached fragment needs no scene clip
  // ---- Plan 09 P6: which render path is SAFE for what changed (scene host -> group host -> continuity group -> full film), with every fallback recorded ----
  const hf = hyperframesVersion();
  const readJ = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
  const score = readJ(path.join(P.run, "motion", "score.json"));
  const caps = capabilityBoundary({ film: P.film, hyperframes_version: hf });
  const changedIds = plan.filter((p) => !p.hit && !compHit.has(p.scene_id)).map((p) => p.scene_id);
  const checkpoints = new Set(); try { for (const f of fs.readdirSync(path.join(P.film, "hybrid", "checkpoints"))) checkpoints.add(f.replace(/\.[^.]+$/, "")); } catch {}
  const incr = planIncremental({ changed: changedIds, score, deps: sceneDeps({ project: P.project, score }), partition: score ? partitionScenes(score, readJ(path.join(P.run, "look", "continuity.json"))) : null, comp_scenes: new Set(comps.map((c) => c.scene_id)), checkpoints, caps });
  const multi = incr.units.filter((u) => u.kind !== "scene");
  if (multi.length && comps.length) throw Object.assign(new Error(`the safe render path for this change is ${multi.map((u) => u.path).join(", ")} (${multi[0].reasons[0]}), but this film has composited scenes and a multi-scene or full-film host cannot carry them: that path is not implemented. Nothing was rendered.`), { unable: true });
  for (const u of incr.units) if (u.path === "verified_fragment") u.fallbacks.push({ step: "verified_fragment", why: "a verified range render is recorded but no executor for it is wired in this tree: rendered as a scene host instead" }), (u.path = "scene_host");
  const sceneOrder = plan.map((p) => p.scene_id), byScene = new Map(plan.map((p) => [p.scene_id, p]));
  if (multi.length) {
    const taken = new Set(), merged = [];
    const unitAt = new Map(); for (const u of multi) for (const sc of u.scenes) unitAt.set(sc, u);
    for (const id of sceneOrder) {
      const u = unitAt.get(id);
      if (!u) { merged.push(byScene.get(id)); continue; }
      if (taken.has(u)) continue; taken.add(u);
      const members = u.scenes.map((s) => byScene.get(s));
      const f0 = members[0].fps, spanS = members.reduce((a, m) => a + m.duration_s, 0);
      const nodeKeys = members.map((m) => m.node.content_key);
      const kind = u.kind === "film" ? "film" : "group";
      const key = deps.cacheKey({ kind: `hybrid-render/${kind}-clip`, v: 1, path: u.path, nodes: nodeKeys, handles: u.handles.map((h) => [h.scene, h.side, h.shutter_handle_frames]), mode, hyperframes: hf, fps: f0, width: members[0].width, height: members[0].height });
      const hit = cache.lookup(key, { deep: false });
      merged.push({ node: members[0].node, scene_id: kind === "film" ? "__film__" : `g:${u.scenes.join("+")}`, scenes: u.scenes, group_unit: kind === "group", film_unit: kind === "film", path: u.path, why: u.reasons, handles: u.handles, fallbacks: u.fallbacks,
        key, fps: f0, width: members[0].width, height: members[0].height, duration_s: spanS, expected_frames: Math.round(spanS * f0.num / f0.den), hit: hit.hit, miss_reason: hit.hit ? null : hit.reason, file: hit.hit ? hit.file : null });
    }
    plan = merged;
  }
  const todo = plan.filter((p) => !p.hit && !compHit.has(p.scene_id)).sort((a, b) => (b.scene_id === first) - (a.scene_id === first));
  ctx.run = P.run; ctx.film = P.film; ctx.source = { score_revision: score ? score.revision ?? null : null, source_digest: graph.source_digest, edit_id: args["edit-id"] && args["edit-id"] !== true ? String(args["edit-id"]) : null, action_id: args["action-id"] && args["action-id"] !== true ? String(args["action-id"]) : null };
  ctx.scope = { scenes: changedIds, time_range: null };
  ctx.revision_id = args["revision-id"] && args["revision-id"] !== true ? String(args["revision-id"]) : newRevisionId(graph.source_digest);
  const pathReport = { units: incr.units.map((u) => ({ kind: u.kind, path: u.path, scenes: u.scenes, handles: u.handles, reasons: u.reasons, fallbacks: u.fallbacks })), film_wide: incr.film_wide, capability: { verified_fragment: caps.verified_fragment.supported, why_not: caps.verified_fragment.why || null }, notes: incr.notes };
  if (!args["dry-run"]) {
    const ev = (stage, extra = {}) => emitRevision(P.run, { revision_id: ctx.revision_id, stage, film: P.film, source: ctx.source, scope: ctx.scope, path: pathReport, ...extra });
    ctx.ev = ev;
    if (graph_changed && graph_changed.changed.length) ev("source_changed", { note: "the source is accepted and nothing is rendered yet", work: { reused: [], rebuilt: [], pending: todo.map((p) => p.scene_id), basis: "plan", invalidation_causes: [] } });
    ev(mode === "delivery" ? "final_rendering" : "preview_pending", { [mode === "delivery" ? "final" : "preview"]: { state: mode === "delivery" ? "rendering" : "pending", kind: "assembled", file: null }, work: { reused: plan.filter((p) => p.hit).map((p) => p.scene_id), rebuilt: [], pending: todo.map((p) => p.scene_id), basis: "plan", invalidation_causes: [] }, queue: { state: "queued", reason_code: null } });
  }
  if (args["dry-run"]) {
    return { ok: true, dry_run: true, mode, scenes_to_render: todo.map((p) => p.scene_id), scenes_reused: plan.filter((p) => p.hit || compHit.has(p.scene_id)).map((p) => p.scene_id),
      comps_to_render: comps.filter((c) => !c.hit).map((c) => c.scene_id), comps_reused: comps.filter((c) => c.hit).map((c) => c.scene_id), miss_reasons: Object.fromEntries(todo.map((p) => [p.scene_id, p.miss_reason])), graph_changed, incremental: pathReport };
  }
  let done = 0, sumMs = 0;
  await pool(todo, Math.min(slotCount() || 1, todo.length), async (p) => {
    const hostDir = path.join(P.film, "hybrid", "hosts", p.scene_id.replace(/[^A-Za-z0-9_.+-]/g, "-"));
    const r = await cache.produce(p.key, async (tmp) => {
      const h = p.film_unit ? { hostDir: P.project } : p.group_unit ? buildGroupHost({ project: P.project, hostDir, sceneIds: p.scenes }) : buildHost({ project: P.project, hostDir, sceneId: p.scene_id });
      const out = path.join(tmp, `${p.scene_id.replace(/[^A-Za-z0-9_.+-]/g, "-")}.mp4`);
      const rr = await renderHost({ hostDir: h.hostDir, outFile: out, fps: p.fps, mode, workers: args.workers, label: `hybrid-render ${p.scene_id}`, film: P.film, run: P.run, priority: args.priority && args.priority !== true ? String(args.priority) : mode === "preview" ? "interactive" : "normal" });
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
  const clips = plan.map((p) => { if (compHit.has(p.scene_id) && !p.hit) return { ...p, file: null, frames: p.expected_frames }; const g = cache.lookup(p.key, { deep: false }); need(g.hit, `scene ${p.scene_id} has no valid cached clip after render`); cache.touch(p.key); return { ...p, file: g.file, frames: g.meta.expected_frames }; });
  // comp nodes: composite the scene clip into its tracked plate; the fragment replaces the plain scene clip in the assembly
  const compTodo = comps.filter((c) => !c.hit);
  for (const c of compTodo) {
    const sc = clips.find((x) => x.scene_id === c.scene_id);
    const r = await cache.produce(c.key, (tmp) => renderComp(c, sc.file, P.film, tmp, log), { label: `hybrid-render comp ${c.scene_id}`, deep: false });
    c.produced = r.produced; log(`comp ${c.scene_id} ${r.produced ? `composited in ${c.render_ms} ms` : "produced by another process"}`);
  }
  for (const c of comps) {
    const g = cache.lookup(c.key, { deep: false }); need(g.hit, `comp ${c.scene_id} has no valid cached fragment after render`); cache.touch(c.key);
    const i = clips.findIndex((x) => x.scene_id === c.scene_id);
    clips[i] = { ...clips[i], scene_key: clips[i].key, key: c.key, file: g.file, frames: g.meta.expected_frames, width: c.width, height: c.height, comp: true };
  }
  const totalFrames = clips.reduce((n, c) => n + c.frames, 0), fps = clips[0].fps;
  for (const c of clips) need(c.fps.num === fps.num && c.fps.den === fps.den && c.width === clips[0].width && c.height === clips[0].height, "scenes disagree on fps or frame size; a re-encode assembly is not implemented");
  // one time base, one intermediate spec: codec, pixel format, size, FRAME RATE and colour space must all match before a stream-copy join (Plan 09 P6)
  const ac = assemblyCheck(clips.map((c) => ({ file: c.file, ...probeVideo(c.file), frames: c.frames })), { fps });
  need(ac.ok, `${ac.problems[0]}${ac.problems.length > 1 ? ` (+${ac.problems.length - 1} more)` : ""}`);
  const outFile = path.resolve(String(args.out || path.join(P.film, "hybrid", "renders", `${mode}.mp4`)));
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const audio = findAudio(P.run, args.audio);
  const durationS = totalFrames * fps.den / fps.num;
  const ta = Date.now();
  const final = await assemble({ clips: clips.map((c) => c.file), audio, outFile, totalFrames, fps, durationS, delivery: mode === "delivery", film: P.film, run: P.run });
  // ---- Plan 09 P7/P8: what was reused vs rebuilt comes from the REAL results; the "ready" event is emitted only after the new file exists and its receipt names this source ----
  const outSha = deps.fileSha256(outFile);
  const results = clips.map((c) => ({ id: c.scene_id, action: todo.some((t) => t.scene_id === c.scene_id) ? "rendered" : "reused" }));
  const rvr = reusedVsRebuilt(results, []);
  const receipt = { edit_id: ctx.source.edit_id, source_digest: ctx.source.source_digest, build_job: args["job-id"] && args["job-id"] !== true ? String(args["job-id"]) : null, attempt: args.attempt ? Number(args.attempt) : null, media_settings: { mode, fps, size: `${final.width}x${final.height}`, codec: final.codec, pix_fmt: final.pix_fmt, color_space: final.color_space, frames: totalFrames, hyperframes: hf }, output_checksum: outSha };
  if (mode === "delivery") {   // the delivered version is pinned: its clips survive any purge. Plan 11 R8: the public pointer moves only after the file exists, its receipt names this source and the checksums agree
    const pf = path.join(P.film, "hybrid", "renders", "delivered.json");
    const moved = publishDeliveredPointer({ pointerFile: pf, film: P.film, outFile, receipt, keys: clips.map((c) => c.key), frames: totalFrames });
    if (!moved.ok) throw new Error(`the delivered pointer was not moved: ${moved.problems[0]} (the previous delivered version is untouched)`);
    for (const k of moved.previous_keys) cache.unpin(k);
    for (const c of clips) cache.pin(c.key);
  }
  const kindKey = mode === "delivery" ? "final" : "preview";
  ctx.ev(mode === "delivery" ? "final_ready" : "preview_ready", { [kindKey]: { state: "ready", kind: "assembled", file: path.relative(P.run, outFile), delivered_kept: null }, receipt, work: { reused: rvr.reused, rebuilt: rvr.rebuilt, pending: [], basis: "dependency_results", invalidation_causes: [] }, queue: null });
  const cold = todo.length === plan.length;
  for (const p of plan) recordPerf(P.run, { kind: "node", node_id: `render_fragment:${p.scene_id}`, resource_class: "video_render", duration_s: p.render_ms != null ? p.render_ms / 1000 : null, active_s: null, queue_wait_s: null, temperature: cold ? "cold" : "warm", outcome: "ok", cache: todo.some((t) => t.scene_id === p.scene_id) ? "rebuilt" : "hit", causes: [] });
  recordPerf(P.run, { kind: "render", mode, render_s: sumMs / 1000, encode_s: (Date.now() - ta) / 1000, peak_rss_mb: null, frames: totalFrames, note: "peak memory is not observable from here; the supervisor (lib/resource-pools.mjs) records it for managed processes" });
  return {
    ok: true, mode, out: outFile, completion: mode === "delivery" ? (finalCompletion(P.run, outFile) || undefined) : undefined, frames: totalFrames, duration_s: Number(durationS.toFixed(6)), fps, size: `${final.width}x${final.height}`, audio: audio ? path.relative(P.run, audio) : null,
    scenes: clips.map((c) => ({ scene_id: c.scene_id, action: todo.some((t) => t.scene_id === c.scene_id) ? "rendered" : "reused", frames: c.frames, render_ms: c.render_ms ?? null, miss_reason: c.miss_reason, key: c.scene_key || c.key, ...(c.comp ? { comp_key: c.key, comp_action: compTodo.some((t) => t.scene_id === c.scene_id) ? "composited" : "reused" } : {}) })),
    comps_rendered: compTodo.map((c) => c.scene_id), comps_reused: comps.filter((c) => !compTodo.includes(c)).map((c) => c.scene_id),
    scenes_rendered: todo.map((p) => p.scene_id), scenes_reused: plan.filter((p) => !todo.includes(p)).map((p) => p.scene_id),
    timings_ms: { total: Date.now() - t0, assemble: Date.now() - ta }, cache: cache.stats(), graph_changed,
    incremental: pathReport, reused_vs_rebuilt: rvr,
    audio: (() => { let rcp = null, cur = null; try { rcp = readReceipt(P.run, "delivery"); cur = currentInputs(P.run); } catch {} const kinds = (graph_changed ? graph_changed.changed : []).map((id) => (graph.nodes.find((n) => n.id === id) || {}).kind); return audioPlan({ changed_node_kinds: kinds, timing_changed: graph_changed && graph_changed.changed.length === 0 ? false : null, receipt: rcp, current_inputs: cur, reuseDecision }); })(), finish: finishPlan({ nodes: graph.nodes }),
    revision: { revision_id: ctx.revision_id, stage: mode === "delivery" ? "final_ready" : "preview_ready", receipt },
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
