/* RasanTypeOnly: the kinetic-type-only kit (films where type is the only actor). Original code, RasanAI MIT. Sits beside RasanType (outline/mask/
 * reorder) and RasanShape.split; it does not replace them. Seek-safe: DOM built once, all motion is tweens/sets on YOUR paused GSAP timeline or
 * a proxy tween whose setter is a pure function of progress. No Math.random, no timers, no clock. Call after document.fonts.ready (fit() measures).
 *   var Y = RasanTypeOnly;
 *   Y.wordPerShot(tl, stage, ["SHIP", "IT", "TODAY"], { at: 0, per: 0.42, font: "900 200px Inter", bg: ["#111", "#ffe14d", "#ff3b30"], ink: ["#fff", "#111", "#fff"], fill: 0.9 });
 *   Y.crop(tl, el, { at: 3, duration: 1.6, from: 1.0, to: 2.4, focus: [0.15, 0.5] });          // full-frame crop: push into one letter
 *   Y.swap(tl, slotEl, ["fast", "safe", "yours"], { at: 4, every: 0.7 });                        // in-place word swap, the line never moves
 *   Y.drum(tl, hostEl, ["design", "build", "ship", "learn"], { at: 6, every: 0.55, rows: 5 });   // word drum: a cylinder of words rolls past a window
 *   Y.ladder(tl, stage, ["We make it.", "We make it fast.", "We make it fast for you."], { at: 8, every: 1.0 });   // sentence ladder: each rung repeats the refrain + one new word
 * Every function returns the time it ends, so calls chain. Type stays readable at rest (the held state is whole, inside the frame); crops and
 * drums are motion states, not resting layouts. Letters are never rewritten: the logical text of every host is its aria-label.
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api; else root.RasanTypeOnly = api;
})(typeof window !== "undefined" ? window : this, function (root) {
  "use strict";
  var VERSION = "1.0.0";
  function need(c, m) { if (!c) throw new Error("RasanTypeOnly: " + m); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function mk(tag, css, text, parent) { var e = document.createElement(tag); e.style.cssText = css || ""; if (text != null) { e.textContent = text; e.setAttribute("aria-label", text); } if (parent) parent.appendChild(e); return e; }
  // fit(el, box, { fill: 0.9, maxPx }) -> sets the font-size so the text spans `fill` of the box width (and at most 0.9 of its height); returns px
  function fit(el, box, o) {
    o = o || {}; var cs = getComputedStyle(el), px = parseFloat(cs.fontSize) || 100; el.style.whiteSpace = "nowrap";
    var w = el.scrollWidth || el.offsetWidth || 1, h = el.offsetHeight || px, bw = box.clientWidth || box.offsetWidth, bh = box.clientHeight || box.offsetHeight;
    var s = Math.min((bw * (o.fill || 0.9)) / w, (bh * 0.9) / h); px = Math.min(o.maxPx || 1e5, px * s); el.style.fontSize = px + "px"; return px;
  }
  // wordPerShot: each word is its own full-frame shot on a hard cut (bg and ink cycle); the word scales 0.94 -> 1 over the shot so it never sits dead.
  function wordPerShot(tl, stage, words, o) {
    o = o || {}; var per = o.per || 0.4, at = o.at || 0, bg = o.bg || ["#111"], ink = o.ink || ["#fff"], sh = [];
    words.forEach(function (w, i) {
      var s = mk("div", "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;visibility:hidden;background:" + bg[i % bg.length] + ";color:" + ink[i % ink.length] + ";z-index:" + (10 + i), null, stage), t = mk("div", "font:" + (o.font || "900 200px system-ui") + ";letter-spacing:-.02em;line-height:1", w, s);
      s.appendChild(t); sh.push({ s: s, t: t });
    });
    sh.forEach(function (x, i) {
      fit(x.t, stage, { fill: o.fill || 0.9 });
      tl.set(x.s, { visibility: "visible" }, at + i * per).fromTo(x.t, { scale: o.from || 0.94 }, { scale: 1, duration: per, ease: "power2.out" }, at + i * per);
      if (i < sh.length - 1 || o.hideLast) tl.set(x.s, { visibility: "hidden" }, at + (i + 1) * per);
    });
    return at + words.length * per;
  }
  // crop: a full-frame crop of one element: scale from `from` to `to` toward a focus point (0..1 of the element), so only part of the glyphs shows
  function crop(tl, el, o) {
    o = o || {}; var f = o.focus || [0.5, 0.5], to = o.to || 2.4, at = o.at || 0, d = o.duration || 1.4;
    tl.set(el, { transformOrigin: (f[0] * 100) + "% " + (f[1] * 100) + "%" }, at).fromTo(el, { scale: o.from || 1 }, { scale: to, duration: d, ease: o.ease || "power2.inOut" }, at);
    return at + d;
  }
  // swap: the slot (an inline-block span in a fixed line) changes word in place; its width follows (tween), the rest of the line holds. The slot
  // must contain the first word; words[0] is shown at `at`, words[1] after `every`, ...
  function swap(tl, slot, words, o) {
    o = o || {}; var at = o.at || 0, every = o.every || 0.7, d = 0.2, host = slot, probe = mk("span", "position:absolute;visibility:hidden;white-space:nowrap;font:inherit", null, slot.parentNode), cs = getComputedStyle(slot);
    probe.style.font = cs.font; probe.style.letterSpacing = cs.letterSpacing; slot.style.display = "inline-block"; slot.style.whiteSpace = "nowrap"; slot.style.overflow = "hidden"; slot.style.verticalAlign = "bottom";
    var widths = words.map(function (w) { probe.textContent = w; return probe.offsetWidth; }); var probe0 = probe.offsetHeight; probe.remove();
    slot.textContent = ""; slot.style.position = "relative"; slot.setAttribute("aria-label", words.join(" / ")); slot.style.width = widths[0] + "px"; slot.style.height = probe0 + "px";
    var inners = words.map(function (w, i) { return mk("span", "position:absolute;left:0;top:0;white-space:nowrap;opacity:" + (i === 0 ? 1 : 0), w, slot); });
    words.forEach(function (w, i) {
      if (i === 0) return; var t = at + (i - 1) * every + (o.first || every), prev = inners[i - 1], cur = inners[i];
      tl.to(prev, { y: -12, opacity: 0, duration: d, ease: "power2.in" }, t).fromTo(cur, { y: 12, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: "back.out(1.4)" }, t + d)
        .to(slot, { width: widths[i], duration: 0.3, ease: "power3.inOut" }, t);
    });
    return at + (o.first || every) + (words.length - 1) * every;
  }
  // drum: `rows` words visible on a vertical cylinder; progress p (in word steps) drives each word's angle: y = R sin, scaleY = cos, opacity by cos
  function drum(tl, host, words, o) {
    o = o || {}; var rows = o.rows || 5, at = o.at || 0, every = o.every || 0.55, n = words.length, R = o.radius || (host.clientHeight / 2.2), lh = (o.lineHeight || (host.clientHeight / rows)), items = [], h = { p: 0 };
    host.style.position = host.style.position || "relative"; host.style.overflow = "hidden";
    words.forEach(function (w) { items.push(mk("div", "position:absolute;left:0;right:0;top:50%;text-align:center;white-space:nowrap;line-height:1;transform-origin:50% 50%;font:" + (o.font || "800 80px system-ui") + ";color:" + (o.ink || "inherit"), w, host)); });
    var step = (2 * Math.asin(Math.min(1, lh / (2 * R))));
    function paint(p) {
      items.forEach(function (it, i) {
        var k = ((i - p) % n + n) % n; if (k > n / 2) k -= n; var a = k * step, vis = Math.abs(a) < Math.PI / 2 - 0.05;
        it.style.visibility = vis ? "visible" : "hidden"; if (!vis) return;
        it.style.opacity = String(Math.pow(Math.cos(a), 1.4)); it.style.transform = "translateY(" + (R * Math.sin(a) - it.offsetHeight / 2).toFixed(2) + "px) scaleY(" + Math.cos(a).toFixed(4) + ")";
      });
    }
    Object.defineProperty(h, "q", { get: function () { return h.p; }, set: function (v) { h.p = v; paint(v); } });
    var steps = o.steps == null ? n : o.steps; paint(0);
    tl.fromTo(h, { q: 0 }, { q: steps, duration: steps * every, ease: o.ease || "power1.inOut", immediateRender: false }, at);
    return at + steps * every;
  }
  // ladder: sentences stack as rungs; each new rung enters from below at full size while older rungs slide up, shrink to 0.8 and dim; the refrain words
  // that repeat stay where they were (each rung is one line; the container moves by one line height per step).
  function ladder(tl, stage, lines, o) {
    o = o || {}; var at = o.at || 0, every = o.every || 1, font = o.font || "800 96px system-ui", ink = o.ink || "#fff", dim = o.dim == null ? 0.28 : o.dim, gap = o.gap || 1.15, els = [], lhPx;
    var col = mk("div", "position:absolute;left:0;right:0;top:50%;text-align:center;", null, stage);
    lines.forEach(function (l, i) { els.push(mk("div", "font:" + font + ";color:" + ink + ";line-height:" + gap + ";white-space:nowrap;opacity:0;transform-origin:50% 50%", l, col)); });
    lhPx = parseFloat(getComputedStyle(els[0]).fontSize) * gap;
    els.forEach(function (e, i) {
      var t = at + i * every; tl.fromTo(e, { opacity: 0, y: lhPx * 0.5, scale: 1 }, { opacity: 1, y: 0, duration: 0.45, ease: "power3.out" }, t);
      if (i < els.length - 1) tl.to(e, { opacity: dim, scale: 0.82, duration: 0.4, ease: "power2.inOut" }, t + every);
    });
    els.forEach(function (e, i) { if (i > 0) tl.to(col, { y: -i * lhPx, duration: 0.45, ease: "power3.out" }, at + i * every); });
    return at + els.length * every;
  }
  return { version: VERSION, fit: fit, wordPerShot: wordPerShot, crop: crop, swap: swap, drum: drum, ladder: ladder };
});
