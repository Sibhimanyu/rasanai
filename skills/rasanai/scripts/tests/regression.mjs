// regression: the deterministic render regression runner (regression.mjs, lib/regression.mjs).
// Good synthetic fixtures pass (A-B-A seeks and a cold render give the same pixels, the baseline metric is inside its threshold);
// planted bad ones are refused: unseeded random animation (during playback and chosen at build time), a blank scene, a scene whose
// script throws (could not run, exit 1, never green), clipped text, a missing asset; a changed scene is a regression (exit 2);
// a missing baseline is not a pass. Needs headless Chrome: without it the Chrome cases are printed as "not run", never as ok.
// export default async function ({ ok, node, tmp }).
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export default async function ({ ok, tmp }) {
  const HERE = path.dirname(fileURLToPath(import.meta.url));
  const S = path.join(HERE, "..");
  const FX = path.join(HERE, "fixtures", "regression");
  const run = (a, env = {}) => spawnSync(process.execPath, [path.join(S, "regression.mjs"), ...a], { encoding: "utf8", env: { ...process.env, ...env }, timeout: 240000 });
  const rep = (r) => { try { return JSON.parse(r.stdout); } catch { return { rows: [] }; } };

  const help = run(["help"]);
  ok("regression: help documents check, baseline, the report fields and the exit codes", help.status === 0 && /check/.test(help.stdout) && /baseline/.test(help.stdout) && /repeat_identical/.test(help.stdout) && /Exit 0 pass, 2 a true regression, 1 could not run/.test(help.stdout), help.stdout.slice(0, 200));
  const bm = JSON.parse(fs.readFileSync(path.join(FX, "bad-manifest.json"), "utf8"));
  ok("regression: the manifests list good scenes with baselines and bad scenes with the status they must get", JSON.parse(fs.readFileSync(path.join(FX, "manifest.json"), "utf8")).scenes.length >= 4 && bm.scenes.every((s) => s.expect), "");
  const nm = run(["check", "--manifest", path.join(tmp, "no-such.json")]);
  ok("regression: an unreadable manifest is exit 1 (could not run)", nm.status === 1, nm.stderr.slice(0, 150));

  const good = run(["check", "--json"]);
  if (/no Chrome found/.test(good.stderr || "")) { console.log("note  regression: Chrome cases not run (no headless Chrome: run `npx hyperframes browser ensure` or set RASANAI_CHROME)"); return; }
  const g = rep(good);
  ok("regression: the good fixtures pass (exit 0), 4 scenes x 3 timestamps, each with the report fields", good.status === 0 && g.rows.length === 12 && g.rows.every((r) => r.status === "ok" && ["scene", "timestamp_s", "repeat_identical", "metric", "threshold", "console_errors", "actual", "baseline", "status"].every((k) => k in r)), good.stdout.slice(0, 300) + good.stderr.slice(0, 200));
  ok("regression: A-B-A seeks and a cold render are identical on the good fixtures, and the baseline metric is ~0 on this machine", g.rows.every((r) => r.repeat_identical === true) && g.rows.every((r) => r.metric < 0.001), "");

  const bad = run(["check", "--manifest", path.join(FX, "bad-manifest.json"), "--json"]);
  const b = rep(bad);
  for (const s of bm.scenes) {
    const rows = b.rows.filter((r) => r.scene === s.id);
    ok(`regression: the bad fixture "${s.id}" is rejected as ${s.expect}`, rows.length > 0 && rows.some((r) => r.status === s.expect), JSON.stringify(rows.map((r) => r.status)));
  }
  ok("regression: a bad set is not a pass, and the broken scene alone is exit 1 (could not run), not green", bad.status === 2 && run(["check", "--manifest", path.join(FX, "bad-manifest.json"), "--scene", "broken"]).status === 1, `exit ${bad.status}`);

  // a changed scene is a regression (exit 2); a baseline refresh is a separate, explicit command
  const copy = path.join(tmp, "regression-fx");
  fs.cpSync(FX, copy, { recursive: true });
  // the copy lives outside the skill, so its relative script paths become absolute
  for (const n of fs.readdirSync(path.join(copy, "good"))) {
    const h = path.join(copy, "good", n);
    fs.writeFileSync(h, fs.readFileSync(h, "utf8").replaceAll("../../../../../runtime/", "file://" + path.join(S, "..", "runtime") + "/").replaceAll("../../../../vendor/", "file://" + path.join(S, "vendor") + "/"));
  }
  const f = path.join(copy, "good", "shape-timing.html");
  fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace("width:60px;height:60px;background:#e8a33d", "width:150px;height:100px;background:#ffffff"));
  const chg = run(["check", "--manifest", path.join(copy, "manifest.json"), "--scene", "shape-timing", "--json"]);
  ok("regression: a changed scene is a regression (exit 2) with the metric over its threshold", chg.status === 2 && rep(chg).rows.some((r) => r.status === "regression" && r.metric > r.threshold), chg.stdout.slice(0, 200));
  fs.rmSync(path.join(copy, "baselines"), { recursive: true, force: true });
  const nb = run(["check", "--manifest", path.join(copy, "manifest.json"), "--scene", "gsap-shape", "--json"]);
  ok("regression: a missing baseline is never a pass (exit 1, status no-baseline)", nb.status === 1 && rep(nb).rows.every((r) => r.status === "no-baseline"), nb.stdout.slice(0, 200));
}
