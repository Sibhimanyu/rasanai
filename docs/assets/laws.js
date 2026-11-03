/* Motion Laws: play each demonstration once when it scrolls into view, and again on hover or focus.
   With reduced motion nothing is ever played, so every illustration stays on its static frame. */
(function () {
  "use strict";
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");
  var ills = [].slice.call(document.querySelectorAll("[data-ill]"));

  function play(el) {
    if (reduce && reduce.matches) return;
    el.classList.remove("play");
    void el.getBoundingClientRect(); // restart the CSS animations
    el.classList.add("play");
    el._busy = true;
    clearTimeout(el._t);
    el._t = setTimeout(function () { el._busy = false; }, 3200);
  }

  if (!(reduce && reduce.matches)) {
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { play(en.target); io.unobserve(en.target); }
        });
      }, { threshold: 0.5 });
      ills.forEach(function (el) { io.observe(el); });
    } else {
      ills.forEach(play);
    }
    [].slice.call(document.querySelectorAll(".ml-card")).forEach(function (card) {
      var el = card.querySelector("[data-ill]");
      var again = function () { if (!el._busy) play(el); };
      card.addEventListener("pointerenter", again);
      card.addEventListener("focus", again);
    });
  }

  [].slice.call(document.querySelectorAll("[data-replay]")).forEach(function (b) {
    b.addEventListener("click", function () {
      var el = document.querySelector("[data-ill]");
      if (el) play(el);
    });
  });

  /* small-screen menu, same behaviour as the other pages */
  var nav = document.querySelector(".nav");
  var menu = document.querySelector(".menu-toggle");
  if (nav && menu) {
    menu.hidden = false;
    var close = function () { menu.setAttribute("aria-expanded", "false"); nav.setAttribute("data-open", "false"); };
    menu.addEventListener("click", function () {
      var open = menu.getAttribute("aria-expanded") !== "true";
      menu.setAttribute("aria-expanded", String(open));
      nav.setAttribute("data-open", String(open));
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
  }
})();
