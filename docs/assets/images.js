// Keep text and controls usable while artwork loads. Decorative groups arrive together.
// The loading sequence:
//   1. the hero's artwork loads first (eager in the HTML), as one group;
//   2. anything near the viewport starts as it comes within 600px;
//   3. once the page has loaded, every other image is queued in page order, two at a time, so the scroll scenes further
//      down (whose pictures sit off-screen, moved by transforms, where "near the viewport" never triggers) are ready
//      before the reader gets there;
//   4. an image that fails is retried (after 1.5 s, then 4 s, then whenever the connection comes back), and until it
//      arrives it stays invisible: never a broken-image icon. A window waiting for its screenshot shows a soft shimmer.
(function () {
  "use strict";
  document.documentElement.classList.add("images-js");

  var RETRY = [1500, 4000];

  function prepare(img, grouped) {
    if (img._prep) return img._prep;
    img._prep = new Promise(function (resolve) {
      var settled = false, decoding = false, tries = 0;
      // A stalled decorative asset must not hold the rest of its group forever.
      var timeout = grouped ? setTimeout(function () { finish(false); }, 8000) : null;
      function finish(ok) {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        img.removeAttribute("data-image-wait");
        img.setAttribute(ok ? "data-image-ready" : "data-image-error", "");
        if (ok) img.removeAttribute("data-image-error");
        resolve();
      }
      function failed() {
        decoding = false;
        // try again with the same address (a transient network error), then on the connection coming back
        if (tries < RETRY.length) {
          var wait = RETRY[tries++];
          setTimeout(function () { reload(); }, wait);
        } else {
          // give up for now: the group (or the queue) moves on, and the image stays invisible until it does arrive
          if (grouped) finish(false); else { img.setAttribute("data-image-error", ""); resolve(); }
          window.addEventListener("online", function again() { window.removeEventListener("online", again); tries = 0; reload(); });
        }
      }
      function reload() {
        // a fresh address, so the browser does not hand back the failed response; the plain src is enough for a retry
        var src = (img.getAttribute("src") || "").replace(/[?&]retry=\d+$/, "");
        img.setAttribute("data-image-wait", "");
        img.removeAttribute("srcset");
        img.src = src + (src.indexOf("?") < 0 ? "?" : "&") + "retry=" + (tries + 1);
      }
      function loaded() {
        if (settled || decoding) return;
        decoding = true;
        if (!img.naturalWidth) { failed(); return; }
        if (img.decode) {
          img.decode().then(function () { finish(true); }, function () { finish(true); });
          setTimeout(function () { finish(true); }, 1000);
        } else { finish(true); }
      }
      img.addEventListener("load", loaded);
      img.addEventListener("error", failed);
      img.setAttribute("data-image-wait", "");
      // Hero assets are eager in the HTML. Lazy images are prepared near the viewport, or by the queue.
      img.loading = "eager";
      if (img.complete) { if (img.naturalWidth) loaded(); else if (img.getAttribute("src")) failed(); }
    });
    return img._prep;
  }

  document.addEventListener("DOMContentLoaded", function () {
    var started = new Set();
    function start(el) {
      if (started.has(el)) return Promise.resolve();
      started.add(el);
      if (el.hasAttribute("data-image-group")) {
        return Promise.all(Array.from(el.querySelectorAll("img"), function (img) { return prepare(img, true); }))
          .then(function () { el.setAttribute("data-images-ready", ""); });
      }
      return prepare(el, false);
    }
    var observer = "IntersectionObserver" in window ? new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        start(entry.target);
      });
    }, { rootMargin: "600px 0px" }) : null;

    var all = [];
    document.querySelectorAll("[data-image-group], img[loading]").forEach(function (el) {
      if (el.tagName === "IMG" && el.closest("[data-image-group]")) return;
      all.push(el);
      if (observer && el.getAttribute("loading") !== "eager" && !el.closest(".hero")) observer.observe(el);
      else start(el);
    });

    // the rest, in page order, two at a time, once the page itself has loaded
    function drain() {
      var queue = all.filter(function (el) { return !started.has(el); }), running = 0;
      function next() {
        while (running < 2 && queue.length) {
          var el = queue.shift();
          if (started.has(el)) continue;
          running++;
          // a slot is freed when its image settles, or after 6 s at most, so one slow image never holds the queue
          (function (p) {
            var done = false, free = function () { if (done) return; done = true; running--; next(); };
            p.then(free); setTimeout(free, 6000);
          })(start(el));
        }
      }
      next();
    }
    // after the page has loaded, or after 2.5 s if it is still waiting on something slow
    var drained = false, go = function () { if (drained) return; drained = true; drain(); };
    if (document.readyState === "complete") setTimeout(go, 200);
    else { window.addEventListener("load", function () { setTimeout(go, 200); }, { once: true }); setTimeout(go, 2500); }
  });
})();
