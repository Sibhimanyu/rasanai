# Generated images

RasanAI makes pictures with the Codex CLI's built-in image tool on the user's ChatGPT plan (no API key). Generated imagery is on whenever Codex is available (`IMAGEGEN=ready`), as a default for every route where a picture helps the story (a world, a place, a person, an object, a texture, a billboard to land on). It is the engine behind presenter films (`references/presenter.md`) and the world bible below. This file covers what to generate, how to keep it one world, and how to make a still move.

## Contents

- Is it available
- When to use it (and the "Never use it for" list)
- Commands
- Prompt craft
- Review every image before it is used
- In the design system
- Make a still move: the techniques (T1 to T10) and the tools
- The world bible: one world, many framings
- Launch imagery (where a launch scene needs meaning)
- Abstract plates
- Cost
- Prompts from the style atlas

## Is it available

- Read `setup.sh`, which prints `IMAGEGEN=ready|off|no-codex|signed-out` (and `IMAGEGEN_MODEL=`), or run `node $SKILL_DIR/scripts/imagegen.mjs status` at any time (it never runs an image), because only `ready` generates.
- Draw the scene in HTML, CSS or 3D when the status is anything but `ready`, and say so once.
- Leave `RASANAI_IMAGEGEN=off` for turning it off on purpose (RasanAI Studio's setting does this).

## When to use it

- Plan a world for the film (the world bible, below) whenever Codex is ready, unless the concept is type-only or a pure UI film, because imagery is a default on every route where a picture helps.
- When Codex is not ready, say so once and draw the scene or use abstract plates, and keep the film moving.
- Use it when a scene's `visual` needs a photograph, illustration, texture or environment (a plate behind a speaker, a material for a 3D slab, a mood for a title card, a place), because HTML draws those badly.

Never use it for:
- **UI, screens, product shots** or anything about what a real product looks like. Capture them from the research (hard rule 13: nothing from memory), because an imagined product look is wrong.
- **Text, logos, charts, diagrams, maps with labels.** Set type in the document and draw charts in code, because image models draw letters wrongly.
- **A person's likeness the user did not give you.**

## Commands

```bash
node $SKILL_DIR/scripts/imagegen.mjs generate --prompt "<text>" --out assets/images/kiln.png [--aspect 16:9|9:16|1:1|4:5|WxH] [--ref a.png,b.png] [--transparent]
node $SKILL_DIR/scripts/imagegen.mjs batch --plan assets/images/plan.json [--concurrency 3] [--only id,id] [--force]
node $SKILL_DIR/scripts/imagegen.mjs sheet --plan assets/images/plan.json --out assets/images/sheet.jpg      # a labelled contact sheet to look at
node $SKILL_DIR/scripts/story-plates.mjs --concept <treatments-or-concept.json> --out <run>/story/plates   # Story stage: one plate per hero shot of each concept, in its style world; REQUIRED when imagegen is ready (the Story check fails without story/plates/plates.json); the board uses them (no imagegen = it writes plates.json as unavailable and the board is an honest template)
```

- Expect each image to be one Codex run of about 1.5 minutes. The output is cover-cropped to the exact size (16:9 is 1920x1080), the untouched file is kept as `<name>.raw.png`, and `<out>.json` records the prompt, model and seconds.
- Know that an existing `--out` is kept unless `--force`.
- Name an `anchor` image in a batch: it is made first and passed as a reference to every other image, which is how a set of images looks like one world.

## Prompt craft

Say what the camera sees, in this order, in plain sentences:

1. **Subject**: one concrete, specific thing ("An empty pottery wheel, the clay still in its paper bag", not "creativity").
2. **Setting**: where, when, what is around, in real materials.
3. **Lens and framing**: a focal length or shot name ("35mm, eye level", "overhead, 50mm", "wide, low angle"), because it sets the feel more than adjectives do.
4. **Light**: one motivated key and its direction ("low sun from frame left, long shadows", "a single tungsten lamp"), because direction matters when a person will be composited in.
5. **Palette, from the design system**: name the colours in words ("clay, ochre, a single cold blue window") that map to the DESIGN.md's colours, and leave hex codes out of the style.
6. **Texture and medium**: "35mm photograph, soft grain", "gouache on cotton paper", "matte clay render".
7. **Room**: where type or a person will go ("keep the right third calm and empty"), because leaving room is part of the picture.
8. **What to avoid**: no text, no logos, no watermarks, no hands unless needed, nothing looking at the camera.

- Put the system's `## Imagery` section (or the plan's `style.lock`) into every prompt as the shared line, so the images belong together; the batch plan does it with `style` and `avoid`.
- Keep consistency through the anchor: name it, generate it first and pass it as `--ref` to every later image (the batch does this), with one lens family, one light direction and one palette across the set.
- Keep the slop words out of prompts (`presenter.mjs check` rejects them): stunning, breathtaking, 8k, 4k, hyper-realistic, ultra-detailed, masterpiece, trending on artstation, octane render, unreal engine, award-winning, epic. Replace each with what it was hoping for (the lens, the light, the material), because these words add nothing and flatten the result.
- For plain and literal pictures (the owner's answer `pictures=literal`, `library/questions.json`), show the named thing itself, framed plainly, with no world, metaphor or second meaning.
  - When the thing is real (a book, a product, a place, a person's work), find the real image first (a web search for the cover or product shot, or the owner's own files) and use it as a `real` plate (`references/presenter.md`: `source`, `file`), because a generated lookalike of a real object gets the title, the cover or the face wrong.
  - If it cannot be found, set the plate's `todo` and the Director asks the owner for the file.
  - Make generated plates only for things with no single real image (bread and wine on a table, a morning street), shot as a plain photograph.
- Ask what the sentence implies or costs and show that, because a picture of the sentence is wallpaper ("images that argue").

## Review every image before it is used

Look at the contact sheet (`imagegen.mjs sheet`) and at the single file for anything doubtful. Reject and regenerate with a sharpened prompt (one image at a time, `--force`) when:
- there is any text or letter shape, even a fragment or a sign,
- it drifted from the anchor (a different palette, lens or era),
- it says something other than the idea (a literal clipart version of the line),
- a hand, face or object is malformed,
- the composition has no room where a person or type needs it,
- a person will stand in front of it and its light comes from the other side.

Regenerate at most twice per image, then change the idea and leave the wording alone.

## In the design system

- Add a `## Imagery` section to a DESIGN.md as the art direction every generated image obeys (medium, lens, light, palette mapping, texture, composition room, what never). It is required in presenter films and optional elsewhere (`agents/design-system-designer.md`).
- Have frame designers and animators who call `imagegen.mjs` read it and follow it.

## Make a still move: the techniques (T1 to T10)

- Pair a still with a mover (parallax, a push, a dissolve (pixel, dot, halftone), a mask cut, a swap of the surface it is printed on), because the reference films do not use video of an image.
- Reuse hero assets (carrier, device, texture, logo) 3 to 7 times at different crops, scales and surfaces and a photo or AI still 1 to 3 times; use 0 to 10 distinct pictures per film (zero is valid), best as content inside the product UI or as one burst of 5-6 plates.
- Build every one on the paused timeline with `runtime/rasan-image-fx.js` (WebGL, canvas fallback, seek-safe; API in its header) or the baked layers below.

| | Technique | Tool |
|---|---|---|
| T1 | **Depth parallax**: image + depth map, camera x/y/z/rotate | `art.mjs depth` then `fx.parallax` |
| T2 | **Push / dolly through layered planes**; last move *into a surface* (a poster, a screen) as the cut | `art.mjs plates` (far/mid/near, holes inpainted) then translate/scale per layer, or `fx.parallax` with `z` |
| T3 | **Masks and reveals**: shape, text as window, torn paper, a card as the mask | `fx.wipe` (`circle`, `rect`, `bars`, `linear`, `text`, `torn`, `mask`) |
| T4 | **Dot / pixel / halftone dissolve** in and out: the brand grammar of "resolving" | `fx.dissolve` (`mode: dot|pixel|halftone`, `order: noise|radial|ltr|ttb|luma`) |
| T5 | **Morph / match-cut** between two pictures: displacement morph, or a shared-shape cut (generate the second picture *with the first as a reference* and "same placement of the subject") | `fx.morph` |
| T6 | **Mockups**: the picture on a billboard, poster, phone, laptop, bus shelter; light matched; an animated surface | `art.mjs mockup` (baked) or `fx.pin` (live, with `--plate-only` back/over layers) |
| T7 | **Camera-matched continuity**: hold the hero's place across a cut, align the horizon, match the grade | `fx.grade`, `fx.palette` |
| T8 | **Atmosphere**: a held still is never static: seeded grain, haze, light sweep, slow breathing | `fx.drift`, `fx.grainClock`, `fx.grade` |
| T9 | **Segmentation moves**: the subject in front of text, a duplicate echo, a step forward on the push | `art.mjs cutout --object` |
| T10 | Image-to-video plates | optional, cloud only (Higgsfield skill); local models take minutes per second, never in the film loop |

- Avoid these tells: rubber-sheet stretching on faces (keep parallax `strength` under about 3% of the width), a halo at a cut-out edge, parallax on a flat texture (it reads as a sliding sticker), more than one dissolve per beat.

### The tools

```bash
node $SKILL_DIR/scripts/art.mjs depth  --in plate.png --out plate.depth.png [--bits 8|16] [--size 518]        # Depth Anything V2 Small (Apache-2.0), white = near
node $SKILL_DIR/scripts/art.mjs cutout --object --in a.png --out a.cut.png [--matte-out m.png]               # BiRefNet lite (MIT): any subject, not only people
node $SKILL_DIR/scripts/art.mjs plates --in plate.png [--depth d.png] --out plates/ [--splits 0.4,0.7]       # far.png mid.png near.png + plates.json (hole-free back plates)
node $SKILL_DIR/scripts/art.mjs mockup --list
node $SKILL_DIR/scripts/art.mjs mockup --in plate.png --template billboard --out mock/billboard.png --parts   # + billboard.json (the quad), .back.png, .over.png
node $SKILL_DIR/scripts/art.mjs mockup --in plate.png --bg street.png --corners "x,y,x,y,x,y,x,y"             # your own generated "blank hoarding" plate
```

- Know that the models are downloaded once into `~/.cache/rasanai/models` (about 100 MB and 224 MB, sha256-checked, `RASANAI_MODELS` moves them) and run through onnxruntime-node from the hyperframes cache. They run offline, once, at build time, and a render never runs a model, so bake the depth map and the plates, put the PNGs under `assets/` and let the runtime read them.
- Generate mockup plates from the image model as an empty surface ("an empty street hoarding, flat blank white panel, no text") and pick the four corners once; the built-in templates need no generation. Use a template for a device frame and generate no device. Put the picture on the surface with `fx.pin` so it can dissolve, parallax or swap on the billboard.
- Name the mover (`parallax`, `push`, `dissolve`, `morph`, `wipe`, `pin`, `drift`, `atmosphere`) in the world bible's `used_by` for every shot that uses a generated image, because a still that holds longer than about 1.2 s with no mover fails the gate.

## The world bible: one world, many framings

`art/world.json` (schema and checks in `scripts/lib/world-bible.mjs`, commands under `art.mjs world`) is a small, frozen file written before any scene image is made:

- **anchor**: the master plate, approved by eye first, generated with about 12% bleed all round (for camera travel) and a calm side for type.
- **style line**: 30 to 45 words, frozen, added to every prompt (medium, lens, light direction, palette in words, texture, haze, calm side, and what is never in it), with no hex codes.
- **palette**: 3 to 6 hex colours with names; the grade/palette lock (`fx.palette`) uses them.
- **images**: usually 3 to 6 in all (anchor, plates, character or object sheets, a mockup plate); zero is valid when the carrier and the UI carry the film, and about 20 stills used once each in bursts of 5-6 is valid too (a warning above 6).
  - Keep a character sheet to one subject on a neutral ground, and list the shots that show the character in `needs` so it is passed as `--ref`.
  - Use a back of the head, a silhouette or a distant figure for faces, because that keeps consistency cheaply.
- **used_by** per image: the shots that use it, with `start`, `end`, `mover`, `technique`, `surface`. Prefer a derivative (crops, flips, grades, halftone or pixel versions, cut-outs, depth maps, mockup placements) to a new generation, because derivatives are free.
- **derive**: which derivatives to bake after generation (`depth`, `plates`, `cutout`).

```bash
node $SKILL_DIR/scripts/art.mjs world init  --run "$RUN"      # a skeleton with one slot per image
node $SKILL_DIR/scripts/art.mjs world check --run "$RUN"      # the reuse gate (also part of `art.mjs check`)
node $SKILL_DIR/scripts/art.mjs world make  --run "$RUN"      # anchor first, then the sheets, then the rest with the anchor as --ref; then the derivatives
node $SKILL_DIR/scripts/art.mjs world lock  --run "$RUN"      # hash the anchor prompt + style line; a change after that makes every child stale
```

- Read the reuse gate as conditional (R6: one favourite film has no photos, one uses ~20 stills once each in bursts, one reuses ~10 covers twice). Reuse hero assets (carrier, device, texture, logo) 3-7 times and a still 1-3 times; 3+ uses per image and more than 6 images are warnings; zero photos is fine. The one problem that stays an error is a still static for more than about 1.2 s (a use with no mover and a longer hold).
- Review drift on the contact sheet and reject an image whose palette, lens or light direction differs from the anchor, with two regenerations at most.
- Follow the order of work: the Moves pass tags each beat's `shows` with `image:` and the technique; the art director writes the world bible and `used_by` from that; `world make` generates; the film builder uses `assets/` plus `rasan-image-fx.js`; the frame and motion gates read `used_by` and the movers.

## Launch imagery (where a launch scene needs meaning)

- Use 1 to 4 Codex images per launch film and only where they add meaning (`launch-grammar.md` section 4d), because the imagery is the content of the product shot and never wallpaper. Minase fills its landing pages and cards with generated worlds (grass hills, a chair on a mound, flowers).
- Direct the style as editorial and tactile, with no people and no AI glow. The reference films' images are still-life objects and props (driftwood with a flower, a retro CRT with a sad face on its screen, flowers on a rock against the sky, a printed street map, paper and print textures, landing-page photo cards) in natural light, real materials, warm or neutral palettes, with a photographic or print feel, often cut out or collaged into cards.
  1. Keep people out: no faces, figures, hands or silhouettes unless the brief explicitly asks, because generated people read as AI.
  2. Keep neon or blue-glow gradient tech scenes, glowing screens, holograms and "cinematic AI" moods out, because a person at a laptop lit by a blue gradient is the failure that reads as AI-generated.
  3. Prefer still-life objects, props, places without people, materials and printed matter, used as content inside UI cards and collages.
- Know that `imagegen.mjs plan-from-score` appends this style line and the negative guidance (people, faces, hands, neon, glow gradients, holograms) to the batch plan, and `story-plates.mjs` adds it to launch plate prompts. A prompt that mentions people, person, man, woman, face, hands, silhouette, crowd, neon, glow or hologram warns (`imagery-people-or-glow`, and a stderr warning from both scripts) unless the score sets `imagery_people: true` because the brief requires people.

<example>
good: "A printed street map and a brass compass on kraft paper, 50mm overhead, soft window light from frame left, warm paper tones, 35mm photograph with soft grain, keep the left third calm for type; no text, no people." It pushes slowly behind the line.
bad: "A woman at a laptop, glowing blue holographic UI, cinematic, epic." Fix: swap the person and the glow for a still-life prop in natural light, or set `imagery: "none"` for the beat.
</example>

- Ask for one in three cases:
  1. A world inside a UI card: the card or landing page has a hero image that is part of the pitch (a place, a mood, an object).
  2. An object or metaphor shot: one clean object for a line ("a chair on a mound" for rest), lit in the brand palette.
  3. A cinematic plate behind type: a dark or bright scene the type sits over.
  Keep the product's real UI, text, logos, charts and a real person out of them (the "Never use it for" list above stands).
- Declare score-level `imagery_plan[]` (`{id, prompt, aspect?, transparent?}`; the prompt comes from the concept and the brand palette, one style line shared by all) and per beat `imagery: "<id>"` or `"none"` (the designer or the motion director declares it).
  - Run `node scripts/imagegen.mjs plan-from-score --score <run>/motion/score.json --out assets/images/launch-plan.json` to write the batch plan for exactly the images the beats use (it warns above 4), then `imagegen.mjs batch --plan assets/images/launch-plan.json`.
  - Run `batch --world art/world.json` instead when the film has a world bible (`art/world.json`), so every image shares the anchor and the style line.
- Animate it, because a still is held at most about 1.2 s: parallax layers (the T-techniques above, `RasanImageFX` depth), a slow push, a light sweep, a stepped reveal (`RasanTexture.stepped`), or the image scrolling inside its card on threes. `launch-beats` counts the distinct images (`imagery-count`).

## Abstract plates

A plate is atmosphere and no subject: flowing organic shapes, soft gradients, a minimal composition, in the film's own colours and nothing else. It is the layer the reference films have and flat films lack (Kinso's peach to sage field, Sovra's violet glows; R1 §1.3 and recipe C). Uses: a living ground under the whole film (`cam.flowGround`), a depth layer far behind the UI (defocused, hazed), a plate to zoom through between beats (`cam.plateTransition`), and an end-card field.

- Use plates as a standard asset on the atmospheric finish route (the brand film's measured `Route: atmospheric`, or no brand film and a look that carries a tinted ground): `art.mjs plan` adds a calm ground plate and a plate to zoom through.
- Skip plates on the graphic route (the brand's films are flat: OpenAI, an editorial reel) unless the brand film itself shows colour fields, because that route wins on type scale and photography.
- Keep one plate family per film, like any other set.

Make one:

```bash
node $SKILL_DIR/scripts/art.mjs plate --out art/assets/plate-ground.png --palette "#e8693f,#f2b9a0,#f7f1ea,#7fb0ab" --ground "#f7f1ea" \
  --variant fold|vortex|horizon|ribbon --aspect 16:9|9:16 [--seed N] [--calm 0..1] [--flip] [--engine auto|procedural|imagegen]
node $SKILL_DIR/scripts/art.mjs recipe --palette ... --ground ... --variant vortex      # the prompt and the ramp, no image
```

Or as a plan row: `{id, kind: "abstract", variant, aspect, ground?, palette? | ramp?, calm?, flip?, seed?, used_by}`; `art.mjs make` builds it.

- **The recipe** (imagegen, when `IMAGEGEN=ready`): "Abstract visual, flowing organic shapes, soft gradients, minimal composition", then the composition variant (a flowing S-curve fold, a soft vortex, a horizon glow, a ribbon), the palette in words as the gradient's hues on the look's light or dark ground, silky light (a highlight along each fold, soft shadow between), a calm area for type, the frame (16:9 or 9:16), and "no text, no letters, no objects, no logos, no people, no UI, no frames, no watermark".
- **The lock.** Whatever the engine, run the picture through `treat --op gradient-map` onto the ordered palette ramp, dithered (1.5 grey levels) and with 1% grain, because its lightness then runs along the ramp and an off-palette hue is impossible.
  - Order the ramp as the palette in one path: a dark ground starts it and the rest climb by lightness (Sovra: black, deep violet, violet, lilac, pale); a light ground sits between the warm and the cool colours (Kinso: coral, peach, cream, sage). Pass `--ramp` to set the order yourself.
  - Order it deliberately, because colours far apart on the ramp blend through the ones between them (coral to sage passes cream).
- **No image generation?** Use the procedural plate: `RasanCamera.plate` draws a grey field headless (layered blurred radial and linear gradients and shapes, bent by seeded noise, warped by an SVG `feTurbulence`/`feDisplacementMap`), then the same ramp maps it. It is seeded and deterministic (same options, same bytes), about a second, so every film can have plates.
- Set **calm** to pull the plate toward the ground (0.4 to 0.6 for a ground behind UI and type), **flip** to swap which pole sits in the lobe, and the **seed** for another plate in the same family.
- **Review** it at full size: smooth, luminous, no banding, no text-like shapes, the calm area really calm. A plate behind UI holds the UI's contrast (the type still passes).

## Cost

- State the image count in the activity feed before a batch, because each image is a share of the user's ChatGPT/Codex allowance and about 1.5 minutes (a world of 3 to 6 images is 5 to 9 minutes at concurrency 3).
- Reuse an image with a different crop or move before making a second one, because depth, cut-outs, plates, grades and mockups cost seconds and no allowance.

## Prompts from the style atlas

- Give `imagegen.mjs generate` `--style <atlas id> [--palette <id>] --subject .. --action .. --setting ..` (or `--prompt` with the shot's `see` text), and in a world bible set `style_world` (+ `palette_id`, `brand_colour_name`).
- Expect the prompt to be built from `art.codex` (lens, light, material, colour as palette words, texture, the style's negatives, always "no text, no letters, no logos, no watermark") plus the world's style line (`buildArtPrompt` in lib/world-bible.mjs).
- Make sprite sheets with `--sprite` (styles with `sprite_sheet.use`): flat #00FF00, equal grid, no text, no green in the sprite.
