# Releasing

Releases MUST go through `scripts/release.mjs` (Node 20+, `gh` logged in, `git`). Do not release by hand.

```
node scripts/release.mjs skill  <x.y.z> --title "<headline>"
node scripts/release.mjs studio <x.y.z> [--build N] [--title "<headline>"]
```

Put the notes under `## Unreleased` in `CHANGELOG.md` (skill) or `apps/macos/CHANGELOG.md` (Studio) first. Add `--dry-run` to either command to print every step without changing anything.

## What each command does

**skill**: bumps the four version spots (`skills/rasanai/VERSION`, `skills/rasa-director/VERSION`, `.claude-plugin/plugin.json`, the rasa-director entry in `marketplace.json`), turns `## Unreleased` into `## x.y.z (date): headline`, opens a PR, squash-merges it, waits until it is MERGED, tags `vx.y.z` on the merge commit, creates the GitHub release (`--latest`, notes from the CHANGELOG), then deletes the branch.

**studio**: bumps `apps/macos/Info.plist` (build defaults to the highest of the live feed and master, plus 1) and the Studio CHANGELOG, PR, merge, wait for MERGED. Dispatches `studio-release-candidate.yml` (enable_updates=true), waits for it, downloads the DMG (with retries), checks the app inside (version, build, signing key against the embedded `SUPublicEDKey`, feed URL), copies it to `.context/studio-latest/RasanAI Studio.app`, signs it with Sparkle `sign_update --account rasanai-studio`, creates the prerelease `studio-vX.Y.Z-beta.N` (N counts up) with the DMG, `.sha256` and `COMMUNITY-INSTALL.md`, then adds the appcast item (pubDate is the release's real publish time) in a second PR, waits for MERGED, waits for the `site` workflow, and polls the live feed until the top item is the new version. Only then it prints "Users will now be offered X.Y.Z". Sparkle tools are found via `SPARKLE_BIN`, `apps/macos/.build/artifacts/sparkle/Sparkle/bin`, the greenroom `.sparkle-tools`, or downloaded to `~/.cache/rasanai-release`.

All repo edits happen in a temporary worktree off `origin/master`; your working tree is never touched. A branch is deleted only after its PR is MERGED.

Each step prints how long it took, and the run ends with a `== timings` summary.

Agents run releases through the `release-runner` agent (Haiku, `.claude/agents/release-runner.md`) in the background.

## Resume

Every step checks whether it is already done (PR merged, tag, release, appcast item, feed live) and skips. Progress is kept in `.release-state/<kind>-<version>.json` (gitignored). If a step fails, the script prints the exact command; run it again. A failed build run is dropped from the state, so resuming re-dispatches it.

## Verify and status

```
node scripts/release.mjs verify-studio   # live feed top == latest studio release; enclosure URL, size and Ed25519 signature check out
node scripts/release.mjs status          # skill VERSION vs latest tag; Studio release vs Info.plist vs live feed (read-only)
```

`status` prints `RELEASED BUT FEED NOT LIVE` when a Studio release exists that the live appcast does not yet offer.
