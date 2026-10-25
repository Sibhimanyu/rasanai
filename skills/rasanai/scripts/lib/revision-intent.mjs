// Plan 10 U3: feedback -> a SCOPED revision. Deterministic and offline (no model): it reads a viewer's words and the place they pointed, and says which stage and
// which part of it to revise, what must stay, what it makes stale (lib/impact.mjs) and how the revision is made (a deterministic property edit, an editorial
// pass, a bounded look revision...). Ambiguous words get ONE concise interpretation to confirm, never a broad destructive rewrite.
// It extends lib/editorial.mjs noteToRevision (storyboard notes) and lib/contracts.mjs RevisionRequest; it does not replace either.
//
// Persisted: <run>/revisions/requests.jsonl (append-only; the latest line per idempotency_key wins, like motion/edits.jsonl).
//   status: requested -> accepted -> applied -> preview_ready -> rendered ; side states failed, reverted, stale, conflicted (compatible with motion/edits.jsonl).
// Console action (shared by RasanAI Studio and the browser console; one payload contract):
//   { kind: "revision-request", note, value: { anchor:{...}, ... } }  or  { kind: "revision-confirm", value: { idempotency_key, accept: true|false } }
import fs from "node:fs";
import path from "node:path";
import { withLock } from "./runlock.mjs";
import { SCHEMA_VERSION, canonicalDigest, revisionKey, validateRevisionRequest } from "./contracts.mjs";
import { impact } from "./impact.mjs";
import { logicalStage } from "./stages.mjs";
import { noteToRevision } from "./editorial.mjs";

const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);
const T = (x) => (typeof x === "string" ? x.trim() : x == null ? "" : String(x).trim());
const now = () => new Date().toISOString();

export const REVISION_STATUSES = Object.freeze(["requested", "accepted", "applied", "preview_ready", "rendered", "failed", "reverted", "stale", "conflicted"]);
// forward moves and the side states; anything else is refused (a revision never goes back to "requested")
const NEXT = {
  requested: ["accepted", "failed", "stale", "conflicted", "reverted"],
  accepted: ["applied", "failed", "stale", "conflicted", "reverted"],
  applied: ["preview_ready", "rendered", "failed", "stale", "conflicted", "reverted"],
  preview_ready: ["rendered", "failed", "stale", "conflicted", "reverted"],
  rendered: ["reverted", "stale"],
  failed: ["requested", "accepted", "reverted"],
  reverted: [], stale: ["requested"], conflicted: ["accepted", "requested", "reverted"],
};
export const INTENT_CATEGORIES = Object.freeze(["story", "density", "ending", "property_edit", "look", "timing", "sound", "copy", "motion", "understanding", "typography", "general"]);

// ---- typography (Plan 10): the phrases, kept apart so the avoid / size / change reads can be told apart ------------------------------------------------
const FONTW = String.raw`(?:fonts?|typefaces?|lettering)`;
const TYPO_AVOID = new RegExp(String.raw`\b(?:don'?t|do not|never|stop|avoid|no more)\b[^.!?]{0,40}\b${FONTW}\b`);
const TYPO_CHANGE = new RegExp(String.raw`\b(?:change|swap|switch|replace|fix)\b[^.!?]{0,20}\b${FONTW}\b`);
const TYPO_COMPLAINT = new RegExp(String.raw`\b${FONTW}\b[^.!?]{0,30}\b(?:is|are|looks?|feels?)\b[^.!?]{0,20}\b(?:wrong|ugly|bad|hard to read|unreadable|illegible|hard to see|off|not right|terrible|awful|hideous|too \w+)\b`);
const TYPO_DIFFERENT = new RegExp(String.raw`\b(?:use|try|want|need)\b[^.!?]{0,12}\b(?:different|another|bolder|lighter|thinner|thicker|cleaner|simpler|rounder|serif|sans[- ]?serif|heavier)\b[^.!?]{0,20}\b${FONTW}\b|\b(?:bolder|lighter|thinner|heavier|different|another)\s+${FONTW}\b`);
const TYPO_SIZE = new RegExp(String.raw`\b(?:make|set)\b[^.!?]{0,15}\b(?:the |this |that )?(?:text|type|fonts?|words|titles?|captions?|subtitles?|lettering)\b[^.!?]{0,15}\b(?:bigger|smaller|larger)\b`);
const STOP_CAP = new Set(["This", "That", "These", "Those", "The", "A", "An", "It", "I", "Please", "Dont", "Don"]);
const FONT_AVOID_FIX = ["story", "palette", "layout", "copy", "motion", "logo", "claims"];
// -> { avoid:{ kind:"font", family|null, descriptor, scope, source_text, anchored_to } | null, change:{ direction } | null, deictic }
export function extractTypography(note, anchor = {}) {
  const t = T(note), a = isObj(anchor) ? anchor : {};
  const negative = new RegExp(`${TYPO_AVOID.source}|${TYPO_COMPLAINT.source}`, "i").test(t);
  let family = null;
  if (negative) {
    const m = t.match(/\b((?:[A-Z][A-Za-z0-9-]*)(?:\s+[A-Z][A-Za-z0-9-]*){0,2})\s+(?:font|typeface)\b/) || t.match(/\b(?:use|using|avoid)\s+(?:the\s+)?((?:[A-Z][A-Za-z0-9-]*)(?:\s+[A-Z][A-Za-z0-9-]*){0,2})\b/);
    if (m) { const w = m[1].split(/\s+/).filter((x) => !STOP_CAP.has(x)); if (w.length) family = w.join(" "); }
  }
  const deictic = /\b(this|that|these|those)\b[^.!?]{0,25}\b(?:fonts?|typefaces?|lettering)\b/i.test(t);
  const anchored = [a.element_id, a.shot_id, a.beat_id].find(Boolean) || null;
  const avoid = negative ? { kind: "font", family, descriptor: family ? null : (t.match(/\b(?:this|that|these|those)[^.!?]{0,25}\b(?:fonts?|typefaces?|lettering)\b/i) || [t])[0], scope: "film", source_text: t, anchored_to: anchored } : null;
  const dir = (t.match(/\b(bolder|lighter|thinner|thicker|heavier|cleaner|simpler|rounder|bigger|smaller|larger|serif|sans[- ]?serif|different|another)\b/i) || [])[1];
  return { avoid, change: dir ? { direction: dir.toLowerCase() } : null, deictic, named: !!family };
}

// ---- the routing table: the five examples of the plan, then the older note kinds -------------------------------------------------------
const RULES = [
  // "Move this title up", "make the logo bigger", "change the text to ...", "recolor ... #ff0000": a deterministic property edit, not a writer agent
  { id: "property_edit", re: /\b(move|nudge|shift|push|slide)\b.*\b(up|down|left|right|higher|lower)\b|\b(make|resize|scale)\b.*\b(bigger|smaller|larger|\d+(\.\d+)?x)\b|\b(recolou?r|change (the )?colou?r)\b|\b(change|set|replace)\b.*\b(text|title|headline|label|caption)\b.*\b(to|with)\b/i },
  // "Use this look instead": preview what goes stale; the story stays
  { id: "look_swap", re: /\buse (this|that|the other|look \w+|the \w+) look\b|\b(switch|swap|go) (to|with) (this|that|the \w+) look\b|\buse this (look|style|one) instead\b/i },
  // "The story feels generic": the treatment / proposition, not colours
  { id: "story", re: /\b(story|idea|concept|script|treatment|angle|premise)\b.*\b(generic|boring|bland|clich\w*|forgettable|flat|predictable|weak|samey|same)\b|\b(generic|clich\w*|forgettable|predictable)\b.*\b(story|idea|concept|script)\b|\bfeels? generic\b/i },
  // "Keep this idea, make it less busy": density, hierarchy, motion; never the claim
  { id: "density", re: /\b(less|too) (busy|cluttered|crowded|noisy|much going on)\b|\b(simplif\w+|declutter|calm (it )?down|tone (it )?down|fewer (things|elements))\b|\bkeep (this|the) idea\b.*\b(less|simpler|quieter|calmer)\b/i },
  // "The ending is weak": the payoff / close and the transitions that depend on it
  { id: "ending", re: /\b(ending|end|close|closing|finale|last (shot|beat|scene)|final (shot|beat)|payoff|outro|call to action|cta)\b.*\b(weak|flat|limp|unclear|fizzle\w*|abrupt|anticlimactic|doesn'?t land|not (land|work)\w*|boring|forgettable)\b|\b(weak|flat|abrupt|limp) (ending|close|finale|payoff)\b/i },
  // Plan 10: "don't use this font", "change the font", "that font is hard to read", "use a bolder font", "make the text bigger": a look-class typography revision (story and claims stay)
  { id: "typography", re: new RegExp([TYPO_AVOID, TYPO_CHANGE, TYPO_COMPLAINT, TYPO_DIFFERENT, TYPO_SIZE].map((r) => r.source).join("|"), "i") },
];
const CATEGORY_OF = { property_edit: "property_edit", look_swap: "look", story: "story", density: "density", ending: "ending", typography: "typography" };

const lastBeat = (beats) => { const b = arr(beats); return b.length ? b[b.length - 1] : null; };

// text: the exact note. anchor: { beat_id, shot_id, element_id, t, time_range, region_norm, revision, look_id }. ctx: { beats:[{id, role}], revision, look_id }
// -> { ok, category, route, stage, target_ids, scope, deterministic, preserve, impact, interpretation, ambiguous, needs_confirmation, how, simple_text? }
export function classifyFeedback(text, anchor = {}, ctx = {}) {
  const note = T(text);
  if (!note) return { ok: false, error: "empty note" };
  const a = isObj(anchor) ? anchor : {};
  let hits = RULES.filter((r) => r.re.test(note)).map((r) => r.id);
  // "make the text bigger" reads as property_edit AND typography: pointed at an element it is the direct edit, otherwise the film-wide typography revision
  if (hits.includes("typography") && hits.includes("property_edit")) hits = hits.filter((h) => h !== (a.element_id ? "typography" : "property_edit"));
  const base = { exact_note: note, anchor_target: { beat_id: a.beat_id || null, shot_id: a.shot_id || null, element_id: a.element_id || null, time_range: a.time_range || null, t: a.t ?? null } };
  const targetIds = [a.beat_id, a.shot_id, a.element_id].filter(Boolean).map(String);
  const done = (o) => ({ ok: true, ...base, ...o });

  // two different reads at once ("the story is generic and move the title") is not one request: confirm, do not guess
  const distinct = [...new Set(hits.map((h) => CATEGORY_OF[h]))];
  if (distinct.length > 1) {
    const first = hits[0];
    return done({ category: CATEGORY_OF[first], route: "ambiguous", stage: null, target_ids: targetIds, scope: "unspecified", deterministic: false, ambiguous: true, needs_confirmation: true, destructive_broad: false,
      preserve: { everything: true }, impact: impact("storyboard", targetIds, {}),
      interpretation: `This could mean ${distinct.join(" or ")}. Which one first? Nothing changes until you pick.`, how: "none until confirmed", candidates: distinct });
  }
  const hit = hits[0];
  switch (hit) {
    case "typography": {
      const ty = extractTypography(note, a), unresolved = !!ty.avoid && !ty.named && !targetIds.length;
      const fixed = FONT_AVOID_FIX;
      const imp = impact("look", targetIds, { bounded: true, fixed, downstream_started: ctx.downstream_started !== false });
      const sc = a.element_id ? "element" : a.shot_id ? "shot" : a.beat_id ? "beat" : "film";
      const shared = { category: "typography", stage: "look", target_ids: targetIds, scope: sc, destructive_broad: false, preserve: { story: true, claims: true, brief: true, facts: true, palette: true, layout: true, copy: true }, impact: imp, avoid: ty.avoid, typography_change: ty.change, look_class: true, bounded_look: true };
      if (unresolved) return done({ ...shared, route: "typography_confirm", scope: "unspecified", deterministic: false, ambiguous: true, needs_confirmation: true, how: "none until confirmed",
        interpretation: `Which font do you mean? Name it or point at the text that uses it. Then I avoid it across the whole film and change only the typography; the story and claims stay. Nothing changes until you say.` });
      const what = ty.avoid ? (ty.named ? `avoid the font ${ty.avoid.family}` : `avoid the font used${a.element_id ? " in " + a.element_id : targetIds.length ? " in " + targetIds.join(", ") : ""}`) : `change the typography${ty.change ? " (" + ty.change.direction + ")" : ""}`;
      return done({ ...shared, route: "typography_look_revision", deterministic: false, ambiguous: false, needs_confirmation: false, include_dependents: ["storyboard_frames", "build", "final"],
        interpretation: `Typography only: ${what}${sc === "film" ? " across the whole film" : ` for ${targetIds.join(", ")}`}. The story, claims, colours, layout and copy stay. Storyboard frames, the build and the final are redrawn from the new type.`,
        how: "bounded look revision (typography part only)" });
    }
    case "property_edit": {
      const simple = note.replace(/^(please\s+)?/i, "");
      const ok = !!a.element_id;
      return done({ category: "property_edit", route: ok ? "deterministic_patch" : "needs_element", stage: "build", target_ids: targetIds, scope: "element", deterministic: ok, ambiguous: !ok, needs_confirmation: !ok, destructive_broad: false,
        preserve: { claims: true, story: true, look: true, other_elements: true }, impact: impact("build", targetIds, {}), simple_text: ok ? simple : null,
        interpretation: ok ? `Adjust ${a.element_id} directly (a property edit, no rewrite).` : "Point at the element you mean, then this is a direct edit.",
        how: ok ? "editor-patch typed/simple edit through the action queue" : "reselect an element" });
    }
    case "look_swap":
      return done({ category: "look", route: "look_preview", stage: "look", target_ids: [a.look_id || ctx.look_id].filter(Boolean), scope: "look", deterministic: false, ambiguous: false, needs_confirmation: false, destructive_broad: false,
        preserve: { story: true, brief: true }, invalidates_previews: true, impact: impact("look", [a.look_id || ctx.look_id].filter(Boolean), { downstream_started: ctx.downstream_started !== false }),
        interpretation: "Switch to this look and keep the story. Storyboard frames and previews built from the old look will be redrawn first; you see what goes stale before anything changes.", how: "look choice preview, then redraw dependent frames" });
    case "story":
      return done({ category: "story", route: "treatment_proposition", stage: "story", target_ids: targetIds, scope: "treatment", deterministic: false, ambiguous: false, needs_confirmation: false, destructive_broad: false,
        preserve: { look: true, palette: true, brief: true, facts: true }, impact: impact("story", targetIds, { proposition: true }),
        interpretation: "Rework the story idea (the proposition and the order of beats), not the colours or type. The brief and the facts stay.", how: "script pass over the treatment, then your Story call again" });
    case "density": {
      return done({ category: "density", route: "density_hierarchy_motion", stage: "storyboard", target_ids: targetIds, scope: targetIds.length ? "shot" : "film", deterministic: false, ambiguous: false, needs_confirmation: false, destructive_broad: false,
        preserve: { claims: true, proposition: true, story: true, look: true }, impact: impact("storyboard", targetIds, {}),
        interpretation: `Keep the idea and the claims; reduce competing elements, clarify what is the hero and calm the motion${targetIds.length ? " here" : " across the film"}.`, how: "storyboard density / hierarchy / motion pass (editorial first)" });
    }
    case "ending": {
      const end = lastBeat(ctx.beats);
      const ids = [...new Set([...(targetIds.length ? targetIds : []), ...(end ? [end.id] : [])])];
      return done({ category: "ending", route: "payoff_close", stage: "storyboard", target_ids: ids, scope: "payoff_close", deterministic: false, ambiguous: false, needs_confirmation: false, destructive_broad: false,
        preserve: { earlier_beats: true, claims: true, look: true }, include_dependents: ["transitions_into_close", "closing_audio_cue"], impact: impact("storyboard", ids, { timing: true }),
        interpretation: "Strengthen the payoff and close, and the transitions that lead into it. The earlier beats stay.", how: "payoff / close revision of the last beat(s)" });
    }
  }
  // the older note kinds (timing, sound, copy, look axis, motion, understanding): lib/editorial.mjs
  const nr = noteToRevision(note, { shot_id: a.shot_id, panel_id: a.panel_id, t: a.t, revision: a.revision }, { revision: ctx.revision });
  if (nr.ok && nr.note_kind !== "general") {
    return done({ category: nr.note_kind, route: `${nr.note_kind}_revision`, stage: nr.request.stage, target_ids: targetIds, scope: targetIds.length ? "shot" : "film", deterministic: false, ambiguous: false, needs_confirmation: false, destructive_broad: false,
      preserve: nr.preserve, impact: nr.impact, interpretation: nr.ask, how: nr.options[0] || nr.ask, options: nr.options, stale_anchor: nr.stale_anchor });
  }
  // nothing recognised: ONE concise interpretation, the smallest scope, confirm first. Never a story rewrite from vague words.
  const where = targetIds.length ? `just ${targetIds.join(", ")}` : a.time_range ? `only that moment` : "nothing yet";
  return done({ category: "general", route: "confirm_first", stage: "storyboard", target_ids: targetIds, scope: targetIds.length || a.time_range ? "local" : "unspecified", deterministic: false, ambiguous: true, needs_confirmation: true, destructive_broad: false,
    preserve: { everything: true }, impact: impact("storyboard", targetIds, {}),
    interpretation: `I read this as a small fix to ${where}. Is that what you mean? Say more, or point at what should change.`, how: "none until confirmed" });
}

// ---- the request record ---------------------------------------------------------------------------------------------------------------
// o: { text, anchor:{ beat_id, shot_id, element_id, t, time_range, region_norm, frame_ref, render_revision_id, index_build_digest },
//      pinned:{ film, approval_revision, build_revision, render_revision_id, source_digest }, ctx }
// idempotency_seed (optional, e.g. a console action id): one action is one request, however often it is replayed
export function buildRevisionRequest({ text, anchor = {}, pinned = {}, ctx = {}, idempotency_seed = null } = {}) {
  const c = classifyFeedback(text, anchor, ctx);
  if (!c.ok) return c;
  const a = isObj(anchor) ? anchor : {};
  const stage = logicalStage(c.stage) || "storyboard";
  const targets = c.target_ids.length ? c.target_ids : [];
  const req = {
    schema_version: SCHEMA_VERSION, idempotency_key: "", stage, target_ids: targets, instruction: c.exact_note, note: c.exact_note,
    base_revision: pinned.approval_revision ?? null,
    pinned: { film: pinned.film ?? null, approval_revision: pinned.approval_revision ?? null, build_revision: pinned.build_revision ?? null, render_revision_id: pinned.render_revision_id ?? a.render_revision_id ?? null, source_digest: pinned.source_digest ?? null },
    target: { beat_id: a.beat_id ?? null, shot_id: a.shot_id ?? null, element_id: a.element_id ?? null, time_range: a.time_range ?? (typeof a.t === "number" ? [a.t, a.t] : null) },
    annotation: isObj(a.region_norm) || a.frame_ref ? { region_norm: a.region_norm ?? null, frame_ref: a.frame_ref ?? null, render_revision_id: a.render_revision_id ?? null, index_build_digest: a.index_build_digest ?? null, time_s: a.t ?? null } : null,
    ...(c.avoid ? { avoid: c.avoid } : {}), ...(c.typography_change ? { typography_change: c.typography_change } : {}),
    intent_category: c.category, route: c.route, deterministic: !!c.deterministic, simple_text: c.simple_text ?? null,
    impact: c.impact, preserve: c.preserve, interpretation: c.interpretation, ambiguous: !!c.ambiguous, needs_confirmation: !!c.needs_confirmation,
    status: "requested",
  };
  // the same note on the same target at the same pinned revision is the same request (a repeat never makes two revisions)
  req.idempotency_key = revisionKey({ stage, target_ids: [...targets, a.element_id].filter(Boolean), instruction: `${c.category}:${c.exact_note}`, base_revision: req.pinned.render_revision_id || req.base_revision });
  if (idempotency_seed) req.idempotency_key = canonicalDigest({ action_id: String(idempotency_seed), stage });
  const v = validateRevisionRequest(req);
  if (!v.ok) return { ok: false, error: v.problems.join("; ") };
  return { ok: true, request: req, classification: c };
}

// ---- persistence (append-only, idempotent, strict ordering) ---------------------------------------------------------------------------
const file = (run) => path.join(path.resolve(String(run)), "revisions", "requests.jsonl");
const lockFile = (run) => path.join(path.resolve(String(run)), "revisions", "requests.lock");
export function readRequests(run) {
  let t = ""; try { t = fs.readFileSync(file(run), "utf8"); } catch { return []; }
  return t.split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}
export function latestRequests(run) { const m = new Map(); for (const l of readRequests(run)) m.set(l.idempotency_key, l); return [...m.values()]; }
const payloadOf = (r) => canonicalDigest({ stage: r.stage, target_ids: r.target_ids, instruction: r.instruction, pinned: r.pinned, target: r.target, annotation: r.annotation, intent_category: r.intent_category });

// -> { ok, duplicate?, request } | { ok:false, conflict:true } when the same key arrives with a different payload
export function recordRevisionRequest(run, req) {
  fs.mkdirSync(path.dirname(file(run)), { recursive: true });
  return withLock(lockFile(run), () => {
    const cur = latestRequests(run).find((r) => r.idempotency_key === req.idempotency_key);
    const pd = payloadOf(req);
    if (cur) {
      if (cur.payload_digest && cur.payload_digest !== pd) return { ok: false, conflict: true, error: "this request id was already used with different content", request: cur };
      return { ok: true, duplicate: true, request: cur };
    }
    const line = { ...req, payload_digest: pd, status: "requested", status_at: now() };
    fs.appendFileSync(file(run), JSON.stringify(line) + "\n");
    return { ok: true, request: line };
  });
}
export function transitionRevisionRequest(run, key, status, { note = "", edit_id = null, revision_id = null, conflict = null } = {}) {
  if (!REVISION_STATUSES.includes(status)) return { ok: false, error: `status must be one of ${REVISION_STATUSES.join(", ")}` };
  return withLock(lockFile(run), () => {
    const cur = latestRequests(run).find((r) => r.idempotency_key === key);
    if (!cur) return { ok: false, error: "unknown revision request" };
    if (cur.status === status) return { ok: true, duplicate: true, request: cur };
    if (!arr(NEXT[cur.status]).includes(status)) return { ok: false, conflict: true, error: `a ${cur.status} revision cannot become ${status}` };
    const line = { ...cur, status, status_at: now(), note_status: note || undefined, edit_id: edit_id ?? cur.edit_id ?? null, revision_id: revision_id ?? cur.revision_id ?? null, conflict };
    fs.appendFileSync(file(run), JSON.stringify(line) + "\n");
    return { ok: true, request: line };
  });
}

// the font families the person asked to avoid in this run: accepted (not reverted/failed/stale) requests with a named family; a request still waiting for confirmation counts for nothing
export function readFontAvoid(run) {
  return latestRequests(run).filter((r) => r.avoid && r.avoid.family && !["requested", "reverted", "failed", "stale"].includes(r.status)).map((r) => ({ family: r.avoid.family, source: `you said: "${r.exact_note || r.note}"`, scope: r.avoid.scope || "film", idempotency_key: r.idempotency_key }));
}

// ---- the console hook (shared by Studio and the browser console) ---------------------------------------------------------------------------
// action: { kind|type: "revision-request", note, value:{ anchor, pinned, beats } } | { kind|type: "revision-confirm", value:{ idempotency_key, accept } }
export function handleRevisionAction(action, { run, beats = [] } = {}) {
  const kind = action && (action.kind || action.type);
  if (!run) return { ok: false, error: "run is required" };
  if (kind === "revision-request") {
    const v = isObj(action.value) ? action.value : {};
    const built = buildRevisionRequest({ text: action.note || v.text || "", anchor: v.anchor || {}, pinned: v.pinned || {}, idempotency_seed: v.idempotency_seed || null, ctx: { beats: arr(v.beats).length ? v.beats : beats, revision: v.revision, look_id: v.look_id, downstream_started: v.downstream_started } });
    if (!built.ok) return built;
    const r = recordRevisionRequest(run, built.request);
    if (!r.ok) return r;
    // a request that needs no confirmation is accepted at once; an ambiguous one waits for the person (the current approval stays valid either way)
    let request = r.request;
    if (!r.duplicate && !request.needs_confirmation) { const t = transitionRevisionRequest(run, request.idempotency_key, "accepted", { note: "clear request" }); if (t.ok) request = t.request; }
    return { ok: true, duplicate: !!r.duplicate, request, interpretation: request.interpretation, needs_confirmation: !!request.needs_confirmation && request.status === "requested", impact: request.impact };
  }
  if (kind === "revision-confirm") {
    const v = isObj(action.value) ? action.value : {};
    if (!v.idempotency_key) return { ok: false, error: "idempotency_key is required" };
    const t = transitionRevisionRequest(run, String(v.idempotency_key), v.accept === false ? "reverted" : "accepted", { note: v.accept === false ? "declined by the person" : "confirmed by the person" });
    return t;
  }
  return { ok: false, error: "not a revision action" };
}
