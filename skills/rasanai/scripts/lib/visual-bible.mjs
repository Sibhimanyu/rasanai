// The compact visual bible (Plan 04 L2/L3): a machine-readable PROJECTION of the look's DESIGN.md + motion contract (+ grammar, + brand), carrying a
// source digest so a worker knows when it is stale. It is not another design system: DESIGN.md stays the authored source and the existing
// motion contract (blend.json motion_contract) stays the motion authority; this file only restates them for workers, with typed sections:
//   palette (role-based) | type (exact font identities, roles, locale fallback) | layout (grid, safe regions, relative hierarchy, UI treatment)
//   conventions (material, light, camera, depth) | motion (vocabulary, timing, exceptions) | transitions (by semantic relation, no mandatory inventory)
//   imagery (treatment, limits, finishing treatments each tied to what it communicates) | variation (constant vs varies, few film-wide commitments)
//   continuity_anchors | constraints {hard (brand, authorization), defaults (creative)} | exceptions (local, rationale, approval)
// A deliberate exception to a HARD constraint is local (scene or beat ids), needs a rationale and an approval, and never becomes a global rule.
// Medium (additive): inputs.medium / inputs.mediumFile (design/<label>/medium.json, medium-contract@1) adds a `medium` section and its digest to the source hash;
// a look with no medium contract hashes and compiles exactly as before. The contract is an approved-Look extension, never a timing or approval source.
// Old looks (no blend, no grammar) still compile: every missing input is an empty section, never an error.
//   compileVisualBible(inputs) -> bible        validateVisualBible(b) -> { ok, problems, warnings }
//   sourceDigest(inputs) / bibleCurrent(b, inputs) -> stale check      projectForWorker(b, need) -> the subset a scene worker gets
//   addException(b, ex) -> { ok, bible } | { ok:false, problems }      localeScript(locale) / fontFallbacks(script)
import fs from "node:fs";
import path from "node:path";
import { canonicalDigest, SCHEMA_VERSION } from "./contracts.mjs";
import { contrast, readDesignMd } from "./design-md.mjs";
import { destinationOf, zonesFor } from "./safezones.mjs";
import { mediumContractDigest, projectMediumForWorker } from "./medium-contract.mjs";

const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const arr = (x) => (Array.isArray(x) ? x : []);
const str = (x, d = "") => (typeof x === "string" ? x : x == null ? d : String(x));
const T = (x) => str(x).trim();
const readJ = (p) => { try { return p && fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null; } catch { return null; } };
const readT = (p) => { try { return p && fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null; } catch { return null; } };

export const BIBLE_FORMAT = "visual-bible@1";
export const SECTIONS = ["palette", "type", "layout", "conventions", "motion", "transitions", "imagery", "variation", "continuity_anchors", "constraints", "exceptions"];
// semantic relationships between neighbouring beats (see Plan 05 E4); a transition is chosen from the relationship, never from an effect inventory
export const RELATIONS = ["continuation", "contrast", "example", "cause", "scale_change", "separation"];
export const FINISH_KINDS = ["grain", "blur", "vignette", "chromatic_aberration", "camera_drift", "3d", "glow", "halftone", "other"];
export const MAX_COMMITMENTS = 6;

// a plain default per relation: simple cuts are first-class, a morph or traveling camera must be earned by a real continuation
export const DEFAULT_TRANSITIONS = Object.freeze({
  continuation: { kind: "carry", note: "the same object, screen or camera continues; only here may something travel across the seam" },
  contrast: { kind: "cut", note: "a hard cut; the change of idea is the point" },
  example: { kind: "cut", note: "another instance of the same idea; same frame structure, new content" },
  cause: { kind: "handoff", note: "one thing visibly triggers the next; keep the causal object on screen across the seam and never imply a real sync that does not exist" },
  scale_change: { kind: "push-or-cut", note: "zoom or re-frame when the change is of scale; otherwise cut" },
  separation: { kind: "cut", note: "separate contexts stay separate: no morph, no shared travel" },
});

// locale -> script -> fallback stacks. Script names follow CSS/Unicode; fallbacks are open families available on Google Fonts (verify at stage time).
const SCRIPT_BY_LANG = { hi: "devanagari", mr: "devanagari", ne: "devanagari", ta: "tamil", te: "telugu", kn: "kannada", ml: "malayalam", bn: "bengali", gu: "gujarati", pa: "gurmukhi", ar: "arabic", fa: "arabic", ur: "arabic", he: "hebrew", ja: "cjk-jp", zh: "cjk-sc", ko: "cjk-kr", th: "thai", ru: "cyrillic", uk: "cyrillic", bg: "cyrillic", el: "greek" };
const FALLBACKS = { latin: [], devanagari: ["Noto Sans Devanagari", "Mukta"], tamil: ["Noto Sans Tamil"], telugu: ["Noto Sans Telugu"], kannada: ["Noto Sans Kannada"], malayalam: ["Noto Sans Malayalam"], bengali: ["Noto Sans Bengali"], gujarati: ["Noto Sans Gujarati"], gurmukhi: ["Noto Sans Gurmukhi"], arabic: ["Noto Naskh Arabic", "Noto Sans Arabic"], hebrew: ["Noto Sans Hebrew"], "cjk-jp": ["Noto Sans JP"], "cjk-sc": ["Noto Sans SC"], "cjk-kr": ["Noto Sans KR"], thai: ["Noto Sans Thai"], cyrillic: ["Noto Sans"], greek: ["Noto Sans"] };
export const localeScript = (locale) => { const l = T(locale).toLowerCase(); if (!l) return "latin"; if (/^zh[-_](tw|hk|hant)/.test(l)) return "cjk-sc"; return SCRIPT_BY_LANG[l.split(/[-_]/)[0]] || "latin"; };
export const fontFallbacks = (script) => [...(FALLBACKS[script] || [])];

const sha = (v) => (v == null ? null : canonicalDigest(v));
const textDigest = (t) => (t == null ? null : canonicalDigest({ text: t }));

// the digest of everything the bible is projected from; a changed DESIGN.md, contract, grammar or brand file makes the bible stale
const mediumOf = (inputs) => (isObj(inputs && inputs.medium) ? inputs.medium : readJ(inputs && inputs.mediumFile));
export function sourceDigest(inputs = {}) {
  const med = mediumOf(inputs);
  const src = {
    design_md: textDigest(readT(inputs.designMdFile)),
    motion_contract: sha(inputs.blend && inputs.blend.motion_contract ? inputs.blend.motion_contract : null),
    grammar: sha(inputs.grammar || null),
    brand: textDigest(readT(inputs.brandMdFile)),
    brand_assets: sha(inputs.brandAssets || null),
    locale: T(inputs.locale) || null, destination: T(inputs.destination) || null, aspect: T(inputs.aspect) || null,
    // only present with a contract, so every legacy bible keeps its digest
    ...(isObj(med) ? { medium: mediumContractDigest(med) } : {}),
  };
  return { parts: src, digest: canonicalDigest(src) };
}
export const bibleCurrent = (bible, inputs) => { const d = sourceDigest(inputs).digest; return { current: !!(bible && bible.source && bible.source.source_digest === d), expected: d, found: bible && bible.source ? bible.source.source_digest : null }; };

const hex = (c) => (typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : null);

// inputs: { designMdFile, blend, grammar, brandMdFile, brandAssets, brandLock, destination, aspect, locale, fontStatus, continuity, variation, treatments, exceptions, label, series }
export function compileVisualBible(inputs = {}) {
  const warnings = [];
  let B = null;
  if (inputs.designMdFile && fs.existsSync(inputs.designMdFile)) { try { B = readDesignMd(inputs.designMdFile); } catch (e) { warnings.push(`DESIGN.md could not be read: ${e.message}`); } }
  let BR = null;
  if (inputs.brandMdFile && fs.existsSync(inputs.brandMdFile)) { try { BR = readDesignMd(inputs.brandMdFile); } catch (e) { warnings.push(`brand DESIGN.md could not be read: ${e.message}`); } }
  const blend = isObj(inputs.blend) ? inputs.blend : {};
  const recipe = isObj(inputs.recipe) ? inputs.recipe : {};
  const g = isObj(inputs.grammar) ? inputs.grammar : null;
  const mc = isObj(blend.motion_contract) ? blend.motion_contract : null;
  const brandLock = !!(inputs.brandLock || BR);
  const roles = (B && B.roles) || {};
  const brandRoles = (BR && BR.roles) || {};

  // palette: roles, never a flat swatch list; intent is the role's own note when the DESIGN.md gave one
  const roleNames = (B && B.role_names) || {};
  const palRoles = {};
  for (const r of ["canvas", "ink", "accent", "support", "surface", "muted", "rule"]) { const h = hex(roles[r]); if (h) palRoles[r] = { hex: h, name: roleNames[r] || r }; }
  const pal = {
    roles: palRoles,
    contrast: { ink_on_canvas: palRoles.ink && palRoles.canvas ? Math.round(contrast(palRoles.ink.hex, palRoles.canvas.hex) * 100) / 100 : null, accent_on_canvas: palRoles.accent && palRoles.canvas ? Math.round(contrast(palRoles.accent.hex, palRoles.canvas.hex) * 100) / 100 : null },
    permitted_accents: palRoles.accent ? [palRoles.accent.hex] : [],
    intentions: { accent: "rationed to the focal element", ink: "reading text", canvas: "the ground" },
  };

  // type: exact identities; a family with no verified asset is marked, never silently substituted
  const script = localeScript(inputs.locale);
  const fb = fontFallbacks(script);
  const fontStatus = isObj(inputs.fontStatus) ? inputs.fontStatus : {};
  const brandFiles = arr(inputs.brandAssets && inputs.brandAssets.fonts);
  const fontRow = (role, f, sizeRole) => {
    if (!f || !f.family) return null;
    const files = brandFiles.filter((x) => x && T(x.family).toLowerCase() === f.family.toLowerCase()).map((x) => x.file);
    const st = fontStatus[f.family] || (files.length ? "available" : "unverified");
    return {
      role, family: f.family, weights: f.weight ? [f.weight] : [], size_role: sizeRole, asset: { id: `${f.family}${f.weight ? `@${f.weight}` : ""}`, source: files.length ? "brand-file" : "family-name", files, status: st },
      line_breaking: { max_measure_ch: role === "display" ? 18 : 62, balance: role === "display" }, locale: { script, fallback: fb, fallback_needed: script !== "latin" },
    };
  };
  const typeRoles = [fontRow("display", B && B.fonts && B.fonts.display, "largest, one idea per frame"), fontRow("body", B && B.fonts && B.fonts.body, "supporting copy and UI labels"), fontRow("mono", B && B.fonts && B.fonts.mono, "data and code")].filter(Boolean);
  const missing_assets = typeRoles.filter((r) => r.asset.status === "missing").map((r) => r.family);

  // layout and safe regions: reuse the one safezones table
  const dest = destinationOf({ destination: inputs.destination, aspect: inputs.aspect });
  const z = zonesFor(dest, inputs.aspect);
  const layout = {
    grid: { columns: Number(blend.grid_columns) || null, margin_pct: Math.round((z.margin.left || 0) * 1000) / 10, note: "from the look's Layout and shape section; the numbers here are the destination's safe margins" },
    safe_regions: { destination: z.id, aspect: z.aspect, overlays: z.overlays, margin: z.margin },
    hierarchy: ["one focal element per frame", "supporting copy at most two sizes below it", "UI proof sized to be read at the viewing size"],
    ui_treatment: { screenshots: "real screens, never redrawn with invented content", radius: B && B.radii || {}, shadows: arr(B && B.shadows).map((s) => s.name) },
  };

  // material, light, camera: from the recipe when it says so; depth is a choice, not a default
  const three = recipe.three || blend.three || null;
  const conventions = {
    material: T(blend.material) || T(recipe.material) || null, light: T(blend.light) || null, camera: T(blend.camera) || (g && T(g.camera)) || null,
    dimensionality: three ? "mixed" : "2d", depth_needed: three ? true : null,
    seam_rule: three ? "a 2D to 3D cut is a cut between two contexts unless a continuity link says the object carries over" : null, three: three || null,
  };

  // motion: the existing contract is the authority; the text section only adds vocabulary
  const technique = (t) => (isObj(t) ? T(t.id || t.name) : T(t));
  const motion = {
    authority: mc ? "blend.motion_contract" : "DESIGN.md Motion and camera",
    scale_ms: mc ? arr(mc.scale_ms) : [], easing: mc ? mc.easing || {} : {}, holds: mc ? mc.holds || null : null,
    vocabulary: arr(g && g.techniques).map(technique).filter(Boolean).slice(0, 12), frame_device: g && T(g.frame_device || (g.frame && g.frame.device)) || null,
    emphasis: mc && mc.emphasis || null, relative_timing: "durations are seconds on the film's own clock; frame counts are derived at the film's rate, never pasted from a 60 fps source",
    text: B ? B.motion : "", exceptions: [],
  };

  const finishPolicy = ["default", "chosen", "none"].includes(T(inputs.finishPolicy || blend.finish_policy)) ? T(inputs.finishPolicy || blend.finish_policy) : null;
  const imagery = {
    finish_policy: finishPolicy, finish_rationale: T(inputs.finishRationale || blend.finish_rationale) || null,
    treatment: T(blend.imagery) || (B && /imagery/i.test(B.overview) ? B.overview : "") || null,
    limits: arr(blend.imagery_limits), texture_finish: arr(inputs.treatments).map((t) => ({ kind: FINISH_KINDS.includes(t.kind) ? t.kind : "other", amount: t.amount ?? null, serves: T(t.serves) || null, scope: T(t.scope) || "film" })),
  };
  if (three && !imagery.texture_finish.some((t) => t.kind === "3d")) imagery.texture_finish.push({ kind: "3d", amount: null, serves: T(blend.three_reason) || null, scope: "film" });

  const variation = isObj(inputs.variation) ? inputs.variation : defaultVariation();
  const anchors = isObj(inputs.continuity) ? inputs.continuity : {};
  const continuity_anchors = { objects: arr(anchors.objects), screens: arr(anchors.screens), framing: arr(anchors.framing), characters: arr(anchors.characters), sound_motifs: arr(anchors.sound_motifs) };

  // hard vs default: with a brand, its palette/type/logo are hard; everything else the look chose is a creative default
  const hard = [], defaults = [];
  if (brandLock) {
    for (const r of ["canvas", "ink", "accent"]) { const h = hex(brandRoles[r]); if (h) hard.push({ id: `brand.palette.${r}`, kind: "brand", value: h, source: "brand DESIGN.md" }); }
    if (BR && BR.fonts && BR.fonts.display) hard.push({ id: "brand.type.display", kind: "brand", value: BR.fonts.display.family, source: "brand DESIGN.md" });
    if (BR && BR.fonts && BR.fonts.body) hard.push({ id: "brand.type.body", kind: "brand", value: BR.fonts.body.family, source: "brand DESIGN.md" });
    hard.push({ id: "brand.logo.usage", kind: "brand", value: "only supplied logo files; no redraw, no recolour", source: "brand kit" });
    hard.push({ id: "fact.ui", kind: "fact", value: "shown product UI and numbers are the real ones", source: "briefing" });
  }
  const hardIds = new Set(hard.map((h) => h.id));
  for (const r of Object.keys(palRoles)) if (!hardIds.has(`brand.palette.${r}`)) defaults.push({ id: `look.palette.${r}`, value: palRoles[r].hex, source: "look DESIGN.md" });
  for (const t of typeRoles) if (!hardIds.has(`brand.type.${t.role}`)) defaults.push({ id: `look.type.${t.role}`, value: t.family, source: "look DESIGN.md" });
  for (const k of ["material", "light", "camera"]) if (conventions[k]) defaults.push({ id: `look.${k}`, value: conventions[k], source: "look" });
  if (motion.scale_ms.length) defaults.push({ id: "look.motion.scale_ms", value: motion.scale_ms, source: "motion contract" });
  if (inputs.series && inputs.series.defaults) for (const [k, v] of Object.entries(inputs.series.defaults)) defaults.push({ id: `series.${k}`, value: v, source: `saved series ${T(inputs.series.name) || ""}`.trim(), provenance: "saved_series_default" });

  const medium = mediumOf(inputs);
  const sd = sourceDigest(inputs);
  const bible = {
    schema_version: SCHEMA_VERSION, bible_format: BIBLE_FORMAT, look: { label: T(inputs.label) || T(blend.label) || null, name: (B && B.name) || T(blend.name) || null },
    source: { design_md: inputs.designMdFile ? path.basename(path.dirname(path.resolve(inputs.designMdFile))) + "/" + path.basename(inputs.designMdFile) : null, ...sd.parts, source_digest: sd.digest },
    palette: pal, type: { roles: typeRoles, locale: { script, fallback: fb }, missing_assets }, layout, conventions, motion,
    transitions: { by_relation: { ...DEFAULT_TRANSITIONS, ...(isObj(inputs.transitions) ? inputs.transitions : {}) }, note: "chosen from the relationship between beats; a hard cut between separate contexts is always valid" },
    imagery, variation, continuity_anchors, ...(isObj(medium) ? { medium: { digest: mediumContractDigest(medium), contract: medium } } : {}), constraints: { hard, defaults, ...(normFontAvoid(inputs.fontAvoid).length ? { font_avoid: normFontAvoid(inputs.fontAvoid) } : {}) }, exceptions: arr(inputs.exceptions),
    warnings,
  };
  bible.digest = canonicalDigest({ ...bible, digest: undefined });
  return bible;
}

// Plan 10: "don't use this font" -> a scoped font_avoid list ([{ family, source?, scope? }] or plain family names). A listed family on a type role is a VIOLATION that is reported, never silently used.
export const normFontAvoid = (list) => arr(list).map((e) => (isObj(e) ? { ...e, family: T(e.family) } : { family: T(e) })).filter((e) => e.family);
export function fontAvoidViolations(families, avoid) {
  const bad = new Map(normFontAvoid(avoid).map((e) => [e.family.toLowerCase(), e]));
  return arr(families).map((f) => (isObj(f) ? { role: f.role || null, family: T(f.family) } : { role: null, family: T(f) })).filter((f) => f.family && bad.has(f.family.toLowerCase()))
    .map((f) => ({ ...f, problem: `font ${f.family}${f.role ? ` (${f.role})` : ""} is on the avoid list${bad.get(f.family.toLowerCase()).source ? ` (${bad.get(f.family.toLowerCase()).source})` : ""}: choose another typeface or approve a local exception` }));
}

export const defaultVariation = () => ({ constant: ["typeface and its roles", "interface geometry", "the accent's one job"], varies: ["shot scale", "background density by beat", "which element the accent marks"], commitments: [] });

export function validateVisualBible(b) {
  const problems = [], warnings = [];
  if (!isObj(b)) return { ok: false, problems: ["not an object"], warnings };
  for (const s of SECTIONS) if (b[s] === undefined) problems.push(`section ${s} is missing`);
  if (!b.source || !b.source.source_digest) problems.push("source.source_digest is missing: a worker cannot tell when the bible is stale");
  const roles = b.palette && b.palette.roles || {};
  for (const r of ["canvas", "ink", "accent"]) if (!roles[r]) warnings.push(`palette has no ${r} role`);
  const tr = arr(b.type && b.type.roles);
  if (!tr.some((r) => r.role === "display")) warnings.push("no display font identity");
  for (const v of fontAvoidViolations(tr, b.constraints && b.constraints.font_avoid)) problems.push(v.problem);
  for (const m of arr(b.type && b.type.missing_assets)) problems.push(`font asset missing: ${m} (say so before the look is committed; do not substitute silently)`);
  for (const r of tr) if (r.locale && r.locale.fallback_needed && !arr(r.locale.fallback).length) problems.push(`font ${r.family}: locale needs a fallback stack`);
  const by = (b.transitions && b.transitions.by_relation) || {};
  for (const k of Object.keys(by)) if (!RELATIONS.includes(k)) problems.push(`transition relation ${JSON.stringify(k)} is not one of ${RELATIONS.join(", ")}`);
  // L3: finishing treatments are chosen for what they communicate, never because the renderer supports them
  if (b.imagery && b.imagery.finish_policy === "none" && !T(b.imagery.finish_rationale)) problems.push("finish_policy none needs finish_rationale: turning the finish layer off is a choice tied to what the film communicates");
  for (const t of arr(b.imagery && b.imagery.texture_finish)) if (!T(t.serves)) problems.push(`treatment ${t.kind}: name what it communicates (serves); grain, blur, vignette, chromatic aberration, camera drift and 3D are neither default nor banned`);
  if (b.medium && (!isObj(b.medium.contract) || b.medium.digest !== mediumContractDigest(b.medium.contract))) problems.push("medium: the stored digest does not match its contract (recompile the bible from design/<label>/medium.json)");
  const commitments = arr(b.variation && b.variation.commitments);
  if (commitments.length > MAX_COMMITMENTS) problems.push(`${commitments.length} film-wide commitments: keep a few (at most ${MAX_COMMITMENTS}) that matter, not dozens`);
  if (!arr(b.variation && b.variation.constant).length || !arr(b.variation && b.variation.varies).length) warnings.push("variation should say both what stays constant and what may vary");
  // exceptions
  const hardIds = new Set(arr(b.constraints && b.constraints.hard).map((h) => h.id));
  for (const e of arr(b.exceptions)) {
    const tag = `exception ${T(e && e.id) || "?"}`;
    if (!isObj(e) || !T(e.id)) { problems.push("an exception needs an id"); continue; }
    if (!T(e.rationale)) problems.push(`${tag}: a deliberate exception needs a local rationale`);
    if (!arr(e.scope && e.scope.beat_ids).length && !arr(e.scope && e.scope.scene_ids).length) problems.push(`${tag}: an exception is local (beat_ids or scene_ids); it cannot become a global rule`);
    if (hardIds.has(e.constraint_id) && e.approved !== true) problems.push(`${tag}: it changes the brand constraint ${e.constraint_id}, which needs approval (approved: true with approved_by)`);
    if (hardIds.has(e.constraint_id) && e.approved === true && !T(e.approved_by)) problems.push(`${tag}: approved_by is required`);
  }
  return { ok: !problems.length, problems, warnings };
}

export function addException(bible, ex) {
  const e = { id: T(ex && ex.id), constraint_id: T(ex && ex.constraint_id), scope: { beat_ids: arr(ex && ex.scope && ex.scope.beat_ids), scene_ids: arr(ex && ex.scope && ex.scope.scene_ids) }, rationale: T(ex && ex.rationale), approved: !!(ex && ex.approved), approved_by: T(ex && ex.approved_by) };
  const next = { ...bible, exceptions: [...arr(bible && bible.exceptions).filter((x) => x.id !== e.id), e] };
  const v = validateVisualBible(next);
  const mine = v.problems.filter((p) => p.startsWith(`exception ${e.id}`) || p === "an exception needs an id");
  return mine.length ? { ok: false, problems: mine } : { ok: true, bible: next };
}

// L5: a scene worker gets the subset it needs, with the digest it was cut from. need: { scene_id, beat_ids?, relations?: [..], anchors?: {objects:[ids]...}, sections?: [...] }
export function projectForWorker(bible, need = {}) {
  if (!isObj(bible)) return null;
  const sceneIds = new Set([need.scene_id, ...arr(need.beat_ids)].filter(Boolean));
  const rel = arr(need.relations).filter((r) => RELATIONS.includes(r));
  const pick = (list, ids) => (ids && ids.length ? arr(list).filter((a) => ids.includes(a && (a.id || a))) : []);
  const a = need.anchors || {};
  const by = (bible.transitions && bible.transitions.by_relation) || {};
  return {
    schema_version: SCHEMA_VERSION, projection: "scene-worker", of: BIBLE_FORMAT, source_digest: bible.source && bible.source.source_digest, bible_digest: bible.digest || null, scene_id: need.scene_id || null,
    palette: { roles: bible.palette && bible.palette.roles }, type: { roles: arr(bible.type && bible.type.roles).map((r) => ({ role: r.role, asset: r.asset, line_breaking: r.line_breaking, locale: r.locale })), missing_assets: bible.type && bible.type.missing_assets },
    safe_regions: bible.layout && bible.layout.safe_regions, motion: { scale_ms: bible.motion && bible.motion.scale_ms, easing: bible.motion && bible.motion.easing, vocabulary: bible.motion && bible.motion.vocabulary },
    transitions: Object.fromEntries((rel.length ? rel : Object.keys(by)).filter((k) => by[k]).map((k) => [k, by[k]])),
    treatments: arr(bible.imagery && bible.imagery.texture_finish), constraints: { hard: arr(bible.constraints && bible.constraints.hard) },
    exceptions: arr(bible.exceptions).filter((e) => !sceneIds.size ? false : arr(e.scope && e.scope.scene_ids).some((s) => sceneIds.has(s)) || arr(e.scope && e.scope.beat_ids).some((s) => sceneIds.has(s))),
    anchors: { objects: pick(bible.continuity_anchors && bible.continuity_anchors.objects, arr(a.objects)), screens: pick(bible.continuity_anchors && bible.continuity_anchors.screens, arr(a.screens)), characters: pick(bible.continuity_anchors && bible.continuity_anchors.characters, arr(a.characters)), sound_motifs: pick(bible.continuity_anchors && bible.continuity_anchors.sound_motifs, arr(a.sound_motifs)) },
    ...(bible.medium ? { medium: projectMediumForWorker(bible.medium.contract, { role: need.role, beatIds: need.beat_ids, shotIds: need.shot_ids, events: need.events, budget: need.medium_budget }) } : {}),
    may_request_change: true, may_redefine_shared: false,
  };
}
