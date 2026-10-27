#!/usr/bin/env node
// The Moves pass: the tools around the move-inventor, the move-juror and the move-sketcher (references/moves.md).
// Zero dependencies beyond Node >= 20, Chrome (headless, never a visible window) and ffmpeg/ffprobe. JSON on stdout.
// <run> is the run folder (.rasanai/<id>); the pass lives in <run>/story/.
//
//   node moves.mjs pack --run <run> --label Sure|Bold|Wild [--product-first] [--seed N]
//        -> <run>/story/moves-pack-<label>.json, and prints its path. {label, seed, product_first, bar (the house bar,
//           <library>/bar.json, always first and not counted among the exemplars: {instruction: "the bar, never the content:
//           never reuse an eye, a pupil, a slit, a thrown carrier, or a circle that becomes an eye", ...the bar's own fields};
//           the inventor matches its density and scale; omitted only when the library has no bar.json), exemplars: 3 moves
//           (the user's reference moves from <run>/research/reference-moves.json first, then library moves), generators:
//           all 20, shuffled, stimulus (one item of stimuli.json; a product-first film gets one choreography.json
//           constraint instead, with stimulus_kind), banned: banned.json + the last 12 hero moves of earlier films
//           ($RASANAI_HOME/moves-ledger.json)}. The same run, label and seed always give the same pack.
//           It also carries family (one of glyph|component|line|object|mark|data, a different one for each label of the run,
//           drawn from hash(run basename + seed): family "<id>", family_description, family_examples, family_rule), and brand_motif when the brand film card or the
//           brand DESIGN.md names a motif (allowed as a secondary element in any script; only glyph or mark may carry it).
//   node moves.mjs check --file <run>/story/moves-<label>.json --pitch <run>/story/pitch-<label>.json [--product-first]
//        -> {ok, errors, warnings}; exit 0 ok, 2 errors (the move-inventor's gate), 1 could not read. The pitch gives the
//           beats, ui_labels and product name. Every card needs scale (full-frame|large|detail); with --product-first every
//           hero needs resolves_to; error ids no-full-frame-hero, chain-sparse (chain[] under ceil(film s / 1.5)), chain-gap
//           (over 3.0 s between chain entries, or to the ends of the film); moves-pack-<label>.json beside the file adds the exemplar-overlap warning.
//   node moves.mjs check-set --run <run>
//        -> {ok, errors, warnings} across the three moves files: carrier-repeat (two share a carrier family, error),
//           carrier-similar (two carriers' short names share a content word, warning). check-verdict runs it too.
//   node moves.mjs check-verdict --run <run>
//        -> {ok, errors, warnings} for <run>/story/moves-verdict.json against the three moves-<label>.json; exit 0 / 2 / 1.
//           Each pitch needs set = {full_frame, evidence} (gate S1); full_frame false must list the label in denial[].
//           pitches.<L>.rounds[] = {a, b, first: "a"|"b", winner, frame}: each consecutive pair of the ranking in both presentation
//           orders (rounds-missing, rounds-inconsistent, rounds-frame; a split pair needs tiebreak "riskier").
//   node moves.mjs rough --dir <run>/story/moves/<label>-<id> [--fps 15] [--aspect 16:9]
//        -> renders <dir>/rough.html (a paused GSAP timeline on window.__move = {tl, duration, bridge?, width?, height?};
//           1.5 to 4.5 s) in headless Chrome frame by frame (tl.seek) to <dir>/rough.mp4 (H.264, yuv420p, faststart),
//           <dir>/strip.png (5 evenly spaced frames, labelled with t) and <dir>/poster.png (the frame at window.__move.bridge
//           when it is a number of seconds, else the middle). The longest side is 1280 px. Exit 2 when the page breaks the
//           contract (no window.__move, a duration outside 1.5 to 4.5 s), 1 when Chrome or ffmpeg is missing.
//        A rough is usually DATA, not HTML: <dir>/rough.json (the beat-kind DSL: text, window, phone, chart, hub, list, cards, input, chat,
//        cloud, logo, number, image as grey boxes, plus timed moves; `moves.mjs rough-kinds` prints the fields) is compiled by one fixed template into
//        rough.html first, then rendered as below. A rough.html written by hand (no generated marker) still renders as it is; --json recompiles over it.
//   node moves.mjs check-rough --dir <run>/story/moves/<label>-<id>
//        -> {ok, errors, warnings, duration}: rough.html, rough.mp4, strip.png and poster.png exist, the mp4 runs 1.5 to 4.5 s,
//           and its frames differ (not blank, not still); exit 0 / 2.
//   node moves.mjs payload --run <run> --stories <run>/story/stories.json
//        -> prints the stories array with carrier (string, the short plain form) and moves[] (up to 3: {id, title, move (the plain line), says, scale (when the card has one), beat, video, strip, poster})
//           added per story, from moves-<label>.json, the verdict's ranking and the roughs (a move with a rough comes first;
//           media paths are relative to the working directory, like the other console payload media; a missing file's key is omitted).
//           It also adds the storyline from story/pitch-<label>.json and story/intent-<label>.json: per beat role, peak, actor, domain, picture, props, claim {id, text, source}, buys, viewer_before, viewer_after, relation, importance, read;
//           per story storyline {proposition, problem, emotion, villain {what, picture, numbers[]}, turn {line, reverses, payoff}, ending {line, last_frame, echo}, muted_hook, coverage[]}. Missing files add nothing.
//   node moves.mjs choose --run <run> --label <label>
//        -> copies moves-<label>.json to <run>/story/moves.json with ranking and heroes merged from the verdict
//           (the Motion Director reads moves.json; crew.mjs check holds the score to it).
//   node moves.mjs record --run <run>
//        -> appends the chosen heroes {date, run, title, generator, carrier} of <run>/story/moves.json to
//           $RASANAI_HOME/moves-ledger.json (200 entries at most; the next film's pack bans repeating them).
//
// The library is <skill>/library/moves/ (generators, library, stimuli, choreography, banned: .json); RASANAI_MOVES_LIBRARY
// points at another folder (the tests do). Schemas: SPEC / references/moves.md; the checks: scripts/lib/moves-lib.mjs.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { parseArgs, die, readJSON, writeFile, normalizeAspect, esc, chromeScreenshot, gsapInline, SKILL_DIR, STATE_DIR } from "./lib/common.mjs";
import { track } from "./lib/report.mjs";
import { pitchShape, validateMoves, validateVerdict, validateSet, MOVE_LABELS, CARRIER_FAMILIES } from "./lib/moves-lib.mjs";

const args = parseArgs();
const cmd = args._[0];
track(
  { rough: "Rendering a rough of the hero move" }[cmd],
  { rough: "Rough rendered: mp4, strip and poster" }[cmd]
);
const out = (o, code = 0) => {
  console.log(JSON.stringify(o, null, 2));
  process.exit(code);
};
const str = (v) => (v == null || v === true ? "" : String(v));
const exists = (p) => !!p && fs.existsSync(p);
const jsonMaybe = (p) => {
  try {
    return exists(p) ? readJSON(p) : null;
  } catch {
    return undefined; // present but malformed
  }
};
// workspace-relative (the working directory is the workspace, as in the other console payloads); an absolute path when the file is outside it
const real = (p) => {
  let q = path.resolve(p), tail = [];
  while (!fs.existsSync(q) && path.dirname(q) !== q) { tail.unshift(path.basename(q)); q = path.dirname(q); }
  try { q = fs.realpathSync(q); } catch {}
  return path.join(q, ...tail);
};
const cwdRel = (p) => {
  const r = path.relative(real(process.cwd()), real(p)) || ".";
  return r.startsWith("..") ? path.resolve(p) : r;
};
const runDir = () => {
  if (!args.run || args.run === true) die("--run <run dir> required");
  const d = path.resolve(String(args.run));
  if (!exists(d)) die(`run dir not found: ${d}`);
  return d;
};
const labelOf = (v) => {
  const l = MOVE_LABELS.find((x) => x.toLowerCase() === String(v || "").toLowerCase());
  if (!l) die("--label must be Sure, Bold or Wild");
  return l;
};
const LIB = () => (process.env.RASANAI_MOVES_LIBRARY ? path.resolve(process.env.RASANAI_MOVES_LIBRARY) : path.join(SKILL_DIR, "library", "moves"));
const libFile = (name) => {
  const f = path.join(LIB(), name);
  if (!exists(f)) die(`moves library file not found: ${f} (set RASANAI_MOVES_LIBRARY to another folder if it lives elsewhere)`);
  const j = jsonMaybe(f);
  if (!Array.isArray(j)) die(`${f} is not a JSON array`);
  return j;
};
const LEDGER = path.join(STATE_DIR, "moves-ledger.json");
const readLedger = () => {
  const j = jsonMaybe(LEDGER);
  return Array.isArray(j) ? j : [];
};

// ---------------------------------------------------------------- determinism: FNV-1a hash, mulberry32 PRNG
function fnv1a(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffled(list, rnd) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// the brand's motif, when its film card (<run>/brand-film/FILM-STYLE.json) or its DESIGN.md names one
function brandMotif(run) {
  const fs_ = jsonMaybe(path.join(run, "brand-film", "FILM-STYLE.json"));
  if (fs_ && typeof fs_ === "object" && str(fs_.motif).trim()) return str(fs_.motif).trim();
  for (const f of [path.join(run, "research", "brand", "DESIGN.md"), path.join(run, "..", "..", "DESIGN.md")]) {
    if (!exists(f)) continue;
    const line = fs.readFileSync(f, "utf8").split("\n").find((l) => /motif/i.test(l) && l.replace(/[#*_\-\s|:]/g, "").length > 8);
    if (line) return line.replace(/^[\s#>*-]+/, "").replace(/\*+/g, "").trim().slice(0, 240);
  }
  return "";
}

// ---------------------------------------------------------------- readers
const movesFile = (run, label) => path.join(run, "story", `moves-${label}.json`);
function pitchBeatsOf(pitchFile, label) {
  const j = jsonMaybe(pitchFile);
  if (j === null) die(`pitch not found: ${pitchFile}`);
  if (j === undefined) die(`pitch is not valid JSON: ${pitchFile}`);
  const list = Array.isArray(j) ? j : Array.isArray(j.pitches) ? j.pitches : [j];
  return list.find((p) => p && String(p.label || "").toLowerCase() === String(label || "").toLowerCase()) || list[0] || {};
}
const verdictOf = (run) => jsonMaybe(path.join(run, "story", "moves-verdict.json"));
// the card ids to show for one label: the verdict's ranking, else the file's own heroes
function rankedIds(verdict, label, mv) {
  const v = verdict && verdict.pitches && verdict.pitches[label];
  const r = v && Array.isArray(v.ranking) ? v.ranking.filter(Boolean) : [];
  return r.length ? r : Array.isArray(mv.heroes) ? mv.heroes : [];
}
const roughDir = (run, label, id) => path.join(run, "story", "moves", `${label}-${id}`);

// ---------------------------------------------------------------- the beat-kind DSL (grey-box roughs as JSON)
// A rough is data, not hand-written HTML: <dir>/rough.json names grey boxes by KIND and moves them; one fixed template
// (roughHtml) draws every kind the same way, so the sketcher spends its tokens on the timing, which is the idea.
//   { "aspect": "16:9", "duration": 3.0, "bridge": 1.4, "caption": "dot -> door -> next scene",
//     "items": [ { "id": "dot", "kind": "number", "text": "3", "x": .5, "y": .5, "w": .1, "h": .1, "carrier": true, "opacity": 0, "scale": .6 }, ... ],
//     "moves": [ { "target": "dot", "at": 0.2, "dur": 0.5, "ease": "power3.out", "from": { "opacity": 0 }, "to": { "opacity": 1, "scale": 1, "x": .5, "y": .4 } } ] }
// x, y are an item's CENTRE and w, h its size, fractions of the stage (0 to 1), fixed at layout; a move's `from`/`to` take x y
// (the centre again), scale, sx, sy, rotate and opacity. Kind fields: text/number/logo/image/cloud/input `text`; window `title`; list `rows[]`;
// cards `cards[]`; chart `bars[]` (0 to 1); hub `text` + `spokes` (2 to 8); chat `bubbles[{from:"me"|"them",text}]`; phone `text`.
const ROUGH_KINDS = {
  text: "a line of type", window: "an app window with a title bar", phone: "a phone frame", chart: "bars (`bars`: 0 to 1 each)", hub: "a centre with `spokes` nodes",
  list: "rows (`rows[]`)", cards: "a row of cards (`cards[]`)", input: "an input field with its text", chat: "bubbles (`bubbles[{from,text}]`)", cloud: "a cloud blob with a label",
  logo: "a mark: a square with its name", number: "one big figure", image: "a flat grey picture with its label",
};
const ROUGH_EASES = /^(none|linear|(power[1-4]|sine|expo|circ|back|elastic|bounce)\.(in|out|inOut)(\([-\d., ]*\))?)$/;
function roughProblems(s) {
  const e = [];
  if (!s || typeof s !== "object") return ["rough.json is not an object"];
  const d = Number(s.duration);
  if (!(d >= MIN_S && d <= MAX_S)) e.push(`duration ${s.duration} is outside ${MIN_S} to ${MAX_S} s`);
  if (s.bridge != null && !(Number(s.bridge) >= 0 && Number(s.bridge) <= d)) e.push("bridge must be a time inside the clip");
  if (typeof s.bridge !== "number") e.push("bridge (the time both states of the card are true, in seconds) is required");
  if (!Array.isArray(s.items) || !s.items.length) return [...e, "items[] is empty"];
  const ids = new Set();
  for (const it of s.items) {
    if (!it || typeof it.id !== "string" || !/^[A-Za-z][\w-]*$/.test(it.id)) { e.push("every item needs an id (letters, digits, - _)"); continue; }
    if (ids.has(it.id)) e.push(`duplicate id ${it.id}`);
    ids.add(it.id);
    if (!ROUGH_KINDS[it.kind]) e.push(`item ${it.id}: kind "${it.kind}" is not one of ${Object.keys(ROUGH_KINDS).join(", ")}`);
    for (const k of ["x", "y", "w", "h"]) if (it[k] != null && !(Number(it[k]) >= -1 && Number(it[k]) <= 2)) e.push(`item ${it.id}: ${k} is a fraction of the stage (0 to 1)`);
  }
  if (s.items.filter((i) => i && i.carrier).length > 1) e.push("one carrier only (the single accent)");
  for (const m of s.moves || []) {
    if (!m || !ids.has(m.target)) { e.push(`a move targets "${m && m.target}", which is not an item`); continue; }
    if (!(Number(m.at) >= 0) || !(Number(m.dur) >= 0) || Number(m.at) + Number(m.dur) > d + 0.01) e.push(`move on ${m.target}: at ${m.at} + dur ${m.dur} runs past the clip`);
    if (m.ease && !ROUGH_EASES.test(String(m.ease))) e.push(`move on ${m.target}: ease "${m.ease}" is not a GSAP ease`);
    if (!m.to && !m.from) e.push(`move on ${m.target}: needs to and/or from`);
  }
  if (!(s.moves || []).length) e.push("moves[] is empty: nothing moves");
  return e;
}
// the body of one item, by kind (all text escaped; nothing but flat boxes)
function roughBody(it) {
  const t = esc(String(it.text ?? it.label ?? ""));
  const rows = (a, fallback) => (Array.isArray(a) && a.length ? a : fallback).map((r) => `<i class="r">${esc(String(r))}</i>`).join("");
  switch (it.kind) {
    case "text": return `<b class="t">${t}</b>`;
    case "number": return `<b class="n">${t}</b>`;
    case "window": return `<u class="bar">${esc(String(it.title ?? it.text ?? ""))}</u><div class="body">${rows(it.rows, ["", "", ""])}</div>`;
    case "phone": return `<u class="notch"></u><div class="body">${t ? `<b class="t">${t}</b>` : rows(it.rows, ["", "", ""])}</div>`;
    case "chart": return `<div class="bars">${(Array.isArray(it.bars) && it.bars.length ? it.bars : [0.4, 0.7, 0.55, 0.9]).map((v) => `<i style="height:${Math.round(Math.max(0.05, Math.min(1, Number(v) || 0)) * 100)}%"></i>`).join("")}</div>${t ? `<b class="cap">${t}</b>` : ""}`;
    case "hub": { const n = Math.max(2, Math.min(8, Number(it.spokes) || 4)); return `<b class="core">${t}</b>${Array.from({ length: n }, (_, i) => `<i class="spoke" style="--a:${Math.round((360 / n) * i)}deg"></i>`).join("")}`; }
    case "list": return `<div class="body">${rows(it.rows, ["", "", ""])}</div>`;
    case "cards": return (Array.isArray(it.cards) && it.cards.length ? it.cards : ["", "", ""]).map((c) => `<i class="card">${esc(String(c))}</i>`).join("");
    case "input": return `<b class="t">${t}</b><u class="caret"></u>`;
    case "chat": return (Array.isArray(it.bubbles) && it.bubbles.length ? it.bubbles : [{ from: "them", text: t }]).map((b) => `<i class="bub ${b && b.from === "me" ? "me" : "them"}">${esc(String((b && b.text) ?? ""))}</i>`).join("");
    case "cloud": return `<b class="t">${t}</b>`;
    case "logo": return `<b class="t">${t}</b>`;
    default: return `<b class="cap">${t}</b>`; // image
  }
}
export function roughHtml(s) {
  const [aw, ah] = normalizeAspect(String(s.aspect || "16:9")).split("x").map(Number), k = 1280 / Math.max(aw, ah);
  const SW = Math.round((aw * k) / 2) * 2, SH = Math.round((ah * k) / 2) * 2;
  const px = (v, size) => Math.round(Number(v) * size * 100) / 100;
  const items = s.items.map((it) => {
    const w = it.w != null ? Number(it.w) : 0.2, h = it.h != null ? Number(it.h) : 0.1;
    return `<div class="it k-${it.kind}${it.carrier ? " carrier" : ""}" id="${esc(it.id)}" style="left:${px((it.x ?? 0.5) - w / 2, SW)}px;top:${px((it.y ?? 0.5) - h / 2, SH)}px;width:${px(w, SW)}px;height:${px(h, SH)}px">${roughBody(it)}</div>`;
  }).join("");
  const init = s.items.map((it) => ({ id: it.id, x: it.x ?? 0.5, y: it.y ?? 0.5, w: it.w ?? 0.2, h: it.h ?? 0.1, o: it.opacity ?? 1, sc: it.scale ?? 1, r: it.rotate ?? 0 }));
  const css = `html,body{margin:0;background:#F1F0EC}#stage{position:relative;width:${SW}px;height:${SH}px;overflow:hidden;background:#F1F0EC;color:#1B1F2A;font-family:-apple-system,"Helvetica Neue",Arial,sans-serif}
.it{position:absolute;box-sizing:border-box;display:flex;align-items:center;justify-content:center;background:#CFCDC6;border-radius:6px;overflow:hidden}
.it .t{font-weight:600;font-size:${Math.round(SH * 0.045)}px;white-space:nowrap}.it .n{font-weight:700;font-size:${Math.round(SH * 0.16)}px}.it .cap{font-size:${Math.round(SH * 0.025)}px;color:#4A4D57}
.k-text,.k-number,.k-logo,.k-cloud{background:transparent}.k-logo{background:#CFCDC6}.k-cloud{background:#DAD8D1;border-radius:50% / 55%}
.k-window,.k-phone,.k-list,.k-input,.k-chart{flex-direction:column;align-items:stretch;justify-content:flex-start;background:#E4E2DC;border:2px solid #1B1F2A}.k-phone{border-radius:28px}
.bar{display:block;height:9%;min-height:22px;background:#1B1F2A;color:#F1F0EC;font:500 13px/22px sans-serif;text-decoration:none;padding:0 10px}.notch{display:block;width:30%;height:10px;margin:8px auto;background:#1B1F2A;border-radius:6px;text-decoration:none}
.body{display:flex;flex-direction:column;gap:8px;padding:12px;flex:1;justify-content:center}.body .t{font-size:${Math.round(SH * 0.032)}px}.r{display:block;font:500 ${Math.round(SH * 0.025)}px/1.2 sans-serif;background:#CFCDC6;padding:8px;border-radius:4px;min-height:14px}
.bars{display:flex;align-items:flex-end;gap:8%;flex:1;padding:12px}.bars i{flex:1;background:#8F8D86}.k-chart .cap{padding:4px 12px}
.k-hub{background:transparent;position:absolute}.core{position:absolute;left:50%;top:50%;width:34%;aspect-ratio:1;transform:translate(-50%,-50%);border-radius:50%;background:#8F8D86;display:flex;align-items:center;justify-content:center;font-size:${Math.round(SH * 0.025)}px}
.spoke{position:absolute;left:50%;top:50%;width:12%;aspect-ratio:1;border-radius:50%;background:#CFCDC6;transform:rotate(var(--a)) translate(0,-${Math.round(SH * 0.2)}px)}.k-hub{overflow:visible}
.k-cards{gap:2%}.card{flex:1;height:100%;background:#E4E2DC;border:2px solid #1B1F2A;border-radius:6px;font:500 ${Math.round(SH * 0.025)}px sans-serif;display:flex;align-items:center;justify-content:center}
.k-input{flex-direction:row;align-items:center;justify-content:flex-start;padding:0 16px;background:#F7F6F2}.caret{display:inline-block;width:2px;height:60%;background:#1B1F2A;margin-left:4px}
.k-chat{flex-direction:column;background:transparent;gap:8px;align-items:stretch;justify-content:center}.bub{display:block;font:500 ${Math.round(SH * 0.026)}px sans-serif;padding:10px 14px;border-radius:14px;max-width:75%;background:#CFCDC6}.bub.me{align-self:flex-end;background:#8F8D86}
.k-image{background:#CFCDC6}.carrier{background:#E8833A!important;color:#1B1F2A}.carrier .t,.carrier .n{color:#1B1F2A}
#cap{position:absolute;left:14px;bottom:10px;font:14px sans-serif;color:#1B1F2A}`;
  const D = Number(s.duration), B = Number(s.bridge);
  const moves = (s.moves || []).map((m) => ({ t: m.target, at: Number(m.at), dur: Number(m.dur), ease: m.ease || "power2.inOut", from: m.from || null, to: m.to || null }));
  const js = `const SW=${SW},SH=${SH},D=${D},BRIDGE=${B},ITEMS=${JSON.stringify(init)},MOVES=${JSON.stringify(moves)};
const by={};ITEMS.forEach(i=>by[i.id]=i);
// x,y (the centre, a fraction of the stage) become a pixel offset from where the item is laid out; size changes go through scale/sx/sy
function props(id,v){const i=by[id],o={};if(v.x!=null)o.x=(v.x-i.x)*SW;if(v.y!=null)o.y=(v.y-i.y)*SH;if(v.scale!=null)o.scale=v.scale;if(v.sx!=null)o.scaleX=v.sx;if(v.sy!=null)o.scaleY=v.sy;if(v.rotate!=null)o.rotation=v.rotate;if(v.opacity!=null)o.opacity=v.opacity;return o;}
ITEMS.forEach(i=>gsap.set("#"+i.id,{opacity:i.o,scale:i.sc,rotation:i.r,x:0,y:0}));
const tl=gsap.timeline({paused:true});
MOVES.forEach(m=>{const a=m.at,e=m.ease;if(m.from&&m.to)tl.fromTo("#"+m.t,props(m.t,m.from),Object.assign(props(m.t,m.to),{duration:m.dur,ease:e,immediateRender:false}),a);
 else if(m.to)tl.to("#"+m.t,Object.assign(props(m.t,m.to),{duration:m.dur,ease:e}),a);else tl.from("#"+m.t,Object.assign(props(m.t,m.from),{duration:m.dur,ease:e}),a);});
tl.addLabel("bridge",BRIDGE);tl.to({},{duration:0.01},D-0.01);
window.__move={tl,duration:D,bridge:BRIDGE,width:SW,height:SH};`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>rough</title><!-- rasanai:rough-json: generated from rough.json by moves.mjs rough; edit the JSON -->
<script src="gsap.min.js"></script><style>${css}</style></head><body><div id="stage">${items}${s.caption ? `<div id="cap">${esc(String(s.caption))}</div>` : ""}</div><script>${js}</script></body></html>`;
}

// ---------------------------------------------------------------- ffmpeg / ffprobe
const tool = (bin) => spawnSync(bin, ["-version"], { encoding: "utf8" }).status === 0;
function needTools() {
  if (!tool("ffmpeg") || !tool("ffprobe")) die("ffmpeg and ffprobe are required to render a rough (brew install ffmpeg)");
}
function probeDuration(file) {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file], { encoding: "utf8" });
  const d = parseFloat(String(r.stdout || "").trim());
  return Number.isFinite(d) ? d : null;
}
const MIN_S = 1.5, MAX_S = 4.5;

// ---------------------------------------------------------------- commands
if (cmd === "pack") {
  const run = runDir();
  const label = labelOf(args.label);
  const seed = args.seed == null || args.seed === true ? 1 : Number(args.seed);
  if (!Number.isFinite(seed)) die("--seed must be a number");
  const pf = !!args["product-first"];
  const rnd = prng(fnv1a(`${path.basename(run)}|${label}|${seed}`));
  const refRaw = jsonMaybe(path.join(run, "research", "reference-moves.json"));
  const refs = (Array.isArray(refRaw) ? refRaw : refRaw && Array.isArray(refRaw.moves) ? refRaw.moves : []).filter((m) => m && typeof m === "object").slice(0, 3).map((m) => ({ ...m, source: "reference" }));
  const library = libFile("library.json").filter((m) => m && typeof m === "object");
  const solid = library.filter((m) => m.verified !== false);
  const pool = solid.length >= 3 ? solid : library;
  const exemplars = [...refs, ...shuffled(pool, rnd).slice(0, Math.max(0, 3 - refs.length)).map((m) => ({ ...m, source: "library" }))];
  const generators = shuffled(libFile("generators.json"), rnd);
  const stimuli = libFile(pf ? "choreography.json" : "stimuli.json");
  if (!stimuli.length) die(`${pf ? "choreography" : "stimuli"}.json is empty`);
  const stimulus = stimuli[Math.floor(rnd() * stimuli.length)];
  const recent = readLedger().slice(-12).map((e, i) => ({ id: `earlier-${i + 1}`, cliche: `${e.title || "an earlier hero move"}${e.carrier ? ` (carrier: ${e.carrier})` : ""}: used in an earlier film`, instead: "a different carrier and a different mechanism" }));
  const banned = [...libFile("banned.json"), ...recent];
  const barRaw = jsonMaybe(path.join(LIB(), "bar.json"));
  const bar = barRaw && typeof barRaw === "object" && !Array.isArray(barRaw) ? { instruction: "the bar, never the content: never reuse an eye, a pupil, a slit, a thrown carrier, or a circle that becomes an eye", ...barRaw } : null;
  // the carrier family: the three labels of one run get three different families, from hash(run basename + seed)
  const order = shuffled(CARRIER_FAMILIES, prng(fnv1a(`${path.basename(run)}|${seed}`)));
  const family = order[MOVE_LABELS.indexOf(label)];
  const motif = brandMotif(run);
  const pack = { label, seed, product_first: pf, ...(bar ? { bar } : {}), family: family.id, family_description: family.description, family_examples: family.examples, family_rule: `your carrier must come from the "${family.id}" family; the other two scripts got the other families, so a dot is not yours unless your family is glyph`, ...(motif ? { brand_motif: { motif, rule: "the brand's own motif may appear as a secondary element in any script, but only the label whose family is glyph or mark may make it the carrier" } } : {}), exemplars, generators, stimulus, stimulus_kind: pf ? "choreography" : "stimulus", banned };
  const file = path.join(run, "story", `moves-pack-${label}.json`);
  writeFile(file, JSON.stringify(pack, null, 2) + "\n");
  console.log(cwdRel(file));
} else if (cmd === "check") {
  if (!args.file || args.file === true) die("--file <moves-<label>.json> required");
  if (!args.pitch || args.pitch === true) die("--pitch <pitch-<label>.json> required");
  const f = path.resolve(String(args.file));
  const obj = jsonMaybe(f);
  if (obj === null) die(`moves file not found: ${f}`);
  if (obj === undefined) out({ ok: false, errors: ["the moves file is not valid JSON"], warnings: [] }, 2);
  const label = str(obj && obj.label) || (path.basename(f).match(/^moves-(.+)\.json$/) || [])[1] || "";
  const pitch = pitchBeatsOf(path.resolve(String(args.pitch)), label);
  const pack = jsonMaybe(path.join(path.dirname(f), `moves-pack-${label}.json`)) || null;
  // Part 2 (medium Looks only): the run is --run, else the folder above story/ the file sits in; a chosen medium contract may qualify the bridge-per-boundary (handoff) quota. No contract: nothing is read or changed.
  let mediumSkip = [];
  try {
    const runGuess = args.run && args.run !== true ? path.resolve(String(args.run)) : path.basename(path.dirname(f)) === "story" ? path.dirname(path.dirname(f)) : null;
    if (runGuess) {
      const MW = await import("./lib/medium-wiring.mjs"), c = MW.mediumContractFor(runGuess);
      if (MW.isMediumContract(c)) mediumSkip = [...MW.scopedSkips(c, ["handoff-continuity"]).skip];
    }
  } catch { mediumSkip = []; }
  const r = validateMoves(obj, { beats: pitch.beats, productFirst: !!args["product-first"], shape: pitchShape(pitch), uiLabels: pitch.ui_labels, productName: pitch.product || pitch.product_name, pack, ...(mediumSkip.length ? { mediumSkip } : {}) });
  out({ ok: !r.errors.length, errors: r.errors, warnings: r.warnings }, r.errors.length ? 2 : 0);
} else if (cmd === "check-verdict") {
  const run = runDir();
  const v = verdictOf(run);
  if (v === null) die(`${cwdRel(path.join(run, "story", "moves-verdict.json"))} not found`);
  if (v === undefined) out({ ok: false, errors: ["moves-verdict.json is not valid JSON"], warnings: [] }, 2);
  const by = {}, pre = [];
  for (const l of MOVE_LABELS) {
    const m = jsonMaybe(movesFile(run, l));
    if (m && typeof m === "object") by[l] = m;
    else pre.push(`moves-${l}.json is ${m === undefined ? "not valid JSON" : "missing"}`);
  }
  const r = validateVerdict(v, by), st = validateSet(by);
  const errors = [...pre, ...st.errors, ...r.errors];
  out({ ok: !errors.length, errors, warnings: [...st.warnings, ...r.warnings] }, errors.length ? 2 : 0);
} else if (cmd === "check-set") {
  const run = runDir();
  const by = {}, pre = [];
  for (const l of MOVE_LABELS) {
    const m = jsonMaybe(movesFile(run, l));
    if (m && typeof m === "object") by[l] = m;
    else pre.push(`moves-${l}.json is ${m === undefined ? "not valid JSON" : "missing"}`);
  }
  const st = validateSet(by);
  const errors = [...pre, ...st.errors];
  out({ ok: !errors.length, errors, warnings: st.warnings }, errors.length ? 2 : 0);
} else if (cmd === "rough-kinds") {
  out({ ok: true, kinds: ROUGH_KINDS, file: "<dir>/rough.json", fields: "{aspect, duration 1.5-4.5, bridge (s), caption?, items:[{id, kind, x, y, w, h (fractions), text|title|rows|cards|bars|bubbles|spokes, carrier?, opacity?, scale?, rotate?}], moves:[{target, at, dur, ease, from?, to?:{x,y,scale,sx,sy,rotate,opacity}}]}" });
} else if (cmd === "rough") {
  await rough();
} else if (cmd === "check-rough") {
  if (!args.dir || args.dir === true) die("--dir <run>/story/moves/<label>-<id> required");
  const dir = path.resolve(String(args.dir));
  const errors = [], warnings = [];
  for (const n of ["rough.html", "rough.mp4", "strip.png", "poster.png"]) if (!exists(path.join(dir, n))) errors.push(`${n} is missing (run moves.mjs rough --dir ${cwdRel(dir)})`);
  let duration = null, motion = null;
  if (exists(path.join(dir, "rough.mp4"))) {
    needTools();
    duration = probeDuration(path.join(dir, "rough.mp4"));
    if (duration == null) errors.push("rough.mp4 cannot be read");
    else {
      if (duration < MIN_S - 0.1 || duration > MAX_S + 0.1) errors.push(`rough.mp4 runs ${duration.toFixed(2)} s (1.5 to 4.5 s)`);
      motion = frameDifference(path.join(dir, "rough.mp4"));
      if (motion == null) errors.push("rough.mp4 frames cannot be decoded");
      else if (motion.max < 0.5) errors.push(`rough.mp4 is ${motion.flat ? "blank" : "still"}: its frames do not differ (the timeline did not move anything)`);
      else if (motion.max < 2) warnings.push("very little changes between frames: is the move legible?");
    }
  }
  out({ ok: !errors.length, errors, warnings, duration: duration == null ? null : Math.round(duration * 100) / 100, motion }, errors.length ? 2 : 0);
} else if (cmd === "payload") {
  const run = runDir();
  if (!args.stories || args.stories === true) die("--stories <stories.json> required");
  const sf = path.resolve(String(args.stories));
  const sj = jsonMaybe(sf);
  if (sj === null) die(`stories not found: ${sf}`);
  if (sj === undefined) die(`stories is not valid JSON: ${sf}`);
  const stories = Array.isArray(sj) ? sj : Array.isArray(sj.stories) ? sj.stories : Array.isArray(sj.pitches) ? sj.pitches : null;
  if (!stories) die("--stories must be a JSON array, or an object with stories[] (or pitches[])");
  const verdict = verdictOf(run) || null;
  const oneLine = (s) => {
    const t = String(s || "").replace(/\s+/g, " ").trim();
    return t.length > 140 ? t.slice(0, 137).trimEnd() + "..." : t;
  };
  const carrierShort = (c) => {
    if (!c || typeof c !== "object") return str(c);
    if (str(c.short)) return str(c.short);
    const cut = str(c.what).split(/[,:;(]| from | carried | that /)[0].trim().split(/\s+/).filter(Boolean);
    return cut.slice(0, 10).join(" ");
  };
  const withMoves = (s) => {
    const label = MOVE_LABELS.find((l) => l.toLowerCase() === String((s && (s.angle || s.label)) || "").toLowerCase());
    const mv = label && jsonMaybe(movesFile(run, label));
    if (!mv || typeof mv !== "object") return s;
    const cards = Array.isArray(mv.cards) ? mv.cards : [];
    const media = (id) => {
      const d = roughDir(run, label, id);
      const o = {};
      for (const [k, n] of [["video", "rough.mp4"], ["strip", "strip.png"], ["poster", "poster.png"]]) if (exists(path.join(d, n))) o[k] = cwdRel(path.join(d, n));
      return o;
    };
    const shorten = (t, n) => { const w = String(t || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean); return w.length > n ? w.slice(0, n).join(" ") + "..." : w.join(" "); };
    const plainOf = (c) => oneLine(str(c.plain) || str(c.says) || shorten(str(c.move).replace(/[+-]?\d+(?:\.\d+)?\s*(?:s|ms|px|%|deg|degrees)?(?=\W|$)/gi, " ").replace(/\s+/g, " ").replace(/^\W+/, ""), 18));
    const entries = [...new Set(rankedIds(verdict, label, mv))].map((id) => cards.find((c) => c && c.id === id)).filter(Boolean).map((c) => {
      const beat = c.beat != null ? Number(c.beat) : Number((String(c.seam || "").match(/^\s*(\d+)/) || [])[1]);
      return { id: c.id, title: str(c.title), move: plainOf(c), says: oneLine(c.says), ...(str(c.scale) ? { scale: str(c.scale) } : {}), ...(beat >= 1 ? { beat } : {}), ...media(c.id) };
    });
    // a move with a rough plays; those come first (the order of the ranking is kept inside each group)
    const ordered = [...entries.filter((e) => e.video), ...entries.filter((e) => !e.video)].slice(0, 3);
    const carrier = carrierShort(mv.carrier);
    return { ...s, ...(carrier ? { carrier } : {}), ...(ordered.length ? { moves: ordered } : {}) };
  };
  // The storyline: what the pitch (story/pitch-<label>.json) and the intent (story/intent-<label>.json) know beyond the summary, so the Story call can show the whole script.
  // Backward compatible: a story with neither file is returned as it was; existing payload fields are never overwritten.
  const claimsRaw = jsonMaybe(path.join(run, "research", "claims.json"));
  const ledger = new Map((Array.isArray(claimsRaw) ? claimsRaw : claimsRaw && Array.isArray(claimsRaw.claims) ? claimsRaw.claims : []).filter((c) => c && c.id != null).map((c) => [String(c.id), c]));
  const claimOf = (ref, grounded) => {
    const id = str(ref).trim();
    if (!id) return null;
    const c = ledger.get(id);
    if (c) return { id, text: str(c.text || c.claim), ...(str(c.source) ? { source: str(c.source) } : {}) };
    const g = grounded.find((x) => x && (str(x.id) === id || str(x.claim) === id));
    return g ? { id, text: str(g.claim), ...(str(g.source) ? { source: str(g.source) } : {}) } : { id, text: id };
  };
  const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v !== "" && !(Array.isArray(v) && !v.length) && !(typeof v === "object" && !Array.isArray(v) && !Object.keys(v).length)));
  const withStoryline = (s) => {
    const label = MOVE_LABELS.find((l) => l.toLowerCase() === String((s && (s.angle || s.label)) || "").toLowerCase());
    if (!label) return s;
    const pitch = jsonMaybe(path.join(run, "story", `pitch-${label}.json`));
    const intent = jsonMaybe(path.join(run, "story", `intent-${label}.json`));
    const P = pitch && typeof pitch === "object" ? pitch : {};
    const I = intent && typeof intent === "object" ? intent : {};
    if (!Object.keys(P).length && !Object.keys(I).length) return s;
    const grounded = Array.isArray(P.grounded_claims) ? P.grounded_claims : [];
    const pb = Array.isArray(P.beats) ? P.beats : [];
    const ib = Array.isArray(I.beats) ? I.beats : [];
    const sb = Array.isArray(s.beats) ? s.beats : [];
    const find = (arr, b, i) => arr.find((x) => x && str(x.name) && str(x.name) === str(b && b.name)) || (arr.length === sb.length ? arr[i] : null) || null;
    const beats = sb.map((b, i) => {
      const p = find(pb, b, i) || {}, n = find(ib, b, i) || {};
      const claim = claimOf(p.claim, grounded);
      const read = n.read && typeof n.read === "object" ? str(n.read.text) : "";
      const extra = clean({
        role: str(p.role), peak: n.peak === true || p.peak === true ? true : undefined, slot: str(n.slot || p.slot),
        actor: str(p.actor && typeof p.actor === "object" ? [p.actor.what, p.actor.does].filter(Boolean).join(" ") : p.actor), domain: str(p.domain),
        picture: str(p.picture), props: Array.isArray(p.props) ? p.props.map(str).filter(Boolean) : undefined, sound: str(p.sound),
        claim: claim || undefined, buys: str(n.buys), viewer_before: str(n.viewer_before), viewer_after: str(n.viewer_after),
        relation: str(n.relation), importance: [1, 2, 3].includes(Number(n.importance)) ? Number(n.importance) : undefined, read,
      });
      const merged = { ...b };
      for (const [k, v] of Object.entries(extra)) if (merged[k] == null || merged[k] === "") merged[k] = v;
      if (p.turn === true && merged.turn == null) merged.turn = true;
      if (!str(merged.visual) && str(p.visual)) merged.visual = str(p.visual);
      return merged;
    });
    const covers = (Array.isArray(P.coverage) ? P.coverage : []).filter((c) => c && typeof c === "object").map((c) => {
      const what = c.claim != null ? claimOf(c.claim, grounded) : null;
      return clean({ claim: what ? what.text : undefined, claim_id: what ? what.id : undefined, feature: str(c.feature), beat: Number(c.beat) >= 1 ? Number(c.beat) : undefined, cut: str(c.cut) });
    });
    const villain = I.villain && typeof I.villain === "object" ? I.villain : null;
    const numbers = (Array.isArray(I.felt_numbers) ? I.felt_numbers : []).filter((x) => x && str(x.value)).map((x) => {
      const c = str(x.source) && str(x.source) !== "prop" ? claimOf(x.source, grounded) : null;
      return clean({ value: str(x.value), source: c ? (c.source || c.text) : str(x.source) === "prop" ? "a story detail" : "" });
    });
    const turn = P.turn && typeof P.turn === "object" ? P.turn : null;
    const end = I.ending_first && typeof I.ending_first === "object" ? I.ending_first : null;
    const page = I.page && typeof I.page === "object" ? I.page : {};
    const storyline = clean({
      proposition: str(I.proposition),
      problem: str(page.problem), emotion: str(page.emotion),
      villain: villain ? clean({ what: str(villain.what), picture: str(villain.picture), numbers }) : numbers.length ? { numbers } : undefined,
      turn: turn ? clean({ line: str(turn.line), reverses: str(turn.reverses), payoff: str(turn.payoff), engine: str(P.engine) }) : undefined,
      ending: end ? clean({ line: str(end.line), last_frame: str(end.last_frame), echo: str(end.echo) }) : undefined,
      muted_hook: str(I.muted_hook), first_4s: str(P.first_4s), signature_image: str(P.signature_image),
      coverage: covers,
    });
    return { ...s, ...(sb.length ? { beats } : {}), ...(Object.keys(storyline).length && !s.storyline ? { storyline } : {}) };
  };
  const result = stories.map((s) => withStoryline(withMoves(s)));
  console.log(JSON.stringify(result, null, 2));
} else if (cmd === "choose") {
  const run = runDir();
  const label = labelOf(args.label);
  const mv = jsonMaybe(movesFile(run, label));
  if (mv === null) die(`${cwdRel(movesFile(run, label))} not found`);
  if (mv === undefined || typeof mv !== "object") die(`${cwdRel(movesFile(run, label))} is not valid JSON`);
  const ids = new Set((mv.cards || []).map((c) => c && c.id));
  const ranking = rankedIds(verdictOf(run), label, mv).filter((id) => ids.has(id));
  const heroes = (ranking.length ? ranking : (mv.heroes || []).filter((id) => ids.has(id))).slice(0, 3);
  if (!heroes.length) die(`no hero moves for ${label}: the verdict ranks none and the file lists none`);
  const merged = { ...mv, label, ranking, heroes, chosen_from: `moves-${label}.json` };
  const f = path.join(run, "story", "moves.json");
  writeFile(f, JSON.stringify(merged, null, 2) + "\n");
  out({ ok: true, file: cwdRel(f), label, heroes, ranking });
} else if (cmd === "record") {
  const run = runDir();
  const mv = jsonMaybe(path.join(run, "story", "moves.json"));
  if (mv === null) die("story/moves.json not found (moves.mjs choose first)");
  if (mv === undefined || typeof mv !== "object") die("story/moves.json is not valid JSON");
  const carrier = mv.carrier && typeof mv.carrier === "object" ? str(mv.carrier.what) : str(mv.carrier);
  const date = new Date().toISOString().slice(0, 10);
  const name = path.basename(run);
  const added = (mv.heroes || []).map((id) => (mv.cards || []).find((c) => c && c.id === id)).filter(Boolean).map((c) => ({ date, run: name, id: c.id, title: str(c.title), generator: str(c.generator), carrier }));
  const ledger = [...readLedger().filter((e) => !(e && e.run === name && added.some((a) => a.id === e.id))), ...added].slice(-200);
  writeFile(LEDGER, JSON.stringify(ledger, null, 2) + "\n");
  out({ ok: true, ledger: LEDGER, added: added.length, entries: ledger.length });
} else {
  die("usage: moves.mjs pack|check|check-set|check-verdict|rough-kinds|rough|check-rough|payload|choose|record … (see the header)");
}

// mean absolute difference (0-255, on 64 px wide gray frames) of every frame against the first; flat = every pixel the same
function frameDifference(mp4) {
  const r = spawnSync("ffmpeg", ["-v", "error", "-i", mp4, "-vf", "scale=64:64,format=gray", "-f", "rawvideo", "-"], { maxBuffer: 1 << 28 });
  if (r.status !== 0 || !r.stdout || !r.stdout.length) return null;
  const buf = r.stdout;
  const size = 64 * 64, frames = Math.floor(buf.length / size);
  if (frames < 2) return { frames, max: 0, flat: true };
  let max = 0, lo = 255, hi = 0;
  for (let i = 0; i < frames; i++) {
    let d = 0;
    for (let p = 0; p < size; p++) {
      const v = buf[i * size + p];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
      d += Math.abs(v - buf[p]);
    }
    d /= size;
    if (d > max) max = d;
  }
  return { frames, max: Math.round(max * 100) / 100, flat: hi - lo < 2 };
}

async function rough() {
  if (!args.dir || args.dir === true) die("--dir <run>/story/moves/<label>-<id> required");
  const dir = path.resolve(String(args.dir));
  const src = path.join(dir, "rough.html");
  // rough.json (the beat-kind DSL, roughHtml) is compiled into rough.html by one fixed template; a hand-written rough.html (no generated marker) is left alone
  const jf = path.join(dir, "rough.json");
  if (exists(jf) && (!exists(src) || /rasanai:rough-json/.test(fs.readFileSync(src, "utf8")) || args.json)) {
    const spec = jsonMaybe(jf);
    const bad = spec ? roughProblems(spec) : ["rough.json is missing or not valid JSON"];
    if (bad.length) out({ ok: false, error: "rough.json breaks the beat-kind DSL", problems: bad, kinds: Object.keys(ROUGH_KINDS) }, 2);
    fs.writeFileSync(src, roughHtml(spec));
    const g = path.join(dir, "gsap.min.js");
    if (!exists(g)) fs.copyFileSync(path.join(SKILL_DIR, "scripts", "vendor", "gsap.min.js"), g);
    if (!(args.aspect && args.aspect !== true) && spec.aspect) args.aspect = String(spec.aspect);
  }
  if (!exists(src)) die(`rough.html (or rough.json) not found in ${dir}`);
  const fps = args.fps && args.fps !== true ? Number(args.fps) : 15;
  if (!(fps >= 5 && fps <= 60)) die("--fps must be 5 to 60");
  needTools();
  const [aw, ah] = normalizeAspect(args.aspect && args.aspect !== true ? String(args.aspect) : "16:9").split("x").map(Number);
  const k = 1280 / Math.max(aw, ah);
  let W = Math.round((aw * k) / 2) * 2, H = Math.round((ah * k) / 2) * 2;
  const { launch } = await import("./lib/cdp.mjs");
  // the page is copied beside itself (relative assets keep working) with the vendored GSAP in place of any gsap script tag
  let html = fs.readFileSync(src, "utf8").replace(/<script[^>]+src=["'][^"']*gsap[^"']*["'][^>]*>\s*<\/script>/gi, "");
  html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => `${m}${gsapInline()}<style>html,body{margin:0;overflow:hidden}</style>`) : `${gsapInline()}<style>html,body{margin:0;overflow:hidden}</style>${html}`;
  const tmpPage = path.join(dir, `.rasanai-rough-${process.pid}.html`);
  const frames = fs.mkdtempSync(path.join(os.tmpdir(), "rasanai-rough-"));
  const fail = (msg) => {
    cleanup();
    out({ ok: false, error: msg }, 2);
  };
  const cleanup = () => {
    fs.rmSync(tmpPage, { force: true });
    fs.rmSync(frames, { recursive: true, force: true });
  };
  fs.writeFileSync(tmpPage, html);
  let b;
  try {
    b = await launch({ width: W, height: H, timeoutMs: 30000 });
    await b.open(`file://${tmpPage}`);
    const ready = await b.eval(`new Promise(function(res){var n=0;(function w(){var m=window.__move;if(m&&m.tl&&typeof m.tl.seek==="function")return res(true);if(++n>160)return res(false);setTimeout(w,50);})();})`, { await: true });
    if (!ready) {
      await b.close();
      return fail("rough.html must set window.__move = {tl, duration, bridge?} to a paused GSAP timeline (and load nothing the page cannot find)" + (b.logs.length ? `; the page said: ${b.logs.slice(0, 2).join(" | ")}` : ""));
    }
    await b.eval(`(document.fonts&&document.fonts.ready)?document.fonts.ready.then(function(){return true}):true`, { await: true });
    const info = await b.eval(`(function(){var m=window.__move;try{m.tl.pause();}catch(e){}var d=Number(m.duration);if(!(d>0))d=Number(m.tl.duration());return {d:d,bridge:typeof m.bridge==="number"?m.bridge:null,w:Number(m.width)||0,h:Number(m.height)||0};})()`);
    const d = info.d;
    if (!(d >= MIN_S - 0.01 && d <= MAX_S + 0.01)) {
      await b.close();
      return fail(`the rough runs ${Number.isFinite(d) ? d.toFixed(2) : d} s: it must be 1.5 to 4.5 s (set window.__move.duration, or trim the timeline)`);
    }
    if (info.w > 0 && info.h > 0 && (info.w !== W || info.h !== H) && !(args.aspect && args.aspect !== true)) {
      // the page says its own size: follow it (even numbers for the encoder)
      W = Math.round(info.w / 2) * 2; H = Math.round(info.h / 2) * 2;
      await b.close();
      b = await launch({ width: W, height: H, timeoutMs: 30000 });
      await b.open(`file://${tmpPage}`);
      await b.eval(`new Promise(function(res){var n=0;(function w(){if(window.__move&&window.__move.tl)return res(true);if(++n>160)return res(false);setTimeout(w,50);})();})`, { await: true });
    }
    const grab = async (t, file) => {
      await b.eval(`new Promise(function(res){var m=window.__move;try{m.tl.pause();m.tl.seek(${Number(t)},false);}catch(e){}requestAnimationFrame(function(){requestAnimationFrame(function(){res(true)})})})`, { await: true });
      fs.writeFileSync(file, await b.screenshot());
    };
    const total = Math.max(2, Math.round(d * fps));
    // [0, d): the last frame stops one frame short, so the loop does not hold its first frame twice
    for (let i = 0; i < total; i++) await grab((i / total) * d, path.join(frames, `f${String(i).padStart(4, "0")}.png`));
    const stripT = Array.from({ length: 5 }, (_, i) => Math.round(((i / 4) * d) * 100) / 100);
    const sPng = stripT.map((t, i) => path.join(frames, `s${i}.png`));
    for (let i = 0; i < 5; i++) await grab(stripT[i], sPng[i]);
    await grab(info.bridge != null ? Math.min(d, Math.max(0, info.bridge)) : d / 2, path.join(dir, "poster.png"));
    await b.close();
    b = null;
    const enc = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(fps), "-i", path.join(frames, "f%04d.png"), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-movflags", "+faststart", path.join(dir, "rough.mp4")], { encoding: "utf8" });
    if (enc.status !== 0) return fail(`ffmpeg could not encode the rough: ${(enc.stderr || "").trim().split("\n").pop()}`);
    // the strip: five frames in a row, each labelled with its time (an HTML sheet, so no ffmpeg drawtext is needed)
    const tw = Math.min(384, Math.round(1920 / 5) - 12), th = Math.round((tw * H) / W);
    const sheet = `<!doctype html><html><head><style>html,body{margin:0;background:#141414;font:500 14px/1 -apple-system,Helvetica,Arial,sans-serif;color:#ddd}.g{display:grid;grid-template-columns:repeat(5,${tw}px);gap:8px;padding:8px}figure{margin:0}img{width:${tw}px;height:${th}px;display:block;background:#000}figcaption{padding:5px 2px 0}</style></head><body><div class="g">${stripT.map((t, i) => `<figure><img src="file://${sPng[i]}"><figcaption>${esc(`t = ${t.toFixed(2)} s${info.bridge != null && Math.abs(info.bridge - t) < d / 8 ? " (near the bridge)" : ""}`)}</figcaption></figure>`).join("")}</div></body></html>`;
    const sheetHtml = path.join(frames, "sheet.html");
    fs.writeFileSync(sheetHtml, sheet);
    chromeScreenshot(`file://${sheetHtml}`, path.join(dir, "strip.png"), 5 * tw + 6 * 8, th + 27 + 16, 3000);
    if (!exists(path.join(dir, "strip.png"))) return fail("the strip did not render");
    cleanup();
    out({ ok: true, dir: cwdRel(dir), video: cwdRel(path.join(dir, "rough.mp4")), strip: cwdRel(path.join(dir, "strip.png")), poster: cwdRel(path.join(dir, "poster.png")), duration: Math.round((total / fps) * 100) / 100, fps, size: `${W}x${H}`, frames: total, strip_times: stripT, bridge: info.bridge, look: "Read strip.png: the five frames should show the move happening (the carrier at a different place and size in each)" });
  } catch (e) {
    if (b) await b.close().catch(() => {});
    cleanup();
    die(`rough failed: ${String((e && e.message) || e)}`);
  }
}
