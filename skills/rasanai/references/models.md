# Models: one goal, different wording

The goal never changes: the most ambitious yet professional, premium film the model running the job can make. What changes is **how the crew asks for it**. Models fail differently under the same prompt, so each crew member's prompt (`crew.mjs brief`) is adapted to the model that will run it: a preamble, a per-model addendum from `agents/_models/`, and the show-off dare worded for that model. The role file, the Dispatch context, the check and the bar are identical for everyone.

Code: `scripts/lib/models.mjs` (`detectModel`, `profileFor`, `adapt`, `tierFor`, `dispatchFor`).

## The profiles

| Profile | Matches | Tier | Harness | Push | Structure | What the prompt adds |
|---|---|---|---|---|---|---|
| `claude-opus` | any `opus` | frontier | claude-code (Agent tool) | explicit | freeform, high latitude | the explicit show-off ask, craft guardrails (ambition is craft, remove before adding), reel moment named first, short notes |
| `claude-fable` | `fable` (5.1 ...) | frontier | claude-code | explicit | freeform | same as Opus |
| `claude-sonnet` | any `sonnet`, any unnamed Claude | strong | claude-code | framed | checklist, worked example | numbered steps, the target numbers restated first, a pose table with a worked example, two improvement passes after looking at the renders |
| `claude-haiku` | any `haiku` | fast | claude-code | framed | checklist | gathering roles only: sources on every line, `unverified` over invention, fill every heading |
| `gpt-frontier` | `gpt-5.5+`, `gpt-5.6-sol`, `pro`, `o*` | frontier | codex (`codex exec`) | explicit | contract | outputs and the check command first; never ask, decide; run commands itself; whole files, no diffs; look at renders; guard against literal minimalism and over-engineering; reasoning effort high on creative roles |
| `gpt-strong` | `gpt-5`, `gpt-5.2`, `gpt-5-codex` | strong | codex | explicit | contract | same, at medium effort on non-reel roles |
| `gpt-fast` | `mini`, `nano`, `lite` | fast | codex | framed | contract | gathering roles only |
| `other` / unknown | anything else | strong (assumed) | other | explicit | contract | the safe default: contract first, never ask, whole files, look at renders, an explicit ambition ask |

A profile also carries `delegation` (`agent-tool`, `codex-exec`, `none`), `latitude`, `examples`, `verbosity`, and `strengths[]` / `pitfalls[]` (what the addendum is written against).

### Roles by tier

Gathering roles (`product-researcher`, `brand-researcher`, `screens-researcher`, `local-scout`) may run on a fast tier: a smaller Claude (`sonnet`), or under Codex the same model at `low` reasoning effort. Every other role (the researchers that judge, the writers, the editor, the Motion Director, frame designers, scene animators, critics) is **never below strong**; the creative and judging ones prefer frontier. `tierFor(role, profile)` returns `{ min, prefer, ok, fast, model, effort }`; if `ok` is false the Director runs that role on the session's model, or reports it.

## Detection

`detectModel()` checks, in order: `RASANAI_MODEL` (the override); `ANTHROPIC_MODEL`; the Claude Code markers (`CLAUDECODE`, `CLAUDE_CODE_ENTRYPOINT`: a Claude whose size is unknown, treated as `claude-sonnet`, the safe middle); the Codex markers (`CODEX_HOME`, `CODEX_SANDBOX`, `CODEX_THREAD_ID`: the model from `CODEX_MODEL` or `~/.codex/config.toml`); else `unknown`. The Director knows its own model better than any env var, so at setup it should say it: `--model <id>` on `crew.mjs plan` and `brief` wins over everything and is stored in the plan.

Override: `--model claude-opus-5-5`, `RASANAI_MODEL=gpt-5.6-sol`, or `--model sonnet` to brief a member *for a different model than the Director* (for example, a gathering member that will run on Sonnet).

## Under Codex

Codex has no Agent tool. The crew runs the same way, with the same prompt files and the same checks:

- Plan and brief as usual (`crew.mjs plan --model gpt-5.6-sol`, `crew.mjs brief`). The brief prints a `codex exec` dispatch line instead of an `Agent(...)` call.
- Members in a phase run in parallel as background processes: `codex exec -m <model> -c model_reasoning_effort=high -s danger-full-access "Read <prompt file> in full, then do the job it describes..." < /dev/null > <prompt>.log 2>&1 &`. Then wait for them, read the logs only if one fails, and accept each with `crew.mjs check`.
- The sandbox: `--full-auto` is not accepted by every Codex version (0.149 rejects it), and `-s workspace-write` blocks headless Chrome on macOS, which the strips, `obey.mjs` and the 3D gate need (measured: the member spent most of its run building a screenshot workaround). Members run with `-s danger-full-access` in the workspace; tell the user once that this is what the crew's Codex members run with.
- The model must be one the account accepts: if `codex exec` rejects the configured default, pass `-m` explicitly (the user's account takes `gpt-5.6-sol`).
- If `codex exec` isn't available (or the Director is itself an agent that can't spawn processes), run the crew **`--lean`** and the members in sequence in the same session, each from its prompt file, with `crew.mjs check` between them.
- A member under Codex has no console and no chat. The prompt tells it so; the Director asks the user in the console as ever.

## Notes for the Director itself

`SKILL.md` is read by both families, so the following applies to whoever reads it:

- **On Claude (any size):** the push to show off is the bar; keep the questions in the console only; use the Agent tool to dispatch members; use a smaller model for gathering roles only. On Sonnet, do the structured steps in the order written rather than improvising, and look at the renders before accepting.
- **On GPT / Codex:** do not stop to ask the user in chat: the five calls are the console's. Run every command yourself (setup, the checks, the strips) and read the output before claiming anything passed. Write whole files. Your risk is literal minimalism, so when a creative member's work is correct and plain, send it back with the show-off ask rather than accepting it. Do not over-build the orchestration: the scripts already do the deterministic work.
- **Whatever the model:** the gates (anti-slop, the motion contract, the sound check) are the same and judge the same way. A model adapts the prompt, never the bar.

## GPT's creative loop, and the design desk

A real Codex run (gpt-5.6-sol) produced a clean but small, safe, placeholder-filled scene. So GPT profiles get, in the scene-animator and frame-designer prompts, a concrete worked "reel-quality" example (hero at least 50% of the frame height, real content from the research, every hold motivated, one spectacle beat) and must write a self-critique against the critic's rubric before handing back; a green check is not the finish line. The design-system designer and design researcher get their own short sections (`agents/_models/gpt.md`): gate until exit 0, look at the specimen, no placeholder fonts, no single-reference blends, 8 sources before the library. `crew.mjs model [--kv]` prints the model and harness (setup.sh passes them on as MODEL= and HARNESS=).

## The person's model choice wins (v3)

`allocate({ role, profile, policy, requested })` honors `policy.resources.model.choice`: when set, no role is routed to a different model (no smaller-model alias for gathering roles, no escalation on repair) and a `requested` premium model is recorded as `requested_ignored`, never used. Recommended routing is a recommendation among models already authorized for the run; it never adds a model or provider and never silently downgrades a role to hit a cost target. `modelPlanWording({ plan, pace })` returns the Director wording per plan for the Swift prompt to mirror. See `budget-context.md`.
