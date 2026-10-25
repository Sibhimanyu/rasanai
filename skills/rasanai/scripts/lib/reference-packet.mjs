// Reference-analysis packet (Plan 02): what was measured, what it is read as, what to take, and what must not be taken.
// Measured numbers (refprofile.mjs) stay separate from interpretation; a reference is filtered by purpose before visual similarity.
import { SCHEMA_VERSION } from "./contracts.mjs";

const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);
const str = (x, d = "") => (typeof x === "string" ? x : d);

export const NON_TRANSFERABLE_DEFAULT = ["logo", "brand name", "characters", "footage", "music", "exact copy", "distinctive composition"];

// observations: [{ metric, value, unit?, source? }] measured only. interpretations: [{ about, reading }] opinions. transfers: [{ element, beat_purpose?, how }].
export function referencePacket(o = {}) {
  const rights = isObj(o.rights) ? o.rights : {};
  return {
    schema_version: SCHEMA_VERSION, id: str(o.id), source: str(o.source), communication_kind: str(o.communication_kind), audience: str(o.audience), beat_purpose: str(o.beat_purpose),
    observations: arr(o.observations).filter((x) => isObj(x) && Number.isFinite(x.value) || (isObj(x) && typeof x.value === "string" && x.measured === true)).map((x) => ({ metric: str(x.metric), value: x.value, unit: str(x.unit), source: str(x.source) })),
    interpretations: arr(o.interpretations).map((x) => ({ about: str(x && x.about), reading: str(x && x.reading), basis: "interpretation" })),
    desired_transfers: arr(o.desired_transfers).map((x) => ({ element: str(x && x.element), beat_purpose: str(x && x.beat_purpose), how: str(x && x.how) })),
    rights: { owner: str(rights.owner), license: str(rights.license, "unknown"), reuse_allowed: rights.reuse_allowed === true },
    non_transferable: [...new Set([...NON_TRANSFERABLE_DEFAULT, ...arr(o.non_transferable)])],
  };
}
export function validateReferencePacket(p) {
  const probs = [];
  if (!isObj(p)) return { ok: false, problems: ["not an object"] };
  if (!p.id) probs.push("id is required");
  for (const t of arr(p.desired_transfers)) if (arr(p.non_transferable).includes(t.element)) probs.push(`transfer "${t.element}" is non-transferable`);
  if (arr(p.desired_transfers).length && !p.rights.reuse_allowed) probs.push("rights unknown or not granted: transfers are style notes only, no assets");
  return { ok: !probs.length, problems: probs };
}
// filter by communication kind, audience and beat purpose FIRST; visual similarity (score) only orders what is left
export function filterReferences(packets, { communication_kind, audience, beat_purpose } = {}) {
  const ok = (v, want) => !want || !v || v === want;
  return arr(packets).filter((p) => ok(p.communication_kind, communication_kind) && ok(p.audience, audience) && ok(p.beat_purpose, beat_purpose)).sort((a, b) => (b.similarity || 0) - (a.similarity || 0) || a.id.localeCompare(b.id));
}
