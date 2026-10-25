// Plan 12 D1: versioned DELIVERY profiles. Extends Plan 02 `destination.mjs` (placement intent, the assumed defaults) and
// `safezones.mjs` (where platform UI sits); it does not replace either and keeps no second copy of their numbers.
//
// Rules this file enforces:
//   - Nothing here is an eternal platform limit. A profile is a record with a `kind`:
//       official_requirement  copied from a platform document: needs `source` (url or title) AND `verified_at`, else it is downgraded
//       house_preference      the owner's own choice; never described as a platform rule
//       assumed_default       RasanAI's starting point; always needs_validation
//   - Unknown or outdated requirements give a WARNING and a configurable export. `complianceNote()` never returns a
//     "compliant" badge; at best it says which dated record the output was checked against.
//   - A global profile update NEVER changes a project's target spec. The project holds a pinned copy (`delivery/target.json`);
//     `migrationOffer()` summarises the impact and only `acceptMigration()` (an explicit call) re-pins.
// No network, no encodes. Reads and writes small JSON files only.
import fs from "node:fs";
import path from "node:path";
import { SCHEMA_VERSION, canonicalDigest } from "./contracts.mjs";
import { DEFAULTS, destinationProfile } from "./destination.mjs";
import { destinationOf, zonesFor } from "./safezones.mjs";
import { impact } from "./impact.mjs";
import { atomicWrite } from "./recovery.mjs";

const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);
const str = (x, d = "") => (typeof x === "string" ? x : d);
const num = (x, d = null) => (Number.isFinite(Number(x)) && x !== null && x !== "" ? Number(x) : d);

export const PROFILE_SCHEMA = 1;
export const KINDS = Object.freeze(["official_requirement", "house_preference", "assumed_default"]);
// how old a verified external rule may get before it is shown as outdated. A default the owner can change per profile (`max_age_days`).
export const DEFAULT_MAX_AGE_DAYS = 180;

const ASPECT_SIZE = { "16:9": [1920, 1080], "9:16": [1080, 1920], "1:1": [1080, 1080], "4:5": [1080, 1350] };
const sizeFor = (aspect) => ASPECT_SIZE[aspect] || ASPECT_SIZE["16:9"];

// o: any subset of the fields below. Unknown fields are ignored; missing ones get configurable defaults and say so in `defaulted`.
export function profileRecord(o = {}) {
  const x = isObj(o) ? o : {};
  const base = DEFAULTS[x.placement_key] || DEFAULTS.unknown;
  const aspect = str(x.aspect, base.aspect);
  const [dw, dh] = sizeFor(aspect);
  const res = isObj(x.resolution) ? { w: num(x.resolution.w, dw), h: num(x.resolution.h, dh) } : { w: dw, h: dh };
  const defaulted = [];
  const pick = (field, v, d) => { if (v === undefined || v === null || v === "") { defaulted.push(field); return d; } return v; };
  const requested = KINDS.includes(x.kind) ? x.kind : "assumed_default";
  const sourced = !!(isObj(x.source) ? (x.source.url || x.source.title) : str(x.source)) && !!x.verified_at;
  // an "official" profile without a source and a date is not official: it falls back to an assumption instead of carrying the word
  const kind = requested === "official_requirement" && !sourced ? "assumed_default" : requested;
  const record = {
    schema_version: SCHEMA_VERSION, profile_schema: PROFILE_SCHEMA,
    id: str(x.id) || `profile-${aspect.replace(":", "x")}-${res.h}`,
    version: Math.max(1, Math.floor(num(x.version, 1))),
    label: str(x.label) || `${aspect} ${res.w}x${res.h}`,
    kind,
    downgraded_from: kind !== requested ? requested : null,
    audience: str(x.audience) || null,                 // who watches
    context: str(x.context) || str(x.placement) || null, // where and how
    placement_key: DEFAULTS[x.placement_key] ? x.placement_key : null,
    aspect, resolution: res,
    expected_playback: isObj(x.expected_playback) ? x.expected_playback : { device: pick("expected_playback", x.device, base.device), size_note: "unknown until the owner records it" },
    duration: isObj(x.duration) ? { min_s: num(x.duration.min_s), max_s: num(x.duration.max_s) } : { ...pick("duration", null, base.duration_envelope) },
    sound_assumption: ["on", "off", "unknown"].includes(x.sound_assumption) ? x.sound_assumption : (defaulted.push("sound_assumption"), base.sound_assumption),
    captions: isObj(x.captions) ? x.captions : { policy: pick("captions", null, base.sound_assumption === "off" ? "burned_in_required" : "sidecar_available"), formats: ["srt", "vtt"], burn_in: "optional_unless_policy" },
    safe_regions: str(x.safe_regions) || null,         // a safezones.mjs destination id; the numbers live there
    codec: isObj(x.codec) ? x.codec : { container: "mp4", video: "h264", audio: "aac", note: "starting point, not a platform requirement" },
    colour: isObj(x.colour) ? x.colour : { space: "bt709", range: "tv", alpha: false },
    audio: isObj(x.audio) ? x.audio : { sample_rate_hz: 48000, channels: 2, loudness_lufs: null, loudness_note: "no target recorded: set one only from a verified source" },
    source: isObj(x.source) ? { url: str(x.source.url) || null, title: str(x.source.title) || null } : (str(x.source) ? { url: null, title: str(x.source) } : null),
    verified_at: x.verified_at && sourced ? String(x.verified_at) : null,
    max_age_days: Math.max(1, Math.floor(num(x.max_age_days, DEFAULT_MAX_AGE_DAYS))),
    defaulted,
  };
  return record;
}

// state of a profile at `now`: verified | outdated | needs_validation | house. Always with the warning the UI must show.
export function profileStatus(p, now = Date.now()) {
  if (p.kind === "house_preference") return { state: "house", warnings: [], needs_validation: false, note: "the owner's own preference; not a platform rule" };
  if (!p.verified_at || !p.source) return { state: "needs_validation", needs_validation: true, warnings: ["no source and date are recorded for this destination's requirements: exporting is allowed, but nothing is claimed to meet them"] };
  const age = (now - Date.parse(p.verified_at)) / 86_400_000;
  if (!Number.isFinite(age)) return { state: "needs_validation", needs_validation: true, warnings: ["verified_at is not a date"] };
  if (age > p.max_age_days) return { state: "outdated", needs_validation: true, warnings: [`these requirements were checked ${Math.floor(age)} days ago (${p.verified_at}); platform rules change, so re-check before relying on them`] };
  return { state: "verified", needs_validation: false, warnings: [] };
}

// there is no "compliant" badge. The most this says is which dated record an output was measured against.
export function complianceNote(p, now = Date.now()) {
  const st = profileStatus(p, now);
  if (st.state === "verified") return `measured against the ${p.source.title || p.source.url} record dated ${p.verified_at}; this is not a platform approval`;
  if (st.state === "house") return "measured against the owner's own preference";
  return null;
}

// measure one planned output against a profile: warnings only; export stays configurable
export function checkOutput(p, o = {}) {
  const w = [...profileStatus(p).warnings];
  const d = p.duration || {};
  if (Number.isFinite(o.duration_s)) { if (d.max_s && o.duration_s > d.max_s) w.push(`duration ${o.duration_s}s is over the recorded ${d.max_s}s`); if (d.min_s && o.duration_s < d.min_s) w.push(`duration ${o.duration_s}s is under the recorded ${d.min_s}s`); }
  if (o.aspect && o.aspect !== p.aspect) w.push(`aspect ${o.aspect} differs from the profile's ${p.aspect}`);
  if (o.width && o.height && (o.width !== p.resolution.w || o.height !== p.resolution.h)) w.push(`size ${o.width}x${o.height} differs from the profile's ${p.resolution.w}x${p.resolution.h}`);
  if (p.captions && p.captions.policy === "burned_in_required" && o.captions_burned === false) w.push("this destination assumes sound is off and the profile asks for burned-in captions");
  return { ok: !w.length, warnings: w, state: profileStatus(p).state };
}

// the safe regions of a profile come from safezones.mjs by id (one table, no copy)
export const safeRegionsOf = (p) => zonesFor(p.safe_regions || destinationOf({ destination: p.placement_key, aspect: p.aspect }), p.aspect);

// ---- built-in starting profiles -----------------------------------------------------------------------------------------------------------
// every one is an assumed_default: a starting point derived from Plan 02 `DEFAULTS`, never a platform claim.
export function builtinProfiles() {
  const mk = (id, label, key, extra = {}) => profileRecord({ id, label, placement_key: key, kind: "assumed_default", ...extra });
  return [
    mk("site-16x9", "Website or YouTube, 16:9", "site", { context: "a page or a channel, usually with sound", safe_regions: "web" }),
    mk("event-16x9", "Conference or screen wall, 16:9", "event", { context: "a room, sound on, no short-ad opening required", safe_regions: "web" }),
    mk("vertical-9x16", "Vertical social, 9:16", "vertical_social", { context: "a phone, sound often off", safe_regions: "vertical" }),
    mk("square-1x1", "Square feed, 1:1", "feed_social", { aspect: "1:1", context: "a feed, sound often off", safe_regions: "feed" }),
    mk("custom-unknown", "Unknown destination (configure me)", "unknown", { context: "not recorded" }),
  ];
}

// ---- the global registry (a user-level file) and the project's pinned target ----------------------------------------------------------------
export function loadRegistry(file) {
  let user = [];
  try { const j = JSON.parse(fs.readFileSync(file, "utf8")); user = arr(j && j.profiles).map(profileRecord); } catch {}
  const byId = new Map(builtinProfiles().map((p) => [p.id, p]));
  for (const p of user) byId.set(p.id, p); // a user record with the same id replaces the starting one
  return [...byId.values()];
}
export function saveProfile(file, input) {
  let cur = []; try { cur = arr(JSON.parse(fs.readFileSync(file, "utf8")).profiles); } catch {}
  const next = profileRecord(input);
  const prev = cur.find((p) => p.id === next.id);
  if (prev) next.version = Math.max(next.version, num(prev.version, 1) + (canonicalDigest(stripVolatile(prev)) === canonicalDigest(stripVolatile(next)) ? 0 : 1));
  atomicWrite(file, JSON.stringify({ schema_version: SCHEMA_VERSION, profiles: [...cur.filter((p) => p.id !== next.id), next] }, null, 2) + "\n");
  return next;
}
const stripVolatile = (p) => { const { version, ...rest } = p || {}; return rest; };
export const profileDigest = (p) => canonicalDigest(stripVolatile(p)).slice(0, 16);

export const targetFile = (run) => path.join(path.resolve(String(run)), "delivery", "target.json");
export function readTarget(run) { try { return JSON.parse(fs.readFileSync(targetFile(run), "utf8")); } catch { return null; } }
// pin the profile a project targets. A copy is stored: the global record may move on, this one does not.
export function pinTarget(run, profile, { by = "owner", reason = "" } = {}) {
  const prev = readTarget(run);
  const t = { schema_version: SCHEMA_VERSION, profile, profile_id: profile.id, profile_version: profile.version, profile_digest: profileDigest(profile), pinned_at: new Date().toISOString(), by, reason: reason || null, previous: prev ? { profile_id: prev.profile_id, profile_version: prev.profile_version, profile_digest: prev.profile_digest } : null };
  atomicWrite(targetFile(run), JSON.stringify(t, null, 2) + "\n");
  return t;
}
const FIELD_IMPACT = {
  aspect: { stage: "build", options: {}, what: "layout: the variant is reflowed through the design system; story, research and valid assets are kept" },
  resolution: { stage: "final", options: { encoding: true }, what: "export size only" },
  duration: { stage: "storyboard", options: { timing: true }, what: "timing: beats are reconciled through the score (the one timing authority)" },
  sound_assumption: { stage: "storyboard", options: {}, what: "a muted-safe or sound-led variant may be needed; captions change" },
  captions: { stage: "final", options: { encoding: true }, what: "caption files and burn-in choice" },
  codec: { stage: "final", options: { encoding: true }, what: "export settings only" },
  colour: { stage: "final", options: { encoding: true }, what: "export settings only" },
  audio: { stage: "final", options: { encoding: true }, what: "mix target and export settings" },
  safe_regions: { stage: "build", options: {}, what: "text and captions are re-checked against the new regions" },
};
// what would change if the project accepted the latest global record. Pure: nothing is written.
export function migrationOffer(pinned, latest) {
  if (!pinned || !latest) return { offer: false, reason: "no pinned target or no newer record" };
  if (pinned.profile_digest === profileDigest(latest)) return { offer: false, reason: "the project already matches the latest record", changes: [] };
  const old = pinned.profile || {};
  const changes = Object.keys(FIELD_IMPACT).filter((f) => canonicalDigest(old[f] ?? null) !== canonicalDigest(latest[f] ?? null)).map((f) => ({ field: f, from: old[f] ?? null, to: latest[f] ?? null, ...FIELD_IMPACT[f] }));
  const stale = new Set();
  for (const c of changes) for (const s of impact(c.stage, [], c.options).stale) stale.add(s);
  return {
    offer: true, from: { id: old.id, version: old.version }, to: { id: latest.id, version: latest.version }, changes,
    stale_stages: [...stale], accepted_exports_untouched: true,
    summary: changes.length ? `${changes.length} field(s) differ: ${changes.map((c) => c.field).join(", ")}. Accepting re-pins the target; already accepted exports keep the spec they were made with.` : "only metadata (source, date, label) differs; the target spec would not change",
  };
}
export function acceptMigration(run, latest, opts = {}) { return pinTarget(run, latest, { ...opts, reason: opts.reason || "migration accepted" }); }

// ---- placement intent decides what a variant needs (Plan 02 brief), never a fixed short-ad template ---------------------------------------------
// brief: a Plan 02 FilmBrief (communication_kind, destination, sound, accessibility, duration). parent: { duration_s, aspect, locale? }
export function variantNeeds({ brief = {}, profile, parent = {} } = {}) {
  const needs = [], why = [];
  const kind = str(brief.communication_kind);
  const dp = isObj(brief.destination_profile) ? brief.destination_profile : destinationProfile({ placement: str(brief.destination), aspect: brief.aspect });
  const short = profile.duration && profile.duration.max_s && Number.isFinite(parent.duration_s) && parent.duration_s > profile.duration.max_s;
  const longerOk = profile.duration && profile.duration.min_s && Number.isFinite(parent.duration_s) && parent.duration_s < profile.duration.min_s;
  const attention = ["vertical_social", "feed_social"].includes(profile.placement_key || dp.placement_key);
  if (parent.aspect && parent.aspect !== profile.aspect) { needs.push("reflow"); why.push(`aspect ${parent.aspect} -> ${profile.aspect}: recompose through the design system`); }
  if (short) { needs.push("shorter_demo"); why.push(`the parent runs ${parent.duration_s}s and this destination records ${profile.duration.max_s}s: shorten the demonstration (retained / shortened / removed beats are recorded)`); }
  if (longerOk) why.push(`the parent is under the recorded ${profile.duration.min_s}s: keep it; a longer cut is not forced`);
  // a clearer opening only where the viewer decides in the first moments (attention feeds). Not forced on a conference film or a site explainer.
  if (attention && !["identity_film", "brand_film", "manifesto"].includes(kind)) { needs.push("clearer_opening"); why.push("a feed viewer decides quickly: check that the first seconds state the proposition"); }
  if (profile.sound_assumption === "off" && !(brief.accessibility && brief.accessibility.muted_safe === false)) { needs.push("muted_safe"); why.push("sound is assumed off: essential meaning must survive through visible content and captions"); }
  if (str(profile.cta_note)) { needs.push("different_cta"); why.push(`this destination records a CTA note: ${str(profile.cta_note).slice(0, 80)}`); }
  if (!needs.length) why.push("no structural change is called for");
  return { needs: [...new Set(needs)], why, forced_short_ad_opening: false };
}
export { SCHEMA_VERSION };
