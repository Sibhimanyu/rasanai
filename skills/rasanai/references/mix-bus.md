# Mix bus: one definition for every route

Status: implemented_unvalidated. Nothing here was rendered, played or measured. Code: `scripts/lib/mix-bus.mjs` (plan, aggregation, renderer boundary) and `scripts/lib/mix-receipt.mjs` (receipt identity). Evidence base: `.context/addenda-20261027/evidence/dropout-trace.md` and `.json` (source reading only).

## What this is and is not

The trace names no cause for the reported bed dips around ordinary effects. This lane therefore ships only cause-agnostic guardrails: explicit ids and groups, an explicitly disabled carve on a bed with no voice, one unit convention, `data-volume` 1 when a lane is present, a lane under 32 points, speech reductions derived from voice spans only, and receipt additions. None of them is a repair for a named mechanism. Candidates the trace marks `needs_runtime_evidence` stay pending checks (below), and no candidate is called the cause.

## Units

dB everywhere inside a plan (`reductions[].depth_db`, `music_automation` points `[t, dB]`, `buses.*.base_db`, cue `gain_db`). `dbToLinear` / `linearToDb` (exported from `mix-bus.mjs`) are the only conversion pair; conversion happens only in `renderBoundary`:

| Route family | Static level | Lane |
|---|---|---|
| hyperframes, ffmpeg-reel | `data-volume` linear | `data-automation` `{version:1, lanes:[{target:"volume", points:[{t,v}]}]}`, `t` seconds from clip start, `v` linear; the lane carries the ABSOLUTE linear level and `data-volume` is 1, so level x lane never compounds |
| ffmpeg-quick | `volume=<dB>dB` per input | `volume='pow(10,(<dB expr>)/20)':eval=frame` (ffmpeg reads an expression as linear amplitude) |

Time is score time (`basis: "score"`), never an assumed frame rate.

## Policy table (what the plan does by default)

| Situation | Music behaviour | Where decided |
|---|---|---|
| Ordinary click / toggle / small accent | unchanged. `ordinary_sfx_duck` is always `false`; a reduction request on a non-prominent cue is ignored with flag `ordinary-reduction-ignored` | `busPlan` |
| Movement effects | balanced by cue selection, gain, timing and tonal range (AUD-SFX lane), not by a music dip | outside this lane |
| Prominent reveal / impact | optional bounded reduction (cap 4 dB, short attack/hold/release) ONLY with a stated reason (`reduce_music.reason`), else flag `reduction-reason-missing` | `busPlan` |
| Voiceover | smooth space: depth from the measured bed-to-voice gap when `music.baseline_gap_db` is given (target gap 12 dB, `target_gap_db` overridable), otherwise 5 dB (3 dB for a music-led direction, 4 dB sparse); merged short gaps, attack 0.3 s, hold 0.4 s, release 0.8 s via `duckEnvelope`; a bed already at the target gets no extra reduction | `busPlan` |
| Dramatic silence | only an authored interval (`silence_windows[]` with `authored: true` and `reason`); otherwise ignored with flag `silence-not-authored` | `busPlan` |
| Several effects at once | handled on the effects bus and by overlap; the music sees at most the deepest single reduction | `aggregateReductions` |

## Bounded aggregation

`aggregateReductions(list, policy)` uses policy `bounded-max`: each reduction is a trapezoid (attack before the span, hold, release) and the lane is the DEEPEST of them at each instant, clamped to `max_total_db` (default 12). It never sums or multiplies independent reductions. Speech reductions come only from voice span ids; a cue id offered as a voice source is rejected (`speech-source-rejected`). A reduction is a gain lane on the running bed: never a trim, restart or re-instantiation, so the source playhead and arrangement continue.

## Renderer boundary and carve

`renderBoundary(plan, route, {renderer, voice_ids})` returns element specs with explicit role-bearing ids: `music-bed` (role music, group `music`), `voice-*` (group `voiceover`), `sfx-<n>` (group `sfx`, `speech_source:false`). The bed always carries `data-fx-carve` `{"enabled":false}` (nothing carves it; the plan's own lane is the only music reduction), and `carve.voice_sources` records which element ids are the voices for read-back. Effects get their own static linear level, no lane, no carve.

Assumed mixer branch (stated, not controlled): ffmpeg routes use `amix ... normalize=0:duration=longest:dropout_transition=0` with explicit per-input gain; HyperFrames routes depend on the engine's own amix branch, recorded in the receipt, not claimed as controlled. Headroom before summing and final loudness/true peak follow the destination profile (`PROFILES` in `mix-receipt.mjs`, `masterFile` in `audio.mjs`, unchanged) with measured evidence; loudness conformance is not a balance claim. Motion and optical decisions stay independent of incidental gain changes.

## Receipt (additive)

`mixInputs` gains optional `source` ({id, file_digest, section}), `stem_identity` ({name: "stem" | "stereo_file"}), `processor` ({renderer, version, filter_graph_digest}) and `html_audio` (digest of the audio attributes of `index.html`, from `audioAttributesDigest`). A key exists only when given, so legacy inputs keep their old digest byte for byte and old receipts stay readable. `receiptMatches` compares the new keys too; a cached filename never establishes currentness (`reuseDecision` still needs receipt match and the recorded file). `receipt()` optionally records `processor` detail (incl. `ffmpeg_version`) and `audio_file`.

Single automation path: `audio/automation.json`, written by ENG-INT-2 as `automationRecord(busPlan(...))`; `currentInputs` reads it and does NOT read `audio/mix-state.json` (mute/solo is audition-only and never reaches delivery). `currentInputs(run, {processor, html_audio:true, source, stem_identity})` is opt-in for the new fields.

## Route coverage after this lane

| Route | Reached by the plan | State |
|---|---|---|
| R1 full-crew film | `renderBoundary(plan,"hyperframes")` for `audio_meta` bed volume and sfx entries | proposed: ENG-INT-2 calls it in `S/video.mjs audio-lock` (bed `volume` from the spec, ids/groups carried to the workflow assemble step; repo cannot write `<audio>` there) |
| R2 reel | same, lane replaces hand arithmetic at `S/reel.mjs` ~985-1020 (`data-volume` 1, lane absolute linear, under 32 points) | proposed |
| R3 handoff host | `S/handoff.mjs` ~359: one level, not `data-volume` 0.9 x lane | proposed |
| R4 quick film | `hostHtml` and `audioArgs` both from one `renderBoundary` (route per mixer) of the same plan | proposed |
| R5 presenter | read-only here, no lane today (`data-volume` 1) | note to the lead |
| R6 post | `masterFile` / `renderPlan` unchanged (no repo-owned finding needs a change) | unchanged |

## Pending runtime checks (trace candidate states, copied verbatim, none confirmed)

- C1 carve/classification takes an SFX for the voice: needs_runtime_evidence
- C2 compounded attenuation: ruled_out_by_source (SFX-linked, R1, R4-host)
- C3 normalization by active inputs: needs_runtime_evidence (R4 ffmpeg path only)
- C4 automation fallback retry: ruled_out_by_source (R1, R4-host, R5: no lane)
- C5 preview vs delivery graph: needs_runtime_evidence
- C6 unit mismatch: ruled_out_by_source (SFX-linked)
- C7 SFX feeding a speech duck: ruled_out_by_source
- C8 SFX truncates or restarts the bed: ruled_out_by_source
- C9 (added) master limiter on a summed mix: needs_runtime_evidence
- C10 (added) authored bed breaks coincide with planned SFX: supported_by_source (a mechanism exists in source, not a diagnosis)
- C11, C12, C13 (added, not SFX): supported_by_source

Settling any `needs_runtime_evidence` item takes the authorized AUD-13..19 reproduction (measure the bed per 50 ms window around each effect against the bed-only variant, per stem, with ffmpeg and engine versions recorded). Until then nothing here is a repair for any of them.
