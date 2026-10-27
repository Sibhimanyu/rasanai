# RasanAI sequenced implementation plans - audited revision 2

Start with [00_EXECUTE_IN_ORDER.md](00_EXECUTE_IN_ORDER.md). It controls the sequence and dispatch policy.

This folder contains one coordinator, fourteen ordered implementation/acceptance plans and supporting research, repository, coverage and deferred-verification documents. The plans are for a Sonnet agent working in the actual RasanAI checkout. They do not implement code themselves.

**Implement Plans 01-13 in order, then STOP and wait for explicit user approval before testing. Plan 14 is not automatic.** Write tests and fixtures as you implement, and keep normal product safeguards intact. Syntax/type checks and compilation are allowed only without executing tests or workflows. Record implementation as unvalidated until final evidence exists.

Use scoped parallel Sonnet workers within the active stage, with shared contracts and exclusive file ownership. Reuse existing features. Preserve the product flow: Brief -> Story -> Look -> Storyboard/animatic -> Build -> Final, with five creative approvals.

Place this folder under a documentation/plans location in the RasanAI checkout, then give the lead:

> Read `00_EXECUTE_IN_ORDER.md`. Implement Plans 01 through 13 in sequence with scoped parallel Sonnet workers, exclusive file ownership and coordinated integration. Reuse existing work and preserve Story -> Look -> Storyboard and the five creative approvals. Author tests but do not execute any tests, pipeline runs, renders, GUI QA or benchmarks. After Plan 13, report the implementation as unvalidated, show the proposed testing scope, and STOP at `awaiting_test_approval`. Do not enter Plan 14 until I explicitly approve testing. My approval applies only to the agreed scope; silence, general implementation permission and film approvals do not count. Preserve safeguards, do not push or publish, and report genuine blockers.

Read [TESTING_APPROVAL_GATE.md](TESTING_APPROVAL_GATE.md) for the mandatory stop and authorization rule. No testing approval has been granted in this package.

See [RESEARCH_SOURCES.md](RESEARCH_SOURCES.md) for evidence and limitations. [DEFERRED_TEST_MATRIX.md](DEFERRED_TEST_MATRIX.md) specifies cases; it does not claim they ran. [PACKAGE_CHECKS.md](PACKAGE_CHECKS.md) describes checks on this document package only.

## What changed in revision 2

Read [Audit and enhancements](AUDIT_AND_ENHANCEMENTS.md) for the concise review. The additions are integrated directly into all fourteen plans, not a disconnected wish list. Supporting files: [rule migration](RULE_MIGRATION_MAP.md), [reference reuse](REFERENCE_REUSE_MATRIX.md), [integration closure](INTEGRATION_CLOSURE_MATRIX.md), and [test approval request](TEST_APPROVAL_REQUEST_TEMPLATE.md).

Keep the original stage order and the mandatory pause after 13. No approval to test is contained in this archive. Use this revision instead of executing the earlier packs in parallel.