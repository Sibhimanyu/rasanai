---
id: "national-geographic"
name: "National Geographic yellow-frame identity"
kind: "publication"
era: "1888 society; yellow border from 1910; photographic covers from 1959; identity refresh 2016 (Gretel)"
origin: ["National Geographic Society", "Gretel (2016 identity)", "Chermayeff & Geismar & Haviv (credited in search summaries, unverified)"]
palette: {"roles":{"frame":"#fbd42c","ink":"#000000","canvas":"#ffffff","image":"full-colour photography"},"logic":"one yellow rectangle is the brand; everything inside it is photograph. Colour comes from the world pictured, not the UI","evidence":"#fbd42c read from the fill attribute of the logo SVG at https://logotyp.us/file/nat-geo.svg (a third-party redraw, not an official guideline). Black and white are proposed. A k-means sample of Sviiter's cover image gave only photograph colours (no frame cluster), so it is not used. No official guideline hex found."}
type: {"display":{"family":"serif wordmark in black or white on the frame, classical proportions (exact face not verified)","free_alternative":"Libre Caslon Text / Source Serif 4","weights":[400,700],"case":"caps","tracking":0.04},"body":{"family":"readable serif for stories, sans for captions (unverified)","free_alternative":"Source Serif 4 / Source Sans 3","weights":[400,600],"note":"Source Serif 4 has opsz and wght axes: tween wght 400 to 600 on a caption emphasis, let opsz follow the size. Libre Caslon Text only has 400 and 700."},"rules":["wordmark small relative to the frame: the border carries recognition","type in black or white on yellow, never coloured","captions short and factual"]}
grid: {"columns":"single frame","baseline_px":8,"margins":"the yellow border itself, a uniform thin band; photograph fills the interior full-bleed","rules":["vertical rectangle as window/doorway","text sits in the frame or on a quiet area of the photo","one dominant photograph per cover"]}
shape: {"radius":0,"stroke":"yellow border band","shadow":"none","imagery":"photojournalism; wildlife, people, landscapes, scale shots; colour photography pioneered in the 1930s per Wikipedia"}
texture: "photographic grain and natural light; no overlays"
motion: {"language":"documentary, patient, observational","timing_ms":[600,1200,2400],"eases":{"enter":"power1.out","move":"sine.inOut","exit":"power1.in"},"entrances":["frame draws in around the photo","slow push-in on a locked still","cross-dissolve"],"camera":"slow push or drift on stills (Ken Burns, restrained); long-lens wildlife; handheld documentary for people","signature":"the yellow rectangle as a window that a photograph fills"}
space: {"2d":"native: framed photographs, captions, map insets","3d":"possible: globe or terrain flyovers, a framed 'window' that the camera passes through into a real scene"}
good_for: ["science, nature, travel, history, culture", "documentary films, expedition and PR films with strong footage", "anything where the image is the proof"]
not_for: ["abstract tech", "typographic-first kinetic pieces", "playful consumer UI"]
blends_with: ["museum-label-and-specimen"]
clashes_with: []
cheap_tells: ["yellow used as a text highlight or banner, not a thin full-perimeter frame", "stock footage with a yellow border pasted over it: the frame only works if the photograph is composed for it", "thick rounded yellow border", "dramatic trailer-voice zooms and shakes on stills", "too much type in the frame"]
verified: {"sources_fetched": 4, "non_wikipedia": 3, "colours": "partial", "colour_images": ["https://logotyp.us/file/nat-geo.svg"], "grid": "proposed", "timings": "proposed", "recipes": "aligned", "edited": "2026-10-03"}
sources: ["https://en.wikipedia.org/wiki/National_Geographic_(magazine)", "https://sviiter.studio/blog/famous-logos-xxiii-national-geographic", "https://logotyp.us/logo/nat-geo/", "https://logotyp.us/file/nat-geo.svg"]
---
## What it is
National Geographic's identity is a single device: a yellow rectangle that frames a photograph. Wikipedia dates the yellow border to the February 1910 cover, at first with an oak-leaf design that lasted until June 1959, then a plain yellow frame; the word "Magazine" left the title by December 1959; small cover photographs arrived in 1959, large ones in 1962, and the oak leaf was dropped in 1979. Photography is the core: by 1908 more than half of the pages were photographs, and the magazine pioneered colour photography in the 1930s. In 2016 the New York studio Gretel refreshed the identity across National Geographic Partners.

Dating conflict: two logo-history blogs describe the frame as appearing in the "late 1950s" or as a logo-device only after photographic covers; Wikipedia and the logo-site summaries say 1910. The 1910 date is used here; the later date is likely about when the frame became the dominant brand device.

## The rules that make it this and not something else
- The border is the brand. Blog analysis of the identity: "the border itself carries primary brand recognition" and the identity "never attempts to dominate the content" (kreafolk, sviiter).
- The frame reads as window, doorway or camera viewfinder: the photograph is the subject and must be composed to sit inside it.
- Yellow differentiated the magazine on crowded newsstands in 1910 (logotyp.us). Colour is visible from distance, so it is a loud, flat, single hue.
- Type stays secondary: the wordmark is small and black or white.
- The vertical format maps naturally to mobile and social (kreafolk).
- Photographic honesty: documentary, un-retouched-looking, natural light, scale cues.

## Tokens decoded
- Frame #fbd42c (third-party; calibrate to your project's yellow, ~#ffcc00 to #fbd42c). Frame thickness about 1.2 to 2 percent of the short side on a cover; at 1080 px short side use 14 to 20 px (unverified measurement, set by eye).
- Ink black, canvas white. No other brand colours; any accent comes from the photograph.
- Type: a restrained serif wordmark in caps; body copy Source Serif 4; captions Source Sans 3, 14 to 18 px, tracking 0.
- Radius 0. No shadow.

## Motion and camera
All timings below are proposed (no source gives them); they follow the documentary pacing the identity implies.

2D (HyperFrames, craft.md vocabulary): the photograph is placed first, full-bleed, in a clip. The frame is four edge strokes (or one `clip-path: inset()` ring) drawn on at 0.5 s with `power2.out`, staggered 0.04 s from the top edge clockwise. Camera: a locked frame, the photograph gets a slow push-in of 3 to 5 percent over 6 s on `sine.inOut`, on the image layer only (depth factor d = 1, the frame at d = 0 never moves). Caption: opacity 0 to 1 in 0.4 s `power1.out`, 8 px rise, reads 2 s or more on a slow carry. Transitions: a dissolve of 0.5 to 0.8 s, or a hard cut on a narration beat. Grade: none beyond a 3 percent grain; a trailer teal-orange grade is the first thing to remove.

3D (Rasan3D, 3d.md sections 3, 5, 6): the frame becomes a threshold the camera crosses.
- Build: `k.material("emissive", { color: "#fbd42c" })` on four thin boxes forming a 16:9 or 4:5 rectangular ring (emissive intensity about 1.0 so it stays flat and below bloom threshold; set `post.bloom` off for this scene). Behind it a world scene: terrain or a globe on `k.ground({ color })`, `fog: { color: <horizon colour>, near: 20, far: 200 }`, `environment: "soft"`, `k.rig("window", { dir: [-0.6, 0.5, 0.4] })` for low golden-hour side light.
- Camera keys: `lens: [[0, 35]]`; `pos: [[0, [0, 1.6, 14]], [9, [0, 1.6, 2], "power2.inOut"]]` so the ring grows past the frame edges at about 6 s and the world fills the frame (the flat-to-depth seam, section 6); `target` fixed on the horizon; `fstop: 5.6` with `focus: [[0, "target"]]`; optional `shift: [[0, [0, 0]], [9, [0, 0.06], "sine.inOut"]]` to keep verticals straight on cliffs or buildings.
- Labels: pin DOM captions with `k.pinDom(el, { at: <mesh>, width, height, px, face: "camera" })` per location, one at a time, serif type, black on white or white on the photograph.
- Declare `declare: { intent: { "no-bloom": "frame must read as flat print yellow, not a light" } }` so the gate accepts it.

## How to instruct a model to build it
"A single flat yellow (#fbd42c) rectangular border, uniform thin band (1.5 percent of the short side), sitting around a full-bleed photograph; the interior contains only the photograph and at most a small black or white serif wordmark and one caption line (Source Sans 3, 16 px). No gradients, no rounded corners, no shadows, no overlays on the picture. Camera: slow 3 to 5 percent push over 6 s on sine.inOut with the frame locked. Dissolve 600 ms between images. Documentary tone, no trailer cuts, no shake." Claude tends to add dark vignettes and a cinematic grade: remove them. GPT-style outputs often make a giant yellow headline bar: the frame must be a thin perimeter. (Both observations come from the earlier pass of this entry, not re-tested.)

## Blending notes
Carries: the yellow frame as a single-hue device, photograph-first, documentary pacing, black or white type only. Blends well with museum-label typography and specimen looks (see `engraving-etching`, `cyanotype` in `systems/material/`). Breaks with any second loud accent and with type-led kinetic styles. As an accent inside another system, use the frame once per film (opening and closing), not per scene: repeated, it turns into a sticker.

## Sources
- https://en.wikipedia.org/wiki/National_Geographic_(magazine) — February 1910 yellow border and oak leaf, small photographs from July 1959, oak leaf dropped September 1979 (fetched).
- https://sviiter.studio/blog/famous-logos-xxiii-national-geographic — frame as structure, "does not attempt to dominate the content", dates it to the late 1950s (conflicts with Wikipedia) (fetched).
- https://logotyp.us/logo/nat-geo/ — frame as window or portal, newsstand rationale, #fbd42c (fetched; third-party).
- https://logotyp.us/file/nat-geo.svg — the fill value #fbd42c read from the SVG (fetched).
- Blocked or dead, not used: nationalgeographic.com brand-guideline path (404), gretelny.com work page (404); Wikimedia Commons API rate-limited this session, so no cover image was sampled.
