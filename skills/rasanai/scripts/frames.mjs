#!/usr/bin/env node
// Styleframes and design boards (references/styleframes.md): every scene route designs its film as pictures before
// the score. A shot list (frames/shots.json), three hero styleframes (open, peak, end) and one board per beat
// (frames/<NN>.html rendered to <NN>.png), judged next to reference stills of the same kind, approved by the user,
// then animated between. Zero dependencies: Node + ffmpeg (+ headless Chrome for labelled sheets).
//
//   node frames.mjs init --run <run> [--dir <frames dir>] [--aspect 16:9] [--heroes]   (--heroes: a Look card's open, peak and end only)
//        -> frames/ with the frame kit (kit/frame-kit.css, kit/frame-kit.js), RasanCamera installed when camera.mjs is there,
//           and a shots.json skeleton from story/chosen.json (never overwrites one)
//   node frames.mjs shots-check --run <run> [--dir <frames dir>] [--length s]
//        -> the shot-list rules (sizes, hero scale, text load, giant moment, anchor, light, heroes) and which boards exist; exit 2 on errors
//   node frames.mjs refs --run <run> [--no-extract] [--sheet]
//        -> frames/refs.json: every reference still the run has, by origin (brand film, the user's reference clip, precedent films,
//           fetched moments, frames/refs/ by hand); frames are pulled from videos that have none; the library showcases in words
//   node frames.mjs sheet --ours <dir|png,...> --refs <dir|png,...> --out <png> [--title "..."] [--cell 640]
//        -> a side-by-side sheet: ours (outlined) | reference(s), one row per ours
//   node frames.mjs gate --run <run> [--dir <frames dir>]
//        -> runs frame-gate.mjs on the boards when it is installed (frames/gate.json); a note when it is not
//        (new creative policy: init writes film.look_style from the selected Look's blend.json, shots-check and gate apply the depth craft only to a look that selects it,
//         its other findings are severity "review" evidence for the juror; refs adds the selected creative references' lawful images, origin "creative-reference")
//        (new medium path: a look with design/<Label>/medium.json (or look/medium.json) that qualifies multi-plane-depth for every layer moves the depth craft to review in shots-check and the gate; reported as medium_exceptions)
//   node frames.mjs match --run <run> --video <draft.mp4> [--plan <score.json>] [--out <png>]
//        -> the draft at each board's peak next to the board, SSIM on a 160x90 grey downscale (frames/match.json, frames/match.png)
//   node frames.mjs payload --run <run> [--out <styleframes.json>]
//        -> the console's styleframes payload from shots.json, the PNGs and verdict.json
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { parseArgs, die, chromeScreenshot, normalizeAspect, SKILL_DIR } from "./lib/common.mjs";
import { track } from "./lib/report.mjs";
import { readShots, checkShots, boardFiles, collectRefs, gridSheet, grey, ssim, boardFor, buildPayload, frameId, KIT_CSS, KIT_JS } from "./lib/frames-lib.mjs";
import { runCreativeOn, lookStyleOf, creativeLookProfile, referenceStills } from "./lib/creative-run.mjs"; // Creative Recovery: only a plan with creative_policy_revision 1 changes anything below

const args = parseArgs();
const cmd = args._[0];
track(
  { init: "Setting up the styleframes folder", refs: "Gathering reference stills to judge the frames against", sheet: "Laying the frames next to the references", match: "Comparing the draft with the approved boards", gate: "Measuring the boards as pictures" }[cmd],
  { init: "Styleframes folder ready", refs: "Reference stills gathered", sheet: "Side-by-side sheet ready", match: "Draft-vs-board sheet ready", gate: "Boards measured" }[cmd]
);
const out = (o, code = 0) => { console.log(JSON.stringify(o, null, 2)); process.exit(code); };
const str = (v) => (v == null || v === true ? "" : String(v));
const exists = (p) => !!p && fs.existsSync(p);
const WS = process.cwd();
const rel = (p) => path.relative(WS, path.resolve(p)) || ".";
const readJ = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
function runDir() {
  if (!args.run || args.run === true) die("--run <run dir> required");
  const d = path.resolve(String(args.run));
  if (!exists(d)) die(`run dir not found: ${d}`);
  return d;
}
const dirOf = (run) => (args.dir && args.dir !== true ? path.resolve(String(args.dir)) : path.join(run, "frames"));
const list = (v) => {
  const items = [];
  for (const part of str(v).split(",").map((s) => s.trim()).filter(Boolean)) {
    const p = path.resolve(part);
    if (exists(p) && fs.statSync(p).isDirectory()) items.push(...fs.readdirSync(p).filter((f) => /\.(png|jpe?g|webp)$/i.test(f) && !/sheet|contact/i.test(f)).sort().map((f) => path.join(p, f)));
    else if (exists(p)) items.push(p);
  }
  return items;
};
// labelled sheets need headless Chrome; without one (chromePath would stop the process) the sheet falls back to ffmpeg tiles
let _chrome = null;
const hasChrome = () => { if (_chrome !== null) return _chrome; _chrome = (() => {
  if (process.env.RASANAI_FRAMES_NO_CHROME) return false;
  const env = process.env.RASANAI_CHROME || process.env.RASA_MOTION_CHROME || process.env.MOTION_DIRECTOR_CHROME;
  if (env) return fs.existsSync(env);
  if (["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium"].some((p) => fs.existsSync(p))) return true;
  const r = spawnSync("npx", ["--yes", "hyperframes", "browser", "path"], { encoding: "utf8", timeout: 30000 });
  const line = String(r.stdout || "").trim().split("\n").pop();
  return !!line && fs.existsSync(line);
})(); return _chrome; };
const shot = (u, o, w, h, b) => chromeScreenshot(u, o, w, h, b);
// the craft class of the look being drawn: the Look comparison folder (design/<Label>/frames) uses that system's own look_style, the film's frames folder the selected Look's (null on a legacy run)
function lookStyleFor(run, dir) {
  if (!runCreativeOn(run)) return null;
  const parent = path.dirname(dir);
  if (path.basename(dir) === "frames" && path.basename(path.dirname(parent)) === "design") {
    const b = readJ(path.join(parent, "blend.json"));
    if (b && typeof b.look_style === "string" && b.look_style.trim()) return b.look_style.trim();
  }
  return lookStyleOf(run);
}
// Part 2 (new path only): the medium contract of the look being drawn (design/<Label>/medium.json in a Look comparison folder, else the chosen look/medium.json) and the checks it qualifies for ALL its layers
// (medium-rules via medium-wiring scopedSkips). No contract (a legacy look) -> null and every check is as before.
async function mediumFor(run, dir) {
  const parent = path.dirname(dir);
  const files = path.basename(dir) === "frames" && path.basename(path.dirname(parent)) === "design" ? [path.join(parent, "medium.json")] : [path.join(run, "look", "medium.json")];
  const f = files.find(exists), c = f && readJ(f);
  if (!c || c.format !== "medium-contract@1") return null;
  const { scopedSkips } = await import("./lib/medium-wiring.mjs");
  const r = scopedSkips(c, ["multi-plane-depth"]);
  return { profile: c.profile_id, skip: [...r.skip], exceptions: r.exceptions };
}
const filmLength = (run) => {
  const b = readJ(path.join(run, "brief.json")) || {};
  const f = b.fields || b;
  return Number(args.length) || Number(f.length_s) || Number((readJ(path.join(run, "motion", "score.json")) || {}).duration) || null;
};

if (cmd === "init") {
  const run = runDir(), dir = dirOf(run);
  fs.mkdirSync(path.join(dir, "kit"), { recursive: true });
  fs.writeFileSync(path.join(dir, "kit", "frame-kit.css"), KIT_CSS);
  fs.writeFileSync(path.join(dir, "kit", "frame-kit.js"), KIT_JS);
  // RasanCamera (the product-cinematography rig) when this skill has it: stills use the same runtime the build will
  let camera = null;
  const cam = path.join(SKILL_DIR, "scripts", "camera.mjs");
  if (exists(cam)) {
    const r = spawnSync(process.execPath, [cam, "install", "--project", dir], { encoding: "utf8", env: { ...process.env, RASANAI_QUIET: "1" }, timeout: 60000 });
    camera = r.status === 0 ? "installed (assets/rasan-camera/)" : `camera.mjs install failed: ${(r.stderr || r.stdout || "").trim().split("\n").pop()}`;
  }
  const shotsF = path.join(dir, "shots.json");
  let skeleton = false;
  if (!exists(shotsF)) {
    const ch = readJ(path.join(run, "story", "chosen.json")) || {};
    const beats = Array.isArray(ch.beats) ? ch.beats : [];
    const b = readJ(path.join(run, "brief.json")) || {};
    const aspect = str(args.aspect) || (b.fields || b).aspect || "16:9";
    let t = 0;
    const shots = beats.map((x, i) => {
      const d = Number(x.duration_s) || 0, mid = Math.round((t + d * 0.65) * 100) / 100; t += d;
      return { id: frameId(i), beat: x.name || `beat ${i + 1}`, t: mid, line: x.on_screen || "", kind: "", size: "", hero: "", hero_pct: null, angle: "", focus: { sharp: "", soft: "" }, light: { key: "", color: "" }, ground: { tint: "", falloff: "" }, type: x.on_screen ? [{ text: x.on_screen, pct: null }] : [], crop: "", device: "", anchor: "" };
    });
    let n = shots.length;
    // --heroes (the Look call): only the story's open, peak and end, with those ids
    if (args.heroes && n) { const pick = [0, Math.max(1, Math.floor((n - 1) * 0.6)), n - 1].map((k) => shots[Math.min(k, n - 1)]); ["open", "peak", "end"].forEach((id, k) => { pick[k] = { ...pick[k], id }; }); shots.splice(0, n, ...pick); n = 3; }
    const ls = lookStyleFor(run, dir);
    fs.writeFileSync(shotsF, JSON.stringify({ film: { aspect, duration: Math.round(t * 100) / 100 || null, ...(ls ? { look_style: ls } : {}), device: "", light: "", palette: "", heroes: n >= 3 ? [shots[0].id, shots[Math.floor((n - 1) * 0.6)].id === shots[0].id ? shots[1].id : shots[Math.floor((n - 1) * 0.6)].id, shots[n - 1].id] : [], density_shot: null }, shots }, null, 2) + "\n");
    skeleton = true;
  }
  // an existing shots.json keeps what the designer wrote; only a missing film.look_style is filled in (the craft class the frame checks and the gate read)
  if (!skeleton && runCreativeOn(run)) {
    const doc0 = readJ(shotsF), ls0 = lookStyleFor(run, dir);
    if (doc0 && doc0.film && typeof doc0.film === "object" && !doc0.film.look_style && ls0) { doc0.film.look_style = ls0; fs.writeFileSync(shotsF, JSON.stringify(doc0, null, 2) + "\n"); }
  }
  out({ ok: true, dir: rel(dir), kit: [rel(path.join(dir, "kit", "frame-kit.css")), rel(path.join(dir, "kit", "frame-kit.js"))], camera: camera || "not in this skill yet: use the frame kit (data-dof, RK.contactShadow) and CSS 3D", shots: rel(shotsF), skeleton, next: "Fill shots.json (every field, per beat), run shots-check, design the 3 hero frames, then one board per beat; render with design.mjs stills --dir " + rel(dir) });
} else if (cmd === "shots-check") {
  const run = runDir(), dir = dirOf(run);
  const doc = readShots(path.join(dir, "shots.json"));
  if (doc === undefined) out({ ok: false, errors: [`${rel(path.join(dir, "shots.json"))} is not valid JSON`] }, 2);
  // null: every rule as before. A Look comparison folder (design/<Label>/frames: three heroes) is not the film's shot list, so the film's signature-event and beat bindings are not asked of it.
  const cp0 = runCreativeOn(run) ? { ...creativeLookProfile(run, doc), ...(lookStyleFor(run, dir) ? { style: lookStyleFor(run, dir) } : {}) } : null;
  const cp = cp0 && path.resolve(dir) !== path.join(run, "frames") ? { ...cp0, signatureEvents: [], beatIds: [], protectedText: [] } : cp0;
  const med = await mediumFor(run, dir);
  const r = checkShots(doc, { duration: filmLength(run), creativePolicy: cp, ...(med && med.skip.length ? { mediumSkip: med.skip } : {}) });
  const boards = doc ? boardFiles(dir, doc) : [];
  const missing = boards.filter((b) => !b.has_png).map((b) => b.id);
  out({ ok: !r.errors.length, errors: r.errors, warnings: r.warnings, ...(r.review ? { review: r.review, review_note: "craft the selected look does not choose: evidence for the juror, not a failure" } : {}), ...(med && med.exceptions.length ? { medium_exceptions: med.exceptions } : {}), stats: r.stats, boards: { have: boards.filter((b) => b.has_png).map((b) => b.id), missing } }, r.errors.length ? 2 : 0);
} else if (cmd === "refs") {
  const run = runDir();
  const R = collectRefs(run, { skillDir: SKILL_DIR, extract: !args["no-extract"] });
  // new creative policy: the selected references' lawful, present, hash-checked images join the stills (no download, no copy); text-only selections stay descriptions and say so
  let creative = null;
  if (runCreativeOn(run)) {
    const cr = referenceStills(run, { skillDir: SKILL_DIR });
    for (const st of cr.stills) if (!R.stills.some((x) => x.image === st.image)) { R.stills.push(st); R.by_origin["creative-reference"] = (R.by_origin["creative-reference"] || 0) + 1; }
    const sel = readJ(path.join(run, "creative", "references.json"));
    creative = { selected: ((sel && sel.selected) || []).map((x) => x.id), evidence: (sel && sel.evidenceLevel) || "none", images_added: cr.stills.length, skipped: cr.skipped, limitation: cr.stills.length ? "pictures are reference-only: learn the principle, never copy the scene, logo or media" : "no lawful reference image is available for the selected references: they are text descriptions, which teach a principle and cannot certify visual parity" };
  }
  const file = path.join(run, "frames", "refs.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const doc = { stills: R.stills.map((s) => ({ ...s, image: rel(s.image) })), by_origin: R.by_origin, descriptions: R.descriptions.map((d) => ({ ...d, file: rel(d.file) })), ...(creative ? { creative_references: creative } : {}) };
  fs.writeFileSync(file, JSON.stringify(doc, null, 2) + "\n");
  let sheet = null;
  if (args.sheet && R.stills.length) {
    const cells = R.stills.slice(0, 48).map((s) => ({ image: s.image, label: `${s.origin} · ${path.basename(s.image)}` }));
    const rows = [];
    for (let i = 0; i < cells.length; i += 6) rows.push(cells.slice(i, i + 6));
    try { sheet = rel(gridSheet(rows, path.join(run, "frames", "refs-sheet.png"), { cellW: 360, title: "Reference stills in this run", screenshot: hasChrome() ? shot : null }).sheet); } catch (e) { sheet = `could not draw: ${e.message}`; }
  }
  out({ ok: true, refs: rel(file), stills: R.stills.length, by_origin: R.by_origin, descriptions: R.descriptions.length, ...(creative ? { creative_references: creative } : {}), sheet, note: R.stills.length ? "Sort them by kind (title card, UI demo, object, type, end card) and judge each board next to one of its own kind" : "No reference stills in this run: judge against the showcase films' lines (descriptions) and say so in the verdict" });
} else if (cmd === "sheet") {
  const ours = list(args.ours), refs = list(args.refs);
  const outPng = str(args.out) ? path.resolve(str(args.out)) : die("--out <png> required");
  if (!ours.length) die("--ours <dir|png,...>: nothing found");
  const rows = ours.map((o, i) => {
    const mine = refs.length === ours.length ? [refs[i]] : refs.slice(0, 4);
    return [{ image: o, label: `ours · ${path.basename(o)}`, ours: true }, ...mine.map((r) => ({ image: r, label: `ref · ${path.basename(path.dirname(r))}/${path.basename(r)}` }))];
  });
  try {
    const r = gridSheet(rows, outPng, { cellW: Number(args.cell) || 640, title: str(args.title), screenshot: hasChrome() ? shot : null });
    out({ ok: true, sheet: rel(r.sheet), rows: rows.length, labels: r.labels, look: "Read the sheet: would ours sit in the reference's reel without looking weaker?" });
  } catch (e) { die(e.message); }
} else if (cmd === "gate") {
  const run = runDir(), dir = dirOf(run);
  const gate = path.join(SKILL_DIR, "scripts", "frame-gate.mjs");
  if (!exists(gate)) out({ ok: true, skipped: true, note: "frame-gate.mjs is not in this skill yet: the juror judges by eye only" });
  const a = [gate, "--stills", dir, "--json"];
  if (fs.readdirSync(dir).some((x) => /^\d+\.html$/.test(x))) a.push("--html", dir);
  const g = path.join(run, "brand-film", "grammar.json");
  if (exists(g)) a.push("--brand-film", g);
  // the look decides which measured craft is a requirement; the rest is severity "review". A look that names no style is not the dimensional craft ("unspecified"), never silently the old rules.
  // Part 2: a medium contract that qualifies the depth craft for every layer makes it review evidence in the gate too (a flat style class); hard findings (legibility, structure) are unchanged
  const med = await mediumFor(run, dir);
  const mediumFlat = !!(med && med.skip.includes("multi-plane-depth"));
  if (mediumFlat) a.push("--look-style", "medium-flat");
  else if (runCreativeOn(run)) a.push("--look-style", lookStyleFor(run, dir) || creativeLookProfile(run, readShots(path.join(dir, "shots.json"))).style || "unspecified");
  const r = spawnSync(process.execPath, a, { encoding: "utf8", env: { ...process.env, RASANAI_QUIET: "1" }, timeout: 300000, maxBuffer: 1 << 26 });
  let j = null;
  try { j = JSON.parse(r.stdout); } catch { /* none */ }
  if (!j) out({ ok: false, could_not_run: true, error: (r.stderr || r.stdout || "").trim().split("\n").slice(-2).join(" ") }, 1);
  fs.writeFileSync(path.join(dir, "gate.json"), JSON.stringify(j, null, 2) + "\n");
  out({ ok: r.status === 0, gate: rel(path.join(dir, "gate.json")), status: r.status, ...(mediumFlat ? { medium_exceptions: med.exceptions } : {}), findings: (j.findings || []).slice(0, 12) }, r.status === 2 ? 2 : 0);
} else if (cmd === "match") {
  const run = runDir(), dir = dirOf(run);
  const video = str(args.video) ? path.resolve(str(args.video)) : die("--video <draft.mp4> required");
  if (!exists(video)) die(`not found: ${video}`);
  const doc = readShots(path.join(dir, "shots.json"));
  if (!doc) die("frames/shots.json is missing or invalid");
  const score = readJ(str(args.plan) ? path.resolve(str(args.plan)) : path.join(run, "motion", "score.json")) || {};
  const S = Array.isArray(score.scenes) ? score.scenes : [];
  // each board's time: the score scene bound to it (its peak_t, else 65% in), else the shot's own t
  const when = (shot, i) => {
    const si = S.findIndex((sc, k) => boardFor(sc, k, doc) === shot);
    if (si >= 0) {
      const sc = S[si], st = Number(sc.start), en = Number(sc.end);
      if (Number.isFinite(Number(sc.peak_t)) && Number.isFinite(st)) return st + Number(sc.peak_t);
      if (Number.isFinite(st) && Number.isFinite(en) && en > st) return st + (en - st) * 0.65;
    }
    return Number.isFinite(Number(shot.t)) ? Number(shot.t) : null;
  };
  const mdir = path.join(dir, "match");
  fs.mkdirSync(mdir, { recursive: true });
  const rows = [], res = [];
  doc.shots.forEach((s, i) => {
    const id = String(s.id || frameId(i)), png = path.join(dir, `${id}.png`), t = when(s, i);
    if (!exists(png) || t == null) { res.push({ id, t, ssim: null, note: !exists(png) ? "no board" : "no time (give the shot a t, or the score scene a start and end)" }); return; }
    const still = path.join(mdir, `${id}-draft.png`);
    spawnSync("ffmpeg", ["-y", "-v", "error", "-ss", String(t), "-i", video, "-frames:v", "1", still]);
    const A = grey(png), B = exists(still) ? grey(still) : null;
    const v = A && B ? ssim(A, B) : null;
    res.push({ id, beat: s.beat, t: Math.round(t * 100) / 100, ssim: v, board: rel(png), draft: exists(still) ? rel(still) : null, far: v != null && v < 0.35 ? true : undefined });
    rows.push([{ image: png, label: `board ${id} · ${s.beat || ""}`, ours: true }, { image: exists(still) ? still : null, label: `draft at ${Math.round(t * 100) / 100} s · SSIM ${v == null ? "?" : v}` }]);
  });
  let sheet = null;
  if (rows.length) { try { sheet = rel(gridSheet(rows, str(args.out) ? path.resolve(str(args.out)) : path.join(dir, "match.png"), { cellW: 560, title: "Boards vs the draft at each board's peak", screenshot: hasChrome() ? shot : null }).sheet); } catch (e) { sheet = `could not draw: ${e.message}`; } }
  const vals = res.map((r) => r.ssim).filter((x) => x != null);
  const doc2 = { video: rel(video), frames: res, mean_ssim: vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 1000) / 1000 : null, sheet, note: "SSIM is a number for the record (160x90 grey); the critic judges the match by eye: hero, crop, ground, focus and type sizes as the board" };
  fs.writeFileSync(path.join(dir, "match.json"), JSON.stringify(doc2, null, 2) + "\n");
  out({ ok: true, match: rel(path.join(dir, "match.json")), ...doc2 });
} else if (cmd === "payload") {
  const run = runDir();
  let p;
  try { p = buildPayload(run, { rel }); } catch (e) { die(e.message); }
  const f = str(args.out) ? path.resolve(str(args.out)) : path.join(run, "styleframes.json");
  fs.writeFileSync(f, JSON.stringify(p, null, 2) + "\n");
  out({ ok: true, payload: rel(f), frames: p.frames.length, heroes: p.heroes, recommended: p.recommended, push: `node "${path.join(SKILL_DIR, "scripts", "console.mjs")}" push --run ${rel(run)} --step styleframes --file ${rel(f)}` });
} else {
  die("usage: frames.mjs init|shots-check|refs|sheet|gate|match|payload (see the header)");
}
