# Deferred verification matrix - Plan 14 requires explicit user approval

This is a **specification of cases to author and later run**, not a record of tests already present or executed in RasanAI. During Plans 01-13 the responsible worker maps these cases to actual fixtures/test code and records their paths. Only after explicit user approval may Plan 14 execute the agreed cases and record observed results and evidence. Completing Plan 13 does not authorize execution.

Initial state for every row: `pending_implementation_and_user_approved_validation`. Use `not_run`/`blocked` when actual execution is unavailable. After implementation, unapproved cases stay pending at `awaiting_test_approval`. No row starts as passed. [Testing approval gate](TESTING_APPROVAL_GATE.md) controls all execution. Research-source IDs in `RESEARCH_SOURCES.md` are separate from these `planNN/case` identifiers.

| Case | Scenario | Expected evidence/behavior |
|---|---|---|
| plan01/F01 | Legacy stage mapping | Old animatic/preview runs map to the intended logical stage without losing decisions. |
| plan01/F02 | Approval invalidation | Changing an approved Story/Look version invalidates only genuinely dependent approvals and artifacts. |
| plan01/F03 | Single session writer | Native actions use the existing locked queue; no view directly rewrites live session state. |
| plan01/F04 | Schema migration | Older fields migrate idempotently; unsupported required versions fail explicitly. |
| plan01/F05 | Artifact version binding | A worker result built against an old digest cannot replace current accepted output. |
| plan01/F06 | Reversible adoption | Existing films and uncommitted user work remain intact after upgrade and rollback. |
| plan02/B01 | Communication route | General launch, feature, tutorial and identity briefs select distinct communication assignments. |
| plan02/B02 | Ambiguous launch | No invented new release or capability; the visible assumption is a general introduction unless supported otherwise. |
| plan02/B03 | Evidence integrity | Claims retain sources, dates and qualifications; missing evidence is reported rather than invented. |
| plan02/B04 | Brand authority | Approved user brand assets override generic look suggestions without silent font/logo substitution. |
| plan02/B05 | Reference boundary | Measured reference observations, interpretation and reuse rights are separately represented. |
| plan02/B06 | Audience profile | Placement, sound, locale and accessibility requirements reach downstream packets. |
| plan03/S01 | Format contrast | The same product yields appropriate different structures for launch, feature, tutorial, explainer and identity briefs. |
| plan03/S02 | Copy versus label | Internal labels do not leak into public headings or treatment titles by default. |
| plan03/S03 | Conditional drama | A valid demonstration passes without a forced villain, reversal or fixed-percent peak. |
| plan03/S04 | Proof scope | Broad promises receive representative breadth; single-feature films remain focused. |
| plan03/S05 | Meaningful visual events | Beats describe a useful before/change/after, not unrelated nouns over decoration. |
| plan03/S06 | Coherent alternatives | Concise choices differ meaningfully without creating polished rejected boards or animations. |
| plan03/S07 | Truth-preserving review | Factual violations fail while legitimate shared benefits or suitable abstraction are not rejected mechanically. |
| plan03/S08 | ChatGPT regression | A real verified brief produces concrete communication; the example script is not hardcoded as the only passing answer. |
| plan04/L01 | Comparable specimens | Look alternatives use the same approved content and show enough detail to choose. |
| plan04/L02 | Progressive commitment | Rejected looks do not receive a full storyboard/build by default. |
| plan04/L03 | Visual propagation | Chosen tokens and component rules consistently reach boards, scenes and variants. |
| plan04/L04 | Continuity meaning | Persistent motifs do not falsely imply shared location/time/function between unrelated scenes. |
| plan04/L05 | Brand-faithful variation | The film varies hierarchy and motion purpose without unapproved style drift. |
| plan04/L06 | Look revision | Changing a look preserves story meaning and invalidates the appropriate downstream visual work. |
| plan05/E01 | Stage boundary | Full storyboard generation waits for selected Story and Look, including explicit inherited choices. |
| plan05/E02 | Panels and actions | A complex beat can use multiple panels; a simple beat is not padded with unnecessary frames. |
| plan05/E03 | Timing authority | Reconciled shot/audio timing is authored once and event/playback data are derived. |
| plan05/E04 | Reading time | Key UI/copy/proof remains readable; failures receive specific repairs rather than generic speeding up. |
| plan05/E05 | Editorial relationship | A cut or transition serves the intended relationship; no mandatory morph or artificial peak. |
| plan05/E06 | Audio reconciliation | Actual voice duration changes only the valid timing dependencies before storyboard approval. |
| plan05/E07 | Animatic fidelity | Timed board playback reflects real ordering/audio and is clearly labeled rough. |
| plan05/E08 | Structural revision | Reorder/remove/extend changes preserve claims and update dependent timings and approvals. |
| plan06/V01 | Runtime primitives | Exposed ready mechanics have real implementations and execute in the existing engine. |
| plan06/V02 | Seek behavior | Required frame states remain reproducible on out-of-order seeks in the declared environment. |
| plan06/V03 | Offline render | Staged local assets suffice; unexpected network/secret access is refused. |
| plan06/V04 | Generated-plate provenance | Accepted media retains actual workflow/model/input/output identity and rights. |
| plan06/V05 | Provider uncertainty | A timed-out submission is reconciled rather than blindly repeated. |
| plan06/V06 | Tracking distinction | Boxes, quadrilaterals, masks and depth are not treated as interchangeable capabilities. |
| plan06/V07 | Screen replacement | Real supported corner tracks preserve perspective and offer correction/failure states. |
| plan06/V08 | Occlusion | Supported masks put graphics behind foreground subjects without claiming a box is a silhouette. |
| plan06/V09 | Character canon | Identity/performance persists across shots; missing rigs/lip support are honestly degraded. |
| plan06/V10 | Optional capability | Unavailable model/runtime/license dependencies do not break ordinary code-rendered films. |
| plan07/A01 | Intentional sound | Cue density and silence reflect the brief rather than automatic whooshes on every cut. |
| plan07/A02 | Shared event timing | Audio references the authored score/events without a competing clock. |
| plan07/A03 | Offsets and tails | Intentional lead/lag, phrase boundaries and audio tails survive assembly. |
| plan07/A04 | Voice fidelity | Approved narration, meaningful words and pronunciation are checked with uncertainty surfaced. |
| plan07/A05 | Local regeneration | A line change reuses valid voice segments and updates only genuine timing dependencies. |
| plan07/A06 | Mix integrity | Actual loudness/peaks, mono behavior and intelligibility are checked against a named profile. |
| plan07/A07 | Stem and silence delivery | Real stems are exported correctly; silence and missing-audio cases are distinguished. |
| plan08/K01 | Actual injected context | Measure packet plus harness/project/skill injection, not just the short delegation message. |
| plan08/K02 | Selective retrieval | Only relevant format and technique guidance loads for the task. |
| plan08/K03 | Mandatory facts preserved | Budget compression never drops key claims, qualifiers, privacy or ownership constraints. |
| plan08/K04 | Artifact reuse | Valid accepted outputs can skip work; stale facts or approvals cannot. |
| plan08/K05 | Cache isolation | Unauthorized project material cannot leak through cached packets or summaries. |
| plan08/K06 | Model/setting mapping | Discover supported model identities and reconcile Fast/lean/deep policy without silent quality downgrade. |
| plan08/K07 | Honest telemetry | Unknown counters remain unknown; cached input, retries and output are accounted for correctly. |
| plan08/K08 | Efficiency comparison | Report matched total usage and quality, not a hypothetical context-only saving. |
| plan09/P01 | Dependency readiness | Jobs start only when their inputs and approval versions are ready. |
| plan09/P02 | Useful parallelism | Independent groups overlap while tightly coupled shots keep coherent ownership. |
| plan09/P03 | Resource limits | Model, render, encode and optional neural workloads obey separate cross-film limits. |
| plan09/P04 | Lease fencing | An obsolete worker cannot publish after lease replacement or input revision. |
| plan09/P05 | Transitive keys | Shared fonts/components/time/grade dependencies invalidate every affected output. |
| plan09/P06 | Atomic cache | Interrupted or corrupt artifacts never appear as valid hits; active artifacts are not evicted. |
| plan09/P07 | Boundary handles | Transitions, global-time signals and shutters match a clean full render. |
| plan09/P08 | Media assembly | Frame counts, PTS, audio continuity and alpha/color conventions remain correct. |
| plan09/P09 | Fallback truth | Unsupported fragment isolation triggers an explicit larger rerender, not incorrect reuse. |
| plan09/P10 | Measured throughput | Record critical path, costs and losing cases across bounded concurrency/cold/warm settings. |
| plan10/U01 | Five-call journey | Native screens present Brief, Story, Look, Storyboard and Final as distinct decisions. |
| plan10/U02 | Back navigation | Revisiting a stage does not discard decisions or start unintended regeneration. |
| plan10/U03 | Stable panels | Choices/player/actions remain usable with internal scrolling at small and large window sizes. |
| plan10/U04 | Revision intent | Feedback targets the intended story/look/shot/property scope. |
| plan10/U05 | Pointer transform | Letterbox, zoom, crop, fullscreen and high-DPI coordinates select the correct element. |
| plan10/U06 | Stale edits | Old build digests reject/conflict instead of modifying a different object. |
| plan10/U07 | Undo and redo | Actual source/checkpoints and downstream artifacts match the visible version change. |
| plan10/U08 | Progress truth | Overlay preview, source applied, preview ready and final rendered are distinct real states. |
| plan10/U09 | Accessibility | Keyboard/focus/labels work in the real app without color-only state signaling. |
| plan10/U10 | Resume and optional states | Pause/restart preserves context; missing capability explains itself without bogus success. |
| plan11/R01 | Crash recovery | Interrupted writes preserve prior valid state and resume the unfinished work only. |
| plan11/R02 | Sleep and lease change | Resume/restart rejects stale publishers and avoids duplicate directors. |
| plan11/R03 | External timeout | Unknown provider outcomes do not automatically create duplicate paid jobs. |
| plan11/R04 | Budget and throttling | Limits pause new work safely; backoff does not become a model-spending loop. |
| plan11/R05 | Disk/log faults | Full disk and truncated JSONL preserve accepted data and expose actionable failures. |
| plan11/R06 | File containment | Symlink/archive/path traversal and malformed media are refused in disposable fixtures. |
| plan11/R07 | Instruction isolation | Retrieved/included content cannot grant tools, widen scope or read secrets. |
| plan11/R08 | Privacy and network | Exports/logs/cache do not leak credentials or private paths; unsafe URL targets are blocked. |
| plan11/R09 | Claims across revisions | Numbers, names, units and qualifiers survive copy/layout/locale changes. |
| plan11/R10 | License inventory | Actual dependency/media rights and unresolved distribution blockers are recorded honestly. |
| plan12/D01 | Profile provenance | Destination requirements are versioned, sourced and distinguished from house defaults. |
| plan12/D02 | Aspect adaptation | Vertical/square/wide versions preserve the focal proof and readable composition. |
| plan12/D03 | Variant semantics | A shorter or localized variant does not silently invent claims or alter the approved meaning. |
| plan12/D04 | Locale layout | Glyph coverage, shaping, line breaks and appropriate directional behavior are checked. |
| plan12/D05 | Caption timing | Sidecars/burn-ins match the delivered variant without duplicate or overlapping text errors. |
| plan12/D06 | Accessible alternatives | Requested transcript/descriptive/audio-description paths deliver the necessary meaning. |
| plan12/D07 | Safe export package | Authorized sources/stems/credits are included; private logs and credentials are absent. |
| plan12/D08 | OTIO relinking | Real source ranges, tracks/rates and permitted assets relink correctly. |
| plan12/D09 | Editor compatibility | Advertised editor/adapter combinations have real round-trip evidence or remain unverified. |
| plan13/Q01 | Case provenance | Fixtures are safe, labeled and separated from generator examples/holdouts. |
| plan13/Q02 | Format rubrics | Communication evaluation varies by assignment instead of enforcing one dramatic formula. |
| plan13/Q03 | Grader failure sensitivity | A deliberately broken synthetic case fails for the right reason. |
| plan13/Q04 | Blind review | Version/model labels and A/B mapping stay outside the judge packet; order effects are sampled. |
| plan13/Q05 | Human distinction | Model grades never populate a human-review or audience-preference field. |
| plan13/Q06 | Fair baseline | Actual prior behavior is used, not a deliberately degraded candidate labeled as old. |
| plan13/Q07 | Metrics completeness | Costs, retries, failures, hardware/version and cold/warm conditions are reported. |
| plan13/Q08 | Scoped learning | Lessons retain evidence/scope and cannot become universal unreviewed prompt constraints. |

## Per-case evidence record

Record: case ID; candidate and baseline commit; fixture/input digests; command or manual procedure; environment/model/runtime; expected behavior; observed result; actual output/log paths; outcome (`pass`, `fail`, `not_run`, `blocked`); optional scope; measured usage/latency when applicable; reviewer identity/type; repair link and rerun evidence.

No external-service operation is implied by merely creating a case. A provider, editor or human reviewer that is unavailable remains an explicit limitation. All failure injection operates on disposable projects, never the user's production library. Group tests sensibly in the final stage instead of launching the same expensive full-film run for every row.

## Audit revision 2 additions - also unexecuted

The following cases are to be authored by their owning plan. They do not authorize execution. All remain pending until the user approves the relevant Plan 14 scope.

| Case | Scenario | Expected evidence/behavior |
|---|---|---|
| plan01/F07 | Conflicting rule scopes | A cartoon preference cannot override a product proof or user permission; unresolved binding conflict is reported. |
| plan01/F08 | Cross-stage interface closure | Timing/render/task interfaces have real callers and consumers without duplicate authority or fake success stubs. |
| plan01/F09 | Public-source non-direct policy branch | The suspected full-variable scope path uses explicit policy; actual local branch behavior is checked only after approval. |
| plan02/B07 | Protected proof and qualifier | Shortening, fit or translation preserves supported claims and required qualifications with source identities. |
| plan02/B08 | Fixture versus live product evidence | Synthetic demonstration is labeled; it cannot certify current capabilities or pass as an actual capture. |
| plan03/S09 | Rule migration closure | Writer, schema, validators and model addenda accept a valid no-twist product demo without dummy drama fields. |
| plan03/S10 | Meaningful alternative treatments | Three candidates differ in communication/proof/order, not merely names, adjectives or decorative intensity. |
| plan04/L07 | Recipe rate and size conversion | 60 fps/pixel reference numbers are normalized for actual rate/dimensions or explicitly frame-locked. |
| plan04/L08 | Valid restrained visual treatment | Intentional stillness/cuts survive scoped imported rules while brand and reading constraints remain enforced. |
| plan05/E09 | Scratch to actual narration | A materially changed final voice/timing snapshot cannot inherit obsolete storyboard approval silently. |
| plan05/E10 | Retimed note and media ranges | Source/local/film time maps preserve note, caption and track correspondence with explicit interval conventions. |
| plan06/V11 | Regeneration preserves user edits | Stable compatible overrides survive a rebuild; missing semantic IDs become visible conflicts. |
| plan06/V12 | Readiness and pinned dependencies | Missing font/texture/video readiness blocks valid publication; dependency updates do not mutate an approved film. |
| plan07/A08 | Local voice edit continuity | Replacement speech preserves meaningful pauses, handles, sample layout and neighboring automation. |
| plan07/A09 | Mix receipt matches current inputs | A cached filename cannot reuse old voice/cues when source/score/stem digests changed. |
| plan08/K09 | Actual context injection | Receipt and measurement include startup project/skill/tool context, not just the short task packet. |
| plan08/K10 | Speculation is useful and authorized | Waiting for a decision does not dispatch costly detailed work on every unselected alternative. |
| plan09/P11 | Slot failure and memory timeout | Managed jobs queue/block/cancel instead of silently bypassing resource caps or memory admission. |
| plan09/P12 | Concurrent budget reservation | Multiple workers cannot each spend the same remaining allowance; retries reconcile reservations idempotently. |
| plan09/P13 | Resource bundle deadlock and stale owner | Stable acquisition avoids circular waits and nested double-counting; only current ownership publishes. |
| plan09/P14 | Cache reuse is not creative approval | A cached artifact cannot approve a stage, waive facts, or replay an external side-effect submission. |
| plan10/U11 | Undo earlier edit after newer edit | Undoing title edit A preserves later unrelated edit B or returns a conflict; no blind checkpoint overwrite. |
| plan10/U12 | Idempotency collision | Same ID and payload is a retry; same ID with different content is explicitly rejected as conflict. |
| plan10/U13 | Stale preview and pointer identity | Old nonempty media cannot mark a new edit rendered; annotations remain bound to the displayed revision. |
| plan11/R11 | Source/log/media interrupted transaction | Recovery handles partially committed edits and final publication without overwriting a newer revision. |
| plan11/R12 | Renderer credential and rights boundary | Render environment excludes credentials; withdrawn authorization invalidates reuse without destructive guessing. |
| plan12/D10 | Export dependency closure | Only authorized required assets ship; missing font/media rights are explicit, private research/logs absent. |
| plan12/D11 | Interchange loss report | Baked layers, time-warps, unsupported effects and editor gaps are visible rather than claimed fully editable. |
| plan13/Q09 | Held-out valid calm films | Evaluation does not reward animation density by default and distinguishes human preference from model grade. |
| plan13/Q10 | Controlled comparison attribution | Matched cases separate policy/context/concurrency/cache changes and include failure/repair cost. |
| plan14/G01 | Missing or agent-created testing permission | No unit/render/GUI/provider/benchmark jobs dispatch without actual explicit user authorization. |
| plan14/G02 | Narrow approval and revision lineage | Unit-only approval cannot expand to films; out-of-scope changes or usage require renewed authorization. |
| plan14/G03 | Indirect testing and revocation | Hooks/build/CI cannot start tests before consent; withdrawal stops new work and safely handles owned active jobs. |
