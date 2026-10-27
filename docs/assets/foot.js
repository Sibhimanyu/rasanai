// Footer: the skill install tabs (arrow keys move between them) and copy buttons.
(function () {
  "use strict";
  var box = document.querySelector("[data-skill]");
  if (!box) return;
  var tabs = [].slice.call(box.querySelectorAll('[role="tab"]'));
  function select(tab) {
    tabs.forEach(function (t) {
      var on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
    });
  }
  tabs.forEach(function (t, i) {
    t.addEventListener("click", function () { select(t); });
    t.addEventListener("keydown", function (e) {
      var d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      var n = tabs[(i + d + tabs.length) % tabs.length];
      select(n); n.focus();
    });
  });
  [].slice.call(box.querySelectorAll(".skill-copybtn")).forEach(function (b) {
    b.addEventListener("click", function () {
      var text = b.parentNode.querySelector("code").textContent;
      var done = function () { b.textContent = "Copied"; setTimeout(function () { b.textContent = "Copy"; }, 1600); };
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, function () {});
    });
  });
})();
