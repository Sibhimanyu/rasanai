// Reference recipe: turns contract-A `analysis` observations (reference-motion.json) into recipe[] and a crew packet.
// Deterministic and model-free: same JSON in, same text out. Zero dependencies. No Date, no Math.random.
//
//   import { buildRecipe, renderCrewPacket, renderCadenceStrip } from "./index.mjs";
//   buildRecipe(json)        -> recipe[] {observation, viewer_effect, transferable_mechanic, candidate_move, not_transferable[],
//                               basis: "measured"|"interpretation", tentative: boolean}
//   renderCrewPacket(json)   -> markdown string, <= 60 lines
//   renderCadenceStrip(json) -> number[] (shot lengths, longest = 1, 3 decimals)
//
// candidate_move values are the RasanAI move vocabulary of references/moves.md (generators G1..G20), written as plain ids:
//   hold-then-cut (G18), match-cut-carrier (G4/G2), letter-edge-matte (G6/G5), scale-through (G3), delete-to-create (G17),
//   morph-chain (G15), oner-camera-path (G14), cursor-as-character (G11), container-swap (G13), kinetic-semantics (G12),
//   scatter-and-assembly (G19), ui-element-becomes-stage (G9), number-becomes-object (G10), rule-and-break (G18).
// "none" marks an entry that carries no mechanic (palette, uncertainty). A reference suggests mechanics only; product
// truth, story and brand overrule it. Palette, logos, footage, audio and verbatim copy are never transferred.

export const MOVE_VOCAB = Object.freeze({
  "hold-then-cut": "G18 rule and break",
  "match-cut-carrier": "G4 object-born transition / G2 shape rhyme",
  "letter-edge-matte": "G6 mask-from-content / G5 negative-space reveal",
  "scale-through": "G3 scale-through",
  "delete-to-create": "G17 delete to create",
  "morph-chain": "G15 morph chain",
  "oner-camera-path": "G14 oner logic",
  "cursor-as-character": "G11 cursor as character",
  "container-swap": "G13 container swap",
  "kinetic-semantics": "G12 kinetic semantics",
  "scatter-and-assembly": "G19 scatter and assembly",
  "ui-element-becomes-stage": "G9 UI element becomes stage",
  "number-becomes-object": "G10 number becomes object",
  "rule-and-break": "G18 rule and break",
});

export const NOT_TRANSFERABLE = Object.freeze([
  "logos and brand marks",
  "footage and stills",
  "unlicensed audio",
  "verbatim copy",
  "the brand palette",
]);

const r = (n, d = 2) => Number(n.toFixed(d));
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const arr = (v) => (Array.isArray(v) ? v : []);
const text = (v) => (typeof v === "string" ? v : v == null ? "" : JSON.stringify(v));

function analysisOf(json) {
  return json && typeof json === "object" && json.analysis && typeof json.analysis === "object" ? json.analysis : {};
}

// Shot lengths in seconds: from shots[] when present, else from cuts_s and duration_s.
function shotLengths(a) {
  const shots = arr(a.shots).filter((s) => s && num(s.start_s) != null && num(s.end_s) != null && s.end_s > s.start_s);
  if (shots.length) return shots.map((s) => s.end_s - s.start_s);
  const cuts = arr(a.cuts_s).filter((c) => num(c) != null).sort((x, y) => x - y);
  const dur = num(a.duration_s);
  if (!cuts.length || dur == null) return dur ? [dur] : [];
  const edges = [0, ...cuts, dur];
  const out = [];
  for (let i = 1; i < edges.length; i++) if (edges[i] > edges[i - 1]) out.push(edges[i] - edges[i - 1]);
  return out;
}

export function renderCadenceStrip(json) {
  const lens = shotLengths(analysisOf(json));
  const max = Math.max(0, ...lens);
  return max > 0 ? lens.map((l) => r(l / max, 3)) : [];
}

function cadenceClass(mean) {
  if (mean < 1) return "rapid";
  if (mean < 2.5) return "brisk";
  if (mean < 5) return "measured";
  return "slow";
}

const CADENCE = {
  rapid: {
    effect: "Reads as urgent and dense; the eye never settles, so each beat must be legible in under a second.",
    mech: "One idea per cut, every shot built around a single readable element; the cut itself is the rhythm.",
    move: "rule-and-break",
  },
  brisk: {
    effect: "Reads as confident and energetic with room for one clear thought per shot.",
    mech: "Short shots with one moving carrier handed from shot to shot.",
    move: "match-cut-carrier",
  },
  measured: {
    effect: "Reads as calm and explanatory; the viewer has time to study the product.",
    mech: "Fewer, longer shots where one real surface changes state while the camera stays steady.",
    move: "container-swap",
  },
  slow: {
    effect: "Reads as unhurried and premium; attention is held on one continuous surface.",
    mech: "Long takes that travel through the product instead of cutting away.",
    move: "oner-camera-path",
  },
};

// keyword -> {effect, mech, move}; first matching rule wins, so order is priority.
const PATTERN_RULES = [
  { keys: ["mask", "matte", "wipe", "reveal", "knockout"], effect: "Content appears through a shape, so the shape feels like a door.",
    mech: "A letter or shape edge acts as the window onto the next content.", move: "letter-edge-matte" },
  { keys: ["match cut", "match-cut", "morph", "shape rhyme", "momentum"], effect: "Continuity of shape or velocity makes two beats feel like one.",
    mech: "One carrier keeps its position or velocity across the cut.", move: "match-cut-carrier" },
  { keys: ["panel expand", "expand", "container", "card to"], effect: "A real component growing into the screen makes the product feel spatial.",
    mech: "A UI component expands to become the next environment.", move: "ui-element-becomes-stage" },
  { keys: ["zoom", "push-in", "push in", "scale-through", "scale through"], effect: "Scale change reads as travelling into the thing, with no cut felt.",
    mech: "An element grows until it becomes the next ground.", move: "scale-through" },
  { keys: ["cursor", "click", "tap", "hover"], effect: "A visible pointer gives the screen a cause and a protagonist.",
    mech: "The cursor hesitates, hunts and clicks, and the UI responds to it.", move: "cursor-as-character" },
  { keys: ["scatter", "explode", "burst", "assemble"], effect: "Parts arriving or leaving with visible physics feels energetic and crafted.",
    mech: "Pieces fly in with a visible cause and assemble into the hero.", move: "scatter-and-assembly" },
  { keys: ["delete", "erase", "strip back"], effect: "Taking away to find the end state feels deliberate and clever.",
    mech: "The end state emerges by deleting in a readable order.", move: "delete-to-create" },
  { keys: ["count", "counter", "number", "stat"], effect: "A changing number gives the beat a measurable payoff.",
    mech: "The figure is shown as the thing it counts, or counts to a landing value on the beat.", move: "number-becomes-object" },
  { keys: ["pan", "dolly", "tracking", "camera move", "orbit", "parallax"], effect: "Continuous camera travel hides the joins and feels premium.",
    mech: "One camera path carries the viewer through consecutive states.", move: "oner-camera-path" },
  { keys: ["shake", "bounce", "overshoot", "snap", "pop"], effect: "Springy impact makes elements feel physical and alive.",
    mech: "Overshoot-and-settle easing on the hero element at each hit.", move: "kinetic-semantics" },
];

const TYPE_RULES = [
  { keys: ["mask", "outline", "knockout", "cut-out", "cutout", "behind"], effect: "Type that doubles as a window ties the words to the picture.",
    mech: "The type's own edge is the matte for the next content.", move: "letter-edge-matte" },
  { keys: ["kinetic", "word-by-word", "per word", "per-word", "word by word"], effect: "Words arriving one at a time pace the reading to the cut.",
    mech: "Each word enters on its own beat, in reading order.", move: "kinetic-semantics" },
  { keys: ["typewriter", "type-on", "typing", "caret"], effect: "Typing on reads as live, with the caret as a pacing device.",
    mech: "Text types on at product speed with a visible caret.", move: "cursor-as-character" },
  { keys: ["scale", "huge", "oversized", "full-frame", "full frame"], effect: "Type that fills the frame becomes the stage rather than a caption.",
    mech: "Large type is the carrier; the real UI lands inside or behind it.", move: "scale-through" },
];

function firstMatch(rules, hay) {
  for (const rule of rules) if (rule.keys.some((k) => hay.includes(k))) return rule;
  return null;
}

function lowShare(a) {
  const shots = arr(a.shots);
  if (!shots.length) return 0;
  return shots.filter((s) => s && String(s.confidence).toLowerCase() === "low").length / shots.length;
}

function entry(observation, basis, effect, mech, move, tentative, extraNot = []) {
  return {
    observation,
    viewer_effect: effect,
    transferable_mechanic: mech,
    candidate_move: move,
    not_transferable: [...extraNot, ...NOT_TRANSFERABLE].filter((v, i, l) => l.indexOf(v) === i),
    basis,
    tentative: !!tentative,
  };
}

export function buildRecipe(json) {
  const a = analysisOf(json);
  const out = [];
  const lens = shotLengths(a);
  const wideLow = lowShare(a) >= 0.5; // pattern-level claims inherit doubt when most shots are low confidence

  if (lens.length >= 2) {
    const mean = lens.reduce((s, x) => s + x, 0) / lens.length;
    const cls = cadenceClass(mean);
    const c = CADENCE[cls];
    out.push(entry(
      `${lens.length} shots, mean ${r(mean)} s, shortest ${r(Math.min(...lens))} s, longest ${r(Math.max(...lens))} s (${cls} cadence)`,
      "measured", c.effect, c.mech, c.move, false));

    const sorted = [...lens].sort((x, y) => x - y);
    const median = sorted[Math.floor(sorted.length / 2)];
    const longest = Math.max(...lens);
    if (lens.length >= 4 && longest >= 2.5 * median && longest > 1) {
      const at = lens.indexOf(longest) + 1;
      out.push(entry(
        `Shot ${at} holds ${r(longest)} s against a median of ${r(median)} s`,
        "measured",
        "A held shot among quick ones lands as the payoff; the pause makes the next cut hit harder.",
        "Establish the cut rhythm, hold one beat noticeably longer, then cut.",
        "hold-then-cut", false));
    }
  } else if (lens.length === 1) {
    out.push(entry(`One continuous shot of ${r(lens[0])} s, no cuts`, "measured",
      CADENCE.slow.effect, CADENCE.slow.mech, "oner-camera-path", false));
  }

  const hits = arr(a.sound_hits_s).filter((h) => num(h) != null);
  const cuts = arr(a.cuts_s).filter((c) => num(c) != null);
  if (hits.length && cuts.length) {
    const near = cuts.filter((c) => hits.some((h) => Math.abs(h - c) <= 0.1)).length;
    if (near / cuts.length >= 0.5) {
      out.push(entry(`${near} of ${cuts.length} cuts land within 0.1 s of a sound hit`, "measured",
        "Picture and sound hit together, which makes the edit feel tight and intentional.",
        "Place cuts and key motion on the score's hits; the hit is the cue, the audio itself is not reused.",
        "match-cut-carrier", false, ["the reference's audio itself"]));
    }
  }

  const arc = arr(a.energy_arc).filter((v) => num(v) != null);
  if (arc.length >= 3) {
    let pk = 0;
    arc.forEach((v, i) => { if (v > arc[pk]) pk = i; });
    const pos = pk / (arc.length - 1);
    const late = pos >= 0.75;
    const early = pos <= 0.25;
    const shape = late ? "builds to a late peak" : early ? "front-loads its energy then settles" : "peaks mid-film";
    out.push(entry(
      `Energy arc ${shape} (peak at shot ${pk + 1} of ${arc.length}, ${r(arc[pk])})`,
      "interpretation",
      late ? "A rising arc gives the ending weight." : early ? "A strong opening hooks, then calmer shots let the message land." : "A mid peak gives a clear climax and a graceful resolve.",
      late ? "Increase density and scale of each beat toward the final beat." : early ? "Open on the boldest move, then reduce density." : "Place the boldest move in the middle and resolve with a calm hold.",
      late ? "rule-and-break" : "hold-then-cut", wideLow));
  }

  const seen = new Set();
  for (const p of arr(a.motion_patterns)) {
    const rule = firstMatch(PATTERN_RULES, text(p).toLowerCase());
    if (rule && !seen.has(rule.move)) {
      seen.add(rule.move);
      out.push(entry(`Motion pattern: ${text(p)}`, "interpretation", rule.effect, rule.mech, rule.move, wideLow));
    }
  }

  const seenType = new Set();
  for (const t of arr(a.type_treatment)) {
    const rule = firstMatch(TYPE_RULES, text(t).toLowerCase());
    if (rule && !seenType.has(rule.move)) {
      seenType.add(rule.move);
      out.push(entry(`Type: ${text(t)}`, "interpretation", rule.effect, rule.mech, rule.move, wideLow,
        ["the reference's typeface and wording"]));
    }
  }

  // Dominant per-shot motion role, only when no pattern entry already covers its move.
  const roleShots = arr(a.shots).filter((s) => s && s.motion_role);
  if (roleShots.length) {
    const counts = new Map();
    for (const s of roleShots) counts.set(s.motion_role, (counts.get(s.motion_role) || 0) + 1);
    const [role, n] = [...counts.entries()].sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1))[0];
    const rule = firstMatch(PATTERN_RULES, String(role).toLowerCase());
    if (rule && !seen.has(rule.move)) {
      const tent = roleShots.filter((s) => s.motion_role === role).every((s) => String(s.confidence).toLowerCase() === "low");
      out.push(entry(`Dominant motion role "${role}" in ${n} of ${roleShots.length} shots`, "interpretation",
        rule.effect, rule.mech, rule.move, tent));
    }
  }

  if (arr(a.palette_observed).length) {
    out.push(entry("A palette was observed in the reference", "measured",
      "Colour carries the reference's identity, not a mechanic.",
      "None: only the contrast idea (how much the hero separates from its ground) may inform the film; the film uses its own brand colours.",
      "none", false, ["the observed colours, in any form"]));
  }

  const unc = arr(a.uncertainties);
  if (unc.length) {
    out.push(entry(`Analysis uncertainty: ${text(unc[0])}${unc.length > 1 ? ` (+${unc.length - 1} more)` : ""}`, "interpretation",
      "Unknown; do not build on this.", "Verify against the reference before using any mechanic that depends on it.",
      "none", true));
  }
  return out;
}

const BARS = "▁▂▃▄▅▆▇█";
function stripText(norm) {
  const cap = norm.slice(0, 32);
  return cap.map((v) => BARS[Math.min(7, Math.max(0, Math.ceil(v * 8) - 1))]).join("") + (norm.length > cap.length ? "…" : "");
}

export function renderCrewPacket(json) {
  const a = analysisOf(json);
  const recipe = Array.isArray(json && json.recipe) && json.recipe.length ? json.recipe : buildRecipe(json);
  const lens = shotLengths(a);
  const norm = renderCadenceStrip(json);
  const L = [];
  const id = text(json && json.reference_id) || "reference";
  const rights = text(json && json.source && json.source.rights) || "inspiration-only";
  L.push(`# Reference recipe: ${id}`);
  L.push("");
  L.push(`Rights: ${rights}. A reference suggests mechanics only; the product's truth, the story and the brand overrule it.`);
  L.push("");
  L.push("## Cadence");
  if (norm.length) {
    const mean = lens.reduce((s, x) => s + x, 0) / lens.length;
    L.push("```");
    L.push(stripText(norm));
    L.push("```");
    L.push(`[measured] ${lens.length} shot${lens.length === 1 ? "" : "s"}, mean ${r(mean)} s, range ${r(Math.min(...lens))} to ${r(Math.max(...lens))} s${num(a.duration_s) != null ? `, ${r(a.duration_s)} s total` : ""}${a.aspect ? `, ${a.aspect}` : ""}.`);
  } else {
    L.push("[interpretation] No cut data in the analysis; cadence unknown.");
  }
  L.push("");
  L.push("## Transferable mechanics");
  const usable = recipe.filter((e) => e.candidate_move && e.candidate_move !== "none");
  const rank = (e) => (e.tentative ? 10 : 0) + (e.basis === "measured" ? 0 : 1);
  const picks = usable.map((e, i) => ({ e, i })).sort((x, y) => rank(x.e) - rank(y.e) || x.i - y.i).slice(0, 5).map((p) => p.e);
  if (!picks.length) L.push("- [interpretation] Nothing reliable enough to transfer; use the brief alone.");
  picks.forEach((e, i) => {
    const tag = e.basis === "measured" ? "[measured]" : "[interpretation]";
    L.push(`${i + 1}. ${tag}${e.tentative ? " (tentative)" : ""} Saw: ${e.observation}.`);
    L.push(`   Effect: ${e.viewer_effect}`);
    L.push(`   Mechanic: ${e.transferable_mechanic} Move: \`${e.candidate_move}\`.`);
  });
  L.push("");
  L.push("## Not transferable");
  for (const n of NOT_TRANSFERABLE) L.push(`- ${n}`);
  const extra = [...new Set(recipe.flatMap((e) => arr(e.not_transferable)))].filter((n) => !NOT_TRANSFERABLE.includes(n));
  for (const n of extra) L.push(`- ${n}`);
  if (arr(a.uncertainties).length) {
    L.push("");
    L.push(`Uncertain: ${arr(a.uncertainties).slice(0, 2).map(text).join("; ")}`);
  }
  return L.slice(0, 60).join("\n") + "\n";
}
