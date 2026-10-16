// Series: scripts/series.mjs (show, add-rule, set-pref, brief), lessons.mjs brief --series, the prefs reader, and the console's
// decided push for a skipped Look. export default async function ({ ok, node, tmp, env }), the helpers selftest.mjs defines.
import fs from "node:fs";
import path from "node:path";

export default async function ({ ok, node, tmp }) {
  const root = path.join(tmp, "series-test");
  const dir = path.join(root, "Series", "quotidian");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "DESIGN.md"), "---\nname: Q\n---\n## Overview\nx\n");
  const sj = path.join(dir, "series.json");
  fs.writeFileSync(sj, JSON.stringify({ version: 1, name: "Quotidian", slug: "quotidian", format: { tile: "talking", option: "presenter" }, aspect: "9:16", length: "as-clip", preferences: { pictures: "literal" }, brand: null, look: "DESIGN.md", ending_file: "end-card.mp4", reference: null, rules: [], episodes: [], created: "2026-10-15", modified: "2026-10-15" }, null, 2));
  const J = (r) => { try { return JSON.parse(r.stdout); } catch { return {}; } };
  const S = (a, o) => node("series.mjs", a, o);

  const sh = J(S(["show", "--series", dir]));
  ok("series show: the name, the answers, and the look resolved (exists true), the ending file missing", sh.ok && sh.name === "Quotidian" && sh.preferences.pictures === "literal" && sh.look.exists === true && sh.look.file === path.join(dir, "DESIGN.md") && sh.ending_file.exists === false, JSON.stringify(sh).slice(0, 300));
  ok("series show: a folder with no series.json is exit 1", S(["show", "--series", path.join(root, "nope")]).status === 1);
  const e0 = S(["brief", "--series", dir]);
  ok("series brief: nothing to say with no rules", e0.status === 0 && e0.stdout === "");
  const a1 = J(S(["add-rule", "--series", dir, "--text", "No captions on screen", "--film", "ep1"]));
  ok("series add-rule: a rule with an id, the film and the time", a1.ok && a1.rule.id === "r1" && a1.rule.from_film === "ep1" && /^\d{4}-/.test(a1.rule.at) && !a1.rule.deduped, JSON.stringify(a1));
  const a2 = J(S(["add-rule", "--series", dir, "--text", "no captions on screen.", "--film", "ep2"]));
  ok("series add-rule: the same rule again is deduped, not doubled", a2.rule.deduped === true && a2.rule.id === "r1" && JSON.parse(fs.readFileSync(sj, "utf8")).rules.length === 1);
  const a3 = J(S(["add-rule", "--series", dir, "--text", "Always end on the end card", "--film", "ep2"]));
  ok("series add-rule: a second rule is r2", a3.rule.id === "r2");
  ok("series add-rule: no text is exit 1", S(["add-rule", "--series", dir]).status === 1);
  const p1 = J(S(["set-pref", "--series", dir, "--question", "captions", "--choice", "off"]));
  ok("series set-pref: a known question and choice is saved, the rest kept", p1.ok && p1.preferences.captions === "off" && p1.preferences.pictures === "literal" && JSON.parse(fs.readFileSync(sj, "utf8")).preferences.captions === "off");
  ok("series set-pref: an unknown choice or question is exit 1 and changes nothing", S(["set-pref", "--series", dir, "--question", "captions", "--choice", "shiny"]).status === 1 && S(["set-pref", "--series", dir, "--question", "mood", "--choice", "off"]).status === 1 && JSON.parse(fs.readFileSync(sj, "utf8")).preferences.captions === "off");
  const p2 = J(S(["set-pref", "--series", dir, "--question", "captions", "--choice", "unsure"]));
  ok("series set-pref: unsure clears the answer", p2.choice === null && !("captions" in JSON.parse(fs.readFileSync(sj, "utf8")).preferences));
  const b1 = S(["brief", "--series", dir]);
  ok("series brief: the rules block for crew briefs", /Rules of the series "Quotidian"/.test(b1.stdout) && /- No captions on screen \(said on ep1\)/.test(b1.stdout) && /end card/.test(b1.stdout), b1.stdout);
  ok("series: the file keeps the contract's fields and gets a new modified time", JSON.parse(fs.readFileSync(sj, "utf8")).format.option === "presenter" && JSON.parse(fs.readFileSync(sj, "utf8")).modified !== "2026-10-15");

  // lessons brief --series (and from the project's rasanai-brief.json)
  const home = path.join(root, "home");
  fs.mkdirSync(home, { recursive: true });
  const env = { RASANAI_HOME: home };
  const lb = node("lessons.mjs", ["brief", "--role", "visual-writer", "--series", dir], { env });
  ok("lessons brief --series: a role with no lesson areas still gets the series' rules", /No captions on screen/.test(lb.stdout), lb.stdout);
  node("lessons.mjs", ["add", "--rule", "Keep type large", "--kind", "taste", "--area", "type"], { env });
  const lb2 = node("lessons.mjs", ["brief", "--role", "critic", "--series", dir], { env });
  ok("lessons brief --series: the user's standing notes first, then the series' rules", /Standing notes[\s\S]*Keep type large[\s\S]*Rules of the series/.test(lb2.stdout), lb2.stdout);
  const proj = path.join(root, "project");
  fs.mkdirSync(proj, { recursive: true });
  fs.writeFileSync(path.join(proj, "rasanai-brief.json"), JSON.stringify({ brief: "x", series: { name: "Quotidian", slug: "quotidian", path: dir } }));
  const lb3 = node("lessons.mjs", ["brief", "--role", "critic"], { env, cwd: proj });
  ok("lessons brief: the project's rasanai-brief.json series.path is enough", /Rules of the series/.test(lb3.stdout));
  const lb4 = node("lessons.mjs", ["brief", "--role", "critic"], { env, cwd: root });
  ok("lessons brief: no series, no rules block", !/Rules of the series/.test(lb4.stdout));

  // the prefs reader: the brief file and the request text say the same thing
  const P = await import(path.join(path.dirname(new URL(import.meta.url).pathname), "..", "lib", "prefs.mjs"));
  const bf = path.join(root, "rasanai-brief.json");
  fs.writeFileSync(bf, JSON.stringify({ preferences: { pictures: "literal", captions: "off", ending: "card", bogus: "x", text: "huge" }, ending_file: "card.mp4", series: { name: "Q", slug: "q", path: dir } }));
  const L = P.loadPrefs(bf);
  ok("prefs: the brief file's answers load; unknown questions and choices are dropped; ending_file resolves beside the file", L.prefs.pictures === "literal" && L.prefs.captions === "off" && L.prefs.ending === "card" && !("bogus" in L.prefs) && !("text" in L.prefs) && L.ending_file === path.join(root, "card.mp4") && L.series.path === dir, JSON.stringify(L));
  const blk = P.prefsBlock(L);
  const T = P.parsePrefsText(blk);
  ok("prefs: the request-text block round-trips (contract format)", /^PREFERENCES \(the owner's choices; obey them, never reinterpret; read library\/questions\.json for meanings\):\n- pictures = literal \(Plain and literal\)\n- captions = off \(No captions\)/.test(blk) && /ENDING CARD FILE: /.test(blk) && /SERIES: Q \(/.test(blk) && T.prefs.pictures === "literal" && T.prefs.ending === "card" && T.ending_file === path.join(root, "card.mp4") && T.series.path === dir, blk);

  // the console pushes a decided step ("From your series") without asking
  const run = path.join(root, "run");
  fs.mkdirSync(run, { recursive: true });
  const ce = { RASANAI_CONSOLE_HEADLESS: "1" };
  const push = node("console.mjs", ["push", "--run", run, "--step", "look", "--status", "done", "--data", JSON.stringify({ decision: "From your series: Quotidian", series: { name: "Quotidian", path: dir } })], { env: ce });
  const sess = JSON.parse(fs.readFileSync(path.join(run, "session.json"), "utf8"));
  ok("console: the Look call is pushed decided, as From your series (done, no wait), with the brief's series, preferences and ending_file fields accepted", push.status === 0 && sess.steps.look.status === "done" && sess.steps.look.decision === "From your series: Quotidian" && sess.steps.look.series.name === "Quotidian", push.stderr + push.stdout);
  const bp = node("console.mjs", ["push", "--run", run, "--step", "brief", "--status", "awaiting", "--data", JSON.stringify({ fields: { subject: "A talk", aspect: "9:16" }, preferences: { pictures: "literal" }, series: { name: "Quotidian", slug: "quotidian", path: dir }, ending_file: "/x/end.mp4" })], { env: ce });
  const s2 = JSON.parse(fs.readFileSync(path.join(run, "session.json"), "utf8"));
  ok("console: a brief push keeps preferences, series and ending_file for the page", bp.status === 0 && s2.steps.brief.preferences.pictures === "literal" && s2.steps.brief.series.slug === "quotidian" && s2.steps.brief.ending_file === "/x/end.mp4", bp.stderr);
}
