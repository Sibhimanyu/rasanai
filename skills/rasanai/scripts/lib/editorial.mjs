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
//   W05 temporal checks (additive; run only on shots that carry reads / bindings / composition, so legacy boards are judged exactly as before):
//   evaluateTemporal(shots, ctx) -> { active, findings, inventory, ending, unassessed } / compositionInventory(shots) / CUT_FUNCTION_HINTS / KIND_TEMPORAL_EXPECTATIONS
import { revisionKey, SCHEMA_VERSION } from "./contracts.mjs";
import { impact } from "./impact.mjs";
import { TRAVELING_KINDS, seamRelation } from "./continuity.mjs";
import { toTicks } from "./timing.mjs";

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
  const tmp = evaluateTemporal(S, ctx);
  if (tmp.active) findings.push(...tmp.findings);
  const errors = findings.filter((x) => x.severity === "major");
  return { ok: !errors.length, findings, errors: errors.length, minor: findings.length - errors.length };
}

// ---- W05: time-dependent shots: reads, cause before reaction, composition sameness, endings -----------------------------------------------------
// Everything here is a finding with evidence, never a rewrite: it never shortens, speeds up or lengthens a shot (the user's duration and budget stand).
// Reading-time heuristics stay warnings with a stated assumption. A repeated subject is NOT a defect; only an unprogressed reset of the same composition is.
// shot extras (see storyboard.mjs normalizeShot): reads[{id,event_id,source_interval|interval,minimum_read_basis,competing_reads,...}], bindings{initial,action,consequence},
// composition{focal_subject,scale,framing,ground,density,action_register,repeat_reason,...}, editorial.anticipation_reason
// A read's resolved window: ctx.intervals (normalizeReads().intervals) wins, else the shot's own source_interval seconds. Returns null when it has no numeric window.
const windowOf = (r, intervalsById) => {
  const iv = intervalsById.get(r.id);
  if (iv) return { start: iv.start_tick, end: iv.end_tick, stale: iv.stale };
  const si = isObj(r.source_interval) ? r.source_interval : isObj(r.interval) ? r.interval : {};
  const a = num(si.start_s ?? si.start), b = num(si.end_s ?? si.end);
  return a != null && b != null && b >= a ? { start: toTicks(a), end: toTicks(b), stale: false } : null;
};
const REGISTER_KEYS = ["focal_subject", "scale", "framing", "ground", "density", "action_register"];
// the film-level composition inventory: one row per shot and its relation to the neighbours (the facts the reviewer reads; no verdict here)
export function compositionInventory(shots) {
  const S = arr(shots);
  return S.map((sh, i) => {
    const c = isObj(sh && sh.composition) ? sh.composition : null;
    const prev = i > 0 && isObj(S[i - 1] && S[i - 1].composition) ? S[i - 1].composition : null;
    const same = c && prev ? REGISTER_KEYS.filter((k) => T(c[k]) && T(c[k]) === T(prev[k])) : [];
    return { shot_id: T(sh && sh.shot_id), ...(c ? { ...Object.fromEntries(REGISTER_KEYS.map((k) => [k, T(c[k]) || null])), anchor_ids: arr(c.anchor_ids), representation_level: T(c.representation_level) || null } : { declared: false }), shares_with_previous: same };
  });
}
export const CUT_FUNCTION_HINTS = { cause: "the next shot shows what the last one set in motion", contrast: "two things set against each other", ellipsis: "time or space skipped on purpose", viewpoint: "same subject, different vantage", evidence: "the claim, then its proof", rhythmic_punctuation: "a beat, not a meaning", separation: "a new context, nothing carried" };
// What each bounded kind should show the reviewer in the temporal storyboard (specs for the deferred cases KND-04/10/12/13; data for the reviewer, not a gate)
export const KIND_TEMPORAL_EXPECTATIONS = Object.freeze({
  "instructional-explainer": { case: "KND-04", reads: "each step is a read whose cause precedes its result; the sourced relationship is understandable before the analogy is left", limits: "analogy limits stay on screen or in the narration at the read that uses them" },
  "evidence-case-study": { case: "KND-10", reads: "an attributed, permitted result is read together with its qualifier; the qualifier is a protected text role", limits: "no invented improvement graph: a chart read needs a source_ref" },
  "music-lyric-film": { case: "KND-12", reads: "supplied lyrics/sync set the read windows; picture relates to the music on purpose (illustrate, answer, counter)", limits: "launch grammar (feature cards, claim ladder) does not spill into a lyric film" },
  "footage-led-story": { case: "KND-13", reads: "speaker and source meaning set the order; an editorial cut says its function; cause precedes reaction across cuts", limits: "a generated or illustrative shot is labelled so and never reads as recorded footage" },
});
export function evaluateTemporal(shots, ctx = {}) {
  const S = arr(shots);
  const findings = [], unassessed = [];
  const active = S.some((s) => arr(s && s.reads).length || (s && s.bindings) || (s && s.composition));
  if (!active) return { active: false, findings, inventory: [], ending: null, unassessed };
  const byId = new Map(arr(ctx.intervals).map((x) => [x.id, x]));
  const push = (f) => findings.push({ route: "storyboard", ...f });
  S.forEach((sh, i) => {
    const id = T(sh.shot_id);
    const R = arr(sh.reads);
    const wins = R.map((r) => ({ r, w: windowOf(r, byId) }));
    for (const { r, w } of wins) {
      if (!w) { unassessed.push({ shot_id: id, read_id: r.id, why: "no numeric window to judge" }); continue; }
      if (w.stale) { push({ id: "read-stale", severity: "major", shot_id: id, read_id: r.id, message: `${id}/${r.id}: the read window belongs to an older score; re-map it (nothing is re-timed for you)` }); continue; }
      // reading-time heuristic with its stated assumption: min_s comes from minimum_read_basis or the shot's copy; absent either, the read is not assessed
      const b = isObj(r.minimum_read_basis) ? r.minimum_read_basis : {};
      const need = num(b.min_s);
      const have = (w.end - w.start) / 1e6;
      if (need == null) { unassessed.push({ shot_id: id, read_id: r.id, why: "minimum_read_basis has no min_s; heuristics are not guessed" }); continue; }
      if (need > have + 1e-6) push({ id: "read-window-short", severity: have < need * 0.7 ? "major" : "minor", shot_id: id, read_id: r.id, needed_s: need, have_s: Math.round(have * 1e3) / 1e3, assumption: T(b.assumption) || "stated minimum_read_basis",
        message: `${id}/${r.id}: this read needs about ${need} s (${T(b.assumption) || "stated basis"}) and has ${Math.round(have * 100) / 100} s; ask for fewer messages, different staging (another channel, an earlier set-up) or more time, or record why it is enough. Do not just speed the action up` });
    }
    // overlapping reads are legitimate when independent channels cooperate; the Director must say why the viewer can follow both
    for (let a = 0; a < wins.length; a++) for (let b = a + 1; b < wins.length; b++) {
      const x = wins[a], y = wins[b];
      if (!x.w || !y.w || !(x.w.start < y.w.end && y.w.start < x.w.end)) continue;
      const declared = [...arr(x.r.competing_reads), ...arr(y.r.competing_reads)].some((c) => c && (c.id === x.r.id || c.id === y.r.id) && T(c.why_followable || c.why));
      const sameTarget = T(x.r.attention_target) && T(x.r.attention_target) === T(y.r.attention_target);
      if (!declared) push({ id: "reads-overlap-unexplained", severity: sameTarget ? "major" : "minor", shot_id: id, read_ids: [x.r.id, y.r.id], message: `${id}: reads ${x.r.id} and ${y.r.id} overlap${sameTarget ? " on the same attention target" : ""}; say in competing_reads why the viewer can follow both (a different channel: picture vs sound, face vs text) or stage them in sequence` });
    }
    // cause before reaction (TMP-04): the consequence may not begin before the action that causes it, unless anticipation is motivated by the concept
    const bd = isObj(sh.bindings) ? sh.bindings : null;
    if (bd && bd.action && bd.consequence && num(bd.action.start_s) != null && num(bd.consequence.start_s) != null && bd.consequence.start_s < bd.action.start_s) {
      const ant = (bd.consequence.anticipation && bd.consequence.anticipation.motivated === true && T(bd.consequence.anticipation.reason)) || T(sh.editorial && sh.editorial.anticipation_reason);
      if (!ant) push({ id: "reaction-before-cause", severity: "major", shot_id: id, message: `${id}: the consequence starts (${bd.consequence.start_s} s) before its action (${bd.action.start_s} s); reorder, or record the anticipation the selected concept motivates (bindings.consequence.anticipation.reason)` });
    }
    if (bd && bd.initial && bd.action && num(bd.initial.start_s) != null && num(bd.action.start_s) != null && bd.action.start_s < bd.initial.start_s) push({ id: "action-before-initial-state", severity: "minor", shot_id: id, message: `${id}: the action begins before the initial state it changes is shown` });
    if (bd && bd.action && !bd.consequence && sh.demonstrates) push({ id: "no-consequence", severity: "minor", shot_id: id, message: `${id}: a demonstration shows an action with no visible consequence (bindings.consequence)` });
  });
  // sameness (TMP-07) vs deliberate recurrence (TMP-06): a run of 3+ shots with the SAME composition fingerprint and no progression of the consequence, no repeat_reason
  const fp = (sh) => { const c = isObj(sh && sh.composition) ? sh.composition : null; return c && REGISTER_KEYS.every((k) => T(c[k])) ? REGISTER_KEYS.map((k) => T(c[k]).toLowerCase()).join("|") : null; };
  const progress = (sh) => T(sh && sh.bindings && sh.bindings.consequence && sh.bindings.consequence.state).toLowerCase();
  const reason = (sh) => T((sh && sh.composition && sh.composition.repeat_reason) || (sh && sh.editorial && sh.editorial.repeat_reason));
  const minRun = Math.max(2, num(ctx.sameness_run, 3));
  for (let i = 0; i < S.length;) {
    const k = fp(S[i]);
    let j = i + 1;
    while (k && j < S.length && fp(S[j]) === k) j++;
    const run = S.slice(i, j);
    if (k && run.length >= minRun && !run.some(reason)) {
      const states = new Set(run.map(progress).filter(Boolean));
      if (states.size < 2) push({ id: "composition-reset", severity: "minor", shot_ids: run.map((x) => x.shot_id), message: `${run.map((x) => x.shot_id).join(", ")}: ${run.length} shots reset the same composition (${REGISTER_KEYS.map((q) => `${q} ${T(run[0].composition[q])}`).join(", ")}) and the consequence does not progress; change what the viewer sees (scale, framing, ground, action) or record a repeat_reason (a refrain, a deliberate return). Returning to one subject is not itself a problem` });
    }
    i = j;
  }
  // endings (TMP-08): no universal tiny-ending or biggest-type quota; only whether the held ending resolves the opening and its read has its window
  const last = S[S.length - 1];
  const lastReads = arr(last && last.reads);
  const ending = last ? { shot_id: T(last.shot_id), resolves: !!T(last.editorial && last.editorial.ends_by), has_reads: lastReads.length > 0, rule: "no universal minimum or maximum ending duration or type size; the window must fit the ending's own reads" } : null;
  return { active: true, findings, inventory: compositionInventory(S), ending, unassessed };
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
