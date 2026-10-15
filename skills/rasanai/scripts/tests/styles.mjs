// styles: the style-reference library (library/styles/*.md, imported from lemo-opuscar, mg-styles-15 and animate, all MIT) parses
// (frontmatter, every section, 3 to 6 numbered signature features, a poster that exists, a source line), the 7 launch styles and the
// 15 mg-styles-15 idioms are all there (plus animate's riso, sketchbook and manim-math: 29 files), the third_party credits exist, and design-desk.md and design-system-designer.md point at the
// library and require `## Signature features`.
// export default async ({ ok, node, tmp, env })
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIR = path.join(ROOT, "library", "styles");
const SECTIONS = ["Essence, and what it is not", "Materials", "Colour logic", "Type", "Motion", "Camera grammar", "Signature features", "When to use", "Source and licence"];
const LEMO = ["glass-product", "dark-keynote", "dataviz", "blueprint", "halftone-dossier", "art-deco", "ascii-crt"];
const MG = ["flat-vector", "line-art", "isometric", "3d-render", "cel-boil", "collage", "liquid", "morph", "bauhaus", "synthwave", "aurora-glass", "hanazi", "paperclip", "pixel", "hud"];

export function parseStyle(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return { problems: ["no frontmatter"] };
  const fm = {};
  for (const l of m[1].split("\n")) { const k = l.match(/^(\w+): (.*)$/); if (k) { try { fm[k[1]] = JSON.parse(k[2]); } catch { fm[k[1]] = k[2]; } } }
  const body = m[2];
  const problems = [];
  for (const k of ["id", "name", "kind", "source", "source_url", "license", "poster", "one_line"]) if (!fm[k]) problems.push("frontmatter " + k);
  if (fm.kind && fm.kind !== "style-reference") problems.push("kind");
  const secs = {};
  const parts = body.split(/^## /m).slice(1);
  for (const p of parts) { const i = p.indexOf("\n"); secs[p.slice(0, i).trim()] = p.slice(i + 1).trim(); }
  for (const s of SECTIONS) if (!secs[s] || secs[s].length < 20) problems.push("section " + s);
  const sig = (secs["Signature features"] || "").split("\n").filter((l) => /^\d+\. \S/.test(l));
  if (sig.length < 3 || sig.length > 6) problems.push("signature features " + sig.length);
  if (!/MIT/.test(secs["Source and licence"] || "") || !/https:\/\/github\.com\//.test(secs["Source and licence"] || "")) problems.push("source line");
  return { fm, secs, sig, problems };
}

export default async function ({ ok }) {
  const files = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => f.endsWith(".md") && f !== "README.md").sort() : [];
  ok("styles: library/styles has the 7 launch styles and all 15 mg-styles-15 idioms (at least 29 files)", files.length >= 29 && [...LEMO, ...MG].every((s) => files.includes(s + ".md")), files.join(","));
  const bad = [];
  const ids = new Set();
  for (const f of files) {
    const r = parseStyle(fs.readFileSync(path.join(DIR, f), "utf8"));
    if (r.problems.length) bad.push(f + ": " + r.problems.join(", "));
    else {
      if (r.fm.id !== f.replace(/\.md$/, "")) bad.push(f + ": id differs from the file name");
      if (ids.has(r.fm.id)) bad.push(f + ": duplicate id");
      ids.add(r.fm.id);
      if (!fs.existsSync(path.join(DIR, r.fm.poster))) bad.push(f + ": poster missing " + r.fm.poster);
      if (!["lemo-opuscar", "mg-styles-15", "animate"].includes(r.fm.source)) bad.push(f + ": source");
    }
  }
  ok("styles: every style file has its frontmatter, all 9 sections, 3 to 6 numbered signature features, a poster and a source line", bad.length === 0, bad.join("\n"));
  const readme = fs.existsSync(path.join(DIR, "README.md")) ? fs.readFileSync(path.join(DIR, "README.md"), "utf8") : "";
  ok("styles: library/styles/README.md lists every style", files.every((f) => readme.includes("[" + f.replace(/\.md$/, "") + "](")));

  for (const t of ["lemo-opuscar", "mg-styles-15"]) { // third_party/animate has LICENSE and README only (the source ships no NOTICE)
    const d = path.join(ROOT, "third_party", t);
    ok(`styles: third_party/${t} has LICENSE (MIT), NOTICE and README`, ["LICENSE", "NOTICE", "README.md"].every((f) => fs.existsSync(path.join(d, f))) && /MIT License/.test(fs.readFileSync(path.join(d, "LICENSE"), "utf8")));
  }

  ok("styles: third_party/animate has LICENSE (MIT) and README", ["LICENSE", "README.md"].every((f) => fs.existsSync(path.join(ROOT, "third_party", "animate", f))) && /MIT License/.test(fs.readFileSync(path.join(ROOT, "third_party", "animate", "LICENSE"), "utf8")));

  const desk = fs.readFileSync(path.join(ROOT, "references", "design-desk.md"), "utf8");
  const designer = fs.readFileSync(path.join(ROOT, "agents", "design-system-designer.md"), "utf8");
  ok("styles: design-desk.md references library/styles, says when to pull one, and requires ## Signature features", /library\/styles/.test(desk) && /When to pull one/.test(desk) && /## Signature features/.test(desk) && /3 to 6/.test(desk) && /style_refs/.test(desk));
  ok("styles: the design-system designer pulls 1 to 3 style references and writes ## Signature features", /library\/styles/.test(designer) && /## Signature features/.test(designer) && /one to three style references/.test(designer) && /style_refs/.test(designer));
}
