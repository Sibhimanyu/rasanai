# Proposed testing request - not authorization

Prepare after Plans 01-13 are integrated. Do not fill the permission field from an agent recommendation or a plan file. Do not launch the proposed tests while waiting for a reply.

```text
Implementation candidate:
  Branch/commit:
  Uncommitted diff digest (or none):
  Implemented-unvalidated features:
  Reused existing work:
  Core wiring gaps / optional blockers:

Proposed test batch:
  Exact case IDs and commands/manual steps:
  Host/environment and disposable fixtures:
  Includes unit/integration tests? [explicit]
  Includes browser renders or GUI sessions? [explicit]
  Includes live model/provider calls? [explicit]
  Permitted provider/model and data scope:
  Proposed usage/resource limit and unknown costs:
  Repair/rerun scope requested:
  Not included:

User decision requested:
  Approve this stated batch, approve a narrower batch, or defer.

Authorization record:
  Status: awaiting_test_approval
  Actual user approval/message reference: NONE
  Approved scope: NONE
  Revocation/expiry or session limits: not granted
```

A real affirmative reply can authorize the stated batch without repeated per-case questions. Approval for a smaller batch controls that smaller batch. General implementation approval, approval of these plans, a Story/Look choice or silence is not consent to test. Existing provider credentials are not consent to spend them. A release remains a separate decision.