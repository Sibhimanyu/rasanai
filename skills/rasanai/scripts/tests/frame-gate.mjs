// frame-gate.mjs on tiny fixtures made with ffmpeg (lavfi) in a temp dir: a flat white still fails the ground rules, a tinted
// lit still with a soft plane passes them, a checkerboard has nothing soft, two colours cut once in a video, the DOM text metrics
// (a 300 px line is ~26% H, a blurred copy is not counted, a crowded board is flagged), a flat brand film waives the ground rules
// and turns the type rules into errors, and the CLI's exit codes (0 clean, 2 errors, 1 could not run).
// export default async function ({ ok, node, tmp }). Skipped with a note when ffmpeg or Chrome is missing.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromePath } from "../lib/common.mjs";

export default async function ({ ok, tmp }) {
  const HERE = path.dirname(fileURLToPath(import.meta.url));
  const GATE = path.join(HERE, "..", "frame-gate.mjs");
  const ff = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" });
  if (ff.error || ff.status !== 0) { console.log("note  frame-gate: no ffmpeg, skipped"); return; }
  const mod = await import(GATE);
  const dir = path.join(tmp, "frame-gate");
  fs.mkdirSync(dir, { recursive: true });
  const make = (name, input, extra = []) => {
    const f = path.join(dir, name);
    const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", input, ...extra, f], { encoding: "utf8" });
    return r.status === 0 ? f : null;
  };
  const box = "between(X,200,440)*between(Y,60,210)";
  const tex = "128+60*sin(X/10)*sin(Y/10)";
  const flat = make("flat.png", "color=c=white:s=640x360", ["-frames:v", "1"]);
  const lit = make("lit.png", `nullsrc=s=640x360,format=gbrp,geq=r='if(${box},${tex},150+60*X/W)':g='if(${box},${tex},120+50*X/W)':b='if(${box},${tex},210-40*X/W)'`, ["-frames:v", "1"]);
  const sharp = make("sharp.png", "nullsrc=s=640x360,format=gbrp,geq=r='if(mod(floor(X/6)+floor(Y/6),2),230,30)':g='if(mod(floor(X/6)+floor(Y/6),2),230,30)':b='if(mod(floor(X/6)+floor(Y/6),2),230,30)'", ["-frames:v", "1"]);
  const vid = (() => {
    const f = path.join(dir, "two.mp4");
    const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=red:s=320x180:d=2:r=10", "-f", "lavfi", "-i", "color=c=blue:s=320x180:d=2:r=10", "-filter_complex", "concat=n=2:v=1:a=0", "-pix_fmt", "yuv420p", f], { encoding: "utf8" });
    return r.status === 0 ? f : null;
  })();
  ok("frame-gate: the fixtures render (ffmpeg lavfi)", !!(flat && lit && sharp && vid));
  if (!(flat && lit && sharp && vid)) return;

  const has = (r, check, sev) => r.findings.some((f) => f.check === check && (!sev || f.severity === sev));
  const rF = await mod.measureFrames({ stills: flat });
  ok("frame-gate: a flat white still has ground chroma 0, L* range 0 and fails ground-chroma, ground-range and soft-content (errors)", rF.film.groundChroma === 0 && rF.film.groundRange === 0 && has(rF, "ground-chroma", "error") && has(rF, "ground-range", "error") && has(rF, "soft-content", "error") && !rF.ok, JSON.stringify(rF.film));
  const rL = await mod.measureFrames({ stills: lit });
  ok("frame-gate: a tinted lit ground with a soft plane passes the pixel rules (chroma >= 1.5, L* range >= 4, soft share >= 0.15)", rL.film.groundChroma >= 1.5 && rL.film.groundRange >= 4 && rL.film.softP90 >= 0.15 && !rL.findings.some((f) => f.severity === "error"), JSON.stringify(rL.film) + JSON.stringify(rL.findings.map((f) => f.check)));
  const rS = await mod.measureFrames({ stills: sharp });
  ok("frame-gate: a checkerboard (all sharp structure) has soft share 0 and fails soft-content", rS.film.softP90 === 0 && has(rS, "soft-content", "error"), JSON.stringify(rS.film));
  const rV = await mod.measureFrames({ video: vid });
  ok("frame-gate: a video of red then blue has one hard cut, a 2 s average shot and ~4 s of frames at 4 fps", rV.kind === "video" && rV.film.hardCuts === 1 && Math.abs(rV.film.aslS - 2) < 0.3 && rV.film.frames >= 15 && rV.film.frames <= 17, JSON.stringify(rV.film));
  const rM = await mod.measureFrames({ video: path.join(dir, "no-such.mp4") });
  ok("frame-gate: a missing video is 'could not run', never clean", !rM.ok && rM.could_not_run.length > 0 && rM.film === null);

  // CLI exit codes
  const cli = (args) => spawnSync(process.execPath, [GATE, ...args], { encoding: "utf8", timeout: 120000 });
  const c0 = cli(["--stills", lit]), c2 = cli(["--stills", flat, "--json"]), c1 = cli(["--stills", path.join(dir, "nope")]), c3 = cli([]);
  let j = {}; try { j = JSON.parse(c2.stdout); } catch {}
  ok("frame-gate: CLI exits 0 on a clean still, 2 on a flat one (JSON with findings and fixes), 1 when it could not run or has no input", c0.status === 0 && c2.status === 2 && (j.findings || []).every((f) => f.fix && f.message) && c1.status === 1 && c3.status === 1, `${c0.status} ${c2.status} ${c1.status} ${c3.status}`);

  // a flat brand film waives the ground and soft rules
  const gram = path.join(dir, "grammar.json");
  fs.writeFileSync(gram, JSON.stringify({ frameMetrics: { groundChroma: 0, groundRange: 0, softP90: 0, colourfulP90: 50 } }));
  const rB = await mod.measureFrames({ stills: flat, brandFilm: gram });
  ok("frame-gate: a brand film that measures a flat ground waives ground-chroma, ground-range and soft-content (no errors; the type rules are unproven without DOM text)", !rB.findings.some((f) => f.severity === "error") && has(rB, "flat-ground-unproven", "warning") && rB.limits.flat, JSON.stringify(rB.findings.map((f) => f.check)));
  const old = path.join(dir, "old-grammar.json");
  fs.writeFileSync(old, JSON.stringify({ chroma: { neutralShare: 0.97 }, luminance: { bgMean: 250 } }));
  const bo = await mod.brandMetrics(old);
  ok("frame-gate: an older brand-film grammar.json (neutral share 0.97, white ground) reads as a flat ground", bo && bo.flat === true && bo.groundChroma === 0);
  const wr = cli(["--stills", lit, "--write-brand", path.join(dir, "written.json")]);
  const written = (() => { try { return JSON.parse(fs.readFileSync(path.join(dir, "written.json"), "utf8")).frameMetrics; } catch { return null; } })();
  ok("frame-gate: --write-brand stores the measured film metrics in grammar.json", wr.status === 0 && written && written.groundChroma >= 1.5 && written.softP90 >= 0.15, JSON.stringify(written));

  // DOM text metrics need Chrome
  let chrome = true;
  { const realExit = process.exit; process.exit = () => { throw new Error("no chrome"); }; try { chromePath(); } catch { chrome = false; } finally { process.exit = realExit; } }
  if (!chrome) { console.log("note  frame-gate: no Chrome, the DOM text checks are skipped"); return; }
  const hd = make("lit-hd.png", `nullsrc=s=640x360,format=gbrp,geq=r='if(${box},${tex},150+60*X/W)':g='if(${box},${tex},120+50*X/W)':b='if(${box},${tex},210-40*X/W)'`, ["-frames:v", "1", "-vf", "scale=1920:1080"]);
  const bd = path.join(dir, "boards");
  fs.mkdirSync(bd, { recursive: true });
  for (const n of ["01", "02", "03"]) fs.copyFileSync(hd, path.join(bd, `${n}.png`));
  const page = (body) => `<!doctype html><html><body style="margin:0;width:1920px;height:1080px;background:#fff">${body}</body></html>`;
  fs.writeFileSync(path.join(bd, "01.html"), page(`<h1 style="position:absolute;left:100px;top:300px;margin:0;font:700 300px/1 Arial">Ask</h1><p style="position:absolute;left:100px;top:900px;margin:0;font:40px Arial">one small label here</p><p style="position:absolute;left:100px;top:700px;margin:0;font:60px Arial;filter:blur(10px)">blurred copy that is not read</p>`));
  fs.writeFileSync(path.join(bd, "02.html"), page(`<p style="position:absolute;left:100px;top:400px;margin:0;font:40px Arial">small</p>`));
  fs.writeFileSync(path.join(bd, "03.html"), page(`<p style="position:absolute;left:100px;top:400px;margin:0;font:700 500px/1 Arial">9</p>`));
  const rD = await mod.measureFrames({ stills: bd, html: bd });
  const f1 = rD.frames[0] || {}, f2 = rD.frames[1] || {};
  ok("frame-gate: DOM text: a 300 px line is ~26% H, the blurred copy is not counted as characters, a 500 px glyph passes 35% H", f1.bigPct > 20 && f1.bigPct < 32 && f1.chars === 3 + 17 && rD.film.peak35 === true && rD.film.share20 > 0.5 && f2.bigPct > 2 && f2.bigPct < 5, JSON.stringify(rD.frames.map((f) => [f.chars, f.bigPct])) + JSON.stringify(rD.could_not_run));
  ok("frame-gate: DOM text: giant lines in a third of the frames and a p90/p10 of 5 or more pass the type rules", rD.film.biggestRatio >= 5 && !has(rD, "giant-moment") && !has(rD, "scale-contrast"), JSON.stringify(rD.film));

  const crowd = path.join(dir, "crowd");
  fs.mkdirSync(crowd, { recursive: true });
  fs.copyFileSync(hd, path.join(crowd, "01.png"));
  fs.writeFileSync(path.join(crowd, "01.html"), page(Array.from({ length: 12 }, (_, i) => `<p style="position:absolute;left:100px;top:${60 + i * 80}px;margin:0;font:30px Arial">the quick brown fox jumps over the lazy dog ${i}</p>`).join("")));
  const rC = await mod.measureFrames({ stills: crowd, html: crowd });
  ok("frame-gate: DOM text: a crowded board (12 lines, 500+ characters, no big line) fails text-load and giant-moment, and the frame is flagged crowded", has(rC, "text-load", "error") && has(rC, "giant-moment") && rC.frames[0].flags.includes("crowded"), JSON.stringify(rC.findings.map((f) => f.check)) + JSON.stringify(rC.frames[0]));
  const rCB = await mod.measureFrames({ stills: crowd, html: crowd, brandFilm: gram });
  ok("frame-gate: with a flat brand film the same crowded board still fails (type carries the film), and the giant-moment finding is an error", has(rCB, "text-load", "error") && has(rCB, "giant-moment", "error") && !has(rCB, "ground-chroma"), JSON.stringify(rCB.findings.map((f) => f.severity + ":" + f.check)));
  ok("frame-gate: no leftover temp pages in the boards directory", fs.readdirSync(bd).every((f) => !f.startsWith(".rasanai-framegate")), fs.readdirSync(bd).join(","));
}
