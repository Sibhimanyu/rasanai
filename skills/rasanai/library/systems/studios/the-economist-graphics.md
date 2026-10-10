---
id: "the-economist-graphics"
name: "The Economist chart and graphics style"
kind: "publication"
era: "red nameplate 1959; chart style revised 2017; data team 2015-present, London"
origin: ["Reynolds Stone (nameplate)", "The Economist data and graphics teams"]
palette: {"roles":{"canvas":"#f5f4f0","ink":"#0d0d0d","accent":"#e3120b","muted":"#999999","muted_light":"#bbbbbb","tint_red":"#ff9999"},"logic":"one story, one red: only the data the story is about gets full Economist red; context goes grey or 30-50% opacity","evidence":"#e3120b, #0d0d0d, #f5f4f0 stated in text at https://aecharts.com/blog/posts/how-to-create-charts-like-the-economist/ (secondary, fetched 2026-10-03). Greys #999999 / #bbbbbb and tint #ff9999 are proposed (not in a fetched source). Official guide PDF 403, no chart image was sampled."}
type: {"display":{"family":"Econ Sans (proprietary, not public per ggthemes)","free_alternative":"Roboto Condensed / Archivo Narrow","weights":[400,600,700],"case":"mixed","tracking":0,"note":"ggthemes says any narrow humanist sans will do. Roboto Condensed is variable (wght 100-900); Archivo Narrow has wght 400-700. Fira Sans Condensed is also on Google Fonts (static weights)."},"body":{"family":"same sans, small","free_alternative":"Roboto Condensed","weights":[400,500]},"rules":["title bold, subtitle semi-bold at about half the title size, labels and ticks 9-11 px in print charts","direct labels on the data instead of a legend","source line on every chart","y-axis labels on the right"]}
grid: {"columns":"single chart panel","baseline_px":4,"margins":"tight; red rule across the top with a small red rectangle at the left end","rules":["one chart one message","only horizontal light gridlines","black x-axis baseline with ticks below","no y-axis line or ticks"]}
shape: {"radius":0,"stroke":"thin red top rule; hairline grey gridlines","shadow":"none","imagery":"charts and maps, witty illustrated covers"}
texture: "flat; chart plot area is white on a pale ground (2017 design)"
motion: {"language":"explanatory, restrained, dry","timing_ms":[300,500,900],"eases":{"enter":"power2.out","move":"power2.inOut","exit":"power2.in"},"entrances":["axis draws, then series wipes left to right","bar grows from baseline","highlight series recolours to red while others fade to grey"],"camera":"locked; occasional pull-in on one annotated point","signature":"the red tag and rule lands first; the red series is the last element to colour"}
space: {"2d":"native","3d":"not natural; if used keep orthographic data-in-space with the same one-red logic"}
good_for: ["data explainers, economics, B2B analysis, policy, finance", "any film with a chart that must make one clear point"]
not_for: ["emotional brand storytelling", "playful consumer launch"]
blends_with: ["financial-times-graphics", "nyt-graphics-and-upshot", "swiss-international"]
clashes_with: ["frutiger-aero"]
cheap_tells: ["rainbow series colours: the real system has one red plus greys", "red used decoratively on titles and rules everywhere instead of on the one story datum", "chart with a legend box instead of direct labels", "3D bars or gradient fills", "missing source line", "Helvetica Bold at 60 px as a fake Econ Sans: the original is narrow and light on the chart page"]
verified: {"sources_fetched": 3, "non_wikipedia": 2, "colours": "partial", "colour_images": [], "grid": "proposed", "timings": "proposed", "recipes": "aligned", "edited": "2026-10-03"}
sources: ["https://aecharts.com/blog/posts/how-to-create-charts-like-the-economist/", "https://jrnold.github.io/ggthemes/reference/theme_economist.html", "https://en.wikipedia.org/wiki/The_Economist"]
---
## What it is
The Economist treats charts as arguments. Wikipedia credits it with early data journalism (trade figures from 1843, a first non-letter chart in November 1854) and says its graphs were fire-engine red in the 1980s and moved to a thematic blue from 2001; a dedicated data journalism department was established in 2015, and a "Graphic Detail" feature ran from October 2018 to November 2023. The red nameplate was designed by Reynolds Stone in 1959. The chart look described here is the 2017 style: a red rule with a small red tag at the top left, a bold title, a lighter subtitle, a white plot on a pale ground, light horizontal gridlines only, and a source line.

## The rules that make it this and not something else
- One chart, one message; the title states the point, often with a dry joke (aecharts).
- The primary datum gets full red; supporting data goes grey or 30-50% opacity (aecharts).
- Direct labelling replaces legends; numbers sit on or near the marks; only essential gridlines show.
- Axes: black x baseline with ticks below it, no y-axis rule or ticks, y labels on the right (ggthemes).
- Title about 18-22 px bold, subtitle about half that, labels and ticks 9-11 px (aecharts).
- Red rectangle above the title is a recognised signature and must be drawn by hand in code (ggthemes notes it needs manual addition).
- Hierarchy is typographic, not decorative: no icons, no boxes, no shadows.

## Tokens decoded
- Canvas #f5f4f0 (page) with a white plot area; ink #0d0d0d; red #e3120b; greys #999999 and #bbbbbb; light red tints #ff9999 / #ff6b6b for secondary series. Third-party values.
- Type: Roboto Condensed (title 700, labels 400). Sizes at 1080p scale up about 2x: title 40, subtitle 22, labels 20 min so the video is readable.
- Rules: top red rule 3 px with a 28 by 14 px red tag at left; gridlines 1 px #bbbbbb at 60% opacity; axis baseline 2 px #0d0d0d.
- Radius 0, no shadows.

## Motion and camera
Timings are proposed; The Economist's charts are static in print, and no source gives animation values.

2D (HyperFrames, craft.md vocabulary):
- 0.0 to 0.45 s: the 3 px red rule draws left to right (`scaleX` 0 to 1 from the left, `power2.out`, 0.4 s); the 28x14 px red tag is already at its left end. Title mask-rises (`yPercent` 100 to 0 inside an overflow-hidden line) 0.45 s `expo.out`, subtitle follows at +0.1 s.
- 0.6 s: axes and light gridlines fade 0.3 s; y labels on the right.
- 0.9 s: all series wipe in left to right in grey (`clip-path: inset(0 100% 0 0)` to `inset(0)`) 0.7 s `power2.inOut`.
- 1.9 s: the story series recolours grey to #e3120b over 0.4 s `power2.inOut` while the others hold (or drop to 40 percent opacity). This recolour is the beat; put the sound accent (one soft tick) on it.
- Annotation: one line, 6 words at most, fades 0.3 s with a 1 px leader; reads 2 s minimum while its leader finishes drawing. Counters tick with `snap` at the data's own precision.
- Camera: locked. At most a 4 percent push (`scale` 1 to 1.04, 6 s, `sine.inOut`) on the chart group; one pull-in to a single annotated point (scale 1.6, 0.9 s `power3.inOut`, non-scaling strokes) is the largest allowed move. Grade: none; the off-white ground is the whole look.
3D (Rasan3D), only if the film mixes in space: keep the chart flat on a facing plane with `k.panel({ width, height, depth: 0.02, radius: 0, texture })` or, better, keep it in DOM and place it with `k.pinDom(el, { at: <panel mesh>, width, height, px, face: "object" })`, `k.rig("top-soft")`, `environment: "soft"`, `lens: [[0, 85]]`, no bloom. The red series can be an `emissive` strip only if kept below bloom threshold. Do not extrude bars with gloss.

## How to instruct a model to build it
"Chart on #f5f4f0 with a white plot area. Top: 3 px #e3120b rule across the chart with a small #e3120b rectangle (28x14 px) at its left end; below it a bold title (Roboto Condensed 700, 40 px, #0d0d0d), a subtitle at 22 px 600. Light horizontal gridlines only (1 px, #bbbbbb at 60 percent), black x baseline with ticks below, no y-axis line, y labels on the right. All series grey #999999 except the one the story is about, #e3120b. Label series directly on the lines; no legend. Source line bottom-left 16 px. Animate: rule draws 0.4 s, title mask-rise 0.45 s expo.out, axes fade 0.3 s, series wipe left to right in grey over 0.7 s power2.inOut, then recolour the story series red over 0.4 s. No gradients, shadows or rounded corners." Claude tends to add a legend and a five-hue palette; GPT-style outputs add glow lines (carried from the earlier pass, not re-tested). State "one red, everything else grey" as a hard rule.

## Blending notes
Carries: red-for-the-story-only, direct labels, tag-and-rule opener, off-white ground. Blends cleanly with `financial-times-graphics` (swap red for salmon and navy) and `nyt-graphics-and-upshot`, and with `swiss-international` grids. Breaks if a second saturated accent is introduced, or if the red is spread onto titles and decoration.

## Sources
- https://aecharts.com/blog/posts/how-to-create-charts-like-the-economist/ — #e3120b, #0d0d0d, #f5f4f0; title about 2x subtitle; reserved red; direct labels (fetched; secondary).
- https://jrnold.github.io/ggthemes/reference/theme_economist.html — 2017 structure: white plot on pale ground, horizontal gridlines only, black x baseline with ticks below, right-hand y axis, red tag, Econ Sans not public (fetched).
- https://en.wikipedia.org/wiki/The_Economist — red nameplate by Reynolds Stone, 1959 (fetched).
- Blocked: economist.com/graphic-detail (Cloudflare challenge), official chart guide PDF (403). No chart image was sampled, so colours are "partial" (stated hexes only).
