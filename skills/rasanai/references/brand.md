# Brand: a project's DESIGN.md as the look

When the workspace already has a brand reference, RasanAI uses it instead of inventing a look: its colors and fonts are sacred; directions vary the art direction around them. `scripts/brand.mjs` (library: `scripts/lib/design-md.mjs`).

## When a brand step is required

If the brief names a brand (`brand_name` / `use_brand: true`) or the product is a known brand, a brand step ALWAYS runs: a workspace DESIGN.md wins; otherwise the brand researcher builds `research/brand/DESIGN.md` from official sources (type, colours, UI language, logo usage, motion) and the research lead's `crew.mjs check` fails without it. The Director reads it with `brand.mjs read`, pushes it to the console as step `brand`, and sets `brand` in decisions. From then on the brand lock applies: all three looks stay inside the brand's type, colours and UI, and vary composition, motion and density only (`references/design-desk.md`, `references/product-first.md`). `use_brand: false` (the user chose a new look) is the only way out.

## What it reads

| Shape | Example |
|---|---|
| Google design.md spec frontmatter | `colors:` (hex, `oklch()`, `rgb()`, `hsl()`, with `#` comments as role hints), nested `typography:` (`fontFamily`, `fontWeight`), `rounded:`, `spacing:`, `components:` (impeccable, gstack, the HyperFrames design picker) |
| HyperFrames frame.md | inline typography maps with `cqw`; the display face is the largest size when no key is named display |
| Stitch-style prose | `- **Canvas White** (#F9FAFB) — Primary background` |
| CSS custom properties | `--bg: #0a0e15; /* base */` anywhere in the file |
| Token tables | `| INK | 1A1A1A | the slide's answer |` (hex with or without `#`) |
| Font lines and tables | `**Display:** \`Geist\``, `font-family:`, role tables (`Interface | SF Pro | Roboto`); "Banned fonts" sections and "`X` is BANNED" fragments are skipped; "Same family at 400" inherits the display face |
| Rules | Do / Don't / Do Not / Anti-patterns / Do's and Don'ts sections |
| Sidecar | `.impeccable/design.json` shadows |

Roles come from each color's name and its comment or description (background/ground/page → canvas; text/ink/foreground → ink; accent/brand/primary/CTA → accent; surface/card/panel; muted/secondary text; border/rule; status colors never become the accent), then luminance, saturation and contrast. Text needs 4.5:1 on the canvas; a saturated "text accent" never becomes the ink. A monochrome brand's accent is its second-strongest ink. A brand with light and dark variants (two or more tokens existing as both `-dark` and `-light`) needs `--mode light|dark`.

Platform fonts don't exist in HyperFrames' headless render, so they map to shipped equivalents with a warning: SF Pro / system stacks / Segoe / Helvetica / Roboto → Inter, SF Mono / Menlo → JetBrains Mono, New York / Georgia / Times → Source Serif 4, Calibri → Carlito, Cambria → Caladea (metric-compatible).

## Commands

```bash
node scripts/brand.mjs detect [--dir .]                        # finds DESIGN.md, design.md, BRAND.md, docs/DESIGN.md
node scripts/brand.mjs read --file DESIGN.md [--mode dark] [--full]
node scripts/brand.mjs frame --file DESIGN.md --out frame.md [--mode dark]    # verified with HyperFrames' own token parser
node scripts/brand.mjs tokens --file DESIGN.md --out capture/extracted/tokens.json
node scripts/brand.mjs board --file DESIGN.md --out <dir> [--aspect 16:9] [--mode dark]
```

- **frame** writes a frame.md HyperFrames accepts: role-named colors (`canvas`, `ink`, `accent`, `surface`, `muted`, `rule`, support colors less saturated than the accent, `status-*`), inline typography maps (display-hero, display, headline, body, label, mono, stat-figure) with quoted families, radii, shadows, components, and body sections (Overview, The Frame, Colors, Typography, Depth & Surface, Shapes, the brand's own notes on motion, Composition Rules with its Do/Don't, Known Gaps). It then reads the file back with HyperFrames' `parseColors`/`semanticColors`/`parseFonts` and RasanAI's `readLook`, and fails if the canvas or ink comes back different.
- **tokens** writes `capture/extracted/tokens.json` for `build-frame.mjs`: a preset's layout remixed onto the brand (`look: {design_md, preset}`).
- In a build, `lib/install.mjs` also stages every family's `.woff2` into `assets/fonts/` (a preset's own font files when the look is a preset, else Google Fonts, else Fontshare) and appends a "Font loading" section with the exact `@font-face` rules every composition must copy. A family that can't be staged is renamed to Inter in frame.md, with a warning, so no worker names a missing font.

## In decisions

`look: { "design_md": "DESIGN.md", "mode": "dark" }` (the brand's own frame.md) in video-decisions.json, handoff decisions.json and reel.json; or brand-locked design directions (`design.mjs looks --brand DESIGN.md`, then `design.mjs pick`, which sets `look.frame` and keeps `brand`). In `video.mjs` only, `{ design_md, preset }` also works: the brand remixed onto a preset's layout by `build-frame.mjs`. A picked `look.frame` wins over `design_md` when both are set.
