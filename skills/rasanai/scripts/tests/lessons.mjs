// lessons.mjs: add / dedupe (seen), area routing per role, an empty brief, drop. RASANAI_HOME points at a temp dir,
// never ~/.rasanai. export default async function ({ ok, tmp }).
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "lessons.mjs");

export default async function ({ ok, tmp }) {
  const home = fs.mkdtempSync(path.join(tmp, "lessons-home-"));
  const run = (...a) => spawnSync(process.execPath, [SCRIPT, ...a], { encoding: "utf8", env: { ...process.env, RASANAI_HOME: home } });
  const json = (r) => { try { return JSON.parse(r.stdout); } catch { return {}; } };

  const empty = run("brief", "--role", "critic");
  ok("lessons: an empty store prints no brief block", empty.status === 0 && empty.stdout === "", JSON.stringify(empty.stdout));

  const a = json(run("add", "--rule", "Set body type at 48 px or more so it reads on a phone", "--quote", "your type is always too small", "--kind", "error", "--area", "type", "--run", "r1"));
  ok("lessons: add writes id, rule, quote, kind, area, run, seen 1", a.id && a.kind === "error" && a.area === "type" && a.run === "r1" && a.seen === 1 && a.quote === "your type is always too small", JSON.stringify(a));
  const b = json(run("add", "--rule", "set body type at 48 px or more, so it reads on a phone!", "--quote", "again", "--kind", "error", "--area", "type"));
  ok("lessons: the same rule (normalised) bumps seen instead of adding a row", b.id === a.id && b.seen === 2 && json(run("list", "--json")).length === 1, JSON.stringify(b));
  run("add", "--rule", "Stop ending on a logo fade", "--quote", "not another logo fade", "--kind", "taste", "--area", "story");
  run("add", "--rule", "Cut every beat on a downbeat", "--quote", "q", "--kind", "taste", "--area", "sound");
  ok("lessons: a bad kind or area is refused", run("add", "--rule", "x", "--kind", "nope", "--area", "type").status !== 0 && run("add", "--rule", "x", "--kind", "error", "--area", "nope").status !== 0);

  const w = run("brief", "--role", "script-writer").stdout;
  ok("lessons: the script writer gets story, not type or sound", /Standing notes from the user's past films/.test(w) && /logo fade/.test(w) && !/48 px/.test(w) && !/downbeat/.test(w), w);
  const m = run("brief", "--role", "scene-animator").stdout;
  ok("lessons: the scene animator gets type and sound, not story", /48 px/.test(m) && /downbeat/.test(m) && !/logo fade/.test(m) && /noted 2 times/.test(m), m);
  const c = run("brief", "--role", "critic").stdout;
  ok("lessons: the critic gets every area, most-seen first", /logo fade/.test(c) && /48 px/.test(c) && /downbeat/.test(c) && c.indexOf("48 px") < c.indexOf("logo fade"), c);
  ok("lessons: a role outside the list gets nothing", run("brief", "--role", "product-researcher").stdout === "");
  ok("lessons: --n caps the block", (run("brief", "--role", "critic", "--n", "1").stdout.match(/^- \*\*/gm) || []).length === 1);

  const crewBrief = fs.readFileSync(path.join(path.dirname(SCRIPT), "crew.mjs"), "utf8");
  ok("lessons: crew.mjs brief appends the block", /import \{ lessonsBlock \} from "\.\/lessons\.mjs"/.test(crewBrief) && /lessonsBlock\(role\)/.test(crewBrief));

  const d = run("drop", "--id", a.id);
  ok("lessons: drop removes the row; an unknown id fails", d.status === 0 && json(run("list", "--json")).length === 2 && run("drop", "--id", "nope").status !== 0);
  ok("lessons: it never touched the real ~/.rasanai store", fs.existsSync(path.join(home, "lessons.jsonl")));

  // --gate: a lesson that is also a measured check
  const g = run("add", "--rule", "Every line of 3+ words at least 5% of the frame height", "--quote", "tiny", "--kind", "error", "--area", "type", "--gate", "text.statement_min_h=0.05");
  const gj = json(g);
  ok("lessons: --gate stores {key, value} on the row, and list and brief show it", g.status === 0 && gj.gate && gj.gate.key === "text.statement_min_h" && gj.gate.value === 0.05 && /gate text\.statement_min_h = 0\.05/.test(run("list").stdout) && /\(now measured: text\.statement_min_h = 0\.05\)/.test(run("brief", "--role", "critic").stdout), g.stdout + g.stderr);
  const bad = (spec) => run("add", "--rule", "bad gate " + spec, "--kind", "error", "--area", "type", "--gate", spec);
  ok("lessons: a bad --gate (unknown key, out of range, not a number, no value) is refused and stores nothing", ["nope.key=1", "text.statement_min_h=0.9", "text.statement_min_h=big", "text.statement_min_h"].every((s) => bad(s).status !== 0) && !json(run("list", "--json")).some((r) => /bad gate/.test(r.rule)));

  // a lesson raising text.statement_min_h makes a fixture fail text-too-small; RASANAI_NO_LESSON_GATES=1 turns it off
  {
    const root = path.join(tmp, "small-fixture");
    fs.mkdirSync(path.join(root, "compositions", "frames"), { recursive: true });
    fs.writeFileSync(path.join(root, "index.html"), '<!doctype html><html><head></head><body><div id="root" data-composition-id="main" data-width="1920" data-height="1080" data-start="0" data-duration="3"><div data-composition-src="compositions/frames/f1.html" data-composition-id="f1" data-start="0" data-duration="3" data-track-index="1"></div></div></body></html>');
    fs.writeFileSync(path.join(root, "compositions", "frames", "f1.html"), '<template id="f1"><div data-composition-id="f1" data-width="1920" data-height="1080" data-duration="3" style="position:relative;width:1920px;height:1080px"><h2 style="position:absolute;left:160px;width:1600px;text-align:center;top:480px;font:600 40px/1 Arial;margin:0">A small line of text</h2><script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script><script>var tl=gsap.timeline({paused:true});window.__timelines=window.__timelines||{};window.__timelines["f1"]=tl;</script></div></template>');
    const gate = (env2) => { const r = spawnSync(process.execPath, [path.join(path.dirname(SCRIPT), "motion-gate.mjs"), "--project", root, "--json"], { encoding: "utf8", env: { ...process.env, RASANAI_HOME: home, ...env2 }, timeout: 180000 }); try { return JSON.parse(r.stdout).findings || []; } catch { return []; } };
    const small = (fs_) => fs_.filter((f) => f.check === "text-too-small");
    const on = small(gate({}));
    ok("lessons: a lesson raising text.statement_min_h makes a 40 px line fail text-too-small (error, names the lesson)", on.length === 1 && on[0].severity === "error" && /text\.statement_min_h = 0\.05/.test(on[0].message), JSON.stringify(on).slice(0, 400));
    ok("lessons: RASANAI_NO_LESSON_GATES=1 turns it off", !small(gate({ RASANAI_NO_LESSON_GATES: "1" })).length);
  }
}
