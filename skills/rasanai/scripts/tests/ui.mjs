// selftest section "ui": the RasanUI native-UI rebuild kit (runtime/rasan-ui.js). The runtime parses and carries a VERSION;
// uikit.mjs install / check and video.mjs inject; and, in a tiny headless composition, every state is a pure function of the
// timeline time (several times seeked twice in different orders give the identical DOM), the cursor and press timing match the
// physics (2 f down to 0.71-0.90, 3 f up, the target bottoms out 0-1 f later, asymmetric, no ring), typing only works in a real
// input field, the slop-tell guards throw, and the readability check warns (and stays quiet when the proof reads).
// export default async function ({ ok, node, tmp }).
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export default async function ({ ok, node, tmp }) {
  const HERE = path.dirname(fileURLToPath(import.meta.url));
  const S = path.join(HERE, "..");
  const RT = path.join(S, "..", "runtime", "rasan-ui.js");
  const J = (r) => { try { return JSON.parse(r.stdout); } catch { return {}; } };

  // ---- the file itself
  const src = fs.readFileSync(RT, "utf8");
  const syn = spawnSync(process.execPath, ["--check", RT], { encoding: "utf8" });
  ok("ui: the runtime parses, carries a VERSION and the motionmaxxing attribution, and has no Math.random, wall clock, rAF or timers", syn.status === 0 && /var VERSION = "\d+\.\d+\.\d+"/.test(src) && src.startsWith("// Adapted in part from motionmaxxing (Apache-2.0, Tejas Makwana), runtime/native-ui. Modified.") && !/Math\.random\s*\(|Date\.now\s*\(|performance\.now\s*\(|requestAnimationFrame\s*\(|setTimeout\s*\(|setInterval\s*\(/.test(src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")), syn.stderr);

  // ---- install / check / inject
  const p = path.join(tmp, "ui-proj");
  fs.mkdirSync(path.join(p, "compositions"), { recursive: true });
  const comp = (head, js) => `<template><script src="../gsap.min.js"></script>${head}<script>const tl=gsap.timeline({paused:true});${js}window.__timelines.a=tl</script></template>`;
  fs.writeFileSync(path.join(p, "compositions", "a.html"), comp("", 'const U=RasanUI.kit(tl,{tokens:T});U.mount("#w",{captured:true,source:"x"});U.finish();'));
  const c0 = node("uikit.mjs", ["check", "--project", p, "--json"]);
  ok("ui (check): RasanUI without the runtime is an error (runtime-missing, runtime-not-loaded)", c0.status === 2 && /runtime-missing/.test(c0.stdout) && /runtime-not-loaded/.test(c0.stdout), c0.stdout.slice(0, 300));
  const ci = node("uikit.mjs", ["install", "--project", p]);
  ok("ui (install): copies the runtime into assets/rasan-ui/", ci.status === 0 && fs.existsSync(path.join(p, "assets", "rasan-ui", "rasan-ui.js")), ci.stderr);
  fs.writeFileSync(path.join(p, "compositions", "a.html"), comp('<script src="../assets/rasan-ui/rasan-ui.js"></script>', 'const U=RasanUI.kit(tl,{tokens:T});U.mount("#w",{captured:true,source:"x"});U.finish();'));
  const c1 = node("uikit.mjs", ["check", "--project", p]);
  ok("ui (check): installed, loaded after GSAP, captured mount, finish called: clean", c1.status === 0 && /uikit: clean/.test(c1.stdout), c1.stdout);
  fs.writeFileSync(path.join(p, "compositions", "b.html"), `<template><script src="../assets/rasan-ui/rasan-ui.js"></script><script src="../gsap.min.js"></script><script>const tl=gsap.timeline({paused:true});const U=RasanUI.kit(tl,{tokens:T});U.mount("#w",{});const n=Math.random();setTimeout(function(){},1);</script></template>`);
  const c2 = J(node("uikit.mjs", ["check", "--project", p, "--json"]));
  const rules = (c2.findings || []).map((f) => f.rule);
  ok("ui (check): runtime before GSAP, no finish, a timer / Math.random, and an uncaptured mount are caught", c2.errors >= 3 && ["script-order", "nondeterministic", "no-finish", "not-captured"].every((r) => rules.includes(r)), JSON.stringify(rules));
  fs.rmSync(path.join(p, "compositions", "b.html"));
  const pd = path.join(tmp, "ui-inject");
  fs.mkdirSync(path.join(pd, ".hyperframes", "frame-packets"), { recursive: true });
  fs.mkdirSync(path.join(pd, "compositions"), { recursive: true });
  const pers = fs.readdirSync(path.join(S, "..", "personalities")).filter((f) => f.endsWith(".json")).sort()[0].replace(".json", "");
  node("motion-md.mjs", ["write", "--personality", pers, "--out", path.join(pd, "motion.md")]);
  fs.writeFileSync(path.join(pd, ".hyperframes", "frame-packets", "01.md"), "# Frame 1\n\npacket\n");
  fs.writeFileSync(path.join(pd, "compositions", "s1.html"), "<template><script>const U=RasanUI.kit(tl,{tokens:T});</script></template>");
  const inj = J(node("video.mjs", ["inject", "--project-dir", pd]));
  ok("ui (inject): video.mjs inject installs RasanUI when a composition names it", inj.ui && fs.existsSync(path.join(pd, "assets", "rasan-ui", "rasan-ui.js")), JSON.stringify(inj).slice(0, 300));

  // ---- headless: a tiny composition
  let launch, serve;
  try { ({ launch } = await import("../lib/cdp.mjs")); ({ serve } = await import("../lib/stage3d.mjs")); } catch (e) { console.log("note  ui: headless Chrome not available, the browser checks are skipped (" + e.message + ")"); return; }
  const D = path.join(tmp, "ui-page");
  fs.mkdirSync(D, { recursive: true });
  fs.copyFileSync(RT, path.join(D, "rasan-ui.js"));
  fs.writeFileSync(path.join(D, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#000}#root{position:relative;width:1920px;height:1080px;overflow:hidden;background:#fbf7f0}#world{position:absolute;left:0;top:0;width:1920px;height:1080px}</style>
<script>window.addEventListener("error",function(e){window.__err=e.message+" @"+e.lineno;});</script><script src="/__rasanai/gsap.min.js"></script><script src="/rasan-ui.js"></script></head><body>
<div id="root" data-composition-id="ui" data-width="1920" data-height="1080" data-start="0" data-duration="8"><div id="world"></div></div>
<script>
var Q = new URLSearchParams(location.search), MODE = Q.get("mode") || "good";
var BRAND = { colors: { canvas: "#fbf7f0", ink: "#1c1b19", accent: "#d9480f" }, fonts: { display: { family: "Georgia" }, body: { family: "Georgia" } }, radii: { md: 10 }, spacing: { base: 4 } };
var tl = gsap.timeline({ paused: true });
var U = RasanUI.kit(tl, { tokens: BRAND, seed: "selftest/ui" });
var world = U.world("#world", [{ t: 0, s: 1, fx: 960, fy: 540 }, { t: 5, s: 1, fx: 960, fy: 540 }]);
var good = MODE === "good";
var app = U.mount("#world", { name: "Kinso", captured: true, source: "research/screens.json#orders", w: 640, h: 440, scale: good ? RasanUI.fitScale({ H: 1080, textPx: 15, frac: 0.0415 }) : 1 });
var main = U.main(app);
U.header(main, { title: "Orders", sub: "Fulfilment queue", actions: [] });
var q = U.input(main, { label: "Search orders", placeholder: "Name or order number" });
var go = U.button(main, { label: "Create order", kind: "primary" });
var tg = U.toggle(main, { on: false });
U.list(main, { rows: [{ avatar: "Priya Raman", title: "Priya Raman", sub: "Order 4821 shipped", value: "$48.00" }] });
U.hero(app);
var cur = U.cursor({ at: 0.2, from: { x: 1700, y: 900 } });
var a = cur.click(q, { at: 1.0 });
var t = U.type(q, "Priya Raman", { at: 1.4, rate: "read" });
var b = cur.click(go, { at: 3.6, react: "pressed" });
U.step(tg, "data-on", [[3.9, ""]]);
cur.exit({ at: 5.2 });
U.finish();
window.__tl = tl; window.__U = U; window.__a = a; window.__b = b; window.__t = t;
window.__snap = function (T) { tl.time(T); return document.getElementById("root").outerHTML; };
window.__attr = function (T, sel, name) { tl.time(T); var e = document.querySelector(sel); return name === "scale" ? e.style.scale : e.getAttribute(name); };
</script></body></html>`);
  const srv = await serve(D);
  let b;
  try {
    b = await launch({ width: 1920, height: 1080, timeoutMs: 120000 });
    const ev = (x) => b.eval(x);
    await b.open(`${srv.url}/index.html?mode=good`);
    await ev("document.fonts && document.fonts.ready ? document.fonts.ready.then(function(){return true;}) : true");
    const pageErr = await ev("window.__err || null");
    ok("ui: the test composition builds without a page error", !pageErr, String(pageErr));

    // seek-safety: the identical DOM for the same time, in different orders, twice
    const times = [0, 0.4, 1.0, 1.0667, 1.1, 1.5, 2.2, 3.6, 3.7, 3.9, 4.5, 5.3, 7.9, 6.2];
    const snap = async (t) => ev(`window.__snap(${t})`);
    const first = {}, second = {};
    for (const t of times) first[t] = await snap(t);
    for (const t of [...times].reverse()) { await snap(5.1); second[t] = await snap(t); }
    const shuffled = [...times].sort((x, y) => ((x * 7919) % 13) - ((y * 7919) % 13));
    const third = {};
    for (const t of shuffled) third[t] = await snap(t);
    const bad = times.filter((t) => first[t] !== second[t] || first[t] !== third[t]);
    ok("ui (seek-safety): " + times.length + " times seeked twice in different orders (forward, reverse via another time, shuffled) give the identical DOM", !bad.length, "differs at t=" + bad.join(","));
    ok("ui (seek-safety): the frames really differ over time (cursor, typing, toggle and press all move)", new Set(times.map((t) => first[t])).size >= times.length - 3, "distinct=" + new Set(times.map((t) => first[t])).size);

    // press physics
    const F = 1 / 30, td = 1.0;
    const scaleAt = async (t) => Number(await ev(`window.__attr(${t}, ".ru-cursor", "data-ru-scale")`));
    const targetAt = async (t) => Number((await ev(`window.__attr(${t}, ".ru-input", "scale")`)) || 1);
    const c0s = await scaleAt(td), cMin = await scaleAt(td + 2 * F), cUp = await scaleAt(td + 5 * F), cMid = await scaleAt(td + F);
    ok("ui (press): the cursor is 1.0 on the press frame, reaches 0.71-0.90 two frames later and is back to 1.0 three frames after that", c0s === 1 && cMin >= 0.71 && cMin <= 0.9 && Math.abs(cUp - 1) < 1e-6 && cMid < 1 && cMid > cMin, JSON.stringify({ c0s, cMid, cMin, cUp }));
    const curve = [];
    for (let i = 0; i <= 16; i++) curve.push(await targetAt(td + i * F));
    const tmin = Math.min(...curve), iMin = curve.indexOf(tmin), iStart = curve.findIndex((v) => v < 0.9995);
    let iEnd = iMin; while (iEnd < curve.length && curve[iEnd] < 0.9995) iEnd++;
    const aud = await ev("JSON.stringify(window.__U.audit().presses)");
    const P = JSON.parse(aud)[0];
    const lagF = Math.round((P.target_min - P.cursor_min) / F);
    ok("ui (press): the target bottoms out 0-1 frame after the cursor's minimum, in 0.63-0.97", lagF >= 0 && lagF <= 1 && tmin >= 0.63 && tmin <= 0.97 && Math.abs(iMin - (2 + lagF)) <= 0, JSON.stringify({ lagF, tmin, iMin }));
    ok("ui (press): asymmetric on the target (fast squeeze, slower release) and it settles without overshoot", curve[iMin] === tmin && (iMin - iStart) <= 3 && (iEnd - iMin) >= 4 && curve.every((v) => v <= 1.0000001), JSON.stringify({ iStart, iMin, iEnd }));
    const ring = await ev('document.querySelectorAll("[class*=ripple],[class*=ring]").length');
    const layerLast = await ev('(function(){var l=document.querySelector(".ru-cursor-layer");return !!l && l===document.getElementById("root").lastElementChild && document.querySelectorAll(".ru-cursor").length===1;})()');
    ok("ui (cursor): one cursor on its own top layer (last child of the stage, outside the camera group) and no ripple ring", ring === 0 && layerLast === true, JSON.stringify({ ring, layerLast }));
    const tip1 = await ev(`(window.__tl.time(0.5), [document.querySelector(".ru-cursor").getAttribute("data-ru-x"), document.querySelector(".ru-cursor").getAttribute("data-ru-y")])`);
    const tip2 = await ev(`(window.__tl.time(0.9), [document.querySelector(".ru-cursor").getAttribute("data-ru-x"), document.querySelector(".ru-cursor").getAttribute("data-ru-y")])`);
    const onField = await ev(`(function(){window.__tl.time(1.0);var r=document.querySelector(".ru-input").getBoundingClientRect(),c=document.querySelector(".ru-cursor");var x=Number(c.getAttribute("data-ru-x")),y=Number(c.getAttribute("data-ru-y"));return x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom;})()`);
    ok("ui (cursor): it travels (the tip moves), and the tip sits on the field at the press", JSON.stringify(tip1) !== JSON.stringify(tip2) && onField === true, JSON.stringify({ tip1, tip2, onField }));
    const react = [await ev(`window.__attr(${3.6 + 2 * F - 0.001}, ".ru-btn", "data-state")`), await ev(`window.__attr(${3.6 + 3 * F + 0.001}, ".ru-btn", "data-state")`)];
    ok("ui (press): a hard state step lands on the frame the target bottoms out (react: pressed)", react[0] === null && react[1] === "pressed", JSON.stringify(react));

    // typing
    const txt = async (t) => ev(`(window.__tl.time(${t}), document.querySelector(".ru-val").textContent)`);
    const mid = await txt(1.7), end = await txt(6.0), before = await txt(1.2);
    const caretTyping = await ev(`(window.__tl.time(1.7), document.querySelector(".ru-input").hasAttribute("data-caret"))`);
    const phBefore = await ev(`(window.__tl.time(0.5), getComputedStyle(document.querySelector(".ru-ph")).display)`);
    const phAfter = await ev(`(window.__tl.time(1.5), getComputedStyle(document.querySelector(".ru-ph")).display)`);
    const gaps = JSON.parse(await ev("JSON.stringify(window.__t.times.slice(1).map(function(v,i){return Math.round((v-window.__t.times[i])*1000)/1000;}))")).filter((g) => g > 0);
    ok("ui (typing): text grows inside the field in bursts (mid text is a strict, non-empty prefix; the caret is solid while typing; the placeholder is cleared)", before === "" && mid.length > 0 && mid.length < end.length && end === "Priya Raman" && caretTyping === true && phBefore !== "none" && phAfter === "none", JSON.stringify({ before, mid, end, caretTyping, phBefore, phAfter }));
    ok("ui (typing): the cadence is irregular (not a metronome)", new Set(gaps).size >= 2, JSON.stringify(gaps));
    const guards = JSON.parse(await ev(`(function(){
      var out = {}; function t(k, f) { try { f(); out[k] = "no throw"; } catch (e) { out[k] = String(e.message).slice(0, 60); } }
      var host = document.getElementById("world");
      t("typeBare", function () { var d = document.createElement("div"); host.appendChild(d); window.__U.type(d, "hello", { at: 7 }); });
      t("greeting", function () { window.__U.header(document.querySelector(".ru-main"), { title: "Good morning, Priya" }); });
      t("bareRow", function () { window.__U.row(document.querySelector(".ru-main"), { title: "Latency", value: "42ms" }); });
      t("uncaptured", function () { window.__U.mount("#world", { captured: true }); });
      t("lorem", function () { window.__U.button(document.querySelector(".ru-main"), { label: "Lorem ipsum" }); });
      t("noAccent", function () { RasanUI.tokens({ colors: { canvas: "#ffffff", ink: "#111111" } }); });
      t("twoCursors", function () { window.__U.cursor({}); });
      return JSON.stringify(out); })()`));
    ok("ui (guards): typing outside an input field, a greeting header, a bare label-value row, a captured mount without a source, placeholder copy, tokens with no accent and a second cursor all throw", Object.values(guards).every((v) => v !== "no throw"), JSON.stringify(guards));
    const mark = await ev(`JSON.stringify([document.querySelector(".ru")?.getAttribute("data-ui"), document.querySelector(".ru")?.getAttribute("data-ui-source")])`);
    ok('ui (marker): a captured rebuild carries data-ui="captured" and its source', mark === JSON.stringify(["captured", "research/screens.json#orders"]), mark);
    const tk = await ev('JSON.stringify(RasanUI.tokens({colors:{canvas:"#0b0b0d",ink:"#f4f4f0",accent:"#7c5cff"},radii:{md:14}}))');
    const T = JSON.parse(tk);
    ok("ui (tokens): surface, muted and border are derived from the brand's canvas and ink (not a fixed zinc), radii and the accent come through", T.radii.md === 14 && T.colors.accent === "#7c5cff" && T.colors.surface !== "#18181b" && T.colors.surface !== T.colors.canvas && T.dark === true && T.defaulted.includes("fonts"), tk.slice(0, 300));

    // readability check: the good build is quiet; the small build warns
    const good = JSON.parse(await ev("JSON.stringify(window.__U.check({ at: [0.5, 2.5, 4.5], log: false }))"));
    ok("ui (check): a proof built at 0.0415 H text and a hero past 0.55 W (or cropped) passes with no warnings", good.ok && good.stats.min_text_h >= 0.04 && good.stats.captured >= 1, JSON.stringify(good).slice(0, 400));
    await b.open(`${srv.url}/index.html?mode=small`);
    await ev("document.fonts && document.fonts.ready ? document.fonts.ready.then(function(){return true;}) : true");
    const small = JSON.parse(await ev("JSON.stringify(window.__U.check({ at: [0.5], log: false }))"));
    const sr = small.warnings.map((w) => w.rule);
    ok("ui (check): UI text under 0.04 of the frame height and a hero under 0.55 W that the frame does not crop both warn", !small.ok && sr.includes("text-too-small") && sr.includes("hero-too-small"), JSON.stringify(small).slice(0, 500));
    const strict = await ev("(function(){try{window.__U.check({ at: [0.5], log: false, strict: true });return 'no throw';}catch(e){return String(e.message);}})()");
    ok("ui (check): strict mode throws on a violation", /text-too-small/.test(strict), strict);
  } catch (e) {
    ok("ui: the headless checks ran", false, String((e && e.stack) || e).split("\n").slice(0, 3).join(" | "));
  } finally {
    try { if (b) await b.close(); } catch {}
    await srv.close();
  }
}
