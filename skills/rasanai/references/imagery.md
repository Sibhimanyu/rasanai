# Generated images

RasanAI can make pictures with the Codex CLI's built-in image tool, on the user's ChatGPT plan (no API key). It is the engine behind presenter films (`references/presenter.md`) and is open to any other route when a scene needs a picture that HTML cannot draw well. This file is how to use it well.

## Is it available

`setup.sh` prints `IMAGEGEN=ready|off|no-codex|signed-out` (and `IMAGEGEN_MODEL=`). The same check, any time: `node $SKILL_DIR/scripts/imagegen.mjs status` (it never runs an image). Only `ready` generates. Anything else: draw the scene in HTML, CSS or 3D as usual, and say so once. `RASANAI_IMAGEGEN=off` turns it off on purpose (RasanAI Studio's setting does this).

## When to use it

Use it when a scene's `visual` needs a **photograph, illustration, texture or environment**: a plate behind a speaker, a material for a 3D slab, a mood for a title card, a place. These are what HTML draws badly.

Never use it for:

- **UI, screens, product shots** or anything about what a real product looks like. Those come from the research (hard rule 13: nothing from memory), captured, not imagined.
- **Text, logos, charts, diagrams, maps with labels.** Image models draw letters wrongly. Set type in the document; draw charts in code.
- A person's likeness the user did not give you.

## Commands

```bash
node $SKILL_DIR/scripts/imagegen.mjs generate --prompt "<text>" --out assets/images/kiln.png [--aspect 16:9|9:16|1:1|4:5|WxH] [--ref a.png,b.png] [--transparent]
node $SKILL_DIR/scripts/imagegen.mjs batch --plan assets/images/plan.json [--concurrency 3] [--only id,id] [--force]
node $SKILL_DIR/scripts/imagegen.mjs sheet --plan assets/images/plan.json --out assets/images/sheet.jpg      # a labelled contact sheet to look at
```

Each image is one Codex run, about 1.5 minutes. The output is cover-cropped to the exact size (16:9 is 1920x1080), the untouched file is kept as `<name>.raw.png`, and `<out>.json` records the prompt, model and seconds. An existing `--out` is kept unless `--force`. In a batch, name an `anchor` image: it is made first and passed as a reference to every other image, which is how a set of images looks like one world.

## Prompt craft

Say what the camera sees, in this order, in plain sentences:

1. **Subject**: one thing, concrete and specific. "An empty pottery wheel, the clay still in its paper bag", not "creativity".
2. **Setting**: where, when, what is around. Real materials.
3. **Lens and framing**: a focal length or shot name ("35mm, eye level", "overhead, 50mm", "wide, low angle"). It sets the feel more than adjectives do.
4. **Light**: one motivated key and its direction ("low sun from frame left, long shadows", "a single tungsten lamp"). Direction matters when a person will be composited in.
5. **Palette, from the design system**: name the colours in words ("clay, ochre, a single cold blue window") that map to the DESIGN.md's colours. Do not paste hex codes as the style.
6. **Texture and medium**: "35mm photograph, soft grain", "gouache on cotton paper", "matte clay render".
7. **Room**: where type or a person will go ("keep the right third calm and empty"). Leaving room is part of the picture.
8. **What to avoid**: no text, no logos, no watermarks, no hands unless needed, nothing looking at the camera.

Then the shared line. Put the system's `## Imagery` section (or the plan's `style.lock`) into every prompt, so that the images belong together: the batch plan does it with `style` and `avoid`.

**Consistency.** The anchor image is the style. Name it, generate it first, and pass it as `--ref` to every later image (the batch does this for you). Keep one lens family, one light direction and one palette across the set.

**The slop list.** These words add nothing and flatten the result; none of them goes in a prompt (`presenter.mjs check` rejects them): stunning, breathtaking, 8k, 4k, hyper-realistic, ultra-detailed, masterpiece, trending on artstation, octane render, unreal engine, award-winning, epic. Replace each with the thing it was hoping for: the lens, the light, the material.

**Images that argue.** A picture of the sentence is wallpaper. Ask what the sentence implies or costs, and show that.

## Review every image before it is used

Look at the contact sheet (`imagegen.mjs sheet`), and the single file for anything doubtful. Reject and regenerate with a sharpened prompt (one image at a time, `--force`) when:

- there is any **text or letter shape**, even a fragment or a sign,
- it **drifted from the anchor** (a different palette, lens or era),
- it **says something other than the idea** (a literal clipart version of the line),
- a **hand, face or object is malformed**,
- the **composition has no room** where a person or type needs it,
- a person will stand in front of it and its **light comes from the other side**.

Two regenerations per image at most; then change the idea, not the wording.

## In the design system

A DESIGN.md can carry a `## Imagery` section: the art direction every generated image obeys (medium, lens, light, palette mapping, texture, composition room, what never). It is required in presenter films and optional elsewhere (`agents/design-system-designer.md`). Frame designers and animators who call `imagegen.mjs` read it and obey it.

## Cost

Each image is a share of the user's ChatGPT/Codex allowance and about 1.5 minutes. State the count in the activity feed before a batch. Reuse an image with a different crop or move before making a second one.
