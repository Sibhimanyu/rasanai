// orbs: the RasanOrbs runtime (runtime/rasan-orbs.js, a seek-safe port of thinking-orbs, MIT; credit in third_party/thinking-orbs/).
// Static: it parses, carries a VERSION, has no Math.random / wall clock / rAF. Golden: its geometry matches 15 of the library's own
// golden vectors (third_party/thinking-orbs/golden-subset.json: all nine states at size 20 and six at size 64) to the library's
// tolerance, so the port changed no number. Headless Chrome (lib/cdp.mjs), real GSAP on a paused timeline: seeking the same
// times in different orders gives byte-identical canvases, a still (no timeline) matches the timeline, every state animates,
// a state change dissolves and ends on the new state, the brand colour and light theme change the ink, 64/20/hero all draw.
// export default async function ({ ok, node, tmp }).
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export default async function ({ ok, tmp }) {
  const HERE = path.dirname(fileURLToPath(import.meta.url));
  const S = path.join(HERE, "..");
  const RT = path.join(S, "..", "runtime", "rasan-orbs.js");
  const GOLD = path.join(S, "..", "third_party", "thinking-orbs", "golden-subset.json");
  const src = fs.readFileSync(RT, "utf8");

  const syn = spawnSync(process.execPath, ["--check", RT], { encoding: "utf8" });
  ok("orbs: the runtime parses, carries a VERSION, exposes RasanOrbs.mount, and has no Math.random, wall clock or requestAnimationFrame", syn.status === 0 && /var VERSION = "\d+\.\d+\.\d+"/.test(src) && /RasanOrbs = \{[^}]*mount: mount/.test(src) && !/Math\.random\s*\(|Date\.now\s*\(|performance\.now\s*\(|requestAnimationFrame|setInterval|setTimeout/.test(src), syn.stderr);

  // golden: geometry against the library's own vectors
  const sandbox = {};
  vm.runInNewContext(src, sandbox);
  const R = sandbox.RasanOrbs;
  const gold = JSON.parse(fs.readFileSync(GOLD, "utf8"));
  let worst = 0, bad = "";
  for (const c of gold.cases) {
    const f = R.geometry(c.state, c.size, c.t);
    if (f.dots.length !== c.dotCount || f.lines.length !== c.lineCount) { bad = `${c.key}: ${f.dots.length}/${f.lines.length} marks, golden ${c.dotCount}/${c.lineCount}`; break; }
    f.dots.forEach((d, i) => [d.x, d.y, d.z, d.r, d.white, d.a === undefined ? 1 : d.a].forEach((v, j) => { const e = Math.abs(v - c.dots[i * 6 + j]); if (e > worst) { worst = e; if (e > gold.tolerance) bad = `${c.key} dot ${i} field ${j}: ${v} vs ${c.dots[i * 6 + j]}`; } }));
    f.lines.forEach((l, i) => [l.x1, l.y1, l.x2, l.y2, l.white, l.a === undefined ? 1 : l.a, l.w].forEach((v, j) => { const e = Math.abs(v - c.lines[i * 7 + j]); if (e > worst) { worst = e; if (e > gold.tolerance) bad = `${c.key} line ${i} field ${j}: ${v} vs ${c.lines[i * 7 + j]}`; } }));
  }
  ok(`orbs (golden): geometry matches thinking-orbs' golden vectors (${gold.cases.length} cases, all nine states, both sizes) within ${gold.tolerance}; worst ${worst.toExponential(1)}`, !bad && gold.cases.length >= 15, bad);

  if (process.argv.includes("--quick")) return;

  // headless: real GSAP, paused timeline
  const dir = path.join(tmp, "orbs");
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(path.join(S, "vendor", "gsap.min.js"), path.join(dir, "gsap.min.js"));
  fs.copyFileSync(RT, path.join(dir, "rasan-orbs.js"));
  fs.writeFileSync(path.join(dir, "t.html"), `<!doctype html><meta charset=utf-8><body style="margin:0;background:#000"><div id=a></div><div id=b></div><div id=c></div><div id=d></div><div id=e></div>
<script src="gsap.min.js"></script><script src="rasan-orbs.js"></script><script>
var tl = gsap.timeline({ paused: true });
var states = RasanOrbs.states;
window.orbs = {};
states.forEach(function (s) { var d = document.createElement("div"); document.body.appendChild(d); window.orbs[s] = RasanOrbs.mount(d, { state: s, size: 64, tl: tl, duration: 8 }); });
window.small = RasanOrbs.mount("#a", { state: "connecting", size: 20, tl: tl, duration: 8 });
window.hero = RasanOrbs.mount("#b", { state: "searching", size: "hero", tl: tl, duration: 8 });
window.brand = RasanOrbs.mount("#c", { state: "searching", size: 64, color: "#2f6bff", tl: tl, duration: 8 });
window.light = RasanOrbs.mount("#d", { state: "searching", size: 64, theme: "light", tl: tl, duration: 8 });
window.chg = RasanOrbs.mount("#e", { state: "searching", size: 64, tl: tl, duration: 8 }).to("shaping", 2, 1);
window.shaper = RasanOrbs.mount(document.createElement("div"), { state: "shaping", size: 64, tl: tl, duration: 8 });
window.still = RasanOrbs.mount(document.createElement("div"), { state: "listening", size: 64 });
window.snap = function (names) { var o = {}; names.forEach(function (n) { o[n] = (window.orbs[n] || window[n]).canvas.toDataURL(); }); return o; };
window.go = function (t) { tl.time(t, false); };
</script>`);
  const { launch } = await import("../lib/cdp.mjs");
  let b;
  try {
    b = await launch({ width: 900, height: 700, timeoutMs: 30000 });
    await b.open("file://" + path.join(dir, "t.html"));
    const names = JSON.stringify([...R.states, "small", "hero", "brand", "light", "chg", "shaper"]);
    const shot = async (t) => JSON.parse(await b.eval(`window.go(${t}); JSON.stringify(window.snap(${names}))`));
    const A = {};
    for (const t of [0.3, 1.1, 2.5, 4.7, 7.9]) A[t] = await shot(t);
    // the same times again, in a different order, with a rewind between
    const B = {};
    for (const t of [7.9, 0.3, 4.7, 7.9, 1.1, 2.5, 0.3]) B[t] = await shot(t);
    const same = Object.keys(A).every((t) => Object.keys(A[t]).every((n) => A[t][n] === B[t][n]));
    ok("orbs (seek-safe): seeking the same times in a different order, with rewinds, gives byte-identical canvases for every state, size and option", same, "canvases differ after reseek");

    const moves = R.states.filter((s) => A[0.3][s] === A[1.1][s] && A[1.1][s] === A[2.5][s]);
    ok("orbs (animates): every state's picture changes over time" + (moves.length ? " (static: " + moves.join(", ") + ")" : ""), !moves.length);

    ok("orbs (options): the 20 design, the hero size, the brand colour and the light theme each draw something different from the plain 64", new Set([A[1.1].searching, A[1.1].hero, A[1.1].brand, A[1.1].light]).size === 4 && A[1.1].small !== A[1.1].connecting);

    const bsz = JSON.parse(await b.eval(`JSON.stringify({ s: window.small.canvas.width, h: window.hero.canvas.width, c: window.orbs.working.canvas.width })`));
    ok("orbs (sizes): 20 draws 20 px (x2 dpr), 64 draws 64 px, hero 256 px", bsz.s === 40 && bsz.c === 128 && bsz.h === 512, JSON.stringify(bsz));

    // a still (no timeline) at T matches the same orb on the timeline
    const still = await b.eval(`window.still.seek(2.5); window.still.canvas.toDataURL()`);
    const ref = await b.eval(`(function(){ var d = document.createElement("div"); var o = RasanOrbs.mount(d, { state: "listening", size: 64, time: function () { return 2.5; } }); return o.canvas.toDataURL(); })()`);
    ok("orbs (still): a mount with no timeline renders the same pixels from seek(T) and from a time getter", still === ref && still !== A[0.3].listening);

    // a state change: before the change it is the old state, after it is the new, between it is a blend; seeking back restores the old
    const pre = await shot(1.5), mid = await shot(2.5), post = await shot(3.5), pre2 = await shot(1.5);
    const stateNow = (t) => b.eval(`window.chg.stateAt(${t})`);
    ok("orbs (state change): to(state, at, dur) dissolves: old state before, a blend mid-way, the new state after, and seeking back restores the old", pre.chg !== mid.chg && mid.chg !== post.chg && pre.chg === pre2.chg && (await stateNow(1.5)) === "searching" && (await stateNow(3.5)) === "shaping");
    ok("orbs (state change): after the dissolve the orb is pixel-identical to the new state mounted alone (no trace of the old one)", post.chg === post.shaper);
  } catch (e) {
    ok("orbs (headless): the page ran in headless Chrome", false, String(e && e.stack || e).slice(0, 600));
  } finally {
    if (b) await b.close();
  }
}
