/* Original source example, NOT executed. Profile P08 boundary. Bars must come from labeled values with unit, baseline,
 * denominator and a declared source ("measured" or "synthetic"); this one is synthetic and says so on the baseline note.
 * Bars grow from the true baseline 0 to the true value, never from a convenient start. Do NOT use this to imply that a
 * quantity such as confidence or learning rose: that is only true of a measured quantity. Remove `source` or set
 * "conceptual" and the factory throws, so a decorative bar chart cannot be authored. */
var G = (typeof require === "function") ? require("../../../runtime/medium-graphic.js") : RasanMediumGraphic;
var content = {
  mode: "bars", source: "synthetic", unit: "minutes per task", denominator: 12, logical: { w: 1920, h: 1080 },
  at: 0.3, dur: 0.8, transform: { at: 2.6, dur: 0.9 },
  items: [{ id: "x", label: "Task A", value: 18, value2: 11 }, { id: "y", label: "Task B", value: 25, value2: 16 }, { id: "z", label: "Task C", value: 9, value2: 8 }]
};
module.exports = { content: content, claim: "synthetic illustration, not a measurement", mount: function (root, deps) {
  return G.createEvidenceDiagramScene({ root: root, width: 1920, height: 1080, seed: "diag-bnd-1", design: deps && deps.design, content: content });
} };
