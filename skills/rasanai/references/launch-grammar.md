# Launch grammar: the default look and shape of a RasanAI launch film

Applies to every launch, promo, feature-reveal and product-launch film (`product-first.md` scope; the same detection as `ctx.product_first` in `crew.mjs`). Non-launch films (brand films that are not launches, lyric videos, music videos, character films, explainers) keep the style-world rules and skip this file.

## Contents

- Target and scope
- 1. The arc (beats, motion profile, timing template)
- 2. Copy rules
- 3. Brand-light rules (the logo count lives here)
- 4. Scene variety, texture, carriers, imagery, moves (4a to 4e)
- 5. UI mockup rules
- 6. Transition vocabulary
- 7. Rhythm rules
- 8. Concept fields
- 9. The three looks (the Look rules live here)
- 10. Critic checklist
- 11. Chrome and props rules
- 12. Scale, ground rhythm, always moving, the reference jury (ground and light live here)
- 13. The three house references
- 14. Clarity, proof, benefit and call to action (what it is and for whom, UI by 40%, one message, CTA, the claim-to-proof map)
- 15. Motion purpose (distinct reveal and CTA, mood follows story)
- 16. Structure options (the arc is the default candidate)
- 17. Craft research rules (readable exposure, product-state truth, bridges, intensity, endings, the fresh viewer)
- 18. Brand-derived motifs and the logo-swap test
- 19. Calibration profile (starting values to test, not sourced standards)

## Target and scope

- Aim every launch film at the three reference films, Minase (41 s), Kinso (46 s) and Sovra.fm (52 s): copy-led kinetic type, a fixed arc, a light brand, simplified UI proof, a variety of scenes, motion textures that contrast, dense and sparse in alternation, and always something moving.
- Name and describe the references and leave them uncopied, unembedded and unstored, because they are third-party films.
- Differ from film to film in hook, scene plan, type pairing, signature transition and signature moment, because "in its own way" means a different plan on the same grammar and never a different art world.
- Treat style worlds (pixel, clay, paper, voxel...) as an optional flavour when the brief asks for one, because they are the exception and never how ideas differ.
- Build on scene variety, designed texture contrast, optional local carriers and varied transitions, because the owner's verdict on a Kinso-style rebuild was "too smooth" and "one concept (a caret line) through every scene and every transition is repetitive". Use Codex imagery where a scene needs meaning, and treat the standard AI moves (a cursor pointing at a word, a highlight that nudges) as rare tools (`launch-moves.md`).

## Defaults you can leave

The numbers below came from the house references and the owner's reviews. The professional research (`.context/motion-craft-research.md`, 3 Nov 2026) found no source behind them, so they are starting values: a film that leaves one explains why, in the score's `departures: [{rule, why}]`, and the finding is then a note. Without a why the finding is a warning that asks for the explanation. Measured defects stay hard failures: an unlit, empty or low-coverage frame, meaningful stillness, photosensitivity, unreadable text and claim truth.

| Default | Starting value | Rule id | Why it is only a default |
|---|---|---|---|
| Scene types and share | 5 or more types in a 45 s film, none over about 30% | `scene-variety` | no source fixes a count of scenes or shots |
| One transition family | at most about 30% of the designed seams (hard cuts are not counted) | `transition-variety` | a cut is a valid choice; three transition types is not a professional standard |
| Texture share | stepped, flicker and glitch about 15 to 40% of the runtime | `texture` | stepped motion is a per-track choice, and no source sets its share |
| Display-scale type | cap height 9% of the frame at least once | `display-scale` | no source supports a minimum type size; crowded copy is cured by editing first |
| Type treatments | 5 or more in a 45 s film (3 at 20 to 40 s) | `type-treatment-variety` | measured on the four references (7 to 12), not a published standard |
| Plain cuts | a bare cut names what it lands on | `hard-cuts` | cutting on the beat is neither always right nor always wrong |
| Dense and sparse | two alternations | `rhythm` | no source gives a dense:sparse ratio |
| Designed SFX per 10 s | the band for the sound mode (`sound.md`) | `sfx-density` | no source sets an SFX-per-second target |

- Leave a default when the concept gives a reason, and write the reason where the reviewer reads it (`departures` in the score, `concept.departures` in the concept), because a departure with a reason is design and one without is drift.
- Keep the score's intensity map (section 17) as the place where each major change is explained, because the pacing reason belongs next to the numbers.
- Source: the research's unsupported-claims list (no fixed shot count, no three-transition law, no minimum font size, no SFX-per-second target, no always-or-never cut on the beat). Studio and practitioner citations sit on each rule in sections 16 to 19.

## 1. The arc (the default structure; the content changes every time)

The hook, turn, meet, capabilities, payoff arc is the default candidate and not the only structure (section 16 lists the others); the clarity rules of section 14 hold in every structure.


Order every film hook, turn, meet, 2 to 3 capabilities, payoff, with one thought per beat and on-screen type carrying the story. A voiceover is optional and reads only the on-screen lines (Minase reads its lines; Kinso is music only); a song may be asked for, and the type then carries the same lines.

- Allow voiceover-mirroring type and show the condensed key words of each spoken line, the way TaskShelf and Minase mirror their voiceovers, because the eye and the ear then land the same thought together.

| Beat | Job | Shape |
|---|---|---|
| Hook | the viewer's problem, felt | 2 to 4 short lines, second person, no logo, no product name; the hook or the turn makes the category and the audience clear (section 14) |
| Turn | one short pivot line | 2 to 5 words ("Let's fix this first", "That's it", "The moment it clicks") |
| Meet | the brand or product reveal, small and calm | the logo or wordmark plus one phrase, on an empty ground; the first logo use (section 3) |
| Capabilities | 2 or 3 beats, each proves one thing | one line plus one simplified UI mockup that proves that line |
| Payoff / CTA | the emotional line, or social proof | a closing line, or a count-up number then its label; the end card holds the logo (the last logo use) and the call to action |

### Peak-end craft budget

- Name the film's `peak` beat (`score.peak`: the beat id of the signature moment), because viewers remember the peak and the end.
- Spend the richest moves and the most craft in three places: the hook's first 3 s, the peak and the end or CTA beat. Each names at least one catalogue move in `moves_named` (`launch-moves.md`), and the other beats run lighter.
- Check: `peak-missing` and `peak-end-moves` (warnings in `scripts/lib/launch-beats.mjs`).

### Motion profile per beat

Set the character of the motion by beat, because the `beat-profile` warning reads the score's `moves[]` (`references/score.md` "Motion laws").

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

| Pacing limit | Number | Why |
|---|---|---|
| Hook length | at most a quarter of the film (section 12 sets the error line) | the viewer needs the product early |
| Meet start | between 30 and 40 percent of the film | the reference films meet the brand at roughly a third |
| Payoff share | at least 12 percent of the film | the last line needs room to breathe |

## 2. Copy rules (the spine)

- Give each beat one thought and default to one line, two at most, because the viewer reads while the picture moves.
- Write second person in plain words ("Your next deal is in here somewhere", "You are a really busy person", "Nobody's watching it") and skip the feature list read aloud, because it sounds like a brochure.
- Build lines word by word or swap word in place, and give each line one emphasis, the word that carries its turn, and vary its kind line to line, because the eye lands on one word and the same last-word colour on every line is the AI tell (our films: 7 to 9 of 9 lines; the references: 0 or 1).
  - Declare it per beat as `emphasis: {word, kind}`, kind from: `gradient-fill`, `redaction` (a bar across the word), `glass-shelf`, `word-on-bar`, `icon-chip` (an inline icon between words), `serif-swap`, `scale`, `object-split`, `outline`; `colour`, `weight` and `italic` alone are the plain kinds.
  - Check: `emphasis-monotone` warns when one kind, or colour or weight alone, carries more than 2 lines.
- Give the film a type-treatment palette, `type_treatments[]` on the score (5 or more in 45 s), and set `type_treatment` per beat, because the references change the treatment cut to cut (Kinso about 11, TaskShelf about 12) and ours held one sans with a coloured last word. Choose from: `halftone-mega` (halftone display type), `outline`, `mixed-serif-sans`, `dot-matrix`, `black-band-bleed` (oversized type on a black band bleeding off frame), `caption-on-image`, `oversized-bleed`, `tiny-inline`, `split-card`, `mono-caption`, `stacked-scale`, `type-collage`. One display and one body face is not the limit on a launch film; the brand face stays on the claim and end lines when a brand lock holds (`type-treatment-variety`, a default).
- Open the hook with the viewer's problem or a small surprise, and hold the brand, the product name, a tagline and "introducing" for the meet, because a brand-first open loses the viewer.
- Take every number, claim and feature from `research/claims.json`, and keep social proof real or absent, because an invented claim breaks trust.
- Show 3 to 7 words on screen at once and split a longer line into two beats, because readability limits the line.
- Size type to the thought: the hook and payoff lines are the largest type in the film, and a capability line is smaller than its UI proof, because scale ranks the ideas.

## 3. Brand-light rules

This section is the home of the logo count (the arc, the checklist and `brand-film.md` link here).

- Show the logo at most 3 times, always small: at the meet, optionally once mid-film tied to a capability, and on the end card. Keep it off as a watermark, never persistent, and never larger than the claim line, because a light brand is felt and not stamped.
- Carry the brand as palette atmosphere (the brand colours become the ground as a soft brand gradient, the accent, or the colour of the light as in Sovra.fm), because colour is everywhere while the logo stays rare. A soft gradient ground, a clean white slate with one brand-coloured accent shape, and a near-black slate with a brand-coloured glow are all legitimate.
- Take from the brand only its logo, accent or palette, and its type face on the claim or end line when the brief locks one, because copying its website layout or white page makes the film a page recording.
- Show the real product UI only as simplified recreated mockups (section 5), and only where it proves a line.

## 4. Scene variety, motion texture, carriers and imagery (the backbone)

### 4a. Scene variety is the backbone

Plan the film as a sequence of distinct scene types, chosen from this palette (the score's `scene_type` ids):

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

Checked by `launch-beats` as guidance (`scene-variety`, `scene-share`, `scene-neighbours`; the counts are defaults, see "Defaults you can leave"):

| Rule | Number | Why |
|---|---|---|
| Use different scene types | at least 5 in a 45 s film (about 3 at 20 to 40 s) | variety is the backbone |
| Cap one scene type's share | about 30% of the runtime | no scene type dominates |
| Change scene type between neighbouring beats | always, unless the second beat sets `continues: true` | a deliberate continuation is the only repeat |
| Use a different move when a scene type repeats | 2 uses, 2 moves | each scene has its own idea |

### 4b. Motion texture is a designed contrast

- Declare a `texture` (`smooth`, `stepped`, `flicker` or `glitch`) on every beat, and take the placement numbers, the stepped-versus-fluid rule and the flash-burst rules from `launch-moves.md` § Motion texture, because that section is their single home.
- Build the textures with `RasanTexture.stepped`, `flicker` and `glitchPop` (`runtime/rasan-texture.js`; recipes in `launch-moves.md`).

### 4c. Carriers are optional and local

- Let a recurring element (a pill, an orb, a card, a ribbon) link two or three neighbouring beats or bookend the film, because a carrier that serves as the transition for the whole film is the repetition the owner rejected.
- Cap a carrier at about 40% of the beats (`carrier-overuse` warns above it); there is no minimum, so a film with no carrier is fine (Sovra has none; its ribbons bookend the middle, and a DJ orb is a product character).
- Name which beats a carrier links and how it hands off (`handoff`), and keep its velocity at each handoff (`motion-handoffs.md`), because a dropped velocity reads as a cut.
- Colour it with the brand colour, keep it simple to draw and different from the logo, and keep two films in one pool from sharing a carrier, because a shared carrier makes the films look alike.
- The older rule "present in 60% or more of the beats; one object travels the whole film" is retired.

### 4d. Codex imagery where a scene needs meaning

When Codex imagery is ready (`IMAGEGEN=ready`), plan it by default as content (`references/imagery.md`, "Launch imagery"): Minase shows imagery in 44% of its frames, Sovra 35%, ours none. The uses are a world inside a UI card or landing page (Minase: grass hills, a chair on a mound, flowers), a collage plate, an object or metaphor shot, and a cinematic plate behind type.

- Prompt it from the concept and the brand palette, and keep it consistent through the world bible (`art/world.json`), because shared style makes the set one world.
- Animate it with parallax layers, a push, a light sweep or a stepped reveal, and hold a still at most about 1.2 s, because a static still reads as a slide.
- Use 4 to 8 still-life or world images per film when Codex is ready, each reused 2 to 3 times (in a card, then a collage, then behind the payoff), and allow one burst of 5 to 6 plates used once each, because reuse makes a world and wallpaper adds nothing. Without Codex, draw the scene and skip the count. Record `imagegen: "ready"` on the score so the check knows (`imagery-count` warns under 4 when ready, and above 8).
- Declare it in the score: `imagery_plan[]` {id, prompt, aspect?} at score level and `imagery: "<id>" | "none"` per beat; `node scripts/imagegen.mjs plan-from-score --score motion/score.json --out assets/images/launch-plan.json` writes the batch plan, then `imagegen.mjs batch`.
- Capture or rebuild UI and a real product's look, and generate none of UI, text, logos or a real person, because the model draws them wrongly and they belong to research.
- Make the images editorial and tactile (still-life objects and props in natural light, real materials, warm or neutral palettes), keep generated people and neon or blue-glow "cinematic AI" looks out, and take the full style direction, the example prompts and the `imagery-people-or-glow` check from `imagery.md` § Launch imagery, which is their single home, because a person lit by a blue glow reads as AI-generated and hurts a film made with AI.

### 4e. Reference moves and AI cliches

- Give each scene its own idea from the 35 reference moves (`launch-moves.md`: the object splits the word, the redaction slash, the glass shelf, scale as transition, an iris through an object, persistent type over cuts, the slot list, a fluid dashboard scroll, an orbit diagram, a mixed type collage, oversized type bleeding off the frame...), and name them per beat in `moves_named[]`, with no move in more than 2 beats (`move-repeat`).
- Let emphasis be an object acting on the word and not a pointer at it, because a pointer is the default AI look.
- Take the cliche rules (the replacement for each AI move, and the rare tools with their per-film limits: word-rise, zoom-fade, count-up, slot list, cursor, typed lines, uniform word fades, slide-up cards, underline) from `launch-moves.md` § AI cliches, which is their single home.
- Read TaskShelf as the fourth reference (71 s, voice-over, quick cuts; `library/benchmarks/launch-refs/taskshelf`): mirror the voice-over in readable on-screen copy, hold each line long enough to read, and change the treatment radically cut to cut (tiny inline, huge, halftone mega type, black-band oversized text, split card), because even with a voice-over the type tells the story. Its moves are 21 to 30 in `launch-moves.md`, and a recommended payoff is oversized emerging type (move 35).

## 5. UI mockup rules

- Recreate the UI in simplified form (an inbox list, a phone with a notification, a prompt box, a stat card, a toggle row), because a full-screen screenshot, the whole site or a screen recording is unreadable at film speed.
- Give each mockup one idea, 3 to 7 rows or elements, real words from the claims and greyed placeholders for the rest, so the viewer reads the one thing it proves.
- Lay out each capability beat as one of `layout`: `ui-full` (the UI fills or bleeds off the frame), `side-label` (UI 40 to 60% of the frame, a label 2 to 4% of the height beside it), `type-then-ui` (the line, then the UI replaces it), `type-over-ui` (the line sits on the UI). A title over a centred card is allowed on 1 beat at most, because it is the slide template the references never use (ours: 20 to 60% of frames; Kinso and TaskShelf: none). Check: `slide-layout`.
- Build the UI in place, never popping in complete: shell, populate, state change, result (`ui_build: ["shell", "populate", "state-change", "result"]`; `ui-build`), with type and UI sharing the frame, and leave by the next transition.
- Give the film one UI camera treatment (`ui_camera`: `tilted-ui-dolly`, `macro-push` or `pull-back`) and vary its framing beat to beat, because one camera language reads as directed (TaskShelf: about 12 s tilted; `ui-camera`).
- Fill at least 25 percent of the frame on a proof beat and aim for 35 to 60 (or full-frame, tilted or macro), because under 25 percent is a chip and not a proof (section 12; `ui-scale-small`). One mockup per film may fill 50 percent or more (the hero proof).
- Enter a mockup with travel or scale paired to its fade, from 0.92 to 0.95 up, because opacity-only and `scale(0)` entrances look cheap. Land heavy UI (the panel, the hero mockup) with no overshoot, and let chips and pills settle only when thrown (`craft.md`, "Weight classes").
- Use real product pixels (a captured screenshot) only where the product's look itself is the point and the user supplied it; otherwise recreate in the film's palette and type.

## 6. Transition vocabulary (varied; a cut on a music hit is welcome)

Name one of these in the beat's `transition_in` for every beat change:

1. **Hard cut on a music hit** (`hard-cut-on-hit`): the picture changes on the beat. A cut that lands on a hit is motivated and welcome; a bare "cut" with no named reason is only a warning.
2. **Stepped smash**: a stepped (on twos or threes) swap or pile-up into the next scene.
3. **Flicker cut**: a frame-level swap burst resolving into the next scene.
4. **Mask or wipe**: an object slides through the frame or inside a word and reveals the next scene; an iris closes through an object that survives the cut.
5. **Push or pull**: the camera pushes into a word, a hole or the UI and arrives in the next scene, or pulls out to reveal the previous scene as an element. Scale as transition (a frame-filling line zooms out into small type).
6. **Whip swap**: a fast blur-stretched pan that swaps the scene under the blur, on a music hit.
7. **Morph**: one shape becomes the next (a pill becomes loop rings, a pill becomes a card).
8. **Match cut**: the same shape or position on both sides of the cut.
9. **Type morph**: a word or line turns into the next (letters re-form, a word swaps in place, a word splits to admit an object).
10. **Carried element** (optional, local): a card or object crosses one or two seams.

- Keep any one designed transition family to about 30% of the designed seams (`transition-variety`, a default; hard cuts are not counted), because one family across the film can read as a gimmick.
- Give each designed transition a `bridge_reason`: what it conveys that a hard cut would lose (a shared object, a continued motion, a move through space), and cut when the answer is nothing, because a cut is a valid choice and costs less to revise (`bridge-reason-missing`, `bridge-hard-cut-candidate`; the critic may replace the bridge with a cut). Source: Sander van Dijk with Joey Korenman, School of Motion podcast (single practitioner), https://schoolofmotion.com/blog/sander-van-dijk-podcast.
- Name one signature transition per concept and repeat it 2 to 3 times as the film's rhythm, using the rest as supporting seams.
- Allow a footage or dark interlude when the concept calls for it.
- Apply the shot-length distribution checks, with one exception: a declared flicker burst or stepped section may exceed the usual cut rate (`frame-spikes` allows 14 per 10 s when the score declares non-smooth textures).

## 7. Rhythm rules

- Alternate dense and sparse (a default, `rhythm`): follow a dense moment (a collage of cards, app icons, a dashboard, a stack of lines) with a sparse one (a single small line on an empty ground) and the reverse, with no more than 2 dense or 2 sparse beats in a row, because the contrast makes each read (the launch-beats gate warns on more than 2 dense in a row: `dense-run`).
- Lock the tempo to the music: land seams and hard cuts on its hits, drops and break edges (`audio/music-map.json`) and the turn on the drop, because picture on the beat feels intentional.
- Take grounds from neutral or brand atmosphere (clean white, a soft brand gradient, a brand-colour slate, near-black) and skip gimmick grounds; the ground-family and light rules are in section 12.
- Swing the type scale (full-frame type, then small centred type), because a film that keeps the same type size for 5 s is wrong.
- Declare one `signature_ease` in the score (a custom cubic-bezier or an expo.out family) and use it on 70 to 85 percent of the smooth moves, because one curve gives the film a voice. Stepped and flicker beats set their own timing by fps, and other curves are accents reserved for contrast (a whip, the signature transition, the payoff hit). The gate warns under 60 percent or with none declared (`signature-share-low`, `signature-ease-missing`). The 40 percent variety cap applies to non-launch films only (`craft.md`, "A curve per role").
- Keep cascades short (3 to 7 items inside 0.5 s; a set piece 1.2 s) and counter-drift ambient layers at 20 to 30 percent of hero speed (`craft.md`).
- Keep a carrier's velocity at every handoff (`motion-handoffs.md`).
- Spend everything on the signature moment, the moment a viewer rewinds (the object splitting the word, the word becoming a metaphor, the count-up landing).

## 8. Concept fields for a launch film

Name these in every launch-film concept: `hook_lines` (2 to 4), `turn_line`, `meet` (the reveal beat: what appears, where, how small), `capabilities` (2 or 3 of `{line, ui_proof}`), `payoff` (line plus CTA), `scene_plan[]` (one entry per beat: `{beat, scene_type, texture, move, imagery?}`; 5+ types in 45 s, none over 30%, neighbours differ), `clarity {category, audience, beat}`, `one_message`, `cta` (section 14), `texture_accents[]` (where the stepped or flicker sections are and why), `signature_transition`, `ground` (`neutral` | `brand-gradient` | `dark`), `type_pairing`, `type_treatments[]` (5+ in 45 s, section 2), plus the usual `signature_moment`, `sound_mode` and `shots[]`.

- Treat `carrier {what, kind, beats, handoff}` as optional (local, 40% of beats at most) and `style_world` as optional (absent means the kinetic-launch default); let at most 1 of the jury's 3 picks name a non-default world.
- Diversify ideas and jury picks by hook, scene plan and signature transition and keep the art style shared, because the jury rewards scene variety and penalises a one-gimmick film.

## 9. The three looks of a launch film

This section is the home of the Look rules (section 11 and the Look agents link here). The Look step makes three treatments of this grammar, not three art worlds.

| Axis | Choices |
|---|---|
| Ground | soft brand gradient, clean white, near-black |
| Type pairing | serif-italic plus sans, grotesk, mono accents |
| Scene plan | which scene types, and where the texture accents fall |
| Light treatment | `gradient`, `glow` on dark, `lit-white`, `none` |
| Density | dense or sparse mix |
| Motion language | `motion_language: {direction: forward \| upward \| inward \| outward, physics: soft \| crisp \| heavy \| weightless \| elastic}` |

- Make the three looks distinct treatments: ground, type pairing, scene plan and light differ as a set, and type pairing and scene plan differ on every look, because three looks that differ in one axis read as one.
- Give at least one look a lit atmosphere (a soft brand gradient as in Kinso, OR a coloured light or glow on dark as in Sovra.fm, one dark ground lit by moving purple light, OR a lit white), because lit atmosphere is what the references share. Three different grounds are a recommendation, not a rule.
- Declare a `motion_language` on every look (in `blend.json` `treatment`) and carry the chosen one onto the score beside `signature_ease`, because one direction of travel and one kind of physics through the whole film is what reads as a motion personality. Every beat's moves follow it (a `heavy` film settles late and never snaps; a `crisp` film cuts clean; an `upward` film rises on every entrance). `motion-language-missing` warns when it is absent.
- Use the brand palette as atmosphere and keep the logo small on every look.
- Take a brand-gradient ground from the brand's own palette and give it shape (a hard-edged sweep, a band, a lit plane), never shapeless blobs or aurora haze, and never a blue or purple glow, even for a blue brand, because the owner banned blue glow as the AI look (`ground-blob`). The references use white, near-black, the brand's own atmosphere and material grounds (section 12).

## 10. Critic checklist

Each item points to the section that holds the rule.

1. The arc is present and in order, within the template timings (section 1).
2. The hook carries no logo and no product name, and states a problem (sections 1, 2).
3. Each beat has one thought and one emphasis, the emphasis kind varies line to line, and the film uses 5 or more type treatments (section 2).
4. The logo count and size follow section 3.
5. Scene variety holds (4a), texture is mixed (`launch-moves.md` § Motion texture), any carrier is local (4c), and no move is in more than 2 beats (4e).
6. Each capability has exactly one simplified UI proof that builds in place, in a declared layout (title over a centred card once at most), under one camera treatment, and none is a screenshot (section 5).
7. Seams are named and varied, hard cuts on music hits are fine, and the signature transition recurs 2 to 3 times (section 6).
8. Dense and sparse alternate and grounds stay neutral or brand atmosphere (sections 7, 12).
9. Every claim is real (section 2).
10. One signature curve covers 70 to 85 percent of the moves, accents are limited to a whip, the signature transition and the payoff hit, and the hook, meet and payoff move as the profile table says (sections 1, 7).
11. No AI-cliche emphasis: the limits in `launch-moves.md` § AI cliches hold, with no people or neon or glow in generated images (4d).
12. Section 12 holds: hero cap height 9 to 20% in a beat (a default: a departure needs its why), UI proof 35 to 60%, 2 or more ground families with brand atmosphere in 30% or more of the film, no hold over about 1.2 s, no plain fade or blur transition, hook at most 25%, no grey 3D hero.
13. Section 14 holds: category and audience clear by the end of the turn, first UI proof by about 40% with the core job shown, benefit lines with a true specific number where one exists, no buzzwords, one message, a held CTA, and every claim in the copy proven by a beat.
14. Section 15 and the arc hold: a named peak, catalogue moves on the hook, peak and end, a distinct meet and CTA, a mood per beat that the ground follows, and one `motion_language` the whole film obeys (sections 1, 9, 15).
15. Sections 16 to 18 hold: a declared structure with its reason, readable exposure for the essential lines, product states that stay true, each major intensity change explained, a resolved ending, motifs with a source and a film that fails the logo-swap test (it could not advertise any other product).

Related: `launch-moves.md` (the 35 reference moves and the AI cliche table), `launch-film.md` (timings, measurement, red flags), `product-first.md`, `ui-rebuild.md`, `motion-handoffs.md`, `composition-transitions.md`.

## 11. Chrome, carrier and look rules

- Leave fake HUD or instrument labels (timecodes, "LINE 01", "VARISPEED", tick rulers, coordinates) out unless the product is that kind of tool, because the references use clean type and simplified UI and not dashboard decoration.
- Take the look rules from section 9.
- Take any carrier and the props from the product, its UI and the brand (a card, chip, pill, notification, an orb in the brand colour, the user's own text), because an outside metaphor world (a Tetris tank, a letterpress, a courtroom, karaoke, a nature doc) hides the product. A caret or cursor is a rare tool (`launch-moves.md`) and is never the carrier of the whole film. Allow at most one wild-lane idea to use an outside metaphor, and keep the jury from recommending it. A concept whose carrier.kind is "object" gets a schema warning.

## 12. Scale, ground rhythm, always moving, and the reference jury (the measured bar)

This section is the home of ground and light. It exists because a film made on engine 1.36 passed every gate and still looked like a slide deck beside the references (one grey ground for 45 s, type at 4% of frame height, small UI cards in an empty frame, 8 s holds, a 13 s hook on one grey 3D render). The numbers come from the reference contact sheets (`library/benchmarks/launch-refs/<id>/thumbs/1fps-contact-sheet.jpg`): look at them before writing a score.

**Scale (hero_scale, ui_scale)**

| Rule | Number | Why |
|---|---|---|
| Set hero lines at display scale (a default, `display-scale`) | cap height 9 to 20% of frame height at least once per beat | Kinso's "here", "One inbox" and "for every conversation" are 10 to 25%; Minase's slate words about 12% |
| Fill the frame width with the big line, built word by word | words span 40 to 90% of the frame width | display type needs the frame |
| Keep ordinary small lines | 4 to 6%, only as the quiet half of a dense/sparse pair | small type belongs to the sparse side |
| Size a UI proof | 35 to 60% of the frame by area of its bounding card, cropped or tilted if you like | under 25% is a chip or an accent, never a proof |
| Allow a small card in a big empty frame | only when the beat is declared `sparse` and it is a single line | otherwise it is the flat-void defect |
| Contrast dense with sparse | the biggest element's height differs by at least 2.5x | scale contrast is the rhythm; type at the same size for 5 s is wrong |

**Ground rhythm**

- Use at least 2 ground families in the film (brand-gradient, dark, white, a flat brand-colour slate) alternating with the beats, or keep one ground that is visibly lit and moving (Sovra.fm: one dark ground lit by moving purple glow, light sweeps and blooms that change across beats; the gate measures "lit atmosphere" from chroma and saturated-light presence). Kinso goes gradient, dark hex slate, gradient, white UI; Minase goes white, dark footage-like slates, white; Sovra stays dark and moves coloured light. One flat grey ground for the whole film is a defect.
- Change the ground on the turn, on the meet and on at least one capability, on a music hit and carried by the carrier or a wipe, because a fade to a new colour is a plain fade.
- Show brand-colour atmosphere (gradient, glow, tint or a flat brand slate) for at least 30% of the film, because a film that is one neutral ground is wrong even when every other gate passes. Declare `ground` per beat (`brand-gradient | dark | white | brand-slate`).
- Keep the logo small and rare and the colour everywhere, because light brand does not mean no brand.
- Put a material ground on 1 to 3 beats (`ground_material`: `grid`, `hex`, `halftone`, `paper`, `stone`, `light-shaft`, `plate`), because the references stand type and UI on a surface (Kinso's dark hex slate, Minase's paper and plates) and a film of hazy gradients has no material (`ground-material`).
- Light small content: small content in a flat, unlit, static void is the defect (the 1.36 film), while small type in a frame lit by colour glow with something moving every second is allowed (Sovra.fm). The gate errors only when coverage is low AND the ground is unlit AND the brand colour is scarce.

**Always moving**

- Keep continuous visible motion in every beat (something builds, moves, swaps or travels at every moment), and fill a hold with secondary motion (a word swap, a light sweep, a count-up, a scrolling list, a stepped drift). A hold is at most about 1.2 s; an end card may hold up to about 3 s while ambient light keeps moving. Declare the beat's longest hold in `hold_s`.
- Build transitions from the section 6 vocabulary and use blur as a finish on a whip, push or rack focus, because a plain fade or a blur-only transition is not choreography. A move that reads as opacity plus blur needs travel, scale, a mask or a carried object.

**Pacing**

- Keep the hook at 20 to 25% of the film at most (6 to 10 s at 45 s; 7 s at 30 s) and meet the brand by about 30 to 40%; a hook of 30% or more is an error (the viewer needs the product early). This applies to the hook, turn, meet arc; another structure maps its beats onto the roles (section 16).
- Build the hook as 2 to 4 lines on changing images, with one thing changing every 1 to 2 s, because a single hold reads as stalled.

**3D renders.** Use 3D only when it is lit in the brand atmosphere (brand-colour key and rim light, a gradient ground, no neutral grey studio) and earns its time: it moves, it becomes something (the next scene), and it stays on screen for at most a quarter of the hook. A flat 2D card or kinetic type beats a grey keyboard every time.

**The score fields** (all required on a launch film; `crew.mjs check` refuses a launch score without them): per beat `ground`, `role` (hook | turn | meet | capability | payoff), `hero_scale` (cap height of the biggest line, % of frame height), `ui_scale` (the UI proof's % of frame area, 0 if none) and `hold_s` (longest static hold, s); plus `line`, `scene_type`, `texture` (+ `fps` when stepped), `transition_in`, `density`, `logo`; optional `carrier_state`, `moves_named[]` (catalogue names; `moves[]` is the per-tween records), `imagery`, `cursor_reason` (section 4), `emphasis {word, kind}`, `type_treatment` (section 2), `layout`, `ui_build`, `ui_camera` (section 5), `ground_material`; score level `type_treatments[]`, `ui_camera`, `imagegen`.

**The reference jury.** After the draft render and the critics' fixes, and before the Final call, the `reference-juror` (`agents/reference-juror.md`) looks at the film's 1.5 fps contact sheet (`crew.mjs refsheet`) beside the three house reference sheets and scores 1 to 10 on story clarity, typography scale and craft, ground and atmosphere rhythm, motion choreography, scene variety, motion texture contrast, brand-light presence and pacing.
- Run one targeted fix round (a concrete fix per beat) for any score under 7, then re-check, and put the scores in the Final push.
- Compare against the references and not against the film itself.

## 13. The three house references (what each proves)

| | Minase (41 s) | Kinso (46 s) | Sovra.fm (52 s) |
|---|---|---|---|
| Ground | white and near-black | coral and teal gradient, dark hex slate, white UI | one dark ground lit by purple glow |
| Texture | stepped collage and UI at about 10 fps, a flicker burst, glitch pop-ins, smooth footage and slates | smooth and crisp | smooth and crisp |
| Scenes | collage, footage, type slates, type collage, dashboard, orbit diagram, kinetic list, typed caption, logo | type, glass shelf, app stack splitting a word, scale-down type, iris, count-up | ribbon, line-lit type, card stack, queue, loop rings, typed-prompt product demo, vinyl result, DJ orb, upload, glow bloom, slot list, logo |
| Carrier | none that runs through | a local orb | none (ribbons bookend, a DJ orb is a character) |
| Cursor | none | none | real product actions only (Create, upload, remove Spotify) |

- Calibrate the gates so all three pass and the 26keys v6 film (a flat, unlit, static, small-content void) fails.
- Tune toward their shared traits (variety, light, motion) and skip matching one film's texture or ground colour, because those differ between the references. Breakdowns: `library/benchmarks/launch-refs/<id>/`.

## 14. Clarity, proof, benefit and call to action

This section is the home of five rules from the YC design reviews (`.context/yc-design-review.md`): what it is and for whom, real UI by 40%, benefit over feature with specific numbers, one message, and a clear CTA. Score fields live in `references/score.md` "Clarity, proof and CTA"; the checks are `clarity-*`, `ui-proof-*`, `core-job-*`, `one-message-*`, `cta-*` and `copy-buzzword` in `scripts/lib/launch-beats.mjs` (all warnings), `scripts/lib/copy-lint.mjs` (the buzzword list and the CTA shape) and the five-second cold read in `agents/reference-juror.md`.

| Rule | Number | Why |
|---|---|---|
| Say what it is and for whom | by the end of the turn (about 20 to 25% of the film), before the logo | a viewer who cannot name the category and the audience in the first quarter stops watching |
| Show real UI | first UI proof by about 40% of the runtime; at least one beat has `core_job_demo: true` | a film that shows the product late, or never doing its job, is a mood piece |
| State the benefit | every capability line says the viewer's outcome | the viewer buys what happens for them, not how it works |
| Prefer specifics | a true number or concrete detail from `research/claims.json` over "faster" or "better" | a number can be checked, an adjective cannot (claim-truth rules still apply) |
| Say one thing | the concept declares `one_message` (one sentence); every beat serves it | a film that says three things is remembered as none |
| End on a clear CTA | the final beat carries a verb plus a destination, held at least 2 s | the viewer needs to know the next step and have time to read it |

- Make the hook or the turn name the category and the audience in plain words, and keep the product name for the meet, because clarity before the logo is what Kinso's "Your next deal is in here somewhere" does (a deal, a person who closes deals).
- Land the first UI proof by about 40% of the runtime, and mark the beat that shows the core job done on the mockup with `core_job_demo: true`, because proof of a line is the product doing the job and not a decoration (section 5 sets the size).
- Write each capability line as the outcome for the viewer and keep the mechanism for the UI proof, because the line is read in a second and the mechanism does not fit.
- Take a number or a concrete detail from `research/claims.json` where one exists and keep the claim scope, because a true number lands harder than an adjective and an invented one breaks trust.
- Replace the buzzwords in `scripts/lib/copy-lint.mjs` with the specific thing the product does, because those words say nothing a viewer can check.
- Map every claim to a beat that visibly proves it (the claim-to-proof map, below), because a claim the picture never shows is an adjective with an id.
- Write the CTA as a verb plus a destination ("Download for macOS", "Start your 7-day free trial", "Join the waitlist"), put it on the last beat and hold it at least 2 s, because a bare logo end card gives no next step.

<example>
Benefit, not feature (capability line)
good: "Find any message in seconds" (the outcome; the search UI proves it)
good: "Close 12 follow-ups before lunch" (a true number from claims.json)
bad: "AI-powered semantic search" (a mechanism and a buzzword)
bad: "Faster, better, smarter inbox" (adjectives with nothing to check)
</example>

<example>
What it is and for whom (hook and turn)
good: hook "Your next deal is in here somewhere", turn "Let's find it": the category (deal tracking) and the audience (people who sell) are clear before the logo
bad: hook "Meet the future of work", then the logo: nothing says what it is or who it is for
</example>

<example>
Call to action (final beat)
good: "Download for macOS", held 2.5 s on the end card
good: "Join the waitlist", held 2 s
bad: "Learn more" flashed for under 1 s, or a logo with no words
</example>

### The claim-to-proof map

- Give each capability beat `proves: [claim ids]` (ids from `research/claims.json`), and list the claims the copy uses in `claims_used`, because the viewer should see every claim happen and not only read it.
- Prove a claim with something visible: a UI proof, a before and after, a demo of the job, or the number on screen.
- Check: `proof-map-missing` (no beat declares `proves`) and `claim-unproven` (a used claim no beat proves), both warnings.

<example>
Claim to proof
good: claim `c3` "12 follow-ups before lunch" is in the copy, and beat 5 (`proves: ["c3"]`) shows the list emptying to 12 sent
bad: `c3` is in the copy and the only beat near it is a mood slate
</example>

## 15. Motion purpose

This section is the home of the distinct reveal and the mood rules. The hero, purpose and exit rules live in `craft.md` "Purpose, hero and exits"; the fields are in `score.md` "Motion purpose". All checks are warnings.

| Rule | How | Why |
|---|---|---|
| Make the reveal and the CTA distinct | the meet beat and the CTA beat each declare `distinct: {what}`: a colour, scale, motion or sound found nowhere else in the film | an element that differs from its surroundings is the one remembered (Von Restorff), and the reveal and the CTA are the two things to remember |
| Let mood follow the story | every beat declares `mood`: `problem \| turn \| solution \| climax \| cta` | the picture should change when the story does |
| Mute the problem | problem beats take a more muted ground, tighter framing and constrained motion | the viewer feels the squeeze |
| Open the solution | solution beats take a brighter ground, a more open frame and confident motion | the viewer feels the relief |
| Calm the CTA | the CTA beat is calm and uncluttered | a clear next step needs room |

- Declare a `light` per beat next to `ground`, because problem and solution beats that declare the same ground and light read as one mood (`mood-flat`).
- Check: `distinct-missing`, `distinct-repeat`, `mood-missing`, `mood-flat` in `scripts/lib/launch-beats.mjs`.

## 16. Structure options

The hook, turn, meet, capabilities, payoff arc (sections 1 and 2) is the default candidate. A concept declares `structure: {kind, why}` and the why fits the product and where the film is shown. Every structure keeps the clarity rules of section 14: what the product is and who it is for, one message and a held CTA.

| `kind` | Fits | Shape | Source |
|---|---|---|---|
| `hook-turn-meet` | a felt problem and a product that resolves it | hook, turn, meet, 2 or 3 capabilities, payoff (sections 1 to 2) | the three house references (Minase, Kinso, Sovra.fm) |
| `sung-script` | a product whose voice or audio is the product | the script is written to be sung; picture accents follow the sung syntax, not only the kick grid; every essential claim survives the performance | Sovra.fm maker's production thread (single practitioner), https://www.linkedin.com/posts/abdullah4204k_one-of-our-best-videos-this-month-most-activity-7464873763453698050-8Ycn |
| `teaser-reveal` | a campaign where a later demo carries the explanation | essence first, then the reveal; the concept names the destination demo, and a standalone film never defers its only explanation to an absent demo | Tendril, Figure F.02 production case (studio practice), https://tendril.studio/work/figure02/ |
| `parts-assembly` | an invisible or complex system | behaviour, then components, then the assembled whole; the parts introduced early resolve into the final assembly | Tendril, IBM z17 production case (studio practice), https://tendril.studio/work/ibm-z17/ |
| `before-after` | a visible transformation of a state | the before state, the operation, the after state, both states literal UI | a RasanAI pattern: the research does not source it, and the claim-to-proof map already names before and after as proof |
| `feature-led` | one feature is the news | the feature, its operation and its result, with a benefit headline | a RasanAI pattern: the research does not source it |
| `medium-as-proof` | the product's own medium can show the product | the film is made in, or with, the product's medium | Ordinary Folk, Introducing Spline (studio practice), https://www.ordinaryfolk.co/project/introducing-spline |

- Declare the structure in the concept (`structure: {kind, why}`) and carry it onto the score, because the jury, the critic and the juror judge a film against the structure it chose (`launchConceptWarnings` warns on a missing or reasonless structure).
- Map each beat of a non-default structure to the nearest role (`hook`, `turn`, `meet`, `capability`, `payoff`) in the score, because the gates read roles.
- Pick the structure the product and its distribution call for, and keep the default when nothing calls for another, because a structure chosen for novelty is the logo-swappable film of section 18.
- Source for the principle: the research's contradiction table, "Is a single launch structure best?" (IBM z17, Sovra.fm and Figure F.02 differ on purpose).

<example>
good: concept for a voice-clone app, `structure: {kind: "sung-script", why: "the product is a voice; a script written to be sung shows it in the first second and the claims are sung, then repeated on screen"}`.
good: concept for a design tool, `structure: {kind: "medium-as-proof", why: "the film is built in the tool's own canvas, so every shot is evidence"}`.
bad: `structure: {kind: "teaser-reveal", why: "it feels exciting"}` for a film that is the only asset and never names its demo.
</example>

## 17. Craft research rules

This section holds the rules the professional research added (`.context/motion-craft-research.md`, its Top 15). Fields are in `score.md` "Craft research fields"; type, cursor, blur and boundary rules are in `craft.md` "Craft research"; sound rules are in `sound.md`. Every check is a warning.

### Readable exposure (the render)

- Measure each essential line's settled, unoccluded time from the composition, not the lifetime of its layer, because the entrance and a card on top both eat the reading window. The render gate samples the DOM (`frame-gate.mjs` text blocks) and reports `readable-exposure` (`lib/readable-exposure.mjs`).
- Start at about 2.7 to 3 words per second of settled time for an essential line, add about 0.5 s per figure and 0.3 s per long term, and read the result as a starting value to test (section 19).
- Allow a single familiar word as a 0.25 to 0.75 s accent, because a rhythmic word is not a sentence.
- Shorten or reschedule before speeding up: cut words, move the line to a longer beat, let it stop moving earlier. The existing reading-time rule (`craft.md` "Reading time") covers the plan; this budget covers the render.
- Source: BBC Subtitle Guidelines, 160 to 180 words per minute (studio practice, an adaptation and not a kinetic-type standard), https://www.dejavu.org/cgi-bin/get.cgi?url=https%3A%2F%2Fwww.bbc.co.uk%2Faccessibility%2Fforproducts%2Fguides%2Fsubtitles%2F&ver=93; Netflix English timed-text guide, 20 characters per second for adults, https://partnerhelp.netflixstudios.com/hc/en-us/articles/217350977-English-USA-Timed-Text-Style-Guide; Screen Studio on stabilising the screen sooner when viewers must read, https://preview.screen.studio/guide/animations.

### The animatic gate

- Block the whole film as an animatic before polishing any shot, because a timing revision is cheap before animation and expensive after. The animatic step already does this (`SKILL.md` step 4, `references/workflows/music-animatic-build.md` section 4): every scene's key frame at its real duration, with the real music and voice, judged whole.
- Review the full-film timing and the concept there, and treat a timing note after Build as a sign the animatic was skimmed.
- Source: Giant Ant, Slack Traffic production breakdown (studio practice), https://www.giantant.ca/slack-traffic.

### Product-state truth

- Use literal UI for proof and abstract UI for sensation, and tag each UI beat `ui_mode: literal | abstract`: an abstract shot never counts as proof, and the claim-to-proof map accepts only literal beats (`proof-abstract`). Source: Genpilot (studio practice), https://liandankeji.com/work/projects/p010/index.en.html, against the abstract UI of Oddfellows' Spotify film, https://oddfellows.tv/work/spotify-premium.
- Record each UI beat's state as `ui_state: {id, labels, figures, action, result}`, because the same state id must show the same labels and figures in every shot (`ui-state-drift`) and every shown action is followed by its result in order (`ui-action-no-result`, `ui-result-before-action`).
- Keep UI words and numbers deterministic and render them from approved state data, because generative imagery mutates text; a compressed demo still shows a real operation with true causality. Source: Genpilot, as above; MHF Creative, Awin brand-film case (studio practice), https://mhf-creative.com/work/awin-brand-evolution-film/.

<example>
good: beat 4 `ui_state: {id: "inbox-12", labels: ["Follow-ups", "12 sent"], action: "tap Send all", result: "list empties to 12 sent"}` and beat 7 reuses `inbox-12` with identical labels.
bad: beat 4 shows "12 sent" and beat 7, the same state, shows "11 sent"; or a tap with no list change after it.
</example>

### Intensity map

- Declare per beat `intensity: {cut_rate, movement, proximity, camera}`, each `low | med | high`, because pacing is four separate things: how often it cuts, how much moves, how close the subject is and how the camera moves. No published score combines them (`intensity-missing`).
- Give every major change (an axis jumping low to high or back) an `intensity.why`, the reason (the drop, the reveal, the breath) (`intensity-change-unexplained`).
- Alternate on purpose, and explain a deliberately relentless or serene film in the concept, because a map that is the same on every beat means nothing speeds up, closes in or calms down (`intensity-flat`, a warning to review, never a rejection).
- Source: Paddy Bird, Inside the Edit, pacing (single practitioner), https://www.insidetheedit.com/blog/pacing-in-video-editing; Walter Murch, In the Blink of an Eye (single practitioner), https://bpb-us-w2.wpmucdn.com/portfolio.newschool.edu/dist/2/14941/files/2017/06/Murch-Walter-in-the-blink-of-an-eye-RULEofSIX-1tly3uz.pdf.

### A resolved ending

- Resolve picture and music together on a deliberate musical endpoint (a final chord, a controlled ringout, a sting or a clean hard stop), because an arbitrary cut or a generic fade sounds interrupted. Declare `ending: {music: resolve | ringout | sting | hard-stop | none, settled_s}` (`ending-missing`, `ending-unresolved`).
- Hold a settled end frame of 2 to 4 s (starting values to test), and longer for a URL or several calls to action, because the product name, the action and the URL still have to be read (`end-frame-short`; the CTA hold of section 14 is the floor).
- Source: Ben Haslup, Frame.io, Make Any Music Track Fit Your Video (single practitioner), https://blog.frame.io/2017/11/08/make-music-fit-your-video/; Chris Salters, Frame.io, stretch music tracks (single practitioner), https://blog.frame.io/2023/06/07/insider-tips-stretch-music-tracks-in-premiere-pro/; School of Motion, 10 Tiny Typography Decisions on the final lockup (studio practice), https://schoolofmotion.com/blog/tiny-typography-decisions-motion-graphics.

### The viewing-size pass and the fresh viewer

- Check the film at phone size, because most viewers watch small: `crew.mjs refsheet` writes `phone-sheet.jpg` (every frame 390 px wide, 4 tiles a row), and the reference juror and the critic judge readability, crop and hierarchy on it.
- Run a fresh-viewer pass on the full contact sheet before the brief or the score is opened: record unaided recall of the product, the benefit and the CTA, and the moments that could not be followed. A fresh viewer who cannot recall them overrules a passing internal score (`agents/reference-juror.md`). Source: Jorge Canedo Estrada, Creativity & Detail interview (single practitioner), https://medium.com/creativityand/creativity-detail-jorge-canedo-estrada-60cc605d2098.

## 18. Brand-derived motifs and the logo-swap test

- Give each major motif a provenance, `motif_source`: a brand element (its grid, dots, type, transparency), a product verb (what the product does) or the customer's material, because recurring brand details give identity without a big logo (`motif-source-missing`). Source: BUCK, Nothing Playground (studio practice), https://buck.co/work/nothing-playground; ManvsMachine for Squarespace, digital gestures as physical actions (studio practice), https://www.squarespace.com/press-coverage/2017/9/25/manvsmachine-creates-films-for-squarespace-showing-three-creatives-practice-and-personalities.
- Ask the logo-swap question of every film: could this film advertise any SaaS product after a logo swap? A yes is a sub-7 trigger for the reference juror and a finding for the critic, because motifs and metaphors built from the specific brand and product verbs cannot be swapped.
- Make an object transition enact a product gesture where one exists (a swipe is a physical swipe, a share is a hand-off), because the bridge then explains the product.
- Link beats causally (`set_up` on a beat that plants something, `pays_off` on the beat that cashes it in), because a beautiful middle with no cumulative progression or payoff is the film Claude makes when nobody links the shots (`progression-missing`, `set-up-dangling`). Source: Tendril, Coinbase CB1 process (studio practice), https://tendril.studio/work/coinbase/.

<example>
good: motif `{what: "dot grid", source: "brand-element", ref: "the Nothing site's dot matrix"}`; the card carrier is a product verb (`source: "product-verb"`, the user's own Send).
bad: soft gradients, floating cards and an orb with no source: swap the logo and the film sells any other app.
</example>

## 19. Calibration profile

These are starting values for a copy-led 30 to 60 s RasanAI film, to test on RasanAI's own output. They are proposals and not sourced standards, and nothing here is a hard constraint: compare alternative cuts with unfamiliar viewers and keep the timing metadata so the next revision is evidence-led. Source: `.context/motion-craft-research.md` "Practical calibration profile".

| Purpose | Starting value | Override when | Measure |
|---|---|---|---|
| Familiar single-word accent | 0.25 to 0.75 s of exposure | it carries an unfamiliar claim or an essential instruction | unaided recognition; the range does not support reading a sentence |
| Essential short line | 2.67 to 3 words per second of readable exposure (BBC subtitle practice, a conservative reference) | new terms, detailed visuals or a non-native audience: add time | effective words per second and real comprehension |
| One UI operation and its result | 3 to 6 s as a shot budget | the operation is simpler, or a new mechanism needs longer | can an unfamiliar viewer name the input, the action and the result |
| Breath after an intense run | 0.5 to 1.5 s with less information arriving | a musical phrase or a reading window needs more | the change in information, motion and sound; a breath need not be blank |
| Hero or UI end frame | 2 to 4 s settled | several calls to action or a URL; a familiar logo-only sting needs less | product-name and CTA recall at viewing size |
| Transitions | hard cuts plus 2 to 3 bridge families | the concept needs another with a role | consistency, and whether exceptions add meaning |
| Sound-event density | no global hits-per-second target | build density locally for a designed texture | foreground role, masking, repetition and phrasing |
