#!/usr/bin/env node
// Story: the concept engine. Keeps every film from telling the default launch story
// (hook -> problem -> "Introducing X" -> 3 features -> CTA) by starting from the product's truth,
// sampling narrative devices that differ from each other, and gating pitches against the cliche arc.
//   node story.mjs truth --out <truth.md> [--product "<name>"]
//        -> writes the truth-sheet template for Claude to fill (transformation, emotional truth, enemy,
//           the product's own objects/formats/words, proof, audience, the cliche version to avoid)
//   node story.mjs devices [--family f] [--fits <tag>] [--q "<text>"] [--id <id>] [--overused|--fresh]
//        -> list / search the device catalog (taxonomy/devices.json); --id prints one device in full
//   node story.mjs cliche
//        -> the default arc's 8 beats, stock openers, overused devices and visual cliches
//   node story.mjs pick --truth <truth.md|truth.json> [--count 3] [--seed s] [--recent ids] [--exclude ids]
//        [--like id] [--format launch|explainer|brand|social] [--tone t] [--product-first | --allow-conceit] [--shape ladder|scenario] [--feature <name>]
//        -> three devices ("Sure", "Bold", "Wild") that differ on >= 5 of 7 axes, with different family,
//           protagonist and visual world; each with beats, pitfalls, an example and native material to fuse
//           with. Deterministic for a seed (default seed: product name + today's date).
//           For launch / promo / brand films the structure is a LADDER (shape ladder: a refrain verb, one rung per distinct everyday use, escalating) unless one feature is named (--feature, or a truth-sheet feature) -> shape scenario; --shape forces either.
//           Launch / promo / product films (format launch, or --product-first) are PRODUCT-FIRST: conceit devices
//           (museums, allegories, invented worlds, extended metaphors, cover versions) are never offered.
//   node story.mjs check --pitch <pitch.json | pitches.json> [--truth <truth.md|json>] [--footage] [--length <s>] [--narrated] [--product-first | --allow-conceit] [--brand-film <grammar.json>] [--calm]
//        -> the rubric: 6 pass/fail gates (+ G7 product-first for launch / promo / product films, + G10 shape-aware: `shape` ladder (refrain verb, 3-8 rungs by length, distinct uses, increasing levels, a real UI cause and effect per rung, a close) or scenario (one feature, one task), + G8 the aim: takeaway, feel, action, approach, a title that names the idea, + G9 tempo for the same films: ideas per length, a change every ~2.5 s, hold limits, the brand's measured tempo with --brand-film) + the weighted 1-5 score (ship at >= 3.8, no dimension < 3).
//           Exit 0 = ship, 2 = rewrite (reasons in the JSON), 1 = bad input.
//   node story.mjs validate
//        -> checks devices.json against its schema (vocabularies, ids, counts)
// Pitch format: references/story.md. Catalog schema: taxonomy/devices-SCHEMA.md.
import fs from "node:fs";
import path from "node:path";
import { parseArgs, die, readJSON, writeFile, SKILL_DIR } from "./lib/common.mjs";
import { track } from "./lib/report.mjs";

const args = parseArgs();
const cmd = args._[0];
track(
  { pick: "Picking three story devices that differ from each other", check: "Checking the pitches against the cliche arc" }[cmd],
  { pick: "Three story devices picked: Sure, Bold and Wild", check: "Pitches checked" }[cmd]
);
const CATALOG_PATH = path.join(SKILL_DIR, "taxonomy", "devices.json");
const CAT = readJSON(CATALOG_PATH);
const DEVICES = CAT.devices;
const AXES = Object.keys(CAT.axes);
const out = (o) => console.log(JSON.stringify(o, null, 2));
const list = (v) => (v == null || v === true ? [] : String(v).split(",").map((s) => s.trim()).filter(Boolean));
const norm = (s) => String(s || "").toLowerCase();
const HOUSE_CHANGE_EVERY_S = 2.5; // house tempo: something meaningful changes on screen at least this often
const r1d = (x) => Math.round(x * 10) / 10;
const TITLE_STOP = ["just", "the", "a", "an", "can", "to", "of", "and", "you", "your", "with", "for"];
const nz8 = (x) => String(x || "").toLowerCase().replace(/-/g, " ").replace(/[^a-z0-9' ]/g, "").replace(/\s+/g, " ").trim();

// a device by id, research code ("A5") or name
function findDevice(key) {
  const k = norm(key).trim();
  return DEVICES.find((d) => d.id === k || norm(d.code) === k || norm(d.name) === k) || null;
}

// --- seeded randomness ---------------------------------------------------------
function hashSeed(s) {
  let h = 2166136261 >>> 0;
  for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
}
function rng(seed) {
  let a = hashSeed(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function weightedSample(pool, k, rand) {
  const items = pool.filter((p) => p.w > 0).slice();
  const picked = [];
  while (picked.length < k && items.length) {
    const total = items.reduce((s, p) => s + p.w, 0);
    let r = rand() * total;
    let i = 0;
    for (; i < items.length - 1; i++) if ((r -= items[i].w) <= 0) break;
    picked.push(items.splice(i, 1)[0]);
  }
  return picked;
}

// --- the truth sheet -----------------------------------------------------------
// Each section: its heading, the key it parses to, whether it's a list, and the hint Claude sees.
const TRUTH = [
  { h: "Product", key: "product", fields: ["name", "does"], hint: "name: <product name>\ndoes: <what it does, one plain sentence>" },
  { h: "Tags", key: "tags", list: true, hint: `- <product-type tags from: ${CAT.tags.products.filter((t) => t !== "any").join(", ")}>` },
  { h: "Format", key: "format", fields: ["format", "length", "aspect"], hint: "format: <launch | explainer | brand | social>\nlength: <seconds, e.g. 30>\naspect: <16:9 | 9:16 | 1:1>" },
  { h: "Tone", key: "tone", list: true, hint: `- <one or two of: ${CAT.tags.tones.join(", ")}>` },
  { h: "Audience", key: "audience", hint: "<who watches, where, what they already know and believe>" },
  { h: "Transformation", key: "transformation", hint: "from <the before, in the audience's words> to <the after>" },
  { h: "Emotional truth", key: "emotional_truth", hint: "<the feeling under the task: the small shame, fear, longing or relief; not a feature>" },
  { h: "Enemy", key: "enemy", list: true, hint: "- <the villain: a thing, a habit, a phrase, a deadline>" },
  { h: "Native objects", key: "objects", list: true, min: 8, hint: "- <at least 8 physical or digital objects, sounds and details from the product's world, as specific as possible>" },
  { h: "Native formats", key: "forms", list: true, min: 5, hint: "- <at least 5 document or media formats that exist in this world (a receipt, a changelog, a status page, a calendar invite)>" },
  { h: "Native words", key: "words", list: true, min: 3, hint: "- <the product's exact words: UI labels, button text, jargon, error messages, the name itself. Copy them from the site or screenshots; never invent them>" },
  { h: "Proof", key: "proof", list: true, hint: "- <each claim the film may make, with its source: \"Sorts a receipt in 2 s (site, /features)\". Only what is true>" },
  { h: "Surprising facts", key: "facts", list: true, hint: "- <at least one non-obvious truth about the product or its world, with its source>" },
  { h: "Must-show features", key: "features", list: true, hint: "- <at most 3; each will live inside the device, not in a list>" },
  { h: "Assets", key: "assets", list: true, hint: "- <what exists: screenshots, logo, UI captures, footage, product sounds, real data>" },
  { h: "Competitors", key: "competitors", list: true, hint: "- <1-3 names, for the swap test>" },
  { h: "The cliche version", key: "cliche", list: true, hint: "- <write the default-arc version in 6 lines (hook stat -> problem montage -> \"Introducing X\" -> feature 1/2/3 -> CTA). This is what the pitches must not be>" },
];

function truthTemplate(product) {
  const secs = TRUTH.map((s) => `## ${s.h}\n\n${s.hint}\n`).join("\n");
  return `# Truth sheet${product ? `: ${product}` : ""}

> Fill every section before any concept. Specificity comes from here: real objects, real words, real numbers.
> Replace each <placeholder>; lines still in <angle brackets> are ignored. Never invent claims, numbers or UI labels:
> anything the film shows as fact must be in Proof or Native words with a source.

${secs}`;
}

const headKey = (s) => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
// a line still holding a template placeholder ("<product name>", "from <the before> to <the after>") is unfilled
const isPlaceholder = (s) => /<[a-z][^<>]*\s[^<>]*>/i.test(s) || /^(todo|tbd|\.\.\.)$/i.test(s.trim()) || !s.trim();

function parseTruthMd(text) {
  const t = {};
  const sections = {};
  let cur = null;
  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    const m = raw.match(/^##\s+(.+?)\s*$/);
    if (m) {
      const h = headKey(m[1]);
      const spec = TRUTH.find((s) => h === headKey(s.h) || h.startsWith(headKey(s.h)));
      cur = spec ? spec.key : null;
      if (cur) sections[cur] = [];
      continue;
    }
    if (!cur || /^\s*>/.test(raw) || /^#\s/.test(raw)) continue;
    const line = raw.replace(/^\s*[-*]\s+/, "").replace(/^\s*\d+[.)]\s+/, "").trim();
    if (!isPlaceholder(line)) sections[cur].push(line);
  }
  for (const s of TRUTH) {
    const lines = sections[s.key] || [];
    if (s.fields) {
      const o = {};
      for (const l of lines) {
        const f = l.match(/^([a-z_ ]+):\s*(.*)$/i);
        if (f && !isPlaceholder(f[2])) o[norm(f[1]).trim()] = f[2].trim();
      }
      t[s.key] = o;
    } else if (s.list) t[s.key] = lines;
    else t[s.key] = lines.join(" ");
  }
  return t;
}

function loadTruth(p) {
  if (!p || p === true) return null;
  const f = path.resolve(String(p));
  if (!fs.existsSync(f)) die(`truth sheet not found: ${f}`);
  const text = fs.readFileSync(f, "utf8");
  let t;
  if (/\.json$/i.test(f)) {
    t = JSON.parse(text);
    if (typeof t.product === "string") t.product = { name: t.product };
    if (typeof t.format === "string") t.format = { format: t.format };
    for (const s of TRUTH) if (s.list && typeof t[s.key] === "string") t[s.key] = [t[s.key]];
  } else t = parseTruthMd(text);
  for (const s of TRUTH) if (s.list && !Array.isArray(t[s.key])) t[s.key] = [];
  t.product = t.product || {};
  t.format = t.format || {};
  return t;
}

function truthGaps(t) {
  const gaps = [];
  if (!t.product.name) gaps.push("Product: no name");
  for (const k of ["transformation", "emotional_truth"]) if (!String(t[k] || "").trim()) gaps.push(`${TRUTH.find((s) => s.key === k).h}: empty`);
  for (const s of TRUTH.filter((x) => x.list)) {
    const n = t[s.key].length;
    if (s.min && n < s.min) gaps.push(`${s.h}: ${n} of at least ${s.min}`);
    else if (!s.min && !n && ["enemy", "proof", "cliche", "competitors"].includes(s.key)) gaps.push(`${s.h}: empty`);
  }
  return gaps;
}

// the lookup phrase of a native item: "thermal receipt (fades to blank)" -> "thermal receipt"
const itemKey = (s) => norm(s).split(/\s[(—-]\s?|[(:;,]/)[0].replace(/["'`]/g, "").trim();
function mentions(text, item) {
  const k = itemKey(item);
  if (!k || k.length < 3) return false;
  const tx = norm(text);
  if (tx.includes(k)) return true;
  // else its most distinctive word (the longest, 5+ letters), as a whole word or plural
  const head = k.split(/\s+/).filter((w) => /^[a-z]{5,}$/.test(w)).sort((a, b) => b.length - a.length)[0];
  return !!head && new RegExp(`\\b${head}(s|es)?\\b`).test(tx);
}


// --- launch-film structure (references/launch-film.md section 1): hook, reveal/hero, 2-4 uses, payoff, end card ----
// One idea per beat, plain words, the product or brand in every beat. Ranges are the template tables widened by about a
// quarter, per film length bucket (15 / 30 / 60 / 90 s). Tempo: the templates carry the house idea counts and holds (G9 below). role: beat.role, else its name, else its place (first = hook, last = cta).
const LF_RANGES = {
  15: { hook: [1, 2.5], statement: [1.5, 3], hero: [2.5, 4.5], demo: [1.5, 3], payoff: [1, 2.5], cta: [2, 4] },
  30: { hook: [1, 2.5], statement: [1.5, 4], hero: [3, 5], demo: [2, 4.5], payoff: [2, 4], cta: [2.5, 5] },
  60: { hook: [1.5, 4], statement: [2, 5], hero: [4, 6], demo: [3, 6.5], payoff: [3, 7], cta: [3, 7] },
  90: { hook: [2, 5], statement: [2.5, 6], hero: [5, 7.5], demo: [4, 8], payoff: [4, 10], cta: [3, 8] },
};
const lfBucket = (len) => (len <= 22 ? 15 : len <= 45 ? 30 : len <= 75 ? 60 : 90);
// One feature, one scenario (G10): hook = the viewer's before, proof = the task done in the real UI (the longest beat),
// turn = the after and the brand reveal, cta = one action. Its own timing ranges per length bucket.
const SC_RANGES = {
  15: { hook: [1, 3.5], proof: [3, 8], turn: [1.5, 4.5], cta: [1.5, 4] },
  30: { hook: [1.5, 6], proof: [4, 15], turn: [2.5, 6.5], cta: [2, 5.5] },
  60: { hook: [2, 8], proof: [8, 32], turn: [3, 10], cta: [3, 7] },
  90: { hook: [2, 10], proof: [12, 50], turn: [4, 14], cta: [3, 8] },
};
const uiOf = (b) => (Array.isArray(b.ui) ? b.ui.filter((u) => String(u || "").trim()) : []);
const isScenario = (p, beats) => !!(p.feature && typeof p.feature === "object") || beats.some((b) => /^(proof|turn)$/i.test(String(b.role || "")));
// Story shape: "ladder" (a refrain verb, one rung per distinct everyday use, escalating) or "scenario" (one feature, one viewer, one task).
// Explicit p.shape wins; else a feature block or proof/turn beats mean scenario; a refrain or open/rung beats mean ladder; else "legacy" (the older hook/hero/demo/payoff structure, held to the scenario G10).
const shapeOf = (p, beats) => { const s = norm(p.shape).trim(); return s === "ladder" || s === "scenario" ? s : isScenario(p, beats) ? "scenario" : p.refrain || beats.some((b) => /^(open|rung|ways_in)$/i.test(String(b.role || ""))) ? "ladder" : "legacy"; };
const LADDER_ROLES = ["open", "rung", "ways_in", "close"];
// rungs per film length: <= 35 s 3-4, 36-60 s 4-6, > 60 s 6-8
const rungRange = (len) => (len <= 35 ? [3, 4] : len <= 60 ? [4, 6] : [6, 8]);
const USE_STOP = new Set(["the", "a", "an", "of", "for", "to", "and", "in", "on", "at", "your", "my", "with", "it", "its", "from", "by", "or", "as", "is", "this", "that", "some", "new", "find", "get", "make", "plan", "book", "buy", "shop", "ask", "do", "see", "show", "build", "write", "check", "compare", "choose", "pick", "use", "look", "up", "out", "me", "you", "go", "try", "start", "finish", "done"]);
const stem = (w) => w.replace(/(ies)$/, "y").replace(/(es|s)$/, (m, g, off, str) => (str.length > 4 ? "" : m));
const useNouns = (u) => new Set(nz8(u).split(" ").filter((w) => w.length >= 3 && !USE_STOP.has(w)).map(stem));
function lfRole(b, i, n, hero) {
  const r = String(b.role || "").toLowerCase();
  if (r === "proof" || r === "turn" || LADDER_ROLES.includes(r)) return r;
  if (LF_RANGES[15][r]) return r;
  const nm = String(b.name || "").toLowerCase();
  if (i === 0) return "hook";
  if (i === n - 1) return "cta";
  if (/\b(hero|reveal)\b/.test(nm) || b.value === true && !/use/.test(nm) || (hero && hero.beat === i + 1)) return "hero";
  if (/\b(payoff|resolve|button)\b/.test(nm)) return "payoff";
  if (/\b(statement|promise|line|principle)\b/.test(nm)) return "statement";
  return "demo";
}

// --- product-first routes (launch, promo, product videos) ----------------------------
// Real launch films (Apple, OpenAI, Linear, Raycast, Arc, Notion) are product-led: the real UI is the hero from
// the first second. Conceit devices (a museum of the old way, an allegory, an invented world, a cover version)
// are never offered for these routes; an instant visual pun that resolves to the product in a second is a pitch
// detail (`visual_pun`), not a device.
const PF_CONTAINER_OK = new Set(["query-log", "chat-thread", "interface-world"]);
const PF_BANNED_IDS = new Set(["cosmos-zoom", "object-pov", "unexpected-protagonist", "letter-from-future", "mockumentary", "product-as-character", "problem-villain", "inner-monologue", "letter-to-someone", "mirror", "one-shape", "sound-first", "data-letter", "story-loop"]);
const pfBanned = (d) => d.family === "metaphor" || (d.family === "container" && !PF_CONTAINER_OK.has(d.id)) || PF_BANNED_IDS.has(d.id);
const CONCEIT_RE = /\b(museums?|galler(?:y|ies)|exhibit(?:s|ion|ions)?|plinths?|under glass|dioramas?|parables?|fables?|allegor\w*|cover version|invented world|a world where|time capsule|archaeolog\w*|courtroom|trial of|funeral|obituary|eulogy|haunted|safari|odyssey|kingdom|ancient ruins?|natural history)\b/i;
const isProductFirst = (format, args) => !args["allow-conceit"] && (!!args["product-first"] || ["launch", "promo", "product"].includes(format));

// --- device scoring and distance ------------------------------------------------
const distance = (a, b) => AXES.filter((k) => a.axes[k] !== b.axes[k]).length;
const hardDiffer = (a, b) => a.axes.family !== b.axes.family && a.axes.protagonist !== b.axes.protagonist && a.axes.visual_world !== b.axes.visual_world;
const trioOk = (trio) => trio.every((a, i) => trio.every((b, j) => j <= i || (distance(a, b) >= 5 && hardDiffer(a, b))));
const BUILD_W = { 5: 1.1, 4: 1, 3: 0.8, 2: 0.4, 1: 0.15 };

function weigh(d, ctx) {
  const why = [];
  let w = 1;
  if (d.family === "container") { w *= 1.5; why.push("borrowed container x1.5"); }
  if (d.family === "metaphor") { w *= 1.3; why.push("metaphor x1.3"); }
  if (d.overused) { w *= 0.3; why.push("LLM-overused x0.3"); }
  if (ctx.recent.has(d.id)) { w *= 0.15; why.push("used recently x0.15"); }
  const prods = d.fits.products;
  if (ctx.tags.length) {
    if (prods.some((p) => ctx.tags.includes(p))) { w *= 1.5; why.push("fits the product x1.5"); }
    else if (prods.includes("any")) w *= 1.1;
    else { w *= 0.8; why.push("product fit weak x0.8"); }
  }
  if (ctx.format) {
    if (d.fits.formats.includes(ctx.format)) w *= 1.3;
    else { w *= 0.5; why.push(`not a ${ctx.format} format x0.5`); }
  }
  if (ctx.tones.length && d.fits.tones.some((t) => ctx.tones.includes(t))) { w *= 1.3; why.push("tone match x1.3"); }
  let bw = BUILD_W[d.build.score] ?? 1;
  if (d.needs === "footage" && ctx.footage) bw = 1; // footage supplied: the founder monologue is buildable
  if (bw !== 1) why.push(`buildability ${d.build.score}/5 x${bw}`);
  w *= bw;
  if (ctx.like && ctx.like.id !== d.id && AXES.filter((k) => ctx.like.axes[k] === d.axes[k]).length >= 3) { w *= 2; why.push(`like ${ctx.like.id} x2`); }
  return { w: Math.round(w * 1000) / 1000, why };
}

// Sure = the clearest, most buildable; Wild = the furthest reach; Bold = the one in between
function ladder(trio) {
  const sure = trio.slice().sort((a, b) => (b.d.build.score - b.d.ambition * 0.6 + (["container", "rhetoric"].includes(b.d.family) ? 0.5 : 0)) - (a.d.build.score - a.d.ambition * 0.6 + (["container", "rhetoric"].includes(a.d.family) ? 0.5 : 0)) || a.d.id.localeCompare(b.d.id))[0];
  const rest = trio.filter((x) => x !== sure);
  const wild = rest.slice().sort((a, b) => (b.d.ambition - b.d.build.score * 0.3) - (a.d.ambition - a.d.build.score * 0.3) || a.d.id.localeCompare(b.d.id))[0];
  const bold = rest.find((x) => x !== wild);
  return [{ ...sure, label: "Sure" }, { ...bold, label: "Bold" }, { ...wild, label: "Wild" }];
}

const LABEL_MEANING = {
  Sure: "high feasibility, reads instantly: the safe recommendation",
  Bold: "high originality, still on the brief",
  Wild: "the reach: might be the best film, might not work",
};

// --- the cliche detector ---------------------------------------------------------
const CL = CAT.cliche;
function beatText(b) { return [b.name, b.on_screen, b.visual].filter(Boolean).join(" • "); }
const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// a signal matches at a word start ("hud" never matches "should"); stems like "frustrat" still match "frustrated"
const hasSignal = (text, sig) => (/^[a-z]/i.test(sig) ? new RegExp(`(^|[^a-z])${esc(sig.toLowerCase())}`).test(text) : text.includes(sig.toLowerCase()));
function detectDefaultBeat(b, i, n) {
  const all = norm(beatText(b)); // name + on screen + visual
  const said = norm([b.name, b.on_screen].filter(Boolean).join(" \u2022 ")); // what the beat is and what the viewer reads
  const hit = (id, t = said) => CL.beats.find((x) => x.id === id).signals.some((s) => hasSignal(t, s));
  if (hit("intro-reveal")) return "intro-reveal";
  if (hit("social-proof")) return "social-proof";
  if (i >= n - 2 && hit("cta")) return "cta";
  if (/\bfeatures?\b|\bbenefits?\b|capabilit/.test(said)) return "feature";
  if (i === 0 && (hit("hook-stat", all) || /^\s*\d[\d,.]*\s*%/.test(norm(b.on_screen)) || /\?\s*$/.test(String(b.on_screen || "").trim()))) return "hook-stat";
  if (i <= 2 && hit("problem-montage", all)) return "problem-montage";
  return "none";
}
// longest run of default beats appearing in the default order (a longest increasing subsequence)
function inOrder(nums) {
  const best = [];
  for (let i = 0; i < nums.length; i++) {
    best[i] = 1;
    for (let j = 0; j < i; j++) if (nums[j] < nums[i]) best[i] = Math.max(best[i], best[j] + 1);
  }
  return nums.length ? Math.max(...best) : 0;
}
function clicheMap(beats) {
  const n = beats.length;
  let featureN = 4;
  return beats.map((b, i) => {
    const declared = b.maps_to && b.maps_to !== "none" ? String(b.maps_to) : null;
    let det = detectDefaultBeat(b, i, n);
    let id = declared || det;
    if (id === "feature" || /^feature/.test(id)) { id = `feature-${Math.min(featureN, 6) - 3}`; featureN++; }
    const beat = CL.beats.find((x) => x.id === id);
    return { beat: i + 1, name: b.name, default_beat: beat ? beat.id : "none", n: beat ? beat.n : null, source: declared ? "declared" : det !== "none" ? "detected" : null };
  });
}
function visualCliches(texts) {
  const t = norm(texts.join(" • "));
  return CL.visuals.filter((v) => v.signals.some((s) => hasSignal(t, s))).map((v) => v.name);
}

// --- commands -------------------------------------------------------------------
if (cmd === "truth") {
  if (!args.out || args.out === true) die("--out <truth.md> required");
  const f = path.resolve(String(args.out));
  if (fs.existsSync(f) && !args.force) die(`${f} exists (pass --force to overwrite)`);
  writeFile(f, truthTemplate(args.product && args.product !== true ? String(args.product) : ""));
  out({ ok: true, truth: f, sections: TRUTH.map((s) => s.h), next: `Fill it (every <placeholder>), then: node story.mjs pick --truth ${path.basename(f)}` });
} else if (cmd === "devices") {
  if (args.id) {
    const d = findDevice(args.id);
    if (!d) die(`unknown device "${args.id}". List: node story.mjs devices`);
    out(d);
  } else {
    let ds = DEVICES;
    if (args.family) {
      const f = norm(args.family);
      ds = ds.filter((d) => d.family === f || norm(CAT.families[d.family].code) === f);
      if (!ds.length) die(`unknown family "${args.family}". Families: ${Object.entries(CAT.families).map(([k, v]) => `${k} (${v.code})`).join(", ")}`);
    }
    if (args.fits) {
      const tags = list(args.fits).map(norm);
      ds = ds.filter((d) => tags.every((t) => [...d.fits.products, ...d.fits.tones, ...d.fits.formats].includes(t)));
    }
    if (args.overused) ds = ds.filter((d) => d.overused);
    if (args.fresh) ds = ds.filter((d) => !d.overused);
    if (args.q) {
      const words = norm(args.q).split(/\s+/).filter(Boolean);
      ds = ds.filter((d) => {
        const hay = norm([d.id, d.code, d.name, d.what, d.example, d.seen_in, ...d.fits.products, ...d.fits.tones, ...Object.values(d.axes)].join(" "));
        return words.every((w) => hay.includes(w));
      });
    }
    out({
      count: ds.length,
      devices: ds.map((d) => ({ id: d.id, code: d.code, name: d.name, family: d.family, what: d.what, build: d.build.score, overused: d.overused || undefined, fits: [...d.fits.products, ...d.fits.formats].join(", ") })),
      hint: "Full entry: node story.mjs devices --id <id>",
    });
  }
} else if (cmd === "cliche") {
  out({ ...CL, overused_devices: CL.overused_devices.map((id) => ({ id, name: findDevice(id)?.name })) });
} else if (cmd === "pick") {
  const truth = loadTruth(args.truth);
  if (!truth) die("--truth <truth.md|truth.json> required (write one with: node story.mjs truth --out truth.md)");
  const gaps = truthGaps(truth);
  const filled = truth.objects.length + truth.forms.length + (truth.transformation ? 1 : 0) + (truth.emotional_truth ? 1 : 0);
  if (filled < 4) die(`the truth sheet is still empty (fill it first):\n- ${gaps.join("\n- ")}`);
  const count = Math.max(1, Math.min(3, Number(args.count || 3)));
  const format = norm(args.format && args.format !== true ? args.format : truth.format.format || "").trim() || null;
  if (format && !CAT.tags.formats.includes(format)) die(`unknown format "${format}". Use: ${CAT.tags.formats.join(", ")}`);
  const tones = (args.tone && args.tone !== true ? list(args.tone) : truth.tone).map(norm).filter((t) => CAT.tags.tones.includes(t));
  const tags = truth.tags.map(norm).filter((t) => CAT.tags.products.includes(t));
  const like = args.like ? findDevice(args.like) : null;
  if (args.like && !like) die(`unknown device for --like: "${args.like}"`);
  const recentIds = list(args.recent).map((r) => findDevice(r)?.id).filter(Boolean);
  const exclude = new Set(list(args.exclude).map((r) => findDevice(r)?.id).filter(Boolean));
  const footage = !!args.footage || truth.assets.some((a) => /footage|video of|founder on camera/i.test(a));
  const seed = args.seed && args.seed !== true ? String(args.seed) : `${truth.product.name || "product"}|${new Date().toISOString().slice(0, 10)}`;
  const rand = rng(seed);
  const ctx = { recent: new Set(recentIds), tags, format, tones, like, footage };
  const productFirst = isProductFirst(format, args);
  // launch / promo / brand films are ladders unless the brief or research names ONE feature to sell (--shape or --feature, or truth.feature)
  const oneFeature = !!(args.feature && args.feature !== true) || !!(truth.feature && (typeof truth.feature !== "object" || truth.feature.name || Object.keys(truth.feature).length) );
  const shape = args.shape === "ladder" || args.shape === "scenario" ? args.shape : (productFirst || ["launch", "promo", "brand"].includes(format)) ? (oneFeature ? "scenario" : "ladder") : null;
  const scored = DEVICES.filter((d) => !exclude.has(d.id) && !(productFirst && pfBanned(d))).map((d) => ({ d, ...weigh(d, ctx) }));

  // candidates: at least one per family, two from the containers and metaphors, then three more from anywhere
  const fams = Object.keys(CAT.families);
  let cands = [];
  for (const f of fams) cands.push(...weightedSample(scored.filter((s) => s.d.family === f), f === "container" || f === "metaphor" ? 2 : 1, rand));
  cands.push(...weightedSample(scored.filter((s) => !cands.includes(s)), 3, rand));
  // jitter so the heaviest devices don't win every seed
  const jitter = new Map(cands.map((c) => [c.d.id, 0.7 + 0.6 * rand()]));
  const val = (c) => c.w * (jitter.get(c.d.id) ?? 1);
  const bestTrio = (pool) => {
    let best = null;
    let bestV = -1;
    for (let i = 0; i < pool.length; i++)
      for (let j = i + 1; j < pool.length; j++)
        for (let k = j + 1; k < pool.length; k++) {
          const trio = [pool[i], pool[j], pool[k]];
          if (!trioOk(trio.map((x) => x.d))) continue;
          const v = trio.reduce((s, x) => s + val(x), 0) + 0.02 * (distance(pool[i].d, pool[j].d) + distance(pool[i].d, pool[k].d) + distance(pool[j].d, pool[k].d));
          if (v > bestV) { bestV = v; best = trio; }
        }
    return best;
  };
  let trio = bestTrio(cands);
  let widened = false;
  if (!trio) {
    // widen: the whole (non-excluded) catalog, with seeded jitter
    for (const s of scored) if (!jitter.has(s.d.id)) jitter.set(s.d.id, 0.7 + 0.6 * rand());
    trio = bestTrio(scored.slice().sort((a, b) => val(b) - val(a)).slice(0, 24));
    widened = true;
  }
  if (!trio) die("no three devices satisfy the distance rule with these exclusions; drop some --exclude ids");
  const laddered = ladder(trio);
  // native material to fuse each device with: seeded, never the same central item twice
  const native = [...truth.forms.map((x) => ({ kind: "format", item: x })), ...truth.objects.map((x) => ({ kind: "object", item: x }))];
  const used = new Set();
  const fuse = () => {
    const pool = native.filter((n) => !used.has(n.item));
    const pickN = [];
    const forms = pool.filter((n) => n.kind === "format");
    const objs = pool.filter((n) => n.kind === "object");
    if (forms.length) pickN.push(forms[Math.floor(rand() * forms.length)]);
    if (objs.length) pickN.push(objs[Math.floor(rand() * objs.length)]);
    pickN.forEach((n) => used.add(n.item));
    return pickN.map((n) => `${n.item} (${n.kind})`);
  };
  const picks = laddered.slice(0, count).map((x) => {
    const d = x.d;
    return {
      label: x.label,
      ladder: LABEL_MEANING[x.label],
      id: d.id, code: d.code, name: d.name, family: `${CAT.families[d.family].code} ${CAT.families[d.family].name}`,
      what: d.what,
      axes: d.axes,
      beats: d.beats,
      pitfalls: d.pitfalls,
      example: d.example,
      build: d.build,
      needs: d.needs,
      overused: d.overused || undefined,
      fuse_with: fuse(),
      weight: x.w, weight_why: x.why,
    };
  });
  const LADDER_VARIANT = {
    Sure: "Sure: the product's own verb, straight; the obvious uses in the obvious order, an even pace, one clear escalation.",
    Bold: "Bold: a faster cut ladder (shorter rungs), a twist rung the viewer does not expect, the uses reordered for surprise.",
    Wild: "Wild: an unexpected but true refrain (a verb the product really does, said a new way); still real uses, still one ladder.",
  };
  if (shape === "ladder") for (const pk of picks) { pk.structure = "ladder"; pk.ladder_variant = LADDER_VARIANT[pk.label]; pk.device_role = "the device is the ladder's rhythm (list that breaks, escalation, call and response, countdown), never a plot"; }
  const matrix = picks.map((a) => picks.map((b) => (a === b ? null : distance(findDevice(a.id), findDevice(b.id)))));
  out({
    ok: true,
    seed,
    product: truth.product.name || null,
    format, tones, tags,
    product_first: productFirst || undefined,
    product_first_rule: productFirst ? "Launch / promo / product film: the product UI is on screen within 3 s, one hero product moment, 2-4 real uses, short plain kinetic lines, the end line the largest type, a clean CTA. No conceit devices; Sure, Bold and Wild differ in structure, pacing and energy, never by leaving the product. See references/product-first.md." : undefined,
    shape: shape || undefined,
    shape_rule: shape === "ladder" ? "Ladder: one refrain verb is the spine; each rung is a title card (one highlighted word) plus a real UI demo of a DIFFERENT everyday use, escalating from simple to done-for-you; creativity lives in the joins between rungs, never in a plot. Rungs: <= 35 s 3-4, 36-60 s 4-6, > 60 s 6-8. Sure, Bold and Wild differ in which uses, their order, pacing and the refrain's wording, all on the same ladder. Pitch fields: shape, refrain {verb, pattern}, beats with role open | rung | ways_in | close; rungs carry use, highlight, level, on_screen, picture, ui[], duration_s. See references/story.md." : shape === "scenario" ? "Scenario: one feature, one viewer, one task (G10 scenario rules)." : undefined,
    truth_gaps: gaps.length ? gaps : undefined,
    considered: cands.map((c) => ({ id: c.d.id, w: c.w })),
    widened: widened || undefined,
    picks,
    distance: { axes: AXES, matrix, rule: "every pair differs on >= 5 of 7 axes, and on family, protagonist and visual_world" },
    avoid: {
      cliche_arc: CL.arc,
      stock_openers: "Meet X / Introducing X / What if...? / Tired of...? / Imagine... / The future of ___ is here / Say goodbye to...",
      visual_cliches: CL.visuals.map((v) => v.name),
    },
    next: "Write one pitch per pick (references/story.md: title, <= 12-word logline, timed beats with the turn at 60-75%, three sketch frames) fusing the device with its fuse_with material, then: node story.mjs check --pitch <pitches.json> --truth <truth>",
  });
} else if (cmd === "check") {
  if (!args.pitch || args.pitch === true) die("--pitch <pitch.json> required");
  const pf = path.resolve(String(args.pitch));
  if (!fs.existsSync(pf)) die(`pitch not found: ${pf}`);
  let raw;
  try { raw = readJSON(pf); } catch (e) { die(`pitch is not valid JSON: ${e.message}`); }
  const pitches = Array.isArray(raw) ? raw : Array.isArray(raw.pitches) ? raw.pitches : [raw];
  const truth = loadTruth(args.truth);
  const footage = !!args.footage || !!(truth && truth.assets.some((a) => /footage|video of|founder on camera/i.test(a)));
  const opts = { length: Number(args.length) || 0, narrated: !!args.narrated, calm: !!args.calm, brandTempo: loadBrandTempo(args["brand-film"]), productFirst: isProductFirst(truth?.format?.format ? norm(truth.format.format).trim() : (args.format && args.format !== true ? norm(args.format) : null), args) };
  const results = pitches.map((p, i) => checkPitch(p, i, truth, footage, opts));
  const portfolio = pitches.length > 1 ? checkPortfolio(pitches, results) : null;
  const ship = results.every((r) => r.verdict === "ship") && (!portfolio || portfolio.pass);
  out(pitches.length === 1 && !portfolio ? results[0] : { ok: ship, verdict: ship ? "ship" : "rewrite", pitches: results, portfolio });
  process.exit(results.some((r) => r.verdict === "invalid") ? 1 : ship ? 0 : 2);
} else if (cmd === "validate") {
  const problems = [];
  const ids = new Set();
  const codes = new Set();
  for (const d of DEVICES) {
    if (ids.has(d.id)) problems.push(`duplicate id ${d.id}`);
    if (codes.has(d.code)) problems.push(`duplicate code ${d.code}`);
    ids.add(d.id); codes.add(d.code);
    for (const k of ["id", "code", "name", "family", "what", "example"]) if (!d[k]) problems.push(`${d.id}: missing ${k}`);
    if (!CAT.families[d.family]) problems.push(`${d.id}: unknown family ${d.family}`);
    if (d.code[0] !== CAT.families[d.family]?.code) problems.push(`${d.id}: code ${d.code} not in family ${d.family}`);
    for (const k of AXES) if (!CAT.axes[k].values.includes(d.axes?.[k])) problems.push(`${d.id}: axes.${k} "${d.axes?.[k]}" not in vocabulary`);
    if (d.axes.family !== d.family) problems.push(`${d.id}: axes.family != family`);
    for (const k of ["products", "tones", "formats"]) for (const t of d.fits?.[k] || []) if (!CAT.tags[k].includes(t)) problems.push(`${d.id}: fits.${k} "${t}" not in tags.${k}`);
    if (!(d.beats || []).length || d.beats.some((b) => !b.name || !b.purpose)) problems.push(`${d.id}: beats need name + purpose`);
    if (!(d.pitfalls || []).length) problems.push(`${d.id}: no pitfalls`);
    if (!(d.build?.score >= 1 && d.build.score <= 5)) problems.push(`${d.id}: build.score must be 1-5`);
    if (!(d.ambition >= 1 && d.ambition <= 5)) problems.push(`${d.id}: ambition must be 1-5`);
    if (typeof d.overused !== "boolean") problems.push(`${d.id}: overused must be boolean`);
  }
  for (const id of CL.overused_devices) if (!findDevice(id)?.overused) problems.push(`cliche.overused_devices: ${id} is not a device marked overused`);
  if (CL.beats.length !== 8) problems.push(`cliche.beats: ${CL.beats.length}, expected 8`);
  const byFam = Object.fromEntries(Object.keys(CAT.families).map((f) => [f, DEVICES.filter((d) => d.family === f).length]));
  out({ ok: !problems.length, devices: DEVICES.length, by_family: byFam, overused: DEVICES.filter((d) => d.overused).map((d) => d.id), problems });
  process.exit(problems.length ? 1 : 0);
} else {
  die("usage: story.mjs truth|devices|cliche|pick|check|validate (see the header of scripts/story.mjs)");
}

// --- check -------------------------------------------------------------------------
function checkPitch(p, idx, truth, footage, opts = {}) {
  const name = p.id || p.title || `pitch ${idx + 1}`;
  const errors = [];
  const warnings = [];
  const gates = [];
  const gate = (id, title, reasons, extra = {}) => gates.push({ id, gate: title, pass: !reasons.length, reasons, ...extra });

  // shape
  const deviceIds = (Array.isArray(p.device) ? p.device : [p.device]).filter(Boolean);
  const devices = deviceIds.map((d) => findDevice(d));
  if (!deviceIds.length) errors.push("device: missing (a device id from taxonomy/devices.json)");
  devices.forEach((d, i) => { if (!d) errors.push(`device: unknown "${deviceIds[i]}"`); });
  const dev = devices[0] || null;
  if (!p.title) errors.push("title: missing");
  const logWords = String(p.logline || "").trim().split(/\s+/).filter(Boolean).length;
  if (!p.logline) errors.push("logline: missing");
  else if (logWords > 12) errors.push(`logline: ${logWords} words (12 at most)`);
  if (p.title && String(p.title).trim().split(/\s+/).length > 5) warnings.push("title: keep it to 2-4 words");
  if (p.label && !["Sure", "Bold", "Wild"].includes(p.label)) warnings.push(`label "${p.label}": use Sure, Bold or Wild`);
  const beats = Array.isArray(p.beats) ? p.beats : [];
  if (beats.length < 3) errors.push(`beats: ${beats.length} (need 3-8, each {name, on_screen, visual, duration_s})`);
  if (beats.length > 9) warnings.push(`beats: ${beats.length}; more than 8 usually means a list, not a story`);
  beats.forEach((b, i) => {
    if (!b.name) errors.push(`beats[${i}]: name missing`);
    if (!(Number(b.duration_s) > 0)) errors.push(`beats[${i}] "${b.name || ""}": duration_s must be > 0`);
    if (b.visual == null) warnings.push(`beats[${i}] "${b.name || ""}": visual missing`);
  });
  const scores = p.scores || {};
  const DIMS = ["originality", "clarity", "fit", "memorability", "feasibility"];
  for (const k of DIMS) if (!(Number(scores[k]) >= 1 && Number(scores[k]) <= 5)) errors.push(`scores.${k}: a number 1-5 required (self-assessed)`);
  if (errors.length) return { pitch: name, ok: false, verdict: "invalid", errors, hint: "Pitch format: references/story.md (Pitch JSON)" };

  // timing and the turn
  let t = 0;
  const starts = beats.map((b) => { const s = t; t += Number(b.duration_s); return s; });
  const lengthS = t;
  const turnIdx = beats.findIndex((b) => b.turn === true);
  const turnAt = turnIdx >= 0 ? starts[turnIdx] / lengthS : null;
  if (turnIdx < 0) warnings.push("no beat marked \"turn\": true (-1 memorability): name the turn and place it at 60-75%");
  else if (turnAt < 0.5 || turnAt > 0.85) warnings.push(`the turn lands at ${Math.round(turnAt * 100)}% of the film; aim for 60-75%`);
  const targetLen = truth && Number(String(truth.format.length || "").replace(/[^\d.]/g, ""));
  if (targetLen && Math.abs(lengthS - targetLen) / targetLen > 0.25) warnings.push(`beats total ${lengthS} s; the brief says ${targetLen} s`);

  // G1: distance from the cliche arc
  const map = clicheMap(beats);
  const nums = map.filter((m) => m.n).map((m) => m.n);
  const order = inOrder(nums);
  const g1 = [];
  if (order >= 4) g1.push(`${order} default beats appear in the default order (${map.filter((m) => m.n).map((m) => m.default_beat).join(" -> ")}); 3 at most`);
  const featureRun = (() => { let run = 0, best = 0; for (const m of map) { run = /^feature/.test(m.default_beat) ? run + 1 : 0; best = Math.max(best, run); } return best; })();
  if (featureRun >= 3) g1.push(`${featureRun} feature beats in a row: features must live inside the device, not in a list`);
  const opener = [p.logline, beats[0]?.on_screen, p.title].filter(Boolean).map((s) => norm(s).trim());
  const stock = CL.stock_openers.find((re) => opener.some((o) => new RegExp(re, "i").test(o)));
  if (stock) g1.push(`stock opener: matches /${stock}/ ("Meet X", "Introducing X", "What if...?", "Tired of...?")`);
  const vis = visualCliches([...beats.map((b) => `${b.visual || ""} ${b.on_screen || ""}`), ...(p.visual_motifs || []), p.signature_image || ""]);
  if (vis.length >= 2) g1.push(`${vis.length} visual cliches: ${vis.join(", ")}`);
  if (/\blogo\b/i.test(`${beats[0]?.visual || ""} ${beats[0]?.name || ""}`) && !/no logo/i.test(beats[0]?.visual || "")) g1.push("opens on the logo: the first 1.5-2 s must be the most striking image or line");
  gate("G1", "Distance from the cliche arc", g1, { beat_map: map, default_beats_in_order: order });

  // G2: swap test
  const g2 = [];
  const sw = p.swap_test || {};
  const product = truth?.product?.name || p.product || "<product>";
  const competitor = sw.competitor || truth?.competitors?.[0] || "<a competitor>";
  const verdict = norm(sw.result || (typeof p.swap_test === "string" ? p.swap_test : ""));
  if (!verdict) g2.push(`swap_test.result missing: answer the prompt below with "breaks" or "survives"`);
  else if (/surviv|still works|works/.test(verdict) && !/break/.test(verdict)) g2.push(`the concept survives swapping ${product} for ${competitor}: it isn't built from this product's material`);
  if (verdict && !/surviv/.test(verdict) && !sw.why && typeof p.swap_test !== "string") g2.push("swap_test.why missing: name the image or line that breaks");
  let own = null;
  if (truth) {
    const nat = [...truth.objects, ...truth.forms, ...truth.words];
    own = beats.map((b, i) => ({ beat: i + 1, uses: nat.filter((n) => mentions(`${b.on_screen || ""} ${b.visual || ""} ${b.name || ""}`, n)).map(itemKey) })).filter((x) => x.uses.length);
    if (!own.length) g2.push("no beat uses anything from the truth sheet's native objects, formats or words: the swap test will survive");
    else if (own.length < Math.ceil(beats.length / 3)) warnings.push(`only ${own.length} of ${beats.length} beats use the product's own material`);
  }
  gate("G2", "Swap test (only this product could make this film)", g2, {
    prompt: `Replace "${product}" with "${competitor}" in: "${p.logline}" and in every beat. Does the film still work? If it does, it fails. Name the image or line that breaks.`,
    own_material: own || undefined,
  });

  // G3: clear by second 4
  const g3 = [];
  const c4 = typeof p.clear_by_s4 === "object" && p.clear_by_s4 ? p.clear_by_s4 : { names_device: p.clear_by_s4, first_4s: p.first_4s };
  if (!String(c4.first_4s || "").trim()) g3.push("first_4s missing: describe in one line what seconds 0-4 show");
  if (c4.names_device !== true) g3.push("clear_by_s4 is not true: the first 4 s must make the device obvious (\"oh, it's a weather report\")");
  const early = beats.filter((b, i) => starts[i] < 4);
  if (early.some((b) => /\blogo\b|\btitle card\b|studio logos/i.test(`${b.visual || ""}`)) && !["movie-trailer", "cover-version"].includes(dev.id)) g3.push("seconds 0-4 spend time on a logo or title card");
  if (dev && c4.first_4s && !early.length) g3.push("no beat starts in the first 4 s");
  gate("G3", "Clarity by second 4", g3, { first_4s: c4.first_4s || null });

  // G4: honest demo and grounding
  const g4 = [];
  if (p.honest_demo === false) g4.push("honest_demo is false: never show a capability the product lacks");
  else if (p.honest_demo !== true) warnings.push("honest_demo not stated: set true once every capability shown is real");
  const claims = (p.grounded_claims || []).map((c) => (typeof c === "string" ? { claim: c } : c));
  claims.forEach((c, i) => { if (!c.source) g4.push(`grounded_claims[${i}] "${c.claim}": no source (site, docs, screenshot, the user)`); });
  const groundText = norm([...claims.map((c) => c.claim), ...(truth ? [...truth.proof, ...truth.facts, ...truth.words, ...truth.objects] : [])].join(" ")).replace(/,/g, "");
  const props = (p.props || []).map((x) => norm(x).replace(/,/g, ""));
  const propHits = [];
  const numRe = /(?<![\w.])\$?\d[\d,]*(?:\.\d+)?\s?(?:%|x\b|k\b|m\b|ms\b|s\b|sec|seconds?|min|minutes?|hours?|hrs?|days?)?/gi;
  const ungrounded = [];
  for (const b of beats) for (const m of String(b.on_screen || "").replace(/\b\d{1,2}:\d{2}(\s?[ap]\.?m\.?)?/gi, " ").match(numRe) || []) {
    const n = m.replace(/,/g, "").match(/\d+(?:\.\d+)?/)[0];
    const um = m.trim().match(/\d\s?(%|x|k|m|ms|s|sec|seconds?|min|minutes?|hours?|hrs?|days?)$/i);
    const unit = um ? um[1].toLowerCase() : "";
    if (/^(19|20)\d\d$/.test(n) || (/^0?\d$/.test(n) && !unit && !/^\$/.test(m.trim()))) continue; // years, times of day and bare single digits (step numbers) pass
    // whole numbers only ("2" is not in "#4127"); with a unit, the unit must match too ("2 days" is not "2 am")
    const stem = unit.length > 2 ? `\\s?${unit.slice(0, 3)}` : unit ? `\\s?${unit.replace("%", "(%|\\s?percent)")}` : "";
    const numIn = (text) => new RegExp(`(?<![\\d.])${n.replace(".", "\\.")}(?![\\d])${stem}`).test(text);
    if (numIn(groundText)) continue;
    if (props.some(numIn)) { propHits.push(m.trim()); continue; }
    ungrounded.push(`"${m.trim()}" in "${b.name}"`);
  }
  if (propHits.length) warnings.push(`numbers shown as story props, not claims: ${propHits.join(", ")}; make sure none reads as a product claim`);
  if (ungrounded.length) g4.push(`numbers on screen not in grounded_claims or the truth sheet (a claim needs a source; a story detail goes in "props"): ${ungrounded.join("; ")}`);
  const labels = p.ui_labels || [];
  if (labels.length && truth) {
    const words = truth.words.map((w) => norm(w));
    const bad = labels.filter((l) => !words.some((w) => w.includes(norm(l))));
    if (bad.length) g4.push(`UI labels not in the truth sheet's Native words (never invent them): ${bad.join(", ")}`);
  } else if (labels.length && !truth) warnings.push("ui_labels given without --truth: can't verify them");
  gate("G4", "Honest demo (grounded claims, numbers and UI labels)", g4);

  // G5: buildable
  const g5 = [];
  const bld = p.build || {};
  const needsFootage = bld.needs_live_action === true || dev.needs === "footage";
  if (needsFootage && !footage) g5.push(`${bld.needs_live_action ? "needs live action" : `${dev.name} needs footage`} and none is supplied: stylize it (type, illustration) or pick another device`);
  if (dev.needs && dev.needs !== "footage" && !(truth && truth.assets.some((a) => norm(a).includes(norm(dev.needs).split(" ").pop())))) warnings.push(`${dev.name} needs ${dev.needs}; confirm they exist`);
  if (!bld.hardest_shot) warnings.push("build.hardest_shot missing: name the hardest shot and how it's built");
  if (dev.build.score <= 2 && !footage) g5.push(`${dev.name} is buildability ${dev.build.score}/5 in code-built motion`);
  gate("G5", "Buildable in code-built motion graphics", g5, { device_build: `${dev.build.score}/5 (${dev.build.how.join(", ")})` });

  // G7: product-first (launch, promo and product films; references/product-first.md)
  if (opts.productFirst || p.product_first === true) {
    const g7 = [];
    const shape = shapeOf(p, beats);
    const isLadder = shape === "ladder";
    const flagged = deviceIds.map((x, i) => devices[i]).filter((d) => d && pfBanned(d));
    if (flagged.length) g7.push(`${flagged.map((d) => d.name).join(", ")} is a conceit device (museum, allegory, invented world, extended metaphor, cover version, borrowed container): a product film is led by the product, pick a device that stays on the real UI`);
    const pun = p.visual_pun && typeof p.visual_pun === "object" ? p.visual_pun : null;
    const punOk = !!pun && Number(pun.resolves_in_s) <= 1;
    const conceitText = [p.title, p.logline, p.signature_image, ...(p.visual_motifs || []), ...beats.map((b) => `${b.name || ""} ${b.visual || ""} ${b.on_screen || ""}`)].join(" . ");
    const cm = conceitText.match(CONCEIT_RE);
    if (cm && !punOk) g7.push(`conceit word "${cm[0]}" in the title, logline or beats: an invented world or extended metaphor cannot carry a product film (an instant visual pun that resolves to the product within 1 s is allowed: set visual_pun {what, resolves_in_s})`);
    else if (cm) warnings.push(`conceit word "${cm[0]}" allowed only as the visual pun "${pun.what || ""}"`);
    // the product on screen within 3 s
    const prodName = truth?.product?.name || p.product || "";
    const uiWords = [...(truth ? truth.words : []), ...(p.ui_labels || [])];
    const early3 = beats.filter((b, i) => starts[i] < 3);
    const earlyText = early3.map((b) => `${b.on_screen || ""} ${b.visual || ""}`).join(" ");
    const seen = (prodName && mentions(earlyText, prodName)) || uiWords.some((w) => mentions(earlyText, w)) || /\b(real |the )?(ui|app window|interface|screenshot|screen capture|menu bar|product screen|the app|the window|composer|cursor)\b/i.test(earlyText);
    if (!seen) g7.push("the product is not on screen within 3 s: beat 1 must show the real product UI (name it in the beat's visual, with its real labels)");
    const hero = p.hero_moment;
    const heroTxt = typeof hero === "string" ? hero : hero && (hero.what || hero.feature);
    if (isLadder) { /* a ladder's heroes are its rungs (G10) */ }
    else if (!String(heroTxt || "").trim()) g7.push("hero_moment missing: {beat, what} the one product moment that shows the key feature for real");
    else if (hero && typeof hero === "object" && hero.beat != null && !(Number(hero.beat) >= 1 && Number(hero.beat) <= beats.length)) g7.push(`hero_moment.beat ${hero.beat} is not a beat of this script`);
    const uses = isLadder ? beats.filter((b) => String(b.role || "").toLowerCase() === "rung").map((b) => b.use).filter((u) => String(u || "").trim()) : Array.isArray(p.uses) ? p.uses.filter((u) => String(u || "").trim()) : [];
    if (!isLadder && (uses.length < 2 || uses.length > 4)) g7.push(`uses: ${uses.length} ${p.feature ? "steps of the one task" : "real use cases"} (2-4 required: ${p.feature ? "the real steps of the viewer's one task in the real UI" : "real people doing real things with the real UI"})`);
    if (!String(p.last_line || "").trim()) g7.push("last_line missing: the required end line (the call to action) is the largest type in the film");
    if (p.end_line_largest !== true) g7.push("end_line_largest is not true: the end line must be the largest type in the film on a clean CTA card");
    const longLines = beats.filter((b) => String(b.on_screen || "").trim().split(/\s+/).filter(Boolean).length > 6).length;
    if (longLines) g7.push(`${longLines} beat(s) carry more than 6 on-screen words: product films use short plain kinetic lines`);
    // launch-film structure (references/launch-film.md): hook, reveal/hero, 2-4 uses, payoff line, end card; timings in range; the product or brand in every beat
    const heroObj = hero && typeof hero === "object" ? hero : null;
    const scenario = isScenario(p, beats);
    const roles = beats.map((b, i) => lfRole(b, i, beats.length, heroObj));
    const rng = scenario ? { ...LF_RANGES[lfBucket(lengthS)], ...SC_RANGES[lfBucket(lengthS)] } : LF_RANGES[lfBucket(lengthS)];
    if (!scenario && !isLadder) {
      // the older launch structure (hook, hero, 2-4 demos, payoff, end card); a one-feature scenario film is held to G10 instead
      if (!roles.includes("hero")) g7.push("structure: no reveal / hero beat (name it \"Hero\" or set role: \"hero\"; references/launch-film.md section 1)");
      const nDemo = roles.filter((r) => r === "demo").length;
      const demoCap = ({ 15: 3, 30: 5, 60: 7, 90: 9 })[lfBucket(lengthS)];
      if (nDemo < 2 || nDemo > demoCap) g7.push(`structure: ${nDemo} feature-demo beats (2 to ${demoCap} for a ${Math.round(lengthS)} s film, one idea each; the hook, hero, payoff and end card are not demos)`);
      if (!String(p.payoff_line || "").trim() && !roles.includes("payoff")) g7.push("structure: payoff line missing (payoff_line, or a beat with role \"payoff\": one plain outcome sentence before the end card)");
    }
    const outOfRange = [];
    beats.forEach((b, i) => { const [lo, hi] = rng[roles[i]] || [0, 99]; const d = Number(b.duration_s); if (d < lo - 0.01 || d > hi + 0.01) outOfRange.push(`${b.name} (${roles[i]}) ${d} s, template ${lo}-${hi} s`); });
    if (outOfRange.length) g7.push(`timings outside the ${lfBucket(lengthS)} s launch template for a ${Math.round(lengthS)} s film: ${outOfRange.join("; ")}`);
    const bareBrand = /\b(ui|app|window|interface|screen|screenshot|cursor|composer|menu|logo|wordmark|mark|brand|cta|end card|canvas|product|dot|prompt)\b/i;
    const names = [prodName, truth?.product?.brand, p.brand, p.product, ...uiWords].filter(Boolean);
    const noProd = beats.map((b, i) => ({ b, i })).filter(({ b }) => { const t = `${b.name || ""} ${b.on_screen || ""} ${b.visual || ""} ${b.vo || ""}`; return !(bareBrand.test(t) || names.some((w) => mentions(t, w))); }).map(({ b, i }) => `${i + 1} ${b.name}`);
    if (noProd.length) g7.push(`beat(s) without the product or brand: ${noProd.join(", ")} (every beat shows the real UI, the mark or the brand's canvas; name it in the beat's visual)`);
    gate("G7", "Product-first (UI from the first seconds, hero moment, real uses, no conceit, launch-film structure and timings)", g7, { early_beats: early3.map((b) => b.name), hero_moment: heroTxt || null, uses, roles, template_s: lfBucket(lengthS) });

    // G9: tempo (references/launch-film.md, Tempo): enough ideas, something changes every ~2 s, no long holds
    {
      const g9 = [];
      const bucket = lfBucket(opts.length || lengthS);
      const minIdeas = ({ 15: 3, 30: 5, 60: 8, 90: 10 })[bucket];
      const heroMax = ({ 15: 3.5, 30: 4, 60: 5, 90: 6 })[bucket];
      const brand = opts.brandTempo || null;
      const houseEvery = HOUSE_CHANGE_EVERY_S, houseHold = 3;
      const everyMax = brand ? Math.min(houseEvery, brand.changeEveryS) : houseEvery;
      const holdMax = brand ? Math.min(houseHold, Math.max(1.5, brand.changeEveryS * 1.5)) : houseHold;
      const heroLimit = brand && brand.longestHoldS >= 2 ? Math.min(heroMax, brand.longestHoldS) : heroMax;
      const ideaRoles = new Set(["statement", "hero", "demo", "payoff", "proof", "turn", "open", "rung", "ways_in"]);
      // in a one-feature film every UI step of the proof beyond its first is one more thing the viewer learns
      const ideas = beats.filter((b, i) => b.idea === true || ideaRoles.has(roles[i])).length + beats.reduce((a, b, i) => a + (roles[i] === "proof" || roles[i] === "rung" ? Math.max(0, uiOf(b).length - 1) : 0), 0);
      const t = p.tempo && typeof p.tempo === "object" ? p.tempo : null;
      if (!t) g9.push("tempo missing: set tempo { ideas, change_every_s, longest_hold_s, source: \"brand film\" | \"house\" } (references/script.md pass 0)");
      else {
        if (!(Number(t.change_every_s) > 0)) g9.push("tempo.change_every_s missing: how often something changes on screen, in seconds");
        else if (Number(t.change_every_s) > everyMax + 0.01) g9.push(`tempo.change_every_s ${t.change_every_s} is slower than the target ${r1d(everyMax)} s (${brand ? "the brand film's measured tempo, capped at the house tempo" : "house tempo"})`);
        if (brand && !/brand/i.test(String(t.source || ""))) g9.push('tempo.source must be "brand film": a brand film card is measured for this film, write to its tempo');
        if (!t.source) g9.push('tempo.source missing ("brand film" or "house")');
      }
      if (!opts.calm && ideas < minIdeas) g9.push(`${ideas} ideas in a ${Math.round(opts.length || lengthS)} s film: at least ${minIdeas} (a promise, the hero, each use or proof, the payoff each count once; ${bucket === 30 ? "aim 6 or 7" : "more is better"}). A calm film must be asked for in the brief`);
      const heroI = roles.indexOf("hero");
      if (heroI >= 0 && Number(beats[heroI].duration_s) > heroLimit + 0.01) g9.push(`the hero beat holds ${beats[heroI].duration_s} s: ${r1d(heroLimit)} s at most in a ${bucket} s film (the longest hold; show its UI states changing in less)`);
      const needChanges = [], long = [];
      beats.forEach((b, i) => {
        const r = roles[i], d = Number(b.duration_s);
        if (r === "cta" || r === "hero") return;
        if (d > holdMax + 0.01) {
          const need = Math.max(1, Math.ceil(d / 2) - 1), have = (Array.isArray(b.changes) ? b.changes.filter((c) => String(c || "").trim()).length : 0) + uiOf(b).length;
          if (have < need) needChanges.push(`${i + 1} ${b.name} (${d} s needs ${need} listed change${need > 1 ? "s" : ""} in \"changes\", has ${have})`);
        }
        if (r === "statement") {
          const w = String(b.on_screen || "").trim().split(/\s+/).filter(Boolean).length, read = 0.3 * w + 0.6;
          if (d > read + 1 && !(Array.isArray(b.changes) && b.changes.length)) long.push(`${i + 1} ${b.name} (${d} s for a ${w}-word line, reading time ${r1d(read)} s)`);
        }
      });
      if (needChanges.length) g9.push(`beats longer than ${r1d(holdMax)} s must list what changes inside them (in "changes" or "ui"), roughly one change per 2 s: ${needChanges.join("; ")}`);
      if (long.length) g9.push(`a statement line holds only its reading time (0.3 s per word + 0.6 s): ${long.join("; ")}`);
      if (t && Number(t.ideas) && Number(t.ideas) !== ideas) warnings.push(`tempo.ideas says ${t.ideas}, the beats carry ${ideas}`);
      gate("G9", "Tempo (ideas per film, a change every ~2 s, no long holds)", g9, { ideas, min_ideas: minIdeas, change_every_s_max: r1d(everyMax), longest_hold_s: r1d(holdMax), hero_hold_s_max: r1d(heroLimit), source: brand ? "brand film" : "house" });
    }

    // G10: one feature, one scenario (references/script.md pass 0): the viewer's before, the task done in the real UI,
    // the after with the brand, one action; every beat's picture and its UI cause and effect; the two-way read
    if (isLadder) {
      const g10 = [], w10 = [];
      const wc = (x) => String(x || "").trim().split(/\s+/).filter(Boolean).length;
      const verb = String((p.refrain && p.refrain.verb) || "").trim();
      if (!verb) g10.push("refrain.verb missing: { verb, pattern } (the one verb every title carries, e.g. { verb: \"Ask\", pattern: \"Ask <it to> <highlight>\" })");
      const hasVerb = (b) => new RegExp(`\\b${esc(verb.toLowerCase())}`, "i").test(String(b.on_screen || ""));
      const idx = (r) => beats.map((b, i) => (roles[i] === r ? i : -1)).filter((i) => i >= 0);
      const rungs = idx("rung").map((i) => ({ b: beats[i], i }));
      const [lo, hi] = rungRange(lengthS);
      if (rungs.length < lo || rungs.length > hi) g10.push(`rungs: ${rungs.length} for a ${Math.round(lengthS)} s film (${lo}-${hi} rungs: films up to 35 s 3-4, 36-60 s 4-6, over 60 s 6-8)`);
      if (!idx("open").length) w10.push("no open beat (role: \"open\": the refrain arrives, the product on screen within 3 s)");
      if (!idx("close").length) g10.push("close beat missing (role: \"close\": \"<verb> anything\" or the product's own line, then the logo / end line)");
      if (verb) {
        const noVerb = beats.map((b, i) => ({ b, i })).filter(({ b, i }) => ["open", "rung", "close"].includes(roles[i]) && !hasVerb(b)).map(({ b, i }) => `${i + 1} ${b.name} ("${b.on_screen || ""}")`);
        if (noVerb.length) g10.push(`title without the refrain verb "${verb}": ${noVerb.join("; ")} (only the ways_in beat may use other verbs)`);
      }
      const nouns = rungs.map(({ b }) => useNouns(b.use));
      rungs.forEach(({ b, i }) => {
        const u = String(b.use || "").trim();
        if (!u) g10.push(`rung ${i + 1} ${b.name}: use missing (a distinct everyday use, 2-6 words)`);
        else if (wc(u) < 2 || wc(u) > 6) w10.push(`rung ${i + 1} ${b.name}: use "${u}" is ${wc(u)} words (2-6)`);
      });
      for (let a = 0; a < rungs.length; a++) for (let c = a + 1; c < rungs.length; c++) {
        const shared = [...nouns[a]].filter((w) => nouns[c].has(w));
        if (shared.length) g10.push(`rungs ${rungs[a].i + 1} and ${rungs[c].i + 1} share the use noun "${shared[0]}" ("${rungs[a].b.use}" / "${rungs[c].b.use}"): every rung is a different everyday use`);
      }
      const lv = rungs.map(({ b }) => Number(b.level));
      if (rungs.length && (lv.some((x) => !Number.isFinite(x)) || lv.some((x, i) => i && x <= lv[i - 1]))) g10.push(`rung level must be a number, strictly increasing from simple to done-for-you (got ${lv.map((x) => (Number.isFinite(x) ? x : "?")).join(", ")})`);
      const big = rungs.filter(({ b }) => Number(b.duration_s) > 0.35 * lengthS).map(({ b, i }) => `${i + 1} ${b.name} (${b.duration_s} s of ${Math.round(lengthS)} s)`);
      if (big.length) g10.push(`rung over 35% of the film: ${big.join("; ")} (a ladder keeps moving)`);
      const noUi = rungs.filter(({ b }) => !uiOf(b).some((u) => /→|->|:|\bthen\b|\bopens?\b|\bappears?\b|\blands?\b/i.test(u))).map(({ b, i }) => `${i + 1} ${b.name}`);
      if (noUi.length) g10.push(`rung(s) without ui cause and effect in ui[] ("type the question → the answer builds line by line"): ${noUi.join(", ")}`);
      const badUi = beats.flatMap((b) => uiOf(b)).filter((u) => !/→|->|:|\bthen\b|\bopens?\b|\bappears?\b|\blands?\b/i.test(u));
      if (badUi.length) g10.push(`ui entries need a cause and its effect: ${badUi.slice(0, 2).map((u) => `"${u}"`).join(", ")}`);
      const noPic = beats.map((b, i) => (!String(b.picture || "").trim() ? `${i + 1} ${b.name}` : null)).filter(Boolean);
      if (noPic.length) g10.push(`beat(s) without a picture (one sentence: what the viewer sees happen): ${noPic.join(", ")}`);
      const INV = /\b(placeholder|generic (cards?|boxes|page|screen|output|result)|(grey|gray|purple|lavender|empty) boxes|boxes standing in|dummy (ui|screen|page|data)|fake (ui|screen|page|output)|invented (page|screen|output|ui)|lorem)\b/i;
      const inv = beats.map((b, i) => (INV.test(`${b.visual || ""} ${b.picture || ""} ${uiOf(b).join(" ")}`) ? `${i + 1} ${b.name}` : null)).filter(Boolean);
      if (inv.length) g10.push(`invented output screen in beat(s) ${inv.join(", ")}: the result is the product's real UI`);
      rungs.forEach(({ b, i }) => {
        if (wc(b.on_screen) > 6) w10.push(`rung ${i + 1} ${b.name}: title "${b.on_screen}" is ${wc(b.on_screen)} words (6 at most)`);
        const h = String(b.highlight || "").trim();
        if (!h) w10.push(`rung ${i + 1} ${b.name}: highlight missing (the one word the title card emphasises)`);
        else if (!new RegExp(`\\b${esc(h.toLowerCase())}`).test(norm(b.on_screen))) w10.push(`rung ${i + 1} ${b.name}: highlight "${h}" is not in its title`);
      });
      warnings.push(...w10);
      gate("G10", "Ladder (a refrain verb, distinct everyday uses that escalate, each a real UI cause and effect, a close)", g10, { shape: "ladder", refrain: verb || null, rungs: rungs.length, rung_range: [lo, hi] });
    } else {
      const g10 = [];
      const f = p.feature && typeof p.feature === "object" ? p.feature : null;
      if (!f) g10.push("feature missing: { name, url, viewer, task, before, after } for the ONE feature this film is about (the user's named one, else the newest launch, else the core surface); a general product launch is a ladder instead: set shape \"ladder\", a refrain {verb, pattern} and open / rung / close beats");
      else {
        for (const k of ["name", "url", "viewer", "task", "before", "after"]) if (!String(f[k] || "").trim()) g10.push(`feature.${k} missing`);
        if (/\s(and|&|\+)\s|,|\//i.test(String(f.name || ""))) g10.push(`feature.name "${f.name}" names more than one feature: a launch film is about ONE feature (pick the user's named one, else the newest launch)`);
        if (/\b(and then|as well as|plus|also)\b|;/i.test(String(f.task || ""))) g10.push(`feature.task "${f.task}" is more than one task: one viewer doing one real task`);
      }
      const order = ["hook", "proof", "turn", "cta"];
      const firstAt = order.map((r) => roles.indexOf(r));
      if (firstAt.some((x) => x < 0)) g10.push(`roles: the film needs hook, proof, turn and cta beats (has ${[...new Set(roles)].join(", ")}): hook = the viewer's before, proof = the task in the real UI, turn = the after and the brand reveal, cta = one action`);
      else if (!firstAt.every((x, i) => i === 0 || x > firstAt[i - 1])) g10.push("roles out of order: hook, then proof, then turn, then cta");
      if (roles.filter((r) => r === "cta").length > 1 || (roles.includes("cta") && roles[roles.length - 1] !== "cta")) g10.push("one cta, last");
      const noPic = beats.map((b, i) => (!String(b.picture || "").trim() ? `${i + 1} ${b.name}` : null)).filter(Boolean);
      if (noPic.length) g10.push(`beat(s) without a picture (one sentence: what the viewer sees happen, proving the line): ${noPic.join(", ")}`);
      const proofs = beats.filter((b, i) => roles[i] === "proof");
      const steps = proofs.reduce((a, b) => a + uiOf(b).length, 0);
      if (proofs.length && steps < 2) g10.push(`the proof lists ${steps} UI step(s): list at least 2 in ui[] as cause and effect ("click Open: a new tab opens, the address changes, a toast says Saved")`);
      const badUi = beats.flatMap((b) => uiOf(b)).filter((u) => !/→|->|:|\bthen\b|\bopens?\b|\bappears?\b|\blands?\b/i.test(u));
      if (badUi.length) g10.push(`ui entries need a cause and its effect ("click Send → the message lands in the thread, the composer clears"): ${badUi.slice(0, 2).map((u) => `"${u}"`).join(", ")}`);
      const INVENTED = /\b(placeholder|generic (cards?|boxes|page|screen|output|result)|(grey|gray|purple|lavender|empty) boxes|boxes standing in|mock(ed)?[- ]up (page|output|result|screen)|dummy (ui|screen|page|data)|fake (ui|screen|page|output)|invented (page|screen|output|ui)|lorem)\b/i;
      const inv = beats.map((b, i) => (INVENTED.test(`${b.visual || ""} ${b.picture || ""} ${uiOf(b).join(" ")}`) ? `${i + 1} ${b.name}` : null)).filter(Boolean);
      if (inv.length) g10.push(`invented output screen in beat(s) ${inv.join(", ")}: the result is the product's real UI from the research (research/screens), never generic boxes standing in for it`);
      const tw = p.two_way && typeof p.two_way === "object" ? p.two_way : {};
      if (!String(tw.lines_alone || "").trim() || !String(tw.pictures_alone || "").trim()) g10.push("two_way missing: { lines_alone, pictures_alone }: read the lines with the pictures hidden, then the pictures with the lines hidden, and write the story each tells; they must be the same story");
      if (f && roles.includes("turn")) {
        const t = beats[roles.indexOf("turn")];
        if (!/brand|logo|mark|wordmark|name/i.test(`${t.visual || ""} ${t.picture || ""} ${t.on_screen || ""}`) && !p.brand_reveal) warnings.push("the turn should carry the brand reveal (the mark lands once, in the turn): say so in its picture");
      }
      gate("G10", "One feature, one scenario (the viewer's before, the task in the real UI, the after with the brand, one action)", g10, { feature: f ? f.name || null : null, ui_steps: steps });
    }
  }

  // G6 the script itself (references/script.md): runs when the beats carry voiceover or a target length is given
  let script = null;
  const narrated = opts.narrated || beats.some((b) => String(b.vo || "").trim());
  if (narrated || opts.length) {
    const g6 = [];
    const words = (s) => String(s || "").trim().split(/\s+/).filter(Boolean).length;
    const nz = (s) => norm(s).replace(/-/g, " ").replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
    const BANNED = ["seamless", "unlock", "revolutioniz", "revolutionis", "game-changer", "game changer", "supercharge", "effortless", "cutting-edge", "cutting edge", "empower", "streamline", "the future of", "like never before", "next-level", "next level", "all-in-one", "say goodbye to", "harness the power", "elevate your", "reimagine"];
    if (opts.length && Math.abs(lengthS - opts.length) > Math.max(2, opts.length * 0.1)) g6.push(`runs ${lengthS} s for a ${opts.length} s film (within ${Math.max(2, Math.round(opts.length * 0.1))} s)`);
    if (Number(beats[0].duration_s) > 4) g6.push(`the hook beat runs ${beats[0].duration_s} s: land the hook in 1.5-2 s and move on by 4 s`);
    const valueIdx = beats.findIndex((b) => b.value === true);
    if (valueIdx > 1) g6.push(`the value lands in beat ${valueIdx + 1}: state what the viewer gets by beat 2, then prove it`);
    else if (valueIdx < 0) warnings.push("mark the beat that states the value with value: true (it must be beat 1 or 2)");
    const last = beats[beats.length - 1];
    if (Number(last.duration_s) < 2) g6.push(`the end beat runs ${last.duration_s} s: the end card needs 2-3 s for the name and call to action to land (and at most 1.5 s still after the last one)`);
    if (!String(last.on_screen || "").trim()) g6.push("the end beat has no on-screen line (the name and one call to action)");
    let vo = 0;
    beats.forEach((b, i) => {
      const nm = `beat ${i + 1} "${b.name || ""}"`, os = String(b.on_screen || ""), v = String(b.vo || ""), d = Number(b.duration_s), ow = words(os), vw = words(v);
      if (ow > 6) g6.push(`${nm}: ${ow} on-screen words (6 at most)`);
      if (ow && d < 0.6 + 0.4 * ow) g6.push(`${nm}: ${ow} on-screen words need ${(0.6 + 0.4 * ow).toFixed(1)} s to read, it has ${d} s`);
      if (vw && vw / d > 2.7) g6.push(`${nm}: ${vw} voiceover words in ${d} s (${(vw / d).toFixed(1)} words/s; keep it under 2.7)`);
      v.split(/(?<=[.?!])\s+/).forEach((sen) => { if (words(sen) > 14) g6.push(`${nm}: a ${words(sen)}-word voiceover sentence (14 at most; say it aloud)`); });
      if (ow >= 3 && v && nz(v).includes(nz(os))) g6.push(`${nm}: the on-screen line repeats the voiceover; make the screen add a word, a number or an image`);
      const txt = `${os} ${v}`.toLowerCase();
      const hit = BANNED.find((w) => txt.includes(w));
      if (hit) g6.push(`${nm}: "${hit}" is stock launch copy; say the specific thing`);
      if (/\bnot (just )?(a |an |the )?[\w' -]{1,30}[,;:.—–-]+\s*(it'?s|it is|but|this is)\b/i.test(txt)) g6.push(`${nm}: "not X, it's Y" is the signature AI line; state Y`);
      if (/!/.test(txt)) g6.push(`${nm}: exclamation marks read as hype`);
      if (/—/.test(os)) g6.push(`${nm}: an em dash in on-screen text`);
      vo += vw;
    });
    if (narrated && vo > 2.5 * lengthS * 0.85) g6.push(`${vo} voiceover words for ${lengthS} s: leave music-only moments (about ${Math.round(2.5 * lengthS * 0.8)} words at most)`);
    const ds = beats.map((b) => Number(b.duration_s)), mean = ds.reduce((a, b) => a + b, 0) / ds.length, cv = Math.sqrt(ds.reduce((a, b) => a + (b - mean) ** 2, 0) / ds.length) / mean;
    if (ds.length >= 4 && cv < 0.15) g6.push(`every beat runs about ${mean.toFixed(1)} s: vary the rhythm (quick beats, then give the turn and the reveal the longest shots)`);
    gate("G6", "The script holds up (references/script.md)", g6);
    script = { narrated, vo_words: vo, words_per_s: Math.round((vo / lengthS) * 100) / 100, rhythm_cv: Math.round(cv * 100) / 100 };
  }

  // G8: the aim (references/script.md pass 0): what the film achieves, how it gets there, and a title that names the idea
  {
    const g8 = [];
    const wc = (x) => String(x || "").trim().split(/\s+/).filter(Boolean).length;
    const aim = p.aim && typeof p.aim === "object" ? p.aim : {};
    if (!String(aim.takeaway || "").trim()) g8.push("aim.takeaway missing: the one thing the viewer remembers, in plain words, as they'd say it to a friend");
    else if (wc(aim.takeaway) > 16) g8.push(`aim.takeaway is ${wc(aim.takeaway)} words (16 at most): say it the way a viewer would to a friend`);
    if (!String(aim.feel || "").trim()) g8.push("aim.feel missing: what the viewer should feel");
    if (!String(aim.action || "").trim()) g8.push("aim.action missing: what the viewer should do next");
    if (!String(p.approach || "").trim()) g8.push("approach missing: one plain sentence on how this story gets there");
    else if (wc(p.approach) > 25) g8.push(`approach is ${wc(p.approach)} words (25 at most)`);
    const title = String(p.title || "").trim();
    const tw = title.split(/\s+/).filter(Boolean);
    const lastW = (tw[tw.length - 1] || "").toLowerCase().replace(/[^a-z']/g, "");
    if (tw.length < 2 || tw.length > 5) g8.push(`title "${title}" is ${tw.length} word${tw.length === 1 ? "" : "s"}: name the story's idea in 2 to 5 words a person would use to refer to it`);
    if (TITLE_STOP.includes(lastW)) g8.push(`title "${title}" ends on "${lastW}": a title is a name, not a fragment of a line`);
    if (/[A-Z]/.test(title) && title === title.toUpperCase()) g8.push(`title "${title}" is ALL CAPS`);
    const nt = nz8(title);
    const lines = [...beats.map((b) => b.on_screen), p.last_line].map(nz8).filter(Boolean);
    const frag = nt && lines.find((l) => l === nt || l.startsWith(`${nt} `));
    if (frag) g8.push(`title "${title}" is the start of an on-screen line ("${frag}"): name the idea instead`);
    gate("G8", "The aim (what the film achieves, how it gets there, a title that names the idea)", g8);
  }

  // scores: self-assessed, then adjusted by rule
  const self = Object.fromEntries(DIMS.map((k) => [k, Number(scores[k])]));
  const adj = { ...self };
  const adjustments = [];
  const bump = (k, v, why) => { adj[k] += v; adjustments.push(`${v > 0 ? "+" : ""}${v} ${k}: ${why}`); };
  if (devices.some((d) => d && d.overused)) {
    if (!String(p.twist || "").trim()) bump("originality", -2, `${devices.find((d) => d.overused).name} is LLM-overused and the pitch names no twist`);
    else warnings.push(`overused device with a twist ("${p.twist}"): make sure the twist is the idea, not decoration`);
  }
  if (p.form_proves_claim === true) bump("originality", +1, "the form itself proves the claim");
  if (vis.length) bump("fit", -vis.length, `visual cliche${vis.length > 1 ? "s" : ""}: ${vis.join(", ")}`);
  if (turnIdx < 0) bump("memorability", -1, "no named turn");
  const featCap = Math.min(5, dev.build.score + 1);
  if (adj.feasibility > featCap) bump("feasibility", featCap - adj.feasibility, `${dev.name} is buildability ${dev.build.score}/5; self-score capped at ${featCap}`);
  if (order >= 3 && adj.originality > 3) bump("originality", 3 - adj.originality, `${order} default beats in order: originality capped at 3`);
  if (!gates.find((g) => g.id === "G3").pass && adj.clarity > 2) bump("clarity", 2 - adj.clarity, "the device isn't clear by second 4");
  for (const k of DIMS) adj[k] = Math.max(1, Math.min(5, adj[k]));
  const W = { originality: 0.25, clarity: 0.2, fit: 0.2, memorability: 0.2, feasibility: 0.15 };
  const total = Math.round(DIMS.reduce((s, k) => s + W[k] * adj[k], 0) * 100) / 100;
  const low = DIMS.filter((k) => adj[k] < 3);

  // the eight self-critique prompts
  const CRIT = { retell: "The party retell: \"It's the one where...\"", first_4s: "What does second 0-4 show?", turn: "What's the turn and when does it land?", own_material: "What's made of the product's own material?", swap: "Swap test result?", second_reading: "What's the hostile second reading?", default_beats: "Which of the 8 default beats does it contain?", hardest_shot: "What's the single hardest shot to build, and how?" };
  const crit = p.critique || {};
  const unanswered = Object.keys(CRIT).filter((k) => !String(crit[k] || "").trim());
  if (unanswered.length) warnings.push(`self-critique unanswered: ${unanswered.map((k) => CRIT[k]).join(" | ")}`);

  const failedGates = gates.filter((g) => !g.pass);
  const reasons = [...failedGates.map((g) => `${g.id} ${g.gate}: ${g.reasons.join("; ")}`)];
  if (total < 3.8) reasons.push(`score ${total} < 3.8`);
  if (low.length) reasons.push(`dimension${low.length > 1 ? "s" : ""} below 3: ${low.map((k) => `${k} ${adj[k]}`).join(", ")}`);
  const ship = !reasons.length;
  return {
    pitch: name,
    label: p.label || null,
    device: devices.filter(Boolean).map((d) => d.id),
    ok: ship,
    verdict: ship ? "ship" : "rewrite",
    reasons,
    gates,
    scores: { self, adjusted: adj, adjustments, weights: W, total, threshold: 3.8 },
    turn: turnIdx >= 0 ? { beat: turnIdx + 1, at_s: starts[turnIdx], at_pct: Math.round(turnAt * 100) } : null,
    length_s: lengthS,
    script,
    sketch_frames: {
      opening: { beat: 1, at_s: 0, caption: beats[0].on_screen || beats[0].name },
      turn: turnIdx >= 0 ? { beat: turnIdx + 1, at_s: starts[turnIdx], caption: beats[turnIdx].on_screen || beats[turnIdx].name } : null,
      close: { beat: beats.length, at_s: starts[beats.length - 1], caption: beats[beats.length - 1].on_screen || beats[beats.length - 1].name },
    },
    warnings,
    rewrite: ship ? undefined : "Push, in order: a more specific artifact from the truth sheet -> a sharper turn -> a stricter constraint. Two rewrites at most, then replace the device with the next candidate from pick.",
  };
}

// the brand film's measured tempo (brandfilm.mjs measure: grammar.json .measured.tempo, or a FILM-STYLE.json with .measured)
function loadBrandTempo(p) {
  if (!p || p === true) return null;
  let j; try { j = readJSON(path.resolve(String(p))); } catch (e) { die(`--brand-film is not readable JSON: ${e.message}`); }
  const t = (j.measured && j.measured.tempo) || j.tempo;
  return t && Number(t.changeEveryS) > 0 ? { changeEveryS: Number(t.changeEveryS), longestHoldS: Number(t.longestHoldS) || 0 } : null;
}

function checkPortfolio(pitches, results) {
  const reasons = [];
  const warnings = [];
  const tk = pitches.map((p) => nz8(p.aim && p.aim.takeaway));
  for (let i = 0; i < tk.length; i++) for (let j = i + 1; j < tk.length; j++) if (tk[i] && tk[i] === tk[j]) warnings.push(`"${pitches[i].title || i + 1}" and "${pitches[j].title || j + 1}" share the same takeaway: each story should aim at something different`);
  const ds = pitches.map((p) => findDevice(Array.isArray(p.device) ? p.device[0] : p.device)).filter(Boolean);
  for (let i = 0; i < ds.length; i++)
    for (let j = i + 1; j < ds.length; j++) {
      const a = ds[i], b = ds[j];
      const pa = pitches[i].title || a.id, pb = pitches[j].title || b.id;
      if (a.family === b.family) reasons.push(`"${pa}" and "${pb}" share the ${a.family} family`);
      if (a.axes.protagonist === b.axes.protagonist && a.axes.turn === b.axes.turn) reasons.push(`"${pa}" and "${pb}" share protagonist and turn type`);
      if (a.axes.visual_world === b.axes.visual_world) reasons.push(`"${pa}" and "${pb}" share the ${a.axes.visual_world} visual world`);
      if (distance(a, b) < 5) reasons.push(`"${pa}" and "${pb}" differ on ${distance(a, b)} of 7 axes (5 required)`);
      const ia = norm(pitches[i].signature_image), ib = norm(pitches[j].signature_image);
      if (ia && ia === ib) reasons.push(`"${pa}" and "${pb}" share a signature image`);
    }
  const adj = results.filter((r) => r.scores).map((r) => r.scores.adjusted);
  if (pitches.length >= 3) {
    if (!adj.some((s) => s.originality >= 4)) reasons.push("no pitch scores 4+ on originality (the brave one)");
    if (!adj.some((s) => s.feasibility >= 4)) reasons.push("no pitch scores 4+ on feasibility (the sure one)");
    const labels = pitches.map((p) => p.label).filter(Boolean);
    if (labels.length && new Set(labels).size !== labels.length) reasons.push(`labels repeat: ${labels.join(", ")}`);
  }
  return { pass: !reasons.length, reasons, warnings: warnings.length ? warnings : undefined };
}
