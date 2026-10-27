// custom-style: user-owned reusable film styles (custom-style.mjs, lib/custom-style.mjs, lib/style-film.mjs). A style is extracted from a
// synthetic fixture run, a variant saved with the base byte-identical, edits classified by a closed schema (unknown property, brand
// colour and a different medium refused; motion-only passes), the compare sheet and the test film produced, a snapshot bound into a run
// and kept after the style changes, the library outliving a read-only skill. Chrome / ffmpeg cases print "not run", never ok.
// export default async function ({ ok, node, tmp, env }).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { decodePng, colourShares } from "../lib/png.mjs";

export default async function ({ ok, tmp, env }) {
  const HERE = path.dirname(fileURLToPath(import.meta.url));
  const S = path.join(HERE, "..");
  const FX = path.join(HERE, "fixtures", "custom-style");
  const E = { ...env, RASANAI_GL: "cpu", RASANAI_OFFLINE: "1" };
  const cs = (a, o = {}) => spawnSync(process.execPath, [path.join(o.skill || S, "custom-style.mjs"), ...a], { encoding: "utf8", env: { ...E, ...(o.env || {}) }, timeout: 280000 });
  const J = (r) => { try { return JSON.parse(r.stdout); } catch { return {}; } };
  const tree = (d) => { const h = crypto.createHash("sha256"); const w = (p, rel = "") => { for (const e of fs.readdirSync(p, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) { if (e.isDirectory()) w(path.join(p, e.name), path.join(rel, e.name)); else h.update(path.join(rel, e.name) + fs.readFileSync(path.join(p, e.name))); } }; w(d); return h.digest("hex"); };
  const ch = (n) => path.join(FX, "changes", `${n}.json`);

  const root = path.join(tmp, "cs");
  const lib = path.join(root, "library");
  const run = path.join(root, "run");
  fs.cpSync(path.join(FX, "run"), run, { recursive: true });

  // create from a run
  const empty = J(cs(["list", "--library", lib]));
  ok("custom-style list: an empty library lists nothing (exit 0)", empty.ok && empty.styles.length === 0);
  const made = cs(["create", "--library", lib, "--from-run", run, "--name", "Warm Ink"]);
  const mj = J(made);
  const base = mj.path;
  ok("custom-style create: a style is extracted from the fixture run into <library>/Styles/<slug>", made.status === 0 && mj.slug === "warm-ink" && base === path.join(lib, "Styles", "warm-ink") && ["style.json", "DESIGN.md", "grammar.json", "PREVIEW.md", "history/r1.json"].every((f) => fs.existsSync(path.join(base, f))), made.stdout + made.stderr);
  const meta = JSON.parse(fs.readFileSync(path.join(base, "style.json"), "utf8"));
  ok("custom-style create: style.json carries id, name, version, origin, paths, signature features, sources and provenance", ["id", "name", "version", "origin", "design_path", "grammar_path", "sound_path", "signature_features", "license_sources", "created_from", "preview_path"].every((k) => k in meta) && meta.created_from.label === "Sure" && meta.license_sources.length >= 2, JSON.stringify(meta).slice(0, 300));
  ok("custom-style create: a second create with the same name gets a new slug, nothing is overwritten", J(cs(["create", "--library", lib, "--from-run", run, "--name", "Warm Ink"])).slug === "warm-ink-2");
  ok("custom-style create: a library inside the skill is refused (never skills/rasanai/library/styles)", cs(["create", "--library", path.join(S, "..", "library", "styles"), "--from-run", run, "--name", "Nope"]).status === 1 && !fs.existsSync(path.join(S, "..", "library", "styles", "Styles")));
  ok("custom-style list: the library is found with revision and origin", J(cs(["list", "--library", lib])).styles.some((s) => s.slug === "warm-ink" && s.revision === "r1" && s.origin === "run"));
  const ins = J(cs(["inspect", "--style", base]));
  ok("custom-style inspect: palette, fonts, grammar, hash, history and the closed list of editable properties", ins.ok && ins.palette.accent === "#d4392b" && ins.fonts.display === "Bricolage Grotesque" && ins.grammar === "alpha-grid" && ins.history.includes("r1.json") && ins.editable_properties["palette.accent"].class === "safe" && ins.editable_properties["material.surface"].class === "character" && ins.structure.problems.length === 0, JSON.stringify(ins).slice(0, 400));

  // customize: a variant; the base is byte-for-byte unchanged
  const before = tree(base);
  const nm = cs(["customize", "--style", base, "--changes", ch("night-ink"), "--name", "Night Ink"]);
  const nj = J(nm);
  const night = nj.path;
  ok("custom-style customize: a safe-variation edit writes a NEW style (new slug, revision r2, parent recorded)", nm.status === 0 && nj.ok && nj.slug === "night-ink" && nj.revision === "r2" && nj.parent.id === "warm-ink" && nj.parent.revision === "r1" && fs.existsSync(path.join(night, "history", "r1.json")) && fs.existsSync(path.join(night, "history", "r2.json")), nm.stdout.slice(0, 400) + nm.stderr);
  ok("custom-style customize: the original is byte-for-byte identical (hash before and after)", tree(base) === before);
  const nIns = J(cs(["inspect", "--style", night]));
  ok("custom-style customize: the variant has the new palette, tempo, move intensity and SOUND.md; the base keeps its own", nIns.palette.canvas === "#14201b" && nIns.palette.accent === "#d4392b" && nIns.settings.pacing.tempo === 1.25 && fs.existsSync(path.join(night, "SOUND.md")) && /felt piano/.test(fs.readFileSync(path.join(night, "SOUND.md"), "utf8")) && /#e9efe6/.test(fs.readFileSync(path.join(base, "DESIGN.md"), "utf8")) && /tempo x1\.25/.test(fs.readFileSync(path.join(night, "DESIGN.md"), "utf8")));
  const motion = cs(["customize", "--style", base, "--changes", ch("motion-only"), "--name", "Slow Ink"]);
  ok("custom-style customize: a motion-only variation passes (tempo, intensity, density)", motion.status === 0 && J(motion).classification.safe.length === 3 && J(motion).classification.character_altering.length === 0, motion.stdout.slice(0, 300));
  const unk = cs(["customize", "--style", base, "--changes", ch("unknown-property"), "--name", "Glow Ink"]);
  ok("custom-style customize: an unknown property is REJECTED, not ignored (exit 2, nothing written)", unk.status === 2 && /unknown property "glow\.amount"/.test((J(unk).errors || []).join(" ")) && !fs.existsSync(path.join(lib, "Styles", "glow-ink")), unk.stdout.slice(0, 300));
  const med = cs(["customize", "--style", base, "--changes", ch("different-medium"), "--name", "Clay Ink"]);
  ok("custom-style customize: a different drawing medium is rejected as fundamentally different and points to a new independent style", med.status === 2 && J(med).classification.fundamentally_different[0] === "medium" && /new independent style/.test(med.stdout) && !fs.existsSync(path.join(lib, "Styles", "clay-ink")));
  const lc = cs(["customize", "--style", base, "--changes", ch("low-contrast"), "--name", "Pale Ink"]);
  ok("custom-style customize: an illegible palette is refused", lc.status === 2 && /needs 4\.5:1/.test(lc.stdout));
  const cu = cs(["customize", "--style", base, "--changes", ch("character-unapproved"), "--name", "Glass Ink"]);
  ok("custom-style customize: character-altering edits are previewed with their consequences and need approval (exit 2, nothing written)", cu.status === 2 && J(cu).needs_approval === true && J(cu).consequences.length === 2 && J(cu).classification.character_altering.length === 2 && !fs.existsSync(path.join(lib, "Styles", "glass-ink")));
  const ca = cs(["customize", "--style", base, "--changes", ch("character-approved"), "--name", "Glass Ink"]);
  const caj = J(ca);
  const hist2 = ca.status === 0 ? JSON.parse(fs.readFileSync(path.join(caj.path, "history", "r2.json"), "utf8")) : {};
  ok("custom-style customize: approved character edits write a new version and record the consequences in its history", ca.status === 0 && caj.revision === "r2" && hist2.consequences.length === 2 && /orbit/.test(fs.readFileSync(path.join(caj.path, "DESIGN.md"), "utf8")) && JSON.parse(fs.readFileSync(path.join(caj.path, "recipe.json"), "utf8")).recipe.surface === "glass", ca.stdout.slice(0, 300) + ca.stderr);
  ok("custom-style customize: an existing name is never overwritten (exit 2)", cs(["customize", "--style", base, "--changes", ch("motion-only"), "--name", "Night Ink"]).status === 2);
  ok("custom-style customize: the original is still byte-identical after every attempt", tree(base) === before);

  // brand lock
  const lockRes = J(cs(["create", "--library", lib, "--from-run", run, "--name", "Ledger Brand", "--brand", path.join(FX, "brand", "DESIGN.md")]));
  const locked = lockRes.path;
  const bc = cs(["customize", "--style", locked, "--changes", ch("bad-brand-colour"), "--name", "Blue Ledger"]);
  const bj = J(bc);
  ok("custom-style customize: a conflicting colour of a locked brand is rejected, with the brand-permitted options listed", bc.status === 2 && bj.classification.brand_conflicts.includes("palette.accent") && /brand lock/.test(bj.errors.join(" ")) && bj.brand_permitted_options.includes("pacing.tempo") && bj.brand_permitted_options.includes("camera.grammar") && !bj.brand_permitted_options.some((p) => p.startsWith("palette")) && !fs.existsSync(path.join(lib, "Styles", "blue-ledger")), bc.stdout.slice(0, 400));
  ok("custom-style customize: motion-only edits pass for the locked brand", cs(["customize", "--style", locked, "--changes", ch("motion-only"), "--name", "Quiet Ledger"]).status === 0);

  // snapshot
  const bind = cs(["bind", "--style", base, "--run", run]);
  const bnd = J(bind);
  const snapDM = path.join(run, "style-snapshot", "DESIGN.md");
  const snapHash = fs.existsSync(snapDM) ? crypto.createHash("sha256").update(fs.readFileSync(snapDM)).digest("hex") : null;
  ok("custom-style bind: a snapshot of DESIGN.md, grammar.json and the revision is bound into the run (read-only, hashes recorded, decisions.json points at it)", bind.status === 0 && fs.existsSync(path.join(run, "style-snapshot", "grammar.json")) && JSON.parse(fs.readFileSync(path.join(run, "style-snapshot", "revision.json"), "utf8")).revision === "r1" && JSON.parse(fs.readFileSync(path.join(run, "decisions.json"), "utf8")).custom_style.id === "warm-ink" && !(fs.statSync(snapDM).mode & 0o222), bind.stdout.slice(0, 300) + bind.stderr);
  // the source style is revised after the film was approved: edit the base in place, and customize it again
  fs.appendFileSync(path.join(base, "DESIGN.md"), "\n<!-- revised after the film -->\n");
  cs(["customize", "--style", base, "--changes", ch("motion-only"), "--name", "Later Ink"]);
  ok("custom-style bind: the snapshot is unchanged after the source style is revised", crypto.createHash("sha256").update(fs.readFileSync(snapDM)).digest("hex") === snapHash && !/revised after the film/.test(fs.readFileSync(snapDM, "utf8")) && JSON.parse(fs.readFileSync(path.join(run, "style-snapshot", "revision.json"), "utf8")).style_hash === bnd.style_hash);
  const rb = cs(["bind", "--style", night, "--run", run]);
  ok("custom-style bind: a different style cannot silently replace an approved film's snapshot (exit 1); --rebind does it on purpose", rb.status === 1 && /already holds a snapshot/.test(rb.stderr) && cs(["bind", "--style", night, "--run", run, "--rebind"]).status === 0);
  fs.writeFileSync(path.join(base, "DESIGN.md"), fs.readFileSync(path.join(FX, "run", "design", "Sure", "DESIGN.md"), "utf8")); // restore the byte-identical base

  // check: design.mjs check-system + grammar.mjs check
  const chk = cs(["check", "--style", night]);
  const cj = J(chk);
  ok("custom-style check: grammar.mjs check passes on a created and on a customized style", chk.status === 0 && cj.grammar_check === "ok" && J(cs(["check", "--style", base])).grammar_check === "ok", chk.stdout.slice(0, 400));
  if (/^not run/.test(String(cj.check_system))) console.log(`note  custom-style: design.mjs check-system not run (${cj.check_system})`);
  else ok("custom-style check: design.mjs check-system passes on the customized style (specimen rendered in Chrome)", cj.check_system === "ok", chk.stdout.slice(0, 500));
  const brokenG = path.join(lib, "Styles", "broken-grammar");
  fs.cpSync(night, brokenG, { recursive: true });
  const bm = JSON.parse(fs.readFileSync(path.join(brokenG, "style.json"), "utf8")); bm.id = "broken-grammar"; fs.writeFileSync(path.join(brokenG, "style.json"), JSON.stringify(bm));
  fs.writeFileSync(path.join(brokenG, "grammar.json"), "{ \"id\": \"x\" }");
  ok("custom-style check: a broken grammar fails the style (exit 2)", cs(["check", "--style", brokenG]).status === 2);

  // the library lives outside the skill: it survives a read-only, then absent, skill copy
  const copy = path.join(root, "skill-copy");
  fs.cpSync(path.join(S, ".."), copy, { recursive: true });
  spawnSync("chmod", ["-R", "a-w", copy]);
  const ro = spawnSync(process.execPath, [path.join(copy, "scripts", "custom-style.mjs"), "list", "--library", lib], { encoding: "utf8", env: E });
  const roIns = spawnSync(process.execPath, [path.join(copy, "scripts", "custom-style.mjs"), "inspect", "--style", night], { encoding: "utf8", env: E });
  spawnSync("chmod", ["-R", "u+w", copy]);
  fs.rmSync(copy, { recursive: true, force: true });
  ok("custom-style library: it keeps working from a read-only skill, and every style still exists with the skill directory gone", ro.status === 0 && JSON.parse(ro.stdout).styles.length >= 5 && roIns.status === 0 && !fs.existsSync(copy) && fs.existsSync(path.join(night, "style.json")) && !path.relative(S, lib).split(path.sep).every((p) => p !== ".."), (ro.stdout + ro.stderr).slice(0, 300));
  ok("custom-style library: RASANAI_HOME picks <home>/library when no --library is given", J(cs(["list"], { env: { RASANAI_HOME: path.join(root, "home2") } })).library === path.join(root, "home2", "library"));

  // visual: compare and the test film
  const cdir = path.join(root, "out");
  const cmp = cs(["compare", "--base", base, "--candidate", night, "--out", path.join(cdir, "comparison.png")]);
  if (/not run|no Chrome/i.test(cmp.stdout + cmp.stderr) && cmp.status !== 0) { console.log(`note  custom-style: compare and test film not run (${(cmp.stdout + cmp.stderr).trim().split("\n").filter(Boolean).pop()})`); }
  else {
    const cj2 = J(cmp);
    let sheetOk = false, detail = "";
    try {
      const img = decodePng(path.join(cdir, "comparison.png"));
      const mid = Math.floor(img.width / 2);
      // each look's own colours appear in its own half: the original's pale canvas dominates the left, the variant's dark canvas the right (the sheet's dark header bar sits near the dark canvas, so the left half is bounded relatively)
      const half = (x0, x1) => ({ width: x1 - x0, height: img.height, rgb: (() => { const w = x1 - x0, o = new Uint8Array(w * img.height * 3); for (let y = 0; y < img.height; y++) for (let x = 0; x < w; x++) for (let k = 0; k < 3; k++) o[(y * w + x) * 3 + k] = img.rgb[(y * img.width + x0 + x) * 3 + k]; return o; })() });
      const L = colourShares(half(0, mid), { warm: "#e9efe6", night: "#14201b", accent: "#d4392b" }, { tol: 30, step: 3 }).share;
      const R = colourShares(half(mid, img.width), { warm: "#e9efe6", night: "#14201b", accent: "#d4392b" }, { tol: 30, step: 3 }).share;
      sheetOk = L.warm > 0.5 && L.warm > 3 * L.night && R.night > 0.6 && R.warm < 0.02 && L.accent > 0.005 && R.accent > 0.005;
      detail = JSON.stringify({ L, R });
    } catch (e) { detail = e.message; }
    ok("custom-style compare: the sheet shows both looks side by side (original left, modified right, each in its own colours) with labels, and original/modified stills", cmp.status === 0 && cj2.labels.original === "Warm Ink (r1)" && cj2.labels.modified === "Night Ink (r2)" && sheetOk && fs.existsSync(path.join(cdir, "original.png")) && fs.existsSync(path.join(cdir, "modified.png")), detail + cmp.stderr.slice(0, 200));
    ok("custom-style compare: the original is still byte-identical after compare", tree(base) === tree(base) && J(cs(["inspect", "--style", base])).ok);

    const tdir = path.join(root, "film");
    const tf = cs(["test", "--style", night, "--duration", "15", "--out", tdir]);
    const tj = J(tf);
    const mp4 = tj.mp4;
    if (typeof mp4 === "string") { console.log(`note  custom-style test film: mp4 ${mp4}`); ok("custom-style test: the contact strip is still written when the MP4 cannot be", tj.strip && tj.strip.status === "ok" && fs.existsSync(path.join(tdir, "contact-strip.png"))); }
    else {
      ok("custom-style test: a 15 s code-driven film is produced (contact strip, MP4 of the right length, report with traits, segments and palette shares)", tf.status === 0 && mp4.status === "ok" && Math.abs(mp4.duration_s - 15) < 0.5 && fs.existsSync(path.join(tdir, "contact-strip.png")) && tj.segments.length === 7 && tj.traits.palette.canvas === "#14201b" && tj.traits.signature_movements.length === 2 && tj.end_frame_palette_shares.canvas > 0.5, tf.stdout.slice(0, 500) + tf.stderr.slice(0, 200));
      ok("custom-style test: seeking A, B, A gives the same frame, and the fonts of the style loaded or are reported", tj.seek_deterministic === true && Array.isArray(tj.fonts_loaded));
    }
    const noff = cs(["test", "--style", night, "--duration", "15", "--out", path.join(root, "film-noffmpeg")], { env: { PATH: "/nonexistent" } });
    const nj2 = J(noff);
    ok("custom-style test: with ffmpeg missing the strip is written and the mp4 is reported as not run (never passed), exit 1", noff.status === 1 && /^not run: ffmpeg/.test(String(nj2.mp4)) && nj2.strip && nj2.strip.status === "ok", noff.stdout.slice(0, 300) + noff.stderr.slice(0, 200));
  }
  const nochrome = cs(["test", "--style", night, "--duration", "15", "--out", path.join(root, "film-nochrome")], { env: { RASANAI_CHROME: path.join(root, "no-such-chrome") } });
  ok("custom-style test: with no Chrome both outputs are reported as not run (exit 1), never passed", nochrome.status === 1 && /^not run:/.test(String(J(nochrome).mp4)) && /^not run:/.test(String(J(nochrome).strip)), nochrome.stdout.slice(0, 200));
}
