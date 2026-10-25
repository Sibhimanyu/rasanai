# Call 3: Look, design systems, brand lock and the concept gate

> Moved verbatim from the former single `SKILL.md`. References such as "§3d", "rule 18", "below" and "above" point into the sibling guides: the five-call contract and the hard rules are in [shared-contract](shared-contract.md); the phase guides are listed in `SKILL.md`.

## 3 · Look (three design systems for that story)

**A lyric video has no separate look picker.** The chosen treatment's `style_bible` is the look: palette (one owned accent), type roles, the signal motif, tone and bans. The same desk builds it out: after the user picks a treatment, dispatch ONE design-system designer with that treatment's label (`crew.mjs brief --role design-system-designer --key <label>`; the bible's palette, type roles, signal motif, tone and bans are fixed, the designer adds everything a build needs), gate it with `design.mjs check-system`, and `design.mjs choose-system --run "$RUN" --label <label> --decisions "$RUN/decisions.json" --preset <closest preset id from presets.mjs suggest>` (the workflow's gate requires frame.md to stay a verbatim preset copy, so the preset is only the technical frame; the system binds through DIRECTION.md, `motion-md.mjs write --design-system` and DISPATCH). Push `look` done with the bible as the decision ("<treatment>: ink and bone, one orange accent, grotesk + mono"), skip the gallery, and go to the Animatic.

**The design desk** (`references/design-desk.md`). The user does not browse styles and you do not pick one from a list. After the story is chosen, with `research/design-refs.json` accepted, dispatch the three **design-system designers** (`crew.mjs brief --role design-system-designer --key Sure|Bold|Wild`, in parallel). Each blends 2 to 4 references from the internal library (`library/`: researched design systems and motion and camera styles; `scripts/library.mjs search|show`) with the subject's own visual world into ONE new system for this story: `design/<label>/DESIGN.md` (colours by role, real loadable type, radii, shadows, components, a `## Motion and camera` section with timings, eases and the camera grammar, do's and don'ts), `recipe.json` (the live specimen) `blend.json` (which references, which traits, why) and `grammar.json` (the look's ONE motion grammar from `library/grammars/`, or a bespoke one in the same schema; the three looks use three different grammars, a flat film never gets a `flat_ok: false` one; `references/design-desk.md`). With a brand DESIGN.md, **Sure is the brand extended for motion** (its colours and type exactly); Bold and Wild push around it. **On a branded launch, promo or brand film the desk uses no library, designer or director references at all** (rule 19): the look is `brand-film/FILM-STYLE.md` (Sure exactly; Bold and Wild the same palette, type, motif and motion vocabulary, varying composition, pacing and emphasis), `blend.json` cites it (`film_style`, `film_style_takes`, `references: []`), and `check-system` rejects an off-card palette or typeface or a missing citation. Accept each on `crew.mjs check` (it runs `design.mjs check-system`: parses with canvas, ink, accent and display font, ink on canvas at 4.5:1, fonts real, no generic default, at least two real library ids, a Motion and camera section that names timings, eases and a camera), then `node $SKILL_DIR/scripts/design.mjs check-systems --run "$RUN"` (the three must differ in at least three of palette, display face, layout and motion language). The 403 presets in `taxonomy/presets/` are raw material the designers may cite, not a menu.

```bash
node $SKILL_DIR/scripts/design.mjs look-payload --run "$RUN" --hook "<the story's first on-screen line>" [--recommended sure|bold|wild] --out "$RUN/look-payload.json"
```

**On a scene route the three systems are shown as pictures of this story** (`look-heroes` phase): once `check-systems` passes, dispatch three styleframe designers (`crew.mjs brief --role styleframe-designer --key heroes-Sure|heroes-Bold|heroes-Wild`, in parallel), each drawing ONE representative approved beat (`design.mjs compare-plan` names it; the same content, copy and evidence in every look) in its system into `design/<Label>/frames/representative.{html,png}` (a second frame only for a stated real uncertainty; accept on `crew.mjs check`). Storyboard and production work wait for the committed Look. `choose-system` also writes `look/visual-bible.json` (a digest-stamped projection of DESIGN.md and the motion contract for workers; `design.mjs bible-for --scene <id>` gives one scene its subset) and a look change such as "same typography, less glossy" is a bounded revision (`design.mjs look-revise`), Story preserved; `look-payload` adds them to each style as `frames`, and the tile shows them under the specimen.

Push `look` with that payload (`styles: [{id, name, blend, why, label, references, style: {recipe, three?}, frames?}]`, `recommended`, `hook`): the console draws exactly those three, live, from their recipes (a system with a `three` hint through Rasan3D, the rest as the CSS specimen), each with its name, the blend in one line and why it fits this story. Be the art director on `recommended`: the system that makes this story strongest, not the safest, **and never an off-brand one**: with a brand (rule 16) all three systems are the brand's own palette and type (`design.mjs check-system` / `check-systems` / `look-payload` enforce it from the run's decisions) and differ in composition, motion and density. Never push a preset gallery, never list style names from memory.

Answers:
- `choose <id>` (`sure`, `bold` or `wild`) → `node $SKILL_DIR/scripts/design.mjs choose-system --run "$RUN" --label <Sure|Bold|Wild> --decisions "$RUN/decisions.json"` (the chosen DESIGN.md becomes the film's look: `look/DESIGN.md`, `look/frame.md` through the DESIGN.md to frame.md path, its taxonomy picks in decisions), then `motion-md.mjs write --design-system "$RUN/design/<label>" --out "$RUN/motion.md" --mode auto --reason "<why>"` (its motion contract binds the film) and `direction.mjs compile --decisions "$RUN/decisions.json" --out "$RUN/direction"` (DIRECTION.md carries the system's blend, subject world and Motion and camera). Push `motion` and `transitions` (baseline + signature, from craft.md) done with reasons, close `look`, and record `memory.mjs record --step style --value <system name> --mode confirmed`.
- `more {near, exclude}` → ask the design desk for new blends near the selected system (re-dispatch the three designers with the selected system's `blend.json` as the anchor and the excluded names to avoid), gate them, re-push. `knob {name: "energy", value: calmer|as is|punchier}` → the designers shift the motion language of the selected system (calmer: slower, softer eases; punchier: snappier) and re-push.
- Footage routes (`embedded-captions`, `talking-head-recut`): the looks are three caption / overlay identities on the footage; `music-to-video`: the story step already chose the world (three treatments, above); the look is that treatment's style bible.

**A saved custom style** (`<library>/Styles/<slug>`) is used only when the owner names it or a Series carries it: bind it first (`custom-style.mjs bind --style <dir> --run "$RUN" --as-look`) and skip the design desk for that film only. Otherwise the three bespoke candidates are unchanged. Everything about custom styles (create, edit classes, brand lock, test film) is in `references/custom-styles.md`.

## 3b · Concept gate (before any expensive work)

Once the Look is chosen and **before** the music, the motion score, key frames or any animation (rule 17), run the concept critic: a quick Sonnet pass that scores the chosen script and look against the literal brief.

```bash
node $SKILL_DIR/scripts/crew.mjs brief --run "$RUN" --role concept-critic --key concept-1     # dispatch it (Sonnet), then accept it:
node $SKILL_DIR/scripts/crew.mjs check --run "$RUN" --role concept-critic --key concept-1     # writes/validates story/concept-check.json
```

On a branded launch film the critic also holds the look and script to the card (on_brand = FILM-STYLE.md; the script follows the launch-film structure, simple and to the point). Seven questions, each answered with evidence (`references/product-first.md`): the product on screen within 3 s? the hero moment present? the tone matches the brief's own words? the required end line large? on-brand? understandable on first watch with no explanation? one feature, shown as one viewer doing one real task (no feature tour, no metaphor)? On `fix`: rewrite the script (the writer, from its exact fixes; re-run `story.mjs check`) or adjust the look, re-run the critic once, then go on. Record the result: `console.mjs push --run "$RUN" --step concept --status done --data '{"decision":"Concept gate: pass (7 of 7): <summary>"}'` (on a fix, say what was rewritten and why). Never start the score on a failing concept; if a rewritten script changes what the user approved, tell them in one console `reply` line.

**Thumbnails, the structure critic, then timings** (scripted scene routes; after the concept gate, before the art, the music fit and the score).

```bash
node $SKILL_DIR/scripts/story.mjs intent --intent "$RUN/story/intent.json"                  # fix its errors first
node $SKILL_DIR/scripts/crew.mjs thumbs --run "$RUN"                                         # one rough per beat on one sheet, each beat's buys under it: story/thumbs/sheet.png
node $SKILL_DIR/scripts/crew.mjs brief --run "$RUN" --role structure-critic --key structure-1 # Opus: reads only the sheet and intent.json; may cut, merge or move a beat, move the peak, ask for a rest or rewrite a buys
node $SKILL_DIR/scripts/crew.mjs check --run "$RUN" --role structure-critic --key structure-1 # applies the edits to intent.json, chosen.json and scenes.json together (backups *.pre-structure.json)
node $SKILL_DIR/scripts/crew.mjs thumbs --run "$RUN"                                         # again, when beats changed
node $SKILL_DIR/scripts/scenes.mjs --scenes "$RUN/scenes.json" --intent "$RUN/story/intent.json" --retime   # only now: durations from each beat's read time and importance
```

A board or `story/thumbs/NN.png` replaces a grey box on the sheet. The check applies the critic's edits itself, so there is no step that routes findings back to the writer. A `peak` edit steps the old peak down to importance 2 by itself. The concept critic also answers `turn_reverses` and `payoff_answers_setup`.

## Design systems

Every film's look is a complete design system: the chosen `design/<label>/DESIGN.md` (colours by role, typography, radii, shadows, components, motion and camera, do's and don'ts) that any agent or tool can build from; it is copied to `$RUN/look/DESIGN.md`. When the user wants their film's look for the rest of their product, hand them that file. (`design-system.mjs export --id <preset>` still writes a raw-material preset as a DESIGN.md.) `library/styles`: 26 style references (lemo-opuscar, mg-styles-15; MIT) the design desk pulls 1 to 3 of per look; every DESIGN.md also carries `## Signature features`, 3 to 6 traits the frame juror and the critic hold the film to.

## Deeper references for this guide

The canonical homes of the detail this guide points at (read the one the current step needs):

| Need | Read |
|---|---|
| the design desk: bespoke design systems per film, the library, file formats, the gate | `references/design-desk.md`, `agents/design-researcher.md`, `agents/design-system-designer.md`, `scripts/library.mjs`, `scripts/design.mjs` |
| the raw-material preset library (403, not a menu): preset fields, recipes | `taxonomy/presets/SCHEMA.md` |
| the taxonomy, decisions.json, DIRECTION.md, suggest/analyze/compare | `references/direction.md` |
| a project's DESIGN.md as the look: shapes read, roles, fonts, frame.md conversion | `references/brand.md` |
| data-viz honesty, the scale dive and RasanSim, one style rule per film, the end-clip handoff, metaphors for explainers only (conflicts with product-first) | `references/dataviz.md`, `references/scale-dive.md`, `references/style-rule.md`, `references/end-clip-handoff.md`, `references/metaphor-bank.md`, `runtime/rasan-sim.js` (RasanSim: cursor-driven physics, pre-simulated and seek-safe; `video.mjs inject` installs `assets/rasan-sim/`) |
| the motion-language terms and their contracts | `taxonomy/dimensions/motion-language.json`, `references/personalities.md` |
