# Product truth: launch, promo and product films

Applies to the route `product-launch-video` and any launch, promo, product-demo, feature-reveal or app/company launch film (`kind` or `format` launch/promo/product; the Dispatch context says `product_first`). The file name is kept; the rule is **product truth**, not "product first". It replaces the older doctrine that banned metaphor, characters, worlds and illustration on these films: that rule fixed one failed test film (an unrelated museum of tasks in a mismatched look) by banning concept itself, and it made every launch the same card-and-headline ladder. Do not bring it back.

## The one rule

**The claim and the real product must be unmistakable. The form is open.**

A first-time viewer, on a silent first watch, understands (a) what the product does, in one claim, and (b) that this is the real product (its name, its mark, its real UI or its real output, shown, not drawn from imagination). Everything else is a creative choice, and all of these are welcome:

- a metaphor or an invented world, a character or a creature, a game with rules and levels, a myth, a journey, a hijacked format (a manual, a nature documentary, a forecast), an illustration or a painted film, a 3D object, a material study, a song, a type-only film;
- a human moment that returns changed, or a plain run of real uses. A ladder of real UI demos is one option of many, never the default.

What fails is not a vocabulary (museum, world, character) but a film in which the viewer cannot tell what the product is or does. The test is `first_watch`: one sentence that says what a stranger understands by 10 s and by the end, with the sound off. The invented-museum film failed that test (the product appeared at 19 s of 30, the labels were cryptic, the end line was tiny), not because it was a museum.

## What stays fixed

1. **The real product appears and is honest.** By 60% of the film at the latest (G7 errors after that; it warns after 40%), the real product is shown or named: its UI (captured, or faithfully recreated in HTML/CSS with the real labels), its output, its mark. A concept film may hold the product back for its turn; it may not hide it until the end card. A letter, shape, character or object may become the real product surface: that is the payoff of many of the best ideas.
2. **The claim is said or shown plainly.** A `claim_line`, `payoff_line` or `last_line` carries it in words a person would say, or one picture a stranger cannot misread. No riddles as the only carrier.
3. **Facts are true.** Only claims from `research/claims.json`; every UI label real; no invented capability. A fictional example is labelled as one. System-UI imitation (a full-frame fake OS dialog, a store sheet) is rejected by ad platforms: open on the phone in a hand, then push in (G7 `system-ui-pose`).
4. **Continuity implies a claim.** A carrier that runs unbroken across different places tells the viewer those places are one thing: set `continuity: { across, claim }` (G4 `continuity-claim`).
5. **Readable words.** A line meant to be read rests inside the safe area (6% of width and height), on one or two lines, is never cropped (a deliberate push-through of 1.2 s or less excepted). Short plain lines read best on a launch (G7 warns above 6 words); a type-poem or song film may set its own measure.
6. **A clear end.** The required end line (`last_line`, `end_line_largest: true`) is the largest type in the film, on a clean card with the product name or mark.
7. **The brand lock** (below): colour, type, logo, UI fidelity, tone.

Defaults that a concept may waive for a stated reason (never gate errors any more): the product UI within 3 s, the hero moment as the longest shot, 2-4 real uses, the launch-film beat table and its timings (G7 warns), 6 words per line, UI filling half the frame. If the idea works better without them, say why in the pitch.

## Shapes follow the idea, and the claim's scope still matters

The truth sheet records the claim's scope (`universal | category | single-task`) and everyday use moments. A **universal or category claim** is told as its range, not as one situation: through a ladder of real uses, or through the range of a world, a journey, a game, a myth, a format or a character that visits many areas of life. G13 measures this for the product shapes (ladder, pas, scenario...) and treats it as advice for the idea-led shapes (`world`, `journey`, `game`, `myth`, `format-hijack`, `type-poem`, `character`, in `story.mjs`). A single-task claim may still be a scenario, or a character, a game or a type-poem about that one task.

The three scripts differ in **idea and style**, not in pace: one organizing idea each, one `style_world` each (G-portfolio: `shared-style-world` errors; same shape or carrier warns). A human-moment story, a visual-world-first story and a wild one (game, myth, format hijack) is the default trio (`agents/concept-writer-*.md`).

## The concept is visual

Every pitch declares `style_world` (an id from `library/styles/atlas/`), `carrier`, `signature_moment`, `sound_mode` (`vo-kinetic | instrumental-arc | sfx-led | song-lyric`) and `shots[]`: `{ t, see, style, carrier_state, move, transition, words }` (a `move` id from `library/moves/`). Words are a layer on top of a picture plan, never the plan. `story.mjs check` runs gate GV on this and flags a pitch whose shots are mostly a UI card and a headline. The user sees the concept as a thumbnail board.

## Real product fidelity

Where the real product is shown, in order of preference: captured screenshots and screen captures (`research/screens/`, `capture/`); else a faithful HTML/CSS recreation with the real layout, labels, type and colours, indistinguishable at video size; never a vague stand-in drawn in place of the UI **when the film claims to show the UI**. Illustration, props and abstract shapes are fine as the film's own world and as carriers; they may not impersonate a real screen. If capture fails, say so in the console (`activity`), recreate the UI and carry on.

## Moves

The Moves pass (`references/moves.md`) runs on these films. The carrier may be a real product surface or the brand glyph, a letter or shape that becomes one, or **the story's own object or character** (any named subject from the idea); `resolves_to` names where it lands: a real UI label, state or screen, the product name, the brand mark, or the story's object. Choreography constraints ("every cut lands on a state change") and a transformation that fills the frame are both good; words stay readable inside the safe area.

## Brand lock

When the brief names a brand (`brand_name` / `use_brand` true) or the product is a known brand, a brand step ALWAYS runs: the brand researcher builds `research/brand/DESIGN.md` from official sources (type, colours, UI language, logo usage, motion), the Director reads it (`brand.mjs read`), pushes it to the console as `brand`, and sets `brand` in decisions. The lock covers **palette, type system, logo, UI fidelity and tone**. It never covers medium, world, finish, depth, camera, shot size or illustration style: a concept may draw the brand's colours and type in clay, paper, pixels, ink or a game world. Style worlds for a branded film are the atlas's, re-coloured to the brand's tokens (`design.mjs check-system` applies the lock). An off-brand look is never recommended.

### Logos are files

The logo on screen is the file the brand researcher downloaded (`research/brand/assets/logos.json`), copied unchanged and placed as an image, with the brand's clear space and the right colour version. Nothing drawn, traced, approximated or generated stands in for it. When no official file could be downloaded (`none: true`), the end card uses the brand name in the brand font and no symbol, and the Director tells the user once. `slop.mjs` (`logo-not-the-file`) fails the film otherwise.

## The recommender

One recommender, originality first (`story.mjs`, `recommendPitch`): among the pitches that pass, the one with the highest originality and memorability, and never one with originality 3 or less while another passing pitch scores 4+. "The sure one" is a preference, not a requirement: the portfolio warns, never fails, when no pitch scores 4+ on feasibility (feasibility is the builder's problem, solved by the move sketcher and the style frames). The script editor and the Director state `first_watch` for the recommendation.

## The concept gate (before the expensive work)

After the script and look calls and before motion planning, a **concept critic** (`agents/concept-critic.md`, one quick pass) scores the chosen concept against the literal brief:

1. **Product truth**: is the claim unmistakable, and is the real product shown (name, mark, real UI or output) by 60%? A metaphor is fine; a riddle is not.
2. **Visual plan**: are `style_world`, carrier, signature moment and a real shot list present, and does the film read as pictures first, not a card tour?
3. **Distinctness**: does the idea differ from its siblings in idea and style, not just order or pace?
4. Tone matches the brief's own words; the end line is large and clean; on-brand (colour, type, logo).
5. First watch: understandable with no explanation.
6. Scope: does the story's range match the claim's scope (S_max, D, an 8-word retell)? Advice for idea-led shapes, a hard check for the product shapes.

Verdict `pass` or `fix` in `story/concept-check.json`. On `fix`, the concept is rewritten from the findings before anything is built; re-run once. Record: `console.mjs push --step concept --status done --data '{"decision":"Concept gate: pass. ..."}'`. A failing concept is fixed here for cents, not at the Final for hours.
