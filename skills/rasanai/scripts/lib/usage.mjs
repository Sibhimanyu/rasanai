// Usage records (Plan 08 K7): what a dispatched member cost, without pretending an estimate is a measurement.
//   - every counter is a number or null; null means "the provider did not say", never 0
//   - reasoning tokens are `reasoning_included_in_output` true | false | null; they are never added to output a second time
//   - an API-equivalent estimate is a separate block from billed cost and subscription usage; with no price table it is null (no prices are hardcoded here)
//   - active work time is kept apart from approval waits, rate-limit waits and rendering
//   - `purpose` makes avoidable work visible: rejected alternatives and repeated research
//   - private input and credentials never reach a record: redact() runs on every free-text field
// Telemetry is read from what the provider interface exposes (a --usage file, or counters on crew.mjs check). No direct-API key path is added.
import fs from "node:fs";

export const COUNTERS = ["input_uncached", "cache_creation", "cache_read", "output", "reasoning"];
export const PURPOSES = ["selected", "rejected_alternative", "repeated_research", "repair", "retry", "bookkeeping", "other"];
export const OUTCOMES = ["ok", "failed", "cancelled", "unknown"];
export const TIME_KEYS = ["active_s", "approval_wait_s", "rate_limit_wait_s", "render_s"];

const num = (x) => (x === null || x === undefined || x === "" || !Number.isFinite(Number(x)) || Number(x) < 0 ? null : Math.round(Number(x)));
const secs = (x) => (x === null || x === undefined || x === "" || !Number.isFinite(Number(x)) || Number(x) < 0 ? null : Math.round(Number(x) * 10) / 10);

const SECRET = [
  /\b(sk|pk|rk)-[A-Za-z0-9_-]{16,}\b/g, /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/gi, /\b(?:api[_-]?key|token|secret|password|authorization)\s*[:=]\s*\S+/gi,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, /\bAKIA[0-9A-Z]{16}\b/g, /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
];
// redact credentials and the person's home directory; approved private paths are replaced by their role when `private_paths` is given
export function redact(text, { private_paths = [], home = process.env.HOME || "" } = {}) {
  let s = String(text == null ? "" : text);
  for (const re of SECRET) s = s.replace(re, "[redacted]");
  for (const p of private_paths) if (p) s = s.split(p).join("[private path]");
  if (home && home.length > 1) s = s.split(home).join("~");
  return s;
}

// provider counters arrive under different names; accept the common ones, keep unknown as null
export function normalizeCounters(raw = {}) {
  const r = raw && typeof raw === "object" ? raw : {};
  const pick = (...ks) => { for (const k of ks) if (r[k] !== undefined && r[k] !== null) return num(r[k]); return null; };
  const out = {
    input_uncached: pick("input_uncached", "input_tokens", "uncached_input_tokens", "prompt_tokens"),
    cache_creation: pick("cache_creation", "cache_creation_input_tokens", "cache_write_tokens"),
    cache_read: pick("cache_read", "cache_read_input_tokens", "cached_input_tokens", "cached_tokens"),
    output: pick("output", "output_tokens", "completion_tokens"),
    reasoning: pick("reasoning", "reasoning_tokens", "thinking_tokens"),
  };
  return out;
}

// -> one usage record (the shape written to crew/ledger.jsonl `usage` and returned by workers as `usage`)
export function usageRecord(o = {}) {
  const counters = normalizeCounters(o.counters || o);
  const rii = o.reasoning_included_in_output;
  const total_reported = num(o.total_reported ?? o.tokens); // the old `check --tokens N` figure: a total of unknown composition
  return {
    schema_version: 1,
    role: o.role || null, key: o.key || null, model: o.model || null,
    ...counters,
    reasoning_included_in_output: typeof rii === "boolean" ? rii : null,
    total_reported,
    turns: num(o.turns), retries: num(o.retries),
    outcome: OUTCOMES.includes(o.outcome) ? o.outcome : "unknown",
    purpose: PURPOSES.includes(o.purpose) ? o.purpose : "other",
    time: Object.fromEntries(TIME_KEYS.map((k) => [k, secs(o.time && o.time[k])])),
    source: o.source || (counters.output !== null || counters.input_uncached !== null ? "provider" : total_reported !== null ? "reported_total" : "unavailable"),
    packet_estimated_tokens: num(o.packet_estimated_tokens), // an ESTIMATE of the inline packet, not a tokenizer count
    api_equivalent: o.prices ? apiEquivalent(counters, o.prices) : null,
    billed: o.billed && typeof o.billed === "object" ? { amount: Number.isFinite(Number(o.billed.amount)) ? Number(o.billed.amount) : null, currency: o.billed.currency || null } : null,
    subscription: o.subscription && typeof o.subscription === "object" ? { plan: o.subscription.plan || null, limit_state: o.subscription.limit_state || null } : null,
    note: o.note ? redact(o.note, o).slice(0, 300) : undefined,
  };
}

// prices: { per_mtok: { input_uncached, cache_creation, cache_read, output }, currency }; supplied by the person's config, never defaulted here.
// Reasoning is not added again when the provider includes it in output (or when inclusion is unknown: then it is left out and flagged).
export function apiEquivalent(counters, prices) {
  const pm = prices && prices.per_mtok;
  if (!pm) return null;
  const parts = {}; let total = 0, missing = [];
  for (const k of ["input_uncached", "cache_creation", "cache_read", "output"]) {
    if (counters[k] === null || counters[k] === undefined) { missing.push(k); continue; }
    if (!Number.isFinite(Number(pm[k]))) { missing.push(k + ":price"); continue; }
    parts[k] = (counters[k] / 1e6) * Number(pm[k]); total += parts[k];
  }
  return { estimate: true, currency: prices.currency || null, total: missing.length === 4 ? null : Math.round(total * 1e6) / 1e6, parts, missing, basis: "API-equivalent estimate from the supplied price table; not what was billed" };
}

const add = (a, b) => (b === null ? a : (a === null ? 0 : a) + b);
// aggregate rows: a counter no row reported stays null; `partial` lists counters some rows lacked, so a sum is never read as complete
export function summarize(rows = []) {
  const rs = (Array.isArray(rows) ? rows : []).map((r) => (r && r.schema_version === 1 && "outcome" in r ? r : usageRecord(r || {})));
  const sum = { n: rs.length, ...Object.fromEntries(COUNTERS.map((k) => [k, null])), total_reported: null, turns: null, retries: null, failed: 0, cancelled: 0, partial: [], by_purpose: {}, time: Object.fromEntries(TIME_KEYS.map((k) => [k, null])) };
  for (const r of rs) {
    for (const k of [...COUNTERS, "total_reported", "turns", "retries"]) sum[k] = add(sum[k], r[k]);
    for (const k of TIME_KEYS) sum.time[k] = add(sum.time[k], r.time[k]);
    if (r.outcome === "failed") sum.failed++; if (r.outcome === "cancelled") sum.cancelled++;
    const bp = (sum.by_purpose[r.purpose] ||= { n: 0, output: null, total_reported: null });
    bp.n++; bp.output = add(bp.output, r.output); bp.total_reported = add(bp.total_reported, r.total_reported);
  }
  for (const k of COUNTERS) if (sum[k] !== null && rs.some((r) => r[k] === null)) sum.partial.push(k);
  sum.avoidable = { rejected_alternative: sum.by_purpose.rejected_alternative || null, repeated_research: sum.by_purpose.repeated_research || null };
  sum.note = "null = not reported by the provider (never 0); counters in `partial` are sums over the rows that reported them";
  return sum;
}

export function readUsageFile(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}
