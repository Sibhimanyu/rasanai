// hybrid-render/host.mjs: the standalone scene host. HyperFrames has no time-range render (see PROBE.md), so one scene is rendered as its own
// tiny project: <film>/hybrid/hosts/<scene>/index.html is the film's index.html with every other composition host (and the root audio) removed
// and the scene's host moved to data-start=0, so the scene's own timeline runs on a scene-local clock. Everything else in the project
// (compositions/, assets/, fonts, hyperframes.json ...) is symlinked, never copied. The film's own files are never modified.
import fs from "node:fs";
import path from "node:path";

const SKIP = new Set(["index.html", "hybrid", "renders", "node_modules", ".git", ".hyperframes", "snapshots", "exports"]);
const attr = (tag, name) => { const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`)); return m ? (m[2] ?? m[3]) : null; };
const HOST_RE = /<div\b[^>]*\sdata-composition-src\s*=[^>]*>\s*<\/div>/g;

// -> [{ tag, el_id, composition_id, src, start_s, duration_s }]
export function parseHosts(html) {
  return [...html.matchAll(HOST_RE)].map((m) => ({
    tag: m[0], el_id: attr(m[0], "id"), composition_id: attr(m[0], "data-composition-id"), src: attr(m[0], "data-composition-src"),
    start_s: Number(attr(m[0], "data-start")), duration_s: Number(attr(m[0], "data-duration")),
  }));
}

// the host of a scene: composition id, element id (with or without a slot- prefix), or the sub-composition file's base name
export function findHost(hosts, sceneId) {
  const id = String(sceneId);
  const by = (f) => hosts.filter(f);
  for (const f of [(h) => h.composition_id === id, (h) => h.el_id === id || h.el_id === `slot-${id}`, (h) => h.src && path.basename(h.src).replace(/\.html$/, "") === id]) {
    const got = by(f);
    if (got.length === 1) return got[0];
    if (got.length > 1) return null;
  }
  return null;
}

export function buildHost({ project, hostDir, sceneId, html }) {
  const src = html ?? fs.readFileSync(path.join(project, "index.html"), "utf8");
  const hosts = parseHosts(src);
  const h = findHost(hosts, sceneId);
  if (!h) throw new Error(`no unique composition host for scene "${sceneId}" in ${path.join(project, "index.html")} (hosts: ${hosts.map((x) => x.composition_id || x.el_id).join(", ") || "none"}); scenes must be sub-compositions (data-composition-src)`);
  if (!(h.duration_s > 0)) throw new Error(`host of scene "${sceneId}" has no data-duration`);
  let out = src.replace(HOST_RE, (t) => (t === h.tag ? t : ""));
  const mine = h.tag.replace(/(\sdata-start\s*=\s*)("[^"]*"|'[^']*')/, '$1"0"');
  out = out.replace(h.tag, () => mine);
  out = out.replace(/<audio\b[\s\S]*?(<\/audio>|\/>)/g, "");                       // picture only: sound is its own graph node
  // the root composition (first element with an id that is not a host) now lasts exactly as long as the scene
  out = out.replace(/(<[a-z0-9]+\b[^>]*\sdata-composition-id\s*=\s*"[^"]*"(?![^>]*data-composition-src)[^>]*\sdata-duration\s*=\s*)("[^"]*")/, `$1"${h.duration_s}"`);
  fs.mkdirSync(hostDir, { recursive: true });
  for (const e of fs.readdirSync(hostDir)) fs.rmSync(path.join(hostDir, e), { recursive: true, force: true });
  for (const e of fs.readdirSync(project)) {
    if (SKIP.has(e)) continue;
    fs.symlinkSync(path.join(path.resolve(project), e), path.join(hostDir, e));
  }
  fs.writeFileSync(path.join(hostDir, "index.html"), out);
  return { hostDir, host: h, duration_s: h.duration_s, film_start_s: h.start_s };
}
