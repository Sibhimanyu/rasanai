/* Original source example, NOT executed. Profile P02 line-art. A hand-built path leaves an object, branches deliberately at
 * half length, and a point lights where it arrives; the supporting label follows the line, not the reverse. Construction
 * (guide) lines are dashed and faint until the real stroke completes over them. The relationship (draft -> review ->
 * approved copy) is supported by the content, so the connector is declared supported. */
var G = (typeof require === "function") ? require("../../../runtime/medium-graphic.js") : RasanMediumGraphic;
var content = {
  logical: { w: 1920, h: 1080 },
  paths: [
    { id: "main", kind: "main", d: "M240 640 C560 640 640 420 960 420 L1500 420", at: 0.3, dur: 1.6, width: 8, guide: true },
    { id: "branch", kind: "branch", branchOf: "main", leaveAt: 0.55, d: "M960 420 C1100 420 1180 700 1500 700", dur: 1.1, width: 6 },
    { id: "link", kind: "connector", claim: "supported", d: "M1500 420 L1500 700", at: 3.0, dur: 0.5, width: 4 }
  ],
  points: [{ id: "draft", on: "main", along: 0 }, { id: "approved", on: "main", along: 1, r: 18 }, { id: "alt", on: "branch", along: 1 }],
  labels: [{ id: "l1", after: "main", x: 1380, y: 380, text: "reviewed" }, { id: "l2", after: "branch", x: 1380, y: 760, text: "needs a second look" }]
};
module.exports = { content: content, mount: function (root, deps) {
  return G.createLineDrawingScene({ root: root, width: 1920, height: 1080, seed: "line-pos-1", design: deps && deps.design, content: content });
} };
