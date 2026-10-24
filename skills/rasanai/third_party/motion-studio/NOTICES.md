# Motion Studio notices

RasanAI's own code, including all Motion Studio modules (motion kit, reference analysis, element index, editor patching, renderer adapters, Studio screens), is original work under the MIT licence (root `LICENSE`, Sibhimanyu 2026). No code, text, prompt or asset from any source below was copied into it. Full ledger with commit SHAs: `docs/plans/motion-studio-licenses.md`.

## Third-party material that is shipped

- **GSAP 3.14.2 and plugins** (`skills/rasanai/scripts/vendor/gsap.min.js`, `gsap-plugins/`, `gsap-plugins.min.js`; copy at `docs/assets/gsap.min.js`): Copyright 2025 GreenSock. All rights reserved. Subject to the GSAP Standard License, https://gsap.com/standard-license. Included unmodified with licence headers kept. This is not MIT and is not relicensed by RasanAI's MIT. Do not remove the headers.
- **three.js** (MIT, copyright 2010-2026 three.js authors), where already used by stage3d. Keep its licence with any redistributed copy.

## Read for ideas, nothing shipped

OpenFilm (MIT; name and logo are trademarks), Remocn and Remocn Studio (MIT), Remotion (custom Remotion License; Company License required above the free tier), remotion-dev/skills (no licence found), MotionVideo site (MIT) and MotionVideo skill pack (proprietary, not accessed), charlie947/motion-graphics-skills (MIT), Leonxlnx/cinetic (MIT), howseen-ai/claude-motion-design (MIT; media separate), vercel/satori (MPL-2.0), Motion Canvas (MIT), Rive (MIT runtime; proprietary editor, free exports carry a splash screen).

## Optional renderer adapters (all off by default)

`remotion`, `openfilm` and `rive` are enabled only with `RASANAI_ADAPTER_<ID>=1` and show their licence note first. RasanAI does not bundle Remotion, OpenFilm or any Rive runtime. Commercial use of Remotion may require a Remotion Company License (https://www.remotion.pro/license). Rive free-plan exports include a Rive splash screen.

## Prohibited in Motion Studio

Third-party logos, footage, unlicensed audio, fonts, the paid MotionVideo pack, and verbatim text from any source above.
