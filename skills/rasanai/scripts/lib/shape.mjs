// RasanShape tooling shared by shape.mjs and video.mjs: install the runtime into a project (assets/rasan-shape/)
// and find the compositions that call it.
import fs from "node:fs";
import path from "node:path";
import { SKILL_DIR } from "./common.mjs";

export const RUNTIME = path.join(SKILL_DIR, "runtime");
const FILES = [["rasan-shape.js", "rasan-shape.js"], ["vendor/flubber.min.js", "flubber.min.js"], ["vendor/FLUBBER-LICENSE.txt", "LICENSE-flubber.txt"]];
export const runtimeVersion = () => (fs.readFileSync(path.join(RUNTIME, "rasan-shape.js"), "utf8").match(/var VERSION = "([^"]+)"/) || [])[1] || "0";

export function install(root) {
  const dst = path.join(root, "assets", "rasan-shape");
  fs.mkdirSync(dst, { recursive: true });
  let updated = false;
  for (const [from, to] of FILES) {
    const src = fs.readFileSync(path.join(RUNTIME, from));
    const f = path.join(dst, to);
    if (!fs.existsSync(f) || !fs.readFileSync(f).equals(src)) { fs.writeFileSync(f, src); updated = true; }
  }
  return { dir: dst, version: runtimeVersion(), updated, scripts: ["assets/rasan-shape/flubber.min.js", "assets/rasan-shape/rasan-shape.js"] };
}

// every .html/.js under the project (not node_modules, assets/rasan-shape or dot dirs) that mentions RasanShape
export function collect(project) {
  const out = [];
  (function walk(d, depth) {
    if (depth > 6) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith(".") || e.name === "node_modules" || e.name === "rasan-shape") continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else if (/\.(html?|js|mjs)$/i.test(e.name) && !/^(gsap|rasan3d|rasan-music|three)/.test(e.name)) out.push(p);
    }
  })(project, 0);
  return out;
}
export const usesShape = (file) => /\bRasanShape\b/.test(fs.readFileSync(file, "utf8"));
export const projectUsesShape = (project) => collect(project).some(usesShape);
