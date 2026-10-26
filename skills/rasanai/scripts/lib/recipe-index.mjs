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
import { readMediumMetadata } from "./medium-index.mjs"; // Part 2: the medium execution profiles are DERIVED from library/styles/meta (no second list)

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

// [example id, source file, profile id, execution id, family id, what it teaches]; ids match library/creative-reference-index.json rows ex-<id>
const MEDIUM_EXAMPLE_RECORDS = [
  ["flat-vector-three-into-one", "library/medium-examples/flat-vector-native/positive-three-into-one.js", "flat-vector", "flat-vector-native", "flat-vector-geometric", "route handoff and split/recombine into one structure"],
  ["flat-vector-ornamental-swarm", "library/medium-examples/flat-vector-native/boundary-ornamental-swarm.js", "flat-vector", "flat-vector-native", "flat-vector-geometric", "boundary: ornament is not proof; unequal point counts crossfade, disclosed"],
  ["line-drawing-line-reveals-relation", "library/medium-examples/line-drawing-native/positive-line-reveals-relation.js", "line-art", "line-drawing-native", "flat-vector-geometric", "path reveal where the label follows the line"],
  ["line-drawing-unsupported-connector", "library/medium-examples/line-drawing-native/boundary-unsupported-connector.js", "line-art", "line-drawing-native", "flat-vector-geometric", "boundary: a connector declares supported or illustrative"],
  ["paper-collage-two-strips", "library/medium-examples/paper-collage-native/positive-two-strips.js", "collage", "paper-collage-native", "paper-collage", "masked reveal, fold and hinge with crisp text above the paper"],
  ["paper-collage-texture-sticker", "library/medium-examples/paper-collage-native/boundary-texture-sticker.js", "collage", "paper-collage-native", "paper-collage", "boundary: texture alone does nothing; a photo piece fails with no approved asset"],
  ["evidence-diagram-overlap-sets", "library/medium-examples/evidence-diagram/positive-overlap-sets.js", "dataviz", "evidence-diagram", "diagram-data", "computed set membership with a count line"],
  ["evidence-diagram-bars-need-source", "library/medium-examples/evidence-diagram/boundary-bars-need-source.js", "dataviz", "evidence-diagram", "diagram-data", "boundary: no declared source means no decorative chart"],
  ["pixel-native-path-of-choices", "library/medium-examples/pixel-native/path-of-choices/example.html", "pixel", "pixel-native", "pixel-retro", "tile assembly and a sprite acting on a step grid, integer fit"],
  ["pixel-native-long-text-locale", "library/medium-examples/pixel-native/long-text-locale/example.html", "pixel", "pixel-native", "pixel-retro", "boundary: missing glyphs route to a sharp text layer"],
  ["pixel-companion-saved-correction", "library/medium-examples/pixel-companion/saved-correction/example.html", "living-screencast", "pixel-companion", "pixel-retro", "sharp proof layer owns labels; sprite reacts to a real event"],
  ["pixel-companion-transformed-anchor", "library/medium-examples/pixel-companion/transformed-anchor/example.html", "living-screencast", "pixel-companion", "pixel-retro", "anchor follows a transformed target through one camera transform"],
  ["cel-performance-catch-and-react", "library/medium-examples/cel-performance/positive-catch-and-react.example.json", "cel-boil", "cel-performance", "illustrated-cel", "anticipate, act, react, hold with a line-only boil"],
  ["cel-performance-idle-beside-headline", "library/medium-examples/cel-performance/boundary-idle-beside-headline.example.json", "cel-boil", "cel-performance", "illustrated-cel", "boundary: no event worth acting out means another medium"],
  ["isometric-system-inputs-to-result", "library/medium-examples/isometric-system/positive-inputs-to-result.example.json", "iso-infographic", "isometric-system", "isometric-worlds", "one declared projection, depth order from world boxes"],
  ["isometric-system-unsourced-factual-route", "library/medium-examples/isometric-system/boundary-unsourced-factual-route.example.json", "iso-infographic", "isometric-system", "isometric-worlds", "boundary: a route cites a source or is labelled illustrative"],
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
  // Part 2: one record per medium execution profile (runtime "medium"; only a query that selected a medium sees it). Always verified:false; implemented = every runtime_ref is a real file.
  try {
    for (const m of readMediumMetadata(skillRoot).profiles) {
      const refs = Array.isArray(m.runtime_refs) ? m.runtime_refs.filter((x) => typeof x === "string") : [];
      const present = refs.length > 0 && refs.every((r) => fileThere(skillRoot, r.split("#")[0]));
      const needs = (Array.isArray(m.asset_needs) ? m.asset_needs : []).filter((a) => a && typeof a === "object" && a.required === true && !a.original_alternative).map((a) => a.kind || a.id);
      out.push(E(`medium-${m.execution_id || m.id}`, "recipe", refs[0] || `library/styles/meta/${m.id}.json`, {
        capabilities: [m.family_id, m.summary, ...(m.native_actions || []), ...(m.visual_material || [])].filter(Boolean), assets: needs, runtime: "medium", medium_id: m.id, execution_id: m.execution_id || null, family_id: m.family_id,
        resource_class: m.id === "cel-boil" ? "medium" : "light", license_basis: "RasanAI original code (no third-party asset)", limits: "implemented_unvalidated: no render has run; reference ideas only for anything beyond its runtime_refs",
        verified: false, implemented: present, implemented_reason: present ? "" : refs.length ? "a runtime_ref is not in this skill" : "no runtime_refs: described, not built", example_refs: m.example_refs || [], capability_ref: m.capability_ref || null,
      }));
    }
  } catch (e) { out.push({ id: "medium-profiles", layer: "recipe", implemented: false, verified: false, implemented_reason: `medium metadata unreadable: ${e.message}`, kinds: ALL, capabilities: [], assets: [], runtime: "medium", resource_class: "light", license_basis: "n/a", limits: "", path: "library/styles/meta" }); }
  // Part 2 (registrationRequests, hand-authored): the original worked examples, one recipe record each. Same medium gate as the profiles, verified:false, source path must exist.
  for (const [id, file, profile, exec, fam, cap] of MEDIUM_EXAMPLE_RECORDS) {
    const there = fileThere(skillRoot, file);
    out.push(E(`example-${id}`, "recipe", file, { capabilities: [cap], runtime: "medium", medium_id: profile, execution_id: exec, family_id: fam, verified: false, implemented: there, implemented_reason: there ? "" : `${file} is not in this skill`, license_basis: "RasanAI original code, invented copy (no third-party asset)", limits: "original-unreviewed: written, never rendered; a teaching example, not proof of any product behaviour" }));
  }
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
  // Part 2: a query that selected a medium (profile id, execution id or family) sees that medium's own recipe record(s) and skips the generic DOM-only gate for them;
  // a query with no medium never sees a medium record, so legacy retrieval is unchanged.
  const medium = q.medium ? String(q.medium).toLowerCase() : null;
  const mediumHit = (r) => r.runtime === "medium" && !!medium && [r.medium_id, r.execution_id, r.family_id].filter(Boolean).map((x) => String(x).toLowerCase()).includes(medium);
  const have = new Set((q.have_assets || []).map(String));
  const want = new Set((q.want || []).flatMap(words));
  const cap = RANK[q.max_resource_class] ?? RANK.heavy;
  const limit = Math.max(1, Math.min(6, Number(q.limit) || 4));
  const excluded = [];
  const ok = (r) => {
    if (!r.implemented && !q.include_unimplemented) { excluded.push({ id: r.id, reason: r.implemented_reason || "not implemented" }); return false; }
    if (r.kinds !== ALL && !r.kinds.includes("*") && q.kind && !r.kinds.includes(q.kind)) return false; // wrong kind: silent, not interesting
    if (r.runtime === "medium") { if (!mediumHit(r)) return false; }
    else if (r.runtime !== "any" && r.runtime !== runtime) return false;
    if (RANK[r.resource_class] > cap) { excluded.push({ id: r.id, reason: `resource class ${r.resource_class} above the allowed ${q.max_resource_class}` }); return false; }
    const miss = (r.assets || []).filter((a) => !have.has(a));
    if (miss.length) { excluded.push({ id: r.id, reason: `needs assets not present: ${miss.join(", ")}` }); return false; }
    return true;
  };
  const score = (r) => (r.capabilities || []).reduce((n, c) => n + words(c).filter((w) => want.has(w)).length, 0) + words(r.id).filter((w) => want.has(w)).length * 2 + (r.kinds.includes(q.kind) ? 1 : 0);
  const pool = index.records.filter(ok);
  const take = (layer, n) => pool.filter((r) => r.layer === layer).map((r) => ({ r, s: score(r) })).sort((a, b) => b.s - a.s || a.r.id.localeCompare(b.r.id)).slice(0, n).map((x) => x.r);
  const mediumPick = pool.filter((r) => r.layer === "recipe" && r.runtime === "medium");
  const pick = [...take("contract", 2), ...take("kind_guide", 2), ...mediumPick, ...take("recipe", limit).filter((r) => r.runtime !== "medium"), ...(q.failure ? take("failure_recovery", 1) : [])];
  const why = { contract: "universal contract", kind_guide: `guide for ${q.kind || "any kind"}`, recipe: `recipe for ${medium ? "the selected medium " + medium + " / " : ""}${runtime}${want.size ? " matching " + [...want].slice(0, 4).join(" ") : ""}`, failure_recovery: "failure recovery requested" };
  return {
    index_version: index.index_version, query: { kind: q.kind || null, runtime, medium, have_assets: [...have], want: [...want], failure: !!q.failure, limit },
    shortlist: pick.map((r) => ({ id: r.id, layer: r.layer, path: r.path, why: why[r.layer], resource_class: r.resource_class, license_basis: r.license_basis, limits: r.limits, version: r.version, ...(r.runtime === "medium" ? { medium_id: r.medium_id, execution_id: r.execution_id, verified: false } : {}) })),
    excluded: excluded.slice(0, 12), counts: { catalog: index.records.length, returned: pick.length, excluded: excluded.length },
  };
}
