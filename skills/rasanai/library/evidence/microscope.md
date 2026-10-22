# Microscope story

Technique guide (not a preset or a style): read it only when the story needs this kind of real evidence. Method, rules and diagnostics: [references/evidence.md](../../references/evidence.md).

## Works from

image with a scale-bar calibration: a real supplied slide or photo.

## Ingest, map, check

```sh
E="node $SKILL_DIR/scripts/evidence.mjs"
$E ingest --run "$RUN" --kind microscope --source <authorized file> --origin "<who made it, where from>" --source-type user-supplied --permission authorized \
  --meta '{"scale_bar":{"pixels":160,"length":50,"unit":"µm"},"region":{"x":0.3,"y":0.3,"w":0.25,"h":0.25,"name":"Region 1"}}'
$E scene-data --run "$RUN" --recipe microscope [--aspect 9:16]
$E preview --run "$RUN" --recipe microscope --out "$RUN/evidence/preview" [--video]
$E check --run "$RUN" --strict [--aspect 9:16]
```

Synthetic test data is ingested with `--synthetic` (then the scene is SCHEMATIC and carries the badge). Fixture for this recipe: `gen.mjs` `mockSlide()`: drawn discs, not tissue.

## Source to scene

image -> a circular field of view; `scale_bar` -> one measurement drawn as a bar of exactly `pixels` image pixels (scaled with the picture, so it stays true under zoom); `region` -> a labelled box.

## Never

Without a calibration the scene is an illustration: it says so, shows no measurement and no measured conclusion (`scale-calibration-missing` if one is drawn). No cell counts, sizes or classifications that the source does not state.

## Look and motion

A slow push-in and a focus pull in the film; keep the scale bar on screen whenever anything is measured.
