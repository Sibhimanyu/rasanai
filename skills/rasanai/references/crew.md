# The crew: RasanAI's agents

A film is too much work, and too many kinds of work, for one context. Researching a product properly takes dozens of page reads. A script is better written by someone with nothing else on their mind. Eight scenes animated well take eight full attentions. A critic who watched the film being made can't see it fresh. So RasanAI runs a **crew**: one Director and sixteen roles, each with a brief (`agents/<role>.md`), inputs and outputs on disk, and a check that decides when its work is accepted.

The roles exist where one of three things is true, and nowhere else:

1. **The work is parallel.** Research tracks, the three scripts, key frames, the scenes of a long film: independent pieces done at the same time. Animation is parallel only when the film is long: a short film (45 s or less, or a single-feature launch) is built by ONE film builder, because its beats are not independent (objects carry across the cuts).
2. **The work needs a whole context.** Reading a product's site, help center and code; writing one script well; animating one scene with its full technique recipes. Done inline, each would crowd out everything the Director needs to remember.
3. **The work needs independence.** Critics and the script editor have no stake in what they judge and no memory of how it was made.

Everything deterministic stays a script (`story.mjs check`, `sound.mjs fit`, `obey.mjs`, `slop.mjs`, `crew.mjs check`). Everything continuous across the film has **one owner**: the truth (the research lead), the motion (the Motion Director), the user (the Director).

## Who's who

| Desk | Role | When | How many | Model |
|---|---|---|---|---|
| Research | `product-researcher`: features, releases, real numbers, users' words, what's no longer true | during the Brief | 1 | fast is fine |
| | `brand-researcher`: the real logo, colours, type, voice, and the brand's own motion, as a DESIGN.md | during the Brief | 1 | fast is fine |
| | `screens-researcher`: real screens and states, the flows, a measured UI kit | during the Brief | 1 | fast is fine |
| | `precedent-researcher`: the brand's past launch films and the category's best, measured shot by shot | during the Brief (public brands) | 1 | session |
| | `local-scout`: the product's code on this computer, **with the user's permission** | during the Brief | 1 per approved folder | fast is fine |
| | `research-lead`: one truth sheet, one claims ledger, one brand, one asset kit, a one-page briefing | after the desk | 1 | session |
| | `brand-film-analyst`: reads the brand's own film frames and writes `brand-film/FILM-STYLE.md` (the film grammar); branded launch / promo / brand films only | during the Brief, after the Director runs `brandfilm.mjs` | 1 | fast is fine (Sonnet) |
| Design | `design-researcher`: the subject's own visual world, its category's clichés, 8 to 12 library references that fit (`research/design.md`, `design-refs.json`) | during the Brief, parallel with research | 1 | session |
| | `design-system-designer`: ONE bespoke design system for the chosen story, blended from 2 to 4 library references (`design/<label>/DESIGN.md`, `recipe.json`, `blend.json`); with a brand, Sure is the brand extended | after the story is chosen (Look) | 3 (Sure, Bold, Wild); a lyric video: 1, from the chosen treatment | session |
| Writers' room | `script-writer`: one script around one device | Story | 3 (Sure, Bold, Wild) | session |
| | `treatment-writer`: one treatment of a song (concept, style bible, motifs, a plate per lyric section, every line an idea) | Story, `music-to-video` only | 3 (Sure, Bold, Wild), instead of the script writers | session |
| | `visual-writer`: one visual treatment of a presenter film's speech (the layout of the person, a plate and camera per beat, graphics, an `idea`) | Story, `presenter` only | 3 (Sure, Bold, Wild), instead of the script writers | session |
| | `script-editor`: the hostile reader; line edits, verdicts, a recommendation | Story | 1 | session |
| Motion | `motion-director`: the score (spine, motif, energy, the depth plan, every shot in 2D or 3D, every seam), then the seam pass | Animatic, then Build | 1, twice | session |
| Art | `frame-designer`: the key frames, from the score, in the look, with the real product | Animatic | 1 per 2 scenes (5 at most) | session |
| Animation | `film-builder`: the whole film in one pass (root, every beat, every carrier), from the plan; on a long film (key `lead`) the root and the carriers only | Build | 1 | session |
| | `scene-animator`: one scene of a long film (2D, 3D or hybrid), built around the lead's carriers, its seams moving, its motion seen and fixed | Build (long films only) | 1 per scene | session |
| Review | `critic`: lenses `frames`, `motion`, `film`, `grounding`; default reject | Animatic, Build, Final | 1 per lens and round | session |

Model column: see `models.md` (the prompt each member gets adapts to the model that runs it; `crew.mjs plan --model <id>`). The design desk is described in `design-desk.md`. "Session" means the Director's own model: creative and judging work is never downgraded. "Fast is fine" means a faster model may run it when the harness lets you choose (in Claude Code: `model: "sonnet"` on the Agent call).

## The flow, against the five calls

```
Brief ── push brief ──────────────────────────────────────────────── user reads, confirms
   └─ local-find → (console ask: may I read these folders?) ─┐
   └─ research desk, in parallel, in the background ─────────┴─→ research-lead
Story ── story.mjs pick → 3 writers in parallel → pitches → story.mjs check → editor → 1 rewrite round → push story
Story (a presenter film) ── presenter.mjs key + beats, reel.mjs scan → 3 visual writers in parallel → presenter.mjs check each → push story; the pick is presenter/plan.json
Story (a song) ── lyrics.mjs align + audio → 3 treatment writers in parallel → treatment.mjs check each → push story; the pick is story/chosen-treatment.json
Brand film (branded launch / promo / brand films) ── brandfilm.mjs find → fetch → frames → measure → card → brand film analyst fills FILM-STYLE.md → push brand with it (references/brand-film.md); the Look then IS that grammar
Style gate ── after the key frames and after the first draft: brandfilm.mjs compare --ref grammar.json --ours <frames|draft> (fail: fix before going on); numbers into decisions and a short note to the user
Look ─── Director art-directs from the briefing (brand verdict, house grammar) → push look
Look (a song) ─ none: the chosen treatment's style bible is the look (DIRECTION.md); frame.md is the nearest preset
Animatic ─ scenes (treatment.mjs scenes for a song: one per plate, the real track untouched) + music fit → Motion Director (score) → frame designers in parallel → frames critic → push animatic
Build ── video.mjs write → crew.mjs storyboard (the plan → STORYBOARD.md, BUILD.md) → frame-packets + inject
   direct (≤ 45 s, single-feature launch):
         → ONE film builder (root, every beat, every carrier) → assemble + video.mjs carriers → motion-gate.mjs (code)
         → draft render → motion-gate.mjs (frames) → motion + grounding critics → fixes back to the builder (2 rounds at most)
   long (> 45 s, or --deep):
         → lead builder (root + carriers) → scene animators in parallel → assemble + video.mjs carriers → Motion Director (seam pass)
         → draft render → motion-gate.mjs → motion + grounding critics → fixes routed to each scene's animator → film critic
Final ── push render with the critics' scores; findings left over are fix-or-waive
```

The user is never kept waiting by the crew. Research starts the moment the brief is pushed and runs while the user reads it. Every member posts what it's doing to the console feed (and the plugin's hook shows every delegation as "Delegating: <description>"), so the console never goes quiet.

## Dispatching a member

```bash
node $SKILL_DIR/scripts/crew.mjs plan --run "$RUN" --route <route> --subject "<name>" [--url <url>] [--public] [--local "<approved dirs>"] [--may-run] [--scenes N] [--length s] [--project videos/<name>] [--lean] [--brand "<brand>"] [--kind launch|promo|brand] [--pace fast]
node $SKILL_DIR/scripts/crew.mjs brief --run "$RUN" --role <role> [--key <k>] [--project videos/<name>]    # writes the prompt file, prints the Agent call
# dispatch: Agent(description: <printed>, prompt: "Read <prompt file> in full, then do the job it describes.", run_in_background: true[, model: "sonnet" for fast roles])
node $SKILL_DIR/scripts/crew.mjs check --run "$RUN" --role <role> [--key <k>] [--project videos/<name>]    # exit 0 = accepted
node $SKILL_DIR/scripts/crew.mjs status --run "$RUN"                                                     # who is planned, dispatched, accepted
```

- **The prompt is a file.** `brief` writes the shared crew rules (`agents/_crew.md`), the role, and a Dispatch context naming every input that exists (and which are missing), every output, and the check command. The member starts from exactly that, never from the conversation. Hand it the file path; don't paraphrase it.
- **Accept on the artifact, not the message.** A member is done when `crew.mjs check` exits 0. A failed check → send the problems back to the same member (`SendMessage` to it when it's still addressable, with its context intact; otherwise a fresh dispatch of the same prompt plus the problems). Twice at most, then do it yourself or report it.
- **Re-plan when you know more.** Run `plan` again once the scene count, the project or the approved folders are known; it keeps what it knew.
- **After a compaction**, `crew.mjs status` says where every member stands.
- **No delegation available** (another harness, or the user said no subagents): follow the same role files yourself, in order, one at a time. The files and checks are the same; only the parallelism is lost. `--lean` plans the smallest crew (no precedent, no writers' room, one frame designer, one critic).

## Push them: show off

Claude does its best motion work when it's told to show off; left unpushed it produces the clean, tidy, forgettable default. So the crew is pushed on purpose, at every step:

- Every creative brief says it (`agents/_crew.md` rule 8 and each role), and `crew.mjs brief` ends every creative prompt with the ask, the last thing the member reads.
- The Motion Director must name 2 to 4 **showreel moments** (`showreel` in the score; `check` refuses a score without them), and they go into STORYBOARD.md's Video direction so every animator sees them.
- The score plans **space** too (`references/3d.md`): every scene is `2d`, `3d` or `hybrid`, the film has a one-line depth plan, and a film of 4 scenes or more gets at least one 3D or hybrid scene unless the look must stay flat and the score says why. When the film has depth, one of its showreel moments is a 3D one. 3D scenes come with their lens, camera legs, light and materials, and their 2D neighbours meet them in pixel-exact seams (`flat-to-depth`, `depth-to-flat`, `camera-through`). Opus plans space and transitions well when it's asked to, and unasked it stays on the flat page, so the score is asked.
- Every animator reports `## Showing off`: the moment in its scene that would make a reel, and what it did to earn it (`check` refuses the report without it). A 3D scene's animator also reports `## 3D` (lens, light, materials, the seams, the frame cost), and `check` runs the 3D gate on its file.
- The critics score **ambition** on frames, motion and film, and a competent-but-safe film fails, including a flat film that missed the scene that needed space, and a 3D shot that looks like the three.js demo.
- When you send findings back, lead with the push, not just the fix list: "The critic found this competent and safe (ambition 5). Fix these, and show what you can actually do with this scene: <the showreel moment it should land>."

Showing off means craft: choreography timed to the frame, invisible seams, product interactions more real than the real thing, one spectacle beat. It never means more effects; glow, particles and bounce are still slop, and the gates still reject them.

## Permission: the user's own computer

The web needs no permission. The user's disk does.

1. `node $SKILL_DIR/scripts/research.mjs local-find --name "<product>" [--domain <site>]` looks for project folders and earlier videos that match, reading only folder names, package names, git remote URLs and README titles.
2. If it finds anything, ask in the console, once, before any research that would use it: `console.mjs ask --question "Can I read these folders for the real UI, words and brand?" --context "I found <list> on this Mac. I only looked at folder names so far." --options '[{"id":"read","label":"Yes, read them"},{"id":"run","label":"Read them, and run the app to screenshot it"},{"id":"no","label":"No, use the website only"}]' --recommended read`.
3. Only approved folders go to `crew.mjs plan --local`; the scout reads nothing else, copies no secrets, changes nothing, and runs the app only on "run".

Earlier videos about the same product are in that list too. They show what was already made (so the new film can rotate away from it) and may hold a brand frame.md worth reusing.

## Research depth

| The subject is… | Research desk |
|---|---|
| a public product with a web presence and launch history (ChatGPT, Linear, Figma) | product · brand · screens · precedent, plus the scout if local; the full crew |
| a small or new product | product · brand · screens, plus the scout (often the richest source) |
| a topic (explainer) | product in topic mode (facts, numbers, misconceptions) · precedent (the best explainers) |
| a pull request | the scout on its repository; product (light) |
| footage, a track, a single unit | none, or only the brand researcher when there's a brand |

## Where things live in the run

```
$RUN/research/       product.md · product.claims.json · brand.md · brand/DESIGN.md · brand/assets/ · screens.json · screens.md · screens/
                     precedent.md · films/<slug>/{film.json,sheet.jpg} · local.md · local.claims.json · local/ · claims.json · assets.json · BRIEFING.md
$RUN/story/          truth.md · picks.json (story.mjs pick's output) · pitch-<Sure|Bold|Wild>.json · pitches.json · check.json · edit-notes.json · chosen.json
                     songs: treatment-<Sure|Bold|Wild>.json · TREATMENT-<label>.md · chosen-treatment.json · chosen-treatment.md
$RUN/music/          lyrics.json (word timings) · audio.json (beats, downbeats, sections, onsets) · plan.json · LICENSES.json
$RUN/motion/         score.json · score.md
$RUN/frames/         <n>.html · <n>.png · <n>.md
$RUN/crew/           plan.json · ledger.jsonl · prompts/ · scratch/ · animators/<n>.md + strips · seams-report.md · critic-<lens>-<round>.json
```

The Director writes `story/picks.json` (the `story.mjs pick` output), `story/check.json` (the `story.mjs check` output) and `story/chosen.json` (the picked pitch) so the members who need them can read them.

## The score, in the build

The Motion Director's `motion/score.json` is checked by `crew.mjs check --role motion-director` (every scene and seam covered, durations kept, handoffs complete on both sides, entrance variety, one peak and one calm stretch, layout variety, one signature, at most one crash zoom). After `video.mjs write`, `crew.mjs storyboard --run "$RUN" --project videos/<name>` writes it into the project's STORYBOARD.md in the workflow's own visual-design format: one `## Video direction`, then per frame its shot sequence, `blueprint`, `focal`, `roles`, `sfx`, `handoff_in` / `handoff_out` and `transition_in` (cut for scene-born seams, the registry type only where the assembler builds it). The workflow's parser must still read every frame. It also marks the visual-design step done in BRIEF.md and points DISPATCH.md at `MOTION-SCORE.md`. The workflow's `frame-packets.mjs` then carries each frame's part of the score into its packet. The score is **the plan**: the film-level fields (`duration`, `brand`, `feature`, `ground`, `ink`, `current`, `brandReveal`) and per beat `id`, `start`, `end`, `line`, `picture`, `moment`, `take`, `ui`, `exit`, `carrier`. Everything else derives from it: `score.md` and the project's MOTION-SCORE.md are rendered from it, `crew.mjs storyboard` writes BUILD.md (the builder's short brief) and puts each beat's line, picture, take, UI and exit into STORYBOARD.md, marks DIRECTION.md "the plan wins", and on a direct film replaces DISPATCH.md's duplicated craft rules with a pointer. The builder's required reading is the plan, BUILD.md, the packets' role and frame.md: about 20 KB.

## Seeing motion

Code describes motion; only frames show it. Every member who makes or judges motion looks at it:

```bash
node $SKILL_DIR/scripts/crew.mjs strip --file videos/<name>/compositions/frames/04-x.html --from 0 --to 6 --fps 4 --out <sheet.png>   # one scene, before assembly
node $SKILL_DIR/scripts/crew.mjs strip --project videos/<name> --from 11.6 --to 12.4 --fps 15 --out <sheet.png>                 # across a cut, the real runtime
node $SKILL_DIR/scripts/crew.mjs strip --file <draft.mp4> --at 0,2,4.5 --out <sheet.png>                                          # a render
```

A strip at 12 to 15 fps across a move shows its ease (the spacing between frames), its overlap, whether it lands, and whether anything pops at a seam. Strips of a 3D scene (`--file` on a composition that uses Rasan3D) wait for the 3D build and show its real motion blur; `stage3d.mjs stills` renders single frames of one.

## Lyric videos in the crew

For a song (`music-to-video`) the writers' room is three `treatment-writer`s and there is no script editor. `crew.mjs plan --route music-to-video` plans: the precedent researcher when `--public` (the artist's and genre's visual conventions, to honour or break), three treatment writers, then the Motion Director's score, key frames, one scene animator per plate, the seam pass and the critics. A writer's work is accepted when `crew.mjs check --role treatment-writer --key <label>` passes: that runs `treatment.mjs check` with `music/lyrics.json` and `music/audio.json` and requires `story/TREATMENT-<label>.md`. The treatment writers' dare is the same push as everyone's: win the pitch against two other writers. Downstream, scene animators and critics get the word timings and sync every word with `RasanMusic` (`references/lyrics.md`); the Motion Director scores inside the plates' fixed space, energy and durations, with the hook plates as one escalating set; the critic judges sync from strips across word starts (`agents/*.md`, "A lyric video"). The format and craft are in `references/lyric-video.md`.

## Presenter films in the crew

For a keyed talking-head clip put into generated worlds (`presenter`) the writers' room is three `visual-writer`s and there is no script editor. `crew.mjs plan --route presenter` plans: research only when `--public` and the speech names a product (product and brand researchers), three visual writers once the clip is keyed, transcribed and cut into beats, three design-system designers (their DESIGN.md must carry `## Imagery`), a scene animator per motion graphic (keyed `<beat>-<n>`, for example `b3-1`, working from `briefs/graphics/<key>.md`), and the motion and film critics. A writer's work is accepted when `crew.mjs check --role visual-writer --key <label>` passes: that runs `presenter.mjs check` on `presenter/plan-<label>.json` with `beats.json`, `key.json` and the image-generation state. The brief tells the writer whether generated plates will be real images or designed backdrops. The dare: one running visual idea, images that argue, a cutaway that lands, one moment the person belongs to the world. The playbook is `references/presenter.md`; picture prompts are `references/imagery.md`.
