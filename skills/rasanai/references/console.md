# Director's Console

`scripts/console.mjs` runs a local page with one panel per step. The agent pushes each step's payload into `<run>/session.json`; the user's clicks are appended to `<run>/actions.jsonl`; `wait` hands the next one to the agent. The page updates live (server-sent events), so pushes appear without a reload.

## The page

A dark, neutral review room: the film is the brightest thing on screen.

- **Header**: the five states (Brief · Story · Look · Animatic · Final), a one-line status ("Waiting for you: pick a film", or what Claude is doing now, with a moving bar), **Decisions** (the drawer) and **Tell Claude** (⌘K). Every step maps to one state: Brief = brief, brand, route, footage; Story = story, concept; Look = look, films, direction, motion, transitions; Animatic = animatic, scenes, styleframes, storyboard, keyframes, voice, music, reel, plan, build; Final = render, final.
- **The stage**: only the current call, with its `question` as the heading and one primary button. Brief is one editable sentence; Story is three scripts (option cards that lead with what each would achieve, and the selected one as a timed table of on-screen lines, voiceover and visuals); Look is the selected design system drawn large above three tiles; each system is its own `design/<label>/specimen.html` shown in a sandboxed same-origin iframe (scaled by CSS, pointer-events off, `specimen.png` as the poster until fonts and 3D are ready; hover or selection plays `window.__specimen.tl` from 0; `/fs/` serves a `specimen.html` with the vendored GSAP substituted and `frame-ancestors 'self'`; payload `styles[].specimen` and `.poster`, from `design.mjs look-payload`); a system without a specimen falls back to the recipe renderer, drawn live on the story's first line (the 3D & materials family is drawn for real by Rasan3D through `console/presets3d.js`, with the runtime served from `/three/`; without WebGL the CSS specimen stays); Animatic is a player (key frames at their real durations, the music bed, a scene strip, a scrubber) where a click on the frame leaves a note; Build shows the newest built still and the strip filling in; Final is a video player with scene markers, notes, versions and what changed. Any other step (brand, footage, reel, voice, music…) shows its own panel on the same page.
- **While Claude works**: the stage shows what it's doing (`session.activity`, newest first). Entries come from `activity`, `log`, every push, every answer the user sends, RasanAI's own scripts (`lib/report.mjs`, into the run named in `.rasanai/current`) and, in the plugin, a PreToolUse hook (`hooks/hooks.json` → `scripts/hook-activity.mjs`) that adds each command (by its description), write and edit while a run is active.
- **Decisions** (drawer): every decided step's `decision` (Claude's craft calls with their reasons, and the user's picks), each changeable by telling Claude.
- **Tell Claude** (⌘K) sends a `note` to the step on screen; the step's `thread` shows the conversation (Claude answers with `reply`). An `ask` card sits on top of the stage when Claude asks something that isn't a call.
- **Notes** (Animatic, Final): a click on the frame opens a note at that moment (`scene`, `t`, and the point `x`, `y` as fractions), with quick notes (Slower, Faster, Bigger, Simpler, Cut it) and a scope (this scene / whole film). Notes collect as pins on the frame and marks on the scrubber until the user presses **Apply N notes**.
- **Keys**: ⌘K Tell Claude · Space play/pause · C note at the playhead · ←/→ step through scenes · 1/2/3 pick a film · Enter the primary button.
- The page shows a notice when the last update check found a newer version (`session.app`).

## Staying connected

- The console's address (port and token) is kept in `<run>/address.json`. A restart (`serve`, or the automatic one) reuses it, so the tab the user has open reconnects by itself; only `stop` forgets it.
- `push`, `activity`, `log` and `wait` restart a console that has stopped (sleep, a killed process); `wait` exits 3 only if that fails.
- The stream sends a heartbeat every 15 s; the page reconnects and reloads the state after 40 s of silence, when the tab becomes visible again, and when the network comes back.
- `setup.sh` records the run in `.rasanai/current` and, run again, resumes an unfinished run (updated in the last 12 hours, not yet rendered) with its console instead of starting a second one.

## Headless mode (RasanAI Studio)

RasanAI Studio, the native Mac app, does not use the page or the server. It starts the director with `RASANAI_CONSOLE_HEADLESS=1`; the first command records `{"headless": true}` in `<run>/console.json`, so every later command in that run stays headless even without the variable. In a headless run:

- `push`, `ask`, `activity`, `log`, `reply`, `resolve`, `record` and `wait` behave exactly as above, but never start, restart or look for a server. No port, token, `address.json`, event stream or `console_down` (exit 3) exists. `serve` is a no-op that prints `{"headless":true}`; `url` says the run is headless; `stop` does nothing.
- The app reads `session.json` and appends the user's answers to `actions.jsonl`, one JSON line per action, in the shape of "Actions" below (`{id, ts, step, type, value, note, source: "console"}`, with its own random `id`). Nothing else writes `session.json` but `console.mjs` and the scripts' own feed reports.
- **`wait` does the server's work.** When it consumes an action it first validates it the way a POST was validated (an object, a known step or `*`, a `type` of 2-20 lowercase letters or dashes, a note of at most 4000 characters, a line under 1 MB, and an `id`), then applies the same effects to `session.json` the server applied on POST: the step's `sent` banner (with the option's name), the `You: …` feed line and the "Claude is reading your answer…" status, the note in the step's thread, a `comment` as an open note in `session.comments`, an `answer` on the `ask`, `decide_rest`. It prints the action and lists its id in `consumed.json`. The session ends up the same as with the page.
- **A bad line never stops `wait`**: invalid JSON, a wrong shape, an unknown step or type, a missing id or an oversized line is added to `consumed.json` and described in `rejected.json` (`[{id, error, ts}]`), and `wait` carries on. A last line without its newline (still being written) is left alone until it is complete.
- **File safety**: `session.json`, `consumed.json` and `rejected.json` are written to a temporary file and renamed. `actions.jsonl` appends and reads, and every `consumed.json` update, happen under `actions.lock`; session rewrites happen under `session.lock`. A lock is a file created exclusively that holds `<pid> <unix ms>`; one whose process is gone, or that is older than 10 s, is taken over. The app takes the same `actions.lock` when it appends.
- Until `wait` consumes an action the app shows it as sent (its own optimistic copy of the banner, note or answer).
- A run an older Studio started (it has `address.json` and a console server) is switched on its next headless command: the old server is stopped and its address forgotten.
- Without the variable, and without `console.json` saying headless, nothing changes: the server, the page, the token and the restarts work as described above.

### The brief file (`rasanai-brief.json`)

Studio writes the user's brief to `rasanai-brief.json` in the project folder (`FilmDraft` in `apps/macos/Sources/StudioCore/FilmDraft.swift`): `brief`, `duration`, `aspect`, `agent`, `motionLevel`, `brand`, `modelPlan`, `pace`, and **`moments: [{id, role}]`**, the reference moments the user picked in the gallery (up to 4, one per role: `hook`, `proof`, `turn`, `cta`; optional, empty by default). The request text lists them under REFERENCE MOMENTS. The Director fetches each (`moments.mjs fetch <id> --run "$RUN" --role <role>`), writes them into the plan as each beat's `moment` and `take`, and they win over its own picks. They are motion references for technique only, credited in `$RUN/references/moments/credits.json`.

## Security

- Bound to 127.0.0.1 only; requests whose `Host` isn't `127.0.0.1:<port>` / `localhost:<port>` are refused (blocks DNS rebinding).
- The URL carries a per-run token. Opening it sets an HttpOnly, SameSite=Strict session cookie; every other route (state, events, files) requires that cookie, and POSTs also require the token header.
- Files are served only from the workspace root, this skill, and installed skills (`~/.claude/skills`, `~/.agents/skills`), by real path (symlinks can't escape). The session's own `console.json`, `actions.jsonl` and `consumed.json` are never served. `serve` refuses to use your home directory or `/` as the root.
- Malformed requests (bad JSON, `null` bodies, unknown steps or types, bad ranges) get 4xx; the server doesn't crash on them.

## Commands

| Command | Does |
|---|---|
| `serve --run <dir> [--root <workspace>] [--port N] [--open]` | starts the server in the background (reuses a running one only if this same copy and version started it; a console from an older version is stopped and replaced, so an update always shows the new page), prints `{url}`; `--open` opens the browser. `--root` defaults to the current directory: only files under it, this skill, and installed skills (`~/.claude/skills`, `~/.agents/skills`) are served. |
| `push --run <dir> --step <id> --file <payload.json>` (or `--data '<json>'`) `[--status awaiting\|working\|done\|skipped] [--current] [--merge] [--title "..."]` | **replaces** that step's payload (clearing old options, issues and the "you sent" banner); `--merge` keeps the previous fields instead. `status` defaults to `awaiting` (`working` for build); an awaiting step becomes the current one and the page jumps to it. The page also drops any unsent selections made against the old payload. |
| `ask --run <dir> --question "..." [--context "..."] [--options '[{"id","label","detail"}]'] [--recommended <id>] [--placeholder "..."] [--step <id>]` | any question that isn't a step: shown as its own card on top of the page (options with Claude's pick selected, plus a free-text box), without moving the flow; the status line says Claude is waiting. The answer arrives through `wait` as `{type: "answer", value: {ask, choice, text}}`. |
| `reply --run <dir> --step <id> --message "..."` | Claude's answer in that step's discussion thread (under the step on the page); clears the "Claude is replying" state. The thread survives re-pushes of the step. |
| `activity --run <dir> --message "..." [--level info\|ok\|warn] [--done]` | what Claude is doing now, between questions ("Capturing tally.app", "Drawing style frame 2 of 3"): a feed entry and the status line. `--done` records it without showing Claude as working. |
| `log --run <dir> --message "..." [--level info\|ok\|warn\|error] [--stage <id> --stage-status working\|done\|failed]` | appends a build log line and sets a stage chip (stages: handoff, plan, design, build, verify, obey, render-gate). It moves the page to Build only while the current step is plan or build (never away from the render gate); `--stage render-gate --stage-status done` marks Build done. |
| `wait --run <dir> [--step <id>] [--timeout <sec>]` | blocks until an unconsumed action arrives (for that step, or `*`), prints it, marks it consumed. Exit 2 on timeout; a stopped server is restarted on the same address; exit 3 (`console_down`) only if that fails. Run it in the background, one at a time. |
| `resolve --run <dir> --ids a,b [--note "..."] [--all]` | marks notes (`comment` actions) as handled after an Apply; `--note` says what changed (shown to the user); `--all` resolves every open note |
| `record --run <dir> --step <id> --type <type> [--value '<json>'] [--note "..."]` | logs an answer the user gave in chat (already consumed) so the session history is complete |
| `state`, `url`, `stop` | print the session, reprint the URL (errors if the server is gone, or the run is headless), stop the server |

Paths in payloads are workspace-relative (or absolute). The page serves them at `/fs/rel/<path>` / `/fs/abs/<path>`.

## Common payload fields (any step)

| Field | Shown as |
|---|---|
| `question` | the step's question, large |
| `context` | a line of context under it |
| `recommended` | badge on the recommended option |
| `decision` | green "Decided:" line (set with `status: done`) |
| `status` | nav dot: awaiting (amber, pulsing ring) · working (spinner) · done (green) · skipped (grey) |

Every panel except Build has a note box, "Send note" and "You decide this step". The nav has "You decide the rest".

## Per-step payloads

The five calls:

| Step | Fields |
|---|---|
| `brief` | `fields: {length_s, kind, subject, aspect, destination, narration, brand_name?, use_brand?}` (the sentence, prefilled), `choices: {<field>: [values or {value, label}]}` (optional, narrows a field's menu), `captures: [{image, caption}]` (what Claude will use), `findings: [{text, source}]` (the research's most useful facts, shown as "What I found" with their source), `needs_source: true` (or an empty `subject`; never pushed when RasanAI Studio started the run, whose `session.json` is seeded with the brief) → a "What's the video about?" box above the sentence → one editable sentence, Start and "Just make it". Before the first push the page shows that box on its own. |
| `story` | `stories: [{id, angle: "Sure"\|"Bold"\|"Wild", title, aim: {takeaway, feel, action, audience}, approach, tempo?: {ideas, change_every_s, source}, logline, device, why, beats: [{name, duration_s, on_screen, vo, visual, turn?, value?}], last_line, carrier?, moves?: [{id, title, move, says, beat, video, strip, poster}]}]`, `recommended` → three comparable option cards (the angle's plain meaning, the takeaway as the headline, Feel and Then lines, the title as the story's name; payloads without `aim` fall back to the logline) and the selected story as a "What it achieves" block (takeaway, feel, do next, for whom), "How it gets there" (approach, one quiet tempo line such as "6 ideas · a change every 2 s · RasanAI house tempo", device) and a script table (time, on screen, voiceover, what we see; the turn marked), "Three more stories". `carrier` (string, optional) is the one thing that travels through that story, shown as a quiet "Carried by: <carrier>" line; `moves` (optional, 3 at most, written by `moves.mjs payload --run "$RUN" --stories "$RUN/story/stories.json"`) are the hero moves, each a tile of a looping muted clip (`video`, with `strip` and `poster` as fallbacks; paths relative to the run like other payload media), its `title`, its `move` (the card's `move` shortened to one line, 140 characters at most), `says`, and `beat` (the 1-based beat it lands on, shown as "at 0:04") |
| `look` | `styles: [{id, label (Sure\|Bold\|Wild), name, blend (the blend in one line), why (why this look for this story), references: [library ids], style: {id, name, recipe, three?}}]` (`design.mjs look-payload` writes it from the three bespoke systems), `recommended`, `hook` (the story's first line; every system is drawn on it), `sub` → exactly three live tiles drawn from each recipe (a `three` hint through Rasan3D, else the CSS specimen), each with its name, the blend and why; energy knob; "New blends near this one" (asks the design desk). No gallery, no style browser |
| `films` (older single-step flow) | `films: [{id, angle: "Sure"\|"Bold"\|"Wild", title, logline, hook, why, preset (style id) or style (an inline recipe), music, frames?: [3 PNGs], beats?: [3 captions]}]`, `recommended`, `headline`/`sub` (fallback words), `brand` (optional) → three live films, energy knob (Calmer · As is · Punchier), More like these, Mix two, "Show in my brand" (no style browser) |
| `animatic` | `scenes: [{id, title, line, visual, duration, thumb}]`, `music: {title, file, offset?, alternatives: [{id, title, mood, file}]}`, `voice: {name, alternatives: [{id, name}]}` (omit when silent), `audio` (optional, a mixed track instead of `music.file`), `angles: false` hides "Try another angle" → the player, chips (Music, Voice, Try another angle), notes, "Looks right, build it" / "Apply N notes" |
| `build` | `scenes: [{id, title, duration, thumb, state: todo\|working\|done, frame}]`, `latest` (newest still) → the newest built still and the strip filling in; `log` also writes here (`log: [{t, level, msg}]`, `stages`) |
| `render` / `final` | `video` (or `videos: [..]`, the newest last), `poster`, `scenes: [{id, title, start, thumb}]` (markers), `duration`, `version`, `versions: [{v, when}]`, `changes: [..]`, `studio` (preview URL), `images` (optional snapshots) → the player with markers, notes, versions; not done: "Render the final" / "Preview first"; done: "Download MP4" |

Other steps (Claude usually pushes these `--status done` with only a `decision`; their panels open when a step needs the user or they ask to see it):

| Step | Fields |
|---|---|
| `brand` | `brand` (brand.mjs `read` summary: roles, fonts, modes, warnings), `board` (brand-board.html) |
| `research` | drawer only: pushed `--status done` with a one-line `decision` (what the crew read and found) |
| `route` | `options: [{id, label, why}]` (HyperFrames workflow ids, or `reel`) |
| `footage` | `clips` (footage.json's clips from `reel.mjs scan`) → a card per clip: contact sheet, facts, transcript, include checkbox |
| `reel` | `timeline`, `overlays`, `captions`, `clips: [{name, duration}]`, optional `edl` (reel.edl.json) and `video` (draft render) → the editable cut (references/reel.md) |
| `direction` | legacy: `gallery`, `suggestions`, `recommended`, `dimensions` → the older style picker (top three only, no browser); the flow does not use it, the Look step replaced it |
| `concept` | `options: [{id, title, logline, frames, beats, rare}]`, `recommended` → story cards |
| `scenes` | `scenes`, `target_s`, `transition_default`, `narrated` → editable table + timeline strip |
| `styleframes` | `images`, `captions` → stills with Approve |
| `look` | `looks`, `recommended` (design.mjs looks) |
| `motion` | `tasting`, `cells`, `adjectives`, `recommended` (tasting.mjs swatches) |
| `transitions` | `menu`, `cells`, `recommended` (transition-menu.mjs) |
| `voice` | `options: [{id, title, mood, file, source}]` (voice.mjs), `recommended`, `unavailable` |
| `music` | `options: [{id, title, mood, duration, file, preview (the fitted edit; played instead of file), bpm, summary, ending, fit, license, attribution, source}]` (music.mjs), `unavailable` |
| `storyboard` | `timeline` (timeline.json), `sheet` (the workflow's storyboard.html) |
| `keyframes` | `board` (board.html), `issues` (single units' key poses) |
| `plan` | `shape`, `stated`, `agent` |

## Actions (what `wait` returns)

`{"id", "ts", "step", "type", "value", "note", "source": "console"|"chat"}`

| type | step | value |
|---|---|---|
| `submit` | brief | the sentence's fields: `{length_s, kind, subject, aspect, destination, narration, use_brand}`, plus `source` when the page asked what the video is about (from the brief, or `{source}` alone from a fresh console) |
| `choose` | story | a story id |
| `more` | story | `{near: story id, exclude: [story ids]}`: three more scripts |
| `choose` | look | a design system id: `sure`, `bold` or `wild` |
| `more` | look | `{near: system id, exclude: [ids]}`: the design desk makes new blends near the selected one |
| `knob` | look | `{name: "energy", value: "calmer"\|"as is"\|"punchier", film}` (not an answer): the designers shift the selected system's motion language |
| `choose` | films | a film id |
| `more` | films | `{near: film id, exclude: [film ids]}`: more films like the selected one |
| `mix` | films | `{look: film id, story: film id}`: one film's style with another's story |
| `knob` | films | `{name: "energy", value: "calmer"\|"as is"\|"punchier", film}` (not an answer; the step stays open) |
| `swap` | films | (retired with the style browser) |
| `swap` | animatic | `{chip: "music"\|"voice", id}` |
| `more` | animatic | `{what: "angle"}`: another story angle |
| `comment` | animatic, render, final | `{scene, t, x, y, scope: "scene"\|"film", quick}`; the text is in `note`. Stored as an open note (`session.comments`); not an answer, the step stays open |
| `apply` | animatic, render, final | `{ids: [note ids]}`: make these notes, then `resolve` them |
| `approve` | animatic, storyboard, styleframes, keyframes, plan | null |
| `choose` | render | `"preview"` or `"render"` |
| `version` | render, final | `{restore: v}` |
| `submit` | footage | `{include: [clip ids]}` |
| `submit` | reel | `{timeline, overlays, captions}`: the full edited cut |
| `submit` | scenes | `{scenes: [...]}`: the full edited list, in order |
| `choose` | brand | `{use: "direct"\|"remix"\|"none", mode}` |
| `choose` | route, voice, music, concept, look, motion, transitions, direction, keyframes | an option id (as each panel offers) |
| `adjust` | motion | `{id, adjust: [adjectives]}` |
| `decide` | any | null: "you decide" for that step |
| `decide-rest` | `*` | null: "Just make it" (Claude decides every remaining call and stops only at the Final) |
| `answer` | the step an `ask` was raised on | `{ask: id, choice: option id or null, text}` (the free text is also in `note`) |
| `note` | any | null; the text is in `note`. It's also added to that step's discussion thread; answer with `reply`. |

A `note` can come with any action type too (e.g. `choose` + "but a bit slower").
