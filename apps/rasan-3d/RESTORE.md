# Restore or reopen this checkpoint

Backups live under `~/Documents/Rasan-3D-Archive/`. `BACKUP-LOCATION.md` records
this checkpoint's exact path. The archive parent's `LATEST.json` is updated only
after successful verification.

Each timestamped checkpoint contains:

- `project/apps/rasan-3d/`: source, native files, GLBs, clips, renders, frame
  sequences, older outputs, package lockfile and Markdown documentation.
- `project/.context/`: selected 3D canon, references, original brief and evidence.
- `START-HERE.md`, `RESTORE.md`, `GIT_STATE.json`, `MANIFEST.json`.
- `rasan-3d-snapshot.tar.gz`: portable copy of the same snapshot.
- `verify_backup.py`, `SHA256SUMS`, `VERIFICATION.json`.

Reinstallable `node_modules` and `.DS_Store` are excluded. The backup is independent
of Git tracking and the original Conductor worktree.

## Reopen directly

Open `project/apps/rasan-3d/crew/Crew.blend` inside the checkpoint, or an individual
native file/MP4. For code, run `npm ci --legacy-peer-deps` in
`project/apps/rasan-3d/`. Copy the snapshot into a new working directory before
editing so the timestamped checkpoint stays unchanged.

## Verify

From a checkpoint directory:

```bash
python3 verify_backup.py
python3 verify_backup.py --archive rasan-3d-snapshot.tar.gz
shasum -a 256 -c SHA256SUMS
```

The verifier checks every captured file against the manifest. The checksum checks
the compressed archive itself. `VERIFICATION.json` records the original checks.

## Extract into a new directory

```bash
mkdir -p /path/to/new-3d-work
tar -xzf /path/to/checkpoint/rasan-3d-snapshot.tar.gz -C /path/to/new-3d-work
cd /path/to/new-3d-work/rasan-3d-snapshot
python3 verify_backup.py
```

The extracted `project/apps/rasan-3d/` is the working project. Its sibling
`project/.context/` restores references at their original relative paths. No
`.git` directory is required to open or run these assets. For Conductor, select
or create the desired workspace in Conductor, then copy the restored project
and context into it, preserving any existing work first.

Read `HANDOFF.md` and `RESUME.md` before overwriting models. Recorded Git state is
provenance; restoring does not check out, reset, commit, stash or push anything.
