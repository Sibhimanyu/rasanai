// quick-preview: a fast, opt-in, single-HTML film prototype (10-40 s, simple films). The idea (one HTML scene, a seeked clock,
// headless Chrome, scene-error checks, ffmpeg) comes from diggerhq/shipvideo, which had no verified licence: IDEAS ONLY, this code
// and the virtual-time adapter are original (third_party/SOURCES.md).
//
// The composition is PROJECT/compositions/quick/index.html, a HyperFrames sub-composition (everything inside one <template>) that
// registers ONE paused GSAP timeline on window.__timelines["quick"]. A small virtual-time adapter lives INSIDE that file (never a
// global clock patch, nothing is installed for ordinary films): it wraps that timeline's seek/time/totalTime so a seek to t also
//   - pauses every CSS animation / WAAPI animation and sets its currentTime to t,
//   - steps the scene's own virtual rAF queue (__vt.scene(build) hands build a `raf` that runs at 60 virtual ticks per second; a
//     seek backwards REBUILDS the scene and replays forward, so A-B-A and a cold seek give the same state),
//   - calls window.render(t) when the composition defines one (a stateless, time-addressed function).
// Rendering and checking load that file into a one-composition harness page through lib/cdp.mjs (headless Chrome, no network)
// and encode with ffmpeg; the same file mounts in a HyperFrames host (index.html) for the normal workflow.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { gsapInline } from "./common.mjs";
import { launch } from "./cdp.mjs";
import { decodePng } from "./png.mjs";
import { readTime, wordCount, SLACK_RENDER } from "./reading.mjs";
import { parseColor, contrast } from "./design-md.mjs";
import { HF_AUTO_FONTS, stageFont } from "./fonts.mjs";
import { readDesignMd } from "./design-md.mjs";
import { noteDowngrade } from "./downgrade.mjs";
import { GSAP_PATH } from "./common.mjs";
import { chromeStatus, ffmpegStatus } from "./style-film.mjs";

export const QUICK = { MIN_S: 10, MAX_S: 40, FPS: 30, SIZES: [[640, 360], [960, 540], [1280, 720], [1920, 1080]], STEPS: [2, 4], SCHEMA: "rasanai-quick-brief/1" };
export const COMPOSITION_REL = "compositions/quick/index.html";
export const BRIEF_REL = "quick.json";
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const rj = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
const r3 = (n) => Math.round(n * 1000) / 1000;
export const fileSha = (f) => sha(fs.readFileSync(f));

// ---------------------------------------------------------------------------------------------------------------- brief
// What a quick film is made of. Every word on screen comes from here; nothing is invented by the scaffold.
const hexOk = (c) => /^#[0-9a-f]{6}$/i.test(String(c || ""));
const NUM_RE = /\d+(?:[.,]\d+)*/g;
const REGULATED_RE = /\b(cures?|clinical(?:ly)? proven|guaranteed returns?|risk[- ]free|fda[- ]approved|diagnos(?:e|is)|prescription|investment advice|legal advice)\b/i;
const OUT_OF_SCOPE_KIND = /footage|reel|talking[- ]head|music[- ]video|lyric|3d|brand[- ]film|series/i;

export function validateBrief(b) {
  const E = [], W = [], up = [];
  const str = (v, max, name, { required = true } = {}) => {
    if (v == null || v === "") { if (required) E.push(`${name} is required`); return; }
    if (typeof v !== "string") { E.push(`${name} must be text`); return; }
    if (v.length > max) E.push(`${name} is ${v.length} characters; at most ${max} (a quick film is short on purpose)`);
  };
  if (!b || typeof b !== "object") return { errors: ["the quick brief is not a JSON object"], warnings: W, upgrade: up };
  if (b.schema !== QUICK.SCHEMA) E.push(`schema must be "${QUICK.SCHEMA}"`);
  const D = Number(b.duration_s);
  if (!(D >= QUICK.MIN_S && D <= QUICK.MAX_S)) {
    if (D > QUICK.MAX_S) up.push(`duration ${D}s is over ${QUICK.MAX_S}s: a longer film needs the full crew`);
    else E.push(`duration_s must be ${QUICK.MIN_S} to ${QUICK.MAX_S} seconds`);
  }
  const sz = b.size || { w: 1280, h: 720 };
  if (!QUICK.SIZES.some(([w, h]) => w === sz.w && h === sz.h)) E.push(`size must be one of ${QUICK.SIZES.map((s) => s.join("x")).join(", ")}`);
  if (b.fps != null && !(Number(b.fps) >= 1 && Number(b.fps) <= 60)) E.push("fps must be 1 to 60");
  const src = b.source || {};
  if (!["prompt", "captured-public", "script", "assets"].includes(src.kind)) E.push('source.kind must be one of prompt, captured-public, script, assets (where the words came from)');
  if (b.regulated === true) up.push("a regulated or claim-bearing film needs the full crew (claims are checked against research there)");
  if (OUT_OF_SCOPE_KIND.test(String(b.kind || ""))) up.push(`a "${b.kind}" film is not a quick-preview film (footage cuts, music videos, brand films, 3D rigs and series need the full crew)`);
  str(b.kicker, 40, "kicker", { required: false });
  str(b.title, 60, "title");
  str(b.tagline, 90, "tagline", { required: false });
  const m = b.mechanism || {};
  str(m.heading, 50, "mechanism.heading");
  const steps = Array.isArray(m.steps) ? m.steps : [];
  if (steps.length < QUICK.STEPS[0]) E.push(`mechanism.steps needs at least ${QUICK.STEPS[0]} steps`);
  if (steps.length > QUICK.STEPS[1]) up.push(`${steps.length} mechanism steps is over the quick limit of ${QUICK.STEPS[1]}: a bigger diagram needs the full crew`);
  steps.forEach((s, i) => { str(s && s.label, 26, `mechanism.steps[${i}].label`); str(s && s.detail, 56, `mechanism.steps[${i}].detail`, { required: false }); });
  const ec = b.endcard || {};
  str(ec.line, 64, "endcard.line"); str(ec.sub, 80, "endcard.sub", { required: false });
  const L = b.look || {};
  for (const k of ["canvas", "ink", "accent"]) if (!hexOk(L[k])) E.push(`look.${k} must be a #rrggbb colour (from the approved Look)`);
  for (const k of ["support", "muted"]) if (L[k] != null && !hexOk(L[k])) E.push(`look.${k} must be a #rrggbb colour`);
  if (!L.display) E.push("look.display (the display font family) is required");
  if (hexOk(L.canvas) && hexOk(L.ink)) { const c = contrast(L.ink, L.canvas); if (c < 4.5) E.push(`look: ink on canvas is ${c.toFixed(1)}:1; text needs 4.5:1`); }
  // every number on screen is in the ledger (references/product-first.md; slop.mjs number-not-in-ledger does the same for built films)
  const ledger = (Array.isArray(b.facts) ? b.facts : []).map((f) => `${f && f.text}`).join(" ");
  const shown = [b.kicker, b.title, b.tagline, m.heading, ...steps.flatMap((s) => [s && s.label, s && s.detail]), ec.line, ec.sub].filter(Boolean).join(" ");
  for (const n of shown.match(NUM_RE) || []) if (!ledger.includes(n)) E.push(`the number "${n}" is on screen but not in facts[] (a quick film never invents a figure: add { "text": "...", "source": "..." } or drop it)`);
  for (const f of b.facts || []) if (!f || !f.text || !f.source) E.push("every facts[] entry needs text and source");
  if (REGULATED_RE.test(shown)) up.push("the words make a regulated-sounding claim (health, finance or legal): that needs the full crew");
  for (const a of b.assets || []) if (!a || !a.file || !a.licence) E.push(`assets[] entries need file and licence (${a && a.file || "?"})`);
  const au = b.audio || {};
  if (au.music) { if (!au.music.file) E.push("audio.music.file is required"); if (!au.music.licence || !au.music.credit) E.push("audio.music needs licence and credit (music is only allowed with its licence)"); }
  for (const [i, s] of (au.sfx || []).entries()) { if (!s.file || !(s.at >= 0 && s.at < (D || 0))) E.push(`audio.sfx[${i}] needs a file and an at inside the film`); if (!s.licence) E.push(`audio.sfx[${i}] needs a licence`); }
  if (!b.synthetic && !b.source_note && !src.note) W.push("source.note is empty: say where the words came from (the Director needs it at promotion)");
  return { errors: E, warnings: W, upgrade: up };
}

export const loadBrief = (project) => rj(path.join(project, BRIEF_REL));

// the film's beats, from the duration alone (the check and the scaffold read the same plan)
export function plan(b) {
  const D = Number(b.duration_s), T1 = r3(D * 0.28), T2 = r3(D * 0.78);
  const steps = (b.mechanism && b.mechanism.steps) || [];
  return {
    duration_s: D, T1, T2,
    wipe: { from: r3(T1 - 0.2), cover: r3(T1 + 0.15), to: r3(T1 + 0.5) },
    beats: [{ id: "title", from: 0, to: T1 }, { id: "mechanism", from: T1, to: T2 }, { id: "end", from: T2, to: D }],
    push: { from: r3(T2), to: r3(T2 + 0.6) },
    // when each beat must be fully on screen and what it must show (text from the brief)
    samples: [
      { beat: "title", t: r3(T1 - 0.55), expect: [b.title, b.tagline].filter(Boolean) },
      { beat: "mechanism", t: r3(T2 - 0.5), expect: [b.mechanism.heading, ...steps.map((s) => s.label)] },
      { beat: "end", t: r3(D - 0.25), expect: [b.endcard.line] },
    ],
    cues: [{ at: r3(T1 + 0.05), what: "transition 1 (wipe)" }, { at: r3(T2 + 0.05), what: "transition 2 (push)" }, { at: r3(T2 + 0.6), what: "end card lands" }],
  };
}

// ------------------------------------------------------------------------------------------------------ virtual-time adapter
// Fenced so the checker can tell it from authored code: the text between the markers must equal this string exactly.
export const VT_BEGIN = "/*quick-vt:begin v1*/", VT_END = "/*quick-vt:end*/";
export const VT_BODY = `(function(){
var STEP=60,q=[],ticks=0,scenes=[],tl=null;
function raf(cb){q.push(cb);return q.length}
function rebuild(){q=[];ticks=0;for(var i=0;i<scenes.length;i++)scenes[i](raf)}
function apply(t){
  var want=Math.floor(t*STEP+1e-6);
  if(want<ticks)rebuild();
  while(ticks<want){ticks++;var cur=q;q=[];var ts=ticks*1000/STEP;for(var i=0;i<cur.length;i++)cur[i](ts)}
  var an=document.getAnimations?document.getAnimations():[];
  for(var j=0;j<an.length;j++){try{an[j].pause();an[j].currentTime=t*1000}catch(e){}}
  if(typeof window.render==="function")window.render(t)
}
var vt=window.__vt={version:1,duration:0,apply:apply,
  scene:function(build){scenes.push(build);build(raf)},
  install:function(t){
    tl=t;vt.duration=t.duration();
    ["seek","time","totalTime"].forEach(function(m){var o=t[m];t[m]=function(v){var r=o.apply(this,arguments);if(arguments.length&&typeof v==="number")apply(t.time());return r}})
  },
  seek:function(t){var d=vt.duration||0;t=Math.max(0,Math.min(t,d));if(!tl){apply(t);return}tl.pause();tl.time(t,false)}
};
})();`;
export const VT_SRC = `${VT_BEGIN}\n${VT_BODY}\n${VT_END}`;

// ------------------------------------------------------------------------------------------------------------- composition
const bestOn = (bg, ...cands) => cands.sort((a, b) => contrast(b, bg) - contrast(a, bg))[0];

export function compositionHtml(b, { fontCss = "" } = {}) {
  const P = plan(b), W = (b.size || {}).w || 1280, H = (b.size || {}).h || 720, U = W / 1280;
  const L = b.look, c = { canvas: L.canvas, ink: L.ink, accent: L.accent, support: L.support || L.accent, muted: L.muted || L.ink };
  const chipInk = bestOn(c.accent, c.canvas, c.ink, "#000000", "#ffffff");
  const body = L.body || L.display;
  const steps = b.mechanism.steps, n = steps.length;
  const gap = 48, cardW = Math.floor((1088 - gap * (n - 1)) / n);
  const tl = b.title, tfs = tl.length <= 22 ? 124 : tl.length <= 40 ? 96 : 76;
  const words = (s) => String(s).split(/\s+/).filter(Boolean).map((w) => `<span class="w">${esc(w)}</span>`).join(" ");
  const cardX = (i) => 96 + i * (cardW + gap);
  const startAbs = r3(P.wipe.cover + 0.9);
  const cards = steps.map((s, i) => `<div class="card" id="c${i}" data-q-line style="left:calc(var(--u)*${cardX(i)});width:calc(var(--u)*${cardW})"><div class="chip">${i + 1}</div><div class="cl" data-q-line>${esc(s.label)}</div>${s.detail ? `<div class="cd" data-q-line>${esc(s.detail)}</div>` : ""}</div>`).join("");
  const lineX0 = cardX(0) + cardW / 2, lineX1 = cardX(n - 1) + cardW / 2;
  const css = `
${fontCss}
#root{position:absolute;inset:0;overflow:hidden;--u:${U}px;background:${c.canvas};color:${c.ink};font-family:"${body}",system-ui,sans-serif}
:where(#root *){box-sizing:border-box;margin:0}
.abs{position:absolute}
#b1,#b2,#b3,#wipe{position:absolute;inset:0;visibility:hidden}
#b1,#b3{display:flex;flex-direction:column;justify-content:center;padding:0 calc(var(--u)*96)}
#kick{margin-bottom:calc(var(--u)*24);font-size:calc(var(--u)*22);letter-spacing:.14em;text-transform:uppercase;color:${c.muted};font-weight:600}
#title{max-width:calc(var(--u)*1088);font-family:"${L.display}",system-ui,sans-serif;font-weight:${Number(L.weight) || 800};font-size:calc(var(--u)*${tfs});line-height:1.04;letter-spacing:-.02em}
.w{display:inline-block}
#tag{margin-top:calc(var(--u)*26);max-width:calc(var(--u)*900);font-size:calc(var(--u)*30);line-height:1.3;color:${c.muted}}
.bar{margin-top:calc(var(--u)*34);width:calc(var(--u)*280);height:calc(var(--u)*10);background:${c.accent};border-radius:calc(var(--u)*5);transform-origin:0 50%;transform:scaleX(0);animation:qgrow .9s cubic-bezier(.2,.8,.2,1) .5s both}
@keyframes qgrow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
#head{left:calc(var(--u)*96);top:calc(var(--u)*92);font-family:"${L.display}",system-ui,sans-serif;font-weight:${Number(L.weight) || 800};font-size:calc(var(--u)*48);letter-spacing:-.01em}
.card{position:absolute;top:calc(var(--u)*230);height:calc(var(--u)*250);padding:calc(var(--u)*26);border:calc(var(--u)*3) solid ${c.muted};border-radius:calc(var(--u)*18);background:${c.canvas}}
.chip{width:calc(var(--u)*54);height:calc(var(--u)*54);border-radius:50%;background:${c.accent};color:${chipInk};font-weight:800;font-size:calc(var(--u)*28);display:flex;align-items:center;justify-content:center}
.cl{margin-top:calc(var(--u)*24);font-family:"${L.display}",system-ui,sans-serif;font-weight:${Number(L.weight) || 800};font-size:calc(var(--u)*40);line-height:1.1}
.cd{margin-top:calc(var(--u)*12);font-size:calc(var(--u)*25);line-height:1.3;color:${c.muted}}
#wire,#dot,.bar,#endbar{pointer-events:none}
#wire{left:0;top:0;width:calc(var(--u)*1280);height:calc(var(--u)*720)}
#wire line{stroke:${c.accent};stroke-width:4;stroke-linecap:round;stroke-dasharray:${Math.round(lineX1 - lineX0)};stroke-dashoffset:${Math.round(lineX1 - lineX0)};animation:qdash 1.6s ease-in-out ${startAbs}s both}
@keyframes qdash{from{stroke-dashoffset:${Math.round(lineX1 - lineX0)}}to{stroke-dashoffset:0}}
#dot{left:0;top:0;width:calc(var(--u)*22);height:calc(var(--u)*22);margin:calc(var(--u)*-11) 0 0 calc(var(--u)*-11);border-radius:50%;background:${c.accent};opacity:0}
#end{max-width:calc(var(--u)*1088);font-family:"${L.display}",system-ui,sans-serif;font-weight:${Number(L.weight) || 800};font-size:calc(var(--u)*${b.endcard.line.length <= 30 ? 92 : 68});line-height:1.05;letter-spacing:-.02em}
#endbar{margin-top:calc(var(--u)*30);width:calc(var(--u)*220);height:calc(var(--u)*10);border-radius:calc(var(--u)*5);background:${c.accent};transform-origin:0 50%;animation:qpulse 1.2s ease-in-out ${P.T2}s infinite alternate both}
@keyframes qpulse{from{transform:scaleX(.7)}to{transform:scaleX(1)}}
#endsub{margin-top:calc(var(--u)*24);max-width:calc(var(--u)*1000);font-size:calc(var(--u)*30);line-height:1.3;color:${c.muted}}
#wipe{background:${c.accent}}`;
  const main = `(function(){
var D=${P.duration_s},T1=${P.T1},T2=${P.T2},WF=${P.wipe.from},WC=${P.wipe.cover},WT=${P.wipe.to},PF=${P.push.from},PT=${P.push.to},START=${startAbs};
var X0=${r3(lineX0)}*${U},X1=${r3(lineX1)}*${U},Y=${r3(580 * U)};
var tl=gsap.timeline({paused:true,defaults:{lazy:false}});
// visibility toggles are tl.set (a fromTo with immediateRender:false is not reverted by a backward seek in GSAP)
tl.set("#b1",{autoAlpha:1},0);
${b.kicker ? `tl.fromTo("#kick",{opacity:0,y:14},{opacity:1,y:0,duration:.4,ease:"power3.out"},0);` : ""}
tl.fromTo("#title .w",{y:56,opacity:0},{y:0,opacity:1,duration:.7,ease:"power3.out",stagger:.08},.1);
${b.tagline ? `tl.fromTo("#tag",{opacity:0,y:18},{opacity:1,y:0,duration:.6,ease:"power3.out"},1.15);` : ""}
tl.set("#wipe",{autoAlpha:1},WF);
tl.fromTo("#wipe",{xPercent:-105},{xPercent:0,duration:WC-WF,ease:"power2.in"},WF);
tl.set("#b1",{autoAlpha:0},WC);
tl.set("#b2",{autoAlpha:1},WC);
tl.to("#wipe",{xPercent:105,duration:WT-WC,ease:"power2.out"},WC);
tl.set("#wipe",{autoAlpha:0},WT);
tl.fromTo("#head",{opacity:0,x:-30},{opacity:1,x:0,duration:.5,ease:"power3.out"},WC+.1);
tl.fromTo(".card",{opacity:0,y:40},{opacity:1,y:0,duration:.55,ease:"power3.out",stagger:.14},WC+.25);
tl.fromTo("#b2",{yPercent:0},{yPercent:-100,duration:PT-PF,ease:"power3.inOut"},PF);
tl.set("#b3",{autoAlpha:1},PF);
tl.fromTo("#b3",{yPercent:100},{yPercent:0,duration:PT-PF,ease:"power3.inOut"},PF);
tl.set("#b2",{autoAlpha:0},PT);
tl.fromTo("#end",{opacity:0,y:30},{opacity:1,y:0,duration:.6,ease:"power3.out"},PT-.1);
${b.endcard.sub ? `tl.fromTo("#endsub",{opacity:0},{opacity:1,duration:.6,ease:"power2.out"},PT+.3);` : ""}
tl.set({},{},D);
// WAAPI: each card's border lights up in turn (created once; the adapter drives its currentTime)
var cards=document.querySelectorAll(".card");
for(var i=0;i<cards.length;i++){cards[i].animate([{borderColor:"${c.muted}"},{borderColor:"${c.accent}"}],{delay:(START+.2+i*.9)*1000,duration:300,fill:"both"})}
// rAF (virtual): the signal dot travels along the wire, a pure function of the virtual time
__vt.scene(function(raf){
  var dot=document.getElementById("dot");
  function loop(ts){
    var s=ts/1000-START,p=s<0?0:(s%3)/3;
    dot.style.opacity=s<0?0:1;
    dot.style.transform="translate("+(X0+(X1-X0)*p)+"px,"+Y+"px)";
    raf(loop)
  }
  dot.style.opacity=0;dot.style.transform="translate("+X0+"px,"+Y+"px)";
  raf(loop)
});
window.__timelines["quick"]=tl;
__vt.install(tl);
})();`;
  return `<!doctype html>
<html>
<head><meta charset="UTF-8"><title>quick-preview: ${esc(b.title)}</title><!-- RasanAI quick-preview composition (a HyperFrames sub-composition). Generated from quick.json: edit the brief and re-scaffold, or edit this file and re-check. ${b.synthetic ? `SYNTHETIC FIXTURE: ${esc(b.synthetic)}` : ""} --></head>
<body>
<template>
<style>${css}
</style>
<div id="root" data-composition-id="quick" data-start="0" data-duration="${P.duration_s}" data-width="${W}" data-height="${H}">
  <div id="b1">${b.kicker ? `<div id="kick" data-q-line>${esc(b.kicker)}</div>` : ""}<h1 id="title" data-q-line>${words(tl)}</h1><div class="bar" data-q-decor></div>${b.tagline ? `<div id="tag" data-q-line>${esc(b.tagline)}</div>` : ""}</div>
  <div id="b2"><div id="head" class="abs" data-q-line>${esc(b.mechanism.heading)}</div>
    <svg id="wire" class="abs" viewBox="0 0 ${W} ${H}" data-q-decor><line x1="${r3(lineX0 * U)}" y1="${r3(580 * U)}" x2="${r3(lineX1 * U)}" y2="${r3(580 * U)}"/></svg>${cards}<div id="dot" class="abs" data-q-decor></div></div>
  <div id="b3"><div id="end" data-q-line>${esc(b.endcard.line)}</div><div id="endbar" data-q-decor></div>${b.endcard.sub ? `<div id="endsub" data-q-line>${esc(b.endcard.sub)}</div>` : ""}</div>
  <div id="wipe" data-q-decor></div>
</div>
<script>${VT_SRC}</script>
<script>${main}</script>
</template>
</body>
</html>
`;
}

// A HyperFrames host that mounts the quick composition (the normal workflow's index.html); audio is declared here, never in the composition.
export function hostHtml(b) {
  const W = (b.size || {}).w || 1280, H = (b.size || {}).h || 720, D = b.duration_s, au = b.audio || {};
  const clips = [];
  if (au.music) clips.push(`<audio id="music-bed" src="${esc(au.music.file)}" data-start="0" data-duration="${D}" data-track-index="10" data-volume="${au.music.volume ?? 0.5}"></audio>`);
  (au.sfx || []).forEach((s, i) => clips.push(`<audio id="sfx-${i}" src="${esc(s.file)}" data-start="${s.at}" data-duration="${s.duration || 1.5}" data-track-index="${11 + i}" data-volume="${s.volume ?? 0.8}"></audio>`));
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${W}, height=${H}" />
    <script src="assets/vendor/gsap.min.js"></script>
    <style>html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:#000}#stage{position:relative;width:${W}px;height:${H}px}</style>
  </head>
  <body>
    <!-- data-rasanai-quick-host: written by quick-film.mjs scaffold; mounts compositions/quick/index.html -->
    <div id="stage" data-rasanai-quick-host data-composition-id="main" data-start="0" data-duration="${D}" data-width="${W}" data-height="${H}">
      <div id="quick" data-composition-id="quick" data-composition-src="${COMPOSITION_REL}" data-start="0" data-duration="${D}" data-track-index="0" data-width="${W}" data-height="${H}"></div>
      ${clips.join("\n      ")}
    </div>
    <script>
      const tl = gsap.timeline({ paused: true });
      window.__timelines["main"] = tl;
      tl.seek(0);
    </script>
  </body>
</html>
`;
}

// the file between <template> and </template>: what a HyperFrames host would mount
export function templateInner(html) {
  const a = html.indexOf("<template>"), z = html.lastIndexOf("</template>");
  return a >= 0 && z > a ? html.slice(a + 10, z) : null;
}

// ------------------------------------------------------------------------------------------------------------ static check
const SECRET_RES = [
  [/sk-[A-Za-z0-9_-]{20,}/, "an API-key-like token (sk-...)"], [/AKIA[0-9A-Z]{16}/, "an AWS access key id"], [/gh[pousr]_[A-Za-z0-9]{30,}/, "a GitHub token"],
  [/xox[abp]-[A-Za-z0-9-]{10,}/, "a Slack token"], [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "a private key"],
  [/\b(?:api[_-]?key|secret|passwd|password|auth[_-]?token|access[_-]?token)\b["']?\s*[:=]\s*["'][^"'\s]{8,}["']/i, "a credential assignment"],
  [/\/Users\/[A-Za-z0-9._-]+\//, "a private local path (/Users/...)"], [/\/home\/[A-Za-z0-9._-]+\//, "a private local path (/home/...)"], [/[A-Za-z]:\\Users\\/, "a private local path (C:\\Users\\)"],
];
const BANNED_JS = [
  [/\bMath\.random\b/, "unseeded-random", "Math.random is unseeded: use the brief's seed with a small seeded generator"],
  [/\bcrypto\.(?:getRandomValues|randomUUID)\b/, "unseeded-random", "crypto randomness is unseeded"],
  [/\bDate\.now\b|\bnew\s+Date\b|\bperformance\.now\b/, "wall-clock", "wall-clock time makes the frame depend on when it was drawn: use the timeline's time"],
  [/\bsetTimeout\b|\bsetInterval\b|\brequestAnimationFrame\b|\bcancelAnimationFrame\b/, "wall-clock", "timers and the real requestAnimationFrame are not seekable: use __vt.scene(function (raf) { ... }) for per-frame code"],
  [/\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\bsendBeacon\b|\bimport\s*\(|\beval\s*\(|\bnew\s+Function\b|\bdocument\.write\b/, "network-or-dynamic-code", "no network calls and no dynamic code in a quick composition"],
  [/\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b|\bdocument\.cookie\b/, "user-data", "a composition does not read or write browser storage"],
];

// -> { errors: [{code,msg}], warnings: [{code,msg}], refs: {images, fonts, files}, unsafe }
export function staticCheck(project, brief) {
  const E = [], Wn = [];
  const add = (list, code, msg, extra = {}) => list.push({ code, msg, ...extra });
  const file = path.join(project, COMPOSITION_REL);
  if (!fs.existsSync(file)) { add(E, "no-composition", `${COMPOSITION_REL} does not exist: run quick-film.mjs scaffold`); return { errors: E, warnings: Wn, refs: {}, unsafe: false }; }
  let html = fs.readFileSync(file, "utf8");
  const inner = templateInner(html);
  if (inner == null) add(E, "no-template", "the composition has no <template> (a HyperFrames sub-composition keeps everything inside one)");
  // the adapter is exempt only when it is byte-identical to the shipped one
  let text = html;
  const a = html.indexOf(VT_BEGIN), z = html.indexOf(VT_END);
  if (a >= 0 && z > a) {
    const found = html.slice(a, z + VT_END.length);
    if (found === VT_SRC) text = html.slice(0, a) + html.slice(z + VT_END.length);
    else add(E, "adapter-modified", "the virtual-time adapter was edited; restore it from quick-film.mjs scaffold (its fenced block must be unmodified)");
  } else add(E, "no-adapter", "the virtual-time adapter block is missing: CSS and WAAPI animations would not be seekable");
  const code = text.replace(/<!--[\s\S]*?-->/g, "");
  let unsafe = false;
  const scripts = [...code.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  for (const s of scripts) if (/\bsrc\s*=/i.test(s[1])) { add(E, "remote-script", `a <script src> is not allowed in a quick composition (${(s[1].match(/src\s*=\s*["']?([^"'\s>]+)/i) || [])[1]}): the host loads GSAP`); unsafe = true; }
  if (/<\s*iframe\b|<\s*frame\b|<\s*embed\b|<\s*object\b/i.test(code)) { add(E, "iframe", "<iframe>, <embed> and <object> are not allowed (they can hide authored frames and remote pages)"); unsafe = true; }
  if (/<\s*(video|audio|source|track)\b/i.test(code)) add(E, "media-tag", "<video> and <audio> are not allowed in the composition: they could play pre-made frames instead of authored ones. Audio is declared in quick.json and mixed by render / the host");
  for (const [re, label] of SECRET_RES) { if (re.test(code) || (brief && re.test(JSON.stringify(brief)))) { add(E, "secret", `the composition or brief contains ${label}`); unsafe = true; } }
  const js = scripts.map((s) => s[2]).join("\n").replace(VT_SRC, "");
  const jsNoStrings = js.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, " ");
  for (const [re, c, msg] of BANNED_JS) if (re.test(jsNoStrings)) add(E, c, msg);
  // references: src=, href=, url(), @import, @font-face
  const approved = new Set(((brief && brief.assets) || []).map((x) => path.posix.normalize(String(x.file))));
  const refs = { images: [], fonts: [], files: [] };
  const seen = new Set();
  const consider = (ref, kind) => {
    ref = String(ref).trim().replace(/^["']|["']$/g, "");
    if (!ref || ref.startsWith("#") || seen.has(kind + ref)) return;
    seen.add(kind + ref);
    if (/^(https?:)?\/\//i.test(ref) || /^(ftp|ws|wss):/i.test(ref)) { add(E, kind === "image" ? "remote-image" : "remote-resource", `${kind === "image" ? "remote image" : "remote resource"} ${ref.slice(0, 80)}: a quick film uses only local, approved assets (add the file to assets/ and to quick.json assets[] with its licence)`); unsafe = true; return; }
    if (/^file:|^\/(Users|home|private|var|tmp)\//i.test(ref)) { add(E, "local-path", `a machine-specific path ${ref.slice(0, 60)}: assets are project-relative`); return; }
    if (/^data:/i.test(ref)) {
      if (/^data:image\/svg\+xml/i.test(ref) || /^data:font\//i.test(ref) || /^data:application\/font/i.test(ref)) return;
      add(E, "unapproved-image", "an embedded raster image (data:) is not an approved asset: put the file in assets/ and list it in quick.json assets[]"); return;
    }
    if (/^(javascript|blob):/i.test(ref)) { add(E, "remote-resource", `${ref.slice(0, 20)} URLs are not allowed`); unsafe = true; return; }
    const rel = path.posix.normalize(ref.split(/[?#]/)[0]);
    if (rel.startsWith("..")) { add(E, "outside-project", `${ref} points outside the project`); return; }
    if (/\.(mp4|webm|mov|m4v|gif|apng|avi)$/i.test(rel)) { add(E, "media-as-frames", `${rel} is a video or animated image: a quick film's frames are authored by the composition, not played back`); return; }
    refs.files.push(rel);
    if (!fs.existsSync(path.join(project, rel))) add(E, "missing-asset", `${rel} does not exist in the project`, { file: rel });
    if (kind === "image" || /\.(png|jpe?g|webp|avif|svg|bmp)$/i.test(rel)) { refs.images.push(rel); if (!approved.has(rel)) add(E, "unapproved-image", `${rel} is not in quick.json assets[] (only approved images, with a licence, may appear)`, { file: rel }); }
    else if (/\.(woff2?|ttf|otf)$/i.test(rel)) refs.fonts.push(rel);
  };
  for (const m of code.matchAll(/<img\b[^>]*?\bsrc\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi)) consider(m[2] ?? m[3] ?? m[4], "image");
  for (const m of code.matchAll(/<link\b[^>]*?\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi)) consider(m[2] ?? m[3] ?? m[4], "link");
  for (const m of code.matchAll(/<(?:image|use)\b[^>]*?\b(?:xlink:)?href\s*=\s*("([^"]*)"|'([^']*)')/gi)) consider(m[2] ?? m[3], "image");
  for (const m of code.matchAll(/url\(\s*("[^"]*"|'[^']*'|[^)]*)\)/gi)) consider(m[1], /format\(/i.test(code.slice(m.index, m.index + m[0].length + 30)) ? "font" : "image");
  for (const m of code.matchAll(/@import\s+(?:url\()?\s*["']?([^"')\s;]+)/gi)) consider(m[1], "import");
  // the declared fonts
  const fams = new Set();
  for (const m of code.matchAll(/font-family\s*:\s*([^;}]+)/gi)) { const f = m[1].split(",")[0].trim().replace(/^["']|["']$/g, ""); if (f && !/^(var\(|inherit|initial)/.test(f)) fams.add(f); }
  const faced = new Set([...code.matchAll(/@font-face\s*\{[^}]*font-family\s*:\s*["']?([^;"']+)["']?/gi)].map((m) => m[1].trim()));
  return { errors: E, warnings: Wn, refs: { ...refs, families: [...fams], faced: [...faced] }, unsafe, html };
}

export function projectFacts(project, b) {
  const W = (b.size || {}).w || 1280, H = (b.size || {}).h || 720;
  return { W, H, fps: Number(b.fps) || QUICK.FPS, D: Number(b.duration_s) };
}

// ----------------------------------------------------------------------------------------------------------------- harness
// One-composition harness: the template's contents (style, markup, scripts, in order) in a #stage after GSAP, loaded from the
// PROJECT root so project-relative asset paths resolve the way they do in a HyperFrames host. No network is reachable.
export function harnessHtml(project, b) {
  const { W, H } = projectFacts(project, b);
  const inner = templateInner(fs.readFileSync(path.join(project, COMPOSITION_REL), "utf8")) || "";
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#000;overflow:hidden;width:${W}px;height:${H}px}#stage{position:relative;width:${W}px;height:${H}px;overflow:hidden}</style>${gsapInline()}<script>window.__timelines={};</script></head><body><div id="stage" data-composition-id="main" data-width="${W}" data-height="${H}">${inner}</div></body></html>`;
}

const NO_NET = ["--host-resolver-rules=MAP * ~NOTFOUND"];

export async function openSession(project, b, { scale = 1 } = {}) {
  const { W, H } = projectFacts(project, b);
  const hp = path.join(project, `.quick-harness-${process.pid}-${Date.now()}.html`);
  fs.writeFileSync(hp, harnessHtml(project, b));
  const br = await launch({ width: W, height: H, scale, timeoutMs: 60000, extraArgs: NO_NET });
  const dispose = async () => { await br.close(); fs.rmSync(hp, { force: true }); };
  try {
    await br.open("file://" + hp, { waitMs: 30000 });
    const fonts = await br.eval(`(function(){var w=function(ms){return new Promise(function(r){setTimeout(r,ms)})};var f=document.fonts&&document.fonts.ready?document.fonts.ready:Promise.resolve();return Promise.race([f,w(5000)]).then(function(){return w(100)}).then(function(){return Array.from(document.fonts||[]).map(function(x){return{family:x.family.replace(/["']/g,""),status:x.status}})})})()`, { await: true });
    const seek = async (t) => { await br.eval(`__vt.seek(${t})`); };
    const shot = async (t, o = {}) => { await seek(t); return br.screenshot(o); };
    return { b: br, seek, shot, fonts, W, H, close: dispose };
  } catch (e) { await dispose(); throw e; }
}

const PROBE_FONT = (fam) => `(function(f){var c=document.createElement("canvas").getContext("2d"),s="mmmmmmmmmmlliWWW 0123";function w(face){c.font="64px "+face;return c.measureText(s).width}
var a=w('"'+f+'",monospace')!==w("monospace"),b=w('"'+f+'",serif')!==w("serif");return a||b})(${JSON.stringify(fam)})`;

// every line ([data-q-line]) with its text, visible fraction (chars effectively opaque, inside the frame, not covered)
const LINES = `(function(){
var st=document.getElementById("stage"),SR=st.getBoundingClientRect(),out=[],els=st.querySelectorAll("[data-q-line]");
function eff(el){var o=1;while(el&&el!==st){var cs=getComputedStyle(el);if(cs.display==="none"||cs.visibility==="hidden")return 0;o*=parseFloat(cs.opacity);el=el.parentElement}return o}
for(var i=0;i<els.length;i++){var el=els[i];if(el.querySelector("[data-q-line]"))continue;
  var txt=(el.textContent||"").replace(/\\s+/g," ").trim();if(!txt)continue;
  var leaves=[],it=document.createTreeWalker(el,NodeFilter.SHOW_TEXT),n;
  while((n=it.nextNode())){var tx=n.nodeValue.replace(/\\s+/g,"");if(tx)leaves.push([n.parentElement,tx.length])}
  var tot=0,vis=0,x0=1e9,y0=1e9,x1=-1e9,y1=-1e9,covered=0;
  leaves.forEach(function(l){var r=l[0].getBoundingClientRect();tot+=l[1];var o=eff(l[0]);
    if(o>=0.85&&r.width>0&&r.height>0){x0=Math.min(x0,r.left);y0=Math.min(y0,r.top);x1=Math.max(x1,r.right);y1=Math.max(y1,r.bottom);
      var cx=r.left+r.width/2,cy=r.top+r.height/2,inside=cx>=SR.left&&cx<=SR.right&&cy>=SR.top&&cy<=SR.bottom;
      var hit=inside?document.elementFromPoint(cx,cy):null;
      if(inside&&hit&&(l[0]===hit||l[0].contains(hit)||hit.contains(l[0])&&!hit.id.match(/^(wipe|b1|b2|b3|root)$/)))vis+=l[1];else if(inside)covered+=l[1]}});
  out.push({text:txt,vis:tot?vis/tot:0,covered:tot?covered/tot:0,box:vis?[x0-SR.left,y0-SR.top,x1-SR.left,y1-SR.top]:null,color:getComputedStyle(el).color})}
return out})()`;

function flatShare(img, tol = 6) {
  // share of pixels within `tol` of the most common (quantised) colour
  const m = new Map(); let n = 0;
  for (let y = 0; y < img.height; y += 3) for (let x = 0; x < img.width; x += 3) { const i = (y * img.width + x) * 3, k = ((img.rgb[i] >> 3) << 10) | ((img.rgb[i + 1] >> 3) << 5) | (img.rgb[i + 2] >> 3); m.set(k, (m.get(k) || 0) + 1); n++; }
  let best = 0, bk = 0; for (const [k, v] of m) if (v > best) { best = v; bk = k; }
  void tol; void bk;
  return best / n;
}

// ------------------------------------------------------------------------------------------------------------ the check
// -> { ok, status, errors, warnings, measured, could_not_run? }   exit: ok 0, findings 2, could not run 1
export async function check(project, { fps = 10, json = false } = {}) {
  const t0 = Date.now();
  const brief = loadBrief(project);
  const R = { ok: false, project, composition: COMPOSITION_REL, errors: [], warnings: [], measured: {} };
  const err = (code, msg, extra) => R.errors.push({ code, msg, ...(extra || {}) });
  const warn = (code, msg, extra) => R.warnings.push({ code, msg, ...(extra || {}) });
  if (!brief) { err("no-brief", `${BRIEF_REL} is missing or not JSON: run quick-film.mjs scaffold`); return finish(R, t0); }
  const bv = validateBrief(brief);
  for (const m of bv.errors) err("brief", m);
  for (const m of bv.upgrade) err("needs-full-crew", `${m} (quick-preview does not cover it: upgrade to the full crew, see references/quick-film.md)`);
  for (const m of bv.warnings) warn("brief", m);
  if (bv.errors.length) return finish(R, t0);
  const S = staticCheck(project, brief);
  for (const e of S.errors) R.errors.push(e);
  for (const w of S.warnings) R.warnings.push(w);
  R.measured.static = { refs: S.refs };
  // audio files exist
  const au = brief.audio || {};
  for (const f of [au.music && au.music.file, ...(au.sfx || []).map((s) => s.file)].filter(Boolean)) {
    if (/^(https?:)?\/\//i.test(f)) err("remote-resource", `audio ${f} is remote`);
    else if (!fs.existsSync(path.join(project, f))) err("missing-asset", `audio file ${f} does not exist`, { file: f });
  }
  if (S.unsafe) { R.measured.browser = "not loaded: the composition has an unsafe reference (remote script, iframe, remote image or a secret), so it was never executed"; return finish(R, t0); }
  const ch = chromeStatus();
  if (!ch.ok) { R.could_not_run = `not run: ${ch.reason}`; return finish(R, t0); }
  const { D, W, H } = projectFacts(project, brief), P = plan(brief);
  let S1;
  try { S1 = await openSession(project, brief, { scale: 0.5 }); }
  catch (e) { err("load-failed", `the composition did not load: ${String(e.message).slice(0, 200)}`); return finish(R, t0); }
  try {
    const logs = () => S1.b.logs.slice();
    let ready;
    try { ready = await S1.b.eval(`({tl:!!(window.__timelines&&window.__timelines.quick),vt:!!window.__vt,dur:window.__vt?window.__vt.duration:0})`); } catch (e) { ready = { tl: false }; }
    if (!ready.tl) err("no-timeline", 'the composition did not register window.__timelines["quick"]');
    if (!ready.vt) err("no-adapter", "window.__vt is missing: the virtual-time adapter did not run");
    if (ready.tl && ready.vt) {
      // duration is bounded and equals the brief's
      if (!(ready.dur >= QUICK.MIN_S && ready.dur <= QUICK.MAX_S)) err("duration", `the timeline lasts ${ready.dur}s; a quick film is ${QUICK.MIN_S} to ${QUICK.MAX_S}s`);
      else if (Math.abs(ready.dur - D) > 0.05) err("duration", `the timeline lasts ${ready.dur}s but quick.json says ${D}s`);
      R.measured.duration_s = ready.dur;
      // fonts
      const faceStatus = {}; for (const f of S1.fonts) { faceStatus[f.family] = faceStatus[f.family] === "loaded" ? "loaded" : f.status; }
      for (const fam of S.refs.families || []) {
        if (/^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-[a-z-]+|-apple-system|emoji|math)$/i.test(fam)) continue;
        if ((S.refs.faced || []).includes(fam)) {
          try { await S1.b.eval(`document.fonts.load('16px "${fam.replace(/"/g, "")}"').then(function(){return 1})`, { await: true }); } catch {}
          const st = await S1.b.eval(`Array.from(document.fonts).filter(function(x){return x.family.replace(/["']/g,"")===${JSON.stringify(fam)}}).map(function(x){return x.status})`);
          if (!st.length || !st.includes("loaded")) err("missing-font", `the @font-face for "${fam}" did not load (${st.join(",") || "no face"}): the font file is missing or unreadable`, { family: fam });
          continue;
        }
        if (await S1.b.eval(PROBE_FONT(fam))) continue;
        if (HF_AUTO_FONTS.includes(fam.toLowerCase())) warn("font-resolved-by-hyperframes", `"${fam}" is not installed here; HyperFrames embeds it at render, but this preview uses a fallback face (stage it with fonts: assets/fonts/ for an exact preview)`, { family: fam });
        else err("missing-font", `the font "${fam}" has no @font-face, is not installed and is not one HyperFrames resolves: the film would fall back silently (stage the file in assets/fonts/ and add an @font-face)`, { family: fam });
      }
      // images complete
      const imgs = await S1.b.eval(`Array.from(document.images).map(function(i){return{src:i.getAttribute("src"),ok:i.complete&&i.naturalWidth>0}})`);
      for (const i of imgs) if (!i.ok) err("missing-asset", `image ${i.src} did not load`, { file: i.src });
      // the visible text at the fixed timestamps
      R.measured.samples = [];
      for (const s of P.samples) {
        await S1.seek(s.t);
        const lines = await S1.b.eval(LINES);
        const shown = lines.filter((l) => l.vis >= 0.95);
        const missing = s.expect.filter((x) => !shown.some((l) => l.text.replace(/\s+/g, " ") === String(x).replace(/\s+/g, " ")));
        R.measured.samples.push({ beat: s.beat, t: s.t, visible: shown.map((l) => l.text), missing });
        for (const mx of missing) {
          const l = lines.find((q) => q.text === String(mx).replace(/\s+/g, " "));
          err(l && l.covered > 0.2 ? "text-covered" : "missing-text", `at ${s.t}s (${s.beat}) "${mx}" is not visible${l ? ` (visible ${Math.round(l.vis * 100)}%${l.covered > 0.2 ? ", covered by another layer" : ""})` : " (the text is not in the page)"}`, { at: s.t });
        }
        for (const l of shown) if (l.box && (l.box[0] < W * 0.03 || l.box[1] < H * 0.03 || l.box[2] > W * 0.97 + 1 || l.box[3] > H * 0.97 + 1)) err("text-outside-frame", `at ${s.t}s "${l.text.slice(0, 40)}" runs outside the safe area of the frame`, { at: s.t });
      }
      // sampled frames: blank and alive, plus the line-visibility timeline for the reading check
      const step = 0.25, times = [];
      for (let t = 0; t < D; t += step) times.push(r3(t));
      times.push(r3(D - 0.04));
      for (const x of [P.T1, P.T2, P.wipe.cover]) for (const d of [-0.1, 0.1]) times.push(r3(Math.min(D - 0.04, Math.max(0, x + d))));
      times.sort((a, b) => a - b);
      const blanks = [];
      const shares = [];
      for (const t of times) {
        const png = await S1.shot(t);
        let flat = 0; try { flat = flatShare(decodePng(png)); } catch { flat = 0; }
        shares.push([t, flat]);
        if (flat >= 0.995) blanks.push(t);
      }
      R.measured.frames_sampled = times.length;
      R.measured.max_flat_share = r3(Math.max(...shares.map((s) => s[1])));
      // a blank frame is a cut with nothing in it: runs longer than a frame pair, or any at the first/last second
      let run = [];
      const runs = [];
      for (const t of times) { if (blanks.includes(t)) run.push(t); else { if (run.length) runs.push(run); run = []; } }
      if (run.length) runs.push(run);
      for (const r of runs) {
        const span = r[r.length - 1] - r[0] + step;
        if (r.length >= 2) err("blank-frame", `blank frame(s) from ${r[0]}s to ${r3(r[r.length - 1])}s (${span.toFixed(2)}s of one flat colour): a cut with nothing on it`, { at: r[0] });
      }
      // deterministic seek: A-B-A, then a cold browser at A (and back to a late time then early: the rAF/CSS rebuild)
      const tA = r3(D * 0.2), tB = r3(D * 0.72), tC = r3(D * 0.95);
      const a1 = await S1.shot(tA), bb = await S1.shot(tB), a2 = await S1.shot(tA);
      const c1 = await S1.shot(tC), a3 = await S1.shot(tA);
      const same = (x, y) => sha(x) === sha(y);
      R.measured.seek = { A: tA, B: tB, ABA: same(a1, a2), A_after_C: same(a1, a3), A_differs_from_B: !same(a1, bb) };
      if (!same(a1, a2)) err("nondeterministic-seek", `A-B-A: the frame at ${tA}s differs after visiting ${tB}s (state leaks between seeks)`, { at: tA });
      if (!same(a1, a3)) err("nondeterministic-seek", `the frame at ${tA}s differs after a seek to ${tC}s and back (a backward seek must rebuild the scene)`, { at: tA });
      if (same(a1, bb)) warn("static-film", `the frames at ${tA}s and ${tB}s are identical: nothing moves between them`);
      const cold = await openSession(project, brief, { scale: 0.5 });
      try { const ca = await cold.shot(tA); R.measured.seek.cold = same(ca, a1); if (!same(ca, a1)) err("nondeterministic-seek", `a cold browser draws ${tA}s differently from the warm one (the first seek of a fresh page must equal A-B-A)`, { at: tA }); } finally { await cold.close(); }
      // reading: how long each line is fully on screen against the reading-time formula (warning severity: a new gate)
      const spans = new Map();
      const rstep = 0.1;
      for (let t = 0; t <= D - 0.04; t += rstep) {
        await S1.seek(r3(t));
        const lines = await S1.b.eval(LINES);
        for (const l of lines) { const e = spans.get(l.text) || { runs: [], cur: null, color: l.color }; if (l.vis >= 0.95) { if (e.cur == null) e.cur = t; e.last = t; } else if (e.cur != null) { e.runs.push([e.cur, e.last + rstep]); e.cur = null; } spans.set(l.text, e); }
      }
      R.measured.reading = [];
      const bg = brief.look.canvas;
      for (const [text, e] of spans) {
        if (e.cur != null) e.runs.push([e.cur, Math.min(D, e.last + rstep)]);
        const held = e.runs.reduce((m, r) => Math.max(m, r[1] - r[0]), 0), need = readTime(text, { slack: SLACK_RENDER });
        R.measured.reading.push({ text: text.slice(0, 60), words: wordCount(text), held_s: r3(held), needs_s: r3(need) });
        if (!e.runs.length) err("text-never-visible", `"${text.slice(0, 50)}" is never fully on screen`);
        else if (held < need) warn("text-too-brief", `"${text.slice(0, 50)}" is fully on screen ${held.toFixed(1)}s but ${wordCount(text)} word(s) need ${need.toFixed(1)}s to read (references/craft.md reading time)`, { held_s: r3(held), needs_s: r3(need), at: r3(e.runs[0][0]) });
        const pc = parseColor(e.color);
        if (pc && hexOk(bg) && contrast(pc.hex, bg) < 3) warn("text-low-contrast", `"${text.slice(0, 40)}" is ${contrast(pc.hex, bg).toFixed(1)}:1 against the canvas`);
      }
      // seek speed: the whole check is bounded
      R.measured.seek_ms = Math.round((Date.now() - t0));
    }
    // console: uncaught exceptions and errors anywhere
    for (const l of logs()) {
      if (/^exception:|^error:/.test(l)) { if (/Failed to load resource/i.test(l)) err("missing-asset", l.slice(0, 200)); else err("console-error", l.slice(0, 300)); }
      else if (/^warning:/.test(l) && !/GPU stall|WebGL/i.test(l)) warn("console-warning", l.slice(0, 200));
    }
  } finally { await S1.close(); }
  return finish(R, t0);
}
function finish(R, t0) {
  R.elapsed_s = r3((Date.now() - t0) / 1000);
  R.ok = !R.errors.length && !R.could_not_run;
  R.status = R.errors.length ? "findings" : R.could_not_run ? "could-not-run" : "ok";
  return R;
}

// ------------------------------------------------------------------------------------------------------------ audio + render
const probeDur = (f) => { const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", f], { encoding: "utf8" }); const d = parseFloat(r.stdout); return Number.isFinite(d) ? d : null; };

export function audioArgs(project, b, nextInput) {
  const au = b.audio || {}, D = b.duration_s, inputs = [], parts = [], labels = [];
  let k = nextInput;
  if (au.music) { inputs.push("-i", path.join(project, au.music.file)); parts.push(`[${k}:a]atrim=0:${D},asetpts=PTS-STARTPTS,afade=t=in:d=0.4,afade=t=out:st=${Math.max(0, D - 1.2)}:d=1.2,volume=${au.music.volume ?? 0.5}[m${k}]`); labels.push(`[m${k}]`); k++; }
  for (const s of au.sfx || []) { inputs.push("-i", path.join(project, s.file)); const ms = Math.round(s.at * 1000); parts.push(`[${k}:a]adelay=${ms}|${ms},volume=${s.volume ?? 0.8}[s${k}]`); labels.push(`[s${k}]`); k++; }
  if (!labels.length) return { inputs: [], map: [], filter: null };
  parts.push(`${labels.join("")}amix=inputs=${labels.length}:duration=longest:normalize=0,atrim=0:${D},aformat=sample_rates=48000:channel_layouts=stereo[a]`);
  return { inputs, filter: parts.join(";"), map: ["-map", "[a]", "-c:a", "aac", "-b:a", "160k"] };
}

export async function render(project, out, { fps, check: doCheck = true, engine = "cdp", quality = 20, log = () => {} } = {}) {
  const t0 = Date.now();
  const brief = loadBrief(project);
  if (!brief) return { ok: false, status: "findings", errors: [{ code: "no-brief", msg: `${BRIEF_REL} is missing: run scaffold` }] };
  const F = fps || Number(brief.fps) || QUICK.FPS, { D, W, H } = projectFacts(project, brief);
  let chk = null;
  if (doCheck) {
    chk = await check(project);
    if (!chk.ok) return { ok: false, status: chk.status, errors: chk.errors, could_not_run: chk.could_not_run, check: chk, note: "not rendered: the check must pass first (a quick preview is never a silent incomplete film)" };
  }
  const ff = ffmpegStatus();
  if (!ff.ok) return { ok: false, status: "could-not-run", could_not_run: `not run: ${ff.reason}` };
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  const compSha = fileSha(path.join(project, COMPOSITION_REL));
  let frames = Math.round(D * F), tCapture = Date.now();
  let audioInfo = "none (silent preview: quick.json declares no audio)";
  if (engine === "hyperframes") {
    const host = path.join(project, "index.html");
    if (!fs.existsSync(host) || !fs.existsSync(path.join(project, "hyperframes.json"))) return { ok: false, status: "could-not-run", could_not_run: "not run: the hyperframes engine needs the project's index.html host and hyperframes.json (run scaffold, then `video.mjs init`)" };
    const r = spawnSync("npx", ["--no-install", "hyperframes", "render", project, "-o", path.resolve(out), "--fps", String(F), "-q", "draft", "--quiet"], { encoding: "utf8", timeout: 900000 });
    if (r.status !== 0) return { ok: false, status: "could-not-run", could_not_run: `not run: hyperframes render failed (${(r.stderr || r.stdout || "").trim().split("\n").pop()})` };
    audioInfo = "mixed by HyperFrames from the host's <audio> clips";
  } else {
    const ses = await openSession(project, brief, { scale: 1 });
    const au = audioArgs(project, brief, 1);
    const args = ["-loglevel", "error", "-y", "-f", "image2pipe", "-framerate", String(F), "-vcodec", "mjpeg", "-i", "-", ...au.inputs];
    if (au.filter) args.push("-filter_complex", au.filter, "-map", "0:v", ...au.map); else args.push("-an");
    args.push("-c:v", "libx264", "-preset", "veryfast", "-crf", String(quality), "-pix_fmt", "yuv420p", "-r", String(F), "-t", String(D), "-movflags", "+faststart", path.resolve(out));
    const enc = spawn("ffmpeg", args, { stdio: ["pipe", "ignore", "pipe"] });
    let eerr = ""; enc.stderr.on("data", (d) => { eerr += d; });
    const done = new Promise((res) => { enc.on("close", (code) => res(code)); enc.on("error", () => res(-1)); });
    enc.stdin.on("error", () => {});
    tCapture = Date.now();
    try {
      for (let i = 0; i < frames; i++) {
        const jpg = await ses.shot(i / F, { format: "jpeg", quality: 92 });
        if (!enc.stdin.write(jpg)) await new Promise((r) => enc.stdin.once("drain", r));
        if (i % 60 === 0) log(`frame ${i}/${frames}`);
      }
      enc.stdin.end();
    } finally { await ses.close(); }
    const code = await done;
    if (code !== 0) return { ok: false, status: "could-not-run", could_not_run: `not run: ffmpeg failed (${eerr.trim().split("\n").pop()})` };
    if (au.filter) audioInfo = `mixed: ${brief.audio.music ? "music " + brief.audio.music.file : "no music"}${(brief.audio.sfx || []).length ? `, ${brief.audio.sfx.length} sfx` : ""}`;
  }
  const dur = probeDur(path.resolve(out));
  const pr = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate,nb_frames", "-of", "json", path.resolve(out)], { encoding: "utf8" });
  let vs = {}; try { vs = JSON.parse(pr.stdout).streams[0]; } catch {}
  const report = {
    ok: dur != null && Math.abs(dur - D) < 0.5, status: dur != null && Math.abs(dur - D) < 0.5 ? "ok" : "check", engine, out: path.resolve(out), duration_s: dur, expected_s: D, fps: F, size: `${vs.width}x${vs.height}`, frames: Number(vs.nb_frames) || frames, audio: audioInfo,
    composition_sha256: compSha, brief_sha256: fileSha(path.join(project, BRIEF_REL)), check_elapsed_s: chk ? chk.elapsed_s : null, check_status: chk ? chk.status : "skipped",
    capture_seconds: r3((Date.now() - tCapture) / 1000), time_to_first_draft_s: r3((Date.now() - t0) / 1000), rendered_at: new Date().toISOString(),
  };
  fs.writeFileSync(path.resolve(out).replace(/\.mp4$/i, "") + ".json", JSON.stringify(report, null, 2) + "\n");
  return report;
}

// ------------------------------------------------------------------------------------------------------------ scaffold
export const briefTemplate = () => ({
  schema: QUICK.SCHEMA, kind: "explainer", duration_s: 30, size: { w: 1280, h: 720 }, seed: 7,
  source: { kind: "prompt|captured-public|script|assets", note: "where every word below came from" },
  kicker: "", title: "<the film's one title, from the brief>", tagline: "",
  mechanism: { heading: "<what the diagram shows>", steps: [{ label: "<step 1>", detail: "" }, { label: "<step 2>", detail: "" }, { label: "<step 3>", detail: "" }] },
  endcard: { line: "<the closing line>", sub: "" },
  facts: [], assets: [], audio: {}, regulated: false,
  look: "(filled from the approved Look: <run>/look/DESIGN.md; give it only when the run has none: canvas, ink, accent, display, optional support, muted, body, weight)",
});
const rolesOf = (B, r) => { const v = B.roles && B.roles[r]; return Array.isArray(v) ? v[0] || null : typeof v === "string" ? v : null; };

// the run's approved Look: <run>/look/DESIGN.md, else the picked design system's DESIGN.md -> { source, canvas, ink, accent, support, muted, display, body, weight }
export function lookFromRun(run) {
  const dec = rj(path.join(run, "decisions.json")) || {};
  const label = dec.design_system && dec.design_system.picked !== false && dec.design_system.label;
  const cands = [path.join(run, "look", "DESIGN.md"), label && path.join(run, "design", label, "DESIGN.md")].filter(Boolean);
  const f = cands.find((c) => fs.existsSync(c));
  if (!f) return null;
  try {
    const B = readDesignMd(f);
    const L = { source: path.relative(run, f).split(path.sep).join("/"), source_sha256: fileSha(f), canvas: rolesOf(B, "canvas"), ink: rolesOf(B, "ink"), accent: rolesOf(B, "accent"), support: rolesOf(B, "support"), muted: rolesOf(B, "muted"), display: B.fonts && B.fonts.display && B.fonts.display.family, body: B.fonts && (B.fonts.body || B.fonts.display) && (B.fonts.body || B.fonts.display).family };
    return L;
  } catch { return null; }
}

export async function scaffold({ run, project, duration, briefFile, offline = false }) {
  const out = { ok: false, warnings: [] };
  const rp = path.resolve(run), pj = path.resolve(project);
  const bf = briefFile ? path.resolve(briefFile) : path.join(rp, "quick", "brief.json");
  let b = rj(bf);
  if (!b) return { ...out, status: "findings", errors: [{ code: "no-brief", msg: `no quick brief at ${bf}: write one (quick-film.mjs scaffold --print-brief-template) from the run's confirmed brief; every word on screen must come from it` }] };
  b = JSON.parse(JSON.stringify(b));
  if (duration != null) b.duration_s = Number(duration);
  b.size = b.size || { w: 1280, h: 720 };
  // the approved Look wins; a brief look is only for a run that has none
  const approved = fs.existsSync(rp) ? lookFromRun(rp) : null;
  if (approved && approved.canvas && approved.ink && approved.accent && approved.display) {
    if (b.look && typeof b.look === "object") for (const k of ["canvas", "ink", "accent", "display"]) if (b.look[k] && approved[k] && String(b.look[k]).toLowerCase() !== String(approved[k]).toLowerCase()) out.warnings.push(`look.${k} ${b.look[k]} differs from the approved Look (${approved[k]}); the approved Look is used`);
    b.look = { ...(typeof b.look === "object" ? b.look : {}), ...Object.fromEntries(Object.entries(approved).filter(([, v]) => v)) };
  } else if (typeof b.look !== "object" || !b.look) b.look = {};
  const v = validateBrief(b);
  const logUp = (reason) => { const f = path.join(rp, "quick", "upgrades.jsonl"); try { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.appendFileSync(f, JSON.stringify({ at: new Date().toISOString(), event: "upgrade", from: "quick-preview", to: "full-crew", stage: "scaffold", reason }) + "\n"); } catch {} };
  if (v.upgrade.length) { for (const m of v.upgrade) logUp(m); return { ...out, status: "needs-full-crew", errors: v.upgrade.map((m) => ({ code: "needs-full-crew", msg: `${m}: logged as an upgrade in ${path.join(rp, "quick", "upgrades.jsonl")}; plan the film with crew.mjs (a quick preview is never a silent incomplete film)` })), upgrade_logged: true };
  }
  if (v.errors.length) return { ...out, status: "findings", errors: v.errors.map((m) => ({ code: "brief", msg: m })) };
  out.warnings.push(...v.warnings);
  fs.mkdirSync(path.join(pj, "compositions", "quick"), { recursive: true });
  fs.mkdirSync(path.join(pj, "assets", "vendor"), { recursive: true });
  fs.copyFileSync(GSAP_PATH, path.join(pj, "assets", "vendor", "gsap.min.js"));
  // fonts: staged into the project (the user's files, then HyperFrames' own list, then the web unless --offline)
  let fontCss = "";
  for (const fam of [...new Set([b.look.display, b.look.body].filter(Boolean))]) {
    const st = await stageFont(fam, [Number(b.look.weight) || 800, 400, 600], pj, { offline });
    if (st.css) fontCss += (fontCss ? "\n" : "") + st.css;
    if (st.source === "unavailable") { out.warnings.push(`font "${fam}" could not be staged (offline or not on a font host): the check will report missing-font until a file is in assets/fonts/`); noteDowngrade({ run: rp, what: `quick-preview font ${fam}`, instead: "no file staged", why: "not found locally or on a font host", impact: "check refuses until the font is staged" }); }
  }
  fs.writeFileSync(path.join(pj, BRIEF_REL), JSON.stringify(b, null, 2) + "\n");
  fs.writeFileSync(path.join(pj, COMPOSITION_REL), compositionHtml(b, { fontCss }));
  const host = path.join(pj, "index.html");
  let hostNote = "written";
  if (!fs.existsSync(host) || /data-rasanai-quick-host/.test(fs.readFileSync(host, "utf8"))) fs.writeFileSync(host, hostHtml(b));
  else hostNote = "kept (the project already has an index.html that is not a quick host)";
  const P = plan(b);
  return { ok: true, status: "ok", project: pj, composition: path.join(pj, COMPOSITION_REL), brief: path.join(pj, BRIEF_REL), host: hostNote, plan: { duration_s: P.duration_s, beats: P.beats, cues: P.cues }, look_source: b.look.source || "brief", warnings: out.warnings, next: [`node skills/rasanai/scripts/quick-film.mjs check --project ${pj} --json`, `node skills/rasanai/scripts/quick-film.mjs render --project ${pj} --out ${path.join(pj, "renders", "quick-preview.mp4")}`] };
}

// ------------------------------------------------------------------------------------------------------------ promote
// Record the quick draft as the film's ORIGIN and hand it to the normal flow. Nothing is restarted: the brief, the Look, the
// storyboard, the score seed and the actual preview are saved into <run>/quick/ and the next commands are the normal ones.
export function promote({ run, project, reason, budget }) {
  const rp = path.resolve(run), pj = path.resolve(project);
  const brief = loadBrief(pj);
  if (!brief) return { ok: false, status: "findings", errors: [{ code: "no-brief", msg: "no quick.json in the project: nothing to promote" }] };
  const mp4 = path.join(pj, "renders", "quick-preview.mp4"), rep = rj(mp4.replace(/\.mp4$/, "") + ".json");
  if (!fs.existsSync(mp4) || !rep) return { ok: false, status: "findings", errors: [{ code: "no-preview", msg: "there is no rendered preview (renders/quick-preview.mp4 and its .json): render first, so promotion records the actual draft" }] };
  const compFile = path.join(pj, COMPOSITION_REL);
  if (!fs.existsSync(compFile)) return { ok: false, status: "findings", errors: [{ code: "no-composition", msg: `${COMPOSITION_REL} is missing` }] };
  if (rep.composition_sha256 !== fileSha(compFile) || rep.brief_sha256 !== fileSha(path.join(pj, BRIEF_REL))) return { ok: false, status: "findings", errors: [{ code: "stale-preview", msg: "the composition or brief changed after the preview was rendered: re-run check and render, so the recorded preview is the one that is promoted" }] };
  const bv = validateBrief(brief);
  if (bv.errors.length || bv.upgrade.length) return { ok: false, status: "findings", errors: [...bv.errors, ...bv.upgrade].map((m) => ({ code: "brief", msg: m })) };
  const q = path.join(rp, "quick");
  fs.mkdirSync(q, { recursive: true });
  const P = plan(brief), at = new Date().toISOString();
  fs.copyFileSync(mp4, path.join(q, "preview.mp4"));
  fs.copyFileSync(compFile, path.join(q, "composition.html"));
  fs.writeFileSync(path.join(q, "brief.json"), JSON.stringify(brief, null, 2) + "\n");
  const steps = brief.mechanism.steps;
  const storyboard = {
    origin: "quick-html-draft", duration_s: P.duration_s,
    beats: [
      { n: 1, id: "title", from_s: 0, to_s: P.T1, shows: [brief.kicker, brief.title, brief.tagline].filter(Boolean) },
      { n: 2, id: "mechanism", from_s: P.T1, to_s: P.T2, shows: [brief.mechanism.heading, ...steps.map((s) => s.label)] },
      { n: 3, id: "end", from_s: P.T2, to_s: P.duration_s, shows: [brief.endcard.line, brief.endcard.sub].filter(Boolean) },
    ],
    facts: brief.facts || [], source: brief.source,
  };
  fs.writeFileSync(path.join(q, "storyboard.json"), JSON.stringify(storyboard, null, 2) + "\n");
  const score = { origin: "quick-html-draft", _note: "a draft seed for the Motion Director, NOT the film's motion/score.json: the full crew writes that", duration_s: P.duration_s, cues: P.cues, accent: brief.look.accent, transitions: [{ at_s: P.wipe.cover, kind: "accent wipe" }, { at_s: P.push.from, kind: "push" }], carriers: ["accent bar / signal dot / accent wipe"], audio: brief.audio || {} };
  fs.writeFileSync(path.join(q, "score.json"), JSON.stringify(score, null, 2) + "\n");
  const look = { origin: "quick-html-draft", look: brief.look, approved_look_file: brief.look.source || null, approved_look_sha256: brief.look.source_sha256 || null };
  fs.writeFileSync(path.join(q, "look.json"), JSON.stringify(look, null, 2) + "\n");
  const origin = {
    origin: "quick-html-draft", promoted_at: at, reason: reason || "the quick draft is the starting point of the normal workflow",
    composition: { path: COMPOSITION_REL, sha256: fileSha(compFile), saved_as: "quick/composition.html" },
    brief_sha256: fileSha(path.join(pj, BRIEF_REL)),
    preview: { path: "quick/preview.mp4", sha256: fileSha(mp4), duration_s: rep.duration_s, fps: rep.fps, size: rep.size, engine: rep.engine, time_to_first_draft_s: rep.time_to_first_draft_s },
    saved: ["quick/storyboard.json", "quick/score.json", "quick/look.json", "quick/brief.json"],
    gates: "a quick draft is NOT delivered on its own authority: obey.mjs, slop.mjs, motion-gate.mjs and sound checks, and the Final review still apply",
  };
  fs.writeFileSync(path.join(q, "origin.json"), JSON.stringify(origin, null, 2) + "\n");
  fs.appendFileSync(path.join(q, "upgrades.jsonl"), JSON.stringify({ at, event: "promote", from: "quick-preview", to: budget ? `crew --budget ${budget}` : "normal workflow", reason: origin.reason }) + "\n");
  // credits: the draft's own audio and fonts are listed where deliver.mjs already looks
  const au = brief.audio || {}, lines = [];
  if (au.music) lines.push(`Music: ${au.music.credit} (${au.music.licence}) [quick-preview draft: ${au.music.file}]`);
  for (const s of au.sfx || []) lines.push(`SFX: ${s.credit || s.file} (${s.licence})`);
  for (const a of brief.assets || []) lines.push(`Image: ${a.file} (${a.licence})`);
  if (lines.length) { fs.mkdirSync(path.join(rp, "music"), { recursive: true }); fs.writeFileSync(path.join(rp, "music", "CREDITS-quick-preview.txt"), lines.join("\n") + "\n"); }
  // the decision log
  const df = path.join(rp, "decisions.json");
  try { const d = rj(df) || {}; d.quick_preview = { origin: "quick-html-draft", promoted_at: at, preview: "quick/preview.mp4", composition_sha256: origin.composition.sha256, look: brief.look.source || "quick.json", reason: origin.reason }; fs.writeFileSync(df, JSON.stringify(d, null, 2) + "\n"); } catch {}
  return {
    ok: true, status: "ok", origin: path.join(q, "origin.json"), saved: origin.saved.concat(["quick/preview.mp4", "quick/composition.html", "quick/upgrades.jsonl"]),
    credits: lines.length ? "music/CREDITS-quick-preview.txt" : null,
    next: [
      "the draft can be shown in the Animatic as the preview reference (quick/preview.mp4); the Final still needs the usual gates",
      `ambitious build: node skills/rasanai/scripts/crew.mjs plan --run ${rp} --route general-video --subject "<name>" --length ${P.duration_s} --project ${pj} --budget ${budget || "lean"}  (members read quick/origin.json, storyboard.json, look.json and the preview: nothing restarts)`,
      `then the normal chain on ${pj}: video.mjs write / inject, obey.mjs, slop.mjs, motion-gate.mjs, render, video.mjs deliver`,
    ],
  };
}
