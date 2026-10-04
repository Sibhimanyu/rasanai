(function () {
  "use strict";
  var menu = document.querySelector(".menu-toggle");
  var nav = document.querySelector(".home .nav");
  if (menu && nav) {
    document.body.classList.add("nav-enabled");
    menu.hidden = false;
    function closeMenu() { menu.setAttribute("aria-expanded", "false"); nav.removeAttribute("data-open"); }
    menu.addEventListener("click", function () {
      var open = menu.getAttribute("aria-expanded") !== "true";
      menu.setAttribute("aria-expanded", String(open));
      nav.setAttribute("data-open", String(open));
    });
    nav.querySelectorAll("a").forEach(function (a) { a.addEventListener("click", closeMenu); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && menu.getAttribute("aria-expanded") === "true") { closeMenu(); menu.focus(); }
    });
    document.addEventListener("click", function (e) { if (!nav.contains(e.target)) closeMenu(); });
    window.matchMedia("(min-width: 621px)").addEventListener("change", closeMenu);
  }
  var controls = document.querySelector(".flow-controls");
  var tabs = Array.from(document.querySelectorAll("[data-flow-tab]"));
  var panels = Array.from(document.querySelectorAll("[data-flow-panel]"));
  if (controls && tabs.length && panels.length === tabs.length) {
    controls.setAttribute("role", "tablist");
    tabs.forEach(function (tab) {
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-controls", "flow-panel-" + tab.dataset.flowTab);
    });
    panels.forEach(function (panel) {
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("aria-labelledby", "flow-tab-" + panel.dataset.flowPanel);
      panel.tabIndex = 0;
    });
    function choose(index, focus) {
      tabs.forEach(function (tab, i) { tab.setAttribute("aria-selected", String(index === i)); tab.tabIndex = index === i ? 0 : -1; });
      panels.forEach(function (panel, i) { panel.hidden = index !== i; });
      if (focus) tabs[index].focus();
    }
    tabs.forEach(function (tab, index) {
      tab.addEventListener("click", function () { choose(index, false); });
      tab.addEventListener("keydown", function (e) {
        var next = index;
        if (e.key === "ArrowRight") next = (index + 1) % tabs.length;
        else if (e.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
        else if (e.key === "Home") next = 0;
        else if (e.key === "End") next = tabs.length - 1;
        else return;
        e.preventDefault(); choose(next, true);
      });
    });
    choose(0, false);
    document.body.classList.add("interactive-flow");
  }
  // Preserve old incoming deep links after moving the technical sections.
  var moved = ["different", "desk", "brand", "stack", "crew", "depth", "engine", "models", "songs", "reels", "library"];
  function routeMovedSection() {
    if (moved.indexOf(location.hash.slice(1)) !== -1) location.replace("guide.html" + location.hash);
  }
  routeMovedSection();
  window.addEventListener("hashchange", routeMovedSection);
})();
