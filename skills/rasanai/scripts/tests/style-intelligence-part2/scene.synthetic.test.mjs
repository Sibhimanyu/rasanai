// style-intelligence-part2 SYNTHETIC SCENE cases (vector/paper/pixel/hybrid/character/iso). AUTHORED, NOT RUN.
// Future run, only after the user approves lane "scene": STYLE_PART2_APPROVED=scene node --test skills/rasanai/scripts/tests/style-intelligence-part2/scene.synthetic.test.mjs
// No renders, no screenshots, no goldens: cases read deterministic scene STATE at a seek time from each lane's module.
// UNKNOWN (whole file): M04/M05/M06 export names and state shapes are not in 01_CONTRACTS. Cases go through `S(owner, fn)` which
// resolves names from fixtures.API[owner].fns; until the lanes land and the map is filled, each case fails with an UNKNOWN message (never passes).
import test from "node:test";
import assert from "node:assert/strict";
import { skipUnless, need, API, text, sha } from "./fixtures.mjs";

const T = (name, fn) => test(name, { skip: skipUnless("scene") }, fn);
const S = async (owner, key) => { const a = API[owner]; const f = a.fns[key]; if (!f) throw new Error(`UNKNOWN: ${owner} lane export for "${key}" not mapped in fixtures.API.${owner}.fns`); return need(a.mod, f); };
// Normalized contract assumed from every lane: build(spec) -> scene; stateAt(scene, tSeconds) -> plain JSON state (no DOM, no clock).
const st = async (owner, spec, t) => (await S(owner, "stateAt"))(await (await S(owner, "build"))(spec), t);
const seeds = { seed: 7, fps: 30 };

// ---------- Graphic (vector) and paper (M04) ----------
T("MS-25 vector construction reads without headline: positive shapes alone, decorative labels hidden", async () => {
  const spec = { ...seeds, shapes: [{ id: "a", kind: "rect" }, { id: "b", kind: "arrow", from: "a" }], hideDecorativeLabels: true };
  const end = await st("vector", spec, 4);
  assert.ok(end.visible.some((v) => v.id === "a") && end.visible.some((v) => v.id === "b"));
  assert.ok(!end.visible.some((v) => v.role === "decorative-label"));
  assert.ok(end.relations.some((r) => r.from === "a")); // relationship survives
});
T("MS-26 line reveal is seek-order independent (later, earlier, middle)", async () => {
  const spec = { ...seeds, path: "M0 0 L100 0 L100 100" };
  const a = await st("vector", spec, 2);
  await st("vector", spec, 5); await st("vector", spec, 0.5);
  const b = await st("vector", spec, 2);
  assert.deepEqual(a, b);
});
T("MS-27 paper behavior is spatial/masking action, not a texture behind moving text", async () => {
  const spec = { ...seeds, layers: ["base", "flap"], hinge: { layer: "flap", axis: "left" }, reveal: "base" };
  const a = await st("paper", spec, 0.2), b = await st("paper", spec, 1.4);
  assert.notDeepEqual(a.layers, b.layers);
  assert.ok(b.masks.length >= 1 || b.layers.some((l) => l.transform !== a.layers.find((x) => x.id === l.id)?.transform));
});
T("MS-28 source text stays intact through paper grouping: exact correction + qualifier unchanged and legible", async () => {
  const spec = { ...seeds, text: [{ id: "t1", value: "Use 'whom' only after a preposition, usually." , protected: true }] };
  for (const t of [0, 1, 3]) {
    const s = await st("paper", spec, t);
    const node = s.text.find((x) => x.id === "t1");
    if (t >= 3) assert.equal(node.value, spec.text[0].value);
    assert.ok(node.value === spec.text[0].value || node.opacity < 1); // no mutation at any time
  }
});
T("MS-29 data source governs geometry: bars faithful to values/units/baseline, no invented metric", async () => {
  const spec = { ...seeds, data: { unit: "%", baseline: 0, rows: [{ id: "x", value: 25 }, { id: "y", value: 50 }] } };
  const s = await st("vector", spec, 9);
  const hx = s.bars.find((b) => b.id === "x").height, hy = s.bars.find((b) => b.id === "y").height;
  assert.ok(Math.abs(hy / hx - 2) < 1e-6);
  assert.equal(s.axis.baseline, 0);
  assert.ok(!s.annotations.some((a) => /adaptation|score|index/i.test(a.label || "")));
});
T("MS-30 unmatched arbitrary topology: unsupported/adapted mechanism stated, no false true-morph claim", async () => {
  const spec = { ...seeds, morph: { from: "star(5)", to: "ring-with-hole" } };
  const s = await st("vector", spec, 1);
  assert.notEqual(s.mechanism, "true-morph");
  assert.ok(s.limitations.some((l) => /topolog|unsupported|adapted/i.test(l)));
});

// ---------- Pixel and hybrid (M05) ----------
T("MS-31 crisp native pixel grid: integer-fit landscape and portrait use nearest-neighbor and logical grid at output size", async () => {
  for (const out of [{ w: 1920, h: 1080 }, { w: 1080, h: 1920 }]) {
    const s = await st("pixel", { ...seeds, grid: { w: 240, h: 135 }, output: out, portrait: out.h > out.w }, 0);
    assert.equal(s.sampling, "nearest-neighbor");
    assert.ok(Number.isInteger(s.scale));
    assert.equal(s.fit.stretched, false);
  }
});
T("MS-32 non-integer canvas fit: declared crop/fit policy, no unannounced stretch or DPR error", async () => {
  const s = await st("pixel", { ...seeds, grid: { w: 240, h: 135 }, output: { w: 1000, h: 563 } }, 0);
  assert.ok(["crop", "letterbox", "integer-down"].includes(s.fit.policy));
  assert.equal(s.fit.stretched, false);
  assert.ok(s.fit.declared === true);
});
T("MS-33 pixel stepping deterministic: random-order seeks stable, inserting another object does not change existing motion", async () => {
  const two = { ...seeds, sprites: [{ id: "a", pose: "walk" }, { id: "b", pose: "idle" }] };
  const three = { ...two, sprites: [...two.sprites, { id: "c", pose: "wave" }] };
  const order = [3, 0.2, 2.5, 1];
  const pick = async (spec) => { const r = {}; for (const t of order) r[t] = (await st("pixel", spec, t)).sprites.filter((s) => s.id !== "c"); return r; };
  assert.deepEqual(await pick(two), await pick(three));
  assert.deepEqual(await pick(two), await pick(two));
});
T("MS-34 hybrid proof stays sharp: UI layer full-res, only sprite pixelated", async () => {
  const s = await st("pixel", { ...seeds, hybrid: { proofLayer: "ui", companion: "sprite" } }, 1);
  const ui = s.layers.find((l) => l.id === "ui"), sp = s.layers.find((l) => l.id === "sprite");
  assert.equal(ui.sampling, "full-resolution");
  assert.equal(sp.sampling, "nearest-neighbor");
});
T("MS-35 anchor respects transforms: companion tracks resized/zoomed/moved target without drift or reading overlap", async () => {
  const xf = [{ t: 0, scale: 1, x: 0 }, { t: 2, scale: 1.5, x: 120 }, { t: 4, scale: 0.8, x: -60 }];
  for (const f of xf) {
    const s = await st("pixel", { ...seeds, hybrid: { proofLayer: "ui", companion: "sprite" }, target: { id: "btn", transform: f } }, f.t);
    const sp = s.layers.find((l) => l.id === "sprite"), tg = s.targets.find((x) => x.id === "btn");
    assert.ok(Math.abs(sp.anchorOffset.x - s.expectedAnchorOffset.x) < 0.5);
    assert.equal(s.overlaps.some((o) => o.a === "sprite" && o.b === "protected-text"), false);
    assert.ok(tg);
  }
});
T("MS-36 locale glyph/shaping: Tamil+English exact text with absent pixel glyphs gets crisp-text adaptation or limitation, no boxes/transliteration", async () => {
  const s = await st("pixel", { ...seeds, text: [{ id: "t", value: "சரி - correct", protected: true }], pixelFont: { glyphs: "latin-only" } }, 0);
  const t = s.text.find((x) => x.id === "t");
  assert.equal(t.value, "சரி - correct");
  assert.ok(t.renderer !== "pixel-font" && (t.adaptation === "crisp-text" || s.limitations.some((l) => /glyph|locale|shaping/i.test(l))));
  assert.ok(!t.fallback_boxes && !/transliterat/.test(text(s)));
});
T("MS-37 editorial mascot does not invent product behavior from a real UI event", async () => {
  const s = await st("pixel", { ...seeds, event: { kind: "ui-click", target: "export-btn", source: "captured" }, mascot: { reacts: true } }, 1);
  assert.ok(s.claims.every((c) => c.source_ref));
  assert.ok(!s.claims.some((c) => /causes|because the mascot|feature/i.test(c.text || "")));
  assert.equal(s.mascot.layerRole, "editorial");
});
T("MS-38 no hazardous style-default flashing: reveal and state change avoid rapid flashing without source blink presets", async () => {
  const samples = [];
  for (let i = 0; i < 90; i++) samples.push((await st("pixel", { ...seeds, reveal: "palette", stateChange: true }, i / 30)).luminance);
  let flips = 0; for (let i = 2; i < samples.length; i++) if ((samples[i] - samples[i - 1]) * (samples[i - 1] - samples[i - 2]) < 0 && Math.abs(samples[i] - samples[i - 1]) > 0.1) flips++;
  assert.ok(flips <= 3 * 3); // <=3 flashes/s over 3s; UNKNOWN: authoritative guard is existing lib/a11y.mjs, use it in the authorized check.
});

// ---------- Characters and isometric worlds (M06) ----------
T("MS-39 acting is not idle decoration: anticipation, action, reaction present in order", async () => {
  const s = await (await S("character", "build"))({ ...seeds, action: "hand-over-key" });
  const ph = (await (await S("character", "phases"))(s)).map((p) => p.kind);
  assert.deepEqual(ph.filter((k) => ["anticipation", "action", "reaction"].includes(k)), ["anticipation", "action", "reaction"]);
});
T("MS-40 canon and props persist: identity preserved, attachment neither floats nor jumps", async () => {
  const spec = { ...seeds, actor: "rasan-like-original", prop: { id: "key", attach: "right-hand" }, poses: ["reach", "hold", "turn", "hold"] };
  let prev = null;
  for (const t of [0, 0.5, 1, 1.5, 2]) {
    const s = await st("character", spec, t);
    assert.equal(s.identity.canon_id, "rasan-like-original");
    assert.ok(s.prop.distanceToAnchor < 0.5);
    if (prev) assert.ok(Math.hypot(s.prop.x - prev.x, s.prop.y - prev.y) < 80);
    prev = s.prop;
  }
});
T("MS-41 local drawing variation: boil on character linework only; evidence text and other layers stable", async () => {
  const spec = { ...seeds, boil: { layer: "character" }, layers: [{ id: "character" }, { id: "evidence-text", protected: true }, { id: "bg" }] };
  const a = await st("character", spec, 1), b = await st("character", spec, 1.2);
  assert.notDeepEqual(a.layers.find((l) => l.id === "character").jitter, b.layers.find((l) => l.id === "character").jitter);
  for (const id of ["evidence-text", "bg"]) assert.deepEqual(a.layers.find((l) => l.id === id), b.layers.find((l) => l.id === id));
});
T("MS-42 projection coherent: one declared projection and depth ordering through assembly and reframe", async () => {
  const spec = { ...seeds, projection: "isometric-2:1", assemble: ["floor", "wall", "desk"], reframe: { from: 0, to: 3 } };
  for (const t of [0, 1.5, 3]) {
    const s = await st("iso", spec, t);
    assert.equal(s.projection, "isometric-2:1");
    const z = s.items.map((i) => i.depth); assert.deepEqual([...z].sort((a, b) => a - b), z);
    assert.ok(!s.items.some((i) => i.projection && i.projection !== "isometric-2:1"));
  }
});
T("MS-43 routes do not invent infrastructure: illustrative vs asserted data flow kept distinct; unsupported links rejected", async () => {
  const spec = { ...seeds, routes: [{ id: "r1", kind: "illustrative", from: "a", to: "b" }, { id: "r2", kind: "asserted", from: "a", to: "c", source_ref: null }] };
  const s = await st("iso", spec, 1);
  assert.equal(s.routes.find((r) => r.id === "r1").label_kind, "illustrative");
  assert.ok(s.rejected.some((r) => r.id === "r2") && !s.routes.some((r) => r.id === "r2"));
});
T("MS-44 unsupported performance is labeled: missing rig/lip-sync claims nothing it cannot deliver", async () => {
  const s = await st("character", { ...seeds, rig: null, request: { lipSync: true, speech: "hello" } }, 1);
  assert.ok(s.limitations.some((l) => /rig|lip/i.test(l)));
  assert.ok(!s.performance.some((p) => p.kind === "lip-sync" && p.delivered));
});
