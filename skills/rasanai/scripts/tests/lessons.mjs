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
}
