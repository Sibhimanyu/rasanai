# Custom styles (user-owned, reusable film styles)

A custom style is an **explicit user asset**: a look the owner chose to keep and reuse, stored beside Brands and Series in the Studio library, never in the skill. It does not replace the design desk: a film that calls for three bespoke Look candidates still gets three. A saved style enters a film only when the owner asks for it (or a Series carries it).

```text
<library>/Styles/<slug>/   style.json  DESIGN.md  grammar.json  recipe.json  blend.json  specimen.html
                           SOUND.md?  PREVIEW.md  previews/{original,modified,comparison}.png, contact-strip.png, test-15s.mp4
                           history/<revision>.json
```

The library root is the Studio's (`--library`, its project root, default `~/Documents/RasanAI`); with no flag `$RASANAI_LIBRARY`, else `$RASANAI_HOME/library`, else the default. A library inside the skill folder is refused. `skills/rasanai/library/styles/` is imported reference material and stays untouched. The files are the existing syntax (DESIGN.md read by `design-md.mjs`, grammar.json in `grammar.mjs`'s schema, recipe/blend/specimen as the design desk writes them): `design.mjs check-system` and `grammar.mjs check` judge a style like any look.

## Commands (`scripts/custom-style.mjs`)

| Command | What it does |
|---|---|
| `list --library <dir>` | the styles in the library |
| `create --library <dir> --from-run <RUN> --name "Warm Ink" [--label Sure] [--brand DESIGN.md]` | extract the run's chosen design system (and its grammar) into a new style; a brand film's brand becomes a lock |
| `inspect --style <dir>` | palette, fonts, grammar, settings, history, hash, brand lock and every editable property with its class |
| `customize --style <dir> --changes <changes.json> --name "Night Ink" [--preview]` | write a NEW style from a closed list of edits; the base is never touched |
| `compare --base <dir> --candidate <dir> --out <comparison.png>` | the same film positions of both styles side by side, labelled ORIGINAL / MODIFIED |
| `test --style <dir> --duration 20 --out <dir>` | the 15-30 s code-driven diagnostic film: title, hero object, one camera move, two signature movements, a transition, an end card; contact strip, MP4, `test-report.json` |
| `check --style <dir>` | style.json, `grammar.mjs check`, `design.mjs check-system` (on a temp copy, so the style is never written to) |
| `bind --style <dir> --run <RUN> [--as-look]` | snapshot DESIGN.md, grammar and the revision into `<RUN>/style-snapshot/` (read-only) and `decisions.json custom_style`; `--as-look` also makes it the film's look |

Exit codes: 0 done, 2 refused or a gate failed, 1 could not run. Chrome or ffmpeg missing: the report says `not run: <reason>`, never passed.

## Edits: a closed schema, three classes

`changes.json` is `{ "changes": { "<property>": value }, "approve_character_changes": true, "note": "..." }`. It is data, never code. Unknown properties (and unknown top-level keys) are **rejected, not ignored**.

- **Safe variation** (applied directly): `palette.canvas|ink|accent|support|surface|muted` (#rrggbb, ink on canvas stays 4.5:1), `fonts.display|body`, `pacing.tempo` (0.5 to 2), `shape_density` (airy|balanced|dense), `sound.instruments`, `motion.intensity` (0.5 to 1.5).
- **Character-altering** (a new version; the consequences are shown first and recorded; needs `"approve_character_changes": true`): `material.surface`, `material.texture`, `layout.preset`, `lighting.logic`, `camera.grammar`, `motion.vocabulary`.
- **Fundamentally different** (`medium`, `drawing_medium`, `rendering_medium`, `render_engine`, `dimension`...): refused. Breaking the core drawing or rendering medium is a new independent style (`create` from a film drawn that way), never "the same preset".
- **Brand lock**: a style made from a brand film keeps the brand's palette, display face and body face. A colour or face that differs is refused and the reply lists what the brand contract still allows (pacing, density, sound, move intensity, motion, camera, lighting, material, layout).

`customize` always writes a new slug next to the base: revision `r(n+1)`, `parent` {id, revision, hash}, `history/` carried over plus the new `history/<revision>.json` (settings, changes, consequences, file hashes). Provenance (`license_sources`, `created_from`) is kept. Pacing, intensity, density, camera, lighting and vocabulary edits are written into a marked block of DESIGN.md's "Motion and camera" section, which is what the animators build from.

## In a film

Reusing a style is a choice the owner makes (Series is the existing way to reuse one automatically). When a film uses one, run `bind` first: the film reads `<RUN>/style-snapshot/`, so later edits, new revisions or variants never change an approved film; replacing the snapshot takes `--rebind`. Previews go through the existing Look and Final screens when the owner asks; a style test is never a sixth checkpoint.

## What the test film is, and is not

It is drawn from the style's own palette, type, radii, motion contract and grammar by one paused GSAP timeline in headless Chrome (software GL with `RASANAI_GL=cpu`), seeked frame by frame (A-B-A gives identical frames), encoded with ffmpeg. The two signature movements are generic archetypes (a staggered entrance, a landing stamp) labelled with the grammar's technique names: it diagnoses colour, type, rhythm and the grammar's transition label, not a storyboard. Idea credit: Lemo-Opuscar's MY-STYLES (see third_party/SOURCES.md); no code or media taken.
