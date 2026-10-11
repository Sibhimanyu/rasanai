# Brand-faithful launch films: research the brand's own film, then stay inside it

Applies to every launch, promo and brand film for a named brand (route `product-launch-video`, or a `general-video` that is a launch, promo or brand film; not lyric, presenter or reel routes). The enforceable numbers (structure templates, timings, the grammar checklist, the red flags) are in `references/launch-film.md`; this file is the pipeline that uses them. The rule it exists for, from the user: *the next time I ask for a launch video of some brand, research their style and generate according to it; the story stays simple and to the point.*

## 1. Brand film research (required whenever a brand applies)

Runs during the Brief, in parallel with the research desk (crew phase `brand-film`), into `$RUN/brand-film/`. The Director runs `scripts/brandfilm.mjs`:

```bash
node $SKILL_DIR/scripts/brandfilm.mjs find   --brand "<brand>" --product "<product>" --out "$RUN/brand-film/find"
node $SKILL_DIR/scripts/brandfilm.mjs fetch  --url <official film url> --out "$RUN/brand-film/1"     # or --file <the user's attached video>
node $SKILL_DIR/scripts/brandfilm.mjs frames --in "$RUN/brand-film/1/<video>" --out "$RUN/brand-film/1"
node $SKILL_DIR/scripts/brandfilm.mjs measure --in "$RUN/brand-film/1/<video>" --out "$RUN/brand-film/grammar.json"
node $SKILL_DIR/scripts/brandfilm.mjs card   --dir "$RUN/brand-film" --brand "<brand>"                  # FILM-STYLE.json + FILM-STYLE.md
```

- **Sources.** Take the top 1 to 3 hits of `find` that are official (the brand's own channel, recent), at most **2 films** fetched. A video the user attached is the **primary** reference (Studio passes attached files as sources): use it first and skip `find` for it. Keep every download out of the repo.
- **Fast.** On Fast pace the whole step is about 3 minutes: no extra films, no second pass.
- **No film found.** Fall back to the brand's website and product screenshots as the frames (a folder of PNGs into `frames`/`measure` works), and tell the user so in the brand step ("no official film found; this is read from the website").
- **The analyst.** The Sonnet **brand film analyst** (`agents/brand-film-analyst.md`) reads the contact sheets and fills `FILM-STYLE.md` and the slots of `FILM-STYLE.json` against the grammar checklist: canvas, palette and shares, typefaces and the type scale, layout and grid, signature motif, motion vocabulary (and the moves never used), photography or illustration, cut rate, transitions, end card. `crew.mjs check --role brand-film-analyst` accepts it.
- **Show the user.** Set `decisions.film_style` to `brand-film/FILM-STYLE.json` and push it with the `brand` step: what the film looks like in plain words ("White canvas, black type in one sans, a single dot that morphs, flat moves, real photography, ends on the mark"), the measured numbers and the contact sheet.

## 2. The look is the brand's grammar, not an outside reference

- **Sure** = the card exactly.
- **Bold / Wild** = the same palette, typefaces, motif and motion vocabulary, varying only composition, pacing and emphasis (scale, density, how much the motif carries, calm-versus-burst rhythm).
- The design desk does **not** blend outside designers, directors, museum or editorial grammar or library references for a branded film (Paula Scher, Spielberg, Wes Anderson, museum label grammar...). Those are for unbranded films only. `blend.json` carries `references: []`, `film_style` (the path to `FILM-STYLE.md`) and `film_style_takes` (3 or more things taken from the card).
- `design.mjs check-system`, `check-systems` and `look-payload` enforce it: a branded launch look without a FILM-STYLE citation, with a canvas / ink / accent that is not a colour of the card (CIE76 dE over 15, accent over 28), a display face that is not in the card's typefaces, an outside library reference, or 3D / blur / grain / dolly when the card is flat, is refused and never recommended.
- The recommender picks the clearest, most on-brand look, never the one furthest from the brand.

## 3. A simple story

Follow the structure template in `launch-film.md` section 1 for the film's length: hook with the product or brand in 1 to 3 s, the reveal, 2 to 4 real feature demos, one payoff line, the end card with one CTA. One idea per beat, plain words (6 on-screen words at most). The three scripts differ only in emphasis and order (which feature leads, where the hero sits, how fast), never in concept. `story.mjs check` G7 enforces the structure (hook, hero/reveal, 2 to 4 demos, payoff, end card), the beat timings for the film length, and the product or brand in every beat.

## 4. Motion obeys the brand

The card's motion vocabulary is binding: the Motion Director reads `FILM-STYLE.md` first and the animators use only those moves. A flat brand (no blur, no grain, no glow) gets none of them, no matter what the score or an instinct wants. A flat brand restricts the STYLE of 3D, never its use: the card carries a `3D style:` line, and 3D scenes under it use matte or unlit materials (basic, toon, flat, matte, unlit, lambert) in the brand's palette, clean even light, no bloom, glow, grain, chromatic aberration or lens flare, depth of field only when the card allows blur, motion blur on fast moves only when the card allows blur (`references/3d.md` "Brand-flat 3D"). `crew.mjs check --role motion-director` refuses a score without `film_style` and 3D scenes under a flat card that break that style (`flat-3d-style`).

## 5. The style-match gate

After the **key frames** (before the frames critic and before any animation) and after the **first draft render**:

```bash
node $SKILL_DIR/scripts/brandfilm.mjs compare --ref "$RUN/brand-film/grammar.json" --ours "$RUN/frames"        # key frames
node $SKILL_DIR/scripts/brandfilm.mjs compare --ref "$RUN/brand-film/grammar.json" --ours <draft.mp4>          # first draft
```

Exit 1 is a fail: fix the frames (or the failing scenes) before animation or polish continues, then re-run. Record the numbers in `decisions.style_match` and push a short note the user sees ("Matches OpenAI's film style: 76% white canvas vs 77%, palette dE 4.1"). The frames and film critics repeat it and report `style_match` in their JSON; neither may ship on a fail.

## 6. Worked example: OpenAI and the ChatGPT for Mac launch film

Text only; the frames of OpenAI's film are the user's and are not in the repo.

**What went wrong.** The 30 s film "The Museum of the Detour" left OpenAI's design in every way the grammar card measures:

| | The brand film ("Refreshed.", 110 s) | Our film |
|---|---|---|
| Canvas | near-white, about 77% of pixels over luma 240; black about 4% | about 30% near-white and 46% dark gallery green |
| Type | one family, OpenAI Sans, huge or tiny, nothing between | a Bodoni serif display |
| Imagery | the product's own prompt, real photography, thin construction lines | line-art props (plinths, a mug, a bell jar) |
| Concept | the dot, morphing; the product's own UI is the first image | an invented museum metaphor; the product at about 19 s |
| Motion | scale, morph, draw-on, cut on the beat: flat 2D finish, no blur, no grain; 3D only in the flat style (matte, even light) | a 3D dolly with motion blur, bloom and grain |
| End | the mark alone, big, on white | a small CTA in body text |

The causes: the brand research was text-only (it never looked at the brand's films), the design desk blended outside references (Paula Scher, Spielberg, Wes Anderson, museum grammar), the recommender chose the Bold look furthest from the brand, the story engine liked an inventive conceit, and nothing compared the built frames to the brand's real frames.

**What the grammar card says** (a card for "Refreshed." as the analyst would write it):

- Canvas: near-white (#FAFAFA-ish), black type and marks; one deliberate black frame with a white circle. 77% near-white, 4% black, colour under 5% and only as moments.
- Palette: black on white; sky blue, lavender, navy, royal blue as flat solid circles, then a multicolour dot field, then a soft gradient sphere; never a background wash.
- Type: one sans (OpenAI Sans; Substitute: a loadable neutral sans), Light to Bold, two size classes (huge statements or single letterforms; tiny margin labels).
- Layout: one element at a time, centred or on a strict grid, huge whitespace.
- Motif: the dot: dot, circle, outline circle, dot grid, colour dot field, dot; thin grey construction lines resolving into letterforms and the logo.
- Motion: scale, morph, draw-on, cut on the beat; calm stretches (one slow mover, never frozen) alternating with brisk runs; never blur, grain, glow or dark moody scenes; 3D, when the line is about space or many things at once (a dot sphere), only in the flat style: matte or unlit dots in the palette, even light.
- Imagery: real, bright, golden-hour photography (ocean, sky, cliffs), full bleed or framed on white; a fast collage of brand artefacts.
- Opening: the real prompt typing "What can I help with?" next to the dot. End: the mark alone, then the wordmark, on white.

**What the right film does.** A 30 s ChatGPT for Mac launch on that canvas: the real prompt box and the dot in the first 2 s, a short statement, a hero demo of the product, 2 or 3 real uses with 2 to 4 word labels, a payoff line, and the mark and one CTA, held 3 s. Sure is that card exactly; Bold and Wild keep every colour, face, motif and move and differ in scale, rhythm and what the dot does. Key frames and the first draft pass `brandfilm.mjs compare` (for example 76% near-white vs 77%, palette dE 4.1) before anything is polished.
