<!-- Splice into skills/rasanai/third_party/SOURCES.md: table rows go in the Summary table, sections after the last source section. Written 2026-10-24 by W14; ledger: docs/plans/motion-studio-licenses.md. Every entry is "idea only" (or vendored unmodified for GSAP): nothing copied, no third_party credit folders needed. -->

### Summary table rows

| Source | Licence | Mode | Main features | Status |
|---|---|---|---|---|
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

### Sections

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
