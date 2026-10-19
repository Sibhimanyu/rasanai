#!/usr/bin/env node
// A project's own brand reference (DESIGN.md / design.md / frame.md) as the look.
//   node brand.mjs detect [--dir .]                               -> where the brand reference is, and what it says
//   node brand.mjs read  --file DESIGN.md [--mode light|dark]      -> normalized brand tokens (JSON)
//   node brand.mjs frame --file DESIGN.md --out <frame.md> [--mode] -> a HyperFrames frame.md (checked with HyperFrames' parser)
//   node brand.mjs tokens --file DESIGN.md --out <tokens.json>     -> capture/extracted/tokens.json for build-frame.mjs (a preset layout in the brand)
//   node brand.mjs board --file DESIGN.md --out <dir> [--aspect 16:9] [--mode] -> a brand board (HTML + PNG) for the console
import fs from "node:fs";
import path from "node:path";
import { parseArgs, die, writeFile, esc, chromeScreenshot, readLook, normalizeAspect } from "./lib/common.mjs";
import { findSkill } from "./lib/hyperframes.mjs";
import { readDesignMd, toFrameMd, toTokensJson, findDesignMd, findBrandManifest, contrast } from "./lib/design-md.mjs";
import { track } from "./lib/report.mjs";

const args = parseArgs();
const cmd = args._[0];
track(
  { read: "Reading your brand file", board: "Drawing your brand as a board", frame: "Turning your brand into the video's design system", tokens: "Reading your brand's tokens" }[cmd],
  { read: "Brand read: colors by role and typefaces", board: "Brand board ready", frame: "Brand design system written (frame.md)", tokens: "Brand tokens written" }[cmd]
);
const mode = args.mode ? String(args.mode) : undefined;
const need = () => {
  if (!args.file) die("--file <DESIGN.md> required");
  const f = path.resolve(String(args.file));
  if (!fs.existsSync(f)) die(`not found: ${args.file}`);
  return f;
};
const summary = (B) => ({
  source: path.relative(process.cwd(), B.source) || B.source,
  format: B.format,
  name: B.name,
  roles: B.roles,
  role_names: B.role_names,
  fonts: B.fonts,
  radii: B.radii,
  shadows: B.shadows.length,
  dos: B.dos.length,
  donts: B.donts.length,
  modes: B.modes,
  overview: B.overview,
  warnings: B.warnings,
});

// round-trip: what HyperFrames' own parser and RasanAI's readLook see in the converted frame.md
async function verifyFrame(file) {
  const out = { rasa: readLook(file) };
  const lib = ["product-launch-video", "faceless-explainer", "pr-to-video"].map(findSkill).filter(Boolean).map((d) => path.join(d, "scripts", "lib", "tokens.mjs")).find((p) => fs.existsSync(p));
  if (lib) {
    const T = await import(lib);
    const md = fs.readFileSync(file, "utf8");
    const colors = T.parseColors(md);
    out.hyperframes = { colors: colors.length, ...T.semanticColors(colors) };
    if (T.parseFonts) out.hyperframes.fonts = T.parseFonts(md);
  }
  return out;
}

if (cmd === "detect") {
  const dir = path.resolve(String(args.dir || "."));
  const f = findDesignMd(dir);
  if (!f) { console.log(JSON.stringify({ found: false, looked_in: dir })); process.exit(0); }
  const am = findBrandManifest(f);
  console.log(JSON.stringify({ found: true, ...summary(readDesignMd(f, { mode })), ...(am ? { assets: am } : {}) }, null, 2));
} else if (cmd === "read") {
  const B = readDesignMd(need(), { mode });
  console.log(JSON.stringify(args.full ? B : summary(B), null, 2));
} else if (cmd === "frame") {
  const f = need();
  if (!args.out) die("--out <frame.md> required");
  const B = readDesignMd(f, { mode });
  if (!B.roles.canvas || !B.roles.ink) die(`could not find a background and a text color in ${args.out}; ${B.warnings.join("; ")}`);
  const out = path.resolve(String(args.out));
  writeFile(out, toFrameMd(B, { assets: findBrandManifest(f) }));
  const check = await verifyFrame(out);
  const problems = [];
  if (check.hyperframes) {
    if (check.hyperframes.canvas !== B.roles.canvas) problems.push(`HyperFrames reads the canvas as ${check.hyperframes.canvas}, expected ${B.roles.canvas}`);
    if (check.hyperframes.ink !== B.roles.ink) problems.push(`HyperFrames reads the ink as ${check.hyperframes.ink}, expected ${B.roles.ink}`);
  }
  if (check.rasa.defaulted && check.rasa.defaulted.length) problems.push(`RasanAI's previews fall back for: ${check.rasa.defaulted.join(", ")}`);
  console.log(JSON.stringify({ ok: !problems.length, frame: path.relative(process.cwd(), out), brand: summary(B), check, problems }, null, 2));
  process.exit(problems.length ? 1 : 0);
} else if (cmd === "tokens") {
  const f = need();
  if (!args.out) die("--out <tokens.json> required");
  const T = toTokensJson(readDesignMd(f, { mode }));
  writeFile(path.resolve(String(args.out)), JSON.stringify(T, null, 2) + "\n");
  console.log(JSON.stringify({ ok: true, tokens: args.out, colors: T.colors, fonts: T.fonts }, null, 2));
} else if (cmd === "board") {
  const f = need();
  if (!args.out) die("--out <dir> required");
  const B = readDesignMd(f, { mode });
  const [W, H] = normalizeAspect(args.aspect || "16:9").split("x").map(Number);
  const r = B.roles;
  const accent = r.accent || r.ink;
  const fams = [...new Set([B.fonts.display, B.fonts.body, B.fonts.mono].filter(Boolean).map((x) => x.family))];
  const link = fams.length ? `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${fams.map((x) => `family=${encodeURIComponent(x).replace(/%20/g, "+")}:wght@400;500;700`).join("&")}&display=swap"><link rel="stylesheet" href="https://api.fontshare.com/v2/css?${fams.map((x) => `f[]=${x.toLowerCase().replace(/\s+/g, "-")}@400,500,700`).join("&")}&display=swap">` : "";
  const disp = (B.fonts.display || { family: "Inter" }).family, body = (B.fonts.body || B.fonts.display || { family: "Inter" }).family, mono = (B.fonts.mono || { family: "JetBrains Mono" }).family;
  const rad = B.radii.md ?? B.radii.lg ?? B.radii.sm ?? 8;
  const chips = [["canvas", r.canvas], ["ink", r.ink], ["accent", accent], ["surface", r.surface], ["muted", r.muted], ...(r.support || []).map((h, i) => [`support ${i + 1}`, h])].filter(([, v]) => v);
  const tall = H / W > 1.2;
  const html = `<!doctype html><html><head><meta charset="utf-8">${link}<style>
  *{box-sizing:border-box;margin:0}body{width:${W}px;height:${H}px;background:${r.canvas};color:${r.ink};font-family:"${body}",Inter,system-ui,sans-serif;overflow:hidden}
  .wrap{position:absolute;inset:0;padding:${Math.round(W * 0.05)}px;display:grid;grid-template-columns:${tall ? "1fr" : "1.25fr 1fr"};gap:${Math.round(W * 0.035)}px}
  .tag{font:500 ${Math.round(W * 0.011)}px/1 "${mono}",monospace;letter-spacing:.14em;text-transform:uppercase;opacity:.7}
  h1{font-family:"${disp}",serif;font-weight:${(B.fonts.display && B.fonts.display.weight) || 700};font-size:${Math.round(W * (tall ? 0.11 : 0.062))}px;line-height:.98;letter-spacing:-.02em;margin:${Math.round(W * 0.02)}px 0}
  p{font-size:${Math.round(W * (tall ? 0.03 : 0.0135))}px;line-height:1.45;max-width:34em;opacity:.85}
  .mark{display:inline-block;background:${accent};color:${contrast(accent, r.canvas) > 2.8 ? r.canvas : r.ink};padding:.1em .35em;border-radius:${Math.min(rad, 10)}px}
  .card{background:${r.surface || r.canvas};border:1px solid ${r.border || (r.muted || r.ink) + "33"};border-radius:${rad}px;padding:${Math.round(W * 0.02)}px;${B.shadows[0] ? `box-shadow:${B.shadows[0].value};` : ""}margin-top:${Math.round(W * 0.02)}px}
  .chips{display:grid;grid-template-columns:repeat(${tall ? 3 : 2},1fr);gap:${Math.round(W * 0.01)}px;margin-top:${Math.round(W * 0.015)}px}
  .chip{border-radius:${Math.min(rad, 12)}px;overflow:hidden;border:1px solid ${r.ink}22}.chip i{display:block;height:${Math.round(W * (tall ? 0.09 : 0.045))}px}
  .chip span{display:block;padding:6px 8px;font:500 ${Math.round(W * 0.0095)}px/1.3 "${mono}",monospace;background:${r.canvas}}
  .type div{font-family:"${disp}";font-size:${Math.round(W * 0.03)}px;margin-top:4px}.type small{display:block;font:500 ${Math.round(W * 0.0095)}px "${mono}",monospace;opacity:.6}
  </style></head><body><div class="wrap"><div>
  <div class="tag">Brand reference · ${esc(path.basename(f))}</div>
  <h1>${esc(B.name)} <span class="mark">in motion</span></h1>
  <p>${esc(B.overview || "Colors, type and shape taken from the project's own design system.")}</p>
  <div class="card type"><small>Display · ${esc(disp)}</small><div>Aa Bb 0123 → Launch day</div><small style="margin-top:10px">Body · ${esc(body)}${B.fonts.mono ? ` · Mono · ${esc(mono)}` : ""}</small></div>
  </div><div><div class="tag">Palette by role</div><div class="chips">${chips.map(([k, v]) => `<div class="chip"><i style="background:${v}"></i><span>${esc(k)}<br>${v}</span></div>`).join("")}</div>
  <div class="card"><div class="tag">Radius ${rad}px${B.shadows.length ? " · shadow from the brand" : " · flat"}</div><p style="margin-top:8px">${B.dos.length ? esc(B.dos[0]) : "One focal element per frame; the accent marks it."}</p></div>
  </div></div></body></html>`;
  const dir = path.resolve(String(args.out));
  writeFile(path.join(dir, "brand-board.html"), html);
  chromeScreenshot(`file://${path.join(dir, "brand-board.html")}`, path.join(dir, "brand-board.png"), W, H, 5000);
  console.log(JSON.stringify({ ok: true, board: path.relative(process.cwd(), path.join(dir, "brand-board.html")), still: path.relative(process.cwd(), path.join(dir, "brand-board.png")), brand: summary(B) }, null, 2));
} else die("usage: brand.mjs detect|read|frame|tokens|board (see the header)");
