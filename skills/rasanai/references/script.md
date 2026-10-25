# Script: how to write a video script that holds up

This is the writer's brief. RasanAI's Story call runs it as its own pass, separate from the look: a script is judged as an argument, beats and words before any style touches it. A good script is not a description of a video. It is the film in words: every second accounted for, every line something the viewer hears or reads, every visual something you could point a camera at, and every beat there because the argument needs it.

## What you're given, what you return

- **In:** the truth sheet (`$RUN/story/truth.md`), the brief (length, format, where it plays, voiceover or not), and your slot from `story.mjs pick`: a shape, a plot engine and a device menu.
- **Out:** `$RUN/story/intent-<label>.json` (the argument, `references/intent.md`), written FIRST, and `$RUN/story/pitch-<label>.json` (the script, `references/story.md` Pitch JSON), whose beats are the intent's beats in the same order, each carrying:

```jsonc
{ "name": "Thursday, buried", "duration_s": 4,
  "on_screen": "Stuck in a thread again?",        // what the viewer reads, 6 words at most (or "")
  "vo": "",                                       // what the viewer hears; "" for music-only beats or unnarrated films
  "visual": "The real week view; 'Does 3 work?' bubbles pile into Thursday's cell until it is buried.",
  "sound": "a soft tick per bubble",              // optional
  "value": true, "turn": false }                  // value: beat 1 or 2; turn: the engine's turn beat
```

The script is written once and travels: the Story card shows it, `scenes.json` is built from it, the voice records its `vo`.

## Launch, promo and product films are product-first

For the route `product-launch-video` and any launch, promo, product or app film, read `references/product-first.md` first and let it win: the real product UI on screen early (3 s is the house target for product-demonstrating kinds, not a rule for every kind); a villain, when you use one, is the viewer's real pain at the claim's scope; a turn, when you use one, is the real product reversing it; one hero product moment (`hero_moment`) shows it for real; short plain lines; the required end line is the largest type on a clean CTA card; no museums, allegories, invented worlds, extended metaphors or cover versions (the only figures: an instant visual pun that resolves to the product within a second, and a letter or shape transformation that lands on the real product within its move). Sure, Bold and Wild differ in structure, pace and energy, never in leaving the product.

**Branded launch, promo or brand film:** write to the template in `references/launch-film.md` §1 (the product or brand in 1 to 3 s, the reveal, the hero demo, 2 to 4 real feature demos, the payoff line, the end card), each beat inside its timing range; mark each beat's `role` and set `payoff_line`. The brand's own film (`brand-film/FILM-STYLE.md`) gives the opening and its words. The three scripts differ only in emphasis and order, never in concept. On a ladder the order is the rungs' order and the emphasis is which uses and how the refrain is worded.

## Pass 0: the argument

Write `intent-<label>.json` before any line (`references/intent.md`, "How to write it"): the proposition, PAGE, (the villain and its felt numbers, and the ending first, when the film has them: optional since Plan 03), then the beats as beliefs, a peak only where one helps (60 to 75% with a rest before it is the legacy guidance). **Start from the viewer's day, not the product's feature list**: what the viewer is doing when the villain bites, at the claim's scope (for a universal or category claim, a moment most of the audience has had, never one person's evening).

The pitch carries the same decision for the user to read: `aim` (`takeaway`, 16 words at most, as the viewer would say it to a friend; `feel`, one feeling; `action`, one next step; `audience`), `approach` (one plain sentence on how the story gets there) and a `title` (2 to 5 words a person would use to refer to it, never a fragment of an on-screen line, never ending on a function word, never ALL CAPS). The takeaway is the proposition in the viewer's words. Sure, Bold and Wild may aim differently; the user chooses between arguments, not devices.

**Tempo** (`references/launch-film.md`, Tempo): an idea is one beat's `buys`. At least 3 beliefs in 15 s, 5 in 30 s, 8 in 60 s, 10 in 90 s, and no more than the argument needs: seven beliefs crammed into 30 s is the failure. Lines can come faster than beliefs (one every 1.5 to 2.5 s); something changes on screen about every 2 s. Write `tempo: { ideas, change_every_s, longest_hold_s, source }`, and list `changes` inside any beat over 3 s.

## Shapes

Your slot's shape and engine come from `pick` (`references/story.md`, Plot engines and Story shapes). Never tell a general launch as one plot: a film that followed one dinner bill for 30 s was rejected ("that's not how launch videos are made"). "One feature to sell" means a single-task feature: a feature whose promise is breadth (GPT-6 Intelligent UI, "any question becomes a tool") is a ladder of real asks across areas of life even when it is the only feature.

### The ladder (engine `refrain-break`)

`refrain: {verb, pattern}` and beats with a `role`: `open` (the refrain arrives, the product within 3 s), `rung`s, an optional `ways_in` (type, say, snap, film), and a `close` (`<verb> anything` or the product's own line, then the logo). Each rung: `use` (a distinct everyday use, 2 to 6 words, no shared content noun), `highlight` (in the title), `level` (strictly rising, simple to done-for-you: escalate the help, not a plot), `on_screen` (the title, containing the verb, 6 words or fewer), `picture`, `ui[]` (the real cause and effect), `benefit` (12 words at most, viewer language), `duration_s` (no rung over 35%). Rungs: 35 s or less 3 to 4; 36 to 60 s 4 to 6; over 60 s 6 to 8.

**The break.** After 2 to 4 rungs of one pattern, the rung at 60 to 75% breaks it: the structure or the verb changes, not only the content. It is the turn and the peak at once; mark it `"break": true` and `peak` in the intent. Without a break a ladder is a list.

Worked ladder (a 30 s launch of Folio, a notes app; the refrain is "Write"):

| s | Role | On screen (highlight) | Use | Level | The real UI |
|---|---|---|---|---|---|
| 0-3 | open | Write **anything**. | | | The empty Folio page, cursor blinking; the title becomes the first line of a note. |
| 3-8.5 | rung | Write **simple** lists | pack for the trip | 1 | Type "pack for Lisbon": a checklist forms; ticks as items are typed. |
| 8.5-14 | rung | Write **longer** | meeting notes | 2 | A long, messy jotting; a summary header and action items rise above it. |
| 14-19 | rung | Write it to **plan** | plan the week | 3 | "plan my week around the 9:30 standup": blocks land in the week view; the cursor waits (the rest). |
| 19-25 | rung, break | Write it, and it's **done** | send the recap | 4 | The pattern breaks: no title card first. The viewer types "Write it" and Folio finishes the sentence itself, drafts the recap, Send, a sent toast. |
| 25-30 | close | Write **anything**. Folio | | | The opening's empty page returns, full; the title line settles into the logo and URL. |

Three rungs teach the pattern (a title, then you type, then it helps); the break at 63% flips who writes (it does), so it is the peak; the close answers the open's empty page. The uses (a trip, a meeting, a week, a recap) share no noun.

### Scope matches the claim (G13)

Specificity lives inside each use (the exact prompt, the real label, the number); the story's scope matches the claim's. A breadth promise is shown as its range: 4 to 8 different everyday uses in 30 s from at least 4 areas of life, the most universal first, no use over 35% of the runtime (aim 25%), no persona carried between beats, the close generalising. Each rung or benefit carries `domain`, `reach` (most | many | some | few) and `clause`. **Would most of the audience recognise themselves in most beats?** The reach of a Wild script lives in the camera, the joins and the rhythm, never in a narrower situation.

OpenAI's own film for GPT-6 Intelligent UI (70 s): five people in five areas of life (a paint colour while moving house, a city guide, origami, a child's bike, a garden plan), intercut. One villain for everyone: the answer that arrives as a wall of text, shown as real sheets of paper. One turn line, about everyone: "Sometimes words aren't enough." Each thread resolved by the real UI; an end card collage of about 15 more uses. Our run6 film for the same feature spent 65% of its 30 s on one dinner bill: rejected. The bill splitter is allowed as one 3 to 4 s rung among five.

### The pas (engine `reversal`): a launch about the viewer

Kinso's launch (`library/showcases/kinso-launch.json`) is the viewer's day: "Your next deal is in here somewhere" → "Woah" → "You are a really busy person" → "Meet KINSO" at 27% → "One inbox for every conversation" → three benefits, each with one UI behaviour → "Join 27,300 others on the waitlist" → the logo and URL. 27 lines in 46 s. Beats with a `role`:

- `hook`: the villain as a picture, in second person. For a universal or category claim the pain is the category's, never the set-up of one benefit.
- `agitate` (optional): the pain lands; a reaction line ("Ugh.").
- `meet`: the reveal and the turn, not before 20% (`reveal-too-early`): the product visibly reverses the villain.
- `benefit` x2 to 4: each `benefit` (what the viewer gains, 12 words at most) and ONE UI behaviour in `ui[]`, escalating toward the peak, from different moments of life.
- `proof`: one line with a number from `research/claims.json` (`proof: {line, claim}`); none in the ledger, no number.
- `cta`: `cta: {line, action, where}`, a verb and a place.

The brand name recurs once mid-film tied to a benefit ("Plover books it.") besides the reveal and the end card. A launch may run 30 to 45 s when the story needs room.

Worked pas (a 38 s launch of Plover, a scheduling app; the numbers stand in for the truth sheet's):

| s | Role | On screen | UI behaviour (what the motion does) |
|---|---|---|---|
| 0-2 | hook | Your next meeting | An empty week grid; the words land in Thursday's column. |
| 2-4 | hook | is stuck in a thread. | "Does 3 work?" bubbles pile into Thursday's cell until they cover it. |
| 4-5.2 | agitate | Ugh. | The bubbles collapse into a red "14" badge that squeezes into the full stop. |
| 5.2-7.4 | agitate | You have real work to do. | Hard cut to a dark ground; a small dot bounces along the line. |
| 7.4-9.2 | agitate | Let's fix that. | A bar sweeps across the dark and folds into the logo mark. |
| 9.2-11.2 | meet | Meet Plover. | "Meet" holds beside the mark and becomes "Plover" in the same slot; the ground turns warm. |
| 11.2-13.4 | meet | One link for every meeting. | The 14 bubbles fold into one link chip; a week window rises out of the line. |
| 13.4-15.6 | benefit 1 | Send one link, not ten replies. | The chip drops into a message; the stacked bubbles are gone. |
| 15.6-17.8 | benefit 1 | They pick a time that fits. | On the guest's page the free slots light; one is tapped and locks. |
| 17.8-20 | benefit 2 | It reads your calendar. | Busy blocks grey out as each connected calendar slides in. |
| 20-22.2 | benefit 2 | So you never double-book. | A cursor presses a busy cell; it stays dim, the free cell beside it lifts. |
| 22.2-24.4 | benefit 3 | Your focus time stays yours. | A request slides off a shaded focus block; then 0.4 s of near-stillness (the rest). |
| 24.4-26.6 | benefit 3 (peak) | Meetings find the gaps. | The whole week fills at once, block by block into every gap, the cursor still: the biggest move in the film. |
| 26.6-28.4 | proof | 12,400 teams | A counter rolls to 12,400 (`claim: c4`). |
| 28.4-30.4 | proof | stopped chasing replies. | The words wipe in under the number. |
| 30.4-32.4 | cta | Your week, booked. | Thursday's cell, the one the bubbles buried, holds one calm block. |
| 32.4-35.4 | cta | Try it free at plover.app | The block settles into the logo; the URL types in. |
| 35.4-38 | end | Plover | The mark and URL hold; the music stops on the last hit. |

Its argument: the proposition "One link books the meeting, not fourteen replies"; the villain the reply thread, with "14" as its felt number; the turn at 24% (the bubbles fold into one link); the peak at 64% (the whole week books itself) after a rest; the payoff (Thursday, clean) answers the opening's buried Thursday. Importance 3 on the meet and the peak only. 18 lines in 38 s.

### One feature, one scenario (single-task claims only)

ONE feature whose promise is one job, shown as one person doing one real task. Write the `feature` block first:

```jsonc
"feature": { "name": "Cues", "url": "https://greenroom.example/cues",
  "viewer": "a teacher running a live class", "task": "send the class a reading link mid-lesson",
  "before": "she stops teaching to hunt for the link", "after": "the link opens in the class's window as she says it" }
```

Four roles in order: **hook** = the `before` (the villain); **proof** = the task done in the real UI (the longest beat); **turn** = the `after` lands and the brand with it; **cta** = one action. Every beat carries a `picture` and `ui[]` (the literal cause and effect; no invented output screens), `on_screen` 6 words at most, and the pitch a `two_way: {lines_alone, pictures_alone}` (each tells the same story). `uses` are the 2 to 4 real steps of the one task.

## The passes

Write in passes; each has one question.

1. **The argument** (pass 0). Proposition, villain, ending first, beats as beliefs. Nothing below changes it without changing the intent too.
2. **The spine.** Lay the beats on the length (Structures, below): the hook, the turn where its engine puts it, the peak at 60 to 75%, the rest before it, the payoff, the end. Durations first, words second; every beat's duration at least its `read` time.
3. **The hook.** Write five, keep one. It lands in 1.5 to 2 s and works muted: the villain or the product, moving, readable (`muted_hook`).
4. **The visuals.** For every beat the shot: what fills the frame, what moves, what changes, in concrete nouns from the truth sheet. Name the one element that carries into the next beat (the move-inventor mines it).
5. **The words.** On-screen lines first (the film reads with the sound off), then a voiceover that adds what the screen can't show. One read per beat: the line in `read` is the one the beat is built around.
6. **The turn and the peak.** Read the turn beat: does something visibly reverse? Read the peak: is it the hardest proof of the proposition, and the biggest moment? If the biggest picture sits on an importance-1 beat, move the picture or the importance.
7. **The end.** Does it land the ending you wrote first, and answer the opening? The name, one call to action, an end card of 2 to 3 s whose elements land in sequence.
8. **The cut.** Delete 20% of the words. Cover each beat in turn: if no belief is lost, cut the beat. Then run the checks.

## The show column: a motion that MEANS each line

A line with no motion of its own is a caption, and a film of captions is a slide deck. After pass 4, give every beat `shows: [{ line, show, built_from, handoff }]`, **one row per on-screen line** (a title that changes in place is one row per state), and name the pitch's `actor: { what, does }`, the one persistent element (an orb, the composer, a dot, the cursor) that carries the film (required on launch, promo and brand films). The references are in `library/showcases/` (Sovra and Kinso for a launch).

- `line`: the words, verbatim. `show`: the motion, concretely: which element, what it does, and how the words and the UI touch; it says something only this line means (a show that would fit any line is a label, `show-unbound`). `built_from`: `product UI`, `actor`, `type`, `object` or `photo`. `handoff`: what carries into the next line and what changes in place; the last row says "end".

The principles, from the ten references: one actor carries the film (promote it, spend it, end on it); the word and the UI touch (the idea is the collision); hold the frame and swap the word in place; a carrier sentence turns a list into a ladder; the real UI is the scenery and the line its caption; the type rides the thing it describes; the container morphs, nothing cross-dissolves; spend colour and weight like a budget; escalate, then resolve small.

**Worked rows (Sovra.fm launch).**

| line | show | built_from | handoff |
|---|---|---|---|
| Same songs | A pill outlined in violet appears with the words inside it; a music-note chip attaches and the outline fills with gradient. | type | The pill holds; only its word changes. |
| Same feeds | The pill holds its shape while "songs" blurs out and "feeds" lands in the same slot; the pill grows slightly. | type | The word swaps again in the same pill. |
| Same loops | The word swaps to "loops" and the outline swells into three nested rings that fill the frame: trapped inside a loop. | type | The rings leave the frame and a clean line takes the dark. |
| Afro house, Starting station generation 4% to 100% | A ring fills while the percentage counts 4, 21, 41 to 100; at 100 the ring turns green with "Station Generated". | product UI | The green ring pops open into the album art. |

**Worked rows (Kinso launch).**

| line | show | built_from | handoff |
|---|---|---|---|
| somewhere | A notification stack (Gmail, Slack, WhatsApp icons with red counts) rises through the word and splits it into "some" and "where". | product UI | The stack tilts out of the word and lands on the next line. |
| Woah | The stack lands and its icons collapse into a red dot that becomes the "o". | object | The label shrinks to the centre; hard cut to dark. |
| And ranks messages by it | The words stack down the left while the inbox on the right re-orders and a highlighted row jumps to the top. | product UI | A phone panel slides over the window. |

**A bad row, and its fix.** Bad: "One inbox for every conversation", show "the line fades in over the app window", `type`: a caption over UI that would fit any line. Fix: "The line shrinks to a caption above a white panel that rises and scales into the inbox window; a teal band steps down its rows, one conversation at a time", `product UI`.

Before moving on: read the `show` column alone; does it tell the film? At least one row where words and UI touch and one line that changes in place (else `no-touch`, `no-swap` warn). A `show` is 8 words or more and shares a content word with its line. The `actor` appears in the first and last rows.

## Structures by length

The sheet for any length, with its slot names, is printed by `node $SKILL_DIR/scripts/story.mjs sheet --length <s> [--engine <e>]`; each beat may carry its `slot` (`open|hook|turn|rung|proof|rest|peak|payoff|end|close`). Durations are guides; the read times and the engine win. At every length the peak is the longest beat, and the last beat holds at least 1.8 s (10 s and under), 2.0 s (to 22 s) or 2.5 s. A beat is one belief; shot changes inside it are fine. Shown for `reversal` (and `before-after`, where the turn is the cause); on a `refrain-break` ladder the rungs fill the middle and the break is both turn and peak.

**10 s (one idea, `reversal` or `before-after`):** hook and product 0-2 · turn 2-3.5 · proof 3.5-5.8 (a rest) · peak 5.8-8.2 (the longest beat, at least 2.2 s, starting at 58 to 75%) · payoff and end 8.2-10 (the end line is the payoff line, held at least 1.8 s). Four to five beats, one line of voiceover at most. A 10 s `refrain-break` ladder: open 0-2 · rung 2-3.5 · rung 3.5-5.8 (a rest) · break, which is the peak, 5.8-8.2 · close 8.2-10. The beats are deliberately uneven, so the evenness check is skipped at 12 s or less while the peak is the longest beat. A 10 s `before-after` pair runs 1.5 to 3 s (3 to 6 s is for longer films), and the film has 2 to 3 pairs (G10: 2 to 3 pairs up to 12 s, 2 to 4 up to 22 s, 3 to 6 above).

**15 s (social teaser):** hook 0-2 · turn by 5 · one proof 5-9 · peak 9-11 · payoff and end 11-15. Three to four beats, no voiceover or one line.

**30 s (launch, feature):** hook 0-2 · setup 2-6 · turn 6-11 · proofs escalating 11-18 · rest · peak 18-22.5 · payoff 22.5-27 · end 27-30. Six to eight beats, 50 voiceover words at most.

**45 s:** hook 0-3 · setup 3-9 · turn 9-14 · proofs 14-27 · rest · peak 27-33 · payoff 33-40 · end 40-45. Seven to nine beats, about 85 voiceover words.

**60 s:** cold open 0-3 · setup 3-12 · turn 12-18 · three proofs 18-36, escalating · rest · peak 36-45 · payoff 45-54 · end 54-60. Eight to ten beats, 110 to 140 voiceover words.

**90 s (explainer):** the 60 s shape with a stakes act (8-12 s) before the first proof; a second, smaller peak is allowed before the main one. Longer needs a character or a world. **Explainers: progressive disclosure.** Introduce the system in the order the viewer needs it: the action that starts it, then each part as it acts; one new element per beat, earlier ones stay as anchors, the full diagram is the payoff, and the narration names each part as it appears.

**Brand film (20-40 s):** no feature proof. Image, image, image, the turn as a change in the viewer's point of view, then the name. Voiceover, if any, reads like a short poem with a plain last line.

**PR / changelog (30-60 s):** `before-after`: the before (the problem in the code or the user's day), the cause (one diff or one screen), the after with the real number, the end. 19 voiceover words per frame at most.

**Footage reel:** the footage decides; the hook is its strongest real 2 seconds. Cards carry the words; never write lines the footage contradicts.

## Hooks that work

Pick from the truth sheet, not this list. Each must work muted:

- `villain-in-action` **The villain in action:** "Does 3 work?" bubbles burying Thursday. (The effect before the cause.)
- `outcome-flat` **The outcome, stated flat:** "Your books, balanced. Every month."
- `felt-tension` **The tension they already feel:** "April 14. 11:58 pm."
- `true-fact` **The true, surprising fact:** "Receipt ink fades in about a year." (Only if it's on the truth sheet.)
- `product-doing` **The product doing its thing:** a phone snaps a receipt and the ledger fills before the first second ends.
- `flash-forward` **The flash-forward:** open on the finished result, then rewind and earn it.
- `transformation` **The transformation:** a complicated state that resolves in front of us.
- `character-action` **The character acting:** a character does something we care about (mascot and story films).

Never open with "Introducing…", "Meet…" (as a first line), "What if…?", "Tired of…?", "In today's world…", a logo, a company description, a question the viewer can answer "no" to, or a statistic without a stake.

## Lines: on screen and in the ear

**On-screen text**

- 6 words at most per line, 1 to 4 is better; one line on screen at a time.
- Held at least its reading time: 0.6 s + 0.3 s per word (`lib/reading.mjs` readTime). The beat's `read` is the line it is built around.
- The on-screen lines alone tell the story with the sound off. Whether they repeat the voiceover is a channel-role decision per beat (a caption, an emphasis or an accessibility description may repeat it on purpose), not a ban.
- Sentence case, a full stop for weight, no exclamation marks, no em dashes.
- **Talk to the viewer.** Second person ("Your next deal"), their own question, a reaction when the pain lands ("Ugh"). Say what the viewer gets ("You never retype a list"), not what the product is ("Notes, reimagined"); a line with no verb and no pronoun is a slogan.
- **One line every 1.5 to 2.5 s** on launch films (`sparse-lines` above 3.0 s per line).
- **Readability is a hard rule.** At rest the line sits fully inside the 6% safe area, on one line (two at most), at the brand film card's type scale or the design system's display size; never cropped. It may leave the frame only in a push-through of 1.2 s or less (`text-fit`).

**Voiceover**

- 2.3 to 2.7 words per second (2.0 to 2.3 for a calm register); total words at most 2.5 x seconds; music-only moments at the cold open, the turn's breath and the last 2 to 3 s.
- Sentences of 6 to 10 words, 14 at most, one idea each, spoken: contractions, plain verbs, the product's own words.
- Every noun the voice names is on screen within a few frames of the word.
- No hype vocabulary: seamless, unlock, effortless, revolutionize, supercharge, empower, streamline, cutting-edge, game-changer, the future of, like never before. No "not X, it's Y". Voiceover is optional and often worse than none.

**Visual lines**

- Write the shot, not the adjective: "Macro on the receipt's total as the ink bleaches to white", not "a powerful image of fading receipts".
- The product's real material only: its screens, objects, numbers and words.
- Say what moves and what changes. Size and motion follow importance: the biggest picture belongs to the peak, and a calm beat is calm on purpose.

## The turn, the peak and the end

- **The turn** reverses something the viewer can see: the pile becomes one link, the refrain stops and the product finishes the sentence, the cause lands on screen. Write what the viewer believed just before and just after; if the two sentences match, there is no turn. It sits where its engine puts it.
- **The peak** is the hardest proof of the proposition, at 60 to 75%: the furthest use, the break, the after at full. It gets the biggest picture and the longest hold. Before it, a **rest**: a slower or stiller beat (one slow mover for 0.3 to 1.0 s, never a frozen frame) so the peak lands.
- **The payoff** answers the opening: its object or words return, changed. It never introduces a new idea.
- **The end beat**: the name and one call to action (a URL, "available today"), 2 to 3 s, the music's ending under it. The last line is plain and quotable. Never "Thanks for watching", never a wall of social icons.

**The default, rejected:** "Tired of messy receipts? Introducing Tally. Scan receipts instantly. Track expenses effortlessly. Get tax-ready reports. Tally: the future of bookkeeping. Try it free today!" It fails the swap test, opens on a stock question, lists three features with no turn, puts nothing at stake, uses four banned words and ends on an exclamation.

## Self-check before the checks

- [ ] The intent is written first: proposition (12 words, no "and"), every beat's buys, relation, importance, read; villain and ending first when the film uses them (optional).
- [ ] Blind retell: from the on-screen lines and visuals alone, a stranger would say the proposition.
- [ ] The turn reverses something visible; the peak is at 60 to 75% with a rest before it; the payoff answers the opening.
- [ ] Importance 3 on a quarter of the beats at most; the biggest picture sits on the peak.
- [ ] The first 2 s say something with the sound off.
- [ ] Every on-screen line has a `shows` row; the pitch names its `actor`; no row is a caption over UI.
- [ ] Launch films: the first quarter speaks to the viewer, the brand arrives after the pain, every benefit says what the viewer gets with one UI behaviour, a proof with a real number (or none), a CTA with an action and a place, a line every 1.5 to 2.5 s.
- [ ] Every number and UI word is on the truth sheet, and a number's noun is the claim's noun ("50 people", not "50 phones").
- [ ] Coverage: every Must-show feature and every Surprising fact is a row in `coverage` with a `beat`, or a `cut` with a reason of four words or more.
- [ ] The plan: your slot's device, `turn_kind`, `peak_kind` and owned claims are in the pitch, and no word was moved into `actor` to pass the scope count.
- [ ] The peak is the longest beat and the end line is held long enough for its length; `tempo.ideas` is the intent's count of distinct beliefs.
- [ ] Product-first: UI within 3 s, a hero moment, real uses, lines of 6 words or fewer, the end line the largest type, nothing is a museum, allegory, invented world or metaphor.
- [ ] The three scripts are three arguments or engines, not one takeaway in three costumes.

```bash
node $SKILL_DIR/scripts/story.mjs intent --intent "$RUN/story/intent-<label>.json" --length <seconds>
node $SKILL_DIR/scripts/story.mjs check --pitch "$RUN/story/pitch-<label>.json" --truth "$RUN/story/truth.md" --length <seconds> [--narrated]
```

Exit 2 → fix exactly what it names. Two rewrites at most, then another device or another use from the truth sheet.

## Rewrite moves, in order

1. **More specific:** swap a general word for the product's own object or number ("expenses" → "the coffee receipt from Tuesday").
2. **A sharper turn:** make the reversal visible in one image.
3. **Fewer beats:** cut the beat whose buys the proposition can lose; give its seconds to the peak.
4. **Fewer words:** cut adjectives, then the line that explains the image.
5. **A stricter constraint:** one location, one object, one continuous move, no voiceover.
6. **A different device or engine:** when two rewrites haven't fixed it.
