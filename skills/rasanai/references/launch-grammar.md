# Launch grammar: the default look and shape of a RasanAI launch film

Applies to every launch, promo, feature-reveal and product-launch film (`product-first.md` scope; the same detection as `ctx.product_first` in `crew.mjs`). Non-launch films (brand films that are not launches, lyric videos, music videos, character films, explainers) keep the style-world rules and do not read this file.

The target is two reference launch films, **Minase** (41 s) and **Kinso** (46 s). They are third-party: this engine names them and describes what they do, and never copies, embeds or stores them. Every RasanAI launch film should feel like they do, each in its own way: copy-led kinetic type, a fixed arc, a light brand, simplified UI proof, one continuous take of motion, dense and sparse in alternation.

"In its own way" means each film differs in its **hook, carrier motif, type pairing, signature transition and signature moment**. It does not mean a different art world. Style worlds (pixel, clay, paper, voxel...) are an optional flavour a concept may choose when the brief asks for one or the idea truly needs it; they are not the default and they are not how ideas differ.

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

The hook is never longer than a quarter of the film and the meet never starts before 28 percent or after 40 percent of it (the reference films meet the brand at roughly a third). The payoff gets at least 12 percent of the film so that the last line can breathe.

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
- The brand is felt as **palette atmosphere plus the carrier**: the brand colours become the ground (a soft brand gradient), the accent, or the carrier's own colour. A soft gradient ground, a clean white slate with one brand-coloured accent shape, or a near-black slate with a brand-coloured glow are all legitimate.
- Never copy the brand's website layout or its white page. Use only its logo, accent/palette, and its type face on the claim or end line when the brief locks one.
- The real product UI appears only as **simplified recreated mockups** (section 5), and only where it proves a line.

## 4. The carrier motif

One object travels the whole film and hands off between beats. Kinds that work: an orb or sphere, a card, a cursor, a pill, a shape or mask, an app-icon stack, a line or underline. Rules:

- Declared in the concept (`carrier {what, kind}`) with a `handoff` line: how it changes from beat to beat (hook, turn, meet, each capability, payoff). Every handoff names the thing it becomes: an orb that becomes a cursor, a marker, a big sphere, then the notification; a card that becomes the UI frame, then the stat chip.
- It is present in every beat or every other beat (never gone for more than one beat), and it is the object that crosses each seam.
- It carries the brand colour. It is not the logo.
- It is simple to draw (a shape, a gradient, a card); complexity lives in its motion, not its detail.
- Two films in one pool never share the same carrier.

## 5. UI mockup rules

- Simplified, recreated mockups: an inbox list, a phone with a notification, a prompt box, a stat card, a toggle row. Never a full-screen screenshot, never the whole site, never a screen recording.
- One idea per mockup; 3 to 7 rows or elements; real words from the claims, the rest greyed placeholders.
- A mockup lands next to the line it proves (type and UI share the frame), enters from the carrier or the line, and leaves by the carrier or the next transition.
- It is allowed to be partly cropped, tilted or floated as a card; it may sit at 25 to 60 percent of the frame. One mockup per film may fill 50 percent or more (the hero proof).
- A mockup enters with travel or scale paired to its fade, never opacity-only and never from `scale(0)` (0.92 to 0.95 up). Heavy UI (the panel, the hero mockup) lands with no overshoot; chips and pills may settle only when thrown (`craft.md`, "Weight classes").
- Real product pixels (a captured screenshot) are used only where the product's look itself is the point and the user supplied it; otherwise recreate in the film's palette and type.

## 6. Transition vocabulary (continuous one-take: every transition is motivated)

Every beat change is one of these, and each is motivated by the content:

1. **Type morph**: a word or line turns into the next (letters re-form, a word swaps in place, a letter becomes the next shape).
2. **Carried element**: the carrier or a UI card travels across the seam and becomes the next scene's element.
3. **Object mask or wipe**: an object slides through the frame or inside a word and reveals the next scene (an app stack sliding inside a word and splitting it; a band sweeping in as a wipe).
4. **Push or pull**: the camera pushes into a word, a hole or the UI and arrives in the next scene, or pulls out to reveal the previous scene as an element.
5. **Whip swap**: a fast blur-stretched pan that swaps the scene under the blur, on a music hit.
6. **Word split**: a word opens to admit an object (a redaction pill crossing a word, a letter pair opening, a highlight chip on a word).

Each concept names one **signature transition** (its own, repeated 2 to 3 times as the film's rhythm) and uses the rest as supporting seams. Every transition is motivated. A plain cut is a waivable exception: the launch-beats gate warns at 1 to 2 plain cuts and errors above 2 (waive with a reason: `grammar_waivers` rule `hard-cuts`). The shot-length distribution checks still apply. One dark or footage interlude is allowed (a stock or generated mood plate with type over it) if the concept calls for it and it returns to the main ground with a transition.

## 7. Rhythm rules

- **Dense and sparse alternate.** A dense moment (a collage of cards, app icons, a dashboard, a stack of lines) is always followed by a sparse one (a single small line on an empty ground) and the reverse. No more than 2 dense or 2 sparse beats in a row (the launch-beats gate warns on more than 2 dense in a row: `dense-run`).
- The tempo is locked to the music: seams land on its hits, drops and break edges (`audio/music-map.json`); the turn lands on the drop.
- Grounds are neutral or brand atmosphere: clean white, a soft brand gradient, or near-black. Mix at most 2 grounds in a film, and change ground only on the turn, the meet or one interlude. Never a gimmick ground.
- Type scale swings: full-frame type, then small centred type. A film that keeps the same type size for 5 s is wrong.
- **One signature curve.** A launch film declares one `signature_ease` in its score (a custom cubic-bezier or an expo.out family) and 70 to 85 percent of its moves use it: that is what makes it one take. Other curves are accents, reserved for contrast: a whip, the signature transition, the payoff hit. The gate warns under 60 percent or with none declared (`signature-share-low`, `signature-ease-missing`). The 40 percent variety cap applies to non-launch films only (`craft.md`, "A curve per role").
- **Cascades are short** (3 to 7 items inside 0.5 s; a set piece 1.2 s) and **ambient layers counter-drift** at 20 to 30 percent of hero speed (`craft.md`).
- **The carrier keeps its velocity at every handoff** (`motion-handoffs.md`).
- The signature moment is the one place the film spends everything: the moment a viewer rewinds (the carrier transforming, the word splitting, the count-up landing).

## 8. Concept fields for a launch film

Every launch-film concept names: `hook_lines` (2 to 4), `turn_line`, `meet` (the reveal beat: what appears, where, how small), `capabilities` (2 or 3 of `{line, ui_proof}`), `payoff` (line plus CTA), `carrier {what, kind, handoff}`, `signature_transition`, `ground` (`neutral` | `brand-gradient` | `dark`), `type_pairing` (for example serif-italic plus sans, grotesk, mono accents), plus the usual `signature_moment`, `sound_mode` and `shots[]`. `style_world` is **optional**; absent means the kinetic-launch default (the `kinetic-type-only` atlas world as its base, grounds per `ground`). At most 1 of the jury's 3 picks may name a non-default world.

Diversity across ideas and across the 3 jury picks means a different hook, a different carrier and a different signature transition. It does not mean a different art style.

## 9. The three looks of a launch film

The Look step makes three treatments of this grammar, not three art worlds. Axes: **ground** (soft brand gradient, clean white, near-black), **type pairing** (serif-italic plus sans, grotesk, mono accents), **carrier** (orb, card, cursor, shape), **density**. The three differ in ground, type and carrier together. Each uses the brand palette as atmosphere and keeps the logo small.

## 10. Critic checklist

1. The arc is present and in order, within the template timings.
2. The hook carries no logo and no product name, and states a problem.
3. One thought and one emphasised word per beat.
4. The logo appears at most 3 times and small.
5. The carrier is in every beat or every other beat and hands off at every seam.
6. Each capability has exactly one simplified UI proof beside its line; none is a screenshot.
7. Every seam is a motivated, named transition (a plain cut is a waivable exception: warns at 1 to 2, errors above 2); the signature transition recurs.
8. Dense and sparse alternate; grounds stay neutral or brand atmosphere.
9. Real claims only.
10. One signature curve on 70 to 85 percent of moves; accents only for a whip, the signature transition and the payoff hit; hook, meet and payoff move the way the profile table says.

Related: `launch-film.md` (timings, measurement, red flags), `product-first.md`, `ui-rebuild.md`, `motion-handoffs.md`, `composition-transitions.md`.

## 11. Chrome, carrier and look rules

- **Chrome rule.** No fake HUD or instrument labels (timecodes, "LINE 01", "VARISPEED", tick rulers, coordinates) unless the product is that kind of tool. The references use clean type and simplified UI, not dashboard decoration.
- **Looks: contrast and atmosphere.** The 3 looks use 3 different grounds (soft-gradient, white, near-black; near-black, dark and black are one ground), and at least one is a soft brand-gradient ground built from the brand palette (Kinso-style atmosphere).

- **Launch concept carrier rule.** The carrier and the props come from the product, its UI and the brand (caret, highlight, card, chip, notification, an orb in the brand colour, or the user's own text), not from an outside metaphor world (a Tetris tank, a letterpress, a courtroom, karaoke, a nature doc). At most ONE wild-lane idea may use an outside metaphor, and the jury may not recommend it. A concept whose carrier.kind is "object" gets a schema warning.
