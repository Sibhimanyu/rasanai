---
id: "spotify-wrapped"
name: "Spotify Wrapped (personal data as shareable story cards)"
kind: "product-ui"
era: "2015 concept; 'Wrapped' name 2016; story format 2019; 10th anniversary edition 2024"
origin: ["Spotify brand design: Rasmus Wangelin (global head of brand design), Rebecca Lim (global design director), Marc Hazan (VP marketing)"]
palette: {"roles":{"canvas":"#0a080b","ink":"#ffffff","red":"#d91f25","pink":"#f52ca8","pink_light":"#ee88c6","cyan":"#07b0ed","yellow":"#fdf000","dark_red":"#630e09"},"logic":"each year changes; 2024 is a limited high-contrast palette (red, hot pink, cyan, yellow on near-black) with gradients in backgrounds and numerals, while text stays on flat colour","evidence":"measured from the It's Nice That 2024 project images (verified.colour_images), k-means 6, 2026-10-03: #d91f25 12%, #f52ca8 12%, #ee88c6 14%, #07b0ed 36%, #0a080b 32%, #fdf000 52% (image 8), #630e09 18%. The earlier proposed canary yellow was right, the proposed blood red/pink were close; cyan is new. White ink is proposed. #1db954 Spotify green is not seen in these frames and is dropped."}
type: {"display":{"family":"Spotify Mix (bespoke, debuted in Wrapped 2024); Circular Sp UI Bold (2019 era)","free_alternative":"Bricolage Grotesque / Archivo","weights":[400,700,800],"case":"mixed or upper","tracking":-0.03,"note":"Bricolage Grotesque has opsz, wdth and wght axes (wght 200-800): tween wdth and wght to get the looping, stretching type. Archivo has wdth and wght (100-900). Anton is single-weight 400 and also on Google Fonts for condensed numerals."},"body":{"family":"Circular / Spotify Mix","free_alternative":"Inter","weights":[400,700],"case":"mixed","tracking":0},"rules":["type is the main graphic element: oversized numbers, looped and cloned forms","ultra-bold to condensed in one family (Spotify Mix range)","text on flat colour for legibility, gradients reserved for backgrounds and numerals","one panel introduces a theme, a plain text panel states the fact, a share screen adds a surprise layout"]}
grid: {"columns":"single column story, 9:16","baseline_px":8,"margins":"6 to 8 percent; large type bleeds off","rules":["one fact per card","each card shareable alone","card sequence: animated intro, simple statement, reveal"]}
shape: {"radius":"large and rounded on cards (24 to 40 px at 1080 wide, proposed)","stroke":"none","shadow":"none","imagery":"artist imagery layered with geometric patterns and cloned type forms"}
texture: "none to light grain; flat colour fields and gradients"
motion: {"language":"loopy, bouncy, celebratory, fast","timing_ms":[200,400,700,1200],"eases":{"enter":"back.out(1.4)","move":"power3.inOut","exit":"power2.in"},"entrances":["number scales up with overshoot","type clones and tiles into a pattern","wipe between cards on beat"],"camera":"locked 2D","signature":"looping and transforming bold type across the canvas, with personalised data as the content"}
space: {"2d":"native","3d":"limited; 3D models appeared in the 2017-2018 editions (brightly coloured 3D models, oversized text)"}
good_for: ["year-in-review and personal data stories", "social-first 9:16 recaps", "campaign reveals with numbers", "celebratory consumer moments"]
not_for: ["sober B2B", "luxury restraint"]
blends_with: ["nike-brand-motion", "dia-modular-kinetic-type", "memphis-milano", "swiss-international"]
clashes_with: ["apple-product-films", "linear-vercel-stripe-brand-systems"]
cheap_tells: ["a rainbow gradient with small text on top (the 2021 maximal chaos the sources call unreadable)", "oversized type that is merely distorted instead of designed (looped, cloned, patterned)", "one effect per card with no theme-statement-share rhythm", "numbers that do not look personal: no named artist, minutes or rank", "stock confetti"]
verified: {"sources_fetched": 4, "non_wikipedia": 3, "colours": "measured", "colour_images": ["https://m.itsnicethat.com/original_images/Spotify-Wrapped-2024-Graphic-Design-Project-itsnicethat-1.png", "https://m.itsnicethat.com/original_images/Spotify-Wrapped-2024-Graphic-Design-Project-itsnicethat-3.jpg", "https://m.itsnicethat.com/original_images/Spotify-Wrapped-2024-Graphic-Design-Project-itsnicethat-4.jpg", "https://m.itsnicethat.com/original_images/Spotify-Wrapped-2024-Graphic-Design-Project-itsnicethat-5.jpg", "https://m.itsnicethat.com/original_images/Spotify-Wrapped-2024-Graphic-Design-Project-itsnicethat-8.png"], "grid": "proposed", "timings": "proposed", "recipes": "aligned", "edited": "2026-10-03"}
sources: ["https://www.itsnicethat.com/features/spotify-wrapped-2024-graphic-design-041224", "https://newsroom.spotify.com/2024-12-04/10-years-spotify-wrapped/", "https://www.alexjimenezdesign.com/blog/three-design-elements-that-made-spotify-wrapped-2024-great-b70b8", "https://en.wikipedia.org/wiki/Spotify_Wrapped"]
---
## What it is
Spotify Wrapped is an annual personalised recap of listening, now a cultural event. Per the Spotify newsroom it began in 2015 (over 5 million users), became "Wrapped" in 2016, moved into the app in 2019 and reached 184 markets by 2024. Wikipedia places the story-format redesign in 2019, with podcasts, quizzes and badges added in 2020. The design language changes yearly; this entry encodes the 2024 edition (10th anniversary) and the through-line.

## The rules that make it this and not something else
- Theme per year. 2024: "reinvention and evolution" (Wangelin, It's Nice That), tied to genre collisions, with teased logos for cultural moments.
- Bespoke type as the graphic: Spotify Mix debuted in Wrapped in 2024, "looping and transforming" across the canvas (It's Nice That). It runs from ultra-bold to condensed.
- Limited high-contrast palette with gradients, text on flat colour; a return to the 2018 approach (Jimenez; Envato).
- Type as form, not distortion: numbers blown up, gradient-filled, cloned and repeated to build patterns (Jimenez).
- Three-beat variety: animated theme panel, simple text panel, surprise share layout (Jimenez).
- History (Envato): 2016 retro pop art with 50s red, fiery rose, mint, black and midcentury squiggles; 2017-2018 maximalist type, 3D models, 350 poster variations; 2019-2020 gradients with Circular Sp UI Bold; 2021-2023 gridless, chaotic "anti-design"; 2022 monograms with 48 variations.
- Criticism noted in Wikipedia: Wrapped can be read as free advertising built on data collection; keep claims specific to user data in a respectful tone.

## Tokens decoded
- Canvas options: #121212 dark, or a full-bleed flat colour per card.
- 2024-like palette: red #d8231f, pink #ff4fa3, yellow #ffe033, ink #ffffff or #0b0b0b (all proposed).
- Type: Bricolage Grotesque 800 (widths via the variable axis) or Anton for numerals at 28 to 45 percent of frame height; Inter 700 for statements at 5 to 7 percent; tracking -0.03em.
- Cards 9:16 at 1080 x 1920, margins 72 px, corner radius 32 px on inset elements.

## Motion and camera
Only the looping, transforming type and the "vibrant gradients and solid colours, playful layouts, spirited animations" description are sourced. Timings are proposed.

2D (HyperFrames, craft.md vocabulary), 9:16 at 1080x1920, each card 3 to 5 s:
- Numeral enters scale 0.6 to 1 in 0.5 s `back.out(1.4)`, opacity 0 to 1 in the first 0.15 s; fill is a gradient (red to pink) via `background-clip: text`.
- Clones: 3 to 6 copies of the numeral, offset 6 to 10 percent of its height, each delayed 0.06 s and stepped along the palette (red, pink, cyan, yellow). Loop by computing position from the timeline time, `y = base + ((t * speed) % period)`, in a `gsap.ticker`-free `onUpdate` of one paused tween, so it is seek-safe. No CSS keyframe loops.
- Variable type tween: `gsap.to(el, { fontVariationSettings: "'wght' 800, 'wdth' 100", ... })` from `'wght' 300, 'wdth' 75` over 0.8 s `power3.inOut` for the stretch and squeeze.
- Statement panel: flat colour, Inter 700 at 6 percent of frame height, read for 1.8 s on a slow carry; no gradient behind text. Card wipe: a colour panel slides across 0.35 s `power3.inOut` on the beat. Share card: elements rise `y: 60 to 0`, stagger 0.08 s, 0.6 s `power3.out`.
- Camera: locked 2D; grade none; sound: a pitched pop per card, one riser into the share card.
3D (Rasan3D): optional only. Toy-like numeral: `k.extrudeText("42", { font: <TTF>, size: 3, depth: 0.8, bevel: 0.08, material: k.material("plastic", { color: "#f52ca8" }) })`, `k.rig("three-point", { dir: [-0.5, 0.8, 0.6] })`, `background: "#0a080b"`, `lens: [[0, 50]]`, a slow wobble in `pose`: `rotation.y = 0.1 * Math.sin(t * 1.6)` (6 degrees, seek-safe), bloom off. Keep type DOM-crisp where it must read.

## How to instruct a model to build it
"Spotify Wrapped-style recap, 9:16. One personal fact per card (name the artist, minutes, rank). Three-beat rhythm: a theme panel with looping type, a plain statement panel on flat colour, a share panel with a surprise layout. Palette: red #d91f25, hot pink #f52ca8, cyan #07b0ed, yellow #fdf000 on near-black #0a080b, gradients only in backgrounds and numerals; all statements on flat colour. Numerals huge (30 to 45 percent of frame height) in Bricolage Grotesque at weight 800, cloned 3 to 6 times and offset into a pattern, entering with back.out(1.4) in 0.5 s. Card wipes 0.35 s on the beat. No stock confetti." Claude keeps layouts tidy and can lose the celebratory energy: ask for overshoot and clones explicitly. GPT tends to produce rainbow gradient chaos: limit the palette to four. (Carried from the earlier pass.)

## Blending notes
Carries: personal-data card structure, type-as-pattern (Jimenez), three-beat rhythm, flat colour under text. Mix with `nike-brand-motion` caps for a sporty recap, or `swiss-international` restraint for a calmer annual review; see `dia-modular-kinetic-type` for the type mechanics. Breaks with quiet luxury and dense infographics.

## Sources
- https://www.itsnicethat.com/features/spotify-wrapped-2024-graphic-design-041224 — Spotify Mix debut, type as the main graphic element looping and transforming, "vibrant gradients and solid colours"; the project images are the colour sample (fetched).
- https://newsroom.spotify.com/2024-12-04/10-years-spotify-wrapped/ — 2015 first iteration, "Wrapped" 2016, in-app 2019, 184 markets in 2024 (fetched).
- https://www.alexjimenezdesign.com/blog/three-design-elements-that-made-spotify-wrapped-2024-great-b70b8 — limited high-contrast palette, text on flat colour, return to 2018, "Type as Pattern" (fetched).
- https://en.wikipedia.org/wiki/Spotify_Wrapped — dates and criticism (fetched in the earlier pass; retained).
- Blocked: elements.envato.com history page (403), so the year-by-year history in the body is not re-verified. Radii and timings are proposed.
