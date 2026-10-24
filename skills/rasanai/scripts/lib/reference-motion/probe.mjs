// ffprobe/ffmpeg helpers for reference-motion. execFile with arg arrays only; no shell.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

export const EXTS = new Set([".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi", ".gif"]);
export const RIGHTS = ["inspiration-only", "owned", "licensed"];

export function safeVideoPath(raw) {
  if (typeof raw !== "string" || !raw) throw new Error("no --path given");
  if (raw.includes("\0")) throw new Error("path contains a NUL byte");
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) throw new Error("remote URLs are not ingested; use --manual-notes for web references");
  if (raw.split(/[\\/]+/).includes("..")) throw new Error("path may not contain '..'");
  const abs = path.resolve(raw);
  let real;
  try { real = fs.realpathSync(abs); } catch { throw new Error(`file not found: ${path.basename(raw)}`); }
  const st = fs.statSync(real);
  if (!st.isFile()) throw new Error("path is not a regular file");
  const ext = path.extname(real).toLowerCase();
  if (!EXTS.has(ext)) throw new Error(`unsupported extension "${ext}" (allowed: ${[...EXTS].join(" ")})`);
  try { fs.accessSync(real, fs.constants.R_OK); } catch { throw new Error("file is not readable"); }
  return real;
}

export function sha256File(p) {
  const h = crypto.createHash("sha256"), fd = fs.openSync(p, "r"), buf = Buffer.alloc(1 << 20);
  try { let n; while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) h.update(buf.subarray(0, n)); } finally { fs.closeSync(fd); }
  return h.digest("hex");
}
export const sha256Text = (s) => crypto.createHash("sha256").update(s).digest("hex");

export function run(bin, args, opts = {}) {
  return spawnSync(bin, args, { maxBuffer: 512 * 1024 * 1024, encoding: opts.raw ? "buffer" : "utf8", timeout: opts.timeout || 120000 });
}

export function haveTools() {
  return ["ffmpeg", "ffprobe"].every((b) => spawnSync(b, ["-version"], { encoding: "utf8" }).status === 0);
}

export const round = (x, d = 2) => { const m = 10 ** d; return Math.round(x * m) / m; };

export function probe(file) {
  const r = run("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file]);
  if (r.status !== 0) throw new Error("ffprobe could not read the file (not a valid video?)");
  const j = JSON.parse(r.stdout), v = (j.streams || []).find((s) => s.codec_type === "video");
  if (!v) throw new Error("no video stream found");
  const fr = (v.avg_frame_rate || v.r_frame_rate || "0/1").split("/").map(Number);
  const fps = fr[1] ? fr[0] / fr[1] : 0;
  const dur = Number(j.format?.duration || v.duration || 0);
  return {
    duration_s: round(dur, 2), fps_observed: round(fps, 2), width: v.width, height: v.height,
    has_audio: (j.streams || []).some((s) => s.codec_type === "audio"), codec: v.codec_name,
  };
}
