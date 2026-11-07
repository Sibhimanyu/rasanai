// The motion contract is frozen when the film builder is briefed: <run>/motion.approved.md is a copy of motion.md as the Look and score were
// approved with. The builder may add to the project's motion.md, never weaken it: a ban or banned entry that was in the approved copy and is
// gone from the build's motion.md fails the builder's check as `contract-weakened`. A ban no checker can test (obey.mjs: no machine signature)
// is a note, never a failure, so there is no reason to delete it to pass a check.
import fs from "node:fs";
import path from "node:path";
import { readFrontmatterDoc } from "./common.mjs";

export const APPROVED_NAME = "motion.approved.md";
export const approvedPath = (run) => path.join(run, APPROVED_NAME);

// Copy <run>/motion.md (or the given file) to motion.approved.md. Called only when the director briefs a builder, so a re-brief after a
// revision round (the user's notes changed motion.md) refreshes the snapshot: the user's change is not "weakening". The builder never calls it.
export function snapshotContract(run, from = path.join(run, "motion.md")) {
  const to = approvedPath(run);
  if (!fs.existsSync(from)) return { written: false, file: to };
  fs.copyFileSync(from, to);
  return { written: true, file: to };
}

const bansOf = (file) => {
  try { const f = readFrontmatterDoc(fs.readFileSync(file, "utf8")).fields || {}; return Array.isArray(f.banned) ? f.banned.map(String) : []; } catch { return null; }
};

// -> { checked: bool, removed: [ban ids] }  (checked false when there is no approved copy or either file cannot be read)
export function contractWeakened(run, current) {
  const a = approvedPath(run);
  if (!fs.existsSync(a) && fs.existsSync(path.join(run, "motion.md"))) return { checked: false, removed: [], missing: true }; // deleted after the brief: not a pass
  if (!fs.existsSync(a) || !current || !fs.existsSync(current)) return { checked: false, removed: [] };
  const was = bansOf(a), now = bansOf(current);
  if (!was || !now) return { checked: false, removed: [] };
  return { checked: true, removed: was.filter((b) => !now.includes(b)) };
}
