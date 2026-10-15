---
name: "Counting House"
description: "Receipts, audited: a pale ledger-paper ground, banknote green-black ink and one vermilion stamp, set in a grotesk with a point of view and a plain mono for figures."
colors:
  canvas: "#e9efe6"      # ledger paper, a green-grey tint (FT paper logic, not pink)
  ink: "#10231c"         # banknote green-black: all text and rules
  accent: "#d4392b"      # the vermilion stamp: one per frame, only on the thing that was checked
  support: "#1f6f54"     # guilloche green: engraved line work and secondary figures
  surface: "#f7faf4"     # the receipt itself, a stock lighter than the ground
  muted: "#5d6f66"       # captions, row labels
  rule: "#b8c6bb"        # ledger rules and cell borders
typography:
  display:
    fontFamily: Bricolage Grotesque
    fontWeight: 700
  body:
    fontFamily: IBM Plex Sans
    fontWeight: 400
  mono:
    fontFamily: IBM Plex Mono
    fontWeight: 500
rounded:
  sm: 2px
  md: 2px
  pill: 999px
shadows:
  card: "0 1px 0 #b8c6bb, 0 14px 30px rgba(16,35,28,0.10)"
components:
  receipt: { backgroundColor: "{colors.surface}", textColor: "{colors.ink}", rounded: "{rounded.md}", typography: "{typography.mono}" }
  stamp: { backgroundColor: "{colors.accent}", textColor: "{colors.surface}", rounded: "{rounded.sm}", typography: "{typography.display}" }
  ledger-row: { backgroundColor: "{colors.canvas}", textColor: "{colors.ink}", typography: "{typography.mono}" }
  stat-figure: { textColor: "{colors.ink}", typography: "{typography.display}" }
---
# Counting House

## Overview

Counting House draws a finance product the way an auditor's desk looks: ledger paper, engraved guilloche line work, a rubber stamp that means "checked". It blends the Financial Times' paper-and-chart restraint with banknote engraving and the one-hot-accent logic of Saul Bass, because the story is about receipts becoming trustworthy numbers and the audience (bookkeepers and small-business owners) already trusts paper. It is deliberately not a fintech gradient: nothing glows, nothing is rounded to a pill, and the accent is rationed to a single stamp per frame.

## Colors

- **canvas** `#e9efe6` is the ledger ground, never pure white. **surface** `#f7faf4` is the receipt or the card sitting on it.
- **ink** `#10231c` for all text and rules (contrast on canvas above 12:1). **support** `#1f6f54` for engraved line work, guilloche borders and secondary figures.
- **accent** `#d4392b` is the stamp: it appears once per frame, on the number or the word that was verified. It never fills a background and never sits on text smaller than 40 px.
- **muted** `#5d6f66` for captions; **rule** `#b8c6bb` for ledger lines.

## Typography

- Display: Bricolage Grotesque 700 (Google Fonts), tight tracking (-0.02em), sentence case; headline sizes jump by 2x or more.
- Body: IBM Plex Sans 400. Figures and receipt lines: IBM Plex Mono 500 with tabular numerals, never proportional.

## Layout and shape

12-column ledger grid with a 96 px margin; rows ruled at 1 px `rule`, text aligned to a strong left axis, totals right-aligned on a decimal. Radii 2 px (a cut sheet, not a button); 2 px engraved strokes in `support`. Texture: a faint paper grain on canvas only; guilloche rosettes as 1 px line work at 8% opacity behind totals. The receipt is photographed flat, straight on, slightly larger than life.

## Components

- **receipt**: surface stock, 2 px radius, shadow `card`, mono lines, perforated top edge.
- **stamp**: accent block with surface text, rotated -4 degrees, lands with a 40 ms squash.
- **ledger-row**: canvas background, one 1 px rule, mono figures; rows count up from 0 in the story's currency.
- **stat-figure**: display 700 at 11 cqw, the only element allowed to exceed the grid margin.

## Motion and camera

- **2D language (precise, ledger-tight).** Duration scale 120 / 200 / 320 / 480 ms; stagger 50 ms between rows; every element holds at least 600 ms before it leaves. Enter `power4.out` (rows slide 24 px in from the left edge of the ruled column), exit `power3.in`, move `expo.inOut`. Signature entrance: the **stamp** lands in 80 ms on `power4.out`, with a 4 px settle and a 1 frame paper shake in the receipt behind it. Totals count up on `power3.out` over 720 ms and stop on the stamp.
- **Banned:** fade-up-slide, bounce, overshoot, blur-in, any glow.
- **Camera (flat scenes).** Locked, straight-on; the only camera move is a 6% push (scale 1.0 to 1.06 over 2.4 s, `sine.inOut`) on the receipt while its total counts. Parallax in three layers only when the paper is lifted: ground 0.2, receipt 1, stamp 1.4.
- **3D camera grammar (when a beat wants depth).** After Kubrick's one-point symmetry: the receipt as a tall card standing in a long ruled corridor, camera on the centre axis, 24 mm lens at 0.6 m height, level, no roll, a slow dolly in over 8 s on `power1.inOut`, ending on a 50 mm close-up of the stamp. Light: one key from upper left, `#fff1e0`, soft shadow, no rim.
- **Continuity.** A paper edge becomes a ledger rule at every cut; the stamp's rotation (-4 degrees) is carried between scenes.

## Do's and Don'ts

- Do keep the stamp single and rationed: one accent mark per frame, on the verified thing.
- Do set every figure in mono with tabular numerals and right-align totals on the decimal.
- Do let the paper be photographed straight on and larger than life.
- Do hold a finished total for at least 600 ms before anything else moves.
- Don't use a gradient, a glow or a pill-shaped button anywhere.
- Don't put the accent on a background or on text under 40 px.
- Don't centre the layout: align to the left axis of the ledger.
- Don't use bounce, overshoot or blur-in on any entrance.

## Signature features

1. Every figure is set in the mono face and aligns on the decimal.
2. Ledger rules are 1 px and run the full width of the plate.
3. The vermilion stamp appears once per scene, never as a fill.
4. Paper grain is visible on every plate.
5. Nothing fades in: entrances are slides on the 8 px grid.
