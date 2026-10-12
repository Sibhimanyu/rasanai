#!/usr/bin/env node
// Writes motion.md (the binding motion contract) from a library personality,
// optionally adjusted with adjectives. Can also emit the adjusted personality as
// JSON so tasting.mjs can re-preview it before it is locked.
//
// usage:
//   node motion-md.mjs write --personality editorial-mask [--adjust slower,calmer] \
//        --out <dir>/motion.md [--mode confirmed|auto] [--reason "..."] [--emit-personality <file.json>]
//   node motion-md.mjs write --language snappy --out <dir>/motion.md   (a motion-language term from the taxonomy)
//   node motion-md.mjs write --design-system <run>/design/<label> --out <dir>/motion.md [--reason "..."]
//        (a bespoke system: its blend.json motion_contract, on the nearest motion language, binds the film;
//         the system's "## Motion and camera" section is the guidance the animators read)
//   node motion-md.mjs adjectives          -> list supported adjustments
//   node motion-md.mjs show --file motion.md
import fs from "node:fs";
import { parseArgs, die, getPersonality, writeFrontmatterDoc, readFrontmatterDoc, writeFile, parseEase } from "./lib/common.mjs";
import "./lib/motion-lang.mjs"; // registers motion-language terms ("lang-snappy") with getPersonality
import { ADJUST, applyAdjustments } from "./lib/adjust.mjs";
import { track } from "./lib/report.mjs";
import path from "node:path";
import { loadSystem } from "./lib/system.mjs";
import { fluentFields } from "./lib/fluent.mjs";
import { fluentRules } from "./lib/contract.mjs";
export { applyAdjustments };

function motionMd(p, { mode, reason }) {
  const fl = fluentFields(p);
  const fields = {
    personality: p.parent ? "custom" : p.id,
    parent: p.parent || null,
    language: p.language || (p.parent && /^lang-/.test(p.parent) ? p.parent.slice(5) : null),
    adjustments: p.adjustments || [],
    tempo: { scale_ms: p.tempo.scale_ms },
    durations: fl.durations,
    easing: p.easing,
    curves: fl.curves,
    mix: fl.mix,
    overlap: fl.overlap,
    stagger: fl.stagger,
    overshoot: fl.overshoot,
    arcs: fl.arcs,
    camera: fl.camera,
    holds: p.holds,
    stillness: !!p.stillness,
    entrances: p.entrances,
    exits: p.exits,
    transitions: p.transitions,
    banned: p.banned,
    runtime: "gsap",
    decided_by: mode,
    waivers: [],
  };
  const body = `# Motion doctrine: ${p.name}

${p.oneLiner}

**This file is binding.** Every tween in the composition must follow it. \`obey.mjs\` checks the built composition against the frontmatter before the render gate.

## How it moves
${p.parent ? `
**Adjusted from ${p.parent} (${p.adjustments.join(", ")}).** The notes below describe the original personality; wherever they disagree with the frontmatter or the rules below (eases, timing, bans), the frontmatter wins.
` : ""}
${p.builder_notes || [p.language ? `**Motion language: ${p.name}.** ${p.oneLiner}` : "", p.prompt || ""].filter(Boolean).join("\n\n")}

## Rules

${fluentRules({ ...fields })}
${p.language === "character" ? "- Character language: anticipation pulls (50-120 ms), squash and stretch and smear frames are the vocabulary; shape-level moves (morph, draw-on, scatter, ink, dissolve, squash, smear) come from the RasanShape kit (`shape.mjs`), driven by the paused timeline.\n" : ""}- GSAP only. Registry blocks you reuse are re-timed by these rules (their stock eases and durations are the uniform pattern).

## Guidance (advisory)

- Entrances: ${p.entrances.join(", ")}. Exits: ${p.exits.join(", ")}. Transitions: ${p.transitions.join(", ")}.
${reason ? `\n## Why this personality\n\n${reason}\n` : ""}`;
  return writeFrontmatterDoc(fields, body);
}

const args = parseArgs();
const cmd = args._[0];
track(cmd === "write" ? "Writing the motion rules (motion.md)" : null, cmd === "write" ? "Motion rules written" : null);
// a bespoke system's contract laid over its nearest motion language (numbers from blend.json, notes from DESIGN.md)
function systemPersonality(dir) {
  const S = loadSystem(dir);
  if (!S.blend || !S.md) die(`${dir} is not a design system (DESIGN.md and blend.json)`);
  const mc = S.blend.motion_contract || {};
  const lang = String(mc.language || (S.blend.stack || {})["motion-language"] || "smooth").replace(/^lang-/, "");
  const p = JSON.parse(JSON.stringify(getPersonality(`lang-${lang}`)));
  if (Array.isArray(mc.scale_ms) && mc.scale_ms.length >= 4) { p.tempo.scale_ms = mc.scale_ms.map(Number); p.demo.enter_ms = p.tempo.scale_ms[2]; p.demo.move_ms = p.tempo.scale_ms[3] || p.demo.move_ms; p.demo.exit_ms = p.tempo.scale_ms[1]; }
  if (mc.easing) for (const k of ["enter", "exit", "move"]) if (mc.easing[k]) p.easing[k] = mc.easing[k];
  if (mc.stagger_ms) p.stagger.each_ms = Number(mc.stagger_ms);
  if (mc.hold_ms) { p.holds.min_ms = Number(mc.hold_ms); p.demo.hold_ms = Math.max(p.demo.hold_ms, Number(mc.hold_ms)); }
  if (Array.isArray(mc.banned) && mc.banned.length) p.banned = [...new Set([...p.banned, ...mc.banned])];
  if (mc.curves && typeof mc.curves === "object") p.curves = { ...(p.curves || {}), ...mc.curves };
  if (mc.overshoot && typeof mc.overshoot === "object") p.overshoot = mc.overshoot;
  const name = (S.blend.name || path.basename(dir));
  p.id = `system-${path.basename(dir).toLowerCase()}`; p.name = name; p.language = lang;
  p.oneLiner = S.blend.one_line || p.oneLiner;
  const sec = (S.md.match(/^##\s+Motion and camera[^\n]*\n([\s\S]*?)(?=\n##\s|(?![\s\S]))/mi) || [])[1];
  p.builder_notes = `**Bespoke motion language: ${name}** (on ${lang}). ${p.oneLiner}\n\n${(sec || "").trim()}`;
  return p;
}

if (cmd === "write") {
  if (args["design-system"]) {
    const p = applyAdjustments(systemPersonality(String(args["design-system"])), String(args.adjust || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean));
    if (!args.out) die("--out required");
    writeFile(args.out, motionMd(p, { mode: args.mode || "confirmed", reason: args.reason }));
    console.log(JSON.stringify({ wrote: args.out, personality: p.id, easing: p.easing, scale_ms: p.tempo.scale_ms, from: String(args["design-system"]) }, null, 2));
    process.exit(0);
  }
  if (args.language && !args.personality) args.personality = `lang-${String(args.language).replace(/^lang-/, "")}`;
  if (!args.personality) die("--personality <swatch id> or --language <motion-language term> required");
  if (!args.out) die("--out required");
  const adj = String(args.adjust || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const p = applyAdjustments(getPersonality(args.personality), adj);
  writeFile(args.out, motionMd(p, { mode: args.mode || "confirmed", reason: args.reason }));
  if (args["emit-personality"]) writeFile(args["emit-personality"], JSON.stringify(p, null, 2) + "\n");
  console.log(JSON.stringify({ wrote: args.out, personality: p.id, easing: p.easing, scale_ms: p.tempo.scale_ms, emitted: args["emit-personality"] || null }, null, 2));
} else if (cmd === "adjectives") {
  console.log(JSON.stringify(Object.fromEntries(Object.entries(ADJUST).map(([k, v]) => [k, v.doc])), null, 2));
} else if (cmd === "show") {
  console.log(JSON.stringify(readFrontmatterDoc(fs.readFileSync(args.file, "utf8")).fields, null, 2));
} else {
  die("usage: motion-md.mjs write|adjectives|show ...");
}
