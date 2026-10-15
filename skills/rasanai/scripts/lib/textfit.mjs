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
// measured beyond its mask. A clip as big as the frame (a film's #root is overflow:hidden) is the frame itself: the text's own box is
// measured against the edge, so a line running off the frame is found even inside it. A text fully outside the frame is waiting off screen and is ignored.
//   frame edge   a box that crosses the frame edge for more than 1.2 s continuously        -> text-cropped
//   safe area    a box inside the frame but outside the 6% safe margin, at rest (not moving
//                more than 1.5 px between samples) for 0.4 s or more                        -> text-cropped
//   mask clip    a readable line of 3+ words (half its words showing) in which a mask or inset about one line tall hides 12% to 60% of a word's box
//                (letters cut off: "Trv", "todav") for 0.3 s or longer, and is not leaving (a line dropping out through its
//                mask is a deliberate exit; a panel or scroll area bigger than three lines is not a mask)     -> text-cropped, region "mask"
//                (an error at rest; a warning while the line is still rising in, the hidden share falling)
// A line may leave the frame only in a deliberate push-through of 1.2 s or less (an oversize word may sweep across the frame cropped,
// as long as the same line then rests readable). An element (or a parent) marked
// data-text-fit="ignore" is skipped (a screenshot of a real UI that is meant to bleed off the frame).
// The same samples also measure LINE BLOCKS: text nodes grouped under the first non-inline ancestor (so SplitText
// word/char spans are one line). A block is readable at a sample when at least half of its words (the most it ever has,
// so a typewriter grows) are visible by the rules above and inside the frame.
//   text-too-brief  a statement-size block (font >= 3.5% of the frame height) of 3+ words whose longest continuous
//                   readable run is shorter than 0.6 s + 0.3 s per word (lib/reading.mjs readTime, the one formula) x 0.85 slack, less one sample. Judged per text
//                   STATE: a slot whose string changes (typed, deleted, swapped) is split into chains of strings that grow from one
//                   another (typing); each chain's longest string must be readable for its own reading time, so a typed-and-swapped
//                   line can fail. A shrinking string (deleting) is in flux and not counted.
//   text-overlap    two different readable blocks (neither inside the other) whose line boxes intersect by 15% of
//                   the smaller one's area or more for 0.3 s continuously (a crossfade shorter than that passes)
//   text-too-small  OFF unless a lesson sets text.statement_min_h (lessons.mjs add … --gate text.statement_min_h=0.05): a readable
//                   block of 3+ words (not skim) whose font-size is under that share of the frame height, readable for 0.4 s or more
// text.read_per_word_s (default 0.3) is read through gateValue too: a lesson can only make the reading time longer.
// The same page loads also report SCRIPT ERRORS (result.script_errors[], read by motion-gate as the error `script-error`): an uncaught error or an unloadable local script
// while the page loads, a timeline that throws when seeked, a composition whose script never registered window.__timelines[<its id>].
// WARNINGS ONLY, in result.warnings (same shape as findings; uncalibrated, never errors), measured in the same page loads:
//   low-contrast    a readable block whose text colour against the backdrop the browser really draws behind it (text made transparent, one screenshot,
//                   median WCAG contrast over the pixels under its line boxes) is under 4.5:1 (body) or 3:1 (large: 24 px, or 18.66 px bold). data-contrast="ok" opts out.
//   text-moves-before-read  (idea from awesome-opus5-5-videos; our code) a block of 3+ words, fully visible and settled (its box still for a sample), that then travels
//                   more than 2% of the frame height, or changes size by more than 5%, while its reading time (lib/reading.mjs readTime) has not yet passed and it is
//                   still readable. Entrance motion is the reveal itself and is not judged (the clock starts once every word is visible and the box has stopped);
//                   a camera push over a line being read trips it too, which is the point. data-read="skim" opts out. Uncalibrated.
//   asset-missing / asset-empty / font-failed   a file the page asked for came back 404 or empty, an image or video did not decode, a font file did not load
//   glyph-missing   a LOADED web font lacks characters the page sets in it (they fall back to another face: tofu risk)
//   media-upscaled  an image or video shown at more than 1.5x its natural size at some sampled time (data-upscale="ok" opts out)
//   rtl-direction   Arabic / Hebrew script in a direction: ltr block
//   subject-lost   (data-hero, an element id the score names as a beat's hero: opts.heroIds) the hero was inside the safe area (90% of its box or more)
//                   and then sits under 90% inside it for 0.3 s or more while it is on screen (the camera, or the hero's own move, took the subject out of
//                   shot); a hero never inside for 0.5 s of visibility; a hero larger than the safe area itself (a deliberate bleed), data-hero="bleed", and a
//                   final run that ends fully outside the frame (an exit) are not flagged. onetake's "the camera never loses the subject".
// Also collected in the same loads, for the checks other scripts make (textStates, hookOf, below): result.texts (each readable text STATE: the string, from, to,
// caption / skim / data-ui flags; a state needs 0.25 s) and result.hook ({text, visual}: the first readable line, the first big picture / data-ui / brand mark, in film seconds).
// Pure helpers over those states, used by motion-gate.mjs, voice.mjs and slop.mjs (all WARNINGS, uncalibrated):
//   seeAndSay(cues, events, texts, words)  narration cue with no on-screen event within 1.0 s; a text whose spoken word is more than 1.0 s from it
//   captionDupes(texts)                    a caption that says what another on-screen line says in the same window
//   unknownNumbers(texts, known)           a number on screen that is in no claims ledger / brief
// CJK lines count in reading-equivalent words (CJK chars / 4.5 + other chars / 15 per second against 0.3 s a word; lib/reading.mjs) so text-too-brief judges them.
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
import { readTime, READ_BASE_S, READ_PER_WORD_S, SLACK_RENDER } from "./reading.mjs";
import { decodePng } from "./png.mjs";

export const TEXT_FIT = { fps: 10, safe: 0.06, edge_s: 1.2, rest_s: 0.4, min_font_px: 20, rest_px: 1.5,
  statement: 0.035, read_base_s: READ_BASE_S, read_per_word_s: READ_PER_WORD_S, brief_min_words: 3, overlap_frac: 0.15, overlap_s: 0.3, read_slack: SLACK_RENDER, mask_hid: 0.12, mask_max: 0.6, mask_s: 0.3 };
const r2 = (x) => Math.round(x * 100) / 100;
const readText = (p) => { try { return fs.readFileSync(p, "utf8"); } catch { return ""; } };

// runs in the page: seek like crew.mjs strip, then measure
const PAGE_JS = `<script>(function(){
var CFG=window.__tfCfg;
window.__tfSeek=function(T){var L=window.__timelines||{};
  if(window.__specimen&&window.__specimen.tl){try{window.__specimen.tl.pause();window.__specimen.tl.seek(T,false);}catch(e){}}
  Object.keys(L).forEach(function(k){try{L[k].pause();L[k].seek(T,false);}catch(e){window.__tfErr.push('the timeline "'+k+'" threw when seeked to '+T+' s: '+(e&&e.message||e));}});
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
      if(s.overflowX!=='visible'||s.overflowY!=='visible'||s.contain==='paint')clips.push({left:bx.left,right:bx.right,top:bx.top,bottom:bx.bottom,fr:bx.left<=CFG.W*0.01&&bx.top<=CFG.H*0.01&&bx.right>=CFG.W*0.99&&bx.bottom>=CFG.H*0.99});
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
    // a clip as big as the frame is the frame (a film's #root is overflow:hidden): the text's own box is measured against the edge; any other clip (a mask, an inset) trims it
    var v={left:r.left,right:r.right,top:r.top,bottom:r.bottom};
    clips.forEach(function(c){if(c.fr)return;v.left=Math.max(v.left,c.left);v.right=Math.min(v.right,c.right);v.top=Math.max(v.top,c.top);v.bottom=Math.min(v.bottom,c.bottom);});
    if(!(v.right-v.left>1&&v.bottom-v.top>1))continue;
    if(v.right<=0||v.left>=W||v.bottom<=0||v.top>=H)continue;
    var e=1,kind=null,side=null;
    if(v.left<-e){kind='edge';side='left';}else if(v.right>W+e){kind='edge';side='right';}else if(v.top<-e){kind='edge';side='top';}else if(v.bottom>H+e){kind='edge';side='bottom';}
    else if(v.left<sx-e){kind='safe';side='left';}else if(v.right>W-sx+e){kind='safe';side='right';}else if(v.top<sy-e){kind='safe';side='top';}else if(v.bottom>H-sy+e){kind='safe';side='bottom';}
    if(kind)out.push({k:idx,text:txt.slice(0,80),kind:kind,side:side,l:v.left,t:v.top,r:v.right,b:v.bottom});}
  return out;};
// line blocks: text nodes grouped under the first non-inline ancestor (SplitText word/char spans are one line);
// per block the visible share of its words and its visible line boxes (same visibility rules as above)
var BID=new WeakMap(),BN=0,BE={};
var CJK=/[぀-ヿ㐀-䶿一-鿿가-힯＀-￯]/,RTLS=/[֐-ࣿיִ-﷿ﹰ-﻿]/;
function blockOf(el){var b=el;while(b.parentElement&&/^(inline|contents)/.test(getComputedStyle(b).display))b=b.parentElement;return b;}
window.__tfBlocks=function(){
  var W=CFG.W,H=CFG.H,G=[],map=new Map(),walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT),n;
  while((n=walker.nextNode())){
    var raw=String(n.nodeValue||''),el=n.parentElement;if(!raw||!el||/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|TITLE)$/.test(el.tagName))continue;
    if(el.closest('[data-text-fit="ignore"]'))continue;
    var cs=getComputedStyle(el);if(cs.display==='none')continue;
    var be=blockOf(el),g=map.get(be);if(!g){g={el:be,segs:[],rects:[],mh:0,mx:0};map.set(be,g);G.push(g);}
    var vis=false,ch=/\\S/.test(raw)?chain(el):null,fill=cs.webkitTextFillColor||cs.color;
    if(ch&&ch.op>0.5&&cs.visibility!=='hidden'&&!(alpha(fill)<0.05&&!/text/.test(cs.webkitBackgroundClip||cs.backgroundClip||''))){
      var rg=document.createRange();rg.selectNodeContents(n);var rs=rg.getClientRects();
      // glyphs hidden by a mask or an inset (a mask or inset about one line tall; a bigger clip is a panel or a scroll area, not a line mask): the share of the text's own box a clip removes (a word under 60% visible is waiting or gone, not cut off)
      var fb=rg.getBoundingClientRect(),m2={left:fb.left,right:fb.right,top:fb.top,bottom:fb.bottom},fa=(fb.right-fb.left)*(fb.bottom-fb.top);
      var fh=3*parseFloat(cs.fontSize);
      ch.clips.forEach(function(c){if(c.fr||c.bottom-c.top>fh)return;m2.left=Math.max(m2.left,c.left);m2.right=Math.min(m2.right,c.right);m2.top=Math.max(m2.top,c.top);m2.bottom=Math.min(m2.bottom,c.bottom);});
      var va=Math.max(0,m2.right-m2.left)*Math.max(0,m2.bottom-m2.top);
      if(fa>0&&va>0&&fb.right>0&&fb.left<W&&fb.bottom>0&&fb.top<H){var hd=1-va/fa;g.mx=Math.max(g.mx,hd);if(hd<=CFG.maskMax)g.mh=Math.max(g.mh,hd);}
      for(var i=0;i<rs.length;i++){var v={left:rs[i].left,right:rs[i].right,top:rs[i].top,bottom:rs[i].bottom};
        ch.clips.forEach(function(c){v.left=Math.max(v.left,c.left);v.right=Math.min(v.right,c.right);v.top=Math.max(v.top,c.top);v.bottom=Math.min(v.bottom,c.bottom);});
        if(v.right-v.left>1&&v.bottom-v.top>1&&v.right>0&&v.left<W&&v.bottom>0&&v.top<H){vis=true;g.rects.push(v);}}}
    g.segs.push({s:raw,v:vis});}
  var out=[];
  G.forEach(function(g){
    var str='',vc=[];g.segs.forEach(function(x){str+=x.s;for(var i=0;i<x.s.length;i++)vc.push(x.v?1:0);});
    var words=0,vw=0,re=/\\S+/g,m;
    // CJK has no spaces: a line counts in reading-equivalent words (lib/reading.mjs: CJK chars / 4.5 + other chars / 15 per second, 0.3 s per word: 0.74 per CJK char, 0.22 per other char)
    if(CJK.test(str)){for(var q=0;q<str.length;q++){var cc=str.charAt(q);if(/\\s/.test(cc))continue;var wt=CJK.test(cc)?0.7407:0.2222;words+=wt;vw+=wt*vc[q];}words=Math.round(words*10)/10;vw=Math.round(vw*10)/10;}
    else while((m=re.exec(str))){words++;var c=0;for(var i=m.index;i<m.index+m[0].length;i++)c+=vc[i];vw+=c/m[0].length;}
    var f=parseFloat(getComputedStyle(g.el).fontSize);
    if(!(vw>0)||!g.rects.length||!(f>=CFG.minFont))return;
    var lines=[];g.rects.sort(function(a,b){return a.top-b.top;}).forEach(function(r){
      for(var j=0;j<lines.length;j++){var L=lines[j],ov=Math.min(L.bottom,r.bottom)-Math.max(L.top,r.top);
        if(ov>0.5*Math.min(L.bottom-L.top,r.bottom-r.top)){L.left=Math.min(L.left,r.left);L.right=Math.max(L.right,r.right);L.top=Math.min(L.top,r.top);L.bottom=Math.max(L.bottom,r.bottom);return;}}
      lines.push({left:r.left,right:r.right,top:r.top,bottom:r.bottom});});
    var id=BID.get(g.el);if(!id){id=++BN;BID.set(g.el,id);}BE[id]=g.el;
    out.push({i:id,w:words,v:vw,f:f,m:Math.round(g.mh*100)/100,mx:Math.round(g.mx*100)/100,t:str.replace(/\\s+/g,' ').trim().slice(0,80),s:g.el.closest('[data-read="skim"],[data-composition-id*="caption" i],[class*="caption" i],[id*="caption" i]')?1:0,c:g.el.closest('[data-composition-id*="caption" i],[class*="caption" i],[id*="caption" i]')?1:0,u:g.el.closest('[data-ui],[data-mock]')?1:0,o:g.el.closest('[data-overlap="ok"]')?1:0,rtl:(RTLS.test(str)&&getComputedStyle(g.el).direction==='ltr')?1:0,
      r:lines.map(function(r){var p=0.15*(r.bottom-r.top);return [Math.round(r.left),Math.round(r.top+p),Math.round(r.right),Math.round(r.bottom-p)];}),el:g.el});}); // ink, not the line box: stacked lines at line-height 1 do not overlap
  out.forEach(function(x){x.a=out.filter(function(y){return y!==x&&y.el.contains(x.el);}).map(function(y){return y.i;});});
  out.forEach(function(x){delete x.el;});
  return out;};
// ink of the given blocks (flat text colours, effective alpha, size, weight, line boxes) for the contrast check
window.__tfInk=function(ids){var out=[];
  ids.forEach(function(id){var el=BE[id];if(!el||!el.isConnected||el.closest('[data-contrast="ok"],[data-text-fit="ignore"]'))return;
    var w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT),n,ents=[];
    while((n=w.nextNode())){var raw=String(n.nodeValue||'');if(!/\\S/.test(raw))continue;var pe=n.parentElement;if(!pe||/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|TITLE)$/.test(pe.tagName))continue;
      var cs=getComputedStyle(pe);if(cs.display==='none'||cs.visibility==='hidden'||/text/.test(cs.webkitBackgroundClip||cs.backgroundClip||''))continue;
      var ch=chain(pe);if(!ch||!(ch.op>0.5))continue;
      var m=String(cs.webkitTextFillColor||cs.color).match(/rgba?\\(([^)]+)\\)/);if(!m)continue;var p=m[1].split(/[ ,\\/]+/).filter(Boolean).map(parseFloat),a=(p.length>=4?p[3]:1)*ch.op;if(!(a>0.05))continue;
      var rg=document.createRange();rg.selectNodeContents(n);
      var rs=[].map.call(rg.getClientRects(),function(r){return [r.left,r.top,r.right,r.bottom];}).filter(function(r){return r[2]-r[0]>2&&r[3]-r[1]>2&&r[2]>0&&r[0]<CFG.W&&r[3]>0&&r[1]<CFG.H;});
      if(!rs.length)continue;
      ents.push({c:[p[0],p[1],p[2]],a:a,f:parseFloat(cs.fontSize),w:parseInt(cs.fontWeight,10)||400,r:rs,t:raw.replace(/\\s+/g,' ').trim().slice(0,40)});}
    if(ents.length)out.push({i:id,e:ents});});
  return out;};
// asset preflight at page load: resources that 404 or came back empty (resource timing), images/video that did not decode, fonts that failed
window.__tfAssets=function(){var bad=[];
  try{performance.getEntriesByType('resource').forEach(function(e){var u=e.name;if(/^(data|blob):|__rasanai\\/|\\.rasanai-textfit|\\.js(\\?|$)/.test(u))return;
    var st=e.responseStatus||0;
    if(st>=400)bad.push({u:u,why:'HTTP '+st});
    else if(st===200&&e.decodedBodySize===0&&e.encodedBodySize===0)bad.push({u:u,why:'zero-size file'});});}catch(e){}
  [].forEach.call(document.images,function(im){var u=im.currentSrc||im.src||'';if(!u||/^data:|\\.svg(\\?|$)/i.test(u))return;if(im.complete&&!im.naturalWidth)bad.push({u:u,why:'the image did not decode (broken, empty or not an image)'});});
  [].forEach.call(document.querySelectorAll('video,audio'),function(v){if(v.error||v.networkState===3&&v.readyState===0)bad.push({u:v.currentSrc||v.getAttribute('src')||(v.querySelector('source')||{}).src||'(media)',why:'the media did not load'});});
  try{document.fonts.forEach(function(f){if(f.status==='error')bad.push({u:'font "'+String(f.family).replace(/"/g,'')+'"',why:'the font file did not load'});});}catch(e){}
  return bad;};
// at a seek time: media shown larger than its natural size, and the characters each LOADED web font lacks (a char whose width changes with the fallback is not in the font)
var GC=document.createElement('canvas').getContext('2d'),GLY={};
function loadedFam(f){var ok=false;try{document.fonts.forEach(function(x){if(x.status==='loaded'&&String(x.family).replace(/["']/g,'')===f)ok=true;});}catch(e){}return ok;}
window.__tfSweep=function(T){window.__tfSeek(T);var media=[],miss={};
  [].forEach.call(document.querySelectorAll('img,video'),function(m){
    if(m.closest('[data-text-fit="ignore"],[data-upscale="ok"]'))return;
    var nw,nh;if(m.tagName==='IMG'){if(/\\.svg(\\?|$)/i.test(m.currentSrc||m.src||''))return;nw=m.naturalWidth;nh=m.naturalHeight;}else{nw=m.videoWidth;nh=m.videoHeight;}
    if(!(nw>0&&nh>0))return;var cs=getComputedStyle(m);if(cs.display==='none'||cs.visibility==='hidden')return;
    var ch=chain(m);if(!ch||!(ch.op>0.3))return;var r=m.getBoundingClientRect();
    if(!(r.width>4&&r.height>4)||r.right<=0||r.left>=CFG.W||r.bottom<=0||r.top>=CFG.H)return;
    var sx=r.width/nw,sy=r.height/nh,fit=cs.objectFit,sc=fit==='contain'||fit==='scale-down'?Math.min(sx,sy):fit==='none'?1:Math.max(sx,sy);
    media.push({s:String(m.currentSrc||m.src||'').split('/').slice(-2).join('/').slice(0,80),nw:nw,nh:nh,k:Math.round(sc*100)/100});});
  var w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT),n;
  while((n=w.nextNode())){var raw=String(n.nodeValue||'');if(!/\\S/.test(raw))continue;var pe=n.parentElement;if(!pe||/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|TITLE)$/.test(pe.tagName)||pe.closest('[data-text-fit="ignore"]'))continue;
    var cs2=getComputedStyle(pe);if(cs2.display==='none')continue;
    var fam=String(cs2.fontFamily).split(',')[0].replace(/["']/g,'').trim();if(!fam)continue;
    var lf=GLY['L|'+fam];if(lf===undefined)lf=GLY['L|'+fam]=loadedFam(fam);if(!lf)continue;
    var fb=cs2.fontStyle+' '+cs2.fontWeight+' 64px "'+fam+'"';
    for(var i=0;i<raw.length;i++){var ch2=raw.charAt(i),cp=raw.codePointAt(i);if(cp>=0xd800&&cp<=0xdfff)continue;
      if(cp<33||(cp>=0x200b&&cp<=0x200f)||cp===0xfe0f||cp===0x2028||cp===0xa0||cp===0xad)continue;
      var k=fb+'|'+ch2,v=GLY[k];
      if(v===undefined){GC.font=fb+', serif';var a1=GC.measureText(ch2).width;GC.font=fb+', monospace';var a2=GC.measureText(ch2).width;v=GLY[k]=Math.abs(a1-a2)>0.01;}
      if(v){(miss[fam]=miss[fam]||{})[ch2]=1;}}}
  return {T:T,media:media,miss:Object.keys(miss).map(function(f){return {f:f,c:Object.keys(miss[f])};})};};
// heroes: [data-hero] and the ids the score names (CFG.heroIds): the untrimmed box of each that is on screen (display, opacity over 0.3)
window.__tfHero=function(){var els=[].slice.call(document.querySelectorAll('[data-hero]'));
  (CFG.heroIds||[]).forEach(function(id){var e=document.getElementById(id);if(e&&els.indexOf(e)<0)els.push(e);});
  var out=[];els.forEach(function(el,i){if(el.closest('[data-text-fit="ignore"]'))return;var ch=chain(el);if(!ch||!(ch.op>0.3))return;
    var r=el.getBoundingClientRect();if(!(r.width>2&&r.height>2))return;
    out.push({i:i,n:el.id||el.getAttribute('data-hero')||(el.tagName.toLowerCase()+'#'+i),b:el.getAttribute('data-hero')==='bleed'?1:0,l:r.left,t:r.top,r:r.right,bt:r.bottom});});
  return out;};
// the first meaning that is not a line of text: a picture, a video, a UI surface or a brand mark of 4% of the frame or more, visible (img, video, [data-ui], [data-brand-mark])
window.__tfVisual=function(){var q='img,video,[data-ui],[data-brand-mark]',n=document.querySelectorAll(q);
  for(var i=0;i<n.length;i++){var el=n[i];if(el.closest('[data-text-fit="ignore"]'))continue;var ch=chain(el);if(!ch||!(ch.op>0.5))continue;var r=el.getBoundingClientRect();
    var w=Math.min(r.right,CFG.W)-Math.max(r.left,0),h=Math.min(r.bottom,CFG.H)-Math.max(r.top,0);if(w>0&&h>0&&w*h>=0.04*CFG.W*CFG.H)return 1;}
  return 0;};
window.__tfRun=function(times){return times.map(function(T){window.__tfSeek(T);return {T:T,hits:window.__tfMeasure(),blocks:window.__tfBlocks(),hero:window.__tfHero(),vis:T<3?window.__tfVisual():0};});};
})();</script>`;

// extraJs: another <script> block a second check (lib/chrome-lint.mjs) adds; it may call window.__tfSeek(T)
export function pageFor(file, root, baseUrl, W, H, safe, extraJs = "") {
  let html = readText(file).replace(/<template[^>]*>/gi, "").replace(/<\/template>/gi, "");
  html = html.replace(/<script[^>]+src=["'][^"']*gsap(?:\.min)?\.js["'][^>]*><\/script>/gi, `<script src="/__rasanai/gsap.min.js"></script>`);
  const gsapTag = /gsap(\.min)?\.js/.test(html) ? "" : `<script src="/__rasanai/gsap.min.js"></script>`;
  const head = `<base href="${baseUrl}/">${gsapTag}<script>window.__tfErr=[];window.addEventListener('error',function(e){var t=e.target;if(t&&t.tagName==='SCRIPT'){var u=t.getAttribute('src')||'';if(u&&!/^https?:/i.test(u))window.__tfErr.push('could not load the script '+u);}else if(e.message)window.__tfErr.push(e.message+(e.filename?' ('+String(e.filename).split('/').pop()+':'+e.lineno+')':''));},true);window.addEventListener('unhandledrejection',function(e){window.__tfErr.push(String(e.reason&&e.reason.message||e.reason));});window.__timelines=window.__timelines||{};window.__tfCfg=${JSON.stringify({ W, H, safe, minFont: TEXT_FIT.min_font_px, maskMax: TEXT_FIT.mask_max })};</script><style>html,body{margin:0;padding:0;background:#000;overflow:hidden;width:${W}px;height:${H}px}</style>`;
  html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + head) : head + html;
  html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, PAGE_JS + extraJs + "</body>") : html + PAGE_JS + extraJs;
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
export function analyzeBlocks(byBlock, dt, file, H, warn = []) {
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
    // RTL script (Arabic, Hebrew...) in a block whose direction is ltr: punctuation and numbers land on the wrong side, start-alignment sits left
    const rtl = ok.find((r) => r.rtl);
    if (rtl) warn.push({ check: "rtl-direction", severity: "warning", at: r2(rtl.t), from: r2(rtl.t), to: r2(ok[ok.length - 1].t + dt), text: text.slice(0, 40), file: base, region: "text",
      message: `"${text.slice(0, 40)}" is right-to-left script in a block set to direction: ltr (from ${r2(rtl.t)} s)`,
      fix: 'set dir="rtl" (or direction: rtl) on the block so punctuation, numbers and alignment follow the script; mirror its directional moves (an entrance from the right becomes one from the left) and run a stagger from the right' });
    for (const r of ok) { const k = Math.round(r.t * 1000); if (!per.has(k)) per.set(k, []); per.get(k).push({ id, ...r }); }
    if (minH != null && ok.length && w >= T.brief_min_words && rows[0].f < minH * H && !rows.some((r) => r.s)) {
      const run = runs(ok.map((r) => r.t)).reduce((a, b) => (b[1] - b[0] > a[1] - a[0] ? b : a), [0, 0]);
      if (run[1] - run[0] >= T.rest_s - 1e-9) findings.push({
        check: "text-too-small", severity: "error", at: r2(run[0]), from: r2(run[0]), to: r2(run[1]), text: text.slice(0, 40), file: base, region: "text",
        message: `"${text.slice(0, 40)}" is set at ${Math.round(rows[0].f)} px, ${r2(rows[0].f / H * 100)}% of the frame height; a readable line of ${w} words must be at least ${r2(minH * 100)}% (${Math.round(minH * H)} px), ${r2(run[0])}–${r2(run[1])} s${tail}`,
        fix: 'set it larger (or shorter so it can be), or mark it data-read="skim" if it is texture; the user taught this rule on an earlier film (lessons.mjs)',
      });
    }
    // glyphs hidden by a mask or an inset while the line is readable (not a frame edge: that is the check above): a clip that takes 12% or more of a
    // word's box, for 0.3 s or longer. A word that rises through its line mask is hidden for a moment; a line whose words are still rising, or a composer
    // inset that cuts the first letters off for seconds, is not.
    const hid = w >= T.brief_min_words ? ok.filter((r) => r.m >= T.mask_hid) : []; // a line of 3+ words (a number rolling in a mask, a label, a single word is not a line)
    if (hid.length) for (const run of runs(hid.map((r) => r.t))) {
      if (run[1] - run[0] < T.mask_s - 1e-9) continue;
      const inRun = hid.filter((r) => r.t >= run[0] - 1e-9 && r.t < run[1]), first = inRun[0], last = inRun[inRun.length - 1];
      const after = rows.find((r) => r.t >= run[1] - 1e-9);
      // leaving: the hidden share keeps growing past the run (a line dropping out through its mask is a deliberate exit, not cut-off letters); entering or at rest, it falls or holds
      if (after ? after.mx > last.m + 0.05 : last.m > first.m + 0.1) continue;
      const worst = hid.filter((r) => r.t >= run[0] - 1e-9 && r.t < run[1]).reduce((a, b) => (b.m > a.m ? b : a));
      // entering (the hidden share falls through the run) is a slow rise: a warning; cut-off letters at rest are the error
      const rising = first.m > last.m + 0.05;
      findings.push({
        check: "text-cropped", severity: rising ? "warning" : "error", at: r2(run[0]), from: r2(run[0]), to: r2(run[1]), text: text.slice(0, 40), file: base, region: "mask",
        message: `"${text.slice(0, 40)}" is readable while a mask or inset cuts off ${Math.round(worst.m * 100)}% of a word's box, from ${r2(run[0])} to ${r2(run[1])} s (${r2(run[1] - run[0])} s; ${T.mask_s} s at most)`,
        fix: "widen the mask or inset (padding for the descenders and the overshoot, not the line box), or let the line finish rising before the next words show; a reveal through a mask is fine, a readable line with cut-off letters is not (references/craft.md section 10)",
      });
    }
    // text-moves-before-read (warning): once the line is whole and its box has stopped, it holds still for its reading time before any travel, scale or camera push
    if (w >= T.brief_min_words && !rows.some((r) => r.s) && rows.every((r) => r.x === rows[0].x && r.r && r.r.length)) {
      const box = (r) => r.r.reduce((a, q) => [Math.min(a[0], q[0]), Math.min(a[1], q[1]), Math.max(a[2], q[2]), Math.max(a[3], q[3])], [1e9, 1e9, -1e9, -1e9]);
      const mid = (b) => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
      const shift = (a, b) => { const p = mid(a), q = mid(b); return Math.hypot(p[0] - q[0], p[1] - q[1]) / H; };
      const grow = (a, b) => Math.max(Math.abs((b[2] - b[0]) / Math.max(1, a[2] - a[0]) - 1), Math.abs((b[3] - b[1]) / Math.max(1, a[3] - a[1]) - 1));
      let i = rows.findIndex((r) => r.v >= w);
      while (i > -1 && i + 1 < rows.length && shift(box(rows[i]), box(rows[i + 1])) > 0.003) i++; // still settling in: the reveal, not travel
      if (i > -1 && i + 1 < rows.length) {
        const b0 = box(rows[i]), end = rows[i].t + readTime(w, { base: T.read_base_s, perWord: T.read_per_word_s });
        for (let j = i + 1; j < rows.length && rows[j].t < end - 1e-9 && rows[j].t - rows[j - 1].t < dt * 1.5 && rows[j].v * 2 >= w; j++) {
          const b1 = box(rows[j]);
          if (shift(b0, b1) <= 0.02 && grow(b0, b1) <= 0.05) continue;
          warn.push({ check: "text-moves-before-read", severity: "warning", at: r2(rows[j].t), from: r2(rows[i].t), to: r2(end), text: rows[i].x.slice(0, 40), file: base, region: "text",
            message: `"${rows[i].x.slice(0, 40)}" is whole and still from ${r2(rows[i].t)} s, then moves or scales at ${r2(rows[j].t)} s, before its ${r2(end - rows[i].t)} s reading time is up (${w} words)`,
            fix: "hold the line still for its reading time before any decorative travel; keep camera pushes and scale off the text being read (references/craft.md, kinetic type)" });
          break;
        }
      }
    }
    if (!ok.length || rows[0].f < T.statement * H || rows.some((r) => r.s)) continue;
    // text-too-brief per text STATE: a slot whose string changes (typed, deleted, swapped) is judged per chain of strings, each one growing from the last
    // (typing); the longest string of a chain must be readable for its own reading time. A shrinking string (deleting) is in flux and not counted.
    const chains = [];
    rows.forEach((r, i) => {
      const prev = rows[i - 1];
      if (!prev || r.x === prev.x || r.x.startsWith(prev.x) || prev.x.startsWith(r.x)) { if (prev && prev.x.length > r.x.length) r = { ...r, shrink: true }; chains.length ? chains[chains.length - 1].push(r) : chains.push([r]); }
      else chains.push([r]);
    });
    for (const ch of chains) {
      const wc = Math.max(...ch.map((r) => r.w)), okc = ch.filter((r) => !r.shrink && r.v * 2 >= wc);
      if (!okc.length || wc < T.brief_min_words) continue;
      const rt = { base: T.read_base_s, perWord: T.read_per_word_s }, need = readTime(wc, rt), needSeen = readTime(wc, { ...rt, slack: T.read_slack }); // lib/reading.mjs: render-level, so with slack
      const best = runs(okc.map((r) => r.t)).reduce((a, b) => (b[1] - b[0] > a[1] - a[0] ? b : a), [0, 0]);
      if (best[1] - best[0] >= needSeen - dt - 1e-9) continue; // 15% slack: a line a few frames short reads; one held half its time does not
      const shown = best[1] - best[0], tx = okc.reduce((a, b) => (b.v > a.v ? b : a)).x;
      findings.push({
        check: "text-too-brief", severity: "error", at: r2(best[0]), from: r2(best[0]), to: r2(best[1]), text: tx.slice(0, 40), file: base, region: "text",
        message: `"${tx.slice(0, 40)}" is readable for ${r2(shown)} s (${r2(best[0])}–${r2(best[1])} s); ${wc} words need ${r2(need)} s${T.read_per_word_s > TEXT_FIT.read_per_word_s ? tail : ""}${chains.length > 1 ? " (one of " + chains.length + " strings in this text slot, each judged on its own)" : ""}`,
        fix: 'hold it longer, cut words, or mark it data-read="skim" if it is texture; never speed it up (references/craft.md section 10)',
      });
    }
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

// a script that stops the render: an uncaught error or a script that did not load while the page loaded, a timeline that throws when seeked, or a
// composition whose own script never registered its timeline (window.__timelines[<composition id>]), so the renderer has nothing to seek
async function scriptErrors(b, file, root) {
  const out = [], rel = path.relative(root, file), html = readText(file);
  const errs = await b.eval("window.__tfErr||[]");
  for (const m of [...new Set(errs)].slice(0, 5)) out.push({ file: rel, message: String(m).slice(0, 240) });
  const ids = [...html.matchAll(/data-composition-id="([^"]+)"/g)].map((m) => m[1]);
  if (/__timelines|gsap\.timeline/.test(html) && ids.length) {
    const keys = await b.eval("Object.keys(window.__timelines||{})");
    // index.html hosts the others (its own timeline is optional); a composition file names its own id first
    const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const want = path.basename(file) === "index.html" ? ids.filter((i) => new RegExp("__timelines\\[[\"']" + esc(i) + "[\"']\\]").test(html)) : [ids[0]];
    for (const id of want) if (!keys.includes(id)) out.push({ file: rel, message: `its script never registered a timeline for "${id}" (window.__timelines["${id}"] is missing; the script stopped before it, or the id differs)` });
  }
  return out;
}

// ---- hero tracking, text states and the pure checks built on them (all WARNINGS, uncalibrated) ----
export const SUBJECT = { inside: 0.9, lost_s: 0.3, never_s: 0.5 };
// byHero: Map i -> [{t, n, b, l, t:.., r, bt}] (film seconds) -> warnings. share = the part of the box inside the safe rectangle
export function analyzeHero(byHero, dt, file, W, H, safe) {
  const out = [], sx = W * safe, sy = H * safe, R = { l: sx, t: sy, r: W - sx, b: H - sy }, base = path.basename(file);
  for (const [, rows0] of byHero) {
    const rows = rows0.map((h) => {
      const w = h.r - h.l, ht = h.bt - h.t, ix = Math.max(0, Math.min(h.r, R.r) - Math.max(h.l, R.l)), iy = Math.max(0, Math.min(h.bt, R.b) - Math.max(h.t, R.t));
      return { t: h.T, n: h.n, bleed: h.b, w, h: ht, share: w * ht > 0 ? (ix * iy) / (w * ht) : 0 };
    }).sort((a, b) => a.t - b.t);
    if (!rows.length || rows[0].bleed) continue;
    const med = (k) => rows.map((r) => r[k]).sort((a, b) => a - b)[rows.length >> 1];
    if (med("w") > (R.r - R.l) * 1.02 || med("h") > (R.b - R.t) * 1.02) continue; // bigger than the safe area itself: a deliberate bleed
    const name = rows[0].n, ok = (r) => r.share >= SUBJECT.inside - 1e-9, first = rows.findIndex(ok);
    const need = Math.ceil(SUBJECT.lost_s / dt - 1e-9);
    const warn = (from, to, msg) => out.push({ check: "subject-lost", severity: "warning", at: r2(from), from: r2(from), to: r2(to), text: name, file: base, region: "hero",
      message: msg, fix: "the beat's hero stays in shot while the camera moves: re-aim the camera on it (centre the move on the hero, or move the hero with it), shorten the move, or mark a deliberate crop data-hero=\"bleed\"; the score's hero for this beat is what the viewer must notice" });
    if (first < 0) {
      const seen = rows.length * dt;
      if (seen >= SUBJECT.never_s) warn(rows[0].t, rows[rows.length - 1].t + dt, `the hero "${name}" is never inside the ${Math.round(safe * 100)}% safe area (best ${Math.round(Math.max(...rows.map((r) => r.share)) * 100)}% of it inside) in its ${r2(seen)} s on screen`);
      continue;
    }
    // runs under the line after it was first inside
    let i = first;
    while (i < rows.length) {
      if (ok(rows[i])) { i++; continue; }
      let j = i; while (j < rows.length && !ok(rows[j]) && rows[j].t - rows[j - 1].t <= dt * 1.5) j++;
      const run = rows.slice(i, j), last = run[run.length - 1], endsOut = j >= rows.length && last.share < 0.05;
      if (run.length >= need && !endsOut) warn(run[0].t, last.t + dt, `the hero "${name}" leaves the safe area (${Math.round(Math.min(...run.map((r) => r.share)) * 100)}% of it inside at worst) from ${r2(run[0].t)} to ${r2(last.t + dt)} s while it is on screen`);
      i = Math.max(j, i + 1);
    }
  }
  return out;
}

// text states: block rows -> [{text, from, to, caption, skim, ui, file}] (each distinct string of a block readable for 0.25 s or more; film seconds)
export function textStates(byBlock, dt, file) {
  const out = [], base = path.basename(file);
  for (const [, rows] of byBlock) {
    const w = Math.max(...rows.map((r) => r.w)), ok = rows.filter((r) => r.v * 2 >= w).sort((a, b) => a.t - b.t);
    let cur = null;
    const close = () => { if (cur && cur.to - cur.from >= 0.25 - 1e-9) out.push(cur); cur = null; };
    for (const r of ok) {
      if (cur && cur.text === r.x && r.t - cur.last <= dt * 1.5) { cur.to = r.t + dt; cur.last = r.t; continue; }
      close();
      cur = { text: r.x, from: r2(r.t), to: r2(r.t + dt), last: r.t, caption: !!r.c, skim: !!r.s, ui: !!r.u, file: base };
    }
    close();
  }
  for (const o of out) delete o.last;
  return out.sort((a, b) => a.from - b.from);
}

const STOP = new Set("the a an and or but of to in on at for with from by is are was were be been it its this that these those you your we our they their as not no so if then than into out up down over just more most can will do does did have has had".split(" "));
const toks = (t) => String(t).toLowerCase().replace(/(\d),(\d)/g, "$1$2").replace(/[^\p{L}\p{N}' ]/gu, " ").split(/\s+/).map((w) => w.replace(/^'+|'+$/g, "")).filter(Boolean);
const content = (t) => toks(t).filter((w) => w.length >= 4 && !STOP.has(w));

// narration cues from word times [{text, start, end}] (film seconds): a cue ends at a sentence end or a pause of 0.6 s
export function cuesOf(words) {
  const ws = words.filter((w) => Number.isFinite(w.start)).sort((a, b) => a.start - b.start), out = [];
  let cur = null;
  for (const w of ws) {
    if (cur && (w.start - cur.end > 0.6 || /[.!?]["')\]]*$/.test(cur.last))) { out.push(cur); cur = null; }
    if (!cur) cur = { t: w.start, end: w.end ?? w.start, text: "", last: "" };
    cur.text += (cur.text ? " " : "") + w.text; cur.end = w.end ?? w.start; cur.last = String(w.text);
  }
  if (cur) out.push(cur);
  return out.map(({ last, ...c }) => c).filter((c) => toks(c.text).length >= 2);
}

// see-and-say: every narration cue has an on-screen event within win seconds (a score event, a beat start, a text appearing; captions never count: they follow the voice),
// and a line of text that names a word the voice says has it spoken within win seconds of the text appearing (or while it is up)
export function seeAndSay(cues, events, texts, words, { win = 1.0 } = {}) {
  const out = [], seen = [...events.map((e) => ({ t: e.t, what: e.what || "event" })), ...texts.filter((x) => !x.caption).map((x) => ({ t: x.from, what: `"${x.text.slice(0, 30)}" appears` }))];
  for (const c of cues) {
    let best = null; for (const e of seen) { const d = Math.abs(e.t - c.t); if (!best || d < best.d) best = { d, e }; }
    if (!best || best.d > win + 1e-9) out.push({ check: "see-and-say", severity: "warning", at: r2(c.t), text: c.text.slice(0, 60), region: "narration",
      message: `the narration "${c.text.slice(0, 60)}" at ${r2(c.t)} s has no on-screen event within ${win} s${best ? ` (nearest: ${best.e.what} ${r2(best.d)} s away)` : " (no events or text to match against)"}`,
      fix: "show what the voice says as it says it: a text, an object landing or a UI change within a second of the line starting; or move the line to where something happens" });
  }
  const spoken = new Map();
  for (const w of words) for (const k of content(w.text)) { if (!spoken.has(k)) spoken.set(k, []); spoken.get(k).push({ s: w.start, e: w.end ?? w.start }); }
  let n = 0;
  for (const x of texts) {
    if (x.caption || x.ui) continue;
    const ks = [...new Set(content(x.text))].filter((k) => spoken.has(k));
    if (!ks.length) continue;
    const near = ks.some((k) => spoken.get(k).some((o) => Math.abs(o.s - x.from) <= win + 1e-9 || (o.s >= x.from - 1e-9 && o.s <= x.to + 1e-9)));
    if (!near && n++ < 8) out.push({ check: "text-off-word", severity: "warning", at: x.from, text: x.text.slice(0, 60), file: x.file, region: "text",
      message: `"${x.text.slice(0, 60)}" appears at ${x.from} s but the voice says ${ks.slice(0, 3).map((k) => `"${k}"`).join(", ")} elsewhere (nearest ${r2(Math.min(...ks.flatMap((k) => spoken.get(k).map((o) => Math.abs(o.s - x.from)))))} s away)`,
      fix: "land the text on the word it names (within a second; 0-2 frames before the word for a name or a number), or reword it so it does not echo a word said elsewhere" });
  }
  return out;
}

// captions that duplicate other on-screen text: a caption state and a non-caption line (3+ words) that overlap in time for 0.3 s or more, 70% of the line's words in the caption
export function captionDupes(texts, { share = 0.7, overlap_s = 0.3, min_words = 3 } = {}) {
  const out = [], caps = texts.filter((x) => x.caption), rest = texts.filter((x) => !x.caption && !x.ui);
  for (const c of caps) {
    const cw = new Set(toks(c.text));
    for (const x of rest) {
      const xw = toks(x.text);
      if (xw.length < min_words || Math.min(c.to, x.to) - Math.max(c.from, x.from) < overlap_s - 1e-9) continue;
      const hit = xw.filter((w) => cw.has(w)).length / xw.length;
      if (hit >= share) out.push({ check: "caption-duplicates-text", severity: "warning", at: Math.max(c.from, x.from), text: x.text.slice(0, 60), file: x.file, region: "captions",
        message: `the caption "${c.text.slice(0, 50)}" and the line "${x.text.slice(0, 50)}" say the same words at ${r2(Math.max(c.from, x.from))}-${r2(Math.min(c.to, x.to))} s (${Math.round(hit * 100)}% of the line)`,
        fix: "say it once: drop the caption for that stretch (the on-screen line is the caption), or change the line so it adds something the voice does not say" });
    }
  }
  return out;
}

// numbers shown on screen: "47%", "$1,200", "2.5k", "3x", "12" -> [{raw, value}] (value in units: 2.5k = 2500, 47% = 47). Time-of-day, versions and years are not numbers; plain integers 10 and under are not (steps, counts)
export function numbersIn(text) {
  const t = String(text).replace(/\b\d{1,2}:\d{2}(:\d{2})?\b/g, " ").replace(/\bv\d+(\.\d+)*\b/gi, " ");
  const out = [];
  for (const m of t.matchAll(/(?<![\w.])([$€£₹]?)(\d[\d,]*(?:\.\d+)?)\s?(%|[kKmMbB](?![a-z])|x|×)?/g)) {
    const raw = m[0].trim(), n = Number(m[2].replace(/,/g, ""));
    if (!Number.isFinite(n)) continue;
    const mul = { k: 1e3, m: 1e6, b: 1e9 }[String(m[3] || "").toLowerCase()] || 1;
    const plain = !m[1] && !m[3] && Number.isInteger(n);
    if (plain && (n <= 10 || (n >= 1900 && n <= 2100))) continue;
    out.push({ raw, value: n * mul, pct: m[3] === "%" });
  }
  return out;
}
// the set of values in a ledger text (every number in it, unfiltered: a claim "5-30 minutes" holds 5 and 30)
export function knownNumbers(blob) {
  const set = new Set();
  for (const m of String(blob).replace(/(\d),(\d{3})/g, "$1$2").matchAll(/(\d+(?:\.\d+)?)\s?([kKmMbB](?![a-z]))?/g)) {
    const n = Number(m[1]); if (!Number.isFinite(n)) continue;
    const mul = { k: 1e3, m: 1e6, b: 1e9 }[String(m[2] || "").toLowerCase()] || 1;
    set.add(r2(n * mul)); set.add(r2(n));
  }
  return set;
}
export function unknownNumbers(texts, known) {
  const out = [], done = new Set();
  for (const x of texts) {
    if (x.ui) continue; // mock data in a rebuilt UI is plausible by rule (craft.md: never invented claims, but mock rows are fine)
    for (const n of numbersIn(x.text)) {
      const k = r2(n.value) + "|" + x.text;
      if (known.has(r2(n.value)) || done.has(k)) continue;
      done.add(k);
      out.push({ check: "number-not-in-ledger", severity: "warning", at: x.from, text: n.raw, file: x.file, region: "text",
        message: `"${n.raw}" on screen at ${x.from} s ("${x.text.slice(0, 50)}") is in no claim of the research ledger or the brief`,
        fix: "a number on screen comes from the product or the research (research/claims.json), never invented: use the claim's real figure, add the claim with its source, or mark it a story detail in the brief / the pitch's props" });
    }
  }
  return out;
}

// the hook: first readable line and first big picture, film seconds (null when none in the first 3 s sampled)
export function hookOf(texts, visualTimes) {
  const t = texts.length ? Math.min(...texts.map((x) => x.from)) : null, v = visualTimes.length ? Math.min(...visualTimes) : null;
  return { text: t, visual: v, meaning: t == null ? v : v == null ? t : Math.min(t, v) };
}

// ---- extra measurements (all WARNINGS, uncalibrated; they land in result.warnings, never in findings) ----
const CONTRAST = { body: 4.5, large: 3, max_times: 30, max_pixels: 6000, upscale: 1.5, sweep: 8 };
const lin8 = (() => { const t = new Float64Array(256); for (let i = 0; i < 256; i++) { const c = i / 255; t[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; } return t; })();
const linf = (v) => { const c = Math.min(1, Math.max(0, v / 255)); return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const relLum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b; // r, g, b already linear
const rel = (u) => { try { const x = new URL(u); return decodeURIComponent(x.pathname).replace(/^\//, "") || u; } catch { return u; } };

// contrast of each readable block against the backdrop the browser really draws: the page is seeked, every text is made transparent, one
// screenshot is taken and the pixels under each line box are the backdrop (gradients, images, other shapes all count; text shadows stay).
// The ratio is the median over those pixels of WCAG contrast between the text colour (blended by its alpha) and the pixel.
async function contrastPass(b, pg, byBlock, warn, W, H, base) {
  const picks = [];
  for (const [id, rows] of byBlock) {
    const w = Math.max(...rows.map((r) => r.w)), ok = rows.filter((r) => r.v * 2 >= w);
    if (!ok.length) continue;
    picks.push({ id, T: Math.round((ok[Math.floor(ok.length / 2)].t - pg.start) * 1000) / 1000, f: rows[0].f });
  }
  const byT = new Map();
  for (const p of picks.sort((a, c) => c.f - a.f)) { const k = p.T; if (!byT.has(k) && byT.size >= CONTRAST.max_times) continue; if (!byT.has(k)) byT.set(k, []); byT.get(k).push(p.id); }
  for (const [T, ids] of [...byT].sort((a, c) => a[0] - c[0])) {
    await b.eval(`window.__tfSeek(${T})`);
    const ink = await b.eval(`window.__tfInk(${JSON.stringify(ids)})`);
    if (!ink || !ink.length) continue;
    await b.eval(`(function(){var s=document.createElement('style');s.id='__tfHide';s.textContent='*{color:transparent!important;-webkit-text-fill-color:transparent!important;-webkit-text-stroke:0!important}';document.head.appendChild(s);})()`);
    let img;
    try { img = decodePng(await b.screenshot()); } finally { await b.eval("(function(){var s=document.getElementById('__tfHide');if(s)s.remove();})()"); }
    const kx = img.width / W, ky = img.height / H;
    for (const blk of ink) {
      let worst = null;
      for (const e of blk.e) {
        const lt = [linf(e.c[0]), linf(e.c[1]), linf(e.c[2])], ratios = [];
        for (const r of e.r) {
          const x0 = Math.max(0, Math.floor(r[0] * kx)), x1 = Math.min(img.width, Math.ceil(r[2] * kx)), y0 = Math.max(0, Math.floor(r[1] * ky)), y1 = Math.min(img.height, Math.ceil(r[3] * ky));
          const step = Math.max(1, Math.ceil(Math.sqrt(((x1 - x0) * (y1 - y0)) / (CONTRAST.max_pixels / e.r.length))));
          for (let y = y0; y < y1; y += step) for (let x = x0; x < x1; x += step) {
            const i = (y * img.width + x) * 3, br = lin8[img.rgb[i]], bg = lin8[img.rgb[i + 1]], bb = lin8[img.rgb[i + 2]];
            const lb = relLum(br, bg, bb), lf = relLum(e.a * lt[0] + (1 - e.a) * br, e.a * lt[1] + (1 - e.a) * bg, e.a * lt[2] + (1 - e.a) * bb);
            ratios.push((Math.max(lb, lf) + 0.05) / (Math.min(lb, lf) + 0.05));
          }
        }
        if (ratios.length < 8) continue;
        ratios.sort((a, c) => a - c);
        const med = ratios[Math.floor(ratios.length / 2)], large = e.f >= 24 || (e.f >= 18.66 && e.w >= 700), need = large ? CONTRAST.large : CONTRAST.body;
        if (med < need && (!worst || med / need < worst.med / worst.need)) worst = { med, need, large, t: e.t, f: e.f };
      }
      if (worst) warn.push({ check: "low-contrast", severity: "warning", at: r2(pg.start + T), from: r2(pg.start + T), to: r2(pg.start + T), text: worst.t, file: base, region: "text",
        message: `"${worst.t}" (${Math.round(worst.f)} px) reads at ${r2(worst.med)}:1 against the backdrop drawn behind it at ${r2(pg.start + T)} s; ${worst.large ? "large" : "body"} text needs ${worst.need}:1`,
        fix: 'change the ink or the ground (or add a scrim / panel behind the line); data-contrast="ok" on a deliberate ghost or texture line (references/craft.md section 10)' });
    }
  }
}

// asset preflight + media scale + font glyph coverage over a few seek times; merged per page into `acc`
async function sweepPass(b, pg, acc, root) {
  const bad = await b.eval("window.__tfAssets()");
  for (const x of bad || []) { const k = x.u + "|" + x.why; if (!acc.bad.has(k)) acc.bad.set(k, { ...x, file: path.relative(root, pg.file) }); }
  const n = CONTRAST.sweep, span = Math.max(0.1, pg.end - pg.start);
  for (let i = 0; i < n; i++) {
    const T = Math.round(span * ((i + 0.5) / n) * 1000) / 1000;
    const r = await b.eval(`window.__tfSweep(${T})`);
    for (const m of r.media) { const k = m.s; const o = acc.media.get(k); if (!o || m.k > o.k) acc.media.set(k, { ...m, at: pg.start + T }); }
    for (const f of r.miss) { const set = acc.glyphs.get(f.f) || new Set(); f.c.forEach((c) => set.add(c)); acc.glyphs.set(f.f, set); }
  }
}
function sweepFindings(acc) {
  const out = [];
  for (const x of acc.bad.values()) out.push({ check: x.u.startsWith("font ") ? "font-failed" : /zero-size/.test(x.why) ? "asset-empty" : "asset-missing", severity: "warning", at: null, text: x.u, file: x.file, region: "assets",
    message: `${x.u.startsWith("font ") ? x.u : `"${rel(x.u)}"`} ${/^HTTP|zero/.test(x.why) ? "came back as " + x.why : "failed: " + x.why} (loaded by ${x.file})`,
    fix: "copy the real file into the project (assets/) and fix the path; a missing image or video renders as a blank or a broken-image box, a missing font as the fallback face" });
  for (const m of acc.media.values()) if (m.k > CONTRAST.upscale) out.push({ check: "media-upscaled", severity: "warning", at: r2(m.at), text: m.s, file: m.s, region: "assets",
    message: `"${m.s}" is ${m.nw}x${m.nh} px and is shown at ${m.k}x its natural size (by ${r2(m.at)} s); above ${CONTRAST.upscale}x a picture softens`,
    fix: 'use a larger source (generate or fetch it at 2x the on-screen size), show it smaller, or data-upscale="ok" for a deliberate soft or blurred plate' });
  for (const [fam, set] of acc.glyphs) {
    const cs = [...set].sort(); const sample = cs.slice(0, 12);
    out.push({ check: "glyph-missing", severity: "warning", at: null, text: sample.join(" "), file: fam, region: "assets",
      message: `the loaded font "${fam}" has no glyph for ${sample.join(" ")}${cs.length > 12 ? ` (+${cs.length - 12} more)` : ""} (${sample.slice(0, 4).map((c) => "U+" + c.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")).join(", ")}${cs.length > 4 ? ", ..." : ""}): they render in a fallback font`,
      fix: "stage a font file that covers them (the full family, not the latin subset: fonts.mjs stages latin only; Noto for CJK/Indic/Arabic), or set those characters in another face on purpose (a real glyph, never tofu)" });
  }
  return out;
}

export async function textFit(project, { fps = TEXT_FIT.fps, safe = TEXT_FIT.safe, heroIds = [] } = {}) {
  const res = { findings: [], warnings: [], texts: [], hook: { text: null, visual: null, meaning: null }, pages: 0, samples: 0, skipped: [], could_not_run: [], script_errors: [] }; // warnings: the uncalibrated extras (contrast, assets, glyphs, upscaled media, rtl): same shape as findings, never errors
  const acc = { bad: new Map(), media: new Map(), glyphs: new Map() };
  const root = path.resolve(project);
  const pages = pagesOf(root);
  if (!pages.length) { res.skipped.push("text-fit: no compositions with a duration to sample (index.html, compositions/)"); return res; }
  const { W, H } = sizeOf(root);
  const dt = 1 / fps;
  // chromePath() exits the process when no Chrome exists; a gate must report that, not die
  { const realExit = process.exit; process.exit = () => { throw new Error("no Chrome found (npx hyperframes browser ensure, or set RASANAI_CHROME)"); };
    try { chromePath(); } catch (e) { res.could_not_run.push(`text-fit: ${e.message}`); noteDowngrade({ what: "the text-fit check", instead: "no text measurement", why: String(e.message).slice(0, 200), impact: "overflowing or clipped text is not caught" }); return res; } finally { process.exit = realExit; } }
  let b, srv;
  const tmps = [], visualTimes = [];
  try {
    srv = await serve(root);
    b = await launch({ width: W, height: H, timeoutMs: 120000 });
    for (const pg of pages) {
      const tmp = pageFor(pg.file, root, srv.url, W, H, safe);
      tmps.push(tmp);
      try {
        await b.open(`${srv.url}/${path.basename(tmp)}`, { waitMs: 30000 });
        await b.eval("document.fonts && document.fonts.ready ? document.fonts.ready.then(function(){return true;}) : true", { await: true });
        await b.eval(`window.__tfCfg.heroIds=${JSON.stringify((heroIds || []).map(String))}`);
        const times = [], byHero = new Map();
        for (let i = 0; pg.start + i * dt < pg.end - 1e-6; i++) times.push(Math.round(i * dt * 1000) / 1000); // seconds into this composition
        const byKey = new Map(), byBlock = new Map();
        for (let i = 0; i < times.length; i += 150) {
          const rows = await b.eval(`window.__tfRun(${JSON.stringify(times.slice(i, i + 150))})`);
          for (const row of rows) for (const h of row.hits) {
            const k = h.k;
            if (!byKey.has(k)) byKey.set(k, []);
            byKey.get(k).push({ ...h, t: pg.start + row.T });
          }
          for (const row of rows) {
            if (row.vis) visualTimes.push(pg.start + row.T);
            for (const h of row.hero || []) { if (!byHero.has(h.i)) byHero.set(h.i, []); byHero.get(h.i).push({ ...h, T: pg.start + row.T }); }
          }
          for (const row of rows) for (const { i, t: x, ...h } of row.blocks) {
            if (!byBlock.has(i)) byBlock.set(i, []);
            byBlock.get(i).push({ ...h, x, t: pg.start + row.T });
          }
        }
        res.script_errors.push(...(await scriptErrors(b, pg.file, root)));
        res.samples += times.length;
        res.pages++;
        res.findings.push(...analyze(byKey, dt, pg.file), ...analyzeBlocks(byBlock, dt, pg.file, H, res.warnings));
        res.warnings.push(...analyzeHero(byHero, dt, pg.file, W, H, safe));
        res.texts.push(...textStates(byBlock, dt, pg.file));
        try { await sweepPass(b, pg, acc, root); await contrastPass(b, pg, byBlock, res.warnings, W, H, path.basename(pg.file)); } catch (e) { res.skipped.push(`text-fit extras (contrast, assets, glyphs): ${path.relative(root, pg.file)}: ${String(e.message).slice(0, 120)}`); }
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
  res.warnings.push(...sweepFindings(acc));
  { const seen = new Set(); res.texts = res.texts.filter((x) => { const k = x.text + "|" + x.from; if (seen.has(k)) return false; seen.add(k); return true; }); }
  res.texts.sort((a, c) => a.from - c.from);
  res.hook = hookOf(res.texts, visualTimes);
  return res;
}
