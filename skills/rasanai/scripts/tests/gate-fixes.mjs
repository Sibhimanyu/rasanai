// Round 4 gate fixes (V): carry credits a same-object cut-in at another scale; text-fit finds letters cut off by a mask (text-cropped, region
// "mask") and judges a typed-and-swapped slot per string (text-too-brief); a lesson gets a direction (motion.end_hold_min_s is a floor, read by
// the motion gate as end-hold-short: a warning, an error once taught; lessons.mjs list and brief say which way a key tightens); a script error
// that stops a composition's timeline is the motion gate's error script-error. Chrome and ffmpeg are needed; each part is skipped with a note without them.
// export default async function ({ ok, node, tmp, env }).
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export default async function ({ ok, node, tmp, env }) {
  const json = (r) => { try { return JSON.parse(r.stdout); } catch { return {}; } };
  const scripts = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
  const home = path.join(tmp, "gatefix-home");
  fs.mkdirSync(home, { recursive: true });
  const gate = (args, homeDir = home) => json(spawnSync(process.execPath, [path.join(scripts, "motion-gate.mjs"), ...args, "--json"], { encoding: "utf8", env: { ...process.env, ...(env || {}), RASANAI_HOME: homeDir }, timeout: 180000 }));
  const lessons = (args, homeDir = home) => spawnSync(process.execPath, [path.join(scripts, "lessons.mjs"), ...args], { encoding: "utf8", env: { ...process.env, ...(env || {}), RASANAI_HOME: homeDir } });
  const found = (j, check, sev) => (j.findings || []).filter((f) => f.check === check && (!sev || f.severity === sev));

  // ---- 6: the lesson key's direction
  const { GATE_KEYS, wayOf, parseGate } = await import("../lib/gate-lessons.mjs");
  ok("gate lessons: motion.end_hold_min_s is a floor (min) and motion.end_hold_s a ceiling (max); wayOf says so", GATE_KEYS["motion.end_hold_min_s"].dir === "min" && GATE_KEYS["motion.end_hold_s"].dir === "max" && /floor.*larger/.test(wayOf("motion.end_hold_min_s")) && /ceiling.*smaller/.test(wayOf("motion.end_hold_s")), wayOf("motion.end_hold_min_s"));
  ok("gate lessons: every key says in its what whether it is a floor or ceiling, or has a direction the report can print", Object.keys(GATE_KEYS).every((k) => ["min", "max"].includes(GATE_KEYS[k].dir) && wayOf(k)));
  ok("gate lessons: --gate motion.end_hold_min_s=1 parses; a value out of its range is refused", parseGate("motion.end_hold_min_s=1").value === 1 && (() => { try { parseGate("motion.end_hold_min_s=9"); return false; } catch { return true; } })());
  const lh = path.join(tmp, "gatefix-lessons-home");
  fs.mkdirSync(lh, { recursive: true });
  const add = lessons(["add", "--rule", "The ending must not flash by", "--quote", "the ending flashes by", "--kind", "error", "--area", "motion", "--gate", "motion.end_hold_min_s=1.0"], lh);
  ok("lessons: list and brief show the gate with its direction (a floor: larger is stricter)", add.status === 0 && /gate motion\.end_hold_min_s = 1, a floor/.test(lessons(["list"], lh).stdout) && /now measured: motion\.end_hold_min_s = 1\) \(a floor/.test(lessons(["brief", "--role", "critic"], lh).stdout), add.stdout + add.stderr + lessons(["list"], lh).stdout);

  // ---- ffmpeg: end-hold-short and the cut-in
  const ff = (argv) => spawnSync("ffmpeg", ["-y", "-v", "error", ...argv], { encoding: "utf8" });
  if (ff(["-version"]).error) console.log("note  gate-fixes: ffmpeg is not installed, the video tests are skipped");
  else {
    const root = path.join(tmp, "gatefix-video");
    fs.mkdirSync(root, { recursive: true });
    const f = (n) => path.join(root, n);
    const made = [
      ff(["-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30:d=3", "-vf", "format=yuv420p", f("flash.mp4")]), // moves to its last frame
      ff(["-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30:d=3", "-vf", "tpad=stop_mode=clone:stop_duration=1,format=yuv420p", f("held.mp4")]), // then holds 1 s
    ];
    ok("gate-fixes: synthesised the end-hold films", made.every((r) => r.status === 0), made.map((r) => r.stderr).join(" ").slice(0, 300));
    const vg = (name, h) => gate(["--video", f(name), "--no-fluency", "--no-carry", "--end-hold", "2"], h);
    const w1 = found(vg("flash.mp4"), "end-hold-short");
    ok("motion-gate: a film that moves to its last frame warns end-hold-short (a warning by default)", w1.length === 1 && w1[0].severity === "warning" && /flashes by/.test(w1[0].message), JSON.stringify(w1));
    ok("motion-gate: a film that holds its end 1 s does not", !found(vg("held.mp4"), "end-hold-short").length);
    const t1 = vg("flash.mp4", lh), t2 = vg("held.mp4", lh);
    ok("motion-gate: once taught (motion.end_hold_min_s = 1) the short end hold is an error and the report lists the lesson", found(t1, "end-hold-short", "error").length === 1 && (t1.notes || []).some((n) => /motion\.end_hold_min_s = 1/.test(n)), JSON.stringify(t1.findings).slice(0, 300));
    ok("motion-gate: a 1 s hold meets a 1 s floor (a taught floor passes a film that holds)", !found(t2, "end-hold-short").length, JSON.stringify(t2.findings).slice(0, 300));

    // cut-in: the same detailed object at 3.5x after the cut (and unrelated stuff at that scale for the negative)
    const grounds = ["-f", "lavfi", "-i", "color=c=0x203040:s=640x360:r=30:d=4", "-f", "lavfi", "-i", "color=c=0xe8dccb:s=640x360:r=30:d=4"];
    const obj = (src) => ["-f", "lavfi", "-i", src];
    const swap = "[0][1]overlay=enable='gte(t,2)'[g]";
    const cm = [
      // before: testsrc2 160x90 at the left; after: the same object 3.5x (560x315), cropped nowhere
      ff([...grounds, ...obj("testsrc2=size=560x315:rate=30:d=4"), "-filter_complex", `${swap};[2]split[s1][s2];[s1]scale=160:90[small];[s2]null[big];[g][small]overlay=x=40:y=60:enable='lt(t,2)'[h];[h][big]overlay=x=40:y=20:enable='gte(t,2)',format=yuv420p`, f("cutin.mp4")]),
      // before: the same small object; after: unrelated bars at 3.5x
      ff([...grounds, ...obj("testsrc2=size=160x90:rate=30:d=4"), ...obj("smptebars=size=560x315:rate=30:d=4"), "-filter_complex", `${swap};[g][2]overlay=x=40:y=60:enable='lt(t,2)'[h];[h][3]overlay=x=40:y=20:enable='gte(t,2)',format=yuv420p`, f("unrelated.mp4")]),
    ];
    ok("gate-fixes: synthesised the cut-in films", cm.every((r) => r.status === 0), cm.map((r) => r.stderr).join(" ").slice(0, 300));
    const { measureCarry } = await import("../lib/carry.mjs");
    const ci = (await measureCarry(f("cutin.mp4"), { seams: [2] })).seams[0], un = (await measureCarry(f("unrelated.mp4"), { seams: [2] })).seams[0];
    ok("carry: a hard cut-in on the same object (3.5x bigger) scores as carried (0.25 or more, scale far from 1)", ci.score >= 0.25 && (ci.scale > 2 || ci.scale < 0.5), JSON.stringify(ci));
    ok("carry: an unrelated object at that scale after the cut does not", un.score != null && un.score < 0.25, JSON.stringify(un));
  }

  // ---- text-fit and script-error on tiny projects (needs Chrome)
  const mk = (name, body, script = "", { id = "f1", register = true } = {}) => {
    const root = path.join(tmp, `gatefix-${name}`);
    fs.mkdirSync(path.join(root, "compositions", "frames"), { recursive: true });
    fs.writeFileSync(path.join(root, "index.html"), `<!doctype html><html><head></head><body>
<div id="root" data-composition-id="main" data-width="1920" data-height="1080" data-start="0" data-duration="4">
<div data-composition-src="compositions/frames/f1.html" data-composition-id="f1" data-start="0" data-duration="4" data-track-index="1"></div>
</div></body></html>`);
    fs.writeFileSync(path.join(root, "compositions", "frames", "f1.html"), `<template id="f1"><div data-composition-id="f1" data-width="1920" data-height="1080" data-duration="4" style="position:relative;width:1920px;height:1080px;overflow:hidden">
${body}
<script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>
<script>var tl=gsap.timeline({paused:true});${script}window.__timelines=window.__timelines||{};${register ? `window.__timelines["${id}"]=tl;` : ""}</script>
</div></template>`);
    return root;
  };
  const tg = (root) => gate(["--project", root, "--no-fluency", "--no-carry"]);
  const probe = tg(mk("probe", '<p style="position:absolute;left:160px;top:400px;font:600 64px/1 Arial;margin:0">Hello there</p>'));
  if ((probe.skipped || []).some((x) => /Chrome/i.test(x))) { console.log("note  gate-fixes: no Chrome, the text-fit and script-error tests are skipped"); return; }

  // 3a: a mask hides letters of a readable line
  // one line (one block) of five words, each in its own line mask (the way SplitText-style reveals are built)
  const words = () => `<div style="position:absolute;left:200px;top:400px;white-space:nowrap;font:600 80px/90px Arial">${[["a", "Try"], ["b", "it"], ["c", "in"], ["d", "ChatGPT"], ["e", "today"]].map(([i, tx]) => `<span style="display:inline-block;overflow:hidden;vertical-align:top;height:90px;margin-right:30px"><span id="${i}" style="display:inline-block">${tx}</span></span>`).join(" ")}</div>`;
  // slow: every word rises over 0.8 s, staggered: for most of 0.9 s the line is readable with words cut off
  const slow = mk("mask-slow", words(), ["a", "b", "c", "d", "e"].map((i, k) => `tl.fromTo("#${i}",{yPercent:110},{yPercent:0,duration:0.8,ease:"none"},${1 + k * 0.04});`).join(""));
  // quick: each word rises in 0.12 s; the line is never readable with cut-off letters for 0.3 s
  const quick = mk("mask-quick", words(), ["a", "b", "c", "d", "e"].map((i, k) => `tl.fromTo("#${i}",{yPercent:110},{yPercent:0,duration:0.12,ease:"none"},${1 + k * 0.03});`).join(""));
  // a panel: a tall scroll area clips a line at rest, a panel (not a line mask): not a finding
  const panel = mk("mask-panel", '<div style="position:absolute;left:160px;top:300px;width:900px;height:600px;overflow:hidden"><p style="position:absolute;left:20px;top:560px;font:600 64px/1 Arial;margin:0;white-space:nowrap">Scrolls out of the panel here</p></div>');
  // a line leaving through its mask: a deliberate exit
  const leave = mk("mask-leave", words(), ["a", "b", "c", "d", "e"].map((i, k) => `tl.to("#${i}",{yPercent:110,duration:0.8,ease:"none"},${2 + k * 0.04});`).join(""));
  // an inset that holds cut-off letters at rest
  const rest = mk("mask-rest", '<div style="position:absolute;left:160px;top:400px;width:700px;height:90px;overflow:hidden"><span style="display:block;margin-left:-200px;font:600 80px/90px Arial;white-space:nowrap">Tap who had what</span></div>');
  const mask = (r) => found(tg(r), "text-cropped").filter((x) => x.region === "mask");
  const m1 = mask(slow), m2 = mask(quick), m3 = mask(panel), m4 = mask(leave), m5 = mask(rest);
  ok("text-fit: words still rising through their masks while the line is readable warn text-cropped (region mask, with the range; an error only at rest)", m1.length >= 1 && m1[0].severity === "warning" && m1[0].to - m1[0].from >= 0.3, JSON.stringify(m1).slice(0, 300));
  ok("text-fit: a quick 0.12 s rise through the mask is not", !m2.length, JSON.stringify(m2).slice(0, 300));
  ok("text-fit: a tall panel clipping a line is not a mask finding", !m3.length, JSON.stringify(m3).slice(0, 300));
  ok("text-fit: a line dropping out through its masks (a deliberate exit) is not", !m4.length, JSON.stringify(m4).slice(0, 300));
  ok("text-fit: an inset that cuts the first letters off a readable line at rest is text-cropped", m5.length === 1 && m5[0].to - m5[0].from >= 3, JSON.stringify(m5).slice(0, 300));

  // 3b: text-too-brief per text state: a slot typed, then swapped to a second line
  const slot = (a, b, holdA, holdB) => mk("slot", '<h2 id="slot" style="position:absolute;left:160px;width:1600px;top:400px;font:600 72px/1 Arial;margin:0;text-align:center"></h2>',
    `tl.call(function(){document.getElementById("slot").textContent=${JSON.stringify(a)};},null,0.2);tl.call(function(){document.getElementById("slot").textContent=${JSON.stringify(b)};},null,${0.2 + holdA});tl.call(function(){document.getElementById("slot").textContent="";},null,${0.2 + holdA + holdB});`);
  const brief = (r) => found(tg(r), "text-too-brief");
  const s1 = brief(slot("am I being cheap here", "or am I being sensible", 0.6, 3)), s2 = brief(slot("am I being cheap here", "or am I being sensible", 1.8, 1.8));
  ok("text-fit: a slot whose first string is swapped away after 0.6 s is text-too-brief for that string (the second, held 3 s, is not)", s1.length === 1 && /cheap/.test(s1[0].text) && /need/.test(s1[0].message), JSON.stringify(s1).slice(0, 300));
  ok("text-fit: both strings held their reading time (1.8 s each: 5 words need 2.1 s less the 15% slack) pass", !s2.length, JSON.stringify(s2).slice(0, 300));
  // typing: the string grows one letter at a time; only the finished string is judged, over the time it is readable
  const typed = (hold) => mk("typed", '<h2 id="slot" style="position:absolute;left:160px;width:1600px;top:400px;font:600 72px/1 Arial;margin:0;text-align:center"></h2>',
    `var full="am I being cheap here";for(var i=1;i<=full.length;i++){(function(n){tl.call(function(){document.getElementById("slot").textContent=full.slice(0,n);},null,0.2+n*0.03);})(i);}tl.call(function(){document.getElementById("slot").textContent="";},null,${0.2 + 21 * 0.03 + hold});`);
  ok("text-fit: a typed line is judged as one chain (typing is not four findings): held 2.5 s passes, held 0.3 s fails once", !brief(typed(2.5)).length && brief(typed(0.3)).length === 1, JSON.stringify([brief(typed(2.5)), brief(typed(0.3))]).slice(0, 400));

  // 9: a script error
  const throws = mk("throws", '<p id="t" style="position:absolute;left:160px;top:400px;font:600 64px/1 Arial;margin:0">Hello there</p>', 'document.querySelector("#01-bad-selector");tl.to("#t",{x:10,duration:1},0);', { register: true });
  const undef = mk("undef", '<p id="t" style="position:absolute;left:160px;top:400px;font:600 64px/1 Arial;margin:0">Hello there</p>', "notDefinedAnywhere();tl.to('#t',{x:10,duration:1},0);");
  const unreg = mk("unreg", '<p id="t" style="position:absolute;left:160px;top:400px;font:600 64px/1 Arial;margin:0">Hello there</p>', 'tl.to("#t",{x:10,duration:1},0);', { id: "wrong-id" });
  const se = (r) => found(tg(r), "script-error", "error");
  const e1 = se(throws), e2 = se(undef), e3 = se(unreg);
  ok("motion-gate: a composition whose script throws on an invalid selector is the error script-error (file and message)", e1.length >= 1 && /f1\.html/.test(e1[0].message) && /01-bad-selector|not a valid selector|SyntaxError/i.test(e1[0].message), JSON.stringify(e1).slice(0, 300));
  ok("motion-gate: a call to an undefined function is script-error", e2.length >= 1 && /notDefinedAnywhere/.test(e2[0].message), JSON.stringify(e2).slice(0, 300));
  ok("motion-gate: a timeline registered under another id never registers its own: script-error", e3.length === 1 && /never registered a timeline for "f1"/.test(e3[0].message), JSON.stringify(e3).slice(0, 300));
  ok("motion-gate: a clean composition has no script-error", !se(mk("clean", '<p id="t" style="position:absolute;left:160px;top:400px;font:600 64px/1 Arial;margin:0">Hello there</p>', 'tl.to("#t",{x:10,duration:1},0);')).length);
  ok("motion-gate: script-error makes the gate fail (exit 2) and the measurement says how many", (() => { const r = spawnSync(process.execPath, [path.join(scripts, "motion-gate.mjs"), "--project", undef, "--no-fluency", "--no-carry", "--json"], { encoding: "utf8", env: { ...process.env, ...(env || {}), RASANAI_HOME: home } }); return r.status === 2 && json(r).measured.text_fit.script_errors >= 1; })());
}
