#!/usr/bin/env node
// Handoff: turn the scratch decisions into a HyperFrames project the route
// workflow adopts without re-asking anything.
//   1. `npx hyperframes init videos/<project> --non-interactive --example=blank --skill=<route>`
//      (never the workspace root; skipped in --revise mode)
//   2. frame.md (preset FRAME.md adopted lowercase, or the user's spec), motion.md,
//      keyframes.json (if the board was approved)
//   3. BRIEF.md in HyperFrames' canonical format (hyperframes/references/brief-format.md)
//   4. DISPATCH.md: the addendum the agent appends to EVERY design/build/repair
//      subagent dispatch, because /motion-graphics subagents never read BRIEF.md
//   5. preference-backed fields recorded via media-use prefs.mjs (the workflow's
//      Setup would normally do this; we wrote BRIEF.md ourselves)
//
// usage: node handoff.mjs --decisions <scratch>/decisions.json [--workspace .] [--dry-run]
//        node handoff.mjs --decisions ... --revise --reopen look,motion   (existing project)
// decisions.json format: references/handoff.md
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs, die, readJSON, writeFile, normalizeAspect, readFrontmatterDoc } from "./lib/common.mjs";
import { resolvePreset, findSkill } from "./lib/hyperframes.mjs";
import { installLook, installDirection, upsertMarked, DIRECTION_MARK } from "./lib/install.mjs";

const args = parseArgs();
if (!args.decisions) die("--decisions required");
const D = readJSON(args.decisions);
const ws = path.resolve(args.workspace || ".");
// relative paths in decisions.json resolve against --workspace first, then the
// decisions.json folder (so the command works from any cwd)
const resolveIn = (p) => {
  if (!p || path.isAbsolute(p)) return p;
  for (const base of [ws, path.dirname(path.resolve(args.decisions))]) {
    const c = path.resolve(base, p);
    if (fs.existsSync(c)) return c;
  }
  return path.resolve(ws, p);
};
for (const k of ["motion", "keyframes"]) if (D[k]) D[k] = resolveIn(D[k]);
if (D.look && D.look.frame) D.look.frame = resolveIn(D.look.frame);
if (D.look && D.look.design_md) D.look.design_md = resolveIn(D.look.design_md);
if (D.direction) D.direction = resolveIn(D.direction);
const ROUTES = ["motion-graphics", "general-video", "product-launch-video", "faceless-explainer", "music-to-video", "pr-to-video"];

for (const k of ["project", "content", "message", "motion"]) if (!D[k]) die(`decisions.json is missing "${k}"`);
if (!/^[a-z0-9][a-z0-9-]*$/.test(D.project)) die(`project must be kebab-case (got "${D.project}")`);
const route = D.route || "motion-graphics";
if (!ROUTES.includes(route)) die(`route must be one of ${ROUTES.join(", ")}`);
const MG_CATEGORIES = ["kinetic-type", "stat", "charts", "logo-reveal", "lower-thirds", "maps", "webpage", "news", "tweet", "asset-fusion"];
if (route === "motion-graphics" && D.category && !MG_CATEGORIES.includes(D.category)) die(`category must be one of ${MG_CATEGORIES.join(", ")}`);
if (!fs.existsSync(D.motion)) die(`motion.md not found: ${D.motion}`);
if (D.keyframes && !fs.existsSync(D.keyframes)) die(`keyframes file not found: ${D.keyframes}`);

const aspect = normalizeAspect(D.aspect || "16:9");
const [W, H] = aspect.split("x").map(Number);
// length: stated > sum of approved keyframe shots > 6s default
let lengthS = Number(D.length_s) || 0;
let lengthSource = "stated";
if (!lengthS && D.keyframes && fs.existsSync(D.keyframes)) {
  const kf = readJSON(D.keyframes);
  lengthS = +(kf.shots || []).reduce((a, sh) => a + Math.max(...(sh.poses || [{ t: 0 }]).map((p) => p.t)), 0).toFixed(2);
  lengthSource = "keyframes";
}
if (!lengthS) {
  lengthS = 6;
  lengthSource = "default";
}
// cross-checks: the host root cuts the build at lengthS, and the canvas is fixed at init
if (D.keyframes) {
  const kf = readJSON(D.keyframes);
  const kfTotal = +(kf.shots || []).reduce((a, sh) => a + Math.max(...(sh.poses || [{ t: 0 }]).map((p) => p.t)), 0).toFixed(2);
  if (lengthSource === "stated" && Math.abs(kfTotal - lengthS) > 0.05) die(`length_s is ${lengthS}s but the approved keyframes run ${kfTotal}s; make them agree (or drop length_s to use the keyframes)`);
  if (kf.aspect && normalizeAspect(kf.aspect) !== aspect) die(`keyframes.json aspect ${normalizeAspect(kf.aspect)} differs from decisions aspect ${aspect}`);
  // approved keyframes are binding: re-validate them against THIS motion.md (it may have changed)
  try {
    execFileSync("node", [path.join(path.dirname(fileURLToPath(import.meta.url)), "board.mjs"), "--poses", D.keyframes, "--motion", D.motion, "--validate"], { stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    die(`keyframes.json no longer passes the board checks against motion.md:\n${String(e.stdout || e.stderr || e.message)}\nFix the poses (re-run board.mjs and re-approve) before handing off.`);
  }
}
const dir = path.join(ws, "videos", D.project);
const exists = fs.existsSync(path.join(dir, "hyperframes.json")) || fs.existsSync(path.join(dir, "BRIEF.md"));
const revise = !!args.revise;
if (exists && !revise) die(`${path.relative(ws, dir)} already has a project. Re-run with --revise --reopen <steps> to revise it, or choose a new project name.`);
if (!exists && revise) die(`--revise given but ${path.relative(ws, dir)} has no project`);
if (revise && fs.existsSync(path.join(dir, "BRIEF.md"))) {
  const was = (fs.readFileSync(path.join(dir, "BRIEF.md"), "utf8").match(/^aspect:\s*(\S+)/m) || [])[1];
  if (was && was !== aspect) die(`this project was made at ${was}; changing the aspect to ${aspect} needs a new project (the canvas is fixed at init)`);
}

const log = [];
const run = (cmd, argv, opts = {}) => {
  log.push(`$ ${cmd} ${argv.join(" ")}`);
  if (args["dry-run"]) return "";
  return execFileSync(cmd, argv, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts });
};

// ---- 0. resolve and check every input BEFORE init (a bad path must not leave a half-made project)
let stylePreset = null;
let frameSrc = null;
// the brand reference or a design direction wins over a preset when both are given
if (D.look && (D.look.design_md || D.look.frame)) delete D.look.preset;
if (D.look && D.look.preset) {
  stylePreset = D.look.preset;
  frameSrc = resolvePreset(D.look.preset);
} else if (D.look && D.look.design_md) {
  frameSrc = D.look.design_md;
  if (!fs.existsSync(frameSrc)) die(`brand reference not found: ${frameSrc}`);
} else if (D.look && D.look.frame) {
  frameSrc = D.look.frame;
  if (!fs.existsSync(frameSrc)) die(`frame spec not found: ${frameSrc}`);
}
// assets: strings are notes; { "path", "role" } objects are files copied into assets/.
// The chosen music bed (decisions.music) is a file asset with a known role, copied as
// assets/music-<name> so it can never overwrite a user file of the same name.
const assetPlan = [];
const assetList = [...(D.assets || [])];
if (D.music && D.music.path) assetList.push({ path: D.music.path, role: `music bed${D.music.title ? `: ${D.music.title}` : ""}`, music: true });
const usedNames = new Set();
for (const a of assetList) {
  if (typeof a === "string") {
    assetPlan.push({ note: a });
    continue;
  }
  if (!a || !a.path) die(`assets entries are strings or { "path": ..., "role": ... } (got ${JSON.stringify(a)})`);
  const src = resolveIn(a.path);
  if (!fs.existsSync(src) || !fs.statSync(src).isFile()) die(`${a.music ? "music track" : "asset"} not found: ${a.path}`);
  let name = (a.music ? "music-" : "") + path.basename(src);
  while (usedNames.has(name)) name = name.replace(/(\.[^.]*)?$/, (m) => `-2${m}`);
  usedNames.add(name);
  assetPlan.push({ src, rel: path.join("assets", name), role: a.role, music: !!a.music });
}

// ---- 1. init ---------------------------------------------------------------
if (!exists) {
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  try {
    const resolution = { "1920x1080": "landscape", "1080x1920": "portrait", "1080x1080": "square" }[aspect];
    run("npx", ["--yes", "hyperframes", "init", dir, "--non-interactive", "--example=blank", `--skill=${route}`, ...(resolution ? [`--resolution=${resolution}`] : [])], { cwd: ws });
  } catch (e) {
    // init also refreshes skills and may exit non-zero after scaffolding; accept a scaffolded project
    if (!fs.existsSync(path.join(dir, "hyperframes.json"))) die(`hyperframes init failed:\n${e.stderr || e.message}`);
    log.push("(init exited non-zero after scaffolding; project exists, continuing)");
  }
}

// ---- revise: invalidate what the reopened steps affect ------------------------
// /motion-graphics resumes by state; stale artifacts would skip the rebuild.
// assets/ is never moved: it holds the user's own files (logos, data) as well as resolved media
const INVALIDATES = {
  concept: ["shot-plan.json", "assets/index.md", "compositions", "snapshots", "renders"],
  look: ["shot-plan.json", "compositions", "snapshots", "renders"],
  motion: ["shot-plan.json", "compositions", "snapshots", "renders"],
  keyframes: ["shot-plan.json", "compositions", "snapshots", "renders"],
  brief: ["shot-plan.json", "compositions", "snapshots", "renders"],
  music: ["snapshots", "renders"], // the bed lives in the host root, which handoff rewrites
};
const moved = [];
if (revise) {
  const reopen = String(args.reopen || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!reopen.length) die(`--revise needs --reopen <steps> (${Object.keys(INVALIDATES).join(", ")})`);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const targets = [...new Set(reopen.flatMap((s) => INVALIDATES[s] || die(`unknown step "${s}"`)))];
  for (const t of targets) {
    const p = path.join(dir, t);
    if (!fs.existsSync(p)) continue;
    const dest = path.join(dir, ".superseded", stamp, t);
    if (!args["dry-run"]) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.renameSync(p, dest);
    }
    moved.push(`${t} -> .superseded/${stamp}/${t}`);
  }
  // keyframes dropped in this revision: move the old file aside so nothing treats it as approved
  if (!D.keyframes && fs.existsSync(path.join(dir, "keyframes.json"))) {
    const dest = path.join(dir, ".superseded", stamp, "keyframes.json");
    if (!args["dry-run"]) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.renameSync(path.join(dir, "keyframes.json"), dest);
    }
    moved.push(`keyframes.json -> .superseded/${stamp}/keyframes.json`);
  }
}

// ---- 2. frame.md / motion.md / keyframes -------------------------------------
const writes = [];
const put = (rel, content) => {
  writes.push(rel);
  if (!args["dry-run"]) writeFile(path.join(dir, rel), content);
};
const lookNotes = [];
if (frameSrc && D.look && (D.look.design_md || D.look.frame) && !args["dry-run"]) {
  // a design direction's frame.md or the project's own DESIGN.md: fonts staged, @font-face section added
  const r = await installLook(dir, D.look.design_md ? { designMd: frameSrc, mode: D.look.mode } : { frame: frameSrc });
  writes.push("frame.md");
  lookNotes.push(...r.notes);
} else if (frameSrc) put("frame.md", fs.readFileSync(frameSrc, "utf8"));
let dirInstalled = null;
if (D.direction) {
  if (!fs.existsSync(D.direction)) die(`direction not found: ${D.direction} (compile it with direction.mjs compile)`);
  if (!args["dry-run"]) {
    dirInstalled = installDirection(dir, D.direction);
    writes.push("DIRECTION.md", "direction.json");
    if (fs.existsSync(path.join(dir, "frame.md"))) fs.writeFileSync(path.join(dir, "frame.md"), upsertMarked(fs.readFileSync(path.join(dir, "frame.md"), "utf8"), DIRECTION_MARK, dirInstalled.section));
  }
}
const motionText = fs.readFileSync(D.motion, "utf8");
const M = readFrontmatterDoc(motionText).fields;
put("motion.md", motionText);
if (D.keyframes) put("keyframes.json", fs.readFileSync(D.keyframes, "utf8"));

const assetLines = [];
let musicRel = null;
for (const a of assetPlan) {
  if (a.note) {
    assetLines.push(a.note);
    continue;
  }
  if (!args["dry-run"] && path.resolve(a.src) !== path.resolve(dir, a.rel)) {
    fs.mkdirSync(path.join(dir, "assets"), { recursive: true });
    fs.copyFileSync(a.src, path.join(dir, a.rel));
  }
  writes.push(a.rel);
  if (a.music) musicRel = a.rel;
  assetLines.push(`${a.rel}${a.role ? `: ${a.role}` : ""}`);
}

// ---- 3. BRIEF.md ----------------------------------------------------------------
const yq = (s) => JSON.stringify(String(s));
const fm = [
  `workflow: ${route}`,
  `flow: automation`,
  `storyboard: no`,
  `message: ${yq(D.message)}`,
  D.destination ? `destination: ${D.destination}` : null,
  `aspect: ${aspect}`,
  `language: ${D.language || "en"}`,
  `length: ${lengthS}s`,
  D.audience ? `audience: ${yq(D.audience)}` : null,
  stylePreset ? `style_preset: ${stylePreset}` : null,
].filter(Boolean);
const motionLabel = M.personality === "custom" ? `${M.parent} adjusted (${(M.adjustments || []).join(", ")})` : M.personality;
const receipts = D.receipts || {};
const brief = `---
${fm.join("\n")}
---

## Intent

${D.concept ? `**${D.concept.title}.** ${D.concept.text}` : D.message}

## Assets

${[
  `- On-screen text (verbatim): ${yq(D.content)}`,
  D.sub ? `- Secondary line: ${yq(D.sub)}` : null,
  ...assetLines.map((a) => `- ${a}`),
  frameSrc ? "- frame.md at the project root: palette, type and layout (brand truth)." : null,
].filter(Boolean).join("\n")}

## Customizations
${dirInstalled ? `\n- **Art direction is decided:** ${dirInstalled.direction.style_name}. DIRECTION.md is the full brief in proper motion-design terms; its binding summary is in frame.md and DISPATCH.md. Design from it.` : ""}
- **motion.md at the project root is binding motion doctrine** (${motionLabel}). Every tween follows its duration scale, eases, stagger, holds and banned list. Build in GSAP only. Reused registry blocks are re-eased and re-timed to it.
${D.keyframes ? "- **keyframes.json holds approved key poses and timings.** The shot plan follows its poses, beats and segment eases; do not re-choreograph them.\n" : ""}${musicRel ? (route === "motion-graphics" ? `- **Music bed:** \`${musicRel}\` is already placed in the host root \`index.html\` as \`#music-bed\` (full length, short fade in and out). Do not add another audio element. Land the main beats near its downbeats where the motion contract allows.\n` : `- **Music bed:** \`${musicRel}\` plays under the whole piece: one \`<audio id="music-bed">\` clip at t=0 for the full length (hyperframes-core media rules), fading in and out. Land the main beats near its downbeats where the motion contract allows.\n`) : ""}- DISPATCH.md is appended to every design, build and repair subagent dispatch (subagents do not read this brief).
- RasanAI's obey check (\`node <rasanai>/scripts/obey.mjs --project .\`) runs after verify and before the render question; after any obey repair, lint, check and snapshots run again.

## Notes

Decided with RasanAI.${D.category ? ` Category: ${D.category}.` : ""}
${(receipts.stated || []).length ? `\nStated by the user:\n${receipts.stated.map((r) => `- ${r}`).join("\n")}\n` : ""}${(receipts.agent || []).length ? `\nDecided by the agent (receipts):\n${receipts.agent.map((r) => `- ${r}`).join("\n")}\n` : ""}`;
put("BRIEF.md", brief);

// ---- 3b. host root (motion-graphics only) ---------------------------------------
// /motion-graphics' Builder writes compositions/index.html, but `init` leaves a
// blank root index.html that mounts nothing, so `hyperframes check`/`render`
// would see an empty timeline. Replace the blank root with a host that mounts
// compositions/index.html as a sub-composition (hyperframes-core sub-compositions.md).
const rootPath = path.join(dir, "index.html");
const rootText = fs.existsSync(rootPath) ? fs.readFileSync(rootPath, "utf8") : "";
const rootIsBlank = !rootText || /\/\/ Example: tl\.fromTo/.test(rootText) || /data-(rasanai|rasa-motion|motion-director)-host/.test(rootText);
let hostWritten = false;
if (route === "motion-graphics" && rootIsBlank) {
  put(
    "index.html",
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${W}, height=${H}" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      html, body { margin: 0; width: ${W}px; height: ${H}px; overflow: hidden; background: #000; }
      #stage { position: relative; width: ${W}px; height: ${H}px; }
    </style>
  </head>
  <body>
    <!-- data-rasanai-host: written by rasanai handoff; mounts the Builder's compositions/index.html -->
    <div id="stage" data-rasanai-host data-composition-id="main" data-start="0" data-duration="${lengthS}" data-width="${W}" data-height="${H}">
      <div id="shot" data-composition-id="${D.project}" data-composition-src="compositions/index.html" data-start="0" data-duration="${lengthS}" data-track-index="0" data-width="${W}" data-height="${H}"></div>${musicRel ? `
      <audio id="music-bed" src="${musicRel.split(path.sep).join("/")}" data-start="0" data-duration="${lengthS}" data-track-index="10" data-volume="0.9"
        data-automation='{"version":1,"lanes":[{"target":"volume","points":[{"t":0,"v":0},{"t":0.3,"v":0.9},{"t":${Math.max(0.6, lengthS - 0.6).toFixed(2)},"v":0.9},{"t":${lengthS},"v":0}]}]}'></audio>` : ""}
    </div>
    <script>
      const tl = gsap.timeline({ paused: true });
      window.__timelines["main"] = tl;
      tl.seek(0);
    </script>
  </body>
</html>
`
  );
  hostWritten = true;
}

const nonStandardEases = Object.values(M.easing).filter((e) => /^(steps|none|linear)/i.test(String(e)));

// ---- 4. DISPATCH.md ---------------------------------------------------------------
const overridesBlock = route === "motion-graphics" ? `## Where this file overrides the motion-graphics references

This addendum wins over \`references/builder-contract.md\`, \`references/motion-vocabulary.md\` and \`catalog-map.md\` where they differ:
- **Motion primitives:** motion-vocabulary's defaults (e.g. \`slide_bottom\` = opacity 0 + y offset, a fade-up-slide) are replaced by the contract below. Use its eases and durations for every primitive and registry block.
- **Root:** the Builder writes a templated sub-composition with root \`#root\` (position: absolute; inset: 0) mounted by the host root index.html; builder-contract's standalone \`#stage\` sizing rule applies to the host, which is already written.
- **Visibility gating:** builder-contract's \`fromTo({autoAlpha: 0}, {autoAlpha: 1, ...})\` is fine when the same tween also carries the personality's entrance properties with its ease and duration. A timed \`autoAlpha\`-only fade is an opacity-only entrance and is checked like any entrance.

` : "";

const addendum = `# RasanAI dispatch addendum

${route === "motion-graphics"
  ? "Append this whole file to **every** subagent dispatch for this project: Director Part 1 (plan), Director Part 2 (design), Builder, and repair (finalize). Those subagents do not read BRIEF.md; this is how the decisions reach them."
  : `Append this whole file to every subagent the /${route} workflow dispatches to plan, design, build or repair frames (its SKILL.md names them). They may not read BRIEF.md; this is how the motion decisions reach them. The workflow's own design step still owns frame.md and layout.`}

## Decided before the build (do not re-decide or ask)

- Message: ${yq(D.message)}
- On-screen text (verbatim): ${yq(D.content)}${D.sub ? `; secondary line ${yq(D.sub)}` : ""}
${D.category ? `- Category: \`${D.category}\`\n` : ""}- Look: \`frame.md\` at the project root (palette, type, layout).
- Concept: ${D.concept ? `${D.concept.title}. ${D.concept.text}` : "(none beyond the message)"}
- Music: ${musicRel ? (route === "motion-graphics" ? `\`${musicRel}\` is already in the host root as \`#music-bed\` for the full ${lengthS}s. Do not add audio to compositions/index.html.` : `\`${musicRel}\` as one \`<audio id="music-bed">\` clip at t=0 for the full ${lengthS}s, fading in and out.`) : "none (silent piece)"}

${dirInstalled ? `${dirInstalled.section}\n` : ""}${overridesBlock}## Binding motion contract (from motion.md)

- Personality: ${motionLabel}
- Length: ${lengthS}s, ${W}x${H}. \`shot-plan.json\` uses \`duration_s: ${lengthS}\` and this canvas; the host root mounts the build for exactly this long.
- Durations: every tween duration is one of ${M.tempo.scale_ms.join(" / ")} ms (±15%). A staggered tween's per-element duration counts, not the spread.
- Eases (write them explicitly; never rely on the GSAP default):
  - enter: \`${M.easing.enter}\` for anything becoming visible, including a rule or underline drawing out from 0 (scaleX 0 -> 1), a mask/clip opening, letters growing from a baseline
  - exit: \`${M.easing.exit}\` for anything leaving or collapsing back to 0
  - move / emphasis: \`${M.easing.move}\` for changes to an element that stays visible (shift, push, pulse)
- Stagger: ${M.stagger.each_ms} ms between elements.
- Every element stays at least ${M.holds.min_ms} ms between its entrance and its exit (reading time), and keeps moving in that time: nothing parks, no stretch of 0.8 s goes still.
- Banned patterns (machine-checked): ${M.banned.join(", ")}.
- Preferred entrances: ${(M.entrances || []).join(", ")}. Exits: ${(M.exits || []).join(", ")}. Transitions: ${(M.transitions || []).join(", ")}.
- GSAP only (no CSS @keyframes, anime.js or WAAPI). Registry blocks: after \`hyperframes add\`, rewrite their tweens to these eases and durations.
- **Hiding an element until its entrance:** a zero-duration switch on the timeline (\`tl.set(el, { autoAlpha: 0 }, 0)\`, then \`tl.set(el, { autoAlpha: 1 }, t)\` right before its entrance), never on a \`.clip\` element and never at page load; or the combined \`fromTo\` described above.
${nonStandardEases.length ? `- **These eases override the builder contract's allowed-ease list:** ${nonStandardEases.map((e) => `\`${e}\``).join(", ")}. They are GSAP-core, seek-safe and deliberate for this personality; do not swap them for power/expo eases.\n` : ""}
${route === "motion-graphics" ? `## Output shape (Builder)

Write \`compositions/index.html\` as a **templated sub-composition** (hyperframes-core \`references/sub-compositions.md\`): everything, including \`<style>\`, font \`<link>\` and \`<script>\`, inside one \`<template>\`. The inner root is \`<div id="root" data-composition-id="${D.project}" data-width="${W}" data-height="${H}">\`, styled by \`#root\` (position: absolute; inset: 0), and the timeline registers as \`window.__timelines["${D.project}"]\`. Do not load GSAP in it: the host root \`index.html\` (already written; do not edit) loads GSAP and mounts this file for ${lengthS}s.

` : ""}## How it should feel

${readFrontmatterDoc(motionText).body.split("## How it moves")[1]?.split("##")[0]?.trim() || ""}
${D.keyframes ? `
## Approved keyframes (binding)

keyframes.json at the project root lists shots, their elements (id, role, text, position, size, split) and key poses (time + element states). Poses are cumulative: a pose lists only what changes. Do not add, drop or retime poses.

${route === "motion-graphics" && (!D.category || D.category === "kinetic-type") ? `Mapping into \`shot-plan.json\` (Director, kinetic-type):
- one scene per shot, back to back: \`start\` = sum of earlier shots' last pose \`t\`, \`end\` = start + this shot's last pose \`t\`;
- \`beats\` = every pose time (absolute seconds);
- \`text\` = the elements' text verbatim; element ids become DOM ids;
- \`motion\` = one line per segment: \`<element ids> <enter|exit|move> <from t>s -> <to t>s <ease>\`, where the ease is the class ease above (or the segment's \`ease\` if keyframes.json sets one).
` : `Planning (${route === "motion-graphics" ? `Director, ${D.category}` : "the workflow's planner"}): this plan shape has no per-segment motion field, so put every pose time into \`beats\` (absolute seconds, shots back to back), keep the durations, and name \`keyframes.json\` in the shot brief. The Builder reads keyframes.json directly.
`}
Building each segment (Builder): tween every element listed in the next pose from its current state to that pose's state, starting at the earlier pose's \`t\`, duration = the gap between the two poses, ease as above. Elements with \`split\` animate their letters / words / lines with the contract stagger, and the gap is each unit's duration. Units: \`x\`/\`y\`/\`blur\`/\`size\` are % of the canvas's shorter side; \`at\` is % of the canvas; \`clip\` is CSS clip-path; \`letterSpacing\` is em.
` : ""}
## Check

\`node "${path.join(path.dirname(fileURLToPath(import.meta.url)), "obey.mjs")}" --project "${dir}"\` must exit 0 before the render question.
`;
put("DISPATCH.md", addendum);

// ---- 5. preference-backed fields ----------------------------------------------------
const prefsRecorded = [];
const mediaUse = findSkill("media-use");
if (mediaUse && !args["dry-run"]) {
  const prefs = path.join(mediaUse, "scripts", "prefs.mjs");
  const rec = (key, value, extra = []) => {
    try {
      execFileSync("node", [prefs, "record", "--hyperframes", dir, "--key", key, "--value", String(value), ...extra], { stdio: "ignore" });
      prefsRecorded.push(`${key}=${value}`);
    } catch {}
  };
  // only values the user confirmed (brief-contract §2: never inferred or defaulted);
  // flow/storyboard are never asked on this path, so they are never recorded
  const C = D.confirmed || {};
  if (D.destination && C.destination) rec("destination", D.destination);
  if (C.aspect) rec("aspect", aspect);
  if (C.language) rec("language", D.language || "en");
  if (stylePreset && C.look) rec("style_preset", stylePreset, ["--workflow", route]);
}

console.log(
  JSON.stringify(
    { project: dir, route, mode: revise ? "revise" : "new", look_notes: lookNotes, direction: dirInstalled ? dirInstalled.direction.style_name : null, length_s: lengthS, length_source: lengthSource, host_root: hostWritten, wrote: writes, invalidated: moved, prefsRecorded, commands: log, next: `Enter /${route} (it adopts ${path.relative(ws, dir)}: Step 0 skips init because hyperframes.json exists; BRIEF.md exists so no brief questions). Append DISPATCH.md to every subagent dispatch.` },
    null,
    2
  )
);
