# Reference reuse: what each outside source teaches and where it stops

Status: implemented_unvalidated. Source facts are from `.context/batch2/spec/07_REPO_AUDIT_AND_SOURCES.md` (S01 to S03 freshly consulted, the rest inherited and not re-audited) and `skills/rasanai/third_party/SOURCES.md`. No outside code, text, asset or preview is bundled by this lane. Anything adapted later needs its own SOURCES.md entry and licence first (`INTAKE.md`); a code licence never covers demo videos, fonts, characters, music or paid packs.

| Source | Take (mechanism, in our words) | Do not take | Evidence limit |
|---|---|---|---|
| /brag planning guide (latent-spaces/brag, step-2-plan) | A compact product-specific creative assignment built on real user-flow material, not a list of sections. Kept as one short `focus` line on a lesson. | Its fixed duration range; collapsing Story/Look approvals | Read via public page; local repo content wins over a cached page |
| Lemo-Opuscar pixel-rpg, living-screencast, DIRECTOR (lemomo-ai/lemo-opuscar, MIT code and docs; demo films/stills CC BY 4.0) | Medium-specific behavior: deliberate low-resolution construction, palette and material behavior, a pixel character beside a sharp product UI, anchored relationships, materials/camera/motion/sound as one language | Output FPS, blink, game-UI, soundtrack, story, fixed shot/camera/caption rules, characters, scenes, fixed review or approval shortcuts | Blobs recorded in 07 (S01, S02); stills carry their own licence |
| Awesome Opus collection (yihui-dev/awesome-opus5-5-videos) | Study the prompt and result for a mechanism; bounded creative freedom | Any claim that a short prompt reproduces a showcased result | A showcase omits retries, custom context and selection; not a success-rate or token-efficiency study |
| ClaudeAnimationBase (JohnHeibel) | Readable acting: cause, then reaction, then timing | Handmade, no-text, always-moving as universal rules | Inherited, not re-audited |
| PDoomVideo (JohnHeibel) | A coherent world, recurring actions, isolated chapter production | Treating music or lyrics as missing; one premise for every launch film | Inherited, not re-audited |
| mg-styles-15, opus-video-skills, onetake, Cinetic, Howseen, Remocn, OpenFilm | See 07 table: mechanics with examples, independent review, connected actions | Published model scores as human preference; compulsory continuous shot; random technique draws; renderer rewrites | Ideas only pending licence review where 07 says so |

## Rules the code enforces (`scripts/lib/medium-examples.mjs`, `medium-learning.mjs`)

1. Examples come from the runtime workers' own `creative-example@1` rows; the index is derived. A row with a nonexistent source, runtime, asset or preview path is rejected.
2. Retrieval needs the selected medium AND a communication-problem match, returns one or two rows, and keeps `preview_ref` null until a real permitted file and receipt exist.
3. Every row records its exact rights basis and a source role (original code, adapted code, reference principle). An upstream demo's quality is never evidence of local success.
4. A lesson needs a real human feedback reference. Agent self-scores cannot supply one. It records old and new revisions, the changed mechanism, scope and uncertainty, expires as a style lesson, and never overrides facts, rights, a stated style or brand constraint, or the current user instruction.
5. No category ban from one rejected film; no lesson crosses to another project, brand or series; no second memory file.

## Open items

- Nothing here was run, rendered or benchmarked. Testing waits for the owner's approval.
- 07 does not give blob hashes for the inherited rows; re-audit them before anything is adapted.
- The medium example directories did not exist when this lane was written; the index returns `absent: true` and no rows until M04/M05/M06 land theirs.
