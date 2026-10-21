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
  // old anchors: technical sections moved to the field guide; homepage sections removed in the redesign point to their new home
  // only these names are routed. Current anchors (#flow, #projects, #questions, #download) are never listed, so they are never redirected
  var aliases = {
    different: "guide.html#different", desk: "guide.html#desk", stack: "guide.html#stack", crew: "guide.html#crew",
    depth: "guide.html#depth", engine: "guide.html#engine", models: "guide.html#models", songs: "guide.html#songs", library: "guide.html#library",
    reels: "guide.html#reels", presenter: "guide.html#presenter", install: "guide.html#install",
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
  function addScene(sc) { scenes.push(sc); return sc; }
  var pinnedMode = { motion: false };

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
    // percentages of the cropped 1814x1190 screenshot (y and height rescaled from the old 1480-high crop)
    var BOX = { tara: [20.066, 52.5, 7.189, 10.167], kavi: [27.354, 43.839, 7.436, 18.866], chitra: [34.74, 42.445, 8.473, 20.184], ra: [43.04, 41.429, 12.055, 21.201], laya: [55.096, 41.918, 7.633, 18.188], rasika: [61.691, 53.442, 9.387, 9.188], mala: [71.079, 48.357, 8.745, 14.347] };
    var RIM = 61.513, STAG = .06;
    // while the crew fly in, the screenshot shows its prompt with the crew painted out, so no one lands on top of themselves
    var emptyImg = new Image(); emptyImg.className = "shot-empty"; emptyImg.alt = ""; emptyImg.setAttribute("aria-hidden", "true"); emptyImg.decoding = "async";
    emptyImg.srcset = "img/studio/home-1x-empty.jpg 907w, img/studio/home-2x-empty.jpg 1814w"; emptyImg.sizes = homeImg.getAttribute("sizes") || "100vw"; emptyImg.src = "img/studio/home-1x-empty.jpg";
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
        // Keep the original artwork until every flight asset and the screenshot are ready.
        if (!layer.hasAttribute("data-images-ready") || !homeImg.hasAttribute("data-image-ready") || !emptyImg.complete || !emptyImg.naturalWidth) {
          setShown(false); setEmpty(false); setAway(false); return;
        }
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

  }

  /* ---------- the loop: rAF only while something is moving ---------- */
  var raf = 0, vh = window.innerHeight;
  function tick() {
    raf = 0;
    if (!pinnedMode.motion) return;
    var rects = scenes.map(function (s) { return s.el.getBoundingClientRect(); });
    var more = false;
    scenes.forEach(function (s, i) {
      if (s.pin && !pinned()) return;   // pinned scenes only run in the sticky desktop layout
      var r = rects[i], near = r.bottom > -vh * .5 && r.top < vh * 1.5;
      var target = s.progress(r, vh);
      // direct scenes follow the scroll position exactly, so reversing scroll retraces the same frames
      if (s.direct) { if (s.last !== target) { s.render(target); s.last = target; } return; }
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
  window.addEventListener("resize", function () { vh = window.innerHeight; clearCrew(); enableCrew(); request(); }, { passive: true });

  /* ---------- calm mode and the layout switch: rest in the finished state, or let the scroll drive it ---------- */
  function apply() {
    var calmNow = calm(), pin = pinned();
    pinnedMode.motion = !calmNow;
    scenes.forEach(function (s) { s.cur = undefined; s.last = undefined; if (s.reset && (!s.pin || !pin)) s.reset(); });
    clearCrew();
    if (calmNow) return;
    if (pin) enableCrew();
    request();
  }
  reduceQ.addEventListener("change", function () { setTimeout(apply, 0); });
  wideQ.addEventListener("change", function () { setTimeout(apply, 0); });

  /* ---------- crew scene: Rasan stands at the centre, six teammates fly in from the edges onto one orbit, the circle breaks into a
     balanced edge scatter, and the statement reveals word by word. Every frame is a pure function of the scroll position p (0..1 through
     the pinned track), so scrolling back retraces it exactly. Only transform, opacity and clip-path are driven, by inline styles.
     Contract: each .crew-node sits untransformed at the stage centre (the JS moves it with an inline translate); .statement-word is inline-block.
     Stacked (narrow screen, reduced motion, or markup missing): nothing is pinned, and no inline style, class or attribute is left behind. */
  var crewScene = $("[data-crew-scene]");
  var CREW = ["ra", "mala", "tara", "kavi", "chitra", "laya", "rasika"];   // Rasan, then the six teammates in orbit order
  var CREW_FROM = [[1.3, -1], [-1.35, -.2], [.1, 1.35], [1.35, .35], [-1.2, -1], [1.1, 1.2]];   // each teammate's entry edge, in half-stage units
  var CREW_SCATTER = [[0, -.92], [.82, -.5], [-.82, -.5], [.9, .3], [-.9, .3], [.5, .9], [-.5, .9]];   // balanced edge scatter, half-stage units
  var CREW_STEP = .06, CREW_ENTER = .2;   // teammate i flies in over [i * step, i * step + enter]: the last one settles at .5
  var mix = function (a, b, t) { return a + (b - a) * t; };
  var crewOn = false, crewGeo = null, crewRun = null;

  // the markup contract: anything missing or out of order turns the scene off, and the page stays a plain stack
  function crewSpec() {
    var nodes = $$(".crew-node[data-crew]", crewScene);
    var s = {
      nodes: nodes, stage: $(".crew-stage", crewScene), orbit: $(".crew-orbit", crewScene), line: $(".crew-orbit-line", crewScene),
      payoff: $(".crew-payoff", crewScene), statement: $(".crew-statement", crewScene), words: $$(".statement-word", crewScene),
      labels: nodes.map(function (el) { return $(".crew-label", el); })
    };
    var ordered = nodes.length === CREW.length && nodes.every(function (el, i) { return el.getAttribute("data-crew") === CREW[i]; });
    if (!ordered || !s.stage || !s.orbit || !s.line || !s.payoff || !s.statement || !s.words.length) return null;
    // every element the scene may touch, with its own inline style as the page wrote it, so clearing restores it exactly
    s.all = nodes.concat(s.labels.filter(Boolean), [s.line, s.payoff, s.statement], s.words);
    s.style = s.all.map(function (el) { return el.getAttribute("style"); });
    return s;
  }
  var crew = crewScene && crewSpec();

  // leave the pinned layout: drop the class, and put back every inline style the scene touched
  function clearCrew() {
    if (!crew) return;
    crewOn = false;
    if (crewRun) crewRun.last = undefined;
    crewScene.classList.remove("crew-ready");
    if (!crewScene.getAttribute("class")) crewScene.removeAttribute("class");
    crew.all.forEach(function (el, k) { if (crew.style[k] === null) el.removeAttribute("style"); else el.setAttribute("style", crew.style[k]); });
  }

  // wide desktop with motion allowed (the page sets .pin for exactly that): measure once, then the scene drives itself
  function enableCrew() {
    if (!crew || crewOn || !wideQ.matches || !pinned() || calm()) return;
    crewScene.classList.add("crew-ready");
    var W = crew.stage.offsetWidth / 2, H = crew.stage.offsetHeight / 2;
    if (!W || !H) { clearCrew(); return; }   // no size yet: stay a plain stack
    // the orbit's own diameter sets the circle, so the drawn line and the seven positions agree
    crewGeo = { W: W, H: H, R: crew.orbit.offsetWidth / 2 || Math.min(W, H) * .6 };
    crewOn = true;
  }

  function renderCrew(p) {
    if (!crewOn) return;
    var g = crewGeo;
    // the orbit line comes in softly, and leaves with the circle
    crew.line.style.opacity = (seg(p, .2, .5) * (1 - seg(p, .67, .8))).toFixed(3);
    // the payoff holds from .52 to .67, then clears for the statement
    var pIn = seg(p, .44, .52), pOut = seg(p, .66, .71);
    crew.payoff.style.opacity = (pIn * (1 - pOut)).toFixed(3);
    crew.payoff.style.transform = "translate3d(0," + ((1 - pIn) * 16).toFixed(1) + "px,0)";
    crew.nodes.forEach(function (node, k) {
      var st = k ? (k - 1) * CREW_STEP : 0, x = 0, y = 0, s = 1, op = 1;
      if (k) {
        // a teammate: in from its edge onto its fixed orbit slot, growing to size as it lands
        var a = -Math.PI / 2 + (k - 1) * Math.PI / 3, e = ease(seg(p, st, st + CREW_ENTER));
        x = mix(CREW_FROM[k - 1][0] * g.W, g.R * Math.cos(a), e);
        y = mix(CREW_FROM[k - 1][1] * g.H, g.R * Math.sin(a), e);
        s = .7 + .3 * e; op = seg(p, st, st + .06);
      }
      // from .67 each node breaks off the circle, one after another, to its scatter slot
      var q = ease(seg(p, .67 + k * .02, .88 + k * .02));
      x = mix(x, CREW_SCATTER[k][0] * g.W, q); y = mix(y, CREW_SCATTER[k][1] * g.H, q);
      node.style.opacity = op.toFixed(3);
      node.style.transform = "translate3d(" + x.toFixed(2) + "px," + y.toFixed(2) + "px,0) scale(" + s.toFixed(3) + ")";
      // a label becomes readable as its teammate settles; Rasan's is always readable
      if (crew.labels[k]) crew.labels[k].style.opacity = (k ? seg(p, st + .12, st + CREW_ENTER) : 1).toFixed(3);
    });
    // the statement: each word reveals left to right, in order, from .7
    var N = crew.words.length;
    crew.statement.style.opacity = seg(p, .67, .73).toFixed(3);
    crew.words.forEach(function (w, j) {
      var t = seg(p, .7 + j * .22 / N, .8 + j * .22 / N), e = ease(t);
      w.style.opacity = t.toFixed(3);
      w.style.clipPath = t < 1 ? "inset(0 " + ((1 - t) * 100).toFixed(2) + "% 0 0)" : "none";
      w.style.transform = "translate3d(0," + ((1 - e) * .3).toFixed(3) + "em,0)";
    });
  }

  crewRun = crew && addScene({
    el: crewScene, pin: true, direct: true,
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
