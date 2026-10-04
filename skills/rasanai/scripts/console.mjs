#!/usr/bin/env node
// Director's Console: the local HTML page where the user sees and controls every
// RasanAI step (the full list is STEPS below: brief, brand, route, footage,
// direction, story, scenes, look, motion, style frames, cut, …, build, render). The agent pushes each step's options into session.json; the user's
// clicks land in actions.jsonl; the agent picks them up with `wait`.
// Zero dependencies; binds 127.0.0.1 only; POSTs need the per-session token.
//
//   node console.mjs serve --run <run dir> [--root <workspace>] [--port 0] [--open]   (detaches; prints the URL)
//   node console.mjs push  --run <dir> --step <id> (--data '<json>' | --file f.json) [--status awaiting|working|done|skipped] [--current]
//   node console.mjs activity --run <dir> --message "Reading your DESIGN.md" [--level info|ok|warn]   (what Claude is doing now)
//   node console.mjs ask   --run <dir> --question "..." [--context "..."] [--options '[{"id","label","detail"}]'] [--recommended <id>] [--placeholder "..."]
//        (any question outside the steps: missing material, a thin capture, an ambiguity; shown on the page, answered there)
//   node console.mjs resolve --run <dir> --ids a,b [--note "what changed"]   (notes left on the animatic/final are done)
//   node console.mjs reply --run <dir> --step <id> --message "..."   (Claude answers the user in that step's discussion)
//   node console.mjs log   --run <dir> --message "..." [--level info|ok|warn|error] [--stage <id>] [--stage-status working|done|failed]
//   node console.mjs wait  --run <dir> [--step <id>] [--timeout <sec, default 3000>]   -> prints the next action JSON (exit 2 on timeout)
//   node console.mjs record --run <dir> --step <id> --type <type> [--value '<json>'] [--note "..."]   (a choice made in chat)
//   node console.mjs state --run <dir> | url --run <dir> | stop --run <dir>
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
import os from "node:os";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs, die, SKILL_DIR, STATE_DIR, GSAP_PATH } from "./lib/common.mjs";

// this copy's version: a console started by an older copy is replaced, not reused
const VERSION = (() => {
  try {
    return fs.readFileSync(path.join(SKILL_DIR, "VERSION"), "utf8").trim();
  } catch {
    return "0";
  }
})();

const args = parseArgs();
const cmd = args._[0];
if (!args.run) die("--run <run dir> is required (the .rasanai/<run> scratch dir)");
const RUN = path.resolve(String(args.run));
fs.mkdirSync(RUN, { recursive: true });
const F = {
  session: path.join(RUN, "session.json"),
  actions: path.join(RUN, "actions.jsonl"),
  consumed: path.join(RUN, "consumed.json"),
  console: path.join(RUN, "console.json"),
  // the console's address (port + token), kept across restarts so an open tab reconnects by itself; removed only by `stop`
  address: path.join(RUN, "address.json"),
};
export const STEPS = ["brief", "research", "brand", "route", "footage", "story", "direction", "films", "concept", "scenes", "look", "motion", "styleframes", "animatic", "reel", "transitions", "voice", "music", "keyframes", "storyboard", "plan", "build", "render", "final"];

const readJSON = (p, d) => {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return d;
  }
};
// atomic write so the UI never reads half a file
const writeJSON = (p, v) => {
  const tmp = `${p}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(v, null, 2));
  fs.renameSync(tmp, p);
};
const now = () => new Date().toISOString();
function session() {
  return readJSON(F.session, { title: "RasanAI", current: "brief", steps: {}, updated: now() });
}
function saveSession(s) {
  s.updated = now();
  writeJSON(F.session, s);
}
// the live feed on the page: what Claude did, what it's doing, what the user answered
const LABELS = { story: "the story", films: "the film", animatic: "the animatic", final: "the final cut", brief: "the brief", brand: "your brand", route: "the workflow", footage: "your footage", direction: "the direction", concept: "the story", scenes: "the scenes", look: "the look", motion: "the motion", styleframes: "the style frames", reel: "the cut", transitions: "transitions", voice: "the voice", music: "the music", keyframes: "key poses", storyboard: "the storyboard", plan: "the plan", build: "the build", render: "the render" };
// an option's human name ("The shoebox wins") for an id the user picked ("shoebox")
function nameOf(s, step, value) {
  const d = s.steps[step] || {};
  for (const pool of [d.options, d.cells, d.looks, d.stories, d.films, d.styles]) {
    const hit = (pool || []).find((o) => o && (o.id === value || o.preset === value));
    if (hit) return hit.title || hit.label || hit.name || String(value);
  }
  return typeof value === "string" ? value : null;
}
function activity(s, msg, level = "info", working = null) {
  s.activity = (s.activity || []).concat({ t: now(), msg: String(msg).slice(0, 300), level }).slice(-200);
  // working: what the status line says Claude is doing (null = Claude is waiting on the user)
  s.working = working ? { msg: String(working).slice(0, 300), t: now() } : null;
}
function parseData() {
  if (args.file) return readJSON(path.resolve(String(args.file)), null) ?? die(`cannot read JSON from ${args.file}`);
  if (args.data) {
    try {
      return JSON.parse(String(args.data));
    } catch (e) {
      die(`--data is not valid JSON: ${e.message}`);
    }
  }
  return {};
}
function readActions() {
  if (!fs.existsSync(F.actions)) return [];
  return fs
    .readFileSync(F.actions, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}
function appendAction(a) {
  const action = { id: crypto.randomBytes(5).toString("hex"), ts: now(), ...a };
  fs.appendFileSync(F.actions, JSON.stringify(action) + "\n");
  return action;
}

// start the server in the background on a known address (same port and token as before when there was one)
function spawnServer(root, addr) {
  const a = [fileURLToPath(import.meta.url), "serve", "--foreground", "--run", RUN, "--root", root, "--port", String((addr && addr.port) || args.port || 0)];
  if (addr && addr.token) a.push("--token", addr.token);
  const child = spawn(process.execPath, a, { detached: true, stdio: "ignore" });
  child.unref();
  return child.pid;
}
function waitForServer(pid, ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const c = readJSON(F.console, null);
    if (c && c.pid === pid) return c;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 150);
  }
  return null;
}
// the console went away (sleep, a killed process, a crash): bring it back on the same address, so the tab the
// user has open reconnects on its own. Runs before every push, log, activity and during wait. `stop` means stop.
function ensureServer() {
  const addr = readJSON(F.address, null);
  if (!addr) return null;
  const c = readJSON(F.console, null);
  if (c && c.pid && alive(c.pid)) return c;
  fs.rmSync(F.console, { force: true });
  return waitForServer(spawnServer(addr.root || process.cwd(), addr));
}

// ---------------------------------------------------------------------------
if (["push", "log", "activity", "reply", "ask"].includes(cmd)) ensureServer();
if (cmd === "push") {
  if (!args.step || !STEPS.includes(args.step)) die(`--step must be one of ${STEPS.join(", ")}`);
  const s = session();
  const prev = s.steps[args.step] || {};
  const data = parseData();
  if (args.title) s.title = String(args.title);
  // a push REPLACES the step's payload (stale options, issues or a "you sent" banner must
  // not survive a re-push); --merge keeps the previous fields for small incremental updates
  // closing a step with only its decision keeps what it showed (the animatic's scenes stay viewable)
  const onlyDecision = (args.status === "done" || data.status === "done") && Object.keys(data).every((k) => ["decision", "status"].includes(k));
  const base = args.merge || onlyDecision ? prev : {};
  const next = { ...base, ...data, status: args.status || data.status || (args.step === "build" ? "working" : "awaiting"), updated: now() };
  delete next.sent;
  // closing a step the user answered keeps who made the call, so the Decisions drawer credits them, not Claude
  if (next.status === "done" && !data.by && prev.sent && !["decide", "decide-rest", "note"].includes(prev.sent.type)) next.by = "user";
  // the step's discussion survives a re-push (Claude revising the options is the answer to it)
  if (prev.thread && !data.thread) next.thread = prev.thread;
  if (args.step === "build" && !args.merge) {
    next.log = data.log || prev.log || [];
    next.stages = data.stages || prev.stages || {};
  }
  s.steps[args.step] = next;
  if (args.current || next.status === "awaiting" || (next.status === "working" && ["build", "render", "final"].includes(args.step))) s.current = args.step;
  const label = LABELS[args.step] || args.step;
  if (next.status === "awaiting") activity(s, `Ready for you: ${label}`, "ask");
  else if (next.status === "working") activity(s, data.question || `Working on ${label}`, "info", data.question || `Working on ${label}…`);
  else if (next.status === "done") activity(s, next.decision ? `Decided ${label}: ${next.decision}` : `Done: ${label}`, "ok", s.working && s.working.msg);
  saveSession(s);
  console.log(JSON.stringify({ ok: true, step: args.step, status: s.steps[args.step].status }));
} else if (cmd === "log") {
  const s = session();
  const b = (s.steps.build = s.steps.build || { status: "working", log: [], stages: {} });
  b.log = b.log || [];
  b.stages = b.stages || {};
  if (args.message) {
    b.log.push({ t: now(), level: args.level || "info", msg: String(args.message) });
    activity(s, args.message, args.level || "info", args["stage-status"] === "done" && args.stage === "render-gate" ? null : args.message);
  }
  if (args.stage) b.stages[args.stage] = args["stage-status"] || "working";
  if (args.stage === "render-gate" && args["stage-status"] === "done") b.status = "done";
  else if (b.status !== "done") b.status = "working";
  // only pull the page to Build while the build is the thing happening (never away from the render gate)
  if (!s.current || ["plan", "build"].includes(s.current)) s.current = "build";
  saveSession(s);
  console.log(JSON.stringify({ ok: true }));
} else if (cmd === "ask") {
  // a question that isn't one of the steps: it goes on the page as its own card, without moving the flow
  if (!args.question) die("--question is required");
  let options = [];
  if (args.options) {
    try { options = JSON.parse(String(args.options)); } catch (e) { die(`--options is not valid JSON: ${e.message}`); }
    if (!Array.isArray(options)) die("--options must be a JSON list of {id, label, detail}");
  }
  const s = session();
  const id = crypto.randomBytes(4).toString("hex");
  s.ask = { id, step: args.step && STEPS.includes(args.step) ? args.step : s.current || "brief", question: String(args.question), context: args.context ? String(args.context) : "", options: options.map((o, i) => ({ id: String(o.id || i + 1), label: String(o.label || o.id || ""), detail: o.detail ? String(o.detail) : "" })), recommended: args.recommended ? String(args.recommended) : null, placeholder: args.placeholder ? String(args.placeholder) : "Or type your answer, paste text, or a link", t: now() };
  activity(s, `Claude needs your call: ${s.ask.question}`, "ask", null);
  saveSession(s);
  console.log(JSON.stringify({ ok: true, ask: id, step: s.ask.step }));
} else if (cmd === "resolve") {
  // notes (comment actions) Claude has applied: they leave the page's open list
  const ids = String(args.ids || "").split(",").filter(Boolean);
  const s = session();
  let n = 0;
  for (const c of s.comments || []) if (ids.includes(c.id) || args.all) { if (c.state !== "resolved") n++; c.state = "resolved"; c.resolved = now(); if (args.note) c.resolution = String(args.note); }
  if (n) activity(s, `Applied ${n} note${n > 1 ? "s" : ""}${args.note ? ": " + args.note : ""}`, "ok", null);
  saveSession(s);
  console.log(JSON.stringify({ ok: true, resolved: n }));
} else if (cmd === "reply") {
  // Claude's answer in a step's discussion thread, shown on the page under that step
  if (!args.step || !STEPS.includes(args.step)) die(`--step must be one of ${STEPS.join(", ")}`);
  if (!args.message) die("--message is required");
  const s = session();
  const st = (s.steps[args.step] = s.steps[args.step] || { status: "awaiting" });
  st.thread = (st.thread || []).concat({ who: "claude", text: String(args.message).slice(0, 4000), t: now() }).slice(-50);
  // the note has been answered: the step is the user's again
  if (st.sent && st.sent.type === "note") delete st.sent;
  activity(s, `Claude answered about ${LABELS[args.step] || args.step}`, "ok", null);
  saveSession(s);
  console.log(JSON.stringify({ ok: true }));
} else if (cmd === "activity") {
  // what Claude is doing right now, between questions ("Capturing tally.app", "Drawing style frame 2 of 3")
  if (!args.message) die("--message is required");
  const s = session();
  activity(s, args.message, args.level || "info", args.done ? null : args.message);
  saveSession(s);
  console.log(JSON.stringify({ ok: true }));
} else if (cmd === "record") {
  if (!args.step || ![...STEPS, "*"].includes(args.step)) die(`--step must be one of ${STEPS.join(", ")} or *`);
  let value = null;
  if (args.value !== undefined) {
    try {
      value = JSON.parse(String(args.value));
    } catch {
      value = String(args.value);
    }
  }
  const a = appendAction({ step: args.step, type: args.type || "choose", value, note: args.note || "", source: "chat" });
  // chat answers count as consumed: the agent already has them
  const consumed = readJSON(F.consumed, []);
  consumed.push(a.id);
  writeJSON(F.consumed, consumed);
  console.log(JSON.stringify(a));
} else if (cmd === "wait") {
  const timeout = Number(args.timeout || 3000) * 1000;
  const start = Date.now();
  let checks = 0;
  const tick = () => {
    // every ~5s: if the console server died, say so instead of waiting forever
    if (++checks % 12 === 0) {
      const c = readJSON(F.console, null);
      if ((!c || (c.pid && !alive(c.pid))) && readJSON(F.address, null) && !ensureServer()) {
        console.log(JSON.stringify({ console_down: true, hint: "it could not be restarted; run `console.mjs serve --run <dir> --open`; answers can also come from chat" }));
        process.exit(3);
      }
    }
    const consumed = new Set(readJSON(F.consumed, []));
    const next = readActions().find((a) => !consumed.has(a.id) && (!args.step || a.step === args.step || a.step === "*"));
    if (next) {
      consumed.add(next.id);
      writeJSON(F.consumed, [...consumed]);
      console.log(JSON.stringify(next));
      process.exit(0);
    }
    if (Date.now() - start > timeout) {
      console.log(JSON.stringify({ timeout: true, step: args.step || null }));
      process.exit(2);
    }
    setTimeout(tick, 400);
  };
  tick();
} else if (cmd === "state") {
  console.log(JSON.stringify(session(), null, 2));
} else if (cmd === "url") {
  const c = readJSON(F.console, null);
  if (!c || !alive(c.pid)) die("console is not running for this run (start it with `serve`)");
  console.log(c.url);
} else if (cmd === "stop") {
  const c = readJSON(F.console, null);
  if (c && c.pid) {
    try {
      process.kill(c.pid);
    } catch {}
  }
  fs.rmSync(F.console, { force: true });
  fs.rmSync(F.address, { force: true });
  console.log(JSON.stringify({ stopped: true }));
} else if (cmd === "serve") {
  serve();
} else {
  die("usage: console.mjs serve|push|log|wait|record|state|url|stop --run <dir> ...");
}

// ---------------------------------------------------------------------------
function serve() {
  const root = path.resolve(String(args.root || process.cwd()));
  if (root === os.homedir() || root === "/") die(`refusing to serve ${root} (it would expose every file under it); run from the project folder or pass --root <project>`);
  // detach unless already the background child
  if (!args.foreground) {
    const existing = readJSON(F.console, null);
    if (existing && existing.pid && alive(existing.pid)) {
      // reuse only a console this same copy and version started; an older one would serve the old page
      if (existing.version === VERSION && existing.skill === SKILL_DIR) {
        console.log(JSON.stringify({ ok: true, url: existing.url, reused: true }));
        if (args.open) openUrl(existing.url);
        return;
      }
      try {
        process.kill(existing.pid);
      } catch {}
      fs.rmSync(F.console, { force: true });
    }
    // a restart keeps the address (unless --port asks for another), so the open tab picks it up again
    const addr = args.port ? null : readJSON(F.address, null);
    const c = waitForServer(spawnServer(root, addr));
    if (!c) die("console server did not start");
    console.log(JSON.stringify({ ok: true, url: c.url, pid: c.pid, ...(addr && c.url.includes(addr.token) ? { same_address: true } : {}) }));
    if (args.open) openUrl(c.url);
    return;
  }

  const token = /^[a-f0-9]{24}$/.test(String(args.token || "")) ? String(args.token) : crypto.randomBytes(12).toString("hex");
  // files the console may serve: the workspace, installed skills (frame-preset showcases), and this skill
  const allowed = [root, SKILL_DIR, path.join(os.homedir(), ".claude", "skills"), path.join(os.homedir(), ".agents", "skills")]
    .filter((p) => fs.existsSync(p))
    .map((p) => fs.realpathSync(p));
  const UI = path.join(SKILL_DIR, "console", "index.html");
  const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".webp": "image/webp", ".gif": "image/gif", ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4", ".ogg": "audio/ogg", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf" };
  const clients = new Set();
  let lastState = "";
  const broadcast = () => {
    let txt;
    try {
      txt = fs.readFileSync(F.session, "utf8");
    } catch {
      return;
    }
    if (txt === lastState) return;
    lastState = txt;
    for (const res of clients) res.write(`event: state\ndata: ${txt.replace(/\n/g, "")}\n\n`);
  };
  setInterval(broadcast, 500);
  // a heartbeat, so the page can tell a quiet console from a dead connection (after sleep, a proxy, a stall)
  setInterval(() => {
    for (const res of clients) res.write("event: ping\ndata: 1\n\n");
  }, 15000);

  // files of this session that must never be served (console.json holds the token URL)
  // compared by real path (e.g. macOS /var -> /private/var), resolved per request since the files come and go
  const realOr = (p) => {
    try {
      return fs.realpathSync(p);
    } catch {
      return path.resolve(p);
    }
  };
  const isPrivate = (real) => [F.console, F.address, F.actions, F.consumed, path.join(RUN, "director-job.json"), path.join(RUN, "director.log")].some((p) => realOr(p) === real || path.resolve(p) === real);
  const COOKIE = `rasa_${token.slice(0, 6)}`;
  const hasCookie = (req) => (req.headers.cookie || "").split(/;\s*/).includes(`${COOKIE}=${token}`);
  let port = 0;

  const handle = (req, res) => {
    const u = new URL(req.url, "http://127.0.0.1");
    const send = (code, body, type = "application/json", extra = {}) => {
      if (res.headersSent) return res.end();
      res.writeHead(code, { "content-type": type, "cache-control": "no-store", "x-content-type-options": "nosniff", ...extra });
      res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
    };
    // DNS-rebinding guard: only our own host names
    const host = String(req.headers.host || "");
    if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return send(421, "wrong host", "text/plain");

    if (u.pathname === "/" || u.pathname === "/index.html") {
      if (u.searchParams.get("t") !== token && !hasCookie(req)) return send(403, "Open the console with the URL printed by `console.mjs serve` (it carries the session token).", "text/plain");
      // the tokened visit sets an HttpOnly session cookie; every other route requires it
      return send(200, fs.readFileSync(UI, "utf8"), "text/html; charset=utf-8", { "set-cookie": `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/` });
    }
    if (!hasCookie(req)) return send(403, { error: "open the console URL first" });
    if (u.pathname === "/__rasanai/gsap.min.js") return send(200, fs.readFileSync(GSAP_PATH, "utf8"), "text/javascript");
    // the style-preset renderer (the gallery draws hundreds of styles in the page)
    if (u.pathname === "/presets.js") return send(200, fs.readFileSync(path.join(SKILL_DIR, "console", "presets.js"), "utf8"), "text/javascript");
    // the real-3D specimens (Rasan3D draws the 3D family live); three.js and its addons are served from the skill's stage3d folder only
    if (u.pathname === "/presets3d.js") {
      const f3 = path.join(SKILL_DIR, "console", "presets3d.js");
      return fs.existsSync(f3) ? send(200, fs.readFileSync(f3, "utf8"), "text/javascript") : send(404, "no presets3d.js", "text/plain");
    }
    if (u.pathname.startsWith("/three/")) {
      let rel;
      try { rel = decodeURIComponent(u.pathname.slice(7)); } catch { return send(400, "bad path", "text/plain"); }
      const root3 = path.join(SKILL_DIR, "stage3d"), f3 = path.resolve(root3, rel);
      if (!rel || rel.includes("\0") || !f3.startsWith(root3 + path.sep) || f3.startsWith(path.join(root3, "templates") + path.sep)) return send(404, "not found", "text/plain");
      let real3;
      try { real3 = fs.realpathSync(f3); if (!real3.startsWith(fs.realpathSync(root3) + path.sep) || !fs.statSync(real3).isFile()) return send(404, "not found", "text/plain"); } catch { return send(404, "not found", "text/plain"); }
      const type3 = /\.m?js$/i.test(real3) ? "text/javascript" : /\.json$/i.test(real3) ? "application/json" : "text/plain; charset=utf-8";
      return send(200, fs.readFileSync(real3), type3);
    }

    if (u.pathname === "/api/state") return send(200, session());
    if (u.pathname === "/api/events") {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
      res.write(`event: state\ndata: ${JSON.stringify(session())}\n\n`);
      clients.add(res);
      req.on("close", () => clients.delete(res));
      return;
    }
    if (u.pathname === "/api/action" && req.method === "POST") {
      if (req.headers["x-rasa-token"] !== token) return send(403, { error: "bad token" });
      let body = "";
      let tooBig = false;
      req.on("data", (c) => {
        body += c;
        if (body.length > 1e6) {
          tooBig = true;
          req.destroy();
        }
      });
      req.on("end", () => {
        if (tooBig) return;
        let a;
        try {
          a = JSON.parse(body);
        } catch {
          return send(400, { error: "bad json" });
        }
        if (!a || typeof a !== "object" || Array.isArray(a)) return send(400, { error: "expected an object" });
        const step = String(a.step || "");
        if (![...STEPS, "*"].includes(step) || !/^[a-z-]{2,20}$/.test(String(a.type || ""))) return send(400, { error: "unknown step or type" });
        const action = appendAction({ step, type: String(a.type), value: a.value ?? null, note: String(a.note || "").slice(0, 4000), source: "console" });
        const s = session();
        if (step === "*") s.decide_rest = { ts: action.ts };
        else if (Object.prototype.hasOwnProperty.call(s.steps, step) && !["comment", "knob"].includes(action.type)) s.steps[step].sent = { type: action.type, value: action.value, note: action.note, ts: action.ts };
        // an answer to an `ask` card: record it on the question and clear it from the page
        if (action.type === "answer" && s.ask && !s.ask.answered) {
          const v = action.value || {};
          const opt = (s.ask.options || []).find((o) => o.id === v.choice);
          s.ask.answered = { choice: v.choice || null, label: opt ? opt.label : null, text: v.text || "", t: action.ts };
          activity(s, `You answered: ${opt ? opt.label : ""}${opt && v.text ? " · " : ""}${v.text ? "“" + String(v.text).slice(0, 120) + "”" : ""}`, "you", "Claude is reading your answer…");
          saveSession(s);
          return send(200, { ok: true, action });
        }
        // a note pinned to a moment of the animatic or the final: kept on the page until Claude resolves it
        if (action.type === "comment") {
          const v = action.value || {};
          s.comments = (s.comments || []).concat({ id: action.id, step, scene: v.scene ?? null, t: typeof v.t === "number" ? v.t : null, x: typeof v.x === "number" ? v.x : null, y: typeof v.y === "number" ? v.y : null, scope: v.scope || "scene", quick: v.quick || null, text: action.note || v.quick || "", state: "open", ts: action.ts }).slice(-200);
          activity(s, `You left a note${v.t != null ? " at " + Math.floor(v.t / 60) + ":" + String(Math.floor(v.t % 60)).padStart(2, "0") : ""}: ${action.note || v.quick}`, "you", null);
          saveSession(s);
          return send(200, { ok: true, action });
        }
        const nm = nameOf(s, step, action.value);
        const verb = { choose: "picked", submit: "sent", approve: "approved", adjust: "adjusted", more: "asked for more of" }[action.type] || action.type;
        const said = action.type === "decide-rest" ? "Claude decides the rest" : action.type === "decide" ? `Claude decides ${LABELS[step] || step}` : action.type === "note" ? `Note: "${action.note}"` : `${verb} ${LABELS[step] || step}${nm ? ": " + nm : ""}`;
        if (s.steps[step] && s.steps[step].sent && nm) s.steps[step].sent.name = nm;
        // anything the user writes becomes part of that step's discussion
        if (action.note && s.steps[step]) s.steps[step].thread = (s.steps[step].thread || []).concat({ who: "you", text: action.note, t: action.ts }).slice(-50);
        activity(s, `You: ${said}`, "you", "Claude is reading your answer…");
        saveSession(s);
        send(200, { ok: true, action });
      });
      return;
    }
    // /fs/rel/<workspace-relative path> and /fs/abs/<absolute path>: path-style so a
    // served page's own relative links (fonts, images) keep resolving
    if (u.pathname.startsWith("/fs/rel/") || u.pathname.startsWith("/fs/abs/")) {
      let rest;
      try {
        rest = decodeURIComponent(u.pathname.slice(8));
      } catch {
        return send(400, "bad path", "text/plain");
      }
      const p = u.pathname.startsWith("/fs/abs/") ? path.join("/", rest) : path.join(root, rest);
      let real;
      try {
        real = fs.realpathSync(p);
      } catch {
        return send(404, "not found", "text/plain");
      }
      if (!allowed.some((a) => real === a || real.startsWith(a + path.sep))) return send(403, "outside the allowed roots", "text/plain");
      if (isPrivate(real)) return send(403, "private", "text/plain");
      const st = fs.statSync(real);
      if (!st.isFile()) return send(403, "not a file", "text/plain");
      const type = MIME[path.extname(real).toLowerCase()] || "application/octet-stream";
      // a design system's specimen page: it loads the vendored GSAP instead of a CDN copy, and only this console may frame it
      if (path.basename(real) === "specimen.html") {
        const page = fs.readFileSync(real, "utf8").replace(/<script[^>]+src=["'][^"']*gsap(?:\.min)?\.js["'][^>]*><\/script>/gi, '<script src="/__rasanai/gsap.min.js"></script>');
        return send(200, page, type, { "content-security-policy": "frame-ancestors 'self'" });
      }
      const r = req.headers.range && /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range).trim());
      if (r && st.size > 0) {
        let startB, endB;
        if (r[1] === "" && r[2] !== "") {
          // suffix range: the last N bytes
          startB = Math.max(0, st.size - Number(r[2]));
          endB = st.size - 1;
        } else {
          startB = r[1] ? Number(r[1]) : 0;
          endB = r[2] ? Math.min(Number(r[2]), st.size - 1) : st.size - 1;
        }
        if (startB >= st.size || startB > endB) return send(416, "", "text/plain", { "content-range": `bytes */${st.size}` });
        res.writeHead(206, { "content-type": type, "content-range": `bytes ${startB}-${endB}/${st.size}`, "accept-ranges": "bytes", "content-length": endB - startB + 1, "cache-control": "no-store" });
        return fs.createReadStream(real, { start: startB, end: endB }).on("error", () => res.destroy()).pipe(res);
      }
      if (r && st.size === 0) return send(416, "", "text/plain", { "content-range": "bytes */0" });
      res.writeHead(200, { "content-type": type, "content-length": st.size, "accept-ranges": "bytes", "cache-control": "no-store" });
      return fs.createReadStream(real).on("error", () => res.destroy()).pipe(res);
    }
    send(404, { error: "not found" });
  };
  const server = http.createServer((req, res) => {
    try {
      handle(req, res);
    } catch (e) {
      try {
        if (!res.headersSent) res.writeHead(500, { "content-type": "text/plain" });
        res.end("server error");
      } catch {}
    }
  });
  // a single bad request must never take the console down
  process.on("uncaughtException", () => {});
  let tries = 0;
  server.on("error", (e) => {
    // the old port is still closing (a restart) or someone else took it: retry a moment, then take any port
    if (e && e.code === "EADDRINUSE" && tries++ < 15) return setTimeout(() => server.listen(tries < 15 ? Number(args.port || 0) : 0, "127.0.0.1"), 200);
    if (e && e.code === "EADDRINUSE") return server.listen(0, "127.0.0.1");
  });
  server.listen(Number(args.port || 0), "127.0.0.1");
  server.on("listening", () => {
    port = server.address().port;
    writeJSON(F.address, { port, token, root });
    const url = `http://127.0.0.1:${port}/?t=${token}`;
    writeJSON(F.console, { url, port, pid: process.pid, root, started: now(), version: VERSION, skill: SKILL_DIR });
    // the page shows this copy's version and, from the last update check (no network here), a newer one
    const s = session();
    const upd = readJSON(path.join(STATE_DIR, "update-check.json"), null);
    s.app = { version: VERSION, latest: upd && upd.latest ? upd.latest : VERSION };
    if (!s.activity) activity(s, "Console open", "sys", "Getting started…");
    saveSession(s);
  });
  const bye = () => {
    const c = readJSON(F.console, null);
    if (c && c.pid === process.pid) fs.rmSync(F.console, { force: true });
    process.exit(0);
  };
  process.on("SIGTERM", bye);
  process.on("SIGINT", bye);
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function openUrl(url) {
  try {
    const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
    execFileSync(opener, [url], { stdio: "ignore" });
  } catch {}
}
