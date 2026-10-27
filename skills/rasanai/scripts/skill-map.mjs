#!/usr/bin/env node
// The static route-to-read-list manifest of the progressively loaded RasanAI skill: which guides under
// references/workflows/ (and which deeper references) a route reads, per phase. SKILL.md tells the agent to ask this
// instead of preloading everything.
//   node skill-map.mjs list                                        -> routes, phases, guides (JSON)
//   node skill-map.mjs route <name> [--variant direct|deep] [--phase <phase>]
//        -> {route, variant, initial[], phases{}, read[], notLoaded[]}; --phase prints only that phase's reads
//           names: any route in library/formats.json (product-launch-video, music-to-video, reel, presenter, motion-graphics, ...),
//                  revision, or an alias: product, direct (product-launch-video, direct), long, deep (same, deep path),
//                  footage (reel), lyrics, song (music-to-video), single-unit, cartoon, evidence
//        scene routes also list references/creative-quality.md (story, look, styleframes, animatic) and references/creative-examples-teaching.md (story) for a plan with creative_policy_revision 1 (or 2)
//        revision 2 plans (--run <dir> with crew/plan.json creative_policy_revision >= 2): also creative-policy, budget-context (brief); concept-development, event-commitments (story); typography-performance, composition-transitions, medium-performance (look); temporal-storyboard, continuity-ownership, procedural-space, asset-compositing (styleframes); the same plus budget-context (animatic); temporal-review (final)
//        medium guides (scene routes only, and only with --run <dir> whose creative/medium-selection.json or design/<label>/medium.json exists, i.e. a medium was shortlisted or selected):
//           look -> references/medium-direction.md; styleframes + animatic -> medium-direction.md and references/medium-examples.md (examples: only for a stated communication problem). Never in the static map, never for footage/lyric/presenter/caption routes.
//        --run <dir> [--project <dir>]: also opens references/motion-studio.md where it applies (story: reference-motion.json or a linked
//           reference; animatic/final: scenes with data-motion-kit or data-el; revision: a requested line in motion/edits.jsonl); never on caption-only routes
//   node skill-map.mjs check                                       -> every referenced file exists, every relative link in SKILL.md and the guides resolves,
//                                                                    every route in scripts/lib/formats.mjs ROUTES is mapped
// Exit 0 ok, 2 invalid (unknown route, a missing file, a broken link), 1 unable to run (no skill folder, bad usage).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SKILL_DIR = path.resolve(HERE, "..");
const W = "references/workflows/";

export const GUIDES = {
  "shared-contract": W + "shared-contract.md",
  "setup-and-console": W + "setup-and-console.md",
  "brief-and-research": W + "brief-and-research.md",
  "story-and-moves": W + "story-and-moves.md",
  "look-and-design": W + "look-and-design.md",
  "art-and-styleframes": W + "art-and-styleframes.md",
  "music-animatic-build": W + "music-animatic-build.md",
  "final-and-delivery": W + "final-and-delivery.md",
  "routes/footage": W + "routes/footage.md",
  "routes/presenter": W + "routes/presenter.md",
  "routes/lyrics": W + "routes/lyrics.md",
  "routes/motion-graphics": W + "routes/motion-graphics.md",
  "routes/cartoon": W + "routes/cartoon.md",
  "routes/evidence": W + "routes/evidence.md",
  "operations/series-and-preferences": W + "operations/series-and-preferences.md",
  "operations/single-unit-and-revision": W + "operations/single-unit-and-revision.md",
  "operations/failure-and-recovery": W + "operations/failure-and-recovery.md",
  "operations/source-and-license-safety": W + "operations/source-and-license-safety.md",
};
// Motion Studio guide: not part of any route's static read list; opened only when a run/project condition holds (see conditionalReads)
export const MOTION_STUDIO = "references/motion-studio.md";
const CAPTION_ONLY = new Set(["embedded-captions", "talking-head-recut"]);
export const PHASES = ["brief", "story", "look", "styleframes", "animatic", "final"];
export const MANDATORY = ["shared-contract", "setup-and-console"];
// guides any run may need when something specific happens (never part of a route's first read)
export const ON_DEMAND = {
  failure: "operations/failure-and-recovery",
  series: "operations/series-and-preferences",
  sources: "operations/source-and-license-safety",
  revision: "operations/single-unit-and-revision",
};

// deeper technical references a phase opens together with its guide (they stay where they were)
const BASE_DEEPER = {
  brief: ["references/crew.md", "references/sources.md"],
  story: ["references/script.md", "references/story.md", "references/moves.md"],
  look: ["references/design-desk.md"],
  styleframes: ["references/styleframes.md", "references/imagery.md"],
  animatic: ["references/craft.md", "references/sound.md", "references/video.md"],
  final: ["references/finish.md", "references/deliver.md"],
};

// New creative policy (a plan with creative_policy_revision 1): ONE short guide for the phases that make or judge the creative idea, on scene routes only. Never preloaded for footage, lyric,
// presenter, single-unit or caption routes, and never in the brief phase. Roles are briefed with it by crew.mjs (CREATIVE_ROLES), not by this static map.
export const CREATIVE_DEEPER = {
  story: ["references/creative-quality.md", "references/creative-examples-teaching.md"],
  look: ["references/creative-quality.md"],
  styleframes: ["references/creative-quality.md"],
  animatic: ["references/creative-quality.md"],
};

// v3 (a plan with creative_policy_revision 2): the new reference docs, per phase, scene routes only and only with --run <dir> whose crew/plan.json says revision >= 2. Never in the static map
// (so revision 1 and no-run lists are unchanged), never for footage, lyric, presenter or caption routes. Every file is also linked from the matching guide in references/workflows/.
export const CREATIVE_V3_DEEPER = {
  brief: ["references/creative-policy.md", "references/budget-context.md"],
  story: ["references/creative-policy.md", "references/concept-development.md", "references/event-commitments.md"],
  look: ["references/event-commitments.md", "references/typography-performance.md", "references/composition-transitions.md", "references/medium-performance.md"],
  styleframes: ["references/temporal-storyboard.md", "references/continuity-ownership.md", "references/procedural-space.md", "references/asset-compositing.md"],
  animatic: ["references/continuity-ownership.md", "references/budget-context.md", "references/typography-performance.md", "references/composition-transitions.md", "references/procedural-space.md", "references/asset-compositing.md", "references/medium-performance.md"],
  final: ["references/temporal-review.md", "references/event-commitments.md"],
};
export const policyRevisionInRun = (run) => { try { const p = JSON.parse(fs.readFileSync(path.join(run, "crew", "plan.json"), "utf8")); const r = Number(p && p.creative_policy_revision); return Number.isFinite(r) ? r : 0; } catch { return 0; } };

// Medium guides (Style Intelligence Part 2): conditional, per phase, only for a run that has a shortlisted/selected medium. crew.mjs briefs roles with the same condition; the roles that do not make or judge the medium never read them.
export const MEDIUM_DIRECTION = "references/medium-direction.md";
export const MEDIUM_EXAMPLES = "references/medium-examples.md";
export const MEDIUM_DEEPER = { look: [MEDIUM_DIRECTION], styleframes: [MEDIUM_DIRECTION, MEDIUM_EXAMPLES], animatic: [MEDIUM_DIRECTION, MEDIUM_EXAMPLES] };
function mediumInRun(run) {
  if (!run) return false;
  try {
    if (fs.existsSync(path.join(run, "creative", "medium-selection.json"))) return true;
    const d = path.join(run, "design");
    return fs.readdirSync(d, { withFileTypes: true }).some((e) => e.isDirectory() && fs.existsSync(path.join(d, e.name, "medium.json")));
  } catch { return false; }
}

const scene = (over = {}) => ({
  kind: "scene",
  guide: null,
  defaultVariant: "deep",
  phases: {
    brief: ["brief-and-research"], story: ["story-and-moves"], look: ["look-and-design"],
    styleframes: ["art-and-styleframes"], animatic: ["music-animatic-build"], final: ["final-and-delivery"],
  },
  deeper: {},
  ...over,
});
const footage = (over = {}) => ({
  kind: "footage",
  guide: "routes/footage",
  defaultVariant: "direct",
  phases: {
    brief: ["brief-and-research"], story: ["routes/footage", "story-and-moves"], look: ["look-and-design"],
    animatic: ["routes/footage", "music-animatic-build"], final: ["final-and-delivery"],
  },
  deeper: { brief: ["references/reel.md"], story: ["references/reel.md"], animatic: ["references/reel.md"] },
  ...over,
});

export const ROUTES = {
  "product-launch-video": scene({
    defaultVariant: "direct",
    deeper: { story: ["references/product-first.md", "references/launch-film.md"], look: ["references/brand-film.md", "references/product-first.md"] },
  }),
  "faceless-explainer": scene(),
  "character-cartoon": scene({ guide: "routes/cartoon", defaultVariant: "direct", deeper: { story: ["references/2d-character.md"], styleframes: ["references/2d-character.md"], animatic: ["references/2d-character.md"] } }),
  "pr-to-video": scene(),
  "general-video": scene(),
  "music-to-video": {
    kind: "audio",
    guide: "routes/lyrics",
    defaultVariant: "direct",
    phases: {
      brief: ["brief-and-research", "routes/lyrics"], story: ["routes/lyrics", "story-and-moves"], look: ["look-and-design"],
      animatic: ["music-animatic-build"], final: ["final-and-delivery"],
    },
    deeper: { brief: ["references/lyric-video.md", "references/lyrics.md"], story: ["references/lyric-video.md"], look: ["references/lyric-video.md"], animatic: ["references/lyric-video.md", "references/lyrics.md"] },
  },
  reel: footage(),
  "embedded-captions": footage(),
  "talking-head-recut": footage(),
  presenter: {
    kind: "footage",
    guide: "routes/presenter",
    defaultVariant: "direct",
    phases: {
      brief: ["brief-and-research"], story: ["routes/presenter", "story-and-moves"], look: ["look-and-design"],
      animatic: ["routes/presenter", "music-animatic-build"], final: ["final-and-delivery"],
    },
    deeper: { brief: ["references/presenter.md"], story: ["references/presenter.md"], animatic: ["references/presenter.md", "references/imagery.md"] },
  },
  "motion-graphics": {
    kind: "unit",
    guide: "routes/motion-graphics",
    defaultVariant: "direct",
    phases: { brief: ["brief-and-research"], look: ["look-and-design"], animatic: ["routes/motion-graphics", "music-animatic-build"], final: ["final-and-delivery"] },
    deeper: { animatic: ["references/board-format.md", "references/handoff.md"] },
  },
  revision: {
    kind: "revision",
    guide: "operations/single-unit-and-revision",
    defaultVariant: "direct",
    phases: { final: ["operations/single-unit-and-revision", "final-and-delivery"] },
    deeper: { final: ["references/handoff.md"] },
    skipBrief: true,
  },
  // W9: the evidence route is the scene route plus the evidence guide (the Brief picked Evidence film; library/formats.json evidence-film)
  evidence: scene({ guide: "routes/evidence", deeper: { brief: ["references/evidence.md"], story: ["references/evidence.md"], look: ["references/evidence.md"], styleframes: ["references/evidence.md"], animatic: ["references/evidence.md"] } }),
};

export const ALIASES = {
  product: { route: "product-launch-video", variant: "direct" }, direct: { route: "product-launch-video", variant: "direct" },
  launch: { route: "product-launch-video", variant: "direct" },
  long: { route: "product-launch-video", variant: "deep" }, deep: { route: "product-launch-video", variant: "deep" },
  footage: { route: "reel" }, cartoon: { route: "character-cartoon" }, "character-cartoon-short": { route: "character-cartoon" }, lyrics: { route: "music-to-video" }, song: { route: "music-to-video" },
  "single-unit": { route: "motion-graphics" }, "single-units": { route: "motion-graphics" }, revise: { route: "revision" },
};

const uniq = (a) => [...new Set(a)];
const gpath = (id) => GUIDES[id] || id;

const readJ = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
// Motion Studio conditions, checked against a run dir (and its project) only when the caller passes them; no context = static map
function motionStudioPhases(route, { run = null, project = null } = {}) {
  if (!run || CAPTION_ONLY.has(route)) return [];
  const on = [];
  const has = (f) => fs.existsSync(path.join(run, f));
  if (route === "revision") {
    const latest = new Map();
    try { for (const l of fs.readFileSync(path.join(run, "motion", "edits.jsonl"), "utf8").split("\n")) { const o = l.trim() ? readJ_(l) : null; if (o && o.id) latest.set(o.id, o.status); } } catch { /* none */ }
    if ([...latest.values()].includes("requested")) on.push("final");
    return on;
  }
  const brief = readJ(path.join(run, "brief.json")) || {};
  const linked = Object.entries(brief).some(([k, v]) => /^(reference|references|reference_video|reference_url|reference_clip|linked_reference)/i.test(k) && v && (typeof v !== "object" || Object.keys(v).length)) || has("research/reference-moves.json");
  if (has("reference-motion.json") || linked) on.push("story");
  let proj = project;
  if (!proj) { const c = readJ(path.join(run, "console.json")); if (c && c.root) proj = c.root; }
  if (proj && sceneUsesKit(proj)) on.push("animatic", "final");
  return on;
}
const readJ_ = (s) => { try { return JSON.parse(s); } catch { return null; } };
function sceneUsesKit(project) {
  let hit = false;
  (function walk(d, depth) {
    if (hit || depth > 3) return;
    let es = [];
    try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of es) {
      if (e.name.startsWith(".") || e.name === "node_modules" || e.name === "assets") continue;
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f, depth + 1);
      else if (/\.html?$/i.test(e.name)) { try { if (/\bdata-(motion-kit|el)=/.test(fs.readFileSync(f, "utf8"))) { hit = true; return; } } catch { /* unreadable */ } }
    }
  })(project, 0);
  return hit;
}

export function resolveRoute(name, { variant = null, run = null, project = null } = {}) {
  const key = String(name || "").trim();
  const al = ALIASES[key];
  const route = al ? al.route : key;
  const def = ROUTES[route];
  if (!def) return null;
  const v = variant || (al && al.variant) || def.defaultVariant;
  const phases = {};
  for (const ph of PHASES) {
    if (!def.phases[ph]) continue;
    let deeper = uniq([...(def.deeper[ph] || []), ...(BASE_DEEPER[ph] || [])]);
    // direct path: the long path's desk reference is not needed on a branded or single-system look
    if (v === "direct" && def.kind === "scene" && ph === "look") deeper = deeper.filter((r) => r !== "references/design-desk.md");
    // the picture, 3D and imagery references are opened on demand by the guide, not preloaded; only a route that owns them lists them
    if (def.kind !== "scene") deeper = deeper.filter((r) => r !== "references/styleframes.md");
    if (def.kind === "scene") deeper = uniq([...deeper, ...(CREATIVE_DEEPER[ph] || [])]); // creative policy: one short quality guide per relevant phase
    phases[ph] = { guides: def.phases[ph].map((g) => gpath(g)), deeper };
  }
  // Motion Studio: the guide joins a phase's deeper reads only when its condition holds (never on caption-only routes)
  for (const ph of motionStudioPhases(route, { run, project })) if (phases[ph]) phases[ph].deeper = uniq([...phases[ph].deeper, MOTION_STUDIO]);
  // medium guides: scene routes with a shortlisted/selected medium in this run only (never the static map)
  if (def.kind === "scene" && mediumInRun(run)) for (const [ph, refs] of Object.entries(MEDIUM_DEEPER)) if (phases[ph]) phases[ph].deeper = uniq([...phases[ph].deeper, ...refs]);
  // v3: revision 2 plans open the new reference docs with their phase (scene routes only)
  if (def.kind === "scene" && policyRevisionInRun(run) >= 2) for (const [ph, refs] of Object.entries(CREATIVE_V3_DEEPER)) if (phases[ph]) phases[ph].deeper = uniq([...phases[ph].deeper, ...refs]);
  const initial = uniq([
    ...MANDATORY.map(gpath),
    ...(def.skipBrief ? [] : [gpath("brief-and-research")]),
    ...(def.guide ? [gpath(def.guide)] : []),
  ]);
  const read = uniq([...initial, ...Object.values(phases).flatMap((p) => [...p.guides, ...p.deeper])]);
  const notLoaded = Object.entries(GUIDES).map(([, p]) => p).filter((p) => !read.includes(p));
  return { ok: true, route, variant: v, kind: def.kind, initial, phases, read, notLoaded };
}

const mdFiles = (dir) => {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...mdFiles(p)); else if (e.name.endsWith(".md")) out.push(p);
  }
  return out;
};

// every [text](relative) markdown link in these files must resolve (anchors are checked against headings when present)
export function brokenLinks(skillDir = SKILL_DIR) {
  const files = [path.join(skillDir, "SKILL.md"), ...mdFiles(path.join(skillDir, "references", "workflows"))].filter((f) => fs.existsSync(f));
  const bad = [];
  for (const f of files) {
    const text = fs.readFileSync(f, "utf8").replace(/```[\s\S]*?```/g, "");
    for (const m of text.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
      const href = m[1];
      if (/^(https?:|mailto:|#)/.test(href)) continue;
      const [rel, frag] = href.split("#");
      const target = path.resolve(path.dirname(f), decodeURIComponent(rel));
      if (!fs.existsSync(target)) { bad.push({ file: path.relative(skillDir, f), link: href, why: "missing file" }); continue; }
      if (frag && target.endsWith(".md")) {
        const slugs = fs.readFileSync(target, "utf8").split("\n").filter((l) => /^#{1,6}\s/.test(l)).map((l) => l.replace(/^#+\s*/, "").toLowerCase().replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-"));
        if (!slugs.includes(frag.toLowerCase())) bad.push({ file: path.relative(skillDir, f), link: href, why: "missing anchor" });
      }
    }
  }
  return bad;
}

export function checkMap(skillDir = SKILL_DIR) {
  const errors = [];
  const E = (m) => errors.push(m);
  for (const [id, p] of Object.entries(GUIDES)) if (!fs.existsSync(path.join(skillDir, p))) E(`guide ${id}: ${p} is missing`);
  if (!fs.existsSync(path.join(skillDir, "SKILL.md"))) E("SKILL.md is missing");
  for (const f of [MEDIUM_DIRECTION, MEDIUM_EXAMPLES]) if (!fs.existsSync(path.join(skillDir, f))) E(`${f} is missing`);
  for (const f of Object.values(CREATIVE_V3_DEEPER).flat()) if (!fs.existsSync(path.join(skillDir, f))) E(`${f} is missing`);
  if (!fs.existsSync(path.join(skillDir, MOTION_STUDIO))) E(`${MOTION_STUDIO} is missing`);
  for (const name of Object.keys(ROUTES)) {
    const r = resolveRoute(name);
    for (const f of r.read) if (!fs.existsSync(path.join(skillDir, f))) E(`route ${name}: ${f} is missing`);
    for (const ph of Object.keys(ROUTES[name].phases)) if (!PHASES.includes(ph)) E(`route ${name}: unknown phase ${ph}`);
    for (const g of [...MANDATORY, ...(ROUTES[name].guide ? [ROUTES[name].guide] : []), ...Object.values(ROUTES[name].phases).flat()]) if (!GUIDES[g]) E(`route ${name}: unknown guide id ${g}`);
  }
  for (const g of Object.values(ON_DEMAND)) if (!GUIDES[g]) E(`on-demand guide ${g} is unknown`);
  // every route RasanAI has (scripts/lib/formats.mjs) must be mapped
  try {
    const src = fs.readFileSync(path.join(skillDir, "scripts", "lib", "formats.mjs"), "utf8");
    const m = src.match(/export const ROUTES = \[([^\]]+)\]/);
    if (m) for (const r of m[1].match(/"([^"]+)"/g).map((s) => s.slice(1, -1))) if (!ROUTES[r]) E(`formats route "${r}" has no entry in skill-map`);
  } catch { /* formats lib absent: nothing to compare */ }
  for (const b of brokenLinks(skillDir)) E(`broken link in ${b.file}: ${b.link} (${b.why})`);
  return { ok: !errors.length, errors, guides: Object.keys(GUIDES).length, routes: Object.keys(ROUTES).length };
}

function main() {
  const [cmd, name] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const flag = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : null; };
  const out = (o) => console.log(JSON.stringify(o, null, 2));
  if (!fs.existsSync(path.join(SKILL_DIR, "references"))) { out({ ok: false, error: `no skill folder at ${SKILL_DIR}` }); process.exit(1); }
  if (cmd === "list") {
    out({ ok: true, phases: PHASES, mandatory: MANDATORY.map(gpath), guides: GUIDES, on_demand: ON_DEMAND, aliases: Object.keys(ALIASES), routes: Object.fromEntries(Object.entries(ROUTES).map(([k, v]) => [k, { kind: v.kind, guide: v.guide ? gpath(v.guide) : null, phases: Object.keys(v.phases) }])) });
  } else if (cmd === "route") {
    if (!name) { out({ ok: false, error: "route needs a name" }); process.exit(1); }
    const v = flag("variant");
    if (v && !["direct", "deep"].includes(v)) { out({ ok: false, error: "--variant is direct or deep" }); process.exit(1); }
    const r = resolveRoute(name, { variant: v, run: flag("run") ? path.resolve(flag("run")) : null, project: flag("project") ? path.resolve(flag("project")) : null });
    if (!r) { out({ ok: false, error: `unknown route "${name}"`, routes: [...Object.keys(ROUTES), ...Object.keys(ALIASES)] }); process.exit(2); }
    const ph = flag("phase");
    if (ph) {
      if (!r.phases[ph]) { out({ ok: false, error: `route ${r.route} has no phase "${ph}"`, phases: Object.keys(r.phases) }); process.exit(2); }
      out({ ok: true, route: r.route, variant: r.variant, phase: ph, ...r.phases[ph] });
    } else out(r);
  } else if (cmd === "check") {
    const r = checkMap();
    out(r);
    process.exit(r.ok ? 0 : 2);
  } else { out({ ok: false, error: "usage: skill-map.mjs list | route <name> [--variant direct|deep] [--phase p] [--run <dir> [--project <dir>]] | check" }); process.exit(1); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
