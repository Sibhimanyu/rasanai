---
id: "living-screencast"
name: "Living screencast"
kind: "style-reference"
source: "lemo-opuscar"
source_url: "https://github.com/lemomo-ai/lemo-opuscar/tree/main/styles/living-screencast"
license: "MIT"
poster: "posters/living-screencast.jpg"
one_line: "A walkthrough that looks like a real screen recording, with a low-resolution mascot living in the high-resolution interface and acting out what the software does."
---
# Living screencast

A walkthrough that looks like a real screen recording, with a low-resolution mascot living in the high-resolution interface and acting out what the software does.

A reference for the design desk to blend one or two traits from, never a preset that replaces the film's bespoke system. Never cite it as the whole look; the signature features below are what a blend must keep if it names this style.

## Essence, and what it is not

The film looks like a screen recording of the real product but is redrawn in 2D (HTML/CSS/SVG), so the camera can go anywhere and text stays sharp at any zoom. A mascot of big square pixels lives in that hi-res world as the software's agency made visible. Two actors, never a hand: the cursor is the user, the mascot is the software.

Not: a dark tech keynote with an invented abstract UI, a pixel-art game, or a real capture.

## Materials

- Real UI redrawn: every label, mode name and shortcut matches the real product, no screenshots and no lorem ipsum; demo content is coherent and the app under test really changes.
- A sacred pixel grid for the mascot and its props (pencil, sparkles, heart, dust), crisp-edged and half-pixel snapped; the mascot stands only on top edges of real UI elements, measured from the live DOM every frame.
- The app floats on wallpaper with a soft shadow; rack focus and a vignette spotlight only where they serve attention; motion blur only on whips.

## Colour logic

- The product's own interface colours rule, including its real light and dark themes.
- The mascot keeps the brand's mascot colour or one saturated hue no UI uses; overlays are neutral frosted glass with at most one product-derived accent.

## Type

- UI type follows the product; information layers only (a chapter pill, a keystroke HUD, frosted-glass caption pills, a time-lapse tag).
- Captions sit at the bottom, never over the discussed element or the mascot; any title is diegetic (an empty-state heading, a window title, a notification).

## Motion

- UI on ones, mascot stepped to its pixel grid; mascot acting with anticipation crouch, stretch, landing squash and dust; eyes carry the acting.
- The cursor is smoothed on spring-eased paths and never teleports; every mascot action causes a real UI state change; UI animates like the real product.

## Camera grammar

- Screen-recorder camera: one continuous take, zoom at least 1, cuts only under chapter transitions. Push-in to the cursor or caret, slow drift at rest, whip-pan between panes with blur, push-in plus vignette freeze for the one promise, rack focus between panes, pull back to the full window, follow the mascot along a list, split-window reframe.

## Signature features

Checkable traits; the frame juror and the critic look for each by name when a system claims this style.

1. The UI is the real product's, redrawn: labels, modes and shortcuts match.
2. A chunky pixel mascot stands on real element edges, positioned from the live DOM.
3. The cursor is an eased, never-teleporting actor and a keystroke HUD shows input.
4. The camera behaves like screen-recording software (auto-zoom to the cursor, whip-pans with blur).
5. Captions are frosted pills and titles are diegetic.

## When to use

- Developer-tool and app walkthroughs, agent products where 'what the software is doing' needs a face, feature tours where the real UI is the proof.
- Playful but credible product films.

Avoid when: Physical products, brands with no mascot appetite, films where the UI must be a real capture rather than a rebuild.

## Source and licence

lemomo-ai/lemo-opuscar, `styles/living-screencast/STYLE.md` (MIT, copyright 2026 LemoLab). Summarised in our words; the full guide with engine notes and variation space is at https://github.com/lemomo-ai/lemo-opuscar/tree/main/styles/living-screencast.
