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
//   node style-frames.mjs atlas-preview [--out library/styles/atlas/preview] [--only id,id]
//        -> <out>/<id>.png (a swatch card per atlas style: the 3 palettes, type specimen, texture and a sample frame, no Codex) and <out>/all.png (contact sheet of every style).
//   node style-frames.mjs refs
//        -> the curated reference set (library/benchmarks/reference-frames/index.json).
import fs from "node:fs";
import path from "node:path";
import { parseArgs, die, readJSON, writeFile, esc, chromeScreenshot, SKILL_DIR } from "./lib/common.mjs";
import { styleOf, composition, COMP_CSS, fontLinks } from "./lib/story-visuals.mjs";
import { atlasIndex, atlasArt } from "./lib/concept-schema.mjs";
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
    const html = `<!doctype html><html><head><meta charset="utf-8">${fontLinks(st)}<style>html,body{margin:0;background:#000}.box{width:${W}px;height:${H}px}${COMP_CSS}</style></head><body><div class="box">${composition(sh, st, { carrier: !!carrier, caption: !!args.captions })}</div></body></html>`;
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
  // Reference frames: the run's own ingested bar frames (<run>/refs/*/bar-frames/*.png; --run <dir>, else <out> or its parent when that has refs/) when any exist;
  // otherwise the curated set. Third-party stills are kept local only (gitignored); a fresh install may have none.
  const runBar = (run) => { const rd = path.join(run, "refs"), o = []; try { for (const d of fs.readdirSync(rd)) { const bf = path.join(rd, d, "bar-frames"); if (fs.existsSync(bf) && fs.statSync(bf).isDirectory()) for (const x of fs.readdirSync(bf).sort()) if (/\.png$/i.test(x)) o.push({ file: path.join(d, "bar-frames", x), brand: d, abs: path.join(bf, x) }); } } catch {} return o; };
  const runDirs = args.run && args.run !== true ? [path.resolve(s(args.run))] : [dir, path.dirname(dir)];
  let refIdx = [];
  for (const rd of runDirs) { refIdx = runBar(rd); if (refIdx.length) break; }
  const fromRun = refIdx.length > 0;
  if (!fromRun) refIdx = readJSON(path.join(REFS, "index.json")).frames.filter((f) => fs.existsSync(path.join(REFS, f.file))).map((f) => ({ ...f, abs: path.join(REFS, f.file) }));
  if (!refIdx.length) process.stderr.write("style-frames: no reference frames (no <run>/refs/*/bar-frames and no local stills in library/benchmarks/reference-frames); the juror judges without the side-by-side bar.\n");
  const r = rnd(Number(args.seed) || 1);
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const nRefs = Math.max(2, Number(args.refs) || 6);
  const items = shuffle([
    ...fm.frames.map((f) => ({ kind: "concept", n: f.n, src: f.png })),
    ...shuffle(refIdx).slice(0, nRefs).map((f) => ({ kind: "reference", ref: f.file, brand: f.brand, src: f.abs })),
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
  out({ ok: true, reference_source: fromRun ? "run bar-frames" : "library/benchmarks/reference-frames", blind: path.join(pk, "blind.png"), frames: labels.length, pack: pk, juror_must_not_read: path.join(pk, "key.json") });
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
} else if (cmd === "atlas-preview") {
  const dir = path.resolve(s(args.out) || path.join(SKILL_DIR, "library", "styles", "atlas", "preview"));
  fs.mkdirSync(dir, { recursive: true });
  const only = new Set(s(args.only).split(",").filter(Boolean));
  const list = atlasIndex().styles.filter((e) => atlasArt(e.id) && (!only.size || only.has(e.id)));
  const sample = (id, pal) => { const c = { style_world: id, style: pal ? { palette_id: pal } : {} }; const st = styleOf(c); return { st, html: composition({ words: "Ship it", see: "sample frame" }, st, {}) }; };
  const sw = (p) => ["bg", "bg2", "ink", "accent", "accent2"].map((k) => `<i title="${k}" style="background:${p[k]}"><b>${p[k].slice(1)}</b></i>`).join("");
  const base = "html,body{margin:0;background:#0f1013;color:#e9e9ec;font:500 13px/1.4 -apple-system,'Helvetica Neue',Arial,sans-serif}.sw{display:flex;gap:6px}.sw i{position:relative;display:block;width:78px;height:46px;border-radius:6px;border:1px solid #ffffff2e}.sw b{position:absolute;left:5px;bottom:3px;font:600 9.5px ui-monospace,monospace;color:#fff;mix-blend-mode:difference}";
  const render = (name, html, w, h, budget) => { const hf = path.join(dir, name + ".html"), png = path.join(dir, name + ".png"); writeFile(hf, html); chromeScreenshot(`file://${hf}`, png, w, h, budget); fs.rmSync(hf, { force: true }); return png; };
  const done = [];
  for (const e of list) {
    const art = atlasArt(e.id), { st } = sample(e.id);
    const W = 1600, H = 900, bw = 960, bh = 540;
    const pr = art.type.pairings;
    const palRows = art.palettes.map((p) => `<div class="pr"><div class="sw">${sw(p)}</div><div class="pn"><b>${p.name}</b><span>${p.words}</span></div></div>`).join("");
    const typeRows = pr.map((t) => `<div class="ty"><div class="sp" style="font-family:${t.css.display};font-weight:${t.weight};letter-spacing:${t.tracking.hero};${t.case === "upper" ? "text-transform:uppercase;" : t.case === "lower" ? "text-transform:lowercase;" : ""}">Aa Quick fox</div><div class="sm" style="font-family:${t.css.text}">The text face sets labels and captions, 1234567890</div><div class="tag">${t.display.family} + ${t.text.family} / case ${t.case} / hero ${t.scale.hero_cqw}cqw / tracking ${t.tracking.hero}</div></div>`).join("");
    const fxs = art.finish.passes.map((p) => `${p.pass}(${Object.entries(p.params).filter(([, v]) => typeof v !== "object").map(([k, v]) => k + " " + v).join(", ")})`).join("  /  ") || "no shader pass (clean by design)";
    const html = `<!doctype html><html><head><meta charset="utf-8">${fontLinks(st)}<style>${base}${COMP_CSS}
.w{width:${W}px;height:${H}px;padding:28px 32px;box-sizing:border-box;display:grid;grid-template-columns:${bw}px 1fr;gap:32px}
h1{margin:0;font-size:28px;letter-spacing:-.02em}.sub{color:#9a9ca6;margin:2px 0 14px}
.frame{width:${bw}px;height:${bh}px;border-radius:10px;border:1px solid #ffffff22}
.pr{display:flex;gap:14px;align-items:center;margin-top:12px}.pn{display:flex;flex-direction:column;gap:2px}.pn span{color:#9a9ca6;font-size:12px}
h2{margin:0 0 8px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#7d808b}
.ty{background:#17181d;border-radius:8px;padding:12px 14px;margin-bottom:10px;border:1px solid #ffffff14}.sp{font-size:44px;line-height:1.1;color:#fff}.sm{font-size:14px;color:#c9cbd2;margin-top:4px}.tag{font:500 11px ui-monospace,monospace;color:#80838f;margin-top:6px}
.fxn{font:500 12px ui-monospace,monospace;color:#c9cbd2;background:#17181d;border-radius:8px;padding:10px 12px;border:1px solid #ffffff14;margin-bottom:14px}
.ln{color:#b6b8c0;font-size:12.5px;margin:0 0 10px}</style></head><body><div class="w">
<div><h1>${art && (JSON.parse(fs.readFileSync(path.join(SKILL_DIR, "library", "styles", "atlas", e.file || e.id + ".json"), "utf8")).name)}</h1><div class="sub">${e.id}  /  palette 1 sample frame, ${st.fx.join(", ") || "no css finish"}</div>
<div class="box frame">${sample(e.id).html}</div>${palRows}</div>
<div><h2>Type</h2>${typeRows}<h2>Texture and finish (rasan-fx)</h2><div class="fxn">${fxs}</div>
<h2>Composition</h2><p class="ln">${art.composition.grid}</p><h2>Product UI</h2><p class="ln">${art.composition.product_ui}</p><h2>Cheap when</h2><p class="ln">${art.cheap_ways.join("  /  ")}</p></div></div></body></html>`;
    done.push(render(e.id, html, W, H, 9000));
  }
  const cols = 6, tw = 380, th = Math.round((tw * 9) / 16);
  const tiles = list.map((e) => { const { st, html } = sample(e.id), art = atlasArt(e.id), p = art.palettes[0]; return { st, tile: `<div class="t"><div class="box f" style="width:${tw}px;height:${th}px">${html}</div><div class="nm"><b>${e.number}. ${e.id}</b><span class="sw2">${["bg", "ink", "accent", "accent2"].map((k) => `<i style="background:${p[k]}"></i>`).join("")}</span></div><div class="fn">${art.type.pairings[0].display.family}</div></div>`, links: st.links }; });
  const links = [...new Set(tiles.flatMap((t) => t.links))].map((u) => `<link rel="stylesheet" href="${u}">`).join("");
  const rowsN = Math.ceil(tiles.length / cols), gh = th + 52, GW = cols * tw + (cols + 1) * 14, GH = rowsN * gh + (rowsN + 1) * 12 + 8;
  const sheet = `<!doctype html><html><head><meta charset="utf-8">${links}<style>html,body{margin:0;background:#0f1013;color:#e9e9ec;font:500 12px -apple-system,Helvetica,Arial,sans-serif}${COMP_CSS}
.g{display:grid;grid-template-columns:repeat(${cols},${tw}px);gap:12px 14px;padding:12px 14px}.f{border-radius:6px;border:1px solid #ffffff22}.nm{display:flex;justify-content:space-between;align-items:center;margin-top:5px}.nm b{font-size:12.5px}.fn{color:#80838f;font-size:11px}
.sw2{display:inline-flex;gap:3px}.sw2 i{width:14px;height:14px;border-radius:3px;border:1px solid #ffffff33;display:block}</style></head><body><div class="g">${tiles.map((t) => t.tile).join("")}</div></body></html>`;
  const all = render("all", sheet, GW, GH, 20000);
  out({ ok: true, cards: done.length, dir, contact_sheet: all });
} else if (cmd === "refs") {
  out(readJSON(path.join(REFS, "index.json")));
} else {
  die("usage: style-frames.mjs render|pack|gate|refs … (see the header)");
}
