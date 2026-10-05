# Presenter films

Read this when the footage is one person talking to camera, shot on a green or blue screen (or any single-subject talking clip the user wants put "into" other worlds). Route: `presenter`. The person is keyed out; behind and around them the film cuts between **generated image plates** made for what they are saying at that moment, moving with designed camera moves, plus motion graphics (titles, callouts, stats, lists, labels) and optional captions. The voice is the spine. In this version the clip plays whole: the cut never changes what they said, and nothing is trimmed.

This is the playbook for the visual writers (`agents/visual-writer.md`) and the Director. The scripts are `presenter.mjs` (key, beats, check, plates, stills, build) and `imagegen.mjs` (the Codex image tool). Prompt craft for the plates is in `references/imagery.md`.

## The five calls, for a presenter film

| # | What happens |
|---|---|
| 1 Brief | the sentence, with the clip (kept inside the Brief as a `footage` push once keyed): length, aspect, whether it is keyed from green, blue or by AI matte |
| 2 Story | three **visual treatments** of the same speech: Sure, Bold, Wild. The words never change; what changes is the world they happen in |
| 3 Look | three design systems that also carry an `## Imagery` section: the art direction every generated image obeys |
| 4 Animatic | one composite still per beat (plate, keyed person in their layout, graphic boxes) with the real speech audio |
| 5 Final | the rendered film |

## What makes a presenter film good

1. **Images that argue.** A plate that shows what the sentence says is wallpaper. A plate that adds a second meaning (the claim, and what it costs; the metaphor, turned physical) is a film. "Most teams ship far too late" is not a calendar. It is an empty pottery wheel at dawn, the clay still in the bag. The viewer reads the sentence from the voice and the idea from the image.
2. **One running world or idea per treatment.** Choose it before you write a single plate: a pottery studio that changes with the argument, a city seen from a lift, one table through the seasons. Plates are rooms or angles of that world, not a stock library. A recurring plate (`reuse`, a different crop or move) is a feature: the film comes back to the table and the table has changed.
3. **The presenter interacts with the world.** At least once, the person must belong to the image: they point at something in it (put the pointed-at thing where their hand goes), step into it (cut from `presenter-full` to a plate that continues their direction of travel), or are framed by it (a window, a doorway, a panel drawn around them). A person pasted in front of unrelated pictures is the failure this format exists to avoid.
4. **Cutaways that land on a word.** A `plate-only` beat (the person hidden, the voice continuing) is the strongest cut in the format. Land it on the word it is about, hold it two to six seconds, and bring the person back on the next beat. Over six seconds and the viewer wonders where they went.
5. **A rhythm of layouts.** Never the same layout more than three beats running; at 30 seconds or more use at least three different ones. Pair them with the speech: `presenter-full` for the claim, `presenter-left` or `-right` while a graphic carries a number, `plate-only` for the image beat, `presenter-corner` for an aside, `presenter-only` for the hook or the close, `split` for a comparison.
6. **Graphics beside the person, not on them.** A graphic never goes in the zone the person occupies for that layout (`presenter-left` means the left third is theirs). Put the title where the plate is calm, and let it enter on its word. Eight words at most. A graphic that repeats what is said beats one that adds nothing, but a graphic that adds the number is best.
7. **Room for the person is part of the plate.** For `presenter-left`, `-right` and `split`, the plate is generated with a calm, uncluttered third on that side (`presenter.mjs plates` appends it). Detail behind a head is noise.
8. **Light agrees.** The plate's key light direction and the person's must not clash. If the clip is lit from frame left, make the plates lit from the left, or the person looks cut out (they are).
9. **Plates are held, not flashed.** Every generated plate holds 2.5 s or more in total, and the film has no more than one generated plate per 3.5 s. More than that is both expensive and busy.

## Sure, Bold, Wild, for this format

- **Sure**: the literal, well-made version. Each beat gets an image that illustrates what is said, in one consistent world and one consistent grade. It is the floor: clean, readable, nothing clever, and with at least one beat where the person and the image clearly connect.
- **Bold**: one running world or metaphor the whole talk happens inside. The world changes as the argument changes (the studio at dawn, at the first firing, at the sale). Layouts are chosen to put the person in the world.
- **Wild**: a conceit a studio would put on its reel. The talk is staged inside something unexpected (a museum of the idea, a board game, a weather report) and the person has a part in it. Still legible; the words still come first.

Recommend the most ambitious one that still lets the words be heard.

## Where the plates come from

Plates have a `kind`:

- `generated`: made by Codex from `prompt` (about 1.5 minutes each on the user's ChatGPT plan; see the cost note).
- `designed`: built in HTML/CSS/3D by an animator in the design system. Use it for diagrams, maps, typographic worlds, or anything an image model draws badly; and everywhere when Codex is not available.
- `reuse`: the same image again (`reuse: "<plate id>"`) with a different crop or camera move.

`plate: null` is only valid with `presenter-only`.

## The plan: `presenter/plan-<Label>.json`

One file per visual writer (chosen one is copied to `presenter/plan.json`).

```json
{
  "version": 1,
  "clip": "assets/sources/talk.mp4",
  "aspect": "16:9",
  "angle": "Bold",
  "title": "The kiln remembers",
  "idea": "Every claim she makes happens inside one pottery studio that changes with her argument",
  "style": { "lock": "35mm photograph, warm tungsten key from frame left, clay and ochre palette, soft film grain, shallow depth of field", "avoid": "text, logos, watermarks, people looking at camera" },
  "beats": [
    {
      "id": "b1", "start": 0.0, "end": 4.2,
      "say": "Most teams ship their first version far too late.",
      "layout": "presenter-right",
      "plate": { "id": "p1", "kind": "generated", "prompt": "An empty pottery wheel at dawn ...", "camera": "push-in", "why": "the unstarted work" },
      "graphics": [ { "type": "kinetic-title", "text": "far too late", "at": 2.1, "out": 4.0, "zone": "left" } ],
      "transition_in": "cut"
    }
  ]
}
```

- `layout`: `presenter-full` (the person as shot, plate behind), `presenter-left`, `presenter-right` (scaled about 0.8, subject centred at x about 0.27 or 0.73), `presenter-corner` (about 0.38, lower right, picture-in-picture with a designed frame), `presenter-only` (no plate: the design system's canvas behind), `plate-only` (cutaway), `split` (the person in a framed panel, the plate in the other half). Geometry comes from `key.json`'s measured subject box, so the person lands where intended wherever they stood. In 9:16, left and right become top and bottom stacking where needed (the person in the lower 60%, the plate full bleed).
- `plate.camera`: `push-in`, `pull-out`, `pan-left`, `pan-right`, `tilt-up`, `tilt-down`, `drift`, `parallax` (a slow push with a slight counter-move of the person's layer), `static`. Not one move everywhere.
- `graphics[].type`: `kinetic-title`, `callout`, `stat`, `lower-third`, `list`, `quote`, `diagram`, `label`. `at` and `out` are absolute seconds inside the beat; `zone` is `left`, `right`, `top`, `bottom` or `center`.
- `transition_in`: the taxonomy's terms (`cut`, `match-cut`, `wipe`, `push`, `whip`, `blur-dissolve`, `iris`, `shape-mask`, `light-leak`). The first beat's is `cut`.
- `beats` come from `presenter.mjs beats` (the speech cut at sentence ends and pauses). Use its ids and times; merge or split only to fix a check finding, and keep the beats contiguous.
- `style.lock` is the sentence every plate obeys, 12 to 80 words (medium, light, palette, grain, depth). `style.avoid` is what never appears.

## The check, in plain words

`presenter.mjs check --plan presenter/plan-<Label>.json --beats presenter/beats.json --key presenter/key.json --imagegen ready|off` exits 0 to pass, 2 on findings. It looks for:

- **The speech is covered.** The first beat starts within 0.2 s of the start; no gap over 0.15 s between beats; the last beat reaches within 0.3 s of the end of the clip.
- **Beat length.** Every beat is 1.5 to 12 seconds.
- **Plates.** At least one generated or designed plate. No more generated plates than the film's length in seconds divided by 3.5 (rounded up). Each plate is held 2.5 s or more in total. A `reuse` points at a real plate.
- **Layout rhythm.** No layout more than three beats in a row. At 30 seconds or more, three or more different layouts. `plate-only` takes no more than 35% of the runtime and no single cutaway runs over 6 s.
- **Prompts.** At least 12 words; each unique; no request for text, letters, words, signage, logos or watermarks (a model draws those badly); none of the slop words (stunning, breathtaking, 8k, 4k, hyper-realistic, ultra-detailed, masterpiece, trending on artstation, octane render, unreal engine, award-winning, epic).
- **Camera.** A camera on every plate, and no one move on more than 60% of them.
- **Style lock.** 12 to 80 words.
- **Graphics.** Inside their beat, titles of eight words or fewer, and never in the zone the person occupies for that beat's layout (a `presenter-left` beat with a `left` zone graphic is an error).
- **Without Codex** (`--imagegen off`): each generated plate is a warning that it will be designed instead.

Every finding comes with a concrete fix ("merge b4 into b3", "move the stat to zone right"). Fix exactly what it names; two rewrites at most.

## What it costs

Each generated image is one Codex run on the user's ChatGPT plan, about 1.5 minutes and a share of their Codex allowance. Three run at once. A 60-second film at the 3.5 s ceiling could ask for 17 images (about 9 minutes of generation at three at a time). Say the count in the activity feed before the batch starts ("Making 11 pictures for the film: about 6 minutes"), reuse plates where the idea comes back, and prefer fewer, better held images over a flood. Weak plates are regenerated one at a time with a sharpened prompt.

## Without Codex

If `setup.sh` printed `IMAGEGEN=off`, `no-codex` or `signed-out`, the plan is written with `kind: "designed"` plates (Claude-drawn backdrops: HTML/CSS/3D in the design system) and the console says so once, with how to turn images on (`npm install -g @openai/codex`, `codex login`, choose ChatGPT). The writing, the layouts, the camera moves and the graphics are the same; the plates are drawn rather than generated. Do not apologise repeatedly or half-generate.

## A worked example, four beats

The talk: a founder on why small teams should ship earlier. 30 seconds. Bold treatment: **The kiln remembers**, one pottery studio changing with the argument. Style lock: *35mm photograph, warm tungsten key from frame left, clay and ochre palette, soft film grain, shallow depth of field.*

| Beat | Say | Layout | Plate and why | Graphic |
|---|---|---|---|---|
| b1 0.0-4.2 | "Most teams ship their first version far too late." | `presenter-right` | **Generated**, push-in: an empty wheel at dawn, the clay still in its bag, calm left half. *The unstarted work.* | `kinetic-title` "far too late", zone left, on the word |
| b2 4.2-9.0 | "They polish, because polish feels like progress." | `plate-only` | **Generated**, drift: a hundred identical, perfect, unfired bowls on shelves, one cracked. *Polish as hoarding.* A cutaway, landing on "polish". | none |
| b3 9.0-16.5 | "But the clay only teaches you in the fire." | `presenter-full` | **Reuse** of p1, pull-out from a tight crop of the wheel: the same image come back, now answering the first beat. The person points at it on "fire" (the plate's light is from frame left, like the clip). | `stat` "1 week", zone right |
| b4 16.5-30.0 | "Ship the ugly one. Let it break. Then you'll know." | `presenter-left` | **Generated**, tilt-up: a kiln door open, orange light, a cracked bowl on the sill, calm right half. *What breaking buys.* | `list` of three words, zone right, staggered |

Rhythm of layouts: right, plate-only, full, left; four different, no run. Plates held 4.2, 4.8 (cutaway), 7.5 and 13.5 seconds; three generated images for 30 s (the ceiling is 9). The running idea (one studio at dawn, in the fire, after it) is the film; the person's pointing hand in b3 is the connection.

## Done when

`presenter.mjs check` exits 0 on the plan (warnings read), the plan has a `title` and an `idea` the user can read in a sentence, and `crew.mjs check --role visual-writer --key <label>` exits 0.
