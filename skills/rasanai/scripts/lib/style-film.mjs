// The style diagnostic film and the side-by-side compare, drawn from a style's own files (palette, type, radii, motion contract,
// grammar) by one paused GSAP timeline in headless Chrome (lib/cdp.mjs, RASANAI_GL=cpu for software GL), seeked and captured frame
// by frame the way regression.mjs does, then encoded with ffmpeg. Local procedural material only: no media, no network but fonts.
// Chrome or ffmpeg missing is reported as "not run: <reason>", never as passed. Zero dependencies.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gsapInline } from "./common.mjs";
import { launch } from "./cdp.mjs";
import { decodePng, colourShares } from "./png.mjs";
import { loadStyle, rh } from "./custom-style.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const W = 1280, H = 720, SCALE = 0.75; // layout size and the capture scale (960 x 540 frames)
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ---------------------------------------------------------------- prerequisites (never throw, never exit)
let chromeCache;
export function chromeStatus() {
  if (chromeCache) return chromeCache;
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", `import { chromePath } from ${JSON.stringify(pathToFileURL(path.join(HERE, "common.mjs")).href)}; console.log(chromePath());`], { encoding: "utf8", timeout: 60000, env: process.env });
  const p = (r.stdout || "").trim().split("\n").pop();
  if (r.status === 0 && p && fs.existsSync(p)) return (chromeCache = { ok: true, path: p });
  return (chromeCache = { ok: false, reason: r.status === 0 ? `Chrome path ${p} does not exist` : ((r.stderr || "").trim().split("\n").pop() || "no headless Chrome found").replace(/^rasanai:\s*/, "") });
}
export function ffmpegStatus() {
  const r = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" });
  return r.error || r.status !== 0 ? { ok: false, reason: "ffmpeg not found on PATH" } : { ok: true };
}

// ---------------------------------------------------------------- the film page
export const SEGMENTS = [
  { id: "title", at: 0, to: 0.17, label: "title" },
  { id: "hero", at: 0.17, to: 0.38, label: "hero object" },
  { id: "camera", at: 0.38, to: 0.56, label: "camera move" },
  { id: "sig1", at: 0.56, to: 0.68, label: "signature movement 1" },
  { id: "sig2", at: 0.68, to: 0.78, label: "signature movement 2" },
  { id: "transition", at: 0.78, to: 0.86, label: "transition" },
  { id: "end", at: 0.86, to: 1, label: "end card" },
];
export const clampDuration = (d) => Math.min(30, Math.max(15, Number(d) || 20));

function filmParams(S) {
  const R = Object.fromEntries(["canvas", "ink", "accent", "support", "surface", "muted"].map((r) => [r, rh(S.B, r)])), rec = (S.recipe && S.recipe.recipe) || {}, st = S.meta.settings || {}, g = S.grammar || {};
  const mc = (S.blend && S.blend.motion_contract) || {};
  const ease = (mc.easing && mc.easing) || {};
  const techs = (g.techniques || []).filter((t) => t && t.id !== "word-choreo");
  return {
    name: S.meta.name, revision: S.meta.revision,
    c: { canvas: R.canvas, ink: R.ink, accent: R.accent, support: R.support || R.accent, surface: R.surface || R.canvas, muted: R.muted || R.ink },
    display: S.B.fonts.display.family, body: (S.B.fonts.body || S.B.fonts.display).family,
    dWeight: Number((rec.fonts && rec.fonts.displayWeight) || 700), radius: Math.min(80, Number((S.B.radii && (S.B.radii.md ?? Object.values(S.B.radii)[0])) ?? rec.radius ?? 8) || 0),
    tempo: (st.pacing && st.pacing.tempo) || 1, intensity: (st.motion && st.motion.intensity) || 1, density: st.shape_density || rec.density || "balanced",
    eIn: ease.enter || "power3.out", eMove: ease.move || "power2.inOut", eOut: ease.exit || "power2.in", stagger: (Number(mc.stagger_ms) || 70) / 1000,
    tech1: (techs[0] && techs[0].name) || "signature entrance", tech2: (techs[1] && techs[1].name) || "signature landing",
    transition: ((g.transitions || [])[0]) || "wipe", grammar: g.id || "grammar", surface: rec.surface || "flat", texture: rec.texture || "none",
    stroke: Number((rec.stroke && rec.stroke.width) || 0), feel: ((S.blend && S.blend.name) || S.meta.name),
  };
}

export function filmHtml(S, duration, { fonts = true } = {}) {
  const P = filmParams(S), D = clampDuration(duration);
  const seg = Object.fromEntries(SEGMENTS.map((s) => [s.id, { a: +(s.at * D).toFixed(3), b: +(s.to * D).toFixed(3) }]));
  const fam = [...new Set([P.display, P.body])].map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@400;700;800`).join("&");
  const nDots = { airy: 7, balanced: 14, dense: 28 }[P.density] || 14;
  return `<!doctype html><html><head><meta charset="utf-8"><title>style test: ${esc(P.name)}</title>${fonts ? `<link href="https://fonts.googleapis.com/css2?${fam}&display=swap" rel="stylesheet">` : ""}
<style>*{margin:0;box-sizing:border-box}html,body{width:${W}px;height:${H}px;overflow:hidden;background:${P.c.canvas}}
#stage{position:relative;width:${W}px;height:${H}px;background:${P.c.canvas};color:${P.c.ink};font-family:"${P.body}",sans-serif;overflow:hidden}
.a{position:absolute}#world{position:absolute;inset:0;transform-origin:50% 55%}
h1,h2{font-family:"${P.display}",sans-serif;font-weight:${P.dWeight};line-height:1;letter-spacing:-0.02em}
.w{display:inline-block;margin-right:.28em}.dot{border-radius:50%}
#hud{left:28px;bottom:20px;font-size:15px;color:${P.c.muted};letter-spacing:.08em;text-transform:uppercase}
#cap{right:28px;top:20px;font-size:15px;color:${P.c.muted};letter-spacing:.08em;text-transform:uppercase;text-align:right}
.chip{height:54px;padding:0 24px;display:flex;align-items:center;font-size:24px;background:${P.c.surface};border:${Math.max(P.stroke, 2)}px solid ${P.c.ink};border-radius:${P.radius}px;color:${P.c.ink}}
</style></head><body><div id="stage" data-width="${W}" data-height="${H}">
<div id="dots"></div>
<div id="world">
  <h1 id="title" class="a" style="left:96px;top:236px;width:1080px;font-size:132px">${P.name.split(/\s+/).map((w) => `<span class="w">${esc(w)}</span>`).join("")}</h1>
  <div id="rule" class="a" style="left:96px;top:420px;width:360px;height:10px;background:${P.c.accent};border-radius:${Math.min(P.radius, 5)}px;transform-origin:0 50%"></div>
  <div id="sub" class="a" style="left:96px;top:450px;font-size:26px;color:${P.c.muted}">${esc(P.feel)} · ${esc(P.display)} / ${esc(P.body)}</div>
  <div id="hero" class="a" style="left:420px;top:150px;width:440px;height:360px;background:${P.c.surface};border:${Math.max(P.stroke, 3)}px solid ${P.c.ink};border-radius:${P.radius}px;box-shadow:12px 12px 0 ${P.c.support}">
    <div id="orb" class="a dot" style="left:130px;top:70px;width:180px;height:180px;background:${P.c.accent}"></div>
    <div id="ring" class="a dot" style="left:100px;top:40px;width:240px;height:240px;border:6px solid ${P.c.support}"></div>
    <div id="hl" class="a" style="left:40px;top:292px;font-family:'${P.display}';font-weight:${P.dWeight};font-size:34px">${esc(P.name)}</div>
  </div>
  <div id="rows" class="a" style="left:900px;top:190px;width:300px;display:flex;flex-direction:column;gap:20px"><div class="chip r">${esc(P.tech1).slice(0, 22)}</div><div class="chip r">${esc(P.grammar).slice(0, 22)}</div><div class="chip r">${esc(P.surface)} · ${esc(P.texture)}</div></div>
  <div id="stamp" class="a" style="left:690px;top:112px;width:170px;height:78px;background:${P.c.accent};color:${P.c.canvas};border-radius:${Math.min(P.radius, 12)}px;display:flex;align-items:center;justify-content:center;font-family:'${P.display}';font-weight:${P.dWeight};font-size:34px;transform-origin:50% 50%">${esc(P.tech2).slice(0, 10)}</div>
</div>
<div id="wipe" class="a" style="left:0;top:0;width:${W}px;height:${H}px;background:${P.c.accent};transform:translateX(-${W + 40}px)"></div>
<div id="end" class="a" style="left:0;top:0;width:${W}px;height:${H}px;background:${P.c.canvas};opacity:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px">
  <h2 id="endname" style="font-size:112px;text-align:center">${esc(P.name)}</h2><div id="endrule" style="width:260px;height:10px;background:${P.c.accent};border-radius:${Math.min(P.radius, 5)}px;transform-origin:50% 50%"></div>
  <div style="font-size:26px;color:${P.c.muted}">revision ${esc(P.revision)} · ${P.c.canvas} ${P.c.ink} ${P.c.accent}</div></div>
<div id="hud" class="a">style test · ${esc(P.name)} · ${esc(P.revision)}</div><div id="cap" class="a"></div>
</div>
${gsapInline()}
<script>
var P=${JSON.stringify({ tempo: P.tempo, intensity: P.intensity, eIn: P.eIn, eMove: P.eMove, eOut: P.eOut, stagger: P.stagger, nDots, c: P.c })};
var SEG=${JSON.stringify(seg)}, DUR=${D};
// seeded procedural dots (the same on every seek)
(function(){var s=7,r=function(){s=(s*16807)%2147483647;return s/2147483647},h="";for(var i=0;i<P.nDots;i++){var z=8+r()*26;h+='<div class="a dot" style="left:'+Math.round(r()*1240)+'px;top:'+Math.round(r()*680)+'px;width:'+z+'px;height:'+z+'px;background:'+(i%3?P.c.support:P.c.muted)+';opacity:.28"></div>'}document.getElementById("dots").innerHTML=h})();
var d=function(x,win){return Math.min(x/P.tempo,win)};
var tl=gsap.timeline({paused:true});
function cap(t,txt){tl.set("#cap",{textContent:txt},t)}
// title
var T=SEG.title,tw=T.b-T.a;
cap(0,"title");
tl.fromTo(".w",{y:70,opacity:0,rotation:3},{y:0,opacity:1,rotation:0,duration:d(.8,tw),ease:P.eIn,stagger:P.stagger/P.tempo},T.a+.1);
tl.fromTo("#rule",{scaleX:0},{scaleX:1,duration:d(.6,tw),ease:P.eIn},T.a+.5);
tl.fromTo("#sub",{opacity:0,x:-30},{opacity:1,x:0,duration:d(.6,tw),ease:P.eIn},T.a+.7);
tl.to("#title,#rule,#sub",{x:-1400,duration:d(.7,SEG.hero.b-SEG.hero.a),ease:P.eOut},SEG.hero.a);
// hero object
var Hh=SEG.hero,hw=Hh.b-Hh.a;
cap(Hh.a,"hero object");
tl.fromTo("#hero",{scale:.6,opacity:0,y:60},{scale:1,opacity:1,y:0,duration:d(.9,hw),ease:P.eIn},Hh.a+.3);
tl.fromTo("#orb",{scale:0},{scale:1,duration:d(.7,hw),ease:P.eIn},Hh.a+.6);
tl.fromTo("#ring",{scale:.4,opacity:0,rotation:-90},{scale:1,opacity:1,rotation:0,duration:d(.9,hw),ease:P.eMove},Hh.a+.7);
tl.fromTo("#hl",{opacity:0,y:16},{opacity:1,y:0,duration:d(.5,hw),ease:P.eIn},Hh.a+1);
// camera move: a push and a drift on the whole world
var C=SEG.camera;
cap(C.a,"camera move");
tl.fromTo("#world",{scale:1,x:0,y:0},{scale:1+.14*P.intensity,x:-60*P.intensity,y:-18*P.intensity,duration:C.b-C.a,ease:P.eMove},C.a);
// signature 1: staggered entrance
var S1=SEG.sig1,s1=S1.b-S1.a;
cap(S1.a,"signature movement 1: ${esc(P.tech1).replace(/"/g, "'")}");
tl.fromTo(".r",{x:260,opacity:0},{x:0,opacity:1,duration:d(.6,s1),ease:P.eIn,stagger:P.stagger/P.tempo},S1.a);
// signature 2: the landing stamp (squash and settle)
var S2=SEG.sig2,s2=S2.b-S2.a;
cap(S2.a,"signature movement 2: ${esc(P.tech2).replace(/"/g, "'")}");
tl.fromTo("#stamp",{scale:1.9,opacity:0,rotation:-14},{scale:1,opacity:1,rotation:-4,duration:d(.3,s2),ease:P.eIn},S2.a);
tl.to("#stamp",{scale:.94,duration:.08,ease:"power2.out"},S2.a+d(.3,s2));
tl.to("#stamp",{scale:1,duration:.14,ease:"power2.out"},S2.a+d(.3,s2)+.08);
// transition: a panel sweeps across and the end card appears under it
var Tr=SEG.transition,tr=Tr.b-Tr.a,mid=Tr.a+tr/2;
cap(Tr.a,"transition: ${esc(P.transition).replace(/"/g, "'")}");
tl.fromTo("#wipe",{x:-${W + 40}},{x:0,duration:tr/2,ease:"power2.in"},Tr.a);
tl.set("#end",{opacity:1},mid);
tl.to("#wipe",{x:${W + 40},duration:tr/2,ease:"power2.out"},mid);
// end card
var E=SEG.end,ew=E.b-E.a;
tl.set("#cap",{textContent:"end card"},E.a);
tl.fromTo("#endname",{y:40,opacity:0},{y:0,opacity:1,duration:d(.7,ew),ease:P.eIn},E.a+.1);
tl.fromTo("#endrule",{scaleX:0},{scaleX:1,duration:d(.6,ew),ease:P.eIn},E.a+.5);
tl.set({},{},DUR);
window.__tl=tl;window.__seek=function(t){tl.time(Math.min(Math.max(t,0),DUR),false)};window.__dur=tl.duration();
</script></body></html>`;
}

// ---------------------------------------------------------------- capture
async function session(S, duration, work) {
  const D = clampDuration(duration);
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TMPDIR || "/tmp"), "style-film-"));
  const file = path.join(dir, "film.html");
  fs.writeFileSync(file, filmHtml(S, D));
  const b = await launch({ width: W, height: H, scale: SCALE, timeoutMs: 60000 });
  try {
    await b.open(pathToFileURL(file).href, { waitMs: 30000 });
    const faces = await b.eval(`(function(){var wait=function(ms){return new Promise(function(r){setTimeout(r,ms)})};var f=document.fonts&&document.fonts.ready?document.fonts.ready:Promise.resolve();return Promise.race([f,wait(6000)]).then(function(){return wait(150)}).then(function(){return Array.from(document.fonts||[]).filter(function(x){return x.status==="loaded"}).map(function(x){return x.family.replace(/["']/g,"")})})})()`, { await: true });
    const seek = async (t) => { await b.eval(`__seek(${t})`); await b.eval("new Promise(function(r){requestAnimationFrame(function(){requestAnimationFrame(r)})})", { await: true }); };
    return await work({ b, seek, shot: async (t) => { await seek(t); return b.screenshot(); }, faces, D });
  } finally {
    await b.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// a labelled sheet from PNG buffers: cells[{png, label}], columns, cell size, a header line
async function sheet(b, { cells, cols, cw, ch, title, cols_labels = null, pad = 14 }) {
  const urls = cells.map((c) => "data:image/png;base64," + c.png.toString("base64"));
  const labels = cells.map((c) => c.label || "");
  const head = 74 + (cols_labels ? 40 : 0);
  const rows = Math.ceil(cells.length / cols);
  const out = await b.eval(`(async function(urls,labels,cols,cw,ch,pad,head,title,cl){
    function L(u){return new Promise(function(r){var i=new Image();i.onload=function(){r(i)};i.src=u})}
    var im=await Promise.all(urls.map(L)), rows=Math.ceil(urls.length/cols);
    var c=document.createElement("canvas"); c.width=cols*cw+(cols+1)*pad; c.height=head+rows*(ch+34+pad)+pad; var x=c.getContext("2d");
    x.fillStyle="#15171a"; x.fillRect(0,0,c.width,c.height); x.fillStyle="#f2f2f2"; x.font="bold 30px Helvetica,Arial,sans-serif"; x.textBaseline="middle"; x.fillText(title,pad,36);
    if(cl){x.font="bold 26px Helvetica,Arial,sans-serif"; cl.forEach(function(t,k){x.fillStyle=k?"#7fd0ff":"#ffd37f"; x.fillText(t,pad+k*(cw+pad),head-26)})}
    im.forEach(function(i,k){var cx=pad+(k%cols)*(cw+pad), cy=head+Math.floor(k/cols)*(ch+34+pad); x.drawImage(i,cx,cy,cw,ch); x.fillStyle="#cfd3d8"; x.font="20px Helvetica,Arial,sans-serif"; x.fillText(labels[k],cx,cy+ch+20)});
    return c.toDataURL("image/png"); })(${JSON.stringify(urls)},${JSON.stringify(labels)},${cols},${cw},${ch},${pad},${head},${JSON.stringify(title)},${JSON.stringify(cols_labels)})`, { await: true });
  void rows;
  return Buffer.from(out.split(",")[1], "base64");
}
const MATCH = [{ f: 0.12, n: "title" }, { f: 0.32, n: "hero object" }, { f: 0.54, n: "camera move (end)" }, { f: 0.76, n: "both signature movements landed" }, { f: 0.97, n: "end card" }];

// compare: the same film positions of two styles, side by side, each column labelled with the style and revision
export async function compareStyles(baseDir, candDir, outFile, { duration = 20 } = {}) {
  const A = loadStyle(baseDir), B = loadStyle(candDir);
  const ch = chromeStatus();
  if (!ch.ok) return { ok: false, status: "not run", reason: ch.reason };
  const D = clampDuration(duration);
  const grab = (S) => session(S, D, async ({ shot, faces }) => { const o = []; for (const m of MATCH) o.push(await shot(+(m.f * D).toFixed(3))); return { frames: o, faces }; });
  const a = await grab(A), c = await grab(B);
  const cells = [];
  MATCH.forEach((m, i) => { const t = (m.f * D).toFixed(1); cells.push({ png: a.frames[i], label: `ORIGINAL · t=${t}s · ${m.n}` }, { png: c.frames[i], label: `MODIFIED · t=${t}s · ${m.n}` }); });
  const outDir = path.dirname(path.resolve(outFile));
  fs.mkdirSync(outDir, { recursive: true });
  const b = await launch({ width: 400, height: 300, timeoutMs: 60000 });
  let png;
  try {
    await b.open("about:blank");
    png = await sheet(b, { cells, cols: 2, cw: 640, ch: 360, title: `Style compare · matched film positions`, cols_labels: [`ORIGINAL: ${A.meta.name} (${A.meta.revision})`, `MODIFIED: ${B.meta.name} (${B.meta.revision})`] });
  } finally { await b.close(); }
  fs.writeFileSync(path.resolve(outFile), png);
  const stem = path.resolve(outFile).replace(/\.png$/i, "");
  const dirOf = path.dirname(stem);
  fs.writeFileSync(path.join(dirOf, "original.png"), a.frames[3]);
  fs.writeFileSync(path.join(dirOf, "modified.png"), c.frames[3]);
  return { ok: true, status: "ok", out: path.resolve(outFile), original: path.join(dirOf, "original.png"), modified: path.join(dirOf, "modified.png"), positions: MATCH.map((m) => +(m.f * D).toFixed(2)), labels: { original: `${A.meta.name} (${A.meta.revision})`, modified: `${B.meta.name} (${B.meta.revision})` }, faces: { original: a.faces, modified: c.faces } };
}

// test: the 15-30 s diagnostic film -> contact strip + MP4 + test-report.json in outDir
export async function testStyle(styleDir, outDir, { duration = 20, fps = 12 } = {}) {
  const S = loadStyle(styleDir);
  const D = clampDuration(duration);
  const out = path.resolve(outDir);
  fs.mkdirSync(out, { recursive: true });
  const P = filmParams(S);
  const rep = { style: S.meta.id, name: S.meta.name, revision: S.meta.revision, duration_s: D, fps, size: `${Math.round(W * SCALE)}x${Math.round(H * SCALE)}`, segments: SEGMENTS.map((s) => ({ id: s.id, label: s.label, from_s: +(s.at * D).toFixed(2), to_s: +(s.to * D).toFixed(2) })), traits: { palette: P.c, display: P.display, body: P.body, radius_px: P.radius, tempo: P.tempo, intensity: P.intensity, density: P.density, grammar: P.grammar, transition: P.transition, signature_movements: [P.tech1, P.tech2] }, strip: null, mp4: null };
  const ch = chromeStatus();
  const ff = ffmpegStatus();
  if (!ch.ok) {
    rep.strip = `not run: ${ch.reason}`; rep.mp4 = `not run: ${ch.reason}`;
    fs.writeFileSync(path.join(out, "test-report.json"), JSON.stringify(rep, null, 2) + "\n");
    return { ok: false, report: rep, out };
  }
  const mp4 = path.join(out, `test-${Math.round(D)}s.mp4`);
  const stripFile = path.join(out, "contact-strip.png");
  let enc = null, encDone = null;
  if (ff.ok) {
    const args = ["-loglevel", "error", "-y", "-f", "image2pipe", "-framerate", String(fps), "-i", "-", "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", "-movflags", "+faststart", mp4];
    enc = spawn("ffmpeg", args, { stdio: ["pipe", "ignore", "pipe"] });
    let err = "";
    enc.stderr.on("data", (d) => { err += d; });
    encDone = new Promise((res) => { enc.on("close", (code) => res({ code, err })); enc.on("error", (e) => res({ code: -1, err: String(e.message) })); });
    enc.stdin.on("error", () => {});
  }
  const t0 = Date.now();
  const R = await session(S, D, async ({ b, seek, shot, faces }) => {
    // deterministic seeking: A, B, A gives the same frame at A
    const tA = +(0.3 * D).toFixed(3), tB = +(0.7 * D).toFixed(3);
    const a1 = await shot(tA); await shot(tB); const a2 = await shot(tA);
    const frames = Math.round(D * fps);
    const strip = [];
    const stripTimes = SEGMENTS.map((s) => +(((s.at + s.to) / 2) * D).toFixed(3)).concat([+(0.99 * D).toFixed(3)]);
    let lastEnd = null;
    for (let i = 0; i < frames; i++) {
      const png = await shot(i / fps);
      if (enc && !enc.stdin.destroyed) { if (!enc.stdin.write(png)) await new Promise((r) => enc.stdin.once("drain", r)); }
      if (i === frames - 1) lastEnd = png;
    }
    if (enc) enc.stdin.end();
    for (const t of stripTimes) strip.push({ png: await shot(t), label: `t=${t.toFixed(1)}s` });
    const sb = await launch({ width: 400, height: 300, timeoutMs: 60000 });
    let png;
    try { await sb.open("about:blank"); png = await sheet(sb, { cells: strip, cols: 4, cw: 480, ch: 270, title: `${S.meta.name} (${S.meta.revision}): style test film, ${D}s, one frame per segment` }); } finally { await sb.close(); }
    void seek; void b;
    return { deterministic: sha(a1) === sha(a2), strip: png, lastEnd, faces, firstFrame: a1 };
  });
  fs.writeFileSync(stripFile, R.strip);
  rep.strip = { file: path.basename(stripFile), status: "ok" };
  rep.seek_deterministic = R.deterministic;
  rep.fonts_loaded = R.faces;
  rep.render_seconds = +((Date.now() - t0) / 1000).toFixed(1);
  try {
    const img = decodePng(R.lastEnd);
    const cs = colourShares(img, { canvas: P.c.canvas, ink: P.c.ink, accent: P.c.accent }, { tol: 40, step: 3 });
    rep.end_frame_palette_shares = Object.fromEntries(Object.entries(cs.share).map(([k, v]) => [k, +v.toFixed(3)]));
    rep.end_frame_off_palette = +cs.off.toFixed(3);
  } catch (e) { rep.end_frame_palette_shares = `not measured: ${e.message}`; }
  if (!ff.ok) rep.mp4 = `not run: ${ff.reason}`;
  else {
    const r = await encDone;
    if (r.code !== 0) rep.mp4 = `not run: ffmpeg failed (${(r.err || "").trim().split("\n").pop() || r.code})`;
    else {
      const pr = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=width,height,nb_frames", "-of", "json", mp4], { encoding: "utf8" });
      let info = null;
      try { info = JSON.parse(pr.stdout); } catch {}
      const dur = info && Number(info.format && info.format.duration);
      rep.mp4 = { file: path.basename(mp4), status: Number.isFinite(dur) && Math.abs(dur - D) < 0.5 ? "ok" : "check", bytes: fs.statSync(mp4).size, duration_s: Number.isFinite(dur) ? +dur.toFixed(2) : null, probe: pr.status === 0 ? "ffprobe" : "not run: ffprobe unavailable" };
    }
  }
  fs.writeFileSync(path.join(out, "test-report.json"), JSON.stringify(rep, null, 2) + "\n");
  const mp4ok = rep.mp4 && typeof rep.mp4 === "object" && rep.mp4.status === "ok";
  return { ok: mp4ok && R.deterministic, report: rep, out };
}
