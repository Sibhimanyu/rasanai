// jobs.jsonl (append-only, latest line per job_id wins) + hybrid/generated/<job-id>/{job.json,asset.json} (C4).
import fs from "node:fs";
import path from "node:path";
import { atomicWrite, inside } from "./util.mjs";

export const TERMINAL = new Set(["failed", "cancelled", "delivery-ready"]);
export const hybridDir = (film) => path.join(film, "hybrid");
export const logPath = (film) => path.join(hybridDir(film), "jobs.jsonl");
export const jobDir = (film, id) => inside(film, `hybrid/generated/${id}`);
export const validId = (id) => /^[a-z0-9][a-z0-9-]{2,63}$/.test(String(id));

export function readLog(film) {
  const p = logPath(film);
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}
export function latest(film) {
  const m = new Map();
  for (const l of readLog(film)) if (l.kind !== "consent" && l.job_id) m.set(l.job_id, l);
  return m;
}
export const consentFor = (film, id) => readLog(film).find((l) => l.kind === "consent" && l.job_id === id) || null;

// Terminal states are idempotent: no further lines. Returns the (possibly existing) latest line.
export function append(film, redact, line) {
  const cur = latest(film).get(line.job_id);
  if (cur && TERMINAL.has(cur.state) && line.kind !== "consent") return cur;
  if (cur && cur.state === line.state && line.kind !== "consent" && cur.note === redact(line.note ?? "")) return cur;
  const full = { schema_version: 1, ...line, note: redact(line.note ?? ""), state_at: new Date().toISOString() };
  fs.mkdirSync(hybridDir(film), { recursive: true });
  fs.appendFileSync(logPath(film), redact(JSON.stringify(full)) .replace(/\n/g, " ") + "\n");
  return full;
}
export function readJob(film, id) {
  const p = path.join(jobDir(film, id), "job.json");
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null;
}
export function writeJob(film, id, job) { atomicWrite(path.join(jobDir(film, id), "job.json"), JSON.stringify(job, null, 2) + "\n"); }
