// The Node director prompt (lib/director-launch.mjs) against Swift's: the golden file apps/macos/Tests/StudioCoreTests/Fixtures/
// director-prompt-golden.json holds inputs and the exact prompt DirectorLaunch builds for them (DirectorPromptParityTests rebuilds
// each in Swift). Skipped with a note when the Studio sources are not beside the skill (an installed skill).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildDirectorPrompt, resumePrompt, loadDraft, RESUME_REQUEST, PROMPT_DATA } from "../lib/director-launch.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GOLDEN = path.join(HERE, "..", "..", "..", "..", "apps", "macos", "Tests", "StudioCoreTests", "Fixtures", "director-prompt-golden.json");

export default async function ({ ok, tmp }) {
  ok("director-launch: the shared data carries the launch prompt, request and texts", PROMPT_DATA.version === 1 && PROMPT_DATA.head.includes("@@ENGINE@@") && PROMPT_DATA.tail.includes("@@REQUEST@@") && /^Resume this existing run/.test(RESUME_REQUEST) && Object.keys(PROMPT_DATA.level).length === 3);
  let refused = 0;
  try { buildDirectorPrompt({ agent: "custom", engine: "/e", project: "/p", run: "/r", request: "x" }); } catch { refused++; }
  try { buildDirectorPrompt({ agent: "claude", engine: "/e", project: "/p", run: "/r", request: " \n " }); } catch { refused++; }
  ok("director-launch: an unsupported agent and an empty request are refused, like Swift", refused === 2);
  const dollar = buildDirectorPrompt({ agent: "claude", engine: "/e$&", project: "/p", run: "/r", request: "a $& $1 $(not a shell)", pace: "thorough" });
  ok("director-launch: paths and the request go in verbatim (no replacement patterns)", dollar.includes("/e$&/SKILL.md") && dollar.endsWith("a $& $1 $(not a shell)"));
  if (!fs.existsSync(GOLDEN)) { console.log("note  director-launch: the Studio golden file is not beside this skill, parity cases skipped"); return; }
  const golden = JSON.parse(fs.readFileSync(GOLDEN, "utf8"));
  ok("director-launch: the golden file has cases", golden.cases.length >= 8);
  for (const c of golden.cases) {
    // the project folder the draft lives in, so loadDraft and the sources list read real files like director.mjs does
    const project = path.join(tmp, "launch-" + c.name);
    fs.mkdirSync(path.join(project, "assets", "sources"), { recursive: true });
    if (c.input.draft) fs.writeFileSync(path.join(project, "rasanai-brief.json"), JSON.stringify(c.input.draft));
    for (const s of c.input.sources) fs.writeFileSync(path.join(project, "assets", "sources", s), "");
    const draft = loadDraft(project);
    const sources = c.input.sources.map((s) => path.join(project, "assets", "sources", s));
    const prompt = resumePrompt({ agent: c.input.agent, engine: golden.engine, project: golden.project, run: golden.run, draft, sources, questions: c.input.questions, briefSeeded: c.input.briefSeeded });
    const at = prompt === c.prompt ? -1 : [...prompt].findIndex((ch, i) => ch !== c.prompt[i]);
    ok(`director-launch: Node builds Swift's exact prompt (${c.name})`, prompt === c.prompt, `first difference at ${at}: node ${JSON.stringify(prompt.slice(Math.max(0, at - 40), at + 80))} swift ${JSON.stringify(c.prompt.slice(Math.max(0, at - 40), at + 80))}`);
  }
}
