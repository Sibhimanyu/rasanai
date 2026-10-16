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

  // Old deep links into the technical sections now live in the field guide.
  var moved = ["different", "desk", "stack", "crew", "depth", "engine", "models", "songs", "library"];
  function route() { if (moved.indexOf(location.hash.slice(1)) !== -1) location.replace("guide.html" + location.hash); }
  route();
  window.addEventListener("hashchange", route);

  // One calm reveal per block (opacity and 12 px), once. Skipped for Reduce Motion.
  if (!reduce && "IntersectionObserver" in window) {
    var items = [].slice.call(document.querySelectorAll("main .head, main .split-copy, main .call, main .member, main .quad li, main .visual-grid figure, main .dl-detail, main .mala-note"));
    var below = items.filter(function (e) { return e.getBoundingClientRect().top > window.innerHeight * 0.9; });
    if (below.length) {
      document.documentElement.classList.add("js");
      below.forEach(function (e) { e.classList.add("rv"); });
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
      }, { rootMargin: "0px 0px -8% 0px" });
      below.forEach(function (e) { io.observe(e); });
    }
  }
})();
