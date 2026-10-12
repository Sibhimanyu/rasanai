#!/usr/bin/env node
// Obedience check: does the BUILT composition move the way motion.md says?
//
// Loads every composition HTML in headless Chrome (the same GSAP the render
// uses), walks every tween on every registered timeline, samples each tween's
// real start/end values by seeking the paused timeline, classifies it
// (enter / exit / move / camera / exempt) and checks it against motion.md's fluent contract:
// explicit eases, the curve mix (4+ families, no curve or duration on more than 40% of gestures),
// no even staggers or metronomic cascades, settles within the overshoot budget, holds, and the
// banned-pattern signatures. Each ease is SAMPLED, so a cubic-bezier, a spring or a CustomEase is
// judged by its shape, not its name. The uniform pattern (one ease, one duration, one stagger) is the
// tell R5 measured; it is what this check fails.
// Signatures and rules: references/motion-md-contract.md.
//
// usage: node obey.mjs --project videos/<name> [--motion <path>] [--run <run> | --score <score.json>] [--json]
//        (--run / --score: the score's `budget` lets a banned hero effect (overshoot, blur-in, scale-pop, glow) through
//         on its named target, up to the per-film limit; lib/budget.mjs)
//        node obey.mjs waive --project videos/<name> --rule <rule> [--target "<target>"]
// exit 0 = clean (warnings allowed), 2 = violations, 1 = could not run (nothing
// was checked: Chrome failed, a script error, no tweens). Exit 1 is never a pass.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs, die, readFrontmatterDoc, parseEase, chromeDumpDom, GSAP_PATH } from "./lib/common.mjs";
import { classify, SIGNATURES, bannedHits, num } from "./lib/signatures.mjs";
import { shapeOf } from "./lib/fluent.mjs";
import { readBudget, budgetLimit, effectOf } from "./lib/budget.mjs";
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
    if(typeof e==="function") return e.rasanCurve?"rasan:"+e.rasanCurve:"__custom";
    return String(e);
  }
  function samples(t,v){
    try{ var f=t._ease||(v.ease&&typeof v.ease!=="string"?v.ease:gsap.parseEase(v.ease||gsap.defaults().ease)); if(typeof f!=="function") return null;
      var a=[]; for(var i=0;i<=200;i++){ a.push(Math.round(f(i/200)*10000)/10000); } return a; }catch(e){ return null; }
  }
  var out={tweens:[],errors:[]};
  var rootEl=document.querySelector("[data-composition-id][data-width]");
  out.width=rootEl?+rootEl.getAttribute("data-width"):1920;
  out.mixOff=!!document.querySelector('[data-obey-mix="off"]');
  out.clock=0;
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
        var st=v.stagger, each=null, evenStagger=false;
        if(typeof st==="number"){ each=st; evenStagger=true; }
        else if(st&&typeof st==="object"){ if(typeof st.each==="number") each=st.each; else if(typeof st.amount==="number"&&targets.length>1) each=st.amount/(targets.length-1); evenStagger=!st.ease&&st.from!=="random"&&!st.grid; }
        if(!isEl&&typeof v.onUpdate==="function"&&dur>=1) out.clock++;
        out.tweens.push({tl:id,start:+start.toFixed(4),dur:+dur.toFixed(4),repeat:t.repeat?t.repeat():0,ease:easeName(v),keys:keys,from:from,to:to,isEl:isEl,nTargets:targets.length,target:label(el),stagger:each,evenStagger:evenStagger&&targets.length>=4,curve:isEl&&dur>0?samples(t,v):null,kfSteps:kfSteps,camera:!!(isEl&&el.closest&&el.closest('[data-obey="camera"]'))});
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
// 3. classification + rules (the fluent contract: references/motion-md-contract.md)
const banned = M.banned || [];
const waivers = M.waivers || [];
const unknownBans = banned.filter((b) => !SIGNATURES[b]);
const MIX = { min_gestures: 12, min_families: 4, max_share: 0.4, max_duration_share: 0.4, ...(M.mix || {}) };
const BUDGET = M.overshoot || (banned.includes("overshoot") ? { share: 0, max_pct: 0 } : { share: 0.15, max_pct: 8 });
const FPS = 30;
// effect budgets (W4, lib/budget.mjs): a banned hero effect passes on the target the score names, up to the film's limit
let SCORE = null;
try { SCORE = args.score && args.score !== true ? JSON.parse(fs.readFileSync(path.resolve(String(args.score)), "utf8")) : args.run && args.run !== true ? JSON.parse(fs.readFileSync(path.join(path.resolve(String(args.run)), "motion", "score.json"), "utf8")) : null; } catch { SCORE = null; }
const BUDGETS = SCORE ? readBudget(SCORE) : [];
const LIMIT = budgetLimit(SCORE && SCORE.duration);
const budgetUsed = {};
// true when this banned hit is a budgeted hero use (and counts it); past the limit it is the uniform tell again
function onBudget(b, t) {
  const eff = effectOf(b);
  if (!eff || /fade/.test(b)) return false;
  const entry = BUDGETS.find((e) => e.effect === eff && String(e.target || e.hero || "").trim() && (t.target === String(e.target || e.hero).trim() || String(t.target).includes(String(e.target || e.hero).trim())));
  if (!entry) return false;
  budgetUsed[eff] = (budgetUsed[eff] || 0) + 1;
  return budgetUsed[eff] <= LIMIT;
}
const budgeted = [];

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
const easeLabel = (t) => (t.ease && t.ease.startsWith("rasan:") ? t.ease.slice(6) : t.ease === "__custom" ? "a custom ease" : t.ease);

if (unknownBans.length) add({ severity: "error", rule: "unknown-ban", file: motionPath, message: `motion.md bans ${unknownBans.join(", ")} but no machine signature exists for them`, fix: "remove them or add a signature in scripts/lib/signatures.mjs + motion-md-contract.md" });

const gestures = []; // every enter / exit / move tween in every checked file: the film's motion, for the mix rules
let mixOff = false, width = 1920, clocks = [];
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
  if (res.mixOff) mixOff = true;
  if (res.width) width = res.width;
  const byTarget = {};
  let seen = 0;
  for (const t of res.tweens) {
    report.tweens++;
    // GSAP's duration() on a staggered tween includes the stagger spread; rules
    // apply to each element's own tween.
    if (t.stagger && t.nTargets > 1) t.dur = Math.max(0, +(t.dur - t.stagger * (t.nTargets - 1)).toFixed(4));
    const cls = classify(t);
    t.cls = cls;
    t.shape = t.curve ? shapeOf(t.curve) : null;
    if (cls === "exempt") {
      report.exempt++;
      continue;
    }
    seen++;
    const where = { file: rel, timeline: t.tl, target: t.target, at: `${t.start.toFixed(2)}s`, dur_ms: Math.round(t.dur * 1000), ease: easeLabel(t), class: cls };
    const pe = parseEase(t.ease && (t.ease === "__custom" || t.ease.startsWith("rasan:")) ? "custom" : t.ease);
    if (pe.family === "implicit") add({ severity: "error", rule: "implicit-ease", ...where, message: "no explicit ease (falls back to GSAP's default power1.out, the generic look)", fix: `name the curve for this move's role (motion.md curves: ${Object.keys(M.curves || {}).join(", ") || "launch, glide, settle, exit, drift"}), or use RasanMotion` });
    if (cls === "camera") {
      if (t.dur < 1.0) add({ severity: "error", rule: "camera-too-short", ...where, message: `a camera move lasts its shot: ${Math.round(t.dur * 1000)}ms is under 1000ms`, fix: 'a short move is UI motion: drop data-obey="camera" from it' });
      for (const b of bannedHits(t, cls, banned)) add({ severity: "error", rule: `banned:${b}`, ...where, message: `matches the banned pattern "${b}"`, fix: "replace it with a plain camera move" });
      continue;
    }
    for (const b of bannedHits(t, cls, banned)) if (onBudget(b, t)) budgeted.push({ effect: effectOf(b), target: t.target, file: rel, at: where.at }); else add({ severity: "error", rule: `banned:${b}`, ...where, message: `matches the banned pattern "${b}"${effectOf(b) && budgetUsed[effectOf(b)] > LIMIT ? ` (${budgetUsed[effectOf(b)]} uses: over the film's budget of ${LIMIT}, the uniform tell)` : ""}`, fix: `a hero effect needs a score.budget entry {effect, scene, target, reason} (at most ${LIMIT} per film); otherwise use one of motion.md's entrances (${(M.entrances || []).join(", ")}) or RasanMotion.enter (mask, wipe, scale, focus, fly)` });
    if (t.shape && t.shape.overshoot_pct > 0 && BUDGET.share > 0 && t.shape.overshoot_pct > BUDGET.max_pct * 1.5) add({ severity: "warning", rule: "overshoot-too-big", ...where, message: `overshoots ${t.shape.overshoot_pct}% of its travel; motion.md's settle budget is ${BUDGET.max_pct}% at most`, fix: `a gentler settle (spring(0.68,12) is about 5%), or RasanMotion.land` });
    gestures.push({ ...t, rel, where });
    (byTarget[`${t.tl}|${t.target}`] = byTarget[`${t.tl}|${t.target}`] || []).push(t);
  }
  if (res.clock && !seen) clocks.push(rel);

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
        if (hold < minHold * 0.85)
          add({ severity: "warning", rule: "hold-too-short", file: rel, timeline: list[i].tl, target: list[i].target, at: `${(list[i].start + list[i].dur).toFixed(2)}s`, message: `on screen ${Math.round(hold)}ms before it leaves; motion.md's reading time is >= ${minHold}ms`, fix: `move the exit later by ${Math.round(minHold - hold)}ms` });
      }
    }
  }
}
for (const c of clocks) add({ severity: "warning", rule: "opaque-motion", file: c, message: "the motion lives in a render(t) function driven by one clock tween, which obey cannot see", fix: "the fluency gate on the draft (motion-gate.mjs --video) is the judge of this file; prefer real tweens or RasanMotion so the mix is checked here too" });

// ---- the mix: the uniform pattern is the tell (R5). Judged on the whole film once it has enough gestures; a preview
// page (data-obey-mix="off", the tasting swatches) shows one language's signature and is not judged.
const mix = { gestures: gestures.length, judged: false };
report.mix = mix;
if (budgeted.length) report.budgeted = budgeted;
if (mixOff) mix.note = 'data-obey-mix="off": a preview page, the mix is not judged';
else if (gestures.length < MIX.min_gestures) mix.note = `${gestures.length} gestures (the mix is judged from ${MIX.min_gestures})`;
else {
  mix.judged = true;
  const n = gestures.length;
  const shaped = gestures.filter((g) => g.shape);
  const byKey = {}, byFam = {};
  for (const g of shaped) { (byKey[g.shape.key] = byKey[g.shape.key] || []).push(g); byFam[g.shape.family] = (byFam[g.shape.family] || 0) + 1; }
  const top = Object.values(byKey).sort((a, b) => b.length - a.length)[0] || [];
  mix.dominant_share = shaped.length ? +(top.length / shaped.length).toFixed(2) : null;
  mix.families = byFam;
  const names = [...new Set(top.map((g) => easeLabel(g)))].slice(0, 3).join(", ");
  if (shaped.length && top.length / shaped.length > MIX.max_share) add({ severity: "error", rule: "dominant-ease", file: top[0].rel, message: `one curve (${names}) moves ${top.length} of ${shaped.length} gestures (${Math.round((top.length / shaped.length) * 100)}%; ${Math.round(MIX.max_share * 100)}% at most): every move has the same shape, the strongest machine tell`, fix: `give each kind of move its own curve: launch for entrances, glide or expressive for repositions, settle for hero landings, exit for leaves, drift for the camera (motion.md curves; RasanMotion picks them by role)` });
  const fams = Object.keys(byFam).length;
  if (fams < MIX.min_families) add({ severity: "error", rule: "few-curves", file: gestures[0].rel, message: `${fams} curve families in the film (${Object.entries(byFam).map(([k, v]) => `${k} ${v}`).join(", ")}); ${MIX.min_families} at least`, fix: "add the missing roles: a long-tailed launch, a soft-start glide, a settle on a hero landing, an accelerating exit, a sine drift on the camera" });
  // durations on a 1-frame grid
  const fr = gestures.map((g) => Math.round(g.dur * FPS));
  const cnt = {};
  for (const x of fr) cnt[x] = (cnt[x] || 0) + 1;
  const best = Object.keys(cnt).map(Number).map((k) => [k, cnt[k]]).sort((a, b) => b[1] - a[1])[0]; // the same length to the frame: 0.45 s on 32 of 45 tweens is FILM-C's grid
  mix.duration_share = +(best[1] / n).toFixed(2);
  mix.durations_frames = cnt;
  if (best[1] / n > MIX.max_duration_share) add({ severity: "error", rule: "duration-grid", file: gestures[0].rel, message: `${best[1]} of ${n} gestures last ${(best[0] / FPS).toFixed(2)} s (to the frame): ${Math.round((best[1] / n) * 100)}%, ${Math.round(MIX.max_duration_share * 100)}% at most`, fix: "derive each duration from its travel and size (motion.md durations; RasanMotion does it): a 40 px nudge and a 900 px flight never share a length" });
  else {
    const top3 = Object.values(cnt).sort((a, b) => b - a).slice(0, 3).reduce((a, b) => a + b, 0);
    if (top3 / n > 0.6) add({ severity: "warning", rule: "duration-grid", file: gestures[0].rel, message: `three durations cover ${Math.round((top3 / n) * 100)}% of gestures`, fix: "durations from distance, jittered +-8%" });
  }
  // even staggers and metronomic cascades
  for (const g of gestures) if (g.evenStagger) add({ severity: "error", rule: "even-stagger", ...g.where, message: `a constant stagger (${Math.round((g.stagger || 0) * 1000)} ms) over ${g.nTargets} elements: a metronome`, fix: "stagger: { amount: <0.3-0.5>, ease: \"power2.in\" } plus varied durations, or RasanMotion.cascade" });
  const groups = {};
  for (const g of gestures) {
    const k = `${g.rel}|${[...g.keys].sort().join(",")}|${g.shape ? g.shape.key : g.ease}|${Math.round(g.dur * FPS)}`;
    (groups[k] = groups[k] || []).push(g);
  }
  for (const list of Object.values(groups)) {
    if (list.length < 4) continue;
    const st = [...new Set(list.map((g) => Math.round(g.start * FPS)))].sort((a, b) => a - b);
    for (let i = 0; i + 3 < st.length; i++) {
      const gaps = [st[i + 1] - st[i], st[i + 2] - st[i + 1], st[i + 3] - st[i + 2]];
      if (gaps.every((x) => x > 0 && Math.abs(x - gaps[0]) <= 1)) {
        add({ severity: "error", rule: "uniform-cascade", file: list[0].rel, target: list[0].target, at: `${(st[i] / FPS).toFixed(2)}s`, message: `${list.length} tweens with the same properties, curve (${easeLabel(list[0])}) and duration (${list[0].dur}s) start at an even ${(gaps[0] / FPS).toFixed(2)} s spacing: a metronomic cascade of one gesture`, fix: "offsets on a curve plus +-1 frame, durations +-10%, the hero last with a settle (RasanMotion.cascade)" });
        break;
      }
    }
  }
  // settles: within the budget, and not absent
  const settles = shaped.filter((g) => g.shape.overshoot_pct > 0.5);
  mix.settle_share = shaped.length ? +(settles.length / shaped.length).toFixed(2) : null;
  if (BUDGET.share > 0 && settles.length / Math.max(1, shaped.length) > BUDGET.share + 0.05) add({ severity: "error", rule: "overshoot-over-budget", file: settles[0].rel, message: `${settles.length} of ${shaped.length} gestures overshoot (${Math.round((settles.length / shaped.length) * 100)}%); motion.md's budget is ${Math.round(BUDGET.share * 100)}%`, fix: "keep settles for hero landings (about 1 in 8); the rest land on a launch or glide curve" });
  if (BUDGET.share > 0 && !settles.length && shaped.length >= 16) add({ severity: "warning", rule: "no-settle", file: gestures[0].rel, message: `none of ${shaped.length} gestures settles: nothing ever overshoots and comes back (references settle 8-17% of moves)`, fix: "land the hero objects with a 3-8% spring settle (RasanMotion.land)" });
  // snap-and-die: long travels on short durations
  const travels = gestures.filter((g) => { const dx = (num(g.to.x) ?? 0) - (num(g.from.x) ?? 0), dy = (num(g.to.y) ?? 0) - (num(g.from.y) ?? 0); return Math.hypot(dx, dy) >= width * 0.1; });
  const fast = travels.filter((g) => g.dur < 0.5);
  if (travels.length >= 3 && fast.length / travels.length > 0.25) add({ severity: "warning", rule: "snap-and-die", file: fast[0].rel, target: fast[0].target, message: `${fast.length} of ${travels.length} travels over 10% of the frame take under 0.5 s: they snap and die (references keep the median move visible 0.4-0.5 s)`, fix: "0.7-1.2 s for big travels, on a long-tailed curve (motion.md durations)" });
}

if (!report.tweens && !couldNotRun.length) couldNotRun.push("no GSAP tweens found in any composition: nothing was checked (run obey after the build writes compositions/index.html)");
report.could_not_run = couldNotRun;
report.status = couldNotRun.length ? "could-not-run" : report.errors ? "violations" : "clean";
if (args.json) {
  console.log(JSON.stringify({ ...report, findings }, null, 2));
} else {
  console.log(`obey: ${report.status} — ${report.tweens} tweens (${report.exempt} exempt) in ${report.files.length} file(s); ${report.errors} error(s), ${report.warnings} warning(s), ${report.waived} waived`);
  const mx = report.mix || {};
  console.log(mx.judged ? `  mix: ${mx.gestures} gestures, top curve ${Math.round((mx.dominant_share || 0) * 100)}%, top duration ${Math.round((mx.duration_share || 0) * 100)}%, settles ${Math.round((mx.settle_share || 0) * 100)}%, families ${Object.keys(mx.families || {}).join("/")}` : `  mix: not judged (${mx.note || "no gestures"})`);
  for (const f of findings) {
    const tag = f.waived ? "WAIVED" : f.severity.toUpperCase();
    console.log(`  [${tag}] ${f.rule} ${f.file || ""}${f.target ? ` ${f.target}` : ""}${f.at ? ` @${f.at}` : ""}${f.dur_ms !== undefined ? ` ${f.dur_ms}ms` : ""}${f.ease ? ` ease=${f.ease}` : ""}\n      ${f.message}\n      fix: ${f.fix}`);
  }
}
if (couldNotRun.length && !args.json) couldNotRun.forEach((c) => console.log(`  [COULD NOT RUN] ${c}`));
process.exit(couldNotRun.length ? 1 : report.errors ? 2 : 0);
