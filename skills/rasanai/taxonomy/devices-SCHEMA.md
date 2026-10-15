# devices.json schema

`taxonomy/devices.json` is the catalog of **narrative devices**: the one idea a film is built on, laid over any product so the story isn't the default launch arc. `scripts/story.mjs` reads it (`devices`, `pick`, `check`); `node scripts/story.mjs validate` checks it against this schema. How Claude uses it: `references/story.md`.

## Top level

| Key | Type | What |
|---|---|---|
| `version` | number | Schema version (1). |
| `what` | string | One-line description of the file. |
| `families` | object | `{ <family id>: { code, name, what } }`. Seven families; `code` is the research letter (A-G). |
| `axes` | object | `{ <axis>: { what, values: [..] } }`. The 7 axes of difference `pick` measures distance on. |
| `tags` | object | `{ products: [..], tones: [..], formats: [..] }`. The vocabularies for `fits`. |
| `cliche` | object | The default arc and the lists to avoid (below). |
| `devices` | array | The devices (below). 70 in version 1. |

### Families

| id | code | name |
|---|---|---|
| `container` | A | Borrowed container: hijack a form the audience already reads (search log, receipt, weather report) |
| `camera` | B | Camera / space: one camera or framing rule (oner, split, locked frame, zoom) |
| `time` | C | Time: one rule about time (compressed, reversed, looped, real time, from the future) |
| `rhetoric` | D | Structural / rhetorical: a shape of argument with a built-in turn |
| `character` | E | Character: who tells it or whom it follows |
| `metaphor` | F | Metaphor / world: one metaphor or invented world pushed all the way |
| `constraint` | G | Constraint / stunt: a strict self-imposed rule |

### Axes (the 7 differences)

| Axis | Values |
|---|---|
| `family` | the 7 family ids |
| `protagonist` | `user` · `product` · `object` · `side-character` · `problem` · `audience` (direct address) · `none` (abstract) |
| `time` | `linear` · `compressed` · `reversed` · `looped` · `real-time` · `frozen` · `future` |
| `camera` | `cuts` · `oner` · `locked-off` · `zoom-scales` · `split` · `top-down` |
| `tone` | `deadpan` · `warm` · `epic` · `absurd` · `lyrical` · `tense` |
| `turn` | `reveal` · `reversal` · `list-break` · `pov-swap` · `escalation-collapse` · `reframe-line` (the structure of the turn at 60-75%) |
| `visual_world` | `typographic` · `ui-native` · `illustrated` · `abstract-material` · `data-viz` · `pastiche` (period or genre) · `paper-craft` · `diagram` |

Each device carries its **default** value on every axis. A pitch can move a device off its default (a warm museum instead of a deadpan one), but `pick` and `check` measure distance on the defaults, so three picks are different before Claude writes a word.

**The distance rule** (`pick` guarantees it, `check` re-checks it for a set of pitches): every pair of the three differs on at least 5 of the 7 axes, and always on `family`, `protagonist` and `visual_world`.

## A device

```jsonc
{
  "id": "museum-exhibit",          // kebab-case, unique; what pitches reference
  "code": "A5",                     // research code: family letter + number, unique
  "name": "The Museum Exhibit / Auction",
  "family": "container",            // a families key
  "what": "one line: what the device is",
  "fits": {
    "products": ["legacy-replacement", "saas", "any"],   // tags.products; "any" = works for anything
    "tones": ["deadpan", "premium"],                     // tags.tones
    "formats": ["launch", "brand"]                       // tags.formats
  },
  "beats": [ { "name": "Entrance plaque", "purpose": "one line" }, ... ],  // ordered, 3-6
  "example": "one line, a generic product (never the user's)",
  "pitfalls": ["what goes wrong with this device", ...],
  "build": { "score": 5, "how": ["illustration", "typography"], "note": "how it's built in code" },
  "overused": false,                // true = an LLM default (penalized)
  "ambition": 3,                    // 1 = expected, 5 = a real reach (used for the Sure/Bold/Wild ladder)
  "axes": { "family": "container", "protagonist": "audience", "time": "frozen", "camera": "oner",
            "tone": "deadpan", "turn": "reveal", "visual_world": "illustrated" },
  "seen_in": "Apple \"Data Auction\" (2022)",   // optional: a real film that uses it
  "needs": "footage"                // optional: an asset without which it can't be built ("footage", "product sounds")
}
```

- `build.score`: how feasible in code-built motion graphics (HTML/CSS/SVG/Canvas/GSAP via HyperFrames). 5 = plays to code's strengths (type, vector, UI, data, sync, loops); 3 = doable with notable craft risk; 1 = needs live action. `build.how` ⊂ `typography`, `ui`, `diagram`, `illustration`, `data-viz`, `abstract`, `paper`, `audio`, `footage`.
- `overused: true` marks the six devices LLMs reach for by default (`day-in-the-life`, `before-after`, `cosmos-zoom`, `product-as-character`, `chat-thread`, `movie-trailer`). `pick` weights them x0.3; `check` takes 2 off originality unless the pitch names a `twist`.
- `ambition` and `build.score` place a device on the ladder: **Sure** = most buildable and clear, **Wild** = highest ambition, **Bold** = the one between.

## `cliche`

| Key | What |
|---|---|
| `what`, `arc` | The default arc in one line: hook stat → problem montage → "Introducing X" → feature 1/2/3 → social proof → CTA. |
| `beats` | The 8 default beats, in order: `{ n, id, name, what, signals }`. `signals` are lowercase phrases `check` looks for (at a word start) in a pitch beat's name and on-screen text (hook and problem also in its visual). A pitch beat may also declare `maps_to` itself. |
| `stock_openers` | Regexes (case-insensitive) for stock opening lines: "Meet X", "Introducing X", "What if…?", "Tired of…?", "The future of ___ is here"… Matched against the logline, the title and the first beat's on-screen text. |
| `overused_devices` | Ids of devices with `overused: true`. |
| `overused_patterns` | Named LLM defaults that aren't devices (chaos → calm, the glowing prompt box, the friendly blob, the hyperlapse day). |
| `visuals` | Visual clichés `{ id, name, signals }` (glowing orbs, particle networks, blue-purple gradients, sparkles, holographic UI, isometric floating cards, "the future is here" copy, stock handshakes, three feature cards, the tilted dashboard, confetti, the glowing globe, lens flares). `check` scans beat visuals, on-screen text, `visual_motifs` and `signature_image`: -1 fit each; 2 or more fail gate G1. |

## Adding a device

Give it a unique `id` and the next `code` in its family, fill every field, use only values from `axes` and `tags`, and run `node scripts/story.mjs validate`. Examples must be for a generic product (vary the product across devices) and must not repeat another device's example.
