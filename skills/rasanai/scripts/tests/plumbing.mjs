// Round 4 plumbing: brandfilm compare knows the film type (grammar.json films, --film, --structure one-take), console record
// --type comment|apply enters session.comments/applied (and the revision refusal), video.mjs write logs a font downgrade.
// export default async function ({ ok, node, tmp, env }).
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPTS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

export default async function ({ ok, node, tmp, env }) {
  const root = path.join(tmp, "plumbing-test");
  fs.mkdirSync(root, { recursive: true });
  const json = (r) => { try { return JSON.parse(r.stdout); } catch { return {}; } };
  const ff = (argv) => spawnSync("ffmpeg", ["-y", "-v", "error", ...argv], { encoding: "utf8" });

  // ---- 5. brandfilm: per-film numbers
  if (ff(["-version"]).error) console.log("note  plumbing: ffmpeg is not installed, brandfilm cases skipped");
  else {
    const film = (name, bg, blocks, d = 3) => {
      const f = path.join(root, name);
      const parts = blocks.map((c, i) => `color=c=${bg}:s=640x360:r=10:d=${d},drawbox=x=${i % 2 ? 330 : 30}:y=${i < 2 ? 40 : 180}:w=280:h=140:color=${c}:t=fill[v${i}]`);
      const graph = parts.join(";") + ";" + blocks.map((_, i) => `[v${i}]`).join("") + `concat=n=${blocks.length}:v=1:a=0[o]`;
      return ff(["-filter_complex", graph, "-map", "[o]", "-c:v", "libx264", "-pix_fmt", "yuv420p", f]).status === 0 ? f : null;
    };
    const montage = film("montage.mp4", "white", ["black", "0x303030", "black", "0x202020", "black", "0x404040", "black", "0x101010"], 1.5); // 12 s, 7 cuts
    const spot = film("spot.mp4", "white", ["black"], 12); // one take
    const ours = film("ours.mp4", "0xfafafa", ["0x101010"], 12); // a one-take film of the same look
    const green = film("green.mp4", "0x0d4a2f", ["0xe8d9a0"], 12);
    ok("plumbing: synthesised the test films", !!(montage && spot && ours && green));
    if (montage && spot && ours && green) {
      const g = path.join(root, "grammar.json");
      node("brandfilm.mjs", ["measure", "--in", montage, "--out", g]);
      const m1 = json(node("brandfilm.mjs", ["measure", "--in", spot, "--out", g, "--film", "spot", "--structure", "one-take"]));
      ok("plumbing: measure --film adds the film to grammar.json and keeps `measured` as the first film", m1.films && m1.films.spot && m1.films.spot.structure === "one-take" && Object.keys(m1.films).length === 2 && m1.measured.cuts.count >= 5, JSON.stringify(Object.keys(m1.films || {})));
      const plain = node("brandfilm.mjs", ["compare", "--ref", g, "--ours", ours]);
      ok("plumbing: against the montage a one-take film fails on cut rate", json(plain).failed?.includes("cutRateRatio"), plain.stdout.slice(0, 300));
      const byFilm = json(node("brandfilm.mjs", ["compare", "--ref", g, "--ours", ours, "--film", "spot"]));
      ok("plumbing: compare --film spot measures against the one-take film and no longer fails on cut rate", byFilm.film === "spot" && !(byFilm.failed || []).includes("cutRateRatio"), JSON.stringify(byFilm.failed));
      const byStruct = json(node("brandfilm.mjs", ["compare", "--ref", g, "--ours", ours, "--structure", "one-take"]));
      ok("plumbing: compare --structure one-take picks the one-take film", byStruct.film === "spot", JSON.stringify(byStruct.film));
      const g2 = path.join(root, "montage-only.json");
      node("brandfilm.mjs", ["measure", "--in", montage, "--out", g2]);
      const warn = json(node("brandfilm.mjs", ["compare", "--ref", g2, "--ours", ours, "--structure", "one-take"]));
      ok("plumbing: one-take with no one-take film to follow: cut rate is a warning, not an error", warn.verdict === "PASS" && (warn.warnings || []).includes("cutRateRatio") && !(warn.failed || []).includes("cutRateRatio"), JSON.stringify([warn.failed, warn.warnings]));
      const bad = node("brandfilm.mjs", ["compare", "--ref", g, "--ours", green, "--film", "spot"]);
      ok("plumbing: a real brand mismatch (a green film against a white brand) still fails on --film", bad.status === 1 && json(bad).failed.some((n) => /palette|offBrandChroma/i.test(n)), bad.stdout.slice(0, 300));
      const bad2 = json(node("brandfilm.mjs", ["compare", "--ref", g2, "--ours", green, "--structure", "one-take"]));
      ok("plumbing: and still fails with --structure one-take", bad2.verdict === "FAIL" && bad2.failed.some((n) => /palette|offBrandChroma/i.test(n)), JSON.stringify(bad2.failed));
      const miss = node("brandfilm.mjs", ["compare", "--ref", g, "--ours", ours, "--film", "nope"]);
      ok("plumbing: an unknown --film is an error that lists the films", miss.status === 2 && /spot/.test(miss.stdout), miss.stdout.slice(0, 200));
    }
  }

  // ---- 7. console record: notes given in chat enter the notes rule
  {
    const run = path.join(root, "run");
    fs.mkdirSync(run, { recursive: true });
    const henv = { ...env, RASANAI_CONSOLE_HEADLESS: "1" };
    const con = (a) => spawnSync(process.execPath, [path.join(SCRIPTS, "console.mjs"), ...a], { encoding: "utf8", env: henv, cwd: root });
    con(["push", "--run", run, "--step", "animatic", "--data", '{"version":1,"video":"x.mp4"}']);
    const rec = json(con(["record", "--run", run, "--step", "animatic", "--type", "comment", "--note", "the logo is too small", "--value", '{"t":12.4}']));
    let s = JSON.parse(fs.readFileSync(path.join(run, "session.json"), "utf8"));
    ok("plumbing: record --type comment puts the chat note in session.comments", rec.id && (s.comments || []).some((c) => c.id === rec.id && c.text === "the logo is too small" && c.t === 12.4 && c.state === "open"), JSON.stringify(s.comments));
    const bare = con(["record", "--run", run, "--step", "animatic", "--type", "comment"]);
    ok("plumbing: record --type comment without a note is refused", bare.status !== 0, bare.stdout + bare.stderr);
    con(["record", "--run", run, "--step", "animatic", "--type", "apply"]);
    s = JSON.parse(fs.readFileSync(path.join(run, "session.json"), "utf8"));
    ok("plumbing: record --type apply puts the step's open notes in session.applied", (s.applied || []).includes(rec.id), JSON.stringify(s.applied));
    const rev = con(["push", "--run", run, "--step", "animatic", "--data", '{"version":2,"video":"y.mp4"}']);
    ok("plumbing: a revision is then refused while the chat note has no resolve --note", rev.status === 2 && /not answered/.test(rev.stderr), rev.stderr.slice(0, 200));
    con(["resolve", "--run", run, "--ids", rec.id, "--note", "logo enlarged"]);
    const rev2 = con(["push", "--run", run, "--step", "animatic", "--data", '{"version":2,"video":"y.mp4"}']);
    ok("plumbing: and goes through once it is resolved", rev2.status === 0, rev2.stderr.slice(0, 200));
  }

  // ---- 8. video.mjs write: the font fallback is logged
  {
    const run = path.join(root, "vrun"), proj = path.join(root, "vproj"), sb = path.join(run, "story");
    for (const d of [run, proj, sb]) fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(run, "session.json"), "{}");
    fs.writeFileSync(path.join(proj, "hyperframes.json"), "{}");
    fs.writeFileSync(path.join(sb, "STORYBOARD.md"), "# Storyboard\n");
    fs.writeFileSync(path.join(sb, "timeline.json"), JSON.stringify({ aspect: "1920x1080", total_s: 10 }));
    fs.writeFileSync(path.join(run, "motion.md"), "---\nname: test\n---\n\n## How it moves\n\nSteady.\n");
    fs.writeFileSync(path.join(run, "frame.src.md"), '# Frame\n\n```yaml\ntypography:\n  display: { fontFamily: "Zzqx Nonexistent Sans", weight: 700 }\n```\n');
    fs.writeFileSync(path.join(run, "video-decisions.json"), JSON.stringify({ route: "general-video", message: "A test film.", motion: "motion.md", storyboard_dir: "story", look: { frame: "frame.src.md", name: "Test" } }));
    const r = spawnSync(process.execPath, [path.join(SCRIPTS, "video.mjs"), "write", "--project-dir", proj, "--decisions", path.join(run, "video-decisions.json")], { encoding: "utf8", env, cwd: root, timeout: 120000 });
    const j = json(r);
    const rows = fs.existsSync(path.join(run, "downgrades.jsonl")) ? fs.readFileSync(path.join(run, "downgrades.jsonl"), "utf8") : "";
    ok("plumbing: video.mjs write says it fell back to Inter (downgrades in its output) and logs a downgrade row", r.status === 0 && (j.downgrades || []).some((d) => /Zzqx/.test(d) && /Inter/.test(d)) && /Zzqx Nonexistent Sans/.test(rows), (r.stdout + r.stderr).slice(0, 400) + rows);
  }
}
