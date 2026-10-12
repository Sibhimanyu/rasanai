// The "What are you making?" picker (library/formats.json): load, list for UIs, match a request (and dropped paths)
// to a tile and option, resolve an option into what it sets, and check the file. Zero dependencies.
//   loadFormats() · listFormats({full}) · matchFormat(request, paths) · resolveFormat(id, {scope}) · checkFormats()
//   briefFormat(payload) -> {formats, format} for a brief push (console.mjs)
import fs from "node:fs";
import path from "node:path";
import { SKILL_DIR } from "./common.mjs";

export const FORMATS_FILE = path.join(SKILL_DIR, "library", "formats.json");
export const STATUSES = ["ready", "partial", "soon"];
export const SCOPES = ["universal", "category", "single-task"];
export const SOURCE_MODES = ["web", "local", "footage", "assets", "document", "existing-video", "audio", "mixed", "text"];
export const STORY_PASSES = ["script-writers", "footage-writers", "treatment-writers", "visual-writers", "cutdown-planner", "none"];
// the routes a run can take today (SKILL.md "1 · Brief" route table)
export const ROUTES = ["product-launch-video", "faceless-explainer", "pr-to-video", "music-to-video", "reel", "presenter", "embedded-captions", "talking-head-recut", "general-video", "motion-graphics"];
// the shapes story.mjs pick knows today (W10 adds more; check reports the rest as pending, never as an error)
export const STORY_MJS_SHAPES = ["ladder", "pas", "scenario"];

let cache = null;
export function loadFormats(file = process.env.RASANAI_FORMATS_FILE || FORMATS_FILE) {
  if (cache && cache.file === file) return cache.doc;
  const doc = JSON.parse(fs.readFileSync(file, "utf8"));
  cache = { file, doc };
  return doc;
}
const byId = (doc) => new Map(doc.options.map((o) => [o.id, o]));
const tileOf = (doc, id) => doc.tiles.find((t) => t.id === id) || null;

// the first required input's prompt: the input slot the picked option shows in place of "What's the video about?"
function inputSlot(doc, o) {
  const i = (o.inputs || []).find((x) => x.required) || (o.inputs || [])[0];
  if (!i) return null;
  const base = doc.inputs[i.id] || {};
  return { id: i.id, prompt: i.prompt || base.prompt || "", accepts: base.accepts || [] };
}

// compact, for UIs (console brief panel, Studio). --full adds every field.
export function listFormats({ full = false } = {}) {
  const doc = loadFormats();
  const opts = byId(doc);
  return {
    version: doc.version,
    scopes: doc.scopes,
    tiles: doc.tiles.map((t) => ({
      id: t.id, title: t.title, description: t.description, thumbnail: t.thumbnail, group: t.group, default: t.default,
      options: t.options.map((id) => {
        const o = opts.get(id);
        if (full) return { ...o, input: inputSlot(doc, o) };
        const near = o.soon && o.soon.nearest ? opts.get(o.soon.nearest) : null;
        return {
          id: o.id, title: o.title, description: o.description, kind: o.kind, status: o.status,
          length_s: o.length_s, aspect: o.aspect, input: inputSlot(doc, o),
          ...(o.partial ? { partial: o.partial } : {}),
          ...(o.soon ? { soon: o.soon.missing, nearest: near ? { id: near.id, title: near.title, tile: near.tile } : null } : {}),
          ...(o.scope_question ? { scope_question: o.scope_question } : {}),
        };
      }),
    })),
  };
}

// --- match ----------------------------------------------------------------------------
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const phrase = (p) => new RegExp(`(^|[^a-z0-9])${esc(p.toLowerCase())}(?=$|[^a-z0-9])`, "i");
const VIDEO = /\.(mp4|mov|m4v|mkv|avi|webm|mts|m2ts|3gp|mxf)$/i, AUDIO = /\.(mp3|wav|m4a|aac|flac|aiff?|ogg)$/i, IMAGE = /\.(jpe?g|png|heic|webp|tiff?|gif)$/i;
const SHEET = /\.(csv|xlsx?|numbers|tsv)$/i, PDF = /\.pdf$/i, TEXT = /\.(md|txt|docx?|rtf|pages)$/i, VECTOR = /\.(svg|ai|eps)$/i;
const CODE_MARKERS = ["package.json", ".git", "Cargo.toml", "go.mod", "pyproject.toml", "Package.swift", "Gemfile", "pom.xml", "build.gradle"];

// a folder, bounded and by name only (never content): counts by kind
function scanDir(dir, depth = 2, acc = { videos: [], audio: 0, images: 0, pdf: 0, sheets: 0, fonts: 0, vector: 0, code: false, n: 0 }) {
  let ents = [];
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of ents) {
    if (acc.n++ > 3000) break;
    if (CODE_MARKERS.includes(e.name) || /\.xcodeproj$/.test(e.name)) acc.code = true;
    if (e.name.startsWith(".") || e.name === "node_modules") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (depth > 0) scanDir(p, depth - 1, acc); continue; }
    if (VIDEO.test(e.name)) acc.videos.push(e.name);
    else if (AUDIO.test(e.name)) acc.audio++;
    else if (IMAGE.test(e.name)) acc.images++;
    else if (PDF.test(e.name)) acc.pdf++;
    else if (SHEET.test(e.name)) acc.sheets++;
    else if (/\.(otf|ttf|woff2?)$/i.test(e.name)) acc.fonts++;
    else if (VECTOR.test(e.name)) acc.vector++;
  }
  return acc;
}

// what each dropped path suggests: [{option, score, why}]
function pathHints(paths) {
  const out = [];
  const H = (option, score, why) => out.push({ option, score, why });
  for (const raw of paths) {
    const p = String(raw).replace(/^~(?=\/|$)/, process.env.HOME || "~");
    const b = path.basename(p);
    let st = null;
    try { st = fs.statSync(p); } catch {}
    if (st && st.isDirectory()) {
      const A = scanDir(p);
      const names = (b + " " + A.videos.join(" ")).toLowerCase();
      if (A.code) H("launch-film", 4, `"${b}" is a code folder`);
      else if (A.videos.length >= 2 || (A.videos.length && A.images > 3)) {
        if (/green|chroma|keyed/.test(names)) H("presenter", 5, `"${b}" holds green-screen clips`);
        else if (/customer|testimon|client/.test(names)) H("customer-story", 5, `"${b}" holds customer interview clips`);
        else if (/founder|ceo/.test(names)) H("founder-interview", 5, `"${b}" holds founder interview clips`);
        else if (/interview/.test(names)) H("founder-interview", 4, `"${b}" holds interview clips`);
        else if (/screen ?(recording|shot)|screencast/.test(names)) H("screen-demo", 5, `"${b}" holds screen recordings`);
        else H("social-reel", 4, `"${b}" is a folder of ${A.videos.length} clips`);
      } else if (A.videos.length === 1) H("talking-graphics", 3, `"${b}" holds one clip`);
      else if (A.audio && !A.images) H("lyric-video", 4, `"${b}" holds audio`);
      else if (A.fonts || A.vector) H("brand-film", 3, `"${b}" looks like a brand kit`);
      else if (A.images > 3) H("social-reel", 3, `"${b}" is a folder of photos`);
      else if (A.sheets) H("data-story", 3, `"${b}" holds spreadsheets`);
      else if (A.pdf) H("explainer", 2, `"${b}" holds documents`);
      continue;
    }
    if (VIDEO.test(b)) {
      if (/green|chroma|keyed/i.test(b)) H("presenter", 5, `"${b}" is a green-screen clip`);
      else if (/screen ?recording|screencast|screen ?shot/i.test(b)) H("screen-demo", 5, `"${b}" is a screen recording`);
      else if (/final|master|export|render|v\d+\b/i.test(b)) H("shorter-versions", 4, `"${b}" looks like a finished video`);
      else if (/podcast|episode/i.test(b)) H("podcast-clips", 4, `"${b}" looks like a podcast episode`);
      else H("talking-graphics", 3, `"${b}" is a single clip`);
    } else if (AUDIO.test(b)) H(/podcast|episode/i.test(b) ? "podcast-clips" : "lyric-video", 4, `"${b}" is ${/podcast|episode/i.test(b) ? "a podcast episode" : "a song"}`);
    else if (SHEET.test(b)) H("data-story", 4, `"${b}" is a spreadsheet`);
    else if (PDF.test(b)) H(/brand|guideline|identity/i.test(b) ? "brand-film" : /report|survey|annual/i.test(b) ? "data-story" : "explainer", 3, `"${b}" is a document`);
    else if (VECTOR.test(b) || (IMAGE.test(b) && /logo/i.test(b))) H("logo-sting", 4, `"${b}" is a logo`);
    else if (TEXT.test(b)) H("explainer", 2, `"${b}" is a text document`);
  }
  return out;
}

// pre-select a tile and option from the user's words and dropped files. Request words win over file hints of
// the same strength; a URL is a launch unless it's a pull request. Returns {tile, option, why, confidence, ...}.
export function matchFormat(request = "", paths = []) {
  const doc = loadFormats();
  const opts = byId(doc);
  const text = " " + String(request || "").toLowerCase() + " ";
  const score = new Map();
  const bump = (id, n, why) => { if (!opts.has(id)) return; const s = score.get(id) || { score: 0, why: [] }; s.score += n; if (why && !s.why.includes(why)) s.why.push(why); score.set(id, s); };
  // the option's own words: more words, more specific
  for (const o of doc.options) for (const k of o.keywords || []) if (phrase(k).test(text)) bump(o.id, 3 + k.trim().split(/\s+/).length, `you said "${k}"`);
  // the tile's words point at its default option, weaker
  for (const t of doc.tiles) for (const k of t.keywords || []) if (phrase(k).test(text)) bump(t.default, 1 + k.trim().split(/\s+/).length, `you said "${k}"`);
  // links
  const urls = String(request || "").match(/https?:\/\/\S+/gi) || [];
  for (const u of urls) {
    if (/github\.com\/[^/\s]+\/[^/\s]+\/pull\/\d+/i.test(u)) bump("whats-new", 7, "a pull request link");
    else if (/(youtube\.com|youtu\.be|vimeo\.com)\//i.test(u)) bump("shorter-versions", 2, "a video link");
    else if (/(twitter\.com|x\.com)\/[^/\s]+\/status\//i.test(u)) bump("animated-post", 5, "a link to a post");
    else bump("launch-film", 3, "a website link");
  }
  // files and folders
  const hints = pathHints([].concat(paths || []).filter(Boolean));
  for (const h of hints) bump(h.option, h.score, h.why);
  // evidence for an input: a folder of clips helps every option that asks for one (so "customer story" + a folder beats a bare reel)
  const has = { folder: hints.some((h) => /folder/.test(h.why)), clip: hints.some((h) => /single clip|one clip/.test(h.why)), url: urls.length > 0, song: hints.some((h) => /a song|holds audio/.test(h.why)) };
  for (const [id, s] of score) {
    const o = opts.get(id), ins = (o.inputs || []).map((i) => i.id);
    if (has.folder && ins.some((i) => ["clips", "interviews", "takes", "product-footage"].includes(i))) s.score += 1;
    if (has.url && ins.includes("url")) s.score += 1;
    if (has.song && ins.includes("song")) s.score += 1;
    if (has.clip && ins.includes("one-clip")) s.score += 1;
  }
  // a song with a folder of clips is a music video of takes when the words say music video
  if (has.song && has.folder && /music video|performance/.test(text)) bump("performance-mv", 4, "a song and a folder of takes");
  const ranked = [...score.entries()].map(([id, s]) => ({ id, ...s })).sort((a, b) => b.score - a.score || (opts.get(a.id).status === "ready" ? -1 : 1));
  if (!ranked.length) return { tile: null, option: null, why: "Nothing in the request names what it is, so the picker opens.", confidence: "none", alternatives: [] };
  const top = ranked[0], o = opts.get(top.id);
  const said = top.why.filter((w) => w.startsWith("you said")).map((w) => w.slice(9)).filter((w, i, all) => !all.some((x, j) => j !== i && x.length > w.length && x.includes(w.slice(1, -1))));
  const other = top.why.filter((w) => !w.startsWith("you said"));
  const why = [said.length ? `you said ${said.slice(0, 2).join(" and ")}` : null, other[0] || null].filter(Boolean).join("; ");
  const res = {
    tile: o.tile, option: o.id, why: why.charAt(0).toUpperCase() + why.slice(1), kind: o.kind, status: o.status,
    confidence: ranked[1] && ranked[1].score >= top.score - 1 ? "low" : top.score >= 5 ? "high" : "low",
    alternatives: ranked.slice(1, 4).map((r) => ({ tile: opts.get(r.id).tile, option: r.id, score: r.score })),
    score: top.score,
  };
  if (o.status === "soon") {
    const near = o.soon.nearest ? opts.get(o.soon.nearest) : null;
    res.say = `${o.title} is coming soon: ${o.soon.missing}${near ? ` The nearest thing that works today is ${near.title}.` : ""}`;
    res.nearest = near ? near.id : null;
  } else if (o.status === "partial") res.say = `${o.title} works today, with one thing still being built: ${o.partial}`;
  return res;
}

// --- resolve --------------------------------------------------------------------------
export function resolveFormat(id, { scope } = {}) {
  const doc = loadFormats();
  const o = byId(doc).get(String(id || ""));
  if (!o) return null;
  const sc = scope && SCOPES.includes(scope) ? scope : o.scope_default || null;
  const row = o.story_shapes_by_scope && sc ? o.story_shapes_by_scope[sc] : null;
  const crewKind = o.story && o.story.format === "launch" ? "launch" : o.story && o.story.format === "brand" ? "brand" : null;
  const near = o.soon && o.soon.nearest ? byId(doc).get(o.soon.nearest) : null;
  return {
    id: o.id, tile: o.tile, tile_title: (tileOf(doc, o.tile) || {}).title, title: o.title, kind: o.kind, status: o.status,
    route: o.route, source_mode: o.source_mode, source_modes: o.source_modes, case: o.case,
    inputs: (o.inputs || []).map((i) => ({ id: i.id, required: !!i.required, prompt: i.prompt || (doc.inputs[i.id] || {}).prompt, accepts: (doc.inputs[i.id] || {}).accepts || [] })),
    research: o.research, story: o.story,
    scope: sc, scope_question: o.scope_question || undefined,
    story_shapes: row ? row.shapes : o.story_shapes, forbidden_shapes: row ? row.forbidden : o.forbidden_shapes || [],
    story_shapes_pending: (row ? row.shapes : o.story_shapes).filter((s) => !STORY_MJS_SHAPES.includes(s)),
    length_s: o.length_s, length_note: o.length_note, aspect: o.aspect, aspects: o.aspects,
    ...(o.partial ? { partial: o.partial } : {}),
    ...(o.soon ? { soon: o.soon.missing, nearest: near ? near.id : null, say: `${o.title} is coming soon: ${o.soon.missing}${near ? ` The nearest thing that works today is ${near.title}.` : ""} Never route it quietly to another workflow.` } : {}),
    // the commands this pick feeds (the Director still adds what the run knows: paths, URL, subject, length)
    args: o.route ? {
      sources: ["--kind", o.kind, ...(o.case ? ["--case", o.case] : [])],
      crew_plan: ["--route", o.route, ...(crewKind ? ["--kind", crewKind] : [])],
      video_init: o.route === "reel" || o.route === "presenter" ? null : ["--route", o.route, "--aspect", o.aspect],
      story_pick: o.story && o.story.format ? ["--format", o.story.format] : [],
    } : null,
  };
}

// --- check ----------------------------------------------------------------------------
export function checkFormats({ skillMd = path.join(SKILL_DIR, "SKILL.md"), sourcesLib = path.join(SKILL_DIR, "scripts", "lib", "sources.mjs"), storyMjs = path.join(SKILL_DIR, "scripts", "story.mjs") } = {}) {
  const errors = [], warnings = [];
  let doc;
  try { doc = loadFormats(); } catch (e) { return { ok: false, errors: [`formats.json does not parse: ${e.message}`], warnings }; }
  const E = (m) => errors.push(m), W = (m) => warnings.push(m);
  const skill = fs.existsSync(skillMd) ? fs.readFileSync(skillMd, "utf8") : "";
  const srcText = fs.existsSync(sourcesLib) ? fs.readFileSync(sourcesLib, "utf8") : "";
  const storyText = fs.existsSync(storyMjs) ? fs.readFileSync(storyMjs, "utf8") : "";
  const ids = new Set();
  const opts = byId(doc);
  if (!Array.isArray(doc.tiles) || !doc.tiles.length) E("tiles: missing");
  if (!Array.isArray(doc.options) || !doc.options.length) E("options: missing");
  const shapeIds = new Set(Object.keys(doc.shapes || {}));
  for (const t of doc.tiles || []) {
    for (const k of ["id", "title", "description", "thumbnail", "group", "default"]) if (!t[k]) E(`tile ${t.id || "?"}: ${k} missing`);
    if (!["motion", "footage"].includes(t.group)) E(`tile ${t.id}: group must be motion or footage`);
    if (!(t.options || []).length) E(`tile ${t.id}: no options`);
    if (!(t.options || []).includes(t.default)) E(`tile ${t.id}: default "${t.default}" is not one of its options`);
    for (const id of t.options || []) if (!opts.has(id)) E(`tile ${t.id}: option "${id}" does not exist`); else if (opts.get(id).tile !== t.id) E(`tile ${t.id}: option "${id}" says tile "${opts.get(id).tile}"`);
    if (String(t.description || "").split(/\s+/).length > 16) W(`tile ${t.id}: the description runs over 16 words`);
  }
  const routeInSkill = (r) => new RegExp("`" + esc(r) + "`").test(skill.split("## 2 · Story")[0] || skill);
  for (const o of doc.options || []) {
    const at = `option ${o.id || "?"}`;
    if (ids.has(o.id)) E(`${at}: duplicate id`); ids.add(o.id);
    for (const k of ["id", "tile", "title", "kind", "description", "status", "inputs", "research", "story", "aspect"]) if (o[k] == null || o[k] === "") E(`${at}: ${k} missing`);
    if (!/^[a-z0-9-]+$/.test(o.id || "")) E(`${at}: id must be kebab-case`);
    if (!STATUSES.includes(o.status)) E(`${at}: status must be ${STATUSES.join(" | ")}`);
    if (!Array.isArray(o.story_shapes)) E(`${at}: story_shapes must be a list (empty is fine)`);
    for (const s of [...(o.story_shapes || []), ...(o.forbidden_shapes || [])]) if (!shapeIds.has(s)) E(`${at}: shape "${s}" is not in shapes`);
    for (const s of o.story_shapes || []) if ((o.forbidden_shapes || []).includes(s)) E(`${at}: shape "${s}" is both allowed and forbidden`);
    if (o.story_shapes_by_scope) for (const [sc, row] of Object.entries(o.story_shapes_by_scope)) {
      if (!SCOPES.includes(sc)) E(`${at}: story_shapes_by_scope has an unknown scope "${sc}"`);
      for (const s of [...(row.shapes || []), ...(row.forbidden || [])]) if (!shapeIds.has(s)) E(`${at}: shape "${s}" (scope ${sc}) is not in shapes`);
    }
    if (!("scope_default" in o)) E(`${at}: scope_default missing (null is fine)`);
    else if (o.scope_default != null && !SCOPES.includes(o.scope_default)) E(`${at}: scope_default must be ${SCOPES.join(" | ")} or null`);
    if (o.scope_question && !(o.scope_question.options || []).every((x) => SCOPES.includes(x.scope) && x.label)) E(`${at}: scope_question options need a scope and a label`);
    if (o.source_mode != null && !SOURCE_MODES.includes(o.source_mode)) E(`${at}: source_mode "${o.source_mode}" is not one of ${SOURCE_MODES.join(", ")}`);
    for (const m of o.source_modes || []) if (!SOURCE_MODES.includes(m)) E(`${at}: source_modes has "${m}"`);
    if (o.case && srcText && !srcText.includes(`"${o.case}"`)) E(`${at}: case "${o.case}" is not a case in scripts/lib/sources.mjs`);
    if (o.story && !STORY_PASSES.includes(o.story.pass)) E(`${at}: story.pass "${o.story && o.story.pass}" is not one of ${STORY_PASSES.join(", ")}`);
    if (o.story && o.story.format && !["launch", "explainer", "brand", "social"].includes(o.story.format)) E(`${at}: story.format must be one of story.mjs's formats`);
    for (const i of o.inputs || []) if (!doc.inputs[i.id]) E(`${at}: input "${i.id}" is not in inputs`);
    if (!(o.inputs || []).some((i) => i.required)) E(`${at}: no required input (what is the video made from?)`);
    if (!o.aspect || !(o.aspects || []).includes(o.aspect)) E(`${at}: aspects must include the default aspect`);
    if (o.length_s != null && !(Number(o.length_s) > 0)) E(`${at}: length_s must be a number of seconds or null (with length_note)`);
    if (o.length_s == null && !o.length_note) E(`${at}: length_s is null without a length_note`);
    if (o.status !== "soon") {
      if (!o.route) E(`${at}: a ${o.status} option needs a route`);
      else if (!ROUTES.includes(o.route)) E(`${at}: route "${o.route}" is not a route RasanAI has`);
      else if (skill && !routeInSkill(o.route)) E(`${at}: route "${o.route}" is not in SKILL.md's route table`);
    } else {
      if (!o.soon || !o.soon.missing) E(`${at}: a soon option says what's missing (soon.missing)`);
      if (o.soon && o.soon.nearest && (!opts.has(o.soon.nearest) || opts.get(o.soon.nearest).status === "soon")) E(`${at}: soon.nearest must be an option that works today`);
    }
    if (o.status === "partial" && !o.partial) E(`${at}: a partial option says what's still being built (partial)`);
    if (String(o.description || "").split(/\s+/).length > 16) W(`${at}: the description runs over 16 words`);
    if (/\b(route|grammar|pipeline|workflow|hyperframes|b-?roll|kinetic|isometric|ugc)\b/i.test(o.description || "")) W(`${at}: the description uses a word a non-designer may not know`);
    if (o.status !== "soon" && o.story && o.story.pass !== "none" && !(o.story_shapes || []).length && !["music-to-video", "presenter"].includes(o.route) && o.id !== "something-else") W(`${at}: no story shapes yet`);
  }
  const pending = [...new Set(doc.options.flatMap((o) => [...(o.story_shapes || []), ...Object.values(o.story_shapes_by_scope || {}).flatMap((r) => r.shapes || [])]))]
    .filter((s) => !STORY_MJS_SHAPES.includes(s) && !(storyText && new RegExp(`["']${esc(s)}["']`).test(storyText)));
  if (pending.length) W(`shapes story.mjs does not know yet (pending, W10): ${pending.join(", ")}`);
  for (const [i, x] of Object.entries(doc.inputs || {})) if (!x.prompt) E(`input ${i}: prompt missing`);
  const counts = {}; for (const o of doc.options || []) counts[o.status] = (counts[o.status] || 0) + 1;
  return { ok: !errors.length, tiles: (doc.tiles || []).length, options: (doc.options || []).length, counts, shapes_pending: pending, errors, warnings };
}

// what a brief push carries: the list, and a pre-selected pick when the payload has none (from the kind's exact noun)
export function briefFormat(data) {
  const out = {};
  try {
    if (data.formats == null) out.formats = listFormats();
    const fmt = data.format || (data.fields && data.fields.format) || null;
    if (fmt && (fmt.option || fmt.id)) {
      const o = byId(loadFormats()).get(fmt.option || fmt.id);
      if (o) out.format = { tile: o.tile, option: o.id, why: fmt.why || "", ...(fmt.scope ? { scope: fmt.scope } : {}) };
    } else if (!("format" in data) && data.fields && data.fields.kind) {
      const k = String(data.fields.kind).toLowerCase().trim();
      const o = loadFormats().options.find((x) => x.kind.toLowerCase() === k || x.title.toLowerCase() === k);
      if (o) out.format = { tile: o.tile, option: o.id, why: `From the brief: "${data.fields.kind}"` };
    }
  } catch {}
  return out;
}

// the story shapes of the run's format pick, for story.mjs pick (a stable hook: never throws, null when no format is named).
// The format comes from --format-id, else <run>/decisions.json `format` ({tile, option, scope?} or an id), else the brief's
// submitted fields (<run>/brief.json). <run> is --run, else the truth sheet's run (<run>/story/truth.md).
export function formatShapesForRun({ formatId = null, scope = null, run = null, truthPath = null } = {}) {
  try {
    const dir = run ? path.resolve(String(run)) : truthPath ? path.resolve(path.dirname(String(truthPath)), "..") : null;
    const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch { return null; } };
    let pick = formatId ? { option: String(formatId) } : null;
    if (!pick && dir) {
      const dec = read("decisions.json") || {}, br = read("brief.json") || {};
      const f = dec.format || (br.fields || br).format || null;
      pick = typeof f === "string" ? { option: f } : f && (f.option || f.id) ? { option: f.option || f.id, scope: f.scope } : null;
    }
    if (!pick) return null;
    const r = resolveFormat(pick.option, { scope: scope || pick.scope || null });
    if (!r) return null;
    return { format: r.id, title: r.title, status: r.status, scope: r.scope, shapes: r.story_shapes, forbidden: r.forbidden_shapes, pending: r.story_shapes_pending, sure_bold_wild: r.story_shapes.slice(0, 3) };
  } catch { return null; }
}
