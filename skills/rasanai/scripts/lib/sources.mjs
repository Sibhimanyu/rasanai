// Source modes (references/sources.md): what a film is made FROM decides who researches and which gates apply.
//   classify(paths, opts) -> sources.json: { mode, spine, case, public, story_pass, product_first, sources: [...], chips }
//   readSources(file)     -> the parsed file, or null
//   isFootageLed(src)     -> the story is cut from footage (spine footage or existing-video): product-first gates do not apply
//   productFirstApplies(src, caseHint) -> true only for a web/code spine whose case is a product launch or promo (null src: today's behaviour)
// Reads names, sizes and ffprobe durations only: never the content of a file (that is what "read-only listing" means in rule 14).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const VIDEO = /\.(mp4|mov|m4v|webm|mkv|avi|mts|mxf|r3d|braw)$/i;
const AUDIO = /\.(wav|aif|aiff|m4a|mp3|flac|aac|ogg)$/i;
const STILL = /\.(jpe?g|heic|png|dng|cr2|cr3|arw|tiff?)$/i;
const FONT = /\.(otf|ttf|woff2?|ttc)$/i;
const VECTOR = /\.(svg|eps|ai)$/i;
const TEMPLATE = /\.(mogrt|aep|prproj|psd|fig|sketch|indd)$/i;
const SKIP = new Set(["node_modules", ".git", "dist", "build", ".next", "vendor", "target", "Library", "Applications", ".Trash", "Pods", "DerivedData", "__pycache__", ".venv", "venv", ".cache"]);
const PROJECT_MARKERS = ["package.json", "Package.swift", "pyproject.toml", "Cargo.toml", "go.mod", "Gemfile", "pubspec.yaml", "build.gradle", "pom.xml", "hyperframes.json"];
const BRANDISH = /brand|logo|identity|guideline|style-?guide|press|wordmark|mark/i;
const home = os.homedir();
export const tilde = (p) => (p.startsWith(home) ? "~" + p.slice(home.length) : p);
export const expand = (p) => path.resolve(String(p).trim().replace(/^~(?=\/|$)/, home));

function probe(file) {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height,r_frame_rate,avg_frame_rate,color_transfer:stream_side_data=rotation:stream_tags=rotate", "-of", "json", file], { encoding: "utf8", timeout: 15000 });
  if (r.status !== 0) return null;
  try {
    const j = JSON.parse(r.stdout);
    const v = (j.streams || []).find((s) => s.codec_type === "video");
    const frac = (s) => { const [n, d] = String(s || "0/1").split("/").map(Number); return d ? n / d : n; };
    const rot = Number(((v && v.side_data_list) || []).find((x) => x.rotation !== undefined)?.rotation ?? (v && v.tags && v.tags.rotate) ?? 0);
    const swap = Math.abs(rot) % 180 === 90;
    const w = v ? (swap ? v.height : v.width) : 0, h = v ? (swap ? v.width : v.height) : 0;
    const rf = v ? frac(v.r_frame_rate) : 0, af = v ? frac(v.avg_frame_rate) : 0;
    return { duration: Number(j.format && j.format.duration) || 0, vertical: h > w && w > 0, vfr: !!(rf && af && Math.abs(rf - af) / rf > 0.02), hdr: !!(v && /arib-std-b67|smpte2084/.test(v.color_transfer || "")), audio: (j.streams || []).some((s) => s.codec_type === "audio") };
  } catch { return null; }
}

// walk a folder, bounded: counts by kind, never reads contents
function walk(root, { maxFiles = 6000, maxDepth = 6, deadline = Date.now() + 15000 } = {}) {
  const A = { videos: [], audio: 0, stills: 0, pdf: [], fonts: 0, vector: 0, templates: 0, docs: 0, markers: [], files: 0, dirs: new Set(), brandDirs: new Set(), truncated: false };
  (function rec(d, depth) {
    if (depth > maxDepth || A.files > maxFiles || Date.now() > deadline) { A.truncated = true; return; }
    let ents;
    try { ents = fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)); } catch { return; }
    for (const e of ents) {
      if (e.name.startsWith(".") && e.name !== ".rasanai") continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (SKIP.has(e.name)) continue;
        if (BRANDISH.test(e.name)) A.brandDirs.add(p);
        A.dirs.add(p);
        rec(p, depth + 1);
        continue;
      }
      A.files++;
      if (PROJECT_MARKERS.includes(e.name) && depth <= 2) A.markers.push(e.name);
      if (VIDEO.test(e.name)) A.videos.push(p);
      else if (AUDIO.test(e.name)) A.audio++;
      else if (STILL.test(e.name)) A.stills++;
      else if (/\.pdf$/i.test(e.name)) A.pdf.push(p);
      else if (FONT.test(e.name)) A.fonts++;
      else if (VECTOR.test(e.name)) A.vector++;
      else if (TEMPLATE.test(e.name)) A.templates++;
      else if (/\.(md|docx?|pptx?|xlsx?|csv|txt)$/i.test(e.name)) A.docs++;
    }
  })(root, 0);
  return A;
}

const fmtDur = (s) => { const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60); return h ? `${h} h ${String(m).padStart(2, "0")} min` : m ? `${m} min` : `${Math.round(s)} s`; };

function footageSource(files, base) {
  let dur = 0, vertical = 0, vfr = 0, hdr = 0, interviews = 0, probed = 0;
  const t0 = Date.now();
  for (const f of files) {
    if (Date.now() - t0 > 20000) break; // names-only beyond the budget
    const pr = probe(f);
    if (!pr) continue;
    probed++;
    dur += pr.duration;
    if (pr.vertical) vertical++;
    if (pr.vfr) vfr++;
    if (pr.hdr || /(^|[^a-z])(log|slog|clog|vlog|hlg)([^a-z]|$)/i.test(path.basename(f))) hdr++;
    if (pr.audio && (pr.duration >= 60 || /interview|talk|a-?cam|vo\b|testimon/i.test(path.basename(f)))) interviews++;
  }
  if (probed && probed < files.length) dur = (dur / probed) * files.length; // estimate the rest
  return { clips: files.length, duration_s: Math.round(dur), hints: { interviews, phone_vertical: vertical, log_or_hdr: hdr, vfr } , base };
}

const CASES = [
  [/testimonial|customer story/i, "customer-testimonial"], [/recruit|culture|careers/i, "recruiting-culture"], [/event|recap|conference/i, "event-recap"],
  [/ugc|creator/i, "ugc-ad"], [/founder|vision/i, "founder-talking-head"], [/podcast|clip/i, "podcast-clips"], [/screen|tutorial|demo recording/i, "screen-recording-demo"],
  [/app ?store|preview/i, "app-store-preview"], [/cutdown|re-?edit|social cut/i, "social-cutdown"], [/locali[sz]/i, "localisation"], [/rebrand/i, "rebrand-reveal"], [/product b-?roll|packshot/i, "product-broll"],
];

export function classify(paths, opts = {}) {
  const sources = [];
  const kinds = new Set();
  const note = [];
  for (const raw of paths) {
    const p = expand(raw);
    let st;
    try { st = fs.statSync(p); } catch { note.push(`not found: ${raw}`); continue; }
    if (st.isFile()) {
      const b = path.basename(p);
      if (VIDEO.test(b)) {
        const existing = opts.kind === "existing-video" || /final|master|export|render|launch|v\d+\.|cut\d*\./i.test(b) || /(^|\/)renders\//.test(p);
        if (existing) { const pr = probe(p); sources.push({ kind: "existing-video", path: tilde(p), duration_s: pr ? Math.round(pr.duration) : null }); kinds.add("existing-video"); }
        else { const fs1 = footageSource([p], path.dirname(p)); sources.push({ kind: "footage", path: tilde(p), clips: 1, duration_s: fs1.duration_s, audio_files: 0, stills: 0, hints: fs1.hints }); kinds.add("footage"); }
      } else if (AUDIO.test(b)) { sources.push({ kind: "audio", path: tilde(p) }); kinds.add("audio"); }
      else if (/\.pdf$/i.test(b)) {
        if (BRANDISH.test(b)) { sources.push({ kind: "assets", path: tilde(p), pdf: [b], fonts: 0, logos: 0, templates: 0 }); kinds.add("assets"); }
        else { sources.push({ kind: "document", path: tilde(p), pages: pdfPages(p) }); kinds.add("document"); }
      } else if (FONT.test(b) || VECTOR.test(b) || TEMPLATE.test(b)) { sources.push({ kind: "assets", path: tilde(p), pdf: [], fonts: FONT.test(b) ? 1 : 0, logos: VECTOR.test(b) ? 1 : 0, templates: TEMPLATE.test(b) ? 1 : 0 }); kinds.add("assets"); }
      else if (/\.(md|docx?|txt|pptx?)$/i.test(b)) { sources.push({ kind: "document", path: tilde(p) }); kinds.add("document"); }
      else note.push(`ignored: ${raw} (not a type RasanAI reads)`);
      continue;
    }
    const A = walk(p);
    const isCode = A.markers.some((m) => m !== "hyperframes.json") && A.videos.length < 3;
    if (isCode) { sources.push({ kind: "code", path: tilde(p), markers: [...new Set(A.markers)] }); kinds.add("code"); }
    if (A.videos.length && !isCode) {
      // audio files alongside video are dual-system sound; a lone audio folder is a track
      const brandVideo = A.videos.filter((f) => BRANDISH.test(f)).length;
      const own = A.videos.filter((f) => !/(^|\/)(renders|node_modules)\//.test(f));
      const f1 = footageSource(own.length ? own : A.videos, p);
      sources.push({ kind: "footage", path: tilde(p), clips: own.length || A.videos.length, duration_s: f1.duration_s, audio_files: A.audio, stills: A.stills, hints: { ...f1.hints, separate_audio: A.audio > 0 }, brand_videos: brandVideo || undefined, truncated: A.truncated || undefined });
      kinds.add("footage");
    } else if (!isCode && A.audio && !A.stills && !A.pdf.length) { sources.push({ kind: "audio", path: tilde(p), files: A.audio }); kinds.add("audio"); }
    else if (!isCode && A.stills > 3 && !A.videos.length) { sources.push({ kind: "footage", path: tilde(p), clips: 0, duration_s: 0, audio_files: 0, stills: A.stills, hints: {} }); kinds.add("footage"); }
    // brand kit: a brand-ish folder, or fonts / guideline PDFs / vectors in the folder itself
    const guide = A.pdf.filter((f) => BRANDISH.test(path.basename(f)) || [...A.brandDirs].some((d) => f.startsWith(d)));
    if (A.fonts || guide.length || (A.vector >= 2 && A.brandDirs.size) || A.templates) {
      sources.push({ kind: "assets", path: tilde([...A.brandDirs][0] || p), pdf: guide.map((f) => path.basename(f)), fonts: A.fonts, logos: A.vector, templates: A.templates });
      kinds.add("assets");
    }
    const loosePdf = A.pdf.filter((f) => !guide.includes(f));
    if (!A.videos.length && !isCode && loosePdf.length && !kinds.has("assets")) { sources.push({ kind: "document", path: tilde(p), pdf: loosePdf.map((f) => path.basename(f)), pages: loosePdf.length === 1 ? pdfPages(loosePdf[0]) : undefined }); kinds.add("document"); }
  }
  if (opts.url) { sources.push({ kind: "web", url: String(opts.url) }); kinds.add("web"); }
  if (opts.code) for (const c of [].concat(opts.code)) { if (!sources.some((s) => s.kind === "code" && s.path === tilde(expand(c)))) { sources.push({ kind: "code", path: tilde(expand(c)) }); kinds.add("code"); } }
  const order = ["footage", "existing-video", "audio", "web", "code", "document", "assets"];
  const spine = order.find((k) => kinds.has(k)) || null;
  // one kind is its own mode (code is "local"); footage with its own brand kit is still "footage"; anything else is "mixed"
  const mode = kinds.size === 1 ? (spine === "code" ? "local" : spine) : kinds.size === 2 && kinds.has("footage") && kinds.has("assets") ? "footage" : kinds.size ? "mixed" : null;
  const pub = !!(kinds.has("web") || opts.public);
  const kindText = String(opts.kind || "") + " " + String(opts.case || "");
  let kase = (CASES.find(([re]) => re.test(kindText)) || [])[1] || null;
  if (opts.case && /^[a-z-]+$/.test(String(opts.case))) kase = String(opts.case);
  if (!kase) kase = spine === "footage" ? (kinds.has("assets") || /brand/i.test(kindText) ? "own-brand-film" : "footage-edit")
    : spine === "existing-video" ? "social-cutdown" : spine === "audio" ? "music-video" : spine === "web" ? "public-launch" : spine === "code" ? (pub ? "public-launch" : "own-unreleased-product") : spine === "document" ? "data-report" : spine === "assets" ? "rebrand-reveal" : null;
  const storyPass = { footage: "footage-writers", "existing-video": "cutdown-planner", audio: "treatment-writers", web: "script-writers", code: "script-writers", document: "script-writers", assets: "script-writers" }[spine] || null;
  const productFirst = productFirstApplies({ spine, case: kase });
  const chips = sources.map((s) => {
    if (s.kind === "footage") return s.clips ? `${s.clips} clip${s.clips === 1 ? "" : "s"}${s.duration_s ? ` (${fmtDur(s.duration_s)})` : ""}` : `${s.stills} stills`;
    if (s.kind === "assets") return "Brand kit";
    if (s.kind === "web") return s.url.replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (s.kind === "code") return `Code: ${path.basename(expand(s.path))}`;
    if (s.kind === "document") return `Document: ${path.basename(s.path)}`;
    if (s.kind === "existing-video") return `Video: ${path.basename(s.path)}`;
    return `Audio: ${path.basename(s.path)}`;
  });
  return { mode, spine, case: kase, public: pub, story_pass: storyPass, product_first: productFirst, sources, chips, notes: note.length ? note : undefined };
}

function pdfPages(f) {
  const r = spawnSync("pdfinfo", [f], { encoding: "utf8", timeout: 8000 });
  const m = String(r.stdout || "").match(/^Pages:\s+(\d+)/m);
  return m ? Number(m[1]) : null;
}

export function readSources(file) {
  if (!file || file === true) return null;
  try { return JSON.parse(fs.readFileSync(path.resolve(String(file)), "utf8")); } catch { return null; }
}
export const isFootageLed = (src) => !!src && (src.spine === "footage" || src.spine === "existing-video");
const PRODUCT_CASES = new Set(["public-launch", "own-unreleased-product", "app-store-preview", "feature-drop", "product-launch"]);
// product-first (rule 15, G7/G9/G10/G11/G12): a web or code spine whose case is a product launch or promo. No source file: today's behaviour (the format decides).
export function productFirstApplies(src, caseHint) {
  if (!src) return null;
  if (isFootageLed(src)) return false;
  if (src.spine === "audio" || src.spine === "document" || src.spine === "assets") return false;
  const c = caseHint || src.case;
  return !c || PRODUCT_CASES.has(c);
}

// who researches what, by source kind (the desks of references/sources.md). Used by crew.mjs plan.
export function desksFor(src) {
  const kinds = new Set((src.sources || []).map((s) => s.kind));
  const footageSpine = src.spine === "footage" || src.spine === "existing-video";
  const out = [];
  if (kinds.has("web")) out.push({ desk: "research", roles: footageSpine ? ["product-researcher:topic"] : ["product-researcher", "screens-researcher"], why: "the public web: product, releases, screens" });
  if (kinds.has("code")) out.push({ desk: "local", roles: ["local-scout"], why: "an approved codebase: README, tokens, UI strings, changelog" });
  if (kinds.has("footage") || kinds.has("existing-video")) out.push({ desk: "footage", roles: ["footage-logger", "selects-producer"], why: "the rushes: a log, selects and the material map" });
  if (kinds.has("assets")) out.push({ desk: "brand-kit", roles: ["brand-kit-builder"], why: "the user's own brand files: guidelines PDF, fonts, logos, earlier films" });
  else if (src.public || kinds.has("web")) out.push({ desk: "brand", roles: ["brand-researcher"], why: "the brand's public identity" });
  if (kinds.has("document")) out.push({ desk: "research", roles: ["product-researcher:document"], why: "a document: numbers with page references" });
  return out;
}
