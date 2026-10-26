// A fallback is never silent: a script that substitutes something weaker for what the plan asked appends one row to
// <run>/downgrades.jsonl; `console.mjs push` merges unseen rows into session.downgrades (the drawer's "Working without").
// Run: the argument, else env RASANAI_RUN, else the workspace's .rasanai/current (as the live feed finds it), else nothing happens. Never throws, never changes a script's behaviour.
import fs from "node:fs";
import path from "node:path";

export function downgradeFile(run) {
  let r = run || process.env.RASANAI_RUN;
  if (!r) {
    try {
      const d = path.resolve(process.cwd(), fs.readFileSync(path.join(process.cwd(), ".rasanai", "current"), "utf8").trim());
      if (fs.existsSync(path.join(d, "session.json"))) r = d;
    } catch {}
  }
  return r ? path.join(path.resolve(String(r)), "downgrades.jsonl") : null;
}

// severity (optional, default info): how much the row asks of the person. info = a routine fallback, shown as a quiet line;
// notice = worth a glance (a check that could not run); needs-you = only the person can fix it; error = a step failed.
// kind (optional): names a routine, documented adjustment (e.g. "fast-pace"). A row with a kind is not a downgrade: it is told
// as "Adjusted (<kind>): ..." and left out of the drawer's "Working without" group.
export const SEVERITIES = ["info", "notice", "needs-you", "error"];

export function noteDowngrade({ run, what, instead, why, impact, severity, kind } = {}) {
  try {
    const f = downgradeFile(run);
    if (!f || !what || !instead) return null;
    const sev = SEVERITIES.includes(String(severity || "")) ? String(severity) : null;
    const k = kind ? String(kind).toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 40) : null;
    const row = { t: new Date().toISOString(), what: String(what).slice(0, 160), instead: String(instead).slice(0, 160), why: String(why || "").slice(0, 240), ...(impact ? { impact: String(impact).slice(0, 240) } : {}), ...(sev ? { severity: sev } : {}), ...(k ? { kind: k } : {}) };
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.appendFileSync(f, JSON.stringify(row) + "\n");
    return row;
  } catch {
    return null;
  }
}

export function readDowngrades(run) {
  try {
    return fs.readFileSync(downgradeFile(run), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

// The feed line for a row and its session.json activity level. A routine adjustment (a row with a kind) reads "Adjusted"; any
// other row keeps "Working without". The level follows the severity: info -> "adjust", notice -> "notice", needs-you -> "warn", error -> "error".
export function downgradeFeed(d) {
  const because = d.why ? " because " + d.why : "";
  const msg = d.kind ? `Adjusted (${d.kind}): using ${d.instead} instead of ${d.what}${because}` : `Working without ${d.what}: using ${d.instead}${because}`;
  const level = { notice: "notice", "needs-you": "warn", error: "error" }[d.severity] || "adjust";
  return { msg, level };
}
