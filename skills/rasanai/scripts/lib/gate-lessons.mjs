// Gate thresholds the user tightened through a lesson (lessons.mjs add … --gate <key>=<value>): a mistake the user pointed
// out once becomes a measured check on every next film (mortiflix's "a real mistake becomes a check"). A lesson can only
// tighten a gate, never loosen it: the strictest of the default and every lesson wins.
//
//   import { gateValue, gateLessons } from "./gate-lessons.mjs";
//   const endHold = gateValue("motion.end_hold_s", 1.5);   // -> 1.2 when a lesson set it, else 1.5
//   gateLessons()                                          // -> [{key, value, id, rule}] in force, for the gate's report
//
// RASANAI_NO_LESSON_GATES=1 turns them off (tests, a one-off waiver).
import { readLessons } from "../lessons.mjs";

// key -> which way is stricter ("min": a bigger value is stricter; "max": a smaller one), the allowed range, and what it does
export const GATE_KEYS = {
  "text.read_per_word_s": { dir: "min", range: [0.2, 0.8], what: "reading time per word of a statement line (textfit text-too-brief)" },
  "text.statement_min_h": { dir: "min", range: [0.02, 0.12], what: "every readable line of 3+ words at least this share of the frame height (textfit text-too-small; off until a lesson sets it)" },
  "motion.end_hold_s": { dir: "max", range: [0.3, 3], what: "the end card's stillness after its last move (motion gate freeze)" },
  "motion.freeze_s": { dir: "max", range: [0.3, 2], what: "a still stretch this long fails (motion gate freeze)" },
  "motion.carry_share": { dir: "min", range: [0.2, 1], what: "share of seams carried, measured from the pixels (motion gate carry)" },
  "film.ending_share_max": { dir: "max", range: [0.1, 0.5], what: "the last beat's share of the film (motion gate long-ending)" },
  "frame.text_load_max": { dir: "max", range: [10, 120], what: "median characters on screen before text-load is an error (frame gate)" },
  "sound.payoff_lift_db": { dir: "min", range: [1, 12], what: "the payoff window's lift over the 1.5 s before it (sound check flat-payoff)" },
};

export function parseGate(spec) {
  const m = String(spec || "").match(/^\s*([a-z_.]+)\s*=\s*(-?[\d.]+)\s*$/);
  if (!m) throw new Error(`--gate wants <key>=<number>, one of: ${Object.keys(GATE_KEYS).join(", ")}`);
  const k = GATE_KEYS[m[1]];
  if (!k) throw new Error(`unknown gate key ${m[1]}: one of ${Object.keys(GATE_KEYS).join(", ")}`);
  const v = Number(m[2]);
  if (!(v >= k.range[0] && v <= k.range[1])) throw new Error(`${m[1]} must be between ${k.range[0]} and ${k.range[1]}`);
  return { key: m[1], value: v };
}

export function gateLessons() {
  if (process.env.RASANAI_NO_LESSON_GATES === "1") return [];
  let rows = [];
  try { rows = readLessons(); } catch { return []; }
  return rows.filter((r) => r && r.gate && GATE_KEYS[r.gate.key] && Number.isFinite(Number(r.gate.value))).map((r) => ({ key: r.gate.key, value: Number(r.gate.value), id: r.id, rule: r.rule }));
}

// the strictest of the fallback and every lesson for this key; fallback null = off unless a lesson sets it
export function gateValue(key, fallback) {
  const k = GATE_KEYS[key];
  if (!k) throw new Error(`unknown gate key ${key}`);
  const vals = gateLessons().filter((g) => g.key === key).map((g) => g.value);
  if (fallback != null) vals.push(fallback);
  if (!vals.length) return null;
  return k.dir === "min" ? Math.max(...vals) : Math.min(...vals);
}

// one line per lesson in force for these keys, for a gate's report ("tightened by the user's lesson …")
export function gateNotes(keys) {
  return gateLessons().filter((g) => keys.includes(g.key)).map((g) => `${g.key} = ${g.value} (the user's lesson ${g.id}: ${g.rule})`);
}
