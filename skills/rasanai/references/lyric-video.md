# Lyric videos and music videos: the treatment playbook

## Contents

- [1. What makes it work](#1-what-makes-it-work)
- [2. The treatment, step by step](#2-the-treatment-step-by-step)
- [3. Idioms: the instruments](#3-idioms-the-instruments)
- [4. Hooks and repeated lines](#4-hooks-and-repeated-lines)
- [5. Karaoke rules](#5-karaoke-rules)
- [6. Pacing by section](#6-pacing-by-section)
- [7. 2D, 3D or hybrid per plate](#7-2d-3d-or-hybrid-per-plate)
- [8. The show-off bar](#8-the-show-off-bar)
- [9. Anti-slop for lyric videos](#9-anti-slop-for-lyric-videos)
- [10. Handing off](#10-handing-off)

A song with fixed lyrics does not need three scripts. The words are written; the music has its own structure. What the film needs is **one concept, one visual world, and a plate per lyric section in which every line becomes a picture**. This playbook is what separates a lyric video people rewind (the P(doom) video is the reference: 46 lines, 22 plates, one world, nothing repeated except on purpose) from a slideshow of words over a loop. It is generalised from that film's treatment; the machine-checkable version is `scripts/treatment.mjs check`.

Read this when the brief is a song (a track the film is cut to, with or without a lyric sheet). Route: `music-to-video`; the Story step becomes **three treatments** (Sure, Bold, Wild) written by `agents/treatment-writer.md`.

## 1. What makes it work

1. **One idea that is always moving.** The film is presented as one thing: plates from an illustrated treatise on the end of the world; pages of a field guide; a control room running one long incident. Plus a **signal**: one object (the spark) that travels through every plate, writes, draws, bends, burns. The viewer always knows whose film it is.
2. **Every plate looks different; the world is the same.** Engraving, oscilloscope, bureaucratic form, banknote guilloche, blueprint, raymarched 3D, woven textile, UI: the look changes every few seconds, but palette, type system, grain and humour never do. Variety is the idiom; unity is the bible.
3. **Lines become jokes and transformations, never illustrations.** "NVDA to the moon" is a stock chart that climbs to an engraved moon. "Sharp left turn" is a roadmap swerving 90 degrees. "Trapped in the Chinese room" is a library aisle the camera crash-dollies down. A literal picture of the sentence (a moon, for "moon") is the failure.
4. **The words are part of the image.** Written by the spark, riding a curve, typed as tokens, stamped on a form, engraved into a creature, set along a fuse that chars it. Never a subtitle on top.
5. **Hits on the beat.** Cuts on downbeats, accents on kicks and snares, camera moves that ease into the next downbeat. Inside a plate: sub-cuts, reframes, snaps; strong eases and holds then snaps, never floaty screensaver motion.
6. **The song's shape is the film's shape.** Choruses are the loud plates, the breakdown is quiet and strange, the final chorus out-does the first, the end drops to near-empty. Energy follows sections.
7. **Contrast does the work.** Dark plates against a few inverted paper plates (forms, maps, charts); loud against hairline; flat documents against one deep 3D fall.
8. **A closing move that rhymes with the opening** (the frame closes on the first frame; the last button re-runs the film).

## 2. The treatment, step by step

Write in this order. Each step is a field of `treatment.json`.

### 2.1 Concept (`concept`)
One paragraph that names: the **frame** (what the film is "presented as"), the **signal** (what runs through it), the **pun engine** (how a line becomes an image: pun, transformation, literalised metaphor), the **counter** if the song has one (a value that goes up each time the hook returns). Test: could a stranger describe the film in a sentence after reading it? If it is "a lyric video with cool visuals", rewrite.

### 2.2 Style bible (`style_bible`)
- **Palette:** ground (ink), paper (bone), two or three desaturated neutrals, and **one accent that is owned**: reserved for the signal, the sung word and the counter, and the only hue allowed to glow. Its hot core and deep shadow are tints of the same hue. At most **one rare second accent**, owned by one plate for a couple of seconds (`palette.rare`). No other hue anywhere. Some plates invert to paper; the accent stays the accent.
- **Type system by role:** the voice (lyrics: one confident grotesk with a width/weight axis, animated for expression), the machine (mono: tokens, labels, readouts, footnotes), the register for the quiet or prophetic lines (an italic serif, rarely), the written (single-stroke, for text a pen or spark draws). Layout discipline: Swiss grid, asymmetric, generous negative space, hairlines, small mono annotations beside big display type. Every proportional line kerned; typographic punctuation.
- **The signal motif** (`style_bible.signal`, a motif id).
- **Tone:** funny the way a straight-faced scientist is funny. Say what the humour is made of (deadpan captions, footnotes, stamps, probability bars) and where it must stay serious.
- **Banned:** at least three named bans. Always: neon cyberpunk, glowing brains, code rain, lens-flare soup, generic particle nebulae, stock imagery of the subject, mascots, imitated product UIs, outlined or haloed type. Add the ones this song invites (the famous meme drawing, realistic faces).

### 2.3 Motifs (`motifs`)
A short list (4 to 8) of recurring things with ids: the signal, the counter, one or two objects (a mask, a paperclip, a unicorn), a text device (the prompt field). Rules:
- **The signal appears in most plates** (the check wants it in 3 or more; aim for 40 percent or more).
- A motif **changes each time it returns**: it is the same object in a new situation (the unicorn is drawn in the opening and is a sticker on a laptop 2 minutes later). A motif that returns identically is wallpaper.
- Retire what the audience finds wrong (the P(doom) video cut a realistic eye and a hue after review): a motif list that never loses anything is untested.
- Foreshadow: plant an object two plates before it takes over (atoms re-form as a paperclip before the paperclips fill the room).

### 2.4 Plates (`plates`)
One plate per lyric section, split where the song changes mood, not where the sheet breaks. A plate is a time window `[start, end]` with:
- `lines`: **every lyric line, exactly once**, each with an `idea`: the concrete image, pun or transformation (not a paraphrase). If a line has no idea yet, the plate is not done.
- `idiom`: the plate's own instrument or format (section 3). `space`: `2d`, `3d` or `hybrid`. `energy` 1..5. `ground`: `dark` or `light`. `motifs`.
- `visual`: what fills the frame, what moves, what changes, the camera, in nouns.
- `lyric_integration`: how the words live in the image.
- `subcuts` for plates longer than about 18 s, on beats.
- Instrumentals are plates too (a plate with no lines): breaks and outros are where the film shows its idea.
- The first plate starts at 0 and the last ends at the song's end; plates are contiguous.

### 2.5 The dare (`show_off`)
End with the one moment a motion designer would rewind, and the seam or loop that rewards a second watch.

## 3. Idioms: the instruments

Pick idioms that are **specific objects, documents or crafts**, not styles. Each belongs to the world of the song; each is drawn in the bible's palette. A starting shelf (invent the ones that fit your song):

- **Instruments:** oscilloscope trace, plotter pen on a construction sheet, odometer, seismograph, VU meters, a mixing desk, a Gantt strip, a stock chart, a radar sweep.
- **Documents:** a safety form with a rubber stamp, a roadmap and survey map, a patent drawing, a boarding pass, a ledger, an out-of-office email, a court transcript, a recipe card.
- **Crafts and print:** engraving and hatching, banknote guilloche, blueprint, woven textile, risograph, a topographic map, an anatomical plate, a library catalogue.
- **Interfaces:** a prompt field typing tokens with next-token probabilities, a terminal, a settings panel, a button that is clicked.
- **Rendered worlds (3D):** a raymarched hatch-engraved creature, an infinite lattice, a vertical fall through a stack, a room engraved in white line.
- **Typography as the image:** a full-frame slam, pressure against the safe-area guides, text set along a fuse or a curve, words built from a [MASK] field.

Rules: **no idiom in more than two plates**, except at most two declared `recurring_idioms` (the hook template, the pre-chorus template), which must say in `change` what differs each time. Never the same idiom back to back. Generic names ("kinetic typography", "particles", "gradient lyrics") fail the check.

## 4. Hooks and repeated lines

A repeated line (the hook, a pre-chorus that returns) is a **template that escalates**: the same typographic or interface device, a new setting and a new intensity each time. Plan the whole curve first:

| Return | What changes (P(doom) example) |
|---|---|
| 1 | baseline: clean, bone on ink, one word per hit; the counter rolls to the first value |
| 2 | heavier and brighter: ink on the accent field |
| 3 | the breakdown breaks the pattern: hairline type, tiny, a field of black, slow and eerie (the loudest film needs a whisper) |
| 4 | maximal: strobing repeats, stacked outlines, shake, the counter multiplying |

Every repeat names its change in `change` (>= 15 characters, different from the last). The third return is usually where you subvert. The pre-chorus template works the same way: a prompt field with rings, then with bars, then fragile and drifting apart.

## 5. Karaoke rules

- **Every word is synced** to `lyrics.json` word timings (`words[].start/end`): a word appears or lights at exactly its `start` and completes by its `end`. Anticipation is fine (dim words up to about 0.4 s early); highlighting never runs ahead of the voice. Look lines up by content through the timings, never by hard-coded times in the scene.
- **Default emphasis:** sung portion in accent or bone, unsung at 30 to 40 percent. A plate may break the rule once, on purpose ("disobey" highlights backwards).
- **Integrate, do not overlay:** the words are written, typed, stamped, engraved, carved, woven. No outlined or haloed type; bone type stays crisp (no bloom).
- **Safe area:** at least 96 px from every edge; clear of any HUD corner; the lyric must be readable at a glance.
- Held notes get held type (stretch width on a long vowel); fast words get compression.
- Long lines are broken for the picture, not the page; one word per hit on hooks.

## 6. Pacing by section

| Section | Energy | What the plate does |
|---|---|---|
| intro | 2 to 3 | establishes the world, the signal, the palette; the first downbeat ignites |
| verse | 3 to 4 | one idea per couplet; instruments and documents; most plates here are 2D |
| pre-chorus | 2 to 3 | the template (a prompt, a build); tension, ends on a launch into the chorus |
| chorus / hook | 4 to 5 | the full-frame slam, the biggest idiom of the section, the counter |
| break / bridge | 4 to 5 loud or 1 to 2 quiet | the bridge is the place to go loud (the endless fall) or to go quiet; do not do neither |
| final chorus | 5 | out-does the first: the tallest plate of the film |
| outro / end | 5 then 1 | the detonation, then the quiet button; the loop |

At least one plate is energy 5 and at least one is 2 or less; chorus plates average at least as high as verse plates (the check enforces both). Hold an energy-5 plate's peak for one bar, then take something away. **Cuts on downbeats**: plate starts snap to the beat grid (`audio.json` downbeats, tolerance 0.12 s); at least 60 percent of cuts are on downbeats. Inside plates, sub-cuts on beats and hits on kicks/snares/onsets.

## 7. 2D, 3D or hybrid per plate

Use `references/3d.md` section 1. For songs the rule of thumb is: **documents, charts, forms, UI, type slams stay 2D** (they are the contrast and the part that must be read); **3D** goes where the picture needs space or an object: a creature, an infinite lattice, a fall through a stack, a room you circle, a camera plunging through a chart into a landscape. **Hybrid** is the 2D-to-3D seam: the chart the camera falls out of; the flat mask that becomes a reveal. A song over 60 seconds needs at least one 3D or hybrid plate; two or three hero 3D plates beat eight average ones; 3D is not more than about 60 percent of the film. Plan the seams: `flat-to-depth` and `camera-through` at plate boundaries, and a 3D plate right after a calm one.

## 8. The show-off bar

The default (competent, tidy, safe: words over a looping abstract background that moves on the beat) is the failure. The bar for every treatment:
- At least **3 plates** that a motion designer would cut into their reel, each with a named move (a crash-dolly cut on every beat, a camera falling out of a chart into a landscape, a mask scanned away to reveal a creature, a stamp that lands on the word).
- At least **one seam nobody notices until the second watch** (a blinking caret becoming the next prompt's cursor; contours that turn out to be the mask).
- **One joke per plate**, at least, delivered straight.
- A **closing move** that rhymes with the opening.
- Craft over quantity: choreography timed to the frame, not more glow, particles or bounce.

## 9. Anti-slop for lyric videos

Reject on sight: the literal illustration of the line (a heart for "heart"); one reusable lyric template for every line; a glowing waveform or spectrum bar as the picture; stock footage and stock gradients under type; centred subtitles; particle fields and lens flares as "energy"; any plate that only fades; two hues that fight; the same idiom three times; an unsynced word; a chorus quieter than its verse; motifs that never change; a hook that returns identically; any plate where you cannot name the joke or the transformation.

## 10. Handing off

1. `treatment.mjs check` exits 0 (all lines covered once, plates contiguous and on the beat grid, idioms varied, a motif that recurs, hooks escalating, one accent, 3D present, energy following the song).
2. The chosen treatment becomes the **Look**: its style bible is the frame (palette, type, bans) and DIRECTION; no separate look picker.
3. `treatment.mjs scenes` writes the scenes (one scene per plate, durations from the plate windows) which the Motion Director scores per plate: spine = the signal, motif = the treatment's motifs, energy curve = the plates' energies, each plate's `space` carried into the score, and the **hook plates scored as a set** so the escalation is choreographed, not hoped for.
4. Scene animators receive the plate's `lines` with word timings; every word's reveal is keyed to the timings; the seams between plates are scored as designed pairs.
