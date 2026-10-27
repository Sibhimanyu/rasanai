// RasanShape tooling shared by shape.mjs and video.mjs: install the runtime into a project (assets/rasan-shape/)
// and find the compositions that call it.
import fs from "node:fs";
import path from "node:path";
import { SKILL_DIR } from "./common.mjs";

export const RUNTIME = path.join(SKILL_DIR, "runtime");
const FILES = [["rasan-shape.js", "rasan-shape.js"], ["vendor/flubber.min.js", "flubber.min.js"], ["vendor/FLUBBER-LICENSE.txt", "LICENSE-flubber.txt"]];
export const runtimeVersion = () => (fs.readFileSync(path.join(RUNTIME, "rasan-shape.js"), "utf8").match(/var VERSION = "([^"]+)"/) || [])[1] || "0";

// Optional (additive): { optics: true } also installs runtime/rasan-optics.js (layer-targeted focus / soft material / feathered masks / one filter writer per element).
// Default false keeps the installed set, the returned `scripts` and every existing caller (video.mjs inject, shape.mjs install) byte-identical.
export const OPTICS_FILE = ["rasan-optics.js", "rasan-optics.js"];
export function install(root, { optics = false } = {}) {
  const dst = path.join(root, "assets", "rasan-shape");
  fs.mkdirSync(dst, { recursive: true });
  let updated = false;
  for (const [from, to] of optics ? [...FILES, OPTICS_FILE] : FILES) {
    const src = fs.readFileSync(path.join(RUNTIME, from));
    const f = path.join(dst, to);
    if (!fs.existsSync(f) || !fs.readFileSync(f).equals(src)) { fs.writeFileSync(f, src); updated = true; }
  }
  return { dir: dst, version: runtimeVersion(), updated, scripts: ["assets/rasan-shape/flubber.min.js", "assets/rasan-shape/rasan-shape.js", ...(optics ? ["assets/rasan-shape/rasan-optics.js"] : [])] };
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
// compositions that call RasanOptics (the optical composer): they need rasan-optics.js loaded after GSAP, the optics plan's runtime block, and a paused timeline
export const usesOptics = (file) => /\bRasanOptics\b/.test(fs.readFileSync(file, "utf8"));
// mask planning consequence: a mask operation's runtime shape. radial -> feathered CSS mask-image (RasanOptics); a hard circle is RasanShape.iris; region rects -> clip-path inset.
// -> { driver, hard_edge, note } so a planner states which runtime draws the mask and whether its edge is feathered
export function maskDriver(mask) {
  const shape = mask && mask.shape;
  if (shape === "radial") return { driver: "RasanOptics (mask-image radial-gradient)", hard_edge: false, note: "feather is a param; use RasanShape.iris for a hard circular reveal eased by area" };
  if (shape === "rect") return { driver: "RasanOptics (clip-path inset)", hard_edge: true, note: "rect from an anchors region; inset is a score-keyed param" };
  return { driver: null, hard_edge: null, note: "no runtime-drawn mask: resolved by the hybrid compositor (alpha asset) or reported unavailable" };
}
