// variety: the film shape vocabulary, memory.mjs record-film / recent-films, crew.mjs check's same-shape rule (and its waiver,
// the missing-shape rule: an error once a film is recorded, a warning before), the motion-director brief listing the last
// shapes, and frame-gate's competing-heroes (two equal big elements in most frames) with one hero passing.
// export default async ({ ok, node, tmp, env })
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromePath } from "../lib/common.mjs";
import { shapeProblems, tooClose, SHAPE_VOCAB, ASPECTS } from "../lib/film-shape.mjs";

export default async function ({ ok, node, tmp, env }) {
  const home = path.join(tmp, "variety-home"); fs.mkdirSync(home, { recursive: true });
  const e = { ...env, RASANAI_HOME: home, RASANAI_NO_LESSON_GATES: "1" };
  const nodeE = (script, args) => node(script, args, { env: e });
  const shape = { structure: "ladder", opening: "product-first", signature: "carried-object", camera: "slow-push", music: "pulse-driven", ending: "logo-lockup" };
  ok("variety: every aspect has 6 to 12 slugs and the sample shape is valid", ASPECTS.every((a) => SHAPE_VOCAB[a].length >= 6 && SHAPE_VOCAB[a].length <= 12) && shapeProblems(shape).length === 0);
  ok("variety: an off-vocabulary or missing aspect is a problem", shapeProblems({ ...shape, camera: "dutch-angle" }).length === 1 && shapeProblems({ ...shape, music: undefined }).length === 1 && shapeProblems(null).length === 1);
  const other = { structure: "tour", opening: "cold-word", signature: "carried-object", camera: "slow-push", music: "ambient-pad", ending: "blackout" };
  ok("variety: 3 shared aspects is too close (differ 3), 2 shared passes", tooClose(shape, [{ title: "A", shape: { ...other, music: "pulse-driven" } }]).length === 1 && tooClose(shape, [{ title: "A", shape: other }]).length === 0);

  // memory.mjs record-film / recent-films
  const run = path.join(tmp, "variety-run"); fs.mkdirSync(path.join(run, "motion"), { recursive: true });
  fs.writeFileSync(path.join(run, "brief.json"), JSON.stringify({ fields: { subject: "Lintel" } }));
  const noShape = nodeE("memory.mjs", ["record-film", "--run", run]);
  fs.writeFileSync(path.join(run, "motion", "score.json"), JSON.stringify({ brand: "Lintel launch", shape }));
  ok("variety: record-film with no score is refused", noShape.status !== 0);
  const rec = nodeE("memory.mjs", ["record-film", "--run", run]);
  const rf = JSON.parse(nodeE("memory.mjs", ["recent-films", "--n", "3"]).stdout || "[]");
  ok("variety: record-film stores the shape, title and date; recent-films returns them", rec.status === 0 && rf.length === 1 && rf[0].title === "Lintel launch" && rf[0].shape.ending === "logo-lockup" && /^\d{4}-\d\d-\d\d$/.test(rf[0].date), rec.stdout + rec.stderr);

  // crew check: the score checked with a one-line plan is enough to see the shape messages (other problems are expected)
  const crewRun = path.join(tmp, "variety-crew"); fs.mkdirSync(path.join(crewRun, "motion"), { recursive: true });
  const check = (score) => { fs.writeFileSync(path.join(crewRun, "motion", "score.json"), JSON.stringify(score)); const r = nodeE("crew.mjs", ["check", "--run", crewRun, "--role", "motion-director", "--json"]); return r.stdout + r.stderr; };
  const same = check({ shape });
  ok("variety: a score sharing 4+ aspects with the last film fails same-shape, naming the film and the shared aspects", /same-shape/.test(same) && /Lintel launch/.test(same) && /structure ladder/.test(same), same.slice(0, 600));
  const waived = check({ shape, shape_waiver: "a series: the user asked for the same look" });
  ok("variety: shape_waiver (12+ characters) turns it into a warning", !/same-shape/.test(JSON.stringify((JSON.parse(waived.slice(waived.indexOf("{")) || "{}").problems || []))) && /waived/.test(waived), waived.slice(0, 400));
  const diff = check({ shape: other });
  ok("variety: a shape that differs in 4+ aspects raises no same-shape", !/same-shape/.test(diff));
  const bad = check({ shape: { ...other, camera: "dutch-angle" } });
  ok("variety: an off-vocabulary slug is an error", /not in the vocabulary/.test(bad));
  const missing = check({});
  ok("variety: no shape is an error once a film is recorded", /no shape/.test(missing));
  const fresh = path.join(tmp, "variety-home2"); fs.mkdirSync(fresh, { recursive: true });
  fs.writeFileSync(path.join(crewRun, "motion", "score.json"), "{}");
  // spawned directly: selftest's node() keeps its own RASANAI_HOME and ignores a per-call env
  const r2 = spawnSync(process.execPath, [path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "crew.mjs"), "check", "--run", crewRun, "--role", "motion-director", "--json"], { encoding: "utf8", env: { ...process.env, ...e, RASANAI_HOME: fresh } });
  let pj = {}; try { pj = JSON.parse(r2.stdout); } catch {}
  ok("variety: with no film recorded a missing shape is only a warning", !(pj.problems || []).some((x) => /no shape/.test(x)) && (pj.warnings || []).some((x) => /no shape/.test(x)), r2.stdout.slice(0, 300));

  // frame-gate competing-heroes
  let chrome = true;
  { const real = process.exit; process.exit = () => { throw new Error("no chrome"); }; try { chromePath(); } catch { chrome = false; } finally { process.exit = real; } }
  const ff = (await import("node:child_process")).spawnSync("ffmpeg", ["-version"]);
  if (!chrome || ff.status !== 0) { console.log("note  variety: no Chrome or ffmpeg, the competing-heroes checks are skipped"); return; }
  const mod = await import("../frame-gate.mjs");
  const dir = path.join(tmp, "variety-boards"); fs.mkdirSync(dir, { recursive: true });
  const png = path.join(dir, "bg.png");
  (await import("node:child_process")).spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=0x33557a:s=1920x1080", "-frames:v", "1", png]);
  const page = (body) => `<!doctype html><html><body style="margin:0;width:1920px;height:1080px;background:#fff">${body}</body></html>`;
  const word = (x, y, t) => `<div style="position:absolute;left:${x}px;top:${y}px;font:700 300px/1 Arial">${t}</div>`;
  const small = `<div style="position:absolute;left:100px;top:900px;font:40px Arial">tiny</div>`;
  for (const n of ["01", "02", "03"]) {
    fs.copyFileSync(png, path.join(dir, `${n}.png`));
    fs.writeFileSync(path.join(dir, `${n}.html`), page(n === "03" ? word(100, 100, "Ask") + small : word(100, 100, "Ask") + word(100, 700, "Ask")));
  }
  const r = await mod.measureFrames({ stills: dir, html: dir });
  ok("frame-gate: two equal giant words in 2 of 3 boards (67%) raise competing-heroes (warning)", r.film.competingShare > 0.3 && r.findings.some((f) => f.check === "competing-heroes" && f.severity === "warning"), JSON.stringify(r.film.competingShare));
  const one = path.join(tmp, "variety-one"); fs.mkdirSync(one, { recursive: true });
  for (const n of ["01", "02"]) { fs.copyFileSync(png, path.join(one, `${n}.png`)); fs.writeFileSync(path.join(one, `${n}.html`), page(word(100, 100, "Ask") + small)); }
  const r1 = await mod.measureFrames({ stills: one, html: one });
  ok("frame-gate: one hero and a small label raise no competing-heroes", r1.film.competingShare === 0 && !r1.findings.some((f) => f.check === "competing-heroes"), JSON.stringify(r1.film.competingShare));
  const stacked = path.join(tmp, "variety-stack"); fs.mkdirSync(stacked, { recursive: true });
  fs.copyFileSync(png, path.join(stacked, "01.png"));
  fs.writeFileSync(path.join(stacked, "01.html"), page(`<div style="position:absolute;left:100px;top:100px;font:700 300px/1 Arial"><div>Ask</div><div>Search</div></div>`));
  const rs = await mod.measureFrames({ stills: stacked, html: stacked });
  ok("frame-gate: one headline stacked over two lines is one hero, not two", rs.film.competingShare === 0, JSON.stringify(rs.film.competingShare));
}
