// A film's shape: six aspects, each a slug from a small fixed vocabulary, written by the Motion Director in
// motion/score.json ("shape") and recorded on delivery (memory.mjs record-film). The next film must differ from each of the
// last 3 in at least 4 of the 6 aspects (lemo-opuscar: "at least four of six aspects must differ"), so a studio's films
// don't all come out as the same film. Slugs come from references/story.md (structure, ending), craft.md (opening, signature),
// cinematography.md (camera) and sound.md (music).
export const ASPECTS = ["structure", "opening", "signature", "camera", "music", "ending"];
export const MIN_DIFFER = 4;
export const RECENT = 3;
export const SHAPE_VOCAB = {
  structure: ["ladder", "problem-solution", "intercut", "single-scenario", "tour", "countdown", "montage", "one-take", "before-after", "manifesto"],
  opening: ["product-first", "cold-word", "question", "big-number", "cursor-typing", "in-medias-res", "logo-first", "silence-then-hit", "object-reveal", "grid-build"],
  signature: ["carried-object", "match-cut-chain", "type-morph", "mask-wipe", "ui-choreography", "depth-fly-through", "zoom-through", "shared-element", "grid-shuffle", "whip-pan"],
  camera: ["locked-off", "slow-push", "orbit-3d", "handheld-drift", "flat-pans", "whip-cuts", "zoom-through", "multi-plane-parallax"],
  music: ["pulse-driven", "ambient-pad", "cinematic-swell", "minimal-click", "beat-cut", "sound-design-only", "vocal-led", "piano-led"],
  ending: ["logo-lockup", "one-line-hold", "loop-back", "cta-card", "product-resting", "blackout", "punchline", "pull-back"],
};

// -> [] when valid, else the problems (missing aspects, slugs off the vocabulary with what is allowed)
export function shapeProblems(shape) {
  if (!shape || typeof shape !== "object" || Array.isArray(shape)) return [`shape must be an object {${ASPECTS.join(", ")}}`];
  const p = [];
  for (const a of ASPECTS) {
    const v = shape[a];
    if (v == null || v === "") p.push(`shape.${a} is missing (one of: ${SHAPE_VOCAB[a].join(", ")})`);
    else if (!SHAPE_VOCAB[a].includes(v)) p.push(`shape.${a} "${v}" is not in the vocabulary (one of: ${SHAPE_VOCAB[a].join(", ")})`);
  }
  return p;
}
export const sharedAspects = (a, b) => ASPECTS.filter((k) => a && b && a[k] && a[k] === b[k]);

// recent = [{title, date, shape}] (newest last) -> [{title, date, shared:[aspects], differ:n}] for each film too close
export function tooClose(shape, recent) {
  return (recent || []).map((f) => ({ title: f.title, date: f.date, shared: sharedAspects(shape, f.shape) }))
    .map((f) => ({ ...f, differ: ASPECTS.length - f.shared.length })).filter((f) => f.differ < MIN_DIFFER);
}
export const shapeLine = (s) => ASPECTS.map((a) => `${a}: ${s && s[a] || "?"}`).join(", ");
