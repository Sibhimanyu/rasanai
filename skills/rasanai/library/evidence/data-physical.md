# Data physicalization

Technique guide (not a preset or a style): read it only when the story needs this kind of real evidence. Method, rules and diagnostics: [references/evidence.md](../../references/evidence.md).

## Works from

table (CSV / JSON) with a numeric column and its unit in the header.

## Ingest, map, check

```sh
E="node $SKILL_DIR/scripts/evidence.mjs"
$E ingest --run "$RUN" --kind data-physical --source <authorized file> --origin "<who made it, where from>" --source-type user-supplied --permission authorized
$E scene-data --run "$RUN" --recipe data-physical [--aspect 9:16]
$E preview --run "$RUN" --recipe data-physical --out "$RUN/evidence/preview" [--video]
$E check --run "$RUN" --strict [--aspect 9:16]
```

Synthetic test data is ingested with `--synthetic` (then the scene is SCHEMATIC and carries the badge). Fixture for this recipe: `crates.csv` (`# SYNTHETIC FIXTURE`, six invented crates, kg and mm).

## Source to scene

one bar per row (up to 12), height = value / axis max on ONE linear scale from zero; axis ticks from that scale; value labels from the measurements; names from the label column.

## Never

A truncated axis (`axis-not-from-zero`), bars that are not proportional (`bars-not-proportional`), mixed units on one axis (`unit-mismatch`), an axis whose unit is not the data's. Ticks are scale marks (kind axis), values are measurements.

## Look and motion

Plates and bars as Rasan3D boxes or RasanShape extrusions; reveal heights in sequence, hold the final comparison long enough to read the numbers.
