# thinking-orbs, in RasanAI

Ported from [thinking-orbs](https://github.com/Jakubantalik/thinking-orbs) by Jakub Antalik, MIT (`LICENSE`, `NOTICE`). Library version 0.3.1; the licence file was confirmed as MIT (GitHub licence API and the repository's `LICENSE`).

What we took, and from where:

| Here | From | Used by |
|---|---|---|
| `LICENSE` | `LICENSE` (exact copy) | |
| `golden-subset.json` | `spec/orbs-golden.json`: 15 of its 72 cases (all nine states at size 20, six states at size 64), unchanged, trimmed to keep the repo small | `scripts/tests/orbs.mjs`: the port's geometry must match to the library's own tolerance (1e-4) |
| The nine mode geometries (`orbits`, `globe`, `rubik`, `wave`, `web`, `braid`, `ribbon`, `ring`, `morph`) and the 9 x 2 tuned presets in `runtime/rasan-orbs.js` | `src/engine/*.ts`, `src/presets.ts`, `spec/orbs-spec.json` (ported to vanilla JS, numbers unchanged) | `RasanOrbs.mount`, `references/orbs.md` |

The library's golden file holds geometry vectors, not PNGs, so the comparison is against geometry: every dot's x, y, z, radius, ink and alpha, and every line of the `connecting` web. Our measured worst difference is about 5e-7, and the painter is the library's (source-over circles, lines first, far to near), so a frame is the library's frame.

RasanAI's own additions (not from the library): the timeline clock, the state-change dissolve, the brand-colour ink (depth-weighted alpha of one colour instead of grey) and the hero size (the 64 design scaled).

Not taken: the React component and hooks, the React Native and SwiftUI ports, the demo site.
