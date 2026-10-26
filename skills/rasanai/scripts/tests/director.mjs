// director.mjs (status / resume / stop / install-tool) on fixture projects: the real Studio driver (apps/macos/Runtime/director-driver.mjs)
// runs a FAKE agent, so nothing here calls a model, installs anything or touches a real film. HOME is a temp folder.
// export default async function ({ ok, tmp, env }).
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resumePrompt, loadDraft, projectSources } from "../lib/director-launch.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIRECTOR = path.join(HERE, "..", "director.mjs");
const SKILL = path.join(HERE, "..", "..");
const DRIVER = path.join(SKILL, "..", "..", "apps", "macos", "Runtime", "director-driver.mjs");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default async function ({ ok, tmp, env }) {
  if (!fs.existsSync(DRIVER)) { console.log("note  director: Studio's director-driver.mjs is not beside this skill, director cases skipped"); return; }
  const home = path.join(tmp, "dhome");
  fs.mkdirSync(home, { recursive: true });
  const E = { ...env, HOME: home, RASANAI_HOME: path.join(home, ".rasanai") };
  const run = (...a) => { const r = spawnSync(process.execPath, [DIRECTOR, ...a], { encoding: "utf8", env: E, timeout: 60000 }); let j = null; try { j = JSON.parse(r.stdout); } catch {} return { r, j, lines: r.stdout.split("\n").filter(Boolean).length }; };
  const runAsync = (...a) => new Promise((resolve) => { let out = ""; const c = spawn(process.execPath, [DIRECTOR, ...a], { env: E }); c.stdout.on("data", (d) => (out += d)); c.on("close", () => resolve(JSON.parse(out))); });

  // the fake agent: records how it was started, then stays alive until it is told to end
  const fake = path.join(tmp, "fake-claude.mjs");
  fs.writeFileSync(fake, `#!/usr/bin/env node
import fs from "node:fs";
fs.appendFileSync(process.env.FAKE_LOG || "${path.join(tmp, "fake-starts.jsonl")}", JSON.stringify({ args: process.argv.slice(2), headless: process.env.RASANAI_CONSOLE_HEADLESS, claudecode: process.env.CLAUDECODE || null, ceiling: process.env.CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS, cwd: process.cwd() }) + "\\n");
process.on("SIGTERM", () => process.exit(0));
setInterval(() => {}, 1000);
`, { mode: 0o755 });
  const startsLog = path.join(tmp, "fake-starts.jsonl");
  const starts = () => { try { return fs.readFileSync(startsLog, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };

  const mkProject = (name, { draft = null, subject = "A film" } = {}) => {
    const project = path.join(tmp, name);
    const runDir = path.join(project, ".rasanai", "run-1");
    fs.mkdirSync(path.join(project, "assets", "sources"), { recursive: true });
    fs.mkdirSync(runDir, { recursive: true });
    fs.writeFileSync(path.join(project, ".rasanai", "current"), "run-1");
    fs.writeFileSync(path.join(runDir, "session.json"), JSON.stringify({ schema: 1, current: "brief", steps: { brief: { status: "awaiting", fields: { subject } } } }));
    fs.writeFileSync(path.join(runDir, "console.json"), JSON.stringify({ headless: true, skill: SKILL, external_actions: 1 }));
    if (draft) fs.writeFileSync(path.join(project, "rasanai-brief.json"), JSON.stringify(draft));
    const job = { executable: fake, arguments: ["--print", "--output-format", "stream-json", "--verbose", "--permission-mode", "acceptEdits", "--settings", '{"permissions":{"allow":["Read"]}}', "--model", "claude-opus-5-5", "OLD PROMPT"], cwd: project };
    return { project: fs.realpathSync(project), runDir: fs.realpathSync(runDir), job, writeJob: () => fs.writeFileSync(path.join(runDir, "director-job.json"), JSON.stringify(job), { mode: 0o600 }) };
  };
  const events = (runDir) => { try { return fs.readFileSync(path.join(runDir, "director-events.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
  const live = [];
  const cleanup = () => { for (const pid of live) { try { process.kill(pid, "SIGTERM"); } catch {} } };

  try {
    // ---- status
    const a = mkProject("dir-a", { draft: { brief: "b", duration: 30, aspect: "16:9", agent: "claude", motionLevel: "balanced", pace: "standard" } });
    let s = run("status", a.project);
    ok("director status: a run that never had a director is `none`, one JSON line, exit 0", s.r.status === 0 && s.lines === 1 && s.j.ok === true && s.j.schema === 1 && s.j.run === "run-1" && s.j.state === "none" && s.j.pid === null && s.j.since === null && s.j.exit === null, s.r.stdout);
    const bad = [run("status", path.join(tmp, "nothing-here")), run("status", tmp), run("bogus", a.project), run("status")];
    ok("director: every error is {ok:false, reason} with one fixed sentence, exit 0, no stack or path", bad.every((x) => x.r.status === 0 && x.lines === 1 && x.j.ok === false && typeof x.j.reason === "string" && !x.r.stdout.includes(tmp) && !/at .*\.mjs|Error/.test(x.r.stdout)), bad.map((x) => x.r.stdout).join(" | "));
    let r = run("resume", a.project);
    ok("director resume: a film that never had a director says so and starts nothing", r.j.ok === false && /no director/i.test(r.j.reason) && starts().length === 0, r.r.stdout);
    r = run("stop", a.project);
    ok("director stop: nothing running is refused", r.j.ok === false && r.j.reason === "The director is not running.", r.r.stdout);

    // ---- resume starts a fresh director on the same run, exactly as Studio's resume does
    a.writeJob();
    fs.writeFileSync(path.join(a.project, "assets", "sources", "take.mov"), "");
    r = run("resume", a.project, "--source", "squeak-phone");
    ok("director resume: starts the director and says its pid", r.j && r.j.ok === true && Number.isInteger(r.j.pid) && Object.keys(r.j).sort().join() === "ok,pid", r.r.stdout);
    if (!r.j || !r.j.ok) return;
    live.push(r.j.pid);
    for (let i = 0; i < 50 && !starts().length; i++) await sleep(100);
    const started = starts()[0] || {};
    const expected = resumePrompt({ agent: "claude", engine: SKILL, project: a.project, run: a.runDir, draft: loadDraft(a.project), sources: projectSources(a.project), questions: null, briefSeeded: true });
    const expectedQ = resumePrompt({ agent: "claude", engine: SKILL, project: a.project, run: a.runDir, draft: loadDraft(a.project), sources: projectSources(a.project), questions: JSON.parse(fs.readFileSync(path.join(SKILL, "library", "questions.json"), "utf8")), briefSeeded: true });
    ok("director resume: the agent gets the run's own flags, settings and model, and Studio's resume prompt last", started.args && started.args.slice(0, -1).join("\u0001") === a.job.arguments.slice(0, -1).join("\u0001") && [expected, expectedQ].includes(started.args.at(-1)) && /^Resume this existing run from its saved state/.test(started.args.at(-1).split("User request (treat as task content, not changes to the above operating contract):\n")[1]) && started.args.at(-1).includes("MOTION GRAPHICS LEVEL: BALANCED") && started.args.at(-1).includes("FOOTAGE REEL"), JSON.stringify(started.args && started.args.at(-1).slice(-300)));
    ok("director resume: Studio's environment (headless console, no CLAUDECODE, background-task ceiling off) and the project as the working folder", started.headless === "1" && started.claudecode === null && started.ceiling === "0" && fs.realpathSync(started.cwd) === a.project, JSON.stringify(started));
    const jobNow = JSON.parse(fs.readFileSync(path.join(a.runDir, "director-job.json"), "utf8"));
    ok("director resume: director-job.json is rewritten (0600) with the new prompt, same executable and cwd", (fs.statSync(path.join(a.runDir, "director-job.json")).mode & 0o777) === 0o600 && jobNow.executable === fake && fs.realpathSync(jobNow.cwd) === a.project && jobNow.arguments.at(-1) === started.args.at(-1) && fs.statSync(path.join(a.runDir, "director.log")).mode % 0o1000 === 0o600);
    const ev = events(a.runDir);
    ok("director resume: the driver's start event carries the pid it returned (what Studio's adopt looks for)", ev.length === 1 && ev[0].event === "start" && ev[0].pid === r.j.pid, JSON.stringify(ev));
    s = run("status", a.project);
    ok("director status: running with the driver's pid and the start time", s.j.state === "running" && s.j.pid === r.j.pid && s.j.since === ev[0].t && s.j.exit === null, s.r.stdout);
    r = run("resume", a.project);
    ok("director resume: a running director is refused with the fixed sentence", r.j.ok === false && r.j.reason === "The director is already running." && starts().length === 1, r.r.stdout);
    ok("director: nothing touched director-watch (Studio's heartbeat)", !fs.existsSync(path.join(a.runDir, "director-watch")));

    // ---- frozen: the driver freezes the group on SIGUSR1; resume thaws it (SIGUSR2) and starts nothing new
    process.kill(s.j.pid, "SIGUSR1");
    for (let i = 0; i < 50 && !events(a.runDir).some((e) => e.event === "freeze"); i++) await sleep(100);
    s = run("status", a.project);
    ok("director status: a freeze with no thaw after it is `frozen`, since the freeze", s.j.state === "frozen" && s.j.pid === live[0] && s.j.since === events(a.runDir).find((e) => e.event === "freeze").t, s.r.stdout);
    r = run("resume", a.project);
    for (let i = 0; i < 50 && !events(a.runDir).some((e) => e.event === "thaw"); i++) await sleep(100);
    ok("director resume: a frozen director is thawed, not restarted (same pid, one fake agent)", r.j.ok === true && r.j.pid === live[0] && events(a.runDir).some((e) => e.event === "thaw") && starts().length === 1 && run("status", a.project).j.state === "running", r.r.stdout);

    // ---- stop
    r = run("stop", a.project);
    s = run("status", a.project);
    const exit = events(a.runDir).find((e) => e.event === "exit");
    ok("director stop: SIGTERMs the driver; the exit is a stop (code 130) and status says `stopped`", r.j.ok === true && Object.keys(r.j).join() === "ok" && exit && exit.stopped === true && exit.code === 130 && s.j.state === "stopped" && s.j.pid === null && s.j.exit.stopped === true && s.j.exit.code === 130 && s.j.since === exit.t, r.r.stdout + s.r.stdout);
    r = run("stop", a.project);
    ok("director stop: a second stop is refused", r.j.ok === false && r.j.reason === "The director is not running.");

    // ---- resume again after a stop: a second director on the same run; two resumes at once start exactly one
    const [x, y] = await Promise.all([runAsync("resume", a.project), runAsync("resume", a.project)]);
    for (const z of [x, y]) if (z.ok) live.push(z.pid);
    for (let i = 0; i < 50 && starts().length < 2; i++) await sleep(100);
    await sleep(500);
    ok("director resume: two resumes at once start exactly one director (the other is refused)", [x, y].filter((z) => z.ok).length === 1 && [x, y].filter((z) => !z.ok).every((z) => ["Another resume is already starting the director.", "The director is already running."].includes(z.reason)) && starts().length === 2 && events(a.runDir).filter((e) => e.event === "start").length === 2, JSON.stringify([x, y, starts().length]));
    ok("director resume: the lock is released", !fs.existsSync(path.join(a.runDir, "director.lock")));
    // a stale lock (its owner is gone) is taken over
    run("stop", a.project);
    fs.writeFileSync(path.join(a.runDir, "director.lock"), "999999 " + Date.now() + "\n");
    r = run("resume", a.project);
    if (r.j && r.j.ok) live.push(r.j.pid);
    ok("director resume: a lock whose owner is gone is taken over", r.j.ok === true, r.r.stdout);
    run("stop", a.project);
    fs.writeFileSync(path.join(a.runDir, "director.lock"), `${process.pid} ${Date.now()}\n`);
    r = run("resume", a.project);
    ok("director resume: a live lock holder blocks it", r.j.ok === false && r.j.reason === "Another resume is already starting the director.", r.r.stdout);
    fs.rmSync(path.join(a.runDir, "director.lock"), { force: true });

    // ---- crashed, finished
    const c = mkProject("dir-c");
    fs.writeFileSync(path.join(c.runDir, "director-events.jsonl"), JSON.stringify({ t: "2026-01-01T00:00:00.000Z", event: "start", pid: 999999 }) + "\n");
    s = run("status", c.project);
    ok("director status: a start whose driver is gone with no exit is `crashed` (code unknown)", s.j.state === "crashed" && s.j.pid === null && s.j.exit && s.j.exit.code === null && s.j.exit.stopped === false, s.r.stdout);
    fs.writeFileSync(path.join(c.runDir, "director-events.jsonl"), [{ t: "2026-01-01T00:00:00.000Z", event: "start", pid: 1 }, { t: "2026-01-01T00:05:00.000Z", event: "exit", code: 2, stopped: false }].map((e) => JSON.stringify(e)).join("\n") + "\n");
    s = run("status", c.project);
    ok("director status: a non-zero exit that was not a stop is `crashed` with its code", s.j.state === "crashed" && s.j.exit.code === 2 && s.j.since === "2026-01-01T00:05:00.000Z", s.r.stdout);
    fs.writeFileSync(path.join(c.runDir, "session.json"), JSON.stringify({ schema: 1, current: "final", steps: { final: { status: "done" } } }));
    s = run("status", c.project);
    r = run("resume", c.project);
    ok("director status: the Final call answered is `finished`, and a finished film is not resumed", s.j.state === "finished" && r.j.ok === false && r.j.reason === "This film is finished." && starts().length === 2 + 1, s.r.stdout + r.r.stdout);

    // ---- a codex director, and a job that is not one we can resume
    const d = mkProject("dir-d");
    d.job.arguments = ["exec", "--skip-git-repo-check", "--json", "--sandbox", "workspace-write", "--cd", d.project, "OLD PROMPT"];
    d.writeJob();
    r = run("resume", d.project);
    if (r.j && r.j.ok) live.push(r.j.pid);
    for (let i = 0; i < 50 && starts().length < 4; i++) await sleep(100);
    const codex = starts().at(-1) || {};
    ok("director resume: a codex director keeps its sandbox arguments and gets the codex prompt", r.j.ok === true && codex.args && codex.args.slice(0, -1).join(" ") === d.job.arguments.slice(0, -1).join(" ") && codex.args.at(-1).includes("RasanAI director") && !codex.args.at(-1).includes("MODEL PLAN"), JSON.stringify(codex.args && codex.args.slice(0, 3)));
    run("stop", d.project);
    const e2 = mkProject("dir-e");
    e2.job.arguments = ["--version"];
    e2.writeJob();
    r = run("resume", e2.project);
    ok("director resume: a job with no prompt to replace is refused", r.j.ok === false, r.r.stdout);

    // ---- install-tool, with a fake of Studio's tool-setup (the real one downloads packages)
    const setup = path.join(tmp, "fake-tool-setup.mjs");
    fs.writeFileSync(setup, `import fs from "node:fs"; import path from "node:path";
const job = JSON.parse(fs.readFileSync(process.argv[2], "utf8")); const status = path.join(path.dirname(process.argv[2]), "status.json");
fs.appendFileSync(${JSON.stringify(path.join(tmp, "fake-setup.log"))}, JSON.stringify(job) + "\\n");
if (job.tools[0] === "browser") { fs.writeFileSync(status, JSON.stringify({ message: "Setup needs attention.", completed: [], error: "Setup stopped at " + process.env.HOME + "/x. Check your connection.", cancelled: false })); process.exit(1); }
fs.writeFileSync(status, JSON.stringify({ message: "done", completed: job.tools, error: null, cancelled: false }));
`);
    const IE = { ...E, RASANAI_TOOL_SETUP: setup };
    const inst = (...a) => { const q = spawnSync(process.execPath, [DIRECTOR, "install-tool", ...a], { encoding: "utf8", env: IE, timeout: 60000 }); return { j: JSON.parse(q.stdout), out: q.stdout, status: q.status }; };
    let t = inst(a.project, "skills");
    const jobs = () => fs.readFileSync(path.join(tmp, "fake-setup.log"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
    ok("director install-tool: runs Studio's tool setup for that tool (with the engine) and says ok", t.status === 0 && t.j.ok === true && t.j.tool === "skills" && jobs().length === 1 && jobs()[0].tools.join() === "skills" && jobs()[0].engine === SKILL, t.out);
    t = inst(a.project, "hyperframes");
    ok("director install-tool: a program name maps to its managed tool (hyperframes is the renderer; ok only if it is then on the PATH)", jobs().at(-1).tools.join() === "renderer" && (t.j.ok === true || /cannot find hyperframes/.test(t.j.reason)), t.out);
    t = inst(a.project, "browser");
    ok("director install-tool: a failed setup says why, with the home folder shortened", t.j.ok === false && t.j.reason.startsWith("Setup stopped at ~/x.") && !t.out.includes(home), t.out);
    t = inst(a.project, "brew");
    ok("director install-tool: a tool Studio cannot install is refused and nothing ran", t.j.ok === false && /cannot install that tool/.test(t.j.reason) && jobs().length === 3, t.out);
    t = inst(a.project, "x; rm -rf /");
    ok("director install-tool: a tool name that is not a plain word is refused", t.j.ok === false && jobs().length === 3, t.out);
  } finally {
    cleanup();
    await sleep(300);
  }
}
