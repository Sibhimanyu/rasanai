# Curated music catalog

`catalog.json` is the third stop of `scripts/music.mjs`'s source chain (after the user's own track and AI generation to the arc): 64 hand-checked tracks, each gated by the measured quality gate (`music.mjs gate`), with BPM, ending and strong-section start from `sound.mjs analyze`. Written 2026-10-12 from `.context/night/R3-music.md`. **Nobody has auditioned these tracks yet** (`listened: false`, `evidence_state: "metadata_reviewed"` on every row): mood and fit come from tags and measurements. Listen before a track ships in a film; `listened: true` or a higher state is allowed only once `evidence.json` holds a matching entry (see "Evidence model").

## What is in it

| Source | Tracks | Licence | Host policy |
|---|---|---|---|
| HoliznaCC0 (6) , Loyalty Freak Music (3) | 9 | CC0 1.0 | `host: self`, `fetch: auto`: fetched on demand from FMA's file server for the three options shown, SHA-256 checked, mirrorable |
| Ketsa (11) | 11 | CC BY 4.0 | same; the credit names "Ketsa.uk" (his pages ask for it in the video description, which keeps the video claim-free) |
| Broke For Free (6), Tours (1) | 7 | CC BY 3.0 | same |
| Mixkit (Michael Ramir C., Lily J, Alejandro Magana, Ahjay Stelino, Eugenio Mininni) | 37 | Mixkit Stock Music Free License | `host: upstream`, `fetch: on-pick`: **never mirrored, prefetched or bulk fetched** (Mixkit's terms ban scripts that mass download and making items available to third parties). Shown as `suggestions`; fetched once from Mixkit's own URL when the user picks one (`--pick mixkit-<id>`) |

Mixkit's licence: commercial use including online ads, no credit; no TV / radio broadcast, no games, no remixes, no registering the track with rights-management services; items marked "Restricted" are personal only. Mixkit has no per-track URL we could verify, so `page` is the listing and `page_hint` names the title to search for.

## Rules the schema enforces (`validateCatalog`, `selftest.mjs` section "music")

- Licences only CC0, CC BY 3.0 / 4.0 and the Mixkit free licence: no NC, no ND (we edit the track, a derivative), no SA.
- CC BY tracks have a `credit` line (title, author, source page, licence and its URL). `music.mjs` writes it to `$RUN/music/CREDITS.txt` and `description.txt` for the final's description.
- `fetch: auto` needs `mirror_ok: true` and a SHA-256; Mixkit entries must be `on-pick` and `mirror_ok: false`.
- `mirror` (a release-asset URL) is preferred over `url` when `mirror_ok` is true.

## Evidence model (added 2026-10-27, metadata only: implemented_unvalidated)

Three states, ranked and never mixed up: `metadata_reviewed` (tags, licence page, ffmpeg measurements: what this catalog is today, every row) < `auditioned` (a named reviewer listened to THIS file version, with a method and a context) < `approved_in_finished_mix` (judged inside a finished mix of a named film, with its mix receipt). **No entry is auditioned.** `evidence.json` starts empty, and `scripts/lib/catalog-evidence.mjs` (`evidenceFor`, `validateTrackEvidence`) refuses `listened: true` or a higher state without an entry for the row's own `sha256`/version. A repeated filename is not evidence, an entry for an older version is stale, and a measurement is not a listening.

Optional fields now on every row (all optional, so older readers and `validateCatalog` keep working; the original fields, ids, urls, licences and `checked_on` are unchanged):

| Field | Meaning |
|---|---|
| `families` | the six addendum families (below), mapped from the existing `family` style tags: an estimate |
| `rights` | `{ref, terms_version, sync_into_film, bundle_in_app, upload_to_provider, serve_preview, checked_on, basis, conditions?}`, derived from `licence`/`host`/`mirror_ok` |
| `source_id` | stable source key (`fma:<artist>/<track>`, `mixkit:<n>`) |
| `acquisition` | `fetch_on_demand_sha256_checked` (host self) or `fetch_on_pick_from_upstream` (Mixkit) |
| `stems` | `{available:false, verified:false, files:[]}`: no catalog row has genuine stems; a claimed stem set needs files and an evidence entry |
| `energy`, `vocals`, `instrumentation` | only where the row's own `notes` justify it, else `null`; `estimated[]` lists every field that is an estimate |
| `evidence_state` | `metadata_reviewed` on every row |

### Rights are separate permissions

`true` = the licence and host terms allow it; `false` = they forbid it; `null` = unreviewed, which is **not** permission. Permission to synchronize a track into a finished film (`sync_into_film`) is not permission to bundle the raw audio in the app (`bundle_in_app`), to mirror or serve a preview (`serve_preview`), or to send the file to a provider (`upload_to_provider`). The values here are licence-level; per-film consent is still a rights event in `crew/rights.jsonl` (`asset_id` = the row id) and a recommendation is never consent. CC0 and CC BY `host: self` rows: sync, bundle and preview `true` (CC BY needs its credit line); `upload_to_provider` is `true` only for CC0 and `null` for CC BY (attribution carriage and the provider's terms are unchecked). Mixkit and every `host: upstream` row: sync `true` within the listed restrictions, bundle, preview and upload `false`.

### The six families

| Family | From style tags (estimate) | Rows today |
|---|---|---|
| `restrained_electronic` | editorial, dark-tech, indie-electronic, retro | 35 |
| `warm_acoustic` | organic, lo-fi | 18 |
| `playful_rhythmic` | playful, reel, retro | 19 |
| `spacious_ambient` | ambient-pop, chill | 5 |
| `bold_percussion` | raw, plus a `breakbeat` note | 1 |
| `cinematic_development` | cinematic | 1 |

Rows can carry more than one family, so counts overlap. Honest gaps: `bold_percussion` and `cinematic_development` have one candidate each and `spacious_ambient` five; "warm_acoustic" is a timbre guess from lo-fi/organic tags, not a statement that instruments are acoustic. Nothing here says a track is good: coverage and quality come from listening, which has not happened. The SFX library has its own families in `../sfx/families.json`.

## Left out on purpose

Scott Holmes (corporate albums are CC BY-NC), Blue Dot Sessions, Chad Crouch, Podington Bear, Lee Rosevere, Dee Yan-Key (NC or no CC link), Jahzzar (CC BY-SA), Lobo Loco (mixed BY / BY-SA / BY-NC-SA), Monplaisir and Komiku (chiptune), and 64 of 179 surveyed FMA candidates that failed the defect gate. Not used at all: Jamendo's API, Freesound's API at runtime, Bensound, Pixabay, Uppbeat, YouTube Audio Library, Artlist, Epidemic, Envato, Musicbed, Soundstripe (no automated access; the user's own track covers them, see `references/sound.md`).

## Refreshing

`node scripts/music.mjs verify` checks the schema and sends a HEAD to every auto-fetched URL (expects `audio/*`); `--deep` re-downloads and compares each SHA-256; `--mixkit` also HEADs the Mixkit files (one request each, only for maintenance). Re-read each licence on its page when you re-verify (FMA: the `rel="license"` link on the track page; Mixkit: the JSON-LD `license` on its listing) and update `checked_on`. Add a track by adding a row with the same fields, then `node scripts/selftest.mjs --quick` (section "music"). Thin families today: future garage and ambient pop; AI generation (a user key) fills those.
