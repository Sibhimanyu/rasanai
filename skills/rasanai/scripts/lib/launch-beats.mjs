// Launch-film BEAT checks (the owner's target, 2026-11-02: copy as the spine, a light brand, SCENE VARIETY, motion-texture contrast (smooth / stepped / flicker / glitch),
// transition variety, optional local carriers, Codex imagery where it adds meaning).
// Pure reads of the SCORE (motion/score.json). Applies to launch / promo films only; called from launchGrammarFindings (lib/launch-grammar.mjs).
// Rules and wording: references/launch-grammar.md. The house references (library/benchmarks/launch-refs) are the measured shape of a passing score.
//
// Score fields per scene (references/score.md "launch beats"):
//   line            the copy on screen in the beat (one thought; a line that builds word by word counts its FINAL state)
//   scene_type      the beat's type from the scene palette (SCENE_TYPES below); a beat next to one of the same type says `continues: true` when it is deliberate
//   texture         smooth | stepped | flicker | glitch (+ `fps` for stepped: 12, 10 or 8)
//   carrier_state   OPTIONAL: what a local carrier is doing in the beat ("" or "none" = absent)    (older scores: `carrier`, or the ids in score.motif.scenes)
//   transition_in   how the beat arrives: a kind from the full vocabulary (hard-cut-on-hit, stepped-smash, flicker-cut, mask-wipe, push, pull, whip, morph, match-cut, type-morph,
//                   carried-element, zoom-through, ...) (older scores: the seam into the scene, score.seams[{from,to,kind}])
//   moves           the reference moves the beat uses, by catalogue name (REF_MOVES below; references/launch-moves.md): strings in scenes[].moves[] (the per-tween
//                   objects the motion laws read may sit in the same array). No move in more than 2 beats. AI-cliche names are warnings (CLICHE_MOVES).
//   emphasis / line_build   OPTIONAL: how the beat's key word is emphasised, and how its line builds ("typed" | "word-fade" | "slot" | "swap" | "split" ...)
//   imagery         OPTIONAL: the Codex image the beat uses (a ref into crew/imagery.json / art/assets.json) or "none"
//   density         "dense" (3+ elements, a collage, a full UI or a full-frame object) | "sparse" (one small line or one object on an empty ground)
//   logo            true when the mark or wordmark is on screen in the beat
export const LB = { max_plain_cuts_warn: 0, max_plain_cuts_error: 2, max_logo: 3, carrier_share_max: 0.4, scene_min_types_40s: 5, scene_share_max: 0.3, nonsmooth_min: 0.15, nonsmooth_max: 0.4, transition_share_max: 0.3, imagery_max: 4, max_words_line: 9, min_density_alternations: 2, max_dense_run: 2, beat_median_warn_s: 5 };

// signature curve (references/craft.md "A curve per role"): a launch film puts 70-85% of its moves on one declared curve; the gates warn under 60%
export const SIG = { share_warn: 0.6, share_aim: [0.7, 0.85], min_moves: 10 };
export const sigNorm = (e) => String(e == null ? "" : e).replace(/^rasan:/i, "").replace(/\s+/g, "").toLowerCase();
// a curve matches the signature when they are the same string, or the signature names only a family ("expo") and the curve is in it ("expo.out")
export const sigMatch = (ease, sig) => { const a = sigNorm(ease), b = sigNorm(sig); if (!a || !b) return false; return a === b || (!/[.(]/.test(b) && a.startsWith(b + ".")); };
const OVERSHOOT_EASE = /back|elastic|spring|bounce/i;

// the scene palette (references/launch-grammar.md section 4); an unknown id is allowed (a new type) and counts as its own type
export const SCENE_TYPES = ["type-slate", "type-collage", "ui-proof", "ui-collage", "cinematic-image", "diagram", "data", "kinetic-list", "object-shot", "typed-prompt", "footage", "logo-end"];
export const TEXTURES = ["smooth", "stepped", "flicker", "glitch"];
// the reference moves watched frame by frame in Minase and Kinso (references/launch-moves.md); an unknown id is allowed and counts as its own move
export const REF_MOVES = ["object-splits-word", "redaction-slash", "glass-shelf", "scale-as-transition", "iris-through-object", "logo-builds-itself", "oversized-type-bleed", "restraint-slate", "persistent-type-over-cuts", "footage-word-by-word", "stepped-dashboard-scroll", "orbit-diagram", "slot-list", "mixed-type-collage", "stepped-collage-flicker", "metaphor-from-copy", "product-flow-demo", "product-character", "line-lighting", "border-light-trace"];
// AI cliches (references/launch-moves.md "AI cliches"): BANNED = glow pulses, bokeh and particle atmosphere, and a highlighted word that nudges/bounces/pops/pulses as the emphasis.
// RARE (capped, not banned): a travelling cursor or caret (once per film, with a declared story reason: scenes[].cursor_reason), typed lines, uniform word fades, slide-up cards, underline.
export const CLICHE = {
  banned: /highlight[-_ ]?(nudge|pop|bounce|wiggle|pulse|scale|grow)|(nudge|bounce|pop|wiggle)[-_ ]?(highlight|word)|glow[-_ ]?pulse|pulse[-_ ]?ring|breath(ing)?[-_ ]?glow|glow[-_ ]?breath|bokeh|particle|floating[-_ ]?dust|dust[-_ ]?mote/i,
  typed: /typ(e|ed|ing|ewriter|er)\b|caret|typewriter/i,
  wordFade: /word[-_ ]?(by[-_ ]?word)?[-_ ]?(fade|blur[-_ ]?up|stagger)|blur[-_ ]?up|uniform[-_ ]?(fade|stagger)|fade[-_ ]?up[-_ ]?stagger/i,
  slideUp: /slide[-_ ]?up[-_ ]?card|card[-_ ]?(slide|rise)[-_ ]?up|cards?[-_ ]?rise|soft[-_ ]?shadow[-_ ]?card/i,
  underline: /underline|underscore[-_ ]?swipe|swipe[-_ ]?under/i,
  glowParticle: /glow|bloom|bokeh|particle|dust/i,
  cursorEl: /cursor|caret/i,
};
export const CLICHE_CAPS = { cursor_travel: 1, typed_lines: 2, word_fade_lines: 2, slide_up_cards: 2, underline: 1, move_beats: 2 };
const PLAIN = /^(cut|hard[- ]?cut|plain[- ]?cut|smash[- ]?cut|jump[- ]?cut|none|no)$/i;
// a hard cut that names the music hit it lands on is a motivated transition (the references cut on the beat), not a plain cut
const ON_HIT = /(hit|beat|drop|downbeat|accent|music|bar)/i;
const sceneKey = (v) => String(v == null ? "" : v).toLowerCase().trim().replace(/[\s_]+/g, "-");
const texKey = (v) => { const t = String(v == null ? "" : v).toLowerCase(); return /flicker|strobe/.test(t) ? "flicker" : /glitch/.test(t) ? "glitch" : /step|stutter|twos|threes|choppy/.test(t) ? "stepped" : /smooth|ease|continuous|calm/.test(t) ? "smooth" : t.trim() ? t.trim() : null; };
// the transition FAMILY (for the variety count): everything the grammar names, folded to one id
export const transitionFamily = (t) => {
  const v = String(t == null ? "" : t).toLowerCase();
  if (!v.trim()) return null;
  if (/type[- ]?morph|word[- ]?(swap|split)/.test(v)) return "type-morph";
  if (/match/.test(v)) return "match-cut";
  if (/flicker/.test(v)) return "flicker-cut";
  if (/stepped|smash/.test(v)) return "stepped-smash";
  if (/whip/.test(v)) return "whip";
  if (/mask|wipe|iris/.test(v)) return "mask-wipe";
  if (/push|pull|zoom/.test(v)) return "push-pull";
  if (/morph|flip|flood|carried|carry/.test(v)) return "morph";
  if (/cut|none/.test(v)) return "hard-cut";
  return v.split(/[\s:(,]/)[0];
};
const isPlainCut = (t) => t == null || (PLAIN.test(String(t).trim()) && !ON_HIT.test(String(t)));
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
    const role = String(s.role || s.beat || "").toLowerCase();
    return { id, i, role, scene_type: s.scene_type != null ? sceneKey(s.scene_type) : s.type != null && SCENE_TYPES.includes(sceneKey(s.type)) ? sceneKey(s.type) : null, continues: truthy(s.continues || s.continuation), texture: s.texture != null ? texKey(s.texture) : null, fps: Number(s.fps != null ? s.fps : s.texture_fps) || null, imagery: s.imagery == null ? null : String(typeof s.imagery === "object" ? s.imagery.ref || s.imagery.id || s.imagery.prompt || "" : s.imagery).trim(), line: s.line != null ? s.line : s.on_screen != null ? s.on_screen : "", transition: tin == null ? null : String(tin), carrier: car, density: s.density ? String(s.density).toLowerCase() : null, logo: s.logo != null ? truthy(s.logo) : null, dur: Number.isFinite(t0) && Number.isFinite(t1) ? t1 - t0 : (Number.isFinite(Number(s.duration)) ? Number(s.duration) : null) };
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
  // 1. transitions: named from the full vocabulary. A hard cut on a music hit is welcome; a bare "cut" with no reason is a warning (never an error)
  const later = rows.slice(1), declared = later.filter((r) => r.transition != null);
  if (!declared.length) add("warning", "transition-undeclared", "no beat names how it arrives (scenes[].transition_in, or score.seams[].kind): transition variety cannot be checked", `give every beat a transition_in (hard-cut-on-hit, stepped-smash, flicker-cut, mask-wipe, push, pull, whip, morph, match-cut, type-morph ...); ${see}`);
  else {
    const plain = later.filter((r) => isPlainCut(r.transition));
    if (plain.length) add("warning", "hard-cuts", `${plain.length} undeclared plain cut(s) (beats ${plain.map((r) => r.id).slice(0, 6).join(", ")}): a hard cut is fine when it lands on a music hit; say so (transition_in: "hard-cut-on-hit") or choose another transition`, `name the hit the cut lands on, or use a stepped smash, a flicker cut, a mask, a push or a whip; ${see}`);
    // transition variety: no family on more than ~30% of the seams
    if (declared.length >= 4) {
      const fam = {}; declared.forEach((r) => { const k = transitionFamily(r.transition); if (k) fam[k] = (fam[k] || 0) + 1; });
      const [top, cnt] = Object.entries(fam).sort((a, b) => b[1] - a[1])[0] || ["", 0];
      if (cnt / declared.length > LB.transition_share_max + 1e-9) F.push({ severity: "warning", check: "transition-variety", message: `"${top}" is ${cnt} of ${declared.length} seams (${Math.round((100 * cnt) / declared.length)}%; ${Math.round(LB.transition_share_max * 100)}% at most): one transition used throughout reads as a gimmick`, fix: `mix the vocabulary: hard cuts on hits, stepped smash, flicker cut, mask or wipe, push or pull, whip, morph, match cut, type morph; ${see}`, basis: "score" });
    }
  }
  // 2. the logo: at most 3 appearances
  const logos = rows.filter((r) => r.logo === true).length;
  if (rows.some((r) => r.logo != null)) { if (logos > LB.max_logo) add("warning", "logo-count", `the logo is on screen in ${logos} beats (${LB.max_logo} at most, and small: the meet, one more, the end card)`, `let the brand live in the palette and the carrier; show the mark at the reveal and the end card; ${see}`); }
  else if (rows.length >= 6) F.push({ severity: "note", check: "logo-undeclared", message: "no beat says whether the logo is on screen (scenes[].logo): the logo count was not checked", fix: "set logo: true on the beats that show the mark", basis: "score" });
  // 3. a carrier is OPTIONAL and local: it may link two or three neighbouring beats or bookend the film, in at most 40% of the beats (no carrier at all is fine)
  { const known = rows.filter((r) => r.carrier != null);
    if (known.length >= Math.ceil(rows.length / 2)) {
      const share = known.filter((r) => r.carrier).length / rows.length;
      if (share > LB.carrier_share_max + 1e-9) F.push({ severity: "warning", check: "carrier-overuse", message: `a carrier is in ${Math.round(share * 100)}% of the beats (${Math.round(LB.carrier_share_max * 100)}% at most): one motif through every scene and seam is repetitive`, fix: `let the carrier link two or three neighbouring beats or bookend the film, and give the other beats their own scene; ${see}`, basis: "score" });
    } }
  // 3b. scene variety: a palette of scene types, at least 5 in a 40 s film, none over ~30% of the runtime, neighbours differ unless a deliberate continuation
  F.push(...sceneVarietyFindings(plan, rows, see));
  // 3c. motion texture contrast: smooth / stepped / flicker / glitch
  F.push(...textureFindings(plan, rows, see));
  // 3c2. AI cliches and move variety
  F.push(...clicheFindings(plan, rows));
  // 3d. imagery: Codex stills used where they add meaning (1 to 4 per film)
  { const refs = [...new Set(rows.map((r) => r.imagery).filter((v) => v && !/^(none|no|-|n\/a)$/i.test(v)))];
    if (refs.length > LB.imagery_max) F.push({ severity: "warning", check: "imagery-count", message: `${refs.length} distinct Codex images (${LB.imagery_max} at most): use imagery only where it adds meaning, never as wallpaper`, fix: `keep the images that carry meaning (a world inside a UI card, an object shot, a cinematic plate); ${see}`, basis: "score" }); }
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

const runtimeOf = (plan, rows) => {
  const have = rows.filter((r) => r.dur != null && r.dur > 0);
  return have.length === rows.length ? rows.map((r) => r.dur) : rows.map(() => 1); // no durations: weigh the beats equally
};

export function sceneVarietyFindings(plan, rows, see = "references/launch-grammar.md") {
  const F = [], declared = rows.filter((r) => r.scene_type);
  if (declared.length < Math.ceil(rows.length / 2)) return [{ severity: "warning", check: "scene-type-undeclared", message: "beats do not say their scene type (scenes[].scene_type): scene variety cannot be checked", fix: `tag each beat from the palette (${SCENE_TYPES.join(", ")}); ${see}`, basis: "score" }];
  const w = runtimeOf(plan, rows), total = w.reduce((a, b) => a + b, 0) || 1, dur = rows.every((r) => r.dur > 0) ? total : Number(plan && plan.duration) || 0;
  const share = {}; rows.forEach((r, i) => { if (r.scene_type) share[r.scene_type] = (share[r.scene_type] || 0) + w[i] / total; });
  const types = Object.keys(share), need = dur >= 40 ? LB.scene_min_types_40s : dur >= 20 ? 3 : 0;
  if (need && types.length < need) F.push({ severity: "warning", check: "scene-variety", message: `${types.length} scene type(s) in a ${Math.round(dur)} s film (${need}+ wanted: ${types.join(", ")}): a launch film is a sequence of different scenes, not one scene repeated`, fix: `add scenes from the palette (a type slate, a UI proof, a cinematic image, a diagram, a data scene, a kinetic list, an object shot, a typed prompt); ${see}`, basis: "score" });
  const [top, sh] = Object.entries(share).sort((a, b) => b[1] - a[1])[0];
  if (sh > LB.scene_share_max + 0.02) F.push({ severity: "warning", check: "scene-share", message: `"${top}" takes ${Math.round(sh * 100)}% of the runtime (${Math.round(LB.scene_share_max * 100)}% at most)`, fix: `replace some of those beats with another scene type; ${see}`, basis: "score" });
  const rep = []; for (let i = 1; i < rows.length; i++) if (rows[i].scene_type && rows[i].scene_type === rows[i - 1].scene_type && !rows[i].continues) rep.push(`${rows[i - 1].id}-${rows[i].id}`);
  if (rep.length) F.push({ severity: "warning", check: "scene-neighbours", message: `neighbouring beats share a scene type (${rep.slice(0, 5).join(", ")}): change the type, or mark the second beat continues: true when it is a deliberate continuation`, fix: `give neighbours different scene types; ${see}`, basis: "score" });
  return F;
}

export function textureFindings(plan, rows, see = "references/launch-grammar.md") {
  const F = [], declared = rows.filter((r) => r.texture);
  if (declared.length < Math.ceil(rows.length / 2)) return [{ severity: "warning", check: "texture-undeclared", message: "beats do not say their motion texture (scenes[].texture: smooth | stepped | flicker | glitch): the texture mix cannot be checked", fix: `declare a texture per beat (and fps for stepped: 12 or 8); ${see}`, basis: "score" }];
  const w = runtimeOf(plan, rows), total = w.reduce((a, b) => a + b, 0) || 1;
  let non = 0, any = false; rows.forEach((r, i) => { if (r.texture && r.texture !== "smooth") { non += w[i] / total; any = true; } });
  if (!any) F.push({ severity: "warning", check: "texture-all-smooth", message: "every beat is smooth: a launch film needs at least one stepped or flicker section (the hook's chaos or a dense collage), with the calm beats staying smooth", fix: `make the hook or a collage stepped (12 or 8 fps) or a flicker burst; ${see}`, basis: "score" });
  else if (non < LB.nonsmooth_min - 0.02 || non > LB.nonsmooth_max + 0.02) F.push({ severity: "warning", check: "texture-mix", message: `stepped, flicker and glitch cover ${Math.round(non * 100)}% of the runtime (${Math.round(LB.nonsmooth_min * 100)}-${Math.round(LB.nonsmooth_max * 100)}% is the target)`, fix: `${non < LB.nonsmooth_min ? "stutter one more dense beat" : "return some beats to smooth"}: never all smooth, never all stutter; ${see}`, basis: "score" });
  const calm = rows.filter((r) => /^(meet|payoff|end)/.test(r.role) && r.texture && r.texture !== "smooth");
  if (calm.length) F.push({ severity: "warning", check: "texture-calm-beat", message: `calm beat(s) ${calm.map((r) => r.id).join(", ")} (meet, payoff, end) are not smooth`, fix: `keep the meet, the payoff line and the end smooth; ${see}`, basis: "score" });
  const nofps = rows.filter((r) => r.texture === "stepped" && !(r.fps >= 4 && r.fps <= 15));
  if (nofps.length) F.push({ severity: "warning", check: "texture-fps", message: `stepped beat(s) ${nofps.map((r) => r.id).join(", ")} lack a usable fps (4 to 15; 12 or 8 typical)`, fix: `set fps: 12 (on twos at 24) or 8 on each stepped beat; ${see}`, basis: "score" });
  return F;
}

// the catalogue names a beat declares: `moves_named` (the canonical field: a string or an array of strings), plus, for older scores, strings in moves[] (objects there are the per-tween records) and move_names[] / reference_moves[]. Never throws on a mixed array.
export const moveNamesOf = (s) => {
  const out = [], push = (v) => { const t = sceneKey(v); if (t) out.push(t); };
  if (s && typeof s.moves_named === "string") push(s.moves_named);
  for (const k of ["moves_named", "moves", "move_names", "reference_moves"]) if (Array.isArray(s && s[k])) s[k].forEach((m) => { if (typeof m === "string") push(m); else if (m && typeof m === "object" && (m.move || m.name_ref)) push(m.move || m.name_ref); });
  return out;
};

// AI-cliche and move-variety checks (all warnings; references/launch-moves.md). Reads the score's own fields, so a render is not needed.
export function clicheFindings(plan, rows, see = "references/launch-moves.md") {
  const F = [], sc = plan && Array.isArray(plan.scenes) ? plan.scenes : plan && Array.isArray(plan.beats) ? plan.beats : [];
  const w = (check, message, fix) => F.push({ severity: "warning", check, message, fix: `${fix}; ${see}`, basis: "score" });
  const per = sc.map((b, i) => {
    const names = moveNamesOf(b), recs = Array.isArray(b.moves) ? b.moves.filter((m) => m && typeof m === "object") : [];
    const text = [b.emphasis, b.line_build, b.entrance, b.move_note].concat(names).filter((v) => v != null).map(String).join(" ");
    const recText = recs.map((m) => [m.entrance, m.kind, m.effect, m.layer, m.element, m.target, m.what].filter((v) => v != null).join(" ")).join(" ");
    return { id: String(b.id != null ? b.id : b.n != null ? b.n : i + 1), names, text, recs, recText, typed: b.typed === true || /^typed?$/i.test(String(b.line_build || "")) || CLICHE.typed.test(text) };
  });
  const ids = (a) => a.map((p) => p.id).slice(0, 6).join(", ");
  // 1. banned: a highlighted word that nudges or pulses as the emphasis, glow pulses, bokeh, particles
  const bad = per.filter((p) => CLICHE.banned.test(p.text) || CLICHE.banned.test(p.recText));
  if (bad.length) w("cliche-banned-move", `beat(s) ${ids(bad)} use a banned AI-cliche move (a highlighted word that nudges, bounces, pops or pulses; a glow pulse; bokeh or particles)`, "act on the word with an object instead: split it, slash it, set it on a glass shelf, scale-zoom it, swap it in place, slot-list it");
  // 1b. a travelling cursor or caret is a RARE move: once per film, with a declared story reason (scenes[].cursor_reason), never the default emphasis
  const travelRe = /travel|through|across|sweep|slide|select|drag|click|arc|glide/i;
  const cursorBeats = per.filter((p, i) => { const b = sc[i] || {}, nm = p.names.join(" ");
    return b.cursor === true || (b.cursor && typeof b.cursor === "object") || (CLICHE.cursorEl.test(nm) && !/^typ/.test(nm) && (travelRe.test(nm) || !CLICHE.typed.test(nm))) || p.recs.some((m) => CLICHE.cursorEl.test([m.element, m.target, m.what, m.id].filter((v) => v != null).join(" ")) && travelRe.test([m.kind, m.entrance, m.what, m.id].filter((v) => v != null).join(" "))); });
  const car = plan && (plan.carrier && typeof plan.carrier === "object" ? [plan.carrier.what, plan.carrier.kind].join(" ") : plan.carrier);
  const carCursor = car && CLICHE.cursorEl.test(String(car)) && /text|word|line|sentence|travel|through|across/i.test(String(car));
  const nCursor = cursorBeats.length || (carCursor ? 1 : 0);
  if (nCursor > CLICHE_CAPS.cursor_travel) w("cliche-cursor-repeat", `a cursor or caret travels in ${nCursor} beats (${cursorBeats.length ? ids(cursorBeats) : "the carrier"}; ${CLICHE_CAPS.cursor_travel} at most): it is a rare move, not the film's emphasis`, "keep one, where a real typing, selecting or dragging moment in the product earns it; give the others an object acting on the word");
  const noWhy = cursorBeats.filter((p) => { const b = sc[per.indexOf(p)] || {}; return !String(b.cursor_reason || b.story_reason || (b.cursor && b.cursor.reason) || "").trim(); });
  if (cursorBeats.length && noWhy.length) w("cliche-cursor-reason", `a cursor or caret travels in beat(s) ${ids(noWhy)} with no declared story reason (scenes[].cursor_reason)`, "say why it is there (a real typing or selection moment), and build it well: a real cursor shape at the right scale, an arc with acceleration and deceleration, one purposeful action at the end (select, click, drag), never a nudge on the word");
  // 2. caps
  const typed = per.filter((p) => p.typed); if (typed.length > CLICHE_CAPS.typed_lines) w("cliche-typed-lines", `${typed.length} typed lines (beats ${ids(typed)}; ${CLICHE_CAPS.typed_lines} at most): a typewriter on every line is a cliche`, "type at most two lines (a prompt or a closing caption); build the others by slot scroll, word swap, split, slash or scale-zoom");
  const wf = per.filter((p) => CLICHE.wordFade.test(p.text) || CLICHE.wordFade.test(p.recText)); if (wf.length > CLICHE_CAPS.word_fade_lines) w("cliche-word-fade", `${wf.length} lines build by the same word-by-word fade (beats ${ids(wf)}; ${CLICHE_CAPS.word_fade_lines} at most)`, "vary the line builds: slot scroll, in-place swap, split, slash, scale-zoom, persistent type over cuts");
  const su = per.filter((p) => CLICHE.slideUp.test(p.text) || CLICHE.slideUp.test(p.recText) || p.recs.some((m) => /slide-?up|rise/i.test(String(m.entrance || "")) && /card/i.test(String(m.element || m.target || m.what || "")))); if (su.length > CLICHE_CAPS.slide_up_cards) w("cliche-slide-up-cards", `cards slide up with a soft shadow in ${su.length} beats (${ids(su)}; ${CLICHE_CAPS.slide_up_cards} at most)`, "bring cards in by a stepped collage, a flicker swap, a glitch pop, a mask or a fly-in over footage");
  const ul = per.filter((p) => CLICHE.underline.test(p.text) || CLICHE.underline.test(p.recText)); if (ul.length > CLICHE_CAPS.underline) w("cliche-underline", `underline used as emphasis in ${ul.length} beats (${ids(ul)}; ${CLICHE_CAPS.underline} at most, and never as the highlight beat)`, "emphasise by an object acting on the word, a colour or serif/sans swap, a rack focus or a scale-zoom");
  const gp = per.filter((p) => CLICHE.glowParticle.test(p.recText) || p.names.some((n) => CLICHE.glowParticle.test(n))); const bud = plan && Array.isArray(plan.budget) ? plan.budget.filter((b) => b && /particle|bokeh|dust|pulse|breath/i.test(String(b.effect || ""))) : [];
  if (gp.length || bud.length) w("cliche-glow-particles", `glow, pulse or particle/bokeh layers in ${gp.length ? `beat(s) ${ids(gp)}` : "the score's budget"}: they read as AI atmosphere`, "atmosphere comes from a brand-gradient ground, real material (footage, a hex texture, glass, generated imagery)");
  // 3. move variety: named from the catalogue, no move in more than 2 beats
  const declared = per.filter((p) => p.names.length);
  if (rows.length >= 6 && declared.length < Math.ceil(rows.length / 2)) w("moves-undeclared", "beats do not name their reference moves (scenes[].moves_named: strings from the catalogue): move variety cannot be counted", `name each beat's move(s): ${REF_MOVES.join(", ")}`);
  else { const n = {}; declared.forEach((p) => [...new Set(p.names)].forEach((m) => { n[m] = (n[m] || 0) + 1; })); const over = Object.entries(n).filter(([, c]) => c > CLICHE_CAPS.move_beats);
    if (over.length) w("move-repeat", `${over.map(([m, c]) => `${m} in ${c} beats`).join(", ")} (${CLICHE_CAPS.move_beats} at most): each scene has its own idea`, "give the later beats a different move from the catalogue"); }
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
  // a film that declares stepped, flicker or glitch beats jumps on purpose: the rate is allowed to be much higher
  const textured = plan ? beatRows(plan).some((r) => r.texture && r.texture !== "smooth") : false;
  if (per10 <= (textured ? 14 : 4)) return null;
  const decl = plan ? beatRows(plan).slice(1).filter((r) => isPlainCut(r.transition)).length : null;
  return { severity: "warning", check: "frame-spikes", message: `${hardCuts} frame-difference spikes in ${Math.round(dur)} s (${Math.round(per10 * 10) / 10} per 10 s; the references show 1 to 3): some may be plain cuts${decl != null ? ` (the score declares ${decl})` : ""}`, fix: "carry an element or the type across the flips, or merge beats; references/launch-grammar.md" };
}
