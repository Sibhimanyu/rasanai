// frame-gate's boldness check (lib/pixels.mjs boldFrame, frame-gate.mjs boldnessOf) on synthetic films made with ffmpeg lavfi:
// a giant ring is a giant glyph and a solid panel is a frame-filling object (not a glyph); a 16 s film of small UI marks on one
// white ground fails `boldness` with the longest flat stretch named; a declared stillness style makes it a warning; a film
// with a giant ring and a full-frame blue field passes with 2 grounds; a film under 15 s is skipped; without --project the
// DOM checks (competing-heroes among them) are reported as skipped.
// export default async function ({ ok, tmp }). Skipped with a note when ffmpeg is missing.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export default async function ({ ok, tmp }) {
  const scripts = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
  const ff = (argv) => spawnSync("ffmpeg", ["-y", "-v", "error", ...argv], { encoding: "utf8" });
  if (ff(["-version"]).error) { console.log("note  boldness: ffmpeg is not installed, tests skipped"); return; }
  const dir = path.join(tmp, "boldness");
  fs.mkdirSync(dir, { recursive: true });
  const f = (n) => path.join(dir, n);
  const S = "320x180";
  const ring = `color=c=white:s=${S}:r=10,format=gbrp,geq=r='if(between(hypot(X-W/2,Y-H/2),0.22*H,0.30*H),20,240)':g='if(between(hypot(X-W/2,Y-H/2),0.22*H,0.30*H),20,240)':b='if(between(hypot(X-W/2,Y-H/2),0.22*H,0.30*H),20,240)'`;
  const ui = (c) => `color=c=${c}:s=${S}:r=10,drawbox=x=40:y=40:w=60:h=5:c=0x606060:t=fill,drawbox=x=40:y=60:w=90:h=5:c=0x606060:t=fill,drawbox=x=200:y=120:w=70:h=5:c=0x606060:t=fill`;
  const film = (name, parts) => {
    const inputs = parts.flatMap(([src, d]) => ["-f", "lavfi", "-t", String(d), "-i", src]);
    const fc = parts.map((_, i) => `[${i}:v]format=yuv420p,setsar=1[v${i}]`).join(";") + ";" + parts.map((_, i) => `[v${i}]`).join("") + `concat=n=${parts.length}:v=1:a=0[o]`;
    const r = ff([...inputs, "-filter_complex", fc, "-map", "[o]", "-pix_fmt", "yuv420p", f(name)]);
    return r.status === 0 ? f(name) : null;
  };
  const safe = film("safe.mp4", [[ui("white"), 16]]);
  const bold = film("bold.mp4", [[ring, 6], [ui("white"), 4], [ui("0x2050d0"), 6]]);
  const short = film("short.mp4", [[ui("white"), 10]]);
  const panel = (() => { const r = ff(["-f", "lavfi", "-i", `color=c=white:s=${S},drawbox=x=40:y=20:w=240:h=140:c=0x202020:t=fill`, "-frames:v", "1", f("panel.png")]); return r.status === 0 ? f("panel.png") : null; })();
  const ringPng = (() => { const r = ff(["-f", "lavfi", "-i", ring, "-frames:v", "1", f("ring.png")]); return r.status === 0 ? f("ring.png") : null; })();
  ok("boldness: the fixtures render (ffmpeg lavfi)", !!(safe && bold && short && panel && ringPng));
  if (!(safe && bold && short && panel && ringPng)) return;

  const px = await import(path.join(scripts, "lib", "pixels.mjs"));
  const fr = px.boldFrame(px.decodeStill(ringPng)), fp = px.boldFrame(px.decodeStill(panel));
  ok("boldness: a ring 60% H tall with an 8% H stroke is a giant glyph; a frame split by a solid dark panel (58%) is a frame-filling mass, not a glyph", fr.glyph >= 50 && fr.glyph <= 70 && fp.glyph === 0 && fp.obj >= 0.4 && fr.gL > 90, JSON.stringify({ ring: fr, panel: fp }));

  const fg = await import(path.join(scripts, "frame-gate.mjs"));
  const rows = [...Array(40)].map((_, i) => ({ t: i * 0.25, gL: i >= 30 ? 40 : 98, ga: i >= 30 ? 10 : 0, gb: i >= 30 ? -50 : 0, near: 0.9, glyph: i < 4 ? 30 : 0, obj: 0 }));
  const b = fg.boldnessOf(rows, 10);
  ok("boldness: boldnessOf counts glyph and field frames, two grounds, and names the longest stretch without a big moment (1 to 7.5 s)", b.bigShare === 0.35 && b.glyphShare === 0.1 && b.fieldShare === 0.25 && b.grounds === 2 && b.gap[0] === 1 && b.gap[1] === 7.5 && b.beats === 2, JSON.stringify(b));

  const run = (video, extra = []) => { const r = spawnSync(process.execPath, [path.join(scripts, "frame-gate.mjs"), "--video", video, "--json", ...extra], { encoding: "utf8", timeout: 120000 }); try { return { status: r.status, j: JSON.parse(r.stdout) }; } catch { return { status: r.status, j: {} }; } };
  const has = (j, sev) => (j.findings || []).find((x) => x.check === "boldness" && (!sev || x.severity === sev));
  const a = run(safe);
  const fa = has(a.j, "error");
  ok("boldness: 16 s of small UI marks on one white ground fails boldness (error, 0% big moments, 1 ground, the whole film named as the flat stretch)", a.status === 2 && fa && fa.value === 0 && a.j.film.boldness.grounds === 1 && fa.gap[1] >= 15, JSON.stringify(a.j.film && a.j.film.boldness));
  ok("boldness: without --project the DOM checks are reported as skipped, competing-heroes named", (a.j.skipped || []).some((s) => /DOM checks not run/.test(s) && /competing-heroes/.test(s)), JSON.stringify(a.j.skipped));
  const st = run(safe, ["--stillness"]);
  ok("boldness: a declared stillness style turns it into a warning", has(st.j, "warning") && !has(st.j, "error"), JSON.stringify((st.j.findings || []).map((x) => x.check + ":" + x.severity)));
  const plan = f("score.json"); fs.writeFileSync(plan, JSON.stringify({ motion_style: "editorial" }));
  const ed = run(safe, ["--plan", plan]);
  ok("boldness: a score with motion_style editorial turns it into a warning too", has(ed.j, "warning") && !has(ed.j, "error"));
  const bb = run(bold);
  ok("boldness: a giant ring for 6 s and a full-frame blue field for 6 s pass (big moments >= 25%, 2 grounds)", bb.j.film && bb.j.film.boldness.bigShare >= 0.6 && bb.j.film.boldness.grounds === 2 && bb.j.film.boldness.glyphShare >= 0.3 && bb.j.film.boldness.fieldShare >= 0.3 && !has(bb.j), JSON.stringify(bb.j.film && bb.j.film.boldness));
  const sh = run(short);
  ok("boldness: a 10 s film is not judged (skipped, said so)", !has(sh.j) && (sh.j.skipped || []).some((s) => /boldness: the film is 10 s/.test(s)), JSON.stringify(sh.j.skipped));
}
