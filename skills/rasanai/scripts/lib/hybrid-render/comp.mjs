// hybrid-render/comp.mjs: comp nodes of the edit graph rendered as cached fragments through the compositor (W4).
// A scene is composited when sources.json gives it a `background` layer (owned footage or an adopted generated plate) whose asset has a
// planar-quad track (C5): the scene's own HyperFrames clip is warped into the tracked quad over the plate (an optional `matte` layer puts
// foreground in front). Key = comp node key (which already folds the plate digest, the track file digest and the scene-render key) + mode +
// the scene clip key + compositor settings, so a changed track or plate invalidates only its own scene's fragment.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { composite, readTrack, quadAt, validateSources, probe } from "../hybrid-compositor/index.mjs";
import { admitPool } from "../resource-pools.mjs";

export const COMP_VERSION = 1, FEATHER_PX = 1, CRF = 14;
const readJ = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
const unable = (m) => { const e = new Error(m); e.unable = true; return e; };
const safeId = (s) => String(s).replace(/[^A-Za-z0-9_.-]+/g, "-");

// -> Map(scene_id -> { layer, matte, asset, track_file, track_id }) for the scenes that composite; throws unable() on an invalid sources.json
export function compScenes(film, graph, scoreSceneIds) {
  const src = readJ(path.join(film, "hybrid", "sources.json"));
  const out = new Map();
  if (!src || !(src.shot_layers || []).length) return out;
  const v = validateSources(JSON.parse(JSON.stringify(src)), { root: film, sceneIds: scoreSceneIds, probe: (f) => { try { return probe(f); } catch { return null; } } });
  if (!v.ok) throw unable(`hybrid/sources.json is invalid: ${v.errors.join("; ")}`);
  const tracksDir = path.join(film, "hybrid", "tracks");
  for (const sc of new Set(src.shot_layers.map((l) => l.scene_id))) {
    const mine = src.shot_layers.filter((l) => l.scene_id === sc);
    const bg = mine.find((l) => l.render_role === "background");
    if (!bg || !graph.nodes.some((n) => n.id === `comp:${safeId(sc)}`)) continue;
    const tracks = [];
    try { for (const f of fs.readdirSync(tracksDir).sort()) { const t = f.endsWith(".json") ? readJ(path.join(tracksDir, f)) : null; if (t && t.asset_id === bg.asset_id) tracks.push({ file: path.join(tracksDir, f), id: t.id || f.slice(0, -5), doc: t }); } } catch {}
    // a background plate with no track for THIS asset (never tracked, or the plate was replaced: a track of the old bytes is never reused) cannot be composited; silently dropping it would render the film without its plate
    if (!tracks.length) throw unable(`scene "${sc}": background plate "${bg.asset_id}" has no planar-quad track in hybrid/tracks/ (run track.mjs level0|track on assets of this plate; a track made for another plate is not reused)`);
    if (tracks.length > 1) throw unable(`scene "${sc}": ${tracks.length} tracks for asset "${bg.asset_id}" (${tracks.map((t) => t.id).join(", ")}): keep one`);
    const asset = src.assets.find((a) => a.id === bg.asset_id);
    if (tracks[0].doc.source_digest !== asset.sha256) throw unable(`scene "${sc}": track "${tracks[0].id}" was made for other bytes than plate "${asset.id}" (source_digest mismatch): re-track`);
    const matte = mine.find((l) => l.render_role === "matte");
    out.set(sc, { layer: bg, matte: matte ? { layer: matte, asset: src.assets.find((a) => a.id === matte.asset_id) } : null, asset, track_file: tracks[0].file, track_id: tracks[0].id });
  }
  return out;
}

export function planComps(deps, graph, cache, mode, scenePlan, film, sceneIds) {
  const map = compScenes(film, graph, sceneIds);
  const plans = [];
  for (const [sceneId, c] of map) {
    const sp = scenePlan.find((p) => p.scene_id === sceneId);
    const node = graph.nodes.find((n) => n.id === `comp:${safeId(sceneId)}`);
    if (!sp || !node) continue;
    const m = c.asset.media, key = deps.cacheKey({ kind: "hybrid-render/comp-clip", v: COMP_VERSION, node_key: node.content_key, mode, scene_clip_key: sp.key, width: m.width, height: m.height, fps: { num: m.fps_num, den: m.fps_den }, feather_px: FEATHER_PX, crf: CRF });
    const hit = cache.lookup(key, { deep: false });
    plans.push({ scene_id: sceneId, node, key, ...c, scene_plan: sp, fps: { num: m.fps_num, den: m.fps_den }, width: m.width, height: m.height, hit: hit.hit, miss_reason: hit.hit ? null : hit.reason, file: hit.hit ? hit.file : null });
  }
  return plans;
}

function trim(file, in_s, dur_s, out, frames) {
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-ss", String(in_s), "-i", file, "-frames:v", String(frames), "-an", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "10", "-g", "1", "-pix_fmt", "yuv420p", out], { encoding: "utf8" });
  if (r.status !== 0) throw new Error("ffmpeg trim failed: " + String(r.stderr).trim().split("\n").slice(-2).join(" | "));
  return out;
}

// track times are source PTS; a trimmed base starts at in_s, so shift the samples (the quad at in_s becomes the first sample)
function shiftTrack(doc, in_s) {
  if (!in_s) return doc;
  const t = readTrack(doc), first = { ...t.frames[0], t_s: 0, quad_norm: quadAt(t, in_s) };
  return { ...t, frames: [first, ...t.frames.filter((f) => f.t_s > in_s).map((f) => ({ ...f, t_s: f.t_s - in_s }))] };
}

// produce the comp fragment for one plan (inside the render slot); returns { file, meta } for cache.produce
export async function renderComp(p, sceneClipFile, film, tmp, log) {
  const slot = await admitPool("video_render", { label: `hybrid-render comp ${p.scene_id}`, film }); // fail-closed (Plan 09 P9)
  try {
    const frames = p.scene_plan.expected_frames, t0 = Date.now();
    const abs = (a) => path.join(film, a.path);
    let base = abs(p.asset), matte = p.matte ? abs(p.matte.asset) : null;
    const in_s = p.layer.in_s || 0;
    if (in_s > 0) { base = trim(base, in_s, p.layer.duration_s, path.join(tmp, "base.mkv"), frames); if (matte) matte = trim(matte, p.matte.layer.in_s || 0, p.matte.layer.duration_s, path.join(tmp, "matte.mkv"), frames); }
    const track = shiftTrack(JSON.parse(fs.readFileSync(p.track_file, "utf8")), in_s);
    const out = path.join(tmp, `${p.scene_id}.mp4`);
    const r = await composite({ base, content: sceneClipFile, track, matte: matte || undefined, out, feather_px: FEATHER_PX, crf: CRF, max_frames: frames });
    if (r.frames !== frames) throw new Error(`comp ${p.scene_id}: ${r.frames} frames composited, ${frames} expected (the plate is shorter than the scene)`);
    p.render_ms = Date.now() - t0;
    for (const w of r.warnings || []) log(`warning: comp ${p.scene_id}: ${w}`);
    return { file: out, meta: { expected_frames: r.frames, sample_rate: null, color_space: "bt709", alpha: "none", time_base: `1/${p.fps.num}*${p.fps.den}`, tool_version: `composite v${COMP_VERSION}` } };
  } finally { slot.release(); }
}
