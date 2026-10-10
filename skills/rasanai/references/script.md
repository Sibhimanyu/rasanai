# Script: how to write a video script that holds up

This is the writer's brief. RasanAI's Story call runs it as its own pass, separate from the look: a script is judged as words, beats and timing before any style touches it. Hand this whole file, the truth sheet and the three devices from `story.mjs pick` to a writer subagent (or follow it yourself), and get back three scripts that pass `story.mjs check --length <s> [--narrated]`.

A good script is not a description of a video. It is the film in words: every second accounted for, every line something the viewer hears or reads, every visual something you could point a camera at.

## What you're given, what you return

- **In:** the truth sheet (`$RUN/story/truth.md`: what really changes, for whom, the enemy, the product's own objects, formats and words, proof, the cliché version), the brief (length, format, where it plays, voiceover or not), and three devices (Sure, Bold, Wild) with their beats, pitfalls and `fuse_with` material.
- **Out:** `$RUN/story/pitches.json`: three pitches in the format of `references/story.md` (Pitch JSON), where every beat also carries the script:

```jsonc
{ "name": "The receipt", "duration_s": 3.5,
  "on_screen": "Receipt ink fades in a year.",   // what the viewer reads, 6 words at most (or "")
  "vo": "",                                       // what the viewer hears; "" for music-only beats or unnarrated films
  "visual": "Macro: thermal print bleaching to white, line by line, the total last.",
  "sound": "paper rustle, then silence",          // optional: music or a causal sound this beat needs
  "value": false, "turn": false }                 // value: the beat where the viewer learns what they get (beat 1 or 2)
```

The script is written once and travels: the Story card shows it, `scenes.json` is built from it, and the voice records its `vo` lines.

## Launch, promo and product films are product-first

For the route `product-launch-video` and any launch, promo, product or app film, read `references/product-first.md` before the passes below, and let it win wherever it conflicts: the real product UI is on screen within 3 s; a launch is a **ladder** (pass 0, Two shapes: one refrain verb, rungs of distinct real uses escalating to done-for-you) and a single-feature spot is one viewer doing one real task (pass 0, One feature, one scenario); one hero product moment shows it for real; 2 to 4 real steps of that task (a scenario) or the rungs (a ladder); short plain kinetic lines; the required end line is the largest type in the film on a clean CTA card; no museums, allegories, invented worlds, extended metaphors or cover versions (the only allowed figures: an instant visual pun that resolves to the product within a second, and a letter or shape transformation that lands on the real product within its move, `references/product-first.md`). Sure, Bold and Wild differ in structure, pacing and energy, never in leaving the product. Write the pitch's `shape`, then for a scenario its `feature`, each beat's `role`, `picture` and `ui`, `two_way`, `hero_moment`, `uses`, `last_line` and `end_line_largest`, or for a ladder its `refrain` and each rung's `use`, `highlight`, `level`, `on_screen`, `picture`, `ui`; `story.mjs check` runs gates G7 and G10 on them. The worked example below that uses a museum is a *brand-film* conceit: do not copy it for a product film; the product-first example follows it.

**Branded launch, promo or brand film:** write to the structure template in `references/launch-film.md` section 1 (hook with the product or brand in 1 to 3 s, reveal, hero demo, 2 to 4 real feature demos, payoff line, end card) and keep each beat inside its timing range for the film's length; mark each beat's `role` and set `payoff_line`. One idea per beat, plain words, the product or brand in every beat. The brand's own film (`brand-film/FILM-STYLE.md`) gives the opening and the words it uses. The three scripts differ only in emphasis and order, never in concept. On a ladder the order is the rungs' order and the emphasis is which uses and how the refrain is worded.

## Pass 0: decide what this film must achieve

Before any device, hook or line, decide the aim. A script with no aim is a pile of nice beats, and the user can't tell three of them apart. Answer four things, in plain words, from the truth sheet and the brief:

- **Who is watching, and where.** The person and the place: a founder scrolling a feed, a customer on the product page, a room at a demo day. It sets the pace and what they already know.
- **The one thing they must remember.** The takeaway, as the viewer would say it to a friend after: "It builds a whole site from one prompt." Sixteen words at most. If you need "and", pick one.
- **What they should feel.** One feeling, not a list: relieved, curious, impatient to try it, quietly impressed.
- **What they should do next.** One action: try it, share it, book a demo, read the post.

Sure, Bold and Wild may aim differently, and the user is choosing between those aims, not between devices. For example Sure: understand it instantly. Bold: want it now. Wild: talk about it. The aim follows from the truth sheet and the brief, never from the device; if the device can't carry the aim, change the device.

Decide the **tempo** with the aim (`references/launch-film.md`, Tempo): the brand film's measured tempo when the run has one, otherwise the house tempo. Count the ideas (a promise, the hero, each use or proof, the payoff: at least 3 in 15 s, 5 in 30 s with 6 or 7 as the aim, 8 in 60 s, 10 in 90 s), plan something that changes every ~2 s, and list the changes inside any beat over 3 s. Write it as `tempo: { ideas, change_every_s, longest_hold_s, source }`.


### Two shapes: the ladder (a launch) and the scenario (a single-feature spot)

Pick the shape first, in the pitch's `shape`. A launch of a product or brand is a **ladder** unless the brief or the research names ONE feature to sell; a single-feature spot (a 29 s "Sites" film) is a **scenario**. Never tell a general launch as one plot: a film that followed one dinner bill for 30 s was rejected ("that's not how launch videos are made"). Real launch films are refrain ladders: Google's "Ask Search Anything" is "Ask **simple** questions", "Ask **longer**", "Ask it to **guide** you", "Ask it to do the **research**", "Ask it to **shop** for you", "Ask and get it **tailored**", "Ask it to… **done**", then "Ask **anything**" and the logo, each title over a real UI demo of a different use.

**The ladder.** Write `refrain: {verb, pattern}` and beats with a `role`: `open` (the refrain arrives, the product on screen within 3 s), several `rung`s, an optional `ways_in` (the inputs: type, say, snap, film), and a `close` (`<verb> anything` or the product's own line, then the logo). Each rung carries:

- `use`: a distinct everyday use, 2 to 6 words, real ("plan a week of dinners"). No two rungs share a content noun.
- `highlight`: the one word the title card emphasises, and it is in the title.
- `level`: 1 to N, strictly rising, from simple (one thing, one step) to done-for-you (it does the whole job). Escalate the *help*, not the plot.
- `on_screen`: the title line, containing the refrain verb, 6 words or fewer.
- `picture` and `ui[]`: the real UI's cause and effect for that use.
- `duration_s`: no rung over 35% of the film.

Rung counts: 35 s or less, 3 to 4; 36 to 60 s, 4 to 6; over 60 s, 6 to 8. The creativity lives in the joins between rungs (the title word becomes the input, the input becomes the next demo, the last input becomes the logo), never in a plot. G10 holds all of this; the three scripts may differ in which uses, their order, the pace and the refrain's wording, never in being a single story.

Worked ladder (a 30 s launch of Folio, a notes app; the refrain is "Write"):

| s | Role | On screen (highlight) | Use | Level | The real UI |
|---|---|---|---|---|---|
| 0-3 | open | Write **anything**. | | | The empty Folio page, cursor blinking; the title becomes the first line of a note. |
| 3-9 | rung | Write **simple** lists | pack for the trip | 1 | Type "pack for Lisbon": a checklist forms as the list; ticks as items are typed. |
| 9-15 | rung | Write **longer** | meeting notes | 2 | A long, messy meeting jotting; a summary header and action items appear above it. |
| 15-21 | rung | Write it to **plan** | plan the week | 3 | "plan my week around the 9:30 standup": blocks land in the week view. |
| 21-27 | rung | Write it, and it's **done** | send the recap | 4 | "send the recap to the team": the draft email fills, Send, a sent toast. |
| 27-30 | close | Write **anything**. Folio | | | The title line settles into the logo and the URL. |

Every title is 5 words or fewer, contains the verb, and sits on one line inside the safe area; four rungs climb from a checklist to a sent email; the uses (a trip, a meeting, a week, a recap) share no noun. Say it with the sound off and the film still reads.

### One feature, one scenario (single-feature spots)

A single-feature spot is about ONE feature, shown as one person doing one real task with it. Before any device, write the `feature` block:

```jsonc
"feature": { "name": "Cues",                       // ONE feature: the user's named one, else the newest launch (a "New" badge), else the core surface; a version or "what's new" is not a feature: open it and take its headline feature
  "url": "https://greenroom.example/cues",          // the feature's own page (its words and screens are the film's material; the homepage is only the brand)
  "viewer": "a teacher running a live class",       // one person
  "task": "send the class a reading link mid-lesson",  // one real task, start to finish
  "before": "she stops teaching to hunt for the link", // the viewer's before, in their words
  "after": "the link opens in the class's window as she says it" }
```

Then the film is four beats with a `role` each: **hook** = the viewer's `before`; **proof** = the task done in the real UI, start to finish (the longest beat); **turn** = the `after` lands and the brand is revealed with it (once); **cta** = one action named for the feature ("Try Cues on your Mac"). A beat can be split into shots; the order holds. Every beat carries:

- `picture`: one sentence for what the viewer sees happen, proving the line ("the browser fills with search tabs, each new tab squeezing the others").
- `ui: []` (the proof at least two): the literal cause and effect on screen, the way the real product does it ("click Open → a new tab opens in the reading window, the address changes, a toast says Opened"). No invented output screens: a result is the product's real UI from the research (`research/screens`), never generic boxes standing in for it.
- `on_screen`: one line, 6 words at most, no trailing period, no orphan "Meet".

Then do the **two-way test** and write it down as `two_way: { lines_alone, pictures_alone }`: read the four lines with the pictures hidden (a stranger must get the pitch), then the four pictures with the lines hidden; each tells the same story. `story.mjs check` gate **G10** holds all of this (one feature, the four roles in order, pictures, UI cause and effect, no invented output, the two-way read); `uses` in a one-feature film are the 2 to 4 real steps of its one task. Sure, Bold and Wild may differ in structure and energy, never in the feature or the scenario. (On a ladder, `story.mjs check` G10 reads the rungs instead: the refrain verb, the rung count, distinct uses, rising levels.)

Write it down as the pitch's `aim` (`takeaway`, `feel`, `action`, `audience`) and its `approach` (one plain sentence on how this story gets there). Then name the story: a title is 2 to 5 words a person would use to refer to it ("The one-prompt site", "Rewind to the prompt"), never a fragment of an on-screen line, never ending on a function word, never ALL CAPS. Every later pass serves the aim; a beat that doesn't, goes.

## The eight passes

Write in passes, not in one go. Each pass has one question.

1. **The one sentence.** What does the viewer believe after the film that they didn't before (pass 0's takeaway, sharpened)? One sentence, in the viewer's words, no product name. If it needs "and", you have two films; pick one.
2. **The spine.** Map the device's grammar onto the length (structures below). Mark the hook, the value beat, the proof, the turn and the end. Durations first, words second.
3. **The hook.** Write five hooks, keep one (hook types below). It lands in 1.5 to 2 seconds and is either the outcome, the tension the viewer already feels, or the product doing its thing.
4. **The visuals.** For every beat write the shot: what fills the frame, what moves, what changes. Concrete nouns from the truth sheet (the product's real objects, screens and words), never "dynamic visuals of…". On-screen lines are readable titles, not decoration: write short plain lines, one line, inside the safe area, at the brand's type size, never cropped (the readability rule, below). A move may lend a letter or shape to the next beat, but the line reads normally first: name in `visual` which element carries into the next beat.
5. **The words.** On-screen lines first (the film must read with the sound off), then voiceover that adds what the screen can't show. Read every line aloud.
6. **The turn.** At 60 to 75% of the running time something reverses: the old way breaks, the scale flips, the joke pays off, the reveal lands. If nothing turns, it is a list.
7. **The end.** The name, one call to action, an end card of 2 to 3 seconds whose elements land in sequence (at most 1.5 s of it still), and a last line that could stand alone as a post.
8. **The cut.** Delete 20% of the words. Then check the timing against the rules below and run `story.mjs check`.

## Structures by length

Durations are guides; the device's own grammar wins where it is stronger. Shot changes inside a beat are fine; a beat is one idea.

**15 s (social teaser, reel cutdown):** hook 0-1.5 · value 1.5-5 · one proof 5-11 · end 11-15. Three to four beats, no voiceover or one line.

**30 s (launch, feature):** hook 0-2 · value 2-6 · proof 6-14 · proof or escalation 14-20 · turn 20-24 · end 24-30. Five or six beats, 50 voiceover words at most.

**45 s (launch film):** hook 0-2 · value 2-7 · proof 7-16 · escalation 16-25 · turn 27-33 · payoff 33-40 · end 40-45. Six to eight beats, about 85 voiceover words.

**60 s (launch, explainer):** cold open 0-3 · value 3-9 · three proofs 9-36, each carrying a change you can see · turn 38-46 · payoff 46-54 · end 54-60. Seven to nine beats, 110 to 140 voiceover words.

**90 s (explainer):** the 60 s shape with a setup act (what's at stake, 8-12 s) before the first proof and a second turn or a demonstration in place of the third proof. Anything longer needs a character or a world.

**Brand film (20-40 s):** no feature proof at all. Image, image, image, the turn as a change in the viewer's point of view, then the name. Voiceover, if any, reads like a short poem with a plain last line.

**PR / changelog (30-60 s):** before (the problem in the code or the user's day) · the change (one diff or one screen) · after (what's different, shown, with the real number) · end. Each frame carries 19 voiceover words at most.

**Footage reel:** the footage decides. Hook from the strongest 2 seconds of real footage, then the shape the footage supports (journey, before and after, a list of moments with a payoff). Cards carry the words; never write lines the footage contradicts.

## Hooks that work

Pick the hook from the truth sheet, not from this list. Each type with the shape it takes:

- **The outcome, stated flat:** "Your books, balanced. Every month." (No setup, just the result.)
- **The tension they already feel:** "April 14. 11:58 pm." (A moment the viewer has lived.)
- **The true, surprising fact:** "Receipt ink fades in about a year." (Only if it's on the truth sheet.)
- **The product doing its thing:** a phone snaps a receipt and the ledger fills in before the first second ends. No words.
- **The borrowed format:** "Exhibit 14: the shoebox, c. 2024." (The device announces itself.)
- **The direct address with a stake:** "You lose four hours a month to receipts." (A real number, with its source.)
- **The reversal:** start on the end state, then rewind.

Never open with: "Introducing…", "Meet…", "What if…?", "Tired of…?", "In today's world…", a logo, a company description, a question the viewer can answer "no" to, or a statistic without a stake.

## Lines: on screen and in the ear

**On-screen text**

- 6 words at most per line, 1 to 4 is better. One line on screen at a time.
- Each line stays still long enough to read: 0.6 s plus 0.4 s per word (four words: 2.2 s).
- The film must read with the sound off: the on-screen lines alone tell the story.
- It complements the voiceover, never repeats it. The voice says the sentence; the screen shows the word, the number or the image that sticks.
- Sentence case, a full stop for weight, no exclamation marks, no em dashes.
- **Readability is a hard rule.** At its resting state the line sits fully inside the safe area (6% of the width and height), on one line (two at most), at the brand film card's type scale (`FILM-STYLE.md`) or, without a card, the design system's display size. Never "as big as possible", never a line that touches or crosses the frame edge. It may leave the frame only in a push-through of 0.4 s or less. `text-fit` fails otherwise. A launch title is 6 words or fewer and holds one highlighted word.

**Voiceover**

- 2.3 to 2.7 words per second (2.0 to 2.3 for a calm, premium register). Total words at most 2.5 × seconds, and leave music-only moments: the cold open, the reveal and the last 2 to 3 seconds.
- Sentences of 6 to 10 words, 14 at most. One idea each. Say every line aloud and time it; if you run out of breath, cut.
- Spoken, not written: contractions, plain verbs, the product's own words. "It reads the receipt the moment you get it", not "Leveraging advanced OCR, it automatically processes receipts".
- Every noun the voice names is on screen within a few frames of the word.
- No hype vocabulary: seamless, unlock, effortless, revolutionize, supercharge, empower, streamline, cutting-edge, game-changer, the future of, like never before. No "not X, it's Y". No rhetorical questions in a row.
- Voiceover is optional and often worse than none. If the film works with on-screen lines and music, write it that way and say so.

**Visual lines**

- Write the shot, not the adjective: "Macro on the receipt's total as the ink bleaches to white", not "a powerful image of fading receipts".
- Use the product's real material: its screens, objects, numbers and words from the truth sheet. Never invent UI labels, claims or figures.
- Say what moves and what changes. A beat where nothing changes for more than a second is dead air.
- One spectacle beat per film. Restraint everywhere else makes it land.

## The turn and the end

- The turn is a reversal the viewer feels: the pile becomes a ledger, the countdown stops, the museum label names the old way as history. Mark it `"turn": true`; it lands at 60 to 75% of the running time.
- A drop in motion before the turn (one slow mover for 0.3 to 0.8 s, never a frozen frame) makes it hit.
- The end beat: the name and one call to action (a URL, "available today"), held still 2 to 3 seconds, with the music's ending under it. The last line is plain and quotable. Never "Thanks for watching", never a wall of social icons.

## A worked example (45 s, launch, Tally)

**Default version (rejected):** "Tired of messy receipts? Introducing Tally. Scan receipts instantly. Track expenses effortlessly. Get tax-ready reports. Tally: the future of bookkeeping. Try it free today!" It fails the swap test (works for any expense app), opens on a stock question, lists three features in a row, uses four banned words and ends on an exclamation.

**Written version (a conceit film: the museum device. For a brand film only; a launch or product film never does this):**

| s | Beat | On screen | Voiceover | Visual |
|---|---|---|---|---|
| 0-2.5 | Hook | Exhibit 14: the shoebox | | A gallery spotlight finds a shoebox of receipts on a plinth. Museum label slides in. |
| 2.5-7 | Value | Retired, 2024. | "This is how people kept their books. Until this year." | The label's date ticks to 2024. |
| 7-13 | Proof 1 | One tap. | "Tally reads every receipt the moment you get it." | A phone snaps a crumpled receipt; the amount flies into a ledger row. |
| 13-20 | Proof 2 | Every month, balanced. | "And balances the month on its own." | Twelve months fill in, December last. |
| 20-28 | Escalation | 1,284 receipts. 0 shoeboxes. | | The shoebox empties as receipts become ledger rows. (Number from the truth sheet.) |
| 28-34 | Turn | | "Some things belong in a museum." | Pull back: the empty shoebox under glass, a visitor walks past. |
| 34-40 | Payoff | Your books don't fade. | "Yours don't have to." | The ledger, calm, in Tally's own colours. |
| 40-45 | End | Tally · tally.app | | Logo and URL, held still. The music lands its last chord. |

About 45 voiceover words, music-only open and close, value by beat 2, the turn at 62%, every line short enough to read.

**Written version (product-first, Sure: the same product, led by the real UI):**

| s | Beat | On screen | Voiceover | Visual |
|---|---|---|---|---|
| 0-3 | Hook (UI on screen) | Snap a receipt. | | The real Tally app, a crumpled receipt on the desk; the camera in the app, the scan frame locks on. |
| 3-9 | Hero moment | Tally reads it. | "Point at a receipt. Tally reads it." | The real scan: amount, vendor and category fill the row, held long enough to read. |
| 9-14 | Use 1 | Every receipt. | | A stack of six receipts become six ledger rows, in the real list. |
| 14-19 | Use 2 | Every month. | | The month view totals itself, the real chart. |
| 19-25 | Use 3 | Tax time, done. | | One tap exports the real report. |
| 25-31 | Turn | No shoebox. | "No shoebox. No Sunday." | The camera pulls back from the empty desk. |
| 31-36 | Payoff | Books that keep up. | | The ledger, in Tally's own colours. |
| 36-45 | End | Get Tally free | | The CTA card: the line is the largest type, the name and URL small beneath it, held still. |

The product is on screen at 0 s, the hero moment is the longest shot, three real uses, short plain lines, the end line the biggest type. Bold would keep the same beats and cut them to the beat of the music as kinetic type over the UI; Wild would run it as one unbroken take through the product.

## Self-check before `story.mjs check`

- [ ] The aim is written (takeaway, feel, action, audience, approach), the title names the idea, and every beat serves the aim.
- [ ] The one sentence is in the viewer's words, and the film proves it.
- [ ] The hook lands by 2 s and the beat moves on by 4 s.
- [ ] The value beat is beat 1 or 2 (`"value": true`).
- [ ] With the sound off, the on-screen lines tell the story.
- [ ] No line repeats another; no on-screen line repeats the voiceover.
- [ ] Every number and UI word is on the truth sheet.
- [ ] One turn, at 60 to 75%, with a breath before it.
- [ ] Beat lengths vary; the turn and the reveal are the longest.
- [ ] The end holds the name and one call to action for 2 to 3 s.
- [ ] Read aloud at a calm pace, it fits the time with room to spare.
- [ ] The three scripts would make three different films (device, protagonist, visual world, first image, last line). Product-first films: three different *structures, paces and energies* of the same product-led film (the first image of all three is the real product).
- [ ] Product-first films: UI on screen within 3 s; a hero moment; 2 to 4 real uses; lines of 6 words or fewer; the end line the largest type; nothing is a museum, allegory, invented world or metaphor.

Then run the checker. G1 to G5 judge the story; G6 judges the script (length, hook, value, reading time, voiceover pace and sentence length, repeats, stock copy, rhythm, the end):

```bash
node $SKILL_DIR/scripts/story.mjs check --pitch "$RUN/story/pitches.json" --truth "$RUN/story/truth.md" --length <seconds> [--narrated]
```

Exit 2 → fix exactly what it names and run it again. Two rewrites at most, then replace the device (`story.mjs pick --exclude <id>`).

## Rewrite moves, in order

1. **More specific:** swap a general word for the product's own object or number ("expenses" → "the coffee receipt from Tuesday").
2. **Fewer words:** cut adjectives, then cut the line that explains the image.
3. **Sharper turn:** make the reversal visible in one image.
4. **Stricter constraint:** one location, one object, one continuous move, no voiceover.
5. **Different device:** when two rewrites haven't fixed it.
