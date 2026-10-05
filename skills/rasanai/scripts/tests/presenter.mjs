// Presenter films: key (green and blue), beats, check (a good plan and each planted fault), plates, stills, build.
// export default async function ({ ok, node, tmp, env }), the helpers selftest.mjs defines. No network, no Codex.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export default async function ({ ok, node, tmp }) {
  const root = path.join(tmp, "presenter-test");
  fs.mkdirSync(root, { recursive: true });
  const ff = (argv) => spawnSync("ffmpeg", ["-y", "-v", "error", ...argv], { encoding: "utf8" });
  const probeTag = (f) => spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream_tags=alpha_mode", "-of", "csv=p=0", f], { encoding: "utf8" }).stdout.trim();
  const json = (r) => { try { return JSON.parse(r.stdout); } catch { return {}; } };
  const pixel = (file, x, y) => {
    const r = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-vf", `crop=1:1:${x}:${y}`, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { encoding: "buffer" });
    return [...r.stdout.subarray(0, 3)];
  };
  // a screen colour, a moving warm subject (140x250 at x 250 +- 30, y 80) and a sine tone; truth box: x .344-.609, y .222-.916
  const clip = (name, screen) => {
    const f = path.join(root, name);
    const r = ff(["-f", "lavfi", "-i", `color=c=${screen}:s=640x360:r=25:d=6`, "-f", "lavfi", "-i", "color=c=0xd89060:s=140x250:r=25:d=6", "-f", "lavfi", "-i", "sine=frequency=440:duration=6", "-filter_complex", "[0:v][1:v]overlay=x='250+30*sin(t*2)':y=80[v]", "-map", "[v]", "-map", "2:a", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", f]);
    return r.status === 0 ? f : null;
  };

  // ---- key: green and blue
  const truth = { x: 220 / 640, y: 80 / 360, w: 170 / 640, h: 250 / 360 };
  for (const [name, screen, want, chan] of [["green.mp4", "0x00b140", "green", 1], ["blue.mp4", "0x0047bb", "blue", 2]]) {
    const f = clip(name, screen);
    ok(`presenter: synthesised the ${want} screen clip`, !!f);
    if (!f) continue;
    const out = path.join(root, `key-${want}`);
    const r = node("presenter.mjs", ["key", "--clip", f, "--out", out]);
    const k = json(r);
    ok(`presenter key: ${want} screen keyed (exit 0)`, r.status === 0 && k.ok, (r.stderr || "").trim().split("\n").pop() + (r.stdout || "").slice(0, 200));
    const rgb = String(k.color || "#000000").slice(1).match(/../g).map((h) => parseInt(h, 16));
    ok(`presenter key: ${want} detected, not a fallback`, k.method === "chroma" && rgb[chan] > 100 && rgb[chan] === Math.max(...rgb), `method ${k.method} color ${k.color}`);
    ok(`presenter key: ${want} edges ${k.border_transparent} transparent, subject ${k.center_opaque} solid`, k.border_transparent >= 0.97 && k.center_opaque >= 0.98);
    const s = k.subject || {};
    ok(`presenter key: ${want} subject box within 0.05 of the truth`, ["x", "y", "w", "h"].every((q) => Math.abs((s[q] ?? 9) - truth[q]) <= 0.05), JSON.stringify(s));
    ok(`presenter key: ${want} wrote presenter.webm with alpha, key.json and key-check.png`, fs.existsSync(path.join(out, "presenter.webm")) && /1/.test(probeTag(path.join(out, "presenter.webm"))) && fs.existsSync(path.join(out, "key.json")) && fs.statSync(path.join(out, "key-check.png")).size > 5000, probeTag(path.join(out, "presenter.webm")));
    ok(`presenter key: ${want} key.json carries the audio flag, size and head`, k.has_audio === true && k.width === 640 && k.height === 360 && k.head && Math.abs(k.head.x - (truth.x + truth.w / 2)) < 0.05);
  }
  const keyJson = path.join(root, "key-green", "key.json");

  // ---- beats
  const W = [];
  let t = 0;
  const add = (n, gapAfter) => { for (let i = 0; i < n; i++) { const text = `w${W.length}`; W.push({ text, start: +t.toFixed(2), end: +(t + 0.28).toFixed(2) }); t += 0.3; } t += gapAfter; };
  add(8, 0); W[W.length - 1].text += "."; t += 0.5 - 0.02; // sentence one, then a pause
  add(2, 0); W[W.length - 1].text += "."; t += 0.1; // a two-word sentence: too short to stand
  add(20, 0.6); // a long run with a pause in it...
  add(20, 0); // ...and another half
  const wf = path.join(root, "words.json");
  fs.writeFileSync(wf, JSON.stringify(W));
  const bj = path.join(root, "beats.json");
  const br = node("presenter.mjs", ["beats", "--transcript", wf, "--out", bj, "--duration", String(+(t + 0.2).toFixed(2))]);
  const bs = fs.existsSync(bj) ? JSON.parse(fs.readFileSync(bj, "utf8")) : { beats: [] };
  ok("presenter beats: ran", br.status === 0 && bs.beats.length > 0, br.stderr);
  ok("presenter beats: the short sentence merged into the one before it, the pause split the long run", bs.beats.length === 3 && bs.beats[0].words[1] === 9 && bs.beats[1].words[1] === 29 && bs.beats[2].words[0] === 30, JSON.stringify(bs.beats.map((b) => b.words)));
  const spans = bs.beats.map((b) => b.end - b.start);
  ok("presenter beats: none under --min or over --max, and they tile the clip from 0", bs.beats[0].start === 0 && bs.beats.every((b, i) => i === 0 || Math.abs(b.start - bs.beats[i - 1].end) < 0.001) && spans.every((d) => d >= 2.5 && d <= 9.01), JSON.stringify(spans));
  const bj2 = path.join(root, "beats-5.json");
  node("presenter.mjs", ["beats", "--transcript", wf, "--out", bj2, "--max", "5", "--min", "2"]);
  const b5 = JSON.parse(fs.readFileSync(bj2, "utf8")).beats;
  ok("presenter beats: --max 5 splits every long beat", b5.length > bs.beats.length && b5.every((b) => b.end - b.start <= 5.6), JSON.stringify(b5.map((b) => +(b.end - b.start).toFixed(1))));
  // reel scan's footage.json (transcript path relative to the workspace)
  fs.mkdirSync(path.join(root, "footage"), { recursive: true });
  fs.copyFileSync(wf, path.join(root, "footage", "talk.words.json"));
  fs.writeFileSync(path.join(root, "footage", "footage.json"), JSON.stringify({ clips: [{ id: "talk", transcript: path.relative(root, path.join(root, "footage", "talk.words.json")) }] }));
  const fr = node("presenter.mjs", ["beats", "--transcript", path.join(root, "footage", "footage.json"), "--out", path.join(root, "beats-f.json")], { cwd: root });
  ok("presenter beats: reads reel scan's footage.json", fr.status === 0 && JSON.parse(fs.readFileSync(path.join(root, "beats-f.json"), "utf8")).beats.length === 3, fr.stderr);

  // ---- check
  const prompts = [
    "A wide empty pottery studio at first light with a single wheel and a lump of raw clay on a wooden bench",
    "Rows of identical unglazed bowls cooling on an iron shelf inside a dim brick room lit by orange embers",
    "A single hand thrown cup on a pale wooden shelf in soft morning window light with blurred pots behind",
    "A heavy kiln door opening onto glowing coals with warm light spilling across a swept stone floor",
  ];
  const good = () => ({
    version: 1, clip: "talk.mp4", aspect: "16:9", title: "Test",
    style: { lock: "35mm photograph, warm tungsten key from frame left, clay and ochre palette, soft film grain, shallow depth of field", avoid: "people looking at camera" },
    beats: [
      { id: "b1", start: 0, end: 3, say: "one", layout: "presenter-full", plate: { id: "p1", kind: "generated", prompt: prompts[0], camera: "push-in" }, graphics: [{ type: "kinetic-title", text: "far too late", at: 1.2, out: 2.8, zone: "top" }], transition_in: "cut" },
      { id: "b2", start: 3, end: 6, say: "two", layout: "presenter-right", plate: { id: "p2", kind: "generated", prompt: prompts[1], camera: "pan-left" }, graphics: [{ type: "stat", text: "83%", sub: "miss", at: 3.4, out: 5.8, zone: "left" }], transition_in: "blur-dissolve" },
      { id: "b3", start: 6, end: 9, say: "three", layout: "plate-only", plate: { id: "p3", kind: "generated", prompt: prompts[2], camera: "tilt-up" }, graphics: [], transition_in: "wipe" },
      { id: "b4", start: 9, end: 12, say: "four", layout: "presenter-left", plate: { id: "p4", kind: "generated", prompt: prompts[3], camera: "drift" }, graphics: [{ type: "list", items: ["a", "b"], at: 9.4, out: 11.8, zone: "right" }], transition_in: "push" },
    ],
  });
  const planFile = path.join(root, "plan.json");
  const runCheck = (plan, extra = []) => {
    fs.writeFileSync(planFile, JSON.stringify(plan, null, 2));
    const r = node("presenter.mjs", ["check", "--plan", planFile, "--json", "--beats", path.join(root, "dur12.json"), "--key", keyJson, ...extra]);
    return { status: r.status, j: json(r), stderr: r.stderr };
  };
  fs.writeFileSync(path.join(root, "dur12.json"), JSON.stringify({ duration: 12, beats: [] }));
  const g = runCheck(good());
  ok("presenter check: a good plan passes (exit 0, no errors)", g.status === 0 && g.j.ok === true && g.j.errors === 0, JSON.stringify(g.j.findings || g.stderr));
  const fault = (name, code, mutate, extra) => {
    const p = good();
    mutate(p);
    const r = runCheck(p, extra);
    ok(`presenter check: ${name} -> exit 2 with ${code}`, r.status === 2 && (r.j.findings || []).some((f) => f.code === code && f.fix), `exit ${r.status} ${JSON.stringify((r.j.findings || []).map((f) => f.code))}`);
  };
  fault("a gap in the speech", "coverage-gap", (p) => { p.beats[1].start = 3.5; });
  fault("a slop word", "prompt-slop", (p) => { p.beats[0].plate.prompt += ", a stunning scene"; });
  fault("text asked for in the prompt", "prompt-text", (p) => { p.beats[1].plate.prompt += ", a sign that says open"; });
  fault("four of the same layout in a row", "layout-run", (p) => { p.beats.forEach((b) => (b.layout = "presenter-full")); });
  fault("a graphic in the presenter's zone", "graphic-in-presenter", (p) => { p.beats[1].graphics[0].zone = "right"; });
  fault("an 8 s cutaway", "plate-only-long", (p) => { p.beats.splice(3, 1); p.beats[2].start = 4; p.beats[2].end = 12; p.beats[1].end = 4; p.beats[1].start = 3; p.beats[1].graphics = []; p.beats[0].end = 3; p.beats[1].layout = "presenter-right"; p.beats[0].end = 3; });
  fault("a graphic outside its beat", "graphic-outside", (p) => { p.beats[0].graphics[0].out = 4; });
  fault("a plate with no camera", "camera-missing", (p) => { delete p.beats[0].plate.camera; });
  fault("one camera move everywhere", "camera-monotone", (p) => { p.beats.forEach((b) => (b.plate.camera = "push-in")); });
  fault("a reuse that points nowhere", "reuse-missing", (p) => { p.beats[3].plate = { id: "p9", kind: "reuse", reuse: "nope", camera: "static" }; });
  const off = runCheck(good(), ["--imagegen", "off"]);
  ok("presenter check: --imagegen off warns about generated plates but passes", off.status === 0 && off.j.warnings >= 1, JSON.stringify(off.j.findings));
  const bad = spawnSync(process.execPath, [path.join(path.dirname(new URL(import.meta.url).pathname), "..", "presenter.mjs"), "check", "--plan", path.join(root, "nope.json")], { encoding: "utf8" });
  ok("presenter check: an unreadable plan is exit 1, not a pass", bad.status === 1, String(bad.status));

  // ---- plates
  fs.writeFileSync(planFile, JSON.stringify(good(), null, 2));
  const look = path.join(root, "DESIGN.md");
  fs.writeFileSync(look, `---\nname: Test\n---\n\n## Overview\nSomething.\n\n## Imagery\n${Array.from({ length: 120 }, (_, i) => `imagery${i}`).join(" ")}\n\n## Components\nNothing.\n`);
  const imgs = path.join(root, "images.json");
  const pr = node("presenter.mjs", ["plates", "--plan", planFile, "--look", look, "--out", imgs, "--dir", path.join(root, "plates")]);
  const bp = fs.existsSync(imgs) ? JSON.parse(fs.readFileSync(imgs, "utf8")) : {};
  ok("presenter plates: one image per generated plate, anchor is the first", pr.status === 0 && bp.images && bp.images.length === 4 && bp.anchor === "p1" && bp.images[0].out.endsWith(path.join("plates", "p1.png")), pr.stderr);
  ok("presenter plates: aspect, avoid and the Imagery section (first 80 words) as the style", bp.aspect === "16:9" && /watermarks/.test(bp.avoid) && /people looking at camera/.test(bp.avoid) && bp.style.split(/\s+/).length === 80 && bp.style.startsWith("imagery0 imagery1"), `${bp.style && bp.style.split(/\s+/).length} words`);
  const byId = Object.fromEntries((bp.images || []).map((i) => [i.id, i.prompt]));
  ok("presenter plates: a person-side layout gets the calm-third clause on the right side", /Keep the right third calm and uncluttered: a person will stand there/.test(byId.p2) && /Keep the left third calm/.test(byId.p4) && !/calm/.test(byId.p1 + byId.p3), JSON.stringify(byId));
  const pr2 = node("presenter.mjs", ["plates", "--plan", planFile, "--out", path.join(root, "images2.json")]);
  ok("presenter plates: without --look the style is plan.style.lock", pr2.status === 0 && JSON.parse(fs.readFileSync(path.join(root, "images2.json"), "utf8")).style.startsWith("35mm photograph"));

  // ---- stills (plates are synthesised images)
  const pdir = path.join(root, "plates");
  fs.mkdirSync(pdir, { recursive: true });
  for (const [i, id] of ["p1", "p2", "p3", "p4"].entries()) ff(["-f", "lavfi", "-i", `testsrc2=s=960x540:d=1:r=1,hue=h=${i * 70}`, "-frames:v", "1", path.join(pdir, `${id}.png`)]);
  const sdir = path.join(root, "stills");
  const sr = node("presenter.mjs", ["stills", "--plan", planFile, "--key", keyJson, "--plates", pdir, "--out", sdir]);
  const sj = json(sr);
  ok("presenter stills: one PNG per beat", sr.status === 0 && sj.count === 4 && [1, 2, 3, 4].every((n) => fs.existsSync(path.join(sdir, `b${n}.png`)) && fs.statSync(path.join(sdir, `b${n}.png`)).size > 20000), sr.stderr);
  const orange = (c) => c[0] > 180 && c[1] > 110 && c[1] < 180 && c[2] < 120;
  ok("presenter stills: the presenter stands where the layout says (right third, then left third, hidden in the cutaway)", orange(pixel(path.join(sdir, "b2.png"), Math.round(0.73 * 1920), 900)) && !orange(pixel(path.join(sdir, "b2.png"), Math.round(0.27 * 1920), 900)) && orange(pixel(path.join(sdir, "b4.png"), Math.round(0.27 * 1920), 900)) && !orange(pixel(path.join(sdir, "b3.png"), 960, 900)), JSON.stringify([pixel(path.join(sdir, "b2.png"), 1400, 900), pixel(path.join(sdir, "b4.png"), 520, 900)]));

  // ---- build
  const proj = path.join(root, "videos", "t");
  const cap = path.join(root, "cap.json");
  fs.writeFileSync(cap, JSON.stringify([{ text: "Most", start: 0.2, end: 0.5 }, { text: "teams", start: 0.5, end: 0.9 }, { text: "ship", start: 1, end: 1.4 }, { text: "late.", start: 1.4, end: 2 }]));
  const bl = node("presenter.mjs", ["build", "--plan", planFile, "--key", keyJson, "--plates", pdir, "--project-dir", proj, "--captions", cap], { cwd: root });
  const bj3 = json(bl);
  ok("presenter build: wrote a project", bl.status === 0 && bj3.index && fs.existsSync(path.join(proj, "index.html")), (bl.stderr || "") + (bl.stdout || "").slice(-300));
  const html = fs.existsSync(path.join(proj, "index.html")) ? fs.readFileSync(path.join(proj, "index.html"), "utf8") : "";
  ok("presenter build: index.html has the four tracks (plates 0, presenter 1, graphics 2, captions 3)", [0, 1, 2, 3].every((n) => new RegExp(`data-track-index="${n}"`).test(html)) && /<video id="presenter" class="clip"/.test(html) && /window\.__timelines\["root"\]/.test(html));
  ok("presenter build: copied the keyed video, the plates and the voice", ["assets/presenter.webm", "assets/plates/p1.png", "assets/plates/p4.png", "assets/voice.wav", "assets/vendor/gsap.min.js"].every((f) => fs.existsSync(path.join(proj, f))));
  ok("presenter build: no animation targets a .clip element's visibility, the camera moves a child", !/tl\.(to|from|fromTo|set)\("#(plate|presenter)[^"]*",[^)]*(autoAlpha|visibility)/.test(html) && /tl\.fromTo\("#cam-1"/.test(html));
  const gfx = ["b1-1", "b2-1", "b4-1"].map((n) => path.join(proj, "compositions", "graphics", `${n}.html`));
  ok("presenter build: a sub-composition and a brief for every graphic", gfx.every(fs.existsSync) && ["b1-1", "b2-1", "b4-1"].every((n) => fs.existsSync(path.join(proj, "briefs", "graphics", `${n}.md`))) && (bj3.graphics || []).length === 3);
  ok("presenter build: captions composition mounted", fs.existsSync(path.join(proj, "compositions", "captions.html")));
  // an animator's file is never overwritten
  fs.writeFileSync(gfx[0], "<!-- animator's own -->");
  node("presenter.mjs", ["build", "--plan", planFile, "--key", keyJson, "--plates", pdir, "--project-dir", proj, "--captions", cap, "--no-lint", "--refresh-scaffolds"], { cwd: root });
  ok("presenter build: a rebuild leaves a graphic the animator wrote alone", fs.readFileSync(gfx[0], "utf8") === "<!-- animator's own -->");
  if (bj3.lint && bj3.lint.ran === false) console.log("      note: hyperframes lint could not run here (no npx or offline); lint part skipped");
  else ok("presenter build: hyperframes lint passes", bj3.lint && bj3.lint.ok === true && !bj3.lint.errors, JSON.stringify(bj3.lint).slice(0, 400));
}
