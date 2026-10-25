// Editorial intelligence for the Storyboard (Plan 05 E4, E6): what each beat adds, what to notice, whether it can be read, what each cut means,
// and what a viewer's "this is hard to understand" note really asks for. Pure data and heuristics; nothing here writes a file.
//
// What is NOT here, on purpose (RULE_MIGRATION_MAP.md "Plan 05"): one idea every N seconds, a peak at a universal percentage, identical shot
// lengths, an effect at every seam, constant camera movement. Pauses, restraint and long holds are first-class. A style that really wants one of
// those rhythms declares it with evidence in `styleOptions` (optionalRhythmChecks), and then it is a style check, never a hard gate.
//
//   CUT_RELATIONS / HARD_CUT_KINDS / readingTime(o) / checkReading(shot, copy, o)
//   evaluateBeat(shot, ctx) / evaluateSeam(seam, a, b, ctx) / evaluateFilm(shots, ctx)  -> { findings:[{id, severity, route, ...}], ok }
//   classifyBeatChange(change) -> { class: meaning | subdivision | timing | presentation, route, reopens_story }   proposeBeatChange(o)
//   noteToRevision(note, anchor, ctx) -> an editorial revision request (never "more animation" by default)
//   optionalRhythmChecks(shots, styleOptions)  opt-in, evidence-bearing style checks
import { revisionKey, SCHEMA_VERSION } from "./contracts.mjs";
import { impact } from "./impact.mjs";
import { TRAVELING_KINDS, seamRelation } from "./continuity.mjs";

const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);
const T = (x) => (typeof x === "string" ? x.trim() : x == null ? "" : String(x).trim());
const num = (x, d = null) => (Number.isFinite(Number(x)) && x !== null && x !== "" ? Number(x) : d);

export const CUT_RELATIONS = ["continuation", "contrast", "example", "cause", "scale", "separation"];
// a hard cut is always allowed: it is often the clearest seam
export const HARD_CUT_KINDS = ["cut", "hard-cut", "smash-cut", "match-cut-none", "jump-cut"];
const isHard = (k) => HARD_CUT_KINDS.includes(T(k).toLowerCase());
const travels = (k) => TRAVELING_KINDS.includes(T(k).toLowerCase());
// relations that say "these are different things / contexts": a travelling transition would claim they are one
const SEPARATE_RELATIONS = ["contrast", "example", "separation"];

// A seam the editor chose on purpose (Plan 05 E4): a hard cut between separate contexts, or a held/still seam with a stated reason. The legacy gates that
// demanded motion on both sides of EVERY seam, a carried object across every seam, an overlap or a sound at every seam skip these (crew.mjs checkScore,
// motion-gate.mjs); a seam that declares nothing is judged exactly as before. -> { hard_cut, hold, reason } (both false when nothing is declared)
export function deliberateSeam(sm) {
  const x = isObj(sm) ? sm : {};
  const e = isObj(x.editorial) ? x.editorial : {};
  const reason = T(e.reason || e.why);
  const relation = T(e.relation || x.relation);
  const hard = (e.hard_cut === true && reason.length >= 12) || (isHard(x.kind) && SEPARATE_RELATIONS.includes(relation) && !!relation);
  const hold = e.hold === true && reason.length >= 12;
  return { hard_cut: hard, hold, reason: reason || (hard ? `a ${T(x.kind) || "cut"} between ${relation} shots` : "") };
}

// ---- reading time (heuristic: labelled as such; a style or a user waiver can override) -----------------------------------------------------
// Comfortable on-screen reading, not speed reading: ~3 words/s for alphabetic scripts, ~4.5 characters/s for CJK, +0.7 s to find the text.
// Small type and small screens need longer. These numbers are defaults, never a law: `copy.reading_wps` or the film's style may change them.
const CJK = /[぀-ヿ㐀-鿿가-힯]/g;
export function readingTime({ text = "", words = null, chars = null, size_pct = null, locale = "en", display = "desktop", wps = null, orient_s = 0.7 } = {}) {
  const t = T(text);
  const cjk = (t.match(CJK) || []).length;
  const latinWords = t.replace(CJK, " ").split(/\s+/).filter(Boolean).length;
  const w = words != null ? num(words, 0) : latinWords;
  const c = chars != null ? num(chars, 0) : cjk;
  if (!w && !c) return { needed_s: 0, basis: "no copy to read" };
  let s = (w ? w / (num(wps, 3)) : 0) + (c ? c / 4.5 : 0);
  const notes = [];
  const size = num(size_pct);
  if (size != null) {
    if (size < 2) { s *= 1.6; notes.push("very small type (under 2% of the frame height)"); }
    else if (size < 3) { s *= 1.3; notes.push("small type (under 3% of the frame height)"); }
  }
  if (/phone|mobile|vertical/i.test(display)) { s *= 1.15; notes.push("viewed on a phone"); }
  if (/^(de|fi|hu|tr)/i.test(String(locale))) { s *= 1.1; notes.push("long-word locale"); }
  return { needed_s: Math.round((s + orient_s) * 100) / 100, basis: `${w ? w + " words" : ""}${w && c ? " + " : ""}${c ? c + " CJK characters" : ""}${notes.length ? "; " + notes.join("; ") : ""} (heuristic default)` };
}

// copy: [{id, text, size_pct?, seen_before?}]; a line the viewer has already read (seen_before) needs no new reading time.
export function checkReading(shot, copy = [], { locale = "en", display = "desktop" } = {}) {
  const dur = num(shot && shot.timing && shot.timing.duration_s);
  const refs = new Set(arr(shot && shot.copy_refs));
  const lines = arr(copy).filter((c) => c && (refs.has(c.id) || !refs.size) && T(c.text) && !c.seen_before);
  if (dur == null) return { ok: true, skipped: "no duration yet (timing is provisional)" };
  const need = lines.reduce((a, c) => a + readingTime({ text: c.text, size_pct: c.size_pct, locale: c.locale || locale, display, wps: c.reading_wps }).needed_s, 0);
  // several lines on screen together are read together, so take the longest plus a share of the rest, not the sum
  const per = lines.map((c) => readingTime({ text: c.text, size_pct: c.size_pct, locale: c.locale || locale, display, wps: c.reading_wps }).needed_s);
  const together = per.length ? Math.max(...per) + 0.5 * (need - Math.max(...per)) : 0;
  const waiver = T(shot && shot.editorial && shot.editorial.reading_waiver);
  const ok = together <= dur + 1e-6;
  return { ok: ok || !!waiver, needed_s: Math.round(together * 100) / 100, have_s: dur, waived: !ok && waiver ? waiver : undefined, severity: ok ? null : dur < together * 0.7 ? "major" : "minor" };
}

// ---- one beat ---------------------------------------------------------------------------------------------------------------------------
// shot.editorial = { new_value, focal_read?, reading_waiver?, ends_by? (a last shot: how it resolves the film's promise), pause_reason? }
// ctx = { copy: [{id, text, size_pct}], locale, display, last: bool, promise: "<the story's takeaway>" }
export function evaluateBeat(shot, ctx = {}) {
  const f = [];
  const id = T(shot && shot.shot_id);
  const ed = isObj(shot && shot.editorial) ? shot.editorial : {};
  if (!T(ed.new_value) && !T(shot && shot.purpose)) f.push({ id: "no-new-value", severity: "major", shot_id: id, route: "storyboard", message: `${id}: say what new understanding, proof or experience this shot adds (editorial.new_value or purpose); a shot that adds nothing is a proposal to combine or remove it` });
  const focal = shot && shot.focal_read;
  if (Array.isArray(focal) ? focal.length !== 1 : !T(focal)) f.push({ id: "focal-read", severity: "major", shot_id: id, route: "storyboard", message: `${id}: name the single most important thing to notice now (focal_read is ${Array.isArray(focal) ? focal.length + " things" : "empty"})` });
  const rd = checkReading(shot, ctx.copy, ctx);
  if (!rd.ok) f.push({ id: "reading-time", severity: rd.severity || "minor", shot_id: id, route: "storyboard", message: `${id}: the copy needs about ${rd.needed_s} s to read and the shot holds ${rd.have_s} s; hold longer, split the copy across shots or cut words (not the meaning), or record a reading_waiver (the line was already read)`, needed_s: rd.needed_s, have_s: rd.have_s });
  if (ctx.last && !T(ed.ends_by)) f.push({ id: "ending-promise", severity: "minor", shot_id: id, route: "storyboard", message: `${id}: the last shot should resolve the film's actual promise${ctx.promise ? ` ("${T(ctx.promise).slice(0, 80)}")` : ""}; say how in editorial.ends_by (not an unrelated slogan)` });
  return f;
}

// ---- one seam ---------------------------------------------------------------------------------------------------------------------------
// seam = the earlier shot's transition_out { relation, kind, carrier, cause_ref?, continuity_ref? } ; a, b = the two shots
// ctx.links = continuity.json links (Plan 04): a link for this seam gives the declared continuity type
export function evaluateSeam(seam, a, b, ctx = {}) {
  const f = [];
  const at = `${T(a && a.shot_id)}>${T(b && b.shot_id)}`;
  const s = isObj(seam) ? seam : {};
  const kind = T(s.kind).toLowerCase();
  if (!CUT_RELATIONS.includes(T(s.relation))) f.push({ id: "seam-relation", severity: "major", seam: at, route: "storyboard", message: `${at}: say what the cut means: ${CUT_RELATIONS.join(", ")} (the relation, then the transition that serves it)` });
  const link = arr(ctx.links).find((l) => l && ((T(l.from && (l.from.beat_id || l.from.id || l.from)) === T(a && a.beat_id)) && (T(l.to && (l.to.beat_id || l.to.id || l.to)) === T(b && b.beat_id))));
  if (link && s.relation && seamRelation(link.type) && seamRelation(link.type) !== T(s.relation) && !(seamRelation(link.type) === "continuation" && s.relation === "scale")) f.push({ id: "seam-link-mismatch", severity: "minor", seam: at, route: "storyboard", message: `${at}: the continuity link says ${link.type} (a ${seamRelation(link.type)} seam) but the seam says ${s.relation}` });
  if (travels(kind) && !isHard(kind)) {
    if (SEPARATE_RELATIONS.includes(T(s.relation)) && !T(s.continuity_ref) && !(link && ["same_object", "temporal_continuation", "causal_handoff"].includes(link.type))) f.push({ id: "false-continuity", severity: "major", seam: at, route: "storyboard", message: `${at}: a ${kind} makes two shots read as one continuous thing, but this seam is "${s.relation}" (separate contexts). A hard cut is clearer, or record why they are one (continuity_ref)` });
    if (T(s.relation) === "cause" && !T(s.cause_ref)) f.push({ id: "causal-claim", severity: "major", seam: at, route: "story", message: `${at}: a travelling ${kind} on a "cause" seam implies one thing causes the next; cite the story relation or evidence (cause_ref), or the cause is invented` });
    if (!T(s.carrier) && ["carry", "travel", "handoff", "morph"].includes(kind)) f.push({ id: "carrier-missing", severity: "minor", seam: at, route: "storyboard", message: `${at}: a ${kind} needs a carrier (what travels across the cut)` });
  }
  return f;
}

// ---- the whole film ---------------------------------------------------------------------------------------------------------------------
// shots in order; ctx = { copy, locale, display, links, promise, styleOptions }
export function evaluateFilm(shots, ctx = {}) {
  const S = arr(shots);
  const findings = [];
  S.forEach((sh, i) => {
    findings.push(...evaluateBeat(sh, { ...ctx, last: i === S.length - 1 }));
    if (i < S.length - 1) findings.push(...evaluateSeam(sh.transition_out, sh, S[i + 1], ctx));
  });
  // redundancy is a PROPOSAL, never an automatic cut: two beats with the same new_value
  const seen = new Map();
  for (const sh of S) {
    const k = T(sh.editorial && sh.editorial.new_value).toLowerCase();
    if (!k) continue;
    if (seen.has(k)) findings.push({ id: "redundant-beat", severity: "minor", shot_id: sh.shot_id, route: "proposal", message: `${sh.shot_id} adds the same thing as ${seen.get(k)} ("${k.slice(0, 60)}"): propose combining or removing one (a versioned proposal; meaning changes return to Story)` });
    else seen.set(k, sh.shot_id);
  }
  findings.push(...optionalRhythmChecks(S, ctx.styleOptions));
  const errors = findings.filter((x) => x.severity === "major");
  return { ok: !errors.length, findings, errors: errors.length, minor: findings.length - errors.length };
}

// Opt-in style checks. Each needs `evidence` (why this style wants it); without evidence the option is ignored. They are `style` severity: never a gate.
//   styleOptions.rhythm = { max_idea_interval_s, evidence }   styleOptions.equal_lengths = { tolerance_s, evidence }   styleOptions.camera_motion = { required, evidence }
export function optionalRhythmChecks(shots, styleOptions) {
  const o = isObj(styleOptions) ? styleOptions : {};
  const f = [];
  const durs = arr(shots).map((s) => num(s && s.timing && s.timing.duration_s)).filter((d) => d != null);
  if (isObj(o.rhythm) && T(o.rhythm.evidence) && num(o.rhythm.max_idea_interval_s)) {
    const long = arr(shots).filter((s) => num(s && s.timing && s.timing.duration_s) > o.rhythm.max_idea_interval_s && !T(s.editorial && s.editorial.pause_reason));
    for (const s of long) f.push({ id: "style-rhythm", severity: "style", shot_id: s.shot_id, route: "storyboard", message: `${s.shot_id} holds past this style's ${o.rhythm.max_idea_interval_s} s idea interval (style option, evidence: ${T(o.rhythm.evidence)}); a stated pause_reason clears it` });
  }
  if (isObj(o.equal_lengths) && T(o.equal_lengths.evidence) && durs.length > 1) {
    const tol = num(o.equal_lengths.tolerance_s, 0.25);
    if (Math.max(...durs) - Math.min(...durs) > tol) f.push({ id: "style-equal-lengths", severity: "style", route: "storyboard", message: `shot lengths differ by more than ${tol} s (style option, evidence: ${T(o.equal_lengths.evidence)})` });
  }
  return f;
}

// ---- changes to the beats ----------------------------------------------------------------------------------------------------------------
// Only a versioned proposal removes or combines a beat. Anything that alters approved MEANING returns to Story; subdividing a shot does not.
const MEANING = new Set(["claim_changed", "beat_removed", "beat_added", "beat_merged", "beat_reordered", "proposition_changed", "copy_changed", "evidence_changed"]);
const SUBDIVISION = new Set(["shot_split", "panel_added", "panel_removed", "shot_merged_same_beat"]);
const TIMING = new Set(["hold_changed", "duration_changed", "pause_added"]);
export function classifyBeatChange(change = {}) {
  const k = T(change.kind);
  if (MEANING.has(k)) {
    // a copy change that only fixes a typo or fits a line, with the same claim and evidence, is presentation; anything else is meaning
    if (k === "copy_changed" && change.same_claim === true && change.reason !== "transition") return { class: "presentation", route: "storyboard", reopens_story: false, why: "same claim and evidence; recorded, Story holds", record_required: true };
    return { class: "meaning", route: "story", reopens_story: true, why: k === "copy_changed" && change.reason === "transition" ? "copy must not change to suit a transition: decide it in Story or keep the copy" : "this changes what the film says or proves" };
  }
  if (SUBDIVISION.has(k)) return { class: "subdivision", route: "storyboard", reopens_story: false, why: "the same beat shown in more or fewer panels" };
  if (TIMING.has(k)) return { class: "timing", route: "timing", reopens_story: false, why: "committed through the canonical score writer, not edited here" };
  return { class: "presentation", route: "storyboard", reopens_story: false, why: "a presentation choice" };
}

// a versioned proposal (beats are never silently removed/combined). -> { ok, proposal }
export function proposeBeatChange({ kind, targets = [], rationale = "", base_revision = null, same_claim = false, reason = "", copy_before = null, copy_after = null } = {}) {
  if (!T(kind)) return { ok: false, error: "kind is required" };
  if (!T(rationale)) return { ok: false, error: "a proposal needs a rationale (what the viewer gains)" };
  const cls = classifyBeatChange({ kind, same_claim, reason });
  const ids = arr(targets).map(String).filter(Boolean);
  const p = { schema_version: SCHEMA_VERSION, kind: "beat_proposal", change: kind, targets: ids, rationale: T(rationale), base_revision, classification: cls, status: "proposed" };
  if (kind === "copy_changed") p.copy = { before: copy_before, after: copy_after, recorded: true };
  p.idempotency_key = revisionKey({ stage: cls.reopens_story ? "story" : "storyboard", target_ids: ids, instruction: `${kind}:${T(rationale)}`, base_revision });
  p.impact = impact(cls.reopens_story ? "story" : "storyboard", ids, cls.reopens_story ? { proposition: kind === "proposition_changed" || kind === "claim_changed" } : { timing: cls.class === "timing" });
  return { ok: true, proposal: p };
}

// ---- E6: a viewer note on the timed playback ----------------------------------------------------------------------------------------------
const NOTE_KINDS = [
  ["understanding", /\b(hard to (understand|follow|read)|confus\w*|unclear|don'?t (get|understand)|lost me|can'?t follow|what is (this|that)|makes no sense|too much|overwhelm\w*|not clear)\b/i],
  ["timing", /\b(too (fast|quick|slow|long|short)|rushed|drag\w*|linger\w*|more time|less time|hold (it )?longer|cut (it )?(shorter|down))\b/i],
  ["sound", /\b(voice|narrat\w*|music|sound|audio|volume|louder|quieter|mix)\b/i],
  ["copy", /\b(wording|copy|text says|word|typo|rephrase|rewrite)\b/i],
  ["look", /\b(colou?r|font|typeface|glossy|darker|lighter|style|look)\b/i],
  ["motion", /\b(more motion|animate|animation|movement|move more|livelier|static)\b/i],
];
// anchor = { shot_id, panel_id, t, revision }  (film seconds; the revision of the storyboard the viewer was watching)
export function noteToRevision(note, anchor = {}, ctx = {}) {
  const text = T(note);
  if (!text) return { ok: false, error: "empty note" };
  const kind = (NOTE_KINDS.find(([, re]) => re.test(text)) || ["general"])[0];
  const stale = ctx.revision != null && anchor.revision != null && Number(anchor.revision) !== Number(ctx.revision);
  const targets = [anchor.shot_id, anchor.panel_id].filter(Boolean).map(String);
  const base = { anchor: { shot_id: anchor.shot_id || null, panel_id: anchor.panel_id || null, t: num(anchor.t), revision: anchor.revision ?? null }, note_kind: kind, stale_anchor: stale || undefined };
  let ask, options;
  switch (kind) {
    case "understanding":
      ask = "editorial revision: make this shot easier to understand";
      options = ["hold longer or split the copy", "add or reorder a panel so the cause comes first", "simplify the hero and drop competing elements", "cut the shot if it adds nothing new"];
      break;
    case "timing": ask = "timing revision, committed through the canonical score writer"; options = ["change the shot's hold", "move a pause", "trim words, not meaning"]; break;
    case "sound": ask = "sound revision (versioned, shows its effect on timing)"; options = ["swap or re-level voice or music", "move a cue"]; break;
    case "copy": ask = "copy revision (recorded; a change of meaning returns to Story)"; options = ["reword with the same claim"]; break;
    case "look": ask = "bounded look revision (Story preserved)"; options = ["adjust the named look axis"]; break;
    case "motion": ask = "motion note: considered for the build, not drawn into the boards"; options = ["note the intended movement for the Motion Director"]; break;
    default: ask = "storyboard revision"; options = [];
  }
  const stage = kind === "look" ? "look" : "storyboard";
  const req = { schema_version: SCHEMA_VERSION, stage, target_ids: targets, instruction: text, base_revision: anchor.revision ?? null };
  req.idempotency_key = revisionKey(req);
  const timing = kind === "timing" || kind === "sound";
  // a note never asks for more animation by itself: "hard to understand" is an editorial question first
  return { ok: true, ...base, request: req, editorial: kind === "understanding", not_more_animation: kind === "understanding" || undefined, ask, options,
    preserve: { story: true, look: stage !== "look", unaffected_panels: true }, impact: impact(stage, targets, stage === "storyboard" ? { timing } : { bounded: true, downstream_started: true }) };
}
