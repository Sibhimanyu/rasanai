# Rasan2D: hand-painted 2D characters

Rasan2D is the 2D sibling of Rasan3D: a deterministic Canvas 2D stage that paints a recurring original character in a wash-and-ink hand, driven by the scene's paused GSAP timeline. HyperFrames stays the final renderer. All code is original (Canvas 2D strokes, variable-width ribbons, seeded bristle tracks, translucent pigment, paper grain); no p5.brush or other brush code is used, and no existing character ships.

## The pipeline

```sh
S="node $SKILL_DIR/scripts/stage2d.mjs"
$S install  --project videos/<film>                       # assets/rasan2d/ (brush, character, gestures, rasan2d .js)
$S scaffold --project videos/<film> --frame 02-actor --duration 4 [--canon RUN/cast/hero-01/identity.json] [--sequence seq.json]
$S stills   --file videos/<film>/compositions/frames/02-actor.html --at 0,1,2.5,3.8 --out /tmp/actor-stills
$S check    --project videos/<film> [--run RUN --score RUN/motion/score.json] --json
$S canon    --run RUN                                      # the score's cast against the identity files
$S sheet    --canon identity.json --kind views|emotions|turn --out sheet.png
$S film     --out /tmp/pim                                 # the 15 s procedural test film: sheets, action strips, MP4
```

Exit codes: 0 clean (warnings allowed), 2 violations, 1 could not run (never "clean"). `video.mjs inject` installs `assets/rasan2d/` when a composition or the STORYBOARD names Rasan2D.

## Identity (canon)

`score.cast[]` (`id`, `kind: "character"`, `canon`, `fixed`) is the only link to an actor. `canon` points at `RUN/cast/<id>/identity.json` (schema in `stage2d/fixtures/original-actor.json`): `schema_version 1`, `id`, `display_name`, `medium: "painted-2d"`, `palette {body, outline, accent}`, `proportions`, `fixed_traits` (2 or more), `views` (all five), `expression_preset: "standard-31"`, `source: original | user-authorized | generated` (the last two need a `credit`). `lib/canon.mjs` validates it (the same module W6 uses for `medium: "3d-rig"`). A name that is an existing character is refused. Fixed traits the rig draws: round ears, single curved tuft, two short legs, cream belly patch, cream mittens, cream tail pom, muzzle, dorsal spots.

The character designer draws nothing by hand: it writes the identity, runs `stage2d.mjs sheet` (the sheet is rendered by the runtime that will animate it), and looks at it. Builders never redesign the actor per shot.

## API (browser)

```js
const R = Rasan2D.mount(canvas, { width: 1920, height: 1080, seed: 7, look });   // seed is required
R.addActor({ id: "hero-01", canon: identity, position: { x: 0.5, y: 0.78 }, scale: 1, yaw: "front", emotion: "calm" });
R.addProp({ id: "pear", kind: "pear", size: 66, x, y, motion: [{ kind: "fall", at, arrive, to: [x, y] }, ...], z: [{ t, rel: "hero-01", where: "behind" | "front" }] });
R.load(sequence);                 // a whole film as data: actors, props, sets, shots (camera keys, lights), actions
R.renderAt(1.25, { actions: [{ actor: "hero-01", kind: "look", at: 0.8, duration: 0.4, target: [0.7, 0.5] }] });
Rasan2D.stage({ id, canvas, timeline, duration, seed, sequence, canons, look });  // the HyperFrames form
```

`renderAt(t)` is a pure function of t, the seed, the look and the action list: nothing is integrated from the previous frame and nothing is mutated for the future, so frames can be asked in any order, twice, or on parallel workers (`stage2d.mjs film --workers 3`). Caches hold only completed pure results. No remote URL is accepted anywhere (canon, props, look).

## The eight capabilities

1. **Five views**: front, quarter, side, back-quarter, back (negative yaw faces left). One rig; each view has its own drawing (the profile grows a snout bump and a one-eye face, the quarter's far eye narrows, the back loses the face and gains a nape curl and two dorsal spots). A `turn` steps through them (`via: "front" | "back"`); head leads, body follows.
2. **31 emotions**: calm, curious, surprised, worried, sad, joyful, frustrated, skeptical, proud, embarrassed, scared, delighted, thoughtful, angry, sleepy, excited, confused, determined, smug, relieved, disgusted, shy, hopeful, disappointed, amused, bored, suspicious, adoring, shocked, mischievous, dizzy. Each sets eyes, lids, brows, mouth, blush, head, torso, ears, tuft and reaction marks. `emote` blends; `react` pops one in.
3. **Actions** (`at`, `duration`, absolute seconds): idle/breathe, look/gaze (a point or a prop), walk, point, reach (a target or `track: <prop>`), hop, jump, react/take (`style: take | slump | jump-scare | wince`, `hold`), blink, turn, hold (a prop, `hand: R | L | both`), release, emote, catch. Built in: anticipation, squash and stretch (volume kept), easing, arcs, overshoot and follow-through (ears, tuft, tail, head answer the body's own past through a damped spring), part timing offsets, weight (landing squash grows with the fall), planted feet (a compiled foot schedule: a planted foot has one world position).
4. **Boil**: 12 drawings a second (`look.boil.hz`), offsets seeded from (seed, actor, part, drawing number); the camera and poses stay smooth; the backdrop uses its own stable seed.
5. **Style layers** (`look`): `paper` (tint, grain, fibres), `wash`, `ink` (width, wobble), `glow` (additive, from `shot.lights`), `grade` (a tint over the finished frame), `layers {wash, ink, paper, glow, grain, bristles}`. The identity's palette wins for the actor; the film's look owns the paper, the set, the grade and the finish.
6. **Multi-actor**: any number of actors; painter's order by floor line, with part-level depth (`depthBias: [{actor, part, bias, from, to}]` puts a hand over another actor's hand), prop depth keys relative to an actor, held props with grab blends.
7. **Narrative grammar**: every dramatic shot has an event (a cause, then its reaction), one readable focal action, motivated cuts, continuity of the actor across shots, an ending hold. Show, don't tell: captions and subtitles are respected when requested but are not the default.
8. **Performance**: stateless `renderAt`, cached paper and grain textures, a shot's backdrop painted once into parallax layers.

## Quality bar

At 1080p the actor reads as a charming original character, not a box: clear silhouette, a face that changes with the emotion, planted feet, a reaction that is held long enough to read. Look at `stage2d.mjs sheet` and `strips` output before building scenes, and at the 24 fps strip of each hero action. `stage2d.mjs check` fails: a missing or invalid canon, a copied design, unseeded randomness or a clock, an actor out of frame, a missing runtime, a frame that is not seek-safe, an unseeded boil, a slid planted foot. It warns: poses near their limits, a shot with no action, a slow frame.

**Finishing.** The scene root carries `data-finish-blur="off"`, so `finish.mjs` leaves a Rasan2D scene unblurred (a shutter would average two boil drawings into a dissolve); the grade still applies. See [finish](finish.md).

## Not built yet

Talking (mouth shapes for speech), cloth and hair simulation, outfits beyond the palette, a mocap puppet. `formats.json` says `partial` for that reason.
