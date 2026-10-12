// selftest section "plates" (W13): abstract plates. art.mjs recipe (the prompt carries the shape, the palette in words and
// "no text, no objects, no logos"), plate --engine procedural (a headless render at the asked size, deterministic, every pixel
// on the palette ramp), treat --op gradient-map as the palette lock (a rainbow comes out on the ramp only, dithered), make on
// an `abstract` row with image generation off (procedural, not a todo), and RasanCamera.flowGround + plateTransition on a
// paused timeline: the ground changes over time, a second seek and a second browser launch give byte-identical frames.
// export default async function ({ ok, node, tmp, quick }). flowStrip() is shared with the W13 demo.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const json = (r) => { try { return JSON.parse(r.stdout); } catch { return {}; } };
const hex = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));

// decode a PNG to RGBA with ffmpeg (optionally scaled down)
export function pixels(file, w = 0) {
  const p = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", file], { encoding: "utf8" });
  let [W, H] = String(p.stdout).trim().split("x").map(Number);
  const vf = w ? ["-vf", `scale=${w}:-2:flags=area`] : [];
  if (w) { H = Math.round((H * w) / W / 2) * 2; W = w; }
  const r = spawnSync("ffmpeg", ["-v", "error", "-i", file, ...vf, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgba", "-"], { maxBuffer: 1 << 30 });
  return { w: W, h: H, d: r.stdout };
}
// the largest RGB distance from any pixel to the ramp's polyline (the gradient map's only possible outputs)
export function offRamp(img, ramp) {
  const st = ramp.map(hex);
  let worst = 0;
  for (let i = 0; i < img.d.length; i += 4) {
    const c = [img.d[i], img.d[i + 1], img.d[i + 2]];
    let best = Infinity;
    for (let k = 0; k < st.length - 1; k++) {
      const a = st[k], b = st[k + 1], ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1;
      const t = Math.max(0, Math.min(1, ((c[0] - a[0]) * ab[0] + (c[1] - a[1]) * ab[1] + (c[2] - a[2]) * ab[2]) / L));
      const e = Math.hypot(c[0] - a[0] - ab[0] * t, c[1] - a[1] - ab[1] * t, c[2] - a[2] - ab[2] * t);
      if (e < best) best = e;
    }
    if (best > worst) worst = best;
  }
  return worst;
}

// a stage with a flowGround (from a plate file) and a plateTransition, seeked at `times`; one browser launch per call
export async function flowStrip(dir, { plate, plate2, times = [0.4, 1.6, 3.0, 4.2, 4.5, 4.8, 5.8], keep = false, tint = "#f7f1ea", card = true, width = 1920, height = 1080 }) {
  const { installCamera } = await import(path.join(HERE, "lib", "camera.mjs"));
  const { serve } = await import(path.join(HERE, "lib", "stage3d.mjs"));
  const { launch } = await import(path.join(HERE, "lib", "cdp.mjs"));
  fs.mkdirSync(dir, { recursive: true });
  installCamera(dir);
  fs.copyFileSync(plate, path.join(dir, "plate.png"));
  fs.copyFileSync(plate2 || plate, path.join(dir, "plate2.png"));
  fs.writeFileSync(path.join(dir, "flow.html"), `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#000;overflow:hidden}#root{position:relative;width:${width}px;height:${height}px;overflow:hidden}#card{position:absolute;left:0;top:0;width:${Math.round(width / 3)}px;height:${Math.round(height / 3)}px;border-radius:28px;background:rgba(255,255,255,.88)}</style></head><body>
<div id="root" data-composition-id="flow" data-duration="6">${card ? '<div id="card"></div>' : ""}</div>
<script src="/__rasanai/gsap.min.js"></script><script src="assets/rasan-camera/rasan-camera.js"></script>
<script>
  var tl = gsap.timeline({ paused: true });
  var cam = RasanCamera.stage("#root", { lens_mm: 35, tl: tl, duration: 6 });
  cam.flowGround({ src: "plate.png", tint: "${tint}", seed: 4 });
  ${card ? 'cam.place("#card", { x: ' + width / 2 + ", y: " + height / 2 + ', z: 0 }); cam.shadowLadder("#card", { elevation: 3 });' : ""}
  cam.plateTransition({ at: 4.5, src: "plate2.png", duration: 1.0 });
  window.__timelines = { flow: tl };
  window.__seek = function (T) { tl.pause(); tl.seek(T, false); return true; };
  window.__ready = Promise.all(["plate.png", "plate2.png"].map(function (s) { var i = new Image(); i.src = s; return i.decode(); }));
</script></body></html>`);
  if (!process.env.RASANAI_GL) process.env.RASANAI_GL = "cpu";
  const srv = await serve(dir);
  const b = await launch({ width, height, timeoutMs: 120000 });
  const shots = [];
  try {
    await b.open(`${srv.url}/flow.html`);
    await b.eval("window.__ready.then(function () { return true; })", { await: true });
    const settle = () => b.eval("new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(function () { setTimeout(function () { r(true); }, 80); }); }); })", { await: true });
    await b.eval("window.__seek(0.01)"); await settle();
    for (const t of times) {
      await b.eval("window.__seek(2.2)"); await settle(); // reach every frame from somewhere else
      await b.eval(`window.__seek(${t})`); await settle();
      const png = await b.screenshot();
      shots.push(png);
      if (keep) fs.writeFileSync(path.join(dir, `t${t.toFixed(2)}.png`), png);
    }
    return { shots, times, errors: b.logs.filter((l) => /exception|error/i.test(l)).slice(0, 5), budget: await b.eval("cam.budget()") };
  } finally { await b.close(); await srv.close(); }
}

export default async function ({ ok, node, tmp, quick }) {
  const T = path.join(tmp, "plates-w13");
  fs.mkdirSync(T, { recursive: true });
  const KINSO = ["#e8693f", "#f2b9a0", "#f7f1ea", "#7fb0ab"], SOVRA = ["#05030a", "#1d0b45", "#5b23c4", "#a57cff", "#efe6ff"];

  // ---- the recipe
  const rc = json(node("art.mjs", ["recipe", "--palette", KINSO.join(","), "--ground", "#f7f1ea", "--variant", "vortex", "--aspect", "9:16"]));
  ok("plates: recipe orders the ramp warm, ground, cool (Kinso: coral, peach, cream, sage) and the prompt carries the variant, the palette in words, the vertical frame and no text/objects/logos", rc.ok && rc.ramp.join() === KINSO.join() && /flowing organic shapes, soft gradients, minimal composition/.test(rc.prompt) && /vortex/.test(rc.prompt) && /coral/.test(rc.prompt) && /sage/.test(rc.prompt) && /vertical/.test(rc.prompt) && /No text[^.]*no objects[^.]*no logos/.test(rc.prompt) && !/#[0-9a-f]{6}/i.test(rc.prompt), JSON.stringify(rc).slice(0, 400));
  const rd = json(node("art.mjs", ["recipe", "--palette", SOVRA.slice().reverse().join(","), "--ground", "#05030a"]));
  ok("plates: a dark ground starts the ramp and the rest climb by lightness (light grows out of the dark)", rd.ramp && rd.ramp.join() === SOVRA.join(), JSON.stringify(rd.ramp));

  // ---- the palette lock: a rainbow through treat --op gradient-map lands on the ramp only
  const rb = path.join(T, "rainbow.png");
  spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=1", "-frames:v", "1", rb]);
  const lk = path.join(T, "locked.png");
  const tr = node("art.mjs", ["treat", "--in", rb, "--out", lk, "--op", "gradient-map", "--colors", SOVRA.join(","), "--dither", "1.5"]);
  const wl = tr.status === 0 ? offRamp(pixels(lk), SOVRA) : 999;
  ok("plates: the gradient map is the palette lock (a rainbow test card comes out within 2 RGB steps of the ramp's path, no other hue)", tr.status === 0 && wl <= 2, `worst ${wl.toFixed ? wl.toFixed(2) : wl}`);

  // ---- the procedural plate
  const p1 = path.join(T, "kinso-fold.png");
  const pr = node("art.mjs", ["plate", "--out", p1, "--palette", KINSO.join(","), "--ground", "#f7f1ea", "--variant", "fold", "--aspect", "16:9", "--width", "640", "--engine", "procedural", "--grain", "0", "--seed", "3"]);
  const pj = json(pr);
  if (!pj.ok && /Chrome|chrome|browser/i.test(pr.stderr || "")) { console.log("skip  plates (procedural): no headless Chrome (" + String(pr.stderr).slice(0, 120) + ")"); return; }
  const img = pj.ok ? pixels(p1) : null;
  ok("plates: plate --engine procedural renders the plate headless at the asked size, with its sidecar (engine, ramp, lock)", pr.status === 0 && pj.engine === "procedural" && img && img.w === 640 && img.h === 360 && fs.existsSync(p1 + ".json") && pj.lock === "gradient-map", (pr.stderr || pr.stdout).slice(0, 300));
  if (img) {
    const wp = offRamp(img, pj.ramp);
    let lo = 255, hi = 0;
    for (let i = 0; i < img.d.length; i += 4) { const l = img.d[i] * 0.2126 + img.d[i + 1] * 0.7152 + img.d[i + 2] * 0.0722; lo = Math.min(lo, l); hi = Math.max(hi, l); }
    ok("plates: every pixel of the procedural plate is on the palette ramp (no off-palette hue), and it is not flat (a real field of light)", wp <= 2 && hi - lo > 40, `worst ${wp.toFixed(2)}, luma ${lo.toFixed(0)}..${hi.toFixed(0)}`);
    const p1b = path.join(T, "kinso-fold-b.png");
    node("art.mjs", ["plate", "--out", p1b, "--palette", KINSO.join(","), "--ground", "#f7f1ea", "--variant", "fold", "--aspect", "16:9", "--width", "640", "--engine", "procedural", "--grain", "0", "--seed", "3"]);
    const p1c = path.join(T, "kinso-fold-c.png");
    node("art.mjs", ["plate", "--out", p1c, "--palette", KINSO.join(","), "--ground", "#f7f1ea", "--variant", "fold", "--aspect", "16:9", "--width", "640", "--engine", "procedural", "--grain", "0", "--seed", "4"]);
    ok("plates: the same options draw the same bytes (two launches), and another seed draws another plate", fs.existsSync(p1b) && fs.readFileSync(p1).equals(fs.readFileSync(p1b)) && fs.existsSync(p1c) && !fs.readFileSync(p1).equals(fs.readFileSync(p1c)));
  }
  // a vertical plate
  const p2 = path.join(T, "sovra-vortex.png");
  const pv = json(node("art.mjs", ["plate", "--out", p2, "--palette", SOVRA.join(","), "--ground", "#05030a", "--variant", "vortex", "--aspect", "9:16", "--width", "360", "--engine", "procedural", "--seed", "2"]));
  const iv = pv.ok ? pixels(p2) : null;
  ok("plates: a 9:16 plate is vertical at the asked width", iv && iv.w === 360 && iv.h === 640, JSON.stringify(pv).slice(0, 200));

  // ---- make: an abstract row with image generation off is drawn procedurally (not a todo)
  const run = path.join(T, "run");
  fs.mkdirSync(path.join(run, "art"), { recursive: true });
  fs.writeFileSync(path.join(run, "art", "plan.json"), JSON.stringify({ version: 1, style: { palette: SOVRA, line_weight: "none", rendering: "soft light", lighting: "glow", avoid: "text" }, assets: [{ id: "ground", kind: "abstract", variant: "horizon", aspect: "16:9", ground: "#05030a", prompt: "the ground plate", treatments: [], used_by: ["film: ground"] }] }));
  const mk = spawnSync(process.execPath, [path.join(HERE, "art.mjs"), "make", "--run", run], { encoding: "utf8", env: { ...process.env, RASANAI_IMAGEGEN: "off" }, timeout: 300000 });
  const A = (() => { try { return JSON.parse(fs.readFileSync(path.join(run, "art", "assets.json"), "utf8")); } catch { return {}; } })();
  const ga = (A.assets || []).find((a) => a.id === "ground");
  ok("plates: art.mjs make draws an `abstract` row procedurally when image generation is off (an asset, not a todo) and check passes", mk.status === 0 && ga && ga.source === "procedural" && ga.width === 1920 && !(A.todo || []).length && node("art.mjs", ["check", "--run", run]).status === 0, (mk.stderr || mk.stdout).slice(0, 300));

  // ---- flowGround + plateTransition: alive, seek-safe, byte-identical across launches
  if (quick) { console.log("note  plates (flowGround): the double render is skipped under --quick (about 15 s)"); return; }
  const g1 = path.join(T, "ground.png"), g2 = path.join(T, "through.png");
  node("art.mjs", ["plate", "--out", g1, "--palette", KINSO.join(","), "--ground", "#f7f1ea", "--variant", "fold", "--calm", "0.5", "--width", "960", "--engine", "procedural", "--seed", "5"]);
  node("art.mjs", ["plate", "--out", g2, "--palette", KINSO.join(","), "--ground", "#f7f1ea", "--variant", "vortex", "--width", "960", "--engine", "procedural", "--seed", "6"]);
  const times = [0.4, 1.6, 3.0, 4.2, 4.5, 4.8, 5.8];
  try {
    const a = await flowStrip(path.join(T, "flow-a"), { plate: g1, plate2: g2, times, width: 960, height: 540 });
    const b = await flowStrip(path.join(T, "flow-b"), { plate: g1, plate2: g2, times, width: 960, height: 540 });
    ok("plates (flowGround): the page builds with no console errors and counts the plate transition in the budget", !a.errors.length && a.budget && a.budget.plateTransition === 1, a.errors.join(" | ") + JSON.stringify(a.budget));
    ok("plates (flowGround): the living ground changes over time (consecutive frames differ) and the plate covers the cut", a.shots.every((p, i) => i === 0 || !p.equals(a.shots[i - 1])));
    ok("plates (flowGround): every frame is byte-identical across two browser launches (the double render)", a.shots.every((p, i) => p.equals(b.shots[i])), times.filter((_, i) => !a.shots[i].equals(b.shots[i])).join(","));
  } catch (e) { ok("plates (flowGround): the strip rendered", false, String(e && e.message || e).slice(0, 300)); }
}
