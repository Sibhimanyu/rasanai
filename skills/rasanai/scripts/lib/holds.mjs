// Declared holds (references/score.md, "Holds"): a beat may say it stands still on purpose, because the user asked for it ("calmer", "let it
// breathe") or the craft wants it. A scene carries `hold: {s, reason: "user-note" | "craft", at?}` (or a list of them): s seconds, starting at
// `at` seconds into the beat (default: the tail of the beat). A freeze, an end-hold, dead air or a meaningless-stillness finding inside a
// hold's range becomes a note (the finding stays visible, it just does not fail the build). Caps: a hold is at most 3 s, the end card's at
// most 4 s; the part past the cap is NOT covered. Used by motion-gate.mjs, slop.mjs and lib/launch-gates.mjs.
export const HOLD_MAX_S = 3;
export const HOLD_END_MAX_S = 4;
export const HOLD_REASONS = ["user-note", "craft"];

const num = (v) => (v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null);

// plan: the score (motion/score.json) with scenes[] {start, end, hold}. -> [{from, to, reason, beat, declared_s, capped}]
export function holdRanges(plan) {
  const sc = plan && (Array.isArray(plan.scenes) ? plan.scenes : Array.isArray(plan.beats) ? plan.beats : []);
  if (!sc || !sc.length) return [];
  const out = [];
  let t = 0;
  sc.forEach((b, i) => {
    const start = num(b && b.start) ?? t;
    const end = num(b && b.end) ?? start + (num(b && (b.duration ?? b.duration_s)) || 0);
    t = end;
    const hs = b && b.hold ? (Array.isArray(b.hold) ? b.hold : [b.hold]) : [];
    const last = i === sc.length - 1 || /^(end|cta|payoff-end)/i.test(String((b && (b.role || b.beat || b.kind)) || ""));
    for (const h of hs) {
      const s = num(h && h.s);
      if (!(s > 0) || !HOLD_REASONS.includes(String(h.reason || ""))) continue; // a hold without a length and a reason is not a hold
      const cap = last ? HOLD_END_MAX_S : HOLD_MAX_S, len = Math.min(s, cap);
      const at = num(h.at);
      const from = at != null ? start + at : Math.max(start, end - len);
      out.push({ from, to: from + len, reason: String(h.reason), beat: b.id || b.n || i + 1, declared_s: s, capped: s > cap });
    }
  });
  return out;
}

// the finding's range [from, to] lies inside a declared hold (0.15 s of slack for frame sampling) -> the hold, else null
export function holdCovering(holds, from, to = from) {
  if (!Array.isArray(holds) || !holds.length || !Number.isFinite(from)) return null;
  const a = from, b = Number.isFinite(to) ? Math.max(from, to) : from;
  return holds.find((h) => a >= h.from - 0.15 && b <= h.to + 0.15) || null;
}

export const holdNote = (h) => `declared hold (${h.reason}, beat ${h.beat}, ${Math.round(h.from * 100) / 100} to ${Math.round(h.to * 100) / 100} s)`;
