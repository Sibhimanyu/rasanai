// motion-gate.mjs on synthetic films: a continuously moving film passes; a 1.2 s freeze, a creeping zoom and a resting
// seam each fail with their time; the code half finds an unmounted carrier, an early brand mark and a parked line.
// export default async function ({ ok, node, tmp }).
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export default async function ({ ok, node, tmp }) {
  const root = path.join(tmp, "motion-gate-test");
  fs.mkdirSync(root, { recursive: true });
  const ff = (argv) => spawnSync("ffmpeg", ["-y", "-v", "error", ...argv], { encoding: "utf8" });
  const json = (r) => { try { return JSON.parse(r.stdout); } catch { return {}; } };
  if (ff(["-version"]).error) { console.log("note  motion-gate: ffmpeg is not installed, tests skipped"); return; }
  const f = (n) => path.join(root, n);
  const src = ["-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30"];
  const made = [
    ff([...src, "-t", "6", "-pix_fmt", "yuv420p", f("moving.mp4")]),
    // a 1.2 s freeze at 2.0 s (frame 60 repeated 36 times)
    ff([...src, "-t", "6", "-vf", "loop=loop=36:size=1:start=60,setpts=N/30/TB", "-t", "6", "-pix_fmt", "yuv420p", f("freeze.mp4")]),
    // a 0.53 s stop across the 2 s seam: under the freeze limit, but both sides of the cut at rest
    ff([...src, "-t", "6", "-vf", "loop=loop=16:size=1:start=53,setpts=N/30/TB", "-t", "6", "-pix_fmt", "yuv420p", f("rest.mp4")]),
    ff([...src, "-frames:v", "1", f("still.png")]),
  ];
  // a centred zoom of about 2% a second on a still (it changes every frame, so a frame-difference count calls it motion)
  made.push(ff(["-loop", "1", "-i", f("still.png"), "-vf", "scale=2560:1440,zoompan=z='1+0.00067*on':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=180:s=640x360:fps=30", "-frames:v", "180", "-pix_fmt", "yuv420p", f("creep.mp4")]));
  // a real move: the same zoom at 36% a second
  made.push(ff(["-loop", "1", "-i", f("still.png"), "-vf", "scale=2560:1440,zoompan=z='1+0.012*on':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=180:s=640x360:fps=30", "-frames:v", "180", "-pix_fmt", "yuv420p", f("fast.mp4")]));
  ok("motion-gate: synthesised the test films", made.every((r) => r.status === 0), made.map((r) => r.stderr).join(" ").slice(0, 300));
  const plan = f("score.json");
  fs.writeFileSync(plan, JSON.stringify({ brandReveal: "cta", scenes: [{ id: "hook", start: 0, end: 2, exit: "carrier", carrier: "the card" }, { id: "proof", start: 2, end: 4, exit: "carrier", carrier: "the mark" }, { id: "cta", start: 4, end: 6 }] }));
  const G = (video, extra = []) => { const r = node("motion-gate.mjs", ["--video", f(video), "--plan", plan, "--json", ...extra]); return { r, j: json(r) }; };
  const has = (j, check, at) => (j.findings || []).some((x) => x.check === check && (at == null || Math.abs(Number(x.at) - at) <= 0.25));

  const mv = G("moving.mp4");
  ok("motion-gate: a continuously moving film passes (exit 0, every frame moving, seams moving on both sides)", mv.r.status === 0 && mv.j.verdict === "pass" && mv.j.measured.coverage >= 0.95 && (mv.j.measured.seams || []).length === 2, JSON.stringify(mv.j).slice(0, 400));
  const fz = G("freeze.mp4");
  ok("motion-gate: a 1.2 s freeze fails (exit 2) with its time", fz.r.status === 2 && has(fz.j, "freeze", 2) && /1\.\d+ s/.test((fz.j.findings || []).find((x) => x.check === "freeze").message), JSON.stringify(fz.j.findings).slice(0, 400));
  const cr = G("creep.mp4");
  ok("motion-gate: a creeping zoom fails as a creep, though every frame changes", cr.r.status === 2 && has(cr.j, "creep") && /zoom/.test((cr.j.findings || []).find((x) => x.check === "creep").message) && cr.j.measured.coverage >= 0.9, JSON.stringify(cr.j.findings).slice(0, 400));
  const fa = G("fast.mp4");
  ok("motion-gate: a real zoom (36% a second) is not a creep", !has(fa.j, "creep"), JSON.stringify(fa.j.findings).slice(0, 300));
  const rs = G("rest.mp4");
  ok("motion-gate: a seam with both sides at rest fails at the seam's time (and is no freeze)", rs.r.status === 2 && has(rs.j, "seam", 2) && !has(rs.j, "freeze"), JSON.stringify(rs.j.findings).slice(0, 400));
  // the end card: a 2 s still tail fails; a brief's longer hold (end_hold_s) lifts it
  ff(["-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30:d=4", "-vf", "tpad=stop_mode=clone:stop_duration=2", "-pix_fmt", "yuv420p", f("tail.mp4")]);
  const tl = G("tail.mp4");
  const tl2 = G("tail.mp4", ["--end-hold", "2.5"]);
  ok("motion-gate: the end card holds at most 1.5 s still after its last move (--end-hold lifts it)", has(tl.j, "end-hold") && !has(tl2.j, "end-hold") && !has(tl.j, "freeze"), JSON.stringify(tl.j.findings).slice(0, 300));
  const nothing = node("motion-gate.mjs", ["--json"]);
  ok("motion-gate: with nothing to measure it says could not run (exit 1), never pass", nothing.status === 1 && json(nothing).verdict === "could not run");

  // the code half: carriers measured from index.html, the one brand reveal, parked lines
  const pj = f("proj");
  fs.mkdirSync(path.join(pj, "compositions", "frames"), { recursive: true });
  fs.mkdirSync(path.join(pj, "compositions", "carriers"), { recursive: true });
  const comp = (id, dur, body, js, start) => `<template><div data-composition-id="${id}" data-width="1920" data-height="1080"${start != null ? ` data-start="${start}"` : ""} data-duration="${dur}">${body}</div><script>const tl=gsap.timeline({paused:true});${js}window.__timelines["${id}"]=tl;</script></template>`;
  fs.writeFileSync(path.join(pj, "compositions", "frames", "01-hook.html"), comp("hook", 2, `<div id="hk-wrap"><h1 id="hk-line">Stop hunting for the link</h1></div>`, `tl.fromTo("#hk-line",{opacity:0,y:30},{opacity:1,y:0,duration:0.5,ease:"power3.out"},0.1);tl.to("#hk-line",{opacity:0,duration:0.3,ease:"power2.in"},1.7);`));
  fs.writeFileSync(path.join(pj, "compositions", "frames", "02-proof.html"), comp("proof", 2, `<div id="pf-carry"><h2 id="pf-line">Click Open and it opens</h2></div><img id="pf-logo" data-brand-mark src="assets/brand/logo.svg">`, `tl.fromTo("#pf-line",{opacity:0,x:200},{opacity:1,x:0,duration:0.5,ease:"power3.out"},0);tl.fromTo("#pf-carry",{x:0},{x:-160,duration:2,ease:"none"},0);`));
  fs.writeFileSync(path.join(pj, "compositions", "frames", "03-cta.html"), comp("cta", 2, `<img id="ct-logo" data-brand-mark src="assets/brand/logo.svg">`, ""));
  fs.writeFileSync(path.join(pj, "compositions", "carriers", "card.html"), comp("card", 4, `<div id="card"></div>`, "", 1));
  fs.writeFileSync(path.join(pj, "compositions", "carriers", "mark.html"), comp("mark", 2.5, `<div id="mk"></div>`, "", 3.5));
  // the root carries a film-wide push of 1.0 to 1.08 over 6 s (1.3% a second): the creep the frames alone can miss
  fs.writeFileSync(path.join(pj, "index.html"), `<html><body><div id="root" data-composition-id="main" data-duration="6"><div id="world"><div class="clip" data-composition-src="compositions/frames/01-hook.html" data-start="0" data-duration="2" data-track-index="1"></div><div class="clip" data-composition-src="compositions/frames/02-proof.html" data-start="2" data-duration="2" data-track-index="1"></div><div class="clip" data-composition-src="compositions/frames/03-cta.html" data-start="4" data-duration="2" data-track-index="1"></div></div></div><script>const tl=gsap.timeline({paused:true});tl.fromTo("#world",{scale:1},{scale:1.08,duration:6,ease:"none"},0);window.__timelines["main"]=tl;</script></body></html>`);
  const c1 = json(node("motion-gate.mjs", ["--project", pj, "--plan", plan, "--json"]));
  ok("motion-gate: the code half finds no mounted carrier, a brand mark before the reveal, a parked line and a slow film-wide push (and leaves the moving line alone)", has(c1, "carriers") && (c1.findings || []).some((x) => x.check === "reveal" && /02-proof/.test(x.element || "")) && (c1.findings || []).some((x) => x.check === "parked" && x.element === "#hk-line") && (c1.findings || []).some((x) => x.check === "creep" && /#world/.test(x.element || "")) && !(c1.findings || []).some((x) => x.element === "#pf-line"), JSON.stringify(c1.findings).slice(0, 500));
  const mount = node("video.mjs", ["carriers", "--project-dir", pj]);
  const c2 = json(node("motion-gate.mjs", ["--project", pj, "--plan", plan, "--json"]));
  const idx = fs.readFileSync(path.join(pj, "index.html"), "utf8");
  node("video.mjs", ["carriers", "--project-dir", pj]);
  ok("motion-gate + video.mjs carriers: once the carriers are mounted on their own tracks, two seams are carried (and mounting twice changes nothing)", mount.status === 0 && !has(c2, "carriers") && c2.measured.carried_seams === 2 && /data-track-index="3"/.test(idx) && fs.readFileSync(path.join(pj, "index.html"), "utf8") === idx, (mount.stderr || "") + JSON.stringify(c2.findings).slice(0, 300));
}
