# Data in motion: honesty and readability

Rules for any chart, count-up or number on screen in a film. They are about telling the truth and being readable at film speed; look and motion come from the film's own system and `library/styles/dataviz.md`. Written in our words from common chart practice; no source text is carried.

## 1. Choose the form by the number of points

- Under 3 values: no chart. A stat card (one big number, one label, one comparison) is the honest form; a chart of two bars is a decoration.
- 3 to 7 marks: a bar, dot or line chart. Never more than 5 to 7 marks per frame that the viewer is meant to read; beyond that, highlight one and push the rest to a quiet grey (or show the count and the shape, not the marks).
- A trend over time: a line, and label the END (the last value, written next to the line's end), not a legend.
- Parts of a whole: a single stacked bar or a 2 to 4 slice share; a pie only for two or three slices and never animated by sweep alone.
- Many values to show scale (a million users): count them, do not chart them (a grid of dots; one lit).

## 2. Honest axes

- Bars start at ZERO. A truncated bar axis is a lie; if the change is small, show the change as its own number.
- One y axis. No dual axes (two scales on one frame let you make any two lines cross). No 3D, no tilt, no perspective on a chart.
- A line chart may start off zero only if the baseline is labelled and the film says what it is.
- Do not stretch a colour ramp to exaggerate: pale values stay pale. A diverging ramp is centred on a meaningful reference, a sequential ramp has one hue.
- Scale changes in motion (a rescale to fit new data) are visible operations: the axis labels change on screen, they do not jump.

## 3. Labels and marks

- Direct labels at the end of lines and the top of bars; a legend only when a direct label cannot fit.
- Numbers use tabular figures, the same decimals everywhere, units once. A displayed sum must add up exactly: round so the arithmetic on screen is true (state "of 100", do not let 33.3 + 33.3 + 33.3 show as 99.9 without a rounding note).
- Marks are at least 8 px wide at 1080p and 4 px in stroke; text is at least 0.04 of the frame height (`RasanUI.check` and `textfit.mjs` hold it to that).
- Every colour means one thing for the whole film. A highlight colour is the only saturated hue in the frame.

## 4. Colour that survives

- Categorical colours: at most 5 on a frame; choose them so that adjacent marks differ in lightness as well as hue, and never rely on red against green alone (about 1 in 12 men cannot tell them apart). Test by converting the frame to greyscale: the marks must still be told apart.
- Use shape, position or a direct label as the second channel when there are 4 or more categories.
- Contrast of marks and labels against the ground at least 3:1; body text at least 4.5:1.
- Chart colours are tokens, not taste. The design system carries `chart_palette`: an ordered list of up to 6 hex values (`[c1..c6]`) plus `chart_neutral` (the quiet grey for everything not highlighted) and `chart_highlight` (the one accent). Order matters: c1 is the series that matters, then maximum-distance steps. They derive from the brand's accent and ink (never a rainbow), each at least 3:1 against the canvas, and an adjacent pair at least dE 20 apart in OKLab. In dark mode the palette is re-derived, not inverted.

## 5. Timing

- A chart that must be read holds at least 3 s with the data fully drawn (a headline-number count-up holds at least 1.6 s on the final value).
- Draw order is the argument: axes, then data, then the one highlight, then the annotation. Marks land in the order the story needs, not left to right by default.
- Count-ups end on the exact true value (never an eased overshoot past it) and finish before the voice says the number.
- Anything that moves while the viewer reads (a drifting axis, a wobbling bar) is wrong. The ground may breathe; the chart is still.

## 6. Checks before a chart ships

1. Could this be a stat card? 2. Zero baseline for bars? 3. One axis? 4. Every mark labelled directly? 5. The sum on screen exact? 6. Greyscale test passes? 7. Held 3 s? 8. Is the highlight the point the line of narration makes?

Cross-references: `library/styles/dataviz.md` (a look for chart films), `library/motion/data-viz/` (motion recipes), `references/craft.md` (budgets).
