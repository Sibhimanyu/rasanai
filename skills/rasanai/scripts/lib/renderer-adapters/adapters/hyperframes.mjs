// hyperframes adapter: the default and only always-on renderer. Wraps the exact command finish.mjs / video.mjs use
// (`npx --yes hyperframes render <project> -o <out> --fps N --quiet [--quality draft|delivery]`), inside a render slot.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { SLOT, which, version, chromePath, pkgVersion, npxCacheRoots } from "../common.mjs";

function slotStatus() {
  const r = spawnSync(process.execPath, [SLOT, "status"], { encoding: "utf8", timeout: 10000 });
  try { return JSON.parse(r.stdout); } catch { return { error: (r.stderr || "slot status unavailable").trim() }; }
}
function renderArgv(project, opts, quality) {
  const out = opts.out || path.join(project, "renders", `${opts.name || "film"}-${quality}.mp4`);
  const argv = ["--yes", "hyperframes", "render", project, "-o", out, "--fps", String(opts.fps || 30), "--quiet", "--quality", quality];
  if (opts.composition) argv.push("-c", opts.composition);
  if (opts.workers) argv.push("-w", String(opts.workers));
  return { out, argv };
}
function run(project, opts, quality) {
  const { out, argv } = renderArgv(project, opts, quality);
  const cmd = [process.execPath, SLOT, "run", "--label", `adapter-hyperframes-${quality}`, "--", "npx", ...argv];
  if (opts.dryRun) return { ok: true, dry_run: true, out, command: cmd };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const r = spawnSync(cmd[0], cmd.slice(1), { cwd: project, encoding: "utf8" });
  return { ok: r.status === 0 && fs.existsSync(out), out, status: r.status, tail: String(r.stderr || r.stdout).trim().split("\n").slice(-6).join(" | ") };
}

export default {
  id: "hyperframes",
  async available() {
    const npx = which("npx"), node = which("node") || process.execPath;
    const roots = [...npxCacheRoots(), process.cwd(), path.join(os.homedir(), ".npm-global", "lib"), "/opt/homebrew/lib", "/usr/local/lib"];
    const installed = pkgVersion("hyperframes", roots);
    const ffmpeg = which("ffmpeg"), ffprobe = which("ffprobe"), chrome = chromePath();
    const ok = !!(npx && node);
    const problems = [!npx && "npx not found", !ffmpeg && "ffmpeg not found (needed for audio mux and mp4 checks)", !ffprobe && "ffprobe not found", !chrome && "no Chrome found (HyperFrames downloads its own browser on first render)"].filter(Boolean);
    return {
      available: ok,
      reason: ok ? (problems.length ? `ready; notes: ${problems.join("; ")}` : "ready") : problems.join("; "),
      license_status: "HyperFrames, fetched by npx; the project's existing default renderer",
      probe: {
        invoke: "npx --yes hyperframes render <project> -o <out> --fps <n> --quiet --quality draft|delivery (wrapped by node scripts/lib/slot.mjs run)",
        installed_version: installed, installed_note: installed ? "found in a local/npx cache" : "not cached here; `npx --yes` fetches it on first render (probe never downloads)",
        node: { path: node, version: process.version }, npx, ffmpeg: ffmpeg && { path: ffmpeg, version: version(ffmpeg) }, ffprobe, chrome,
        formats: { mp4: true, gif: "no hyperframes flag used by RasanAI; make a gif from the mp4 with ffmpeg", alpha: "transparent overlays only where the motion-graphics workflow renders them; not probed here" },
        render_slots: slotStatus(),
      },
      limits: { resource_use: "one Chrome plus ffmpeg per render; roughly 1-3 GB RAM; slots cap concurrent renders (default 1-2, RASANAI_RENDER_SLOTS)", quality: "draft for previews, delivery for finals; max 240 fps; deterministic frame capture, no rAF or Date in scenes" },
    };
  },
  async analyze(project) {
    const has = (f) => fs.existsSync(path.join(project, f));
    return { adapter: "hyperframes", project, initialized: has("hyperframes.json"), has_index: has("index.html"), compositions: has("compositions") ? fs.readdirSync(path.join(project, "compositions")).filter((f) => f.endsWith(".html")) : [] };
  },
  async renderPreview(project, opts = {}) { return run(project, opts, "draft"); },
  async renderFinal(project, opts = {}) { return run(project, opts, "delivery"); },
};
