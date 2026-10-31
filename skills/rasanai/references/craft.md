# Craft: the playbook for every decision Claude makes without asking

The user decides **taste**: the brief, the film (its style and its story), notes on the animatic, and the final. Everything else is **craft**, and Claude decides it the way a senior motion designer would: without a question, following this file, and reporting each call in one plain line (see **Reporting decisions**) so any of it can be changed with a note. If a decision would need expertise to answer (which ease, which transition, how long a scene runs), it is not a question.

**Precedence.** The project's brand (DESIGN.md) wins, then the chosen style (its `stack`, `recipe`, `DIRECTION.md` and `motion.md`), then this file. When the style overrides a rule here (a stop-motion style wants stepped cuts; a neon style wants glow), follow the style and say so in the decision's reason. Never override a rule silently. **One exception: momentum.** The motion gate (`motion-gate.mjs`) wins over every style card, brand film card and direction: a hold a style asks for ("hold 2 s", "long holds", "nothing moves") is reading time, and it still carries secondary motion; no still stretch reaches 0.8 s, nothing creeps, and the end card holds at most 1.4 s still.

**Units.** Numbers assume 30 or 60 fps (an authored duration is the portable form: a frame count from a 60 fps recipe becomes seconds, or is frame-locked at the film's actual rate, `scripts/lib/ref-principles.mjs` `normalizeRecipeUnits`; a pixel value names its reference dimensions and is rescaled as a fraction of that axis, never pasted into a 24 fps vertical film). Sizes are given as a percentage of the frame's **short side** (1080 px in 1920×1080, 1080×1920 and 1080×1080), so they hold in every aspect. For turning any term here into code (a whip pan, halation, a split tone), use `references/vocabulary.md`.

**Why this file is strict.** Viewers don't reject AI; they reject **decisions nobody made**: defaults left in place, uniformity, effects without a cause, and claims without specifics. The most common verdict on Claude-made launch videos is "it's just a PowerPoint". Every rule below exists to put a made decision where a default would be.

---

## 1. Principles

1. **Hook in 1.5 s (2 s at most), in outcome language.** The first thing seen or heard is what the viewer gets, or the tension they already feel: a claim in 4 words or fewer, or the product doing its thing. Never a logo sting, "Introducing…", "Meet…", a company description, a feature name, an API name, or an inventory number ("23 files changed"). Numbers only with stakes ("40% faster cold starts"). Films of 30 s or less show the product or brand by 2–3 s. The viewer understands what kind of film this is by second 4.
2. **Value before evidence.** The value claim lands by beat 2; features follow as evidence of it. Self-check: delete the evidence beats, and the film must still state its value; delete the value beats, and if the film still seems to work, it was a feature tour.
3. **Show the real product; never invent.** No invented UI labels, claims, numbers, prices, testimonials, customer logos or version numbers. Run the **grounding pass** (Quality gates, step 1) on every visible string. Prefer real screenshots and captured assets over rebuilt UI; rebuild only the component that has to move, matched to the screenshot. Stylizing, compressing and abstracting are allowed; showing a capability the product lacks never is. Mock data is plausible and product-specific (never "John Doe", "Acme", lorem ipsum, famous names).
   **Real numbers on screen:** every number shown (not inside a `data-ui` mock; plain integers up to 10, years and times excepted) comes from `research/claims.json` (or `*.claims.json`, truth sheet, chosen script, intent, brief.json). `number-not-in-ledger` (slop, warning) names the string and the time. Count-ups are judged on the settled value.
4. **One idea per frame.** One focal point, one meaning, 6 readable words at most on screen (aim for 1–4). If a scene needs "and" to explain its job, split it. The film has **one** tagline, stated once or twice (setup and payoff), not one per scene.
5. **The product doing its thing beats describing it.** A real click that produces a real result beats a feature label. Frame the part of the UI where the action happens. A UI demo is a sequence of 3 or more states on the same surface (input → response → result → benefit), not one isolated frame. When the product can't be shown doing something (an API, infrastructure), animate a diagram of its mechanism (a retry lifecycle, serial → parallel lanes), never a glowing orb.
6. **A spine and a motif.** Name before building the one device that threads the film: a persistent shape, a cursor, a hero prop, a rising number, a last frame that equals the first. Take one visual motif from the product itself (a gesture, a shape, an interaction) and reuse it at least 3 times. Viewers should remember the product, not "the aesthetic".
7. **One peak, a small budget, restraint everywhere else.** The peak (the intent's `peak: true` beat) gets the biggest move, the signature transition and the hero sound; the importance-3 beats get the rest of the budget (about 2 to 4 big moments per 30 s); importance-1 beats are calm. Emphasis is contrast: uniform energy reads as flat, and so does a big moment on every beat.
8. **Choices come from the brief, the brand and a named reference, never from avoiding a list.** The post-purple default (cream background, rust accent, italic serif with a highlighted word, tracked-caps eyebrows, ticker bars) is already called "the Claude look". A banned list only moves the default. Derive every visual choice from the chosen style and the product's own material, and rotate away from your recent picks.
9. **Every beat buys something, and few beats are the point.** The argument is written once, before any board, in `story/intent.json` (`references/intent.md`): a proposition and, per beat, `buys`, `relation`, `importance` and one `peak`. Each beat carries one line, "this beat buys ___": what the viewer gains (a belief, a fact, a feeling, a reason to keep watching), written as a change in the viewer, never an effect ("buys visual interest" is no purchase). Delete the beat; if the viewer loses nothing, cut it or merge it into its neighbour; if the line needs "and", split the beat. Then give each beat an importance of 1, 2 or 3: **at most about 25% of beats are importance 3**, and those get the scale, the camera move, the sound and the hardest work; importance 1 is small and quick. Animating every beat as if it mattered is the tell, because then nothing arrives. Motion is then chosen from that meaning ("Direction from meaning", section 4). (Ideas adapted from motionmaxxing, Apache-2.0.)

---

## 2. Timing, pacing and readability

- **The hook:** first motion by 0.5 s, first meaning (a readable line, the product, a UI, the brand mark) by 2 s. `slow-hook` (slop; DOM for the meaning, `--video` for the motion) and `black-open` (black for 0.2 s or more at the start; was 0.4) are warnings.

| What | Rule |
|---|---|
| Frame 0 | Already designed and postable (it is also the thumbnail). No fade from black, no empty frame, no lone dot. First visible motion within 0.2 s of the film's start and of every scene's start. |
| Reading time | Every line stays fully on screen and readable for **0.6 s + 0.3 s per word, 1.2 s minimum** (4 words: 1.8 s, so held 2.0 s; 6 words: 2.4 s). This is the one formula (`scripts/lib/reading.mjs` `readTime`): the plan-level checks (`slop.mjs` on scenes.json, `story.mjs` on the beats) take it as is; the render-level check (`textfit.mjs` `text-too-brief`, on the frames) allows 15% slack (x 0.85), so a line a few frames short reads and one held half its time does not. The key message reads for at least 2 s. A small label meant to be read: at least 0.8 s. Never ask for more than 3 words per second. While a line is read the frame around it stays alive (the camera layer, a secondary settling late) and its letters never re-animate. Only one text block enters at a time. If it doesn't fit, cut words; never speed the text up. (`slop.mjs` `unreadable` flags a scene under the formula; `textfit.mjs` `text-too-brief` a rendered line under it.)  For what a scene's viewer must notice and in what order, with each read's own hold, see `references/reads.md` (timed `reads[]`; `scripts/reads.mjs check`). |
| Fast in, then carry | An entrance completes in 0.3–0.6 s, then the element keeps moving the way it will leave (a slow slide toward the film's direction, or a steady recede) while it is read, and its exit continues that move. Never re-animate the letters of a line being read. |
| No dead air | The story moves on at the score's tempo, and no dead stretch reaches 0.8 s anywhere outside the end card (`motion-gate.mjs` freeze; `slop.mjs` dead-air). A meaningful change: a new element, a state change, a cursor action, a live data tick, a camera move. Holds are composed: reading time with a living layer (the camera's push, the ground, a late settle), never a dead frame and never constant mechanical drift. Idle loops on content (breathing, bobbing, pulsing) are not life. The end card holds at most 1.4 s still after its last move. |
| Not too busy | The opposite failure is "pause is lava": plan an **energy curve** with at least one calm stretch (a shot of 3 s or more with one mover) and one peak. At most 3 elements in motion at any instant, background included. |
| Sequential reveal | Each element appears when the voiceover reaches it or on its beat, one cue per element, nothing before its cue. Spread reveals across the scene so the last lands in its back half. Front-loading (the whole layout on screen in the first 25% of the scene, then it sits) is the PowerPoint failure. |
| Beat grid | With music, work on the track's analysed bar grid (sound.md); before a track exists, plan at 120 BPM. Structural cuts on downbeats or up to 2 frames early; most cuts on a beat, never every beat (evenly spaced cuts feel off). Change shot or state every 2–4 beats in launch films, every 2–3 in reels; something visibly moves on most beats. |
| Rhythm | Declare it before building ("fast-fast-SLOW-fast-SIGNATURE-hold"). Never uniform: the coefficient of variation of shot lengths is at least 0.35 (`slop.mjs` warns `uniform-shots` under 0.2); and the longest shot is at least 4x the shortest (`narrow-rhythm`, 5+ shots, the end card and flashes under 0.4 s left out; also measured on the render's hard cuts), never a metronome even when the lengths differ; no 3 consecutive shots within ±10% of each other; the slowest scene is about 3× the fastest; a film over 20 s has at least one shot of 3 s or more and one of 0.6 s or less. The peak and the payoff hold longest; the beats just before the turn are the shortest (`lib/intent.mjs` `planDurations`: peak about 1.5x, payoff 1.4x, pre-turn 0.9x). |
| First second | Picture designed and moving at frame 0; audio already at bed level in second 0–1 (never −30 dBFS or quieter). Trim quiet music intros. |
| End card | Name, product, one call to action (a URL or "available today"), in the style's calmest composition. The beat runs 2–3 s: its elements land in sequence (the mark, then the name, then the action), and after the last one lands it holds **at most 1.4 s still** (`motion-gate.mjs` measures it; a brief that asks for a longer hold sets `end_hold_s` in the plan). The music's button and an audio tail of 0.5 s or more. Never longer than 3 s; no black or silent tail; no "thanks for watching" or social-icon walls. |

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

- **Avoid twinning:** two or three different elements making the same spatial move with the same start (within a frame), length and curve, each by its own tween. `twinning` (obey, warning). Offset one by 2-4 frames, vary the curve or duration, or change what it does.

Everything obeys `motion.md` (the style's motion language: its signature curves, a curve per role, the duration formula, the settle budget, holds, bans; `references/motion-md-contract.md`). The vocabulary `RasanMotion` (`runtime/rasan-motion.js`, `scripts/motionkit.mjs`) writes these rules for you. R5 (`.context/night/R5-motion-fluency.md`) measured what separates our films from the references: one curve on every move, snap-and-die moves, one thing at a time, nothing settling, durations on a grid, straight paths, dead frames. Every rule below answers one of those.

**A curve per role, never one ease for all.** At least 4 curve families per film, no single curve on more than 40% of moves (`obey.mjs`: dominant-ease, few-curves):

| Role | Curve | Notes |
|---|---|---|
| Launch (entrances, hero arrivals) | `cubic-bezier(0.05,0.7,0.1,1)` | A hard launch and a long visible glide (40% of the distance in the first 17% of the time). 0.7–1.1 s for a hero. |
| Glide (repositions) | `cubic-bezier(0.2,0,0,1)` | A soft start, a long settle. 0.5–0.9 s. |
| Expressive (big travels) | `cubic-bezier(0.4,0.14,0.3,1)` | Felt mass: a real ease-in before the travel. |
| Settle (hero landings) | `spring(0.68,12)` | 3–8% past the target and back, about 1 landing in 8; never body text or numbers. |
| Exit | `cubic-bezier(0.3,0,0.8,0.15)` or the language's exit | About 65% of the matching entrance. |
| Snap (hits, accents) | `expo.out` | A quarter of moves at most. |
| Drift (camera, ground, ambient) | `sine.inOut` or linear | 4 s or longer. |
| Linear | only constant-speed things | Tickers, marquees, progress bars, conveyor belts. |

**Durations from travel and size, not a scale.** `0.28 + 0.55 x sqrt(travel / frame diagonal) + 0.15 x sqrt(area / frame area)` seconds, clamped to 0.35–1.4 s, jittered +-8%, scaled by the language's pace; exits x0.65. A travel over 10% of the frame takes 0.7 s or more; UI micro-feedback (press, toggle) stays 0.12–0.2 s. The references keep the median move *visible* for 0.40–0.48 s and 40–50% of moves visible past 0.5 s; an `expo.out` over 0.45 s is visible for only about 0.25 s. No single duration on more than 40% of moves (`duration-grid`).

**Precedent hints.** `node scripts/moments.mjs precedent --beat <beat> --content <type> [--q text]` ranks human designers' rules from `third_party/motionmaxxing/moments.jsonl` (offline; credit and licence in that folder). Rows are model-decoded and unverified: a hint, not a rule. Read the rule and its why, not the technique name, and never let a row outrank a measured number here or the user's verdicts.

**Reference moments: the take rule.** A reference moment (`scripts/moments.mjs`: a credited slice of a real launch film with its measured spec and code, fetched read-only into `$RUN/references/moments/<id>/`) is a finished piece of someone else's film, with its own opening, background, logo ending and frame-traced motion. Copy it in and you get its film, not yours. From each moment take **one mechanic**, written as one sentence: what moves, on which axis and in which direction, for how long, and what in it never stops moving (that continuous motion is usually why it holds attention). That sentence is the beat's `take` in the plan, and it is all you take. Build it fresh, with this film's content, in this beat's own timeline. Leave behind its copy, its brand and colours, its background, its bookends (logo openers, end plates, hard-cut tails) and its frame tables (read those only for timing: how many frames a move takes and where its speed peaks; a traced track is one move with one ease, never a replay). One storyline on one ground, with moving seams. The user's picked moments win; otherwise the Director picks 2 to 4, one per role, by mechanic fit for the scenario. Moments are used for technique only: no footage, frames, code, copy, brand or audio from one ships in the film, and every moment used is credited in `references/moments/credits.json` and in the Final's notes.

**Settles are a budget, not a ban.** The references overshoot and return on 8–17% of moves; ours on 1–5%, because the doctrine banned it. A hero landing settles 3–8% past its target with one visible return (`spring(0.68,12)`, or `RasanMotion.land`); `motion.md`'s `overshoot` sets the share and the largest overshoot (precise and editorial: 15% of moves at 8%; soft languages 12% at 4%; elastic, springy, playful and character: half the moves at 25%; rigid languages, mechanical, robotic, stepped: none). Never on type being read, logos or numbers (a counter never passes its final value), never multi-bounce outside the bouncy languages, never on every element (`overshoot-over-budget`). An overshoot bigger than the language allows (a 15% hero bounce in a precise film) is a hero effect: a `score.budget` entry on that target ("Finish and budgets", section 6).

**Overlap, never sequence.** The next gesture starts while the last one settles, at 55–75% of its duration. Every primary move carries at least one secondary: a child trailing 2–4 frames with a little more amplitude, a shadow, a parallax layer at 0.3–0.6x, the camera. Two or more distinct motions in about 45% of active frames (the references: 45–60%; ours: 34%). Two moves on one element overlap through nested wrappers or one keyframed tween.

**Arcs.** A travel over 3% of the frame bends by 4–12% of its length, away from the frame centre (references: 41–75% of travels bend). A cursor moves on arcs, never straight segments.

**A living frame, composed holds.** Each shot has a camera layer on a world wrapper (a 1.5–4% push over the shot or a 0.5–1.5% of the frame per second drift, `sine.inOut`; UI references move the camera about a third of the time) or a quiet ambient on the ground. A hold is composed: the frame keeps breathing while the line is read. A dead frame (nothing moving at all) is the failure, and so is constant mechanical drift ("a line never parks" made every line slide forever; it is gone). No idle loops on content (breathing scale, bobbing, pulsing, infinite yoyo: `slop.mjs` idle-breathing; they also break seek-safety).

**Speed-softening.** An element faster than about 40% of the frame width a second softens with its speed (blur up to 6 px, or a directional trail, RasanCamera `blurTrail`); Kinso and Sovra soften about 35% of fast moves. True motion blur comes from `finish.mjs`.

**Momentum** (`motion-gate.mjs` measures it on the draft, `fluency` included):
- A screen the viewer is reading holds its layout while its content acts (typing, rows filling, a cursor moving): that action is its motion.
- Many similar things (messages, rows, results) move as one ordered rig: a stack, a thread, a feed, a carousel, on irregular offsets. Never scattered.
- A slow whole-frame push is a camera, wanted; check a 24 fps strip for shimmer on hairlines and small type (`creep` is a warning).

**Entrances by the object's nature, not one preset.** Type rises through a line mask (`yPercent: 100 → 0` inside `overflow: hidden`); UI that spawns from a click scales from its origin (0.96 → 1 with the fade) at the click point; shapes draw on or grow from a `transform-origin`; images reveal through `clip-path`; hard beats simply cut in. No single entrance type on more than 30% of the film's entrances, and at least 30% of elements are simply **there** on the cut. The generic `y: 30, opacity: 0` fade-up on everything is the web default and the first tell viewers name. Opacity-only is a last resort.

**Compound properties.** One or two properties per tween that tell the same story (rise with fade, scale with fade). Never rise + rotate + scale + unblur on one element: it smears.

**One primary mover per beat**, with its secondaries 2–4 frames behind (a child, a shadow, a layer) and the camera under it; never two primaries launching on the same frame with the same curve.

**One dominant direction for the whole film.** Forward in time or progress travels leftward (new content enters from the right); going deeper zooms in; stepping back zooms out. Never alternate directions without a story reason.

**Velocity-matched cuts.** When motion crosses a cut, cut at peak velocity with the same direction and speed on both sides (for example x 0 → −230 px on `power4.in`, then +230 → 0 on `power4.out`, equal durations). At every seam where an element continues, write the handoff numbers (x, y, scale, opacity, direction, speed) in the plan; parallel workers use them verbatim. Partial travel plus fade, never full off-screen moves for handoffs.

**Container before content.** Content enters after its container starts moving and leaves before the next morph, so text never overlaps text during a swap.

**Contrast before the climax.** Thin the motion to one slow mover for 0.3–0.8 s (with a music strip-down or silence) right before the reveal; never a frozen frame. The reveal gets the biggest move and the longest shot in the film.

**Exits.** Faster than entrances (60–70% of the duration, `.in` eases). Prefer no exits mid-film: the cut or the transition is the exit. The last element to leave dies exactly at the cut; a gap with nothing moving reads as dead air.

**Stagger: irregular cascades.**
- Offsets fall on a curve (`gsap.utils.distribute` with an ease, or `amount * (i/n)^1.35`) plus +-1 frame, 2–4 frames apart on average between levels, 1–3 inside a group; durations vary +-10% so the group does not land on one frame. A constant `stagger: 0.08` or four identical tweens at even spacing is the metronome (`even-stagger`, `uniform-cascade`).
- A group's total spread stays under 0.5 s regardless of count.
- Order by reading order or outward from the cause; the hero leads when it is the subject, or lands last with a settle when it is the payoff.
- Never stagger things that already exist. Random order is seeded and precomputed.
- A visible cascade (5 or more items) is a set piece: once per film. Swarms and particles get their own seeded delays (0–0.6 s), durations +-25%, one of three curves and curved paths: a field on one ease and a straight lerp is the purest machine signature R5 found.
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
- **Has somewhere to go:** calm arcs toward its next target, the next leg starting before this one lands, or it leaves through the frame edge; it rests on a target before it clicks, never hovers aimlessly.

**Seek-safety (HyperFrames).** No infinite tweens, no `Math.random` or `requestAnimationFrame`, `fromTo` for entrances, seeded noise sampled on the integer frame index, every tween on the paused timeline.

### Frame budgets and the measured eases

These are the defaults when no brand measurement exists. They were calibrated on short SaaS-style clips (10 to 30 s, 30 fps, one product on screen), so they suit launch films and UI motion best. A film's own brand measurements (a brand film's measured tempo, a reference reel the brief names, the style's `motion.md`) override every number here; say so in the decision's reason when they do. Frames below are at 30 fps.

| Budget | Default | Why |
|---|---|---|
| Median move | 10 f (0.33 s); half of all moves fall between 6 and 22 f | Fewer than 1 move in 8 is a 2-3 f snap; about 1 in 8 runs over a second. |
| Translate and scale entries | 11-12 f; exits 13-14 f (scale exits about 10 f) | An entry is a little shorter than the exit that follows it. |
| Opacity | 6 f (4-12) | A fade is a helper for a move, never the move. |
| Blur | 7-8 f; a 12 px blur resolves in about 4 f | Blur is a transition detail, so it ends before the move does. |
| Landing curve | decelerates: about 58% of landings are ease-out | The object arrives fast and settles. |
| Leaving curve | accelerates (ease-in is the commonest exit curve, about 37%) | The eye reads a fast departure as intent. |
| Overshoot | under 9% of the travel, and late: the peak falls after 35% of the move | A slow lean past the mark, not a spring; one visible spring per film. |
| Stagger | most sibling gaps are 1 f; 3 f per group is typical; whole words 2-5 f; a CTA line 8 f | Overlap, with the next gesture starting about halfway through the last. |
| Scale origin | nothing grows from zero | An object is born at 0.9-1.1x, or arrives oversize and scales down. |
| Identity objects | arrive oversize (a logo about 3.5x, a mark about 1.9x, a cursor 1.5-2.2x) and scale down, over 18-30 f | The excess shrinks fast (about 39% of the drop in the first frame) and then creeps. |
| Arrival | by transform, not by fade | In the measured sample, 3,392 entries moved or scaled and only 584 faded. |
| Exits | new motion, not the entry played backwards | An exit leaves along the film's current, accelerating; an entry reversed reads as a rewind. |

**Pick table.** Start from these curves and lengths, then vary them (a curve per role, never one for all):

| Move | Ease | Frames |
|---|---|---|
| UI card or panel landing | `softLand`; a hero card `snapSettle` plus a 0.4-0.6 s tail | 12 (hero 11, 62-72% of the travel in the first 4 f) |
| Whole-word text arrival | `softLand`; the hero first word `snapSettle` | 12-15 (hero 10-18) |
| Logo crash-in from 3.5-3.75x | `snapSettle` | 18-30 |
| Camera push | `glide` or `cruise` | 10-22 |
| Camera pull | `accelExit` or `crashOut` | 13-17 |
| Whip | entry `whip`, exit `accelExit` | 7-8 (exit 6-10) |
| Press | `glide` | 2-6 |
| Release | `popOver` (about 5% rebound) or `softLand` | 6-10 |
| Blur in | `glide` or `softInOut` | 4-8 |
| Blur out | `gentleIn` | 7 |
| Counters | stepped per frame, no ease | 15-23 steps in 0.5-0.9 s |
| Exit or shrink | `accelExit` | 13 |
| Opacity, ground ramps | `softInOut`, or `cruise` for drifts | 6-9 |
| Slam, rare big overshoot | `crashIn`, `bounceHard` | 10, 22 (sparingly) |

**The twelve measured eases** are closed-form functions (`RasanMotion.measured`, with `RasanMotion.measuredFrames` for the typical frame counts). Each is exactly 0 at the start and 1 at the end and depends only on the progress, so a seek lands on the same value every time. They are plain functions, so GSAP takes them as `ease: RasanMotion.measured.softLand`, and `RasanMotion.ease("softLand")` (or `M.ease("softLand")`) finds them by name. Because the role curve `glide` already exists, the measured one is `measured.glide` or `measuredGlide` by name.

| Ease | Shape (done at 10 / 25 / 50 / 75% of the time) | Typical f |
|---|---|---|
| `cruise` | linear (10 / 25 / 50 / 75) | 9 |
| `glide` | 1-(1-t)^1.7 (16 / 39 / 69 / 91) | 10 |
| `softInOut` | symmetric S (4 / 17 / 50 / 83) | 9 |
| `softLand` | firm exponential decelerate (30 / 59 / 85 / 95) | 12 |
| `gentleIn` | t^2.07 (1 / 6 / 24 / 55) | 9 |
| `snapSettle` | fast snap with a short tail (54 / 84 / 96 / 98) | 11 |
| `whip` | 1-(1-t)^2.52 (23 / 52 / 83 / 97) | 7 |
| `accelExit` | t^2.6 (0 / 3 / 16 / 47) | 13 |
| `crashOut` | t^3.97 (0 / 0 / 6 / 32) | 17 |
| `popOver` | slow late overshoot, peak 1.08 at t 0.72 | 15 |
| `crashIn` | hits and passes the mark at once, peak 1.18 at t 0.27 | 10 |
| `bounceHard` | large overshoot, peak 1.48 (a rare accent) | 22 |

**How the eight role curves map to them.** The role curves above keep their exact shapes; this is only which measured ease each is closest to (by the gap in the curve), so you can swap one in when you want the measured behaviour:

| Role curve | Nearest measured ease | Gap |
|---|---|---|
| Launch | `snapSettle` | close |
| Glide (reposition) | `softLand`, then `whip` | close |
| Expressive | `glide` | fair |
| Exit | `accelExit` | close |
| Settle (spring) | none close: `snapSettle` for the body, `popOver` for the late lean | loose |
| Snap (`expo.out`) | `snapSettle` | very close |
| Drift (`sine.inOut`) | `softInOut` | very close |
| Linear | `cruise` | exact |

The measured eases are options, not replacements: name one in `motion.md` `curves` (or take it with `M.ease(...)` for hand-written GSAP), and `obey.mjs` judges it by its sampled shape like any other. `obey.mjs` warns on the budgets it can see: an entrance over 1.2 s, or over the language's own `durations.max_ms` when that is longer (`entrance-too-long`), an entrance under 3 f (`entrance-too-short`), and a uniform scale entrance from zero (`scale-from-zero`).

### The measured laws, and where each is measured

The laws below come from 4,300 measured moves (motionmaxxing) and the onetake reference studies. Each one names the check that reads it today (a gate, its rule or metric) or says **nowhere**; for a "nowhere" law the measurement is written out for the gate files in `.context/wave8-snippets/V3.md` and arrives as a WARNING (uncalibrated: take the number from the reference research, and run `research.mjs deconstruct` on a reference to see where it really sits).

| Law (the number) | Measured today | Where / how well |
|---|---|---|
| The median move is about 10 f; half of all moves 6 to 22 f; under 1 in 8 is a 2-3 f snap | partly | `fluency` `move_dur_med >= 0.32 s` (snap-and-die moves) and `dur_entropy`; `obey` `entrance-too-short` (under 3 f) and `entrance-too-long` (over the contract's maximum, 1.2 s). No upper bound on the median and no snap share |
| A landing decelerates, a leave accelerates | **nowhere** (per role) | `obey` classifies every tween enter / exit / move and samples its curve, but only asks for a mix of curve families (`dominant-ease`, `few-curves`); `fluency` reports `hard_start_share` without a gate. Measurement in the snippets: enters whose sampled curve accelerates, exits whose curve decelerates |
| At most 1 visible spring per film (overshoot under 9% of the travel, late) | partly | `obey` `overshoot-over-budget` (the share of settles against motion.md's budget, about 1 in 8), `overshoot-too-big`, `no-settle`; `fluency` `overshoot_share >= 0.065` (a floor). The law is an absolute count of visible springs (over 9%) in the film: **nowhere** |
| Identity objects arrive oversize (a logo about 3.5x, a mark about 1.9x) and scale down | **nowhere** | `obey` `scale-from-zero` only catches a thing born from nothing; nothing checks the brand reveal arrives oversize. Measurement in the snippets: the first-scale of the logo and mark tweens |
| Almost nothing fades: arrival is by transform (3,392 moved or scaled, 584 faded) | partly | `slop` `uniform-entrances` (one entrance kind on over half of 8+ entrances; a fade-up is an error). The share of pure-opacity entrances is **nowhere**: measurement in the snippets from the same entrance list |
| Words follow each other 2 to 12 f apart (whole words 2-5 f, a CTA line 8 f) | **nowhere** | `obey` `uniform-cascade` flags an even stagger, `motion-gate` `text-too-brief` reads reading time, `see-and-say` ties a cue to a word; no check measures the word-to-word gap. Measurement in the snippets: the stagger of word-level tweens in frames |
| Cut on motion, never on rest | measured | `fluency` `cut_still <= 0.12` (cuts between two poses at rest) and `cut_carry`; `motion-gate` `seams` (motion on both sides within 0.2 s) and `carry` (something survives each continuity seam); deliberate hard cuts and stated holds are exempt (Plan 05, `seam.editorial`) |
| No dead frame | measured | `fluency` `dead_frac <= 0.3`; `motion-gate` `coverage` (motion in 70% of frames), `freeze` (no still stretch of 0.8 s outside the end card), `empty-frames`, `gap-between-beats`; `slop` `dead-air` |
| At most a quarter of the beats are the point | partly | `emphasis` `budget-over` (about 4 big moments per 30 s), `budget-minor-beat`, `emphasis-off-peak`. The share of beats (big moments over beats, importance-3 beats over beats) is **nowhere**: measurement in the snippets |
| Shot lengths vary by 4x or more | measured | `slop` `narrow-rhythm` (longest over shortest, the end card and flashes left out, reading-time shots excused) on the scenes and on the render's hard cuts, and `uniform-shots` (variation under 0.2); `research.mjs deconstruct` reports a reference's spread as `shots.spread_p90_p10` |
| A fast move needs the shutter: over 80 px per frame at 1080p smears or strobes without it | partly | `finish.mjs` picks the sub-frame count from the draft's motion (`--samples auto`) and refuses a shutter over a declared smear / stepped grammar; `stage3d.mjs check` `fast-without-blur` (3D, over 6 px per frame). A 2D tween over 80 px per frame in a film whose finish does not blur it is **nowhere**: measurement in the snippets from the tween's travel and duration |
| The frame is not always in motion (about a third of a reference's frames are still) | **nowhere** (the floor) | `fluency` `dead_frac <= 0.3` and `motion-gate` `coverage` bound the still share from ABOVE; nothing bounds it from below (`stage3d.mjs check` `never-rests` does for a 3D scene, `slop` `idle-breathing` bans the idle loop). Measurement in the snippets: a still-share floor on a film of 20 s or more; `research.mjs deconstruct` gives a reference's `energy.still_share` to calibrate against |

How to read a "partly": the gate catches the extreme (a floor or a ceiling) but not the law's own number. The table is the audit; the snippets are the fix; both change only when a reference run says the number is wrong.

### Animation principles: the twelve that matter here, with numbers

A film made of eases and fades is correct and lifeless. The reference films (the Eye intro, the pixel manifesto) move like animation: things have weight, prepare, overshoot and trail. Of the twelve classic principles, these are the ones that pay for themselves on screen, with the numbers to start from (tune by eye on a 24 fps strip, `crew.mjs strip --fps 24`):

| Principle | What it is | Numbers |
|---|---|---|
| Anticipation | A small move the wrong way before the real one | 60 to 120 ms, 5 to 12% of the move's distance or scale (an icon dips to 0.92 before it pops to 1.1) |
| Squash and stretch | The body deforms on contact and speed, volume kept | squash 10 to 25% on the contact axis (scaleX up as scaleY down by the same share), stretch 5 to 15% along a fast move; recover in 0.2 to 0.35 s |
| Overshoot and settle | Go past the target, come back once | 3 to 8% past, one return, `back.out(1.4)` or a small `elastic.out(1, 0.7)`; never two reversals |
| Smear frames | A stretched, blurred copy of the object on a fast move | 1 to 3 frames, length 0.5 to 1.5 times the object's size along the motion; only on moves above ~1500 px/s |
| Follow-through | Loose parts keep going after the body stops | trailing elements settle 2 to 4 frames (70 to 130 ms) after the primary, with a 2 to 6 px overshoot |
| Secondary motion | A second action that supports the first | 2 to 4 frames behind the primary mover; never a competing one (a highlight dot lags the pupil by 0.08 s) |
| Arcs | Natural paths are curves | arc deviation 8 to 15% of the travel; `followPath` or two axes on different eases |
| Slow in, slow out | Ease at both ends | `power2.inOut` for moves, never `linear` on a body |
| Timing | The number of frames sets weight | light and snappy 4 to 8 frames at 24 fps, heavy 12 to 20; a UI tap 0.12 to 0.2 s |
| Staging | One clear read at a time | one primary mover, at most 3 things moving, the rest still |
| Exaggeration | Push past the believable | squash and overshoot at the top of the ranges on the hero move, the lower end elsewhere |
| Stepped timing (on twos) | Hold each drawing for 2 frames | 12 fps (on twos) or 8 fps (on threes) for pixel art and hand-drawn scenes; type and camera stay smooth |

**When to use the character language.** `motion.md`'s `character` motion language (squash and stretch, anticipation, overshoot settles, smear frames on fast moves, follow-through, secondary motion, optional stepped timing; it allows `back.out`, a small `elastic.out`, stepped eases and short holds) is for films whose actors are objects: a ring of icons, a carrier letter, a ball that reads the line, a mascot. Glyph-chain and pixel-collage grammars use it. A UI-led launch film whose actor is the real product stays on the brand's own easing; a squashing card there reads as a toy. This is enforced: `motion-md.mjs write` refuses `character` with `--mode auto` unless `--actor object`, and `obey.mjs` / `motion-gate.mjs` fail a launch or promo film whose motion.md is `character` or `auto` with a UI actor (rule `ui-actor-motion`); motion.md must exist before the build. Mixing is the usual answer: the object gets character, the type and the UI keep the brand's ease. The shape kit's `squash`, `smear` and `stepped` (`references/shape.md`) are the tools.

### Layer density

A showcase shot is built of many independently timed things: a ground, a vignette, a ring or specimen, the one actor, an ink layer, a pen line, tiny type, a flare. The references run **5 to 10 independently timed layers at the peak of a showcase shot**; a competent template runs 2 to 4, and reads thin beside them. The score records `layers` per shot (a count of independently timed elements: its own start, its own ease) and `crew.mjs checkScore` warns `layers-thin` when the median over shots is under 4 on a showcase-grammar film (specimen-sheet, pixel-collage, glyph-chain, viewfinder-reel, editorial-grid). Layers are not clutter: each has its own motion on the beat and none covers the line being read. The art department's assets (`agents/art-director.md`) are what fill them with something worth moving.

### Key poses before the build, fine review after

A hero move is judged at the frame, not at the second. Before building, render 4 to 6 key poses of each hero move (start, anticipation, smear or bridge, settle, end) with `design.mjs stills` into `boards/<move>.png`, and look at them: if the five stills do not tell the move, the move is not designed yet. After building, review hero moves as **24 fps strips** (`crew.mjs strip --fps 24 --from <t0> --to <t1>`), not 2 fps overviews: the overshoot, the smear and the morph's in-betweens live between 2 fps samples. `crew.mjs check --role film-builder` warns `no-pose-board` and `hero-not-stripped`.

---

## 4. Transitions

- **The cut is the baseline:** a clean hard cut on a strong frame, on the beat or up to 2 frames early. Every other transition must carry information.
- **Scene-born transitions first.** The outgoing scene makes the incoming one: a match cut (shared shape, position or color), a shared-element morph (the pill grows into the next card), a carried object (the square holds its position across a background cut), a flood that contracts into the next scene (overscaling past the corners, about 0.3 s), an iris or mask cut from an element, a camera push into a UI tile that becomes the next scene, a mask line the next words rise from. **At least half of all scene changes are continuity (scene-born) or hard cuts**, never preset swaps. This is the cure for the slideshow.
- **2–3 transition types per film:** the cut, the scene-born family, and at most one signature transition. A different transition on every seam reads as chaos.
- **A carrier chain is one idea.** Several continuity seams carried by **one carrier** (one shape evolving: a circle that is a letter, then a dot, then a pupil, then the next page) read as one continuous idea, not as a different transition on every seam. The "2–3 transition types" rule above and the "chaos" warning are about **unrelated techniques**; a chain whose every seam hands the same object on, with a named constant (position, silhouette, vector, colour) and a bridge frame where both scenes are true, counts as one. It also counts as ONE idea for the "one signature" rule below: the signature may be a chain of 6 to 10 transformations of one carrier, a new idea about every 1.2 s, and that density is the point (the house bar: one circle carried letter, dot, pupil, eye, page, full frame, nine ideas in 11 s). Plan it as a chain (`references/moves.md`: the carrier, the ledger, the bridge frames), not as a list of seam kinds; when `story/moves.json` exists the Motion Director's seams come from it.
- **One signature technique, used once** (twice at most in films over 60 s), at the peak (the intent's `peak: true` beat: usually problem → solution, the reveal), and it belongs to the style:

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
- **Seams move (continuity seams).** At every continuity seam the outgoing beat is still moving when the cut lands and the incoming beat arrives already moving, on the same axis, in the same direction, at the same speed. Never settle and then cut, never start from rest, never hard-cut to a frozen frame (`motion-gate.mjs` fails a continuity seam with either side at rest). **Plan 05:** a seam the score declares a deliberate hard cut (`seam.editorial`: `hard_cut: true` + `reason`, or a hard-cut kind between `contrast`/`example`/`separation` shots) or a stated hold (`editorial.hold: true` + `reason`) is exempt: stillness is allowed where it is the point.
- **Carry at least two seams** (the `carried-seams` profile; on the new creative policy a profile, see "Profiles" below) with one object that crosses the cut and becomes part of the next beat (a card grows into the next screen, a word becomes the button label, the mark travels into the end card). The carrier lives in the root, on its own track, as one object on one tween.
- **Carry across continuity seams, measured from the pixels** (Plan 05: deliberate hard cuts are not counted against the share and do not need a carrier; a cut between separate contexts is often the clearest seam). Never replace a beat, carry it: something on screen survives every section boundary. `motion-gate.mjs` (`lib/carry.mjs`) compares the frames 0.1 s and 0.3 s either side of each seam (the plan's beat boundaries; with no plan, the hard cuts it finds) and scores the share of the foreground structure before the seam (type, shapes, card edges; not the ground) that reappears after it, allowing a shift of up to 15% of the width and a scale of 0.7 to 1.4, so a carried object that moves or grows counts and so does a match cut on a shape. A seam under 0.25 is uncarried; fewer than half the seams carried is the warning `carry`, listing each uncarried seam with its time (an error only when the user taught it as a lesson, `motion.carry_share`; the reference films hard-cut between scenes, so it guides rather than blocks). What reads as carried on the strips: a card, a field or a line that stays or grows across a ground change (0.4 to 1.0), a frame device that holds (rules, a grid), a line of type that stays. What does not: a new headline in the old one's place, a texture, a logo that gives way to type (under 0.25). Misses to know: an object that shrinks to under 0.7, a small dot inside a busy frame, and a heavy depth-of-field blur on the move. Fix an uncarried seam by taking one object across (grown, moved, re-coloured) or by cutting on a matching shape. The last beat is also at most a quarter of the film (`long-ending`, a warning).
- Carry also credits a shape that **stretches** (x and y scaled differently, 0.5 to 2x: a pill that changes shape) and an object that **shrinks below 0.2** (far scales 0.1 to 10, verified by edges over chance plus grey correlation as before). Result rows may carry `sx`, `sy`.
- **No pops.** Continuing elements keep the promised position, scale, opacity, direction and speed across every cut (checked in the Quality gates).
- Obey `motion.md`'s bans. Set `transition_default` (usually `cut`) and per-scene `transition_in` for the hinges.

---

### Direction from meaning

FILM-D, E and F failed on where the emphasis went, not on how things moved: the biggest type in FILM-D's hero section was a salad's price input, the one full-frame colour change went to an off-story beat, and FILM-F's plan put a different camera kind on every beat because a quota asked for four. The fix is one procedure, run per beat from `story/intent.json` (`agents/motion-director.md`):

1. **The hero is what the viewer must notice to get `buys`.** Hitchcock: "the size of an object in the frame should equal its importance in the story at that moment." The hero is 2x the area of the next element or more; on an importance-3 beat it is the biggest thing in the frame; it arrives first, supporting elements after it and slower; text lands on or after its settle; at most 2 groups move at once.
2. **The verb comes from the meaning.** Read `buys` as a sentence and make the hero do its verb literally; only then find the recipe (`references/vocabulary.md`, "Start from the meaning"):

   | The beat means | The hero |
   |---|---|
   | something new arrives | enters from where it comes from (a click, the edge it lives behind) |
   | it matters more now | grows, or the camera pushes toward it |
   | two things compared, or one becomes two | splits along a line; or two sit side by side and one wins |
   | many become one, it finds the one | collapses, merges, the list filters to a row |
   | this replaces that | swaps in place, same position and size |
   | X causes Y | travels from X to Y; Y reacts on contact |
   | certain, done, locked | snaps and locks, a settle and stop |
   | faster, easier | the same path again, a third of the time |
   | more, at scale | a count climbs, a field fills, the camera pulls back on the many |
   | let it land | holds still while a living layer moves |

3. **The transition comes from `relation`** (Kuleshov: the meaning is in the pair): because → a carry or match cut (the cause's object becomes the effect's); but → a contrast cut (hard, smash or iris, onto a change of ground, scale or colour); so → a continuation (the same motion crosses the cut); example → the refrain (same layout and entrance, one variable changed); escalation → faster and bigger (a shorter beat, bigger scale, a harder push; the third rung breaks); answer → the setup's object returns changed. The ending's `echo` is the film-wide answer.
4. **Spend the budget, don't spread it.** Big moments (a giant word or number, a frame-filling object, a full-frame colour field, a real camera move, a 3D lift, spectacle) cost the same purse: about 2 to 4 per 30 s (`lib/emphasis.mjs`), on the peak and the importance-3 beats. Hero effects, T1+ camera moves and the hero sound come from the same purse. Importance-1 beats stay calm. Before the peak, the rest: one slow mover for 0.3 to 0.8 s and a dip in the music; then the hit, then 0.4 to 0.8 s of living air (no-slop-motion's crescendo: setup, hit, one sound, air).
5. **When rules fight, the higher one wins** (Murch's Rule of Six): emotion, then story (the `buys`, and reading time), then rhythm, then eye-trace, then screen direction, then depth. A seam that is pretty but lands the eye 40% of the frame away from the incoming hero gives way to one the eye can follow.

Variety is a result of this, not a target: beats that mean different things move differently, and a refrain moves the same way on purpose. The variety checks below only warn when a film has no variety at all.

(Ideas from Walter Murch, Hitchcock and Kuleshov via R-craft; beat purchases and the importance budget from motionmaxxing, Apache-2.0; the crescendo from ferndesk/no-slop-motion, MIT. Our own words.)

### Variety and punctuation: variety from meaning, never a quota

Kinso's launch runs about 20 distinct mechanics in 46 s (type that splits, a bouncing ball that reads the line, a bar that becomes the logo, a window that grows out of the caption, an orb, a counter, an iris), 12 punctuation cuts, and type that swings from huge to tiny. A film of one mechanic and one type size reads as a template. But FILM-F, planned to a quota (a different technique per beat, every camera kind once, a big moment on 56% of its beats), read as a sampler with no peak. Variety comes from beats that mean different things; the score records `mechanic` per shot or line, and `crew.mjs checkScore` warns only at the floor:

- **No one-trick film.** A film that runs on one or two mechanics (`mechanics-thin`), or the same mechanic on every line of a non-refrain stretch (`mechanic-repeat`), is the template tell. A refrain repeating its mechanic on purpose is not.
- **Huge against tiny type.** The score's `type_scale: { small_px, large_px }` has large/small at 3 or more (`flat-type` otherwise): a hero word at the brand's statement size beside a label at its small size, never one size throughout. The large size belongs to the importance-3 lines and the peak. Every word still rests readable inside the safe area (an oversize word may sweep across cropped for up to 1.2 s and then rests).
- **Punctuation cuts on the emotional turns.** At least one seam is a hard `cut` (or an iris or smash-cut) placed on an emotional turn: the intent's `but`, the pain to the reveal or the payoff (`no-punctuation` otherwise): the cut is the full stop the sentence needed. Mixed with continuity seams, never instead of them.
- **The ground follows the mood.** On the story's emotional turns the ground may change (the pain darker, the reveal warm, the CTA dark again) inside the brand's palette or its films' colour fields; the pain beat is the one place a flat brand goes dark. Blur used as depth (a giant word defocused behind the UI) is a main depth tool on every film; depth is craft, not brand.

### Grammar: one per film, a technique per beat

A film commits to **ONE motion grammar** (`library/grammars/<id>.json`; `node scripts/grammar.mjs list`): a frame device that is always on screen and moves on the beat (rules that re-divide, a viewfinder HUD, a carried dot, a drafting sheet, a glowing panel, a dot lattice), type and image behaviour that stay fixed, and 8 to 12 techniques with build routes. The story stays plain; the grammar is where the film shows off. Rules:

- **One grammar, never two.** The frame device is the same from the first frame to the end card. A second frame device is a different film.
- **The technique comes from the beat's verb.** Every scene names the technique of the grammar that expresses what its hero does, and what the frame device does in it. Beats that mean different things spend different techniques; a refrain repeats one on purpose. A grammar spent on one or two tricks across the whole film reads as a template (`technique-thin`, a warning).
- **The grammar sets density.** Its `density.change_every_s` is the floor for how often something changes; its signature is the film's one signature, spent at the peak.
- **A graphic-finish brand gets a graphic grammar.** A grammar with `flat_ok: false` is one whose look IS glow or blur on every element (glowing panels, a fogged viewfinder): that is uniform use, so it is not given to a brand whose film measured no finish at all (`brandfilm.mjs measure`: `finish.layerOff`). The flat grammars (editorial grid, glyph chain, specimen sheet, dot system) fit there, and their Rasan3D techniques take the brand's palette (`references/3d.md` "Brand-flat 3D"). Every grammar keeps the finish layer and the hero budgets ("Finish and budgets", section 6).
- **Readability stays hard.** The grammar's type behaviour never overrides section 2 and the "Every word fits" rule: whole, inside the safe area, never cropped at rest.
- **A brand wins on colour and type**; the grammar's devices stay.

### Continuity: never an empty frame

Kinso's next element arrives before the previous one leaves; its frame is never empty. Ours ran the beats in sequence and cleared to white between them (21% of film B's frames were near-empty). Rules:

- **Overlap on continuity seams.** (Plan 05: a hard cut or a stated hold owes no overlap.) The incoming element starts 0.2 to 0.4 s before the outgoing one has fully left (its first word, its card edge, the next rung's title), so for a moment both are on screen. `crew.mjs checkScore` warns `no-overlap` when the `in` element starts after the `out` element has gone.
- **No clear-to-ground between beats.** A beat never ends on the bare ground and then starts again; the ground always carries something (the carrier, a settling word, the next card arriving).
- **Breaths are declared.** The one deliberate near-empty moment is a breath at the rest before the peak (the intent's `rest_after`): `score.breaths: [[t0,t1]]`, each 1.0 s or shorter, two at most. The end hold (last 1.4 s) is exempt. `motion-gate.mjs` fails `empty-frames` (more than 10% of sampled frames near-empty) and `gap-between-beats` (a near-empty stretch over 0.3 s between two beats) outside them.

### A living ground

A held frame must still be alive. The ground drifts all the time, as in Kinso's gradient: a slow tone or gradient-stop drift of a few percent, a travelling edge glow, rules that breathe 1 to 2 px, a dot field that swells in a wave. The score carries `ground_motion` (what moves, how far, how slowly; on films of 15 s or more, `no-living-ground` otherwise) and it comes from the grammar's `ground_motion`. Build it as one finite timeline tween (or a few) spanning the film, `sine.inOut` or `none`, never an infinite loop, so it stays seek-safe and renders the same every time. It moves the ground only, never the content, and never fast enough to read as an effect.

### Video UI: redraw the product for video

Do not paste the dense real UI flat and small. Kinso redraws its UI for video: a simplified soft glass card, large radius, soft shadow, a few rows, one highlighted row. Keep the real structure, labels and colours (the viewer must recognise the product) and drop the noise: the toolbars, the tenth row, the settings chrome. Enlarge the part that acts until it fills a third of the frame or more.

- **Build in stages**: card, then frame (header, tabs), then rows, then the highlight. A UI that arrives whole is a screenshot (`ui-unstaged` warns when no shot of a UI beat mentions build, rows, highlight, step, simplify or card).
- **The product acts**: highlights step down the rows, rows reorder, cards appear on their own, a count climbs. A cursor appears only when the user's action is the point (a click that sends, a drag that is the feature); a cursor leading most UI beats reads as a screen recording (`cursor-led`).
- **Springs that add up** (idea from awesome-opus5-5-videos; our code): when a value is retargeted mid-flight (a highlight chasing a moving cursor, a count handed a new target), do not restart a tween from the current value. Give the property its keys and read it with `RasanMotion.springTrack(keys, {z, w})`: every new target adds its own spring response, so the motion keeps its velocity and stays a pure function of `t` (seek-safe). `.velocity(t)` gives the speed, for matching a loop seam.
- **Indicators with two edges**: a tab underline, a selection pill or a toggle knob travels as two edges, the leading one on a stiffer spring than the trailing one, so it stretches toward the target and the tail catches up. `RasanMotion.edges(keys, {lead, trail})` returns `left(t)`, `right(t)`, `center(t)` and `width(t)`. Use it on the one indicator that is the beat; a quiet slide needs only a plain ease.

### Depth

One flat plane reads as a template. Put sharp UI over a blurred giant word, give cards soft shadows and glass translucency, and keep a foreground and a background layer moving at different speeds. Depth is craft on every film, branded or not: the card's `Depth blur:` line records what the brand's films showed, it never switches depth off ("Finish and budgets", section 6).

### Word choreography

Letter-by-letter type-on every time is a template. Each word arrives from its own place (its own offset, scale and blur) and settles into the line with a 4 to 8 px lift and a soft overshoot; the key word arrives last. Every word is readable at rest and the line is whole before it leaves. Every grammar carries a `word-choreo` technique with its GSAP route; use type-on only where the typing itself is the show (a prompt being written).

Once the line is whole, it holds still for its reading time (`readTime` in `scripts/lib/reading.mjs`, section 2) before any decorative travel; the arrival is the reveal, a drift or push afterwards is not (`text-moves-before-read`, textfit, warning). Motion blur and camera scaling never touch the text being read, and text that a camera scales gets no `will-change` (the browser rasterises it once and it renders soft). In a morphing container the outgoing and the incoming text get separate exit and enter timing, so the two never overlap.

### Type rhythm

Line sizes alternate small, bigger, giant, small, so size carries emphasis: the setup small, the turn bigger, the key line giant, the aside small again. The score's `lines_type` gives a size class per line; all lines within 15% of one size is `type-rhythm-flat`. This sits beside `type_scale` (huge against tiny) in "Variety and punctuation".

### Accent as signal

One accent colour marks the key word or the key dot, every time: the same hue on the word the line is about, on the carrier dot, on the highlighted row. The score's `accent: {colour, marks}` names it (`no-accent-signal` otherwise). The key word may instead take the ground's gradient as its fill (Kinso's "here"). Never a second signal colour, never the accent on decoration.

### Easing personality

Take the signature curves from the brand's own films (`Easing:` on the brand film card), not from a house default: they become `motion.md`'s `easing` and set the overshoot budget (a soft settle of 3 to 8% when the brand settles; a sliver when its motion is strictly mechanical). The brand sets the signature; it never collapses the film to one curve. "Precise" means grid-locked destinations and restrained settles, not one ease and a duration scale: that is the machine pattern R5 measured.

### Brand recurrence

The name appears three times: at the reveal ("Meet KINSO"), once mid-film tied to a benefit ("KINSO finds it"), and at the end. Mid-film it is part of a line about what it does for the viewer, not a logo bug. `brand-once` warns when a launch film of 25 s or more shows the brand name or mark in fewer than 2 beats.

### Echo: the end is the start, changed

The ending answers the opening: the same object, frame device or shape comes back, transformed by the story (the empty composer returns holding the answer, the opening's dot returns as the logo's full stop, the grid returns with the word in it). Not a loop: the same frame unchanged says nothing happened. The Motion Director writes `echo: {opening, ending, change}` in the score. `motion-gate.mjs` (`lib/echo.mjs`) compares the opening's key frame (the first settled composition in 3 s) with the end card and with the stillest frame of the 5 s before it, on palette (40%), where the foreground sits (30%) and where the edges sit (30%). Under 0.55 warns `no-echo`; the same frame to a few levels warns `echo-identical`; a score with no `echo` warns `no-echo` (plan). Calibrated 2026-10-14, by eye on the key frames:

| Film | Echo | Eye |
|---|---|---|
| Google "Ask" | 0.99 | rhymes: a word centred on grey, the G centred on white |
| OpenAI "Refreshed." | 0.99 | rhymes: the dot becomes the mark |
| Video-14746 | 0.87 | rhymes: dark ground, small centred type at both ends |
| Video-9721 | 0.82 | rhymes: the red grid returns with new words |
| Kinso | 0.79 | rhymes: the gradient ground, centred type then the mark |
| FILM-D | 0.79 | rhymes: the composer returns, "dessert's on me" |
| Video-20023 | 0.68 | rhymes: black, the orange dot returns as CLAUDE's full stop |
| mexicat p(doom) | 0.66 | rhymes: the orange spark on black returns |
| FILM-E | 0.62 | rhymes, weaker: the composer returns, the end card is set left |
| Greenroom | 0.59 | rhymes: centred type on white at both ends |
| FILM-C | 0.53 | partly: the composer returns small, the end card is plain type |
| Sovra | 0.50 | palette only: the player card against a centred logo |
| Video-98327 | 0.40 | partly: the line of type returns scattered |
| Video-29220 | 0.34 | motif only: the lily returns, the ground inverts |
| rasanai-test2 | 0.26 | no: green "Detour." against a white end card |

### Room

A film needs a breath. The intent marks it (`rest_after` on the beat right before the peak): a dark or quiet moment, a declared breath (see Continuity) with the ground changing and the music dipping. Launch films may run 35 to 45 s when the story needs it (Kinso runs 46 s); crammed 7 ideas into 30 s with no breath is the failure.

### Profiles: the universal rules on the new creative policy

On a run under the new creative policy (`creative_policy_revision` on `creative/brief.json`, or `creative` on `motion/score.json`) these rules are **profiles**: a film selects the ones that serve its idea in `score.creative.profiles`, and a tool that honours a profile keeps its rule an error only then (today `motion-gate.mjs` `carriers` = `carried-seams`, `obey.mjs` `few-curves` = `curve-families`, `lib/moves-lib.mjs` quotas = `dense-chain`, `bridged`, `full-frame-hero`, `atom-mining`); otherwise it warns. The other rows are guidance the Director and critic apply by judgment. Legacy runs keep every error. Nothing here weakens seek safety, missing-asset checks, approved brand and copy protection or timeline correctness. A hard cut or a held beat is declared with the existing `seam.editorial` (`hard_cut`, `hold`, `reason`), which already exempts it from carry, overlap and sound.

| Old universal rule | Profile | The viewer effect it serves | Good | Bad |
|---|---|---|---|---|
| a minimum number of moves per second | `dense-chain` | the eye is led continuously | a dot becomes the button becomes the cursor | ten wipes added to reach the count |
| a forced bridge or carried object at every boundary; carry two seams | `bridged`, `carried-seams` | the film reads as one object | the receipt's tear line becomes the divider | a morph across two unrelated contexts that implies one process |
| perpetual drift on every held frame | `living-ground` | a held image stays alive | a slow 3% ground drift under a held proof | constant drift under type that has to be read |
| glass, key light, grain and grade on every film | `finish-layer` | the product feels physical | a lit hero card in a depth film | a glass rim on a flat editorial brand whose look is paper |
| the peak at 60 to 75% of the running time | `late-peak` | a build then a release | a rest, then the drop at 70% | forcing a payoff late when the argument resolves early |
| four curve families | `curve-families` | motion that does not read as a template | launch, glide, settle and exit each used | four families chosen to pass while one curve still carries 60% |

Choose by effect. High information clarity and strong timing are compatible with an energetic film and a restrained one; a profile is a way to get an effect, never a count to reach. The check for an unselected profile is a prompt to judge the picture, not a failure.

---

## 5. Composition and type

**Build each frame around one thing.** Decide what the viewer notices first; everything else supports it or goes. Squint test: blurred, the number-one element still stands out. Hierarchy through at least 2 of: size (3:1 or more), weight (800 against 400), contrast, position, order of motion.

**Scale.**
- The primary visual covers at least 40% of the canvas.
- UI as the subject fills at least 60% of the frame width (zoom in, screen-studio style); when type is the subject, it is one line that fits inside the safe area (never cropped by the frame), sized to the brand film card's type scale, or without a card the design system's display size.
- Negative space has a job: type-led frames keep at least 40% empty. A frame that is mostly an empty flat field with nothing happening is sparse, not minimal: add scale or a second plane (unless the style is deliberately minimal).
- At most 2 effects per element (a shadow and a mask, never shadow + glow + blur + stroke).

**Type sizes** (percent of the short side; px at 1080):

| Role | Size |
|---|---|
| Hero word or number | 12–20% (130–216 px), only where the whole word still rests inside the safe area |
| Display line | ≥ 8% (≥ 86 px) |
| Readable text, 16:9 | ≥ 3.5% (≥ 38 px) |
| Readable text, phone-first (9:16, 1:1, 4:5) | ≥ 4% (≥ 44 px) |
| Anything smaller | texture only (details inside a screenshot); never carries the message |

At least 3 clear sizes in the system, display at least 2.5× the body, at least 2 weights. No font-size under 24 px without a reason. Borders 2–4 px.

**Safe areas.**
- 16:9: every line meant to be read rests fully inside the 6% safe area (115 px at the sides and 65 px top and bottom at 1920×1080), on one line (two at most), never cropped. A line may leave the frame only in a deliberate push-through of 1.2 s or less: an oversize word may sweep across the frame cropped for up to 1.2 s (Kinso's "for every") when the same line then rests fully readable inside the safe area. Size follows the brand film card's type scale, never "as big as possible". `text-fit` measures it (§10).
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
- One canvas, one ink, one accent, plus at most 2 section colors used as full-bleed punctuation on the beat. The brand color is sacred; its application is yours. On a launch the ground may change with the story's mood (the pain darker, the payoff warm) within the palette or the brand film's colour fields; the change lands on a cut or a carried shape, never a fade.
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
| T3 crash zoom | impact punch-in | 1.5–2× in 0.15–0.25 s `expo.in`, optional 1–2 frame flash | once per film, on the peak |

**Camera rules of thumb** (ideas from awesome-opus5-5-videos; our wording):
- Zoom is felt as a ratio, so interpolate it in log space: `cam.keys([[t, zoom, x, y], ...])` does (opt out with `linearZoom`); a linear lerp from 1× to 4× rushes at the start and crawls at the end.
- Never zoom into an off-centre point (past 4× and 15% of the frame from centre: `zoom-into-point`, camera.mjs). Open it as an iris or a mask from that point instead; the frame stays put and the target grows.
- Iris and flood circles ease by area (radius = R·sqrt(e)), since the eye reads the area that is covered, not the radius; `byArea` is on by default in the shape helpers.
- Launch-film camera moves take 1.5–3 s on gentle in-out curves, about half the speed a model reaches for by default. One eased move per scene. Never zoom in and straight back out (`zoom-in-out`): the second move cancels the first and reads as a wobble.

**Camera from meaning.** Name each beat's camera (locked, push-in, pull-out, pan-truck, tilt, rotate, handheld-drift, whip) and one signature shot, at the peak. A camera move is spent like a big moment: a push toward what the beat's `buys` is about, a pull-out when it means "at scale", locked where the UI or the type does the moving; importance-1 beats stay locked. There is no count of kinds to reach: walking the list one kind per beat is a sampler (FILM-F). The render is measured too (`lib/camera-moves.mjs`: a whole-frame affine fit on the textured blocks, counted only when it covers the frame or one big plane; a line that recentres while it types is not a pan): `camera-monotone` warns when the film shows fewer moving kinds than the references do at its length (1 from 15 s, 2 from 40 s, 3 from 90 s; a stillness style is exempt), and the gate lists each beat's measured camera next to the declared one. Most great 2D films barely move the camera; the warning floor sits where they sit. A cut-in (a scale jump across a cut) is a cut, not a camera move, and a heavy depth-of-field blur hides a move from the measure. Calibrated 2026-10-14, by eye on strips:

- A **cut-in** (the same object 1.25x or more bigger or smaller across a hard cut, matched by `lib/carry.mjs`) counts as a camera kind; a shot that opens on one is "cut-in" when no slide, zoom or turn covers it. `cameraFloor` counts it as a moving kind.
- **The camera keeps its subject.** The beat's hero (`data-hero` on the element, or the score's `hero_id` = the element id) stays 90% inside the 6% safe area while it is on screen. `subject-lost` (motion-gate / slop, warning) names the times when a camera move, or the hero's own, takes it out for 0.3 s or more, or when it is never inside. A deliberate crop: `data-hero="bleed"` (a hero bigger than the safe area is skipped by itself).

| Film | Moving kinds measured | Eye |
|---|---|---|
| Video-14746 (11 s), Video-29220 (7 s), Video-98327 (20 s), OpenAI (110 s, stillness) | 0 | locked: the type and objects move, the camera does not |
| Video-9721 (21 s) | 1 handheld-drift | locked grid; the inset footage drifts |
| Video-20023 (15 s) | 2 push-in, whip | locked HUD; a glitch whip, the end card settles in |
| Kinso (46 s) | 2 push-in, tilt | mostly locked; the tilt is the icon strip rising (a layer: a known false read) |
| Sovra (52 s) | 3 pull-out, pan-truck, tilt | the queue scrolls (tilt), the player pans and pulls out |
| mexicat (157 s) | 4 push-in, pull-out, pan-truck, tilt | pushes into the drawings, trucks across the diagrams |
| Google (87 s) | 4 push-in, pull-out, pan-truck, tilt | UI scrolls, zooms and slides through the whole film |
| FILM-D (29 s), FILM-E (30 s) | 1 push-in (the end card) | near-locked UI, cut-ins on cuts, a slow push on the end card |
| Greenroom (23 s) | 0 | locked: type and UI cards move on a still white page |

At this floor Video-98327 and Greenroom warn (OpenAI too unless its stillness is declared); the floor is the only camera alarm, and the plan warns only when no beat names a camera at all.

A dolly (per-layer depth factors, parallax) feels spatial; a zoom (uniform scale) feels flat and graphic. Choose by style. When the scene needs real space (an object to turn, layers in depth, a camera that travels, a flat card that becomes an object), build it in real 3D with Rasan3D: a lens in mm, camera legs that land, one motivated key light, true motion blur and depth of field (`references/3d.md`). On a flat brand the 3D takes the brand's palette and tone (matte or unlit materials in the palette's hexes, `references/3d.md` "Brand-flat 3D"); depth of field, motion blur and the camera are craft, not brand, and stay available. The camera language above still holds there; the tiers become real camera moves. When the style has depth, use 3 planes (background ×0.2, content ×1, foreground ×3–6) and at most one heavily blurred foreground occluder (20–30 px) that actually passes in front of the content.

**Lighting is a design tool, even in flat graphics.** Every scene has one named, motivated source with a direction and a color ("key from upper-left, warm #ffd9a8; cool rim from behind right"), and every gradient, highlight, rim and shadow agrees with it. Flat-graphic styles have no light model, but their shadows still share one direction. Pick the light from the taxonomy's `lighting` dimension (the style's pick, or Claude's from the style when unpicked) and build it with the recipes in `references/vocabulary.md`: a key is a directional gradient overlay at 8–18% soft-light, a rim a 1–2 px inner highlight on the far edge, a specular sweep one pass of 0.4–0.8 s at a landing. Glow or bloom is a budgeted effect ("Finish and budgets" below): on the hero only, 2 to 3 times per film at most, each with a reason in the score's `budget`, motivated by a source or a "power on" beat; never on body text or UI chrome.

**Grade.** One grade for the whole film (the `color-grade` dimension), decomposed into parameters (white balance, black point, roll-off, curve, saturation, split tone, grain, halation) and applied to the world wrapper, or to the photo and footage layers only when it would push the logo, UI or brand accent off-brand. A grade that changes between scenes needs a story reason (a flashback, a before/after).

**Texture, with numbers.**
- Grain: 1–2% on a brand-flat film and 2–4% otherwise as the default finish (below); 3–6% (felt) or 8–12% (visible) when the style asks for texture; a static tile attached to the artwork, or a seeded per-frame re-roll. Never a frozen full-frame grain over moving graphics (it reads as a dirty screen).
- Halation: red-orange, 6–20 px blur, highlights only, 20–40% screen.
- Bloom: a blurred copy of the bright layer at 30–60% screen, on emissive elements only.
- Vignette: radial, 20–35% multiply.
- Chromatic aberration: 1–3 px, at the frame edges, for 2–6 frames on an impact; never over readable text.
- Light leak: only as a transition in warm or analog styles.
- One texture layer unifies a long film; never more than two effects stacked at once.

### Finish and budgets

**The finish layer is the default for a film with a product UI or a flat brand** (Plan 04 migration: a default tied to what the film communicates, not a law for every film). It is what makes a flat brand look expensive, not an off-brand effect (R1 §1.3, §5.3; Google's film is white and still tilts, glows and defocuses). Each treatment the look keeps (grain, blur, vignette, chromatic aberration, camera drift, 3D) is listed in the visual bible's `imagery.texture_finish` with what it serves; none is added because the renderer supports it, and none is banned. A look may choose none (`finish_policy: "none"` with a `finish_rationale`), for example an editorial type film or an intentionally flat graphic piece:

| Layer | Default | How (RasanCamera, `references/cinematography.md`) |
|---|---|---|
| Ground | tinted, never 0-chroma: chroma 1.5 or more and an L* falloff of 4 or more across the empty area; it lives (a finite drift) | `ground(stage, {tint, falloff})` |
| Light | one key light, visible as a gradient on the ground; a 10–30% vignette | `keyLight(stage, {side, color})` |
| Shadow | soft multi-layer shadows under every floating object, a contact shadow where it meets the ground | `shadowLadder`, `contactShadow` |
| Surface | glass rims and an inner highlight on the hero card | `glass`, `rimLight` (brand colours only) |
| Grain | 1–2% on a brand-flat film, 2–4% otherwise; seeded per frame, never frozen | `grain(stage, {amount})` |
| Motion blur | on every fast move (over ~1% of the width per frame), in drafts too | `blurTrail`, `finish.mjs --draft` |

**Off on measured evidence, or by a recorded look decision.** The layer turns off when the brand film's measured finish is zero, or when the look's visual bible chooses `finish_policy: "none"` with a rationale (`slop.mjs` reads both). On a brand film the measured evidence rules: `brandfilm.mjs measure` writes `finish` (grain, ground chroma and L* range, vignette, soft-shadow frames, soft content) and sets `finish.layerOff` only when grain, shadow, tint and falloff are all zero on a flat ground ("Route: graphic" on the card). "The brand is flat" is not evidence; a coarse look at a contact sheet cannot see 1–2% grain or a soft shadow. With the layer off the film must win the other way (the OpenAI route): giant type (a line of 20% H or more in at least 10% of frames, one moment of 35% H or more), full-bleed photography or colour content, a strict grid. A flat ground with mid-size type and a screenshot is a white void, not a brand.

**Hero effects are budgets, not bans.** Every reference film uses at least one of these once, on the hero, with intent (Kinso: defocus, a halftone burst, an overshooting landing; Sovra: glow, a light comet, blur-in words). The tell is uniform use: the same effect on every element or every line.

| Effect | Budget per film | Where |
|---|---|---|
| glow / bloom, light comet, chromatic split, halftone burst | 2 under 30 s, 3 from 30 s, each | the hero element of the beat that earns it |
| overshoot landing, scale-pop, blur-in | the same | the hero line or object, never every entrance |
| particles / a dot burst | the same | only as the story's carrier or one burst on the payoff |

Each use is a `budget` entry in the score: `{"effect": "glow", "scene": 3, "target": "#send", "reason": "the one moment the answer lands"}` (`scripts/lib/budget.mjs`: an entry needs a hero target, never "all", and a reason of 12+ characters). `slop.mjs` errors when the same effect appears on more elements than the budget (`glow-uniform`, `blur-in-uniform`) and warns on an unbudgeted use; the motion contract counts entrances the same way.

**Brand lock restricts palette, type, logo, UI fidelity and tone. Never finish, depth, camera, shot size or colour content.** A brand's identity film ("Refreshed.") is evidence of its palette, type and motif; it is not the launch film's grammar. A launch film also looks at the brand's own product launch films and the category's best launch films, and never reads "the identity film never blurs" as "the launch film can't".

---

## 7. Sound (the rules in brief; full playbook in `references/sound.md`)

- **Never ship silent** unless the brief says so. A screen recording is not a deliverable.
- **Music is edited to picture:** analyse BPM, bars and sections; snap scene boundaries and key moments to bars (the picture flexes, the music doesn't; the film length is a target within ±½ bar). Start on a strong section so the first second is at full bed level. End on the track's own ending or a button (a final hit plus a tail of 2 s or less); a fade-out is the last resort; never loop anything under 8 bars. At least 50% of structural cuts sit on downbeats.
- **The reveal lands on a downbeat or the drop** (±1 frame), after a 0.5–1 s strip-down or silence. The logo lands on the ending hit. The score's `music_arc: { intro_until, drop_at, break, payoff_at, button_at }` says where: a soft intro under the hook, the drop on the reveal, a break before the payoff, a riser into it, a button ending on the logo (`references/sound.md`, "The music arc"). A flat bed (LRA under 2 LU) is a tell.
- **See and say:** each narration cue (a sentence, or a phrase ended by a 0.6 s pause) has an on-screen event within 1.0 s: a score event (`beats[].events`, scene-relative `t`), a beat start, or a line of text appearing (captions never count). `see-and-say` and `text-off-word` (text that names a word the voice says elsewhere) come from `motion-gate.mjs --vo <audio_meta.json|words.json>` (found as `<project>/audio_meta.json`) and `voice.mjs verify --project <dir> [--score <score.json>] [--offset <s>]`.
- **Say it once:** a caption and another on-screen line of 3+ words that share 70% of the line's words in the same window: `caption-duplicates-text` (warning). Drop the caption there or change the line.
- **Sound is part of every film, on every route** (a recorded silent deliverable, or an audio direction that gives effects no role, is a valid answer; see `references/sound.md` "Sound direction"). After the build, `sound.mjs sfx-plan` mounts SFX from the score's events and seams (a whoosh on a transition that moves through space, a hit when an object lands, a click on a UI tap, a tick on a counter, an impact on the reveal); a film of 15 s or more with no SFX cues fails `sound.mjs check` (`no-sfx`) unless silence is a stated choice (`audio/direction.json` or `--silent-by-choice`).
- **Sound has a role in the visual event** (new creative policy): for a signature event say whether sound is anticipation (a held breath, a riser), impact (the hit on the change), release (the tail after it) or deliberate silence; a whoosh on each cut is not a role. A still image cannot certify synchronization: sound is reviewed from actual produced media in an authorised later run.
- **SFX only for visible, causal events** (a click, a landing, a snap, a state change, the hero reveal), on a budget. Voiceover films: 1 per 2 s on average at most, 3 onsets in any 1 s window at most, 1 hero hit per 15 s. Whooshes only on a signature spatial transition: at most 1 in 3 transitions and 1 per 20 s (zero is fine). No sound on fades, text builds, stagger items, color changes or ordinary cuts; leave at least a third of visual events unsounded, and skip any event the music already hits. Each sound is placed by its measured sync point on the contact frame; by default audio does not lead the picture by more than 1 frame; a cue marked `anticipate` or `trail` carries its own intended offset and is judged against that. Rotate at least 3 variants of any repeated sound.
- **Mix:** music under voiceover at VO −12 LU (±3), measured; master at **−14 LUFS integrated (±1)**, true peak −1 dBTP or lower on the encoded MP4, LRA at most 6–9 LU. The last frame is silent; no silent or black tail.
- **Voice:** TTS draws the most hostile reactions of any tell. For films of 30 s or less that play muted in feeds, prefer no voiceover (type carries the message). When there is TTS, write for the ear (short clauses), give a pronunciation list, check every line by ear and transcribe it back.
- **Music search** names genre, instrumentation, production and BPM; never "corporate", "inspirational", "uplifting", "motivational", "ukulele", "whistle" or "keynote".

---

## 8. Story (the concept engine in `references/story.md`; the writing in `references/script.md`)

- **A launch is about the viewer's day first** (gate G12): its first quarter speaks to the viewer in second person, the brand arrives after the pain, every benefit says what the viewer gets, a proof carries a real number, the CTA names an action and a place, and a line lands every 1.5 to 2.5 s (`references/script.md`, the pas).

- **The cliché arc is banned as a default:** hook stat → problem montage → "Introducing X" → three features → CTA (the median launch video). Use it only when justified (a loved brand where craft is the message, offered as the "Sure" pitch with craft-forward execution), and say so in the reason. Even then, name one structural deviation the product justifies.
- **One idea in one sentence** (a borrowed form, one metaphor, one rule about time or camera, an unexpected protagonist), built from the product's own material. Swap test: put a competitor's name in; the concept must break. Features appear inside the idea as evidence: at most 3, each demonstrated, never listed.
- **A named turn** (legacy sheets placed it at 60–75%; that is a style default, not a law: Plan 03/05), the device readable by second 4, and an ending line or image that could stand alone as a poster.
- **One job per scene**, traceable to the message; cut anything the viewer can't read, see or hear at speed. No prompt-box opener for AI products; no stock metaphors (the handshake, the globe) without a product-specific twist.

---

## 9. Anti-slop

Every tell is a default left in place, uniformity, an effect without a cause, or a claim without specifics. Each row: the tell, then what to do instead. `slop.mjs` checks the ones it can (rule ids in brackets); the critic checks the rest. Any rule can be overridden by the brief or DESIGN.md with the reason written down.

**The Opus house style** (the showreel look everyone re-ran; take it only knowingly, as a chosen direction)

| Tell | Instead |
|---|---|
| Lone centered dot or ring opener | Open on the hook: the product, the tension, the first word of the claim. |
| Corner HUD labels: timecode, BPM, "01 — IDENTITY", crop marks, frame borders, progress bars [corner-micro-label (one rule: slop's timecode/BPM source check merges into it), chapter-counter, corner-brackets, header-footer-bar, progress-hairline] | No chrome unless the style is a HUD, broadcast or telemetry style that means it. Put the detail into the content. |
| Page chrome: a kicker above a headline, a held left-aligned headline beside right-side media, tracked-caps labels and taglines, a headline typed letter by letter with a caret [kicker-over-headline, deck-layout, tracked-caps-label, typed-headline] | One centred line or a split phrase; the context goes into the headline or the picture; words arrive whole (typing only inside the product's own input field). |
| Vibe-coded UI: a "Good morning" header, a status dot beside "label · value", zinc-grey text, on a card [vibe-greeting, vibe-ui-card, vibe-ui-tell] | The product's real screen from the capture (real names, copy, icons), marked `data-ui="captured"`. |
| A pill, dock or caption at the same coordinates through 3 or more shots; a flat colour plateau per scene [pinned-element; frame-gate flat-swatch-grounds] | A carrier that moves or changes role at every seam; a surface from the capture per act, flat only for a flood under 1 s. |
| Extended heavy grotesk plus an italic-serif "accent word" | The style's own pairing; one emphasis device, once. |
| Orange / cream / electric blue / black with hard switches | The style's palette; full-bleed switches only in its own colors. |
| Particle galaxy or torus, 3D cube-grid wave, truchet tiles [particles-unbudgeted] | One element from the story that moves for a reason; a dot field or burst only as the carrier or once on the payoff, budgeted. |
| The three.js demo: a lone object spinning in a void, a constant-speed orbit, flat light with no rim or shadow, a torus knot, rainbow normals, a neon grid floor [stage3d: linear-drift, never-rests, stock-primitive, placeholder-material] | The product or the film's own object, blocked at real scale, one motivated key, a lens chosen for the shot, camera legs that land and hold (`references/3d.md`). |
| "Name." lockup with a colored period | The brand's own lockup. |
| The second-order defaults, what we reach for once the first list is banned: a giant cropped word, a marquee band, texture inside the letters, a colour flood or circle wipe between beats, a dot that becomes the logo, a lockup built from the motif | Each is fine once, with a cause this brand can state in a sentence (see "Works when" below). Together, or in every film, they make every brand look like one designer's reel: pick at most one, and take it from this brand's own material. |
| Centered text on a soft gradient or blurred-blob background [centered-everything] | Anchor to the grid; a flat field or the style's surface; asymmetric layouts. |
| The post-purple "Claude look": cream ground, rust accent, italic serif with a highlighted word, tracked eyebrows, ticker bars | Not a fallback palette. Italic or highlighted emphasis once per film at most; no ticker unless the idea is literally a feed. |

**Look**

| Tell | Instead |
|---|---|
| Neon glow text, "everything glows" [glow-uniform, glow-unbudgeted] | Emphasis from size, weight, color and position. Glow is a budget: on the hero, 2–3 times per film at most, ≤ 2 s each, motivated, named in the score's `budget` (section 6, "Finish and budgets"). |
| Purple-blue "AI" gradients (hue 230–290°), gradient text [ai-gradient] | The style's palette; flat fields plus texture; one gradient surface per frame, between two adjacent brand colors. |
| Glowing orbs and brains, holographic panels, ✨ sparkles, emoji as icons | The product's real output. Icons from one drawn set that matches the brand, or none. |
| Bokeh, lens flares, floating dust with no source [particles-unbudgeted, lens-flare] | Atmosphere from a motivated light source and the finish layer (tinted ground, key light, grain); defocus as depth on a named plane, not as decoration. |
| Glassmorphism on everything | One glass surface per frame (the hero card: rim, inner highlight, backdrop blur ≤ 12 px), no text over busy blur. |
| Cards in cards, pills and badges, left-border accent stripes, default 12–16 px radius | No nested containers; at most 3 rounded boxes visible; the radius comes from the brand; type sits straight on the field. |
| Floating glossy phones, dashboards in a void at 30°, isometric floating cards, 3D icon packs | The real UI full-bleed or cropped tight; a device frame only when the context of use matters. |
| Three feature cards sliding in, "How it works" icon rows, stepper bars, stats rows, logo walls | One feature as a weapon inside a scene; data as one visual carrying one number. |
| Over-saturated, over-contrasted "crisp" HDR finish; teal-orange by reflex | A grade from the direction with a reason; natural saturation. |
| Cropped or overflowing type: letters running off the frame edge, a word wider than the safe area, a line set "as big as possible" [text-cropped] | One line inside the 6% safe area at the brand's type size; the transition fills the frame, the words stay readable; leave the frame only in a push-through of 1.2 s or less. |
| Hidden-letter puzzles: a missing letter or a dot knocked off so the line stops reading | The line reads normally throughout; the move is something you can say in one plain sentence. |
| Everything filled edge to edge; ten stacked effects | One focal point; ≥ 40% negative space on type frames; ≤ 2 effects per element. |
| Inter or system sans everything; one size, one weight [default-type, too-many-typefaces] | The style's pairing; 3 sizes, 2 weights. |

**Motion**

| Tell | Instead |
|---|---|
| Everything fades up and slides in on the same ease | Entrances by the object's nature; no entrance type on > 30% of entrances; ≥ 30% of elements present on the cut; eases by role. |
| Every move on one curve and one duration [obey dominant-ease, duration-grid; gate fluency] | A curve per role, durations from travel (motion.md, RasanMotion). |
| Moves snap and die; one thing at a time [gate fluency] | Long visible glides, the next gesture at 55–75% of the last, secondaries 2–4 frames behind, a camera layer. |
| Everything moves at once, then everything freezes | One primary with trailing secondaries; composed holds with a living layer; no dead stretch of 0.8 s [motion-gate freeze]. |
| Bouncy or elastic on everything | Settles on the budget: about 1 landing in 8, 3–8%, single return, never on text (bouncy languages excepted). |
| Idle breathing, floating, pulsing loops [idle-breathing] | A meaningful change, and lines that keep their carry. |
| Camera drifting for nothing; slow Ken Burns on everything; a slow film-wide push [motion-gate creep] | Moves that go somewhere, at 4% a second or faster, one per shot; otherwise locked. |
| Spinning or flipping logos [spinning-logo] | The logo resolves from brand geometry (strokes draw, parts assemble, a product-shaped mask) in 1.5 s or less, once (the one brand reveal), then travels into the end card or holds at most 1.4 s. |
| Camera shake, glitch or RGB split as "impact" | Only on an on-screen impact synced to a hit, ≤ 6 frames, ≤ 2 per 30 s (chromatic split is a budgeted effect); glitch only when the concept is glitch. |
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
| Abrupt endings mid-phrase, long generic fades, black or silent tails [no-end-hold] | The track's own ending or a button on a 2–3 s end card (at most 1.4 s of it still) with a tail. |
| Ukulele, whistles, claps, glockenspiel, "inspirational" piano, keynote minimal house | A music brief naming genre, instrumentation, BPM and a reason. |
| Music over the voice; a robotic TTS read; a voice that contradicts the picture | VO −12 LU; see-and-say sync; TTS checked by ear, or no voice. |

**Structure**

| Tell | Instead |
|---|---|
| Logo cold open; a company description as the opener [slow-hook] | The hook in 1.5 s; the logo opens only if the brand itself is the news. |
| The cliché 10-scene arc | `references/story.md`; one idea, a turn, a named deviation. |
| The same layout every scene | Layout variety (§5). |
| Uniform shot lengths [uniform-shots], or a narrow band of them [narrow-rhythm] | Rhythm (§2): group quick beats, give the reveal the longest shot. |
| Opening on black [black-open] | A designed, postable frame 0. |
| End card over 3 s, or still for more than 1.4 s; "thanks for watching"; social-icon walls | 2–3 s, one call to action, at most 1.4 s still. |

**Works when: the condition that makes a usual tell legitimate.** The tables above are defaults, not laws; a critic bans a tell only after checking its row here. A tell with its condition met is a decision; without it, a default.

| Usually a tell | Works when |
|---|---|
| Typewriter text with a caret | The product is something you type into and the typing happens inside its own input, or the caret becomes something (a divider, the logo's letter). Never a film headline, never the reveal style of every line. |
| A dissolve or crossfade | The dissolve is the meaning (privacy, forgetting, time passing), or the brand voice is calm and reassuring, or one object fades (a last phrase). Never the join between every scene. |
| A calm, still ending | A quiet brand, after sustained motion, with the mark already arrived (about 22 of 51 human-made films end calmly); still at most 1.5 s. |
| A giant cropped word, or a giant first word | The idea wants that word huge, it arrives once with a cause (a camera pan, a surface), and scale is not spent again. |
| A dot that becomes the logo; a lockup built from the motif; a transformation chain | The brand's own mark really is that shape and every link is true; otherwise the logo arrives by cause. |
| A hard colour flip | The change is the story beat and one element carries across the cut. |
| A count-up number | The number is the real offer, tied to the control that sets it; a proof number appears whole. |
| A held frame | A designed breath of 0.6 to 1.5 s with a stated reason, just before a payoff, with one living thing on it. |
| Page chrome: labels, counters, timecodes, headers, footers, kickers | **Never.** No condition. |

(Ideas adapted from motionmaxxing, Apache-2.0.)

**What reads as made, not generated** (ask for these; the critic checks for them): specificity over category (real UI, real data, numbers with units); one idea and one product-derived motif; a point of view, even humor or a risk; restraint (fewer effects, fewer movers, sounds only where they count); a visible human decision or imperfection left in on purpose; real texture and real sources (real photos, recorded sound); rhythm with dynamics (high and low points, cuts on the phrase); named references instead of adjectives; legibility and calm; honesty.

**Don't overcorrect.** Keep the clarity conventions (reading order, legible UI, a call to action at the end); deviate on voice, motif, palette, sound and structure. A film that avoids every item above but looks like the last three RasanAI films is its own house style: rotate.

---

## 10. Quality gates

Run these before the render question, in order. Never report a gate as passed if it could not run.

1. **Grounding pass.** List every visible string, number, price, name and logo in the built film with its source (the capture, a screenshot, the brief, the truth sheet's native words and proof). Anything without a source is removed or replaced with a sourced one; an open question goes to the console (`console.mjs ask`), never into the film. Also check for leaked labels and placeholders.
2. **Look at the frames yourself.** Render stills at frame 0; mid-scene (60–70% into each scene); mid-transition (each seam's midpoint); 0.1 s before and 0.2 s after every cut; and the final frame. **Read the PNGs.** Check: the focal point is obvious (squint test); type sizes and safe areas; no text collisions, clipping, widows or typos; contrast; one accent; layout variety across the sheet; no pop across cuts (continuing elements keep position, scale, opacity and direction); nothing from the Anti-slop tables. Without this loop the output is confident garbage.
3. **Automated checks.** `node scripts/obey.mjs --project videos/<name>` (the motion contract); `node scripts/stage3d.mjs check --project videos/<name>` (every 3D scene: seek-safe, not blank, eased on the contract, blurred where it moves, comes to rest, renderable); `node scripts/slop.mjs --project videos/<name> [--video <render.mp4>]` (these tells, reading time, dead air, black opening, loudness, and `text-fit`); `node scripts/motion-gate.mjs --video <draft.mp4> --project videos/<name> --plan <run>/motion/score.json` (measured on the draft: visible motion in at least 70% of frames, no still stretch of 0.8 s outside the end card, at most 1.5 s still at the end, motion on both sides of every seam within 0.2 s, at least two seams carried by an object, exactly one brand reveal, **fluency** (the curve-shape spread, the median visible move, concurrency, settles, duration spread, arcs, dead frames, cuts at rest: a weighted score of 0.70 to pass, calibrated on the reference films; a declared stillness style waives the activity checks), a slow whole-frame push as a warning, and `text-fit` from the code half run with `--project`: a visible text element (opacity above 0.5, 20 px or larger) whose box crosses the frame edge, or at rest leaves the 6% safe area, for more than 1.2 s continuously is the error `text-cropped`, with the time range and the first 40 characters; `slop.mjs --project` runs it too, and the page-chrome check: `references/motion-md-contract.md` "Page-chrome rules"). The same pass reads each line block (a SplitText line is one block): a statement-size line (type 3.5% of the frame height or larger) of 3+ words that is readable for less than 0.6 s plus 0.3 s per word is the error `text-too-brief`, and two readable lines whose boxes overlap by 15% or more for 0.3 s or longer are the error `text-overlap`; fix by holding longer, cutting words, moving or staggering them, never by speeding the read up; `data-read="skim"` (texture such as a scrolling chat log in a product shot) and `data-overlap="ok"` (a deliberate layered lockup) opt out; the sound checks in `references/sound.md` (loudness, true peak, SFX budget, sync, tail). Fix every error; only the user can waive one. New warnings (uncalibrated): `motion-gate` `motion-busy`, `energy-flat`, `energy-arc-off`, `calm-beat-busy`, `result-unheld`, `first-frame-empty`, `first-frame-mid-change`, `seam-continuity-missing`, `seam-colour-jump`; `frame-gate` `phone-small-text` (by destination, `lib/safezones.mjs`); the score check's `states-thin`, `result-unheld-plan`, `cast-canon-missing`, `continuity-break`, `hero-in-ui-zone`; each motion-gate finding carries `basis` and a `see` strip command.
4. **Clean-context critic.** Dispatch the crew's critic (`agents/critic.md`, lenses `frames`, `motion`, `grounding`, `film`; `crew.mjs brief --role critic --key <lens>-<round>`), a subagent with no conversation history. Give it only the stills and contact sheet, the draft render, the motion gate's report on it, the plan, the film's one-sentence message and this rubric. The motion and film lenses never judge without the render and the gate's report. It **defaults to reject** and scores 1–10:
   - **Design:** composition, hierarchy, type, color discipline, layout variety.
   - **Readability:** at phone size, reading time, contrast.
   - **Narrative:** hook in 2 s or less, value before evidence, the turn, the device clear by second 4, the ending.
   - **Brand:** real product, exact colors and fonts, the grounding pass holds.
   - **Motion and sound:** moves like a person animated it (a curve per role, long glides, overlap, settles, arcs, a living frame), no idle loops, cut sync, SFX causality; in 3D, lens, light and camera legs that land, and 2D ↔ 3D seams that match.

   It returns the 3–5 worst problems, each with a timestamp or frame number and an exact fix ("the card lands 6 frames early; delay it to frame 44"). Ship when every score is 8 or more. At most 2 fix passes; anything left goes to the render gate as fix-or-waive.
5. **Report the gates** in the render-gate message: obey, stage3d, slop and sound status, the critic's scores, and any waivers. **Quote the numbers, not the verdict**: the actual figures each gate printed on this render (cut rate, end hold, dead-air, loudness in LUFS, the motion gate's freeze and fluency lines, frame-gate values), which gates ran by script and which were judged by eye (the critic names them), and what you would still improve. A gate pass is a floor, not a verdict on taste: never write "clean" or "good" for your own film, and never report a gate that did not run.

### Frame metrics (`scripts/frame-gate.mjs`)

The gate that reads the picture, not the plan. A flat film (one centred widget, 100+ characters, nothing bigger than a heading, a white ground, nothing soft) passes every plan gate and fails here, with the number and the fix.

`node scripts/frame-gate.mjs (--stills <dir> [--html <boards dir>] | --video <film.mp4>) [--project videos/<name>] [--brand-film <grammar.json>] [--json]`. Exit 0 clean (warnings allowed), 2 errors, 1 could not run. Stills are the design boards; a video is sampled at 4 fps; `--project` (a film) or `--html` (boards with an `NN.html` beside each `NN.png`) adds the DOM text metrics, read from the rendered page headlessly, so text baked into a photo or screenshot is not counted (the load is a floor).

| Metric | Pass | Level | Refs measure |
|---|---|---|---|
| ground chroma (empty tiles, median) | ≥ 1.5 | error | 1.5 to 5 (Kinso 3.2, Sovra 2.4, v98327 2.2) |
| ground L* range (p95 − p5 of the empty tiles) | ≥ 4 | error | 4 to 19 |
| soft content (blurred share of structure) | film p90 ≥ 0.15, or ≥ 0.15 in 15% of shots | error if none, warning if thin | p90 0.18 to 0.45 |
| flat swatch grounds (`flat-swatch-grounds`): shots that are a plain colour on 9 sampled points (7 closest within 6% luma; the 2 an object covers are dropped), counted as distinct colours (Lab distance ≥ 8) | ≤ 3 distinct (needs 4+ shots) | warning above 3; error at 6 or more; waived when the brand film's ground is flat | n/a (the rule is the AI "deck of colour plateaus" tell, adapted from motionmaxxing's N4) |
| colourfulness p90 | ≥ 35 | warning | 45 to 127 (Google 19) |
| median characters on screen (DOM) | ≤ 40 | warning; error above 70 | 12 to 56 (OCR; Google's UI sheet 97) |
| p90/p10 of the biggest line, or object-scale p90/p10 | ≥ 5 | error | 6 to 23 (Sovra, v98327: objects carry it) |
| frames with a line ≥ 20% H | ≥ 10% | warning; error at 0 in 20 s or more | 12 to 37% |
| any moment ≥ 35% H | at least one | warning | Kinso 39%, OpenAI 88% |
| average hard-cut shot (films of 8 s or more) | ≤ 5 s, or ≥ 10 composition changes per 10 s | warning | 0.5 to 4 s |
| big moments (`boldness`, films of 15 s or more) | with `story/intent.json`: on the peak and half the importance-3 beats (`boldness-placement`); without: ≥ 25% of frames | warning with an intent (uncalibrated); without, error (warning in a declared stillness or editorial style) | 29 to 89% (Google 17%; FILM-D 54%, FILM-E 18%) |

- A **brand film's measured values replace these** (`--brand-film grammar.json`, whose `frameMetrics` block is written by `frame-gate.mjs --video <brand film> --write-brand grammar.json`): the limits become 75% of its numbers, never stricter than the table. A brand film that measures a flat ground (chroma under 0.5 and L* range under 2: OpenAI) waives the ground rules and turns the type-scale rules (text load, scale contrast, giant moment) into errors; one that never blurs (soft p90 under 0.05: OpenAI, Google) waives the soft rule. A neutral lit ground (chroma 0, range 2 or more) waives only the chroma rule.
- Flat is allowed only when the brand film is flat and the type or the objects then do the work. "Brand is flat" never excuses a screenful of UI.
- The numbers are the picture's: fix them in the picture. Tint and light the ground, put a blurred plane behind the hero, set one line at 20 to 40% H, cut the copy to one component. Do not game them: a blur on a transition frame or a giant word nobody reads passes the gate and fails the squint test.
- The frame juror and the critic run it on the boards and on the draft; the findings go into the brief of the next pass. Calibration and the full table: `.context/night/done-W2.md`.
- Without `--project` (or `--html` for boards) the DOM checks (text load, competing heroes, scale contrast, giant moment, peak moment) do not run, and the result lists them under `skipped`: pass `--project` on every draft.

#### Boldness

FILM-E passed every gate and was safer than FILM-D: the same composer at one scale on one grey ground, where FILM-D had "I only" filling the frame, a blue ground beat, giant numerals and a dot field. A motion designer sees that at a glance; `boldness` measures it. Each sampled frame (4 fps) is a **big moment** when it holds one of:

- a **giant glyph**: a letter, numeral, ring or icon 15% H or taller, drawn with a stroke (1.2% H or more, at most 0.4 of its height, filling at most 60% of its box): giant type, cropped or not. A photo or a panel is not a glyph (solid), a hairline UI box is not either;
- a **frame-filling object**: one mass, off the ground, covering 40% of the frame (the product pushed in);
- a **colour field**: the frame's own ground covers 40% of it and is dE 20 or more from the film's main ground (a cut to the brand blue, a dark beat in a white film);
- with `--project`, a DOM line of 20% H or more.

**Emphasis goes where the story puts it.** Boldness is no longer a quota to hit everywhere. With `story/intent.json`, `frame-gate` asks whether the big moments sit where the intent puts them: in the `peak: true` beat and in at least half of the importance-3 beats (`boldness-placement`, a warning). `motion-gate` adds an emphasis curve per 0.5 s (boldness flags 50%, frame change 25%, loudness 25%) and reports the measured peak against the planned one: `emphasis-off-peak` when the maximum is outside the peak beat (±0.5 s), `emphasis-on-minor` when the film's biggest moment falls on an importance-1 beat (FILM-D's salad price). On the plan, `score.big_moments` is a budget, about 4 per 30 s at most: `budget-minor-beat`, `budget-over`, `budget-none`. All are warnings until calibrated on the reference films and FILM-D.

Without an intent, the 25% film-wide share stays the floor: the film needs big moments in **25% of its frames**. The references: Kinso 89%, v9721 47%, v98327 76%, v20023 48%, p(doom) 67%, OpenAI "Refreshed." 36%, Sovra 29% (the floor); Google "Ask" 17% fails (a calm UI-sheet film carried by product photography: the honest exception). Ours: FILM-D 54% passes; FILM-E 18%, FILM-C 10%, the ask grid 11%, Greenroom 0% fail. The finding also gives the number of **grounds** (colours that hold 3% of the film; FILM-E 1, FILM-D 3; the references 1 to 3, so it informs and never fails alone) and the **longest stretch without a big moment**, which is where the missing one belongs. A talking head on footage passes trivially (the person is a big mass): the check is for motion graphics. Fix in the picture, on the peak and the importance-3 beats: a word at 20 to 40% H, a push-in to 40% of the frame, a cut to a second ground; never a giant word nobody reads, and never a big moment on a beat that buys little.

Footage-led films are exempt: the plan's route `reel` / `talking-head-recut` / `embedded-captions`, `score.footage_led` / `score.footage`, the run's brief.json route, or `frame-gate.mjs --footage`. A talking head fills the frame and would read as always bold; the gate says "skipped: footage-led".

---

## 11. Reporting decisions

Every Claude-decided step is pushed `--status done` with a `decision` a person can read at a glance: **one plain line, then the reason tied to this film**, with the proper term in brackets for the brief. Format: `<what, in plain words> (<term>): <why, for this film>`, about 20 words at most. Examples:

- `Hard cuts, with one mask wipe at the reveal (cut; mask wipe): editorial style, and the wipe mirrors the page turn in scene 4`
- `Lit by the product's own screen in a dim room (screen glow): it keeps the app the hero of the late-night story`
- `7 scenes, 34 s, the reveal holds longest (pacing): the reveal carries the claim`

- Report what a person could have an opinion on: the route, scenes and length, pacing and rhythm, transitions, camera, lighting and grade, the sound plan, the cursor and UI treatment, and **any rule in this file you broke on purpose, with why**. Don't report eases, staggers and pixel values; they live in the brief.
- After a "you decide", add the receipt: what was picked and the obvious option passed over.
- A `note` on a decision gets a `reply` in the console; make the change, re-push the step, and say what changed.

---

## Related guides (one source of truth each; this file links, it does not repeat)

- **Timed reads** (what the viewer must notice, in what order, for how long; the optional `reads[]` of a scene): [reads](reads.md). It extends the reading-time rule above and `result-unheld-plan`; it never claims a viewer understood anything.
- **Character timing and canon** (a recurring painted 2D actor, the 31 emotions, A-B-A seek safety, held reactions): [2d-character](2d-character.md); the 3D actor on the current runtime: [3d](3d.md), "The recurring 3D actor".
- **Evidence truth rules** (every number, geometry and measurement traced to a source; sketches labelled SCHEMATIC; fixtures never claims): [evidence](evidence.md).
- **Score and audio** (the derived, hash-stamped event timeline picture, sound and QA share; the optional original procedural score): [film-events](film-events.md), [procedural-music](procedural-music.md), and [sound](sound.md) for the mix.
- **Blur on stepped scenes**: [finish](finish.md). A painted Rasan2D scene is drawn on twos (12 drawings a second), so its frame root carries `data-finish-blur="off"` and `finish.mjs` leaves it sharp by itself.
