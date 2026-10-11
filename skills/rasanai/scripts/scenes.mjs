#!/usr/bin/env node
// Scenes → HyperFrames plan files. Turns the director's scene list (scenes.json,
// format: references/video.md) into STORYBOARD.md (+ SCRIPT.md when narrated) in
// the exact shape the multi-scene workflows read, validates it with the workflow's
// own storyboard parser, and writes a timeline.json the console draws.
//
//   node scenes.mjs --scenes <scenes.json> --route product-launch-video|faceless-explainer|pr-to-video|general-video \
//        --out <dir> [--mode collaborative|autonomous]
// Writes <dir>/STORYBOARD.md, <dir>/SCRIPT.md (narrated only), <dir>/timeline.json. Exit 1 with reasons on invalid input.
import fs from "node:fs";
import path from "node:path";
import { parseArgs, die, readJSON, writeFile, normalizeAspect } from "./lib/common.mjs";
import { findSkill } from "./lib/hyperframes.mjs";
import { track } from "./lib/report.mjs";

const args = parseArgs();
track("Timing the scenes into a storyboard", "Storyboard timing ready");
if (!args.scenes || !args.out) die("--scenes <scenes.json> and --out <dir> are required");
const ROUTES = ["product-launch-video", "faceless-explainer", "pr-to-video", "general-video"];
const route = String(args.route || "product-launch-video");
if (!ROUTES.includes(route)) die(`--route must be one of ${ROUTES.join(", ")} (music-to-video plans from the beat grid, and footage routes have no storyboard: see references/video.md)`);
const S = readJSON(path.resolve(String(args.scenes)));
const scenes = S.scenes || [];
const problems = [];
if (!S.message) problems.push("message is required (the one thing the video says)");
if (scenes.length < 2) problems.push("an entire video needs at least 2 scenes");
if (scenes.length > 24) problems.push("more than 24 scenes: split the piece or merge beats");

// transition_in values the workflow's registry understands
const regDir = ["product-launch-video", "faceless-explainer", "pr-to-video"].map(findSkill).find(Boolean);
// (no workflow installed: fall back to the registry's known types so planning still works offline)
const REG = regDir ? JSON.parse(fs.readFileSync(path.join(regDir, "scripts", "lib", "transitions.json"), "utf8")) : { transitions: ["crossfade", "blur-crossfade", "push-slide", "zoom-through", "squeeze"].map((name) => ({ name })) };
const TYPES = new Set(REG.transitions.map((t) => t.name));
const validTransition = (v) => {
  if (!v || /^(cut|none)$/i.test(v)) return true;
  const [type, ...rest] = String(v).trim().split(/\s+/);
  if (!TYPES.has(type)) return false;
  return rest.every((r) => /^(LEFT|RIGHT|UP|DOWN)$/i.test(r) || /^\d+(\.\d+)?s?$/.test(r));
};
const blueprintDir = findSkill("hyperframes-animation") && path.join(findSkill("hyperframes-animation"), "blueprints");
const blueprintExists = (id) => blueprintDir && fs.existsSync(path.join(blueprintDir, `${id}.md`));

const slug = (s) => String(s || "scene").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "scene";
const narrated = S.narration !== false && scenes.some((sc) => sc.voiceover && String(sc.voiceover).trim());
const TYPES_PLV = ["hook", "pain_point", "product_intro", "feature_showcase", "benefit_highlight", "social_proof", "branding", "cta"];

// the story's own beat roles map onto the workflow's scene types (a ladder's open/rung/ways_in/close,
// a scenario's hook/proof/turn/cta, the older hero/demo/payoff), so a scene can carry its role as its type
const ROLE_TYPE = { open: "hook", rung: "feature_showcase", ways_in: "benefit_highlight", close: "cta", proof: "feature_showcase", turn: "benefit_highlight", hero: "product_intro", demo: "feature_showcase", payoff: "benefit_highlight", statement: "branding", end: "cta" };
for (const sc of scenes) if (route === "product-launch-video" && sc.type && !TYPES_PLV.includes(sc.type) && ROLE_TYPE[sc.type]) sc.type = ROLE_TYPE[sc.type];

const frames = scenes.map((sc, i) => {
  const n = i + 1;
  const where = `scene ${n}${sc.title ? ` (${sc.title})` : ""}`;
  const dur = Number(sc.duration);
  if (!(dur > 0)) problems.push(`${where}: duration must be a positive number of seconds`);
  if (!sc.visual && !sc.on_screen) problems.push(`${where}: needs a visual idea or on-screen text`);
  const tin = i === 0 ? "cut" : sc.transition_in || S.transition_default || "cut";
  if (!validTransition(tin)) problems.push(`${where}: transition_in "${tin}" is not a registry type (${[...TYPES].join(", ")}, cut) with optional LEFT|RIGHT|UP|DOWN and seconds`);
  if (sc.blueprint && !blueprintExists(sc.blueprint)) problems.push(`${where}: blueprint "${sc.blueprint}" does not exist in hyperframes-animation/blueprints (omit it and let the workflow choose)`);
  if (route === "product-launch-video" && sc.type && !TYPES_PLV.includes(sc.type)) problems.push(`${where}: type "${sc.type}" is not one of ${TYPES_PLV.join(", ")}`);
  if (route === "pr-to-video" && sc.code && !sc.source_excerpt) problems.push(`${where}: a code scene needs source_excerpt (a fenced diff, <= 12 lines)`);
  return { n, sc, dur, tin, src: `compositions/frames/${String(n).padStart(2, "0")}-${slug(sc.title)}.html` };
});
if (problems.length) die(`scenes.json has ${problems.length} problem(s):\n- ${problems.join("\n- ")}`);

const [W, H] = normalizeAspect(S.aspect || "16:9").split("x").map(Number);
const total = +frames.reduce((a, f) => a + f.dur, 0).toFixed(2);
const q = (v) => JSON.stringify(String(v));
const fm = [
  `format: ${W}x${H}`,
  `duration: ${total}s`,
  `message: ${q(S.message)}`,
  S.arc ? `arc: ${q(S.arc)}` : null,
  S.audience ? `audience: ${q(S.audience)}` : null,
  `music: ${S.music ? q(S.music) : "none"}`,
  args.mode ? `mode: ${args.mode}` : null,
].filter(Boolean);

// Everything a frame worker must honour goes INSIDE its frame block (workers only see
// their block + frame.md); nothing is written after the last frame (it would leak into it).
const block = ({ n, sc, dur, tin, src }) => {
  const lines = [`## Frame ${n} — ${sc.title || `Scene ${n}`}`, ""];
  const kv = (k, v) => v !== undefined && v !== null && String(v).trim() !== "" && lines.push(`- ${k}: ${String(v).replace(/\n/g, " ")}`);
  kv("scene", sc.visual || sc.on_screen);
  kv("voiceover", narrated ? q(sc.voiceover || "") : "");
  kv("duration", `${dur}s`);
  kv("transition_in", tin);
  kv("status", "outline");
  kv("src", src);
  if (route === "product-launch-video" || route === "faceless-explainer") {
    kv("type", sc.type);
    kv("persuasion", sc.persuasion);
    kv("beat", sc.beat);
  }
  if (sc.blueprint) kv("blueprint", sc.blueprint);
  kv("asset_candidates", sc.asset_candidates || (route === "product-launch-video" ? "none — pure typography beat" : ""));
  if (sc.intensity) kv("motion_intensity", `${sc.intensity} (within motion.md; see frame.md "Motion contract")`);
  lines.push("");
  if (sc.on_screen) lines.push(`On-screen text (verbatim): ${q(sc.on_screen)}`, "");
  if (sc.narrativeRole) lines.push(`narrativeRole: ${sc.narrativeRole}`);
  if (sc.keyMessage) lines.push(`keyMessage: ${sc.keyMessage}`);
  if (sc.notes) lines.push("", String(sc.notes));
  if (route === "pr-to-video" && sc.source_excerpt) lines.push("", "### Source excerpt", "", String(sc.source_excerpt).trim());
  lines.push("");
  return lines.join("\n");
};

const storyboard = `---\n${fm.join("\n")}\n---\n\n# ${S.title || "Storyboard"}\n\nPlan written and approved with RasanAI (scene list, script, transitions). Adopt it as the approved plan; do not rewrite the beats.\n\n${frames.map(block).join("\n")}`;

// sanity: parse with the workflow's own parser when it is installed
const parserPath = regDir && path.join(regDir, "scripts", "lib", "storyboard.mjs");
let parsed = null;
if (parserPath && fs.existsSync(parserPath)) {
  const { parseStoryboard } = await import(parserPath);
  parsed = parseStoryboard(storyboard);
  const got = (parsed.frames || []).length;
  if (got !== frames.length) die(`internal: the workflow parser read ${got} frames, expected ${frames.length}`);
  const bad = parsed.frames.filter((f) => !f.src || !(parseFloat(f.duration) > 0));
  if (bad.length) die(`internal: parsed frames missing src/duration: ${bad.map((f) => f.title || f.index).join(", ")}`);
}
if (!/^## Frame 1 — /m.test(storyboard)) die("internal: frame headings must be H2 '## Frame N — Title'");

const out = path.resolve(String(args.out));
writeFile(path.join(out, "STORYBOARD.md"), storyboard);

let script = null;
if (narrated) {
  let t = 0;
  const v = S.voice || {};
  script = `# SCRIPT — ${S.title || "video"}\n\n**Voice:** ${v.name || "workflow default"}${v.id ? ` (${v.provider || "HeyGen"} ${v.id})` : ""}\n**Voice direction:** ${v.direction || "Natural, confident, unhurried."}\n\n---\n\n${frames
    .filter((f) => f.sc.voiceover && String(f.sc.voiceover).trim())
    .map((f) => {
      const start = frames.slice(0, f.n - 1).reduce((a, x) => a + x.dur, 0);
      const s = `## Line ${f.n} — ${f.sc.title || `Scene ${f.n}`} (Frame ${f.n})\n\n**Time:** ${start.toFixed(1)} – ${(start + f.dur).toFixed(1)}s\n${f.sc.delivery ? `**Delivery:** ${f.sc.delivery}\n` : ""}\n    ${String(f.sc.voiceover).trim().replace(/\n/g, "\n    ")}\n`;
      t = start + f.dur;
      return s;
    })
    .join("\n")}`;
  writeFile(path.join(out, "SCRIPT.md"), script);
} else if (fs.existsSync(path.join(out, "SCRIPT.md"))) fs.rmSync(path.join(out, "SCRIPT.md"));

let at = 0;
const timeline = {
  total_s: total,
  aspect: `${W}x${H}`,
  narrated,
  music: S.music || "none",
  scenes: frames.map((f) => {
    const row = { n: f.n, title: f.sc.title || `Scene ${f.n}`, start_s: +at.toFixed(2), duration_s: f.dur, transition_in: f.tin, on_screen: f.sc.on_screen || "", voiceover: narrated ? f.sc.voiceover || "" : "", type: f.sc.type || "", intensity: f.sc.intensity || "" };
    at += f.dur;
    return row;
  }),
};
writeFile(path.join(out, "timeline.json"), JSON.stringify(timeline, null, 2) + "\n");
console.log(JSON.stringify({ ok: true, route, frames: frames.length, total_s: total, narrated, storyboard: path.join(out, "STORYBOARD.md"), script: script ? path.join(out, "SCRIPT.md") : null, timeline: path.join(out, "timeline.json"), parsed_by: parsed ? parserPath : "not available" }, null, 2));
