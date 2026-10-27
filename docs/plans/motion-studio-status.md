# Motion Studio: status ledger

Merged in PR #188 (feature/motion-studio). Contracts: `motion-studio-contracts.md`; licences: `motion-studio-licenses.md`. Definitions follow the plan: Implemented and tested, Implemented (integration pending), Experimental, Documented only, Blocked. "Tested" here means one small fixture smoke (`scripts/tests/motion-studio.mjs`), not a full selftest.

## Features

| Feature | Status | Note |
|---|---|---|
| Reference-motion analyzer and crew packet (`reference-motion.mjs`) | Implemented and tested | fixture smoke; fast mode only |
| Reference recipe (`lib/reference-recipe`) | Implemented and tested | two example recipes |
| Motion kit catalog (32 items, 8 families) and `motion-kit.mjs` | Implemented and tested | list, suggest, inspect, scaffold, check |
| Kit runtime `rasan-motion-kit.js` | Implemented, integration pending | 12 of 32 mechanics; 20 report `implemented: false` |
| Element index (`element-index.mjs`, `data-el`) | Implemented and tested | derived, stale detection |
| Editor patch (`editor-patch.mjs`) and `motion-edit` console action | Implemented and tested | fixture smoke of the text edit path |
| Rasan3D recipes (`stage3d/recipes`) | Experimental | 6 recipes; only 1 is browser-gated |
| Renderer adapters doctor | Implemented and tested | HyperFrames only |
| Skill routing (`references/motion-studio.md` via `skill-map.mjs`) | Implemented, integration pending | opens only on the stated conditions |
| Studio: reference chip, Motion inspiration, Motion library, Final inspector | Implemented, integration pending | builds; never opened in a window |
| Licence ledger | Documented only | engineering notes, not legal advice |
| OpenFilm, Remotion, Rive adapters | Blocked | P2: disabled placeholders, off unless `RASANAI_ADAPTER_<ID>=1` |

## Known gaps

- 20 of 32 kit mechanics are catalogued but not implemented.
- 5 of 6 Rasan3D recipes are not browser-gated.
- The Studio views were not opened in a window, so their layout and behaviour are unverified.
- No `selftest.mjs` and no delivery-quality render were run for this work.
- OpenFilm, Remotion and Rive adapters are disabled (P2).
- The fixture has no x/y/scale tokens, so `apply-simple` position and scale edits are only exercised on text.
- Studio passes no build digest with an edit, so staleness is not checked from the app.
- Two pre-existing `DirectorTelemetryTests` failures remain in the Studio test run.
- The GSAP Standard License clause (no competing no-code visual animation builder) needs a re-check against the element inspector; the licence text was not retrievable.
- `remotion-dev/skills` has no licence file; treat it as ideas only.
