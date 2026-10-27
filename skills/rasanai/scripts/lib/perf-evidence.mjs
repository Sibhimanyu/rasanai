// Performance evidence hooks (Plan 09 P8). Records what happened; claims nothing. No benchmark is run here and no speedup is asserted: Plan 14 measures bounded concurrency
// levels on matched tasks and chooses defaults from quality, throughput and cost.
//
// Rows are appended to <run>/crew/perf.jsonl: { at, kind, ... } with kinds
//   node        a production node finished: { node_id, resource_class, queue_wait_s, active_s, duration_s, temperature: cold|warm, outcome, failed, cache: hit|miss|rebuilt, causes }
//   render      a render or encode: { render_s, encode_s, peak_rss_mb (null when not observable), frames }
//   usage       tokens for the node (lib/usage.mjs counters, null when unreported) INCLUDING failed workers
//   run         a whole run's critical path summary
// summarize(rows, graph) computes the critical path (the longest chain of node durations through the graph's prerequisites), the sum of queue waits and active time, hits vs misses,
// invalidation causes by part, cold vs warm separately, and failure cost. A column nobody measured stays null, never 0.
import fs from "node:fs";
import path from "node:path";

const arr = (x) => (Array.isArray(x) ? x : []);
const num = (x) => (x !== null && x !== undefined && x !== "" && Number.isFinite(Number(x)) ? Number(x) : null);
export const file = (run) => path.join(path.resolve(String(run)), "crew", "perf.jsonl");

// temperature: "cold" = the first build of this key set in this run (cache had nothing), "warm" = at least one input was reused
export function recordPerf(run, row) {
  const r = { at: new Date().toISOString(), kind: row.kind || "node", ...row };
  for (const k of ["queue_wait_s", "active_s", "duration_s", "render_s", "encode_s", "peak_rss_mb"]) if (k in r) r[k] = num(r[k]);
  if (r.temperature && !["cold", "warm"].includes(r.temperature)) r.temperature = null;
  fs.mkdirSync(path.dirname(file(run)), { recursive: true });
  fs.appendFileSync(file(run), JSON.stringify(r) + "\n");
  return r;
}
export function readPerf(run) { try { return fs.readFileSync(file(run), "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch { return []; } }

// the longest chain through the graph by measured duration; a node without a measurement contributes null and is listed, never guessed
export function criticalPath(graph, rows) {
  const dur = new Map(); for (const r of rows) if (r.kind === "node" && num(r.duration_s) !== null) dur.set(r.node_id, num(r.duration_s));
  const by = new Map(arr(graph && graph.nodes).map((n) => [n.id, n]));
  const memo = new Map(), unmeasured = new Set();
  const best = (id, trail = new Set()) => {
    if (memo.has(id)) return memo.get(id);
    if (trail.has(id)) return { len: 0, chain: [] };
    const n = by.get(id); if (!n) return { len: 0, chain: [] };
    trail.add(id);
    let top = { len: 0, chain: [] };
    for (const p of n.prerequisites || []) { const c = best(p, trail); if (c.len > top.len) top = c; }
    trail.delete(id);
    const d = dur.get(id); if (d === undefined) unmeasured.add(id);
    const r = { len: top.len + (d || 0), chain: [...top.chain, id] }; memo.set(id, r); return r;
  };
  let winner = { len: 0, chain: [] };
  for (const n of arr(graph && graph.nodes)) { const c = best(n.id); if (c.len > winner.len) winner = c; }
  return { duration_s: winner.chain.length ? Math.round(winner.len * 10) / 10 : null, chain: winner.chain, unmeasured: [...unmeasured].sort(), note: "the sum of measured node durations along the longest prerequisite chain; unmeasured nodes count as zero here and are listed" };
}
const sum = (xs) => { const v = xs.map(num).filter((x) => x !== null); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) * 10) / 10 : null; };
export function summarize(rows = [], graph = null) {
  const nodes = rows.filter((r) => r.kind === "node"), renders = rows.filter((r) => r.kind === "render"), usage = rows.filter((r) => r.kind === "usage");
  const split = (t) => nodes.filter((r) => r.temperature === t);
  const causes = {};
  for (const r of nodes) for (const c of arr(r.causes)) causes[c.part || String(c)] = (causes[c.part || String(c)] || 0) + 1;
  const failed = nodes.filter((r) => r.outcome === "failed" || r.failed);
  return {
    schema_version: 1,
    critical_path: graph ? criticalPath(graph, rows) : null,
    queue_wait_s: sum(nodes.map((r) => r.queue_wait_s)), active_agent_s: sum(nodes.filter((r) => /model|agent/.test(r.resource_class || "")).map((r) => r.active_s)),
    render_s: sum(renders.map((r) => r.render_s)), encode_s: sum(renders.map((r) => r.encode_s)),
    peak_rss_mb: renders.map((r) => num(r.peak_rss_mb)).filter((x) => x !== null).reduce((a, b) => Math.max(a, b), 0) || null,
    cache: { hits: nodes.filter((r) => r.cache === "hit").length, misses: nodes.filter((r) => r.cache === "miss" || r.cache === "rebuilt").length },
    invalidation_causes: causes,
    cold: { n: split("cold").length, duration_s: sum(split("cold").map((r) => r.duration_s)) }, warm: { n: split("warm").length, duration_s: sum(split("warm").map((r) => r.duration_s)) },
    failures: { n: failed.length, duration_s: sum(failed.map((r) => r.duration_s)), tokens: sum(usage.filter((r) => r.outcome === "failed").map((r) => r.total_reported ?? r.output)) },
    tokens_total: sum(usage.map((r) => r.total_reported ?? r.output)),
    note: "evidence only. Cold and warm runs are never averaged together, no linear speedup is claimed from the worker count, and a counter nobody reported is null (never 0)",
  };
}

// the rows graph.mjs chooseWorkers reads (crew/throughput.jsonl): a batch of `items` finished in `window_s` with `workers` running. Observed, never projected.
export function recordThroughput(run, { workers, items, window_s, queue_wait_s = null }) {
  const w = num(workers), n = num(items), t = num(window_s);
  if (!(w >= 1) || !(n >= 0) || !(t > 0)) return { ok: false, reason: "workers >= 1, items >= 0 and window_s > 0 are required" };
  const row = { at: new Date().toISOString(), workers: w, items: n, window_s: t, items_per_min: Math.round((n / t) * 60 * 100) / 100, queue_wait_s: num(queue_wait_s) };
  const f = path.join(path.dirname(file(run)), "throughput.jsonl");
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.appendFileSync(f, JSON.stringify(row) + "\n");
  return { ok: true, row };
}

// ---- V3 W08 (additive): medium behaviour evidence rows -------------------------------------------------------------------------------------------
// kind "medium": { execution_id, behavior_id, level: declared|source_present|executed|visually_demonstrated, event_id?, interval?, refs? } appended to the same perf.jsonl.
// summarize() ignores kinds it does not know, so existing summaries are unchanged. Records only; "visually_demonstrated" must come from a person or a frame/temporal review, never from a render finishing.
export const MEDIUM_EVIDENCE_LEVELS = ["declared", "source_present", "executed", "visually_demonstrated"];
export function recordMediumEvidence(run, { execution_id, behavior_id, level, event_id = null, interval = null, refs = [] } = {}) {
  if (!execution_id || !behavior_id || !MEDIUM_EVIDENCE_LEVELS.includes(level)) return { ok: false, reason: "execution_id, behavior_id and a known level are required" };
  return { ok: true, row: recordPerf(run, { kind: "medium", execution_id, behavior_id, level, event_id, interval, refs: arr(refs).filter((x) => typeof x === "string") }) };
}
// -> { [execution_id:behavior_id]: { level, n } } (highest level seen; the shape resolveMediumPerformance reads once mapped to flags)
export function summarizeMediumEvidence(rows = []) {
  const out = {};
  for (const r of rows) {
    if (r.kind !== "medium") continue;
    const k = `${r.execution_id}:${r.behavior_id}`, i = MEDIUM_EVIDENCE_LEVELS.indexOf(r.level);
    if (i < 0) continue;
    const cur = out[k];
    out[k] = { level: cur && MEDIUM_EVIDENCE_LEVELS.indexOf(cur.level) > i ? cur.level : r.level, n: (cur ? cur.n : 0) + 1 };
  }
  return out;
}
export const evidenceFlags = (level) => { const i = MEDIUM_EVIDENCE_LEVELS.indexOf(level); return Object.fromEntries(MEDIUM_EVIDENCE_LEVELS.map((l, j) => [l, i >= 0 && j <= i])); };
