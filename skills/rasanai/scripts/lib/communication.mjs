// Communication kind (Plan 02): what the film is FOR, orthogonal to the render route (product-launch-video, faceless-explainer, reel...).
// A route decides how it is built; the kind decides audience knowledge, promise, proof and next action. No model: cheap keyword heuristics.
// A saved preference is a default with provenance; the user's own words always win.
import { canonicalDigest, SCHEMA_VERSION } from "./contracts.mjs";

const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);
const str = (x, d = "") => (typeof x === "string" ? x : d);

const K = (audience_knowledge, purpose, promised_outcome, proof_requirement, expected_next_action, channel_roles) => ({ audience_knowledge, purpose, promised_outcome, proof_requirement, expected_next_action, channel_roles });

export const COMMUNICATION_KINDS = Object.freeze({
  "whole-product-introduction": K("cold or lukewarm: has not used it", "say what the product is and who it is for", "the viewer can say in a sentence what it does and whether it is for them", "product UI or real use showing the main jobs; every claim in the ledger", "try, visit or learn more", ["site", "social", "sales"]),
  "single-feature-announcement": K("knows the product", "announce one new or changed capability", "the viewer knows what changed and how to use it", "the feature itself on screen with an observable change; availability and version stated", "try the feature", ["social", "email", "changelog"]),
  "workflow-demo": K("knows the product category", "show a job done start to finish", "the viewer sees the job completed and could repeat it", "a real or recorded workflow; each step on screen in order", "try the workflow", ["site", "docs", "social"]),
  "instructional-explainer": K("curious, not expert", "teach one idea or procedure", "the viewer can explain or do the thing afterwards", "sourced facts; examples that are labelled as examples", "apply it, read more", ["docs", "social", "education"]),
  "brand-manifesto": K("any", "state what the brand believes", "the viewer feels the stance and remembers the brand", "brand kit and the brand's own words; few factual claims", "remember, follow", ["site", "social", "event"]),
  "identity-reveal": K("any", "reveal a new name, logo or identity", "the viewer recognises the new identity", "the real identity assets, approved by the owner", "see the new identity in use", ["social", "site"]),
  "performance-ad": K("cold, scrolling", "win a click in seconds", "the viewer takes the one offered action", "the offer and its qualifiers on screen; real product within the first seconds", "click, install, sign up", ["paid-social", "paid-search"]),
  "teaser": K("any", "create anticipation without telling all", "the viewer wants to see the reveal and knows when", "no claim beyond what is confirmed; a date or place only if confirmed", "come back on a date, follow", ["social", "event"]),
  "event-opener": K("in the room", "open a live moment", "the audience is ready and oriented", "owner-confirmed names, dates and agenda", "stay, watch the next session", ["event", "stream"]),
  "evidence-case-study": K("evaluating", "show a result a customer or study achieved", "the viewer believes the result and sees themselves in it", "named source, numbers with their qualifiers, owner permission to use", "talk to sales, read the case", ["sales", "site"]),
  "character-short": K("any", "tell a short story with a character", "the viewer feels the arc", "none required; any real-world claim still sourced", "watch more", ["social", "festival"]),
  "music-lyric-film": K("any", "give a song a picture", "the viewer feels the song", "the lyrics as supplied; rights to the audio", "listen, share", ["social", "streaming"]),
  "footage-led-story": K("depends on the footage", "find the film inside the user's own footage", "the viewer gets what happened, in the speakers' meaning", "the footage itself; said claims attributed", "depends on the brief", ["site", "social", "event"]),
});
export const KIND_IDS = Object.freeze(Object.keys(COMMUNICATION_KINDS));

export const RELEASE_WORDS = /\b(new release|just (?:launched|released|shipped)|now available|introducing v?\d|version \d|v\d+(?:\.\d+)+|released? (?:today|this week)|changelog|release notes|rolling out|new (?:feature|version|model))\b/i;
const RULES = [
  ["music-lyric-film", /\b(lyric|lyrics|music video|song)\b/i],
  ["footage-led-story", /\b(my footage|raw footage|rushes|our footage|folder of (?:clips|footage)|cut (?:from|together)|talking head|b-?roll)\b/i],
  ["evidence-case-study", /\b(case study|customer story|testimonial|results? (?:from|with)|study (?:shows|found))\b/i],
  ["identity-reveal", /\b(rebrand|new logo|logo reveal|identity reveal|new identity|brand reveal)\b/i],
  ["brand-manifesto", /\b(manifesto|brand film|we believe|brand story)\b/i],
  ["event-opener", /\b(event opener|keynote|opening (?:film|video)|conference|stage intro|walk-?in)\b/i],
  ["teaser", /\b(teaser|coming soon|save the date|sneak peek|countdown)\b/i],
  ["performance-ad", /\b(performance ad|paid (?:social|ad)|\bad\b|advert|ctr|conversion|retarget|\d+\s?s(?:ec(?:ond)?s?)? ad)\b/i],
  ["instructional-explainer", /\b(explainer|explain|how (?:does|do|to)|tutorial|teach|what is)\b/i],
  ["workflow-demo", /\b(workflow|walkthrough|demo|step by step|end to end|how it works)\b/i],
  ["character-short", /\b(character|animated short|story about a|mascot short)\b/i],
  ["single-feature-announcement", /\b(feature announcement|announce(?:ment)?|new feature|feature reveal|update film|what'?s new|changelog)\b/i],
  ["whole-product-introduction", /\b(launch|promo|product (?:film|video|intro)|introduc|intro video|app film|sizzle)\b/i],
];

const assumption = (field, value, provenance) => ({ field, value, provenance });
const textOf = (r) => (typeof r === "string" ? r : [r && r.text, r && r.sentence, r && r.brief, r && r.kind].filter((x) => typeof x === "string").join(" "));

// classify(request, { evidence?, preferences? }) -> { kind, confidence, assumptions:[{field,value,provenance}], route_hint }
// request: text or { text, kind, kind_explicit, promise_scope }. evidence: [{ type, assertion, availability }] used only to find a named new release.
export function classify(request, { evidence = [], preferences = {} } = {}) {
  const text = textOf(request);
  const assumptions = [];
  let kind = null, confidence = "keyword";
  const explicit = isObj(request) && KIND_IDS.includes(request.kind_explicit) ? request.kind_explicit : null;
  if (explicit) { kind = explicit; confidence = "stated"; }
  else for (const [id, re] of RULES) if (re.test(text)) { kind = id; break; }
  const newRelease = RELEASE_WORDS.test(text) || arr(evidence).some((e) => e && e.type !== "unverified" && e.type !== "synthetic_example" && RELEASE_WORDS.test(str(e.assertion) + " " + str(e.availability && e.availability.version)));
  if (kind === "whole-product-introduction" && !explicit) {
    if (newRelease) { kind = "single-feature-announcement"; assumptions.push(assumption("communication_kind", kind, "the text or evidence names a real new release")); }
    else assumptions.push(assumption("communication_kind", kind, "RasanAI assumed: general introduction, not a new release"));
  }
  if (!kind) {
    const pref = preferences && KIND_IDS.includes(preferences.communication_kind) ? preferences.communication_kind : null;
    kind = pref || "whole-product-introduction"; confidence = pref ? "preference" : "default";
    assumptions.push(assumption("communication_kind", kind, pref ? "saved preference (default only; your words win)" : "RasanAI assumed: no purpose stated, general introduction"));
  }
  return { kind, confidence, assumptions, route_hint: isObj(request) && request.route ? request.route : null };
}

// ---- promise scope and must_show -----------------------------------------------
export const PROMISE_SCOPES = ["broad", "single-feature"];
export const VISUAL_SOURCES = ["product_ui", "owner_footage", "user_asset", "public_asset", "screen_recording", "synthetic_example"];
// generated art can decorate but never proves anything
export const NON_PROOF_SOURCES = ["generated_background", "generated_image", "stock", "synthetic_example"];

export function inferPromiseScope(kind, text = "", given = null) {
  if (PROMISE_SCOPES.includes(given)) return { value: given, provenance: "stated" };
  const v = kind === "single-feature-announcement" || (kind === "workflow-demo" && /\bone (?:feature|thing|job)\b/i.test(text)) ? "single-feature" : "broad";
  return { value: v, provenance: "RasanAI assumed from the communication kind" };
}

// must_show item: { id, claim_ref, visual_source, expected_change } ; claim_ref names an evidence id or a claims.json id
export function normalizeMustShow(items, { evidence = [] } = {}) {
  const known = new Set(arr(evidence).map((e) => e && e.id));
  return arr(items).map((raw, i) => {
    const m = isObj(raw) ? raw : { expected_change: str(raw) };
    const src = str(m.visual_source || m.permitted_visual_source);
    const problems = [];
    if (!m.claim_ref) problems.push("claim_ref missing: nothing says what this proves");
    else if (known.size && !known.has(m.claim_ref)) problems.push(`claim_ref ${m.claim_ref} is not in the evidence`);
    if (!VISUAL_SOURCES.includes(src)) problems.push(NON_PROOF_SOURCES.includes(src) ? `${src} cannot count as proof` : "visual_source must be one of " + VISUAL_SOURCES.join(", "));
    if (!str(m.expected_change).trim()) problems.push("expected_change (the observable change) is missing");
    return { id: str(m.id) || `ms${i + 1}`, claim_ref: str(m.claim_ref), visual_source: src, expected_change: str(m.expected_change), counts_as_proof: problems.length === 0 && src !== "synthetic_example", problems };
  });
}

export const kindProfile = (kind) => (COMMUNICATION_KINDS[kind] ? { id: kind, ...COMMUNICATION_KINDS[kind] } : null);
export const kindDigest = () => canonicalDigest({ v: SCHEMA_VERSION, kinds: COMMUNICATION_KINDS });
