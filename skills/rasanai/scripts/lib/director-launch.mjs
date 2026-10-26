// The director's launch prompt, as RasanAI Studio builds it (apps/macos/Sources/StudioCore/DirectorLaunch.swift and
// FilmDraft.creativeDirection), so `director.mjs resume` restarts a film exactly the way Studio's own Resume does.
//
// The SOURCE OF TRUTH for the long texts is Swift. lib/director-prompt-data.json is generated from it
// (`RASAN_WRITE_GOLDEN=1 swift test --filter DirectorPromptParityTests` in apps/macos): the launch prompt around the request, the
// level / footage / presenter texts, the pace and model-plan sections. This file only reads that data and ports the composition logic
// (which section goes where, the draft's defaults, the taste and linked-source lines). A golden file both sides test against
// (apps/macos/Tests/StudioCoreTests/Fixtures/director-prompt-golden.json, scripts/tests/director-launch.mjs) keeps the two in step.
// Zero dependencies.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PROMPT_DATA = JSON.parse(fs.readFileSync(path.join(HERE, "director-prompt-data.json"), "utf8"));

export const RESUME_REQUEST = PROMPT_DATA.resumeRequest;
const MOTION_LEVELS = ["maximal", "balanced", "minimal"];
const PACES = ["fast", "standard", "thorough"];
const PLANS = ["recommended", "opus", "sonnet", "settings"];
const AGENTS = ["claude", "codex", "custom"];
const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "m4v", "webm", "mkv", "avi", "mts"]);
const LEGACY_DEPTH = { quick: "fast", standard: "standard", deep: "thorough" };
// what a film gets when nobody chose (new films) and what a draft saved before the setting existed gets
const DEFAULT_PACE = "fast";
const LEGACY_PACE = "standard";

const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);

// FilmDraft.load(in:): rasanai-brief.json decoded and clamped; null when it is missing or does not decode
export function loadDraft(project) {
  let raw;
  try { raw = JSON.parse(fs.readFileSync(path.join(project, "rasanai-brief.json"), "utf8")); } catch { return null; }
  if (!isObj(raw)) return null;
  if (typeof raw.brief !== "string" || !Number.isInteger(raw.duration) || typeof raw.aspect !== "string" || typeof raw.agent !== "string") return null;
  if (raw.motionLevel !== undefined && raw.motionLevel !== null && typeof raw.motionLevel !== "string") return null;
  const pace = PACES.includes(raw.pace) ? raw.pace : LEGACY_DEPTH[raw.researchDepth] || LEGACY_PACE;
  const linkedOk = Array.isArray(raw.linkedSources) && raw.linkedSources.every((s) => isObj(s) && ["footage", "reference"].includes(s.kind) && typeof s.path === "string" && typeof s.isFolder === "boolean");
  const series = isObj(raw.series) && ["name", "slug", "path"].every((k) => typeof raw.series[k] === "string") ? raw.series : null;
  const level = typeof raw.motionLevel === "string" && MOTION_LEVELS.includes(raw.motionLevel) ? raw.motionLevel : "maximal";
  return {
    agent: AGENTS.includes(raw.agent) ? raw.agent : "claude",
    motionLevel: level,
    modelPlan: PLANS.includes(raw.modelPlan) ? raw.modelPlan : "recommended",
    pace,
    linked: linkedOk ? raw.linkedSources.map((s) => ({ kind: s.kind, path: s.path, isFolder: s.isFolder })) : [],
    preferences: isObj(raw.preferences) && Object.values(raw.preferences).every((v) => typeof v === "string") ? raw.preferences : {},
    series,
    endingFile: typeof raw.ending_file === "string" ? raw.ending_file : null,
  };
}

// ProjectSources.files(in:): the regular, visible files in assets/sources (nothing is created)
export function projectSources(project) {
  const dir = path.join(project, "assets", "sources");
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile() && !e.name.startsWith(".")).map((e) => path.join(dir, e.name));
  } catch { return []; }
}

// TasteQuestions: <engine>/library/questions.json (null when it is not there)
export function loadQuestions(engine) {
  try { return JSON.parse(fs.readFileSync(path.join(engine, "library", "questions.json"), "utf8")); } catch { return null; }
}

export function linkedText(draft) {
  if (!draft.linked.length) return "";
  const lines = [];
  for (const s of draft.linked) if (s.kind === "footage") lines.push(`FOOTAGE ${s.isFolder ? "FOLDER" : "CLIP"} (the user's raw footage, referenced in place): ${s.path}`);
  for (const s of draft.linked) if (s.kind === "reference") lines.push(`REFERENCE VIDEO (make it like this): ${s.path}`);
  let text = "\n\nLINKED SOURCES (outside the project; the app granted read-only access)\n" + lines.join("\n");
  text += "\nRead these where they are. Never copy, move, rename or write to them: footage can be tens of gigabytes, so scan, probe and cut straight from the path.";
  if (draft.linked.some((s) => s.kind === "reference")) text += "\nA reference video is inspiration, not material: study its pace, type, colour and camera, and never cut it into the film.";
  return text;
}

export function tasteText(draft, questions) {
  const lines = [];
  const prefs = draft.preferences;
  if (Object.keys(prefs).length) {
    const order = ((questions && questions.questions) || []).map((q) => q.id);
    const rank = (id) => { const i = order.indexOf(id); return i < 0 ? Number.MAX_SAFE_INTEGER : i; };
    const ids = Object.keys(prefs).sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0));
    lines.push("PREFERENCES (the owner's choices; obey them, never reinterpret; read library/questions.json for meanings):");
    for (const id of ids) {
      const q = ((questions && questions.questions) || []).find((x) => x.id === id);
      const c = q && (q.choices || []).find((x) => x.id === prefs[id]);
      lines.push(`- ${id} = ${prefs[id]}${c ? ` (${c.label})` : ""}`);
    }
  }
  if (draft.endingFile) lines.push(`ENDING CARD FILE: ${draft.endingFile}`);
  if (draft.series) lines.push(`SERIES: ${draft.series.name} (${draft.series.path}). Read series.json there: its look (DESIGN.md) is locked, so skip the Look call, write one Story option within its rules, and auto-choose it; obey its \`rules\`.`);
  return lines.length ? "\n\n" + lines.join("\n") : "";
}

// FilmDraft.creativeDirection(sources:)
export function creativeDirection(draft, sources = [], questions = null) {
  let text = `MOTION GRAPHICS LEVEL: ${draft.motionLevel.toUpperCase()}\n` + PROMPT_DATA.level[draft.motionLevel];
  if (draft.agent === "claude") {
    const plan = PROMPT_DATA.direction[`${draft.modelPlan}|${draft.pace}`];
    if (plan) text += "\n\n" + plan;
  }
  const video = sources.some((s) => VIDEO_EXTENSIONS.has(path.extname(String(s)).slice(1).toLowerCase()));
  if (draft.linked.some((s) => s.kind === "footage") || video) {
    text += "\n\nFOOTAGE REEL\n" + PROMPT_DATA.footage[draft.motionLevel];
    text += "\n\nPRESENTER FILMS\n" + PROMPT_DATA.presenter[draft.motionLevel];
  }
  return text + tasteText(draft, questions);
}

// The request Studio's Resume sends: the fixed sentence, then (when the project has a draft) the creative direction and linked sources
export function resumeRequest(draft, sources = [], questions = null) {
  return draft ? RESUME_REQUEST + "\n\n" + creativeDirection(draft, sources, questions) + linkedText(draft) : RESUME_REQUEST;
}

const fill = (text, from, to) => text.split(from).join(to);

// DirectorLaunch's prompt. `agent` is the launch's agent (claude or codex); `pace` and `modelPlan` come from the draft (or defaults).
export function buildDirectorPrompt({ agent, engine, project, run, request, briefSeeded = true, pace = DEFAULT_PACE, modelPlan = "recommended" }) {
  if (!["claude", "codex"].includes(agent)) throw new Error("unsupported agent");
  if (!String(request || "").trim()) throw new Error("empty request");
  const sections = [PROMPT_DATA.launch[pace], PROMPT_DATA.build[`${pace}|${agent}|${modelPlan}`]].filter((s) => typeof s === "string").map((s) => s + "\n").join("");
  let head = fill(PROMPT_DATA.head, "@@BRIEF@@", briefSeeded ? PROMPT_DATA.seededBrief : PROMPT_DATA.missingBrief);
  head = fill(fill(fill(head, "@@ENGINE@@", engine), "@@PROJECT@@", project), "@@RUN@@", run);
  const tail = fill(fill(fill(fill(PROMPT_DATA.tail, "@@ENGINE@@", engine), "@@PROJECT@@", project), "@@RUN@@", run), "@@REQUEST@@", request);
  return head + sections + tail;
}

// Everything a resume needs from the run's files: the prompt for `agent` on this project, run and engine
export function resumePrompt({ agent, engine, project, run, draft, sources, questions, briefSeeded, settingsPace = DEFAULT_PACE }) {
  return buildDirectorPrompt({ agent, engine, project, run, request: resumeRequest(draft, sources, questions), briefSeeded, pace: draft ? draft.pace : settingsPace, modelPlan: draft ? draft.modelPlan : "recommended" });
}
