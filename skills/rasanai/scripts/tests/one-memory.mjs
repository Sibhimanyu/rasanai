// One memory (lessons.jsonl is the only rules store and the only "past films" block; taste.jsonl is its raw evidence ledger),
// one reading-time formula (lib/reading.mjs), one corner-label rule (corner-micro-label). RASANAI_HOME is a temp dir.
// export default async function ({ ok, tmp }).
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const S = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

export default async function ({ ok, tmp }) {
  const home = fs.mkdtempSync(path.join(tmp, "one-memory-"));
  const env = { ...process.env, RASANAI_HOME: home, RASANAI_CONSOLE_HEADLESS: "1" };
  const run = (script, ...a) => spawnSync(process.execPath, [path.join(S, script), ...a], { encoding: "utf8", env, cwd: tmp });
  const ledger = () => { try { return fs.readFileSync(path.join(home, "taste.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };

  // ---- the reading formula ----
  const { readTime, wordCount, SLACK_RENDER } = await import("../lib/reading.mjs");
  ok("reading: 0.6 s + 0.3 s per word, no slack at plan level; 0.85 slack at render level; text or a count", Math.abs(readTime(5) - 2.1) < 1e-9 && readTime("five words in this line") === readTime(5) && Math.abs(readTime(5, { slack: SLACK_RENDER }) - 1.785) < 1e-9 && readTime(0) === 0 && wordCount("a b  c") === 3);
  ok("reading: a lesson's longer per-word time still works", Math.abs(readTime(5, { perWord: 0.4 }) - 2.6) < 1e-9);
  const slopSrc = fs.readFileSync(path.join(S, "slop.mjs"), "utf8"), storySrc = fs.readFileSync(path.join(S, "story.mjs"), "utf8"), fitSrc = fs.readFileSync(path.join(S, "lib", "textfit.mjs"), "utf8");
  ok("reading: slop, story and textfit all use lib/reading.mjs and carry no other formula", [slopSrc, storySrc, fitSrc].every((s) => /lib\/reading\.mjs|\.\/reading\.mjs/.test(s)) && ![slopSrc, storySrc].some((s) => /0\.4 \* ow|0\.6 \+ 0\.4|0\.3 \* w \+ 0\.6/.test(s)) && !/need \* T\.read_slack/.test(fitSrc));
  // a 6-word scene of 2.3 s: 0.6 + 1.8 = 2.4 s needed -> slop's plan-level `unreadable` fires; 2.5 s passes
  const proj = (name, d) => { const p = path.join(tmp, name); fs.mkdirSync(p, { recursive: true }); fs.writeFileSync(path.join(p, "index.html"), "<div>x</div>"); fs.writeFileSync(path.join(p, "scenes.json"), JSON.stringify({ scenes: [{ title: "a", duration: d, on_screen: "one two three four five six" }, { title: "b", duration: 3 }, { title: "c", duration: 3 }] })); return p; };
  const unread = (d) => { const r = run("slop.mjs", "--project", proj("rt" + d, d), "--json", "--no-chrome"); try { return JSON.parse(r.stdout).findings.some((f) => f.rule === "unreadable"); } catch { return null; } };
  ok("reading: slop's unreadable uses the one formula (6 words need 2.4 s at plan level)", unread(2.3) === true && unread(2.5) === false);

  // ---- one store ----
  ok("memory: an empty home says so in one view", /No taste notes/.test(run("memory.mjs", "taste").stdout) && /No standing notes or verdicts/.test(run("lessons.mjs", "digest").stdout));
  run("lessons.mjs", "add", "--rule", "Set body type at 48 px or more", "--quote", "your type is always too small", "--kind", "error", "--area", "type");
  run("memory.mjs", "verdict", "--film", "f1", "--stage", "final", "--note", "Loved the pacing, the ending felt abrupt");
  run("memory.mjs", "edit", "--film", "f1", "--stage", "animatic", "--note", "Slower in the middle");
  run("memory.mjs", "edit", "--film", "f2", "--stage", "animatic", "--note", "slower in the middle!");
  const crew = run("lessons.mjs", "brief", "--role", "script-writer").stdout;
  ok("memory: the crew's one block carries the rules and one short Recent verdicts line from the ledger (not the whole ledger)", /Recent verdicts/.test(crew) && /ending felt abrupt/.test(crew) && !/Slower in the middle/.test(crew) && (crew.match(/Recent verdicts/g) || []).length === 1, crew);
  ok("memory: a role with no areas gets nothing", run("lessons.mjs", "brief", "--role", "brand-researcher").stdout === "");
  const dg = run("lessons.mjs", "digest").stdout;
  ok("memory: lessons.mjs digest is the whole view (every area, the verdict line)", /48 px/.test(dg) && /Recent verdicts/.test(dg), dg);
  const taste = run("memory.mjs", "taste").stdout;
  ok("memory: memory.mjs taste is the same view first, then the raw ledger digest; --raw is the ledger alone", taste.startsWith(dg.split("\n")[0]) && /48 px/.test(taste) && /Recurring:\n- x2 \(2 films\)/.test(taste) && !/48 px/.test(run("memory.mjs", "taste", "--raw").stdout), taste);
  ok("memory: suggest offers the repeated note that is no rule yet, with its add line", /x2 \(2 films\) "slower in the middle!?"/i.test(run("lessons.mjs", "suggest").stdout) && /lessons\.mjs add/.test(run("lessons.mjs", "suggest").stdout));
  run("lessons.mjs", "add", "--rule", "Keep the middle slower", "--quote", "Slower in the middle", "--kind", "taste", "--area", "pace");
  ok("memory: once a lesson covers a note it is no longer suggested, nor repeated in the verdict line", /nothing repeated/.test(run("lessons.mjs", "suggest").stdout));

  // ---- a console note is one row, however it arrives ----
  const crun = path.join(tmp, "one-memory-run");
  fs.mkdirSync(crun, { recursive: true });
  const con = (...a) => spawnSync(process.execPath, [path.join(S, "console.mjs"), ...a], { encoding: "utf8", env, cwd: tmp, timeout: 30000 });
  con("push", "--run", crun, "--step", "animatic", "--data", "{}");
  const before = ledger().length;
  const c1 = con("record", "--run", crun, "--step", "animatic", "--type", "comment", "--note", "Hold the logo longer", "--value", '{"scene":"s3","t":12.5}');
  ok("memory: chat `record --type comment` records the note once", c1.status === 0 && ledger().length === before + 1 && ledger().filter((r) => r.note === "Hold the logo longer").length === 1, c1.stderr + JSON.stringify(ledger().slice(-2)));
  con("record", "--run", crun, "--step", "animatic", "--type", "apply", "--value", '{"ids":["x"]}');
  ok("memory: `record --type apply` adds no row", ledger().length === before + 1);
  const n1 = con("record", "--run", crun, "--step", "animatic", "--type", "note", "--note", "Fewer words on the second card");
  ok("memory: a chat note records once too", n1.status === 0 && ledger().filter((r) => r.note === "Fewer words on the second card").length === 1);
  // the same action reaching the ledger a second time (e.g. server POST then a replayed wait) is skipped by its id
  const rec = () => spawnSync(process.execPath, ["--input-type=module", "-e", `import { recordTaste } from ${JSON.stringify(path.join(S, "memory.mjs"))}; console.log(JSON.stringify(recordTaste({ kind: "edit", film: "x", stage: "final", note: "dup test", action: "abc" })))`], { encoding: "utf8", env }).stdout.trim();
  ok("memory: the same action id is one row", rec() !== "null" && rec() === "null" && ledger().filter((r) => r.note === "dup test").length === 1);

  // ---- one corner-label rule ----
  const cp = path.join(tmp, "one-memory-corner");
  fs.mkdirSync(cp, { recursive: true });
  fs.writeFileSync(path.join(cp, "index.html"), `<div data-composition-id="main" data-width="1920" data-height="1080" data-duration="3"><h1>Paper forgets.</h1><span>00:12</span><span>120 BPM</span></div>`);
  const sl = (...a) => { const r = run("slop.mjs", "--project", cp, "--json", ...a); try { return JSON.parse(r.stdout).findings; } catch { return []; } };
  const f1 = sl("--no-chrome");
  ok("corner labels: the source check reports under the one name, corner-micro-label, and no corner-labels rule exists", f1.filter((f) => f.rule === "corner-micro-label").length === 1 && !f1.some((f) => f.rule === "corner-labels"), JSON.stringify(f1.map((f) => f.rule)));
  ok("corner labels: a HUD style is exempt from it", !sl("--no-chrome", "--style", "hud").some((f) => f.rule === "corner-micro-label"));
  const f2 = sl();
  ok("corner labels: with the page-chrome pass on, still one corner-micro-label finding (or none when no Chrome)", f2.filter((f) => f.rule === "corner-micro-label").length <= 1 && !f2.some((f) => f.rule === "corner-labels"), JSON.stringify(f2.map((f) => f.rule)));
}
