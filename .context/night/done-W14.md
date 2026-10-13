# W14: role-free reference moments ("Get inspired")

Branch Sibhimanyu/moves-i-like (from origin/master). Skill: skills/rasanai.

## Brief contract (`rasanai-brief.json`)

```json
{ "moments": [ { "id": "M901", "place": "opening" }, { "id": "M900" } ] }
```
- `moments`: optional, default `[]`, at most 4, ids unique.
- `place` (optional): `opening | between | peak | ending | anywhere`; default `anywhere`. A hint, not a slot.
- Legacy `role` is still read: hook -> opening, cta -> ending, proof/turn/setup/payoff -> anywhere. `place` wins over `role`. Studio should write `place` only.
- No fixed hook/proof/turn/cta slots and no "one per role": any 0 to 4 moves, any places, repeats of a place allowed.

## What the Director does
- After the story is chosen it places each pick on the beat whose mechanic fits (respecting `place`), recorded in `motion/score.json` as `moments_placed: [{id, beat, take, why}]`; a pick that fits no beat goes in `moments_dropped: [{id, why}]`. `crew.mjs check` warns `moment-unplaced` otherwise.
- No picks: the Director picks 2 to 4 by `moments.mjs search --mechanic` against the story's beats.
- Decision line names each placement ("Your 'Cursor clicks' move opens beat 1: its click-to-zoom builds the first ask").
- `moments.mjs`: `--role` still filters (manifest tags are hints); `--place` aliases to those roles (opening: hook/setup, ending: cta/payoff, peak: turn/proof, between: proof/turn/setup, anywhere: none); `fetch --place`. `credits.json` entries gain `place` and `still`.

## Styleframes stage (console + Studio)
- `frames/shots.json` shot: optional `moment: {id, why}` (designer's proposal).
- `styleframes` payload, per frame: `moment: {id, name, still, credit, place, why} | null`; top level `unplaced_moments: [{id, name, still, credit, place}]` (picked, on no frame). Both are derived from `references/moments/credits.json` (so a pick must be fetched to show).
- Action `swap-moment`, step `styleframes`, value `{frame: "<frame id>", id: "<moment id>" | null}`: put that picked move on that frame (it leaves any other), `null` clears the frame's move; the designer updates `shots[].moment` and re-pushes.
- Console renders "Move: <name> · why · credit [Swap]" under each board and an "Unplaced moves" line (index.html).

Tests: scripts/tests/moments.mjs (legacy mapping, place filter, fetch --place) and selftest.mjs (moment-unplaced warning, placed, dropped).
Note: apps/macos files (FilmDraft.swift, MomentCatalog.swift) were modified in this worktree by someone else; not part of this commit.
