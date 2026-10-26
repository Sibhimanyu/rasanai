#!/usr/bin/env node
// Design directions: many complete looks (visual style + palette by role + type pairing +
// shape / stroke / shadow / texture), each rendered as a board with the user's own words,
// each with a frame.md ready for HyperFrames. With a brand reference, looks are brand-locked
// (its colors and fonts) and vary the art direction around them. On a branded launch / promo / brand film the
// looks are the brand film's own grammar (<run>/brand-film/FILM-STYLE.json from brandfilm.mjs card): check-system
// requires blend.json to cite FILM-STYLE.md (film_style, film_style_takes), no outside library references, canvas /
// ink / accent on the card's palette, the display face in the card's typefaces; finish, depth and camera are never refused (brand lock is palette, type, logo, UI and tone).
//   node design.mjs looks --out <dir> [--decisions <decisions.json>] [--count 6] [--aspect 16:9]
//        [--headline "..."] [--sub "..."] [--brand DESIGN.md [--mode light|dark]] [--ground light|dark] [--seed s] [--recent style,ids] [--stills]
//        -> <dir>/index.html (the board grid), <dir>/looks.json, <dir>/<A..>/frame.md (+ board.png with --stills)
//   node design.mjs stills --dir <folder> [--aspect 16:9]   -> PNG stills of Claude's style frames (one .html per key frame)
//   node design.mjs check-system --dir <run>/design/<label> [--brand DESIGN.md] [--offline]   -> the gate for ONE bespoke design system (exit 0 / 2)
//        (route presenter: also requires a "## Imagery" section of 25+ words in DESIGN.md)
//        (a skill with a grammar library (library/grammars/, or RASANAI_GRAMMAR_LIBRARY): also requires design/<label>/grammar.json, the look's ONE
//         motion grammar, valid in grammar.mjs's schema: errors grammar-missing, grammar-invalid, grammar-not-flat on a graphic-route brand film: measured finish zero)
//   node design.mjs check-systems --run <run> [--brand DESIGN.md] [--offline]                   -> the gate for all three + that they differ
//        (and that they use three different grammars: grammar-repeat)
//   node design.mjs look-payload --run <run> [--recommended sure|bold|wild] [--hook "<first line>"] [--sub "..."] [--out <file>]
//        -> the console's Look payload {styles:[{id,name,blend,why,style:{recipe,three?}}], recommended, hook}: exactly the three bespoke systems
//   node design.mjs choose-system --run <run> --label Sure|Bold|Wild --decisions <decisions.json> [--mode light|dark] [--preset <id>]
//        -> (--preset: a lyric video's technical frame.md, the gate wants a preset verbatim)  design/<label>/DESIGN.md becomes the film's look: <run>/look/{DESIGN.md,frame.md,grammar.json}, decisions.look + picks + design_system
//   (Plan 04) node design.mjs compare-plan --run <run> [--beat <id>] [--expected 3] [--lean]   -> design/comparison-plan.json: ONE approved story beat drawn in every look, one styleframe per look (a justified second only for a real uncertainty)
//        (new creative policy: the plan file also carries `creative_intent`, the chosen Story's premise, promise, signature events, repetition intent and the selected references' principles, from creative/brief.json and
//         creative/references.json: what each look must develop a DIFFERENT strategy for. Additive; the plan's own fields and the card and image payloads are unchanged)
//   (Plan 04) node design.mjs bible --run <run> | bible-check --run <run> | bible-for --run <run> --scene <id> [--relations cause,contrast] [--continuity <file>]
//        -> look/visual-bible.json (a projection of DESIGN.md + the motion contract with a source digest; choose-system writes it too), its stale/valid check, the subset one scene worker gets
//   (Part 2) bible-for also takes [--role <worker role>] [--shots a,b] [--events id,id]: the projection then carries the chosen medium contract's role section (look/medium.json), omitted when the look has none
//   (Part 2) node design.mjs medium-wire --run <run> [--scene <n>]   -> what a medium scene needs and the project never guesses: the contract, eventBindings (scene-local seconds from motion/events.json), assets.canons (cast/<id>/identity.json), the runtime files, the treatment line
//   (Part 2) check-system also gates design/<label>/medium.json for a medium Look: missing or invalid is "needs-you", never a pass
//   (Plan 04) node design.mjs look-revise --run <run> --instruction "same typography, less glossy" [--ids a,b]   -> a bounded look revision: what changes, what stays fixed, the impact (Story kept)
//   (Plan 04) node design.mjs continuity-check --file <continuity.json>   -> shared components (one owner each) and seam types (same object, analogy, causal handoff, temporal, discontinuity)
//   node design.mjs pick --looks <dir>/looks.json --id B --decisions <decisions.json>
//        -> merges the look's terms (visual style, typography) into decisions.json and prints its frame.md
import fs from "node:fs";
import path from "node:path";
import { parseArgs, die, readJSON, writeFile, esc, normalizeAspect, chromeScreenshot, chromeDumpDom } from "./lib/common.mjs";
import { generateLooks, lookAsBrand } from "./lib/looks.mjs";
import { readDesignMd, toFrameMd, contrast } from "./lib/design-md.mjs";
import { track } from "./lib/report.mjs";
import { checkSystem, checkSystemFull, checkSystems, firstLine, lookPayload, chooseSystem, runFilm, writeVisualBible, visualBibleInputs, LABELS } from "./lib/system.mjs";
import { validateVisualBible, bibleCurrent, projectForWorker } from "./lib/visual-bible.mjs";
import { comparisonPlan, validateComparisonPlan, reviseLook } from "./lib/look.mjs";
import { validateContinuity, projectForScene } from "./lib/continuity.mjs";
import { libraryIds } from "./library.mjs";
import { runCreativeOn } from "./lib/creative-run.mjs";
import { checkMediumLook, labelAssignments, loadMedium, readSelection, mediumContractFor, eventBindingsFor, canonsFor, treatmentLines, RUNTIME_FILES, needsRasan2d } from "./lib/medium-wiring.mjs"; // Part 2: only a creative run or a look with design/<label>/medium.json reads any of it // Creative Recovery: only a plan with creative_policy_revision 1 changes anything below

const lockBrandOf = (run) => { try { return runBrand(path.resolve(String(run))); } catch { return null; } };
// The brand lock: when the run's decisions carry a brand (and use_brand is not false), every system must stay inside it
function runBrand(run) {
  try {
    const d = JSON.parse(fs.readFileSync(path.join(run, "decisions.json"), "utf8"));
    if (d.use_brand === false || !d.brand) return null;
    const f = path.resolve(String(d.brand));
    return fs.existsSync(f) ? f : null;
  } catch { return null; }
}

// A presenter film (route "presenter") has generated images, so its design systems must carry the art direction
// they obey: a "## Imagery" section of at least 25 words. Any other route: optional. The run is two folders above
// <run>/design/<label>; its route comes from decisions.json, the crew plan or the presence of presenter/plan.json.
function imageryProblems(dir, md) {
  const run = path.resolve(dir, "..", "..");
  const rd = (f) => { try { return JSON.parse(fs.readFileSync(path.join(run, ...f), "utf8")); } catch { return {}; } };
  const route = rd(["decisions.json"]).route || rd(["crew", "plan.json"]).route || (fs.existsSync(path.join(run, "presenter", "plan.json")) ? "presenter" : "");
  if (route !== "presenter") return [];
  const m = String(md || "").match(/^##\s+Imagery[^\n]*\n([\s\S]*?)(?=\n##\s|(?![\s\S]))/mi);
  const words = m ? m[1].trim().split(/\s+/).filter(Boolean).length : 0;
  if (!m) return ['DESIGN.md has no "## Imagery" section (a presenter film generates images; write the art direction every image obeys: medium, lens, light, palette mapping, texture, room for the person, what never)'];
  return words < 25 ? [`the "## Imagery" section is ${words} words; a presenter film needs at least 25 (medium, lens, light, palette mapping, texture, room for the person, what never)`] : [];
}

const args = parseArgs();
const cmd = args._[0];
track(
  { looks: `Designing ${args.count || 6} looks${args.brand ? " in your brand" : ""}`, pick: "Applying the look you picked", stills: "Rendering the style frames as stills", "choose-system": "Making your pick the film's look" }[cmd],
  { looks: "Looks ready: palette, type and layout for each", pick: "Look applied: its frame.md is the video's design system", stills: "Style frames rendered", "choose-system": "Your look is set: its frame.md is the video's design system" }[cmd]
);

function fontLinks(looks) {
  const fams = new Map();
  for (const L of looks) for (const f of [L.type.display, L.type.body, L.type.mono].filter(Boolean)) fams.set(f.family, f.source || "google");
  const g = [...fams].filter(([, s]) => s !== "fontshare").map(([f]) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@400;500;600;700;800`);
  // Fontshare as well for every family: covers brand fonts that are not on Google Fonts (a miss is harmless)
  const fsh = [...fams].map(([f]) => `f[]=${f.toLowerCase().replace(/\s+/g, "-")}@400,500,700`);
  return [g.length ? `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${g.join("&")}&display=swap">` : "", fsh.length ? `<link rel="stylesheet" href="https://api.fontshare.com/v2/css?${fsh.join("&")}&display=swap">` : ""].join("\n");
}

function board(L, W, H, { headline, sub }) {
  const p = L.palette;
  const on = (bg) => (contrast(p.ink, bg) >= 4.5 ? p.ink : contrast(p.canvas, bg) >= 4.5 ? p.canvas : "#ffffff");
  const tall = H / W > 1.2;
  const u = W / 100; // 1% of width
  const S = W / 1920;
  const shadow = L.shadow === "none" ? "none" : L.shadow.replace(/var\(--ink\)/g, p.ink).replace(/var\(--accent\)/g, p.accent);
  const bd = L.border ? `${Math.max(1, Math.round(L.border * S * 1.2))}px solid ${p.ink}` : `1px solid color-mix(in srgb, ${p.ink} 14%, transparent)`;
  const r = Math.round(L.radius * S * 1.4);
  const disp = `font-family:'${L.type.display.family}',sans-serif;font-weight:${L.type.display.weight || 700};letter-spacing:-.02em;line-height:.95`;
  const bodyF = `font-family:'${L.type.body.family}',sans-serif;font-weight:${L.type.body.weight || 400}`;
  const monoF = `font-family:'${(L.type.mono || L.type.body).family}',monospace`;
  const tex = { grain: `<svg class="tex" viewBox="0 0 200 200" preserveAspectRatio="none"><filter id="n${L.id}"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/></filter><rect width="100%" height="100%" filter="url(#n${L.id})" opacity=".16"/></svg>`, halftone: `<div class="tex ht"></div>`, scanlines: `<div class="tex sl"></div>`, paper: `<svg class="tex" viewBox="0 0 200 200" preserveAspectRatio="none"><filter id="n${L.id}"><feTurbulence type="turbulence" baseFrequency="0.04" numOctaves="3"/></filter><rect width="100%" height="100%" filter="url(#n${L.id})" opacity=".07"/></svg>`, none: "" }[L.texture] || "";
  const chips = [p.canvas, p.ink, p.accent, p.surface, ...(p.support || [])].filter(Boolean).slice(0, 6);
  const chipRow = (size) => `<div style="display:flex;gap:${0.7 * u}px">${chips.map((c) => `<i style="display:block;width:${size}px;height:${size}px;border-radius:${Math.min(r, 10)}px;background:${c};border:1px solid color-mix(in srgb, ${p.ink} 18%, transparent)"></i>`).join("")}</div>`;
  const tag = `<div style="${monoF};font-weight:600;font-size:${1.05 * u}px;letter-spacing:.14em;text-transform:uppercase;color:${L.layout === "bleed" ? on(p.canvas) : p.accent}">${esc(L.visual_style.term)}</div>`;
  // bars read against whatever they sit on: ink if it contrasts, else the best-contrast role; the hero bar in the accent unless it vanishes
  const barsOn = (bg) => {
    const base = contrast(p.ink, bg) >= 3 ? p.ink : on(bg);
    const hero = contrast(p.accent, bg) >= 1.25 && p.accent !== bg ? p.accent : base === p.ink ? p.canvas : p.ink;
    return { base, hero };
  };
  const bars = (h, w = "100%", bg = p.surface || p.canvas) => { const c = barsOn(bg); return `<div style="display:flex;align-items:flex-end;gap:${0.8 * u}px;height:${h}px;width:${w}">${[0.45, 0.7, 0.55, 0.92, 0.66].map((v, k) => `<b style="flex:1;height:${v * 100}%;background:${k === 3 ? c.hero : c.base};opacity:${k === 3 ? 1 : 0.85};border-radius:${Math.min(r, 6)}px ${Math.min(r, 6)}px 0 0"></b>`).join("")}</div>`; };
  const card = (inner, extra = "") => `<div style="background:${p.surface || p.canvas};color:${on(p.surface || p.canvas)};border:${bd};border-radius:${r}px;box-shadow:${shadow};padding:${2 * u}px;${extra}">${inner}</div>`;
  const meta = `<div style="${monoF};font-size:${(tall ? 2.4 : 1.05) * u}px;opacity:.7;margin-top:${1 * u}px">${esc(L.type.display.family)} / ${esc(L.type.body.family)}${L.type.class ? ` · ${esc(L.type.class)}` : ""}</div>`;
  let inner;
  const pad = (tall ? 7 : 5) * u;
  if (L.layout === "poster") {
    inner = `<div style="position:absolute;inset:0;padding:${pad}px;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;gap:${2.4 * u}px">
      ${tag}<div style="${disp};font-size:${(tall ? 11 : 6.4) * u}px">${esc(headline)}</div>
      <i style="display:block;width:${8 * u}px;height:${Math.max(1, Math.round(2 * S))}px;background:${p.accent}"></i>
      <div style="${bodyF};font-size:${(tall ? 3 : 1.4) * u}px;opacity:.75;max-width:34em">${esc(sub)}</div>${chipRow((tall ? 5 : 2.4) * u)}</div>`;
  } else if (L.layout === "grid") {
    inner = `<div style="position:absolute;inset:0;padding:${pad}px;display:grid;grid-template-columns:repeat(${tall ? 2 : 4},1fr);grid-template-rows:auto 1fr;gap:${1.6 * u}px;background-image:linear-gradient(90deg, color-mix(in srgb, ${p.ink} 7%, transparent) 1px, transparent 1px);background-size:${(W - 2 * pad) / (tall ? 2 : 4)}px 100%;background-position:${pad}px 0">
      <div style="grid-column:1/-1">${tag}<div style="${disp};font-size:${(tall ? 9.5 : 5.2) * u}px;margin-top:${1.4 * u}px;max-width:${tall ? 100 : 70}%">${esc(headline)}</div></div>
      ${card(`<div style="${monoF};font-size:${(tall ? 2.6 : 1.1) * u}px;opacity:.7">01 · Receipts</div><div style="${disp};font-size:${(tall ? 7 : 3.4) * u}px;margin-top:${1 * u}px">12</div>`)}
      ${card(bars((tall ? 16 : 8) * u), `grid-column:span ${tall ? 1 : 2}`)}
      ${tall ? "" : card(`<div style="${bodyF};font-size:${1.2 * u}px;line-height:1.35">${esc(sub)}</div>${meta}`)}</div>`;
  } else if (L.layout === "stack") {
    const off = Math.round(2.2 * u);
    inner = `<div style="position:absolute;inset:0;padding:${pad}px;display:grid;grid-template-columns:${tall ? "1fr" : "1fr 1fr"};gap:${4 * u}px;align-items:center">
      <div>${tag}<div style="${disp};font-size:${(tall ? 10 : 5.4) * u}px;margin-top:${1.6 * u}px">${esc(headline)}</div><div style="${bodyF};font-size:${(tall ? 3 : 1.4) * u}px;margin-top:${1.6 * u}px;opacity:.8">${esc(sub)}</div></div>
      <div style="position:relative;height:${(tall ? 34 : 18) * u}px">
        <div style="position:absolute;inset:0;transform:translate(${off}px,${off}px) rotate(3deg);background:${p.accent};border:${bd};border-radius:${r}px"></div>
        <div style="position:absolute;inset:0;transform:rotate(-2deg)">${card(`${bars((tall ? 18 : 9) * u)}${meta}`, "height:100%")}</div>
      </div></div>`;
  } else if (L.layout === "hud") {
    const ln = `color-mix(in srgb, ${p.accent} 70%, transparent)`;
    const br = (pos) => `<i style="position:absolute;${pos};width:${3 * u}px;height:${3 * u}px;border:${Math.max(1, Math.round(2 * S))}px solid ${ln};${pos.includes("top") ? "border-bottom:none" : "border-top:none"};${pos.includes("left") ? "border-right:none" : "border-left:none"}"></i>`;
    inner = `<div style="position:absolute;inset:${3 * u}px">${br("top:0;left:0")}${br("top:0;right:0")}${br("bottom:0;left:0")}${br("bottom:0;right:0")}</div>
      <div style="position:absolute;inset:0;padding:${pad}px;display:flex;flex-direction:column;justify-content:center;gap:${1.8 * u}px">
      <div style="${monoF};font-size:${(tall ? 2.4 : 1.05) * u}px;letter-spacing:.2em;color:${p.accent}">SYS · ${esc(L.visual_style.term.toUpperCase())} · 00:12:04</div>
      <div style="${disp};font-size:${(tall ? 9.5 : 5.4) * u}px">${esc(headline)}</div>
      <div style="height:1px;background:${ln};width:60%"></div>
      <div style="display:flex;gap:${3 * u}px;align-items:flex-end">${bars((tall ? 12 : 6) * u, `${tall ? 60 : 28}%`, p.canvas)}<div style="${monoF};font-size:${(tall ? 2.6 : 1.1) * u}px;opacity:.75;max-width:30em">${esc(sub)}</div></div></div>`;
  } else if (L.layout === "bleed") {
    const fg = on(p.accent);
    inner = `<div style="position:absolute;inset:0;background:${p.accent};color:${fg}"></div>
      <div style="position:absolute;inset:0;padding:${pad}px;display:flex;flex-direction:column;justify-content:flex-end;gap:${1.6 * u}px;color:${fg}">
      ${tag}<div style="${disp};font-size:${(tall ? 13 : 8) * u}px;line-height:.88">${esc(headline)}</div>
      <div style="display:flex;justify-content:space-between;align-items:flex-end"><div style="${bodyF};font-size:${(tall ? 3 : 1.4) * u}px;max-width:30em">${esc(sub)}</div>${chipRow((tall ? 5 : 2.2) * u)}</div></div>`;
  } else {
    inner = `<div style="position:absolute;inset:0;padding:${pad}px;display:grid;grid-template-columns:${tall ? "1fr" : "1.15fr .85fr"};gap:${4 * u}px;align-content:center">
      <div>${tag}<div style="${disp};font-size:${(tall ? 10 : 5.6) * u}px;margin-top:${2 * u}px">${esc(headline)}</div>
      <div style="${bodyF};font-size:${(tall ? 3.4 : 1.6) * u}px;line-height:1.35;margin-top:${2 * u}px;opacity:.82;max-width:30em">${esc(sub)}</div><div style="margin-top:${3 * u}px">${chipRow((tall ? 7 : 3.2) * u)}</div></div>
      ${card(`<div style="display:flex;justify-content:space-between;align-items:center;${bodyF};font-weight:600;font-size:${(tall ? 3 : 1.4) * u}px;margin-bottom:${1.2 * u}px"><span>Receipts</span><span style="background:${p.accent};color:${on(p.accent)};border-radius:${Math.max(r, 4)}px;padding:.2em .6em;font-size:.8em">+ 12 today</span></div>${bars((tall ? 22 : 11) * u)}${meta}`)}</div>`;
  }
  return `<div class="board" style="width:${W}px;height:${H}px;background:${p.canvas};color:${p.ink}">${inner}${tex}</div>`;
}

const CSS = `*{box-sizing:border-box;margin:0}body{background:#0c0c0e;overflow:hidden}
.board{position:relative;overflow:hidden}.b-in{position:absolute;inset:0}
.tex{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;mix-blend-mode:multiply;z-index:2}
.ht{background-image:radial-gradient(rgba(0,0,0,.18) 22%,transparent 24%);background-size:9px 9px;opacity:.5}
.sl{background:linear-gradient(rgba(0,0,0,.14) 50%,transparent 50%);background-size:100% 4px}
figure{margin:0}figcaption{font:500 15px/1.35 ui-monospace,Menlo,monospace;color:#e8e6e1;margin-top:10px}figcaption b{display:inline-block;padding:1px 7px;margin-right:8px;background:#e8e6e1;color:#0c0c0e;border-radius:3px}figcaption span{color:#8d8a84;display:block;font-size:13px;margin-top:3px}`;

if (cmd === "looks") {
  if (!args.out) die("--out <dir> required");
  const D = args.decisions ? readJSON(path.resolve(String(args.decisions))) : { picks: {} };
  const brand = args.brand ? readDesignMd(path.resolve(String(args.brand)), { mode: args.mode }) : null;
  const count = Math.max(2, Math.min(9, Number(args.count || 6)));
  const looks = generateLooks({ picks: D.picks || {}, count, seed: String(args.seed || D.subject || "rasa"), brand, ground: String(args.ground || "auto"), recent: String(args.recent || "").split(",").filter(Boolean) });
  const [AW, AH] = normalizeAspect(args.aspect || "16:9").split("x").map(Number);
  const out = path.resolve(String(args.out));
  const content = { headline: String(args.headline || D.subject || "Your film starts here"), sub: String(args.sub || "A look you can point at, built by Claude in every frame.") };
  // grid page 1920x1080, boards keep the video's aspect
  const cols = AW / AH <= 0.85 ? Math.min(count, 5) : count <= 4 ? 2 : 3;
  const rows = Math.ceil(count / cols);
  const PAD = 48, GAP = 26, LAB = 58;
  let bw = (1920 - PAD * 2 - GAP * (cols - 1)) / cols;
  let bh = bw * (AH / AW);
  if (bh * rows + (GAP + LAB) * rows > 1080 - PAD * 2) { bh = (1080 - PAD * 2 - (GAP + LAB) * rows) / rows; bw = bh * (AW / AH); }
  bw = Math.floor(bw); bh = Math.floor(bh);
  const grid = `<!doctype html><html><head><meta charset="utf-8">${fontLinks(looks)}<style>${CSS}
  #stage{width:1920px;height:1080px;display:grid;grid-template-columns:repeat(${cols},${bw}px);gap:${GAP}px;justify-content:center;align-content:center;padding:${PAD}px}</style></head>
  <body><div id="stage">${looks.map((L) => `<figure>${board(L, bw, bh, content)}<figcaption><b>${L.id}</b>${esc(L.name)}<span>${esc(L.type.display.family)} + ${esc(L.type.body.family)} · ${esc(L.palette_source)}</span></figcaption></figure>`).join("")}</div>
  <script>document.fonts.ready.then(function(){document.body.setAttribute("data-ready","1")})</script></body></html>`;
  writeFile(path.join(out, "index.html"), grid);
  for (const L of looks) {
    const B = lookAsBrand(L, `design direction ${L.id}`, brand);
    writeFile(path.join(out, L.id, "frame.md"), toFrameMd(B));
    writeFile(path.join(out, L.id, "board.html"), `<!doctype html><html><head><meta charset="utf-8">${fontLinks([L])}<style>${CSS}</style></head><body>${board(L, AW, AH, content)}</body></html>`);
    L.frame = path.relative(process.cwd(), path.join(out, L.id, "frame.md"));
    L.board = path.relative(process.cwd(), path.join(out, L.id, "board.html"));
  }
  const dom = chromeDumpDom(path.join(out, "index.html"), 6000);
  if (!/class="board"/.test(dom)) die("the design board page did not render", 1);
  if (args.stills) {
    chromeScreenshot(`file://${path.join(out, "index.html")}`, path.join(out, "looks.png"), 1920, 1080, 6000);
    for (const L of looks) {
      chromeScreenshot(`file://${path.join(out, L.id, "board.html")}`, path.join(out, L.id, "board.png"), AW, AH, 5000);
      L.still = path.relative(process.cwd(), path.join(out, L.id, "board.png"));
    }
  }
  const manifest = { aspect: `${AW}x${AH}`, brand: brand ? path.relative(process.cwd(), brand.source) : null, page: path.relative(process.cwd(), path.join(out, "index.html")), looks };
  writeFile(path.join(out, "looks.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log(JSON.stringify({ page: manifest.page, still: args.stills ? path.relative(process.cwd(), path.join(out, "looks.png")) : null, looks: looks.map((L) => ({ id: L.id, name: L.name, type: `${L.type.display.family} + ${L.type.body.family}`, palette: L.palette, radius: L.radius, border: L.border, shadow: L.shadow, texture: L.texture, frame: L.frame })) }, null, 2));
} else if (cmd === "pick") {
  if (!args.looks || !args.id) die("--looks <looks.json> and --id <letter> required");
  const M = readJSON(path.resolve(String(args.looks)));
  const L = M.looks.find((x) => x.id === String(args.id).toUpperCase());
  if (!L) die(`no look ${args.id} (have ${M.looks.map((x) => x.id).join(", ")})`);
  let merged = null;
  if (args.decisions) {
    const dp = path.resolve(String(args.decisions));
    const D = fs.existsSync(dp) ? readJSON(dp) : { picks: {} };
    D.picks = { ...(D.picks || {}), ...L.picks };
    // a brand-locked direction keeps the brand reference: its don'ts reach DIRECTION.md's Avoid list
    const brandRef = M.brand || (D.look && D.look.design_md) || D.brand || null;
    if (brandRef) { D.brand = brandRef; if (D.look && D.look.mode) D.brand_mode = D.look.mode; }
    D.look = { frame: L.frame, name: L.name, palette: L.palette, type: L.type };
    writeFile(dp, JSON.stringify(D, null, 2) + "\n");
    merged = path.relative(process.cwd(), dp);
  }
  console.log(JSON.stringify({ ok: true, look: L.id, name: L.name, frame: L.frame, picks: L.picks, decisions: merged }, null, 2));
} else if (cmd === "stills") {
  // style frames Claude designed (one HTML file per key frame) -> PNG stills for the console
  if (!args.dir) die("--dir <folder of style-frame .html files> required");
  const dir = path.resolve(String(args.dir));
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".html")).sort();
  if (!files.length) die(`no .html style frames in ${args.dir}`);
  const [AW, AH] = normalizeAspect(args.aspect || "16:9").split("x").map(Number);
  const out = [], problems = [];
  for (const f of files) {
    const t = fs.readFileSync(path.join(dir, f), "utf8");
    const w = Number((t.match(/data-width="(\d+)"/) || [])[1]) || AW, h = Number((t.match(/data-height="(\d+)"/) || [])[1]) || AH;
    const png = path.join(dir, f.replace(/\.html$/, ".png"));
    if (/Rasan3D\.stage\s*\(/.test(t)) {
      // a key frame drawn in 3D: wait for the scene to build before capturing it
      const { pageStill } = await import("./lib/stage3d.mjs");
      const r = await pageStill(path.join(dir, f), png, w, h);
      for (const e of r.errors || []) problems.push(`${f}: ${e}`);
    } else chromeScreenshot(`file://${path.join(dir, f)}`, png, w, h, 5000);
    out.push(path.relative(process.cwd(), png));
  }
  console.log(JSON.stringify({ ok: !problems.length, images: out, ...(problems.length ? { problems } : {}) }, null, 2));
  if (problems.length) process.exit(2);
} else if (cmd === "check-system") {
  if (!args.dir) die("--dir <run>/design/<label> required");
  const r = await checkSystemFull(path.resolve(String(args.dir)), { hook: args.hook && args.hook !== true ? String(args.hook) : undefined, libraryIds: libraryIds(), brand: args.brand && args.brand !== true ? String(args.brand) : runBrand(path.resolve(String(args.dir), "..", "..")), offline: !!args.offline, label: args.label && args.label !== true ? String(args.label) : undefined, mode: args.mode });
  const dirAbs = path.resolve(String(args.dir));
  let md = "";
  try { md = fs.readFileSync(path.join(dirAbs, "DESIGN.md"), "utf8"); } catch {}
  r.P.push(...imageryProblems(dirAbs, md));
  // Part 2: a medium Look (an assigned candidate, a medium.json, or blend.medium_policy_revision) needs its contract; a legacy look is untouched
  const runAbs = path.resolve(dirAbs, "..", ".."), mlabel = path.basename(dirAbs);
  let medium = null;
  if (fs.existsSync(path.join(dirAbs, "medium.json")) || runCreativeOn(runAbs)) {
    medium = checkMediumLook(runAbs, mlabel, { creative: runCreativeOn(runAbs) });
    if (medium.applicable) { r.P.push(...medium.problems); r.W.push(...medium.warnings); }
  }
  console.log(JSON.stringify({ ok: !r.P.length, problems: r.P, warnings: r.W, system: r.info, ...(medium && medium.applicable ? { medium: { state: medium.state, limitations: medium.limitations, contract_digest: medium.contract_digest || null } } : {}) }, null, 2));
  process.exit(r.P.length ? 2 : 0);
} else if (cmd === "check-systems") {
  if (!args.run) die("--run <run dir> required");
  const run = path.resolve(String(args.run));
  const dirs = LABELS.map((l) => path.join(run, "design", l)).filter((d) => fs.existsSync(d));
  if (dirs.length !== 3) die(`the design desk makes exactly three systems (Sure, Bold, Wild); found ${dirs.length} in ${args.run}/design`);
  const r = await checkSystems(dirs, { hook: args.hook && args.hook !== true ? String(args.hook) : firstLine(run), libraryIds: libraryIds(), brand: args.brand && args.brand !== true ? String(args.brand) : runBrand(run), offline: !!args.offline });
  console.log(JSON.stringify({ ok: !r.P.length, problems: r.P, warnings: r.W, pairs: r.pairs, systems: r.systems }, null, 2));
  process.exit(r.P.length ? 2 : 0);
} else if (cmd === "look-payload") {
  if (!args.run) die("--run <run dir> required");
  const pl = lookPayload(path.resolve(String(args.run)), { recommended: args.recommended, hook: args.hook && args.hook !== true ? String(args.hook) : "", sub: args.sub && args.sub !== true ? String(args.sub) : "" });
  if (pl.styles.length !== 3) die(`the Look step shows exactly the three bespoke systems; ${pl.styles.length} are ready in ${args.run}/design`);
  // new creative policy: the Look is a craft class the Story supports. A look that names none is read as "not the dimensional craft" by the frame checks; say it before the user is asked (stderr: the payload is unchanged)
  if (runCreativeOn(path.resolve(String(args.run)))) {
    const ls = LABELS.map((l) => { try { return [l, (JSON.parse(fs.readFileSync(path.join(path.resolve(String(args.run)), "design", l, "blend.json"), "utf8")) || {}).look_style || null]; } catch { return [l, null]; } });
    const unnamed = ls.filter(([, v]) => !v).map(([l]) => l);
    if (unnamed.length) console.error(`creative policy: design/${unnamed.join(", design/")}/blend.json names no look_style (dimensional | flat-graphic | editorial | photographic | character | ...): the frame checks then treat the look as not the depth craft; the designer says which class the look is`);
    else if (new Set(ls.map(([, v]) => String(v).toLowerCase())).size === 1 && !lockBrandOf(args.run)) console.error(`creative policy: all three looks are look_style "${ls[0][1]}": check they are different visual strategies for the Story, not one look recoloured`);
  }
  // Part 2: every medium Look carries its contract before the user is asked (needs-you, not a pass); the fit and trade-off ride the card's existing limitations rows
  if (runCreativeOn(path.resolve(String(args.run)))) {
    const runAbs = path.resolve(String(args.run)), M = loadMedium();
    const bad = LABELS.map((l) => [l, checkMediumLook(runAbs, l, { med: M })]).filter(([, c]) => c.applicable && c.state !== "ok");
    if (bad.length) die(`needs-you: a medium Look has no valid contract, so the Look cannot be pushed (fix each, then design.mjs check-system): ${bad.map(([l, c]) => `${l}: ${c.problems[0]}`).join(" | ")}`);
  }
  // Part 2: the selected medium shortlist (creative/medium-selection.json, a recommendation) is projected into the Look's EXISTING name / blend (description) / why (rationale) fields, and only where the
  // designer left one empty; nothing is added to the payload shape, the Look count stays three, and nothing here approves or picks a Look.
  if (runCreativeOn(path.resolve(String(args.run))) && readSelection(path.resolve(String(args.run)))) {
    const la = labelAssignments(path.resolve(String(args.run)));
    for (const st of pl.styles) {
      const a = la[st.label], m = a && a.profile;
      if (!m) continue;
      if (!String(st.name || "").trim()) st.name = m.id;
      if (!String(st.blend || "").trim() && m.summary) st.blend = m.summary;
      if (!String(st.why || "").trim()) st.why = `${m.summary || m.id}${m.risks && m.risks.length ? ` Trade-off: ${m.risks[0]}` : ""} (a recommendation from the medium shortlist, not yet rendered)`.trim();
    }
  }
  // the brand lock: never show (or recommend) an off-brand look
  const lockBrand = runBrand(path.resolve(String(args.run)));
  if (lockBrand) {
    const off = [];
    for (const l of LABELS) { const r = checkSystem(path.join(path.resolve(String(args.run)), "design", l), { libraryIds: libraryIds(), brand: lockBrand, label: l }); off.push(...r.P.filter((x) => /brand lock|film style/.test(x))); }
    if (off.length) die(`brand lock / film style: these looks leave the brand or its film grammar, fix them before the Look is pushed (never recommend an off-brand look; a branded look cites FILM-STYLE.md and uses its palette and type): ${off.join(" | ")}`);
    pl.brand_locked = path.relative(process.cwd(), lockBrand);
    const film = runFilm(path.resolve(String(args.run)));
    if (film && film.card) pl.film_style = path.relative(process.cwd(), film.card.replace(/\.json$/, ".md"));
  }
  if (args.out) writeFile(path.resolve(String(args.out)), JSON.stringify(pl, null, 2) + "\n");
  console.log(JSON.stringify(pl, null, 2));
} else if (cmd === "choose-system") {
  if (!args.run || !args.label || !args.decisions) die("--run <run dir> --label Sure|Bold|Wild --decisions <decisions.json> required");
  const label = LABELS.find((l) => l.toLowerCase() === String(args.label).toLowerCase());
  if (!label) die("--label must be Sure, Bold or Wild");
  try { console.log(JSON.stringify(chooseSystem(path.resolve(String(args.run)), label, String(args.decisions), { mode: args.mode }), null, 2)); } catch (e) { die(e.message); }
} else if (cmd === "compare-plan") {
  if (!args.run) die("--run <run dir> required");
  const run = path.resolve(String(args.run));
  const rj = (...f) => { try { return JSON.parse(fs.readFileSync(path.join(run, ...f), "utf8")); } catch { return null; } };
  const treatment = rj("story", "chosen-treatment.json") || rj("story", "chosen.json");
  if (!treatment) die("no approved story yet (story/chosen-treatment.json or story/chosen.json): the comparison beat comes from the approved Story");
  const dec = rj("decisions.json") || {};
  const looks = LABELS.filter((l) => fs.existsSync(path.join(run, "design", l))).map((label) => { const b = rj("design", label, "blend.json") || {}; return { label, axes: b.axes || null }; });
  const series = dec.series_look ? { name: dec.series_name || "", look: dec.series_look, provenance: "saved_series_default" } : null;
  const r = comparisonPlan({ treatment, beat_id: args.beat && args.beat !== true ? String(args.beat) : null, looks, brand: { locked: !!(dec.brand && dec.use_brand !== false) }, series, expected: Number(args.expected) || 3, lean: !!args.lean });
  if (!r.ok) die(r.error);
  const v = validateComparisonPlan(r.plan);
  // new creative policy: hand the Story's creative intent to the design jobs (they read this file); the brief is intent only: it grants no approval and owns no timing
  let creative_intent = null;
  if (runCreativeOn(run)) {
    const cb = rj("creative", "brief.json"), cr = rj("creative", "references.json");
    if (cb && cb.status !== "skeleton") creative_intent = { brief_revision: cb.revision ?? null, promise: cb.promise ?? null, premise: cb.premise ?? null, visual_strategy: cb.visual_strategy ?? null, signature_events: (Array.isArray(cb.signature_events) ? cb.signature_events : []).map((e) => ({ id: e.id, beat_ids: e.beat_ids, before: e.before, change: e.change, after: e.after, must_preserve: e.must_preserve, why_motion: e.why_motion })), repetition_intent: cb.repetition_intent || [], do_not_substitute: cb.do_not_substitute || [], references: ((cr && cr.selected) || []).map((x) => ({ id: x.id, principle: (x.transferable || [])[0] || "", avoid: x.notTransferable || [] })), reference_evidence: (cr && cr.evidenceLevel) || "none", rule: "each look develops a different visual STRATEGY for this one idea (not a recolour); the real words, source behaviour and brand fixed things stay identical in every look; a look the brand excludes is excluded, never forced to fill a slot" };
  }
  // Part 2: "different medium, same evidence and story": the selected medium candidates are listed per Look label next to the ONE representative beat and its content digest (every candidate
  // develops this same beat; medium.json pins.comparison_content_digest must equal it). Additive: absent with no selection.
  let medium_assignments = null;
  if (runCreativeOn(run) && readSelection(run)) {
    const la = labelAssignments(run);
    medium_assignments = { content_digest: r.plan.representative && r.plan.representative.content_digest, by_label: Object.fromEntries(Object.entries(la).map(([k, x]) => [k, { candidate_id: x.candidate_id, profile_id: x.profile && x.profile.id, family_id: x.profile && x.profile.family_id, execution_id: x.profile && x.profile.execution_id, state: x.profile && x.profile.state, adaptation: x.adaptation ? x.adaptation.adaptation_id : null }])), note: "the shortlist is a recommendation (creative/medium-selection.json), not an approval; a label with no entry is developed as an ordinary (legacy) Look" };
  }
  writeFile(path.join(run, "design", "comparison-plan.json"), JSON.stringify({ ...r.plan, validation: v, ...(creative_intent ? { creative_intent } : { }), ...(medium_assignments ? { medium_assignments } : {}) }, null, 2) + "\n");
  console.log(JSON.stringify({ ok: v.ok, problems: v.problems, plan: r.plan }, null, 2));
  process.exit(v.ok ? 0 : 2);
} else if (cmd === "bible") {
  if (!args.run) die("--run <run dir> required");
  const r = writeVisualBible(path.resolve(String(args.run)), {});
  console.log(JSON.stringify({ ok: !r.problems.length, file: path.join(String(args.run), "look", "visual-bible.json"), problems: r.problems, source_digest: r.source_digest }, null, 2));
  process.exit(r.problems.length ? 2 : 0);
} else if (cmd === "bible-check") {
  if (!args.run) die("--run <run dir> required");
  const run = path.resolve(String(args.run));
  let b = null;
  try { b = JSON.parse(fs.readFileSync(path.join(run, "look", "visual-bible.json"), "utf8")); } catch { die("look/visual-bible.json is missing: design.mjs bible --run <run> (choose-system writes it)"); }
  const v = validateVisualBible(b);
  const cur = bibleCurrent(b, visualBibleInputs(run, {}));
  console.log(JSON.stringify({ ok: v.ok && cur.current, valid: v, stale: !cur.current, ...cur }, null, 2));
  process.exit(v.ok && cur.current ? 0 : 2);
} else if (cmd === "bible-for") {
  if (!args.run || !args.scene) die("--run <run dir> --scene <id> required");
  const run = path.resolve(String(args.run));
  let b = null;
  try { b = JSON.parse(fs.readFileSync(path.join(run, "look", "visual-bible.json"), "utf8")); } catch { die("look/visual-bible.json is missing"); }
  const cf = args.continuity && args.continuity !== true ? path.resolve(String(args.continuity)) : path.join(run, "look", "continuity.json");
  let cont = null;
  try { cont = JSON.parse(fs.readFileSync(cf, "utf8")); } catch { /* none yet */ }
  const sc = String(args.scene);
  const uses = cont && cont.scenes && cont.scenes[sc] ? cont.scenes[sc].uses || [] : [];
  // Part 2: role + shot ids select the medium contract's section a worker needs (projectForWorker -> projectMediumForWorker); no contract in the bible = the same output as before
  const csv = (v) => (v && v !== true ? String(v).split(",").map((x) => x.trim()).filter(Boolean) : []);
  console.log(JSON.stringify({ bible: projectForWorker(b, { scene_id: sc, relations: args.relations && args.relations !== true ? String(args.relations).split(",") : [], anchors: { objects: uses, screens: uses, characters: uses, sound_motifs: uses }, role: args.role && args.role !== true ? String(args.role) : undefined, beat_ids: csv(args.beats), shot_ids: csv(args.shots), events: csv(args.events) }), continuity: cont ? projectForScene(cont, sc) : null }, null, 2));
} else if (cmd === "medium-wire") {
  // what a medium scene needs and must not guess (eventBindings in scene-local seconds from the derived motion/events.json, assets.canons from cast/<id>/identity.json, the runtime files, the treatment line)
  if (!args.run) die("--run <run dir> required");
  const run = path.resolve(String(args.run));
  const contract = mediumContractFor(run);
  if (!contract) die("needs-you: this run has no chosen medium contract (look/medium.json): a legacy look needs none, and no medium scene is wired");
  const scene = args.scene && args.scene !== true ? String(args.scene) : null;
  const eb = eventBindingsFor(run, scene);
  console.log(JSON.stringify({ ok: eb.ok, execution_id: contract.execution_id, profile_id: contract.profile_id, state: "implemented_unvalidated", runtime: { dir: "assets/rasan-medium/", files: RUNTIME_FILES[contract.execution_id] || [], with_rasan2d: needsRasan2d(contract) }, eventBindings: eb.bindings, ...(eb.ok ? {} : { note: eb.note }), assets: { canons: canonsFor(run) }, scene_clock: "setTime(t) takes SCENE-LOCAL seconds; film time stays in motion/score.json", treatment_lines: treatmentLines(contract), after_ui_finish: contract.execution_id === "pixel-companion" ? "call C.bind(tl, {...}) AFTER RasanUI's U.finish(): one clock, one camera" : null }, null, 2));
  process.exit(eb.ok ? 0 : 2);
} else if (cmd === "look-revise") {
  if (!args.run || !args.instruction || args.instruction === true) die("--run <run dir> --instruction \"...\" required");
  const run = path.resolve(String(args.run));
  let dec = {};
  try { dec = JSON.parse(fs.readFileSync(path.join(run, "decisions.json"), "utf8")); } catch { /* none */ }
  const started = ["storyboard", "frames", "motion", "build"].some((d) => fs.existsSync(path.join(run, d)));
  const r = reviseLook({ instruction: String(args.instruction), ids: args.ids && args.ids !== true ? String(args.ids).split(",") : [], brand: { locked: !!(dec.brand && dec.use_brand !== false) }, downstream_started: started });
  if (r.ok && r.request) writeFile(path.join(run, "look", "revisions", `${r.request.idempotency_key.slice(0, 12)}.json`), JSON.stringify(r, null, 2) + "\n");
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.ok ? 0 : 2);
} else if (cmd === "continuity-check") {
  if (!args.file || args.file === true) die("--file <continuity.json> required");
  let c = null;
  try { c = JSON.parse(fs.readFileSync(path.resolve(String(args.file)), "utf8")); } catch (e) { die(`cannot read ${args.file}: ${e.message}`); }
  const r = validateContinuity(c, {});
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.ok ? 0 : 2);
} else die("usage: design.mjs looks|pick|stills|check-system|check-systems|look-payload|choose-system|compare-plan|bible|bible-check|bible-for|look-revise|continuity-check|medium-wire (see the header)");
