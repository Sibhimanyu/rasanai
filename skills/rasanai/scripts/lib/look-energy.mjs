// Look energy redraw ("Redraw with more or less energy", the console `knob {name: "energy", value: calmer | as is | punchier}` on the Look step).
// Root cause it fixes: the director only edited motion params (eases, durations) in DESIGN.md / specimen.html and re-pushed the same specimen.png and
// frames/representative.png, so the owner saw an identical picture and a cached one at that. An energy redraw now:
//   (a) re-renders the specimen poster and the representative frame to NEW versioned names (specimen-v2.png, frames/representative-v2.png),
//   (b) draws the energy INTO the still (bigger type-scale contrast, motion-smear echoes of the headline, streak and ticker layers made from the page's own words,
//       a mid-move parking time for more energy; calmer = smaller headline, wider leading, softer contrast, parked settled),
//   (c) renders a 3.5 s motion preview (specimen-loop-vN.mp4, deterministic seek of the paused timeline + ffmpeg) carried as the style's `preview`,
//   (d) records every request: a request that arrives while one is applying is queued as "push further" (level + 1 / - 1 again), never dropped.
// State: <run>/look/energy.json { <Label>: { level, rendered_level, version, applying, requests[], last } }. Source-level only: edits go to versioned copies; specimen.html stays the designer's.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { serve } from "./stage3d.mjs";
import { launch } from "./cdp.mjs";

const GSAP_SRC = /<script[^>]+src=["'][^"']*gsap(?:\.min)?\.js["'][^>]*><\/script>/gi;
const LEVEL_MIN = -2, LEVEL_MAX = 3, STALE_MS = 15 * 60 * 1000, PREVIEW_S = 3.5, FPS = 24;
const clampL = (n) => Math.max(LEVEL_MIN, Math.min(LEVEL_MAX, n));
const exists = (p) => { try { return fs.existsSync(p); } catch { return false; } };
const rel = (p) => path.relative(process.cwd(), p);
const stateFile = (run) => path.join(run, "look", "energy.json");
const readJ = (f, d) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return d; } };

// a tiny cross-process lock around the state file (the console, the director and a second Redraw press can all arrive at once)
function withState(run, fn) {
  fs.mkdirSync(path.join(run, "look"), { recursive: true });
  const lock = stateFile(run) + ".lock";
  const t0 = Date.now();
  let fd = null;
  while (fd === null) {
    try { fd = fs.openSync(lock, "wx"); } catch {
      try { if (Date.now() - fs.statSync(lock).mtimeMs > 10000) fs.rmSync(lock, { force: true }); } catch { /* gone */ }
      if (Date.now() - t0 > 5000) { fs.rmSync(lock, { force: true }); continue; }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 40);
    }
  }
  try {
    const st = readJ(stateFile(run), {});
    const out = fn(st);
    fs.writeFileSync(stateFile(run), JSON.stringify(st, null, 2) + "\n");
    return out;
  } finally { try { fs.closeSync(fd); } catch { /* closed */ } fs.rmSync(lock, { force: true }); }
}
const entry = (st, label) => (st[label] = st[label] || { level: 0, rendered_level: 0, version: 1, applying: null, requests: [], last: null });

// record one request. Returns { apply: true } to the caller that should render, { queued: true } when a render is already running
// (the request still moves the target level one more step: the running render loop picks it up and goes further).
export function requestEnergy(run, label, value, { now = Date.now() } = {}) {
  const v = String(value || "").toLowerCase();
  const step = /punch|more|up|higher|energ/.test(v) && !/less|calm/.test(v) ? 1 : /calm|less|down|lower|soft/.test(v) ? -1 : 0;
  return withState(run, (st) => {
    const e = entry(st, label);
    e.level = step === 0 && /as.?is|reset|same/.test(v) ? 0 : clampL(e.level + step);
    e.requests.push({ ts: new Date(now).toISOString(), value: v || "as is", level: e.level });
    e.requests = e.requests.slice(-20);
    const busy = !!e.applying && now - e.applying < STALE_MS;
    if (!busy) e.applying = now;
    return { apply: !busy, queued: busy, level: e.level, label, note: busy ? "a redraw is already being applied: this request was queued and pushes the energy one step further" : undefined };
  });
}

// The energy layer, injected into a versioned copy of a page. Runs live in the console iframe too (a rAF ticker keeps the smear following the headline);
// a capture sets __energy.live = false and calls frame() itself after each seek. No Math.random: pure in the DOM state and the timeline time.
const energyScript = (level) => `<script data-energy="layer">(function(){
var L=${Number(level) || 0},doc=document,E=window.__energy={level:L,live:true,ready:false,ghosts:[],facts:{},prev:null};
function rgb(s){var m=String(s||"").match(/rgba?\\(([^)]+)\\)/);if(!m)return null;var p=m[1].split(",").map(parseFloat);return{r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1};}
function sat(c){var mx=Math.max(c.r,c.g,c.b),mn=Math.min(c.r,c.g,c.b);return mx?(mx-mn)/mx:0;}
function texts(){var out=[],w=doc.createTreeWalker(doc.body,NodeFilter.SHOW_ELEMENT),n;while((n=w.nextNode())){if(/^(SCRIPT|STYLE|CANVAS|SVG|DEFS|PATH)$/i.test(n.tagName)||(n.closest&&n.closest("[data-energy]")))continue;var own="";for(var i=0;i<n.childNodes.length;i++)if(n.childNodes[i].nodeType===3)own+=n.childNodes[i].nodeValue;own=own.replace(/\\s+/g," ").trim();if(own.length<2)continue;var cs=getComputedStyle(n);if(cs.visibility==="hidden"||cs.display==="none")continue;var r=n.getBoundingClientRect();if(r.width<4||r.height<4)continue;out.push({el:n,text:own,size:parseFloat(cs.fontSize)||0,rect:r,cs:cs});}return out;}
function mk(css){var d=doc.createElement("div");d.setAttribute("data-energy","layer");d.style.cssText="position:fixed;pointer-events:none;"+css;doc.body.appendChild(d);return d;}
E.init=function(){
 if(E.ready)return E.facts;
 var sp=window.__specimen,tl=sp&&sp.tl,p0=0,wasPaused=true;
 if(tl){try{p0=tl.progress();wasPaused=tl.paused();tl.pause();tl.progress(1);}catch(e){}}
 var T=texts(),mx=0;T.forEach(function(t){if(t.size>mx)mx=t.size;});
 var heads=T.filter(function(t){return t.size>=mx*0.85;}).slice(0,2),smalls=T.filter(function(t){return t.size<=mx*0.3&&t.size>=9;});
 var f=E.facts={mode:L>0?"punchier":L<0?"calmer":"as is",level:L,headline_from_px:Math.round(mx),headline_to_px:Math.round(mx),small_px:smalls[0]?Math.round(smalls[0].size):null,ghosts:0,layers:[]};
 var accent=null,best=-1;
 T.forEach(function(t){[rgb(t.cs.color),rgb(getComputedStyle(t.el).backgroundColor)].forEach(function(c){if(c&&c.a>0.5&&sat(c)>best){best=sat(c);accent=c;}});});
 var hc=heads[0]?rgb(heads[0].cs.color):null;
 var ac=best>0.25&&accent?"rgb("+accent.r+","+accent.g+","+accent.b+")":(hc?"rgb("+hc.r+","+hc.g+","+hc.b+")":"#888"),hcs=hc?"rgb("+hc.r+","+hc.g+","+hc.b+")":ac;
 E.accent=ac;
 var k=L>0?1+0.14*L:1+0.06*L;
 heads.forEach(function(t){var px=t.size*k;t.el.style.fontSize=px+"px";t.el.style.letterSpacing=(-0.012*L)+"em";if(L<0)t.el.style.lineHeight=String(1.1+0.08*Math.abs(L));
  var r=t.el.getBoundingClientRect();if(r.width>innerWidth*0.94){px=px*(innerWidth*0.9/r.width);t.el.style.fontSize=px+"px";}
  if(t===heads[0])f.headline_to_px=Math.round(px);});
 if(L>0)smalls.forEach(function(t){t.el.style.fontSize=Math.max(9,t.size*(1-0.05*L))+"px";});
 if(smalls[0]&&L>0)f.small_px=Math.round(Math.max(9,smalls[0].size*(1-0.05*L)));
 E.head=heads[0]?heads[0].el:null;
 if(L>0){
  var st=mk("inset:0;z-index:2;background:repeating-linear-gradient(104deg,transparent 0 54px,"+ac.replace("rgb","rgba").replace(")",","+(0.05+0.02*L)+")")+" 54px 56px);");st.setAttribute("data-energy","streak");f.layers.push("diagonal streak layer");
  var words=[];smalls.forEach(function(t){if(words.indexOf(t.text)<0&&t.text.length<48)words.push(t.text);});
  if(words.length){var line=words.slice(0,8).join("   /   ").toUpperCase()+"   /   ";
   [["bottom:16px"]].concat(L>=2?[["top:16px"]]:[]).forEach(function(pos,idx){var b=mk("left:0;right:0;"+pos[0]+";z-index:3;overflow:hidden;white-space:nowrap;font:600 13px/1 "+(heads[0]?heads[0].cs.fontFamily:"sans-serif")+";letter-spacing:.22em;color:"+hcs+";opacity:.5;");
    var s=doc.createElement("span");s.style.display="inline-block";s.textContent=new Array(8).join(line);b.appendChild(s);b.setAttribute("data-energy","ticker");E["band"+idx]={el:b,span:s,w:s.scrollWidth/7,dir:idx?1:-1};});
   f.layers.push("edge ticker set in the page's own words");}
  var n=Math.min(4,L+1);
  if(E.head)for(var i=1;i<=n;i++){var g=E.head.cloneNode(true);g.setAttribute("data-energy","ghost");[].forEach.call(g.querySelectorAll("[id]"),function(x){x.removeAttribute("id");});g.removeAttribute("id");
   g.style.cssText+=";position:fixed;margin:0;pointer-events:none;z-index:1;color:transparent;-webkit-text-stroke:1.5px "+ac+";filter:blur("+(i*1.2)+"px);white-space:nowrap;transform:none;";doc.body.appendChild(g);E.ghosts.push({el:g,k:i});}
  f.ghosts=E.ghosts.length;if(f.ghosts)f.layers.push(f.ghosts+" motion-smear echoes of the headline");
 }else if(L<0){doc.documentElement.style.filter="saturate("+(1+0.08*L)+") contrast("+(1+0.03*L)+")";f.layers.push("softer contrast, wider leading");}
 if(tl){try{tl.progress(p0);if(!wasPaused)tl.play();}catch(e){}}
 E.ready=true;return f;};
E.frame=function(){
 if(!E.ready)return;var h=E.head,t=0,sp=window.__specimen;try{t=sp&&sp.tl?sp.tl.time():performance.now()/1000;}catch(e){}
 if(h&&E.ghosts.length){var r=h.getBoundingClientRect(),cs=getComputedStyle(h),vx=E.prev?r.left-E.prev.left:0,vy=E.prev?r.top-E.prev.top:0;E.prev={left:r.left,top:r.top};
  E.ghosts.forEach(function(g){var k=g.k;g.el.style.left=(r.left-k*(10+6*L)-vx*k*1.5)+"px";g.el.style.top=(r.top-vy*k*1.5)+"px";g.el.style.fontSize=cs.fontSize;g.el.style.opacity=String(parseFloat(cs.opacity)*(0.55/k));});}
 ["band0","band1"].forEach(function(n){var b=E[n];if(b)b.span.style.transform="translateX("+(b.dir*((t*90*Math.max(1,L))%Math.max(1,b.w))-(b.dir<0?0:b.w))+"px)";});
};
function loop(){if(E.live){E.frame();requestAnimationFrame(loop);}}
window.addEventListener("load",function(){(doc.fonts&&doc.fonts.ready?doc.fonts.ready:Promise.resolve()).then(function(){setTimeout(function(){E.init();loop();},60);});});
})();</script>`;

function versionedPage(srcHtml, level, forCapture) {
  let html = srcHtml;
  if (forCapture) html = html.replace(GSAP_SRC, '<script src="/__rasanai/gsap.min.js"></script>');
  const tag = energyScript(level);
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, tag + "</body>") : html + tag;
}

// one browser session: poster (+ representative frame) + preview video for one label at one level. Returns the files and the facts the page reported.
async function renderLevel(run, label, level, version, { preview = true } = {}) {
  const dir = path.join(run, "design", label), out = { files: {}, facts: null, notes: [] };
  const specSrc = path.join(dir, "specimen.html");
  if (!exists(specSrc)) throw new Error(`design/${label}/specimen.html is missing`);
  const html = fs.readFileSync(specSrc, "utf8");
  const W = Number((html.match(/data-width="(\d+)"/) || [])[1]) || 1600, H = Number((html.match(/data-height="(\d+)"/) || [])[1]) || 900;
  const vHtml = path.join(dir, `specimen-v${version}.html`);
  fs.writeFileSync(vHtml, versionedPage(html, level, false)); // the live page the console can embed: the energy layer runs in it
  const cap = path.join(dir, `.rasanai-energy-${process.pid}.html`);
  fs.writeFileSync(cap, versionedPage(html, level, true));
  const repSrc = path.join(dir, "frames", "representative.html");
  let repTmp = null;
  if (exists(repSrc)) {
    const rh = fs.readFileSync(repSrc, "utf8");
    if (/Rasan3D\.stage\s*\(/.test(rh)) out.notes.push("the representative frame is a Rasan3D stage: re-drawn by the styleframe designer, not by the energy layer");
    else { repTmp = path.join(dir, "frames", `.rasanai-energy-rep-${process.pid}.html`); fs.writeFileSync(repTmp, versionedPage(rh, level, true)); }
  }
  const srv = await serve(dir);
  const b = await launch({ width: W, height: H, timeoutMs: 60000 });
  const settle = `(function(){var w=function(ms){return new Promise(function(r){setTimeout(r,ms);});};var f=document.fonts&&document.fonts.ready?document.fonts.ready:Promise.resolve();return Promise.race([f,w(8000)]).then(function(){return w(300);}).then(function(){var E=window.__energy;if(E){E.live=false;return E.init();}return null;});})()`;
  try {
    // 1. the poster: mid-move for more energy (the smear needs a moving headline), settled for calmer / as is
    await b.open(`${srv.url}/${path.basename(cap)}`);
    const facts = await b.eval(settle, { await: true });
    out.facts = facts;
    const hasTl = await b.eval(`!!(window.__specimen&&window.__specimen.tl&&window.__specimen.tl.duration)`);
    const park = level > 0 ? 0.6 : 1;
    const seek = (p) => b.eval(`(function(){var tl=window.__specimen&&window.__specimen.tl;if(tl){tl.pause();tl.progress(${p});}if(window.__energy)window.__energy.frame();return 1;})()`);
    if (hasTl) { await seek(Math.max(0, park - 0.04)); await seek(park); } else await b.eval("window.__energy&&window.__energy.frame()");
    await new Promise((r) => setTimeout(r, 150));
    const poster = path.join(dir, `specimen-v${version}.png`);
    fs.writeFileSync(poster, await b.screenshot());
    out.files.poster = poster; out.files.specimen = vHtml;
    out.parked_at = hasTl ? park : null;
    // 2. the short motion preview of the look (the timeline sought frame by frame, so the render is deterministic)
    if (preview && hasTl) {
      const ff = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" });
      if (ff.status !== 0) out.notes.push("no preview: ffmpeg is not installed");
      else {
        const dur = await b.eval(`window.__specimen.tl.duration()`), len = Math.max(1, Math.min(PREVIEW_S, Number(dur) || PREVIEW_S)), n = Math.round(len * FPS);
        const tmp = fs.mkdtempSync(path.join(dir, ".rasanai-loop-"));
        try {
          await seek(0); await b.eval("window.__energy&&(window.__energy.prev=null)");
          for (let i = 0; i < n; i++) {
            await b.eval(`(function(){var tl=window.__specimen.tl;tl.pause();tl.time(${(i / FPS).toFixed(4)});if(window.__energy)window.__energy.frame();return 1;})()`);
            fs.writeFileSync(path.join(tmp, `f${String(i).padStart(4, "0")}.jpg`), await b.screenshot({ format: "jpeg", quality: 88 }));
          }
          const mp4 = path.join(dir, `specimen-loop-v${version}.mp4`);
          const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", path.join(tmp, "f%04d.jpg"), "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4], { encoding: "utf8" });
          if (r.status === 0 && exists(mp4)) { out.files.preview = mp4; out.preview_s = Math.round(len * 10) / 10; } else out.notes.push(`no preview: ffmpeg failed (${String(r.stderr || "").trim().split("\n").pop().slice(0, 120)})`);
        } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
      }
    } else if (preview) out.notes.push("no preview: specimen.html registers no window.__specimen.tl timeline to seek");
    // 3. the representative frame (the same story beat), same energy
    if (repTmp) {
      await b.open(`${srv.url}/frames/${path.basename(repTmp)}`);
      await b.eval(settle, { await: true });
      await b.eval(`(function(){var L=window.__timelines||{};Object.keys(L).forEach(function(k){try{L[k].pause();L[k].progress(${level > 0 ? 0.6 : 1});}catch(e){}});if(window.__energy)window.__energy.frame();return 1;})()`);
      await new Promise((r) => setTimeout(r, 150));
      const rep = path.join(dir, "frames", `representative-v${version}.png`);
      fs.writeFileSync(rep, await b.screenshot());
      out.files.frame = rep;
    }
    return out;
  } finally {
    await b.close(); await srv.close();
    fs.rmSync(cap, { force: true }); if (repTmp) fs.rmSync(repTmp, { force: true });
  }
}

const describe = (level, facts, out) => {
  const bits = [];
  const f = facts || {};
  if (level > 0) {
    bits.push(`Energy +${level} (punchier): ${f.headline_from_px && f.headline_to_px && f.headline_to_px !== f.headline_from_px ? `headline ${f.headline_from_px}px to ${f.headline_to_px}px` : "headline scaled up"}${f.small_px ? ` against ${f.small_px}px small type (more scale contrast)` : ""}`);
    if (f.layers && f.layers.length) bits.push(`added ${f.layers.join(", ")}`);
    if (out.parked_at) bits.push("the poster is a mid-move frame, not the settled one");
  } else if (level < 0) bits.push(`Energy ${level} (calmer): headline ${f.headline_from_px}px to ${f.headline_to_px}px, wider leading, softer contrast and saturation, no echoes or streaks; the poster is the settled frame`);
  else bits.push("Energy as is: the original composition, re-drawn to a new file so the old picture is not shown from cache");
  bits.push(`new poster ${out.files.poster ? path.basename(out.files.poster) : "none"}${out.files.frame ? ` and frame ${path.basename(out.files.frame)}` : ""}`);
  if (out.files.preview) bits.push(`${out.preview_s || PREVIEW_S} s motion preview ${path.basename(out.files.preview)}`);
  if (out.notes.length) bits.push(out.notes.join("; "));
  return bits.join("; ") + ".";
};

// apply the recorded level: render, bump the version, and loop while a queued request moved the target again. Only the caller that got { apply: true } calls this.
export async function applyEnergy(run, label, { preview = true } = {}) {
  const done = [];
  for (let pass = 0; pass < 6; pass++) {
    const e = withState(run, (st) => ({ ...entry(st, label) }));
    if (pass > 0 && e.level === e.rendered_level) break;
    const version = (e.version || 1) + 1, level = e.level;
    let out;
    try { out = await renderLevel(run, label, level, version, { preview }); }
    catch (err) { withState(run, (st) => { entry(st, label).applying = null; }); throw err; }
    const changes = describe(level, out.facts, out);
    withState(run, (st) => { const x = entry(st, label); x.version = version; x.rendered_level = level; x.last = { level, version, ts: new Date().toISOString(), changes, files: Object.fromEntries(Object.entries(out.files).map(([k, v]) => [k, rel(v)])) }; });
    done.push({ level, version, changes, files: out.files });
  }
  withState(run, (st) => { entry(st, label).applying = null; });
  return done;
}

// project the recorded versions into a look payload: new poster / specimen / representative frame / preview paths and a concrete `changes` line
export function applyEnergyToPayload(run, pl, { label } = {}) {
  const st = readJ(stateFile(run), {});
  const lines = [];
  for (const s of pl.styles || []) {
    const e = st[s.label], last = e && e.last;
    if (!last || !last.files) continue;
    const f = last.files;
    if (f.poster && exists(path.resolve(f.poster))) s.poster = f.poster;
    if (f.specimen && exists(path.resolve(f.specimen))) s.specimen = f.specimen;
    if (f.preview && exists(path.resolve(f.preview))) s.preview = f.preview;
    if (f.frame && exists(path.resolve(f.frame)) && Array.isArray(s.frames)) s.frames = s.frames.map((x) => (x.id === "representative" ? { ...x, image: f.frame } : x));
    s.energy = { level: e.level, version: last.version };
    if (!label || label === s.label) lines.push(`${s.label}: ${last.changes}`);
  }
  if (lines.length) pl.changes = lines.join(" ");
  return pl;
}
