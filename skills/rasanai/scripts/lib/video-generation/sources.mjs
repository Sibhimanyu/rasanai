// Upsert an adopted plate into <film>/hybrid/sources.json (contract C1) from adopt's sources_hint.
// The plate is copied to assets/generated/<job>.mp4 because C1 only allows assets inside assets/; its sha256 equals asset.json output.sha256.
import fs from "node:fs";
import path from "node:path";
import { atomicWrite, fileSha } from "./util.mjs";
import { validateSources } from "../hybrid-compositor/index.mjs";

const readJ = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };

// hint = { asset:{id,path,rights,sha256,media}, shot_layer:{layer_id,kind,asset_id,in_s,duration_s}|null }; src = film-relative plate (hybrid/generated/<job>/plate.mp4)
export function upsertSources(film, { asset, shot_layer }, plateRel, { role = "background", z = 0 } = {}) {
  const rel = `assets/generated/${asset.id}.mp4`, dest = path.join(film, rel), from = path.join(film, plateRel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (!fs.existsSync(dest) || fileSha(dest) !== asset.sha256) { const t = dest + ".tmp" + process.pid; fs.copyFileSync(from, t); fs.renameSync(t, dest); }
  const file = path.join(film, "hybrid", "sources.json");
  const doc = readJ(file) || { schema_version: 1, assets: [], shot_layers: [] };
  doc.assets = (doc.assets || []).filter((a) => a.id !== asset.id).concat([{ ...asset, path: rel }]);
  if (shot_layer) {
    const scene_id = shot_layer.layer_id.split(".")[0];
    doc.shot_layers = (doc.shot_layers || []).filter((l) => l.layer_id !== shot_layer.layer_id).concat([{ scene_id, ...shot_layer, render_role: role, z_index: z }]);
  }
  const score = readJ(path.join(film, "motion", "score.json"));
  const sceneIds = score && Array.isArray(score.scenes) ? new Set(score.scenes.map((s) => String(s.id ?? `s${s.n}`))) : null;
  const v = validateSources(JSON.parse(JSON.stringify(doc)), { root: film, sceneIds });
  if (!v.ok) return { written: false, errors: v.errors };
  for (const a of doc.assets) delete a._abs;
  atomicWrite(file, JSON.stringify(doc, null, 2) + "\n");
  return { written: true, path: "hybrid/sources.json", asset_path: rel, layer: shot_layer ? shot_layer.layer_id : null };
}
