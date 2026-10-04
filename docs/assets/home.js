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
      var max = row.scrollWidth - row.clientWidth - 2;
      btns[0].disabled = row.scrollLeft <= 2;
      btns[1].disabled = row.scrollLeft >= max;
    };
    btns.forEach(function (b) {
      b.addEventListener("click", function () {
        var card = row.querySelector(".cx");
        var step = card ? card.getBoundingClientRect().width + 22 : 400;
        row.scrollBy({ left: Number(b.dataset.calls) * step, behavior: reduce ? "auto" : "smooth" });
      });
    });
    row.addEventListener("scroll", function () { window.requestAnimationFrame(update); }, { passive: true });
    window.addEventListener("resize", update);
    update();
  }

  // A soft settle on the hero window: it grows into place as you scroll
  var win = document.querySelector("[data-parallax]");
  if (win && !reduce) {
    var ticking = false;
    var frame = function () {
      ticking = false;
      var y = Math.min(window.scrollY, 500);
      var k = y / 500;
      win.style.transform = "translateY(" + (-k * 24).toFixed(1) + "px) scale(" + (0.96 + k * 0.04).toFixed(4) + ")";
    };
    win.style.transform = "scale(.96)";
    window.addEventListener("scroll", function () { if (!ticking) { ticking = true; window.requestAnimationFrame(frame); } }, { passive: true });
    frame();
  }

  // Quiet reveal for section content
  if (!reduce && "IntersectionObserver" in window) {
    var targets = Array.from(document.querySelectorAll(".home .head, .home .split-copy, .home .split .window, .home .quad li, .home .center > *, .home .dl-grid > div, .home .visual-grid figure"));
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    document.documentElement.classList.add("js-reveal");
    targets.forEach(function (t) { t.classList.add("reveal"); io.observe(t); });
  }

  // Old deep links into the technical sections now live in the field guide.
  var moved = ["different", "desk", "stack", "crew", "depth", "engine", "models", "songs", "library"];
  function route() { if (moved.indexOf(location.hash.slice(1)) !== -1) location.replace("guide.html" + location.hash); }
  route();
  window.addEventListener("hashchange", route);
})();
