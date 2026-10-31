#!/usr/bin/env node
// Style frames: before any build, 3 hero frames per concept, judged blind next to real reference frames.
// Pictures are cheap and builds are expensive: a concept below the bar is reworked, not built (ENGINE_REDESIGN pillar 6).
// Zero dependencies beyond Node >= 20 and headless Chrome. JSON on stdout. Agent: agents/style-frame-juror.md.
//
//   node style-frames.mjs render --concept <concept.json> --out <dir> [--pick <id|index>] [--hero s2,s4,s5] [--w 1280]
//        -> <dir>/frames/hero-1.png ... hero-3.png (HTML composition stills at 16:9) and <dir>/frames.json.
//           Concept fields as in board.mjs --concept (style_world.palette, carrier, shots[]). Hero shots: --hero ids, else concept.hero_shots,
//           else the opening shot, the signature-moment shot and a proof/closing shot. A shot's `image` (a Codex plate from
//           imagegen.mjs) fills the frame when the file exists; a shot's `html` replaces the generated composition entirely
//           (the hand-built frame a designer wrote), so a style frame can be as rich as the real build will be.
//   node style-frames.mjs pack --out <dir> [--refs 6] [--seed N]
//        -> <dir>/pack/blind.png (the 3 hero frames and N reference frames from library/benchmarks/reference-frames/, shuffled by the seed,
//           labelled A, B, C ... only), <dir>/pack/<label>.png per frame, <dir>/pack/key.json (which label is which: the juror NEVER reads it)
//           and <dir>/pack/brief.json (the question and the verdict shape).
//   node style-frames.mjs gate --out <dir> --verdict <verdict.json> [--bar 7]
//        -> {ok, mean, bar, frames[], action: "build"|"rework", why[]}; exit 0 to build, 2 rework. Verdict shape: agents/style-frame-juror.md.
//           Passes when the three concept frames average >= bar, none scores under bar-2, and at least 2 of 3 "sit in the reel" (yes or maybe).
//   node style-frames.mjs refs
//        -> the curated reference set (library/benchmarks/reference-frames/index.json).
import fs from "node:fs";
import path from "node:path";
import { parseArgs, die, readJSON, writeFile, esc, chromeScreenshot, SKILL_DIR } from "./lib/common.mjs";
import { styleOf, composition, COMP_CSS } from "./lib/story-visuals.mjs";
import { loadConcept } from "./lib/story-board.mjs";

const args = parseArgs();
const cmd = args._[0];
const s = (v) => (v == null || v === true ? "" : String(v));
const out = (o, code = 0) => { console.log(JSON.stringify(o, null, 2)); process.exit(code); };
const REFS = path.join(SKILL_DIR, "library", "benchmarks", "reference-frames");
const outDir = () => { if (!args.out || args.out === true) die("--out <dir> required"); return path.resolve(s(args.out)); };
const rnd = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

function heroShots(c) {
  const sh = c.shots;
  const byRef = (r) => sh.findIndex((x, i) => s(x.id) === s(r) || s(x.t) === s(r) || String(i) === s(r));
  let ids = args.hero ? s(args.hero).split(",") : Array.isArray(c.hero_shots) ? c.hero_shots : [];
  let idx = ids.map(byRef).filter((i) => i >= 0);
  if (!idx.length) {
    const sig = c.signature_moment && typeof c.signature_moment === "object" ? byRef(c.signature_moment.shot || c.signature_moment.id) : -1;
    const sigAt = sig >= 0 ? sig : sh.findIndex((x) => x.signature === true);
    const proof = sh.findIndex((x) => /ui|product|proof/i.test(`${x.style} ${x.move}`));
    idx = [0, sigAt >= 0 ? sigAt : Math.floor(sh.length / 2), proof > 0 ? proof : Math.floor((sh.length * 3) / 4)];
  }
  idx = [...new Set(idx)];
  for (let i = 0; idx.length < Math.min(3, sh.length) && i < sh.length; i++) if (!idx.includes(i)) idx.push(i);
  return idx.slice(0, 3).sort((a, b) => a - b);
}

if (cmd === "render") {
  const c = loadConcept(s(args.concept), args.pick);
  const dir = outDir(), W = Number(args.w) || 1280, H = Math.round((W * 9) / 16);
  const st = styleOf(c);
  fs.mkdirSync(path.join(dir, "frames"), { recursive: true });
  const carrier = c.carrier && typeof c.carrier === "object" ? s(c.carrier.what) : s(c.carrier);
  const picked = heroShots(c), frames = [];
  picked.forEach((i, k) => {
    const sh = c.shots[i];
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#000}.box{width:${W}px;height:${H}px}${COMP_CSS}</style></head><body><div class="box">${composition(sh, st, { carrier: !!carrier, caption: !!args.captions })}</div></body></html>`;
    const hf = path.join(dir, "frames", `hero-${k + 1}.html`), png = path.join(dir, "frames", `hero-${k + 1}.png`);
    writeFile(hf, html);
    chromeScreenshot(`file://${hf}`, png, W, H, 3000);
    if (!fs.existsSync(png)) die("a style frame did not render (is Chrome installed?)");
    frames.push({ n: k + 1, shot: s(sh.id || i), t: s(sh.t), words: s(sh.words), move: s(sh.move), png, html: hf });
  });
  const meta = { ok: true, concept: s(c.id || c.title), style_world: st.name, frames };
  writeFile(path.join(dir, "frames.json"), JSON.stringify(meta, null, 2) + "\n");
  out(meta);
} else if (cmd === "pack") {
  const dir = outDir();
  const fm = readJSON(path.join(dir, "frames.json"));
  // Reference stills are third-party frames kept local only (gitignored); a fresh install may have none.
  const refIdx = readJSON(path.join(REFS, "index.json")).frames.filter((f) => fs.existsSync(path.join(REFS, f.file)));
  if (!refIdx.length) process.stderr.write("style-frames: no local reference stills in library/benchmarks/reference-frames; the juror judges without the side-by-side bar.\n");
  const r = rnd(Number(args.seed) || 1);
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const nRefs = Math.max(2, Number(args.refs) || 6);
  const items = shuffle([
    ...fm.frames.map((f) => ({ kind: "concept", n: f.n, src: f.png })),
    ...shuffle(refIdx).slice(0, nRefs).map((f) => ({ kind: "reference", ref: f.file, brand: f.brand, src: path.join(REFS, f.file) })),
  ]);
  const pk = path.join(dir, "pack");
  fs.mkdirSync(pk, { recursive: true });
  const key = {};
  items.forEach((it, i) => {
    const L = String.fromCharCode(65 + i);
    fs.copyFileSync(it.src, path.join(pk, `${L}.png`));
    key[L] = it.kind === "concept" ? { kind: "concept", frame: it.n } : { kind: "reference", file: it.ref, brand: it.brand };
    it.L = L;
  });
  const cols = 3, tw = 520, th = Math.round((tw * 9) / 16), rows = Math.ceil(items.length / cols);
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#111;font:700 20px -apple-system,Helvetica,Arial,sans-serif;color:#fff}.g{display:grid;grid-template-columns:repeat(${cols},${tw}px);gap:14px;padding:14px}figure{margin:0;position:relative}img{width:${tw}px;height:${th}px;object-fit:cover;display:block}b{position:absolute;left:8px;top:8px;background:#000c;border-radius:6px;padding:3px 11px}</style></head><body><div class="g">${items.map((it) => `<figure><img src="file://${path.join(pk, it.L + ".png")}"><b>${it.L}</b></figure>`).join("")}</div></body></html>`;
  const hf = path.join(pk, "blind.html");
  writeFile(hf, html);
  chromeScreenshot(`file://${hf}`, path.join(pk, "blind.png"), cols * tw + 14 * (cols + 1), rows * (th + 14) + 14, 3000);
  writeFile(path.join(pk, "key.json"), JSON.stringify(key, null, 2) + "\n");
  const labels = Object.keys(key);
  writeFile(path.join(pk, "brief.json"), JSON.stringify({
    sheet: "pack/blind.png", frames: labels.map((L) => `pack/${L}.png`),
    question: "Some of these are stills from award-level launch films; some are concept style frames from a film not yet built. You are not told which. For every frame answer: would it sit in that reel? what is missing? a score 1-10.",
    verdict_file: "verdict.json", verdict_shape: { frames: labels.map((L) => ({ label: L, sits_in_reel: "yes|maybe|no", missing: ["..."], score: 0, guess: "reference|concept" })), overall: "one sentence", rework: ["the top 3 changes, in order"] },
  }, null, 2) + "\n");
  out({ ok: true, blind: path.join(pk, "blind.png"), frames: labels.length, pack: pk, juror_must_not_read: path.join(pk, "key.json") });
} else if (cmd === "gate") {
  const dir = outDir();
  if (!args.verdict || args.verdict === true) die("--verdict <verdict.json> required");
  const v = readJSON(path.resolve(s(args.verdict)));
  const key = readJSON(path.join(dir, "pack", "key.json"));
  const bar = Number(args.bar) || 7;
  const rows = (v.frames || []).filter((f) => key[f.label] && key[f.label].kind === "concept").map((f) => ({ frame: key[f.label].frame, label: f.label, score: Number(f.score), sits: s(f.sits_in_reel), missing: f.missing || [], guess: f.guess }));
  const why = [];
  const want = Object.values(key).filter((k) => k.kind === "concept").length;
  if (rows.length < want || rows.some((r) => !Number.isFinite(r.score))) why.push(`the verdict must score all ${want} concept frames (score 1-10)`);
  const mean = rows.length ? rows.reduce((a, r) => a + (Number.isFinite(r.score) ? r.score : 0), 0) / rows.length : 0;
  if (mean < bar) why.push(`mean ${mean.toFixed(1)} is under the bar ${bar}`);
  for (const r of rows) if (r.score < bar - 2) why.push(`frame ${r.frame} scores ${r.score}: ${[].concat(r.missing).slice(0, 2).join("; ") || "no reason given"}`);
  if (rows.filter((r) => r.sits === "yes" || r.sits === "maybe").length < Math.min(2, want)) why.push("fewer than 2 frames sit in the reel");
  const ok = !why.length;
  out({ ok, mean: Math.round(mean * 10) / 10, bar, frames: rows, action: ok ? "build" : "rework", why, rework: v.rework || [] }, ok ? 0 : 2);
} else if (cmd === "refs") {
  out(readJSON(path.join(REFS, "index.json")));
} else {
  die("usage: style-frames.mjs render|pack|gate|refs … (see the header)");
}
