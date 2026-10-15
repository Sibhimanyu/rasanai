---
id: "pixel"
name: "Pixel art / 8-bit"
kind: "style-reference"
source: "mg-styles-15"
source_url: "https://github.com/Vincentwei1021/mg-styles-15"
license: "MIT"
poster: "posters/pixel.jpg"
one_line: "Big chunky pixels, a limited palette, low-fps sprite animation and stepped timing, integer-scaled with nearest neighbour."
---
# Pixel art / 8-bit

Big chunky pixels, a limited palette, low-fps sprite animation and stepped timing, integer-scaled with nearest neighbour.

A reference for the design desk to blend one or two traits from, never a preset that replaces the film's bespoke system. Never cite it as the whole look; the signature features below are what a blend must keep if it names this style.

## Essence, and what it is not

A retro game aesthetic built at a low internal resolution (e.g. 320x180) and integer-scaled with nearest-neighbour; sprites hand-authored on a 16 to 24 px grid with 6 to 8 frame cycles at 10 to 12 fps, parallax layers moving by whole pixels, dithered gradients and an optional CRT pass that does not blur the pixels.

Not: smooth anti-aliased motion, blurred upscaling, or a pixel filter on a vector scene.

## Materials

- Low-res canvas with a 16 to 32 colour palette, dithered sky, hand-authored sprites, three to four parallax layers; optional CRT (scanlines, slight barrel, phosphor glow).

## Colour logic

- A limited palette of 8 to 32 colours, with palette shifts (day to sunset) as a narrative device.

## Type

- Chunky pixel logotype with a shine sweep; pixel font dialogue boxes that type out.

## Motion

- Stepped timing (steps()) with no smooth easing on sprites; whole-pixel positions; run cycles at 10 to 12 fps; parallax by whole-pixel translation.

## Camera grammar

- Side-scroller camera with layered parallax.

## Signature features

Checkable traits; the frame juror and the critic look for each by name when a system claims this style.

1. Hard-edged big pixels with nearest-neighbour scaling and no anti-aliasing.
2. A strictly limited palette (8 to 32 colours) with dithering.
3. Sprite sheets cycled at 8 to 12 fps with stepped (not eased) motion.
4. Parallax layers moving by whole pixels.
5. A dialogue box that types out in a pixel font.

## When to use

- Games, indie, developer and nostalgia moments; playful product tours with a retro hook; a mascot inside a software story.

Avoid when: Premium, photographic or serious brands; smooth fluid UI.

## Source and licence

Vincentwei1021/mg-styles-15, `prompts/` (MIT, copyright 2026 Vincentwei1021): the prompt's seed, rules and its "signature features" block, summarised in our words. See https://github.com/Vincentwei1021/mg-styles-15.
