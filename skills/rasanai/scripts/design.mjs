#!/usr/bin/env node
// Design directions: many complete looks (visual style + palette by role + type pairing +
// shape / stroke / shadow / texture), each rendered as a board with the user's own words,
// each with a frame.md ready for HyperFrames. With a brand reference, looks are brand-locked
// (its colors and fonts) and vary the art direction around them. On a branded launch / promo / brand film the
// looks are the brand film's own grammar (<run>/brand-film/FILM-STYLE.json from brandfilm.mjs card): check-system
// requires blend.json to cite FILM-STYLE.md (film_style, film_style_takes), no outside library references, canvas /
// ink / accent on the card's palette, the display face in the card's typefaces, and no 3D / blur / grain when the card is flat.
//   node design.mjs looks --out <dir> [--decisions <decisions.json>] [--count 6] [--aspect 16:9]
//        [--headline "..."] [--sub "..."] [--brand DESIGN.md [--mode light|dark]] [--ground light|dark] [--seed s] [--recent style,ids] [--stills]
//        -> <dir>/index.html (the board grid), <dir>/looks.json, <dir>/<A..>/frame.md (+ board.png with --stills)
//   node design.mjs stills --dir <folder> [--aspect 16:9]   -> PNG stills of Claude's style frames (one .html per key frame)
//   node design.mjs check-system --dir <run>/design/<label> [--brand DESIGN.md] [--offline]   -> the gate for ONE bespoke design system (exit 0 / 2)
//        (route presenter: also requires a "## Imagery" section of 25+ words in DESIGN.md)
//   node design.mjs check-systems --run <run> [--brand DESIGN.md] [--offline]                   -> the gate for all three + that they differ
//   node design.mjs look-payload --run <run> [--recommended sure|bold|wild] [--hook "<first line>"] [--sub "..."] [--out <file>]
//        -> the console's Look payload {styles:[{id,name,blend,why,style:{recipe,three?}}], recommended, hook}: exactly the three bespoke systems
//   node design.mjs choose-system --run <run> --label Sure|Bold|Wild --decisions <decisions.json> [--mode light|dark] [--preset <id>]
//        -> (--preset: a lyric video's technical frame.md, the gate wants a preset verbatim)  design/<label>/DESIGN.md becomes the film's look: <run>/look/{DESIGN.md,frame.md}, decisions.look + picks + design_system
//   node design.mjs pick --looks <dir>/looks.json --id B --decisions <decisions.json>
//        -> merges the look's terms (visual style, typography) into decisions.json and prints its frame.md
import fs from "node:fs";
import path from "node:path";
import { parseArgs, die, readJSON, writeFile, esc, normalizeAspect, chromeScreenshot, chromeDumpDom } from "./lib/common.mjs";
import { generateLooks, lookAsBrand } from "./lib/looks.mjs";
import { readDesignMd, toFrameMd, contrast } from "./lib/design-md.mjs";
import { track } from "./lib/report.mjs";
import { checkSystem, checkSystemFull, checkSystems, firstLine, lookPayload, chooseSystem, runFilm, LABELS } from "./lib/system.mjs";
import { libraryIds } from "./library.mjs";

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
  console.log(JSON.stringify({ ok: !r.P.length, problems: r.P, warnings: r.W, system: r.info }, null, 2));
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
} else die("usage: design.mjs looks|pick|stills|check-system|check-systems|look-payload|choose-system (see the header)");
