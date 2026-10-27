// Reference-analysis packet (Plan 02): what was measured, what it is read as, what to take, and what must not be taken.
// Measured numbers (refprofile.mjs) stay separate from interpretation; a reference is filtered by purpose before visual similarity.
import { createHash } from "node:crypto";
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

// ---------------------------------------------------------------- mechanism entries (v3 W07)
// A mechanism entry is the compact, honest record a worker packet carries for ONE event problem: the perceptual job, the action phases, the exact source
// pointer + hash, runtime, dependencies, limits, the visual neighbourhood and what the demo's look must not be inherited. It carries no finished layout,
// palette, copy or asset. Consumers: medium-examples.mjs mechanismPacketSection (rows) and, via W10 packets.mjs, the worker packet.
export const MECHANISM_ACCESS = Object.freeze(["readable", "reference-only", "unavailable"]);
export const MECHANISM_METHOD = Object.freeze(["known", "unknown-method"]);
// what is never inherited from any mechanism source, whatever its licence says about code
export const NOT_INHERITED_DEFAULT = Object.freeze(["demo palette", "demo layout or card composition", "demo copy and narrative", "branded assets (logo, font, photo, audio): a code licence does not grant them"]);
const AGPL = /\b(a?gpl|affero)/i;
const sha = (v) => createHash("sha256").update(typeof v === "string" ? v : JSON.stringify(v)).digest("hex");
export const canonicalDigest = (v) => sha(canon(v));
function canon(v) { return Array.isArray(v) ? `[${v.map(canon).join(",")}]` : isObj(v) ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(",")}}` : JSON.stringify(v === undefined ? null : v); }
const dep = (d) => (isObj(d) ? { name: str(d.name), available: d.available !== false, note: str(d.note) } : { name: str(d), available: true, note: "" });

// raw: { id, perceptual_job, phases:[str|{name,start?,end?}], source:{ref,url?,revision?,hash?}, runtime, dependencies:[str|{name,available}], limitations:[], not_inherited:[],
//        neighbourhood:{ before, after, carries, hold }, method_status, access, licence, alternative, parameters }
// -> normalized entry; never upgrades: unknown access/hash stays reference-only/null, an unavailable dependency marks usable:false and keeps the alternative.
export function mechanismEntry(raw = {}) {
  const o = isObj(raw) ? raw : {};
  const src = isObj(o.source) ? o.source : { ref: str(o.source) };
  const deps = arr(o.dependencies).map(dep);
  const hash = /^[0-9a-f]{64}$/i.test(str(src.hash)) ? str(src.hash).toLowerCase() : null;
  const declared = MECHANISM_ACCESS.includes(o.access) ? o.access : "reference-only";
  const access = declared === "readable" && !hash && !str(src.ref) ? "reference-only" : declared;
  const nb = isObj(o.neighbourhood) ? o.neighbourhood : {};
  const limits = arr(o.limitations).map(str).filter(Boolean);
  const method = MECHANISM_METHOD.includes(o.method_status) ? o.method_status : "known";
  if (method === "unknown-method") limits.push("method not known: only what was visibly observed is claimed; no port or API is implied");
  if (access !== "readable") limits.push(`source ${access}: reference-only, no tested port is claimed`);
  if (!hash && access === "readable") limits.push("source hash not recorded");
  const missing = deps.filter((d) => !d.available).map((d) => d.name);
  if (missing.length) limits.push(`dependency unavailable here: ${missing.join(", ")}${str(o.alternative) ? `; authorized alternative: ${str(o.alternative)}` : "; use only an authorized supported alternative"}`);
  if (AGPL.test(str(o.licence))) limits.push("ideas-only licence policy: restate the principle in original code and wording");
  return {
    id: str(o.id), perceptual_job: str(o.perceptual_job),
    phases: arr(o.phases).map((p) => (isObj(p) ? { name: str(p.name), ...(Number.isFinite(p.start) ? { start: p.start } : {}), ...(Number.isFinite(p.end) ? { end: p.end } : {}) } : { name: str(p) })).filter((p) => p.name),
    source: { ref: str(src.ref), url: str(src.url), revision: str(src.revision), access }, hash, runtime: str(o.runtime), dependencies: deps, limitations: [...new Set(limits)],
    not_inherited: [...new Set([...NOT_INHERITED_DEFAULT, ...arr(o.not_inherited).map(str).filter(Boolean)])],
    neighbourhood: { before: str(nb.before), after: str(nb.after), carries: str(nb.carries), hold: str(nb.hold) },
    method_status: method, usable: !missing.length && !AGPL.test(str(o.licence)) && access !== "unavailable", state: access === "readable" ? "source-inspected" : "reference-only",
  };
}
export function validateMechanismEntry(e) {
  const probs = [];
  if (!isObj(e)) return { ok: false, problems: ["not an object"] };
  if (!e.id) probs.push("id is required");
  if (!e.perceptual_job) probs.push("perceptual_job is required: say what the viewer must perceive");
  if (!arr(e.phases).length) probs.push("phases: name the action phases (at least one)");
  if (!isObj(e.source) || (!e.source.ref && !e.source.url)) probs.push("source: an exact pointer (ref or url) is required");
  if (isObj(e.source) && e.source.url && !e.source.revision) probs.push("source.url needs a pinned revision");
  if (!isObj(e.neighbourhood) || !(e.neighbourhood.before || e.neighbourhood.after)) probs.push("neighbourhood: record what prepared the event and how it is held");
  return { ok: !probs.length, problems: probs };
}
