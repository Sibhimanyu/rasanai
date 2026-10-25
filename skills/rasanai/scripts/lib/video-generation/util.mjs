// Shared helpers for video-generation (C4). Zero dependencies (Node >= 20, ffmpeg/ffprobe on PATH).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

export function canon(v) {
  if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
  if (v && typeof v === "object") return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}";
  return JSON.stringify(v ?? null);
}
export const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
export const digest = (obj) => sha256(canon(obj));
export const fileSha = (p) => sha256(fs.readFileSync(p));

// "24" | "30000/1001" -> {fps_num, fps_den}
export function parseFps(s) {
  const m = String(s ?? "24").match(/^(\d+)(?:\/(\d+))?$/);
  if (!m || +m[1] <= 0 || +(m[2] ?? 1) <= 0) throw new Error(`bad fps "${s}" (use 24 or 30000/1001)`);
  return { fps_num: +m[1], fps_den: +(m[2] ?? 1) };
}
export const frameCount = (duration_s, f) => Math.round(duration_s * f.fps_num / f.fps_den);

// Redaction: tokens, URL userinfo, and absolute private paths never reach a log or asset.json.
export function redactor(secrets = [], roots = []) {
  const home = os.homedir();
  const rs = [...roots.filter(Boolean)].sort((a, b) => b.length - a.length);
  return (s) => {
    let t = String(s ?? "");
    for (const x of secrets) if (x && x.length > 3) t = t.split(x).join("[redacted]");
    t = t.replace(/\/\/[^/\s@]+@/g, "//[redacted]@").replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]");
    for (const r of rs) t = t.split(r).join("<film>");
    t = t.split(home).join("~");
    return t.replace(/\/Users\/[^/\s"']+/g, "~");
  };
}

// Sandbox: relative, no "..", resolves (real path) inside root.
export function inside(root, rel) {
  if (typeof rel !== "string" || !rel || path.isAbsolute(rel) || rel.split(/[\\/]/).includes("..")) throw new Error(`path "${rel}" is not a relative path inside the film`);
  const full = path.resolve(root, rel);
  const realRoot = fs.realpathSync(root);
  let probe = full;
  while (!fs.existsSync(probe)) probe = path.dirname(probe);
  const rp = fs.realpathSync(probe);
  if (rp !== realRoot && !rp.startsWith(realRoot + path.sep)) throw new Error(`path "${rel}" escapes the film folder`);
  return full;
}

export function have(bin) { return spawnSync(bin, ["-version"], { encoding: "utf8" }).status === 0; }
export function ffprobe(file) {
  const r = spawnSync("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=codec_name,width,height,r_frame_rate,nb_read_frames:format=duration", "-of", "json", file], { encoding: "utf8" });
  if (r.status !== 0) return null;
  try {
    const j = JSON.parse(r.stdout), s = j.streams?.[0];
    if (!s) return null;
    const [n, d] = String(s.r_frame_rate).split("/").map(Number);
    return { codec: s.codec_name, width: s.width, height: s.height, fps_num: n, fps_den: d || 1, frames: +s.nb_read_frames, duration_s: +j.format?.duration };
  } catch { return null; }
}
export function ffmpeg(argv) {
  const r = spawnSync("ffmpeg", ["-y", "-v", "error", ...argv], { encoding: "utf8" });
  if (r.status !== 0) throw new Error("ffmpeg failed: " + (r.stderr || "").trim().slice(0, 300));
}
export function atomicWrite(p, s) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const t = p + ".tmp" + process.pid;
  fs.writeFileSync(t, s); fs.renameSync(t, p);
}
