/* Original source example, NOT executed. Profile P03 paper/collage (original vector-cut paper, named as the no-download
 * fallback; not stop-motion photography). Two alternative readings of one rule are laid out as separate paper strips; every
 * person/condition card stays visible in both. Each strip slides in under a masked reveal; the middle card has a REAL fold
 * (a flap changes the visible plane and mask) and a hinged tag swings from a pivot. Words are crisp SVG text above the paper. */
var P = (typeof require === "function") ? require("../../../runtime/medium-paper.js") : RasanMediumPaper;
function card(id, x, y, label, fill, layer, at) {
  return { id: id, layer: layer, kind: "rect", w: 300, h: 120, x: x, y: y, fill: fill, text: { value: label, dy: 12, size: 34 },
    reveal: { at: at, dur: 0.5, dir: "right" }, edge: { rough: 2.5 } };
}
var content = {
  logical: { w: 1920, h: 1080 }, shadows: true, stepFps: 12,
  pieces: [
    { id: "stripA", layer: 0, kind: "rect", w: 1500, h: 190, x: 960, y: 330, fill: "#ece3cf", reveal: { at: 0.1, dur: 0.6, dir: "left" } },
    { id: "stripB", layer: 0, kind: "rect", w: 1500, h: 190, x: 960, y: 700, fill: "#e0e8ea", reveal: { at: 1.2, dur: 0.6, dir: "left" } },
    card("a1", 500, 330, "Managers", "#e4572e", 1, 0.8),
    card("a2", 900, 330, "Employees 7+ yrs", "#f2b134", 1, 1.0),
    { id: "a3", layer: 1, kind: "rect", w: 300, h: 120, x: 1300, y: 330, fill: "#2e86ab", text: { value: "Both", dy: 12, size: 34 },
      fold: { x: 0, at: 1.9, dur: 0.6, back: "#c9d8de" } },
    card("b1", 500, 700, "Managers", "#e4572e", 1, 1.9),
    card("b2", 900, 700, "Employees 7+ yrs", "#f2b134", 1, 2.1),
    card("b3", 1300, 700, "Anyone else", "#9db38a", 1, 2.3),
    { id: "tag", layer: 2, kind: "rect", w: 160, h: 60, x: 1560, y: 255, fill: "#fff7e0", pivot: { x: -80, y: -30 },
      text: { value: "reading A", size: 24 }, track: [{ t: 2.7, x: 1560, y: 255, rot: 0 }, { t: 3.1, x: 1560, y: 255, rot: 14, ease: "out" }, { t: 3.5, x: 1560, y: 255, rot: -6, ease: "inOut" }] }
  ]
};
module.exports = { content: content, mount: function (root, deps) {
  return P.createPaperCollageScene({ root: root, width: 1920, height: 1080, seed: "paper-pos-1", design: deps && deps.design, content: content });
} };
