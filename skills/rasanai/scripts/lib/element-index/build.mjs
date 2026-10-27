// Builds the element index (contract C) from a project's scene sources.
import fs from "node:fs";
import path from "node:path";
import { projectRoot, insideRoot, sceneFiles, readScore, buildDigest, scanHtml, kindOf, capabilityOf, editableOf, sceneIdOf, labelOf, hasRemoteCode, SCHEMA_VERSION } from "./core.mjs";

const r1 = (n) => Math.round(n * 10) / 10;
const r3 = (n) => Math.round(n * 1000) / 1000;

export function indexPath(root) { return path.join(root, "motion", "element-index.json"); }

export async function buildIndex(projectDir, { samples = 5, forceStatic = false } = {}) {
  const root = projectRoot(projectDir);
  const files = sceneFiles(root);
  const notes = [];
  const scanned = files.map((rel) => {
    const html = fs.readFileSync(path.join(root, rel), "utf8");
    return { rel, html, ...scanHtml(html) };
  });
  // scene start offsets declared by the root index.html (data-composition-src + data-start)
  const rootDoc = scanned.find((s) => s.rel === "index.html");
  const offsets = new Map();
  for (const c of rootDoc ? rootDoc.comps : []) {
    const target = path.posix.normalize(c.src.replace(/^\.\//, ""));
    if (/^(?:[a-z]+:)?\/\//i.test(c.src) || target.startsWith("..") || path.isAbsolute(target)) { notes.push(`ignored composition source outside project: ${c.src}`); continue; }
    offsets.set(target, { start: c.start ?? 0, duration: c.duration });
  }
  const frame = { w: 1920, h: 1080 };
  const rootInfo = rootDoc && rootDoc.root;
  const anyRoot = rootInfo || scanned.map((s) => s.root).find((r) => r && r.w && r.h);
  if (anyRoot && anyRoot.w && anyRoot.h) { frame.w = anyRoot.w; frame.h = anyRoot.h; }

  // collect items (static truth) per file
  const items = [];
  const perFile = [];
  for (const s of scanned) {
    if (!s.found.length) continue;
    const off = offsets.get(s.rel) || { start: s.root?.start ?? 0, duration: s.root?.duration };
    const fileItems = [];
    const sceneDur = off.duration ?? s.root?.duration ?? Math.max(0, ...s.found.map((f) => { const t = f.timing.filter((x) => !x.root).pop(); return t ? (t.start || 0) + (t.duration || 0) : 0; })) ?? 0;
    for (const f of s.found) {
      const kind = kindOf(f);
      const own = f.timing.filter((x) => !x.root).pop();
      const localA = own ? own.start ?? 0 : 0;
      const localB = own && own.duration != null ? localA + own.duration : sceneDur || localA + 5;
      const a = r3(off.start + localA), b = r3(off.start + Math.max(localA, localB));
      const fileStem = path.posix.basename(path.posix.dirname(s.rel)) || "root";
      const it = {
        element_id: f.el, scene_id: sceneIdOf(f.el, s.root?.id || fileStem), kind, label: labelOf(f),
        source_file: s.rel, source_key: f.el, z: 0, active_s: [a, b], editable: editableOf(f, kind), bounds_samples: [], capability: capabilityOf(kind),
      };
      fileItems.push(it);
      items.push(it);
    }
    perFile.push({ s, off, fileItems });
  }
  const ids = new Map();
  for (const it of items) ids.set(it.element_id, (ids.get(it.element_id) || 0) + 1);
  const dups = [...ids].filter(([, n]) => n > 1).map(([id]) => id);
  if (dups.length) throw new Error(`duplicate data-el ids: ${dups.join(", ")}`);

  let method = "static";
  if (!forceStatic) {
    let probeFile;
    try { ({ probeFile } = await import("./probe.mjs")); } catch (e) { notes.push(`browser probe unavailable: ${e.message}`); }
    if (probeFile) {
      let ran = 0, failed = 0;
      for (const { s, off, fileItems } of perFile) {
        if (hasRemoteCode(s.html)) { notes.push(`${s.rel}: loads remote code, not executed (static only)`); failed++; continue; }
        const n = Math.max(1, Number(samples) || 5);
        const plan = fileItems.filter((it) => it.capability !== "projected-3d").map((it) => {
          const [a, b] = it.active_s;
          const span = b - a;
          const ts = n === 1 || span <= 0 ? [a] : Array.from({ length: n }, (_, i) => (i === n - 1 ? b - 0.001 : a + (span * i) / (n - 1)));
          return { el: it.element_id, times: ts.map((t) => r3(Math.max(a, t) - off.start)) };
        });
        try {
          const res = await probeFile({ root, rel: s.rel, width: frame.w, height: frame.h, plan });
          ran++;
          const keyed = res.z.map((e) => e).sort((p, q) => { const L = Math.max(p.key.length, q.key.length); for (let i = 0; i < L; i++) { const d = (p.key[i] ?? 0) - (q.key[i] ?? 0); if (d) return d; } return p.i - q.i; });
          keyed.forEach((e, rank) => { const it = fileItems.find((x) => x.element_id === e.el); if (it) it.z = rank; });
          for (const it of fileItems) {
            it.bounds_samples = (res.samples[it.element_id] || []).filter((m) => m.vis && m.w > 0 && m.h > 0).map((m) => ({ t_s: r3(m.t_local + off.start), x: r1(m.x), y: r1(m.y), w: r1(m.w), h: r1(m.h) }));
          }
        } catch (e) { failed++; notes.push(`${s.rel}: browser probe failed (${String(e.message).split("\n")[0]}); static only`); }
      }
      if (ran) method = failed ? "mixed" : "browser";
    }
  }
  // z across files: keep scene order (file order), then in-file rank
  let base = 0;
  for (const { fileItems } of perFile) { for (const it of fileItems) it.z += base; base += fileItems.length + 1; }
  if (!items.length) notes.push("no data-el annotations found");
  if (items.some((i) => i.kind === "3d")) notes.push("3d objects: capability projected-3d is declared but bounds are not sampled (stage3d pose probes not wired); lookup skips them");
  if (method === "static") notes.push("static parse only: bounds_samples are empty, so point lookup returns nothing until a browser build runs");

  const score = readScore(root);
  const index = {
    schema_version: SCHEMA_VERSION,
    build_digest: buildDigest(root),
    film_version: score ? (score.film_version ?? score.version ?? null) : null,
    frame_size: frame,
    items,
    build: { method, samples: Number(samples) || 5, notes },
  };
  const out = indexPath(root);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  if (!insideRoot(root, path.dirname(out))) throw new Error("motion/ resolves outside the project");
  fs.writeFileSync(out, JSON.stringify(index, null, 2) + "\n");
  return { index, path: out };
}
