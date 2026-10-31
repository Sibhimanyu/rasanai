// Visual grammar checks for launch / promo films (references/launch-film.md section 6, measured on the reference reels).
// They read the SCORE (motion/score.json scenes[], or scenes.json), the written contract (motion/CONTRACT.md) and the composition HTML,
// and return findings { severity, check, message, fix } for motion-gate (and scenes.mjs, obey.mjs for the doctrine).
//
// Scene fields the checks read (score scene or scenes.json scene; a composition may carry the same as data- attributes on its scene root):
//   layout       a short name for the composition ("type-full", "ui-tilt", "split", "world-wide"); no layout in more than 2 beats in a row
//   scale        shot scale: "type" (full-frame type), "ui" (close or cropped UI, in perspective), "world" (wide, field, 3D, generated world), "person" (a person or photo)
//   ui_fill      how much of the frame the product UI fills (0..1, or a percent); at least one beat must reach 0.5
//   frame_change how the beat arrives: "cut" | "morph" | "camera" | "none" (informational; the render measures the real rate in frame-gate)
// A score may also say has_users: true|false (the product has people using it: a person or photo beat is then owed) and actor ("ui" | "object" | "mascot" ...).
import fs from "node:fs";
import path from "node:path";

export const LG = { min_change_per_10s: 3, max_same_layout_run: 2, ui_hero_fill: 0.5 };

const readJ = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
const readT = (f) => { try { return fs.readFileSync(f, "utf8"); } catch { return ""; } };

export const isLaunchKind = (k) => /^(launch|promo)|product[- ]launch|feature[- ]reveal|app promo/i.test(String(k || ""));

// the run directory (decisions.json, motion/, story/) from a score path or a project path
export function runCandidates({ plan, project, run } = {}) {
  const c = [];
  if (run) c.push(path.resolve(run));
  if (plan) { const p = path.resolve(plan); c.push(path.dirname(path.dirname(p)), path.dirname(p)); }
  if (project) { const p = path.resolve(project); c.push(p, path.dirname(p), path.dirname(path.dirname(p))); }
  return [...new Set(c)];
}

// is this a launch or promo film? flag, then the score, then the run's decisions / brief
export function filmKind({ kind, plan, project, run } = {}) {
  if (kind) return String(kind);
  if (plan && typeof plan === "object") for (const k of ["kind", "route", "format", "film_kind"]) if (typeof plan[k] === "string" && plan[k]) return plan[k];
  for (const d of runCandidates({ project, run, plan: typeof plan === "string" ? plan : null })) {
    const dec = readJ(path.join(d, "decisions.json"));
    if (dec) for (const k of ["kind", "route", "format"]) if (typeof dec[k] === "string" && dec[k]) return dec[k];
  }
  return "";
}

const pct = (v) => { const n = Number(String(v).replace("%", "")); if (!Number.isFinite(n)) return null; return n > 1 ? n / 100 : n; };
const scaleOf = (s) => {
  const v = String(s || "").toLowerCase();
  if (!v) return null;
  if (/type|word|text|glyph|headline|numeral/.test(v)) return "type";
  if (/ui|screen|product|crop|close|perspective|tilt/.test(v)) return "ui";
  if (/person|people|human|photo|face|portrait|footage/.test(v)) return "person";
  if (/world|wide|field|3d|scene|environment|image|generated/.test(v)) return "world";
  return null;
};

// scene rows from the score (or scenes.json), then data- attributes on the composition's scene roots
export function sceneRows(scenes, htmlTexts = []) {
  const rows = (Array.isArray(scenes) ? scenes : []).map((s, i) => ({ id: String(s.id || s.n || i + 1), layout: s.layout || (s.composition && typeof s.composition === "string" ? s.composition : null) || null, scale: scaleOf(s.scale || s.shot_scale), ui_fill: s.ui_fill != null ? pct(s.ui_fill) : null, text: [s.on_screen, s.headline, s.title].filter((x) => typeof x === "string").join(" ") }));
  if (rows.some((r) => r.layout || r.scale)) return rows;
  const out = [];
  for (const html of htmlTexts) for (const m of html.matchAll(/<[a-z][^>]*\bdata-(?:layout|scale)=[^>]*>/gi)) {
    const t = m[0], at = (n) => (t.match(new RegExp(`data-${n}="([^"]*)"`, "i")) || [])[1];
    out.push({ id: at("scene") || at("id") || `s${out.length + 1}`, layout: at("layout") || null, scale: scaleOf(at("scale")), ui_fill: at("ui-fill") != null ? pct(at("ui-fill")) : null, text: "" });
  }
  return out.length ? out : rows;
}

const CHROME_TEXT = /^\s*0?\d{1,2}\s*(\/|of|⁄|-)\s*0?\d{1,2}\s*$/i;
const CHROME_CLASS = /\b(step|page|slide)[-_ ]?(counter|number|num|indicator|count)\b|\b(pager|progress[-_ ]?(dots|counter|steps)|slide[-_ ]?num)\b/i;
export function deckChrome(texts) {
  const hits = [], pills = new Map();
  for (const html of texts) {
    const body = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
    for (const m of body.matchAll(/<([a-z][a-z0-9]*)\b([^>]*)>([^<]*)<\/\1>/gi)) {
      const attrs = m[2], txt = m[3].trim();
      if (txt && CHROME_TEXT.test(txt)) hits.push(`a step counter or page number "${txt}"`);
      else if (CHROME_CLASS.test(attrs) && txt) hits.push(`a "${(attrs.match(/class="([^"]*)"/i) || [])[1] || "counter"}" element`);
      if (/class="[^"]*\b(pill|chip|badge)\b[^"]*"/i.test(attrs) && txt) pills.set(txt.toLowerCase(), (pills.get(txt.toLowerCase()) || 0) + 1);
    }
    for (const m of body.matchAll(/\bstep\s+\d+\s+of\s+\d+\b/gi)) hits.push(`"${m[0]}"`);
  }
  for (const [t, n] of pills) if (n >= 3) hits.push(`a label pill "${t}" repeated in ${n} places (a persistent pill)`);
  return [...new Set(hits)];
}

// the written contract + composition HTML for a project / run
export function readFilmText({ project, run, plan } = {}) {
  const dirs = runCandidates({ project, run, plan });
  const contract = [];
  for (const d of dirs) for (const f of ["motion/CONTRACT.md", "CONTRACT.md", "motion/contract.md"]) { const t = readT(path.join(d, f)); if (t) contract.push({ file: path.join(d, f), text: t }); }
  const htmls = [];
  if (project) {
    const root = path.resolve(project);
    const walk = (d, depth) => { let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const e of es) { if (e.name === "node_modules" || e.name.startsWith(".") || e.name === "renders") continue; const p = path.join(d, e.name); if (e.isDirectory()) { if (depth < 3) walk(p, depth + 1); } else if (/\.html?$/i.test(e.name)) htmls.push(readT(p)); } };
    walk(root, 0);
  }
  return { contract, htmls };
}

const SAME_EVERYWHERE = /\bidentical in every (scene|beat|shot)\b|\bsame (fixed )?layout (in|for|across|on) (every|each|all)\b|\bone fixed layout\b|\bthe fixed layout\b|\bevery (scene|beat|shot) (uses|shares|has) the same (layout|template|frame)\b|\bunchanged (across|between) (scenes|beats|shots)\b/i;

// plan = the parsed score (or null); scenes = its scenes[] (or scenes.json's)
export function launchGrammarFindings({ plan = null, scenes = [], project = null, run = null, planPath = null, kind = null } = {}) {
  const F = [];
  const add = (severity, check, message, fix) => F.push({ severity, check, message, fix, basis: "score" });
  const k = filmKind({ kind, plan: plan || planPath, project, run });
  if (!isLaunchKind(k)) return { applies: false, kind: k, findings: [] };
  const { contract, htmls } = readFilmText({ project, run, plan: planPath });
  // 2. a contract that says every scene looks the same
  for (const c of contract) {
    const m = c.text.match(SAME_EVERYWHERE);
    if (m) add("error", "identical-layout-contract", `${path.basename(path.dirname(c.file))}/${path.basename(c.file)} says "${m[0]}": one layout for every scene is a deck, not a film (the references remake the whole frame every 1.5 to 3 s)`, "write a layout per beat (full-frame type, tilted close UI, wide world, a person) and rewrite the contract: the grammar stays, the layout changes beat to beat; no layout in more than 2 beats in a row");
  }
  const rows = sceneRows(scenes && scenes.length ? scenes : (plan && (plan.scenes || plan.beats)) || [], htmls);
  const named = rows.filter((r) => r.layout);
  if (rows.length >= 3 && !named.length) add("error", "layout-undeclared", "no scene names its layout (score scenes[].layout, or data-layout on the scene root): layout variety cannot be checked, and a film with no declared layouts is usually one layout repeated", "give every scene a `layout` (e.g. type-full, ui-tilt-close, split, world-wide, person-photo) and a `scale`; no layout in more than 2 beats in a row");
  // 2. no layout in more than 2 consecutive beats
  let run0 = 0, prev = null;
  named.forEach((r, i) => {
    const key = String(r.layout).toLowerCase().trim();
    run0 = key === prev ? run0 + 1 : 1; prev = key;
    if (run0 === LG.max_same_layout_run + 1) add("error", "layout-repeat", `layout "${r.layout}" is used in more than ${LG.max_same_layout_run} beats in a row (through beat ${r.id})`, "change the composition: switch scale (full-frame type, close UI in perspective, wide world, a person), flip the ground, or cut to a new framing of the same product");
  });
  if (named.length >= 4 && new Set(named.map((r) => String(r.layout).toLowerCase().trim())).size < 3) add("error", "layout-variety", `only ${new Set(named.map((r) => String(r.layout).toLowerCase().trim())).size} distinct layout(s) in ${named.length} beats (3 at least)`, "a launch film uses at least 3 different compositions; see references/launch-film.md section 6");
  // 3. shot-scale mix
  const scaled = rows.filter((r) => r.scale);
  if (rows.length >= 4 && !scaled.length) add("error", "shot-scale-undeclared", "no scene names its shot scale (score scenes[].scale: type | ui | world | person): the mix cannot be checked", "tag every scene with its scale; the film needs full-frame type, close or cropped UI in perspective, and wide or world shots (and a person or photo when the product has users)");
  else if (scaled.length) {
    const have = new Set(scaled.map((r) => r.scale));
    const need = [["type", "full-frame type"], ["ui", "close or cropped UI in perspective"], ["world", "a wide or world shot"]];
    const hasUsers = (plan && plan.has_users === true);
    if (hasUsers) need.push(["person", "a person or photo"]);
    const miss = need.filter(([s]) => !have.has(s)).map(([, d]) => d);
    if (miss.length) add("error", "shot-scale-mix", `the film has no ${miss.join(", no ")} (scales used: ${[...have].join(", ")})`, "mix the scales across the film: giant words that bleed off the frame, the UI cropped and tilted in perspective, a wide world or field, and a person or photo when the product has users");
    else if (!hasUsers && !have.has("person") && plan && plan.has_users == null) F.push({ severity: "warning", check: "shot-scale-person", message: "no person or photo beat: if the product has users, one is owed (set score.has_users)", fix: "add a real person or photo beat, or set has_users: false with a reason", basis: "score" });
  }
  // 4. a UI hero beat
  const fills = rows.map((r) => r.ui_fill).filter((v) => v != null);
  if (rows.length >= 4) {
    if (!fills.length) add("error", "ui-hero-undeclared", "no scene says how much of the frame the product UI fills (score scenes[].ui_fill, 0 to 1): the UI hero beat cannot be checked", "declare ui_fill on the scenes that show the product; one must reach 0.5");
    else if (Math.max(...fills) < LG.ui_hero_fill) add("error", "ui-hero-small", `the product UI never fills more than ${Math.round(Math.max(...fills) * 100)}% of the frame (50% at least once)`, "give the UI one hero beat: scaled up, tilted and cropped until it fills half the frame or more; never small cards only");
  }
  // 5. deck chrome: counters, page numbers, persistent pills (the composition HTML, the on-screen text, the contract)
  const chrome = deckChrome([...htmls, ...rows.map((r) => `<p>${r.text}</p>`), ...contract.map((c) => c.text.split("\n").map((l) => (/\b\d{1,2}\s*\/\s*\d{1,2}\b/.test(l) && /counter|step|page|progress/i.test(l) ? `<p>${(l.match(/\b\d{1,2}\s*\/\s*\d{1,2}\b/) || [""])[0]}</p>` : "")).join(""))]);
  if (chrome.length) add("error", "deck-chrome", `deck chrome on a film: ${chrome.slice(0, 3).join("; ")}`, "delete step counters (\"01 / 04\"), page numbers and persistent label pills; the film is the story, not a slide deck");
  return { applies: true, kind: k, findings: F, scenes: rows.length };
}

// 6. doctrine: when the actor is the product UI, motion uses the brand's easing; `auto` and `character` are blocked there
export function doctrineFindings({ motionFields = null, plan = null, project = null, run = null, planPath = null, kind = null } = {}) {
  const F = [];
  const k = filmKind({ kind, plan: plan || planPath, project, run });
  if (!isLaunchKind(k) || !motionFields) return F;
  const actor = String((plan && (plan.actor || (plan.creative && plan.creative.actor))) || "").toLowerCase();
  let a = actor;
  if (!a) for (const d of runCandidates({ project, run, plan: planPath })) { const dec = readJ(path.join(d, "decisions.json")); if (dec && dec.actor) { a = String(dec.actor).toLowerCase(); break; } }
  const objectActor = /\b(object|mascot|character|carrier|ring|glyph|ball)\b/.test(a) && !/\bui\b|product|screen/.test(a);
  if (objectActor) return F; // the object gets character; the type and UI keep the brand's ease (craft.md)
  const lang = String(motionFields.language || "").replace(/^lang-/, "").toLowerCase(), by = String(motionFields.decided_by || "").toLowerCase();
  const bad = [];
  if (lang === "character" || /character/.test(String(motionFields.personality || ""))) bad.push("the character motion language (back.out, elastic, squash)");
  if (by === "auto") bad.push("decided_by: auto");
  if (bad.length) F.push({ severity: "error", rule: "ui-actor-motion", target: "motion.md", message: `the actor is the product UI, but motion.md uses ${bad.join(" and ")}: a squashing card reads as a toy, and an unconfirmed doctrine is not a decision`, fix: "write motion.md from the brand's own easing (`motion-md.mjs write --design-system <run>/design/<label>` or a brand-matched --language) with --mode confirmed; give `character` only to an object actor (a carrier letter, a mascot), never to the UI or the type" });
  return F;
}

// motion.md must exist before the build (it is written first; the compositions come after)
export function motionMdOrderFindings({ project }) {
  if (!project) return [];
  const root = path.resolve(project), md = path.join(root, "motion.md");
  const comp = ["index.html", "compositions/index.html"].map((f) => path.join(root, f)).find((f) => fs.existsSync(f));
  if (!comp) return [];
  if (!fs.existsSync(md)) return [{ severity: "error", check: "motion-md-missing", message: "the composition exists but motion.md does not: the motion doctrine must be written before the build", fix: "write motion.md (motion-md.mjs write ...) and rebuild to it", basis: "code" }];
  return fs.statSync(md).mtimeMs > fs.statSync(comp).mtimeMs + 60000 ? [{ severity: "warning", check: "motion-md-after-build", message: "motion.md is newer than the composition by over a minute: it may have been written after the build", fix: "write motion.md first, then build to it", basis: "code" }] : [];
}
