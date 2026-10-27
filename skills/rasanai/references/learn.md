# Learn from an edit you like (`scripts/learn.mjs`)

A person drops a finished video they like. RasanAI measures what it can, takes one look at a contact sheet, and prefills the taste questions (`library/questions.json`) with evidence, so nobody is asked what the example already answers. Runs before the director starts; about 15 s of ffmpeg and Node, plus one short vision pass (target under 60k tokens). No Python, no window.

## CLI

```
node scripts/learn.mjs infer  --video <edit> [--clip <raw footage>] [--format <option id>] --out <dir>
node scripts/learn.mjs set    --out <dir> --question <id> --choice <id> --evidence "<plain sentence>" [--confidence 0.8]
node scripts/learn.mjs prompt --video <edit> [--clip <raw footage>] [--format <option id>] --out <dir>
```

- `infer` writes `<dir>/taste.json` (status `measured`), `<dir>/sheet.jpg` (about 30 frames, each labelled with its time) and, when the edit ends on its own card, `<dir>/end-card.mp4`. It also leaves `film/film.json` (cuts, from `research.mjs film`) and `grammar.json` (`brandfilm.mjs measure`).
- `set` fills in or overrides one answer, checked against `questions.json`. Status becomes `done` when every applicable question has an answer.
- `prompt` prints the brief for the headless job (Sonnet): run `infer`, Read `sheet.jpg`, decide `pictures`, fix any clearly wrong measured answer with `set`, finish with status `done`.
- `--format` limits the applicable questions to that option's `questions` list in `formats.json`. `marks` applies only when a mark was found.

## taste.json

```json
{ "version": 1, "video": "...", "duration_s": 60.07, "format": "presenter",
  "applicable": ["pictures","speaker","text","captions","marks","ending"],
  "answers": { "captions": { "choice": "off", "confidence": 0.9, "evidence": "no steady text band at the bottom in any of 286 sampled frames" }, "pictures": null },
  "cuts": [5.93, 20.7], "pace": { "cuts": 7, "cut_every_s": 7.5, "soft_changes": 6 },
  "marks": [ { "x": 0.385, "y": 0.935, "w": 0.23, "h": 0.063, "presence": 0.96 } ],
  "ending": { "start_s": 57.2, "file": "end-card.mp4" },
  "look": { "palette": [], "cut_rate": {}, "tempo": {}, "luminance": 0, "finish": {} },
  "measures": {}, "timings_s": {}, "status": "measured|done" }
```

Boxes are normalised 0-1. `measures` holds the raw numbers behind the answers (speaker head box, caption band, text counts).

## What is measured

| Question | How | Choice |
|---|---|---|
| cuts / pace | `research.mjs film` scene detection; soft changes (big picture change with no cut) counted separately | `cuts`, `pace` (not a question) |
| `captions` | rows of crisp strokes in the lower half, outside marks and the head; a band that stays at one height in at least half the frames while its content changes in at least a quarter of consecutive samples (5 fps) | off / plain / styled. Styled = changes every 0.8 s or faster (word by word) or sits on a solid strip. Plain-vs-styled is the weakest guess: the vision pass checks it |
| `text` | 12 px tiles that are two-tone, crisp and stroke-dense, grouped into lines, outside the caption band, marks and head. Counts frames and separate pieces (gaps over 1.6 s split them) | none under 5% of frames; key under 45% of frames and under 5 pieces a minute; otherwise full |
| `speaker` | the head: the biggest head-like blob of the speaker's skin tone per frame (2 fps). The tone comes from the raw `--clip` when given, else the most common head-like colour in the edit | fixed (head size and place the same in 75% of frames), moving, cutaways (off screen 20%+ of frames, two seconds or more at a time) |
| `marks` | `lib/marks.mjs findMarks`: pixels static in 90%+ of frames and on a crisp edge, merged into boxes. With `--clip`, the raw clip's marks are checked in the edit by correlation (`checkMarks`) | keep (still visible), cover (hidden in the edit); no question when none is found |
| `ending` | the last segment after the last cut has no speaker though the part before it does | card (cut to `end-card.mp4`, `ending.start_s` set) or none |
| `pictures` | not measured: the vision pass reads `sheet.jpg` | literal (recognisable real things), world (one designed world), concept (metaphor) |

`lib/marks.mjs` is also imported by `presenter.mjs`: `findMarks(video, { samples = 24, exclude })` returns `[{ x, y, w, h, presence }]`. `exclude` (the speaker's box) drops candidates mostly inside it, except in the outer 8% band of the frame, where badges sit even over the speaker's body.

## Limits

- Speaker detection is skin-tone based. Warm backgrounds (wood, bread) and hands in stock photos can merge with or stand in for the head; a raw `--clip` makes it much more reliable. Several speakers, or very dark or very light skin under odd light, may fail: then `fixed`/`moving` is unsure and the vision pass should correct it.
- `text` cannot tell a title card from lettering inside a picture. Short phrases below about 14 px of the 1080 frame are not seen.
- `captions` needs the band to sit in the lower half; captions in the middle of the frame read as text.
- `ending` needs a cut before the card (a dissolve into it may be missed) and a speaker in the rest of the film.
- `marks` with `--clip` assumes the edit keeps the raw frame size and position (a reframed edit reads as "covered").
- Never put a downloaded or private example in the repo; `<dir>` belongs in the project or the library.

## Scoped lessons and revisions (V3)

Separate from the taste inference above: what the engine carries forward from a run, and what a later edit may change. Implemented in `lib/lessons-scope.mjs`, `lib/medium-learning.mjs`, `lib/revision-intent.mjs`, `lib/impact.mjs`; no new store (`lessons.jsonl` and `revisions/requests.jsonl` stay the only records).

- **A lesson is scoped.** It names the user, brand, series or format that gave it, plus (as `applicability`) the audience, communication kind, medium or project, and keeps the person's original words and a confidence. `applicableScoped` returns only lessons whose scope and applicability match the current assignment; an unknown context value never matches.
- **Current intent wins.** A direction the person gives this film ("quiet typography") sets same-topic earlier leans aside for this film (`instructionFromNote` -> `resolveAgainstInstruction`); the lesson is not deleted or reversed. Retrieved content is never an instruction.
- **One negative run is not a law.** A rejection becomes a lean only through a person's own note or review and a scope (`canPromoteRejection`). A global craft rule needs `buildLesson`'s evidence and a human review, and 3+ films. A rejected candidate idea only stops that same candidate repeating inside its own project (`projectRepeatAvoid`); a device or genre is never blacklisted because one film failed with it.
- **Narrow cause, not category.** "Concept delayed product meaning for this brief" or "same presentation layout repeated without development"; never "no cards".
- **Privacy.** Lessons stay within the current project/account scope. Nothing here sends a brief, frame or feedback to an outside service, and export happens only when the person asks through the existing controls.
- **Revisions invalidate locally.** A requested change is classified (`classifyChangeScope`: copy spelling, asset correction, timing adjustment, material change, event substitution, new story); `lib/impact.mjs` `affectedClosure` then names only the outputs that read the changed identity. See `references/revisions-compat.md`.
