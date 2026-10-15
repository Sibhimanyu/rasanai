---
name: RasanAI
description: Creative direction for whole films, made with Claude. Rice-paper ground, deep indigo ink, one turmeric spark; the mark is the Tamil letter ர with a play triangle in its counter.
colors:
  rice: "#F1F0EC"           # page ground: the default canvas for print, site and slides
  ink: "#1B1F5E"            # Indigo: the brand text colour; the mark, headlines and deep grounds
  turmeric: "#EFB21A"       # accent: the warm spark; the play triangle, one highlight per view
  rasanai-blue: "#2A31A8"   # action: the one primary button, links, selection (interface only)
  paper: "#F7F6F2"          # surface: cards, sheets and tables raised on rice
  graphite: "#15151C"       # long-form running copy on the site
  ink-2: "#3F4368"          # muted secondary text
  rice-2: "#E4E5EA"         # rule: hairlines and dividers
  mist: "#DFE3EE"           # cool surface, quiet panels
  silk: "#B3165A"           # support: rare emphasis in films and editorial
  leaf: "#1E5A3C"           # support: growth, calm, natural looks
  indigo-deep: "#11163F"    # dark sections
  midnight: "#0C1030"       # darkest ground
  on-indigo: "#EEF0FF"      # text on indigo
  on-indigo-2: "#C3C7EC"    # quiet text on indigo
  blue-lift: "#7C83F5"      # RasanAI Blue as text in the app's dark mode
  charcoal: "#1E1E1E"       # the Mac app's window in dark mode
typography:
  display:
    fontFamily: Anek Latin
    fontWeight: 600
  headline:
    fontFamily: Anek Latin
    fontWeight: 500
  body:
    fontFamily: Mukta
    fontWeight: 400
  label:
    fontFamily: JetBrains Mono
    fontWeight: 500
  mono:
    fontFamily: JetBrains Mono
    fontWeight: 400
  tamil:
    fontFamily: Anek Tamil
    fontWeight: 700
  wordmark:
    fontFamily: Montserrat
    fontWeight: 760
rounded:
  xs: 4px
  sm: 6px
  md: 8px
  lg: 12px
  pill: 999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px
  page: 72px
components:
  button-primary: "RasanAI Blue fill, white SemiBold label, 8px radius; 26 / 32 / 38 tall; one per screen"
  button-secondary: "No fill, 1px outline at 16% ink, 8px radius; fills 6% on hover"
  card: "Surface fill, 1px hairline, 12px radius; hover raises with a soft shadow, selection is a 2px ink outline"
  switch: "Track at 5% ink, 8px radius; the selected segment is a raised neutral pill, 6px radius, never brand blue"
  tag: "Pill (999px), 1px rule outline, label type"
---

# RasanAI design system

The one source for how RasanAI looks, reads and moves: the website (`docs/`), RasanAI Studio for macOS (`apps/macos/`), the skill's own films and launch material, and print. When code and this file disagree, fix one of them; don't let them drift.

| Where the tokens live | File |
|---|---|
| Website | `docs/assets/site.css` (`:root` custom properties), `docs/assets/home.css` |
| Mac app | `apps/macos/Sources/RasanAIStudio/Theme.swift` (`Color.rasan`, `rasanFill`, `turmeric`, `rasanDeep`, button styles) |
| Logo files | `docs/assets/logo/` (SVG masters, PNG marks at 32 / 180 / 512 / 1024) |
| App icon | `apps/macos/Packaging/AppIcon-1024.png` |
| Brand guidelines (19 pages) | `docs/brand/RasanAI-Brand-Guidelines.ai` and `.pdf`, built by `docs/brand/source/build.jsx` |

## Overview

**Rasanai (ரசனை)** is Tamil for taste: the art of appreciating why something is good. RasanAI is creative direction for whole films made with Claude. The person makes five calls (brief, script, look, animatic notes, final) and RasanAI directs the craft in between, showing every decision it makes.

The identity follows from that: calm and exact around the work, so the films can be loud. Rice paper, indigo ink, and a single turmeric spark. It should feel like a well-run edit suite with a Tamil soul, not like an "AI" product.

### Principles

1. **Taste over templates.** Every film gets its own look, researched and blended for that film. Nothing should read as a preset, including our own material.
2. **The product is the hero.** Real screens, real uses, a plain true story. No clever metaphor standing in for the thing itself.
3. **Show the decisions.** Every craft call is visible and explainable. Confidence comes from showing the work.
4. **Calm tools, bold films.** The interface stays quiet so the film can be loud. One loud action per screen.

## Logo

### The mark

The mark is **ர** (ra), the first letter of ரசனை, drawn as one heavy stroke, with a **play triangle** in its counter: taste, set in motion. It stands alone wherever the name is already present (app icon, favicon, avatar, end card).

Construction, in units on a 102 × 126 grid:

| Part | Measure |
|---|---|
| Stroke **T** | 20 units, every stroke |
| Bounding box | 102 × 126 |
| Stem | 82 units (x 0–20, y 0–82); also the wordmark's cap height |
| Bar | x 0–102, y 0–20 |
| Right leg and kick | x 82–102 down to y 62, then a 45° kick to (38, 126), squared off |
| Counter | 62 × 62, (20, 20) to (82, 82) |
| Play | (36, 31) (60, 46) (36, 61), 3-unit round join |

The path, for code: `M0 0H102V62L38 126L23.858 111.858L82 53.716V20H20V82H0Z` plus `M36 31L60 46L36 61Z` (`RasanMark` in `Theme.swift` draws the same points).

### The suite

| Version | File | Use |
|---|---|---|
| Primary lockup | `rasanai-lockup.svg`, `-reverse` | Default everywhere: mark + wordmark, gap = T |
| Stacked | `rasanai-stacked.svg`, `-reverse` | Square and tall spaces; mark over RasanAI over ரசனை |
| Glyph | `rasanai-glyph.svg`, `-reverse`, `-turmeric` | Favicon, watermark, corner bug in films |
| App mark | `rasanai-mark.svg`, `-light`, `-turmeric` | App icon, avatar: rice glyph on an indigo square, 22% corner radius |
| Wordmark | `rasanai-wordmark.svg`, `-reverse` | Only when the mark already appears nearby |
| Tamil wordmark | `rasanai-tamil.svg` | ரசனை on its own, Mukta Malar ExtraBold, outlined |

The wordmark is Montserrat at weight 760, **outlined**. Never retype it in a live font.

### Clear space and size

- Keep **2T** (twice the mark's stroke) clear on every side.
- In a line with other content (a nav bar, a credit), centre the wordmark's cap height on the line; the kick hangs below like a descender (see `.brand img` in `site.css`).
- Minimum sizes: primary lockup 120 px / 30 mm wide; stacked 72 px / 18 mm wide; glyph and app mark 16 px / 5 mm.

### Logo colour

Allowed: indigo on rice (primary), rice on indigo (reverse), indigo on turmeric, rice on RasanAI Blue, one-colour black on white, one-colour white on ink. The play triangle may be turmeric when the glyph is rice or white on indigo.

### Logo don'ts

- Don't stretch, squash, rotate or crop it.
- Don't recolour it outside the versions above, or fill it with gradients or effects.
- Don't outline it.
- Don't rearrange the parts or retype the wordmark.
- Don't place it on low contrast (indigo on RasanAI Blue, turmeric on rice) or on busy footage without a plate.

## Colors

### Primary

| Name | Hex | RGB | Role |
|---|---|---|---|
| **Indigo** | #1B1F5E | 27 31 94 | The mark's ink. Logo, headlines, deep grounds |
| **Rice** | #F1F0EC | 241 240 236 | The paper. Default ground for print, site and slides |
| **Turmeric** | #EFB21A | 239 178 26 | The warm spark. The play, one highlight per view, note times |
| **RasanAI Blue** | #2A31A8 | 42 49 168 | Action. The one primary button, links, selection |

### Supporting

| Name | Hex | Role |
|---|---|---|
| Silk | #B3165A | Rare emphasis in films and editorial. Never for UI errors |
| Leaf | #1E5A3C | Growth and calm; natural looks and success moments |
| Mist | #DFE3EE | Cool surfaces and quiet panels on rice |
| Paper | #F7F6F2 | Raised surface on rice: cards, sheets, tables |

### Neutrals and app

| Name | Hex | Role |
|---|---|---|
| Midnight | #0C1030 | Darkest ground (`--indigo-ink` on the site) |
| Indigo Deep | #11163F | Dark sections |
| Graphite | #15151C | Long-form running copy on the site; headlines, labels and film text stay Indigo |
| Ink 2 | #3F4368 | Secondary text |
| Rice 2 | #E4E5EA | Hairlines |
| On Indigo | #EEF0FF | Text on indigo |
| On Indigo 2 | #C3C7EC | Quiet text on indigo |
| Blue Lift | #7C83F5 | RasanAI Blue as text in dark mode (fills stay #2A31A8) |
| Charcoal | #1E1E1E | The Mac app's window in dark mode |

The Mac app otherwise uses system colours (window background, separators, `systemGreen/Orange/Red` for status) so it feels native in light and dark mode.

### Proportion

Roughly **50% rice, 30% indigo, 10% paper or mist, 6% RasanAI Blue, 4% turmeric**. Turmeric is the scarcest colour and the most noticed; if two things are turmeric, one of them is wrong.

### Contrast

| Pair | Ratio | Use |
|---|---|---|
| Indigo on Rice | 13.1 : 1 | AAA, any size |
| Rice on Indigo | 13.1 : 1 | AAA, any size |
| Turmeric on Indigo | 7.9 : 1 | AAA |
| Indigo on Turmeric | 7.9 : 1 | AAA |
| RasanAI Blue on Rice | 8.8 : 1 | AAA |
| White on RasanAI Blue | 10 : 1 | AAA |
| Ink 2 on Rice | 8.3 : 1 | AAA |
| Turmeric on Rice | 1.7 : 1 | Decoration only, never text |

## Typography

| Role | Family | Weights | Use |
|---|---|---|---|
| Display and headlines | **Anek Latin** | 500, 600, 700 | Titles, film title cards, big numbers |
| Body | **Mukta** | 400, 500, 600 | Paragraphs, UI copy on the site |
| Labels and data | **JetBrains Mono** | 400, 500 | Eyebrows, timecodes, specs, code; labels in caps, +120 tracking |
| Tamil | **Anek Tamil** (display), **Mukta Malar** (text) | 500, 700 | Any Tamil; the wordmark's ரசனை is Mukta Malar ExtraBold |
| Wordmark | Montserrat 760 | — | Logo only, outlined. Never set as text |
| Mac app interface | SF Pro (system) | — | Native controls and app text; brand type is for films, the site and print |

All brand families are free on Google Fonts (OFL). The site loads Anek Latin, Anek Tamil, Mukta and JetBrains Mono; fallbacks are Avenir Next Condensed / Arial Narrow (display) and Avenir Next / Segoe UI (body).

### Scale

| Style | Spec | Example |
|---|---|---|
| Hero | Anek Latin SemiBold 168 / 150, −20 | Brand Guidelines |
| Display | Anek Latin SemiBold 96 / 92, −15 | Direct your film. |
| H1 | Anek Latin SemiBold 64 / 64, −10 | Pick a look for this story |
| H2 | Anek Latin Medium 40 / 44, −5 | Three scripts, one true story |
| H3 | Anek Latin SemiBold 28 / 32 | Leave notes on the animatic |
| Body L | Mukta Regular 22 / 32 | Intros and lead paragraphs |
| Body | Mukta Regular 17 / 26 | Running text |
| Small | Mukta Regular 15 / 21 | Captions, card copy |
| Label | JetBrains Mono Medium 13, +120, caps | SCENE 04 · 00:12.4 |

On the web these sizes scale with `clamp()`; keep the ratios.

**Tamil needs real shaping.** ரசனை is stored ர ச ன ை but the vowel sign ை draws before ன. Browsers and HarfBuzz handle it; in Illustrator turn on the World-Ready composer or use outlines, or the letters come out in the wrong order.

## Layout and spacing

- **4-point base:** 4, 8, 12, 16, 24, 32, 48, 72.
- **Site:** content max width 1320 px; page padding `clamp(20px, 4.4vw, 72px)`; section rhythm `clamp(84px, 9.5vw, 144px)`.
- **App:** card padding 16; gaps 24–32 between sections.
- **Slides and boards:** 1920 × 1080, 120 px margins, mono eyebrow top-left, footer label and page number at the bottom.
- Pages alternate rice and indigo sections; the indigo hero carries the nav, then the body sits on rice.

## Shapes and depth

| Radius | Use |
|---|---|
| 4 px | Small inline chips |
| 6 px | Selected switch segment |
| 8 px | Buttons, switch track |
| 12 px | Cards, panels, swatches |
| 22% | App mark (the icon's own shape) |
| 999 px | Pills and toggles on the site |

Flat by default: no gradients, bevels, glass or inner shadows. Depth is one soft shadow on hover (black at 12%, 12 px blur, 5 px down) and hairlines (1 px, Rice 2 or 14% indigo on light; 16% rice on dark).

## Components

- **Primary button:** solid RasanAI Blue, white SemiBold label, 8 px radius, heights 26 / 32 / 38 (label 12 / 13 / 14–15). One per screen: the step that moves the film forward ("Make the film").
- **Secondary button:** no fill, 1 px outline at 16% ink, 8 px radius, fills 6% on hover, 10% when pressed. Destructive buttons use red text, never a red fill.
- **Disabled:** 45% opacity.
- **Cards:** surface fill, 12 px radius, 1 px hairline. Hover raises the background only (shadow and edge), never the content, so text doesn't shimmer. Selection is a firm 2 px neutral outline; brand blue stays for the primary action.
- **Switch (Grid | List):** a sliding neutral pill on a spring, not the system segmented control and not brand blue.
- **Status dots:** 7 px; green ready, orange waiting, red stopped, grey quiet; waiting may pulse, unless Reduce Motion is on.
- **Help:** a `?` at the end of every toolbar, opening two to four plain lines and a link to the guide.

## Motion

RasanAI makes films, so its own motion is restrained and exact: every move has a reason, and the interface never competes with the work.

1. **One move per beat.** Each beat gets one primary motion; secondary motion supports it.
2. **Springs, not timers.** Interface springs: response 0.30 s, damping 0.86. Interruptible.
3. **Fast feedback.** Hover and press: 120 ms ease-out. Cards raise in 180 ms (snappy). Never animate text position or scale on hover.
4. **Respect Reduce Motion.** Cross-fade or cut; nothing pulses, nothing slides. The site has its own motion toggle.

**Logo sting:** the ர stroke draws in, the play triangle springs into the counter, then it holds one beat. On end cards, the glyph sits bottom-right or centred, never animated twice.

Film craft (pacing, transitions, story devices) is the skill's own playbook in `skills/rasanai/`; this file covers RasanAI's own brand, not the looks it designs for other people's films.

## Voice

RasanAI talks like a calm, senior member of the crew: it says what it decided, why, and what you can change.

| We are | We avoid |
|---|---|
| **Plain:** short words, one idea per sentence | **Hype:** "revolutionary", "magic", "unleash" |
| **Specific:** numbers, names, real examples | **Jargon:** model names and internals the user never chose |
| **Warm:** speak to one person, as a collaborator | **Exclamation marks:** the excitement belongs in the film |
| **Confident:** say what was decided and why | **Blame:** errors say what happened and the next step |

| Instead of | Write |
|---|---|
| Unleash the magic of AI-powered video! | Describe a film. Direct it from there. |
| Oops! Something went wrong :( | The render stopped at scene 4: the font file is missing. Add it and resume. |
| Our cutting-edge engine optimises your content. | Three scripts, each built from what your product really does. |

Spelling is British (colour, optimise). The name is always **RasanAI**: capital R, capital A, capital I, one word.

## Applications

- **Film title card (16:9):** indigo ground, small glyph top-left (rice with turmeric play), a mono turmeric eyebrow ("A FILM BY RASANAI"), the title in Anek Latin SemiBold, an optional turmeric rule along the bottom.
- **Social (1:1):** turmeric ground, indigo headline, indigo glyph in a corner.
- **Website header:** indigo hero, reverse lockup left, nav links in On Indigo 2, one blue call to action.
- **App icon:** the app mark; it must read at 16 px.
- **Business card (85 × 55 mm):** indigo front with the reverse lockup; rice back.
- **Launch films:** the real product, brand-locked to these tokens; the story is a ladder of real uses, not a metaphor.

## Do's and Don'ts

- Do use rice as the default ground and indigo for headlines and the mark.
- Do keep turmeric to one spark per view: the play, a highlight, a note time.
- Do keep RasanAI Blue for the one primary action, links and selection.
- Do set eyebrows, timecodes and specs in JetBrains Mono caps.
- Do show the real product: real screens, real footage, real decisions.
- Do shape Tamil properly, or use the outlined Tamil wordmark.
- Don't set body text in turmeric, or turmeric on rice.
- Don't use more than one primary button on a screen.
- Don't use gradients, glass, glow or bevels.
- Don't retype, recolour, stretch or rotate the logo.
- Don't use stock "AI" imagery: brains, circuits, sparkles, robots, purple-blue gradients.
- Don't use exclamation marks or hype words in product copy.
