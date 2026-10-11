// text-fit on a tiny fixture project: a composition with a line that overflows the frame, a line that sits outside the
// safe area at rest, a fitting line, a deliberate 0.2 s push-through (the allowance is 1.2 s), an off-screen line waiting to enter and a line
// masked by an overflow:hidden parent. motion-gate.mjs --project and slop.mjs --project report `text-cropped` for the
// first two (with the time range and the text) and nothing else. Skipped with a note when no Chrome is available.
// export default async function ({ ok, node, tmp }).
import fs from "node:fs";
import path from "node:path";

export default async function ({ ok, node, tmp }) {
  const json = (r) => { try { return JSON.parse(r.stdout); } catch { return {}; } };
  const mk = (name, body, script = "") => {
    const root = path.join(tmp, `textfit-${name}`);
    fs.mkdirSync(path.join(root, "compositions", "frames"), { recursive: true });
    fs.writeFileSync(path.join(root, "index.html"), `<!doctype html><html><head></head><body>
<div id="root" data-composition-id="main" data-width="1920" data-height="1080" data-start="0" data-duration="3">
<div data-composition-src="compositions/frames/f1.html" data-composition-id="f1" data-start="0" data-duration="3" data-track-index="1"></div>
</div></body></html>`);
    fs.writeFileSync(path.join(root, "compositions", "frames", "f1.html"), `<template id="f1"><div data-composition-id="f1" data-width="1920" data-height="1080" data-duration="3" style="position:relative;width:1920px;height:1080px">
${body}
<script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>
<script>var tl=gsap.timeline({paused:true});${script}window.__timelines=window.__timelines||{};window.__timelines["f1"]=tl;</script>
</div></template>`);
    return root;
  };
  const fits = '<h2 id="ok" style="position:absolute;left:160px;width:1600px;text-align:center;top:480px;font:600 80px/1 Arial;margin:0">Ask anything</h2>';
  const over = '<h1 id="big" style="position:absolute;left:-200px;top:200px;font:900 220px/1 Arial;white-space:nowrap;margin:0">Overflowing headline here</h1>';
  const safeBad = '<p id="near" style="position:absolute;left:30px;top:900px;font:600 48px/1 Arial;margin:0;white-space:nowrap">Too close to the edge</p>';
  const calm = [
    fits,
    // enters from beyond the right edge in 0.2 s (a push-through), then rests inside
    '<h3 id="push" style="position:absolute;left:900px;top:700px;font:600 60px/1 Arial;margin:0;white-space:nowrap">Pushing through</h3>',
    // waits fully off screen until 2 s
    '<h3 id="wait" style="position:absolute;left:2200px;top:800px;font:600 60px/1 Arial;margin:0;white-space:nowrap">Waiting off screen</h3>',
    // masked by its parent: only a sliver shows
    '<div style="position:absolute;left:160px;top:300px;width:600px;height:20px;overflow:hidden"><span style="display:block;font:600 90px/1 Arial;white-space:nowrap;position:relative;left:2400px">Masked line far away</span></div>',
    // tiny text is not a headline
    '<small style="position:absolute;left:-40px;top:20px;font:12px Arial">tiny footnote bleeding</small>',
  ].join("\n");
  const calmJs = 'tl.from("#push",{x:1200,duration:0.2},0.5);tl.to("#wait",{x:-1000,duration:0.2},2);';

  const clean = mk("clean", calm, calmJs);
  const over1 = mk("overflow", fits + over + safeBad);
  const hasBrowser = (() => { const r = node("motion-gate.mjs", ["--project", clean, "--json"]); return !(json(r).skipped || []).some((x) => /text-fit: no Chrome|text-fit:.*Chrome/i.test(x)); })();
  if (!hasBrowser) { console.log("note  textfit: no Chrome, tests skipped"); return; }

  const g1 = node("motion-gate.mjs", ["--project", clean, "--json"]);
  const j1 = json(g1);
  ok("text-fit: a fitting line, a 0.2 s push-through, an off-screen waiting line, a masked line and tiny text are not text-cropped", !(j1.findings || []).some((f) => f.check === "text-cropped") && j1.measured && j1.measured.text_fit && j1.measured.text_fit.samples >= 30, JSON.stringify(j1.findings || []).slice(0, 400));
  // an oversize word may sweep across the frame cropped for up to 1.2 s, then rest readable (push-through allowance 1.2 s)
  const sw = '<h3 id="sw" style="position:absolute;left:900px;top:700px;font:600 60px/1 Arial;margin:0;white-space:nowrap">Sweeping word</h3>';
  const sweepOk = mk("sweep-ok", fits + sw, 'tl.from("#sw",{x:1100,duration:1.8,ease:"none"},0);');
  const sweepSlow = mk("sweep-slow", fits + sw, 'tl.from("#sw",{x:1100,duration:4,ease:"none"},0);');
  const sj1 = json(node("motion-gate.mjs", ["--project", sweepOk, "--json"])), sj2 = json(node("motion-gate.mjs", ["--project", sweepSlow, "--json"]));
  ok("text-fit: a word that sweeps across the frame edge for under 1.2 s and then rests is not text-cropped; one cropped for over 1.2 s is", !(sj1.findings || []).some((f) => f.check === "text-cropped" && /Sweeping/.test(f.text)) && (sj2.findings || []).some((f) => f.check === "text-cropped" && /Sweeping/.test(f.text)), JSON.stringify([sj1.findings, sj2.findings]).slice(0, 400));
  const g2 = node("motion-gate.mjs", ["--project", over1, "--json"]);
  const j2 = json(g2);
  const tc = (j2.findings || []).filter((f) => f.check === "text-cropped");
  const big = tc.find((f) => /Overflowing headline/.test(f.text));
  const near = tc.find((f) => /Too close/.test(f.text));
  ok("text-fit: motion-gate fails (exit 2) an overflowing line with error text-cropped, its text and its time range", g2.status === 2 && big && big.severity === "error" && big.from === 0 && big.to === 3 && /crosses the left edge/.test(big.message), JSON.stringify(tc).slice(0, 400));
  ok("text-fit: a line outside the 6% safe area at rest is text-cropped too; the fitting line is not", !!near && /safe area/.test(near.message) && !tc.some((f) => /Ask anything/.test(f.text)), JSON.stringify(tc).slice(0, 400));
  ok("text-fit: --no-text-fit skips the measurement", !(json(node("motion-gate.mjs", ["--project", over1, "--no-text-fit", "--json"])).findings || []).some((f) => f.check === "text-cropped"));
  const s2 = node("slop.mjs", ["--project", over1, "--json"]);
  const sj = json(s2);
  ok("text-fit: slop.mjs reports the same overflow as rule text-cropped (exit 2)", s2.status === 2 && (sj.findings || []).some((f) => f.rule === "text-cropped" && /Overflowing headline/.test(f.where)), s2.stdout.slice(0, 300));
  const s1 = json(node("slop.mjs", ["--project", clean, "--json"]));
  ok("text-fit: slop.mjs does not flag the fitting project", !(s1.findings || []).some((f) => f.rule === "text-cropped"), JSON.stringify(s1.findings || []).slice(0, 300));
}
