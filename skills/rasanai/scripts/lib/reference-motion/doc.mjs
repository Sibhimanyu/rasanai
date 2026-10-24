// reference-motion.json: build, validate (check) and summarize. Contract A, schema_version 1.
import { round, sha256Text } from "./probe.mjs";

export const NEVER_REUSE = ["logos", "footage", "unlicensed_audio", "verbatim_copy"];
const CONF = ["high", "medium", "low"];
const KINDS = ["linked-file", "url-notes", "manual-notes"];
const RIGHTS = ["inspiration-only", "owned", "licensed"];
const ANALYSIS_ARRAYS = ["cuts_s", "shots", "palette_observed", "type_treatment", "motion_patterns", "sound_hits_s", "energy_arc", "uncertainties"];

export function aspectOf(w, h) {
  if (!w || !h) return "unknown";
  const r = w / h;
  const known = [["16:9", 16 / 9], ["9:16", 9 / 16], ["1:1", 1], ["4:5", 4 / 5], ["4:3", 4 / 3], ["21:9", 21 / 9]];
  for (const [n, v] of known) if (Math.abs(r - v) < 0.03) return n;
  return `${round(r, 2)}:1`;
}

export function standardUncertainties() {
  return [
    "Text dwell time and type treatment are not measurable from pixel statistics; a human or vision pass must read them.",
    "Camera moves are estimated only as coarse pixel change between samples; no exact curves, easing or focal length are claimed.",
    "Palette is a coarse quantized estimate from downscaled frames, not an eyedropper reading.",
    "Shot framing labels come from where edge detail sits in frame, not from recognizing subjects.",
  ];
}

export function emptyDoc({ kind, sha256, rights, basename }) {
  return {
    schema_version: 1,
    reference_id: "ref-" + String(sha256).slice(0, 12),
    source: { kind, sha256, rights, basename },
    analysis: {
      duration_s: 0, fps_observed: 0, aspect: "unknown", width: 0, height: 0, has_audio: false,
      cuts_s: [], shots: [], palette_observed: [], type_treatment: [], motion_patterns: [], sound_hits_s: [], energy_arc: [], uncertainties: [],
    },
    recipe: [],
    use: { transfer: "rhythm-and-mechanics-only", never_reuse: NEVER_REUSE.slice() },
  };
}

export function motionPatterns(shots, cuts, duration, hits) {
  const out = [];
  if (cuts.length) {
    const avgLen = duration / (cuts.length + 1);
    out.push(`${cuts.length} detected cut${cuts.length === 1 ? "" : "s"}; average shot about ${round(avgLen, 1)}s (${avgLen < 1.5 ? "fast" : avgLen < 3.5 ? "medium" : "slow"} cutting)`);
  } else if (duration) out.push("no hard cuts detected (one continuous shot, or soft transitions the detector misses)");
  const active = shots.filter((s) => s.motion_role === "active" || s.motion_role === "busy").length;
  if (shots.length) out.push(`${active} of ${shots.length} shots read as active or busy, the rest held or drifting`);
  if (hits.length >= 3) {
    const gaps = hits.slice(1).map((t, i) => t - hits[i]).sort((a, b) => a - b), med = gaps[Math.floor(gaps.length / 2)];
    out.push(`${hits.length} audio onsets, median spacing ${round(med, 2)}s (about ${round(60 / med, 0)} per minute)`);
  }
  return out;
}

export function validate(doc) {
  const errs = [];
  const bad = (m) => errs.push(m);
  if (!doc || typeof doc !== "object") return ["not a JSON object"];
  if (doc.schema_version !== 1) bad(`schema_version must be 1 (got ${JSON.stringify(doc.schema_version)})`);
  if (typeof doc.reference_id !== "string" || !doc.reference_id) bad("reference_id missing");
  const s = doc.source;
  if (!s || typeof s !== "object") bad("source missing");
  else {
    if (!KINDS.includes(s.kind)) bad(`source.kind must be one of ${KINDS.join("|")}`);
    if (!RIGHTS.includes(s.rights)) bad(`source.rights must be one of ${RIGHTS.join("|")}`);
    if (typeof s.sha256 !== "string") bad("source.sha256 missing");
    if (typeof s.basename !== "string") bad("source.basename missing");
  }
  const a = doc.analysis;
  if (!a || typeof a !== "object") bad("analysis missing");
  else {
    for (const k of ANALYSIS_ARRAYS) if (!Array.isArray(a[k])) bad(`analysis.${k} must be an array`);
    for (const k of ["duration_s", "fps_observed", "width", "height"]) if (typeof a[k] !== "number") bad(`analysis.${k} must be a number`);
    if (typeof a.has_audio !== "boolean") bad("analysis.has_audio must be boolean");
    if (typeof a.aspect !== "string") bad("analysis.aspect must be a string");
    if (Array.isArray(a.shots)) {
      a.shots.forEach((sh, i) => {
        if (typeof sh.start_s !== "number" || typeof sh.end_s !== "number" || sh.end_s < sh.start_s) bad(`shots[${i}] has bad start_s/end_s`);
        if (!CONF.includes(sh.confidence)) bad(`shots[${i}].confidence must be high|medium|low`);
        if (!Array.isArray(sh.observations)) bad(`shots[${i}].observations must be an array`);
      });
      if (Array.isArray(a.energy_arc) && a.energy_arc.length !== a.shots.length) bad("energy_arc must have one value per shot");
      if (Array.isArray(a.energy_arc) && a.energy_arc.some((v) => typeof v !== "number" || v < 0 || v > 1)) bad("energy_arc values must be within 0..1");
    }
    if (s && s.kind === "linked-file" && Array.isArray(a.uncertainties) && !a.uncertainties.length) bad("uncertainties must not be empty for a linked file");
  }
  if (doc.recipe !== undefined && !Array.isArray(doc.recipe)) bad("recipe must be an array");
  const u = doc.use;
  if (!u || u.transfer !== "rhythm-and-mechanics-only") bad('use.transfer must be "rhythm-and-mechanics-only"');
  else if (!Array.isArray(u.never_reuse) || NEVER_REUSE.some((x) => !u.never_reuse.includes(x))) bad("use.never_reuse must list " + NEVER_REUSE.join(", "));
  if (JSON.stringify(doc).match(/"\/(Users|home|private|var|tmp|Volumes)\//)) bad("absolute path found in the file: those belong only in reference-source.private.json");
  return errs;
}

// Compact crew packet, <= 60 lines. Tolerates a missing/empty recipe section.
export function summarize(doc) {
  const a = doc.analysis, L = [];
  L.push(`REFERENCE ${doc.reference_id}  (${doc.source.kind}, rights: ${doc.source.rights}, ${doc.source.basename})`);
  L.push(`Use: ${doc.use?.transfer}. Never reuse: ${(doc.use?.never_reuse || []).join(", ")}.`);
  if (a.duration_s) L.push(`Format: ${a.duration_s}s, ${a.width}x${a.height} (${a.aspect}), ~${a.fps_observed} fps, audio: ${a.has_audio ? "yes" : "no"}`);
  else L.push("Format: no measurements (manual notes only)");
  if (a.shots.length) {
    L.push(`Shots (${a.shots.length}, cuts at ${a.cuts_s.length ? a.cuts_s.map((c) => c + "s").join(", ") : "none"}):`);
    const cap = 14;
    a.shots.slice(0, cap).forEach((s, i) => L.push(`  ${i + 1}. ${s.start_s}-${s.end_s}s ${s.framing}, ${s.motion_role}, energy ${a.energy_arc[i]} [${s.confidence}]`));
    if (a.shots.length > cap) L.push(`  ... ${a.shots.length - cap} more shots`);
  }
  if (a.energy_arc.length) L.push(`Energy arc: ${a.energy_arc.join(" ")}`);
  if (a.palette_observed.length) L.push(`Palette (rough): ${a.palette_observed.join(" ")}`);
  if (a.motion_patterns.length) { L.push("Patterns:"); a.motion_patterns.forEach((p) => L.push(`  - ${p}`)); }
  if (a.sound_hits_s.length) L.push(`Sound hits (s): ${a.sound_hits_s.slice(0, 24).join(" ")}${a.sound_hits_s.length > 24 ? " ..." : ""}`);
  if (a.type_treatment.length) L.push(`Type: ${a.type_treatment.join("; ")}`);
  L.push("Uncertainties (do not treat as measured):");
  (a.uncertainties.length ? a.uncertainties : ["none recorded"]).forEach((u) => L.push(`  ! ${u}`));
  if (Array.isArray(doc.recipe) && doc.recipe.length) {
    L.push("Recipe:");
    doc.recipe.slice(0, 6).forEach((r) => L.push(`  - ${r.observation} -> ${r.candidate_move || r.transferable_mechanic || ""}`));
  } else L.push("Recipe: not yet written (observations above are raw; transfer rhythm and mechanics only).");
  return L.slice(0, 60).join("\n");
}

export { sha256Text };
