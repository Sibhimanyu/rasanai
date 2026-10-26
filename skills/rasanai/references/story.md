# Story: the playbook

Left alone, every AI launch video tells the same story: hook stat → problem montage → "Introducing X" → three features → CTA. That is a sales deck built outward from the feature list, and it has no argument. RasanAI's stories start from **one argument** instead: a proposition a viewer could say back and the proof that carries it. A villain they know, a turn that reverses something, a peak where the proof is hardest and a payoff that answers the opening are **optional tools** (Plan 03): the grammar for the film's communication kind (`story.mjs grammar --kind <kind>`, `lib/story-grammars.mjs`) says which tend to help; none is required and none is banned (`references/intent.md`). The features show up inside that argument as evidence.

Why: three films in a row (FILM-D, E, F) reused one story assembled from a seeded device draw, a template with no turn slot and a launch template's payoff line. Its "turn" was a third, unrelated use; its payoff answered a question asked ten seconds earlier; its biggest type went to a price input. Every check passed, because the checks counted form. Judgment now comes from one owner (the writer) holding one written argument, checked by meaning tests.

Why (the set): the QR Jam run (a 10 s launch) shipped three pitches that each passed alone while the set collided. Two shared a device, all three peaked on the same pull-back, two shared lines word for word, all three dropped the brief's one surprising fact, and two writers moved nouns into the `actor` to pass the scope check. Checks that look at one pitch cannot see that, so the set is now planned before it is written, and the gates read the set.

The engine is `scripts/story.mjs` over the catalog `taxonomy/devices.json` (70 devices in 7 families; schema in `taxonomy/devices-SCHEMA.md`). The loop:

1. **Truth sheet** → `story.mjs truth --out "$RUN/story/truth.md"`, then fill it.
2. **Pick** → `story.mjs pick --truth "$RUN/story/truth.md" [--recent <ids>]` → three slots (Sure, Bold, Wild), each with a shape and a plot engine, and a device **menu** (recent devices removed).
2b. **Plan** → the story planner (`agents/story-planner.md`) writes `story/plan.json`: per slot the angle, villain picture, turn kind, peak kind, device, `swap_breaks` (what the main competitor cannot claim) and owned claims, plus a coverage map for the brief's must-shows and surprising facts. `story.mjs plan --plan story/plan.json --picks story/picks.json --truth story/truth.md` validates it (`plan-slots`, `plan-shape`, `plan-device`, `plan-turn-kind`, `plan-peak-kind`, `plan-angle`, `plan-swap`, `plan-claims`, `plan-coverage`). Writers fill their slot; they do not choose these.
3. **Argument, then pitch** → each writer writes `story/intent-<label>.json` (`references/intent.md`), then `story/pitch-<label>.json`.
4. **Check** → `story.mjs intent` and `story.mjs check`, then rewrite until they pass.
4b. **Moves** → a move-inventor per passing pitch invents its carrier and hero moves (`references/moves.md`); a juror gates them; a sketcher roughs each script's top move.
5. **Edit** → the script editor (always; no route skips it) runs the meaning tests: blind retell, cover-the-logo and competitor swap, muted hook, turn, payoff, plus plan conformance and coverage.
5b. **Revise** → any pitch the editor marks `rewrite` or `replace` goes back to its writer once, with that label's notes from `story/edit-notes.json` (`story.mjs revise --notes story/edit-notes.json` lists them). Then `story.mjs check` re-runs on the set. A second editor pass does not run.
6. **Show** → the three scripts in the console (references/workflows/story-and-moves.md, "2 · Story"), with each one's proposition and turn line above its beats.
7. **After the choice** → the concept critic, then one rough thumbnail per beat on one sheet and the **structure critic** (`agents/structure-critic.md`), who may cut, merge or move beats, move the peak, demand a rest or rewrite a buys. Only then are durations set, from each beat's read and importance.

The writing itself (lines, the show column, structures by length, worked examples) is `references/script.md`.


## 0. Format-aware treatments (the default, Plan 03)

**Workflow.** `crew.mjs plan --story-mode balanced` (the default): ONE scoped script writer proposes **three compact treatments** in `story/treatments.json`; ONE independent editor reviews the set; ONE focused revision; an independent extra writer only when `story.mjs treatments` reports `escalation.needed` (diversity, clarity or evidence insufficient). `--story-mode multi` is the three-writer room (planner, Sure/Bold/Wild writers, engines) and `deep` adds the Moves pass; a series keeps its one-script path. The user is offered three choices unless a series, "you decide" or a budget choice authorizes fewer. No polished boards, camera plans or rendered hero moves exist before Look; one selected treatment is developed afterwards. Cards are titled by the treatment's premise (`treatment_title`); Sure / Bold / Wild is a secondary tag.

**Grammars.** `story.mjs grammar --kind <communication_kind>` prints the starting narrative logic and the evidence a kind needs (whole-product introduction, single-feature announcement, workflow demo, instructional explainer, brand manifesto, identity reveal, performance ad, teaser, event opener, evidence case study, character short, music/lyric film, footage-led story). They are starting points. Optional craft tools (villain, twist, peak, reveal timing, "Introducing / Meet X", early logo, metaphor, crescendo, motif, hard cut, silence) are used when they serve the assignment and listed in `optional_tools` with their purpose; no checker requires or bans one.

**The v2 treatment** (`lib/treatment.mjs`; `story_format: "v2"`):

```jsonc
{ "story_format": "v2", "id": "t-project", "tag": "Sure",              // tag = secondary card label
  "treatment_title": "One invitation, from notes to sent", "premise": "...", "logline": "...",
  "communication_kind": "whole-product-introduction", "proposition": "...", "viewer_takeaway": "...", "perspective": "the person with rough notes",
  "takeaways": [ { "id": "t1", "text": "you can start from rough notes", "required": true } ],
  "optional_tools": [ { "tool": "motif", "purpose": "the same notes card returns" } ],
  "abstraction": { "justification": "(only for kinds where abstraction is the point)" },
  "beats": [ { "id": "beat-writing", "internal_beat_label": "Writing demonstration", "grammar_role": "demonstration",
      "viewer_takeaway": "I can start with rough notes rather than polished copy.", "on_screen": "Turn these notes into an invitation.", "voiceover": null,
      "visual_event": { "before": "three rough event notes", "change": "the request produces an invitation draft", "after": "a short, usable invitation" },
      "evidence_refs": ["c3"], "relation_to_previous": "open", "duration_provisional_s": 6, "channel_role": { "mode": "screen-only", "reason": "" } } ],
  "coverage": { "ledger": [ { "takeaway_id": "t1", "beat_id": "beat-writing" } ], "excluded": [ { "item": "c9", "why": "not true on every plan" } ] } }
```

Fields are separate and ids are stable: `treatment_title` helps a person choose; `internal_beat_label` never reaches rendered text (a leak is an error); `on_screen` may be empty; `voiceover` may be null; `visual_event` states before, change and after (not "a gradient animates behind Desire"); `evidence_refs` are ids from the claims/briefing; `duration_provisional_s` is provisional (final timing stays in the score). **Channel roles** (`split`, `caption`, `emphasis`, `accessibility`, `screen-only`, `voice-only`, `silent`) replace the old "the voice never repeats the screen": a repeat is fine when the role says why.

**Review** (`story.mjs treatments`, then the editor's `story.mjs review`): every finding is `{ issue_id, beat, evidence, severity, fix }`. `error` = mechanical or factual (unsupported claim, must-show missing without approval, bad or duplicate id, unreadable source, deceptive UI, contradictory duration, missing qualifier, leaked label) and always blocks; `major` = a creative concern that blocks (a beat that names no behavior and has no proof or change, a promise with no shown behavior, a takeaway the mapped beat never says); `minor` = a creative note; `craft` = an optional choice assessed for purpose. Provenance and factual checks are unchanged. The **coverage ledger** maps each required takeaway to a beat and its evidence or visual event and records what was left out and why; an id beside a vague title is not coverage. Candidates are compared by proof selection, information order, perspective and premise, never by decoration.

**Legacy.** A saved pitch, intent or chosen story (villain, turn, engine, peak) still reads: `lib/treatment.mjs readTreatment` adapts it without rewriting it, and `story.mjs check` runs the legacy rubric on any pitch without `story_format: "v2"`.

**References.** `story.mjs refs --kind <kind> [--role <role>]` returns at most three house examples with a provenance record (`lib/story-refs.mjs`); the summaries are original, nothing is copied, and none is a universal template.

### Original premises and proof (treatments mode)

- **Premise first.** Before the three treatments the writer states, in its existing rationale text: the assignment, the product-specific promise, the strongest available proof and what a stranger would remember. (The compact /brag principle: a specific promise, then the strongest real proof. Not its fixed duration, not its skip-the-user workflow.)
- **Three treatments differ in proof organization, point of view or central premise.** Costume changes ('safe / bigger text / more particles') are not diversity. A capability sequence is valid when breadth is the proposition; a single workflow is valid when it proves the specific promise. Each treatment has an original conceptual visual idea (what changes on screen that carries the claim); camera and choreography stay provisional until Look, and one Story can legitimately support several looks. No storyboard is made here.
- **Demonstrations keep meaning.** A changed sentence, correction, calculation or rule must keep the source's people, numbers and conditions. Record a proof contract (`lib/proof-integrity.mjs`: source, intended claim, protected entities/quantities/conditions, supported outputs, `illustrative`). Structural checks find missing evidence or qualifiers; the independent script editor decides whether meaning is equivalent, in its existing pass (batched). 'Very tired' to 'exhausted' proves a writing change, not learning or retention; rising bars do not prove that exercises adapt; a clearly labeled fictional example is allowed, a fabricated capability or testimonial is not.
- **After the user chooses a Story**, a recommendation for a different one goes back through the existing revision mechanism. A selected Story is never rewritten because a critic prefers a flashier one.

## 1. The truth sheet (before any argument)

Specificity comes from here, and this is the step that gets skipped most: **specific in detail** (the real label, the exact prompt, the number), **common in situation** (a moment most of the audience has had this month). Fill every section from the capture, the brief, the screenshots and the user's words:

- **Claim scope**: `scope: universal | category | single-task`, `why` (the sentence from the feature's own page that decides it), `clauses` (the promise's own clauses, separated by `;`), `audience: mass | role | persona`, `series: no | yes`. **universal**: the promise is "any / anything / everyday / whatever", or the official examples span 3+ areas of life. **category**: one family of jobs ("reviews every pull request"). **single-task**: one job done well ("sends the class a link mid-lesson"). `pick` refuses a launch, promo, product or brand truth sheet without it.
- **Use moments** (8 to 12 rows for a universal claim, 3+ for a category): `- <area of life>: "<a real use or ask, verbatim>" [claim id] (reach: most | many | some | few; asset or "prompt only")`, ranked most universal first, seeded from the brand's own launch film and page. Areas for a universal claim: learn, money, food-hosting, social-money, play, work, health, travel, home, creativity, shopping, other.
- **Transformation**: from ___ to ___, in the audience's words, at the claim's scope.
- **Emotional truth**: the feeling under the task, at the claim's scope (for a universal claim, one most of the audience has had: "the small letdown of asking for help and getting paragraphs to read").
- **Enemy**: a thing, a habit, a phrase or a deadline; never a competitor. It is where the intent's **villain** comes from: pick the one concrete object that does one wrong thing on screen.
- **Native objects (8 or more)**, **Native formats (5 or more)**, **Native words** (the product's exact UI labels, copied: the only UI words a film may show).
- **Proof** (every claim with its source), **Surprising facts** (at least one, sourced), **Must-show features** (3 at most), **Assets**, **Competitors** (for the swap test), **Audience**, **Format / length / aspect**, **Tone**, **Tags**.
- **The cliché version**: the default-arc film in six lines. The negative example.

`pick` refuses an empty sheet and lists the gaps of a thin one (`truth_gaps`); fill them rather than pitching around them.

## 2. Plot engines: a legacy turn (optional)

Three engines (the legacy multi-writer room; the default balanced workflow uses grammars and treatments instead, section 0). Each pick slot names one; a script that uses an engine states its turn in one line (`pitch.turn: {line, reverses, payoff}`), and the editor and the concept critic fail a turn you declare that reverses nothing or a payoff that answers a different question than the opening asked. Declaring no turn is allowed.

| Engine | Shapes | The turn | The peak (60-75%) | The payoff |
|---|---|---|---|---|
| `reversal` | pas, intercut, scenario | the product reverses the villain, at 15-45% ("Send one link instead": the thread folds into one chip) | the hardest proof: the use that goes furthest (one meeting becomes a whole week) | the opening's object returns, changed (the buried Thursday, clean) |
| `refrain-break` | ladder, montage, claim-ladder, hero-strip | the break IS the peak: after 2 to 4 rungs of one pattern, one rung breaks it (the product finishes the refrain line itself, the refrain stops, the plain answer arrives) | the break | the close generalises the refrain ("Ask anything") and answers the open |
| `before-after` | before-after, steps, process | the cause made visible: the one action that makes the difference, on screen | the after at full, the cause still visible | the before's frame, now after |

How to tell a real turn: write what the viewer believed just before it and just after. If the two sentences are the same with another example, it is not a turn. A new topic ("and it also plans retirement") is not a turn. A turn changes what the next beats mean.

The ladder's break: rungs share one structure (the same title pattern, the same motion verb) and escalate one variable (scope of help, number, stakes); the break changes the structure or the verb, not just the content. At least 2 rungs before it, at most 5 in all before the close.

Before-after's trap: a before and an after with no cause between them is a wipe, not a story ("before/after" is an LLM-overused device for that reason). The cause is on screen at the turn.

## 3. Product-first routes: no conceits

For launch, promo and product films (`--format launch`, or `--product-first`; `references/product-first.md`): the villain is the viewer's real pain at the claim's scope, the hero is the real product UI (on screen within 3 s), and the turn is the real product reversing that pain. `pick` never offers conceit devices (the Metaphor family, borrowed containers other than the product's own query log, chat thread and interface, and a handful of others: cosmos zoom, object's POV, unexpected protagonist, letter from the future, mockumentary, product as a character, problem as a villain, mirror, one-shape, sound-first, data letter, story loop). `check` runs **G7** (no conceit; no museum, allegory or invented-world words unless a `visual_pun` that resolves to the product within 1 s; the product on screen within 3 s; a `hero_moment`; 2 to 4 `uses`; `last_line` with `end_line_largest: true`; on-screen lines of 6 words or fewer) and **G10**, which follows the pitch's `shape`. The devices left (the oner, split-sync, the static camera, countdown, rewind, real time, the misdirect, escalation, the list that breaks, call and response, fake UI takeover, query log and the like) are structures for pacing and energy on the real product UI, never a world to put it in. `--allow-conceit` only for a brand film or when the user asks for a concept.

## 4. Story shapes

Real launch films are not plots. Google's "Ask Search Anything" (87 s) is a **refrain ladder**: one verb is the spine, each rung a title card with one highlighted word over a real UI demo of a DIFFERENT everyday use, escalating from simple to done-for-you, then "Ask **anything**" and the logo. A test film that followed one dinner bill for 30 s was rejected: "that's not how launch videos are made".

`shape` is `ladder | pas | scenario | before-after`, or one of the shapes the format picker ranks (`library/formats.json`: `intercut`, `montage`, `hero-strip`, `claim-ladder`, `manifesto`, `life-arc`, `day-in-life`, `what-if`, `countdown`, `testimony`, `roundup`, `strategic`, `data-journey`, `steps`, `abt`, `titles`, `process`, `acts`, `trailer`); each has its roles and timing in `STORY_SHAPES` (`story.mjs`), and G10 checks its roles, counts, a picture per beat and a real UI cause and effect per use beat. `pick` takes shapes from `SHAPES_BY_TYPE` (video type x claim scope): a universal or category launch gets Sure a ladder, Bold a pas, Wild a before-after; a single-task claim gets the scenario. `--shape` forces one, `--scope` overrides the sheet.

- **`ladder`** (engine `refrain-break`). `refrain: {verb, pattern}`; beats with `role`: `open` (the refrain and the product within 3 s), `rung` (each: `use` 2 to 6 words, distinct, no shared content noun; `highlight` in the title; `level` strictly rising from simple to done-for-you; `on_screen` containing the verb (the break rung is exempt: it may change the verb), 6 words or fewer; `picture`; `ui[]`; `benefit`; `duration_s`, no rung over 35% of the film), optional `ways_in`, `close`. The break rung is the intent's peak; mark it `"break": true`. `fake-ui-takeover` as a device never trips the invented-screen ban on its own name. Rungs: 35 s or less 3 to 4; 36 to 60 s 4 to 6; over 60 s 6 to 8. The creativity lives in the joins between rungs (the title word becomes the input, the last input becomes the logo), never in a plot.
- **`pas`** (engine `reversal`), told from the viewer's day: `hook` (the pain as a picture, second person), `agitate` (optional; a reaction, "Ugh."), `meet` (the reveal and the turn, never before 20%), `benefit` x2 to 4 (each `benefit` in viewer language, 12 words at most, and one UI behaviour in `ui[]`, escalating toward the peak), `proof` (`proof: {line, claim}`, a claim id with a number), `cta` (`cta: {line, action, where}`). Kinso's launch is one.
- **`scenario`** (engine `reversal`, single-task claims only): the `feature` block (`name, url, viewer, task, before, after`) and roles hook, proof, turn, cta, a `picture` and `ui[]` per beat, `two_way`. A single persona only when `audience: role | persona`, `series: yes`, or the arc is archetypal through 3+ uses.
- **`before-after`** (engine `before-after`): the before at the claim's scope, the cause on screen at the turn, the after proven with real uses, the payoff in the before's frame. Pairs (role `pair`, a `domain` each): 3 to 6 above 22 s, 2 to 4 up to 22 s, 2 to 3 up to 12 s (1.5 to 3 s each; G10 `pair`).

### Scope (G13) and viewer first (G12)

**G13** (launch, promo and product films) measures the story's scope against the claim's: every rung or benefit names its `domain`, `reach` and `clause`. **D** = distinct areas of life; **S_max** = the largest runtime share of one situation (beats grouped by shared content nouns, the hook and cta included; the product's own surfaces never count); **P** = beats that call one scenario back; the **retell** (`critique.retell`).

| claim scope | uses (30 s / 45 s / 60 s) | D (<=22 s / <=40 s / longer) | S_max | P | opening and close |
|---|---|---|---|---|---|
| universal | 4 / 5 / 6 | 3 / 4 / 5, no area over half the uses | 35% at most (warns over 25%) | 0 | the category's pain or a montage of 3+ asks; the close generalises, never resolves a scenario |
| category | 3 | 2 / 3 / 4 | 35% at most | 1 at most | any |
| single-task | n/a | n/a | n/a | n/a | the viewer's before, one action |

**Range vs honesty.** One script of a set may show fewer uses or areas of life than the table asks when it declares `scope_waiver: { reason }` (6+ words, for example "one table keeps the sync claim honest") AND a plan is active. Its G13 uses and D minima then become warnings, and the portfolio holds the set instead: the union of distinct areas of life across the three scripts meets the claim scope's D for the length (`range-short`), and at most one script declares a waiver (`waiver-count`). Without a plan a waiver is ignored and the errors stand.

**Continuity implies a claim (G4, `continuity-claim`).** When the pitch's device is `oner`, or its `actor` runs unbroken across beats whose `domain` differs, the pitch sets `continuity: { across: "places" | "time" | "one", claim: "<claim id>" }`. Across "places" needs the claim that makes the places one thing; without it, cut the carrier between places.

**No system-UI imitation (G7, `system-ui-pose`).** A visual that poses as the viewer's own OS (a system dialog, an app-store sheet, a notification shade) full frame, with no phone in a hand or on a surface, is an error. Open on the phone in a hand, then push in.

Universal claims also: a ladder, pas or before-after (never a scenario), no use of reach "few", every promise clause shown (with a plan, each script shows the clauses its slot owns and the set shows all of them: `clause-dropped`), a retell that names the range. Two scripts in a set that each spend over 25% on one situation fail the portfolio (`collapse`).

**G12** (launch and promo films, every shape): the first 25% addresses the viewer (`you`, `your`, or a first-person viewer line), a pas `meet` starts at 20% or later, every `benefit` or `rung` carries a `benefit`, a `proof` when the ledger has a number, a `cta` with an action and a place, and a line at least every 3.0 s. Warnings: `slogan-copy`, `toy-demos`, `same-situation`.

### Branded launch films (`references/launch-film.md`, `references/brand-film.md`)

A named brand's launch, promo or brand film follows `launch-film.md` §1 for its length: the product or brand in 1 to 3 s, the reveal, 2 to 4 real feature demos, one payoff line, the end card with one CTA. Pitch fields: `role` per beat (`hook`, `statement`, `hero`, `demo`, `payoff`, `cta`), `payoff_line`, plus G7's. The three scripts differ only in emphasis and order, never in concept.

**Character-led films.** For mascot, brand-character, animated-story and emotion-led films: fill the intent's `character` block and show the change as an acting arc. A product film keeps its factual claims; the character never invents a capability.

## 5. The device menu

```bash
node $SKILL_DIR/scripts/story.mjs pick --truth "$RUN/story/truth.md" --recent "$(recent device ids, comma-separated)"
```

`pick` returns a ranked **menu**, not a draw: recent devices are filtered out (rotation is a filter, never a picker), what is left is ranked by fit to the product's tags, format and tone, and each card carries its beats, pitfalls, an example and `fuse_pool` (the product's own material). When a plan exists the planner has already chosen each slot's device from its menu and the writer keeps it; with no plan each writer **chooses** one device or none, with a reason (`pitch.device_reason`): a device earns its place only when it makes the proposition land harder. `check` holds the three chosen devices to the distance rules (different family and visual world, and on most of the 7 axes; product films need not differ on protagonist).

- **Sure** = the clearest argument; **Bold** = the most original still on the brief; **Wild** = the reach. On a product-first film the reach is in craft (camera, joins, rhythm), never a narrower or more personal story.
- Browse when you need to: `story.mjs devices [--family metaphor] [--fits devtool] [--q "receipt"]`, `story.mjs devices --id A5`, `story.mjs cliche`.

## 6. Write the argument, then the pitch

The argument first (`references/intent.md`): proposition, PAGE, villain and felt numbers, the ending first, then per beat what it buys, its relation word, importance and the one read, an optional peak (when you use one: 60 to 75% is guidance, with a rest before it). Then fuse the device (if any) with the product's own material and write the pitch:

- **Title**: 2 to 5 words a person would use to refer to the story.
- **Logline**: 12 words at most; the party retell ("It's the one where…") without those words.
- **Beats**: the intent's beats, same order and names, written as the script (`references/script.md`): `on_screen` (6 words or fewer), `vo` ("" for music-only beats), `visual`, `duration_s`; `"value": true` on beat 1 or 2; `"turn": true` on the turn beat.
- **Three sketch frames**: the opening, the turn, the close (`check` returns them as `sketch_frames`).
- **Signature image** and **last line** (it could stand alone as a post).
- **The hostile second reading**: what else could this say about us? Apple's iPad "Crush" read as "tech destroys artists".

### Pitch JSON

`$RUN/story/pitch-<label>.json` (a set is `{ "pitches": [ … ] }`):

```jsonc
{
  "id": "unmerged",
  "label": "Bold",                                  // Sure | Bold | Wild
  "title": "The unread line",                       // 2 to 5 words; not a fragment of an on-screen line, no function word last, not ALL CAPS
  "aim": { "takeaway": "Lintel reads every line, so outages never start at the unread one.", "feel": "Relieved", "action": "Install Lintel on one repo", "audience": "Engineers who approve pull requests" },
  "approach": "Starts at the 2 am outage, then rewinds to the one line nobody read.",   // one plain sentence, <= 25 words
  "engine": "reversal",                             // reversal | refrain-break | before-after (the slot's, from pick)
  "turn": { "line": "Lintel suggested a change", "reverses": "the line nobody read is now the line that got read", "payoff": "the 2 am pager stays dark" },
  "device": "rewind", "device_reason": "starting on the outage makes the unread line the villain before anyone explains it",   // the plan slot's device
  "turn_kind": "object-flips", "peak_kind": "scale-reveal",   // the plan slot's; story.mjs TURN_KINDS and PEAK_KINDS
  "coverage": [ { "claim": "c8", "beat": 5 }, { "feature": "scan and join with no install", "beat": 2 }, { "claim": "c6", "cut": "host controls need a second screen" } ],   // beat is 1-based; a cut needs 4+ words of reason
  "tempo": { "ideas": 6, "change_every_s": 2.2, "longest_hold_s": 4, "source": "house" },   // launch, promo and feature films (G9)
  "logline": "A 2 am outage rewinds to the one line nobody read.",
  "twist": "",                                      // required when the device is overused: what makes it not the default
  "beats": [
    { "name": "The pager", "on_screen": "02:14 · checkout-api down", "vo": "", "visual": "…", "duration_s": 4, "value": true },
    { "name": "Lintel reads it", "on_screen": "Lintel suggested a change", "visual": "…", "duration_s": 6, "turn": true },
    { "name": "…", "on_screen": "…", "visual": "…", "duration_s": 7 }
  ],
  "first_4s": "What seconds 0-4 show, in one line", "clear_by_s4": true,
  "swap_test": { "competitor": "CodeRabbit", "result": "breaks", "why": "the image or line that breaks" },
  "grounded_claims": [ { "claim": "…", "source": "truth sheet, Proof" } ],
  "props": ["line 212"],                            // numbers that are story details, not claims
  "ui_labels": ["LGTM", "Apply suggestion"],        // must be in the truth sheet's Native words
  "honest_demo": true, "form_proves_claim": false,
  "signature_image": "…", "last_line": "…", "visual_motifs": ["…"],
  "build": { "hardest_shot": "…", "how": "…", "needs_live_action": false },
  "critique": { "retell": "…", "first_4s": "…", "turn": "…", "own_material": "…", "swap": "…", "second_reading": "…", "default_beats": "…", "hardest_shot": "…" },
  "scores": { "originality": 4, "clarity": 4, "fit": 5, "memorability": 4, "feasibility": 5 }
}
```

`tempo.ideas` is the number of distinct beliefs in the intent (its beats with a distinct `buys`); `check` finds the intent (`--intent`, else `intent-<label>.json`, else `intent.json` beside the pitch) and an off count is an error (`tempo-ideas`). Each beat may carry `slot` (`open|hook|turn|rung|proof|rest|peak|payoff|end|close`), the length's beat sheet (below).

Shape fields (ladder `refrain` and rung fields, pas `proof` and `cta`, scenario `feature` and `two_way`, `hero_moment`, `uses`, `last_line`, `end_line_largest`, `actor` and each beat's `shows`) are in `references/script.md`; `check` names any that are missing.

**The moves file lives beside the pitch.** The Moves pass writes `story/moves-<label>.json`, `story/moves-verdict.json` and a rough per hero. It never edits the script, so write `visual` lines with objects, glyphs and UI surfaces a motion designer can mine, and name the one element that carries into the next beat.

## 7. Check, then rewrite

```bash
node $SKILL_DIR/scripts/story.mjs intent --intent "$RUN/story/intent-<label>.json" --length <seconds>
node $SKILL_DIR/scripts/story.mjs check --pitch "$RUN/story/pitch-<label>.json" --truth "$RUN/story/truth.md" --length <seconds> [--narrated]
```

Exit 0 = ship; 2 = rewrite (reasons in the JSON); 1 = malformed; 3 = escalate. The gates:

| Gate | What fails |
|---|---|
| **G1 Distance from the cliché arc** | 4+ default beats in default order, 3 feature beats in a row, a stock opener, 2+ visual clichés, a logo in the first beat |
| **G2 Swap test** | no beat uses the product's own objects, formats or words |
| **G3 Clear by second 4** | no beat starts before 4 s, or a logo or title card fills seconds 0-4 |
| **G4 Honest demo** | a number not in `grounded_claims`, the truth sheet or `props`; a UI label not in Native words; `number-unit` ("50 phones" on screen where claim c9 says "50 people"; props and product native words are exempt); `continuity-claim` (a oner, or an actor carried across different areas of life, without `continuity { across, claim }`) |
| **G5 Buildable** | live action without footage; a device rated 2/5 or lower |
| **G6 Script** (with `--length`) | the length off by over 10%, a hook over 4 s, the value after beat 2, a line held under its reading time, VO over 2.7 words/s, stock copy, equal beat lengths (not checked at 12 s or less while the peak is the longest beat), no end beat; `peak-not-longest` (the peak beat is shorter than another), `end-short` (the last beat under 1.8 s at 12 s or less, 2.0 s to 22 s, 2.5 s above), `beat-count` (4 or 5 beats at 12 s or less) |
| **G7, G10, G12, G13** | product-first (`system-ui-pose`), shape, viewer first, scope (above; `scope_waiver` with a plan). In G13 only actor words that are also the truth sheet's Native objects or Native words are exempt; any other noun in `actor` counts as a scenario noun |
| **G14 Plan** (with `--plan`, or `plan.json` beside the pitch) | the pitch's slot missing; `device`, `shape` or `engine` different from the slot's; `turn_kind` or `peak_kind` missing or different; an owned claim with no `beat` row in `coverage` |
| **Coverage** (product-first films) | `coverage-missing` (a Must-show feature or a Surprising-facts claim id with no row), `coverage-beat` (a beat out of range), `coverage-cut` (a cut with under 4 words of reason) |
| **G8 The aim** | `aim` (takeaway <= 16 words, feel, action), `approach`, a title that names the idea |
| **G9 Tempo** | too few ideas for the length, too long between changes, `tempo-ideas` (the count differs from the intent's distinct beliefs) |

**The set** (`story.mjs check` on `{pitches:[...]}`, the portfolio). Besides the distance rules and `collapse`: `shared-line` (an on-screen line, lowercased and unpunctuated, 2 words or more, in two pitches), `shared-peak-kind` and `shared-turn-kind` (two pitches declare the same kind), `same-order` (two pitches show 3 or more coverage items in the same order; `cliche-order` when all three do), `coverage-dropped` (all three pitches cut a claim and the plan did not cut it with a reason). The plan prevents these; the set check proves it.

**The beat sheet by length** (`story.mjs sheet --length <s> [--engine <e>]`): each length bucket (10, 15, 30, 45, 60 s) has slots with their windows. The 10 s reversal or before-after film is hook and product 0 to 2 s, turn 2 to 3.5, proof 3.5 to 5.8 (a rest), peak 5.8 to 8.2 (the longest beat, at least 2.2 s, starting at 58 to 75%), payoff and end 8.2 to 10 (the end line is the payoff line, held at least 1.8 s), in 4 to 5 beats. The 10 s refrain-break film is open 0 to 2, rung 2 to 3.5, rung 3.5 to 5.8 (a rest), break and peak 5.8 to 8.2, close 8.2 to 10. Longer lengths: `references/script.md`, "Structures by length".

**The rewrite ledger.** `check` on a single pitch records its run in `story/check-ledger.json` beside it (`{label: {runs, last}}`). The limit is 3 runs (the first and two rewrites), plus 2 when `story/edit-notes.json` marks that label `rewrite` or `replace`. Past it, `check` runs no gates and prints `{ok:false, verdict:"escalate", reason:"rewrite limit: hand back to the Director"}`, exit 3: the writer stops and reports, never works around it. `--no-ledger` skips the record (the Director's set check and the editor's reads); a set check never records.

Then the weighted score (originality 25%, clarity 20%, fit 20%, memorability 20%, feasibility 15%; ship at 3.8 or more with no dimension below 3), with the adjustments `check` lists. To rewrite, push in this order: a more specific artifact from the truth sheet → a sharper turn → a stricter constraint. Two rewrites at most (the ledger enforces it), then the Director decides: a plan slot's device changes only through the planner.

## Different from your recent films

The device menu already drops recent devices; the Motion Director's score then names the film's six aspects (`agents/motion-director.md`) and must differ from each of the last 3 films in at least 4. A series, or an explicit ask, is the one case for a `shape_waiver`.

## Principles

1. **One argument, one sentence.** The proposition has no "and". Every beat carries, proves or pays it off; a beat that does none is cut.
2. **Ending first (a method for argument films).** Where the film sets up a question, write the last frame and line before the middle (Pixar's rule 7); the payoff answers the opening and never introduces a new idea. A demonstration or a manifesto may have no such setup.
3. **A turn, if you declare one, reverses something (optional).** Before and after the turn, the viewer believes different things. A list with a label on its third item is not a turn. A clear demonstration with no turn is a valid film.
4. **Emphasis is spent, not spread.** Most beats are calm. Importance 3 on a quarter at most; a peak, when the film has one, gets a breath before it (60 to 75% is where the legacy sheets put it, not a rule for every format). When everything is big, nothing is.
5. **One read per beat.** One thing to read or see, held long enough to read. Two things at once and the viewer gets neither.
6. **Cause and effect, not "and also".** Each beat relates to the one before: because, but, so, example, escalation, answer.
7. **Build from the product's own material**: its UI, data, output, name and sounds. Google told a love story with nothing but its search box.
8. **The swap test.** Put a competitor's name in: if the film still works, it fails. Count the breaks on the product's own surfaces, not one demo's labels. The scope swap: put a single-purpose app in; if the film still works, it sells that app.
9. **Specific inside each beat, common in situation.** The exact prompt and the real label inside a beat; on a universal claim, no persona and no situation that recurs across beats.
10. **When you use a villain, it is an object (a villain is optional).** One concrete thing doing one wrong thing (an unread badge climbing, a 14-reply thread), with numbers the viewer feels. Never a competitor, never an abstraction.
11. **Grounding.** Never invent claims, numbers or UI labels. A demo that lies is worse than none.
12. **Check the second reading.** Drop an image whose other meaning hurts the brand.

## Avoid

**LLM-overused devices** (say why it serves the proposition; a twist is one optional way to earn it): a day in the life at 100x, before/after with no visible cause (and chaos → calm), the cosmos-to-cursor zoom, the product as a friendly-blob mascot, the fake iMessage thread, the "In a world…" trailer, and, for AI products, a prompt typing itself into a glowing input box.

**Visual clichés** (-1 fit each; two fail G1): glowing orbs or brains, particle networks, blue-purple gradients, the sparkles icon, holographic UI panels, isometric floating cards, "the future is here" copy, stock handshakes and smiling teams, three feature cards sliding in, a dashboard floating in a void at a 30° tilt, confetti CTAs, the glowing globe, lens flares and bokeh.

**Stock openers** (weak when they are the only thing the opening says; "Meet X", early product identity, simple cuts and abstraction are fine when they serve the assignment): "Meet X", "Introducing X", "What if…?", "Tired of…?", "Imagine…", "The future of ___ is here", "Say goodbye to…", "Did you know…".

## Taking feedback

Feedback arrives as a console `note`. Answer it with `console.mjs reply`, change the intent and the pitch together, re-run both checks, and re-push.

- **"More like B"**: keep B's argument and engine; write variants that move the material, the device or the pace.
- **"Mix A and C"**: take one pitch's argument (proposition, engine, turn) and the other's tone, device or material. The argument wins when they conflict; say which you kept.
- **"Too jokey" / "too serious" / "too weird"**: re-pick with `--tone <new tone>` and `--exclude` the rejected devices, keeping the argument if they liked it.
- **"Make it simpler / shorter"**: cut beats whose buys the proposition can lose; keep the turn, the peak and the payoff.
- **"None of these"**: ask what they're picturing (one console question), then `pick` again with `--exclude` all three.
- **Record** what they chose: `memory.mjs record --step concept --value "<title> (<device id or none>)"`, so the next `pick --recent` filters it out.
