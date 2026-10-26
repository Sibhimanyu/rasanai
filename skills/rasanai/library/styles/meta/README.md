# Medium metadata

Optional metadata over the canonical style references in `library/styles/<slug>.md`. It adds a medium family and an execution profile to existing style ids; it is not a second list of styles. `scripts/lib/medium-index.mjs` derives the index (`medium-index@1`) from these files, the style frontmatter, the real files named in `runtime_refs`, and the capability registry. Nothing here is a preset and nothing here is a capability by itself.

- `_families.json`: the twelve medium families (`medium-family@1`), each listing existing style ids as `existing_reference_candidates`. A family can exist with no buildable profile.
- `<profile-id>.json`: one execution profile (`medium-profile@1`). `style_refs` must be existing style ids; `family_id` must be in `_families.json`.

Honesty rules:
- `runtime_refs` lists real files inside the skill (or `motion-kit/catalog.json#<id>` rows). It is empty until the implementation exists; a placeholder, absolute or `..` path is rejected and the profile is left out of the index. Empty means `reference_only`, never buildable.
- `capability_ref` is null or an existing capability id (`scripts/lib/capabilities.mjs`). The five states (implemented, available, enabled, permitted, verified) come from that record, never from this metadata.
- `evidence.basis` stays `authored-unvalidated` until a receipt exists (`verified-scope` requires `receipt_refs`). Compiling, or an upstream demo looking good, is not evidence.
- `preferred_assignments` is a retrieval hint, not a whitelist. `hard_exclusions` is `[{constraint, reason}]` naming an actual constraint, never an industry or stereotype.
- Credits (source, URL, licence) are not copied here: the index reads them from each style's frontmatter. `provenance_refs` points at `third_party/<source>`.
- Aliases: the profile id, `execution_id` and `aliases` must be unique across profiles. A style id that belongs to several profiles (for example `pixel`) is ambiguous and does not resolve by itself.
- A custom or named style is a new original profile with `"custom": true` that references only existing primitives; it is never installed automatically.
