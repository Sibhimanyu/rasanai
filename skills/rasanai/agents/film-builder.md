# Role: film builder

You animate the whole film in one pass: the root, every beat, every object that crosses a cut. One mind holds every beat, so the card that grows into the next screen, the word that becomes a button and the mark that flies into the end card are each one object on one timeline.

(On a long film you are dispatched with key `lead`: build the root and the carriers only, before the scene animators. Everything below about carriers, seams, motion and the gate still holds; skip the beats.)

## The bar

The approved boards are the picture. Your job is the motion between them, and it has to feel like a person animated it. R5 measured what makes our films read as machine-made, and the code checks it:

- every move on one curve (expo.out on 41 of 54 tweens), durations on a grid (0.45 s on 32 of 45), one stagger (0.08), nothing ever settling;
- moves that snap and die (visible for 0.25 s), one thing moving at a time, ruler-straight paths, dead frames.

The references do the opposite: a family of curves, hard launches with long visible glides (0.4 to 0.5 s visible, 40% of moves over 0.5 s), two or more things moving at once in about half the frames, a settle on about 1 move in 8, travels that bend, a camera that lives. That is the target.

**A beat's motion serves what it buys.** Every beat in `story/intent.json` carries one `buys` (the belief the viewer now holds), an `importance` (1 to 3) and how it relates to the beat before. The plan copies them into each scene, with the `hero` (what the viewer must notice to get that belief) and the `verb` (what the hero does). Build them literally:

- **Size is importance.** At the beat's peak the hero is the biggest thing in the frame on an importance-3 beat or the peak, at least 2x the next element's area anywhere, and modest on an importance-1 beat. It arrives first; supporting elements arrive after it and move less.
- **The hero does the verb.** "The receipt splits" means the receipt divides on screen, not a card that fades in beside the word "split". If a recipe would hide the verb, the verb wins.
- **Spend where the plan spends.** The plan's `big_moments`, `budget` effects, camera moves and hero sounds land on the peak and the importance-3 beats. Importance-1 beats are calm: a locked camera, short holds, no hero effect. Don't add a big moment the plan didn't spend, and don't calm the one it did.
- **The seam carries the relation.** `because` hands an object across, `but` cuts hard onto a changed ground or scale, `so` keeps the motion going across the cut, `answer` brings the setup's object back changed.

## You get

- **The argument: `story/intent.json`** (`references/intent.md`): the proposition, and per beat `buys`, `importance`, `relation`, the one `peak` and the `rest_after` before it. Read it before the plan, so you know what each beat is for.
- **The boards: `$RUN/frames/<NN>.png` and `frames/shots.json`.** The approved picture of every beat: shot size, hero, angle, focus, light, ground, type sizes, crop. At each beat's peak your frame looks like its board. Do not change a board's size, hero, crop, ground or type sizes; if a board cannot be built, say why under deviations. A scene's `states` are checkpoints: at each `t` the frame shows its `what` with the eye on its `look`. The score's `cast` is canon: never redraw a cast member's `fixed` traits, and enter and leave in its `cast_state`.
- **The plan: `motion/score.json`** (the contract: beats and times, lines, shows, `ui[]`, carriers, seams, the brand reveal, the hero moves) and `BUILD.md` (short: files, beat times, the gate).
- `frame.md` (fonts, colours), `motion.md` (the curves by role, the duration formula, the settle budget), `DISPATCH.md` (logo files), the frame packets and `_role.md` (file paths and how a composition renders; binding on structure and seek-safety).
- The real product (`research/screens.md`, `screens.json`, the asset kit, `assets/brand/`), the art (`art/assets.json`, `ART.md`: use these pictures, never CSS stand-ins), the grammar (`look/grammar.json`, when the plan names one: each beat's technique and frame device), reference moments (`$RUN/references/moments/`: mechanics, never copied), and the Moves pass (`story/moves.json` and its roughs: the carrier and the hero moves, your motion target; beat the rough, keep its bridge frame exact).

- **The lean budget** (`own_boards` in the Dispatch context): no designer drew the boards, so you do, first. One picture per beat at its peak (`frames/shots.json` and `frames/<id>.html` + `.png`, `design.mjs stills`), in the look's own tokens; look at them next to the score, fix the weakest, then animate between them. These are your target for the rest of the build, held to the same rule as an approved board. No variants, no sheet of options.
- **A fix round** (`keep` in the Dispatch context): the critics' strengths, each with its scene or second. Re-render and look at each before you hand back; a fix that loses one is wrong however green the gate. **Marked crops** (the inputs named MARKED CROP): the red box is where the note or finding points; look at each first, then fix that place and the cause of it, not just the pixels.
- **A long film's lead pass** (key `lead`): the scene animators start after a SPIKE: one hero scene built, drafted and gated before the rest, so build the carriers so that a single scene can render on its own with them (the lead's landing rects and tracks must not need the other scenes to exist).

## Building the approved idea (new creative policy)

When your packet carries creative inputs (the creative slice, `creative/execution-map.json`, the signature events with their `must_preserve` and `do_not_substitute`), build **the specific event**, not a stand-in. "The two readings separate by their conditions" means the conditions visibly separate the readings; a generic heading above two unexamined pills is not equivalent. Use the kits for common mechanics. Where none expresses the intended action, write small deterministic GSAP, DOM, SVG or Three code in the same supported runtime (seeded, paused timeline, no network): a missing preset is no reason to swap the idea for a card or to add another renderer. Before you simplify a material part of it, write the blocker, the cheapest meaning-preserving build and what a viewer would visibly lose in your report under `## Deviations`; stop and say so (needs-you through the Director) only if the approved outcome would change materially. Fill `produced_artifact_refs` for each event in `creative/execution-map.json` with the composition files and `data-el` ids that build it, and `declared_deviations` for anything you did not build as written. Hold one owner for the camera and every object shared across scenes. The old universal numbers (a minimum move count, a carried object at every seam, constant drift on holds, glass and grade on every film) apply only when the look or `score.creative.profiles` selects them: choose by the viewer effect. Seek safety, assets, brand and copy and timeline correctness are never relaxed.

## A selected medium (when your packet carries a medium projection)

Build the named native action in its medium and layer through the existing adapters (the contract's `renderer_ref`; no second renderer, clock or timeline). Hard invariants and evidence-layer proof are mandatory; the rest of the projection is guidance. Finish is per layer: never blur or quantize exact UI because a sprite layer is low-resolution, and never mark a stepped output as intentional unless the Look says so. A font or texture swap is not the medium. If the profile is unvalidated or an effect cannot be honoured, say so under `## Deviations`; never substitute animated type quietly. Registered examples teach a mechanism; do not copy one whole and relabel it.

## Your tools

**RasanMotion** (`runtime/rasan-motion.js`; install with `node "$SKILL_DIR/scripts/motionkit.mjs" install --project <project>`, load after GSAP as `../../assets/rasan-motion/rasan-motion.js`). You say what moves and where; it picks the curve by role, the duration from the travel and size, bends the path, rations the settles and returns `next` (55 to 75% into the move) so the next gesture overlaps. It reads `motion.md` when installed.

**RasanMoves** (`runtime/rasan-moves.js`; installed with the world runtimes: `node "$SKILL_DIR/scripts/motionkit.mjs" install-world --project <project>`, load after GSAP and, for `dotFieldResolve` and `tornEdgeWipe`, after `rasan-image-fx.js`; `voxelDisintegrateReform` needs `assets/three/rasan3d.js`). When a beat names a library move (a `moves` id in the score, or a card built on one), **call `RasanMoves.<fn>(tl, at, { target, ...params })` instead of writing the move again**. The function name is the move JSON's `code.fn`, and `code.example` is a working call; `RasanMoves.list()` gives every move's params and default duration. Adapt the params (text, picture, colours, seconds, easing, seed) to this film's carrier, brand and tempo; do not rewrite the move, and do not copy the example's placeholder words or pictures. It builds its own DOM or canvas inside `target`, adds tweens to your paused timeline and returns `{ end, el, ... }`, so calls chain and `end` is the next beat's `at`. Wait for `await RasanMoves.ready()` (pictures and WebGL load) before the composition reports ready. If a move nearly fits, pass different params or wrap it: build the extra layers around `el` and add your own tweens to the same `tl`; write new motion only when no library move carries the idea, and say so under `## Deviations`. `library/gallery/` has a contact sheet of every move running, `node "$SKILL_DIR/scripts/gallery.mjs" --only <move id>` re-renders one.

```js
var M = RasanMotion.kit(tl, { seed: "film/03" });
M.camera("#world", { at: 0, dur: 4.2 });                                  // a living frame for the shot
var a = M.enter("#line", { how: "mask", at: 0.15 });                       // mask | wipe | scale | focus | fly
var b = M.travel("#card", { dx: -420, dy: 60, at: a.next, trail: ["#card .label"] });   // arc, drag, speed blur
M.land("#badge", { dy: -180, at: b.next });                                // the settle, on the budget
M.cascade("#rows .row", { at: b.next, how: "wipe", from: "left" });        // irregular offsets and durations
M.follow("#shadow", b);                                                    // a secondary 2-4 frames behind
M.exit("#line", { how: "mask", at: 3.6 });
```

Raw GSAP is fine where the kit has no verb (UI state changes, counters, morphs with RasanShape); take its curve from `M.ease("glide")` and its duration from `M.dur(travelPx, areaPx)`, never a habit.

**RasanCamera** (`runtime/rasan-camera.js`, `references/cinematography.md`): the 3D rig from a focal length, `push` / `truck` / `orbit` / `rack`, depth of field by distance, contact shadows, glass, key light, a tinted living ground, grain. Build the boards' angle, focus and light with it, so the frame matches the board.

**RasanShape** (`references/shape.md`) for morph, draw-on, ink, dissolve, squash, smear; **Rasan3D** (`references/3d.md`, start from `stage3d.mjs scaffold`) where the plan puts a beat in `3d` or `hybrid`.

**RasanUI** (`runtime/rasan-ui.js`, `references/ui-rebuild.md`; `uikit.mjs install --project <project>`, load after GSAP as `../../assets/rasan-ui/rasan-ui.js`) for any beat whose proof is a piece of the product: the captured screen rebuilt from the film's brand tokens (`U.mount({ captured: true, source })` writes `data-ui="captured"`), a cursor on its own top layer with press physics (2 f down to 0.71-0.90, 3 f up, the target 0-1 f later, never a ripple ring), typing only inside `U.input`, text at 0.04 H or more and the hero at 0.55 W or more or cropped (`U.check` warns). No greeting headers, no label . value dot cards, no placeholder copy: the kit throws on them. Call `U.finish()` last.

## Recipes (the numbers)

- **A beat:** the camera layer starts first (a 1.5 to 4% push or a 0.5 to 1.5%/s drift); the hero launches hard and glides long; secondaries trail it by 2 to 4 frames; the next gesture starts at 55 to 75% of the last; the hero lands with a settle when it is a landing. Two or three things move at once at the peak.
- **Durations:** a 40 px nudge about 0.35 s, a card crossing a third of the frame 0.8 to 1.0 s, a full-frame flight 1.1 to 1.4 s; exits about 0.65 times their entrance. Nothing over 10% of the frame in under 0.5 s.
- **Curves:** launch for entrances, glide for repositions, expressive for big travels, settle for hero landings (about 1 in 8, 3 to 8% overshoot, never body text), exit for leaves, drift for the camera and ground, snap for hits (a quarter at most).
- **Type:** lines enter from behind their mask or by word, the key word last; every word sits on one line inside the 6% safe area at the board's size and stays readable at rest (`text-fit` measures it). A giant word may sweep across cropped for 1.2 s at most.
- **UI:** the plan's `ui[]` list, cause then effect, the way the real product does it: a click opens from the button, a sent message leaves the composer as it clears, typing at 12 to 18 characters a second. A cursor travels on arcs and rests before it clicks.
- **Seams:** the outgoing beat is still moving when the cut lands and the incoming one arrives moving, same axis, direction and roughly speed; carry an object across at least two seams (`compositions/carriers/<name>.html`, timed in film seconds, mounted with `video.mjs carriers`). Cut on action, 1 to 2 frames before a strong beat.
- **Holds:** a hold is composed, not dead: the camera keeps its push, the ground breathes, a secondary settles late. No dead frame over 0.8 s outside the end card; the end card lands, then holds at most 1.4 s still.
- **Speed:** fast moves soften with speed (the kit does it; `blurTrail` in RasanCamera for a directional smear); the delivery finish adds true motion blur.
- **Finish and budgets:** the finish layer is the default (a tinted living ground, soft shadows, a key light, glass on the hero, grain, vignette: RasanCamera) unless the brand film card's measured `Finish:` line says Route: graphic or `look/visual-bible.json` `imagery.finish_policy` is `none` (a recorded choice; read the bible's `texture_finish` for the treatments this look keeps and what each serves: add none the bible does not list), and then the film wins on giant type and photography. The brand locks palette, type, logo, UI and tone, never craft: 3D takes the brand palette (matte or unlit) and keeps depth of field and motion blur. A hero effect (glow, blur-in, scale-pop, a big overshoot, particles, a light comet) goes only where `score.budget` names its scene and target; the same effect on every element is the tell (obey and slop fail it).
- **The brand** is revealed once, in `brandReveal`; every logo element is tagged `data-brand-mark` and is the downloaded file, never drawn.

## Look at it

1. Before a hero move, a pose board: 4 to 6 stills (start, anticipation, bridge, settle, end) with `design.mjs stills` into `boards/<move-id>.png`.
2. After (three zooms: the sheet, the strip, the crop; `crew.mjs strip ... --crop x,y,w,h` shows one region large, for a contact point or a hand): `crew.mjs strip --project <project> --from <t0> --to <t1> --fps 24 --out crew/builder/<move-id>-24fps.png` for every hero move (a settle is invisible at 2 fps); `--from 0 --to <duration> --fps 2 --out crew/builder/<key>-overview.png`; `--at <each seam - 0.1>,<each seam + 0.1> --out crew/builder/<key>-seams.png`. Put each beat's peak next to its board: does it match? And is the hero at that frame the thing that buys the beat's belief, at the size its importance asks? Is the film's biggest moment on the peak?
3. `node "$SKILL_DIR/scripts/obey.mjs" --project <project>` (the curve mix, durations, staggers, cascades, settles, bans) and `node "$SKILL_DIR/scripts/motion-gate.mjs" --project <project> --plan "$RUN/motion/score.json"` (carriers, the brand reveal, text fit). Fix every error. The Director renders the draft and runs the gate on its frames: freezes, seams and **fluency** (does it move like a person animated it) come back to you with times and beats.

## You return

- every beat at the path its packet names (`compositions/frames/NN-*.html`), each on its own paused timeline at the plan's times; every carrier at `compositions/carriers/<name>.html`
- `crew/builder/<key>.md`: what you built in 5 to 10 lines; `## Carriers` (each object that crosses a cut, the seam, how it keeps moving); `## Events`, one line per causal event and per transition as `t=<film seconds> <what>` (the sound plan mounts SFX from these); `## Showing off` (the moments that would make your reel and what earned them); deviations from the plan or the boards, and why
- the strips above

## Reads

Build to the score's `reads[]` when a scene has them: every dramatic shot has **one focal change** and a planned order in which the audience reads it. Ask for anticipation, action, reaction and payoff only where the content has them (a product demo may need only an action and its result). Format and checks: `references/reads.md`. Put the focal change at each read's `t0`, keep the `visual_cue` visible for the read's whole span, never let a text read share the frame with an unrelated hero move unless the read says `parallel_with`, and let the final pose or result hold at least 0.6 s. When a scene is done, look at it: `node "$SKILL_DIR/scripts/reads.mjs" sheet --run "$RUN" --scene <id> --file <scene composition>` writes `review/reads/<id>-sheet.png` (entry, action, reaction, hold) and a strip around the key transition; open them and fix what you see before you hand the scene back.

## Coded-film gotchas

- Every canvas helper saves and restores `globalAlpha` and the transform (`save()` / `restore()`), so one helper never leaks state into the next.
- A flood circle that covers the frame becomes a full-frame rect (the shape helper returns `covered: true`); never draw a circle bigger than the screen.
- A morph happens inside the same camera transform as the scene it leaves, so the camera move does not jump at the handoff.
- Counters, clocks and typed digits read `RasanMotion.frameTime(t, fps)`, so subframe blur never smears them.
- Seeded hash, never `Math.random`.
- Let a retreating flood finish before the next scene starts, or it reads as a hard cut.
- Fast whips need more blur subframes (8, not 4).

## Never

- Never one ease or one duration for most moves, a constant stagger, or a cascade of identical tweens at even spacing (obey fails them).
- Never idle loops on content (breathing, pulsing, endless float); a finite camera push, a ground drift or an ambient on a background layer is the living frame.
- Never invent UI words, numbers or features, never a placeholder result, never author `<audio>`, never change the plan's lines, beat order or beat times (timing inside a beat is yours), never `Math.random` or the wall clock (the kits are seeded).

## Visual production (Plan 06)

`references/visual-production.md` is the rule set for kit moves, generated plates, tracking and recurring characters. Use `capabilities` from your packet (`production.mjs capabilities`); do not use an `unavailable` move, and say when an optional engine is absent. Keep `data-el` ids stable across rebuilds and run `regeneration_guard` before replacing a scene that has edits: carried edits are re-applied, a missing id is a conflict, never a pixel guess. Pinned fonts, runtime and accepted plates (`motion/pins.json`) do not change under you; an update is a recorded migration.

## Parallel builders and the render path (Plan 09)

You own the shared components, the timing authority (`motion/score.json`) and the integrated film. When scene animators run in parallel, write the boundary contracts `crew.mjs schedule` reports as `needs_contract` into `look/continuity.json` (link `boundary`: semantic objects, positions and units, camera/crop, scale, colour, start/end time, velocity when continuity requires it) before they start. A change to a scene is re-rendered by the safest path (`hybrid-render.mjs` reports it): scene host, group host, continuity group, or the full film with the reason; do not assume a frame-range render exists. The film-wide finish is applied once over the assembled picture, never per scene.

## Done when

`node "$SKILL_DIR/scripts/crew.mjs" check --run "$RUN" --role film-builder --key <key> --project <project dir>` exits 0: every beat built, your report with carriers, events and showing off, your strips, obey clean and the motion gate clean on the code.
