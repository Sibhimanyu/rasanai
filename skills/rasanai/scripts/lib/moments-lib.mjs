// Reference moments, role-free: where a picked moment goes is a PLACE (a hint about the story), never a fixed slot.
// A manifest's own role tags (hook, proof, turn, cta ...) stay as search hints only.
export const PLACES = ["opening", "between", "peak", "ending", "anywhere"];
export const ROLE_TO_PLACE = { hook: "opening", cta: "ending", setup: "anywhere", proof: "anywhere", turn: "anywhere", payoff: "anywhere" };
// the place a brief entry or credit asks for: place wins, else a legacy role maps, else anywhere
export function placeOf(m) {
  const p = m && m.place != null ? String(m.place).toLowerCase() : "";
  if (PLACES.includes(p)) return p;
  const r = m && m.role != null ? String(m.role).toLowerCase() : "";
  return ROLE_TO_PLACE[r] || "anywhere";
}
// the manifest roles a place searches by, as a hint
export const PLACE_TO_ROLES = { opening: ["hook", "setup"], ending: ["cta", "payoff"], peak: ["turn", "proof"], between: ["proof", "turn", "setup"], anywhere: [] };
// normalise a brief's moments: [{id, place?, role?}] -> [{id, place}] (legacy role mapped, ids unique, at most 4)
export function normalizePicks(list) {
  const seen = new Set(), o = [];
  for (const m of Array.isArray(list) ? list : []) {
    const id = m && typeof m === "object" ? String(m.id || "") : typeof m === "string" ? m : "";
    if (!id || seen.has(id)) continue;
    seen.add(id); o.push({ id, place: placeOf(typeof m === "object" ? m : {}) });
  }
  return o.slice(0, 4);
}
