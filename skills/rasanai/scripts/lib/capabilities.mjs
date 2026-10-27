// Plan 06 V7: the capability surface of visual production. Six things are kept apart, because "the code exists", "this Mac can run it", "the person
// turned it on", "the person allowed it", "the licence allows it" and "someone watched it work" are six different facts:
//
//   implemented          the code behind it exists (a catalog row or a function stub does not count)
//   available_on_host    the tools it needs are on this machine (looked up on PATH / in the file system; nothing is run, nothing is downloaded)
//   enabled              switched on (feature flag / configuration); optional engines are off by default
//   permission_status    granted | per_job (asked for each use: spend, upload) | not_required | not_requested | denied
//   license_status       cleared | not_applicable | unreviewed | blocked        (source-code licence, model weights and media rights are different records)
//   verification_status  unverified | fixture_only | verified                   (nothing is `verified` before a real run on real media; fixtures never promote it)
//
// Built on contracts.mjs `Capability` (five states, each with a reason): implemented/available/enabled/permitted/verified. `available_on_host` is its
// `available`, `permission_status` is its `permitted` (+ the word), and licence is the one extra record. `surface()` is the flat shape the UI reads;
// `uiState()` is what a card may say: ready | experimental | test_only | unavailable. An unavailable move is never drawn as ready.
//
// Project-wide distribution blockers are recorded here and are NOT cleared by a flag: GSAP (the Standard "no-charge" licence forbids a product that
// competes with GSAP's own no-code visual animation tools; the element inspector and an "AI writes motion code" builder need that review, see docs/plans/motion-studio-licenses.md).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defaultCapability, validateCapability, SCHEMA_VERSION } from "./contracts.mjs";
import { loadCatalog, annotate } from "./motion-kit/catalog.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = path.resolve(HERE, "..", "..");

export const PERMISSION_STATUSES = ["granted", "per_job", "not_required", "not_requested", "denied"];
export const LICENSE_STATUSES = ["cleared", "not_applicable", "unreviewed", "blocked"];
export const VERIFICATION_STATUSES = ["unverified", "fixture_only", "verified"];
const PERMISSION_OK = new Set(["granted", "per_job", "not_required"]);
const LICENSE_OK = new Set(["cleared", "not_applicable"]);

// Recorded, project-wide, and independent of any per-capability flag.
export const DISTRIBUTION_BLOCKERS = [
  { id: "gsap-license", status: "open", applies_to: "every motion in this skill that is written against GSAP (HTML scenes, the motion kit, the element inspector)",
    reason: "GSAP's licence restricts use inside a visual animation builder that competes with GSAP's own tools; a feature flag, a hidden toggle or an 'AI writes the code' label is not legal clearance. Needs the project-wide review before any public distribution that exposes a visual animation builder.",
    cleared_by: "a recorded licence review (docs/plans/motion-studio-licenses.md) or a replacement of the timeline engine; never by an environment variable" },
];

// medium execution profiles: [execution id, label, runtime files, extra files the profile needs]
const MEDIUM_EXECUTIONS = [
  ["flat-vector-native", "flat vector and geometric scenes (original SVG)", ["runtime/medium-surface.js", "runtime/medium-graphic.js"]],
  ["line-drawing-native", "line drawing scenes (original SVG)", ["runtime/medium-surface.js", "runtime/medium-graphic.js"]],
  ["evidence-diagram", "evidence diagram scenes (original SVG)", ["runtime/medium-surface.js", "runtime/medium-graphic.js"]],
  ["paper-collage-native", "vector-cut paper collage scenes (original SVG)", ["runtime/medium-surface.js", "runtime/medium-paper.js"]],
  ["pixel-native", "native pixel-grid scenes (original canvas)", ["runtime/medium-pixel.js"]],
  ["pixel-companion", "pixel companion beside a sharp proof layer", ["runtime/medium-pixel.js", "runtime/medium-pixel-companion.js"], ["runtime/rasan-ui.js"]],
  ["cel-performance", "cel character performance over Rasan2D", ["runtime/medium-cel.js"], ["stage2d/runtime/rasan2d.js"]],
  ["isometric-system", "isometric diorama scenes (original canvas)", ["runtime/medium-isometric.js"]],
];

export const now = () => new Date().toISOString();
const str = (x, d = "") => (typeof x === "string" ? x : d);

// ---- host facts: file-system lookups only (no process is spawned, no network) -------------------------------------
export function which(bin, env = process.env) {
  for (const d of String(env.PATH || "").split(path.delimiter)) {
    if (!d) continue;
    const f = path.join(d, bin);
    try { fs.accessSync(f, fs.constants.X_OK); if (fs.statSync(f).isFile()) return f; } catch {}
  }
  return null;
}
export function probeHost({ env = process.env, platform = process.platform, exists = (p) => fs.existsSync(p) } = {}) {
  return {
    platform,
    ffmpeg: !!which("ffmpeg", env), ffprobe: !!which("ffprobe", env),
    chrome: !!(env.RASANAI_CHROME || env.CHROME_PATH || ["/Applications/Google Chrome.app", "/Applications/Chromium.app"].some(exists) || which("google-chrome", env) || which("chromium", env)),
    swiftc: platform === "darwin" && (exists("/usr/bin/swiftc") || exists("/usr/bin/swift")),
    // ComfyUI is NOT probed here (that is a network call); the flag and the endpoint are the only facts. `video-generation.mjs doctor` is the deliberate probe.
    comfyui_flag: env.RASANAI_HYBRID_COMFYUI === "1", comfyui_endpoint: str(env.RASANAI_COMFYUI_URL) || null,
    sam_flag: env.RASANAI_HYBRID_SAM === "1", sam_sidecar: str(env.RASANAI_SAM_BIN) || null,
    ltx_flag: env.RASANAI_HYBRID_LTX === "1", otio_flag: env.RASANAI_HYBRID_OTIO === "1",
    // Plan 12 D6: the OTIO sidecar needs a Python that already has OpenTimelineIO. Only the interpreter file is looked up here; importing it is `delivery.mjs interchange doctor`'s deliberate probe.
    python3: env.RASANAI_OTIO_PYTHON || which("python3", env) || null,
    adapter: (id) => env[`RASANAI_ADAPTER_${String(id).toUpperCase()}`] === "1",
  };
}

// ---- building one capability ---------------------------------------------------------------------------------
// facts: { implemented:[bool,reason], available:[bool,reason], enabled:[bool,reason], permission:[status,reason], license:[status,reason], verification:[status,reason], synthetic?, kind, label, depends_on? }
export function makeCapability(id, facts) {
  const f = facts || {};
  const pair = (x, d) => (Array.isArray(x) ? x : [d, ""]);
  const [impl, implWhy] = pair(f.implemented, false), [avail, availWhy] = pair(f.available, false), [en, enWhy] = pair(f.enabled, false);
  const [perm, permWhy] = pair(f.permission, "not_requested"), [lic, licWhy] = pair(f.license, "unreviewed"), [ver, verWhy] = pair(f.verification, "unverified");
  const reason = (ok, why, off) => (ok ? "" : why || off);
  const cap = defaultCapability(id, {
    implemented: { value: !!impl, reason: reason(impl, implWhy, "no code behind it yet") },
    available: { value: !!avail, reason: reason(avail, availWhy, "not available on this host") },
    enabled: { value: !!en, reason: reason(en, enWhy, "switched off") },
    permitted: { value: PERMISSION_OK.has(perm), reason: reason(PERMISSION_OK.has(perm), permWhy, `permission is ${perm}`) },
    verified: { value: ver === "verified", reason: reason(ver === "verified", verWhy, ver === "fixture_only" ? "only a fixture ran; no real run on real media" : "never run on real media") },
  });
  return {
    ...cap, kind: str(f.kind, "capability"), label: str(f.label, id), synthetic: !!f.synthetic, depends_on: f.depends_on || [],
    license: { status: lic, reason: licWhy }, permission: { status: perm, reason: permWhy }, verification: { status: ver, reason: verWhy },
  };
}

// the flat, six-field shape the UI and the crew read
export function surface(cap) {
  return {
    id: cap.id, kind: cap.kind, label: cap.label, synthetic: !!cap.synthetic,
    implemented: cap.implemented.value, available_on_host: cap.available.value, enabled: cap.enabled.value,
    permission_status: cap.permission.status, license_status: cap.license.status, verification_status: cap.verification.status,
    ui_state: uiState(cap), blocked_by: blockedBy(cap),
  };
}
// the first axis that stops it, with its reason: what the UI shows instead of a ready button
export function blockedBy(cap) {
  const steps = [["implemented", cap.implemented.value, cap.implemented.reason], ["available_on_host", cap.available.value, cap.available.reason], ["enabled", cap.enabled.value, cap.enabled.reason],
    ["permission_status", PERMISSION_OK.has(cap.permission.status), cap.permission.reason], ["license_status", cap.license.status !== "blocked", cap.license.reason]];
  const hit = steps.find((s) => !s[1]);
  return hit ? { axis: hit[0], reason: hit[2] || "unspecified" } : null;
}
// ready: every gate is open AND it was verified on real media. experimental: usable but unverified, or licence still unreviewed. test_only: a synthetic provider.
// unavailable: a gate is closed; the card must say why and must not offer it as a ready move.
export function uiState(cap) {
  if (cap.synthetic) return "test_only";
  if (blockedBy(cap)) return "unavailable";
  return LICENSE_OK.has(cap.license.status) && cap.verification.status === "verified" ? "ready" : "experimental";
}
export const usableForProduction = (cap) => uiState(cap) === "ready" || uiState(cap) === "experimental";

// ---- the registry --------------------------------------------------------------------------------------------
// Rows: the motion kit (one per catalog row, from the code), renderer adapters, generation providers, trackers and masks, character rigs and performance.
// adapterDescribe: optional (id) -> {available, enabled, reason, license_status}; pass renderer-adapters' `describe` results to keep one source for them.
export function buildRegistry({ host = probeHost(), skillRoot = SKILL_ROOT, catalogFile, adapters = [], verification = {} } = {}) {
  const rows = [];
  const V = (id) => [verification[id] || "unverified", verification[id] === "verified" ? "" : "no real run recorded"];
  const exists = (rel) => fs.existsSync(path.join(skillRoot, rel));
  const gsapVendored = fs.existsSync(path.join(skillRoot, "scripts", "vendor", "gsap.min.js")) || fs.existsSync(path.join(skillRoot, "scripts", "vendor"));
  const gsapLicense = ["unreviewed", "GSAP licence review is an open project-wide blocker (gsap-license); not cleared by this flag"];

  // renderer
  rows.push(makeCapability("renderer.hyperframes", { kind: "renderer", label: "HyperFrames HTML render (default)", implemented: [true], available: [host.chrome && host.ffmpeg, "needs Chrome and ffmpeg"], enabled: [true], permission: ["not_required"], license: gsapLicense, verification: V("renderer.hyperframes") }));
  for (const a of adapters) {
    if (a.id === "hyperframes") continue;
    rows.push(makeCapability(`renderer.${a.id}`, { kind: "renderer", label: `${a.id} adapter (interop only)`, implemented: [false, "disabled placeholder; no render path is wired"], available: [!!a.available, a.reason], enabled: [!!a.enabled, "off unless RASANAI_ADAPTER_" + a.id.toUpperCase() + "=1 and its licence note is accepted"], permission: ["not_required"], license: [a.license_status === "cleared" ? "cleared" : "unreviewed", str(a.license_status, "licence not reviewed")], verification: V(`renderer.${a.id}`) }));
  }

  // motion kit: a row's existence is not capability
  try {
    const items = annotate(loadCatalog(catalogFile).items, skillRoot);
    for (const it of items) {
      const usesGsap = (it.supports || []).includes("dom-gsap");
      rows.push(makeCapability(`kit.${it.id}`, {
        kind: "motion_kit", label: it.label, implemented: [it.implemented, it.implemented_reason],
        available: [it.implemented && host.chrome && gsapVendored, it.implemented ? "needs Chrome and the vendored GSAP" : it.implemented_reason],
        enabled: [true], permission: ["not_required"], license: usesGsap ? gsapLicense : ["not_applicable", ""], verification: V(`kit.${it.id}`), depends_on: usesGsap ? ["gsap-license"] : [],
      }));
    }
  } catch (e) { rows.push(makeCapability("kit.catalog", { kind: "motion_kit", label: "motion kit catalog", implemented: [false, `catalog unreadable: ${e.message}`] })); }

  // generated plates (the provider interface is provider-jobs.mjs; ComfyUI is the first configurable adapter)
  rows.push(makeCapability("generation.comfyui", {
    kind: "generation", label: "ComfyUI generated plates (optional, local)", implemented: [exists("scripts/video-generation.mjs"), "scripts/video-generation.mjs missing"],
    available: [host.comfyui_flag && host.ffmpeg, host.comfyui_flag ? "needs ffmpeg" : "ComfyUI not configured; reachability, installed workflows and models are discovered by `video-generation.mjs doctor`, never assumed"],
    enabled: [host.comfyui_flag, "off by default (RASANAI_HYBRID_COMFYUI=1)"], permission: ["per_job", "spend and any upload are consented per job, recorded in hybrid/jobs.jsonl"],
    license: ["unreviewed", "model weights carry their own licence; none is assumed. hybrid/model-licenses.json records the reviewed ones"], verification: V("generation.comfyui"),
  }));
  rows.push(makeCapability("generation.fake", { kind: "generation", label: "synthetic test provider (no model)", synthetic: true, implemented: [true], available: [host.ffmpeg, "needs ffmpeg"], enabled: [true], permission: ["not_required"], license: ["not_applicable"], verification: ["fixture_only", "never a real generation"] }));

  // tracking / masks / depth: bbox, planar quad, mask and depth are different things
  rows.push(makeCapability("tracking.quad.manual", { kind: "tracking", label: "planar quad, manual keyframes (Level 0)", implemented: [exists("scripts/track.mjs")], available: [host.ffprobe, "needs ffprobe"], enabled: [true], permission: ["not_required"], license: ["not_applicable"], verification: V("tracking.quad.manual") }));
  rows.push(makeCapability("tracking.quad.apple_vision", { kind: "tracking", label: "planar quad, Apple Vision (optional, local)", implemented: [exists("scripts/vision/track.swift")], available: [host.swiftc && host.ffmpeg, "needs macOS with swiftc and ffmpeg"], enabled: [true], permission: ["not_required"], license: ["not_applicable", "system framework"], verification: V("tracking.quad.apple_vision") }));
  rows.push(makeCapability("tracking.bbox", { kind: "tracking", label: "bounding-box track (pin / crop / reframe only)", implemented: [false, "no standalone bbox producer; Vision's object tracker only feeds the quad tracker"], available: [false, "not implemented"], enabled: [false, "not implemented"], permission: ["not_required"], license: ["not_applicable"] }));
  rows.push(makeCapability("mask.person.apple_vision", { kind: "mask", label: "person mask, Apple Vision (optional, local)", implemented: [false, "no mask producer is wired; text behind a person uses the labelled limited fallback"], available: [host.swiftc, "needs macOS"], enabled: [false, "not implemented"], permission: ["not_required"], license: ["not_applicable", "system framework"] }));
  rows.push(makeCapability("mask.segmentation.sam", { kind: "mask", label: "SAM segmentation (optional sidecar)", implemented: [false, "no SAM sidecar is wired"], available: [!!host.sam_sidecar, "needs a SAM sidecar you install"], enabled: [host.sam_flag, "off (RASANAI_HYBRID_SAM=1)"], permission: ["not_required"], license: ["unreviewed", "SAM code and weights have their own licences; check the exact revision"] }));
  rows.push(makeCapability("depth.estimate", { kind: "depth", label: "depth map", implemented: [false, "no depth producer"], available: [false, "not implemented"], enabled: [false, "not implemented"], permission: ["not_required"], license: ["not_applicable"] }));
  rows.push(makeCapability("compositing.screen_replace", { kind: "compositing", label: "screen replacement into a tracked quad (perspective warp, soft edge, optional matte)", implemented: [exists("scripts/lib/hybrid-compositor/index.mjs")], available: [host.ffmpeg, "needs ffmpeg"], enabled: [true], permission: ["not_required"], license: ["not_applicable"], verification: V("compositing.screen_replace") }));

  // characters
  rows.push(makeCapability("character.rasan3d_actor", { kind: "character", label: "code-built 3D actor (Rasan3D rig)", implemented: [exists("stage3d/character-rig.js")], available: [host.chrome, "needs Chrome (WebGL, software GL ok)"], enabled: [true], permission: ["not_required"], license: ["not_applicable", "original rig; a user's character art is reference only"], verification: V("character.rasan3d_actor") }));
  rows.push(makeCapability("character.rasan2d_actor", { kind: "character", label: "painted 2D actor (Rasan2D)", implemented: [exists("stage2d/runtime/rasan2d.js")], available: [host.chrome, "needs Chrome"], enabled: [true], permission: ["not_required"], license: ["not_applicable"], verification: V("character.rasan2d_actor") }));
  rows.push(makeCapability("character.performance", { kind: "character", label: "viseme / expression / gesture tracks linked to dialogue timing", implemented: [exists("scripts/lib/character-performance.mjs")], available: [true], enabled: [true], permission: ["not_required"], license: ["not_applicable"], verification: V("character.performance") }));
  // Style Intelligence Part 2: medium execution profiles (original code in runtime/medium-*.js; ids are the profiles' capability_ref). Code present is NOT availability or
  // verification: each needs Chrome, stays unverified (no render has run) and is a described capability, never a claim that a film in that medium has been made.
  for (const [id, label, files, extra] of MEDIUM_EXECUTIONS) {
    const ok = files.every(exists) && (!extra || extra.every(exists));
    const cap = makeCapability(`style.${id}`, { kind: "medium_style", label, implemented: [ok, `missing: ${[...files, ...(extra || [])].filter((f) => !exists(f)).join(", ") || "n/a"}`], available: [host.chrome, "needs Chrome"], enabled: [true], permission: ["not_required"], license: ["not_applicable", "original code"], verification: V(`style.${id}`) });
    if (id === "cel-performance" && ok) {
      // file text only (nothing is executed): the cel runtime needs Rasan2D's createRenderer and boil; presence of the file alone is not availability
      let txt = ""; try { txt = fs.readFileSync(path.join(skillRoot, "stage2d/runtime/rasan2d.js"), "utf8"); } catch {}
      if (!(txt.includes("createRenderer") && txt.includes("boil"))) { cap.state = "implemented_unvalidated"; cap.api_note = "Rasan2D API unconfirmed"; cap.available = { value: false, reason: "Rasan2D API unconfirmed" }; }
    }
    rows.push(cap);
  }
  // Plan 12 D6/D8: timeline interchange. The official OpenTimelineIO library runs only in an OPTIONAL Python sidecar; ordinary video production never needs it.
  // A valid .otio file is not proof any editor imports it, so verification stays unverified until Plan 14 records a real round trip.
  rows.push(makeCapability("interchange.otio", { kind: "interchange", label: "OpenTimelineIO timeline (.otio) with relative relinking (optional sidecar)", implemented: [exists("scripts/lib/interchange.mjs") && exists("scripts/lib/interchange/otio_sidecar.py")], available: [!!host.python3, "needs a Python 3 with the pinned OpenTimelineIO installed; RasanAI never installs it for you (`delivery.mjs interchange doctor` checks)"], enabled: [host.otio_flag, "off by default (RASANAI_HYBRID_OTIO=1)"], permission: ["not_required"], license: ["unreviewed", "OpenTimelineIO's licence was not read in this repo: the register records it as unreviewed until someone does"], verification: V("interchange.otio") }));
  for (const [id, label] of [["fcpxml", "Final Cut Pro XML (FCPXML)"], ["aaf", "AAF"], ["edl", "CMX EDL"]]) rows.push(makeCapability(`interchange.${id}`, { kind: "interchange", label, implemented: [false, "no adapter is wired; offered only after its installed support is checked and a destination round trip is recorded (Plan 14)"], available: [false, "installed support not checked"], enabled: [false, "not implemented"], permission: ["not_required"], license: ["unreviewed", "not read"], verification: V(`interchange.${id}`) }));
  rows.push(makeCapability("delivery.sidecar_captions", { kind: "delivery", label: "SRT and WebVTT caption files from the film's word timings", implemented: [exists("scripts/lib/captions.mjs")], available: [true], enabled: [true], permission: ["not_required"], license: ["not_applicable", ""], verification: V("delivery.sidecar_captions") }));
  rows.push(makeCapability("delivery.package", { kind: "delivery", label: "export package from the accepted dependency closure", implemented: [exists("scripts/lib/delivery-manifest.mjs")], available: [true], enabled: [true], permission: ["not_required"], license: ["not_applicable", ""], verification: V("delivery.package") }));
  rows.push(makeCapability("delivery.audio_description_track", { kind: "delivery", label: "described-audio (audio description) track", implemented: [false, "only the descriptive transcript is produced; a voiced, mixed description track is not implemented"], available: [false, "not implemented"], enabled: [false, "not implemented"], permission: ["not_required"], license: ["not_applicable", ""], verification: V("delivery.audio_description_track") }));
  return rows;
}

export function registryReport(opts = {}) {
  const caps = buildRegistry(opts);
  const problems = [];
  for (const c of caps) { const v = validateCapability(c); if (!v.ok) problems.push({ id: c.id, problems: v.problems }); }
  return { schema_version: SCHEMA_VERSION, generated_at: now(), distribution_blockers: DISTRIBUTION_BLOCKERS, capabilities: caps.map(surface), details: caps, invalid: problems };
}

// what a card must show for a list of ids (a move, a provider): never "ready" for something unavailable
export function cardFor(registry, id) {
  const c = (registry.details || registry).find((x) => x.id === id);
  if (!c) return { id, ui_state: "unavailable", blocked_by: { axis: "implemented", reason: "unknown capability" } };
  return surface(c);
}

// ---- V3 W08 (additive): medium execution evidence -------------------------------------------------------------------------------------------------
// What the registry can say about a medium execution's runtime files, as an evidence object for medium-rules classifyEvidence. Reads the rows buildRegistry already made;
// runs nothing. `visually_demonstrated` is true only when the registry marks it verified (a real run on real media); fixtures never promote it.
// Which behaviours were seen is NOT in the registry: pass `demonstrated` (from perf-evidence summarizeMediumEvidence) for per-behaviour claims.
export function mediumExecutionEvidence(registry, executionId, { demonstrated = null } = {}) {
  const rows = Array.isArray(registry) ? registry : (registry && registry.details) || [];
  const cap = rows.find((c) => c && (c.id === `medium.${executionId}` || c.id === executionId || (c.id || "").endsWith(`.${executionId}`)));
  if (!cap) return { declared: false, source_present: false, executed: false, visually_demonstrated: false, blocked: `no capability row for ${executionId}`, refs: [] };
  const block = blockedBy(cap);
  const fixtureOrMore = cap.verification && ["fixture_only", "verified"].includes(cap.verification.status);
  return {
    declared: true,
    source_present: !!(cap.implemented && cap.implemented.value),
    executed: !!fixtureOrMore,
    visually_demonstrated: !!(demonstrated && demonstrated.visually_demonstrated),
    blocked: block ? `${block.axis}: ${block.reason}` : false,
    refs: [`capability:${cap.id}`, `verification:${cap.verification ? cap.verification.status : "unverified"}`],
  };
}
