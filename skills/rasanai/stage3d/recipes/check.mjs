#!/usr/bin/env node
// Static check for the Rasan3D recipes (no browser, no renderer).
//
//   node check.mjs            verify: every recipe imports, index.json matches the exports, plans are sane, seams are exact
//   node check.mjs --write    regenerate index.json from the modules first
//
// Exit 0 ok, 1 failed check, 2 usage error. JSON to stdout.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
if (args.some((a) => a !== "--write")) { console.error("usage: check.mjs [--write]"); process.exit(2); }

const common = require("./common.js");
const FILES = fs.readdirSync(dir).filter((f) => f.endsWith(".js") && f !== "common.js").sort();
const mods = {};
for (const f of FILES) { require(path.join(dir, f)); }
for (const id of common.registry.list()) mods[id] = common.registry.get(id);

const entry = (m) => ({
  id: m.id, label: m.label, summary: m.summary,
  params: Object.fromEntries(Object.entries(m.params).map(([k, s]) => [k, s.type === "number" ? { type: "number", min: s.min, max: s.max, default: s.default } : s.type === "enum" ? { type: "enum", enum: s.enum, default: s.default } : { type: s.type, ...(s.local_asset ? { local_asset: true } : {}), default: s.default }])),
  requires: m.requires, seek_safe: true, file: `${m.id}.js`,
});
const generated = { schema_version: 1, recipes: Object.keys(mods).sort().map((id) => entry(mods[id])) };
const indexPath = path.join(dir, "index.json");
if (args.includes("--write")) fs.writeFileSync(indexPath, JSON.stringify(generated, null, 2) + "\n");

const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };
const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
ok(JSON.stringify(index) === JSON.stringify(generated), "index.json does not match the recipe exports (run check.mjs --write)");
ok(Object.keys(mods).length === 8, `expected 8 recipes, found ${Object.keys(mods).length}`);

const ASSETS = { screenshot: "assets/shot.png", logoSvg: "assets/logo.svg", text: "Brand", iconSvg: "assets/icon.svg" };
for (const [id, m] of Object.entries(mods)) {
  for (const f of ["plan", "camera", "build"]) ok(typeof m[f] === "function", `${id}: ${f}() missing`);
  for (const [k, s] of Object.entries(m.params)) {
    if (s.type === "number") ok(s.min <= s.default && s.default <= s.max, `${id}.${k}: default outside bounds`);
    if (s.type === "enum") ok(s.enum.includes(s.default), `${id}.${k}: default not in enum`);
  }
  const p = m.plan(ASSETS);
  ok(Number.isFinite(p.duration) && p.duration > 0, `${id}: plan duration`);
  ok(p.hits.every((h) => Number.isFinite(h) && h >= 0 && h <= p.duration), `${id}: hit outside the duration`);
  const cam = m.camera(ASSETS);
  ok(cam && typeof cam === "object", `${id}: camera keys`);
  const fps = p.P.fps || 30;
  ok(p.hits.every((h) => Math.abs(h * fps - Math.round(h * fps)) < 1e-6), `${id}: a hit is off the frame grid`);
  const src = fs.readFileSync(path.join(dir, `${id}.js`), "utf8");
  ok(!/Math\.random|Date\.now|performance\.now|new Date|requestAnimationFrame|WebGLRenderer|https?:\/\//.test(src.replace(/\/\*[\s\S]*?\*\//, "")), `${id}: forbidden API or remote URL in the source`);
  const num = Object.keys(m.params).find((k) => m.params[k].type === "number");
  try { m.plan({ ...ASSETS, [num]: Number.NaN }); fails.push(`${id}: NaN accepted`); } catch { /* expected */ }
}
// seams that must be exact
const f = mods["focus-pull"], fo = { eventS: 2.01, pullS: 0.7, fps: 30 }, fp = f.plan(fo);
ok(f.focusAt(fp.tEvent, fo) === fp.P.toDistance && f.focusAt(fp.tEvent - 1 / 30, fo) !== fp.P.toDistance, "focus-pull: not exactly in focus from the event frame on");
ok(Math.abs(fp.tEvent * 30 - Math.round(fp.tEvent * 30)) < 1e-9, "focus-pull: event not on a frame");
const s = mods["product-slab-evidence"].plan(ASSETS);
const sc = mods["product-slab-evidence"].camera(ASSETS);
ok(sc.pos.at(-1)[1][0] === sc.target.at(-1)[1][0] && sc.pos.at(-1)[1][1] === sc.target.at(-1)[1][1], "slab: end camera not on the region's axis");
ok(s.legibility.ok, "slab: default is not legible");
const ic = mods["icon-portal-through"].plan(ASSETS);
ok(ic.zEnd < 0 && ic.seam.out.speed_units_per_s > 0, "icon portal: camera must end beyond the icon plane at speed");
const ch = mods["character-handoff"];
ok(!ch.assess({ medium: "painted-2d" }).rigged && !ch.assess({ medium: "3d-rig", rig: { kind: "glb" } }).rigged && ch.assess({ medium: "3d-rig", rig: { kind: "code", builder: "rasan-critter" } }).rigged, "character: rig assessment");
const bad = ["https://x/y.png", "//x/y", "../a", "/abs", "a\\b", "file:///x"];
for (const b of bad) { try { common.localAsset(b); fails.push(`localAsset accepted ${b}`); } catch { /* expected */ } }
const hero = mods["hero-turntable"];
const hc = hero.camera({}), last = hc.pos.at(-1)[1];
ok(Math.abs(last[0]) < 1e-9 && Math.abs(last[1]) < 1e-9, "hero: end view not on-axis");

const out = { ok: !fails.length, recipes: Object.keys(mods).sort(), failures: fails };
console.log(JSON.stringify(out, null, 2));
process.exit(fails.length ? 1 : 0);
