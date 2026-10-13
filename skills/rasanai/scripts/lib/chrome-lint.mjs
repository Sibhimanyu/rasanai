// Page-chrome lint: the HUD / slide-deck / vibe-coded-UI tells, measured in the real DOM. Zero dependencies (Node >= 20,
// a local Chrome). Used by slop.mjs (--project). The rule table (ids, severities, exemptions) is in
// references/motion-md-contract.md "Page-chrome rules"; the tells are named in references/craft.md section 9.
//
//   const r = await chromeLint(projectDir, { fps: 4, allow: ["tracked-caps-label"] })
//     -> { findings[], pages, samples, exempt[], skipped[], could_not_run[] }
//
// How: like lib/textfit.mjs, each composition is loaded headlessly (no window), seeked to each sample time (4 per second
// by default, spread thinner on a very long film) and read again 0.1 s later; only a block that is HELD (same text, same
// place in both readings) and seen in 2 or more samples counts, so a line flying through a corner mid-transition does not.
// Every visible text block (its real box, size as a share of the frame height, tracking, case, colour, alignment) and every
// filled, bordered or media shape is read. Text inside a UI surface (a filled, rounded ancestor of 2.5% of the frame or
// more, or anything marked data-ui) is exempt from the chrome rules; text inside data-ui="captured" (a faithful rebuild of
// the product's real screen) is exempt from the vibe-coded-UI rules too. An element marked data-chrome="allow" (or inside
// one) is exempt from all of them, for a brand's own measured device; a brand film's grammar.json may list rule ids in
// measured.chrome for the same reason (slop.mjs passes them as `allow`).
//
// Adapted from motionmaxxing (Apache-2.0, Tejas Makwana), scripts/lint.mjs (gate G5): the held-pair idea, the UI-surface
// test and the rule list; the thresholds and the severities are this skill's own.
import fs from "node:fs";
import path from "node:path";
import { chromePath } from "./common.mjs";
import { launch } from "./cdp.mjs";
import { serve } from "./stage3d.mjs";
import { pagesOf, sizeOf, pageFor } from "./textfit.mjs";
import { CHROME_RULES } from "./signatures.mjs";

// runs in the page (serialised below); reads the DOM at the current seek
function pageLib() {
  var CFG = window.__clCfg, W = CFG.W, H = CFG.H;
  var nid = 0, ids = new WeakMap();
  var id = function (e) { var v = ids.get(e); if (!v) { v = ++nid; ids.set(e, v); } return v; };
  var cs = function (e) { return getComputedStyle(e); };
  var rgba = function (c) { var m = /^rgba?\(([^)]+)\)/.exec(c || ""); if (!m) return [0, 0, 0, 0]; var p = m[1].split(/[ ,\/]+/).filter(Boolean).map(parseFloat); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
  var snip = function (e, txt) { var cls = (typeof e.className === "string" ? e.className : "").trim().split(/\s+/).filter(Boolean).slice(0, 2).join("."); return "<" + e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + (cls ? "." + cls : "") + ">" + (txt ? " " + JSON.stringify(txt.slice(0, 40)) : ""); };
  var hidden = function (e) { for (var n = e; n && n !== document.body; n = n.parentElement) if (cs(n).display === "none") return true; return false; };
  var opacity = function (e) { var o = 1; for (var n = e; n && n.nodeType === 1; n = n.parentElement) o *= parseFloat(cs(n).opacity); return o; };
  var visFrac = function (e, r) {
    var x0 = r.left, y0 = r.top, x1 = r.right, y1 = r.bottom, a0 = Math.max(1, (x1 - x0) * (y1 - y0));
    x0 = Math.max(x0, 0); y0 = Math.max(y0, 0); x1 = Math.min(x1, W); y1 = Math.min(y1, H);
    for (var n = e.parentElement; n && n !== document.documentElement; n = n.parentElement) {
      var s = cs(n); if (s.overflowX === "visible" && s.overflowY === "visible") continue;
      var q = n.getBoundingClientRect(); x0 = Math.max(x0, q.left); y0 = Math.max(y0, q.top); x1 = Math.min(x1, q.right); y1 = Math.min(y1, q.bottom);
    }
    return x1 <= x0 || y1 <= y0 ? 0 : ((x1 - x0) * (y1 - y0)) / a0;
  };
  var surf = new Map();
  var isSurface = function (a) {
    if (surf.has(a)) return surf.get(a);
    var res = false;
    if (a.hasAttribute && (a.hasAttribute("data-ui") || a.hasAttribute("contenteditable") || /^(INPUT|TEXTAREA)$/.test(a.tagName))) res = true;
    else if (a !== document.body && a !== document.documentElement) {
      var s = cs(a), c = rgba(s.backgroundColor), filled = c[3] >= 0.3 || (s.backgroundImage && s.backgroundImage !== "none");
      var rad = s.borderTopLeftRadius || "0px", radius = rad.slice(-1) === "%" ? parseFloat(rad) * 3 : parseFloat(rad);
      if (filled && radius >= 6) {
        var r = a.getBoundingClientRect(), area = (r.width * r.height) / (W * H), full = r.width >= 0.9 * W && r.height >= 0.9 * H, cy = (r.top + r.bottom) / 2 / H;
        res = area >= 0.025 && !full && !(r.width >= 0.6 * W && r.height <= 0.14 * H && (cy < 0.12 || cy > 0.88));
      }
    }
    surf.set(a, res); return res;
  };
  var surfaceOf = function (e) { for (var n = e; n && n !== document.body; n = n.parentElement) if (isSurface(n)) return n; return null; };
  var allowed = function (e) { return !!(e.closest && e.closest('[data-chrome="allow"]')); };
  var logoish = function (e) { for (var n = e; n && n !== document.body; n = n.parentElement) if (/logo|wordmark|brand-?mark|lockup/i.test((typeof n.className === "string" ? n.className : "") + " " + n.id)) return true; return false; };
  window.__clScan = function () {
    surf = new Map();
    var blocks = [], shapes = [], groups = new Map(), tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (var n = tw.nextNode(); n; n = tw.nextNode()) {
      var p = n.parentElement; if (!p || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|TITLE)$/.test(p.tagName)) continue;
      var txt = n.textContent.replace(/\s+/g, " ").trim(); if (!txt) continue;
      if (hidden(p) || cs(p).visibility === "hidden" || opacity(p) < 0.05) continue;
      var rg = document.createRange(); rg.selectNodeContents(n);
      var rs = [].slice.call(rg.getClientRects()).filter(function (q) { return q.width > 0.5 && q.height > 0.5; });
      if (!rs.length) continue;
      var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      rs.forEach(function (q) { x0 = Math.min(x0, q.left); y0 = Math.min(y0, q.top); x1 = Math.max(x1, q.right); y1 = Math.max(y1, q.bottom); });
      if (x1 < 0 || x0 > W || y1 < 0 || y0 > H) continue;
      if (visFrac(p, { left: x0, top: y0, right: x1, bottom: y1 }) < 0.5) continue;
      var c = p; while (c.parentElement && c !== document.body && /^(inline|contents)/.test(cs(c).display)) c = c.parentElement;
      var g = groups.get(c) || { c: c, parts: [], x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9, tops: {}, best: null };
      g.parts.push(txt); g.x0 = Math.min(g.x0, x0); g.y0 = Math.min(g.y0, y0); g.x1 = Math.max(g.x1, x1); g.y1 = Math.max(g.y1, y1);
      rs.forEach(function (q) { g.tops[Math.round(q.top / 4)] = 1; });
      if (!g.best || txt.length > g.best.len) g.best = { len: txt.length, p: p };
      groups.set(c, g);
    }
    groups.forEach(function (g) {
      var text = g.parts.join(" ").replace(/\s+([.,;:!?])/g, "$1").trim(); if (!text) return;
      var p = g.best.p, s = cs(p), fs = parseFloat(s.fontSize) || 16, cont = cs(g.c);
      var ls = s.letterSpacing === "normal" ? 0 : parseFloat(s.letterSpacing) || 0, letters = text.replace(/[^A-Za-z]/g, ""), sf = surfaceOf(g.c);
      var after = ""; try { after = getComputedStyle(g.c, "::after").content || ""; } catch (e) {}
      blocks.push({
        id: id(g.c), text: text.slice(0, 120), x0: g.x0 / W, y0: g.y0 / H, x1: g.x1 / W, y1: g.y1 / H, fs: fs / H, ls: ls / fs,
        up: s.textTransform === "uppercase" || (letters.length >= 3 && letters === letters.toUpperCase()),
        mono: /mono|menlo|courier|consolas/i.test(s.fontFamily), color: rgba(s.color).map(function (v, i) { return i < 3 ? Math.round(v) : +(v * opacity(p)).toFixed(2); }),
        ta: cont.textAlign, lines: Object.keys(g.tops).length, ui: sf ? id(sf) : 0, captured: !!(sf && sf.closest && sf.closest('[data-ui="captured"]')) || !!(g.c.closest && g.c.closest('[data-ui="captured"]')),
        allow: allowed(g.c), logo: logoish(g.c), caretAfter: /["'][|▌█▍_]["']/.test(after), snip: snip(g.c, text)
      });
    });
    var all = document.body.querySelectorAll("*");
    for (var i = 0; i < all.length && shapes.length < 2500; i++) {
      var e = all[i];
      if (e.closest("svg") && e.tagName.toLowerCase() !== "svg") continue;
      var tag = e.tagName.toLowerCase(); if (/^(script|style|noscript|template|br|source|track|link|meta)$/.test(tag)) continue;
      if (hidden(e)) continue; var st = cs(e); if (st.visibility === "hidden" && !/^(svg|img|video|canvas)$/.test(tag)) continue;
      var r = e.getBoundingClientRect(); if (r.width < 1 || r.height < 1 || r.right < 0 || r.left > W || r.bottom < 0 || r.top > H) continue;
      var op = opacity(e); if (op < 0.05) continue;
      var bg = rgba(st.backgroundColor), media = /^(img|video|canvas|svg|picture|iframe)$/.test(tag) || (st.backgroundImage && /url\(/.test(st.backgroundImage));
      var bw = [st.borderTopWidth, st.borderRightWidth, st.borderBottomWidth, st.borderLeftWidth].map(function (v) { return parseFloat(v) || 0; });
      var bc = [st.borderTopColor, st.borderRightColor, st.borderBottomColor, st.borderLeftColor].map(function (v) { return rgba(v)[3] > 0.05; });
      var sides = [0, 1, 2, 3].map(function (k) { return bw[k] >= 1 && bc[k]; });
      var fill = bg[3] * op >= 0.05 || (st.backgroundImage && st.backgroundImage !== "none");
      var border = sides[0] || sides[2];
      if (!fill && !media && !sides.some(Boolean)) continue;
      var rad = st.borderTopLeftRadius || "0px", radius = rad.slice(-1) === "%" ? parseFloat(rad) : parseFloat(rad) / Math.max(1, Math.min(r.width, r.height)) * 100;
      var sfc = surfaceOf(e.parentElement || e);
      shapes.push({ id: id(e), tag: tag, snip: snip(e), x0: r.left / W, y0: r.top / H, x1: r.right / W, y1: r.bottom / H, w: r.width, h: r.height, fill: !!fill, alpha: +(bg[3] * op).toFixed(2), border: !!border, sides: sides, media: !!media, radiusPct: Math.round(radius), ui: sfc ? id(sfc) : 0, captured: !!(e.closest && e.closest('[data-ui="captured"]')), self: isSurface(e), allow: allowed(e), logo: logoish(e) });
    }
    return { blocks: blocks, shapes: shapes };
  };
  window.__clRun = function (times) {
    return times.map(function (T) {
      window.__tfSeek(T); var A = window.__clScan();
      var T2 = T + 0.1 <= CFG.dur ? T + 0.1 : Math.max(0, T - 0.1);
      window.__tfSeek(T2); var B = window.__clScan();
      return { T: T, A: A, B: B, later: T2 >= T };
    });
  };
}
export const PAGE_EXTRA = (cfg) => `<script>window.__clCfg=${JSON.stringify(cfg)};(${pageLib.toString()})();</script>`;

const RX = {
  counterNum: /^\s*0?\d{1,2}\s*(?:[\/—–·]|-(?=\s*[A-Za-z]{3,}))\s*(?:0?\d{1,2}\b|[A-Za-z]{3,})/,
  counterWord: /\b(chapter|scene|act|step|part|film|episode|shot|take|bar|beat)\s*0?\d/i,
  counterBare: /^\s*0\d\s*$/,
  greeting: /\bgood\s+(morning|afternoon|evening)\b|\bwelcome back\b|^(hi|hey|hello)\b[^.,]{0,24}(!|\u{1F44B}|\u{1F31E}|☀)/iu,
  labelValue: /^[A-Za-z][A-Za-z ]{2,24}\s*[·•]\s*[$€£]?\s?\d[\d,.]*\s?[kKmMbB%]?/,
  meta: /\bBPM\b|\bFPS\b|\bFRAME\s*\d|\bT\s*\+\s*\d|\bTC\b|\b\d{1,2}:\d{2}:\d{2}/,
};
const ZINC = [[0xd4, 0xd4, 0xd8], [0xa1, 0xa1, 0xaa], [0x71, 0x71, 0x7a], [0x52, 0x52, 0x5b]];
const near = (c, k, d) => Math.hypot(c[0] - k[0], c[1] - k[1], c[2] - k[2]) <= d;
const r3 = (v) => Math.round(v * 1000) / 1000;
const r2 = (v) => Math.round(v * 100) / 100;
const bbox = (b) => [r3(b.x0), r3(b.y0), r3(b.x1), r3(b.y1)];

// one sample (A = the reading at t, B = the reading 0.1 s later) -> hits.add(rule, key, t, detail)
export function evalSample(A, B, t, hits) {
  const blocks = A.blocks.filter((b) => !b.allow), shapes = A.shapes.filter((s) => !s.allow);
  const stable = (b) => B.blocks.some((c) => c.text === b.text && Math.abs(c.x0 - b.x0) < 0.006 && Math.abs(c.y0 - b.y0) < 0.006);
  const free = blocks.filter((b) => !b.ui); // outside any UI surface
  const maxFs = free.reduce((m, b) => Math.max(m, b.fs), 0);
  const clusters = new Map(); // surface id (0 = the page) -> { kinds, ex, captured }
  const kind = (b, k, ex) => { const key = b.ui || 0; if (k === "zinc" && !key) return; const c = clusters.get(key) || { kinds: new Set(), ex: [], captured: false, ui: key }; c.kinds.add(k); c.ex.push(ex); if (b.captured) c.captured = true; clusters.set(key, c); };
  for (const b of blocks) {
    const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, small = b.fs <= 0.04, d = { text: b.text, snippet: b.snip, bbox: bbox(b), fs: r3(b.fs * 100) };
    // vibe-coded UI: applies inside a UI card too, but never inside a captured product screen
    if (!b.captured) {
      if (RX.greeting.test(b.text)) { hits.add("vibe-greeting", b.text, t, d); kind(b, "greeting", b.text); }
      if (RX.labelValue.test(b.text) && !RX.meta.test(b.text)) { hits.add("vibe-ui-tell", "label-value " + b.text, t, { ...d, note: "label · value line" }); kind(b, "label · value", b.text); }
      if (ZINC.some((k) => near(b.color, k, 4)) && b.color[3] >= 0.5) kind(b, "zinc grey", b.text); // only ever a member of a cluster
    } else hits.exempt.add("a [data-ui=\"captured\"] surface is exempt from the vibe-coded-UI rules");
    if (b.ui || b.logo) continue;
    // page chrome (outside UI surfaces and wordmarks)
    const held = stable(b);
    if (small && held && ((cx < 0.2 || cx > 0.8) && (cy < 0.14 || cy > 0.86) || b.y1 < 0.07 || b.y0 > 0.93 || b.x1 < 0.05 || b.x0 > 0.95)) hits.add("corner-micro-label", b.text, t, d);
    if (b.up && b.ls >= 0.05 && b.fs <= 0.045 && b.text.replace(/[^A-Za-z]/g, "").length >= 2 && held) hits.add("tracked-caps-label", b.text, t, { ...d, note: `uppercase, letter-spacing ${r2(b.ls)}em` });
    if (b.fs <= 0.06 && held && (RX.counterNum.test(b.text) || RX.counterWord.test(b.text) || (b.fs <= 0.05 && RX.counterBare.test(b.text))) && !/^\s*24\s*\/\s*7\b/.test(b.text)) hits.add("chapter-counter", b.text, t, d);
  }
  // header / footer bars and hairlines, and a left + right row of small labels
  for (const s of shapes) {
    if (s.media || s.ui || s.self || s.logo) continue;
    const w = s.x1 - s.x0, h = s.y1 - s.y0, cy = (s.y0 + s.y1) / 2;
    if (w >= 0.6 && h <= 0.14 && (cy < 0.12 || cy > 0.88) && (s.alpha >= 0.1 || s.border) && !(w >= 0.9 && h >= 0.9))
      hits.add("header-footer-bar", "bar " + bbox(s).join(","), t, { text: "", snippet: s.snip, bbox: bbox(s), note: `full-width bar in the ${cy < 0.5 ? "top" : "bottom"} band` });
    else if (w >= 0.5 && s.h <= 4 && (cy < 0.14 || cy > 0.86)) hits.add("header-footer-bar", "rule " + bbox(s).join(","), t, { text: "", snippet: s.snip, bbox: bbox(s), note: `hairline rule in the ${cy < 0.5 ? "top" : "bottom"} band` });
  }
  for (const band of ["top", "bottom"]) {
    const row = free.filter((b) => !b.logo && b.fs <= 0.045 && (band === "top" ? (b.y0 + b.y1) / 2 < 0.12 : (b.y0 + b.y1) / 2 > 0.88));
    const L = row.filter((b) => (b.x0 + b.x1) / 2 < 0.35), R = row.filter((b) => (b.x0 + b.x1) / 2 > 0.65);
    for (const a of L) for (const c of R) if (Math.abs((a.y0 + a.y1) / 2 - (c.y0 + c.y1) / 2) < 0.03 && stable(a) && stable(c))
      hits.add("header-footer-bar", `row ${a.text}|${c.text}`, t, { text: `${a.text}  ...  ${c.text}`, snippet: `${a.snip} + ${c.snip}`, bbox: bbox({ x0: a.x0, y0: Math.min(a.y0, c.y0), x1: c.x1, y1: Math.max(a.y1, c.y1) }), note: `${band} row: a label at each side of one line` });
  }
  // corner brackets: small boxes with exactly two adjacent borders, near a frame corner; two or more corners make the set
  const br = shapes.filter((s) => !s.media && !s.ui && !s.fill && s.sides.filter(Boolean).length === 2 && ((s.sides[0] && s.sides[3]) || (s.sides[0] && s.sides[1]) || (s.sides[2] && s.sides[1]) || (s.sides[2] && s.sides[3])) && s.x1 - s.x0 <= 0.08 && s.y1 - s.y0 <= 0.12 && ((s.x0 < 0.15 || s.x1 > 0.85) && (s.y0 < 0.2 || s.y1 > 0.8)));
  const corners = new Set(br.map((s) => `${(s.x0 + s.x1) / 2 < 0.5 ? "l" : "r"}${(s.y0 + s.y1) / 2 < 0.5 ? "t" : "b"}`));
  if (corners.size >= 2) hits.add("corner-brackets", "brackets", t, { text: "", snippet: br.slice(0, 2).map((s) => s.snip).join(" + "), bbox: bbox(br[0]), note: `${corners.size} corner bracket(s)` });
  // kicker over headline, deck layout
  const kickers = new Map();
  for (const a of free) for (const b of free) {
    if (a === b || a.logo || !(a.fs <= 0.04) || !(b.fs >= a.fs * 2 && b.fs >= 0.05)) continue;
    if (/^[\d\s$€£¥.,%+\-–—:kKmMbB×x/]+$/.test(b.text)) continue; // a label over a big figure is a stat caption, not a kicker (the stat-slide tell is a different check)
    const gap = b.y0 - a.y1; if (!(gap < 0.06 && gap > -0.01)) continue;
    if (!(Math.abs(a.x0 - b.x0) < 0.02 || Math.abs((a.x0 + a.x1) / 2 - (b.x0 + b.x1) / 2) < 0.02) || !stable(a) || !stable(b)) continue;
    kickers.set(b.id, a);
    hits.add("kicker-over-headline", a.text + ">" + b.text, t, { text: `${a.text}  over  ${b.text}`, snippet: `${a.snip} over ${b.snip}`, bbox: bbox({ x0: Math.min(a.x0, b.x0), y0: a.y0, x1: Math.max(a.x1, b.x1), y1: b.y1 }), fs: r3(b.fs * 100) });
  }
  const mediaRight = (h) => shapes.find((s) => { const ar = (s.x1 - s.x0) * (s.y1 - s.y0), cx = (s.x0 + s.x1) / 2; return (s.media || s.self) && ar >= 0.04 && ar <= 0.7 && cx > 0.5 && s.x0 > h.x1 - 0.05 && s.y1 > h.y0 && s.y0 < h.y1 + 0.2; });
  for (const b of free) {
    if (!(b.fs >= 0.05 && b.fs >= 0.85 * maxFs && b.x0 < 0.2 && b.x0 >= 0.02 && b.x1 < 0.78 && b.ta !== "center" && Math.abs((b.x0 + b.x1) / 2 - 0.5) > 0.06 && stable(b))) continue;
    const m = mediaRight(b), sub = free.find((c) => c !== b && c.fs >= 0.02 && c.fs <= 0.6 * b.fs && c.y0 - b.y1 > -0.005 && c.y0 - b.y1 < 0.08 && Math.abs(c.x0 - b.x0) < 0.03);
    const ev = [m && `media on the right ${m.snip}`, sub && `sub-line "${sub.text.slice(0, 30)}"`, b.lines >= 2 && `${b.lines} lines`].filter(Boolean);
    if (m) hits.add("deck-layout", b.text, t, { text: b.text, snippet: b.snip, bbox: bbox(b), fs: r3(b.fs * 100), note: `left-anchored headline beside right-side media (${ev.join(", ")})`, sev: "error" });
    else if (ev.length) hits.add("deck-layout", b.text, t, { text: b.text, snippet: b.snip, bbox: bbox(b), fs: r3(b.fs * 100), note: `left-anchored headline block with ${ev.join(", ")} (no media: a lead, not a failure)`, sev: "warn" });
  }
  // status dots: a 6-14 px filled circle with a text right after it
  for (const s of shapes) {
    if (s.captured || !(s.h >= 5 && s.h <= 15 && Math.abs(s.w - s.h) <= 2 && s.radiusPct >= 45 && s.alpha >= 0.5 && !s.media)) continue;
    const nb = blocks.find((b) => !b.captured && Math.abs((b.y0 + b.y1) / 2 - (s.y0 + s.y1) / 2) < 0.012 && b.x0 - s.x1 > -0.002 && b.x0 - s.x1 < 0.02);
    if (!nb) continue;
    hits.add("vibe-ui-tell", "dot " + nb.text, t, { text: nb.text, snippet: `${s.snip} + ${nb.snip}`, bbox: bbox({ x0: s.x0, y0: Math.min(s.y0, nb.y0), x1: nb.x1, y1: Math.max(s.y1, nb.y1) }), note: "status dot before a label" });
    const c = clusters.get(s.ui || 0) || { kinds: new Set(), ex: [], captured: false, ui: s.ui || 0 };
    c.kinds.add("status dot"); c.ex.push("dot + " + nb.text); clusters.set(s.ui || 0, c);
  }
  for (const [uid, c] of clusters) if (c.kinds.size >= 2 && !c.captured)
    hits.add("vibe-ui-card", (uid ? "surface " + uid : "page") + [...c.kinds].sort().join("+"), t, { text: [...new Set(c.ex)].slice(0, 4).join("  |  "), snippet: uid ? "a UI surface" : "page level", bbox: [0, 0, 1, 1], note: "kinds: " + [...c.kinds].sort().join(", ") });
}

// letter-typed headlines: the later reading's text is the earlier one plus letters of the same word (P = earlier, Q = later)
export function evalTyping(P, Q, t, hits) {
  for (const b of P.blocks.filter((x) => !x.allow && !x.ui && !x.logo && x.fs >= 0.05)) {
    const g = Q.blocks.find((c) => !c.ui && Math.abs(c.y0 - b.y0) < 0.02 && (Math.abs(c.x0 - b.x0) < 0.03 || Math.abs((c.x0 + c.x1) / 2 - (b.x0 + b.x1) / 2) < 0.03) && c.text.length > b.text.length && c.text.startsWith(b.text));
    if (g) {
      const rest = g.text.slice(b.text.length), last = b.text.split(/\s+/).pop(), tok = g.text.split(/\s+/)[b.text.split(/\s+/).length - 1] || "";
      if (!/^\s/.test(rest) && tok.length > last.length) hits.add("typed-headline", "typed@" + Math.round(b.y0 * 100), t, { once: true, text: `${b.text}  ->  ${g.text}`, snippet: b.snip, bbox: bbox(b), fs: r3(b.fs * 100), note: `the headline grew by letters (${b.text.length} -> ${g.text.length} characters in 0.1 s)`, sev: "error" });
    }
    const caret = P.shapes.find((s) => !s.media && !s.ui && !s.allow && s.w <= 14 && s.h >= b.fs * 1080 * 0.6 && s.h <= b.fs * 1080 * 2.4 && s.x0 - b.x1 > -0.006 && s.x0 - b.x1 < 0.03 && s.y0 < b.y1 && s.y1 > b.y0 && s.alpha >= 0.3);
    if (caret || b.caretAfter || /[|▌█▍_]$/.test(b.text)) hits.add("typed-headline", "caret@" + Math.round(b.y0 * 100), t, { text: b.text, snippet: b.snip, bbox: bbox(b), fs: r3(b.fs * 100), note: "a caret beside headline-size text (an error when the headline also grows by letters)", sev: "warn" });
  }
}

// the same test across consecutive samples (the 0.1 s pair above misses a slow typist): a headline-size block whose text
// keeps extending the previous sample's text, three or more times in a row, with at least two stops in the middle of a word.
// state is one Map per page; dt is the sample step.
export function typingChain(state, A, t, dt, hits) {
  const seen = new Set();
  for (const b of A.blocks.filter((x) => !x.allow && !x.ui && !x.logo && x.fs >= 0.05)) {
    const key = Math.round(b.y0 * 100), prev = state.get(key);
    seen.add(key);
    const extends_ = prev && t - prev.t <= dt * 1.6 && b.text.length > prev.text.length && b.text.startsWith(prev.text);
    if (!extends_) { state.set(key, { t, text: b.text, grew: 0, mid: 0, from: t }); continue; }
    const words = prev.text.split(/\s+/), nw = b.text.split(/\s+/), lastTok = words[words.length - 1], tok = nw[words.length - 1] || "";
    const mid = !/^\s/.test(b.text.slice(prev.text.length)) && tok.length > lastTok.length;
    const n = { t, text: b.text, grew: prev.grew + 1, mid: prev.mid + (mid ? 1 : 0), from: prev.from };
    state.set(key, n);
    if (n.grew >= 3 && n.mid >= 2) hits.add("typed-headline", "typed@" + key, t, { once: true, text: b.text, snippet: b.snip, bbox: bbox(b), fs: r3(b.fs * 100), note: `the headline grew by letters over ${r2(n.from)}-${r2(t)} s (${n.mid} stops inside a word)`, sev: "error" });
  }
  for (const k of [...state.keys()]) if (!seen.has(k)) state.delete(k);
}

// accumulate hits: rule + key -> times and the first detail
function Hits() {
  const m = new Map();
  return {
    exempt: new Set(), m,
    cur: "",
    add(rule, key, t, d) { const k = rule + "\0" + key; const h = m.get(k) || { rule, key, file: this.cur, ...d, times: [] }; if (!h.times.includes(t)) h.times.push(t); if (d.sev === "error") h.sev = "error"; m.set(k, h); },
  };
}

const FIX = {
  "kicker-over-headline": "Delete the kicker. The headline is the line; if the viewer needs the context, say it in the headline or let the picture carry it.",
  "deck-layout": "Stage a picture, not a slide: one centred line, or a split phrase whose far half is an object; put the media where the words are about it, not beside a left-aligned text block.",
  "typed-headline": "Words arrive whole (a word lands, the next word on the speech rhythm). Typing is only for the product's own input field, rebuilt inside a UI surface (data-ui).",
  "vibe-ui-card": "Rebuild the real screen from the capture (real icons, names, copy, cropped by the frame), mark it data-ui=\"captured\", and drop the invented greeting, status dots and grey text.",
  "vibe-greeting": "Delete the greeting header, or use the product's real one from the capture inside a data-ui=\"captured\" surface.",
  "vibe-ui-tell": "Use the product's real labels and values from the capture; if this is the real screen, mark it data-ui=\"captured\".",
  "chapter-counter": "Remove the counter. A chapter is a ground change and a carried object, never a label.",
  "progress-hairline": "Remove the progress line; progress is the story moving, not a bar.",
  "tracked-caps-label": "Remove the label or set it as normal-case type in the brand's own face; the frame is the claim, the product and the logo once. If the brand's own films carry tracked caps, record that in the brand film's grammar.json measured.chrome.",
  "corner-brackets": "Remove the brackets and crop marks; they are a design-tool costume.",
  "header-footer-bar": "Remove the bar, rule or label row; no header and no footer: the frame belongs to the picture.",
  "corner-micro-label": "Remove it unless the style is a HUD, broadcast or telemetry style that means it.",
  "pinned-element": "Let the carrier move, scale or change role at every seam; if it must sit, it sits for one beat, not three scenes.",
};
const WHY = {
  "kicker-over-headline": "A small line stacked over a headline is the template eyebrow viewers read as a web page.",
  "deck-layout": "A held left-aligned headline block is a slide or a website hero, not a staged picture.",
  "typed-headline": "A headline typed letter by letter, or with a caret, is the default AI opener.",
  "vibe-ui-card": "Several vibe-coded UI tells on one surface (greeting, label · value, status dot, grey text) read as invented proof.",
  "vibe-greeting": "A \"Good morning\" header is the generic dashboard card AI films reach for.",
  "vibe-ui-tell": "One generic-UI tell (label · value line, status dot, zinc grey text); with a second on the same surface it becomes an error.",
  "chapter-counter": "Counters like \"02 / SPEAK\" are production metadata, not something the viewer needs.",
  "progress-hairline": "A thin bar that grows across the frame is deck furniture.",
  "tracked-caps-label": "Wide-tracked small capitals are the stock brand, metadata or kicker label.",
  "corner-brackets": "Corner brackets and crop marks are the look of a design tool mistaken for design.",
  "header-footer-bar": "A header or footer bar (or a left and right row of labels) is web-page chrome.",
  "corner-micro-label": "Small held text pinned in a corner or edge strip reads as HUD chrome.",
  "pinned-element": "The same small element at the same coordinates through three or more shots is a pinned carrier taken literally.",
};
const SEV = { ...CHROME_RULES };
const fmtTimes = (ts) => { ts = [...ts].sort((a, b) => a - b); return `${r2(ts[0])}-${r2(ts[ts.length - 1])} s`; };

// hits -> findings; allow: rule ids a brand's own films carry
export function toFindings(hits, { allow = [], minSamples = 2 } = {}) {
  const out = [], byRule = new Map();
  for (const h of hits.m.values()) {
    if (allow.includes(h.rule)) { hits.exempt.add(`${h.rule} allowed by the brand film's measured.chrome`); continue; }
    if (h.times.length < minSamples && !h.once && h.rule !== "pinned-element") continue; // seen once: in flight, not held
    (byRule.get(h.rule) || byRule.set(h.rule, []).get(h.rule)).push(h);
  }
  for (const [rule, hs] of byRule) {
    // P1 style growth is decided before this; here a rule's severity is its table severity unless the hit says otherwise
    let sev = hs.some((h) => (h.sev || SEV[rule]) === "error") ? "error" : "warn";
    // tracked caps: one label is a lead, two or more distinct labels are a system of labels
    if (rule === "tracked-caps-label") sev = hs.length >= 2 ? "error" : "warn";
    const first = hs.sort((a, b) => a.times[0] - b.times[0])[0];
    const more = hs.length > 1 ? ` (+${hs.length - 1} more: ${hs.slice(1, 4).map((h) => JSON.stringify((h.text || h.key).slice(0, 24))).join(", ")}${hs.length > 4 ? ", ..." : ""})` : "";
    out.push({ rule, severity: sev, where: `${first.file || ""}${first.file ? ": " : ""}${first.text ? JSON.stringify(first.text.slice(0, 60)) + " " : ""}${first.snippet || ""} ${fmtTimes(first.times)} bbox [${first.bbox.join(", ")}]${more}`.trim(), why: `${WHY[rule]}${first.note ? ` (${first.note})` : ""}`, fix: FIX[rule] });
  }
  return out;
}

export async function chromeLint(project, { fps = 4, allow = [], maxSamples = 400 } = {}) {
  const res = { findings: [], pages: 0, samples: 0, exempt: [], skipped: [], could_not_run: [] };
  const root = path.resolve(project);
  const pages = pagesOf(root);
  if (!pages.length) { res.skipped.push("chrome lint: no compositions with a duration to sample (index.html, compositions/)"); return res; }
  const { W, H } = sizeOf(root);
  { const realExit = process.exit; process.exit = () => { throw new Error("no Chrome found (npx hyperframes browser ensure, or set RASANAI_CHROME)"); };
    try { chromePath(); } catch (e) { res.could_not_run.push(`chrome lint: ${e.message}`); return res; } finally { process.exit = realExit; } }
  const idxFile = path.join(root, "index.html");
  const scenes = pages.filter((p) => p.file !== idxFile).sort((a, b) => a.start - b.start); // each sub-composition is a shot
  const filmEnd = Math.max(...pages.map((p) => p.end));
  const dt = Math.max(1 / fps, filmEnd / maxSamples);
  const hits = Hits(), pins = new Map(), sceneAt = (t) => scenes.findIndex((s) => t >= s.start - 1e-6 && t < s.end - 1e-6);
  const barSeries = new Map(); // shape key -> [{t, w, ...}] for the growing progress line
  let b, srv; const tmps = [];
  try {
    srv = await serve(root);
    b = await launch({ width: W, height: H, timeoutMs: 120000 });
    for (const pg of pages) {
      const dur = pg.end - pg.start;
      const tmp = pageFor(pg.file, root, srv.url, W, H, 0.06, PAGE_EXTRA({ W, H, dur }));
      tmps.push(tmp);
      try {
        await b.open(`${srv.url}/${path.basename(tmp)}`, { waitMs: 30000 });
        await b.eval("document.fonts && document.fonts.ready ? document.fonts.ready.then(function(){return true;}) : true", { await: true });
        const times = [];
        for (let i = 0; i * dt < dur - 1e-6; i++) times.push(Math.round(Math.min(i * dt + dt / 2, dur - 0.02) * 1000) / 1000);
        const file = path.relative(root, pg.file); const chain = new Map();
        for (let i = 0; i < times.length; i += 40) {
          const rows = await b.eval(`window.__clRun(${JSON.stringify(times.slice(i, i + 40))})`);
          for (const row of rows) {
            const t = r2(pg.start + row.T), [P, Q] = row.later ? [row.A, row.B] : [row.B, row.A];
            hits.cur = file;
            evalSample(row.A, row.B, t, hits);
            evalTyping(P, Q, t, hits);
            typingChain(chain, row.A, t, dt, hits);
            // pinned candidates: held small text and pills, outside UI surfaces and wordmarks
            const stableB = (x) => row.B.blocks.some((c) => c.text === x.text && Math.abs(c.x0 - x.x0) < 0.006 && Math.abs(c.y0 - x.y0) < 0.006);
            for (const x of row.A.blocks) if (!x.ui && !x.allow && !x.logo && (x.x1 - x.x0) * (x.y1 - x.y0) <= 0.12 && x.fs >= 0.012 && stableB(x)) {
              const key = `${x.text.toLowerCase()}@${Math.round(x.x0 * 100)},${Math.round(x.y0 * 100)}`;
              const e = pins.get(key) || { text: x.text, snippet: x.snip, bbox: bbox(x), scenes: new Set(), times: [], file }; e.scenes.add(sceneAt(t)); e.times.push(t); pins.set(key, e);
            }
            for (const s of row.A.shapes) {
              if (!s.media && !s.ui && !s.self && !s.allow && !s.logo && s.h <= 0.016 * H && s.w >= 2 && (s.alpha >= 0.2 || s.border)) {
                const key = s.id + "@" + file; const a = barSeries.get(key) || []; a.push({ t, w: s.x1 - s.x0, y: (s.y0 + s.y1) / 2, snip: s.snip, bbox: bbox(s), file }); barSeries.set(key, a);
              }
            }
          }
        }
        res.samples += times.length; res.pages++;
      } catch (e) { res.could_not_run.push(`chrome lint: ${path.relative(root, pg.file)}: ${e.message}`); }
    }
  } catch (e) { res.could_not_run.push(`chrome lint: ${e.message}`); }
  finally {
    if (b) await b.close();
    if (srv) await srv.close();
    for (const t of tmps) fs.rmSync(t, { force: true });
  }
  // progress hairline: a thin non-UI bar whose width grows (>= 8% of the frame, mostly non-decreasing) across 3+ samples,
  // sitting in an outer band or reaching 60% of the frame width (an underline drawing in under a headline is not progress)
  for (const [, a] of barSeries) {
    if (a.length < 3) continue;
    const ws = a.map((x) => x.w), grow = Math.max(...ws) - Math.min(...ws);
    let up = 0, dn = 0; for (let i = 1; i < ws.length; i++) { if (ws[i] > ws[i - 1] + 0.002) up++; else if (ws[i] < ws[i - 1] - 0.002) dn++; }
    const outer = a[0].y < 0.14 || a[0].y > 0.86 || Math.max(...ws) >= 0.6;
    if (outer && grow >= 0.08 && up >= 2 && dn <= Math.max(0, Math.floor(up / 3)))
      for (const x of a) hits.add("progress-hairline", a[0].snip + a[0].file, x.t, { text: "", snippet: a[0].snip, bbox: x.bbox, file: a[0].file, note: `a thin bar grows ${r3(Math.min(...ws))} -> ${r3(Math.max(...ws))} of the frame width` });
  }
  // pinned element: the same small text at the same place in 3 or more distinct shots
  if (scenes.length >= 3) {
    for (const e of pins.values()) {
      const n = [...e.scenes].filter((i) => i >= 0).length;
      if (n >= 3) for (const tt of e.times) hits.add("pinned-element", e.text + e.bbox.join(","), tt, { text: e.text, snippet: e.snippet, bbox: e.bbox, file: e.file, note: `the same text at the same coordinates in ${n} shots` });
    }
  } else if (pages.length) res.skipped.push("chrome lint: pinned-element needs 3 or more sub-compositions (shots) to compare");
  res.findings = toFindings(hits, { allow });
  res.exempt = [...hits.exempt];
  return res;
}
