---
id: "riso"
name: "Risograph print"
kind: "style-reference"
source: "animate"
source_url: "https://github.com/cth9191/animate/tree/main/plugins/animate/skills/animate/styles/riso"
license: "MIT"
poster: "posters/riso.jpg"
one_line: "A three-ink print on cream paper: screens at their own angles, overprints instead of mixed colours, plates a few pixels off register, ink dropouts, on 2s."
---
# Risograph print

A three-ink print on cream paper: screens at their own angles, overprints instead of mixed colours, plates a few pixels off register, ink dropouts, on 2s.

A reference for the design desk to blend one or two traits from, never a preset that replaces the film's bespoke system. Never cite it as the whole look; the signature features below are what a blend must keep if it names this style. Numbers marked (measured) were read off a real print animation by the source; the rest is the source's working values.

## Essence, and what it is not

The rule: nothing is painted, everything is printed. A frame is one sheet of paper run through three spot-ink plates. A plate says only how much ink goes where (a tone 0 to 1); a halftone screen turns the tone into dots at that plate's angle; the inks multiply. There is no black ink and no white ink: a dark is all three inks overprinted, a white is bare paper.

Not: a flat vector look with a texture filter on top, a halftone newsprint (one ink, black), a duotone photo, or a posterised gradient. The look is in the plates and the register, so a grain or noise layer over a smooth picture does not make it.

## Materials

- Paper (measured): (241, 235, 226), `#f2ece3`, almost flat (std about 1); only faint fibres and specks. Anything more mottled reads as dirt on a phone.
- Three inks: teal `#3689ab`, fluorescent pink `#dc44a0`, yellow `#eede1e`. Mixes are overprints: pink + yellow = coral, teal + yellow = green, teal + pink = ink-blue (the hero colour), all three = an olive-black, never `#000`.
- Overprint law, per colour channel: paper x the product over plates of (1 - coverage x (1 - ink/paper)).
- Screens (measured): teal 15 degrees, pink 75, yellow 45, so overlaps moire like a real print. Tone in 20 steps; to 50% a round dot of radius cell x sqrt(tone/pi), above 50% the solid with paper holes at the cell corners; tone 1 is solid (type and lines stay crisp).
- Pitch belongs to the illustration and scales with it: fine 7 px for tags and lone props, world 10.8 px for a full-frame world, field 17.5 px for a coarse far field (at 1080 wide). One layer, one pitch.
- Register (measured): pink about (+4, -3) px and yellow (-3, +4) px against the teal key, jittering 0.3 px between boil variants. Dark edges show coral and yellow fringes; ink-blue edges pink and teal ones.
- Wear: about 0.6% of pixels per variant lose one plate (1 to 2 px specks); a few dozen tiny single-ink specks sparkle inside large darks.
- Fills knock out the plates under them (a pink detail on a dark ground must be knocked, or it turns ink-blue); lines overprint. A glow is a grey gradient on one plate, which the screen turns into a ramp of dot sizes.

## Colour logic

- Decide every colour as plate tones, then check what the overprints give for free: two inks make a third.
- White is paper: eyes, highlights, grout, type on a dark are knockouts, never a white ink.
- Keep the paper flat: no vignette, no mottle, no grain filter over the print.
- The camera moves the dots with the picture (the screen never swims under it, as in a filmed print).

## Type

- Type is printed: solid tone 1, misregistered with everything else, at screen size after the camera move. A small tag as a yellow slip on a screened pink block, a caption as a paper card with a teal rim, written on.
- A chunky rounded display for headlines, a geometric sans for tags; no thin weights (a fine screen eats them).

## Motion

- On 2s: steps every 2 frames, the hand wobble reseeds each step, and registration, line pressure and dropouts cycle through 3 variants, so the print shimmers without crawling.
- Cuts, world changes and cues on the 8th grid (at 120 BPM and 24 fps that is 6 frames), fast onsets on 16ths (3 frames).
- Worlds open as circles with a rough teal rim: a vignette circle grows over 4 frames (radius 172, 252, 293, 308 then 310 at 1080 wide) and shrinks over 3; an iris cut shows the new world in a circle, then bigger, then full frame.
- Film-wide print grade (not built yet, see `TODO.md` R4 "animate 3"): three plates, re-screen per angle, register jitter per variant, dropout specks, as a finish step rather than per element.

## Camera grammar

- Flat orthographic, locked or a slow push; the camera transform is composed into every layer so the screen travels with the picture. Hard cuts or circle wipes only; no dissolve (a dissolve is a smooth gradient, which this medium cannot print).

## Signature features

1. Every colour is plate tones: the picture uses three inks and their overprints only; no RGB gradient, no black pixel, no white ink.
2. Darks are three-ink overprints with visible dropout specks; whites are bare paper knockouts.
3. Halftone dots at three different screen angles (15, 75, 45 degrees), the dot size changing across a gradient, with one pitch per layer.
4. Visible misregistration: pink and yellow fringes peek out on opposite sides of a dark or ink-blue edge.
5. The motion is on 2s with a 3-variant shimmer; the paper stays flat.

## When to use

- Playful, human, craft-led films: a small shop, a zine, an indie product, a morph chain of friendly objects; anything that should feel made by hand in a print room.
- Short worlds that morph into each other through a shared circle or a shape.

Avoid when: premium or technical brands that need a precise, clean surface; dense UI demos or small text; photo-real subjects; anything needing a soft glow or depth of field.

## Source and licence

cth9191/animate, `styles/riso/STYLE.md` (MIT, copyright 2026 cth9191). Summarised in our words; see https://github.com/cth9191/animate/tree/main/plugins/animate/skills/animate/styles/riso and `third_party/animate/`. Not matched: the kit code, the hero character and the demo.
