// RasanMotion tooling shared by motionkit.mjs and video.mjs: install the runtime into a project
// (assets/rasan-motion/rasan-motion.js, with the project's motion.md contract baked in) and find the
// compositions that call it.
import fs from "node:fs";
import path from "node:path";
import { SKILL_DIR, readFrontmatterDoc } from "./common.mjs";

export const RUNTIME_FILE = path.join(SKILL_DIR, "runtime", "rasan-motion.js");
export const runtimeVersion = () => (fs.readFileSync(RUNTIME_FILE, "utf8").match(/var VERSION = "([^"]+)"/) || [])[1] || "0";

// the parts of motion.md the runtime reads (curves, durations, overshoot budget, arcs, overlap, stagger, camera)
export function contractOf(project) {
  const f = path.join(project, "motion.md");
  if (!fs.existsSync(f)) return null;
  try {
    const M = readFrontmatterDoc(fs.readFileSync(f, "utf8")).fields;
    const pick = {};
    for (const k of ["curves", "durations", "overshoot", "arcs", "overlap", "stagger", "camera", "language", "banned"]) if (M[k] != null) pick[k] = M[k];
    return Object.keys(pick).length ? pick : null;
  } catch { return null; }
}

export function install(root) {
  const dst = path.join(root, "assets", "rasan-motion");
  fs.mkdirSync(dst, { recursive: true });
  const c = contractOf(root);
  const body = fs.readFileSync(RUNTIME_FILE, "utf8") + (c ? `\n/* the project's motion.md, installed by motionkit.mjs */\nRasanMotion.contract(${JSON.stringify(c)});\n` : "");
  const f = path.join(dst, "rasan-motion.js");
  const updated = !fs.existsSync(f) || fs.readFileSync(f, "utf8") !== body;
  if (updated) fs.writeFileSync(f, body);
  return { dir: dst, version: runtimeVersion(), updated, contract: !!c, scripts: ["assets/rasan-motion/rasan-motion.js"] };
}

export function collect(project) {
  const out = [];
  (function walk(d, depth) {
    if (depth > 6) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith(".") || e.name === "node_modules" || e.name === "rasan-motion" || e.name === "renders") continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else if (/\.(html?|js|mjs)$/i.test(e.name) && !/^(gsap|rasan3d|rasan-music|rasan-shape|rasan-camera|three|flubber)/.test(e.name)) out.push(p);
    }
  })(project, 0);
  return out;
}
export const usesMotion = (file) => /\bRasanMotion\b/.test(fs.readFileSync(file, "utf8"));
export const projectUsesMotion = (project) => collect(project).some(usesMotion);
