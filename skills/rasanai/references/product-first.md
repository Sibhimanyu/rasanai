# Product-first: launch, promo and product films

Applies to the route `product-launch-video` and any launch, promo, product-demo, feature-reveal or app/company launch film (`kind` or `format` launch/promo/product; the Dispatch context says `product_first`). Everything here overrides the "show off", "device" and "Bold/Wild" guidance elsewhere in the skill: those push *craft*, never *concept*, on these films.

Why: a real test film for a very well-known product (a 30 s Mac-app launch) was judged "absolute trash". It put an invented museum of abandoned tasks under glass (a metaphor for switching tabs), line-art props, cryptic museum labels and a gallery-green Bodoni look; the product first appeared at 19 s of 30 and the end line was tiny on near-empty white. Real launch films (Apple, OpenAI, Linear, Raycast, Arc, Notion) do the opposite: the real UI is the hero from the first second, real uses, short plain kinetic type, rhythm and UI motion carry the energy, the brand's own look is exact, the end card is clean and bold. Complex metaphors and invented worlds are not used.

## The rules

1. **The product UI is on screen within 3 s.** The real thing (captured, or faithfully recreated), not a title card, a logo sting, a metaphor or a prop.
2. **One hero product moment**: the key feature shown for real, start to finish, in the real UI (the shortcut pressed, the window appearing over the user's actual work, the answer streaming in). Name it in the pitch (`hero_moment: {beat, what}`). It is the longest, cleanest shot of the film.
3. **One feature, one scenario**: the film is about ONE feature (`feature: {name, url, viewer, task, before, after}`: the user's named one, else the newest launch, else the core surface), shown as one viewer doing one real task: hook = their before, proof = the task done in the real UI, turn = the after and the brand reveal, cta = one action. Its 2 to 4 real steps are the `uses`. Each beat names its `picture` and its `ui[]` cause and effect; no invented output screens; the two-way test (lines alone, pictures alone: the same story). A multi-feature tour fails `story.mjs` G10 and the concept gate.
4. **Short plain kinetic lines**: 6 words or fewer on screen, plain words a person would say (no riddles, no cryptic labels). Rhythm, cuts on the beat and UI motion carry the energy, not the concept.
5. **The required end line is the largest type in the film**, on a clean CTA card: the line, the product name or mark, nothing else competing (`last_line`, `end_line_largest: true`).
6. **The brand's own look is exact** (type, colours, UI language, logo usage): see "Brand lock" below.
7. **No conceit devices.** Banned for these routes: museums, galleries and exhibits, allegories and parables, invented worlds and dioramas, extended metaphors, "cover versions" of famous ads or films, mockumentaries, the product as a character, time capsules, trials and funerals. `story.mjs pick` never offers them (families Metaphor and most Borrowed containers are filtered out for `--format launch`, or `--product-first`), and G7 fails a pitch whose device or beats use them. **Allowed**: an instant visual pun that resolves to the product within 1 second (a pitch detail: `visual_pun: {what, resolves_in_s}`), never a device the film lives inside.
8. **Sure, Bold and Wild differ in structure, pacing and energy, not in abandoning the product.** E.g. Sure = a clean sequence of real uses to the hero moment; Bold = a rhythmic, cut-on-the-beat kinetic-type film where the typed words are the UI's own; Wild = one unbroken UI take (a "oner" through the product) or a countdown that the product itself answers. All three are product-led from beat 1. A script whose first image is not the product is rewritten, whatever its angle.
9. **Ambition through craft, not concept.** "Show off" means choreography timed to the frame, the real UI moving like nothing else, a seam nobody notices till the second watch, typography that locks to the music. It never means inventing a world to put the product inside.

## Real product fidelity

Product films show the real product. In order of preference:

1. **Captured**: real screenshots and screen captures from the research (`research/screens/`, `capture/`), used as the UI itself.
2. **Faithfully recreated in HTML/CSS** when capture fails or the screenshots are unusable: the real layout, the real labels (`research/screens.md`, Native words), the real type and colours of the product, built as DOM so it can animate (a window, a composer, a menu bar, a chat thread). A recreation must be indistinguishable at video size from the product.
3. **Never** line-art props, icons, abstract shapes or illustrated objects drawn as a stand-in for the product or its UI. A drawn prop may decorate; it never replaces the product.

If capture fails, say so in the console (`activity`), recreate the UI and carry on: do not pivot to metaphor.

## Moves in a product-first film

The Moves pass (`references/moves.md`, §6) runs on these films too, with the product-first variant: the subject world is the real product (its UI surfaces, labels, data, cursor, windows, brand mark geometry); **the carrier is a real product surface or the brand glyph**; every hero card's `origin` names a real UI label, the product name, "brand", "logo" or "cursor"; no card uses a conceit word; a glyph pun resolves to the product within 1 s; and the pack's stimulus is a **choreography constraint** ("every cut lands on a UI state change"), never a metaphor. This is where showing off lives on a launch film: a cursor with a motive, one continuous camera move through the real UI, cuts on keystrokes, a component morphing through its real states. It never changes rules 1 to 7: the product is on screen within 3 s, the hero moment stays the longest and cleanest shot, and the end line stays the largest type.

## Brand film grammar and the simple story

For a named brand, the look is the brand's own film grammar (`references/brand-film.md`: `brandfilm.mjs` + the brand film analyst), and the story follows the structure templates of `references/launch-film.md`. Both keep the film simple and to the point; the style-match gate (`brandfilm.mjs compare`) runs on the key frames and the first draft.

## Brand lock

When the brief names a brand (`brand_name` / `use_brand` true) or the product is a known brand, a brand step ALWAYS runs: the brand researcher builds `research/brand/DESIGN.md` from official sources (type, colours, UI language, logo usage, motion), the Director reads it (`brand.mjs read`), pushes it to the console as `brand`, and sets `brand` in decisions. All three looks (Sure, Bold, Wild) then stay inside the brand: its type, colours and UI; they vary composition, motion and density, never the palette or the type system. An off-brand look is never recommended, never even shown (`design.mjs look-payload` refuses it). The gate: `design.mjs check-system` / `check-systems` apply the brand lock to every system when the run has a brand.

### Logos are files

The logo on screen is the file the brand researcher downloaded (`research/brand/assets/logos.json`), copied unchanged into the project and placed as an image, with the brand's clear space and the right colour version. Nothing drawn, traced, approximated or generated stands in for it: no shapes, glyphs or emoji. When no official file could be downloaded (`none: true`), the end card uses the brand name in the brand font and no symbol, and the Director tells the user once. `slop.mjs` (rule `logo-not-the-file`) fails the film otherwise.

## The recommender

For these routes the recommendation is **the clearest product story**, not the most ambitious. The script editor and the Director must state `first_watch`: why a first-time viewer gets this film in one watch with no explanation (what they see by 3 s, what they understand by 10 s, what they do after). Prefer, in this order: shows the real product soonest; shows the key feature most plainly; reads without sound; tone matches the brief's words. Ambition is a tiebreaker only.

## The concept gate (before the expensive work)

After the script and look calls and before motion planning (the score, key frames, animation), a **concept critic** (`agents/concept-critic.md`, run on Sonnet, one quick pass) scores the chosen script and look against the literal brief. Questions:

1. Is the product on screen within 3 s?
2. Is the hero moment present, shown for real?
3. Does the tone match the brief's own words (e.g. "confident, warm, a little playful")?
4. Is the required end line large (the largest type) on a clean card?
5. Is it on-brand (type, colours, UI language)?
6. Is it understandable on first watch with no explanation?

Verdict `pass` or `fix` in `story/concept-check.json`. On `fix`, the script (or look) is rewritten from the findings before anything is built; re-run once. The result is recorded in decisions: `console.mjs push --step concept --status done --data '{"decision":"Concept gate: pass (6/6). ..."}'`. The film's cost starts after this gate: a failing concept is fixed here for cents, not at the Final for hours.
