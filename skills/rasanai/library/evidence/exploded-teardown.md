# Exploded teardown

Technique guide (not a preset or a style): read it only when the story needs this kind of real evidence. Method, rules and diagnostics: [references/evidence.md](../../references/evidence.md).

## Works from

model: GLB / glTF (named mesh nodes), OBJ groups or a JSON parts list; at least two named parts.

## Ingest, map, check

```sh
E="node $SKILL_DIR/scripts/evidence.mjs"
$E ingest --run "$RUN" --kind exploded-teardown --source <authorized file> --origin "<who made it, where from>" --source-type user-supplied --permission authorized
$E scene-data --run "$RUN" --recipe exploded-teardown [--aspect 9:16]
$E preview --run "$RUN" --recipe exploded-teardown --out "$RUN/evidence/preview" [--video]
$E check --run "$RUN" --strict [--aspect 9:16]
```

Synthetic test data is ingested with `--synthetic` (then the scene is SCHEMATIC and carries the badge). Fixture for this recipe: `parts.json` (an invented hinge assembly) and the synthetic GLB.

## Source to scene

each part -> a box under one uniform scale, pulled along the direction from the assembly centre to the part's centre; label = part name plus its measured `W x D x H`; legend lines sorted so they do not cross.

## Never

No claim about internal parts the model does not hold (`parts-missing` under two parts); no exact dimension when the unit or bounds are missing (the label says `dimensions not supplied`). Part bounds are boxes, not the mesh.

## Look and motion

Rasan3D camera and easing for the explode; a hold at full separation, then reassemble; GSAP stagger by part order.
