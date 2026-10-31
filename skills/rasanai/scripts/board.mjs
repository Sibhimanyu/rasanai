#!/usr/bin/env node
// Keyframe board: the director's checkpoint before the build.
// For every shot: pose cards (the frame at each key moment, in the real look),
// and between each pair the easing curve + duration that carries one pose to
// the next. A live stage at the top scrubs/plays the shot from the poses, so
// "hold longer on 3" or "snap into 4" can be judged before anything is built.
// Segment timings are checked against motion.md's scale and ease set; off-contract
// segments are flagged red on the board and listed in board.json.
//
// usage: node board.mjs --poses keyframes.json --motion motion.md [--frame frame.md | --preset id] \
//          --out <dir> [--still]
//        node board.mjs --poses keyframes.json --motion motion.md --validate   (checks only, no page; exit 3 on issues)
// Pose file format: references/board-format.md
//
// Story board (before any build): node board.mjs --concept <concept.json> --out <dir> [--pick <id|index>] [--cols 4]
//   renders the concept's shots[] ({t, see, style, carrier_state, move, transition, words}, optional image/signature/accent_word) as
//   <dir>/story-board.png: one tile per shot with its words and move, the style world, carrier and signature moment. A tile's image
//   is the shot's own `image` plate (e.g. from imagegen.mjs) when it exists. JSON on stdout.
import fs from "node:fs";
import path from "node:path";
import {
  parseArgs, die, readJSON, readFrontmatterDoc, readLook, normalizeAspect, esc, googleFontLink,
  writeFile, parseEase, chromeScreenshot, chromeDumpDom, gsapInline,
} from "./lib/common.mjs";
import { resolvePreset } from "./lib/hyperframes.mjs";
import { classify, bannedHits } from "./lib/signatures.mjs";
import "./lib/motion-lang.mjs"; // motion-language terms ("lang-snappy") resolve like swatch ids

const args = parseArgs();
if (args.concept) {
  const { runStoryBoard } = await import("./lib/story-board.mjs");
  await runStoryBoard(args);
  process.exit(0);
}
if (!args.poses) die("--poses required (keyframes.json)");
if (!args.motion) die("--motion required (motion.md)");
if (!args.out && !args.validate) die("--out required (or --validate for checks only)");
const K = readJSON(args.poses);
const M = readFrontmatterDoc(fs.readFileSync(args.motion, "utf8")).fields;
const look = readLook(args.frame || (args.preset ? resolvePreset(args.preset) : null));
const [W, H] = normalizeAspect(K.aspect || "16:9").split("x").map(Number);
if (!Array.isArray(K.shots) || !K.shots.length) die("keyframes.json needs shots[]");

const scale = (M.tempo && M.tempo.scale_ms) || [];
const easeSet = M.easing || {};
// the fluent contract (references/motion-md-contract.md): any curve in the language's family (its signature eases and
// its role curves), and a duration inside the language's pace band (durations come from travel, so there is no grid)
const curveSet = [...Object.values(easeSet), ...Object.values(M.curves || {})].map(String);
const inSet = (e) => curveSet.includes(String(e)) || curveSet.some((x) => !/[(]/.test(x) && parseEase(x).family === parseEase(e).family && parseEase(x).dir === parseEase(e).dir);
const band = M.durations ? [M.durations.min_ms * 0.5, M.durations.max_ms * 1.6] : scale.length ? [scale[0] * 0.85, scale[scale.length - 1] * 1.6] : null;
const onScale = (ms) => !band || (ms >= band[0] && ms <= band[1]);

// Stagger: an element with `split` animates its units one after another, so a
// segment really ends at t + ms + each*(units-1) for that element. Validation
// and the live stage both use that real end.
const eachMs = (M.stagger && M.stagger.each_ms) || 0;
function unitCount(el) {
  if (!el || !el.split || !el.text) return 1;
  const t = String(el.text);
  if (el.split === "chars") return t.replace(/\s|\|/g, "").length || 1;
  if (el.split === "words") return t.split(/[\s|]+/).filter(Boolean).length || 1;
  if (el.split === "lines") return t.split("|").length;
  return 1;
}
const spreadMs = (el) => eachMs * (unitCount(el) - 1);

function visOf(st) {
  if (!st) return null;
  const inset = (c) => { const m = String(c || "").match(/inset\(([^)]*)\)/); return m ? Math.max(...m[1].split(/\s+/).map((x) => parseFloat(x) || 0)) : null; };
  if (st.opacity !== undefined && st.opacity <= 0.2) return 0;
  if (st.clip !== undefined && inset(st.clip) !== null && inset(st.clip) >= 45) return 0;
  for (const k of ["scale", "scaleX", "scaleY"]) if (st[k] !== undefined && st[k] <= 0.05) return 0;
  if (["opacity", "clip", "scale", "scaleX", "scaleY"].some((k) => st[k] !== undefined)) return 1;
  return null;
}

// hold = nothing changes; enter = something becomes visible; exit = something
// hides (and nothing appears); else move. Matches obey.mjs's classes.
function guessKind(a, b) {
  const sb = b.state || {};
  if (!Object.keys(sb).length) return "hold";
  let enter = false, exit = false, change = false;
  for (const id of Object.keys(sb)) {
    const prev = a.__cum[id] || {};
    if (JSON.stringify({ ...prev, ...sb[id] }) !== JSON.stringify(prev)) change = true;
    const before = visOf(prev), after = visOf(b.__cum[id]);
    if (after === 1 && before === 0) enter = true;
    if (after === 0 && before !== 0) exit = true;
  }
  if (!change) return "hold";
  if (exit && !enter) return "exit";
  if (enter) return "enter";
  return "move";
}

const issues = [];
const flag = (shot, si, seg, where, problem) => {
  issues.push({ shot: shot.id || si + 1, segment: where, problem });
  if (seg && !seg.flag) seg.flag = problem;
};
K.shots.forEach((shot, si) => {
  if (!Array.isArray(shot.poses) || shot.poses.length < 2) die(`shot ${shot.id || si + 1} needs at least 2 poses`);
  if (!Array.isArray(shot.elements) || !shot.elements.length) die(`shot ${shot.id || si + 1} needs elements[]`);
  const byId = Object.fromEntries(shot.elements.map((e) => [e.id, e]));
  shot.poses.sort((a, b) => a.t - b.t);
  const acc = {};
  shot.poses.forEach((p, i) => {
    for (const id of Object.keys(p.state || {})) if (!byId[id]) die(`shot ${shot.id || si + 1} pose ${i + 1} sets unknown element "${id}"`);
    for (const [id, st] of Object.entries(p.state || {})) acc[id] = { ...(acc[id] || {}), ...st };
    Object.defineProperty(p, "__cum", { value: JSON.parse(JSON.stringify(acc)), enumerable: false });
  });
  // segments[].from is the index of the pose the segment starts at (0-based)
  shot.segments = shot.poses.slice(0, -1).map((p, i) => {
    const given = (shot.segments || []).find((s) => s.from === i) || {};
    const next = shot.poses[i + 1];
    const ms = Math.round((next.t - p.t) * 1000);
    const kind = given.kind || guessKind(p, next);
    const ease = kind === "hold" ? "hold" : given.ease || easeSet[kind] || easeSet.move;
    const movers = Object.keys(next.state || {});
    const spread = Math.max(0, ...movers.map((id) => spreadMs(byId[id])));
    const seg = { from: i, to: i + 1, ms, spread_ms: spread, ease, kind, note: given.note || "" };
    const where = `${i + 1}->${i + 2}`;
    if (kind !== "hold" && !onScale(ms)) flag(shot, si, seg, where, `${ms}ms is outside the language's pace band ${band ? band.map(Math.round).join("-") : "?"} ms (the segment's duration is the per-element duration)`);
    else if (kind !== "hold" && !inSet(ease)) flag(shot, si, seg, where, `ease ${ease} is not in motion.md`);
    else if (kind === "hold" && Object.values(next.__cum).some((st) => visOf(st) !== 0) && ms < ((M.holds && M.holds.min_ms) || 0) * 0.85) flag(shot, si, seg, where, `hold ${ms}ms is shorter than motion.md's ${M.holds.min_ms}ms`);
    return seg;
  });
  // a staggered segment must finish before the pose after next starts moving it again
  shot.segments.forEach((seg, i) => {
    if (seg.kind === "hold" || !seg.spread_ms) return;
    const endT = shot.poses[seg.from].t + (seg.ms + seg.spread_ms) / 1000;
    const following = shot.segments.slice(i + 1).find((x) => x.kind !== "hold");
    if (following && shot.poses[following.from].t < endT - 0.001)
      flag(shot, si, seg, `${i + 1}->${i + 2}`, `stagger spreads this segment to ${seg.ms + seg.spread_ms}ms (ends ${endT.toFixed(2)}s) but the next move starts at ${shot.poses[following.from].t.toFixed(2)}s; move later poses back`);
  });
  // banned patterns: approved keyframes are binding on the build, so a pose pair
  // that would force a banned move must be caught here, not by obey after the build
  const banned = M.banned || [];
  const px = Math.min(W, H) / 100; // 1 cqmin in canvas px
  const BASE = { opacity: 1, x: 0, y: 0, scale: 1, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0, blur: 0, clip: "inset(0% 0% 0% 0%)", letterSpacing: 0 };
  const toTween = (st) => {
    const o = {};
    for (const [k, v] of Object.entries(st)) {
      if (k === "x" || k === "y") o[k] = v * px;
      else if (k === "blur") o.filter = `blur(${v * px}px)`;
      else if (k === "clip") o.clipPath = v;
      else o[k] = v;
    }
    return o;
  };
  shot.segments.forEach((seg, i) => {
    if (seg.kind === "hold") return;
    const a = shot.poses[seg.from], b = shot.poses[seg.to];
    for (const [id, next] of Object.entries(b.state || {})) {
      const keys = Object.keys(next);
      const prev = {};
      for (const k of keys) prev[k] = (a.__cum[id] || {})[k] ?? BASE[k];
      const t = { isEl: true, dur: seg.ms / 1000, keys: keys.map((k) => (k === "clip" ? "clipPath" : k === "blur" ? "filter" : k)), from: toTween(prev), to: toTween({ ...prev, ...next }), ease: seg.ease };
      const cls = classify(t);
      for (const hit of bannedHits(t, cls, banned)) flag(shot, si, seg, `${i + 1}->${i + 2}`, `"${id}" ${cls} matches the banned pattern "${hit}" (motion.md bans it); change the pose states or the segment ease`);
    }
  });

  // per-element holds, measured from the element's real (staggered) end
  const minHold = (M.holds && M.holds.min_ms) || 0;
  if (minHold) {
    for (const id of Object.keys(byId)) {
      let shownEnd = null;
      shot.poses.forEach((p, i) => {
        if (i === 0) return;
        const before = visOf(shot.poses[i - 1].__cum[id]), after = visOf(p.__cum[id]);
        if (before === 0 && after === 1) shownEnd = p.t + spreadMs(byId[id]) / 1000;
        if (after === 0 && before !== 0 && shownEnd !== null) {
          const hold = Math.round((shot.poses[i - 1].t - shownEnd) * 1000);
          if (hold < minHold * 0.85) flag(shot, si, shot.segments[i - 1], `pose ${i}->${i + 1}`, `"${id}" holds ${hold}ms after it has fully arrived; motion.md wants >= ${minHold}ms (move its exit later or its entrance earlier)`);
          shownEnd = null;
        }
      });
    }
  }
});

// hero pose per shot: the pose with the most visible elements
K.shots.forEach((shot) => {
  let best = -1;
  shot.poses.forEach((p, i) => {
    const n = Object.keys(p.__cum).filter((id) => visOf(p.__cum[id]) !== 0).length;
    if (n > best) { best = n; shot.hero = i; }
  });
});

// layout: portrait stages get narrower cards so a whole shot fits the still
const portrait = H > W;
const LIVE_W = portrait ? 320 : 560;
const CARD_W = portrait ? 150 : 240;
const SEG_W = 150;

if (args.validate) {
  console.log(JSON.stringify({ validate: true, shots: K.shots.length, issues }, null, 2));
  process.exit(issues.length ? 3 : 0);
}

const html = `<!doctype html>
<html lang="en"><head><meta charset="UTF-8" />
<title>Keyframe board: ${esc(K.title || K.content || "")}</title>
${gsapInline()}
${googleFontLink(look.font)}
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #0c0c0e; color: #e8e6e1; font: 14px/1.4 ui-monospace, "JetBrains Mono", Menlo, monospace; padding: 40px 48px 80px; width: 1600px; }
  h1 { font: 600 22px/1.2 ui-sans-serif, system-ui, sans-serif; margin-bottom: 6px; }
  .meta { color: #8d8a84; margin-bottom: 18px; }
  .chips span { display: inline-block; border: 1px solid #34332f; border-radius: 99px; padding: 3px 10px; margin: 0 6px 6px 0; color: #cfccc5; }
  .issues { background: #3a1414; border: 1px solid #7a2a2a; color: #ffb4a8; padding: 10px 14px; border-radius: 6px; margin: 10px 0 18px; }
  .shot { margin-top: 34px; }
  .shot h2 { font: 600 16px/1.2 ui-sans-serif, system-ui, sans-serif; margin-bottom: 12px; height: 20px; }
  .live { display: flex; gap: 20px; align-items: flex-start; margin-bottom: 16px; }
  .controls { display: flex; flex-direction: column; gap: 8px; width: 360px; }
  .controls button { background: #e8e6e1; color: #0c0c0e; border: 0; border-radius: 4px; padding: 6px 12px; font: inherit; cursor: pointer; width: 90px; }
  .controls input { width: 100%; }
  .row { display: flex; flex-wrap: wrap; align-items: stretch; row-gap: 22px; padding-bottom: 8px; }
  .pose { flex: 0 0 auto; width: ${CARD_W}px; }
  .pose .n { display: inline-block; background: #e8e6e1; color: #0c0c0e; border-radius: 3px; padding: 0 6px; margin-right: 6px; }
  .pose .cap { margin-top: 6px; color: #cfccc5; height: 40px; overflow: hidden; } .pose .cap small { display: block; color: #8d8a84; }
  .seg { flex: 0 0 auto; width: ${SEG_W}px; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 0 8px; color: #8d8a84; text-align: center; }
  .seg svg { width: 120px; height: 70px; background: #151518; border-radius: 4px; }
  .seg.bad svg { outline: 2px solid #d9534f; } .seg.bad .lbl { color: #ff8a80; }
  .seg .lbl { margin-top: 6px; font-size: 12px; } .seg .lbl b { color: #e8e6e1; font-weight: 500; }
  /* stage units: cqmin = 1% of the stage's SHORTER side, so type reads the same in 16:9 and 9:16 */
  .stage { position: relative; background: ${look.bg}; color: ${look.ink}; overflow: hidden; border-radius: 4px; container-type: size; }
  .el { position: absolute; white-space: nowrap; line-height: 1.05; }
  .el.display { font-family: "${look.font}", Inter, sans-serif; font-weight: ${look.fontWeight}; letter-spacing: -0.02em; }
  .el.mono { font-family: ui-monospace, "JetBrains Mono", monospace; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; }
  .el .u { display: inline-block; white-space: pre; }
  .el div.u { display: block; }
  .el.shape { background: currentColor; }
  .el.logo { border-radius: 50%; border: 0.9cqmin solid currentColor; background: none; }
</style></head><body>
<h1>Keyframe board: ${esc(K.title || K.content || "untitled")}</h1>
<div class="meta">${esc(K.content || "")} · ${W}×${H} · motion: ${esc(M.personality === "custom" ? `${M.parent} (${(M.adjustments || []).join(", ")})` : M.personality)}</div>
<div class="chips">${[
  `enter ${easeSet.enter}`, `exit ${easeSet.exit}`, `move ${easeSet.move}`, `scale ${scale.join("/")}ms`,
  `stagger ${eachMs}ms`, `hold ≥ ${M.holds ? M.holds.min_ms : "?"}ms`,
].map((c) => `<span>${esc(c)}</span>`).join("")}</div>
${issues.length ? `<div class="issues"><b>${issues.length} problem(s) against the motion contract</b> (fix before approving):<br>${issues.map((i) => `shot ${esc(i.shot)} · ${esc(i.segment)} · ${esc(i.problem)}`).join("<br>")}</div>` : ""}
<div id="shots"></div>
<script>
var K = ${JSON.stringify(K).replace(/</g, "\\u003c")};
var EACH = ${eachMs / 1000};
var RATIO = ${H / W};
var COLORS = { ink: "${look.ink}", accent: "${look.accent}", bg: "${look.bg}" };
// role defaults: position (% of stage), size (cqmin), font, colour, shape box (cqmin)
var ROLE = {
  headline: { top: 44, left: 50, size: 13, font: "display" },
  sub:      { top: 62, left: 50, size: 4.2, font: "display", weight: 500 },
  label:    { top: 9, left: 12, size: 2.8, font: "mono" },
  stat:     { top: 42, left: 50, size: 30, font: "display" },
  rule:     { top: 54, left: 50, w: 45, h: 0.8, color: "accent", shape: true },
  box:      { top: 50, left: 50, w: 20, h: 20, color: "accent", shape: true },
  logo:     { top: 45, left: 50, w: 18, h: 18, color: "accent", shape: true, logo: true }
};
function stateToGsap(s) {
  var o = {};
  if (!s) return o;
  ["opacity", "scale", "scaleX", "scaleY", "rotation", "skewX"].forEach(function (k) { if (s[k] !== undefined) o[k] = s[k]; });
  if (s.x !== undefined) o.x = s.x + "cqmin";
  if (s.y !== undefined) o.y = s.y + "cqmin";
  if (s.clip !== undefined) o.clipPath = s.clip;
  if (s.blur !== undefined) o.filter = "blur(" + s.blur + "cqmin)";
  if (s.letterSpacing !== undefined) o.letterSpacing = s.letterSpacing + "em";
  return o;
}
function cumulative(shot, i) {
  var acc = {};
  for (var k = 0; k <= i; k++) {
    var st = shot.poses[k].state || {};
    Object.keys(st).forEach(function (id) { acc[id] = Object.assign({}, acc[id] || {}, st[id]); });
  }
  return acc;
}
function splitUnits(text, mode) {
  if (mode === "chars") return text.replace(/\\|/g, " ").split("");
  if (mode === "words") return text.replace(/\\|/g, " ").split(/(\\s+)/);
  if (mode === "lines") return text.split("|");
  return [text.replace(/\\|/g, " ")];
}
function makeStage(shot, width) {
  var stage = document.createElement("div");
  stage.className = "stage";
  stage.style.width = width + "px";
  stage.style.height = Math.round(width * RATIO) + "px";
  (shot.elements || []).forEach(function (e) {
    var r = Object.assign({}, ROLE[e.role] || ROLE.headline, e);
    var at = Object.assign({ top: r.top, left: r.left }, e.at || {});
    var n = document.createElement("div");
    n.className = "el " + (r.shape ? "shape" + (r.logo ? " logo" : "") : r.font === "mono" ? "mono" : "display");
    n.dataset.id = e.id;
    n.style.top = at.top + "%";
    n.style.left = at.left + "%";
    var align = r.align || (at.left < 30 ? "left" : at.left > 70 ? "right" : "center");
    n.style.translate = (align === "left" ? "0" : align === "right" ? "-100%" : "-50%") + " -50%";
    n.style.textAlign = align;
    n.style.color = COLORS[r.color] || r.color || COLORS.ink;
    if (r.origin) n.style.transformOrigin = r.origin;
    if (r.shape) { n.style.width = r.w + "cqmin"; n.style.height = r.h + "cqmin"; }
    else {
      n.style.fontSize = r.size + "cqmin";
      if (r.weight) n.style.fontWeight = r.weight;
      if (r.split && e.text) {
        splitUnits(e.text, r.split).forEach(function (u) {
          if (r.split === "lines") { var d = document.createElement("div"); d.className = "u"; d.textContent = u; n.appendChild(d); }
          else if (/^\\s+$/.test(u)) n.appendChild(document.createTextNode(u));
          else { var sp = document.createElement("span"); sp.className = "u"; sp.textContent = u; n.appendChild(sp); }
        });
      } else if (e.text) n.innerHTML = e.text.split("|").map(function (x) { return x.replace(/</g, "&lt;"); }).join("<br>");
    }
    stage.appendChild(n);
  });
  return stage;
}
// element-level state goes on the element; for split elements the animated
// properties go on its units, which is what the build will do
function targetsFor(stage, id) {
  var n = stage.querySelector('[data-id="' + id + '"]');
  if (!n) return null;
  var units = n.querySelectorAll(".u");
  return { el: n, units: units.length ? units : null };
}
function applyState(stage, state) {
  Object.keys(state).forEach(function (id) {
    var t = targetsFor(stage, id);
    if (t) gsap.set(t.units || t.el, stateToGsap(state[id]));
  });
}
function curve(ease, bad) {
  var NS = "http://www.w3.org/2000/svg";
  var svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 120 70");
  var d = "";
  if (ease === "hold") d = "M6 35 L114 35";
  else {
    var f = gsap.parseEase(ease);
    for (var i = 0; i <= 60; i++) {
      var x = i / 60, y = f(x);
      d += (i ? "L" : "M") + (6 + x * 108).toFixed(1) + " " + (62 - y * 54).toFixed(1) + " ";
    }
  }
  var base = document.createElementNS(NS, "path");
  base.setAttribute("d", "M6 62 L114 62 M6 8 L114 8"); base.setAttribute("stroke", "#2a2a2e"); base.setAttribute("fill", "none");
  var p = document.createElementNS(NS, "path");
  p.setAttribute("d", d); p.setAttribute("fill", "none"); p.setAttribute("stroke-width", "2.2");
  p.setAttribute("stroke", bad ? "#ff6b5b" : ease === "hold" ? "#6b6963" : "${look.accent}");
  if (ease === "hold") p.setAttribute("stroke-dasharray", "4 4");
  svg.appendChild(base); svg.appendChild(p);
  return svg;
}
var root = document.getElementById("shots");
K.shots.forEach(function (shot, si) {
  var sec = document.createElement("section"); sec.className = "shot";
  var total = shot.poses[shot.poses.length - 1].t;
  var h2 = document.createElement("h2"); h2.textContent = "Shot " + (si + 1) + (shot.title ? ": " + shot.title : "") + " · " + total.toFixed(2) + "s"; sec.appendChild(h2);
  var live = document.createElement("div"); live.className = "live";
  var stage = makeStage(shot, ${LIVE_W});
  var tl = gsap.timeline({ paused: true });
  applyState(stage, cumulative(shot, 0));
  shot.segments.forEach(function (seg) {
    if (seg.kind === "hold") return;
    var a = shot.poses[seg.from], b = shot.poses[seg.to];
    Object.keys(b.state || {}).forEach(function (id) {
      var t = targetsFor(stage, id);
      if (!t) return;
      var vars = Object.assign(stateToGsap(b.state[id]), { duration: seg.ms / 1000, ease: seg.ease });
      if (t.units) vars.stagger = EACH;
      tl.to(t.units || t.el, vars, a.t);
    });
  });
  if (tl.duration() < total) tl.to({}, { duration: total - tl.duration() }, tl.duration());
  // open on the hero pose (most elements visible; computed in board.mjs) instead of the empty first frame
  var hero = shot.hero || 0;
  tl.seek(shot.poses[hero].t + (shot.segments[hero - 1] ? shot.segments[hero - 1].spread_ms / 1000 : 0));
  var ctr = document.createElement("div"); ctr.className = "controls";
  var btn = document.createElement("button"); btn.textContent = "play";
  var range = document.createElement("input"); range.type = "range"; range.min = 0; range.max = 1000; range.value = 0;
  var tlabel = document.createElement("div"); tlabel.textContent = "0.00s";
  btn.onclick = function () { tl.restart(); };
  range.oninput = function () { tl.pause(); tl.progress(range.value / 1000); };
  tl.eventCallback("onUpdate", function () { range.value = Math.round(tl.progress() * 1000); tlabel.textContent = tl.time().toFixed(2) + "s / " + tl.duration().toFixed(2) + "s"; });
  range.value = Math.round(tl.progress() * 1000); tlabel.textContent = tl.time().toFixed(2) + "s / " + tl.duration().toFixed(2) + "s (hero pose)";
  ctr.appendChild(btn); ctr.appendChild(range); ctr.appendChild(tlabel);
  var notes = document.createElement("div"); notes.style.color = "#8d8a84"; notes.textContent = shot.note || "Scrub or play. The poses below are the frames to approve; each curve shows how the next pose is reached. Split elements stagger their letters/words at the motion.md stagger.";
  ctr.appendChild(notes);
  live.appendChild(stage); live.appendChild(ctr); sec.appendChild(live);
  var row = document.createElement("div"); row.className = "row";
  shot.poses.forEach(function (pose, i) {
    var card = document.createElement("div"); card.className = "pose";
    var st = makeStage(shot, ${CARD_W}); applyState(st, cumulative(shot, i));
    card.appendChild(st);
    var cap = document.createElement("div"); cap.className = "cap";
    var num = document.createElement("span"); num.className = "n"; num.textContent = String(i + 1); cap.appendChild(num);
    cap.appendChild(document.createTextNode(pose.t.toFixed(2) + "s " + (pose.label || "")));
    if (pose.note) { var sm = document.createElement("small"); sm.textContent = pose.note; cap.appendChild(sm); }
    card.appendChild(cap); row.appendChild(card);
    var seg = shot.segments[i];
    if (seg) {
      var s = document.createElement("div"); s.className = "seg" + (seg.flag ? " bad" : "");
      s.appendChild(curve(seg.ease, !!seg.flag));
      var l = document.createElement("div"); l.className = "lbl";
      var bm = document.createElement("b"); bm.textContent = seg.ms + "ms"; l.appendChild(bm);
      [" " + (seg.kind === "hold" ? "hold" : seg.ease) + (seg.spread_ms ? " +" + seg.spread_ms + "ms stagger" : ""), seg.kind + (seg.note ? " · " + seg.note : ""), seg.flag || ""].forEach(function (line, li) {
        if (!line) return;
        if (li) l.appendChild(document.createElement("br"));
        l.appendChild(document.createTextNode(line));
      });
      s.appendChild(l); row.appendChild(s);
    }
  });
  sec.appendChild(row); root.appendChild(sec);
});
document.body.setAttribute("data-md-rendered", String(document.querySelectorAll(".shot").length));
</script></body></html>`;

const out = path.resolve(args.out);
const file = path.join(out, "board.html");
writeFile(file, html);
const result = { file, shots: K.shots.length, segments: K.shots.reduce((a, sh) => a + sh.segments.length, 0), issues };
// the page must actually render every shot (a script error or no network would leave it blank)
{
  const dom = chromeDumpDom(file, 5000);
  const m = dom.match(/data-md-rendered="(\d+)"/);
  if (!m || Number(m[1]) !== K.shots.length) die(`board.html did not render (${m ? m[1] : 0}/${K.shots.length} shots): a script error in the page. Open ${file} in a browser and read the console.`, 1);
}
if (args.still) {
  const png = path.join(out, "board.png");
  // keep the previous board so a revision can be compared with it
  if (fs.existsSync(png)) fs.renameSync(png, path.join(out, "board.prev.png"));
  // page height computed from the same layout constants the CSS uses
  const perRow = Math.max(1, Math.floor((1504 + SEG_W) / (CARD_W + SEG_W)));
  const cardH = Math.round(CARD_W * (H / W)) + 46;
  const header = 40 + 30 + 26 + 44 + (issues.length ? 40 + 20 * issues.length : 0);
  const shotsH = K.shots.reduce((a, sh) => a + 34 + 32 + Math.max(Math.round(LIVE_W * (H / W)), 160) + 16 + Math.ceil(sh.poses.length / perRow) * (cardH + 22), 0);
  chromeScreenshot(`file://${file}`, png, 1600, header + shotsH + 100, 5000);
  result.still = png;
}
writeFile(path.join(out, "board.json"), JSON.stringify({ ...result, resolved: K }, null, 2) + "\n");
console.log(JSON.stringify(result, null, 2));
process.exit(issues.length ? 3 : 0);
