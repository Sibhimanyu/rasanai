# SFX library credits

All audio here is CC0-1.0 (public domain dedication). Attribution is not required; it is given anyway. Each licence was re-read at download (2026-10-11); copies are in `LICENSES/`.

| Pack | Source | Licence | Notes |
|---|---|---|---|
| `uisfx-glass`, `-minimal`, `-studio`, `-soft`, `-cinematic`, `-scifi` | https://github.com/romainsimon/uisfx (commit 9950fe66f993a6660dab9c2651dcbcd899ffd83b), `packages/uisfx/sounds/<pack>/<cue>.mp3` only, never `.generated` | CC0-1.0 (`LICENSE-AUDIO`, Yuki Capital) | 21 UI cues per pack; one pack per film = one sonic identity |
| `kenney-interface-sounds` | https://kenney.nl/assets/interface-sounds (Interface Sounds 1.0, Kenney) | CC0-1.0 | selected files, ogg to mp3 |
| `kenney-impact-sounds` | https://kenney.nl/assets/impact-sounds (Impact Sounds, Kenney) | CC0-1.0 | selected files, ogg to mp3 |
| `atomcut-motion-essentials`, `atomcut-impacts-risers` | https://github.com/novincode/atomcut-library (commit 391f87ff50bdad7645f9007708fef8ff07c8a00a), `packs/<id>/audio/` | CC0-1.0 declared in each `pack.json` (copied here with provenance) and the repo README; the repo has no top-level LICENSE file | synthesised, not recorded foley |

Processing: every file is re-encoded to mp3, 44.1 kHz, mono, peak-normalised to about -3 dBFS so one volume scale works across packs. Files that probed harsh (over 35% of energy above 5 kHz), clipped or silent were dropped. Not taken: anything under `.generated`, the `opengameart-*` mirrors in atomcut-library (their own licences, some CC-BY), and soundcn.

## Organization and rights metadata (added 2026-10-27, metadata only)

`index.json` rows now also carry `job` (interface_action, movement, material_contact, accent_impact, development_transition, environmental_bed), `intensity` (light, medium, prominent), `family`, `useful_role`, `clean_onset`, `tail`, `rights` and `evidence_state: "metadata_reviewed"`. `job`, `intensity`, `family` and `useful_role` are estimates from category, id tokens, kind, duration and pack (`estimated[]` on each row); `clean_onset` and `tail` are derived from the measured `sync_point`, `lead_silence`, `audible_end` and `duration`. Nothing was listened to, and no file was added or changed. Coherent sets and the job by intensity coverage table, with gaps (no environmental beds), are in `families.json`.

Rights are per pack and per use (`sync_into_film`, `bundle_in_app`, `upload_to_provider`, `serve_preview`), all `true` for the CC0 files already shipped here. The atomcut packs rest on each `pack.json` declaration and the repo README (no top-level LICENSE file): recheck before relying on them beyond what already ships. Sources and terms to recheck at intake for any new pack: `../../references/audio-sources-rights.md`.
