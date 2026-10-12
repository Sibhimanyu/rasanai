# Source modes: what the film is made from

RasanAI's research desk was built for a public product with a website: the truth is on the web and the pictures are made from scratch. When the film is made from the user's **own footage**, that turns around. The truth is in the rushes, and the job is to find the film inside them, not to write one. So the Brief decides a **source mode**, and the source decides who researches, who writes the story and which gates apply.

Research behind this: `.context/night/R4-footage-and-cases.md` (how professionals cut a client's own footage, the 18 cases, the tool audit).

## 1 · Source mode, at the brief

```bash
node $SKILL_DIR/scripts/research.mjs sources --paths "<folder or file>,<...>" [--url <site>] [--code <dir>] [--kind "<what it is>"] [--public] --out "$RUN/sources.json"
```

It lists names, sizes and ffprobe durations only, never content, and only folders the user approved (rule 14). It writes:

- `mode`: `web` · `local` (code) · `footage` · `assets` · `document` · `existing-video` · `audio` · `mixed`
- `spine`: the source the story is built from, in this order: footage, existing-video, audio, web, code, document, assets
- `case`: the matrix row (`own-brand-film`, `customer-testimonial`, `event-recap`, `public-launch`, `own-unreleased-product`, `social-cutdown`, ...), from `--kind` and the sources
- `story_pass`: who writes: `footage-writers` · `cutdown-planner` · `treatment-writers` · `script-writers`
- `product_first`: whether the product-first rules apply (a web or code spine of a product launch or promo only)
- `sources[]` with counts and hints (clips, hours, interviews, vertical phone clips, log or HDR, variable frame rate, separate audio, fonts, guideline PDFs) and `chips`, the line the brief shows ("47 clips (3 h 12 min) · Brand kit · slowpour.pt")

`crew.mjs plan --sources "$RUN/sources.json"` then chooses researchers by source kind, not by route:

| Source kind | Desk | Members |
|---|---|---|
| web | research | product (screens too on the long path), brand, precedent / brand film |
| code | local | local scout per approved folder (`--local`) |
| footage, existing-video | footage | the Director runs `footage.mjs`; `footage-logger` per bin; `selects-producer` |
| assets (brand folder, guidelines PDF, fonts, logos) | brand kit | `brand-kit-builder` in place of the web brand researcher and the brand-film web search |
| document | research | product researcher in document mode (claims sourced as `file p.N`) |

The research lead stays the single merge point. Precedence: an approved brand kit beats the web for the look; the web beats footage for dated facts (prices, hours); footage beats everything for what happened on the shoot. A founder's sentence on camera is a **said** claim: attributed ("Maya, founder"), never a standalone fact card unless the web or the code agrees.

## 2 · Which gates apply

- **Product-first** (rule 15; `story.mjs` G7, G9, G10, G11, G12) applies only to a web or code spine whose case is a product launch or promo. A footage film has no "product UI within 3 s" to promise. `story.mjs` reads `--sources`, `--source-mode <spine>` or `<run>/sources.json`; `--product-first` still forces it.
- **GF, footage-first** takes its place on a footage spine: the hook is the strongest real moment (a rated 4+ bite or a gold moment, checked against `footage/selects.json`) and it plays at once; no card before the first real footage unless a `cold_open { why }` of 2 s at most; footage is at least 60% of the film (40% is an error); at most one card per 12 s; every footage beat names a `bite`, `moment` or `clip`.
- **The paper edit** is checked by `footage.mjs check-paper` (section 4).
- The Moves pass stays off for footage; the transitions between footage and graphics get a lighter version, "joins": 3 to 5 designed seams (a lower third that wipes on the camera's own pan direction, a card whose colour field is sampled from the outgoing frame, a shape matched from the last frame into the card).
- The concept gate stays on, with footage questions: is the hook the strongest real moment? does every claim come from the material or the ledger? does the cut keep each speaker's meaning? is the brand kit obeyed?
- **Order for a reel:** Brief, Footage, Story (three paper edits), Look (card, overlay and caption identities drawn for the chosen cut), Cut (the reel's Animatic), Build, Final. The Look comes after the Story and before the Cut, because the cut needs the cards' and overlays' timing.

## 3 · The footage desk (scripts)

All under `$RUN/footage/`; originals are never modified; every step can be re-run. Only installed tools are used: ffmpeg, whisper-cli, and (optional, macOS) Apple Vision through `/usr/bin/swift`.

```bash
node $SKILL_DIR/scripts/footage.mjs ingest   --footage <dir>[,<dir>] --run "$RUN" [--hash full] [--proxy 720]
node $SKILL_DIR/scripts/footage.mjs shots    --run "$RUN" [--threshold 10] [--every 6]
node $SKILL_DIR/scripts/footage.mjs vision   --run "$RUN"                      # optional
node $SKILL_DIR/scripts/footage.mjs transcribe --run "$RUN" [--lang auto|<iso>] [--names names.txt] [--channels-as-speakers]
node $SKILL_DIR/scripts/footage.mjs bites    --run "$RUN"
node $SKILL_DIR/scripts/footage.mjs merge-log | check-log | check-selects | check-paper --paper story/paper-<L>.json --length <s>
```

- **ingest**: deep walk (camera cards nest); video, separate audio, stills. A fingerprint per file (the cache key), ffprobe facts, colour (`rec709|hlg|pq|log?`), variable frame rate, creation time, camera, bins (folder + camera + day), dual-system audio matched to clips by cross-correlating loudness envelopes, optional 720p constant-frame-rate proxies in `~/.rasanai/cache/proxies/`.
- **shots**: shot boundaries by ffmpeg `scdet`, a keyframe (480 px) and a 4-frame strip per shot, a keyframe every 6 s in long takes; quality per shot from `signalstats`, `blurdetect`, `siti`, `freezedetect`, `blackdetect` and audio clipping, as `flags`: `soft-focus`, `underexposed`, `overexposed`, `clipped-highlights`, `shaky-or-fast`, `flat-or-log`, `frozen`, `black`, `clipped-audio`. The flags are a lead; the logger decides by eye. (This ffmpeg has no `drawtext`, so there are no burnt-in timecode strips.)
- **vision**: faces, people, saliency, scene labels, on-screen text with sensitive hits (emails, keys, numbers, passwords). On-device; without macOS or swift it is skipped with a note and the rest works.
- **transcribe**: whisper-cli, word timings with confidence. **The language is decided first** (`lib/lang.mjs`): `--lang`, else the audio tag, else `whisper-cli -dl` with a multilingual model, else the transcript is marked **unverified** and checked for translation tells. An English-only model (`small.en`) translates other languages into English without saying so, so it is never the silent default. A language that needs a multilingual model that is not installed is reported, never downloaded: ask the user first (`ggml-small.bin`, about 466 MB). Speakers are `S1` unless `--channels-as-speakers` (one mic per stereo channel). `names.json` is the glossary (self-introductions, `--names`); the user confirms spellings once.
- **bites**: every sentence from the word timings, with word-aligned `in`/`out` (first start - 0.08 s, last end + 0.12 s), pace, confidence and fillers. A draft the selects producer rates.

`reel.mjs scan` stays the quick path for a plain reel, with the same language rule and contact sheets that scale with the clip (one frame per ~6 s, 8 to 48).

## 4 · Crew, files and checks

| Role | Writes | Accepted when |
|---|---|---|
| `footage-logger` (per bin) | `footage/log-<bin>.json`, `LOG-<bin>.md` | every shot logged; sizes, moves, roles from the enums; `usable` inside the shot; gold has a reason; sensitive text handled; `## Looked at` |
| `selects-producer` | `footage/selects.json`, `SELECTS.md` | bites inside their clip and on word boundaries; text matches the transcript minus cleanups; ratings; at least 8 rated 4+; a gaps list; story candidates cite real ids |
| `footage-writer` (Sure, Bold, Wild) | `story/paper-<L>.json`, `PAPER-<L>.md` | `check-paper` passes |
| `brand-kit-builder` | `research/brand/DESIGN.md`, `assets/logos.json` (`source: {file, page}`), `fonts/`, `KIT.md` | DESIGN.md reads back; colours cite a file and page; logos are the user's files; fonts staged or a substitute declared; KIT.md lists the forbidden uses |

`check-paper` fails on: an id that does not exist; a bite off word boundaries or outside its clip; a spine length more than 8% off the target; a hook that is not a rated 4+ bite or a gold moment (or a card first without `cold_open`); a bite with cleanups and no `frankenbites` entry with a `meaning_note`; an **uncovered join** (no b-roll `covers_join`, not marked `jump: "intended"`); a b-roll shot under 1.2 s or used more than twice; a `poor` shot without `accept_poor` and a reason; a graphic claim not in `research/claims.json`; a person unticked in `footage/approvals.json`; more than one card per 12 s.

## 5 · How to cut footage (for the writers)

The professional order, and why: **selects, paper edit, radio edit, b-roll, graphics, music, grade.** In unscripted work the script is written last, from what was said and shot. The moment with the feeling beats the moment with the information (Murch: emotion first, then story, rhythm, eye trace).

**Shapes by case** (beat shares are guides):

- *Brand film from a shoot:* journey or portrait. A sensory moment, the person, the why, the craft, the people it serves, the line.
- *Founder:* hook bite, origin, turn, vision, button.
- *Customer testimonial:* problem, why this product, result, a proof number, recommendation. One customer's own words; no joins across answers to different questions; show a disclosure line when the customer has a material connection.
- *Event recap:* arrival, energy, ideas (stage bites), people, payoff, the next date. Assemble silently first, then add bites; sponsor logo rules.
- *Recruiting:* three to five real people, the work, the team, the why-here, the call. No corporate filler bites.
- *UGC ad:* hook in 0-3 s with a face or a claim, demo, proof or reaction, offer, CTA; three to five variants; native look, captions are the hero type.

**Radio edit:** cut on word boundaries (the selects already are), keep the breath at a sentence start, never join mid-thought, put room tone under joins, 10-30 ms crossfades. If it works as audio it works as picture. J and L cuts of 0.3 to 1.0 s at scene changes.

**B-roll has three jobs:** illustrate what is said, cover a join, breathe (a beat of picture and music between ideas). At least 1.2 s a shot, 2 to 4 s typical, one idea per shot, the same shot at most twice, cut on the music grid or the speaker's emphasis.

**Frankenbites:** allowed: removing fillers, repeats and asides. Not allowed: joining clauses so that the claim, the tense or the subject changes. Every join is declared with a `meaning_note`.

**Graphics are sparing.** At most one card per 12 s on average in a brand film (event recaps and lists may use more). A card's ground comes from the outgoing frame or the kit and enters on a music phrase. Lower thirds: 0.8 to 1.5 s after the speaker's first word on screen, held 3 to 5 s, once per person (again only after more than 60 s away), never over the face box, names exactly as in `names.json`, inside the platform safe zone.

**Gaps:** what the story needs that the footage lacks is named and covered honestly: a card, a map, a designed graphic, a screen capture, a still with a move, or a **pickup shot list** for the user ("if you can film these three shots the film gets better") as an `ask` with "go without" as the default. Never invent footage.

**Approvals only the owner can give** (one console `ask`, grouped, each with a recommended default, only when there is something to ask): names and titles, quote tightening (fillers and repeats only; testimonials: the customer reviews the cut), people on camera, `said` claims that would appear as on-screen numbers (default: an attributed quote), partner and sponsor logos, sensitive things on screen (default: blur), disclosure. Answers go to `footage/approvals.json`.

## 6 · The brand kit

When the brand is the user's own, it is on disk. The kit builder reads the guidelines PDF (`pdftotext -layout`, `pdftoppm`, `pdfimages`), the font files (`fc-scan`), the logos and any earlier films. It never redraws a logo. Earlier films go through `brandfilm.mjs frames|measure|card` on the local files; with none, the rushes' measured grade and framing set the photographic grammar. The web brand-film search (rule 19) is skipped when a kit exists. When the brand is also public, the kit builder compares the kit with the live site and reports drift as a question, never overriding the kit.

## 7 · Not built yet

`stringout` strips by theme, `radio` (rendering a paper edit's radio edit as audio; `~/.claude/skills/media-use/scripts/transcript-cut.mjs` does word-timing cuts when present), `grade-plan` and grade continuity, `reframe` per aspect with platform safe zones, `track` for overlays, deliverables in `reel.json`, `check-cut`, the App Store capture-only mode, and the console's Footage panel and paper-edit players. See R4 section 6 for the order.
