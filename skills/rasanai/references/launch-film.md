# Launch film rulebook: structure, hard rules, brand grammar, red flags

Applies to every launch, promo, feature-reveal and brand film (same scope as `product-first.md`). This file is the enforceable detail: timings, numbers, measurement, critic checklist. A number marked (house) is this engine's rule derived from the sources and is no quote from them.

## Contents

- Source quality and precedence
- 1. Structure templates (10, 15, 30, 60, 90 s; ladder; pas; length limits) and Tempo
- 2. Hard rules (numbers are limits)
- 3. Brand film grammar (extract before designing)
- 4. Worked example: OpenAI "Refreshed."
- 5. Red flags
- 6. Visual grammar benchmarks
- 7. Sources
- 8. The hook, brand timing and text QA

## Source quality and precedence

- Treat Apple, OpenAI/Studio Dumbar and the Apple HIG as primary sources. Linear, Raycast, Figma, Notion, Arc, Stripe, Vercel and Framer launch films were reachable only through secondary write-ups, so their entries are patterns and no specs.
- Read agency numbers (length, hook window) as opinion that disagrees across agencies, and use the ranges below, which are the overlap.
- Read `launch-grammar.md` first for the default look and shape of a launch film (the three reference films, the arc with 30/45/60 s timings, copy, scene variety, texture, carriers, brand-light, UI-mockup, transition and rhythm rules; the reference moves and AI-cliche table are in `launch-moves.md`), because this file adds the measured detail. Where the two disagree on a launch film's logo count, ground or world, `launch-grammar.md` wins.

## 1. Structure templates

- Apply these legacy launch shapes to product-demonstrating kinds only. The villain, the turn, the 3 s deadline and the peak window are tools for that grammar and no requirement for every film: judge a manifesto, identity reveal, teaser, event opener, character short, music or footage film by its own grammar (`story.mjs grammar --kind <kind>`).
- Put the product (real UI or the real mark) on screen by 3 s, and make the hook the villain or the product in the real product's world, readable muted by 2 s, because a problem montage of stock pain delays the product.
- Build every template as an argument (`references/intent.md`): a turn where the product visibly reverses the villain, a peak at 60 to 75% (the hardest proof, the biggest picture) with a rest right before it, and a payoff that answers the opening. Each is an optional tool in the format-aware workflow, and the beat sheets below are legacy starting shapes and no checks for every film.
- Size beats by share of runtime so they scale, and set durations inside the ranges from each beat's read and importance.
- Fill the tables as rungs of a ladder or as a pas for a product or brand launch (the viewer-first shape: `story.mjs pick --format launch` offers both; `references/story.md`, Story shapes): one refrain verb, a title card per rung, a different real use each, escalating to done-for-you, as in "Ladder templates" below. Use the tables as they are for a single-task spot (the truth sheet's `Claim scope` is single-task): one hero demo and its uses. A breadth feature is a ladder even when it is the only feature (G13).
- Count an idea as one beat's `buys`, one new thing the viewer believes; each row below that is not the hook, the end card or a transition is one (see Tempo).

### 10 s (one idea), 3 ideas minimum
| t (s) | Beat | On screen |
|---|---|---|
| 0.0-2.0 | Hook + product | The villain or the real UI already mid-action, readable muted. Brand mark small at the margin. |
| 2.0-4.0 | Turn | The product visibly reverses the villain; one line, 3-6 words. |
| 4.0-5.8 | Proof, then a rest | One real use, held still enough to read; the breath before the peak. |
| 5.8-8.2 | Peak | The hardest proof, the biggest picture, the longest beat (2.2 s or more, starting at 58-75% of the film). |
| 8.2-10 | Payoff + end | The payoff line is the end line, answering the hook, with the mark and one CTA. Held at least 1.8 s. |

Four to five beats (`story.mjs sheet --length 10` prints it; a `refrain-break` ladder is open 0-2 · rung 2-3.8 · rung 3.8-5.8 · break, the peak, 5.8-8.2 · close 8.2-10).

### 15 s (social teaser, one feature), 3 ideas minimum
| t (s) | Beat | On screen |
|---|---|---|
| 0.0-2.0 | Hook + product | Real UI already mid-action (prompt typing, shortcut pressed). Brand mark small at the margin. |
| 2.0-4.0 | Statement | One line, 3-6 words, on the brand canvas, held only its reading time. UI may sit behind or beside it. |
| 4.0-7.5 | Hero demo | The one feature, real UI, changing every ~2 s inside (new state, new line, a camera move that reveals). 3.5 s at most. |
| 7.5-11.5 | 2 uses | About 2 s each, a different real use each, a 2-4 word label; the second is the peak (the furthest use, at 60-75%), after a beat of stillness. |
| 11.5-13 | Payoff line | Plain outcome sentence, 3-6 words, answering the hook. |
| 13-15 | End card | Mark + product name + one CTA. The beat runs at least 2 s; its elements land in sequence, then it holds at most 1.4 s still. |

### 30 s (launch spot), 5 to 7 ideas
| t (s) | Beat | On screen |
|---|---|---|
| 0-2 | Hook + product reveal | Product UI or mark full frame. First text appears by 1.5 s. |
| 2-4 | Statement / promise | One line, 3-6 words. Cut or morph into UI. |
| 4-8 | Hero demo (the turn) | The headline feature, real UI, reversing the hook's problem in one visible move; changes inside about every 2 s. |
| 8-18 | 3 uses | 2.5-3.5 s each, each a different real use with a 2-4 word label, escalating (simple to done-for-you); the last one calm (the rest). |
| 18-22.5 | The peak | The furthest use, at 60-75%: the biggest picture and the longest hold of the film, the move a viewer rewinds. |
| 22.5-26 | Payoff line | The largest line of the film; it answers the hook. |
| 26-30 | End card | Mark, name, CTA (availability: "Available today on Mac"), nothing else. |

### 60 s (launch film), 8 to 10 ideas
| t (s) | Beat | On screen |
|---|---|---|
| 0-3 | Hook + product | Real UI in action, or the brand's opening gesture (the prompt, the mark). |
| 3-9 | Promise | 2 statement lines, one idea each, product always visible or one cut away. |
| 9-15 | Hero demo | 5 s at most per hold, real UI, the feature end to end, changing every ~2 s. |
| 15-36 | 4 or 5 feature demos | 4-5 s each (each changing inside every ~2 s), escalating; one idea per demo, label (2-4 words) + UI; the last one calm (the rest). |
| 36-42 | The peak | The furthest demo or the break, at 60-75%: the biggest picture, the longest hold. |
| 42-48 | One last demo | Calmer, after the peak. |
| 48-54 | Payoff | Outcome line answering the hook + brand motif resolves (dot, mark, logo). |
| 54-60 | End card | Mark, name, one CTA, URL or platform. |

### 90 s (brand or keynote-style film), 10 ideas minimum
| t (s) | Beat | On screen |
|---|---|---|
| 0-4 | Hook + brand/product | As 60 s. |
| 4-16 | Promise + principle | 2-3 statements. Brand motif introduced and transformed. |
| 16-24 | Hero demo | Real UI, 6 s at most per hold, scene changes every ~2 to 4 s, each beat its own scene type. |
| 24-54 | 5 or 6 feature demos | 5-6 s each, escalating, a stat or detail beat inside at most 1; a rest before the peak. |
| 54-62 | The peak | At 60-75%: the densest build (fast cuts on the beat) landing on one hit, then silence. |
| 62-76 | 2 demos | Calmer, 7 s each. |
| 76-84 | Payoff | The outcome line answering the hook, or a collage of more uses resolving on it. |
| 84-90 | End card | As 60 s; the beat runs at least 3 s, with at most 1.4 s of it still. |

### Ladder templates (the default for a product or brand launch)

- Use one refrain verb as the spine: `open` is the refrain arriving with the product on screen; each `rung` is a title card (the verb plus one highlighted word, 6 words or fewer) over a real UI demo of a distinct everyday use, levels rising from simple to done-for-you.
- Make the break rung at 60 to 75% change the pattern itself (the product finishes the refrain line, the title card never comes, the plain answer arrives), because it is the turn and the peak.
- Add `ways_in` (type, say, snap, film) as an option, and end with `close`: "<verb> anything" or the product's own line answering the open, then the logo and one CTA.
- Keep each rung to 35% of the film at most, and let the joins between rungs carry the moves (a title word becomes the input, the input becomes the next demo, the last input becomes the logo).

| Length | Rungs | open | each rung | the break starts | ways_in | close and end card |
|---|---|---|---|---|---|---|
| 15 s | 3 | 0-2.5 s | about 3 s | 9-11 s | none | 11.5-15 s |
| 30 s | 3 to 4 | 0-3 s | 5-6 s | 18-22.5 s | optional 2 s | 24-30 s |
| 45 s | 4 | 0-4 s | 6-8 s | 27-33 s | optional 3 s | 38-45 s |
| 60 s | 4 to 6 | 0-5 s | 7-9 s | 36-45 s | 3-4 s | 52-60 s |
| 90 s | 6 to 8 | 0-6 s | 8-10 s | 54-68 s | 4-6 s | 80-90 s |

- Set rung counts by length: 35 s or less 3 to 4, 36 to 60 s 4 to 6, over 60 s 6 to 8. The tempo rules below still hold inside each rung (something changes about every 2 s).

### Pas templates (the viewer-first launch)

- Follow pain, meet, benefits, proof, cta (`references/script.md`, the pas), with the reveal (`meet`) as the turn: the product visibly reverses the pain, starting at 20 to 30% of the film. Reveal timing is a craft choice (an earlier product reveal is a warning note in `story.mjs check` and no longer a gate).
- Escalate the benefits to the peak at 60 to 75% (the furthest benefit, the biggest picture) with a rest before it, and give each benefit one UI behaviour.
- Show one on-screen line every 1.5 to 2.5 s (`film_seconds / lines` at most 3.0). G12 holds all of it.

| Length | hook | agitate | meet | benefits | proof | cta and end card |
|---|---|---|---|---|---|---|
| 15 s | 0-2.5 s | one reaction line, 1.5 s | 4.5-6.5 s (30%) | 2, about 2 s each | 10-12 s | 12-15 s |
| 30 s | 0-4 s | 4-7 s (a reaction, one viewer line) | 7-10 s (23 to 33%) | 3, 2 lines of about 2 s each | 20-24 s | 24-30 s |
| 45 s | 0-5 s | 5-10 s | 10-14 s (22 to 31%) | 3, 2 lines of about 2.2 s each | 30-35 s | 35-45 s |
| 60 s | 0-6 s | 6-13 s | 13-18 s (22 to 30%) | 3 to 4, 6 to 8 s each | 42-48 s | 48-60 s |
| 90 s | 0-8 s | 8-18 s | 18-26 s (20 to 29%) | 4, 8 to 10 s each | 62-70 s | 70-90 s |

- Split the runtime like this: hook and agitate 20 to 25% together (the pain), meet 8 to 10%, benefits 40 to 45%, proof 5 to 8% (a counter that climbs), and the CTA and end card the last 12 to 15%. Tempo still holds: something changes about every 2 s inside every beat.

### Length, cutdowns

- Allow 35 to 45 s for a launch: the 30 s and 45 s templates are both valid, and a story with a viewer's day, a rest before the peak and a mid-film brand line ("KINSO finds it") needs 35 to 45 s (Kinso runs 46 s). The rest is the one declared calm stretch of 1.0 s or less, right before the peak (`craft.md`, "Continuity" and "Room"); everything else overlaps, so no frame is empty.
- Keep inside agency limits: social and teaser films at 15-30 s, explainers at 45-90 s, the retention cliff near 45-50 s, kinetic-type pieces under about 90 s. OpenAI's own brand film runs 110 s as a hero piece, so over 90 s needs an explicit brief. Default to 30 s or 60 s when the brief gives no length.
- Plan 15 s and 30 s cuts at storyboard stage by making every feature beat self-contained (Moonb's "plan cutdowns at storyboard" lesson; Duolingo and Samsung cut from independent segments).

## Tempo

Name it tempo and keep "pace" for Studio's research-speed setting. Commercial shots have averaged under 2 s since the early 1990s (MacLachlan and Logan, "Camera Shot Length in TV Commercials and their Memorability and Persuasiveness", Journal of Advertising Research), so a launch film that spends 8 s on one idea reads as slow.

| Rule (house) | Number | Why |
|---|---|---|
| Count ideas as one beat's `buys` (a use, a proof, the promise, the payoff); the hook, the end card and pure transitions are not ideas | minimum per film: 15 s: 3, 30 s: 5, 60 s: 8, 90 s: 10; no more than the argument needs (5 to 7 in 30 s) | more beliefs is not more tempo; more change inside each beat is. Only a brief that asks for a calm or slow film goes under |
| Change something meaningful on screen (a cut, or inside a continuous take a new UI state, a new line, a morph, a camera move that reveals something new) | every 1.5 to 2.5 s on average | a continuous-take brand still changes every 2 s; tempo is not only cuts |
| Limit the longest hold of one idea | hero moment or peak: 4 s in a 30 s film (3.5 s at 15 s, 5 s at 60 s, 6 s at 90 s); 3 s for anything else; changes inside about every 2 s | the peak and the payoff hold longest |
| Keep a hold in motion | no stretch of 0.8 s without motion (the motion gate); a statement line holds its reading time only (0.3 s per word + 0.6 s) | a still hold reads as a stall |
| Run the end card beat | 2 s or more, holding at most 1.4 s still after its last move (the motion gate measures it) | the mark lands, then the film ends |
| Place one rest | at most one deliberate calm stretch per 30 s (one slow mover, never a freeze), right before the peak | the beats before the turn run shorter, the peak and the payoff longer |

- Take the film's target from the brand's measured tempo when a brand film card exists (`brandfilm.mjs measure` writes `tempo`: changes, seconds between changes, longest hold; the analyst adds ideas shown and seconds per idea), otherwise from the house tempo, and keep ideas at or above the house minimum.
- Carry it in the pitch as `tempo: { ideas, change_every_s, longest_hold_s, source: "brand film" | "house" }`. `story.mjs check` gate G9 enforces it (use `--brand-film <grammar.json>` for the brand's numbers), and `brandfilm.mjs compare` holds the draft to 0.7x to 1.4x of the brand's change rate and never slower than a change every 2.5 s, measured against the film the script follows (`compare --film <name>`; `measure --film <name> --structure <type>` keeps several films in one grammar.json, so a one-take spot is not held to a 110 s montage's cut rate).

## 2. Hard rules (numbers are limits)

1. **Product or brand on screen within 3 s** (1 s is better).
   - Open on the real product, because the first frame is no black frame, no title card and no metaphor. Raycast's 39 s teaser uses only fragments of the real interface; Linear's walkthroughs put the full-screen real UI first.
2. **One idea per shot.**
   - Give each shot one feature, one sentence, one motion, and split a shot that needs "and", because that keeps one focus. Use at most 1 text block and 1 UI focus per frame.
3. **Plain words.**
   - Say it the way a person would say it aloud, with at most 6 words per on-screen line (statements 3-6; labels 1-4) and at most 2 lines per card. Replace riddles, puns that need decoding, cryptic labels and jargon not in the product's own UI with plain words. Apple's recent films use whole sentences as single beats, no voiceover, one short sentence per beat.
4. **Reading time.**
   - Hold a line on screen at least 0.6 s + 0.3 s per word (`lib/reading.mjs` readTime; a 5-word line is 2.1 s minimum; the render check allows 15% slack) and longer on phone-size output, because a spec that flashes past has failed (GoPro example in Moonb).
5. **Type scale (house, in frame heights).**
   - Use two sizes only for the voice. *Statement* is 10-18% of frame height (cap height ~8-14%) as the ceiling, taking the brand film card's own size only in strict brand mode, and reduced until the whole line fits on one row inside the 6% safe area (a letterform or line cropped by the frame is wrong). *Label* is 1.8-2.8% of frame height (about 20-30 px at 1080p), at margins (top or bottom centre, corners). Nothing sits in between except the UI itself.
   - Set the CTA and end line at Statement size, because a CTA smaller than body copy fails.
   - Fit every word: at rest every line sits fully inside the 6% safe area, on one line (two at most); it may leave the frame only in a push-through of 1.2 s or less (`motion-gate.mjs` `text-fit`).
6. **Real UI.**
   - Capture the UI or rebuild it as DOM with real layout, labels, type and colours, and choreograph it (the cursor, the keystroke, the window arriving, the answer streaming), because icons, drawn props or abstract shapes standing in for the UI are not the product (see `product-first.md`).
7. **The brand lock, then the concept's world.**
   - Lock the logo, the brand accent as the signal colour, the brand face on the claim and end line, and the real UI (`brand-film.md` section 4 is the home of the lock; section 3 below measures them).
   - Take canvas, palette, type system, texture, motion grammar and finish from the chosen concept's `style_world`, and copy no outside designers or other brands. Only in strict brand mode (`decisions.strict_brand_film`) are the brand's own palette, type and motif the whole look and outside references off.
8. **Product truth, any form.**
   - Allow metaphors, worlds, characters, games, pixel or clay worlds and type-only films, as long as the real product and its claim are unmistakable by the end (`references/product-first.md`).
   - Test clarity on a silent first view and sharpen the idea until the picture explains itself, because an idea that needs a sentence of explanation fails.
9. **Restraint is a budget.** The brand locks logo, accent, claim face and UI fidelity (palette and type too in strict mode) and never locks finish, depth, camera, shot size or colour content (`references/brand-film.md` section 4).
   - Finish: switch the finish layer on (a tinted living ground, soft multi-layer shadows, glass rims, a key light, grain of 1-2% on a brand-flat film and 2-4% otherwise, a 10-30% vignette, motion blur on fast moves) unless the chosen world's finish is none (strict mode: the brand film's measured finish is zero, `Finish:` line, Route: graphic). Then win on giant type and photography (`references/craft.md` "Finish and budgets").
   - Mood grounds: let the ground change on the story's emotional turns (the pain darker, the payoff warm) within the world's palette (strict mode: the brand's palette or its films' colour fields, `FILM-STYLE.md` `Mood grounds:`).
   - Depth: use blur as depth (defocused background type or objects, a giant word blurred behind the UI, rack focus) and motion blur on fast moves whenever they help; the card's `Depth blur:` line records what the films show.
   - Vocabulary brands use: scale, morph (one shape into another), draw-on (outline into solid), cut on the beat, slide/fade of type, UI choreography (cursor, keystroke, panel in), simple parallax of flat layers.
   - Motion types: use at most 3 distinct motion types per film (house); a carrier's chain of transformations (one shape becoming a letter, a dot, a UI element, the next screen) counts as one motion type (morph), and the chain's density is the point.
   - Ease: use one curve family per film, with moves of 0.3-0.8 s for UI and 0.5-1.2 s for type (Apple HIG: motion is purposeful, brief, precise, optional).
   - Hero effects on a budget: spend glow and bloom, overshoot landings, blur-in, particle bursts, scale-pop, chromatic split, a halftone burst and a light comet at most 2 times each per film under 30 s (3 from 30 s), on the hero only, with a reason in the score's `budget`. Uniform use on every element or every line is the error (`slop.mjs`, the motion contract).
   - Glitch, shake and lens flare: keep them out unless the concept is literally about them.
   - 3D: stage objects, space and camera moves in the brand's palette and tone (matte or unlit materials in the palette's hexes). A dot sphere or tilted panels for a line about "everything you ask" is a technique, and a chrome object in colours the brand never uses is not (`references/3d.md` "Brand-flat 3D").
   - Typography effects: put no outlines, shadows or per-word gimmicks on every line, because Apple finds such effects weaken authority.
10. **Cut rate follows the reference film**, with the house tempo as the floor (Tempo, above).
    - Alternate one calm stretch (one slow mover, up to the longest-hold limit, never a freeze) with bursts of cuts at 0.4-1.0 s each on the beat, because constant fast cutting and a single speed both flatten the film.
11. **End card.**
    - Make the brand mark (and wordmark) the biggest object, with one line or none, and one CTA only ("Available today", the URL, or the store badge), on a clean brand canvas.
    - Run the end card beat at least 2 s (15 s film) or 3 s (30-90 s): the mark lands, the name and the CTA follow, and after the last lands it holds at most 1.4 s still (`motion-gate.mjs` fails a longer still tail; a brief that asks for a longer hold sets `end_hold_s` in the plan).
    - Leave out competing UI, a credits crawl and a second tagline. The last frame is the mark alone or mark plus name, then optional black.
    - Place the mark as the downloaded file (`research/brand/assets/`, staged at `assets/brand/`) unchanged, with its clear space and the colour version for the canvas, because a drawn, traced, approximated or generated mark is wrong (a flower made of circles is not the OpenAI blossom). If `logos.json` says `none`, set the end card as the brand name in the brand font only, with no symbol, and tell the user.
12. **Sound and music.**
    - Land cuts, morphs and big visual hits within 150 ms of a music event (an onset, a hit, a break edge), off a metronome grid, because music carries the film. Build the music event map first (`music-map.mjs make`, before imagery and picture planning); `final-gate` checks it on the final render.
    - Use sound design as feedback: soft ticks for keystrokes and UI, a low hit for the payoff, silence or a drop before the end card (OpenAI: sound design "subtle and intuitive audio feedback synchronized with animations").
    - Add voice-over only if the brand uses it; otherwise the on-screen words are the narration.
    - Mix to -14 LUFS integrated for web and social with a true peak of -1 dBTP at most (house). Keep the bed constant with no sidechain duck by default: carve with an EQ at 150-300 Hz to separate the voice, and duck 3-6 dB only when measured masking needs it.
    - Design for sound off: every beat reads with captions or labels alone (nearly 70% watch on phones; web autoplay is muted), and an on-screen text track stays even with VO.
    - Give the music an arc and no loop: a soft intro under the hook, the drop on the reveal, a break before the payoff, a riser into it, a button ending on the logo (`references/sound.md`, "The music arc"). Put SFX on the transitions that move, the landings, the taps and the counters, because a film with no SFX is flat.
13. **Aspect ratios.**
    - Design 16:9 first, then re-lay (not crop) for 9:16 and 1:1.
    - 9:16 (1080x1920): keep 8% side, 12% top and 20% bottom clear of text (platform UI). Move labels from margins to inside the safe area; statements may wrap to 3 short lines but keep the 6-word cap; recompose the UI (single column, crop the window to the active panel) and avoid shrinking it.
    - 1:1 (1080x1080): 6% margins; the same type scale as % of frame height; the UI window may fill the frame.
    - Test on a phone at arm's length, because layered type that works on desktop tangles on a phone (Moonb).
    - Derive the 9:16 and 1:1 versions as 15 s or 30 s cuts from the master beats.
14. **Lock words first.**
    - Fix copy, line breaks and terminology and check them against the product's own UI strings before animation; make a beat sheet and a plain-text animatic before building (Moonb kinetic type workflow).

## 3. Brand film grammar (extract before designing)

- Run this on every named brand from its own films (brand film, launch films, keynote videos) plus its site and product screenshots, and save a grammar card (section 4) with the research, because designing from text descriptions alone was the root cause of the ChatGPT miss.
- Treat the card as a reference that describes the brand; the design desk may leave it for the concept's world, and only strict brand mode keeps the desk inside it.
- Sample frames first (1 fps for a brand film, 2-4 fps for a fast launch film):

```bash
mkdir -p frames
ffmpeg -i ref.mp4 -vf "fps=1,scale=480:-1" frames/f_%04d.png     # contact sheet frames
ffmpeg -i ref.mp4 -vf "fps=1,scale=480:-1,tile=8x8" -frames:v 1 sheet.png
```

| Item | What to extract | How to measure |
|---|---|---|
| Canvas colour and share | Dominant background (hex) and the % of frames/pixels it covers | Per frame mean luminance: `ffmpeg -i ref.mp4 -vf "fps=1,scale=160:-1,signalstats,metadata=print:key=lavfi.signalstats.YAVG" -f null - 2>&1 \| grep YAVG`. Count frames with YAVG over 240 (light) or under 20 (dark). Pixel share: `python3 -c` with PIL over sampled frames: share of pixels with luma over 240 / under 20. Canvas hex = the most common quantised colour among those. |
| Palette shares | Accent hues, their % of pixels, how they arrive (flat shapes vs washes) | Per sampled frame, drop near-white/near-black/grey (saturation under 0.15), quantise the rest (k-means k=6 in PIL/numpy) and sum pixel share per cluster over all frames. Report each accent as "% of total pixels" and "% of frames where it exceeds 2%". Under 5% total colour = colour is a moment. |
| Typefaces and use | Family, weights, where used, size classes | Read the brand guidelines/site CSS first (`font-family`). From frames: measure cap-height of text boxes as % of frame height; histogram should be two-modal (statement vs label). Check serif/sans, mono, weights seen. |
| Layout and grid | Centred or grid, margins, whitespace share | Whitespace share = % of pixels equal to canvas colour (within 8/255). Margin = min distance of text bbox to frame edge (% of width). Count objects per frame (1 vs many). |
| Signature motif | The recurring shape/gesture (dot, line, blossom, cursor) and its transformations | Watch the contact sheet in order and list the motif's states; count how many beats use it (aim for most). |
| Mood grounds and depth blur | Does the ground change on the story's turns (colour fields, a dark frame, photography), and does blur appear as depth (defocused type or objects) | From frames: the distinct grounds and where they occur; whether any frame has a defocused layer. Write `Mood grounds: yes/no (which)` and `Depth blur: seen/not seen (where)` on the card (a record, not a switch) |
| Finish (measured) | Grain, ground tint and falloff, vignette, soft shadow, soft content: whether the finish layer stays on | `brandfilm.mjs measure` writes `finish` (`layerOff`, `route`); the card prints a `Finish:` line. Only a measured zero on a flat ground turns the finish layer off (Route: graphic) |
| Motion vocabulary | Moves present: scale, morph, draw-on, cut, parallax, 3D, blur | Step through at 12-24 fps for 10 s samples; write `Seen: ...` (moves and effects present) and `Not seen (allowed on a budget): ...` (absent effects are budgets, never bans); note whether 3D appears, so its palette style can be matched. Grain and blur come from the measured `finish`, not from the eye. |
| Photography / illustration | Real photo vs illustration vs none; grade; subjects; crop | Classify frames: UI, type-only, photo, illustration, collage. Share per class. Note time of day, saturation, full bleed vs framed card. |
| Cut rate and rhythm | Average shot length, calm vs burst pattern | `ffmpeg -i ref.mp4 -vf "select='gt(scene,0.25)',showinfo" -f null - 2>&1 \| grep pts_time` gives cuts (tune 0.15-0.4: lower catches morphs/dissolves; flat-brand films with white backgrounds need 0.1-0.2). ASL = duration / cuts. Plot shot length over time to find holds vs bursts. |
| Transitions | Hard cut, morph, wipe, dissolve, match cut | Frames either side of each detected cut: identical shape continuing = morph/match cut; unrelated = hard cut. Dissolves show 2+ frames of intermediate scene scores. |
| UI treatment | Full-screen, in window chrome, cropped fragments, device frames | From frames: UI share of runtime and first appearance time. |
| End card | What is on it, scale, hold | Last 5 s of frames: element count, mark height % of frame, hold length in s. |
| Audio | Tempo, instrumentation, UI sounds, VO or none | `ffmpeg -i ref.mp4 -af ebur128=peak=true -f null -` for loudness; detect BPM with a beat tracker (librosa) if available; note silences. |

- Verify after build by running the same measurements on our frames and comparing them to the grammar card. Tolerances (house): each accent within 5 points, ASL within 30%, type classes two-modal, no budgeted effect used uniformly, first product frame at or under 3 s, end-card mark height not smaller than reference by more than 25%. Canvas share within 15 points is a warning, never a fail, because a launch film may light its ground or turn dark on a beat.

## 4. Worked example: OpenAI "Refreshed." (110 s, measured, from `.context/ref/analysis.md`)

```
GRAMMAR CARD: OpenAI brand film "Refreshed." (110 s, 1080p)
Canvas        near-white (#FAFAFA-ish), 77% of pixels luma > 240, mean luma 223/255.
              Black ~4% of pixels (type, marks, one deliberate inverted black frame with a white circle).
Palette       black type and marks on near-white. Colour < 5% of frame: sky blue, lavender, navy, royal blue.
              Arrives as flat solid circles, then a multicolour dot field, then a soft gradient sphere.
              Never as a background wash.
Type          One family: OpenAI Sans (custom, with Dinamo Typefaces), weights Light to Bold.
              Two sizes: display (a single letterform or short line, always fully inside the safe area) and tiny labels at margins (top/bottom centre).
              Nothing between. No serif display face.
Layout        One element at a time, centred or on a strict grid, huge whitespace.
              Principle lists in small type (Simplicity / Space / Imperfection / Vivid).
Motif         The dot. dot > solid circle > outline circle > dot grid > coloured dot field > single dot.
              Thin grey construction lines and grids resolving into solid letterforms and the logo (GPT, OpenAI, blossom).
Motion        scale, morph, draw-on, cut on the beat. Calm holds alternate with brisk runs of cuts/morphs on music.
              Seen: slow rotation of a dot sphere, soft defocus in the collage. Not seen (allowed on a budget): glow, overshoot,
              blur-in, particles as decoration. 3D style: matte or unlit in the palette, even light.
Finish        measured zero (grain 0, ground chroma 0, no soft shadow): Route: graphic. The film wins on giant type, photography
              and colour fields, not on a lit ground.
Mood grounds  yes: its colour fields (coloured dot fields, soft gradient spheres, photography) change the ground on the story's turns, within the palette.
Depth blur    seen in the collage (frosted cards over a defocused wordmark); depth stays available either way.
Imagery       Real natural photography, bright to golden hour (ocean, sky, cliffs, sunsets, hand in water),
              full bleed or framed cards on white; tiny white words scattered over a photo as one sentence.
              Collage: fast montage of brand artefacts (posters, type specimens, product shots, papers) layered on white.
Opening       The product's own prompt typing "What can I help with?" next to the brand dot (product UI language first).
Cut rate      calm holds + bursts (measure with scene detection before copying a number).
End card      Blossom mark alone, then OpenAI wordmark alone on white, then black. Mark is big and confident.
Sound         Bespoke sound design: subtle, intuitive feedback synchronised with animation (Studio Dumbar).
Off-brand     serif display, gallery green or any non-brand colour, line-art props or drawn UI, an invented concept,
              a small CTA in body text. (Finish, depth and camera are not brand: a dolly or a defocus is a craft choice.)
```

- Compare the failed film to the card: 46% dark green vs a 77% near-white canvas; Bodoni vs one sans; line-art props vs real UI and photography; product at 19 s vs the first image; small body-text CTA vs mark alone, big. Its 3D dolly, blur and grain were not the failure; the palette, the face and the concept were.

## 5. Red flags (a critic fails the concept or frame on any one)

Concept
- The idea needs explaining on a silent first view; a metaphor, character, museum, parable or world.
- No turn that reverses anything (a list with a label on its third item); a payoff that answers a different question than the hook asked; the biggest moment on a side detail instead of the peak.
- Product UI or mark not on screen by 3 s; the hero demo is shorter than the longest non-product shot.
- Fewer than 2 or more than 4 real feature demos in 30-90 s films; two ideas in one shot.
- On-screen line over 6 words, a riddle, a pun not resolved in 1 s, jargon the product does not use.
- Strict brand mode only: references (directors, other brands, "editorial", "museum label") in the look for a named brand.
- Voice-over where the brand uses none; a lyric-style or story film where a feature film was asked.

Frame
- One layout for every scene; a layout in more than 2 beats in a row; the product UI only ever a small card; a step counter, page number or persistent pill; fewer than 3 whole-frame changes per 10 s (section 6).
- Strict brand mode only: background colour the brand never uses (measure: canvas hex off every colour of the brand palette by more than a small distance; a different canvas SHARE is a warning, not a flag).
- A claim or end line not in the brand face; a second display family on the claim; faux-bold or outline text. (Strict mode: a serif display face when the brand is sans, and the reverse.)
- A budgeted effect (glow, bloom, blur-in, particles, chromatic split...) used uniformly: on every element, every line or every scene, or past its 2 to 3 per film; or used off the hero, or without a `budget` reason. A white void: a 0-chroma flat ground with no finish layer when the brand film measured one, or, on a graphic-route brand, no giant type, photography or colour content to carry it. (Finish, soft shadows, glass rims, depth and 3D in the palette are not off-brand.)
- Strict brand mode only: colour as a wash or background when the brand uses colour as small flat shapes.
- Type between the two scale classes: mid-size text everywhere; labels under 1.8% of frame height; a CTA, end line or payoff smaller than body copy.
- Drawn props, icons or stock illustration used as a stand-in for the UI; a UI recreation with invented labels or the wrong font.
- More than one focal element; busy density the story does not call for (strict mode: where the brand uses whitespace).
- Text outside safe margins; 9:16 made by cropping 16:9.

Motion and sound
- Constant fast cutting or a single speed for the whole film; cuts off the beat.
- Shake, glitch or lens flare with no on-screen cause; an overshoot or bounce on every landing (one budgeted hero landing is fine).
- More than 3 motion types; different ease families per scene; per-word animation on every line.
- Looped music bed, no sound design on UI actions, loudness outside -16 to -12 LUFS.

End card
- CTA smaller than body copy; two or more CTAs; competing tagline plus mark plus URL plus badge at equal weight.
- Mark smaller than the line; held under 2 s; not on the brand canvas; no mark at all.

## 6. Visual grammar benchmarks (measured on seven reference reels; gated)

The 26Keys failure was one fixed layout, a small card top-left, a "01 / 04" counter, 2 hard cuts in 45 s and a 4.7 s still end; the references do the opposite. These are limits, and the gates read them: `frame-gate.mjs --kind launch` (shot-length distribution), `motion-gate.mjs` and `scenes.mjs` (layout, scale, UI hero, deck chrome; scripts/lib/launch-grammar.mjs).

| | references | ours (failed) | limit |
|---|---|---|---|
| Shot-length distribution (a shot runs between two changes of the frame: a cut, a morph, a word swap, a colour flip, a push-in) | the three favourites: median 1.9 s, p10 0.67 s, p90 4.5 s; 4.2 to 5.2 shots per 10 s; hard cuts are rare (1 per 8-15 s outside one burst) and fine; the long shots are UI proof or the end card | 0.44 changes per 10 s | median about 1.5-2.5 s (error above 3.5 s), p10 at least 0.5 s, p90 at most about 5 s, no static hold over 5 s outside the last 6 s, at most one burst of 5-6 shots under 0.6 s |
| Layout | a new composition nearly every beat | one, identical in every scene | no layout in more than 2 beats in a row; at least 3 distinct layouts |
| Product UI | one ingredient, big, tilted, cropped, in perspective; UI proof is 30-45% of the runtime (measured 31-43%) when the concept has a UI-proof beat | a 1240 px card | fills 50% of the frame or more in its hero beat (when the film has a UI-proof beat); never small cards only |
| Chrome | none | step counter "01 / 04" | no step counters, page numbers or persistent label pills |
| End | logo resolves in 2 to 3 s | 4.7 s or more still | still tail 1.4 s at most |

- Write per scene the score fields the gates read: `layout` (a name), `scale` (`type` | `ui` | `world` | `person`), `ui_fill` (0 to 1), `frame_change` (`cut` | `morph` | `camera`); at the score: `has_users`, `actor`. Keep "identical in every scene" and "the fixed layout" out of the contract.

1. **Full-frame type as image.** Use giant words that bleed off the frame ("Sometime", "then...", CALMING / NOTION, dot-matrix "Daily tasks"), one thought per shot, with a sentence split across shots. Scale `type`.
2. **Mixed media in the same film.** Mix a real person or photo (4679, 67152, 34143), a generated image world (8191), a 3D object (44721, 4934) and the UI. Show the UI as one ingredient, big, tilted, cropped, in perspective (67152) and never as a small flat card. Every film mixes full-frame type, close or cropped UI in perspective, a wide or world shot, and a person or photo when the product has users.
3. **Use the whole canvas and flip the colour world between beats.** Go dark to light and back (4679, 4934, 67152), and change ground, scale and layout together, because a beat that looks like the beat before it is a repeat.
4. **Match transitions through a shared object.** Let one thing cross the cut and become the next scene: a dot to a dot field to a photo (34143), the cube (44721), the pixel horse (8191). Name the shared object in the seam (`carrier`); a plain fade is a last resort.
5. **The human problem first, in plain voice** ("Nobody's watching it", "Event is over... where are my photographs?", "Lost in the everyday work"). The product is the answer. The logo resolves in 2 to 3 s and the film ends 1.4 s after the last move.
6. **Motion follows the actor.** When the actor is the product UI, use the brand's own easing; reserve `character` (back.out, elastic, squash) and `motion-md.mjs --mode auto` for object actors (a carrier letter, a mascot). Write motion.md before the build. `grammar.mjs pick` scores character grammars (glyph-chain, pixel-collage) down on a UI-led film.
7. **No deck chrome.** Leave out "01 / 04", page numbers and a pill that sits on every scene, because the story is the structure.

## 7. Sources

Primary and near-primary
- OpenAI brand film by Studio Dumbar (motion, sound, type, palette principles): https://studiodumbar.com/work/openai-brand-film
- D&AD entry for the same film: https://www.dandad.org/work/d-ad-awards-archive/openai-brand-film
- Apple Human Interface Guidelines, Motion (purposeful, brief, precise, optional; the page body did not load for fetch, principles recalled from the HIG): https://developer.apple.com/design/human-interface-guidelines/motion
- FFmpeg filters (select with scene, showinfo, signalstats, ebur128, tile): https://ffmpeg.org/ffmpeg-filters.html
- Figma Config sessions and keynotes (launch keynote structure): https://config.figma.com/san-francisco/session/829e6ced-3257-4f5c-b675-aa72f4d1f98f/
- This repo: `.context/ref/analysis.md` (OpenAI "Refreshed." measurements and the failed-film diagnosis); `skills/rasanai/references/product-first.md`

Practitioner and agency write-ups (secondary, opinion; numbers are indicative)
- 12 launch videos by format (Linear Initiatives, Raycast teaser, Figma Motion, Warp, Oura, Dyson, Meta Quest and others): https://www.moonb.io/blog/product-launch-video
- Kinetic typography for brand video (Apple restraint, per-word limits, phone testing, copy-first): https://www.moonb.io/blog/kinetic-typography
- Demo video production (opening 30 s, animation plus real UI, modular cutdowns): https://www.moonb.io/blog/perfect-demo-video
- Tech launch video formats (60-90 s, value in 5-10 s, captions, one CTA, vertical/square): https://www.atomikgrowth.com/blog/the-tech-launch-video-formats-that-actually-work
- SaaS launch video examples and hook timing (3 s hook, 15-30 s teasers, 45-90 s explainers): https://www.atomikgrowth.com/blog/best-saas-product-launch-videos-of-2026-with-actionable-tips-real-examples
- Raycast kinetic product motion case study (UI built in Figma, animated with Jitter, UI sound cues): https://contra.com/p/llNMeeMX-kinetic-product-motion-for-raycast-making-a-ui-feel-alive
- Apple 108-second event film as kinetic type, no VO (Rishi Shah): https://contra.com/p/OoccPFZm-i-watched-apples-108-second-event
- Motion brand-guideline workflow (DESIGN.md-style strict visual rules, forbidden styles): https://motion.so/learn/brand-guidelines-to-video

Gaps: no primary sources were retrievable for Notion, Arc/The Browser Company, Stripe, Vercel or Framer launch films; before designing for any of them, run section 3 on their own films.

## 8. The hook, brand timing and text QA (R6 favourites; gated)

- **Hook (0-3 s):** show no logo and no product claim; address the viewer ("Your next deal...", "You've been listening to music wrong") or show a problem; bring one physical object in within 2 s (a dock with badges, five photo cards, a now-playing pill); use one giant word or number. `motion-gate` reads `score.hook { viewer_addressed, problem_shown, object_enters_s }`: a brand reveal before 3 s, a hook that neither addresses nor shows a problem, and an object later than 2 s are errors.
- **Brand reveal at 20-30% of the runtime** (the favourites: 20%, 29%) **or at the very end** (88%); anywhere else is a warning (`brand-timing`). State the pain by 8-14 s, then turn in two steps: a small turn at 2-4 s, a real one at 13-16 s, a colour-world flip on a music hit.
- **Runtime split:** pain/hook 15-30%, reveal 5-8%, UI proof 30-45%, payoff/social proof 10-20%, end card 7-12% (3-6 s, still; a URL is optional).
- **UI object as character:** let one product UI element (a pill, an app-icon stack with rising notification counters, a card that morphs through 6 states) be the carrier and protagonist: carrier kind `ui-object`, move `ui-object-state-morph`.
- **Text QA:** `final-gate` spell-checks the words in the final `index.html` (doubled words, common typos, malformed contractions, "7-day" next to "seven-day") and blocks on errors.
- **Sound:** treat song-lyric as a first-class mode with no duck by default; see references/sound.md "The favourites".
