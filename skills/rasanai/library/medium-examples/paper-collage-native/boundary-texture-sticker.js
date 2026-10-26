/* Original source example, NOT executed. Profile P03 contrast. A grain "texture behind an unchanged text card": the card has
 * no fold, hinge, mask or layer action, so nothing physical happens. This is the failure case, kept to be judged against
 * the positive example (every piece reports mode "static"). It also shows a photo piece that THROWS if the approved resolver
 * supplies no asset, instead of drawing an empty box as if complete. */
var P = (typeof require === "function") ? require("../../../runtime/medium-paper.js") : RasanMediumPaper;
var content = {
  logical: { w: 1920, h: 1080 },
  pieces: [{ id: "card", layer: 0, kind: "rect", w: 1100, h: 420, x: 960, y: 540, fill: "#ece3cf", grain: { count: 60 }, text: { value: "A heading on texture", size: 56 } }]
  // add { id: "pic", photo: { asset: "approved/photo-1" }, ... } only when assets["approved/photo-1"] is supplied
};
module.exports = { content: content, expectsMode: "static", verdict: "texture sticker, not a paper mechanism", mount: function (root, deps) {
  return P.createPaperCollageScene({ root: root, width: 1920, height: 1080, seed: "paper-bnd-1", design: deps && deps.design, assets: deps && deps.assets, content: content });
} };
