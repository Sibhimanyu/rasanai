# Call 5: Final, QA gates, review, revisions and delivery

> Moved verbatim from the former single `SKILL.md`. References such as "§3d", "rule 18", "below" and "above" point into the sibling guides: the five-call contract and the hard rules are in [shared-contract](shared-contract.md); the phase guides are listed in `SKILL.md`.

## 5 · Final

Push `render` with `video` (the draft), `poster`, `scenes: [{id, title, start, thumb}]` (markers), `version`, `versions: [{v, when}]`, and after a revision `changes` (plain lines). Unwaived gate findings go in `context`, and so does the motion-reference credit line when the film used reference moments (`node $SKILL_DIR/scripts/moments.mjs credits --run "$RUN"` prints it: who made each moment, its source, and that it was used for technique only).

- `comment` → collect; `apply {ids}` → revise only those scenes (frames, timing, sound), re-verify, re-render, A/B the new render against the one the user saw (step 5: a lost revision is reverted and said plainly in `changes`), `resolve`, re-push with `version + 1` and `changes`. Record the general lessons in the notes with `lessons.mjs add` (see Notes, above). `version {restore: v}` → re-push that version's render.
- `choose "preview"` → the workflow's preview (studio URL in `studio`). `choose "render"` → the **delivery render goes through the finish** (`references/finish.md`): every scene gets the same real motion blur, 2D included, and the film one grade:

  ```bash
  node $SKILL_DIR/scripts/finish.mjs all --project videos/<name> --out <final.mp4> [--samples 8|auto] [--shutter 0.5] [--grain 0.03] [--halation 0.2] [--vignette 0.2] [--lut <look.cube>]
  ```

  Run it after the gates pass; drafts and previews skip it (leave Rasan3D's default blur on in a draft). **Finishing with blur means the 3D scenes must not blur twice:** before the delivery render set `motionBlur: false` in every `Rasan3D.stage({...})` except a whip-speed 3D move (above ~3 000 px/s on screen), which keeps `motionBlur: { shutter: 0.25 }` with `--shutter 0.25` (`references/3d.md`, `references/finish.md`); `stage3d.mjs check` then warns `fast-without-blur` on any fast 3D move: expected, because the finish blurs it. Then `sound.mjs check` on the result. After the user approves the sound, `node $SKILL_DIR/scripts/sound.mjs lock --video renders/<film>.mp4 --run "$RUN"`; after each fix round `sound.mjs check ... --locked` (add `--note-asked "<note>"` when a note asked for the sound change). `music.mjs` takes `--hits`/`--events` and writes `<run>/music/hits.json`. After a fix round, before the A/B: `node $SKILL_DIR/scripts/fixcheck.mjs --before <previous render> --after <new render> --touched <the notes' windows>`; read `regression_runs` and `diff_pngs`: a leak into frames the round did not touch is fixed or explained.
  `finish.mjs grade|all` also takes `--lens`, `--ca`, `--focus-follow`, `--crt`, `--led` and `--print riso` (`references/finish.md` "Lens and print extras"). Rasan3D: stage option `ao` (GTAO) and camera `blades` / `bokehRotation` / `squeeze` (`references/3d.md`). Research: `research.mjs deconstruct --video <ref.mp4> [--run <run>]` writes `<run>/reference/numbers.json`, which the Motion Director reads. Art: `art.mjs treat --halftone-collage` and the `halftone-collage` plan treatment; `library/styles/halftone-collage.md` (30 style references now).
- Deliver: push `render` with the final `video` and `--status done` (the page offers the download), `activity --done`, and in chat the path plus a short delivery note: the film, the style, the motion language, and the numbers the gates actually printed on this render (end hold, cut rate, loudness, the motion gate's freeze and fluency lines), which checks ran by script and which were judged by eye, what was waived, and what you would still improve (`references/craft.md` §10, step 5). A gate pass is a floor, not a verdict: do not call your own film clean or good.
- **Pack the delivery folder** once the finish render passes the gates: `node $SKILL_DIR/scripts/video.mjs deliver --run "$RUN" --project videos/<name> [--rerun]` writes `deliver/` with `<name>.mp4`, `poster.jpg`, `<name>.srt` (narrated films), `CREDITS.txt`, `build.sh` and `NOTE.md` (every gate's numbers, critics, A/B verdicts, waivers, downgrades; what is not on disk is listed as Missing, never invented). Use `--rerun` so slop, obey and the sound check are recorded in the note. Read `warnings` (with `leaks` and `spec`) in the JSON before saying the folder is ready to share; NOTE.md carries them under "Delivery checks (warnings)". Paste CREDITS.txt wherever the film is posted. The Final's download is this folder, zipped (`references/deliver.md`).
- **The film teaches the next one.** Dispatch the `retrospective` role (`crew.mjs brief --run "$RUN" --role retrospective`; `agents/retrospective.md`): it reads the gate history, the critic rounds, the A/B verdicts and the user's notes and proposes at most two one-line craft rules (often none). `crew.mjs check --run "$RUN" --role retrospective` prints the `lessons.mjs add --source self ...` lines: run them. They are Claude's own notes, not the user's (see Memory).
- Record the film so the next one differs from it: `node $SKILL_DIR/scripts/memory.mjs record-film --run "$RUN"` (stores the score's `shape`, the title and the date; the Motion Director's brief lists the last 3 shapes and `crew.mjs check` refuses a score within 3 aspects of any of them).

## Deeper references for this guide

The canonical homes of the detail this guide points at (read the one the current step needs):

| Need | Read |
|---|---|
| the delivery finish: film-wide motion blur and one grade | `references/finish.md`, `scripts/finish.mjs` |
| the blind A/B before a fix round is accepted, and the retrospective that keeps Claude's own notes after a film | `agents/ab-juror.md`, `agents/retrospective.md`, `scripts/crew.mjs` (`ab`), `scripts/lessons.mjs` |
| the delivery folder (mp4, poster, srt, credits, build.sh, NOTE.md) and the voice-against-script check | `references/deliver.md`, `scripts/lib/deliver.mjs` |
