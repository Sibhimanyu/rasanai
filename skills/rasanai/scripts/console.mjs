#!/usr/bin/env node
// Director's Console: the local HTML page where the user sees and controls every
// RasanAI step (the full list is STEPS below: brief, brand, route, footage,
// direction, story, scenes, look, motion, style frames, cut, …, build, render). The agent pushes each step's options into session.json; the user's
// clicks land in actions.jsonl; the agent picks them up with `wait`.
// Zero dependencies; binds 127.0.0.1 only; POSTs need the per-session token.
//
//   node console.mjs serve --run <run dir> [--root <workspace>] [--port 0] [--open]   (detaches; prints the URL)
//   node console.mjs push  --run <dir> --step <id> (--data '<json>' | --file f.json) [--status awaiting|working|done|skipped] [--current]
//        a decision that replaces a different earlier one on a done step needs --because "<why the old call lost>" (else exit 2); the old call is kept in decisions_history
//   node console.mjs downgrade --run <dir> --what "<what the plan asked>" --instead "<what is used>" --why "<reason>" [--impact "<what the film loses>"]   (a fallback, told to the user in the drawer)
//        (the brief push carries `budget`: the token budget crew.mjs plan wrote to <run>/crew/budget.json, added automatically when the push has none; see cleanBudget)
//   node console.mjs activity --run <dir> --message "Reading your DESIGN.md" [--level info|ok|warn]   (what Claude is doing now)
//   node console.mjs ask   --run <dir> --question "..." [--context "..."] [--options '[{"id","label","detail"}]'] [--recommended <id>] [--placeholder "..."]
//        (any question outside the steps: missing material, a thin capture, an ambiguity; shown on the page, answered there)
//   node console.mjs resolve --run <dir> --ids a,b [--note "what changed"]   (notes left on the animatic/final are done)
//        a push of animatic/render with a higher version is refused (exit 2) while an applied note has no --note; --force "<reason>" overrides
//        --layers <story,look,timing,motion,sound,production> (default motion,timing): the layers the notes were about; a locked file outside them that changed is a warning (lock_breaks)
//   node console.mjs locks  --run <dir>   (what Story, Look and the Animatic locked, what drifted since, lock_breaks, relocks; JSON)
//   node console.mjs relock --run <dir> --layer <story|look|timing|motion> --because "<why, 8+ characters>"   (a meant change to a locked layer)
//   node console.mjs reply --run <dir> --step <id> --message "..."   (Claude answers the user in that step's discussion)
//   node console.mjs log   --run <dir> --message "..." [--level info|ok|warn|error] [--stage <id>] [--stage-status working|done|failed]
//   node console.mjs wait  --run <dir> [--step <id>] [--timeout <sec, default 3000>]   -> prints the next action JSON (exit 2 on timeout)
//   node console.mjs record --run <dir> --step <id> --type <type> [--value '<json>'] [--note "..."]   (a choice made in chat)
//        --type comment (a note given in chat: --note "<text>", --value '{"t":12.4,"scope":"scene"}') and --type apply (--value '{"ids":[...]}',
//        or all the step's open notes) also enter session.comments / session.applied, so the revision refusal covers notes given in chat
//   node console.mjs state --run <dir> | url --run <dir> | stop --run <dir>
//   (internal) node console.mjs proxy --run <dir> --step animatic|render|final --video <path>: a push of one of those steps with a
//        `video` (or `videos`, the newest last) starts this in the background; it writes a phone-sized copy in <run>/phone/
//        (H.264 540p ~1.2 Mbit/s, AAC) with ffmpeg and adds `proxy` to the step. No ffmpeg, no proxy, no error.
//        RASANAI_PHONE_PROXY=off turns it off.
//
// HEADLESS mode (env RASANAI_CONSOLE_HEADLESS=1, remembered in <run>/console.json): no server at all. RasanAI Studio
// (the native Mac app) reads session.json itself and appends the user's actions to actions.jsonl; every command above
// except serve/url works the same, and `wait` applies each action's effects to session.json as it consumes it.
//
// OTHER APPS (references/remote.md, the published contract): session.json carries `schema` (SESSION_SCHEMA) and console.json
// `external_actions` (EXTERNAL_ACTIONS), in both modes. An app may append an action to actions.jsonl under actions.lock with
// its `source` (SOURCES); `wait` validates and applies it in both modes, the way a POST is applied. The server marks the
// lines it already applied (`applied: true`), so `wait` never applies one twice.
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
import os from "node:os";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs, die, SKILL_DIR, STATE_DIR, GSAP_PATH } from "./lib/common.mjs";
import { recordTaste } from "./memory.mjs";
import { addLesson } from "./lessons.mjs"; // Plan 10: a "don't use this font" note is kept as a scoped user preference (never a universal rule)
import { acquire, release, withLock } from "./lib/runlock.mjs";
import { briefFormat, loadFormats, SCOPES as FORMAT_SCOPES } from "./lib/formats.mjs";
import { noteDowngrade, readDowngrades } from "./lib/downgrade.mjs";
import { LAYERS, NOTE_LAYERS, snapshot, drift, relock } from "./lib/locks.mjs";
import { noteToRevision } from "./lib/editorial.mjs"; // Plan 05 E6: a viewer note on the animatic is anchored and read as an editorial request
import { soundNoteRevision, setMuteSolo } from "./lib/sound-controls.mjs"; // Plan 07 A6: a Studio sound note becomes a versioned targeted revision (no per-cue approval)
import { handleMotionEditAction, restoreAsNewVersion } from "./lib/editor-patch/index.mjs"; // Plan 06 V8: Studio element edits go through the one edit authority (motion/edits.jsonl)
import { atomicWrite, appendJsonl } from "./lib/recovery.mjs"; // Plan 11 R1: durable replace and torn-tail-safe appends for the console files
import { handleJobControl, runStatus, redact } from "./lib/job-control.mjs"; // Plan 10 U6: Pause/Resume, cancel an owned job, logs, retry; never a global provider interrupt
import { handleRevisionAction, classifyFeedback, latestRequests } from "./lib/revision-intent.mjs"; // Plan 10 U3: feedback becomes ONE scoped revision request, the same payload for Studio and this console
import { snapshotRun, autoDecision, recordAutoDecision, boundary as storyboardBoundary, legacyAction } from "./lib/storyboard.mjs"; // Plan 05 E1/E7: one Storyboard stage; its approval snapshot and "Just make it" decision

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
  // headless runs: locks shared with RasanAI Studio, and the actions `wait` refused (with why)
  sessionLock: path.join(RUN, "session.lock"),
  actionsLock: path.join(RUN, "actions.lock"),
  rejected: path.join(RUN, "rejected.json"),
};
// the published contract (references/remote.md): bump only for a change an outside reader would misread
export const SESSION_SCHEMA = 1;
// console.json: `wait` validates and applies actions another process appended to actions.jsonl, in both modes
// 1: answer a call (choose, more, approve, comment, apply, note, answer, decide-rest). 2: a strict superset of 1, adds what a phone needs to run a film
// (brief submit, decide, styleframes approve/comment/redo, a chat note in Studio's shape, tool-ready answers) and checks them on `wait` (checkExternal)
export const EXTERNAL_ACTIONS = 2;
// who answered: the console page, chat `record`, RasanAI Studio, or an app that speaks remote.md. The label is what the feed
// and the decisions drawer say after "You" ("You (iPhone): picked the story: …"); a source not listed here is "console".
export const SOURCES = { console: "", chat: "", studio: "", squeak: "Squeak", "squeak-phone": "iPhone" };
export const cleanSource = (v) => (typeof v === "string" && /^[a-z-]{2,20}$/.test(v) && Object.hasOwn(SOURCES, v) ? v : "console");
const youOf = (action) => (SOURCES[action.source] ? `You (${SOURCES[action.source]})` : "You");
export const STEPS = ["brief", "research", "brand", "route", "footage", "story", "direction", "films", "concept", "scenes", "look", "motion", "styleframes", "animatic", "reel", "transitions", "voice", "music", "keyframes", "storyboard", "plan", "build", "render", "final"];

// the Brief call's token budget, kept to the fields the page reads: {level: lean|standard|full, label, summary, fix_rounds, total, total_label, phases: [{phase, tokens, label}], levels: [{level, label, summary, fix_rounds, total, total_label}]}
const BUDGET_LEVELS = ["lean", "standard", "full"];
function cleanBudget(b) {
  const n = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.round(Number(v)) : 0);
  const lab = (t) => (t >= 1e6 ? "~" + (t / 1e6).toFixed(1) + "M" : "~" + Math.round(t / 1000) + "k");
  const lv = (x) => ({ level: BUDGET_LEVELS.includes(x.level) ? x.level : "standard", label: String(x.label || ""), summary: String(x.summary || "").slice(0, 300), fix_rounds: n(x.fix_rounds), total: n(x.total), total_label: String(x.total_label || lab(n(x.total))) });
  return { ...lv(b), phases: (Array.isArray(b.phases) ? b.phases : []).slice(0, 40).map((p) => ({ phase: String(p.phase || ""), tokens: n(p.tokens), label: String(p.label || lab(n(p.tokens))) })), levels: (Array.isArray(b.levels) ? b.levels : []).slice(0, 3).map(lv), note: "an estimate from measured runs; the level can be changed before the film starts" };
}
const readJSON = (p, d) => {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return d;
  }
};
// atomic write so the UI never reads half a file
const writeJSON = (p, v) => {
  atomicWrite(p, JSON.stringify(v, null, 2)); // Plan 11 R1: fsync of file and folder, the temp file is removed on failure
};
// headless: no console server in this run (RasanAI Studio reads the files). Set by env, then remembered in console.json.
const HEADLESS = (() => {
  const c = readJSON(F.console, null);
  if (c && c.headless === true) {
    // a run started before the flag existed: advertise that this copy's `wait` applies other apps' actions
    if (c.external_actions !== EXTERNAL_ACTIONS) { try { writeJSON(F.console, { ...c, external_actions: EXTERNAL_ACTIONS }); } catch {} }
    return true;
  }
  if (process.env.RASANAI_CONSOLE_HEADLESS !== "1") return false;
  // a run an older Studio started has a console server: stop it and forget its address, then mark the run
  if (c && c.pid) {
    try { process.kill(c.pid); } catch {}
  }
  fs.rmSync(F.address, { force: true });
  writeJSON(F.console, { headless: true, since: new Date().toISOString(), version: VERSION, skill: SKILL_DIR, external_actions: EXTERNAL_ACTIONS });
  return true;
})();
const now = () => new Date().toISOString();
function session() {
  return readJSON(F.session, { title: "RasanAI", current: "brief", steps: {}, updated: now() });
}
function saveSession(s) {
  s.schema = SESSION_SCHEMA;
  s.updated = now();
  writeJSON(F.session, s);
}
// the live feed on the page: what Claude did, what it's doing, what the user answered
const LABELS = { story: "the story", films: "the film", animatic: "the animatic", final: "the final cut", brief: "the brief", brand: "your brand", route: "the workflow", footage: "your footage", direction: "the direction", concept: "the story", scenes: "the scenes", look: "the look", motion: "the motion", styleframes: "the style frames", reel: "the cut", transitions: "transitions", voice: "the voice", music: "the music", keyframes: "key poses", storyboard: "the storyboard", plan: "the plan", build: "the build", render: "the render" };
// an option's human name ("The shoebox wins") for an id the user picked ("shoebox")
function nameOf(s, step, value) {
  const d = s.steps[step] || {};
  for (const pool of [d.options, d.cells, d.looks, d.stories, d.films, d.styles, d.frames]) {
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
// fallbacks the scripts noted (lib/downgrade.mjs -> <run>/downgrades.jsonl): each is merged once into session.downgrades and told in the feed
function mergeDowngrades(s) {
  const have = new Set((s.downgrades || []).map((d) => `${d.t}|${d.what}|${d.instead}`));
  for (const d of readDowngrades(RUN)) {
    if (have.has(`${d.t}|${d.what}|${d.instead}`)) continue;
    s.downgrades = (s.downgrades || []).concat(d).slice(-100);
    activity(s, `Working without ${d.what}: using ${d.instead}${d.why ? " because " + d.why : ""}`, "warn", s.working && s.working.msg);
  }
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
// always under actions.lock: another app may be appending to the same file (references/remote.md)
function appendAction(a) {
  const action = { id: crypto.randomBytes(5).toString("hex"), ts: now(), ...a };
  withLock(F.actionsLock, () => appendJsonl(F.actions, action)); // Plan 11 R1: an append after a torn final line starts a new line
  return action;
}

// What an action is allowed to be (the server's check on POST, and headless `wait`'s on every line it reads).
// Returns the normalized action fields, or { error }. `getSession` (lazy) lets a line from another app (squeak, squeak-phone) be checked
// against session.json as it is NOW (checkExternal); RasanAI Studio's own lines and the page's keep today's looser check.
function validateAction(a, getSession = null) {
  if (!a || typeof a !== "object" || Array.isArray(a)) return { error: "expected an object" };
  const step = String(a.step || "");
  if (![...STEPS, "*"].includes(step) || !/^[a-z-]{2,20}$/.test(String(a.type || ""))) return { error: "unknown step or type" };
  const v = { step, type: String(a.type), value: a.value ?? null, note: String(a.note || "").slice(0, 4000) };
  if (getSession && EXTERNAL_SOURCES.has(cleanSource(a.source))) {
    const e = checkExternal(v, getSession());
    if (e) return { error: e };
  }
  return v;
}

// references/remote.md, "Contract v2": what another app may send, checked against the session as it is now. Mutates `v` only to normalize
// the shapes an app may use for the same thing (a nested brief {fields, format}, a frame comment's {frame, text}) into Studio's.
const EXTERNAL_SOURCES = new Set(["squeak", "squeak-phone"]);
const BRIEF_FIELD_TYPES = { length_s: "number", kind: "string", subject: "string", aspect: "string", destination: "string", narration: "text", brand_name: "string", use_brand: "boolean" };
const ASPECTS = ["16:9", "9:16", "1:1"];
const isObj = (x) => x && typeof x === "object" && !Array.isArray(x);
const isText = (x, max = 4000) => typeof x === "string" && x.length <= max;
const safeKey = (k) => (/^[A-Za-z0-9_-]{1,30}$/.test(k) ? `: ${k}` : "");
function checkExternal(v, s) {
  const steps = isObj(s && s.steps) ? s.steps : {};
  const step = isObj(steps[v.step]) ? steps[v.step] : null;
  const waiting = !!step && step.status === "awaiting";
  const val = v.value;
  if (v.type === "decide-rest") return v.step === "*" && val === null ? null : "decide-rest is for step * with no value";
  if (v.step === "*") return "step * is only for decide-rest";
  if (v.type === "decide") return !waiting ? "that step is not waiting" : val !== null ? "decide takes no value" : null;
  if (v.type === "submit" && v.step === "brief") {
    if (!waiting) return "the brief is not waiting";
    if (!isObj(val)) return "the brief answer must be an object";
    // {fields, format} is accepted and flattened into the shape Studio sends (the fields at the top, `format` beside them)
    let flat = val;
    if (isObj(val.fields)) {
      const extra = Object.keys(val).filter((k) => !["fields", "format"].includes(k));
      if (extra.length) return `unknown brief field${safeKey(extra[0])}`;
      flat = { ...val.fields, ...(val.format !== undefined ? { format: val.format } : {}) };
    }
    const own = isObj(step.fields) ? step.fields : {};
    for (const [k, x] of Object.entries(flat)) {
      if (k === "format" || k === "source") continue;
      if (!Object.hasOwn(BRIEF_FIELD_TYPES, k) && !Object.hasOwn(own, k)) return `unknown brief field${safeKey(k)}`;
      if (x === null) continue;
      const have = own[k];
      const want = have !== null && have !== undefined && ["string", "number", "boolean"].includes(typeof have) ? typeof have : BRIEF_FIELD_TYPES[k] === "text" ? null : BRIEF_FIELD_TYPES[k] || "string";
      if (want ? typeof x !== want : !["string", "boolean"].includes(typeof x)) return `brief field has the wrong type${safeKey(k)}`;
      if (typeof x === "string" && x.length > 4000) return `brief field is too long${safeKey(k)}`;
      if (k === "length_s" && !(Number.isFinite(x) && x >= 5 && x <= 600)) return "length_s must be 5 to 600";
      if (k === "aspect" && !ASPECTS.includes(x)) return "aspect must be 16:9, 9:16 or 1:1";
    }
    if (flat.source !== undefined && !isText(flat.source)) return "source must be text";
    if (flat.format !== undefined && flat.format !== null) {
      const f = flat.format;
      if (!isObj(f) || typeof f.tile !== "string" || typeof f.option !== "string") return "format must be {tile, option}";
      if (f.scope !== undefined && f.scope !== null && !FORMAT_SCOPES.includes(f.scope)) return "format scope is not one of universal, category, single-task";
      let opt = null;
      try { opt = loadFormats().options.find((o) => o.id === f.option && o.tile === f.tile); } catch { return "the format catalog could not be read"; }
      if (!opt) return "that format is not in the catalog";
      if (opt.status === "soon") return "that format is not available yet";
      v.value = { ...flat, format: { tile: opt.tile, option: opt.id, ...(f.scope ? { scope: f.scope } : {}) }, kind: typeof flat.kind === "string" && flat.kind ? flat.kind : opt.kind };
    } else v.value = { ...flat };
    return null;
  }
  if (v.step === "styleframes" && ["approve", "comment", "redo"].includes(v.type)) {
    if (!waiting) return "the style frames are not waiting";
    const ids = new Set((Array.isArray(step.frames) ? step.frames : []).filter(isObj).map((f) => f.id));
    if (v.type === "approve") return val === null ? null : "approve takes no value";
    if (v.type === "comment") {
      if (!isObj(val)) return "a frame comment must be {frame, text}";
      const frame = val.frame ?? val.scene, text = v.note || val.text || "";
      if (typeof frame !== "string" || !ids.has(frame)) return "that frame is not on this step";
      if (!isText(text) || !text.trim()) return "a frame comment needs text";
      v.value = { scene: frame, t: null, x: null, y: null, scope: "scene" };
      v.note = String(text).slice(0, 4000);
      return null;
    }
    if (!isObj(val) || !Array.isArray(val.ids) || !val.ids.length || val.ids.length > 50 || !val.ids.every((i) => typeof i === "string" && ids.has(i))) return "redo needs the ids of frames on this step";
    const note = v.note || val.note || "";
    if (!isText(note)) return "the redo note is not text";
    v.value = { ids: [...new Set(val.ids)], note: String(note).slice(0, 4000) };
    v.note = String(note).slice(0, 4000);
    return null;
  }
  if (v.type === "answer") {
    const ask = s && s.ask;
    if (!isObj(ask) || ask.answered) return "there is no open question";
    if (v.step !== ask.step) return "that question belongs to another step";
    if (!isObj(val) || val.ask !== ask.id) return "that is not the open question";
    const options = (Array.isArray(ask.options) ? ask.options : []).filter(isObj).map((o) => o.id);
    const choice = val.choice ?? null;
    // Studio's "Install for me" answers `tool-ready:<tool>` for an ask that offered `install-tool:<tool>`
    const ready = typeof choice === "string" && /^tool-ready:([A-Za-z0-9._+-]{1,40})$/.exec(choice);
    if (choice !== null && !(typeof choice === "string" && (options.includes(choice) || (ready && options.includes(`install-tool:${ready[1]}`))))) return "that is not one of the question's options";
    if (val.text !== undefined && !isText(val.text)) return "the answer text is not text";
    if (choice === null && !String(val.text || "").trim()) return "an answer needs a choice or text";
    return null;
  }
  if (v.type === "note") {
    if (val === null) return null;
    // Studio's chat: {chat: {rules, max_sentences, max_tool_calls, context: {step, looking_at?, blocked?, last_error?, recent_events?}}}
    if (!isObj(val) || Object.keys(val).length !== 1 || !isObj(val.chat)) return "a note carries no value, or {chat}";
    const c = val.chat;
    if (Object.keys(c).some((k) => !["rules", "max_sentences", "max_tool_calls", "context"].includes(k))) return "unknown chat field";
    if (!isText(c.rules, 2000) || !c.rules.trim()) return "chat rules must be text";
    for (const k of ["max_sentences", "max_tool_calls"]) if (!Number.isInteger(c[k]) || c[k] < 0 || c[k] > 10) return `chat ${k} must be 0 to 10`;
    const x = c.context;
    if (!isObj(x) || Object.keys(x).some((k) => !["step", "looking_at", "blocked", "last_error", "recent_events"].includes(k))) return "unknown chat context field";
    if (typeof x.step !== "string" || !STEPS.includes(x.step)) return "chat context step is not a step";
    for (const k of ["looking_at", "blocked", "last_error"]) if (x[k] !== undefined && !isText(x[k], 600)) return `chat context ${k} must be short text`;
    if (x.recent_events !== undefined && !(Array.isArray(x.recent_events) && x.recent_events.length <= 5 && x.recent_events.every((e) => isText(e, 400)))) return "chat context recent_events must be up to 5 short lines";
    if (!v.note.trim()) return "a chat message needs text";
    if (!s || v.step !== s.current) return "a chat message goes on the current step";
    return null;
  }
  return null;
}

// The user's notes on the animatic and the final also go to their local evidence ledger (taste.jsonl; the crew reads the one digest,
// lessons.mjs digest, which carries its last verdicts): a note pinned
// to a moment or typed in the step's box is an edit; words sent with an approval of the final are a verdict. The
// server, headless `wait` and chat `record` all end here, so RasanAI Studio's notes land in the same ledger. One action is one row
// (recordTaste skips an action id it has already stored), so a chat `record --type comment|apply` that also runs applyAction counts once.
function tasteFrom(action) {
  const stage = action.step === "animatic" ? "animatic" : ["render", "final"].includes(action.step) ? "final" : null;
  if (!stage) return;
  const v = action.value && typeof action.value === "object" ? action.value : {};
  const text = action.note || v.quick || "";
  const kind = action.type === "comment" || action.type === "note" ? "edit" : action.type === "approve" && stage === "final" ? "verdict" : null;
  if (!kind || !text) return;
  recordTaste({ kind, film: path.basename(RUN), stage, note: text, scene: v.scene, t: typeof v.t === "number" ? v.t : undefined, ts: action.ts, action: action.id });
}

// Plan 05 E7 / E1: the legacy `animatic` step IS the Storyboard stage (one review, no sixth approval). Approving it pins a snapshot (panels, copy, look
// revision, audio or declared scratch, timing revision) when the run has storyboard records; "Just make it" (decide on this step, or decide-rest) records
// the auto-decision with the Final retained. Best effort: a run without storyboard/ records behaves exactly as before.
function storyboardHooks(s, action) {
  try {
    if (legacyAction(action).stage !== "storyboard" && action.step !== "*") return;
    if (action.type === "approve" && action.step === "animatic" && fs.existsSync(path.join(RUN, "storyboard", "storyboard.json"))) {
      const r = snapshotRun(RUN, { approved_by: "user", source_action_id: action.id });
      if (r.ok && r.record) { if (s.steps.animatic) s.steps.animatic.snapshot = { revision: r.record.revision, artifact_digest: r.record.artifact_digest, scratch_audio: !!r.record.scratch_audio, final_voice_approved: r.record.final_voice_approved }; }
      else if (!r.ok) activity(s, `Storyboard snapshot not pinned: ${r.error}`, "warn", null);
    } else if ((action.type === "decide" && action.step === "animatic") || (action.type === "decide-rest" && fs.existsSync(path.join(RUN, "storyboard")))) {
      recordAutoDecision(RUN, autoDecision({ boundary: storyboardBoundary(RUN, { mode: "full" }), approval_mode: action.type === "decide-rest" ? "autonomous" : "key_stages" }));
    }
  } catch {}
}

// Plan 06 V8: a Studio element edit (an actions.jsonl line with kind "motion-edit" and the contract-D object under `edit`) is recorded by lib/editor-patch in
// motion/edits.jsonl, keyed to a stable element id. It never rewrites a scene here; a regeneration must carry or reconcile it (production.mjs overrides). Best effort:
// an edit that cannot be recorded is shown in the feed, not thrown.
function motionEditHook(s, action) {
  // Plan 10 U4: Studio's queue lines carry {step,type,value,note}, so the contract-D object may also arrive as value.edit (the same shape, one commit per drag)
  const edit = action && (action.edit || (action.value && typeof action.value === "object" && action.value.edit));
  // Plan 10 U7: "restore as a new version" after an undo conflict (value: { restore_of: <edit id> }): the current state is checkpointed first, then the earlier state is written as a new edit
  if (action && (action.kind === "motion-edit" || action.type === "motion-edit") && action.value && typeof action.value === "object" && action.value.restore_of) {
    try {
      const r = restoreAsNewVersion(RUN, String(action.value.restore_of));
      activity(s, r.ok ? `Restored as a new version (${r.restored_as}); the later state is kept as a checkpoint` : `Not restored: ${r.error || "unknown"}`, r.ok ? "you" : "warn", null);
    } catch (e) { activity(s, `Not restored: ${redact(e.message)}`, "warn", null); }
    return true;
  }
  if (!action || !edit || (action.kind !== "motion-edit" && action.type !== "motion-edit")) return false;
  try {
    const r = handleMotionEditAction({ ...action, edit, kind: "motion-edit" }, { run: RUN });
    // the person's view restores the committed state and explains a rejection from this (Studio reads session.edit_results)
    s.edit_results = [...(s.edit_results || []).filter((q) => q.id !== edit.id), { id: edit.id, ok: !!r.ok, status: r.status || null, conflict: !!r.conflict, duplicate: !!r.duplicate, error: r.ok ? null : String(r.error || r.reason || "refused").replace(/\/(?:Users|home|private|var)\/[^\s"']*/g, "a file in this film"), current: r.current || null, needs_reselect: !!r.needs_reselect, at: now() }].slice(-30);
    activity(s, r.ok ? `Edit recorded${r.duplicate ? " (already had it)" : ""}: ${action.edit.element_id || "a region"} (${r.status || "requested"})${r.downgraded ? ", kept as a region note" : ""}` : `Edit not recorded: ${r.error || "unknown"}${r.conflict ? " (the scene changed; refresh and retry)" : ""}`, r.ok ? "you" : "warn", null);
  } catch (e) { activity(s, `Edit not recorded: ${e.message}`, "warn", null); }
  return true; // handled: it is not a step answer, so the generic "You: ..." line and the step's `sent` are skipped
}

// Plan 07 A6: a Studio sound action. `sound-note` ({note|text, value: {kind?, shot_id?, cue_id?, stem?, t?}}) is recorded as a versioned targeted revision in audio/revisions/rev-N.json
// with its timing effect; `sound-control` ({value: {stem, muted?, solo?}}) sets AUDITION state only. Neither applies, retimes or regenerates anything here, and neither asks for a cue
// approval. Best effort: a failure is shown in the feed, not thrown.
function soundHook(s, action) {
  if (!action || (action.kind !== "sound-note" && action.type !== "sound-note" && action.kind !== "sound-control" && action.type !== "sound-control")) return false;
  try {
    const v = action.value && typeof action.value === "object" ? action.value : {};
    if (action.kind === "sound-control" || action.type === "sound-control") {
      const r = setMuteSolo(RUN, { stem: v.stem, muted: v.muted, solo: v.solo });
      activity(s, r.ok ? `Audition: ${v.stem} ${v.solo ? "solo" : v.muted ? "muted" : "on"}` : `Audition not changed: ${r.error}`, r.ok ? "info" : "warn", null);
    } else {
      const r = soundNoteRevision(RUN, { text: action.note || v.text || "", kind: v.kind || null, shot_id: v.shot_id || null, cue_id: v.cue_id || null, stem: v.stem || null, t: typeof v.t === "number" ? v.t : null, source: "studio" });
      activity(s, r.ok ? `Sound note recorded as revision ${r.revision}: ${r.record.effect.summary}` : `Sound note not recorded: ${r.error}`, r.ok ? "info" : "warn", null);
    }
  } catch (e) { activity(s, `Sound action not recorded: ${e.message}`, "warn", null); }
  return true;
}

// Plan 10 U3/U6: `revision-request` (the person's words + where they pointed + the revision they were watching) is read once by lib/revision-intent.mjs into a scoped, pinned
// request in <run>/revisions/requests.jsonl; an ambiguous one shows ONE interpretation and waits for `revision-confirm` ({idempotency_key, accept}). The current approval stays valid
// meanwhile. Studio and the browser console send the same payload (docs/plans/PLAN10_NATIVE_DIRECTING.md). Best effort: a failure is shown in the feed, not thrown.
function revisionHook(s, action) {
  if (!action || (action.kind !== "revision-request" && action.type !== "revision-request" && action.kind !== "revision-confirm" && action.type !== "revision-confirm")) return false;
  try {
    const r = handleRevisionAction({ ...action, kind: action.kind || action.type }, { run: RUN });
    if (r.ok && (action.kind || action.type) === "revision-confirm" && r.request && r.request.status === "accepted") { const full = latestRequests(RUN).find((q) => q.idempotency_key === r.request.idempotency_key); if (full) keepFontAvoid(s, full); }
    activity(s, r.ok ? (r.needs_confirmation ? `Revision understood (confirm first): ${r.interpretation}` : `Revision ${r.request ? r.request.status : "recorded"}${r.duplicate ? " (already had it)" : ""}: ${r.request ? r.request.interpretation : ""}`) : `Revision not recorded: ${r.error || "unknown"}`, r.ok ? "you" : "warn", null);
    if (r.ok && r.request) s.revision_requests = [...(s.revision_requests || []).filter((q) => q.idempotency_key !== r.request.idempotency_key), { idempotency_key: r.request.idempotency_key, status: r.request.status, interpretation: r.request.interpretation, scope: r.request.intent_category, needs_confirmation: !!r.needs_confirmation }].slice(-50);
  } catch (e) { activity(s, `Revision not recorded: ${e.message}`, "warn", null); }
  return true;
}

// Plan 10: the person's "don't use this font" is a scoped, sourced user preference (scope user, style, confidence by how sure the font is), never a global craft rule.
// Only a named family is stored as a lesson (the visual-bible font_avoid check needs a family); a descriptor pointed at an element is a revision only.
function keepFontAvoid(s, request) {
  const av = request && request.avoid;
  if (!av || av.kind !== "font" || !av.family || request.status === "requested") return;
  try {
    addLesson({ rule: `Avoid the font "${av.family}"`, quote: av.source_text, kind: "taste", area: "type", source: "user", run: path.basename(RUN), scope: "user", "scope-id": "local_user", rationale: "the person said not to use this font in a film's feedback", confidence: "high", nature: "style" });
  } catch (e) { activity(s, `Font preference not kept: ${e.message}`, "warn", null); }
}

// Plan 10: a bare `note` at the animatic, render or final that classifyFeedback reads as typography (or a direct property edit) ALSO goes through the revision pipeline: one request keyed by the
// action id (a replay never makes two), recorded in revisions/requests.jsonl. The note keeps its legacy path (taste.jsonl, feed, thread). Anything else returns null and behaves exactly as before.
// Returns the reply text (scope, what stays, honest timing) or null.
function typographyNoteHook(s, action) {
  if (!action || action.type !== "note" || !["animatic", "render", "final"].includes(action.step) || !action.note) return null;
  try {
    const v = action.value && typeof action.value === "object" ? action.value : {};
    const c = classifyFeedback(action.note, v.anchor || {});
    if (!c.ok || !(c.category === "typography" || (c.category === "property_edit" && c.deterministic))) return null;
    const r = handleRevisionAction({ kind: "revision-request", note: action.note, value: { anchor: v.anchor || {}, pinned: v.pinned || {}, idempotency_seed: action.id || null } }, { run: RUN });
    if (!r.ok) { activity(s, `Revision not recorded: ${r.error || "unknown"}`, "warn", null); return null; }
    keepFontAvoid(s, r.request);
    s.revision_requests = [...(s.revision_requests || []).filter((q) => q.idempotency_key !== r.request.idempotency_key), { idempotency_key: r.request.idempotency_key, status: r.request.status, interpretation: r.request.interpretation, scope: r.request.intent_category, needs_confirmation: !!r.needs_confirmation }].slice(-50);
    activity(s, r.needs_confirmation ? `Revision understood (confirm first): ${r.interpretation}` : `Revision ${r.request.status}${r.duplicate ? " (already had it)" : ""}: ${r.interpretation}`, "you", null);
    const rev = r.request;
    return r.needs_confirmation ? `${rev.interpretation} (Nothing is queued until you confirm.)`
      : `${rev.interpretation} This revision is queued (scope: ${rev.target_ids.length ? rev.target_ids.join(", ") : "the whole film"}); there is no time estimate yet, and the current final stays as delivered until a new one is rendered.`;
  } catch (e) { activity(s, `Revision not recorded: ${e.message}`, "warn", null); return null; }
}

// Plan 10 U6: `job-control` ({value:{op: pause|resume|cancel|retry|logs|capabilities, job_id?}}) acts on THIS run's jobs through lib/job-control.mjs (the Plan 09 job and pool state).
// The answer is kept in session.job_control (redacted: no credentials or private paths) for Studio to show; session.run_status is the truthful Working/Waiting/Paused/... state.
function jobControlHook(s, action) {
  if (!action || (action.kind !== "job-control" && action.type !== "job-control")) return false;
  try {
    const r = handleJobControl(action, { run: RUN });
    s.job_control = { op: r.op || (action.value && action.value.op) || null, ok: !!r.ok, note: redact(r.note || r.error || ""), job_id: r.job_id || null, lines: r.lines || undefined, at: now() };
    s.run_status = runStatus(RUN);
    activity(s, r.ok ? `Run control: ${s.job_control.op}${r.job_id ? " " + r.job_id : ""}` : `Run control refused: ${s.job_control.note}`, r.ok ? "you" : "warn", null);
  } catch (e) { activity(s, `Run control failed: ${redact(e.message)}`, "warn", null); }
  return true;
}

// What an action does to the session, besides being queued: the "sent" banner, the "You: ..." feed line, the note and
// thread entries, an ask's answer. The server runs it on POST; headless `wait` runs it when it consumes the action, so
// the session ends up the same either way. Mutates `s`; the caller saves it.
function applyAction(s, action) {
  const step = action.step;
  tasteFrom(action);
  storyboardHooks(s, action);
  if (motionEditHook(s, action)) return;
  if (soundHook(s, action)) return;
  if (revisionHook(s, action)) return;
  const typoReply = typographyNoteHook(s, action);
  if (jobControlHook(s, action)) return;
  if (step === "*") s.decide_rest = { ts: action.ts };
  else if (Object.prototype.hasOwnProperty.call(s.steps, step) && !["comment", "knob", "cut-edit", "motion-edit"].includes(action.type)) s.steps[step].sent = { type: action.type, value: action.value, note: action.note, ts: action.ts, source: cleanSource(action.source), ...(SOURCES[action.source] ? { via: SOURCES[action.source] } : {}) };
  const you = youOf(action);
  // an answer to an `ask` card: record it on the question and clear it from the page
  if (action.type === "answer" && s.ask && !s.ask.answered) {
    const v = action.value || {};
    const opt = (s.ask.options || []).find((o) => o.id === v.choice);
    s.ask.answered = { choice: v.choice || null, label: opt ? opt.label : null, text: v.text || "", t: action.ts };
    activity(s, `${you} answered: ${opt ? opt.label : ""}${opt && v.text ? " · " : ""}${v.text ? "“" + String(v.text).slice(0, 120) + "”" : ""}`, "you", "Claude is reading your answer…");
    return;
  }
  // the user pressed Apply: remember which notes, so a revision can't go out with one unanswered
  if (action.type === "apply") {
    const ids = action.value && Array.isArray(action.value.ids) ? action.value.ids.map(String) : (s.comments || []).filter((c) => c.step === step && c.state !== "resolved").map((c) => c.id);
    s.applied = [...new Set([...(s.applied || []), ...ids])].slice(-200);
  }
  // a note pinned to a moment of the animatic or the final: kept on the page until Claude resolves it
  if (action.type === "comment") {
    const v = action.value || {};
    s.comments = (s.comments || []).concat({ id: action.id, step, scene: v.scene ?? null, t: typeof v.t === "number" ? v.t : null, x: typeof v.x === "number" ? v.x : null, y: typeof v.y === "number" ? v.y : null, w: typeof v.w === "number" ? v.w : null, h: typeof v.h === "number" ? v.h : null, scope: v.scope || "scene", quick: v.quick || null, word_id: typeof v.word_id === "string" ? v.word_id : null, clip: typeof v.clip === "string" ? v.clip : null, text: action.note || v.quick || "", state: "open", ts: action.ts }).slice(-200);
    if (step === "animatic") { // Plan 05 E6: anchor to shot / panel / time / the storyboard revision watched; "hard to understand" is an editorial request, not more animation
      try {
        const last = s.comments[s.comments.length - 1], rev = ((s.steps && s.steps.animatic) || {}).storyboard_revision ?? null;
        const nr = noteToRevision(last.text, { shot_id: v.shot_id ?? null, panel_id: v.panel_id ?? null, t: last.t, revision: v.revision ?? rev }, { revision: rev });
        if (nr.ok) Object.assign(last, { shot_id: v.shot_id ?? null, panel_id: v.panel_id ?? null, anchor_revision: nr.anchor.revision, note_kind: nr.note_kind, editorial: nr.editorial || undefined, stale_anchor: nr.stale_anchor, revision_request: { stage: nr.request.stage, idempotency_key: nr.request.idempotency_key, ask: nr.ask } });
      } catch {}
    }
    if (step !== "animatic") { // Plan 10 U3: a note on any other step (the Final, a Story card...) is read the same way, so the browser and Studio agree on what it asks for
      try {
        const last = s.comments[s.comments.length - 1], c = classifyFeedback(last.text, { shot_id: v.shot_id ?? null, element_id: v.element_id ?? null, t: last.t });
        if (c.ok) Object.assign(last, { intent_category: c.category, interpretation: c.interpretation, needs_confirmation: c.needs_confirmation || undefined });
      } catch {}
    }
    activity(s, `${you} left a note${v.t != null ? " at " + Math.floor(v.t / 60) + ":" + String(Math.floor(v.t % 60)).padStart(2, "0") : ""}: ${action.note || v.quick}`, "you", null);
    return;
  }
  // Motion Studio: a pinned edit from the final (value {kind:"motion-edit", edit}); editor-patch records it under its own lock,
  // the status line goes to the feed and to session.motion_edits (latest per id)
  if (action.type === "motion-edit") {
    let r;
    try { r = handleMotionEditAction({ kind: "motion-edit", edit: action.value && action.value.edit }, { run: RUN }); } catch (e) { r = { ok: false, error: e && e.message }; }
    const eid = (r && r.id) || (action.value && action.value.edit && action.value.edit.id) || action.id;
    const st = r && r.ok ? r.status || "requested" : "failed";
    s.motion_edits = (s.motion_edits || []).filter((m) => m.id !== eid).concat({ id: String(eid), status: st, note: String((r && (r.note || r.error)) || "").slice(0, 300), ts: action.ts }).slice(-50);
    activity(s, `${you} asked for a motion edit (${eid}): ${st}`, r && r.ok ? "you" : "warn", null);
    return;
  }
  // a transcript edit in the Cut stage (Studio): a feed line only; it must not mark the reel step as answered
  if (action.type === "cut-edit") { activity(s, `${you} edited the cut: ${(action.value && action.value.op) || "edit"}`, "you", null); return; }
  // a redo of some style frames ({ids, note}): name the frames
  const nm = action.type === "redo" && action.value && Array.isArray(action.value.ids) ? `frame${action.value.ids.length > 1 ? "s" : ""} ${action.value.ids.join(", ")}` : nameOf(s, step, action.value);
  const verb = { choose: "picked", submit: "sent", approve: "approved", adjust: "adjusted", more: "asked for more of", redo: "asked to redo" }[action.type] || action.type;
  const said = action.type === "decide-rest" ? "Claude decides the rest" : action.type === "decide" ? `Claude decides ${LABELS[step] || step}` : action.type === "note" ? `Note: "${action.note}"` : `${verb} ${LABELS[step] || step}${nm ? ": " + nm : ""}`;
  if (s.steps[step] && s.steps[step].sent && nm) s.steps[step].sent.name = nm;
  // anything the user writes becomes part of that step's discussion
  const said2 = action.note || (action.type === "redo" && action.value && action.value.note ? String(action.value.note).slice(0, 4000) : "");
  if (said2 && s.steps[step]) s.steps[step].thread = (s.steps[step].thread || []).concat({ who: "you", text: said2, t: action.ts }).slice(-50);
  if (typoReply && s.steps[step]) s.steps[step].thread = (s.steps[step].thread || []).concat({ who: "claude", text: typoReply.slice(0, 4000), t: now() }).slice(-50);
  activity(s, `${you}: ${said}`, "you", "Claude is reading your answer…");
}

// `wait`, in both modes: the next action for this wait, after applying (and consuming) what arrived. Runs under the actions
// lock. Every line is validated like a POST would be; a bad one is consumed with its reason in rejected.json, never thrown on.
// A line the console server wrote on POST carries `applied: true` (its effects are already in session.json) and is only
// consumed; every other line (RasanAI Studio, another app, an older server's) gets applyAction here.
function nextAction(step) {
  let found = null;
  withLock(F.actionsLock, () => {
    let text = "";
    try { text = fs.readFileSync(F.actions, "utf8"); } catch { return; }
    const lines = text.split("\n");
    // a last line without its newline may still be being written: leave it for the next tick
    if (!text.endsWith("\n")) lines.pop();
    const consumed = readJSON(F.consumed, []);
    const done = new Set(consumed);
    const rejected = readJSON(F.rejected, []);
    let changed = false;
    for (const line of lines) {
      if (!line.trim()) continue;
      let raw = null;
      try { raw = JSON.parse(line); } catch {}
      const goodId = raw && typeof raw === "object" && typeof raw.id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(raw.id);
      const rid = goodId ? raw.id : "bad-" + crypto.createHash("sha1").update(line).digest("hex").slice(0, 10);
      if (done.has(rid)) continue;
      const v = line.length > 1e6 ? { error: "action too large" } : raw === null ? { error: "not valid JSON" } : validateAction(raw, () => session());
      if (!v.error && !goodId) v.error = "missing or invalid id";
      if (v.error) {
        done.add(rid); consumed.push(rid); rejected.push({ id: rid, error: v.error, ts: now() });
        changed = true;
        continue;
      }
      if (step && v.step !== step && v.step !== "*") continue;
      const action = { id: rid, ts: typeof raw.ts === "string" ? raw.ts : now(), step: v.step, type: v.type, value: v.value, note: v.note, source: cleanSource(raw.source) };
      if (raw.applied !== true) {
        try {
          withLock(F.sessionLock, () => {
            const s = session();
            applyAction(s, action);
            saveSession(s);
          });
        } catch (e) {
          rejected.push({ id: rid, error: `could not apply: ${e && e.message}`, ts: now(), delivered: true });
        }
      }
      consumed.push(rid); done.add(rid);
      changed = true;
      found = action;
      break;
    }
    if (changed) {
      writeJSON(F.consumed, consumed);
      if (rejected.length) writeJSON(F.rejected, rejected.slice(-200));
    }
  });
  return found;
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
// headless: never a server; the session is rewritten under the run's lock for the whole command (parallel agents and
// scripts push at once, and an unlocked read-modify-write would lose one of them)
// In server mode too: `wait` now applies other apps' actions to session.json, so every rewrite takes the same lock.
if (!HEADLESS && ["push", "log", "activity", "reply", "ask", "downgrade"].includes(cmd)) ensureServer();
if (["push", "log", "activity", "reply", "ask", "resolve", "downgrade", "relock"].includes(cmd)) {
  acquire(F.sessionLock, 8000);
  process.on("exit", () => release(F.sessionLock));
}
if (cmd === "push") {
  if (!args.step || !STEPS.includes(args.step)) die(`--step must be one of ${STEPS.join(", ")}`);
  const s = session();
  const prev = s.steps[args.step] || {};
  const data = parseData();
  // a revision (higher version) after Apply must answer every applied note: resolve --ids … --note "what changed" first
  if (["animatic", "render"].includes(args.step) && Number(data.version) > Number(prev.version || 0)) {
    const open = (s.comments || []).filter((c) => (s.applied || []).includes(c.id) && !(c.state === "resolved" && c.resolution));
    if (open.length && !args.force) {
      console.error(`refused: ${open.length} applied note${open.length > 1 ? "s" : ""} not answered (${open.map((c) => c.id).join(", ")}). Run: console.mjs resolve --run <run> --ids ${open.map((c) => c.id).join(",")} --note "<what changed>", then push again (or --force "<reason>").`);
      process.exit(2);
    }
    if (open.length) {
      if (args.force === true || String(args.force).trim().length < 4) die('--force wants a reason: --force "<why these notes stay unanswered>"');
      s.forced = (s.forced || []).concat({ t: now(), step: args.step, ids: open.map((c) => c.id), reason: String(args.force) }).slice(-50);
      activity(s, `Revision pushed with ${open.length} note${open.length > 1 ? "s" : ""} unanswered: ${args.force}`, "warn", null);
    }
    s.applied = (s.applied || []).filter((id) => !(s.comments || []).some((c) => c.id === id && c.step === args.step));
  }
  // the decision log is append-only: a changed decision keeps the old call, and says why it lost
  const because = String(args.because !== undefined && args.because !== true ? args.because : data.because || "").trim();
  delete data.because;
  // only a call already closed (done) is a swap: a provisional decision on a working step may change freely
  const swapped = typeof data.decision === "string" && prev.decision && prev.status === "done" && String(data.decision).trim() !== String(prev.decision).trim();
  if (swapped && because.length < 8) {
    console.error(`refused: ${args.step} already has a decision ("${String(prev.decision).slice(0, 100)}"). A different one replaces it only with the reason the old call lost: add --because "<why, 8+ characters>" (the old call is kept in the history).`);
    process.exit(2);
  }
  if (args.title) s.title = String(args.title);
  // a push REPLACES the step's payload (stale options, issues or a "you sent" banner must
  // not survive a re-push); --merge keeps the previous fields for small incremental updates
  // closing a step with only its decision keeps what it showed (the animatic's scenes stay viewable)
  const onlyDecision = (args.status === "done" || data.status === "done") && Object.keys(data).every((k) => ["decision", "status"].includes(k));
  const base = args.merge || onlyDecision ? prev : {};
  const next = { ...base, ...data, status: args.status || data.status || (args.step === "build" ? "working" : "awaiting"), updated: now() };
  delete next.sent;
  // history survives every re-push of the step
  const hist = (prev.decisions_history || []).slice();
  if (swapped) hist.push({ decision: prev.decision, at: prev.updated || now(), replaced_by: String(data.decision), because });
  if (hist.length) next.decisions_history = hist;
  // the brief carries the "What are you making?" picker (library/formats.json) and the pre-selected pick, when the push has none
  if (args.step === "brief" && next.status === "awaiting") Object.assign(next, briefFormat(next));
  // the brief shows what the film will cost: the token budget (level, total, per phase, the three levels), written by `crew.mjs plan` to <run>/crew/budget.json
  if (args.step === "brief") {
    const bud = next.budget && typeof next.budget === "object" ? next.budget : readJSON(path.join(RUN, "crew", "budget.json"), {}).budget;
    if (bud && typeof bud === "object") next.budget = cleanBudget(bud);
  }
  // closing a step the user answered keeps who made the call, so the Decisions drawer credits them, not Claude
  if (next.status === "done" && !data.by && prev.sent && !["decide", "decide-rest", "note"].includes(prev.sent.type)) {
    next.by = "user";
    // ... and where they made it from, when that was another app ("You · iPhone" in the drawer)
    if (prev.sent.via) { next.by_source = cleanSource(prev.sent.source); next.by_via = String(prev.sent.via).slice(0, 40); }
    else { delete next.by_source; delete next.by_via; }
  }
  // the step's discussion survives a re-push (Claude revising the options is the answer to it)
  if (prev.thread && !data.thread) next.thread = prev.thread;
  if (args.step === "build" && !args.merge) {
    next.log = data.log || prev.log || [];
    next.stages = data.stages || prev.stages || {};
  }
  // the phone's copy of the newest video (references/remote.md): already made and fresh, said now; else made in the background
  if (["animatic", "render", "final"].includes(args.step)) {
    delete next.proxy;
    const ph = phoneProxy(newestVideo(next));
    if (ph && ph.fresh) next.proxy = ph.proxy;
    else if (ph) spawnProxy(args.step, ph.video);
  }
  s.steps[args.step] = next;
  // closing a call locks what it approved (lib/locks.mjs); an identical re-push keeps the old lock
  if (next.status === "done") for (const [layer, L] of Object.entries(LAYERS)) {
    if (L.step !== args.step) continue;
    const snap = snapshot(RUN, layer), old = (s.locks || {})[layer];
    if (old && JSON.stringify(old.files) === JSON.stringify(snap.files)) continue;
    s.locks = { ...(s.locks || {}), [layer]: snap };
  }
  if (args.current || next.status === "awaiting" || (next.status === "working" && ["build", "render", "final"].includes(args.step))) s.current = args.step;
  const label = LABELS[args.step] || args.step;
  if (next.status === "awaiting") activity(s, `Ready for you: ${label}`, "ask");
  else if (next.status === "working") activity(s, data.question || `Working on ${label}`, "info", data.question || `Working on ${label}…`);
  else if (next.status === "done") activity(s, next.decision ? `Decided ${label}: ${next.decision}` : `Done: ${label}`, "ok", s.working && s.working.msg);
  mergeDowngrades(s);
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
  const layers = (args.layers === undefined || args.layers === true ? "motion,timing" : String(args.layers)).split(",").map((x) => x.trim()).filter(Boolean);
  if (!layers.length || layers.some((l) => !NOTE_LAYERS.includes(l))) die(`--layers must be a comma list of ${NOTE_LAYERS.join(", ")}`);
  const resolvedIds = [];
  for (const c of s.comments || []) if (ids.includes(c.id) || args.all) { if (c.state !== "resolved") n++; c.state = "resolved"; c.resolved = now(); c.layers = layers; resolvedIds.push(c.id); if (args.note) c.resolution = String(args.note); }
  // a fix that changed a locked file outside the notes' layers is a warning, not a stop (lib/locks.mjs)
  for (const d of drift(RUN, s.locks)) {
    if (layers.includes(d.layer)) { relock(RUN, s, d.layer, args.note ? String(args.note) : "notes scoped to " + layers.join(", ")); continue; }
    console.error(`warning: ${d.file} (${d.layer}, approved at the ${LAYERS[d.layer].step} call) changed, but the notes were scoped to ${layers.join(", ")}. If the change is meant, say so: console.mjs relock --run <run> --layer ${d.layer} --because "<why>"`);
    if (!(s.lock_breaks || []).some((b) => b.layer === d.layer && b.file === d.file && b.sha === d.now)) s.lock_breaks = (s.lock_breaks || []).concat({ at: now(), layer: d.layer, file: d.file, ids: resolvedIds, layers, note: args.note ? String(args.note) : "", sha: d.now }).slice(-100);
  }
  if (n) activity(s, `Applied ${n} note${n > 1 ? "s" : ""}${args.note ? ": " + args.note : ""}`, "ok", null);
  saveSession(s);
  console.log(JSON.stringify({ ok: true, resolved: n }));
} else if (cmd === "locks") {
  const s = session();
  console.log(JSON.stringify({ locks: s.locks || {}, drift: drift(RUN, s.locks), lock_breaks: s.lock_breaks || [], relocks: s.relocks || [] }, null, 2));
} else if (cmd === "relock") {
  const layer = String(args.layer || "");
  if (!LAYERS[layer]) die(`--layer must be one of ${Object.keys(LAYERS).join(", ")}`);
  const why = args.because === undefined || args.because === true ? "" : String(args.because).trim();
  if (why.length < 8) die('--because "<why the change is meant, 8+ characters>" is required');
  const s = session();
  if (!(s.locks || {})[layer]) {
    console.log(JSON.stringify({ ok: true, layer, relocked: false, note: "no lock yet: the call was not closed" }));
  } else {
    relock(RUN, s, layer, why);
    s.lock_breaks = (s.lock_breaks || []).filter((b) => b.layer !== layer);
    saveSession(s);
    console.log(JSON.stringify({ ok: true, layer, relocked: true }));
  }
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
} else if (cmd === "downgrade") {
  // a fallback the director made by hand: always told to the user, never silent
  if (!args.what || !args.instead || !args.why) die('--what "<what the plan asked>", --instead "<what is used>" and --why "<reason>" are required');
  noteDowngrade({ run: RUN, what: String(args.what), instead: String(args.instead), why: String(args.why), impact: args.impact ? String(args.impact) : undefined });
  const s = session();
  mergeDowngrades(s);
  saveSession(s);
  console.log(JSON.stringify({ ok: true, downgrades: (s.downgrades || []).length }));
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
  if (!["comment", "apply"].includes(a.type)) tasteFrom(a); // a comment/apply goes through applyAction below, which records it
  // chat answers count as consumed: the agent already has them
  const markConsumed = () => {
    const consumed = readJSON(F.consumed, []);
    consumed.push(a.id);
    writeJSON(F.consumed, consumed);
  };
  withLock(F.actionsLock, markConsumed);
  // a note or an Apply given in chat enters the notes rule like one clicked on the page (the page's own would be applied by the server or by `wait`)
  if (["comment", "apply"].includes(a.type)) {
    if (a.type === "comment" && !a.note && !(value && value.quick)) die("record --type comment needs --note \"<the note>\"");
    withLock(F.sessionLock, () => {
      const s = session();
      applyAction(s, a);
      saveSession(s);
    });
  }
  console.log(JSON.stringify(a));
} else if (cmd === "wait") {
  const timeout = Number(args.timeout || 3000) * 1000;
  const start = Date.now();
  let checks = 0;
  const tick = () => {
    // every ~5s: if the console server died, say so instead of waiting forever
    if (!HEADLESS && ++checks % 12 === 0) {
      const c = readJSON(F.console, null);
      if ((!c || (c.pid && !alive(c.pid))) && readJSON(F.address, null) && !ensureServer()) {
        console.log(JSON.stringify({ console_down: true, hint: "it could not be restarted; run `console.mjs serve --run <dir> --open`; answers can also come from chat" }));
        process.exit(3);
      }
    }
    let next = null;
    try { next = nextAction(args.step); } catch {}
    if (next) {
      console.log(JSON.stringify(next));
      process.exit(0);
    }
    if (Date.now() - start > timeout) {
      console.log(JSON.stringify({ timeout: true, step: args.step || null }));
      process.exit(2);
    }
    setTimeout(tick, HEADLESS ? 300 : 400);
  };
  tick();
} else if (cmd === "proxy") {
  // internal (see the header): never prints an error, never fails the film
  const step = String(args.step || ""), video = String(args.video || "");
  const ph = ["animatic", "render", "final"].includes(step) ? phoneProxy(video) : null;
  if (ph && !ph.fresh && makeProxy(ph)) {
    withLock(F.sessionLock, () => {
      const s = session();
      // only if the step still shows that video (a newer push may have replaced it)
      if (s.steps[step] && newestVideo(s.steps[step]) === video) { s.steps[step].proxy = ph.proxy; saveSession(s); }
    });
  }
  process.exit(0);
} else if (cmd === "state") {
  console.log(JSON.stringify(session(), null, 2));
} else if (cmd === "url") {
  if (HEADLESS) die("this run is headless: there is no console page or URL. RasanAI Studio reads the run's files directly.");
  const c = readJSON(F.console, null);
  if (!c || !alive(c.pid)) die("console is not running for this run (start it with `serve`)");
  console.log(c.url);
} else if (cmd === "stop") {
  if (HEADLESS) {
    console.log(JSON.stringify({ stopped: true, headless: true }));
    process.exit(0);
  }
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
  if (HEADLESS) console.log(JSON.stringify({ headless: true }));
  else serve();
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
        const v = validateAction(a);
        if (v.error) return send(400, { error: v.error });
        const step = v.step;
        // applied here, so the line says so and `wait` only consumes it; the session is rewritten under its lock
        // (one lock at a time, never session.lock around actions.lock: `wait` takes them the other way round)
        const action = appendAction({ step, type: v.type, value: v.value, note: v.note, source: "console", applied: true });
        withLock(F.sessionLock, () => {
          const s = session();
          applyAction(s, action);
          saveSession(s);
        });
        const { applied, ...shown } = action;
        send(200, { ok: true, action: shown });
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
    writeJSON(F.console, { url, port, pid: process.pid, root, started: now(), version: VERSION, skill: SKILL_DIR, external_actions: EXTERNAL_ACTIONS });
    // the page shows this copy's version and, from the last update check (no network here), a newer one
    withLock(F.sessionLock, () => {
      const s = session();
      const upd = readJSON(path.join(STATE_DIR, "update-check.json"), null);
      s.app = { version: VERSION, latest: upd && upd.latest ? upd.latest : VERSION };
      if (!s.activity) activity(s, "Console open", "sys", "Getting started…");
      saveSession(s);
    });
  });
  const bye = () => {
    const c = readJSON(F.console, null);
    if (c && c.pid === process.pid) fs.rmSync(F.console, { force: true });
    process.exit(0);
  };
  process.on("SIGTERM", bye);
  process.on("SIGINT", bye);
}

// ---------------------------------------------------------------------------
// phone proxies: a small H.264 copy of a step's video for a phone (references/remote.md, "Video for phones")
function newestVideo(d) {
  const v = d && (typeof d.video === "string" && d.video ? d.video : Array.isArray(d.videos) ? d.videos.filter((x) => typeof x === "string" && x).at(-1) : null);
  return v && /\.(mp4|mov|m4v|webm)$/i.test(v) ? v : null;
}
// where a payload path is: absolute, else the project (the director's cwd, the console's root), else the run
function payloadFile(p) {
  if (path.isAbsolute(p)) return p;
  const roots = [process.cwd(), (readJSON(F.console, {}) || {}).root, (readJSON(F.address, {}) || {}).root, RUN].filter(Boolean);
  for (const r of roots) { const f = path.resolve(String(r), p); if (fs.existsSync(f)) return f; }
  return null;
}
// {video, file, out (absolute), proxy (the payload path: relative to the project like other media), fresh} or null (no video,
// off, missing file). Kept in the run folder, never beside the render, so nothing that looks for the newest render finds it.
function phoneProxy(video) {
  if (!video || process.env.RASANAI_PHONE_PROXY === "off") return null;
  const file = payloadFile(video);
  if (!file) return null;
  const key = crypto.createHash("sha1").update(path.resolve(file)).digest("hex").slice(0, 8);
  const out = path.join(RUN, "phone", `${path.basename(file).replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9_-]+/g, "-").slice(0, 60)}-${key}.mp4`);
  let fresh = false;
  try { fresh = fs.statSync(out).mtimeMs >= fs.statSync(file).mtimeMs; } catch {}
  // by real path: macOS's /var is /private/var, and cwd comes back resolved
  let rel = "";
  try { rel = path.relative(fs.realpathSync(process.cwd()), path.join(fs.realpathSync(RUN), path.relative(RUN, out))); } catch {}
  return { video, file, out, fresh, proxy: rel && !rel.startsWith("..") && !path.isAbsolute(rel) ? rel : out };
}
function spawnProxy(step, video) {
  try {
    spawn(process.execPath, [fileURLToPath(import.meta.url), "proxy", "--run", RUN, "--step", step, "--video", video], { detached: true, stdio: "ignore", cwd: process.cwd() }).unref();
  } catch {}
}
// 540 on the short side (never upscaled), ~1.2 Mbit/s, AAC, faststart; written to a temp name and renamed. False when ffmpeg is missing or fails.
function makeProxy(ph) {
  const tmp = path.join(path.dirname(ph.out), `.${path.basename(ph.out)}.${process.pid}.tmp`);
  try { fs.mkdirSync(path.dirname(ph.out), { recursive: true }); } catch { return false; }
  const scale = "scale='if(gt(iw,ih),-2,min(540,iw))':'if(gt(iw,ih),min(540,ih),-2)'";
  try {
    execFileSync("ffmpeg", ["-y", "-v", "error", "-i", ph.file, "-map", "0:v:0", "-map", "0:a:0?", "-vf", scale, "-c:v", "libx264", "-preset", "veryfast", "-profile:v", "main", "-pix_fmt", "yuv420p", "-b:v", "1200k", "-maxrate", "1500k", "-bufsize", "2400k", "-c:a", "aac", "-b:a", "96k", "-ac", "2", "-movflags", "+faststart", "-f", "mp4", tmp], { stdio: "ignore", timeout: 15 * 60 * 1000 });
    fs.renameSync(tmp, ph.out);
    return true;
  } catch {
    fs.rmSync(tmp, { force: true });
    return false;
  }
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
