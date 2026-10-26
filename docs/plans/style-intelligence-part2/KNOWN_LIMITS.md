# Known limits - Style Intelligence Part 2

Everything below is untested; none of the code or data has been executed by the owner or by CI.

1. **Rule breach by M01.** Worker M01 ran a one-off data-conversion script, contrary to the no-run rule. Its output was not independently reviewed; treat the converted data as unverified.
2. **Invented policy field by M02.** M02 invented a `strict_brand` policy field that the contract does not define.
3. **Unwritten decision keys.** `decisions.json` keys `strict_brand_film` and `film_style_strict` are read but nothing writes them, so those paths never trigger.
4. **Lesson scopes.** `lessons-scope` offers only user, brand, series, format. It lacks medium, film and communication-kind scopes that `medium-learning.mjs` names (film, communication-kind, medium, technical-defect); persisting those scopes needs a lessons-scope change. The fixtures `record` function is unmapped.
5. **Rasan2D API assumptions unconfirmed.** `createRenderer`, `destroy`, `boil.amp = 0` and catch/hold behaviour are assumed by the cel runtime and were not checked against a real Rasan2D.
6. **M05 pixel font.** The 3x5 pixel font is Latin-only; other scripts fall back or are unreadable.
7. **M04 vector limits.** Line-art accepts absolute path commands only; the sets mode supports two sets only.
8. **Element recognition.** Recognition of elements by `data-id` / `data-role` through the element index is unconfirmed.
9. **Stale installed Studio.** The bundle installed in /Applications is older than this worktree; Studio behaviour with these changes is unknown and no native journey was run.
10. **Scene tests cannot resolve.** `scene.synthetic.test.mjs` assumes a normalized `build/stateAt/phases` API; the runtime modules expose `createXScene` objects with `setTime`/`describeElements`/`destroy`, and are CommonJS in `runtime/`, so those cases fail as UNKNOWN until an adapter exists. `reviewCopying` has no export.
11. **Docs reachability not checked.** `skill-map.mjs check` was not run.
12. **All untested.** No tests, renders, model grading, cost or speed measurements were done (MS-63 and MS-64 stay separately gated).
13. **M02 self-test and RTL.** The M02 self-test hard-codes `unsupported_scripts` as `rtl`, but no profile metadata carries that field, so the case cannot be driven by real data.
14. **Absent profile fields.** `hard_exclusions`, `text_constraints` and `blocks` are absent from every profile, so the eligibility paths that read them see nothing.
15. **Rules with no consumer.** The cadence, word-choreo, type-scale quota, stepped-motion and ground-motion rules have no consumer in any validator or gate yet; the migration table lists them but nothing enforces or relaxes them.
16. **Scene-lane test loader.** The scene-lane test cases need a loader for the CommonJS `createXScene` runtimes (see 10); until one exists they stay unresolved.
17. **Packet shortlist.** `lib/packets.mjs` calls `shortlist` without a `medium`, so a worker packet's technique shortlist is still the DOM-only one; the medium context reaches workers through crew.mjs ctx only.
18. **Inject needs the run.** `video.mjs inject` copies the medium runtime and examples only when called with `--run <run>` or `--medium <file>`; a call without either leaves the project without `assets/rasan-medium/`. Examples are copied per execution directory, not per individual example. `obey.mjs` has no medium consumer.
