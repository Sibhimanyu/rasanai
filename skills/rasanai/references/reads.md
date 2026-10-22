# Reads: what the viewer must notice, in what order, for how long

One source of truth for the timed `reads[]` of a scene (W4). It extends `states[]`, `result-unheld-plan` and the text holding time of `craft.md` section 2; it is not a second storytelling system, and no gate here proves that anyone understood anything.

## The contract (motion/score.json, per scene, optional)

```json
{ "id": "03", "duration": 4.2, "reads": [
  { "id": "notice",   "t0": 0.0, "t1": 0.8, "kind": "notice",   "subject": "actor sees falling cup",      "visual_cue": "eyes turn to cup" },
  { "id": "action",   "t0": 0.8, "t1": 2.0, "kind": "action",   "subject": "actor reaches",               "visual_cue": "crouch then reaching arm" },
  { "id": "reaction", "t0": 2.0, "t1": 3.3, "kind": "reaction", "subject": "actor realizes cup is gone",  "visual_cue": "gaze, take, final pose" } ] }
```

- `kind`: `notice | cause | action | reaction | result | text`. A `text` read carries `text` (the words on screen); its hold is checked with `scripts/lib/reading.mjs` `readTime` (0.6 s + 0.3 s per word, CJK by character), never a second formula.
- Times are **scene-local seconds** inside `0..duration`, `t1 > t0`, listed earliest first. Gaps are allowed (the pose may simply hold).
- Reads may overlap only with a written reason: `parallel_with: "<why they read together>"` (8+ characters, or the id of the other read) or `continuity: "<type>"` (a carrying seam kind, `motion-carried`, `secondary-motion`, `settle`).
- `reads_waived: "<12+ char reason>"` on a scene opts it out when the film requires reads.
- `reads_required: true` on the score (or a cartoon/evidence run) asks for reads on every scene. Product films and legacy scenes without `reads[]` pass untouched.

## The check

`node scripts/reads.mjs check --run "$RUN" [--score file] [--json]` (also run by `crew.mjs check --role motion-director`). Exit 0 pass, 2 invalid (unknown kind, `t1 <= t0`, outside the scene, empty subject or cue), 1 could not run. All named findings are **warnings** until calibrated on good films and weak fixtures, and every one names the scene, the scene-local (and film) timestamp and a suggested edit:

| Warning | Meaning |
|---|---|
| `missing-read` | a dramatic scene in a film that writes reads, or any scene when reads are required, has none |
| `reads-order` | reads not in time order, or a reaction/result before its cause/action |
| `competing-reads` | two reads overlap with no reason (a silent text read against a hero action is the common case) |
| `unheld-reaction` | the payoff is visible under 0.6 s, or starts too near the scene end (the held-result rule of `lib/scene-contract.mjs`, unless a carrying seam hands it on) |
| `text-unreadable` | a text read is held shorter than the reading-time formula needs |
| `no-visible-result` | a cause/action with no reaction or result read after it, or a payoff with no visual cue |

## The visual review (a person or critic looks)

`node scripts/reads.mjs sheet --run "$RUN" --scene 03 --file <scene composition | draft.mp4> [--offset s]` writes `RUN/review/reads/03-sheet.png` (entry, action, reaction, hold: four labelled stills, through `crew.mjs strip` and the labelled grid of `frames-lib`) and `03-strip.png` (a short strip around the cause-to-reaction transition), plus `03-sheet.json` with the times. The critic and frame juror answer the four questions in `agents/critic.md` on those images: each answer is **subjective**, cites what is visible and gives a timestamp.

Idea from ClaudeAnimationBase's "write the reads" (MIT, idea only; our code): `third_party/SOURCES.md`.
