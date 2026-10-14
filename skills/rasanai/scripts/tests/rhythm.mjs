// slop.mjs `narrow-rhythm`: scene lengths within a 4x band are a metronome even when not identical (5+ scenes, the end card and flashes
// under 0.4 s left out); a wide spread passes; fewer than 5 scenes is not judged. The same measured on a synthetic render from its hard
// cuts (alternating dark and light shots made with ffmpeg lavfi). export default async function ({ ok, node, tmp }).
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export default async function ({ ok, node, tmp }) {
  const dir = fs.mkdtempSync(path.join(tmp, "rhythm-"));
  const proj = path.join(dir, "proj");
  fs.mkdirSync(proj, { recursive: true });
  const run = (lens, extra = []) => {
    const f = path.join(dir, "scenes-" + lens.join("-") + ".json");
    fs.writeFileSync(f, JSON.stringify({ scenes: lens.map((d, i) => ({ title: "S" + (i + 1), duration_s: d })) }));
    const r = node("slop.mjs", ["--project", proj, "--scenes", f, "--no-text-fit", "--json", ...extra]);
    let j = {}; try { j = JSON.parse(r.stdout); } catch {}
    return (j.findings || []).filter((x) => x.rule === "narrow-rhythm");
  };
  const nar = run([2, 3, 2.5, 3.5, 2, 3]);
  ok("rhythm: scenes within 2x of each other are narrow-rhythm, with the numbers and the fix", nar.length === 1 && nar[0].severity === "warn" && /1\.8x|1\.7x/.test(nar[0].where) && /longest shot/.test(nar[0].fix), JSON.stringify(nar));
  ok("rhythm: a 7x spread passes", run([1, 0.8, 4, 1.2, 6, 2]).length === 0);
  ok("rhythm: the end card is left out (a 6 s end card does not widen it)", run([2, 3, 2.5, 3.5, 2, 6]).length === 1);
  ok("rhythm: a flash under 0.4 s is left out (it does not widen it)", run([0.2, 2, 2.5, 3, 2.2, 2]).length === 1);
  ok("rhythm: fewer than 5 scenes are not judged", run([2, 2.5, 3, 2]).length === 0);

  if (spawnSync("ffmpeg", ["-version"], { encoding: "utf8" }).status !== 0) { console.log("note  rhythm: ffmpeg is not available, the render checks are skipped"); return; }
  // shots of the given lengths, alternating dark and light
  const film = (name, lens) => {
    const f = path.join(dir, name + ".mp4");
    const ins = lens.flatMap((d, i) => ["-f", "lavfi", "-i", `color=c=${i % 2 ? "0xe8e8e8" : "0x101820"}:s=320x180:r=20:d=${d}`]);
    const chain = lens.map((_, i) => `[${i}:v]`).join("") + `concat=n=${lens.length}:v=1:a=0[v]`;
    spawnSync("ffmpeg", ["-y", "-v", "error", ...ins, "-filter_complex", chain, "-map", "[v]", "-pix_fmt", "yuv420p", f]);
    return f;
  };
  const onRender = (f) => {
    const r = node("slop.mjs", ["--project", proj, "--video", f, "--no-text-fit", "--json"]);
    let j = {}; try { j = JSON.parse(r.stdout); } catch {}
    return (j.findings || []).filter((x) => x.rule === "narrow-rhythm" && /^render/.test(x.where));
  };
  const even = onRender(film("even", [1.5, 2, 1.6, 2.2, 1.8, 2, 2]));
  ok("rhythm: a render cut on a 1.5-2.2 s metronome is narrow-rhythm from its hard cuts", even.length === 1 && /x across/.test(even[0].where), JSON.stringify(even));
  ok("rhythm: a render with a 0.6 s burst and a 4 s reveal passes", onRender(film("varied", [0.6, 0.6, 0.7, 4, 0.8, 1.5, 2.5])).length === 0);
  ok("rhythm: a render of 3 shots is not judged", onRender(film("three", [2, 2, 2])).length === 0);
}
