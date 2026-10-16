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

  // hero: the copy leaves; the cards stay put until the flight (below) lifts them onto the screenshot
  var heroEl = $(".hero.track");
  var copy = heroEl && $("[data-hero-copy]", heroEl);
  if (heroEl) {
    addScene({
      el: heroEl, pin: true,
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

  // five calls: one window plays all five as you scroll
  var flowEl = $(".flow.track");
  var flowSteps = [], flowRail = [];
  if (flowEl) {
    flowSteps = $$(".fstep", flowEl).map(function (s) {
      return { el: s, r: R[s.getAttribute("data-unit")](s), pose: $(".fwho", s), text: $$(".fcopy > :not(.fwho)", s), win: $(".fwin", s) };
    });
    flowRail = $$(".frail li", flowEl);
    // every change is a continuous overlap driven by scroll alone: u(k) is how far call k has handed over to call k+1
    var ss = function (t) { return t * t * (3 - 2 * t); };
    var setT = function (el, op, x, y, sc) {
      if (!el) return;
      el.style.opacity = op.toFixed(3);
      el.style.transform = "translate3d(" + x.toFixed(2) + "px," + y.toFixed(2) + "px,0) scale(" + sc.toFixed(4) + ")";
    };
    addScene({
      el: flowEl, pin: true,
      progress: function (r, vh) { return clamp(-r.top / Math.max(1, r.height - vh), 0, 1); },
      render: function (p) {
        var f = p * 5, n = flowSteps.length;
        var u = function (k) { return k < 0 ? 1 : k > n - 2 ? 0 : ss(seg(f, k + .72, k + 1.12)); };
        flowSteps.forEach(function (s, k) {
          var inn = u(k - 1), out = u(k);
          var tx = inn * (1 - out);              // text and pose: symmetric, so the two always sum to one
          var dom = inn >= .5 && out < .5;
          // window: the next one rises over the current, which stays put until it is covered
          setT(s.win, k === 0 ? 1 : ss(seg(inn, 0, .16)), 0, (1 - ss(inn)) * 56 - out * 10, 1 - (1 - inn) * .015 - out * .01);
          // words and characters hand over without stacking: the old leaves in the first half, the new arrives in the second
          var vis = ss(seg(inn, .42, 1)) * (1 - ss(seg(out, 0, .58)));
          setT(s.pose, k === 0 ? 1 - ss(seg(out, 0, .58)) : vis, 0, (1 - inn) * 18 - out * 14, 1 - (1 - inn) * .05 - out * .05);
          s.text.forEach(function (t, i) { setT(t, k === 0 ? 1 - ss(seg(out, 0, .58)) : vis, 0, (1 - inn) * (14 + i * 1.5) - out * (12 + i * 1.5), 1); });
          s.el.style.visibility = (inn > .001 || k === 0) && out < .999 ? "" : "hidden";
          s.el.style.pointerEvents = dom ? "" : "none";
          s.r(seg(f - k, .08, .82));
          var li = flowRail[k]; if (li) { li.firstChild.style.setProperty("--f", clamp(f - k, 0, 1).toFixed(3)); tog(li, f - k > -.05 && f - k < 1); }
        });
      },
      reset: function () { flowSteps.forEach(function (s) { s.el.style.cssText = ""; [s.win, s.pose].concat(s.text).forEach(function (e) { if (e) e.style.cssText = ""; }); }); }
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
    var BOX = { tara: [20.066, 42.213, 7.189, 8.175], kavi: [27.354, 35.249, 7.436, 15.169], chitra: [34.74, 34.128, 8.473, 16.229], ra: [43.04, 33.311, 12.055, 17.047], laya: [55.096, 33.704, 7.633, 14.624], rasika: [61.691, 42.97, 9.387, 7.388], mala: [71.079, 38.882, 8.745, 11.536] };
    var RIM = 49.46, STAG = .06;
    // while the crew fly in, the screenshot shows its prompt with the crew painted out, so no one lands on top of themselves
    var emptyImg = new Image(); emptyImg.className = "shot-empty"; emptyImg.alt = ""; emptyImg.setAttribute("aria-hidden", "true"); emptyImg.decoding = "async";
    emptyImg.srcset = "img/studio/home-1x-empty.jpg 907w, img/studio/home-2x-empty.jpg 1814w"; emptyImg.sizes = homeImg.getAttribute("sizes") || "100vw"; emptyImg.src = "img/studio/home-1x-empty.jpg";
    homeWin.appendChild(emptyImg);
    var setEmpty = function (on) { homeWin.classList.toggle("is-empty", on); };
    var layer = document.createElement("div");
    layer.className = "cflight"; layer.setAttribute("aria-hidden", "true");
    var fl = [];
    $$(".fc", heroEl).forEach(function (c) {
      var im = $(".fi img", c), m = im && /(?:card-|crew\/hero\/)([a-z]+)\.webp/.exec(im.getAttribute("src") || "");
      if (!m || !BOX[m[1]]) return;
      var d = parseFloat(c.style.getPropertyValue("--d")) || 1;
      var box = document.createElement("div"); box.className = "cf";
      var card = new Image(); card.className = "cf-card"; card.alt = ""; card.decoding = "async"; card.src = im.getAttribute("src");
      var cut = new Image(); cut.className = "cf-cut"; cut.alt = ""; cut.decoding = "async"; cut.src = "assets/crew/land/" + m[1] + ".webp";
      card.style.opacity = (.6 + d * .4).toFixed(2);
      box.appendChild(card); box.appendChild(cut); layer.appendChild(box);
      fl.push({ c: c, fi: $(".fi", c), box: box, card: card, cut: cut, b: BOX[m[1]], base: .6 + d * .4, sw: 0, tw: 0 });
    });
    // ripple from the middle outwards: Rasan first
    fl.slice().sort(function (a, b) { return Math.abs(a.b[0] + a.b[2] / 2 - 50) - Math.abs(b.b[0] + b.b[2] / 2 - 50); })
      .forEach(function (f, i) { f.k = Math.floor((i + 1) / 2); });
    document.body.appendChild(layer);
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
    var flight = addScene({
      el: homeWin, pin: true,
      // 0..1 while the screenshot rises into its resting place; at 1 every cut-out sits exactly on its painted-out spot,
      // so the flyers give way to the screenshot's own crew in one frame
      progress: function (r, vh) { return clamp((vh - r.top) / (vh * .75), 0, 1); },
      render: function (q) {
        var vq = q, re = ease(vq);
        // the window's rise and the flight share one progress value, so the crew and the screenshot never drift apart
        homeWin.style.transform = "translate3d(0," + ((1 - re) * 64).toFixed(1) + "px,0) scale(" + (.93 + .07 * re).toFixed(3) + ")";
        setAway(vq > 0);
        // every cut-out has arrived by 0.86; from 0.9 the screenshot's own crew takes over in a single frame
        if (vq <= 0 || vq >= .9) { setShown(false); setEmpty(false); return; }
        setShown(true); setEmpty(true);
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
      reset: function () { setShown(false); setEmpty(false); setAway(false); homeWin.style.transform = ""; }
    });

    // inside the window: once the crew are home, scrolling the page scrolls Home itself, the prompt rising away and the
    // films coming up as cards, as in the app
    var track = homeWin.parentElement, hs = $(".home-scroll", homeWin);
    if (track && track.classList.contains("home-track") && hs) {
      var layA = $(".hs-home", hs), layB = $(".hs-films", hs);
      var smooth = inOut, out = function (t) { return 1 - Math.pow(1 - t, 2.2); };
      addScene({
        el: track, pin: true,
        progress: function (r, vh) {
          var stick = parseFloat(getComputedStyle(homeWin).top) || 0, run = r.height - homeWin.offsetHeight;
          return run > 0 ? clamp((stick - r.top) / run, 0, 1) : 0;
        },
        render: function (p) {
          // the app's own move: the prompt (and the crew on it) fades out fast while rising a little; the films workspace,
          // peeking at the bottom, travels up into place and fades to full
          hs.style.opacity = p > 0 ? "1" : "0";
          var a = out(seg(p, .05, .35)), b = smooth(seg(p, .1, .85));
          layA.style.opacity = (1 - a).toFixed(3);
          layA.style.visibility = a >= 1 ? "hidden" : "";
          layA.style.transform = "translate3d(0," + (-a * 2.4).toFixed(3) + "%,0)";
          layB.style.opacity = (.32 + .68 * b).toFixed(3);
          layB.style.transform = "translate3d(0," + ((1 - b) * 63.1).toFixed(3) + "%,0)";
        },
        reset: function () { hs.style.opacity = "0"; layA.style.cssText = ""; layB.style.cssText = ""; }
      });
    }
  }

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
