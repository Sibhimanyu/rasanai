# Plan 07 - Sound, music and voice as part of the film

**Repository:** `Sibhimanyu/rasanai`  
**Executor:** Sonnet implementation lead and scoped Sonnet workers  
**Sequence:** 07 of 14 implementation stages; coordinator is Plan 00  
**Prerequisite:** Plan 06 integrated as implementation, not yet pipeline-tested.  
**Research snapshot:** 2026-10-25; public HEAD inspected at `20ea14748daaee007cb4eaf5ba8aee91c09b1c4a`. Local HEAD wins.

## Execution and verification policy

Implement this plan inside the actual RasanAI checkout. Read `00_EXECUTE_IN_ORDER.md` and the predecessor handoff first, then only the repository files relevant to your assignment. Preserve existing working features and uncommitted changes. All proposed filenames/APIs below must be reconciled with the local checkout; extend an equivalent existing implementation instead of creating a duplicate.

**Testing requires the user's explicit approval, including in Plan 14.** Implement Plans 01-13, integrate the changes, and author fixtures/tests without executing them. Then stop at `awaiting_test_approval`, report the implemented candidate, and present the proposed testing scope, commands and resource/usage implications. Do not enter Plan 14 automatically. Only a subsequent explicit user instruction approving testing authorizes its agreed scope; this plan, silence, a general instruction to continue implementation, or approval of a film's Story/Look does not.

Until that approval, no unit/integration suites, agent film trials, browser/render smokes, GUI QA, live provider probes, end-to-end runs or benchmarks may run, whether directly, through workers, hooks or CI. Read-only inspection, syntax/schema parsing, type checks and compilation remain permitted only when they execute no tests, workflows or runtime probes. Hold any operation that would trigger tests; do not disable safeguards to bypass them. Record implementation as `implemented_unvalidated`. Preserve normal product runtime safeguards and creative approvals. See [Testing approval gate](TESTING_APPROVAL_GATE.md).

The implementation lead owns shared entrypoints and schema changes. Use parallel Sonnet workers for genuinely independent file-owned tasks; do not manufacture concurrency or let workers edit the same shared files. No remote push, public release, paid dependency purchase, new paid generation, destructive migration or permission escalation is authorized by this document alone.

## Repository entrypoints to locate

Start with these current or previously documented locations; verify their local equivalents before editing. Read only the symbols relevant to your assigned lane. Shared entrypoints remain lead-owned.

- `skills/rasanai/scripts/sound.mjs`
- `skills/rasanai/scripts/music.mjs`
- `skills/rasanai/scripts/voice.mjs`
- `skills/rasanai/references/sound.md`
- `skills/rasanai/scripts/events.mjs`

## Outcome

Move beyond a music bed and one whoosh per cut. Give the film a coherent sonic intention, intelligible speech and purposeful accents while preserving its shared timing authority. Reuse the existing beat analysis, music fit, synthesis, voice and mix utilities.

## A1. Compile a small audio direction brief

From the approved communication assignment and look, define the role of voice, music, sound effects, ambience and intentional silence. Record a limited sonic palette and recurring motif where appropriate. Distinguish a silent deliverable from an audio-generation failure. Do not require every visual hit to have an effect.

S01 and S06 support planning sound with the picture rather than attaching it after all visual decisions. The proposed cue structure below is RasanAI's original engineering design.

## A2. Use one cue and timing source

Extend the current authored score/SFX plan and derive events through `events.mjs`. Each cue references a stable visual or narrative event, source asset, role, onset/offset, gain envelope, spatial intention and confidence. Do not create a second editable audio timeline.

Support purposeful anticipation and trailing sound where editorially appropriate. A default transient can land on a picture event; an intentional lead or lag records its offset rather than being rejected by a universal one-frame sync rule. Keep hard synchronization requirements only for cues explicitly designated synchronous, spoken-word highlights and relevant lip movement.

Protect silence windows from automatic fills. Distinguish emotional silence from accidental dead audio. Avoid forcing a riser and impact before every change.

## A3. Fit music structurally

Respect phrases, bars, sections and a deliberate ending. Use existing analysis but label uncertain beat/section estimates. Do not fabricate tempo for a track where detection fails. Prefer the user's supplied track; keep music-led films tied to it unless trimming is authorized.

For other films, choose music that supports the communication, not just an adjective such as "premium." Fit edits on musically appropriate boundaries while preserving proof/readability. Do not loop an obviously short track endlessly beneath a longer film. Do not force all cuts to a beat or hardcode one dramatic drop time.

Store track rights, edits, gain automation and version. Changing a track triggers a bounded timing impact analysis, not automatic story regeneration. Do not claim procedural music is automatically copyright-free; its samples and tools still need provenance.

## A4. Voice quality and direction

Bind narration to approved copy and a pronunciation glossary containing user-confirmed names and technical terms. Reuse per-line/per-segment voice caching keyed by text, voice, model/version, locale and relevant settings. A local wording change regenerates the impacted segment and any genuine dependent timing.

Compare actual transcribed words with the intended script as a check with uncertainty, not infallible truth. Highlight missing/changed names and material words. Preserve the user's selected voice and authorization; never clone someone's voice by default. Support no-VO films without treating them as incomplete.

## A5. Mix and delivery profiles

Keep dialogue understandable through automation and appropriate ducking; avoid pumping, clipping or excessive compression. Store separate stems when available. Use configurable destination loudness/true-peak profiles rather than declaring one online loudness number a universal standard. Preserve the repository's existing default as a named house profile until measured and deliberately changed.

Measure integrated/short-term loudness where appropriate, true peak, clipping, channel count, sample rate and duration. Silence-only material needs explicit handling because loudness may be undefined. Preserve music/VO tails through clip assembly. Check mono compatibility and phone-speaker readability in the final validation stage; do not claim these from waveform metadata alone.

## A6. Studio control without extra approval gates

Inside Storyboard/Final, expose audition, mute/solo, swap permitted music/voice and a concise sound note. Keep technical mix controls secondary. A sound request creates a versioned targeted revision with a visible effect on timing. Never add a compulsory "approve every cue" step.

## Parallel lanes

Separate audio-brief/cue metadata, music fit integration, voice/pronunciation caching, mix/export configuration and native control payloads. Lead owns score/event changes and timing reconciliation with Plan 05. Author fixtures without playing or rendering them now.

## Implementation handoff

Deliver audio direction routing, shared cue references, intentional-silence support, segment caching, real mix/stem export integration and error states. Register A01-A07. The future pipeline uses approved actual audio before final storyboard timing is committed, even though this implementation stage occurs after visual modules.

## Deferred verification

In 14 test missing audio, voice mismatch, pronounced names, track too short, cut tail, spoken-word timing, intentional offset/silence, clipped mix, mono downmix and a local line edit. Listen to at least the core reference films; numerical loudness checks cannot establish professional sound design.

## A7. Keep revisions acoustically continuous

Per-line voice caching is not permission to splice arbitrary clips blindly. Record sample rate, channel layout, surrounding timing context, leading/trailing silence and permitted handles. Reconcile replaced speech with neighboring pauses and music automation. Different voice/model settings invalidate compatible neighboring assumptions; do not claim an identical voice from an unchanged display name.

Describe intended audiovisual offset in the cue contract and check against that target, not always against zero. Put picture onset, speech/word timing, SFX onset and measured acoustic peak in separate fields when relevant. A clip's loudest sample is not automatically its perceptually correct synchronization point.

Preview and delivery mixes identify their exact score, stem and automation digests. Reuse a mix only when all relevant inputs match. A final exported video must not silently use the old voice track because its cached filename is unchanged. These are implementation requirements; listening, mixing and generating sample audio wait for user-approved Plan 14.

## Revision 2 handoff requirement

Update the relevant row in [INTEGRATION_CLOSURE_MATRIX.md](INTEGRATION_CLOSURE_MATRIX.md) with actual source wiring and pending case IDs. Read only the applicable [rule migrations](RULE_MIGRATION_MAP.md) and [reference decisions](REFERENCE_REUSE_MATRIX.md). These documents do not authorize testing.

## Package navigation

[Coordinator and global policy](00_EXECUTE_IN_ORDER.md) | [Source ledger](RESEARCH_SOURCES.md) | [Deferred cases](DEFERRED_TEST_MATRIX.md).

Next: [Token-efficient production and selective skill routing](08_TOKEN_EFFICIENCY_AND_SKILL_ROUTING.md). Continue after integration; do not run pipeline tests between stages.
