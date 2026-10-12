# Curated music catalog

`catalog.json` is the third stop of `scripts/music.mjs`'s source chain (after the user's own track and AI generation to the arc): 64 hand-checked tracks, each gated by the measured quality gate (`music.mjs gate`), with BPM, ending and strong-section start from `sound.mjs analyze`. Written 2026-10-12 from `.context/night/R3-music.md`. **Nobody has auditioned these tracks yet** (`listened: false`): mood and fit come from tags and measurements. Listen before a track ships in a film, then set `listened: true`.

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

## Left out on purpose

Scott Holmes (corporate albums are CC BY-NC), Blue Dot Sessions, Chad Crouch, Podington Bear, Lee Rosevere, Dee Yan-Key (NC or no CC link), Jahzzar (CC BY-SA), Lobo Loco (mixed BY / BY-SA / BY-NC-SA), Monplaisir and Komiku (chiptune), and 64 of 179 surveyed FMA candidates that failed the defect gate. Not used at all: Jamendo's API, Freesound's API at runtime, Bensound, Pixabay, Uppbeat, YouTube Audio Library, Artlist, Epidemic, Envato, Musicbed, Soundstripe (no automated access; the user's own track covers them, see `references/sound.md`).

## Refreshing

`node scripts/music.mjs verify` checks the schema and sends a HEAD to every auto-fetched URL (expects `audio/*`); `--deep` re-downloads and compares each SHA-256; `--mixkit` also HEADs the Mixkit files (one request each, only for maintenance). Re-read each licence on its page when you re-verify (FMA: the `rel="license"` link on the track page; Mixkit: the JSON-LD `license` on its listing) and update `checked_on`. Add a track by adding a row with the same fields, then `node scripts/selftest.mjs --quick` (section "music"). Thin families today: future garage and ambient pop; AI generation (a user key) fills those.
