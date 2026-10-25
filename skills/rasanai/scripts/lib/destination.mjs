// Destination and accessibility profile (Plan 02). Platform rules change: nothing here is an eternal limit.
// Unknown placements get configurable defaults flagged needs_validation until someone records verified_at + source.
import { SCHEMA_VERSION } from "./contracts.mjs";

const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);
const str = (x, d = "") => (typeof x === "string" ? x : d);

// defaults are starting points, never claims about a platform
export const DEFAULTS = Object.freeze({
  site: { aspect: "16:9", duration_envelope: { min_s: 20, max_s: 90 }, sound_assumption: "on", device: "desktop" },
  vertical_social: { aspect: "9:16", duration_envelope: { min_s: 6, max_s: 45 }, sound_assumption: "off", device: "phone" },
  feed_social: { aspect: "1:1", duration_envelope: { min_s: 6, max_s: 45 }, sound_assumption: "off", device: "phone" },
  event: { aspect: "16:9", duration_envelope: { min_s: 15, max_s: 120 }, sound_assumption: "on", device: "large_screen" },
  unknown: { aspect: "16:9", duration_envelope: { min_s: 10, max_s: 60 }, sound_assumption: "off", device: "any" },
});
const GUESS = [["vertical_social", /\b(reel|tiktok|shorts|story|stories|vertical|9:16)\b/i], ["feed_social", /\b(feed|linkedin|square|1:1|x\b|twitter)\b/i], ["event", /\b(event|stage|keynote|screen wall)\b/i], ["site", /\b(site|website|landing|homepage|youtube|16:9)\b/i]];

// override fields win over defaults; verified_at + source mark a human-checked profile
export function destinationProfile(o = {}) {
  const text = str(o.placement) || str(o.text);
  const key = DEFAULTS[o.placement_key] ? o.placement_key : (GUESS.find(([, re]) => re.test(text)) || ["unknown"])[0];
  const d = DEFAULTS[key];
  const verified = !!(o.verified_at && o.source);
  const locale = str(o.locale, "en");
  return {
    schema_version: SCHEMA_VERSION, placement: str(o.placement) || key, placement_key: key, aspect: str(o.aspect, d.aspect),
    duration_envelope: isObj(o.duration_envelope) ? o.duration_envelope : { ...d.duration_envelope },
    sound_assumption: ["on", "off", "unknown"].includes(o.sound_assumption) ? o.sound_assumption : d.sound_assumption,
    device: str(o.device, d.device), locale, caption_policy: str(o.caption_policy, d.sound_assumption === "off" ? "burned_in_required" : "captions_on_by_default"),
    required_qualifications: arr(o.required_qualifications), cta: o.cta ? str(o.cta) : "",
    verified_at: verified ? o.verified_at : null, source: verified ? o.source : "",
    needs_validation: !verified, provenance: verified ? "verified" : (DEFAULTS[o.placement_key] || GUESS.some(([, re]) => re.test(text))) ? "RasanAI assumed from placement words" : "RasanAI assumed: unknown placement",
  };
}
export function checkAgainst(profile, { duration_s, aspect } = {}) {
  const w = [];
  const env = profile.duration_envelope || {};
  if (Number.isFinite(duration_s) && env.max_s && duration_s > env.max_s) w.push(`duration ${duration_s}s is over the ${env.max_s}s envelope`);
  if (Number.isFinite(duration_s) && env.min_s && duration_s < env.min_s) w.push(`duration ${duration_s}s is under the ${env.min_s}s envelope`);
  if (aspect && profile.aspect && aspect !== profile.aspect) w.push(`aspect ${aspect} differs from ${profile.aspect}`);
  return { ok: !w.length, warnings: w, needs_validation: !!profile.needs_validation };
}
// one profile per locale; copy, captions and qualifiers are localized per profile, protected text is checked by evidence.checkProtected
export const localeProfiles = (base, locales) => arr(locales).map((l) => destinationProfile({ ...base, locale: l }));
