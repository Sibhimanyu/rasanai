// Brief trimming (night2/token-trim). A crew member's brief used to point at whole long references ("read all of it": launch-grammar.md is 59 KB, craft.md
// 135 KB) and carry role-file sections that cannot apply to this dispatch. This module keeps the mandatory material untouched and only changes HOW the
// optional material is offered:
//   - slimInputs(): one row per path (the same file listed twice is merged); a long skill reference becomes "path + the 1-4 sections this role needs, with
//     their line ranges and the Contents range for the rest".
//   - pruneRoleText(): drops role-file sections whose own heading says they only apply under a condition this dispatch does not meet (a launch-films section
//     with no `product_first`, medium-native looks with no medium, the legacy pitches / slot flow when the treatments flow runs, the treatments section for the jury).
// Never touched: agents/_crew.md (the rules every member works by), the packet's mandatory facts / creative intent / pins, the owner's answers, the Dispatch
// context values, the "Mandatory creative sections are never shortened" guarantee in lib/packets.mjs. Nothing here truncates a section it keeps.
import fs from "node:fs";
import path from "node:path";

const WRITERS = /^(concept-writer(-|$)|script-writer|treatment-writer|visual-writer|footage-writer|story-planner|move-inventor)/;
const JUDGES = /^(script-editor|concept-critic|critic|structure-critic|ab-juror|frame-juror|reference-juror|move-juror|style-frame-juror)$/;
const LOOK = /^(design-system-designer|design-researcher|styleframe-designer|frame-designer|art-director)$/;
const RESEARCH = /^(product-researcher|brand-researcher|screens-researcher|precedent-researcher|local-scout|research-lead|brand-film-analyst|reference-analyst)$/;
export function groupOf(role) {
  if (role === "motion-director") return "motion";
  if (role === "film-builder" || role === "scene-animator") return "build";
  if (WRITERS.test(role)) return "writer";
  if (JUDGES.test(role)) return "judge";
  if (LOOK.test(role)) return "look";
  if (RESEARCH.test(role)) return "research";
  return null;
}

// file (under references/) -> role group -> heading prefixes (the text right after "## "). A group that is absent keeps the file as before.
export const SLICES = {
  "launch-grammar.md": {
    writer: ["1.", "2.", "4.", "8."], judge: ["10.", "12.", "14.", "17."], look: ["3.", "9.", "11.", "12."], motion: ["1.", "6.", "7.", "15."], build: ["5.", "6.", "12."],
    research: ["Target and scope", "3."],
  },
  "launch-film.md": { writer: ["1.", "5."], judge: ["5.", "6."], look: ["2.", "5."], motion: ["2.", "5."], research: ["3.", "4."] },
  "craft.md": { writer: ["1.", "8."], judge: ["9.", "10."], look: ["5.", "6.", "9."], motion: ["1.", "2.", "9."] },
  "3d.md": { look: ["1.", "Brand-flat 3D", "5."], motion: ["1.", "4.", "6.", "11."] },
  "story.md": { writer: ["0.", "1.", "4."], judge: ["0.", "7."] },
  "script.md": { writer: ["What you're given", "Pass 0", "The show column", "Lines:"], judge: ["Self-check", "The turn, the peak", "Rewrite moves"] },
  "score.md": { motion: ["1.", "2.", "3.", "3b.", "4."] },
  "vocabulary.md": { look: ["Start from the meaning", "3.", "4.", "9."] }, // the Motion Director and the builders keep the whole vocabulary: a score names techniques from it and the check refuses unknown ones
};
const MIN_SLICE_BYTES = 15000; // a file below this is cheaper to read whole than to slice

function headings(text) {
  const L = text.split("\n"), H = [];
  let fence = false;
  L.forEach((l, i) => { if (/^```/.test(l)) fence = !fence; const m = !fence && l.match(/^(#{2,3}) +(.*)$/); if (m) H.push({ line: i + 1, level: m[1].length, text: m[2].trim() }); });
  return { H, n: L.length };
}
const cache = new Map();
export function sliceRanges(file, prefixes) {
  let t = cache.get(file);
  if (!t) { try { t = headings(fs.readFileSync(file, "utf8")); } catch { return null; } cache.set(file, t); }
  const { H, n } = t, out = [];
  for (const p of prefixes) {
    const i = H.findIndex((h) => h.text === p || h.text.startsWith(p + " ") || (p.endsWith(".") && h.text.startsWith(p)) || (!/^\d/.test(p) && h.text.startsWith(p)));
    if (i < 0) continue;
    let e = n;
    for (let j = i + 1; j < H.length; j++) if (H[j].level <= H[i].level) { e = H[j].line - 1; break; }
    out.push({ title: H[i].text.replace(/\s*\(.*$/, "").slice(0, 40), from: H[i].line, to: e });
  }
  return out;
}
function contentsRange(file) {
  const t = cache.get(file); if (!t) return null;
  const i = t.H.findIndex((h) => /^contents$/i.test(h.text)); if (i < 0) return null;
  let e = t.n; for (let j = i + 1; j < t.H.length; j++) if (t.H[j].level <= t.H[i].level) { e = t.H[j].line - 1; break; }
  return [t.H[i].line, e];
}

// inputs: [{label, path (workspace-relative or null), exists}]. skillDir: absolute. Returns { inputs, saved_bytes, notes }.
export function slimInputs({ role, inputs, skillDir, resolve }) {
  const g = groupOf(role), refsDir = path.join(skillDir, "references") + path.sep;
  const byPath = new Map(), rows = [];
  for (const i of inputs) {
    if (i.path && byPath.has(i.path)) { const r = byPath.get(i.path); const extra = (i.label || "").trim(); if (extra && !r.label.includes(extra) && extra.length < 140) r.merged.push(extra); continue; }
    const r = { ...i, merged: [] }; rows.push(r); if (i.path) byPath.set(i.path, r);
  }
  let saved = 0; const notes = [];
  for (const r of rows) {
    const abs = r.path && resolve ? resolve(r.path) : null;
    if (g && abs && abs.startsWith(refsDir) && r.exists) {
      const spec = SLICES[path.basename(abs)];
      let size = 0; try { size = fs.statSync(abs).size; } catch { /* keep */ }
      if (spec && spec[g] && size >= MIN_SLICE_BYTES) {
        const sl = sliceRanges(abs, spec[g]);
        if (sl && sl.length) {
          const bytes = fs.readFileSync(abs, "utf8").split("\n"); // size of the slices, for the receipt
          const sliceBytes = sl.reduce((a, s) => a + bytes.slice(s.from - 1, s.to).join("\n").length, 0);
          const cr = contentsRange(abs);
          const base = (r.label || "").replace(/\s*\([^)]*\)\s*$/, "").replace(/[:;,]?\s*read (all of it|it all|in full)/i, "").trim();
          r.label = `${base} [BY PATH: read only ${sl.map((s) => `L${s.from}-${s.to} (${s.title})`).join("; ")}${cr ? `; Contents L${cr[0]}-${cr[1]} lists the rest` : ""}]`;
          saved += Math.max(0, size - sliceBytes); notes.push({ role, file: path.basename(abs), full_bytes: size, slice_bytes: sliceBytes });
        }
      }
    }
  }
  const out = rows.map(({ merged, ...x }) => x); // rows that are not there keep their path: crew.mjs brief reports them as missing_inputs
  return { inputs: out, saved_bytes: saved, notes };
}

// ---- role-file sections that cannot apply to this dispatch ----
export function splitSections(text) {
  const parts = text.split(/\n(?=## )/);
  return parts.map((p) => ({ title: (p.match(/^## (.*)/) || [, ""])[1], body: p }));
}
export function pruneRoleText({ role, key, ctx, text, treatments, hasMedium }) {
  const S = splitSections(text), dropped = [];
  const keep = S.filter((s) => {
    const t = s.title; if (!t) return true;
    let drop = false;
    if (/Dispatch context `product_first`/.test(t) && !ctx.product_first) drop = true; // launch-film guidance: only on a launch / promo film
    else if (/^Medium-native looks \(when the Look is a medium/.test(t) && !hasMedium) drop = true;
    else if (/^Reference films \(only when the Dispatch context has `reference_films`\)/.test(t) && !ctx.reference_films && /^concept-writer|style-frame-juror/.test(role)) drop = true; // the writers' section is only that; the script roles keep theirs (it also carries their file tables)
    else if (role === "script-editor" && /^Legacy pitches/.test(t) && (key === "jury" || treatments)) drop = true;
    else if (role === "script-editor" && /^Treatments mode/.test(t) && key === "jury") drop = true; // the jury follows agents/concept-jury.md "instead of everything below"
    else if (role === "script-writer" && /^Legacy slot mode/.test(t) && (key === "Set" || key === "Extra")) drop = true;
    if (drop) dropped.push({ title: t, bytes: s.body.length });
    return !drop;
  });
  return { text: keep.map((s) => s.body).join("\n"), dropped };
}
