// echo (lib/echo.mjs, motion-gate `no-echo` / `echo-identical`) and camera variety (lib/camera-moves.mjs, `camera-monotone`) on
// synthetic films: an ending that returns the opening changed rhymes, an unrelated one does not, the same frame is identical;
// a still, a pan and a push are told apart; the score's echo, per-beat camera and signature_shot are read. All warnings.
// export default async function ({ ok, node, tmp, env }).
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export default async function ({ ok, tmp, env }) {
  const root = path.join(tmp, "echo-camera-test");
  fs.mkdirSync(root, { recursive: true });
  const ff = (argv) => spawnSync("ffmpeg", ["-y", "-v", "error", ...argv], { encoding: "utf8" });
  if (ff(["-version"]).error) { console.log("note  echo-camera: ffmpeg is not installed, tests skipped"); return; }
  const f = (n) => path.join(root, n);
  const scripts = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
  const json = (r) => { try { return JSON.parse(r.stdout); } catch { return {}; } };
  const home = path.join(root, "home");
  fs.mkdirSync(home, { recursive: true });
  const gate = (video, extra = []) => json(spawnSync(process.execPath, [path.join(scripts, "motion-gate.mjs"), "--video", f(video), "--json", "--no-text-fit", "--no-fluency", "--no-carry", ...extra], { encoding: "utf8", env: { ...process.env, ...(env || {}), RASANAI_HOME: home } }));
  const has = (j, check, region) => (j.findings || []).find((x) => x.check === check && (!region || x.region === region));

  // a still picture (one frame of testsrc2) is the opening's object
  const made = [ff(["-f", "lavfi", "-i", "testsrc2=size=1920x1080:rate=1:d=1", "-frames:v", "1", f("world.png")])];
  // ... and a textured ground for the camera (blurred seeded noise: detail everywhere, nothing periodic)
  made.push(ff(["-f", "lavfi", "-i", "color=c=gray:s=1920x1080:d=1,noise=alls=90:all_seed=7,boxblur=5:2,eq=contrast=4", "-frames:v", "1", f("texture.png")]));
  made.push(ff(["-i", f("world.png"), "-vf", "scale=240:136", f("w.png")]), ff(["-i", f("world.png"), "-vf", "scale=300:170", f("wb.png")]));
  // echo films, 8 s: an opening (navy ground, the picture centred), a middle (cream ground, bars bottom right), an ending (input 4 = the end frame)
  const navy = "color=c=0x1d2b44:s=640x360:r=30:d=8", cream = "color=c=0xeee4d2:s=640x360:r=30:d=8";
  const film = (out, end) => ff(["-f", "lavfi", "-i", navy, "-f", "lavfi", "-i", cream, "-loop", "1", "-t", "8", "-i", f("w.png"), "-f", "lavfi", "-i", "smptebars=size=280x120:rate=30:d=8", "-loop", "1", "-t", "8", "-i", f("wb.png"),
    "-filter_complex", `[0]split[n1][n2];[1]split[c1][c2];[2]split[w1][w2];[3]split[b1][b2];[n1][w1]overlay=x=200:y=112[o];[c1][b1]overlay=x=340:y=220[m];[o][m]overlay=enable='between(t,2.5,5)'[om];${end}[e];[om][e]overlay=enable='gte(t,5)',format=yuv420p`, "-t", "8", f(out)]);
  made.push(
    // rhymes: the same navy ground and picture, now bigger, with a bar under it (the start, changed)
    film("rhyme.mp4", "[n2][4]overlay=x=170:y=80,drawbox=x=170:y=270:w=300:h=14:color=white:t=fill[x];[c2][x]overlay[e0];[w2]nullsink;[b2]nullsink;[e0]null"),
    // does not rhyme: ends on the cream ground with the bars in a corner
    film("norhyme.mp4", "[c2][b2]overlay=x=20:y=20[e0];[n2]nullsink;[w2]nullsink;[4]nullsink;[e0]null"),
    // identical: ends on the opening frame unchanged
    film("same.mp4", "[n2][w2]overlay=x=200:y=112[e0];[c2]nullsink;[b2]nullsink;[4]nullsink;[e0]null"),
  );
  // camera film, 6 s on the picture: locked 0-2 s, a pan 2-4 s (a 960 px window sliding 240 px/s), a push-in 4-6 s (12%/s)
  made.push(ff(["-loop", "1", "-t", "6", "-r", "30", "-i", f("texture.png"), "-vf",
    "crop=960:540:x='300+240*min(2,max(0,t-2))':y=270,scale=640:360,scale=w='trunc(640*(1+0.12*max(0,t-4))/2)*2':h='trunc(360*(1+0.12*max(0,t-4))/2)*2':eval=frame,crop=640:360,format=yuv420p", "-t", "6", f("camera.mp4")]));
  // a locked 16 s film (the render floor is 1 moving kind from 15 s)
  made.push(ff(["-loop", "1", "-t", "16", "-r", "15", "-i", f("texture.png"), "-vf", "scale=640:360,format=yuv420p", f("locked16.mp4")]));
  ok("echo-camera: synthesised the test films", made.every((r) => r.status === 0), made.map((r) => r.stderr).join(" ").slice(0, 400));

  const { measureEcho, ECHO } = await import("../lib/echo.mjs");
  const er = measureEcho(f("rhyme.mp4")), en = measureEcho(f("norhyme.mp4")), es = measureEcho(f("same.mp4"));
  ok("echo: the opening returned changed rhymes (not identical); an unrelated ending does not; the same frame is identical", er.echo >= ECHO.rhyme && !er.identical && en.echo < ECHO.rhyme && es.identical, JSON.stringify([er, en, es].map((e) => ({ echo: e.echo, id: e.identical, o: e.opening, e: e.ending }))));
  ok("echo: the opening key frame is in the first 3 s and the ending in the end card", er.opening.t <= 3 && er.ending.t >= 5, JSON.stringify([er.opening, er.ending]));

  const g1 = gate("rhyme.mp4"), g2 = gate("norhyme.mp4"), g3 = gate("same.mp4");
  ok("motion-gate: a rhyming ending passes the echo (measured.echo reported); an unrelated one warns no-echo with the times", !has(g1, "no-echo") && g1.measured.echo && g1.measured.echo.score >= ECHO.rhyme && has(g2, "no-echo", "ending") && has(g2, "no-echo").severity === "warning" && /\d s/.test(has(g2, "no-echo").message), JSON.stringify([g1.measured.echo, g2.findings && g2.findings.filter((x) => /echo/.test(x.check))]));
  ok("motion-gate: the end that is the start unchanged warns echo-identical (a warning)", !!has(g3, "echo-identical") && has(g3, "echo-identical").severity === "warning", JSON.stringify(g3.findings && g3.findings.filter((x) => /echo/.test(x.check))));
  ok("motion-gate: --no-echo skips it, said in the report", !has(gate("norhyme.mp4", ["--no-echo"]), "no-echo") && (gate("norhyme.mp4", ["--no-echo"]).skipped || []).some((s) => /echo/.test(s)));

  const { measureCamera, cameraKind } = await import("../lib/camera-moves.mjs");
  const cm = await measureCamera(f("camera.mp4"), { beats: [{ id: "still", start: 0, end: 2 }, { id: "pan", start: 2, end: 4 }, { id: "push", start: 4, end: 6 }] });
  const by = Object.fromEntries(cm.beats.map((b) => [b.id, b.camera]));
  ok("camera: a locked shot, a pan and a push-in are told apart, beat by beat", by.still === "locked" && by.pan === "pan-truck" && by.push === "push-in", JSON.stringify({ beats: cm.beats, moves: cm.moves }));
  ok("camera: the score's words map to a kind (the move named first)", cameraKind("T0 locked: the push lands") === "locked" && cameraKind("T2 focus zoom into the composer") === "push-in" && cameraKind("arc 28 deg right") === "pan-truck" && cameraKind("whip-pan to the card") === "whip" && cameraKind("a slow tilt down the list") === "tilt" && cameraKind("") === null);

  const lk = gate("locked16.mp4");
  ok("motion-gate: a 16 s film whose camera never moves warns camera-monotone (whole film), with the measured beats", !!has(lk, "camera-monotone", "whole film") && has(lk, "camera-monotone").severity === "warning" && lk.measured.camera && lk.measured.camera.moving_kinds === 0, JSON.stringify([lk.measured.camera, lk.findings && lk.findings.filter((x) => /camera/.test(x.check))]));
  ok("motion-gate: a declared stillness style waives the render's camera-monotone", !has(gate("locked16.mp4", ["--stillness"]), "camera-monotone", "whole film"));

  // the score: echo {opening, ending, change}, a camera per beat chosen from meaning (no kind quota), one signature_shot
  const scene = (id, start, end, camera) => ({ id, start, end, camera });
  const write = (name, obj) => { fs.writeFileSync(f(name), JSON.stringify({ brandReveal: "d", ...obj })); return f(name); };
  const good = write("good.json", { echo: { opening: "the picture on navy", ending: "the picture again, bigger", change: "small to large, a bar under it" }, signature_shot: { beat: "c", move: "whip", why: "the turn" }, scenes: [scene("a", 0, 2, "locked"), scene("b", 2, 4, "pan-truck along the bars"), scene("c", 4, 6, "whip to the end"), scene("d", 6, 8, "push-in on the end card")] });
  const flat = write("flat.json", { scenes: [scene("a", 0, 2, "locked"), scene("b", 2, 4, "T0 locked"), scene("c", 4, 6, null), scene("d", 6, 8, "locked")] });
  const pg = gate("rhyme.mp4", ["--plan", good]), pf = gate("rhyme.mp4", ["--plan", flat]);
  const pc = has(pf, "camera-monotone", "plan");
  ok("motion-gate: a score with an echo, a camera per beat and a signature_shot raises neither plan warning", !has(pg, "no-echo", "plan") && !has(pg, "camera-monotone", "plan"), JSON.stringify(pg.findings && pg.findings.filter((x) => /echo|camera/.test(x.check))));
  ok("motion-gate: a score with no echo warns no-echo (plan); no signature_shot warns camera-monotone (plan), but one locked kind and an unnamed beat are not a quota failure", !!has(pf, "no-echo", "plan") && !!pc && /signature_shot/.test(pc.message) && !/different camera|1 different|beat c/.test(pc.message) && pc.severity === "warning", JSON.stringify(pf.findings && pf.findings.filter((x) => /echo|camera/.test(x.check))));
}
