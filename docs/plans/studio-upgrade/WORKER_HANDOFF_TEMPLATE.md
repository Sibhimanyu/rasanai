# Scoped worker handoff template

Use this as a compact format, not another full document every worker must memorize. The lead fills actual paths and versions. Workers do not self-assign shared files.

```json
{
  "task_id": "plan03.story-schema",
  "plan_file": "03_FORMAT_AWARE_STORY_AND_COPY.md",
  "goal": "One concrete implementation outcome",
  "model": "actual supported Sonnet model from host configuration",
  "base_commit": "actual base",
  "contract_version": "actual shared version",
  "input_artifacts": [{"path": "relevant input", "digest": "actual hash"}],
  "write_allowlist": ["exclusive owned paths"],
  "shared_files_read_only": ["central entrypoints owned by lead"],
  "required_outputs": ["source changes", "fixtures", "handoff", "integration closure receipt"],
  "resolved_rule_ids": ["only applicable rules from the current contract"],
  "existing_implementation_reused": ["actual paths or none"],
  "external_sources_selected": [],
  "verification_mode": "explicit_user_approval_required",
  "test_approval_ref": null,
  "status": "in_progress"
}
```

Report on completion:

```text
Task / actual branch and commit:
Implemented files and entrypoints:
Contracts used or migration required:
Fixtures/tests authored, not executed:
Static checks actually run:
Pending cases (require explicit user testing approval):
Known blockers or uncertainty:
Actual caller -> producer -> artifact -> consumer wiring:
Dependencies needed by the next worker:
Status: implemented_unvalidated / blocked / superseded_by_existing
```

Do not paste full code or raw logs into the coordinator context. Write artifacts to owned paths and summarize. Do not edit an upstream approval, expand permissions, enable a paid provider, publish a release, or silently alter another worker's output. Escalate an interface conflict to the lead with a minimal proposed patch.

Only after the lead verifies explicit user testing approval may a Plan 14 worker use `final_validation_user_approved`. Include the actual `test_approval_ref`, authorized cases, candidate revision and resource/usage limits, plus exact steps, expected/observed results and evidence. Without that approval, do not run or queue testing; report `awaiting_test_approval`. A failed authorized case goes to its module owner; blocked or out-of-scope cases remain unexecuted. See [Testing approval gate](TESTING_APPROVAL_GATE.md).