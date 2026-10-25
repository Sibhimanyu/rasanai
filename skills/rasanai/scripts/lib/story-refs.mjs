// Format-matched house examples (Plan 03 S5). A writer gets a FEW relevant examples chosen by communication kind and beat role, never the whole shelf.
// Every entry is an original one-sentence summary written for this engine, plus a provenance record pointing at the in-repo, text-only breakdown
// (library/showcases/<id>.json) it was learned from. No studio script or line is copied; no entry is a universal template (a kind-matched example
// informs structure for that kind only).
import fs from "node:fs";
import { SKILL_DIR } from "./common.mjs";
import path from "node:path";

const P = (id) => ({ kind: "house_breakdown", file: `library/showcases/${id}.json`, license: "text-only breakdown authored in this repo; no frames, audio or script text reproduced", copied_text: false });
const R = (id, showcase, kinds, roles, summary, lesson) => ({ id, kinds, roles, summary, lesson, provenance: P(showcase) });

// roles use the grammar role names (lib/story-grammars.mjs); "*" matches any role of the kind
export const HOUSE_REFERENCES = Object.freeze([
  R("ref-intro-swap-slot", "google-ask-search-anything", ["whole-product-introduction", "performance-ad"], ["proposition", "demonstration", "accumulation", "benefit_proof"], "One repeated sentence frame with a single swapped word turns several real capabilities into one cumulative promise.", "breadth through repetition: the frame stays still so the change reads"),
  R("ref-intro-orb-flow", "sovra-fm-launch", ["whole-product-introduction", "workflow-demo"], ["demonstration", "step", "product_response", "result"], "A single moving element passes through the product's real flows so each step is visibly caused by the one before.", "continuity of one carrier between real states"),
  R("ref-feature-ui-grows", "kinso-launch", ["single-feature-announcement", "workflow-demo"], ["task", "feature_behavior", "visible_improvement"], "The real interface grows out of the caption that names the task, so the feature appears as the answer to something the viewer already does.", "start from the task, show the change in the real interface"),
  R("ref-explainer-world", "mexicat-upping-my-pdoom", ["instructional-explainer", "music-lyric-film"], ["context", "mechanism", "consequence", "musical_progression"], "Each spoken line gets a literal picture and a counter climbs under the refrain, so a long argument stays followable.", "one clear picture per line; a running number carries progression"),
  R("ref-manifesto-objects", "pixel-object-manifesto", ["brand-manifesto", "event-opener"], ["observation", "idea", "position", "motif"], "A ring of everyday objects speaks the words and then rearranges into the final word, so the belief is shown by what the objects do.", "abstraction is earned when the shown thing is the stated position"),
  R("ref-identity-construction", "openai-refreshed", ["identity-reveal", "brand-manifesto"], ["element", "system_behavior", "application", "resolution"], "A single mark is constructed from geometry into type, logo, palette and layouts, so the identity is explained by how it is built.", "show the system's logic before its applications"),
  R("ref-identity-specimen", "lilium-specimen", ["identity-reveal", "teaser"], ["element", "clue", "partial_reveal"], "A catalogued specimen supplies letters and crops, so a small set of parts becomes a recognisable whole.", "parts that recombine reveal a system without a narrator"),
  R("ref-grid-ladder", "red-editorial-grid", ["brand-manifesto", "performance-ad", "teaser"], ["observation", "relevance", "clue"], "A single-word ladder on one hairline grid keeps each beat to one idea and lets photographs sit only inside cells.", "constraint as rhythm: one idea per beat"),
  R("ref-reel-material", "claude-motion-reel", ["teaser", "event-opener", "brand-manifesto"], ["motif", "development", "collective_energy"], "One word is pushed through many motion materials so repetition builds energy while the subject stays constant.", "variation on a constant subject builds momentum"),
]);

const BREAKDOWN_DIR = path.join(SKILL_DIR, "library", "showcases");
const exists = (id) => { try { return fs.existsSync(path.join(BREAKDOWN_DIR, `${id}.json`)); } catch { return false; } };

// retrieveReferences({ kind, role?, limit? }) -> [{ id, summary, lesson, provenance, matched }] at most `limit` (default 3); kind first, then role
export function retrieveReferences({ kind, role = null, limit = 3 } = {}) {
  const n = Math.max(1, Math.min(5, Number(limit) || 3));
  const scored = HOUSE_REFERENCES
    .filter((r) => r.kinds.includes(kind))
    .map((r) => ({ r, score: 1 + (role && (r.roles.includes(role) || r.roles.includes("*")) ? 2 : 0) }))
    .sort((a, b) => b.score - a.score || a.r.id.localeCompare(b.r.id));
  return scored.slice(0, n).map(({ r, score }) => ({ id: r.id, summary: r.summary, lesson: r.lesson, provenance: { ...r.provenance, file_present: exists(r.provenance.file.split("/").pop().replace(/\.json$/, "")) }, matched: { kind: true, role: score > 1 } }));
}
