(function () {
  "use strict";
  var root = document.documentElement;
  var reduceQ = window.matchMedia("(prefers-reduced-motion: reduce)");
  var wideQ = window.matchMedia("(min-width: 900px)");
  function pinned() { return root.classList.contains("pin"); }
  /* MOBILE FOUNDATION. `mpin` on <html> (set by the head script) = narrow screen with motion allowed: the mirror of `pin`.
     pinned() stays desktop-only; mpinned() is the phone/tablet mode. A scene opts in with `mpin: true` in addScene (hosts opt in
     with a data-mpin attribute on the section). viewH() is the height every pinned stage is built from: on phones 100svh (the
     small viewport, which does not move when the address bar collapses), on desktop window.innerHeight exactly as before. */
  function mpinned() { return root.classList.contains("mpin"); }
  var svhProbe = null;
  function svhPx() {
    if (!svhProbe) {
      svhProbe = document.createElement("div"); svhProbe.setAttribute("aria-hidden", "true");
      svhProbe.style.cssText = "position:fixed;left:0;top:0;width:0;height:100vh;height:100svh;visibility:hidden;pointer-events:none";
      document.body.appendChild(svhProbe);
    }
    return svhProbe.offsetHeight || window.innerHeight;
  }
  function viewH() { return mpinned() ? svhPx() : window.innerHeight; }
  function calm() { return reduceQ.matches; }
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  var seg = function (v, a, b) { return clamp((v - a) / (b - a), 0, 1); };
  var ease = function (t) { return 1 - Math.pow(1 - t, 3); };
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return [].slice.call((r || document).querySelectorAll(s)); }

  /* ---------- hero intro: any scroll or key finishes it at once ---------- */
  if (root.classList.contains("intro")) {
    var endIntro = function () {
      root.classList.add("intro-done");
      ["scroll", "wheel", "touchstart", "keydown"].forEach(function (t) { window.removeEventListener(t, endIntro); });
    };
    if (window.scrollY > 8) endIntro();
    else ["scroll", "wheel", "touchstart", "keydown"].forEach(function (t) { window.addEventListener(t, endIntro, { passive: true }); });
    setTimeout(function () { root.classList.add("intro-done"); }, 2600);
  }

  /* ---------- mobile menu + old deep links ---------- */
  var menu = $(".menu-toggle"), nav = $(".home .nav");
  if (menu && nav) {
    menu.hidden = false;
    var closeMenu = function () { menu.setAttribute("aria-expanded", "false"); nav.removeAttribute("data-open"); };
    menu.addEventListener("click", function () {
      var open = menu.getAttribute("aria-expanded") !== "true";
      menu.setAttribute("aria-expanded", String(open)); nav.setAttribute("data-open", String(open));
    });
    $$(".nav-links a", nav).forEach(function (a) { a.addEventListener("click", closeMenu); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && menu.getAttribute("aria-expanded") === "true") { closeMenu(); menu.focus(); } });
    document.addEventListener("click", function (e) { if (!nav.contains(e.target)) closeMenu(); });
    wideQ.addEventListener("change", closeMenu);
  }
  // old anchors: technical sections moved to How it works; homepage sections removed in the redesign point to their new home
  // only these names are routed. Current anchors (#flow, #projects, #questions, #download) are never listed, so they are never redirected
  var aliases = {
    different: "how-it-works.html", desk: "how-it-works.html#life", stack: "how-it-works.html#stack", crew: "how-it-works.html#crew",
    depth: "how-it-works.html#render", engine: "how-it-works.html#render", models: "how-it-works.html#crew", songs: "how-it-works.html#render", library: "how-it-works.html#stack",
    reels: "how-it-works.html#crew", presenter: "how-it-works.html#presenter", install: "how-it-works.html#install",
    "meet-crew": "#flow", start: "#flow", "flow-head": "#flow",
    examples: "#projects", gallery: "#projects", yours: "#projects", away: "#projects", features: "#projects", brand: "#projects", finished: "#projects"
  };
  // a plain hash replacement: the local targets are not routed again, so there is no loop; guide targets leave the page once
  function route() {
    var h = location.hash.slice(1);
    if (h && Object.prototype.hasOwnProperty.call(aliases, h)) location.replace(aliases[h]);
  }
  route(); window.addEventListener("hashchange", route);

  /* ---------- scenes: the hero, the rising screenshot with its crew flight, and any [data-rise] window ---------- */
  var scenes = [];
  var MBEAT_TRACK = 1.5;   // phones: how many screens of scroll a chapter’s narrator line takes when the chapter is not pinned around it
  function addScene(sc) { scenes.push(sc); return sc; }
  var pinnedMode = { motion: false };

  // hero: the copy leaves; the cards stay put until the flight (below) lifts them onto the screenshot
  var heroEl = $(".hero.track");
  var copy = heroEl && $("[data-hero-copy]", heroEl);
  if (heroEl) {
    addScene({
      el: heroEl, pin: true, mpin: true,
      progress: function (r, vh) { return clamp(-r.top / Math.max(1, r.height - vh), 0, 1); },
      render: function (p) {
        if (!copy) return;
        var o = 1 - ease(seg(p, .12, .5));
        copy.style.transform = "translateY(" + (-seg(p, .1, .5) * 60).toFixed(1) + "px)";
        copy.style.opacity = o.toFixed(3);
        copy.style.visibility = o < .02 ? "hidden" : "";
      },
      reset: function () { if (copy) { copy.style.transform = ""; copy.style.opacity = ""; copy.style.visibility = ""; } }
    });
  }

  /* ---------- story beats: a short narrator line opens a chapter, then a reveal clears it off the chapter underneath ----------
     makeBeat(el) prepares one .beat for the pinned stage and returns { render(b), reset() }; b is 0..1 through the beat:
     the words fill faint to full (.02-.32), the line holds, then the reveal named in data-beat plays (.45-1):
       scatter  every letter flies off on its own heading, spinning, while the paper thins out
       doors    the line and its paper split along the middle and part, up and down
       playhead a timeline playhead scrubs across with a running timecode and a soft trail: behind it the chapter is revealed,
                ahead of it the line and its paper are still there, cut cleanly at the playhead
       blinds   the letters drop, then the paper folds away in strips, top to bottom
     reset() puts the beat's own markup back exactly, so the stacked page never sees the reveal's extra elements. */
  var hash = function (n) { var x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  function splitChars(root) {
    $$(".beat-word", root).forEach(function (w) {
      var t = w.textContent; w.textContent = "";
      for (var i = 0; i < t.length; i++) { var ch = document.createElement("span"); ch.className = "beat-char"; ch.textContent = t[i]; w.appendChild(ch); }
    });
    return $$(".beat-char", root);
  }
  function makeBeat(el, at) {
    at = at || { fill: [.02, .32], out: .45 };   // when the words fill, and when the reveal starts
    var fx = el.getAttribute("data-beat"), html = el.innerHTML, style = el.getAttribute("style");
    var line = $(".beat-line", el), layer = $(".beat-layer", el), halves = [], strips = [], chars = [], vw = 0, vh2 = 0;
    if (fx === "doors") {
      // two copies of layer and line, each showing one half; the second is decoration for assistive tech
      el.innerHTML = '<div class="beat-half">' + html + '</div><div class="beat-half" aria-hidden="true">' + html + "</div>";
      halves = $$(".beat-half", el);
      halves[0].style.clipPath = "inset(0 0 50% 0)"; halves[1].style.clipPath = "inset(50% 0 0 0)";
    }
    if (fx === "blinds") {
      var box = document.createElement("div"); box.className = "beat-strips";
      for (var i = 0; i < 9; i++) { var s = document.createElement("div"); s.className = "beat-strip"; box.appendChild(s); strips.push(s); }
      el.insertBefore(box, el.firstChild);
    }
    if (fx === "scatter" || fx === "blinds" || fx === "slam" || fx === "playhead") chars = splitChars(line);
    var head = null, code = null;
    if (fx === "playhead") {
      head = document.createElement("div"); head.className = "beat-head"; head.setAttribute("aria-hidden", "true");
      head.innerHTML = "<b>00:00:00:00</b>"; code = head.firstChild;
      el.appendChild(head);
    }
    var words = $$(".beat-word", el), lines = $$(".beat-line", el), N = chars.length;
    // each letter's own flight: a heading away from the middle of the line, a distance past the screen edge, a spin, a start
    var fly = chars.map(function (ch, k) {
      var r = ch.getBoundingClientRect(), lr = line.getBoundingClientRect();
      var dx = (r.left + r.width / 2) - (lr.left + lr.width / 2), dy = (r.top + r.height / 2) - (lr.top + lr.height / 2);
      var ang = Math.atan2(dy + (hash(k) - .5) * 160, dx + (hash(k + 9) - .5) * 60);
      return { ang: ang, far: .7 + hash(k + 3) * .7, spin: (hash(k + 5) - .5) * 520, grow: .6 + hash(k + 7) * 1.4, at: hash(k + 11) * .32 };
    });
    // slam: each letter's throw from the impact at the middle of the line (px per unit of its own time)
    var lineBox = line.getBoundingClientRect(), half = Math.max(1, lineBox.width / 2);
    var blast = chars.map(function (ch, k) {
      var r = ch.getBoundingClientRect(), dx = (r.left + r.width / 2) - (lineBox.left + half), dy = (r.top + r.height / 2) - (lineBox.top + lineBox.height / 2);
      var nx = clamp(Math.abs(dx) / half, 0, 1), sx = dx < 0 ? -1 : 1, near = 1 - nx * .55;
      // the shockwave leaves from the impact at once (at: nearest letters first, all within a few frames);
      // every letter its own throw: speed, lift and spin vary a lot, a few go the "wrong" way, and each has a depth: some fly at
      // the reader and grow, some fall back and shrink, so the burst has front and back instead of travelling in clumps
      var wild = hash(k + 13) < .18 ? -1 : 1, depth = hash(k + 17);
      return {
        vx: sx * wild * (260 + 900 * near * hash(k + 19) + hash(k) * 520), vy: -(140 + 900 * hash(k + 3) * (.4 + near)) + dy * 2.5,
        spin: (hash(k + 5) - .5) * 900, at: nx * .05 + hash(k + 7) * .04, grow: depth < .35 ? .35 + depth : 1 + (depth - .35) * 2.6,
        g: 1100 + hash(k + 23) * 1000
      };
    });
    // playhead: where each letter sits across the screen
    var cx = chars.map(function (ch) { var r = ch.getBoundingClientRect(); return r.left + r.width / 2; });
    function render(b) {
      vw = window.innerWidth; vh2 = window.innerHeight;
      var fill = seg(b, at.fill[0], at.fill[1]), W = words.length / Math.max(1, lines.length);
      words.forEach(function (w, k) { var i = k % W; w.style.opacity = (.16 + .84 * seg(fill, i / W, (i + 1.6) / W)).toFixed(3); });
      var r = seg(b, at.out, 1);
      el.style.visibility = r >= 1 ? "hidden" : "";
      if (fx === "slam") {
        // the shockwave reaches the letters nearest the impact first; each is thrown outward and up, then falls, spinning
        chars.forEach(function (ch, k) {
          var f = blast[k], t = seg(r, f.at, f.at + .62 + hash(k + 29) * .2);
          // the speed curve: a hard burst (a third of the travel in the first fifth, easing out), then a slow hover with a
          // little bob, then gathering speed away, falling as it goes
          var u = t < .2 ? .3 * (1 - Math.pow(1 - t / .2, 4))
            : t < .68 ? .3 + .08 * ((t - .2) / .48)
            : .38 + 1.2 * Math.pow((t - .68) / .32, 2);
          var bob = t > .2 && t < .68 ? Math.sin((t - .2) / .48 * Math.PI * 2 + k) * 6 * Math.sin((t - .2) / .48 * Math.PI) : 0;
          var fall = f.g * .55 * Math.pow(Math.max(0, t - .62) / .38, 2);
          ch.style.transform = t ? "translate3d(" + (f.vx * u).toFixed(1) + "px," + (f.vy * u + bob + fall).toFixed(1) + "px,0) rotate(" + (f.spin * (u * .8 + .2 * t)).toFixed(1) + "deg) scale(" + (1 + (f.grow - 1) * Math.min(1, u * 1.3)).toFixed(3) + ")" : "";
          ch.style.opacity = (1 - seg(t, .72, 1)).toFixed(3);
          ch.style.zIndex = f.grow > 1 ? "2" : "";
        });
        layer.style.opacity = (1 - seg(r, .05, .45)).toFixed(3);
      } else if (fx === "scatter") {
        var reach = Math.max(vw, vh2);
        chars.forEach(function (ch, k) {
          var f = fly[k], t = seg(r, f.at, f.at + .62), e = t * t * (3 - 2 * t) * t;   // slow to leave, then away
          ch.style.transform = t ? "translate3d(" + (Math.cos(f.ang) * f.far * reach * e).toFixed(1) + "px," + (Math.sin(f.ang) * f.far * reach * e).toFixed(1) + "px,0) rotate(" + (f.spin * e).toFixed(1) + "deg) scale(" + (1 + (f.grow - 1) * e).toFixed(3) + ")" : "";
          ch.style.opacity = (1 - seg(t, .55, 1)).toFixed(3);
        });
        layer.style.opacity = (1 - seg(r, .12, .7)).toFixed(3);
      } else if (fx === "doors") {
        var d = inOutC(seg(r, 0, .9)) * vh2 * .56;
        halves[0].style.transform = "translate3d(0," + (-d).toFixed(1) + "px,0)";
        halves[1].style.transform = "translate3d(0," + d.toFixed(1) + "px,0)";
      } else if (fx === "playhead") {
        // the playhead eases in from the left edge and accelerates through; everything left of it is the chapter
        var x = r > 0 ? -24 + (vw + 48) * inOutC(r) : -24;
        head.style.transform = "translate3d(" + x.toFixed(1) + "px,0,0)";
        head.style.opacity = r > 0 && r < 1 ? "1" : "0";
        var fr = Math.round(r * 96);   // 4 seconds at 24 fps
        code.textContent = "00:00:" + ("0" + Math.floor(fr / 24)).slice(-2) + ":" + ("0" + fr % 24).slice(-2);
        layer.style.clipPath = x > -24 ? "inset(0 0 0 " + Math.max(0, x).toFixed(1) + "px)" : "";
        // a clean wipe: the line is cut by the same edge as its paper, so nothing piles up at the playhead
        var lb = line.getBoundingClientRect();
        line.style.clipPath = x > -24 ? "inset(0 0 0 " + Math.max(0, x - lb.left).toFixed(1) + "px)" : "";
      } else if (fx === "blinds") {
        chars.forEach(function (ch, k) {
          var t = seg(r, k / N * .3, k / N * .3 + .34), sgn = hash(k + 2) < .5 ? -1 : 1;
          ch.style.transform = t ? "translate3d(0," + (t * t * vh2 * .7).toFixed(1) + "px,0) rotate(" + (sgn * (12 + hash(k + 4) * 40) * t).toFixed(1) + "deg)" : "";
          ch.style.opacity = (1 - seg(t, .55, 1)).toFixed(3);
        });
        strips.forEach(function (s, i) { var t = inOutC(seg(r, .3 + i * .045, .62 + i * .045)); s.style.transform = t ? "scaleY(" + (1 - t).toFixed(4) + ")" : ""; });
      }
    }
    function reset() { el.innerHTML = html; if (style === null) el.removeAttribute("style"); else el.setAttribute("style", style); }
    return { render: render, reset: reset };
  }

  // a chapter that opens with a beat pins its own stage: the beat plays over the first 70% of the pin, then the chapter holds
  var hosts = $$(".beat-host").map(function (host) {
    var pin = $(":scope > .host-pin", host), el = pin && $(":scope > [data-beat]", pin);
    if (!el) return null;
    // span: how much of the pin the beat takes (the rest holds the chapter, or plays its own scene: h.extra)
    var h = { host: host, el: el, beat: null, span: host.classList.contains("squeak-scene") ? .15 : .7 };
    // phones: a host plays pinned only if its section says data-mpin (projects, end card; B and C add #control)
    h.mobile = host.hasAttribute("data-mpin");
    // projects on a phone: the beat pins over its own stretch of scroll (MBEAT_TRACK x the view), then the chapter scrolls on plainly
    h.mtrack = host.classList.contains("projects") ? MBEAT_TRACK : 0;
    h.on = function () {
      if (h.beat || calm() || !((wideQ.matches && pinned()) || (mpinned() && h.mobile))) return;
      host.classList.add("host-ready");
      // phones, projects: the line and the chapter’s heading share one sticky stage (.m-stage) of their own, so they release
      // together when it ends (a sticky child is held by its whole grid, not by a row of it); off() puts both back
      if (h.mtrack && mpinned()) {
        var head = $(".proj-head", host), copyEl = head && head.parentNode;
        if (head) {
          h.mstage = document.createElement("div"); h.mstage.className = "m-stage";
          pin.insertBefore(h.mstage, pin.firstChild);
          h.mstage.appendChild(el); h.mstage.appendChild(head);
          h.mhead = head; h.mcopy = copyEl; h.mpin = pin;
        }
      }
      h.beat = makeBeat(el);
    };
    h.off = function () {
      if (!h.beat) return;
      h.beat.reset(); h.beat = null;
      if (h.mstage) { h.mpin.insertBefore(el, h.mstage); h.mcopy.insertBefore(h.mhead, h.mcopy.firstChild); h.mstage.remove(); h.mstage = null; }
      if (h.clear) h.clear();
      host.classList.remove("host-ready");
    };
    h.scene = addScene({
      el: host, pin: true, mpin: h.mobile, glide: host.classList.contains("squeak-scene") ? 170 : 120,   // the device scene glides a touch softer
      progress: function (r, view) {
        if (h.mtrack && mpinned()) return clamp(-r.top / (h.mtrack * view), 0, 1);
        return clamp(-r.top / Math.max(1, r.height - view), 0, 1);
      },
      render: function (p) {
        if (!h.beat) return;
        h.beat.render(seg(p, 0, h.mtrack && mpinned() ? 1 : h.span));
        if (h.extra) h.extra(p);
      },
      reset: h.off
    });
    return h;
  }).filter(Boolean);
  /* ---------- RasanAI x Squeak: after its line, the chapter plays five beats as p runs from the beat's end to 1 ----------
     0 the partnership (Mac: Studio at work, the duck working)   1 the duck knows first (badge, Squeak's panel with the call)
     2 the Mac becomes the iPhone                                 3 answer with a tap (Ledger picked, Use Ledger, Sent)
     4 back to the Mac (Studio on the animatic, the decision card, the duck celebrating)
     The line on the left changes with each beat; every frame is a function of p, so scrolling back plays it in reverse. */
  (function () {
    var host = hosts.filter(function (h) { return h.host.classList.contains("squeak-scene"); })[0];
    if (!host) return;
    var root = host.host, q = function (s) { return $(s, root); };
    var dev = q(".sq-device"), screen = q(".sq-screen"), mac = q(".sq-mac"), phone = q(".sq-phone");
    if (!dev || !screen || !mac || !phone) return;
    var steps = $$(".sq-step", root), STEP = [[0, .2], [.2, .38], [.38, .52], [.52, .8], [.8, 1.1]];
    var parts = {
      badges: $$(".sq-badge", root),
      next: q(".sq-shot-next"), note: q(".sq-note"), base: q(".sq-base"), ledger: q(".l-ledger"), cta: q(".sq-cta"), use: q(".sq-use"), sent: q(".sq-sent")
    };
    // the partnership: the two marks, the x, the impact (glow, rings, sparks), the line, and the small lockup it lands in
    var G = {
      root: q(".sq-grand"), row: q(".g-row"), r: q(".g-r"), s: q(".g-s"), rm: q(".g-r .g-mark"), sm: q(".g-s .g-mark"),
      rw: q(".g-r .g-word"), sw: q(".g-s .g-word"), x: q(".g-x"), glow: q(".g-glow"), rings: $$(".g-ring", root),
      sparks: $$(".g-sparks i", root), words: $$(".g-line span", root), small: q(".sq-partners")
    };
    var gKey = "", gGeo = null;
    function grandGeo() {
      var key = window.innerWidth + "x" + window.innerHeight;
      if (gGeo && gKey === key) return gGeo;
      [G.row, G.r, G.s, G.x].forEach(function (el) { el.style.transform = ""; });
      var cx = window.innerWidth / 2, c = function (el) { var b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width, h: b.height }; };
      var rm = c(G.rm), sm = c(G.sm), x = c(G.x), row = c(G.row), pin = G.root.getBoundingClientRect();
      // the row's centre relative to the pinned stage, so it holds wherever the stage was when this was measured
      row.rx = row.x - pin.left; row.ry = row.y - pin.top;
      var gap = x.w * .9;
      // where the marks meet: touching either side of the x, in the middle of the screen
      gGeo = { row: row, rOff: (cx - gap - rm.w / 2) - rm.x, sOff: (cx + gap + sm.w / 2) - sm.x, xOff: cx - x.x, cx: cx, cy: row.y };
      gKey = key;
      return gGeo;
    }
    var backOut = function (t) { var c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
    function renderGrand(gp) {
      if (!G.root || !G.row) return 1;
      var g = grandGeo(), vw = window.innerWidth, vmin = Math.min(vw, window.innerHeight);
      G.root.style.visibility = gp >= 1 ? "hidden" : "";
      if (gp >= 1) { if (G.small) G.small.style.opacity = ""; return 1; }
      // 1. the marks fly in from the edges, big and turning, and slam together (fast in, hard stop)
      var a = seg(gp, 0, .3), eA = 1 - Math.pow(1 - a, 4), hit = seg(gp, .3, .38);
      // 2. the impact: a short shudder, the x pops, rings and sparks go out, the glow flares
      var shake = gp > .3 && gp < .4 ? Math.sin(gp * 900) * 10 * (1 - hit) : 0;
      // 3. the words unfold out of the marks and the lockup opens up to full width
      var u = inOutC(seg(gp, .4, .6));
      var rX = mix(g.rOff - vw * .75, g.rOff, eA), sX = mix(g.sOff + vw * .75, g.sOff, eA);
      var squash = 1 - .1 * Math.sin(Math.PI * hit), sc = 1.35 - .35 * eA;
      G.r.style.transform = "translate3d(" + mix(rX, 0, u).toFixed(1) + "px,0,0)";
      G.s.style.transform = "translate3d(" + mix(sX, 0, u).toFixed(1) + "px,0,0)";
      G.rm.style.transform = "rotate(" + (-28 * (1 - eA)).toFixed(2) + "deg) scale(" + (sc * squash).toFixed(4) + "," + (sc * (2 - squash)).toFixed(4) + ")";
      G.sm.style.transform = "rotate(" + (28 * (1 - eA)).toFixed(2) + "deg) scale(" + (sc * squash).toFixed(4) + "," + (sc * (2 - squash)).toFixed(4) + ")";
      G.rm.style.opacity = G.sm.style.opacity = seg(gp, 0, .06).toFixed(3);
      [G.rw, G.sw].forEach(function (w) { w.style.clipPath = "inset(0 " + ((1 - u) * 100).toFixed(2) + "% 0 0)"; });
      var xp = seg(gp, .3, .42);
      G.x.style.opacity = xp > 0 ? "1" : "0";
      G.x.style.transform = "translate3d(" + mix(g.xOff, 0, u).toFixed(1) + "px,0,0) scale(" + Math.max(0, backOut(xp)).toFixed(4) + ") rotate(" + ((1 - xp) * 90).toFixed(1) + "deg)";
      G.rings.forEach(function (ring, k) {
        var t = seg(gp, .3 + k * .03, .62 + k * .05), e = 1 - Math.pow(1 - t, 3);
        ring.style.transform = "scale(" + (.2 + e * (3.6 + k * 1.4)).toFixed(3) + ")";
        ring.style.opacity = (t > 0 ? (1 - t) * .9 : 0).toFixed(3);
      });
      G.sparks.forEach(function (sp, k) {
        var t = seg(gp, .3, .58 + (k % 4) * .03), e = 1 - Math.pow(1 - t, 2.4), ang = k * Math.PI / 8 + (k % 3) * .2, dist = vmin * (.22 + (k % 5) * .07);
        sp.style.transform = "translate3d(" + (Math.cos(ang) * dist * e).toFixed(1) + "px," + (Math.sin(ang) * dist * e).toFixed(1) + "px,0) scale(" + (1 - .6 * t).toFixed(3) + ")";
        sp.style.opacity = (t > 0 ? 1 - t : 0).toFixed(3);
      });
      G.glow.style.opacity = (seg(gp, .28, .34) * (1 - .55 * seg(gp, .38, .7)) * (1 - seg(gp, .82, .95))).toFixed(3);
      G.glow.style.transform = "scale(" + (.6 + .5 * seg(gp, .28, .5)).toFixed(3) + ")";
      // 4. the line, word by word; then everything lands in the small lockup above the first line of the chapter
      G.words.forEach(function (w, k) {
        var t = ease(seg(gp, .52 + k * .025, .6 + k * .025)) * (1 - seg(gp, .78, .84));
        w.style.opacity = t.toFixed(3);
        w.style.transform = "translate3d(0," + ((1 - t) * 18).toFixed(1) + "px,0)";
      });
      var f = inOutC(seg(gp, .76, .93)), tx = 0, ty = 0, k2 = 1;
      if (G.small && f > 0) {
        var pr = G.small.getBoundingClientRect(), pn = G.root.getBoundingClientRect();
        k2 = pr.width / g.row.w; tx = (pr.left + pr.width / 2 - pn.left) - g.row.rx; ty = (pr.top + pr.height / 2 - pn.top) - g.row.ry;
      }
      // phones: the whole row is built small enough to hold the words (it lands in the small lockup at that size), so the
      // marks collide at twice that size and the row shrinks back as the words unfold
      var big = mpinned() ? 1 + 1.15 * (1 - u) : 1;
      G.row.style.transform = "translate3d(" + (tx * f + shake).toFixed(1) + "px," + (ty * f + shake * .4).toFixed(1) + "px,0) scale(" + (mix(1, k2, f) * big).toFixed(4) + ")";
      // it lands, the small lockup takes over in place, and only then do the line and the Mac come in
      G.root.style.opacity = (1 - seg(gp, .92, .97)).toFixed(3);
      if (G.small) G.small.style.opacity = seg(gp, .92, .97).toFixed(3);
      return ease(seg(gp, .9, 1));   // how far the chapter has come in
    }
    // the line on the left: each heading is split into words that rise out of a mask; the rest of the line fades and sharpens
    var heads = steps.map(function (el) { return $("h2, h3", el); });
    var stepWords = heads.map(function (h) {
      if (!h) return [];
      h.innerHTML = h.textContent.trim().split(/\s+/).map(function (w) { return '<span class="w"><span>' + w + "</span></span>"; }).join(" ");
      return $$(".w > span", h);
    });
    var stepRest = steps.map(function (el) { return $$(":scope > :not(h2):not(h3):not(.sq-partners)", el); });
    // the word spans stay in the stacked page too (they read as plain text); only their inline styles are cleared
    var trailSvg = q(".sq-trail"), planeEl = q(".f-plane"), trailSegs = [];
    if (trailSvg) { trailSvg.innerHTML = ""; for (var ti = 0; ti < 12; ti++) trailSegs.push(trailSvg.appendChild(document.createElementNS("http://www.w3.org/2000/svg", "path"))); }
    var copyEl = q(".sq-copy"), mBandKey = "", mBandBot = 0, devMasked = false;
    var darkEl = q(".sq-dark"), fly = q(".sq-fly"), callRow = q(".sq-note"), macFoot = q(".sq-land"), cta = q(".sq-cta");
    // where the flight starts and lands, as fractions of the device box, measured while each screen is at rest
    var spots = { row: null, foot: null, cta: null };
    var layoutSpot = function (el) {
      var x = 0, y = 0, n = el;
      while (n && n !== dev) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
      return { x: (x + el.offsetWidth / 2) / dev.offsetWidth, y: (y + el.offsetHeight / 2) / dev.offsetHeight, w: el.offsetWidth / dev.offsetWidth };
    };
    var spot = function (el) {
      var d = dev.getBoundingClientRect(), b = el.getBoundingClientRect();
      return { x: (b.left + b.width / 2 - d.left) / d.width, y: (b.top + b.height / 2 - d.top) / d.height, w: b.width / d.width };
    };
    var backOut2 = function (t) { var c1 = 1.7, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
    var TRAIL = 12, stageBox = null;
    // the plane is the message: it launches straight out of where the call is (Squeak's notification on the Mac, the Approve
    // button on the phone), flies a loop-the-loop, and dives into the other screen, which lights up in a circle spreading
    // from the point it went in. Returns where the reveal is, for the dark glass to open around.
    function renderFly(s, g) {
      if (!fly) return null;
      var vw = window.innerWidth, vh = window.innerHeight;
      // the stage box is read once at the top of the frame, before anything is written (see host.extra); the landing spots
      // are measured once each, since layout reads after writes every frame are what make a fast scroll stutter
      var stage = stageBox;
      // the Mac's spots come from layout boxes (offsets), which no transform can skew: the notification slides with one,
      // and the whole device is scaled while the chapter comes in. Measured while the device is the Mac.
      if (s < .42 && dev.offsetWidth > dev.offsetHeight) {
        if (!spots.row && callRow) spots.row = layoutSpot(callRow);
        if (!spots.foot && macFoot) spots.foot = layoutSpot(macFoot);
      }
      if (!spots.cta && s > .6 && s < .78 && cta) spots.cta = spot(cta);
      var at = function (sp, W, H) { return { x: g.cx - W / 2 + sp.x * W - stage.left, y: g.cy - H / 2 + sp.y * H - stage.top, w: sp.w * W }; };
      var go = seg(s, .38, .565), back = seg(s, .78, .905), dir = go > 0 && go < 1 ? "go" : back > 0 && back < 1 ? "back" : "";
      var clearTrail = function () { for (var k = 0; k < TRAIL; k++) trailSegs[k].setAttribute("d", ""); };
      if (!dir || !spots.row || !spots.foot) { fly.style.opacity = "0"; clearTrail(); return null; }
      fly.setAttribute("data-dir", dir);
      var a, z, T, scr;
      if (dir === "go") {
        a = at(spots.row, g.macW, g.macH); z = { x: g.cx - stage.left, y: g.cy - g.phH / 2 + g.phH * .3 - stage.top };
        T = [.38, .4, .5, .52, .565]; scr = { W: g.phW, H: g.phH };
      } else {
        a = at(spots.cta || { x: .5, y: .8, w: .8 }, g.phW, g.phH); z = at(spots.foot, g.macW, g.macH);
        T = [.78, .795, .865, .88, .905]; scr = { W: g.macW, H: g.macH };
      }
      var lt = seg(s, T[0], T[1]), ft = inOutC(seg(s, T[1], T[2])), dv = seg(s, T[2], T[3]), rv = seg(s, T[3], T[4]);
      var mob = mpinned();
      var low = function (y) { return Math.max((mob ? 92 : 130) - stage.top, y); };   // never up under the nav
      var P0 = { x: a.x, y: a.y - 40 }, P1 = z, r = Math.min(vh * .12, 110);
      var H = { x: Math.max(r + 40, g.cx - g.macW / 2 - vw * .08) - stage.left, y: low(vh * .7 - stage.top) };
      var E = { x: H.x, y: H.y + r };
      var A = [P0, { x: P0.x - vw * .22, y: low(P0.y - vh * .04) }, { x: E.x - vw * .24, y: E.y + vh * .06 }, E];
      var B = [E, { x: E.x + vw * .14, y: E.y }, { x: P1.x - vw * .12, y: P1.y + vh * .1 }, P1];
      var bez = function (C, u) { var v = 1 - u; return { x: v * v * v * C[0].x + 3 * v * v * u * C[1].x + 3 * v * u * u * C[2].x + u * u * u * C[3].x, y: v * v * v * C[0].y + 3 * v * v * u * C[1].y + 3 * v * u * u * C[2].y + u * u * u * C[3].y }; };
      var hoop = function (u) { var th = Math.PI / 2 - u * Math.PI * 2; return { x: H.x + r * Math.cos(th), y: H.y + r * Math.sin(th) }; };
      var raw = function (t) { return t < .38 ? bez(A, t / .38) : t < .7 ? hoop((t - .38) / .32) : bez(B, (t - .7) / .3); };
      if (mob) {
        // phones: one arc up and over the device, no loop. Out to the side it is leaving, high over the top, down into the other screen
        var sgn = dir === "go" ? 1 : -1, top = low(0), M = [P0, { x: P0.x + sgn * vw * .5, y: top }, { x: P1.x - sgn * vw * .42, y: top - 8 }, P1];
        raw = function (t) { return bez(M, t); };
      }
      // even speed along the whole route: the three pieces differ in length, so progress is mapped by distance travelled
      var N = 120, cum = [0], prev = raw(0);
      for (var q = 1; q <= N; q++) { var pt = raw(q / N); cum.push(cum[q - 1] + Math.hypot(pt.x - prev.x, pt.y - prev.y)); prev = pt; }
      var total = cum[N] || 1;
      var path = function (u) {
        var want = Math.max(0, Math.min(1, u)) * total, lo = 0, hi = N;
        while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (cum[mid] < want) lo = mid; else hi = mid; }
        var f = (want - cum[lo]) / Math.max(1e-6, cum[hi] - cum[lo]);
        return raw((lo + f) / N);
      };
      // launch: the plane springs up out of the call itself, already pointing the way it will go
      var pos = ft > 0 ? path(ft) : { x: mix(a.x, P0.x, ease(lt)), y: mix(a.y, P0.y, ease(lt)) };
      var ahead = path(Math.min(1, ft + .01)), behind = path(Math.max(0, ft - .01));
      var heading = Math.atan2(ahead.y - behind.y, ahead.x - behind.x) * 180 / Math.PI;
      fly.style.opacity = "1";
      fly.style.transform = "translate3d(" + pos.x.toFixed(1) + "px," + pos.y.toFixed(1) + "px,0)";
      var grow = ft > 0 ? 1 : Math.max(0, backOut2(lt));
      planeEl.style.opacity = (Math.min(1, lt * 4) * (1 - dv)).toFixed(3);
      planeEl.style.transform = "rotate(" + (heading + 40).toFixed(1) + "deg) scale(" + (grow * (1 - .7 * dv)).toFixed(3) + ")";
      // the trail: only the last stretch behind the plane, fading to nothing at its tail
      var span = .2;
      for (var k = 0; k < TRAIL; k++) {
        var t0 = ft - span * (k + 1) / TRAIL, t1 = ft - span * k / TRAIL;
        if (ft <= 0 || t1 <= 0 || dv >= 1) { trailSegs[k].setAttribute("d", ""); continue; }
        var p0 = path(Math.max(0, t0)), pm = path(Math.max(0, (t0 + t1) / 2)), p1 = path(t1);
        trailSegs[k].setAttribute("d", "M" + p0.x.toFixed(1) + " " + p0.y.toFixed(1) + "Q" + pm.x.toFixed(1) + " " + pm.y.toFixed(1) + " " + p1.x.toFixed(1) + " " + p1.y.toFixed(1));
        trailSegs[k].style.opacity = ((1 - k / TRAIL) * .6 * (1 - dv)).toFixed(3);
      }
      // where it went in, relative to the screen, and how far the screen has lit up from there
      var sx = (P1.x + stage.left) - (g.cx - scr.W / 2), sy = (P1.y + stage.top) - (g.cy - scr.H / 2);
      return { x: sx, y: sy, r: ease(rv) * Math.hypot(scr.W, scr.H), dir: dir, rv: rv };
    }
    // the beats' timeline (s) against scroll: the paper-plane flights (.38-.565 and .78-.905) take three times the scroll
    var SQ_K = [[0, 0], [.38, .38], [.565, .935], [.78, 1.15], [.905, 1.525], [1, 1.62]];
    function warpSq(x) {
      var v = x * 1.62;
      for (var k = 1; k < SQ_K.length; k++) if (v <= SQ_K[k][1]) { var a = SQ_K[k - 1], b = SQ_K[k]; return a[0] + (b[0] - a[0]) * (v - a[1]) / (b[1] - a[1]); }
      return 1;
    }
    var touched = [].concat.apply([], stepRest).concat([].concat.apply([], stepWords)).concat([dev, screen, mac, phone]).concat(steps, parts.badges, [darkEl, fly, planeEl, parts.next, parts.note, parts.base, parts.ledger, parts.cta, parts.use, parts.sent]).concat(G.root ? [G.root, G.row, G.r, G.s, G.rm, G.sm, G.rw, G.sw, G.x, G.glow, G.small].concat(G.rings, G.sparks, G.words) : []).filter(Boolean);
    var op = function (el, v) { if (el) el.style.opacity = (+v).toFixed(3); };
    window.addEventListener("resize", function () { spots = { row: null, foot: null, cta: null }; stageBox = null; gGeo = null; }, { passive: true });
    host.clear = function () {
      spots = { row: null, foot: null, cta: null }; stageBox = null;
      touched.forEach(function (el) { el.removeAttribute("style"); });
    };
    host.extra = function (p) {
      if (fly) stageBox = fly.parentElement.getBoundingClientRect();   // read before any write this frame
      var s0 = seg(p, host.span, 1), vw = window.innerWidth, vh = viewH(), push = 0;
      // the first part of the chapter is the partnership; the five beats share the rest
      var come = renderGrand(seg(s0, 0, .22)), s = warpSq(seg(s0, .22, 1));
      // the line: each beat's line rises in and the last one rises out
      steps.forEach(function (el, i) {
        var a = STEP[i][0], b = STEP[i][1], tin = i ? seg(s, a - .015, a + .04) : come, tout = seg(s, b - .045, b + .005);
        el.style.visibility = tin > 0 && tout < 1 ? "" : "hidden";
        el.style.opacity = tin > 0 && tout < 1 ? "1" : "0";
        // the heading: word by word up out of the mask, and word by word up and away when the next line comes
        stepWords[i].forEach(function (w, k) {
          var ti = i ? seg(s, a - .02 + k * .008, a + .025 + k * .008) : seg(come, k * .07, .55 + k * .07);
          var to = seg(s, b - .045 + k * .006, b - .012 + k * .006);
          w.style.transform = "translate3d(0," + ((1 - inOutC(ti)) * 108 - inOutC(to) * 108).toFixed(1) + "%,0)";
        });
        // the eyebrow and the text: in from a soft blur, out to one
        stepRest[i].forEach(function (r) {
          var v = tin * (1 - tout);
          r.style.opacity = v.toFixed(3);
          r.style.filter = v < .999 ? "blur(" + ((1 - v) * 8).toFixed(1) + "px)" : "";
          r.style.transform = "translate3d(0," + ((1 - ease(tin)) * 16 - ease(tout) * 10).toFixed(1) + "px,0)";
        });
      });
      // the device: Mac -> iPhone over beat 2, and back as beat 4 begins
      // the device changes shape while its screen is dark glass: Mac -> iPhone (.42-.5) and back (.8-.86)
      var m = inOutC(seg(s, .42, .5)) - inOutC(seg(s, .8, .86));
      var dark = (s < .565 ? seg(s, .39, .42) : 0) + (s > .78 && s < .905 ? seg(s, .785, .8) : 0);
      var right = vw - Math.max(24, (vw - 1220) / 2), left = vw * .42, cx = (left + right) / 2, cy = vh / 2 + 16;
      var macW = Math.min(right - left, (vh * .78) * 1.6, 1100), macH = macW / 1.6;
      var phH = Math.min(vh * .84, 780), phW = phH * 390 / 844;
      if (mpinned()) {
        // phones: the device sits in the top ~60% (under the nav), the line in the rest. The Mac is as wide as the screen
        // allows; the iPhone as tall as the band allows. Both share one centre, so the plane's route is the same for both.
        vh = viewH();
        var mkey = vw + "x" + vh;
        if (mkey !== mBandKey) { mBandKey = mkey; mBandBot = Math.max(vh * .45, copyEl.offsetTop - 6); }
        var dTop = Math.min(84, vh * .12), dBot = mBandBot, band = dBot - dTop;
        cx = vw / 2; cy = dTop + band / 2 - 2;
        macW = Math.min(vw * .96, (band - 14) * 1.6, 680); macH = macW / 1.6;
        phH = Math.min(band, vh * .68, 620); phW = phH * 390 / 844;
        // beat 1 ("Squeak tells you first"): the camera pushes in on the Mac's top-right corner so the notification and the
        // menu-bar duck read, then eases back out before the plane launches (.38)
        push = inOutC(seg(s, .185, .235)) * (1 - inOutC(seg(s, .3, .37)));
      }
      var W = mix(macW, phW, m), H = mix(macH, phH, m), pad = mix(8, 11, m), rad = mix(14, phW * .16, m);
      op(parts.base, 1 - seg(m, 0, .3));
      var rev = renderFly(s, { cx: cx, cy: cy, macW: macW, macH: macH, phW: phW, phH: phH });
      if (darkEl) {
        var m2 = rev && rev.rv > 0 ? "radial-gradient(circle at " + (rev.x - pad).toFixed(1) + "px " + (rev.y - pad).toFixed(1) + "px, transparent " + rev.r.toFixed(1) + "px, #000 " + (rev.r + 60).toFixed(1) + "px)" : "none";
        darkEl.style.webkitMaskImage = m2; darkEl.style.maskImage = m2;
      }
      dev.style.width = W.toFixed(1) + "px"; dev.style.height = H.toFixed(1) + "px";
      dev.style.padding = pad.toFixed(1) + "px"; dev.style.borderRadius = rad.toFixed(1) + "px";
      var dz = 1, dcx = cx, dcy = cy + (1 - come) * 40;
      if (push > 0) {
        var ZM = Math.min(2.6, Math.max(2.1, vw / 150));   // full push: the Mac about 2.5x, its corner at the screen's top-right
        var fx = vw - 5 - W * ZM / 2, fy = Math.min(84, vh * .12) + 10 + H * ZM / 2;
        dz = 1 + (ZM - 1) * push; dcx = mix(cx, fx, push); dcy = mix(dcy, fy, push);
        // the part of the Mac below the picture's band fades out instead of running into the words
        var cut = (mBandBot - (dcy - H * dz / 2)) / dz;
        var mk = "linear-gradient(to bottom,#000 " + Math.max(0, cut - 36 / dz).toFixed(1) + "px,transparent " + Math.max(1, cut).toFixed(1) + "px)";
        dev.style.webkitMaskImage = mk; dev.style.maskImage = mk; devMasked = true;
      } else if (devMasked) { dev.style.webkitMaskImage = ""; dev.style.maskImage = ""; devMasked = false; }
      dev.style.transform = "translate3d(" + (dcx - W / 2).toFixed(1) + "px," + (dcy - H / 2).toFixed(1) + "px,0) scale(" + (dz * (.9 + .1 * come)).toFixed(4) + ")";
      dev.style.opacity = come.toFixed(3);
      screen.style.borderRadius = Math.max(4, rad - pad).toFixed(1) + "px";
      op(mac, m < .5 ? 1 : 0); op(phone, m < .5 ? 0 : 1); op(darkEl, dark);
      // beat 1: the call arrives, the badge on Squeak's menu-bar duck pops; beat 4: answered, the badge clears
      var done = seg(s, .88, .905), pop = seg(s, .21, .26);
      var popS = pop < 1 ? Math.sin(pop * Math.PI * .5) * (1 + .35 * Math.sin(pop * Math.PI)) : 1;
      parts.badges.forEach(function (bd) { bd.style.transform = "scale(" + (popS * (1 - done)).toFixed(3) + ")"; });
      // Squeak's notification slides in when the call arrives and stays until it lifts off for the iPhone;
      // once the answer has landed, Studio shows its next step
      if (parts.next) parts.next.style.opacity = s >= .88 ? "1" : "0";
      var note = ease(seg(s, .205, .245)) * (1 - seg(s, .38, .385));
      op(parts.note, note); if (parts.note) parts.note.style.transform = "translate3d(" + ((1 - note) * 110).toFixed(1) + "%,0,0)";
      // beat 3: Ledger is picked, Use Ledger is pressed, then Sent
      var pick = seg(s, .6, .63), press = seg(s, .67, .69) * (1 - seg(s, .69, .71)), sent = seg(s, .7, .73);
      if (parts.ledger) { parts.ledger.style.boxShadow = "0 0 0 " + (2 * pick).toFixed(2) + "px var(--rasanai-blue), 0 " + (6 * pick).toFixed(1) + "px " + (16 * pick).toFixed(1) + "px rgba(42,49,168," + (.18 * pick).toFixed(3) + ")"; parts.ledger.style.transform = "scale(" + (1 + .02 * pick).toFixed(4) + ")"; }
      if (parts.cta) { parts.cta.style.transform = "scale(" + (1 - .05 * press).toFixed(4) + ")"; parts.cta.style.background = sent > .5 ? "#1f9d55" : ""; }
      op(parts.use, 1 - sent); op(parts.sent, sent);
    };
  })();

  function hostsOn() { hosts.forEach(function (h) { h.on(); }); }
  function hostsOff() { hosts.forEach(function (h) { h.off(); }); }


  // rising windows: scale and lift as they enter
  $$("[data-rise]").forEach(function (el) {
    if (el.classList.contains("home-win")) return;   // the Home window rises with the crew flight, below
    addScene({
      el: el, pin: false,
      progress: function (r, vh) { return clamp((vh - r.top) / (vh * .75), 0, 1); },
      render: function (p) { var e = ease(p); el.style.transform = "translate3d(0," + ((1 - e) * 64).toFixed(1) + "px,0) scale(" + (.93 + .07 * e).toFixed(3) + ")"; },
      reset: function () { el.style.transform = ""; }
    });
  });

  // crew flight: the hero cards assemble and land on the crew standing on the Home screenshot, then hand off to it
  var homeWin = $(".shot-band .window[data-rise]"), homeImg = homeWin && $("img", homeWin);
  if (heroEl && homeImg) {
    // percentages of the Studio home capture (light, sidebar collapsed, 3024x1768): each box is the full character, measured against the painted-out version
    var BOX = { tara: [32.077, 43.269, 4.233, 6.222], kavi: [36.442, 37.5, 4.398, 11.991], chitra: [40.906, 36.652, 5.06, 12.839], ra: [45.966, 35.86, 7.11, 13.631], laya: [53.142, 36.256, 4.332, 12.217], rasika: [57.474, 44.005, 5.225, 5.486], mala: [62.765, 40.554, 5.225, 8.937] };
    var RIM = 49.5, STAG = .06;   // the prompt box's top edge
    // while the crew fly in, the screenshot shows its prompt with the crew painted out, so no one lands on top of themselves
    var emptyImg = new Image(); emptyImg.className = "shot-empty"; emptyImg.alt = ""; emptyImg.setAttribute("aria-hidden", "true"); emptyImg.decoding = "async";
    emptyImg.srcset = "img/studio/home-light-1x-empty.webp 1000w, img/studio/home-light-2x-empty.webp 2000w"; emptyImg.sizes = homeImg.getAttribute("sizes") || "100vw"; emptyImg.src = "img/studio/home-light-1x-empty.webp";
    homeWin.appendChild(emptyImg);
    var setEmpty = function (on) { homeWin.classList.toggle("is-empty", on); };
    var layer = document.createElement("div");
    layer.className = "cflight"; layer.setAttribute("aria-hidden", "true"); layer.setAttribute("data-image-group", "");
    var fl = [];
    $$(".fc", heroEl).forEach(function (c) {
      var im = $(".fi img", c), m = im && /(?:card-|crew\/hero\/)([a-z]+)\.webp/.exec(im.getAttribute("src") || "");
      if (!m || !BOX[m[1]]) return;
      var d = parseFloat(c.style.getPropertyValue("--d")) || 1;
      var box = document.createElement("div"); box.className = "cf";
      var card = new Image(); card.className = "cf-card"; card.alt = ""; card.decoding = "async"; card.src = im.getAttribute("src");
      var cut = new Image(); cut.className = "cf-cut"; cut.alt = ""; cut.decoding = "async"; cut.src = "assets/crew/land/" + m[1] + ".webp?v=4";   // v4: from the light Studio home
      card.style.opacity = (.6 + d * .4).toFixed(2);
      box.appendChild(card); box.appendChild(cut); layer.appendChild(box);
      fl.push({ c: c, fi: $(".fi", c), box: box, card: card, cut: cut, b: BOX[m[1]], base: .6 + d * .4, sw: 0, tw: 0 });
    });
    // ripple from the middle outwards: Rasan first
    fl.slice().sort(function (a, b) { return Math.abs(a.b[0] + a.b[2] / 2 - 50) - Math.abs(b.b[0] + b.b[2] / 2 - 50); })
      .forEach(function (f, i) { f.k = Math.floor((i + 1) / 2); });
    document.body.appendChild(layer);
    // once landed, the same cut-outs stay inside the window as its picture (over the painted-out screenshot), so the flight ends
    // on exactly the pixels it flew: there is no hand-over to the screenshot's own crew
    var rests = fl.map(function (f) {
      var im = new Image();
      im.className = "cf-rest"; im.alt = ""; im.setAttribute("aria-hidden", "true"); im.decoding = "async"; im.src = f.cut.src;
      homeWin.appendChild(im);
      return im;
    });
    var layoutRests = function () {
      var L = homeImg.offsetLeft, T = homeImg.offsetTop, W = homeImg.offsetWidth, H = homeImg.offsetHeight;
      fl.forEach(function (f, i) {
        var b = f.b, im = rests[i], over = Math.max(0, b[1] + b[3] - RIM);
        im.style.left = (L + W * b[0] / 100).toFixed(2) + "px"; im.style.top = (T + H * b[1] / 100).toFixed(2) + "px";
        im.style.width = (W * b[2] / 100).toFixed(2) + "px"; im.style.height = (H * b[3] / 100).toFixed(2) + "px";
        // feet tuck behind the prompt box's rim, as in the flight
        im.style.clipPath = over > 0 ? "inset(0 0 " + (over / b[3] * 100).toFixed(3) + "% 0)" : "none";
      });
    };
    layoutRests(); window.addEventListener("resize", layoutRests, { passive: true });
    var setRest = function (on) { homeWin.classList.toggle("is-rest", on); };
    var lerp = function (a, b, t) { return a + (b - a) * t; };
    var inOut = function (t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
    var shown = false, away = null;
    var setShown = function (on) {
      if (on === shown) return; shown = on;
      layer.classList.toggle("on", on);
    };
    // the hero's own cards are hidden from the moment they take off; once the crew have landed they stay in the screenshot
    var setAway = function (on) {
      if (on === away) return; away = on;
      fl.forEach(function (f) { f.c.style.visibility = on ? "hidden" : ""; });
    };
    var shotBand = homeWin.closest(".shot-band");
    var flight = addScene({
      el: shotBand, pin: true, mpin: true,
      // 0..1 while the screenshot rises into its resting place; at 1 every cut-out sits exactly on its painted-out spot,
      // so the flyers give way to the screenshot's own crew in one frame
      // 0..1 through the band's pinned stretch: the window rises over the first 85% of it and rests for the rest
      progress: function (r, vh) { return clamp(-r.top / Math.max(1, r.height - vh), 0, 1); },
      render: function (q) {
        var vq = Math.min(1, q / .85), re = ease(vq);
        // the window's rise and the flight share one progress value, so the crew and the screenshot never drift apart
        // phones: the window is only as wide as the screen, so it also pushes in on the prompt box (the crew land on a picture
        // as big as they are on a desktop); the flight reads the window’s live rect, so the crew follow the zoom
        var mob = mpinned(), zoom = 1;
        if (mob) {
          var W0 = homeImg.offsetWidth || 1, groupW = .36 * W0;   // the seven stand in the middle 36% of the picture
          zoom = 1 + (clamp(window.innerWidth * .76 / groupW, 1, 3.4) - 1) * inOut(seg(vq, .22, .95));
          homeWin.style.transformOrigin = "50% 44%";
        }
        homeWin.style.transform = "translate3d(0," + ((1 - re) * viewH() * .8).toFixed(1) + "px,0) scale(" + ((.93 + .07 * re) * zoom).toFixed(3) + ")";
        // Keep the original artwork until every flight asset and the screenshot are ready.
        if (!layer.hasAttribute("data-images-ready") || !homeImg.hasAttribute("data-image-ready") || !emptyImg.complete || !emptyImg.naturalWidth) {
          setShown(false); setEmpty(false); setAway(false); setRest(false); return;
        }
        if (!homeImg.offsetWidth) return;
        layoutRests();
        setAway(vq > 0);
        // every cut-out has arrived by 0.86; from there the same cut-outs, now inside the window, are the picture
        setEmpty(true);
        if (vq <= 0) { setShown(false); setRest(false); return; }
        if (vq >= .87) { setShown(false); setRest(true); return; }
        setShown(true); setRest(false);
        var ir = homeImg.getBoundingClientRect(), rimY = ir.top + ir.height * RIM / 100;
        fl.forEach(function (f) {
          var t = seg(vq, f.k * STAG, f.k * STAG + .86 - 3 * STAG), e = inOut(t);
          var sr = f.fi.getBoundingClientRect(), sw = f.fi.offsetWidth, sh = f.fi.offsetHeight;
          var tx = ir.left + ir.width * f.b[0] / 100, ty = ir.top + ir.height * f.b[1] / 100, tw = ir.width * f.b[2] / 100, th = ir.height * f.b[3] / 100;
          var scx = sr.left + sr.width / 2, scy = sr.top + sr.height / 2, tcx = tx + tw / 2, tcy = ty + th / 2;
          var lift = Math.sin(Math.PI * t) * Math.min(70, Math.hypot(tcx - scx, tcy - scy) * .14);
          f.box.style.transform = "translate3d(" + lerp(scx, tcx, e).toFixed(2) + "px," + (lerp(scy, tcy, e) - lift).toFixed(2) + "px,0)";
          if (f.sw !== sw || f.sh !== sh) { f.sw = sw; f.sh = sh; f.card.style.width = sw + "px"; f.card.style.height = sh + "px"; f.card.style.left = -sw / 2 + "px"; f.card.style.top = -sh / 2 + "px"; }
          if (Math.abs(f.tw - tw) > .01 || Math.abs(f.th - th) > .01) { f.tw = tw; f.th = th; f.cut.style.width = tw + "px"; f.cut.style.height = th + "px"; f.cut.style.left = -tw / 2 + "px"; f.cut.style.top = -th / 2 + "px"; }
          var ks = lerp(1, Math.min(tw / sw, th / sh), e), s0 = sh / th, cs = lerp(s0, 1, e);
          f.card.style.transform = "scale(" + ks.toFixed(4) + ")";
          // every card sheds its background early in the move, together, before the window is up: only the characters fly
          // the same character cut two ways (same framing): the hero's sharp render hands over to the screenshot's own pixels
          // late in the flight, when they are small and on top of each other
          var shed = seg(t, .72, .96);
          f.card.style.opacity = (f.base * (1 - shed) + shed * 0).toFixed(3);
          f.cut.style.transform = "scale(" + cs.toFixed(4) + ")";
          f.cut.style.opacity = shed.toFixed(3);
          // feet tuck behind the prompt box's rim, as in the screenshot
          var over = Math.max(0, ty + th - rimY) * ease(seg(t, .6, 1));
          f.cut.style.clipPath = over > .01 ? "inset(0 0 " + (over / cs).toFixed(2) + "px 0)" : "none";
          f.card.style.clipPath = over > .01 ? "inset(0 0 " + (over / ks).toFixed(2) + "px 0)" : "none";
        });
      },
      reset: function () { setShown(false); setEmpty(false); setAway(false); setRest(false); homeWin.style.transform = ""; homeWin.style.transformOrigin = ""; }
    });

  }

  /* ---------- the orbit's resting points: only while the circle turns through the introductions ----------
     When a scroll comes to rest between two introductions, it settles on the one its momentum points at: the nearest to where
     the flick would have carried it. Before the first and after the last, and everywhere else on the page, scrolling is free. */
  var lastY = window.scrollY, scrollT = 0, dir = 1, vel = 0, restTimer = 0, spring = 0;
  var noRest = /[?&]norest\b/.test(location.search);   // for frame-by-frame checks: hold any scroll position
  // the glide is a critically damped spring on the scroll position: it starts with the speed the reader was scrolling at, so the
  // hand-off from their flick is continuous, and it eases into the introduction without overshooting it. Any input stops it.
  var OMEGA = 8.5;   // spring stiffness (rad/s): settled in about 0.7 s
  function glideTo(target) {
    var y = window.scrollY, v = clamp(vel, -4, 4), prev = 0;
    cancelAnimationFrame(spring);
    var step = function (now) {
      var dt = prev ? Math.min(.034, (now - prev) / 1000) : .016; prev = now;
      var x = y - target, a = -OMEGA * OMEGA * x - 2 * OMEGA * v * 1000;   // v is px per ms
      v += a * dt / 1000; y += v * 1000 * dt;
      if (Math.abs(y - target) < .5 && Math.abs(v) < .02) { window.scrollTo({ top: target, behavior: "instant" }); spring = 0; lastY = target; vel = 0; return; }
      // instant: the page sets scroll-behavior: smooth, which would re-animate every step of the spring
      window.scrollTo({ top: Math.round(y * 2) / 2, behavior: "instant" });
      spring = requestAnimationFrame(step);
    };
    spring = requestAnimationFrame(step);
  }
  function stopGlide() { if (spring) { cancelAnimationFrame(spring); spring = 0; } }
  ["wheel", "touchstart", "keydown", "mousedown"].forEach(function (t) { window.addEventListener(t, stopGlide, { passive: true }); });
  // phones: a resting point is only chosen once the finger is up (touchend starts the same quiet timer a scroll does)
  var touching = false;
  window.addEventListener("touchstart", function () { touching = true; }, { passive: true });
  ["touchend", "touchcancel"].forEach(function (t) { window.addEventListener(t, function () { touching = false; clearTimeout(restTimer); restTimer = setTimeout(settle, 160); }, { passive: true }); });
  function settle() {
    if (!(pinned() || mpinned()) || calm() || spring || noRest || !crewOn || touching) return;
    var r = crewScene.getBoundingClientRect(), span = Math.max(1, r.height - viewH()), top = window.scrollY + r.top, y = window.scrollY;
    var rests = crewRests().map(function (p) { return top + p * span; });
    if (y < rests[0] - 2 || y > rests[rests.length - 1] + 2) return;
    // where the reader's own momentum would carry the page (a flick decays over about a third of a second), and the introduction
    // nearest to that: a small nudge past one settles back on it, a real flick carries on to the next one or further
    var projected = y + clamp(vel, -1.6, 1.6) * 325, pick = null;   // a wild wheel spin cannot throw it past more than one
    rests.forEach(function (t) { if (pick === null || Math.abs(t - projected) < Math.abs(pick - projected)) pick = t; });
    if (pick === null || Math.abs(pick - y) < 3) return;
    // the spring starts with the reader's speed only when that speed points at the target
    if ((pick - y) * vel < 0) vel = 0;
    glideTo(Math.round(pick));
  }
  window.addEventListener("scroll", function () {
    if (spring) return;   // our own glide: not the reader's input
    var y = window.scrollY, t = performance.now();
    if (y !== lastY) {
      dir = y > lastY ? 1 : -1;
      if (scrollT && t - scrollT < 100) vel = vel * .6 + ((y - lastY) / (t - scrollT)) * .4; else vel = 0;
    }
    lastY = y; scrollT = t;
    clearTimeout(restTimer); restTimer = setTimeout(settle, 160);
  }, { passive: true });

  /* ---------- menu jumps: in the pinned layout a chapter is a long scroll scene, so its menu link lands on the moment worth
     reading (Rasan beside his introduction, the Squeak chapter's first line, the projects revealed), not the top of the track.
     Stacked, the plain anchors do the job. */
  function jumpTarget(name) {
    if (!(pinned() || mpinned()) || calm()) return null;
    var at = function (el, p) { var r = el.getBoundingClientRect(); return window.scrollY + r.top + p * Math.max(0, r.height - viewH()); };
    if (name === "crew" && crewOn) return at(crewScene, CREW_OPEN + .03 * (1 - CREW_OPEN));
    var host = hosts.filter(function (h) { return h.beat && h.host.id === (name === "squeak" ? "control" : name); })[0];
    if (!host) return null;
    // phones, projects: the line has just finished and the chapter’s first screen is up
    if (host.mtrack && mpinned()) return window.scrollY + host.host.getBoundingClientRect().top + host.mtrack * viewH();
    // Squeak: past the partnership, its first line fully in; projects: revealed
    return at(host.host, name === "squeak" ? host.span + (1 - host.span) * (.22 + .78 * .1) : .86);
  }
  $$("[data-jump]").forEach(function (a) {
    a.addEventListener("click", function (e) {
      var y = jumpTarget(a.getAttribute("data-jump"));
      // phones: scenes that are still plain stacks (until their agent pins them) are reached by the same veil jump, so a
      // native smooth scroll never plays the hero and the beats on the way down
      if (y === null && mpinned() && !calm()) { var dest = document.getElementById((a.getAttribute("href") || "").slice(1)); if (dest) y = window.scrollY + dest.getBoundingClientRect().top; }
      if (y === null) return;   // the anchor does it
      e.preventDefault();
      history.replaceState(null, "", a.getAttribute("href"));
      // smooth-scrolling through a few scroll scenes would play them all at once; instead the page dips to its own colour,
      // jumps, and comes back up on the moment
      var veil = $(".jump-veil") || document.body.appendChild(Object.assign(document.createElement("div"), { className: "jump-veil" }));
      requestAnimationFrame(function () { veil.classList.add("on"); });
      setTimeout(function () {
        window.scrollTo({ top: Math.round(jumpTarget(a.getAttribute("data-jump")) || y), behavior: "instant" });
        setTimeout(function () { veil.classList.remove("on"); }, 120);
      }, 230);
    });
  });

  /* ---------- the loop: rAF only while something is moving ---------- */
  var raf = 0, vh = viewH(), lastT = 0;
  function tick(now) {
    raf = 0;
    // frame time, so a glide feels the same at 60 and 120 Hz; a long gap (a background tab) counts as one frame
    var dt = lastT && now - lastT < 100 ? now - lastT : 16.7; lastT = now;
    if (!pinnedMode.motion) return;
    var rects = scenes.map(function (s) { return s.el.getBoundingClientRect(); });
    var more = false;
    scenes.forEach(function (s, i) {
      if (s.pin && !pinned() && !(s.mpin && mpinned())) return;   // pinned scenes run in the sticky layouts: desktop, or phones for scenes that opt in
      var r = rects[i], near = r.bottom > -vh * .5 && r.top < vh * 1.5;
      var target = s.progress(r, vh);
      // direct scenes follow the scroll position exactly, so reversing scroll retraces the same frames
      if (s.direct) { if (s.last !== target) { s.render(target); s.last = target; } return; }
      // gliding scenes chase the scroll position with a time-based ease, so a fast flick or a coarse wheel step plays as motion
      // instead of jumping frames; the chase is position-only, so reversing scroll still retraces the same frames
      if (s.glide) {
        // a critically damped spring on the progress (it carries velocity, so a fast flick eases in and out instead of
        // stepping); the spring is stiffer for a shorter glide. Far from the screen it simply snaps.
        if (s.cur === undefined || !near) { s.cur = target; s.vel = 0; }
        else {
          var w = 1700 / s.glide, h = Math.min(dt, 34) / 1000, gd = target - s.cur;
          s.vel = (s.vel || 0) + (w * w * gd - 2 * w * (s.vel || 0)) * h;
          s.cur += s.vel * h;
          if (Math.abs(target - s.cur) < .00004 && Math.abs(s.vel) < .0004) { s.cur = target; s.vel = 0; }
        }
        if (s.cur !== target) more = true;
        if (s.cur !== s.last) { s.render(s.cur); s.last = s.cur; }
        return;
      }
      if (s.cur === undefined) s.cur = target;
      if (!near) { s.cur = target; if (s.last !== target) { s.render(target); s.last = target; } return; }
      var d = target - s.cur;
      s.cur = Math.abs(d) < .0006 ? target : s.cur + d * .2;
      if (s.cur !== target) more = true;
      if (s.cur !== s.last) { s.render(s.cur); s.last = s.cur; }
    });
    if (more) request();
  }
  function request() { if (!raf) raf = requestAnimationFrame(tick); }
  window.addEventListener("scroll", request, { passive: true });
  // iOS fires resize every time the address bar slides away: on phones only a change of width (rotation, split view) rebuilds the
  // scenes; a height-only resize just refreshes the view height. Desktop keeps rebuilding on every resize, exactly as before.
  var lastW = window.innerWidth;
  window.addEventListener("resize", function () {
    vh = viewH();
    if (mpinned() && window.innerWidth === lastW) { request(); return; }
    lastW = window.innerWidth;
    clearCrew(); hostsOff(); enableCrew(); hostsOn(); request();
  }, { passive: true });

  /* ---------- calm mode and the layout switch: rest in the finished state, or let the scroll drive it ---------- */
  function apply() {
    var calmNow = calm(), pin = pinned(), mp = mpinned();
    vh = viewH(); lastW = window.innerWidth;
    pinnedMode.motion = !calmNow;
    scenes.forEach(function (s) { s.cur = undefined; s.last = undefined; if (s.reset && (!s.pin || !(pin || (s.mpin && mp)))) s.reset(); });
    clearCrew();
    hostsOff();
    if (calmNow) return;
    if (pin || mp) { enableCrew(); hostsOn(); }
    request();
  }
  reduceQ.addEventListener("change", function () { setTimeout(apply, 0); });
  wideQ.addEventListener("change", function () { setTimeout(apply, 0); });

  /* ---------- crew scene: Rasan is introduced on his own, at the side, beside his description. The text fades, Rasan takes the centre
     of a circle and dims a little, and the six specialists fly in quickly, one after another, each from its own direction, onto the
     circle. The circle moves to the left and turns, one place at a time: whoever reaches the right-hand point grows a little and their
     card opens in the empty space beside them. When all six have been introduced, Rasan brightens, the circle breaks
     into depth around the statement (near crew big and clear, far crew small and faded), the statement fills in word by word, and the
     camera flies forward through the crew until only the statement is left. Every frame is a pure function of the scroll position
     p (0..1 through the pinned track), so scrolling back retraces it exactly. Only transform and opacity are driven, by inline styles.
     Stacked (narrow screen, reduced motion, or markup missing): nothing is pinned, and no inline style, class or attribute is left behind. */
  var crewScene = $("[data-crew-scene]");
  var CREW = ["ra", "tara", "kavi", "chitra", "laya", "rasika", "mala"];   // Rasan, then the six in the order they are introduced
  var CREW_FROM = [205, 335, 120, 20, 250, 80];   // each specialist's entry direction, degrees (0 = from the right, 90 = from below)
  var CREW_TILT = [-14, 12, -10, 16, -12, 10];    // a little lean in flight, gone on landing
  var CREW_ARRIVE = .2, CREW_GAP = .022, CREW_FLY = .05;   // specialist i flies in over [arrive + i * gap, + fly]: all in by .36
  var CREW_TURN = .4, CREW_STEP = .065, CREW_SWING = .025; // the circle turns one place at turn + k * step (k = 1..5), over swing
  var CREW_BIG = 2.2, CREW_SPOT = 1.35;                     // Rasan's size beside his introduction; a specialist's size while introduced
  // where each character goes when the circle breaks, in half-stage units: [x, y] close around the statement, [x, y] out at the
  // edges where the slow push-in carries it while the words fill, and depth (1 = near; larger = farther)
  var CREW_DEPTH = [
    [-.54, -.58, -.76, -.5, 1], [.08, -.62, .12, -.74, 2.3], [.52, -.56, .72, -.56, 1.4], [.6, .52, .8, .48, 1.05],
    [-.22, .6, -.3, .72, 1.8], [.24, .66, .32, .8, 2.7], [-.6, .5, -.82, .5, 1.25]
  ];
  // portrait: the same cast, spread up and down around the statement (x stays within about 42% of the width)
  var CREW_DEPTH_M = [
    [-.46, -.76, -.62, -.92, 1], [.1, -.86, .16, -1.02, 2.3], [.4, -.6, .66, -.72, 1.4], [.42, .72, .66, .84, 1.05],
    [-.18, .86, -.26, 1, 1.8], [.14, .76, .22, .92, 2.7], [-.44, .62, -.7, .78, 1.25]
  ];
  var CREW_NEAR = 1.35;                            // a character's size at depth 1
  var mix = function (a, b, t) { return a + (b - a) * t; };
  var inOutC = function (t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  var crewOn = false, crewGeo = null, crewRun = null, crewBeat = null;
  var CREW_OPEN = .26;   // the first part of the track is the opening line ("Behind that box, a whole crew."), which scatters off Rasan

  // the markup contract: anything missing or out of order turns the scene off, and the page stays a plain stack
  function crewSpec() {
    var nodes = $$(".crew-node[data-crew]", crewScene);
    var s = {
      nodes: nodes, stage: $(".crew-stage", crewScene), orbit: $(".crew-orbit", crewScene),
      beat: $(":scope > [data-beat]", $(".crew-sticky", crewScene) || crewScene), lead: $(".crew-lead", crewScene), payoff: $(".crew-payoff", crewScene), words: $$(".statement-word", crewScene),
      imgs: nodes.map(function (el) { return $("img", el); }),
      cards: nodes.map(function (el) { return $(".crew-label", el); })
    };
    var ordered = nodes.length === CREW.length && nodes.every(function (el, i) { return el.getAttribute("data-crew") === CREW[i]; });
    if (!ordered || !s.stage || !s.orbit || !s.lead || !s.payoff || s.imgs.some(function (im) { return !im; })) return null;
    // every element the scene may touch, with its own inline style as the page wrote it, so clearing restores it exactly
    s.all = nodes.concat(s.imgs, s.cards.filter(Boolean), [crewScene, s.orbit, s.lead, s.payoff], s.words);
    s.style = s.all.map(function (el) { return el.getAttribute("style"); });
    return s;
  }
  var crew = crewScene && crewSpec();

  // leave the pinned layout: drop the class and the card sides, and put back every inline style the scene touched
  function clearCrew() {
    if (!crew) return;
    crewOn = false;
    if (crewRun) crewRun.last = undefined;
    crewScene.classList.remove("crew-ready");
    if (!crewScene.getAttribute("class")) crewScene.removeAttribute("class");
    crew.nodes.forEach(function (el) { el.removeAttribute("data-side"); });
    crew.all.forEach(function (el, k) { if (crew.style[k] === null) el.removeAttribute("style"); else el.setAttribute("style", crew.style[k]); });
    if (crewBeat) { crewBeat.reset(); crewBeat = null; }
  }

  // wide desktop with motion allowed (the page sets .pin for exactly that): measure once, then the scene drives itself
  function enableCrew() {
    if (!crew || crewOn || calm() || !((wideQ.matches && pinned()) || mpinned())) return;
    var mob = mpinned();
    crewScene.classList.add("crew-ready");
    var W = crew.stage.offsetWidth / 2, H = crew.stage.offsetHeight / 2;
    if (!W || !H) { clearCrew(); return; }   // no size yet: stay a plain stack
    // the orbit's own diameter sets the circle, so the drawn line and the seven positions agree
    var R = crew.orbit.offsetWidth / 2 || Math.min(W, H) * .6, far = Math.hypot(W, H) + crew.nodes[0].offsetWidth * 1.5;
    crewGeo = { W: W, H: H, R: R, from: [], mob: mob, a0: 0, ax: -.46 * W, ay: 0, cy: 0, big: CREW_BIG, land: 1.6, spot: CREW_SPOT, near: CREW_NEAR, depth: CREW_DEPTH };
    if (mob) {
      // portrait: Rasan big in the top, his introduction below him; the circle in the top ~55% with the spotlight at its bottom
      // point and the card a bottom sheet; the break spreads the crew mostly up and down around the statement
      var nw = crew.nodes[0].offsetWidth, vW = W * 2, vH = H * 2;
      var rh = Math.min(.32 * vH, .8 * vW), top0 = 88, yb = top0 + rh;   // top0: clear of the nav pill
      crewGeo.big = rh / (1.05 * nw); crewGeo.land = Math.min(2, vW * .46 / nw); crewGeo.spot = 1.5; crewGeo.near = 1.5;
      crewGeo.a0 = Math.PI / 2; crewGeo.ax = 0;
      crewGeo.ay = yb - H - .21 * nw - .315 * nw * crewGeo.big;
      crewGeo.cy = top0 - 4 + R + nw * .6 - H;
      crewGeo.depth = CREW_DEPTH_M;
      crewScene.style.setProperty("--lt", (yb + 12).toFixed(0) + "px");               // where his introduction starts, under him
      crewScene.style.setProperty("--sd", (H - crewGeo.cy - R).toFixed(1) + "px");    // from the spotlight point down to the screen's bottom edge
    }
    for (var i = 0; i < 6; i++) {
      var b = CREW_FROM[i] * Math.PI / 180;
      crewGeo.from.push([far * Math.cos(b), far * Math.sin(b)]);
      // every card opens into the empty space on the right of the circle
      crew.nodes[i + 1].setAttribute("data-side", mob ? "b" : "r");
    }
    // the crew scene starts a screen early, behind the rising window, so its line is already in place when the window uncovers it;
    // the words fill as they are uncovered
    if (crew.beat) crewBeat = makeBeat(crew.beat, { fill: [.12, .3], out: .42 });
    // the specialists start off-screen, where lazy images would not load until they fly in; fetch and decode them all now
    crew.imgs.forEach(function (im) { var pre = new Image(); pre.src = im.currentSrc || im.src; if (pre.decode) pre.decode().catch(function () {}); });
    crewOn = true;
  }

  // how much of specialist i's introduction is showing (0..1): from when the circle brings them to the right-hand point until it turns on
  function crewSpot(p, i) {
    var a = i ? CREW_TURN + i * CREW_STEP + CREW_SWING : CREW_TURN, b = CREW_TURN + (i + 1) * CREW_STEP;
    return seg(p, a - .004, a + .01) * (1 - seg(p, b - .012, b));
  }

  function renderCrew(p) {
    if (!crewOn) return;
    var open = seg(p, 0, CREW_OPEN);
    if (crewBeat) crewBeat.render(open);
    p = seg(p, CREW_OPEN, 1);
    var g = crewGeo, ra = crew.nodes[0];
    // Rasan's introduction leaves first
    var lo = seg(p, .06, .14);
    crew.lead.style.opacity = (1 - lo).toFixed(3);
    crew.lead.style.transform = "translate3d(0," + (-36 * ease(lo)).toFixed(1) + "px,0)";
    crew.lead.style.visibility = lo >= 1 ? "hidden" : "";
    // the circle: moves left once everyone is in, then turns one place per introduction (the right-hand point is the spotlight)
    var ox = g.mob ? 0 : -.4 * g.W * inOutC(seg(p, .35, .41)), oy = g.cy, turn = 0;
    for (var k = 1; k < 6; k++) turn += inOutC(seg(p, CREW_TURN + k * CREW_STEP, CREW_TURN + k * CREW_STEP + CREW_SWING));
    var th = -turn * Math.PI / 3;
    crew.orbit.style.opacity = (seg(p, .2, .3) * .9 * (1 - seg(p, .8, .84))).toFixed(3);
    crew.orbit.style.transform = "translate3d(" + ox.toFixed(2) + "px," + oy.toFixed(2) + "px,0) rotate(" + (th * 180 / Math.PI).toFixed(2) + "deg)";
    // the break: from .80 each character leaves the circle for its place in depth around the statement, one shortly after another
    // the camera: a slow spread out to the edges while the words fill, then a fast flight through the crew to the end of the track
    // they hold close around the statement while it is written, and only then drift out, gathering speed into the flight
    var spread = Math.pow(seg(p, .91, .975), 2), cam = 2.4 * Math.pow(seg(p, .955, 1), 1.6);
    var place = function (node, img, k, x, y, s, r, o) {
      var d = g.depth[k], b = inOutC(seg(p, .8 + k * .006, .88 + k * .006));
      if (b > 0) {
        var z = Math.max(.2, d[4] - cam), f = d[4] / z;
        x = mix(x, mix(d[0], d[2], spread) * g.W * f, b); y = mix(y, mix(d[1], d[3], spread) * g.H * f, b);
        s = mix(s, g.near * mix(.8, 1, spread) / z, b); r = mix(r, 0, b);
        // far characters fade into the paper; anyone the camera passes fades as it goes by
        o *= mix(1, 1 - clamp((d[4] - 1.1) / 2.2, 0, .6), b) * seg(z, .2, .55);
      }
      node.style.transform = "translate3d(" + x.toFixed(2) + "px," + y.toFixed(2) + "px,0)";
      node.style.opacity = o.toFixed(3);
      img.style.transform = "rotate(" + (r || 0).toFixed(2) + "deg) scale(" + s.toFixed(4) + ")";
    };
    // Rasan: big beside his introduction, then to the centre of the circle (and with it), dimmed while the others are introduced
    var m = inOutC(seg(p, .1, .22));
    place(ra, crew.imgs[0], 0, mix(g.ax, ox, m), mix(g.ay, oy, m), mix(g.big, 1.2, m), 0, 1 - .3 * seg(p, .19, .24) + .3 * seg(p, .78, .81));
    var tagsOut = 1 - seg(p, .8, .83);
    ra.style.setProperty("--l", (seg(p, .3, .34) * tagsOut).toFixed(3));
    for (var i = 0; i < 6; i++) {
      var kk = i + 1, node = crew.nodes[kk], card = crew.cards[kk], s0 = CREW_ARRIVE + i * CREW_GAP, fr = g.from[i];
      // place on the circle: specialist i starts at i * 60 degrees from the right-hand point, and the whole circle turns
      var ang = i * Math.PI / 3 + th + g.a0, cx = ox + g.R * Math.cos(ang), cy = oy + g.R * Math.sin(ang);
      var e = ease(seg(p, s0, s0 + CREW_FLY)), spot = crewSpot(p, i), se = inOutC(spot);
      place(node, crew.imgs[kk], kk, mix(fr[0], cx, e), mix(fr[1], cy, e), mix(.8, 1, e) * mix(1, g.spot, se), CREW_TILT[i] * (1 - e), p < s0 ? 0 : 1);
      node.style.zIndex = spot > 0 ? "3" : "";
      // the name tag shows once landed, and gives way to the card while introduced
      node.style.setProperty("--l", (seg(p, s0 + CREW_FLY * .8, s0 + CREW_FLY) * (1 - spot) * tagsOut).toFixed(3));
      if (card) {
        card.style.opacity = spot.toFixed(3);
        card.style.transform = g.mob ? "translate3d(0," + ((1 - ease(spot)) * 34).toFixed(1) + "px,0)" : "translate3d(" + ((1 - ease(spot)) * -16).toFixed(1) + "px,-50%,0)";
      }
    }
    // the statement: in with the break, then each word fills from faint to full, left to right, as the crew spread out
    crew.payoff.style.opacity = seg(p, .85, .88).toFixed(3);
    var N = crew.words.length;
    crew.words.forEach(function (w, j) {
      var t = seg(p, .87 + j * .08 / N, .885 + j * .08 / N);
      w.style.opacity = (.16 + .84 * t).toFixed(3);
    });
    if (open < 1) crewOpening(open);
    else crew.nodes[0].style.zIndex = "";
  }

  // the opening, over the first part of the track: the window uncovers the line, Rasan drops from above onto it, the impact throws
  // the letters off the screen (the beat's "slam" reveal, from .64), and Rasan steps left to stand beside his introduction, which
  // arrives on the right. At the end of it everything is exactly where the scene proper begins.
  function crewOpening(o) {
    var g = crewGeo, ra = crew.nodes[0], img = crew.imgs[0];
    // Rasan lands as the shatter starts, stands in the hovering letters, and steps aside once they have gone
    var fall = seg(o, .32, .42), land = seg(o, .42, .52), step = inOutC(seg(o, .82, 1));
    var y = fall < 1 ? -(g.H + 260) * (1 - fall * fall) : 0;             // gravity: slow to start, fastest at the moment of impact
    // squash on impact, then a small rebound; stretched a little while falling
    var sq = land > 0 ? Math.sin(Math.PI * land) * Math.exp(-2.2 * land) : 0;
    var sx = fall < 1 ? 1 - .06 * fall : 1 + .22 * sq, sy = fall < 1 ? 1 + .08 * fall : 1 - .24 * sq;
    var s = mix(g.land, g.big, step);
    ra.style.transform = "translate3d(" + mix(0, g.ax, step).toFixed(2) + "px," + (y * (1 - step) + g.ay * step).toFixed(2) + "px,0)";
    ra.style.opacity = o < .32 ? "0" : "1";
    ra.style.zIndex = "9";
    img.style.transform = "scale(" + (s * sx).toFixed(4) + "," + (s * sy).toFixed(4) + ")";
    // his introduction comes in from the right as he steps aside
    var li = seg(o, .88, 1);
    crew.lead.style.opacity = li.toFixed(3);
    crew.lead.style.visibility = li > 0 ? "" : "hidden";
    crew.lead.style.transform = g.mob ? "translate3d(0," + ((1 - ease(li)) * 48).toFixed(1) + "px,0)" : "translate3d(" + ((1 - ease(li)) * 40).toFixed(1) + "px,0,0)";
  }

  // the orbit's resting points, as track progress (0..1): each specialist fully introduced
  function crewRests() {
    var at = function (q) { return CREW_OPEN + q * (1 - CREW_OPEN); }, q = [];
    for (var i = 0; i < 6; i++) {
      var a = i ? CREW_TURN + i * CREW_STEP + CREW_SWING : CREW_TURN, b = CREW_TURN + (i + 1) * CREW_STEP;
      q.push(at((a + b) / 2));
    }
    return q;
  }

  crewRun = crew && addScene({
    el: crewScene, pin: true, mpin: true, glide: 140,
    progress: function (r, view) { return clamp(-r.top / Math.max(1, r.height - view), 0, 1); },
    render: renderCrew,
    reset: clearCrew
  });

  /* ---------- calm reveals, once ---------- */
  if ("IntersectionObserver" in window) {
    var rvs = $$(".rv"), rio = new IntersectionObserver(function (es) {
      es.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("in"); rio.unobserve(en.target); } });
    }, { rootMargin: "0px 0px -8% 0px" });
    rvs.forEach(function (e) { rio.observe(e); });
  } else { $$(".rv").forEach(function (e) { e.classList.add("in"); }); }

  apply();
  // site.js publishes the .pin capability during startup. Re-run after load so the
  // crew scene also initializes when that class arrives after this first pass.
  window.addEventListener("load", apply, { once: true });
})();
