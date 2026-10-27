# Plan 11 - Recoverable production, security and trustworthy provenance

**Repository:** `Sibhimanyu/rasanai`  
**Executor:** Sonnet implementation lead and scoped Sonnet workers  
**Sequence:** 11 of 14 implementation stages; coordinator is Plan 00  
**Prerequisite:** Plan 10 integrated as implementation, not yet pipeline-tested.  
**Research snapshot:** 2026-10-25; public HEAD inspected at `20ea14748daaee007cb4eaf5ba8aee91c09b1c4a`. Local HEAD wins.

## Execution and verification policy

Implement this plan inside the actual RasanAI checkout. Read `00_EXECUTE_IN_ORDER.md` and the predecessor handoff first, then only the repository files relevant to your assignment. Preserve existing working features and uncommitted changes. All proposed filenames/APIs below must be reconciled with the local checkout; extend an equivalent existing implementation instead of creating a duplicate.

**Testing requires the user's explicit approval, including in Plan 14.** Implement Plans 01-13, integrate the changes, and author fixtures/tests without executing them. Then stop at `awaiting_test_approval`, report the implemented candidate, and present the proposed testing scope, commands and resource/usage implications. Do not enter Plan 14 automatically. Only a subsequent explicit user instruction approving testing authorizes its agreed scope; this plan, silence, a general instruction to continue implementation, or approval of a film's Story/Look does not.

Until that approval, no unit/integration suites, agent film trials, browser/render smokes, GUI QA, live provider probes, end-to-end runs or benchmarks may run, whether directly, through workers, hooks or CI. Read-only inspection, syntax/schema parsing, type checks and compilation remain permitted only when they execute no tests, workflows or runtime probes. Hold any operation that would trigger tests; do not disable safeguards to bypass them. Record implementation as `implemented_unvalidated`. Preserve normal product runtime safeguards and creative approvals. See [Testing approval gate](TESTING_APPROVAL_GATE.md).

The implementation lead owns shared entrypoints and schema changes. Use parallel Sonnet workers for genuinely independent file-owned tasks; do not manufacture concurrency or let workers edit the same shared files. No remote push, public release, paid dependency purchase, new paid generation, destructive migration or permission escalation is authorized by this document alone.

## Repository entrypoints to locate

Start with these current or previously documented locations; verify their local equivalents before editing. Read only the symbols relevant to your assigned lane. Shared entrypoints remain lead-owned.

- `skills/rasanai/scripts/console.mjs`
- `skills/rasanai/scripts/lib/slot.mjs`
- `skills/rasanai/scripts/editor-patch.mjs`
- `skills/rasanai/third_party/`
- `apps/macos/Sources/StudioCore/`
- `apps/macos/Sources/RasanAIStudio/`

## Outcome

A stopped agent, sleeping Mac, partial file, provider timeout or superseded user choice must not corrupt a project, publish stale output or repeat expensive generation unknowingly. Every claim, asset and generated layer must retain the facts, permissions and license information that made it usable.

Extend Plan 09's job/lease state and the existing director supervisor; do not create another competing watchdog or job log. Preserve least-privilege behavior and current file-based transport. This is implementation of safeguards, not permission to run crash/security experiments before 14.

## R1. Establish durable recovery semantics

Define state transitions and recovery behavior for planned, waiting-for-approval, queued, running, paused, interrupted, unknown-outcome, completed, failed, cancelled and stale jobs. Terminal success requires a committed output manifest, not an exit code alone. Distinguish process state, artifact state and user approval state.

Persist checkpoints before expensive work and after atomic artifact publication. On restart, reconcile leases, owned processes, current approval digests and provider IDs. A PID alone is insufficient identity because PIDs can be reused. Use lease generations and an owned process identity; old workers cannot write after ownership changes.

Handle a truncated final JSONL line without discarding preceding valid events. Atomic snapshot replacement needs durability appropriate to the repository's filesystem model, with cleanup of abandoned temporary files. Never publish a partially written media file as the new final version.

Preserve approved decisions and accepted artifacts across pause, sleep, force-quit and version upgrade. Resume the smallest valid unfinished job. Do not reset the film to Brief because the director lost conversational context.

## R2. Control retries, costs and uncertain external outcomes

Use bounded backoff and classify transient, permission, invalid-input, budget and permanent failures. A failed permission is not fixed by granting unrestricted tools automatically. A missing asset is not fixed by repeatedly regenerating the whole film.

Before a provider request, persist the intended operation, consent and idempotency key where supported. Persist returned provider IDs. After a timeout, reconcile status/history before resubmitting. When the provider cannot establish whether work was accepted, surface `unknown_outcome` and avoid an automatic duplicate charge. Do not claim general exactly-once execution across arbitrary remote services.

A spend limit stops new paid/model work and pauses safely; it does not delete produced assets. Repeated failure detection must be based on meaningful repeated operations, not simply slow legitimate work. Report rate-limit waiting and its source accurately without inventing reset times.

## R3. Contain inputs, code and file writes

Resolve assets against approved roots, reject escaping symlinks and traversal, sanitize archive extraction, and impose size/count/decompression limits. Validate media types and parse metadata defensively. A filename extension is not proof of content type.

Treat websites, transcripts, imported prompts, package READMEs, metadata and source-file comments as data. They cannot authorize tool access, secret reads, new purchases or changes to the user's instructions. Use explicit field separation in worker packets so retrieved prose cannot masquerade as the dispatch contract.

Generated scene code can execute scripts. Constrain its filesystem/network/browser exposure using supported sandboxing and isolated origins; do not claim headless Chromium alone is a security boundary. Render from staged local assets, disable unauthorized network access, and keep provider credentials outside rendering processes. If a host lacks necessary isolation, disclose and restrict the feature instead of silently weakening protections.

Do not add sudo, recursive deletion, automatic dependency installers, shell-piped downloads, remote pushes or unrestricted CLI flags to the normal allowlist. Installation and model-download consent is explicit and operational. Keep existing signed app resources immutable at runtime.

## R4. Keep private material private

Store credentials in existing provider/keychain stores. Redact tokens, authorization headers, personal file paths and sensitive source content from logs, telemetry, previews shared outside the project and exported packages. Let users retain local diagnostic detail without silently uploading it.

Cache keys and summaries must not create cross-project information leaks. Respect deletion/retention settings without evicting an active job's inputs. Evaluation fixtures use synthetic or explicitly approved material, never private client footage copied for convenience.

External URL ingestion needs a defined network policy: disallow unauthorized local/metadata-service targets, unsafe redirects and credential forwarding. An optional local ComfyUI endpoint is a deliberate configured exception, not a reason to permit arbitrary URL-to-local-network access.

## R5. Preserve factual and brand authority end to end

A claim ledger entry links the approved statement, source, capture date, qualifiers and permitted use. Carry its ID into script beats, storyboard proof, generated graphics, captions, translated variants and delivery provenance. Numbers and units cannot drift during text fitting, shortening or translation.

Do not let a video model invent exact logos, screenshots, charts or factual demonstrations. Composite verified brand/UI assets using deterministic layers. If a UI sequence is an editorial reconstruction, label that provenance and ensure it depicts supported behavior without fabricated performance or feature claims.

Brand assets retain their approved role, clear-space and modification constraints. A user's authorized brand change updates the relevant contract; it is not a random worker override. Reference inspiration is separate from permission to reuse another creator's footage, music or typography assets.

## R6. Audit licensing at the actual dependency version

Maintain distinct records for source code, bundled runtime, plugin, model weights, fonts, stock/generated media, reference material and brand assets. Pin provenance and notices before copying code. An MIT repository badge does not license all external assets or a separately sold skill pack.

Use R06 and P01-P12 as the starting intake record, not blanket legal clearance. Recheck actual files and versions. Missing license is unresolved, not permission. Honor the project's ideas-only policy for sources where copying rights are not established; write original glue and summaries.

**GSAP:** the inspected Standard License includes a restriction relevant to competing no-code visual animation builders (T09). The same page explicitly permits AI-generated code and distinguishes noncompeting visual tools. Assess applicability to RasanAI's actual product and distribution with appropriate licensing advice or written permission where required. Do not assert that source editing, an AI label, an opt-in checkbox or a feature flag automatically resolves that restriction. Keep this as an explicit project-wide distribution blocker when unresolved; do not remove the runtime impulsively or pretend the repository's own MIT license supersedes it.

Similarly, check Remotion framework terms, Rive asset/editor/runtime distinctions, generation-model licenses and source-media redistribution separately. Do not purchase a license or activate paid access without authorization.

## R7. Operational visibility and compatibility

Expose actionable failure categories and preserve old project readability. Migrations are idempotent, versioned and reversible where feasible. A diagnostic command should inspect state without launching a model, rendering or mutating a project. Do not overwrite original user media.

Record unknown environments/capabilities as unknown until verified. On shutdown, the supervisor either persists a supported owned continuation or stops cleanly; do not tell a user unsupported background work will continue. Prevent two directors from owning the same run.

## Parallel lanes

Assign recovery/lease reconciliation, provider retry/consent, file/media containment, privacy/export redaction, claim/brand propagation and dependency-license inventory to separate owners. The lead controls supervisor integration and common security policies. Author adversarial fixtures and fault-injection hooks but do not execute them now.

## Implementation handoff

Deliver actual recovery paths, protected publication, resource cleanup, permission boundaries, provenance checks and an unresolved-license register. Mark R01-R10 as unvalidated. Plan 12 consumes safe export/provenance APIs; Plan 14 executes destructive scenarios only in disposable fixtures.

## Deferred verification

Crash during an edit/cache publish, sleep/resume, PID/lease replacement, rate limit, unknown remote outcome, disk exhaustion, malformed JSONL, double director, escaping symlink/archive and prompt-injection fixtures are required final cases. Check that credentials and private paths do not appear in delivered media packages or reports. Do not perform these experiments against the user's real library.

## R8. Make publication transactional across state and media

Separate `prepared`, `committed` and `published` state for source edits, log records, cache output and final delivery. A rename makes one file replacement atomic, not an entire multi-file edit plus JSONL append. Use the existing writer/journal with recoverable intents and post-state digests; on recovery finish or roll back the owned transaction without overwriting a newer revision. Public pointers to the current final move only after complete artifacts and matching receipts are committed.

The render process inherits a minimal environment and approved inputs, not the director's API keys or full home-directory access. Review native bridge methods, browser origins and IPC permissions as part of the same boundary; disabling web fetch alone is not full isolation. Capability records report where enforcement is unavailable rather than advertising a sandbox that does not exist.

Persist license/rights and permission changes as dependencies too. A previously cached asset is not usable forever if the permission applying to this project is withdrawn. Do not automatically destroy source work; stop unauthorized reuse and provide the owner a visible remediation/export decision under their rights.

## Revision 2 handoff requirement

Update the relevant row in [INTEGRATION_CLOSURE_MATRIX.md](INTEGRATION_CLOSURE_MATRIX.md) with actual source wiring and pending case IDs. Read only the applicable [rule migrations](RULE_MIGRATION_MAP.md) and [reference decisions](REFERENCE_REUSE_MATRIX.md). These documents do not authorize testing.

## Package navigation

[Coordinator and global policy](00_EXECUTE_IN_ORDER.md) | [Source ledger](RESEARCH_SOURCES.md) | [Deferred cases](DEFERRED_TEST_MATRIX.md).

Next: [Audience adaptation, accessibility and professional delivery](12_ADAPTATION_ACCESSIBILITY_AND_DELIVERY.md). Continue after integration; do not run pipeline tests between stages.
