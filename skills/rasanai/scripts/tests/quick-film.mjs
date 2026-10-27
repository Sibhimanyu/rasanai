// quick-film: the opt-in single-HTML film prototype (quick-film.mjs, lib/quick-film.mjs, references/quick-film.md). A SYNTHETIC product-neutral
// 30 s three-beat fixture (title, a three-step mechanism, an end card, an accent, a wipe and a push, synthetic music + sfx) is scaffolded,
// checked, rendered to MP4 and promoted; A-B-A and cold seeks pass; planted defects (missing font, remote image, uncaught exception, blank
// cut, unseeded random, wall-clock, iframe, audio tag, secret, edited adapter, stateful render) are each caught BEFORE any render; out-of-scope
// briefs exit "needs-full-crew" and log an upgrade; ordinary films are untouched. Chrome / ffmpeg cases print "not run", never ok.
// export default async function ({ ok, node, tmp, env }).
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { decodePng } from "../lib/png.mjs";

export default async function ({ ok, tmp, env }) {
  const HERE = path.dirname(fileURLToPath(import.meta.url));
  const S = path.join(HERE, "..");
  const FX = path.join(HERE, "fixtures", "quick-film");
  const E = { ...env, RASANAI_GL: "cpu", RASANAI_OFFLINE: "1" };
  const qf = (a, o = {}) => spawnSync(process.execPath, [path.join(S, "quick-film.mjs"), ...a], { encoding: "utf8", env: E, timeout: o.timeout || 280000 });
  const J = (r) => { try { return JSON.parse(r.stdout); } catch { return {}; } };
  const lib = await import(path.join(S, "lib", "quick-film.mjs"));
  const sf = await import(path.join(S, "lib", "style-film.mjs"));
  const base = JSON.parse(fs.readFileSync(path.join(FX, "brief.json"), "utf8"));
  const root = path.join(tmp, "qf");
  const codes = (r) => (J(r).errors || []).map((e) => e.code);
  const mk = (name, mutate, scaffoldArgs = []) => {
    const run = path.join(root, name, "run"), pj = path.join(root, name, "project");
    fs.mkdirSync(path.join(run, "quick"), { recursive: true });
    const b = JSON.parse(JSON.stringify(base)); if (mutate) mutate(b);
    fs.writeFileSync(path.join(run, "quick", "brief.json"), JSON.stringify(b, null, 2));
    const r = qf(["scaffold", "--run", run, "--project", pj, "--offline", ...scaffoldArgs]);
    return { run, pj, r, b, comp: path.join(pj, "compositions", "quick", "index.html") };
  };
  const edit = (f, fn) => fs.writeFileSync(f, fn(fs.readFileSync(f, "utf8")));
  const injectScript = (js) => (h) => h.replace("</template>", `<script>${js}</script></template>`);

  // ---- no browser needed: the template, the contract, the refusals
  ok("quick-film --print-brief-template lists the brief to fill (no film is invented)", (() => { const r = qf(["scaffold", "--print-brief-template"]); const j = J(r); return r.status === 0 && j.schema === "rasanai-quick-brief/1" && /<the film's one title/.test(j.title); })());
  const v = lib.validateBrief(base);
  ok("brief: the synthetic fixture validates (3 steps, look contrast, no numbers on screen)", v.errors.length === 0 && v.upgrade.length === 0, JSON.stringify(v));
  const withNum = JSON.parse(JSON.stringify(base)); withNum.tagline = "Up to 3x faster, guaranteed";
  ok("brief: a number on screen that is not in facts[] is refused, a regulated-sounding claim is an upgrade", lib.validateBrief(withNum).errors.some((m) => /"3" is on screen but not in facts/.test(m)) && lib.validateBrief(withNum).upgrade.length === 0 && lib.validateBrief({ ...base, tagline: "Clinically proven to cure it" }).upgrade.length === 1);
  ok("brief: music without a licence and credit is refused", lib.validateBrief({ ...base, audio: { music: { file: "assets/audio/a.wav" } } }).errors.some((m) => /licence and credit/.test(m)));

  const fixture = mk("fixture", null);
  const sj = J(fixture.r);
  ok("scaffold: writes quick.json, ONE composition (a <template> HyperFrames sub-composition with its adapter), a host index.html and vendored GSAP", fixture.r.status === 0 && sj.ok && ["quick.json", "compositions/quick/index.html", "index.html", "assets/vendor/gsap.min.js"].every((f) => fs.existsSync(path.join(fixture.pj, f))) && /data-composition-src="compositions\/quick\/index\.html"/.test(fs.readFileSync(path.join(fixture.pj, "index.html"), "utf8")) && !/https?:\/\//.test(fs.readFileSync(path.join(fixture.pj, "index.html"), "utf8").replace(/xmlns[^"]*"[^"]*"/g, "")) && lib.templateInner(fs.readFileSync(fixture.comp, "utf8")) !== null, fixture.r.stdout.slice(0, 300) + fixture.r.stderr);
  const html = fs.readFileSync(fixture.comp, "utf8");
  ok("scaffold: the adapter is fenced, original and inside the composition only; no global patch, no remote reference, no media tag", html.includes(lib.VT_SRC) && !/<(video|audio|iframe)/i.test(html) && !/https?:\/\//.test(html) && !/requestAnimationFrame\s*=/.test(html));
  const st = lib.staticCheck(fixture.pj, JSON.parse(fs.readFileSync(path.join(fixture.pj, "quick.json"), "utf8")));
  ok("check (static): the generated composition passes every static rule", st.errors.length === 0, JSON.stringify(st.errors));

  const brief = JSON.parse(fs.readFileSync(path.join(fixture.pj, "quick.json"), "utf8"));
  const staticCodes = (fn) => { const f = mk("s" + Math.random().toString(36).slice(2, 7), null); edit(f.comp, fn); return lib.staticCheck(f.pj, JSON.parse(fs.readFileSync(path.join(f.pj, "quick.json"), "utf8"))).errors.map((e) => e.code); };
  void brief;
  ok("check refuses a remote script", staticCodes(injectScript("")).length === 0 && staticCodes((h) => h.replace("<script>" + lib.VT_SRC, '<script src="https://cdn.example.com/x.js"></script><script>' + lib.VT_SRC)).includes("remote-script"));
  ok("check refuses an iframe", staticCodes((h) => h.replace('<div id="b1">', '<iframe src="about:blank"></iframe><div id="b1">')).includes("iframe"));
  ok("check refuses a remote image (never fetched) and an unapproved local image and an embedded raster", (() => {
    const a = staticCodes((h) => h.replace('<div id="b1">', '<img src="https://example.com/logo.png"><div id="b1">'));
    const b = staticCodes((h) => h.replace('<div id="b1">', '<img src="assets/not-listed.png"><div id="b1">'));
    const c = staticCodes((h) => h.replace('<div id="b1">', '<img src="data:image/png;base64,iVBORw0KGgo="><div id="b1">'));
    return a.includes("remote-image") && b.includes("unapproved-image") && b.includes("missing-asset") && c.includes("unapproved-image");
  })());
  ok("check refuses <audio> and <video> tags and video-as-frames (a .mp4 / .gif reference)", (() => {
    const a = staticCodes((h) => h.replace('<div id="b1">', '<audio src="assets/x.wav"></audio><div id="b1">'));
    const b = staticCodes((h) => h.replace('<div id="b1">', '<video src="assets/x.mp4" autoplay></video><div id="b1">'));
    const c = staticCodes((h) => h.replace('<div id="b1">', '<img src="assets/frames.gif"><div id="b1">'));
    return a.includes("media-tag") && b.includes("media-tag") && c.includes("media-as-frames");
  })());
  ok("check refuses unseeded randomness, wall-clock time, timers and the real requestAnimationFrame", (() => {
    const a = staticCodes(injectScript("var r=Math.random();"));
    const b = staticCodes(injectScript("var t=Date.now();"));
    const c = staticCodes(injectScript("setTimeout(function(){},10);requestAnimationFrame(function(){});"));
    return a.includes("unseeded-random") && b.includes("wall-clock") && c.includes("wall-clock");
  })());
  ok("check refuses user secrets and private paths (in the composition or the brief)", (() => {
    const a = staticCodes((h) => h.replace("<template>", "<template><!-- hidden --><div data-k=\"x\" style=\"background:url('/Users/someone/private/pic.png')\"></div>"));
    const b = staticCodes(injectScript("var apiKey = 'abcdef1234567890SECRET';"));
    const c = staticCodes(injectScript("var k='sk-" + "a".repeat(30) + "';"));
    return a.includes("local-path") && b.includes("secret") && c.includes("secret");
  })());
  ok("check refuses an edited adapter (the fenced block must be byte-identical)", staticCodes((h) => h.replace("var STEP=60", "var STEP=30")).includes("adapter-modified"));
  ok("check refuses network calls and dynamic code", staticCodes(injectScript("fetch('x');")).includes("network-or-dynamic-code"));

  // ---- out of scope: needs the full crew, logged, never a silent incomplete preview
  const big = mk("big", (b) => { b.duration_s = 50; });
  ok("scaffold: a 50 s film is 'needs-full-crew' (exit 2), nothing is written, and the upgrade is logged", big.r.status === 2 && J(big.r).status === "needs-full-crew" && !fs.existsSync(big.comp) && /"event":"upgrade"/.test(fs.readFileSync(path.join(big.run, "quick", "upgrades.jsonl"), "utf8")), big.r.stdout.slice(0, 300));
  const five = mk("five", (b) => { b.mechanism.steps.push({ label: "Four" }, { label: "Five" }); });
  ok("scaffold: five mechanism steps and a regulated film are also 'needs-full-crew'", J(five.r).status === "needs-full-crew" && J(mk("reg", (b) => { b.regulated = true; }).r).status === "needs-full-crew");
  ok("scaffold: a missing look is refused with its reason (no invented brand)", J(mk("nolook", (b) => { delete b.look; }).r).errors.some((e) => /look\.(canvas|display)/.test(e.msg)));

  // ---- browser cases
  const ch = sf.chromeStatus(), ff = sf.ffmpegStatus();
  if (!ch.ok || !ff.ok) { console.log(`not run: quick-film browser and render cases (${!ch.ok ? ch.reason : ff.reason})`); return; }

  const c1 = qf(["check", "--project", fixture.pj, "--json"]);
  const cj = J(c1);
  ok("check: the 30 s three-beat fixture passes in headless Chrome (exit 0, no findings)", c1.status === 0 && cj.status === "ok" && cj.errors.length === 0, c1.stdout.slice(0, 800));
  ok("check: A-B-A, a late-then-early seek and a cold browser draw the same pixels at A", cj.measured && cj.measured.seek && cj.measured.seek.ABA && cj.measured.seek.A_after_C && cj.measured.seek.cold && cj.measured.seek.A_differs_from_B, JSON.stringify(cj.measured && cj.measured.seek));
  ok("check: each beat shows its text at its fixed timestamp (title+tagline, heading+3 steps, end line) and the timeline is exactly 30 s", cj.measured && cj.measured.samples.length === 3 && cj.measured.samples.every((s) => s.missing.length === 0) && cj.measured.samples[1].visible.length >= 4 && cj.measured.duration_s === 30, JSON.stringify(cj.measured && cj.measured.samples));
  ok("check: text readability uses lib/reading.mjs (every line held longer than its reading time) and no frame is blank", cj.measured && cj.measured.reading.every((r) => r.held_s >= r.needs_s) && !cj.errors.some((e) => e.code === "blank-frame") && cj.measured.frames_sampled > 100, JSON.stringify(cj.measured && cj.measured.reading).slice(0, 300));

  // the adapter drives CSS keyframes, WAAPI and virtual rAF to the expected sampled values
  {
    const ses = await lib.openSession(fixture.pj, brief, { scale: 0.5 });
    try {
      const probe = async (t) => { await ses.seek(t); return ses.b.eval(`(function(){var wire=document.querySelector("#wire line"),cs=getComputedStyle(wire),dot=document.getElementById("dot").style.transform,card=getComputedStyle(document.getElementById("c1")).borderTopColor,bar=document.getElementById("endbar");return {dash:parseFloat(cs.strokeDashoffset),dot:dot,card:card,pulse:getComputedStyle(bar).transform}})()`); };
      const start = lib.plan(brief).wipe.cover + 0.9; // the wire starts drawing here (CSS delay is in absolute film time)
      const p0 = await probe(start - 0.5), p1 = await probe(start + 0.8), p2 = await probe(start + 1.6 + 0.2), pBack = await probe(start + 0.8);
      ok("adapter (CSS keyframes): the wire's stroke-dashoffset is untouched before its delay, mid-way at +0.8 s, and finished after 1.6 s", p0.dash > 0 && p1.dash > 0 && p1.dash < p0.dash && p2.dash === 0 && pBack.dash === p1.dash, JSON.stringify([p0.dash, p1.dash, p2.dash]));
      const d0 = await probe(start + 0.0), d15 = await probe(start + 1.5), dBack = await probe(start + 0.0);
      const tx = (s) => (String(s).match(/translate\(([-\d.]+)px/) || [])[1];
      ok("adapter (virtual rAF): the signal dot is a pure function of the virtual time and a backward seek rebuilds it (A-B-A)", Number(tx(d15.dot)) > Number(tx(d0.dot)) && tx(d0.dot) === tx(dBack.dot), JSON.stringify([tx(d0.dot), tx(d15.dot), tx(dBack.dot)]));
      const w0 = await probe(start + 0.1), w1 = await probe(start + 0.2 + 0.9 + 0.5);
      ok("adapter (WAAPI): a card's border colour moves from muted to accent at its absolute delay and the seek is stateless", w0.card !== w1.card && w1.card === "rgb(255, 122, 61)", JSON.stringify([w0.card, w1.card]));
      const pu0 = await probe(lib.plan(brief).T2 + 0.3), pu1 = await probe(lib.plan(brief).T2 + 0.3 + 0.6);
      ok("adapter (infinite CSS animation): the end-card accent pulse alternates deterministically with the time", pu0.pulse !== pu1.pulse);
    } finally { await ses.close(); }
  }

  // ---- planted defects, each caught before render (a 12 s film keeps these quick)
  const pl = (name, fn, scaffoldArgs = ["--duration", "12"]) => { const f = mk(name, (b) => { b.duration_s = 12; }, scaffoldArgs); edit(f.comp, fn); const r = qf(["check", "--project", f.pj, "--json"]); return { f, r, j: J(r) }; };
  const clean = pl("p-clean", (h) => h);
  ok("planted: the unmodified 12 s film passes (the control for the planted defects)", clean.r.status === 0 && clean.j.errors.length === 0, clean.r.stdout.slice(0, 600));
  const pFont = pl("p-font", (h) => h.split('font-family:"Inter"').join('font-family:"Nonexistent Quick Sans"').split('"Inter"').join('"Nonexistent Quick Sans"'));
  ok("planted: a missing font is caught (exit 2, missing-font)", pFont.r.status === 2 && pFont.j.errors.some((e) => e.code === "missing-font"), pFont.r.stdout.slice(0, 500));
  const pExc = pl("p-exc", injectScript("window.notThere.call();"));
  ok("planted: an uncaught JS exception is caught (console-error)", pExc.r.status === 2 && pExc.j.errors.some((e) => e.code === "console-error"), pExc.r.stdout.slice(0, 500));
  const pBlank = pl("p-blank", (h) => h.replace('tl.set("#b2",{autoAlpha:1},WC);', 'tl.set("#b2",{autoAlpha:1},WC+2);'));
  ok("planted: a blank cut (the next beat arrives 2 s late) is caught (blank-frame)", pBlank.r.status === 2 && pBlank.j.errors.some((e) => e.code === "blank-frame"), pBlank.r.stdout.slice(0, 500));
  const pRand = pl("p-rand", injectScript("var x=Math.random();"));
  ok("planted: unseeded randomness is caught before anything runs (the page is never loaded)", pRand.r.status === 2 && pRand.j.errors.some((e) => e.code === "unseeded-random"));
  const pRemote = pl("p-remote", (h) => h.replace('<div id="b1">', '<img src="https://example.com/x.png"><div id="b1">'));
  ok("planted: a remote image is caught and the composition is never executed", pRemote.r.status === 2 && pRemote.j.errors.some((e) => e.code === "remote-image") && /not loaded/.test(String(pRemote.j.measured.browser)));
  const pState = pl("p-state", injectScript('var __n=0;window.render=function(t){document.getElementById("title").style.letterSpacing=((__n++)%9)+"px"};'));
  ok("planted: state that leaks between seeks (a stateful render(t)) fails the A-B-A check (nondeterministic-seek)", pState.r.status === 2 && pState.j.errors.some((e) => e.code === "nondeterministic-seek"), pState.r.stdout.slice(0, 500));
  const pBrief = pl("p-flash", injectScript('(function(){var t=window.__timelines.quick;t.set("#kick",{opacity:0},1.2);})();'));
  ok("planted: a kicker that leaves after 0.8 s raises a text-too-brief WARNING from lib/reading.mjs (warning severity: a new gate), the film still passes", pBrief.r.status === 0 && pBrief.j.warnings.some((w) => w.code === "text-too-brief" && /Synthetic example/.test(w.msg)), pBrief.r.stdout.slice(0, 500));
  const pMissing = pl("p-text", (h) => h.replace("A simple three-step loop", "Something else entirely").replace(/<span class="w">A<\/span> <span class="w">simple<\/span> <span class="w">three-step<\/span> <span class="w">loop<\/span>/, '<span class="w">Something</span> <span class="w">else</span>'));
  ok("planted: a beat that does not show its brief text at its timestamp is caught (missing-text)", pMissing.r.status === 2 && pMissing.j.errors.some((e) => e.code === "missing-text"));

  // ---- render: a failing check renders nothing; the fixture renders to MP4 with audio
  const out0 = path.join(pBlank.f.pj, "renders", "x.mp4");
  const rr = qf(["render", "--project", pBlank.f.pj, "--out", out0, "--fps", "8"]);
  ok("render: a film whose check fails renders NOTHING (exit 2, no file, the reason is the check)", rr.status === 2 && !fs.existsSync(out0) && /check must pass/.test(rr.stdout));

  // synthetic audio, generated here (no third-party material)
  const au = path.join(fixture.pj, "assets", "audio");
  fs.mkdirSync(au, { recursive: true });
  const gen = (f, args) => spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", args, path.join(au, f)], { encoding: "utf8" });
  gen("bed.wav", "sine=frequency=220:duration=32"); gen("cut.wav", "sine=frequency=880:duration=0.3");
  const synth = "synthetic ffmpeg sine test tone: no third-party material";
  const b2 = JSON.parse(fs.readFileSync(path.join(fixture.pj, "quick.json"), "utf8"));
  b2.audio = { music: { file: "assets/audio/bed.wav", licence: synth, credit: "ffmpeg sine test tone (synthetic)", volume: 0.25 }, sfx: [{ at: 8.4, file: "assets/audio/cut.wav", licence: synth, credit: "synthetic click", volume: 0.6 }, { at: 23.4, file: "assets/audio/cut.wav", licence: synth, credit: "synthetic click", volume: 0.6 }] };
  fs.writeFileSync(path.join(fixture.pj, "quick.json"), JSON.stringify(b2, null, 2));
  const mp4 = path.join(fixture.pj, "renders", "quick-preview.mp4");
  const t0 = Date.now();
  const r1 = qf(["render", "--project", fixture.pj, "--out", mp4, "--fps", "12"], { timeout: 590000 });
  const rj = J(r1);
  ok("render: the 30 s fixture renders as ONE HTML composition to MP4 (960x540, 12 fps preview, 30 s, music + 2 sfx mixed)", r1.status === 0 && rj.ok && fs.existsSync(mp4) && Math.abs(rj.duration_s - 30) < 0.3 && rj.size === "960x540" && /mixed: music/.test(rj.audio) && rj.check_status === "ok", r1.stdout.slice(-600) + r1.stderr.slice(-300));
  const pr = spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type", "-of", "csv=p=0", mp4], { encoding: "utf8" });
  ok("render: the MP4 has a video and an audio stream and the report records time to first draft", /video/.test(pr.stdout) && /audio/.test(pr.stdout) && rj.time_to_first_draft_s > 0 && fs.existsSync(mp4.replace(/\.mp4$/, ".json")), pr.stdout);
  // look at the rendered frames: the title beat, the diagram, the wipe in progress and the end card each have content, and the cut is not blank
  const frame = (t) => { const o = path.join(tmp, `qf-frame-${t}.png`); spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-ss", String(t), "-i", mp4, "-frames:v", "1", o]); return fs.existsSync(o) ? decodePng(o) : null; };
  const lit = (img) => { if (!img) return 0; let n = 0, m = 0; const bgR = img.rgb[0], bgG = img.rgb[1], bgB = img.rgb[2]; for (let i = 0; i < img.rgb.length; i += 12) { m++; if (Math.abs(img.rgb[i] - bgR) + Math.abs(img.rgb[i + 1] - bgG) + Math.abs(img.rgb[i + 2] - bgB) > 60) n++; } return n / m; };
  ok("render: decoded frames show content in every beat (title, diagram, end card) and an accent wipe mid-cut", [3, 14, 28].every((t) => lit(frame(t)) > 0.01) && lit(frame(8.55)) > 0.2, [3, 14, 28, 8.55].map((t) => lit(frame(t)).toFixed(3)).join(","));
  console.log(`info  quick-film render of the 30 s fixture (960x540, 12 fps) took ${((Date.now() - t0) / 1000).toFixed(1)} s wall clock including the check`);

  // ---- promote: the draft is the film's origin and the normal flow takes over
  const pro = qf(["promote", "--run", fixture.run, "--project", fixture.pj, "--budget", "lean"]);
  const pj = J(pro);
  const origin = (() => { try { return JSON.parse(fs.readFileSync(path.join(fixture.run, "quick", "origin.json"), "utf8")); } catch { return {}; } })();
  ok("promote: records origin 'quick-html-draft' with the composition hash and the actual preview (hash, duration), saved beside the run", pro.status === 0 && origin.origin === "quick-html-draft" && origin.preview && origin.preview.sha256 && origin.preview.duration_s > 29 && fs.existsSync(path.join(fixture.run, "quick", "preview.mp4")) && origin.composition.sha256 === lib.fileSha(fixture.comp), pro.stdout.slice(0, 400));
  ok("promote: saves storyboard, a score seed (not motion/score.json) and the Look inputs, and hands over with the normal next steps", ["storyboard.json", "score.json", "look.json", "brief.json", "composition.html"].every((f) => fs.existsSync(path.join(fixture.run, "quick", f))) && !fs.existsSync(path.join(fixture.run, "motion", "score.json")) && (pj.next || []).some((n) => /crew\.mjs plan/.test(n)) && /obey|slop|motion-gate/.test(origin.gates || ""), JSON.stringify(pj.next));
  ok("promote: the upgrade is logged, decisions.json records the origin and the music credit lands where deliver.mjs reads it", /"event":"promote"/.test(fs.readFileSync(path.join(fixture.run, "quick", "upgrades.jsonl"), "utf8")) && JSON.parse(fs.readFileSync(path.join(fixture.run, "decisions.json"), "utf8")).quick_preview.origin === "quick-html-draft" && /sine test tone/.test(fs.readFileSync(path.join(fixture.run, "music", "CREDITS-quick-preview.txt"), "utf8")));
  edit(fixture.comp, (h) => h + "\n<!-- edited after render -->\n");
  ok("promote: a composition edited after the render is refused as a stale preview (the promoted draft is the rendered one)", J(qf(["promote", "--run", fixture.run, "--project", fixture.pj])).errors.some((e) => e.code === "stale-preview"));
  ok("promote: a project that was never rendered is refused (no preview, nothing recorded)", J(qf(["promote", "--run", clean.f.run, "--project", clean.f.pj])).errors.some((e) => e.code === "no-preview") && !fs.existsSync(path.join(clean.f.run, "quick", "origin.json")));

  // ---- the same composition through the real HyperFrames renderer (when installed): the adapter drives CSS, WAAPI and rAF there too
  {
    const hf = spawnSync("npx", ["--no-install", "hyperframes", "--version"], { encoding: "utf8", timeout: 60000 });
    if (hf.status !== 0) console.log("not run: quick-film hyperframes engine case (npx --no-install hyperframes is not available)");
    else {
      const pjC = clean.f.pj;
      fs.writeFileSync(path.join(pjC, "hyperframes.json"), JSON.stringify({ paths: { blocks: "compositions", components: "compositions/components", assets: "assets" }, media: { autoProxy: true } }, null, 2));
      const a = path.join(pjC, "renders", "cdp.mp4"), b = path.join(pjC, "renders", "hf.mp4");
      const ra = qf(["render", "--project", pjC, "--out", a, "--fps", "10"]), rb = qf(["render", "--project", pjC, "--out", b, "--fps", "10", "--engine", "hyperframes"], { timeout: 590000 });
      const grab = (mp4, t) => { const o = path.join(tmp, `qf-cmp-${path.basename(mp4)}-${t}.png`); spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-ss", String(t), "-i", mp4, "-frames:v", "1", "-vf", "scale=480:270", o]); return fs.existsSync(o) ? decodePng(o) : null; };
      const diff = (x, y) => { if (!x || !y || x.rgb.length !== y.rgb.length) return 1; let d = 0; for (let i = 0; i < x.rgb.length; i++) d += Math.abs(x.rgb[i] - y.rgb[i]); return d / x.rgb.length / 255; };
      const ts = [1.5, 4.5, 6.2, 9.0, 11.5];
      // (12 s film: mechanism beat 3.4-9.4 s, the wire draws from 4.4 s)
      const ds = ts.map((t) => diff(grab(a, t), grab(b, t)));
      // the signal dot (virtual rAF) is the tallest accent-coloured run in the wire strip: its x must agree between the engines
      const dotX = (img) => { if (!img) return null; let best = -1, bx = null; for (let x = 0; x < img.width; x++) { let n = 0; for (let y = 195; y < 240; y++) { const i = (y * img.width + x) * 3, r = img.rgb[i], g = img.rgb[i + 1], bl = img.rgb[i + 2]; if (r > 200 && g > 90 && g < 160 && bl < 100) n++; } if (n > best) { best = n; bx = x; } } return best >= 5 ? bx : null; };
      const dx = [5.0, 7.0].map((t) => [dotX(grab(a, t)), dotX(grab(b, t))]);
      ok("hyperframes engine: the same composition renders through `hyperframes render` (12 s) and matches the CDP render (mean difference per channel under 5 % at 5 timestamps, the rAF-driven dot within 8 px)", ra.status === 0 && rb.status === 0 && ds.every((d) => d < 0.05) && dx.every(([p, q]) => p != null && q != null && Math.abs(p - q) <= 8) && dx[0][0] !== dx[1][0], ra.stdout.slice(-200) + rb.stdout.slice(-300) + JSON.stringify([ds, dx]));
      console.log(`info  quick-film CDP vs HyperFrames render, mean abs difference per channel at ${ts.join(", ")} s: ${ds.map((d) => d.toFixed(4)).join(", ")}; dot x (480 px wide) at 5 and 7 s: ${JSON.stringify(dx)}`);
    }
  }

  // ---- ordinary films are unaffected
  const blank = await (await import(path.join(S, "lib", "cdp.mjs"))).launch({ width: 320, height: 200, timeoutMs: 60000 });
  try {
    await blank.open("about:blank");
    const png = await blank.screenshot(), jpg = await blank.screenshot({ format: "jpeg", quality: 80 });
    ok("general video: cdp.mjs still screenshots PNG by default (jpeg is opt-in) and a plain page has no virtual-time adapter or patched clock", png.subarray(1, 4).toString() === "PNG" && jpg[0] === 0xff && jpg[1] === 0xd8 && (await blank.eval("typeof window.__vt")) === "undefined" && (await blank.eval("window.requestAnimationFrame.toString().includes('[native code]')")));
  } finally { await blank.close(); }
  const others = ["video.mjs", "crew.mjs", "handoff.mjs", "finish.mjs", "regression.mjs", "obey.mjs", "slop.mjs", "motion-gate.mjs"].filter((f) => /__vt|quick-film/.test(fs.readFileSync(path.join(S, f), "utf8")));
  ok("general video: no ordinary-film script installs the adapter or imports quick-film (it lives only in the quick composition)", others.length === 0, others.join(","));

  // ---- bench: the measured numbers against a lean plan (a 10 s film keeps it quick)
  const bb = JSON.parse(JSON.stringify(base)); bb.duration_s = 10; bb.size = { w: 640, h: 360 };
  const bf = path.join(root, "bench-brief.json"); fs.writeFileSync(bf, JSON.stringify(bb));
  const bn = qf(["bench", "--brief", bf, "--fps", "8", "--out", path.join(root, "bench")], { timeout: 400000 });
  const bj = J(bn);
  ok("bench: reports measured seconds for scaffold, check and render, the model-visible token estimate and the lean plan's dispatches and planned tokens", bn.status === 0 && bj.quick && bj.quick.render_s > 0 && bj.quick.model_dispatches === 1 && bj.lean && bj.lean.model_dispatches > 1 && bj.lean.planned_tokens_total > 100000 && /not measurable offline/.test(bj.comparison.lean_time_to_first_draft), bn.stdout.slice(0, 900));
}
