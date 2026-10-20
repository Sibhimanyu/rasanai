// Decision locks: what a closed call froze, and whether a later fix round quietly changed it.
// Closing Story, Look or the Animatic snapshots hashes of the files that call approved; `drift` compares
// the files now against that snapshot. Extends the existing decision log (session.json); not a second store.
// idea from brensterbaz/ai-skills (MIT, ideas only); our code.
// Used by console.mjs (push, resolve, locks, relock). Every result is a WARNING: uncalibrated.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const arr = (x) => (Array.isArray(x) ? x : []);
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o && o[k] !== undefined).map((k) => [k, o[k]]));

const raw = (_, text) => text;
const pickStory = (j) => ({ title: j.title, proposition: j.proposition, beats: arr(j.beats).map((b) => pick(b, ["name", "on_screen", "vo", "line"])) });
const pickIntent = (j) => ({ proposition: j.proposition, beats: arr(j.beats).map((b) => pick(b, ["buys", "relation", "importance", "peak"])) });
const pickClaims = (j) => (Array.isArray(j) ? j : arr(j && j.claims)).map((c) => ({ id: c && c.id, text: c && (c.text !== undefined ? c.text : c.claim) }));
const pickDurations = (j) => ({ scenes: arr(j.scenes).map((s) => pick(s, ["id", "duration"])) });
const pickScoreTiming = (j) => ({ scenes: arr(j.scenes).map((s) => pick(s, ["id", "start", "end"])) });
const pickScoreMotion = (j) => ({ ...j, scenes: arr(j.scenes).map((s) => { const { start, end, ...rest } = s || {}; return rest; }) });

export const LAYERS = {
  story: { step: "story", files: { "story/chosen.json": pickStory, "story/intent.json": pickIntent, "research/claims.json": pickClaims } },
  look: { step: "look", files: { "look/DESIGN.md": raw, "look/frame.md": raw, "motion.md": raw } },
  timing: { step: "animatic", files: { "scenes.json": pickDurations, "motion/score.json": pickScoreTiming } },
  motion: { step: "animatic", files: { "motion/score.json": pickScoreMotion } },
};
export const NOTE_LAYERS = ["story", "look", "timing", "motion", "sound", "production"];

const stable = (v) => (Array.isArray(v) ? v.map(stable) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, stable(v[k])])) : v);
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");

function hashFile(run, rel, picker) {
  let text;
  try { text = fs.readFileSync(path.join(run, rel), "utf8"); } catch { return null; }
  if (picker === raw) return sha(text);
  let json;
  try { json = JSON.parse(text); } catch { return sha(text); }
  if (!json || typeof json !== "object") return sha(text);
  return sha(JSON.stringify(stable(picker(json))));
}

export function snapshot(run, layer) {
  const L = LAYERS[layer];
  if (!L) throw new Error(`unknown layer ${layer}`);
  const files = {};
  for (const [rel, picker] of Object.entries(L.files)) files[rel] = hashFile(run, rel, picker);
  return { layer, at: new Date().toISOString(), files };
}

// locks = session.locks -> [{ layer, file, was, now }]
export function drift(run, locks) {
  const out = [];
  for (const [layer, lock] of Object.entries(locks || {})) {
    const L = LAYERS[layer];
    if (!L || !lock || !lock.files) continue;
    for (const [rel, was] of Object.entries(lock.files)) {
      if (!L.files[rel]) continue;
      const now = hashFile(run, rel, L.files[rel]);
      if (now !== was) out.push({ layer, file: rel, was, now });
    }
  }
  return out;
}

// re-snapshot one layer (a legitimate change) and record why; the caller saves the session
export function relock(run, session, layer, why) {
  session.locks = session.locks || {};
  session.locks[layer] = snapshot(run, layer);
  session.relocks = (session.relocks || []).concat({ layer, at: new Date().toISOString(), why: String(why || "") }).slice(-100);
  return session.locks[layer];
}
