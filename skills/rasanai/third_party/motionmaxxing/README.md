# motionmaxxing, in RasanAI

Adapted from [motionmaxxing](https://github.com/Tejashmakwana/motionmaxxing) by Tejas Makwana, Apache-2.0 (`LICENSE`, `NOTICE`).

What we took, and from where:

| Here | From | Used by |
|---|---|---|
| `LICENSE` | `LICENSE` (exact copy) | |
| `moments.jsonl` | `library/moments.jsonl` (exact copy: 1 header row, 716 precedent rows: designer rules `PR-`, study moments `PM`, film rules `PL`) | `node scripts/moments.mjs precedent` (`scripts/lib/precedent.mjs`, a Node port of the ranking in `scripts/precedent.py`) |
| `scripts/lib/chrome-lint.mjs`, page-chrome rules in `scripts/slop.mjs`, flat-swatch grounds in `scripts/frame-gate.mjs` | `scripts/lint.mjs` (gate G5), `references/slop.md` (adapted, rewritten) | `slop.mjs --project`, `frame-gate.mjs` |
| The 12 measured eases in `runtime/rasan-motion.js` (`RasanMotion.measured`), frame budgets in `references/craft.md` | `runtime/motion.js`, `references/motion.md` (adapted) | films, `obey.mjs` entrance warnings |
| `runtime/rasan-ui.js`, `scripts/uikit.mjs`, `references/ui-rebuild.md` | `runtime/native-ui/`, `references/ui-demo.md` (adapted in part, rewritten for the HyperFrames clip contract) | product UI rebuilt for video |
| Process rules in `references/craft.md` and the critic and frame-juror briefs (beats buy something, describe before judging, quoted gate numbers, works-when table, house-style warning) | `SKILL.md`, `references/director.md`, `judgment.md`, `slop.md` (ideas, in our words) | the crew |
| The taste ledger in `scripts/memory.mjs` | the idea of `taste/verdicts.md` and `taste/edits.md` (no code taken) | step 0 of every film |

The rows are model-decoded and unverified: hints, never rules. They never outrank a measured number in `references/` or the user's verdicts.

Not taken: GSAP, three.js, opentype.js, fonts, docs/media, studies images.
