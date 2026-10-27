/* Original source example, NOT executed. Profile P08 diagram/data. The ambiguous condition "managers and employees with 7+ years"
 * is shown as exact set membership: 8 synthetic people placed by real membership in two sets. Two interpretations are computed
 * from the same sets (union vs intersection) and the count line proves no person is lost ("N of 8"). Conceptual layout, so no
 * numeric bars. The headline can be hidden; the overlap/separation explains the ambiguity. */
var G = (typeof require === "function") ? require("../../../runtime/medium-graphic.js") : RasanMediumGraphic;
var content = {
  mode: "sets", logical: { w: 1920, h: 1080 }, at: 0.3, step: 0.12,
  universe: [
    { id: "p1", short: "P1" }, { id: "p2", short: "P2" }, { id: "p3", short: "P3" }, { id: "p4", short: "P4" },
    { id: "p5", short: "P5" }, { id: "p6", short: "P6" }, { id: "p7", short: "P7" }, { id: "p8", short: "P8" }
  ],
  sets: [
    { id: "mgr", label: "Managers", members: ["p1", "p2", "p3", "p4"] },
    { id: "sen", label: "Employees with 7+ years", members: ["p3", "p4", "p5", "p6"] }
  ],
  interpretations: [
    { id: "either", label: "Managers OR 7+ years", op: "union", at: 2.4 },
    { id: "both", label: "Managers WITH 7+ years", op: "intersection", at: 4.0 }
  ]
};
module.exports = { content: content, mount: function (root, deps) {
  return G.createEvidenceDiagramScene({ root: root, width: 1920, height: 1080, seed: "diag-pos-1", design: deps && deps.design, content: content });
} };
