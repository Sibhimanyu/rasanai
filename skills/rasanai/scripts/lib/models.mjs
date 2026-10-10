// Model-adaptive prompting. The goal never changes (the most ambitious yet professional, premium film);
// what changes with the model that runs a member is the wording and the scaffolding around it:
// how hard the show-off ask is pushed, whether the job arrives as a checklist or as latitude, whether the
// output files and the check come first, which model-specific habits to guard against.
//
//   detectModel()                      -> { model, harness, source }   (RASANAI_MODEL, then env/config hints, else "unknown")
//   profileFor(modelId, harness?)      -> a profile (family, tier, harness, delegation, push, structure, examples, ...)
//   adapt({ role, text, dare, profile }) -> the role prompt with a model-specific preamble, addendum and dare
//   tierFor(role, profile)             -> { min, prefer, ok, fast, model, effort }  who may take the role
//   dispatchFor(role, key, desc, file, profile, plan) -> the line the Director runs to dispatch a member
//
// The per-model addenda live in agents/_models/<name>.md (claude-opus, claude-sonnet, claude-haiku, gpt, other).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SKILL_DIR } from "./common.mjs";

const MODELS_DIR = path.join(SKILL_DIR, "agents", "_models");

// ---------------------------------------------------------------- profiles
// push: how hard the show-off ask is made ("explicit" = said plainly and again at the end; "framed" = turned into steps)
// structure: freeform | checklist | contract (outputs and check first, numbered steps)
// examples: none | worked (a worked mini-example of the output) ; latitude: high | medium | low
// verbosity: what to hold the model to in its own prose
const BASE = {
  "claude-opus": { family: "claude", tier: "frontier", harness: "claude-code", delegation: "agent-tool", push: "explicit", structure: "freeform", examples: "none", latitude: "high", verbosity: "tight", addendum: "claude-opus",
    strengths: ["invents well when pushed: story devices, choreography, 3D blocking", "holds a whole score or a film's continuity in mind", "reads a render and finds what is wrong"],
    pitfalls: ["without the explicit show-off ask it ships the competent, tidy, forgettable version", "over-explains in its notes and reports", "reaches for effects (glow, bounce, particles) when it means ambition"] },
  "claude-sonnet": { family: "claude", tier: "strong", harness: "claude-code", delegation: "agent-tool", push: "framed", structure: "checklist", examples: "worked", latitude: "medium", verbosity: "tight", addendum: "claude-sonnet",
    strengths: ["a fast, careful executor of a well-specified job", "follows contracts and numbers exactly", "good at its own fix passes when told to look"],
    pitfalls: ["takes the safe reading of an open brief", "stops after the first version that passes the check", "under-uses the score's numbers unless made to write them down first"] },
  "claude-haiku": { family: "claude", tier: "fast", harness: "claude-code", delegation: "agent-tool", push: "framed", structure: "checklist", examples: "worked", latitude: "low", verbosity: "terse", addendum: "claude-haiku",
    strengths: ["quick, cheap page reading and fact gathering", "tidy structured notes"],
    pitfalls: ["thin on judgement and taste", "drops sources when a page is long", "will smooth over what it could not verify"] },
  "claude-fable": { family: "claude", tier: "frontier", harness: "claude-code", delegation: "agent-tool", push: "explicit", structure: "freeform", examples: "none", latitude: "high", verbosity: "tight", addendum: "claude-opus",
    strengths: ["frontier invention and long-horizon continuity"], pitfalls: ["same as Opus: needs the show-off ask; keep craft over effects"] },
  "gpt-frontier": { family: "gpt", tier: "frontier", harness: "codex", delegation: "codex-exec", push: "explicit", structure: "contract", examples: "worked", latitude: "high", verbosity: "terse", effort: "high", addendum: "gpt",
    strengths: ["decisive, thorough implementer that runs its own commands and fixes until the check is green", "strong at precise, numeric timing and long files", "good at tooling and verification loops"],
    pitfalls: ["reads a brief literally and lands on literal minimalism: a clean, safe, under-designed frame", "over-engineers: helper layers, abstractions and config nobody asked for", "asks a clarifying question when it should decide", "returns a diff or an outline instead of the whole file", "stops at the first passing check without looking at the render"] },
  "gpt-strong": { family: "gpt", tier: "strong", harness: "codex", delegation: "codex-exec", push: "explicit", structure: "contract", examples: "worked", latitude: "medium", verbosity: "terse", effort: "high", addendum: "gpt",
    strengths: ["a reliable executor of a contract", "runs commands and iterates on a check"],
    pitfalls: ["literal minimalism", "over-engineering", "clarifying questions", "diffs instead of whole files", "does not look at its renders unless told to"] },
  "gpt-fast": { family: "gpt", tier: "fast", harness: "codex", delegation: "codex-exec", push: "framed", structure: "contract", examples: "worked", latitude: "low", verbosity: "terse", effort: "low", addendum: "gpt",
    strengths: ["cheap, fast gathering"], pitfalls: ["thin judgement: gathering roles only", "literal reading", "unsourced facts when pressed for time"] },
  other: { family: "other", tier: "strong", harness: "other", delegation: "none", push: "explicit", structure: "contract", examples: "worked", latitude: "medium", verbosity: "terse", addendum: "other",
    strengths: ["unknown: assume a capable executor"], pitfalls: ["unknown: assume it takes the safe reading, may not look at renders and may ask questions: so the contract and the push are both explicit"] },
};

export function profileFor(modelId, harnessHint) {
  const id = String(modelId || "unknown").toLowerCase().trim();
  let key = "other", name = id;
  if (/opus/.test(id)) key = "claude-opus";
  else if (/fable/.test(id)) key = "claude-fable";
  else if (/sonnet/.test(id)) key = "claude-sonnet";
  else if (/haiku/.test(id)) key = "claude-haiku";
  else if (/^claude|anthropic/.test(id)) key = "claude-sonnet"; // a Claude of unknown size: the safe middle (structure + the push)
  else if (/gpt|^o\d|codex|sol\b|openai/.test(id)) {
    if (/mini|nano|lite|spark|fast/.test(id)) key = "gpt-fast";
    else if (/codex/.test(id) && !/5\.[5-9]|sol|pro/.test(id)) key = "gpt-strong";
    else if (/gpt-?5\.[5-9]|sol|pro|gpt-?[6-9]|^o\d|5\.\d\d/.test(id)) key = "gpt-frontier";
    else key = "gpt-strong";
  }
  const b = BASE[key];
  const p = { id: name, key, ...b };
  if (harnessHint && harnessHint !== p.harness && p.family === "other") { p.harness = harnessHint; p.delegation = harnessHint === "codex" ? "codex-exec" : harnessHint === "claude-code" ? "agent-tool" : "none"; }
  p.pitfalls = [...b.pitfalls]; p.strengths = [...b.strengths];
  return p;
}

// ---------------------------------------------------------------- detection
function codexConfigModel() {
  try {
    const t = fs.readFileSync(path.join(process.env.CODEX_HOME || path.join(os.homedir(), ".codex"), "config.toml"), "utf8");
    const m = t.match(/^\s*model\s*=\s*"([^"]+)"/m);
    return m ? m[1] : null;
  } catch { return null; }
}

export function detectModel(env = process.env) {
  const harness = (id) => (env.CODEX_HOME || env.CODEX_SANDBOX || env.CODEX_THREAD_ID || env.CODEX_CI || env.CODEX_MANAGED_BY_NPM || /^(gpt|o\d|codex)/i.test(id || "") ? "codex" : env.CLAUDECODE || env.CLAUDE_CODE || env.CLAUDE_CODE_ENTRYPOINT || /claude/i.test(id || "") ? "claude-code" : "other");
  if (env.RASANAI_MODEL) return { model: env.RASANAI_MODEL, harness: harness(env.RASANAI_MODEL), source: "RASANAI_MODEL" };
  const am = env.ANTHROPIC_MODEL || env.CLAUDE_MODEL;
  if (am) return { model: am, harness: "claude-code", source: "ANTHROPIC_MODEL" };
  if (env.CLAUDECODE || env.CLAUDE_CODE || env.CLAUDE_CODE_ENTRYPOINT) return { model: "claude-unknown", harness: "claude-code", source: "CLAUDE_CODE (model not named: say it with --model or RASANAI_MODEL)" };
  if (env.CODEX_HOME || env.CODEX_SANDBOX || env.CODEX_THREAD_ID || env.CODEX_CI || env.CODEX_MANAGED_BY_NPM) {
    return { model: env.CODEX_MODEL || codexConfigModel() || "gpt-unknown", harness: "codex", source: "CODEX env" };
  }
  return { model: "unknown", harness: "other", source: "no hint (say it with --model or RASANAI_MODEL)" };
}

// ---------------------------------------------------------------- who may take a role
const GATHER = new Set(["product-researcher", "brand-researcher", "brand-film-analyst", "screens-researcher", "local-scout"]);
const ORDER = { fast: 0, strong: 1, frontier: 2 };
const FAST_ALIAS = { claude: "sonnet", gpt: null, other: null };
export function tierFor(role, profile) {
  // the concept critic is a quick, cheap pre-flight read of the script and look against the brief: Sonnet is the right model (never the session's Opus);
  // so are the move juror (binary gates and pairwise picks on fixed cards) and the move sketcher (a grey-box rough of a card already written)
  const gather = GATHER.has(role) || ["concept-critic", "move-juror", "move-sketcher"].includes(role);
  const min = gather ? "fast" : "strong";
  // the roles where the film is won or lost: a frontier model when one is running the session
  const prefer = gather ? "fast" : ["motion-director", "scene-animator", "film-builder", "move-inventor", "frame-designer", "treatment-writer", "script-writer", "critic"].includes(role) ? "frontier" : "strong";
  const ok = ORDER[profile.tier] >= ORDER[min];
  const useFast = gather && profile.tier !== "fast";
  // a fast tier is a cheaper model of the same family: on Claude a smaller model, on Codex the same model at low effort
  const model = useFast ? FAST_ALIAS[profile.family] || null : null;
  const effort = profile.family === "gpt" ? (gather ? "low" : prefer === "frontier" ? "high" : "medium") : null;
  return { role, min, prefer, ok, fast: useFast, model, effort, note: ok ? undefined : `${role} never goes below ${min}: run it on a ${min} model or the session's` };
}

// ---------------------------------------------------------------- adapt
const read = (f) => { try { return fs.readFileSync(path.join(MODELS_DIR, f), "utf8").trim(); } catch { return ""; } };
// a section of an addendum: "## Preamble", "## <role>" (the part for one role), "## Always"
function part(md, name) {
  const m = md.match(new RegExp(`(?:^|\\n)## ${name.replace(/[-.]/g, "\\$&")}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`));
  return m ? m[1].trim() : "";
}
// words that talk about one model: the same goal, said to whoever is running
function neutralize(s, profile) {
  if (profile.key === "claude-opus" || profile.key === "claude-fable") return s;
  return s
    .replace(/, and Opus is genuinely good at it:/g, ", and you are able to:")
    .replace(/where Opus can show what it does that a template can't/g, "where you can show what a template can't")
    .replace(/Opus-level motion/g, "Top-studio motion")
    .replace(/Opus plans space well when it's asked to; unasked, it never leaves the flat page/g, "Models plan space well when asked to; unasked, they never leave the flat page")
    .replace(/Claude's unpushed default is/g, "The unpushed default is")
    .replace(/Claude does its best motion work when it's told to show off/g, "The best motion work comes when the maker is told to show off")
    .replace(/Left to its defaults, Claude plans/g, "Left to its defaults, a model plans");
}
function section(text, label) { // "**Your outputs** (write only these)\n\n- `x`\n" -> the bullet lines
  const m = text.match(new RegExp(`\\*\\*${label}[^\\n]*\\n\\n?((?:- [^\\n]*\\n?)+)`));
  return m ? m[1].trim() : "";
}

export function adapt({ role, text, dare, profile }) {
  const p = profile || profileFor("unknown");
  const md = read(`${p.addendum}.md`);
  const T = tierFor(role, p);
  const pre = [];
  // the preamble: first thing the member reads
  const head = part(md, "Preamble");
  if (head) pre.push(head);
  if (p.structure === "contract") {
    const outs = section(text, "Your outputs"), chk = (text.match(/\*\*Check\*\*[^`]*`([^`]+)`/) || [])[1];
    if (outs || chk) pre.push(["**Start here.** The files you must write, and the command that decides you are done:", outs, chk ? `Check (run it yourself, fix what it names, repeat until it exits 0): \`${chk}\`` : ""].filter(Boolean).join("\n\n"));
  }
  const roleBits = part(md, role);
  const always = part(md, "Always");
  const body = neutralize(text, p);
  const tail = [];
  if (roleBits) tail.push(`## How to work on this job (${p.id})\n\n${roleBits}`);
  if (always) tail.push(`## How you work (${p.id})\n\n${always}`);
  if (T.effort && p.family === "gpt") tail.push(`Reasoning effort for this job: **${T.effort}**${T.effort === "high" ? ": this is creative work; think through the whole shot or the whole story before you write the file" : ""}.`);
  const d = dare ? `## Before you start\n\n${neutralize(dare, p)}${part(md, "Dare") ? "\n\n" + part(md, "Dare") : ""}`.trim() : "";
  return [pre.join("\n\n"), pre.length ? "---" : "", body, ...tail, d].filter(Boolean).join("\n\n") + "\n";
}

// ---------------------------------------------------------------- dispatch line, per harness
export function dispatchFor(profile, { desc, file, role, tier }) {
  const T = tierFor(role, profile);
  const msg = `Read ${file} in full, then do the job it describes. Your Dispatch context is at its end.`;
  if (profile.harness === "codex") {
    const eff = T.effort ? ` -c model_reasoning_effort=${T.effort}` : "";
    const m = profile.id && !/unknown/.test(profile.id) ? ` -m ${profile.id}` : "";
    return `codex exec${m}${eff} -s danger-full-access "${msg}" < /dev/null > ${file.replace(/\.md$/, ".log")} 2>&1 &   # background; ${desc}`;
  }
  if (profile.harness === "claude-code") {
    const model = T.fast && T.model ? `, model: "${T.model}"` : "";
    return `Agent(description: "${desc}", prompt: "${msg}", run_in_background: true${model})`;
  }
  return `Run a fresh agent session with the prompt: "${msg}"  (${desc}); if you can't, do it yourself in sequence (--lean)`;
}
