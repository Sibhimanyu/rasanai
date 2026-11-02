# Launch grammar: the default look and shape of a RasanAI launch film

Applies to every launch, promo, feature-reveal and product-launch film (`product-first.md` scope; the same detection as `ctx.product_first` in `crew.mjs`). Non-launch films (brand films that are not launches, lyric videos, music videos, character films, explainers) keep the style-world rules and do not read this file.

The target is three reference launch films, **Minase** (41 s), **Kinso** (46 s) and **Sovra.fm** (52 s). They are third-party: this engine names them and describes what they do, and never copies, embeds or stores them. Every RasanAI launch film should feel like they do, each in its own way: copy-led kinetic type, a fixed arc, a light brand, simplified UI proof, a **variety of scenes**, motion textures that contrast, dense and sparse in alternation, and always something moving.

**The owner's verdict on a Kinso-style rebuild (2026-11-02): "too smooth", and "one concept (a caret line) through every scene and every transition is repetitive". The thinking process below replaces "one carrier for the whole film"**: the backbone is scene variety; texture is a designed contrast; carriers are optional and local; transitions vary; Codex imagery goes where a scene needs meaning; and the standard AI moves (a cursor pointing at a word, a highlight that nudges) are rare tools, never the default emphasis (`launch-moves.md`).

"In its own way" means each film differs in its **hook, scene plan, type pairing, signature transition and signature moment**. It does not mean a different art world. Style worlds (pixel, clay, paper, voxel...) are an optional flavour a concept may choose when the brief asks for one; they are not the default and they are not how ideas differ.

## 1. The arc (fixed; the content changes every time)

hook, turn, meet, 2 to 3 capabilities, payoff. One thought per beat. On-screen type carries the story. A voiceover is optional and only reads the on-screen lines (Minase reads its lines in a voiceover; Kinso is music only); a song may also be asked for, and the type then carries the same lines.

| Beat | Job | Shape |
|---|---|---|
| Hook | the viewer's problem, felt | 2 to 4 short lines, second person, no logo, no product name |
| Turn | one short pivot line | 2 to 5 words ("Let's fix this first", "That's it", "The moment it clicks") |
| Meet | the brand or product reveal, small and calm | the logo or wordmark plus one phrase, on an empty ground; the first of at most 3 logo uses |
| Capabilities | 2 or 3 beats, each proves one thing | one line plus ONE simplified UI mockup that proves that line |
| Payoff / CTA | the emotional line, or social proof | a closing line, or a count-up number then its label; the end card holds the logo (the last logo use) and the call to action |

### Motion profile per beat

The arc also sets the character of the motion (the `beat-profile` warning reads the score's `moves[]`; `references/score.md` "Motion laws").

| Beat | Motion |
|---|---|
| Hook | tight and urgent: durations below the film's mean, ease-out, no overshoot |
| Turn | sharp: one fast move, the whip or the signature transition, on the drop |
| Meet | calm and slow: sine or a long ease-out, the longest entrance of the film, no overshoot |
| Capabilities | medium: the signature curve at ordinary durations, one settle at most, on a thrown card only |
| Payoff | the longest holds of the film (`hold_s`); the payoff hit is the one accent curve |

### Beat timing template (seconds; each cell is start to end, and may move by up to 10 percent to land on a music hit)

| Beat | 30 s | 45 s | 60 s |
|---|---|---|---|
| Hook | 0.0 to 7.0 | 0.0 to 10.0 | 0.0 to 13.0 |
| Turn | 7.0 to 9.5 | 10.0 to 13.5 | 13.0 to 17.0 |
| Meet | 9.5 to 13.0 | 13.5 to 18.5 | 17.0 to 23.0 |
| Capability 1 | 13.0 to 18.5 | 18.5 to 25.5 | 23.0 to 31.5 |
| Capability 2 | 18.5 to 24.0 | 25.5 to 32.5 | 31.5 to 40.0 |
| Capability 3 (optional; at 30 s fold it into 2) | skipped | 32.5 to 38.0 | 40.0 to 47.5 |
| Payoff and CTA | 24.0 to 30.0 | 38.0 to 45.0 | 47.5 to 60.0 |

The hook is never longer than a quarter of the film and the meet never starts before 30 percent or after 40 percent of it (the reference films meet the brand at roughly a third). The payoff gets at least 12 percent of the film so that the last line can breathe.

## 2. Copy rules (the spine)

- One thought per beat; one line per beat is the default, two at most.
- Second person, conversational, plain words ("Your next deal is in here somewhere", "You are a really busy person", "Nobody's watching it"). Never the product's feature list read aloud.
- Lines build word by word or swap word in place; every line has exactly one emphasised word (colour, weight, size or italic), the word that carries the turn of the line.
- The hook states the viewer's problem or a small surprise. It never opens with the brand, the product name, a tagline or "introducing".
- Every number, claim and feature comes from `research/claims.json`. Social proof is real or absent.
- Short lines: 3 to 7 words on screen at once; a line that needs more is two beats.
- Type size follows the thought: the hook and payoff lines are the largest type in the film; a capability line is smaller than its UI proof.

## 3. Brand-light rules

- The logo appears at most **3 times** and always small: at the meet, optionally once mid-film tied to a capability, and on the end card. Never as a watermark, never persistent, never larger than the claim line.
- The brand is felt as **palette atmosphere**: the brand colours become the ground (a soft brand gradient), the accent, or the colour of the light (Sovra.fm). A soft gradient ground, a clean white slate with one brand-coloured accent shape, or a near-black slate with a brand-coloured glow are all legitimate.
- Never copy the brand's website layout or its white page. Use only its logo, accent/palette, and its type face on the claim or end line when the brief locks one.
- The real product UI appears only as **simplified recreated mockups** (section 5), and only where it proves a line.

## 4. Scene variety, motion texture, carriers and imagery (the backbone)

### 4a. Scene variety is the backbone

Plan the film as a sequence of **distinct scene types**, chosen from this palette (the score's `scene_type` ids):

| `scene_type` | What it is |
|---|---|
| `type-slate` | type on a light or dark slate, built word by word or swapped in place |
| `type-collage` | giant mixed serif and sans type, UI cards overlapping the letters |
| `ui-proof` | one UI proof card or a stack, 35 to 60% of the frame |
| `ui-collage` | a UI or landing-page collage montage: cards scroll and assemble |
| `cinematic-image` | a Codex still (or footage) animated by parallax, a push or a light sweep, with type over it |
| `diagram` | an orbit, loop or system diagram; a metaphor drawn from the copy |
| `data` | a dashboard, a stat, a count-up |
| `kinetic-list` | a slot list, an arrow list, a ladder |
| `object-shot` | an object or metaphor shot, Codex-made or drawn |
| `typed-prompt` | a prompt typed into the product's real input (2 per film at most) |
| `footage` | moody stock footage with type persisting over its cuts |
| `logo-end` | the logo, the tagline, the call to action |

Rules (checked by `launch-beats`: `scene-variety`, `scene-share`, `scene-neighbours`; warnings):
- A 45 s film uses **at least 5 different scene types** (about 3 at 20 to 40 s).
- **No scene type takes more than about 30% of the runtime.**
- **Neighbouring beats never share a scene type**, unless it is a deliberate continuation (`continues: true` on the second beat).
- A scene type used twice uses two different moves.

### 4b. Motion texture is a designed contrast

Each beat declares a `texture`:

| texture | What it is |
|---|---|
| `smooth` | eased and continuous |
| `stepped` | on twos or threes: held frames at 12, 10 or 8 fps, for collages assembling, pop-ins, state changes and hits on the beat (never a scroll, pan, push, glide or orbit) |
| `flicker` | a flash-frame burst: one varying element in a locked layout, 8 to 24 frames, landing on a held readable frame (a build-up, never information to read) |
| `glitch` | a pop-in with sliced offsets and a 1 to 2 frame jitter |

Rules (checked: `texture-all-smooth`, `texture-mix`, `texture-calm-beat`, `texture-fps`; warnings):
- **At least one stepped or flicker section**, typically the hook's chaos or a dense collage. Minase steps its collage and UI sections at about 10 fps and bursts a flicker montage at 6.5 to 9 s.
- Stepped, flicker and glitch together cover **about 15 to 40% of the runtime**.
- **Calm beats (the meet, the payoff line, the end) stay smooth.**
- Never all smooth, never all stutter. The calm sections (clean type slates, footage, the logo reveal) are the counterweight that makes the stepped ones read.
- **A smooth, crisp film can still be right** (Sovra.fm is smooth and is lit and always moving). Texture is a tool for energy, not a requirement: the rendered gate only recommends it (`texture-all-smooth` is a recommendation).
- **Stepped is for discrete, not continuous, motion** (checked: `stepped-fluid-move`). Stepped / stutter belongs to pieces arriving or assembling in a collage, pop-ins and discrete state changes, energetic montage bursts, rhythmic hits on the beat, and things that jump between positions. It must NOT go on a continuous single-direction move: a scroll, a pan, a camera push, a long glide, an orbit's rotation, a slide-across. Those stay fluid (a dashboard strip scrolling sideways is smooth; its cards may pop in stepped). A stepped beat whose named moves include scroll, pan, push, glide, orbit or slide-across warns "stepped motion on a fluid single-direction move".
- **Flash-frame burst (the flicker beat) is a build-up, never an information carrier.** Use it only before a reveal, drop or beat hit, or to convey abundance, overload or speed. Content: ONE varying element in a locked layout (a climbing number, the same word in many fonts, a stack of app icons or UI states, one card in many states); never unrelated metrics or messages (nobody can read "12 STREAK", "B2 LEVEL"... at 2 frames each). Timing: each flash 2 to 3 frames (1 only as an accent), the whole burst 8 to 24 frames (about 0.3 to 0.8 s), on a riser or stutter aligned to beat subdivisions. It lands on one held, readable frame of 12 frames or more, on the downbeat, and that frame carries the real message. At most 1 to 2 bursts per film, never back to back. Photosensitivity (WCAG 2.3.1 / Ofcom): no more than 3 high-contrast full-frame flashes per second, never alternate full-frame black and white, no saturated red flashing; inside a burst keep the luminance change small or change only part of the frame (the content changes, the ground stays constant). A `flicker` beat declares `burst_content: "single-element"`, `burst_frames` (8 to 24) and `lands_on` (checked: `flicker-burst-fields`, `flicker-burst-count`, `flicker-burst-adjacent`; the render gate measures `photosensitivity-flash`).
- How to build each: `launch-moves.md` and `runtime/rasan-texture.js` (`RasanTexture.stepped`, `flicker`, `glitchPop`).

### 4c. Carriers are optional and local

A recurring element (a pill, an orb, a card, a ribbon) may **link two or three neighbouring beats**, or bookend the film. It must not be the transition for the whole film.
- Cap a carrier at **about 40% of the beats** (`carrier-overuse` warns above it). There is no minimum: a film with no carrier is fine (Sovra has none; its ribbons bookend the middle, and a DJ orb is a product character).
- A named carrier says which beats it links and how it hands off (`handoff`), and keeps its velocity at each handoff (`motion-handoffs.md`).
- It carries the brand colour, is not the logo, and is simple to draw. Two films in one pool never share the same carrier.
- The old rule "present in 60% or more of the beats; one object travels the whole film" is removed.

### 4d. Codex imagery where a scene needs meaning

When a beat would otherwise be an empty card or abstract shapes, the concept, the designer or the motion director may call for a generated image (`references/imagery.md`, "Launch imagery"): a **world inside a UI card** (Minase fills its landing pages and cards with generated grass hills, a chair on a mound, flowers), an **object or metaphor shot**, or a **cinematic plate** behind type. Requirements:
- Prompt it from the concept and the brand palette; keep it consistent through the world bible (`art/world.json`).
- **Animate it**: parallax layers, a push, a light sweep, a stepped reveal; never a static still (a still is held at most about 1.2 s).
- **1 to 4 images per film**, only where they add meaning, never as wallpaper (`imagery-count` warns above 4).
- Declare it in the score: `imagery_plan[]` {id, prompt, aspect?} at score level, `imagery: "<id>" | "none"` per beat; `node scripts/imagegen.mjs plan-from-score --score motion/score.json --out assets/images/launch-plan.json` writes the batch plan, then `imagegen.mjs batch`.
- Never for UI or a real product's look (those are captured or rebuilt), text, logos or a real person.
- **Editorial and tactile, never "AI".** The references' images are still-life objects and props (driftwood with a flower, a retro CRT with a sad face on its screen, flowers on a rock against the sky, a printed street map, paper and print textures, landing-page photo cards): natural light, real materials, warm or neutral palettes, a photographic or print feel, often cut out or collaged into a card. **No generated people** (no faces, figures, hands or silhouettes unless the brief explicitly asks) and **no neon or blue-glow gradient tech scenes, glowing screens, holograms or "cinematic AI" moods**: a person at a laptop lit by a blue glow reads as AI-generated, which hurts a film made with AI. Prefer objects, props, places without people, materials and printed matter, used as content inside UI cards and collages. `imagegen.mjs plan-from-score` and `story-plates.mjs` add this direction and the negative guidance to launch prompts; a prompt that mentions people, person, man, woman, face, hands, silhouette, crowd, neon, glow or hologram warns (`imagery-people-or-glow`) unless the score sets `imagery_people: true` because the brief requires people.

### 4e. Reference moves and AI cliches

Each scene has its own idea, taken from the **15 reference moves** (`launch-moves.md`: the object splits the word, the redaction slash, the glass shelf, scale as transition, an iris through an object, persistent type over cuts, the slot list, a fluid dashboard scroll, an orbit diagram, a mixed type collage, oversized type bleeding off the frame...). The score names them per beat in `moves_named[]`; **no move is used in more than 2 beats** (`move-repeat`). Emphasis is an **object acting on the word**, not a pointer at it.

The standard AI moves are **rare tools or banned** (`launch-moves.md`, "AI cliches"). Two more standards: **word-by-word appear-from-bottom (rise plus fade per word) is the standard AI entrance**, never the default and at most one line per film (`cliche-word-rise`; prefer a swap in place, an object splitting a word, a slash, a scale-zoom, persistent type over cuts, a typed line used rarely, a hard cut on the beat, a mask wipe or a stepped pop); and the standard **zoom-in plus fade** (scale plus opacity as an entrance or transition) is once per film at most (`cliche-zoom-fade`); **counting numbers** (odometer, count-up stats, ticking numbers, streak counters, dashboard tickers) are what editors rarely use: one count-up per film at most, only for a real hero number that matters to the story (social proof such as "Join 27,300 others"); decorative tickers and several counting numbers are banned (`cliche-count-up`, `cliche-ticker`); a rolling slot list is held to once per film too (`cliche-slot-list`).
- **Banned**: glow pulses and breathing glow, bokeh and floating particle atmosphere, and a highlighted word that scales, bounces, nudges, wiggles or pulses as the emphasis.
- **Rare, with a reason**: one zoom-fade, one word-rise line, one count-up (a real hero number), one slot list; a travelling cursor or caret (**once per film**, only when a real typing, selecting, clicking or dragging moment in the product earns it; the beat declares `cursor_reason`; a real cursor at the right scale, an arc with acceleration and deceleration, one purposeful action at the end); typed lines (2 at most); uniform word-by-word fades (2 lines at most); cards that slide up with a soft shadow (2 at most); an underline as emphasis (once, and never the highlight beat).

**TaskShelf, the fourth reference** (71 s, voice-over, quick cuts; `library/benchmarks/launch-refs/taskshelf`): readable on-screen copy that mirrors the voice-over, each line held long enough to read, the treatment changing radically cut to cut (tiny inline, huge, halftone mega type, black-band oversized text, split card). Even with a voice-over the type tells the story and must stay readable. Moves 21 to 30 in `launch-moves.md` (inline icon chips, UI as typography, stacked prices, halftone type, stepped blocks on discrete pieces, tilted UI with a dolly and a real cursor, hand-drawn annotation, logo on a photo plate, typed CTA end). A **recommended payoff** is oversized emerging type (move 35).

## 5. UI mockup rules

- Simplified, recreated mockups: an inbox list, a phone with a notification, a prompt box, a stat card, a toggle row. Never a full-screen screenshot, never the whole site, never a screen recording.
- One idea per mockup; 3 to 7 rows or elements; real words from the claims, the rest greyed placeholders.
- A mockup lands next to the line it proves (type and UI share the frame), enters by the beat's own move (a mask, a stepped pop, a push, a fly-in) and leaves by the next transition.
- It is allowed to be partly cropped, tilted or floated as a card. **As the proof of a line it fills 35 to 60 percent of the frame** (under 25 percent is a chip, not a proof; section 12). One mockup per film may fill 50 percent or more (the hero proof).
- A mockup enters with travel or scale paired to its fade, never opacity-only and never from `scale(0)` (0.92 to 0.95 up). Heavy UI (the panel, the hero mockup) lands with no overshoot; chips and pills may settle only when thrown (`craft.md`, "Weight classes").
- Real product pixels (a captured screenshot) are used only where the product's look itself is the point and the user supplied it; otherwise recreate in the film's palette and type.

## 6. Transition vocabulary (varied; a cut on a music hit is welcome)

Every beat change is one of these, named in the beat's `transition_in`:

1. **Hard cut on a music hit** (`hard-cut-on-hit`): the picture changes on the beat. Cuts that land on a hit are motivated and welcome; the old "no plain cuts" rule was too strict. A bare "cut" with no named reason is only a warning.
2. **Stepped smash**: a stepped (on twos or threes) swap or pile-up into the next scene.
3. **Flicker cut**: a frame-level swap burst resolving into the next scene.
4. **Mask or wipe**: an object slides through the frame or inside a word and reveals the next scene; an iris closes through an object that survives the cut.
5. **Push or pull**: the camera pushes into a word, a hole or the UI and arrives in the next scene, or pulls out to reveal the previous scene as an element. Scale as transition (a frame-filling line zooms out into small type).
6. **Whip swap**: a fast blur-stretched pan that swaps the scene under the blur, on a music hit.
7. **Morph**: one shape becomes the next (a pill becomes loop rings, a pill becomes a card).
8. **Match cut**: the same shape or position on both sides of the cut.
9. **Type morph**: a word or line turns into the next (letters re-form, a word swaps in place, a word splits to admit an object).
10. **Carried element** (optional, local): a card or object crosses one or two seams.

**No single transition family is used for more than about 30% of the seams** (`transition-variety`). Each concept names one **signature transition** (its own, repeated 2 to 3 times as the film's rhythm) and uses the rest as supporting seams. A footage or dark interlude is allowed if the concept calls for it. The shot-length distribution checks still apply, but a declared flicker burst or stepped section is allowed to exceed the usual cut rate (`frame-spikes` allows 14 per 10 s when the score declares non-smooth textures).

## 7. Rhythm rules

- **Dense and sparse alternate.** A dense moment (a collage of cards, app icons, a dashboard, a stack of lines) is always followed by a sparse one (a single small line on an empty ground) and the reverse. No more than 2 dense or 2 sparse beats in a row (the launch-beats gate warns on more than 2 dense in a row: `dense-run`).
- The tempo is locked to the music: seams and hard cuts land on its hits, drops and break edges (`audio/music-map.json`); the turn lands on the drop.
- Grounds are neutral or brand atmosphere: clean white, a soft brand gradient, a brand-colour slate, or near-black. Never a gimmick ground. **Alternate 2 or more ground families with the beats (section 12), OR keep one ground that is visibly lit and moving (Sovra.fm: dark ground, moving purple light)**; one flat grey ground for the whole film is a defect.
- Type scale swings: full-frame type, then small centred type. A film that keeps the same type size for 5 s is wrong.
- **One signature curve** for the smooth beats. A launch film declares one `signature_ease` in its score (a custom cubic-bezier or an expo.out family) and 70 to 85 percent of its (smooth) moves use it; stepped and flicker beats set their own timing by fps. Other curves are accents, reserved for contrast: a whip, the signature transition, the payoff hit. The gate warns under 60 percent or with none declared (`signature-share-low`, `signature-ease-missing`). The 40 percent variety cap applies to non-launch films only (`craft.md`, "A curve per role").
- **Cascades are short** (3 to 7 items inside 0.5 s; a set piece 1.2 s) and **ambient layers counter-drift** at 20 to 30 percent of hero speed (`craft.md`).
- **A carrier, where there is one, keeps its velocity at every handoff** (`motion-handoffs.md`).
- The signature moment is the one place the film spends everything: the moment a viewer rewinds (the object splitting the word, the word becoming a metaphor, the count-up landing).

## 8. Concept fields for a launch film

Every launch-film concept names: `hook_lines` (2 to 4), `turn_line`, `meet` (the reveal beat: what appears, where, how small), `capabilities` (2 or 3 of `{line, ui_proof}`), `payoff` (line plus CTA), **`scene_plan[]`** (one entry per beat: `{beat, scene_type, texture, move, imagery?}`; 5+ types in 45 s, none over 30%, neighbours differ), **`texture_accents[]`** (where the stepped or flicker sections are and why), `signature_transition`, `ground` (`neutral` | `brand-gradient` | `dark`), `type_pairing`, plus the usual `signature_moment`, `sound_mode` and `shots[]`. A `carrier {what, kind, beats, handoff}` is **optional** (local, 40% of beats at most). `style_world` is optional; absent means the kinetic-launch default. At most 1 of the jury's 3 picks may name a non-default world.

Diversity across ideas and across the 3 jury picks means a different hook, a different scene plan and a different signature transition. It does not mean a different art style. The jury rewards scene variety and penalises a one-gimmick film.

## 9. The three looks of a launch film

The Look step makes three treatments of this grammar, not three art worlds. Axes: **ground** (soft brand gradient, clean white, near-black), **type pairing** (serif-italic plus sans, grotesk, mono accents), **scene plan** (which scene types and where the texture accents fall), **light treatment** (`gradient`, `glow` on dark, `lit-white`, `none`), **density**. The three must be distinct treatments: ground, type pairing, scene plan and light differ as a set (type pairing and scene plan differ on every look). At least one Look has a lit atmosphere: a soft brand gradient, OR a coloured light/glow on dark (Sovra.fm: one dark ground lit by moving purple light), OR a lit white. Three different grounds are a recommendation, not a rule. Each uses the brand palette as atmosphere and keeps the logo small. **Caution: no generic blue or purple "AI glow" gradients.** A soft brand-gradient ground comes from the brand's own palette and stays subtle; a default blue/purple glow is the AI look unless the brand palette calls for it. The references use white, near-black and the brand's own atmosphere.

## 10. Critic checklist

1. The arc is present and in order, within the template timings.
2. The hook carries no logo and no product name, and states a problem.
3. One thought and one emphasised word per beat.
4. The logo appears at most 3 times and small.
5. Scene variety: 5+ scene types in 45 s, none over 30%, neighbours differ; a stepped or flicker section exists (15 to 40% non-smooth, calm beats smooth); any carrier is local (40% of beats at most); no move in more than 2 beats.
6. Each capability has exactly one simplified UI proof beside its line; none is a screenshot.
7. Seams are named and varied (no family over 30%; hard cuts on music hits are fine); the signature transition recurs 2 to 3 times.
8. Dense and sparse alternate; grounds stay neutral or brand atmosphere.
9. Real claims only.
10. One signature curve on 70 to 85 percent of moves; accents only for a whip, the signature transition and the payoff hit; hook, meet and payoff move the way the profile table says.
11. No AI-cliche emphasis (`launch-moves.md`): word-rise at most one line, count-up at most once (a real hero number), slot list at most once, no stepped motion on a scroll, pan, push, glide or orbit, no people or neon/glow in generated images, no pulsing glow, bokeh or particles, no nudging highlight, a travelling cursor at most once and with a story reason, typed lines at most 2, uniform word fades at most 2, slide-up cards at most 2, underline at most once.
12. Section 12 holds: hero cap height 9 to 20% in every beat, UI proof 35 to 60%, 2 or more ground families with brand atmosphere in 30% or more of the film, no hold over about 1.2 s, no plain fade or blur transition, hook at most 25%, no grey 3D hero.

Related: `launch-moves.md` (the 15 reference moves and the AI cliche table), `launch-film.md` (timings, measurement, red flags), `product-first.md`, `ui-rebuild.md`, `motion-handoffs.md`, `composition-transitions.md`.

## 11. Chrome, carrier and look rules

- **Chrome rule.** No fake HUD or instrument labels (timecodes, "LINE 01", "VARISPEED", tick rulers, coordinates) unless the product is that kind of tool. The references use clean type and simplified UI, not dashboard decoration.
- **Looks: contrast and atmosphere.** The 3 looks are distinct treatments (ground, type pairing, scene mix and light differ as a set). At least one has a lit atmosphere: a soft brand gradient (Kinso), OR a coloured glow on dark (Sovra.fm: one dark ground lit by moving purple light), OR a lit white. Three different grounds are recommended, not required.

- **Launch concept props rule.** Any carrier and the props come from the product, its UI and the brand (a card, chip, pill, notification, an orb in the brand colour, the user's own text), not from an outside metaphor world (a Tetris tank, a letterpress, a courtroom, karaoke, a nature doc). A caret or cursor is a rare tool (`launch-moves.md`), never the carrier of the whole film. At most ONE wild-lane idea may use an outside metaphor, and the jury may not recommend it. A concept whose carrier.kind is "object" gets a schema warning.

## 12. Scale, ground rhythm, always moving, and the reference jury (the measured bar)

A film made on engine 1.36 passed every gate and still looked like a slide deck beside the references: one grey ground for 45 s, type at 4% of frame height, small UI cards in an empty frame, 8 s holds, a 13 s hook on one grey 3D render. The numbers below come from the reference contact sheets (`library/benchmarks/launch-refs/<id>/thumbs/1fps-contact-sheet.jpg`): look at them before you write a score.

**Scale (hero_scale, ui_scale).**
- Hero lines are display scale: **cap height 9 to 20% of frame height at least once per beat** (Kinso's "here", "One inbox" and "for every conversation" are 10 to 25%; Minase's slate words about 12%). The big line builds word by word and the words fill a good part of the frame width (40 to 90%). Ordinary small lines (4 to 6%) may exist only as the quiet half of a dense/sparse pair.
- **UI mockups are 35 to 60% of the frame (by area of its bounding card) when they are the proof**, cropped or tilted if you like. Under 25% is a chip or an accent, never a proof. A small card in a big empty frame is allowed only when the beat is declared `sparse` and it is a single line.
- **Scale contrast is the rhythm.** A dense beat (a collage, a stack of app icons, a hero mockup at 50%) is followed by a sparse one (one line on an open ground), and the two differ by at least 2.5x in the biggest element's height. Type that stays the same size for 5 s is wrong.

**Ground rhythm.**
- At least **2 ground families in the film, or one ground with strong light variation** (Sovra.fm: one dark ground lit by moving purple glow, light sweeps and blooms that change across beats; the gate measures "lit atmosphere" from chroma and saturated-light presence); (brand-gradient, dark, white, a flat brand-colour slate), alternating with the beats: Kinso goes gradient, dark hex slate, gradient, white UI; Minase goes white, dark footage-like slates, white; Sovra stays dark and moves coloured light. The ground changes on the turn, on the meet and on at least one capability, on a music hit and carried by the carrier or a wipe, never by a fade to a new colour.
- **Brand-colour atmosphere (gradient, glow, tint or a flat brand slate) is on screen for at least 30% of the film.** A film that is one neutral ground throughout is wrong even when every other gate passes. The score declares `ground` per beat (`brand-gradient | dark | white | brand-slate`).
- Light brand does not mean no brand: the logo stays small and rare, the colour is everywhere.
- **Scale versus light.** Small content in a flat, unlit, static void is the defect (the 1.36 film). Small type in a frame lit by colour glow, with something moving every second, is allowed (Sovra.fm); the gate errors only when coverage is low AND the ground is unlit AND the brand colour is scarce.

**Always moving.**
- Every beat has continuous, visible motion: something builds, moves, swaps or travels at every moment. **A hold is at most about 1.2 s** and is filled with secondary motion (a word swap, a light sweep, a count-up, a scrolling list, a stepped drift). An end card may hold up to about 3 s while ambient light keeps moving. The score declares the beat's longest hold in `hold_s`.
- **No plain fade and no blur-only transition.** Blur is a finish on a whip, push or rack focus, never the transition. Use the vocabulary of section 6. A move that reads as opacity plus blur is not choreography: it needs travel, scale, a mask or a carried object.

**Pacing.**
- **The hook is at most 20 to 25% of the film** (6 to 10 s at 45 s; 7 s at 30 s) and meets the brand by about 30 to 40%. A hook of 30% or more is an error.
- A hook is 2 to 4 lines on changing images, not one hold. One thing changes every 1 to 2 s.

**3D renders.** A dull grey 3D render is not a hero. 3D may be used only if it is lit in the brand atmosphere (brand-colour key and rim light, a gradient ground, no neutral grey studio) and earns its time: it moves, it becomes something (the next scene), and it is not on screen for more than a quarter of the hook. A flat 2D card or kinetic type beats a grey keyboard every time.

**The score fields** (all required on a launch film; `crew.mjs check` refuses a launch score without them): per beat `ground`, `role` (hook | turn | meet | capability | payoff), `hero_scale` (cap height of the biggest line, % of frame height), `ui_scale` (the UI proof's % of frame area, 0 if none) and `hold_s` (longest static hold, s); plus `line`, `scene_type`, `texture` (+ `fps` when stepped), `transition_in`, `density`, `logo`; optional `carrier_state`, `moves_named[]` (catalogue names; `moves[]` is the per-tween records), `imagery`, `cursor_reason` (section 4).

**The reference jury.** After the draft render and the critics' fixes, and before the Final call, the `reference-juror` (`agents/reference-juror.md`) looks at the film's 1.5 fps contact sheet (`crew.mjs refsheet`) beside the three house reference sheets and scores 1 to 10 on story clarity, typography scale and craft, ground and atmosphere rhythm, motion choreography, **scene variety**, **motion texture contrast**, brand-light presence and pacing. **Any score under 7 triggers ONE targeted fix round** (a concrete fix per beat), then a re-check; the scores go in the Final push. It compares against the references, not against the film itself.

## 13. The three house references (what each proves)

| | Minase (41 s) | Kinso (46 s) | Sovra.fm (52 s) |
|---|---|---|---|
| Ground | white and near-black | coral and teal gradient, dark hex slate, white UI | one dark ground lit by purple glow |
| Texture | stepped collage and UI at about 10 fps, a flicker burst, glitch pop-ins, smooth footage and slates | smooth and crisp | smooth and crisp |
| Scenes | collage, footage, type slates, type collage, dashboard, orbit diagram, kinetic list, typed caption, logo | type, glass shelf, app stack splitting a word, scale-down type, iris, count-up | ribbon, line-lit type, card stack, queue, loop rings, typed-prompt product demo, vinyl result, DJ orb, upload, glow bloom, slot list, logo |
| Carrier | none that runs through | a local orb | none (ribbons bookend, a DJ orb is a character) |
| Cursor | none | none | real product actions only (Create, upload, remove Spotify) |

The gates are calibrated so that **all three pass and the 26keys v6 film (a flat, unlit, static, small-content void) fails**. Do not tune a film to one of them: variety, light and motion are the shared traits, texture and ground colour are not. Breakdowns: `library/benchmarks/launch-refs/<id>/`.
