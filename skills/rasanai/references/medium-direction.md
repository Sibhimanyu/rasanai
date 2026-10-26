# Medium-native direction

Read by the design desk, frame designers, the frame juror, the Motion Director and the builders when the Look names a visual medium (pixel, paper, line, clay, vector, mixed...). A film in no particular medium reads nothing here. The medium is a choice of **how the picture acts**, not a skin.

## What the contract is

`design/<label>/medium.json` (`medium-contract@1`, `scripts/lib/medium-contract.mjs`) extends the **approved Look**. It names the layers (each with a role: evidence, editorial, environment, character, annotation, type), the invariants (hard: proof, brand, authorization; medium: what keeps the material true), the native actions and where they bind. It owns visual behaviour only. Timing is `motion/score.json`; approval is the user's Look choice; the Director owns the film. You get a projection (`projectMediumForWorker`), not the whole plan; the digest it carries says when it is stale.

## Before the Look: a small concept, not a storyboard

Per candidate, in a few lines (`creative/brief.json` proposal, beside `medium-selection.json`): premise and takeaway; the native material of the product or topic; one or two visual events, or why this film needs none; how the medium makes the event meaningful; what stays literal evidence and what is editorial; one reference principle to use and one thing not to copy; the biggest uncertainty and an honest implementation alternative. All Look options draw the SAME approved beat and content; they differ in composition, protagonist, spatial logic and material behaviour. No full storyboard until Story and Look are approved.

## Native actions drive the picture

Finish this sentence for the beat: *Because this film uses [medium], the idea is expressed by [specific visible change], which helps the viewer understand [takeaway].* Good: paper strips regroup to separate two meanings; a line reveals a cause; a sprite hesitates, then finds the route. Weak: the same text flies in with a pixel font; a texture or font swap on an ordinary card (that is not style fidelity); particles because it should look premium. Typography is optional: use it where it serves the brief. Stillness, a hard cut, flat design and quiet are all valid. No mascot, pixel, clay or morph quota; no physical metaphor where the real interface is the clearest proof.

## Boundaries that never move

Exact proof, product UI, numbers, qualifiers, brand constraints, rights and the user's approval stay as the source says. An editorial layer is never presented as the product's UI. A creative preference is overridable; truth and authorization are not. A described style, a source module and a verified example are different states: say which one you are using; never call a medium verified because it compiles. If the medium cannot be built with what exists, say so and offer an explicit hybrid; never silently fall back to animated type.

## Reviewing a medium

Judge medium fidelity, communication, action legibility, set-level coherence and execution of the approved idea, each against what the Look chose. A flat vector frame is not marked down for missing depth of field; a deliberate stepped cadence is not a dropped frame; a locked camera is not a failure. A profile flag does not excuse unreadable text, a freeze nobody chose or a picture that has nothing to do with the idea. Name what stills cannot show (motion, cadence, timing, sound) as `not_assessable`. Hard proof and permission defects are separate from taste. Taste gets one targeted repair inside the budget, then an honest limitation; no open-ended polish loop.

## Short strings for the existing Look card

Prepare these as plain text for the fields the card already shows (no new field): `one_line` (the medium and what it does for this story), `why_for_story` (one line), and the trade-off in `frames/LIMITS.md` when proof or a font is limited ("exact screen stays full-resolution; the pixel layer carries the guide").
