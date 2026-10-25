# The score: every field, the format, the seam pass

The Motion Director's reference. `agents/motion-director.md` is the procedure (intent → hero, verb, transition per beat → spend the budget → seams); this file holds every field the score carries, what `crew.mjs check --role motion-director` reads in it, and the details the procedure points to. Consult it; don't recite it.

The score (`motion/score.json`) is the one contract: the builder reads it and a short BUILD.md generated from it; STORYBOARD.md, MOTION-SCORE.md, BUILD.md and (on a direct film) DISPATCH.md are generated from it, and DIRECTION.md defers to it. `motion/score.md` is generated from the JSON on every check; never write it by hand.

## 1. Fields from the intent (new in the rebuild; warnings until calibrated)

- `argument`: the proposition in the Director's words: the one thing the motion must make obvious.
- Per scene: `beat` = the intent beat's 1-based position in `beats[]` (its `name` may be the scene's `id`); `buys`, `importance` (1–3), `relation`, `peak` copied from `story/intent.json`; `hero` (what the viewer must notice to get `buys`) and `verb` (what the hero does, from the meaning).
- Per seam: `relation` (the incoming beat's relation word) and `why` (the relation in words).
- `big_moments: [{beat, t0, t1, fills}]` (`beat`: the scene id): the emphasis budget, about 2 to 4 per 30 s, on the peak and the importance-3 beats (`lib/emphasis.mjs` `budgetChecks`: `budget-none`, `budget-over`, `budget-minor-beat`).

## 2. The plan fields (required on a direct film and every product-first film)

Film level: `duration` (s), `brand`, `feature` (`name`, `url`, `viewer`, `task`, `before`, `after`, from the chosen script; a ladder film carries a refrain instead), `ground` (the ONE background hex, painted only by the root), `ink`, `current` (the film's one direction: `left` by default), `brandReveal` (the one beat id where the mark is revealed), optionally `end_hold_s` (only when the brief asks for more than 1.4 s).

Per beat (each `scenes[]` entry): `id`, `start` and `end` in film seconds (they follow the durations), `line` ("" for none), `picture` (what the viewer sees happen), `moment` and `take` (a reference moment's id and the ONE mechanic taken from it; on the peak and importance-3 beats, `take` also says which of the three candidates won and why), `ui` (the literal cause and effect on screen, two steps or more in the proof), `exit` (`carrier` or `cut`) and `carrier`; on a scene route `board`, `size`, `hero`, `peak_t` (when in the beat the frame matches its board). At least two beats exit on a carrier.

A beat may carry `hero_id` (the hero element's DOM id) so `subject-lost` can follow it; `data-hero` on the element does the same with no score. Per scene also `hero_box: [x, y, w, h]` (0..1 of the frame; where the viewer must look at the beat's peak) and optional `hero_box_end` (the box at the scene's end; the focus follows it linearly). `finish.mjs grade|all --focus-follow --run <run>` puts the soft field outside it; a scene without a box stays sharp.

Film level also: `ground_motion` (how the ground lives, from the grammar's and the card's; `no-living-ground` on films of 15 s or more), `accent: {colour, marks}` (`no-accent-signal`), `breaths: [[t0,t1]]` (at most 2, each 1.0 s or less, at the rest before the peak), `lines_type` (a size class per line; the giant size on the importance-3 lines; `type-rhythm-flat` when all within 15%).

## 3. Field by field

- **Boards.** Every beat names its `board` and copies the board's `size` and `hero`; changing one needs `score.deviations [{beat, field, why}]` (why 12+ characters). `board-contradiction` errors, `board-missing` / `board-unbound` warn. A board whose hero is not the beat's `buys` object is the one deviation you should always make.
- **Moves.** When `story/moves.json` exists: `score.spine` names the carrier, `score.motif` is the carrier in at least the scenes of `carrier.beats`; each hero card's `frame_a`, `move`, `frame_b` are a shot's choreography, its `bridge` the seam's one true frame, its `handoff` the seam's numbers. Every hero is in `score.moves` (`used` with `scene` and `seam`, or `dropped` with a full-sentence `why`). Every `chain` entry is a timed event within a few frames; a `scale: "full-frame"` card is built full frame. You may improve a move, never replace it with a label.
- **Shows.** Each `shows` row of the script is realised in a shot: `on_screen` holds the row's `line`, `moves` describe its `show`, the row's `handoff` carries into the next shot. A line that changes in place is one shot with the swap inside it. `show-unscored` warns per line and errors over 30% unscored.
- **Grammar.** With `look/grammar.json`: `score.grammar` is its id; every scene names a `technique` of it (the one that expresses the beat's verb) and a `frame_device` sentence. A refrain may repeat a technique on purpose; the check warns only when the whole film spends one or two techniques. The grammar's `signature` is spent at the peak. A graphic-route brand uses a `flat_ok: true` grammar.
- **States.** A scene's optional `states: [{t, what, look}]` (`t` in scene seconds, `what` true on screen then, `look` where the eye is): 2 for a simple shot, 3 to 8 for a performance or a multi-stage reveal. `states-thin` warns on a complex action with fewer than 3; `states-order` on a bad `t`; `result-unheld-plan` when the last state or `peak_t` leaves under 0.6 s (1.0 s for a picture read) on an importance 2+ scene.
- **Cast.** Film `cast: [{id, kind: character|prop|device|ui|logo|environment, canon, fixed[], may_change[]}]`; a character needs a `canon` file (relative to the run) and 2+ `fixed` traits (`cast-canon-missing`, `cast-canon-not-found`). Scene `cast_state: {in: {<id>: {where, holds, facing, state}}, out: {...}}` (`cast-undeclared` for an id not in `cast`); a seam whose cast changes `holds`, `facing` or `where` needs `continuity_change` (12+ characters) or `continuity-break` warns.
- **Destination.** Film `destination` (copied from the brief) lets `hero-in-ui-zone` warn when a scene's `hero_box` sits under the platform's overlays (`lib/safezones.mjs`). All of these are uncalibrated warnings (`lib/scene-contract.mjs`).
- **Spine and motif.** One device that threads the argument (the villain object becoming the product's answer, the composer that keeps transforming, a number that rises); one motif from the product, in 3 scenes or more.
- **Energy and rhythm.** `energy` 1–5 per scene follows importance; one 5 (the peak) and one 2 or less (`no-peak`, `no-calm`). `rhythm` is a string read off it ("calm-calm-RISE-rest-PEAK-hold").
- **Shots.** A time-coded sequence across the whole scene (seconds from its start, on the bar grid with music): what's on screen, what moves, the one `primary` mover, what follows 80–200 ms later, what is just there on the cut. Reveals land on their cue, the last in the back half; never front-load.
- **Entrances** by the object's nature: `mask-rise`, `scale-from-origin`, `draw-on`, `clip-reveal`, `cut-in`, `type-on`, `count-up`, `morph`, `stream`, `slide`, `push`. `entrance-share` warns when one type is over half of the animated entrances; about 30% of elements just there on the cut.
- **The product's own motion.** On screen it moves like the real product (`research/brand.md` § Motion): its streaming, its panel easing, its typing cadence, its real states in order. Stage UI in steps (card, frame, rows, highlight: `ui-unstaged`) and let the product act rather than a cursor (`cursor-led`).
- **Camera.** Each beat's `camera` starts with its kind (locked, push-in, pull-out, pan-truck, tilt, rotate, handheld-drift, whip; T0–T3 tiers in craft §6), then the numbers. Camera moves are spent like big moments: T1+ on the peak and importance-3 beats, locked where the UI or the type moves. One `signature_shot: {beat, move, why}` at the peak. Only `#world` moves. `camera-monotone` warns only when the film never moves the camera at a length where the references do.
- **Space.** Every scene has `space` (2d, 3d, hybrid) and the film a `depth.plan` (or `depth.none_because`, 20+ characters quoting the line(s) 3D would hurt; films of 20 s or more need one 3D or hybrid scene otherwise). A 3D or hybrid scene writes `camera3d` (`lens_mm`, `fstop`, `moves: [{t0, t1, move, ease}]`), `light` and `materials`. A flat brand sets the style of the 3D, not whether it exists.
- **Layout.** `layout` per scene; no layout in 3 consecutive scenes unless the beats are a refrain (`layout-repeat`, overridable with a reason).
- **Seams.** Kinds: `cut`, `match-cut`, `shared-element`, `carried-object`, `flood`, `iris`, `mask`, `push-through`, `mask-line`, `flat-to-depth`, `depth-to-flat`, `camera-through`, `signature`, `whip`, `zoom-through`, `smash-cut`, `dissolve`. A continuity seam carries `out`/`in` (`x`, `y` px, `scale`, `opacity`, `direction`, `speed` px/s: moving, never a pose at rest), a `bridge` sentence naming the element and the frame (never a technique name), and `carrier` when one object crosses several seams. Overlap: `out_leaves` / `in_arrives` or `overlap_s` (`no-overlap`). A hard cut on the turn (`no-punctuation`). At least half the seams are cuts or continuity (`seam-mix`). One signature (two over 60 s). `registry` is a HyperFrames transition only when the assembler builds the seam; usually `null`.
- **Events.** Every causal event worth a sound and every move through space, with its time; leave a third unsounded; every seam that moves has a sound (`seam-unsounded`).
- **Showreel.** 2 to 4 moments (`{scene, t, what}`) on the peak and the importance-3 beats; one is a 3D moment when the film has depth.
- **Reference moments.** Placed by mechanic fit: `moments_placed: [{id, beat, take, why}]` or `moments_dropped: [{id, why}]` (`moment-unplaced`). One mechanic per beat as `take`; leave copy, brand and bookends behind. `moments.mjs precedent --beat … --content …` gives offline hints (one per beat at most).
- **Mechanics.** `mechanic` per shot names the build. Same meaning, same mechanic is allowed (a refrain); `mechanics-thin` warns only when the whole film runs on one or two.
- **Shape-level moves and layers.** What GSAP alone can't do goes to the shape kit (`references/shape.md`): morph, draw-on, ink, dissolve, scatter, squash, smear, stepped. `layers` per shot (5–10 at the peak of a showcase shot; `layers-thin`). Each hero move gets a 4–6 pose board before the build and a 24 fps strip after (`no-pose-board`, `hero-not-stripped`).
- **Type.** `type_scale: {small_px, large_px}`, 3x or more (`flat-type`); the large size belongs to the importance-3 lines. Every word rests readable inside the safe area; a giant word may sweep cropped for 1.2 s at most.
- **Brand recurrence.** The name in 2 beats or more on a launch of 25 s or more (`brand-once`): the reveal, one benefit line, the end.
- **Budget.** Hero effects (`budget: [{effect, scene, target, reason}]`, 2 under 30 s, 3 from 30 s, per effect) on the peak or importance-3 heroes only.
- **Echo.** `echo: {opening, ending, change}` from `ending_first.echo`: the same object, frame or shape, changed by the story (`no-echo`, `echo-identical`).
- **Music arc.** `music_arc: {intro_until, drop_at, break: [t0,t1] | null, payoff_at, button_at}`: the drop on the peak, the break on the rest before it, the button on the logo. If they are off, the Director re-runs `sound.mjs fit --reveal <peak start> --logo <logo start>`.
- **Blur grammar.** `blur_grammar: "shutter" | "smear" | "stepped" | "crisp"`, one per film. `shutter` is the delivery finish's real motion blur (the default for smooth, eased languages); `smear` is stretched duplicates, directional blur or `blurTrail` (the finish must NOT add a shutter); `stepped` is on twos or threes, `steps()` eases, cel; `crisp` is crisp steps with no blur. `finish.mjs blur|all --run <run>` (or `--score`, or `blur_grammar:` in motion.md) refuses a shutter over smear, stepped or crisp.
- **Sound hand-offs.** Export `curves.json` beside the project index (`<project>/curves.json`, or `<run>/motion/curves.json` and pass `--curves`): `{"curves":[{"id":"cam-zoom","kind":"zoom","points":[[t,scale],...]},{"id":"brush","kind":"brush","points":[[t,x],...]}]}` in film seconds; kinds zoom|scale|dive (the derivative of ln v), pan|speed|scroll (the derivative of v), brush|draw|stroke, shake|impact|rumble; sample at 10 to 30 Hz from the camera, `__zoomVel` or `__brush`. `sound.mjs sfx-plan` renders one texture bed per curve. Also export `hits: [{t, kind, treatment?}]` so `music.mjs` picks its BPM from the picture (it reads `score.hits`, events, seams, or a real `music_arc`). An event in `events.json` may carry `word` (the spoken word it lands on), `name: true` (a name reveal: 5 frames of lead), `on_word: true` (a sound that lands with a word on purpose), `x` (0..1 or px, for `--pan`) and `treatment`.
- **Tempo.** `tempo` in `story/chosen.json` (`change_every_s`, `longest_hold_s`) is a floor: something meaningful changes inside a take often enough and nothing holds past `longest_hold_s`. It never adds beats or big moments; a hold is reading time with a living layer.
- **Brand film.** `film_style: "brand-film/FILM-STYLE.md"`; `video_direction` names which card moves each scene uses; at most 3 distinct motion types and one ease family (`references/launch-film.md` rule 9); easing from the card's `Easing:` line. Each `Not seen (allowed on a budget)` effect is a `budget` entry (2 under 30 s, 3 from 30 s). The finish layer is on unless the card's measured `Finish:` says Route: graphic. The ground may change on the story's turns, inside the palette. Follow its cut rate, transitions and end card.
- **Intent overrides.** `score.intent["<rule>"]` (film) or `scenes[n].intent["<rule>"]`, 12+ characters, turns a taste rule into a note. Structure is not overridable.

## 4. The format

```jsonc
{
  "duration": 23.4, "brand": "Greenroom", "argument": "the link reaches the class the moment she says it",
  "feature": { "name": "Cues", "url": "https://greenroom.example/cues", "viewer": "a teacher running a live class", "task": "send the class a reading link mid-lesson", "before": "she stops teaching to hunt for the link", "after": "the link opens in the class's window as she says it" },
  "ground": "#FFFFFF", "ink": "#0D0D0D", "current": "left", "brandReveal": "turn",
  "spine": "The composer is the one object: it opens empty and every beat grows out of it",
  "motif": { "what": "the send arrow's circle", "scenes": [1, 4, 6] },
  "moves": [ { "id": "m3", "status": "used", "scene": 6, "seam": "5>6" } ],
  "grammar": "editorial-grid",
  "deviations": [ { "beat": "proof", "field": "hero", "why": "the board's hero is the toolbar; the beat buys 'the link arrives', so the link chip is the hero" } ],
  "budget": [ { "effect": "glow", "scene": 6, "target": "#send", "reason": "the peak: the answer lands" } ],
  "big_moments": [ { "beat": "pain", "t0": 3.4, "t1": 4.6, "fills": "\"hunt\" at 34% H, cropped" }, { "beat": "turn", "t0": 14.0, "t1": 16.5, "fills": "a cut to a full-frame brand-green field, the link chip at 45% of it" } ],
  "rhythm": "calm-RISE-calm-rest-PEAK-hold",
  "type_scale": { "small_px": 34, "large_px": 210 },
  "music_arc": { "intro_until": 3.2, "drop_at": 14.0, "break": [12.8, 14.0], "payoff_at": 20.4, "button_at": 23.4 },
  "depth": { "plan": "2D film; the peak lifts the link chip off the page into depth (flat-to-depth)" },
  "showreel": [ { "scene": 6, "t": 0.4, "what": "the chip pushes through the green field and lands in the class's window" } ],
  "signature": { "seam": "5>6", "technique": "push-through", "why": "so: the send keeps travelling into the class's screen" },
  "signature_shot": { "beat": "turn", "move": "push-in", "why": "the peak: the chip fills the frame" },
  "echo": { "opening": "the empty composer, caret blinking", "ending": "the same composer holding the sent link", "change": "empty to answered" },
  "video_direction": { "palette": "…", "motion_grammar": "…", "holds": "…", "negative": ["no idle drift", "no crossfades between UI"] },
  "scenes": [
    { "n": 1, "id": "open", "beat": 1, "title": "Blank page", "duration": 3.2, "start": 0, "end": 3.2,
      "buys": "the viewer sees a teacher mid-lesson with an empty box", "importance": 1, "relation": "open", "peak": false,
      "hero": "the empty composer", "verb": "waits: the caret blinks, nothing else moves",
      "energy": 2, "space": "2d", "layout": "full-bleed UI, composer at the optical centre", "board": "frames/01.png", "size": "MS", "peak_t": 2.6,
      "camera": "locked: T0, the UI acts", "line": "", "picture": "an empty composer in a live class", "exit": "carrier", "carrier": "the composer",
      "shots": [ { "t0": 0, "t1": 3.2, "mechanic": "cut-in", "on_screen": "The empty composer, caret blinking", "moves": "the composer drifts left on the film's current while the caret blinks at 530 ms", "primary": "caret" } ],
      "technique": "rule-draw", "frame_device": "two rules frame the composer cell",
      "entrances": [ { "element": "composer", "type": "cut-in" } ], "events": [ { "t": 1.2, "what": "first keystroke", "sound": "key" } ] }
  ],
  "seams": [
    { "from": 1, "to": 2, "relation": "because", "kind": "shared-element", "element": "composer", "carrier": "the composer",
      "bridge": "the composer sits at (990, 540) in both scenes, still sliding left, while the page behind it swaps",
      "out": { "x": 1010, "y": 540, "scale": 1, "opacity": 1, "direction": "left", "speed": 160 },
      "in":  { "x": 990, "y": 540, "scale": 1, "opacity": 1, "direction": "left", "speed": 160 },
      "overlap_s": 0.3, "sound": "soft whoosh", "registry": null, "why": "because: her words become the message in the same box" },
    { "from": 4, "to": 5, "relation": "but", "kind": "cut", "at": "bar 6 downbeat", "why": "but: the hunt hard-cuts to the green field" }
  ]
}
```

## 5. The film's shape

`score.shape` names the film in six slugs, so the studio's films don't all come out the same. It must differ from each of the last 3 recorded films in 4 of the 6 (`same-shape`); a series or an explicit ask is `shape_waiver` (12+ characters). Pick from the story first, then move away from the recent ones (`scripts/lib/film-shape.mjs` holds the lists; the brief prints the recent films).

- structure: ladder, problem-solution, intercut, single-scenario, tour, countdown, montage, one-take, before-after, manifesto
- opening: product-first, cold-word, question, big-number, cursor-typing, in-medias-res, logo-first, silence-then-hit, object-reveal, grid-build
- signature: carried-object, match-cut-chain, type-morph, mask-wipe, ui-choreography, depth-fly-through, zoom-through, shared-element, grid-shuffle, whip-pan
- camera: locked-off, slow-push, orbit-3d, handheld-drift, flat-pans, whip-cuts, zoom-through, multi-plane-parallax
- music: pulse-driven, ambient-pad, cinematic-swell, minimal-click, beat-cut, sound-design-only, vocal-led, piano-led
- ending: logo-lockup, one-line-hold, loop-back, cta-card, product-resting, blackout, punchline, pull-back

One hero per frame: the frame gate warns when the two largest elements are both big and about the same size in over 30% of frames.

## 6. Lyric video

When the Dispatch context says `lyric_video`, the plates are decided and you score how they move (`story/chosen-treatment.json`, `music/lyrics.json`, `music/audio.json`, `references/lyric-video.md`).

- The spine is the style bible's signal; the motifs are the treatment's, each changing when it returns (`score.motif.scenes`).
- Each plate's `space`, `energy` and window are fixed; `crew.mjs check` warns when the score contradicts them.
- Hook plates are one escalating set: the same device each return, bigger or stranger; the third return breaks the pattern.
- Karaoke: every word lands on its sung start, never ahead; accents on kick and snare onsets; held notes held.
- Plate boundaries are downbeats; the incoming plate's first word lands within a beat of the cut.
- A word with `conf` under 0.5 never carries a hit unchecked (`lyrics.mjs align` lists `low_confidence`).
- Showreel moments come from the treatment's `show_off`; one sits on a hook plate.

## 7. Seam pass

A long film only: a direct film's one builder makes every seam and the motion gate measures them.

1. `npx hyperframes snapshot videos/<name> --at <each cut − 0.1 s and + 0.1 s, the signature at 0.05 s steps> --no-end`, or `crew.mjs strip --project videos/<name> --from <cut − 0.4> --to <cut + 0.4> --fps 15 --out crew/seams/<n>.png`. Look at every pair.
2. A seam built from a move card shows its bridge frame, with both states true at the card's handoff numbers; fix the side that is off, never relabel.
3. A continuing element keeps position, scale, opacity and direction across the cut, velocity-matched, cut at peak velocity.
4. Build or finish the signature transition across its two scenes yourself.
5. 2D ↔ 3D seams: compare the last frame before and the first after; fix a pop on the 3D side (`k.layout` at the handoff numbers) and re-run `stage3d.mjs check`.
6. Re-run `obey.mjs --project videos/<name>` (and `stage3d.mjs check` with 3D); both exit 0. Write `crew/seams-report.md` (every seam as `N>N+1`: what you saw, what you fixed) and touch only the first and last ~0.6 s of a scene and the signature.

## 8. Storyboard timing: one authority (Plan 05)

`motion/score.json` is the canonical scene timing. The Storyboard's boards carry **provisional** durations; once narration, music and readability are reconciled before the Storyboard approval, the approved result is committed here (`crew.mjs timing --run <run> --deltas <deltas.json> --commit`, which also updates the approved durations in `scenes.json`, writes the old-to-new film-time mapping to `motion/retime.json` and regenerates `motion/events.json`; then `crew.mjs storyboard` projects the score into STORYBOARD.md). The board's playback timings are derived from the score revision (`lib/timing.mjs` `projectBoardTiming`); never keep two editable copies of the schedule, and never edit `motion/events.json` (it carries `derived: true` and the `score_revision` it came from).

Conventions: seconds are authored; the frame rate is rational (`{num, den}`, so 30000/1001 is not 29.97) and frames are derived from seconds; each duration is rounded once to microsecond ticks and starts are prefix sums of those ticks (no accumulated rounding); every range is start-inclusive, end-exclusive; source time, shot-local time and film time are never mixed; a retime is a recorded mapping (linear, reverse or freeze) that notes, captions, tracks and export all read. A music-led film's track is authoritative; a later audio replacement computes its impact (`lib/storyboard.mjs` `audioReplacementImpact`) and never silently retimes scenes. Plan 07: the audio contract is `audio/contract.json` (`soundplan.mjs contract`; the older `storyboard/audio.json` still reads), authored sound cues are `audio_cues` in the score (each names a stable event id; film time is derived, `motion/cues.json`), and `audio/direction.json` holds the film's sound roles and silence windows (`references/sound.md`, Sound direction). There is no second audio timeline.

Seam editorial (optional per seam, read by the checks): `seam.editorial = {relation: continuation|contrast|example|cause|scale|separation, hard_cut?: true, hold?: true, silent?: true, reason}`. A deliberate hard cut or stated hold is exempt from the carry, overlap, sound and motion-on-both-sides rules; a seam with no declaration is judged as before. `score.breaths` may be `[t0, t1, "why"]` for a stated pause or long hold (no length or count cap).
