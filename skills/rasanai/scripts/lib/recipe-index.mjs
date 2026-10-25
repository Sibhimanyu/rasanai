// Recipe index and bounded retrieval (Plan 08 K3).
// Retrieval order (a universal contract, then narrower): contract -> communication-kind guide -> selected visual/runtime recipe -> failure recovery ONLY when asked.
// The index is DERIVED, not another catalog to maintain: motion-kit/catalog.json rows (annotated implemented/not by lib/motion-kit/catalog.mjs), the house
// breakdowns (lib/story-refs.mjs), and a small static table of the guide files in references/ with the kinds and runtimes they apply to. A recipe whose
// code or file is not there is excluded from executable suggestions unless the task is explicitly to implement it. External SKILL.md files are never
// concatenated or imported: provenance for outside mechanics lives in third_party/SOURCES.md and INTAKE.md (adaptation mode, licence, destination).
import fs from "node:fs";
import path from "node:path";
import { SKILL_DIR } from "./common.mjs";
import { KIND_IDS } from "./communication.mjs";
import { loadCatalog, annotate } from "./motion-kit/catalog.mjs";
import { HOUSE_REFERENCES } from "./story-refs.mjs";

export const INDEX_VERSION = 1;
export const LAYERS = ["contract", "kind_guide", "recipe", "failure_recovery"];
export const RESOURCE_CLASSES = ["light", "medium", "heavy"]; // light: text/DOM; medium: DOM + media; heavy: 3D, generated plates, long render
const RANK = { light: 0, medium: 1, heavy: 2 };
const ALL = ["*"];
const E = (id, layer, file, o = {}) => ({ id, layer, path: file, capabilities: [], assets: [], runtime: "any", kinds: ALL, resource_class: "light", license_basis: "RasanAI original guidance", limits: "", ...o });

// guide files: only entries whose file exists in this skill are returned (`file_present`)
const GUIDES = [
  E("contract-craft", "contract", "references/craft.md", { capabilities: ["timing", "composition", "transitions", "anti-slop gates"], limits: "defaults with recorded exceptions; not every rule binds every film kind" }),
  E("contract-crew", "contract", "references/crew.md", { capabilities: ["dispatch protocol", "permissions", "ownership"] }),
  E("kind-product-first", "kind_guide", "references/product-first.md", { kinds: ["whole-product-introduction", "single-feature-announcement", "workflow-demo", "performance-ad"], capabilities: ["product-first launch structure"], limits: "for films whose proof is the real product" }),
  E("kind-launch-film", "kind_guide", "references/launch-film.md", { kinds: ["whole-product-introduction", "single-feature-announcement", "performance-ad"], capabilities: ["launch structures", "grammar checklist"] }),
  E("kind-brand-film", "kind_guide", "references/brand-film.md", { kinds: ["brand-manifesto", "identity-reveal", "whole-product-introduction"], capabilities: ["brand film grammar"] }),
  E("kind-story", "kind_guide", "references/story.md", { kinds: KIND_IDS.filter((k) => k !== "music-lyric-film"), capabilities: ["treatment structure"] }),
  E("kind-script", "kind_guide", "references/script.md", { kinds: ["instructional-explainer", "evidence-case-study", "workflow-demo"], capabilities: ["narration structure"] }),
  E("kind-lyric-video", "kind_guide", "references/lyric-video.md", { kinds: ["music-lyric-film"], capabilities: ["lyric treatment"], assets: ["audio", "lyrics"] }),
  E("kind-reel", "kind_guide", "references/reel.md", { kinds: ["footage-led-story"], capabilities: ["cut from footage"], assets: ["footage"] }),
  E("kind-presenter", "kind_guide", "references/presenter.md", { kinds: ["footage-led-story", "instructional-explainer"], capabilities: ["keyed talking head"], assets: ["footage"] }),
  E("kind-dataviz", "kind_guide", "references/dataviz.md", { kinds: ["evidence-case-study", "instructional-explainer"], capabilities: ["faithful charts"] }),
  E("kind-2d-character", "kind_guide", "references/2d-character.md", { kinds: ["character-short"], capabilities: ["2D character performance"], runtime: "dom-gsap", resource_class: "medium" }),
  E("recipe-vocabulary", "recipe", "references/vocabulary.md", { runtime: "dom-gsap", capabilities: ["film terms with HTML/CSS/GSAP recipes"], limits: "look up the named term; do not read it whole" }),
  E("recipe-3d", "recipe", "references/3d.md", { runtime: "stage3d", capabilities: ["3D scenes", "camera", "light", "2D-3D seams"], resource_class: "heavy", limits: "only when the score names a 3D or hybrid scene" }),
  E("recipe-orbs", "recipe", "references/orbs.md", { runtime: "dom-gsap", capabilities: ["orb runtime"], resource_class: "medium", license_basis: "MIT, adapted (third_party/thinking-orbs)" }),
  E("recipe-ui-rebuild", "recipe", "references/ui-rebuild.md", { runtime: "dom-gsap", capabilities: ["captured screen rebuilt as DOM"], assets: ["screens"], kinds: ["whole-product-introduction", "single-feature-announcement", "workflow-demo", "performance-ad", "evidence-case-study"] }),
  E("recipe-cinematography", "recipe", "references/cinematography.md", { runtime: "any", capabilities: ["camera and lens language"] }),
  E("recipe-imagery", "recipe", "references/imagery.md", { runtime: "any", capabilities: ["imagery direction"], resource_class: "medium" }),
  E("recipe-sound", "recipe", "references/sound.md", { runtime: "any", capabilities: ["music edit", "sfx", "mix"], assets: ["audio"] }),
  E("failure-motion-gate", "failure_recovery", "references/craft.md", { capabilities: ["motion gate findings"], limits: "craft.md sections 3 and 10; read only after a gate reports" }),
  E("failure-finish-delivery", "failure_recovery", "references/finish.md", { capabilities: ["finish and delivery problems"] }),
];

const fileThere = (root, rel) => { try { return fs.existsSync(path.join(root, rel)); } catch { return false; } };

// -> every record, each with `file_present` / `implemented`. Deterministic: same tree, same index.
export function buildIndex({ skillRoot = SKILL_DIR, catalogFile } = {}) {
  const out = GUIDES.map((g) => ({ ...g, implemented: fileThere(skillRoot, g.path), implemented_reason: fileThere(skillRoot, g.path) ? "" : `${g.path} is not in this skill` }));
  try {
    const { items } = loadCatalog(catalogFile);
    for (const it of annotate(items, skillRoot)) {
      const supports = Array.isArray(it.supports) ? it.supports : [];
      const heavy = supports.includes("stage3d") || it.family === "camera-space";
      out.push(E(it.id, "recipe", "motion-kit/catalog.json#" + it.id, {
        capabilities: [it.family, it.role, it.summary].filter(Boolean), assets: Array.isArray(it.requires_assets) ? it.requires_assets : [],
        runtime: supports.includes("dom-gsap") ? "dom-gsap" : supports[0] || "any", kinds: ALL, resource_class: heavy ? "heavy" : (it.requires_assets || []).length ? "medium" : "light",
        license_basis: it.license || "unreviewed", limits: it.avoid_when || "", family: it.family, version: it.version,
        implemented: it.implemented === true, implemented_reason: it.implemented_reason || "",
      }));
    }
  } catch (e) { out.push({ id: "motion-kit-catalog", layer: "recipe", implemented: false, implemented_reason: `catalog unreadable: ${e.message}`, kinds: ALL, capabilities: [], assets: [], runtime: "any", resource_class: "light", license_basis: "n/a", limits: "", path: "motion-kit/catalog.json" }); }
  for (const r of HOUSE_REFERENCES) out.push(E(r.id, "recipe", r.provenance.file, { capabilities: [r.summary], kinds: r.kinds, runtime: "any", license_basis: r.provenance.license, limits: "informs structure for the named kinds only", implemented: fileThere(skillRoot, r.provenance.file), source_roles: r.roles }));
  return { index_version: INDEX_VERSION, records: out };
}

const words = (s) => String(s || "").toLowerCase().match(/[a-z0-9]+/g) || [];
// query: { kind, runtime ("dom-gsap" default), have_assets:[], want:[words], role, failure:boolean, limit (recipes, default 4, max 6),
//          max_resource_class ("heavy" default), include_unimplemented:boolean (only for a task that IS implementing it) }
// -> { shortlist:[{id, layer, path, why, resource_class, license_basis, limits}], excluded:[{id, reason}], counts }
export function shortlist(query = {}, index = buildIndex()) {
  const q = query || {};
  const runtime = q.runtime || "dom-gsap";
  const have = new Set((q.have_assets || []).map(String));
  const want = new Set((q.want || []).flatMap(words));
  const cap = RANK[q.max_resource_class] ?? RANK.heavy;
  const limit = Math.max(1, Math.min(6, Number(q.limit) || 4));
  const excluded = [];
  const ok = (r) => {
    if (!r.implemented && !q.include_unimplemented) { excluded.push({ id: r.id, reason: r.implemented_reason || "not implemented" }); return false; }
    if (r.kinds !== ALL && !r.kinds.includes("*") && q.kind && !r.kinds.includes(q.kind)) return false; // wrong kind: silent, not interesting
    if (r.runtime !== "any" && r.runtime !== runtime) return false;
    if (RANK[r.resource_class] > cap) { excluded.push({ id: r.id, reason: `resource class ${r.resource_class} above the allowed ${q.max_resource_class}` }); return false; }
    const miss = (r.assets || []).filter((a) => !have.has(a));
    if (miss.length) { excluded.push({ id: r.id, reason: `needs assets not present: ${miss.join(", ")}` }); return false; }
    return true;
  };
  const score = (r) => (r.capabilities || []).reduce((n, c) => n + words(c).filter((w) => want.has(w)).length, 0) + words(r.id).filter((w) => want.has(w)).length * 2 + (r.kinds.includes(q.kind) ? 1 : 0);
  const pool = index.records.filter(ok);
  const take = (layer, n) => pool.filter((r) => r.layer === layer).map((r) => ({ r, s: score(r) })).sort((a, b) => b.s - a.s || a.r.id.localeCompare(b.r.id)).slice(0, n).map((x) => x.r);
  const pick = [...take("contract", 2), ...take("kind_guide", 2), ...take("recipe", limit), ...(q.failure ? take("failure_recovery", 1) : [])];
  const why = { contract: "universal contract", kind_guide: `guide for ${q.kind || "any kind"}`, recipe: `recipe for ${runtime}${want.size ? " matching " + [...want].slice(0, 4).join(" ") : ""}`, failure_recovery: "failure recovery requested" };
  return {
    index_version: index.index_version, query: { kind: q.kind || null, runtime, have_assets: [...have], want: [...want], failure: !!q.failure, limit },
    shortlist: pick.map((r) => ({ id: r.id, layer: r.layer, path: r.path, why: why[r.layer], resource_class: r.resource_class, license_basis: r.license_basis, limits: r.limits, version: r.version })),
    excluded: excluded.slice(0, 12), counts: { catalog: index.records.length, returned: pick.length, excluded: excluded.length },
  };
}
