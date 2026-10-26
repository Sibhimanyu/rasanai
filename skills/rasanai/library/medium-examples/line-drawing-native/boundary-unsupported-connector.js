/* Original source example, NOT executed. Profile P02 boundary. A connector between two systems must not imply a data flow
 * the product does not have. Here the link is declared "illustrative": it draws dashed (visibly not a real integration) and
 * the factory REJECTS a connector with no claim, so an undeclared "A sends data to B" line cannot be authored by accident.
 * Also: a dense diagram uses progressive disclosure (two groups, staggered) instead of many lines drawing at once. */
var G = (typeof require === "function") ? require("../../../runtime/medium-graphic.js") : RasanMediumGraphic;
var content = {
  logical: { w: 1920, h: 1080 },
  paths: [
    { id: "a", kind: "main", d: "M300 300 L900 300", at: 0.2, dur: 0.8 },
    { id: "b", kind: "main", d: "M300 760 L900 760", at: 1.4, dur: 0.8 },
    { id: "maybe", kind: "connector", claim: "illustrative", d: "M900 300 C1100 300 1100 760 900 760", at: 2.6, dur: 0.8 }
  ],
  labels: [{ id: "tag", x: 1120, y: 540, text: "illustrative only", at: 3.5 }]
};
module.exports = { content: content, claim: "illustrative", mount: function (root, deps) {
  return G.createLineDrawingScene({ root: root, width: 1920, height: 1080, seed: "line-bnd-1", design: deps && deps.design, content: content });
} };
