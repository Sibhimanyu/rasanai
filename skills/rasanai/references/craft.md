# Craft: the playbook for every decision Claude makes without asking

The user decides **taste**: the brief, the film (its style and its story), notes on the animatic, and the final. Everything else is **craft**, and Claude decides it the way a senior motion designer would: without a question, following this file, and reporting each call in one plain line (see **Reporting decisions**) so any of it can be changed with a note. If a decision would need expertise to answer (which ease, which transition, how long a scene runs), it is not a question.

**Precedence.** The project's brand (DESIGN.md) wins, then the chosen style (its `stack`, `recipe`, `DIRECTION.md` and `motion.md`), then this file. When the style overrides a rule here (a stop-motion style wants stepped cuts; a neon style wants glow), follow the style and say so in the decision's reason. Never override a rule silently. **One exception: momentum.** The motion gate (`motion-gate.mjs`) wins over every style card, brand film card and direction: a hold a style asks for ("hold 2 s", "long holds", "nothing moves") is reading time, and it still carries secondary motion; no still stretch reaches 0.8 s, nothing creeps, and the end card holds at most 1.5 s still.

**Units.** Numbers assume 30 or 60 fps. Sizes are given as a percentage of the frame's **short side** (1080 px in 1920×1080, 1080×1920 and 1080×1080), so they hold in every aspect. For turning any term here into code (a whip pan, halation, a split tone), use `references/vocabulary.md`.

**Why this file is strict.** Viewers don't reject AI; they reject **decisions nobody made**: defaults left in place, uniformity, effects without a cause, and claims without specifics. The most common verdict on Claude-made launch videos is "it's just a PowerPoint". Every rule below exists to put a made decision where a default would be.

---

## 1. Principles

1. **Hook in 1.5 s (2 s at most), in outcome language.** The first thing seen or heard is what the viewer gets, or the tension they already feel: a claim in 4 words or fewer, or the product doing its thing. Never a logo sting, "Introducing…", "Meet…", a company description, a feature name, an API name, or an inventory number ("23 files changed"). Numbers only with stakes ("40% faster cold starts"). Films of 30 s or less show the product or brand by 2–3 s. The viewer understands what kind of film this is by second 4.
2. **Value before evidence.** The value claim lands by beat 2; features follow as evidence of it. Self-check: delete the evidence beats, and the film must still state its value; delete the value beats, and if the film still seems to work, it was a feature tour.
3. **Show the real product; never invent.** No invented UI labels, claims, numbers, prices, testimonials, customer logos or version numbers. Run the **grounding pass** (Quality gates, step 1) on every visible string. Prefer real screenshots and captured assets over rebuilt UI; rebuild only the component that has to move, matched to the screenshot. Stylizing, compressing and abstracting are allowed; showing a capability the product lacks never is. Mock data is plausible and product-specific (never "John Doe", "Acme", lorem ipsum, famous names).
4. **One idea per frame.** One focal point, one meaning, 6 readable words at most on screen (aim for 1–4). If a scene needs "and" to explain its job, split it. The film has **one** tagline, stated once or twice (setup and payoff), not one per scene.
5. **The product doing its thing beats describing it.** A real click that produces a real result beats a feature label. Frame the part of the UI where the action happens. A UI demo is a sequence of 3 or more states on the same surface (input → response → result → benefit), not one isolated frame. When the product can't be shown doing something (an API, infrastructure), animate a diagram of its mechanism (a retry lifecycle, serial → parallel lanes), never a glowing orb.
6. **A spine and a motif.** Name before building the one device that threads the film: a persistent shape, a cursor, a hero prop, a rising number, a last frame that equals the first. Take one visual motif from the product itself (a gesture, a shape, an interaction) and reuse it at least 3 times. Viewers should remember the product, not "the aesthetic".
7. **One spectacle beat, restraint everywhere else.** Name the single moment that gets the biggest move, the signature transition and the hero sound. Emphasis is contrast: uniform energy reads as flat.
8. **Choices come from the brief, the brand and a named reference, never from avoiding a list.** The post-purple default (cream background, rust accent, italic serif with a highlighted word, tracked-caps eyebrows, ticker bars) is already called "the Claude look". A banned list only moves the default. Derive every visual choice from the chosen style and the product's own material, and rotate away from your recent picks.

---

## 2. Timing, pacing and readability

| What | Rule |
|---|---|
| Frame 0 | Already designed and postable (it is also the thumbnail). No fade from black, no empty frame, no lone dot. First visible motion within 0.2 s of the film's start and of every scene's start. |
| Reading time | Every line stays fully on screen and readable for **0.6 s + 0.4 s per word, 1.2 s minimum** (4 words: 2.2 s; 6 words: 3.0 s). The key message reads for at least 2 s. A small label meant to be read: at least 0.8 s. Never ask for more than 3 words per second. While a line is read it keeps a slow carry on the axis it will leave by (it never parks, and its letters never re-animate). Only one text block enters at a time. If it doesn't fit, cut words; never speed the text up. (`slop.mjs` flags anything under 0.6 s + 0.4 s per word.) |
| Fast in, then carry | An entrance completes in 0.3–0.6 s, then the element keeps moving the way it will leave (a slow slide toward the film's direction, or a steady recede) while it is read, and its exit continues that move. Never re-animate the letters of a line being read. |
| No dead air | **Something meaningful changes every 1.5–2.5 s** (the tempo), and no still stretch reaches 0.8 s anywhere outside the end card (`motion-gate.mjs` freeze; `slop.mjs` dead-air). A meaningful change: a new element, a state change, a cursor action, a live data tick, a camera move that goes somewhere. Decoration (breathing, floating, drifting particles) does not count and is banned. Holds are reading time only, and they still carry secondary motion. The end card holds at most 1.5 s still after its last move. |
| Not too busy | The opposite failure is "pause is lava": plan an **energy curve** with at least one calm stretch (a shot of 3 s or more with one mover) and one peak. At most 3 elements in motion at any instant, background included. |
| Sequential reveal | Each element appears when the voiceover reaches it or on its beat, one cue per element, nothing before its cue. Spread reveals across the scene so the last lands in its back half. Front-loading (the whole layout on screen in the first 25% of the scene, then it sits) is the PowerPoint failure. |
| Beat grid | With music, work on the track's analysed bar grid (sound.md); before a track exists, plan at 120 BPM. Structural cuts on downbeats or up to 2 frames early; most cuts on a beat, never every beat (evenly spaced cuts feel off). Change shot or state every 2–4 beats in launch films, every 2–3 in reels; something visibly moves on most beats. |
| Rhythm | Declare it before building ("fast-fast-SLOW-fast-SIGNATURE-hold"). Never uniform: the coefficient of variation of shot lengths is at least 0.35 (`slop.mjs` warns under 0.2); no 3 consecutive shots within ±10% of each other; the slowest scene is about 3× the fastest; a film over 20 s has at least one shot of 3 s or more and one of 0.6 s or less. The reveal gets the longest shot. |
| First second | Picture designed and moving at frame 0; audio already at bed level in second 0–1 (never −30 dBFS or quieter). Trim quiet music intros. |
| End card | Name, product, one call to action (a URL or "available today"), in the style's calmest composition. The beat runs 2–3 s: its elements land in sequence (the mark, then the name, then the action), and after the last one lands it holds **at most 1.5 s still** (`motion-gate.mjs` measures it; a brief that asks for a longer hold sets `end_hold_s` in the plan). The music's button and an audio tail of 0.5 s or more. Never longer than 3 s; no black or silent tail; no "thanks for watching" or social-icon walls. |

**Length by format**

| Format | Total | Per shot or state |
|---|---|---|
| Social reel / teaser | 15 s (plus a 15 s cutdown of every launch film) | 1.2–1.7 s |
| Launch film | 20–45 s (90 s at most) | 2–4 s; beats 1.5–3.5 s (a 5–7 word line gets 2–2.5 s) |
| Explainer | 45–90 s | 3–6 s per scene, with a change inside it at least every ~1 s |
| PR video | 30–60 s | ≤ 9 s and ≤ 19 voiceover words per frame (2 exceptions at ≤ 12 s / 26 words) |
| Title / brand film | 10–30 s | 3–6 s |
| Stat or quote hit | — | 2.5–4 s |

Anything over 90 s needs a character or world bible. Too long for the idea is a slop tell; justify every scene's seconds.

**Voiceover pacing** (full rules in `references/sound.md`): 2.3–2.7 words/s (2.0–2.3 for a keynote register); words ≤ 2.5 × voiceover seconds; voiceover covers at most 80% of the film, leaving music-only moments at the cold open (1–3 s), the reveal and the last 2–3 s. Sentences of 6–10 words, 14 at most. A 30 s film carries 50 words or fewer; 60 s, 110–140. On-screen text complements the voice (a hero word, a stat), never repeats the sentence (captions do that). Every noun the voice names is on screen within ±6 frames of the word.

---

## 3. Motion

Everything obeys `motion.md` (the style's motion language: eases, duration scale, stagger, holds, bans). When it specifies a value, it wins; the rules below govern everything around it.

**Eases by role** (consistent within a role, different across roles; one ease on every tween reads as a preset):

| Role | Default | Notes |
|---|---|---|
| Enter | `power3.out` or `expo.out` | Arrive fast, land soft: most of the distance in the first third (each frame covers ~12–19% of what remains). |
| Exit | `power2.in` | About 60–70% of the entrance duration. |
| Move on screen | `power2.inOut` / `power3.inOut` | Repositioning, resizing, morphs. |
| Camera | `power1.inOut` to `power2.inOut` | Slow in, slow out. |
| Impact / slam | `power4.in` or `expo.in` into a hard stop | Impacts accelerate. |
| Linear | only constant-speed things | Tickers, marquees, progress bars, conveyor belts, an opacity split. |

**Durations.** UI micro-feedback (press, toggle) 0.12–0.2 s; the minimum real move 0.3 s; standard 0.4–0.6 s; big moves and camera 0.5–0.9 s; cinematic 0.8–1.5 s. Longer travel gets a longer duration, capped at 1.2 s outside cinematic styles.

**Reference moments: the take rule.** A reference moment (`scripts/moments.mjs`: a credited slice of a real launch film with its measured spec and code, fetched read-only into `$RUN/references/moments/<id>/`) is a finished piece of someone else's film, with its own opening, background, logo ending and frame-traced motion. Copy it in and you get its film, not yours. From each moment take **one mechanic**, written as one sentence: what moves, on which axis and in which direction, for how long, and what in it never stops moving (that continuous motion is usually why it holds attention). That sentence is the beat's `take` in the plan, and it is all you take. Build it fresh, with this film's content, in this beat's own timeline. Leave behind its copy, its brand and colours, its background, its bookends (logo openers, end plates, hard-cut tails) and its frame tables (read those only for timing: how many frames a move takes and where its speed peaks; a traced track is one move with one ease, never a replay). One storyline on one ground, with moving seams. The user's picked moments win; otherwise the Director picks 2 to 4, one per role, by mechanic fit for the scenario. Moments are used for technique only: no footage, frames, code, copy, brand or audio from one ships in the film, and every moment used is credited in `references/moments/credits.json` and in the Final's notes.

**Overshoot is never the default.** Bouncy motion is the most-named turn-off in user-made video. Allowed only when the style's motion language is elastic, springy, playful or cartoon: `back.out(1.2–1.6)`, 8% past the target at most (3–5% is usual), a single settle (no multi-bounce), one overshoot style per film, on transforms of UI and shapes only. Never on type, logos or numbers (a counter never passes its final value), and never in precise, luxurious, editorial or cinematic styles.

**No idle motion, and no scheduled stillness.** No breathing scale, floating, bobbing, pulsing, drifting gradients or infinite yoyo loops (`slop.mjs` idle-breathing; they also break seek-safety). Nor a planned freeze: a hold is reading time, and it still carries secondary motion. Aliveness comes from sequential reveal, the product's own life (typing, counting, a cursor, a notification), lines that keep their carry, and camera moves that go somewhere.

**Momentum** (`motion-gate.mjs` measures it on the draft):
- A line never parks and never creeps. Between landing and leaving it keeps moving the way it will leave (it keeps sliding toward the film's direction, or it keeps receding to about 60% of its landed size by the time its exit starts), and its exit continues that same move. Never both on one line.
- Nothing creeps. A whole-frame scale or drift slower than 4% a second (a 1.0 to 1.08 push over a whole film, a 2–4% lean-in over a shot) makes thin lines and small type shimmer. Move the camera to go somewhere, at a speed you can see, or lock it.
- A screen the viewer is reading holds its layout while its content acts (typing, rows filling, a cursor moving): that action is its motion.
- Many similar things (messages, rows, results) move as one ordered rig: a stack, a thread, a feed, a carousel. Never scattered.
- Two moves on one element overlap through nested wrappers: the second starts when the first is about 60% done.

**Entrances by the object's nature, not one preset.** Type rises through a line mask (`yPercent: 100 → 0` inside `overflow: hidden`); UI that spawns from a click scales from its origin (0.96 → 1 with the fade) at the click point; shapes draw on or grow from a `transform-origin`; images reveal through `clip-path`; hard beats simply cut in. No single entrance type on more than 30% of the film's entrances, and at least 30% of elements are simply **there** on the cut. The generic `y: 30, opacity: 0` fade-up on everything is the web default and the first tell viewers name. Opacity-only is a last resort.

**Compound properties.** One or two properties per tween that tell the same story (rise with fade, scale with fade). Never rise + rotate + scale + unblur on one element: it smears.

**One primary mover per beat.** Secondary elements follow 80–200 ms later, or stay still.

**One dominant direction for the whole film.** Forward in time or progress travels leftward (new content enters from the right); going deeper zooms in; stepping back zooms out. Never alternate directions without a story reason.

**Velocity-matched cuts.** When motion crosses a cut, cut at peak velocity with the same direction and speed on both sides (for example x 0 → −230 px on `power4.in`, then +230 → 0 on `power4.out`, equal durations). At every seam where an element continues, write the handoff numbers (x, y, scale, opacity, direction, speed) in the plan; parallel workers use them verbatim. Partial travel plus fade, never full off-screen moves for handoffs.

**Container before content.** Content enters after its container starts moving and leaves before the next morph, so text never overlaps text during a swap.

**Contrast before the climax.** Thin the motion to one slow mover for 0.3–0.8 s (with a music strip-down or silence) right before the reveal; never a frozen frame. The reveal gets the biggest move and the longest shot in the film.

**Exits.** Faster than entrances (60–70% of the duration, `.in` eases). Prefer no exits mid-film: the cut or the transition is the exit. The last element to leave dies exactly at the cut; a gap with nothing moving reads as dead air.

**Stagger.**
- Offset 0.03–0.12 s per item (2–4 frames at 30 fps), always shorter than each item's own duration so they overlap.
- A group's total stagger stays under 0.5 s regardless of count.
- Order by reading order (top-left first) or outward from the cause (the clicked button, the origin point). The hero leads when it is the subject, or lands last and holds longest when it is the payoff.
- Never stagger things that already exist. Random order is seeded and precomputed.
- A visible cascade (5 or more items) is a set piece: once per film. Otherwise reveal the group together or cut.
- Word-by-word builds follow the voiceover or the beat, not a fixed stagger.

**Motion blur.** Direction-matched, on fast moves only (a smear frame, or 4–6 averaged subframes if the renderer supports it); never blended across a cut. Blur peaks at 10 px on text and 18–20 px on full-frame surfaces (at 20 px text smears into illegibility).

**Camera shake** only on an on-screen impact, synced to an audio hit, 6 frames or less, at most 2 per 30 s.

**The cursor in UI demos** (the cursor is the protagonist; the click is the beat):
- **Oversized:** 3–4% of the short side tall (32–44 px at 1080, about twice a real cursor), in the brand ink or white with a 1–2 px contrasting outline so it reads on any surface; exact hotspot. Never the real OS cursor, browser chrome or a scrollbar.
- **Enters from off-screen,** from the edge nearest its first target, on a curved path (a gentle arc, never a straight line), 0.5–0.8 s, `power3.out`. It never materializes mid-frame.
- **Moves on arcs,** decelerating into each target, 0.4–0.7 s per move, and rests 0.1–0.2 s on the target before acting.
- **Click = the beat:** the press lands on a downbeat; the cursor scales to 0.85 and the target shows its pressed state (scale 0.97, darkened) for 0.08–0.12 s; the UI's response starts on the release frame; the click sound sits on the press frame.
- **The UI answers every action live.** Either the camera follows what the cursor touches (a focus zoom per target, see §6) or the camera stays locked and the UI moves (a panel slides in, a table fills row by row); never both in one scene.
- **Typing** at 12–18 characters/s with at most 2 natural micro-pauses, one typing sound per burst.
- **Keeps moving while it is on screen:** calm arcs toward its next target at 60–150 px/s, the next leg starting before this one lands, or it leaves through the frame edge. It never parks and never hovers aimlessly.

**Seek-safety (HyperFrames).** No infinite tweens, no `Math.random` or `requestAnimationFrame`, `fromTo` for entrances, seeded noise sampled on the integer frame index, every tween on the paused timeline.

---

## 4. Transitions

- **The cut is the baseline:** a clean hard cut on a strong frame, on the beat or up to 2 frames early. Every other transition must carry information.
- **Scene-born transitions first.** The outgoing scene makes the incoming one: a match cut (shared shape, position or color), a shared-element morph (the pill grows into the next card), a carried object (the square holds its position across a background cut), a flood that contracts into the next scene (overscaling past the corners, about 0.3 s), an iris or mask cut from an element, a camera push into a UI tile that becomes the next scene, a mask line the next words rise from. **At least half of all scene changes are continuity (scene-born) or hard cuts**, never preset swaps. This is the cure for the slideshow.
- **2–3 transition types per film:** the cut, the scene-born family, and at most one signature transition. A different transition on every seam reads as chaos.
- **One signature technique, used once** (twice at most in films over 60 s), at the biggest hinge (problem → solution, the reveal), and it belongs to the style:

  | Style family | Signature |
  |---|---|
  | Editorial, Swiss, print | mask wipe; color-field push |
  | Product depth, 3D, device | zoom-through; in real 3D, `camera-through` (one camera move crosses the cut) or `flat-to-depth` (`references/3d.md` §6) |
  | Bold, pop, neo-brutalist | hard color-block wipe; flash frame |
  | Acid, cyber, glitch | glitch cut, 4–8 frames (only if the concept is glitch) |
  | Collage, paper, zine | paper tear; cut-out slide |
  | Stop-motion, handmade | stepped cut on twos |
  | Cinematic, film | whip pan; light-leak burn |

- **Choose the move by meaning:** cut-the-curve (the phrase continues across the seam) for an unfinished thought; zoom-through for a state change or going deeper; inverse zoom (pull back) for arrival, payoff and context; a push along the film's direction for progress; a smash cut or 1–2 frame flash for a hard tonal break.
- **Never crossfade by default.** Dissolves only for time passing or mood in cinematic, documentary or luxurious styles (0.5–1.0 s), and never between two busy layouts (two superimposed UIs are mud): cut, or clear one layout first. No blur-ins, fades up from black between scenes, generic slide-ins, 3D flips or particle bursts. Fade to black only at the very end or at a hard structural break, 0.5 s or less.
- **Numbers.** Zoom-through: exit scale 1 → 1.2 on `power3.in` in 0.2 s with opacity on a separate linear tween, hard cut at opacity 0.15, entry 0.75 → 1 on `expo.out` in 0.5 s. Whip pan: 0.15–0.3 s `expo.inOut`, horizontal blur peaking around 40 px, cut at the blur peak. Wipes 0.35–0.5 s `power3.inOut`. Durations otherwise from the motion language: snappy or precise 0.25–0.4 s, smooth 0.4–0.6 s, cinematic or luxurious 0.8–1.2 s.
- **Seams move.** At every cut the outgoing beat is still moving when the cut lands and the incoming beat arrives already moving, on the same axis, in the same direction, at the same speed. Never settle and then cut, never start from rest, never hard-cut to a frozen frame (`motion-gate.mjs` fails a seam with either side at rest).
- **Carry at least two seams** with one object that crosses the cut and becomes part of the next beat (a card grows into the next screen, a word becomes the button label, the mark travels into the end card). The carrier lives in the root, on its own track, as one object on one tween.
- **No pops.** Continuing elements keep the promised position, scale, opacity, direction and speed across every cut (checked in the Quality gates).
- Obey `motion.md`'s bans. Set `transition_default` (usually `cut`) and per-scene `transition_in` for the hinges.

---

## 5. Composition and type

**Build each frame around one thing.** Decide what the viewer notices first; everything else supports it or goes. Squint test: blurred, the number-one element still stands out. Hierarchy through at least 2 of: size (3:1 or more), weight (800 against 400), contrast, position, order of motion.

**Scale.**
- The primary visual covers at least 40% of the canvas.
- UI as the subject fills at least 60% of the frame width (zoom in, screen-studio style); when type is the subject, the hero line spans 60–80% of the width.
- Negative space has a job: type-led frames keep at least 40% empty. A frame that is mostly an empty flat field with nothing happening is sparse, not minimal: add scale or a second plane (unless the style is deliberately minimal).
- At most 2 effects per element (a shadow and a mask, never shadow + glow + blur + stroke).

**Type sizes** (percent of the short side; px at 1080):

| Role | Size |
|---|---|
| Hero word or number | 12–20% (130–216 px) |
| Display line | ≥ 8% (≥ 86 px) |
| Readable text, 16:9 | ≥ 3.5% (≥ 38 px) |
| Readable text, phone-first (9:16, 1:1, 4:5) | ≥ 4% (≥ 44 px) |
| Anything smaller | texture only (details inside a screenshot); never carries the message |

At least 3 clear sizes in the system, display at least 2.5× the body, at least 2 weights. No font-size under 24 px without a reason. Borders 2–4 px.

**Safe areas.**
- 16:9: text at least 5% in from every edge (96 px at the sides, 54 px top and bottom); key text 80 px from the sides and 100 px from top and bottom at 1080.
- 9:16: keep the top 12% and the bottom 20% free of message-carrying text (platform UI) and the sides 6%; with burned-in captions, content lives in the top 83%.
- 1:1 and 4:5: 6% on every side.
- Design for the format from the start; never plan landscape and crop to portrait.

**Vary the layout: no template reuse.** No layout in more than 2 consecutive scenes. Across the film use at least 3 of: centered or symmetric, rule of thirds, split, asymmetric 60/40 or 70/30, full-bleed, layered depth (foreground, middle, background with one occluder), triptych or strip, frame within a frame. At most about 40% of scenes are center-composed. A deliberate grammar with a fixed anchor (headline left, UI right, mascot in a corner) is allowed, but then content, scale or color changes every scene. Centered text floating on a gradient is not a layout: anchor to the edges and the grid. The same polished template repeated reads as a template even when each frame is good.

**Grid.** One grid and one set of margins for the whole film; things that travel across scenes stay on the same lines.

**Type.**
- At most 2 families: display plus UI or body (a mono only when the style calls for it). Weight contrast, such as 300 against 800.
- Tracking: display −0.03 to −0.05 em; body 0 to +0.01 em; small caps labels +0.06 to +0.1 em. Tabular figures on every counter.
- About 35 characters per line at most, 2 lines per block at most.
- Sentence case for headlines and supers. Caps labels at most 2 per film; italic or highlighted-word emphasis at most once; tracked-caps eyebrows at most twice.
- No reflex fonts: Inter, Roboto, Arial, system-ui and Space Grotesk only when the brand uses them. The type pairing comes from the style (frame.md) with a stated reason.
- Proof every string; check stills for clipping, widows and kerning. All type is set as type, never rendered by an image model.

**Color.**
- One canvas, one ink, one accent, plus at most 2 section colors used as full-bleed punctuation on the beat. The brand color is sacred; its application is yours.
- Ration the accent to 10–15% of the frame area, on the one thing that matters (the button, the number, the success state).
- No large pure #000 or #fff fields unless the style says so. No full-frame linear gradients on dark grounds (they band under H.264; if one is needed, dither it with 2% noise). No gradient on type, and at most one gradient surface per frame.
- Text contrast at least 4.5:1 (3:1 for display type of 48 px and up), mid-transition included.
- Never fade black straight into the accent color; carry an accent element across instead.

---

## 6. Camera, lighting and texture

**Camera moves are motivated:** push in toward what matters, pull back to reveal context, track to follow an action; otherwise stay locked or cut. One move per shot; move or hold, never both drift and animate. Camera moves transform only the `#world` wrapper; objects animate inside it.

**Zoom tiers** (name the tier per shot in the plan):

| Tier | What | Numbers | When |
|---|---|---|---|
| T0 locked | no world transform | — | text-heavy frames, UI where the UI itself moves |
| T1 push | a push that goes somewhere | 6–15% over 0.8–1.5 s toward the subject, `power2.inOut` or `expo.inOut`, then locked (at least 4% a second: a 2–4% lean-in over a whole shot is a creep, and the motion gate fails it) | image and hero shots, toward the thing that matters; never while small text is being read |
| T2 focus zoom | screen-studio zoom into a UI region | 1.3–2.5× so the action fills ≥ 60% of the width, 0.6–0.9 s `power3.inOut`, then hold locked | each UI beat; back to 1× before the next target or the cut |
| T3 crash zoom | impact punch-in | 1.5–2× in 0.15–0.25 s `expo.in`, optional 1–2 frame flash | once per film, on the spectacle beat |

A dolly (per-layer depth factors, parallax) feels spatial; a zoom (uniform scale) feels flat and graphic. Choose by style. When the scene needs real space (an object to turn, layers in depth, a camera that travels, a flat card that becomes an object), build it in real 3D with Rasan3D: a lens in mm, camera legs that land, one motivated key light, true motion blur and depth of field (`references/3d.md`). The camera language above still holds there; the tiers become real camera moves. When the style has depth, use 3 planes (background ×0.2, content ×1, foreground ×3–6) and at most one heavily blurred foreground occluder (20–30 px) that actually passes in front of the content.

**Lighting is a design tool, even in flat graphics.** Every scene has one named, motivated source with a direction and a color ("key from upper-left, warm #ffd9a8; cool rim from behind right"), and every gradient, highlight, rim and shadow agrees with it. Flat-graphic styles have no light model, but their shadows still share one direction. Pick the light from the taxonomy's `lighting` dimension (the style's pick, or Claude's from the style when unpicked) and build it with the recipes in `references/vocabulary.md`: a key is a directional gradient overlay at 8–18% soft-light, a rim a 1–2 px inner highlight on the far edge, a specular sweep one pass of 0.4–0.8 s at a landing. Glow or bloom at most once per film, on one hero element, for 2 s or less, motivated by a source or a "power on" beat; never on body text or UI chrome.

**Grade.** One grade for the whole film (the `color-grade` dimension), decomposed into parameters (white balance, black point, roll-off, curve, saturation, split tone, grain, halation) and applied to the world wrapper, or to the photo and footage layers only when it would push the logo, UI or brand accent off-brand. A grade that changes between scenes needs a story reason (a flashback, a before/after).

**Texture, sparingly, with numbers.**
- Grain: 3–6% (felt) or 8–12% (visible); a static tile attached to the artwork, or a seeded per-frame re-roll. Never a frozen full-frame grain over moving graphics (it reads as a dirty screen).
- Halation: red-orange, 6–20 px blur, highlights only, 20–40% screen.
- Bloom: a blurred copy of the bright layer at 30–60% screen, on emissive elements only.
- Vignette: radial, 20–35% multiply.
- Chromatic aberration: 1–3 px, at the frame edges, for 2–6 frames on an impact; never over readable text.
- Light leak: only as a transition in warm or analog styles.
- One texture layer unifies a long film; never more than two effects stacked at once.

---

## 7. Sound (the rules in brief; full playbook in `references/sound.md`)

- **Never ship silent** unless the brief says so. A screen recording is not a deliverable.
- **Music is edited to picture:** analyse BPM, bars and sections; snap scene boundaries and key moments to bars (the picture flexes, the music doesn't; the film length is a target within ±½ bar). Start on a strong section so the first second is at full bed level. End on the track's own ending or a button (a final hit plus a tail of 2 s or less); a fade-out is the last resort; never loop anything under 8 bars. At least 50% of structural cuts sit on downbeats.
- **The reveal lands on a downbeat or the drop** (±1 frame), after a 0.5–1 s strip-down or silence. The logo lands on the ending hit.
- **SFX only for visible, causal events** (a click, a landing, a snap, a state change, the hero reveal), on a budget. Voiceover films: 1 per 2 s on average at most, 3 onsets in any 1 s window at most, 1 hero hit per 15 s. Whooshes only on a signature spatial transition: at most 1 in 3 transitions and 1 per 20 s (zero is fine). No sound on fades, text builds, stagger items, color changes or ordinary cuts; leave at least a third of visual events unsounded, and skip any event the music already hits. Each sound is placed by its measured sync point on the contact frame; audio never leads the picture by more than 1 frame. Rotate at least 3 variants of any repeated sound.
- **Mix:** music under voiceover at VO −12 LU (±3), measured; master at **−14 LUFS integrated (±1)**, true peak −1 dBTP or lower on the encoded MP4, LRA at most 6–9 LU. The last frame is silent; no silent or black tail.
- **Voice:** TTS draws the most hostile reactions of any tell. For films of 30 s or less that play muted in feeds, prefer no voiceover (type carries the message). When there is TTS, write for the ear (short clauses), give a pronunciation list, check every line by ear and transcribe it back.
- **Music search** names genre, instrumentation, production and BPM; never "corporate", "inspirational", "uplifting", "motivational", "ukulele", "whistle" or "keynote".

---

## 8. Story (the concept engine in `references/story.md`; the writing in `references/script.md`)

- **The cliché arc is banned as a default:** hook stat → problem montage → "Introducing X" → three features → CTA (the median launch video). Use it only when justified (a loved brand where craft is the message, offered as the "Sure" pitch with craft-forward execution), and say so in the reason. Even then, name one structural deviation the product justifies.
- **One idea in one sentence** (a borrowed form, one metaphor, one rule about time or camera, an unexpected protagonist), built from the product's own material. Swap test: put a competitor's name in; the concept must break. Features appear inside the idea as evidence: at most 3, each demonstrated, never listed.
- **A named turn at 60–75%**, the device readable by second 4, and an ending line or image that could stand alone as a poster.
- **One job per scene**, traceable to the message; cut anything the viewer can't read, see or hear at speed. No prompt-box opener for AI products; no stock metaphors (the handshake, the globe) without a product-specific twist.

---

## 9. Anti-slop

Every tell is a default left in place, uniformity, an effect without a cause, or a claim without specifics. Each row: the tell, then what to do instead. `slop.mjs` checks the ones it can (rule ids in brackets); the critic checks the rest. Any rule can be overridden by the brief or DESIGN.md with the reason written down.

**The Opus house style** (the showreel look everyone re-ran; take it only knowingly, as a chosen direction)

| Tell | Instead |
|---|---|
| Lone centered dot or ring opener | Open on the hook: the product, the tension, the first word of the claim. |
| Corner HUD labels: timecode, BPM, "01 — IDENTITY", crop marks, frame borders, progress bars [corner-labels] | No chrome unless the style is a HUD, broadcast or telemetry style that means it. Put the detail into the content. |
| Extended heavy grotesk plus an italic-serif "accent word" | The style's own pairing; one emphasis device, once. |
| Orange / cream / electric blue / black with hard switches | The style's palette; full-bleed switches only in its own colors. |
| Particle galaxy or torus, 3D cube-grid wave, truchet tiles [particles] | One element from the story that moves for a reason. |
| The three.js demo: a lone object spinning in a void, a constant-speed orbit, flat light with no rim or shadow, a torus knot, rainbow normals, a neon grid floor [stage3d: linear-drift, never-rests, stock-primitive, placeholder-material] | The product or the film's own object, blocked at real scale, one motivated key, a lens chosen for the shot, camera legs that land and hold (`references/3d.md`). |
| "Name." lockup with a colored period | The brand's own lockup. |
| Centered text on a soft gradient or blurred-blob background [centered-everything] | Anchor to the grid; a flat field or the style's surface; asymmetric layouts. |
| The post-purple "Claude look": cream ground, rust accent, italic serif with a highlighted word, tracked eyebrows, ticker bars | Not a fallback palette. Italic or highlighted emphasis once per film at most; no ticker unless the idea is literally a feed. |

**Look**

| Tell | Instead |
|---|---|
| Neon glow text, "everything glows" [neon-glow-text] | Emphasis from size, weight, color and position. Glow at most once per film, ≤ 2 s, motivated. |
| Purple-blue "AI" gradients (hue 230–290°), gradient text [ai-gradient] | The style's palette; flat fields plus texture; one gradient surface per frame, between two adjacent brand colors. |
| Glowing orbs and brains, holographic panels, ✨ sparkles, emoji as icons | The product's real output. Icons from one drawn set that matches the brand, or none. |
| Bokeh, lens flares, floating dust with no source [particles, lens-flare] | Nothing; atmosphere only from a motivated light source (see Lighting). |
| Glassmorphism on everything | Off by default; if the brand uses it, one glass surface per frame, blur ≤ 12 px, no text over busy blur. |
| Cards in cards, pills and badges, left-border accent stripes, default 12–16 px radius | No nested containers; at most 3 rounded boxes visible; the radius comes from the brand; type sits straight on the field. |
| Floating glossy phones, dashboards in a void at 30°, isometric floating cards, 3D icon packs | The real UI full-bleed or cropped tight; a device frame only when the context of use matters. |
| Three feature cards sliding in, "How it works" icon rows, stepper bars, stats rows, logo walls | One feature as a weapon inside a scene; data as one visual carrying one number. |
| Over-saturated, over-contrasted "crisp" HDR finish; teal-orange by reflex | A grade from the direction with a reason; natural saturation. |
| Everything filled edge to edge; ten stacked effects | One focal point; ≥ 40% negative space on type frames; ≤ 2 effects per element. |
| Inter or system sans everything; one size, one weight [default-type, too-many-typefaces] | The style's pairing; 3 sizes, 2 weights. |

**Motion**

| Tell | Instead |
|---|---|
| Everything fades up and slides in on the same ease | Entrances by the object's nature; no entrance type on > 30% of entrances; ≥ 30% of elements present on the cut; eases by role. |
| Everything moves at once, then everything freezes | One primary mover, secondaries 80–200 ms later; ≤ 3 movers at once; fast in, then a slow carry; the next event within 1.5–2.5 s; no still stretch of 0.8 s [motion-gate freeze]. |
| Bouncy or elastic by default | `power3.out` / `expo.out`; overshoot only in playful styles, ≤ 8%, single settle, never on text. |
| Idle breathing, floating, pulsing loops [idle-breathing] | A meaningful change, and lines that keep their carry. |
| Camera drifting for nothing; slow Ken Burns on everything; a slow film-wide push [motion-gate creep] | Moves that go somewhere, at 4% a second or faster, one per shot; otherwise locked. |
| Spinning or flipping logos [spinning-logo] | The logo resolves from brand geometry (strokes draw, parts assemble, a product-shaped mask) in 1.5 s or less, once (the one brand reveal), then travels into the end card or holds at most 1.5 s. |
| Camera shake, glitch or RGB split as "impact" | Only on an on-screen impact synced to a hit, ≤ 6 frames, ≤ 2 per 30 s; glitch only when the concept is glitch. |
| Front-loaded layouts that then sit (the PowerPoint look) | Sequential reveal on cues. |
| A crossfade between every scene, or a different transition on every seam | The cut, scene-born transitions, one signature; ≥ 50% of changes are continuity or cuts. |
| Counters that overshoot, or count up from 0 to a small number | Count to the value on `expo.out` with tabular figures; never past it. |
| Stagger cascades as "delight" everywhere | One cascade set piece per film. |
| Too fast, too busy, no high or low points | An energy curve with one calm stretch and one peak. |

**Copy**

| Tell | Instead |
|---|---|
| Hype words: seamless, revolutionize, unlock, supercharge, elevate, empower, effortless, next-level, cutting-edge, game-changing, robust, AI-powered, "the future of", "in today's fast-paced world", "no fluff", delve, pivotal, showcase [generic-copy] | The specific outcome in the product's own words; every headline carries a concrete noun, verb or number. |
| "Introducing…", "Meet…", "Say hello to", "Welcome to X" [introducing-opener] | The hook. |
| "It's not X, it's Y"; "No A. No B. Just C." | Zero per film. |
| Weightless triads ("Fast. Simple. Powerful.") | At most one per film, only with three concrete, unequal items. |
| Em dashes and exclamation marks in short on-screen lines [em-dash-copy, hype-punctuation] | A full stop or a line break. |
| Title-case "vaguely inspirational" headlines | Sentence case; say what it does and for whom. |
| Seven slogans (a tagline per scene) | One tagline, set up and paid off. |
| Leaked context: implementation notes, the brief repeated, "Built with…" | Delete any line that doesn't answer "who is this for?". |
| Frictionless sentences with nothing specific | At least one concrete human detail (a real moment, a number with units, a named place or time); vary sentence length. |
| Text gone before it can be read; too many words; body text at 1.5–3% of the frame [unreadable] | The reading-time rule; ≤ 6 words; the size floors. |
| Placeholders, invented UI labels, fake stats, "Sarah Chen" testimonials, "Trusted by 10,000+" [placeholder] | The grounding pass: only sourced strings. |

**Sound**

| Tell | Instead |
|---|---|
| A whoosh on every cut [whoosh-per-cut] | Whooshes only on the signature spatial transition (≤ 1 in 3 transitions, ≤ 1 per 20 s). |
| A sound for every motion (Mickey-Mousing), machine-gun clicks [sfx-overload] | Causal events only, on the budget, ≥ ⅓ unsounded, ≥ 3 variants. |
| Looping music, a bed shorter than the film, an audible seam [music-loop] | A longer track or an edit by structure on bar lines. |
| Silent films, quiet openings (−30 dBFS in the first seconds) [loudness] | Full bed level in second 0–1; −14 LUFS. |
| Abrupt endings mid-phrase, long generic fades, black or silent tails [no-end-hold] | The track's own ending or a button on a 2–3 s end card (at most 1.5 s of it still) with a tail. |
| Ukulele, whistles, claps, glockenspiel, "inspirational" piano, keynote minimal house | A music brief naming genre, instrumentation, BPM and a reason. |
| Music over the voice; a robotic TTS read; a voice that contradicts the picture | VO −12 LU; see-and-say sync; TTS checked by ear, or no voice. |

**Structure**

| Tell | Instead |
|---|---|
| Logo cold open; a company description as the opener [slow-hook] | The hook in 1.5 s; the logo opens only if the brand itself is the news. |
| The cliché 10-scene arc | `references/story.md`; one idea, a turn, a named deviation. |
| The same layout every scene | Layout variety (§5). |
| Uniform shot lengths [uniform-shots] | Rhythm (§2). |
| Opening on black [black-open] | A designed, postable frame 0. |
| End card over 3 s, or still for more than 1.5 s; "thanks for watching"; social-icon walls | 2–3 s, one call to action, at most 1.5 s still. |

**What reads as made, not generated** (ask for these; the critic checks for them): specificity over category (real UI, real data, numbers with units); one idea and one product-derived motif; a point of view, even humor or a risk; restraint (fewer effects, fewer movers, sounds only where they count); a visible human decision or imperfection left in on purpose; real texture and real sources (real photos, recorded sound); rhythm with dynamics (high and low points, cuts on the phrase); named references instead of adjectives; legibility and calm; honesty.

**Don't overcorrect.** Keep the clarity conventions (reading order, legible UI, a call to action at the end); deviate on voice, motif, palette, sound and structure. A film that avoids every item above but looks like the last three RasanAI films is its own house style: rotate.

---

## 10. Quality gates

Run these before the render question, in order. Never report a gate as passed if it could not run.

1. **Grounding pass.** List every visible string, number, price, name and logo in the built film with its source (the capture, a screenshot, the brief, the truth sheet's native words and proof). Anything without a source is removed or replaced with a sourced one; an open question goes to the console (`console.mjs ask`), never into the film. Also check for leaked labels and placeholders.
2. **Look at the frames yourself.** Render stills at frame 0; mid-scene (60–70% into each scene); mid-transition (each seam's midpoint); 0.1 s before and 0.2 s after every cut; and the final frame. **Read the PNGs.** Check: the focal point is obvious (squint test); type sizes and safe areas; no text collisions, clipping, widows or typos; contrast; one accent; layout variety across the sheet; no pop across cuts (continuing elements keep position, scale, opacity and direction); nothing from the Anti-slop tables. Without this loop the output is confident garbage.
3. **Automated checks.** `node scripts/obey.mjs --project videos/<name>` (the motion contract); `node scripts/stage3d.mjs check --project videos/<name>` (every 3D scene: seek-safe, not blank, eased on the contract, blurred where it moves, comes to rest, renderable); `node scripts/slop.mjs --project videos/<name> [--video <render.mp4>]` (these tells, reading time, dead air, black opening, loudness); `node scripts/motion-gate.mjs --video <draft.mp4> --project videos/<name> --plan <run>/motion/score.json` (the film keeps moving, measured frame by frame: visible motion in at least 75% of frames, no still stretch of 0.8 s outside the end card, at most 1.5 s still at the end, no whole-frame scale or drift slower than 4% a second, motion on both sides of every seam within 0.2 s, at least two seams carried by an object, exactly one brand reveal, no parked lines); the sound checks in `references/sound.md` (loudness, true peak, SFX budget, sync, tail). Fix every error; only the user can waive one.
4. **Clean-context critic.** Dispatch the crew's critic (`agents/critic.md`, lenses `frames`, `motion`, `grounding`, `film`; `crew.mjs brief --role critic --key <lens>-<round>`), a subagent with no conversation history. Give it only the stills and contact sheet, the draft render, the motion gate's report on it, the plan, the film's one-sentence message and this rubric. The motion and film lenses never judge without the render and the gate's report. It **defaults to reject** and scores 1–10:
   - **Design:** composition, hierarchy, type, color discipline, layout variety.
   - **Readability:** at phone size, reading time, contrast.
   - **Narrative:** hook in 2 s or less, value before evidence, the turn, the device clear by second 4, the ending.
   - **Brand:** real product, exact colors and fonts, the grounding pass holds.
   - **Motion and sound:** eases by role, no idle motion, cut sync, SFX causality; in 3D, lens, light and camera legs that land, and 2D ↔ 3D seams that match.

   It returns the 3–5 worst problems, each with a timestamp or frame number and an exact fix ("the card lands 6 frames early; delay it to frame 44"). Ship when every score is 8 or more. At most 2 fix passes; anything left goes to the render gate as fix-or-waive.
5. **Report the gates** in the render-gate message: obey, stage3d, slop and sound status, the critic's scores, and any waivers.

---

## 11. Reporting decisions

Every Claude-decided step is pushed `--status done` with a `decision` a person can read at a glance: **one plain line, then the reason tied to this film**, with the proper term in brackets for the brief. Format: `<what, in plain words> (<term>): <why, for this film>`, about 20 words at most. Examples:

- `Hard cuts, with one mask wipe at the reveal (cut; mask wipe): editorial style, and the wipe mirrors the page turn in scene 4`
- `Lit by the product's own screen in a dim room (screen glow): it keeps the app the hero of the late-night story`
- `7 scenes, 34 s, the reveal holds longest (pacing): the reveal carries the claim`

- Report what a person could have an opinion on: the route, scenes and length, pacing and rhythm, transitions, camera, lighting and grade, the sound plan, the cursor and UI treatment, and **any rule in this file you broke on purpose, with why**. Don't report eases, staggers and pixel values; they live in the brief.
- After a "you decide", add the receipt: what was picked and the obvious option passed over.
- A `note` on a decision gets a `reply` in the console; make the change, re-push the step, and say what changed.
