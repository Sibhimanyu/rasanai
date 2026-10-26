# Creative reference intake: adding and using precedents

`library/creative-reference-index.json` is data for `scripts/lib/creative-references.mjs`. It picks up to four references per film (user's first, then one or two same-format examples, then one contrasting principle). It never asks the user for inspiration, and never lets a reference decide the user's Look.

## A row, in plain words

Required: `id` (slug), `kind` (`professional-case`, `technique`, `original-example`, `local-breakdown`), `principle` (your own summary of what to learn), `format_tags`, `shot_tags`, `avoid_copying`, `evidence_level`, `verified_at`, and `source_url` (https) or `local_ref` (a path inside the skill). Optional: `comm_kinds` (communication kinds it fits), `not_for_kinds` (kinds it is no proof for: an identity reveal is not product-feature proof), `look_tags`, `runtime_family`, `complexity`, `media`.

## Evidence levels

- `source-description`: a studio's own write-up. Words only. No frame was measured.
- `technique-data`: a craft idea from a repository. Not evidence of visual quality.
- `local-breakdown`: a text breakdown already in `library/showcases/`.
- `original-unreviewed`: one of our own small sources in `library/creative-examples/`, not rendered or reviewed. Never "gold standard".
- `visual`: only when a `media` entry is lawful AND present in the run. Needs `path`, the full 64-hex `sha256`, a specific `rights_basis` and `scope: "reference-only"`.

A URL is not a licence. Public availability is not redistribution permission. Code licence and media rights are separate: a repository's MIT does not cover its videos. No media may be added without a recorded rights basis. A row without lawful media stays valid, but it counts as a description, and a film built from descriptions never gets an "at-par with the reference" claim.

## Adding one

1. Read the source; write the principle in your own words and say what must not be copied.
2. If it is a third-party repository, record it first in `third_party/SOURCES.md` following `third_party/INTAKE.md`. This file does not replace that register.
3. Use tags from the existing vocabulary (format ids from `library/formats.json`, kinds from `lib/communication.mjs`, shot tags already in the index) before inventing new ones.
4. Prefer a local row over a new catalog: showcases (`library/showcases/`) and moves (`library/moves/`) already describe films; point to them with `local_ref`.
5. Never rank by stars, never add a paid pack, never bulk download films. Query the web only through the existing approved tooling, honouring offline settings, with no user secrets in the search text.

## Order of fallback

Permitted local visuals, then existing original examples, then text-only descriptions with an explicit limitation. The packet states which one the film got.
