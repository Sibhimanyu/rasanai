# Remote: answering a RasanAI film from another app

RasanAI waits on the user five times (the five calls) and whenever the director asks a question. This page is the
published contract for an app that shows those calls somewhere else and sends the answer back: a phone pager such as
Squeak, a menu-bar app, a chat bot. It needs no server and no token: an app on the same Mac reads one file and appends
to another, exactly as RasanAI Studio does. Everything here is kept working across RasanAI releases; a change an
existing reader would misread bumps the version number below.

## Versions to check

| Where | Field | Meaning |
|---|---|---|
| `<run>/session.json` | `"schema": 1` | the shape described on this page. Written by `console.mjs` on every save. A session without it was last written by an older RasanAI: read it the same way, but treat missing fields as absent |
| `<run>/console.json` | `"external_actions": 2` | this run's `console.mjs wait` validates and applies an action another app appended, **in both modes** (headless and with the browser console). Written by the console server on start and by the first headless command. `1` is the original contract; **`2` is a strict superset of 1** (everything a v1 reader sends still works unchanged) that adds the actions in "Contract v2" below and checks them on `wait`. An app that knows only v1 may write to a v2 run, and an app that knows v2 must check the number before it sends a v2-only action: on `1` those actions are not checked and not all of them are understood, so show them as "answer this in RasanAI Studio". Without the field (a run of an older RasanAI with a browser console) an appended action is handed to the director without its effects on the page: do not write to that run |
| `<run>/console.json` | `"headless": true` | RasanAI Studio's run, no console server. Present or not, the protocol below is the same |

Refuse a `schema` or `external_actions` higher than the one you know (an app that knows `2` refuses `3`).

## Finding the run

A project is a folder (`~/Documents/RasanAI/<film>` for Studio, or the workspace the director runs in). Its
`.rasanai/current` holds the run folder's name; the run is `.rasanai/<that name>/`. A name with a `/`, a `\`, or a
leading `.` is not a run. The director is a Claude Code (or Codex) session whose working directory is the project.

## Who may write what

| File | Writer | Other apps |
|---|---|---|
| `session.json` | `console.mjs` and the skill's own scripts only, written atomically (temp file and rename) under `session.lock` | **read only** |
| `actions.jsonl` | the console server, `console.mjs record`, RasanAI Studio, and other apps | **append one line under `actions.lock`** |
| `consumed.json` | `console.mjs wait` (and `record`) | read only: the ids already handed to the director |
| `rejected.json` | `console.mjs wait` | read only: `[{id, error, ts}]`, actions refused with the reason |
| `console.json`, `address.json` | `console.mjs` | read `console.json` for the flags above; never read or use `address.json` or the token (the browser console is the user's, loopback only) |

## Is the user needed now (the waiting rule)

The user is needed when either is true:

```
step = session.steps[session.current]
(step.status == "awaiting" && !step.sent)  ||  (session.ask && !session.ask.answered)
```

An open `ask` wins: the director raised it mid-step and waits on it (`ask.step` names the step it belongs to). `sent`
is set as soon as an answer is applied, so a call is never shown twice; a `sent` of type `note` means the user said
something and the director has not answered it yet. `session.working` (`{msg, t}` or null) is what the director is
doing now; null with a waiting step is the moment to page. `session.updated` changes on every save: use it, or the
step's own `updated`, as the revision a reply must still match.

## Steps and the five calls

| Call | Steps (`session.current`) |
|---|---|
| Brief | `brief` (also the `brand`, `route` and `footage` panels) |
| Story | `story` (older: `concept`) |
| Look | `look`, `films` (older single-step flow), `styleframes` (the Look call on a branded direct film), `motion`, `transitions` (older), `direction` (legacy) |
| Animatic | `animatic` (also `scenes`, `storyboard`, `keyframes`, `voice`, `music`, `reel`, `plan`) |
| Final | `render`, `final` |
| (none) | `research`, `build`: progress only, never waiting on the user |

The step payloads (what each call shows) are in `references/console.md`, Per-step payloads. The safe set for another
app is below.

## Writing an answer

1. **Take `<run>/actions.lock`**: create it exclusively (`O_CREAT|O_EXCL`, `open(path, "wx")`) and write
   `"<your pid> <unix ms>\n"`. If it exists, retry every 5 to 20 ms. A lock older than 10 s, or whose pid is not
   alive, is stale: remove it and retry. Give up after a few seconds and tell the user to try again; never write
   without the lock.
2. **Append exactly one line** to `<run>/actions.jsonl`, ending in `\n`:
   `{"id", "ts", "step", "type", "value", "note", "source"}`.
3. **Release the lock**: remove the file, only if it still holds your pid.
4. **Confirm** by watching `consumed.json` for your `id` (and `rejected.json` for a refusal). Never write the same
   answer twice: a line not yet consumed is a pending answer, not a lost one. While it is pending, show it as sent.

| Field | Rule |
|---|---|
| `id` | yours, unique, `^[A-Za-z0-9_-]{1,64}$` |
| `ts` | ISO-8601 time |
| `step` | the waiting step (or `ask.step` for an answer, `*` for `decide-rest`) |
| `type` | `^[a-z-]{2,20}$`, one of the actions below |
| `value` | per action, below |
| `note` | text, at most 4000 characters (`""` for none) |
| `source` | who you are: one of the sources below. Never set `applied` (the console server marks the lines it applied itself) |

A line that is not valid JSON, has no valid `id`, names an unknown step or type, or is over 1 MB is consumed and
listed in `rejected.json`; it never reaches the director. Everything else is applied to `session.json` by `wait`
(the `sent` banner, the feed line, the step's discussion thread, the note, the answered `ask`) and handed to the
director, the same as a click on the page.

### Sources

| `source` | Feed line | Drawer |
|---|---|---|
| `console` (default) | You: picked the story: … | you |
| `chat` | (chat `record`, already consumed) | you |
| `studio` | You: … | you |
| `squeak` | You (Squeak): picked the story: … | you (Squeak) |
| `squeak-phone` | You (iPhone): picked the story: … | you (iPhone) |

`squeak` and `squeak-phone` are reserved for Squeak's own apps; they are also the sources whose v2 lines `wait` checks strictly (Contract v2). Any other value, or one that fails `^[a-z-]{2,20}$`, is read as `console`. The source is kept on the step's
`sent` (`{type, value, note, ts, source, via?}`, `via` being the label above) and, when the step is closed, as
`by_source` and `by_via` beside `by: "user"`, so the decisions drawer in the page and in RasanAI Studio says where
the call was made. To add a source, add it to `SOURCES` in `scripts/console.mjs` and to this table.

### The actions another app may send

Check every answer against `session.json` as it is **now**, not as it was when the user looked: the step is still
the waiting one, and the id is one the step shows.

| Call | `type` | `value` | Check |
|---|---|---|---|
| Story | `choose` | a story id | one of `steps.story.stories[].id` |
| Story | `more` | `{near: story id, exclude: [the shown ids]}` | `near` optional; three more scripts (costs a crew pass) |
| Look | `choose` | a system id (`sure`, `bold`, `wild`) | one of `steps.look.styles[].id` (`films[].id` on `films`) |
| Look | `more` | `{near: id, exclude: [the shown ids]}` | new blends near one (costs a crew pass) |
| Look (styleframes) | `approve` | `null` | "These are right. Animate them" |
| Look (styleframes) | `comment` | `{scene: <frame id>, t: null, x: null, y: null, scope: "scene"}`, text in `note` | a note on one frame; not an answer |
| Animatic, Final | `comment` | `{scene, t, x, y, scope: "scene"\|"film", quick?}`, text in `note` | `scene` one of the step's `scenes[].id`; `t` seconds within the film; `x`, `y` fractions 0 to 1. An open note, not an answer: the step stays waiting |
| Animatic, Final | `apply` | `{ids: [note ids]}` | ids of open notes (`session.comments`, `state: "open"`, same step) |
| Animatic | `approve` | `null` | "Looks right, build it" |
| Final (`render`) | `choose` | `"render"` or `"preview"` | |
| Any waiting step | `note` | `null`, text in `note` | a message to the director on that step; it answers with a reply |
| Ask | `answer` | `{ask: <ask.id>, choice: option id \| null, text}` | `ask.id` is the open one and not answered; `choice` one of `ask.options[].id`, or `null` with `text` |
| (all) | `decide-rest` on step `*` | `null` | "Just make it": the director decides every remaining call and stops only at the Final |

Every other action in `references/console.md` (`knob`, `mix`, `swap`, `cut-edit`, `version`, a `submit` of anything but the brief) needs the full console or Studio; another app should open those there.

## Contract v2 (`external_actions: 2`)

Everything above still holds. v2 adds these, so an app can run a whole film: the brief, "you decide", the style frames, a missing-tool question, and a chat with Rasan. For a line whose `source` is `squeak` or `squeak-phone`, `wait` checks them against `session.json` **as it is when the line is read** and refuses a bad one: it is consumed, listed in `rejected.json` with a short fixed reason, and never reaches the director (so check `rejected.json` as well as `consumed.json`). Lines from the page, Studio and chat `record` keep today's looser check. v2 never changes what a v1 action means.

| Call | `type` | `value` | Check |
|---|---|---|---|
| Brief | `submit` | the sentence's fields, as Studio sends them, **flat**: `{length_s, kind, subject, aspect, destination, narration, brand_name?, use_brand?, ...}` plus `format: {tile, option, scope?}`. `{fields: {...}, format}` is accepted too and flattened to the same thing | the brief step is `awaiting`. Keys: the ones above and any key the step's own `fields` already carries; **any other key is refused**. Types: a field keeps the type it has in `steps.brief.fields` (`length_s` a number from 5 to 600, `aspect` one of `16:9`, `9:16`, `1:1`, `use_brand` a boolean, `narration` text or a boolean, the rest text up to 4000). `format.tile` and `format.option` must both exist in `library/formats.json` (`formats.mjs list`) and the option must not be `soon`; `scope` is `universal`, `category` or `single-task`. `kind` is set from the option when the app sent none |
| Any waiting step | `decide` | `null` | the step is `awaiting`: "you decide this one" (the director makes the call, as for Studio's "You decide") |
| (all) | `decide-rest` on step `*` | `null` | v1, now also checked: step `*`, no value |
| Look (styleframes) | `approve` | `null` | the step is `awaiting` |
| Look (styleframes) | `comment` | `{frame: <frame id>, text}` (the text may be in `note` instead) | `frame` one of `steps.styleframes.frames[].id`; text not empty. Stored as the v1 shape: an open note, `{scene: <frame id>, t: null, x: null, y: null, scope: "scene"}`, text in `note`; not an answer |
| Look (styleframes) | `redo` | `{ids: [frame ids], note}` | 1 to 50 ids, each on the step (repeats are dropped); the note (also accepted in `note`) up to 4000 characters |
| Ask | `answer` | `{ask, choice, text}` | v1, now also checked: `ask` is the open, unanswered question and the line's step is `ask.step`; `choice` is one of `ask.options[].id`, or `null` with some `text`. **A missing-tool question** is an ask whose options include `install-tool:<tool>` (Studio's setup runs it for the person): an app that ran the install itself (`director.mjs install-tool`, below) answers `choice: "tool-ready:<tool>"` for that same `<tool>` (a `tool-ready` choice for a tool the ask did not offer is refused) |
| Current step | `note` with `value.chat` | Studio's chat shape, below | the line's step is `session.current`, whether or not it waits; a note without `value`, as in v1, is still allowed on any step |
| Any | `revision-request`, `revision-confirm` | `{anchor: {step, t}, text, source}`; `{idempotency_key, accept}` | unchanged from Studio and the console: the engine reads the person's words and scope into one pinned request (`session.revision_requests`); an ambiguous one waits for `revision-confirm`. Sent beside a chat note, as Studio does |

### Chat with Rasan

A message to the director is a `note` on the current step. The person's words are in `note` (that is what the thread shows); for the director to answer it briefly, `value.chat` carries the rules and a small context. The shape is exactly Studio's (`DirectorChatRules.swift`); a note with `value.chat` is checked field by field, and an unknown key, a limit out of range or a context key not listed is refused:

```json
{"chat": {"rules": "<standing instruction, up to 2000 chars>", "max_sentences": 3, "max_tool_calls": 3,
          "context": {"step": "<a step id>", "looking_at": "<up to 600 chars>", "blocked": "<up to 600>", "last_error": "<up to 600>",
                      "recent_events": ["<at most 5 lines, 400 chars each>"]}}}
```

`max_sentences` and `max_tool_calls` are whole numbers 0 to 10. `looking_at`, `blocked`, `last_error` and `recent_events` are optional. Studio's rules text (a good default for another app): *"This is a chat message from the person. Answer it with console.mjs reply on the same step, in at most 3 short sentences, unless they clearly asked for detail. Answer only what they asked, using the context packet first. Never recap the whole film or its history. Use at most 3 tool calls to find the answer before you reply; if that is not enough, say what you know and what you would check next. Then go back to the step you were on."*

Where replies land and how to pair them. The director answers with `console.mjs reply`, which appends `{who: "claude", text, t}` to **`session.steps.<step>.thread`**. The person's own lines are in the same list as `{who: "you", text, t}` once `wait` has consumed the line (`t` is the line's `ts`). To pair a message with its reply: show your line as pending until `consumed.json` has its id, then a reply is the first `who: "claude"` entry whose `t` is later than your line's `t` (order the thread by `t`; it keeps the newest 50 entries). While the director has not answered, `steps.<step>.sent` is `{type: "note", …}` and it is cleared by the reply, so "sent of type `note`" means "waiting for Rasan's answer". A film whose director is stopped answers only after it is resumed (below).

## The director: liveness, resume, stop

The director is the agent session that runs the film (`claude --print` or `codex exec`), started through RasanAI Studio's driver, `Runtime/director-driver.mjs`, which records its life in **`<run>/director-events.jsonl`**, one JSON object per line, `{t, event, ...}`:

| `event` | Fields | Meaning |
|---|---|---|
| `start` | `pid` | a director started; `pid` is the **driver's** process id (the agent is its child) |
| `exit` | `code`, `stopped`, `reason?` | it ended; `stopped: true` is a stop (Stop pressed, or the app went away while it was paused; code 130) |
| `freeze` / `thaw` | | the person paused it (the whole agent group is frozen in place) / continued it |
| `auto-resume` | | Studio resumed it by itself |

Reading it without starting anything (an app that polls this every few seconds should read the file and call `kill(pid, 0)` and `ps`, not spawn Node):

- the **last `start` with no `exit` after it** is the director that should be alive: check `kill(pid, 0)`, and that `ps -ww -o command= -p <pid>` names `director-driver.mjs` and this run (a bare pid can be reused). Alive: **running**, or **frozen** when the newest `freeze` has no `thaw` after it (or `ps -o stat=` of the pid contains `T`). Not alive: it **crashed** (no exit was written; the log's last write is when);
- no open start: the last `exit` says **stopped** (`stopped: true`, or code 0) or **crashed** (any other code); the Final call answered (`steps.final.status` is `done`) is **finished** whatever the events say, and no events at all is **none**.

`director-watch` in the run folder is **Studio's heartbeat** (a relaunched Studio touches it every few seconds so the driver knows someone watches a paused director). **Other apps must never touch it.** A director that nobody watches is left running; the driver stops only one that stays frozen over 30 seconds with no one watching, or one that repeats the same tool call five times in a row.

**`skills/rasanai/scripts/director.mjs`** does all of this for an app that would rather call a program (Node 22, no dependencies; the skill is the run's `console.json` `skill`, which must be an existing folder containing `SKILL.md`). Every subcommand prints **one JSON line** to stdout and exits 0; a failure is `{"ok": false, "reason": "<one fixed sentence>"}`, never a stack, a path or a secret. `<projectDir>` is the project folder (the one whose `.rasanai/current` names the run).

```
node director.mjs status <projectDir>
  {"ok":true,"schema":1,"run":"run-<id>","state":"running|frozen|stopped|crashed|finished|none","pid":<driver pid>|null,"since":"<ISO>"|null,"exit":{"code":<n>|null,"stopped":<bool>,"t":"<ISO>"}|null}
  running/frozen: pid is the driver, since is the start (or the freeze), exit is null.  stopped/crashed/finished: pid null, exit is the last exit
  (a crash with no exit written has code null), since its time.  none: no events and not finished.
node director.mjs resume <projectDir> [--source <name>]
  {"ok":true,"pid":<driver pid>}  |  {"ok":false,"reason":"..."}
node director.mjs stop <projectDir>
  {"ok":true}  |  {"ok":false,"reason":"The director is not running."}
node director.mjs install-tool <projectDir> <tool>
  {"ok":true,"tool":"<tool>"}  |  {"ok":false,"reason":"..."}
```

`resume`: a **frozen** director is thawed (`SIGUSR2` to the driver; same pid); a **running** one is refused (`"The director is already running."`), a **finished** film too (`"This film is finished."`). Otherwise it starts a fresh director on the **same run**, the way Studio's Resume does: the same driver, the same environment (`RASANAI_CONSOLE_HEADLESS=1`, no `CLAUDECODE`, the background-task ceiling off), the program, flags, permission settings (the allowlist) and model of the run's own `director-job.json` (only its last argument, the prompt, is new), and Studio's resume prompt (`scripts/lib/director-launch.mjs`, below). It rewrites `director-job.json` (0600), appends to `director.log`, and returns once the driver's `start` event has the pid it reports. A film that never had a director (`director-job.json` missing) is refused: start it in Studio once. `--source` is only checked (`^[a-z-]{2,20}$`). A lock (`<run>/director.lock`) makes two resumes at once start one director; the other answers `"Another resume is already starting the director."`. Studio finds a director started this way on its next open (the open `start` event whose pid is a live driver of the run), like one it left running itself. It does not check sign-in, free space or the tools first (Studio's preflight does that for its own Resume); the agent reports a problem into the run, as it always does.

The **resume prompt's source of truth is Swift** (`apps/macos/Sources/StudioCore/DirectorLaunch.swift` and `FilmDraft.creativeDirection`). The long texts are generated from it into `scripts/lib/director-prompt-data.json`; `lib/director-launch.mjs` ports only the composition (which sections go where, the draft's defaults). A golden file both sides test against (`apps/macos/Tests/StudioCoreTests/Fixtures/director-prompt-golden.json`, `scripts/tests/director-launch.mjs`, `DirectorPromptParityTests`) fails when they differ; after changing the Swift text, run `RASAN_WRITE_GOLDEN=1 swift test --filter DirectorPromptParityTests` in `apps/macos`.

`stop` sends `SIGTERM` to the driver (as Studio's Stop does) and returns once the driver is gone (up to 6 s). The driver writes `{event: "exit", code: 130, stopped: true}` first.

`install-tool` runs Studio's `Runtime/tool-setup.mjs` for a tool it knows: `ffmpeg` (also `ffprobe`), `hyperframes` (the renderer), `browser`, `skills`, `transcriber` (also `whisper-cli`); anything else is refused (`"RasanAI cannot install that tool by itself. Install it yourself, then answer again."`). It needs no password and no `brew`, may take several minutes (it gives up after 10), refuses while another setup runs, and succeeds only when the programs it installed are found on the director's `PATH`. A failure's reason is the setup's own sentence with the home folder shortened to `~`. After it succeeds, answer the ask with `choice: "tool-ready:<tool>"`.

## Pictures and video for a phone

Payload paths are **relative to the project folder** (the director's working directory), or absolute. Resolve them
against the project, refuse anything that leaves it, and read only paths the current waiting step names.

| Call | Picture | When it is there |
|---|---|---|
| Story | `stories[].image` (optional, any still of that story) and `stories[].moves[].poster` (a hero move's still, optional) | most stories have neither: show the story as text (title, logline, beats) |
| Look (`look`) | `styles[].poster`: the system's `design/<label>/specimen.png`; `styles[].frames[]`: `{id: "open"\|"peak"\|"end", image}` | `poster` is written by `design.mjs look-payload` only when the system has a `specimen.html` **and** `design.mjs check-system` rendered its `specimen.png`; a recipe-only system has no poster (fall back to its `frames`, else its name and `blend`). `frames` are there only on routes whose crew plan has the look-heroes phase (`crew.mjs plan`), once those frames are drawn |
| Look (`films`, older flow) | `films[].frames`: a plain list of up to 3 PNG paths (strings, not objects) | no `poster` on this flow: use the first frame |
| Look (`styleframes`) | `frames[].image`, `frames[].ref.image`, `sheet` | always `image`; it is an approve/redo call, not a pick |
| Animatic | `scenes[].thumb` (stills), `audio` or `music.file` (the bed); `video` and `proxy` when the animatic is a draft render | thumbs nearly always; `video` when the animatic is the built draft (references/workflows/music-animatic-build.md, the Animatic call) |
| Final | `video` (or `videos[]`, the newest last), `poster`, `scenes[].thumb`, `proxy` | |

**Video for phones (`proxy`).** When `console.mjs push` sends `animatic`, `render` or `final` with a `video` (or
`videos`, the newest last) that exists, it makes a phone copy in the background: H.264 (main), 540 pixels on the
short side (never upscaled), about 1.2 Mbit/s, AAC 96 kbit/s stereo, `+faststart`, written to
`<run>/phone/<name>-<hash>.mp4` (never beside the render, so nothing that looks for the newest render finds it).
When it is done, `steps.<step>.proxy` names it (relative to the project); a re-push of the same, unchanged video
names it at once. A push whose video is missing, or a newer push, drops the old `proxy`. No `ffmpeg` on the Mac (or
`RASANAI_PHONE_PROXY=off`) means no `proxy` and no error: fall back to `video` or show the call as "on your Mac".
The animatic as stills over the bed is not merged into one file; a phone plays the thumbs at their durations
(`scenes[].duration`) over `audio`/`music.file`, or uses `proxy` when the animatic is a draft render.

## What another app must not do

- Write `session.json`, `consumed.json` or `rejected.json`, or hold `session.lock`.
- Use the browser console's port, token or cookie: it is the user's, bound to 127.0.0.1 and checked on purpose.
- Answer a call that is not waiting, an id the step does not show, or the same answer twice.
- Read files the waiting step does not name.
- Touch `director-watch` (Studio's heartbeat), or write `director-job.json`, `director-events.jsonl` or `director.log`: start, thaw and stop a director only through `scripts/director.mjs` (which takes `director.lock`).
