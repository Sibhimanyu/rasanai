# motionmaxxing, in RasanAI

Adapted from [motionmaxxing](https://github.com/Tejashmakwana/motionmaxxing) by Tejas Makwana, Apache-2.0 (`LICENSE`, `NOTICE`).

What we took, and from where:

| Here | From | Used by |
|---|---|---|
| `LICENSE` | `LICENSE` (exact copy) | |
| `moments.jsonl` | `library/moments.jsonl` (exact copy: 1 header row, 716 precedent rows: designer rules `PR-`, study moments `PM`, film rules `PL`) | `node scripts/moments.mjs precedent` (`scripts/lib/precedent.mjs`, a Node port of the ranking in `scripts/precedent.py`) |

The rows are model-decoded and unverified: hints, never rules. They never outrank a measured number in `references/` or the user's verdicts.

Not taken: GSAP, three.js, opentype.js, fonts, docs/media, studies images.
