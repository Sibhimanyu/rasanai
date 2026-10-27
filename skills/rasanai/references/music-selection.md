# Music selection

How the Music step chooses, ranks and offers tracks. Code: `scripts/music.mjs`, `scripts/lib/music-shortlist.mjs`, `scripts/lib/music-lib.mjs`, `scripts/lib/music-fit.mjs`. Status: implemented, unvalidated (nothing here has been run or listened to). Evidence vocabulary and rights live in `references/audio-sources-rights.md` and `references/sound-direction.md`.

## Source order and consent

1. The user's own track, when one is given (`--track`) or chosen (`music_source: user_track` with a file). It always wins and is never silently edited.
2. The licensed and local library: `library/music/catalog.json` (rights-checked, CC0 / CC BY, Mixkit only on pick).
3. Generated music (ElevenLabs Music, Stable Audio), an optional lane. It is on only when the film has an explicit generation consent (`--allow-generation`) or the user names `ai` in `--sources`. A key in the environment is a capability, not consent. It never sits ahead of appropriate licensed or local music. A `--sources` list that names `ai` before `catalog` is a user pin and is kept in that order.
4. HeyGen, ccMixter, Openverse (last, strictest). The offline procedural score stays the fallback, or the explicit choice with `--procedural`.

`music_source: none` (or `--silent-by-choice`) means no music is looked for or made and nothing replaces it. If the user chose their own track and the file is missing, the output says so and any other track is labelled an alternative, not a replacement. A preview choice or a revision is never approval for generation or hidden provider spending; a recommendation is never consent.

## Hard constraints versus ranking

- **Hard constraints** are facts and the user's own exclusions: rights (`sync_into_film` false), a failed or blocked track, a track shorter than the film (no looping to fill), vocals under a voiceover, excluded instruments, genres, terms, families or ids the user named, required verified stems. A candidate that breaks one is excluded with the reason.
- **Ranking preferences** nudge a score: feeling, perceived energy, warmer, less corporate, less percussion, calmer, recent reuse.
- **Estimates** (family, energy, vocals or instrumentation read from tags or names) explain a score and are never a constraint. Energy that was estimated from a family says so.

Negative style lists are per direction. With no sound direction and no constraints the long-standing lists apply unchanged (cliche words, ukulele, whistling, glockenspiel, "epic trailer", and the generated-prompt Avoid line). With a direction, instruments and genres are excluded only by the user's constraints; the stock-library markers (corporate, business, presentation, background music) stay as a word filter, upbeat sentiment words are filtered unless the feeling is playful or warm, and structural avoids (supersaws, wobble, tempo changes, fade-outs, vocals under a voice) remain because they are about editability.

## Ranking criteria

Emotional and brand fit (feeling, brief style words), perceived energy against the pace choice (pace is energy and density, never BPM), narration space (energy, possible vocals, dense instrumentation), instrumentation and arrangement density, usable sections (8 s or longer), duration and editability, entrance and ending (real endings beat fades), stem availability, and recent reuse. Tempo and stem claims are checked against records: a measured tempo (analysis) wins over a tag, and stems count only when verified. Ambient or rubato music with no detectable tempo stays usable: no beat grid is invented (`bpm.value` is null, confidence `undetected`). A measured quality score adds a little and never dominates.

## The shortlist

`pickThree` offers up to three tracks that differ in primary family and in energy band. A near-duplicate is skipped and reported, never used to fill the list. Fewer is an honest result and carries a `note` (zero left means say so and offer the user's own track, another direction or no music). Each entry records source, reasons, rights by use (`sync_into_film`, `bundle_in_app`, `upload_to_provider`, `serve_preview`, with the `crew/rights.jsonl` id), file identity, evidence state, stem verification, bpm confidence, sections and chosen section. Rejected candidates keep their reasons.

Evidence state comes only from `catalog-evidence` `evidenceFor` for the exact file version. The baseline is `metadata_reviewed`; a row that claims an audition without an evidence entry is treated as `metadata_reviewed`. Nothing in this lane marks a track auditioned.

Preview excerpts are a plan only (`previewPlan`): the passage, the section, a comparison level, and whether serving a copy is allowed. Leveling applies to the excerpt, not to the source file or delivery mastering.

## Revisions

`node music.mjs revise --run <run> --text "<request>"` (or `reviseShortlist(prev, request)`) understands Keep this track, More like this, Warmer, Less corporate, Less percussion, Calmer section (and a calmer track) and plain-language equivalents. It re-ranks the stored `music/shortlist.json` without network or audio. Likes are session-scoped; `--save-preference` only reports an explicit save request for the caller to persist.

## Output

With `--sound`, a `audio/sound-choices.json` in the run, or `--constraints`, the JSON gains `shortlist` (next to `options`) and `music/shortlist.json` is written. Without them the output is as before.
