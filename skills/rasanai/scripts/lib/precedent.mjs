// Precedent lookup: "what did human motion designers do at this kind of beat?" Offline, reads
// third_party/motionmaxxing/moments.jsonl (716 rows: designer rules PR-, study moments PM, film rules PL).
// Adapted from motionmaxxing (Apache-2.0, Tejas Makwana, github.com/Tejashmakwana/motionmaxxing): the ranking idea of its
// scripts/precedent.py (beat +3, content +2/+1, idf-weighted text tokens up to +4, measured rules +0.8, one row per film),
// ported to Node and modified by RasanAI. See third_party/motionmaxxing/NOTICE.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const LIB = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "third_party", "motionmaxxing", "moments.jsonl");
export const BEATS = ["hook", "turn", "proof", "cta"];
export const CONTENTS = ["ui", "type", "logo", "number", "3d", "abstract", "photo"];
export const PROVENANCE = "model-decoded precedent (motionmaxxing), unverified: a hint, not a rule";
const BEAT_ALIAS = { problem: "hook", claim: "hook", opening: "hook", setup: "hook", tension: "turn", "name-reveal": "turn", contrast: "turn", emotion: "turn", breath: "turn", payoff: "turn", demo: "proof", feature: "proof", number: "proof", list: "proof", lockup: "cta", ending: "cta" };
const CONTENT_ALIAS = { "product-ui": "ui", screen: "ui", word: "type", phrase: "type", sentence: "type", question: "type", text: "type", typography: "type", counter: "number", stat: "number", mark: "logo", wordmark: "logo", "three-d": "3d", "abstract-idea": "abstract", none: "abstract", person: "photo" };
const STOP = new Set("the a an and or of to in on for with is are be it this that you your we our i my at by as from into than then when do does not no".split(" "));
const toks = (s) => (String(s || "").toLowerCase().match(/[a-z0-9]+/g) || []).filter((t) => !STOP.has(t) && t.length > 1);

export function loadRows(file = LIB) {
  const rows = [];
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const r = JSON.parse(line);
    if (!r._meta) rows.push(r);
  }
  return rows;
}
export function normBeat(b) { if (b == null) return null; const k = String(b).toLowerCase(); const v = BEAT_ALIAS[k] || k; if (!BEATS.includes(v)) throw new Error(`--beat must be one of ${BEATS.join(", ")} (or an alias such as problem, claim, demo, feature, lockup); got "${b}"`); return v; }
export function normContent(c) { if (c == null) return null; const k = String(c).toLowerCase(); const v = CONTENT_ALIAS[k] || k; if (!CONTENTS.includes(v)) throw new Error(`--content must be one of ${CONTENTS.join(", ")}; got "${c}"`); return v; }
const mech = (r) => (Array.isArray(r.mechanic) ? r.mechanic : r.mechanic ? [r.mechanic] : []);
const textOf = (r) => [r.rule, r.why, r.title, mech(r).join(" "), (r.tags || []).join(" "), (r.content || []).join(" ")].filter(Boolean).join(" ");

export function rank(rows, { beat = null, content = null, q = "" } = {}) {
  const docs = rows.map((r) => new Set(toks(textOf(r))));
  const df = new Map();
  for (const d of docs) for (const t of d) df.set(t, (df.get(t) || 0) + 1);
  const n = rows.length, qt = new Set(toks(q));
  return rows.map((r, i) => {
    let s = 0;
    if (beat && r.beat === beat) s += 3;
    if (content && r.content && r.content.length) { if (r.content[0] === content) s += 2; else if (r.content.includes(content)) s += 1; }
    if (qt.size) { let a = 0; for (const t of qt) if (docs[i].has(t)) a += Math.log(1 + n / (1 + (df.get(t) || 0))); s += Math.min(4, a * 0.6); }
    if (r.src === "rule") s += 0.8; else if (r.src === "hf") s += 0.4;
    return { s, r };
  }).sort((a, b) => b.s - a.s || String(a.r.id).localeCompare(String(b.r.id)));
}

export function precedent({ beat, content, q, limit = 6, file } = {}) {
  const b = normBeat(beat), c = normContent(content);
  if (!b && !c && !String(q || "").trim()) throw new Error("precedent needs at least one of --beat, --content, --q");
  const rows = loadRows(file);
  const picked = [], seen = new Set();
  for (const { s, r } of rank(rows, { beat: b, content: c, q })) {
    const key = r.src === "lib" && r.film ? r.film : r.id; // one row per film
    if (seen.has(key)) continue;
    seen.add(key); picked.push({ s, r });
    if (picked.length >= Math.max(1, limit)) break;
  }
  const kind = { rule: "designer rule", hf: "study moment", lib: "film rule" };
  return {
    ok: true, beat: b, content: c, q: q || null, total: rows.length, provenance: PROVENANCE,
    results: picked.map(({ s, r }) => ({ id: r.id, kind: kind[r.src] || r.src, score: Math.round(s * 10) / 10, beat: r.beat, content: r.content || [], mechanic: mech(r), text: r.rule || r.why || r.title || "", provenance: PROVENANCE })),
  };
}
export function formatHints(p) {
  const out = [`precedent: beat=${p.beat || "-"} content=${p.content || "-"}${p.q ? ` q="${p.q}"` : ""}: top ${p.results.length} of ${p.total} rows`];
  for (const r of p.results) out.push(`- ${r.id} [${r.beat} . ${r.content.join(",")}] ${r.kind}, score ${r.score}${r.mechanic.length ? `, mechanic ${r.mechanic.join("+")}` : ""}\n    ${r.text}\n    (${p.provenance})`);
  out.push("Take the rule and its why, not the technique name. Never let a row outrank a measured number in references/ or the user's verdicts.");
  return out.join("\n");
}
