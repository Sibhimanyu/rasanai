# Plan 09 handoff to Plan 10: revision progress events

Status: implemented_unvalidated. The engine writes these events; Studio reads them (R07: the engine writes live session state, Studio reads it and appends actions). Nothing here is a UI.

Files, in the run folder:

- `crew/revisions.jsonl`: append-only, one JSON object per line, `seq` increasing.
- `crew/revision-latest.json`: `{ schema_version, revisions: { <revision_id>: <newest event> } }`, rewritten atomically. Read this for the current state, the log for history.
- `crew/jobs/*.json`, `crew/schedule.json`, `crew/pause.json`, `crew/throttle.json`: job state and queue state (see below). `crew.mjs pool status`, `crew.mjs job status` and `crew.mjs schedule` print them.

Write path: `hybrid-render.mjs preview|delivery` emits the render-side events itself; the source transaction (editor patch, console action) emits `source_changed` with `crew.mjs revision emit --event <file.json>`. `lib/revision-events.mjs validateEvent` refuses an event that claims more than it proved.

## Event shape

```json
{
  "schema_version": 1, "type": "revision_progress", "seq": 7, "at": "2026-10-25T10:00:00.000Z",
  "revision_id": "rev-3f2a9c1b7d44",
  "stage": "preview_pending",
  "film": "/abs/path/to/film",
  "source": { "score_revision": null, "source_digest": "<hex>", "edit_id": "e12", "action_id": "a-9d" },
  "scope": { "scenes": ["s3"], "time_range": null },
  "preview": { "state": "pending|ready", "kind": "assembled|affected_frames|changed_group|overlay", "file": "hybrid/renders/preview.mp4" },
  "final": { "state": "rendering|ready", "kind": "assembled", "file": "...", "delivered_kept": null },
  "work": { "reused": ["s1", "s2"], "rebuilt": ["s3"], "pending": [], "invalidation_causes": [], "basis": "dependency_results|plan" },
  "path": { "units": [ { "kind": "scene|group|film", "path": "scene_host|group_host|continuity_group|full_film", "scenes": ["s3"], "handles": [], "reasons": [], "fallbacks": [ { "step": "verified_fragment", "why": "..." } ] } ], "film_wide": false, "capability": { "verified_fragment": false, "why_not": "..." }, "notes": [] },
  "receipt": { "edit_id": "e12", "source_digest": "<hex>", "build_job": "j-...", "attempt": 1, "media_settings": { "mode": "preview", "fps": { "num": 30, "den": 1 }, "size": "1920x1080", "codec": "h264", "frames": 180 }, "output_checksum": "<sha256>" },
  "queue": { "state": "queued|paused|resource_blocked|cancelled", "reason_code": "pool_full" },
  "previous_delivered": { "file": "hybrid/renders/delivery.mp4", "exists": true, "size_bytes": 1234, "frames": 180 },
  "note": ""
}
```

`stage` is one of `source_changed`, `preview_pending`, `preview_ready`, `final_rendering`, `final_ready`, or a side state `failed`, `blocked`, `cancelled`, `stale`.

## Rules the UI can rely on

1. `source_changed` means the source was accepted and nothing has rendered. It never carries a ready preview or final.
2. `preview_ready` and `final_ready` always have a file and a `receipt.output_checksum`, and `receipt.source_digest` equals `source.source_digest`. A nonempty old MP4/PNG is never enough. An overlay preview (`preview.kind: "overlay"`) is ephemeral and is never `preview_ready`.
3. `previous_delivered` names the delivered film that stays valid until `final_ready` replaces it; `final.delivered_kept` is null only once the new file is published.
4. `work.reused` / `work.rebuilt` with `basis: "dependency_results"` come from real render results and dependency keys. `basis: "plan"` is intent (a pending list) and must be shown as expected, not done.
5. `path.units[].fallbacks` lists every safer-but-slower path taken and why (no verified frame-range render, transition overlap, global-time signal, state-dependent effect, inline scene, composited scene). Show them; they are not failures.
6. `queue.reason_code` is one of the admission codes in `lib/resource-pools.mjs` `ADMIT` (`pool_full`, `fair_share_wait`, `memory_pressure`, `memory_pressure_timeout`, `slot_dir_unwritable`, `demand_exceeds_pool`, `wait_timeout`, `cancelled_while_queued`, `user_paused`, `provider_throttled`, `budget_unavailable`, `budget_unknown_conservative`, `limiter_disabled_by_config`). Queue states: `queued`, `admitted`, `running`, `paused`, `resource_blocked`, `cancelled`, `unknown_outcome`, `done`, `failed`.
7. A newer source marks an unfinished earlier revision `stale` (`markStale`); its render output is not published as the revision's.
8. Hand-off to Plan 10's U5/U8: `receipt` is the render receipt that lets an edit move to `rendered` only when it matches the edit's source digest.

## Job and queue state for Working / Waiting / Paused / Rate-limited / Stopped / Failed

- Working: a job in `crew/jobs/` with `state` `leased` or `running`; supervisor heartbeats (`lib/resource-pools.mjs superviseProcess` events: `queued`, `admitted`, `started`, `heartbeat` with rss, `finished|failed|cancelled`).
- Waiting for you: `crew.mjs schedule` -> `user_waits` (a real barrier on Story, Look, Storyboard or Final).
- Paused: `crew/pause.json` `paused: true` (`crew.mjs pool pause|resume`).
- Rate-limited: `crew/throttle.json` entry with `until` in the future.
- Failed / unknown outcome: job `state` `failed` / `unknown_outcome` (reconcile by client id, never resubmit).
