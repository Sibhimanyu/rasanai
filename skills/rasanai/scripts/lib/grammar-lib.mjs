// Motion grammars: ONE grammar per film (a frame device, type and image behaviour, transitions and a list of
// techniques), each beat spends the technique that expresses its meaning. The library is <skill>/library/grammars/<id>.json;
// RASANAI_GRAMMAR_LIBRARY points at another folder (the selftest uses fixtures). Shared by grammar.mjs, crew.mjs
// (checkScore, contextFor, promptFor) and lib/system.mjs (the design desk's gate). Zero dependencies.
import fs from "node:fs";
import path from "node:path";
import { SKILL_DIR } from "./common.mjs";

export const grammarLibDir = () => (process.env.RASANAI_GRAMMAR_LIBRARY ? path.resolve(process.env.RASANAI_GRAMMAR_LIBRARY) : path.join(SKILL_DIR, "library", "grammars"));
const readJ = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return undefined; } };
export const grammarFiles = () => { try { return fs.readdirSync(grammarLibDir()).filter((f) => f.endsWith(".json")).sort().map((f) => path.join(grammarLibDir(), f)); } catch { return []; } };
// back-compat: a skill with no grammar library (or an env override pointing at nothing) asks nothing of a look
export const hasGrammarLibrary = () => grammarFiles().length > 0;
export function loadGrammars() {
  const out = [];
  for (const f of grammarFiles()) { const g = readJ(f); if (g && typeof g === "object") out.push({ ...g, _file: f }); }
  return out;
}
export const loadGrammar = (id) => loadGrammars().find((g) => g.id === id) || null;
// the film's grammar: <run>/look/grammar.json (null when none; undefined when it is not valid JSON)
export const runGrammarPath = (run, label) => (label ? path.join(run, "design", label, "grammar.json") : path.join(run, "look", "grammar.json"));
export const readRunGrammar = (run, label) => { const f = runGrammarPath(run, label); return fs.existsSync(f) ? readJ(f) : null; };

const str = (v, min = 3) => typeof v === "string" && v.trim().length >= min;
const strs = (v, min) => Array.isArray(v) && v.length >= min && v.every((x) => str(x, 2));
const KEBAB = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
// medium-grammar@2: the internal discriminator of a newly generated, medium-aware look. Legacy grammars (no grammar_format) keep
// the original validator and score rules below, unchanged.
export const MEDIUM_GRAMMAR_FORMAT = "medium-grammar@2";
export const isMediumGrammar = (g) => !!g && typeof g === "object" && g.grammar_format === MEDIUM_GRAMMAR_FORMAT;
const TEXT_ROLES = ["none", "proof", "support", "primary", "mixed"];
const DENSITY_MODES = ["reading-led", "action-led", "music-led", "manual", "chosen"];
const CAMERA_MODES = ["locked", "none", "static", "chosen-by-look", "moving"];
// an implementation ref is a registered adapter/primitive id, or a path inside the skill that really exists
function implRefProblem(ref) {
  if (!str(ref, 3)) return "is missing";
  if (!/[\\/]/.test(ref) || !/\.[a-z0-9]+$/i.test(ref)) return null; // a registered id: the lead's registry resolves it
  const abs = path.resolve(SKILL_DIR, ref);
  if (abs !== SKILL_DIR && !abs.startsWith(SKILL_DIR + path.sep)) return "points outside the skill";
  return fs.existsSync(abs) ? null : `"${ref}" does not exist in the skill`;
}
// the validator of medium-grammar@2: chosen policies, not a universal inventory. Mechanical checks (ids, source refs, paths,
// bindings, positive times) still fail; the text-only craft quotas of the legacy schema do not apply.
export function validateMediumGrammar(g) {
  const errors = [], warnings = [];
  const E = (m) => errors.push(m);
  if (!(typeof g.id === "string" && KEBAB.test(g.id))) E('id must be kebab-case ("pixel-acting")');
  if (!str(g.name)) E("name is missing");
  if (!str(g.source, 10)) E("source is missing (what reference it is distilled from, described: no files)");
  const role = g.text_role;
  if (!TEXT_ROLES.includes(role)) E(`text_role must be one of ${TEXT_ROLES.join(", ")} (no phantom text to satisfy a checker: "none" is valid)`);
  const textual = role === "proof" || role === "support" || role === "primary" || role === "mixed";
  if (textual) {
    if (!g.type || typeof g.type !== "object") E("type is missing ({ classes, behaviour }): text_role says this look shows text");
    else for (const s of ["classes", "behaviour"]) if (!str(g.type[s], 8)) E(`type.${s} is missing or too short (8+ characters)`);
  } else if (g.type !== undefined && (!g.type || typeof g.type !== "object")) E("type, when present, must be an object");
  if (role === "proof" || role === "mixed") if (!strs(g.evidence_constraints, 1)) E("evidence_constraints needs at least 1 entry (what the proof text/UI must keep: exact copy, qualifier, source dimensions; claim mutation is never allowed)");
  if (!g.frame_device || typeof g.frame_device !== "object" || !str(g.frame_device.what, 8)) E("frame_device.what is missing or too short (8+ characters; what the frame device is, or that there is none and why)");
  // layers: optional; declared layers give every action a binding target
  const layerIds = new Set();
  if (g.layers !== undefined) {
    if (!Array.isArray(g.layers) || !g.layers.length) E("layers, when present, must be a non-empty list of { id, role, medium }");
    else g.layers.forEach((l, i) => {
      if (!l || typeof l !== "object" || !(typeof l.id === "string" && KEBAB.test(l.id))) E(`layers[${i}]: id must be kebab-case`);
      else if (layerIds.has(l.id)) E(`layers[${i}]: duplicate layer id "${l.id}"`);
      else layerIds.add(l.id);
      if (l && !str(l.medium, 3)) E(`layers[${i}]: medium is missing`);
    });
  }
  // native actions (and legacy-shaped techniques, when kept): the ones the look really uses
  const A = Array.isArray(g.native_actions) ? g.native_actions : [];
  const T = Array.isArray(g.techniques) ? g.techniques : [];
  if (g.native_actions !== undefined && !Array.isArray(g.native_actions)) E("native_actions must be a list of { id, name, what, impl_ref }");
  if (g.techniques !== undefined && !Array.isArray(g.techniques)) E("techniques must be a list when present");
  if (!A.length && !T.length) E("native_actions needs at least 1 entry: the action(s) this look really uses (one transformation, a hold or a single shot is complete)");
  const seen = new Set();
  [["native_actions", A], ["techniques", T]].forEach(([k, list]) => list.forEach((t, i) => {
    const at = `${k}[${i}]${t && t.id ? ` (${t.id})` : ""}`;
    if (!t || typeof t !== "object") { E(`${at} is not an object`); return; }
    if (!(typeof t.id === "string" && KEBAB.test(t.id))) E(`${at}: id must be kebab-case`);
    else if (seen.has(t.id)) E(`${at}: duplicate action id`);
    else seen.add(t.id);
    if (!str(t.name)) E(`${at}: name is missing`);
    if (!str(t.what, 10)) E(`${at}: what is missing (what the viewer sees)`);
    if (k === "native_actions") { const pr = implRefProblem(t.impl_ref || t.route); if (pr) E(`${at}: impl_ref ${pr} (a registered primitive id, or an existing path in the skill)`); }
    else if (!str(t.route, 10) && !str(t.impl_ref, 3)) E(`${at}: route is missing (the concrete build)`);
    if (t.layer !== undefined && layerIds.size && !layerIds.has(t.layer)) E(`${at}: layer "${t.layer}" is not one of the declared layers (${[...layerIds].join(", ")})`);
    else if (t.layer !== undefined && !layerIds.size) E(`${at}: names layer "${t.layer}" but the grammar declares no layers`);
  }));
  if (g.uses_word_choreo === true && !seen.has("word-choreo")) E('uses_word_choreo is true but no "word-choreo" action is declared');
  // chosen policies
  const gm = g.ground_motion;
  if (typeof gm === "string") { if (!str(gm, 12)) E("ground_motion prose needs 12+ characters (or use { mode: \"none\", reason })"); }
  else if (gm && typeof gm === "object") { if (gm.mode === "none" && !str(gm.reason, 8)) E("ground_motion.mode \"none\" needs a reason (8+ characters, from the Look)"); else if (gm.mode !== "none" && !str(gm.what, 8)) E("ground_motion.what is missing (how the ground lives) or set mode \"none\" with a reason"); }
  else E("ground_motion is missing: describe it, or say { mode: \"none\", reason }");
  if (g.transitions !== undefined && !(Array.isArray(g.transitions) && g.transitions.every((x) => str(x, 2)))) E("transitions, when present, is a list of named transitions (an empty list is valid for a one-shot film)");
  const cam = g.camera;
  if (cam !== undefined) { if (!cam || typeof cam !== "object" || !CAMERA_MODES.includes(cam.mode)) E(`camera.mode must be one of ${CAMERA_MODES.join(", ")}`); else if (!str(cam.reason, 8)) E("camera.reason is missing (why the Look chose this)"); }
  const d = g.density;
  if (d === undefined) warnings.push("density is not stated (reading-led, action-led, music-led, manual or a chosen cadence)");
  else if (!d || typeof d !== "object" || !DENSITY_MODES.includes(d.mode)) E(`density.mode must be one of ${DENSITY_MODES.join(", ")}`);
  else {
    if (d.mode === "chosen" && !str(d.reason, 8)) E("density.mode \"chosen\" needs a reason");
    if (d.change_every_s !== undefined && !(Number(d.change_every_s) > 0)) E("density.change_every_s, when given, must be a number of seconds above 0");
  }
  if (!str(g.signature, 8)) E("signature is missing (how the film's end lands in the grammar)");
  if (!g.palette || typeof g.palette !== "object") E("palette is missing ({ ground, ink, accent, note })");
  else for (const k of ["ground", "ink", "accent"]) if (!str(g.palette[k], 3)) E(`palette.${k} is missing`);
  for (const k of ["do", "dont", "fits"]) if (g[k] !== undefined && !strs(g[k], 1)) E(`${k}, when present, needs at least 1 entry`);
  if (typeof g.flat_ok !== "boolean") E("flat_ok must be true or false");
  return { errors, warnings };
}

// the schema: { errors, warnings }
export function validateGrammar(g) {
  const errors = [], warnings = [];
  if (!g || typeof g !== "object" || Array.isArray(g)) return { errors: ["grammar is not a JSON object"], warnings };
  if (isMediumGrammar(g)) return validateMediumGrammar(g);
  const E = (m) => errors.push(m);
  if (!(typeof g.id === "string" && KEBAB.test(g.id))) E('id must be kebab-case ("editorial-grid")');
  if (!str(g.name)) E("name is missing");
  if (!str(g.source, 10)) E("source is missing (what reference it is distilled from, described: no files)");
  for (const [k, subs] of [["frame_device", ["what", "moves"]], ["type", ["classes", "behaviour"]], ["image", ["treatment", "behaviour"]]]) {
    if (!g[k] || typeof g[k] !== "object") { E(`${k} is missing ({ ${subs.join(", ")} })`); continue; }
    for (const s of subs) if (!str(g[k][s], 8)) E(`${k}.${s} is missing or too short (8+ characters)`);
  }
  if (!str(g.ground_motion, 12)) E("ground_motion is missing (how the ground lives all the time: a gradient drift, slow parallax, a grain-free noise field, breathing rules; 12+ characters)");
  if (!strs(g.transitions, 3)) E("transitions needs at least 3 named transitions (strings)");
  const T = Array.isArray(g.techniques) ? g.techniques : null;
  if (!T) E("techniques is missing (a list of { id, name, what, route })");
  else {
    if (T.length < 6) E(`techniques has ${T.length} entries; a grammar needs at least 6 (8 to 12 in the library)`);
    else if (T.length < 8) warnings.push(`techniques has ${T.length} entries (8 to 12 is the library's range)`);
    const seen = new Set();
    if (!T.some((t) => t && t.id === "word-choreo")) E('techniques needs a "word-choreo" technique (each word enters from its own offset, scale and blur, then settles into the line with a lift and a soft overshoot)');
    T.forEach((t, i) => {
      const at = `techniques[${i}]${t && t.id ? ` (${t.id})` : ""}`;
      if (!t || typeof t !== "object") { E(`${at} is not an object`); return; }
      if (!(typeof t.id === "string" && KEBAB.test(t.id))) E(`${at}: id must be kebab-case`);
      else if (seen.has(t.id)) E(`${at}: duplicate technique id`);
      else seen.add(t.id);
      if (!str(t.name)) E(`${at}: name is missing`);
      if (!str(t.what, 10)) E(`${at}: what is missing (what the viewer sees)`);
      if (!str(t.route, 10)) E(`${at}: route is missing (the concrete build: HTML/GSAP, or Rasan3D)`);
    });
  }
  if (!str(g.signature, 8)) E("signature is missing (how the film's end lands in the grammar)");
  if (!(g.density && Number(g.density.change_every_s) > 0)) E("density.change_every_s must be a number of seconds above 0");
  if (!g.palette || typeof g.palette !== "object") E("palette is missing ({ ground, ink, accent, note })");
  else for (const k of ["ground", "ink", "accent"]) if (!str(g.palette[k], 3)) E(`palette.${k} is missing`);
  if (!strs(g.do, 2)) E("do needs at least 2 entries");
  if (!strs(g.dont, 2)) E("dont needs at least 2 entries");
  if (!strs(g.fits, 1)) E("fits needs at least 1 entry (the story shapes it suits)");
  if (typeof g.flat_ok !== "boolean") E("flat_ok must be true or false (false when the grammar's look is glow or blur on every element, which a graphic-route brand cannot carry)");
  return { errors, warnings };
}

// ids of the grammar's techniques the score names, with their entries (for inlining)
export function techniquesNamed(g, ids) {
  const want = new Set(ids.filter(Boolean));
  return [...((g && g.native_actions) || []), ...((g && g.techniques) || [])].filter((t) => t && want.has(t.id));
}

// The score rules when the run has a grammar file. Returns { P, W } (ids lead each message).
export function checkScoreGrammar(g, score, S, N) {
  const P = [], W = [];
  if (g === undefined) { P.push("grammar-invalid: look/grammar.json is not valid JSON"); return { P, W }; }
  if (isMediumGrammar(g)) return checkScoreMediumGrammar(g, score, S);
  const ids = new Set((g.techniques || []).map((t) => t && t.id).filter(Boolean));
  const gid = String(score.grammar || "").trim();
  if (!gid) P.push(`grammar-missing: score.grammar is not set: name the film's grammar ("${g.id}"; look/grammar.json), and give every beat a technique of it and a frame_device`);
  else if (g.id && gid !== g.id) W.push(`score.grammar is "${gid}" but look/grammar.json is "${g.id}"`);
  const used = [];
  S.forEach((s, i) => {
    const n = s.n || i + 1, t = String(s.technique || "").trim();
    if (!t) P.push(`technique-unknown: scene ${n} names no technique (one of: ${[...ids].join(", ")})`);
    else if (!ids.has(t)) P.push(`technique-unknown: scene ${n} technique "${t}" is not in the grammar "${g.id}" (${[...ids].join(", ")})`);
    else used.push(t);
    if (!String(s.frame_device || "").trim()) P.push(`frame-device-missing: scene ${n} has no frame_device (what the frame device does in this beat: "${String((g.frame_device || {}).moves || "").slice(0, 70)}")`);
  });
  if (S.length >= 4 && new Set(used).size <= 2) W.push(`technique-thin: ${new Set(used).size} distinct grammar technique(s) across ${S.length} beats: the film spends one or two tricks. Pick each beat's technique from what its hero does (a refrain may repeat one)`);
  return { P, W };
}

// medium-grammar@2 score rules: every beat names a declared action (score "native_action" or the legacy "technique" key) and, when it
// names a layer, the action must bind to that layer. Missing/unknown ids still block; no technique-count or frame-device quotas.
function checkScoreMediumGrammar(g, score, S) {
  const P = [], W = [];
  const acts = [...(g.native_actions || []), ...(g.techniques || [])].filter((t) => t && t.id);
  const ids = new Set(acts.map((t) => t.id));
  const layerIds = new Set((g.layers || []).map((l) => l && l.id).filter(Boolean));
  const gid = String(score.grammar || "").trim();
  if (!gid) P.push(`grammar-missing: score.grammar is not set: name the film's grammar ("${g.id}"; look/grammar.json), and give every beat one of its native actions`);
  else if (g.id && gid !== g.id) W.push(`score.grammar is "${gid}" but look/grammar.json is "${g.id}"`);
  const deviceNone = !(g.frame_device && str(g.frame_device.moves, 4));
  S.forEach((s, i) => {
    const n = s.n || i + 1, t = String(s.native_action || s.technique || "").trim();
    const act = acts.find((a) => a.id === t);
    if (!t) P.push(`technique-unknown: scene ${n} names no native action (one of: ${[...ids].join(", ")})`);
    else if (!act) P.push(`technique-unknown: scene ${n} action "${t}" is not in the grammar "${g.id}" (${[...ids].join(", ")})`);
    const ly = String(s.layer || "").trim();
    if (ly) {
      if (!layerIds.has(ly)) P.push(`layer-unknown: scene ${n} names layer "${ly}", which the grammar "${g.id}" does not declare (${[...layerIds].join(", ") || "no layers"})`);
      else if (act && act.layer && act.layer !== ly) P.push(`action-layer-mismatch: scene ${n} spends "${t}" (layer ${act.layer}) on layer "${ly}"`);
    }
    if (!deviceNone && !String(s.frame_device || "").trim()) W.push(`frame-device: scene ${n} does not say what the frame device does ("${String(g.frame_device.moves).slice(0, 70)}")`);
  });
  return { P, W };
}
