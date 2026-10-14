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

- **Sources.** Take the top 1 to 3 hits of `find` that are official (the brand's own channel, recent), at most **2 films** fetched. **An identity film is not a launch grammar.** A brand identity film ("Refreshed.") is evidence of the brand's palette, type and motif. For a LAUNCH film, one of the two films is the brand's own product launch or feature spot when one exists (OpenAI's "You can just launch Sites"), and the grammar also looks at the category's best launch films (`references/launch-film.md`, the reference moments). Never read "the identity film never blurs" as "the launch film can't". A video the user attached is the **primary** reference (Studio passes attached files as sources): use it first and skip `find` for it. Keep every download out of the repo.
- **Fast.** On Fast pace the whole step is about 3 minutes: no extra films, no second pass.
- **No film found.** Fall back to the brand's website and product screenshots as the frames (a folder of PNGs into `frames`/`measure` works), and tell the user so in the brand step ("no official film found; this is read from the website").
- **The analyst.** The Sonnet **brand film analyst** (`agents/brand-film-analyst.md`) reads the contact sheets and fills `FILM-STYLE.md` and the slots of `FILM-STYLE.json` against the grammar checklist: canvas, palette and shares, typefaces and the type scale, layout and grid, signature motif, motion vocabulary (what is seen, and what is not seen and so allowed on a budget), the measured finish, photography or illustration, cut rate, transitions, end card. `crew.mjs check --role brand-film-analyst` accepts it.
- **Show the user.** Set `decisions.film_style` to `brand-film/FILM-STYLE.json` and push it with the `brand` step: what the film looks like in plain words ("White canvas, black type in one sans, a single dot that morphs, flat moves, real photography, ends on the mark"), the measured numbers and the contact sheet.

## 2. The look is the brand's grammar, not an outside reference

- **Sure** = the card exactly.
- **Bold / Wild** = the same palette, typefaces, motif and motion vocabulary, varying only composition, pacing and emphasis (scale, density, how much the motif carries, calm-versus-burst rhythm).
- The design desk does **not** blend outside designers, directors, museum or editorial grammar or library references for a branded film (Paula Scher, Spielberg, Wes Anderson, museum label grammar...). Those are for unbranded films only. `blend.json` carries `references: []`, `film_style` (the path to `FILM-STYLE.md`) and `film_style_takes` (3 or more things taken from the card).
- `design.mjs check-system`, `check-systems` and `look-payload` enforce it: a branded launch look without a FILM-STYLE citation, with a canvas / ink / accent that is not a colour of the card (CIE76 dE over 15, accent over 28), a display face that is not in the card's typefaces, or an outside library reference, is refused and never recommended. Finish, depth, camera and 3D are not refused on any card: the brand locks palette, type, logo, UI and tone (section 4).
- The recommender picks the clearest, most on-brand look, never the one furthest from the brand.

## 3. A simple story

Follow the structure template in `launch-film.md` section 1 for the film's length: hook with the product or brand in 1 to 3 s, the reveal, 2 to 4 real feature demos, one payoff line, the end card with one CTA. One idea per beat, plain words (6 on-screen words at most). The three scripts differ only in emphasis and order (which feature leads, where the hero sits, how fast), never in concept. `story.mjs check` G7 enforces the structure (hook, hero/reveal, 2 to 4 demos, payoff, end card), the beat timings for the film length, and the product or brand in every beat.

## 4. Brand lock: palette, type, logo, UI and tone; never craft

The card is binding on **palette, typefaces, logo, UI fidelity and tone**: the Motion Director reads `FILM-STYLE.md` first, and the looks, boards and animators keep the brand's colours, faces, mark and real UI exactly. It is never binding on **finish, depth, camera, shot size or colour content**: those are craft, and the craft comes from the launch films (`references/craft.md` "Finish and budgets", `references/cinematography.md`).

- **What the card says about motion.** The analyst writes `Seen: …` (every move and effect the films use; the film's native vocabulary, used freely) and `Not seen (allowed on a budget): …` (effects these films do not show). A "not seen" effect is not banned: glow, bloom, overshoot, blur-in, particles, scale-pop, chromatic split, a halftone burst and a light comet are each allowed 2 to 3 times per film, on the hero, with a reason in the score's `budget` (`scripts/lib/budget.mjs`). Uniform use (the effect on every element or every line) stays an error (`slop.mjs`, the motion contract).
- **The finish layer is on** (tinted living ground, soft multi-layer shadows, glass rims, a key light, grain of 1–2% on a brand-flat film, a 10–30% vignette, motion blur on fast moves) unless the brand film's MEASURED finish is zero: `brandfilm.mjs measure` writes `finish` and `finish.layerOff` ("Route: graphic" on the card's `Finish:` line) only when grain, soft shadow, ground tint and falloff all measure zero on a flat ground. Then the film wins on type scale and photography (giant moments, full-bleed images, colour content), the OpenAI route, never as a white void with a screenshot in it.
- **Page chrome the brand's own films carry.** `slop.mjs` flags kickers, tracked-caps labels, counters and the like (`references/motion-md-contract.md` "Page-chrome rules"). When the brand's own films show one of these devices (a tracked-caps label in every shot, a chapter counter), the analyst lists the rule ids in the brand film's `grammar.json` as `measured.chrome` (for example `["tracked-caps-label"]`); `slop.mjs --run` then allows them. Nothing writes this key automatically yet, and a device the brand films do not show stays flagged.
- **Mood grounds and depth.** `Mood grounds:` says how the brand's films change the ground on story turns (OpenAI's "Refreshed." uses colour fields, coloured dot fields and photography: mood grounds yes; an "#FCFCFC everywhere" film was a misreading of it). Blur used as depth (a defocused background, a giant word blurred behind the UI, rack focus) and motion blur on fast moves are always available; the card's `Depth blur:` line records what the films show, it does not turn depth off.
- **3D takes the brand's palette and tone.** The card's `3D style:` line says how 3D looks in this brand (for a matte, even-lit film: matte or unlit materials in the palette's hexes, `references/3d.md` "Brand-flat 3D"); 3D, depth of field and camera moves are never refused because the brand's films are flat. Bloom and glow in a 3D scene are budgeted like anywhere else.

## 5. The style-match gate

After the **key frames** (before the frames critic and before any animation) and after the **first draft render**:

```bash
node $SKILL_DIR/scripts/brandfilm.mjs compare --ref "$RUN/brand-film/grammar.json" --ours "$RUN/frames"        # key frames
node $SKILL_DIR/scripts/brandfilm.mjs compare --ref "$RUN/brand-film/grammar.json" --ours <draft.mp4>          # first draft
```

**Which film is the reference.** `grammar.json` holds one film's numbers in `measured` and any others under `films` (`brandfilm.mjs measure --in <film> --out grammar.json --film <name> --structure one-take|montage|…` adds one). Cut rate and tempo are per film, so compare against the film the script follows: `--film <name>` (or `--structure <type>`, which picks the film of that structure). A one-take product spot measured against a 110 s montage fails on cut rate by construction; with `--structure one-take` and no one-take film to follow, cut rate is a warning and tempo has no floor (the house cap stays). Palette, hue and the rest are unchanged, so a real brand mismatch still fails.

Exit 1 is a fail, on palette distance, an off-brand hue, cut rate or tempo: fix the frames (or the failing scenes) before animation or polish continues, then re-run. Canvas share, % white, lightness, the amount of colour and the finish are **warnings** (`warnings` in the JSON): a launch film may light its ground, go dark on the pain beat or carry photography the identity film never showed; report them, do not chase them. The typeface is checked by `design.mjs check-system`. Record the numbers in `decisions.style_match` and push a short note the user sees ("Matches OpenAI's film style: 76% white canvas vs 77%, palette dE 4.1"). The frames and film critics repeat it and report `style_match` in their JSON; neither may ship on a fail.

## 6. Worked example: OpenAI and the ChatGPT for Mac launch film

Text only; the frames of OpenAI's film are the user's and are not in the repo.

**What went wrong.** The 30 s film "The Museum of the Detour" left OpenAI's design in every way the grammar card measures:

| | The brand film ("Refreshed.", 110 s) | Our film |
|---|---|---|
| Canvas | near-white, about 77% of pixels over luma 240; black about 4% | about 30% near-white and 46% dark gallery green |
| Type | one family, OpenAI Sans, huge or tiny, nothing between | a Bodoni serif display |
| Imagery | the product's own prompt, real photography, thin construction lines | line-art props (plinths, a mug, a bell jar) |
| Concept | the dot, morphing; the product's own UI is the first image | an invented museum metaphor; the product at about 19 s |
| Motion | scale, morph, draw-on, cut on the beat, in one sans and the brand palette; 3D in the matte palette style | a 3D dolly with bloom and grain on every frame, in gallery green and Bodoni |
| End | the mark alone, big, on white | a small CTA in body text |

The dolly, the blur and the grain were not the failure: the palette, the face, the invented world and the late product were. The causes: the brand research was text-only (it never looked at the brand's films), the design desk blended outside references (Paula Scher, Spielberg, Wes Anderson, museum grammar), the recommender chose the Bold look furthest from the brand, the story engine liked an inventive conceit, and nothing compared the built frames to the brand's real frames.

**What the grammar card says** (a card for "Refreshed." as the analyst would write it):

- Canvas: near-white (#FAFAFA-ish), black type and marks; one deliberate black frame with a white circle. 77% near-white, 4% black, colour under 5% and only as moments.
- Palette: black on white; sky blue, lavender, navy, royal blue as flat solid circles, then a multicolour dot field, then a soft gradient sphere; never a background wash.
- Type: one sans (OpenAI Sans; Substitute: a loadable neutral sans), Light to Bold, two size classes (huge statements or single letterforms; tiny margin labels).
- Layout: one element at a time, centred or on a strict grid, huge whitespace.
- Motif: the dot: dot, circle, outline circle, dot grid, colour dot field, dot; thin grey construction lines resolving into letterforms and the logo.
- Motion: Seen: scale, morph, draw-on, cut on the beat, slow rotation of a dot sphere, soft defocus-and-fade exits; calm stretches (one slow mover, never frozen) alternating with brisk runs. Not seen (allowed on a budget): glow, overshoot, blur-in, particles as decoration, chromatic split. 3D style: matte or unlit dots in the palette.
- Finish (measured): grain 0, ground chroma 0, ground L* range 0, no soft shadow: Route: graphic. The finish layer may be off, so the film wins on giant type (letterforms at 60–80% H), full-bleed photography and colour circles.
- Mood grounds: yes. The ground changes with the story within the palette (white, a colour field, a photograph, one black frame). Depth blur: seen in the collage (frosted cards over a defocused wordmark).
- Imagery: real, bright, golden-hour photography (ocean, sky, cliffs), full bleed or framed on white; a fast collage of brand artefacts.
- Opening: the real prompt typing "What can I help with?" next to the dot. End: the mark alone, then the wordmark, on white.

**What the right film does.** A 30 s ChatGPT for Mac launch on that canvas: the real prompt box and the dot in the first 2 s, a short statement, a hero demo of the product, 2 or 3 real uses with 2 to 4 word labels, a payoff line, and the mark and one CTA, held 3 s. Sure is that card exactly; Bold and Wild keep every colour, face, motif and move and differ in scale, rhythm and what the dot does. Key frames and the first draft pass `brandfilm.mjs compare` (for example 76% near-white vs 77%, palette dE 4.1) before anything is polished.
