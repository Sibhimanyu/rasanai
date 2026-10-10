# Moves: how a film's transformations are invented

The brief for the move-inventor, the move-juror, the move-sketcher and the Motion Director. A **move** is a transformation of one carrier across a boundary: a letter becomes a dot, the dot becomes a pupil, the pupil's white becomes the next page. It is never a technique name. Data for this pass lives in `library/moves/` (`generators.json`, `library.json`, `stimuli.json`, `choreography.json`, `banned.json`); the CLI is `scripts/moves.mjs`.

## 0. Why: the label problem and the carrier

Left to itself, Claude plans motion in technique names: "match cut to scene 3", "iris wipe", "zoom-through", "shared-element". Those are the highest-frequency tokens in motion writing, so they are the centre of the distribution. A label tells you how a cut behaves and never what object crosses it. A film planned in labels is competent: every beat is right and none is surprising, every scene starts from a clean background, every seam is a different trick.

Human designers do not choose a transition. They pick a **carrier** (a shape, glyph, object, line or point of attention) and ask what it can become; the transition is a by-product of the carrier's path. Saul Bass wanted "one visual element to serve as the film's symbol". Kyle Cooper: titles "must be born out of the content of the film itself".

The bar: the "o" of "Your" fills orange and grows a pupil; it is thrown up and a giant cat eye rises whose pupil lands where the small one was heading; the pupil narrows to a slit and "Creative" slides out from behind it; the eye-white scales past the frame and is the next page. **One circle**, letter to dot to pupil to eye to page, every boundary with a named constant. About nine ideas in eleven seconds, none of them a label.

Four rules follow, and the checks enforce them:

1. **The unit of planning is a carrier plus a state change**, not a transition.
2. **Content first.** No move is proposed until the atoms of the film (nouns, verbs, glyphs, UI, brand geometry) are listed and mined.
3. **Every boundary has a bridge frame**: the one frame where both sides are true.
4. **Every move names its origin**: the exact atom it is built from. If the card would work unchanged in another brand's film, it is a gimmick and it fails.

You tend to converge toward the safest on-distribution storyboard: the transition names from the standard menu, applied to the most literal reading of the brief. That output is the failure condition. Make deliberate, opinionated choices specific to this subject. Where the brief leaves an axis free, do not spend that freedom on a default.

## 1. The procedure (11 steps)

Do each step, even if you think you do not need to. Each step writes text the next step reads. Ideation is separate from feasibility: while you diverge (steps 3 to 9) do not filter on build cost, brand tempo or runtime. A separate agent finds the cheapest honest way to build the winner (card `build.simplest`). Coverage and boldness first; the juror filters afterwards.

**Step 1. Thesis and one image.** One sentence: "This film is about ___, and its one image is ___." (`thesis`, `one_image`.) The one image is usually already in the script as a noun, a pun or a UI element. If you cannot name it, stop and find it. Example: "A designer who makes you see things differently; the one image is an eye."

**Step 2. Content atoms.** List at least 8 (aim for 10 to 15): every noun, verb, number, name, UI label and sound in the script, the letters of key words (glyph mining), and the geometry of the brand mark or the product's primary shape. Each atom carries its `kind` (`glyph|noun|verb|number|name|ui|brand|shape|sound`) and `from` (the beat and field it came from).

**Step 3. Affordance mining.** For at least 5 atoms, write six rows. This is "what can this become?" run along six axes:

| Axis | Question |
|---|---|
| `looks_like` | What else has this silhouette, colour or proportion? (an "o": eye, ball, sun, coin, lens, record, button, zero) |
| `has_parts` | What are its sub-shapes: counter, dot, stem, bowl, notch? (an "o" has a hole; an eye has a pupil in a ring) |
| `does` | What verb does it perform: spin, blink, open, fill, drop? |
| `means` | Pun, homophone, idiom, word in another sense. |
| `opposite` | Reverse, delete, negative space, the inverse. |
| `scale` | What if it were tiny, or the whole world, or the next page? |

Then run the seven SCAMPER verbs once over each atom (Substitute, Combine, Adapt, Modify, Put to another use, Eliminate, Reverse), especially Combine (fusion) and Eliminate (negative space).

**Step 4. Bridge search.** Lay the beats in order. For each adjacent pair look for any shared row from step 3: shared silhouette (`silhouette`), shared part (`part`), shared verb (`verb`), shared pun (`pun`), shared colour (`colour`), shared screen position (`position`), shared motion vector (`vector`), a shared real UI element (`ui`). Write one `bridges` entry per boundary: `{from, to, shared, what}`. Rank by surprise times legibility: a shared silhouette is cheapest, a pun is richest, a shared vector is the most invisible. A boundary with no bridge is a hole; find one or change the story's hand-off.

**Step 5. Choose one carrier.** The object or shape that appears in the most bridges becomes the protagonist (`carrier: {what, short, why, beats}`; `short` is the carrier in 8 plain words at most, such as "the logo's play triangle": the person choosing the story reads it, and it is an error when missing or longer). It must be in at least half of the beats. Two competing carriers: merge them or demote one to background. At most one secondary carrier for contrast. A film has one carrier for the main chain.

**The carrier comes from your family.** The three scripts of a run are invented in parallel and never see each other, so the pack (`moves.mjs pack`) assigns each label a different carrier family, drawn by code from hash(run basename + seed): `family`, with `family_description` and `family_examples`. Write it as `carrier.family`. The families: `glyph` (a letter, punctuation mark, dot, caret or numeral as type), `component` (a real UI part: button, field, card, bubble, toggle, cursor), `line` (a stroke, rule, border, underline, tick, path, progress bar), `object` (a real thing from the content: the receipt, a photo, a document, the product's hardware), `mark` (the brand mark's geometry), `data` (a number, chart, list or table that changes). The other two scripts got the other families, so a dot is not yours unless your family is `glyph`. When the brand film card or the brand's DESIGN.md names a motif (OpenAI's dot), the pack notes it as `brand_motif`: it may appear as a secondary element in any script, but only the label assigned `glyph` (or `mark`) may make it the carrier. The checks: `carrier-family` (in `moves.mjs check`: `carrier.family` missing, unknown, or not the one the pack assigned), and across the three files `moves.mjs check-set --run R` (also run by `check-verdict`): `carrier-repeat` (error: two files share a family) and `carrier-similar` (warning: two `carrier.short` names share a content word).

**Step 6. Ban the obvious three.** Write the 3 most obvious moves for this film, as titles (`obvious`). They are banned: no card may have the same title or origin, or be a variation of them. These are the ones a generic storyboard would give (a match cut from the phone to the next screen; the logo assembling at the end). Also read `banned` in your pack.

**Step 7. Twenty candidates, from the subject world.** List 20 or more candidates (`candidates: [{title, origin}]`), short titles only. Every one **starts from an atom or a mining row, never from a technique name**. A technique name (match cut, morph, zoom-through, shared element, iris, mask reveal, kinetic type) may appear only as the mechanism, never as the idea. Use the generators in your pack as questions (§3), and the stimulus in your pack as a constraint (§2). No two candidates may share a mechanism or a central object.

**Step 8. Make the 8 you like least bolder.** Go through the list. For each candidate ask: could this appear unchanged in a film about a different subject? If yes, rewrite it until it could not. Then make the 8 you like least bolder and more different, and show what you changed (`bolder: [{was, now, changed}]`, at least 8). The "bolder" step is the one that gets skipped when a model considers its own output bold enough, so the diff is required: a `now` identical to `was` is a skipped step.

**Step 9. Move cards.** Write at least 6 move cards (§2) for the best candidates. Every card names its origin, its `scale`, its `resolves_to`, its frames, its bridge and its hand-off; none may name only a technique. At least one hero is a **full-frame** type or shape transformation: the letters or the shape fill the frame and are the stage. A film made only of details inside screenshots is the failure the bar exists to beat. At least two different generators; at most two cards built on the same atom.

**Step 10. Chain ledger and the rhyme.** Write one ledger row per beat (§2). "Constant" is the eye-trace anchor: what stays put across the boundary. Close the loop: a carrier state, a motion or a pun from the opening returns in the last 15% of the film, or the carrier becomes the container of the next idea (`rhyme`). Then write the `chain`: every transformation of the carrier across the film, time-coded, a new idea about every 1.2 s and never a gap over 3 s. Add one personality beat (`personality`), budget one per 8 to 12 s.

**Step 11. Heroes, then argue.** Pick 2 or 3 hero moves (`heroes`: card ids): the moves a motion designer would cut into their reel. One film-defining move (full-frame); one signature seam; at most three. The hero count limits how many cards you *argue* for, not how many ideas the film has: the chain carries the density. Then argue against each in a line: nearest precedent and how this differs (`card.precedent`); where the audience learned the rule (`card.setup`). Spend boldness in one place per scene; everything around a hero stays quiet and disciplined.

You return one file, `story/moves-<L>.json` (the schema is in `agents/move-inventor.md`). When it passes `moves.mjs check`, you are done.

## 2. The move card and the chain ledger

### The move card

```jsonc
{
  "id": "m1", "title": "The o becomes the eye",       // 6 words or fewer; never a technique name
  "beat": 2, "seam": "2>3",                           // where it lands (seam optional)
  "generator": "G1",                                  // the question that produced it
  "scale": "full-frame",                              // "full-frame" | "large" | "detail", required on every card (see Scale below)
  "resolves_to": "the next page",                     // what real surface the transformation lands on; on a product-first film the real UI label, state or screen, the product name, or the brand, logo, mark, cursor, caret or composer
  "origin": "the 'o' in 'Your' (beat 2 on_screen)",    // the exact atom it is built from
  "frame_a": "the white word 'Your', 'o' the same ink as the rest, centre-left",
  "plain": "The o fills orange and becomes an eye that flies off the page.",   // one plain sentence for the person choosing the story: 120 characters at most, no numbers, timings, coordinates or jargon. Required on a hero (error), warned on the rest
  "move": "0.0 to 0.5 the o fills orange, 0.5 to 1.0 a black pupil grows from its centre, 1.0 to 1.4 the eye is thrown up-right with motion blur, anticipation 0.2 s down first",
  "frame_b": "a small orange eye in flight, pupil leading, 25 percent of the frame width",
  "bridge": "the frame where the small pupil's edge touches the giant pupil's rim as the giant eye rises: both eyes are one eye",
  "handoff": "the pupil's centre at (1180, 300), the vector up and right at 2 200 px/s, the orange",
  "says": "the film is about seeing; this is the designer's point of view",   // meaning not already in the words
  "setup": "none needed: the word 'Your' and the pupil read in one beat",     // where the viewer learned the rule
  "precedent": "Vertigo's pupil-spiral; differs: a letter becomes the eye",
  "build": { "route": "svg-morph", "layers": "o as an SVG circle, pupil circle, motion-blur copy", "risk": "the blur copy reads as a double", "simplest": "scale the o, swap to the eye art on the throw frame, keep the pupil anchor" },
  "duration_s": 2.4
}
```

That card is the reference clip's move, shown for the format only; its objects and mechanism are not yours to reuse.

Field rules, in the order the check reads them:

- **`title`**: names what happens to the carrier, not a technique. "The pupil becomes the doorway", not "Iris reveal".
- **`origin`**: a quoted atom, a UI label, the product name, a brand glyph, a letter or a quoted word of the script. Required on every card. Under product-first (§6) it can be any atom of the script (a letter, a dot, a full stop); what must be real is `resolves_to`.
- **`scale`**: `"full-frame"`, `"large"` or `"detail"`, required on every card. `full-frame` means the transformation itself occupies most of the frame at its bridge: the type or shape is the stage, not a detail inside a screenshot. `large` is a half-frame object; `detail` is a part of a UI. A hero with `scale: "detail"` warns, and more than half the cards `detail` warns. At least one hero must be `full-frame` and built on a type or shape generator (G1, G2, G3, G5, G6, G12, G15, G17, G19, G20), or the check fails (`no-full-frame-hero`).
- **`resolves_to`**: where the transformation lands. On a product-first film it is required on every hero card and must name a UI label from the pitch, the product name, or the brand, logo, mark, cursor, caret or composer. On other films write what it becomes (the bar: "the next page").
- **`move`**: what physically happens, in order, with seconds. At least two timed steps. Verbs of the object ("fills", "is thrown", "narrows"), never "transitions".
- **`bridge`**: one sentence, the single frame where both states are true, naming the element and where it is. "Match cut" is not a bridge; "the pupil is at (640, 400) in both" is.
- **`handoff`**: what the next beat inherits: a position, a colour, a vector, a silhouette.
- **`says`**: meaning the words do not already carry. A move that only decorates fails.
- **`setup`**: where the viewer learned the rule. A trick with no setup is not earned (§5).
- **`build.simplest`**: the version that keeps the idea if the full build is too costly. Write it even when you think the idea is easy.

### The chain ledger

One row per beat, forming the carrier's biography through the film:

```jsonc
{ "beat": 4, "t0": 2.8, "t1": 3.6,
  "carrier_state": "solid orange disc",
  "change": "solid orange disc -> disc with a black pupil growing from the centre",
  "constant": "position (centre-left), orange, circular silhouette",
  "bridge": "the pupil's edge is tangent to the rim for one frame, then detaches",
  "move": "m1" }                                       // or null
```

A row that reads `carrier: "scene"` or `bridge: "match-cut"` fails. The last beat's bridge may be "end". `constant` is never empty.

### The chain

The ledger has one row per beat; the **chain** is finer: every transformation of the carrier across the whole film, time-coded in seconds from the film's start, in order.

```jsonc
"chain": [ { "t": 0.0, "change": "the typed line 'Ask anything.' fills the frame, the full stop is a dot" },
           { "t": 1.1, "change": "the dot drops and grows into the composer's send button" } ]
```

Density is enforced: at least `ceil(film_seconds / 1.5)` entries (`chain-sparse`), and no gap over 3.0 s between consecutive entries, from 0 to the first, or from the last to the film's end (`chain-gap`). Film length is the sum of the pitch's beat `duration_s`. The house bar is a new idea about every 1.2 s.

### Worked example: the Tiago ledger

The reference clip, reverse-engineered (timings estimated). One carrier, a circle, in about eleven seconds; every row has a constant.

| # | t | Carrier state | Change | Constant | Bridge | Generator |
|---|---|---|---|---|---|---|
| 1 | 0.0-1.2 | the letters of "Tiago" | delete back to "a" | baseline, ink | the surviving "a" is on the baseline | G17 |
| 2 | 1.2-2.0 | the "a" | morphs to an "o" | the bowl, centre | the bowl is shared by a and o | G15 |
| 3 | 2.0-2.8 | the "o" | "Y" and "u" fly in to make "Your" | the o stays fixed, centre-left | the o does not move while both letters arrive | G19 |
| 4 | 2.8-3.6 | the "o" | fills orange, grows a pupil | position, circle silhouette | pupil tangent to the rim for one frame (the Your/eye pun) | G1, G20 |
| 5 | 3.6-4.4 | the small eye | "Y" and "u" scatter; the eye is thrown up with motion blur | velocity vector | the vector is the same on the throw's last frame and the giant eye's first | G19, G4 |
| 6 | 4.4-5.6 | the giant eye | a dark panel rises; the giant pupil lands where the small one was heading | the landing point | both pupils true in one frame | G4, G2, G3 |
| 7 | 5.6-6.4 | the pupil | the round pupil narrows to a cat slit | pupil centre | none needed: the pupil does not move, only its shape | G7 |
| 8 | 6.4-8.0 | the slit | "Creative" slides out from behind it | the slit as the door | the word is masked by the slit's edge | G5, G6 |
| 9 | 8.0-11.0 | the eye-white | scales past the frame and is the next background | white fills the frame | the white is the next scene's ground | G3 |

The reference clip also ships as the house bar, `library/moves/bar.json` (a textual frame-level breakdown, no frames, nothing third-party): `moves.mjs pack` puts it first in every pack as `bar`. Read it before anything else and match its **density** (about 0.8 ideas per second, a chain entry every 1.2 s) and its **scale** (full frame: the type and the shape are the stage). It is for the bar, never for the content.

Read it for its habits. The constant is always something the eye can hold (a baseline, a centre, a vector, a landing point). Beats 7 and 8 are the show-off beats: one pure personality (7), one pure function (8, it reveals the word). The last beat does not end the carrier; it hands it to the next scene as the container. The first four rows are a morph chain with one cause each.

This example is **for the bar, never for the content**. You may not reuse its objects, its mechanism or its generator mix. An eye, a circle becoming a pupil, a slit, a thrown carrier: not yours.

### From a label to a move: six rewrites

A label names how a cut behaves. A move names what crosses it. Rewrite until a stranger could draw the bridge frame.

| Label (rejected) | Move (accepted shape) | What was added |
|---|---|---|
| "Match cut to the dashboard" | The cursor stays at (640, 400) while the sidebar row behind it becomes the dashboard's page header. | the object, its position, what it becomes |
| "Zoom-through into the app" | The dot of the "i" in the product name scales until its edge leaves the frame; the dot's fill is the new screen's ground colour. | a named point that stays fixed, a part of a glyph |
| "Text animates in on the beat" | Each word is pulled into the line by the cursor like iron filings, and the line releases when the cursor clicks the send arrow. | a cause, a second layer |
| "Smooth transition to the end card" | The last result row stays where it is; everything around it is deleted in reading order until only the row and the product name remain. | delete to create, a constant |
| "Logo reveal" | The brand mark's counter is the window the final screen is already visible through; the window scales to the frame. | the mark's own geometry as a mask |
| "Iris wipe between problem and solution" | The red badge (4 overdue) shrinks to a dot; the dot is the first pixel of the progress bar, which fills across the screen as the number counts to 0. | a UI part, a number that changes, one shape throughout |

If you can only write the left column, the idea is not there yet: go back to the atoms and the mining rows.

## 3. The 20 generators, as questions

Ask the question of an atom or a boundary; do not pick the generator and then look for an atom. Each has a definition, one example, when it fails and a cheap build route. Full data: `library/moves/generators.json`.

**G1 Glyph-as-object.** *What does this letter look like, and what is its hole, dot, stem or terminal?* A letterform's counter, dot or stem becomes a real object. Prefer letters in words that matter (o: eye, ball, sun; i: person, candle, pin; l: pencil, door; c: mouth; s: river). Bass's Vertigo: the eye's pupil radiates spirals. Fails when the letter is in a throwaway word, or every letter becomes a thing. Route: `svg-morph`.

**G2 Shape rhyme across beats.** *What is the plain geometric shape of this beat, and what in the next beat has the same silhouette at the same place?* 2001's bone becomes a satellite on the same trajectory; Lawrence's match flame becomes a sunrise. Fails when the rhyme is only silhouette with no semantic jump (small to cosmic, tool to result). Route: `scale-anchor`.

**G3 Scale-through.** *If I keep zooming into this element, what is inside it? If I zoom out, what is it part of?* A small element grows until it is the next ground. Keep a fixed screen point (the centre of the pupil) during the push. Fails when the anchor is lost. Route: `scale-anchor`.

**G4 Object-born transition.** *What is moving at the last frame, and what does the next beat need first?* The momentum carries the cut: velocity-matched, cut at peak speed. Juno walks behind a tree and the world changes on the far side. Fails when speed or direction does not match; "if you cut at frame six, continue from frame seven". Route: `dom-flip`.

**G5 Negative-space reveal.** *Which part is empty, and what could live in it?* Something slides out of a gap or outline. Anatomy of a Murder's cut-out silhouette. Fails when the revealed element leaks outside the shape or the opening is too small to read. Route: `clip-mask`.

**G6 Mask-from-content.** *What shape here could be a window?* A scene element's shape is the window onto the next content. True Detective's double exposure. Fails when the window content is generic. Route: `clip-mask`.

**G7 Behavioural beat.** *What would this object do if it were alive?* A shape looks, blinks, hesitates, startles. The Pink Panther treats the credits as a playground; Google's dots listen, think, fail. One per 8 to 12 s. Fails when the personality contradicts the brand's tone. Route: `svg-morph`.

**G8 Line-becomes-path.** *If this stroke were a track, who rides it?* A line drawn in one beat is the route the camera follows in the next. Lord of War's bullet; Game of Thrones' map. Fails when the path has no landmarks. Route: `path-follow`.

**G9 UI element becomes stage.** *What if this component were a room?* A real button, card or window expands to be the environment (container transform). Only with the real UI. Fails when the UI is fake or the expansion hides what the product does. Route: `scale-anchor`.

**G10 Number-becomes-object.** *What is the unit of this number, physically?* A statistic is rendered as the thing it counts. Fails when the object is not recognisable at small size, or the number is not sourced. Route: `dom-flip`.

**G11 Cursor, hand or camera as character.** *Who is looking or clicking, and what do they want?* The pointer is a protagonist: it hesitates, hunts, overshoots. Fails when it does a stock click-and-zoom with no motive. Route: `path-follow`.

**G12 Kinetic semantics.** *What physical verb is this word, and what is the surprising but inevitable version?* The text behaves like its meaning, on a second layer (cause, personality, pun). Ferro's mismatched hand-lettered sizes. Fails when the literal is the only layer. Route: `split-text`.

**G13 Container swap.** *What frame is this content in, and what other frame could hold it?* The same content moves between containers (page, window, card) while one object continues. Catch Me If You Can's stamps. Fails when the new container needs explaining. Route: `dom-flip`.

**G14 Oner logic.** *What leaves the frame at the end of this beat, and what enters at the start of the next in the same direction?* One continuous shot; every cut hidden by a matched vector. Fails when continuity is the only idea. Route: `path-follow`.

**G15 Morph chain.** *What is the shortest sequence of legible intermediates between these two ideas?* A to B to C to D, each held for a beat. Buck's "Metamorphosis". Fails when intermediates are blobs. Route: `svg-morph`.

**G16 Artefact as author.** *What would the person or product physically produce?* The motion is made with the subject's own craft (stamps, tickets, redlines). Se7en's scratchboard. Fails when the artefact look is the only idea. Under product-first, only the product's own real artefacts. Route: `other`.

**G17 Delete to create.** *What if we get there by taking away?* The end state emerges by deleting in an order. Fails when deletion reads as a glitch. Route: `split-text`.

**G18 Rule and break.** *What rule does the film teach in its first 3 s, and where does breaking it once matter?* Establish a pattern and break it once. Stack's metronome and its planned irregularity. Fails when the break is arbitrary. Route: `other`.

**G19 Scatter and assembly.** *What is the physics of this assembly, and who is pushed out when the hero arrives?* Parts fly in or are scattered with a visible cause. Fails when scatter is generic energy. Route: `split-text`.

**G20 Double image (fusion).** *What if source and target were one object?* Two readings occupy one shape. Fails when the viewer cannot name both halves in 1 s. Route: `svg-morph`.

Cheapest builds in HTML and GSAP: G2, G3, G5 and G6 (clip-path or SVG mask), G15 (SVG path morph), G17, G19. Costlier: G14, G8 (path-following camera), G9, 3D variants.

### The pack

The Director runs `moves.mjs pack --run "$RUN" --label <L>` before dispatching you. It writes `story/moves-pack-<L>.json`, drawn by code so the three inventors get different ammunition:

- **family** (with `family_description`, `family_examples`, `family_rule`): the carrier family assigned to this label, different from the other two labels'. Your carrier comes from it (§1 step 5). **brand_motif** (only when the brand names one): allowed as a secondary element; only `glyph` or `mark` may carry it.
- **bar** (always first, a separate key, not counted among the exemplars): the house bar, `library/moves/bar.json`, a frame-level textual breakdown of the reference clip with its cards, `scale`, `density` and `lessons`. Read it before anything else; match its density and scale. The bar, never the content: never reuse an eye, a pupil, a slit, a thrown carrier, or a circle that becomes an eye.
- **exemplars** (2 or 3 moves from `library.json`, or the user's reference moves first). Use them for the bar and for the shape of a move card. **Do not reuse an exemplar's objects, metaphors or mechanism.** The check warns when a card's title shares 3 content words with one.
- **generators** (all 20, shuffled): questions, not techniques. Use at least three of them.
- **stimulus**: one distant concrete thing (or, in a product-first film, one choreography constraint). Your moves must incorporate it at moderate conceptual distance from the subject. If it cannot serve the story, say so and justify the closest workable twist in `seed: {stimulus, used, how}`. "Used: false" needs a reason of a full sentence. You do not choose the stimulus; picking your own random object clusters (tree, leaf).
- **banned**: named clichés, each with its positive alternative, plus the hero moves the last 12 films used. The ban is on unchosen defaults, not on the technique: a banned idea may appear if you have a reason that is specific to this subject and you state it.

## 4. The showreel checklist and the competent tells

A film is showreel-level when it has: idea density, an unbroken eye-trace, a carried motif, a payoff that rhymes with the opening and at least one personality beat. Competent means every beat is correct and none is surprising.

**Checklist** (numbers are tunable defaults):

1. **Idea density.** An "idea" is a state change a viewer could describe in one clause. At least 0.5 per second under 15 s, 0.25 per second for 30 to 60 s. Count them in the chain; the bar is 0.8 per second. The check enforces the floor of one chain entry per 1.5 s and no gap over 3 s.
2. **Eye-trace.** At each boundary the thing the eye is on in the last frame is the thing it is on in the first frame (position, size or vector). The ledger's `constant` is never empty.
3. **Anticipation and overlap.** Every big move has a wind-up; the next begins before the last finishes. No dead stops unless a deliberate hold (0.3 to 0.5 s after a transformation completes; 0.8 to 1.2 s on the beat that carries copy).
4. **Rhythm.** Hits land on beats; irregular accents break predictability.
5. **Carried motif.** The carrier is in at least 50% of beats (the check) and ideally 70%.
6. **Rhyme.** A last-quarter beat answers a first-quarter beat.
7. **Personality.** At least one behaviour that is characterful rather than informative.
8. **Earn the trick** (§5).
9. **Legibility.** Every intermediate state is recognisable. Freeze any frame: it is a good poster.
10. **Restraint.** One signature move per scene at most; everything around it quiet. A carrier's chain of transformations is ONE signature and ONE motion type (morph), however many steps it has: restraint is about unrelated ideas, not about the number of transformations of one carrier.
11. **Scale.** At least one hero is full-frame: the transformation fills most of the frame at its bridge.

**Competent tells** (any one means "rewrite the plan"):

- A transition name sits where a carrier should be ("match cut to scene 3").
- Every scene starts from black or a fresh background; nothing is carried.
- A different graphic language per beat (a new motif each scene).
- Text appears by fade, slide or scale with no reason tied to meaning.
- No beat would surprise someone who has read the script.
- No beat has a cause: nothing moves because something hit it.
- The ending is a logo on white with no relation to the opening.
- Swap the brand: the move still works. (The subject-swap test.)

**Plan-then-review (for the inventor and the juror).** Write the plan in 6 lines. Then work through the same brief with the subject removed; any part of your plan that survives unchanged is a default, not a choice. Revise it and say what you changed.

## 5. Earn the trick, personality, puns

**Earn the trick.** For every flashy move name the **setup** (where the viewer learned the rule) and the **payoff** (what it communicates or reveals). No setup, no trick. A match cut works because "viewers do not know to expect it, but when it happens it makes total sense". If it needs explaining, it is not earned. Allowed setups: a first beat that states the rule; a prior smaller instance of the same move; a word in the script that names the object; "none needed: <why>" only when the move reads in one beat.

**Personality beat budget.** One characterful, non-informative beat per 8 to 12 s of film. A 30 s film carries two or three at most. The personality must fit the brand's tone (a serious bank does not wink). It should cost 0.3 to 0.6 s.

**Pun budget.** At most 1 visual or verbal pun per 10 s of film (`validateMoves` warns above). A pun resolves within 1 s of appearing; one that needs a second reading is a riddle.

**Uncaused motion.** Everything that moves does so because something hit it, pushed it, pulled it, thrown it or attracted it. "Energy" is not a cause.

**Over-literal kinetics.** The word "fall" falls and nothing else is a G12 failure. Demand a second layer.

## 6. Product-first variant

When the Dispatch context says `product_first` (`references/product-first.md` is law), ambition goes into craft and choreography, never concept.

- **Subject world = the real product**: its UI surfaces, labels (`ui_labels`), data, cursor, windows, states, and the brand mark's geometry. Atoms come from `research/screens.md`, the truth sheet's Native words and `brand/assets`, **and the letters, dots and full stops of the script's own lines**.
- **The resolve rule.** A letter, shape or type transformation is **craft, not a conceit**, when its end state lands on a real product surface (a real UI element, state or screen) or the real brand mark or name within the same move. Banned, as before: invented worlds, museums, allegories, metaphors the film lives inside, props standing in for the product, and any transformation that never resolves to the product. A full-frame graphic built from the product's own shapes (its circles, dot, caret, ticks, glyph) is allowed when it resolves to the real UI within the move.
  - **Allowed, one example** (a chat product, for illustration): the two dots of the i's in a huge typed line drop and become the real UI's two selection circles; a tick's stroke keeps drawing and becomes the outline of the real composer; the end line's full stop is the thinking dot the film opened on. Full frame, every move ends on a real surface.
  - **Banned, one example**: a field of invented circles that drift, merge and never become a real UI element; a museum of them; a metaphor world the circles live in.
- **Card fields.** `resolves_to` is required on every hero card (the real UI label, state or screen, the product name, or the brand, logo, mark, cursor, caret or composer it lands on, checked). `origin` stays required but is any atom of the script (a letter, a dot, a UI label); it no longer has to name a product word. No card may use a conceit word (museum, gallery, exhibit, allegory, diorama, a world, parable, trial, funeral).
- **The carrier is a real product surface or the brand glyph, or a letter or shape that becomes one** within its chain. Never an invented object standing in for the product.
- **Scale and density are the bar.** At least one hero is `full-frame` on a type or shape generator; the chain has a new idea about every 1.2 s. The bar (`bar` in the pack) is not a UI walkthrough: the type and shapes are the stage and the real UI is where they land.
- **Glyph puns that are not transformations resolve within 1 s.** A letter-to-object pun that only winks, without becoming a surface, lands on the product in a second. A transformation runs as long as the move needs and resolves before the move ends.
- **Seeds are choreography constraints, not metaphors.** The pack's stimulus is one line from `choreography.json` ("every cut lands on a UI state change"). Use it as a rule on how the real UI moves.
- **Showing off is craft**: huge type whose letters become the real UI, one continuous camera move through the real UI, a cursor with motive, cuts on keystrokes, a component that morphs through its real states, a hand-off that lands on a state change the product really makes.
- Hero move ideas live in G1, G2, G3, G4, G5, G6, G9, G11, G14, G15, G17, G18 and G19; G16 and G7 only if the personality belongs to the cursor.
- 3D only where it serves the real product (a window in depth, a device); never an abstract world.
- The product UI is on screen within 3 s, the hero moment stays the longest and cleanest shot, and the end card is the largest type on a clean field. A hero move never makes the end line smaller or later.

**A product-first move card, for the format** (invented for illustration; not for reuse):

```jsonc
{ "id": "m2", "title": "The row that is already there", "beat": 3, "seam": "3>4", "generator": "G18", "scale": "large", "resolves_to": "the real 'Apply suggestion' row",
  "origin": "the 'Apply suggestion' row in the real review thread (ui_labels)",
  "frame_a": "six review rows slide in from the left on the kick of each bar, each 0.4 s, 120 ms apart",
  "move": "0.0 to 2.4 rows 1 to 6 arrive from the left on beats 1 to 6; 2.4 the seventh row, 'Apply suggestion', is already in place, the six slide out right in 0.3 s power3.in; 2.9 the cursor lands on it and rests 0.2 s",
  "frame_b": "'Apply suggestion' alone at the optical centre, cursor resting on it",
  "bridge": "at 2.5 s the six rows are half off the right edge and the seventh sits still at (640, 400) in both the old list and the new full-bleed view",
  "handoff": "the row's rect (x 360, y 372, w 560, h 56) becomes the next scene's focus panel",
  "says": "the one action that matters was there the whole time; the film's rhythm proves it by breaking once",
  "setup": "six rows teach the left-to-right rule in 2.4 s",
  "precedent": "rule-and-break typography; differs: the break is a real UI row and the hand-off is its rectangle",
  "build": { "route": "dom-flip", "layers": "7 row divs, 1 cursor", "risk": "the seventh row must not read as a static asset", "simplest": "same, with the six rows as one group tween" },
  "duration_s": 3.2 }
```

## 7. Brand-film variant

When the Dispatch context says `brand_film`, read `brand-film/FILM-STYLE.md` first.

- Mechanisms come only from the card's **motion vocabulary** (scale, morph, draw-on, cut on the beat, UI choreography...). Never add one it says is absent. A flat card means no 3D, blur, grain, glow or bounce.
- Follow the card's cut rate and its end card.
- **"One element at a time" means one carrier at a time, transformed in a chain, not few ideas.** Brand films are morph chains: OpenAI's "Refreshed." is dot -> rings -> dot grid -> letterforms -> mark. The brand film analyst writes that chain into `FILM-STYLE.md`'s motion vocabulary; derive your carrier and your chain from it, and keep the chain's density (a new idea about every 1.2 s). Calm is the restraint of one carrier and one ease, never an empty frame.
- **The ambition goes into the carrier and the choreography**: which one thing travels, where it lands on the beat, what stays constant. A scale-through in a scale-only vocabulary is on-brand; a whip pan is not.
- Max 3 distinct motion types and one ease family (`references/launch-film.md` rule 9).
- Derive the carrier from the brand's own geometry when it has one (the dot, the mark's counter, the letter) and name that source in `origin`.

## 8. How roughs are built (the grey-box rule)

A rough is the idea, legible in one loop, 1.5 to 4.5 s, with no styling. It exists so the user can see a move before the build and so the animator has a motion target. Built by the move-sketcher; rendered by `moves.mjs rough`; checked by `moves.mjs check-rough`.

- **File**: `story/moves/<L>-<id>/rough.html`, self-contained, at the film's aspect, 1280 px wide (a 16:9 film is 1280 x 720; 9:16 is 720 x 1280; 1:1 is 1000 x 1000). One `<div id="stage">` at that size, `overflow: hidden`.
- **Look**: paper `#F1F0EC` ground, ink `#1B1F2A`, **one** accent `#E8833A` used only on the carrier, system sans (`font-family: -apple-system, "Helvetica Neue", Arial, sans-serif`). No gradients, shadows, glows or textures. No images unless the move is about one, and then a flat grey rect labelled with what it is. The **real words from the script** and the real UI labels, set plain.
- **Timeline**: `window.__move = { tl, duration, bridge }`. `tl` is a paused GSAP timeline (`gsap.timeline({ paused: true })`), `duration` its length in seconds (1.5 to 4.5) and `bridge` the time in seconds of the bridge frame (the one where both states are true). The runtime seeks `tl` to each frame time; nothing may depend on the wall clock, `Math.random`, CSS animations or `requestAnimationFrame`.
- **GSAP**: load the vendored copy, `<script src="gsap.min.js"></script>`, with `scripts/vendor/gsap.min.js` copied into the move's folder beside the rough (same file the boards use; no CDN).
- **Timing and eases are the idea.** Follow the card's `move` exactly: its seconds, its order, its anticipation. If the card says 0.2 s wind-up, there is a 0.2 s wind-up. The rough is not allowed to improve the idea silently; if the card cannot be built as written, build `build.simplest` and say so in the handback note.
- **Hold the bridge frame**: the frame where both states are true is visible for at least 3 consecutive frames at 15 fps (0.2 s) so a still shows it. Mark it in `bridge`.
- **Loop**: the last frame should lead into the first (a held end state fading to the first state in 0.3 s is fine) so the MP4 loops without a jolt.
- **Check**: `moves.mjs rough --dir <folder>` then `moves.mjs check-rough --dir <folder>`; look at `strip.png` (5 frames with their times) and `poster.png` yourself. If the strip does not read as the card, fix the rough, once or twice, then hand back.

The scene animator **beats** the rough, it does not copy it: the grey-box look is replaced by the film's design system (DESIGN.md, frame.md), and the timing, the bridge and the carrier's path are kept or improved.

## 9. The verdict's pairwise rounds (checkable)

The juror ranks each script's passing cards by pairwise comparison with the order swapped. The rounds are written down, so the check can read them: `pitches.<L>.rounds: [{a, b, first, winner, frame}]`, where `a` and `b` are card ids, `first` is `"a"` or `"b"` (which card was shown first), `winner` is the card id that won and `frame` is the concrete frame that decided it (8 words at least). For every consecutive pair of `ranking` (`ranking[i]`, `ranking[i+1]`) there must be two rounds with that pair, one in each presentation order. Errors: `rounds-missing` (a pair without both orders), `rounds-inconsistent` (the higher-ranked card wins neither round, or a winner is not one of the pair), `rounds-frame` (a frame under 8 words). A split pair (each card wins once) is allowed only when the second round carries `tiebreak: "riskier"` (optionally `riskier: <id>`) and the riskier card is the higher-ranked one. A juror that ranks "mentally" cannot pass: each round is a separate written comparison in its scratch notes, then recorded.
