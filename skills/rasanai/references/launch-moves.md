# Launch moves: what the reference films actually do (and the AI cliches to avoid)

Read with `launch-grammar.md` (section 4e). The moves below were watched frame by frame in **Minase**, **Kinso** and **Sovra.fm** (strips in the owner's `.context/moves/`; breakdowns in `library/benchmarks/launch-refs/`). They are third-party films: take the **mechanic**, never a frame, line, mark or palette.

Owner (2026-11-02): "A cursor moving through a piece of text and then the highlighted word giving a nudge is so AI style, way too standard." The standard is the failure. Name a move per beat in the score's `moves[]` (ids below); **no move in more than 2 beats**; the check `move-repeat` counts them.

What makes these feel designed, not AI:
- **Objects act on type physically**: they split words, slash through them, carry them on a shelf, iris them out. Nothing points at a word.
- **Focus, scale and blur tell the story** (a rack focus between type and object, a scale zoom as the transition), not decoration.
- **Each scene has its own idea.** No signature move repeats more than twice.
- **Texture contrast**: stepped and flicker against smooth calm; dense against radically empty.
- **Real material**: footage, generated worlds inside UI, a hex texture, glass with reflections, colour light.
- **Copy becomes a literal visual metaphor** (Sovra): "Same loops" is nested loop rings; "Your energy" is a glow bloom.

## Helpers

`runtime/rasan-texture.js` (`RasanTexture`, installed with the world runtimes: `node scripts/motionkit.mjs install-world --project <project>`, load after GSAP). Every helper takes your film's paused GSAP timeline and a start time, builds its DOM once, and is a pure function of the timeline's time (seek-safe, deterministic, no `Math.random`, no clock):

| Helper | Move |
|---|---|
| `RasanTexture.stepped(tl, at, {build, duration, fps})` | a whole section on twos or threes (a detached timeline seeked to `floor(t*fps)/fps`) |
| `RasanTexture.stepsEase(fps, duration)` | `steps(n)` ease for one stuttering tween |
| `RasanTexture.flicker(tl, at, {target, items, duration, every, fps, final})` | the flicker montage |
| `RasanTexture.glitchPop(tl, at, {el, duration, slices, amp, rgb})` | the glitch pop-in |
| `RasanTexture.objectSplitsWord(tl, at, {target, text, splitAt, object})` | move 1 |
| `RasanTexture.redactionSlash(tl, at, {target, word, color})` | move 2 |
| `RasanTexture.slotList(tl, at, {target, items, fps, duration})` | move 13 |
| `RasanTexture.scaleTransition(tl, at, {el, from, to, next})` | move 4 |
| `RasanTexture.irisThrough(tl, at, {target, keep, cx, cy, color})` | move 5 |
| `RasanTexture.cutsUnder(tl, at, {layers, times, end})` | move 9 |

## Texture recipes (HyperFrames / GSAP)

- **Stepped.** Either (a) one tween with the GSAP steps ease: `tl.to(card, { x: -900, duration: 2, ease: "steps(" + Math.round(12 * 2) + ")" })` (12 fps over 2 s), or (b) a section-wide time quantiser: build the section on a detached paused timeline `inner = gsap.timeline({ paused: true })` and drive it from ONE tween on the film timeline whose setter calls `inner.time(Math.floor(t * fps) / fps)` (`RasanTexture.stepped`). Never wrap or override the film timeline's own `time()`: seeking and rendering break. Fps: 12 (on twos at 24), 10 (on threes at 30, Minase's collage) or 8 for a harsher stutter. Held frames of 3 or fewer count as motion in the stillness gate.
- **Flicker montage.** Stack the cards or images; show one per 1 to 2 frames for 0.5 to 2.5 s (`flicker`), in a seeded order, then land on the item that stays. Use it as a burst between two smooth beats, never for a whole scene.
- **Glitch pop-in.** The element enters as 4 to 6 horizontal slices (`clip-path: inset(top 0 bottom 0)` clones) displaced by seeded offsets that decay over 1 to 2 frames of jitter at 24 fps, with an optional RGB split (two screen-blended copies offset a few px); the clean element lands on the last frame. 0.2 to 0.4 s per pop.

## The 15 reference moves

Ids are what the score's per-beat `moves_named[]` names.

**Kinso**

1. **`object-splits-word`.** A white phone-shaped pill rises through the middle of "here" and pushes the letters apart (h | re); app icons with unread badges stack inside it and tick up; the word reflows to "some | where" around it. Build: split the word into two spans; push them apart by the object's width (`x: -w/2`, `x: +w/2`) while the object rises through the gap (`y` from below); put a blur rack on the text (`filter: blur(14px)` ramp) while the object stays sharp; a slow push-in on the whole stage. `RasanTexture.objectSplitsWord`.
2. **`redaction-slash`.** "Woah" on a white pill; a red bar slashes across the middle of the word, then the pill shrinks away. The object acts on the word; nothing underlines it. Build: a bar with `transform-origin: 0 50%` and `rotate(-6deg)` scaling `scaleX 0 to 1` (expo.out, 0.4 s) over the word's middle; then `scale` the pill to 0. `RasanTexture.redactionSlash`.
3. **`glass-shelf`.** "You are a really [busy person]": a translucent glass slab slides in under the last words and they land on it with a gradient fill and a reflection; an orb drops in, bounces once, settles above the line (a physical object with weight, not a cursor). Build: a slab with `backdrop-filter: blur(18px)`, a 1px bright top edge, a flipped, masked, 20% opacity copy of the words as the reflection; `background-clip: text` gradient on the words; the orb on a bounce ease (one settle, 3 to 8%).
4. **`scale-as-transition`.** "One inbox" starts frame-filling and shrinks continuously to small type; the zoom-out is the transition into the next scene. Build: `scale` from 6 to 0.4 on the line (`expo.out`, 0.9 s) with the next scene fading in behind during the second half. `RasanTexture.scaleTransition`.
5. **`iris-through-object`.** The orb becomes a big soft sphere behind a notification card; a dark ring grows into a circular iris that swallows the frame to dark while the card survives the cut. Build: an overlay with `radial-gradient(circle at cx cy, transparent r, dark r)` whose `r` is driven by a progress tween (a pure function of p); raise the kept object above it (`z-index`). `RasanTexture.irisThrough`.
6. **`logo-builds-itself`.** The mark morphs from one outline into its double form beside "Meet", then the whole lockup scales down: small and calm. Build: an SVG path `stroke-dashoffset` draw then fill, or a path-to-path morph; the lockup `scale` to 0.5 on a sine ease.
7. **`oversized-type-bleed`.** A tiny count-up ("Join 2,311 to 27,300 others") ticks up in a few frames, then "on the waitlist" slides in huge from the right, bleeding off the frame edge. Build: a count-up as a progress tween rounding a value; the oversized line starts at `x: 110%` and settles with part of it still cropped by the frame.

**Minase**

8. **`restraint-slate`.** A tiny typewriter caption with a dot bullet, alone on pure white; then a tiny centred "That's it". Small type in vast space is deliberate: a breath between dense beats. Size contrast across the film is the point.
9. **`persistent-type-over-cuts`.** A caption types itself while three footage shots cut underneath it on the beat; the line is the anchor. Build: the type on a higher track; the shots toggled with `tl.set(autoAlpha)` at the hit times. `RasanTexture.cutsUnder`.
10. **`footage-word-by-word`.** Moody dark stock with words fading in one by one mid-frame; an icon chip inserts between words ("people (up arrow) don't read"); UI objects fly in stepped and stack over the footage. Build: a word row where each word's width animates open to admit the chip; stepped fly-ins (`RasanTexture.stepped`).
11. **`stepped-dashboard-scroll`.** A dense analytics dashboard scrolls sideways on threes (about 10 fps) while its numbers tick. Build: `ease: "steps(N)"` on the scroll tween (or `stepped`), the numbers on their own count-up tweens.
12. **`orbit-diagram`.** Dashed concentric circles rotate, with small labelled nodes and coloured ring markers travelling the orbit; the mono centre text swaps "Same product" to "different world". A system diagram, not UI. Build: SVG circles with `stroke-dasharray`, groups rotating at different speeds, nodes on `motionPath` or computed positions per progress.
13. **`slot-list`.** A vertical list of words steps through a fixed arrow; the focused word is dark, the rest faded. Build: a column translated in steps (`steps(n)` ease, or `RasanTexture.slotList`) with per-row opacity set from the focused index. Sovra uses the same move.
14. **`mixed-type-collage`.** "product is weak" sets a serif against a sans at different scales with UI cards overlapping the letters. Build: absolutely placed words at 2 to 3 sizes, one italic serif; cards on a higher z-index crossing letters.
15. **`stepped-collage-flicker`.** Landing pages and cards (with generated grass-hill worlds inside) scroll and assemble on threes, then a frame-level flicker burst swaps cards and stats. Build: `stepped` for the assembly, `flicker` for the burst.

**Sovra.fm** (the third reference; same ids where the move repeats, new ones below)

16. **`metaphor-from-copy`.** The copy becomes a literal image: a "Same songs / Same feeds / Same loops" pill grows into nested loop rings; "Your energy" becomes a glow bloom (a one-off bloom on the hero word, tied to its meaning: not a pulsing glow).
17. **`product-flow-demo`.** A mini demo with the product's real states: the prompt typed (the one typed line), Create clicked, a progress ring 11% to 100%, the result (album art with a vinyl sliding out). Build with the real UI kit (`ui-rebuild.md`); the cursor is used here for real actions.
18. **`product-character`.** A DJ orb with eyes, with labelled gradient ribbons (Talking / Reacting / Flowing) as a local motif that bookends. A character the product owns, not a mascot imported from outside.
19. **`line-lighting`.** "You've been listening to music wrong" lights up line by line, dim to bright, like a reading guide; the key word is the brightest. Build: per-line opacity and colour tweens (0.25 to 1) in sequence; no cursor, no underline.
20. **`border-light-trace`.** A light trace runs along a UI card's border (the prompt box); a single particle burst on a button press (once, tied to the action). Build: an SVG rect with `stroke-dasharray` and a moving `stroke-dashoffset`, blurred copy for the glow.

## AI cliches: banned, or rare tools

The check names are warnings in `launch-beats` (`clicheFindings`).

| Cliche | Rule | Check |
|---|---|---|
| A highlighted word that scales up, bounces, nudges, wiggles or pulses as the emphasis | **Banned** | `cliche-banned-move` |
| Glowing pulse rings or "breathing" glow on an element | **Banned** | `cliche-banned-move`, `cliche-glow-particles` |
| Bokeh dots or floating particles as atmosphere | **Banned** (one button-press burst tied to an action is a move, not atmosphere) | `cliche-glow-particles` |
| A travelling cursor or caret | **A rare tool: once per film**, only when a real typing, selecting, clicking or dragging moment in the product earns it (Sovra: Create, upload, remove Spotify). Declare `cursor_reason`. Build it well: a real cursor or caret shape at the right scale (3 to 4% of the short side), motion on an arc with ease in and out (never linear), one purposeful action at the end (select, click, drag), never a generic nudge on the word | `cliche-cursor-repeat`, `cliche-cursor-reason` |
| A typewriter caret on every line | Rare: 2 typed lines per film at most (Minase types twice) | `cliche-typed-lines` |
| Every word fading up the same way (uniform blur-up stagger) | Rare: 2 lines at most, then vary: slot scroll, swap, split, slash, scale-zoom, persistent-over-cuts | `cliche-word-fade` |
| Cards that slide up with a soft shadow, one after another | Rare: 2 per film at most | `cliche-slide-up-cards` |
| An underline swiping under a word as the emphasis | Rare: once per film, never the highlight beat | `cliche-underline` |
| One carrier, move or transition across the whole film | Banned: a carrier on 40% of beats at most, no move in more than 2 beats, no transition over 30% of seams | `carrier-overuse`, `move-repeat`, `transition-variety` |
| Everything centred, everything smooth on one ease | Banned: scale and texture contrast | `texture-*`, `scene-*` |

## Emphasis vocabulary to use instead

An object splitting the word; a redaction or slash bar; a glass shelf under the words; a gradient fill inside a word; a rack focus between word and object; a scale zoom of the line; an icon chip inserted between words; a serif against sans swap inside a line; a slot-list focus; an in-place word swap; reading-guide line lighting; persistent type over cutting footage; oversized type bleeding off the frame.

## The score fields

Per beat: `scene_type`, `texture` (+ `fps`), `transition_in`, `moves: ["object-splits-word"]`, optional `carrier_state`, `imagery`, and `cursor_reason` when a cursor travels. `crew.mjs check --role motion-director` and `motion-gate` read them (`scripts/lib/launch-beats.mjs`).
