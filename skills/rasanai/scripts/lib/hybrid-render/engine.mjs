// hybrid-render/engine.mjs: HyperFrames scene render + ffmpeg assembly, inside the render slot (lib/slot.mjs).
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { renderProcessEnv } from "../containment.mjs";
import { admitPool, renderUnits } from "../resource-pools.mjs";

let hfVersion = null;
export function hyperframesVersion() {
  if (hfVersion) return hfVersion;
  const r = spawnSync("npx", ["--yes", "hyperframes", "--version"], { encoding: "utf8", timeout: 120000 });
  const m = String(r.stdout || r.stderr).match(/\d+\.\d+\.\d+/);
  return (hfVersion = m ? m[0] : "unknown");
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd: opts.cwd, stdio: ["ignore", "pipe", "pipe"], env: renderProcessEnv() }); // Plan 11 R8
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d)); p.stderr.on("data", (d) => (err += d));
    p.on("error", (e) => resolve({ code: 1, out, err: String(e) }));
    p.on("close", (code) => resolve({ code, out, err }));
  });
}

export function probeVideo(file) {
  const r = spawnSync("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames,width,height,pix_fmt,codec_name,r_frame_rate,color_space", "-of", "json", file], { encoding: "utf8" });
  try { const s = JSON.parse(r.stdout).streams[0]; return { frames: Number(s.nb_read_frames), width: s.width, height: s.height, pix_fmt: s.pix_fmt, codec: s.codec_name, fps: s.r_frame_rate, color_space: s.color_space || "unknown" }; } catch { return null; }
}

// One scene -> mp4 at outFile. mode "preview" = draft quality, "delivery" = delivery quality.
// Plan 09 P3/P9: the render pool is admitted FAIL-CLOSED (admitPool throws a resource_blocked error instead of rendering without a slot), and the renderer's
// internal --workers count is accounted as pool units.
export async function renderHost({ hostDir, outFile, fps, mode, workers, label, film = null, priority = "normal", run = null, shouldCancel }) {
  const slot = await admitPool("video_render", { label: label || "hybrid-render", film, units: renderUnits({ workers }).units, priority, run, shouldCancel });
  const t0 = Date.now();
  try {
    const args = ["--yes", "hyperframes", "render", hostDir, "-o", outFile, "--fps", `${fps.num}/${fps.den}`, "-q", mode === "delivery" ? "delivery" : "draft", "--quiet"];
    if (workers) args.push("--workers", String(workers));
    const r = await run("npx", args, { cwd: hostDir });
    if (r.code !== 0 || !fs.existsSync(outFile)) throw new Error(`hyperframes render failed (exit ${r.code}): ${(r.err || r.out).split("\n").filter(Boolean).slice(-6).join(" | ")}`);
    return { ms: Date.now() - t0 };
  } finally { slot.release(); }
}

// Concatenate scene clips (same codec settings, exact frame counts) without re-encoding the picture; optional audio is the film's mix.
export async function assemble({ clips, audio, outFile, totalFrames, fps, durationS, delivery, film = null, run = null }) {
  const encSlot = await admitPool("encode", { label: "hybrid-render assemble", film, run }); // the concat/mux is its own pool: it never queues behind a browser render
  try { return await assembleInner({ clips, audio, outFile, totalFrames, fps, durationS, delivery }); } finally { encSlot.release(); }
}
async function assembleInner({ clips, audio, outFile, totalFrames, fps, durationS, delivery }) {
  const list = outFile + ".list.txt";
  fs.writeFileSync(list, clips.map((c) => `file '${c.replace(/'/g, "'\\''")}'`).join("\n") + "\n");
  const args = ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", list];
  if (audio) args.push("-i", audio);
  args.push("-map", "0:v:0", "-c:v", "copy");
  if (audio) args.push("-map", "1:a:0", "-c:a", "aac", "-b:a", delivery ? "256k" : "160k", "-t", String(durationS));
  args.push("-movflags", "+faststart", outFile + ".part.mp4");
  const r = await run("ffmpeg", args);
  fs.rmSync(list, { force: true });
  if (r.code !== 0) { fs.rmSync(outFile + ".part.mp4", { force: true }); throw new Error(`ffmpeg concat failed: ${r.err.split("\n").filter(Boolean).slice(-3).join(" | ")}`); }
  const p = probeVideo(outFile + ".part.mp4");
  if (!p || p.frames !== totalFrames) { fs.rmSync(outFile + ".part.mp4", { force: true }); throw new Error(`assembled frame count ${p && p.frames} != ${totalFrames} (duplicated or dropped frames at a join)`); }
  fs.renameSync(outFile + ".part.mp4", outFile);
  return p;
}
