// A motion-language term (taxonomy/dimensions/motion-language.json) as a full motion
// spec: the option's contract gives the binding numbers (eases, duration scale, stagger,
// hold, bans); the preview choreography (how text enters in a swatch) borrows the
// nearest calibrated swatch in personalities/. The build itself is Claude's.
import { getPersonality, registerLanguageResolver, die } from "./common.mjs";
import { findOption } from "./taxonomy.mjs";
import { applyAdjustments } from "./adjust.mjs";

// swatch choreography per language (engine demo moves); checked by selftest to obey the language's own bans
export const SWATCH_BASE = {
  smooth: "soft-drift", snappy: "swiss-precise", elastic: "elastic-playful", springy: "elastic-playful", bouncy: "elastic-playful",
  playful: "elastic-playful", character: "elastic-playful", cartoonish: "elastic-playful", mechanical: "retro-terminal", precise: "swiss-precise", robotic: "swiss-precise",
  linear: "swiss-precise", "luxurious-slow": "luxe-minimal", cinematic: "cinematic-slow", organic: "soft-drift", fluid: "liquid-morph",
  liquid: "liquid-morph", floating: "soft-drift", weightless: "soft-drift", heavy: "kinetic-punch", "physics-based": "kinetic-punch",
  inertial: "swiss-precise", gestural: "editorial-mask", "handmade-imperfect": "editorial-mask", "stop-motion-like": "brutalist-step",
  "choppy-stepped": "brutalist-step", glitchy: "brutalist-step", chaotic: "kinetic-punch", generative: "liquid-morph", procedural: "swiss-precise",
  rhythmic: "kinetic-punch", "beat-synchronized": "kinetic-punch", "speech-synchronized": "kinetic-punch",
};

// the personality-shaped object motion-md.mjs, tasting.mjs and obey.mjs understand
export function languagePersonality(id) {
  const [term, ...adj] = String(id).replace(/^lang-/, "").split("+");
  if (adj.length) return applyAdj(languagePersonality(term), adj);
  const hit = findOption("motion-language", term);
  if (!hit) die(`unknown motion language "${term}" (see: node taxonomy.mjs show motion-language)`);
  id = term;
  const o = hit.option;
  const c = o.contract;
  const base = getPersonality(SWATCH_BASE[id] || "swiss-precise");
  const S = c.scale_ms;
  return {
    id: `lang-${id}`,
    name: o.term,
    oneLiner: o.what,
    language: id,
    feel: [],
    median_likelihood: null,
    tempo: { scale_ms: S },
    easing: { enter: c.enter, exit: c.exit, move: c.move },
    stagger: { each_ms: c.stagger_ms },
    holds: { min_ms: c.hold_ms },
    entrances: base.entrances,
    exits: base.exits,
    transitions: base.transitions,
    banned: c.banned || ["fade-up-slide"],
    ...(c.curves ? { curves: { ...c.curves } } : {}),
    ...(c.overshoot ? { overshoot: { ...c.overshoot } } : {}),
    demo: { ...base.demo, enter_ms: S[2], move_ms: S[3], exit_ms: S[1], hold_ms: Math.max(c.hold_ms, base.demo.hold_ms) },
    swatch_base: base.id,
    prompt: o.prompt,
  };
}

// "lang-snappy+slower": the adjusted variant, same adjective table as motion-md.mjs
function applyAdj(p, adj) {
  return applyAdjustments(p, adj);
}
registerLanguageResolver({
  has: (id) => !!findOption("motion-language", id.replace(/^lang-/, "")),
  get: (id) => languagePersonality(id),
});
