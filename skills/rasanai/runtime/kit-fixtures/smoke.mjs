// smoke.mjs: one small smoke for runtime/rasan-motion-kit.js. No browser, no jsdom: a minimal DOM stub and the vendored GSAP.
// Usage: node skills/rasanai/runtime/kit-fixtures/smoke.mjs     -> JSON on stdout; exit 0 ok, 1 a check failed
// Checks, for every mechanic (without and with cues): it builds, duration and hits are finite, and the DOM state at a grid of
// times is IDENTICAL whether we seek forward, backward, A->B->A, or in a fixed shuffled order. Plus input rejection and a
// source scan for Math.random / Date / rAF.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// ---- minimal DOM stub (just what the kit touches)
class El {
  constructor(tag) { this.tag = tag; this.nodeType = 1; this.style = {}; this.children = []; this.attrs = {}; this.parentNode = null; this._text = ""; this.clientWidth = 1280; this.clientHeight = 720; }
  detach(e) { if (e.parentNode) e.parentNode.children = e.parentNode.children.filter((x) => x !== e); }
  appendChild(e) { this.detach(e); e.parentNode = this; this.children.push(e); return e; }
  insertBefore(e, ref) { this.detach(e); e.parentNode = this; const i = this.children.indexOf(ref); this.children.splice(i < 0 ? this.children.length : i, 0, e); return e; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  set textContent(v) { this._text = String(v); }
  get textContent() { return this._text; }
}
globalThis.document = { createElement: (t) => new El(t), createElementNS: (_n, t) => new El(t), querySelector: () => null };

const G = require(path.join(here, "../../scripts/vendor/gsap.min.js"));
const gsap = G.gsap || G.default || G;
const Kit = require(path.join(here, "../rasan-motion-kit.js"));

const snap = (e) => JSON.stringify([e.tag, e.style, e.attrs, e._text, e.children.map(snap)]);
const DESIGN = { colors: { fg: "#f4f1ea", bg: "#14161c", accent: "#e8553d", muted: "#8b909c", surface: "#222632" }, fonts: { display: "Fraunces, serif", body: "Inter, sans-serif" } };
const PROPS = {
  "kinetic-type-text-mask-reveal-v1": { text: "Made to be seen|By anyone" },
  "product-ui-card-stack-rotation-v1": { text: "Invoices|Orders|Returns|Reports" },
  "shape-split-recombine-v1": { text: "SPLIT" },
  "data-evidence-evidence-number-reveal-v1": { value: 48213.5, decimals: 1, prefix: "$", suffix: "k", text: "Source: fictional ledger" },
};
const results = []; let failed = 0;
const ok = (name, cond, extra) => { if (!cond) failed++; results.push({ name, ok: !!cond, ...(cond ? {} : { detail: String(extra).slice(0, 200) }) }); };

function build(id, cues) {
  const tl = gsap.timeline({ paused: true });
  const target = new El("div");
  if (id === "sound-hit-multi-part-contraction-v1" || id === "camera-space-layer-parallax-v1") { /* placeholders */ }
  const r = Kit.apply({ id, timeline: tl, target, design: DESIGN, motion: {}, fps: 30, seed: "smoke", cues, props: { at: 0.5, ...(PROPS[id] || {}) } });
  return { tl, target, r };
}
const gridOf = (r) => { const a = []; const n = 14; for (let i = 0; i <= n; i++) a.push(Math.round((r.start - 0.1 + ((r.end - r.start) + 0.3) * i / n) * 1000) / 1000); return a.concat(r.hits).filter((t) => t >= 0); };
const stateAt = (b, t) => { b.tl.seek(t, false); return snap(b.target); };

for (const id of Object.keys(Kit.ids)) {
  for (const cues of [undefined, [1.0, 1.5, 2.1]]) {
    const label = id + (cues ? " +cues" : "");
    let b;
    try { b = build(id, cues); } catch (e) { ok(label + ": builds", false, e.stack); continue; }
    const { r } = b;
    ok(label + ": builds, finite duration and hits", r.id === id && r.version === 1 && Number.isFinite(r.duration) && r.duration > 0 && r.hits.every(Number.isFinite) && Number.isFinite(b.tl.duration()), JSON.stringify(r));
    const grid = gridOf(r), ref = new Map();
    grid.forEach((t) => ref.set(t, stateAt(b, t)));                                  // A: forward
    let bad = 0;
    [...grid].reverse().forEach((t) => { if (stateAt(b, t) !== ref.get(t)) bad++; }); // reversed
    grid.forEach((t, i) => { stateAt(b, grid[(i * 7 + 3) % grid.length]); if (stateAt(b, t) !== ref.get(t)) bad++; }); // A->B->A
    const perm = grid.map((_, i) => grid[(i * 5 + 2) % grid.length]);                // fixed shuffle (5 is coprime with the grid length when it is not a multiple of 5)
    perm.forEach((t) => { if (stateAt(b, t) !== ref.get(t)) bad++; });
    ok(label + ": seek A->B->A, reversed and shuffled order give identical DOM state", bad === 0, bad + " mismatches over " + grid.length + " times");
    // a rebuild with the same inputs gives the same frames (determinism across builds)
    const b2 = build(id, cues), t = grid[Math.floor(grid.length / 2)];
    ok(label + ": rebuild is identical", stateAt(b2, t) === ref.get(t));
  }
}

const bad = (spec, what) => { let threw = false; try { build2(spec); } catch { threw = true; } ok("rejects " + what, threw); };
function build2(spec) { return Kit.apply({ timeline: gsap.timeline({ paused: true }), target: new El("div"), design: DESIGN, ...spec }); }
bad({ id: "nope-v1" }, "an unknown id");
bad({ id: "kinetic-type-text-mask-reveal-v1", props: { text: "see https://evil.example/x" } }, "a URL in text");
bad({ id: "kinetic-type-text-mask-reveal-v1", props: { text: "eval(1)" } }, "eval in text");
bad({ id: "kinetic-type-text-mask-reveal-v1", props: { text: "a" }, design: { colors: { accent: "url(http://x)" } } }, "a url() colour");
bad({ id: "kinetic-type-text-mask-reveal-v1", props: { text: "a" }, timeline: { fromTo() {} } }, "a non-GSAP timeline");
{
  const tl = gsap.timeline({ paused: true }), r = Kit.apply({ id: "sound-hit-visual-foley-hit-v1", timeline: tl, target: new El("div"), props: { intensity: 99, bogus: 1 } });
  ok("clamps out-of-range numbers and warns on unknown props", r.warnings.length === 1 && Number.isFinite(r.duration));
}
ok("params and reduced() are exposed for every id", Object.keys(Kit.ids).every((id) => Kit.params(id) && typeof Kit.reduced(id) === "string" && Kit.list().some((x) => x.id === id)));
const src = fs.readFileSync(path.join(here, "../rasan-motion-kit.js"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
ok("source has no Math.random, Date, rAF, timers, innerHTML, eval, network", !/Math\.random|\bDate\b|requestAnimationFrame|setTimeout|setInterval|innerHTML|\beval\(|fetch\(|XMLHttpRequest|ticker/.test(src));
const cat = process.env.KIT_CATALOG || path.join(here, "../../motion-kit/catalog.json");
if (fs.existsSync(cat)) {
  const items = JSON.parse(fs.readFileSync(cat, "utf8")).items;
  ok("every implemented id matches a catalog item and its param names and bounds", Object.keys(Kit.ids).every((id) => { const it = items.find((x) => x.id === id); return it && Object.entries(it.params).every(([k, p]) => { const q = Kit.params(id)[k]; return q && q.type === p.type && q.min === p.min && (p.type === "string" || q.max === p.max) && q.default === p.default; }); }));
}

const fails = results.filter((x) => !x.ok);
console.log(JSON.stringify({ checks: results.length, failed: fails.length, failures: fails }, null, 1));
process.exit(fails.length ? 1 : 0);
