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
//   emphasis / line_build   OPTIONAL: how the beat's key word is emphasised ({word, kind}: kind from EMPHASIS_KINDS; a plain string is still read), and how its line builds ("typed" | "word-fade" | "slot" | "swap" | "split" ...)
//   type_treatment  OPTIONAL: the display treatment of the beat's line (an id from score.type_treatments[]: TYPE_TREATMENTS below)
//   layout          capability beats: ui-full | side-label | type-then-ui | type-over-ui (title-over-card at most once)
//   ui_build        proof beats: the steps the UI builds through in place (shell, populate, state-change, result); score.ui_camera names the film's one camera treatment
//   ground_material OPTIONAL, 1 to 3 beats: grid | hex | halftone | paper | stone | light-shaft | plate
//   imagery        OPTIONAL: the Codex image the beat uses (a ref into crew/imagery.json / art/assets.json) or "none"
//   density         "dense" (3+ elements, a collage, a full UI or a full-frame object) | "sparse" (one small line or one object on an empty ground)
//   logo            true when the mark or wordmark is on screen in the beat
import { buzzwordHits, buzzwordMessage, BUZZWORD_FIX, ctaProblems, CTA_HOLD_MIN_S } from "./copy-lint.mjs";
import { grammarWaivers } from "./gate-profile.mjs";

// SOFT DEFAULTS (references/launch-grammar.md "Defaults you can leave"): scene-type counts and shares, the transition-family share, the texture share, the dense:sparse rhythm, plain cuts and
// display-scale type have no source behind their numbers (.context/motion-craft-research.md). They stay as defaults with their reason: the finding is a warning that says "explain the change",
// and a note once the score records { rule, why } in departures[] (grammar_waivers is the older name). Measured defects (an unlit or empty frame, meaningful stillness, flashes, unreadable text, claim truth) stay hard.
export const depOf = (plan, waived = {}) => ({ ...grammarWaivers(plan).waived, ...waived });
function soft(F, dep, rule, check, message, fix, see) {
  const why = dep[rule];
  if (why) F.push({ severity: "note", check, message: `departs by choice (${why}): ${message}`, fix: "none: the score explains the departure", basis: "score", waived: true });
  else F.push({ severity: "warning", check, message: `${message} (a default, not a law)`, fix: `${fix}; or keep it and record { rule: "${rule}", why } in score.departures${see ? `; ${see}` : ""}`, basis: "score" });
}

export const LB = { max_plain_cuts_warn: 0, max_plain_cuts_error: 2, max_logo: 3, carrier_share_max: 0.4, scene_min_types_40s: 5, scene_share_max: 0.3, nonsmooth_min: 0.15, nonsmooth_max: 0.4, transition_share_max: 0.3, imagery_max: 8, imagery_ready_min: 4, type_treatments_min_40s: 5, emphasis_kind_max_lines: 2, title_over_card_max: 1, ui_proof_min_area: 25, ground_material_max: 3, max_words_line: 9, min_density_alternations: 2, max_dense_run: 2, beat_median_warn_s: 5 };

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
export const REF_MOVES = ["object-splits-word", "redaction-slash", "glass-shelf", "scale-as-transition", "iris-through-object", "logo-builds-itself", "oversized-type-bleed", "restraint-slate", "persistent-type-over-cuts", "footage-word-by-word", "dashboard-scroll", "orbit-diagram", "slot-list", "mixed-type-collage", "stepped-collage-flicker", "metaphor-from-copy", "product-flow-demo", "product-character", "line-lighting", "border-light-trace", "readable-copy-quick-cuts", "inline-icon-chips", "ui-as-typography", "cost-pain-stacked-prices", "halftone-display-type", "stepped-blocks-across-type", "tilted-ui-dolly", "hand-drawn-annotation", "logo-on-photo-plate", "typed-cta-end", "type-motion-smear", "redaction-pill-live-number", "glass-pane-refraction-wipe", "corner-selection-brackets", "oversized-emerging-type"];
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
// owner 2026-11-02 (v3 film): word-by-word rise+fade is the standard AI entrance (once per film at most); counting numbers and rolling slot lists are rare (once, a real hero number);
// stepped motion never goes on a continuous single-direction move; generated images carry no people and no neon/glow tech look.
CLICHE.wordRise = /word[-_ ]?(by[-_ ]?word)?[-_ ]?(rise|fade[-_ ]?up|appear[-_ ]?from[-_ ]?bottom|stagger[-_ ]?up)|(rise|appear)[-_ ]?(and[-_ ]?)?(fade)[-_ ]?(per|each|by)?[-_ ]?word|appear[-_ ]?from[-_ ]?(the[-_ ]?)?bottom|rise[-_ ]?\+[-_ ]?fade/i;
CLICHE.countUp = /count[-_ ]?(up|ing)|counters?(?![-_ ]?drift)|odometer|ticker|tick(s|ing)?\b|rolling[-_ ]?(number|digit)|streak[-_ ]?counter|number[-_ ]?roll|digit[-_ ]?roll/i;
CLICHE.zoomFade = /zoom[-_ ]?(in|out)?[-_ ]?(and[-_ ]?|\+[-_ ]?)?fade|scale[-_ ]?(up|down|in|out)?[-_ ]?(and[-_ ]?|\+[-_ ]?)?fade|fade[-_ ]?(and[-_ ]?|\+[-_ ]?)?(zoom|scale)|fade[-_ ]?(in|out)[-_ ]?(and[-_ ]?)?(zoom|scale)/i;
CLICHE.ticker = /ticker|dashboard[-_ ]?tick|decorative[-_ ]?(count|number)/i;
CLICHE.slot = /slot[-_ ]?(list|machine|scroll)|rolling[-_ ]?list/i;
CLICHE.fluidMove = /scroll|\bpan\b|pan[-_ ]|[-_ ]pan\b|push|glide|gliding|orbit|slide[-_ ]?across|long[-_ ]?glide|dolly|track(ing)?[-_ ]?shot/i;
export const CLICHE_CAPS = { cursor_travel: 1, typed_lines: 2, word_fade_lines: 2, word_rise_lines: 1, count_up: 1, slot_list: 1, zoom_fade: 1, slide_up_cards: 2, underline: 1, move_beats: 2 };

// imagery prompts (references/imagery.md "Launch imagery"): the references use editorial, tactile still-life (objects, props, places without people, materials, printed matter), natural light, warm or neutral palettes.
// A prompt that asks for people or a neon/glow tech look reads as AI-generated. Negations ("no people", "without faces") are not counted.
export const IMAGERY_RISK = /\b(people|persons?|man|men|woman|women|boy|girl|child(ren)?|human(s)?|faces?|hands?|fingers?|silhouettes?|crowds?|portraits?|figures?)\b|\b(neon|glow(s|ing)?|hologra(m|ms|phic)|cyberpunk|futuristic)\b/i;
export const IMAGERY_STYLE = "Editorial, tactile still life: real objects, props, materials, printed matter or a place with no people, natural light, a warm or neutral palette, photographic or print feel, as if cut out or collaged into a card.";
export const IMAGERY_AVOID = "people, faces, hands, figures, silhouettes, crowds, neon, blue or purple glow gradients, glowing screens, holograms, cinematic AI mood, sci-fi tech scenes, text, logos";
export function imageryPromptRisk(prompt) {
  const clean = String(prompt == null ? "" : prompt).replace(/\b(no|not|never|without|avoid|avoiding|nor|exclude|excluding)\b[^.;\n]*/gi, " ");
  const m = clean.match(new RegExp(IMAGERY_RISK.source, "gi"));
  return m ? [...new Set(m.map((x) => x.toLowerCase()))] : [];
}
export function imageryPromptFindings(plan, see = "references/imagery.md") {
  const bank = plan && Array.isArray(plan.imagery_plan) ? plan.imagery_plan : [];
  if (plan && (plan.imagery_people === true || plan.brief_requires_people === true || plan.people_ok === true)) return [];
  const hits = bank.map((e) => ({ id: e && e.id, risk: e && !(e.people_ok === true || e.brief_requires_people === true) ? imageryPromptRisk(e.prompt) : [] })).filter((x) => x.risk.length);
  return hits.length ? [{ severity: "warning", check: "imagery-people-or-glow", message: `imagery prompt(s) ${hits.map((h) => `${h.id} (${h.risk.join(", ")})`).join("; ")} ask for people or a neon/glow look: it reads as AI-generated`, fix: `draw still-life objects, props, places without people, materials and printed matter in natural light and a warm or neutral palette, used as content inside a card or collage; people only when the brief asks (imagery_people: true); ${see}`, basis: "score" }] : [];
}
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
  const later = rows.slice(1), declared = later.filter((r) => r.transition != null), dep = depOf(plan, waived);
  if (!declared.length) add("warning", "transition-undeclared", "no beat names how it arrives (scenes[].transition_in, or score.seams[].kind): transition variety cannot be checked", `give every beat a transition_in (hard-cut-on-hit, stepped-smash, flicker-cut, mask-wipe, push, pull, whip, morph, match-cut, type-morph ...); ${see}`);
  else {
    const plain = later.filter((r) => isPlainCut(r.transition));
    // a cut is a valid choice (research rule 31): an undeclared one only asks for its reason
    if (plain.length) soft(F, dep, "hard-cuts", "hard-cuts", `${plain.length} plain cut(s) with no stated reason (beats ${plain.map((r) => r.id).slice(0, 6).join(", ")}): a hard cut is fine; say what it lands on (transition_in: "hard-cut-on-hit", the music hit) or what the beat carries across it`, `name the hit the cut lands on, or use a stepped smash, a flicker cut, a mask, a push or a whip`, see);
    // transition variety: among the DESIGNED seams (hard cuts excluded), no family on more than ~30%
    { const designed = declared.filter((r) => { const k = transitionFamily(r.transition); return k && k !== "hard-cut" && !isPlainCut(r.transition); });
      if (designed.length >= 4) {
        const fam = {}; designed.forEach((r) => { const k = transitionFamily(r.transition); if (k) fam[k] = (fam[k] || 0) + 1; });
        const [top, cnt] = Object.entries(fam).sort((a, b) => b[1] - a[1])[0] || ["", 0];
        if (cnt / designed.length > LB.transition_share_max + 1e-9) soft(F, dep, "transition-variety", "transition-variety", `"${top}" is ${cnt} of ${designed.length} designed seams (${Math.round((100 * cnt) / designed.length)}%; about ${Math.round(LB.transition_share_max * 100)}% is the default ceiling): one transition used throughout can read as a gimmick`, `mix the vocabulary: hard cuts on hits, stepped smash, flicker cut, mask or wipe, push or pull, whip, morph, match cut, type morph`, see);
      }
      const nfam = new Set(designed.map((r) => transitionFamily(r.transition))).size;
      if (nfam > 3) F.push({ severity: "note", check: "bridge-families", message: `${nfam} bridge families besides hard cuts: the calibration profile starts at hard cuts plus 2 to 3 families (a starting value to test, not a standard); each extra family needs a role`, fix: "give every family its own meaning in bridge_reason, or fold two together", basis: "score" }); }
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
  F.push(...sceneVarietyFindings(plan, rows, see, dep));
  // 3c. motion texture contrast: smooth / stepped / flicker / glitch
  F.push(...textureFindings(plan, rows, see, dep));
  // 3c2. AI cliches and move variety
  F.push(...clicheFindings(plan, rows));
  // 3d. imagery: Codex stills as content (4 to 8 per film when Codex is ready, reused 2 to 3 times; references/imagery.md "Launch imagery")
  { const refs = [...new Set(rows.map((r) => r.imagery).filter((v) => v && !/^(none|no|-|n\/a)$/i.test(v)))];
    if (refs.length > LB.imagery_max) F.push({ severity: "warning", check: "imagery-count", message: `${refs.length} distinct Codex images (${LB.imagery_max} at most): reuse the strongest 2 to 3 times instead of adding more`, fix: `keep the images that carry meaning (a world inside a UI card, a collage plate, an object shot) and reuse them; ${see}`, basis: "score" });
    else if (String(plan.imagegen || "").toLowerCase() === "ready" && refs.length < LB.imagery_ready_min) F.push({ severity: "warning", check: "imagery-count", message: `Codex imagery is ready but the score uses ${refs.length} image(s) (${LB.imagery_ready_min} to ${LB.imagery_max} is the default): the references fill UI cards and collages with still-life worlds`, fix: `plan 4 to 8 still-life or world images used as content inside UI cards and collages, each reused 2 to 3 times; ${see} section 4d`, basis: "score" }); }
  F.push(...varietyFindings(plan, rows, see, dep));
  F.push(...imageryPromptFindings(plan));
  // 4. copy: one thought per beat; lines over about 9 words on screen at once
  const long = rows.map((r) => ({ r, n: words(r.line) })).filter((x) => x.n > LB.max_words_line);
  if (long.length) add("warning", "copy-line-long", `${long.length} beat(s) hold more than ${LB.max_words_line} words on screen at once (${long.slice(0, 4).map((x) => `${x.r.id}: ${x.n}`).join(", ")}): one thought per beat`, `split the line into two beats, or build it word by word so only a few words are new at a time; ${see}`);
  // 5. rhythm: dense and sparse alternate (at least two alternations)
  const dens = rows.map((r) => (r.density === "dense" || r.density === "sparse" ? r.density : null)).filter(Boolean);
  if (dens.length < Math.ceil(rows.length / 2)) F.push({ severity: "warning", check: "rhythm-undeclared", message: "beats do not say dense or sparse (scenes[].density): the rhythm cannot be checked", fix: `tag each beat dense (3+ elements, a collage, a full-frame object) or sparse (one small line or object on an empty ground); ${see}`, basis: "score" });
  else {
    let alt = 0; for (let i = 1; i < dens.length; i++) if (dens[i] !== dens[i - 1]) alt++;
    if (alt < LB.min_density_alternations) soft(F, dep, "rhythm", "rhythm", `${alt} dense/sparse alternation(s) (${LB.min_density_alternations} is the default): the film holds one density, and no source gives a dense:sparse ratio`, `alternate a dense moment (a collage, a UI, a big object) with one small line on an empty ground, or explain a relentless or serene passage`, see);
  }
  // dense beats never run more than 2 in a row (a warning)
  { let run = 0, worst = 0, at = ""; rows.forEach((r) => { if (r.density === "dense") { run++; if (run > worst) { worst = run; at = r.id; } } else run = 0; });
    if (worst > LB.max_dense_run) F.push({ severity: "warning", check: "dense-run", message: `${worst} dense beats in a row (ending at beat ${at}; ${LB.max_dense_run} at most): dense and sparse alternate`, fix: `follow a dense beat with a sparse one (one small line on an empty ground); ${see}`, basis: "score" }); }
  // 6. beats, not shots: a one-take film has long "shots"; a beat that runs long is the thing to watch
  const durs = rows.map((r) => r.dur).filter((d) => d != null && d > 0).sort((a, b) => a - b);
  if (durs.length >= 4) { const med = durs[Math.floor(durs.length / 2)]; if (med > LB.beat_median_warn_s) F.push({ severity: "warning", check: "beat-length", message: `median beat ${Math.round(med * 10) / 10} s (the references run 2.8 to 3.7 s): the film changes thought too slowly`, fix: `split long beats: one thought each; ${see}`, basis: "score" }); }
  F.push(...clarityFindings(plan, rows));
  F.push(...motionLawFindings(plan, rows));
  F.push(...purposeFindings(plan, rows));
  F.push(...craftResearchFindings(plan, rows));
  return F;
}

const runtimeOf = (plan, rows) => {
  const have = rows.filter((r) => r.dur != null && r.dur > 0);
  return have.length === rows.length ? rows.map((r) => r.dur) : rows.map(() => 1); // no durations: weigh the beats equally
};

export function sceneVarietyFindings(plan, rows, see = "references/launch-grammar.md", dep = depOf(plan)) {
  const F = [], declared = rows.filter((r) => r.scene_type);
  if (declared.length < Math.ceil(rows.length / 2)) return [{ severity: "warning", check: "scene-type-undeclared", message: "beats do not say their scene type (scenes[].scene_type): scene variety cannot be checked", fix: `tag each beat from the palette (${SCENE_TYPES.join(", ")}); ${see}`, basis: "score" }];
  const w = runtimeOf(plan, rows), total = w.reduce((a, b) => a + b, 0) || 1, dur = rows.every((r) => r.dur > 0) ? total : Number(plan && plan.duration) || 0;
  const share = {}; rows.forEach((r, i) => { if (r.scene_type) share[r.scene_type] = (share[r.scene_type] || 0) + w[i] / total; });
  const types = Object.keys(share), need = dur >= 40 ? LB.scene_min_types_40s : dur >= 20 ? 3 : 0;
  if (need && types.length < need) soft(F, dep, "scene-variety", "scene-variety", `${types.length} scene type(s) in a ${Math.round(dur)} s film (${need}+ is the default: ${types.join(", ")}): a launch film is usually a sequence of different scenes`, `add scenes from the palette (a type slate, a UI proof, a cinematic image, a diagram, a data scene, a kinetic list, an object shot, a typed prompt)`, see);
  const [top, sh] = Object.entries(share).sort((a, b) => b[1] - a[1])[0];
  if (sh > LB.scene_share_max + 0.02) soft(F, dep, "scene-variety", "scene-share", `"${top}" takes ${Math.round(sh * 100)}% of the runtime (about ${Math.round(LB.scene_share_max * 100)}% is the default ceiling)`, `replace some of those beats with another scene type`, see);
  const rep = []; for (let i = 1; i < rows.length; i++) if (rows[i].scene_type && rows[i].scene_type === rows[i - 1].scene_type && !rows[i].continues) rep.push(`${rows[i - 1].id}-${rows[i].id}`);
  if (rep.length) F.push({ severity: "warning", check: "scene-neighbours", message: `neighbouring beats share a scene type (${rep.slice(0, 5).join(", ")}): change the type, or mark the second beat continues: true when it is a deliberate continuation`, fix: `give neighbours different scene types; ${see}`, basis: "score" });
  return F;
}

export function textureFindings(plan, rows, see = "references/launch-grammar.md", dep = depOf(plan)) {
  const F = [], declared = rows.filter((r) => r.texture);
  if (declared.length < Math.ceil(rows.length / 2)) return [{ severity: "warning", check: "texture-undeclared", message: "beats do not say their motion texture (scenes[].texture: smooth | stepped | flicker | glitch): the texture mix cannot be checked", fix: `declare a texture per beat (and fps for stepped: 12 or 8); ${see}`, basis: "score" }];
  const w = runtimeOf(plan, rows), total = w.reduce((a, b) => a + b, 0) || 1;
  let non = 0, any = false; rows.forEach((r, i) => { if (r.texture && r.texture !== "smooth") { non += w[i] / total; any = true; } });
  if (!any) soft(F, dep, "texture", "texture-all-smooth", "every beat is smooth: a stepped or flicker section (the hook's chaos or a dense collage) usually adds contrast, with the calm beats staying smooth", `make the hook or a collage stepped (12 or 8 fps) or a flicker burst`, see);
  else if (non < LB.nonsmooth_min - 0.02 || non > LB.nonsmooth_max + 0.02) soft(F, dep, "texture", "texture-mix", `stepped, flicker and glitch cover ${Math.round(non * 100)}% of the runtime (${Math.round(LB.nonsmooth_min * 100)}-${Math.round(LB.nonsmooth_max * 100)}% is the starting value; no source sets a share)`, `${non < LB.nonsmooth_min ? "stutter one more dense beat" : "return some beats to smooth"}, or say why this film sits outside it`, see);
  const calm = rows.filter((r) => /^(meet|payoff|end)/.test(r.role) && r.texture && r.texture !== "smooth");
  if (calm.length) F.push({ severity: "warning", check: "texture-calm-beat", message: `calm beat(s) ${calm.map((r) => r.id).join(", ")} (meet, payoff, end) are not smooth`, fix: `keep the meet, the payoff line and the end smooth; ${see}`, basis: "score" });
  const nofps = rows.filter((r) => r.texture === "stepped" && !(r.fps >= 4 && r.fps <= 15));
  if (nofps.length) F.push({ severity: "warning", check: "texture-fps", message: `stepped beat(s) ${nofps.map((r) => r.id).join(", ")} lack a usable fps (4 to 15; 12 or 8 typical)`, fix: `set fps: 12 (on twos at 24) or 8 on each stepped beat; ${see}`, basis: "score" });
  // flash-frame bursts (a flicker beat): one varying element in a locked layout, 8 to 24 frames, landing on a held readable frame on the downbeat; 1 to 2 per film, never back to back
  { const sc = plan && Array.isArray(plan.scenes) ? plan.scenes : plan && Array.isArray(plan.beats) ? plan.beats : [];
    const fl = rows.filter((r) => r.texture === "flicker"), why = [];
    fl.forEach((r) => { const b = sc[r.i] || {}, miss = [], bad = [];
      const bc = String(b.burst_content == null ? "" : b.burst_content).toLowerCase().trim(), bf = Number(b.burst_frames), lo = String(b.lands_on == null ? "" : b.lands_on).trim();
      if (!bc) miss.push("burst_content"); else if (!/^single[-_ ]?element$/.test(bc)) bad.push(`burst_content "${bc}" (must be single-element: one varying element in a locked layout, never unrelated metrics or messages)`);
      if (b.burst_frames == null) miss.push("burst_frames"); else if (!(bf >= 8 && bf <= 24)) bad.push(`burst_frames ${b.burst_frames} (8 to 24, about 0.3 to 0.8 s)`);
      if (!lo) miss.push("lands_on");
      if (b.lands_hold_frames != null && !(Number(b.lands_hold_frames) >= 12)) bad.push(`lands_hold_frames ${b.lands_hold_frames} (the landing frame is held 12 frames or more)`);
      if (miss.length || bad.length) why.push(`beat ${r.id}: ${[miss.length ? "missing " + miss.join(", ") : "", ...bad].filter(Boolean).join("; ")}`); });
    if (why.length) F.push({ severity: "warning", check: "flicker-burst-fields", message: `flash-frame burst not declared correctly (${why.join(" | ")})`, fix: `a flicker beat declares burst_content: "single-element", burst_frames (8 to 24) and lands_on (the held readable frame on the downbeat that carries the real message); never use a burst to carry information the viewer must read; ${see}`, basis: "score" });
    if (fl.length > 2) F.push({ severity: "warning", check: "flicker-burst-count", message: `${fl.length} flicker beats (1 to 2 bursts per film at most)`, fix: `keep one or two bursts, as a build-up before a reveal, drop or beat hit; ${see}`, basis: "score" });
    if (fl.some((r, k) => k && r.i - fl[k - 1].i === 1)) F.push({ severity: "warning", check: "flicker-burst-adjacent", message: "flicker bursts back to back", fix: `separate bursts by smooth beats; ${see}`, basis: "score" }); }
  // stepped motion never goes on a continuous single-direction move (scroll, pan, push, glide, orbit, slide-across): those stay fluid
  { const sc = plan && Array.isArray(plan.scenes) ? plan.scenes : plan && Array.isArray(plan.beats) ? plan.beats : [];
    const bad = rows.filter((r, i) => { const b = sc[i] || {}; if (r.texture !== "stepped") return false;
      const recs = Array.isArray(b.moves) ? b.moves.filter((m) => m && typeof m === "object") : [];
      const txt = moveNamesOf(b).concat([b.move_note, b.entrance, b.line_build], recs.map((m) => [m.kind, m.effect, m.what, m.id].filter((v) => v != null).join(" "))).filter((v) => v != null).join(" ");
      return CLICHE.fluidMove.test(txt); });
    if (bad.length) F.push({ severity: "warning", check: "stepped-fluid-move", message: `stepped motion on a fluid single-direction move (beat(s) ${bad.map((r) => r.id).slice(0, 6).join(", ")}: scroll, pan, push, glide, orbit or slide-across): those stay smooth`, fix: `keep scrolls, pans, pushes, glides and orbits fluid; use stepped for pieces arriving or assembling in a collage, pop-ins, discrete state changes, montage bursts and hits on the beat; ${see}`, basis: "score" }); }
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
// a typed line = a typing MOVE (a move name, entrance, kind or target), not the word "type" in a move name like persistent-type-over-cuts or in prose notes
const TYPED_MOVE = /\b(typed|typing|typewriter|type[-_ ]?on|type[-_ ]?in)\b|\bcaret\b/i;
const typedText = (b, names, recs) => [b.line_build, b.entrance, b.emphasis && typeof b.emphasis === "object" ? b.emphasis.kind : b.emphasis].concat(names, recs.flatMap((m) => [m.entrance, m.kind, m.effect, m.element, m.target])).filter((v) => v != null).map(String).join(" ");
export function clicheFindings(plan, rows, see = "references/launch-moves.md") {
  const F = [], sc = plan && Array.isArray(plan.scenes) ? plan.scenes : plan && Array.isArray(plan.beats) ? plan.beats : [];
  const w = (check, message, fix) => F.push({ severity: "warning", check, message, fix: `${fix}; ${see}`, basis: "score" });
  const per = sc.map((b, i) => {
    const names = moveNamesOf(b), recs = Array.isArray(b.moves) ? b.moves.filter((m) => m && typeof m === "object") : [];
    const text = [emphText(b.emphasis), b.line_build, b.entrance, b.move_note].concat(names).filter((v) => v != null).map(String).join(" ");
    const recText = recs.map((m) => [m.entrance, m.kind, m.effect, m.layer, m.element, m.target, m.what].filter((v) => v != null).join(" ")).join(" ");
    return { id: String(b.id != null ? b.id : b.n != null ? b.n : i + 1), names, text, recs, recText, typed: b.typed === true || /^typed?$/i.test(String(b.line_build || "")) || TYPED_MOVE.test(typedText(b, names, recs)) };
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
  const wr = per.filter((p) => CLICHE.wordRise.test(p.text) || CLICHE.wordRise.test(p.recText) || p.recs.some((m) => /^(word[-_ ]?(rise|fade[-_ ]?up)|word[-_ ]?stagger[-_ ]?up)$/i.test(String(m.entrance || m.kind || "")))); if (wr.length > CLICHE_CAPS.word_rise_lines) w("cliche-word-rise", `word-by-word rise-and-fade (appear from the bottom) in ${wr.length} beats (${ids(wr)}; ${CLICHE_CAPS.word_rise_lines} at most): it is the standard AI entrance`, "use the reference vocabulary: a swap in place, an object splitting a word, a slash, a scale-zoom, persistent type over cuts, a typed line used rarely, a hard cut on the beat, a mask wipe or a stepped pop");
  const zf = per.filter((p) => CLICHE.zoomFade.test(p.text) || CLICHE.zoomFade.test(p.recText) || p.names.some((n) => CLICHE.zoomFade.test(n)) || String((sc[per.indexOf(p)] || {}).transition_in || "").match(CLICHE.zoomFade)); if (zf.length > CLICHE_CAPS.zoom_fade) w("cliche-zoom-fade", `the standard zoom-in plus fade (scale up or down combined with an opacity fade) as an entrance or transition in ${zf.length} beats (${ids(zf)}; ${CLICHE_CAPS.zoom_fade} at most)`, "use a mask, a swap in place, an object splitting the word, a hard cut on the beat, a stepped pop, or a scale-zoom that is the transition itself (scale-as-transition) rather than a scale plus opacity fade");
  const cu = per.filter((p) => CLICHE.countUp.test(p.text) || CLICHE.countUp.test(p.recText) || p.names.some((n) => CLICHE.countUp.test(n)) || p.recs.some((m) => /count|odometer|ticker/i.test(String(m.kind || m.entrance || m.effect || "")))); if (cu.length > CLICHE_CAPS.count_up) w("cliche-count-up", `counting numbers (count-up, odometer, ticker) in ${cu.length} beats (${ids(cu)}; ${CLICHE_CAPS.count_up} at most): editors rarely count`, "allow one count-up, for a real hero number that matters to the story (social proof such as Join 27,300 others); show every other number as a static value, a swap or a hard cut");
  const tk = per.filter((p) => CLICHE.ticker.test(p.text) || CLICHE.ticker.test(p.recText) || p.names.some((n) => CLICHE.ticker.test(n))); if (tk.length) w("cliche-ticker", `decorative ticker or ticking numbers in beat(s) ${ids(tk)}: banned`, "remove the ticker; a number is either the hero number (one count-up per film) or a static value");
  const sl = per.filter((p) => CLICHE.slot.test(p.text) || CLICHE.slot.test(p.recText) || p.names.some((n) => CLICHE.slot.test(n))); if (sl.length > CLICHE_CAPS.slot_list) w("cliche-slot-list", `rolling slot list in ${sl.length} beats (${ids(sl)}; ${CLICHE_CAPS.slot_list} at most)`, "use one slot list, then vary: swap in place, split, slash, scale-zoom");
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

// Clarity, proof and call to action (references/launch-grammar.md section 14; fields in references/score.md "Clarity, proof and CTA").
// All warnings: the film says what it is and who it is for by the turn, shows real UI by about 40%, proves the core job, ends on a held CTA, and says one thing.
// Type, layout, UI-build and ground variety (all warnings; references/launch-grammar.md sections 2, 5 and 12). The reference films use 7 to 12 type treatments,
// 4 to 7 emphasis kinds, UI at 30 to 100% of the frame and material grounds; ours used 2, 1 and a headline over a centred card (.context night-1106 grammar findings).
export const TYPE_TREATMENTS = ["halftone-mega", "outline", "mixed-serif-sans", "dot-matrix", "black-band-bleed", "caption-on-image", "oversized-bleed", "tiny-inline", "split-card", "mono-caption", "stacked-scale", "type-collage"];
export const EMPHASIS_KINDS = ["gradient-fill", "redaction", "glass-shelf", "word-on-bar", "icon-chip", "serif-swap", "scale", "object-split", "outline", "colour", "weight", "italic"];
export const CAP_LAYOUTS = ["ui-full", "side-label", "type-then-ui", "type-over-ui", "title-over-card"];
export const UI_CAMERAS = ["tilted-ui-dolly", "macro-push", "pull-back"];
export const GROUND_MATERIALS = ["grid", "hex", "halftone", "paper", "stone", "light-shaft", "plate"];
const COLOUR_ONLY = /^(colou?r|weight|italic)$/;
export const emphText = (v) => (v && typeof v === "object" ? [v.word, v.kind].filter((x) => x != null).join(" ") : v);
export const emphKind = (v) => {
  const t = String(v && typeof v === "object" ? v.kind || "" : v || "").toLowerCase();
  if (!t.trim()) return null;
  if (/gradient/.test(t)) return "gradient-fill"; if (/redact|slash/.test(t)) return "redaction"; if (/glass|shelf/.test(t)) return "glass-shelf";
  if (/\bbar\b|band|pill/.test(t)) return "word-on-bar"; if (/icon|chip/.test(t)) return "icon-chip"; if (/serif/.test(t)) return "serif-swap";
  if (/split/.test(t)) return "object-split"; if (/outline|stroke/.test(t)) return "outline"; if (/scale|size|zoom|huge/.test(t)) return "scale";
  if (/colou?r|accent|tint|hue/.test(t)) return "colour"; if (/weight|bold/.test(t)) return "weight"; if (/italic/.test(t)) return "italic";
  return sceneKey(t);
};
const idOf = (v) => sceneKey(v && typeof v === "object" ? v.id || v.kind || v.name || "" : v);
export function varietyFindings(plan, rows, see = "references/launch-grammar.md", dep = depOf(plan)) {
  const F = [], sc = plan && Array.isArray(plan.scenes) ? plan.scenes : plan && Array.isArray(plan.beats) ? plan.beats : [];
  const w = (check, message, fix) => F.push({ severity: "warning", check, message, fix: `${fix}; ${see}`, basis: "score" });
  const ids = (a) => a.slice(0, 6).join(", ");
  const refFilm = /^launch-beats@/.test(String(plan && plan.format || "")); // a reference analysis (library/benchmarks/launch-refs) records beats, not the film-level fields below
  const total = rows.every((r) => r.dur > 0) ? rows.reduce((a, r) => a + r.dur, 0) : Number(plan && (plan.duration || plan.duration_s)) || 0;
  // 1. type treatments: a film-level palette of 5+ display treatments in 45 s (score.type_treatments[] plus each beat's type_treatment)
  { const set = new Set((Array.isArray(plan.type_treatments) ? plan.type_treatments : []).map(idOf).concat(sc.map((s) => idOf(s && s.type_treatment))).filter(Boolean));
    const need = total >= 40 ? LB.type_treatments_min_40s : total >= 20 ? 3 : 0;
    if (need && !refFilm && set.size < need) soft(F, dep, "type-treatment-variety", "type-treatment-variety", `${set.size} type treatment(s) declared (${need}+ is the default for a ${Math.round(total)} s film${set.size ? `: ${[...set].join(", ")}` : ""}): the references change the type treatment cut to cut`, `declare score.type_treatments[] (${TYPE_TREATMENTS.slice(0, 6).join(", ")} ...) and set type_treatment per beat`, `${see} section 2`); }
  // 2. emphasis: one per line, its kind varies; one kind (or colour/weight alone) on more than 2 lines is monotone
  { const em = rows.map((r, i) => ({ id: r.id, k: words(r.line) > 0 ? emphKind(sc[i] && sc[i].emphasis) : undefined })).filter((x) => x.k !== undefined);
    const kinds = em.filter((x) => x.k), n = {}; kinds.forEach((x) => { n[x.k] = (n[x.k] || 0) + 1; });
    const over = Object.entries(n).filter(([, c]) => c > LB.emphasis_kind_max_lines), colour = kinds.filter((x) => COLOUR_ONLY.test(x.k));
    if (em.length >= 4 && kinds.length < Math.ceil(em.length / 2)) F.push({ severity: "note", check: "emphasis-undeclared", message: "few beats declare emphasis {word, kind}: emphasis variety cannot be checked", fix: `set emphasis: {word, kind} per line (${EMPHASIS_KINDS.slice(0, 8).join(", ")}); ${see} section 2`, basis: "score" });
    else if (over.length || colour.length > LB.emphasis_kind_max_lines) w("emphasis-monotone", `${over.length ? over.map(([k, c]) => `"${k}" on ${c} lines`).join(", ") : `colour or weight alone on ${colour.length} lines (${ids(colour.map((x) => x.id))})`} (${LB.emphasis_kind_max_lines} at most): the same last-word colour on every line is the AI tell`, "vary the kind line to line: gradient fill, redaction bar, glass shelf, word on a bar, inline icon chip, serif swap, scale, an object splitting the word"); }
  // 3. capability layout: never a template of headline over a centred card
  { const cap = rows.map((r, i) => ({ r, s: sc[i] || {} })).filter((x) => /^capabilit/.test(x.r.role));
    const lay = cap.map((x) => ({ id: x.r.id, l: sceneKey(x.s.layout || "") })).filter((x) => x.l);
    const toc = lay.filter((x) => /title|headline/.test(x.l) && /card|cent/.test(x.l));
    if (cap.length >= 2 && !lay.length) w("slide-layout", `capability beat(s) ${ids(cap.map((x) => x.r.id))} declare no layout: the default render is a headline over a centred card`, `set layout per capability beat: ${CAP_LAYOUTS.slice(0, 4).join(" | ")}`);
    else if (toc.length > LB.title_over_card_max) w("slide-layout", `${toc.length} beats are a title over a centred card (${ids(toc.map((x) => x.id))}; ${LB.title_over_card_max} at most)`, "let the UI fill the frame (ui-full), sit beside a small label (side-label: UI 40 to 60%, label 2 to 4% of the height), follow its line (type-then-ui) or carry the line over it (type-over-ui)");
    else if (lay.length >= 3 && new Set(lay.map((x) => x.l)).size === 1) w("slide-layout", `every capability beat uses the "${lay[0].l}" layout: the proofs read as one template`, "give the capability beats different layouts"); }
  // 4. UI proof: big, built in place, one camera treatment for the film
  { const proof = rows.map((r, i) => ({ r, s: sc[i] || {} })).filter((x) => /^capabilit/.test(x.r.role) || truthy(x.s.core_job_demo) || x.r.scene_type === "ui-proof");
    const small = proof.filter((x) => Number(x.s.ui_scale) > 0 && Number(x.s.ui_scale) < LB.ui_proof_min_area);
    if (small.length) w("ui-scale-small", `proof beat(s) ${ids(small.map((x) => `${x.r.id} (${x.s.ui_scale}%)`))} declare UI under ${LB.ui_proof_min_area}% of the frame: a chip, not a proof`, "fill 35 to 60% (or the full frame, tilted or macro); crop the UI rather than shrink it");
    const withUi = proof.filter((x) => Number(x.s.ui_scale) > 0 || x.r.scene_type === "ui-proof");
    const steps = (b) => (Array.isArray(b) ? b.length : String(b || "").split(/[>,→\s]+/).filter(Boolean).length);
    const flat = withUi.filter((x) => steps(x.s.ui_build) < 3);
    if (flat.length) w("ui-build", `proof beat(s) ${ids(flat.map((x) => x.r.id))} arrive complete (no ui_build of 3 or more steps)`, "build the UI in place: ui_build: [\"shell\", \"populate\", \"state-change\", \"result\"]");
    const cams = new Set(sc.map((s) => sceneKey(s && s.ui_camera || "")).filter((v) => v && v !== "none"));
    const film = sceneKey(plan.ui_camera && typeof plan.ui_camera === "object" ? plan.ui_camera.kind || "" : plan.ui_camera || "");
    if (film && film !== "none") cams.add(film);
    if (withUi.length && !cams.size) w("ui-camera", "the score names no UI camera treatment (score.ui_camera): every proof sits flat and square to the lens", `pick one for the film: ${UI_CAMERAS.join(" | ")}`);
    else if (cams.size > 1) w("ui-camera", `${cams.size} UI camera treatments (${[...cams].join(", ")}): one per film reads as a camera language`, "keep one treatment and vary its framing"); }
  // 5. ground material on 1 to 3 beats; gradients with shape, never blobs
  { const mat = rows.filter((r, i) => { const v = sceneKey(sc[i] && sc[i].ground_material || ""); return v && v !== "none"; });
    if (total >= 30 && !mat.length && !refFilm) w("ground-material", "no beat declares a ground_material: every ground is a haze", `put a material ground on 1 to 3 beats (${GROUND_MATERIALS.join(", ")})`);
    else if (mat.length > LB.ground_material_max) w("ground-material", `${mat.length} beats carry a ground material (${LB.ground_material_max} at most): a material is an accent`, "keep it on 1 to 3 beats, with plain lit grounds between");
    const BLOB = /blob|aurora|lava|bokeh|mesh[-_ ]?blur|soft[-_ ]?glow/i;
    const blob = rows.filter((r, i) => BLOB.test([sc[i] && sc[i].ground, sc[i] && sc[i].ground_material, sc[i] && sc[i].gradient].filter((v) => typeof v === "string").join(" ")));
    if (blob.length || BLOB.test(String(plan.ground_motion || ""))) w("ground-blob", `blob or aurora gradients in ${blob.length ? `beat(s) ${ids(blob.map((r) => r.id))}` : "score.ground_motion"}: shapeless colour reads as AI atmosphere`, "give the gradient a shape: a hard-edged sweep, a band, a lit plane"); }
  return F;
}

export const CL = { ui_by: 0.4, clarity_by: 0.25, ui_min_scale: 35, cta_hold_s: CTA_HOLD_MIN_S };
const S = (v) => String(v == null ? "" : typeof v === "object" ? v.text || v.what || v.name || "" : v).trim();
export function clarityFindings(plan, rows, see = "references/launch-grammar.md section 14") {
  const F = [], sc = plan && Array.isArray(plan.scenes) ? plan.scenes : plan && Array.isArray(plan.beats) ? plan.beats : [];
  const w = (check, message, fix) => F.push({ severity: "warning", check, message, fix: `${fix}; ${see}`, basis: "score" });
  // beat start times: declared start/t0, else the running sum of the durations
  let acc = 0; const starts = rows.map((r, i) => { const s0 = Number(sc[i] && (sc[i].start != null ? sc[i].start : sc[i].t0)); const st = Number.isFinite(s0) ? s0 : acc; acc = st + (r.dur > 0 ? r.dur : 0); return st; });
  const total = Number(plan && plan.duration) || (acc > 0 ? acc : 0);
  const roleAt = (role) => rows.findIndex((r) => r.role === role);
  const meetI = roleAt("meet");
  // 1. what it is, for whom
  const cl = plan && plan.clarity && typeof plan.clarity === "object" ? plan.clarity : null;
  if (!cl || !S(cl.category) || !S(cl.audience) || !S(cl.beat)) w("clarity-missing", "no clarity: {category, audience, beat} on the score: the copy must say what the product is and who it is for by the end of the turn", "add score.clarity naming the category, the audience and the beat where the copy says both (the hook or the turn; Kinso: \"Your next deal is in here somewhere\")");
  else {
    const key = S(cl.beat).toLowerCase();
    let ci = rows.findIndex((r) => String(r.id).toLowerCase() === key); if (ci < 0) ci = roleAt(key); if (ci < 0 && /^\d+$/.test(key)) ci = Number(key) - 1;
    if (ci < 0) w("clarity-beat-unknown", `clarity.beat "${S(cl.beat)}" matches no beat id or role`, "name the beat by its id or its role (hook, turn)");
    else if (meetI >= 0 && ci > meetI) w("clarity-late", `the category and audience land in beat ${rows[ci].id}, after the meet (beat ${rows[meetI].id}): the logo arrives before the viewer knows what it is`, "move the category and audience into the hook or the turn, before the logo");
    else if (total && starts[ci] / total > CL.clarity_by + 0.1) w("clarity-late", `the category and audience land at ${Math.round((100 * starts[ci]) / total)}% of the film (about ${Math.round(CL.clarity_by * 100)}% is the target, the end of the turn)`, "say what it is and who it is for in the hook or the turn");
  }
  // 2. real UI proof by about 40%, and the core job shown once
  const isUi = (r, i) => (Number(sc[i] && sc[i].ui_scale) >= CL.ui_min_scale) || r.scene_type === "ui-proof" || r.scene_type === "ui-collage";
  const uiI = rows.findIndex(isUi);
  if (uiI < 0) w("ui-proof-missing", "no beat shows UI proof (ui_scale of 35 or more, or a ui-proof or ui-collage scene)", "recreate the product's real UI in a capability beat, by about 40% of the film");
  else if (total && starts[uiI] / total > CL.ui_by + 0.05) w("ui-proof-late", `the first UI proof lands at ${Math.round((100 * starts[uiI]) / total)}% of the film (${Math.round(CL.ui_by * 100)}% at the latest): the viewer sees the product too late`, "bring the first capability beat forward, or shorten the hook and the meet");
  if (rows.length >= 4 && !sc.some((s) => truthy(s && s.core_job_demo))) w("core-job-missing", "no beat sets core_job_demo: true: nothing shows the core job being done", "mark the capability beat in which the viewer sees the product's main job done on real UI, not a decoration");
  else { const bad = sc.map((s, i) => (truthy(s && s.core_job_demo) && !isUi(rows[i], i) ? rows[i].id : null)).filter(Boolean); if (bad.length) w("core-job-no-ui", `core_job_demo is set on beat(s) ${bad.join(", ")} that show no UI (ui_scale under ${CL.ui_min_scale}, not a ui scene)`, "show the job on the UI mockup itself"); }
  // 3. one message
  if (!S(plan && plan.one_message)) w("one-message-missing", "no one_message on the score: the film's single sentence is not declared", "add score.one_message (one sentence) and make every beat serve it");
  // 4. the CTA
  const cta = plan && plan.cta && typeof plan.cta === "object" ? plan.cta : plan && S(plan.cta) ? { text: S(plan.cta) } : null;
  if (!cta || !S(cta.text)) w("cta-missing", "no cta: {text, hold_s} on the score: the last beat needs a call to action (a verb plus a destination)", "add score.cta with text such as \"Download for macOS\" and hold_s of 2 or more");
  else { for (const p of ctaProblems(cta)) w("cta-weak", p, "write the CTA as a verb plus a destination and hold it for 2 s or more"); if (cta.hold_s == null) w("cta-hold-missing", "cta.hold_s is not set: the hold cannot be checked", "set cta.hold_s (2 s or more)"); }
  // 5. buzzwords on the score's copy
  const copy = rows.map((r) => ({ id: r.id, text: r.line })).concat(cta && S(cta.text) ? [{ id: "cta", text: S(cta.text) }] : []).concat(S(plan && plan.one_message) ? [{ id: "one_message", text: S(plan.one_message) }] : []);
  const hits = copy.map((c) => ({ id: c.id, h: buzzwordHits(c.text) })).filter((x) => x.h.length);
  if (hits.length) w("copy-buzzword", buzzwordMessage(`beat(s) ${hits.slice(0, 5).map((x) => x.id).join(", ")}`, [...new Set(hits.flatMap((x) => x.h))]), BUZZWORD_FIX);
  return F;
}

// Motion purpose checks (all warnings): claim-to-proof map, peak-end craft, distinct reveal and CTA, mood follows story, one hero per beat, motion personality,
// a purpose per move, exits quicker than entrances. Rules: references/launch-grammar.md sections 15 and 14 (proof), references/craft.md "Purpose, hero and exits"; fields: references/score.md "Motion purpose".
export const MOODS = ["problem", "turn", "solution", "climax", "cta"];
export const PURPOSES = ["hierarchy", "state", "relationship", "feedback", "continuity", "emotion"];
export const MOTION_DIRECTIONS = ["forward", "upward", "inward", "outward"];
export const MOTION_PHYSICS = ["soft", "crisp", "heavy", "weightless", "elastic"];
export const EXIT_RATIO = { aim: [0.6, 0.8] };
const idList = (v) => (Array.isArray(v) ? v : v == null || v === "" ? [] : String(v).split(/[,\s]+/)).map((x) => String(x && typeof x === "object" ? x.id || x.claim || "" : x).trim()).filter(Boolean);
const lc = (v) => String(v == null ? "" : typeof v === "object" ? v.what || v.id || v.name || "" : v).trim().toLowerCase();
export function purposeFindings(plan, rows, see = "references/launch-grammar.md") {
  const F = [], sc = plan && Array.isArray(plan.scenes) ? plan.scenes : plan && Array.isArray(plan.beats) ? plan.beats : [];
  const w = (check, message, fix, ref = see) => F.push({ severity: "warning", check, message, fix: `${fix}; ${ref}`, basis: "score" });
  const idx = (pred) => rows.findIndex(pred);
  // 1. claim to proof: every claim the copy uses is proven by a beat (`proves: [claim ids]`)
  { const abstractProof = sc.map((s, i) => (s && s.proves != null && idList(s.proves).length && lc(s.ui_mode) === "abstract" ? rows[i].id : null)).filter(Boolean);
    if (abstractProof.length) w("proof-abstract", `beat(s) ${abstractProof.join(", ")} set proves but are ui_mode: abstract: an abstract shot never counts as proof`, "show the claim on a literal UI beat (real labels, real state), and keep the abstract shot for the sensation", `${see} section 14`);
    const proven = new Set(sc.filter((s) => lc(s && s.ui_mode) !== "abstract").flatMap((s) => idList(s && s.proves))), used = new Set([...idList(plan && plan.claims_used), ...sc.flatMap((s) => idList(s && s.claims))]);
    if (!sc.some((s) => s && s.proves != null)) w("proof-map-missing", "no beat declares proves: [claim ids]: the claim-to-proof map cannot be checked", "name on each proof beat the claim ids (research/claims.json) its picture proves (UI, before/after, a demo, a number on screen)", `${see} section 14`);
    else { const loose = [...used].filter((c) => !proven.has(c)); if (loose.length) w("claim-unproven", `claim(s) ${loose.slice(0, 6).join(", ")} appear in the copy and no beat proves them (proves)`, "give each claim a beat that shows it (UI proof, before/after, a demo, a number on screen), or cut the claim from the copy", `${see} section 14`); } }
  // 2. peak-end craft budget: a named peak, and catalogue moves on the hook, the peak and the end
  { const peakRaw = plan && plan.peak != null ? plan.peak : null, key = peakRaw && typeof peakRaw === "object" ? peakRaw.beat || peakRaw.id : peakRaw;
    let pi = key != null && String(key).trim() !== "" ? idx((r) => String(r.id).toLowerCase() === String(key).toLowerCase()) : -1;
    if (pi < 0 && key != null && /^\d+$/.test(String(key).trim())) pi = Number(key) - 1 < rows.length ? Number(key) - 1 : -1;
    if (pi < 0) pi = sc.findIndex((s) => s && truthy(s.peak));
    if (pi < 0) w("peak-missing", "the score names no peak beat (score.peak: the beat id of the signature moment)", "name the beat that carries the film's signature moment; the hook, the peak and the end get the richest moves", `${see} section 1`);
    const hi = Math.max(0, idx((r) => r.role === "hook")), ei = rows.length - 1;
    const bare = [["hook", hi], ["peak", pi], ["end", ei]].filter(([, i]) => i >= 0 && !moveNamesOf(sc[i]).length);
    if (rows.length >= 4 && bare.length) w("peak-end-moves", `the ${bare.map(([n, i]) => `${n} (beat ${rows[i].id})`).join(", ")} name no catalogue move (moves_named): the first 3 s, the peak and the end are where the craft goes`, `give those beats a move from launch-moves.md and the richest layering of the film`, `${see} section 1`); }
  // 3. distinct reveal and CTA: a treatment found nowhere else (a colour, scale, motion or sound)
  { const meetI = idx((r) => r.role === "meet"), ctaI = rows.length - 1, dv = (i) => (i >= 0 ? lc(sc[i] && sc[i].distinct) : "");
    for (const [name, i] of [["meet", meetI], ["cta", ctaI]]) {
      if (i < 0) continue;
      if (!dv(i)) w("distinct-missing", `the ${name} beat (${rows[i].id}) declares no distinct: {what} (a colour, scale, motion or sound used nowhere else in the film)`, "give it one treatment no other beat uses, so the viewer's eye lands there", `${see} section 15`);
      else { const dup = rows.map((r, j) => j).filter((j) => j !== i && dv(j) === dv(i)); if (dup.length) w("distinct-repeat", `the ${name} beat's distinct "${dv(i)}" is also on beat(s) ${dup.map((j) => rows[j].id).join(", ")}: a treatment used twice stops being distinct`, "choose a colour, scale, motion or sound the rest of the film leaves alone", `${see} section 15`); } } }
  // 4. mood follows story: problem beats muted and tight, solution beats bright and open, the CTA calm
  { const mood = (i) => lc(sc[i] && sc[i].mood), missing = rows.map((r, i) => (MOODS.includes(mood(i)) ? null : r.id)).filter(Boolean);
    if (missing.length) w("mood-missing", `beat(s) ${missing.slice(0, 8).join(", ")} declare no mood (${MOODS.join(" | ")})`, "tag each beat with the story's mood so the ground, light and motion can follow it", `${see} section 15`);
    const sig = (i) => `${lc(sc[i] && sc[i].ground)}|${lc(sc[i] && sc[i].light)}`, set = (m) => new Set(rows.map((r, i) => (mood(i) === m ? sig(i) : null)).filter((s) => s && s !== "|"));
    const pr = set("problem"), so = set("solution");
    if (pr.size && so.size && pr.size === so.size && [...pr].every((s) => so.has(s))) w("mood-flat", `problem and solution beats declare the same ground and light (${[...pr].join(", ")}): the turn changes nothing you can see`, "mute the problem beats (darker or greyer ground, tighter framing, constrained motion) and open the solution beats (brighter, wider, confident motion)", `${see} section 15`); }
  // 6. one hero per beat
  { const noHero = sc.map((s, i) => (lc(s && s.hero) ? null : rows[i].id)).filter(Boolean);
    if (noHero.length) w("hero-missing", `beat(s) ${noHero.slice(0, 8).join(", ")} name no hero (the element that carries the beat's main motion)`, "name one hero per beat; everything else moves less, and the ambient layer drifts at 20 to 30 percent of the hero's speed", "references/craft.md \"Purpose, hero and exits\""); }
  // 7. motion personality
  { const ml = plan && plan.motion_language, d = lc(ml && ml.direction), p = lc(ml && ml.physics);
    if (!ml || typeof ml !== "object" || !d || !p) w("motion-language-missing", "the score declares no motion_language: {direction, physics} next to signature_ease", `declare motion_language: direction ${MOTION_DIRECTIONS.join(" | ")}, physics ${MOTION_PHYSICS.join(" | ")}; the whole film follows it`, `${see} section 9`);
    else { if (!MOTION_DIRECTIONS.includes(d)) w("motion-language-unknown", `motion_language.direction "${d}" is not one of ${MOTION_DIRECTIONS.join(", ")}`, "pick one", `${see} section 9`); if (!MOTION_PHYSICS.includes(p)) w("motion-language-unknown", `motion_language.physics "${p}" is not one of ${MOTION_PHYSICS.join(", ")}`, "pick one", `${see} section 9`); } }
  // 8. every tween has a purpose; 5. exits are quicker than their entrances
  { const B = beatMoves(plan), all = B.flatMap((b) => b.moves.map((m) => ({ ...m, _beat: b.id }))), craft = "references/craft.md \"Purpose, hero and exits\"";
    if (all.length) {
      const none = all.filter((m) => !lc(m.purpose));
      if (none.length) w("move-purpose-missing", `${none.length} of ${all.length} move record(s) have no purpose (beats ${[...new Set(none.map((m) => m._beat))].slice(0, 6).join(", ")}): a move with no job is decoration`, `give each move purpose: ${PURPOSES.join(" | ")}, or cut it`, craft);
      const bad = all.filter((m) => lc(m.purpose) && !PURPOSES.includes(lc(m.purpose)));
      if (bad.length) w("move-purpose-unknown", `purpose "${lc(bad[0].purpose)}" on beat ${bad[0]._beat} is not one of ${PURPOSES.join(", ")}`, "use one of the six", craft);
      const dur = (m) => Number(m.dur), isExit = (m) => !!m.exit || /exit|leave|out/i.test(String(m.kind || "")), isEnter = (m) => !!m.entrance || (/enter|in\b/i.test(String(m.kind || "")) && !isExit(m));
      const slow = [];
      for (const x of all.filter((m) => isExit(m) && dur(m) > 0 && m.target)) { const en = all.find((m) => isEnter(m) && String(m.target) === String(x.target) && dur(m) > 0); if (en && dur(x) > dur(en) + 1e-9) slow.push(`${x.target} (exit ${dur(x)} s, entrance ${dur(en)} s)`); }
      if (slow.length) w("exit-longer", `${slow.length} exit(s) run longer than their entrance: ${slow.slice(0, 4).join(", ")}; exits take ${Math.round(EXIT_RATIO.aim[0] * 100)} to ${Math.round(EXIT_RATIO.aim[1] * 100)}% of the entrance`, "shorten each exit to about 60 to 80 percent of its entrance", craft);
    } }
  return F;
}

// Professional craft research checks (all warnings; .context/motion-craft-research.md Top 15 and AI tells). Rules: references/launch-grammar.md sections 16 and 17, references/craft.md "Craft research",
// references/launch-moves.md "AI cliches"; fields: references/score.md "Craft research fields". Reads only the score; the render-side twin of the readable-exposure budget is lib/readable-exposure.mjs.
export const UI_MODES = ["literal", "abstract"];
export const INTENSITY_AXES = ["cut_rate", "movement", "proximity", "camera"];
export const LEVELS = { low: 0, med: 1, medium: 1, high: 2 };
export const LEADS = ["vo", "music", "sound", "picture"];
export const TYPE_UNITS = ["letter", "word", "line", "block"];
export const MOTIF_SOURCES = ["brand-element", "product-verb", "customer-material"];
export const SFX_ROLES = ["signature", "support", "none"];
export const ENDING_MUSIC = ["resolve", "ringout", "sting", "hard-stop", "none"];
const FUNCTION_WORD = /^(a|an|the|of|to|in|on|at|for|and|or|with|from|by|but|your|my|our|is|are)$/i;
const sortKeys = (v) => (Array.isArray(v) ? v.map(sortKeys) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v);
const parsePersist = (p) => { if (typeof p === "string") { const m = p.split(/→|->|=>/); return { element: m[0].trim(), dest: (m[1] || "").trim() }; } return p && typeof p === "object" ? { element: S(p.element || p.what || p.id), dest: S(p.to || p.dest || p.role || p.destination) } : { element: "", dest: "" }; };
// the steepness of a curve: the share of the duration between 10% and 90% of its travel (expo.out reaches 90% at about 0.33; a symmetric expo in-out packs all its travel into a narrow middle)
const bezierT = (str, q) => { const m = String(str).match(/cubic-bezier\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/i); if (!m) return null; const [x1, y1, x2, y2] = m.slice(1).map(Number), bz = (a2, b2, t) => 3 * (1 - t) * (1 - t) * t * a2 + 3 * (1 - t) * t * t * b2 + t ** 3; for (let t = 0; t <= 1; t += 0.005) if (bz(y1, y2, t) >= q) return bz(x1, x2, t); return 1; };
export const easeExtreme = (ease, dur) => { const e = String(ease == null ? "" : ease).replace(/^rasan:/i, "").toLowerCase(); if (!e) return false; if (/(expo|circ|quint|power4|power5)\.?in-?out/.test(e)) return true; const t90 = bezierT(e, 0.9), t10 = bezierT(e, 0.1); if (t90 != null) return t90 < 0.2 || t90 - t10 < 0.25 || (t90 < 0.3 && Number(dur) > 0 && Number(dur) < 0.25); return false; };

export function craftResearchFindings(plan, rows) {
  const F = [], sc = plan && Array.isArray(plan.scenes) ? plan.scenes : plan && Array.isArray(plan.beats) ? plan.beats : [];
  const w = (check, message, fix, ref = "references/score.md \"Craft research fields\"") => F.push({ severity: "warning", check, message, fix: `${fix}; ${ref}`, basis: "score" });
  const ids = (a) => a.map((x) => x.id).slice(0, 8).join(", ");
  const B = sc.map((s, i) => ({ s: s || {}, r: rows[i], i, id: rows[i].id }));
  if (rows.length < 4) return F;
  // 3. product-state truth: literal UI for proof, abstract UI for sensation; one state id shows one set of labels; every action is followed by its result
  { const isUi = (x) => x.s.ui_state || x.s.ui_mode || x.r.scene_type === "ui-proof" || x.r.scene_type === "ui-collage" || Number(x.s.ui_scale) >= CL.ui_min_scale, ui = B.filter(isUi);
    const noMode = ui.filter((x) => !x.s.ui_mode), badMode = ui.filter((x) => x.s.ui_mode && !UI_MODES.includes(lc(x.s.ui_mode)));
    if (noMode.length) w("ui-mode-missing", `UI beat(s) ${ids(noMode)} do not say ui_mode: literal | abstract`, "mark each UI beat literal (real labels and states, usable as proof) or abstract (a sensation, never counted as proof)", "references/launch-grammar.md section 17");
    if (badMode.length) w("ui-mode-unknown", `ui_mode "${lc(badMode[0].s.ui_mode)}" on beat ${badMode[0].id} is not one of ${UI_MODES.join(", ")}`, "pick one", "references/launch-grammar.md section 17");
    const lit = ui.filter((x) => lc(x.s.ui_mode) !== "abstract" && !x.s.ui_state);
    if (ui.length && lit.length && ui.some((x) => x.s.ui_state)) w("ui-state-missing", `literal UI beat(s) ${ids(lit)} declare no ui_state {id, labels, figures, action, result}`, "record the labels, figures, action and result each UI beat shows, so the states can be checked across shots", "references/launch-grammar.md section 17");
    const byId = new Map(); const bad = [];
    for (const x of B) { const st = x.s.ui_state; if (!st || typeof st !== "object") continue; const id = S(st.id); if (!id) { bad.push(x); continue; }
      const key = JSON.stringify(sortKeys({ labels: st.labels || null, figures: st.figures || null })), prev = byId.get(id);
      if (prev && prev.key !== key) w("ui-state-drift", `UI state "${id}" shows different labels or figures in beat ${prev.beat} and beat ${x.id}`, "give a changed UI its own state id, or make the labels and figures identical: the same state must read the same in every shot", "references/launch-grammar.md section 17");
      else if (!prev) byId.set(id, { key, beat: x.id }); }
    if (bad.length) w("ui-state-id-missing", `ui_state on beat(s) ${ids(bad)} has no id`, "name the state so repeats can be compared", "references/launch-grammar.md section 17");
    const noRes = B.filter((x) => x.s.ui_state && S(x.s.ui_state.action) && !S(x.s.ui_state.result)), order = B.filter((x) => x.s.ui_state && Number.isFinite(Number(x.s.ui_state.action_at)) && Number.isFinite(Number(x.s.ui_state.result_at)) && Number(x.s.ui_state.result_at) < Number(x.s.ui_state.action_at));
    if (noRes.length) w("ui-action-no-result", `beat(s) ${ids(noRes)} show a UI action with no result in ui_state.result`, "show the result the action causes, in order, in the same beat or the next: a click with no outcome is not a demonstration", "references/launch-grammar.md section 17");
    if (order.length) w("ui-result-before-action", `beat(s) ${ids(order)} place the result before the action (result_at < action_at)`, "put the result after the action it follows", "references/launch-grammar.md section 17"); }
  // 4. motion plan across boundaries: objects carry a role and a destination across shots
  { const withP = B.filter((x) => x.s.persists != null), noDest = []; let last = null;
    for (const x of withP) { const list = Array.isArray(x.s.persists) ? x.s.persists : [x.s.persists]; for (const p of list) { const q = parsePersist(p); if (!q.element || !q.dest) noDest.push(x); } if (x.i === rows.length - 1) last = x; }
    if (noDest.length) w("persists-no-destination", `persists on beat(s) ${ids(noDest)} names an element with no destination (element → next beat role)`, "write each as \"element → role in the next beat\" (the pill → the card's header)", "references/motion-handoffs.md");
    if (last) w("persists-last-beat", `beat ${last.id} is the last beat and still lists persists: nothing follows it`, "end the film on a settled frame; persists belongs on beats that have a next beat", "references/motion-handoffs.md");
    const carried = B.some((x) => x.s.handoff || x.s.persists != null || carrierOn(x.s.carrier_state));
    if (rows.length >= 6 && !carried) w("boundary-reset", "no beat carries an object across a boundary (persists, handoff or carrier_state): every shot starts from a clean scene", "plan at least a few objects that keep a role and a destination across the cut (a pill that becomes the next card, type that persists over cuts)", "references/motion-handoffs.md"); }
  // 5. hard-cut candidate: each designed transition says what it conveys that a cut would lose
  { const designed = B.slice(1).filter((x) => x.r.transition != null && !isPlainCut(x.r.transition) && transitionFamily(x.r.transition) !== "hard-cut");
    const reason = (x) => S(x.s.bridge_reason || x.s.transition_reason), none = designed.filter((x) => !reason(x)), weak = designed.filter((x) => reason(x) && (reason(x).length < 12 || /^(looks?|smooth|nice|cool|flow|transition|fancy|pretty)\b/i.test(reason(x)))), cut = designed.filter((x) => /^(nothing|none|n\/a|no reason)/i.test(reason(x)));
    if (none.length) w("bridge-reason-missing", `designed transition(s) into beat(s) ${ids(none)} give no bridge_reason`, "write what the bridge conveys that a hard cut would lose (a shared object, a continued motion, a spatial move); with no answer, use a cut", "references/launch-grammar.md section 6");
    if (weak.length) w("bridge-reason-weak", `bridge_reason on beat(s) ${ids(weak)} is a taste word, not a relationship`, "name the relationship the bridge shows (the same pill becomes the card), or replace the bridge with a hard cut", "references/launch-grammar.md section 6");
    if (cut.length) w("bridge-hard-cut-candidate", `the bridge into beat(s) ${ids(cut)} conveys nothing a cut would lose`, "replace it with a hard cut", "references/launch-grammar.md section 6"); }
  // 6. meaning to motion for hero type
  { const hero = B.filter((x) => Number(x.s.hero_scale) >= 9), tm = (x) => (x.s.type_motion && typeof x.s.type_motion === "object" ? x.s.type_motion : null);
    const miss = hero.filter((x) => { const t = tm(x); return !t || !S(t.unit) || !S(t.behaviour || t.behavior) || !S(t.meaning); }), unit = hero.filter((x) => tm(x) && S(tm(x).unit) && !TYPE_UNITS.includes(lc(tm(x).unit)));
    if (miss.length) w("type-motion-missing", `hero line(s) in beat(s) ${ids(miss)} declare no type_motion {unit, behaviour, meaning}`, `choose the animation unit (${TYPE_UNITS.join(" | ")}) and the behaviour from what the word means (a word that splits breaks apart, a word about speed travels)`, "references/craft.md \"Craft research\"");
    if (unit.length) w("type-motion-unit", `type_motion.unit "${lc(tm(unit[0]).unit)}" on beat ${unit[0].id} is not one of ${TYPE_UNITS.join(", ")}`, "pick one", "references/craft.md \"Craft research\"");
    const n = {}; hero.forEach((x) => { const t = tm(x); if (t && S(t.unit) && S(t.behaviour || t.behavior)) { const k = `${lc(t.unit)}|${lc(t.behaviour || t.behavior)}`; (n[k] ||= []).push(x.id); } });
    for (const [k, v] of Object.entries(n)) if (v.length >= 3) w("type-motion-same", `${v.length} hero lines (beats ${v.slice(0, 6).join(", ")}) share one unit and behaviour (${k.replace("|", ", ")}): an unchanged preset across unlike words and layouts`, "derive the unit and behaviour from each word's meaning and layout", "references/craft.md \"Craft research\""); }
  // 7. intensity map: cut rate, movement, proximity and camera as separate levels, each major change explained
  { const iv = (x) => (x.s.intensity && typeof x.s.intensity === "object" ? x.s.intensity : null), have = B.filter((x) => iv(x));
    if (have.length < Math.ceil(rows.length / 2)) w("intensity-missing", "beats do not declare an intensity {cut_rate, movement, proximity, camera} (low | med | high)", "map the four axes per beat; the pacing is more than the cut rate", "references/launch-grammar.md section 17");
    else {
      const lv = (x, a) => { const v = LEVELS[lc(iv(x) && iv(x)[a])]; return v == null ? null : v; };
      const unk = have.filter((x) => INTENSITY_AXES.some((a) => iv(x)[a] != null && lv(x, a) == null));
      if (unk.length) w("intensity-unknown", `intensity on beat(s) ${ids(unk)} has a level that is not low, med or high`, "use low | med | high on each axis", "references/launch-grammar.md section 17");
      const jumps = []; for (let k = 1; k < have.length; k++) { const a = have[k - 1], b = have[k]; for (const ax of INTENSITY_AXES) { const p = lv(a, ax), q = lv(b, ax); if (p != null && q != null && Math.abs(q - p) >= 2 && !S(iv(b).why || b.s.intensity_why)) { jumps.push(`${b.id} ${ax}`); } } }
      if (jumps.length) w("intensity-change-unexplained", `major intensity change(s) with no why (${jumps.slice(0, 5).join(", ")}): an axis jumps low to high or back`, "add intensity.why on the beat that changes (the drop, the reveal, the breath): each major change has a reason", "references/launch-grammar.md section 17");
      const sig = have.map((x) => INTENSITY_AXES.map((a) => lv(x, a)).join(","));
      if (have.length >= 4 && new Set(sig).size === 1) w("intensity-flat", `the intensity map is the same on every beat (${sig[0]}): nothing speeds up, closes in or calms down`, "alternate on purpose, or explain a deliberately relentless film", "references/launch-grammar.md section 17"); } }
  // 8. music phrase and lead-role map
  { const lead = (x) => lc(x.s.lead), have = B.filter((x) => lead(x));
    if (have.length < Math.ceil(rows.length / 2)) w("lead-missing", "beats do not say what leads (lead: vo | music | sound | picture)", "mark which medium leads each passage, with sections aligned to musical phrases", "references/sound.md \"Phrase and lead\"");
    else {
      const unk = have.filter((x) => !LEADS.includes(lead(x))); if (unk.length) w("lead-unknown", `lead "${lead(unk[0])}" on beat ${unk[0].id} is not one of ${LEADS.join(", ")}`, "pick one", "references/sound.md \"Phrase and lead\"");
      if (!have.some((x) => lead(x) === "music" || lead(x) === "sound")) w("music-wallpaper", "music and sound never lead a passage: the score is wallpaper under the picture and the voice", "give the music or a sound the lead in at least one passage (a phrase that lands after the key line)", "references/sound.md \"Phrase and lead\"");
      const nophr = have.filter((x) => lead(x) === "music" && !S(x.s.phrase)); if (nophr.length) w("lead-phrase-missing", `music-led beat(s) ${ids(nophr)} name no phrase`, "write phrase: the musical phrase the section follows (bars 9 to 12), and cut on its edges", "references/sound.md \"Phrase and lead\"");
      const cp = have.filter((x) => (x.s.counterpoint === true || /counterpoint/.test(String(x.s.counterpoint))) && !S(x.s.counterpoint_why || x.s.why)); if (cp.length) w("counterpoint-why", `counterpoint on beat(s) ${ids(cp)} has no why`, "say what the contrast means (calm music under a frantic picture), or drop it", "references/sound.md \"Phrase and lead\""); } }
  // 9. brand-derived motifs and product metaphors
  { const motifs = [...(Array.isArray(plan.motifs) ? plan.motifs : []), ...(plan.carrier && typeof plan.carrier === "object" && S(plan.carrier.what || plan.carrier.name) ? [{ what: plan.carrier.what || plan.carrier.name, source: plan.carrier.source || plan.carrier.motif_source, ref: plan.carrier.ref }] : [])];
    const bad = motifs.filter((m) => m && typeof m === "object" && !MOTIF_SOURCES.includes(lc(m.source || m.motif_source)));
    if (bad.length) w("motif-source-missing", `motif(s) ${bad.slice(0, 4).map((m) => S(m.what || m.name) || "?").join(", ")} name no motif_source (${MOTIF_SOURCES.join(" | ")})`, "say where each major motif comes from: a brand element, a product verb or the customer's material; a motif from none of them could advertise any product", "references/launch-grammar.md section 18");
    const beatBad = B.filter((x) => x.s.motif && !MOTIF_SOURCES.includes(lc(x.s.motif_source))); if (beatBad.length) w("motif-source-missing", `beat(s) ${ids(beatBad)} name a motif with no motif_source`, "name its provenance", "references/launch-grammar.md section 18"); }
  // AI tells: cumulative progression, a repeated entrance/exit pattern, extreme easing, careless breaks in large type, 10 s with no new information
  { const set = B.flatMap((x) => idList(x.s.set_up).map((k) => ({ k, id: x.id, i: x.i }))), pay = B.flatMap((x) => idList(x.s.pays_off).map((k) => ({ k, id: x.id, i: x.i })));
    if (rows.length >= 6 && !set.length && !pay.length) w("progression-missing", "no beat declares set_up or pays_off: nothing links the middle to the end (a beautiful middle with no cumulative progression)", "name what each beat sets up and which later beat pays it off; the last third should pay off something the first two thirds built", "references/launch-moves.md \"AI cliches\"");
    else { const dangling = set.filter((s2) => !pay.some((p) => p.k === s2.k && p.i > s2.i)), orphan = pay.filter((p) => !set.some((s2) => s2.k === p.k && s2.i < p.i));
      if (dangling.length) w("set-up-dangling", `set_up ${dangling.slice(0, 4).map((d) => `"${d.k}" (beat ${d.id})`).join(", ")} is never paid off by a later beat`, "pay it off with pays_off on a later beat, or drop the set-up", "references/launch-moves.md \"AI cliches\"");
      if (orphan.length) w("pays-off-orphan", `pays_off ${orphan.slice(0, 4).map((d) => `"${d.k}" (beat ${d.id})`).join(", ")} has no earlier set_up`, "add the set_up on the beat that plants it", "references/launch-moves.md \"AI cliches\"");
      if (set.length && !pay.some((p) => p.i >= Math.floor(rows.length * 0.6))) w("payoff-late-missing", "no pays_off lands in the last third: the film builds and never cashes in", "land a payoff in the last beats", "references/launch-moves.md \"AI cliches\""); }
    const pat = B.map((x, i) => { const recs = Array.isArray(x.s.moves) ? x.s.moves.filter((m) => m && typeof m === "object") : [], en = lc(x.s.entrance || (recs.find((m) => m.entrance) || {}).entrance), ex = lc(x.s.exit || (recs.find((m) => m.exit && typeof m.exit === "string") || {}).exit || (rows[i + 1] ? transitionFamily(rows[i + 1].transition) : "")); return en || ex ? `${en}>${ex}` : null; }).filter(Boolean);
    if (pat.length >= 5) { const n = {}; pat.forEach((p) => { n[p] = (n[p] || 0) + 1; }); const [top, c] = Object.entries(n).sort((a, b) => b[1] - a[1])[0]; if (c / pat.length >= 0.7) w("same-entrance-exit", `${c} of ${pat.length} beats share one entrance and exit pattern (${top.replace(">", " then ")}): every shot is enter, wait, exit`, "plan a sequence of actions, carried states and purposeful cuts; vary how beats arrive and leave", "references/launch-moves.md \"AI cliches\""); }
    const moves = B.flatMap((x) => (Array.isArray(x.s.moves) ? x.s.moves.filter((m) => m && typeof m === "object").map((m) => ({ ...m, _b: x.id })) : [])), sigE = String(plan.signature_ease || (plan.motion && plan.motion.signature_ease) || "").replace(/^rasan:/i, "").toLowerCase().trim(), ex = moves.filter((m) => m.ease && !(sigE && String(m.ease).replace(/^rasan:/i, "").toLowerCase().trim() === sigE) && easeExtreme(m.ease, m.dur));
    if (ex.length) w("easing-extreme", `${ex.length} move(s) use an ease so steep the action cannot be read (beats ${[...new Set(ex.map((m) => m._b))].slice(0, 6).join(", ")}: ${[...new Set(ex.map((m) => m.ease))].slice(0, 3).join(", ")})`, "soften the curve or give the action more time: the viewer must see what moved and where it landed", "references/launch-moves.md \"AI cliches\"");
    const br = B.flatMap((x) => (Array.isArray(x.s.line_breaks) ? [{ x, br: x.s.line_breaks.map(S) }] : [])).map(({ x, br: b }) => ({ x, hit: b.slice(0, -1).filter((t) => FUNCTION_WORD.test((t.split(/\s+/).pop() || ""))).concat(b.slice(1).filter((t) => t && t.split(/\s+/).length === 1 && FUNCTION_WORD.test(t))) })).filter((o) => o.hit.length);
    if (br.length) w("type-break", `large type breaks after or apart from a function word in beat(s) ${br.map((o) => o.x.id).slice(0, 6).join(", ")} ("${br[0].hit[0]}")`, "break at grammatical units (keep the article with its noun, the preposition with its phrase): art-direct the actual words", "references/craft.md \"Craft research\"");
    const info = B.filter((x) => S(x.s.new_info));
    if (info.length >= Math.ceil(rows.length / 2)) { let t = 0; const st = rows.map((r) => { const s0 = t; t += r.dur > 0 ? r.dur : 0; return s0; }); const ends = rows.map((r, i) => st[i] + (r.dur > 0 ? r.dur : 0)); let worst = 0, at = 0, lastT = 0;
      const marks = [0, ...B.map((x, i) => (S(x.s.new_info) ? st[i] : null)).filter((v) => v != null), ends[ends.length - 1] || 0]; for (let k = 1; k < marks.length; k++) if (marks[k] - marks[k - 1] > worst) { worst = marks[k] - marks[k - 1]; at = marks[k - 1]; lastT = marks[k]; }
      if (worst >= 10) w("no-new-info", `${Math.round(worst)} s from ${Math.round(at)} s to ${Math.round(lastT)} s carry no new information (no beat sets new_info)`, "trim the stretch, or make it a legible demonstration with a new fact, state or result", "references/launch-moves.md \"AI cliches\""); } }
  // 11. a deterministic cursor track: its own path data, jitter-free, framing follows the result
  { const cur = B.filter((x) => x.s.cursor === true || (x.s.cursor && typeof x.s.cursor === "object") || S(x.s.cursor_reason));
    const noTrack = cur.filter((x) => !(x.s.cursor_track && typeof x.s.cursor_track === "object" && S(x.s.cursor_track.source || x.s.cursor_track.file))), click = cur.filter((x) => x.s.cursor_track && /click/.test(lc(x.s.cursor_track.frames_on || x.s.cursor_track.framing))), baked = cur.filter((x) => x.s.cursor_track && /baked|capture|recorded/.test(lc(x.s.cursor_track.source)));
    if (noTrack.length) w("cursor-track-missing", `the cursor in beat(s) ${ids(noTrack)} has no cursor_track {source, frames_on}`, "keep the pointer path as its own data (a separate, jitter-free track), not baked into a capture", "references/craft.md \"Craft research\"");
    if (click.length) w("cursor-framing-click", `the camera frames the click, not the result, in beat(s) ${ids(click)}`, "frame what the action changes (frames_on: result)", "references/craft.md \"Craft research\"");
    if (baked.length) w("cursor-baked", `the cursor in beat(s) ${ids(baked)} is baked into a capture`, "draw the cursor from its own track so travel, size and visibility can be edited", "references/craft.md \"Craft research\""); }
  // 12. selective sound hierarchy
  { const role = (x) => lc(x.s.sfx_role), have = B.filter((x) => role(x));
    if (have.length >= Math.ceil(rows.length / 2)) {
      const sig = have.filter((x) => role(x) === "signature").length;
      if (!sig) w("sound-anchor-missing", "no beat has a signature sound (sfx_role: signature): nothing in the mix leads", "give the few important actions a signature sound and let the rest stay abstract", "references/sound.md \"Selective sound hierarchy\"");
      else if (sig / have.length > 0.4) w("sound-hierarchy-flat", `${sig} of ${have.length} beats carry a signature sound: equal prominence everywhere is no hierarchy`, "keep signature sounds for the important actions and leave room for the score", "references/sound.md \"Selective sound hierarchy\""); } }
  // 13. blur: velocity-linked temporal blur or a brief smear, never a constant CSS blur on moving type or UI
  { const moves = B.flatMap((x) => (Array.isArray(x.s.moves) ? x.s.moves.filter((m) => m && typeof m === "object").map((m) => ({ ...m, _b: x.id })) : [])), css = moves.filter((m) => /^css/.test(lc(m.blur_kind || m.blur)) && Number(m.travel_px) > 0);
    if (css.length) w("blur-css-motion", `a constant CSS blur is the only motion blur on moving element(s) in beat(s) ${[...new Set(css.map((m) => m._b))].slice(0, 6).join(", ")}`, "link the blur to velocity (RasanTexture.motionBlur: zero at rest, directional, about a half-frame shutter) or use a 1 to 2 frame smear; check the edges for fog and ghost copies", "references/craft.md \"Craft research\""); }
  // 14. a resolved ending: picture and music resolve together on a settled frame
  { const en = plan.ending && typeof plan.ending === "object" ? plan.ending : null, cta = plan.cta && typeof plan.cta === "object" ? plan.cta : null;
    if (!en) w("ending-missing", "the score declares no ending {music, settled_s}: picture and music should resolve together", "name how the music ends (resolve | ringout | sting | hard-stop) and the settled end frame (2 to 4 s)", "references/launch-grammar.md section 17");
    else { const m = lc(en.music); if (!ENDING_MUSIC.includes(m)) w("ending-music-unknown", `ending.music "${m}" is not one of ${ENDING_MUSIC.join(", ")}`, "pick one", "references/launch-grammar.md section 17");
      if (m === "none" && !S(en.why)) w("ending-unresolved", "the music has no deliberate endpoint (ending.music: none) and gives no why", "end on a musical resolution, or say why an unresolved ending serves the film", "references/launch-grammar.md section 17");
      const settled = Number(en.settled_s != null ? en.settled_s : cta && cta.hold_s), multi = (cta && (S(cta.url) || Number(cta.count) > 1 || /\.[a-z]{2,}\b|https?:|www\./i.test(S(cta.text)))) ? 3 : 2;
      if (Number.isFinite(settled) && settled < multi) w("end-frame-short", `the settled end frame is ${settled} s (${multi} to 4 s is the starting value${multi === 3 ? ", more for a URL or several calls to action" : ""})`, "hold the end frame long enough to read the name, the action and any URL", "references/launch-grammar.md section 17"); } }
  return F;
}
