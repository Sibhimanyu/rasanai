# Testing approval gate - controlling execution rule

**User instruction: "Testing should only happen after I approve."**

This is an authorization requirement, not merely a timing preference. It overrides any earlier direction in this package or prior plans to run tests automatically at the end. The author has not granted or recorded testing approval.

## Implementation, then stop

Implement Plans 01-13 in order. Write fixtures and test code without running them. Workers may read source, inspect diffs, parse configuration/schema files, perform syntax/type checks and compile only when those operations do not execute tests, application workflows, browser/runtime probes or generation. Inspect command scripts first; an operation with uncertain side effects must wait.

After Plan 13, record `implemented_unvalidated` for the code and `awaiting_test_approval` for the coordination gate. Provide the candidate revision, implementation summary, known limitations, proposed cases and commands/manual actions, and expected provider usage or resource requirements. Ask for approval and stop until the user replies explicitly. Do not automatically enter Plan 14.

## What approval means

Only the user can authorize testing. Preserve the actual approval wording or message reference, its scope, candidate revision and any budget/provider limits. Silence, a timeout, a general "continue implementing," permission to create plans, prior permission to test another task, a worker recommendation, or a film's Brief/Story/Look/Final approval does not count. No worker may create, infer or broaden this permission.

If the user approves only unit tests, do not also run renders or live model trials. If the user explicitly approves the presented Plan 14 scope, that scope may run without asking before every individual case. Repairs and reruns stay within the agreed scope and limits. Ask again for materially expanded tests or new paid usage. Respect a withdrawal of approval and stop safely.

## Candidate and scope binding

Use [TEST_APPROVAL_REQUEST_TEMPLATE.md](TEST_APPROVAL_REQUEST_TEMPLATE.md). Include candidate commit and any uncommitted diff digest, actual cases/commands, live-provider/data permissions, usage limits and whether bounded repair reruns are included. Preserve the original human message/reference. An agent may record evidence of approval; it may not manufacture or expand approval by writing a flag.

Approved repair commits remain linked to the authorized candidate and scope. A materially different feature, broader suite, new model/provider or increased usage needs renewed permission. If the host cannot enforce scope automatically, the lead must enforce it through tool restrictions and dispatch; do not claim an enforcement mechanism exists merely because JSON describes one.

## No indirect testing

Until approval, do not run unit/integration/end-to-end suites, render or browser smokes, GUI QA, real film-generation trials, live-provider probes, benchmarks or agent grading trials. This applies equally to the lead, subagents, background jobs, hooks and CI. Do not launch a process now that will test automatically later. Hold a commit/build/push/PR operation if it would trigger testing; do not disable hooks or safety checks to force it through.

## Scope and honesty

This is a development-work authorization gate for this upgrade, not a new creative approval stage for ordinary films and not a request to delete existing product validation. Keep runtime safety, source/rights checks and normal film approval semantics intact. Publication, remote writes, purchases and destructive operations remain separately authorized.

Before approval, an honest handoff is "implementation completed; testing not run; awaiting your approval." Reading or packaging these Markdown plans is not RasanAI pipeline testing. Do not describe unexecuted cases as passed or the code as validated.

Navigation: [Coordinator](00_EXECUTE_IN_ORDER.md) | [Plan 13 handoff](13_CREATIVE_EVALUATION_AND_LEARNING.md) | [Approval-gated Plan 14](14_FINAL_INTEGRATION_TESTING_AND_ACCEPTANCE.md).