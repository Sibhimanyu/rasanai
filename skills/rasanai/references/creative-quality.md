# Creative quality: one idea that survives every handoff

A short runtime guide for the Director and anyone it briefs. The contract lives in `scripts/lib/creative-contract.mjs`;
the brief is `<run>/creative/brief.json`. It holds intent and references, never timing (that is `motion/score.json`) and
never approval (that is the user's stage decisions).

## Start from the assignment

- Start from what the user wants the viewer to understand, do or feel, and from the product's real material: its UI,
  numbers, names, footage, docs. If a beat could be pasted into a competitor's film, it is not specific yet.
- Write the promise as an evidence-backed takeaway, not a slogan. Write the premise as the one idea that organizes
  the film. Name which product material makes it specific.
- Say what changes visibly, what the viewer understands because of it, and what a builder must not substitute
  ("a card title is not the specified visual event").
- "Premium, cinematic, stunning" alone says nothing. It is a major creative concern, but there is no minimum length:
  a short, concrete sentence beats a long vague one.

## No inspiration given

- The default case is automatic: the reference selector (`creative-references.mjs`) picks a few relevant examples from
  the index. Never ask the user for inspiration just to proceed.
- References give principles, not pictures to copy. Keep `avoid_copying`. With no usable visuals, say so; text-only
  descriptions never certify professional parity.

## Who owns what

- Story is meaning and proof: what is claimed, shown and resolved. Conceptual visual events only, no shot coordinates.
- Look is visual language for that story: different candidates are different strategies, not recolors.
- Storyboard is exact execution, and only after Look is approved. Shots and boards bind to the signature events then.
- The Director owns the whole film's progression. Keep consistency (type, color, motion grammar) separate from
  repeated template layout: consistency is the system, repetition is the same composition for different information.
- Revise the brief by new revision after Story and Look; never rewrite approved intent in place. Pins record the
  approved artifact digest; a changed artifact makes the old pin stale and the old approval does not carry over.

## Recommend boldly, let the user choose

- Make a specific visual recommendation and pursue it through real composition. The user chooses through the
  existing screens; a recommendation, a model score, speed or a known brand is never approval.
- Restraint is a valid choice. Nothing here requires 3D, depth of field, camera moves, giant type, a twist or a
  hero effect per cut.
- `native_material` is an array of objects `{ "id": "<stable-id>", "kind": "<screen|copy|data|asset|...>", "source_ref": "<a source named in the research>" }`; all three are required for each item.
- At the proposal stage a signature event needs no `beat_ids` (beats do not exist before the Story); `crew.mjs creative revise --mode story|look` and later checks require them.
- One or two signature events is a starting heuristic for a launch film, not a rule. A signature event may be
  subtle, silent or static in composition. It must help explain the product. Empty is valid with a reason.
- Use a different layout when the information changes, never to satisfy a variety quota. Say what repetition is
  intentional (`repetition_intent`).

## Ambition has limits

- An approved ambition is not permission to fabricate product behavior, invent numbers, copy another film or cut
  reading time. Proof constraints travel as `must_preserve` and are never trimmed from a slice.
- Effort comes from the existing resolved production budget. Concentrate it on the focus events; do not raise spend
  or change the model. Once a promising direction is picked, make one focused improvement instead of generating
  more alternatives.

## Shortfalls are owned, evidenced and bounded

- Every shortfall names an owner, the observed evidence (frame, shot, time) and a concrete targeted repair.
- Mechanical, factual and permission failures block. A style waiver never removes them.
- Aesthetic shortfalls get bounded rounds (`effort.round_limit`). After that they go to the person as `needs_user`
  with the evidence, through existing review controls. Never loop on taste until the budget is gone.
- No self-certified masterpiece. A reviewer independent of the builder, looking at the current artifacts, is the only
  path to `ready`. Still images cannot establish timing or sound; tool logs show an asset arrived, not that it was
  understood.

## Signature events

`creative/brief.json` `signature_events[]` is the only event collection. An empty array is valid when
`signature_events_reason` says why that suits the format. Each event is one object; `crew.mjs creative check`
requires every field below and lists all that are missing in one error per event.

| Field | Type | Meaning |
|---|---|---|
| `id` | string | stable identifier, unique in the brief |
| `beat_ids` | string[] | the beats that carry it; not needed at the proposal stage (no beats exist before the Story), required once they do |
| `before` | string | what the viewer sees or believes just before the event |
| `change` | string | the one visible change, concrete enough to storyboard |
| `after` | string | the state the film is left in |
| `why_motion` | string | why this needs motion or time rather than a still |
| `fallback` | string | what stands in if the event cannot be built as drawn (a quieter, still-true version) |
| `proof_refs` | string[] | claim or source ids that make what it shows true (may be `[]` when it shows nothing factual) |
| `must_preserve` | string[] | what a builder must not lose or swap (exact sentence, colour, order, timing) |

Optional: `shot_ids` (string[]), `kind`, `depends_on`; requirement, owner, scope and objects live under
`extensions.creative_thinking`.

```json
{
  "id": "sentence-becomes-films",
  "before": "One typed sentence sits alone in the dark prompt box.",
  "change": "The caret sends it and the sentence splits into three film posters that slide into the Story row.",
  "after": "The row holds three finished-looking stories; the box is empty again.",
  "why_motion": "The split and the slide show one input becoming several options, which a still cannot.",
  "fallback": "A hard cut from the box to the three posters, held for one second.",
  "proof_refs": ["claim-three-stories"],
  "must_preserve": ["the typed sentence reads word for word", "three posters, never two or four"]
}
```

## Integration calls (plain data)

```js
import { validateCreativeBrief, creativePinsCurrent, creativeSlice, creativeReadiness } from "./lib/creative-contract.mjs";

// 1. Structure + refs, with ids the coordinator already loaded.
const v = validateCreativeBrief(brief, {
  expectedPins: { brief: briefDigest, story: storyDigest },   // full sha256; null = nothing approved yet
  knownIds: { sources: sourceIds, beats: beatIds, claims: claimIds, shots: shotIds },
});
// v.ok === false -> v.errors [{code, path, message}]; v.missing lists absent required parts.

// 2. Is the brief still anchored to what is approved now?
const { current, stale, missing } = creativePinsCurrent(brief, { brief: d1, story: d2, look: d3 });

// 3. What one worker needs (mandatory facts never truncated; the rest by reference).
const { mandatory, references, omittedOptional } = creativeSlice(brief, { role: "builder", beatIds: ["beat-2"], shotIds: [] });

// 4. Can this stage proceed? review = creative/reviews/<stage>-rN.json (+ round).
const { state, reasons } = creativeReadiness({
  brief, stage: "storyboard", review,
  expectedPins: { brief: d1, story: d2, look: d3 },
  expectedArtifactDigests: { "storyboard/board.json": d4 },
  waiver: null, // or {kind:"aesthetic", source_action_id, artifact_digest} from a real user action
});
// ready | revise | blocked | needs_user | not_reviewed
```

Modes: `proposal` (research/story writers, claims no story/look/storyboard pin), `story` (brief pin), `look` (brief,
story, look pins), `build` (all four incl. storyboard). A pin with `source_action_id: null` needs a written
`legacy_basis`.
