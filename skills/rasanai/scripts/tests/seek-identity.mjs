#!/usr/bin/env node
// Seek identity: motion must be a pure function of time. Captures frames of a project at a set of times in order A (ascending),
// then B (reverse), then C (seeded shuffle), then A again, and compares the PNG hashes per time. Any differing hash is a failure.
//
//   node seek-identity.mjs --project <dir> [--times 0.5,1.6,3,6,8,11,11.3,13,16,17.8] [--timeline main] [--seed 7] [--json]
//     <dir> holds index.html (build one with fixtures/motion-studio/build.mjs). Uses lib/cdp.mjs (headless Chrome over a pipe) to seek
//     window.__timelines[<timeline>] (paused GSAP) and screenshot. The capture runs inside a render slot (lib/slot.mjs).
//   Exit 0 identical, 1 mismatch or capture failed, 2 usage. Opt-in via `motion-studio.mjs --seek`; never part of the default smoke.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";

const argv = process.argv.slice(2);
const opt = (k, d = null) => { const i = argv.indexOf("--" + k); return i < 0 ? d : (argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : true); };
const project = opt("project");
if (!project || project === true || !fs.existsSync(path.join(path.resolve(project), "index.html"))) { console.error("usage: seek-identity.mjs --project <dir with index.html> [--times a,b,c] [--timeline main] [--seed n]"); process.exit(2); }
const root = path.resolve(project);
const times = String(opt("times", "0.5,1.6,3,6,8,11,11.3,13,16,17.8")).split(",").map(Number).filter((n) => Number.isFinite(n) && n >= 0);
if (!times.length) { console.error("no valid --times"); process.exit(2); }
const timeline = String(opt("timeline", "main"));

// seeded PRNG (mulberry32): the shuffle is the same every run
let s = (Number(opt("seed", 7)) >>> 0) || 7;
const rnd = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const shuffled = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

const { launch } = await import("../lib/cdp.mjs");
const { acquireSlot } = await import("../lib/slot.mjs");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const W = Number((html.match(/data-width="(\d+)"/) || [])[1]) || 1920, H = Number((html.match(/data-height="(\d+)"/) || [])[1]) || 1080;

const slot = await acquireSlot({ label: "seek-identity" });
let br, result;
try {
  br = await launch({ width: W, height: H });
  await br.open(pathToFileURL(path.join(root, "index.html")).href);
  const seek = (t) => br.eval(`(function(){var tl=(window.__timelines||{})[${JSON.stringify(timeline)}];if(!tl)return "no-timeline";tl.pause();tl.seek(${t},false);return "ok";})()`);
  const grab = async (t) => { const r = await seek(t); if (r !== "ok") throw new Error(`timeline "${timeline}" not found`); return crypto.createHash("sha256").update(await br.screenshot()).digest("hex").slice(0, 16); };
  const passes = [["A", times], ["B", times.slice().reverse()], ["C", shuffled(times)], ["A2", times]];
  const seen = {}; const mismatches = [];
  for (const [name, order] of passes) {
    for (const t of order) {
      const h = await grab(t);
      if (seen[t] === undefined) seen[t] = { first: h, pass: name };
      else if (seen[t].first !== h) mismatches.push({ t_s: t, pass: name, expected: seen[t].first, got: h, first_pass: seen[t].pass });
    }
  }
  result = { ok: mismatches.length === 0, project: root, size: { w: W, h: H }, times, passes: passes.map((p) => ({ name: p[0], order: p[1] })), mismatches };
} catch (e) {
  result = { ok: false, error: String(e && e.message || e) };
} finally {
  try { await br?.close(); } catch {}
  try { slot.release(); } catch {}
}
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
