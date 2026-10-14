// carry (lib/carry.mjs, motion-gate `carry` and `long-ending`) on synthetic films: an object that crosses a cut (moved, grown) is
// carried; two unrelated scenes are not; a stillness style turns the error into a warning; a user lesson tightens the share.
// export default async function ({ ok, node, tmp, env }).
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export default async function ({ ok, node, tmp, env }) {
  const root = path.join(tmp, "carry-test");
  fs.mkdirSync(root, { recursive: true });
  const ff = (argv) => spawnSync("ffmpeg", ["-y", "-v", "error", ...argv], { encoding: "utf8" });
  if (ff(["-version"]).error) { console.log("note  carry: ffmpeg is not installed, tests skipped"); return; }
  const f = (n) => path.join(root, n);
  const json = (r) => { try { return JSON.parse(r.stdout); } catch { return {}; } };
  const home = path.join(root, "home");
  fs.mkdirSync(home, { recursive: true });
  const scripts = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
  const gate = (video, planFile, extra = [], homeDir = home) => {
    const r = spawnSync(process.execPath, [path.join(scripts, "motion-gate.mjs"), "--video", f(video), "--plan", planFile, "--json", "--no-text-fit", "--no-fluency", ...extra], { encoding: "utf8", env: { ...process.env, ...(env || {}), RASANAI_HOME: homeDir } });
    return json(r);
  };
  const has = (j, check, sev) => (j.findings || []).find((x) => x.check === check && (!sev || x.severity === sev));

  // A: two grounds (navy, then cream) switch at 2 s; one detailed object (testsrc2) drifts and grows straight across the cut.
  // B: the object is replaced at 2 s by a different one (colour bars) somewhere else: nothing survives.
  const grounds = ["-f", "lavfi", "-i", "color=c=0x203040:s=640x360:r=30:d=4", "-f", "lavfi", "-i", "color=c=0xe8dccb:s=640x360:r=30:d=4"];
  const obj = (src) => ["-f", "lavfi", "-i", src];
  const swap = "[0][1]overlay=enable='gte(t,2)'[g]";
  const made = [
    ff([...grounds, ...obj("testsrc2=size=320x180:rate=30:d=4"), "-filter_complex", `${swap};[2]scale=w='160+40*t':h='90+22*t':eval=frame[o];[g][o]overlay=x='60+45*t':y='70+10*t',format=yuv420p`, f("carried.mp4")]),
    ff([...grounds, ...obj("testsrc2=size=320x180:rate=30:d=4"), ...obj("smptebars=size=320x180:rate=30:d=4"), "-filter_complex", `${swap};[2]scale=200:112[a];[3]scale=300:170[b];[g][a]overlay=x=60:y=60:enable='lt(t,2)'[h];[h][b]overlay=x=300:y=170:enable='gte(t,2)',format=yuv420p`, f("replaced.mp4")]),
    // a 4 s film for the ending checks
    ff([...grounds, ...obj("testsrc2=size=320x180:rate=30:d=4"), "-filter_complex", `[0][1]overlay=enable='gte(t,2)'[g];[2]scale=200:112[o];[g][o]overlay=x='60+45*t':y=80,format=yuv420p`, f("short.mp4")]),
  ];
  ok("carry: synthesised the test films", made.every((r) => r.status === 0), made.map((r) => r.stderr).join(" ").slice(0, 400));
  const plan = f("plan.json");
  fs.writeFileSync(plan, JSON.stringify({ brandReveal: "b", scenes: [{ id: "a", start: 0, end: 2 }, { id: "b", start: 2, end: 4 }] }));

  const { measureCarry } = await import("../lib/carry.mjs");
  const mc = await measureCarry(f("carried.mp4"), { seams: [2] });
  const mr = await measureCarry(f("replaced.mp4"), { seams: [2] });
  ok("carry: an object that drifts and grows across a cut scores as carried (0.25 or more), an unrelated replacement does not", mc.seams[0].score >= 0.25 && mr.seams[0].score < 0.25, JSON.stringify([mc.seams, mr.seams]));
  const hc = await measureCarry(f("replaced.mp4"));
  ok("carry: with no plan, the hard cut is found from the frames (2 s)", hc.cuts.length === 1 && Math.abs(hc.cuts[0] - 2) <= 0.15, JSON.stringify(hc.cuts));

  const g1 = gate("carried.mp4", plan), g2 = gate("replaced.mp4", plan);
  ok("motion-gate: a carried seam passes the carry check", !has(g1, "carry") && g1.measured.carry && g1.measured.carry.carried_share === 1, JSON.stringify(g1.measured && g1.measured.carry));
  const c2 = has(g2, "carry", "warning");
  ok("motion-gate: a seam nothing survives warns carry with the seam's time and score and a fix (a warning: references hard-cut)", !!c2 && /2 s \(/.test(c2.message) && Math.abs(c2.at - 2) <= 0.1 && /carry|match cut/.test(c2.fix), JSON.stringify(c2));
  const g3 = gate("replaced.mp4", plan, ["--stillness"]);
  ok("motion-gate: a declared stillness style makes carry a warning", !!has(g3, "carry", "warning") && !has(g3, "carry", "error"), JSON.stringify(g3.findings && g3.findings.filter((x) => x.check === "carry")));
  const g4 = gate("replaced.mp4", plan, ["--no-carry"]);
  ok("motion-gate: --no-carry skips it, said in the report", !has(g4, "carry") && (g4.skipped || []).some((s) => /carry/.test(s)));

  // the ending: a last beat from 1 s of a 4 s film is 75% of it, from 2 s 50%
  const lePlan = f("le.json");
  fs.writeFileSync(lePlan, JSON.stringify({ brandReveal: "b", scenes: [{ id: "a", start: 0, end: 1 }, { id: "b", start: 1, end: 4 }] }));
  const le = gate("short.mp4", lePlan, ["--no-carry"]), ok2 = gate("short.mp4", plan, ["--no-carry"]);
  ok("motion-gate: a last beat that is 75% of the film warns long-ending (a warning, never an error)", !!has(le, "long-ending", "warning") && le.measured.ending_share >= 0.7 && !has(le, "long-ending", "error"), JSON.stringify(le.findings && le.findings.filter((x) => x.check === "long-ending")));
  ok("motion-gate: a last beat of 50% warns too, and a report with no lessons lists no tightened gate", !!has(ok2, "long-ending") && (ok2.notes || []).length === 0, JSON.stringify([ok2.measured.ending_share, ok2.notes]));

  // a lesson tightens a gate (never loosens): motion.carry_share 0.9 is read and listed; RASANAI_NO_LESSON_GATES turns it off
  const lessonHome = path.join(root, "home-lesson");
  fs.mkdirSync(lessonHome, { recursive: true });
  fs.writeFileSync(path.join(lessonHome, "lessons.jsonl"), JSON.stringify({ id: "l1", rule: "carry something across every cut", quote: "it cuts", kind: "error", area: "motion", seen: 1, last: "2026-10-14", gate: { key: "motion.carry_share", value: 0.9 } }) + "\n");
  const gl = gate("carried.mp4", plan, [], lessonHome);
  ok("motion-gate: once the user taught it (motion.carry_share), an uncarried seam is an error", !!has(gate("replaced.mp4", plan, [], lessonHome), "carry", "error"));
  const gl0 = (() => { const r = spawnSync(process.execPath, [path.join(scripts, "motion-gate.mjs"), "--video", f("carried.mp4"), "--plan", plan, "--json", "--no-text-fit", "--no-fluency"], { encoding: "utf8", env: { ...process.env, ...(env || {}), RASANAI_HOME: lessonHome, RASANAI_NO_LESSON_GATES: "1" } }); return json(r); })();
  ok("motion-gate: a lesson's motion.carry_share is read and listed in the report; RASANAI_NO_LESSON_GATES=1 turns it off", gl.measured.thresholds.carry_share === 0.9 && (gl.notes || []).some((n) => /motion\.carry_share = 0\.9/.test(n)) && gl0.measured.thresholds.carry_share === 0.5 && (gl0.notes || []).length === 0, JSON.stringify([gl.measured.thresholds, gl.notes, gl0.notes]));
}
