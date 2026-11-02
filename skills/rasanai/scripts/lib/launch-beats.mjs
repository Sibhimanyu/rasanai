// Launch-film BEAT checks (the owner's target: one-take kinetic type, a carrier motif, motivated transitions, copy as the spine, a light brand).
// Pure reads of the SCORE (motion/score.json). Applies to launch / promo films only; called from launchGrammarFindings (lib/launch-grammar.mjs).
// Rules and wording: references/launch-grammar.md. The house references (library/benchmarks/launch-refs) are the measured shape of a passing score.
//
// Score fields per scene (references/score.md "launch beats"):
//   line            the copy on screen in the beat (one thought; a line that builds word by word counts its FINAL state)
//   carrier_state   what the carrier motif is doing in the beat ("" or "none" = absent)    (older scores: `carrier`, or the ids in score.motif.scenes)
//   transition_in   how the beat arrives: a motivated kind (carried-element, type-morph, mask-wipe, push, whip, zoom-through, flood, flip, iris, dissolve, ...) or "cut"
//                   (older scores: the seam into the scene, score.seams[{from,to,kind}])
//   density         "dense" (3+ elements, a collage, a full UI or a full-frame object) | "sparse" (one small line or one object on an empty ground)
//   logo            true when the mark or wordmark is on screen in the beat
export const LB = { max_plain_cuts_warn: 0, max_plain_cuts_error: 2, max_logo: 3, carrier_share_min: 0.6, max_words_line: 9, min_density_alternations: 2, max_dense_run: 2, beat_median_warn_s: 5 };

// signature curve (references/craft.md "A curve per role"): a launch film puts 70-85% of its moves on one declared curve; the gates warn under 60%
export const SIG = { share_warn: 0.6, share_aim: [0.7, 0.85], min_moves: 10 };
export const sigNorm = (e) => String(e == null ? "" : e).replace(/^rasan:/i, "").replace(/\s+/g, "").toLowerCase();
// a curve matches the signature when they are the same string, or the signature names only a family ("expo") and the curve is in it ("expo.out")
export const sigMatch = (ease, sig) => { const a = sigNorm(ease), b = sigNorm(sig); if (!a || !b) return false; return a === b || (!/[.(]/.test(b) && a.startsWith(b + ".")); };
const OVERSHOOT_EASE = /back|elastic|spring|bounce/i;

const PLAIN = /^(cut|hard[- ]?cut|plain[- ]?cut|smash[- ]?cut|jump[- ]?cut|none|no)$/i;
const words = (t) => String(t || "").replace(/[—–]/g, " ").split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
const truthy = (v) => v === true || /^(true|yes|1|present)$/i.test(String(v || ""));
const carrierOn = (v) => { const s = String(v == null ? "" : v).trim(); return !!s && !/^(none|no|absent|-|n\/a)$/i.test(s); };

// the per-beat `moves[]` the score declares (references/score.md "Motion laws"), with the beat role: scenes[].beat, else the first row is the hook and the last the payoff
export function beatMoves(plan) {
  const sc = plan && Array.isArray(plan.scenes) ? plan.scenes : plan && Array.isArray(plan.beats) ? plan.beats : [];
  return sc.map((s, i) => {
    const role = String(s.beat || s.role || (i === 0 ? "hook" : i === sc.length - 1 ? "payoff" : "")).toLowerCase();
    return { id: String(s.id != null ? s.id : i + 1), role, hold: Number(s.hold_s), moves: Array.isArray(s.moves) ? s.moves.filter((m) => m && typeof m === "object") : [], handoff: s.handoff && typeof s.handoff === "object" ? s.handoff : null, transition: s.transition_in };
  });
}

export function beatRows(plan) {
  const sc = plan && Array.isArray(plan.scenes) ? plan.scenes : plan && Array.isArray(plan.beats) ? plan.beats : [];
  const seams = plan && Array.isArray(plan.seams) ? plan.seams : [];
  const motifScenes = plan && plan.motif && Array.isArray(plan.motif.scenes) ? plan.motif.scenes.map(String) : null;
  return sc.map((s, i) => {
    const id = String(s.id != null ? s.id : s.n != null ? s.n : i + 1), n = String(s.n != null ? s.n : i + 1);
    const seam = seams.find((x) => String(x.to) === n || String(x.to) === id);
    const tin = s.transition_in != null ? s.transition_in : s.frame_change != null && /cut|morph|camera/.test(String(s.frame_change)) ? s.frame_change : seam && seam.kind != null ? seam.kind : null;
    const car = s.carrier_state != null ? carrierOn(s.carrier_state) : s.carrier_present != null ? truthy(s.carrier_present) : carrierOn(s.carrier) ? true : motifScenes ? motifScenes.includes(n) || motifScenes.includes(id) : null;
    const t0 = Number(s.start != null ? s.start : s.t0), t1 = Number(s.end != null ? s.end : s.t1);
    return { id, i, line: s.line != null ? s.line : s.on_screen != null ? s.on_screen : "", transition: tin == null ? null : String(tin), carrier: car, density: s.density ? String(s.density).toLowerCase() : null, logo: s.logo != null ? truthy(s.logo) : null, dur: Number.isFinite(t0) && Number.isFinite(t1) ? t1 - t0 : (Number.isFinite(Number(s.duration)) ? Number(s.duration) : null) };
  });
}

// plan = the parsed score. waived = {rule: why}. Returns findings {severity, check, message, fix, basis}.
export function launchBeatFindings({ plan = null, waived = {} } = {}) {
  const F = [];
  if (!plan) return F;
  const rows = beatRows(plan);
  if (rows.length < 3) return F;
  const add = (severity, check, message, fix, rule) => {
    if (rule && waived[rule] && severity === "error") F.push({ severity: "note", check, message: `waived by the concept (${waived[rule]}): ${message}`, fix: "none: the concept waived this launch-grammar rule", basis: "score", waived: true });
    else F.push({ severity, check, message, fix, basis: "score" });
  };
  const see = "references/launch-grammar.md";
  // 1. transitions: every boundary is motivated; a plain cut is a warning, more than 2 an error
  const later = rows.slice(1), declared = later.filter((r) => r.transition != null);
  if (!declared.length) add("warning", "transition-undeclared", "no beat names how it arrives (scenes[].transition_in, or score.seams[].kind): motivated transitions cannot be checked", `give every beat a transition_in (carried-element, type-morph, mask-wipe, push, whip, zoom-through, flood, iris ...) or "cut"; ${see}`);
  else {
    const plain = later.filter((r) => r.transition == null || PLAIN.test(r.transition));
    if (plain.length > LB.max_plain_cuts_error) add("error", "hard-cuts", `${plain.length} plain cuts (beats ${plain.map((r) => r.id).slice(0, 6).join(", ")}): every boundary should be motivated (a carried element, a type morph, a mask, a push, a whip); more than ${LB.max_plain_cuts_error} plain cuts reads as a slideshow`, `carry an element across the boundary, morph the type, or wipe with an object; or waive with a reason (grammar_waivers rule hard-cuts); ${see}`, "hard-cuts");
    else if (plain.length) add("warning", "hard-cuts", `${plain.length} plain cut(s) (beats ${plain.map((r) => r.id).join(", ")}): the references use none that are not carried`, `make the cut motivated (a carried element, a morph, a mask, a push, a whip) or keep it only where the story breaks on purpose; ${see}`);
  }
  // 2. the logo: at most 3 appearances
  const logos = rows.filter((r) => r.logo === true).length;
  if (rows.some((r) => r.logo != null)) { if (logos > LB.max_logo) add("warning", "logo-count", `the logo is on screen in ${logos} beats (${LB.max_logo} at most, and small: the meet, one more, the end card)`, `let the brand live in the palette and the carrier; show the mark at the reveal and the end card; ${see}`); }
  else if (rows.length >= 6) F.push({ severity: "note", check: "logo-undeclared", message: "no beat says whether the logo is on screen (scenes[].logo): the logo count was not checked", fix: "set logo: true on the beats that show the mark", basis: "score" });
  // 3. a carrier motif, present in at least 60% of the beats
  const named = plan.carrier || plan.spine || (plan.motif && plan.motif.what) || plan.motif;
  const known = rows.filter((r) => r.carrier != null);
  if (!named) add("error", "carrier-unnamed", "the score names no carrier motif (score.carrier, or spine / motif): a launch film has one object, shape or word-line that travels the whole film and links the beats", `name it (score.carrier: {what, beats}) and show its state in each beat (carrier_state); ${see}`, "carrier");
  else if (known.length >= Math.ceil(rows.length / 2)) {
    const share = known.filter((r) => r.carrier).length / rows.length;
    if (share < LB.carrier_share_min) add("error", "carrier-share", `the carrier is present in ${Math.round(share * 100)}% of the beats (${Math.round(LB.carrier_share_min * 100)}% at least)`, `keep the carrier in more beats (it can be small: a dot beside the line, a cursor, a shape the type passes through) and say its state in carrier_state; ${see}`, "carrier");
  } else add("warning", "carrier-state-undeclared", "beats do not say what the carrier is doing (scenes[].carrier_state): carrier continuity cannot be measured", `write carrier_state per beat ("none" where it is absent); ${see}`);
  // 4. copy: one thought per beat; lines over about 9 words on screen at once
  const long = rows.map((r) => ({ r, n: words(r.line) })).filter((x) => x.n > LB.max_words_line);
  if (long.length) add("warning", "copy-line-long", `${long.length} beat(s) hold more than ${LB.max_words_line} words on screen at once (${long.slice(0, 4).map((x) => `${x.r.id}: ${x.n}`).join(", ")}): one thought per beat`, `split the line into two beats, or build it word by word so only a few words are new at a time; ${see}`);
  // 5. rhythm: dense and sparse alternate (at least two alternations)
  const dens = rows.map((r) => (r.density === "dense" || r.density === "sparse" ? r.density : null)).filter(Boolean);
  if (dens.length < Math.ceil(rows.length / 2)) F.push({ severity: "warning", check: "rhythm-undeclared", message: "beats do not say dense or sparse (scenes[].density): the rhythm cannot be checked", fix: `tag each beat dense (3+ elements, a collage, a full-frame object) or sparse (one small line or object on an empty ground); ${see}`, basis: "score" });
  else {
    let alt = 0; for (let i = 1; i < dens.length; i++) if (dens[i] !== dens[i - 1]) alt++;
    if (alt < LB.min_density_alternations) add("error", "rhythm", `${alt} dense/sparse alternation(s) (${LB.min_density_alternations} at least): the film holds one density`, `alternate a dense moment (a collage, a UI, a big object) with one small line on an empty ground; ${see}`, "rhythm");
  }
  // dense beats never run more than 2 in a row (a warning)
  { let run = 0, worst = 0, at = ""; rows.forEach((r) => { if (r.density === "dense") { run++; if (run > worst) { worst = run; at = r.id; } } else run = 0; });
    if (worst > LB.max_dense_run) F.push({ severity: "warning", check: "dense-run", message: `${worst} dense beats in a row (ending at beat ${at}; ${LB.max_dense_run} at most): dense and sparse alternate`, fix: `follow a dense beat with a sparse one (one small line on an empty ground); ${see}`, basis: "score" }); }
  // 6. beats, not shots: a one-take film has long "shots"; a beat that runs long is the thing to watch
  const durs = rows.map((r) => r.dur).filter((d) => d != null && d > 0).sort((a, b) => a - b);
  if (durs.length >= 4) { const med = durs[Math.floor(durs.length / 2)]; if (med > LB.beat_median_warn_s) F.push({ severity: "warning", check: "beat-length", message: `median beat ${Math.round(med * 10) / 10} s (the references run 2.8 to 3.7 s): the film changes thought too slowly`, fix: `split long beats: one thought each; ${see}`, basis: "score" }); }
  F.push(...motionLawFindings(plan, rows));
  return F;
}

// Motion laws read from the score's own fields (all warnings; the tween-level versions live in obey.mjs). Doc: references/craft.md, launch-grammar.md "Motion profile per beat", score.md "Motion laws".
function motionLawFindings(plan, rows) {
  const F = [], see = "references/score.md \"Motion laws\"";
  const w = (check, message, fix) => F.push({ severity: "warning", check, message, fix, basis: "score" });
  const B = beatMoves(plan), all = B.flatMap((b) => b.moves.map((m) => ({ ...m, _beat: b.id })));
  // signature curve
  const sig = plan.signature_ease || (plan.motion && plan.motion.signature_ease);
  if (!sig) w("signature-ease-missing", "the score declares no signature_ease: a launch film puts 70 to 85 percent of its moves on one curve (the accents are for a whip, the signature transition and the payoff hit)", `name it (score.signature_ease: a custom cubic-bezier or an expo.out family); ${see}`);
  else {
    const eased = all.filter((m) => m.ease);
    if (eased.length >= SIG.min_moves) {
      const share = eased.filter((m) => sigMatch(m.ease, sig)).length / eased.length;
      if (share < SIG.share_warn) w("signature-share-low", `${Math.round(share * 100)}% of the ${eased.length} declared moves use the signature curve (${sig}); a launch film runs 70 to 85%, ${Math.round(SIG.share_warn * 100)}% at least`, `move the ordinary moves onto the signature curve and keep the others for a whip, the signature transition and the payoff hit; ${see}`);
    }
  }
  // entrances that are opacity-only
  const fades = all.filter((m) => /^(fade|opacity|opacity-only|scale-from-zero|scale0)$/i.test(String(m.entrance || "")));
  if (fades.length) w("entrance-fade-only", `${fades.length} declared entrance(s) are opacity-only or grow from scale 0 (beats ${[...new Set(fades.map((m) => m._beat))].slice(0, 6).join(", ")}): pair the fade with travel or scale, and start a card at 0.92 to 0.95 or above`, `use mask-rise, scale-from-origin, travel-fade or clip-reveal; ${see}`);
  // three layers on the meet and capability beats
  if (all.some((m) => m.layer)) {
    const thin = B.filter((b) => /^(meet|capabilit)/.test(b.role) && b.moves.length >= 3).filter((b) => ["hero", "support", "ambient"].some((l) => !b.moves.some((m) => String(m.layer || "").toLowerCase() === l)));
    if (thin.length) w("layers-missing", `beat(s) ${thin.map((b) => b.id).join(", ")} lack one of the three motion layers (hero, support, ambient)`, `give each showcase beat a primary, a secondary and an ambient layer drifting at 20 to 30 percent of the hero's speed against it; ${see}`);
  }
  // per-beat motion profile: hook tight, meet calm, payoff longest holds
  if (all.filter((m) => Number(m.dur) > 0).length >= 6) {
    const dur = (m) => Number(m.dur), mean = (l) => (l.length ? l.reduce((a, m) => a + dur(m), 0) / l.length : null);
    const timed = all.filter((m) => dur(m) > 0), filmMean = mean(timed), over = (m) => OVERSHOOT_EASE.test(String(m.ease || "")) || Number(m.overshoot_pct) > 0.5;
    const hook = B.find((b) => b.role === "hook"), meet = B.find((b) => b.role === "meet"), pay = B.find((b) => b.role === "payoff");
    if (hook) {
      const hm = mean(hook.moves.filter((m) => dur(m) > 0));
      if (hook.moves.some(over)) w("beat-profile", "the hook has an overshooting move: the hook is tight and urgent, ease-out with no overshoot", `land the hook's moves critically damped on the signature curve; ${see}`);
      if (hm != null && hm > filmMean) w("beat-profile", `the hook's moves average ${hm.toFixed(2)} s, longer than the film's ${filmMean.toFixed(2)} s: the hook is the tightest beat`, `shorten the hook's durations; ${see}`);
    }
    if (meet) {
      const longest = (b) => Math.max(0, ...b.moves.filter((m) => m.entrance || /enter|in/i.test(String(m.kind || ""))).map(dur).concat(b.moves.map(dur)));
      const others = Math.max(0, ...B.filter((b) => b !== meet).map(longest));
      if (meet.moves.some(over)) w("beat-profile", "the meet has an overshooting move: the reveal is calm and slow", `land the meet critically damped; ${see}`);
      if (meet.moves.length && longest(meet) < others) w("beat-profile", `the meet's longest entrance (${longest(meet).toFixed(2)} s) is shorter than another beat's (${others.toFixed(2)} s): the meet is the calmest, slowest beat of the film`, `give the reveal the longest entrance (sine or a long ease-out); ${see}`);
    }
    if (pay && Number.isFinite(pay.hold)) {
      const other = Math.max(0, ...B.filter((b) => b !== pay && Number.isFinite(b.hold)).map((b) => b.hold));
      if (other > pay.hold) w("beat-profile", `the payoff holds its line ${pay.hold} s, less than another beat's ${other} s: the payoff has the longest holds`, `lengthen the payoff's hold (hold_s); ${see}`);
    }
  }
  // a carrier handoff keeps its incoming velocity (references/motion-handoffs.md)
  const lost = B.filter((b) => b.handoff && /carried|carrier|whip|push|zoom/i.test(String(b.transition || "")) && !b.handoff.intentional_discontinuity && !/^(cut|snap|impact)$/i.test(String(b.handoff.handoff_kind || b.handoff.kind || "")) && !(Array.isArray(b.handoff.carry) ? b.handoff.carry : String(b.handoff.carry || "").split(/[,\s]+/)).includes("velocity"));
  if (lost.length) w("handoff-velocity", `the handoff into beat(s) ${lost.map((b) => b.id).join(", ")} does not carry velocity: a carrier that changes role keeps its incoming velocity vector, it never restarts from rest`, "add velocity to the handoff's carry, or declare the break (intentional_discontinuity); references/motion-handoffs.md");
  return F;
}

// frame-difference spikes (frame-gate's hard-cut count) against the film length: the references measure 1 to 3 per 10 s (ground flips on music hits), so only a much higher rate is a warning
export function spikeFinding({ hardCuts, dur, plan = null }) {
  if (!(dur > 8) || !Number.isFinite(hardCuts)) return null;
  const per10 = (hardCuts / dur) * 10;
  if (per10 <= 4) return null;
  const decl = plan ? beatRows(plan).slice(1).filter((r) => r.transition != null && PLAIN.test(r.transition)).length : null;
  return { severity: "warning", check: "frame-spikes", message: `${hardCuts} frame-difference spikes in ${Math.round(dur)} s (${Math.round(per10 * 10) / 10} per 10 s; the references show 1 to 3): some may be plain cuts${decl != null ? ` (the score declares ${decl})` : ""}`, fix: "carry an element or the type across the flips, or merge beats; references/launch-grammar.md" };
}
