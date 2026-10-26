# Implementation report - Style Intelligence Part 2

Status: **implemented_unvalidated**. Nothing here was run, tested, rendered or committed. Written by lane D (integration docs); lanes A-C report their own work, which the lead assembles in INTEGRATION_RECEIPTS.md.

## Lane D changes (static only; `node --check` on edited `.mjs` files)

- `skills/rasanai/scripts/skill-map.mjs`: new `MEDIUM_DEEPER`. `references/medium-direction.md` (look, styleframes, animatic) and `references/medium-examples.md` (styleframes, animatic) are added to a phase's reads only for scene routes and only when `--run <dir>` has `creative/medium-selection.json` or `design/<label>/medium.json`. The static route map is unchanged, so no unconditional large prompt. `checkMap` now requires both files to exist.
- `skills/rasanai/SKILL.md`: one short "Medium guidance (conditional)" paragraph; no duplicated mandate, no change to the five calls.
- Workflows `look-and-design.md`, `art-and-styleframes.md`, `music-animatic-build.md`: one conditional row each in "Deeper references".
- `scripts/tests/style-intelligence-part2/fixtures.mjs`: API name map filled from real export lines (examples to `medium-examples.mjs`, lessons to `medium-learning.mjs`); `medium-reviewCopying` and lesson `record` left unmapped; runtime scene modules documented but not loadable by `need()`.
- This docs set and the TEST_APPROVAL_REQUEST candidate commit and digest. No approval is claimed.

## Not done / not verifiable here

- `skill-map.mjs check` and every test were not run. Links added to the guides were not link-checked.
- No per-medium guide files exist; only the two shared medium docs are reachable. No contradictory active mandates were found by text search in SKILL.md and the workflows, but a full audit was not performed (agents/ and design-desk.md belong to other lanes).
