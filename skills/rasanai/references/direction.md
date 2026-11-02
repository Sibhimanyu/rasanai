# Direction: the stack of decisions, in proper terms

## Contents

- [The taxonomy](#the-taxonomy)
- [decisions.json](#decisionsjson)
- [direction.mjs](#directionmjs)
- [What builders receive](#what-builders-receive)
- [Style presets (the library)](#style-presets-the-library)
- [Design directions (looks)](#design-directions-looks)

A motion-graphics style is never one style. It is a stack of design decisions: format, UI treatment, visual style, illustration, typography, color, shape, stroke, shadow, material, texture, depth, motion language, transitions, camera, effects, pacing, narrative, sound, production. RasanAI holds that vocabulary as data (the taxonomy), lets the user decide any dimension or hand it to Claude, and compiles the stack into `DIRECTION.md`, the art-direction brief Claude designs and animates from.

## The taxonomy

`taxonomy/dimensions/<id>.json`, one file per dimension (schema: `taxonomy/SCHEMA.md`; `node scripts/taxonomy.mjs validate`). 32 dimensions, 926 terms, each with:

| field | meaning |
|---|---|
| `term` | the proper industry term |
| `what` | a one-sentence definition |
| `looks` / `motion` | what it usually looks like; how it usually moves |
| `use` / `conveys` | where it's used; what it communicates |
| `vs` | the term it's most often confused with, and the difference |
| `search` / `refs` | reference search phrases; well-known examples (only when certain) |
| `prompt` | the precise, executable instruction a builder follows |

Dimensions have a `question` (asked in the console), a `pick` limit, optional `families` (grouping) and `facets` (secondary attributes, e.g. UI treatment's border, radius, density; typography's composition and motion; color's animated techniques). `motion-language` terms also carry a `contract` (eases, duration scale, stagger, hold, bans) that becomes `motion.md`; `transitions` terms carry a `feel`.

`taxonomy/combinations.json`: 35 style combinations known to cohere (e.g. "Energetic neo-brutalist 2D interface animation" = neo-brutalist UI + heavy stroke + offset shadow + high contrast + snappy motion + hard cuts). They rank candidates for "you decide".

```bash
node scripts/taxonomy.mjs list [--group look]        # dimensions, option counts, questions
node scripts/taxonomy.mjs show ui-treatment           # the terms of one dimension
node scripts/taxonomy.mjs term ui-treatment/simplified-ui   # one full entry
```

## decisions.json

```json
{
  "subject": "Tally, receipts to books in one tap",
  "picks": {
    "format": "product-launch-film",
    "tone": ["confident", "friendly"],
    "narrative": "problem-solution",
    "ui-treatment": ["simplified-ui"],
    "ui-treatment:radius": "medium",
    "visual-style": "swiss-international",
    "typography": ["grotesk"],
    "motion-language": "precise",
    "transitions": ["ui-morph"],
    "pacing": "medium-explanatory"
  },
  "decided_by": { "visual-style": "agent", "transitions": "agent" },
  "notes": { "tone": "warm, never cute" },
  "brand": "DESIGN.md",
  "brand_mode": "dark",
  "motion": ".rasanai/<ts>/motion.md",
  "avoid": ["no stock-photo people"],
  "look": { "frame": ".rasanai/<ts>/looks/B/frame.md", "name": "Swiss / International Typographic Style" }
}
```

- `picks`: dimension id → a term id or a list (up to the dimension's `pick.max`); facets as `"<dimension>:<facet>"`. Unknown ids are rejected with the closest valid ones.
- `decided_by`: `user` | `agent` | `brand` per dimension (shown as receipts in DIRECTION.md).
- `brand`: the project's DESIGN.md; its don'ts join the Avoid list. `motion`: the compiled motion.md; its banned patterns join the Avoid list.
- `look`: written by `design.mjs pick` (the chosen design direction's frame.md).

## direction.mjs

```bash
node scripts/direction.mjs compile --decisions decisions.json --out <dir>     # DIRECTION.md + direction.json
node scripts/direction.mjs suggest --dimension visual-style --decisions decisions.json [--recent a,b] [--count 3]
node scripts/direction.mjs menu [--group look | --dims a,b] [--decisions decisions.json]   # console payload
node scripts/direction.mjs directions --decisions decisions.json --out <dir> [--count 3] [--exclude ids] [--brand DESIGN.md] [--headline "…"] [--sub "…"] [--no-images]
node scripts/direction.mjs pick-direction --directions <dir>/directions.json --id <id> --decisions decisions.json
node scripts/direction.mjs analyze     # the reference-analysis template
node scripts/direction.mjs compare     # the two-reference comparison template
```

- **compile** → `DIRECTION.md`: the style name (visual style + subject/treatment + motion/format, e.g. "Swiss / International Typographic Style, simplified-UI product launch film, precise motion"), the style formula as a stack, a one-paragraph brief, how to apply it (tokens from frame.md win on values, motion.md on timing, the direction on everything else), then every decision grouped (format & tone, story, subject, look, motion) with its definition, what it looks like, how it moves, a **Do** instruction and what it is **not**, director's notes, and an Avoid list. `direction.json`: the resolved picks, style name, formula and brief.
- **directions** → `directions.json`: complete directions for the console's Direction step, each a whole style combination from `combinations.json` ranked against the picks so far (a combination that contradicts a pick ranks low). No two share a visual style, one comes from the far end of the list (unusual in style, never in format), none is built on the generic default (reported as `passed_over`). Each card: `id`, `name`, `why` (the combination's result), `terms` (its defining terms, up to five), `picks` (its full stack, the user's own picks winning) and `image` (that direction's look rendered as a board by `design.mjs looks`, in the brand with `--brand`). **pick-direction** merges the chosen card's picks into decisions.json (the user's picks win; `direction_card` records which).
- **suggest** ranks a dimension's terms for "you decide": co-occurrence with the picks so far in `combinations.json`, a seeded spread, minus the generic default (`GENERIC` in `lib/direction.mjs`: SaaS minimalism, smooth, crossfade…) and recent picks. It returns the candidates with the combinations they fit and the generic option it passed over (the receipt).
- **analyze / compare**: templates Claude fills by looking at the user's references (every category: STYLE, EVIDENCE, CONFIDENCE, CLOSE ALTERNATIVES; then a style formula), using valid term ids so the result drops straight into `picks`.

## What builders receive

- `DIRECTION.md` + `direction.json` in the project root (`video.mjs write`, `handoff.mjs`, `reel.mjs build`, via `lib/install.mjs`).
- A compact binding summary (style name, brief, every decision's Do instruction, about 4 KB) appended to `frame.md` and, with the motion contract, to every frame packet (`video.mjs inject`) and `DISPATCH.md`, because frame workers only read their packet and frame.md.
- Reel cards and overlays: the same summary in each card brief (`reel.mjs briefs`).

## Style presets (the library)

`taxonomy/presets/<family>.json` (schema: `taxonomy/presets/SCHEMA.md`): hundreds of complete, named styles in twelve families (bold, soft, editorial, retro, future, handmade, dimensional, product, data, cinematic, playful, luxury). Each has a proper name and the names people also use (`aka`), what it looks like, what it feels like, where it fits, what it is often confused with, reference searches, a `stack` of taxonomy terms, and a `recipe` (palette, fonts, layout, radius, stroke, shadow, surface, texture, icons, motif, motion) that `console/presets.js` draws as a live specimen on the user's words.

```bash
node scripts/presets.mjs validate                 # terms, recipe vocabulary, contrast, no two styles that draw alike
node scripts/presets.mjs list [--family retro] [--q glass]
node scripts/presets.mjs suggest --decisions decisions.json [--brand DESIGN.md] [--count 6] [--recent ids]
node scripts/presets.mjs gallery --out <dir> [--headline "…"] [--brand DESIGN.md] [--recommended a,b,c]
node scripts/presets.mjs pick --id <id> --decisions decisions.json [--brand DESIGN.md]
node scripts/presets.mjs stills --out <dir> [--family f]   # contact sheets for review
```

- **suggest** ranks against what's decided (term overlap, co-occurrence with the 35 combinations), brand fit (a dark brand suits dark styles; the brand's colors replace the style's), spread across families and visual styles, one unusual pick from far down the list, never a recent pick or the generic default (reported as `passed_over`).
- **pick** merges the style's stack into `picks` (never over what the user picked themselves), writes its frame.md (colors, type, radius, shadow, the recipe as rules) and sets `look.frame`, so the Look step is already decided.

## Design directions (looks)

`design.mjs looks` turns visual-style terms into complete looks: a palette by role (canvas, ink, accent, surface, support) from the style's signature colors, HyperFrames' 72 palettes (roles assigned automatically, light and dark grounds) or the color taxonomy; a type pairing from `taxonomy/looks/type-pairings.json` (46 Google Fonts / Fontshare pairings tagged with typography classes); radius, border, shadow and texture parsed from the style's own definition; and a board composition matching the style (poster, grid, stacked cards, HUD, full-bleed color field, split). Each look is a board with the user's words and a `frame.md` HyperFrames accepts. With a brand reference, looks keep the brand's colors and fonts and rotate the ground (the brand canvas, the accent as a color field, the surface) and the art direction.

```bash
node scripts/design.mjs looks --out <dir> [--decisions d.json] [--count 6] [--aspect 9:16] [--headline "…"] [--sub "…"] [--brand DESIGN.md --mode dark] [--seed s] [--stills]
node scripts/design.mjs pick --looks <dir>/looks.json --id B --decisions d.json
node scripts/design.mjs stills --dir <styleframes dir> --aspect 16:9   # Claude's style frames -> PNG
```
