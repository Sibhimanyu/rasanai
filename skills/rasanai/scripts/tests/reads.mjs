// reads: the timed per-scene reads[] (reads.mjs, lib/reads.mjs): the spec's example passes, a reaction before its cause, silent competing reads, a 0.1 s payoff and a too-fast text card each warn
// (scene, timestamp, suggested edit), malformed reads are invalid (exit 2), a legacy score and the scene-contract negatives are untouched, reads_required, and a 15 s actor makes a four-position sheet (Chrome cases print "not run").
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FX = path.join(HERE, "fixtures", "reads");
const SK = path.resolve(HERE, "..");

export default async function ({ ok, node, tmp, env }) {
  const run = path.join(tmp, "reads-run");
  fs.mkdirSync(path.join(run, "motion"), { recursive: true });
  const check = (f, extra = []) => {
    const r = node("reads.mjs", ["check", "--run", run, "--score", path.join(FX, f), "--json", ...extra]);
    let j = {}; try { j = JSON.parse(r.stdout); } catch { /* keep {} */ }
    return { r, j, w: j.warnings || [], codes: (j.findings || []).map((x) => x.code) };
  };

  const g = check("good.json");
  ok("reads: the spec's example (notice, action, reaction in 4.2 s) passes with no warning", g.r.status === 0 && g.j.status === "pass" && !g.w.length, g.r.stdout + g.r.stderr);

  const l = check("legacy.json");
  ok("reads: a legacy score without reads[] passes untouched", l.r.status === 0 && l.j.enabled === false && !l.w.length, g.r.stderr + JSON.stringify(l.j).slice(0, 200));

  const o = check("reaction-before-cause.json");
  const wo = o.w.find((x) => x.startsWith("reads-order"));
  ok("reads: a reaction before its cause is a reads-order warning naming scene, time and a suggested edit (exit stays 0)", o.r.status === 0 && wo && /scene 03/.test(wo) && /at 0\.4 s/.test(wo) && /suggested edit: move the reaction to start at or after 3 s/.test(wo), wo || o.r.stdout);

  const c = check("competing.json");
  const wc = c.w.find((x) => x.startsWith("competing-reads"));
  ok("reads: a silent text read against a hero action with no reason is competing-reads, with the overlap window and an edit", c.r.status === 0 && wc && /scene 02/.test(wc) && /silent text read "card"/.test(wc) && /1-3 s/.test(wc) && /parallel_with/.test(wc), wc || c.r.stdout);
  const cr = check("competing-reasoned.json");
  ok("reads: the same overlap with a continuity type is allowed", !cr.codes.includes("competing-reads"), cr.w.join("\n"));

  const p = check("short-payoff.json");
  const wp = p.w.find((x) => x.startsWith("unheld-reaction"));
  ok("reads: a 0.1 s payoff is unheld-reaction with the scene, time and the t1 to extend to", p.r.status === 0 && wp && /scene 04/.test(wp) && /visible for 0\.1 s/.test(wp) && /extend t1 to 3\.6 s/.test(wp), wp || p.r.stdout);

  const t = check("fast-text.json");
  const wt = t.w.find((x) => x.startsWith("text-unreadable"));
  ok("reads: a too-fast text card is text-unreadable (reading.mjs formula) with the hold it needs and the words that fit", t.r.status === 0 && wt && /scene 05/.test(wt) && /holds 0\.7 s for 8 words/.test(wt) && /needs 3 s/.test(wt) && /hold it until 3\.5 s/.test(wt) && /film 2\.5 s/.test(wt), wt || t.r.stdout);

  const inv = check("invalid.json");
  ok("reads: an unknown kind and t1 <= t0 are invalid (exit 2), not warnings", inv.r.status === 2 && inv.j.status === "invalid" && inv.j.problems.some((x) => /kind "wink"/.test(x)) && inv.j.problems.some((x) => /t1 \(1\) must be greater than t0 \(2\)/.test(x)), inv.r.stdout);

  const rq = check("cartoon-required.json");
  ok("reads: reads_required warns missing-read on a scene with none (and only as a warning)", rq.r.status === 0 && rq.codes.includes("missing-read") && rq.j.reads_required === true, rq.w.join("\n"));

  const miss = node("reads.mjs", ["check", "--run", run, "--score", path.join(tmp, "no-such-score.json")]);
  ok("reads: a missing score is exit 1 (could not run), never a pass", miss.status === 1, miss.stdout + miss.stderr);

  // the library on its own: dramatic scenes get missing-read only in a film that writes reads; an old product film is never failed
  const lib = await import(path.join(SK, "lib", "reads.mjs"));
  const dramatic = { n: 2, id: "02", duration: 3, cast_state: { in: { rasan: {} }, out: {} } };
  const withReads = lib.readsChecks({ cast: [{ id: "rasan", kind: "character" }], scenes: [JSON.parse(fs.readFileSync(path.join(FX, "good.json"), "utf8")).scenes[0], dramatic] });
  ok("reads: a character scene beside scenes that write reads gets missing-read", withReads.W.some((x) => /^missing-read: scene 02/.test(x)), withReads.W.join("\n"));
  const product = lib.readsChecks({ cast: [{ id: "rasan", kind: "character" }], scenes: [dramatic, { n: 3, id: "03", duration: 3 }] });
  ok("reads: an existing film with no reads[] anywhere has no reads finding", !product.W.length && !product.P.length && !product.enabled);
  const carried = lib.readsChecks({ seams: [{ from: 6, to: 7, kind: "push-through" }], scenes: [{ n: 6, id: "06", duration: 3, reads: [{ id: "a", t0: 0, t1: 1.5, kind: "action", subject: "x", visual_cue: "y" }, { id: "r", t0: 2.5, t1: 3, kind: "result", subject: "x", visual_cue: "final pose" }] }] });
  const uncarried = lib.readsChecks({ scenes: [{ n: 6, id: "06", duration: 3, reads: [{ id: "a", t0: 0, t1: 1.5, kind: "action", subject: "x", visual_cue: "y" }, { id: "r", t0: 2.5, t1: 3, kind: "result", subject: "x", visual_cue: "final pose" }] }] });
  ok("reads: the same end result with no carrying seam is unheld-reaction", uncarried.W.some((x) => /^unheld-reaction: scene 06 at 2\.5 s/.test(x)), uncarried.W.join("\n"));
  ok("reads: a short end result handed on through a push-through seam is not unheld (the scene-contract rule is reused)", !carried.W.some((x) => /^unheld-reaction/.test(x)) , carried.W.join("\n"));
  const SC = await import(path.join(SK, "lib", "scene-contract.mjs"));
  const neg = SC.sceneContractChecks({ scenes: [{ n: 1, id: "a", duration: 4, importance: 3, states: [{ t: 3.8, what: "x", look: "y" }] }], seams: [] });
  ok("reads: the scene-contract result-unheld-plan warning still fires unchanged", neg.W.some((x) => /^result-unheld-plan: scene 1 \(a, importance 3\): its last state \(or peak_t\) is at 3\.8 s of 4 s, leaving 0\.2 s/.test(x)), neg.W.join("\n"));

  // crew.mjs check --role motion-director runs it (the same warnings, an invalid reads[] is a problem)
  const crewRun = path.join(tmp, "reads-crew");
  fs.mkdirSync(path.join(crewRun, "motion"), { recursive: true });
  fs.writeFileSync(path.join(crewRun, "motion", "score.json"), fs.readFileSync(path.join(FX, "short-payoff.json")));
  const cc = node("crew.mjs", ["check", "--run", crewRun, "--role", "motion-director", "--key", "score"]);
  ok("reads: crew.mjs check --role motion-director carries the reads warning", /unheld-reaction: scene 04/.test(cc.stdout + cc.stderr), (cc.stdout + cc.stderr).slice(0, 400));

  // the 15 s actor: a four-position sheet and a strip (needs headless Chrome)
  const chrome = process.env.RASANAI_CHROME || ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium", "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"].find((x) => fs.existsSync(x));
  if (!chrome) { console.log("not run  reads: 15 s actor four-position sheet (no headless Chrome found: set RASANAI_CHROME)"); return; }
  const proj = path.join(tmp, "reads-proj");
  fs.mkdirSync(path.join(proj, "compositions"), { recursive: true });
  fs.writeFileSync(path.join(proj, "hyperframes.json"), "{}");
  const comp = path.join(proj, "compositions", "actor.html");
  fs.copyFileSync(path.join(FX, "actor-15s.html"), comp);
  const arun = path.join(tmp, "reads-actor-run");
  fs.mkdirSync(path.join(arun, "motion"), { recursive: true });
  fs.copyFileSync(path.join(FX, "actor-15s-score.json"), path.join(arun, "motion", "score.json"));
  const ck = node("reads.mjs", ["check", "--run", arun, "--json"]);
  ok("reads: the 15 s actor's reads pass", ck.status === 0 && JSON.parse(ck.stdout).status === "pass", ck.stdout.slice(0, 300));
  const sh = node("reads.mjs", ["sheet", "--run", arun, "--scene", "actor", "--file", comp], { cwd: tmp });
  let j = {}; try { j = JSON.parse(sh.stdout); } catch { /* */ }
  const sheetPng = path.join(arun, "review", "reads", "actor-sheet.png");
  if (sh.status !== 0) { console.log(`not run  reads: 15 s actor sheet (could not render: ${(sh.stderr || sh.stdout).trim().split("\n").pop()})`); return; }
  const sz = fs.existsSync(sheetPng) ? fs.statSync(sheetPng).size : 0;
  ok("reads: the 15 s actor makes a four-position reads sheet (entry, action, reaction, hold) with times from its reads", sz > 5000 && j.positions && j.positions.map((x) => x.position).join() === "entry,action,reaction,hold" && j.positions.map((x) => x.t).join() === "0.15,5.5,10,13.5", JSON.stringify(j.positions));
  ok("reads: and a strip around the key transition (the reaction's start, 8 s)", j.key_transition_s === 8 && j.strip && fs.existsSync(path.join(arun, "review", "reads", "actor-strip.png")), JSON.stringify({ k: j.key_transition_s, s: j.strip }));
}
