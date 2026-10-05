#!/usr/bin/env node
// Obedience check: does the BUILT composition move the way motion.md says?
//
// Loads every composition HTML in headless Chrome (the same GSAP the render
// uses), walks every tween on every registered timeline, samples each tween's
// real start/end values by seeking the paused timeline, classifies it
// (enter / exit / move / camera / exempt) and checks it against motion.md: duration
// scale, ease set, stagger, holds, and banned-pattern signatures.
// Signatures and rules: references/motion-md-contract.md.
//
// usage: node obey.mjs --project videos/<name> [--motion <path>] [--json]
//        node obey.mjs waive --project videos/<name> --rule <rule> [--target "<target>"]
// exit 0 = clean (warnings allowed), 2 = violations, 1 = could not run (nothing
// was checked: Chrome failed, a script error, no tweens). Exit 1 is never a pass.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs, die, readFrontmatterDoc, parseEase, chromeDumpDom, GSAP_PATH } from "./lib/common.mjs";
import { classify, SIGNATURES, bannedHits } from "./lib/signatures.mjs";
import { track } from "./lib/report.mjs";

const args = parseArgs();
track("Checking the motion against your motion rules", "Motion check done");
const project = path.resolve(args.project || ".");
const motionPath = path.resolve(args.motion || path.join(project, "motion.md"));
if (!fs.existsSync(motionPath)) die(`motion.md not found at ${motionPath}`);
let M;
try {
  M = readFrontmatterDoc(fs.readFileSync(motionPath, "utf8")).fields;
} catch (e) {
  die(`cannot read ${motionPath}: ${e.message}`);
}

// `node obey.mjs waive --project <dir> --rule <rule> [--target "<target as printed>"]`
// records a user-approved waiver in motion.md without hand-editing the frontmatter.
if (args._[0] === "waive") {
  if (!args.rule) die("waive needs --rule (exactly as obey printed it, e.g. banned:overshoot)");
  if (["no-tweens", "could-not-run"].includes(args.rule)) die(`"${args.rule}" means nothing was checked; it cannot be waived`);
  const text = fs.readFileSync(motionPath, "utf8").replace(/\r\n/g, "\n");
  const list = Array.isArray(M.waivers) ? M.waivers : [];
  const entry = args.target && args.target !== true ? { rule: args.rule, target: String(args.target) } : { rule: args.rule };
  list.push(entry);
  const line = `waivers: ${JSON.stringify(list)}`;
  // function replacements: a target containing "$'" or "$$" must be inserted literally
  const next = /^waivers:.*$/m.test(text) ? text.replace(/^waivers:.*$/m, () => line) : text.replace(/\n---\n/, () => `\n${line}\n---\n`);
  fs.writeFileSync(motionPath, next);
  console.log(JSON.stringify({ waived: entry, motion: motionPath, waivers: list }));
  process.exit(0);
}
if (M.waivers !== undefined && !Array.isArray(M.waivers)) die(`motion.md "waivers" must be a one-line JSON array (got ${JSON.stringify(M.waivers)}). Use: node obey.mjs waive --project <dir> --rule <rule> [--target <target>]`);
const TOL = 0.15;

// ---------------------------------------------------------------------------
// 1. collect composition files
function collect(dir, out = []) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", "renders", "snapshots", ".superseded", ".git", "assets", ".media"].includes(f.name)) continue;
    const p = path.join(dir, f.name);
    if (f.isDirectory()) collect(p, out);
    else if (f.name.endsWith(".html") && !f.name.startsWith("__")) out.push(p);
  }
  return out;
}
// In a multi-scene project the workflow assembles the root index.html (between-frame
// transitions from its registry) and compositions/captions.html (the caption skin):
// those follow the storyboard's transition_in and the look, not the motion grammar,
// so only the frames themselves are checked.
const multiScene = fs.existsSync(path.join(project, "compositions", "frames"));
const skipped = [];
const files = collect(project).filter((f) => {
  if (!/data-composition-id|__timelines/.test(fs.readFileSync(f, "utf8"))) return false;
  const rel = path.relative(project, f);
  if (multiScene && (rel === "index.html" || rel === path.join("compositions", "captions.html"))) {
    skipped.push(rel);
    return false;
  }
  return true;
});
if (!files.length) die(`no composition HTML found under ${project}`);

// ---------------------------------------------------------------------------
// 2. browser-side walker
const WALKER = `
(function(){
  var PROPS=["opacity","autoAlpha","x","y","xPercent","yPercent","scale","scaleX","scaleY","rotation","skewX","filter","clipPath","letterSpacing"];
  var SKIP={duration:1,ease:1,delay:1,stagger:1,repeat:1,yoyo:1,repeatDelay:1,onUpdate:1,onComplete:1,onStart:1,immediateRender:1,overwrite:1,parent:1,startAt:1,runBackwards:1,transformOrigin:1,keyframes:1,paused:1,data:1,id:1,callbackScope:1,lazy:1,inherit:1,yoyoEase:1,snap:1,modifiers:1,force3D:1,clearProps:1,onReverseComplete:1,onRepeat:1,onInterrupt:1};
  function label(n){
    if(!n||!n.nodeType) return "(object)";
    if(n.id) return "#"+n.id;
    var c=(n.className&&typeof n.className==="string")?"."+n.className.trim().split(/\\s+/)[0]:"";
    var txt=(n.textContent||"").trim().slice(0,18);
    var par=n.parentElement, idx=par?[].indexOf.call(par.children,n):0;
    return n.tagName.toLowerCase()+c+":"+idx+(txt?' "'+txt+'"':"");
  }
  function rel(t,root){var s=t.startTime(),p=t.parent;while(p&&p!==root){s+=p.startTime();p=p.parent;}return s;}
  var DEF=gsap.parseEase(gsap.defaults().ease);
  function easeName(v){
    var e=v.ease;
    if(e===undefined||e===null||e===DEF) return null;
    if(typeof e==="function") return "__custom";
    return String(e);
  }
  var out={tweens:[],errors:[]};
  try{
    var T=window.__timelines||{};
    Object.keys(T).forEach(function(id){
      var root=T[id]; if(!root||!root.getChildren) return;
      var kids=root.getChildren(true,true,false);
      kids.forEach(function(t){
        var v=Object.assign({}, t.vars||{});
        if(v.css&&typeof v.css==="object"){ Object.keys(v.css).forEach(function(k){ v[k]=v.css[k]; }); delete v.css; }
        if(v.startAt&&v.startAt.css){ v.startAt=Object.assign({}, v.startAt, v.startAt.css); delete v.startAt.css; }
        var targets=(t.targets?t.targets():[]);
        var el=targets[0];
        var keys=Object.keys(v).filter(function(k){return !SKIP[k] && typeof v[k]!=="function";});
        if(v.startAt) Object.keys(v.startAt).forEach(function(k){ if(keys.indexOf(k)<0 && !SKIP[k]) keys.push(k); });
        var kfSteps=null;
        if(Array.isArray(v.keyframes)){ kfSteps=[]; v.keyframes.forEach(function(kf){ Object.keys(kf).forEach(function(k){ if(!SKIP[k]&&keys.indexOf(k)<0) keys.push(k); }); if(typeof kf.duration==="number"&&kf.duration>0) kfSteps.push(kf.duration); }); }
        else if(v.keyframes&&typeof v.keyframes==="object"){ Object.keys(v.keyframes).forEach(function(k){ if(!SKIP[k]&&k!=="easeEach"&&keys.indexOf(k)<0) keys.push(k); }); }
        var start=rel(t,root), dur=t.duration();
        var from={}, to={};
        var isEl=!!(el&&el.nodeType===1);
        if(isEl){
          var sample=keys.filter(function(k){return PROPS.indexOf(k)>-1;});
          // keyframes arrays often open with a zero-duration step that only renders just after t=start
          var t0 = v.keyframes ? start + Math.min(0.002, dur / 100) : start;
          try{ root.seek(t0,false); sample.forEach(function(k){ from[k]=gsap.getProperty(el,k); }); }catch(e){}
          try{ root.seek(start+dur,false); sample.forEach(function(k){ to[k]=gsap.getProperty(el,k); }); }catch(e){}
        }
        var st=v.stagger, each=null;
        if(typeof st==="number") each=st; else if(st&&typeof st==="object"){ if(typeof st.each==="number") each=st.each; else if(typeof st.amount==="number"&&targets.length>1) each=st.amount/(targets.length-1); }
        out.tweens.push({tl:id,start:+start.toFixed(4),dur:+dur.toFixed(4),repeat:t.repeat?t.repeat():0,ease:easeName(v),keys:keys,from:from,to:to,isEl:isEl,nTargets:targets.length,target:label(el),stagger:each,kfSteps:kfSteps,camera:!!(isEl&&el.closest&&el.closest('[data-obey="camera"]'))});
      });
      root.seek(0,false);
    });
  }catch(e){ out.errors.push(String(e&&e.message||e)); }
  out.cameraContent=[];
  try{ [].forEach.call(document.querySelectorAll('[data-obey="camera"]'),function(c){
    var w=document.createTreeWalker(c,NodeFilter.SHOW_TEXT,null),n,hit=null;
    while((n=w.nextNode())){ var pn=n.parentNode&&n.parentNode.tagName; if(pn==="SCRIPT"||pn==="STYLE") continue; if(n.nodeValue.trim()){ hit=n.nodeValue.trim().slice(0,24); break; } }
    if(hit) out.cameraContent.push(label(c)+' "'+hit+'"');
  }); }catch(e){}
  var pre=document.createElement("pre"); pre.id="__obey"; pre.textContent=JSON.stringify(out); document.body.appendChild(pre);
})();`;

function runFile(file) {
  let html = fs.readFileSync(file, "utf8");
  html = html.replace(/<template[^>]*>/gi, "").replace(/<\/template>/gi, "");
  // same GSAP, offline-safe: point any CDN copy at the vendored file
  html = html.replace(/<script[^>]+src=["'][^"']*gsap(?:\.min)?\.js["'][^>]*><\/script>/gi, `<script src="file://${GSAP_PATH}"></script>`);
  const base = `<base href="file://${path.dirname(file)}/">`;
  // A templated sub-composition gets GSAP from its host; loaded alone it would
  // never build its timeline (and would falsely look clean). Provide it.
  const gsapTag = /gsap(\.min)?\.js/.test(html) ? "" : `<script src="file://${GSAP_PATH}"></script>`;
  const shim = `${gsapTag}<script>window.__timelines=window.__timelines||{};</script>`;
  if (/<head[^>]*>/i.test(html)) html = html.replace(/<head[^>]*>/i, (m) => `${m}${base}${shim}`);
  else html = `${base}${shim}${html}`;
  const walker = `<script>${WALKER}</script>`;
  html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${walker}</body>`) : html + walker;
  const tmp = path.join(os.tmpdir(), `md-obey-${process.pid}-${Math.random().toString(36).slice(2)}.html`);
  fs.writeFileSync(tmp, html);
  try {
    let dom;
    try {
      dom = chromeDumpDom(tmp, 10000);
    } catch (e) {
      return { tweens: [], errors: [], fatal: `headless Chrome failed on ${path.basename(file)}: ${String(e.message || e).split("\n")[0]}` };
    }
    const m = dom.match(/<pre id="__obey">([\s\S]*?)<\/pre>/);
    if (!m) return { tweens: [], errors: [], fatal: "walker produced no output (a script error stopped the page before the timeline registered?)" };
    const txt = m[1].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
    return JSON.parse(txt);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

// ---------------------------------------------------------------------------
// 3. classification + rules
const scale = (M.tempo && M.tempo.scale_ms) || [];
const easeSet = M.easing || {};
const banned = M.banned || [];
const waivers = M.waivers || [];
const unknownBans = banned.filter((b) => !SIGNATURES[b]);

function onScale(ms) {
  return scale.some((s) => Math.abs(ms - s) <= s * TOL);
}
function waived(rule, target) {
  return waivers.some((w) => (typeof w === "string" ? w === rule : w.rule === rule && (!w.target || w.target === target)));
}

const findings = [];
const couldNotRun = [];
const report = { project, motion: motionPath, files: [], skipped, errors: 0, warnings: 0, waived: 0, tweens: 0, exempt: 0 };
const add = (f) => {
  if (waived(f.rule, f.target)) {
    report.waived++;
    f.waived = true;
  } else if (f.severity === "error") report.errors++;
  else report.warnings++;
  findings.push(f);
};

if (unknownBans.length) add({ severity: "error", rule: "unknown-ban", file: motionPath, message: `motion.md bans ${unknownBans.join(", ")} but no machine signature exists for them`, fix: "remove them or add a signature in scripts/lib/signatures.mjs + motion-md-contract.md" });

for (const file of files) {
  const rel = path.relative(project, file);
  const text = fs.readFileSync(file, "utf8");
  if (/@keyframes\s/.test(text) || /\banime\s*\(/.test(text) || /\.animate\s*\(\s*\[/.test(text)) {
    add({ severity: "error", rule: "non-gsap", file: rel, message: "CSS @keyframes / anime.js / WAAPI motion found; motion.md requires GSAP only", fix: "port that motion to the GSAP timeline" });
  }
  const res = runFile(file);
  report.files.push({ file: rel, tweens: res.tweens.length, walkerErrors: res.errors });
  // could-not-run problems are not motion violations: they are never waivable
  // and make obey exit 1 so nobody "repairs" a composition that is fine
  if (res.fatal) couldNotRun.push(`${rel}: ${res.fatal}`);
  res.errors.forEach((e) => couldNotRun.push(`${rel}: script error while walking the timeline: ${e}`));
  if (!res.fatal && !res.tweens.length && /\.(to|from|fromTo)\s*\(/.test(text))
    couldNotRun.push(`${rel}: defines GSAP tweens but none were found at runtime (timeline not registered synchronously on window.__timelines, or a script error)`);

  for (const c of res.cameraContent || []) add({ severity: "error", rule: "camera-on-content", file: rel, target: c, message: 'an element marked data-obey="camera" contains text; camera is for frames and plates, not content', fix: 'remove data-obey="camera" from it (text and UI follow the scale), or move the text out of the camera wrapper' });
  const byTarget = {};
  for (const t of res.tweens) {
    report.tweens++;
    // GSAP's duration() on a staggered tween includes the stagger spread; rules
    // apply to each element's own tween.
    if (t.stagger && t.nTargets > 1) t.dur = Math.max(0, +(t.dur - t.stagger * (t.nTargets - 1)).toFixed(4));
    const cls = classify(t);
    t.cls = cls;
    if (cls === "exempt") {
      report.exempt++;
      continue;
    }
    if (cls === "camera") {
      const where = { file: rel, timeline: t.tl, target: t.target, at: `${t.start.toFixed(2)}s`, dur_ms: Math.round(t.dur * 1000), ease: t.ease, class: cls };
      const move = easeSet.move;
      const pe = parseEase(t.ease === "__custom" ? "custom" : t.ease);
      const okCam = [move, "sine.inOut", "power1.inOut", "none"].filter(Boolean).some((e) => parseEase(e).family === pe.family && (pe.family === "none" || parseEase(e).dir === pe.dir));
      if (t.ease === "__custom") add({ severity: "error", rule: "custom-ease", ...where, message: "ease is a function, so it cannot be verified against motion.md", fix: `use ${move || "a named ease"}` });
      else if (pe.family === "implicit") add({ severity: "error", rule: "implicit-ease", ...where, message: "no explicit ease on a camera move", fix: `set ease: "${move || "sine.inOut"}"` });
      else if (!okCam) add({ severity: "error", rule: "ease-outside-set", ...where, message: `camera ease ${t.ease} is not motion.md's move ease (${move}) or sine.inOut / power1.inOut / none`, fix: `use ease: "${move || "sine.inOut"}"` });
      if (t.dur < 1.0) add({ severity: "error", rule: "camera-too-short", ...where, message: `a camera move lasts its shot: ${Math.round(t.dur * 1000)}ms is under 1000ms`, fix: 'a short move is UI motion: drop data-obey="camera" and put it on the duration scale' });
      for (const b of bannedHits(t, cls, banned)) add({ severity: "error", rule: `banned:${b}`, ...where, message: `matches the banned pattern "${b}"`, fix: "replace it with a plain camera move" });
      continue;
    }
    const where = { file: rel, timeline: t.tl, target: t.target, at: `${t.start.toFixed(2)}s`, dur_ms: Math.round(t.dur * 1000), ease: t.ease, class: cls };
    const pe = parseEase(t.ease === "__custom" ? "custom" : t.ease);

    if (t.ease === "__custom") {
      add({ severity: "error", rule: "custom-ease", ...where, message: "ease is a function (CustomEase / parseEase / inline), so it cannot be verified against motion.md", fix: `use the named ease "${easeSet[cls] || easeSet.enter}"` });
    } else if (pe.family === "implicit") {
      add({ severity: "error", rule: "implicit-ease", ...where, message: "no explicit ease (falls back to GSAP's default power1.out, the generic look)", fix: `set ease: "${easeSet[cls] || easeSet.enter}"` });
    } else {
      const inSet = Object.values(easeSet).some((e) => parseEase(e).family === pe.family && parseEase(e).dir === pe.dir);
      if (!inSet) add({ severity: "error", rule: "ease-outside-set", ...where, message: `ease ${t.ease} is not one of motion.md's eases (${Object.values(easeSet).join(", ")})`, fix: `use ease: "${easeSet[cls]}"` });
      else if (easeSet[cls] && !(parseEase(easeSet[cls]).family === pe.family && parseEase(easeSet[cls]).dir === pe.dir))
        add({ severity: "warning", rule: "ease-class-mismatch", ...where, message: `${cls} tween uses ${t.ease}; motion.md's ${cls} ease is ${easeSet[cls]}`, fix: `use ease: "${easeSet[cls]}"` });
    }
    // keyframes:[...] steps are each a tween segment; their own durations must be on the scale
    for (const d of t.kfSteps || []) {
      if (scale.length && !onScale(d * 1000)) add({ severity: "error", rule: "duration-off-scale", ...where, dur_ms: Math.round(d * 1000), message: `keyframes step of ${Math.round(d * 1000)}ms is not within ±15% of the scale ${scale.join("/")}`, fix: "retime that keyframes step to a scale value" });
    }
    const ms = t.dur * 1000;
    if (!(t.kfSteps && t.kfSteps.length) && scale.length && !onScale(ms)) {
      const nearest = scale.reduce((a, b) => (Math.abs(b - ms) < Math.abs(a - ms) ? b : a));
      add({ severity: "error", rule: "duration-off-scale", ...where, message: `${Math.round(ms)}ms is not within ±15% of the scale ${scale.join("/")}`, fix: `duration: ${nearest / 1000}` });
    }
    if (t.stagger !== null && M.stagger && M.stagger.each_ms) {
      const each = t.stagger * 1000, want = M.stagger.each_ms;
      if (Math.abs(each - want) > want * TOL) add({ severity: "warning", rule: "stagger-off", ...where, message: `stagger ${Math.round(each)}ms vs motion.md ${want}ms`, fix: `stagger: ${want / 1000}` });
    }
    for (const b of bannedHits(t, cls, banned)) add({ severity: "error", rule: `banned:${b}`, ...where, message: `matches the banned pattern "${b}"`, fix: `replace with one of motion.md's entrances (${(M.entrances || []).join(", ")}) using its eases` });
    (byTarget[`${t.tl}|${t.target}`] = byTarget[`${t.tl}|${t.target}`] || []).push(t);
  }

  // holds: enter end -> next exit start, per element
  const minHold = (M.holds && M.holds.min_ms) || 0;
  if (minHold) {
    for (const list of Object.values(byTarget)) {
      list.sort((a, b) => a.start - b.start);
      for (let i = 0; i < list.length; i++) {
        if (list[i].cls !== "enter") continue;
        const ex = list.slice(i + 1).find((x) => x.cls === "exit");
        if (!ex) continue;
        const hold = (ex.start - (list[i].start + list[i].dur)) * 1000;
        if (hold < minHold * (1 - TOL))
          add({ severity: "warning", rule: "hold-too-short", file: rel, timeline: list[i].tl, target: list[i].target, at: `${(list[i].start + list[i].dur).toFixed(2)}s`, message: `held ${Math.round(hold)}ms; motion.md wants >= ${minHold}ms`, fix: `move the exit later by ${Math.round(minHold - hold)}ms` });
      }
    }
  }
}

if (!report.tweens && !couldNotRun.length) couldNotRun.push("no GSAP tweens found in any composition: nothing was checked (run obey after the build writes compositions/index.html)");
report.could_not_run = couldNotRun;
report.status = couldNotRun.length ? "could-not-run" : report.errors ? "violations" : "clean";
if (args.json) {
  console.log(JSON.stringify({ ...report, findings }, null, 2));
} else {
  console.log(`obey: ${report.status} — ${report.tweens} tweens (${report.exempt} exempt) in ${report.files.length} file(s); ${report.errors} error(s), ${report.warnings} warning(s), ${report.waived} waived`);
  for (const f of findings) {
    const tag = f.waived ? "WAIVED" : f.severity.toUpperCase();
    console.log(`  [${tag}] ${f.rule} ${f.file || ""}${f.target ? ` ${f.target}` : ""}${f.at ? ` @${f.at}` : ""}${f.dur_ms !== undefined ? ` ${f.dur_ms}ms` : ""}${f.ease ? ` ease=${f.ease}` : ""}\n      ${f.message}\n      fix: ${f.fix}`);
  }
}
if (couldNotRun.length && !args.json) couldNotRun.forEach((c) => console.log(`  [COULD NOT RUN] ${c}`));
process.exit(couldNotRun.length ? 1 : report.errors ? 2 : 0);
