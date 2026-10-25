// hybrid-graph: derives the edit graph of contract C2 (<film>/hybrid/edit-graph.json) from a run's authored files, and
// answers the questions the renderer and the editor ask of it: what changed, why, and which scenes must re-render.
// Nothing here is authored: the graph is recomputed from motion/score.json (+ cut decisions, hybrid/sources.json, effects, events,
// applied edits) every time; a hand edit is detected by recompute and overwritten. Node content keys are made by render-cache's
// cacheKey (the only place a key is made), so a key here is exactly the C3 cache key of that node's artifact.
// Style as events.mjs / film-events.mjs. Zero dependencies.
import fs from "node:fs";
import path from "node:path";
import { cacheKey, canonical, sha256, fileSha256, stable } from "../render-cache/index.mjs";
// PLAN 09 P5: what is INSIDE a scene (code bytes, includes, fonts, shared components, time neighbours, unknown dynamic dependencies) joins every scene-render key
import { sceneDeps, sceneKeyInputs, boundaryTime } from "../render-keys.mjs";

export const STAGES = ["source-decode", "trim", "track", "mask", "perspective-warp", "scene-render", "comp", "color-finish", "sound-mix", "package"];
const STATUSES = ["stale", "ready", "rendering", "failed"];
const GRAPH_REL = path.join("hybrid", "edit-graph.json");
const r6 = (x) => Math.round(x * 1e6) / 1e6;
const readJ = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
const exists = (f) => { try { return fs.statSync(f).isFile(); } catch { return false; } };
const safeId = (s) => String(s).replace(/[^A-Za-z0-9_.-]+/g, "-");

export const graphPath = (film) => path.join(film, GRAPH_REL);
export const cacheDir = (film) => path.join(film, "hybrid", "cache");

// "30", 29.97, "30000/1001", {num,den} -> exact fraction
export function parseFps(v) {
  if (v && typeof v === "object" && Number(v.num) > 0 && Number(v.den) > 0) return { num: Number(v.num), den: Number(v.den) };
  if (typeof v === "string" && /^\d+\/\d+$/.test(v)) { const [n, d] = v.split("/").map(Number); if (n > 0 && d > 0) return { num: n, den: d }; }
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  for (const [num, den] of [[24000, 1001], [30000, 1001], [60000, 1001]]) if (Math.abs(n - num / den) < 0.005) return { num, den };
  return Number.isInteger(n) ? { num: n, den: 1 } : { num: Math.round(n * 1000), den: 1000 };
}

function skillVersion() {
  try { return fs.readFileSync(new URL("../../../VERSION", import.meta.url), "utf8").trim(); } catch { return "unknown"; }
}
const COMPONENT_VERSION = 2;   // bump when node definitions here change shape: every key changes with it

// first existing candidate, hashed by bytes; the digest of a missing file is null (recorded, never invented)
function digestOf(root, rels) {
  for (const rel of rels) { const f = path.join(root, rel); if (exists(f)) return { path: rel, sha256: fileSha256(f) }; }
  return { path: rels[0], sha256: null };
}
const hashPath = (root, rel) => { const f = path.join(root, rel); return exists(f) ? fileSha256(f) : null; };

// applied/rendered edits (latest line per id wins; requested/failed/reverted do not change the film yet)
function appliedEdits(run) {
  const f = path.join(run, "motion", "edits.jsonl");
  if (!exists(f)) return [];
  const last = new Map();
  for (const line of fs.readFileSync(f, "utf8").split("\n")) { if (!line.trim()) continue; try { const e = JSON.parse(line); if (e && e.id != null) last.set(e.id, e); } catch {} }
  return [...last.values()].filter((e) => e.status === "applied" || e.status === "rendered").map((e) => ({ id: e.id, operation: e.operation, scene_id: e.scene_id ?? e.scene ?? null, layer_id: e.layer_id ?? null, proposed: e.proposed ?? null }));
}

// Everything the compiler reads. Pure: `inputs` is plain data, so compile(inputs) is deterministic.
export function readInputs(run, film, opts = {}) {
  const score = readJ(path.join(run, "motion", "score.json"));
  const sources = readJ(path.join(film, "hybrid", "sources.json"));
  const files = {
    score: digestOf(run, ["motion/score.json"]),
    cut: digestOf(run, ["footage/cut.json", "reel/cut.json", "cut.json", "scenes.json"]),
    sources: { path: "hybrid/sources.json", sha256: hashPath(film, "hybrid/sources.json") },
    effects: digestOf(run, ["motion/effects.json", "effects.json"]),
    events: digestOf(run, ["motion/events.json"]),
  };
  const audio = ["audio_meta.json", "audio/audio_meta.json", "motion/sfx-plan.json", "sfx-plan.json", "audio/sfx-plan.json", "audio/music.json", "music.json"]
    .map((rel) => ({ path: rel, sha256: hashPath(run, rel) })).filter((x) => x.sha256);
  const musicDir = path.join(run, "audio");
  try { for (const f of fs.readdirSync(musicDir).sort()) if (/^(music|vo|voice|voiceover).*\.(wav|mp3|m4a|aac|flac)$/i.test(f)) audio.push({ path: `audio/${f}`, sha256: fileSha256(path.join(musicDir, f)) }); } catch {}
  const tracks = {};
  try { for (const f of fs.readdirSync(path.join(film, "hybrid", "tracks")).sort()) { if (!f.endsWith(".json")) continue; const t = readJ(path.join(film, "hybrid", "tracks", f)); if (t && t.asset_id) (tracks[t.asset_id] = tracks[t.asset_id] || []).push({ id: t.id || f.replace(/\.json$/, ""), sha256: hashPath(film, `hybrid/tracks/${f}`) }); } } catch {}
  const provenance = {};   // generated plates: the model/workflow/seed identity from hybrid/generated/<id>/asset.json (C3: external model identity)
  const assetDigests = {};   // sha256 recorded in sources.json (validated against bytes by W4's reader); fall back to bytes when readable
  for (const a of (sources && Array.isArray(sources.assets) ? sources.assets : [])) {
    let d = a.sha256 || null;
    if (a.path && typeof a.path === "string" && !a.path.includes("..") && !path.isAbsolute(a.path)) { const f = path.join(film, a.path); if (exists(f)) d = fileSha256(f); }
    assetDigests[a.id] = d;
    const pj = a.rights === "generated" ? readJ(path.join(film, "hybrid", "generated", String(a.id).replace(/[^A-Za-z0-9_.-]/g, "-"), "asset.json")) : null;
    if (pj && pj.output) provenance[a.id] = { model_id: pj.model_id ?? null, model_revision: pj.model_revision ?? null, workflow_digest: pj.workflow_digest ?? null, seed: pj.config ? pj.config.seed ?? null : null, output_sha256: pj.output.sha256 ?? null };
  }
  // Plan 09 P5: the project that holds the scene code (index.html + compositions/): explicit, else the film, else the run. Not found = scene code unknown (never a hit).
  const projectDir = opts.project ? path.resolve(opts.project) : [film, run].find((d) => d && exists(path.join(d, "index.html"))) || null;
  const renderDeps = projectDir ? sceneDeps({ project: projectDir, score }) : null;
  return { score, sources, files, audio, tracks, assetDigests, provenance, renderDeps, edits: appliedEdits(run), engine: opts.engine || {}, versions: { skill: skillVersion(), component: COMPONENT_VERSION } };
}

function sceneList(score, P) {
  const out = [];
  const list = score && Array.isArray(score.scenes) ? score.scenes : [];
  list.forEach((sc, i) => {
    if (!sc || typeof sc !== "object") { P.push(`scenes[${i}]: not an object`); return; }
    const id = sc.id != null ? String(sc.id) : sc.n != null ? `s${sc.n}` : null;
    if (id === null) { P.push(`scenes[${i}]: no id`); return; }
    if (out.some((x) => x.id === id)) { P.push(`duplicate scene id "${id}"`); return; }
    const dur = Number(sc.duration ?? sc.duration_s);
    const start = Number(sc.start ?? sc.start_s ?? (out.length ? out[out.length - 1].start_s + out[out.length - 1].duration_s : 0));
    if (!(Number.isFinite(dur) && dur > 0)) { P.push(`scene "${id}": impossible duration`); return; }
    if (!(Number.isFinite(start) && start >= 0)) { P.push(`scene "${id}": bad start`); return; }
    const { start: _s, end: _e, start_s: _s2, end_s: _e2, ...def } = sc;   // absolute placement is a comp concern, not part of the scene's own render
    out.push({ id, start_s: r6(start), duration_s: r6(dur), def });
  });
  return out;
}

// -> { graph, problems }  (graph is null when the score is unusable)
export function compile(inputs) {
  const P = [];
  const { score } = inputs;
  if (!score || typeof score !== "object") return { graph: null, problems: ["motion/score.json is missing or not valid JSON"] };
  const fps = parseFps(score.fps ?? 30);
  if (!fps) P.push(`fps ${JSON.stringify(score.fps)} is not a positive number or fraction`);
  const fs_ = score.frame_size || {};
  const w = Number(score.width ?? fs_.w ?? 1920), h = Number(score.height ?? fs_.h ?? 1080);
  if (!(w > 0 && h > 0)) P.push("frame size must be positive");
  const scenes = sceneList(score, P);
  if (!scenes.length && !P.length) P.push("score has no scenes");
  if (P.length) return { graph: null, problems: P };

  const eng = { renderer: "hyperframes", codec: "h264", ...(score.render && typeof score.render === "object" ? score.render : {}), ...inputs.engine };
  const color = { color_space: "bt709", ...(score.color && typeof score.color === "object" ? score.color : {}) };
  const colorSpace = String(color.color_space || "bt709");
  const nodes = [], byId = new Map();
  const out = (kind, o = {}) => ({ kind, width: w, height: h, fps_num: fps.num, fps_den: fps.den, pix_fmt: "yuv420p", color_space: colorSpace, alpha: "none", ...o });
  const add = (kind, id, sceneId, depends, def, output, extra = {}) => {
    const deps = [...new Set(depends)].sort();
    const dep_keys = deps.map((d) => byId.get(d).content_key);
    const key_inputs = stable({ node: { kind, id, scene_id: sceneId, ...def }, depends: dep_keys, versions: inputs.versions, size: [output.width, output.height], fps: [fps.num, fps.den], engine: eng, color, ...extra });
    const n = { id, kind, scene_id: sceneId, content_key: cacheKey(key_inputs), depends_on: deps, output, status: "stale" };
    nodes.push(n); byId.set(id, n);
    return n;
  };

  const layers = inputs.sources && Array.isArray(inputs.sources.shot_layers) ? inputs.sources.shot_layers : [];
  const sceneIds = new Set(scenes.map((s) => s.id));
  for (const l of layers) if (!sceneIds.has(l.scene_id)) P.push(`shot layer "${l.layer_id}" names unknown scene "${l.scene_id}"`);
  const edits = inputs.edits;
  const compIds = [];

  for (const sc of scenes) {
    const mine = layers.filter((l) => l.scene_id === sc.id).sort((a, b) => (a.z_index - b.z_index) || String(a.layer_id).localeCompare(String(b.layer_id)));
    const parts = [];
    const sceneEdits = edits.filter((e) => e.scene_id === sc.id && !e.layer_id);
    const render = add("scene-render", `scene-render:${safeId(sc.id)}`, sc.id, [],
      { scene: sc.def, duration_s: sc.duration_s, edits: sceneEdits.map((e) => e.id).sort() },
      out("video", { alpha: mine.length ? "straight" : "none", pix_fmt: mine.length ? "yuva444p" : "yuv420p" }), { range: [0, sc.duration_s], seed: score.seed ?? sc.def.seed ?? null, code: inputs.renderDeps ? sceneKeyInputs({ deps: inputs.renderDeps, score, sceneId: sc.id }) : { known: false, note: "scene code was not read (no index.html): this scene is never a cache hit", unread: true } });
    if (!inputs.renderDeps) render.deps_unknown = true;
    else if (inputs.renderDeps.scenes[sc.id] && inputs.renderDeps.scenes[sc.id].conservative) render.conservative = inputs.renderDeps.scenes[sc.id].dynamic;
    parts.push(render.id);
    for (const l of mine) {
      const tag = safeId(l.layer_id);
      const asset = (inputs.sources.assets || []).find((a) => a.id === l.asset_id) || {};
      const m = asset.media || {};
      const dec = add("source-decode", `source-decode:${tag}`, sc.id, [], { asset_id: l.asset_id, sha256: (inputs.provenance && inputs.provenance[l.asset_id] ? inputs.provenance[l.asset_id].output_sha256 : null) ?? inputs.assetDigests[l.asset_id] ?? null, media: m, provenance: (inputs.provenance && inputs.provenance[l.asset_id]) || null },
        out("video", { width: m.width ?? w, height: m.height ?? h, fps_num: m.fps_num ?? fps.num, fps_den: m.fps_den ?? fps.den }));
      const trim = add("trim", `trim:${tag}`, sc.id, [dec.id], { in_s: l.in_s, duration_s: l.duration_s }, out("video", { alpha: l.render_role === "matte" ? "straight" : "none" }), { range: [l.in_s, r6(l.in_s + l.duration_s)] });
      let last = trim;
      const trk = inputs.tracks[l.asset_id];
      if (trk) last = add("track", `track:${tag}`, sc.id, [trim.id], { tracks: trk }, out("data"));
      if (l.render_role === "matte") last = add("mask", `mask:${tag}`, sc.id, [last.id], { layer: l }, out("alpha", { alpha: "straight", pix_fmt: "gray" }));
      if (l.render_role === "screen-content") last = add("perspective-warp", `perspective-warp:${tag}`, sc.id, [last.id, ...(trk ? [`track:${tag}`] : [])], { layer: l, edits: edits.filter((e) => e.layer_id === l.layer_id).map((e) => e.id).sort() }, out("video", { alpha: "straight", pix_fmt: "yuva444p" }));
      parts.push(last.id);
    }
    const c = add("comp", `comp:${safeId(sc.id)}`, sc.id, parts, { start_s: sc.start_s, duration_s: sc.duration_s, layers: mine.map((l) => [l.layer_id, l.render_role, l.z_index]), transitions: sc.def.transition ?? null, boundary: (() => { const b = boundaryTime(score, sc.id); return { prev: b.prev, next: b.next }; })() }, out("video"), { range: [sc.start_s, r6(sc.start_s + sc.duration_s)] });
    compIds.push(c.id);
  }
  const grade = add("color-finish", "color-finish", null, compIds, { grade: score.grade ?? score.finish ?? null, effects: inputs.files.effects.sha256, color }, out("video"));
  const mix = add("sound-mix", "sound-mix", null, [], { audio: inputs.audio, duration_s: r6(scenes[scenes.length - 1].start_s + scenes[scenes.length - 1].duration_s) }, out("audio", { pix_fmt: "none", width: 0, height: 0, fps_num: 0, fps_den: 1, alpha: "none" }), { sample_rate: score.sample_rate ?? 48000 });
  add("package", "package", null, [grade.id, mix.id], { codec: eng.codec, container: eng.container ?? "mp4" }, out("video"));

  const source_digest = sha256(canonical({ score: inputs.files.score.sha256, cut: inputs.files.cut, sources: inputs.files.sources.sha256, effects: inputs.files.effects.sha256, events: inputs.files.events.sha256, edits: inputs.edits.map((e) => e.id).sort(), skill: inputs.versions }));
  const graph = { schema_version: 1, source_digest, fps: { num: fps.num, den: fps.den }, frame_size: { w, h }, nodes };
  return { graph, problems: P };
}

export const serialize = (g) => JSON.stringify(g, null, 2) + "\n";

// Apply cache state to a graph (status is the only state-dependent field; it is not part of any key).
export function withStatus(graph, cache) {
  if (!cache) return graph;
  // a scene whose code could not be read is never "ready": a key without its code would be a false hit
  return { ...graph, nodes: graph.nodes.map((n) => ({ ...n, status: n.deps_unknown ? "stale" : cache.state(n.content_key, { deep: false }) })) };
}

// Structural validation of a graph document (C2): ids unique, deps resolve, acyclic, vocabulary.
export function validate(g) {
  const P = [];
  if (!g || typeof g !== "object") return ["graph is not an object"];
  if (g.schema_version !== 1) return [`schema_version ${JSON.stringify(g.schema_version)}: this reader understands 1`];
  if (!/^[0-9a-f]{64}$/.test(String(g.source_digest))) P.push("source_digest is not a sha256 hex");
  if (!(g.fps && g.fps.num > 0 && g.fps.den > 0)) P.push("fps must be {num,den}");
  if (!(g.frame_size && g.frame_size.w > 0 && g.frame_size.h > 0)) P.push("frame_size must be {w,h}");
  if (!Array.isArray(g.nodes)) return [...P, "nodes must be an array"];
  const ids = new Set();
  for (const n of g.nodes) {
    if (ids.has(n.id)) P.push(`duplicate node id "${n.id}"`);
    ids.add(n.id);
    if (!STAGES.includes(n.kind)) P.push(`node "${n.id}": unknown kind "${n.kind}"`);
    if (!STATUSES.includes(n.status)) P.push(`node "${n.id}": unknown status "${n.status}"`);
    if (!/^[0-9a-f]{64}$/.test(String(n.content_key))) P.push(`node "${n.id}": content_key is not a sha256 hex`);
    if (!n.output || typeof n.output !== "object") P.push(`node "${n.id}": no output`);
  }
  for (const n of g.nodes) for (const d of n.depends_on || []) if (!ids.has(d)) P.push(`node "${n.id}": depends_on "${d}" does not exist`);
  const state = new Map(), byId = new Map(g.nodes.map((n) => [n.id, n]));
  const visit = (id, trail) => {
    if (state.get(id) === 2) return;
    if (state.get(id) === 1) { P.push(`cycle: ${[...trail, id].join(" -> ")}`); return; }
    state.set(id, 1);
    for (const d of (byId.get(id) || {}).depends_on || []) if (byId.has(d)) visit(d, [...trail, id]);
    state.set(id, 2);
  };
  for (const n of g.nodes) visit(n.id, []);
  return P;
}

// transitive downstream of a set of node ids (including them)
export function downstream(graph, ids) {
  const out = new Set(ids), rev = new Map();
  for (const n of graph.nodes) for (const d of n.depends_on) (rev.get(d) || rev.set(d, []).get(d)).push(n.id);
  const q = [...ids];
  while (q.length) for (const c of rev.get(q.pop()) || []) if (!out.has(c)) { out.add(c); q.push(c); }
  return out;
}
const upstream = (graph, id) => {
  const by = new Map(graph.nodes.map((n) => [n.id, n])), seen = new Set(), q = [id];
  while (q.length) for (const d of (by.get(q.pop()) || {}).depends_on || []) if (!seen.has(d)) { seen.add(d); q.push(d); }
  return seen;
};

// nodes added / removed / changed (by content_key) between two graphs; `cause` lists the changed nodes with no changed dependency (the real edits)
export function diff(a, b) {
  const A = new Map((a ? a.nodes : []).map((n) => [n.id, n])), B = new Map(b.nodes.map((n) => [n.id, n]));
  const added = [...B.keys()].filter((id) => !A.has(id));
  const removed = [...A.keys()].filter((id) => !B.has(id));
  const changed = [...B.keys()].filter((id) => A.has(id) && A.get(id).content_key !== B.get(id).content_key);
  const set = new Set([...added, ...changed]);
  const cause = [...set].filter((id) => !B.get(id).depends_on.some((d) => set.has(d)) || !A.has(id));
  const meta = [];
  for (const [k, va, vb] of [["fps", a && a.fps, b.fps], ["frame_size", a && a.frame_size, b.frame_size]]) if (canonical(va) !== canonical(vb)) meta.push({ field: k, a: va ?? null, b: vb });
  const same = !added.length && !removed.length && !changed.length && !meta.length;
  return { identical: same, source_digest: { a: a ? a.source_digest : null, b: b.source_digest }, added, removed, changed, cause, meta };
}

// Which scenes must re-render, relative to `previous` graph (what was last rendered) and/or the cache (what is on disk).
export function affected(graph, previous, cache) {
  const d = previous ? diff(previous, graph) : null;
  const changed = new Set(d ? [...d.added, ...d.changed] : []);
  const uncached = cache ? graph.nodes.filter((n) => !cache.lookup(n.content_key, { deep: false }).hit).map((n) => n.id) : [];
  const dirty = downstream(graph, [...changed]);
  for (const id of uncached) dirty.add(id);
  const needs = graph.nodes.filter((n) => dirty.has(n.id));
  const sceneNodes = needs.filter((n) => n.kind === "scene-render" || n.scene_id !== null && n.kind !== "comp");
  const scenes = [...new Set(needs.filter((n) => n.scene_id !== null).map((n) => n.scene_id))];
  const rerender = [...new Set(sceneNodes.filter((n) => n.kind === "scene-render").map((n) => n.scene_id))];
  const reused = graph.nodes.filter((n) => !dirty.has(n.id)).map((n) => n.id);
  return {
    changed: [...changed].sort(), uncached, scenes_affected: scenes, scenes_to_render: rerender,
    nodes_to_run: needs.map((n) => n.id), nodes_reused: reused,
    global_stages: needs.filter((n) => n.scene_id === null).map((n) => n.id),
    removed: d ? d.removed : [],
  };
}

// The inputs behind one node's key, with its dependency chain (why it is or is not a cache hit).
export function explain(graph, id, cache) {
  const n = graph.nodes.find((x) => x.id === id);
  if (!n) return null;
  const by = new Map(graph.nodes.map((x) => [x.id, x]));
  const hit = cache ? cache.lookup(n.content_key, { deep: false }) : null;
  return {
    id: n.id, kind: n.kind, scene_id: n.scene_id, content_key: n.content_key, output: n.output,
    depends_on: n.depends_on.map((d) => ({ id: d, content_key: by.get(d).content_key })),
    upstream: [...upstream(graph, id)].sort(), downstream: [...downstream(graph, [id])].filter((x) => x !== id).sort(),
    cache: hit ? (hit.hit ? { hit: true, file: hit.file } : { hit: false, reason: hit.reason }) : null,
    note: "content_key = sha256(canonical(node definition, source digests, dependency keys, versions, range, size, fps, engine, colour, seeds)); a changed dependency key changes this key",
  };
}
