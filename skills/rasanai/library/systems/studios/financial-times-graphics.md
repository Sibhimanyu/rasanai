---
id: "financial-times-graphics"
name: "Financial Times pink paper and chart style"
kind: "publication"
era: "pink paper since 2 January 1893; Financier typeface for the 2014 redesign; Visual Vocabulary 2016-"
origin: ["Financial Times", "FT Visual Journalism team", "Kris Sowersby (Klim Type Foundry, Financier)"]
palette: {"roles":{"ground":"#fff1e5","ink":"#33302e","structure":"#0f5499","accent":"#990f3d","pink":"#fcd0b1","teal":"#0d7680"},"logic":"warm salmon-paper ground, claret and oxford blue as brand identifiers, teal as the action colour; colour is calm and warm, not bright. The ground is the paper, not an accent","evidence":"hex values as listed at https://oh-my-design.kr/design-systems/ft (third-party, fetched 2026-10-03; consistent with the Origami o-colors names paper, claret, oxford in a search summary that was not itself opened). Not measured from an image; no official FT PDF fetched. The navy-for-rules role comes from designbycurio and is a proposed use of oxford #0f5499 or slate #262a33."}
type: {"display":{"family":"Financier Display (Kris Sowersby, Klim; commercial; variable 200-800 per a third-party page)","free_alternative":"Newsreader / Libre Caslon Display","weights":[400,500],"case":"mixed","tracking":-0.01,"note":"Klim: Financier Display takes Perpetua's stately charm, Text draws on Solus and Joanna, from Gill letterforms. Newsreader (opsz + wght axes, 200-800) is the nearest free text-and-display family; Libre Caslon Display is single-weight 400."},"body":{"family":"Financier Text for articles; Metric (Klim) for functional UI per a third-party page; Georgia fallback","free_alternative":"Source Serif 4 / Hanken Grotesk","weights":[400,500,600],"note":"Hanken Grotesk is variable wght 100-900; use it for chart labels as the Metric stand-in."},"rules":["serif headlines, sans chart labels","hairline rules between columns","blue-black rules, not pure black","Financier has separate optical variants for display and text"]}
grid: {"columns":"multi-column, hairline-ruled","baseline_px":8,"margins":"dense, newspaper margins","rules":["columns separated by thin rules","chart sits in its column with a headline and a one-line standfirst","source line beneath"]}
shape: {"radius":0,"stroke":"hairline 0.5-1 px rules","shadow":"none","imagery":"charts, maps, studio portraits, illustrated opinion art"}
texture: "paper tint is the texture: a flat warm pink field; no grain required"
motion: {"language":"measured, authoritative","timing_ms":[250,450,800],"eases":{"enter":"power2.out","move":"power2.inOut","exit":"power2.in"},"entrances":["line draws left to right","bars rise from baseline","column rules draw before text"],"camera":"locked; slow lateral pan across a long time series","signature":"the salmon field itself: the film starts and ends on the colour"}
space: {"2d":"native","3d":"limited: paper-fold or stacked newsprint planes, flat charts as sheets in space"}
good_for: ["finance, markets, business explainers, B2B research", "long time-series stories", "serious but warm"]
not_for: ["youth culture", "playful consumer", "dark-mode tech"]
blends_with: ["the-economist-graphics", "nyt-graphics-and-upshot", "newspaper-broadsheet"]
clashes_with: ["brutalist-web"]
cheap_tells: ["hot pink or magenta instead of a dusty salmon", "pink applied to buttons and highlights on a white page: in the FT the colour is the paper, not an accent", "sans-serif headlines", "bright blue charts", "no source line or chart title that is not a claim"]
verified: {"sources_fetched": 5, "non_wikipedia": 4, "colours": "partial", "colour_images": [], "grid": "proposed", "timings": "proposed", "recipes": "aligned", "edited": "2026-10-03"}
sources: ["https://en.wikipedia.org/wiki/Financial_Times", "https://klim.co.nz/retail-fonts/financier-display/", "https://github.com/Financial-Times/chart-doctor", "https://oh-my-design.kr/design-systems/ft", "https://designbycurio.com/learn/financial-times-pink-paper"]
---
## What it is
The Financial Times prints on salmon-pink paper, adopted on 2 January 1893 to distinguish it from the similarly named Financial News; Wikipedia adds that the tint came from Cornish china clay and that, at the time, it was cheaper not to bleach the paper. A third-party design guide (designbycurio) describes the digital system as a warm salmon ground, deep navy for headers and rules, and sparing claret, set in Financier, a serif Kris Sowersby drew for the 2014 redesign. The FT's chart culture is formalised in the Visual Vocabulary, a reference poster from the FT visual journalism team that sorts 40-plus chart types by purpose, hosted with the Chart Doctor sample files in an MIT-licensed GitHub repository (content copyright FT).

## The rules that make it this and not something else
- The ground is the identity. A warm, slightly dusty salmon; "authoritative rather than bright or energetic" (designbycurio).
- Navy carries structure (rules, masthead elements, section heads), not black.
- Claret is used rarely (bylines, small accents).
- A serif for words, a sans for numbers: Financier for headlines and text; Klim describes Financier as drawn on Eric Gill-influenced letterforms with Perpetua-like display cuts, 12 styles from Light 300 to Black 900.
- Hairline column rules, no boxes.
- Charts follow the Visual Vocabulary: pick the form by the relationship (deviation, correlation, ranking, distribution, change over time, part-to-whole, magnitude, spatial), then draw it plainly.
- Chart Doctor discipline: title states the finding, minimal ink, labelled directly.

## Tokens decoded
- Ground: salmon pink; start from #fff1e5 (unverified) and adjust to taste; ink #33302e (unverified); navy: use a deep navy such as #1b2a49 as a stand-in (unverified); claret #990f3d (unverified, from memory of FT palettes).
- Type: Newsreader or Source Serif 4 for headlines (500, tracking -0.01em), Hanken Grotesk 400 for chart labels at 20 px minimum in 1080p video.
- Hairlines 1 px navy at 40% opacity; no corner radius; no shadows.
- Chart series: one navy, one claret, greys for context; dashed for forecasts.

## Motion and camera
Timings are proposed (the FT publishes charts, not motion specs).

2D (HyperFrames, craft.md vocabulary), field first:
- 0 to 0.3 s: hairline column rules draw (`scaleY` 0 to 1 from top, 0.3 s `power2.out`, stagger 0.06 s), 1 px at 40 percent opacity.
- 0.3 s: headline (Newsreader 500) mask-rises 0.45 s `expo.out`; standfirst one line fades 0.3 s.
- 0.8 s: series draw as strokes (`stroke-dashoffset` to 0, 0.8 s `power2.inOut`), bars rise from the baseline (`scaleY` from the bottom, 0.5 s `power2.out`, stagger 0.03 s). One claret highlight, the rest oxford or grey.
- Long time series: pan right at constant speed (`ease: "none"`, 6 s) with the latest value pinned to the right edge by a label; this is the one place linear is correct.
- Annotation: one line, serif italic 22 px, reads 2 s while the marks keep settling into place. Between charts: a straight cut, or a 0.3 s cross-fade where the salmon field stays and only the marks change.
- Camera: locked; grade: none. The film starts and ends on the bare #fff1e5 field (the colour is the signature). Sound: paper-quiet, a soft tick on the highlight.
3D (Rasan3D, 3d.md sections 5, 6): flat sheets in space, never glossy.
- Sheets: thin boxes (depth 0.01) or `k.panel({ width: 3.2, height: 2.2, depth: 0.01, radius: 0, texture })` with `k.material("paper", { color: "#fff1e5" })`; stacked 0.15 apart in z. `k.rig("window", { dir: [-0.4, 0.8, 0.5], shadowSoftness: 6 })`, `environment: "soft"`, `k.ground({ shadowOpacity: 0.25 })`.
- Camera keys: `lens: [[0, 50]]`, `pos: [[0, [0, 0.4, 6]], [8, [2.4, 0.4, 6], "sine.inOut"]]` tracking along the stack, `fstop: 5.6` focused on the front sheet, `shift: [[0, [0, 0]]]` kept zero so charts stay square.
- Chart text stays DOM, placed with `k.pinDom(el, { at: sheet, width: 3.0, height: 2.0, px: [960, 540], face: "object", offset: [0, 0, 0.02] })` so it remains crisp. Do not bloom; the scene should read as print.

## How to instruct a model to build it
"Full-frame warm paper-pink ground #fff1e5, slightly dusty, never bright. Claret #990f3d for one small accent, oxford #0f5499 for series and rules, ink #33302e. Headlines in Newsreader 500 (tracking -0.01em), chart labels in Hanken Grotesk 500 at 20 px minimum. 1 px hairline rules at 40 percent opacity separate columns. Chart: the title is a claim; plain line or bar in oxford, one claret highlight, grey context; direct labels; source line beneath. Animate rules first, then headline, then series; no glow, no gradient, no rounded boxes." Claude tends to pick a hot pink: say "the ground is the paper, #fff1e5, not a highlight". (Carried from the earlier pass.)

## Blending notes
Carries: coloured ground as brand, serif plus sans pairing, hairline rules, finding-as-title. Blends with `the-economist-graphics` (replace the red tag with claret) and `nyt-graphics-and-upshot`. Breaks against glossy or dark looks, where the salmon reads as a pastel filter. Pink on a white page is the cheap version; here white is the exception.

## Sources
- https://en.wikipedia.org/wiki/Financial_Times — pink paper from 2 January 1893 (fetched, earlier pass; not re-read in this edit, retained as it was already verified).
- https://klim.co.nz/retail-fonts/financier-display/ — Financier by Kris Sowersby, drawn for the 2014 FT redesign, Gill/Perpetua/Joanna lineage, release 2016 (fetched).
- https://github.com/Financial-Times/chart-doctor — Visual Vocabulary and Chart Doctor files (fetched).
- https://oh-my-design.kr/design-systems/ft — hex palette (paper #fff1e5, claret #990f3d, oxford #0f5499, black-80 #33302e, teal #0d7680) and font names (fetched; third-party).
- https://designbycurio.com/learn/financial-times-pink-paper — palette roles and hairline columns (fetched in the earlier pass; third-party).
