// Browser probe: loads a scene file with the project's existing headless Chrome driver (lib/cdp.mjs), seeks the
// paused GSAP timelines the way the frame tooling does (window.__timelines[*].seek(t)) and measures
// getBoundingClientRect for every [data-el]. Throws when no browser can run (callers fall back to static).
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { launch } from "../cdp.mjs";

const PAGE_FN = `(function(){
  window.__elProbe = {
    seek: function(t){
      var T = window.__timelines || {};
      Object.keys(T).forEach(function(k){ var tl=T[k]; if(tl && tl.pause) tl.pause(); if(tl && tl.seek) tl.seek(t, false); });
      return Object.keys(T).length;
    },
    rects: function(){
      var out = {};
      document.querySelectorAll("[data-el]").forEach(function(e){
        var r = e.getBoundingClientRect(), cs = getComputedStyle(e);
        out[e.getAttribute("data-el")] = {x:r.left,y:r.top,w:r.width,h:r.height,vis:cs.visibility!=="hidden"&&cs.display!=="none"&&parseFloat(cs.opacity)>0.01};
      });
      return out;
    },
    z: function(){
      var order = [], i = 0;
      document.querySelectorAll("[data-el]").forEach(function(e){
        var key = [], n = e;
        while(n && n.nodeType===1){ var z = parseInt(getComputedStyle(n).zIndex,10); key.unshift(isNaN(z)?0:z); n = n.parentElement; }
        order.push({el:e.getAttribute("data-el"), key:key, i:i++});
      });
      return order;
    }
  };
})()`;

/**
 * rel: scene file relative to root. plan: [{el, times:[local seconds]}].
 * Returns { z:[{el,key,i}], samples:{el:[{t_local,x,y,w,h,vis}]}, logs }.
 */
export async function probeFile({ root, rel, width, height, plan }) {
  const abs = path.join(root, rel);
  let open = abs, tmp = null;
  const src = fs.readFileSync(abs, "utf8");
  if (/<template\b/i.test(src)) {
    // sub-composition: unwrap <template> so it renders standalone (probe copy sits beside the original, removed after)
    tmp = path.join(path.dirname(abs), `.element-index-probe-${process.pid}.html`);
    fs.writeFileSync(tmp, src.replace(/<\/?template\b[^>]*>/gi, ""));
    open = tmp;
  }
  const b = await launch({ width, height, timeoutMs: 30000 });
  try {
    await b.open(pathToFileURL(open).href);
    await b.eval(PAGE_FN);
    for (let i = 0; i < 40; i++) {
      if (await b.eval("Object.keys(window.__timelines||{}).length")) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    const z = await b.eval("window.__elProbe.z()");
    const samples = {};
    const times = [...new Set(plan.flatMap((p) => p.times))].sort((a, c) => a - c);
    for (const t of times) {
      await b.eval(`window.__elProbe.seek(${Math.max(0, t)})`);
      const rects = await b.eval("window.__elProbe.rects()");
      for (const p of plan) if (p.times.includes(t) && rects[p.el]) (samples[p.el] ||= []).push({ t_local: t, ...rects[p.el] });
    }
    return { z, samples, logs: b.logs.slice(0, 5) };
  } finally {
    await b.close();
    if (tmp) try { fs.unlinkSync(tmp); } catch {}
  }
}
