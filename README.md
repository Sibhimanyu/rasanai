<h1><picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/logo/rasanai-lockup-reverse.svg" />
  <img src="docs/assets/logo/rasanai-lockup.svg" alt="RasanAI" height="56" />
</picture></h1>

**Pick the film. Claude makes it.** RasanAI is an AI video director for Claude Code, built on HyperFrames: launch films, explainers, PR videos, brand films, music videos, reels cut from a folder of your own footage, captioned talking heads, and short motion graphics.

*Rasa* (रस) is the feeling a work leaves in its audience; *rasanai* (ரசனை) is the Tamil word for the taste to choose it. When thirty people make an AI video, they get thirty videos with different content and the same film: the obvious story, a default look, everything fading up on one ease, a 30-second music loop under a 45-second film, a whoosh on every cut and glowing text. RasanAI is a Claude Code skill that replaces every one of those defaults with a decision, and checks the build against it.

![Story: three scripts as timed beats, with what's on screen, what's said and what we see](docs/img/console-story.jpg)

**[Download RasanAI Studio for Mac](https://github.com/Sibhimanyu/rasanai/releases/tag/studio-v0.2.0-beta.1)** (0.2.0 beta 1, Apple Silicon, macOS 14+). A free community beta; the agent skill below works without it.

**Website:** https://sibhimanyu.github.io/rasanai/

## Five calls, and you see your film at every one

You say `/rasanai make a 45s launch film for tally.app`. A **Director's Console** opens in your browser: a dark review room that shows what Claude is doing, live, and stops you only five times. The story and the look are separate calls: a script is judged as words and timing first, then the look is chosen to make that story strongest.

| | You see | You do |
|---|---|---|
| **1 · Brief** | one sentence you can edit: "A 45-second launch film for Tally, 16:9 for the website, with voiceover, in Tally's own colours and type", and what Claude captured | fix a word, press Start, or **Just make it** |
| **2 · Story** | three scripts (Sure · Bold · Wild) written by a dedicated script pass from your product's truth: a title, a logline and every beat with what's on screen, what's said and what we see | pick one, or tell Claude what to change in a line |
| **3 · Look** | three design systems a design desk built for that story, each drawn as a real frame on its own first line and moving on hover | pick one, ask for new blends near it, or turn the energy up or down |
| **4 · Animatic** | the whole film rough: a key frame for every scene at its real length, with the real music edit and the voice | play it, click any moment to leave a note, swap the music or voice, then **Looks right, build it**. You watch it build, scene by scene |
| **5 · Final** | the rendered film with scene markers, versions and what changed | click a moment to note it, apply notes, render, download |

**Claude decides the craft**, the way a senior motion designer would, from a quantified playbook: the story device, the scenes and their timing, the motion language, transitions, the music edit, every sound effect, lighting and grade. Every call is in the **Decisions** drawer with its reason, and you can change any of it by telling Claude (⌘K).

![The animatic: the film's key frames on a timeline with the music, notes pinned to moments](docs/img/console-animatic.jpg)

## What makes the films different

- **A story, not the story.** Before any concept, Claude writes a truth sheet from your product (what really changes, for whom, in the product's own words and numbers). A catalogue of 66 narrative devices from great launch films and ads (the museum label, the countdown, the one-take, the object's point of view…) gives three pitches that differ on at least five axes, and a rubric rejects the default arc (hook, problem, "Introducing X", three features, call to action) and any pitch that would work for any product.
- **A design desk, not a style menu.** For every film a design researcher studies the subject's own visual world (materials, places, eras, the clichés of its category), then three designers each build one new design system for the chosen story by blending two to four references from an internal library of 108 design systems and 49 motion and camera styles ([design desk](skills/rasanai/references/design-desk.md)). Each system is a complete DESIGN.md (colours by role, real fonts, grid, motion timings with GSAP eases, camera language) with a specimen drawn on the film's first line. A gate renders and measures the specimens: palette and accent share, contrast, fonts that exist, generic defaults, two of the three being alike, one reference copied. The chosen DESIGN.md becomes the film's look and its motion contract. With your own DESIGN.md, the first system is your brand extended for motion.
- **Music edited to picture.** Tracks long enough for the film, analysed with nothing but Node and FFmpeg (beats, bars, sections, a real ending), cut on bar lines so it never loops audibly, with the reveal and the logo on downbeats. Sound effects only for things you can see happen, on a budget. Mixed to −14 LUFS.
- **An anti-slop gate.** Before anything reaches you, `slop.mjs` checks the copy ("seamless", "unlock", "not X, it's Y", em dashes), the look (neon glow text, purple-blue gradients, particle filler, corner timecodes, Inter everywhere), the motion (idle loops, everything entering the same way), the timing (unreadable text, uniform shot lengths, no end hold) and the sound (looping beds, whoosh per cut, loudness, dead air).
- **A motion contract.** The chosen style's motion language becomes `motion.md`, and `obey.mjs` loads every built scene in headless Chrome and checks each tween against it.
- **Real 3D, mixed with 2D.** A scene can be flat, in depth, or both ([references/3d.md](skills/rasanai/references/3d.md)). The Motion Director plans where depth earns its place: the lens in millimetres, camera moves that land, one motivated key light, materials from the look (glass, chrome, clay, ceramic, concrete), and seams between flat and deep that match to the pixel (a 2D card lifts off the page on the cut; one camera flies through two scenes). Scenes are built with **Rasan3D**, a three.js runtime clocked by the scene's own GSAP timeline: true motion blur, depth of field and anti-aliasing from sub-frame accumulation, real screenshots on UI slabs with exact colours, the official logo and brand type extruded, one shared renderer for the whole film. `stage3d.mjs check` gates every 3D scene, failing only what breaks a render (nondeterminism, a blank frame, an unrenderable frame cost, a second renderer, remote assets); taste rules are warnings a stated intent silences.
- **An open 3D engine.** Under the presets, Rasan3D is an engine: a render graph of GLSL passes (`k.pass` at scene or post stage, with depth compositing, `k.target`, `k.view`), deterministic simulation on the CPU or GPU (`k.simulate`, `k.gpuSimulate`), real DOM pinned in 3D (`k.pinDom`), keyable focus, f-stop and aperture, lens shift, all of three.js r181's addons (274 modules, about 5.6 MB) and a GLSL library (`stage3d/glsl.js`: noise, signed-distance shapes, ray marching, engraving, stipple and hatching shading, colour, post; tube and instanced-field helpers). The design system is the only bound on the look.
- **A crew that adapts to the model.** Each member's prompt is adapted to the model that runs it (`crew.mjs plan|brief --model`, [models](skills/rasanai/references/models.md)): Opus gets the explicit show-off ask, Sonnet numbered steps and a worked example, small models only gathering roles. Under ChatGPT or Codex, members run as parallel `codex exec` processes from the same prompt files and the same checks; GPT's scene prompts carry a reel-quality worked example and a self-critique pass.
- **Lyric videos with every word on its note.** For a song with fixed lyrics ([lyric-video](skills/rasanai/references/lyric-video.md), [lyrics](skills/rasanai/references/lyrics.md)), `lyrics.mjs` times every word to the voice (whisper.cpp, no Python) and reads the music's tempo, downbeats, sections and kick onsets. Three treatment writers each pitch one concept: a style bible with one owned accent, a signal that runs through every plate, and a plate per lyric section in its own idiom, where every line becomes a pun or a transformation instead of a picture of the sentence. `treatment.mjs` refuses a treatment that misses a line, repeats an idiom a third time, adds a second hue, cuts off the beat grid or never goes deep. Scenes then sync every word to its sung start with `RasanMusic` (`rasan-music.js`).
- **A film finish.** `finish.mjs` ([finish](skills/rasanai/references/finish.md)) gives the delivery render real motion blur on every scene, DOM and GSAP included, by rendering sub-frames and averaging a shutter window (up to 32 samples through phase-shifted passes), then one grade across the film: grain, halation, vignette and an optional LUT, so cuts do not change the texture. Flat brand colours at the centre of the frame stay put. A scene made on twos or threes can opt out of the blur (`data-finish-blur="off"`) so its steps stay hard.
- **A crew, not one context.** Claude directs a crew of agents ([references/crew.md](skills/rasanai/references/crew.md)). Researchers read the product's site, help center, changelog and brand pages and collect its real screens. For a well-known brand, a precedent researcher downloads its past launch films for analysis and measures them shot by shot. With your permission, a scout reads the product's code on your computer: UI strings, design tokens, what shipped last week, earlier videos. A research lead turns all of it into one truth sheet and a claims ledger, so nothing on screen comes from memory. Three writers write the three scripts in parallel and an editor reads them like a hostile reader. A Motion Director scores the whole film, every shot and every seam with exact handoff numbers. One scene animator builds each scene at the same time as the others and looks at its own motion before handing it back. Critics with fresh eyes judge the frames, the motion, the facts and the film.
- **Claude does the animating.** The style specimens exist so you can choose by eye. Claude designs every key frame and scene from the direction, through the matching [HyperFrames](https://hyperframes.heygen.com) workflow (`product-launch-video`, `faceless-explainer`, `pr-to-video`, `general-video`, `music-to-video`, `talking-head-recut`, `embedded-captions`, `motion-graphics`).

**Footage reels** add **Footage** (every clip with a contact sheet and a word-level transcript) and **Cut** (the edit as an editable list: clips with in and out points, cards between them, overlays, captions). Claude drafts the cut and designs every card itself.

**Presenter films** put a person who talks to camera on a green or blue screen into worlds made for what they say. RasanAI keys them out, cuts the speech into beats, and three visual writers each stage it differently (the layout of the person, a generated picture and a camera move behind them for each beat, motion graphics that land on the right word). The pictures are made through the Codex CLI on your ChatGPT plan, with no API key: each is one Codex run of about a minute and a half, and the count is shown before they start. Without Codex the backdrops are drawn by Claude instead. This is new and has been checked with synthetic footage and fake-Codex tests; the end-to-end result on real footage is not yet recorded here, the key is only as good as the lighting of the clip, and the clip plays whole (no trimming yet). See [presenter films](skills/rasanai/references/presenter.md) and [generated images](skills/rasanai/references/imagery.md).

**Bring your DESIGN.md.** RasanAI reads the common shapes (design.md spec frontmatter with oklch colors, impeccable, gstack, Stitch-style prose, CSS custom properties, token tables), assigns every color a role, maps platform fonts to shipped equivalents and draws all three films in your brand. [An example](docs/examples/DESIGN.md).

![The final: the rendered film with scene markers, notes and versions](docs/img/console-final.jpg)

## Install

Requirements: [Claude Code](https://claude.com/claude-code), Node.js ≥ 20 (if you don't have it, RasanAI finds or fetches a private copy on first run), the HyperFrames skills (`npx hyperframes skills update`), and FFmpeg for footage reels. Chrome for previews and checks comes from `npx hyperframes browser ensure`. Voice samples and music use HyperFrames' media tools (the `heygen` CLI, signed in); without them the workflow's default voice is used and you can bring your own track or none.

**Claude Code plugin** (recommended)

```
/plugin marketplace add Sibhimanyu/rasanai
/plugin install rasanai@rasanai
```

**skills CLI**

```bash
npx skills add Sibhimanyu/rasanai --skill rasanai
```

**One-line installer** (links `~/.claude/skills/rasanai` to a checkout in `~/.rasanai/src`; run again to update, `--uninstall` to remove)

```bash
curl -fsSL https://raw.githubusercontent.com/Sibhimanyu/rasanai/master/install.sh | bash
```

**By hand**

```bash
git clone https://github.com/Sibhimanyu/rasanai.git
ln -s "$PWD/rasanai/skills/rasanai" ~/.claude/skills/rasanai
```

### Coming from Rasa Director

RasanAI was called Rasa Director up to 1.0. You don't need to do anything: the next time it loads, it installs RasanAI the way you installed Rasa Director, moves your history to `~/.rasanai` and hands over. Use `/rasanai` from then on (with the plugin, restart Claude Code once to see it).

### Updating

From 0.6.1, RasanAI updates itself: every time the skill loads it checks for a new release (2 seconds at most, silently offline), installs it the way you installed RasanAI, and carries on with the new version in the same run, telling you in one line what's new. Set `RASANAI_AUTO_UPDATE=0` to be told instead, or `RASANAI_NO_UPDATE_CHECK=1` to turn the check off. A git checkout only updates itself on `master`. By hand:

| Installed with | Update |
|---|---|
| Claude Code plugin | `/plugin marketplace update rasanai`, then `/plugin update rasanai@rasanai`; restart Claude Code |
| skills CLI | `npx skills add Sibhimanyu/rasanai --skill rasanai` again |
| one-line installer | run the installer again |
| by hand | `git pull` in the checkout |

Or run `node <skill dir>/scripts/update.mjs apply`, which works out which of these applies. Versions before 0.6.1 don't update themselves (0.4.2–0.6.0 only tell you); update them once by hand and they stay current from then on.

Check the install: `node ~/.claude/skills/rasanai/scripts/selftest.mjs` (186 checks, a few minutes, no network needed). With the plugin install the skill lives under `~/.claude/plugins/cache/rasanai/`; run the same script from there.

With the plugin install Claude Code namespaces the skill: invoke it as `/rasanai:rasanai` (or just describe the video you want; it triggers on video requests).

## Use

```
/rasanai make a 45s launch film for https://tally.app
/rasanai a 60s explainer on how DNS works, vertical, no voiceover. Just make it.
/rasanai turn PR #482 into a 30s changelog video
/rasanai a lyric video for song.mp3, you decide the rest
/rasanai cut ~/Footage/lisbon-trip into a 30s reel: best moments, a title card, captions
/rasanai add bold captions to interview.mp4 for Reels
/rasanai a 6s title sting for "Ship it in an afternoon", neo-brutalist, springy
/rasanai a product film for our app using our DESIGN.md, like these references: ref1.png ref2.png
/rasanai revise videos/tally-launch: calmer motion, swap the music
/rasanai export the Swiss grid style as a DESIGN.md
```

## Native Mac studio (community beta)

A SwiftUI studio is available as an [Apple Silicon community beta](https://github.com/Sibhimanyu/rasanai/releases/tag/studio-v0.2.0-beta.1): a simple drill-down app with Home, a one-page New film (⌘N), Brands kept as `DESIGN.md` folders, a Film page for the director workflow and finished video, two-tab Settings (⌘,), local Claude Code/OpenAI Codex setup, and update checks every 5 hours. Build 11 is a full redesign. Requires macOS 14+. The DMG is ad-hoc signed and **not Apple-notarized**; first installation is subject to Gatekeeper approval. Provider-free tests and relocated-app startup checks pass; real-agent generation and complete workflow parity remain unverified. See the [Mac guide](apps/macos/README.md), [community installation notes](apps/macos/COMMUNITY-INSTALL.md), and [readiness audit](apps/macos/READINESS.md).

## How it works

```
skills/rasanai/
  SKILL.md                    the flow the agent follows: Brief · Story · Look · Animatic · Final
  agents/                     the crew's role briefs: researchers (product, brand, screens, precedent, local scout),
                              research lead, design researcher, design-system designer, script writer, script editor,
                              Motion Director, frame designer, scene animator, treatment writer, critic;
                              _models/ holds the per-model addenda (Claude Opus, Sonnet, Haiku, GPT)
  library/                    the design desk's internal library: 108 design systems, 49 motion styles, an index,
                              README.md and EDITING.md (what is verified and what is not)
  console/index.html          the Director's Console; the Look draws each system's own specimen
  taxonomy/                   the vocabulary: 32 dimensions (dimensions/*.json), 66 story devices (devices.json),
                              403 style presets in 20 families (presets/*.json, raw material for the desk), type pairings; schemas
  scripts/
    crew.mjs                  the crew: plan who works on a film, write each member's prompt, check its work,
                              the score into STORYBOARD.md, motion strips to look at
    research.mjs              find the product on this computer, inventory an approved folder, measure a film
    story.mjs                 truth sheet, three distinct story devices, the pitch rubric
    library.mjs               the design desk's library: index, search, show
    design.mjs                key frames, and the desk's gate: check-system, check-systems, look-payload, choose-system
    presets.mjs               the 403 style presets (raw material): validate, list, suggest, gallery, pick, stills, site
    design-system.mjs         any style as a complete DESIGN.md (export, export-all)
    sound.mjs, music.mjs      track analysis (beats, bars, sections, endings), the edit to picture, SFX plan,
                              mix check; music candidates long enough for the film
    slop.mjs                  the anti-slop gate: copy, look, motion, timing, sound, the rendered video
    obey.mjs                  checks built compositions obey motion.md; waive
    stage3d.mjs               3D scenes: install the runtime, scaffold a scene, stills, the 3D gate
    lyrics.mjs                lyric videos: word timings (align), the music's beats, downbeats, sections and onsets (audio)
    treatment.mjs             a song's treatment: skeleton, the gate (check), the plates as scenes
    finish.mjs                the delivery finish: film-wide motion blur and one grade
    console.mjs               the console server + push / wait / ask / reply / activity / resolve / record
    taxonomy.mjs, direction.mjs, brand.mjs, motion-md.mjs, scenes.mjs, voice.mjs,
    reel.mjs, video.mjs, handoff.mjs, tasting.mjs, transition-menu.mjs, board.mjs, pick.mjs,
    memory.mjs, update.mjs, setup.sh, selftest.mjs
    lib/                      audio analysis, the DESIGN.md adapter, the system gate (system.mjs), model profiles
                              (models.mjs), PNG reading, looks, direction, fonts, engine, common
    vendor/gsap.min.js        GSAP 3.14.2
  stage3d/                    Rasan3D (rasan3d.js), glsl.js (the GLSL library), rasan-music.js (RasanMusic: words and
                              beats as functions of time), three.js r181 with all its addons (addons/), the scene templates
  references/                 crew (the agents), craft (the playbook), vocabulary (film terms → code), 3d (real space), script (the writer's brief), story, sound, direction,
                              brand, design-desk, models, video, reel, console, motion.md contract, board, handoff, personalities
```

- **The terms are data.** Every style, story device and decision is a taxonomy entry, and prompts to builders are compiled from it, with `references/vocabulary.md` turning each film term (a rack focus, a bleach-bypass grade, a J-cut) into an HTML/CSS/GSAP recipe with numbers.
- **The checker** (`obey.mjs`) loads each composition in headless Chrome with GSAP, walks every tween, samples its real start and end values, and flags off-scale durations, eases outside the set, implicit default eases, banned patterns (fade-up-slide in all its forms, bounce, overshoot, blur-in, scale-pop…), non-GSAP motion and short holds. "Could not run" is never reported as clean.
- **Local only.** The console binds to 127.0.0.1, refuses foreign Host headers, and requires a per-session token (then an HttpOnly cookie) for every route; it serves files only from your workspace and installed skills, never its own token file, and refuses to run with your home directory as the root. Voice samples, music and site capture go through HyperFrames' own tools; nothing else leaves your machine.

Details: [SKILL.md](skills/rasanai/SKILL.md) · [crew](skills/rasanai/references/crew.md) · [craft](skills/rasanai/references/craft.md) · [3D](skills/rasanai/references/3d.md) · [design desk](skills/rasanai/references/design-desk.md) · [models](skills/rasanai/references/models.md) · [library](skills/rasanai/library/README.md) · [lyric videos](skills/rasanai/references/lyric-video.md) · [lyrics & music runtime](skills/rasanai/references/lyrics.md) · [finish](skills/rasanai/references/finish.md) · [vocabulary](skills/rasanai/references/vocabulary.md) · [story](skills/rasanai/references/story.md) · [sound](skills/rasanai/references/sound.md) · [style presets](skills/rasanai/taxonomy/presets/SCHEMA.md) · [direction & taxonomy](skills/rasanai/references/direction.md) · [DESIGN.md](skills/rasanai/references/brand.md) · [entire videos](skills/rasanai/references/video.md) · [footage reels](skills/rasanai/references/reel.md) · [presenter films](skills/rasanai/references/presenter.md) · [generated images](skills/rasanai/references/imagery.md) · [console](skills/rasanai/references/console.md) · [motion.md contract](skills/rasanai/references/motion-md-contract.md) · [keyframe board](skills/rasanai/references/board-format.md) · [handoff](skills/rasanai/references/handoff.md) · [personalities](skills/rasanai/references/personalities.md) · [design doc](docs/designs/motion-director.md) · [crew design](docs/designs/crew.md)

## Publishing notes (for the maintainer)

- The repo is public. The install commands work as soon as `skills/`, `.claude-plugin/` and `install.sh` are pushed to `master`.
- The website deploys from `docs/` via `.github/workflows/site.yml` (Pages source: GitHub Actions); every push to `docs/` redeploys, and it can be run by hand from Actions → site.
- CI (`.github/workflows/ci.yml`) runs the self-test on every push.

## Known limits

- The design library is honest about what it knows ([EDITING.md](skills/rasanai/library/EDITING.md)): 116 of 157 entries have had the edit pass and 41 have not. Colours are mostly proposed from a designer's reading (15 entries measured from real images, 60 partly sourced), grids and timings are proposed almost everywhere, and the Rasan3D recipes in the entries were written against the real API but not rendered. Several museum and press sources blocked every fetcher. The library is a starting point the designers must judge on a rendered specimen, not a claim about the original works.
- A system's specimen is one key frame on the film's first line; the real frames (product shots, logos, data, illustration) are designed by Claude at build time.
- The DESIGN.md adapter reads the common formats but brand documents vary a lot; it reports what it couldn't find (fonts, an accent) and the brand board shows what it understood before anything is built.
- Footage reels cut on word boundaries from Whisper transcripts and on detected shot changes; there's no automatic best-take or visual-content ranking beyond what Claude reads from the contact sheets and transcripts. Cards and overlays run at least their motion's minimum length (entrance, required hold, exit); a shorter request is lengthened with a warning.
- The crew needs a harness that can run subagents (Claude Code's Agent tool). Without one, the Director follows the same role briefs itself, one at a time (`--lean`): same files and checks, slower and with less room per task. Reference films need `yt-dlp`; without it the precedent researcher works from stills and descriptions and says so.
- Model adaptation is built from how each model fails, and tested lightly. One real Codex run (gpt-5.6-sol) produced a clean but small, safe scene with placeholders; the worked example and self-critique pass added since are a prompt fix, and no full film has been measured on GPT yet. The Codex members run with `-s danger-full-access` because the workspace sandbox blocks headless Chrome on macOS.
- Presenter films need the Codex CLI signed in with ChatGPT for generated pictures (`IMAGEGEN=ready` in setup); each picture uses a share of your Codex allowance. A poor key (uneven green, a person at the edge of the frame) shows as a halo; `key-check.png` is there to catch it.
- Previews use Google Fonts; offline they fall back to system fonts.
- The checker verifies GSAP motion (motion.md requires GSAP builds); 3D motion is checked by `stage3d.mjs` from the eases on its keys and from rendered frames.
- 3D renders fastest with a GPU (HyperFrames uses the hardware GPU on a Mac). Under software GL a final 3D frame with glass, shadows and 16 to 24 samples can take seconds; the gate reports each scene's frame cost. 3D is rendered real-time-style (rasterised, image-based light, shadow maps), not path-traced: stylised and product looks, not photoreal skin or caustics. Open-engine techniques (ray-marched passes, simulation with thousands of bodies, many-sample depth of field) cost more per frame; the gate reports each scene's frame cost and refuses a frame it estimates at over 20 s.
- Lyric timing is measured on one song (the P(doom) video, against a hand-corrected truth): median 50 to 60 ms and p90 about 250 to 280 ms in the start of a word, about one word in five off by more than 150 ms (mostly the first word after a held note or a pause; `align` lists the low-confidence words). That is under two frames at 24 fps at the median, not frame-exact for every word. demucs is optional and makes it only a little tighter (and takes minutes on a CPU); without it the tool works on the mix. Snare onsets are the weakest signal (about half right); use kicks and beats for anything exact. English is the tested language.
- The film finish costs render time: about 3x a normal render at 8 samples and about 10 to 12x at 32. HyperFrames renders at most 240 fps, so more than 8 samples at 30 fps come from phase-shifted passes (up to 4); only GSAP-driven motion shifts between passes, so CSS keyframes, Lottie and video blur on the 240 fps grid only. The grade is the heavy ffmpeg part (grain runs near 10 frames per second at 1080p). Drafts skip the finish.
- The hand-off to each workflow (plan files, packet injection, music lock) is tested on real projects; a complete rendered film through every workflow hasn't been run for each route yet.

## License

MIT. `skills/rasanai/scripts/vendor/gsap.min.js` is GSAP 3.14.2 under the [GSAP Standard License](https://gsap.com/standard-license).

RasanAI (ரசனை) is made by [Sibhimanyu](https://github.com/Sibhimanyu). Built on [HyperFrames](https://hyperframes.heygen.com) and [Claude Code](https://claude.com/claude-code).
