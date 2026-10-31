# Third-party sources: the provenance register

Every outside repo, skill or paper that RasanAI took something from, or read and deliberately did not take from. One section per source. Written 2026-10-15 from the research notes (survey, second-pass re-audit, story research), the credit folders in this directory, the CHANGELOG (1.15.0 to 1.17.0) and a grep of the skill. Adding a source: `INTAKE.md`. What is still planned: `BACKLOG.md`.

Modes (the column "mode" and every "HOW MUCH" line use these words):

- **verbatim**: a file copied unchanged (licence permitting).
- **adapted code**: code ported or modified, marked in its header comment, with credit.
- **data**: a data file (rows, vectors) copied or condensed.
- **rewritten**: the facts and numbers re-stated in our own words (translation, condensing), no sentences kept.
- **idea only**: the idea, then our own code and our own words. Nothing was copied.

"unverified" means the research notes say it but I could not confirm it in the repo or on the source on 2026-10-15.

## Summary

| Source | Licence | Mode | Main features | Status |
|---|---|---|---|---|
| [GTKottman/mortiflix-oss](#mortiflix-oss) | AGPL-3.0 | idea only | BPM from hits, narration retake loop, seam-blank guard, lessons-become-gates, outside text is data | taken (R1-R3); R5 items open |
| [cth9191/animate](#animate) | MIT | rewritten + idea only | riso, sketchbook, manim-math looks; robust reference cuts; riso print grade | taken; loop check open |
| [gatewai-dev/framefields](#framefields) | Apache-2.0 | idea only (so far) | asset preflight, marked-crop notes, OKLab tweens, RTL | taken as ideas; no code or text copied (unverified) |
| [Tejashmakwana/motionmaxxing](#motionmaxxing) | Apache-2.0 | verbatim + adapted code + rewritten | 716 precedent rows, chrome lint, measured eases, RasanUI, closes, kinetic type, transitions, process rules | taken; R5 items open |
| [academa-labs/manimgx](#manimgx) | MIT | none | math/diagram scenes | planned only (P3.4) |
| [Vincentwei1021/mg-styles-15](#mg-styles-15) | MIT | rewritten | 15 style references, signature features | taken |
| [calesthio/OpenMontage](#openmontage) | AGPL-3.0 | idea only | budgets, preflight, see-and-say, terminal component, caption duplicates | taken as ideas; pipelines open (P3.3) |
| [mrsarac/ff-tracking](#ff-tracking-and-ff-unmute) + ff-unmute | MIT | idea only | lens pass, spike-first, real numbers, audio guard, pan SFX | taken as ideas |
| [blixvip/NullMotion](#nullmotion) | none | idea only | beat-kind roughs DSL | taken as an idea; reference-vs-draft UI open (P3.5) |
| [Jakubantalik/thinking-orbs](#thinking-orbs) | MIT | adapted code + data | RasanOrbs runtime, 15 golden cases | taken |
| [feitangyuan/onetake](#onetake) | PolyForm Noncommercial 1.0.0 | idea only | cut-aware shutter, sfx-buried, carry, scale-dive, regression diff | taken as ideas; translated versions open (P3.1) |
| [pyang5166/gbro-collage-broll](#gbro) + gbro-collage-info | MIT | rewritten | halftone paper collage look | taken |
| [JohnHeibel/ClaudeAnimationBase](#claudeanimationbase) | MIT | idea only | twinning, three zooms, reads, echo | taken as ideas; the cartoon route is built as original code (P3.2, B2 partly done) |
| [lemomo-ai/lemo-opuscar](#lemo-opuscar) | MIT | rewritten + data | 11 styles, 98 prompts, catalogue grammar, devices, slot limiter, CJK reading | taken |
| [tuzhechen2005/opus-video-skills](#video-upgrade-pins) | MIT (root LICENSE; `painted-animation/template/` is John Heibel, MIT) | idea only so far | painted-animation skill (W5 reference) | pinned 59744a6; code adapted only with its LICENSE + NOTICE, see pins |
| [JohnHeibel/PDoomVideo](#video-upgrade-pins) | none verified | idea only | storyboard and chapter-level production | no source copied |
| [diggerhq/shipvideo](#video-upgrade-pins) | none verified | idea only | quick-preview (W10): one HTML scene, a seeked clock, scene-error checks, ffmpeg | taken as ideas (`quick-film.mjs`, original virtual-time adapter); no source copied |
| [riba2534/claude-opus-5-5-demo](#video-upgrade-pins) | none verified | not used | low-value coding demo | not integrated |
| [ferndesk/no-slop-motion](#no-slop-motion) | MIT | idea only | story chain, acts, crescendo, villain and felt numbers | taken as ideas |
| [Jamailar/high-retention-video-script](#high-retention-video-script) | none declared | idea only | stimulus clock, HKRR (read, not built in) | read; nothing built (unverified) |
| [FilmAgent, MovieAgent, ViMax and other agent papers](#filmagent-movieagent-vimax) | MIT / none / MIT | idea only | critique loops, structure critic | taken as ideas |
| [yihui-dev/awesome-opus5-5-videos](#awesome-opus5-5-videos) | MIT (the list); each prompt belongs to its creator | idea only | spring superposition, two-edge indicators, log-space zoom, iris by area, one-frame pop scan, loop seam, reading hold, frame-time counters, one-prompt export | taken (AO.1–AO.7, AO.9); 20 technique rows with links (W11, B11 partly done) |
| [nextwork-projects/ai-video-editor-cooked](#cooked) | MIT | adapted code + idea only | cut kinds and zoom punches, format grouping and outliers, reference profile and output match, captions and faces on references (Apple Vision), retake and false-start candidates, word-aligned kept ranges and splice check, head boxes, face-under-graphic warning | taken (waves 1 to 4); patch render, clip factory and scoped taste open (B3, B16, B17, B18) |
| [Creative research handoff (13 repos)](#creative-research-handoff) | MIT (11), none detected (2) | idea only | hook kinds, decision locks, scene states and cast, motion hierarchy and energy checks, phone readability, platform safe zones, first frame, reference principles | taken (WP1-WP7); B12-B15 open |
| [Craft sources](#craft-sources) (Murch, Hitchcock, Kuleshov, Pixar, Eisenstein, ...) | not code | idea only, cited | direction procedure, Rule of Six, importance = size | taken |
| [openfilm/openfilm](#openfilm) | MIT (name and logo: TRADEMARK.md) | idea only | one-HTML film, `frame(t)` shots, element editor | read 2026-10-24; adapter off by default |
| [Remocn/remocn-studio](#remocn-studio) | MIT | idea only | prompt-to-project studio, live preview | read; nothing taken |
| [Remocn/remocn](#remocn) | MIT | idea only | component registry | read; nothing taken |
| [remotion-dev/skills and remotion](#remotion) | none found (skills repo); custom Remotion License (framework) | idea only | agent-skill packaging | read; skills-repo licence unverified |
| [motionvideohq/motionvideo.xyz](#motionvideo) | MIT (website only); skill pack proprietary | idea only | public site and README only | read; paid pack not accessed |
| [charlie947/motion-graphics-skills](#motion-graphics-skills) | MIT | idea only | motion prompts and skills | read; nothing taken |
| [Leonxlnx/cinetic](#cinetic) | MIT | idea only | eval-driven motion skill | read; nothing taken |
| [howseen-ai/claude-motion-design](#claude-motion-design) | MIT (media separate) | idea only | HTML + Playwright + ffmpeg motion skill | read; nothing taken |
| [vercel/satori](#satori) | MPL-2.0 | idea only | HTML/CSS to SVG layout | not used |
| [motion-canvas/motion-canvas](#motion-canvas) | MIT | idea only | generator-timeline authoring | read; nothing taken |
| [Rive](#rive) | MIT runtime; proprietary editor | idea only | state-machine vector animation | adapter off by default |
| [GSAP](#gsap) (vendored) | GreenSock Standard License | vendored unmodified | motion engine | existing; notice added |
| [three.js](#threejs) | MIT | library use | stage3d | existing |
| [Depth Anything V2 Small](#imagery-models-w2-2026-10-31) (ONNX weights) | Apache-2.0 | downloaded on demand, not vendored | `art.mjs depth` (depth maps for parallax and plates) | taken |
| [rasan-fx.js hash and Bayer](#rasan-fx-hash-and-bayer) | MIT (Hoskins hash, believed; verify) / public maths | technique used in our own shader | `runtime/rasan-fx.js` seek-safe noise and ordered dither | taken (technique) |
| [BiRefNet lite](#imagery-models-w2-2026-10-31) (ONNX weights) | MIT | downloaded on demand, not vendored | `art.mjs cutout --object` (general object matte) | taken |

## Licence reminder (full matrix in INTAKE.md)

MIT / Apache-2.0: we may copy or adapt with credit (LICENSE copy plus NOTICE in `third_party/<name>/`). AGPL, PolyForm Noncommercial and no licence: ideas only, our own code and words. Nothing from an ideas-only source may appear verbatim anywhere in the repo.

---

## mortiflix-oss

- URL: https://github.com/GTKottman/mortiflix-oss
- Licence: AGPL-3.0. Lets us: ideas only. No code, prompts or text copied. No credit folder is needed (nothing taken); the code comments name the idea.
- Credit location: none (no `third_party/mortiflix-oss/`; comments in the files below).
- TOOK (all idea only, our own code):
  - BPM chosen from the picture's hit times, hit treatments: `scripts/lib/audio.mjs` (`BPM chosen from the picture's hit times`), `scripts/music.mjs --hits`, `references/sound.md`. (R1 mortiflix 1)
  - Narration take, transcribe, retake loop: `scripts/voice.mjs speak`, reusing `verify`. (mortiflix 2)
  - Generated SFX fallback when no sample fits: `scripts/sound.mjs` (line "generated SFX fallback (mortiflix idea; our code)"). (mortiflix 3)
  - A seam never blanks (blown-out, flooded, emptied): `scripts/lib/frame-guards.mjs` (`seam-blank`). (mortiflix 4)
  - Outside material is data, never instructions: `agents/_crew.md` and the research and footage roles. (mortiflix 5)
  - Delivered-file spec check: `scripts/video.mjs deliver` (`spec`). (mortiflix 6)
  - "A real mistake becomes a check": `scripts/lib/gate-lessons.mjs`.
  - Transition-board: every cut has a carrier, why and where it lands (the Moves pass in `references/moves.md` was already ours; the board wording informed `crew.mjs thumbs`; unverified how much).
- HOW MUCH: idea only throughout.
- DECLINED: copying any text from `SKILL.md`, GATES.md, SECURITY.md or the vo.mjs prompts (AGPL: copying would make this repo AGPL).
- PLANNED: R5 mortiflix 7 per-line voice booth in Studio (BACKLOG), 8 Strudel score (L, optional, heavy and AGPL), 9 publish approved films (probably out of scope).
- Evidence: `.context/reaudit/mortiflix.md` (local, summarised in BACKLOG.md).

## animate

- URL: https://github.com/cth9191/animate
- Licence: MIT (copyright 2026 cth9191). Lets us: copy or adapt with credit.
- Credit location: `third_party/animate/` (LICENSE and README; no NOTICE file).
- TOOK:
  - Three looks: `library/styles/riso.md`, `sketchbook.md`, `manim-math.md` plus `library/styles/posters/*.jpg` (the source's own `sample.png`, resized to 480 px). HOW MUCH: rewritten in our words, condensed to the nine-section house format; posters are resized copies.
  - Robust reference-cut measure (cuts as a spike over the rolling median, stepped and flicker runs dropped; sound arc): `scripts/lib/deconstruct.mjs`, used by `research.mjs deconstruct` and `brandfilm.mjs` cuts. HOW MUCH: idea only, our own code.
  - Film-wide riso print grade: `scripts/finish.mjs grade --print riso`. HOW MUCH: idea only; the report carries a credit row.
  - The ending echoes the opening (with ClaudeAnimationBase): `scripts/lib/echo.mjs`. Idea only.
  - Honesty labels (proven or unproven formats), the STORY.md grammar: idea only.
- DECLINED: the style kits' code (`kit.js`), hero characters, demos, audio, fonts.
- PLANNED: R5 animate 4 seamless-loop check for reels (BACKLOG).
- Unverified: whether the grep hits for "animate" in about 30 files all refer to this repo (the word is common); the listed files above are the confirmed ones.

## framefields

- URL: https://github.com/gatewai-dev/framefields
- Licence: Apache-2.0. Lets us: copy or adapt with credit and NOTICE.
- Credit location: none yet. If any code or text is ever copied, create `third_party/framefields/` first.
- TOOK (idea only; no framefields name appears in the repo, so the mapping is from the re-audit notes and is unverified in code):
  - Asset preflight (missing media, glyphs missing from the staged font, media upscaled past natural size): `scripts/lib/textfit.mjs`, `scripts/lib/cdp.mjs` (R2 group2 1).
  - Notes and findings as marked crops (`note-<id>.jpg`): `crew.mjs marks`, `strip --crop` (group2 3).
  - OKLab colour tweens: `RasanMotion.mix` in `runtime/rasan-motion.js` (group2 12).
  - RTL and CJK scripts, mirrored directional moves (group2 18): reading time for CJK in `scripts/lib/reading.mjs`; RTL itself unverified.
  - Lens/finish extras and the text-animator catalog read for gaps (P2.5): `scripts/finish.mjs` (`--lens`, `--ca`).
- HOW MUCH: idea only.
- DECLINED: its ~50 shaders, track mattes and audio-reactive signals as code (we would port with credit only if wanted).
- PLANNED: none.

## motionmaxxing

- URL: https://github.com/Tejashmakwana/motionmaxxing (Tejas Makwana)
- Licence: Apache-2.0. Lets us: copy or adapt with credit, a NOTICE, and a marker on modified files.
- Credit location: `third_party/motionmaxxing/` (LICENSE, NOTICE, README, `moments.jsonl`); code headers say "Adapted from motionmaxxing"; root README.
- TOOK:
  - Precedent library: `third_party/motionmaxxing/moments.jsonl` (716 rows, exact copy, verbatim data) read by `scripts/moments.mjs precedent` and `scripts/lib/precedent.mjs` (adapted code: a Node port of `scripts/precedent.py`). Rows are model-decoded and labelled "unverified: a hint, not a rule".
  - Page-chrome lint: `scripts/lib/chrome-lint.mjs`, rules in `scripts/slop.mjs`, flat-swatch grounds in `scripts/frame-gate.mjs` (adapted, rewritten from `scripts/lint.mjs` and `references/slop.md`).
  - 12 measured eases and frame budgets: `runtime/rasan-motion.js` (`RasanMotion.measured`), `references/craft.md`, warnings in `scripts/obey.mjs` (adapted).
  - Native UI rebuild kit: `runtime/rasan-ui.js`, `scripts/uikit.mjs`, `references/ui-rebuild.md` (adapted in part, rewritten for the HyperFrames clip contract). RasanUI 1.1.0 adds `U.drag`, `U.scroll`, `U.shimmer`, `U.terminal` (rewritten as time-driven channels).
  - Closes C1 to C10 plus chooser: `library/motion/closes/*.md`; kinetic type: `library/motion/kinetic-type/type-*.md`; six transitions with frame counts: `library/moves/transitions.json`; metaphor bank (explainers only): `references/metaphor-bank.md`. HOW MUCH: rewritten (numbers re-stated, condensed).
  - Motion runtime 1.1.0: `M.snap`, `M.dive`, `M.smear`, one blur grammar per film: `runtime/rasan-motion.js`, `scripts/finish.mjs` guard (rewritten for GSAP).
  - Process rules (every beat buys a belief, importance budget about 25%, describe before judging, quoted gate numbers, works-when table, house-style warning): `references/craft.md`, `agents/critic.md`, frame-juror brief. Idea, our words.
  - Taste ledger: `scripts/memory.mjs` (`taste.jsonl`, now evidence behind `lessons.jsonl`). Idea only, no code.
  - Other R items from its audio and imagegen notes: cut-to-onset share, text lands before the word, `voice.mjs refine` (`scripts/lib/audio.mjs`, `scripts/voice.mjs`); opaque-for-transparent imagegen fix (`scripts/imagegen.mjs`); woff2 to TTF (`scripts/stage3d.mjs font`); SVGL logo fetch (`logos.mjs fetch`, path unverified). Ideas, our code.
- DECLINED: GSAP, three.js, opentype.js, fonts, docs/media, studies images.
- PLANNED: R5 brand capture hygiene (motionmaxxing 11), human blind A/B page in Studio (13). See BACKLOG.md.

## manimgx

- URL: https://github.com/academa-labs/manimgx
- Licence: MIT. Lets us: copy or adapt with credit.
- Credit location: none (nothing taken).
- TOOK: nothing. The `manim-math` look came from `animate`, not from ManimGX.
- Ideas noted for later: numbered boxes on notes (informed marked crops, group2 3), the `inspect` storyboard and overlap report before render.
- PLANNED: P3.4 math and diagram scenes via ManimGX (Rust/wgpu renderer, Manim CE API) in the faceless-explainer route. See BACKLOG.md. Unverified: ManimGX's current licence file and runtime requirements.

## mg-styles-15

- URL: https://github.com/Vincentwei1021/mg-styles-15
- Licence: MIT (copyright 2026 Vincentwei1021). The README asks for a link back when building on the prompts: `third_party/mg-styles-15/NOTICE` and `library/styles/README.md` are that link. Third-party files in the repo (textures, HDRIs, photos, samples) keep their own licences and were not taken.
- Credit location: `third_party/mg-styles-15/` (LICENSE, NOTICE, README).
- TOOK: 15 style references `library/styles/<slug>.md` (flat-vector, line-art, isometric, 3d-render, cel-boil, collage, liquid, morph, bauhaus, synthwave, aurora-glass, hanazi, paperclip, pixel, hud) and 480 px posters `library/styles/posters/<slug>.jpg`. HOW MUCH: rewritten (translated from Chinese, condensed); posters are resized copies. The "signature features" idea (`## Signature features` in every DESIGN.md, checked by the frame juror and critic): idea only, in `references/design-desk.md`, `agents/design-system-designer.md`. The first-0.5-second hook rule: idea only (slop `slow-hook`).
- DECLINED: demo code, soundtrack scripts, textures, HDRIs, fonts, photos, videos, the site, `rubric.md` text. Acquire-slot PID lock informed `scripts/lib/slot.mjs` (idea).
- PLANNED: none.

## OpenMontage

- URL: https://github.com/calesthio/OpenMontage
- Licence: AGPL-3.0. Lets us: ideas only.
- Credit location: none (nothing copied).
- TOOK (idea only, our code):
  - Budget and cost shown before generation: `crew.mjs plan --budget lean|standard|full` (`crew/budget.json`). (P1.1)
  - See-and-say sync (each narration cue has an on-screen event within 1.0 s) and caption-duplicates check: `scripts/lib/` checks named in 1.17.0 (file unverified). (group2 5, 17)
  - Asset preflight (composition_validator idea): with framefields. (group2 1)
  - Code and terminal component (cmd, out, pause, pill): `U.terminal` in `runtime/rasan-ui.js`. (group2 10)
  - Script arc ("therefore / but", never "and then"), word budgets, enhancement-cue density: read in story research; reflected in `references/script.md` (unverified how directly).
  - Platform right dead zone 84 to 120 px: small item, status unverified.
- DECLINED: all text, prompts and the pipeline code.
- PLANNED: P3.3 new pipelines (clip factory, documentary montage, screen-demo) with the pipeline ideas only. BACKLOG.md.

## ff-tracking and ff-unmute

- URLs: https://github.com/mrsarac/ff-tracking and the sibling ff-unmute (same author; ff-unmute's licence is unverified, assumed MIT like ff-tracking).
- Licence: MIT (ff-tracking). Lets us: copy or adapt with credit.
- Credit location: none (nothing copied).
- TOOK (idea only): the single lens shader's controls (`finish.mjs --lens --ca --focus-follow --crt --led`); spike one hero scene before fanning out (`crew.mjs` phases, R3 group2 4); real numbers on screen come from the product (`claims` check); pan SFX to the on-screen x (group2 15); audio bit-identity guard across fix rounds (`sound.mjs lock`, `check --locked`); RECIPE.md in the delivery package (group2 16, status unverified); ending from the film's own data (unverified).
- DECLINED: shader code, prompts.
- PLANNED: none.

## NullMotion

- URL: https://github.com/blixvip/NullMotion ("Null Motion")
- Licence: none declared. Lets us: ideas only (no licence means all rights reserved).
- Credit location: none.
- TOOK (idea only): beat-kind JSON DSL of about 13 grey-box kinds for rough drafts instead of agent-written HTML: `scripts/moves.mjs rough`. (group2 20)
- DECLINED: all code and text (`drafts.mjs`).
- PLANNED: P3.5 reference-vs-draft review UI in Studio (the reference above, our drafts under it, one playhead). BACKLOG.md.

## thinking-orbs

- URL: https://github.com/Jakubantalik/thinking-orbs (v0.3.1; site orbs.jakubantalik.com)
- Licence: MIT (copyright 2026 Jakub Antalik; confirmed through the GitHub licence API and the repo's LICENSE).
- Credit location: `third_party/thinking-orbs/` (LICENSE, NOTICE, README, `golden-subset.json`).
- TOOK: `runtime/rasan-orbs.js` (adapted code: TypeScript ported to vanilla JS; nine mode geometries and 9 x 2 tuned presets, numbers unchanged); `third_party/thinking-orbs/golden-subset.json` (data: 15 of 72 golden cases, unchanged) used by `scripts/tests/orbs.mjs`; `references/orbs.md`; `video.mjs inject` installs it. Our additions: timeline clock, state-change dissolve, brand-colour ink, hero size.
- DECLINED: React component and hooks, the React Native and SwiftUI ports, the demo site.
- PLANNED: none.

## onetake

- URL: https://github.com/feitangyuan/onetake
- Licence: PolyForm Noncommercial 1.0.0. Lets us: ideas only. RasanAI may be used commercially, so no code or text may be taken.
- Credit location: none (nothing copied); several files say "idea is onetake's, the code is ours".
- TOOK (idea only):
  - Cut-aware, linear-light shutter averaging: `scripts/finish.mjs`. (onetake 1)
  - `sfx-buried` and `low-mud`: `scripts/sound.mjs check`, `scripts/lib/audio.mjs`. (onetake 2)
  - Sound from continuous picture curves (`curves.json`): `scripts/lib/audio.mjs`. (onetake 3)
  - Scale-dive route and `RasanCamera.dive`: `references/scale-dive.md`, `runtime/rasan-camera.js`. (onetake 4)
  - Cursor-driven pre-simulated sims: `runtime/rasan-sim.js` (RasanSim). (onetake 5)
  - Fix-round regression diff: `scripts/fixcheck.mjs`. (onetake 6)
  - Style rule extraction ("take the rule, not the frames"): `references/style-rule.md`; brand end-clip handoff: `references/end-clip-handoff.md` (says "adapted in idea from onetake's product-demo notes, PolyForm Noncommercial"). (onetake 7, 8)
  - Carry at every seam: `scripts/lib/carry.mjs`; the camera keeps its subject: `scripts/lib/textfit.mjs` (`subject-lost`); shot lengths vary 4x: `scripts/slop.mjs narrow-rhythm`; reference deconstruction in numbers: `scripts/lib/deconstruct.mjs`; two silences and J- or L-cuts (with lemo): `scripts/lib/audio.mjs`.
- DECLINED: all `scripts/*.py`, reference text, the code of `lib/motion.js`.
- PLANNED: P3.1 translated versions without rebuilding (a `?lang=` text plus time warp, checked pixel-identical outside the text). BACKLOG.md.

## gbro

- URLs: https://github.com/pyang5166/gbro-collage-broll and https://github.com/pyang5166/gbro-collage-info
- Licence: MIT (copyright 2026 the author, written "狗哥笔记" in the LICENSE).
- Credit location: `third_party/gbro/` (LICENSE, README).
- TOOK: `library/styles/halftone-collage.md` (rewritten from `SKILL.md`, `references/style-system.md`, `references/motion-grammar.md`); the meaning-keyed background colour rule in `references/design-desk.md`; "assemble from empty" in `references/vocabulary.md`. `scripts/art.mjs treat --halftone-collage` is our own code (idea only).
- DECLINED: scripts, model calls, `assets/collage.css`, the sound library.
- PLANNED: the halftone-collage poster still (BACKLOG, Studio and library polish); first and last frame generated plates (group2 21, optional).

## ClaudeAnimationBase

- URL: https://github.com/JohnHeibel/ClaudeAnimationBase
- Licence: MIT. Lets us: copy or adapt with credit. We copied nothing.
- Credit location: none (comments name it). If anything is copied later, add `third_party/claude-animation-base/`.
- TOOK (idea only): avoid twinning (`scripts/obey.mjs`, "avoid twinning" warning); review at three zooms: sheet, strip, crop (`references/crew.md`, `crew.mjs strip --crop`); "write the reads" timing (reading-time per beat, `references/intent.md` `read`); the end rhymes with the opening (`scripts/lib/echo.mjs`); "something happens in every scene" (critic checklist, unverified).
- W4 (idea only, our code): timed per-scene `reads[]` (notice, action, reaction, payoff) checked by `scripts/reads.mjs` and `scripts/lib/reads.mjs`, reviewed on four-position sheets (`references/reads.md`).
- DECLINED: the p5.js plus p5.brush toolchain and the boil system.
- PLANNED: P3.2 hand-drawn cartoon route (p5.js, acted emotions, boil reseeded 12 times a second, no pure black or white), with the mocap puppet idea from OpenMontage (group2 19). BACKLOG.md.

## lemo-opuscar

- URL: https://github.com/lemomo-ai/lemo-opuscar (LemoLab)
- Licence: MIT (copyright 2026 LemoLab). Checked in the repo on 2026-10-15: no separate CC BY grant for the guides; CC BY appears only on some third-party demo assets (for example hd-2d's music and art), none taken.
- Credit location: `third_party/lemo-opuscar/` (LICENSE, NOTICE, README).
- TOOK:
  - 11 style references `library/styles/<slug>.md` (glass-product, dark-keynote, dataviz, blueprint, halftone-dossier, art-deco, ascii-crt, swiss-motion, living-screencast, hologram-hud, iso-infographic) and 480 px posters. HOW MUCH: rewritten (sections 1 to 6 and 8), plus a signature-features list we added.
  - `library/styles/prompts/opuscar-prompts.md`: 98 recipes from `styleboard/opuscar98_styles.json`, condensed; film names, characters, years and credit lines stripped. HOW MUCH: data, condensed.
  - `library/grammars/catalogue-cards.json` from the pictogram-motion STYLE.md (rewritten); four devices in `taxonomy/devices.json` (rewritten ideas).
  - The shape of STYLE.md (essence and what it is not, materials, ...) as DESIGN.md "Motion and camera": the structure, not the text.
  - Idea only, our code: render slot limiter (`scripts/lib/slot.mjs`), CJK reading time (`scripts/lib/reading.mjs`), ASR per line on the final mix (`voice.mjs verify --mix`), leak scan (`video.mjs deliver`), `sfx-in-break` and `sfx-on-word-onset` (`sound.mjs`), white flash cap (`frame-guards.mjs flash-over-cap`), GTAO and bokeh in Rasan3D (`stage3d/`), film shape and last-three-films rule (`scripts/lib/film-shape.mjs`, `camera-moves.mjs`).
- Idea only, our code (W7): user-owned reusable styles with a visual test (`MY-STYLES.md`): `scripts/custom-style.mjs`, `scripts/lib/custom-style.mjs`, `scripts/lib/style-film.mjs`, `references/custom-styles.md`. No text, code, media or styles taken; the library lives in the user's own folder, never committed.
- Idea only, our code (W8): an original score and foley scheduled from an event list (lemo-opuscar's score/sampler idea; opus-video-skills kinetic-reel's picture-cue-driven synthesis): `scripts/original-score.mjs`, `scripts/lib/procedural-score.mjs`, `references/procedural-music.md`. Pure sine / triangle / noise synthesis in Node; no sample, instrument library, code or audio taken (the 97 CC0 instruments were not imported: no licence-verified library is shipped).
- Idea only, our code (W9): the Evidence Films category (satellite briefing, engineering board, LiDAR survey, white model, data physicalization, exploded teardown, microscope, archive light table) as the rule that every number and geometry comes from documented source material: `scripts/evidence.mjs`, `scripts/lib/evidence*.mjs`, `library/evidence/`, `references/evidence.md`. No imagery, prompts, text or code taken; all fixtures are synthetic.
- DECLINED: demo code, engines, audio, fonts, voices, DEMO.md files, the other 38 styles, the sound palettes and pitfall sections.
- PLANNED: R1 lemo 11 offline narration fallback (Kokoro or edge-tts; check the model licence), lemo 12 sampled score (the synthesised Node engine is done in W8; sampled instruments stay planned, L, low). BACKLOG.md.

## no-slop-motion

- URL: https://github.com/ferndesk/no-slop-motion
- Licence: MIT. Lets us: copy or adapt with credit. We copied nothing.
- Credit location: none (named in `references/craft.md` and the story docs). Add `third_party/no-slop-motion/` if text is ever copied.
- TOOK (idea only, our words): one cause-and-effect chain a stranger could retell; effect before cause; one villain with two or three felt numbers; the act template and "mark 2 or 3 crescendos"; "close the loop"; "research does not go on screen"; about 2.5 words per second; delete any scene whose removal doesn't break the chain. Landed in `references/intent.md` (villain, felt numbers, ending first), `references/script.md`, `references/craft.md`, `agents/structure-critic.md`. Mapping to files is from the rebuild spec; unverified line by line.
- DECLINED: the voice-first gate order and the pain-bank-of-verbatim-quotes (conflicts with product-first launch films).
- PLANNED: none.

## high-retention-video-script

- URL: https://github.com/Jamailar/high-retention-video-script
- Licence: none declared (GitHub reports NOASSERTION). Lets us: ideas only.
- Credit location: none.
- TOOK: nothing built in. Read for the 12-point stimulus clock, HKRR roles, question-payoff ledger and "no backstory" for tool films. Any resemblance in `intent.json` (relation words, rests) comes from other sources; unverified.
- PLANNED: none. Revisit if pacing gates need a formal model.

## FilmAgent, MovieAgent, ViMax

- URLs: https://github.com/HITsz-TMG/FilmAgent (MIT, arXiv 2501.12909); https://github.com/showlab/MovieAgent (no licence, arXiv 2503.07314); https://github.com/HKUDS/ViMax (MIT). Also read: VideoDirectorGPT (2309.15091), StoryAgent (2411.04925), Mora (2403.13248), nutllwhy/code-brand-film (MIT), studio-motion-director-skill (MIT), open-design (Apache-2.0), Gnurpreet/promo-video-script-skill (MIT). Licences copied from the research notes; unverified on the sources today.
- Credit location: none (ideas only).
- TOOK (idea only): critique, correct, verify rounds and a judge between two options (the structure critic that may cut, `agents/structure-critic.md`; the A/B juror; `crew.mjs ab`); "every shot has a narrative purpose" (importance and `buys` in `references/intent.md`); "reuse an existing camera position" (one grammar per film).
- DECLINED: generated-footage consistency machinery (first and last frame plus motion triples) as a feature: not relevant to motion graphics.
- PLANNED: P5 group2 21 first and last frame plates only if a generative-video route is built.

## awesome-opus5-5-videos

- URL: https://github.com/yihui-dev/awesome-opus5-5-videos  (commit read: 92aee2f, 2026-10-15)
- Licence: MIT, yihui-dev, for the list. The prompts inside are other people's posts (each entry links its creator), so the MIT grant does not reach their text. Lets us: ideas only for the prompts; the list's metadata (slug, category, tags, links) could be used with credit.
- Credit location: `library/benchmarks/video-techniques.json` (W11: 3 index rows keep their gallery link and the creator's post link; metadata only, no prompt text, stills or video), and code comments ("idea from awesome-opus5-5-videos; our code").
- What it is: 703 prompts behind viral videos where Claude Opus 5.5 wrote the animation as code (369 motion, 117 3D, 116 explainers, 101 interactive; 207 partial). The ~45 long prompts share one structure: inputs with defaults, direction with a banned list, a beat-numbered storyboard, numbered build rules, gotchas, and "show the beat map and stills before rendering".
- TOOK (idea only, our words and code): spring superposition, a value with many targets as a sum of closed-form step responses, and two-edge indicators (`RasanMotion.springTrack`, `RasanMotion.edges`); counters read the frame's own time under subframe blur (`RasanMotion.frameTime`, `window.__rasanFrameTime` in `finish.mjs`); zoom interpolated in log space and the zoom-into-an-off-centre-point warning (`RasanCamera` keys, `camera.mjs zoom-into-point`, `zoom-in-out`); iris and flood eased by area, flood switches to a full-frame rect (`rasan-shape.js`); the one-frame pop scan (`motion-gate pop`); the loop seam in picture, motion and sound (`motion-gate loop-seam`, `finish.mjs`, `sound.mjs`); a reading hold before decorative travel, blur never on read text, separate exit and enter timing in morphing containers (`references/craft.md`, text check); coded-film gotchas in `agents/film-builder.md` and `agents/scene-animator.md`; every brief input shows its default (`console/index.html`); a plan exported as one paste-able prompt (`handoff.mjs --prompt`). HOW MUCH: idea only, every line.
- Already ours before this read (not re-taken): seek(t) as a pure function of time, closed-form springs, subframe motion blur, last frame equals first, one morphing shape, shared-element handoffs, floods and irises, the beat grid, stills before render, SFX by measured peak, -14 LUFS, banned lists, grain and halation, word timestamps.
- DECLINED: the prompts' brand-specific content (named products, characters, songs); the house format as a replacement for the four-call flow (it is offered as an export only).
- PLANNED: B11 (precedent rows from the list's metadata).
- Unverified: the per-file mapping is from the build spec (`.context/ao-spec.md`); builders' exact names are in the CHANGELOG.

## cooked

- URL: https://github.com/nextwork-projects/ai-video-editor-cooked  (commit read: 3b236ec8fe32343cdf38375df90f6cd71e0846d7, 2026-10-19)
- Licence: MIT, Copyright (c) 2026 NextWork. Lets us: copy or adapt with credit. Per-file exceptions: `plugins/ai-editor/remotion/` carries HyperFrames-derived Apache-2.0 material (not taken); Remotion packages (Remotion licence), Robust Video Matting weights (GPL-3.0), CrisperWhisper weights (non-commercial), YuNet and RapidOCR models (downloaded at run time): none taken.
- Credit location: third_party/cooked/ (LICENSE, NOTICE, README)
- TOOK:
  - Cut kinds (hard, jump, dissolve, mask, whip, match, zoom punch), punch and push zooms, the zoom habit: `scripts/lib/cutkinds.mjs`, from `creator-teardown/scripts/visual.py`. HOW MUCH: adapted code.
  - Format grouping and outliers across references; tolerance rules for output vs reference: `scripts/lib/refprofile.mjs`, from `format_check.py` and `match.py`. HOW MUCH: adapted code.
  - Captions matched to the transcript, caption position, size, words and case, face presence and framing on references: `scripts/lib/reflook.mjs` (Apple Vision through `scripts/vision/vision.swift`, not OCR models), from `look.py`. HOW MUCH: adapted code (subset).
  - Retake, false start, talking-to-self, soft and hard filler and alternate-hook candidates: `scripts/lib/retakes.mjs`, from `cut/scripts/retakes.py` and `textnorm.py`. HOW MUCH: adapted code.
  - Word-aligned kept ranges, padding, splice budget, frame snapping, splice-in-speech check: `scripts/lib/cutplan.mjs`, from `cut/scripts/build_timeline.py` and `splice_check.py`. HOW MUCH: adapted code. The decision log (word ids, undo, redo, corrections) is ours.
  - Head boxes from face boxes: `scripts/lib/heads.mjs`, from `style-edit/scripts/face.py`. HOW MUCH: adapted code.
  - Face under a graphic on the rendered frame: `scripts/lib/framecheck.mjs`, from the idea in `style-edit/scripts/check.py` (`face_cover`). HOW MUCH: rewritten (Vision on source vs render, warning).
  - Transcript review interactions (cut, restore, pause, notes on a word): `apps/macos/Sources/RasanAIStudio/CutTranscriptView.swift`, from `lib/ai_editor/review.py`. HOW MUCH: idea only (native SwiftUI, no HTML or server).
  - Safe-zone numbers in `style-edit/scripts/plan.py` (`SAFE`) were read as a cross-check only; RasanAI's table is `scripts/lib/safezones.mjs`. HOW MUCH: idea only.
- DECLINED: the Remotion renderer and templates; the Python review server and HTML pages; Modal, GitHub Actions and Lambda rendering; matting (GPL-3.0 weights); YuNet, RapidOCR and Whisper model downloads; Gemini look analysis; ElevenLabs; posting; the taste skill's GitHub-issue upload; yt-dlp downloads of other creators' videos; the measured product-film lessons (they name third-party brands); caption colour, weight and word-effect measurement, clean plates and curve fitting (too heavy for now: B16).
- PLANNED: B3 (clip factory with clips.py scoring), B16 (Reference DNA P1: sound, caption look, graphics), B17 (selective stills and patch render), B18 (scoped preferences), B6 (capture hygiene, with product-video ideas).
- Unverified: YuNet's licence (MIT as far as known; not taken). Thresholds were measured upstream on other OCR and face engines; on Apple Vision every check is an uncalibrated warning.

## Creative research handoff

- From a Heresay brief (r_l76Nb-yr81kAj3YZ, 2026-10-20) that listed these; licences read from the GitHub API on 2026-10-20 (root licence only, per-file not checked: unverified). make-awesome-video's quality-bar.md and critic-loop.md and Paldom's frame-QA checklist were read; the others through the brief's summary.
- URLs: social-media-skills/skills (MIT), brensterbaz/ai-skills (MIT), alt-code-ai/agent (none detected), agentara/skills (MIT), Paldom/storytelling-animation (MIT), svenkatreddy/universal-video-skills (MIT), LottieFiles/motion-design-skill (MIT), iart-ai/motion-design-skills (MIT), NewTurn2017/make-awesome-video (MIT), iart-ai/kinetic-typography-skills (MIT), Liamrjohnston/remotion-motion-graphics-skill (MIT), iart-ai/explainer-video-skills (MIT), iart-ai/webgl-animation-skills (MIT), wonderunit/storyboarder (none detected), motion-canvas/motion-canvas (MIT). All at github.com.
- Credit location: none (ideas only). Code comments say "idea from <name>; our code".
- TOOK (idea only, our words and code): hook kinds per story slot (`story.mjs`, `agents/story-planner.md`); three channels and the payoff triad in the writer and editor; a character arc block (`lib/intent.mjs`); decision locks and a note's layer (`lib/locks.mjs`, `console.mjs`); a table that reads vague notes; scene states, cast canon and continuity in the score (`lib/scene-contract.mjs`); the dominant-motion share, busy beats, the energy arc and result holds (`lib/fluency.mjs`, `lib/film-energy.mjs`, `motion-gate.mjs`); first frame and declared-continuity seams (`motion-gate.mjs`); phone-size type and per-destination overlay zones (`frame-gate.mjs`, `lib/safezones.mjs`); reference principles and the critic's check (`brandfilm.mjs`, `agents/brand-film-analyst.md`, `agents/critic.md`); measured vs judged findings. HOW MUCH: idea only, every line.
- Already ours before this read (not re-taken): reading time, the loop seam, pops, carry, seam blanks, emphasis on the peak, boldness, budgets not bans, the one score contract, the append-only decision log, blind retell, marked crops, the phone sheet.
- DECLINED: Remotion and any new renderer; installing the skills; a second storyboard format; fixed panel counts; rendered before/after films in this wave (owner rule).
- PLANNED: B12, B13, B14, B15.
- Unverified: per-file licences; the safe-zone numbers in `lib/safezones.mjs` (from public platform guidance, uncalibrated).

## Rasan2D (original code; ideas credited)

- Idea only, no code or media copied: ClaudeAnimationBase (MIT, pin 0ac8bf2) and opus-video-skills `painted-animation` (MIT, pin 59744a6) for the shape of a painted-character route (named animation principles, line boil reseeded about 12 times a second, "something happens in every scene", show don't tell), as described in the video-upgrade brief; their files were not read or copied. PDoomVideo (no licence verified) for chapter-level production thinking: idea only.
- p5.brush was not used (licence not verified for adaptation); the painting backend is original Canvas 2D code in `stage2d/runtime/brush.js`. The demo actor (Pim) is an original design drawn by `stage2d/runtime/character.js`; no existing character, and no Clawd, ships.
- Unverified: nothing taken, so nothing to verify.

## Craft sources

Ideas only, cited, not code: Walter Murch's Rule of Six and the blink; Alfred Hitchcock's rule that screen size is story importance; Lev Kuleshov (meaning lives between shots); Sergei Eisenstein's montage types; the Pixar story spine and rules; the single-minded proposition; Problem-Agitate-Solve; the story circle; SUCCESs (Made to Stick); the rule of three; ManvsMachine and Buck concept methods; Saul Bass, Terry Gilliam (library entries `library/motion/kinetic-type/saul-bass-cutout-type.md`, `library/motion/collage/cutout-collage-gilliam.md`, `library/systems/studios/saul-bass.md`). Where used: `references/craft.md` (the direction procedure; footer "Ideas from Walter Murch, Hitchcock and Kuleshov via R-craft ... Our own words"), `references/story.md`, `references/intent.md`, `agents/motion-director.md`, `agents/footage-logger.md`. Full notes with URLs (including secondary sources) are in the local research file `R-craft.md`, not in git; secondary-source URLs are unverified here. Nothing to credit under a licence; cite the person or work, never quote at length.

## Video upgrade pins

Revalidated 2026-10-22 for the video-upgrade brief (heresay r_VejkvP8IXAd9jCgJ). Pins are upstream default-branch HEADs; licence is what GitHub reports plus the root LICENSE file.

| Repo | HEAD | Licence |
| --- | --- | --- |
| JohnHeibel/ClaudeAnimationBase | 0ac8bf2 | MIT |
| JohnHeibel/PDoomVideo | fa546a3 | none verified: ideas only |
| tuzhechen2005/opus-video-skills | 59744a6 | MIT (GitHub shows NOASSERTION; root LICENSE is MIT) |
| lemomo-ai/lemo-opuscar | b5e8ef9 | MIT (code, docs); demo films/stills CC BY 4.0 |
| diggerhq/shipvideo | 53d7c6f | none verified: ideas only |
| yihui-dev/awesome-opus5-5-videos | 92aee2f | MIT (the list only; each creator's prompts and art are theirs) |
| riba2534/claude-opus-5-5-demo | 54adc1f | none verified: not integrated |

## openfilm

- URL: https://github.com/openfilm/openfilm  (version or commit read: 619c163d2632e6e87e989049fec04dfc22188cd1, main)
- Licence: MIT, OpenFilm contributors. Lets us: copy or adapt with credit. Per-file exceptions: name and logo (TRADEMARK.md); bundled Inter (OFL-1.1), React (MIT), Lucide (ISC), playwright-core (Apache-2.0).
- Credit location: none (ideas only)
- TOOK: element-level editing and "a shot is a function of time" framing -> the Motion Studio element index (idea only, our own code).
- DECLINED: any code; the OpenFilm name and logo.
- PLANNED: renderer adapter `openfilm`, disabled by default.
- Unverified: source files were not read beyond README and notices.

## remocn-studio

- URL: https://github.com/Remocn/remocn-studio  (version or commit read: fe21cf3db88e0036afea80716abd12d4373a2dd7, main)
- Licence: MIT, Remocn. Lets us: copy or adapt with credit. Per-file exceptions: none seen; it depends on Remotion, which has its own licence.
- Credit location: none (ideas only)
- TOOK: idea of a live preview beside a prompt-built project -> Studio motion edit loop (idea only).
- DECLINED: all code; the Remotion dependency.
- PLANNED: none.
- Unverified: asset and reference-corpus licences.

## remocn

- URL: https://github.com/Remocn/remocn  (version or commit read: 7aebcbe6514ed9e54e3a4a6786f83f8425a4a9af, main)
- Licence: MIT, Remocn. Lets us: copy or adapt with credit. Per-file exceptions: components require Remotion (separate licence).
- Credit location: none (ideas only)
- TOOK: idea of a browsable registry of motion primitives -> `motion-kit/catalog.json` (our own items, all `origin: original` or `reused-rasan`).
- DECLINED: component code (Remotion/React, not seek-safe GSAP).
- PLANNED: none.
- Unverified: per-component licences inside `registry/`.

## remotion

- URL: https://github.com/remotion-dev/skills and https://github.com/remotion-dev/remotion  (version or commit read: 6c67adcd9cdbe6eb84d76342da89b225f9161cb2 skills, c81a206c5f6a6e285d2586f0d4d117db04316125 remotion, both main)
- Licence: skills repo, none found; framework, custom Remotion License (free for individuals, up to 3 employees, non-profits; Company License otherwise; no sublicensing derivatives). Lets us: ideas only. Per-file exceptions: unknown.
- Credit location: none (ideas only)
- TOOK: skill-folder packaging idea only.
- DECLINED: all text and code; bundling Remotion.
- PLANNED: renderer adapter `remotion`, off unless `RASANAI_ADAPTER_REMOTION=1` with the licence note shown.
- Unverified: the skills repo's licence; the remotion.dev/license web page (repo LICENSE.md read instead).

## motionvideo

- URL: https://github.com/motionvideohq/motionvideo.xyz  (version or commit read: 8a185eefbbb9760a6a9b7acd08c2bb322e385d0f, main)
- Licence: MIT for the website source only; the MotionVideo skill pack, brand name and logomark are not covered and are sold separately under https://motionvideo.xyz/terms. Lets us: ideas only. Per-file exceptions: the whole paid pack.
- Credit location: none (ideas only)
- TOOK: nothing beyond the public idea of a directory of motion work with prompts.
- DECLINED: the paid pack; the brand.
- PLANNED: none.
- Unverified: the terms page was not fetched.

## motion-graphics-skills

- URL: https://github.com/charlie947/motion-graphics-skills  (version or commit read: 229022ebca76972e119e36ada23a1648d51665ab, main)
- Licence: MIT, Charlie Hills. Lets us: copy or adapt with credit. Per-file exceptions: not inspected.
- Credit location: none (ideas only)
- TOOK: idea only.
- DECLINED: all text.
- PLANNED: none.
- Unverified: assets and downloads licences.

## cinetic

- URL: https://github.com/Leonxlnx/cinetic  (version or commit read: ecfa6605de1adb9345ce937724810dc32267d068, main)
- Licence: MIT, Leonxlnx. Lets us: copy or adapt with credit. Per-file exceptions: not inspected.
- Credit location: none (ideas only)
- TOOK: idea only.
- DECLINED: all text and code.
- PLANNED: none.
- Unverified: evals and docs media licences.

## claude-motion-design

- URL: https://github.com/howseen-ai/claude-motion-design  (version or commit read: 3d90d349ef3fdde9b7e89de4df4a2159c9e8697f, main)
- Licence: MIT, Howseen AI. Lets us: copy or adapt with credit. Per-file exceptions: downloaded media, logos and the Howseen mark.
- Credit location: none (ideas only)
- TOOK: idea only.
- DECLINED: media, logos, all code.
- PLANNED: none.
- Unverified: skill folder contents not read.

## satori

- URL: https://github.com/vercel/satori  (version or commit read: 074f0b38ed0f5d8fa768f709c0bb072b2d6c99e1, main)
- Licence: MPL-2.0. Lets us: ideas only (file-level copyleft). Per-file exceptions: none seen.
- Credit location: none
- TOOK: nothing.
- DECLINED: any code or dependency.
- PLANNED: none.
- Unverified: whether bundled fonts or wasm carry other licences.

## motion-canvas

- URL: https://github.com/motion-canvas/motion-canvas  (version or commit read: 7b91435c301d530351dcf5ebb91dd139c002e405, main)
- Licence: MIT, motion-canvas. Lets us: copy or adapt with credit. Per-file exceptions: not inspected.
- Credit location: none (ideas only)
- TOOK: idea only.
- DECLINED: all code.
- PLANNED: none.
- Unverified: package-level licences.

## rive

- URL: https://rive.app/pricing and https://github.com/rive-app/rive-wasm  (version or commit read: 15f390d9b164e1dd6d500e3448e4d3995b940cba, master)
- Licence: rive-wasm MIT, Rive; the editor and its exports are a proprietary service (free exports show a Rive splash screen, paid tiers remove it). Lets us: ideas only. Per-file exceptions: other runtimes not checked.
- Credit location: none
- TOOK: nothing.
- DECLINED: bundling any runtime or `.riv` asset.
- PLANNED: renderer adapter `rive`, off unless `RASANAI_ADAPTER_RIVE=1` with the licence note shown.
- Unverified: Rive editor terms, non-web runtimes.

## gsap

- URL: https://github.com/greensock/GSAP  (version or commit read: master 13e2b790546426a1a2e0e9b409f3f8dc6d6611f2; vendored copy is 3.14.2 from npm, commit not checkable)
- Licence: GreenSock GSAP Standard License (https://gsap.com/standard-license), not MIT. Lets us: use unmodified with headers kept. Per-file exceptions: none; every vendored file carries its header.
- Credit location: `third_party/motion-studio/NOTICES.md` (notice only; no licence text file ships upstream or here)
- TOOK: vendored unmodified at `skills/rasanai/scripts/vendor/` (not our code).
- DECLINED: building a competing no-code visual animation builder (this repo's recorded reading of the terms).
- PLANNED: none.
- Unverified: full licence text could not be fetched; re-confirm before the element inspector ships.

## threejs

- URL: https://github.com/mrdoob/three.js  (version or commit read: 5e6eee6ce8757abde7105aba35a358feac986e91, dev)
- Licence: MIT, three.js authors. Lets us: copy or adapt with credit. Per-file exceptions: examples, addons and models may differ.
- Credit location: none new
- TOOK: library use via existing stage3d only.
- DECLINED: vendoring new copies.
- PLANNED: none.
- Unverified: where it is vendored in this repo.

## sound-sources (W3, 2026-10-31)

- URL: ElevenLabs API docs (elevenlabs.io/docs), Stability AI API (platform.stability.ai), Freesound API v2 (freesound.org/docs/api), ACE-Step (github.com/ace-step/ACE-Step); `.context/creative-research/R3-sound.md` for the secondary-source licence notes.
- Licence: services, not vendored code. ElevenLabs: vendor terms by plan (film/ad use unverified). Stable Audio: Stability terms / Community Licence (verify). Freesound: per-file; only CC0 is pulled. ACE-Step: per model card of the installed version (verify). None of them is copied into the repo.
- Credit location: none (no code or media taken); licence and caveat are written to the run's LICENSES.json per file.
- TOOK: HTTP adapters in `scripts/lib/sound-sources.mjs`, each active only when its key (or, for ACE-Step, the person's own install via ACESTEP_CMD) is set. Our own code.
- DECLINED: installing ACE-Step or any PyTorch model for the person; MusicGen weights (CC-BY-NC); Suno/Udio automation; any librosa/numba path.
- PLANNED: none.
- Unverified: ElevenLabs self-serve film/ad rights; Stable Audio Community Licence thresholds; ACE-Step weights licence. Each prints a warning when used.

## sound-craft (W3, 2026-10-31)

- URL: none (craft rules from our own reference-film measurements, R3-sound.md; ffmpeg filters documented at ffmpeg.org/ffmpeg-filters.html).
- Licence: our own code; ffmpeg is called as an external tool (LGPL/GPL build, not linked or vendored).
- TOOK: ideas only: carve plus duck, SFX on hit points, role-based levels, synthesised risers/impacts/whooshes (`lib/mix.mjs`, `lib/sfx-synth.mjs`, `library/sfx/palettes.json`). All synthesised audio is generated at run time from ffmpeg sources, no samples.
- DECLINED: none.
- PLANNED: none.
- Unverified: none.

## imagery-models (W2, 2026-10-31)

- URL: https://huggingface.co/onnx-community/depth-anything-v2-small (ONNX export of depth-anything/Depth-Anything-V2-Small, `onnx/model.onnx`, 99,060,839 bytes, sha256 afb6a5c2...1df10c); https://huggingface.co/onnx-community/BiRefNet_lite-ONNX (ONNX export of ZhengPeng7/BiRefNet_lite, `onnx/model.onnx`, 224,005,088 bytes, sha256 56002437...03333). Both read 2026-10-31 (the model cards' licence fields).
- Licence: Depth Anything V2 **Small** is Apache-2.0 (the Base, Large and Giant checkpoints are CC BY-NC and are NOT used). BiRefNet and BiRefNet_lite are MIT. Both allow commercial use. RMBG-1.4 (BRIA, non-commercial) and RMBG-2.0 (CC BY-NC) were rejected for that reason.
- Credit location: here. The weights are not copied into the repo or the app bundle: `scripts/lib/image-ml.mjs` downloads each on first use into `~/.cache/rasanai/models` (`RASANAI_MODELS` moves it), checks the pinned sha256, and runs it with onnxruntime-node (MIT, Microsoft) from the hyperframes cache (`~/.cache/hyperframes/optional/`). `RASANAI_MODEL_DOWNLOAD=off` forbids the download.
- TOOK: the two models as runtime tools; pre/post-processing (ImageNet normalisation, 518 px short side for depth, 1024 x 1024 for the matte, percentile-normalised depth, sigmoid matte) written by us from the model cards.
- DECLINED: Depth Anything V2 Base/Large (non-commercial), RMBG-1.4/2.0 (non-commercial), any Python or PyTorch path (no Python vision on this Mac).
- PLANNED: none.
- Unverified: whether the ONNX export in `onnx-community` carries its own extra terms beyond the upstream licences (the model cards say apache-2.0 and mit).

## imagery-runtime (W2, 2026-10-31)

- URL: none (our own code: `runtime/rasan-image-fx.js`, `scripts/lib/{png-io,image-ml,layers,mockup,world-bible}.mjs`, `scripts/art.mjs` depth/plates/mockup/world commands).
- Licence: our own code. Techniques follow R2-generated-imagery.md (public craft knowledge: depth-map parallax with iterative UV offset, push-pull inpainting, halftone / dot / pixel dissolves, displacement-map morphs, homography corner-pin); no third-party source was read or copied. GSAP is only called by the caller (`tl.fromTo`), not bundled.
- TOOK: ideas only.
- DECLINED: vendoring Three.js or Transformers.js for this (plain WebGL1 is enough and keeps the runtime one file).
- PLANNED: none.
- Unverified: none.

## rasan-fx-hash-and-bayer

- What: the sine-free hash in `runtime/rasan-fx.js` (`h11`, `h12`: `fract(p*.1031)` ... ) follows David Hoskins' "Hash without Sine" (Shadertoy, 2014), and the ordered dither uses the standard Bayer matrix (the 2x2 recurrence for 2/4/8). The rest of the shader pack is our own code.
- URL: https://www.shadertoy.com/view/4djSRW (Hoskins, "Hash without Sine"); Bayer matrix: Bryce Bayer, 1973, a published mathematical construction.
- Licence: Hoskins' hashes are published under the MIT licence (believed, from the header of his code; NOT yet re-verified against the page: confirm before a public release and add his copyright line to the runtime header if it must be kept). The Bayer matrix is a mathematical construction with no licence.
- TOOK: the constants and the fract-multiply-add structure of the hash (a few lines, rewritten for our uniform names), the Bayer recurrence.
- DECLINED: copying any Shadertoy shader wholesale.
- PLANNED: none.
- Unverified: Hoskins' licence text (see above).
