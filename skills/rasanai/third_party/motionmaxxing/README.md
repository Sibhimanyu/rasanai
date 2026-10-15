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
| `library/motion/closes/*.md` (ten closes C1 to C10 plus a chooser with the brand-personality table and hold rules), `library/motion/kinetic-type/type-*.md` (acts out the word, key-word devices, name morphs, phrase replacement), `library/moves/transitions.json` (T5, T9, T10, T17, T18, T20 with frame counts) | `references/close.md`, `references/type.md` sections 0, 5, 6, 9, `references/transitions.md` (the measured numbers, re-stated in our words and condensed; house-style warnings kept) | the design desk, the Motion Director, `references/vocabulary.md` |
| `RasanMotion` 1.1.0: `M.snap` (firstFrameShare, tail), `M.dive` (constant-octave zoom), `M.smear` (directional blur peaking on the first or last frame), the one-blur-grammar rule | `runtime/motion.js` `snap`, `dive`, `smear`, `whip` (the ideas and defaults, rewritten for GSAP timelines; Modified) | films, `obey.mjs` |
| `RasanUI` 1.1.0: `U.drag`, `U.scroll`, `U.shimmer`, `U.terminal`; the agent-working beat order and drag recipes in `references/ui-rebuild.md` | `references/ui-demo.md` sections 6, 8, 10 and recipes A to E (the measured reaction orders and numbers, rewritten as time-driven channels) | product UI rebuilt for video |
| `references/metaphor-bank.md` (explainers only) | `references/idea.md` section 4 (the table of abstract words to images, re-worded) | faceless explainers |

The rows are model-decoded and unverified: hints, never rules. They never outrank a measured number in `references/` or the user's verdicts.

Not taken: GSAP, three.js, opentype.js, fonts, docs/media, studies images.
