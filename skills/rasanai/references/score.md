# The score: every field, the format, the seam pass

## Contents

- [1. Fields from the intent (new in the rebuild; warnings until calibrated)](#1-fields-from-the-intent-new-in-the-rebuild-warnings-until-calibrated)
- [2. The plan fields (required on a direct film and every product-first film)](#2-the-plan-fields-required-on-a-direct-film-and-every-product-first-film)
- [3. Field by field](#3-field-by-field)
- [3b. Launch beats (launch and promo films)](#3b-launch-beats-launch-and-promo-films)
- [4. The format](#4-the-format)
- [5. The film's shape](#5-the-films-shape)
- [6. Lyric video](#6-lyric-video)
- [7. Seam pass](#7-seam-pass)
- [8. Storyboard timing: one authority (Plan 05)](#8-storyboard-timing-one-authority-plan-05)

The Motion Director's reference. `agents/motion-director.md` is the procedure (intent → hero, verb, transition per beat → spend the budget → seams); this file holds every field the score carries, what `crew.mjs check --role motion-director` reads in it, and the details the procedure points to. Consult it; don't recite it.

The score (`motion/score.json`) is the one contract: the builder reads it and a short BUILD.md generated from it; STORYBOARD.md, MOTION-SCORE.md, BUILD.md and (on a direct film) DISPATCH.md are generated from it, and DIRECTION.md defers to it. `motion/score.md` is generated from the JSON on every check; write it only through the check, never by hand, because the JSON is the source.

## 1. Fields from the intent (new in the rebuild; warnings until calibrated)

Copy these from `story/intent.json` so the picture serves the argument.

| Field | Type | Required for | Why |
|---|---|---|---|
| `argument` | string | every scored film | States the one thing the motion must make obvious, in the Director's words. |
| scene `beat` | int | every scene | The intent beat's 1-based position in `beats[]` (its `name` may be the scene's `id`), so each scene traces to a purpose. |
| scene `buys`, `importance` (1-3), `relation`, `peak` | string, int, string, bool | every scene | Copied from `story/intent.json` so emphasis follows meaning. |
| scene `hero` | string | every scene | Names what the viewer must notice to get `buys`. |
| scene `verb` | string | every scene | Names what the hero does, taken from the meaning. |
| seam `relation` | string | every seam | The incoming beat's relation word, so the seam says how beats connect. |
| seam `why` | string | every seam | The relation in words. |
| `big_moments` | `[{beat, t0, t1, fills}]` (`beat`: the scene id) | every scored film | The emphasis budget: about 2 to 4 per 30 s, on the peak and the importance-3 beats (`lib/emphasis.mjs` `budgetChecks`: `budget-none`, `budget-over`, `budget-minor-beat`). |

## 2. The plan fields (required on a direct film and every product-first film)

Film level:

| Field | Type | Required for | Why |
|---|---|---|---|
| `duration` | seconds | direct and product-first films | Every `start` and `end` follows from it. |
| `brand` | string | direct and product-first films | Names whose film this is. |
| `feature` | `{name, url, viewer, task, before, after}` from the chosen script (a ladder film carries a refrain instead) | direct and product-first films | Keeps the film about one real task. |
| `ground` | hex | direct and product-first films | The one background hex, painted only by the root, so the ground never shifts under a scene. |
| `ink` | hex | direct and product-first films | The one text colour. |
| `current` | `left` (default) \| other direction | direct and product-first films | The film's one direction of travel. |
| `brandReveal` | scene id | direct and product-first films | The one beat where the mark is revealed. |
| `end_hold_s` | seconds | only when the brief asks for more than 1.4 s | Overrides the end card's still-hold limit. |
| `ground_motion` | string, from the grammar's and the card's | films of 15 s or more (`no-living-ground`) | Says how the ground lives. |
| `accent` | `{colour, marks}` | every film (`no-accent-signal`) | Makes one colour the signal. |
| `breaths` | `[[t0,t1]]`, at most 2, each 1.0 s or less | optional | Places the rest before the peak. |
| `lines_type` | a size class per line | every film (`type-rhythm-flat` when all lines fall within 15%) | Puts the giant size on the importance-3 lines. |

Per beat (each `scenes[]` entry):

| Field | Type | Required for | Why |
|---|---|---|---|
| `id` | string | every beat | Names the beat for seams and checks. |
| `start`, `end` | film seconds | every beat | They follow the durations. |
| `line` | string ("" for none) | every beat | The copy on screen. |
| `picture` | string | every beat | What the viewer sees happen. |
| `moment`, `take` | reference-moment id; the one mechanic taken from it (on the peak and importance-3 beats, `take` also says which of the three candidates won and why) | beats that use a reference moment | Takes a mechanic, never the moment's film. |
| `ui` | string | the proof beats | The literal cause and effect on screen, two steps or more. |
| `exit`, `carrier` | `carrier` or `cut`; carrier name | every beat (at least two beats exit on a carrier) | Gives seams something that moves. |
| `board`, `size`, `hero`, `peak_t` | scene routes only | scene routes | `peak_t` is when in the beat the frame matches its board. |
| `hero_id` | DOM id | optional (`data-hero` on the element does the same with no score) | Lets `subject-lost` follow the hero. |
| `hero_box` | `[x, y, w, h]`, 0..1 of the frame | every scene | Where the viewer must look at the beat's peak. |
| `hero_box_end` | `[x, y, w, h]` | optional | The box at the scene's end; the focus follows it linearly. `finish.mjs grade\|all --focus-follow --run <run>` puts the soft field outside it; a scene without a box stays sharp. |
| `hold` | `{ s, reason: "user-note"\|"craft", at? }` (or a list) | optional, per scene | A pause on purpose: the user asked ("calmer", "let it breathe") or the craft wants it. `s` seconds starting `at` seconds into the beat (default: the tail of the beat). Inside it, `motion-gate.mjs` (`freeze`, `end-hold`, `coverage`, `empty-frames`, `gap-between-beats`), `slop.mjs` (`dead-air`) and the launch gates (`meaningful-stillness`) report a note instead of an error. Caps: 3 s a hold, 4 s on the end card; the part past the cap is not covered. A hold with no `s` or no reason counts for nothing. `lib/holds.mjs`. |

**Holds.** A user note asking for calm or a held beat is a `hold` on that scene (above), not a reason to loosen a gate. Say the note in `reason` terms: `user-note` when the user asked, `craft` when you chose it.

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
- **Blur grammar.** `blur_grammar: "shutter" | "smear" | "stepped" | "crisp"`, one per film. `shutter` is the delivery finish's real motion blur (the default for smooth, eased languages); `smear` is stretched duplicates, directional blur or `blurTrail` (the finish adds no shutter); `stepped` is on twos or threes, `steps()` eases, cel; `crisp` is crisp steps with no blur. `finish.mjs blur|all --run <run>` (or `--score`, or `blur_grammar:` in motion.md) refuses a shutter over smear, stepped or crisp.
- **Sound hand-offs.** Export `curves.json` beside the project index (`<project>/curves.json`, or `<run>/motion/curves.json` and pass `--curves`): `{"curves":[{"id":"cam-zoom","kind":"zoom","points":[[t,scale],...]},{"id":"brush","kind":"brush","points":[[t,x],...]}]}` in film seconds; kinds zoom|scale|dive (the derivative of ln v), pan|speed|scroll (the derivative of v), brush|draw|stroke, shake|impact|rumble; sample at 10 to 30 Hz from the camera, `__zoomVel` or `__brush`. `sound.mjs sfx-plan` renders one texture bed per curve. Also export `hits: [{t, kind, treatment?}]` so `music.mjs` picks its BPM from the picture (it reads `score.hits`, events, seams, or a real `music_arc`). An event in `events.json` may carry `word` (the spoken word it lands on), `name: true` (a name reveal: 5 frames of lead), `on_word: true` (a sound that lands with a word on purpose), `x` (0..1 or px, for `--pan`) and `treatment`.
- **Tempo.** `tempo` in `story/chosen.json` (`change_every_s`, `longest_hold_s`) is a floor: something meaningful changes inside a take often enough and nothing holds past `longest_hold_s`. It never adds beats or big moments; a hold is reading time with a living layer.
- **Brand film.** The look is the chosen concept's `style_world` (its grammar, finish and palette); the card (`brand-film/FILM-STYLE.md`) is a reference, and `film_style` is cited only in strict brand mode (`decisions.strict_brand_film`), where `video_direction` names which card moves each scene uses and easing comes from the card's `Easing:` line. At most 3 distinct motion types and one ease family (`references/launch-film.md` rule 9). Each `Not seen (allowed on a budget)` effect is a `budget` entry (2 under 30 s, 3 from 30 s). The finish layer follows the world's finish (the card's measured `Finish:` only in strict mode). The ground may change on the story's turns, inside the world's palette with the brand accent as the signal. Cut rate and transitions follow the world's grammar; the end card is the logo and the brand face.
- **Intent overrides.** `score.intent["<rule>"]` (film) or `scenes[n].intent["<rule>"]`, 12+ characters, turns a taste rule into a note. Structure is not overridable.

## 3b. Launch beats (launch and promo films)

The gates read these per-beat fields (`lib/launch-beats.mjs`; the rules are in `references/launch-grammar.md`; `library/benchmarks/launch-refs/<id>/beats.json` shows the shape on three real films). Each `scenes[]` row carries these fields. The rules the checks enforce are in `references/launch-grammar.md` (grounds, logo count, scene variety) and `references/launch-moves.md` (texture, moves, clichés); this table lists the field, its type and the check that reads it.

| Field | Type | Required for | Why (and the check) |
|---|---|---|---|
| `line` | string, one thought | every launch beat | The copy on screen: about 9 words at most at once; a line that builds word by word counts its final state (`copy-line-long` warns). |
| `scene_type` | `type-slate \| type-collage \| ui-proof \| ui-collage \| cinematic-image \| diagram \| data \| kinetic-list \| object-shot \| typed-prompt \| footage \| logo-end` | every launch beat | Gives the film scene variety: 5+ types in a 45 s film, none over about 30% of the runtime, neighbours differ unless `continues: true` (`scene-variety`, `scene-share`, `scene-neighbours`: warnings, defaults you can leave with a `departures` why; `scene-type-undeclared`). |
| `texture` | `smooth \| stepped \| flicker \| glitch`, with `fps` (12 or 8) on a stepped beat | every launch beat | Places motion texture: at least one non-smooth beat, non-smooth about 15 to 40% of the runtime, and the meet, payoff and end smooth (`texture-all-smooth`, `texture-mix`, `texture-calm-beat`, `texture-fps`: warnings). |
| `moves_named` | array of strings | launch beats | Names the beat's catalogue moves (`references/launch-moves.md`); no move in more than 2 beats (`move-repeat`). `moves[]` holds only the per-tween records of "Motion laws" (objects); strings there (an older score) are still read as names, and every consumer ignores the shape it does not need. |
| `cursor_reason` | string | where a cursor or caret travels (once per film at most) | Justifies the cursor. AI-cliche warnings: `cliche-banned-move`, `cliche-cursor-repeat`, `cliche-cursor-reason`, `cliche-typed-lines`, `cliche-word-fade`, `cliche-slide-up-cards`, `cliche-underline`, `cliche-glow-particles`. |
| `imagery` | an id from the score-level `imagery_plan[]` (`{id, prompt, aspect?, transparent?}`) or `"none"` | beats that use a Codex image (4 to 8 per film when the score sets `imagegen: "ready"`, each reused 2 to 3 times; `imagery-count`) | Links the beat to its image; `node scripts/imagegen.mjs plan-from-score --score <score> --out <plan.json>` turns the plan into the batch step. |
| `carrier_state` | string (`"none"` when absent) | optional | Says what a local carrier is doing in the beat. A carrier links 2 or 3 neighbouring beats or bookends the film; more than 40% of the beats warns (`carrier-overuse`). No carrier is fine. |
| `transition_in` | `hard-cut-on-hit` (name the music hit) \| `stepped-smash` \| `flicker-cut` \| `mask-wipe` \| `push` \| `pull` \| `whip` \| `morph` \| `match-cut` \| `type-morph` \| `carried-element` \| `zoom-through` \| `iris` \| `flip` | optional (the seam into the scene is read when absent) | Declares the seam. A cut on a music hit is fine; a bare undeclared `cut` is a `hard-cuts` warning. Keep any family to about 30% of the seams (`transition-variety`). Frame-difference spikes in the render (`frame-spikes`) only warn, and only well above the references' 1 to 3 per 10 s. |
| `density` | `dense` (3+ elements, a collage, a full UI, a full-frame object) \| `sparse` (one small line or object on an empty ground) | every launch beat | Gives rhythm: at least two alternations (`rhythm`, a default: a warning that asks for a `departures` why, a note once given). |
| `logo` | bool | every launch beat | True where the mark is on screen; more than 3 beats warns (`logo-count`). |
| `ground` | `brand-gradient \| dark \| white \| brand-slate` | every launch beat (`crew.mjs check` requires it) | Alternates at least 2 families across the film, with brand-colour atmosphere in at least about 30% of the runtime. |
| `role` | `hook \| turn \| meet \| capability \| payoff` | every launch beat | Shapes the arc; the hook's beats together are at most 25% of `duration` (`crew.mjs check` errors above). |
| `hero_scale` | percent of frame height | every launch beat | Cap height of the beat's biggest line: 9 to 20 is the default for a beat, and the largest in the film reaching 9 is checked as guidance (`display-scale` in `departures` explains a smaller film). |
| `ui_scale` | percent of frame area | every launch beat | The UI proof's share of the frame: 35 to 60 when it is the proof; 0 when none. |
| `emphasis` | `{word, kind}`; kind `gradient-fill \| redaction \| glass-shelf \| word-on-bar \| icon-chip \| serif-swap \| scale \| object-split \| outline \| colour \| weight \| italic` | launch beats with a line | One emphasis per line, its kind varied: one kind, or colour or weight alone, on more than 2 lines warns (`emphasis-monotone`). A plain string is still read. |
| `type_treatment` / score `type_treatments[]` | ids: `halftone-mega \| outline \| mixed-serif-sans \| dot-matrix \| black-band-bleed \| caption-on-image \| oversized-bleed \| tiny-inline \| split-card \| mono-caption \| stacked-scale \| type-collage` (a new id is allowed) | launch films | The film's display palette: 5 or more in a 45 s film (`type-treatment-variety`, a default). |
| `layout` | `ui-full \| side-label \| type-then-ui \| type-over-ui \| title-over-card` | capability beats | How line and UI share the frame; `title-over-card` on 1 beat at most, and not one layout for every capability (`slide-layout`). |
| `ui_build` | array of steps (`shell`, `populate`, `state-change`, `result`) | proof beats with UI | The UI builds in place; fewer than 3 steps warns (`ui-build`). |
| `ui_camera` | `tilted-ui-dolly \| macro-push \| pull-back` (score level, or per beat) | launch films with UI proof | One camera treatment per film (`ui-camera`). |
| `ground_material` | `grid \| hex \| halftone \| paper \| stone \| light-shaft \| plate` | 1 to 3 beats | A material ground; none in a 30 s+ film, or more than 3, warns (`ground-material`); a blob or aurora gradient warns (`ground-blob`). |
| `imagegen` | `ready \| off` (score level, from `setup.sh`) | launch films | Tells `imagery-count` that Codex imagery was available. Write it when you write the score (the `IMAGEGEN=` line from `setup.sh`, or `imagegen` in `crew/plan.json`); when it is absent the check reads `crew/plan.json`. |
| `hold_s` | seconds | every launch beat | The longest static hold in the beat, about 1.2 at most, filled with secondary motion. With `ground`, `role`, `hero_scale` and `ui_scale` it is what the reference jury (`agents/reference-juror.md`) compares with the contact sheet: a declared number the sheet does not show is a finding. |

### Departures (launch and promo films)

| Field | Type | Why (and the check) |
|---|---|---|
| `departures` | `[{rule, why}]` (`grammar_waivers` is the older name) | Records where the film leaves a default on purpose. Rules: `scene-variety`, `transition-variety`, `texture`, `display-scale`, `hard-cuts`, `rhythm`, `sfx-density`. A rule with a why turns its warning into a note; a rule with no why is ignored and the warning stays (`references/launch-grammar.md` "Defaults you can leave"). |
| `structure` | `{kind, why}` | The declared structure: `hook-turn-meet` (default) \| `sung-script` \| `teaser-reveal` \| `parts-assembly` \| `before-after` \| `feature-led` \| `medium-as-proof` (`references/launch-grammar.md` section 16). |

### Craft research fields (launch and promo films)

The rules are in `references/launch-grammar.md` sections 16 to 18, `references/craft.md` "Craft research" and `references/sound.md`; every check is a warning in `scripts/lib/launch-beats.mjs` (`craftResearchFindings`). Per beat unless marked film-level.

| Field | Type | Why (and the check) |
|---|---|---|
| `ui_mode` | `literal \| abstract` | Literal UI is proof, abstract UI is sensation, and an abstract beat never counts in the claim-to-proof map (`ui-mode-missing`, `proof-abstract`). |
| `ui_state` | `{id, labels, figures, action, result, action_at?, result_at?}` | The same `id` shows the same labels and figures in every shot; an action carries its result in order (`ui-state-missing`, `ui-state-drift`, `ui-action-no-result`, `ui-result-before-action`). |
| `persists` | `["pill → the next card's header"]` or `[{element, to}]` | Objects that keep a role and a destination across the cut (`persists-no-destination`, `persists-last-beat`, `boundary-reset` when no beat carries anything). |
| `bridge_reason` | string | What a designed transition conveys that a hard cut would lose (`bridge-reason-missing`, `bridge-reason-weak`, `bridge-hard-cut-candidate`). |
| `type_motion` | `{unit: letter \| word \| line \| block, behaviour, meaning}` | Each hero line's animation unit and behaviour come from the word's meaning (`type-motion-missing`, `type-motion-unit`, `type-motion-same`). |
| `line_breaks` | array of strings | Where large type breaks; a break after a function word warns (`type-break`). |
| `intensity` | `{cut_rate, movement, proximity, camera, why?}`, levels `low \| med \| high` | The intensity map; a jump of two levels needs `why`; a flat map warns (`intensity-missing`, `intensity-change-unexplained`, `intensity-flat`). |
| `lead`, `phrase`, `counterpoint` | `vo \| music \| sound \| picture`; the musical phrase the section follows; `true` with `counterpoint_why` | Which medium leads each passage (`lead-missing`, `music-wallpaper`, `lead-phrase-missing`, `counterpoint-why`). |
| `motifs` (film), `motif` + `motif_source` (beat) | `[{what, source, ref}]`; source `brand-element \| product-verb \| customer-material` | Where each major motif comes from; a named `carrier` takes `source` too (`motif-source-missing`). |
| `set_up`, `pays_off` | arrays of ids | Causal links between beats (`progression-missing`, `set-up-dangling`, `pays-off-orphan`, `payoff-late-missing`). |
| `new_info` | string | What new fact, state or result the beat brings; 10 s with none warns (`no-new-info`). |
| `entrance`, `exit` | strings (or on `moves[]`) | A pattern shared by 70% or more of 5 or more beats warns (`same-entrance-exit`). |
| `cursor_track` | `{source: own-track, frames_on: result}` | The pointer path is its own jitter-free data and framing follows the result (`cursor-track-missing`, `cursor-framing-click`, `cursor-baked`). |
| `sfx_role` | `signature \| support \| none` | A sound hierarchy: a few signature sounds, room for the score (`sound-anchor-missing`, `sound-hierarchy-flat`). |
| move `blur_kind` | `temporal \| smear \| css \| none` | A constant CSS blur as the only motion blur warns (`blur-css-motion`). Move `ease` is also read: an ease steep enough to hide the action warns (`easing-extreme`). |
| `ending` (film) | `{music: resolve \| ringout \| sting \| hard-stop \| none, settled_s, why?}` | A resolved ending and a settled end frame of 2 to 4 s (`ending-missing`, `ending-unresolved`, `end-frame-short`). |

The readable-exposure budget needs no field: the render gate measures it from the composition (`launch-gates.mjs`, `readable-exposure`).

### Clarity, proof and CTA (launch and promo films)

The rules are in `references/launch-grammar.md` section 14; these fields feed the `launch-beats` warnings. Score-level fields:

| Field | Type | Why (and the check) |
|---|---|---|
| `clarity` | `{category, audience, beat}`; `beat` is a beat id or role (`hook`, `turn`) | Names what the product is, who it is for, and where the copy says both: by the end of the turn, before the meet (`clarity-missing`, `clarity-late`, `clarity-beat-unknown`). |
| `one_message` | string, one sentence | The single thing the film says; the juries check the film says that and only that (`one-message-missing`). |
| `cta` | `{text, hold_s}` | The final beat's call to action: a verb plus a destination, held 2 s or more (`cta-missing`, `cta-weak`, `cta-hold-missing`). |

Per-beat: `core_job_demo` (bool) marks a beat that shows the product's core job done on UI (`core-job-missing`, `core-job-no-ui`). The first beat with `ui_scale` of 35 or more (or a `ui-proof` or `ui-collage` scene) starts by about 40% of the runtime (`ui-proof-late`, `ui-proof-missing`). `copy-buzzword` warns on the denylist in `scripts/lib/copy-lint.mjs`.

### Motion laws (launch films; any film may carry `moves`)

Film level: `signature_ease` (a curve name from `motion.md` `curves`, or a curve string such as `cubic-bezier(0.05,0.7,0.1,1)` or `expo.out`). Launch films only: 70-85% of moves use it (`signature-ease-missing`, `signature-share-low`).

Per beat, besides the fields above: `beat` (`hook | turn | meet | capability | payoff`; first and last row by default) and optionally `hold_s` (the longest hold of the beat's line). `moves[]` lists the beat's notable moves; the checks read only the fields given:

- `target` (the id or class the tween animates; `obey` matches it to the tween), `at` (s), `dur` (s), `ease` (the curve name or string).
- `weight`: `heavy` (panels, modals, hero UI) | `medium` | `light` (chips, icons, pills): overshoot limits 0 / 3-5% / up to 15% (`heavy-overshoot`, `weight-overshoot`).
- `travel_px` and `path` (`straight | arc | whip`): a travel over a third of the frame needs an arc or a declared whip (`long-straight-travel`); `travel_px` above 0 or `whip` counts as momentum for a settle (`unmotivated-overshoot`).
- `layer`: `hero | support | ambient` (`ambient-speed`, `ambient-not-counter`, `layers-missing`).
- `entrance`: `mask-rise | scale-from-origin | draw-on | clip-reveal | travel-fade | cut | fade` (`fade` is opacity-only: `entrance-fade-only`, warning).
- `exit` (a kind such as `travel-fade | cut | mask`) on a leaving move, with the same `target` as its entrance: the exit's `dur` is 60 to 80% of the entrance's (`exit-longer`).
- `purpose`: `hierarchy | state | relationship | feedback | continuity | emotion` (`move-purpose-missing`, `move-purpose-unknown`; the rule is in `craft.md` "Purpose, hero and exits").
- `set_piece: true`: a declared cascade set piece (`cascade-span` allows 1.2 s).
- `handoff` on a beat: `{carry: [position, velocity, ...]}` or `{intentional_discontinuity}` (`handoff-velocity`).

Measured from the built tweens where `obey` can see them, from these fields where it cannot; all warnings. `beat-profile` (hook has no overshoot and is tighter than the film's mean; the meet holds the longest entrance; the payoff's `hold_s` is the longest) reads `moves[]`, `beat` and `hold_s`.

### Motion purpose (launch and promo films)

The rules are in `references/launch-grammar.md` (arc, section 9, sections 14 and 15) and `references/craft.md` "Purpose, hero and exits"; every check is a warning in `scripts/lib/launch-beats.mjs`, shown by `crew.mjs check --role motion-director`.

| Field | Type | Required for | Why (and the check) |
|---|---|---|---|
| `proves` | array of claim ids (from `research/claims.json`) | every beat whose picture proves a claim | Maps each claim to the beat that visibly proves it (`proof-map-missing`). |
| `claims_used` (film), `claims` (beat) | array of claim ids | launch films | The claims the copy states; one with no proving beat warns (`claim-unproven`). |
| `peak` (film) | the peak beat's id | launch films | Names the signature moment; the hook, the peak and the end get the richest moves (`peak-missing`). A beat may also carry `peak: true`. |
| `moves_named` | array of catalogue names | the hook, peak and end beats at least | Shows where the craft went (`peak-end-moves`). |
| `distinct` | `{what}` (or a string): a colour, scale, motion or sound | the meet beat and the CTA (last) beat | A treatment found nowhere else in the film; the same value on another beat warns (`distinct-missing`, `distinct-repeat`). |
| `mood` | `problem \| turn \| solution \| climax \| cta` | every launch beat | The ground, light and motion follow the story (`mood-missing`). |
| `light` | `gradient \| glow \| lit-white \| none` | every launch beat | With `ground`, tells problem from solution; identical ground and light on both warns (`mood-flat`). |
| `hero` | string | every launch beat | The one element that carries the beat's main motion (`hero-missing`). |
| `motion_language` (film) | `{direction: forward \| upward \| inward \| outward, physics: soft \| crisp \| heavy \| weightless \| elastic}` | launch films, beside `signature_ease` | The film's motion personality, copied from the chosen Look's `blend.json` `treatment.motion_language` (`motion-language-missing`, `motion-language-unknown`). |
| move `purpose` | one of the six (see "Motion laws") | every record in `moves[]` | Gives each move a job (`move-purpose-missing`). |

The full-frame-type scale, a second scale, the 50% UI hero and the old shot-length median no longer apply to the default launch grammar: a launch film is judged on its beats and, with no stated gate profile, as `flat`.

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
