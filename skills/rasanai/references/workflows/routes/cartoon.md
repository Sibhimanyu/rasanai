# Route: character cartoon (`character-cartoon`, built in W5)

A short hand-painted cartoon with one recurring original character, drawn by Rasan2D. Same five calls as any film ([shared-contract](../shared-contract.md)); the route is a scene route (`general-video` under HyperFrames, an explicit alias in `video.mjs`).

1. Read [2d-character](../../2d-character.md) in full: the API, the 31 emotions, the actions, the quality bar.
2. `crew.mjs plan --route character-cartoon`: a film of 45 s or less is one film builder (direct); longer uses scene animators. One `character-designer` phase runs after the Look and before the hero frames, and writes `RUN/cast/<id>/identity.json` plus the model sheet.
3. Build with `stage2d.mjs install | scaffold | stills | check`. Gate: `stage2d.mjs check` then `motion-gate.mjs`.

The actor is never redesigned per shot; the score's `cast[].canon` is the only link to its identity.
