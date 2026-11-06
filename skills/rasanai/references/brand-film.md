# Brand launch films: research the brand's own film as a reference, lock the brand, let the concept's world set the look

Applies to every launch, promo and brand film for a named brand (route `product-launch-video`, or a `general-video` that is a launch, promo or brand film; not lyric, presenter or reel routes). The enforceable numbers (structure templates, timings, the grammar checklist, the red flags) are in `references/launch-film.md`; this file is the pipeline that uses them.

- Research the brand so the logo, accent, claim face and real UI are exact, and keep the story simple and to the point, because that is what this pipeline exists for.
- Read the measured card as a reference that describes the brand's site or film, and lock only the logo, the brand accent as the signal colour, the brand face on the claim and end line, and the real product UI ("Use brand").
- Take canvas, palette, type system, texture, motion grammar and finish from the chosen concept's `style_world` (the atlas), because the card is the look only in strict brand mode (`decisions.strict_brand_film` / `film_style_strict`, set only when the user asks for a strict brand film).
- On a launch, promo or product-launch film follow `launch-grammar.md`, which overrides this file on brand lightness (logo count in its section 3; palette atmosphere plus an optional local carrier; simplified recreated UI mockups; ground and type from the launch grammar; a style world is optional). Non-launch brand films keep the rules below.

## 1. Brand film research (required whenever a brand applies)

Run this during the Brief, in parallel with the research desk (crew phase `brand-film`), into `$RUN/brand-film/`. The Director runs `scripts/brandfilm.mjs`:

```bash
node $SKILL_DIR/scripts/brandfilm.mjs find   --brand "<brand>" --url "<site>" --product "<product>" --out "$RUN/brand-film/find"
node $SKILL_DIR/scripts/brandfilm.mjs fetch  --url <official film url> --out "$RUN/brand-film/1"     # or --file <the user's attached video>
node $SKILL_DIR/scripts/brandfilm.mjs frames --in "$RUN/brand-film/1/<video>" --out "$RUN/brand-film/1"
node $SKILL_DIR/scripts/brandfilm.mjs measure --in "$RUN/brand-film/1/<video>" --out "$RUN/brand-film/grammar.json"
node $SKILL_DIR/scripts/brandfilm.mjs card   --dir "$RUN/brand-film" --brand "<brand>"                  # FILM-STYLE.json + FILM-STYLE.md
```

- **Sources.** Take the top 1 to 3 hits of `find` that are official (the brand's own channel, recent) and fetch at most 2 films.
  - Read an identity film ("Refreshed.") as evidence of the brand's palette, type and motif, because an identity film is not a launch grammar.
  - For a launch film, make one of the two films the brand's own product launch or feature spot when one exists (OpenAI's "You can just launch Sites"), and let the grammar also look at the category's best launch films (`references/launch-film.md`, the reference moments), because the identity film's restraint is no reason for the launch film to hold back.
  - Use a video the user attached as the primary reference (Studio passes attached files as sources) and skip `find` for it.
  - Keep every download out of the repo.
- **Fast.** On Fast pace keep the whole step to about 3 minutes, with no extra films and no second pass.
- **No film found.** Use the brand's website and product screenshots as the frames (`brandfilm.mjs site --url "<site>" --out "$RUN/brand-film/site"` captures ~12 scroll frames headlessly; skip `frames`, which reads a video only; `measure --in <folder of PNGs>` and `card` work on the folder), and tell the user in the brand step ("no official film found; this is read from the website").
- **The analyst.** The Sonnet brand film analyst (`agents/brand-film-analyst.md`) reads the contact sheets and fills `FILM-STYLE.md` and the slots of `FILM-STYLE.json` against the grammar checklist (`launch-film.md` section 3): canvas, palette and shares, typefaces and the type scale, layout and grid, signature motif, motion vocabulary (what is seen, and what is not seen and so allowed on a budget), the measured finish, photography or illustration, cut rate, transitions, end card. `crew.mjs check --role brand-film-analyst` accepts it.
- **Principles.** Have the analyst write 2 to 4 `principles` (why a technique works, what it needs, what is the brand's own and so `distinctive`) into `FILM-STYLE.json`. `brandfilm.mjs compare` lists them as `principles_to_judge`, and the film critic returns `principles_check` on the render. Leave a distinctive part uncopied.
- **Show the user.** Set `decisions.film_style` to `brand-film/FILM-STYLE.json` and push it with the `brand` step: what the film looks like in plain words ("White canvas, black type in one sans, a single dot that morphs, flat moves, real photography, ends on the mark"), the measured numbers and the contact sheet.

## 2. The look is the concept's world; the card is a reference (strict mode: the card is the look)

- **Default (not strict).** Make Sure the chosen concept's own `style_world` with the brand lock, and Bold / Wild neighbour or contrasting worlds from the atlas, so there are three distinct `style_world`s in all (a brand-faithful "site look" may be at most one of them and never the only option). Library references, movements and the atlas are allowed. `blend.json` carries `style_world` per look; `film_style` / `film_style_takes` only on a site look.
- **Strict brand mode** (`decisions.strict_brand_film` / `film_style_strict`; never inferred): make Sure the card exactly, and Bold / Wild the same palette, typefaces, motif and motion vocabulary, varying only composition, pacing and emphasis. Use no outside designers, directors, museum or editorial grammar or library references (Paula Scher, Spielberg, Wes Anderson...), because strict mode means the brand's own grammar. `blend.json` carries `references: []`, `film_style` and `film_style_takes` (3 or more things taken from the card).
- `design.mjs check-system`, `check-systems` and `look-payload` enforce the strict form only: they refuse a look without a FILM-STYLE citation, with a canvas / ink / accent that is not a colour of the card (CIE76 dE over 15, accent over 28), a display face not in the card's typefaces, or an outside library reference. Outside strict mode they require three distinct style worlds and the brand lock. Finish, depth, camera and 3D are not refused on any card (section 4).
- The recommender picks the clearest look that carries the story and the brand lock.

## 3. A simple story

- Follow the structure template in `launch-film.md` section 1 for the film's length: hook with the product or brand in 1 to 3 s, the reveal, 2 to 4 real feature demos, one payoff line, the end card with one CTA.
- Give each beat one idea in plain words (6 on-screen words at most), because that keeps the story to the point.
- Let the three scripts differ only in emphasis and order (which feature leads, where the hero sits, how fast) and keep the concept the same.
- `story.mjs check` G7 enforces the structure (hook, hero/reveal, 2 to 4 demos, payoff, end card), the beat timings for the film length, and the product or brand in every beat.

## 4. Brand lock: logo, accent, claim face and real UI; never craft

This section is the home of the brand lock (`launch-film.md` rule 7 links here).

- Keep the logo, the brand accent as the signal colour, the brand face on the claim and end line, and the real product UI (screens and cards pixel-true) exact in the looks, boards and animators.
- Read the card (`FILM-STYLE.md`) as a reference and take canvas, palette, type system, texture, motion grammar, finish, depth, camera, shot size and colour content from the chosen concept's `style_world` and the craft (`references/craft.md` "Finish and budgets", `references/cinematography.md`). Make the card binding on palette, typefaces, motif, vocabulary and tone only in strict brand mode.
- **What the card says about motion.** Have the analyst write `Seen: ...` (every move and effect the films use; the brand's native vocabulary, used where the chosen world's grammar agrees and freely in strict mode) and `Not seen (allowed on a budget): ...` (effects these films do not show).
  - Spend a "not seen" effect (glow, bloom, overshoot, blur-in, particles, scale-pop, chromatic split, a halftone burst, a light comet) 2 to 3 times per film on the hero, with a reason in the score's `budget` (`scripts/lib/budget.mjs`; the exact budget numbers are in `launch-film.md` rule 9). Using the effect on every element or every line stays an error (`slop.mjs`, the motion contract).
- **The finish layer follows the chosen world.** The card's measured finish applies only in strict mode; the default is a tinted living ground, soft multi-layer shadows, glass rims, a key light, grain of 1-2% on a brand-flat film, a 10-30% vignette and motion blur on fast moves.
  - Turn the finish off only when the world's finish is none (in strict mode: the brand film's measured finish is zero; or the look's visual bible records `finish_policy: none` with a rationale). `brandfilm.mjs measure` writes `finish` and `finish.layerOff` ("Route: graphic" on the card's `Finish:` line) only when grain, soft shadow, ground tint and falloff all measure zero on a flat ground.
  - Then win on type scale and photography (giant moments, full-bleed images, colour content), the OpenAI route, and avoid a white void with a screenshot in it.
- **Page chrome the brand's own films carry.** `slop.mjs` flags kickers, tracked-caps labels, counters and the like (`references/motion-md-contract.md` "Page-chrome rules").
  - When the brand's own films show one of these devices (a tracked-caps label in every shot, a chapter counter), have the analyst list the rule ids in the brand film's `grammar.json` as `measured.chrome` (for example `["tracked-caps-label"]`); `slop.mjs --run` then allows them.
  - Nothing writes this key automatically yet, and a device the brand films do not show stays flagged.
- **Mood grounds and depth.** `Mood grounds:` records how the brand's films change the ground on story turns (OpenAI's "Refreshed." uses colour fields, coloured dot fields and photography: mood grounds yes; an "#FCFCFC everywhere" film was a misreading of it). Use blur as depth (a defocused background, a giant word blurred behind the UI, rack focus) and motion blur on fast moves whenever they help; the card's `Depth blur:` line records what the films show and does not turn depth off.
- **3D takes the brand's palette and tone.** Read the card's `3D style:` line for how 3D looks in this brand (for a matte, even-lit film: matte or unlit materials in the palette's hexes, `references/3d.md` "Brand-flat 3D"), and use 3D, depth of field and camera moves even when the brand's films are flat. Budget bloom and glow in a 3D scene like anywhere else.

## 5. The style-match gate

Run the gate after the key frames (before the frames critic and before any animation) and after the first draft render:

```bash
node $SKILL_DIR/scripts/brandfilm.mjs compare --ref "$RUN/brand-film/grammar.json" --ours "$RUN/frames"        # key frames
node $SKILL_DIR/scripts/brandfilm.mjs compare --ref "$RUN/brand-film/grammar.json" --ours <draft.mp4>          # first draft
```

- **Pick the reference film.** `grammar.json` holds one film's numbers in `measured` and any others under `films` (`brandfilm.mjs measure --in <film> --out grammar.json --film <name> --structure one-take|montage|...` adds one). Compare against the film the script follows with `--film <name>` (or `--structure <type>`, which picks the film of that structure), because cut rate and tempo are per film. A one-take product spot measured against a 110 s montage fails on cut rate by construction; with `--structure one-take` and no one-take film to follow, cut rate is a warning and tempo has no floor (the house cap stays). Palette, hue and the rest are unchanged, so a real brand mismatch still fails.
- **Read exit 1 as a fail** on palette distance, an off-brand hue, cut rate or tempo: fix the frames (or the failing scenes) before animation or polish continues, then re-run.
- **Treat these as warnings** (`warnings` in the JSON): canvas share, % white, lightness, the amount of colour and the finish. Report them and skip chasing them, because a launch film may light its ground, go dark on the pain beat or carry photography the identity film never showed. `design.mjs check-system` checks the typeface.
- Record the numbers in `decisions.style_match` and push a short note the user sees ("Matches OpenAI's film style: 76% white canvas vs 77%, palette dE 4.1"). The frames and film critics repeat it and report `style_match` in their JSON, and neither ships on a fail.

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

- The dolly, the blur and the grain were not the failure; the palette, the face, the invented world and the late product were.
- The causes were text-only brand research (it never looked at the brand's films), a design desk that blended outside references (Paula Scher, Spielberg, Wes Anderson, museum grammar), a recommender that chose the Bold look furthest from the brand, a story engine that liked an inventive conceit, and nothing comparing the built frames to the brand's real frames.

**What the grammar card says.** The full card for "Refreshed." (canvas, palette, type, layout, motif, motion, finish, mood grounds, imagery, opening, end) is the worked example in `launch-film.md` section 4. In short: near-white canvas (77% near-white, 4% black), one sans in two size classes, the dot as motif, measured finish zero (Route: graphic), real golden-hour photography, and the mark alone on white at the end.

**What the right film does.** A 30 s ChatGPT for Mac launch on that canvas:
- Put the real prompt box and the dot in the first 2 s, then a short statement, a hero demo of the product, 2 or 3 real uses with 2 to 4 word labels, a payoff line, and the mark and one CTA held 3 s.
- Make Sure that card exactly, and let Bold and Wild keep every colour, face, motif and move and differ in scale, rhythm and what the dot does.
- Pass key frames and the first draft through `brandfilm.mjs compare` (for example 76% near-white vs 77%, palette dE 4.1) before anything is polished.

<example>
good: the first image is the real prompt box beside the brand dot, on the near-white canvas, with giant type and photography carrying the film.
bad: an invented museum metaphor in gallery green with a Bodoni headline and the product at 19 s. Fix: open on the product's own UI in the brand face and palette, and keep the 3D dolly, blur and grain only as craft.
</example>
