# Route: evidence films (technical and documentary explainers)

Built in wave W9. Use it only when the Brief picked **Evidence film** (a technical explainer whose numbers, geometry and measurements come from the user's own data, scans or models); a product launch with one number is not an evidence film. The film is built on the `faceless-explainer` scene route plus this guide.

1. `node scripts/evidence.mjs ingest ...` each authorized source into `$RUN/evidence/manifest.json` (hash, origin, permission, processing note).
2. Writers and designers use only manifest measurements or `research/claims.json` claims; a sketch is labelled SCHEMATIC.
3. `evidence.mjs scene-data`, `preview`, then `evidence.mjs check --strict` before the builder calls the film grounded.

The full workflow, the eight recipes and the failure codes: [references/evidence.md](../../evidence.md). Source and privacy rules still bind: [source-and-license-safety](../operations/source-and-license-safety.md) and rules 13 and 14 in [shared-contract](../shared-contract.md).
