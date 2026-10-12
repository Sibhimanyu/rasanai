// RasanCamera tooling shared by camera.mjs and video.mjs: install the runtime into a project (assets/rasan-camera/),
// install the vendored GSAP plugins (assets/vendor/gsap-plugins.min.js, self-registering), and find the compositions
// that call them.
import fs from "node:fs";
import path from "node:path";
import { SKILL_DIR } from "./common.mjs";
import { collect } from "./shape.mjs";

export const CAMERA_RUNTIME = path.join(SKILL_DIR, "runtime", "rasan-camera.js");
export const PLUGINS = path.join(SKILL_DIR, "scripts", "vendor", "gsap-plugins.min.js");
// the global each plugin file defines, in the order of the concatenated bundle
export const PLUGIN_NAMES = ["SplitText", "ScrambleTextPlugin", "DrawSVGPlugin", "MorphSVGPlugin", "MotionPathPlugin", "CustomEase", "CustomBounce", "CustomWiggle", "InertiaPlugin", "Physics2DPlugin", "EasePack", "Flip", "TextPlugin"];
export const cameraVersion = () => (fs.readFileSync(CAMERA_RUNTIME, "utf8").match(/var VERSION = "([^"]+)"/) || [])[1] || "0";

function writeIfChanged(f, buf) {
  if (fs.existsSync(f) && fs.readFileSync(f).equals(buf)) return false;
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, buf);
  return true;
}

export function installCamera(root) {
  const dst = path.join(root, "assets", "rasan-camera");
  const updated = writeIfChanged(path.join(dst, "rasan-camera.js"), fs.readFileSync(CAMERA_RUNTIME));
  return { dir: dst, version: cameraVersion(), updated, script: "assets/rasan-camera/rasan-camera.js" };
}

// The plugins bundle as one file that registers itself: the vendored bytes unchanged, then one registerPlugin line
// for whichever plugins are defined (EasePack's eases register on load). Load it right after gsap.min.js.
export function pluginsBundle() {
  const src = fs.readFileSync(PLUGINS, "utf8");
  const names = PLUGIN_NAMES.filter((n) => n !== "EasePack");
  const reg = `\n;(function(w){if(!w.gsap||!w.gsap.registerPlugin)return;var n=${JSON.stringify(names)},p=[];for(var i=0;i<n.length;i++)if(w[n[i]])p.push(w[n[i]]);if(p.length)w.gsap.registerPlugin.apply(w.gsap,p);})(typeof window!=="undefined"?window:this);\n`;
  return Buffer.from(src + reg, "utf8");
}
export function installPlugins(root) {
  if (!fs.existsSync(PLUGINS)) return null;
  const f = path.join(root, "assets", "vendor", "gsap-plugins.min.js");
  const updated = writeIfChanged(f, pluginsBundle());
  return { file: f, updated, script: "assets/vendor/gsap-plugins.min.js", registers: PLUGIN_NAMES };
}

const text = (f) => { try { return fs.readFileSync(f, "utf8"); } catch { return ""; } };
export const usesCamera = (file) => /\bRasanCamera\b/.test(text(file));
const PLUGIN_RE = new RegExp(`\\b(${PLUGIN_NAMES.join("|")})\\b|gsap-plugins`);
export const usesPlugins = (file) => PLUGIN_RE.test(text(file));
const files = (project) => collect(project).filter((f) => !/[/\\](rasan-camera|vendor)[/\\]/.test(f));
export const projectUsesCamera = (project) => files(project).some(usesCamera);
export const projectUsesPlugins = (project) => files(project).some(usesPlugins);
export const cameraFiles = (project) => files(project).filter(usesCamera);
export const projectFiles = files;

// Add the missing script tags to compositions that already exist: the plugins bundle when a file uses a plugin name,
// the camera runtime when it calls RasanCamera. Inserted right after the file's GSAP tag (src relative to the file).
// Files without a GSAP tag are left alone (their builder adds the tags). Returns the files changed.
export function tagCompositions(project, { camera = true, plugins = true } = {}) {
  const changed = [];
  for (const f of collect(project).filter((x) => /\.html?$/i.test(x) && !/[/\\](rasan-camera|vendor|rasan-shape)[/\\]/.test(x))) {
    let t = text(f);
    const g = /<script[^>]*src=["'][^"']*gsap(\.min)?\.js["'][^>]*>\s*<\/script>/i.exec(t);
    if (!g) continue;
    const rel = (p) => path.relative(path.dirname(f), path.join(project, p)).split(path.sep).join("/");
    let add = "";
    if (plugins && PLUGIN_RE.test(t.replace(g[0], "")) && !/gsap-plugins(\.min)?\.js/.test(t)) add += `\n<script src="${rel("assets/vendor/gsap-plugins.min.js")}"></script>`;
    if (camera && /\bRasanCamera\b/.test(t) && !/rasan-camera\.js/.test(t)) add += `\n<script src="${rel("assets/rasan-camera/rasan-camera.js")}"></script>`;
    if (!add) continue;
    t = t.slice(0, g.index + g[0].length) + add + t.slice(g.index + g[0].length);
    fs.writeFileSync(f, t);
    changed.push(path.relative(project, f));
  }
  return changed;
}
