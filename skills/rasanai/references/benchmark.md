# Technique benchmark and three-fixture A/B (W11)

A **measurable reference suite**, not an import of other people's prompts. Two parts.

## The technique catalogue

`library/benchmarks/video-techniques.json`: 20 rows, one per technique category (kinetic typography, CSS/SVG/GSAP, pure Canvas, generative Three.js terrain, 3D product turntable, hand-painted line boil, two-stage character acting, transformation transition, data visual, subtitle and reading pacing, no-words storytelling, sound-driven cut, palette-preserving grade, interface walkthrough, vertical short, code-rendered explainer, archival evidence, measured teardown, single continuous camera, opening and end echo).

Each row: `id, category, techniques, original_url, source_repo, source_commit, what_to_learn, what_not_to_copy, local_fixture` plus `license`, `link_basis`, `verified`, `verified_on`, `verification`. The wording is RasanAI's own. A row never holds another creator's prompt text, video, stills, logos, characters or tracks (`benchmark.mjs validate` refuses fields such as `prompt`, `poster_url`, `transcript`). It is a separate file because the precedent rows in `third_party/motionmaxxing/moments.jsonl` carry no URL or pin; it does not duplicate them.

`original_url` for GitHub rows is pinned to the commit in `third_party/SOURCES.md` (Video upgrade pins). Index rows (yihui-dev/awesome-opus5-5-videos) link the list's own page for the clip, matched by the list's category and tech tags, not reviewed by a human; the x.com post link is kept as `post_url` with `post_url_verified: false` because x.com answers 200 for any path. `node scripts/benchmark.mjs verify-sources --write` re-checks every link (network; the only network command). `local_fixture.kind: null` rows are the techniques with no fixture yet (listed in `third_party/BACKLOG.md` B11).

## The three fixture films

`scripts/tests/fixtures/benchmark/fixtures.json`: `character-story` (15 s, W5 Pim film, canon and reads checks), `product-launch` (30 s, W10 quick-film composition of an invented desk lamp, W3 events, W8 original score with a peak on the end-card hit), `evidence-explainer` (45 s, W9 data-physical and engineering-briefing scenes from invented CSVs). All synthetic and labelled; generated media goes to `scripts/tests/fixtures/benchmark/generated/` (gitignored). Never publish them.

## The commands (`scripts/benchmark.mjs`)

`list`, `validate`, `build`, `run`, `report`, `verify-sources`. `run` checks matching size, fps and length (within one frame), takes stills at fixed seconds, runs the EXISTING gates (motion-gate, slop, stage2d check and canon, reads, quick-film check, events, original-score check, sound check, evidence check; obey where a motion.md exists) and makes blinded X / Y strips through `crew.mjs ab`. There is no second quality score. `report` writes `BENCHMARK_REPORT.md` and `report.json`: technical pass/fail, seek identity, max text clipping, hero metrics, audio timing error in frames, real render seconds, peak memory, stills, losing cases.

Rules: a missing render is `not run`, never a win; the outcome only says which side the existing gates favour (only gates that ran on both are counted); human blind preference is `pending-human-review` and is never filled in by a script. The baseline is a deliberately degraded variant of the same render unless a real earlier-behaviour render is supplied with `--baseline`; origin/master has none of these tools, so none exists for the fixtures. Render seconds and memory of a derived variant are not compared with a full build.
