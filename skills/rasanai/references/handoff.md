# Handoff to HyperFrames

## decisions.json

Written by the agent at the Plan step of a single motion unit (references/workflows/routes/motion-graphics.md, "Single units") in the run's scratch dir, consumed by `scripts/handoff.mjs`.

```json
{
  "project": "slow-pour-reel",
  "route": "motion-graphics",
  "category": "kinetic-type",
  "content": "Slow Pour",
  "sub": "Brewed like it matters",
  "message": "Coffee made with patience",
  "destination": "reels",
  "aspect": "9:16",
  "length_s": 6,
  "language": "en",
  "audience": "coffee drinkers on Instagram",
  "concept": { "title": "The pour line", "text": "A single stream of coffee draws the frame..." },
  "look": { "preset": "code-editorial" },
  "motion": ".rasanai/<run>/motion.md",
  "keyframes": ".rasanai/<run>/keyframes.json",
  "assets": [{ "path": "brand/logo.svg", "role": "closes the piece" }, "shoot for warm morning light"],
  "music": { "path": ".rasanai/<run>/music/.media/audio/bgm/bgm_001.wav", "title": "Warm Unhurried Acoustic Morning" },
  "confirmed": { "destination": true, "aspect": true, "language": false, "look": false },
  "receipts": {
    "stated": ["content: Slow Pour / Brewed like it matters", "motion: Soft Drift (picked B)"],
    "agent": ["look: code-editorial; you left it to me in your request", "length 6s (from the keyframes)"]
  }
}
```

| Field | Required | Meaning |
|---|---|---|
| `project` | yes | kebab-case; the project is `videos/<project>` |
| `content` | yes | headline, verbatim |
| `message` | yes | the one thing the piece must say (BRIEF `message`) |
| `motion` | yes | path to the locked motion.md |
| `route` | no | `motion-graphics` (default), `general-video`, `product-launch-video`, `faceless-explainer`, `music-to-video`, `pr-to-video` |
| `category` | no | for motion-graphics: `kinetic-type`, `stat`, `charts`, `logo-reveal`, `lower-thirds`, `maps`, `webpage`, `news`, `tweet`, `asset-fusion`. Passed to the planner so it doesn't re-decide. |
| `sub` | no | secondary line (tagline, URL), verbatim |
| `destination` | no | free text (website, youtube, x-feed, reels, tiktok, story...) |
| `aspect` | no | 16:9 / 9:16 / 1:1 / 4:5 / `WxH` / aliases (website, reels, feed...). Normalized to `WxH`; default 1920x1080. |
| `length_s` | no | seconds. If missing: the sum of the approved keyframe shots, else 6. |
| `language`, `audience` | no | BRIEF fields; language defaults to `en` |
| `concept` | no | `{title, text}` → BRIEF `## Intent` and DISPATCH |
| `look` | no | `{ "preset": "<frame-preset id>" }`, `{ "frame": "<a design direction's frame.md / your spec>" }` or `{ "design_md": "DESIGN.md", "mode": "dark" }` (the project's brand); fonts are staged for frame and design_md |
| `direction` | no | a compiled direction folder (`direction.mjs compile --out`): installs DIRECTION.md, its summary goes into frame.md and DISPATCH.md |
| `keyframes` | no | path to the approved keyframes.json, or null when the Key poses step was skipped |
| `assets` | no | strings are notes; `{path, role}` objects are files copied into `videos/<project>/assets/` |
| `music` | no | `{path, title}`: the chosen music bed (from music.mjs or the user's own file). Copied as `assets/music-<name>` (never overwriting a user file), and for motion-graphics placed by handoff in the host root as `<audio id="music-bed">` for the full length with a short fade in/out; DISPATCH.md tells the build not to add another. Other routes are told to place it as one full-length clip. |
| `confirmed` | no | which preference-backed answers the user actually confirmed: `destination`, `aspect`, `language`, `look`. Only those are recorded as HyperFrames preferences. |
| `receipts` | no | `stated` / `agent` lines for BRIEF `## Notes` |

Relative paths resolve against `--workspace` (default: the current directory) first, then the decisions.json folder.

Every input (look, frame spec, asset files, music track, keyframes) is resolved and checked **before** `init`, so a bad path never leaves a half-made project.

**Refusals** (exit 1 with the reason): a missing required field; a missing frame spec, asset or music file; an unknown route or category; a stated `length_s` that differs from the approved keyframes' total by more than 0.05 s (the host root would cut the build); a keyframes `aspect` different from the decisions aspect; keyframes that no longer pass `board.mjs --validate` against this motion.md; an existing project without `--revise`; and on `--revise`, an aspect different from the project's BRIEF.md.

## What handoff.mjs does

1. **Init** (new projects): `npx hyperframes init videos/<project> --non-interactive --example=blank --skill=<route> [--resolution landscape|portrait|square]`. The resolution comes from the aspect; 4:5 has no preset, so it gets the host root size only. It never inits the workspace root, and refuses when the project exists unless `--revise`.
2. **Specs:** `frame.md` (preset `FRAME.md` adopted lowercase, or the user's spec), `motion.md`, `keyframes.json`, and the copied assets.
3. **BRIEF.md** in HyperFrames' canonical format: `workflow`, `flow: automation`, `storyboard: no`, `message`, `destination`, `aspect`, `language`, `length`, `audience`, `style_preset`; then `## Intent`, `## Assets`, `## Customizations`, `## Notes` with the receipts.
4. **Host root** (motion-graphics only): the Builder writes `compositions/index.html`, but `init` leaves a blank root `index.html` that mounts nothing, so `hyperframes check` / `render` would see an empty timeline. handoff replaces the blank root (or its own earlier host) with a host that loads GSAP and mounts `compositions/index.html` as a sub-composition (`data-composition-id` = the project name) for `length` seconds. A root that someone else wrote is never overwritten.
5. **DISPATCH.md**, the addendum for every subagent. For routes other than motion-graphics it carries only the decisions, the motion contract and the check; the motion-graphics overrides and output shape are left out. It covers:
   - the decisions (message, text, category, concept, look);
   - where it overrides the workflow's references (motion vocabulary, root shape, visibility gating);
   - the binding motion contract (length and canvas, durations, eases per class, stagger, holds, bans, GSAP-only, eases that override the builder's allowed list);
   - the Builder's output shape (a templated sub-composition, `#root`, timeline id, no GSAP of its own);
   - "how it should feel";
   - with keyframes, the poses → `shot-plan.json` mapping for `kinetic-type` (scenes, beats, per-segment motion lines); for other categories, pose times go into `beats` and the Builder reads keyframes.json directly; and the per-segment build rule;
   - the obey command.
6. **Preferences:** records the confirmed ones via media-use `prefs.mjs record` (destination, aspect, language; `style_preset` per workflow). It never records defaulted values, and never records `flow` or `storyboard`, which this path doesn't ask.

Its JSON output lists what it wrote, `length_s` and its source, `host_root`, the recorded preferences, and the next step.

## Why the route adopts it without re-asking

- `/hyperframes` state table: "`BRIEF.md` exists → read workflow and flow, execute that workflow, ask no brief questions."
- `/motion-graphics` Step 0 inits only "when `$PROJECT_DIR/hyperframes.json` is absent", so it adopts the prepared `videos/<project>`.
- `/motion-graphics` reads BRIEF.md before its director's single clarifying question, and the brief answers it.
- Its "keep this skill fresh" refresh already happened, because `init` refreshes the installed skills.

## Why DISPATCH.md exists

`/motion-graphics` plans, designs, builds and repairs in subagents:
- Director Part 1: request + schema.
- Director Part 2: draft plan + assets + `catalog-map.md`.
- Builder: `shot-plan.json`, `catalog-map.md`, the category `module.md`, `motion-vocabulary.md`, `builder-contract.md`.
- finalize: the failing gate output.

**None of them reads BRIEF.md.** The workflow's motion vocabulary also defaults to `slide_bottom` = `from({y:150, opacity:0, ease:"power4.out"})`, exactly the banned fade-up-slide. So the orchestrating agent appends DISPATCH.md to each of those dispatches, and obey.mjs verifies the result.

## Revise

`--revise --reopen <steps>` skips init and moves what each reopened step invalidates into `.superseded/<stamp>/`, so `/motion-graphics`' resume table re-enters at plan/design/build instead of the render gate:

| Reopened | Moved aside |
|---|---|
| concept | shot-plan.json, assets/index.md, compositions, snapshots, renders |
| look, motion, keyframes, brief | shot-plan.json, compositions, snapshots, renders |
| music | snapshots, renders (the bed lives in the host root, which is rewritten) |

- `assets/` itself is never moved: it holds the user's own files.
- If the revised decisions have no `keyframes`, an existing `keyframes.json` is moved aside too.
- BRIEF.md, DISPATCH.md, the specs and the host root are rewritten from the new decisions.json. So decisions.json must describe the whole piece: point `motion` / `keyframes` / `look.frame` at the project's existing files for steps that weren't reopened (keep `look.preset` if a preset was used).
- A revised motion.md starts with no waivers.
- After reopening `motion`, re-run `board.mjs` on the kept keyframes against the new motion.md, because the scale may have changed.
- Changing the aspect of an existing project isn't supported (the canvas was set at init); start a new project for that.
