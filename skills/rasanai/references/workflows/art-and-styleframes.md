# The film's pictures: art department, styleframes and boards

> Moved verbatim from the former single `SKILL.md`. References such as "§3d", "rule 18", "below" and "above" point into the sibling guides: the five-call contract and the hard rules are in [shared-contract](shared-contract.md); the phase guides are listed in `SKILL.md`.

## 3c · Art (the film's picture world, before the score)

Once the concept gate has passed and **before** the music, the score or any animation, the film gets an art department (all scene routes; `--lean` skips it). Type and the product's UI are not a picture world: the Eye intro's drawn eye, the Lilium specimen's cut-out lily and macro crops and the pixel manifesto's fifteen matching icons are what the references are made of, and without them the motion has nothing to move.

```bash
node $SKILL_DIR/scripts/art.mjs plan --run "$RUN"                                  # art/plan.json: the asset list from the chosen script's shows, the grammar and the look, plus one style block
node $SKILL_DIR/scripts/crew.mjs brief --run "$RUN" --role art-director --key art   # dispatch it (Opus): it edits the plan, runs art.mjs make | cutout | treat | trace | hand, looks at every asset, writes art/ART.md
node $SKILL_DIR/scripts/crew.mjs check --run "$RUN" --role art-director --key art   # runs art.mjs check: every asset exists or is a todo with a reason, every object or photo show maps to an asset, one style anchor, sizes at least those used
```

The art director makes illustrations (as paths, so the shape kit can morph and draw them), matching icon sets, cut-out photographs with one shared treatment (gradient map, duotone, halftone, dither, pixelate, X-ray), textures and ink, traced line art and single-stroke handwriting. Generated assets use `imagegen.mjs` (Codex) and need `IMAGEGEN=ready`; a changed prompt or reference regenerates its plate (a sidecar hash): edit the prompt in `images.json` and re-run `batch`, and only the changed plates (and everything after a changed anchor) are made again (`--keep-stale` stops it); otherwise it says so, draws vector and pixel assets itself, and leaves only true photographs as `todo`. Product UI and logos are never generated. The Motion Director, the film builder and the scene animators are given `art/assets.json` and `art/ART.md` and build with these files. The look's `## Imagery` (every route, not only presenter films) is the art director's first brief.

## 3d · Styleframes and boards (the film as pictures, before the score)

Every scene route (`product-launch-video`, `faceless-explainer`, `pr-to-video`, `general-video`; the direct path included; reels, presenter films and lyric videos keep their own shapes) designs its film as pictures before any motion is planned: Story → Look → concept gate → art → **styleframes** → music → score (from the boards) → build. A text score can't decide which component is the hero, how big it is, what crops off frame, where the light comes from or what is in focus; a still decides it in a second (`references/styleframes.md`; the bar: `references/styleframes/x1-compare.jpg`, where one picture-first designer beat the text-score pipeline on 6 of 8 frames with the same script and brand).

```bash
node $SKILL_DIR/scripts/frames.mjs init --run "$RUN"                                        # the frame kit, RasanCamera when installed, a shots.json skeleton
node $SKILL_DIR/scripts/crew.mjs brief --run "$RUN" --role styleframe-designer --key frames  # direct film (Opus): shot list, 3 heroes, a board per beat (long film: --key heroes, then frame-designer per range)
node $SKILL_DIR/scripts/crew.mjs check --run "$RUN" --role styleframe-designer --key frames  # frames.mjs shots-check, every board rendered, FRAMES.md with its revisions
node $SKILL_DIR/scripts/brandfilm.mjs compare --ref "$RUN/brand-film/grammar.json" --ours "$RUN/frames"   # branded films: the style-match gate on the boards
node $SKILL_DIR/scripts/crew.mjs brief --run "$RUN" --role frame-juror --key frames-1        # fresh eyes (Opus): each board next to a reference still of its kind
node $SKILL_DIR/scripts/crew.mjs check --run "$RUN" --role frame-juror --key frames-1        # frames/verdict.json: at-par | close | below, with fixes
node $SKILL_DIR/scripts/frames.mjs payload --run "$RUN"                                     # -> $RUN/styleframes.json, the console payload
```

1. **The shot list** (`frames/shots.json`): per beat a size (ECU, CU, MS, WS, TYPE), one hero, an angle, what is sharp and what is soft, the key light's side and colour, the ground's tint and falloff, type sizes in % of the frame, what crops, the recurring device. `frames.mjs shots-check` holds it to the rules: no two neighbours share size and hero, 3 sizes or more from 20 s, one wide shot per 30 s, hero 25% H or more, 2 readable lines and about 30 characters outside one density shot, one 35% H moment, one anchor object in half the shots at most unless it transforms.
2. **Three hero styleframes** (open, peak, end) at final fidelity, then **one board per beat**: `frames/<id>.html` rendered to `<id>.png` with `design.mjs stills`, built from the real UI rebuilt as DOM at 3 to 6x, the art department's assets, the look's type and palette, and RasanCamera (or the frame kit) for the lens, depth of field, contact shadows and the lit ground. Judged as posters; revised after looking.
3. **The frame juror** gathers the run's reference stills (`frames.mjs refs`: the brand's own film, the user's reference clip, fetched moments, else the showcase films in words), draws each board beside one of its kind (`frames.mjs sheet`), reads `frames.mjs gate` when the frame gate is installed, and writes `frames/verdict.json`. A `below` frame goes back to the designer with its fixes once (`frames-2` judges it again; twice at most).
4. **The user sees them** (still five calls). A branded direct film: push `styleframes` (the payload from `frames.mjs payload`) and wait: it is the Look call. `approve` → close it and go on; `comment` (`scene` = the frame id) → collect; `redo {ids, note}` → the designer redoes those frames, the juror judges them again, re-push, `resolve` the notes. Three systems: the look was picked from the heroes; push `styleframes` `--status working` as the boards land, then `--status done` with the decision (how many at par, what was redone).
5. **`--lean`**: you draw the styleframes yourself from `agents/styleframe-designer.md`, the same files and checks (and a side-by-side sheet against the references in place of the juror). Never skipped.

The music, the score and the build come after the boards: the Motion Director scores the motion **between** them (each beat's `board`, `size`, `hero`, `peak_t`; a departure needs a `deviations` entry), and the builders build toward them.

### New creative policy (plan has `creative_policy_revision: 1`)

- A lean or direct new-policy film still gets the post-Look styleframe designer (a compact set; the film builder never draws its own boards) and ONE independent frame-juror pass; a second pass only for an unresolved major finding and inside the budget. If the juror cannot run (no model slot, no vision-capable role), say so as a needs-you note through the existing review controls: do not call the boards ready.
- `frames.mjs init` writes `film.look_style`; `shots-check` and `gate` hold only a look that selects the depth craft to it (the other measurements are severity `review`: evidence for the juror, not failures). `frames.mjs refs` adds the selected references' lawful images (origin `creative-reference`); with none, the references are descriptions and the verdict says so.
- The juror also writes `creative/reviews/storyboard-r<N>.json` (the images it really opened, per-shot judgments with exact repairs, set-level progression / repetition / signature, a `result`); `crew.mjs check --role frame-juror` validates it. A valid file is not a good verdict.
- A branded direct film no longer treats the styleframes call as the Look call: the Look is confirmed first at the Look step; the boards are shown (`styleframes-show`) and the Storyboard review is the next human decision.

### Revision 2 (v3)

Boards are the storyboard's temporal reads: ordered audience reads with intervals on the score's timebase ([temporal-storyboard.md](../temporal-storyboard.md)), with the continuity owner and object identities for each required event ([continuity-ownership.md](../continuity-ownership.md)). Procedural fields, forms and camera space are planned from what the runtime can already do ([procedural-space.md](../procedural-space.md)); a flat card is never presented as a sculptural form. Assets are composited by the existing layers with rights kept in the existing ledger ([asset-compositing.md](../asset-compositing.md)).

## Deeper references for this guide

The canonical homes of the detail this guide points at (read the one the current step needs):

| Need | Read |
|---|---|
| styleframes and design boards: the shot list and its rules, the hero frames, the boards, the frame juror and the reference stills, the console's styleframes call, the score and the build bound to the boards | `references/styleframes.md`, `agents/styleframe-designer.md`, `agents/frame-juror.md`, `agents/frame-designer.md`, `scripts/frames.mjs` |
| the art department: the picture world of every film (illustrations as paths, icon sets, cut-outs, treatments, handwriting), the asset plan, `art.mjs` | `agents/art-director.md`, `scripts/art.mjs`, `references/imagery.md` |
| product cinematography: the camera kit (a 3D world from the lens, depth of field and rack focus, contact shadows, glass, rim light, key light, a tinted living ground, grain, speed blur in drafts) and the 38 recipes with numbers | `references/cinematography.md`, `runtime/rasan-camera.js`, `scripts/camera.mjs` |
| the frame gate: measure the picture (text load, giant moments, boldness, type scale, ground tint, soft content, colour, flat swatch grounds) on boards and drafts | `scripts/frame-gate.mjs`, `references/craft.md` (Frame metrics) |
| generated images in any route: when, prompt craft, the anchor, review, the slop list | `references/imagery.md`, `scripts/imagegen.mjs` |
| thinking orbs (RasanOrbs): nine "AI is working" states, 64/20/hero, brand colour | `references/orbs.md`, `runtime/rasan-orbs.js` |
| the selected medium's native actions and worked mechanisms (conditional, scene routes with a selected medium only; examples only for a stated communication problem, and never copy a whole example) | `references/medium-direction.md`, `references/medium-examples.md` |
| connected sequences: sequence records, motion handoffs between scenes, optical treatments, product choreography (records checked statically; playback review owed) | `references/sequence-contracts.md`, `references/motion-handoffs.md`, `references/optical-treatments.md`, `references/product-choreography.md`, `references/motif-roles.md` |
