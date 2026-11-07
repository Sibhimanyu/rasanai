// Where decisions.json's `brand` path points. A relative path is read from the run folder, then up the project folders, then the working directory: never the cwd alone,
// which treated a branded film as unbranded whenever a command ran from another folder. Returns the absolute file, or null.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function resolveBrandPath(brand, base) {
  if (!brand || brand === true) return null;
  const b = String(brand);
  if (path.isAbsolute(b)) return fs.existsSync(b) ? b : null;
  const roots = [];
  // up the run's parents, but stop at the project root (a .git, package.json or .rasanai marker, inclusive) so an unrelated parent folder (~) never supplies a brand file
  if (base) { let d = path.resolve(String(base)); for (let i = 0; i < 5; i++) { roots.push(d); if ([".git", "package.json", ".rasanai"].some((m) => fs.existsSync(path.join(d, m)))) break; const up = path.dirname(d); if (up === d || up === os.homedir()) break; d = up; } }
  roots.push(process.cwd());
  for (const r of roots) { const f = path.resolve(r, b); if (fs.existsSync(f)) return f; }
  return null;
}
export const runBrandFile = (run, dec) => (dec && dec.use_brand !== false ? resolveBrandPath(dec.brand, run) : null);
