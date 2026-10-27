// RasanAI: how it works. The seven-step tabs, copy buttons and the small-screen menu. Vanilla, no build step.
(function () {
  "use strict";
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };

  /* ---------- a film's life: the app's own dot stepper as tabs ---------- */
  var tabs = $$("[data-stepper] [role=tab]");
  var prev = document.querySelector('.life-nav [data-step="-1"]');
  var next = document.querySelector('.life-nav [data-step="1"]');
  var current = 0;
  function select(i, focus) {
    if (i < 0 || i >= tabs.length) return;
    current = i;
    tabs.forEach(function (t, k) {
      var on = k === i;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      t.classList.toggle("done", k < i);
      var panel = document.getElementById(t.getAttribute("aria-controls"));
      panel.hidden = !on;
      panel.classList.toggle("on", on);
    });
    if (focus) tabs[i].focus();
    if (prev) prev.disabled = i === 0;
    if (next) next.disabled = i === tabs.length - 1;
  }
  tabs.forEach(function (t, i) {
    t.addEventListener("click", function () { select(i); });
    t.addEventListener("keydown", function (e) {
      var k = e.key, to = null;
      if (k === "ArrowRight") to = (i + 1) % tabs.length;
      else if (k === "ArrowLeft") to = (i - 1 + tabs.length) % tabs.length;
      else if (k === "Home") to = 0;
      else if (k === "End") to = tabs.length - 1;
      if (to !== null) { e.preventDefault(); select(to, true); }
    });
  });
  function step(d) {
    select(current + d);
    var life = document.getElementById("life");
    if (life && life.getBoundingClientRect().top < -40) life.scrollIntoView({ block: "start" });
  }
  if (prev) prev.addEventListener("click", function () { step(-1); });
  if (next) next.addEventListener("click", function () { step(1); });
  if (tabs.length) select(0);

  /* ---------- copy buttons ---------- */
  var status = document.getElementById("copy-status");
  $$("[data-copy]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var text = btn.getAttribute("data-copy");
      var done = function () {
        btn.classList.add("done");
        if (status) status.textContent = "Copied: " + text;
        setTimeout(function () { btn.classList.remove("done"); }, 1400);
      };
      var fail = function () { if (status) status.textContent = "Clipboard unavailable. Select and copy the command manually."; };
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fail);
      else fail();
    });
  });

  /* ---------- small-screen menu ---------- */
  var nav = document.querySelector(".nav");
  var menu = document.querySelector(".menu-toggle");
  if (nav && menu) {
    menu.hidden = false;
    var close = function () { menu.setAttribute("aria-expanded", "false"); nav.setAttribute("data-open", "false"); };
    menu.addEventListener("click", function () {
      var open = menu.getAttribute("aria-expanded") !== "true";
      menu.setAttribute("aria-expanded", String(open)); nav.setAttribute("data-open", String(open));
    });
    $$(".nav-links a", nav).forEach(function (a) { a.addEventListener("click", close); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
  }

  /* ---------- the nav marks the section you are reading ---------- */
  var links = $$(".nav-links a[href^='#']");
  if ("IntersectionObserver" in window && links.length) {
    var byId = {};
    links.forEach(function (a) { byId[a.getAttribute("href").slice(1)] = a; });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        links.forEach(function (a) { a.removeAttribute("aria-current"); });
        if (byId[en.target.id]) byId[en.target.id].setAttribute("aria-current", "true");
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    Object.keys(byId).forEach(function (id) { var el = document.getElementById(id); if (el) io.observe(el); });
  }
})();
