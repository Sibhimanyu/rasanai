/* Original source example, NOT executed. Profile P01 contrast/boundary. A swarm of floating circles that establishes no
 * relationship. It is labeled ornamental: allowed as atmosphere, never usable as product proof or as a diagram. Also shows the
 * disclosed crossfade: a triangle (3 pts) to a rect (4 pts) cannot morph by matched points, so it crossfades and says so. */
var G = (typeof require === "function") ? require("../../../runtime/medium-graphic.js") : RasanMediumGraphic;
var ornaments = [];
for (var i = 0; i < 12; i++) ornaments.push({ id: "o" + i, x: 160 + i * 140, y: 200 + (i % 4) * 190, r: 24 + (i % 3) * 14, opacity: 0.3 });
var content = {
  logical: { w: 1920, h: 1080 }, ornaments: ornaments,
  objects: [{ id: "tri", claim: "ornamental", shape: { kind: "poly", pts: [[-90, 80], [90, 80], [0, -90]] }, x: 960, y: 540,
    morph: { to: { kind: "rect", w: 160, h: 160 }, at: 1, dur: 0.8 } }]
};
module.exports = { content: content, claim: "ornamental, not evidence", expectsMode: "crossfade", mount: function (root, deps) {
  return G.createFlatVectorScene({ root: root, width: 1920, height: 1080, seed: "flat-bnd-1", design: deps && deps.design, content: content });
} };
