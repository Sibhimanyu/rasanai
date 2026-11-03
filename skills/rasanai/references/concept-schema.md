# The concept schema (one shape, every reader and writer)

A concept is a sequence of shots in one style world with one carrier and one signature moment. Words are a layer on top.
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

Launch films (references/launch-grammar.md): a launch concept names `hook_lines`, `turn_line`, `meet`, `capabilities` (2 or 3 of `{ line, ui_proof }`), `payoff`, `scene_plan[]` (`{ beat, scene_type, texture, move, imagery? }` per beat; scene-variety numbers: launch-grammar.md, "Scene variety"), `texture_accents[]` (stepped or flicker sections; placement: launch-moves.md, "Motion texture"), `signature_transition`, `ground` and `type_pairing`, plus `structure` `{ kind, why }` (`hook-turn-meet` default | `sung-script` | `teaser-reveal` | `parts-assembly` | `before-after` | `feature-led` | `medium-as-proof`; `launch-grammar.md` section 16), `motif_source` per major motif and optional `departures` `[{ rule, why }]` for a default the idea leaves (`launch-grammar.md` "Defaults you can leave"); a `carrier` `{ what, kind, beats, handoff }` is optional and local (40% of beats at most); `style_world` is then optional (a world only when the concept chose one), and the board reads the launch fields.

Rules (one line each, with the reason)
- `style_world`: an atlas id string (`library/styles/atlas/index.json`). `style` is optional; when missing, `resolveStyle()` takes what the atlas file offers and falls back to neutral colours. An older `style_world` object ({name, palette, font}) still reads and is folded into `style_world` + `style`.
- `carrier.kind` is one of `dot, word-line, icon-set, palette-dither, card-field, ui-plane, ui-object, object, mark` (the move library's `carrier_kinds`). `ui-object` means one product UI element (a pill, an icon stack with rising counters, a card morphing through 6 states) is the carrier and the protagonist (move `ui-object-state-morph`). A plain-string carrier or signature_moment still reads.
- `signature_moment.shot` is a shot id. `sound_mode` is `vo-kinetic | instrumental-arc | sfx-led | song-lyric` (the atlas used `vo-led` once; it is renamed). Optional `music_arc`: the music's shape, a name (`drop` (the default) | `slow-burn` | `ambient-bed` | `cold-open` | `stinger` | `pulse-loop` | `lyric-song`) or `{ shape, genre?, instruments?, meter?, bpm? }`: pick it with the sound mode (`references/sound.md`, "Music arc shapes"); `genre` / `instruments` / `meter` ("3/4") say what the music is made of (a pixel world is chiptune, a paper world felt piano).
- `shots[].id` is `s01`, `s02`...: the same ids `art/world.json` `used_by[].shot` uses (`art.mjs world init` takes them from the concept). `treatment.mjs` fills a missing id by position.
- `shots[].ui_proof` (launch films: required on each capability's shot): the one simplified UI mockup that proves the shot's line, a short phrase ("an inbox list, one reply drafted"). `story-plates.mjs` reads it from the shot.
- `shots[].move` is a real move id (`library/moves/index.json`, or an old `library.json` id: legacy warning). `image` is optional: an absolute plate path.
- Unknown `style_world` or `move` ids are warnings (GV, `moves.mjs validate-score`, board), so a typo surfaces instead of passing silently.

- `reference_lesson` (optional, one line): when the run has reference films (`refs/summary.json`), the lesson from them this concept uses and the one it deliberately does not. Take the lesson, and leave the reference's pictures, copy and exact look behind.

- `grammar_waivers` (optional, `[{ "rule": "...", "why": "..." }]`): the launch grammar is a default a concept can waive when its idea needs to (a quiet pixel world with no full-frame type, a slow-burn film that holds shots past 3.5 s, a cold open that shows no object in 2 s). Rules: `full-frame-type` (the required full-frame type scene), `hook-address` (the first 3 s address the viewer or show a problem), `hook-object` (an object enters within 2 s), `hook-logo` (no brand before 3 s), `median-shot` (median shot 3.5 s or less). Aliases `hook-3s`, `object-by-2s`, `no-brand-before-3s`, `shot-length` read too. Put it on the concept and copy it to `motion/score.json`; final-gate, motion-gate, frame-gate and the launch-grammar check read it (`scripts/lib/gate-profile.mjs`). A waived rule becomes a note, not an error. A waiver with no `why`, or an unknown rule, is ignored and reported, so write the reason in one line for the person to read.
- Gates follow the chosen world: every atlas world carries a `gate_profile` (`dimensional | flat | pixel | stepped | photographic | hand-made`, `library/styles/atlas/<id>.json`). final-gate reads the film's `style_world` (story/chosen.json, motion/score.json, look/system.json; else the older `look/medium.json` contract) and passes the profile down: `flat | pixel | stepped | hand-made` take the dimensional craft checks (ground chroma and range, flat swatch grounds, soft content, depth and scale) as `review`, boldness becomes a warning, and `pixel | stepped` also accept stepped motion (on twos, low-fps holds) instead of flagging it.
