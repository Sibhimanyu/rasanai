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
| `RasanTexture.stepped(tl, at, {build, duration, fps})` | a collage assembling or pop-ins on twos or threes (a detached timeline seeked to `floor(t*fps)/fps`); never a scroll, pan, push, glide or orbit |
| `RasanTexture.stepsEase(fps, duration)` | `steps(n)` ease for one stuttering tween |
| `RasanTexture.flicker(tl, at, {target, items, duration, every, fps, final})` | the flash-frame burst (one varying element, 8 to 24 frames, `every` 2 to 3, lands on `final` and holds) |
| `RasanTexture.glitchPop(tl, at, {el, duration, slices, amp, rgb})` | the glitch pop-in |
| `RasanTexture.objectSplitsWord(tl, at, {target, text, splitAt, object})` | move 1 |
| `RasanTexture.redactionSlash(tl, at, {target, word, color})` | move 2 |
| `RasanTexture.slotList(tl, at, {target, items, fps, duration})` | move 13 |
| `RasanTexture.scaleTransition(tl, at, {el, from, to, next})` | move 4 |
| `RasanTexture.irisThrough(tl, at, {target, keep, cx, cy, color})` | move 5 |
| `RasanTexture.cutsUnder(tl, at, {layers, times, end})` | move 9 |

## Texture recipes (HyperFrames / GSAP)

- **Stepped.** Either (a) one tween with the GSAP steps ease: `tl.to(card, { x: -900, duration: 2, ease: "steps(" + Math.round(12 * 2) + ")" })` (12 fps over 2 s), or (b) a section-wide time quantiser: build the section on a detached paused timeline `inner = gsap.timeline({ paused: true })` and drive it from ONE tween on the film timeline whose setter calls `inner.time(Math.floor(t * fps) / fps)` (`RasanTexture.stepped`). Never wrap or override the film timeline's own `time()`: seeking and rendering break. Fps: 12 (on twos at 24), 10 (on threes at 30, Minase's collage) or 8 for a harsher stutter. Held frames of 3 or fewer count as motion in the stillness gate.
- **Flicker montage = a flash-frame burst.** One varying element in a locked layout (a climbing number, the same word in many fonts, a stack of app icons or UI states, one card in many states); never unrelated metrics or messages, the viewer cannot read them. Each flash 2 to 3 frames (1 only as an accent); the whole burst 8 to 24 frames (about 0.3 to 0.8 s), on a riser or stutter aligned to beat subdivisions; it lands on one held readable frame of 12 frames or more, on the downbeat, which carries the real message. Only as a build-up before a reveal, drop or beat hit, or to convey abundance, overload or speed; 1 to 2 per film, never back to back. Photosensitivity (WCAG 2.3.1 / Ofcom): at most 3 high-contrast full-frame flashes per second, never alternate full-frame black and white, no saturated red flashing; keep the ground constant and change only part of the frame. The beat declares `burst_content: "single-element"`, `burst_frames` and `lands_on` (`flicker-burst-fields`).
- **Stepped belongs to discrete motion.** Use it for pieces arriving or assembling in a collage, pop-ins and state changes, montage bursts, hits on the beat, things that jump between positions. Never on a scroll, pan, camera push, long glide, orbit rotation or slide-across: those stay fluid (`stepped-fluid-move`).
- **Glitch pop-in.** The element enters as 4 to 6 horizontal slices (`clip-path: inset(top 0 bottom 0)` clones) displaced by seeded offsets that decay over 1 to 2 frames of jitter at 24 fps, with an optional RGB split (two screen-blended copies offset a few px); the clean element lands on the last frame. 0.2 to 0.4 s per pop.

## The reference moves (15 from Minase and Kinso, then Sovra, TaskShelf, Kinso typography)

Ids are what the score's per-beat `moves_named[]` names.

**Kinso**

1. **`object-splits-word`.** A white phone-shaped pill rises through the middle of "here" and pushes the letters apart (h | re); app icons with unread badges stack inside it and tick up; the word reflows to "some | where" around it. Build: split the word into two spans; push them apart by the object's width (`x: -w/2`, `x: +w/2`) while the object rises through the gap (`y` from below); put a blur rack on the text (`filter: blur(14px)` ramp) while the object stays sharp; a slow push-in on the whole stage. `RasanTexture.objectSplitsWord`.
2. **`redaction-slash`.** "Woah" on a white pill; a red bar slashes across the middle of the word, then the pill shrinks away. The object acts on the word; nothing underlines it. Build: a bar with `transform-origin: 0 50%` and `rotate(-6deg)` scaling `scaleX 0 to 1` (expo.out, 0.4 s) over the word's middle; then `scale` the pill to 0. `RasanTexture.redactionSlash`.
3. **`glass-shelf`.** "You are a really [busy person]": a translucent glass slab slides in under the last words and they land on it with a gradient fill and a reflection; an orb drops in, bounces once, settles above the line (a physical object with weight, not a cursor). Build: a slab with `backdrop-filter: blur(18px)`, a 1px bright top edge, a flipped, masked, 20% opacity copy of the words as the reflection; `background-clip: text` gradient on the words; the orb on a bounce ease (one settle, 3 to 8%).
4. **`scale-as-transition`.** "One inbox" starts frame-filling and shrinks continuously to small type; the zoom-out is the transition into the next scene. Build: `scale` from 6 to 0.4 on the line (`expo.out`, 0.9 s) with the next scene fading in behind during the second half. `RasanTexture.scaleTransition`.
5. **`iris-through-object`.** The orb becomes a big soft sphere behind a notification card; a dark ring grows into a circular iris that swallows the frame to dark while the card survives the cut. Build: an overlay with `radial-gradient(circle at cx cy, transparent r, dark r)` whose `r` is driven by a progress tween (a pure function of p); raise the kept object above it (`z-index`). `RasanTexture.irisThrough`.
6. **`logo-builds-itself`.** The mark morphs from one outline into its double form beside "Meet", then the whole lockup scales down: small and calm. Build: an SVG path `stroke-dashoffset` draw then fill, or a path-to-path morph; the lockup `scale` to 0.5 on a sine ease.
7. **`oversized-type-bleed`.** A tiny count-up ("Join 2,311 to 27,300 others"; the film's one count-up, a real hero number) ticks up in a few frames, then "on the waitlist" slides in huge from the right, bleeding off the frame edge. Build: a count-up as a progress tween rounding a value; the oversized line starts at `x: 110%` and settles with part of it still cropped by the frame.

**Minase**

8. **`restraint-slate`.** A tiny typewriter caption with a dot bullet, alone on pure white; then a tiny centred "That's it". Small type in vast space is deliberate: a breath between dense beats. Size contrast across the film is the point.
9. **`persistent-type-over-cuts`.** A caption types itself while three footage shots cut underneath it on the beat; the line is the anchor. Build: the type on a higher track; the shots toggled with `tl.set(autoAlpha)` at the hit times. `RasanTexture.cutsUnder`.
10. **`footage-word-by-word`.** Moody dark stock with words fading in one by one mid-frame; an icon chip inserts between words ("people (up arrow) don't read"); UI objects fly in stepped and stack over the footage. Build: a word row where each word's width animates open to admit the chip; stepped fly-ins (`RasanTexture.stepped`).
11. **`dashboard-scroll`** (was `stepped-dashboard-scroll`; the owner found stepping a sideways scroll wrong, 2026-11-02). A dense analytics dashboard scrolls sideways, **fluid** (a single-direction move stays smooth); its cards and chips may pop in or assemble stepped (`RasanTexture.stepped` on the assembly only). The numbers are static values, not tickers.
12. **`orbit-diagram`.** Dashed concentric circles rotate, with small labelled nodes and coloured ring markers travelling the orbit; the mono centre text swaps "Same product" to "different world". A system diagram, not UI. Build: SVG circles with `stroke-dasharray`, groups rotating at different speeds, nodes on `motionPath` or computed positions per progress.
13. **`slot-list`** (rare: once per film). A vertical list of words steps through a fixed arrow; the focused word is dark, the rest faded. Build: a column translated in steps (`steps(n)` ease, or `RasanTexture.slotList`) with per-row opacity set from the focused index. Sovra uses the same move.
14. **`mixed-type-collage`.** "product is weak" sets a serif against a sans at different scales with UI cards overlapping the letters. Build: absolutely placed words at 2 to 3 sizes, one italic serif; cards on a higher z-index crossing letters.
15. **`stepped-collage-flicker`.** Landing pages and cards (with generated grass-hill worlds inside) scroll and assemble on threes, then a frame-level flicker burst swaps cards and stats. Build: `stepped` for the assembly, `flicker` for the burst.

**Sovra.fm** (the third reference; same ids where the move repeats, new ones below)

16. **`metaphor-from-copy`.** The copy becomes a literal image: a "Same songs / Same feeds / Same loops" pill grows into nested loop rings; "Your energy" becomes a glow bloom (a one-off bloom on the hero word, tied to its meaning: not a pulsing glow).
17. **`product-flow-demo`.** A mini demo with the product's real states: the prompt typed (the one typed line), Create clicked, a progress ring 11% to 100%, the result (album art with a vinyl sliding out). Build with the real UI kit (`ui-rebuild.md`); the cursor is used here for real actions.
18. **`product-character`.** A DJ orb with eyes, with labelled gradient ribbons (Talking / Reacting / Flowing) as a local motif that bookends. A character the product owns, not a mascot imported from outside.
19. **`line-lighting`.** "You've been listening to music wrong" lights up line by line, dim to bright, like a reading guide; the key word is the brightest. Build: per-line opacity and colour tweens (0.25 to 1) in sequence; no cursor, no underline.
20. **`border-light-trace`.** A light trace runs along a UI card's border (the prompt box); a single particle burst on a button press (once, tied to the action). Build: an SVG rect with `stroke-dasharray` and a moving `stroke-dashoffset`, blurred copy for the glow.

**TaskShelf** (the fourth reference, 71 s, voice-over with readable on-screen copy and quick cuts; `library/benchmarks/launch-refs/taskshelf`)

21. **`readable-copy-quick-cuts`.** The copy mirrors the voice-over line by line, each line held long enough to read, and the treatment changes radically cut to cut: a tiny inline line, huge type, halftone mega type, a black band of oversized text bleeding off the frame, a split card (text half | photo half). Cut every 2 s or so; the type is the story, so it must stay readable.
22. **`inline-icon-chips`.** Chips sit inside the sentence: "that's [orb] why", "everything [link chip] connected", "comes from -> [Slack][GitHub][Outlook][Calendar]" stacking in one by one. Build: the chip is a span that opens its own width in the word row.
23. **`ui-as-typography`.** The copy is a UI element: a dropdown "List of platforms: Notion / Jira / Asana / Linear" that collapses into the next line. Build: a real caret, rows with icons, a height tween to collapse.
24. **`cost-pain-stacked-prices`.** Huge stacked prices ("-$14.5 -$23.9 -$7.97") scroll through and off the frame edge; then small floating prices scattered around "Spend smart". The numbers scroll or sit; they do not count (not a ticker).
25. **`halftone-display-type`.** Display type built from a halftone or dot-matrix texture (mega "then...", "Sprints"), and a pixel heart: graphic texture inside type. Build: `background-clip: text` with a radial-gradient dot pattern, or an SVG dot grid masked by the word.
26. **`stepped-blocks-across-type`.** Orange blocks jump across the halftone words on threes. Stutter used correctly: discrete blocks that jump between positions (`RasanTexture.stepped`), never a glide.
27. **`tilted-ui-dolly`.** The product UI is 3D-tilted (`rotateX/rotateY` with perspective) and the camera dollies in; a real cursor does real actions (Add member, Create task, multiplayer cursors on a feature request). The dolly is fluid.
28. **`hand-drawn-annotation`.** Hand-drawn arrows and notes on a pricing comparison ("Every feature / Every person"): a human touch. Build: SVG paths drawn by `stroke-dashoffset`, a handwriting font.
29. **`logo-on-photo-plate`.** The mark on a real photo texture plate (concrete with a light beam), then a hand-drawn line morphs into the logo.
30. **`typed-cta-end`.** The end card: the logo plus a typed CTA ("Start your 7-day free trial now"). The film's one typed end line.

**Kinso typography details**

31. **`type-motion-smear`.** Type displaced by an object gets a heavy directional motion smear with chromatic fringing (blurred, furry edges) while the object splitting it stays crisp. Build: a directional blur (stretched `scaleX` copy at low opacity, or an SVG feGaussianBlur with stdDeviation "x 0"), RGB-offset copies.
32. **`redaction-pill-live-number`.** A redaction pill across a word with a small live number inside ("W[1,491]ah"). A count inside an object that acts on the type is fine; it is the film's one count-up, not a decorative ticker.
33. **`glass-pane-refraction-wipe`.** A curved or diagonal glass sheet sweeps across the frame; type is sharp on one side and blurred or refracted behind the glass ("for eve|ry"). Build: a pane with `backdrop-filter: blur()` inside a `clip-path` polygon that travels, a thin bright edge.
34. **`corner-selection-brackets`.** Small accent squares at the corners frame a text block ("And ranks messages by it"), beside a soft brand orb and a clean UI card.

**Payoff**

35. **`oversized-emerging-type`** (recommended payoff move; the v3 "26Keys / improves / you."). The payoff line emerges at huge scale, offset and staggered line by line, bleeding toward the frame edge, then settles; the one place the film spends everything on type.

## AI cliches: banned, or rare tools

The check names are warnings in `launch-beats` (`clicheFindings`).

| Cliche | Rule | Check |
|---|---|---|
| A highlighted word that scales up, bounces, nudges, wiggles or pulses as the emphasis | **Banned** | `cliche-banned-move` |
| Glowing pulse rings or "breathing" glow on an element | **Banned** | `cliche-banned-move`, `cliche-glow-particles` |
| Bokeh dots or floating particles as atmosphere | **Banned** (one button-press burst tied to an action is a move, not atmosphere) | `cliche-glow-particles` |
| A travelling cursor or caret | **A rare tool: once per film**, only when a real typing, selecting, clicking or dragging moment in the product earns it (Sovra: Create, upload, remove Spotify). Declare `cursor_reason`. Build it well: a real cursor or caret shape at the right scale (3 to 4% of the short side), motion on an arc with ease in and out (never linear), one purposeful action at the end (select, click, drag), never a generic nudge on the word | `cliche-cursor-repeat`, `cliche-cursor-reason` |
| A typewriter caret on every line | Rare: 2 typed lines per film at most (Minase types twice) | `cliche-typed-lines` |
| Word-by-word appear-from-bottom (rise + fade per word) | **Standard AI entrance: at most one line per film, never the default.** Prefer a swap in place, an object splitting a word, a slash, a scale-zoom, persistent type over cuts, a typed line used rarely, a hard cut on the beat, a mask wipe or a stepped pop | `cliche-word-rise` |
| The standard zoom-in plus fade (scale up or down combined with an opacity fade) as an entrance or transition | **Once per film at most**; prefer a mask, a swap, an object splitting the word, a hard cut on the beat, a stepped pop, or scale as the transition itself | `cliche-zoom-fade` |
| Counting numbers: odometer, count-up stats, ticking numbers, streak counters, dashboard tickers | **At most one count-up per film**, only for a real hero number that matters to the story (social proof, "Join 27,300 others"). Decorative tickers and several counting numbers are banned | `cliche-count-up`, `cliche-ticker` |
| A rolling slot list | Rare: once per film | `cliche-slot-list` |
| Stepped motion on a scroll, pan, push, glide, orbit or slide-across | **Banned**: stepped is for pieces assembling, pop-ins, state changes, bursts and beat hits; continuous single-direction moves stay fluid | `stepped-fluid-move` |
| A flash-frame burst that shows several different metrics or messages, or that does not land on a held frame | **Banned**: one varying element in a locked layout, 8 to 24 frames, lands on a held readable frame on the downbeat; at most 1 to 2 per film | `flicker-burst-fields`, `flicker-burst-count`, `flicker-burst-adjacent`, `photosensitivity-flash` |
| Generated images with people, or a neon / blue-glow tech look (a person at a laptop lit by a blue gradient) | **Banned** unless the brief asks for people: use editorial still-life objects, props, places and printed matter in natural light | `imagery-people-or-glow` |
| A default blue or purple AI-glow gradient ground | Banned unless the brand palette calls for it: grounds come from the brand's own palette, white or near-black, and stay subtle | (Look review) |
| Every word fading up the same way (uniform blur-up stagger) | Rare: 2 lines at most, then vary: slot scroll, swap, split, slash, scale-zoom, persistent-over-cuts | `cliche-word-fade` |
| Cards that slide up with a soft shadow, one after another | Rare: 2 per film at most | `cliche-slide-up-cards` |
| An underline swiping under a word as the emphasis | Rare: once per film, never the highlight beat | `cliche-underline` |
| One carrier, move or transition across the whole film | Banned: a carrier on 40% of beats at most, no move in more than 2 beats, no transition over 30% of seams | `carrier-overuse`, `move-repeat`, `transition-variety` |
| Everything centred, everything smooth on one ease | Banned: scale and texture contrast | `texture-*`, `scene-*` |

## Emphasis vocabulary to use instead

An object splitting the word; a redaction or slash bar; a glass shelf under the words; a gradient fill inside a word; a rack focus between word and object; a scale zoom of the line; an icon chip inserted between words; a serif against sans swap inside a line; a slot-list focus; an in-place word swap; reading-guide line lighting; persistent type over cutting footage; oversized type bleeding off the frame.

## The score fields

Per beat: `scene_type`, `texture` (+ `fps`; a `flicker` beat also `burst_content: "single-element"`, `burst_frames` 8 to 24, `lands_on`), `transition_in`, `moves: ["object-splits-word"]`, optional `carrier_state`, `imagery`, and `cursor_reason` when a cursor travels. `crew.mjs check --role motion-director` and `motion-gate` read them (`scripts/lib/launch-beats.mjs`).
