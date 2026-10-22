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
| `<run>/console.json` | `"external_actions": 1` | this run's `console.mjs wait` validates and applies an action another app appended, **in both modes** (headless and with the browser console). Written by the console server on start and by the first headless command. Without it (a run of an older RasanAI with a browser console) an appended action is handed to the director without its effects on the page: do not write to that run |
| `<run>/console.json` | `"headless": true` | RasanAI Studio's run, no console server. Present or not, the protocol below is the same |

Refuse a `schema` or `external_actions` higher than the one you know.

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

Any other value, or one that fails `^[a-z-]{2,20}$`, is read as `console`. The source is kept on the step's
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

Every other action in `references/console.md` (`submit` of the brief, `knob`, `mix`, `swap`, `redo`, `cut-edit`,
`version`) needs the full console or Studio; another app should open those there.

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
