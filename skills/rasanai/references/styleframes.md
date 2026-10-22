# Styleframes and design boards

Studios make a film as script, then **styleframes**, then animatic, then animation. RasanAI used to skip the styleframes on every short film ("no key-frame stills"), so a 30 s launch went from a text score straight to code, and the builder produced the median layout: one centred widget, 72 to 143 characters on screen (references show 12 to 21), no giant moment, nothing soft, a 0-chroma ground. The decisions that make a film look like Kinso, Sovra or Google (which component is the hero, how big, what crops off frame, where the light comes from, what is in focus, the type ladder, the recurring device) are visual and cannot be made in prose. The experiment that proved it: one designer, references in view, the same script and brand as FILM-C; 6 of 8 frames beat the pipeline (`references/styleframes/x1-compare.jpg`, `x1-contact.jpg`).

So every scene route designs its pictures first.

## Where it sits

On every scene route (`product-launch-video`, `faceless-explainer`, `pr-to-video`, `general-video`; direct and long paths; not reels, presenter films or lyric videos, which keep their own shapes):

Story → Look decided or picked → concept gate → art (unless `--lean`) → **Styleframes** → music → score (from the boards) → build.

| Film | Who | Files |
|---|---|---|
| direct (45 s or less, single-feature launch) | ONE `styleframe-designer` (key `frames`): the shot list, 3 heroes, every board | `frames/shots.json`, `frames/<id>.html/.png`, `frames/FRAMES.md` |
| long | one `styleframe-designer` (key `heroes`): the shot list and the 3 heroes; then `frame-designer`s in parallel (keys `1-3`, `4-6`, …), each board bound to the heroes | same |
| Look call, three systems (no brand look) | three `styleframe-designer`s (keys `heroes-Sure`, `heroes-Bold`, `heroes-Wild`) draw the story's open, peak and end in each system | `design/<Label>/frames/{open,peak,end}.png`, `shots.json` |
| `--lean` | the Director, from `agents/styleframe-designer.md`, the same files and checks | same |

Then the `frame-juror` (key `frames-1`) judges every board next to reference stills of the same kind and writes `frames/verdict.json`. A `below` frame goes back to its designer with the fixes, once (twice at most, `frames-2`).

## The shot list

`frames/shots.json`: `film` (`aspect`, `duration`, `device`, `light`, `palette`, `heroes`: the open, peak and end ids, `density_shot`: one id or null) and `shots[]`, one per beat:

| Field | What |
|---|---|
| `id` | `01`, `02`, … (the board is `frames/<id>.png`) |
| `beat`, `t`, `line` | the script's beat name, the board's moment in film seconds, the on-screen line |
| `kind` | title, ui-demo, object, type, photo, wide, end (the juror matches references by it) |
| `size` | ECU (one word or button, over 60% H, cropped), CU (one component, 30 to 60% H), MS (a panel or 3 to 5 rows), WS (the whole app, under 50% H), TYPE (the line is the picture) |
| `hero`, `hero_pct` | the one component, object or word; its height in % of the frame |
| `angle` | `frontal`, `tabletop`, or `{rx, ry, rz}` in degrees (two axes, 35 degrees at most) |
| `focus` | `{sharp, soft}`: what is sharp and what is soft |
| `light` | `{key, color}`: the key's side and colour |
| `ground` | `{tint, falloff}` |
| `type` | `[{text, pct, readable?}]`: every readable string and its height in % H, UI labels included |
| `crop` | what leaves the frame |
| `device` | the recurring graphic device in this frame |
| `anchor`, `transforms` | the anchor object, and whether it becomes something else here |

`frames.mjs shots-check` (errors exit 2): every field; no two neighbours share size and hero; 3 sizes or more in a film of 20 s or more; one WS per 30 s at most; hero 25% H or more (a TYPE shot's line 12% H or more; the end card is exempt, its line 8% H or more); at most 2 readable lines and about 30 characters outside one density shot; one moment of 35% H or more; one anchor in half the shots at most unless it transforms; every key light named by side and colour; three heroes. Warnings: a tilt past 35 degrees or on three axes, fewer than 10% of shots with a 20% H line, a biggest-line p90/p10 under 5, no device.

## The frames

Standalone HTML per frame at the film's aspect (`data-width`/`data-height`), fonts from `frame.md`, rendered with `design.mjs stills --dir "$RUN/frames"`. Built from the real UI rebuilt as DOM ("video UI": one component, 3 to 6x, 1 to 2 lines, real labels), the art department's assets, the look's type and palette, and the camera and finish runtime: RasanCamera when `frames/assets/rasan-camera/` is installed (`frames.mjs init` installs it; `references/cinematography.md`), else the frame kit `frames.mjs init` writes (`frames/kit/`: lit ground, grain, vignette, optical depth of field with `data-dof`, `RK.contactShadow`). Beats in real 3D use Rasan3D (`references/3d.md`).

Judged as posters: one brightest and one darkest region (the squint test), 3 to 4 hues used unevenly, one focal mass, negative space with a shape, "would I ship this as the poster?". The designer revises after looking (x1's revision passes moved 3 frames up a level).

## The juror

`frames.mjs refs --run "$RUN" --sheet` gathers the run's reference stills (`frames/refs.json`): the brand's own film frames (`brand-film/*/`), the user's reference clip (`research/films/reference/`), other researched films, fetched moments (`references/moments/*/`), stills placed in `frames/refs/` by hand, and frames pulled from any video in those folders that has none; with no stills, the library showcases in words. `frames.mjs sheet --ours <png> --refs <pngs> --out frames/sheets/<id>.png` draws ours (outlined) next to the references. `frames.mjs gate` runs `frame-gate.mjs` on the boards when the skill has it (ground chroma, soft content, colourfulness, type metrics; `frames/gate.json`).

`frames/verdict.json`: `{round, summary, frames: [{id, beat, kind, verdict: "at-par"|"close"|"below", ref: {image, source, why}, fixes: [...]}], gate}`. A close or below frame needs fixes of 20 characters or more; every frame names its reference when the run has stills.

## The user sees them in the Look call

Still five calls.

- **A branded direct film** (the look is the brand's own): the Look call is the styleframes call. `frames.mjs payload --run "$RUN"` writes the payload and the Director pushes it as step `styleframes`: the hero frames big, every board next to its reference still, per-frame comments, `redo`, `approve`.
- **Three systems**: each system is shown on the Look card by its 3 hero styleframes for the story's open, peak and end (`design/<Label>/frames/*.png`, in the look payload's `styles[].frames`), not only the CSS specimen. After the pick the boards are designed and shown live (`styleframes` pushed `--status working`, then done), then the animatic.

Payload (`references/console.md`): `{frames: [{id, beat, title, image, ref: {image, source, why} | null, shot: {size, angle, hero, focus, light}, caption, verdict}], heroes: [ids], sheet, recommended: "approve"|"redo"}` plus `images`/`captions` for older pages. Actions: `approve` (null); `comment` (`{scene: <frame id>, t: null, x, y, scope: "scene"}` with the text); `redo` (`{ids: [...], note}`): the designer redoes those frames from the note, the juror judges them again, the step is re-pushed.

## The score is planned from the boards

The Motion Director reads `frames/shots.json`, the PNGs and `frames/verdict.json` first. Each beat names its `board` (`frames/<id>.png`) and copies the board's `size` and `hero`; the score's job is to animate between approved boards (what moves from board N to N+1, the entrances, the camera legs, the seams). Changing a board's size, hero, crop, ground or type sizes needs an entry in `score.deviations` (`[{beat, field, why}]`). `crew.mjs check` warns `board-missing` per beat without a board on a scene route and errors `board-contradiction` when a beat's size or hero contradicts `shots.json` without a deviation.

## The build is bound to the boards

The film builder and the scene animators get `frames/<id>.png` and `shots.json` as the visual target. After the draft, `frames.mjs match --run "$RUN" --video <draft.mp4>` renders the draft at each board's peak (the score's `peak_t`, else 65% through the beat, else the shot's `t`) next to the board, with SSIM on a 160x90 grey downscale as a number (`frames/match.json`, `frames/match.png`). The critics judge the match by eye: hero, crop, ground, focus and type sizes as the board.

## Actor sheets and timed reads (only when the film has them)

A film with a recurring character draws its **actor sheets** (model sheet, emotion sheets; `stage2d.mjs sheet` or `canon.mjs sheet`) before the hero frames, and the boards bind to the sheet like they bind to the heroes: [2d-character](2d-character.md), [3d](3d.md). A scene that carries `reads[]` is reviewed from a four-position sheet and a short strip around the key transition (`reads.mjs sheet`), next to its board: [reads](reads.md). Both are inputs to the same frame juror; they add no call and no step for films without a character or reads.
