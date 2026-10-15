---
id: "opuscar-prompts"
name: "Style prompt bank (98 one-style recipes)"
kind: "style-prompt-bank"
source: "lemo-opuscar"
source_url: "https://github.com/lemomo-ai/lemo-opuscar/blob/main/styleboard/opuscar98_styles.json"
license: "MIT"
one_line: "98 reusable one-paragraph style recipes: a medium, its palette with hexes, texture and motion habits, a signature shot and an Avoid list."
---
# Style prompt bank

Digest of the OPUSCAR 98 styleboard (lemo-opuscar, MIT). Each entry is one reusable style prompt: **a medium blended from named traits, a palette with hex values, a texture and motion habit, one signature shot, an Avoid list.** The film names, character names, years and credit lines are stripped; what is left is the recipe. Artist and technique names stay because they name a look, not a film.

## How the design desk uses it

- Pull a RECIPE SHAPE, not a preset: the pattern (medium + palette in hexes + a texture + a signature shot + an Avoid list) is what a bespoke look needs. Copy the shape for the film's own system, change the subject and the colours.
- `Avoid:` is the part worth most: each names the two or three things that would turn the medium into a cliche of itself. Carry the relevant ones into the DESIGN.md `dont` list.
- Entries marked `2.5D` are 3D models rendered into flat layers; `3D` are real Rasan3D candidates (`references/3d.md`); `B&W` / `Sepia` mean the whole picture is graded, with at most one coloured hero.
- Find one: `grep -i "<words>" library/styles/prompts/opuscar-prompts.md`. These are NOT in `library.mjs index` and NOT valid `blend.style_refs` slugs (those are `library/styles/<id>.md`).

## Silents & Talkies

### Silent-era 3D Dogfight, Tinted Ortho B&W
`3D` `3D·B&W` · blend: three.js 3D; Orthochromatic black and white; Silent-film tinting; Projector wear and iris

Smooth-shaded 3D graded as a silent-era orthochromatic print: high contrast, reds go black. Sky near-white, ground in readable mid-greys, deep blacks (25-35% of frame) only in silhouettes. Tint: blend whites half-way toward amber #FFCC80, so the sky is pale cream-amber, never solid orange; blacks stay black. Only the hero the story centres on keeps colour, whole figure at ~70% saturation (e.g. #D97757); every lamp, fire or other light source stays grey. 24 fps gate weave (±1 px), flicker (±5%), fine grain (±4%), 1-3 thin scratches, sparse dust, rounded corners, vignette; open on a 1 s iris. Signature shot: a camera rigged to something moving with the subject, rig in frame; then chase and POV. Cut every 2-3 s; white out through cloud, smoke or glare. Avoid: motion blur, colour in the greys.

### Black-Gold Art Deco Revue Poster
`2D` `2D` · blend: Art Deco poster; Airbrush metallic gradients; A. M. Cassandre; Erté costume

Art Deco revue poster. Black lacquer ground; gold and silver from banded metallic gradients (3-5 hard bands); airbrush glows, sunbursts, ziggurat steps, streamlined curves; a stepped proscenium frame of gold lines and bulbs. Palette: ground #0A0908, gold #D6B560, highlight #F3E2A2, silver #BFC4C9; skin pale silver-cream; one saturated accent (e.g. #D97757) only on the hero the story centres on. Elongated Erté-style figures with real faces; fringe, sequins or feathers where the subject allows. Fine grain, glints, stars. Frontal symmetry, a central spotlight. Motion: chasing bulbs, a row of repeated elements (dancers, waves, columns) rippling toward the centre, rings radiating from the main sound or light source; slow pushes, cut on the music's beat (without music, every 2-3 s). Avoid: flat yellow for metal, faceless figures, extra hues.

### Kollwitz Anti-war Woodcut
`2D` `2D·B&W` · blend: Woodcut; Käthe Kollwitz; German Expressionism; Two-block colour print

Expressionist woodcut after Käthe Kollwitz. 60-70% solid black; white contour cuts 1/300-1/150 of frame width separate forms; faces are white shapes with a few black features; hands large. Figures fill the frame, cropped by its edges. Each cut tapers in and out with chipped edges, is wider the nearer it sits to the light, in slightly uneven bundles. Ink #17130F on paper #E8DFCA; texture is only wood-grain streaks and under-inked speckle (±5%). One colour block (e.g. #D97757) only on the hero the story centres on, flat on its body or clothes, cuts over it; black stays 60%+. Light enters through one opening (window, cloud gap); lamps get a short ring of cuts. The ground under figures stays uncut black. Quiet motion (breathing, a small gesture); slow pans and push-ins. Avoid: grey fog or midtones, even striped hatching, gore.

### 1889 Sepia Albumen Panorama
`2D` `2D·Sepia` · blend: Gold-toned albumen print; Frontier panorama photograph; Hand-tinted figure

A moving 1880s gold-toned albumen photograph. Paint soft-edged flat shapes by brightness: main subjects dark (15-30%), ground 50-60%, sky about 90%; visible hatching and grass tufts (lines ~1/300 of frame width). Then print: grayscale, slight blur (~1/800 of frame width), a faint smear of three horizontal offset copies growing with camera speed, multiply cream #F2DCB4, lift blacks to umber #2E1C0F, blotchy development (±5%), vignette to #785634, per-frame grain (±4%), dust, scratches. Hand-tint only the hero the story centres on (e.g. #D97757) as transparent dye, mask feathered 2-3 px; lamps stay sepia. Wide panorama: the middle band packed with repeated small elements (figures, animals, vehicles; for a lone subject fences, posts, trees), no big plane dominating. Camera: one 4-5 s ease-out pull back from the hero to the panorama. Avoid: hard ink outlines, colour beyond the hero, a flat grey print.

### MGM Silver B&W 3D Lobby
`3D` `3D·B&W` · blend: three.js 3D; MGM silver-screen black and white; Art Deco interiors; Overhead symmetry

A real 3D set, by default an Art Deco interior (marble, chrome, chandelier, glossy checkerboard floor); outdoors keep the real setting with glossy surfaces (wet pavement, still water) and symmetrical framing. Ambient occlusion, soft bloom; 1930s studio silver: about 40% deep black, glossy whites near 90%, no washed-out greys. Light falls in shafts from one high source. All neutral grey except the hero the story centres on (e.g. #D97757), at least 1/6 of frame height; warm lamps render white, bloom only around them. Grain (±3%), halation. Signature shot: eye-height wide into a deep symmetrical set, floor and ceiling in frame, floor reflections; then 4-6 s tracks; one overhead on rings, figures as chess pieces. Period figures (heads, hats, limbs) walk routes. Avoid: walking in place, frame-filling abstract patterns, colour casts.

### Mucha Art Nouveau Panel
`2D` `2D` · blend: Alphonse Mucha; Colour lithograph; Art Nouveau ornament

Alphonse Mucha colour lithograph. Brown contours #4B3326, about 1/250 of frame width, doubling on the shadow side (light from upper left), tapered ends; pastel flats, each with a hard-edged darker shadow tone. Palette: cream #F5ECD6 paper/sky, sage #A9B490 foliage/drapery, pale gold #CFA55A halo/ornament, rose #DBA49C skin/flowers; the hero the story centres on in one stronger accent (e.g. #D97757). Wide frame: figure and a big ring-filled halo in the middle third, arched panels either side, behind them a muted-teal (sage plus grey) square-tile mosaic; whiplash vines, local flowers; a bottom band of serif capitals in the user's language, 1/25 of frame height. No plain area over 1/8 of frame. Almond eyes, heavy lids; hair or cloth in three-tone strands. Litho grain, paper mottle, vignette. Slow sway; tilt down to the halo, pull back. Avoid: thin clean lines, saturated colour, empty backgrounds.

### 1930s B&W Rubber-hose Cartoon
`2D` `2D·B&W` · blend: Fleischer rubber hose; Cel painting; Silly Symphonies watercolour backgrounds; Projected film wear

Early-1930s black-and-white rubber-hose cartoon. Characters: noodle limbs, white gloves, pie-cut eyes, round heads; thick-thin ink #141414 (1/400-1/150 of frame width) swelling away from the light (default upper left); fills pure black and white plus at most one light grey for the hard shadow, gloss on blacks. Backgrounds stay mid-grey (30-80%), never pure black/white: graphite lines left in, grey watercolour washes with pooled edges and granulation, paper grain. Only the hero the story centres on has colour (e.g. #D97757): its whole body, or its one key prop if the hero is human. ±1 px gate weave, grain (±4%), flicker, scratches, dust. Actions anticipate, overshoot, settle: squash on landing, stretch on fast moves, eyes pop when surprised, a camera jolt on hits. Avoid: smooth vector lines, grey characters merging with the background.

### Admiralty Sea Chart Copperplate
`2D` `2D` · blend: 18th-century Admiralty chart; Copperplate engraving; Thin hand colouring; Robert Dodd's aquatint

A late-18th-century copperplate map, default an Admiralty sea chart (inland: a survey map). Fine burin hatching and cross-hatching (lines ~1/1200 of frame width) give all tone; a minimum line width makes small detail darken, not vanish. Ink #1C1610 on laid paper #EFE3C4, light foxing, folds. Thin hand colour: water #9EBCBC along edges, land #B8C08C; the hero the story centres on (e.g. #D97757) is the one strong colour. Rhumb lines from 32-point roses, a graduated border, hachured hills, cartouche, one ornament (e.g. a sea monster), serif lettering. Put the action in an unboxed engraved vignette fading into the chart, filling 60-75% of frame height at the end of the move. Camera: one 5-6 s glide from the whole sheet into the vignette, chart still around it; a dotted route inks itself in. Avoid: cropping the paper, heavy washes, stiff figures.

### Silver B&W 3D Wedding-cake Stage
`3D` `3D·B&W` · blend: three.js 3D; MGM silver black and white; 1936 revue spectacle; Ostrich feathers and chiffon

Real 3D stage spectacle in 1930s studio silver: the subject's world built as a revue set on a round tiered platform turning about 3° per second, draped and garlanded; its people become rows of costumed chorus figures with faces and arms. Costumes light satin grey, set mid-grey, pleated curtain backdrop darker, theatre deep black; whites below pure white. Soft front key; brighter rim lights edging satin and feathers near-white. Faint shafts, grain (±3%). All neutral grey except the hero the story centres on (e.g. #D97757); lamps render white. Signature shot: low medium along the tiers, figures 1/4-1/3 of frame height, the hero on the front tier. Then a 3 s curtain rise, a 10 s crane up to a level medium of the hero. Avoid: flat lighting, faceless cones, fast spinning.

### Newsprint Letterpress and Line Engraving
`2D` `2D·B&W` · blend: Wood-type headline; Letterpress on newsprint; 1890s line engraving

1890s newspaper print. Set text as a sharp mask, then print: ~1 px blur and a noisy threshold for ink spread, ragged edges, under-inked patches, faint mirrored show-through. Page grammar: masthead, a wood-type headline across the width (~1/6 of frame height), 3-6 columns of small type in the user's language (~1/80 of frame height) flanking one large engraved picture. Wood-type letters are grained blocks. Everything pictured is a line engraving: hatching lines about 1/1000 of frame width, spaced 1/400, following the form, cross-hatching only in darks, heavier shadow-side contours, paler distance. Warm black #17130F on newsprint #E8E0CC; the hero the story centres on gets one accent plate (e.g. #D97757), offset 1-2 px. Motion: type blocks slam down, bounce and leave their print; one repeating mechanical motion, pages turning. Avoid: clean digital type, smooth grey shading, other colours.

### WPA Silkscreen Poster
`2D` `2D` · blend: 1930s WPA silkscreen; Split-fountain inks; Six flat opaque inks

A 1936-39 WPA (Federal Art Project) silkscreen poster. Six opaque inks printed light to dark, each later screen cut away around lighter shapes (clouds, sun): cream #F0E2C0 for light, ochre #E0A842 and vermilion #C84A2A for sky and warm planes, teal #22686E for water and shade, the hero's own ink (e.g. #D97757, only on the hero the story centres on), brown keyline #322018 last. Shadows: a darker ink overprinted, never grey. Big areas get split-fountain blends: two inks in 2-3 coarse steps, the middle one their overprint. Screens 1-3 px off register; wandering stencil edges, squeegee streaks, warm rag-paper grain (±5%) on every flat. Figures fill 1/2-2/3 of frame height: big planes, crescent shadows, expressive faces. A bold capital title band, user's language. Slow pushes; screens pop in one by one. Avoid: halftone dots, smooth gradients, clean vector flats.

## Colour & War

### Technicolor Impasto Oil
`2D` `2D` · blend: Impasto oil; Palette knife; 1939 Technicolor palette; Epic poster painting

Impasto oil in a 1939 Technicolor palette. Palette-knife slabs: long horizontal sky bands (1/15-1/6 of frame width long, about 1/60 tall), shorter strokes following form on land and figures, calm thin areas between; ridges lit from upper left, paint thickest in highlights, canvas weave where thin. Default sunset sky: wine #3A0912, red #A8241A, orange #F27A22, gold #FFD878; ground red-brown #6E2214; warm near-black silhouettes. The hero the story centres on stays a readable warm mid-tone (e.g. #D97757), never a silhouette. Strong backlight, gold rims; in close shots a warm side light on half the face and hands. Epic-poster composition: big dark silhouettes (trees, buildings, rocks, figures) on a low horizon. Lamps as painted flames. Camera: slow push on the wide, low push-in on the hero, crane up to a vista. Avoid: tiled same-size strokes, muddy browns, smooth gradients.

### Gothic Charcoal Drawing
`2D` `2D·B&W` · blend: Vine charcoal; Eraser lifts and smudging; William Kentridge; Gothic suspense

Charcoal on toothed paper. Fine tooth (grain ~1/600 of frame width): light pressure catches only the peaks, heavy pressure fills the valleys. Grain only in midtones; velvet blacks, clean-paper lifts. Values: ~60% dark-to-mid grey, 15% deep black in the nearest foreground and largest masses, lights small. Charcoal #121111 on paper #EEECE7. Marks: broken vine lines, side-of-the-stick sweeps (1/60-1/30 of frame width) following form, hatching, finger smudges, eraser lifts for edges and glows; mist is horizontal streaks erased out of a toned area (as in William Kentridge's animated drawings). Only the hero the story centres on is in pastel (e.g. #D97757), laid fairly solid, tooth peeking through, outlined in charcoal; flames stay charcoal-and-paper. Moonlight from above; 2-3 fog bands drift at different speeds. Camera: slow subjective push, foreground parting. Avoid: digital noise, smooth digital glows, grey blacks, empty bright skies.

### Welsh Valley Gouache
`2D` `2D` · blend: Opaque gouache; Kyffin Williams palette-knife landscape; 1941 poster colours

Opaque gouache after Welsh painter Kyffin Williams. Directional strokes 1/80-1/40 of frame width, 2-5 times as long, ragged, fully covering; broken dark dashes outline buildings, walls and ridges; dark hills flecked with lighter green or slate knife marks. Palette: sky and light pale gold #F1C565 (not mustard), fields green #86A03F, darks coal #1D1B1E, far hills and water slate #48505E, small accents yellow #F6CF2F, other colours mixed from these; the hero the story centres on #D97757, at least 1/8 of frame height. Fields and sky light (~60%), hills and buildings dark. Warm grade under 10%, vignette, grain. Default low late-afternoon side light: fields lit, ridges rim-lit. From high ground in true perspective, a path leading the eye down; small repeated buildings (or walls, rocks) stepping along slopes. Motion: looping smoke or cloud, a lateral track. Avoid: watercolour transparency, vector fills, mud.

### Home Front Stone Lithograph
`2D` `2D` · blend: Stone lithograph with crayon shadow plate; Frank Newbould and Abram Games WWII posters; Ministry of Information palette

A 1942 British wartime stone-lithograph poster. Simple, strong shapes from three plates, 1-3 px off register: a colour plate with all flat fills; a grey-blue crayon plate darkening every shadow with short slanted stone grain; a green-black key line about 1/500 of frame width around every shape, figures and clouds included. Palette by role: cream #EBDFC2 paper and highlights, grey-blue #8497A6 sky and shadow, brick red #A23F2D and deep green #34503F as accents, at most a quarter of the frame; browns and skin mixed from cream and brick; key #1E2422. Scenes may be full. Airbrushed skies; only the paper grain boils at 12 fps. Pale light bands, angled from the source, cancel the shadow plate. Figures stand frontally. Camera: slow drifts, a tilt up. Avoid: dot screens, clean vector edges, big saturated fields.

### Studio Glamour Black-and-White
`2D` `2D·B&W` · blend: Airbrushed glamour-still portraits; Arthur Edeson studio lighting; Diffusion filter and silver grain

1940s Hollywood studio black-and-white, painted like a retouched glamour still. Forms: smooth airbrushed tone blocks. Faces: short key (light on the face's far side from camera; the near cheek in shadow, holding a Rembrandt triangle of light), two catchlights per eye. Slatted shadows from anything at hand (blinds, railings, branches) fall diagonally across surfaces; light shafts show only in smoke or fog. Values: 30-40% of the frame deep black, whites small and glowing; outdoor skies mid-dark. Grade: diffusion glow, an S-curve, fine grain (±3%), soft vignette, faint flicker; fog stays local. Only the hero the story centres on keeps colour, on its body or costume (e.g. #D97757); skin and lamps stay grey. Camera: a long glide, a push to a face, a pull-back into fog. Avoid: flat lighting, grey haze, stiff busts.

### Backlit Gothic Stained Glass
`2D` `2D` · blend: Leaded pot-metal glass with grisaille; Chartres blue quarries; Harry Clarke jewel colour

A backlit Gothic stained-glass window filling 80-90% of frame height and ~60% of width, neighbours glowing at edges. Every shape is cut glass: lightness varied ±8% per piece, streaks, seed bubbles, a brown edge mat, black lead (about 1/250 of frame width). Sky and empty ground: diamond quarries (about 1/30 of frame width); the border is ruby with beads. The main figure is at least half the window's height, in dark-brown grisaille line. Palette by role: background cobalt #1B3F9E, border ruby #B3121F, highlights gold #E3A526, lead #16161A; skin pale amber; scenery deep greens. Only the hero the story centres on is orange glass (e.g. #D97757). Bright glass blooms into the leads; coloured light spills onto floor and sill. Camera: tilt down, pan, settle on the pooled light. Avoid: flat fills, random cuts, dark empty wall.

### Typewriter Character Art
`2D` `2D·B&W` · blend: Typewriter art with overstrikes; Paul Smith and Flora Stacey; John F. Seitz hard-light noir

Type every image: one bold monospaced glyph per keystroke, fixed grid, cells 1/150 of frame width wide, twice as tall. Strike 85-95% of cells; bare paper only for highlights. Grey from a key ladder (light . : -, mid = + o, dark X # M); darks (about 30%) are overstrikes like M#. Shapes read as crisp-edged fields, clear silhouettes. Each material repeats its own keys (e.g. I H verticals, _| courses, ~ water). Signs stay legible. Uneven ribbon: half-inked strikes, a few keys always high or low. Paper #EBE6DA, ink #1D1C21; only the hero the story centres on, at least 1/3 of frame height, is struck in red-orange #D4704F, its shadow black. Hard sidelight casts long, crisp, dense shadows. The picture types itself within the first second, then holds. Avoid: sparse frames, shapeless streaks.

### Picture-Magazine Halftone Spread
`2.5D` `2.5D·B&W` · blend: Coarse 45° halftone; Gregg Toland deep focus; 1946 picture-magazine layout; Spot-orange plate

Each frame is a 1946 picture-magazine photo spread. Render the scene as a grey photo (3D or painted): low sun, long shadows, deep focus (near and far both sharp). The photo bleeds across both pages, crossed by a soft vertical gutter crease. Print as a 45° black halftone, dot pitch about 1/250 of frame width, ink #1A1A1A on off-white coated stock #ECE6D8. A short black headline and caption sit in a quiet area. Only the hero the story centres on, at least 1/4 of frame height, prints on its own spot-orange plate (e.g. #D97757) at another angle, 2-3 px off, black only in its deepest shadows. Camera: walk in, push to a detail, pull back to reveal an open magazine. Avoid: the gutter cutting the hero, coarse dots that break the photo.

### 1940s Graphite Magazine Illustration
`2D` `2D·B&W` · blend: Graphite hatching and rubbed tone; Al Parker and Robert Fawcett; Coloured-pencil subject

Graphite pencil like a 1940s magazine illustration, finished and controlled. The drawing builds in the first 1-1.5 s, then holds: faint perspective rays and head ovals, pressure-tapered contours (about 1/600 of frame width) overshooting at corners, then 1-4 near-parallel hatching passes (more for darker), about 1/300 of frame width apart, following the form, then rubbed tone and eraser lifts. The finished frame is toned nearly edge to edge: setting fully drawn in mid-greys, about 15% dark accents, only the outer tenth fading to loose margins. Paper #F2EEE5 with a light tooth; lead #2C2B2E. Only the hero the story centres on wears coloured pencil (e.g. #D97757) on its clothing; skin stays graphite. Faces carry the drama. Camera: a slow ease out, then cuts to close-ups. Avoid: cross-hatch grids, scribbly sketching, a near-empty page.

### Deep-Focus Fog Castle, 3D B&W
`3D` `3D·B&W` · blend: three.js 3D with volumetric fog; Desmond Dickinson deep-focus black-and-white; Roger Furse bare Romanesque sets

A real 3D scene in late-1940s deep-focus black-and-white. Built forms: bare masonry, block by block, bevelled, staggered (Romanesque arches only where the setting has them); wet surfaces dark and glossy. Soft overcast light, no hard shadows: dark masses against a silver sky. Low fog fills the lower third; the far background ends at 60-70% grey, the midground sharp; a bright patch behind cloud throws faint shafts. Water, if any: layered swells, lace foam, misty spray. Post: ambient occlusion, gentle bloom, high-contrast silver grade (true blacks, unclipped whites), grain (±3%), faint flicker. Only the hero the story centres on keeps its colour (e.g. #D97757); every light source stays grey. Camera: slow drift in, a track along a high edge, a low angle on the hero. Avoid: hard sunlit shadows, white-out fog, tiled textures.

### Wood-Type Campaign Poster
`2D` `2D` · blend: Wood-type letterpress; Hatch Show Print; Linocut figures; Halftone portraits

A letterpress poster from wood type and cuts. Three inks on cream stock #EEE3C7: blue #20488C (sky, water, shadow masses), red #C82C28 (warm surfaces, stripes), black #1E1B1E (outlines, type); only the hero the story centres on gets a spot ink (e.g. #D97757). Each ink 2-4 px off register; solids knock out the inks beneath, halftones overprint. Wood grain, pinholed starved patches, squeezed edges. Mid tones: coarse dots (about 1/200 of frame width), varied angles, on at most a third of the frame. Figures as linocuts: heavy outlines, gouged white lines, crescent shadows. Picture fills about 70%; short wood-type lines (about 1/10 of frame height, user's language) with offset shadows sit on banners and signs. Camera: small pushes, a lateral track, a bump on each strong beat (or every 2 s). Avoid: busy grey mid-tones, perfect registration.

## Widescreen

### Hirschfeld One-Line Caricature
`2D` `2D·B&W` · blend: Single-line ink caricature; Al Hirschfeld theatre drawings; Hand-lettered dialogue

An Al Hirschfeld-style caricature. Lines are elastic, long and continuous, one stroke per contour: about 1/800 of frame width at the ends, swelling to 1/250 on curves. Dark clothing, hair and big objects go solid black; grey only as sparse parallel hatching. The setting is fully drawn in thin line, architecture, furniture and props in detail, white kept between objects: about 60% paper white, never an empty page. Push one trait per figure (a long neck, a big head). Paper #FBFAF6, ink #131012; only the hero the story centres on has its body or main garment filled flat with one colour (e.g. #D97757) instead of black. Lines write on within the first second, then hold; a short hand-lettered line may sit in the white. Camera: ease back, pan across, push in. Avoid: stiff limbs, stick figures, a bare setting.

### Dufy Watercolour Ballet
`2D` `2D` · blend: Loose ink line over offset colour; Raoul Dufy; Minnelli's ballet sets; Cold-press watercolour paper

Paint in Raoul Dufy's watercolour manner: colour first, line second, never aligned. Transparent washes (wet edges, pooled rims, granulation) cover most of the frame, 10-40% oversized, slid one way by about 1/30 of frame width: cobalt #2258CE for sky and water, lemon #FCE02E for light and ground, rose #EC3A7C for warm planes. Overlaps mix violet or green, never brown; keep the hero's wash off blue. Then draw the whole scene densely in quick, thin blue-black ink (about 1/700 of frame width) with flicked ends: buildings, windows, figures, extras; straight edges overshoot corners; trees and clouds as looped strings. Ink #1E1E3A; bare paper 20-30%, skin included. The hero the story centres on gets its own wash (e.g. #D97757). Figures bounce. Camera: small pushes, cuts on the beat (or every 2 s). Avoid: muddy colour, lines tracing the colour, sparse line.

### Strobridge Circus Lithograph
`2D` `2D` · blend: Four-ink chromolithograph; Strobridge Litho circus posters; Flat ink with heavy black outline

A circus chromolithograph after the Strobridge Lithographing Co. (c. 1890). Flat ink, heavy black outlines (about 1/300 of frame width), crescent shadows, light from upper left. Four stones: chrome yellow #F4C416, vermilion #D62C24, cobalt #1E4EA0, key black #181210 on warm cream paper #EBD9B4; overprints and tints give only orange, green, brown, tan, pale blue, grey. Solids print flat; screens (dots about 1/250 of frame width) only on gradients (sky, skin, ground), each stone at its own angle, 1-3 px off register, stone grain. The hero the story centres on is solid yellow under solid vermilion, a flat orange (e.g. #D97757). Exaggerated perspective, radial lines converging on the action, several actions at once; any crowd is tiny individual figures, though a lone figure works. Camera: tilt up, lateral dolly, cut on action. Avoid: off-palette colours, dot-only crowds, a screened, pinkish hero.

### High-Key Beach Black-and-White
`2D` `2D·B&W` · blend: 1953 high-key black-and-white photography; Burnett Guffey; Silver grain and halation

Early-1950s high-key black-and-white photography, painted in 2D to read as a photo: no outlines or flat fills, only soft gradients plus fine texture (sand, rock pitting, cloth). Values: about 70% of the frame above mid-grey; sky light-mid grey, one step below the bright clouds; deep blacks small. Default: hard midday sun, short crisp shadows; under other light keep the pale sky and bright values. Water, foam and mist blow out at the peaks, keeping lace detail; wet surfaces mirror the sky. Print finish: gentle S-curve, slightly soft lens, halation, fresh fine grain (±4%), light vignette, flicker. Only the hero the story centres on keeps colour, whole figure (e.g. #D97757), shaded photographically. Camera: tilt down from the sky, tight level frame, slow pull-back. Avoid: low-key frames, white blanks, cartoon fills.

### Ben Shahn Social Realism
`2D` `2D` · blend: Trembling blotted ink line; Flat tempera colour blocks; Ben Shahn; 1950s American social realism

Ben Shahn's social-realist tempera. Ink lines (about 1/500 of frame width) jitter and wander, break each outline into two or three strokes, sometimes doubled by a fainter offset ghost (a blotted line). Flat tempera blocks sit 2-4 px off the line, rough-edged, dry-brush streaks (one brush wide, about 1/100 of frame width) over a third of each block; model form with a darker flat of the same hue. Palette by role: slate #768492 sky and cool areas, brick #9E4834 and ochre #C89852 ground, buildings, clothes, ink #1F1A1A, warm board #F0E9DA; skin pale ochre; other colours: these darkened or greyed. The hero the story centres on wears the one warm accent on its main garment (e.g. #D97757). Big heads and hands, long faces, heavy jaws, heavy clothes. Camera: short pushes, tilt up, close-up. Avoid: smooth gradients, clean closed outlines, cheerful colour.

### 1955 Kinescope on a Living-Room TV
`2D` `2D (B&W screen)` · blend: Kinescope black-and-white; Curved CRT screen and scanlines; Warm 1950s living-room illustration

A 1950s kinescope playing on a wood-cabinet television. Inside the screen: black-and-white with a cool phosphor tint (#DCE6EA whites), soft (half resolution, scaled up), halation, ghosting, tearing bands, a rolling hum bar, light snow, lifted blacks, flicker, grain; only the story's hero keeps its colour (e.g. #D97757), under the same artefacts. Tube: rounded corners, sides bowing outward, about 330 scanlines, glass reflections. Outside, a warm flat-illustrated living room (ochre wallpaper, wood, a table lamp), lit warm by the lamp; the screen casts a clear cold-blue glow on nearby walls. Signature shot: hold about 2 s with the TV filling 60% of the frame, then push through the glass (4-5 s) until the broadcast fills the frame, scanlines visible, then steady TV-studio mid shots. Avoid: heavy snow, a dull, evenly lit room.

### 1950s UPA Modernist Cartoon
`2D` `2D` · blend: UPA limited animation; Saul Bass end-title animation; 1956 poster colours; Crayon-grain print

1950s UPA modernist cartoon. Uneven ink lines #221C19 about 1/400 of frame width, sometimes broken; colour blocks sit about 1/300 of frame width off them, all one way. Objects are overlapping flat cut-out facets: a lit face and a shadow face one flat step (about 15%) darker. Pale aqua sky and cream paper #F2E9D3 cover most of the frame; mustard #E3A92B, teal #2B8C86, orange-red #D4452B are accents; sky, greens and slate blues are these mixed toward paper. Other times of day change only the sky colour. Crayon grain ±5% brightness everywhere, few flecks. Poster layout: one big graphic shape (a building or sun disc), angular outlined figures beside it. Light beams: flat pale wedges. Hard cuts every 1–2 s; slow parallax drift. After UPA; Saul Bass (1956). Avoid: gradients, perfect registration, saturated colour everywhere.

### Cyanotype Engineering Blueprint
`2D` `2D` · blend: Cyanotype blueprint; Timber trestle G.A. drawing; Red-pencil revisions; Gouache-tinted hero

Cyanotype engineering blueprint. The sheet fills the frame (the walnut drafting table shows only on a pull-back): mottled Prussian-blue paper #143874, uneven exposure, a greenish over-exposed margin, creases, faint water stains. White lines #ECF4FF, sharp but printed: outlines about 1/600 of frame width, hatching and dimensions half that, broken where exposure was weak, a slight cyan bloom. Draw the subject densely in drafting grammar: elevations, sections, detail circles, dimension chains, hidden lines, single-stroke lettering, a title block. Notes and actions in red pencil #D63426, in the user's language. The one hero subject is the only hand-painted element, drawn above scale (at least 1/5 of frame height), opaque gouache in one warm hue (e.g. orange #D97757); nothing else is warm. Camera: layered parallax push-in; cut to detail views. Avoid: neon glow, clean digital blue, sparse sheets.

### Lautrec Belle Époque Lithograph
`2D` `2D` · blend: Colour lithograph poster; Henri de Toulouse-Lautrec; Crachis ink spatter; Cecil Beaton costumes

Belle Époque colour lithograph after Toulouse-Lautrec. Flat colour plates with wobbly edges; figures and main shapes outlined in a loaded brush (blunt start, swelling middle, split dry tail), about 1/250 of frame width. Crachis only on shadow sides, cast shadows and glows: 1–3 px dots at 1920×1080, sparse, under 15% of the frame, a darker step of the colour beneath. Large surfaces get grouped dry-brush streaks. Palette: yellow #F1C232, orange-red #E0602C, olive #6E7036, black #1D1A16 on cream stone-grained paper #EFE3C3, plus a muted bottle teal and greyed mauve; flesh is orange-red thinned with paper. Caricatured profiles with drawn faces; one large figure cropped by the frame edge in front. Flat, even light; shadows are flat plates. Camera: shallow parallax, a slow pan settling on a medium shot. Avoid: Mucha halos, smooth gradients, regular halftone, all-over speckle.

### 3D Circus Chariot Race, 65mm Epic
`3D` `3D` · blend: Procedural 3D (three.js); MGM Camera 65 widescreen; Technicolor print grade; Second-unit action staging

1959 65mm widescreen epic built in 3D. Default: hard high sun (about 50°), short crisp shadows, cobalt sky fading to sandy white; under a low sun shadows stay hard but long, the sky turns amber. Marble, gilt, red granite and sandstone, with mouldings and fluted columns, never bare boxes. Warm sunlit haze mixes about 20% into mid-distance colours. Technicolor-print grade: warm, saturated, slightly contrasty, no clipping or bloom; fine grain (±3%), slight gate weave. Scale is the point: monumental architecture, statues and repeated elements fill the background, never empty. The one hero subject (e.g. orange #D97757) is the most saturated thing in frame; any repeated motion (stride, wheel, oar) keeps time with speed. Signature shot: low tracking beside the moving hero, 35–50 mm full-frame; then wide, top-down, close-up, low angle. Avoid: clean CG light, empty or primitive sets, overexposure.

## The Swinging Sixties

### Saul Bass Line Titles in Black & White
`2D` `2D·B&W` · blend: Saul Bass title design; One-point perspective office; Black-and-white film grain; One warm accent

Saul Bass title lines turned into a set. A shot opens on black: thin white lines (about 1/800 of frame width) slide in and grow into a grid; by 2–3 s grey planes fill in and lights switch on row by row. Then hold the finished frame 3 s: mid-to-light grey, flat fills in 4–5 even steps from #140F0D to #F4F1E8, every shape outlined in dark line about 1/600 of frame width. Strict one-point perspective, centred vanishing point; identical elements repeat into depth (desks and people, or posts, lamps, windows). Figures: flat two-tone shapes. The only warm colour is orange-red #E2472A, for the one hero subject and one prop; all light stays white. Camera: a fast push to the hero, a hard cut to top-down, the grid becoming pattern. Avoid: sketchy lines, gradients, colour leaks, skewed perspective, unfilled wireframe.

### Technicolor 3D Stage Set
`3D` `3D` · blend: Procedural 3D (three.js); Technicolor sunset grade; Boris Leven set design; 1961 poster: red sky, black fire escape

Technicolor 3D stage set, like a 1960s studio musical. Simplified geometry, dense detail on every built surface (openings with sills, ledges, railings, ladders, strung lines); textured brick, plaster or rock, never plain. Theatrical light: a low warm sun rakes surfaces with long shadows; cool fill a quarter of the key. Painted sky of red-orange #E0481E, gold-edged cloud bands, violet only at the top edge; warm haze in the distance. The one hero subject in saturated orange #D97757, at least 1/6 of frame height, set against dark brick or given a black rim so it never melts into the sky. Puppet-like mannequin figures. Warm, saturated grade, fine grain (±3%). Signature shot: a low angle against the orange sky; then one continuous descent into the set and a ground-level push. Avoid: photoreal grime, violet-pink skies, plain walls, poses that pop.

### Terpning Epic Poster Gouache
`2D` `2D` · blend: Gouache and oil poster painting; Howard Terpning's 1962 poster; Freddie Young's 70mm desert light

1960s hand-painted epic film poster, gouache with oil highlights. Draw forms solidly, then paint: an opaque mid-tone base, directional strokes following each form (1/80–1/50 of frame width on large areas, smaller on faces and hands), soft-blended edges; model every form in three values; dry-brush only on dust, cloth and distant figures; sharp warm-cream highlights last on lit edges. Warm–cool contrast: cobalt sky #1F4D97 to pale blue #A9C3D6, warming to cream near a low sun; ground #EEC27A (any terrain); ochre-red #B56A33 for skin, earth and costume; violet #6C6394 for distant shadows. The hero centred and largest, a diagonal gesture, cloth streaming; smaller, looser figures may recede behind. Light board grain (±3%), warm vignette, haze. Motion: bounce, slow push to a low close-up, a whip pan out. Avoid: scratchy uniform hatching, flat digital fills, cold-only colour.

### Hand-Coloured Georgian Satirical Print
`2D` `2D` · blend: Hogarth copperplate engraving; Rowlandson/Gillray hand colouring; Satirical speech balloon

Georgian satirical print: a copperplate engraving, hand-coloured. Brown-black line only: swelling burin outlines about 1/400 of frame width, heavier on the shadow side; hatching follows each form and covers every surface (spacing about 1/250 of frame width), cross-hatched in the darks, ruled on flat areas. Colour covers nearly the whole picture, clear but strong: washes spilling a few pixels off the line in claret #B3262E, brass #D8A93A, flesh #F0C4A4, slate blue #6D8AA6, warm ochre and umber on large surfaces. Sepia laid paper, foxing, plate mark, engraved border. Stage it like William Hogarth: big-nosed caricatures, bystanders or comic props and animals around the subject; one slanted handwritten speech balloon in the user's language. Camera: hold the full plate 2 s, whip in, glide to another detail, close-up. Avoid: even mechanical hatching, blank paper, colour exactly inside lines, muddy colour.

### Bob Peak Fashion Illustration
`2D` `2D` · blend: Fast ink line; Pink and magenta watercolour; Bob Peak's 1964 poster; Cecil Beaton's Ascot costumes

1960s fashion illustration after Bob Peak. Fast ink line, thicker in turns, dry-brush tail, a flick off; 1/600–1/250 of frame width, thinning on tight curves. Solid black for dark clothing, hats and stripes; faces bare paper #FBF7F1. Loose, soft-edged watercolour pools, darker at drying edges: pink #EE84B2 as the main field, magenta #CE3076 for hot spots, rose #F4B2CC, a touch of plum #80285C; warm grey for secondary figures and shading; directional splatter. Settings are a few lines in these washes, not literal colour. The frieze is essential: slender profile figures 9–10 heads tall repeated across the frame (the hero plus grey-wash figures or echoes), black-and-white pattern over pink; washes cover 60–80% of the frame. Camera: slow drift along the figures; graphic-mask transitions. Avoid: even-width outlines, flat digital fills, polygon-edged washes, a lone figure on an empty page.

### Storybook 3D Alpine Aerial
`3D` `3D` · blend: Procedural 3D terrain (three.js); Todd-AO widescreen colour; Ted McCord's helicopter opening; Miyazaki meadows

Storybook 3D landscape in saturated 1960s widescreen colour: smooth sculpted forms, not low-poly or photoreal. Default light: bright sun high, a little behind the camera: emerald grass #3FA33A, cobalt sky #2F6FD0, clean white snow and clouds. Rounded ridges, snow lines following slope, grey-ochre rock bands, cloud shadows. Haze only on the farthest ridges, about 25% lilac. Cumulus are lit white cotton puffs. Knee-high grass and wildflowers fill the foreground, bending in gusts. A lower sun lengthens shadows and warms only cloud edges; other settings keep these colours. Camera: one continuous move: 0–2 s high flight, 2–4 s descent, then a low orbit through the grass around the subject (about 20° per second, subject about 1/4 of frame height). Avoid: violet wash, needle peaks, grey photoreal rock, static grass.

### Holbein Tudor Portrait in Oils
`2D` `2D` · blend: Old Master oil glazing; Hans Holbein, Sir Thomas More (1527); Candlelit Tudor interior

Oil portrait after Hans Holbein the Younger. Paint in layers: a toned underlayer, directional strokes following light and shadow, soft glazes, fine detail last; smooth finish, brushwork faint in background and fabric. Render each material: fur hair by hair, velvet folds with sharp light ridges, metal with two highlights per piece, wool and leather with soft nap. Any subject becomes a formal half-length sitter in its own clothes; its setting shows through a window or in an object it holds. Palette: deep green curtain #1F4A26, black #141113, velvet red #6E0C15, gold #B0801E, fur brown #3E2818; warm, fully modelled skin. Soft light from upper left. Signature shot: the portrait against the curtain; then material close-ups, a slow pull back into a dark room lit by warm pools. Warm varnish, light craquelure. Avoid: flat fills, hard digital edges, even light, unmodelled faces.

### Three-Ink Risograph Night
`2D` `2D` · blend: Risograph overprint; 1967 poster orange-red; Haskell Wexler night exteriors; Silhouette staging

Three-ink Risograph: orange-red #EC5032 as the dominant field (about 60%, with drip streaks), deep blue #162C76 for silhouettes and shadows, fluorescent pink #FF48B0 only for rims and halos, on warm paper #F7F2E7. Each ink is halftoned at its own angle, dots 1/300 of frame width, plates misregistered 2–4 px; grain, pinholes, slight boil. Knock orange out under blue silhouettes so they print pure blue; only the darkest accents overprint to near-black. Light is the absence of ink: beams, lamps and lit ground show bare paper, ringed in pink. Figures: blue silhouettes, pink rims; skin is 30–60% orange with a blue shadow step. At cooler times keep the red field; blue rises only into the top of the sky. Camera: handheld behind someone carrying a light, a reverse close-up, a push. Avoid: blue-dominated frames, smooth gradients, a fourth ink, clean registration.

### Victorian Toy Theatre
`2.5D` `2.5D` · blend: Pollock's toy theatre; Hand-coloured lithograph sheets; Cut card with footlight shadows; Cruikshank caricature

Victorian toy paper theatre (Pollock's), all printed card: black lithographic outlines about 1/400 of frame width, sparse crayon hatching on one side of each piece; muted antique hand colouring: deep red #C8262C and dull gold #E0AB36 on proscenium and curtains (never bright yellow), blue #2F5A9A for costumes; scenery, sky, water and skin in greyed browns, greys and cream card #F4ECD6. Every cut-out keeps a white scissor margin (1/200 of frame width). Flats are parallel 2.5D layers in parallax, flat within each plane. Candle footlights throw each cut-out's shadow onto the scenery behind, about 1.5× enlarged, soft, flickering. Gilt proscenium, red drapes and painted audience boxes frame a stage opening 80–90% of frame width. Camera: slow push, lateral tracking, shaky close-ups; a final pull-back shows the dark room. Avoid: bright vector colour, true 3D depth, soft studio light, figures without margins.

### Warhol Photo-Silkscreen, Double Elvis
`2D` `2D` · blend: Photo silkscreen; Andy Warhol, Double Elvis (1963); Silver paint ground; Off-register colour blocks

Andy Warhol photo-silkscreen. Two plates: a high-contrast black halftone photograph at 45°, dots about 1/200 of frame width, few mid-tones; and hand-painted flat colour blocks underneath, offset about 1/100 of frame width with wobbly edges: taxi yellow #F3BE14, skin pink #F2A197, cream #EFE6CF, red #E2462B, on brushed silver paint #BABCC0 with a soft sheen. The one hero subject takes the strongest block colour. Uneven squeegee pressure: dots flood into blotches in places, drag into dry horizontal streaks and pinholes elsewhere, over faint canvas weave. Repetition is the composition: the same figure or object, full-length, printed side by side two then three times, slightly overlapping, on empty silver. Settings appear only as drained-to-silver prints in the repeat. Camera: handheld shake, a push in, flat frontal tableaux. Avoid: clean even halftone, perfect registration, uniform crispness.

## New Hollywood

### WWII War-Bond Lithograph
`2D` `2D` · blend: Stone lithograph poster; 1942–45 US war-bond and recruiting posters; 45° halftone, off-register colour stones

1940s US war-bond lithograph poster. Flat inks: red #C2342C, navy #213261, olive #5F5C31, khaki #B7975E, on fibrous, foxed cream #E6D5B3 paper. Three values per form (bare paper, flat ink, ink plus halftone), posterised in hard steps. Brown-black key line about 1/500 of frame width, printed last; shadows as coarse 45° halftone bands (dots about 1/150 of frame width) with crayon grain; colour plates offset about 1/600 of frame width. Default: a symmetrical frontal stage, a small subject before a huge graphic shape filling most of the frame (flag, emblem, sunburst), lights as hard pale shapes or bare paper; outdoors too, light falling as a hard pale pool. Lettering optional, in the user's language. Camera: slow push-ins, one crisp pull-back. Avoid: airbrushed gradients, perfect registration, halftone so fine it reads grey.

### 16mm Chase Under the El
`3D` `3D` · blend: three.js 3D street set; 16mm documentary grain; cold cyan-shadow print grade

Gritty early-1970s documentary look in a detailed 3D world, finished as pushed 16mm. Grade: low saturation, high contrast; neutral-cold greys #7A7C7A, cyan shadows #1E2A2C, warm-brown mid-tones #6E4A34 in brick, wood, vehicles (at least a quarter of the frame), never an overall blue; the one hero (e.g. #D97757) stays saturated. Default overcast, sky near-white, at any time of day; sun through any overhead grid (track, bridge, pier) falls in hard stripes. Grain clumps about 1/700 of frame width, ±8% brightness; gate weave, flicker, dust, occasional faint ghosts of bright lights. Dense clutter fitting the place. Handheld cameras ride the action: a low 18–25 mm lens rushing forward as repeated objects strobe past, a rig looking back at the subject, a corner wide. Avoid: clean CG shine, blue tint, empty places, mushy grain.

### Rembrandt Top-Light Oil Painting
`2D` `2D` · blend: Chiaroscuro oil painting; Gordon Willis's top light; Rembrandt and Caravaggio glazing

Chiaroscuro oil painting after Rembrandt and Caravaggio, one overhead light. About 70% of the frame is readable warm dark, mostly umber #24150B, near-black #070403 only in the deepest corners. Amber #8F5D2A mid-tones about 20%; top planes reach #E2B673. The hero stands in the light pool, lit area at least 1/4 of frame height; brows shade the eyes. One red accent #9C1A1A. Darks thin smooth glazes; lights thick impasto, ridged strokes about 1/100 of frame width; modelling soft, never scratchy. Amber varnish, heavy vignette, canvas grain (±3%). A warm bright opening (window, doorway, horizon) may glow behind; a small lamp in frame is a small glow, not a second key. Camera: slow pull-backs and pushes. Avoid: lifting the darks, flat light, faces popping out, frames too dark to read.

### Saturday Evening Post Illustration
`2D` `2D` · blend: Saturday Evening Post cover illustration; Leyendecker block modelling; Jaroslav Gebr's chapter cards

1930s Saturday Evening Post cover illustration. Realist figures, correct proportions, expressive faces, built from blocky planes (lit, shadow, warm bounce from below) filled with blended strokes about 1/150 of frame width, varied in length, following the form, never stripes. Dark contour thicker on the shadow side, 1/800–1/300 of frame width. Warm key from upper left. Palette: plaster #E2C492, oak #764626, slate #28322C, brass #E2B046, ink #341E18; oak and ink darks about a third of the frame; sky plaster cooled with slate, water light slate, skin plaster plus brass. Grainy board (±3%), warm vignette. Default one-point perspective, period detail, haze, secondary figures if the story has any. Each figure is drawn once and moves whole (breathing, sway, sliding along a path). Camera: one long, smooth push in. Avoid: stiff cut-out figures, even outlines, muddy colour.

### Hand-Tinted Sepia Photograph
`2.5D` `2.5D` · blend: Toned silver print; Lewis Hine's Ellis Island photographs; hand-brushed dyes; raymarched 3D figures

A hand-coloured toned silver print from about 1900. Build lit 3D forms, soft key from upper left, then 'print' them: soft focus, light halation, grain heaviest in mid-tones (±5%), full sepia range #281A12, #987048, #EEE0C2; at least a fifth of the frame reaches the dark end, in any light. Figures: real proportions (head 1/7 of body), soft shading. Transparent dyes brushed loosely past edges: the one hero subject strongly (e.g. orange-red #D97757 at 60–80% opacity), a faint touch on one or two props; dyes die in shadow. Light ageing: vignette, silvered edges (grey-blue sheen in border darks), small foxing spots, fine scratches, at most one cracked corner. Frontal, documentary: figures stand still facing the lens. Camera: slow pan across faces. Avoid: toy figures, digital fill colour, low-contrast fog, big mould blotches.

### Hopper-Style American Realism
`2D` `2D` · blend: Edward Hopper realism; hard-edged slanting window light; flat oil planes with dragged strokes

Edward Hopper-style American realist painting. Large flat planes of restrained, pale colour: institutional greens #9EB8A0 and #5E7C66, grey-green floor #7E8876, cream #ECE6D2, on visible canvas (±3%), with a few long dragged strokes about 1/80 of frame width, 5–10% off the base. Low side sun throws hard-edged parallelograms of warm light #FCE6AC on walls and ground, crossed by crisp shadows of frames or railings, indoors or out. Sky pale cream-green; skin warmed cream; clothes darkened greens. Figures painted from 3–4 overlapping soft-edged value shapes, no outline, real proportions; several people stand apart. Stillness, then one sudden event under a second: a whip pan, a burst of light. Signature shot: a still one-point interior, light on the floor. Avoid: heavy outlines, vector figures, dark saturated walls, fuzzy light patches.

### Philadelphia Sunrise, 3D on 35mm
`3D` `3D` · blend: three.js 3D city; 1970s 35mm film grade; Steadicam chase and rising orbit

1970s 35mm realism in a detailed 3D world, sunrise by default (sunset the same). Sun 5–10° up, warm orange #F0A060, lighting the hero from the side or three-quarter front so the lit body and long ground shadows read; no full backlight. Cool blue sky #7FA3CF, pink cloud undersides #E6B2AE; haze golden toward the sun, blue-violet away. Grade: fine grain (±3%), cool shadows, warm highlights, nothing clipped; flare and ghosts only with the sun in frame. Camera: a low Steadicam following the hero from behind up an ascent, then at the top one continuous orbit that circles, rises and pulls back over 6–8 s, showing the lit face, until the place spreads out below. Avoid: flat noon light, detail-less silhouettes, a static climax, plastic CG shine.

### New Yorker Cartoon, Ink and Wash
`2D` `2D` · blend: New Yorker single-panel cartoon; nib-pen ink line; light watercolour wash; hand-lettered caption

New Yorker single-panel cartoon, full-bleed, no border. Nib-pen lines about 1/1000 of frame width on straights, swelling to 1/300 in turns, flicking off at the ends; box corners overlap. Pale watercolour washes with pooled edges over most objects, slipping past the lines by at most 1/150 of frame width: grey #9698A0, sea blue #78A0BE, sand #E2CCA0, rust #C45C32, on cold-press paper #FBF8F1 fading to white at the edges. Exaggerated, expressive figures with drawn faces among everyday props. One hand-lettered caption line under the action, in the user's language, about 1/30 of frame height, appearing letter by letter: a deadpan remark. The drawing holds still; living things wobble. Camera: small drifts and pushes; the frame may split into two side-by-side drawings. Avoid: saturated colour, uniform vector lines, a small framed panel floating in white.

### Andrew Wyeth Egg Tempera
`2D` `2D` · blend: Egg tempera on gesso; Andrew Wyeth; fine cross-hatched strokes

Egg tempera on gesso panel after Andrew Wyeth. Dry, matte, very fine: colour built from dense cross-hatched strokes, each about 1/400 of frame width long, hairline thin. Muted palette: pale overcast sky #D9D5C6, straw grass #CDB27A, umber #6A5234, misty grey-green hills #8E938C, rust #8A4E32; water, stone, clothes and skin mixed from these. One accent colour, only on the one hero subject (e.g. a red cap); any light source is a small pale dot, no halo. Ground (dry grass by default, other ground alike): big light and dark patches, fine strokes, dark tufts, then single wind-combed blades; rocks, buildings hatched along their planes. Empty, lonely space; the subject small, off-centre. Soft overcast light; at other times of day stay pale, no warm glow. Camera: slow drift, quiet push; a circular iris may mark a cut. Avoid: wet watercolour blooms, saturated colour, thick shiny strokes.

### Child's Wax-Crayon Drawing
`2D` `2D` · blend: Wax crayon on textured paper; 6–8-year-old's drawing conventions; hand-lettered labels

A careful 6–8-year-old's wax-crayon drawing on white paper. Crayon catches the paper grain's peaks; light pressure leaves 40–60% paper showing, heavy pressure fills it; overlaps show through. Outlines in black or dark-brown crayon, waxy, wobbling, about 1/300 of frame width. Fills are back-and-forth scribbles, strokes about 1/40 of frame width long and 1/250 wide, rows overshooting the outlines, each area in its own direction, spacing and angle uneven, never a regular mesh. Primary box: red #E0382C, orange #F28A1E, yellow #F7D23A, green #3AA345, blue #2E6BD8. Child conventions: a ground line, flattened perspective, arrowed labels, a smiling sun, one mirrored letter (in Chinese, a reversed stroke), patterns coloured cell by cell. Text in the user's language, in wobbly crayon strokes, not a typeface. Camera: shaky close-ups, then a calm drift. Avoid: neat adult rendering, random scrawl, uniform stipple or mesh, smooth gradients.

## The Blockbuster Era

### Autumn Transparent Watercolour
`2D` `2D` · blend: Transparent watercolour glazes; Winslow Homer and John Singer Sargent; HB pencil underdrawing

Transparent watercolour in layered glazes on cold-press paper. Draw shapes crisply first, then two or three glazes, each smaller and darker, drying to a tide-mark edge; two or three blooms, about 1/10 of frame width, inside large washes, never on figures; light granulation (±4%). Paper is the brightest white; light objects and highlights left as paper. Sky and water wet-in-wet, ripples dry-brush. Roles: autumn gold #ECAA34, scarlet #E46030, rust #B8743C for foliage and accents, against grey-blue mist #C2C6D2 and violet-grey shadows #8A8496; sky pale and cool at any time of day; ground pale green-ochre. Foliage: pale wash, scallop-edged clusters, dark dots, flicked leaves; with few trees, warm colours go to scrub, roofs, clothes. Light from one side. Camera: slow pan, gentle push, leaves drifting past the lens. Avoid: opaque gouache, airbrushed blur, vector edges, muddy colour, saturated sunsets.

### 1924 Paris Olympics Stone Lithograph
`2D` `2D` · blend: Four-stone lithograph; Jean Droit's 1924 Olympic poster; classical anatomical figures

1920s stone lithograph poster in four inks: sea blue #245A8C, ochre #D49640, deep brown #40271B, warm red #E47E62, on aged cream #F1E7D1, misregistered about 1/700 of frame width. Every tone is ink grain, never a flat fill: specks about 1/1000 of frame width in soft clumps, covering 20–40% of pale areas, 50–80% of mid-tones, nearly all of solids (with pinholes); no stray specks on bare paper. Roles: blue for sky, water, cool shadow; ochre for ground and skin; brown for outlines, darks, clothes; red sparingly. Values calm and pale. Classical figures: ochre lit side, brown core-shadow line down each limb, head 1/8 of body; groups in a row. Slow motion carried by spray, dust, hair, cloth. Camera: long-lens front views, ground-level shots; optional serif title band. Avoid: coarse speckle, pictogram figures, vector fills.

### Rajasthani Hand Block Print
`2D` `2D` · blend: Bagru dabu indigo resist; Sanganer block-printed borders; Rajasthani miniature profiles

Hand block print on cotton, Rajasthan style (Bagru, Sanganer). Undyed cotton #EEE5CF is the ground, over half the frame, and the skin colour; indigo #2A3A68 for water or sky bands and patterns; madder red #AA322A for borders, clothing and the hero; turmeric #DEA42C for small motifs; black key block #281E1C for outlines. Stamp blocks about 1/8 of frame height, misregistered 2–4 px, tone jumping slightly at seams even in large bands; dye bleeds along the weave, fills unevenly. Mud-resist crackle only inside indigo, fine and sparse. Carved, rough outlines about 1/300 of frame width. Flat frieze in a paisley and vine border; waves as scallop rows; profile figures with miniature-painting faces, kohl-lined eyes. Camera: pan along the frieze, push in; cut on a turning motif. Avoid: vector edges, perfect registration, faceless figures, dense crackle, indigo flooding the frame.

### Family Album Polaroids
`2D` `2D` · blend: SX-70 and Polaroid 600 prints; Kodacolor snapshots; 1970s–80s magnetic-page album; panning-shot motion smear

1970s–80s snapshots in an open album. Faded dyes: blacks lifted to teal grey about #2F3A3A, creamy rolled-off highlights, mild warm cast, slight overexposure, softness, fine grain (±4%), saturation about 60% of normal. White Polaroid borders, photo-booth strips (four frames stacked), ballpoint captions in the user's language. The album fills the frame, cream pages seen from above in soft, even light, a faint plastic sheen. In a photo, a moving subject gets a panning-shutter look (background smeared sideways, subject sharp); still subjects get shallow depth of field. People look photographed: real proportions, soft shading, slight blur, small faces. Camera: an overhead push into one photo until it fills the frame (about 3 s), a cut into the living scene as colour returns, then a pull-back. Avoid: flat cartoon shapes, crisp modern colour, light shafts, saturated prints.

### Rococo Silhouettes in Gilt Candlelight
`2D` `2D` · blend: 18th-century cut silhouettes; Rococo gilt relief; Candlelight bloom; Schinkel's star vault

18th-century cut-paper silhouettes. Each figure: a solid black profile #0B0705 with its own cut detail (hair, nose, lace holes, props), a 2–3 px pale-gold rim #F7E3A0 (at 1920×1080) toward the nearest flame, and hairline gold lines along clothing folds. Gilt relief #B88A2E and red velvet #6E0F14 frame the scene like an opera box; an outdoor subject becomes a lit painted backdrop on a stage, cut-paper figures in front. Reds and golds fill most of the frame; night blue #0C1A3A only for the far sky. Only the hero gets a painted, coloured face. Candles flicker gently (±5%), warm halos about five flames wide; light haze, vignette, fine grain. Signature shot: silhouettes framing a bright stage far back; slow lateral glide, then push. Avoid: plain black blobs; copy-pasted profiles; blue walls; strobing flames.

### 3D Biplane over the Rift Valley
`3D` `3D` · blend: three.js real-time 3D; David Watkin aerial photography; Warm filmic grade; Instanced flamingo flocks

Real-time 3D like 1980s widescreen location photography: true-scale models with fine detail (e.g. struts, wires, rivets); smooth terrain, not low-poly. Default light: late-afternoon sun low behind the hero as seen from camera, pale cream sky, amber haze, distant ridges in 3–4 paler layers, ochre ground with long soft shadows. Pale overall: about 70% of the frame in light mid-tones, shadows warm grey, not deep brown; under a fifth near-white. Grade: filmic curve, low saturation, light grain, soft vignette. Thousands of instanced birds or animals (e.g. pink #F3B3AE with crimson #DF3F55) lift or scatter in staggered waves as the hero passes. Signature shot: over the moving hero's shoulder across open land; then a high chase 10–20 m up and one shot into the sun. Avoid: cold clean CG daylight; dark sepia; lockstep flocks.

### Combat Artist Field Sketch · Pen & Wash
`2D` `2D` · blend: Fast pen line; Transparent wash; Sketchbook paper; Vietnam Combat Artists Program

Reportage pen-and-wash field sketch. Pen: warm black, fast confident lines ~1/600 of frame width, flicked ends, overshooting corners; quick hatching and zigzags for shadow, on figures and ground. Bold transparent washes with soft wet edges, blooms and uneven pigment (not flat polygons) cover about 70% of the frame, shifted 2–4 px (at 1920×1080) off the line. Colours: olive #70783E, ochre #CEA054, smoke grey #706C70, one hot accent #F0822E for sky and light sources; skin in diluted ochre; sketchbook paper #F2ECDE. Bare paper only in highlights, a thin edge band and brush gaps; light grain. A scrawled pencil note (place, time, weather) in a corner, 1/40 of frame height, in the user's language. Layer for lateral tracks; hard cuts like turning a page. Avoid: polished finish; empty page; muddy washes; heavy noise.

### Gongbi Court Painting on Silk
`2D` `2D` · blend: Gongbi zhongcai; Ruled-line architecture (jiehua); Qing court scrolls; Storaro's colour

Chinese gongbi zhongcai (fine-line, heavy-colour court painting) on aged silk. Far to near, each form: flat base, a wash darkening its lower, overlapped edges, an even iron-wire outline (dark brown, ~1/900 frame width), gold and white lifts. Last, a 30% warm ochre glaze over everything, lines still clear. Minerals: cinnabar #C23A22, azurite #2C5A9A, malachite #3A8A6A, gamboge #E8B830, gold #CAA04A, muted by the glaze; ground and sky mid-value warm silk ochre, never near-white, saturated blue or orange; time of day shows only as overall warmth. No cast shadows or glare. Fine-line water ripples. Ruled-line architecture, every tile drawn; crowds all differ; a lone figure works. Faint silk weave (±3%), brown vignette. Symmetrical one-point composition: a large figure before a deep, ordered space. Slow pushes. Avoid: copy-pasted figures; unwashed flat fills; loose ink wash; poster saturation.

### 80s Airbrush + Raymond's Count
`2D` `2D` · blend: 80s airbrush illustration; Patrick Nagel figures; Hajime Sorayama chrome; Technical-drawing callouts

1980s airbrush illustration with a drafting overlay. Every shape: a hard-edged mask filled with a smooth sprayed gradient, 1–2 px overspray rim (at 1920×1080). Bright, high-key: mint #79BDA6 walls or sky, cream, neon pink #F58CB5 and magenta #C9467F accents, black-and-white checker floor or ground; purple and night under 20%; at other times of day keep mint and cream; pink carries any sunset. Figures à la Patrick Nagel (flat pale skin, few crisp lines, dark hair masses, pink and mint rim light), keeping their own age and dress. Metal and glass in Hajime Sorayama chrome: banded sky reflection, hard horizon line, cross-star glints. Overlay: thin cyan callouts #56E6FF, near-white text #D9FBFF (1/40 frame height), dotted leaders, dashed rings, dimension lines; monospace numbers count whatever the story counts, tally style, as each group is circled. Slow push/pull. Avoid: synthwave suns; UI boxes; soft edges.

### Rockwell-style Oil Illustration
`2D` `2D` · blend: Norman Rockwell oil illustration; Saturday Evening Post covers; 3D-modelled car repainted in oil strokes

Norman Rockwell-style mid-century magazine-cover oil illustration. Near-realistic figures: head about 1/7 of body height, faces and hands modelled from 3–4 value planes, not outlines; readable expressions. Smooth modelling; faint strokes about 1/150 of frame width, following form, each within ±5% of the colour beneath. Default light: warm afternoon sun from the upper left, clear cast and dappled shadows in cool blue-grey; other light keeps a warm key and cool shadows. Palette: cream sky #E6DCC2, brick red #9A4A38, leaf greens, bottle green #1F3A24, soft skin. Gloss reflects surroundings. Background storytelling: busy bystanders where there are people, telling objects when the hero is alone. Light canvas texture, warm varnish, soft vignette. Camera: deep three-quarter wide, slow push, closer cuts ending on a hand or face. Avoid: cartoon faces; texture filters; flat digital shading; empty backgrounds.

## End of the Century

### Field Journal · Pencil & Watercolour
`2D` `2D` · blend: Graphite under-drawing; Transparent watercolour; Iron-gall ink handwriting; Bodmer and Catlin field sketches

A 19th-century field journal come to life: full-colour watercolour over visible pencil. Pencil under-drawing #3A363A, pressure-varied and broken, lightly hatched in shadow, readable through the washes. Brushed washes with soft wet edges, blooms, pooled rims and granulation (not flat polygons) cover about 80% of the frame in rich warm colour. Default magic hour: dusty-rose sky #C88F76 turning lavender above, streaky rose clouds, low sun, ochre-gold land #DEBE87, violet distance, long shadows, opaque pale-gold lifts on sun-facing edges. Yellowed rag paper #F0E4C8, faint stains and foxing, showing through. Iron-gall ink #34221C for small labels and arrows. Signature move, once at the opening (about 2 s): bare pencil, then colour arrives wash by wash, far to near, during a push-in; after that, full colour. Avoid: grey, muddy or pale washes; uniform digital outlines; later pencil-only frames.

### Hand-coloured Natural-history Copperplate
`2D` `2D` · blend: Copperplate engraving; Hand-colouring; Victorian entomology plates; Moses Harris, The Aurelian

A hand-coloured natural-history copperplate. Every object in engraved warm black-brown line: dense parallel and cross-hatching (spacing about 1/400 of frame width, thicker in darks), stipple for soft tones, hatched shadows beneath; sky bare or sparsely lined. Flat watercolour tints inside the line, medium saturation, clearly coloured: paper #EFE3C4, umber #5A3A22, rust #B4431E, yellow #E6AD24, grey-violet #7D6F8E. Plate: the subject as Fig. 1 in the centre, about 60% of plate height, 3–6 numbered part or object figures around it, each about 1/5 high; spaced small-caps title, numbered legend, bevelled plate mark, light foxing. Even daylight; time of day only shifts the tints' warmth; dark interiors go cold, hard side light. Camera: a still plate where one thing moves (insect, leaf, hand), then a slow push to a key detail. Avoid: smooth gradients; garish colour; a tiny vignetted subject.

### Remington Western Oil · Sunset & Nocturne
`2D` `2D` · blend: Remington's warm plains; Remington's late nocturnes; Thick oil impasto; Opening-title silhouette

Frederic Remington-style Western oil painting. Primary register, for anything before full dark: sunset, a red-gold sky (orange into deep red) in long horizontal strokes, the sun on the horizon, land and figures dark warm silhouettes, thin warm rim sunward. Second register, only after dark: a blue-green nocturne (sky #17333A, moonlit edges #9CC4BC, warm window light #FFCC6A on dark ground #1E1C16, rain). Broad, readable shapes first, then loaded strokes about 1/80 of frame width wide, 3–6 times as long, soft broken ends, each within ±6% brightness of the colour beneath, following the surface. Light canvas texture. Low horizon, sky 50–60% of the frame, figures small to medium. Camera: one slow push from a silhouetted wide to the figure. Avoid: smooth gradients; hard-edged flat bands; shattered shapes; grey figures in warm scenes; wide pans.

### Black-and-white Film, One Red Coat
`2D` `2D·B&W` · blend: High-contrast B&W film; Coarse silver grain; Selective colour; Janusz Kamiński

Black-and-white film look: cold neutral greys, a strong S-curve (blacks near #111, whites near #EEE), highlights haloing in haze, a soft old lens, silver grain re-rolled every frame (±6%), slight flicker, rare dust, vignette. Everything is grey except the one hero the story centres on, saturated, mainly clothing (e.g. terracotta #D97757); optionally one red story object (#A3241F–#C9463C). Lamps and fires stay grey, unless a flame turning from grey to warm is the story beat. Long-lens compression, soft foreground branches; in a crowd, no two people alike in build, tone or gait. Default: overcast mid-key, shadows open. Signature shot: high long-lens view of many small walking figures, the coloured one among them; without a crowd, the hero tiny in wide grey space. Avoid: sepia or blue toning; grain-free greys; more than two coloured things.

### Sabuda Pop-up Book on a Real Desk
`2.5D` `2.5D` · blend: Robert Sabuda pop-up engineering; Watercolour and coloured-pencil print; three.js paper cards; Physical depth of field

A real pop-up book filmed on a desk. Every element: a flat die-cut card on parallel folds before a 90° backdrop page, printed with transparent watercolour and grainy coloured-pencil hatching; cut edges show a white core and grey board. Default light: bright window daylight from the upper left, soft shadows between layers. Print colours (sky blue, warm sand, greens) and room light stay daylight whatever the story's time of day; that time appears only in the print (e.g. a low sun, a night sky). Walnut desk #6B3E1E; the room a warm blur. Physical depth of field, focus on the hero's layer. Signature shot: a high three-quarter view of the whole spread. One continuous move: dive into a page, pull back, turn the page instead of cutting, push into the next spread. Avoid: solid-looking cards; dark moody rooms; cartoon faces.

### Illuminated Manuscript with Gold Leaf
`2D` `2D` · blend: Book of Kells interlace; Gothic miniature (Morgan Bible); Luttrell Psalter marginalia; Burnished gold leaf

An illuminated manuscript page (cropped, or an open spread) filling the frame. Vellum #ECDCB4, brown ink outlines #2A1A10, lapis #27469A, vermilion #C43A20, burnished gold leaf on raised gesso, with punched dot rosettes; a slow candle glint sweeps the gold only. Miniature backgrounds are mostly gold (night: lapis with gold stars); gold fills at least a tenth of the frame. Gothic figures in flat colour and ink outline. Celtic interlace, ivy borders, marginal grotesques; the story's text (Latin or the user's language) in broad-nib textura, red-and-blue line fillers, one large gilded initial. Layout: the miniature a window about half the page beside the text column, layered for parallax on pushes; figures may break out. Warm candle from upper left, brown vignette, pigment grain. Avoid: flat yellow for gold; modern typefaces; glints on faces.

### Explorer's Scrapbook Watercolour
`2D` `2D` · blend: Transparent watercolour; Pen notes and handwriting; Scrapbook collage: tape, photos, maps; Amber-sepia grade

A traveller's scrapbook, crowded edge to edge with 6–10 overlapping items, some running off frame: a taped watercolour (the main image, about 40% of frame), a hand-drawn map, a sepia photo, printed pages, handwritten notes, a pressed flower; each softly shadowed, with yellowed tape. The watercolour: wet-in-wet washes, warm ochre lights, hard-edged violet-rose shadows, pen contours, pooled edges, clear value contrast. Palette: amber paper #E8D6B0, sepia #6B4A2E, ochre #D08A3C, rose-violet #9C6A86, ink #2A1E16. Inside the painting: one warm source (torch, lamp) pooling in a dark foreground, bright sky beyond. Light amber grade on the page only, never muddying the painting; vignette about 20%, faint grain. Signature move: push into the painting until the page edges slide out. Avoid: smooth gradients; sparse tidy layouts; panning while a page frames the painting.

### Blueprint Developing into 3D Sunset
`3D` `3D` · blend: Shipyard general-arrangement blueprint; three.js ship at true scale; Russell Carpenter's colour; One continuous camera move

A blueprint turning into photoreal-leaning 3D. Opening only (1–2 s, under 15% of the film): white edge lines about 1/800 of frame width on Prussian-blue paper (#12306B to #244D8F), hidden lines dashed, figures and terrain as contours, uneven exposure, folds, lettering. A dolly-zoom stands the elevation up into perspective; colour spreads from the hero along a soft warm edge, ghost lines fading within a second. Then the signature look: golden-hour real 3D, low sun, amber highlights #F2B860, warm shadows #3A2530, sun glitter on water, soft mist, shallow focus, gentle bloom, fine grain; then blue hour and night, warm lights coming on. One unbroken move: push in and stand up (blueprint), then, in equal shares, drift low past the hero, rise and orbit, descend. Avoid: lingering on the drawing; hard cuts; flat CG light.

### Hilliard Elizabethan Miniature
`2D` `2D` · blend: Portrait miniature (limning); Body colour on vellum; Shell gold; Crimson damask still life

Elizabethan portrait miniature in Nicholas Hilliard's manner: opaque watercolour laid flat on warm vellum, very fine hatching in shadows (lines about 1/1000 of frame width), lead-white dots on lit edges, red-brown outlines. Palette: ultramarine ground #203E92, shell gold #D6B05C (granular flecks, a few burnished highlights), carmine #A8202C, lead white #F6F2E8, verdigris #346C40. Signature shot: the picture inside a gold-rimmed oval locket lying on rust-red damask; a flowering white eglantine briar fills the oval behind and around the subject; a short motto in gold Roman capitals arcs along the top. The oval's ground stays ultramarine; landscape and sky go in as flat colour bands. Wide scenes may leave the locket, same method, true perspective. Slow push, slight tilt; only flowers, cloth and gestures move. Avoid: airbrush gradients; thick oil strokes; flat yellow gold.

### Suburban Symmetry + DV Camcorder
`2D` `2D` · blend: Conrad Hall frontal symmetry; Rose-petal fantasy; 1990s DV camcorder video

Two registers. Primary, about 70%: a clean, saturated illustrated frame, dead-on symmetrical, the hero centred before its home or setting; every shape softly modelled in 2–3 tones, dense detail (shrubs, flowers, foliage of many small leaf clusters). Default bright daylight; under other light stay bright (gold at sunset), never dim. Red accents like a door #C3141F, white trim, saturated greens, orange-red autumn trees; warm grade, light vignette and grain. Transition: curled red petals or leaves (about 1/60 of frame width) thicken into a 1-second blizzard across the lens, hiding the cut. Second register, about 30%: the same world as 1990s DV home video: soft, low-res, chroma bleed, macroblocks, interlace, noise, breathing exposure, greenish shadows, REC/battery/date OSD. One register per frame. Slow push-ins. Avoid: video artefacts in the clean part; real brands' OSD; flat vector shapes.

## The New Millennium

### Roman Floor Mosaic
`2D` `2D` · blend: Opus vermiculatum tesserae; Gold-leaf glass smalti; Zliten gladiator mosaic

Roman floor mosaic: over a flat underdrawing lay square tesserae about 1/150 of frame width: two to three courses follow each outline (opus vermiculatum), flat areas in straight rows, figures outlined with one course of dark stones. Muted, warm stone and glass: burnt gold #E2B24C, umber #5B4332, terracotta #8E3C2B, warm marble #E9DDC4, with imperial-purple glass for one accent only; sky and water in pale grey-blue and cream stone, never saturated bands. Tesserae slightly irregular, lit from the upper left, shadowing into dark 1–2 px grout; gold-leaf glass glints slowly on light sources. Frontal, slightly stiff Pompeian figures before a faded field of fine stones. Short pushes and pulls; motion from details (a gesture, a crowd, plants, a light shaft). Avoid: a neat grid that reads as pixel art; oversized tiles; smooth gradients; bright grout.

### Window Marker & Chalk, Gold Pattern
`2D` `2D` · blend: White china marker on glass; Blackboard chalk; Glowing gold pattern lines; Deakins window light

Handwriting as the image: translucent white wax-marker strokes (about 1/300 of frame width) appear stroke by stroke on a window of square leaded panes: formulas, figures or notes about the subject, in small blocks on a quarter of the glass. Outside, the subject's world, soft-focus, mid-toned and warm (overcast gold, muted green), never brighter than the writing. A warm interior (shelves, green-shaded lamp, amber light) frames the window. At the key moment, chosen symbols brighten and soft gold lines join them into a star or polygon, lights running along. Variant: chalk on green slate with ghost writing. Palette: slate green #2F3E35, chalk white #F1EFE6, lamp amber #E0A050, soft gold #D9B45A. Camera: slow push-ins, each cut closer to the writing. Avoid: HUD graphics; typed fonts; writing filling the glass; cold blue outside.

### Fosse Stage in Red and Black
`2D` `2D` · blend: Bob Fosse staging; Red-rimmed backlit silhouettes; Neon and sequins; Chicago 2002 poster colours

Bob Fosse-style Broadway stage number. Black stage, but about 40% of the frame glows signal red #D0202A: a row of dark barred cells, each backlit red through haze, bright at centre, falling off to black, plus red curtains; hard-edged spots. Dancers are full-bodied black silhouettes with costume shapes and a 2–3 px red rim. One big neon shape (letter or pictogram) in orange-red #FF5A3C, white-hot core, slight flicker, set against black so it reads; glossy black floor reflects it; marquee bulbs #FFD9A0 at the stage edge. The hero, in a warm-white follow spot #FFF1D6, is the only lit figure in its own colours. Accents: sequins, white gloves. Moves on the jazz beat; cells snap on one by one. Push in to end in the follow spot. Avoid: flat even fills; extra colours; rimless silhouettes.

### Alan Lee Watercolour & Tolkien Map
`2D` `2D` · blend: Watercolour and pencil concept art; Tolkien-style parchment map; Alan Lee and John Howe

Fantasy concept-art watercolour and pencil on warm paper. Transparent washes, granulated (pigment speckle, ±6% brightness), a few blooms, darker pooled edges; every contour and ridge carries a dark-brown pencil line (about 1/800 of frame width), short hatching on shadow sides. Aerial perspective: 3–5 receding planes, each paler and cooler. Light is the subject: one strong source per scene (sun, fire, lamp, molten glow) burning through haze, its ember glow on about a quarter of the frame, about half the frame in deep umber and violet shadow. Palette: parchment #E9DCC0, deep umber #3A2418, ember orange #E07A2E, hot red #B23A1E only at the light's core, lavender #B8A8C8 for distance. Journeys may cut to a Tolkien-style map, never the main look. Camera: long lateral pans, slow push-ins to the hero. Avoid: smooth digital gradients; vector shapes; pale frames.

### 16-bit Arcade Fighting Game
`2D` `2D` · blend: 16-bit pixel art; Arcade fighting-game HUD; CRT scanlines

An original 16-bit arcade fighting game. Draw at 320×180 and nearest-neighbour upscale by a whole number (×6 for 1080p); CRT scanlines (alternate lines ~15% darker). A side-on arena from the subject's world, flattened into stage and backdrop (e.g. a ring with a dark purple crowd band #1D1435). UI in a self-drawn 5×7 pixel font: two health bars (yellow #F5C53A, red damage trail), timer, banner, ROUND 1 / FIGHT!, combo counter. Chunky sprites about 50 px tall, 1-px highlights, dark outlines, ~32 colours per frame. The story becomes a contest between the hero and a rival (if none exists, personify an obstacle: a storm, a deadline). Hits spark, freeze 3–4 frames and flash white; the loser is knocked back, then K.O. and WINNER. Fixed side-on camera, no cuts. Avoid: real games' characters or logos; anti-aliased pixels.

### LA Night Light Trails & Snow
`2D` `2D` · blend: Long-exposure night photography; Sodium orange and neon cyan; Anamorphic bloom and film grain

Long-exposure night street photography. Sodium-vapour orange #F2A24A washes structures, signs and wet ground (about half the frame in warm light), against cyan neon #3FD0D8 and the odd red-blue emergency light; blacks cyan-tinged, never grey. Layered composition: foreground pavement with figures, lit shopfronts and signs mid-frame, roads or bridges crossing the upper third (away from cities, a lamp-lit road in the subject's own setting). Headlights become thin continuous ribbons (about 1/150 of frame width) along those roads, white #FFF4E0 and red #E0303A, glowing with hot cores. Snow: three layers of short soft streaks, seen only in light cones. Finish: two-level bloom, blue lens streaks, edge bokeh, vignette, moving grain. The hero stands sharp in a lamp cone mid-frame; only traffic streaks. Camera: one continuous tilt, pan and rack focus. Avoid: evenly lit snow; empty black frames; dotted trails.

### Street Stencil on Boston Brick
`2D` `2D` · blend: Multi-layer spray stencil; Banksy's rats; Red-brick wall texture; Halftone paste-up poster

Street stencil graffiti on an old red-brick wall. Each piece is 3–5 stencils sprayed as flat colour, photo-derived in look (smallest cut detail about 1/200 of frame width): hard cut edges, soft overspray where a stencil lifted, spray dots, drips, stencil bridges. Palette: black #151312, mid grey #8C8A85, gold #C99A2E, red #C3261F; brick #7A3224, cream painted patches under the main pieces. Brick relief, mortar and rain streaks show through, so paint sinks into the joints. A busy wall: several pieces side by side, short hand-sprayed slogans about the subject (user's language), old tags, a torn halftone paste-up. Light: soft raking daylight, mild contrast, a faint swaying wire shadow; no heavy vignette. Camera: pieces spray on layer by layer, then close-ups and lateral tracks. Avoid: clean vector edges; paint floating on the brick; too many colours; a dark wall.

### 3D West Texas Dusk, Deakins Light
`3D` `3D` · blend: Real-time 3D (three.js); Roger Deakins dusk light; Desaturated film grade

Photoreal-leaning 3D landscape at dusk. Sky fills 60% of the frame, dusty ochre #D8A060 at the horizon up to pale cream, thin streaked clouds lit from below. Sun 1–2° above the horizon, still casting shadows; its light burns along the far ridge. Low saturation: hundreds of grey-green scrub clumps receding to the horizon, stones, dry grass, dark warm earth #2A2622 (default arid; elsewhere keep sparse clumped growth). The hero stands backlit in the mid-ground, about a third of frame height, long shadow toward the lens. Expose for the sky: the sun may clip, its glow within a tenth of the frame. Grade: neutral tone mapping, warm highlights, fine grain, vignette. Signature shot: locked, low, wide (~35 mm). Avoid: saturated orange sunsets; blown-out glare; bare ground; busy camera moves.

### Quiz-Show Studio & Mumbai Orange-Teal
`2D` `2D` · blend: TV game-show lighting; Blue-violet beams and lens flares; Anthony Dod Mantle orange and teal

Two registers. Primary, about 70%: a glossy illustrated quiz-show studio, bright and full, seen three-quarter from slightly above: a glass stage lit from below with concentric blue rings, a packed audience behind, moving-head beams cutting blue-violet #5A3FD0 through haze, a big screen of elongated-hexagon answers, one locked in amber #F0A020; bloom and horizontal flares; as tension rises the edges dim to about half, never black. Characters rounded, softly shaded. Second register, about 30%, as full-frame hard cuts: golden-hour views of the subject's home ground, saturated orange and teal, busy (e.g. tin roofs, washing lines, crowds). Accents: magenta #E2206B, teal #0F7C7A, tangerine #F06A14. Camera: push in on screen and hot seat as beams close on one person; elsewhere slow pans. Avoid: real show logos; a mostly black studio; even lighting; grey, empty places.

### EOD Technical Manual Line Art
`2D` `2D` · blend: Military technical-manual line drawing; Exploded-view diagram; Typewriter callouts; Olive and sand flat tints

Military technical-manual illustration. Warm off-white paper #EFEADB with a faint engineering grid, uniform black ink #1B1A16 (outlines ~1/700 of frame width, hatching thinner), shading only by hatching, ground by stippling, flat tints of olive #6C6D42 and sand #D9C79C on 20–30% of the drawing; lights as ray lines, not glows. Main figure: a one-point-perspective view of the subject's setting filling most of the page; around it exploded views of the subject's key object along a dash-dot axis, circled numbers on leader lines, a parts table, WARNING and CAUTION boxes, typewriter labels (user's language) and FIG numbers, a black chapter card. Animate on twos: parts slide apart, a tool works, a figure walks. Camera: whole page, then cuts to enlarged insets. Avoid: gradient shading; too much colour; decorative fonts; sparse pages.

## The Indie Decade

### Peeling Wall & Gold Broadcast Booth
`2D` `2D` · blend: Painterly digital oil texture; Peeling layered-paint wall; 1930s broadcast booth; Gold sound-wave lines

Painterly interiors where the wall carries the image (outdoor subjects move into a related room with a window). Primary: a diamond-tufted padded wall in gold #C9A050 over deep brown #3A2610, brass button highlights, a warm glow behind the sound source (e.g. a hanging microphone). Secondary, for quiet scenes: a cool grey-green wall worn through to blue, pink, ochre and plaster, with damp lines and fine cracks; patches irregular, under a third of the wall. Clean-edged shapes under a subtle brush texture (strokes ~1/120 of frame width, ±5% brightness); faces, small objects crisp. Sound: 4–8 thin gold oscilloscope lines crossing the wall, spiky, later smooth. Figures in a corner, lots of wall. Camera: slow push-ins, one close-up of the source. Avoid: centred symmetry; coarse dabbed strokes; map-like peel; neon-bright waves.

### Polished Silent-Film Black & White
`2D` `2D·B&W` · blend: Late-1920s silent-film black and white; Art Deco intertitle cards; Hollywood studio glamour light

A modern homage to late-1920s silent film in black and white. Clean tones: glowing highlights, soft mid-greys, deep blacks; a gentle S-curve, grey halation around lights, slight flicker (±3%), fine grain, rare dust, a 1.33 pillarbox inside 16:9. Intertitles on black with an Art Deco border and spaced capitals, in the user's language. Settings: the subject's world staged as grand, ordered interiors or stage sets (e.g. a wrought-iron staircase, a gilt proscenium, a crowd in backlit silhouette); figures in elegant profile. The one hero subject the story centres on is the only coloured thing, wholly in tones of terracotta #D97757; lamps and fire stay grey. Camera: smooth push-ins and pull-backs, title cards flashed in, cuts landing on gestures (a bow, a wave). Avoid: heavy scratches; sepia tint; colour bleeding into the greys.

### Jack Kirby 70s Comic Page
`2D` `2D` · blend: Jack Kirby cosmic comics; Ben-Day four-colour print; Aged newsprint; Lord of Light concept art

1970s Jack Kirby comic page. Heavy tapered brush contours, feathered spot blacks, exaggerated perspective, Kirby Krackle energy bubbles, block sound effects, hand-lettered balloons and yellow captions. CMYK flats printed as 45° Ben-Day dots: cyan #1696CD, magenta #DE2C70, yellow #FFD616, black #1C161A on aged newsprint #EEE2C2, colour plates 1 px off register. Paper grain, browned edges, a gutter fold shadow, warm lamp falloff. Lay the story out in panels and move between them: push into the splash, pan along a strip. Dots stay round and grow into pop-art dots on push-ins. Avoid: smooth digital gradients, clean white paper, stiff tube-like machines.

### Cased Daguerreotype, Developing
`2D` `2D·B&W` · blend: 1850s cased daguerreotype; Hand-tinted tintype; Studio still life

A cased 1850s daguerreotype, developing. Signature shot: the silver plate fills about 85% of the frame width inside a beaded brass mat #8a6a2c with a rounded-rectangle opening; velvet and leather only at the edges. Greyscale silver, near-black #1c1a18 to pale #ecebe6; a thin blue-violet to amber tarnish halo round the opening. Light swirls, hairline scratches, specks (±4% brightness). Soft window light from upper left; the subject poses still before a plain backdrop (an outdoor place is painted on it). One shot: the camera pushes from the open case to this framing in ~1 s, then holds; the image develops from blank mirror-grey, shadows first, a front sweeping left to right, done by ~3 s. Only the story's one hero is hand-tinted: a translucent flat wash (e.g. #D97757), shading showing through; lamps stay grey. Avoid: sepia, a small plate, fast cuts.

### 3D Backstage Long Take
`3D` `3D` · blend: Real-time 3D (three.js); Lubezki handheld long take; Tungsten and fluorescent light; Digital-cinema grain

Real-time 3D, one unbroken handheld long take, after cinematographer Emmanuel Lubezki. A narrow, lived-in passage (default a backstage corridor; an outdoor subject gets its nearest interior, e.g. a stairwell): chipped blood-red enamel dado #6e2a22 on the lower third, stained nicotine plaster #cdb98e above, pipes, cable trays, doors, pinned notices. Light only from practicals every 2–3 m: warm caged tungsten bulbs, one cold flickering fluorescent tube, a red exit sign #ff2a1a; the far door glows. Mid-key: plaster light near lamps, never below mid-grey between them; floor visible. Wide lens (18–24 mm), slow sway (±1°), soft ambient occlusion, light bloom, fine grain (±3%). Over 20–40 s, in any order: lead the subject walking backwards, whip aside to a doorway, let it brush past the lens, turn and follow. Avoid: a locked-off camera, blank walls, repeated textures, a crushed dark frame.

### Microfiche Reader, Newsprint Halftone
`2D` `2D` · blend: Library microfiche reader; 2001 newspaper CMYK halftone; Phosphor-green monochrome

A 2001 newspaper colour halftone on a library microfiche reader. Signature shot: the picture fills the frame, no headline or columns; lines and lettering inside it stay solid. CMYK screens at 15°, 75°, 0°, 45°, dots about 1/250 of frame width, 1 px misregistration. Convert to low-contrast phosphor-green monochrome, dots still clearly visible: film base #1b2320, frame gaps #0c110f, highlights no brighter than #a0dcaf. Only the story's one hero keeps its colour, whole figure (e.g. #D97757), screened and equally low-contrast; every light source turns green. Scan lines every 3 px, a faint scan bar every 4 s, a lamp hot-spot, dust, a hair, a light rounded hood vignette (outer ~5%), a small monospace fiche index. Scene changes slide the fiche sideways past a dark gap (0.5 s); slow push-ins. Avoid: newspaper layout, colour leaking, hard cuts.

### Moonlight-Blue Oil Portraiture
`2D` `2D` · blend: Oil portrait brushwork; Teal / magenta / violet duotones; Split-level waterline camera

Night oil portraiture: smooth volumes repainted in two passes of short, low-contrast (±8% value) form-following strokes: broad (1/60 of frame width) on water, sky and cloth, fine (1/150) on faces, which stay smooth. Palette by role: sky, sea and far land mid blue-violet #32377a, about 60% of the frame; moonlit planes and sand pale lavender-blue; teal #128a91 in water and lit sides; magenta #7a2f86 rim; deepest shadows #07071c. Any skin takes blue top planes and a wet highlight, eyes open and lit. Default night: one key, a full moon with a broken glitter path on water; magenta only as a soft rim from a distant glow; other small light sources stay cyan-white points. Grain ±3%. Signature shot: the figure calm, ~2/3 of frame height. Slow push-ins. Avoid: coarse dabs, small dark statue eyes, a murky frame.

### 3D Underwater Teal Caustics
`3D` `3D` · blend: Real-time 3D (three.js); Projected caustics and volumetric light shafts; Dan Laustsen teal-and-gold grade

Real-time 3D, fully under water (land subjects sink into a flooded room or sunken place), in teal: background #041414, hemisphere light #5fb3a6 above and #0c2a24 below; teal fog, reds fading first with distance. A strong source above the surface projects moving caustics: bright cells about 1/20 of frame width on near surfaces, sliding over floor, walls and the subject. Shafts fan down; edges stay dark. Bubbles, motes, the rippled surface from below. Warm gold on 1–3 practicals, at least one large (a lit window or lamp ~1/10 of frame width), plus cyan bioluminescence. Smooth-shaded models, ambient occlusion, shallow focus, modest bloom, grain ±3%. Signature shot: low angle looking up, the subject half the frame height, off-centre beside the light; slow push-ins. Avoid: flat water, caustics as sky stripes, tiny warm accents.

### 1960s Linen Postcard
`2D` `2D` · blend: Curt Teich linen postcard; "Greetings from" large-letter type; Airbrushed hand colouring; Offset-litho misregistration

A 1950s–60s linen postcard, Curt Teich manner. Linen-weave card: ink only on raised threads, a fine crosshatch about 1/300 of frame width, white specks in the hollows. Saturated hand-separated colour, airbrush blends: sky blue #3fa0dc, grass green #4fae57, pink #f08cb0, teal #2fb5b8 for the main object or water, cream card #f6e4b8 for paper and border. The main object large, side-on, about half the card's height. Star glints on shiny surfaces; registration off 1–2 px. Big navy 3D block letters with white outlines across the top third spell the place or title (invent one if needed), a small scene in each letter, a red ribbon banner above. Open on the card on a desk, push in until it fills the frame and comes alive (water, figures move), then track sideways. Avoid: weave-less gradients, greyish colour, photographic perspective.

### Architectural Section Axonometric
`2D` `2D` · blend: Dimetric section drawing; Architectural poché and scale figures; Rainy-night colour grade

Vector section axonometric, low dimetric view: the cut face lies along the near-flat 7° axis, facing us, depth along the 42° axis at half scale; roof and near walls cut away to show the rooms. Cut through the subject's place (a house, a tower, a ship, a hillside). Poché on cut faces: dark concrete with aggregate, earth hatched at 45° with stones. 1 px dark-grey lines at every zoom. Default daylight under a pale sky: concrete #b3ada2, oak #d6b58a, charcoal #3e4146, pine #3f6b3e, white walls, green lawn, translucent blue water. Furnished rooms, simple scale figures. Night or other low light is a variation: multiply 30–40% moonlit blue, lit rooms painted back warm. Crane slowly framing 2–3 rooms along one continuous path; end on the whole drawing at ~80% of the frame. Avoid: 30° isometric, thick outlines, cuts between levels, a small drawing.

## Here & Now

### Magic-Hour Soft Pastel
`2D` `2D` · blend: Soft pastel on toned paper; Magic-hour dusk palette; Paper-tooth texture

Soft pastel on grey-violet toned paper #7d7079, tooth showing everywhere as fine speckle (±8% brightness). Sky blended smooth, a few long thin cloud bands. The land carries the texture: dry-grass ochre (gold dulled toward the paper grey) under fine upright grass strokes (1/400 of frame width wide, 1/40 long, ±15% value), dense in the foreground, thinning toward the horizon. Objects get soft diagonal hatching, broken edges. Palette by role: gold #f6cf7a at the horizon, rose #c9738a in the lower sky, violet #4b3f78 for high sky, clouds and far land, dusk blue #2b2d5c for shadows. A long horizon near mid-frame over open land or water; the subject mid-sized in the lower half. The sky drifts gold to rose to violet; lamps brighten as it darkens. One slow pan with a light push-in. Avoid: oily impasto, sharp edges, bare smooth ground.

### Scrimshaw on a Whale Tooth
`2D` `2D` · blend: 19th-century whaler's scrimshaw; Burin hatching and stipple; Tabletop product lighting

Scrimshaw: 19th-century sailor's engraving on a whale tooth. Signature shot: a broad, flat-sided tooth lies horizontal on an oak table, about 85% of frame width and 70% of its height; ink bottle, jackknife beside. Engrave in near-black #17110c: needle hatching (lines 1/800 of frame width, spaced about 1/500), swelling outlines, stipple. Lines cover ~70% of the face, dense in sea, subject and land, sky lightly hatched; seas as rows of stylised waves. The hero is large (~1/3 of the tooth's height), coloured; otherwise red #9a2a22, blue #2b4a78, yellow #e9b526 only as small touches. Warm ivory, growth bands, scratches, honey tip. Folk layout: rope border, ribbon motto, rayed sun, motifs from the subject's world. Shade the edges, one gloss streak; don't warp the picture. Push in, then pan slowly as waves animate. Avoid: thick lines, solid fills, a slim horn.

### Ray-Marched Multiverse Jump-Cuts
`3D` `3D` · blend: GLSL ray-marched universes; One look per universe (office realism, cosmic surreal, landscape, commercial); Googly-eye rainbow mandala

Ray-marched real-time 3D multiverse montage: the subject jumps through 3–4 universes, each its own look, invented from its world, e.g. a realistic workplace under cold green fluorescents, densely dressed; a surreal cosmic version with a gravitational-lens halo; a silent wide landscape with white subtitles; a candy-pink product shot with pink-and-cyan rims. Each holds 2–4 s with its own grade. One link through all: a googly-eye sticker on the subject, about 1/10 of frame height. Transition, 0.5–0.8 s: push into the eye, smear, split RGB, then a rainbow ring of colour segments (#e5322d, #f7c928, #1fa39a, #2a6fc0, #e0478f) studded with googly eyes and pink beads blooms to ~80% of frame height and bursts to white. Signature frame: the ring around the subject; first jump at ~1 s. Avoid: look-alike universes, a small plain ring.

### 3D Particle Fireball, IMAX Grain
`3D` `3D` · blend: Real-time 3D (three.js); GPU particle simulation; IMAX 65 mm print grade; Trinity test high-speed photographs

Real-time 3D night lit by one huge particle event: a ~500k-particle fireball (or flare, eruption, wildfire) whose shape follows time: white flash (0.5 s), billowing dome by 1 s, a rolling toroid, a dust wall sweeping out. Right behind the subject like a halo, ~40% of the frame: white-gold core, bright orange-gold billows #ff9a50 with visible texture, black smoke only as thin veins and the top edge (under 15%). Its glow fills everything: warm #ffd8a0 on ground and cloud undersides, a hot rim on the subject, faces lit warm at half strength; long shadows toward camera. The rest is pre-dawn blue #2a3654 and dark earth #16120e. Clip only the core. IMAX grade: grain ±3%, warm halation, vignette, slight gate weave. Low wide angle, subject centred, slow push-ins. Avoid: a smooth CG ball, smoke-shrouded fire.

### Snowy Neon Night
`2D` `2D` · blend: Neon tube signage; Wet-ground reflections and snow; 35 mm night photography

Photographic 2D neon night. Real tubes: glass tube, glow, bright tube, white-hot core, clips, dark jumper wires; rare flicker (every 5–10 s). Neon pink #ff4fa8, cyan #4fdcff, orange #ff9a2e, green #3dff9a plus warm sodium light over a deep purple-blue night #1e1838. Put neon where the subject's world allows (shopfronts, a harbour bar, its own building). Wet ground fills the lower quarter: signs stretch into long vertical reflections broken by plank gaps, paving joints or ripples; snow falls and drifts at the edges, tinted by the spill. The subject keeps a warm key on the face (a lamp, a window, its own light), narrow neon rims on both sides; the distance melts into bokeh. Bloom, vignette, grain ±3%. Short 2–3 s shots, new angles on one place, each a slow push-in. Avoid: flat neon lettering, strobing.

### 3D Dip-Road Chase, Long Lens
`3D` `3D` · blend: Real-time 3D (three.js); Extreme telephoto compression; Heat haze and road mirage; VistaVision fine grain

Real-time 3D, bleached desert daylight. Signature shot (3–5 s): a straight road over rolling dips and crests at a 2–5° horizontal field of view, stacking dips into waves; the travelling subject sinks and reappears; sky a thin band at most. Then 1–2 s each, a low camera at a crest, a mount on the vehicle or rider. Palette: sky #7fb0e0, haze #ece4d2 only at the far horizon, pale sand #d2ae80 (never orange), hard sun #fff0d8 from high to one side, the main vehicle faded seafoam #86b5ad. Contrast: dark cracked asphalt, crisp shadows, dense green scrub, roadside posts. Default midday; at other hours keep hard sun. Heat shimmer and mirage grow with distance; dust on landings; vehicles leave the ground over crests. Grain ±2%. Avoid: wide lenses, a washed-out frame.
