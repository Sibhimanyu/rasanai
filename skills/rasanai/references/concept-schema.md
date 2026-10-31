# The concept schema (one shape, every reader and writer)

A concept is a sequence of SHOTS in one style world with one carrier and one signature moment. Words are a layer on top.
Code: `scripts/lib/concept-schema.mjs` (read by story.mjs gate GV, treatment.mjs, board.mjs, style-frames.mjs, story-visuals.mjs, moves.mjs validate-score, grammar.mjs; written by agents/concept-writer-*.md and script-writer.md; plates are linked in by `imagegen.mjs batch --world ... --concept <file>`).

```json
{
  "id": "style-1", "title": "Two words", "logline": "twelve words at most",
  "style_world": "clay",
  "style": { "palette": { "bg": "#F2E6D8", "bg2": "#E9D3BC", "ink": "#2B2118", "accent": "#E8833A" }, "font": "Fredoka, sans-serif" },
  "carrier": { "what": "one orange clay bead that rolls through the film", "kind": "dot" },
  "signature_moment": { "what": "the bead rolls into the slot and the whole board lights up", "shot": "s04" },
  "sound_mode": "instrumental-arc",
  "shots": [
    { "id": "s01", "t": 0, "see": "a lone orange bead on a clay desk", "style": "thumbprinted clay, 12 fps wobble",
      "carrier_state": "still, small", "move": "lone-dot-carrier-iris", "transition": "iris out", "words": "" },
    { "id": "s04", "t": 9, "see": "the bead drops into the slot and the board lights up", "style": "clay, rim light",
      "carrier_state": "inside the slot, glowing", "move": "glow-on-control", "transition": "cut on the click",
      "words": "Ready.", "image": "/abs/path/art/world/world-plate.png" }
  ]
}
```

Rules
- `style_world`: an atlas id string (`library/styles/atlas/index.json`). `style` is optional; when missing, `resolveStyle()` takes what the atlas file offers and falls back to neutral colours. An older `style_world` object ({name, palette, font}) still reads and is folded into `style_world` + `style`.
- `carrier.kind` is one of `dot, word-line, icon-set, palette-dither, card-field, ui-plane, ui-object, object, mark` (the move library's `carrier_kinds`). `ui-object` means one product UI element (a pill, an icon stack with rising counters, a card morphing through 6 states) is the carrier and the protagonist (move `ui-object-state-morph`). A plain-string carrier or signature_moment still reads.
- `signature_moment.shot` is a shot id. `sound_mode` is `vo-kinetic | instrumental-arc | sfx-led | song-lyric` (the atlas used `vo-led` once; it is renamed).
- `shots[].id` is `s01`, `s02`...: the same ids `art/world.json` `used_by[].shot` uses (`art.mjs world init` takes them from the concept). `treatment.mjs` fills a missing id by position.
- `shots[].move` is a real move id (`library/moves/index.json`, or an old `library.json` id: legacy warning). `image` is optional: an absolute plate path.
- Unknown `style_world` or `move` ids are warnings (GV, `moves.mjs validate-score`, board), never silent.

- `reference_lesson` (optional, one line): when the run has reference films (`refs/summary.json`), the lesson from them this concept uses and the one it deliberately does not. Never a picture, a line of copy or an exact look of a reference.
