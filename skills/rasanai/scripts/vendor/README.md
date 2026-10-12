# vendor

`gsap.min.js`: GSAP 3.14.2, fetched unmodified from `https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js`. Licensed under the GSAP Standard License (https://gsap.com/standard-license); the licence header is kept in the file.

It is inlined into tasting and board pages and injected by obey.mjs, so previews and checks work offline and use the same GSAP version HyperFrames loads.

`imagetracer.js`: imagetracerjs 1.2.6 by Andras Jankovics, fetched unmodified from the npm package `imagetracerjs@1.2.6` (`imagetracer_v1.2.6.js`). The Unlicense (public domain dedication, header kept in the file; npm licence field "Unlicense"). Used by `art.mjs trace`.

`hershey/`: single-stroke Hershey fonts as JSON, for `art.mjs hand`. Attribution-only licence (not formally public domain); see `hershey/README.md`.

`gsap-plugins/` and `gsap-plugins.min.js`: the GSAP 3.14.2 plugins, fetched unmodified from the npm tarball `gsap@3.14.2` (`package/dist/<Name>.min.js`, the same version as `gsap.min.js`), each with its own licence header (GSAP Standard License, https://gsap.com/standard-license; free for commercial use; only forbids building a competing no-code visual animation builder). Per-plugin files: SplitText, ScrambleTextPlugin, DrawSVGPlugin, MorphSVGPlugin, MotionPathPlugin, CustomEase, CustomBounce, CustomWiggle, InertiaPlugin, Physics2DPlugin, EasePack, Flip, TextPlugin. `gsap-plugins.min.js` is all of them concatenated in that order (about 150 KB raw, 55 KB gz). Load it after `gsap.min.js`, then `gsap.registerPlugin(SplitText, ScrambleTextPlugin, ...)`. Not included: GSDevTools, ScrollTrigger, ScrollSmoother (not needed for a paused timeline). Seek-safe: plugins only add tweens to the paused timeline; call `document.fonts.ready` before `SplitText.create(...)` and keep `autoSplit:false`.

`../../library/sfx/`: the CC0 SFX library lives with the library, not here; see `library/sfx/CREDITS.md`.
