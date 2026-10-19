// Installing the director's decisions into a HyperFrames project, shared by video.mjs
// (entire videos), handoff.mjs (single units) and reel.mjs (footage reels):
//   - the look: a frame.md from a design direction or the project's own DESIGN.md, with its
//     fonts staged locally and an @font-face section workers can copy;
//   - the direction: DIRECTION.md in the project root, and a compact binding summary appended
//     to frame.md and every frame packet (frame workers read only those two).
import fs from "node:fs";
import path from "node:path";
import { readJSON, writeFile } from "./common.mjs";
import { findOption } from "./taxonomy.mjs";
import { readDesignMd, toFrameMd, toTokensJson, findBrandManifest } from "./design-md.mjs";
import { stageFonts } from "./fonts.mjs";

export const DIRECTION_MARK = "<!-- rasanai:direction -->";
export const FONTS_MARK = "<!-- rasanai:fonts -->";

// replace a marked section (from its marker to the next top-level "# " heading or another
// rasa marker) or append it
export function upsertMarked(text, mark, section) {
  const i = text.indexOf(mark);
  if (i === -1) return text.replace(/\s*$/, "\n\n") + section;
  const rest = text.slice(i + mark.length);
  const next = rest.search(/\n# [^\n]+|\n<!-- rasanai:/);
  return text.slice(0, i) + section + (next === -1 ? "" : rest.slice(next));
}

// families a frame.md names in its typography block
export function frameFonts(frameText) {
  const out = new Map();
  for (const m of frameText.matchAll(/fontFamily:\s*"([^"]+)"[^}]*?(?:weight:\s*(\d{3}))?/g)) {
    const w = out.get(m[1]) || new Set([400, 500, 700]);
    if (m[2]) w.add(Number(m[2]));
    out.set(m[1], w);
  }
  return [...out].map(([family, w]) => ({ family, weights: [...w].sort() }));
}

// write frame.md from a DESIGN.md (converted) or a ready frame spec, stage its fonts, add @font-face
export async function installLook(dir, { designMd = null, mode = undefined, frame = null, presetDir = null } = {}) {
  const notes = [];
  let frameText;
  let brand = null;
  if (designMd) {
    brand = readDesignMd(designMd, { mode });
    frameText = toFrameMd(brand, { assets: findBrandManifest(designMd) });
    writeFile(path.join(dir, "capture", "extracted", "tokens.json"), JSON.stringify(toTokensJson(brand), null, 2) + "\n");
    notes.push(`frame.md converted from the project's brand reference ${path.basename(designMd)} (${brand.format}); capture/extracted/tokens.json written for build-frame.mjs remixes`);
    notes.push(...brand.warnings);
  } else if (frame) {
    frameText = fs.readFileSync(frame, "utf8");
  } else return { wrote: false, notes };
  const fonts = frameFonts(frameText);
  const staged = await stageFonts(fonts, dir, { presetDir });
  notes.push(...staged.warnings);
  // a family that could not be staged is renamed to its fallback so no worker names a missing font
  for (const [asked, used] of Object.entries(staged.families)) if (asked !== used) frameText = frameText.split(`"${asked}"`).join(`"${used}"`);
  const fontSection = `${FONTS_MARK}\n## Font loading (staged by RasanAI)\n\nEvery composition that uses these families declares them with exactly these rules (paths are project-root relative):\n\n\`\`\`css\n${staged.css || "/* all families are resolved by HyperFrames itself: no @font-face needed */"}\n\`\`\`\n`;
  frameText = upsertMarked(frameText, FONTS_MARK, fontSection);
  writeFile(path.join(dir, "frame.md"), frameText);
  return { wrote: true, brand, fonts: staged.families, fontCss: staged.css, notes };
}

// the compact, binding direction summary for frame.md and frame packets
export function directionSection(direction, { full = "DIRECTION.md" } = {}) {
  const lines = [DIRECTION_MARK, `## Art direction (binding, from ${full}, decided with RasanAI)`, "", `**${direction.style_name}.**`, "", direction.brief, "", "Decisions (terms as motion designers use them; follow each instruction):", ""];
  for (const [key, opts] of Object.entries(direction.picks || {})) {
    const [dim, facet] = key.split(":");
    for (const o of opts) {
      const hit = findOption(dim, facet ? `${facet}:${o.id}` : o.id);
      if (!hit) continue;
      const label = facet ? `${hit.dimension.name}: ${hit.facet.name}` : hit.dimension.name;
      const p = hit.option.prompt.length > 520 ? hit.option.prompt.slice(0, 517).replace(/\s+\S*$/, "") + "…" : hit.option.prompt;
      lines.push(`- **${label} — ${hit.option.term}:** ${p}`);
    }
  }
  lines.push("", `Colors, fonts and radii come from frame.md; every duration and ease from motion.md; the full art-direction brief (definitions, what each term is not) is ${full} in the project root.`, "");
  return lines.join("\n");
}

// copy DIRECTION.md + direction.json into the project and return the compact section
export function installDirection(dir, directionPath) {
  const src = fs.statSync(directionPath).isDirectory() ? directionPath : path.dirname(directionPath);
  const md = path.join(src, "DIRECTION.md"), js = path.join(src, "direction.json");
  if (!fs.existsSync(md) || !fs.existsSync(js)) throw new Error(`${directionPath} must hold DIRECTION.md and direction.json (from direction.mjs compile)`);
  fs.copyFileSync(md, path.join(dir, "DIRECTION.md"));
  fs.copyFileSync(js, path.join(dir, "direction.json"));
  const direction = readJSON(js);
  return { direction, section: directionSection(direction) };
}
