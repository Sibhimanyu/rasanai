// Readable-exposure budget on the RENDER (research Top 15 #1; rules 10, 11, 21, 28, 62 in .context/motion-craft-research.md).
// A line's exposure is the time it is SETTLED and UNOCCLUDED, not the lifetime of its layer: the whole line is built, its opacity is up, nothing sits on top of it, it is not blurred
// and it has stopped moving. The composition's DOM supplies that per sample (frame-gate.mjs domTextProject returns rows[i].blocks); this file only does the arithmetic.
//   block = { id, text, words, l, t, r, b (fractions of the frame), op (0..1), occ (true when another element is on top) }
// The budget starts at about 2.7 to 3 words per second of readable exposure (BBC subtitle practice, an adaptation and not a kinetic-type standard), adds time for figures and long
// terms, and allows a single familiar word as a 0.25 to 0.75 s accent. A line below budget is a WARNING that asks to shorten or reschedule the copy before speeding it up.
//   readableExposure(rows, dt) -> { lines, findings, summary }          rows = [{ t, blocks: [block] }] at a fixed step dt (s)
export const EXPOSURE = { wps_start: 2.67, wps_max: 3.0, accent_s: [0.25, 0.75], figure_extra_s: 0.5, term_extra_s: 0.3, term_chars: 11, settle_move: 0.012, min_op: 0.9, min_words: 2, ghost_s: 0.75, ghost_iou: 0.5 };

const norm = (t) => String(t || "").toLowerCase().replace(/\s+/g, " ").trim();
const words = (t) => String(t || "").split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
const iou = (a, b) => { const iw = Math.min(a.r, b.r) - Math.max(a.l, b.l), ih = Math.min(a.b, b.b) - Math.max(a.t, b.t); if (!(iw > 0 && ih > 0)) return 0; const i = iw * ih, u = (a.r - a.l) * (a.b - a.t) + (b.r - b.l) * (b.b - b.t) - i; return u > 0 ? i / u : 0; };
const r2 = (v) => Math.round(v * 100) / 100;
export const extraTime = (text, G = EXPOSURE) => { const ws = words(text); return ws.filter((w) => /\d/.test(w)).length * G.figure_extra_s + ws.filter((w) => !/\d/.test(w) && w.replace(/[^\p{L}]/gu, "").length >= G.term_chars).length * G.term_extra_s; };

export function readableExposure(rows, dt, G = EXPOSURE) {
  const lines = [], findings = [], series = new Map();
  rows.forEach((row, i) => { for (const b of (row && row.blocks) || []) { if (!series.has(b.id)) series.set(b.id, []); series.get(b.id).push({ i, b }); } });
  for (const [id, seq] of series) {
    const final = seq.reduce((m, x) => ((x.b.words || words(x.b.text).length) > (m.b.words || words(m.b.text).length) ? x : m), seq[0]).b, fw = final.words || words(final.text).length;
    const at = new Map(seq.map((x) => [x.i, x.b])), complete = (b) => (b.words || words(b.text).length) >= fw;
    const stable = (i, j) => { const a = at.get(i), c = at.get(j); return a && c && Math.abs(a.l - c.l) <= G.settle_move && Math.abs(a.t - c.t) <= G.settle_move && Math.abs(a.r - c.r) <= G.settle_move && Math.abs(a.b - c.b) <= G.settle_move; };
    let settled = 0, first = null;
    for (const { i, b } of seq) {
      if (!complete(b) || b.occ || !(b.op >= G.min_op)) continue;
      if (stable(i - 1, i) || stable(i, i + 1)) { settled++; if (first == null) first = rows[i].t; }
    }
    const readable = settled * dt, ws = fw, need = ws / G.wps_max + extraTime(final.text, G);
    const L = { id, text: final.text, words: ws, at_s: first == null ? rows[seq[0].i].t : first, readable_s: r2(readable), wps: readable > 0 ? r2(ws / readable) : null, need_s: r2(need) };
    lines.push(L);
  }
  const essential = lines.filter((l) => l.words >= G.min_words && !/^[^\p{L}\p{N}]*$/u.test(l.text));
  // a half-sample tolerance: the series is sampled at dt, so exposure is known to about dt
  const low = essential.filter((l) => l.readable_s + dt / 2 + 1e-9 < l.need_s);
  const never = low.filter((l) => l.readable_s === 0);
  if (low.length) {
    const show = low.sort((a, b) => b.need_s - b.readable_s - (a.need_s - a.readable_s)).slice(0, 5).map((l) => `"${l.text.slice(0, 36)}" (${l.words} words, ${l.readable_s} s settled at ${r2(l.at_s)} s${l.wps ? `, ${l.wps} words/s` : ""}; needs about ${l.need_s} s)`).join("; ");
    findings.push({ check: "readable-exposure", severity: "warning", message: `${low.length} essential line(s) fall below the readable-exposure budget (about ${G.wps_start} to ${G.wps_max} words per second of settled, unoccluded time, plus time for figures and long terms)${never.length ? `; ${never.length} never settle` : ""}: ${show}`, fix: "shorten the line or move it to a longer beat before speeding it up, and let it stop moving earlier (the entrance eats the reading window); a familiar single word may stay as a 0.25 to 0.75 s accent", basis: "render" });
  }
  // ghost copies: the same text twice in overlapping boxes for a stretch of samples (a blur or trail left as a duplicate)
  const ghosts = new Map();
  rows.forEach((row, i) => { const bl = (row && row.blocks) || []; for (let a = 0; a < bl.length; a++) for (let c = a + 1; c < bl.length; c++) if (norm(bl[a].text) && norm(bl[a].text) === norm(bl[c].text) && bl[a].op >= 0.15 && bl[c].op >= 0.15 && iou(bl[a], bl[c]) >= G.ghost_iou) { const k = norm(bl[a].text); if (!ghosts.has(k)) ghosts.set(k, []); ghosts.get(k).push(i); } });
  const ghostHits = [];
  for (const [k, idx] of ghosts) { let run = 1, best = 1, end = idx[0]; for (let q = 1; q < idx.length; q++) { if (idx[q] === idx[q - 1] + 1) { run++; if (run > best) { best = run; end = idx[q]; } } else run = 1; } if (best * dt >= G.ghost_s) ghostHits.push({ text: k, s: r2(best * dt), at_s: r2(rows[end].t - (best - 1) * dt) }); }
  if (ghostHits.length) findings.push({ check: "ghost-copies", severity: "warning", message: `the same text shows twice in overlapping boxes for ${ghostHits.slice(0, 3).map((g) => `${g.s} s from ${g.at_s} s ("${g.text.slice(0, 28)}")`).join("; ")}: ghost copies read as a double image`, fix: "keep a smear to 1 to 2 frames and build blur from velocity (RasanTexture.motionBlur); remove a duplicate layer that stays on screen", basis: "render" });
  const wpsAll = essential.filter((l) => l.wps != null).map((l) => l.wps).sort((a, b) => a - b);
  return { lines, findings, summary: { essential_lines: essential.length, below_budget: low.length, never_settle: never.length, median_wps: wpsAll.length ? wpsAll[wpsAll.length >> 1] : null, worst: low.slice(0, 5).map((l) => ({ text: l.text.slice(0, 40), words: l.words, readable_s: l.readable_s, need_s: l.need_s, at_s: r2(l.at_s) })) } };
}
