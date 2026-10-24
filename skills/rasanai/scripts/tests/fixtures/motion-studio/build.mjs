#!/usr/bin/env node
// Builds the synthetic "Lumen Ledger" Motion Studio fixture project (invented product, system fonts, no real brands). Never ship it.
//
//   node build.mjs --out <dir> [--variant landscape|vertical] [--no-reference] [--no-events]
//     <dir>/index.html, motion/score.json, motion/events.json (derived with events.mjs export), assets/vendor/gsap.min.js (copied),
//     assets/beat.wav (ffmpeg lavfi: a soft pad, a click every 0.5 s, a louder click on the 11.0 s picture hit),
//     reference.mp4 (13 s synthetic reference: five hard cuts in flat colours, a beep on each cut), edits.jsonl (sample, contract D).
//   Generated media is never committed. Prints JSON {ok, out, variant, files}. Exit 0 ok, 1 failed, 2 usage.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS = path.resolve(HERE, "../../..");
const argv = process.argv.slice(2);
const opt = (k) => { const i = argv.indexOf("--" + k); return i < 0 ? null : (argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : true); };
const usage = (m) => { console.error(m); process.exit(2); };

export function build({ out, variant = "landscape", reference = true, events = true }) {
  if (!out) throw Object.assign(new Error("--out <dir> is required"), { usage: true });
  if (!["landscape", "vertical"].includes(variant)) throw Object.assign(new Error("--variant landscape|vertical"), { usage: true });
  out = path.resolve(out);
  fs.mkdirSync(path.join(out, "motion"), { recursive: true });
  fs.mkdirSync(path.join(out, "assets/vendor"), { recursive: true });
  const files = [];
  let html = fs.readFileSync(path.join(HERE, "project/index.html"), "utf8");
  if (variant === "vertical") html = html.replace('data-width="1920" data-height="1080" data-variant="landscape"', 'data-width="1080" data-height="1920" data-variant="vertical"');
  fs.writeFileSync(path.join(out, "index.html"), html); files.push("index.html");
  fs.copyFileSync(path.join(HERE, "project/motion/score.json"), path.join(out, "motion/score.json")); files.push("motion/score.json");
  fs.copyFileSync(path.join(SCRIPTS, "vendor/gsap.min.js"), path.join(out, "assets/vendor/gsap.min.js")); files.push("assets/vendor/gsap.min.js");
  fs.copyFileSync(path.join(HERE, "edits.sample.jsonl"), path.join(out, "edits.jsonl")); files.push("edits.jsonl");

  // audio: pad + click every 0.5 s; the click at 11.0 s (the picture hit) is louder and higher
  const clicks = "lt(mod(t,0.5),0.02)*sin(2*PI*1000*t)*0.4+lt(abs(t-11),0.03)*sin(2*PI*1600*t)*0.4";
  const a = spawnSync("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", `aevalsrc='0.12*sin(2*PI*110*t)+${clicks}':s=44100:d=18`, "-ac", "1", path.join(out, "assets/beat.wav")], { encoding: "utf8" });
  if (a.status !== 0) throw new Error("ffmpeg beat.wav failed: " + (a.stderr || "").slice(0, 200));
  files.push("assets/beat.wav");

  if (reference) {
    // 13 s reference: cuts at 2.0, 4.5, 7.0, 9.5, 11.5 (flat colours + a moving bar), a beep on each cut
    const cuts = [0, 2, 4.5, 7, 9.5, 11.5, 13], cols = ["0x203a5c", "0xb8442f", "0x2c6b4f", "0xd9b23c", "0x5a2d73", "0x111111"];
    const inputs = [], chain = [];
    for (let i = 0; i < cols.length; i++) {
      const d = (cuts[i + 1] - cuts[i]).toFixed(3);
      inputs.push("-f", "lavfi", "-i", `color=c=${cols[i]}:s=640x360:r=30:d=${d},drawbox=x='mod(t*200\\,600)':y=150:w=40:h=60:color=white:t=fill`);
    }
    const concat = cols.map((_, i) => `[${i}:v]`).join("") + `concat=n=${cols.length}:v=1:a=0[v]`;
    const beeps = cuts.slice(0, 6).map((c) => `lt(abs(t-${c}),0.08)*sin(2*PI*880*t)*0.5`).join("+");
    const r = spawnSync("ffmpeg", ["-y", "-v", "error", ...inputs, "-f", "lavfi", "-i", `aevalsrc='${beeps}':s=44100:d=13`, "-filter_complex", concat, "-map", "[v]", "-map", `${cols.length}:a`, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "64k", "-shortest", path.join(out, "reference.mp4")], { encoding: "utf8" });
    if (r.status !== 0) throw new Error("ffmpeg reference.mp4 failed: " + (r.stderr || "").slice(0, 300));
    files.push("reference.mp4");
  }
  if (events) {
    const e = spawnSync(process.execPath, [path.join(SCRIPTS, "events.mjs"), "export", "--run", out], { encoding: "utf8" });
    if (e.status !== 0) throw new Error("events.mjs export failed: " + (e.stderr || e.stdout || "").slice(0, 300));
    files.push("motion/events.json");
  }
  return { ok: true, out, variant, files };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(build({ out: opt("out"), variant: opt("variant") || "landscape", reference: !opt("no-reference"), events: !opt("no-events") }), null, 2)); }
  catch (e) { if (e.usage) usage(e.message); console.log(JSON.stringify({ ok: false, error: e.message })); process.exit(1); }
}
