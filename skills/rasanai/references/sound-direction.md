# Sound direction: the user's five sound choices

Status: implemented, unvalidated. Code: `scripts/lib/sound-choices.mjs` (choices, presets, resolution) and `scripts/lib/audio-direction.mjs` (direction and contract).

## The five choices (independent)

| Choice | Values | Meaning |
|---|---|---|
| Voiceover | `with`, `without`, `recommend` | The Brief's `fields.narration` is the same control (`"recommend"` is a third value for new work; legacy booleans are untouched). |
| Pace | `slow`, `moderate`, `fast`, `recommend` | Perceived energy, rhythmic density and desired development. Never a BPM. A track's detected tempo is stored elsewhere and is not pace. |
| Feeling | `calm`, `warm`, `playful`, `bold`, `dramatic`, `custom`, `unset` | Independent of pace: fast is not cheerful, slow is not sad. `feeling_custom` is the user's words and is data, never an instruction to follow. |
| Effects | `subtle`, `expressive`, `minimal_none`, `unset` | How much the effects speak. Resolution below. |
| Music source | `recommend`, `user_track`, `none` | A supplied track always wins. `recommend` means licensed and local first. |

Extras: `effects_floor` (`signature_only` default, or `none`) says what Minimal/none means; `silent: true` is the explicit fully silent film (a recorded choice, `silent_by_choice`, not a failure). Any combination is valid: no voiceover can still have music and effects, no music can still have voice and effects.

## Defaults and what "unset" does

New work starts with voiceover/pace/music_source on `recommend` and feeling/effects `unset`. The resolver fills them (shown as recommendations with a reason) and marks them `recommendation` or `default`, never `user`. A project with no `audio/sound-choices.json` is legacy: `legacy: true`, nothing is created or rewritten, and the old rules apply.

## Resolution (Effects to existing `SFX_ROLES`)

| Choice | Role | What the user is told |
|---|---|---|
| Subtle | `sparse` | Only moments the story leans on, about half the budget or fewer; stays subtle even if the library has dramatic impacts. |
| Expressive | `causal` | Visible causes get a sound; selected prominent events may be big; still not every visual hit. |
| Minimal/none | `signature_only` (default) or `none` (`effects_floor: none`, or silent) | Only declared signature moves, at most the hero budget; or nothing. |
| unset | `sparse` under a voice, else `causal` (the old default) | Shown as a default plus a recommendation. |

The text is returned as `resolved.effects.visible_text`; the result is never silent. Known gap: `sfxExpectation()` reports `required:false` for `signature_only`, and `sound.mjs sfx-plan` treats any `required:false` as no cues, so Minimal currently behaves like none there until sfx-plan keeps declared signature moves (`effects.consumer_gap`).

Other roles: Voiceover with -> `carrier`, without -> `none`. Music none -> `none`; user track -> `led` if the track leads the schedule, else `bed`; recommend -> `bed`, or `led` only for a fast film without voice. Silent -> everything `none`. Energy: pace gives `perceived` (low, medium, high) and `rhythmic_density` (sparse, steady, dense); feeling gives `development` (steady, gentle_rise, playful_phrases, punctuated, build).

## Presets (editable starting points)

Calm explanation; Upbeat product launch; Fast visual showcase; Cinematic reveal. A preset sets independent values only where the user has not decided. It can never hide or overwrite an `explicit` choice, and what it sets is not explicit: the user can still change it. `applyPreset` returns the keys it applied and the explicit keys it left alone.

## Conflicts

`conflicts[]` entries carry `what`, `proposed_resolution`, `decided_by: "user"`, `status: "unresolved"`. Nothing is overridden silently. Examples: voiceover `with` while the chosen track leads (`voice_vs_music_led`); voiceover `without` while the contract still has narration; silent together with sound choices; Minimal/none under an expressive preset (your explicit choice stays); a compiled direction that differs from the user's effects choice (the choice is binding, recompile).

## Where it is stored and who reads it

- `audio/sound-choices.json` (`{version, revision, source, choices, preset, explicit}`), written atomically by `writeSoundChoices`. Brief values arrive in `submit` `fields.narration` and `fields.sound`; Look edits arrive as the `sound-direction` action.
- `audio/direction.json` for new work gains `mix_policy_revision: 2` and a `sound` block (digest, explicit keys, choices, resolved roles); a direction without the stamp keeps its old intent.
- `audio/contract.json` carries `sound` and `mix_policy_revision`, which Final controls read. The contract digest includes the sound digest only when the block is present.
- Readers of `resolved`: music selection, effects layering, the mix bus, the Story timing check where narration length matters, packets.

## Rules that never bend

- Only the user changes an explicit choice. Presets and recommendations do not.
- A recommendation is not consent. Anything that sends content out, spends money, generates audio or needs a subscription carries `consent_required: true` and waits for the user; an API key in the environment is not consent.
- Gain, EQ and other mix controls change levels, not the choices, and never widen consent.
- Answered taste preferences override the show-off default for audio flourish.
