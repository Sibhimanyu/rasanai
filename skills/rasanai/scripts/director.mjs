#!/usr/bin/env node
// director.mjs: look after a film's director (the `claude`/`codex` session that runs it) from outside RasanAI Studio, for an app
// that shows a film somewhere else (a phone pager such as Squeak, references/remote.md, "The director").
//
//   node director.mjs status  <projectDir>                  state of the director: running | frozen | stopped | crashed | finished | none
//   node director.mjs resume  <projectDir> [--source S]     thaw a frozen director, or start a fresh one on the SAME run as Studio's Resume does
//   node director.mjs stop    <projectDir>                  SIGTERM the driver, like Studio's Stop
//   node director.mjs install-tool <projectDir> <tool>      Studio's no-password tool setup for ffmpeg, hyperframes, browser, skills or transcriber
//
// Every command prints ONE JSON line to stdout and exits 0. A failure is {"ok":false,"reason":"<one fixed sentence>"}: never a stack,
// a path or a secret. `<projectDir>` is the project folder (its `.rasanai/current` names the run).
//
// The director is the same thing RasanAI Studio starts: `node Runtime/director-driver.mjs <run>/director-job.json`, which spawns the
// agent detached and writes `start` / `exit` lines to <run>/director-events.jsonl (apps/macos/Sources/StudioCore/RunEvents.swift).
// `resume` re-uses the run's own director-job.json (agent, executable, permission settings, model: everything but the prompt) and
// builds the prompt with lib/director-launch.mjs, the Node port of Studio's DirectorLaunch (golden-tested against Swift). It never
// touches `director-watch`, which is Studio's heartbeat. Studio finds a director started here the way it finds its own after a
// relaunch (DirectorRuntime.adopt: the open `start` event whose pid is a live director-driver of that run).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { SKILL_DIR } from "./lib/common.mjs";
import { loadDraft, projectSources, loadQuestions, resumePrompt } from "./lib/director-launch.mjs";

const HOME = os.homedir();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
const fail = (reason) => ({ ok: false, reason });
const readJSON = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };

// ---- the run

export function resolveRun(projectArg) {
  if (!projectArg || typeof projectArg !== "string") return { error: "Say which film folder to use." };
  let project;
  try { project = fs.realpathSync(path.resolve(projectArg)); } catch { return { error: "That film folder is not there." }; }
  if (!isDir(project)) return { error: "That film folder is not there." };
  let name = "";
  try { name = fs.readFileSync(path.join(project, ".rasanai", "current"), "utf8").trim(); } catch {}
  if (!name || /[\\/]/.test(name) || name.startsWith(".")) return { error: "This folder has no RasanAI film." };
  const run = path.join(project, ".rasanai", name);
  if (!isDir(run)) return { error: "This folder has no RasanAI film." };
  return { project, run, name };
}

// ---- liveness (read from files and `ps`, the same rules as RunEvents.swift and DirectorRuntime.swift)

export function readEvents(run) {
  let text = "";
  try { text = fs.readFileSync(path.join(run, "director-events.jsonl"), "utf8"); } catch { return []; }
  const out = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line);
      if (isObj(e) && ["start", "freeze", "thaw", "exit", "auto-resume"].includes(e.event) && Number.isFinite(Date.parse(e.t))) out.push(e);
    } catch {}
  }
  return out.map((e, i) => [e, i]).sort((a, b) => Date.parse(a[0].t) - Date.parse(b[0].t) || a[1] - b[1]).map((x) => x[0]);
}
// the newest `start` with nothing after it but freezes and thaws
export function openStart(events) {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].event === "start") return events[i];
    if (events[i].event === "exit") return null;
  }
  return null;
}
export function lastFreeze(events) {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].event === "freeze") return events[i];
    if (["thaw", "start", "exit"].includes(events[i].event)) return null;
  }
  return null;
}
const ps = (args) => { try { return execFileSync("/bin/ps", args, { encoding: "utf8", timeout: 4000, stdio: ["ignore", "pipe", "ignore"] }); } catch { return ""; } };
// alive AND a director-driver of this run: a pid alone could have been reused by any other process
export function isDriver(pid, run) {
  if (!Number.isInteger(pid) || pid <= 1) return false;
  try { process.kill(pid, 0); } catch (e) { if (e.code !== "EPERM") return false; }
  const command = ps(["-ww", "-o", "command=", "-p", String(pid)]);
  const paths = new Set([run]);
  try { paths.add(fs.realpathSync(run)); } catch {}
  return command.includes("director-driver.mjs") && [...paths].some((p) => command.includes(p));
}
const stateOf = (pid) => ps(["-o", "stat=", "-p", String(pid)]).trim();

const stepDone = (session, id) => !!(session && isObj(session.steps) && isObj(session.steps[id]) && session.steps[id].status === "done");
export function isFinished(run) {
  const s = readJSON(path.join(run, "session.json"));
  return stepDone(s, "final") || (!(s && s.steps && s.steps.final) && stepDone(s, "render"));
}

export function directorStatus(project, run, name) {
  const events = readEvents(run);
  const open = openStart(events);
  const lastExit = [...events].reverse().find((e) => e.event === "exit") || null;
  const exit = lastExit ? { code: Number.isFinite(lastExit.code) ? lastExit.code : null, stopped: lastExit.stopped === true, t: lastExit.t } : null;
  const base = { ok: true, schema: 1, run: name };
  if (open) {
    if (isDriver(open.pid, run)) {
      const freeze = lastFreeze(events);
      const frozen = !!freeze || /T/.test(stateOf(open.pid));
      return { ...base, state: frozen ? "frozen" : "running", pid: open.pid, since: frozen && freeze ? freeze.t : open.t, exit: null };
    }
    // a start whose driver is gone with no exit after it died hard; the log's last write is when
    let since = open.t;
    try { since = fs.statSync(path.join(run, "director.log")).mtime.toISOString(); } catch {}
    return { ...base, state: "crashed", pid: null, since, exit: { code: null, stopped: false, t: since } };
  }
  if (!events.length) return { ...base, state: isFinished(run) ? "finished" : "none", pid: null, since: null, exit: null };
  const state = isFinished(run) ? "finished" : exit && exit.stopped ? "stopped" : exit && exit.code === 0 ? "stopped" : "crashed";
  return { ...base, state, pid: null, since: exit ? exit.t : null, exit };
}

// ---- a lock so two resumes cannot start two directors (O_EXCL, "<pid> <unix ms>", stale when its owner is gone or after 2 minutes)
function takeLock(file) {
  for (let i = 0; i < 2; i++) {
    try {
      const fd = fs.openSync(file, "wx", 0o600);
      try { fs.writeSync(fd, `${process.pid} ${Date.now()}\n`); } finally { fs.closeSync(fd); }
      return true;
    } catch (e) {
      if (e.code !== "EEXIST") return false;
    }
    let stale = false;
    try {
      const [pid, ms] = fs.readFileSync(file, "utf8").trim().split(" ").map(Number);
      let alive = false;
      try { process.kill(pid, 0); alive = true; } catch (e) { alive = e.code === "EPERM"; }
      stale = !alive || !(Date.now() - ms < 120000);
    } catch { stale = true; }
    if (!stale) return false;
    try { fs.rmSync(file, { force: true }); } catch {}
  }
  return false;
}
const dropLock = (file) => { try { if (Number(fs.readFileSync(file, "utf8").split(" ")[0]) === process.pid) fs.rmSync(file, { force: true }); } catch {} };

// ---- what a director needs around it (DirectorRuntime.environment, LocalAgent.searchDirectories)
const TOOLS_DIR = path.join(HOME, "Library", "Application Support", "RasanAI", "Tools");
function directorEnv() {
  const env = { ...process.env };
  const search = [path.join(TOOLS_DIR, "bin"), path.join(HOME, ".local/bin"), path.join(HOME, ".npm-global/bin"), "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", ...(process.env.PATH || "").split(":").filter(Boolean)];
  env.PATH = [path.dirname(process.execPath), ...search].join(":");
  env.RASANAI_NO_UPDATE_CHECK = "1";
  env.RASANAI_AUTO_UPDATE = "0";
  env.RASANAI_CONSOLE_HEADLESS = "1"; // no console server: every console.mjs command the director runs is headless
  delete env.CLAUDECODE;
  env.CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS = "0"; // DirectorLaunch.environmentOverrides
  delete env.RASANAI_IMAGEGEN;
  return env;
}
function engineOf(run) {
  const c = readJSON(path.join(run, "console.json"));
  return c && typeof c.skill === "string" && isFile(path.join(c.skill, "SKILL.md")) ? c.skill : SKILL_DIR;
}
// Studio's bundle holds the engine at Contents/Resources/Engine/rasanai and the runtime beside it at Contents/Resources/Runtime
function runtimeFile(engine, name, override) {
  const candidates = [override, path.join(engine, "..", "..", "Runtime", name), path.join(SKILL_DIR, "..", "..", "Runtime", name), path.join(SKILL_DIR, "..", "..", "apps", "macos", "Runtime", name)];
  return candidates.filter(Boolean).map((p) => path.resolve(p)).find(isFile) || null;
}

// ---- commands

async function waitForStart(run, pid, child, ms = 6000) {
  const t0 = Date.now();
  let exited = false;
  child.on("exit", () => { exited = true; });
  while (Date.now() - t0 < ms) {
    if (readEvents(run).some((e) => e.event === "start" && e.pid === pid)) return true;
    if (exited) return false;
    await sleep(100);
  }
  return false;
}

async function resume(project, run, name, source) {
  if (source !== undefined && !(typeof source === "string" && /^[a-z-]{2,20}$/.test(source))) return fail("That source name is not valid.");
  const lock = path.join(run, "director.lock");
  if (!takeLock(lock)) return fail("Another resume is already starting the director.");
  try {
    const status = directorStatus(project, run, name);
    if (status.state === "running") return fail("The director is already running.");
    if (status.state === "frozen") {
      try { process.kill(status.pid, "SIGUSR2"); } catch { return fail("The director could not be resumed."); }
      return { ok: true, pid: status.pid };
    }
    if (status.state === "finished") return fail("This film is finished.");
    const job = readJSON(path.join(run, "director-job.json"));
    if (!isObj(job) || typeof job.executable !== "string" || !path.isAbsolute(job.executable) || !Array.isArray(job.arguments) || job.arguments.length < 2 || !job.arguments.every((a) => typeof a === "string")) {
      return fail("This film has no director to resume yet. Start it in RasanAI Studio first.");
    }
    try { fs.accessSync(job.executable, fs.constants.X_OK); } catch { return fail("The director's program is no longer installed. Open RasanAI Studio to set it up again."); }
    const agent = job.arguments[0] === "--print" ? "claude" : job.arguments[0] === "exec" ? "codex" : null;
    if (!agent) return fail("This film's director is not one RasanAI can resume from here.");
    const cwd = typeof job.cwd === "string" && isDir(job.cwd) ? job.cwd : project;
    const engine = engineOf(run);
    const driver = runtimeFile(engine, "director-driver.mjs", process.env.RASANAI_DIRECTOR_DRIVER);
    if (!driver) return fail("RasanAI Studio's director driver was not found. Open RasanAI Studio once, then try again.");
    const session = readJSON(path.join(run, "session.json"));
    const subject = session && isObj(session.steps) && isObj(session.steps.brief) && isObj(session.steps.brief.fields) ? session.steps.brief.fields.subject : "";
    const draft = loadDraft(project);
    const prompt = resumePrompt({ agent, engine, project, run, draft, sources: projectSources(project), questions: loadQuestions(engine), briefSeeded: typeof subject === "string" && subject.length > 0 });
    // the same agent, program, permission settings and model as the run's own director: only the prompt (the last argument) is new
    const args = [...job.arguments.slice(0, -1), prompt];
    for (const d of [".rasanai", "Library/Application Support/RasanAI/Tools", ".cache/hyperframes", ".npm"]) { try { fs.mkdirSync(path.join(HOME, d), { recursive: true }); } catch {} }
    const jobFile = path.join(run, "director-job.json");
    const tmp = `${jobFile}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ executable: job.executable, arguments: args, cwd }), { mode: 0o600 });
    fs.renameSync(tmp, jobFile);
    fs.chmodSync(jobFile, 0o600);
    const log = path.join(run, "director.log");
    if (!fs.existsSync(log)) fs.writeFileSync(log, "", { mode: 0o600 });
    const fd = fs.openSync(log, "a");
    let child;
    try {
      child = spawn(process.execPath, [driver, jobFile], { cwd: project, env: directorEnv(), detached: true, stdio: ["ignore", fd, fd] });
    } finally { fs.closeSync(fd); }
    child.on("error", () => {});
    const pid = child.pid;
    const started = Number.isInteger(pid) && (await waitForStart(run, pid, child));
    child.unref();
    return started ? { ok: true, pid } : fail("The director did not start. Open RasanAI Studio to see why.");
  } finally { dropLock(lock); }
}

async function stop(project, run, name) {
  const status = directorStatus(project, run, name);
  if (status.state !== "running" && status.state !== "frozen") return fail("The director is not running.");
  try { process.kill(status.pid, "SIGTERM"); } catch { return fail("The director could not be stopped."); }
  for (let i = 0; i < 60; i++) { // the driver writes its exit, then ends the director's process group (2 s grace)
    await sleep(100);
    if (!isDriver(status.pid, run)) break;
  }
  return { ok: true };
}

// the program names Studio's managed setup knows (ToolNeed.managedKey, Runtime/tool-setup.mjs)
const MANAGED = { ffmpeg: "ffmpeg", ffprobe: "ffmpeg", hyperframes: "renderer", renderer: "renderer", browser: "browser", chrome: "browser", chromium: "browser", "chrome-headless-shell": "browser", skills: "skills", "design-resources": "skills", whisper: "transcriber", "whisper-cli": "transcriber", transcriber: "transcriber", "whisper.cpp": "transcriber" };
const EXECUTABLES = { ffmpeg: ["ffmpeg", "ffprobe"], renderer: ["hyperframes"], transcriber: ["whisper-cli"] };
function onPath(name, env) {
  return (env.PATH || "").split(":").filter(Boolean).some((d) => { try { fs.accessSync(path.join(d, name), fs.constants.X_OK); return true; } catch { return false; } });
}
const tidy = (s) => String(s || "").split(HOME).join("~").replace(/\s+/g, " ").trim().slice(0, 300);

async function installTool(project, run, tool) {
  const key = typeof tool === "string" ? MANAGED[tool.toLowerCase()] : null;
  if (!/^[A-Za-z0-9._+-]{1,40}$/.test(String(tool || ""))) return fail("Say which tool to install.");
  if (!key) return fail("RasanAI cannot install that tool by itself. Install it yourself, then answer again.");
  const engine = engineOf(run);
  const script = runtimeFile(engine, "tool-setup.mjs", process.env.RASANAI_TOOL_SETUP);
  if (!script) return fail("RasanAI Studio's tool setup was not found. Open RasanAI Studio once, then try again.");
  if (/tool-setup\.mjs/.test(ps(["-axww", "-o", "command="]).split("\n").filter((l) => !l.includes(`director.mjs`)).join("\n"))) return fail("Another install is already running.");
  const dir = path.join(TOOLS_DIR, "logs", `setup-${crypto.randomUUID()}`);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const jobFile = path.join(dir, "job.json");
  fs.writeFileSync(jobFile, JSON.stringify({ tools: [key], engine }));
  const log = fs.openSync(path.join(dir, "setup.log"), "a", 0o600);
  const env = directorEnv();
  let child;
  try { child = spawn(process.execPath, [script, jobFile], { cwd: TOOLS_DIR, env, detached: true, stdio: ["ignore", log, log] }); } finally { fs.closeSync(log); }
  const code = await new Promise((resolve) => {
    const timer = setTimeout(() => { try { process.kill(-child.pid, "SIGTERM"); } catch {} resolve("timeout"); }, 600000);
    child.on("error", () => { clearTimeout(timer); resolve("error"); });
    child.on("exit", (c) => { clearTimeout(timer); resolve(c); });
  });
  const status = readJSON(path.join(dir, "status.json")) || {};
  if (code === "timeout") return fail("The install took too long. Try again from RasanAI Studio.");
  if (code !== 0 || status.error) return fail(status.error ? tidy(status.error) : "The install did not finish. Try again from RasanAI Studio.");
  const missing = (EXECUTABLES[key] || []).filter((n) => !onPath(n, env));
  if (missing.length) return fail(`${tool} was installed but the director cannot find ${missing.join(", ")}. Open RasanAI Studio to check.`);
  return { ok: true, tool: String(tool).toLowerCase() };
}

// ---- main

function emit(obj) { fs.writeSync(1, JSON.stringify(obj) + "\n"); }

export async function main(argv) {
  const [cmd, projectArg, ...rest] = argv;
  if (!["status", "resume", "stop", "install-tool"].includes(cmd)) return fail("Use status, resume, stop or install-tool.");
  const r = resolveRun(projectArg);
  if (r.error) return fail(r.error);
  if (cmd === "status") return directorStatus(r.project, r.run, r.name);
  if (cmd === "stop") return stop(r.project, r.run, r.name);
  if (cmd === "install-tool") return installTool(r.project, r.run, rest[0]);
  const i = rest.indexOf("--source");
  return resume(r.project, r.run, r.name, i >= 0 ? rest[i + 1] : undefined);
}

import { fileURLToPath } from "node:url";
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let result;
  try { result = await main(process.argv.slice(2)); } catch { result = fail("Something went wrong. Try again."); }
  emit(result);
  process.exit(0);
}
