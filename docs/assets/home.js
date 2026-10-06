(function () {
  "use strict";
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Mobile menu
  var menu = document.querySelector(".menu-toggle");
  var nav = document.querySelector(".home .nav");
  if (menu && nav) {
    document.body.classList.add("nav-enabled");
    menu.hidden = false;
    var closeMenu = function () { menu.setAttribute("aria-expanded", "false"); nav.removeAttribute("data-open"); };
    menu.addEventListener("click", function () {
      var open = menu.getAttribute("aria-expanded") !== "true";
      menu.setAttribute("aria-expanded", String(open));
      nav.setAttribute("data-open", String(open));
    });
    nav.querySelectorAll(".nav-links a").forEach(function (a) { a.addEventListener("click", closeMenu); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && menu.getAttribute("aria-expanded") === "true") { closeMenu(); menu.focus(); }
    });
    document.addEventListener("click", function (e) { if (!nav.contains(e.target)) closeMenu(); });
    window.matchMedia("(min-width: 621px)").addEventListener("change", closeMenu);
  }

  // The five calls: a sideways row with previous / next
  var row = document.querySelector(".cxs");
  var btns = Array.from(document.querySelectorAll("[data-calls]"));
  if (row && btns.length) {
    document.body.classList.add("interactive-calls");
    var update = function () {
      if (document.body.classList.contains("calls-pinned")) return;
      var max = row.scrollWidth - row.clientWidth - 2;
      btns[0].disabled = row.scrollLeft <= 2;
      btns[1].disabled = row.scrollLeft >= max;
    };
    btns.forEach(function (b) {
      b.addEventListener("click", function () {
        if (document.body.classList.contains("calls-pinned")) return;
        var card = row.querySelector(".cx");
        var step = card ? card.getBoundingClientRect().width + 22 : 400;
        row.scrollBy({ left: Number(b.dataset.calls) * step, behavior: reduce ? "auto" : "smooth" });
      });
    });
    row.addEventListener("scroll", function () { window.requestAnimationFrame(update); }, { passive: true });
    window.addEventListener("resize", update);
    update();
  }

  // Old deep links into the technical sections now live in the field guide.
  var moved = ["different", "desk", "stack", "crew", "depth", "engine", "models", "songs", "library"];
  function route() { if (moved.indexOf(location.hash.slice(1)) !== -1) location.replace("guide.html" + location.hash); }
  route();
  window.addEventListener("hashchange", route);
})();

/* Scroll choreography. One rAF loop, every effect scrubbed by scroll position (so it reverses),
   transform / opacity / clip-path only, geometry read before it is written. Skipped entirely
   for prefers-reduced-motion; with JS off nothing here runs and the page stays fully visible. */
(function () {
  "use strict";
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var doc = document.documentElement, body = document.body;
  var main = document.getElementById("main");
  if (!main) return;
  doc.classList.add("fx");

  var vw = window.innerWidth, vh = window.innerHeight, sy = 0, small = vw < 700;
  var canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  var fx = [], tilts = [], magnets = [], px = -9999, py = -9999, raf = 0;

  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function out3(t) { return 1 - Math.pow(1 - t, 3); }
  function out5(t) { return 1 - Math.pow(1 - t, 5); }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function back(t) { var c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return [].slice.call((r || document).querySelectorAll(s)); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; e.setAttribute("aria-hidden", "true"); return e; }

  // add(ref, from, to, targets, fn): progress 0 when ref's top is at `from` * viewport height, 1 at `to`
  function add(ref, a, b, t, fn) { var f = { ref: ref, a: a, b: b, t: t, fn: fn, last: -9, off: 0, top: 0, h: 0, bottom: 0 }; fx.push(f); return f; }
  function need() { if (!raf) raf = requestAnimationFrame(frame); }

  /* ---------- text splitting ---------- */
  function split(root, wrap) {
    var out = [];
    (function walk(node) {
      [].slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 3) {
          var frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(function (s) {
            if (!s) return;
            if (/^\s+$/.test(s)) { frag.appendChild(document.createTextNode(s)); return; }
            var i = document.createElement("span");
            i.textContent = s;
            if (wrap) {
              var w = document.createElement("span"); w.className = "w"; i.className = "wi"; w.appendChild(i); frag.appendChild(w);
            } else { i.className = "fw"; frag.appendChild(i); }
            out.push(i);
          });
          node.replaceChild(frag, n);
        } else if (n.nodeType === 1 && n.tagName !== "BR") walk(n);
      });
    })(root);
    return out;
  }

  /* ---------- reusable effect shapes ---------- */
  function words(h) {
    var ws = split(h, true), n = ws.length;
    add(h, small ? 0.98 : 0.94, small ? 0.7 : 0.58, ws, function (p, t) {
      for (var i = 0; i < n; i++) {
        var e = out5(clamp(p * 2.2 - (i / Math.max(1, n - 1)) * 1.2, 0, 1));
        t[i].style.transform = "translate3d(0," + ((1 - e) * 118).toFixed(2) + "%,0) rotate(" + ((1 - e) * 7).toFixed(2) + "deg)";
      }
    });
  }
  function rise(e, a, b, dist, from) {
    var x = from || 0;
    var f = add(e, a, b, e, function (p, t, ff) {
      var k = out3(p), y = (1 - k) * dist;
      t.style.opacity = k.toFixed(3);
      t.style.transform = "translate3d(" + ((1 - k) * x).toFixed(1) + "px," + y.toFixed(1) + "px,0)";
      ff.off = y;
    });
    return f;
  }
  function stagger(ref, items, a, b, fn) {
    var n = items.length;
    add(ref, a, b, items, function (p, t) {
      for (var i = 0; i < n; i++) fn(out3(clamp(p * 1.9 - (i / Math.max(1, n - 1)) * 0.9, 0, 1)), t[i], i);
    });
  }
  function orb(parent, cls, amp, a) {
    var o = el("div", "orb " + cls);
    parent.insertBefore(o, parent.firstChild);
    var f = add(parent, 1.1, -0.1, o, function (p, t) { t.style.transform = "translate3d(0," + ((p - 0.5) * amp).toFixed(1) + "px,0)"; });
    f.p = function (ff) { return clamp((vh - ff.top) / (vh + ff.h), 0, 1); };
    return o;
  }
  function glow(win, parent) {
    var g = el("div", "shot-glow");
    parent.insertBefore(g, win);
    g.place = function () {
      g.style.top = win.offsetTop + win.offsetHeight * 0.18 + "px";
      g.style.width = win.offsetWidth * 1.05 + "px";
      g.style.height = win.offsetHeight * 0.78 + "px";
    };
    g.place();
    return g;
  }

  /* ---------- sharpness: scaled windows always draw from the 2x screenshot, so a downscale never starts from the soft 1x file ---------- */
  $$(".window img[srcset]", main).forEach(function (im) {
    var m = /(\S+-2x\.jpg)\s+\d+w/.exec(im.getAttribute("srcset") || "");
    if (m) { im.setAttribute("sizes", "100vw"); im.srcset = m[1] + " 2240w"; }
  });

  /* ---------- hero: the window rises, flattens and scales up as you scroll ---------- */
  var hero = $(".hero"), heroCopy = $(".hero-copy"), heroWin = $(".hero-shot .window[data-parallax]");
  if (hero && heroCopy && heroWin) {
    var shot = heroWin.parentNode;
    var hg = glow(heroWin, shot);
    var o1 = orb(hero, "o1 o-ind", 0), o2 = orb(hero, "o2 o-warm", 0);
    fx.pop(); fx.pop(); // hero orbs ride the first screen of scroll instead
    var hf = add(hero, 0, 0, null, function (p) {
      var e = smooth(p), s0 = small ? 0.86 : 0.72, s1 = 1;
      var s = s0 + (s1 - s0) * e, rx = (small ? 14 : 24) * (1 - e), y = (small ? 24 : 36) * (1 - e);
      heroWin.style.transform = "perspective(1500px) translate3d(0," + y.toFixed(1) + "px,0) rotateX(" + rx.toFixed(2) + "deg) scale(" + s.toFixed(4) + ")";
      hg.style.opacity = (0.15 + 0.85 * e).toFixed(3);
      hg.style.transform = "translate3d(-50%," + (y * 0.6).toFixed(1) + "px,0) scale(" + (0.65 + 0.55 * e).toFixed(3) + ")";
      var c = clamp(p * 1.35, 0, 1);
      heroCopy.style.opacity = (1 - smooth(c)).toFixed(3);
      heroCopy.style.transform = "translate3d(0," + (p * (small ? 40 : 90)).toFixed(1) + "px,0) scale(" + (1 - p * 0.07).toFixed(4) + ")";
      o1.style.transform = "translate3d(0," + (p * -120).toFixed(1) + "px,0)";
      o2.style.transform = "translate3d(0," + (p * 160).toFixed(1) + "px,0)";
    });
    hf.p = function () { return clamp(sy / (vh * 0.78), 0, 1); };
    hf.always = true;
    hf.glow = hg;
    // load-in: headline words rise through a mask, the rest follows
    var hw = split($("h1", heroCopy), true);
    hw.forEach(function (w, i) { w.style.setProperty("--i", i); });
    $$(":scope > :not(h1)", heroCopy).forEach(function (c, i) { c.classList.add("intro"); c.style.setProperty("--i", i); });
    requestAnimationFrame(function () { requestAnimationFrame(function () { doc.classList.add("hero-in"); }); });
  }

  /* ---------- headings, eyebrows, copy ---------- */
  $$("h2", main).forEach(words);
  $$(".eyebrow", main).forEach(function (e) { if (!e.closest(".hero")) rise(e, 0.98, 0.78, 0, -22); });
  $$(".head > .lede, .split-copy > .lede, .split-copy > p:not(.eyebrow), .center > .lede, .skill-grid > div > p, .skill-grid .link, .skill-commands .cmd, .skill-commands .command-label, .dl-grid .lede, .dl-meta, .dl-links, .honest, .section-bottom, .home-signoff p", main).forEach(function (e) {
    if (e.closest("#presenter")) return;
    rise(e, 0.96, 0.62, small ? 22 : 36);
  });
  $$(".points").forEach(function (ul) {
    stagger(ul, $$("li", ul), 0.96, 0.5, function (k, li) {
      li.style.opacity = k.toFixed(3);
      li.style.transform = "translate3d(0," + ((1 - k) * 28).toFixed(1) + "px,0)";
      li.style.setProperty("--d", k.toFixed(3));
    });
  });

  /* ---------- presenter: the paragraph fills in word by word ---------- */
  var pl = $("#presenter .lede");
  if (pl) {
    var fw = split(pl, false), nfw = fw.length;
    add(pl, 0.86, 0.22, fw, function (p, t) {
      var k = p * (nfw + 14);
      for (var i = 0; i < nfw; i++) t[i].style.opacity = (0.16 + 0.84 * clamp(k - i, 0, 1)).toFixed(3);
    });
  }

  /* ---------- screenshots that swing in from the side, zoomed from a crop ---------- */
  $$(".split .window").forEach(function (w) {
    var reverse = !!w.closest(".split-rev"), dir = reverse ? -1 : 1, img = $("img", w), host = w.closest(".split");
    var chipHost = w.closest(".stack");
    add(host, 1, small ? 0.5 : 0.32, w, function (p, t) {
      var e = out3(p), k = 1 - e;
      t.style.opacity = clamp(p * 2.4, 0, 1).toFixed(3);
      t.style.transform = "perspective(1700px) translate3d(" + (small ? 0 : dir * k * 70).toFixed(1) + "px," + (k * (small ? 36 : 70)).toFixed(1) + "px,0) rotateY(" + (small ? 0 : -dir * k * 16).toFixed(2) + "deg) rotateX(" + (k * 7).toFixed(2) + "deg) scale(" + (0.9 + 0.1 * e).toFixed(4) + ")";
      img.style.transform = "scale(" + (1.32 - 0.32 * smooth(p)).toFixed(4) + ")";
    });
    img.style.transformOrigin = reverse ? "30% 40%" : "70% 40%";
    var o = orb(host, reverse ? "o3 o-ind" : "o4 o-warm", reverse ? -160 : 200);
    if (reverse && chipHost) {
      var chip = el("div", "fx-chip", '<span class="sw"><i style="background:#1B1F5E"></i><i style="background:#2a31a8"></i><i style="background:#EFB21A"></i><i style="background:#F1F0EC"></i><i style="background:#1a1a1f"></i></span><b>DESIGN.md</b>');
      chipHost.appendChild(chip);
      var cf = add(chipHost, 1, 0.3, chip, function (p, t, f) {
        var e = back(clamp((p - 0.35) / 0.65, 0, 1)), q = clamp((vh - f.top) / (vh + f.h), 0, 1);
        t.style.opacity = clamp((p - 0.35) * 4, 0, 1).toFixed(3);
        t.style.transform = "translate3d(0," + ((1 - e) * 50 + (q - 0.5) * -110).toFixed(1) + "px,0) scale(" + (0.8 + 0.2 * e).toFixed(3) + ")";
      });
      cf.always = true; cf.p = function (f) { return f.top; };
      var swf = $$(".sw i", chip);
      add(chipHost, 0.8, 0.2, swf, function (p, t) { t.forEach(function (s, i) { s.style.transform = "scale(" + out3(clamp(p * 3 - i * 0.4, 0, 1)).toFixed(3) + ")"; }); });
    }
  });

  /* ---------- the five calls: pinned, the track advances one call per scroll step ---------- */
  var flow = $("#flow"), cxs = $(".cxs"), cards = $$(".cx"), nav = $$("[data-calls]");
  var pinOn = false, travel = 0, hdrH = 68, cardStep = 0, stage = null, bar = null, barFill = null, barNum = null, barName = null, ff = null;
  var names = cards.map(function (c) { return ($("h3", c) || {}).textContent || ""; });
  function pos() { return flow ? clamp((hdrH - flow.getBoundingClientRect().top) / Math.max(1, travel), 0, 1) * (cards.length - 1) : 0; }
  function wrapFlow() {
    if (stage) return;
    var pin = document.createElement("div"); pin.className = "flow-pin";
    stage = document.createElement("div"); stage.className = "flow-stage";
    while (flow.firstChild) stage.appendChild(flow.firstChild);
    pin.appendChild(stage); flow.appendChild(pin);
    var foot = $(".calls-foot", stage);
    bar = el("div", "calls-bar", '<span class="bn"><b>01</b> / ' + pad(cards.length) + '</span><span class="bname"></span><span class="bt"><i></i></span>');
    foot.insertBefore(bar, foot.firstChild);
    barNum = $(".bn b", bar); barName = $(".bname", bar); barFill = $(".bt i", bar);
  }
  function measureFlow() {
    var hdr = $(".top"); hdrH = hdr ? hdr.offsetHeight : 68;
    var stageH = vh - hdrH, perStep = Math.max(vh * 0.62, 460);
    travel = perStep * (cards.length - 1);
    flow.style.setProperty("--pin-h", Math.round(stageH + travel + vh * 0.2) + "px");
    cardStep = cards[0].offsetWidth + 22;
  }
  function setupFlow() {
    if (!flow || !cxs || cards.length < 2) return;
    var want = vw >= 1000 && vh >= 640;
    if (want) { wrapFlow(); }
    if (want !== pinOn) {
      pinOn = want;
      flow.classList.toggle("is-pinned", want);
      body.classList.toggle("calls-pinned", want);
      if (want) { cards.forEach(function (c) { var i = $("img", c); if (i) i.loading = "eager"; }); }
      else { cxs.style.transform = ""; cards.forEach(function (c) { ["--s", "--o", "--tx", "--ty"].forEach(function (v) { c.style.removeProperty(v); }); var i = $("img", c); if (i) i.style.transform = ""; }); nav.forEach(function (b) { b.disabled = false; }); }
      if (ff) ff.last = -9;
    }
    if (pinOn) measureFlow();
    if (!ff) {
      ff = add(flow, 0, 0, null, function (p, t, f) {
        if (!pinOn) return;
        var n = cards.length, ps = p * (n - 1);
        cxs.style.transform = "translate3d(" + (-ps * cardStep).toFixed(1) + "px,0,0)";
        cards.forEach(function (c, i) {
          var k = Math.min(Math.abs(i - ps), 1);
          c.style.setProperty("--s", (1 - 0.08 * k).toFixed(3));
          c.style.setProperty("--o", (1 - 0.62 * k).toFixed(3));
          var im = $("img", c); if (im) im.style.transform = "scale(" + (1 + 0.2 * k).toFixed(3) + ")";
        });
        var idx = Math.round(ps);
        barFill.style.transform = "scaleX(" + (p).toFixed(4) + ")";
        if (barNum.textContent !== pad(idx + 1)) { barNum.textContent = pad(idx + 1); barName.textContent = names[idx]; }
        nav[0].disabled = ps < 0.04; nav[1].disabled = ps > n - 1.04;
      });
      ff.always = true;
      ff.p = function (f) { return pinOn ? clamp((hdrH - f.top) / Math.max(1, travel), 0, 1) : -3; };
    }
  }
  function goStep(i) {
    var top = flow.getBoundingClientRect().top + window.pageYOffset;
    var perStep = travel / (cards.length - 1);
    window.scrollTo({ top: top - hdrH + clamp(i, 0, cards.length - 1) * perStep + 2, behavior: "smooth" });
  }
  nav.forEach(function (b) { b.addEventListener("click", function () { if (pinOn) goStep(Math.round(pos()) + Number(b.dataset.calls)); }); });
  if (cxs) cxs.addEventListener("keydown", function (e) {
    if (!pinOn) return;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); goStep(Math.round(pos()) + (e.key === "ArrowRight" ? 1 : -1)); }
  });
  // unpinned (phones, short windows): the cards file in as the row arrives
  if (cxs) add(cxs, 1, 0.5, cards, function (p, t, f) {
    if (pinOn) return;
    t.forEach(function (c, i) {
      var k = out3(clamp(p * 1.8 - i * 0.18, 0, 1));
      c.style.setProperty("--o", k.toFixed(3));
      c.style.setProperty("--tx", ((1 - k) * 70).toFixed(1) + "px");
      c.style.setProperty("--ty", ((1 - k) * 20).toFixed(1) + "px");
    });
  });
  setupFlow();

  /* ---------- curtains: dark sections open out of a rounded card ---------- */
  $$(".dark-band, .download").forEach(function (sec) {
    var side = small ? 12 : vw * 0.04, rad = small ? 26 : 56;
    var f = add(sec, 0, 0, sec, function (p, t, ff2) {
      var s = ff2.cs;
      if (s.k <= 0.002) { t.style.clipPath = "none"; return; }
      t.style.clipPath = "inset(0 " + (s.k * (small ? 12 : vw * 0.04)).toFixed(1) + "px round " + (s.kt * rad).toFixed(1) + "px " + (s.kt * rad).toFixed(1) + "px " + (s.kb * rad).toFixed(1) + "px " + (s.kb * rad).toFixed(1) + "px)";
    });
    f.always = true;
    f.p = function (ff2) {
      var e = out3(clamp((vh - ff2.top) / (vh * 0.62), 0, 1)), x = out3(clamp((vh * 0.55 - ff2.bottom) / (vh * 0.55), 0, 1));
      ff2.cs = { kt: 1 - e, kb: x, k: Math.max(1 - e, x) };
      return Math.round(ff2.cs.k * 1000) + "," + Math.round(ff2.cs.kt * 1000) + "," + Math.round(ff2.cs.kb * 1000);
    };
    f.keyed = true;
    if (sec.classList.contains("dark-band")) { orb(sec, "o5 o-ind", -260); orb(sec, "o6 o-warm", 240); }
    else { orb(sec, "o7 o-ind", -220); orb(sec, "o8 o-warm", 180); }
  });

  /* ---------- reels: the four capabilities draw their rules and numbers ---------- */
  $$(".quad").forEach(function (ul) {
    stagger(ul, $$("li", ul), 0.95, 0.45, function (k, li) {
      li.style.opacity = (0.08 + 0.92 * k).toFixed(3);
      li.style.transform = "translate3d(0," + ((1 - k) * 44).toFixed(1) + "px,0)";
      li.style.setProperty("--d", k.toFixed(3));
    });
  });

  /* ---------- gallery: clip-path reveals with the picture drifting inside ---------- */
  $$(".visual-grid figure").forEach(function (fig, i) {
    var img = $("img", fig); if (!img) return;
    var w = el("div", "pimg"); w.removeAttribute("aria-hidden");
    img.parentNode.insertBefore(w, img); w.appendChild(img);
    var cap = $("figcaption", fig), feature = fig.classList.contains("visual-feature");
    var f = add(fig, 1, 0.3, fig, function (p, t, f2) {
      var e = out5(p), k = 1 - e, q = clamp((vh - f2.top) / (vh + f2.h), 0, 1);
      var ix = feature ? 16 : 12, iy = feature ? 26 : 18;
      w.style.clipPath = k < 0.002 ? "none" : "inset(" + (k * iy).toFixed(1) + "% " + (k * ix).toFixed(1) + "% " + (k * iy).toFixed(1) + "% " + (k * ix).toFixed(1) + "% round 14px)";
      img.style.transform = "translate3d(0," + ((q - 0.5) * -(small ? 3 : 5)).toFixed(2) + "%,0) scale(" + (1.07 + 0.2 * k).toFixed(4) + ")";
      if (cap) { var c = out3(clamp((p - 0.45) / 0.55, 0, 1)); cap.style.opacity = c.toFixed(3); cap.style.transform = "translate3d(0," + ((1 - c) * 16).toFixed(1) + "px,0)"; }
    });
    f.always = true; f.p = function (f2) { return Math.round(f2.top * 2); };
    f.pp = function (f2) { return clamp((vh - f2.top) / (vh * 0.7), 0, 1); };
    // two numbers in one effect: reveal progress and drift progress
    var inner = f.fn;
    f.fn = function (_, t, f2) { inner(f.pp(f2), t, f2); };
  });

  /* ---------- finale: the finished film scales in out of the dark ---------- */
  var fwin = $(".finished .window");
  if (fwin) {
    var fhost = fwin.parentNode; fhost.style.position = "relative";
    var anchor = el("span", "fx-anchor"); fhost.insertBefore(anchor, fwin);
    var fg = glow(fwin, fhost);
    var fa = add(anchor, 1, 0.1, fwin, function (p, t) {
      var e = out3(p), k = 1 - e, s = (small ? 0.84 : 0.6) + (small ? 0.16 : 0.44) * e;
      t.style.opacity = clamp(p * 3, 0, 1).toFixed(3);
      t.style.transform = "perspective(1500px) translate3d(0," + (k * (small ? 50 : 140)).toFixed(1) + "px,0) rotateX(" + (k * (small ? 10 : 22)).toFixed(2) + "deg) scale(" + s.toFixed(4) + ")";
      fg.style.opacity = (e * 0.95).toFixed(3);
      fg.style.transform = "translate3d(-50%," + (k * 80).toFixed(1) + "px,0) scale(" + (0.6 + 0.6 * e).toFixed(3) + ")";
    });
    fa.glow = fg;
  }

  /* ---------- download: the button lands ---------- */
  var dlBtn = $(".download .btn-lg"), dm = null;
  function paintBtn(m) { m.e.style.transform = "translate3d(" + m.x.toFixed(2) + "px," + (m.y + m.ly).toFixed(2) + "px,0) scale(" + m.ls.toFixed(3) + ")"; }
  if (dlBtn) {
    var landed = false;
    dm = { e: dlBtn, x: 0, y: 0, tx: 0, ty: 0, cx: 0, cy: 0, r: 0, ly: 0, ls: 1 };
    add(dlBtn, 0.98, 0.6, dlBtn, function (p, t, f) {
      var e = back(p), y = (1 - e) * -110;
      t.style.opacity = clamp(p * 3.5, 0, 1).toFixed(3);
      dm.ly = y; dm.ls = 1 + (1 - p) * 0.22; paintBtn(dm);
      f.off = y;
      if (p >= 1 && !landed) { landed = true; t.classList.add("landed"); }
      if (p < 0.4 && landed) { landed = false; t.classList.remove("landed"); }
    });
  }
  $$(".dl-detail").forEach(function (d) {
    stagger(d, $$("h3, ul, ol, p", d), 0.95, 0.3, function (k, e) { e.style.opacity = k.toFixed(3); e.style.transform = "translate3d(0," + ((1 - k) * 26).toFixed(1) + "px,0)"; });
  });

  /* ---------- progress: a top bar and a section rail ---------- */
  var topbar = el("div", "topbar", "<i></i>"), tbi = topbar.firstChild;
  body.appendChild(topbar);
  var rail = null, railItems = [], railSecs = [];
  if (!small) {
    var defs = [["start", "New film"], ["flow", "Five calls"], ["brand", "Brands"], ["reels", "Reels"], ["presenter", "Presenter"], ["gallery", "Gallery"], ["finished", "Finished"], ["download", "Download"]];
    rail = el("nav", "rail", "<ol></ol>");
    var ol = $("ol", rail);
    defs.forEach(function (d) {
      var s = document.getElementById(d[0]); if (!s) return;
      var li = document.createElement("li"); li.innerHTML = "<i></i><span>" + d[1] + "</span>";
      ol.appendChild(li); railItems.push(li); railSecs.push(s);
    });
    body.appendChild(rail);
  }
  var flashT, lastActive = -2, lastShow = null, lastDark = null;

  /* ---------- hover: tilt on the cards and pictures, magnetic download buttons ---------- */
  function tiltable(e, rx, ry) {
    var s = { e: e, rx: 0, ry: 0, trx: 0, try_: 0, g: 0, tg: 0 };
    tilts.push(s);
    e.addEventListener("pointermove", function (ev) {
      var r = e.getBoundingClientRect(), nx = (ev.clientX - r.left) / r.width - 0.5, ny = (ev.clientY - r.top) / r.height - 0.5;
      s.try_ = nx * ry; s.trx = -ny * rx; s.tg = 1;
      e.style.setProperty("--mx", ((nx + 0.5) * 100).toFixed(1) + "%"); e.style.setProperty("--my", ((ny + 0.5) * 100).toFixed(1) + "%");
      need();
    });
    e.addEventListener("pointerleave", function () { s.trx = 0; s.try_ = 0; s.tg = 0; need(); });
  }
  if (canHover && !small) {
    cards.forEach(function (c) { tiltable(c, 9, 11); });
    $$(".visual-grid figure").forEach(function (c) { tiltable(c, 5, 6); });
    $$(".btn-lg").forEach(function (b) { if (dm && b === dm.e) magnets.push(dm); else magnets.push({ e: b, x: 0, y: 0, tx: 0, ty: 0, cx: 0, cy: 0, r: 0, ly: 0, ls: 1 }); });
    window.addEventListener("pointermove", function (ev) { px = ev.clientX; py = ev.clientY; need(); }, { passive: true });
  }

  /* ---------- the loop ---------- */
  function frame() {
    raf = 0;
    sy = window.pageYOffset;
    var i, f, r, moving = false;
    // reads
    for (i = 0; i < fx.length; i++) {
      f = fx[i]; r = f.ref.getBoundingClientRect();
      f.top = r.top - f.off; f.h = r.height; f.bottom = r.bottom - f.off;
    }
    var maxY = Math.max(1, doc.scrollHeight - vh), active = -1;
    for (i = 0; i < railSecs.length; i++) { if (railSecs[i].getBoundingClientRect().top < vh * 0.5) active = i; }
    var lastSec = railSecs.length ? railSecs[railSecs.length - 1].getBoundingClientRect() : null;
    magnets.forEach(function (m) {
      var b = m.e.getBoundingClientRect();
      m.cx = b.left + b.width / 2 - m.x; m.cy = b.top + b.height / 2 - m.y - m.ly; m.r = Math.max(b.width, b.height);
    });
    // writes
    for (i = 0; i < fx.length; i++) {
      f = fx[i];
      var p = f.p ? f.p(f) : clamp((vh * f.a - f.top) / (vh * (f.a - f.b)), 0, 1);
      if (p === f.last) continue;
      f.last = p;
      f.fn(p, f.t, f);
    }
    tbi.style.transform = "scaleX(" + clamp(sy / maxY, 0, 1).toFixed(4) + ")";
    if (rail) {
      var show = sy > vh * 0.9 && lastSec && lastSec.bottom > vh * 0.4;
      if (show !== lastShow) { rail.classList.toggle("on", show); lastShow = show; }
      if (active !== lastActive) {
        lastActive = active;
        railItems.forEach(function (li, k) { li.classList.toggle("act", k === active); li.classList.toggle("past", k < active);  });
        rail.classList.toggle("hide", active >= 0 && railSecs[active].id === "flow");
        var dark = active >= 0 && /reels|download/.test(railSecs[active].id);
        if (dark !== lastDark) { rail.classList.toggle("dark", dark); lastDark = dark; }
      }
    }
    tilts.forEach(function (s) {
      var dx = s.trx - s.rx, dy = s.try_ - s.ry, dg = s.tg - s.g;
      if (Math.abs(dx) + Math.abs(dy) + Math.abs(dg) > 0.004) {
        s.rx += dx * 0.14; s.ry += dy * 0.14; s.g += dg * 0.14; moving = true;
        s.e.style.setProperty("--rx", s.rx.toFixed(2) + "deg"); s.e.style.setProperty("--ry", s.ry.toFixed(2) + "deg"); s.e.style.setProperty("--g", s.g.toFixed(3));
      }
    });
    magnets.forEach(function (m) {
      var dx = px - m.cx, dy = py - m.cy, d = Math.sqrt(dx * dx + dy * dy), reach = m.r * 0.9;
      var inRange = d < reach;
      m.tx = inRange ? dx * 0.28 : 0; m.ty = inRange ? dy * 0.4 : 0;
      if (Math.abs(m.tx - m.x) + Math.abs(m.ty - m.y) > 0.05) {
        m.x += (m.tx - m.x) * 0.16; m.y += (m.ty - m.y) * 0.16; moving = true;
        paintBtn(m);
      }
    });
    if (moving) need();
  }

  function resize() {
    vw = window.innerWidth; vh = window.innerHeight; small = vw < 700;
    setupFlow();
    fx.forEach(function (f) { f.last = -9; if (f.glow && f.glow.place) f.glow.place(); });
    need();
  }
  var rt;
  window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(resize, 120); });
  window.addEventListener("scroll", need, { passive: true });
  window.addEventListener("load", function () { fx.forEach(function (f) { if (f.glow && f.glow.place) f.glow.place(); }); need(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { fx.forEach(function (f) { if (f.glow && f.glow.place) f.glow.place(); }); need(); });
  frame();
})();
