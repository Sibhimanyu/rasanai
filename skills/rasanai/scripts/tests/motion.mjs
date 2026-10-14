// selftest section "motion" (W7): the fluent contract, obey's mix rules, effect budgets, the RasanMotion runtime and the
// fluency gate. export default async function ({ ok, node, tmp, quick }).
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { shapeOfName, durationsFor, fluentFields } from "../lib/fluent.mjs";
import { scoreFluency, analyse } from "../lib/fluency.mjs";

const HERE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const json = (r) => { try { return JSON.parse(r.stdout); } catch { return {}; } };

export default async function ({ ok, node, tmp }) {
  const T = path.join(tmp, "motion-w7");
  fs.mkdirSync(T, { recursive: true });
  const gsap = `<script src="file://${path.join(HERE, "vendor", "gsap.min.js")}"></script>`;

  // ---- the curve families the contract names are really different shapes
  const fams = ["cubic-bezier(0.05,0.7,0.1,1)", "cubic-bezier(0.2,0,0,1)", "cubic-bezier(0.4,0.14,0.3,1)", "cubic-bezier(0.3,0,0.8,0.15)", "spring(0.68,12)", "sine.inOut"].map((c) => shapeOfName(c).family);
  ok("motion: the role curves fall in six different families (launch, glide, expressive, exit, settle, drift)", new Set(fams).size === 6, fams.join(","));
  ok("motion: the settle spring overshoots 3-8% and expo.out reads as a snap", shapeOfName("spring(0.68,12)").overshoot_pct >= 3 && shapeOfName("spring(0.68,12)").overshoot_pct <= 8 && shapeOfName("expo.out").family === "snap");
  const slow = durationsFor({ tempo: { scale_ms: [600, 900, 1400, 2000, 2800] } }), fast = durationsFor({ tempo: { scale_ms: [120, 200, 320, 480, 720] } });
  ok("motion: the language's pace scales the distance formula (luxurious slower than snappy)", slow.max_ms > fast.max_ms && slow.pace > fast.pace);
  const rigid = fluentFields({ language: "robotic", easing: { enter: "power3.inOut", exit: "power3.in", move: "power3.inOut" }, banned: ["overshoot"], tempo: { scale_ms: [120, 200, 300, 450, 700] } });
  ok("motion: a rigid language keeps exact landings and straight paths", rigid.overshoot.share === 0 && rigid.arcs.min_travel_pct === 100 && rigid.mix.min_families === 3);

  // ---- motion.md: curves by role, a settle budget, durations from distance; no overshoot ban outside rigid languages
  const md = path.join(T, "precise", "motion.md");
  node("motion-md.mjs", ["write", "--language", "precise", "--out", md]);
  const txt = fs.existsSync(md) ? fs.readFileSync(md, "utf8") : "";
  const fm = (k) => { const m = txt.match(new RegExp(`^${k}: (.*)$`, "m")); try { return m ? JSON.parse(m[1]) : null; } catch { return null; } };
  ok("motion: motion.md (precise) carries curves by role, durations, the mix, a settle budget and no overshoot ban", fm("curves") && Object.keys(fm("curves")).length >= 7 && fm("durations") && fm("durations").min_ms > 0 && fm("mix") && fm("overshoot") && fm("overshoot").share > 0 && !(fm("banned") || []).includes("overshoot") && /Curves by role/.test(txt) && !/snap to the scale/.test(txt), txt.slice(0, 400));
  const mr = path.join(T, "robotic", "motion.md");
  node("motion-md.mjs", ["write", "--language", "robotic", "--out", mr]);
  ok("motion: motion.md (robotic) keeps its overshoot ban and a zero budget", /"overshoot"/.test((fs.readFileSync(mr, "utf8").match(/^banned:.*$/m) || [""])[0]) && /^overshoot: \{"share":0/m.test(fs.readFileSync(mr, "utf8")));
  const ms = path.join(T, "stiff", "motion.md");
  node("motion-md.mjs", ["write", "--language", "precise", "--adjust", "stiffer", "--out", ms]);
  ok("motion: --adjust stiffer shrinks the settle budget instead of banning it", /^overshoot: \{"share":0\.06,"max_pct":3\}/m.test(fs.readFileSync(ms, "utf8")));

  // ---- obey: the uniform pattern is the tell
  const proj = (name, body, rootAttrs = "", lang = "precise") => {
    const d = path.join(T, name);
    fs.mkdirSync(d, { recursive: true });
    node("motion-md.mjs", ["write", "--language", lang, "--out", path.join(d, "motion.md")]);
    if (body.install) node("motionkit.mjs", ["install", "--project", d]); // the runtime with this motion.md baked in
    const els = Array.from({ length: 16 }, (_, i) => `<div class="r" id="r${i}" style="position:absolute;left:${40 + (i % 4) * 300}px;top:${60 + Math.floor(i / 4) * 200}px;width:220px;height:120px;background:#222">R${i}</div>`).join("");
    fs.writeFileSync(path.join(d, "index.html"), `<html><head>${gsap}${body.head || ""}</head><body><div id="root" data-composition-id="m" data-width="1920" data-height="1080"${rootAttrs}>${els}<div id="world"></div></div><script>var tl=gsap.timeline({paused:true});${body.js}window.__timelines={m:tl};</script></body></html>`);
    const r = node("obey.mjs", ["--project", d, "--json", ...(body.args || [])]);
    const j = json(r);
    return { status: r.status, j, rules: (j.findings || []).filter((f) => f.severity === "error").map((f) => f.rule), warns: (j.findings || []).filter((f) => f.severity === "warning").map((f) => f.rule), out: r.stdout };
  };
  const uniform = proj("uniform", { js: `for(var i=0;i<14;i++){tl.fromTo("#r"+i,{clipPath:"inset(0% 100% 0% 0%)"},{clipPath:"inset(0% 0% 0% 0%)",duration:0.45,ease:"expo.out"},0.5+i*0.08);} tl.fromTo(".r",{yPercent:0},{yPercent:-5,duration:0.45,ease:"expo.out",stagger:0.08},3);` });
  ok("motion (obey): one ease, one duration, an even stagger and a metronome cascade fail as dominant-ease, few-curves, duration-grid, even-stagger and uniform-cascade (exit 2)", uniform.status === 2 && ["dominant-ease", "few-curves", "duration-grid", "even-stagger", "uniform-cascade"].every((x) => uniform.rules.includes(x)), JSON.stringify(uniform.rules));
  ok("motion (obey): FILM-C's pattern no longer fails duration-off-scale or custom-ease (those rules are gone)", !uniform.rules.some((x) => /duration-off-scale|custom-ease|ease-outside-set/.test(x)));
  const off = proj("preview", { js: `for(var i=0;i<14;i++){tl.fromTo("#r"+i,{clipPath:"inset(0% 100% 0% 0%)"},{clipPath:"inset(0% 0% 0% 0%)",duration:0.45,ease:"expo.out"},0.5+i*0.08);}` }, ' data-obey-mix="off"');
  ok("motion (obey): a preview page marked data-obey-mix=\"off\" is not judged on the mix", off.status === 0 && off.j.mix && off.j.mix.judged === false, JSON.stringify(off.j.mix));
  // the same content written with the vocabulary
  const fluent = proj("fluent", { install: true, head: '<script src="assets/rasan-motion/rasan-motion.js"></script>', js: `var M=RasanMotion.kit(tl,{seed:"selftest"});M.camera("#world",{at:0,dur:6});var h=M.enter("#r0",{how:"wipe",from:"left",at:0.1});var c=M.cascade(["#r1","#r2","#r3","#r4"],{at:h.next,how:"scale"});var t=M.travel("#r5",{dx:-520,dy:90,at:c.next,trail:["#r6"]});M.land("#r7",{dy:-260,at:t.next});var a=M.travel("#r8",{dx:60,dy:0,at:t.next});var b=M.travel("#r9",{dx:900,dy:-200,at:a.next});M.follow("#r10",b);M.enter("#r11",{how:"focus",at:b.next});M.enter("#r12",{how:"fly",from:"right",dist:500,at:b.next+0.2});M.exit("#r13",{how:"fade",at:4.6});M.exit("#r14",{how:"fly",to:"left",at:4.8});window.__audit=M.audit();` });
  ok("motion (obey): the same content written with RasanMotion passes the mix (judged, no errors)", fluent.status === 0 && fluent.j.mix && fluent.j.mix.judged && !fluent.rules.length, JSON.stringify({ rules: fluent.rules, mix: fluent.j.mix }).slice(0, 400));
  // effect budgets (W4): a banned scale-pop passes on the budgeted hero only
  const score = path.join(T, "score.json");
  fs.writeFileSync(score, JSON.stringify({ duration: 20, budget: [{ effect: "scale-pop", scene: 1, target: "#r0", reason: "the one moment the answer lands" }] }));
  const popJs = (ids) => ids.map((i) => `tl.fromTo("#r${i}",{scale:0.4},{scale:1,duration:${(0.5 + i * 0.07).toFixed(2)},ease:"back.out(1.4)"},${i * 0.3});`).join("");
  const pop1 = proj("pop1", { js: popJs([0]), args: ["--score", score] }, "", "smooth");
  const pop0 = proj("pop0", { js: popJs([0]) }, "", "smooth");
  ok("motion (obey): a scale-pop on the hero named in score.budget passes; without the budget it is banned", pop1.status === 0 && pop0.rules.includes("banned:scale-pop"), JSON.stringify([pop1.rules, pop0.rules]));
  fs.writeFileSync(score, JSON.stringify({ duration: 20, budget: [{ effect: "scale-pop", scene: 1, target: "#r", reason: "every card pops in, on purpose" }] }));
  const pop4 = proj("pop4", { js: popJs([0, 1, 2, 3]), args: ["--score", score] }, "", "smooth");
  ok("motion (obey): the same budgeted effect on more elements than the film's limit is the uniform tell again (error)", pop4.rules.filter((x) => x === "banned:scale-pop").length >= 2, JSON.stringify(pop4.rules));

  // ---- frame budgets: obey warns (never errors) on entrance lengths and growth from zero
  const bud = proj("budgets", { js: `tl.fromTo("#r0",{autoAlpha:0},{autoAlpha:1,duration:1.6,ease:"expo.out"},0.2);tl.fromTo("#r1",{autoAlpha:0},{autoAlpha:1,duration:0.05,ease:"expo.out"},0.8);tl.fromTo("#r2",{scale:0},{scale:1,duration:0.5,ease:"expo.out"},1.2);` }, ' data-obey-mix="off"');
  ok("motion (obey): an entrance over 1.2 s, one under 3 f and a scale from zero are warnings (entrance-too-long, entrance-too-short, scale-from-zero), not errors", ["entrance-too-long", "entrance-too-short", "scale-from-zero"].every((x) => bud.warns.includes(x)) && !bud.rules.includes("entrance-too-long") && !bud.rules.includes("scale-from-zero"), JSON.stringify([bud.warns, bud.rules]));
  const ok1 = proj("budgets-ok", { js: `tl.fromTo("#r0",{autoAlpha:0,y:30},{autoAlpha:1,y:0,duration:0.4,ease:"expo.out"},0.2);` }, ' data-obey-mix="off"');
  ok("motion (obey): a 0.4 s entrance raises none of the frame-budget warnings", !ok1.warns.some((x) => /^entrance-too|^scale-from-zero/.test(x)), JSON.stringify(ok1.warns));

  // ---- the measured eases: 12 closed-form functions, f(0)=0, f(1)=1, deterministic, found by name
  {
    const { createRequire } = await import("node:module");
    const RM = createRequire(import.meta.url)(path.join(HERE, "..", "runtime", "rasan-motion.js"));
    const names = ["cruise", "glide", "softInOut", "softLand", "gentleIn", "snapSettle", "whip", "accelExit", "crashOut", "popOver", "crashIn", "bounceHard"];
    const fine = names.every((n) => { const f = RM.measured[n]; return typeof f === "function" && f(0) === 0 && f(1) === 1 && f(0.37) === f(0.37) && Number.isFinite(f(0.37)); });
    ok("motion (runtime): the twelve measured eases exist, start at 0, end at 1 and are pure functions of progress", fine && Object.keys(RM.measured).length === 12, Object.keys(RM.measured).join(","));
    ok("motion (runtime): measured eases are found by name, the glide role curve is unchanged, and the measured glide is measured.glide", RM.ease("softLand").rasanCurve === "softLand" && RM.ease("softLand")(0.1) === RM.measured.softLand(0.1) && RM.ease("measured.glide")(0.5) === RM.measured.glide(0.5) && RM.ease("measuredGlide")(0.5) === RM.measured.glide(0.5) && RM.ease("glide")(0.5) !== RM.measured.glide(0.5) && RM.curves.glide === "cubic-bezier(0.2,0,0,1)");
    ok("motion (runtime): the measured shapes match the published table (softLand 30% at 10%, accelExit 47% at 75%, popOver peaks near 1.08)", Math.abs(RM.measured.softLand(0.1) - 0.30) < 0.01 && Math.abs(RM.measured.accelExit(0.75) - 0.47) < 0.01 && Math.abs(Math.max(...Array.from({ length: 200 }, (_, i) => RM.measured.popOver(i / 200))) - 1.08) < 0.02);
  }

  // ---- the runtime: check and the headless demo
  const kp = path.join(T, "kitproj");
  fs.mkdirSync(path.join(kp, "compositions"), { recursive: true });
  fs.writeFileSync(path.join(kp, "compositions", "a.html"), `<template><script src="gsap.min.js"></script><script src="../assets/rasan-motion/rasan-motion.js"></script><script>const tl=gsap.timeline({paused:true});var M=RasanMotion.kit(tl,{seed:"a"});window.__timelines.a=tl</script></template>`);
  const k0 = node("motionkit.mjs", ["check", "--project", kp]);
  node("motionkit.mjs", ["install", "--project", kp]);
  const k1 = node("motionkit.mjs", ["check", "--project", kp]);
  fs.writeFileSync(path.join(kp, "compositions", "b.js"), `RasanMotion.kit(tl, { seed: Math.random() })`);
  const k2 = node("motionkit.mjs", ["check", "--project", kp]);
  ok("motion (kit): check wants the runtime installed, then is clean, and flags Math.random next to RasanMotion", k0.status === 2 && /runtime-missing/.test(k0.stdout) && k1.status === 0 && k2.status === 2 && /nondeterministic/.test(k2.stdout), [k0.stdout, k1.stdout, k2.stdout].join(" | ").slice(0, 400));
  const dd = path.join(T, "demo");
  const dm = json(node("motionkit.mjs", ["demo", "--out", dd]));
  if (!dm.cells) console.log("skip  motion (kit) demo: headless Chrome not available");
  else ok("motion (kit): the headless demo changes every cell over time, seeks identically twice, and the kit's own audit is fluent (no curve over 40%, 4+ durations)", dm.ok === true && dm.cells.every((c) => c.changes && c.seek_identical) && fs.existsSync(path.join(dd, "strip.png")), JSON.stringify(dm.failing || dm.audit).slice(0, 300));

  // ---- the fluency gate: the calibration rows score as measured (done-W7.md), stillness waives activity, few moves is not judged
  const C = { moves: 70, shape_iqr: 0.112, conc_ge2: 0.59, move_dur_med: 0.3, overshoot_share: 0.125, dur_entropy: 0.875, arc_share: 0.462, dead_frac: 0.078, cut_still: 0 };
  const K = { moves: 76, shape_iqr: 0.45, conc_ge2: 0.687, move_dur_med: 0.3, overshoot_share: 0.066, dur_entropy: 0.878, arc_share: 0.375, dead_frac: 0.2, cut_still: 0 };
  const O = { moves: 93, shape_iqr: 0.287, conc_ge2: 0.457, move_dur_med: 0.3, overshoot_share: 0.065, dur_entropy: 0.87, arc_share: 0.355, dead_frac: 0.37, cut_still: 0.579 };
  ok("motion (fluency): FILM-C fails, Kinso passes, OpenAI passes only as a declared stillness style, 12 moves is not judged", scoreFluency(C).pass === false && scoreFluency(K).pass === true && scoreFluency(O).pass === false && scoreFluency(O, { stillness: true }).pass === true && scoreFluency({ ...K, moves: 12 }).insufficient === true);
  if (spawnSync("ffmpeg", ["-version"]).status !== 0) { console.log("skip  motion (fluency) on a rendered clip: no ffmpeg"); return; }
  const clip = path.join(T, "clip.mp4");
  spawnSync("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30:d=3", "-pix_fmt", "yuv420p", clip]);
  let m = null;
  try { m = await analyse(clip); } catch (e) { m = { error: e.message }; }
  ok("motion (fluency): the Node analyser measures a rendered clip (moves, concurrency, dead frames)", m && m.seconds > 2.5 && typeof m.conc_ge2 === "number" && typeof m.dead_frac === "number" && m.moves >= 0, JSON.stringify(m).slice(0, 300));
  const g = node("motion-gate.mjs", ["fluency", "--video", clip, "--json"]);
  ok("motion (fluency): motion-gate.mjs fluency prints the measurement and its verdict", json(g).fluency && "score" in json(g).fluency, g.stdout.slice(0, 200));
}
