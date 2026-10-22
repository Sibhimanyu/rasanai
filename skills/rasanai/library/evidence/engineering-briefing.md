# Engineering briefing board

Technique guide (not a preset or a style): read it only when the story needs this kind of real evidence. Method, rules and diagnostics: [references/evidence.md](../../references/evidence.md).

## Works from

table (CSV / JSON): alternatives as rows, dimensions and constraints as numeric columns with units in the header.

## Ingest, map, check

```sh
E="node $SKILL_DIR/scripts/evidence.mjs"
$E ingest --run "$RUN" --kind engineering-briefing --source <authorized file> --origin "<who made it, where from>" --source-type user-supplied --permission authorized
$E scene-data --run "$RUN" --recipe engineering-briefing [--aspect 9:16]
$E preview --run "$RUN" --recipe engineering-briefing --out "$RUN/evidence/preview" [--video]
$E check --run "$RUN" --strict [--aspect 9:16]
```

Synthetic test data is ingested with `--synthetic` (then the scene is SCHEMATIC and carries the badge). Fixture for this recipe: `alternatives.csv` (`# SYNTHETIC FIXTURE`, three invented options).

## Source to scene

each row -> a card; each numeric column -> a metric row (`<id>-r<row>-<column>`), its label the formatted measurement, its bar normalized between the column's low and high. First four numeric columns, first four rows.

## Never

A number without a source id is rejected (`number-without-measurement`); a column with no unit is `unit-missing`; mixed units in one column are `unit-mismatch`. No invented constraint lines or pass/fail marks: a constraint is a measurement of its own from the source.

## Look and motion

Cards and bars with the type and shape tools you already have (RasanShape for bars and rules); use the film's own look, this board is structure.
