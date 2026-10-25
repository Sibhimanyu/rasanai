# Single units and revising an existing video

> Moved verbatim from the former single `SKILL.md`. References such as "§3d", "rule 18", "below" and "above" point into the sibling guides: the five-call contract and the hard rules are in [shared-contract](../shared-contract.md); the phase guides are listed in `SKILL.md`.

For a new single motion unit (title, sting, stat hit, lower third) follow [routes/motion-graphics](../routes/motion-graphics.md). Revising a finished film:

## Revise an existing video

Push the current film to the Final (its render, markers from STORYBOARD.md) and take notes there. After applying notes, record the ones that name a mistake any film could repeat with `lessons.mjs add` (see Notes, above). Notes that change the story or the style reopen the Story or the Look or Animatic in a new `$RUN` (scenes.json can be rebuilt from STORYBOARD.md), then `video.mjs write --project-dir videos/<name> --decisions … --revise` (it moves the built frames, audio and renders into `.superseded/<stamp>/` and rewrites the plan). A different aspect needs a new project. Single units revise with `handoff.mjs --revise --reopen <steps>`.
