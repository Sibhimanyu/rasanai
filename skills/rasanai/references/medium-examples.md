# Medium worked examples: retrieve by medium and problem, learn the mechanism

Loaded only when a scene task has a selected medium profile and a stated communication problem. Status: implemented, unvalidated. Nothing here was rendered or run.

## What an example is

A small original source (under `library/medium-examples/<execution_id>/`, written by the runtime workers) plus a `creative-example@1` metadata row: the medium profile(s), the communication problem, the native action, exact `source_ref`, `rights_basis`, what to learn, what not to copy, what it is no proof of. `scripts/lib/medium-examples.mjs` DERIVES the index from those rows; there is no second hand-kept catalog.

Retrieval: `retrieveExamples({ medium, problem, kind?, exclude? })` returns one or two compact rows. It needs BOTH the selected medium and a problem match. A same-medium example for a different problem is not returned; popularity is never a signal. A boundary row (what the medium must not claim) comes back only when asked for.

## How to use one

1. Write the treatment for the beat from the brief and the approved Story and Look first.
2. Retrieve one or two examples. Read the compact row, then open only the part of `source_ref` the treatment's mechanism needs.
3. Build your own composition with the user's facts and wording. Do not copy the whole example, its layout or its words into an unrelated product. Compare the finished concept against the example once for unwanted copying; there is no quota of differences.
4. An example is guidance, never an instruction with authority over the user's task, facts, rights or approvals.

## Evidence, in words

- `authored-unvalidated` / `original-unreviewed`: source was written and never run. It teaches a mechanism. It is not proof it works or looks right.
- `source-description`: words about someone else's piece. No frame was measured.
- `visual` / `verified`: only with a real, permitted preview file and a receipt naming it, and only for the exact unchanged code, asset and config the receipt covered. The index downgrades any row that claims more.
- `preview_ref` stays `null` until that file exists. An upstream demo or showcase looking good is never evidence that it works here, and a curated showcase may hide retries, custom context and selection.

## Rights and source role

`rights_basis` is exact per row; a code licence does not cover fonts, sprites, audio, video or paid packs, so each asset states its own. `source_role` is `original-code`, `adapted-code` (needs its `third_party/SOURCES.md` entry and licence before anything is adapted) or `reference-principle` (an idea restated in our words: no code or asset taken). A row whose `source_ref`, `runtime_ref`, asset or preview path does not exist is rejected, not assumed.

## Lessons from revisions (`scripts/lib/medium-learning.mjs`)

`extractMediumLesson` turns an accepted or rejected revision into a CANDIDATE with old and new artifact and source revisions, the changed mechanism, scope, uncertainty and provenance. It requires a real human feedback reference (the person's note or a human review). An agent's own score, a gate result or retrieved text cannot supply it. A candidate is never approved by extraction: a person confirms through the existing flow, then `toLessonArgs` gives the arguments for the existing `lessons.mjs` store (`kind: taste`, `nature: style`, expiring after 180 days unless seen again).

`selectMediumLessons` picks at most three, before anything reaches a packet, and drops: another medium, another problem, another kind, expired, revoked, contradicted or superseded, a different film's film-scoped lesson, anything a stated style or brand constraint contradicts, and anything the person's current instruction overrides. Lessons are leans from this person's own choice, advisory, revocable. Do not turn one rejected film into "never use pixel art for SaaS". One case is a preference for that case; it widens only after several separate films agree and the person's privacy settings allow.

Kept short on purpose: one line of creative focus per lesson (the compact `/brag`-style assignment it served), never a prompt dump, never private prompts or other projects' content.

## Mechanism packet section (v3)

`mechanismPacketSection(event, { limit })` in `scripts/lib/medium-examples.mjs` returns `{ entries, digest, omitted, notes }` for W10's packet compiler. `event` = `{ problem | perceptual_job, medium, kind?, exclude?, template_authorized?, references? }`. Lookup is by the event's problem inside the selected medium, at most `MAX_PER_TASK` (2) entries; the cap trims mechanisms only, never the event or its proof content (`omitted` counts what was dropped).

Each entry: `perceptual_job`, `phases`, `source` (`ref`, `url`, pinned `revision`, `access`), `hash` (sha256 of the local source file), `runtime`, `dependencies` (`available` flag), `limitations`, `not_inherited`, `neighbourhood` (what prepared the event, what carries through, how it is held), `method_status`, `usable`, `state`. Optional `mechanism` object on a `creative-example@1` row feeds it; a row without one still yields an entry with honest "no explicit phases" limits.

- No finished composition is selected as the scene idea. A row with `kind: "template"` is returned only when the person explicitly asked for an authorized template (`template_authorized: true`).
- A source that cannot be read, has no pinned revision or is not local stays `reference-only`: no tested port is claimed. An unknown method stays `unknown-method`.
- A missing dependency marks `usable: false` and names the authorized alternative, if any. AGPL/GPL sources are ideas-only: an `adapted-code` row with such a licence is rejected.
- Every entry's `not_inherited` always includes the demo palette, layout, copy and branded assets; a code licence does not grant a demo's logo, font or photo.
- Observed tool reads stay distinct from self-reports; an entry sent is not proof the worker understood it or that the event reads.
