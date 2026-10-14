#!/usr/bin/env node
// The frame gate: measure the picture, not the plan. A film that is one centred widget on a flat white ground with
// 100 characters on screen and nothing larger than a heading passes every gate that reads the plan; it fails here,
// on the pixels (and on the DOM text when the project is given), with the numbers and the fix.
//
//   node frame-gate.mjs (--stills <dir of PNG|JPG | a.png,b.png> [--html <dir of the same-named .html boards>]
//                       | --video <film.mp4> [--fps 4]) [--project <videos/name>]
//        [--brand-film <grammar.json | brand film .mp4 | frames dir>] [--write-brand <grammar.json>]
//        [--kind launch|brand|explainer] [--density] [--plan <run>/motion/score.json] [--stillness] [--json]
//   -> per-frame and film metrics, findings (each with the number, the threshold and a fix);
//      exit 0 clean (warnings allowed) · 2 errors · 1 could not run (never "clean")
//
// Pixel metrics (ffmpeg decodes to 480 px wide; stills as given, video sampled at 4 fps; lib/pixels.mjs has the
// definitions, ported from .context/night/r1-scripts): ground chroma and L* range of the empty tiles, soft content
// (the share of structure that is blurred), colourfulness (Hasler-Susstrunk), median saturation, hard cuts and
// average shot length, composition changes per 10 s.
// DOM text metrics (--project, or --html beside --stills; headless Chrome, no window, the timeline seeked at each
// sample like lib/textfit.mjs): visible characters, readable lines, the biggest line as % of frame height (the
// rendered line box x 0.82, which is what an OCR box of the glyphs measures), p90/p10 of the biggest line across the
// film, frames with a line of 20% H or more, any 35% H moment, and the biggest object (img, canvas, video, svg).
// Without --project / --html none of the DOM checks run (text-load, competing-heroes, scale-contrast, giant-moment,
// no-peak-moment): the result says so in `skipped` and on screen, never silently.
// Boldness (a video of 15 s or more; lib/pixels.mjs boldFrame): a frame is a big moment when it holds a giant glyph
// (a letter, numeral or icon drawn 15% H or taller), an ink mass filling 40% of the frame, or a colour field (the
// frame's own ground, covering 40% of it, is dE 20 or more from the film's main ground); with --project, also a DOM
// line of 20% H or more. Grounds = the distinct ground colours held 3% of the film or longer.
//
// Thresholds (references/craft.md "Frame metrics"; R1 section 4 rounded to the reference films, calibrated in
// .context/night/done-W2.md). A brand film's measured values replace them when given (--brand-film).
//   ground-chroma   >= 1.5            ground-range  >= 4 L*   (flat white or black ground only when the brand film
//                                     measures exactly that; then the type-scale rules below are errors)
//   soft-content    film soft-share p90 >= 0.15, or a blurred plane (soft share >= 0.15) in >= 15% of shots; skipped
//                                     when the brand film never blurs (R1 asked 40% of shots: no reference reaches it)
//   flat-swatch-grounds  more than 3 distinct flat grounds (9 sampled points under 6% luma range, Lab distance >= 8 apart) in a
//                   film of 4+ shots: warning; 6 or more: error; waived when the brand film's ground is flat
//   colourfulness   p90 >= 35 (warning)
//   text-load       median characters on screen <= 40 (warning), > 70 (error)
//   scale-contrast  p90/p10 of the biggest line >= 5, or object-scale p90/p10 >= 5
//   competing-heroes  the two largest elements are each >= 6% of the frame area and within 1.3x in over 15% of frames (warning)
//   giant-moment    >= 10% of frames with a line >= 20% H (warning below, error at 0 in a film of 20 s or more);
//                   at least one moment >= 35% H (warning)
//   cut-rhythm      average hard-cut shot <= 5 s on a launch film of 8 s or more (warning)
//   boldness        big moments on >= 25% of the frames (refs 29 to 89%, Google 17%; FILM-D 54%, FILM-E 18%); an error,
//                   a warning in a declared stillness or editorial style (--stillness, score stillness: true or
//                   motion_style stillness|editorial, motion.md stillness: true)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, chromePath } from "./lib/common.mjs";
import { gateValue, gateNotes } from "./lib/gate-lessons.mjs";
import { launch } from "./lib/cdp.mjs";
import { serve } from "./lib/stage3d.mjs";
import { pagesOf, sizeOf } from "./lib/textfit.mjs";
import { decodeStill, decodeVideo, frameMetrics, boldFrame, cutsAndCompositions, ffmpegOk, rgbToLab, percentile as pct, median } from "./lib/pixels.mjs";
import { noteDowngrade } from "./lib/downgrade.mjs";

export const GATE = {
  ground_chroma: 1.5, ground_range: 4, // R10
  flat_chroma: 0.5, flat_range: 2, // a brand film below both measures a flat ground
  soft_share: 0.15, soft_shots: 0.15, // R9: a shot has a blurred plane when its soft share reaches soft_share; the film passes on a p90 of soft_share or on this share of shots (R1 asked 40%: no reference reaches it, see done-W2.md)
  never_blurs: 0.05, // a brand film whose soft p90 is below this never blurs (Google 0.03, OpenAI 0; the films that blur are 0.18 and up)
  colourful_p90: 35, // R12
  chars_warn: 40, chars_error: 70, // R4
  scale_ratio: 5, giant_h: 20, giant_share: 0.10, peak_h: 35, // R5
  asl_s: 5, asl_min_dur: 8, comp_rate: 10, // a long shot is fine when the composition keeps changing in it (v9721: ASL 5.3 s, 11 per 10 s) // R17 (4.5 s on the refs' own detector; 5 on this one, see done-W2.md)
  ink: 0.82, // rendered line box -> glyph ink box (what OCR measures)
  min_line_pct: 0.8, // lines under 0.8% of the frame height are not readable (OCR floor in R1)
  min_opacity: 0.35, min_object_pct: 4, // an object counts as a hero candidate from 4% of the frame height
  hero_min_pct: 6, hero_ratio: 1.3, hero_share: 0.15, // competing-heroes: the two largest elements each >= 6% of the frame area and within 1.3x, in over 15% of the frames (11 built films: imago-launch 16% with a real headline-vs-card pair, every other film 7% or less)
  swatch_grounds: 3, swatch_error: 6, swatch_de: 8, // flat swatch grounds: more than 3 distinct flat grounds (Lab distance >= 8) in a film of 4+ shots is a deck (warning), 6 or more an error; waived when the brand film's ground is flat
  unreadable_blur: 4, // text under a blur of this many px is not read (it counts for scale, not for load)
  bold_share: 0.25, bold_min_dur: 15, // boldness: big moments on >= 25% of frames, films of 15 s or more (refs 29 to 89%: Sovra 29 is the floor; Google 17%; FILM-D 54%, FILM-E 18%)
  bold_obj: 0.4, field_de: 20, field_near: 0.4, // a big moment: an ink mass >= 40% of the frame, or a colour field (the frame's ground covers >= 40% of it and is dE >= 20 from the main ground)
  ground_near: 0.3, ground_min: 0.03, // a ground counts when it covers >= 30% of a frame, and toward the count of grounds when it holds >= 3% of the film (and 1 s)
};

// Boldness over a film's frames. rows: [{ t, gL, ga, gb, near, glyph, obj }] from boldFrame; domBig: optional [bool]
// aligned (a DOM line >= 20% H). -> { bigShare, glyphShare, objShare, fieldShare, domShare, grounds, beats, beatsPer30,
// glyphMax, beatTimes: [[t0, t1]], gap: [t0, t1] (the longest stretch without a big moment) }
export function boldnessOf(rows, dur, domBig = null) {
  const cl = [];
  for (const r of rows) {
    if (r.near < GATE.ground_near) continue;
    let c = cl.find((c) => Math.hypot(c.L - r.gL, c.a - r.ga, c.b - r.gb) < GATE.field_de);
    if (!c) { c = { L: r.gL, a: r.ga, b: r.gb, n: 0 }; cl.push(c); }
    c.n++;
  }
  cl.sort((x, y) => y.n - x.n);
  const m = cl[0], step = rows.length > 1 ? rows[1].t - rows[0].t : 0.25;
  const grounds = cl.filter((c) => c.n >= Math.max(GATE.ground_min * rows.length, 1 / Math.max(step, 1e-3))).length;
  const fl = rows.map((r, i) => {
    const field = !!m && r.near >= GATE.field_near && Math.hypot(m.L - r.gL, m.a - r.ga, m.b - r.gb) >= GATE.field_de;
    const glyph = r.glyph > 0, obj = r.obj >= GATE.bold_obj, dom = !!(domBig && domBig[i]);
    return { t: r.t, glyph, obj, field, dom, big: glyph || obj || field || dom };
  });
  const share = (k) => r2(fl.filter((f) => f[k]).length / Math.max(1, fl.length));
  const beatTimes = []; let gap = [0, 0], from = 0;
  fl.forEach((f, i) => {
    if (f.big && (i === 0 || !fl[i - 1].big)) { let j = i; while (j + 1 < fl.length && fl[j + 1].big) j++; if (j > i) beatTimes.push([r2(f.t), r2(fl[j].t + step)]); }
    if (f.big) { if (f.t - from > gap[1] - gap[0]) gap = [r2(from), r2(f.t)]; from = f.t + step; }
  });
  if (dur - from > gap[1] - gap[0]) gap = [r2(from), r2(dur)];
  return { bigShare: share("big"), glyphShare: share("glyph"), objShare: share("obj"), fieldShare: share("field"), domShare: domBig ? share("dom") : null, grounds, beats: beatTimes.length, beatsPer30: r1(30 * beatTimes.length / Math.max(dur, 1e-3)), glyphMax: r1(Math.max(0, ...rows.map((r) => r.glyph))), beatTimes, gap };
}

const r1 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);
const r2 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);
const r3 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1000) / 1000);
const nums = (a) => a.filter((v) => v != null && Number.isFinite(v));
const readJ = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

// ------------------------------------------------------------------ brand film values
// A brand film's frame metrics: from grammar.json's frameMetrics block (written by --write-brand), from the older
// grammar.json fields, or measured from a film / frames dir. -> { groundChroma, groundRange, softP90, colourfulP90,
// charsMedian, flat, source } or null
export async function brandMetrics(spec) {
  if (!spec) return null;
  const p = path.resolve(spec);
  if (!fs.existsSync(p)) return { error: `--brand-film ${spec} does not exist` };
  if (/\.json$/i.test(p)) {
    const g = readJ(p);
    if (!g) return { error: `${spec} is not valid JSON` };
    const m = g.frameMetrics;
    if (m) return { ...m, flat: m.groundChroma < GATE.flat_chroma && m.groundRange < GATE.flat_range, source: p };
    // brandfilm.mjs measure's finish block (measured.finish: ground tint and falloff, softness, the route)
    const fin = g.measured && g.measured.finish;
    if (fin && fin.groundChroma != null) {
      const soft = fin.softContent && fin.softContent.p90;
      return { groundChroma: fin.groundChroma, groundRange: fin.groundRange ?? null, softP90: soft ?? null, colourfulP90: null, charsMedian: null, flat: fin.groundChroma < GATE.flat_chroma && (fin.groundRange ?? 0) < GATE.flat_range, source: p };
    }
    // an older grammar.json: it knows the neutral share, not the L* range; a film that is 90% neutral has no coloured ground
    const neutral = g.chroma && g.chroma.neutralShare;
    const flat = neutral >= 0.9 && g.luminance && (g.luminance.bgMean >= 235 || g.luminance.bgMean <= 20);
    return { groundChroma: neutral >= 0.9 ? 0 : null, groundRange: flat ? 0 : null, softP90: null, colourfulP90: null, charsMedian: null, flat: !!flat, source: p, partial: true };
  }
  const res = await measureFrames(fs.statSync(p).isDirectory() ? { stills: p, quiet: true } : { video: p, quiet: true });
  if (!res.film) return { error: `could not measure ${spec}: ${(res.could_not_run || []).join("; ")}` };
  const f = res.film;
  return { groundChroma: f.groundChroma, groundRange: f.groundRange, softP90: f.softP90, colourfulP90: f.colourfulP90, charsMedian: null, flat: f.groundChroma < GATE.flat_chroma && f.groundRange < GATE.flat_range, source: p };
}

// the limits in force: the defaults, or the brand film's measured values (never stricter than the defaults)
export function limitsFor(brand) {
  const L = { groundChroma: GATE.ground_chroma, groundRange: GATE.ground_range, softP90: GATE.soft_share, colourfulP90: GATE.colourful_p90, charsWarn: GATE.chars_warn, charsError: GATE.chars_error, flat: false, neverBlurs: false, notes: [] };
  if (!brand || brand.error) return L;
  if (brand.flat) { L.flat = true; L.notes.push("the brand film measures a flat ground: ground rules are waived and the type-scale rules are errors"); }
  else {
    if (brand.groundChroma != null) L.groundChroma = brand.groundChroma < GATE.flat_chroma ? 0 : Math.min(L.groundChroma, Math.max(0.5, 0.75 * brand.groundChroma));
    if (brand.groundRange != null) L.groundRange = brand.groundRange < GATE.flat_range ? 0 : Math.min(L.groundRange, Math.max(1, 0.75 * brand.groundRange));
    if (L.groundChroma === 0) L.notes.push("the brand film's ground is neutral (no chroma): the chroma rule is waived, the L* range stays");
  }
  if (brand.softP90 != null && brand.softP90 < GATE.never_blurs) { L.neverBlurs = true; L.notes.push("the brand film never blurs: soft-content rule waived"); }
  else if (brand.softP90 != null) L.softP90 = Math.min(L.softP90, 0.75 * brand.softP90);
  if (brand.colourfulP90 != null) L.colourfulP90 = Math.min(L.colourfulP90, 0.75 * brand.colourfulP90);
  if (brand.charsMedian != null) { L.charsWarn = Math.max(L.charsWarn, 1.25 * brand.charsMedian); L.charsError = Math.max(L.charsError, 1.6 * brand.charsMedian); }
  return L;
}

// ------------------------------------------------------------------ DOM text
// runs in the page: seek like crew.mjs strip / lib/textfit.mjs, then measure every visible text line and object
const PAGE_JS = `<script>(function(){
var CFG=window.__fgCfg;
window.__fgSeek=function(T){var L=window.__timelines||{};
  if(window.__specimen&&window.__specimen.tl){try{window.__specimen.tl.pause();window.__specimen.tl.seek(T,false);}catch(e){}}
  Object.keys(L).forEach(function(k){try{L[k].pause();L[k].seek(T,false);}catch(e){}});
  document.querySelectorAll('[data-start][data-duration]').forEach(function(el){if(el.hasAttribute('data-composition-id'))return;var s=parseFloat(el.getAttribute('data-start')),d=parseFloat(el.getAttribute('data-duration'));if(isFinite(s)&&isFinite(d))el.style.visibility=(T>=s&&T<s+d)?'':'hidden';});};
function alpha(c){var m=String(c||'').match(/rgba?\\(([^)]+)\\)/);if(!m)return 1;var p=m[1].split(/[ ,\\/]+/).filter(Boolean);return p.length>=4?parseFloat(p[3]):1;}
function chain(el){var op=1,clips=[],a=el,blur=0;
  while(a&&a.nodeType===1){var s=getComputedStyle(a);if(s.display==='none'||(s.visibility==='hidden'&&a===el))return null;op*=parseFloat(s.opacity);
    var fm=String(s.filter||'').match(/blur\\(([\\d.]+)px\\)/);if(fm)blur=Math.max(blur,parseFloat(fm[1]));
    if(a!==document.documentElement&&a!==document.body){var bx=a.getBoundingClientRect();
      if(s.overflowX!=='visible'||s.overflowY!=='visible'||s.contain==='paint')clips.push({left:bx.left,right:bx.right,top:bx.top,bottom:bx.bottom});}
    a=a.parentElement;}
  return {op:op,clips:clips,blur:blur};}
function clip(r,clips){var v={left:r.left,right:r.right,top:r.top,bottom:r.bottom};
  clips.forEach(function(c){v.left=Math.max(v.left,c.left);v.right=Math.min(v.right,c.right);v.top=Math.max(v.top,c.top);v.bottom=Math.min(v.bottom,c.bottom);});
  v.left=Math.max(v.left,0);v.top=Math.max(v.top,0);v.right=Math.min(v.right,CFG.W);v.bottom=Math.min(v.bottom,CFG.H);return v;}
window.__fgMeasure=function(){
  var W=CFG.W,H=CFG.H,minPx=H*CFG.minPct/100,chars=0,lines=0,big=0,bigText='',els=[],walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT),n;
  while((n=walker.nextNode())){
    var txt=String(n.nodeValue||'').replace(/\\s+/g,' ').trim();if(!txt)continue;
    var el=n.parentElement;if(!el||/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|TITLE)$/.test(el.tagName)||el.closest('template'))continue;
    if(el.closest('[aria-hidden="true"],[data-rc-copy]'))continue;
    var cs=getComputedStyle(el),fill=cs.webkitTextFillColor||cs.color;
    if(alpha(fill)<0.05&&!/text/.test(cs.webkitBackgroundClip||cs.backgroundClip||''))continue;
    var ch=chain(el);if(!ch||!(ch.op>=CFG.minOp))continue;
    var rg=document.createRange();rg.selectNodeContents(n);var rects=rg.getClientRects(),seen={},total=0,ok=0,nb=null;
    for(var i=0;i<rects.length;i++){var r=rects[i];if(!(r.width>1&&r.height>1))continue;var key=Math.round(r.left)+','+Math.round(r.top)+','+Math.round(r.width);if(seen[key])continue;seen[key]=1;total++;
      var v=clip(r,ch.clips),vw=v.right-v.left,vh=v.bottom-v.top;if(!(vw>1&&vh>1))continue;
      if(vw*vh<0.5*r.width*r.height)continue;
      var ink=r.height*CFG.ink;if(ink<minPx)continue;if(ink>big){big=ink;bigText=txt.slice(0,40);}
      if(ch.blur>=CFG.blurPx)continue;ok++;lines++;
      nb=nb?{l:Math.min(nb.l,v.left),t:Math.min(nb.t,v.top),r:Math.max(nb.r,v.right),b:Math.max(nb.b,v.bottom),s:Math.max(nb.s,ink)}:{l:v.left,t:v.top,r:v.right,b:v.bottom,s:ink};}
    if(total&&ok)chars+=txt.replace(/\\s/g,'').length*ok/total;
    if(nb){var q=el,bk=el;while(q&&q!==document.body){var dd=getComputedStyle(q).display;if(dd!=='inline'&&dd!=='contents'){bk=q;break;}q=q.parentElement;}
      var ex=null;for(var e2=0;e2<els.length;e2++)if(els[e2].k===bk)ex=els[e2];
      if(ex){ex.l=Math.min(ex.l,nb.l);ex.t=Math.min(ex.t,nb.t);ex.r=Math.max(ex.r,nb.r);ex.b=Math.max(ex.b,nb.b);ex.s=Math.max(ex.s,nb.s);}else{nb.k=bk;nb.text=1;els.push(nb);}}}
  var obj=0,objs=document.querySelectorAll('img,canvas,video,svg,picture');
  for(var j=0;j<objs.length;j++){var o=objs[j];if(o.closest('template')||(o.tagName!=='svg'&&o.parentElement&&o.parentElement.closest('svg')))continue;if(o.tagName==='svg'&&o.parentElement&&o.parentElement.closest('svg'))continue;
    var c2=chain(o);if(!c2||!(c2.op>=CFG.minOp))continue;var b=o.getBoundingClientRect();if(!(b.width>1&&b.height>1))continue;var vv=clip(b,c2.clips),w2=vv.right-vv.left,h2=vv.bottom-vv.top;if(!(w2>1&&h2>1))continue;
    if(w2>=0.9*W&&h2>=0.9*H)continue;if(h2>obj)obj=h2;els.push({l:vv.left,t:vv.top,r:vv.right,b:vv.bottom,s:0});}
  return {chars:Math.round(chars),lines:lines,bigPct:100*big/H,bigText:bigText,objPct:100*obj/H,heroes:window.__fgHeroes(els,W,H)};};
// the two largest elements by area (% of the frame): stacked text blocks of one size are one headline; an element inside a larger one is part of it
window.__fgHeroes=function(els,W,H){var a=els.map(function(e){return {l:e.l,t:e.t,r:e.r,b:e.b,s:e.s,text:!!e.text};}),m=true,i,j;
  while(m){m=false;for(i=0;i<a.length&&!m;i++)for(j=i+1;j<a.length&&!m;j++){var x=a[i],y=a[j];if(!x.text||!y.text||!x.s||!y.s)continue;
    var rs=Math.max(x.s,y.s)/Math.min(x.s,y.s),ov=Math.min(x.r,y.r)-Math.max(x.l,y.l),gap=Math.max(x.t,y.t)-Math.min(x.b,y.b);
    if(rs<1.15&&ov>0&&gap<0.8*Math.max(x.s,y.s)){x.l=Math.min(x.l,y.l);x.t=Math.min(x.t,y.t);x.r=Math.max(x.r,y.r);x.b=Math.max(x.b,y.b);a.splice(j,1);m=true;}}}
  var ar=function(e){return Math.max(0,e.r-e.l)*Math.max(0,e.b-e.t);};
  a=a.filter(function(e){var ea=ar(e);return !a.some(function(o){if(o===e||ar(o)<=ea)return false;var iw=Math.min(e.r,o.r)-Math.max(e.l,o.l),ih=Math.min(e.b,o.b)-Math.max(e.t,o.t);return iw>0&&ih>0&&iw*ih>=0.7*ea;});});
  return a.map(function(e){return 100*ar(e)/(W*H);}).sort(function(p,q){return q-p;}).slice(0,2);};
window.__fgRun=function(times){return times.map(function(T){if(T!==null)window.__fgSeek(T);var m=window.__fgMeasure();m.T=T;return m;});};
})();</script>`;

function pageFor(file, root, baseUrl, W, H) {
  let html = fs.readFileSync(file, "utf8");
  const isFilm = /<template/i.test(html);
  html = html.replace(/<template[^>]*>/gi, "").replace(/<\/template>/gi, "");
  html = html.replace(/<script[^>]+src=["'][^"']*gsap(?:\.min)?\.js["'][^>]*><\/script>/gi, `<script src="/__rasanai/gsap.min.js"></script>`);
  const gsapTag = /gsap(\.min)?\.js/.test(html) ? "" : `<script src="/__rasanai/gsap.min.js"></script>`;
  const cfg = { W, H, minPct: GATE.min_line_pct, minOp: GATE.min_opacity, ink: GATE.ink, blurPx: GATE.unreadable_blur };
  const rel = path.relative(root, path.dirname(file)).split(path.sep).join("/");
  const head = `<base href="${baseUrl}/${rel ? rel + "/" : ""}">${gsapTag}<script>window.__timelines=window.__timelines||{};window.__fgCfg=${JSON.stringify(cfg)};</script><style>html,body{margin:0;padding:0;background:#000;overflow:hidden}</style>`;
  html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + head) : head + html;
  html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, PAGE_JS + "</body>") : html + PAGE_JS;
  const tmp = path.join(path.dirname(file), `.rasanai-framegate-${process.pid}-${Math.random().toString(36).slice(2, 8)}.html`);
  fs.writeFileSync(tmp, html);
  return { tmp, isFilm };
}

function haveChrome() {
  const realExit = process.exit;
  process.exit = () => { throw new Error("no Chrome found (npx hyperframes browser ensure, or set RASANAI_CHROME)"); };
  try { chromePath(); return null; } catch (e) { return e.message; } finally { process.exit = realExit; }
}

// DOM text metrics of a project at the film times `times` -> [{chars, lines, bigPct, objPct, bigText}] aligned to times
export async function domTextProject(project, times) {
  const root = path.resolve(project), out = { rows: null, could_not_run: [] };
  const pages = pagesOf(root);
  if (!pages.length) { out.could_not_run.push(`${project}: no compositions with a duration (index.html, compositions/)`); return out; }
  const noChrome = haveChrome();
  if (noChrome) { out.could_not_run.push(`DOM metrics: ${noChrome}`); return out; }
  const { W, H } = sizeOf(root);
  const rows = times.map(() => ({ chars: 0, lines: 0, bigPct: 0, objPct: 0, bigText: "", heroes: [] }));
  let b, srv; const tmps = [];
  try {
    srv = await serve(root);
    b = await launch({ width: W, height: H, timeoutMs: 120000 });
    for (const pg of pages) {
      const { tmp } = pageFor(pg.file, root, srv.url, W, H);
      tmps.push(tmp);
      try {
        await b.open(`${srv.url}/${path.relative(root, tmp).split(path.sep).join("/")}`, { waitMs: 30000 });
        await b.eval("document.fonts && document.fonts.ready ? document.fonts.ready.then(function(){return true;}) : true", { await: true });
        const idx = [];
        times.forEach((t, i) => { if (t >= pg.start - 1e-6 && t < pg.end - 1e-6) idx.push(i); });
        for (let k = 0; k < idx.length; k += 100) {
          const part = idx.slice(k, k + 100);
          const res = await b.eval(`window.__fgRun(${JSON.stringify(part.map((i) => Math.round((times[i] - pg.start) * 1000) / 1000))})`);
          res.forEach((m, j) => {
            const row = rows[part[j]];
            row.chars += m.chars; row.lines += m.lines; row.objPct = Math.max(row.objPct, m.objPct);
            row.heroes = row.heroes.concat(m.heroes || []).sort((a, b) => b - a).slice(0, 2);
            if (m.bigPct > row.bigPct) { row.bigPct = m.bigPct; row.bigText = m.bigText; }
          });
        }
      } catch (e) { out.could_not_run.push(`DOM metrics: ${path.relative(root, pg.file)}: ${e.message}`); }
    }
    out.rows = rows;
  } catch (e) { out.could_not_run.push(`DOM metrics: ${e.message}`); }
  finally {
    if (b) await b.close();
    if (srv) await srv.close();
    for (const t of tmps) fs.rmSync(t, { force: true });
  }
  return out;
}

// DOM text metrics of standalone boards (one html per still, not seeked) -> [row | null] aligned to files
export async function domTextBoards(files, size = { width: 1920, height: 1080 }) {
  const out = { rows: files.map(() => null), could_not_run: [] };
  const have = files.map((f, i) => (f && fs.existsSync(f) ? i : -1)).filter((i) => i >= 0);
  if (!have.length) return out;
  const noChrome = haveChrome();
  if (noChrome) { out.could_not_run.push(`DOM metrics: ${noChrome}`); return out; }
  const root = path.dirname(path.resolve(files[have[0]]));
  let b, srv; const tmps = [];
  try {
    srv = await serve(root);
    b = await launch({ width: size.width, height: size.height, timeoutMs: 120000 });
    for (const i of have) {
      const f = path.resolve(files[i]);
      if (path.dirname(f) !== root) { out.could_not_run.push(`DOM metrics: ${f} is not beside the others`); continue; }
      const { tmp } = pageFor(f, root, srv.url, size.width, size.height);
      tmps.push(tmp);
      try {
        await b.open(`${srv.url}/${path.basename(tmp)}`, { waitMs: 30000 });
        await b.eval("document.fonts && document.fonts.ready ? document.fonts.ready.then(function(){return true;}) : true", { await: true });
        const m = (await b.eval("window.__fgRun([null])"))[0];
        out.rows[i] = { chars: m.chars, lines: m.lines, bigPct: m.bigPct, objPct: m.objPct, bigText: m.bigText, heroes: m.heroes || [] };
      } catch (e) { out.could_not_run.push(`DOM metrics: ${path.basename(f)}: ${e.message}`); }
    }
  } catch (e) { out.could_not_run.push(`DOM metrics: ${e.message}`); }
  finally {
    if (b) await b.close();
    if (srv) await srv.close();
    for (const t of tmps) fs.rmSync(t, { force: true });
  }
  return out;
}

// ------------------------------------------------------------------ the measurement
const listStills = (spec) => {
  const out = [];
  for (const part of String(spec).split(",").map((s) => s.trim()).filter(Boolean)) {
    const p = path.resolve(part);
    if (!fs.existsSync(p)) continue;
    if (fs.statSync(p).isDirectory()) out.push(...fs.readdirSync(p).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).sort().map((f) => path.join(p, f)));
    else out.push(p);
  }
  return out;
};

const slim = (m) => ({ groundRange: r1(m.groundRange), groundChroma: r2(m.groundChroma), emptyShare: r2(m.emptyShare), soft: r3(m.soft), colourful: r1(m.colourful), sat: r1(m.sat) });

// opts: { stills | video, html (dir of boards), project, brandFilm, fps, kind, density, plan, stillness, quiet }
// -> { ok, verdict, kind, dur, frames[], film{}, limits, findings[], skipped[], could_not_run[] }
export async function measureFrames(opts = {}) {
  const res = { ok: false, verdict: "could not run", kind: null, dur: null, frames: [], film: null, limits: null, findings: [], skipped: [], could_not_run: [] };
  if (!ffmpegOk()) { res.could_not_run.push("ffmpeg is not installed (brew install ffmpeg)"); return res; }
  const feats = []; // per-frame pixel features, kept for the cut / composition pass
  let names = [], times = [], stillFiles = [], stillSize;
  try {
    if (opts.video) {
      if (!fs.existsSync(opts.video)) { res.could_not_run.push(`${opts.video} does not exist`); return res; }
      res.kind = "video";
      const fps = Number(opts.fps) || 4;
      const d = await decodeVideo(path.resolve(opts.video), { fps, onFrame: (im) => { const m = frameMetrics(im); feats.push({ t: im.t, ...m, bold: boldFrame(im) }); } });
      res.dur = d.src.duration || feats.length / fps;
      times = feats.map((f) => f.t);
    } else if (opts.stills) {
      stillFiles = listStills(opts.stills);
      if (!stillFiles.length) { res.could_not_run.push(`no PNG/JPG stills in ${opts.stills}`); return res; }
      res.kind = "stills";
      stillFiles.forEach((f, i) => { const im = decodeStill(f); if (!i) stillSize = { width: im.src.width, height: im.src.height }; feats.push({ t: i, ...frameMetrics(im) }); names.push(path.basename(f)); });
      times = stillFiles.map((_, i) => i);
    } else { res.could_not_run.push("give --stills <dir|png,png> or --video <mp4>"); return res; }
  } catch (e) { res.could_not_run.push(e.message); return res; }
  if (!feats.length) { res.could_not_run.push("no frames could be decoded"); return res; }

  // DOM text
  let text = null;
  if (opts.project) {
    if (res.kind === "video") {
      const dom = await domTextProject(opts.project, times);
      res.could_not_run.push(...dom.could_not_run);
      text = dom.rows;
    } else res.skipped.push("DOM metrics: --project reads a film's timeline; for stills use --html <dir of the boards>");
  } else if (res.kind === "stills") {
    const htmlDir = opts.html && opts.html !== true ? path.resolve(opts.html) : null;
    const files = stillFiles.map((f) => { const base = path.basename(f).replace(/\.[^.]+$/, ".html"); const p = path.join(htmlDir || path.dirname(f), base); return fs.existsSync(p) ? p : null; });
    if (files.some(Boolean)) {
      const dom = await domTextBoards(files, stillSize);
      res.could_not_run.push(...dom.could_not_run);
      text = dom.rows.some(Boolean) ? dom.rows : null;
    }
  }

  // per-frame rows
  res.frames = feats.map((f, i) => ({ ...(res.kind === "stills" ? { name: names[i] } : { t: r2(f.t) }), ...slim(f), ...(text && text[i] ? { chars: text[i].chars, lines: text[i].lines, bigPct: r1(text[i].bigPct), objPct: r1(text[i].objPct), bigText: text[i].bigText } : {}) }));

  // film metrics
  const film = { frames: feats.length };
  let shotFrames = [];
  const flagsOf = (f, t) => {
    const fl = [];
    if (f.groundChroma != null && f.groundChroma < GATE.ground_chroma && f.groundRange != null && f.groundRange < GATE.ground_range) fl.push("flat-ground");
    if (f.soft < 0.03) fl.push("all-sharp");
    if (t) { if (t.chars > GATE.chars_error) fl.push("crowded"); if (t.bigPct < GATE.giant_h) fl.push("no-giant"); }
    return fl;
  };
  res.frames.forEach((row, i) => { row.flags = flagsOf(feats[i], text && text[i]); });
  film.groundRange = r1(median(nums(feats.map((f) => f.groundRange))));
  film.groundChroma = r2(median(nums(feats.map((f) => f.groundChroma))));
  film.emptyShare = r2(median(feats.map((f) => f.emptyShare)));
  film.softP90 = r3(pct(feats.map((f) => f.soft), 90));
  film.colourfulP90 = r1(pct(feats.map((f) => f.colourful), 90));
  film.satMedian = r1(median(feats.map((f) => f.sat)));
  if (res.kind === "video") {
    const cc = cutsAndCompositions(feats, res.dur);
    film.durS = r1(res.dur);
    film.hardCuts = cc.cuts.length - 1;
    film.aslS = r2(res.dur / cc.cuts.length);
    film.compositionsPer10s = r1(10 * cc.compositions / res.dur);
    // a shot has a blurred plane when its p90 soft share reaches the line
    const inShot = (t, s) => t >= s[0] - 1e-6 && t < s[1] - 1e-6;
    film._shots = cc.shots.map((s) => Math.max(...feats.filter((f) => inShot(f.t, s)).map((f) => f.soft))).filter(Number.isFinite);
    film.shots = film._shots.length;
    shotFrames = cc.shots.map((s) => feats.filter((f) => inShot(f.t, s)));
  } else { film._shots = feats.map((f) => f.soft); shotFrames = feats.map((f) => [f]); } // a still is its own shot
  // flat swatch grounds (slop N4): a shot is a swatch when most of its frames are flat on 9 points; the film counts the
  // distinct swatch colours (Lab distance of 8 or more apart)
  {
    const grounds = [];
    let flatShots = 0;
    for (const fr of shotFrames) {
      const flat = fr.filter((f) => f.swatch && f.swatch.flat);
      if (!fr.length || flat.length < 0.6 * fr.length) continue;
      flatShots++;
      const m = [0, 1, 2].map((k) => median(flat.map((f) => f.swatch.rgb[k])));
      const lab = rgbToLab(m[0], m[1], m[2]);
      if (!grounds.some((g) => Math.hypot(g[0] - lab[0], g[1] - lab[1], g[2] - lab[2]) < GATE.swatch_de)) grounds.push(lab);
    }
    film.flatShots = flatShots;
    film.swatchGrounds = grounds.length;
    film.swatchShots = shotFrames.length;
  }
  film.softShotsShare = r2(film._shots.filter((v) => v >= GATE.soft_share).length / Math.max(1, film._shots.length));
  if (text) {
    const rows = text.filter(Boolean), big = rows.map((r) => r.bigPct), withText = big.filter((v) => v > 0);
    film.textFrames = rows.length;
    film.charsMedian = r1(median(rows.map((r) => r.chars)));
    film.linesMedian = r1(median(rows.map((r) => r.lines)));
    film.biggestMedian = r1(median(withText));
    film.biggestP90 = r1(pct(withText, 90));
    film.biggestP10 = r1(pct(withText, 10));
    film.biggestRatio = withText.length ? r1(pct(withText, 90) / Math.max(0.5, pct(withText, 10))) : null;
    film.biggestMax = r1(Math.max(0, ...big));
    film.competingShare = r2(rows.filter((r) => (r.heroes || []).length >= 2 && r.heroes[1] >= GATE.hero_min_pct && r.heroes[0] / r.heroes[1] <= GATE.hero_ratio).length / rows.length);
    film.share10 = r2(big.filter((v) => v >= 10).length / rows.length);
    film.share20 = r2(big.filter((v) => v >= GATE.giant_h).length / rows.length);
    film.peak35 = big.some((v) => v >= GATE.peak_h);
    const objs = rows.map((r) => r.objPct).filter((v) => v >= GATE.min_object_pct); // icons are not heroes
    film.objectRatio = objs.length > 2 ? r1(pct(objs, 90) / Math.max(1, pct(objs, 10))) : null;
    film.objectMax = r1(Math.max(0, ...rows.map((r) => r.objPct)));
  }
  const shotsRaw = film._shots; delete film._shots; film.softShots = shotsRaw.length;
  if (res.kind === "video") {
    const b = boldnessOf(feats.map((f) => ({ t: f.t, ...f.bold })), res.dur, text ? text.map((r) => !!r && r.bigPct >= GATE.giant_h) : null);
    film.boldness = b;
  }
  res.film = film;

  // brand film
  const brand = opts.brandFilm ? await brandMetrics(opts.brandFilm) : null;
  if (brand && brand.error) res.skipped.push(brand.error);
  res.brand = brand && !brand.error ? brand : null;
  const L = limitsFor(brand);
  { const lt = gateValue("frame.text_load_max", null); if (lt != null) { L.charsError = Math.min(L.charsError, lt); L.charsWarn = Math.min(L.charsWarn, lt); L.notes.push(...gateNotes(["frame.text_load_max"])); } }
  res.limits = { groundChroma: r2(L.groundChroma), groundRange: r1(L.groundRange), softP90: r3(L.softP90), colourfulP90: r1(L.colourfulP90), charsWarn: r1(L.charsWarn), charsError: r1(L.charsError), flat: L.flat, neverBlurs: L.neverBlurs, notes: L.notes };

  // findings
  const F = res.findings;
  const add = (severity, check, message, fix, extra = {}) => F.push({ severity, check, message, fix, ...extra });
  const dur = res.dur;
  const typeSev = L.flat ? "error" : "warning"; // a flat ground puts the whole load on type and object scale
  const seeCraft = "references/craft.md Frame metrics";

  // ground (R10)
  if (film.groundChroma == null) res.skipped.push("ground: no empty area in any frame (nothing to measure)");
  else if (!L.flat) {
    if (film.groundChroma < L.groundChroma) add("error", "ground-chroma", `empty ground chroma ${film.groundChroma} (needs >= ${r2(L.groundChroma)}): the ground is neutral grey/white/black, not a colour`, `tint the ground with the brand's hue (a few % chroma: a key-lit gradient, not a flat fill) and give it a falloff; ${seeCraft}`, { value: film.groundChroma, limit: r2(L.groundChroma) });
    if (film.groundRange < L.groundRange) add("error", "ground-range", `ground L* range ${film.groundRange} (needs >= ${r1(L.groundRange)}): no light falloff across the empty area`, `add a lit ground: a radial or linear gradient 4 to 12 L* between the lit and the dark side, plus vignette and grain; ${seeCraft}`, { value: film.groundRange, limit: r1(L.groundRange) });
  } else if (film.groundChroma >= GATE.flat_chroma || film.groundRange >= GATE.flat_range) {
    // the brand film is flat but this film is not flat: fine, nothing to flag
  } else if (!text) {
    add("warning", "flat-ground-unproven", `flat ground (chroma ${film.groundChroma}, L* range ${film.groundRange}) is allowed by the brand film, but without DOM text the type-scale rules that must carry it were not measured`, `run again with --project <videos/name> (a film) or --html <boards dir> (stills)`);
  }

  // flat swatch grounds: a colour per scene is a deck. Adapted from motionmaxxing (Apache-2.0, Tejas Makwana), references/slop.md N4.
  // A warning above 3 distinct flat grounds (the lead: a colour change can be a deliberate flood), an error from 6 (every scene
  // its own plateau). Waived when the brand film measures a flat ground itself, as the ground rules above are.
  if (film.swatchShots >= 4) {
    if (L.flat) res.skipped.push(`flat swatch grounds: waived, the brand film's ground is flat (${film.swatchGrounds} distinct flat grounds measured)`);
    else if (film.swatchGrounds > GATE.swatch_grounds) add(film.swatchGrounds >= GATE.swatch_error ? "error" : "warning", "flat-swatch-grounds", `${film.swatchGrounds} distinct flat grounds in ${film.swatchShots} shots (${film.flatShots} shots are a plain colour on 9 sampled points; more than ${GATE.swatch_grounds} reads as a deck of colour plateaus)`, `give the scenes a surface from the capture (a plate, product screen, material or lit ground) instead of a flat colour per scene; keep a flat colour only for a flood or dive under 1 s, or measure the brand film (--brand-film) if its own films are flat; references/craft.md Frame metrics`, { value: film.swatchGrounds, limit: GATE.swatch_grounds });
  }

  // soft content (R9)
  if (L.neverBlurs) res.skipped.push("soft content: the brand film never blurs");
  else if (film.softP90 >= L.softP90 || film.softShotsShare >= GATE.soft_shots) { /* depth: a blurred plane in enough of the film */ }
  else if (film.softP90 < GATE.never_blurs && film.softShotsShare === 0) add(L.flat ? "warning" : "error", "soft-content", `nothing is ever soft (soft share p90 ${film.softP90}, no shot above ${GATE.soft_share}): every plane is equally sharp, so there is no depth`, `put the hero on a sharp plane and a blurred copy of the background or a giant defocused word behind it (blur 12 to 30 px on the far layer, a rack focus once); ${seeCraft}`, { value: film.softP90, limit: r2(L.softP90) });
  else add("warning", "soft-content", `soft share p90 ${film.softP90} (needs >= ${r2(L.softP90)}) and ${Math.round(film.softShotsShare * 100)}% of shots have a blurred plane (needs >= ${Math.round(GATE.soft_shots * 100)}%)`, `blur the far plane in more shots (two depth planes by blur, scale or contrast); ${seeCraft}`, { value: film.softP90, limit: r2(L.softP90) });

  // colour (R12)
  if (film.colourfulP90 < L.colourfulP90) add("warning", "colourfulness", `colourfulness p90 ${film.colourfulP90} (needs >= ${r1(L.colourfulP90)}); median saturation ${film.satMedian}%: the film has no colour content`, `bring real colour in: art, a photo or icon set at 10% of the frame or more, the brand's accent as light or as a field; ${seeCraft}`, { value: film.colourfulP90, limit: r1(L.colourfulP90) });

  // cut rhythm (R17)
  if (res.kind === "video" && dur >= GATE.asl_min_dur && film.aslS > GATE.asl_s && film.compositionsPer10s < GATE.comp_rate && !/^(brand|explainer)/i.test(opts.kind || "")) add("warning", "cut-rhythm", `average hard-cut shot ${film.aslS} s and ${film.compositionsPer10s} composition changes per 10 s (a launch film cuts at ${GATE.asl_s} s or less, or keeps changing composition inside its long shots: ${GATE.comp_rate} per 10 s; ${film.hardCuts} hard cuts in ${r1(dur)} s)`, `cut to a contrasting ground or size at least every 4 s, or make the in-frame transformations clear changes of composition; ${seeCraft}`, { value: film.aslS, limit: GATE.asl_s });

  // boldness: enough big moments (a giant glyph, a frame-filling mass, a colour field) for a film of 15 s or more
  const bd = film.boldness;
  if (res.kind !== "video") res.skipped.push("boldness: measured on a film (--video), not on stills");
  else if (dur < GATE.bold_min_dur) res.skipped.push(`boldness: the film is ${r1(dur)} s (measured from ${GATE.bold_min_dur} s)`);
  else if (bd.bigShare < GATE.bold_share) {
    let stillness = opts.stillness == null ? null : !!opts.stillness;
    if (stillness == null) {
      const plan = opts.plan ? readJ(path.resolve(opts.plan)) : null;
      let md = ""; try { md = opts.project ? fs.readFileSync(path.join(path.resolve(opts.project), "motion.md"), "utf8") : ""; } catch {}
      stillness = !!(plan && (plan.stillness === true || /^(stillness|editorial)$/i.test(plan.motion_style || ""))) || /^stillness:\s*true\b/m.test(md);
    }
    const pc = (v) => `${Math.round((v || 0) * 100)}%`;
    add(stillness ? "warning" : "error", "boldness", `big moments on ${pc(bd.bigShare)} of the frames (needs >= ${pc(GATE.bold_share)}; the references 29 to 89%): giant glyph ${pc(bd.glyphShare)}, frame-filling object ${pc(bd.objShare)}, colour field ${pc(bd.fieldShare)}${bd.domShare != null ? `, DOM line >= ${GATE.giant_h}% H ${pc(bd.domShare)}` : ""}; ${bd.grounds} ground${bd.grounds === 1 ? "" : "s"}; the longest stretch without one is ${bd.gap[0]}-${bd.gap[1]} s${stillness ? " (a declared stillness style: a warning)" : ""}: the film stays at one scale`, `make about one beat in four big: the payoff word or number at 20 to 40% H (cropped is fine), a push-in until the object fills 40% of the frame, or a cut to a full-frame field of the brand colour; the big one belongs in ${bd.gap[0]}-${bd.gap[1]} s; references/craft.md Boldness`, { value: bd.bigShare, limit: GATE.bold_share, gap: bd.gap });
  }

  // DOM text
  if (!text) res.skipped.push(res.kind === "video" ? "DOM checks not run (text-load, competing-heroes, scale-contrast, giant-moment, no-peak-moment): give --project <videos/name>" : "DOM checks not run (text-load, competing-heroes, scale-contrast, giant-moment, no-peak-moment): give --html <dir of the boards> next to --stills");
  else {
    const dense = !!opts.density;
    if (film.charsMedian > L.charsError && !dense) add("error", "text-load", `median ${film.charsMedian} characters on screen (error above ${r1(L.charsError)}; the references carry 12 to 60): the picture is a screenful of UI and copy, not a hero`, `one component, 3 to 6x scale, 1 to 2 lines of real labels, at most ~30 characters outside one declared density shot; crop the rest (R4)`, { value: film.charsMedian, limit: r1(L.charsError) });
    else if (film.charsMedian > L.charsWarn && !dense) add(typeSev, "text-load", `median ${film.charsMedian} characters on screen (needs <= ${r1(L.charsWarn)})`, `cut to the one line and the one component that carry the beat (R4)`, { value: film.charsMedian, limit: r1(L.charsWarn) });
    if (film.competingShare > GATE.hero_share) add("warning", "competing-heroes", `in ${Math.round(film.competingShare * 100)}% of frames the two largest elements are both large (each >= ${GATE.hero_min_pct}% of the frame area) and within ${GATE.hero_ratio}x of each other (needs <= ${Math.round(GATE.hero_share * 100)}%): there is no single hero`, `make one element the hero (2x the area of the next, or the next small): fade, shrink or move the rival off the frame, or let it enter after the hero has landed; ${seeCraft}`, { value: film.competingShare, limit: GATE.hero_share });
    const objOk = film.objectRatio != null && film.objectRatio >= GATE.scale_ratio;
    if (film.biggestRatio != null && film.biggestRatio < GATE.scale_ratio && !objOk) add(typeSev, "scale-contrast", `the biggest line varies only ${film.biggestRatio}x across the film (p90 ${film.biggestP90}% / p10 ${film.biggestP10}% of the frame height; needs >= ${GATE.scale_ratio}x), and the objects do not carry it (${film.objectRatio == null ? "none measured" : film.objectRatio + "x"})`, `give one moment a giant word or object (20 to 40% H) and one a tiny label: scale contrast is the cheapest look there is (R5)`, { value: film.biggestRatio, limit: GATE.scale_ratio });
    if (film.share20 < GATE.giant_share) add(film.share20 === 0 && (L.flat || (res.kind === "video" && dur >= 20)) ? "error" : "warning", "giant-moment", `${Math.round(film.share20 * 100)}% of frames carry a line of ${GATE.giant_h}% H or more (needs >= ${Math.round(GATE.giant_share * 100)}%); the biggest line is ${film.biggestMax}% H`, `set the hero line or word at 20 to 40% of the frame height in at least one beat in ten, cropped or touching the UI (R5, R19)`, { value: film.share20, limit: GATE.giant_share });
    else if (!film.peak35) add("warning", "no-peak-moment", `no moment reaches ${GATE.peak_h}% H (the biggest is ${film.biggestMax}% H)`, `one moment of the film at 35% H or more: the payoff word, the number, the full stop (R5)`, { value: film.biggestMax, limit: GATE.peak_h });
  }

  const errors = F.filter((f) => f.severity === "error").length, warns = F.length - errors;
  res.ok = errors === 0;
  res.verdict = errors ? `${errors} error${errors === 1 ? "" : "s"}${warns ? `, ${warns} warning${warns === 1 ? "" : "s"}` : ""}` : warns ? `clean, ${warns} warning${warns === 1 ? "" : "s"}` : "clean";
  if (res.could_not_run.length && !errors) res.ok = false;
  return res;
}

// ------------------------------------------------------------------ CLI
function printable(res) {
  const f = res.film, out = [];
  out.push(`frame gate: ${res.verdict}${res.kind === "video" ? ` · ${f.durS} s, ${f.frames} frames sampled` : ` · ${f.frames} stills`}`);
  const row = (k, v, u = "") => v == null ? "" : `${k} ${v}${u}`;
  out.push("  pixels  " + [row("ground chroma", f.groundChroma), row("ground L* range", f.groundRange), row("empty", Math.round(f.emptyShare * 100), "%"), row("soft p90", f.softP90), row("soft shots", Math.round(f.softShotsShare * 100), "%"), row("colourful p90", f.colourfulP90), row("sat", f.satMedian, "%"), row("flat grounds", f.swatchGrounds)].filter(Boolean).join(" · "));
  if (f.boldness) { const b = f.boldness, pc = (v) => `${Math.round(v * 100)}%`; out.push("  bold    " + [row("big moments", pc(b.bigShare)), row("glyph", pc(b.glyphShare)), row("object", pc(b.objShare)), row("field", pc(b.fieldShare)), b.domShare != null ? row("DOM line", pc(b.domShare)) : "", row("grounds", b.grounds), row("beats", b.beats), row("longest without", `${b.gap[0]}-${b.gap[1]}`, " s")].filter(Boolean).join(" · ")); }
  if (res.kind === "video") out.push("  cuts    " + [row("hard cuts", f.hardCuts), row("ASL", f.aslS, " s"), row("compositions/10 s", f.compositionsPer10s)].filter(Boolean).join(" · "));
  if (f.charsMedian != null) out.push("  text    " + [row("competing heroes", f.competingShare == null ? null : Math.round(f.competingShare * 100), "% of frames"), row("chars", f.charsMedian), row("lines", f.linesMedian), row("biggest p90", f.biggestP90, "% H"), row("p90/p10", f.biggestRatio), row("max", f.biggestMax, "% H"), row("frames >= 20% H", Math.round(f.share20 * 100), "%"), row("object p90/p10", f.objectRatio)].filter(Boolean).join(" · "));
  if (res.limits.notes.length) for (const n of res.limits.notes) out.push(`  note    ${n}`);
  for (const x of res.findings) out.push(`  ${x.severity === "error" ? "FAIL" : "warn"} ${x.check}: ${x.message}\n       fix: ${x.fix}`);
  for (const s of res.skipped) out.push(`  skip ${s}`);
  for (const c of res.could_not_run) out.push(`  could not run: ${c}`);
  return out.join("\n");
}

async function main() {
  const args = parseArgs();
  const str = (v) => (v == null || v === true ? null : String(v));
  if (!args.stills && !args.video) {
    process.stderr.write("usage: node frame-gate.mjs (--stills <dir|a.png,b.png> [--html <boards dir>] | --video <film.mp4>) [--project <dir>] [--brand-film <grammar.json|film.mp4>] [--write-brand <grammar.json>] [--kind launch] [--density] [--plan <score.json>] [--stillness] [--json]\n");
    process.exit(1);
  }
  const res = await measureFrames({ stills: str(args.stills), video: str(args.video), html: args.html, project: str(args.project), brandFilm: str(args["brand-film"]), fps: Number(args.fps) || 4, kind: str(args.kind), density: !!args.density, plan: str(args.plan), stillness: args.stillness ? true : null });
  if (args["write-brand"] && res.film) {
    const p = path.resolve(String(args["write-brand"])), g = readJ(p) || {};
    g.frameMetrics = { groundChroma: res.film.groundChroma, groundRange: res.film.groundRange, softP90: res.film.softP90, colourfulP90: res.film.colourfulP90, charsMedian: res.film.charsMedian ?? null, measuredFrom: str(args.video) || str(args.stills) };
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(g, null, 2));
  }
  for (const c of res.could_not_run) noteDowngrade({ run: args.run, what: "the frame gate", instead: "no frame check", why: String(c).slice(0, 200), impact: "this film's frames were not measured" });
  if (args.json) console.log(JSON.stringify(res, null, 2));
  else if (res.film) console.log(printable(res));
  else for (const c of res.could_not_run) console.error(`frame gate could not run: ${c}`);
  process.exit(res.findings.some((f) => f.severity === "error") ? 2 : res.could_not_run.length && !res.film ? 1 : res.could_not_run.length ? 1 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { noteDowngrade({ what: "the frame gate", instead: "no frame check", why: String(e.message).slice(0, 200), impact: "this film's frames were not measured" }); console.error(`frame gate could not run: ${e.message}`); process.exit(1); });
