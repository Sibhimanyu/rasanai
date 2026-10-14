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
//   frame edge   a box that crosses the frame edge for more than 1.2 s continuously        -> text-cropped
//   safe area    a box inside the frame but outside the 6% safe margin, at rest (not moving
//                more than 1.5 px between samples) for 0.4 s or more                        -> text-cropped
// A line may leave the frame only in a deliberate push-through of 1.2 s or less (an oversize word may sweep across the frame cropped,
// as long as the same line then rests readable). An element (or a parent) marked
// data-text-fit="ignore" is skipped (a screenshot of a real UI that is meant to bleed off the frame).
// The same samples also measure LINE BLOCKS: text nodes grouped under the first non-inline ancestor (so SplitText
// word/char spans are one line). A block is readable at a sample when at least half of its words (the most it ever has,
// so a typewriter grows) are visible by the rules above and inside the frame.
//   text-too-brief  a statement-size block (font >= 3.5% of the frame height) of 3+ words whose longest continuous
//                   readable run is shorter than 0.6 s + 0.3 s per word (story.mjs's reading time) less one sample
//   text-overlap    two different readable blocks (neither inside the other) whose line boxes intersect by 15% of
//                   the smaller one's area or more for 0.3 s continuously (a crossfade shorter than that passes)
//   text-too-small  OFF unless a lesson sets text.statement_min_h (lessons.mjs add … --gate text.statement_min_h=0.05): a readable
//                   block of 3+ words (not skim) whose font-size is under that share of the frame height, readable for 0.4 s or more
// text.read_per_word_s (default 0.3) is read through gateValue too: a lesson can only make the reading time longer.
// data-read="skim" (on the element or a parent; captions, in a composition or element named caption*, are skim by default
// because they track the narration) opts a block out of text-too-brief (UI text that only has to register);
// data-overlap="ok" opts it out of text-overlap; data-text-fit="ignore" opts out of everything.
import fs from "node:fs";
import path from "node:path";
import { chromePath } from "./common.mjs";
import { launch } from "./cdp.mjs";
import { serve } from "./stage3d.mjs";
import { gateValue, gateNotes } from "./gate-lessons.mjs";
import { noteDowngrade } from "./downgrade.mjs";

export const TEXT_FIT = { fps: 10, safe: 0.06, edge_s: 1.2, rest_s: 0.4, min_font_px: 20, rest_px: 1.5,
  statement: 0.035, read_base_s: 0.6, read_per_word_s: 0.3, brief_min_words: 3, overlap_frac: 0.15, overlap_s: 0.3, read_slack: 0.85 };
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
function chain(el){var op=1,clips=[],a=el;
  while(a&&a.nodeType===1){var s=getComputedStyle(a);if(s.display==='none'||s.visibility==='hidden'&&a===el)return null;op*=parseFloat(s.opacity);
    if(a!==document.documentElement&&a!==document.body){var bx=a.getBoundingClientRect();
      if(s.overflowX!=='visible'||s.overflowY!=='visible'||s.contain==='paint')clips.push({left:bx.left,right:bx.right,top:bx.top,bottom:bx.bottom});
      var ci=inset(s,bx);if(ci)clips.push(ci);}
    a=a.parentElement;}
  return {op:op,clips:clips};}
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
    var ch=chain(el);if(!ch||!(ch.op>0.5))continue;var clips=ch.clips;
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
// line blocks: text nodes grouped under the first non-inline ancestor (SplitText word/char spans are one line);
// per block the visible share of its words and its visible line boxes (same visibility rules as above)
var BID=new WeakMap(),BN=0;
function blockOf(el){var b=el;while(b.parentElement&&/^(inline|contents)/.test(getComputedStyle(b).display))b=b.parentElement;return b;}
window.__tfBlocks=function(){
  var W=CFG.W,H=CFG.H,G=[],map=new Map(),walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT),n;
  while((n=walker.nextNode())){
    var raw=String(n.nodeValue||''),el=n.parentElement;if(!raw||!el||/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|TITLE)$/.test(el.tagName))continue;
    if(el.closest('[data-text-fit="ignore"]'))continue;
    var cs=getComputedStyle(el);if(cs.display==='none')continue;
    var be=blockOf(el),g=map.get(be);if(!g){g={el:be,segs:[],rects:[]};map.set(be,g);G.push(g);}
    var vis=false,ch=/\\S/.test(raw)?chain(el):null,fill=cs.webkitTextFillColor||cs.color;
    if(ch&&ch.op>0.5&&cs.visibility!=='hidden'&&!(alpha(fill)<0.05&&!/text/.test(cs.webkitBackgroundClip||cs.backgroundClip||''))){
      var rg=document.createRange();rg.selectNodeContents(n);var rs=rg.getClientRects();
      for(var i=0;i<rs.length;i++){var v={left:rs[i].left,right:rs[i].right,top:rs[i].top,bottom:rs[i].bottom};
        ch.clips.forEach(function(c){v.left=Math.max(v.left,c.left);v.right=Math.min(v.right,c.right);v.top=Math.max(v.top,c.top);v.bottom=Math.min(v.bottom,c.bottom);});
        if(v.right-v.left>1&&v.bottom-v.top>1&&v.right>0&&v.left<W&&v.bottom>0&&v.top<H){vis=true;g.rects.push(v);}}}
    g.segs.push({s:raw,v:vis});}
  var out=[];
  G.forEach(function(g){
    var str='',vc=[];g.segs.forEach(function(x){str+=x.s;for(var i=0;i<x.s.length;i++)vc.push(x.v?1:0);});
    var words=0,vw=0,re=/\\S+/g,m;while((m=re.exec(str))){words++;var c=0;for(var i=m.index;i<m.index+m[0].length;i++)c+=vc[i];vw+=c/m[0].length;}
    var f=parseFloat(getComputedStyle(g.el).fontSize);
    if(!(vw>0)||!g.rects.length||!(f>=CFG.minFont))return;
    var lines=[];g.rects.sort(function(a,b){return a.top-b.top;}).forEach(function(r){
      for(var j=0;j<lines.length;j++){var L=lines[j],ov=Math.min(L.bottom,r.bottom)-Math.max(L.top,r.top);
        if(ov>0.5*Math.min(L.bottom-L.top,r.bottom-r.top)){L.left=Math.min(L.left,r.left);L.right=Math.max(L.right,r.right);L.top=Math.min(L.top,r.top);L.bottom=Math.max(L.bottom,r.bottom);return;}}
      lines.push({left:r.left,right:r.right,top:r.top,bottom:r.bottom});});
    var id=BID.get(g.el);if(!id){id=++BN;BID.set(g.el,id);}
    out.push({i:id,w:words,v:vw,f:f,t:str.replace(/\\s+/g,' ').trim().slice(0,80),s:g.el.closest('[data-read="skim"],[data-composition-id*="caption" i],[class*="caption" i],[id*="caption" i]')?1:0,o:g.el.closest('[data-overlap="ok"]')?1:0,
      r:lines.map(function(r){var p=0.15*(r.bottom-r.top);return [Math.round(r.left),Math.round(r.top+p),Math.round(r.right),Math.round(r.bottom-p)];}),el:g.el});}); // ink, not the line box: stacked lines at line-height 1 do not overlap
  out.forEach(function(x){x.a=out.filter(function(y){return y!==x&&y.el.contains(x.el);}).map(function(y){return y.i;});});
  out.forEach(function(x){delete x.el;});
  return out;};
window.__tfRun=function(times){return times.map(function(T){window.__tfSeek(T);return {T:T,hits:window.__tfMeasure(),blocks:window.__tfBlocks()};});};
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
export function pagesOf(project) {
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
export const sizeOf = (project) => {
  const idx = readText(path.join(project, "index.html"));
  return { W: Number((idx.match(/data-width="(\d+)"/) || [])[1]) || 1920, H: Number((idx.match(/data-height="(\d+)"/) || [])[1]) || 1080 };
};

// samples -> findings. byKey: Map key -> [{t, kind, side, l,t,r,b}] in time order; dt = 1/fps
export function analyze(byKey, dt, file) {
  const findings = [];
  const edgeMin = Math.floor(TEXT_FIT.edge_s / dt + 1e-9) + 1; // more than 1.2 s
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

// block rows -> findings. byBlock: Map id -> [{t, w, v, f, t:text, s, o, a, r:[[l,t,r,b]]}] in time order
export function analyzeBlocks(byBlock, dt, file, H) {
  const findings = [], T = { ...TEXT_FIT, read_per_word_s: gateValue("text.read_per_word_s", TEXT_FIT.read_per_word_s) }, base = path.basename(file);
  const minH = gateValue("text.statement_min_h", null), lesson = gateNotes(["text.read_per_word_s", "text.statement_min_h"]);
  const tail = lesson.length ? ` [measured by ${lesson.join("; ")}]` : "";
  const maxW = new Map(), per = new Map(); // id -> most words seen; time -> readable rows
  for (const [id, rows] of byBlock) maxW.set(id, Math.max(...rows.map((r) => r.w)));
  const runs = (ts) => { // consecutive sample times -> [[from, to(exclusive)]]
    const out = [];
    for (const t of ts) { const l = out[out.length - 1]; if (l && t - l[1] <= dt * 0.5 + 1e-9) l[1] = t + dt; else out.push([t, t + dt]); }
    return out;
  };
  for (const [id, rows] of byBlock) {
    const w = maxW.get(id), ok = rows.filter((r) => r.v * 2 >= w), text = rows.reduce((a, b) => (b.v > a.v ? b : a)).x;
    for (const r of ok) { const k = Math.round(r.t * 1000); if (!per.has(k)) per.set(k, []); per.get(k).push({ id, ...r }); }
    if (minH != null && ok.length && w >= T.brief_min_words && rows[0].f < minH * H && !rows.some((r) => r.s)) {
      const run = runs(ok.map((r) => r.t)).reduce((a, b) => (b[1] - b[0] > a[1] - a[0] ? b : a), [0, 0]);
      if (run[1] - run[0] >= T.rest_s - 1e-9) findings.push({
        check: "text-too-small", severity: "error", at: r2(run[0]), from: r2(run[0]), to: r2(run[1]), text: text.slice(0, 40), file: base, region: "text",
        message: `"${text.slice(0, 40)}" is set at ${Math.round(rows[0].f)} px, ${r2(rows[0].f / H * 100)}% of the frame height; a readable line of ${w} words must be at least ${r2(minH * 100)}% (${Math.round(minH * H)} px), ${r2(run[0])}–${r2(run[1])} s${tail}`,
        fix: 'set it larger (or shorter so it can be), or mark it data-read="skim" if it is texture; the user taught this rule on an earlier film (lessons.mjs)',
      });
    }
    if (!ok.length || w < T.brief_min_words || rows[0].f < T.statement * H || rows.some((r) => r.s)) continue;
    const need = T.read_base_s + T.read_per_word_s * w;
    const best = runs(ok.map((r) => r.t)).reduce((a, b) => (b[1] - b[0] > a[1] - a[0] ? b : a), [0, 0]);
    if (best[1] - best[0] >= need * T.read_slack - dt - 1e-9) continue; // 15% slack: a line a few frames short reads; one held half its time does not
    const shown = best[1] - best[0];
    findings.push({
      check: "text-too-brief", severity: "error", at: r2(best[0]), from: r2(best[0]), to: r2(best[1]), text: text.slice(0, 40), file: base, region: "text",
      message: `"${text.slice(0, 40)}" is readable for ${r2(shown)} s (${r2(best[0])}–${r2(best[1])} s); ${w} words need ${r2(need)} s${T.read_per_word_s > TEXT_FIT.read_per_word_s ? tail : ""}`,
      fix: 'hold it longer, cut words, or mark it data-read="skim" if it is texture; never speed it up (references/craft.md section 10)',
    });
  }
  // overlap: pairs of readable blocks whose line boxes intersect, continuously
  const area = (rs) => rs.reduce((a, r) => a + (r[2] - r[0]) * (r[3] - r[1]), 0);
  const inter = (a, b) => { let s = 0; for (const p of a) for (const q of b) s += Math.max(0, Math.min(p[2], q[2]) - Math.max(p[0], q[0])) * Math.max(0, Math.min(p[3], q[3]) - Math.max(p[1], q[1])); return s; };
  const pairs = new Map();
  for (const k of [...per.keys()].sort((a, b) => a - b)) {
    const rs = per.get(k);
    for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
      const a = rs[i], b = rs[j];
      if (a.o || b.o || a.a.includes(b.id) || b.a.includes(a.id)) continue;
      if (inter(a.r, b.r) < T.overlap_frac * Math.min(area(a.r), area(b.r))) continue;
      const pk = a.id + "|" + b.id;
      if (!pairs.has(pk)) pairs.set(pk, { a, b, ts: [] });
      pairs.get(pk).ts.push(k / 1000);
    }
  }
  for (const { a, b, ts } of pairs.values()) {
    const run = runs(ts).find((x) => x[1] - x[0] >= T.overlap_s - 1e-9);
    if (!run) continue;
    const ta = a.x.slice(0, 30), tb = b.x.slice(0, 30);
    findings.push({
      check: "text-overlap", severity: "error", at: r2(run[0]), from: r2(run[0]), to: r2(run[1]), text: `${ta} / ${tb}`, file: base, region: "text",
      message: `"${ta}" and "${tb}" are on top of each other from ${r2(run[0])} to ${r2(run[1])} s (${r2(run[1] - run[0])} s; a crossfade shorter than ${T.overlap_s} s passes)`,
      fix: 'move one, stagger them so one leaves before the other lands, or make one a ghost (opacity 0.5 or less); data-overlap="ok" only for a deliberate layered lockup (references/craft.md section 10)',
    });
  }
  // a page of deliberate texture (a cascade of data lines) would bury the report: the longest three, and a count
  const ovl = findings.filter((f) => f.check === "text-overlap").sort((a, b) => b.to - b.from - (a.to - a.from));
  if (ovl.length > 3) {
    ovl[2].message += ` (+${ovl.length - 3} more overlapping pairs on this page)`;
    return findings.filter((f) => f.check !== "text-overlap" || ovl.indexOf(f) < 3);
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
    try { chromePath(); } catch (e) { res.could_not_run.push(`text-fit: ${e.message}`); noteDowngrade({ what: "the text-fit check", instead: "no text measurement", why: String(e.message).slice(0, 200), impact: "overflowing or clipped text is not caught" }); return res; } finally { process.exit = realExit; } }
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
        const byKey = new Map(), byBlock = new Map();
        for (let i = 0; i < times.length; i += 150) {
          const rows = await b.eval(`window.__tfRun(${JSON.stringify(times.slice(i, i + 150))})`);
          for (const row of rows) for (const h of row.hits) {
            const k = h.k;
            if (!byKey.has(k)) byKey.set(k, []);
            byKey.get(k).push({ ...h, t: pg.start + row.T });
          }
          for (const row of rows) for (const { i, t: x, ...h } of row.blocks) {
            if (!byBlock.has(i)) byBlock.set(i, []);
            byBlock.get(i).push({ ...h, x, t: pg.start + row.T });
          }
        }
        res.samples += times.length;
        res.pages++;
        res.findings.push(...analyze(byKey, dt, pg.file), ...analyzeBlocks(byBlock, dt, pg.file, H));
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
