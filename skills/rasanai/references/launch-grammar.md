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

## Target and scope

- Aim every launch film at the three reference films, Minase (41 s), Kinso (46 s) and Sovra.fm (52 s): copy-led kinetic type, a fixed arc, a light brand, simplified UI proof, a variety of scenes, motion textures that contrast, dense and sparse in alternation, and always something moving.
- Name and describe the references and leave them uncopied, unembedded and unstored, because they are third-party films.
- Differ from film to film in hook, scene plan, type pairing, signature transition and signature moment, because "in its own way" means a different plan on the same grammar and never a different art world.
- Treat style worlds (pixel, clay, paper, voxel...) as an optional flavour when the brief asks for one, because they are the exception and never how ideas differ.
- Build on scene variety, designed texture contrast, optional local carriers and varied transitions, because the owner's verdict on a Kinso-style rebuild was "too smooth" and "one concept (a caret line) through every scene and every transition is repetitive". Use Codex imagery where a scene needs meaning, and treat the standard AI moves (a cursor pointing at a word, a highlight that nudges) as rare tools (`launch-moves.md`).

## 1. The arc (fixed; the content changes every time)

Order every film hook, turn, meet, 2 to 3 capabilities, payoff, with one thought per beat and on-screen type carrying the story. A voiceover is optional and reads only the on-screen lines (Minase reads its lines; Kinso is music only); a song may be asked for, and the type then carries the same lines.

| Beat | Job | Shape |
|---|---|---|
| Hook | the viewer's problem, felt | 2 to 4 short lines, second person, no logo, no product name |
| Turn | one short pivot line | 2 to 5 words ("Let's fix this first", "That's it", "The moment it clicks") |
| Meet | the brand or product reveal, small and calm | the logo or wordmark plus one phrase, on an empty ground; the first logo use (section 3) |
| Capabilities | 2 or 3 beats, each proves one thing | one line plus one simplified UI mockup that proves that line |
| Payoff / CTA | the emotional line, or social proof | a closing line, or a count-up number then its label; the end card holds the logo (the last logo use) and the call to action |

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
- Build lines word by word or swap word in place, and give every line exactly one emphasised word (colour, weight, size or italic), the word that carries the turn of the line, because one emphasis is what the eye lands on.
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

Checked by `launch-beats` as warnings (`scene-variety`, `scene-share`, `scene-neighbours`):

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

Ask for a generated image when a beat would otherwise be an empty card or abstract shapes (`references/imagery.md`, "Launch imagery"; the concept, the designer or the motion director may ask). The three uses are a world inside a UI card (Minase fills its landing pages and cards with generated grass hills, a chair on a mound, flowers), an object or metaphor shot, and a cinematic plate behind type.

- Prompt it from the concept and the brand palette, and keep it consistent through the world bible (`art/world.json`), because shared style makes the set one world.
- Animate it with parallax layers, a push, a light sweep or a stepped reveal, and hold a still at most about 1.2 s, because a static still reads as a slide.
- Use 1 to 4 images per film, only where they add meaning, because wallpaper adds nothing (`imagery-count` warns above 4).
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
- Land the mockup next to the line it proves (type and UI share the frame), enter it by the beat's own move (a mask, a stepped pop, a push, a fly-in) and leave it by the next transition.
- Crop, tilt or float it as a card if you like, and fill 35 to 60 percent of the frame when it is the proof of a line, because under 25 percent is a chip and not a proof (section 12). One mockup per film may fill 50 percent or more (the hero proof).
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

- Keep any one transition family to about 30% of the seams at most (`transition-variety`), because one family across the film reads as a gimmick.
- Name one signature transition per concept and repeat it 2 to 3 times as the film's rhythm, using the rest as supporting seams.
- Allow a footage or dark interlude when the concept calls for it.
- Apply the shot-length distribution checks, with one exception: a declared flicker burst or stepped section may exceed the usual cut rate (`frame-spikes` allows 14 per 10 s when the score declares non-smooth textures).

## 7. Rhythm rules

- Alternate dense and sparse: follow a dense moment (a collage of cards, app icons, a dashboard, a stack of lines) with a sparse one (a single small line on an empty ground) and the reverse, with no more than 2 dense or 2 sparse beats in a row, because the contrast makes each read (the launch-beats gate warns on more than 2 dense in a row: `dense-run`).
- Lock the tempo to the music: land seams and hard cuts on its hits, drops and break edges (`audio/music-map.json`) and the turn on the drop, because picture on the beat feels intentional.
- Take grounds from neutral or brand atmosphere (clean white, a soft brand gradient, a brand-colour slate, near-black) and skip gimmick grounds; the ground-family and light rules are in section 12.
- Swing the type scale (full-frame type, then small centred type), because a film that keeps the same type size for 5 s is wrong.
- Declare one `signature_ease` in the score (a custom cubic-bezier or an expo.out family) and use it on 70 to 85 percent of the smooth moves, because one curve gives the film a voice. Stepped and flicker beats set their own timing by fps, and other curves are accents reserved for contrast (a whip, the signature transition, the payoff hit). The gate warns under 60 percent or with none declared (`signature-share-low`, `signature-ease-missing`). The 40 percent variety cap applies to non-launch films only (`craft.md`, "A curve per role").
- Keep cascades short (3 to 7 items inside 0.5 s; a set piece 1.2 s) and counter-drift ambient layers at 20 to 30 percent of hero speed (`craft.md`).
- Keep a carrier's velocity at every handoff (`motion-handoffs.md`).
- Spend everything on the signature moment, the moment a viewer rewinds (the object splitting the word, the word becoming a metaphor, the count-up landing).

## 8. Concept fields for a launch film

Name these in every launch-film concept: `hook_lines` (2 to 4), `turn_line`, `meet` (the reveal beat: what appears, where, how small), `capabilities` (2 or 3 of `{line, ui_proof}`), `payoff` (line plus CTA), `scene_plan[]` (one entry per beat: `{beat, scene_type, texture, move, imagery?}`; 5+ types in 45 s, none over 30%, neighbours differ), `texture_accents[]` (where the stepped or flicker sections are and why), `signature_transition`, `ground` (`neutral` | `brand-gradient` | `dark`), `type_pairing`, plus the usual `signature_moment`, `sound_mode` and `shots[]`.

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

- Make the three looks distinct treatments: ground, type pairing, scene plan and light differ as a set, and type pairing and scene plan differ on every look, because three looks that differ in one axis read as one.
- Give at least one look a lit atmosphere (a soft brand gradient as in Kinso, OR a coloured light or glow on dark as in Sovra.fm, one dark ground lit by moving purple light, OR a lit white), because lit atmosphere is what the references share. Three different grounds are a recommendation, not a rule.
- Use the brand palette as atmosphere and keep the logo small on every look.
- Take a soft brand-gradient ground from the brand's own palette and keep it subtle, and use a blue or purple glow only when the brand palette calls for it, because a default blue or purple glow is the AI look. The references use white, near-black and the brand's own atmosphere.

## 10. Critic checklist

Each item points to the section that holds the rule.

1. The arc is present and in order, within the template timings (section 1).
2. The hook carries no logo and no product name, and states a problem (sections 1, 2).
3. Each beat has one thought and one emphasised word (section 2).
4. The logo count and size follow section 3.
5. Scene variety holds (4a), texture is mixed (`launch-moves.md` § Motion texture), any carrier is local (4c), and no move is in more than 2 beats (4e).
6. Each capability has exactly one simplified UI proof beside its line, and none is a screenshot (section 5).
7. Seams are named and varied, hard cuts on music hits are fine, and the signature transition recurs 2 to 3 times (section 6).
8. Dense and sparse alternate and grounds stay neutral or brand atmosphere (sections 7, 12).
9. Every claim is real (section 2).
10. One signature curve covers 70 to 85 percent of the moves, accents are limited to a whip, the signature transition and the payoff hit, and the hook, meet and payoff move as the profile table says (sections 1, 7).
11. No AI-cliche emphasis: the limits in `launch-moves.md` § AI cliches hold, with no people or neon or glow in generated images (4d).
12. Section 12 holds: hero cap height 9 to 20% in every beat, UI proof 35 to 60%, 2 or more ground families with brand atmosphere in 30% or more of the film, no hold over about 1.2 s, no plain fade or blur transition, hook at most 25%, no grey 3D hero.

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
| Set hero lines at display scale | cap height 9 to 20% of frame height at least once per beat | Kinso's "here", "One inbox" and "for every conversation" are 10 to 25%; Minase's slate words about 12% |
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
- Light small content: small content in a flat, unlit, static void is the defect (the 1.36 film), while small type in a frame lit by colour glow with something moving every second is allowed (Sovra.fm). The gate errors only when coverage is low AND the ground is unlit AND the brand colour is scarce.

**Always moving**

- Keep continuous visible motion in every beat (something builds, moves, swaps or travels at every moment), and fill a hold with secondary motion (a word swap, a light sweep, a count-up, a scrolling list, a stepped drift). A hold is at most about 1.2 s; an end card may hold up to about 3 s while ambient light keeps moving. Declare the beat's longest hold in `hold_s`.
- Build transitions from the section 6 vocabulary and use blur as a finish on a whip, push or rack focus, because a plain fade or a blur-only transition is not choreography. A move that reads as opacity plus blur needs travel, scale, a mask or a carried object.

**Pacing**

- Keep the hook at 20 to 25% of the film at most (6 to 10 s at 45 s; 7 s at 30 s) and meet the brand by about 30 to 40%; a hook of 30% or more is an error.
- Build the hook as 2 to 4 lines on changing images, with one thing changing every 1 to 2 s, because a single hold reads as stalled.

**3D renders.** Use 3D only when it is lit in the brand atmosphere (brand-colour key and rim light, a gradient ground, no neutral grey studio) and earns its time: it moves, it becomes something (the next scene), and it stays on screen for at most a quarter of the hook. A flat 2D card or kinetic type beats a grey keyboard every time.

**The score fields** (all required on a launch film; `crew.mjs check` refuses a launch score without them): per beat `ground`, `role` (hook | turn | meet | capability | payoff), `hero_scale` (cap height of the biggest line, % of frame height), `ui_scale` (the UI proof's % of frame area, 0 if none) and `hold_s` (longest static hold, s); plus `line`, `scene_type`, `texture` (+ `fps` when stepped), `transition_in`, `density`, `logo`; optional `carrier_state`, `moves_named[]` (catalogue names; `moves[]` is the per-tween records), `imagery`, `cursor_reason` (section 4).

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
