// Project check: scans compositions/*/index.html for motion-kit annotations.
import fs from "node:fs";
import path from "node:path";
import { findItem } from "./catalog.mjs";

const natural = (a, b) => a.localeCompare(b, "en", { numeric: true });
const loads = (h) => /<script[^>]+src=["'][^"']*rasan-motion-kit\.js[^"']*["']/i.test(h);

export function checkProject(dir, items) {
  const root = path.resolve(dir);
  const ran = [], errors = [], warnings = [], scenes = [];
  const compRoot = path.join(root, "compositions");
  if (!fs.existsSync(compRoot)) throw Object.assign(new Error(`no compositions/ directory in ${root}`), { code: "NOPROJECT" });
  const rootReal = fs.realpathSync(root);
  const dirs = fs.readdirSync(compRoot, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort(natural);
  const rootIndex = path.join(root, "index.html");
  const rootHtml = fs.existsSync(rootIndex) ? fs.readFileSync(rootIndex, "utf8") : "";
  for (const d of dirs) {
    const f = path.join(compRoot, d, "index.html");
    if (!fs.existsSync(f)) continue;
    if (!fs.realpathSync(f).startsWith(rootReal + path.sep)) { errors.push(`${d}: index.html resolves outside the project`); continue; }
    const html = fs.readFileSync(f, "utf8");
    const anns = [];
    for (const m of html.matchAll(/data-motion-kit\s*=\s*["']([^"']*)["']/g)) {
      const mm = m[1].match(/^motion-kit:([A-Za-z0-9._-]+)@(\d+)$/);
      if (mm) anns.push({ id: mm[1], version: Number(mm[2]) });
      else errors.push(`${d}: malformed data-motion-kit "${m[1]}" (want motion-kit:<id>@<version>)`);
    }
    scenes.push({ scene: d, file: path.relative(root, f), annotations: anns, loads_runtime: loads(html) || loads(rootHtml), has_apply: /RasanMotionKit\s*\.\s*apply/.test(html) });
  }
  ran.push(`scanned ${scenes.length} composition(s)`, "annotation id/version exist in catalog");
  for (const s of scenes) for (const a of s.annotations) {
    const it = findItem(items, a.id);
    if (!it) errors.push(`${s.scene}: unknown motion-kit id ${a.id}`);
    else if (!findItem(items, a.id, a.version)) errors.push(`${s.scene}: ${a.id}@${a.version} not in catalog (catalog has @${it.version})`);
    a.family = it ? it.family : null;
  }
  ran.push("rasan-motion-kit.js loaded where annotations exist");
  for (const s of scenes) if (s.annotations.length && !s.loads_runtime) errors.push(`${s.scene}: has annotations but neither the composition nor index.html loads rasan-motion-kit.js`);
  ran.push("annotated scene calls RasanMotionKit.apply");
  for (const s of scenes) if (s.annotations.length && !s.has_apply) warnings.push(`${s.scene}: annotated but no RasanMotionKit.apply call found (may be applied from a shared script)`);
  ran.push("same mechanic on adjacent scenes");
  for (let i = 1; i < scenes.length; i++) {
    const a = scenes[i - 1], b = scenes[i];
    if (!a.annotations.length || !b.annotations.length) continue;
    const shared = a.annotations.find((x) => b.annotations.some((y) => y.id === x.id));
    if (shared) { errors.push(`${a.scene} -> ${b.scene}: same mechanic ${shared.id} on adjacent scenes`); continue; }
    const fam = a.annotations.find((x) => x.family && b.annotations.some((y) => y.family === x.family));
    if (fam) warnings.push(`${a.scene} -> ${b.scene}: same family ${fam.family} back to back`);
  }
  if (!scenes.some((s) => s.annotations.length)) warnings.push("no motion-kit annotations found in this project");
  return { project: root, ok: errors.length === 0, checks_run: ran, scenes, errors, warnings };
}
