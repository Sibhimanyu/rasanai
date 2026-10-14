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

export function noteDowngrade({ run, what, instead, why, impact } = {}) {
  try {
    const f = downgradeFile(run);
    if (!f || !what || !instead) return null;
    const row = { t: new Date().toISOString(), what: String(what).slice(0, 160), instead: String(instead).slice(0, 160), why: String(why || "").slice(0, 240), ...(impact ? { impact: String(impact).slice(0, 240) } : {}) };
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
