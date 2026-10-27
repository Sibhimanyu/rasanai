/* Original source example, NOT executed, no render. Profile P01 flat-vector. Mechanism: three distinct source objects
 * (a circle, a square, a wedge) each hand off along a route and lock into ONE structure; the geometry is the
 * explanation (parts become a whole). Identity is preserved: each object keeps its group id from start to lock.
 * Headings can be hidden: the event is complete without text. Caption is optional and separate. */
var G = (typeof require === "function") ? require("../../../runtime/medium-graphic.js") : RasanMediumGraphic;
var content = {
  logical: { w: 1920, h: 1080 },
  objects: [
    { id: "circle", shape: { kind: "circle", r: 90 }, fill: "#e4572e", x: 300, y: 300,
      route: { d: "M300 300 C700 180 900 520 960 640", at: 0.4, dur: 1.2, ease: "inOut" } },
    { id: "square", shape: { kind: "rect", w: 170, h: 170 }, fill: "#2e86ab", x: 1620, y: 280,
      route: { d: "M1620 280 C1400 160 1100 560 1040 640", at: 0.7, dur: 1.2, ease: "inOut", orient: true } },
    { id: "wedge", shape: { kind: "poly", pts: [[-110, 90], [110, 90], [0, -100]] }, fill: "#f2b134", x: 960, y: 980,
      route: { d: "M960 980 L960 740", at: 1.0, dur: 0.9, ease: "out" },
      split: { at: 2.6, dur: 0.5, gap: 60, recombineAt: 3.4, recombineDur: 0.5, axis: "vertical" } }
  ],
  caption: { text: "Three parts, one shape.", x: 960, y: 1020, size: 34, at: 3.9, dur: 0.3 }
};
module.exports = { content: content, mount: function (root, deps) {
  return G.createFlatVectorScene({ root: root, width: 1920, height: 1080, seed: "flat-pos-1", design: deps && deps.design, content: content });
} };
