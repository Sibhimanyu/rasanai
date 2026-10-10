# Launch film rulebook: structure, hard rules, brand grammar, red flags

Applies to every launch, promo, feature-reveal and brand film (same scope as `product-first.md`; this file is the enforceable detail: timings, numbers, measurement, critic checklist). Where a number is marked (house) it is this engine's rule derived from the sources, not a quote from them.

Source quality note: Apple, OpenAI/Studio Dumbar and the Apple HIG are primary. Linear, Raycast, Figma, Notion, Arc, Stripe, Vercel and Framer launch films were only reachable through secondary write-ups, so their entries are patterns, not specs. Agency numbers (length, hook window) are agency opinion and disagree with each other; the ranges below are the overlap.

## 1. Structure templates

Rule for all lengths: the product (real UI or the real mark) is on screen by 3 s. Hook = the product doing its main thing, not a problem montage. (Agency guidance often says "start with the problem"; for a known product with a real UI, show the product answering the problem in the same shot.) Beats are sized by share of runtime so they scale.

Tempo comes first (see "Tempo" below): the tables carry the house idea counts and holds. An idea is one new thing the viewer learns; each row below that is not the hook, the end card or a transition is one or more ideas.

### 15 s (social teaser, one feature), 3 ideas minimum
| t (s) | Beat | On screen |
|---|---|---|
| 0.0-2.0 | Hook + product | Real UI already mid-action (prompt typing, shortcut pressed). Brand mark small at the margin. |
| 2.0-4.0 | Statement | One line, 3-6 words, on the brand canvas, held only its reading time. UI may sit behind or beside it. |
| 4.0-7.5 | Hero demo | The one feature, real UI, changing every ~2 s inside (new state, new line, a camera move that reveals). 3.5 s at most. |
| 7.5-11.5 | 2 uses | About 2 s each, a different real use each, a 2-4 word label. |
| 11.5-13 | Payoff line | Plain outcome sentence, 3-6 words. |
| 13-15 | End card | Mark + product name + one CTA. Held at least 2 s. |

### 30 s (launch spot), 5 ideas minimum, aim for 6 or 7
| t (s) | Beat | On screen |
|---|---|---|
| 0-2 | Hook + product reveal | Product UI or mark full frame. First text appears by 1.5 s. |
| 2-4 | Statement / promise | One line, 3-6 words. Cut or morph into UI. |
| 4-8 | Hero demo | The headline feature, real UI. The longest hold of the film (4 s), and it changes inside about every 2 s. |
| 8-24 | 4 or 5 uses | 2.5-3.5 s each (about 3), each a different real use with a 2-4 word label, each changing inside about every 2 s. At most one calm hold (the breath), placed before the payoff; then accelerate into it. |
| 24-27 | Payoff line | The largest line of the film. |
| 27-30 | End card | Mark, name, CTA (availability: "Available today on Mac"), nothing else. |

### 60 s (launch film), 8 ideas minimum, aim for 10
| t (s) | Beat | On screen |
|---|---|---|
| 0-3 | Hook + product | Real UI in action, or the brand's opening gesture (the prompt, the mark). |
| 3-9 | Promise | 2 statement lines, one idea each, product always visible or one cut away. |
| 9-15 | Hero demo | 5 s at most per hold, real UI, the feature end to end, changing every ~2 s. |
| 15-48 | 6 or 7 feature demos | 4-5 s each (each changing inside every ~2 s). One idea per demo. Label (2-4 words) + UI. A rhythm change (one calm hold then quick cuts) once. |
| 48-54 | Payoff | Outcome line + brand motif resolves (dot, mark, logo). |
| 54-60 | End card | Mark, name, one CTA, URL or platform. |

### 90 s (brand or keynote-style film), 10 ideas minimum
| t (s) | Beat | On screen |
|---|---|---|
| 0-4 | Hook + brand/product | As 60 s. |
| 4-16 | Promise + principle | 2-3 statements. Brand motif introduced and transformed. |
| 16-24 | Hero demo | Real UI, 6 s at most per hold, one take where possible, changing every ~2 s. |
| 24-76 | 7 to 9 feature demos | 5-6 s each, a stat or detail beat inside at most 1. |
| 76-84 | Payoff + collage or density build | Fast cuts on the beat building to the densest moment, then silence or one hit. |
| 84-90 | End card | As 60 s, 3 s minimum hold. |

Length limits: agency data puts social and teaser films at 15-30 s, explainers at 45-90 s, and the retention cliff near 45-50 s; kinetic-type pieces hold under about 90 s. OpenAI's own brand film runs 110 s as a hero piece, so over 90 s needs an explicit brief. Default to 30 s or 60 s if the brief does not say.

Cut-down rule: plan 15 s and 30 s cuts at storyboard stage by making every feature beat self-contained (Moonb's "plan cutdowns at storyboard" lesson; Duolingo and Samsung cut from independent segments).

## Tempo

Name it tempo, never pace (Studio's Pace setting is research speed). Commercial shots have averaged under 2 s since the early 1990s (MacLachlan and Logan, "Camera Shot Length in TV Commercials and their Memorability and Persuasiveness", Journal of Advertising Research); a launch film that spends 8 s on one idea reads as slow. Numbers marked (house) are this engine's rule.

- **An idea** is one new thing the viewer learns: a feature, a use, a proof, the promise, the payoff. The hook, the end card and pure transitions are not ideas.
- **Ideas per film (house minimum for launch, promo and feature films):** 15 s: 3, 30 s: 5 (aim 6 or 7), 60 s: 8 (aim 10), 90 s: 10. Only a brief that asks for a calm or slow film goes under.
- **Change rate (house):** something meaningful changes on screen every 1.5 to 2.5 s on average: a cut, or inside a continuous take a new UI state, a new line, a morph, a camera move that reveals something new. A continuous-take brand still changes every 2 s; tempo is not only cuts.
- **Longest hold (house):** 4 s for the one hero moment in a 30 s film (3.5 s at 15 s, 5 s at 60 s, 6 s at 90 s), 3 s for anything else; a statement line holds only its reading time (0.3 s per word + 0.6 s). The end card keeps its 2 s minimum.
- **One breath:** at most one deliberate calm hold per 30 s, placed before the payoff, then accelerate into it.
- **The film's target:** the brand's measured tempo when a brand film card exists (`brandfilm.mjs measure` writes `tempo`: changes, seconds between changes, longest hold; the analyst adds ideas shown and seconds per idea), otherwise the house tempo. Ideas never fall below the house minimum. The pitch carries it as `tempo: { ideas, change_every_s, longest_hold_s, source: "brand film" | "house" }`; `story.mjs check` gate G9 enforces it (use `--brand-film <grammar.json>` for the brand's numbers), and `brandfilm.mjs compare` holds the draft to 0.7x to 1.4x of the brand's change rate and never slower than a change every 2.5 s.

## 2. Hard rules (numbers are limits)

1. **Product or brand on screen within 3 s** (1 s is better). First frame is not black, not a title card, not a metaphor. Raycast's 39 s teaser uses only fragments of the real interface; Linear's walkthroughs put the full-screen real UI first.
2. **One idea per shot.** One feature, one sentence, one motion. If a shot needs "and", split it. Max 1 text block and 1 UI focus per frame.
3. **Plain words.** Say it the way a person would say it aloud. Max 6 words per on-screen line (statements 3-6; labels 1-4). Max 2 lines per card. No riddles, puns that need decoding, cryptic labels, or jargon not in the product's own UI. Apple's recent films use whole sentences as single beats, with no voiceover, one short sentence per beat.
4. **Reading time:** a line holds on screen at least 0.3 s per word plus 0.6 s (a 5-word line = 2.1 s minimum), longer on phone-size output. A spec that flashes past has failed (GoPro example in Moonb).
5. **Type scale (house, in frame heights).** Two sizes only for the voice: *Statement* = 10-18% of frame height (cap height ~8-14%) or a single letterform filling the frame; *Label* = 1.8-2.8% of frame height (about 20-30 px at 1080p), at margins (top or bottom centre, corners). Nothing in between except the UI itself. The CTA/end line is Statement size. A CTA smaller than body copy fails.
6. **Real UI.** Captured, or rebuilt as DOM with real layout, labels, type and colours. Never icons, drawn props or abstract shapes standing in for the UI (see `product-first.md`). UI choreography beats screenshots: the cursor, the keystroke, the window arriving, the answer streaming.
7. **The brand's own palette, type and motif only.** Palette from the brand's real films and product (section 3). No colours, display faces or illustration styles from outside references. For a named brand, outside references (famous directors, other brands) are banned from the design.
8. **No invented metaphors or worlds.** Museums, galleries, parables, dioramas, characters, mockumentaries fail. If the concept needs a sentence of explanation to make sense on a silent first view, it fails. Allowed: a visual pun that resolves to the product within 1 s.
9. **Restraint in motion.** Vocabulary brands actually use: scale, morph (one shape into another), draw-on (outline into solid), cut on the beat, slide/fade of type, UI choreography (cursor, keystroke, panel in), simple parallax of flat layers. Max 3 distinct motion types per film (house). Ease: one curve family per film. Moves 0.3-0.8 s for UI, 0.5-1.2 s for type; Apple HIG: motion is purposeful, brief, precise, optional. Banned unless the brand film itself uses them: 3D camera moves, motion blur, film grain, glitch, shake, lens flare, bounce overshoot, particle bursts. Typography effects: no outlines, shadows or per-word gimmicks on every line (Apple: such effects weaken authority).
10. **Cut rate follows the reference film**, not taste, and never falls below the house tempo (Tempo, above). One calm hold (up to the longest-hold limit) alternates with bursts of cuts at 0.4-1.0 s each on the beat. Never constant fast cutting for the whole film; never a single speed.
11. **End card.** Brand mark (and wordmark) is the biggest object; one line or none; one CTA only ("Available today", the URL, or the store badge, not three). Clean brand canvas. Hold at least 2 s (15 s film), 3 s (30-90 s). No competing UI, no credits crawl, no second tagline. Last frame is the mark alone or mark+name; then optional black. **The mark is the downloaded file** (`research/brand/assets/`, staged at `assets/brand/`), placed unchanged with its clear space and the colour version for the canvas: never drawn, traced, approximated or generated (a flower made of circles is not the OpenAI blossom). If `logos.json` says `none`, the end card is the brand name in the brand font only, no symbol, and the user was told.
12. **Sound and music.**
    - Music carries the film: cuts, morphs and type hits land on beats (within 1 frame at 30 fps). Build a beat map first.
    - Sound design is feedback, not wallpaper: soft ticks for keystrokes and UI, a low hit for the payoff, silence or a drop before the end card (OpenAI: sound design "subtle and intuitive audio feedback synchronized with animations").
    - Voice-over only if the brand uses it. Otherwise no VO; on-screen words are the narration.
    - Loudness (house): -14 LUFS integrated for web and social, true peak max -1 dBTP; music ducks 6-10 dB under any VO.
    - Design for sound off: every beat reads with captions/labels alone (nearly 70% watch on phones; web autoplay is muted). Keep an on-screen text track even if there is VO.
    - Do not loop a bed; the music has an arc: intro, build, one release, button ending.
13. **Aspect ratios.** Design 16:9 first, then re-lay (not crop) for 9:16 and 1:1.
    - 9:16 (1080x1920): safe area keep 8% side, 12% top and 20% bottom clear of text (platform UI). Labels move from margins to inside the safe area; statements may wrap to 3 short lines but keep the 6-word cap; UI is recomposed (single column, crop the window to the active panel), not shrunk.
    - 1:1 (1080x1080): 6% margins; same type scale as % of frame height; UI window may fill the frame.
    - Test on a phone at arm's length. Layered type that works on desktop tangles on a phone (Moonb).
    - Cut length: 9:16 and 1:1 versions are 15 s or 30 s derived from the master beats.
14. **Lock words first.** Copy, line breaks and terminology are fixed and checked against the product's own UI strings before animation; a beat sheet and plain-text animatic come before building (Moonb kinetic type workflow).

## 3. Brand film grammar (extract before designing)

Run on every named brand. Inputs: the brand's own films (brand film, launch films, keynote videos), their site and product screenshots. Never design from text descriptions alone (this was the root cause of the ChatGPT miss). Output: a grammar card (section 4) saved with the research; the design desk may not leave it.

Sample frames first (1 fps for a brand film, 2-4 fps for a fast launch film):

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
| Motion vocabulary | Moves present: scale, morph, draw-on, cut, parallax, 3D, blur | Step through at 12-24 fps for 10 s samples; list moves seen; mark absent ones as banned (3D camera, blur, grain). Blur/grain check: high-pass noise level of flat regions (std dev of canvas area over 1 s, over 3/255 = grain). |
| Photography / illustration | Real photo vs illustration vs none; grade; subjects; crop | Classify frames: UI, type-only, photo, illustration, collage. Share per class. Note time of day, saturation, full bleed vs framed card. |
| Cut rate and rhythm | Average shot length, calm vs burst pattern | `ffmpeg -i ref.mp4 -vf "select='gt(scene,0.25)',showinfo" -f null - 2>&1 \| grep pts_time` gives cuts (tune 0.15-0.4: lower catches morphs/dissolves; flat-brand films with white backgrounds need 0.1-0.2). ASL = duration / cuts. Plot shot length over time to find holds vs bursts. |
| Transitions | Hard cut, morph, wipe, dissolve, match cut | Frames either side of each detected cut: identical shape continuing = morph/match cut; unrelated = hard cut. Dissolves show 2+ frames of intermediate scene scores. |
| UI treatment | Full-screen, in window chrome, cropped fragments, device frames | From frames: UI share of runtime and first appearance time. |
| End card | What is on it, scale, hold | Last 5 s of frames: element count, mark height % of frame, hold length in s. |
| Audio | Tempo, instrumentation, UI sounds, VO or none | `ffmpeg -i ref.mp4 -af ebur128=peak=true -f null -` for loudness; detect BPM with a beat tracker (librosa) if available; note silences. |

Verification gate: after build, run the same measurements on our frames and compare to the grammar card. Tolerances (house): canvas share within 15 points, each accent within 5 points, ASL within 30%, type classes two-modal, zero banned moves, first product frame at or under 3 s, end-card mark height not smaller than reference by more than 25%.

## 4. Worked example: OpenAI "Refreshed." (110 s, measured, from `.context/ref/analysis.md`)

```
GRAMMAR CARD: OpenAI brand film "Refreshed." (110 s, 1080p)
Canvas        near-white (#FAFAFA-ish), 77% of pixels luma > 240, mean luma 223/255.
              Black ~4% of pixels (type, marks, one deliberate inverted black frame with a white circle).
Palette       black type and marks on near-white. Colour < 5% of frame: sky blue, lavender, navy, royal blue.
              Arrives as flat solid circles, then a multicolour dot field, then a soft gradient sphere.
              Never as a background wash.
Type          One family: OpenAI Sans (custom, with Dinamo Typefaces), weights Light to Bold.
              Two sizes: huge (single letterform fills frame) and tiny labels at margins (top/bottom centre).
              Nothing between. No serif display face.
Layout        One element at a time, centred or on a strict grid, huge whitespace.
              Principle lists in small type (Simplicity / Space / Imperfection / Vivid).
Motif         The dot. dot > solid circle > outline circle > dot grid > coloured dot field > single dot.
              Thin grey construction lines and grids resolving into solid letterforms and the logo (GPT, OpenAI, blossom).
Motion        scale, morph, draw-on, cut on the beat. Calm holds alternate with brisk runs of cuts/morphs on music.
              No 3D camera, no motion blur, no grain, no dark moody scenes.
Imagery       Real natural photography, bright to golden hour (ocean, sky, cliffs, sunsets, hand in water),
              full bleed or framed cards on white; tiny white words scattered over a photo as one sentence.
              Collage: fast montage of brand artefacts (posters, type specimens, product shots, papers) layered on white.
Opening       The product's own prompt typing "What can I help with?" next to the brand dot (product UI language first).
Cut rate      calm holds + bursts (measure with scene detection before copying a number).
End card      Blossom mark alone, then OpenAI wordmark alone on white, then black. Mark is big and confident.
Sound         Bespoke sound design: subtle, intuitive feedback synchronised with animation (Studio Dumbar).
Banned (derived) serif display, gallery green or any non-brand background, 3D dolly, blur, grain, line-art props,
              invented concept, small CTA in body text.
```

What the failed film did against this card: 46% dark green vs a 77% near-white canvas; Bodoni vs one sans; line-art props vs real UI and photography; 3D dolly with blur and grain vs flat morphs; product at 19 s vs the first image; small body-text CTA vs mark alone, big.

## 5. Red flags (a critic fails the concept or frame on any one)

Concept
- The idea needs explaining on a silent first view; a metaphor, character, museum, parable or world.
- Product UI or mark not on screen by 3 s; the hero demo is shorter than the longest non-product shot.
- Fewer than 2 or more than 4 real feature demos in 30-90 s films; two ideas in one shot.
- On-screen line over 6 words, a riddle, a pun not resolved in 1 s, jargon the product does not use.
- References (directors, other brands, "editorial", "museum label") in the look for a named brand.
- Voice-over where the brand uses none; a lyric-style or story film where a feature film was asked.

Frame
- Background colour the brand never uses (measure: canvas hex off the brand canvas by more than a small distance, or share off by more than 15 points).
- A serif display face when the brand is sans (and the reverse); a second display family; faux-bold or outline text.
- 3D, grain, blur, bloom, gradient washes, glassmorphism or shadows when the brand is flat.
- Colour as a wash or background when the brand uses colour as small flat shapes.
- Type between the two scale classes: mid-size text everywhere; labels under 1.8% of frame height; a CTA, end line or payoff smaller than body copy.
- Drawn props, icons or stock illustration used as a stand-in for the UI; a UI recreation with invented labels or the wrong font.
- More than one focal element; busy density where the brand uses whitespace.
- Text outside safe margins; 9:16 made by cropping 16:9.

Motion and sound
- Constant fast cutting or a single speed for the whole film; cuts off the beat.
- A move the brand film never uses (3D dolly, shake, overshoot bounce, glitch, parallax depth).
- More than 3 motion types; different ease families per scene; per-word animation on every line.
- Looped music bed, no sound design on UI actions, loudness outside -16 to -12 LUFS.

End card
- CTA smaller than body copy; two or more CTAs; competing tagline plus mark plus URL plus badge at equal weight.
- Mark smaller than the line; held under 2 s; not on the brand canvas; no mark at all.

## 6. Sources

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
