// Fake ComfyUI HTTP server for tests (no GPU). Speaks /system_stats, /object_info/*, /prompt, /history/<id>, /queue, /interrupt, /view.
// startFakeComfy({delayPolls, failPrompts, token}) -> {url, port, requests, close, restart()}; restart() forgets every prompt (session restart).
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { makeFakeClip } from "./fake-media.mjs";

export async function startFakeComfy({ delayPolls = 1, failPrompts = false, token = null, checkpoints = ["fake-ltx-video.safetensors"] } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fake-comfy-"));
  let prompts = new Map(); // id -> {graph, polls, cancelled, file}
  const requests = [];
  const send = (res, code, obj) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
  const nodesOf = (g) => Object.values(g);
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      requests.push({ method: req.method, path: u.pathname, auth: req.headers.authorization || null, body: body ? JSON.parse(body) : null });
      if (token && req.headers.authorization !== `Bearer ${token}`) return send(res, 401, { error: "unauthorized" });
      if (u.pathname === "/system_stats") return send(res, 200, { system: { comfyui_version: "fake-0.3", os: "fake" }, devices: [{ name: "fake-gpu", vram_total: 0 }] });
      if (u.pathname.startsWith("/object_info/")) return send(res, 200, { [u.pathname.slice(13)]: { input: { required: { ckpt_name: [checkpoints] } } } });
      if (u.pathname === "/prompt" && req.method === "POST") {
        const g = JSON.parse(body).prompt;
        if (failPrompts || !g || nodesOf(g).some((n) => !n.class_type)) return send(res, 400, { error: { type: "prompt_outputs_failed_validation", message: "Prompt outputs failed validation" }, node_errors: { 1: { errors: ["fake validation error"] } } });
        const id = crypto.randomUUID();
        prompts.set(id, { graph: g, polls: 0, cancelled: false, file: null });
        return send(res, 200, { prompt_id: id, number: prompts.size, node_errors: {} });
      }
      if (u.pathname === "/queue" && req.method === "POST") { for (const id of JSON.parse(body).delete || []) { const p = prompts.get(id); if (p) p.cancelled = true; } return send(res, 200, {}); }
      if (u.pathname === "/interrupt") { for (const p of prompts.values()) if (!p.file) p.cancelled = true; return send(res, 200, {}); }
      if (u.pathname === "/queue") {
        const run = [], pend = [];
        for (const [id, p] of prompts) if (!p.cancelled && !p.file) (p.polls > 0 ? run : pend).push([0, id]);
        return send(res, 200, { queue_running: run, queue_pending: pend });
      }
      if (u.pathname.startsWith("/history/")) {
        const id = u.pathname.slice(9), p = prompts.get(id);
        if (!p || p.cancelled) return send(res, 200, {});
        if (p.polls++ < delayPolls) return send(res, 200, {});
        if (!p.file) {
          const n = nodesOf(p.graph), by = (t) => n.find((x) => x.class_type === t)?.inputs || {};
          const lat = n.find((x) => x.inputs?.width && x.inputs?.length)?.inputs || {};
          const fps = by("CreateVideo").fps || 24;
          p.file = `plate_${id.slice(0, 8)}.mp4`;
          makeFakeClip(path.join(dir, p.file), { seed: n.find((x) => x.inputs?.seed != null)?.inputs.seed, prompt: n.find((x) => x.class_type === "CLIPTextEncode")?.inputs.text, width: lat.width || 64, height: lat.height || 64, fps_num: fps, frames: lat.length || 9 });
        }
        return send(res, 200, { [id]: { status: { status_str: "success", completed: true }, outputs: { 9: { images: [{ filename: p.file, subfolder: "", type: "output" }], animated: [true] } } } });
      }
      if (u.pathname === "/view") {
        const f = path.join(dir, path.basename(u.searchParams.get("filename") || ""));
        if (!fs.existsSync(f)) return send(res, 404, { error: "not found" });
        res.writeHead(200, { "content-type": "video/mp4" }); return res.end(fs.readFileSync(f));
      }
      send(res, 404, { error: "no route" });
    });
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const port = srv.address().port;
  return { url: `http://127.0.0.1:${port}`, port, requests, restart: () => { prompts = new Map(); }, close: () => new Promise((r) => { srv.close(r); fs.rmSync(dir, { recursive: true, force: true }); }) };
}
