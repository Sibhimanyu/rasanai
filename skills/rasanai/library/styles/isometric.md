---
id: "isometric"
name: "Isometric 2.5D"
kind: "style-reference"
source: "mg-styles-15"
source_url: "https://github.com/Vincentwei1021/mg-styles-15"
license: "MIT"
poster: "posters/isometric.jpg"
one_line: "A miniature world in true isometric projection that builds itself: no vanishing point, buildings that grow, rail-style camera."
---
# Isometric 2.5D

A miniature world in true isometric projection that builds itself: no vanishing point, buildings that grow, rail-style camera.

A reference for the design desk to blend one or two traits from, never a preset that replaces the film's bespoke system. Never cite it as the whole look; the signature features below are what a blend must keep if it names this style.

## Essence, and what it is not

A 30-degree isometric view of a tiny city, office slice or data campus with no perspective: information-dense yet cute. Soft shadows and ambient occlusion on a pastel studio palette give a premium hero look. The camera is a whole-group pan with no rotation.

Not: perspective 3D, low-poly with lighting variety, or a flat 2D explainer.

## Materials

- True isometric faces (scale 86.6 percent, shear, rotate) or an orthographic camera at 35.264 degrees elevation and 45 degrees azimuth; z-order equals screen y; a 2:1 pixel slope along the grid.
- Soft shadows plus ambient occlusion; pastel studio palette (lavender ground, mint, peach, sky blue, white).

## Colour logic

- Pastel family with one ground tone and a few light brights; soft shadows rather than hard black.

## Type

- Light geometric sans labels; isometric titles on a world plane are possible.

## Motion

- Building growth: the base lands first, walls scale up from zero, the top lands 2 to 3 frames later; tile and building landings pop with soft clicks; objects slide along the grid.

## Camera grammar

- Group translation without rotation, with foreground, middle and background parallax at about 1:0.8:0.6; a final pull-back reveals the whole.

## Signature features

Checkable traits; the frame juror and the critic look for each by name when a system claims this style.

1. 30-degree isometric projection with no vanishing point anywhere.
2. A miniature scene (city, office slice, data room) that grows building by building.
3. Pastel palette with soft shadows and ambient occlusion.
4. The camera slides on rails (translation and zoom only, never rotation).
5. Parallax layers at about 1:0.8:0.6.

## When to use

- Architecture and platform explainers, data-centre, logistics and city-scale stories, app feature maps that want a cute high-density diorama.

Avoid when: Emotional close-ups, product-hero reveals, gritty or severe brands.

## Source and licence

Vincentwei1021/mg-styles-15, `prompts/` (MIT, copyright 2026 Vincentwei1021): the prompt's seed, rules and its "signature features" block, summarised in our words. See https://github.com/Vincentwei1021/mg-styles-15.
