// RasanUI tooling shared by uikit.mjs and video.mjs: install the runtime into a project (assets/rasan-ui/rasan-ui.js)
// and find the compositions that call it.
import fs from "node:fs";
import path from "node:path";
import { SKILL_DIR } from "./common.mjs";

export const UI_RUNTIME = path.join(SKILL_DIR, "runtime", "rasan-ui.js");
export const uiVersion = () => (fs.readFileSync(UI_RUNTIME, "utf8").match(/var VERSION = "([^"]+)"/) || [])[1] || "0";

export function installUI(root) {
  const dst = path.join(root, "assets", "rasan-ui");
  const f = path.join(dst, "rasan-ui.js");
  const buf = fs.readFileSync(UI_RUNTIME);
  const updated = !fs.existsSync(f) || !fs.readFileSync(f).equals(buf);
  if (updated) { fs.mkdirSync(dst, { recursive: true }); fs.writeFileSync(f, buf); }
  return { dir: dst, version: uiVersion(), updated, script: "assets/rasan-ui/rasan-ui.js" };
}

// RasanSim (runtime/rasan-sim.js): the pre-simulated, seek-safe physics kit, installed to assets/rasan-sim/rasan-sim.js when a composition names it
export const SIM_RUNTIME = path.join(SKILL_DIR, "runtime", "rasan-sim.js");
export const simVersion = () => (fs.readFileSync(SIM_RUNTIME, "utf8").match(/var VERSION = "([^"]+)"/) || [])[1] || "0";
export function installSim(root) {
  const dst = path.join(root, "assets", "rasan-sim");
  const f = path.join(dst, "rasan-sim.js");
  const buf = fs.readFileSync(SIM_RUNTIME);
  const updated = !fs.existsSync(f) || !fs.readFileSync(f).equals(buf);
  if (updated) { fs.mkdirSync(dst, { recursive: true }); fs.writeFileSync(f, buf); }
  return { dir: dst, version: simVersion(), updated, script: "assets/rasan-sim/rasan-sim.js" };
}

export function collect(project) {
  const out = [];
  (function walk(d, depth) {
    if (depth > 6) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith(".") || e.name === "node_modules" || e.name === "rasan-ui" || e.name === "rasan-sim" || e.name === "renders") continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else if (/\.(html?|js|mjs)$/i.test(e.name) && !/^(gsap|rasan3d|rasan-|three|flubber)/.test(e.name)) out.push(p);
    }
  })(project, 0);
  return out;
}
export const usesUI = (file) => /\bRasanUI\b/.test(fs.readFileSync(file, "utf8"));
export const projectUsesUI = (project) => collect(project).some(usesUI);
export const usesSim = (file) => /\bRasanSim\b/.test(fs.readFileSync(file, "utf8"));
export const projectUsesSim = (project) => collect(project).some(usesSim);
