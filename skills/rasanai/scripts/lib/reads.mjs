// W4: the timed "reads" of a scene (references/reads.md). motion/score.json scenes may carry reads[]: what the viewer must notice, in
// what order (notice > cause/action > reaction > result), and for how long each stays visible. This checks STRUCTURE and measured text
// time only: it never claims a viewer understood anything (that is the critic's and the frame juror's subjective call, on the renders).
// Reuses lib/reading.mjs (the one reading-time formula) and lib/scene-contract.mjs (isComplex, the held-result rule). Idea from
// ClaudeAnimationBase's "write the reads" (MIT, idea only; our code). Every named finding is a WARNING until calibrated; a malformed
// reads[] (unknown kind, t1 <= t0, outside 0..duration, missing text fields) is invalid (P).
import fs from "node:fs";
import path from "node:path";
import { readTime, wordCount, hasCjk, READ_BASE_S, READ_PER_WORD_S } from "./reading.mjs";
import { isComplex, unheldResult, SC, CARRY_KINDS } from "./scene-contract.mjs";

export const KINDS = ["notice", "cause", "action", "reaction", "result", "text"];
// the order a viewer must meet them in (text is exempt: it has its own clock). cause and action share a rank.
const RANK = { notice: 0, cause: 1, action: 1, reaction: 2, result: 3 };
// reasons that let two reads overlap on purpose, besides a written parallel_with reason: a continuity type
export const CONTINUITY_TYPES = new Set([...CARRY_KINDS, "motion-carried", "secondary-motion", "settle", "continuous-motion"]);
export const RD = { overlap_s: 0.05, payoff_s: SC.hold_s, reason_chars: 8, reads_required_formats: ["cartoon", "evidence"] };

const num = (x) => (Number.isFinite(Number(x)) && x !== null && x !== "" && typeof x !== "boolean" ? Number(x) : null);
const r2 = (x) => Math.round(x * 100) / 100;
const str = (x) => String(x == null ? "" : x).trim();
const nameOf = (s, i) => `scene ${s.id != null ? s.id : s.n != null ? s.n : i + 1}`;
const jsonMaybe = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

export const durationOf = (s) => num(s.duration) ?? (num(s.end) !== null && num(s.start) !== null ? s.end - s.start : null);
const textOf = (r) => str(r.text) || (r.kind === "text" ? str(r.subject) : "");
const hasReason = (a, b) => {
  const c = str(a.continuity);
  if (c && CONTINUITY_TYPES.has(c)) return true;
  const p = a.parallel_with;
  if (Array.isArray(p)) return p.some((x) => str(x) === str(b.id) || str(x).length >= RD.reason_chars);
  const t = str(p);
  return t === str(b.id) ? !!t : t.length >= RD.reason_chars;
};

// does the run's route/format need reads[] on every dramatic scene? (new cartoon/evidence formats; never an old product film)
export function readsRequired(score, run) {
  if (score && score.reads_required === true) return true;
  if (!run) return false;
  const d = jsonMaybe(path.join(run, "decisions.json")) || {}, b = jsonMaybe(path.join(run, "brief.json")) || {};
  const f = b.fields || b;
  return [d.route, d.format, b.route, b.format, f.route, f.format].some((x) => RD.reads_required_formats.includes(str(x).toLowerCase()));
}

// -> { P: [invalid], W: [warnings], findings: [{code, scene, t, message, fix}], scenes: [{scene, id, reads, status}], enabled, required }
export function readsChecks(score, { run = null } = {}) {
  const P = [], W = [], findings = [];
  const S = Array.isArray(score && score.scenes) ? score.scenes : [];
  const required = readsRequired(score, run);
  const enabled = required || S.some((s) => s && s.reads !== undefined);
  const rows = [];
  const warn = (code, s, i, t, message, fix) => {
    const at = num(s.start) !== null && t !== null ? ` (film ${r2(s.start + t)} s)` : "";
    const msg = `${code}: ${nameOf(s, i)}${t !== null ? ` at ${r2(t)} s${at}` : ""}: ${message}${fix ? `; suggested edit: ${fix}` : ""}`;
    W.push(msg);
    findings.push({ code, scene: s.id != null ? s.id : s.n, t, message: msg, fix: fix || null });
  };
  S.forEach((s, i) => {
    if (!s || typeof s !== "object") return;
    const dur = durationOf(s);
    const nm = nameOf(s, i);
    if (s.reads === undefined) {
      const why = isComplex(s, score);
      const waived = str(s.reads_waived).length >= 12;
      if (!waived && (required || (enabled && why))) warn("missing-read", s, i, null, `${required ? "this film needs reads[]" : `a dramatic scene (${why}) in a film that writes reads`} and ${nm} has none`, "add reads [{id, t0, t1, kind, subject, visual_cue}]: notice, then the action, then the reaction or result, in scene-local seconds (references/reads.md)");
      rows.push({ scene: s.id != null ? s.id : s.n, reads: 0, status: why || required ? "missing" : "none" });
      return;
    }
    if (!Array.isArray(s.reads)) { P.push(`reads: ${nm}: reads must be an array of {id, t0, t1, kind, subject, visual_cue}`); return; }
    const R = s.reads;
    const before = P.length;
    const seen = new Set();
    R.forEach((r, k) => {
      const at = `${nm} reads[${k}]${r && r.id ? ` "${r.id}"` : ""}`;
      if (!r || typeof r !== "object") { P.push(`reads: ${at} is not an object`); return; }
      if (!str(r.id)) P.push(`reads: ${at} has no id`); else if (seen.has(str(r.id))) P.push(`reads: ${at}: id "${r.id}" is used twice`); else seen.add(str(r.id));
      if (!KINDS.includes(r.kind)) P.push(`reads: ${at}: kind "${r.kind}" is not one of ${KINDS.join("|")}`);
      const t0 = num(r.t0), t1 = num(r.t1);
      if (t0 === null || t1 === null) { P.push(`reads: ${at}: t0 and t1 must be numbers (scene-local seconds)`); return; }
      if (t0 < 0 || (dur !== null && t1 > dur + 1e-6)) P.push(`reads: ${at}: ${r2(t0)}-${r2(t1)} s is outside the scene's 0..${dur === null ? "?" : r2(dur)} s (times are scene-local)`);
      if (!(t1 > t0)) P.push(`reads: ${at}: t1 (${r2(t1)}) must be greater than t0 (${r2(t0)})`);
      if (!str(r.subject)) P.push(`reads: ${at}: subject is empty (what the viewer notices)`);
      if (!str(r.visual_cue)) P.push(`reads: ${at}: visual_cue is empty (what on screen shows it)`);
    });
    if (P.length > before) { rows.push({ scene: s.id != null ? s.id : s.n, reads: R.length, status: "invalid" }); return; }
    if (!R.length) {
      if (required) warn("missing-read", s, i, null, "reads is empty", "write at least the action and its reaction or result");
      rows.push({ scene: s.id != null ? s.id : s.n, reads: 0, status: "empty" });
      return;
    }
    const tn = R.map((r) => ({ ...r, t0: Number(r.t0), t1: Number(r.t1) }));

    // reads-order: stable order in the array and in time, then notice > cause/action > reaction > result along the clock
    const sorted = tn.slice().sort((a, b) => a.t0 - b.t0 || a.t1 - b.t1);
    const unsorted = tn.findIndex((r, k) => k > 0 && r.t0 < tn[k - 1].t0);
    if (unsorted > 0) warn("reads-order", s, i, tn[unsorted].t0, `reads[] is not in time order: "${tn[unsorted].id}" (${r2(tn[unsorted].t0)} s) is listed after "${tn[unsorted - 1].id}" (${r2(tn[unsorted - 1].t0)} s)`, "list the reads by t0, earliest first");
    const flow = sorted.filter((r) => r.kind in RANK);
    for (let a = 0; a < flow.length; a++) for (let b = a + 1; b < flow.length; b++) {
      const x = flow[a], y = flow[b];
      if (RANK[y.kind] < RANK[x.kind]) {
        // x starts first but must come after y in the story: y is out of order
        warn("reads-order", s, i, x.t0, `the ${x.kind} "${x.id}" starts at ${r2(x.t0)} s, before the ${y.kind} "${y.id}" it follows (${y.kind} starts at ${r2(y.t0)} s): a viewer sees the effect before the ${y.kind}`, `move the ${x.kind} to start at or after ${r2(y.t1)} s (the ${y.kind} read's end), or swap the two reads`);
        a = flow.length; break;
      }
    }

    // competing-reads: overlap only with a parallel_with reason or a continuity type
    for (let a = 0; a < sorted.length; a++) for (let b = a + 1; b < sorted.length; b++) {
      const x = sorted[a], y = sorted[b];
      const ov = Math.min(x.t1, y.t1) - Math.max(x.t0, y.t0);
      if (ov <= RD.overlap_s || hasReason(x, y) || hasReason(y, x)) continue;
      const txt = [x, y].find((q) => q.kind === "text"), hero = [x, y].find((q) => q.kind !== "text");
      const what = txt && hero ? `the silent text read "${txt.id}" and the ${hero.kind} "${hero.id}" both ask for attention` : `the ${x.kind} "${x.id}" and the ${y.kind} "${y.id}" both ask for attention`;
      warn("competing-reads", s, i, Math.max(x.t0, y.t0), `${what} for ${r2(ov)} s (${r2(Math.max(x.t0, y.t0))}-${r2(Math.min(x.t1, y.t1))} s) with no parallel_with reason`, `end "${x.id}" at ${r2(y.t0)} s, or start "${y.id}" at ${r2(x.t1)} s, or add parallel_with: "<why they read together>" / continuity: "motion-carried"`);
    }

    // text-unreadable: the one reading-time formula (lib/reading.mjs), at the plan level (no render slack)
    for (const r of tn.filter((q) => q.kind === "text" || textOf(q))) {
      const text = textOf(r);
      if (!text) continue;
      const need = readTime(text), span = r.t1 - r.t0;
      if (span + 1e-9 < need) {
        const w = wordCount(text);
        const fit = Math.max(0, Math.floor((span - READ_BASE_S) / READ_PER_WORD_S));
        warn("text-unreadable", s, i, r.t0, `text read "${r.id}" holds ${r2(span)} s for ${hasCjk(text) ? "CJK text" : `${w} word${w === 1 ? "" : "s"}`} ("${text.length > 40 ? text.slice(0, 37) + "..." : text}"), which needs ${r2(need)} s (0.6 s + 0.3 s per word)`, `hold it until ${r2(r.t0 + need)} s (t1)${hasCjk(text) ? "" : `, or cut it to ${fit} word${fit === 1 ? "" : "s"}`}; never speed the text up${r2(r.t0 + need) > (dur ?? Infinity) ? ` (the scene is ${r2(dur)} s: lengthen it)` : ""}`);
      }
    }

    // no-visible-result / unheld-reaction
    const payoffs = sorted.filter((r) => r.kind === "reaction" || r.kind === "result");
    const drives = sorted.filter((r) => r.kind === "cause" || r.kind === "action");
    if (!payoffs.length && drives.length) {
      const last = drives[drives.length - 1];
      warn("no-visible-result", s, i, last.t1, `the ${last.kind} "${last.id}" ends at ${r2(last.t1)} s and no reaction or result read follows: the viewer never sees what it did`, `add a reaction or result read from ${r2(last.t1)} s with a visual_cue naming the pose, face or object the viewer sees`);
    }
    for (const p of payoffs) if (!str(p.visual_cue) || str(p.visual_cue).length < 4) warn("no-visible-result", s, i, p.t0, `the ${p.kind} "${p.id}" has no visual_cue that can be seen`, "name the final pose, face or object state that shows it");
    if (payoffs.length) {
      const p = payoffs[payoffs.length - 1];
      const span = p.t1 - p.t0;
      // the payoff's own window is the held-result rule of scene-contract (a carrying seam hands on a result that ends the scene)
      const endsScene = dur !== null && p.t1 >= dur - 0.05;
      const u = endsScene ? unheldResult(s, score, { last: p.t0, dur: p.t1 }) : span + 1e-9 < RD.payoff_s ? { need: RD.payoff_s, left: span } : null;
      if (u) warn("unheld-reaction", s, i, p.t0, `the ${p.kind} "${p.id}" is visible for ${r2(span)} s (${r2(p.t0)}-${r2(p.t1)} s); a payoff needs ${RD.payoff_s} s to be seen${endsScene ? " unless a carrying seam hands it on" : ""}`, `extend t1 to ${r2(p.t0 + RD.payoff_s)} s (take the time from the action read${endsScene ? " or lengthen the scene" : ""}), hold the final pose${endsScene ? ", or carry it through the seam (push-through, match-cut, carried-object)" : ""}`);
    }
    rows.push({ scene: s.id != null ? s.id : s.n, reads: R.length, status: "ok" });
  });
  return { P, W, findings, scenes: rows, enabled, required };
}

// the four positions a reviewer needs to see for a scene, scene-local seconds, from its reads:
// entry (first read, just inside it), action (middle of the first cause/action), reaction (middle of the first reaction/result), hold (the end of the last read)
export function readPositions(scene) {
  const dur = durationOf(scene) ?? 0;
  const R = (Array.isArray(scene.reads) ? scene.reads : []).map((r) => ({ ...r, t0: Number(r.t0), t1: Number(r.t1) })).sort((a, b) => a.t0 - b.t0);
  if (!R.length) return [];
  const clamp = (t) => r2(Math.min(Math.max(0, t), Math.max(0, dur - 0.04)));
  const mid = (r) => (r.t0 + r.t1) / 2;
  const first = R[0];
  const act = R.find((r) => r.kind === "cause" || r.kind === "action") || R[Math.min(1, R.length - 1)];
  const rea = R.find((r) => r.kind === "reaction" || r.kind === "result") || R[R.length - 1];
  const lastEnd = Math.max(...R.map((r) => r.t1));
  const hold = Math.min(dur - 0.04, lastEnd + Math.max(0, (dur - lastEnd) / 2));
  return [
    { position: "entry", t: clamp(first.t0 + Math.min(0.15, (first.t1 - first.t0) / 2)), read: first.id, kind: first.kind, cue: first.visual_cue },
    { position: "action", t: clamp(mid(act)), read: act.id, kind: act.kind, cue: act.visual_cue },
    { position: "reaction", t: clamp(mid(rea)), read: rea.id, kind: rea.kind, cue: rea.visual_cue },
    { position: "hold", t: clamp(Math.max(hold, rea.t1 - 0.05)), read: rea.id, kind: rea.kind, cue: `${rea.visual_cue} (held)` },
  ];
}

// the key transition of a scene: the cause/action > reaction boundary (else the start of the last read), scene-local seconds
export function keyTransition(scene) {
  const R = (Array.isArray(scene.reads) ? scene.reads : []).map((r) => ({ ...r, t0: Number(r.t0), t1: Number(r.t1) })).sort((a, b) => a.t0 - b.t0);
  if (!R.length) return null;
  const rea = R.find((r) => r.kind === "reaction" || r.kind === "result");
  return r2(rea ? rea.t0 : R[R.length - 1].t0);
}
