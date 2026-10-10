---
id: "nyt-graphics-and-upshot"
name: "New York Times graphics and The Upshot"
kind: "publication"
era: "Cheltenham system 2003; article redesign 2013; The Upshot launched 22 April 2014"
origin: ["Steve Duenes (graphics director)", "David Leonhardt (founding Upshot editor)", "Amanda Cox (Upshot editor from 2016)", "Matthew Carter (NYT Cheltenham, Franklin)", "Tom Bodkin (design director)"]
palette: {"roles":{"canvas":"#ffffff","ink":"#121212","accent_primary":"one saturated hue per story","context":"#999999 / #cccccc greys"},"logic":"black-and-white page, grey for context, one or two meaningful hues for the data; colour encodes the finding, never the section","evidence":"all hexes proposed: no NYT guideline or chart image was fetched and measured (Commons API rate-limited this session). #121212 is commonly cited for nytimes.com, unverified."}
type: {"display":{"family":"NYT Cheltenham (custom, Matthew Carter, many widths and weights; proprietary)","free_alternative":"Libre Baskerville / Gelasio","weights":[600,700],"case":"mixed","tracking":-0.01,"note":"No OFL Cheltenham exists. Libre Baskerville is the sturdier match for Cheltenham's heavy old-style cut; Gelasio is Georgia-metric and lighter."},"body":{"family":"Georgia for digital body (per Fonts In Use), NYT Franklin for captions, metadata and navigation","free_alternative":"Gelasio / Libre Franklin","weights":[400,500,600],"note":"Libre Franklin is a variable wght 100-900 face: tween 400 to 600 on a highlighted label rather than swapping family."},"rules":["serif headline, serif body, Franklin Gothic for every fact-label","chart annotations in Franklin, direct on the mark","Franklin signals fact, label or navigation; Cheltenham signals narrative"]}
grid: {"columns":"single reading column with wide breakouts","baseline_px":8,"margins":"generous white space","rules":["chart breaks out of the text column","annotation sits on the chart, with a thin leader line","step-by-step scroll states"]}
shape: {"radius":0,"stroke":"hairline axes and gridlines","shadow":"none","imagery":"charts, maps, small multiples, photojournalism"}
texture: "none; paper-white"
motion: {"language":"explanatory, scroll-driven, state changes of one chart","timing_ms":[250,400,700],"eases":{"enter":"power2.out","move":"power2.inOut","exit":"power2.in"},"entrances":["marks tween between states","annotation fades with a leader line drawing","one series highlights, others dim"],"camera":"locked; zoom into a region of a chart or map by scale, not by parallax","signature":"one chart morphing through several states, each with a one-line annotation (the scrollytelling pattern)"}
space: {"2d":"native","3d":"rare; terrain or population columns on a map as a last resort"}
good_for: ["data journalism explainers", "politics, economy, health, housing", "any film where one dataset tells a layered story"]
not_for: ["decorative abstract motion", "brand-led ads", "kinetic type pieces"]
blends_with: ["the-economist-graphics", "financial-times-graphics", "swiss-international"]
clashes_with: ["y2k-chrome"]
cheap_tells: ["Georgia headline set in all caps (the old site's heavy dependence on all-caps Georgia was explicitly replaced by Franklin, per Fonts In Use)", "decorative gradients and drop shadows on bars", "a legend where direct labels would fit", "Playfair as a fake Cheltenham", "annotations without a leader line or without a specific number", "animating for its own sake: every state change must change the argument"]
verified: {"sources_fetched": 4, "non_wikipedia": 2, "colours": "proposed", "colour_images": [], "grid": "proposed", "timings": "proposed", "recipes": "aligned", "edited": "2026-10-03"}
sources: ["https://fontsinuse.com/uses/3907/the-new-york-times-article-redesign-may-2013", "https://en.wikipedia.org/wiki/Cheltenham_(typeface)", "https://en.wikipedia.org/wiki/The_Upshot", "https://gestalten.com/blogs/journal/visualizing-a-new-new-york-times"]
---
## What it is
The New York Times' graphics desk and its Upshot section are the reference for explanatory data journalism. The Upshot debuted on 22 April 2014 with David Leonhardt as founding editor (Amanda Cox from 2016) and about fifteen staff, mixing data visualisation with conventional analysis; graphics director Steve Duenes named it (Wikipedia). Typographically the Times runs on commissioned type by Matthew Carter: a unified NYT Cheltenham headline system from 2003 under design director Tom Bodkin (Wikipedia, Cheltenham), and NYT Franklin for captions, metadata and navigation in the 2013 article redesign, with Georgia retained for digital body text (Fonts In Use).

## The rules that make it this and not something else
- Serif for narrative, grotesque for facts. Cheltenham headlines and Georgia text; Franklin for labels, captions, nav (Fonts In Use; secondary sources frame Franklin as the "this is a fact" voice).
- One dataset, one argument, revealed in states. Marks stay on screen and change; they are not replaced.
- Annotation is part of the chart: a short sentence set directly on the data with a leader line.
- Colour is encoded meaning (party, group, change); non-essential data is grey.
- Charts break out of the column; mobile and desktop versions differ in layout, not in message.
- The Upshot's popular pieces are interactive, but the visual grammar is plain: axes, labels, small multiples.

## Tokens decoded
- Canvas #ffffff; ink #121212 (unverified); greys #999 / #ccc for context; accent hues chosen per story, two at most, saturation moderate.
- Type: Libre Baskerville Bold or Gelasio Bold for headlines (tracking -0.01em); Gelasio 400 body at 20 px (1080p); Libre Franklin 400/600 for labels at 18-22 px, tabular figures.
- Hairlines 1 px #cccccc; leader lines 1 px #121212; no radius; no shadow.
- Spacing: annotations 12 px off the mark; legends replaced by direct labels.

## Motion and camera
Timings are proposed (NYT publishes none); they are tuned for a persistent-marks state machine.

2D (HyperFrames, craft.md vocabulary), a state machine over one SVG chart whose marks have stable ids:
- State 1 (0 to 0.6 s): all marks grey `#999`, stagger 0.012 s per mark, opacity 0 to 1, `power2.out`.
- State 2 (after 2.2 s or more of reading, while the axis labels finish drawing): recolour one group to the accent over 0.4 s `power2.inOut`; the annotation (Libre Franklin 600, 20 px) fades in 0.3 s while its 1 px leader line draws with `stroke-dashoffset` over 0.3 s `power2.out`; non-focus marks dim to opacity 0.35.
- State 3: re-sort or re-scale, marks tween position 0.7 s `power2.inOut` (same elements, never a cut to a second chart); axis ticks cross-fade 0.3 s.
- Numbers: `gsap.to(obj, { val, snap: { val: 1 }, duration: 0.8, ease: "power2.out" })` with `font-variant-numeric: tabular-nums`.
- Camera: locked. Map or chart zoom is a uniform scale of the chart group 1.0 to 1.8 in 0.9 s `power3.inOut`, with `vector-effect: non-scaling-stroke` so hairlines stay 1 px. Grade: none. Sound: a soft tick on each state change, no whoosh.
3D (Rasan3D, only when the data is volumetric): orthographic-feeling columns on a map plane. `k.instanceField` is for endless fields, so instead place `InstancedMesh` columns from `k.THREE` with `k.material("matte", { color: "#cccccc" })`, one accent group set to the accent colour, `k.rig("top-soft")`, `environment: "soft"`, camera `lens: [[0, 85]]` (long lens flattens perspective), `pos` raised 35 to 45 degrees, no bloom. Column heights tween with `k.prog(t, a, b, "power2.inOut")` in `pose`. Labels stay DOM, placed with `k.toScreen` in `onDraw`.

## How to instruct a model to build it
"White canvas, ink #121212. Headlines in Libre Baskerville Bold, body in Gelasio, every chart label and annotation in Libre Franklin 600 with tabular numerals. One dataset persisted across states: the same SVG marks (stable ids) tween between states, they are never replaced. Grey #999 for everything except the group the narration is about, which takes one accent hue. Annotations are one sentence with a specific number, placed on the chart with a 1 px leader line. No legends, no gradients, no shadows, no rounded bars. Each state reads at least 2.2 s while something in it keeps acting (a label draws, a mark recolours); transitions 400 to 700 ms power2.inOut." Claude tends to cross-fade between separate charts: require persistent element ids. GPT-style outputs tend to add chart junk (gradients, shadows, 3D bars): ban it. (Tendencies carried from the earlier pass; not re-tested here.)

## Blending notes
Carries: persistent-marks morphing, direct annotation, serif/grotesque split, grey-plus-one-hue colour logic. Pairs with `the-economist-graphics` and `financial-times-graphics` for finance flavours, with `swiss-international` for infrastructure. Breaks with decorative motion, glow, or any style where type is the hero. Cheltenham-like headlines plus Franklin labels is the recognisable pairing: if a blend replaces both with one grotesque, the NYT reading is gone.

## Sources
- https://fontsinuse.com/uses/3907/the-new-york-times-article-redesign-may-2013 — Cheltenham, Stymie and Karnak for headlines, NYT Franklin for meta and navigation, Georgia retained for text (fetched).
- https://en.wikipedia.org/wiki/Cheltenham_(typeface) — 2003 Cheltenham system, Tom Bodkin engaged Matthew Carter (fetched).
- https://en.wikipedia.org/wiki/The_Upshot — launch, founding staff of fifteen, Leonhardt then Cox as editor in 2016 (fetched).
- https://gestalten.com/blogs/journal/visualizing-a-new-new-york-times — Amanda Cox profile: graphics team under Steve Duenes, Cox hired 2005, editor of The Upshot from 2016 (fetched).
- Not used: dailynorthwestern.com and urban-institute.medium.com (403 to curl); the designyourway page from the earlier pass was never read and is dropped.
