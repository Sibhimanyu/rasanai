// Deterministic render regression: seeks a paused timeline in headless Chrome (lib/cdp.mjs) and checks
//   1. A-B-A seeks give an identical frame at A (repeat), and a second cold browser gives the same pixels (cold),
//   2. the frame is not blank, no text is clipped by the frame, no image is missing, no console error was logged,
//   3. against a stored baseline PNG by a bounded perceptual metric (mean absolute channel difference, 0..1).
// A missing baseline is never a pass. A scene that cannot be rendered is "could-not-run" (exit 1), not green.
// The metric runs inside Chrome on canvases, so there is no image library.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { launch } from "./cdp.mjs";

const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

export function readManifest(file) {
  const m = JSON.parse(fs.readFileSync(file, "utf8"));
  const problems = [];
  if (!Array.isArray(m.scenes) || !m.scenes.length) problems.push("manifest has no scenes");
  for (const s of m.scenes || []) {
    if (!s.id || !s.file) problems.push(`scene ${s.id || "?"}: id and file are required`);
    if (!Array.isArray(s.times) || !s.times.length || s.times.some((t) => !(t >= 0))) problems.push(`scene ${s.id}: times must be non-negative seconds`);
  }
  return { manifest: m, dir: path.dirname(path.resolve(file)), problems };
}

const baselinePath = (dir, id, t) => path.join(dir, `${id}-${String(t).replace(".", "p")}.png`);

// runs in the page: every timeline the scene registered, seek-safe
const SEEK = `(function(){ window.__rg = function(t){ var tls = window.__timelines || {}; var k = Object.keys(tls); if (!k.length) throw new Error("no window.__timelines"); k.forEach(function(n){ tls[n].time(t, false); }); return k.length; }; return true; })()`;
const PROBE = `(function(){
  var vw = innerWidth, vh = innerHeight, clipped = [], missing = [];
  var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  var n; while ((n = walker.nextNode())) {
    if (!n.nodeValue.trim()) continue;
    var r = document.createRange(); r.selectNodeContents(n); var b = r.getBoundingClientRect();
    if (!b.width) continue;
    var cs = getComputedStyle(n.parentElement); if (cs.visibility === "hidden" || +cs.opacity === 0) continue;
    if (b.left < -1 || b.top < -1 || b.right > vw + 1 || b.bottom > vh + 1) clipped.push(n.nodeValue.trim().slice(0, 40));
  }
  Array.prototype.forEach.call(document.images, function(im){ if (!im.complete || !im.naturalWidth) missing.push(im.getAttribute("src")); });
  return { text: document.body.innerText, clipped: clipped, missing: missing };
})()`;

// mean absolute difference over RGB between two PNG data URLs, 0..1, plus the share of non-flat pixels
const COMPARE = `(async function(a, b){
  function load(u){ return new Promise(function(res, rej){ var i = new Image(); i.onload = function(){ res(i); }; i.onerror = function(){ rej(new Error("png did not load")); }; i.src = u; }); }
  var A = await load(a), B = b ? await load(b) : null;
  function px(i){ var c = document.createElement("canvas"); c.width = i.width; c.height = i.height; var x = c.getContext("2d"); x.drawImage(i, 0, 0); return x.getImageData(0, 0, c.width, c.height); }
  var pa = px(A), flat = 0, n = pa.data.length / 4, r0 = pa.data[0], g0 = pa.data[1], b0 = pa.data[2];
  for (var i = 0; i < pa.data.length; i += 4) if (Math.abs(pa.data[i]-r0) + Math.abs(pa.data[i+1]-g0) + Math.abs(pa.data[i+2]-b0) < 6) flat++;
  var out = { w: A.width, h: A.height, flat: flat / n };
  if (B) {
    if (A.width !== B.width || A.height !== B.height) { out.size_mismatch = true; return out; }
    var pb = px(B), s = 0;
    for (var j = 0; j < pa.data.length; j += 4) s += Math.abs(pa.data[j]-pb.data[j]) + Math.abs(pa.data[j+1]-pb.data[j+1]) + Math.abs(pa.data[j+2]-pb.data[j+2]);
    out.metric = s / (n * 3 * 255);
  }
  return out;
})`;

async function frames(b, url, times, { warmupMs = 150 } = {}) {
  await b.open(url, { waitMs: 20000 });
  await b.eval(SEEK);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await sleep(warmupMs);
  const shot = async (t) => { await b.eval(`__rg(${t})`); await b.eval("new Promise(function(r){requestAnimationFrame(function(){requestAnimationFrame(r)})})", { await: true }); return b.screenshot(); };
  return { shot, probe: () => b.eval(PROBE) };
}

export async function checkScene(scene, { dir, width, height, baselinesDir, update = false, outDir }) {
  const rows = [], notes = [];
  const base = { scene: scene.id };
  const file = path.resolve(dir, scene.file);
  const threshold = scene.threshold ?? 0.04;
  const row = (t, o) => rows.push({ scene: scene.id, timestamp_s: t, repeat_identical: null, metric: null, threshold, console_errors: [], actual: null, baseline: null, status: "ok", ...o });
  if (!fs.existsSync(file)) { row(null, { status: "could-not-run", detail: `missing file ${scene.file}` }); return rows; }
  const url = "file://" + file;
  let b1, b2;
  try {
    b1 = await launch({ width, height, timeoutMs: 30000 });
    const f = await frames(b1, url, scene.times);
    const probe = await f.probe();
    const ts = scene.times;
    const first = {};
    // A, B, A for each consecutive pair of timestamps, then a cold render in a second browser
    const A = ts[0], B = ts[ts.length - 1];
    const a1 = await f.shot(A); await f.shot(B); const a2 = await f.shot(A);
    const seekRepeat = sha(a1) === sha(a2);
    b2 = await launch({ width, height, timeoutMs: 30000 });
    const f2 = await frames(b2, url, ts);
    const cold = await f2.shot(A);
    const coldSame = sha(cold) === sha(a1);
    for (const t of ts) {
      const png = t === A ? a1 : await f.shot(t);
      const dataUrl = "data:image/png;base64," + png.toString("base64");
      const bp = baselinePath(baselinesDir, scene.id, t);
      let baseUrl = null;
      if (update) { fs.mkdirSync(path.dirname(bp), { recursive: true }); fs.writeFileSync(bp, png); baseUrl = dataUrl; }
      else if (fs.existsSync(bp)) baseUrl = "data:image/png;base64," + fs.readFileSync(bp).toString("base64");
      const cmp = await b1.eval(`${COMPARE}(${JSON.stringify(dataUrl)}, ${JSON.stringify(baseUrl)})`, { await: true });
      const r = { repeat_identical: t === A ? seekRepeat && coldSame : true, metric: cmp.metric ?? null, actual: { sha256: sha(png).slice(0, 16), flat: +cmp.flat.toFixed(4), size: `${cmp.w}x${cmp.h}` }, baseline: baseUrl ? path.relative(dir, bp) : null, console_errors: b1.logs.slice() };
      let status = "ok", detail;
      if (b1.logs.some((l) => /^(error|exception)/.test(l))) { status = "console-error"; detail = b1.logs.find((l) => /^(error|exception)/.test(l)); }
      else if (t === A && !seekRepeat) { status = "nondeterministic"; detail = "A-B-A seek gave a different frame at A"; }
      else if (t === A && !coldSame) { status = "nondeterministic"; detail = "a cold render at A differs from the first render"; }
      else if (cmp.flat > 0.995) { status = "blank"; detail = `${(cmp.flat * 100).toFixed(1)}% of the frame is one flat colour`; }
      else if (probe.missing.length) { status = "missing-asset"; detail = probe.missing.join(", "); }
      else if (probe.clipped.length) { status = "clipped-text"; detail = probe.clipped.join(" | "); }
      else if (scene.expect_text && !probe.text.includes(scene.expect_text)) { status = "missing-text"; detail = `expected text "${scene.expect_text}" not found`; }
      else if (update) { status = "baseline-written"; }
      else if (!baseUrl) { status = "no-baseline"; detail = `no baseline ${path.relative(dir, bp)}; run "regression.mjs baseline" and review the new files`; }
      else if (cmp.size_mismatch) { status = "regression"; detail = "frame size differs from the baseline"; }
      else if (cmp.metric > threshold) { status = "regression"; detail = `metric ${cmp.metric.toFixed(4)} > threshold ${threshold}`; }
      row(t, { ...r, status, ...(detail ? { detail } : {}) });
    }
    if (scene.strip && !update) {
      try {
        const pngs = []; for (const t of scene.strip) pngs.push("data:image/png;base64," + (await f.shot(t)).toString("base64"));
        const sheet = await b1.eval(`(async function(urls){ function L(u){return new Promise(function(r){var i=new Image();i.onload=function(){r(i)};i.src=u})} var im=await Promise.all(urls.map(L)); var c=document.createElement("canvas"); c.width=im[0].width*im.length; c.height=im[0].height; var x=c.getContext("2d"); im.forEach(function(i,k){x.drawImage(i,k*i.width,0)}); return c.toDataURL("image/png"); })(${JSON.stringify(pngs)})`, { await: true });
        if (outDir) { fs.mkdirSync(outDir, { recursive: true }); fs.writeFileSync(path.join(outDir, `${scene.id}-strip.png`), Buffer.from(sheet.split(",")[1], "base64")); }
      } catch (e) { notes.push(`strip not written: ${e.message}`); }
    }
  } catch (e) {
    rows.length = 0;
    row(null, { status: "could-not-run", detail: String(e.message || e).split("\n")[0], console_errors: b1 ? b1.logs.slice() : [] });
  } finally {
    for (const b of [b1, b2]) if (b) try { await b.close(); } catch {}
  }
  return rows;
}

export const FAIL_STATUSES = new Set(["regression", "nondeterministic", "blank", "clipped-text", "missing-asset", "missing-text", "console-error"]);
export const UNABLE_STATUSES = new Set(["could-not-run", "no-baseline"]);

// exit code: 2 a true regression, 1 could not run (or nothing to compare against), 0 all good
export function verdict(rows) {
  if (rows.some((r) => FAIL_STATUSES.has(r.status))) return 2;
  if (rows.some((r) => UNABLE_STATUSES.has(r.status))) return 1;
  return 0;
}
