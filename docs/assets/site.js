// RasanAI site: live motion-language swatch films (engine.js + film.js),
// the opening-title input, pause motion, copy buttons. Vanilla, no build step.
(function () {
  "use strict";
  var P = window.RASA_PERSONALITIES || {};
  var ready = typeof window.gsap !== "undefined" && window.MD && window.FILM;
  var reduceQ = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  var paused = !!reduceQ.matches;
  var cells = [];

  function sync(c) {
    if (!c.tl) return;
    if (c.el.clientWidth && Math.abs(c.el.clientWidth - c.w) > 2) { build(c); return; }
    if (paused || !c.visible) {
      c.tl.pause();
      if (paused && c.phases) c.tl.seek(c.phases.hold);
    } else if (c.tl.paused()) c.tl.play();
  }
  function build(c) {
    var p = P[c.el.getAttribute("data-personality")];
    if (!p) return;
    if (c.tl) c.tl.kill();
    var tl = gsap.timeline({ paused: true });
    c.phases = window.FILM.build(tl, c.el, p);
    tl.repeat(-1).repeatDelay(0.7);
    c.tl = tl;
    c.w = c.el.clientWidth;
    sync(c);
  }
  function initCells() {
    var io = "IntersectionObserver" in window ? new IntersectionObserver(function (es) {
      es.forEach(function (e) { var c = e.target.__cell; if (c) { c.visible = e.isIntersecting; sync(c); } });
    }, { rootMargin: "120px 0px" }) : null;
    [].forEach.call(document.querySelectorAll(".md-cell[data-film]"), function (el) {
      var c = { el: el, visible: !io };
      el.__cell = c;
      cells.push(c);
      build(c);
      if (io) io.observe(el);
    });
    var t;
    window.addEventListener("resize", function () { clearTimeout(t); t = setTimeout(function () { cells.forEach(function (c) { if (Math.abs(c.el.clientWidth - c.w) > 2) build(c); }); }, 180); });
  }
  function initTry() {
    var input = document.getElementById("try-input");
    if (!input) return;
    var t;
    input.addEventListener("input", function () {
      clearTimeout(t);
      t = setTimeout(function () {
        var v = input.value.replace(/\s+/g, " ").trim() || "RasanAI";
        cells.forEach(function (c) { if (c.el.hasAttribute("data-try")) { c.el.setAttribute("data-content", v); build(c); } });
      }, 220);
    });
  }
  function initToggle() {
    var b = document.querySelector("[data-motion-toggle]");
    if (!b) return;
    function label() { b.textContent = paused ? "Play motion" : "Pause motion"; b.setAttribute("aria-pressed", String(paused)); }
    label();
    b.addEventListener("click", function () { paused = !paused; label(); cells.forEach(sync); });
  }
  function initCopy() {
    [].forEach.call(document.querySelectorAll("[data-copy]"), function (btn) {
      btn.addEventListener("click", function () {
        var text = btn.getAttribute("data-copy");
        var status = document.getElementById("copy-status");
        if (!status) { status = document.createElement("p"); status.id = "copy-status"; status.className = "copy-feedback"; status.setAttribute("role", "status"); document.body.appendChild(status); }
        var done = function () { status.textContent = "Copied to clipboard."; btn.classList.add("done"); setTimeout(function () { btn.classList.remove("done"); status.textContent = ""; }, 1800); };
        var failed = function () { status.textContent = "Clipboard unavailable. Select and copy the command manually."; };
        var fallback = function () {
          var field = document.createElement("textarea"); field.value = text; field.className = "copy-buffer";
          field.setAttribute("readonly", ""); document.body.appendChild(field); field.select();
          var copied = false; try { copied = document.execCommand("copy"); } catch (e) { copied = false; }
          field.remove(); btn.focus(); if (copied) done(); else failed();
        };
        if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
      });
    });
  }
  if (ready) { initCells(); initTry(); }
  initToggle();
  initCopy();
})();

// style library: assets/presets.json (every preset) drawn live by assets/presets.js,
// each card linking its DESIGN.md from systems/
(function () {
  var grid = document.getElementById("lib-grid");
  if (!grid || !window.RasaPresets) return;
  var words = document.getElementById("lib-words"), search = document.getElementById("lib-search"), famsEl = document.getElementById("lib-fams"), countEl = document.getElementById("lib-count");
  var data = null, fam = "all", cards = [], all = false;
  // the unfiltered library opens on a few rows; search, a family or "Show all" reveal the rest
  var preview = matchMedia("(max-width: 700px)").matches ? 6 : 12;
  var more = document.getElementById("lib-more");
  document.head.insertAdjacentHTML("beforeend", "<style>" + RasaPresets.css + "</style>");
  if (window.RasaPresets3D) RasaPresets3D.base = "assets/three/";
  function fit(c) { var st = c._spec.firstChild; if (st) st.style.transform = "scale(" + (c._spec.clientWidth / 1600) + ")"; }
  function paint(c) {
    var tmp = document.createElement("div");
    var o = { headline: words.value || "Tax season. Again.", sub: "Every receipt, booked in one tap." };
    tmp.innerHTML = RasaPresets.render(c._p, o);
    if (c._h3 && c._h3.destroy) c._h3.destroy();
    c._h3 = null;
    c._spec.innerHTML = ""; c._spec.appendChild(tmp.firstChild); fit(c); c._painted = true;
    // the 3D family is drawn live by Rasan3D (assets/presets3d.js); the CSS specimen stays if it can't
    if (window.RasaPresets3D && RasaPresets3D.has(c._p)) { try { c._h3 = RasaPresets3D.mount(c._spec.firstChild, c._p, o); } catch (e) { c._h3 = null; } }
  }
  var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting && !e.target._painted) paint(e.target); }); }, { rootMargin: "400px" });
  function apply() {
    var q = (search.value || "").toLowerCase(), n = 0, capped = fam === "all" && !q && !all;
    cards.forEach(function (c) {
      var p = c._p, hay = [p.name, p.what, (p.aka || []).join(" "), (p.feels || []).join(" "), (p.use || []).join(" "), p.family].join(" ").toLowerCase();
      var show = (fam === "all" || p.family === fam) && (!q || hay.indexOf(q) > -1) && (!capped || n < preview);
      c.style.display = show ? "" : "none"; if (show) n++;
    });
    countEl.textContent = n + " of " + data.presets.length + " styles";
    more.hidden = !capped; more.textContent = "Show all " + data.presets.length + " styles";
    [].forEach.call(famsEl.children, function (b) { b.classList.toggle("on", b._fam === fam); });
  }
  // every style is also a complete DESIGN.md in systems/ (index: [{id, name, family, file}]); link only files that exist
  var systems = fetch("systems/index.json").then(function (r) { return r.ok ? r.json() : null; }).then(function (list) {
    if (!Array.isArray(list)) return null;
    var m = {}; list.forEach(function (s) { if (s && s.id) m[s.id] = s.file || s.id + ".md"; }); return m;
  }).catch(function () { return null; });
  function dl(p, file) {
    var a = document.createElement("a"); a.className = "lib-dl";
    a.href = "systems/" + file; a.setAttribute("download", file);
    a.setAttribute("aria-label", "Download " + p.name + " as a DESIGN.md");
    a.innerHTML = '<svg aria-hidden="true"><use href="#i-down"/></svg>DESIGN.md';
    a.addEventListener("click", function (e) { e.stopPropagation(); });
    return a;
  }
  Promise.all([fetch("assets/presets.json").then(function (r) { return r.json(); }), systems]).then(function (res) {
    var d = res[0], files = res[1];
    data = d;
    RasaPresets.loadFonts(d.presets);
    [{ id: "all", name: "All" }].concat(d.families).forEach(function (f) {
      var b = document.createElement("button"); b.type = "button"; b.textContent = f.name; b._fam = f.id;
      b.addEventListener("click", function () { fam = f.id; apply(); }); famsEl.appendChild(b);
    });
    d.presets.forEach(function (p) {
      var c = document.createElement("div"); c.className = "lib-card"; c._p = p;
      c._spec = document.createElement("div"); c._spec.className = "spec"; c.appendChild(c._spec);
      var b = document.createElement("b"); b.textContent = p.name; c.appendChild(b);
      var sm = document.createElement("small"); sm.textContent = (d.families.filter(function (f) { return f.id === p.family; })[0] || {}).name || p.family; c.appendChild(sm);
      var pr = document.createElement("p"); pr.textContent = p.what; c.appendChild(pr);
      var file = files ? files[p.id] : p.id + ".md";
      if (file) c.appendChild(dl(p, file));
      function play() { var st = c._spec.firstChild; if (!st) return; st.classList.remove("play"); void st.offsetWidth; st.classList.add("play"); if (c._h3 && c._h3.play) c._h3.play(); }
      c.addEventListener("mouseenter", play); c.addEventListener("click", play);
      grid.appendChild(c); cards.push(c); io.observe(c);
    });
    apply();
    var t; words.addEventListener("input", function () { clearTimeout(t); t = setTimeout(function () { cards.forEach(function (c) { if (c._painted) paint(c); }); }, 250); });
    search.addEventListener("input", apply);
    more.addEventListener("click", function () { all = true; apply(); });
    window.addEventListener("resize", function () { cards.forEach(fit); });
  }).catch(function () { countEl.textContent = "The style library could not load."; });
})();
