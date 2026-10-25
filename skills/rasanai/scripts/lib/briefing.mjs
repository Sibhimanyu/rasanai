// compileBriefing (Plan 02): one consolidated, normalized FilmBrief package from the brief inputs.
// Stable for identical inputs (key-sorted, digest by contracts.canonicalDigest). A correction is an explicit versioned action
// that reports which downstream stages go stale (impact.mjs); answered choices are never reopened.
import { canonicalDigest, defaultFilmBrief, SCHEMA_VERSION, validateFilmBrief } from "./contracts.mjs";
import { impact } from "./impact.mjs";
import { classify, inferPromiseScope, kindProfile, normalizeMustShow } from "./communication.mjs";
import { evidenceRefs, freshness } from "./evidence.mjs";
import { destinationProfile } from "./destination.mjs";

const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);
const str = (x, d = "") => (typeof x === "string" ? x : d);
const sortKeys = (v) => (Array.isArray(v) ? v.map(sortKeys) : isObj(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v);

export const EDITABLE_FIELDS = ["communication_kind", "viewer", "destination", "scope", "takeaway", "duration", "aspect", "must_show", "sound", "accessibility", "approval_mode", "brand", "locales"];

// inputs: { text, request?, viewer, takeaway, duration, aspect, destination (string|obj), promise_scope, must_show, evidence:[records],
//           brand:{ kit, source, authority }, preferences, locales, answered:{ field: value }, route, now }
export function compileBriefing(inputs = {}) {
  const i = isObj(inputs) ? inputs : {};
  const answered = isObj(i.answered) ? i.answered : {};
  const evidence = arr(i.evidence);
  const assumed = [];
  const note = (a) => { for (const x of a) assumed.push(x); };

  // the user's explicit words win; an answered choice is never reopened; a preference only fills a gap
  const cls = classify({ text: str(i.text), kind_explicit: answered.communication_kind || i.kind_explicit, route: i.route }, { evidence, preferences: i.preferences });
  note(cls.assumptions);
  const kind = cls.kind;
  const scope = inferPromiseScope(kind, str(i.text), answered.promise_scope || i.promise_scope);
  if (scope.provenance !== "stated") assumed.push({ field: "scope", value: scope.value, provenance: scope.provenance });

  const dest = destinationProfile(isObj(i.destination) ? i.destination : { placement: str(i.destination), text: str(i.text), aspect: i.aspect, locale: arr(i.locales)[0] });
  if (dest.needs_validation) assumed.push({ field: "destination", value: dest.placement, provenance: dest.provenance + "; platform rules need validation" });
  const viewer = str(answered.viewer || i.viewer);
  if (!viewer) assumed.push({ field: "viewer", value: kindProfile(kind).audience_knowledge, provenance: "RasanAI assumed from the communication kind" });
  const takeaway = str(answered.takeaway || i.takeaway);
  if (!takeaway) assumed.push({ field: "takeaway", value: kindProfile(kind).promised_outcome, provenance: "RasanAI assumed from the communication kind" });

  const must = normalizeMustShow(i.must_show, { evidence });
  const stale = evidence.filter((e) => freshness(e, { now: i.now }).recheck).map((e) => e.id).sort();
  const brand = isObj(i.brand) ? { source: str(i.brand.source), authority: str(i.brand.authority, "brand_kit"), kit: str(i.brand.kit) } : null;

  const brief = sortKeys({
    ...defaultFilmBrief({
      communication_kind: kind, viewer: viewer || kindProfile(kind).audience_knowledge, destination: dest.placement, scope: scope.value, takeaway: takeaway || kindProfile(kind).promised_outcome,
      duration: Number.isFinite(i.duration) ? i.duration : dest.duration_envelope.max_s, aspect: str(i.aspect, dest.aspect), must_show: must,
      evidence_refs: evidenceRefs(evidence), sound: { music: true, voiceover: dest.sound_assumption !== "off" ? !!(i.sound && i.sound.voiceover) : false }, accessibility: { captions: true, reduced_motion_safe: true, caption_policy: dest.caption_policy },
    }),
    destination_profile: dest, brand, locales: arr(i.locales).length ? arr(i.locales) : [dest.locale], stale_evidence: stale, rasanai_assumed: assumed, editable_fields: EDITABLE_FIELDS, revision: 1,
  });
  const problems = [...validateFilmBrief(brief).problems, ...must.flatMap((m) => m.problems.map((p) => `must_show ${m.id}: ${p}`))];
  return { schema_version: SCHEMA_VERSION, brief, digest: canonicalDigest(brief), problems, ok: !problems.length };
}

// correction: { field, value, reason? } on a compiled package. Versioned, explicit; returns the new package + the stale stages.
// Only the changed field moves; other answered fields stay as they are.
export function correctBriefing(pkg, correction = {}) {
  if (!pkg || !pkg.brief) return { ok: false, error: "no briefing package" };
  const { field, value } = correction;
  if (!EDITABLE_FIELDS.includes(field)) return { ok: false, error: `field ${JSON.stringify(field)} is not editable` };
  const brief = sortKeys({ ...pkg.brief, [field]: value, revision: (pkg.brief.revision || 1) + 1, rasanai_assumed: arr(pkg.brief.rasanai_assumed).filter((a) => a.field !== field) });
  const result = { schema_version: SCHEMA_VERSION, brief, digest: canonicalDigest(brief), problems: validateFilmBrief(brief).problems };
  result.ok = !result.problems.length;
  return { ok: result.ok, package: result, action: { type: "correct_brief", field, from_revision: pkg.brief.revision || 1, to_revision: brief.revision, reason: str(correction.reason), previous_digest: pkg.digest }, ...impact("brief", [field], {}) };
}
