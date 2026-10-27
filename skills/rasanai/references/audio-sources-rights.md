# Audio sources and rights (music and sound effects)

Status: implemented_unvalidated; metadata and policy only. Nothing here was downloaded, listened to or checked against a provider account. Recorded 2026-10-27 for the sequence/audio addenda.

## Three source lanes

1. **Distributable core**: original or appropriately licensed assets that RasanAI may ship and serve itself. Today: the 190 CC0 SFX in `library/sfx/` and the 27 CC0 / CC BY tracks of `library/music/catalog.json` that are `host: self`. The Mixkit rows (`host: upstream`) are NOT in this lane: they are metadata plus a fetch from Mixkit's own URL when the user picks one.
2. **Private user-imported libraries and tracks**: the user's own files (`music.mjs --track`, `--library`). The rights are the user's declaration, recorded as theirs (`trackRecord`, `declared_by: "user"`); the app uses them for that user's film and never bundles, mirrors or uploads them elsewhere.
3. **Optional provider integrations**: only with suitable access, storage, preview, editing and product-use terms for the exact intended use. A provider is never a default and no new provider or purchased pack is required for the core mix fix.

## Four separate permissions per asset

`sync_into_film`, `bundle_in_app`, `upload_to_provider`, `serve_preview` (`scripts/lib/catalog-evidence.mjs rightsByUse`). Each is `true` (terms allow), `false` (terms forbid) or `null` (unreviewed, not permission). Permission to synchronize a track into a finished film is not permission to bundle raw audio in the app, mirror a library, serve previews or upload to a provider. Mixkit and every `host: upstream` row are `false` for bundle, preview and upload. The licence-level values live on the catalog rows; per-film consent is a rights event in the existing `crew/rights.jsonl` store (`recordRights`, `rightsStatus`, `rightsGate` in `lib/provenance.mjs`). A recommendation is never consent, and a key present in the environment is not consent for spend.

## Source facts to recheck at intake (dated 2026-10-27, constraints not endorsements)

- **Freesound API terms** (https://freesound.org/help/tos_api/): commercial API terms are negotiated case by case; an individual sound's licence does not settle API access. Consequence: no Freesound API at runtime (already excluded in `library/music/README.md`), and a Freesound-licensed file is not, by that fact, usable through the API.
- **Sonniss bundle licence** (https://sonniss.com/gdc-bundle-license/): restricts supplying the sounds as sound libraries or SDK assets and contains AI-related restrictions. Consequence: do not put Sonniss audio into `library/` or any release asset, and do not feed it to a model or provider step, without a reading of the licence against that exact use.
- **Mixkit** (already in the catalog): never mirrored, prefetched or bulk fetched; no broadcast, games or remixes; items marked "Restricted" are personal only.

These are what was true when read. Re-read the live terms at intake, name the exact intended use (bundle, serve, upload, edit, train, redistribute) against each permission above, and record the decision.

## Acquisition constraints

- No new pack, provider or purchased library is added by the addendum work. Any addition goes through `third_party/INTAKE.md` and is listed in `third_party/SOURCES.md`.
- No NC, ND or SA licence (the existing catalog gate). CC BY needs its credit line carried into the film description.
- Every added asset needs a source id, hash, licence URL, `terms_version`, `checked_on` and the four permissions before it is offered; listening evidence is separate (`library/music/evidence.json`).
- Processing (re-encode, normalise) is recorded as a derivative of the source asset, not as a new source.

## Unavailable assets or rights

An asset whose rights are `false` or `null` for the use at hand, a missing file, a failed hash, or an unavailable provider produces an **explicit source decision** shown to the user: pick another source, import their own, ask the rights holder, or go without that layer. It never produces a silent fallback to an unapproved asset, an unlicensed track or a generated substitute the user did not consent to.

## Gaps, stated plainly

- The SFX library has no environmental bed or ambience (`library/sfx/families.json`): that job needs a source decision under these rules, not an invented asset.
- No catalog track is auditioned, and none has genuine stems.
