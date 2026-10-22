# Archive light table

Technique guide (not a preset or a style): read it only when the story needs this kind of real evidence. Method, rules and diagnostics: [references/evidence.md](../../references/evidence.md).

## Works from

images of real supplied scans or pages, each with title, date, repository, rights and located snippets.

## Ingest, map, check

```sh
E="node $SKILL_DIR/scripts/evidence.mjs"
$E ingest --run "$RUN" --kind archive-lighttable --source <authorized file> --origin "<who made it, where from>" --source-type user-supplied --permission authorized \
  --meta '{"title":"<page title>","date":"1890-03-12","repository":"<archive>","rights":"<licence or status>","snippets":[{"id":"s1","locator":"page:3/line:12-14","text":"<short quote>","rect":{"x":0.1,"y":0.28,"w":0.7,"h":0.07}}]}'
$E scene-data --run "$RUN" --recipe archive-lighttable [--aspect 9:16]
$E preview --run "$RUN" --recipe archive-lighttable --out "$RUN/evidence/preview" [--video]
$E check --run "$RUN" --strict [--aspect 9:16]
```

Synthetic test data is ingested with `--synthetic` (then the scene is SCHEMATIC and carries the badge). Fixture for this recipe: `gen.mjs` `mockPage()`: ruled grey bars standing for text, with one invented sentence in the metadata.

## Source to scene

pages -> sheets on a light panel; a snippet -> a highlight at its rectangle and the quote (25 words at most) with its locator; title, date, repository and rights -> the caption card; the provenance line at the foot.

## Never

An archival page is not permission to reproduce copyrighted text at length: over 80 words is `snippet-too-long` (error), over 25 a warning; a snippet without a locator is `locator-missing`; missing date, repository or rights is `provenance-incomplete`. A quote must equal the supplied snippet (`snippet-not-from-source`).

## Look and motion

Pages slide in on the light table, the highlight sweeps the located line, the card holds. Keep the scan's own marks; no restoration that changes content.
