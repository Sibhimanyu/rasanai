// moments.mjs on a local fixture manifest and bundle (no network): search by role and mechanic, credits, the cache when
// offline, fetch with a verified sha256 into a read-only folder, a tampered bundle refused, the fallback with no cache.
// export default async function ({ ok, tmp, env }).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export default async function ({ ok, tmp, env }) {
  const root = path.join(tmp, "moments-test");
  const home = path.join(root, "home"), mirror = path.join(root, "mirror"), run = path.join(root, "run");
  for (const d of [home, mirror, run]) fs.mkdirSync(d, { recursive: true });
  // a bundle: dense.md, code/REMIX.md, code/index.html
  const src = path.join(root, "src");
  fs.mkdirSync(path.join(src, "code"), { recursive: true });
  fs.writeFileSync(path.join(src, "dense.md"), "# Brief\nMotion rules: the bar opens with a fast ease-out burst.\n");
  fs.writeFileSync(path.join(src, "code", "REMIX.md"), "# Remix\nSignature: orb collapses to a caret.\n");
  fs.writeFileSync(path.join(src, "code", "index.html"), "<div data-composition-id=\"m\"></div>");
  const tgz = path.join(root, "bundle.tar.gz");
  if (spawnSync("tar", ["-czf", tgz, "-C", src, "."]).status !== 0) { console.log("note  moments: tar is not available, tests skipped"); return; }
  const buf = fs.readFileSync(tgz), sha = crypto.createHash("sha256").update(buf).digest("hex");
  fs.mkdirSync(path.join(mirror, "M900", sha), { recursive: true });
  fs.copyFileSync(tgz, path.join(mirror, "M900", sha, "bundle.tar.gz"));
  const row = (id, role, mechanic, extra = {}) => ({ id, name: `moment ${id}`, role, mechanic, swap_slot: ["text"], why: "buys attention", duration_s: 4.2, clip: `${id}/clip.mp4`, still: `${id}/still.jpg`, author_handle: "@maker", x_author_name: "Maker", x_url: `https://x.com/maker/status/${id}`, film_title: "A film", ...extra });
  const man = path.join(root, "manifest.json");
  fs.writeFileSync(man, JSON.stringify([
    row("M900", "hook", ["layout_motion", "stagger"], { bundle: { key: `M900/${sha}/bundle.tar.gz`, sha256: sha, bytes: buf.length } }),
    row("M901", "proof", ["cursor_click", "ui_transition"], { bundle: { key: `M901/${"0".repeat(64)}/bundle.tar.gz`, sha256: "0".repeat(64), bytes: 10 } }),
    row("M902", "proof", ["cursor_click"], { on_page: "no (a real face)" }),
  ]));
  const E = (extra = {}) => ({ ...env, RASANAI_HOME: home, RASANAI_MOMENTS_MANIFEST: man, RASANAI_MOMENTS_BUNDLES: mirror, ...extra });
  const M = (a, extra) => spawnSync(process.execPath, [path.join(HERE, "moments.mjs"), ...a], { encoding: "utf8", env: E(extra), cwd: root, timeout: 60000 });
  const J = (r) => { try { return JSON.parse(r.stdout); } catch { return {}; } };

  const s = J(M(["search", "--role", "proof", "--mechanic", "cursor_click"]));
  ok("moments: search filters by role and mechanic, keeps off-page rows out, and returns credit, clip and still", s.ok && s.count === 1 && s.rows[0].id === "M901" && s.rows[0].credit.handle === "@maker" && /x\.com/.test(s.rows[0].credit.url) && /M901\/clip\.mp4/.test(s.rows[0].clip) && Array.isArray(s.rows[0].swapSlot), JSON.stringify(s).slice(0, 300));
  ok("moments: the manifest is cached under the RasanAI home and used offline", fs.existsSync(path.join(home, "cache", "moments", "manifest.json")) && J(M(["list", "--no-network"], { RASANAI_MOMENTS_MANIFEST: path.join(root, "gone.json") })).total === 2);
  const f = J(M(["fetch", "M900", "--run", run, "--role", "hook"]));
  const dir = path.join(run, "references", "moments", "M900");
  const cr = JSON.parse(fs.readFileSync(path.join(run, "references", "moments", "credits.json"), "utf8"));
  let writable = true;
  try { fs.writeFileSync(path.join(dir, "dense.md"), "x"); } catch { writable = false; }
  ok("moments: fetch verifies the sha256, extracts the bundle read-only into the run and records the credit", f.ok && f.sha256 === sha && fs.existsSync(path.join(dir, "code", "REMIX.md")) && !writable && cr.moments[0].id === "M900" && cr.moments[0].handle === "@maker" && /technique only/.test(cr.note), JSON.stringify(f).slice(0, 300));
  const bad = M(["fetch", "M901", "--run", run]);
  ok("moments: a bundle that is missing or whose sha256 does not match is refused (exit 2) with the fallback", bad.status === 2 && /fallback/.test(bad.stdout), bad.stdout.slice(0, 200));
  const c = J(M(["credits", "--run", run]));
  ok("moments: credits prints the line the Final's notes carry (creator, source, technique only)", /@maker/.test(c.final_note || "") && /technique only/.test(c.final_note || ""));
  const none = J(M(["list", "--no-network"], { RASANAI_HOME: path.join(root, "empty-home") }));
  ok("moments: offline with no cache, an empty list and the library fallback (never an error)", none.ok && none.count === 0 && /library/.test(none.fallback || ""));
  spawnSync("chmod", ["-R", "u+w", path.join(run, "references")]);
}
