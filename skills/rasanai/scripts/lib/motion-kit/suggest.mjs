// Deterministic scoring of catalog items for a scene. No randomness: a seed only breaks exact ties.
import fs from "node:fs";

const STOP = new Set(["the", "and", "for", "with", "this", "that", "not"]);
const toks = (s) => String(s || "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));
const MOTION_WORDS = ["snappy", "smooth", "elastic", "springy", "bouncy", "calm", "slow", "editorial", "precise", "swiss", "playful", "cinematic", "soft", "kinetic", "punchy", "minimal", "bold", "gentle", "energetic"];

function fnv(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; }

// Reads brand motion language words from a DESIGN.md / motion.md (read-only).
export function brandMotion(file) {
  if (!file) return { words: [], source: null };
  const text = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  const fm = text.match(/^---\n([\s\S]*?)\n---\n?/);
  const sec = text.match(/^#{1,3}[^\n]*motion[^\n]*\n([\s\S]*?)(?=^#{1,3} |$(?![\s\S]))/im);
  const hay = ((fm ? fm[1] : "") + "\n" + (sec ? sec[1] : text.slice(0, 4000))).toLowerCase();
  return { words: MOTION_WORDS.filter((w) => hay.includes(w)), source: file };
}

function durationRange(item) {
  const p = item.params || {};
  const d = p.duration || p.duration_s || p.dur;
  return d && d.type === "number" && typeof d.min === "number" && typeof d.max === "number" ? [d.min, d.max] : null;
}

// scene: {role,family,duration_s,mood,aspect,assets:[],prev:{id,family}|null}
export function scoreItem(item, scene, brand) {
  let score = 50;
  const why = [], reject = [];
  if (scene.role) {
    if (item.role === scene.role) { score += 30; why.push(`fills the ${scene.role} role`); }
    else { score -= 40; reject.push(`its role is ${item.role}, not ${scene.role}`); }
  }
  if (scene.family) {
    if (item.family === scene.family) { score += 15; why.push(`${item.family} family as asked`); }
    else score -= 10;
  }
  const dur = Number(scene.duration_s);
  if (Number.isFinite(dur) && dur > 0) {
    const r = durationRange(item);
    if (r) {
      if (dur >= r[0] && dur <= r[1]) { score += 10; why.push(`runs ${r[0]}-${r[1]}s, fits the ${dur}s beat`); }
      else { score -= 15; reject.push(`beat is ${dur}s but it runs ${r[0]}-${r[1]}s`); }
    } else if (dur < 1 && item.role === "scene") { score -= 10; reject.push("beat under 1s is too short for a full-scene mechanic"); }
  }
  const have = new Set((scene.assets || []).map(String));
  const need = item.requires_assets || [];
  if (need.length) {
    const missing = need.filter((a) => !have.has(a));
    if (!missing.length) { score += 8; why.push("the scene has the assets it needs"); }
    else { score -= 30; reject.push(`missing assets: ${missing.join(", ")}`); }
  }
  if (scene.aspect) {
    const vertical = scene.aspect === "9:16" || scene.aspect === "4:5";
    const use = String(item.use_when).toLowerCase(), avoid = String(item.avoid_when).toLowerCase();
    if (vertical && /(vertical|portrait|9:16)/.test(avoid)) { score -= 20; reject.push(`avoid_when flags ${scene.aspect}: ${item.avoid_when}`); }
    else if (vertical && /(vertical|portrait|9:16)/.test(use)) { score += 6; why.push("called out for vertical frames"); }
    else if (!vertical && /(landscape|16:9|wide)/.test(use)) { score += 4; why.push("suited to wide frames"); }
    if (!vertical && /(landscape|16:9)/.test(avoid) === false && /(vertical-only|portrait-only)/.test(use)) { score -= 20; reject.push("written for vertical frames only"); }
  }
  if (scene.mood) {
    const mt = new Set(toks(scene.mood));
    const ht = new Set(toks(`${item.label} ${item.summary} ${item.use_when} ${(item.motion_inputs || []).join(" ")}`));
    const hit = [...mt].filter((w) => ht.has(w)).sort();
    if (hit.length) { score += Math.min(12, 6 * hit.length); why.push(`mood match: ${hit.join(", ")}`); }
    const at = new Set(toks(item.avoid_when));
    const bad = [...mt].filter((w) => at.has(w)).sort();
    if (bad.length) { score -= 12; reject.push(`avoid_when mentions ${bad.join(", ")}`); }
  }
  if (brand && brand.words.length) {
    const ht = `${item.summary} ${item.use_when} ${item.label} ${(item.brand_inputs || []).join(" ")} ${(item.motion_inputs || []).join(" ")}`.toLowerCase();
    const hit = brand.words.filter((w) => ht.includes(w));
    if (hit.length) { score += Math.min(10, 5 * hit.length); why.push(`matches brand motion language (${hit.join(", ")})`); }
    const av = String(item.avoid_when).toLowerCase();
    const bad = brand.words.filter((w) => av.includes(w));
    if (bad.length) { score -= 10; reject.push(`avoid_when conflicts with brand language (${bad.join(", ")})`); }
  }
  if (scene.prev) {
    if (scene.prev.id === item.id) { score -= 40; reject.push("same mechanic as the previous beat"); }
    else if (scene.prev.family === item.family) { score -= 25; reject.push(`same family (${item.family}) as the previous beat`); }
    else { score += 3; why.push("changes family from the previous beat"); }
  }
  if (item.avoid_when && !reject.includes(item.avoid_when)) reject.push(item.avoid_when);
  return { score, why, reject };
}

export function suggest(items, scene, { brand = null, seed = 0, limit = 5 } = {}) {
  let prev = null;
  if (scene.prev) {
    const p = items.find((i) => i.id === scene.prev);
    prev = p ? { id: p.id, family: p.family } : { id: scene.prev, family: String(scene.prev).replace(/-.*$/, "") };
  }
  const sc = { ...scene, prev };
  const ranked = items.map((it) => ({ it, ...scoreItem(it, sc, brand), tie: fnv(`${seed}:${it.id}`) }));
  ranked.sort((a, b) => b.score - a.score || a.tie - b.tie || (a.it.id < b.it.id ? -1 : 1));
  return ranked.slice(0, Math.max(3, Math.min(5, limit))).map((r, i) => ({
    rank: i + 1, id: r.it.id, version: r.it.version, annotation: `motion-kit:${r.it.id}@${r.it.version}`,
    label: r.it.label, family: r.it.family, role: r.it.role, score: r.score,
    why: r.why.length ? r.why.join("; ") : "general fit; no strong signal either way",
    reject_if: r.reject.join("; "),
  }));
}
