# Projection on a white model

Technique guide (not a preset or a style): read it only when the story needs this kind of real evidence. Method, rules and diagnostics: [references/evidence.md](../../references/evidence.md).

## Works from

model: GLB / glTF, OBJ or a JSON parts list that the user is allowed to use (or an explicitly schematic one).

## Ingest, map, check

```sh
E="node $SKILL_DIR/scripts/evidence.mjs"
$E ingest --run "$RUN" --kind white-model --source <authorized file> --origin "<who made it, where from>" --source-type user-supplied --permission authorized
$E scene-data --run "$RUN" --recipe white-model [--aspect 9:16]
$E preview --run "$RUN" --recipe white-model --out "$RUN/evidence/preview" [--video]
$E check --run "$RUN" --strict [--aspect 9:16]
```

Synthetic test data is ingested with `--synthetic` (then the scene is SCHEMATIC and carries the badge). Fixture for this recipe: `gen.mjs` `glb()`: a real, tiny GLB with three box meshes, marked synthetic.

## Source to scene

each mesh node -> a part with its bounding box under one uniform scale; dimensions -> `<id>-<part>-x|y|z` measurements, drawn as `W x D x H` from them; a light band sweeps over the white faces (the projection layer).

## Never

A projection without an authorized model is schematic and says so (`model-not-authorized` when mode is measured). No unit means no dimension (`unit-missing`): nothing is guessed. Node rotations are not applied to bounds (noted on the part).

## Look and motion

Rasan3D for the model, key light and the projected layers (a texture or a shader on white material); `scene.json` supplies parts and dimension labels.
