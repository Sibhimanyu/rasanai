# Research sources and evidence boundaries

**Prepared:** 2026-10-25. This ledger distinguishes inspected source material, prior project research and new implementation proposals. Source IDs here are research references; test IDs with the same letters are namespaced as `planNN/case` in the test matrix.

The recommended schemas, stage sequence, worker counts, cache design, rubrics and implementation tasks are original RasanAI design proposals. Studio case studies do not establish a universal production formula or prove RasanAI will produce equivalent quality. No source here establishes a numerical token saving or speedup for this upgrade. Measure those only in explicitly user-approved Plan 14 execution.

## R - Current RasanAI repository, inspected through its GitHub connection

Snapshot: `20ea14748daaee007cb4eaf5ba8aee91c09b1c4a` on public `master`, commit dated 2026-10-24. The local executor must preserve and reconcile newer local work. Documentation status is not an independent runtime test.

| ID | Primary source | Relevant observation | Used by |
|---|---|---|---|
| R01 | [Repository commit](https://github.com/Sibhimanyu/rasanai/commit/20ea14748daaee007cb4eaf5ba8aee91c09b1c4a) | Public baseline is Studio 0.20.0 beta 1 / build 48 appcast update. | 00-14 |
| R02 | [Motion Studio status](https://github.com/Sibhimanyu/rasanai/blob/20ea14748daaee007cb4eaf5ba8aee91c09b1c4a/docs/plans/motion-studio-status.md) | Records incomplete mechanics, integration pending and unverified real native/render behavior. This may lag local work. | 01, 06, 14 |
| R03 | [Script writer](https://github.com/Sibhimanyu/rasanai/blob/20ea14748daaee007cb4eaf5ba8aee91c09b1c4a/skills/rasanai/agents/script-writer.md) | Mandatory villain/reversal/peak rules and banned familiar openings exist in the inspected prompt. | 02-05, 13 |
| R04 | [Crew implementation](https://github.com/Sibhimanyu/rasanai/blob/20ea14748daaee007cb4eaf5ba8aee91c09b1c4a/skills/rasanai/scripts/crew.mjs) | Role dispatch, direct/lean/full choices and token estimates already exist. Estimates are not new measurements. | 01, 03-09, 13 |
| R05 | [Film-event authority](https://github.com/Sibhimanyu/rasanai/blob/20ea14748daaee007cb4eaf5ba8aee91c09b1c4a/skills/rasanai/references/film-events.md) | The score is authored; events are derived and checked for stale sources. Existing seconds/frame mapping must be preserved. | 01, 05-09, 12 |
| R06 | [Third-party source register](https://github.com/Sibhimanyu/rasanai/blob/20ea14748daaee007cb4eaf5ba8aee91c09b1c4a/skills/rasanai/third_party/SOURCES.md) | Many provided video projects are already researched. Source reuse/license status is recorded separately from capability. | 06, 08, 11 |
| R07 | [Native Studio engine boundary](https://github.com/Sibhimanyu/rasanai/blob/20ea14748daaee007cb4eaf5ba8aee91c09b1c4a/apps/macos/README.md) | Native SwiftUI/file transport, one session writer, scoped permissions and native verification workflow. | 01, 09-12, 14 |

Also confirmed through the connector: `apps/macos/Sources/RasanAIStudio/` and `apps/macos/Sources/StudioCore/`. Other touchpoints in `REPOSITORY_MAP.md` were established by the prior repository inspection or current references; rediscover exact symbols at local HEAD before editing them.

## S - Professional motion-design practice and audience needs

### S01 - Ordinary Folk: production process

Source: https://www.ordinaryfolk.co/process

The studio describes message/script development, look/design and animation as distinct work, and considers sound throughout the process. An animatic informs composer work. Use this to make deliverables distinct and involve sound early, not to impose an identical studio workflow on every project. Mapped to 01, 04, 05 and 07.

### S02 - Ordinary Folk: Webflow Ecommerce

Source: https://www.ordinaryfolk.co/project/webflow-ecommerce

The studio's account connects its script/visual concept to product benefits while keeping actual UI and message clarity central to elaborate 2D/3D treatment. Use as a product-native clarity reference, not a script/template to copy. Mapped to 02-05.

### S03 - Ordinary Folk: School of Motion manifesto

Source: https://www.ordinaryfolk.co/project/school-of-motion-manifesto

Its visual development from simple forms to more complex design supports a manifesto about creative growth. Use to distinguish meaningful metaphorical progression from a feature demonstration. It is not evidence that every film should become more complex. Mapped to 03-04.

### S04 - BUCK: Google Vids

Source: https://www.buck.co/work/google-vids

The case account describes script and storyboard development with the product team and a motion system extending an existing visual language. Use for product/context grounding and coherent visual direction. Mapped to 02-05.

### S05 - Animade: animation production guide

Source: https://archive.animade.tv/scoops/the-stages-of-animation-production-ultimate-guide

This guide was used in the preceding story research to distinguish storyboard actions/shots from animatic timing. The archived page's full-text retrieval was inconsistent in this packaging pass; do not treat it as the sole evidence for a precise workflow claim. The separation is also supported by S01 and the user's explicit product decision. Mapped to 01 and 05.

### S06 - Studio Dumbar: OpenAI identity film

Source: https://studiodumbar.com/work/openai-brand-film

The account describes introducing identity elements progressively and coordinating bespoke sound with motion. Use as an identity-film reference, not a ChatGPT capability launch reference. Its studio-reported engagement is not an independent quality benchmark. Mapped to 03, 04 and 07.

### S07 - Giant Ant: Slack brand campaign

Source: https://www.giantant.ca/slack-brand-campaign

The project illustrates concise spots organized around specific product benefits. Use to distinguish focused advertising from a broad thematic opener. Do not repeat historical product/adoption statistics from the campaign as current facts. Mapped to 02-03 and 12.

### S08 - Giant Ant: Slack Frontiers

Source: https://www.giantant.ca/slack-frontiers

An event/theme film for the same brand demonstrates a different communication task from its short product spots. Use to avoid one narrative formula for every brand request. Mapped to 02-04 and 12.

### S09 - School of Motion: transitions

Source: https://schoolofmotion.com/blog/six-essential-motion-design-transitions-tutorial

Transition choices, including ordinary cuts, can express different relationships. Use to require a reason for a transition, not a mandatory elaborate effect at every boundary. Mapped to 05 and 09.

### S10 - W3C WAI: audio/video accessibility

Source: https://www.w3.org/WAI/media/av/

The guidance covers planning accessibility early, captions, transcripts and descriptions of visual information. Use to design audience-appropriate deliverables; subtitles alone do not establish universal accessibility compliance. Mapped to 02, 10, 12 and 14.

### S11 - Google: objective-aware video advertising guidance

Source: https://business.google.com/br/think/future-of-marketing/conheca-abcds-youtube-guia/
Related consideration guidance: https://business.google.com/br/think/future-of-marketing/abcds-youtube-consideracao-produto-servico/

Official guidance distinguishes communication objectives such as awareness, consideration and action. Use for destination-aware planning, not as a compulsory story template or a promise of campaign performance. These pages are Portuguese-language primary sources; implementation summaries in this package are original English synthesis. Mapped to 02 and 12.

## T - Official technical and operational references

| ID | Source | Use and limitation |
|---|---|---|
| T01 | https://code.claude.com/docs/en/sub-agents | Task-specific contexts, tools and startup behavior. Discover the installed harness's actual model IDs, injection and capability support rather than assuming a fixed version. |
| T02 | https://code.claude.com/docs/en/agent-teams | Team coordination and tradeoffs. Useful concurrency is not the number of agents; teams are not mandatory for every video. |
| T03 | https://code.claude.com/docs/en/costs | Usage/cost interpretation and context management. Subscription allowance and API-equivalent estimates must remain separate. |
| T04 | https://platform.claude.com/docs/en/build-with-claude/prompt-caching | Cache eligibility and usage counters for supported API paths. No universal cache discount or CLI behavior is assumed. |
| T05 | https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents | Separate task outcomes from traces; combine code, model and human grading. Human calibration and repeated trials matter; our film-specific rubric is a proposal. |
| T06 | https://docs.comfy.org/development/comfyui-server/comms_routes | Prompt IDs, queue/history and event protocol. Installed workflows, cancellation scope and models still need host-level verification in 14. |
| T07 | https://developer.apple.com/documentation/vision/vntrackingrequest | Tracking observations and frame-to-frame requests. Object boxes are not semantic silhouettes or a guaranteed perspective solution. |
| T08 | https://opentimelineio.readthedocs.io/en/latest/tutorials/otio-file-format-specification.html | Official interchange representation. Pin the actual library version; destination-editor compatibility requires a real round trip. |
| T09 | https://gsap.com/community/standard-license/ | The applicable license distinguishes permitted uses from competing visual animation-building tools. Its FAQ permits AI-generated code and discusses noncompeting visual tools. Applicability depends on the actual product/version; obtain clarification where needed rather than assuming all visual tools are prohibited or automatically exempt. |
| T10 | https://help.openai.com/en/articles/9260256-chatgpt-capabilities-overview | Official capability reference for actual ChatGPT demonstrations. Verify current supported behavior and use real captures; examples in the plans are not official advertisements. |

Do not treat changing documentation as an immutable API contract. Record the dependency/tool version selected at implementation and verify it in 14. Licensing observations are engineering risk flags, not a legal opinion. Exact codec/FFmpeg flags should come from the installed version's official help/documentation; no unverified command examples are required by this package.

## P - Video pipeline projects already supplied or researched

These are prior-research inputs and current RasanAI source-register entries, not a new claim that every upstream repository was fully code-audited in this packaging pass. R06 was inspected again. Verify the actual license before copying code or prompts. Learn the pattern rather than installing every skill.

| ID | Project/source | Transferable pattern / boundary |
|---|---|---|
| P01 | https://github.com/JohnHeibel/PDoomVideo | Shared guide and chapter-level ownership; an existing song supplies story constraints that a product launch does not have. Ideas only unless copying rights are verified. |
| P02 | https://github.com/JohnHeibel/ClaudeAnimationBase | Reusable character/runtime helpers and rendered review material. Do not make its cartoon-specific no-text rules global. |
| P03 | https://github.com/tuzhechen2005/opus-video-skills | Style-scoped runnable foundations, time-based frames and output review. Keep per-style guidance selective. |
| P04 | https://github.com/lemomo-ai/lemo-opuscar | Direction, technique and chosen-style separation; saved styles. Check code and media licenses individually. |
| P05 | https://github.com/diggerhq/shipvideo | Constrained single-HTML production path for simple shorts; do not infer feature-film quality or general token savings. |
| P06 | https://github.com/yihui-dev/awesome-opus5-5-videos | Reference discovery, not a production scheduler or permission to copy every linked prompt/video. |
| P07 | https://github.com/riba2534/claude-opus-5-5-demo | Demonstration material, not established evidence of an efficient motion-graphics pipeline. No new dependency is required. |
| P08 | https://github.com/howseen-ai/claude-motion-design | Shot-group separation and draft/final workflow ideas. Reuse analogous RasanAI code rather than a second renderer. |
| P09 | https://github.com/openfilm/openfilm | Small time-seekable scene contracts and visual editing concepts; an optional interoperability reference. |
| P10 | https://github.com/Remocn/remocn and https://github.com/Remocn/remocn-studio | Component registry and agent/editable-project workflow concepts. Keep RasanAI native and evaluate underlying framework terms separately. |
| P11 | https://motionvideo.xyz/ and https://github.com/motionvideohq/motionvideo.xyz | Public inspiration and techniques. The website's source license does not cover the separately sold skill pack or creators' media. |
| P12 | https://github.com/charlie947/motion-graphics-skills ; https://github.com/Leonxlnx/cinetic ; https://github.com/remotion-dev/skills | Selective technique/direction references only as needed. Do not assume every repository has the same license or that Remotion becomes RasanAI's default. |

Other previously discussed libraries (Motion Canvas, Anime.js, Rive, Three.js/React Three Fiber, Satori and FFmpeg) remain tools with different roles, not a checklist of new mandatory integrations. Prefer existing GSAP/HyperFrames/Rasan3D behavior unless a concrete unmet requirement justifies a scoped optional adapter and its licensing/dependency cost.

## U - User-provided prior plans and final decisions

- **U01:** `plan.md`, Motion Studio upgrade, 1,201 lines, created earlier in this conversation. Its feature intent is consolidated, not blindly rerun.
- **U02:** `rasanai-hybrid-film-studio-plan.md`, Phase 2, 517 lines, created earlier in this conversation. Incremental rendering, hybrid footage, tracking, direct edits, recurring characters and OTIO handoff are retained across Plans 06/09/10/12.
- **U03:** The user explicitly distinguished Story from Storyboard and placed the full Storyboard after Look. This controls the new user-facing sequence even when a studio's production method differs.
- **U04:** The user subsequently required explicit approval before any testing. Implement 01-13, then stop. Reaching Plan 14 does not authorize execution. This supersedes both repeated-smoke and automatic end-of-implementation testing instructions; production-time safeguards remain intact.
- **U05:** Many useful parallel Sonnet implementation workers are authorized in the executor's supported environment. This does not establish an 8-12-worker minimum for every generated film or permission to exceed provider limits.

This package authors instructions and fixtures/specifications for later implementation. It does not claim that any code change, render, benchmark, license clearance or human evaluation has occurred in the RasanAI runtime.

## A - Audit-pass additions (2026-10-25)

All observations below are from document/source inspection. None is a test result or legal clearance. Public RasanAI HEAD was re-read and still returned `20ea14748daaee007cb4eaf5ba8aee91c09b1c4a`; local changes are unknown and take precedence.

| ID | Source inspected | Observation and use |
|---|---|---|
| A01 | https://github.com/Sibhimanyu/rasanai/blob/20ea14748daaee007cb4eaf5ba8aee91c09b1c4a/skills/rasanai/scripts/lib/slot.mjs | Source has timeout/unwritable-lock paths that run without a slot, and a low-memory timeout path that renders anyway. Plans 09/11 add explicit resource-block behavior and deferred cases. |
| A02 | https://github.com/Sibhimanyu/rasanai/blob/20ea14748daaee007cb4eaf5ba8aee91c09b1c4a/skills/rasanai/scripts/lib/editor-patch/index.mjs | `undo` restores checkpoint bytes; `mark rendered` checks existence/nonzero size; duplicate IDs return existing state. Plans 10/11 require revision-safe Undo, payload collision detection and render receipts. Risks are static findings, not reproduced incidents. |
| A03 | https://github.com/Sibhimanyu/rasanai/blob/20ea14748daaee007cb4eaf5ba8aee91c09b1c4a/skills/rasanai/scripts/crew.mjs | `sourceResearch` visibly references `full` while the inspected declaration is local to `planCrew`. Confirm full lexical context at local HEAD before fixing the suspected branch defect. |
| A04 | https://github.com/JohnHeibel/ClaudeAnimationBase/blob/main/ANIMATION_GUIDE.md | Reviewed cartoon guide; reuse staging/reading and stable helpers, but do not globalize its stylistic no-text/constant-motion/transition rules. Blob seen: `055bf10bb1d1e86963e4429665130ddbd1026b3e`. |
| A05 | https://github.com/howseen-ai/claude-motion-design/blob/main/skill/motion-design/SKILL.md | Reviewed shot-group/draft patterns and style prescriptions. Source-specific beat/hold rules and local paths are not RasanAI defaults; no setup instructions executed. |
| A06 | https://github.com/Leonxlnx/cinetic/blob/main/README.md | Reviewed technique-selection and evaluation description. Reproducible retrieval is useful; random technique counts, 60 fps recipes and house taste are conditional, not mandatory. Blob seen: `e1a2479be347a8c52b561f933ed98c3ed82e07a1`. |
| A07 | https://github.com/Remocn/remocn/blob/main/README.md | Reviewed copy-in component registry. Reuse the component/versioning idea, not a wholesale React/Remotion migration. Blob seen: `6705eb6e43b3956688bb6005c669cdd21df2635f`. |
| A08 | https://github.com/openfilm/openfilm/blob/main/README.md | Reviewed time-based scene contract, readiness and persistent overrides. Adapt those concepts to current RasanAI authority; do not infer exact cross-platform rendering identity. Blob seen: `d890450d91fc673fe1c76af61e84d043f343bcb2`. |
| A09 | https://code.claude.com/docs/en/sub-agents | Rechecked current official scope/startup context guidance. Match installed capabilities; full preloaded skills can erase a small-packet saving. |
| A10 | https://code.claude.com/docs/en/agent-teams | Rechecked overhead/independence guidance. Team size remains workload-dependent, not an unconditional speed guarantee. |
| A11 | https://platform.claude.com/docs/en/build-with-claude/prompt-caching | Rechecked prefix reuse and cache observability. Cache behavior does not remove input context or eliminate output usage. |
| A12 | https://www.anthropic.com/research/demystifying-evals-for-ai-agents | Rechecked outcome-based, multi-method evaluation and failure inspection. RasanAI evaluation remains deferred until user approval. |
| A13 | https://gsap.com/community/standard-license/ | Rechecked current restriction and FAQ. AI code generation and noncompeting tools are discussed separately; classify actual use, do not claim automatic clearance. |

Other upstream sources in the reference matrix were assessed through the supplied plans and RasanAI's provenance register rather than exhaustively re-audited at current HEAD. Root GitHub pages for several supplied repos did not load via web; available connector reads were used for selected primary files. No star counts, popularity rankings, benchmark timings or license badges are treated as proof of runtime suitability. Before any actual source import, record an exact source version and inspect its applicable license/media rights. This is required intake, not permission to execute upstream code.
