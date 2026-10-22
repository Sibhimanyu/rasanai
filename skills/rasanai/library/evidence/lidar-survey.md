# LiDAR survey

Technique guide (not a preset or a style): read it only when the story needs this kind of real evidence. Method, rules and diagnostics: [references/evidence.md](../../references/evidence.md).

## Works from

points: JSON `{unit, points:[[x,y,z,class?]]}`, `.xyz` text or an x,y,z CSV (a sample, up to 2,000,000 points); LAS/LAZ are unsupported until you convert a sample.

## Ingest, map, check

```sh
E="node $SKILL_DIR/scripts/evidence.mjs"
$E ingest --run "$RUN" --kind lidar-survey --source <authorized file> --origin "<who made it, where from>" --source-type user-supplied --permission authorized
$E scene-data --run "$RUN" --recipe lidar-survey [--aspect 9:16]
$E preview --run "$RUN" --recipe lidar-survey --out "$RUN/evidence/preview" [--video]
$E check --run "$RUN" --strict [--aspect 9:16]
```

Synthetic test data is ingested with `--synthetic` (then the scene is SCHEMATIC and carries the badge). Fixture for this recipe: `gen.mjs` `pointCloud()`: a deterministic generated terrain with three boxy buildings, labelled SYNTHETIC.

## Source to scene

points -> the same points under ONE uniform scale and shift (`transform.center`, `transform.scale`, z never stretched), each carrying its `source index`; extents -> measurements `<id>-extent-x|y|z` and `<id>-count` drawn as labels; class -> colour (or elevation ramp); an optional ground grid at the lowest z; a sweep reveals along x.

## Never

No point data: survey mode is blocked (`survey-blocked-no-points`), no terrain is ever generated. Moving, jittering, smoothing or stretching coordinates is `lidar-relative-changed` / `lidar-vertical-exaggeration`: `check` recomputes every scene point from the source. Positions are relative, there is no georeference unless the file states one.

## Look and motion

Canvas points in the preview; in a film the same `scene.json` points feed Rasan3D (Points with a camera orbit and a peel), keeping the transform.
