# Launch moves: what the reference films do, and the AI cliches to replace

Read with `launch-grammar.md` (section 4e). The moves were watched frame by frame in Minase, Kinso and Sovra.fm (strips in the owner's `.context/moves/`; breakdowns in `library/benchmarks/launch-refs/`). They are third-party films, so take the mechanic and leave every frame, line, mark and palette.

## Contents

- Rules that make a film feel designed
- Helpers (RasanTexture)
- Motion texture (texture table, placement, stepped, flash burst, glitch)
- The reference moves (35, table per source film)
- AI cliches: replace, or use rarely
- Emphasis vocabulary
- The score fields

## Rules that make a film feel designed

- Name one move per beat in the score's `moves_named[]` and use no move in more than 2 beats, because the standard (a cursor nudging a highlighted word) is the failure the owner called "way too standard" and `move-repeat` counts repeats.
- Let objects act on type physically (split, slash, carry on a shelf, iris out), because a pointer at a word reads as the default AI emphasis.
- Tell the story with focus, scale and blur (a rack focus between type and object, a scale zoom as the transition), because decoration carries no meaning.
- Give each scene its own idea, because a repeated signature move reads as one gimmick.
- Contrast texture (stepped and flicker against smooth calm, dense against radically empty), because contrast is what makes each texture read.
- Use real material (footage, generated worlds inside UI, a hex texture, glass with reflections, colour light), because flat vector fills read as a template.
- Turn copy into a literal visual metaphor where it fits (Sovra: "Same loops" is nested loop rings, "Your energy" is a glow bloom), because the picture then proves the line.

## Helpers

`runtime/rasan-texture.js` (`RasanTexture`) installs with the world runtimes (`node scripts/motionkit.mjs install-world --project <project>`) and loads after GSAP. Every helper takes the film's paused GSAP timeline and a start time, builds its DOM once, and is a pure function of timeline time, because that keeps it seek-safe and deterministic (no `Math.random`, no clock).

| Helper | Move |
|---|---|
| `RasanTexture.stepped(tl, at, {build, duration, fps})` | a collage assembling or pop-ins on twos or threes (a detached timeline seeked to `floor(t*fps)/fps`) |
| `RasanTexture.stepsEase(fps, duration)` | `steps(n)` ease for one stuttering tween |
| `RasanTexture.flicker(tl, at, {target, items, duration, every, fps, final})` | the flash-frame burst (one varying element, 8 to 24 frames, `every` 2 to 3, lands on `final` and holds) |
| `RasanTexture.glitchPop(tl, at, {el, duration, slices, amp, rgb})` | the glitch pop-in |
| `RasanTexture.objectSplitsWord(tl, at, {target, text, splitAt, object})` | move 1 |
| `RasanTexture.redactionSlash(tl, at, {target, word, color})` | move 2 |
| `RasanTexture.slotList(tl, at, {target, items, fps, duration})` | move 13 |
| `RasanTexture.scaleTransition(tl, at, {el, from, to, next})` | move 4 |
| `RasanTexture.irisThrough(tl, at, {target, keep, cx, cy, color})` | move 5 |
| `RasanTexture.cutsUnder(tl, at, {layers, times, end})` | move 9 |

## Motion texture

This section is the one home for texture placement, stepped use and the flash-burst rules; `launch-grammar.md` (4b) links here. Declare a `texture` on every beat. Checks are warnings: `texture-all-smooth`, `texture-mix`, `texture-calm-beat`, `texture-fps`.

| texture | What it is |
|---|---|
| `smooth` | eased and continuous |
| `stepped` | on twos or threes: held frames at 12, 10 or 8 fps, for pieces assembling, pop-ins, state changes and hits on the beat |
| `flicker` | a flash-frame burst: one varying element in a locked layout, landing on a held readable frame |
| `glitch` | a pop-in with sliced offsets and 1 to 2 frames of jitter |

### Placement

| Rule | Number | Why |
|---|---|---|
| Include at least one stepped or flicker section (the hook's chaos or a dense collage) | at least 1 | Minase steps its collage and UI at about 10 fps and bursts a flicker montage at 6.5 to 9 s; one non-smooth section gives the film energy |
| Cover stepped, flicker and glitch together | about 15 to 40% of runtime | enough texture to register, not so much that it becomes noise |
| Keep calm beats smooth (the meet, the payoff line, the end) | all calm beats | the calm sections (clean type slates, footage, the logo reveal) are the counterweight that makes the stepped ones read |
| Mix textures across the film | never all smooth, never all stutter | contrast is the point |

A smooth, crisp film can still be right (Sovra.fm is smooth, lit and always moving). Texture is a tool for energy, so the rendered gate only recommends it (`texture-all-smooth` is a recommendation).

### Stepped belongs to discrete motion (`stepped-fluid-move`)

- Use stepped for pieces arriving or assembling in a collage, pop-ins, discrete state changes, energetic montage bursts, hits on the beat and things that jump between positions, because held frames read as rhythm on discrete events.
- Keep a scroll, pan, camera push, long glide, orbit rotation or slide-across fluid, because stepping a continuous single-direction move reads as dropped frames. A dashboard strip scrolls smoothly while its cards pop in stepped.
- A stepped beat whose named moves include scroll, pan, push, glide, orbit or slide-across warns "stepped motion on a fluid single-direction move".
- Recipe (a): one tween with the GSAP steps ease, e.g. `tl.to(card, { x: -900, duration: 2, ease: "steps(" + Math.round(12 * 2) + ")" })` (12 fps over 2 s).
- Recipe (b): a section-wide time quantiser. Build the section on a detached paused timeline `inner = gsap.timeline({ paused: true })` and drive it from one tween on the film timeline whose setter calls `inner.time(Math.floor(t * fps) / fps)` (`RasanTexture.stepped`). Leave the film timeline's own `time()` alone, because wrapping or overriding it breaks seeking and rendering.
- Fps: 12 (on twos at 24), 10 (on threes at 30, Minase's collage) or 8 for a harsher stutter. Held frames of 3 or fewer count as motion in the stillness gate.

<example>
good: the Minase collage: cards and app icons pop in on threes at 10 fps while the whole stage stays on a smooth push.
good: a dashboard strip scrolls sideways fluid, and its cards assemble stepped (`RasanTexture.stepped` on the assembly only).
bad: `texture: "stepped"` on a beat whose moves are `dashboard-scroll` and a camera push; the scroll and push stutter and `stepped-fluid-move` warns. Fix: set the beat to `smooth` and step only the card pop-ins.
</example>

### Flash-frame burst (the flicker beat)

Use a flash-frame burst as a build-up and keep information out of it. It goes only before a reveal, drop or beat hit, or to convey abundance, overload or speed.

| Rule | Number | Why |
|---|---|---|
| Vary one element in a locked layout (a climbing number, the same word in many fonts, a stack of app icons or UI states, one card in many states) | 1 element | nobody can read "12 STREAK" and "B2 LEVEL" at 2 frames each |
| Hold each flash | 2 to 3 frames (1 only as an accent) | fast enough to feel like a burst, long enough to register |
| Run the whole burst | 8 to 24 frames (about 0.3 to 0.8 s), on a riser or stutter aligned to beat subdivisions | a short build keeps the landing sharp |
| Land on one held readable frame | 12 frames or more, on the downbeat | that frame carries the real message |
| Use bursts sparingly | 1 to 2 per film, never back to back | repeated bursts dull each other |
| Declare the fields | `burst_content: "single-element"`, `burst_frames` (8 to 24), `lands_on` | `flicker-burst-fields`, `flicker-burst-count`, `flicker-burst-adjacent` read them |

Photosensitivity is a true invariant (WCAG 2.3.1 / Ofcom; the render gate measures `photosensitivity-flash`):
- Keep high-contrast full-frame flashes to 3 per second at most.
- Keep full-frame black and white from alternating; change an element on a constant ground instead.
- Avoid saturated red flashing; change only part of the frame and keep the luminance change small, so the content changes while the ground stays constant.

<example>
good: the burst shows one hero card in 9 states (2 to 3 frames each, 18 frames in all) on a riser, then lands on the final state held 14 frames on the downbeat, with the real message in that frame.
bad: a burst that shows "12 STREAK", "B2 LEVEL", a price and a logo at 2 frames each, with no held landing. Fix: pick one varying element (the streak number climbing) and land on a held frame that states the claim.
</example>

### Glitch pop-in

The element enters as 4 to 6 horizontal slices (`clip-path: inset(top 0 bottom 0)` clones) displaced by seeded offsets that decay over 1 to 2 frames of jitter at 24 fps, with an optional RGB split (two screen-blended copies offset a few px). The clean element lands on the last frame, and each pop runs 0.2 to 0.4 s.

## The reference moves

The score's per-beat `moves_named[]` names these ids. The first four columns are the fixed shape: name | when | how (recipe) | not when.

**Kinso**

| Name | When | How (recipe) | Not when |
|---|---|---|---|
| 1. `object-splits-word` | a word carries the product's meaning and an object can physically enter it ("here" becomes "some / where") | split the word into two spans and push them apart by the object's width (`x: -w/2`, `x: +w/2`) while the object rises through the gap (`y` from below); ramp `filter: blur(14px)` on the text while the object stays sharp; slow push-in on the stage. `RasanTexture.objectSplitsWord` | the object only points at the word instead of acting on it |
| 2. `redaction-slash` | a word needs a hard negative or a "cut" beat ("Woah" on a white pill, a red bar across it) | a bar with `transform-origin: 0 50%` and `rotate(-6deg)` scaling `scaleX 0 to 1` (expo.out, 0.4 s) over the word's middle; then scale the pill to 0. `RasanTexture.redactionSlash` | you would underline the word instead; the object acts on the word |
| 3. `glass-shelf` | a phrase ("You are a really [busy person]") needs a physical surface to land on | a slab with `backdrop-filter: blur(18px)`, a 1px bright top edge, a flipped, masked 20% opacity copy of the words as the reflection; `background-clip: text` gradient on the words; an orb on a bounce ease (one settle, 3 to 8%) | the orb stands in for a cursor; it is a physical object with weight |
| 4. `scale-as-transition` | the seam can be the line itself shrinking ("One inbox") | `scale` from 6 to 0.4 on the line (`expo.out`, 0.9 s) with the next scene fading in behind during the second half. `RasanTexture.scaleTransition` | the scale-and-fade is the default entrance for every element (`cliche-zoom-fade`) |
| 5. `iris-through-object` | the cut should swallow the frame while one object survives (an orb becomes a sphere behind a notification card) | an overlay `radial-gradient(circle at cx cy, transparent r, dark r)` with `r` driven by a progress tween (a pure function of p); raise the kept object above it (`z-index`). `RasanTexture.irisThrough` | no object needs to survive the cut |
| 6. `logo-builds-itself` | the meet beat reveals the brand small and calm | an SVG path `stroke-dashoffset` draw then fill, or a path-to-path morph beside "Meet"; then the lockup `scale` to 0.5 on a sine ease | the logo would be large or persistent (logo count lives in `launch-grammar.md` section 3) |
| 7. `oversized-type-bleed` | a real hero number closes a beat ("Join 2,311 to 27,300 others" is the film's one count-up) | a count-up as a progress tween rounding a value; the oversized line ("on the waitlist") starts at `x: 110%` and settles with part of it still cropped by the frame | the number is decorative or the film already has a count-up |

**Minase**

| Name | When | How (recipe) | Not when |
|---|---|---|---|
| 8. `restraint-slate` | a breath is needed between dense beats | a tiny typewriter caption with a dot bullet, alone on pure white; then a tiny centred "That's it". Small type in vast space is deliberate; size contrast across the film is the point | the beat is meant to be a dense one |
| 9. `persistent-type-over-cuts` | a line should anchor several cuts | a caption types itself while three footage shots cut underneath it on the beat; put the type on a higher track and toggle the shots with `tl.set(autoAlpha)` at the hit times. `RasanTexture.cutsUnder` | the line would be hard to read over the footage |
| 10. `footage-word-by-word` | moody stock carries a line word by word | dark stock with words fading in one by one mid-frame; a word row where each word's width animates open to admit an icon chip ("people (up arrow) don't read"); UI objects fly in stepped and stack over the footage (`RasanTexture.stepped`) | every line of the film uses the uniform word fade (2 lines at most) |
| 11. `dashboard-scroll` | a dense analytics dashboard sells the data | the dashboard scrolls sideways, fluid; its cards and chips pop in or assemble stepped (`RasanTexture.stepped` on the assembly only); the numbers are static values | the scroll itself would be stepped, or the numbers would tick (`stepped-fluid-move`, `cliche-ticker`) |
| 12. `orbit-diagram` | a system or "same product, different world" idea needs a diagram | SVG circles with `stroke-dasharray`, groups rotating at different speeds, small labelled nodes on `motionPath` or computed positions per progress; the mono centre text swaps "Same product" to "different world" | the diagram would be passed off as UI |
| 13. `slot-list` | a vertical choice list sells range (Sovra uses it too) | a column translated in steps (`steps(n)` ease, or `RasanTexture.slotList`) through a fixed arrow, per-row opacity set from the focused index; the focused word dark, the rest faded | used more than once per film (`cliche-slot-list`) |
| 14. `mixed-type-collage` | a line ("product is weak") gains from scale contrast | absolutely placed words at 2 to 3 sizes, one italic serif, with UI cards on a higher z-index crossing letters | the cards would hide the words so they cannot be read |
| 15. `stepped-collage-flicker` | a landing-page collage builds into a reveal | landing pages and cards (with generated grass-hill worlds inside) scroll and assemble on threes with `stepped`, then a frame-level burst swaps cards and stats with `flicker` | the burst would carry unrelated metrics (see Flash-frame burst) |

**Sovra.fm** (same ids where a move repeats)

| Name | When | How (recipe) | Not when |
|---|---|---|---|
| 16. `metaphor-from-copy` | the copy has a literal picture ("Same songs / Same feeds / Same loops") | a pill grows into nested loop rings; "Your energy" becomes a one-off glow bloom on the hero word, tied to its meaning | the glow pulses or breathes |
| 17. `product-flow-demo` | the real product states prove the line | a mini demo built with the real UI kit (`ui-rebuild.md`): the prompt typed (the one typed line), Create clicked, a progress ring 11% to 100%, the result (album art with a vinyl sliding out); the cursor does real actions here | the actions are not the product's real ones |
| 18. `product-character` | the product owns a character | a DJ orb with eyes and labelled gradient ribbons (Talking / Reacting / Flowing) as a local motif that bookends | the character would be a mascot imported from outside the product |
| 19. `line-lighting` | a statement needs a reading-guide emphasis | per-line opacity and colour tweens (0.25 to 1) in sequence, dim to bright, the key word brightest | a cursor or underline would do the pointing |
| 20. `border-light-trace` | a UI card (the prompt box) needs a live edge | an SVG rect with `stroke-dasharray` and a moving `stroke-dashoffset`, a blurred copy for the glow; one particle burst on a button press, tied to the action | the burst is atmosphere with no action behind it |

**TaskShelf** (71 s, voice-over with readable on-screen copy and quick cuts; `library/benchmarks/launch-refs/taskshelf`)

| Name | When | How (recipe) | Not when |
|---|---|---|---|
| 21. `readable-copy-quick-cuts` | a voice-over runs and the type must still tell the story | the copy mirrors the voice-over line by line, each line held long enough to read, with the treatment changing radically cut to cut (tiny inline, huge, halftone mega type, a black band of oversized text bleeding off the frame, a split card); cut about every 2 s | a line would flash by too fast to read |
| 22. `inline-icon-chips` | a sentence names tools or things ("that's [orb] why", "comes from -> [Slack][GitHub]...") | the chip is a span that opens its own width in the word row; chips stack in one by one | the chip would crowd the line past 3 to 7 words |
| 23. `ui-as-typography` | the copy is a list the product shows | a dropdown "List of platforms: Notion / Jira / Asana / Linear" with a real caret, rows with icons and a height tween to collapse into the next line | the dropdown would be a decorative fake |
| 24. `cost-pain-stacked-prices` | a cost pain point lands as numbers | huge stacked prices ("-$14.5 -$23.9 -$7.97") scroll through and off the frame edge; small floating prices scatter around "Spend smart" | the numbers would count up (they scroll or sit; counting is `cliche-ticker`) |
| 25. `halftone-display-type` | display type needs graphic texture | `background-clip: text` with a radial-gradient dot pattern, or an SVG dot grid masked by the word (mega "then...", "Sprints"); a pixel heart | the type would lose readability |
| 26. `stepped-blocks-across-type` | discrete blocks can jump across halftone words | orange blocks jump across the words on threes (`RasanTexture.stepped`) | the blocks would glide |
| 27. `tilted-ui-dolly` | the product UI is the hero | 3D-tilt the UI (`rotateX/rotateY` with perspective) and dolly in fluid; a real cursor does real actions (Add member, Create task, multiplayer cursors on a feature request) | the cursor has no real action to perform (cursor once per film) |
| 28. `hand-drawn-annotation` | a comparison wants a human touch ("Every feature / Every person") | SVG paths drawn by `stroke-dashoffset` with a handwriting font | the annotation would replace a real label |
| 29. `logo-on-photo-plate` | the mark lands on real material | the mark on a real photo texture plate (concrete with a light beam), then a hand-drawn line morphs into the logo | the plate is a neon or AI-glow scene |
| 30. `typed-cta-end` | the end card has a call to action | the logo plus a typed CTA ("Start your 7-day free trial now"); the film's one typed end line | a typed line is already used twice (`cliche-typed-lines`) |

**Kinso typography details**

| Name | When | How (recipe) | Not when |
|---|---|---|---|
| 31. `type-motion-smear` | type is displaced by an object | a heavy directional smear with chromatic fringing on the type (a stretched `scaleX` copy at low opacity, or an SVG feGaussianBlur with stdDeviation "x 0", RGB-offset copies) while the object stays crisp | the smear lands on the object |
| 32. `redaction-pill-live-number` | a redaction pill can hold a number ("W[1,491]ah") | a small live number inside the pill; it is the film's one count-up | the number would be a decorative ticker |
| 33. `glass-pane-refraction-wipe` | a seam wants a physical wipe | a pane with `backdrop-filter: blur()` inside a `clip-path` polygon that travels with a thin bright edge; type sharp on one side and refracted behind the glass ("for eve\|ry") | the wipe would be a plain fade or blur-only transition |
| 34. `corner-selection-brackets` | a text block ("And ranks messages by it") needs framing | small accent squares at the corners, beside a soft brand orb and a clean UI card | a travelling cursor would do the selecting |

**Payoff**

| Name | When | How (recipe) | Not when |
|---|---|---|---|
| 35. `oversized-emerging-type` (recommended payoff move) | the payoff line is where the film spends everything on type | the line emerges at huge scale, offset and staggered line by line, bleeding toward the frame edge, then settles (the v3 "26Keys / improves / you.") | the payoff needs the longest hold of the film more than motion |

## AI cliches: replace, or use rarely

The checks are warnings in `launch-beats` (`clicheFindings`). Two true invariants, no pulsing glows and no bokeh or floating particles as atmosphere, have no allowed use. Everything else has a replacement or a rare budget.

| Cliche | Do this | Check |
|---|---|---|
| A highlighted word that scales up, bounces, nudges, wiggles or pulses as the emphasis | use the emphasis vocabulary below; an object acts on the word | `cliche-banned-move` |
| Glowing pulse rings or "breathing" glow (invariant) | use a one-off bloom tied to the word's meaning, or colour light that moves | `cliche-banned-move`, `cliche-glow-particles` |
| Bokeh dots or floating particles as atmosphere (invariant) | use real material or colour light; one button-press burst tied to an action is a move | `cliche-glow-particles` |
| A travelling cursor or caret | rare tool, once per film, for a real typing, selecting, clicking or dragging moment in the product (Sovra: Create, upload, remove Spotify); declare `cursor_reason`; build it with a real cursor or caret shape at 3 to 4% of the short side, an arc with ease in and out (never linear) and one purposeful action at the end | `cliche-cursor-repeat`, `cliche-cursor-reason` |
| A typewriter caret on every line | type at most 2 lines per film (Minase types twice) | `cliche-typed-lines` |
| Word-by-word appear-from-bottom (rise plus fade per word), the standard AI entrance | use it for one line per film at most; prefer a swap in place, an object splitting a word, a slash, a scale-zoom, persistent type over cuts, a typed line used rarely, a hard cut on the beat, a mask wipe or a stepped pop | `cliche-word-rise` |
| The standard zoom-in plus fade (scale plus opacity) as an entrance or transition | use it once per film at most; prefer a mask, a swap, an object splitting the word, a hard cut on the beat, a stepped pop, or scale as the transition itself | `cliche-zoom-fade` |
| Counting numbers (odometer, count-up stats, ticking numbers, streak counters, dashboard tickers) | use one count-up per film at most, for a real hero number that matters to the story (social proof, "Join 27,300 others"); show other numbers as static values | `cliche-count-up`, `cliche-ticker` |
| A rolling slot list | use it once per film | `cliche-slot-list` |
| Stepped motion on a scroll, pan, push, glide, orbit or slide-across | keep it fluid and step only pieces assembling (see Motion texture) | `stepped-fluid-move` |
| A flash-frame burst of several metrics, or one that does not land on a held frame | vary one element in a locked layout and land on a held readable frame (see Flash-frame burst) | `flicker-burst-fields`, `flicker-burst-count`, `flicker-burst-adjacent`, `photosensitivity-flash` |
| Generated images with people, or a neon or blue-glow tech look (a person at a laptop lit by a blue gradient) | use editorial still-life objects, props, places and printed matter in natural light (`imagery.md`, "Launch imagery"); people only when the brief asks | `imagery-people-or-glow` |
| A default blue or purple AI-glow gradient ground | take the ground from the brand's own palette, white or near-black, kept subtle; use a blue or purple glow only when the brand palette calls for it | (Look review) |
| Every word fading up the same way (uniform blur-up stagger) | use it for 2 lines at most, then vary: slot scroll, swap, split, slash, scale-zoom, persistent-over-cuts | `cliche-word-fade` |
| Cards that slide up with a soft shadow, one after another | use it for 2 per film at most | `cliche-slide-up-cards` |
| An underline swiping under a word as the emphasis | use it once per film, never on the highlight beat | `cliche-underline` |
| One carrier, move or transition across the whole film | cap a carrier at 40% of beats, a move at 2 beats, a transition family at 30% of seams | `carrier-overuse`, `move-repeat`, `transition-variety` |
| Everything centred, everything smooth on one ease | contrast scale and texture | `texture-*`, `scene-*` |

<example>
good: emphasis on "here": a pill rises through the word and pushes the letters apart (`object-splits-word`), the text blurs on a rack while the pill stays sharp.
bad: a cursor glides to "here" and the word scales up 1.1x and settles. Fix: use `object-splits-word` or `redaction-slash`, or set the key word in a serif italic against sans.
</example>

<example>
good: one word-rise line in the hook, and every other line swaps in place or arrives with a mask wipe.
bad: all 8 lines rise from the bottom word by word. Fix: keep one rise line and swap the rest in place, split with an object, or cut on the beat.
</example>

<example>
good: a travelling cursor appears once, in the typed-prompt scene, on a 3 to 4% of short side arrow with an arc and one click on Create, with `cursor_reason: "clicks Create in the real prompt box"`.
bad: a cursor drifts across three beats to point at words, with no `cursor_reason`. Fix: remove the cursor from the text beats and keep it for the one real product action.
</example>

## Emphasis vocabulary

Use these in place of a pointer or a nudge: an object splitting the word; a redaction or slash bar; a glass shelf under the words; a gradient fill inside a word; a rack focus between word and object; a scale zoom of the line; an icon chip inserted between words; a serif against sans swap inside a line; a slot-list focus; an in-place word swap; reading-guide line lighting; persistent type over cutting footage; oversized type bleeding off the frame.

## The score fields

Per beat: `scene_type`, `texture` (+ `fps`; a `flicker` beat also `burst_content: "single-element"`, `burst_frames` 8 to 24, `lands_on`), `transition_in`, `moves: ["object-splits-word"]`, optional `carrier_state`, `imagery`, and `cursor_reason` when a cursor travels. `crew.mjs check --role motion-director` and `motion-gate` read them (`scripts/lib/launch-beats.mjs`).
