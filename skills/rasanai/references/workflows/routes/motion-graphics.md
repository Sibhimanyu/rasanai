# Route: single motion units (`motion-graphics`)

> Moved verbatim from the former single `SKILL.md`. References such as "§3d", "rule 18", "below" and "above" point into the sibling guides: the five-call contract and the hard rules are in [shared-contract](../shared-contract.md); the phase guides are listed in `SKILL.md`.

## Single units (route `motion-graphics`)

One short unnarrated unit (title, sting, stat hit, lower third): Brief → Look (three bespoke systems drawn on the headline; Story optional) → Animatic (the key poses, optional keyframe board: `board.mjs`, `references/board-format.md`) → `handoff.mjs --decisions "$RUN/decisions.json"` (`references/handoff.md`) → build through `/motion-graphics` with `DISPATCH.md` appended to every subagent, `obey.mjs` + `slop.mjs` after verify → Final. The crew is small here (`crew.mjs plan --route motion-graphics`): the brand researcher when there's a brand, the Motion Director's score for the one unit (its shots are the key poses), and the motion critic on the built unit.

Revising an existing unit: [single-unit-and-revision](../operations/single-unit-and-revision.md).

## Deeper references for this guide

The canonical homes of the detail this guide points at (read the one the current step needs):

| Need | Read |
|---|---|
| single units: keyframe board format; decisions.json and handoff | `references/board-format.md`, `references/handoff.md` (`handoff.mjs --decisions <decisions.json> --prompt [--out <file>]` writes the chosen plan as one paste-able prompt for another coding agent) |
