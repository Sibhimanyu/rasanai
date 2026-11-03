// Copy lint for launch films: the buzzword denylist and the call-to-action shape. One home, read by
//   launch-beats.mjs (score lines and cta), gate-profile.mjs (concept copy) and text-qa.mjs (rendered DOM text, final gate).
// Rules and wording: references/launch-grammar.md section 14. Everything here warns; nothing blocks.
//   buzzwordHits(text)        -> ["seamless", "unlock", ...] the denylist words found
//   buzzwordMessage(where, h) -> one warning line that says what to do instead
//   ctaProblems({text, hold_s}) -> [problem strings] (empty when the CTA is a verb plus a destination, held 2 s or more)

// [label, pattern]: the label is what the warning shows
export const BUZZWORDS = [
  ["revolutionary", /\brevolutionary\b/i],
  ["seamless", /\bseamless(?:ly)?\b/i],
  ["cutting-edge", /\bcutting[-\s]edge\b/i],
  ["next-gen", /\bnext[-\s]gen(?:eration)?\b/i],
  ["game-changing", /\bgame[-\s]chang(?:ing|er|ers)\b/i],
  ["supercharge", /\bsupercharg(?:e|es|ed|ing)\b/i],
  ["unleash", /\bunleash(?:es|ed|ing)?\b/i],
  ["empower", /\bempower(?:s|ed|ing|ment)?\b/i],
  ["leverage", /\bleverag(?:e|es|ed|ing)\b/i],
  ["synergy", /\bsynerg(?:y|ies|istic)\b/i],
  ["AI-powered", /\bai[-\s]powered\b/i],
  ["world-class", /\bworld[-\s]class\b/i],
  ["effortless", /\beffortless(?:ly)?\b/i],
  ["transform your", /\btransform\s+your\b/i],
  ["unlock", /\bunlock(?:s|ed|ing)?\b/i],
  ["best-in-class", /\bbest[-\s]in[-\s]class\b/i],
  ["innovative", /\binnovative\b/i],
  ["robust", /\brobust\b/i],
  ["streamline", /\bstreamlin(?:e|es|ed|ing)\b/i],
  ["elevate", /\belevat(?:e|es|ed|ing)\b/i],
];

export const buzzwordHits = (text) => {
  const t = String(text == null ? "" : text);
  return BUZZWORDS.filter(([, re]) => re.test(t)).map(([label]) => label);
};

export const buzzwordMessage = (where, hits) => `${where} uses buzzword(s) ${hits.map((h) => `"${h}"`).join(", ")}: they say nothing a viewer can check`;
export const BUZZWORD_FIX = "say the specific thing it does (the viewer's outcome, a true number or a concrete detail from research/claims.json); references/launch-grammar.md section 14";

// a CTA is a verb plus a destination: "Download for macOS", "Start your 7-day free trial", "Join the waitlist"
const CTA_VERBS = /^(download|start|join|get|try|sign|book|install|buy|open|request|watch|visit|claim|subscribe|create|build|learn|order|shop|contact|add|see|explore|use|switch|reserve|apply|grab|pre-?order|register|talk|schedule|find|read|take|begin|launch|install|upgrade|play|meet|connect|share|invite|follow|donate|save|send|go|ask|view|check|enroll|play)\b/i;
export const CTA_HOLD_MIN_S = 2;
export function ctaProblems(cta) {
  const P = [], text = String(cta && typeof cta === "object" ? cta.text || "" : cta || "").trim();
  if (!text) return ["no call to action text"];
  const w = text.split(/\s+/).filter(Boolean);
  if (!CTA_VERBS.test(text)) P.push(`"${text}" starts with no verb (a CTA is a verb plus a destination: "Download for macOS", "Join the waitlist")`);
  else if (w.length < 2) P.push(`"${text}" is a bare verb: add the destination ("Download for macOS", "Start your 7-day free trial")`);
  if (cta && typeof cta === "object" && cta.hold_s != null) { const h = Number(cta.hold_s); if (Number.isFinite(h) && h < CTA_HOLD_MIN_S) P.push(`the CTA is held ${h} s (${CTA_HOLD_MIN_S} s at least, so it can be read and acted on)`); }
  return P;
}
