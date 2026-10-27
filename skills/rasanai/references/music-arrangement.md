# Music arrangement (implemented_unvalidated)

Library: `scripts/lib/music-arrangement.mjs` (pure; renders nothing). It plans how the chosen music develops across the film. It reuses `music-fit.mjs` (`labelEstimates`, `editBoundaries`, `fitGuard`), `music-lib.mjs` (`ENDINGS`), the sound-choices energy triple and the `mix-bus.mjs` dB contract. Time is the film score's seconds (`basis: "score"`); musical markers are annotations on that score, never a second clock.

## Roles are optional
`establishment`, `development`, `emphasis`, `resolution` are analytical labels assigned from the analysed section energy (or section order when energy is unknown). They are not a required four-part form: one continuous passage gets no roles, and a film may have only some of them. The roles are estimates (`estimated: true`); a role change is a plan, not a listening verdict.

## Stems versus a stereo file
- Verified, licensed, genuine stems (`stems.verified === true` AND a real file named per part) may be arranged: percussion, bass, harmony and texture enter and withdraw as dB lanes (offsets from each stem's own level) that travel as bus gains (`stemBuses(arrangement)`, same `{file, genuine_stem}` shape `busPlan({stems})` reads).
- Claimed but unverified stems are ignored and flagged `stems-unverified`.
- A stereo file is arranged only by sections it actually has, permitted edits and short crossfades. Nothing says "drums out" for a stereo file: separate instrument control is never claimed or inferred.
- A music-led film keeps its track whole unless the user authorized an edit (`fitGuard`).

## Uncertainty labels
`tempo: detected | uncertain | undetected` come from `labelEstimates` unchanged. `undetected` keeps `bpm: null` (no 120 is invented), edits fall back to analysed section starts, or to "keep whole / edit by ear" when no structure exists. Section boundaries are always marked uncertain. Ambient and rubato music stays usable.

## Accents and cuts
`annotateAccents` compares each selected accent with the nearest real marker (analysed section start; a bar only when the grid is usable). It reports `offset_s`, `on_marker`, `protected` and a suggestion; `moves_score` is always false. An accent inside a protected read or product proof window is never suggested to move: shift the music edit instead, or leave it. Scene boundaries never restart the music (`continuity.restart_at_boundary: false`).

## Endings
Order: an explicit choice (abrupt `cut` / `stop`, `none` and silence by choice are valid, not defects) > the track's own natural ending when its end plays out > an edit that crossfades into the track's analysed closing section > a procedural resolved cadence > a fade only as the declared last resort (flagged). Kinds: `ENDINGS` plus `resolved_cadence` and `crossfade`.

## Changes
`arrangementImpact(before, after)`: a different track, sections, edit, ending or stem set means re-evaluate the edit (`fitGuard`, `trackChangeImpact`); the same arrangement with different dB lanes is gain-only and rebuilds nothing visual.

## Procedural score
`proceduralHooks(arrangement)` returns `{energy_scale?, section_energy?, ending?}`; `procedural-score.buildPlan({arrangement})` and `original-score.mjs render --arrangement <file>` honour it (section energy, a ring-out/decay tail up to 2.4 s when the film leaves room, a shorter stop/cut tail). Without it every output and seed is byte-identical to before. Nothing is rendered by the planner.
