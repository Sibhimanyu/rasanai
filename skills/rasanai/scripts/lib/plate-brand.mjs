// Brand context for story plates: on a branded run (decisions.json use_brand + brand path, lib/run-brand.mjs) the plates are drawn in the brand file's palette and claim face,
// and the product's real UI is passed to Codex as reference images (research/screens.json, research/screens/*), so a plate shows a simplified recreation of the real screen,
// not an atlas-palette icon placeholder. plateBrand returns null on an unbranded run (the atlas world then stays in charge).
import fs from "node:fs";
import path from "node:path";
import { readDesignMd } from "./design-md.mjs";
import { runBrandFile } from "./run-brand.mjs";

const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };

// the run folder: --run, else the nearest parent of the plates folder that holds decisions.json
export function findRun(out, explicit) {
  if (explicit && explicit !== true) return path.resolve(String(explicit));
  let d = path.resolve(out);
  for (let i = 0; i < 6; i++) { if (fs.existsSync(path.join(d, "decisions.json"))) return d; const up = path.dirname(d); if (up === d) break; d = up; }
  return null;
}

// up to two real UI captures: dark Studio captures first (the product's shots are the dark app), then whatever else exists
export function uiRefs(run, max = 2) {
  if (!run) return [];
  const listed = readJson(path.join(run, "research", "screens.json"));
  const rows = Array.isArray(listed) ? listed : listed && Array.isArray(listed.screens) ? listed.screens : [];
  const files = rows.map((r) => ({ f: path.resolve(run, String(r.path || r.file || "")), dark: /dark/i.test(`${r.path} ${r.what || ""}`) })).filter((x) => /\.(png|jpe?g|webp)$/i.test(x.f) && fs.existsSync(x.f));
  if (!files.length) { const d = path.join(run, "research", "screens"); try { for (const n of fs.readdirSync(d).sort()) if (/\.(png|jpe?g)$/i.test(n)) files.push({ f: path.join(d, n), dark: /dark/i.test(n) }); } catch { /* none */ } }
  const dark = files.filter((x) => x.dark); // the product is the dark app: never mix in the retired light capture when a dark one exists
  return (dark.length ? dark : files).map((x) => x.f).slice(0, max);
}

export function plateBrand({ out, run: runArg, brand }) {
  const run = findRun(out, runArg);
  const dec = run ? readJson(path.join(run, "decisions.json")) : null;
  let file = run ? runBrandFile(run, dec) : null;
  if (!file && brand && brand !== true && /\.md$/i.test(String(brand)) && fs.existsSync(path.resolve(String(brand)))) file = path.resolve(String(brand));
  if (!file) return null;
  let B; try { B = readDesignMd(file); } catch { return null; }
  const r = B.roles || {};
  const named = (n) => (B.colors || []).find((c) => c.name.toLowerCase() === n);
  const hexes = [...new Set([r.canvas, r.ink, r.accent, ...(B.colors || []).filter((c) => /^(action|midnight|indigo-deep|app-window-dark|surface)$/i.test(c.name)).map((c) => c.hex)].filter(Boolean))].slice(0, 6);
  if (!hexes.length) return null;
  return {
    file, run, name: (dec && dec.brief && dec.brief.brand_name) || B.name || "the brand", hexes,
    canvas: r.canvas, ink: r.ink, accent: r.accent, dark: (named("app-window-dark") || named("midnight") || {}).hex || null,
    face: (B.fonts && B.fonts.display && B.fonts.display.family) || "",
    refs: uiRefs(run),
  };
}

export function brandedPrompt(see, B, { carrier, ui, imageryStyle } = {}) {
  const pal = [B.canvas && `${B.canvas} (canvas)`, B.ink && `${B.ink} (ink)`, B.accent && `${B.accent} (the one accent, used once)`, B.dark && `${B.dark} (dark product window)`].filter(Boolean).join(", ");
  const plural = B.refs.length > 1;
  return [
    `Flat, clean key frame of a product launch film for ${B.name}. Colour is locked to the brand file: ${pal}${B.hexes.length > 4 ? `; also ${B.hexes.slice(4).join(", ")}` : ""}. Use only these colours (and tints of them); never a default pure blue, no other accent colour, no purple or blue glow gradients.`,
    see,
    carrier ? `The carrier motif that travels the film: ${carrier}.` : "",
    B.refs.length ? `The attached image${plural ? "s are" : " is a"} real capture${plural ? "s" : ""} of the product's own UI. Wherever the shot shows the product, redraw that real screen as a simplified, faithful recreation (same layout, sidebar, prompt box, stepper, rounded cards, the same few readable UI words) in flat vector style: not a pixel copy, never abstract placeholder bars, donuts or icon blobs.` : ui ? `Where the shot shows the product, draw a simplified UI (${ui}) with a real card shape and a few readable UI words, never abstract placeholder bars or icon blobs.` : "",
    `No headline or caption text: the film's own type${B.face ? ` (${B.face})` : ""} lays over this picture; only the short UI labels of the product screen may appear. No logos or watermarks.`,
    imageryStyle && !B.refs.length ? `Any picture inside the frame follows this direction: ${imageryStyle}` : "",
    "No people, faces, hands, figures or silhouettes. No blue glow, neon, fog, haze, lens flare, holograms or glowing screens. No pixel art or fantasy worlds. Large confident empty space, one clear focal point, flat vector or very soft gradient rendering."
  ].filter(Boolean).join(" ");
}
