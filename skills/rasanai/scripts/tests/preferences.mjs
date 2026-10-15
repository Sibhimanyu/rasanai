// The owner's taste answers in the presenter route: library/questions.json ids in rasanai-brief.json `preferences`, enforced by
// presenter.mjs check (speaker, text, captions, marks, ending, real plates) and honoured by plates / build; marks; the crew's
// variations. export default async function ({ ok, node, tmp, env }), the helpers selftest.mjs defines. No network, no Codex.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export default async function ({ ok, node, tmp }) {
  const root = path.join(tmp, "prefs-test");
  fs.mkdirSync(root, { recursive: true });
  const ff = (argv) => spawnSync("ffmpeg", ["-y", "-v", "error", ...argv], { encoding: "utf8" });
  const json = (r) => { try { return JSON.parse(r.stdout); } catch { return {}; } };
  const jf = (f, o) => { fs.writeFileSync(f, JSON.stringify(o, null, 2)); return f; };

  // a green-screen clip with a moving subject and a static white badge at the bottom left (x .02-.10, y .90-.98)
  const clip = path.join(root, "green.mp4");
  const r0 = ff(["-f", "lavfi", "-i", "color=c=0x00b140:s=640x360:r=25:d=12", "-f", "lavfi", "-i", "color=c=0xd89060:s=140x250:r=25:d=12", "-f", "lavfi", "-i", "sine=frequency=440:duration=12", "-filter_complex", "[0:v][1:v]overlay=x='250+30*sin(t*2)':y=80[a];[a]drawbox=x=13:y=324:w=51:h=29:color=white:t=fill[v]", "-map", "[v]", "-map", "2:a", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", clip]);
  ok("preferences: synthesised the clip with a badge", r0.status === 0, r0.stderr);
  if (r0.status !== 0) return;
  const keyDir = path.join(root, "key");
  const kr = node("presenter.mjs", ["key", "--clip", clip, "--out", keyDir]);
  const keyJson = path.join(keyDir, "key.json");
  const key = json(kr);
  ok("preferences: key ran and measured marks (an array, empty when lib/marks.mjs is not installed)", kr.status === 0 && Array.isArray(key.marks), (kr.stderr || "").slice(-200));
  const hasMarksLib = fs.existsSync(path.join(path.dirname(new URL(import.meta.url).pathname), "..", "lib", "marks.mjs"));
  if (hasMarksLib) {
    // a badge on a flat grey ground (a badge on the green screen is dropped by the finder: the key colour's edges are not marks)
    const gray = path.join(root, "gray.mp4");
    ff(["-f", "lavfi", "-i", "color=c=0x303030:s=640x360:r=25:d=6", "-f", "lavfi", "-i", "color=c=0xd89060:s=140x250:r=25:d=6", "-filter_complex", "[0:v][1:v]overlay=x='250+30*sin(t*2)':y=80[a];[a]drawbox=x=13:y=324:w=51:h=29:color=white:t=fill[v]", "-map", "[v]", "-c:v", "libx264", "-pix_fmt", "yuv420p", gray]);
    const gm = node("presenter.mjs", ["marks", "--clip", gray, "--out", path.join(root, "gray-marks")]);
    ok("preferences marks: presenter.mjs marks finds a static badge (without a key.json it says the speaker was not left out)", gm.status === 0 && (json(gm).marks || []).some((m) => m.x < 0.12 && m.y > 0.85 && m.presence > 0.9) && /not left out/.test(json(gm).warning || ""), gm.stdout.slice(0, 300));
  } else ok("preferences: without lib/marks.mjs the note says so and the marks are empty", key.marks.length === 0 && /marks/.test(key.marks_note || ""), JSON.stringify(key));
  // the badge, written by hand so the test does not depend on the marks module
  const BADGE = { x: 0.02, y: 0.9, w: 0.08, h: 0.08, presence: 1 };
  const kj = JSON.parse(fs.readFileSync(keyJson, "utf8"));
  const withMarks = (marks) => { const k = { ...kj, marks }; return jf(path.join(keyDir, "key-m-" + (marks.length ? Math.round(marks[0].x * 100) : 0) + ".json"), k); };
  const keyM = withMarks([BADGE]);
  const mr = node("presenter.mjs", ["marks", "--clip", clip, "--out", keyDir]);
  ok("preferences: presenter.mjs marks writes key.json.marks[] (speaker left out)", mr.status === 0 && Array.isArray(JSON.parse(fs.readFileSync(keyJson, "utf8")).marks) && json(mr).speaker_left_out === true, mr.stderr);

  // ---- plans
  const prompts = [
    "A wide empty pottery studio at first light with a single wheel and a lump of raw clay on a wooden bench",
    "Rows of identical unglazed bowls cooling on an iron shelf inside a dim brick room lit by orange embers",
    "A single hand thrown cup on a pale wooden shelf in soft morning window light with blurred pots behind",
    "A heavy kiln door opening onto glowing coals with warm light spilling across a swept stone floor",
  ];
  const plan = (aspect = "16:9") => ({
    version: 1, clip: "talk.mp4", aspect, title: "Test",
    style: { lock: "35mm photograph, warm tungsten key from frame left, clay and ochre palette, soft film grain, shallow depth of field", avoid: "people looking at camera" },
    beats: [0, 1, 2, 3].map((i) => ({ id: `b${i + 1}`, start: i * 3, end: i * 3 + 3, say: `say ${i}`, layout: "presenter-full", plate: { id: `p${i + 1}`, kind: "generated", prompt: prompts[i], camera: ["push-in", "pan-left", "tilt-up", "drift"][i] }, graphics: [], transition_in: i ? "wipe" : "cut" })),
  });
  const mixed = () => { const p = plan(); p.beats[1].layout = "presenter-right"; p.beats[2].layout = "plate-only"; p.beats[3].layout = "presenter-left"; return p; };
  const durF = jf(path.join(root, "dur12.json"), { duration: 12, beats: [] });
  const planFile = path.join(root, "plan.json");
  const brief = (prefs, extra = {}) => jf(path.join(root, "rasanai-brief.json"), { brief: "x", preferences: prefs, ...extra });
  const check = (p, prefs, flags = [], keyFile = keyJson, extra = {}) => {
    jf(planFile, p);
    const r = node("presenter.mjs", ["check", "--plan", planFile, "--json", "--beats", durF, "--key", keyFile, "--prefs", brief(prefs, extra), ...flags]);
    return { status: r.status, j: json(r), codes: (json(r).findings || []).map((f) => f.code), stderr: r.stderr };
  };
  const has = (c, code, level) => c.j.findings && c.j.findings.some((f) => f.code === code && (!level || f.level === level) && f.fix !== undefined);

  const base = check(plan(), {});
  ok("preferences: no answers, a plan with one layout in a row fails the rhythm rules as before", base.status === 2 && base.codes.includes("layout-run"), JSON.stringify(base.codes));
  const unk = check(plan(), { pictures: "bogus", nonsense: "x" });
  ok("preferences: unknown answers are ignored, not errors", unk.codes.includes("layout-run") && !unk.codes.includes("speaker-fixed"));

  // ---- speaker
  const f1 = check(mixed(), { speaker: "fixed" });
  ok("preferences speaker=fixed: other layouts are speaker-fixed errors naming the layout to use", f1.status === 2 && f1.codes.filter((c) => c === "speaker-fixed").length === 3 && /presenter-full/.test(f1.j.findings.find((f) => f.code === "speaker-fixed").fix));
  const f2 = check(plan(), { speaker: "fixed" });
  ok("preferences speaker=fixed: one layout for the whole film passes, with the rhythm rules switched off", f2.status === 0 && f2.j.ok === true, JSON.stringify(f2.j.findings));
  const tallFixed = plan("9:16");
  tallFixed.beats.forEach((b) => (b.layout = "presenter-stack"));
  const f3 = check(tallFixed, { speaker: "fixed" });
  ok("preferences speaker=fixed: in 9:16 the layout is presenter-stack (the speaker large at the bottom, the plate above)", f3.status === 0, JSON.stringify(f3.j.findings));
  const tallFull = plan("9:16");
  const f4 = check(tallFull, { speaker: "fixed" });
  ok("preferences speaker=fixed: in 9:16 presenter-full is not the fixed layout", f4.codes.includes("speaker-fixed") && /presenter-stack/.test(f4.j.findings.find((f) => f.code === "speaker-fixed").fix));
  const mv = check(mixed(), { speaker: "moving" });
  ok("preferences speaker=moving: a plate-only cutaway is plate-only-banned", has(mv, "plate-only-banned", "error"), JSON.stringify(mv.codes));
  const cut = check(mixed(), { speaker: "cutaways" });
  ok("preferences speaker=cutaways: today's rules (cutaways allowed)", !cut.codes.includes("plate-only-banned") && !cut.codes.includes("speaker-fixed"), JSON.stringify(cut.codes));

  // ---- text
  const gfx = (zone, text, at = 0.4, b = 0) => ({ type: "label", text, at: b * 3 + at, out: b * 3 + at + 1.8, zone });
  const withGfx = (list) => { const p = mixed(); p.beats[1].layout = "presenter-right"; p.beats[2].layout = "presenter-full"; list.forEach(([b, g]) => p.beats[b].graphics.push(g)); return p; };
  const t0 = check(withGfx([[0, gfx("top", "far too late")], [3, gfx("right", "two words", 0.4, 3)]]), { text: "none" });
  ok("preferences text=none: every graphic is a text-none error", t0.codes.filter((c) => c === "text-none").length === 2, JSON.stringify(t0.codes));
  const t1 = check(withGfx([]), { text: "none" });
  ok("preferences text=none: a plan with no graphics passes", t1.status === 0, JSON.stringify(t1.j.findings));
  const k1 = check(withGfx([[0, gfx("top", "far too late")], [3, gfx("right", "kiln", 0.4, 3)]]), { text: "key" });
  ok("preferences text=key: more than one graphic per 15 s is text-key-count (12 s allows 1)", has(k1, "text-key-count", "error"), JSON.stringify(k1.codes));
  const k2 = check(withGfx([[0, gfx("top", "far too late")]]), { text: "key" });
  ok("preferences text=key: one short graphic passes", k2.status === 0, JSON.stringify(k2.j.findings));
  const k3 = check(withGfx([[0, gfx("top", "five words is far too many")]]), { text: "key" });
  ok("preferences text=key: more than 4 words is text-key-long", has(k3, "text-key-long", "error"));
  const k4 = check(withGfx([[0, gfx("top", "far too late")], [3, gfx("right", "kiln", 0.4, 3)]]), { text: "full" });
  ok("preferences text=full: today's rules", !k4.codes.includes("text-key-count") && !k4.codes.includes("text-none"));

  // ---- captions
  const bottom = () => { const p = mixed(); p.beats[2].layout = "presenter-full"; p.beats[3].layout = "presenter-left"; p.beats[0].graphics.push(gfx("bottom", "a tag")); return p; };
  const c1 = check(bottom(), {}, ["--captions"]);
  ok("preferences captions: the --captions flag alone reserves the band (caption-collision, as before)", c1.codes.includes("caption-collision"), JSON.stringify(c1.codes));
  const c2 = check(bottom(), { captions: "off" }, ["--captions"]);
  ok("preferences captions=off: no caption band is reserved (no caption-collision) and the flag is a warning", !c2.codes.includes("caption-collision") && has(c2, "captions-off", "warning"), JSON.stringify(c2.codes));
  const c3 = check(bottom(), { captions: "plain" });
  ok("preferences captions=plain: the band is reserved without the flag", c3.codes.includes("caption-collision"), JSON.stringify(c3.codes));

  // ---- real plates
  const realPlan = (plate) => { const p = plan(); p.beats[1].plate = plate; p.beats[1].layout = "presenter-right"; return p; };
  const r1 = check(realPlan({ id: "cover", kind: "real", source: "https://example.org/cover.jpg", camera: "push-in" }), { pictures: "literal" });
  ok("preferences real plate: a sourced image passes with no prompt", !r1.codes.includes("prompt-short") && !r1.codes.includes("real-source") && !r1.codes.includes("plate-kind"), JSON.stringify(r1.codes));
  const r2 = check(realPlan({ id: "cover", kind: "real", camera: "push-in" }), { pictures: "literal" });
  ok("preferences real plate: no source and no todo is real-source", has(r2, "real-source", "error"));
  const r3 = check(realPlan({ id: "cover", kind: "real", todo: "find the cover of the book he names", camera: "push-in" }), { pictures: "literal" });
  ok("preferences real plate: a todo is a warning, not an error", has(r3, "real-todo", "warning") && !r3.codes.includes("real-source"), JSON.stringify(r3.codes));
  jf(planFile, realPlan({ id: "cover", kind: "real", source: "https://example.org/cover.jpg", file: "cover.jpg", camera: "push-in" }));
  const pimgs = path.join(root, "images.json");
  const pr = node("presenter.mjs", ["plates", "--plan", planFile, "--out", pimgs, "--dir", path.join(root, "plates"), "--prefs", brief({ pictures: "literal" })]);
  const pb = JSON.parse(fs.readFileSync(pimgs, "utf8")), pj = json(pr);
  ok("preferences plates: a real plate is listed with its source and never generated", pr.status === 0 && !pb.images.some((i) => i.id === "cover") && pb.images.length === 3 && pj.real.length === 1 && pj.real[0].source === "https://example.org/cover.jpg" && pj.pictures === "literal", JSON.stringify(pj).slice(0, 300));

  // ---- marks
  const m0 = check(mixed(), { marks: "keep" }, [], keyM);
  ok("preferences marks=keep: a plate-only cutaway hides the clip's mark (mark-covered) and so does a corner or split", has(m0, "mark-covered", "error") && m0.j.findings.some((f) => f.code === "mark-covered" && f.beat === "b3"), JSON.stringify(m0.codes));
  const noPO = () => { const p = mixed(); p.beats[2].layout = "presenter-full"; return p; };
  const m1 = check(noPO(), { marks: "keep" }, [], keyM);
  ok("preferences marks=keep: layouts that leave the mark alone pass", m1.status === 0, JSON.stringify(m1.j.findings));
  const m2 = check(noPO(), { marks: "keep", captions: "plain" }, [], keyM);
  ok("preferences marks=keep: the caption band over the mark is mark-covered", m2.j.findings.some((f) => f.code === "mark-covered" && /caption/.test(f.message)), JSON.stringify(m2.j.findings));
  const kb = withMarks([{ x: 0.1, y: 0.5, w: 0.08, h: 0.1, presence: 1 }]);
  const gp = noPO(); gp.beats[0].graphics.push(gfx("left", "kiln"));
  const m3 = check(gp, { marks: "keep" }, [], kb);
  ok("preferences marks=keep: a graphic zone over the mark is mark-covered", m3.j.findings.some((f) => f.code === "mark-covered" && /graphic 1/.test(f.message)), JSON.stringify(m3.j.findings));
  const m4 = check(mixed(), { marks: "cover" }, [], keyM);
  ok("preferences marks=cover: marks are not checked", !m4.codes.includes("mark-covered"));
  const { marks: _m, ...unmeasured } = kj;
  const m5 = check(noPO(), { marks: "keep" }, [], jf(path.join(keyDir, "key-unmeasured.json"), unmeasured));
  ok("preferences marks=keep: a key.json that never measured its marks is a warning, never a silent pass", m5.status === 0 && has(m5, "marks-unmeasured", "warning"), JSON.stringify(m5.codes));

  // ---- ending
  const card = path.join(root, "end-card.png");
  ff(["-f", "lavfi", "-i", "color=c=0x223355:s=640x360:d=1", "-frames:v", "1", card]);
  const cardV = path.join(root, "end-card.mp4");
  ff(["-f", "lavfi", "-i", "color=c=0x553322:s=640x360:r=25:d=2", "-pix_fmt", "yuv420p", cardV]);
  const e1 = check(plan(), { ending: "card", speaker: "fixed" }, [], keyJson, { ending_file: card });
  ok("preferences ending=card: the check reports the film as the clip plus the card held 3 s", e1.status === 0 && e1.j.film_duration === 15 && e1.j.ending && e1.j.ending.seconds === 3, JSON.stringify(e1.j).slice(0, 300));
  const e2 = check(plan(), { ending: "card", speaker: "fixed" }, [], keyJson, { ending_file: cardV });
  ok("preferences ending=card: a video card runs its own length", e2.j.film_duration === 14 && e2.j.ending.seconds === 2, JSON.stringify(e2.j.ending));
  const e3 = check(plan(), { ending: "card", speaker: "fixed" });
  ok("preferences ending=card: no file is an error (ending-file)", has(e3, "ending-file", "error"));
  const e4 = check(plan(), { ending: "card", speaker: "fixed" }, [], keyJson, { ending_file: path.join(root, "nope.png") });
  ok("preferences ending=card: a missing file is an error (ending-file-missing)", has(e4, "ending-file-missing", "error"));
  const e5 = check(plan(), { ending: "make", speaker: "fixed" });
  ok("preferences ending=make: a 3 s closing card is added to the film", e5.j.film_duration === 15 && e5.j.ending.kind === "make");
  const e6 = check(plan(), { ending: "none", speaker: "fixed" });
  ok("preferences ending=none: the film is the clip", e6.j.film_duration === 12 && e6.j.ending === null);

  // ---- build
  const pdir = path.join(root, "plates");
  fs.mkdirSync(pdir, { recursive: true });
  for (const [i, id] of ["p1", "p2", "p3", "p4"].entries()) ff(["-f", "lavfi", "-i", `testsrc2=s=960x540:d=1:r=1,hue=h=${i * 70}`, "-frames:v", "1", path.join(pdir, `${id}.png`)]);
  fs.copyFileSync(path.join(pdir, "p2.png"), path.join(root, "cover.jpg"));
  const cap = jf(path.join(root, "cap.json"), [{ text: "Most", start: 0.2, end: 0.5 }, { text: "teams", start: 0.5, end: 0.9 }, { text: "ship", start: 1, end: 1.4 }, { text: "late.", start: 1.4, end: 2 }]);
  const build = (name, p, prefs, extra = [], keyFile = keyJson, briefExtra = {}) => {
    const proj = path.join(root, "videos", name);
    fs.mkdirSync(proj, { recursive: true });
    fs.writeFileSync(path.join(proj, "hyperframes.json"), "{}");
    jf(planFile, p);
    const r = node("presenter.mjs", ["build", "--plan", planFile, "--key", keyFile, "--plates", pdir, "--project-dir", proj, "--prefs", brief(prefs, briefExtra), "--no-lint", ...extra], { cwd: root });
    const html = fs.existsSync(path.join(proj, "index.html")) ? fs.readFileSync(path.join(proj, "index.html"), "utf8") : "";
    return { r, j: json(r), proj, html };
  };
  const gp1 = plan(); gp1.beats[0].graphics.push(gfx("top", "far too late"));
  const b1 = build("none-text", gp1, { text: "none", captions: "off" }, ["--captions", cap]);
  ok("preferences build: text=none builds no graphics and captions=off no captions", b1.r.status === 0 && (b1.j.graphics || []).length === 0 && !fs.existsSync(path.join(b1.proj, "compositions", "captions.html")) && b1.j.captions === 0 && (b1.j.warnings || []).some((w) => /captions=off/.test(w)), (b1.r.stderr || "") + JSON.stringify(b1.j.warnings));
  const b2 = build("plain", plan(), { captions: "plain" }, ["--captions", cap]);
  const b3 = build("styled", plan(), { captions: "styled" }, ["--captions", cap]);
  const ch = (b) => { const f = path.join(b.proj, "compositions", "captions.html"); return fs.existsSync(f) ? fs.readFileSync(f, "utf8") : ""; };
  ok("preferences build: captions=plain is reel.mjs's clean style (the look's ink on its ground, no word highlight), styled the bold one", /font-weight: 600/.test(ch(b2)) && !/font-weight: 800/.test(ch(b2)) && !/color: "#/.test(ch(b2).replace(/tl\.set\("#cap/g, "")) === true && /font-weight: 800/.test(ch(b3)) && /text-stroke/.test(ch(b3)), ch(b2).slice(0, 200));
  const b4 = build("marks", noPO(), { marks: "keep", speaker: "moving" }, [], keyM);
  ok("preferences build: marks=keep cuts the mark from the original clip and lays it over the film at its own place", b4.r.status === 0 && b4.j.marks === 1 && fs.existsSync(path.join(b4.proj, "assets", "marks", "mark-1.png")) && /id="mark-1"/.test(b4.html), (b4.r.stderr || "") + JSON.stringify(b4.j.warnings));
  const bm = build("marks-warn", mixed(), { marks: "keep" }, [], keyM);
  ok("preferences build: a layout that covers the mark is a warning in the build output too", (bm.j.warnings || []).some((w) => /mark-covered/.test(w)), JSON.stringify(bm.j.warnings));
  const b5 = build("ending-img", plan(), { ending: "card", speaker: "fixed" }, [], keyJson, { ending_file: card });
  ok("preferences build: ending=card mounts the image after the clip, held 3 s, and the root runs 15 s", b5.r.status === 0 && /id="ending"[^>]*data-start="12"[^>]*data-duration="3"/.test(b5.html) && /data-composition-id="root" data-start="0" data-duration="15"/.test(b5.html) && fs.existsSync(path.join(b5.proj, "assets", "ending.png")) && b5.j.duration === 15 && b5.j.clip_duration === 12, (b5.r.stderr || "") + b5.html.slice(0, 100));
  const b6 = build("ending-vid", plan(), { ending: "card", speaker: "fixed" }, [], keyJson, { ending_file: cardV });
  ok("preferences build: ending=card with a video plays it for its own length", b6.r.status === 0 && /<video id="ending"[^>]*data-start="12"[^>]*data-duration="2"/.test(b6.html) && b6.j.duration === 14, (b6.r.stderr || "") + JSON.stringify(b6.j.ending));
  const b7 = build("ending-make", plan(), { ending: "make", speaker: "fixed" });
  ok("preferences build: ending=make writes a closing card scaffold and its brief for the film builder", b7.r.status === 0 && fs.existsSync(path.join(b7.proj, "compositions", "plates", "ending.html")) && fs.existsSync(path.join(b7.proj, "briefs", "plates", "ending.md")) && /data-composition-id="plate-ending"[^>]*data-start="12"/.test(b7.html) && b7.j.duration === 15, (b7.r.stderr || "") + b7.html.slice(0, 80));
  const b8 = build("ending-none", plan(), { ending: "none", speaker: "fixed" });
  ok("preferences build: ending=none leaves the film at the clip's length", b8.j.duration === 12 && !/id="ending"/.test(b8.html));
  const rp = realPlan({ id: "cover", kind: "real", source: "https://example.org/cover.jpg", file: "cover.jpg", camera: "push-in" });
  const b9 = build("real", rp, { pictures: "literal" });
  ok("preferences build: a real plate's own file is copied in as its picture", b9.r.status === 0 && fs.existsSync(path.join(b9.proj, "assets", "plates", "cover.jpg")) && /assets\/plates\/cover\.jpg/.test(b9.html), (b9.r.stderr || "") + JSON.stringify(b9.j.warnings));
  const b10 = build("stack", (() => { const p = plan("9:16"); p.beats.forEach((b) => (b.layout = "presenter-stack")); return p; })(), { speaker: "fixed" });
  ok("preferences build: presenter-stack builds in 9:16 (the speaker scaled about the bottom, centred)", b10.r.status === 0 && /tl\.set\("#pres-wrap", \{ x: -?\d+, y: 0, scale: 0\.72 \}/.test(b10.html), (b10.r.stderr || "") + b10.html.match(/#pres-wrap[^;]*/g));

  // ---- crew: the Story call varies inside a chosen style; a series skips the Look and writes one story
  const ws = path.join(root, "crew-ws");
  const run = path.join(ws, ".rasanai", "r1");
  fs.mkdirSync(run, { recursive: true });
  const C = (a) => node("crew.mjs", a, { cwd: ws });
  const sdir = path.join(root, "Series", "quotidian");
  fs.mkdirSync(sdir, { recursive: true });
  fs.writeFileSync(path.join(sdir, "DESIGN.md"), "---\nname: Q\n---\n## Overview\nx\n");
  jf(path.join(sdir, "series.json"), { version: 1, name: "Quotidian", slug: "quotidian", preferences: { captions: "off", ending: "card" }, look: "DESIGN.md", ending_file: "end-card.png", rules: [{ id: "r1", text: "No captions", from_film: "ep1", at: "2026-10-15" }], episodes: [] });
  fs.copyFileSync(card, path.join(sdir, "end-card.png"));
  const none = json(C(["plan", "--run", run, "--route", "presenter", "--subject", "Talk"]));
  ok("preferences crew: with no answers the three visual writers are Sure, Bold, Wild", (none.phases || []).find((p) => p.phase === "visual-writers").members.length === 3);
  const lit = json(C(["plan", "--run", run, "--route", "presenter", "--subject", "Talk", "--prefs", brief({ pictures: "literal", speaker: "fixed" })]));
  const vw = (lit.phases || []).find((p) => p.phase === "visual-writers");
  ok("preferences crew: with the pictures answered the writers write variations inside the style", vw && vw.members.length === 3 && /variations inside that style/.test(vw.when), JSON.stringify(vw));
  const bf = json(C(["brief", "--run", run, "--role", "visual-writer", "--key", "Bold"]));
  const bt = bf.prompt ? fs.readFileSync(path.join(ws, bf.prompt), "utf8") : "";
  ok("preferences crew: the writer's brief carries the answers, its variation, the style-bound dare and --prefs on the check", /PREFERENCES/.test(bt) && /pictures = literal/.test(bt) && /closer eye/.test(bt) && /never a different style/.test(bt) && /--prefs /.test(bt), bt.slice(-600));
  const se = json(C(["plan", "--run", run, "--route", "presenter", "--subject", "Talk", "--series", sdir, "--prefs", brief({ pictures: "literal" })]));
  const names = (se.phases || []).map((p) => p.phase);
  const sw = (se.phases || []).find((p) => p.phase === "visual-writers");
  ok("preferences crew: a series skips the design desk and the Look call, and has one writer", !names.includes("design-research") && !names.includes("design-systems") && names.includes("look-series") && sw && sw.members.length === 1, JSON.stringify(names));
  const sb = json(C(["brief", "--run", run, "--role", "visual-writer", "--key", "Sure"]));
  const st = sb.prompt ? fs.readFileSync(path.join(ws, sb.prompt), "utf8") : "";
  ok("preferences crew: a series film's briefs carry SERIES and the series' rules; the series' answers fill what the film left open", /SERIES: Quotidian/.test(st) && /Rules of the series "Quotidian"/.test(st) && /No captions/.test(st) && /captions = off/.test(st) && /ENDING CARD FILE|ending = card/.test(st), st.slice(-700));
}
