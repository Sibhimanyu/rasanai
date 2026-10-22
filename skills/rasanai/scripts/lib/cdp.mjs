// A tiny DevTools-protocol client over --remote-debugging-pipe (zero dependencies).
//
// Chrome's one-shot --screenshot and --dump-dom fire at the load event, before anything a page builds
// asynchronously (a 3D scene importing three.js, compiling shaders, loading textures). This drives one
// browser over its own pipe instead, so a caller can wait for a page to say it is ready, seek it, and
// capture as many frames as it likes from one launch.
//
//   const b = await launch({ width: 1920, height: 1080 });
//   await b.open("file:///…/scene.html");
//   await b.eval("window.__rasan3dReady()", { await: true });
//   const png = await b.screenshot();          // Buffer
//   await b.close();
import { spawn } from "node:child_process";
import { chromePath } from "./common.mjs";

// WebGL through the Mac's GPU (Metal) is 5-20x faster than SwiftShader and HyperFrames' render uses the GPU
// there too; elsewhere, or with RASANAI_GL=cpu, software GL (deterministic, slower).
export function glArgs() {
  const mode = process.env.RASANAI_GL || (process.platform === "darwin" ? "gpu" : "cpu");
  return mode === "gpu" ? (process.platform === "darwin" ? ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] : ["--enable-gpu", "--ignore-gpu-blocklist"]) : ["--disable-gpu", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"];
}

export async function launch({ width = 1920, height = 1080, scale = 1, timeoutMs = 60000, extraArgs = [] } = {}) {
  const args = [
    "--headless=new", "--no-sandbox", ...glArgs(), "--hide-scrollbars", "--mute-audio",
    "--allow-file-access-from-files", "--remote-debugging-pipe", "--no-first-run", "--no-default-browser-check",
    "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows",
    `--window-size=${width},${height}`, ...extraArgs, "about:blank",
  ];
  const proc = spawn(chromePath(), args, { stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"] });
  const toChrome = proc.stdio[3], fromChrome = proc.stdio[4];
  let id = 0, buf = "";
  const pending = new Map(), listeners = [];
  const logs = [];
  let dead = null;
  proc.on("exit", (code, sig) => {
    dead = `Chrome exited (${sig || code})`;
    for (const [, p] of pending) p.reject(new Error(dead));
    pending.clear();
  });
  fromChrome.on("data", (chunk) => {
    buf += chunk.toString("utf8");
    let i;
    while ((i = buf.indexOf("\0")) >= 0) {
      const raw = buf.slice(0, i);
      buf = buf.slice(i + 1);
      let msg;
      try { msg = JSON.parse(raw); } catch { continue; }
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) p.reject(new Error(`${p.method}: ${msg.error.message}`));
        else p.resolve(msg.result);
      } else if (msg.method) {
        if (msg.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(msg.params.type)) logs.push(`${msg.params.type}: ${(msg.params.args || []).map((a) => a.value ?? a.description ?? "").join(" ")}`);
        if (msg.method === "Runtime.exceptionThrown") logs.push(`exception: ${msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text}`);
        for (const l of listeners.slice()) l(msg);
      }
    }
  });
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      if (dead) return reject(new Error(dead));
      const mid = ++id;
      const timer = setTimeout(() => {
        if (pending.has(mid)) { pending.delete(mid); reject(new Error(`${method} timed out after ${Math.round(timeoutMs / 1000)}s`)); }
      }, timeoutMs);
      pending.set(mid, { method, resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); } });
      toChrome.write(JSON.stringify({ id: mid, method, params, ...(sessionId ? { sessionId } : {}) }) + "\0");
    });
  const once = (method, sessionId, ms = timeoutMs) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => { off(); reject(new Error(`waiting for ${method} timed out`)); }, ms);
      const fn = (m) => { if (m.method === method && (!sessionId || m.sessionId === sessionId)) { off(); clearTimeout(timer); resolve(m.params); } };
      const off = () => { const k = listeners.indexOf(fn); if (k >= 0) listeners.splice(k, 1); };
      listeners.push(fn);
    });

  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const S = (m, p) => send(m, p, sessionId);
  await S("Page.enable");
  await S("Runtime.enable");
  await S("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: scale, mobile: false });

  const api = {
    logs,
    async open(url, { waitMs = timeoutMs } = {}) {
      const loaded = once("Page.loadEventFired", sessionId, waitMs);
      await S("Page.navigate", { url });
      await loaded;
    },
    async eval(expression, { await: aw = false } = {}) {
      const r = await S("Runtime.evaluate", { expression, awaitPromise: aw, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text || "evaluation failed");
      return r.result ? r.result.value : undefined;
    },
    async screenshot({ clip, format = "png", quality } = {}) {
      const r = await S("Page.captureScreenshot", { format, ...(format === "jpeg" && quality ? { quality } : {}), ...(clip ? { clip: { ...clip, scale: 1 } } : {}), captureBeyondViewport: false });
      return Buffer.from(r.data, "base64");
    },
    async close() {
      try { await send("Browser.close"); } catch {}
      setTimeout(() => { try { proc.kill("SIGKILL"); } catch {} }, 500).unref();
    },
  };
  return api;
}
