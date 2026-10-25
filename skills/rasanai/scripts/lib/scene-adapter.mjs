// Plan 06 V8: the minimal render-readiness adapter around an existing scene runtime (a HyperFrames HTML scene driven by paused GSAP timelines, with Rasan3D / Rasan2D
// stages inside it). It is the contract in lib/readiness.mjs (prepare, readiness, evaluate, elements, dispose) implemented over the project's own headless Chrome driver
// (lib/cdp.mjs) and local server (lib/stage3d.mjs serve). It does NOT introduce another renderer; it is the pattern a film-level check or an inspector calls.
//
//   const a = createSceneAdapter({ file, project, width, height, pins });
//   await a.prepare();                      // serves the project over 127.0.0.1, opens the scene, waits for document.fonts.ready; refuses remote assets
//   const ev = await a.readiness();         // evidence: fonts LOADED, images decoded, video decodable, accepted media hash-matched  -> readiness.evaluateReadiness
//   const f = await a.evaluate(1.25, { fps: 30, subframe: 0 });   // seeks every paused timeline (and Rasan3D stages) to the ABSOLUTE time; returns { png, hash }
//   const els = await a.elements();         // [{ element_id, kind, editable, bounds }] from data-el
//   await a.dispose();
//
// Nothing runs at import. Calling prepare() needs Chrome; with none the adapter says so (it does not pretend to be ready). Pixel equality across machines is NOT promised:
// the same machine, GL mode and fonts give the same frames; another platform may differ in anti-aliasing and text shaping.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { launch } from "./cdp.mjs";
import { serve } from "./stage3d.mjs";
import { lintDeterminism, evaluateReadiness } from "./readiness.mjs";

const SEEK = `(function(t){
  var L = window.__timelines || {};
  Object.keys(L).forEach(function(k){ try { L[k].pause(); L[k].seek(t, false); } catch (e) {} });
  document.querySelectorAll('[data-start][data-duration]').forEach(function(el){ if (el.hasAttribute('data-composition-id')) return; var s = parseFloat(el.getAttribute('data-start')), d = parseFloat(el.getAttribute('data-duration')); if (isFinite(s) && isFinite(d)) el.style.visibility = (t >= s && t < s + d) ? '' : 'hidden'; });
  var R = window.__rasan3d; if (R && R.stages) Object.keys(R.stages).forEach(function(k){ var s = R.stages[k]; try { s.draw(s.tl.time(), true); } catch (e) {} });
  return Object.keys(L).length;
})`;
const EVIDENCE = `(function(){
  var fonts = []; if (document.fonts) document.fonts.forEach(function(f){ fonts.push({ family: String(f.family).replace(/^["']|["']$/g, ""), loaded: f.status === "loaded" }); });
  var textures = Array.prototype.map.call(document.images || [], function(i, n){ return { id: i.getAttribute("data-el") || i.getAttribute("src") || ("img-" + n), decoded: !!(i.complete && i.naturalWidth > 0) }; });
  var video = Array.prototype.map.call(document.querySelectorAll("video"), function(v, n){ return { asset_id: v.getAttribute("data-asset-id") || v.getAttribute("data-el") || v.getAttribute("src") || ("video-" + n), decoded_frames: v.readyState >= 2 && v.videoWidth > 0 ? 1 : 0 }; });
  return { fonts: fonts, textures: textures, video: video };
})`;
const ELEMENTS = `(function(){
  var out = [];
  document.querySelectorAll("[data-el]").forEach(function(e){
    var r = e.getBoundingClientRect(), cs = getComputedStyle(e);
    out.push({ element_id: e.getAttribute("data-el"), kind: e.getAttribute("data-el-kind") || null, editable: (e.getAttribute("data-el-editable") || "").split(",").filter(Boolean),
      bounds: { x: r.left, y: r.top, w: r.width, h: r.height }, visible: cs.visibility !== "hidden" && cs.display !== "none" && parseFloat(cs.opacity) > 0.01 });
  });
  return out;
})`;

export function createSceneAdapter({ file, project, width = 1920, height = 1080, pins = {} } = {}) {
  let b = null, srv = null;
  const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
  return {
    id: "scene-html",
    async prepare() {
      if (!file || !project) throw new Error("createSceneAdapter needs { file, project }");
      const abs = path.resolve(file), root = path.resolve(project);
      if (!abs.startsWith(root + path.sep)) throw new Error("the scene must be inside the project (approved local inputs only)");
      const lint = lintDeterminism(fs.readFileSync(abs, "utf8"), { file: path.relative(root, abs) });
      const bad = lint.findings.filter((f) => f.severity === "error");
      if (bad.length) throw new Error(`not renderable deterministically: ${bad.map((f) => `${f.rule} (line ${f.line})`).join(", ")}`);
      srv = await serve(root);
      b = await launch({ width, height, timeoutMs: 120000 });
      await b.open(`${srv.url}/${path.relative(root, abs).split(path.sep).join("/")}`);
      await b.eval("document.fonts && document.fonts.ready ? document.fonts.ready.then(function(){ return true; }) : true", { await: true });
      return { ok: true, determinism_warnings: lint.findings.filter((f) => f.severity !== "error") };
    },
    async readiness() {
      const ev = await b.eval(`${EVIDENCE}()`);
      // accepted generated media: hashed from the project's own bytes (the adapter never trusts a name)
      const models = (pins.neural_media || []).map((m) => { const f = path.join(project, m.output_path || ""); return { id: m.id, sha256: m.output_path && fs.existsSync(f) ? sha(fs.readFileSync(f)) : null }; });
      const evidence = { ...ev, models };
      return { evidence, report: evaluateReadiness({ pins, evidence, projectRoot: project }) };
    },
    // absolute time: every frame is a function of t. `subframe` (0..1) moves the sample inside the frame interval (for motion-blur style multi-sampling): t + subframe / fps.
    async evaluate(t, { fps = 30, subframe = 0, hash = true } = {}) {
      const at = Math.max(0, t) + Math.max(0, Math.min(0.999, subframe)) / fps;
      await b.eval(`${SEEK}(${JSON.stringify(at)})`);
      const png = await b.screenshot();
      return { t: at, png, hash: hash ? sha(png) : null };
    },
    async elements() { return b.eval(`${ELEMENTS}()`); },
    async dispose() { try { if (b) await b.close(); } finally { b = null; try { if (srv) await srv.close(); } finally { srv = null; } } },
  };
}
