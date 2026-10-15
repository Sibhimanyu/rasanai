# Finish: film-wide motion blur and one grade

`scripts/finish.mjs` is the last step of a delivery render. It does two things to the whole film, whatever made each scene (DOM, GSAP, CSS, Lottie, Three, Rasan3D):

1. **Blur**: real motion blur on every scene. HyperFrames renders at fps x samples (the oversampled render), then ffmpeg averages each frame's sub-frames across a shutter window centred on the frame time. Today only Rasan3D scenes blur (inside the stage); this makes a 2D card whip, a type slide and a 3D orbit all share one 180 degree shutter.
2. **Grade**: per-frame film grain, halation, vignette, optional bloom and LUT, the same on every scene so cuts do not change the film's texture. Optional lens and print extras on top (`--lens`, `--ca`, `--focus-follow`, `--crt`, `--led`, `--print riso`: see "Lens and print extras").

Use the full finish for the delivery render, after the gates pass. Drafts get the cheap draft blur (`--draft`, next section), so hero moves are judged with their smear, never as sharp sliding boxes.

## Commands

```bash
# blur only
node scripts/finish.mjs blur  --project <dir> --out film.mp4 [--fps 30] [--shutter 0.5] [--samples 8|auto] [--quality draft|delivery]
# grade only (any mp4)
node scripts/finish.mjs grade --in in.mp4 --out film.mp4 [--grain 0.03] [--halation 0.2] [--vignette 0.2] [--bloom 0] [--lut look.cube] [--probe x,y,w,h]
# both in one ffmpeg pass (one encode, no intermediate generation loss): the delivery command
node scripts/finish.mjs all   --project <dir> --out film.mp4 --samples 8 --grain 0.03 --halation 0.2 --vignette 0.2
# brand-colour drift report for the current grade settings
node scripts/finish.mjs patch-test --grain 0.03 --halation 0.2 --vignette 0.2
```

Extras: `--blur-space linear|gamma`, `--no-cut-aware`, `--shutter-over-smear`, `--no-slot`, `--composition <file>` (render a file other than index.html), `--workers n`, `--crf 18` (delivery x264 CRF; `--quality draft` uses CRF 20, veryfast), `--seed n` (grain seed), `--keep` (keep the temp oversampled render). Every command prints JSON: frame counts (expected vs got), seconds per stage, size in KB, the window used.

## Blur: how the window is aligned

Sub-frame k is a point sample at time k / (fps x N). Output frame n sits at t = n / fps = sub-frame n x N. The window is M sub-frame intervals wide, M = round(shutter x N) rounded to an even number (min 2), so it is centred exactly on a sub-frame: it averages sub-frames n x N - M/2 ... n x N + M/2, the two end taps at half weight (a true box filter of the sub-frame signal, symmetric about t). Shutter 0.5, N = 8 gives M = 4: five taps, weights 0.5 1 1 1 0.5. The first and last frames clone their edge sub-frame so every window is full. In ffmpeg: `tpad` (clone P = M/2 each side), `tmix` with those weights, `trim` M frames, `select` every Nth, re-timestamp at fps. Audio is copied untouched from the oversampled render; video is x264, BT.709 tagged.

Checked: sub-frame 8n of the oversampled render is pixel-identical to the normal render's frame n (so the grid is right), and the blurred card's centroid sits within 1 to 2 px of the sharp frame's centroid at the fastest frames (n = 38, 40: 1165.8 vs 1167.1, 1738.3 vs 1740.6). Frame count out equals frame count expected (90 of 90, 225 of 225); audio kept.

### Limits and trade-offs

- **HyperFrames renders at most 240 fps**, so one pass gives samples x fps <= 240 (8 at 30 fps). More samples come from phase-shifted passes (next section): `--samples 16|24|32` at 30 fps is 2, 3, 4 passes (at most 4: 32 at 30 fps). A count that is not a multiple of the per-pass count rounds up (12 becomes 16).
- **Steps, not a smooth streak, at whip speed with one pass.** The streak is made of N+1 discrete copies spaced speed / (fps x N) apart: 8 samples at 30 fps is 1/240 s, so 10 000 px/s leaves ~42 px gaps (visible 5-band staircase on a 300 px card, but centred and with no double image), 3 000 px/s leaves 12 px (reads as a streak), typical UI motion under 1 500 px/s is smooth. Shortening the shutter does not help (spacing does not change). Use `--samples 32` for a whip (below). Gap with 32 samples at 30 fps is 1/960 s, 10 px at 10 000 px/s.
- `shutter` is the fraction of a frame (0.5 = 180 degrees, the default; 0.35 for crisper, 0.75 for dreamier). The effective value (M/N) is reported.
- `--samples auto`: one extra draft render at the base fps, then the mean frame-to-frame luma difference (`signalstats` YDIF, cuts above 20 ignored) picks 4 / 6 / 8 by its 95th percentile (< 0.5, < 2, else 8). Measured: the whip test reads 8.7 (picks 8); hfdemo read 1.3 at its 95th percentile with the draft pre-pass and 7.7 at the maximum (a scene change); the p95 rule picks 6 for it (the run reported above used an older max-based rule and rendered 8). The render is a single fps for the whole film, so auto picks one count per film, not per shot, and a calm film renders fewer sub-frames (6 instead of 8 is a quarter less) at the price of the draft pre-pass (about one normal render). For a short film just pass `--samples 8`.

### More than 240 sub-frames per second: phase-shifted passes

HyperFrames has no time-offset or frame-range option (checked `render --help` and the sub-composition docs), and it snaps its own seek time to the render-fps grid. So pass k (k = 0 .. K-1) renders a temporary copy of the project (top-level entries symlinked, only `index.html` rewritten) with a small script at the top of `<head>` that wraps every GSAP timeline registered in `window.__timelines` (the host's, every sub-composition's, and Rasan3D's clock tween) so its `seek/time/totalTime` get `+ k / (R x K)` seconds, applied after HyperFrames' snap. R = fps x per-pass samples. The passes are then interleaved with ffmpeg `interleave` (pass k frame i is sub-frame i x K + k, time (i x K + k) / (R x K)) into one stream at R x K and averaged exactly as before. Verified: a +0.1 s shift makes frame n show frame n+3.

What is NOT shifted: CSS keyframe / WAAPI / Lottie / Anime animations, video and audio elements. Those still sample on the 240 fps grid in every pass, so a pass with only those moving gives duplicated sub-frames (no harm, no extra smoothness). GSAP-driven motion, the common case, and Rasan3D scenes are shifted.

Measured on the whip test (card at about 10 000 px/s, 1080p): 32 samples = 4 passes, window 16 sub-frames, 17 taps. The streak is a continuous ramp (R values 16 31 40 51 68 ... 254 ... 62 47 32, no plateaus), centroids 1165.8 / 1738.7 / 1883.1 at frames 38 / 40 / 42 against the sharp frames' 1167.1 / 1740.6 / 1884.0, 90 of 90 frames, audio kept. hfdemo (sub-compositions plus a 3D scene) at 16 samples renders 225 of 225 frames with no judder or doubling.

Cost: render time is K x the single-pass oversampled render, and tmix gets longer. Whip test: 4 passes 45 s + 20 s mix, against 9-11 s + 1.3 s for 8 samples. hfdemo at 16: 47 s render + 10 s mix (single pass 26.5 s + a few s). Multiplier against a normal render: about 3x per pass of 8 samples, so 16 is about 5 to 6x, 32 about 10 to 12x, before the grade. `--samples auto` now picks 4 / 6 / cap / 2 x cap / 4 x cap by the pre-pass p95 (< 0.5, < 2, < 4, < 8, else), but HyperFrames cannot render a frame range, so it is one count for the whole film: a film with one whip pays for 32 samples everywhere. For a mostly calm film with a few whips, prefer `--samples 8` for the film and render the whip scene alone at 32 if it matters.

## Linear light, cuts, one grammar, render slots

**The shutter averages in linear light.** The window is averaged on 16-bit linear planes (a 2.2 power in, the inverse out, explicit BT.709 limited matrices both ways), not on gamma-encoded values: a bright object crossing a dark ground keeps its highlight in the streak instead of fading into mud, and a white card whipping across black reads as a white streak. Costs a little more ffmpeg time (16-bit planes). `--blur-space gamma` restores the old gamma average. The report says `window.space`.

**Cuts keep the frame-time side.** After the oversampled render, `finish.mjs` finds hard cuts (a jump between two consecutive sub-frames far above the 240 fps motion floor) and the one output frame per cut whose shutter window would hold both shots. That frame is laid from its own centre sub-frame (the same overlay the sharp windows use), so nothing of the other shot leaks into a cut frame. Reported as `window.cut_frames_sharp` and a note. `--no-cut-aware` skips it. Dissolves and wipes are not cuts: the shutter averages across them as it should.

**One blur grammar per film.** A film's blur is ONE of: `shutter` (this finish), `smear` (stretched duplicates, directional blur, `blurTrail`, RasanShape smear), `stepped` (on twos, `steps()`), `crisp` (crisp steps, no blur). The Motion Director names it in the score (`score.json` `blur_grammar`, or `blur_grammar:` in motion.md). `finish.mjs blur|all` refuses to put the shutter over a declared smear / stepped / crisp grammar (a smear blurred twice, steps turned into dissolves): run `grade` on the plain render, or change the declaration to `shutter` if the shutter really is the film's blur, or pass `--shutter-over-smear`. `--draft` is never refused (it prints the warning). Per-scene exceptions stay `data-finish-blur="off"`.

**Render slots.** Every `hyperframes render` the skill starts goes through `lib/slot.mjs`: at most `RASANAI_RENDER_SLOTS` run at once on the machine (default 2 on 8+ cores and 16+ GB, else 1; `0` turns the limiter off), across processes (PID-lock files in the temp folder; a slot whose holder is gone is taken over at once, an async holder's slot not beaten for 10 minutes too, any slot older than 6 hours), and a new render waits until `RASANAI_RENDER_MIN_FREE_MB` (default 1500) is free (macOS: free + inactive + speculative pages). It never deadlocks a film: after 5 minutes of waiting for memory it renders anyway and says so. `finish.mjs` holds one slot for its pre-pass and all its passes. For any other command: `node scripts/lib/slot.mjs run --label reel -- npx --yes hyperframes render ...`; `node scripts/lib/slot.mjs status` shows holders and free memory. `--no-slot` skips it for one finish.

## White flash cap

A full-white frame reads as a blank frame (a dropout), not a flash. Cap a flash at about 60% white: peak opacity ~0.6 over the picture (or a tint of the ground colour), held 1 to 2 frames, so the picture is still faintly there. `vocabulary.md` "opacity 1 for 1-2 frames" is superseded by this cap. Measured: a frame with more than ~60% of its pixels at 235+ luma in a run of 1-3 frames is a flash over the cap; the frame gate's warning for it is specified in the wave notes (frame-gate.mjs); until then the Motion Director and scene animators apply it by hand.

## Draft blur (`--draft`): motion blur on drafts and review strips

```bash
node scripts/finish.mjs blur --project <dir> --out draft.mp4 --draft     # 4 samples, one 120 fps pass, draft quality, no grade
```

R1 (R13): key frames and drafts were always judged without blur, so fast moves looked like sliding boxes until delivery. `--draft` is the cheap version of the same shutter: 4 samples in a single 120 fps pass at 30 fps (shutter 0.5), draft quality (CRF 20, veryfast), no `--samples auto` pre-pass and no grade. `all --draft` is the same as `blur --draft`. `--samples` overrides the count. Cut review strips (`crew.mjs strip`) from this file.

Cost, measured on a 1.5 s 640x360 test: a plain draft render takes 6.9 s, `--draft` 14.9 s (about 2x; most of it is start-up). At 1080p, expect 2 to 3x a draft render.

With 4 samples a whip-speed move would step (3 copies). Projects that use the camera kit (`RasanCamera`, `references/cinematography.md`) fill the steps. Each layer carries a speed trail designed in for stills and plain drafts, and under any finish render the trails are scaled to the gap between sub-frames (`window.RASAN_CAMERA_TRAILS = 2/samples`: 50% at 4 samples, 25% at 8, about 6% at 32). The shutter makes the smear and the trail only bridges the samples. Checked on the test: a card at about 2,200 px/s (1080p scale) shows three separate copies with 4 plain samples, and one continuous streak with the scaled trail. Every pass (pass 0 included) goes through the same small script shim when the project uses the camera.

## Stepped scenes stay sharp (per-scene blur opt-out)

Motion blur averages sub-frames, which smears a look whose whole character is that it does not move between frames: animation on twos or threes, cel and stop-motion looks, stepped (`steps(n)`) eases, datamosh, pixel-art. Averaging a stepped scene turns each step into a cross-dissolve and the look is gone. Such a scene opts out and is rendered **without averaging**: each of its frames is the centre sub-frame of the oversampled render (sub-frame n x N, pixel-identical to the normal render's frame n), so its steps stay hard while the rest of the film is blurred and graded.

Three ways to say it, any of which works:

- on the scene's frame root: `<div data-composition-id="..." data-finish-blur="off" ...>` in `compositions/frames/<scene>.html` (the animator sets it when the score's technique is stepped or on twos);
- on the scene's clip in `index.html`: `data-finish-blur="off"`;
- a list flag: `--sharp "12.0-16.5,30-33"` (seconds) or `--sharp-scenes 3,5` (1-based clip order in index.html). `--no-auto-sharp` ignores the markup attributes.

The report lists the windows under `sharp`. The grade (grain, halation, vignette) still applies to every scene, so cuts do not change the film's texture. Implementation: the blurred stream and the centre sub-frames are split from the same oversampled input and the sharp windows are laid over the blurred film with `overlay=enable='between(t,a,b)'`.

## Grade: what each part is

Applied in this order (post.ts order, grain last so it sits on top), all in RGB at the source size:

| Part | Method | Notes |
|---|---|---|
| LUT | `lut3d`, tetrahedral | optional `--lut look.cube`; place the film's look here |
| Halation | luma threshold at 80%, two blurs (5 and 22 px at 1080p), tinted (1, 0.18, 0.04), added | only highlights glow; `--halation 0.2`; midtones get exactly 0 |
| Bloom | same, threshold 65%, white, 14 and 48 px | `--bloom 0` default (off); 0.2 to 0.4 for a dreamy look |
| Vignette | multiply by post.ts's mask `smoothstep(0.95, 0.25, len)`, mixed by `--vignette` | the centre 25% of the radius is untouched |
| Grain | two scales (per-pixel 0.6 and 2x2 cells 0.4), one monochrome value on R, G, B, new every frame, seeded; amplitude x (0.55 + 1.2 l (1 - l)), so stronger in the midtones | `--grain 0.03`; post.ts's default is 0.055 (pdoom is a dark, gritty film); amplitude is calibrated to the ffmpeg build's measured noise |

Colour handling: BT.709 limited in, gbrp full-range work, BT.709 limited out. Vignette multiplies in encoded (gamma) values, not linear light as post.ts does, so the falloff is a little steeper at the same setting. Grain is clamped (no wrap), zero-mean.

### Brand colours do not move

`patch-test` renders flat patches, grades them, and measures the mean over a 60x60 area for 12 frames. With the defaults (grain 0.03, halation 0.2, vignette 0.2):

| patch | before | after | delta |
|---|---|---|---|
| blue #3a6ea5 (centre) | 55, 109, 163 | 55, 109, 163 | 0, 0, 0 |
| red #c8392b (centre) | 198, 56, 41 | 198, 56, 41 | 0, 0, 0 |
| green #3f9a5a (centre) | 63, 153, 87 | 63, 153, 87 | 0, 0, 0 |
| blue near the corner | 55, 109, 163 | 51, 103, 155 | -4, -6, -8 (vignette, by design) |

Grain measured on flat grey (126): mean 125.99, std 1.50 levels at grain 0.03 (target 1.35 plus 8-bit rounding), frame to frame different. Anything inside the central ~25% radius keeps its colour; toward the corners the vignette darkens by up to `vignette x 0.59`. Keep key brand colours (logo, CTA) out of the extreme corners, or set `--vignette 0`. `grade --probe x,y,w,h` reports the same before/after delta for any rectangle of a real film.

## Lens and print extras (all off by default)

`grade` and `all` take lens effects and a film-wide print, in this order after the LUT: lens distortion, chromatic aberration, focus-follow, halation / bloom, the riso print, CRT / LED, vignette, grain. None of them is on unless asked for; the first four are hero effects, **budgeted like the rest** (`references/craft.md` "Finish and budgets"): a film that uses one on every frame is the uniform tell. The graphs were checked to parse and to produce frames of the right size and count on a 3-frame test; their strengths are uncalibrated, so look at a still before a delivery render.

| Flag | What it does | Budget |
|---|---|---|
| `--lens k` | Lens distortion, k1 in -0.3 to 0.3: positive is barrel (the edges pull in; a zoom of 1 + k hides the empty corners, measured), negative is pincushion (the edges stretch out, nothing to hide). A lens is a property of the whole film, so it may run film-wide | a note, no budget |
| `--ca px [--ca-at "t0-t1,..."]` | Chromatic aberration: the channels magnified by different amounts about the centre (R most, G half that, B none), so the split grows toward the corners like a real lens. `px` is the red-to-blue split at the corner at 1080p (1.5 to 4 looks like glass, over 8 is a glitch) | the score's `chromatic-split` budget entries pick the scenes (`score.budget` with `--run` / `--score`); `--ca-at` gives windows in seconds; with neither it runs film-wide and warns (the uniform tell) |
| `--focus-follow` (or `--focus x,y,w,h`) `[--focus-blur 7]` | A soft field outside the hero's box: the film is blurred once (sigma 7 px at 1080p) and merged through a mask that is 0 inside an ellipse around the box and rises smoothly to 1 beyond it. The boxes come from the score: `scenes[].hero_box = [x, y, w, h]` as 0..1 of the frame (with `--run` / `--score`), optionally `hero_box_end` (the focus follows it linearly across the scene); a scene without a box stays sharp. `--focus` is one constant box for the whole film | per scene by the score; a rack of every scene is still the hero's focus, not a blur on everything |
| `--crt 0..1 [--crt-at ...]` | Scanlines (a dark row every 4 px at 1080p) and a phosphor triad (every third column brighter per channel), then the gain that brings the mean back | film-wide only for a film set on a CRT; else windows |
| `--led px [--led-at ...]` | An LED-wall cell grid (square cells, a dark gutter, 6 px at 1080p), gain 1.75 | film-wide only for a film set on an LED wall; else windows |

A "window" is `t0-t1` in seconds, several separated by commas; the effect is the original frame overlaid with the processed copy for those windows only (`overlay ... enable='between(t,...)'`). The report lists what each flag did in `notes`.

### Riso print grade (`--print riso`)

The whole finished film is printed as a risograph: our own code from the idea of the MIT `animate` kit's riso finish (cth9191/animate, `styles/riso/kit.js`; the report carries a `credits` row; `third_party/animate/README.md`). Method (the numbers are the kit's measured ones, summarised in `library/styles/riso.md`):

1. **Plates.** The frame is separated into three plate tones, the nearest CMY to the three inks: teal `#3689ab` from 1 - R, fluorescent pink `#dc44a0` from 1 - G, yellow `#eede1e` from 1 - B (`--print-contrast` 1 stretches the tone about its middle).
2. **Screens.** Each plate is re-screened at its own angle (teal 15, pink 75, yellow 45 degrees), a round dot to 50% tone and above that a solid with paper holes at the cell corners (the same dot / hole geometry as the style file), at `--print-pitch` 10.8 px at 1080p (7 for fine type and lone props, 17.5 for a coarse field; one pitch per film here). The tone is averaged over a cell first (a blur of 0.45 x the pitch), so the dots follow the picture, not its noise.
3. **Register.** The pink plate sits (+4, -3) px and the yellow (-3, +4) px off the teal key (at 1080p), and every plate shimmers by `--print-shimmer` px (1; 0 off) over three variants that step every 2 frames, so the print shimmers without crawling (the kit measures 0.3 px of jitter; integer pixels are the finest this crop can do).
4. **Dropout.** About `--print-dropout` (0.006, 0.6%) of the pixels lose one plate per variant, as 2 px specks (a random map at half size held for 2 frames).
5. **Overprint.** Each plate prints as the ink-over-paper ratio multiplied together on the paper `#f2ece3`: pink + yellow = coral, teal + yellow = green, teal + pink = ink blue, all three an olive black, bare paper where the tone is nothing. There is no black ink and no white ink.

With `--print riso` the defaults of grain, halation and vignette become 0 (the paper stays flat; pass them explicitly to override). Limits, said plainly: a post grade cannot knock out the plates under a fill (a pink detail on a dark ground stays overprinted), cannot make a line crisp (thin type under the cell average turns into dots: set riso type large and heavy), and its screen is fixed to the frame, so it does not travel with a camera move (for a film where the camera moves through the print, build the plates in the scene instead). Cost: about 1.5 to 2 times the grain-only grade (a few ffmpeg blends per plate on gray planes; the screens are made once, one geq per angle); `--grain 0` and the flat defaults keep it near that.

### 3D scenes: ambient occlusion and focus

Those are inside the stage (`references/3d.md` stage option `ao`, camera `fstop`, `blades`): they are not part of the finish, but they accumulate across the same sub-frames, so a finished film that turns the stage's `motionBlur` off for the finish's shutter keeps both.

## Cost (measured, 1080p, 30 fps, a busy shared machine)

| project | normal render | oversampled render (x8) | blur mix + encode | grade (grain+halation+vignette) | `all` total |
|---|---|---|---|---|---|
| 3 s test (2 DOM/GSAP tweens, audio) | 11 s (mostly start-up) | 9-11 s (static frames are de-duplicated) | 1.3 s | ~8 s (90 frames) | 22 s |
| hfdemo, 7.5 s, DOM + 3D scene | 10.7 s | 26.5 s (2.5x) | 27.8 s with grade | included | 64 s with `auto` (54 s with `--samples 8`) |

Rules of thumb: the oversampled render costs 2 to 3x a normal render (HyperFrames reuses unchanged frames, so calm films cost less than 8x), the grade is the heavy ffmpeg part (grain: about 10 frames per second at 1080p, i.e. a 3 minute film at 30 fps spends about 9 minutes in the grade; `--grain 0` takes it to seconds), size grows with grain (a 3 s clip: 0.2 MB without grain, 5 MB with grain 0.03 at CRF 18; grain 0.05 at CRF 18 is 12 MB). Total, plan for about 5 to 6x a normal render for a short film. Use `--quality draft` only to preview the finish.

## Rasan3D scenes and the finish

Rasan3D blurs inside its own stage: it renders up to 24 sub-frames per frame (adaptive to the on-screen travel of the scene) across `motionBlur.shutter` of `1/fps`, where fps is the stage option (30), not the render rate. At the 240 fps oversampled render the stage still blurs each sub-frame over a full 180 degree shutter. The finish then averages 5 of those sub-frames over another shutter, so the two convolve: effective blur is about twice as wide (shutter 0.5 + 0.5 is a 360 degree look) and the 3D render does 8x the sampling work for it.

Recommendation:

- Finishing with blur: set `motionBlur: false` in the 3D scenes (`Rasan3D.stage({ motionBlur: false })`). The film then has one shutter on every scene, 2D and 3D alike, and the 3D scenes render faster. Anti-aliasing and depth of field are separate (they stay on).
- Exception, a fast 3D move (on-screen travel above ~3 000 px/s, a whip orbit, a dolly through the text): the finish's 5 taps would step. Keep the stage's own blur but halve its shutter (`motionBlur: { shutter: 0.25 }`) and pass `--shutter 0.25`, or accept the double width as a stylistic choice. Both together are not broken, just wider and slower.
- Drafts (no finish): leave Rasan3D's default blur on.
- That the stage's blur is still active under oversampling follows from `samplesFor` and `fps` in `stage3d/rasan3d.js`; the combined look was not rendered separately.
