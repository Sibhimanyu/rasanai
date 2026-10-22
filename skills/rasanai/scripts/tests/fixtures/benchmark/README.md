# Benchmark fixtures (W11)

Everything here is **synthetic**: invented products, numbers and an original actor. Nothing is a real product, a claim, a dataset or a third-party work, and none of it may be published.

- `fixtures.json`: the three fixed films (`character-story` 15 s, `product-launch` 30 s, `evidence-explainer` 45 s).
- `product-launch.brief.json`: the quick-film brief of the invented "Model P-1 desk lamp".
- `evidence-explainer/*.csv`: invented tables, each ingested with `--synthetic` (the renders carry a SCHEMATIC badge).
- `generated/`: renders, runs, stills and strips. Gitignored. Made by `node scripts/benchmark.mjs build`.

The "baseline" of each fixture is a deliberately degraded variant of the same render (stepped motion, a late music peak, a tight crop), labelled as such in every report. origin/master has none of the tools that make these films, so no honest earlier-behaviour render exists.
