/* RasanRetroOS: a retro desktop kit (windows, dialogs, cursors, icons) for paused GSAP timelines. Original code and original CSS/SVG art:
 * no vendor logo, icon, font file or system sound is copied; variants are inspired by the *conventions* of three eras, nothing else.
 * Variants: "classic" (1-bit Mac Classic: white windows, black pinstripe title bars, dithered desktop, wireframe zoom-rects),
 *           "win95" (grey bevelled chrome, navy gradient title bars, teal desktop, taskbar), "y2k" (candy-translucent plastic/glass, bubble
 *           buttons, aqua gradients, rounded chrome). Fonts are named CSS stacks (Chicago-like: "Geneva, Silkscreen, monospace"; use a bundled
 *           pixel font if the film ships one).
 * Seek-safe: DOM is built once at call time; every move is a GSAP tween/set on YOUR paused timeline (no timers, no rAF, no Math.random).
 *   var OS = RasanRetroOS, d = OS.desktop(stageEl, { variant: "win95", icons: ["Docs", "Bin"], taskbar: true });
 *   var w1 = OS.window(d, { title: "Untitled", body: "<p>hello</p>", x: 120, y: 90, w: 520, h: 340 });
 *   var cur = OS.cursor(d, { x: 60, y: 60 });
 *   OS.open(tl, w1, { at: 0.5 });                       // zoom-rect (classic) / pop (win95, y2k)
 *   OS.click(tl, cur, w1.titlebar, { at: 1.2 });         // cursor travels, presses
 *   OS.drag(tl, cur, w1, { at: 1.5, duration: 0.9, to: [420, 160] });   // cursor grabs the title bar and carries the window
 *   OS.stack(tl, [w1, w2, w3], { at: 3, offset: [36, 28], stagger: 0.18 });  // cascade, last on top
 *   OS.dialog(d, { title: "Alert", text: "Saved.", buttons: ["OK"], icon: "!" }) -> window (open it like any window)
 * Cursors move on `steps` (default 12 per second) when { stepped: true } so they read as period hardware; windows never stutter.
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api; else root.RasanRetroOS = api;
})(typeof window !== "undefined" ? window : this, function (root) {
  "use strict";
  var VERSION = "1.0.0", z = 10;
  function need(c, m) { if (!c) throw new Error("RasanRetroOS: " + m); }
  var VARIANTS = {
    classic: { font: "Geneva, Silkscreen, 'Courier New', monospace", desk: "#fff", ink: "#000", open: "zoomrect", radius: 0 },
    win95: { font: "'MS Sans Serif', Tahoma, 'Segoe UI', Arial, sans-serif", desk: "#008080", ink: "#000", open: "pop", radius: 0 },
    y2k: { font: "'Lucida Grande', 'Trebuchet MS', Verdana, sans-serif", desk: "linear-gradient(135deg,#7fd3ff,#c8a6ff 55%,#ffb3e0)", ink: "#12325a", open: "pop", radius: 12 },
  };
  var CSS = [
    ".ros{position:absolute;inset:0;overflow:hidden;font-size:15px}.ros *{box-sizing:border-box}.ros .w{position:absolute;display:flex;flex-direction:column;transform-origin:50% 50%}",
    ".ros .wb{flex:1;overflow:hidden;padding:12px}.ros .tt{display:flex;align-items:center;gap:8px;padding:0 8px;height:30px;font-weight:700;user-select:none}.ros .tt b{flex:1;font-weight:700}",
    ".ros .ic{position:absolute;width:84px;text-align:center;font-size:13px}.ros .ic i{display:block;width:44px;height:44px;margin:0 auto 4px}.ros .cur{position:absolute;left:0;top:0;width:28px;height:28px;z-index:9999;pointer-events:none}",
    ".ros .btn{display:inline-block;min-width:78px;padding:6px 16px;text-align:center;margin:0 4px}.ros .zr{position:absolute;border:2px dashed #000;pointer-events:none;z-index:9000}",
    // classic
    ".ros.classic{background:#fff url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='4' height='4'%3E%3Crect width='2' height='2' fill='%23000'/%3E%3Crect x='2' y='2' width='2' height='2' fill='%23000'/%3E%3C/svg%3E\");background-size:4px 4px}",
    ".ros.classic .w{background:#fff;border:2px solid #000;box-shadow:3px 3px 0 #000}.ros.classic .tt{background:repeating-linear-gradient(#000 0 1px,#fff 1px 3px);border-bottom:2px solid #000}.ros.classic .tt b{background:#fff;padding:0 8px;text-align:center;flex:0 1 auto;margin:0 auto}",
    ".ros.classic .btn{border:2px solid #000;border-radius:10px;background:#fff}.ros.classic .ic i{background:#fff;border:2px solid #000;box-shadow:2px 2px 0 #000}.ros.classic .ic{color:#000}",
    // win95
    ".ros.win95{background:#008080}.ros.win95 .w{background:#c0c0c0;border:2px solid;border-color:#fff #404040 #404040 #fff;box-shadow:1px 1px 0 #000;padding:3px}",
    ".ros.win95 .tt{background:linear-gradient(90deg,#000080,#1084d0);color:#fff;height:26px}.ros.win95 .wb{background:#fff;margin-top:3px;border:2px solid;border-color:#404040 #fff #fff #404040;color:#000}",
    ".ros.win95 .btn{background:#c0c0c0;border:2px solid;border-color:#fff #404040 #404040 #fff;color:#000}.ros.win95 .ic{color:#fff}.ros.win95 .ic i{background:#e0c860;border:2px solid #000}",
    ".ros.win95 .tb{position:absolute;left:0;right:0;bottom:0;height:40px;background:#c0c0c0;border-top:2px solid #fff;display:flex;align-items:center;padding:0 6px}.ros.win95 .tb .btn{min-width:90px;font-weight:700}",
    // y2k
    ".ros.y2k .w{background:rgba(255,255,255,.55);border:1.5px solid rgba(255,255,255,.9);border-radius:14px;box-shadow:0 14px 34px rgba(30,60,140,.35),inset 0 1px 0 #fff;backdrop-filter:blur(6px);overflow:hidden}",
    ".ros.y2k .tt{background:linear-gradient(#bfe6ff,#6cb6f0);color:#0c2a55;border-bottom:1px solid rgba(255,255,255,.8);height:34px}.ros.y2k .wb{background:rgba(255,255,255,.7);color:#12325a}",
    ".ros.y2k .btn{border-radius:999px;background:linear-gradient(#fff,#a9d8ff 60%,#78bdf3);border:1px solid #5aa6e0;color:#0c2a55;box-shadow:inset 0 1px 0 #fff,0 2px 4px rgba(0,60,140,.3)}.ros.y2k .ic{color:#12325a}.ros.y2k .ic i{border-radius:12px;background:linear-gradient(#fff,#8ad0ff);border:1px solid #fff;box-shadow:0 4px 10px rgba(40,90,180,.3)}",
  ].join("\n");
  var ARROW = { classic: "<svg viewBox='0 0 28 28'><path d='M3 2v20l5-5 4 9 4-2-4-9h7z' fill='#fff' stroke='#000' stroke-width='2' stroke-linejoin='miter'/></svg>", win95: "<svg viewBox='0 0 28 28'><path d='M3 2v20l5-5 4 9 4-2-4-9h7z' fill='#fff' stroke='#000' stroke-width='1.6'/></svg>", y2k: "<svg viewBox='0 0 28 28'><path d='M3 2v20l5-5 4 9 4-2-4-9h7z' fill='#fff' stroke='#2a6fdb' stroke-width='1.8' stroke-linejoin='round'/></svg>" };

  function css() { if (typeof document === "undefined" || document.getElementById("ros-css")) return; var s = document.createElement("style"); s.id = "ros-css"; s.textContent = CSS; document.head.appendChild(s); }
  function el(tag, cls, html, parent) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; if (parent) parent.appendChild(e); return e; }

  function desktop(stage, o) {
    need(stage && typeof document !== "undefined", "desktop: pass the stage element"); o = o || {}; var v = VARIANTS[o.variant || "classic"]; need(v, "unknown variant " + o.variant); css();
    var d = el("div", "ros " + (o.variant || "classic"), null, stage); d.style.fontFamily = o.font || v.font; d.style.background = o.wallpaper || (o.variant === "y2k" ? v.desk : ""); // y2k has no desktop rule in the stylesheet: its desk gradient comes from the variant
    var D = { el: d, variant: o.variant || "classic", spec: v, icons: [] };
    (o.icons || []).forEach(function (name, i) { var ic = el("div", "ic", "<i></i>" + name, d); ic.style.left = "24px"; ic.style.top = 24 + i * 96 + "px"; D.icons.push(ic); });
    if (o.taskbar && D.variant === "win95") { D.taskbar = el("div", "tb", "<span class='btn'>Start</span>", d); }
    return D;
  }
  function win(D, o) {
    o = o || {}; var w = el("div", "w", null, D.el), tt = el("div", "tt", "<b>" + (o.title || "Untitled") + "</b>", w), body = el("div", "wb", o.body || "", w);
    w.style.left = (o.x || 0) + "px"; w.style.top = (o.y || 0) + "px"; w.style.width = (o.w || 480) + "px"; w.style.height = (o.h || 300) + "px"; w.style.zIndex = ++z; w.style.opacity = 0; w.style.visibility = "hidden";
    return { el: w, titlebar: tt, body: body, x: o.x || 0, y: o.y || 0, w: o.w || 480, h: o.h || 300, desktop: D };
  }
  function dialog(D, o) {
    o = o || {}; var btns = (o.buttons || ["OK"]).map(function (b) { return "<span class='btn'>" + b + "</span>"; }).join("");
    var W = win(D, { title: o.title || "Alert", x: o.x == null ? 360 : o.x, y: o.y == null ? 240 : o.y, w: o.w || 420, h: o.h || 190, body: "<div style='display:flex;gap:14px;align-items:center'><div style='font-size:34px;font-weight:700'>" + (o.icon || "!") + "</div><div>" + (o.text || "") + "</div></div><div style='position:absolute;right:14px;bottom:12px'>" + btns + "</div>" });
    W.buttons = Array.prototype.slice.call(W.body.querySelectorAll(".btn")); return W;
  }
  function cursor(D, o) { o = o || {}; var c = el("div", "cur", ARROW[D.variant], D.el); gsap.set(c, { x: o.x || 0, y: o.y || 0 }); return { el: c, x: o.x || 0, y: o.y || 0, stepped: !!o.stepped, fps: o.fps || 12 }; }

  function center(t) { var r = t.getBoundingClientRect ? t : t.el, b = r.getBoundingClientRect(), p = r.closest(".ros").getBoundingClientRect(), s = p.width / r.closest(".ros").offsetWidth || 1; return [(b.left - p.left + b.width * 0.5) / s, (b.top - p.top + b.height * 0.5) / s]; }
  function ease(cur, dur) { return cur.stepped ? "steps(" + Math.max(1, Math.round(dur * cur.fps)) + ")" : "power2.inOut"; }
  // open: classic = an outline zooms from the icon (or `from`) to the window box, then the window appears; others pop from 0.88 with a lift
  function open(tl, W, o) {
    o = o || {}; var at = o.at || 0, dur = o.duration || 0.4, D = W.desktop;
    tl.set(W.el, { visibility: "visible", opacity: 0 }, at);
    if (D.spec.open === "zoomrect") {
      var zr = el("div", "zr", null, D.el), f = o.from || [W.x + W.w / 2 - 20, W.y + W.h / 2 - 15, 40, 30]; zr.style.visibility = "hidden";
      tl.set(zr, { visibility: "visible", left: f[0], top: f[1], width: f[2], height: f[3] }, at)
        .to(zr, { left: W.x, top: W.y, width: W.w, height: W.h, duration: dur, ease: "steps(4)" }, at)
        .set(zr, { visibility: "hidden" }, at + dur).set(W.el, { opacity: 1 }, at + dur);
    } else tl.fromTo(W.el, { opacity: 0, scale: 0.88, y: 14 }, { opacity: 1, scale: 1, y: 0, duration: dur, ease: "back.out(1.5)" }, at);
    return at + dur;
  }
  function close(tl, W, o) { o = o || {}; var at = o.at || 0; tl.to(W.el, { opacity: 0, scale: 0.92, duration: o.duration || 0.18, ease: "power2.in" }, at).set(W.el, { visibility: "hidden" }, at + (o.duration || 0.18)); return at + (o.duration || 0.18); }
  function focus(tl, W, o) { tl.set(W.el, { zIndex: ++z }, (o && o.at) || 0); }
  // click: cursor travels to the target's centre and presses (a 0.08 s squeeze); stays there
  function click(tl, cur, target, o) {
    o = o || {}; var at = o.at || 0, dur = o.duration || 0.5, c = o.to || center(target.el ? target.el : target);
    tl.to(cur.el, { x: c[0], y: c[1], duration: dur, ease: ease(cur, dur) }, at).to(cur.el, { scale: 0.86, duration: 0.06, yoyo: true, repeat: 1, ease: "none" }, at + dur);
    cur.x = c[0]; cur.y = c[1]; return at + dur + 0.12;
  }
  // drag: the cursor is on the title bar; both move together to `to` (the window's top-left), the window lands on top
  function drag(tl, cur, W, o) {
    o = o || {}; var at = o.at || 0, dur = o.duration || 0.8, to = o.to || [W.x + 120, W.y + 60], dx = to[0] - W.x, dy = to[1] - W.y, e = ease(cur, dur);
    tl.set(W.el, { zIndex: ++z }, at).to(W.el, { x: "+=" + dx, y: "+=" + dy, duration: dur, ease: e }, at).to(cur.el, { x: "+=" + dx, y: "+=" + dy, duration: dur, ease: e }, at);
    W.x = to[0]; W.y = to[1]; return at + dur;
  }
  // stack: windows open one after another, each offset from the last, each on top of the previous (a cascade)
  function stack(tl, wins, o) {
    o = o || {}; var off = o.offset || [36, 28], gap = o.stagger == null ? 0.18 : o.stagger, at = o.at || 0, base = [wins[0].x, wins[0].y];
    wins.forEach(function (W, i) { W.x = base[0] + off[0] * i; W.y = base[1] + off[1] * i; W.el.style.left = W.x + "px"; W.el.style.top = W.y + "px"; tl.set(W.el, { zIndex: ++z }, at + gap * i); open(tl, W, { at: at + gap * i, duration: o.duration || 0.32 }); });
    return at + gap * wins.length;
  }
  return { version: VERSION, VARIANTS: VARIANTS, desktop: desktop, window: win, dialog: dialog, cursor: cursor, open: open, close: close, focus: focus, click: click, drag: drag, stack: stack };
});
