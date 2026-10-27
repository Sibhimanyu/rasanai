# intent.json: the film's argument on one page

The script writer writes it before any line, the Motion Director keeps it, and every later stage reads it. One owner, one argument: what the viewer must believe at the end, which beat buys which belief, and where the emphasis goes. Boards, timings, motion and gates all spend from it. Keep it short: if it does not fit on one page, the film has too many ideas.

Files: each writer writes `story/intent-<label>.json` beside `story/pitch-<label>.json`; the chosen one becomes `story/intent.json`. The structure critic's edits are applied to `story/intent.json`, `story/chosen.json` and `scenes.json` together by `crew.mjs check --role structure-critic`. Validate with `node "$SKILL_DIR/scripts/story.mjs" intent --intent <file> --length <s>` (`scripts/lib/intent.mjs`).

## Schema

Words are whitespace-separated tokens; "no `and`" means the whole word, any case (`&` and `+` count). Fields marked (opt) are read when present.

| Field | Type | Constraint |
|---|---|---|
| `label` | string | `Sure` \| `Bold` \| `Wild` |
| `kind` | string (opt) | `script` (default) \| `treatment` (a lyric video: one beat per plate) |
| `length_s` | number | the film's length |
| `proposition` | string | one sentence, 12 words at most, no `and`. Every beat carries, proves or pays it off |
| `page` | object | `{problem, audience, goal, emotion}`, all non-empty. Write `emotion` as "from <feeling> to <feeling>": the distance is the payload |
| `villain` | object (opt) | OPTIONAL since Plan 03 (validated only when present). `{what, picture}`. `what`: the one object or problem to blame (the viewer's real pain; never a competitor, never the product). `picture`: how it is visible on screen |
| `felt_numbers` | array | 1 to 3 of `{value, source}`: `value` holds a digit; `source` a claim id from `research/claims.json`, or `"prop"` (a story detail, also in the pitch's `props`) |
| `story_format` | string (opt) | `"v2"` for a sheet derived from a format-aware treatment (`lib/treatment.mjs toIntent`): villain, ending_first and a peak are then all optional |
| `ending_first` | object | required for legacy sheets, optional for `story_format: "v2"`. `{line, last_frame, echo, echoes_beat (opt)}`: the last line and frame, written first; `echo` what of the opening they answer; `echoes_beat` the beat it answers (usually 1) |
| `character` | object (opt) | `{want, obstacle, behaviour, change, acting}` for mascot, brand-character and animated-story films; `acting` is how the body shows the change (cautious early, decisive late) |
| `muted_hook` | string | what the first 2 s say with the sound off (picture plus any words) |
| `beats` | array | one per pitch beat, same order and count (3 at least) |
| `emphasis_curve` | derived | written by the validator, never by hand |

Each beat:

| Field | Type | Constraint |
|---|---|---|
| `name` | string | the pitch beat's `name` |
| `buys` | string | "The viewer now believes / knows / feels / wants …": ONE belief, no `and`, 20 words at most |
| `viewer_before` | string | what the viewer thinks or feels as the beat starts |
| `viewer_after` | string | as it ends; different from `viewer_before` (a beat that changes nothing is cut) |
| `relation` | string | to the beat before: `because` \| `but` \| `so` \| `example` \| `escalation` \| `answer`; the first beat is `open`. A beat with no relation word is cut |
| `importance` | number | `1` \| `2` \| `3` |
| `peak` | boolean | exactly one beat is `true` |
| `read` | object | `{text, seconds, kind (opt)}` (`s` is read as `seconds`): the ONE thing to read. `kind` `words` (default) \| `number` \| `picture`. `seconds` at least `readTime(text)` (`scripts/lib/reading.mjs`: 0.6 + 0.3 per word); a picture read at least 1.0 |
| `rest_after` | boolean | the film breathes after this beat |
| `duration_s` | number | the pitch beat's draft `duration_s`, copied, so the peak's place and its length against the other beats can be measured |
| `slot` | string (opt) | the beat sheet's slot for this beat (`story.mjs sheet --length <s>`): `open` \| `hook` \| `turn` \| `rung` \| `proof` \| `rest` \| `peak` \| `payoff` \| `end` \| `close` |

Film-level rules:

1. Importance 3 on at most 25% of the beats. At least one beat at importance 1: emphasis is spent, not spread.
2. A peak is optional (none is valid; two are an error). When there is one, it has importance 3, and the legacy guidance puts it between 60% and 75% of the running time (58% to 75% at 10 s) (a lyric treatment: on the song's own climax, 55% to 90%).
3. The beat right before a peak has `rest_after: true` (legacy guidance, a warning, not checked for `story_format: "v2"`).
4. When the pitch declares a turn (optional), its turn beat (`turn: true`, stated in `pitch.turn`) has relation `but`. Engine placement (references/story.md, Plot engines): `reversal`: the turn starts at 15% to 45%, before the peak; `refrain-break`: the turn IS the peak (the break); `before-after`: the turn (the cause made visible) comes before the peak.
5. When the sheet has an `ending_first`, the payoff is a beat with relation `answer`, at or after the peak, and it answers what `ending_first.echo` names.
6. No two beats share a `buys`.
7. A peak, when there is one, holds longest: the peak beat's `duration_s` is at least every other beat's (error `peak-not-longest`). At a 10 s film the peak window is 58% to 75% (a 10 s film rounds hard); elsewhere 60% to 75%.

Errors (Plan 03: `villain` and a peak are optional; `ending_first` is optional for v2 sheets): the proposition, `page`, a malformed `villain` when present, `ending_first` (legacy), each beat's buys, before, after, relation, importance and read, the 25% budget, at most one peak (importance 3), the peak holding longest (`peak-not-longest`). Warnings (uncalibrated): `muted_hook`, `logo-only-ending`, `character-arc-thin`, `character-no-change`, felt numbers, the form of a buys (`buys-form`, `buys-and`), `no-change`, `no-valley`, `peak-place`, `no-rest-before-peak`, `read-short`, repeated buys.

Timings follow the intent, never the reverse: `scenes.mjs --intent story/intent.json --retime` sizes each beat from its `read` and `importance` (the peak and the payoff hold longest, the beats before the peak shorten, a `rest_after` adds air). The draft `duration_s` is only where that starts.

## How to write it, in this order

1. **Proposition.** The one thing a viewer could say back. Subject, verb, benefit. If it needs `and`, there are two films: pick one.
2. **PAGE.** Problem, audience, goal, emotion; name both ends of the emotion.
3. **Villain and felt numbers.** One concrete object doing one wrong thing (an unread badge climbing, a 14-reply thread), never an abstraction. On a product film it is the viewer's real pain, and the hero is the real product UI.
4. **Ending first (optional for v2).** The last line and frame, then what of the opening they answer. Write the middle only after this when the film sets up a question; a demonstration or manifesto may skip it.
5. **Engine and turn, only if you use them** (in the pitch: `engine`, `turn: {line, reverses, payoff}`). A declared turn that reverses nothing is a list; no turn is fine.
6. **Beats.** For each: what it buys, the viewer before and after, the relation word, importance, the one read. A beat with no relation word, or whose before equals its after, is cut, not shortened.
7. **Peak and rest (optional).** If the film has a peak: one, at 60 to 75% in the legacy sheets, a rest right before it; count the 3s. Then `muted_hook`.

## Worked example (a 30 s launch of Plover, a scheduling app; numbers are props, never copy them)

The pitch: `shape: "pas"`, `engine: "reversal"`, `turn: {line: "Send one link instead.", reverses: "asking for a time was a thread; now it is one link they click", payoff: "Thursday, the buried cell, comes back clean"}`, beat 3 `turn: true`, `device: null` with `device_reason: "the week grid is the film's own stage; a device would only hide it"`.

```json
{ "label": "Bold", "kind": "script", "length_s": 30,
  "proposition": "One link books the meeting, not fourteen replies.",
  "page": { "problem": "Booking one 30-minute call takes a long email thread.", "audience": "People who book calls with outsiders every week", "goal": "Try Plover free", "emotion": "from irritation to relief" },
  "villain": { "what": "the reply thread", "picture": "'Does 3 work?' bubbles pile into Thursday's cell until it is buried" },
  "felt_numbers": [ { "value": "14 replies", "source": "prop" }, { "value": "30 minutes", "source": "prop" } ],
  "ending_first": { "line": "Your week, booked.", "last_frame": "Thursday's cell, the one the bubbles buried, holds one booked block that folds into the Plover mark beside plover.app", "echo": "the buried Thursday cell of the opening, now clean", "echoes_beat": 1 },
  "muted_hook": "A week grid; Thursday fills with reply bubbles until it disappears: scheduling is a mess, readable by 2 s",
  "beats": [
    { "name": "Thursday, buried", "buys": "The viewer now recognises their own scheduling thread", "viewer_before": "scrolling, not involved", "viewer_after": "that's my inbox", "relation": "open", "importance": 2, "peak": false, "read": { "text": "Stuck in a thread again?", "seconds": 2.1 }, "rest_after": false, "duration_s": 4 },
    { "name": "Fourteen", "buys": "The viewer now feels what one call really costs", "viewer_before": "it's annoying", "viewer_after": "fourteen replies for thirty minutes is absurd", "relation": "escalation", "importance": 1, "peak": false, "read": { "text": "14 replies. One call.", "seconds": 1.8, "kind": "number" }, "rest_after": false, "duration_s": 2.5 },
    { "name": "One link", "buys": "The viewer now believes one link can replace the thread", "viewer_before": "this is just how it is", "viewer_after": "wait, there's another way", "relation": "but", "importance": 3, "peak": false, "read": { "text": "Send one link instead.", "seconds": 1.8 }, "rest_after": false, "duration_s": 4.5 },
    { "name": "They pick", "buys": "The viewer now believes the guest picks a time without asking", "viewer_before": "someone still has to negotiate", "viewer_after": "nobody negotiates", "relation": "so", "importance": 2, "peak": false, "read": { "text": "They pick. It's booked.", "seconds": 1.8 }, "rest_after": false, "duration_s": 4 },
    { "name": "It knows", "buys": "The viewer now trusts it never offers a busy slot", "viewer_before": "what about double-booking?", "viewer_after": "it reads my calendar", "relation": "because", "importance": 1, "peak": false, "read": { "text": "It knows you're busy.", "seconds": 1.8 }, "rest_after": true, "duration_s": 3.5 },
    { "name": "The week books itself", "buys": "The viewer now believes a whole week can book itself", "viewer_before": "one meeting at a time", "viewer_after": "my whole week, handled", "relation": "escalation", "importance": 3, "peak": true, "read": { "text": "A whole week. Zero replies.", "seconds": 2.1 }, "rest_after": false, "duration_s": 4.5 },
    { "name": "Thursday, clean", "buys": "The viewer now feels the relief the opening promised", "viewer_before": "impressed", "viewer_after": "relieved: Thursday is mine again", "relation": "answer", "importance": 2, "peak": false, "read": { "text": "Your week, booked.", "seconds": 1.5 }, "rest_after": true, "duration_s": 3.5 },
    { "name": "Try it", "buys": "The viewer now knows where to try it free", "viewer_before": "I want this", "viewer_after": "plover.app, today", "relation": "so", "importance": 1, "peak": false, "read": { "text": "Try it free at plover.app", "seconds": 2.1 }, "rest_after": false, "duration_s": 3.5 }
  ] }
```

Against the rules: 2 of 8 beats at importance 3 (25%), three at 1; the peak (beat 6) starts at 18.5 s of 30 (62%) with a rest after beat 5; the turn (beat 3, `but`) starts at 6.5 s (22%), before the peak; the payoff (beat 7, `answer`) answers beat 1's buried Thursday. The middle escalates (one call, then a whole week) instead of listing three features.
