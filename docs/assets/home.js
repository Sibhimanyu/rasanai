(function () {
  "use strict";
  var root = document.documentElement;
  var reduceQ = window.matchMedia("(prefers-reduced-motion: reduce)");
  var wideQ = window.matchMedia("(min-width: 900px)");
  function pinned() { return root.classList.contains("pin"); }
  function calm() { return reduceQ.matches; }
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  var seg = function (v, a, b) { return clamp((v - a) / (b - a), 0, 1); };
  var ease = function (t) { return 1 - Math.pow(1 - t, 3); };
  function tog(el, on) { if (el && el.classList.contains("on") !== on) el.classList.toggle("on", on); }
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return [].slice.call((r || document).querySelectorAll(s)); }

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
  var moved = ["different", "desk", "stack", "crew", "depth", "engine", "models", "songs", "library"];
  function route() { if (moved.indexOf(location.hash.slice(1)) !== -1) location.replace("guide.html" + location.hash); }
  route(); window.addEventListener("hashchange", route);

  /* ---------- unit renderers: render(q), q in 0..1; discrete states are class toggles with CSS transitions ---------- */
  var R = {};
  /* the five call screens are the real Studio screens: nothing is drawn on top of them */
  R.brief = R.story = R.look = R.animatic = R.final = function () { return function () {}; };
  R.notify = function (el) {
    var nts = $$(".nt", el), step = 92;
    return function (q) {
      var t = nts.map(function (n, i) { return ease(seg(q, .05 + i * .17, .05 + i * .17 + .13)); });
      nts.forEach(function (n, i) {
        var slot = 0, j; for (j = i + 1; j < nts.length; j++) slot += t[j];
        n.style.opacity = t[i].toFixed(3);
        n.style.transform = pinned() ? "translateY(" + (slot * step - (1 - t[i]) * 36).toFixed(1) + "px)" : "translateY(" + ((1 - t[i]) * 18).toFixed(1) + "px)";
      });
    };
  };
  R.start = function (el) {
    var span = $(".typed", el), full = span.getAttribute("data-text"), files = $$(".nf-file", el), chips = $$(".ch", el), go = $(".go", el), caret = $(".caret", el), n = -1;
    return function (q) {
      var k = Math.round(seg(q, .03, .42) * full.length);
      if (k !== n) { span.textContent = full.slice(0, k); n = k; }
      files.forEach(function (f, i) { tog(f, q > .46 + i * .1); });
      chips.forEach(function (c, i) { tog(c, q > .64 + i * .045); });
      tog(go, q > .9);
    };
  };
  R.brand = function (el) {
    var rcs = $$(".rc", el), pops = $$(".pop", el);
    return function (q) {
      rcs.forEach(function (r, i) { tog(r, q > .05 + i * .07); });
      [.22, .46, .7].forEach(function (th, i) { tog(pops[i], q > th); });
    };
  };
  R.crew = function (el) {
    var hbs = $$(".hb", el);
    return function (q) {
      var a = q < .08 ? -1 : Math.min(4, Math.floor((q - .08) / .18));
      hbs.forEach(function (h, i) { tog(h, i === a); });
    };
  };

  /* ---------- scenes ---------- */
  var scenes = [];
  function addScene(sc) { scenes.push(sc); return sc; }

  // hero: the cards drift outward at depth-based speeds and fade
  var heroEl = $(".hero.track");
  if (heroEl) {
    var cards = $$(".fc", heroEl).map(function (c) {
      var cs = c.style, x = parseFloat(cs.getPropertyValue("--x")), y = parseFloat(cs.getPropertyValue("--y")), d = parseFloat(cs.getPropertyValue("--d"));
      return { el: c, x: (x - 46) / 50, y: (y - 42) / 58, d: d };
    });
    var copy = $("[data-hero-copy]", heroEl);
    addScene({
      el: heroEl, pin: true,
      progress: function (r, vh) { return clamp(-r.top / Math.max(1, r.height - vh), 0, 1); },
      render: function (p) {
        var e = ease(p);
        cards.forEach(function (c) {
          c.el.style.transform = "translate3d(" + (c.x * e * c.d * 420).toFixed(1) + "px," + (c.y * e * c.d * 380 - e * c.d * 140).toFixed(1) + "px,0) scale(" + (1 - e * .12 * c.d).toFixed(3) + ")";
          c.el.style.opacity = (1 - seg(p, .35, .92) * (.6 + .4 * c.d)).toFixed(3);
        });
        if (copy) copy.style.transform = "translateY(" + (-seg(p, .4, 1) * 70).toFixed(1) + "px)";
      },
      reset: function () { cards.forEach(function (c) { c.el.style.transform = ""; c.el.style.opacity = ""; }); if (copy) copy.style.transform = ""; }
    });
  }

  // five calls: one window plays all five as you scroll
  var flowEl = $(".flow.track");
  var flowSteps = [], flowRail = [];
  if (flowEl) {
    flowSteps = $$(".fstep", flowEl).map(function (s) { return { el: s, r: R[s.getAttribute("data-unit")](s) }; });
    flowRail = $$(".frail li", flowEl);
    addScene({
      el: flowEl, pin: true,
      progress: function (r, vh) { return clamp(-r.top / Math.max(1, r.height - vh), 0, 1); },
      render: function (p) {
        var f = p * 5, n = flowSteps.length;
        flowSteps.forEach(function (s, k) {
          var local = f - k;
          var inn = k === 0 ? 1 : ease(seg(local, -.02, .1)), out = k === n - 1 ? 0 : ease(seg(local, .9, 1.02));
          var op = Math.min(inn, 1 - out);
          s.el.style.opacity = op.toFixed(3);
          s.el.style.transform = "translate3d(0," + (((1 - inn) * 36) - out * 36).toFixed(1) + "px,0)";
          s.el.style.visibility = op < .01 ? "hidden" : "";
          s.el.style.pointerEvents = op < .6 ? "none" : "";
          s.r(seg(local, .08, .82));
          var li = flowRail[k]; if (li) { li.firstChild.style.setProperty("--f", clamp(local + .1, 0, 1).toFixed(3)); tog(li, local > -.05 && local < 1); }
        });
      },
      reset: function () { flowSteps.forEach(function (s) { s.el.style.cssText = ""; }); }
    });
  }

  // single-unit pinned scenes
  [["notify", "notify"], ["start", "start"], ["brandsec", "brand"], ["crew", "crew"]].forEach(function (pair) {
    var el = $("." + pair[0] + ".track"); if (!el) return;
    var u = $("[data-unit]", el), r = R[u.getAttribute("data-unit")](u);
    var sc = addScene({
      el: el, pin: true, unit: u, r: r,
      progress: function (rc, vh) { return clamp(-rc.top / Math.max(1, rc.height - vh), 0, 1); },
      render: function (p) { r(seg(p, .06, .9)); },
      reset: function () {}
    });
  });

  // rising windows: scale and lift as they enter
  $$("[data-rise]").forEach(function (el) {
    addScene({
      el: el, pin: false,
      progress: function (r, vh) { return clamp((vh - r.top) / (vh * .75), 0, 1); },
      render: function (p) { var e = ease(p); el.style.transform = "translate3d(0," + ((1 - e) * 64).toFixed(1) + "px,0) scale(" + (.93 + .07 * e).toFixed(3) + ")"; },
      reset: function () { el.style.transform = ""; }
    });
  });

  /* ---------- the loop: rAF only while something is moving ---------- */
  var busy = false, raf = 0, vh = window.innerHeight;
  function tick() {
    raf = 0;
    if (!pinnedMode.motion) return;
    var rects = scenes.map(function (s) { return s.el.getBoundingClientRect(); });
    var more = false;
    scenes.forEach(function (s, i) {
      if (s.pin && !pinned()) return;
      var r = rects[i], near = r.bottom > -vh * .5 && r.top < vh * 1.5;
      var target = s.progress(r, vh);
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
  window.addEventListener("resize", function () { vh = window.innerHeight; request(); }, { passive: true });

  /* ---------- stacked mode (mobile) and calm mode ---------- */
  var pinnedMode = { motion: false };
  var stacked = [], io = null;
  function play(u) {
    if (u.done) return; u.done = true;
    var t0 = performance.now(), dur = 2400;
    (function step(now) {
      var q = clamp((now - t0) / dur, 0, 1); u.r(q); if (q < 1) requestAnimationFrame(step);
    })(t0);
  }
  function apply() {
    var calmNow = calm(), pin = pinned();
    pinnedMode.motion = !calmNow;
    if (io) { io.disconnect(); io = null; }
    stacked = [];
    scenes.forEach(function (s) { s.cur = undefined; s.last = undefined; if (s.reset && (!s.pin || !pin)) s.reset(); });
    if (calmNow) {
      scenes.forEach(function (s) { if (s.pin) { var u = s.unit; } });
      flowSteps.forEach(function (s) { s.r(1); });
      scenes.forEach(function (s) { if (s.unit) s.r(1); });
      return;
    }
    if (pin) { request(); return; }
    // stacked: each unit plays once when it scrolls into view
    var list = [];
    flowSteps.forEach(function (s) { list.push({ el: $(".fwin", s.el), r: s.r }); });
    scenes.forEach(function (s) { if (s.unit) list.push({ el: s.unit, r: s.r }); });
    list.forEach(function (u) { u.r(0); u.done = false; });
    io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { var u = list.filter(function (x) { return x.el === e.target; })[0]; if (u) { play(u); io.unobserve(e.target); } } });
    }, { threshold: .35 });
    list.forEach(function (u) { io.observe(u.el); });
    stacked = list; request();
  }
  reduceQ.addEventListener("change", function () { setTimeout(apply, 0); });
  wideQ.addEventListener("change", function () { setTimeout(apply, 0); });

  /* ---------- calm reveals, once ---------- */
  if ("IntersectionObserver" in window) {
    var rvs = $$(".rv"), rio = new IntersectionObserver(function (es) {
      es.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("in"); rio.unobserve(en.target); } });
    }, { rootMargin: "0px 0px -8% 0px" });
    rvs.forEach(function (e) { rio.observe(e); });
  } else { $$(".rv").forEach(function (e) { e.classList.add("in"); }); }

  apply();
})();
