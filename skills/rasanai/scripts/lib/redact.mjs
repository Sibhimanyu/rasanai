// Plan 11 R4: one redaction policy for everything that leaves a project: logs shown in Studio, telemetry, previews shared outside the project, exported packages and reports.
// Local diagnostic detail stays on disk untouched (nothing here rewrites a file); redaction is applied to what is DISPLAYED, SENT or EXPORTED.
//
//   redact(text)            credentials, auth headers, URL credentials, personal paths -> placeholders (superset of the Plan 10 job-control redact, which now re-exports this)
//   redactDeep(value)       the same over every string in a JSON value (keys named like a secret have their value hidden)
//   findLeaks(value)        -> [{ kind, sample }]: what a scan of an export would still find (never prints the full secret)
//   exportSafe(value)       { value, leaks_before, leaks_after }: redactDeep + proof the result scans clean; sensitive source content is dropped only when marked `sensitive: true`
//   scopedCacheKey(scope, parts)   a cache key / summary label that cannot link two projects (namespaced by project digest, never by a path or a name)
//   syntheticOnly(fixture)  eval fixtures must be synthetic or explicitly approved
// No dependencies, no I/O, no network.
import crypto from "node:crypto";

const KEY_NAME = /(authorization|api[-_ ]?key|token|secret|passw(or)?d|bearer|credential|cookie|session[-_ ]?id|private[-_ ]?key)/i;
const PATTERNS = [
  ["key", /\b(?:sk|pk|rk|ghp|gho|ghs|github_pat|xox[abpr]|AIza|hf|fc)[-_][-_A-Za-z0-9]{12,}/g, "[key]"],
  ["jwt", /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, "[token]"],
  ["auth_header", /\b(authorization|x-api-key|proxy-authorization|cookie|set-cookie)\b\s*[:=]\s*[^\r\n]+/gi, "$1: [hidden]"],
  ["bearer", /\bbearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, "bearer [hidden]"],
  ["secret_assign", /\b(api[-_ ]?key|token|secret|password|passwd|access[-_ ]?key|client[-_ ]?secret)\b\s*[:=]\s*["']?[A-Za-z0-9._~+/=-]{6,}/gi, "$1 [hidden]"],
  ["url_credentials", /\bhttps?:\/\/[^\s/@:]+:[^\s/@]+@/g, "https://[hidden]@"],
  ["url_token", /([?&](?:token|key|api_key|apikey|access_token|sig|signature|t)=)[A-Za-z0-9._~%-]{8,}/gi, "$1[redacted]"],
  ["personal_path", /(?:\/Users|\/home|\/private\/var|\/var\/folders|\/Volumes\/[^/\s]+\/Users|[A-Za-z]:\\Users)[^\s"'`)\]},;]*/g, "a file on this Mac"],
];
export const redact = (text) => PATTERNS.reduce((s, [, re, to]) => s.replace(re, to), String(text ?? ""));

export function redactDeep(v, depth = 0) {
  if (depth > 40) return "[too deep]";
  if (typeof v === "string") return redact(v);
  if (Array.isArray(v)) return v.map((x) => redactDeep(x, depth + 1));
  if (v && typeof v === "object") {
    const o = {};
    for (const [k, x] of Object.entries(v)) o[k] = KEY_NAME.test(k) && typeof x === "string" && x ? "[hidden]" : redactDeep(x, depth + 1);
    return o;
  }
  return v;
}

export function findLeaks(v) {
  const found = [];
  const scan = (s, where) => { for (const [kind, re] of PATTERNS) { re.lastIndex = 0; const m = re.exec(s); if (m) found.push({ kind, where, sample: m[0].slice(0, 6) + "..." }); } };
  const walk = (x, where, depth) => {
    if (depth > 40) return;
    if (typeof x === "string") scan(x, where);
    else if (Array.isArray(x)) x.forEach((y, i) => walk(y, `${where}[${i}]`, depth + 1));
    else if (x && typeof x === "object") for (const [k, y] of Object.entries(x)) { if (KEY_NAME.test(k) && typeof y === "string" && y && y !== "[hidden]") found.push({ kind: "secret_field", where: `${where}.${k}`, sample: y.slice(0, 3) + "..." }); walk(y, `${where}.${k}`, depth + 1); }
  };
  walk(v, "$", 0);
  return found;
}

// an export or shared preview: redacted, then re-scanned. A value marked sensitive (`sensitive: true`, e.g. private transcript text) is replaced by its digest.
export function exportSafe(value) {
  const before = findLeaks(value);
  const strip = (x, depth = 0) => {
    if (depth > 40) return "[too deep]";
    if (Array.isArray(x)) return x.map((y) => strip(y, depth + 1));
    if (x && typeof x === "object") {
      if (x.sensitive === true) return { sensitive: true, withheld: true, sha256: crypto.createHash("sha256").update(JSON.stringify(x)).digest("hex") };
      return Object.fromEntries(Object.entries(x).map(([k, y]) => [k, strip(y, depth + 1)]));
    }
    return x;
  };
  const out = redactDeep(strip(value));
  const after = findLeaks(out);
  return { value: out, leaks_before: before.length, leaks_after: after.length, ok: after.length === 0 };
}

// a cache key or summary label for a SCOPE. Two projects with the same input never share a key; the label contains a digest, not a name or a path.
export function scopedCacheKey(scope = {}, parts = {}) {
  const ns = crypto.createHash("sha256").update(JSON.stringify({ k: scope.kind || "project", p: scope.project || null, u: scope.user || null })).digest("hex").slice(0, 16);
  return `ns-${ns}-` + crypto.createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

// an eval fixture may only carry synthetic or explicitly approved material
export function syntheticOnly(fixture) {
  const f = fixture && typeof fixture === "object" ? fixture : {};
  const ok = f.synthetic === true || (f.approved_for_eval === true && typeof f.approved_by === "string" && f.approved_by.length > 0);
  return { ok, why: ok ? "" : "fixture must be marked synthetic: true, or approved_for_eval with approved_by; private client footage is never copied in for convenience" };
}
