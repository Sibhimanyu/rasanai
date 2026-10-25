# Satellite briefing

Technique guide (not a preset or a style): read it only when the story needs this kind of real evidence. Method, rules and diagnostics: [references/evidence.md](../../references/evidence.md).

## Works from

image (PNG / JPEG / WebP): approved aerial or satellite imagery.

## Ingest, map, check

```sh
E="node $SKILL_DIR/scripts/evidence.mjs"
$E ingest --run "$RUN" --kind satellite-briefing --source <authorized file> --origin "<who made it, where from>" --source-type user-supplied --permission authorized \
  --meta '{"captured":"2024-05-01","extent":{"width":12,"unit":"km"},"source_name":"<provider>","region":{"x":0.12,"y":0.2,"w":0.3,"h":0.35,"name":"Area of interest"}}'
$E scene-data --run "$RUN" --recipe satellite-briefing [--aspect 9:16]
$E preview --run "$RUN" --recipe satellite-briefing --out "$RUN/evidence/preview" [--video]
$E check --run "$RUN" --strict [--aspect 9:16]
```

Synthetic test data is ingested with `--synthetic` (then the scene is SCHEMATIC and carries the badge). Fixture for this recipe: scripts/tests/fixtures/evidence/gen.mjs `mockOverhead`: a drawn mock overhead picture of no real place.

## Source to scene

image -> fitted picture; `extent.width` -> one measurement (`<id>-extent-width`) drawn as a bracket across the picture's full width, labelled from it; `region` -> a dashed box with its name; `captured` and origin -> the provenance line on screen. Camera: a slow push-in toward the region.

## Never

Never assert a change (a coastline, a footprint) from a generated or mock texture: `scene-data --claims-change` needs two real, differently dated images, else `change-claim-unsupported`. A mock background is tagged schematic and says SCHEMATIC. A missing capture date or known extent is `imagery-metadata-missing`.

## Look and motion

Camera and overlays are animated in the film with GSAP (a pan, a push, a fade of the region box); the picture itself is the supplied file, untouched.
