// Keep text and controls usable while artwork loads. Decorative groups arrive together.
(function () {
  "use strict";
  document.documentElement.classList.add("images-js");

  function prepare(img, grouped) {
    return new Promise(function (resolve) {
      var settled = false, decoding = false;
      // A stalled decorative asset must not hold the rest of its group forever.
      var timeout = grouped ? setTimeout(function () { finish(false); }, 8000) : null;
      function finish(ok) {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        img.removeEventListener("load", loaded);
        img.removeEventListener("error", failed);
        img.setAttribute(ok ? "data-image-ready" : "data-image-error", "");
        resolve();
      }
      function failed() { finish(false); }
      function loaded() {
        if (settled || decoding) return;
        decoding = true;
        if (!img.naturalWidth) { finish(false); return; }
        if (img.decode) {
          img.decode().then(function () { finish(true); }, function () { finish(false); });
        } else { finish(true); }
      }
      img.addEventListener("load", loaded);
      img.addEventListener("error", failed);
      // Hero assets are eager in the HTML. Lazy images are prepared near the viewport.
      if (grouped) img.loading = "eager";
      if (img.complete) loaded();
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    var observer = "IntersectionObserver" in window ? new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        start(entry.target);
      });
    }, { rootMargin: "600px 0px" }) : null;

    function start(el) {
      if (el.hasAttribute("data-image-group")) {
        Promise.all(Array.from(el.querySelectorAll("img"), function (img) { return prepare(img, true); }))
          .then(function () { el.setAttribute("data-images-ready", ""); });
      } else {
        el.loading = "eager";
        prepare(el, false);
      }
    }
    document.querySelectorAll("[data-image-group], img[loading]").forEach(function (el) {
      if (el.tagName === "IMG" && el.closest("[data-image-group]")) return;
      if (observer && el.getAttribute("loading") !== "eager" && !el.closest(".hero")) observer.observe(el);
      else start(el);
    });
  });
})();
