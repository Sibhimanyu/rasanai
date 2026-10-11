// text-fit: every word meant to be read sits inside the frame. Zero dependencies (Node >= 20, a local Chrome).
// Used by motion-gate.mjs (--project) and slop.mjs (--project). The rule is references/craft.md section 10.
//
//   const r = await textFit(projectDir, { fps: 10, safe: 0.06 })
//     -> { findings[], pages, samples, skipped[], could_not_run[] }
//
// How: the project's compositions are loaded headlessly in one Chrome (over lib/cdp.mjs, no window), each page
// built like crew.mjs strip does (template unwrapped, project root as base, the vendored GSAP), then the timeline is
// seeked to every sample time (default 10 per second, each composition at its own start offset in the film) and the
// REAL DOM boxes are measured: every non-empty text node, via a Range, whose element is visible (display, visibility,
// effective opacity > 0.5 up the ancestor chain, text colour not transparent), font-size >= 20 px. The box is trimmed
// by every ancestor that clips (overflow other than visible, clip-path inset), so a line still masked in is not
// measured beyond its mask. A text fully outside the frame is waiting off screen and is ignored.
//   frame edge   a box that crosses the frame edge for more than 0.4 s continuously        -> text-cropped
//   safe area    a box inside the frame but outside the 6% safe margin, at rest (not moving
//                more than 1.5 px between samples) for 0.4 s or more                        -> text-cropped
// A line may leave the frame only in a deliberate push-through of 0.4 s or less. An element (or a parent) marked
// data-text-fit="ignore" is skipped (a screenshot of a real UI that is meant to bleed off the frame).
import fs from "node:fs";
import path from "node:path";
import { chromePath } from "./common.mjs";
import { launch } from "./cdp.mjs";
import { serve } from "./stage3d.mjs";

export const TEXT_FIT = { fps: 10, safe: 0.06, edge_s: 0.4, rest_s: 0.4, min_font_px: 20, rest_px: 1.5 };
const r2 = (x) => Math.round(x * 100) / 100;
const readText = (p) => { try { return fs.readFileSync(p, "utf8"); } catch { return ""; } };

// runs in the page: seek like crew.mjs strip, then measure
const PAGE_JS = `<script>(function(){
var CFG=window.__tfCfg;
window.__tfSeek=function(T){var L=window.__timelines||{};
  if(window.__specimen&&window.__specimen.tl){try{window.__specimen.tl.pause();window.__specimen.tl.seek(T,false);}catch(e){}}
  Object.keys(L).forEach(function(k){try{L[k].pause();L[k].seek(T,false);}catch(e){}});
  document.querySelectorAll('[data-start][data-duration]').forEach(function(el){if(el.hasAttribute('data-composition-id'))return;var s=parseFloat(el.getAttribute('data-start')),d=parseFloat(el.getAttribute('data-duration'));if(isFinite(s)&&isFinite(d))el.style.visibility=(T>=s&&T<s+d)?'':'hidden';});};
function alpha(c){var m=String(c||'').match(/rgba?\\(([^)]+)\\)/);if(!m)return 1;var p=m[1].split(/[ ,\\/]+/).filter(Boolean);return p.length>=4?parseFloat(p[3]):1;}
function inset(cs,box){var m=String(cs.clipPath||'').match(/^inset\\(([^)]*)\\)/);if(!m)return null;
  var parts=m[1].split(/\\s+round\\s+/)[0].trim().split(/\\s+/),v=parts.map(function(x,i){var n=parseFloat(x);return /%$/.test(x)?n/100:n;}),pc=parts.map(function(x){return /%$/.test(x);});
  var g=function(i){var j=v.length===1?0:v.length===2?(i%2):v.length===3?(i===3?1:i):i;return {n:v[j],p:pc[j]};};
  var t=g(0),r=g(1),b=g(2),l=g(3),w=box.right-box.left,h=box.bottom-box.top;
  return {left:box.left+(l.p?l.n*w:l.n),right:box.right-(r.p?r.n*w:r.n),top:box.top+(t.p?t.n*h:t.n),bottom:box.bottom-(b.p?b.n*h:b.n)};}
window.__tfMeasure=function(){
  var W=CFG.W,H=CFG.H,sx=W*CFG.safe,sy=H*CFG.safe,out=[],walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT),n,idx=0;
  while((n=walker.nextNode())){idx++;
    var txt=String(n.nodeValue||'').replace(/\\s+/g,' ').trim();if(!txt)continue;
    var el=n.parentElement;if(!el||/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|TITLE)$/.test(el.tagName))continue;
    if(el.closest('[data-text-fit="ignore"]'))continue;
    var cs=getComputedStyle(el);if(cs.display==='none'||cs.visibility==='hidden')continue;
    if(!(parseFloat(cs.fontSize)>=CFG.minFont))continue;
    var fill=cs.webkitTextFillColor||cs.color;
    if(alpha(fill)<0.05&&!/text/.test(cs.webkitBackgroundClip||cs.backgroundClip||''))continue;
    var op=1,clips=[],a=el,gone=false;
    while(a&&a.nodeType===1){var s=getComputedStyle(a);if(s.display==='none'||s.visibility==='hidden'&&a===el){gone=true;break;}op*=parseFloat(s.opacity);
      if(a!==document.documentElement&&a!==document.body){var bx=a.getBoundingClientRect();
        if(s.overflowX!=='visible'||s.overflowY!=='visible'||s.contain==='paint')clips.push({left:bx.left,right:bx.right,top:bx.top,bottom:bx.bottom});
        var ci=inset(s,bx);if(ci)clips.push(ci);}
      a=a.parentElement;}
    if(gone||!(op>0.5))continue;
    var rg=document.createRange();rg.selectNodeContents(n);var r=rg.getBoundingClientRect();if(!(r.width>0&&r.height>0))continue;
    var v={left:r.left,right:r.right,top:r.top,bottom:r.bottom};
    clips.forEach(function(c){v.left=Math.max(v.left,c.left);v.right=Math.min(v.right,c.right);v.top=Math.max(v.top,c.top);v.bottom=Math.min(v.bottom,c.bottom);});
    if(!(v.right-v.left>1&&v.bottom-v.top>1))continue;
    if(v.right<=0||v.left>=W||v.bottom<=0||v.top>=H)continue;
    var e=1,kind=null,side=null;
    if(v.left<-e){kind='edge';side='left';}else if(v.right>W+e){kind='edge';side='right';}else if(v.top<-e){kind='edge';side='top';}else if(v.bottom>H+e){kind='edge';side='bottom';}
    else if(v.left<sx-e){kind='safe';side='left';}else if(v.right>W-sx+e){kind='safe';side='right';}else if(v.top<sy-e){kind='safe';side='top';}else if(v.bottom>H-sy+e){kind='safe';side='bottom';}
    if(kind)out.push({k:idx,text:txt.slice(0,80),kind:kind,side:side,l:v.left,t:v.top,r:v.right,b:v.bottom});}
  return out;};
window.__tfRun=function(times){return times.map(function(T){window.__tfSeek(T);return {T:T,hits:window.__tfMeasure()};});};
})();</script>`;

function pageFor(file, root, baseUrl, W, H, safe) {
  let html = readText(file).replace(/<template[^>]*>/gi, "").replace(/<\/template>/gi, "");
  html = html.replace(/<script[^>]+src=["'][^"']*gsap(?:\.min)?\.js["'][^>]*><\/script>/gi, `<script src="/__rasanai/gsap.min.js"></script>`);
  const gsapTag = /gsap(\.min)?\.js/.test(html) ? "" : `<script src="/__rasanai/gsap.min.js"></script>`;
  const head = `<base href="${baseUrl}/">${gsapTag}<script>window.__timelines=window.__timelines||{};window.__tfCfg=${JSON.stringify({ W, H, safe, minFont: TEXT_FIT.min_font_px })};</script><style>html,body{margin:0;padding:0;background:#000;overflow:hidden;width:${W}px;height:${H}px}</style>`;
  html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + head) : head + html;
  html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, PAGE_JS + "</body>") : html + PAGE_JS;
  const tmp = path.join(root, `.rasanai-textfit-${process.pid}-${Math.random().toString(36).slice(2, 8)}.html`);
  fs.writeFileSync(tmp, html);
  return tmp;
}

// which pages to sample, and when each one is on screen in the film: [{file, start, end}]
function pagesOf(project) {
  const idxFile = path.join(project, "index.html");
  const idx = readText(idxFile);
  const pages = [];
  const num = (tag, k) => Number((tag.match(new RegExp(`data-${k}="([\\d.]+)"`)) || [])[1]);
  let filmEnd = 0;
  for (const m of idx.matchAll(/<[a-z]+\b[^>]*data-composition-src="([^"]+)"[^>]*>/gi)) {
    const start = num(m[0], "start") || 0, dur = num(m[0], "duration");
    const file = path.join(project, m[1]);
    if (Number.isFinite(dur) && fs.existsSync(file)) pages.push({ file, start, end: start + dur });
    if (Number.isFinite(dur)) filmEnd = Math.max(filmEnd, start + dur);
  }
  if (idx) {
    const rootTag = (idx.match(/<[a-z]+\b[^>]*data-composition-id="[^"]*"[^>]*>/i) || [""])[0];
    const dur = num(rootTag, "duration") || filmEnd || Math.max(0, ...[...idx.matchAll(/data-duration="([\d.]+)"/g)].map((x) => Number(x[1])));
    if (dur > 0) pages.unshift({ file: idxFile, start: 0, end: dur });
  } else {
    // no index: each composition on its own from 0
    for (const sub of ["compositions/frames", "compositions"]) {
      const d = path.join(project, sub);
      if (!fs.existsSync(d)) continue;
      for (const f of fs.readdirSync(d)) if (f.endsWith(".html") && !pages.some((p) => p.file === path.join(d, f))) {
        const dur = Number((readText(path.join(d, f)).match(/data-duration="([\d.]+)"/) || [])[1]);
        if (dur > 0) pages.push({ file: path.join(d, f), start: 0, end: dur });
      }
    }
  }
  return pages;
}
const sizeOf = (project) => {
  const idx = readText(path.join(project, "index.html"));
  return { W: Number((idx.match(/data-width="(\d+)"/) || [])[1]) || 1920, H: Number((idx.match(/data-height="(\d+)"/) || [])[1]) || 1080 };
};

// samples -> findings. byKey: Map key -> [{t, kind, side, l,t,r,b}] in time order; dt = 1/fps
export function analyze(byKey, dt, file) {
  const findings = [];
  const edgeMin = Math.floor(TEXT_FIT.edge_s / dt + 1e-9) + 1; // more than 0.4 s
  const restMin = Math.ceil(TEXT_FIT.rest_s / dt - 1e-9); // 0.4 s or more
  for (const [, rows] of byKey) {
    const flagged = [];
    // edge: consecutive samples crossing the frame edge
    let cur = [];
    const flush = (min, mk) => { if (cur.length >= min) flagged.push(mk(cur)); cur = []; };
    rows.forEach((r, i) => {
      const prev = rows[i - 1];
      if (r.kind === "edge" && (!cur.length || r.t - prev.t <= dt * 1.5)) cur.push(r);
      else { flush(edgeMin, (c) => ({ from: c[0].t, to: c[c.length - 1].t + dt, kind: "edge", side: c[0].side, text: c[0].text })); if (r.kind === "edge") cur.push(r); }
    });
    flush(edgeMin, (c) => ({ from: c[0].t, to: c[c.length - 1].t + dt, kind: "edge", side: c[0].side, text: c[0].text }));
    // safe area at rest: consecutive samples (edge or safe) whose box barely moves
    const still = (a, b) => ["l", "t", "r", "b"].every((k) => Math.abs(a[k] - b[k]) <= TEXT_FIT.rest_px);
    cur = [];
    rows.forEach((r, i) => {
      const prev = rows[i - 1];
      if (cur.length && r.t - prev.t <= dt * 1.5 && still(prev, r)) cur.push(r);
      else { flush(restMin, (c) => ({ from: c[0].t, to: c[c.length - 1].t + dt, kind: "safe", side: c[0].side, text: c[0].text })); cur.push(r); }
    });
    flush(restMin, (c) => ({ from: c[0].t, to: c[c.length - 1].t + dt, kind: "safe", side: c[0].side, text: c[0].text }));
    // a safe-area run that overlaps an edge run is the same problem
    for (const f of flagged.sort((a, b) => a.from - b.from)) {
      if (f.kind === "safe" && flagged.some((g) => g.kind === "edge" && g.from < f.to && g.to > f.from)) continue;
      const where = f.kind === "edge" ? `crosses the ${f.side} edge of the frame` : `sits outside the ${Math.round(TEXT_FIT.safe * 100)}% safe area (${f.side}) at rest`;
      findings.push({
        check: "text-cropped", severity: "error", at: r2(f.from), from: r2(f.from), to: r2(f.to), text: f.text.slice(0, 40), file: path.basename(file), region: `${f.side} edge`,
        message: `"${f.text.slice(0, 40)}" ${where} from ${r2(f.from)} to ${r2(f.to)} s${f.kind === "edge" ? ` (${r2(f.to - f.from)} s; a push-through may leave the frame for ${TEXT_FIT.edge_s} s at most)` : ""}`,
        fix: "set the line smaller (the brand film card's type scale, never as big as possible), shorten it to fit on one line, or wrap it in a narrower box; every line meant to be read sits fully inside the 6% safe area at rest (references/craft.md section 10)",
      });
    }
  }
  return findings;
}

export async function textFit(project, { fps = TEXT_FIT.fps, safe = TEXT_FIT.safe } = {}) {
  const res = { findings: [], pages: 0, samples: 0, skipped: [], could_not_run: [] };
  const root = path.resolve(project);
  const pages = pagesOf(root);
  if (!pages.length) { res.skipped.push("text-fit: no compositions with a duration to sample (index.html, compositions/)"); return res; }
  const { W, H } = sizeOf(root);
  const dt = 1 / fps;
  // chromePath() exits the process when no Chrome exists; a gate must report that, not die
  { const realExit = process.exit; process.exit = () => { throw new Error("no Chrome found (npx hyperframes browser ensure, or set RASANAI_CHROME)"); };
    try { chromePath(); } catch (e) { res.could_not_run.push(`text-fit: ${e.message}`); return res; } finally { process.exit = realExit; } }
  let b, srv;
  const tmps = [];
  try {
    srv = await serve(root);
    b = await launch({ width: W, height: H, timeoutMs: 120000 });
    for (const pg of pages) {
      const tmp = pageFor(pg.file, root, srv.url, W, H, safe);
      tmps.push(tmp);
      try {
        await b.open(`${srv.url}/${path.basename(tmp)}`, { waitMs: 30000 });
        await b.eval("document.fonts && document.fonts.ready ? document.fonts.ready.then(function(){return true;}) : true", { await: true });
        const times = [];
        for (let i = 0; pg.start + i * dt < pg.end - 1e-6; i++) times.push(Math.round(i * dt * 1000) / 1000); // seconds into this composition
        const byKey = new Map();
        for (let i = 0; i < times.length; i += 150) {
          const rows = await b.eval(`window.__tfRun(${JSON.stringify(times.slice(i, i + 150))})`);
          for (const row of rows) for (const h of row.hits) {
            const k = h.k;
            if (!byKey.has(k)) byKey.set(k, []);
            byKey.get(k).push({ ...h, t: pg.start + row.T });
          }
        }
        res.samples += times.length;
        res.pages++;
        res.findings.push(...analyze(byKey, dt, pg.file));
      } catch (e) {
        res.could_not_run.push(`text-fit: ${path.relative(root, pg.file)}: ${e.message}`);
      }
    }
  } catch (e) {
    res.could_not_run.push(`text-fit: ${e.message}`);
  } finally {
    if (b) await b.close();
    if (srv) await srv.close();
    for (const t of tmps) fs.rmSync(t, { force: true });
  }
  return res;
}
