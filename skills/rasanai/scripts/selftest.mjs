#!/usr/bin/env node
// Self-test: the checks that keep RasanAI honest. Needs Node >= 20 and Chrome
// (npx hyperframes browser ensure, or RASANAI_CHROME). No network needed.
//   node selftest.mjs [--quick]
// 1. every personality's own tasting animation passes obey against its own motion.md
// 2. planted bad motion is caught (fade-up-slide via autoAlpha / css / keyframes, custom ease)
// 3. a broken composition is "could not run" (exit 1), never "clean"
// 4. the keyframe board flags a banned pose pair
// 5. pick keeps its guarantees (2 tail candidates; "you decide" never the remembered pick)
// 6. the console serves, accepts a token-authenticated action, and wait returns it
//    remote. the contract for other apps (scripts/tests/remote.mjs): schema, external_actions, sources kept on sent/feed/decision,
//    other apps' lines applied by wait in both modes, the server's own POST applied once
// 7. entire videos: multi-scene tasting obeys, scenes.mjs writes a parseable plan and rejects
//    bad input, the contract upsert is idempotent, inject + audio-lock work, the transitions menu renders
// 8. footage reels: scan reads rotation and sound, build conforms segments, sizes cards, times the cut, obeys;
//    Claude-authored cards are mounted and checked, missing ones refused
// 9. direction: the taxonomy validates, every motion-language swatch obeys its own contract, DESIGN.md shapes
//    are read into roles and fonts and converted to a frame.md that reads back, the direction compiles and
//    rejects unknown terms, design directions are distinct and brand-locked on request, the console page parses
// 10. setup and updates: Node discovery, VERSION matches the plugin, newer releases reported
// 11. story: the device catalog validates, pick is distinct and deterministic, the rubric ships a good pitch and rejects the cliché, G6 judges the script
// 12. anti-slop: a project full of AI-video tells fails with fixes; a clean one passes
// 13. sound: analyze/fit/render/check on a synthetic 120 BPM track, needs_longer, loop detection, SFX rules
// 14. the crew: plan, prompt files, the score check, the score into STORYBOARD.md, local search + inventory, motion strips
// 15. 3D: the Rasan3D runtime installs, a scaffolded scene builds, is seek-safe and passes the gate; planted
//     nondeterminism, a linear drift and an ease outside motion.md are caught; strips and key frames wait for the build
// 16. the 3D styles of the style library mount real Rasan3D canvases (presets3d.js); the console serves the runtime safely
// 18. the design desk: library index and search, the design-system gate (a good system passes; generic, near-duplicate and invalid ones fail), choose-system, the crew plan
// 19. model profiles and adaptive prompts (Claude vs GPT, dispatch per harness), the finish opt-out for stepped scenes
// 20. image generation and presenter films: the crew's presenter route (visual writers, brief, check), the `## Imagery` requirement,
//     then scripts/tests/imagegen.mjs (a fake Codex: status, model fallback, normalising, anchor, skip, failure) and
//     scripts/tests/presenter.mjs (key, beats, check, plates, stills, build), each skipped with a note when absent
// 21. the Moves pass: isLabelOnly, moves.mjs (pack, check, check-verdict, payload, choose, record, and rough/check-rough when Chrome and ffmpeg are there),
//     the crew's moves phases and roles, the score accounting against story/moves.json; fixtures in scripts/tests/fixtures/moves/
// 22. motion grammars: grammar.mjs (list, show, check, pick, write, the brand palette merge), the score's grammar rules (grammar-missing, technique-unknown,
//     technique-thin, frame-device-missing), the builders' briefs, and the design desk's grammar.json gate (grammar-missing, grammar-invalid,
//     grammar-not-flat, grammar-repeat); fixtures in scripts/tests/fixtures/grammars/ (RASANAI_GRAMMAR_LIBRARY); no grammar file, no new errors
// shape. the shape kit: RasanShape runtime + vendored flubber (licence), shape.mjs install/check, the demo page rendered headless (every function changes over time
//     and is identical when seeked twice), the `character` motion language accepted by obey
// art. the art department: art.mjs treat (gradient-map, duotone, halftone, dither, pixelate, xray, grade), cutout (flood-fill on a plain ground, a busy one refused), trace and hand
//    (vendored imagetracerjs and Hershey) on small fixtures, plan / make (the image-generation-unavailable path) / check, the crew's art phase, brief and check, layers-thin,
//    no-pose-board and hero-not-stripped
// frames. styleframes and design boards (scripts/tests/frames.mjs): the shot-list rules, frames.mjs init/shots-check/refs/sheet/match/payload, the crew's
//    styleframes phases, prompts and checks, the score bound to the boards, the console's redo action (headless)
// camera. the RasanCamera kit (scripts/tests/camera.mjs): runtime, camera.mjs install/check (order, timeline, randomness, budgets), video.mjs inject
//    (kit + GSAP plugins, script tags), finish.mjs --draft; full runs render the demo film (every function, seek identity, byte-identical double render)
// 17. lyric videos: the treatment gate and the crew's song route, lyrics.mjs (check, audio, align when whisper is there), the RasanMusic runtime in a page, the film finish (grade, blur)
// chrome-lint. the page-chrome lint (scripts/tests/chrome-lint.mjs): every rule of lib/chrome-lint.mjs on planted films with its negatives (UI surface, data-ui="captured", data-chrome="allow", a brand film's measured.chrome), through slop.mjs
// formats. the "What are you making?" picker (scripts/tests/formats.mjs): formats.json check, match, resolve, the brief payload, the console picker, story.mjs format_shapes
// one-memory. one memory (scripts/tests/one-memory.mjs): lessons.mjs digest and suggest, the taste ledger as raw evidence, one row per action id, the crew brief's one lessons block, the one reading-time formula (lib/reading.mjs)
// deliver. the delivery package and the voice check (scripts/tests/deliver.mjs): video.mjs deliver (mp4, poster, srt, CREDITS.txt, build.sh, NOTE.md), voice.mjs verify against whisper-cli when it is there
// orbs. the RasanOrbs kit (scripts/tests/orbs.mjs): runtime, video.mjs inject, the nine states seeked in headless Chrome; --quick runs only the static + golden checks (no Chrome)
// events. the derived film-event manifest (scripts/tests/events.mjs): deterministic export, stable ids and order, scene-local to film time once, invalid input refused, stale sha256 refused, hand edits overwritten, no network, consumers read it only when given it
// regression. the deterministic render regression (scripts/tests/regression.mjs): A-B-A seeks and cold renders, baselines by a bounded metric, planted bad scenes refused, exit 0/1/2; Chrome cases print "not run" without Chrome
// stage2d. Rasan2D hand-painted characters (scripts/tests/stage2d.mjs): the shared canon rules (also for W6's 3d-rig), 31 emotions, the 12 Hz seeded boil, actions as pure functions of t, planted feet, the crew's character-design phase and the cartoon route; in Chrome A-B-A pixels, five views, independent actors, depth order, parallel frames, check clean on the 15 s film and failing on broken canon / unseeded randomness / actor out of frame / missing runtime / sliding feet; the film's MP4 and motion-gate (ffmpeg)
// evidence. evidence-grounded technical films (scripts/tests/evidence.mjs): ingest / check / scene-data / preview on SYNTHETIC fixtures, units and provenance, the SCHEMATIC badge under a crop, LiDAR coordinates, unsupported formats, CREDITS / evidence.json without private paths, crew + formats wiring, deterministic renders; Chrome / ffmpeg cases print "not run"
// custom-style. user-owned film styles (scripts/tests/custom-style.mjs): extract from a fixture run, variants with the base byte-identical, closed edit schema (unknown / brand colour / different medium refused), snapshot bind, compare sheet and 15 s test film; Chrome / ffmpeg cases print "not run"
// original-score. the optional procedural original score (scripts/tests/original-score.mjs): a 20 s offline track with 3 sections, a peak on a picture event within one frame, a designed pause and ending; byte-identical repeat; a moved cue moves only its hit; the user's track wins; sound.mjs fit/render/check pass it and fail clipped or misaligned tracks; credits list only samples used; ffmpeg cases print "not run"
// canon3d. the recurring 3D actor with an enforceable on-model canon (scripts/tests/canon3d.mjs): the 3d-rig identity rules and seal, cast-canon warnings, seek-safe actions, the visual metric (pass / uncertain / fail), the crew's character role; in Chrome the model sheet, one actor in two scenes with no drift, A-B-A and independent renders, a prop on the hand point, and planted failures (body ratio, hidden scarf, recolour, stale copy, edited rig) vs permitted pose and uniform scale; Chrome cases print not run
// quick-film. the opt-in single-HTML film prototype (scripts/tests/quick-film.mjs): scaffold, check (planted missing font / remote image / exception / blank cut / unseeded random caught), A-B-A and cold seeks, a 30 s synthetic film to MP4 with audio, promote, out-of-scope upgrade log, bench; Chrome / ffmpeg cases print "not run"
// styles. the style-reference library (scripts/tests/styles.mjs): library/styles parses (frontmatter, 9 sections, 3 to 6 signature features, posters), the third_party credits, design-desk.md and the designer brief point at it
// plates. abstract plates (scripts/tests/plates.mjs): art.mjs recipe, the gradient-map palette lock, the procedural plate, make on an abstract row; full runs render flowGround + plateTransition twice (byte-identical)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "rasa-selftest-"));
// no grammar library by default (back-compat: looks and scores ask nothing of a grammar); section 22 and the design desk's grammar block point at fixtures
const env = { ...process.env, RASANAI_HOME: path.join(TMP, "home"), RASANAI_MODEL: "claude-opus-5-5", RASANAI_GRAMMAR_LIBRARY: path.join(TMP, "no-grammars") };
delete env.RASANAI_CONSOLE_HEADLESS; // the console cases below start a real server unless they opt in
const quick = process.argv.includes("--quick");
let failed = 0;
const node = (script, args, opts = {}) => spawnSync(process.execPath, [path.join(HERE, script), ...args], { encoding: "utf8", env, cwd: opts.cwd || TMP, timeout: 180000 });
const ok = (name, cond, detail = "") => {
  console.log(`${cond ? "ok  " : "FAIL"}  ${name}${!cond && detail ? `\n      ${detail}` : ""}`);
  if (!cond) failed++;
};

// 1
const ids = fs.readdirSync(path.join(HERE, "..", "personalities")).map((f) => f.replace(".json", "")).sort();
for (const id of quick ? ids.slice(0, 3) : ids) {
  const d = path.join(TMP, "self", id);
  const t = node("tasting.mjs", ["--content", "Ship it in an afternoon", "--sub", "a second line", "--personalities", `${id},${id}`, "--out", d]);
  node("motion-md.mjs", ["write", "--personality", id, "--out", path.join(d, "motion.md")]);
  const o = node("obey.mjs", ["--project", d]);
  ok(`personality ${id} obeys its own motion.md`, t.status === 0 && o.status === 0 && /0 error\(s\), 0 warning\(s\)/.test(o.stdout), (t.stderr || "") + o.stdout.split("\n")[0]);
}

// 2 + 3
const mk = (name, body, head = "") => {
  const d = path.join(TMP, name);
  fs.mkdirSync(d, { recursive: true });
  node("motion-md.mjs", ["write", "--personality", "editorial-mask", "--out", path.join(d, "motion.md")]);
  fs.writeFileSync(path.join(d, "index.html"), `<html><head>${head}</head><body><div id="root" data-composition-id="m"><h1 id="a">A</h1><h2 id="b">B</h2><h3 id="c">C</h3><h4 id="k">K</h4></div><script>${body}</script></body></html>`);
  return d;
};
const gsap = `<script src="file://${path.join(HERE, "vendor", "gsap.min.js")}"></script>`;
const bad = mk("bad", `const tl=gsap.timeline({paused:true});
tl.from("#a",{y:150,autoAlpha:0,duration:0.7,ease:"expo.out"},0);
tl.fromTo("#b",{css:{opacity:0,x:-40}},{css:{opacity:1,x:0},duration:0.7,ease:"expo.out"},0.5);
tl.to("#c",{x:30,duration:0.7,ease:function(p){return p}},1);
tl.to("#k",{keyframes:[{opacity:0,y:40,duration:0},{opacity:1,y:0,duration:0.7}],ease:"expo.out"},2);
window.__timelines["m"]=tl;tl.seek(0);`, gsap);
const ob = node("obey.mjs", ["--project", bad, "--json"]);
let rep = {};
try {
  rep = JSON.parse(ob.stdout);
} catch {}
const rules = (rep.findings || []).map((f) => `${f.rule}@${f.target}`);
ok("autoAlpha fade-up-slide caught", rules.includes("banned:fade-up-slide@#a"), rules.join(", "));
ok("css-wrapped fade-slide caught", rules.includes("banned:fade-slide@#b"), rules.join(", "));
ok("a custom function ease is judged by its shape, not refused (no custom-ease rule)", !rules.some((x) => x.startsWith("custom-ease")), rules.join(", "));
ok("keyframes-array fade-up-slide caught", rules.includes("banned:fade-up-slide@#k"), rules.join(", "));
ok("violations exit 2", ob.status === 2, `exit ${ob.status}`);
const broken = mk("broken", `throw new Error("boom"); const tl=gsap.timeline({paused:true}); tl.to("#a",{x:1,duration:0.7,ease:"expo.out"}); window.__timelines["m"]=tl;`, gsap);
const ob2 = node("obey.mjs", ["--project", broken]);
ok("broken composition is could-not-run (exit 1), never clean", ob2.status === 1 && /could-not-run/.test(ob2.stdout), `exit ${ob2.status}: ${ob2.stdout.split("\n")[0]}`);

// 4
const bd = path.join(TMP, "board");
fs.mkdirSync(bd, { recursive: true });
node("motion-md.mjs", ["write", "--personality", "soft-drift", "--out", path.join(bd, "motion.md")]);
fs.writeFileSync(path.join(bd, "kf.json"), JSON.stringify({ aspect: "9:16", shots: [{ id: "s1", elements: [{ id: "t", role: "headline", text: "Hi" }, { id: "u", role: "label", text: "x" }], poses: [{ t: 0, state: { t: { opacity: 0 }, u: { opacity: 0, y: 3 } } }, { t: 1.2, state: { t: { opacity: 1 } } }, { t: 2.4, state: { u: { opacity: 1, y: 0 } } }, { t: 4.2, state: {} }] }] }));
const bv = node("board.mjs", ["--poses", path.join(bd, "kf.json"), "--motion", path.join(bd, "motion.md"), "--validate"]);
ok("board flags a banned pose pair (exit 3)", bv.status === 3 && /fade-up-slide/.test(bv.stdout), `exit ${bv.status}`);

// 5
node("memory.mjs", ["record", "--step", "motion", "--value", "retro-terminal", "--mode", "confirmed"]);
for (const count of ["3", "6"]) {
  const p = node("pick.mjs", ["motion", "--count", count, "--seed", "x"]);
  let r = {};
  try {
    r = JSON.parse(p.stdout);
  } catch {}
  ok(`pick --count ${count}: 2+ tail candidates, auto never the remembered pick`, r.tail_count >= 2 && r.auto && r.auto.pick !== "retro-terminal", p.stdout.slice(0, 200));
}

// 5b taste ledger: record, digest, cap, clear
{
  const th = path.join(TMP, "taste-home");
  const tenv = { ...env, RASANAI_HOME: th };
  const mem = (a) => spawnSync(process.execPath, [path.join(HERE, "memory.mjs"), ...a], { encoding: "utf8", env: tenv, cwd: TMP });
  ok("taste: empty ledger says so", /No taste notes/.test(mem(["taste"]).stdout));
  const r1 = mem(["edit", "--film", "f1", "--stage", "animatic", "--note", "Slower", "--scene", "s2", "--t", "4.5"]);
  mem(["edit", "--film", "f2", "--stage", "final", "--note", "slower!"]);
  mem(["verdict", "--film", "f2", "--stage", "final", "--note", "Too busy in the middle"]);
  ok("taste: record writes a row with film, stage, note, ts, scene and time", (() => { const r = JSON.parse(r1.stdout); return r.kind === "edit" && r.film === "f1" && r.stage === "animatic" && r.note === "Slower" && r.scene === "s2" && r.t === 4.5 && !!r.ts; })(), r1.stdout + r1.stderr);
  ok("taste: a bad stage is refused", mem(["edit", "--film", "f", "--stage", "x", "--note", "n"]).status !== 0);
  const dg = mem(["taste"]).stdout;
  ok("taste: digest leads with the repeated theme, then the latest", /Recurring:\n- x2 \(2 films\) slower!?/i.test(dg) && /Too busy in the middle/.test(dg) && dg.indexOf("Recurring") < dg.indexOf("Latest"), dg);
  for (let i = 0; i < 560; i++) fs.appendFileSync(path.join(th, "taste.jsonl"), JSON.stringify({ ts: "2026-01-01T00:00:00Z", kind: "edit", film: "bulk" + (i % 7), stage: "final", note: "note number " + i + " " + "word ".repeat(40) }) + "\n");
  mem(["edit", "--film", "f3", "--stage", "final", "--note", "trigger trim"]);
  const rows = fs.readFileSync(path.join(th, "taste.jsonl"), "utf8").split("\n").filter(Boolean).length;
  const big = mem(["taste", "--raw"]).stdout; // the raw ledger digest keeps its own 1800-character cap; `taste` is now the lessons digest plus this
  ok("taste: the ledger keeps at most 500 rows and the digest stays under 1800 characters", rows === 500 && big.length <= 1800 && /trigger trim/.test(big), `rows ${rows}, digest ${big.length}`);
  const one = JSON.parse(mem(["taste-clear", "--film", "f3"]).stdout);
  ok("taste: clear --film removes only that film", one.cleared === 1 && one.left === 499, JSON.stringify(one));
  mem(["taste-clear"]);
  ok("taste: clear forgets everything", !fs.existsSync(path.join(th, "taste.jsonl")) && /No taste notes/.test(mem(["taste"]).stdout));
}

// 6
const run = path.join(TMP, "console-run");
const sv = node("console.mjs", ["serve", "--run", run, "--root", TMP]);
let url = "";
try {
  url = JSON.parse(sv.stdout).url;
} catch {}
ok("console serves", /^http:\/\/127\.0\.0\.1:\d+\/\?t=/.test(url), sv.stdout + sv.stderr);
if (url) {
  const u = new URL(url);
  node("console.mjs", ["push", "--run", run, "--step", "concept", "--data", '{"question":"q","options":[{"id":"c1","title":"One"}]}']);
  const pageRes = await fetch(url).catch(() => null);
  const page = pageRes ? pageRes.status : 0;
  const cookie = pageRes ? (pageRes.headers.get("set-cookie") || "").split(";")[0] : "";
  const noTok = await fetch(`${u.origin}/`).then((r) => r.status).catch(() => 0);
  ok("console page needs the token", page === 200 && noTok === 403, `with ${page}, without ${noTok}`);
  const stateNoCookie = await fetch(`${u.origin}/api/state`).then((r) => r.status).catch(() => 0);
  ok("console state and files need the session cookie", stateNoCookie === 403 && !!cookie, `state without cookie: ${stateNoCookie}`);
  const post = await fetch(`${u.origin}/api/action`, { method: "POST", headers: { "content-type": "application/json", "x-rasa-token": u.searchParams.get("t"), cookie }, body: JSON.stringify({ step: "concept", type: "choose", value: "c1" }) }).then((r) => r.status).catch(() => 0);
  const w = node("console.mjs", ["wait", "--run", run, "--step", "concept", "--timeout", "10"]);
  let a = {};
  try {
    a = JSON.parse(w.stdout);
  } catch {}
  ok("console action reaches wait", post === 200 && a.type === "choose" && a.value === "c1", w.stdout);
  const esc = await fetch(`${u.origin}/fs/abs/etc/passwd`, { headers: { cookie } }).then((r) => r.status).catch(() => 0);
  ok("console refuses files outside allowed roots", esc === 403, `got ${esc}`);
  const tokFile = await fetch(`${u.origin}/fs/abs${run}/console.json`, { headers: { cookie } }).then((r) => r.status).catch(() => 0);
  ok("console never serves its own token file", tokFile === 403, `got ${tokFile}`);
  // the real-3D specimens: presets3d.js and the Rasan3D runtime are served (cookie only), nothing outside stage3d/ is
  const p3 = await fetch(`${u.origin}/presets3d.js`, { headers: { cookie } });
  const r3 = await fetch(`${u.origin}/three/rasan3d.js`, { headers: { cookie } });
  const r3body = r3.status === 200 ? await r3.text() : "";
  const trav = await fetch(`${u.origin}/three/%2e%2e/SKILL.md`, { headers: { cookie } }).then((r) => r.status).catch(() => 0);
  const trav2 = await fetch(`${u.origin}/three/..%2fSKILL.md`, { headers: { cookie } }).then((r) => r.status).catch(() => 0);
  const tmpl = await fetch(`${u.origin}/three/templates/`, { headers: { cookie } }).then((r) => r.status).catch(() => 0);
  const raw = await fetch(`${u.origin}/three/../SKILL.md`, { headers: { cookie } }).then((r) => r.status).catch(() => 0);
  const nock = await fetch(`${u.origin}/three/rasan3d.js`).then((r) => r.status).catch(() => 0);
  ok("console serves /presets3d.js and /three/rasan3d.js (cookie only), refuses /three/../SKILL.md and templates/", p3.status === 200 && r3.status === 200 && /javascript/.test(r3.headers.get("content-type") || "") && /Rasan3D/.test(r3body) && nock === 403 && [trav, trav2, raw, tmpl].every((c) => c >= 400), `presets3d ${p3.status}, runtime ${r3.status}, no cookie ${nock}, traversal ${trav}/${trav2}/${raw}, templates ${tmpl}`);
  // a range request on an empty file and a null body must not take the server down
  fs.mkdirSync(path.join(TMP, "media"), { recursive: true });
  fs.writeFileSync(path.join(TMP, "media", "empty.mp4"), "");
  const rng = await fetch(`${u.origin}/fs/rel/media/empty.mp4`, { headers: { cookie, range: "bytes=0-" } }).then((r) => r.status).catch(() => 0);
  const nul = await fetch(`${u.origin}/api/action`, { method: "POST", headers: { "content-type": "application/json", "x-rasa-token": u.searchParams.get("t"), cookie }, body: "null" }).then((r) => r.status).catch(() => 0);
  const alive = await fetch(`${u.origin}/api/state`, { headers: { cookie } }).then((r) => r.status).catch(() => 0);
  ok("console survives a range on an empty file and a null body", rng === 416 && nul === 400 && alive === 200, `range ${rng}, null ${nul}, alive ${alive}`);
  const rebind = await new Promise((resolve) => {
    import("node:http").then(({ default: http }) => {
      const r = http.get({ host: "127.0.0.1", port: u.port, path: "/api/state", headers: { host: `evil.example:${u.port}`, cookie } }, (res) => resolve(res.statusCode));
      r.on("error", () => resolve(0));
    });
  });
  ok("console rejects foreign Host headers (DNS rebinding)", rebind === 421, `got ${rebind}`);
  // the live feed: pushes, Claude's activity and the user's answers (by name) all show, and the status knows who's up
  node("console.mjs", ["activity", "--run", run, "--message", "Drawing style frame 2 of 3"]);
  let st = {};
  try {
    st = JSON.parse(fs.readFileSync(path.join(run, "session.json"), "utf8"));
  } catch {}
  const msgs = (st.activity || []).map((x) => x.msg);
  ok("console feed: questions, your answers by name, and what Claude is doing", msgs.includes("Ready for you: the story") && msgs.includes("You: picked the story: One") && st.working && st.working.msg === "Drawing style frame 2 of 3", JSON.stringify(msgs));
  // a console that stops comes back on the same address with the next push (the open tab reconnects by itself)
  {
    const c0 = JSON.parse(fs.readFileSync(path.join(run, "console.json"), "utf8"));
    try { process.kill(c0.pid); } catch {}
    await new Promise((r) => setTimeout(r, 600));
    node("console.mjs", ["push", "--run", run, "--step", "concept", "--data", '{"question":"again","options":[{"id":"c1","title":"One"}]}']);
    let c1 = {};
    try { c1 = JSON.parse(fs.readFileSync(path.join(run, "console.json"), "utf8")); } catch {}
    const back = await fetch(`${new URL(c0.url).origin}/api/state`, { headers: { cookie } }).then((r) => r.status).catch(() => 0);
    ok("console that stops is restarted on the same address by the next push", c1.url === c0.url && c1.pid !== c0.pid && back === 200, `before ${c0.url}, after ${c1.url}, state ${back}`);
  }
  // scripts and the plugin hook report into the current run's feed; console plumbing stays out of it
  {
    fs.mkdirSync(path.join(TMP, ".rasanai"), { recursive: true });
    fs.writeFileSync(path.join(TMP, ".rasanai", "current"), path.relative(TMP, run));
    const hook = (j) => spawnSync(process.execPath, [path.join(HERE, "hook-activity.mjs")], { input: JSON.stringify({ cwd: TMP, ...j }), encoding: "utf8", env, timeout: 10000 });
    hook({ tool_name: "Bash", tool_input: { command: "node build.mjs", description: "Rendering the preview" } });
    hook({ tool_name: "Bash", tool_input: { command: "node console.mjs wait --run x", description: "Wait for the user" } });
    hook({ tool_name: "Write", tool_input: { file_path: "videos/a/compositions/scene-03.html" } });
    node("motion-md.mjs", ["write", "--personality", "swiss-precise", "--out", path.join(TMP, "motion-feed.md")]);
    const feed = JSON.parse(fs.readFileSync(path.join(run, "session.json"), "utf8")).activity.map((x) => x.msg);
    ok("live feed: scripts and Claude's actions show up, console plumbing doesn't", feed.includes("Rendering the preview") && feed.includes("Writing scene-03.html") && feed.includes("Motion rules written") && !feed.includes("Wait for the user"), JSON.stringify(feed.slice(-6)));
    fs.rmSync(path.join(TMP, ".rasanai"), { recursive: true, force: true });
  }
  // a question outside the steps goes on the page as its own card, and the answer comes back through wait
  {
    node("console.mjs", ["ask", "--run", run, "--question", "The capture is thin. Go on?", "--options", '[{"id":"a","label":"Send material"},{"id":"b","label":"Go with what is visible"}]', "--recommended", "b"]);
    const st0 = JSON.parse(fs.readFileSync(path.join(run, "session.json"), "utf8"));
    const posted = await fetch(`${u.origin}/api/action`, { method: "POST", headers: { "content-type": "application/json", "x-rasa-token": u.searchParams.get("t"), cookie }, body: JSON.stringify({ step: st0.ask.step, type: "answer", value: { ask: st0.ask.id, choice: "a", text: "https://example.com/notes" } }) }).then((r) => r.status).catch(() => 0);
    const w2 = node("console.mjs", ["wait", "--run", run, "--timeout", "10"]);
    let a2 = {};
    try { a2 = JSON.parse(w2.stdout); } catch {}
    const st1 = JSON.parse(fs.readFileSync(path.join(run, "session.json"), "utf8"));
    ok("console ask: a question card, answered on the page, back through wait, flow unmoved", posted === 200 && a2.type === "answer" && a2.value.choice === "a" && st1.ask.answered && st1.current === st0.current, w2.stdout);
  }
  // a console started by an older version is replaced, never reused (it would serve the old page)
  const cj = path.join(run, "console.json");
  const old = JSON.parse(fs.readFileSync(cj, "utf8"));
  fs.writeFileSync(cj, JSON.stringify({ ...old, version: "0.0.1" }));
  let again = {};
  try {
    again = JSON.parse(node("console.mjs", ["serve", "--run", run, "--root", TMP]).stdout);
  } catch {}
  ok("console from an older version is replaced (a new server, same address), not reused", !!again.url && !again.reused && again.pid !== old.pid && again.url === old.url, JSON.stringify(again));
  node("console.mjs", ["stop", "--run", run]);
}

// 6b. headless console (RasanAI Studio): no server, files only; wait applies an action's effects when it consumes it
{
  const hrun = path.join(TMP, "headless-run");
  const henv = { ...env, RASANAI_CONSOLE_HEADLESS: "1" };
  const h = (args, o = {}) => spawnSync(process.execPath, [path.join(HERE, "console.mjs"), ...args], { encoding: "utf8", env: henv, cwd: TMP, timeout: 30000, ...o });
  const J = (f) => JSON.parse(fs.readFileSync(path.join(hrun, f), "utf8"));
  const append = (a) => fs.appendFileSync(path.join(hrun, "actions.jsonl"), JSON.stringify(a) + "\n");
  const srv = h(["serve", "--run", hrun, "--root", TMP]);
  ok("headless: serve is a no-op and starts nothing", srv.status === 0 && JSON.parse(srv.stdout).headless === true && !fs.existsSync(path.join(hrun, "address.json")) && !J("console.json").pid, srv.stdout + srv.stderr);
  const urlRes = h(["url", "--run", hrun]);
  ok("headless: url explains there is no page", urlRes.status !== 0 && /headless/.test(urlRes.stderr + urlRes.stdout));
  h(["push", "--run", hrun, "--step", "story", "--data", '{"stories":[{"id":"shoebox","title":"The shoebox wins"},{"id":"b","title":"B"}],"recommended":"shoebox"}']);
  h(["activity", "--run", hrun, "--message", "Writing three scripts"]);
  h(["ask", "--run", hrun, "--question", "Include the logo?", "--options", '[{"id":"y","label":"Yes"},{"id":"n","label":"No"}]']);
  const st0 = J("session.json");
  ok("headless: push, activity and ask write session.json with no server, and the run stays headless without the env var", st0.steps.story.status === "awaiting" && st0.ask && st0.activity.some((x) => x.msg === "Writing three scripts") && !fs.existsSync(path.join(hrun, "address.json")) && h(["state", "--run", hrun], { env: env }).status === 0 && J("console.json").headless === true);
  // a later command without the env var is still headless (console.json remembers it), so it can never start a server
  const noEnv = spawnSync(process.execPath, [path.join(HERE, "console.mjs"), "push", "--run", hrun, "--step", "look", "--data", "{}"], { encoding: "utf8", env, cwd: TMP });
  ok("headless: remembered in console.json, push without the env var starts no server", noEnv.status === 0 && !fs.existsSync(path.join(hrun, "address.json")) && !J("console.json").pid, noEnv.stdout + noEnv.stderr);
  h(["push", "--run", hrun, "--step", "story", "--data", '{"stories":[{"id":"shoebox","title":"The shoebox wins"},{"id":"b","title":"B"}],"recommended":"shoebox"}']);
  // an action appended by the app (as the server would have) is consumed by wait, with the server's session effects
  append({ id: "act1", ts: "2026-01-01T00:00:00.000Z", step: "story", type: "choose", value: "shoebox", note: "but shorter", source: "console" });
  const w = h(["wait", "--run", hrun, "--step", "story", "--timeout", "10"]);
  let a = {};
  try { a = JSON.parse(w.stdout); } catch {}
  const st1 = J("session.json");
  const feed = st1.activity.map((x) => x.msg);
  ok("headless: wait returns the exact action", w.status === 0 && a.id === "act1" && a.step === "story" && a.type === "choose" && a.value === "shoebox" && a.note === "but shorter" && a.source === "console", w.stdout);
  ok("headless: wait applies the effects (sent banner with the option's name, 'You: picked' line, the thread note)", st1.steps.story.sent && st1.steps.story.sent.type === "choose" && st1.steps.story.sent.name === "The shoebox wins" && feed.includes("You: picked the story: The shoebox wins") && st1.steps.story.thread.some((m) => m.who === "you" && m.text === "but shorter") && J("consumed.json").includes("act1"), JSON.stringify({ sent: st1.steps.story.sent, feed: feed.slice(-3) }));
  // a re-push clears the banner and keeps the thread, as on the server
  h(["push", "--run", hrun, "--step", "story", "--data", '{"stories":[{"id":"shoebox","title":"The shoebox wins"}]}', "--status", "done"]);
  ok("headless: re-push clears the sent banner and keeps the thread", !J("session.json").steps.story.sent && J("session.json").steps.story.thread.length === 1);
  // a note pinned on the animatic, then an answer to the ask, then a decide-rest
  append({ id: "cmt1", ts: "2026-01-01T00:00:01.000Z", step: "animatic", type: "comment", value: { scene: "s2", t: 65.5, x: 0.4, y: 0.6, scope: "scene", quick: "Slower" }, note: "slow this down", source: "console" });
  const wc = JSON.parse(h(["wait", "--run", hrun, "--timeout", "10"]).stdout);
  const st2 = J("session.json");
  ok("headless: a comment becomes an open note and a feed line", wc.type === "comment" && st2.comments.length === 1 && st2.comments[0].id === "cmt1" && st2.comments[0].state === "open" && st2.comments[0].t === 65.5 && st2.comments[0].quick === "Slower" && st2.activity.at(-1).msg === "You left a note at 1:05: slow this down", JSON.stringify(st2.comments));
  const tl = (() => { try { return fs.readFileSync(path.join(TMP, "home", "taste.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } })();
  ok("taste: a note consumed by headless wait (the Studio path) lands in the ledger as an edit on the animatic", tl.length === 1 && tl[0].kind === "edit" && tl[0].stage === "animatic" && tl[0].note === "slow this down" && tl[0].scene === "s2" && tl[0].t === 65.5, JSON.stringify(tl));
  append({ id: "ans1", ts: "2026-01-01T00:00:02.000Z", step: st0.ask.step, type: "answer", value: { ask: st0.ask.id, choice: "y", text: "" }, note: "", source: "console" });
  const wa = JSON.parse(h(["wait", "--run", hrun, "--timeout", "10"]).stdout);
  const st3 = J("session.json");
  ok("headless: an answer marks the ask answered", wa.type === "answer" && st3.ask.answered && st3.ask.answered.choice === "y" && st3.ask.answered.label === "Yes" && st3.activity.at(-1).msg === "You answered: Yes");
  append({ id: "dr1", ts: "2026-01-01T00:00:03.000Z", step: "*", type: "decide-rest", value: null, note: "", source: "console" });
  const wd = JSON.parse(h(["wait", "--run", hrun, "--timeout", "10"]).stdout);
  ok("headless: decide-rest is recorded on the session", wd.step === "*" && J("session.json").decide_rest.ts === "2026-01-01T00:00:03.000Z");
  // invalid actions are consumed with a reason, never delivered, and never crash wait
  fs.appendFileSync(path.join(hrun, "actions.jsonl"), "this is not json\n[1,2]\n");
  append({ id: "bad1", step: "nonsense", type: "choose" });
  append({ id: "bad2", step: "story", type: "Not Valid!" });
  append({ id: "act2", ts: "2026-01-01T00:00:04.000Z", step: "story", type: "approve", value: null, note: "", source: "console" });
  const wi = h(["wait", "--run", hrun, "--timeout", "10"]);
  let ai = {};
  try { ai = JSON.parse(wi.stdout); } catch {}
  const rej = J("rejected.json");
  ok("headless: invalid actions are consumed with an error entry and the next valid one is delivered", wi.status === 0 && ai.id === "act2" && rej.length === 4 && rej.every((r) => r.error) && ["bad1", "bad2"].every((id) => J("consumed.json").includes(id) && rej.some((r) => r.id === id)), wi.stdout + JSON.stringify(rej));
  // a half-written last line is left alone until its newline arrives
  fs.appendFileSync(path.join(hrun, "actions.jsonl"), '{"id":"part1","step":"story","type":"note","value":null,"note":"hel');
  const wp = h(["wait", "--run", hrun, "--timeout", "1"]);
  ok("headless: a partially written line is not consumed or rejected", wp.status === 2 && !J("consumed.json").includes("part1"));
  fs.appendFileSync(path.join(hrun, "actions.jsonl"), 'lo","source":"console"}\n');
  const wq = JSON.parse(h(["wait", "--run", hrun, "--timeout", "10"]).stdout);
  ok("headless: ... and is delivered once complete", wq.id === "part1" && wq.note === "hello");
  // record (chat) stays consumed; wait times out cleanly
  const rc = JSON.parse(h(["record", "--run", hrun, "--step", "look", "--type", "choose", "--value", '"bold"']).stdout);
  ok("headless: record is already consumed", rc.source === "chat" && J("consumed.json").includes(rc.id) && h(["wait", "--run", hrun, "--timeout", "1"]).status === 2);
  ok("headless: no console server was started in this run", !fs.existsSync(path.join(hrun, "address.json")) && !J("console.json").pid && !fs.existsSync(path.join(hrun, "session.lock")) && !fs.existsSync(path.join(hrun, "actions.lock")));
  // a run an older Studio started (console server + address.json) is switched to headless on the next command
  const old = path.join(TMP, "headless-old");
  const sv2 = node("console.mjs", ["serve", "--run", old, "--root", TMP]);
  // serve detaches: on a slow machine console.json can land a moment after it returns
  for (let i = 0; i < 50 && !fs.existsSync(path.join(old, "console.json")); i++) await new Promise((r) => setTimeout(r, 100));
  const oldInfo = JSON.parse(fs.readFileSync(path.join(old, "console.json"), "utf8"));
  spawnSync(process.execPath, [path.join(HERE, "console.mjs"), "activity", "--run", old, "--message", "resumed"], { encoding: "utf8", env: henv, cwd: TMP });
  await new Promise((r) => setTimeout(r, 400));
  let serverGone = false;
  try { process.kill(oldInfo.pid, 0); } catch { serverGone = true; }
  ok("headless: resuming a run that had a console server stops it and forgets its address", sv2.status === 0 && serverGone && !fs.existsSync(path.join(old, "address.json")) && JSON.parse(fs.readFileSync(path.join(old, "console.json"), "utf8")).headless === true);
}

// 7
{
  const d = path.join(TMP, "multi");
  const t = node("tasting.mjs", ["--scenes", "Tax season. Again.::the shoebox wins || One tap. Done. || tally.app", "--personalities", "swiss-precise,swiss-precise", "--out", d]);
  node("motion-md.mjs", ["write", "--personality", "swiss-precise", "--out", path.join(d, "motion.md")]);
  const o = node("obey.mjs", ["--project", d]);
  ok("multi-scene tasting cell obeys its motion.md", t.status === 0 && o.status === 0, (t.stderr || "") + o.stdout.split("\n")[0]);

  const sj = path.join(TMP, "scenes.json");
  const S = { title: "T", message: "One tap books", aspect: "16:9", narration: true, transition_default: "blur-crossfade", scenes: [
    { title: "Hook", on_screen: "Tax season. Again.", voiceover: "Every spring, the shoebox wins.", duration: 4, type: "hook", intensity: "high" },
    { title: "Turn", on_screen: "One tap.", voiceover: "Snap it once.", duration: 3, transition_in: "push-slide LEFT" },
    { title: "Close", on_screen: "tally.app", voiceover: "Tally.", duration: 3, type: "cta" }] };
  fs.writeFileSync(sj, JSON.stringify(S));
  const sc = node("scenes.mjs", ["--scenes", sj, "--route", "product-launch-video", "--out", path.join(TMP, "plan")]);
  const sb = fs.existsSync(path.join(TMP, "plan", "STORYBOARD.md")) ? fs.readFileSync(path.join(TMP, "plan", "STORYBOARD.md"), "utf8") : "";
  ok("scenes.mjs writes a 3-frame storyboard + script", sc.status === 0 && (sb.match(/^## Frame \d+ — /gm) || []).length === 3 && /transition_in: push-slide LEFT/.test(sb) && fs.existsSync(path.join(TMP, "plan", "SCRIPT.md")), sc.stderr || sc.stdout.slice(0, 200));
  fs.writeFileSync(sj, JSON.stringify({ ...S, scenes: S.scenes.map((x, i) => (i === 1 ? { ...x, transition_in: "spin-wildly", duration: 0 } : x)) }));
  const bad2 = node("scenes.mjs", ["--scenes", sj, "--route", "product-launch-video", "--out", path.join(TMP, "plan-bad")]);
  ok("scenes.mjs rejects an unknown transition and a zero duration", bad2.status === 1 && /spin-wildly/.test(bad2.stderr) && /positive/.test(bad2.stderr), bad2.stderr);
  // the story's own roles (ladder open/rung/ways_in/close, scenario proof/turn, older hero/demo/payoff) map onto the workflow's scene types
  const roleScenes = ["open", "rung", "ways_in", "close", "proof", "turn", "hero", "demo", "payoff"].map((type, i) => ({ title: `R${i + 1}`, on_screen: `Line ${i + 1}`, voiceover: `Say ${i + 1}.`, duration: 3, type }));
  fs.writeFileSync(sj, JSON.stringify({ ...S, scenes: roleScenes }));
  const rm = node("scenes.mjs", ["--scenes", sj, "--route", "product-launch-video", "--out", path.join(TMP, "plan-roles")]);
  let rtl = {}; try { rtl = JSON.parse(fs.readFileSync(path.join(TMP, "plan-roles", "timeline.json"), "utf8")); } catch {}
  const rtypes = ((rtl.scenes || rtl.frames || []).map((x) => x.type)).join();
  ok("scenes.mjs maps story roles onto scene types (open hook, rung feature_showcase, ways_in benefit_highlight, close cta, hero product_intro)", rm.status === 0 && rtypes === "hook,feature_showcase,benefit_highlight,cta,feature_showcase,benefit_highlight,product_intro,feature_showcase,benefit_highlight", rm.stderr + rtypes);
  fs.writeFileSync(sj, JSON.stringify({ ...S, scenes: S.scenes.map((x, i) => (i === 1 ? { ...x, type: "spin" } : x)) }));
  const rb = node("scenes.mjs", ["--scenes", sj, "--route", "product-launch-video", "--out", path.join(TMP, "plan-roles-bad")]);
  ok("scenes.mjs still rejects a type that is neither a scene type nor a story role", rb.status === 1 && /type "spin"/.test(rb.stderr), rb.stderr);

  const { contractText, upsertContract } = await import(path.join(HERE, "lib", "contract.mjs"));
  const md = fs.readFileSync(path.join(d, "motion.md"), "utf8");
  const { readFrontmatterDoc } = await import(path.join(HERE, "lib", "common.mjs"));
  const M = readFrontmatterDoc(md).fields;
  const once = upsertContract("# Frame\n\nbody\n", contractText(M, { video: true }));
  ok("contract upsert is idempotent", upsertContract(once, contractText(M, { video: true })) === once && once.split("rasanai:motion-contract").length === 2);

  const pd = path.join(TMP, "proj");
  fs.mkdirSync(path.join(pd, ".hyperframes", "frame-packets"), { recursive: true });
  fs.copyFileSync(path.join(d, "motion.md"), path.join(pd, "motion.md"));
  fs.writeFileSync(path.join(pd, ".hyperframes", "frame-packets", "01.md"), "# Frame 1\n\npacket\n");
  fs.writeFileSync(path.join(pd, ".hyperframes", "frame-packets", "_index.md"), "index\n");
  node("video.mjs", ["inject", "--project-dir", pd]);
  const inj = node("video.mjs", ["inject", "--project-dir", pd]);
  const p1 = fs.readFileSync(path.join(pd, ".hyperframes", "frame-packets", "01.md"), "utf8");
  ok("inject adds the contract to frame packets once, skips _ files", inj.status === 0 && p1.split("rasanai:motion-contract").length === 2 && fs.readFileSync(path.join(pd, ".hyperframes", "frame-packets", "_index.md"), "utf8") === "index\n", inj.stderr);
  fs.writeFileSync(path.join(pd, "audio_meta.json"), JSON.stringify({ voices: [{ id: 1 }], bgm_pending: true }));
  fs.writeFileSync(path.join(TMP, "bed.wav"), "RIFF");
  const al = node("video.mjs", ["audio-lock", "--project-dir", pd, "--music", path.join(TMP, "bed.wav")]);
  const meta = JSON.parse(fs.readFileSync(path.join(pd, "audio_meta.json"), "utf8"));
  ok("audio-lock points bgm at the chosen track (ducked under narration)", al.status === 0 && meta.bgm.path === "assets/music-bed.wav" && meta.bgm.volume === 0.12 && !("bgm_pending" in meta), al.stderr);

  const { findSkill } = await import(path.join(HERE, "lib", "hyperframes.mjs"));
  if (["product-launch-video", "faceless-explainer", "pr-to-video"].some((r) => findSkill(r))) {
    const tm = node("transition-menu.mjs", ["--from", "Tax season. Again.", "--to", "One tap.", "--out", path.join(TMP, "tmenu")]);
    let tj = {};
    try {
      tj = JSON.parse(tm.stdout);
    } catch {}
    ok("transitions menu renders every registry transition", tm.status === 0 && (tj.cells || []).length >= 6, tm.stderr || tm.stdout.slice(0, 200));
  } else console.log("skip  transitions menu (no HyperFrames launch/explainer workflow installed)");
}

// 8
if (spawnSync("ffmpeg", ["-version"]).status === 0) {
  const raw = path.join(TMP, "raw");
  fs.mkdirSync(raw, { recursive: true });
  const ff = (a) => spawnSync("ffmpeg", ["-y", "-loglevel", "error", ...a], { encoding: "utf8" });
  ff(["-f", "lavfi", "-i", "testsrc2=size=640x360:rate=25", "-f", "lavfi", "-i", "sine=f=440", "-t", "4", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", path.join(raw, "a.mp4")]);
  ff(["-f", "lavfi", "-i", "smptebars=size=640x360:rate=30", "-t", "4", "-c:v", "libx264", "-pix_fmt", "yuv420p", path.join(raw, "b0.mp4")]);
  ff(["-display_rotation:v:0", "90", "-i", path.join(raw, "b0.mp4"), "-c", "copy", path.join(raw, "b rot.mp4")]);
  fs.rmSync(path.join(raw, "b0.mp4"));
  const sc = node("reel.mjs", ["scan", "--footage", raw, "--run", path.join(TMP, "rrun"), "--no-transcribe"]);
  let fj = {};
  try {
    fj = JSON.parse(fs.readFileSync(path.join(TMP, "rrun", "footage", "footage.json"), "utf8"));
  } catch {}
  const rot = (fj.clips || []).find((c) => c.name === "b rot.mp4") || {};
  const snd = (fj.clips || []).find((c) => c.name === "a.mp4") || {};
  ok("reel scan reads rotation, sound and draws contact sheets", sc.status === 0 && rot.width === 360 && rot.height === 640 && rot.has_audio === false && snd.has_audio === true && fs.existsSync(path.join(TMP, snd.sheet || "none")), sc.stderr || JSON.stringify(rot));
  const proj = path.join(TMP, "videos", "reel");
  fs.mkdirSync(proj, { recursive: true });
  fs.writeFileSync(path.join(proj, "hyperframes.json"), "{}\n");
  node("motion-md.mjs", ["write", "--personality", "editorial-mask", "--out", path.join(TMP, "rrun", "motion.md")]);
  fs.writeFileSync(path.join(TMP, "rrun", "reel.json"), JSON.stringify({ title: "t", aspect: "9:16", fps: 30, footage_dir: raw, motion: path.join(TMP, "rrun", "motion.md"), cards_by: "swatch", timeline: [{ type: "card", text: "Opening", duration: 5 }, { type: "clip", clip: "a.mp4", in: 0.5, out: 3.5, transition_in: "cut" }, { type: "clip", clip: "b rot.mp4", in: 0, out: 3, transition_in: "wipe" }], overlays: [{ text: "Name", sub: "Role", start: 6, duration: 3 }] }));
  const bd = node("reel.mjs", ["build", "--reel", path.join(TMP, "rrun", "reel.json"), "--project-dir", proj, "--no-lint"]);
  let bj = {};
  try {
    bj = JSON.parse(bd.stdout);
  } catch {}
  const idx = fs.existsSync(path.join(proj, "index.html")) ? fs.readFileSync(path.join(proj, "index.html"), "utf8") : "";
  // 5s card + 3s + 3s, minus one editorial-mask scale step (450ms) for the wipe
  ok("reel build times the cut (card sized to 5s, wipe overlaps one scale step)", bd.status === 0 && Math.abs(bj.total_s - 10.55) < 0.06, bd.stderr || JSON.stringify({ total: bj.total_s, warnings: bj.warnings }));
  const staged = fs.existsSync(path.join(proj, "assets", "footage")) ? fs.readdirSync(path.join(proj, "assets", "footage")) : [];
  const dims = staged.map((f) => spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,avg_frame_rate", "-of", "csv=p=0", path.join(proj, "assets", "footage", f)], { encoding: "utf8" }).stdout.trim());
  ok("reel segments conformed to 1080x1920 at 30fps; one audio track per sounding clip", staged.length === 2 && dims.every((d) => d === "1080,1920,30/1") && (idx.match(/<audio /g) || []).length === 1 && (idx.match(/<video /g) || []).length === 2, JSON.stringify(dims));
  ok("reel cards, overlays and the wipe obey motion.md", bj.checks && bj.checks.obey && bj.checks.obey.status === "clean" && fs.existsSync(path.join(proj, "compositions", "reel-card-01.html")) && fs.existsSync(path.join(proj, "compositions", "reel-overlay-01.html")), JSON.stringify(bj.checks && bj.checks.obey));
  fs.writeFileSync(path.join(TMP, "rrun", "bad.json"), JSON.stringify({ footage_dir: raw, timeline: [{ type: "clip", clip: "a.mp4", in: 3, out: 9 }, { type: "clip", clip: "missing.mov" }] }));
  const bad3 = node("reel.mjs", ["build", "--reel", path.join(TMP, "rrun", "bad.json"), "--project-dir", path.join(TMP, "videos", "bad"), "--no-lint"]);
  ok("reel build lists every problem before touching anything", bad3.status === 1 && /past the clip's end/.test(bad3.stderr) && /missing\.mov/.test(bad3.stderr) && !fs.existsSync(path.join(TMP, "videos", "bad")), bad3.stderr);
  // Claude-authored card: refused while missing, mounted and obey-checked once written
  const proj2 = path.join(TMP, "videos", "reel2");
  fs.mkdirSync(proj2, { recursive: true });
  fs.writeFileSync(path.join(proj2, "hyperframes.json"), "{}\n");
  fs.writeFileSync(path.join(TMP, "rrun", "reel2.json"), JSON.stringify({ title: "t2", aspect: "9:16", fps: 30, footage_dir: raw, motion: path.join(TMP, "rrun", "motion.md"), timeline: [{ type: "card", text: "Hello", duration: 3 }, { type: "clip", clip: "a.mp4", in: 0, out: 2 }] }));
  const miss = node("reel.mjs", ["build", "--reel", path.join(TMP, "rrun", "reel2.json"), "--project-dir", proj2, "--no-lint"]);
  const br = node("reel.mjs", ["briefs", "--reel", path.join(TMP, "rrun", "reel2.json"), "--project-dir", proj2]);
  const brief = path.join(proj2, "compositions", "cards", "card-01.brief.md");
  ok("reel refuses a missing Claude card and writes its brief", miss.status === 1 && /card-01/.test(miss.stderr) && br.status === 0 && fs.existsSync(brief) && /Motion contract/.test(fs.readFileSync(brief, "utf8")), miss.stderr + br.stderr);
  fs.writeFileSync(path.join(proj2, "compositions", "cards", "card-01.html"), `<!doctype html><html><head><meta charset="UTF-8"></head><body><template><style>#root{position:absolute;inset:0;width:1080px;height:1920px;background:#f4f1ea}#root h1{position:absolute;left:120px;top:800px;font:700 120px/1 Inter,sans-serif;color:#111}</style><div id="root" data-composition-id="card-01" data-width="1080" data-height="1920"><h1>Hello</h1></div><script>(function(){var r=document.querySelector('[data-composition-id="card-01"]');var tl=gsap.timeline({paused:true});tl.fromTo(r.querySelector("h1"),{clipPath:"inset(0% 0% 100% 0%)"},{clipPath:"inset(0% 0% 0% 0%)",duration:0.7,ease:"expo.out"},0.2);window.__timelines=window.__timelines||{};window.__timelines["card-01"]=tl;})();</script></template></body></html>`);
  const bd2 = node("reel.mjs", ["build", "--reel", path.join(TMP, "rrun", "reel2.json"), "--project-dir", proj2, "--no-lint"]);
  let bj2 = {};
  try {
    bj2 = JSON.parse(bd2.stdout);
  } catch {}
  ok("reel mounts Claude's card and obey checks it", bd2.status === 0 && bj2.checks && bj2.checks.obey.status === "clean" && /compositions\/cards\/card-01\.html/.test(fs.readFileSync(path.join(proj2, "index.html"), "utf8")), bd2.stderr || JSON.stringify(bj2.checks));
} else console.log("skip  footage reels (no ffmpeg)");

// 9
{
  const tv = node("taxonomy.mjs", ["validate"]);
  let tj = {};
  try {
    tj = JSON.parse(tv.stdout);
  } catch {}
  ok("taxonomy validates (32 dimensions, 900+ terms, combinations resolve)", tv.status === 0 && tj.dimensions >= 32 && tj.options >= 900 && tj.combinations >= 30, (tj.problems || []).slice(0, 5).join("; ") || tv.stderr);
  const langs = JSON.parse(fs.readFileSync(path.join(HERE, "..", "taxonomy", "dimensions", "motion-language.json"), "utf8")).options.map((o) => o.id);
  const bad = [];
  for (const id of quick ? langs.slice(0, 4) : langs) {
    const d = path.join(TMP, "lang", id);
    const t = node("tasting.mjs", ["--scenes", "Tax season. Again.::the shoebox wins || One tap. Done.", "--personalities", `lang-${id},lang-${id}`, "--out", d]);
    node("motion-md.mjs", ["write", "--language", id, "--out", path.join(d, "motion.md")]);
    const o = node("obey.mjs", ["--project", d]);
    if (t.status !== 0 || o.status !== 0 || !/0 error\(s\), 0 warning\(s\)/.test(o.stdout)) bad.push(`${id}: ${(t.stderr || o.stdout.split("\n")[0]).slice(0, 120)}`);
  }
  ok(`every motion-language swatch obeys its own contract (${quick ? 4 : langs.length})`, !bad.length, bad.join(" | "));

  const { readDesignMd, toFrameMd } = await import(path.join(HERE, "lib", "design-md.mjs"));
  const { readLook } = await import(path.join(HERE, "lib", "common.mjs"));
  const fx = path.join(TMP, "brands");
  fs.mkdirSync(fx, { recursive: true });
  fs.writeFileSync(path.join(fx, "spec.md"), `---\nname: Kinpaku\ncolors:\n  # anchors\n  gold: "oklch(84% 0.19 80.46)"   # primary accent\n\n  lacquer: "oklch(7% 0.006 95)"   # page ground\n  champagne: "oklch(91% 0 0)"     # headlines\n  success: "#22C55E"\ntypography:\n  display:\n    fontFamily: Alumni Sans\n    fontWeight: 600\n  body:\n    fontFamily: Albert Sans\n  mono:\n    fontFamily: SFMono-Regular\nrounded:\n  md: 6px\n---\n\n## Overview\n\nGold on lacquer.\n\n## Do and Do Not\n\n### Do\n- Use gold once per frame.\n\n### Do Not\n- Never use pure white.\n`);
  fs.writeFileSync(path.join(fx, "stitch.md"), `# Design System: Calm\n\n## 2. Color Palette & Roles\n- **Canvas White** (#F9FAFB) — Primary background surface\n- **Charcoal Ink** (#18181B) — Primary text\n- **Emerald Signal** (#10B981) — accent for growth\n\n## 3. Typography Rules\n- **Display:** \`Geist\`, \`Satoshi\` — tight tracking. \`Inter\` is BANNED for premium contexts\n- **Body:** Same family at weight 400\n\n### Banned Fonts\n- \`Inter\` — banned\n`);
  fs.writeFileSync(path.join(fx, "table.md"), `# Deck\n\n## Color\n\n| Token | Hex | Meaning |\n|---|---|---|\n| \`INK\` | \`1A1A1A\` | the answer |\n| \`INK_SOFT\` | \`333333\` | support |\n| \`CARD_TINT\` | \`F5F5F5\` | containment |\n| \`WHITE\` | \`FFFFFF\` | Background |\n\n## Typography\n\n- **Headlines:** Cambria bold\n- **Body:** Calibri\n`);
  const A = readDesignMd(path.join(fx, "spec.md")), B = readDesignMd(path.join(fx, "stitch.md")), C = readDesignMd(path.join(fx, "table.md"));
  ok("DESIGN.md spec: oklch colors, comment roles, nested fonts, platform-font mapping, rules", A.roles.accent === A.colors.find((c) => c.name === "gold").hex && A.roles.canvas === A.colors.find((c) => c.name === "lacquer").hex && A.fonts.display.family === "Alumni Sans" && A.fonts.mono.family === "JetBrains Mono" && A.radii.md === 6 && A.dos.length === 1 && A.donts.length === 1 && !A.roles.status.includes(A.roles.accent) === true, JSON.stringify({ roles: A.role_names, fonts: A.fonts }));
  ok("DESIGN.md prose: roles from descriptions, banned fonts skipped, 'same family' body", B.roles.canvas === "#f9fafb" && B.roles.ink === "#18181b" && B.roles.accent === "#10b981" && B.fonts.display.family === "Geist" && B.fonts.body.family === "Geist", JSON.stringify({ roles: B.roles, fonts: B.fonts }));
  ok("DESIGN.md table: bare hex, monochrome accent, deck fonts mapped", C.roles.canvas === "#ffffff" && C.roles.ink === "#1a1a1a" && C.roles.accent === "#333333" && C.fonts.display.family === "Caladea" && C.fonts.body.family === "Carlito", JSON.stringify({ roles: C.roles, fonts: C.fonts }));
  fs.writeFileSync(path.join(fx, "frame.md"), toFrameMd(A));
  const L = readLook(path.join(fx, "frame.md"));
  ok("brand frame.md reads back (canvas, ink, accent, display face)", L.bg === A.roles.canvas && L.ink === A.roles.ink && L.accent === A.roles.accent && L.font === "Alumni Sans", JSON.stringify(L));

  fs.writeFileSync(path.join(TMP, "dec.json"), JSON.stringify({ subject: "Tally", picks: { format: "product-launch-film", "ui-treatment": ["simplified-ui"], "ui-treatment:radius": "medium", "visual-style": "swiss-international", "motion-language": "precise" }, decided_by: { "visual-style": "agent" } }));
  const dc = node("direction.mjs", ["compile", "--decisions", path.join(TMP, "dec.json"), "--out", path.join(TMP, "direction")]);
  const dmd = fs.existsSync(path.join(TMP, "direction", "DIRECTION.md")) ? fs.readFileSync(path.join(TMP, "direction", "DIRECTION.md"), "utf8") : "";
  ok("direction compiles: style name, formula, Do and Not lines, receipts", dc.status === 0 && /^# Direction: Swiss \/ International Typographic Style, simplified-UI product launch film, precise motion/m.test(dmd) && /\*\*Do:\*\*/.test(dmd) && /Not to be confused with/.test(dmd) && /decided by Claude/.test(dmd), dc.stderr || dmd.slice(0, 200));
  fs.writeFileSync(path.join(TMP, "dec-bad.json"), JSON.stringify({ picks: { "visual-style": "swiss-internationale", colour: "neon" } }));
  const dbad = node("direction.mjs", ["compile", "--decisions", path.join(TMP, "dec-bad.json"), "--out", path.join(TMP, "direction-bad")]);
  ok("direction rejects unknown terms with the closest valid ones", dbad.status === 1 && /swiss-international/.test(dbad.stderr) && /color/.test(dbad.stderr), dbad.stderr);

  const lk = node("design.mjs", ["looks", "--decisions", path.join(TMP, "dec0.json").replace("dec0", "dec"), "--out", path.join(TMP, "looks"), "--count", "6"]);
  let lj = {};
  try {
    lj = JSON.parse(fs.readFileSync(path.join(TMP, "looks", "looks.json"), "utf8"));
  } catch {}
  const styles = new Set((lj.looks || []).map((x) => x.visual_style.id + "|" + x.type.pairing + "|" + x.palette.canvas));
  const allRead = (lj.looks || []).every((x) => !(readLook(path.join(TMP, "looks", x.id, "frame.md")).defaulted || []).length);
  ok("design directions: 6 distinct looks, each with a frame.md that reads back", lk.status === 0 && (lj.looks || []).length === 6 && styles.size === 6 && allRead, lk.stderr || [...styles].join(" ; "));
  fs.writeFileSync(path.join(TMP, "dec0.json"), JSON.stringify({ picks: {} }));
  const lb = node("design.mjs", ["looks", "--decisions", path.join(TMP, "dec0.json"), "--out", path.join(TMP, "looks-brand"), "--count", "4", "--brand", path.join(fx, "stitch.md")]);
  let lbj = {};
  try {
    lbj = JSON.parse(fs.readFileSync(path.join(TMP, "looks-brand", "looks.json"), "utf8"));
  } catch {}
  const brandColors = new Set([B.roles.canvas, B.roles.ink, B.roles.accent, B.roles.surface].filter(Boolean));
  ok("brand-locked looks keep the brand's colors and fonts", lb.status === 0 && (lbj.looks || []).length === 4 && lbj.looks.every((x) => brandColors.has(x.palette.canvas) && x.type.display.family === "Geist"), lb.stderr || JSON.stringify((lbj.looks || []).map((x) => x.palette.canvas)));

  // complete directions: fitting, distinct visual styles, never the generic default, each with a board; picking one merges its stack
  fs.writeFileSync(path.join(TMP, "decd.json"), JSON.stringify({ subject: "Tally", picks: { format: "product-launch-film" } }));
  const dr = node("direction.mjs", ["directions", "--decisions", path.join(TMP, "decd.json"), "--out", path.join(TMP, "dirs"), "--headline", "Tax season. Again."]);
  let dj = {};
  try {
    dj = JSON.parse(fs.readFileSync(path.join(TMP, "dirs", "directions.json"), "utf8"));
  } catch {}
  const ds = dj.directions || [];
  const vstyles = new Set(ds.map((x) => [].concat(x.picks["visual-style"] || [x.id])[0]));
  ok("directions: three distinct, fitting, never generic, each with a board image", dr.status === 0 && ds.length === 3 && vstyles.size === 3 && ds.every((x) => x.picks.format && x.picks.format[0] === "product-launch-film" && x.image && fs.existsSync(path.join(TMP, x.image)) && !["saas-minimal", "corporate-flat", "clean-minimal"].includes([].concat(x.picks["visual-style"] || [])[0])) && !!dj.passed_over, dr.stderr || JSON.stringify(ds.map((x) => [x.id, x.image])));
  const more = node("direction.mjs", ["directions", "--decisions", path.join(TMP, "decd.json"), "--out", path.join(TMP, "dirs2"), "--no-images", "--exclude", ds.map((x) => x.id).join(",")]);
  let mj = {};
  try {
    mj = JSON.parse(more.stdout);
  } catch {}
  ok("directions: \"show 3 more\" never repeats one", (mj.directions || []).length === 3 && mj.directions.every((x) => !ds.some((y) => y.id === x.id)), more.stderr);
  if (ds[0]) {
    node("direction.mjs", ["pick-direction", "--directions", path.join(TMP, "dirs", "directions.json"), "--id", ds[0].id, "--decisions", path.join(TMP, "decd.json")]);
    const after = JSON.parse(fs.readFileSync(path.join(TMP, "decd.json"), "utf8"));
    ok("pick-direction merges the direction's stack and keeps the user's picks", [].concat(after.picks.format)[0] === "product-launch-film" && Object.keys(after.picks).length > 5 && after.direction_card.id === ds[0].id, JSON.stringify(after.picks));
  }

  // the style library: hundreds of complete styles that validate; suggestions are distinct; picking one writes a look
  {
    const v = node("presets.mjs", ["validate"]);
    let vj = {};
    try { vj = JSON.parse(v.stdout); } catch {}
    ok("style library validates (terms, recipe vocabulary, contrast, no look-alikes) with 200+ styles", v.status === 0 && vj.presets >= 200 && vj.families >= 10, (vj.problems || []).slice(0, 5).join("; ") || v.stderr);
    fs.writeFileSync(path.join(TMP, "decp.json"), JSON.stringify({ subject: "Tally", picks: { format: "product-launch-film" } }));
    const sg = node("presets.mjs", ["suggest", "--decisions", path.join(TMP, "decp.json"), "--count", "3"]);
    let sj = {};
    try { sj = JSON.parse(sg.stdout); } catch {}
    const ss = sj.suggestions || [];
    ok("style suggestions: three from different families, one unusual", ss.length === 3 && new Set(ss.map((x) => x.family)).size === 3 && ss.some((x) => x.rare), sg.stdout.slice(0, 300));
    if (ss[0]) {
      const pk = node("presets.mjs", ["pick", "--id", ss[0].id, "--decisions", path.join(TMP, "decp.json"), "--out", path.join(TMP, "preset")]);
      const dd = JSON.parse(fs.readFileSync(path.join(TMP, "decp.json"), "utf8"));
      const lk = readLook(path.join(TMP, "preset", "frame.md"));
      ok("picking a style merges its terms and writes a frame.md that reads back", pk.status === 0 && dd.style_preset.id === ss[0].id && dd.picks["visual-style"] && !(lk.defaulted || []).length, pk.stderr);
    }
    // every style exports as a DESIGN.md design system that reads back as a brand (colors by role, display face)
    const ex = node("design-system.mjs", ["export-all", "--out", path.join(TMP, "systems")]);
    const idx = JSON.parse(fs.readFileSync(path.join(TMP, "systems", "index.json"), "utf8"));
    const pdir = path.join(HERE, "..", "taxonomy", "presets");
    const lib = Object.fromEntries(fs.readdirSync(pdir).filter((f) => f.endsWith(".json") && !f.startsWith("_")).flatMap((f) => JSON.parse(fs.readFileSync(path.join(pdir, f), "utf8")).presets.map((p) => [p.id, p])));
    const { readDesignMd } = await import("./lib/design-md.mjs");
    const off = [];
    for (const s0 of idx) {
      const B = readDesignMd(path.join(TMP, "systems", s0.file));
      const P = lib[s0.id].recipe;
      if (B.roles.canvas.toLowerCase() !== P.palette.canvas.toLowerCase() || B.roles.ink.toLowerCase() !== P.palette.ink.toLowerCase() || (B.roles.accent || "").toLowerCase() !== P.palette.accent.toLowerCase() || (B.fonts.display || {}).family !== P.fonts.display) off.push(s0.id);
      if (off.length > 5) break;
    }
    ok("every style exports as a DESIGN.md that reads back exactly (canvas, ink, accent, display face)", ex.status === 0 && idx.length === Object.keys(lib).length && !off.length, off.join(", ") || ex.stderr);
    const docs = path.join(HERE, "..", "..", "..", "docs", "assets");
    if (fs.existsSync(path.join(docs, "presets.js"))) {
      const same = fs.readFileSync(path.join(docs, "presets.js"), "utf8") === fs.readFileSync(path.join(HERE, "..", "console", "presets.js"), "utf8");
      const n = JSON.parse(fs.readFileSync(path.join(docs, "presets.json"), "utf8")).presets.length;
      ok("the website's style library matches the skill's (run presets.mjs site --out docs/assets)", same && n === vj.presets, `renderer same: ${same}, site ${n} vs library ${vj.presets}`);
    }
  }

  const page = fs.readFileSync(path.join(HERE, "..", "console", "index.html"), "utf8");
  let parses = true;
  try {
    new Function(page.match(/<script>([\s\S]*)<\/script>\s*<\/body>/)[1]);
  } catch {
    parses = false;
  }
  ok("console page script parses (every panel)", parses && /direction: function/.test(page) && /choiceCards\(/.test(page) && /d\.directions/.test(page) && /brand: function/.test(page) && /styleframes: function/.test(page));
}

// 10. setup and updates: setup.sh finds Node or says how to get it; the skill's VERSION matches the plugin manifest; a newer release is reported with how
//     to update; offline or disabled the check is silent and never fails the run
{
  const ver = fs.readFileSync(path.join(HERE, "..", "VERSION"), "utf8").trim();
  const manifest = path.join(HERE, "..", "..", "..", ".claude-plugin", "plugin.json");
  const pv = fs.existsSync(manifest) ? JSON.parse(fs.readFileSync(manifest, "utf8")).version : ver;
  ok("VERSION matches .claude-plugin/plugin.json", ver === pv, `${ver} vs ${pv}`);
  // the rasa-director bridge (installs from before the rename) must advertise the same release, or old copies stop updating
  const bridgeDir = path.join(HERE, "..", "..", "rasa-director");
  const bv = fs.readFileSync(path.join(bridgeDir, "VERSION"), "utf8").trim();
  const mk = JSON.parse(fs.readFileSync(path.join(HERE, "..", "..", "..", ".claude-plugin", "marketplace.json"), "utf8"));
  const be = mk.plugins.find((p) => p.name === "rasa-director") || {};
  const bsyn = spawnSync("bash", ["-n", path.join(bridgeDir, "scripts", "setup.sh")], { encoding: "utf8" });
  ok("the rasa-director bridge advertises this release (its VERSION and marketplace entry) and its setup parses", bv === ver && be.version === ver && be.strict === false && bsyn.status === 0, `bridge ${bv}, marketplace ${be.version}, ${bsyn.stderr}`);
  const uenv = { ...env, RASANAI_UPDATE_BASE: "http://127.0.0.1:9", RASANAI_AUTO_UPDATE: "" };
  const u = (args, extra = {}) => spawnSync(process.execPath, [path.join(HERE, "update.mjs"), ...args], { encoding: "utf8", env: { ...uenv, ...extra }, cwd: TMP, timeout: 20000 });
  const j = (r) => { try { return JSON.parse(r.stdout); } catch { return {}; } };
  const sim = j(u(["check", "--latest", "99.0.0"]));
  ok("update check: a newer release is reported with the way to update", sim.behind === true && sim.current === ver && !!sim.method && !!sim.command && /99\.0\.0/.test(sim.message || ""), JSON.stringify(sim));
  const off = u(["check", "--force"]);
  ok("update check: offline is silent and exits 0", off.status === 0 && j(off).checked === "offline" && j(off).behind === false, off.stderr);
  ok("update check: RASANAI_NO_UPDATE_CHECK=1 skips it", j(u(["check"], { RASANAI_NO_UPDATE_CHECK: "1" })).checked === "skipped");
  // setup.sh finds Node off the PATH, and fails with a fix (not silently) when there is none
  const sh = (extra) => spawnSync("bash", [path.join(HERE, "setup.sh"), "--node-only"], { encoding: "utf8", env: { ...env, PATH: "/usr/bin:/bin", ...extra }, cwd: TMP, timeout: 30000 });
  const nh = path.join(TMP, "nodehome");
  fs.mkdirSync(path.join(nh, "node", "bin"), { recursive: true });
  fs.symlinkSync(process.execPath, path.join(nh, "node", "bin", "node"));
  const found = sh({ RASANAI_HOME: nh });
  ok("setup finds Node off the PATH and prints the PATH prefix", found.status === 0 && found.stdout.includes(`NODE=${path.join(nh, "node", "bin", "node")}`) && /PATH_PREFIX=/.test(found.stdout) && /READY/.test(found.stdout), found.stdout + found.stderr);
  const none = sh({ RASANAI_HOME: path.join(TMP, "nonode"), RASANAI_SKIP_NODE_SEARCH: "1", RASANAI_NO_NODE_DOWNLOAD: "1" });
  ok("setup without Node says how to fix it and fails", none.status === 1 && /PROBLEM: Node >= 20 is required/.test(none.stderr) && /FAILED/.test(none.stdout), none.stdout + none.stderr);
}

// 11. story: the device catalog validates; pick returns THE MENU (no seeded draw: recent devices removed, the rest ranked by fit) and three SLOTS
//     (Sure/Bold/Wild, each with its shape and plot engine) the writers fill; check ships a concept pitch and rejects the cliche arc
{
  const v = node("story.mjs", ["validate"]);
  let vj = {};
  try { vj = JSON.parse(v.stdout); } catch {}
  ok("story: device catalog validates (70 narrative devices)", v.status === 0 && vj.devices >= 70, v.stdout.slice(0, 300) + v.stderr);
  const sd = path.join(TMP, "story");
  fs.mkdirSync(sd, { recursive: true });
  const truth = path.join(sd, "truth.json");
  fs.writeFileSync(truth, JSON.stringify({ product: { name: "Lintel" }, tags: ["ai", "devtool"], format: { format: "brand", length: "36" }, claim_scope: { scope: "category", why: "reviews every pull request" }, use_domains: [{ domain: "review", prompt: "review a small diff" }, { domain: "threads", prompt: "resolve a review thread" }, { domain: "repos", prompt: "review across repos" }], tone: ["deadpan"], transformation: "from PRs that wait to PRs already reviewed", emotional_truth: "the guilty LGTM", enemy: ["the review queue"], objects: ["the diff", "the LGTM comment", "the pager alert", "the review badge", "conflict markers", "the CI checkmark", "the nit: prefix", "the blame gutter"], forms: ["pull request", "review thread", "commit log", "incident postmortem", "changelog"], words: ["Lintel", "LGTM", "Apply suggestion"], proof: ["Reviews a 400-line PR in under 90 seconds (brief)"], competitors: ["Rival"], cliche: ["hook", "montage", "introducing", "f1", "f2", "f3"] }));
  const picks = ["a", "b"].map((s) => node("story.mjs", ["pick", "--truth", truth, "--seed", s]));
  const P = picks.map((r) => { try { return JSON.parse(r.stdout); } catch { return { picks: [], menu: [] }; } });
  // the menu replaced the seeded draw: three slots with no device chosen, a menu spanning families, one engine per slot; --seed is accepted and ignored
  const slots = P.every((r) => r.picks.length === 3 && r.picks.every((p) => p.device === null && p.engine && p.engine_rule) && new Set(r.picks.map((p) => p.engine)).size === 3 && (r.menu || []).length >= 6 && new Set((r.menu || []).map((m) => m.family)).size >= 3 && r.engines && r.turn_rule);
  ok("story: pick gives THE MENU (6+ devices over 3+ families) and Sure/Bold/Wild slots with no device chosen and three different plot engines; no seeded draw (any seed, same output)", slots && P[0].picks.map((p) => p.label).join() === "Sure,Bold,Wild" && picks[0].stdout === picks[1].stdout, picks.map((r) => r.stderr).join(" "));
  const beat = (name, on_screen, duration_s, extra = {}) => ({ name, on_screen, visual: `${name}, in the review thread`, duration_s, ...extra });
  const scores = { originality: 4, clarity: 4, fit: 5, memorability: 4, feasibility: 5 };
  const aim = { takeaway: "Lintel reads every line so nothing slips through at 2 am.", feel: "Relieved", action: "Install Lintel on one repo", audience: "Engineers who approve pull requests" };
  const good = { title: "The unread line", aim, approach: "Starts at the 2 am outage, then rewinds to the one line nobody read.", logline: "A 2 am outage rewinds to the one line nobody read.", device: "rewind", beats: [beat("The pager alert", "02:14 · checkout-api down", 4), beat("Rewind the postmortem", "deploy ← merge", 7), beat("The LGTM comment un-types", "LGTM · 11:04 pm", 6), beat("The diff, unread", "one hunk", 6), beat("Lintel reads it", "Apply suggestion", 6, { turn: true }), beat("The pager stays dark", "Lintel reads every line.", 7)], first_4s: "A pager alert that plays backwards", clear_by_s4: true, swap_test: { competitor: "Rival", result: "breaks", why: "the LGTM and the comment label are Lintel's own" }, grounded_claims: [], honest_demo: true, build: { hardest_shot: "the reverse scrub", needs_live_action: false }, scores };
  // G11: one show row per on-screen line (the show names the line's own word, how the words and the UI touch, and what changes in place)
  const showRow = (line, extra = {}) => ({ line, show: `The review cursor rides under "${line}" and the words swap in place as the Lintel thread scrolls`, built_from: "product UI", handoff: "the line becomes the next one in place", ...extra });
  const withShows = (beats) => beats.map((b, i) => (String(b.on_screen || "").trim() ? { ...b, shows: [showRow(b.on_screen, i === beats.length - 1 ? { handoff: "end" } : {})] } : b));
  good.actor = { what: "the review cursor", does: "rides under every line and opens each next view" };
  good.beats = withShows(good.beats);
  const bad = { title: "Meet Lintel", logline: "Meet Lintel, the AI reviewer that supercharges your team.", device: "before-after", beats: [beat("Hook", "PRs wait 2 days?", 3), beat("Problem montage", "Code review is broken", 3), beat("Introducing Lintel", "Introducing Lintel", 3), beat("Feature 1", "AI comments", 3), beat("Feature 2", "Suggestions", 3), beat("Feature 3", "Integrations", 3), beat("Social proof", "Trusted by 500 teams", 3), beat("CTA", "Try it free", 3)], first_4s: "a stat", clear_by_s4: true, swap_test: { competitor: "Rival", result: "survives" }, honest_demo: true, scores };
  fs.writeFileSync(path.join(sd, "good.json"), JSON.stringify(good));
  fs.writeFileSync(path.join(sd, "bad.json"), JSON.stringify(bad));
  const cg = node("story.mjs", ["check", "--pitch", path.join(sd, "good.json"), "--truth", truth]);
  const cb = node("story.mjs", ["check", "--pitch", path.join(sd, "bad.json"), "--truth", truth]);
  let rb = { gates: [] };
  try { rb = JSON.parse(cb.stdout); } catch {}
  ok("story: check ships a distinctive pitch (exit 0)", cg.status === 0, cg.stdout.slice(0, 400) + cg.stderr);
  ok("story: check rejects the cliche arc (default beats in order, swap test survives, ungrounded numbers; exit 2)", cb.status === 2 && ["G1", "G2", "G4"].every((g) => rb.gates.some((x) => x.id === g && !x.pass)), cb.stdout.slice(0, 400) + cb.stderr);
  // G6, the script (references/script.md): a written 45 s script ships; the default launch script fails on its words and timing
  fs.writeFileSync(path.join(sd, "script-good.json"), JSON.stringify({"id": "shoebox", "label": "Bold", "title": "The last shoebox", "aim": {"takeaway": "Tally files every receipt for you, so the shoebox is retired.", "feel": "Quietly relieved", "action": "Try Tally on this month", "audience": "Freelancers"}, "approach": "A museum exhibit for the shoebox that Tally made obsolete.", "logline": "A museum exhibit of the thing nobody needs anymore.", "device": "museum-exhibit", "beats": [{"name": "Hook", "on_screen": "Exhibit 14: the shoebox", "vo": "", "visual": "Spotlight finds a shoebox of receipts on a plinth; label slides in.", "duration_s": 2.5}, {"name": "Value", "on_screen": "Retired, 2024.", "vo": "This is how people kept their books. Until this year.", "visual": "Label date ticks to 2024.", "duration_s": 4.5, "value": true}, {"name": "One tap", "on_screen": "One tap.", "vo": "Tally reads every receipt the moment you get it.", "visual": "Phone snaps a crumpled receipt; the amount flies into a ledger row.", "duration_s": 6}, {"name": "Balanced", "on_screen": "Every month, balanced.", "vo": "And balances the month on its own.", "visual": "Twelve months fill in, December last.", "duration_s": 7}, {"name": "Escalation", "on_screen": "0 shoeboxes.", "vo": "", "visual": "The shoebox empties as receipts become ledger rows.", "duration_s": 8}, {"name": "Turn", "on_screen": "", "vo": "Some things belong in a museum.", "visual": "Pull back: the empty shoebox under glass, a visitor walks past.", "duration_s": 6, "turn": true}, {"name": "Payoff", "on_screen": "Your books don't fade.", "vo": "Yours don't have to.", "visual": "The ledger, calm.", "duration_s": 6}, {"name": "End", "on_screen": "Tally \u00b7 tally.app", "vo": "", "visual": "Logo and URL held still.", "duration_s": 5}], "first_4s": "a shoebox in a museum", "clear_by_s4": true, "swap_test": {"competitor": "Expensify", "result": "breaks", "why": "the shoebox exhibit is Tally's own story"}, "grounded_claims": [], "props": ["14", "2024", "0"], "honest_demo": true, "signature_image": "shoebox under glass", "last_line": "Your books don't fade.", "build": {"hardest_shot": "receipt to ledger row", "how": "SVG morph"}, "scores": {"originality": 4, "clarity": 4, "fit": 4, "memorability": 4, "feasibility": 4}}));
  fs.writeFileSync(path.join(sd, "script-bad.json"), JSON.stringify({"id": "default", "label": "Bold", "title": "Tally", "logline": "A museum exhibit of the thing nobody needs anymore.", "device": "museum-exhibit", "beats": [{"name": "Q", "on_screen": "Tired of messy receipts?", "vo": "Tired of messy receipts? Introducing Tally, the seamless way to track every expense you have.", "visual": "stock", "duration_s": 5}, {"name": "f1", "on_screen": "Scan receipts instantly", "vo": "Scan receipts instantly.", "visual": "x", "duration_s": 5}, {"name": "f2", "on_screen": "Track expenses effortlessly", "vo": "Track expenses effortlessly.", "visual": "x", "duration_s": 5}, {"name": "f3", "on_screen": "Tax-ready reports", "vo": "Get tax ready reports.", "visual": "x", "duration_s": 5}, {"name": "end", "on_screen": "Try Tally free today!", "vo": "Tally. The future of bookkeeping.", "visual": "logo", "duration_s": 1.5}], "first_4s": "a shoebox in a museum", "clear_by_s4": true, "swap_test": {"competitor": "Expensify", "result": "breaks", "why": "the shoebox exhibit is Tally's own story"}, "grounded_claims": [], "props": ["14", "2024", "0"], "honest_demo": true, "signature_image": "shoebox under glass", "last_line": "Your books don't fade.", "build": {"hardest_shot": "receipt to ledger row", "how": "SVG morph"}, "scores": {"originality": 4, "clarity": 4, "fit": 4, "memorability": 4, "feasibility": 4}}));
  const sg = node("story.mjs", ["check", "--pitch", path.join(sd, "script-good.json"), "--length", "45", "--narrated"]);
  const sb = node("story.mjs", ["check", "--pitch", path.join(sd, "script-bad.json"), "--length", "45", "--narrated"]);
  let rsg = { gates: [] }, rsb = { gates: [] };
  try { rsg = JSON.parse(sg.stdout); rsb = JSON.parse(sb.stdout); } catch {}
  const g6 = (r) => r.gates.find((x) => x.id === "G6") || { pass: null, reasons: [] };
  const why = g6(rsb).reasons.join(" | ");
  ok("story: G6 passes a written script and fails the default one (length, hook beat, repeated lines, stock copy, end hold)", g6(rsg).pass === true && g6(rsb).pass === false && ["for a 45 s film", "hook beat", "repeats the voiceover", "stock launch copy", "end beat"].every((k) => why.includes(k)), g6(rsg).reasons.join(" | ") + " // " + why);
  // G8, the aim (references/script.md pass 0): a title that names the idea and an aim pass; a fragment title or a missing aim fails
  {
    const g8 = (extra, drop = []) => {
      const o = { ...good, ...extra };
      for (const k of drop) delete o[k];
      const f = path.join(sd, `g8-${Math.random().toString(36).slice(2)}.json`);
      fs.writeFileSync(f, JSON.stringify(o));
      const r = node("story.mjs", ["check", "--pitch", f, "--truth", truth]);
      let j = { gates: [] };
      try { j = JSON.parse(r.stdout); } catch {}
      return j.gates.find((x) => x.id === "G8") || { pass: null, reasons: [] };
    };
    const okT = g8({ title: "The one-prompt site" });
    ok("story: G8 passes a title that names the idea (\"The one-prompt site\") with a full aim and approach", okT.pass === true, okT.reasons.join(" | "));
    const frag = g8({ title: "You Can Just", beats: good.beats.map((b, i) => (i === 0 ? { ...b, on_screen: "You can just ask." } : b)) });
    ok("story: G8 fails \"You Can Just\" (ends on a function word, the start of an on-screen line)", frag.pass === false && /ends on "just"/.test(frag.reasons.join(" ")) && /start of an on-screen line/.test(frag.reasons.join(" ")), frag.reasons.join(" | "));
    ok("story: G8 fails a one-word title and an ALL CAPS title", g8({ title: "Unmerged" }).pass === false && g8({ title: "ONE BOX ONLY" }).pass === false);
    const noAim = g8({}, ["aim"]);
    ok("story: G8 fails a pitch with no aim, and one with no approach", noAim.pass === false && /aim\.takeaway missing/.test(noAim.reasons.join(" ")) && g8({}, ["approach"]).pass === false);
    ok("story: G8 caps the takeaway at 16 words and the approach at 25", g8({ aim: { ...good.aim, takeaway: "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen" } }).pass === false && g8({ approach: "word ".repeat(26).trim() }).pass === false);
    const twin = node("story.mjs", ["check", "--pitch", (() => { const f = path.join(sd, "g8-twins.json"); fs.writeFileSync(f, JSON.stringify({ pitches: [good, { ...good, title: "Reviewed before merge" }] })); return f; })(), "--truth", truth]);
    let tj = {};
    try { tj = JSON.parse(twin.stdout); } catch {}
    ok("story: two pitches with the same takeaway get a warning, not a failure", ((tj.portfolio || {}).warnings || []).some((w) => /same takeaway/.test(w)), twin.stdout.slice(0, 300));
  }
  // product-first (launch, promo and product films; references/product-first.md): no conceit devices, gate G7
  {
    const ptruth = path.join(sd, "truth-launch.json");
    fs.writeFileSync(ptruth, JSON.stringify({ ...JSON.parse(fs.readFileSync(truth, "utf8")), format: { format: "launch", length: "30" } }));
    const CONCEIT = new Set(["museum-exhibit", "extended-metaphor", "cover-version", "parable", "miniature-world", "chain-reaction", "game-level", "graphic-system", "material-study", "weather-report", "receipt", "recipe", "obituary", "horoscope", "nature-documentary", "movie-trailer", "infomercial", "silent-film", "product-as-character", "cosmos-zoom"]);
    const seen = new Set();
    // the menu (no seeded draw): the same call across rotations (--recent removes devices) never offers a conceit device
    for (const rc of ["", "rewind", "countdown", "list-that-breaks"]) {
      let r = {};
      try { r = JSON.parse(node("story.mjs", ["pick", "--truth", ptruth, ...(rc ? ["--recent", rc] : [])]).stdout); } catch {}
      (r.menu || []).forEach((x) => seen.add(x.id));
    }
    ok("product-first: the menu for a launch film never offers a conceit device (museum, metaphor, cover version, invented world...) across 4 rotations", seen.size >= 6 && ![...seen].some((id) => CONCEIT.has(id)), [...seen].join(","));
    const conc = node("story.mjs", ["pick", "--truth", ptruth, "--seed", "a", "--allow-conceit"]);
    ok("product-first: --allow-conceit lifts the filter (brand films, or when the user asks for a concept)", conc.status === 0 && !/"product_first": true/.test(conc.stdout));
    // the house 30 s shape (references/launch-film.md, Tempo): hook + product, promise, hero, four uses, payoff, end card = 7 ideas
    const tempoBeats = (b) => [b("Open", "Lintel, open.", 2.5, "The real Lintel review window opens over the pull request, Apply suggestion in the corner"), b("Promise", "Review, done.", 2, "The Lintel review thread, one line set over it"), b("Hero", "One shortcut.", 4, "The real LGTM flow: the diff, the comment, Apply suggestion in the Lintel window", { value: true }), b("Use 1", "Every diff.", 3, "Six real diffs reviewed down the Lintel review thread"), b("Use 2", "Every thread.", 3, "The Lintel review thread resolves itself", { turn: true }), b("Use 3", "Every repo.", 3, "Lintel across three repos in one list"), b("Use 4", "Every nit.", 3, "Lintel folds the nit: comments away"), b("Payoff", "Review done.", 3, "Lintel shows the merged pull request"), b("End", "Get Lintel", 3.5, "Clean CTA card, the line the largest type")];
    const pf = (extra, drop = []) => {
      const b = (name, on_screen, duration_s, visual, more = {}) => ({ name, on_screen, visual, duration_s, ...more });
      const o = { title: "Review in place", aim, approach: "Opens on the real review window and shows one shortcut doing the whole job.", logline: "Lintel reviews the pull request where you already are.", device: "oner", beats: tempoBeats(b), tempo: { ideas: 7, change_every_s: 2.2, longest_hold_s: 4, source: "house" }, payoff_line: "Review done where you work.", first_4s: "the real Lintel window opens", clear_by_s4: true, swap_test: { competitor: "Rival", result: "breaks", why: "the Apply suggestion flow is Lintel's own" }, grounded_claims: [], honest_demo: true, build: { hardest_shot: "the real UI choreography" }, scores, hero_moment: { beat: 3, what: "the real review flow end to end" }, uses: ["review a diff", "resolve a thread"], last_line: "Get Lintel", end_line_largest: true, ...extra };
      for (const k of drop) delete o[k];
      const f = path.join(sd, `pf-${Math.random().toString(36).slice(2)}.json`);
      fs.writeFileSync(f, JSON.stringify(o));
      const r = node("story.mjs", ["check", "--pitch", f, "--truth", ptruth]);
      let j = { gates: [] };
      try { j = JSON.parse(r.stdout); } catch {}
      return { status: r.status, g7: j.gates.find((x) => x.id === "G7") || { pass: null, reasons: [] }, out: r.stdout };
    };
    const good7 = pf({});
    ok("product-first: G7 passes a product-led pitch (UI in beat 1, hero moment, uses, end line)", good7.g7.pass === true, good7.g7.reasons.join(" | ") + good7.out.slice(0, 300));
    const museum = pf({ title: "The Museum of the Detour", device: "museum-exhibit", logline: "A gallery of abandoned tasks under glass." });
    ok("product-first: G7 fails a conceit device and museum/gallery wording", museum.g7.pass === false && /conceit device/.test(museum.g7.reasons.join(" ")) && /conceit word/.test(museum.g7.reasons.join(" ")), museum.g7.reasons.join(" | "));
    const late = pf({}, ["hero_moment", "uses"]);
    ok("product-first: G7 requires a hero moment and 2 to 4 real uses", late.g7.pass === false && /hero_moment/.test(late.g7.reasons.join(" ")) && /uses/.test(late.g7.reasons.join(" ")), late.g7.reasons.join(" | "));
    const noui = pf({ beats: [{ name: "Open", on_screen: "Time passes.", visual: "A calendar flips through the year", duration_s: 5 }, { name: "Hero", on_screen: "One shortcut.", visual: "The real Lintel window, Apply suggestion", duration_s: 8, value: true }, { name: "Use", on_screen: "Every diff.", visual: "diffs", duration_s: 6 }, { name: "Turn", on_screen: "Done.", visual: "the thread resolves", duration_s: 5, turn: true }, { name: "End", on_screen: "Get Lintel", visual: "CTA", duration_s: 5 }] });
    ok("product-first: G7 fails when the product is not on screen within 3 s", noui.g7.pass === false && /within 3 s/.test(noui.g7.reasons.join(" ")), noui.g7.reasons.join(" | "));
    const small = pf({ end_line_largest: false });
    ok("product-first: G7 requires the end line to be the largest type", small.g7.pass === false && /end_line_largest/.test(small.g7.reasons.join(" ")), small.g7.reasons.join(" | "));
    const pun = pf({ visual_pun: { what: "a lintel above a door becomes the window", resolves_in_s: 0.8 }, title: "Over the door", logline: "A lintel becomes the Lintel window in a second." });
    ok("product-first: an instant visual pun that resolves to the product within 1 s is allowed", pun.g7.pass === true, pun.g7.reasons.join(" | "));
    // launch-film structure (references/launch-film.md): hook, hero, 2-4 demos, payoff, end card, timings per film length, the product in every beat
    {
      const b = (name, on_screen, duration_s, visual, more = {}) => ({ name, on_screen, visual, duration_s, ...more });
      const base = () => tempoBeats(b);
      const okp = pf({ beats: base(), payoff_line: "Review done where you work." });
      ok("launch structure: G7 passes the 30 s template (hook, hero, 2 uses, payoff, end card, each in range, the product in every beat)", okp.g7.pass === true, okp.g7.reasons.join(" | "));
      const slow = base(); slow[2].duration_s = 20;
      const t1 = pf({ beats: slow, payoff_line: "Review done." });
      ok("launch structure: G7 fails a beat outside the template's timing range", t1.g7.pass === false && /outside the 30 s launch template/.test(t1.g7.reasons.join(" ")), t1.g7.reasons.join(" | "));
      const nopay = pf({ beats: base().filter((x) => x.name !== "Payoff") }, ["payoff_line"]);
      ok("launch structure: G7 requires a payoff line", nopay.g7.pass === false && /payoff line missing/.test(nopay.g7.reasons.join(" ")), nopay.g7.reasons.join(" | "));
      const bare = base(); bare[4] = b("Use 2", "Every thread.", 3, "A drifting field of soft shapes", { turn: true });
      const t3 = pf({ beats: bare, payoff_line: "Review done." });
      ok("launch structure: G7 fails a beat with neither the product nor the brand", t3.g7.pass === false && /without the product or brand/.test(t3.g7.reasons.join(" ")), t3.g7.reasons.join(" | "));
      const five = base(); five.splice(3, 0, b("Use 5", "Every team.", 3, "Lintel for teams"), b("Use 6", "Every fork.", 3, "Lintel on forks"));
      const t4 = pf({ beats: five, payoff_line: "Review done." });
      ok("launch structure: G7 fails more feature demos than the length allows (5 in 30 s)", t4.g7.pass === false && /feature-demo beats/.test(t4.g7.reasons.join(" ")), t4.g7.reasons.join(" | "));
    }
    // G9, tempo (references/launch-film.md, Tempo): ideas per length, holds, the brand's measured tempo
    {
      const g9of = (r) => { let j = { gates: [] }; try { j = JSON.parse(r.stdout); } catch {} return (j.gates || []).find((x) => x.id === "G9") || { pass: null, reasons: [r.stdout.slice(0, 400) + r.stderr.slice(0, 300)] }; };
      const run9 = (extra, drop = [], args = []) => {
        const b = (name, on_screen, duration_s, visual, more = {}) => ({ name, on_screen, visual, duration_s, ...more });
        const o = { title: "Review in place", logline: "Lintel reviews the pull request where you already are.", aim, approach: "Opens on the real review window and shows one shortcut doing the whole job.", device: "oner", beats: tempoBeats(b), tempo: { ideas: 7, change_every_s: 2.2, longest_hold_s: 4, source: "house" }, payoff_line: "Review done where you work.", first_4s: "the real Lintel window opens", clear_by_s4: true, swap_test: { competitor: "Rival", result: "breaks", why: "the Apply suggestion flow is Lintel's own" }, grounded_claims: [], honest_demo: true, build: { hardest_shot: "the real UI choreography" }, scores, hero_moment: { beat: 3, what: "the real review flow end to end" }, uses: ["review a diff", "resolve a thread"], last_line: "Get Lintel", end_line_largest: true, ...extra };
        for (const k of drop) delete o[k];
        const fl = path.join(sd, `t9-${Math.random().toString(36).slice(2)}.json`);
        fs.writeFileSync(fl, JSON.stringify(o));
        return g9of(node("story.mjs", ["check", "--pitch", fl, "--truth", ptruth, ...args]));
      };
      const bb = (name, on_screen, duration_s, visual, more = {}) => ({ name, on_screen, visual, duration_s, ...more });
      const fast = run9({});
      ok("tempo: G9 passes a 30 s launch pitch with 7 ideas, a change every 2.2 s and a 4 s hero", fast.pass === true, fast.reasons.join(" | "));
      const oldSlow = [bb("Open", "Lintel, open.", 3, "The real Lintel review window opens"), bb("Promise", "Review happens where you already work.", 5, "The Lintel review thread, one line set over it"), bb("Hero", "One shortcut.", 6, "The real LGTM flow in the Lintel window, uncut", { value: true }), bb("Use 1", "Every diff.", 4, "Six real diffs in the Lintel window"), bb("Use 2", "Every thread.", 4, "The Lintel review thread resolves", { turn: true }), bb("End", "Get Lintel", 3.5, "Clean CTA card, the Lintel mark")];
      const slow = run9({ beats: oldSlow, tempo: { ideas: 5, change_every_s: 5, longest_hold_s: 6, source: "house" } });
      const why9 = slow.reasons.join(" | ");
      ok("tempo: G9 fails the old slow 30 s shape (statement 5 s, hero 6 s, 2 uses): too few ideas, a long hero, slow changes, unlisted changes", slow.pass === false && /4 ideas|ideas in a/.test(why9) && /hero beat holds 6/.test(why9) && /tempo\.change_every_s 5/.test(why9) && /must list what changes/.test(why9), why9);
      ok("tempo: G9 requires a tempo object", run9({}, ["tempo"]).pass === false);
      const listed = tempoBeats(bb); listed[3] = { ...listed[3], duration_s: 4, changes: ["the diff opens", "the comment lands"] };
      const unlisted = tempoBeats(bb); unlisted[3] = { ...unlisted[3], duration_s: 4 };
      ok("tempo: a beat over 3 s passes only when it lists what changes inside it (about one per 2 s)", run9({ beats: listed }).pass === true && run9({ beats: unlisted }).pass === false, run9({ beats: unlisted }).reasons.join(" | "));
      const calm = run9({ beats: tempoBeats(bb).filter((x) => !/Use (3|4)|Promise/.test(x.name)), tempo: { ideas: 4, change_every_s: 2.2, longest_hold_s: 4, source: "house" } }, [], ["--length", "30"]);
      ok("tempo: G9 fails a 30 s pitch under 5 ideas unless the brief asks for a calm film (--calm)", calm.pass === false && /ideas in a/.test(calm.reasons.join(" ")) && run9({ beats: tempoBeats(bb).filter((x) => !/Use (3|4)|Promise/.test(x.name)), tempo: { ideas: 4, change_every_s: 2.2, longest_hold_s: 4, source: "house" } }, [], ["--length", "30", "--calm"]).pass === true, calm.reasons.join(" | "));
      // a brand whose own film changes every 1.5 s tightens the target; the pitch must say it follows the brand film
      const bg = path.join(sd, "brand-grammar.json");
      fs.writeFileSync(bg, JSON.stringify({ measured: { tempo: { changes: 15, changeEveryS: 2, longestHoldS: 4 } } }));
      const tight = run9({}, [], ["--brand-film", bg]);
      ok("tempo: a brand with a faster measured tempo tightens G9 (a change every 2.2 s is too slow for a brand that changes every 2 s)", tight.pass === false && /2 s/.test(tight.reasons.join(" ")) && /brand film/.test(tight.reasons.join(" ")), tight.reasons.join(" | "));
      const follow = run9({ tempo: { ideas: 7, change_every_s: 2, longest_hold_s: 4, source: "brand film" } }, [], ["--brand-film", bg]);
      ok("tempo: a pitch written to the brand's tempo (source: brand film) passes against that brand", follow.pass === true, follow.reasons.join(" | "));
    }
    // G10, one feature, one scenario: feature {viewer, task, before, after}, hook/proof/turn/cta, pictures, UI cause and effect, the two-way read
    {
      const gof = (r, id) => { let j = { gates: [] }; try { j = JSON.parse(r.stdout); } catch {} return (j.gates || []).find((x) => x.id === id) || { pass: null, reasons: [r.stdout.slice(0, 300) + r.stderr.slice(0, 300)] }; };
      const sb = (name, role, on_screen, duration_s, visual, picture, more = {}) => ({ name, role, on_screen, visual, picture, duration_s, ...more });
      const scen = () => [
        sb("Before", "hook", "Reviews pile up elsewhere", 4, "The real Lintel window beside a browser of twelve review tabs, each new tab squeezing the others", "a reviewer drowns in review tabs while the pull request waits", { changes: ["a thirteenth tab squeezes in"] }),
        sb("Apply it", "proof", "Apply it in place", 12, "The real Lintel review window over the diff: the comment, the suggestion, Apply suggestion", "the reviewer applies a suggestion without leaving the diff", { value: true, ui: ["click Apply suggestion → the diff line changes in place and the comment folds", "press Cmd+Enter → the review posts and a toast says Review sent", "the next comment slides up → its suggestion is highlighted", "click Resolve → the thread collapses into a check"], changes: ["the camera pushes into the suggestion", "the tabs close one by one"] }),
        sb("After", "turn", "Review, done in Lintel", 5, "The tabs are gone, the Lintel mark lands as the window shrinks into it", "one window, no tabs, and the Lintel mark arrives", { turn: true, changes: ["the window shrinks into the mark", "the name lands"] }),
        sb("End", "cta", "Get Lintel", 4, "Clean CTA card with the Lintel mark, the line the largest type", "the mark rises into the end card and the download button wipes in"),
      ];
      const feature = { name: "Apply suggestion", url: "https://lintel.example/apply", viewer: "a reviewer with twelve open review tabs", task: "apply a suggested change and post the review", before: "reviews live in a separate tool and get lost", after: "review and apply right in the diff" };
      const run10 = (extra = {}, drop = []) => {
        const o = { title: "Review in place", logline: "Lintel applies the review where you already are.", aim, approach: "One reviewer applies one suggestion in the real Lintel window, start to finish.", device: "oner", feature, beats: scen(), two_way: { lines_alone: "Reviews pile up; apply in place; done in Lintel; get it", pictures_alone: "tabs pile up, one suggestion is applied in the diff, the tabs vanish into the Lintel mark, the end card" }, tempo: { ideas: 5, change_every_s: 2.2, longest_hold_s: 4, source: "house" }, first_4s: "the real Lintel window beside the review tabs", clear_by_s4: true, swap_test: { competitor: "Rival", result: "breaks", why: "Apply suggestion is Lintel's own" }, grounded_claims: [], honest_demo: true, build: { hardest_shot: "the UI cause and effect" }, scores, hero_moment: { beat: 2, what: "Apply suggestion end to end" }, uses: ["apply the suggestion", "post the review", "resolve the thread"], last_line: "Get Lintel", end_line_largest: true, ...extra };
        for (const k of drop) delete o[k];
        const fl = path.join(sd, `t10-${Math.random().toString(36).slice(2)}.json`);
        fs.writeFileSync(fl, JSON.stringify(o));
        return node("story.mjs", ["check", "--pitch", fl, "--truth", ptruth]);
      };
      const good = run10();
      ok("one feature: a hook/proof/turn/cta scenario with the feature block, pictures, UI cause and effect and the two-way read passes G7, G9 and G10", gof(good, "G10").pass === true && gof(good, "G7").pass === true && gof(good, "G9").pass === true, [gof(good, "G7"), gof(good, "G9"), gof(good, "G10")].map((g) => g.reasons.join(" | ")).join(" || "));
      const two = run10({ feature: { ...feature, name: "Apply suggestion and Team inbox" } });
      ok("one feature: G10 fails a pitch about two features", gof(two, "G10").pass === false && /more than one feature/.test(gof(two, "G10").reasons.join(" ")));
      const nofe = run10({}, ["feature", "two_way"]);
      ok("one feature: G10 requires the feature block and the two-way read", gof(nofe, "G10").pass === false && /feature missing/.test(gof(nofe, "G10").reasons.join(" ")) && /two_way/.test(gof(nofe, "G10").reasons.join(" ")));
      const fakeOut = scen(); fakeOut[1] = { ...fakeOut[1], visual: "A lavender board of three generic cards builds as the result", ui: ["click Apply"] };
      const fo = run10({ beats: fakeOut });
      ok("one feature: G10 fails an invented output screen and a UI step with no effect", gof(fo, "G10").pass === false && /invented output screen/.test(gof(fo, "G10").reasons.join(" ")) && /cause and its effect|at least 2/.test(gof(fo, "G10").reasons.join(" ")), gof(fo, "G10").reasons.join(" | "));
      const order = scen(); [order[1], order[2]] = [order[2], order[1]];
      ok("one feature: G10 wants hook, proof, turn, cta in that order", gof(run10({ beats: order }), "G10").pass === false);
    }

    // G10, the ladder: a refrain verb, rungs of distinct everyday uses that escalate, a real UI cause and effect per rung, a close
    {
      const gof = (r, id) => { let j = { gates: [] }; try { j = JSON.parse(r.stdout); } catch {} return (j.gates || []).find((x) => x.id === id) || { pass: null, reasons: [r.stdout.slice(0, 300) + r.stderr.slice(0, 300)] }; };
      const lb = (name, role, on_screen, duration_s, more = {}) => ({ name, role, on_screen, visual: `The real Lintel window: ${name}`, picture: `the viewer sees ${name} happen in the real Lintel window`, duration_s, ...more });
      const rungs = () => [
        { ...lb("Rung 1", "rung", "Review one diff", 6, { use: "a small diff", highlight: "one", level: 1, ui: ["open a diff → the Lintel review window appears over it", "click Apply → the change lands in the diff"] }) },
        { ...lb("Rung 2", "rung", "Review longer threads", 6, { use: "a long thread", highlight: "longer", level: 2, ui: ["open a thread → the comments stack in the Lintel pane", "click Resolve → the thread folds"] }) },
        { ...lb("Rung 3", "rung", "Review it for security", 6, { use: "security audit", highlight: "security", level: 3, ui: ["type audit → the Lintel findings appear", "click Fix → the patch lands in the diff"] }) },
        { ...lb("Rung 4", "rung", "Review and get it done", 6, { use: "release checklist", highlight: "done", level: 4, ui: ["type ship → the Lintel checklist ticks itself off", "click Merge → the pull request closes"] }) },
      ];
      const lbeats = () => [lb("Open", "open", "Review with Lintel", 3, { changes: ["the Lintel window opens"] }), ...rungs(), lb("Close", "close", "Review anything", 3)];
      const refrain = { verb: "Review", pattern: "Review <it> <highlight>" };
      const run10l = (extra = {}, drop = [], more = []) => {
        const o = { title: "Review, four ways", logline: "One verb, four real uses, all in Lintel.", aim, approach: "Review is the refrain; each rung is a different real use in the Lintel window, escalating to done-for-you.", device: "escalation", shape: "ladder", refrain, beats: lbeats(), tempo: { ideas: 6, change_every_s: 2.2, longest_hold_s: 4, source: "house" }, first_4s: "the real Lintel window opens on a diff", clear_by_s4: true, swap_test: { competitor: "Rival", result: "breaks", why: "Review in Lintel is its own verb" }, grounded_claims: [], honest_demo: true, build: { hardest_shot: "the UI cause and effect" }, scores, last_line: "Lintel", end_line_largest: true, ...extra };
        for (const k of drop) delete o[k];
        const fl = path.join(sd, `t10l-${Math.random().toString(36).slice(2)}.json`);
        fs.writeFileSync(fl, JSON.stringify(o));
        return node("story.mjs", ["check", "--pitch", fl, "--truth", ptruth, ...more]);
      };
      const withB = (fn) => { const b = lbeats(); fn(b); return b; };
      const why = (r) => gof(r, "G10").reasons.join(" | ");
      const lg = run10l();
      ok("ladder: a refrain, 4 distinct rungs with levels, UI cause and effect and a close passes G10 (and G7)", gof(lg, "G10").pass === true && gof(lg, "G7").pass === true, why(lg) + " || " + gof(lg, "G7").reasons.join(" | "));
      ok("ladder: a launch pitch with no shape and no feature block defaults to the ladder", gof(run10l({}, ["shape"]), "G10").shape === "ladder");
      const f1 = run10l({}, ["refrain"]);
      ok("ladder: G10 fails a missing refrain.verb", gof(f1, "G10").pass === false && /refrain\.verb missing/.test(why(f1)), why(f1));
      const f2 = run10l({ beats: withB((b) => { b[2].on_screen = "Study longer threads"; }) });
      ok("ladder: G10 fails a rung title without the verb (the ways_in beat may use other verbs)", gof(f2, "G10").pass === false && /without the refrain verb "Review"/.test(why(f2)), why(f2));
      const wi = withB((b) => { b.splice(5, 0, lb("Ways in", "ways_in", "Type it, say it, snap it", 3, { ui: ["press the mic → the text types itself"] })); });
      const fw = run10l({ beats: wi, tempo: { ideas: 7, change_every_s: 2.2, longest_hold_s: 4, source: "house" } });
      ok("ladder: a ways_in beat may use other verbs", gof(fw, "G10").pass === true, why(fw));
      const f3 = run10l({ beats: withB((b) => { b.splice(3, 2); }) });
      ok("ladder: G10 fails too few rungs for the length", gof(f3, "G10").pass === false && /rungs: 2 for a/.test(why(f3)), why(f3));
      const many = withB((b) => { ["flight plan", "garden shed", "tax return", "wedding speech"].forEach((u, i) => b.splice(5 + i, 0, { ...b[2], name: `Extra ${i}`, use: u, level: 5 + i, duration_s: 2 })); });
      const f4 = run10l({ beats: many });
      ok("ladder: G10 fails too many rungs for the length (a 38 s film takes 4-6)", gof(f4, "G10").pass === false && /rungs: 8 for a/.test(why(f4)), why(f4));
      const f5 = run10l({ beats: withB((b) => { b[3].use = "a long diff"; }) });
      ok("ladder: G10 fails two rungs that share a use noun (a small diff / a long diff)", gof(f5, "G10").pass === false && /share the use noun "diff"/.test(why(f5)), why(f5));
      const f6 = run10l({ beats: withB((b) => { b[3].level = 1; }) });
      ok("ladder: G10 fails levels that do not strictly increase", gof(f6, "G10").pass === false && /strictly increasing/.test(why(f6)), why(f6));
      const f7 = run10l({ beats: withB((b) => { b[2].duration_s = 14; }) });
      ok("ladder: G10 fails one rung over 35% of the film", gof(f7, "G10").pass === false && /over 35%/.test(why(f7)), why(f7));
      const f8 = run10l({ beats: withB((b) => { delete b[2].ui; }) });
      ok("ladder: G10 fails a rung without ui cause and effect", gof(f8, "G10").pass === false && /without ui cause and effect/.test(why(f8)), why(f8));
      const f9 = run10l({ beats: withB((b) => { b.splice(b.findIndex((x) => x.role === "close"), 1); }) });
      ok("ladder: G10 fails a film with no close beat", gof(f9, "G10").pass === false && /close beat missing/.test(why(f9)), why(f9));
      const w1 = run10l({ beats: withB((b) => { b[1].on_screen = "Review one small diff in the Lintel app right now"; b[2].highlight = "nope"; }) });
      ok("ladder: a title over 6 words and a highlight not in its title are warnings, not G10 errors", /is \d+ words \(6 at most\)/.test(w1.stdout) && /highlight \\?"nope\\?" is not in its title/.test(w1.stdout) && !/title.*6 words|highlight/.test(why(w1)), why(w1));
      const pk = node("story.mjs", ["pick", "--truth", ptruth, "--format", "launch", "--seed", "k"]);
      let pj = {}; try { pj = JSON.parse(pk.stdout); } catch {}
      // (1.14: a launch film offers both viewer-first shapes: Sure ladder, Bold pas, Wild either; updated from "ladder for all three")
      ok("ladder: pick --format launch (category claim) offers the three plot engines: Sure is a ladder (refrain-break), Bold a pas (reversal), Wild a before-after (shape mixed, one rule for each)", pj.shape === "mixed" && /refrain verb/.test(pj.shape_rule || "") && /Pas \(viewer first\)/.test(pj.shape_rule || "") && (pj.picks || []).length === 3 && pj.picks[0].structure === "ladder" && /Sure/.test(pj.picks[0].ladder_variant) && pj.picks[1].structure === "pas" && /Bold/.test(pj.picks[1].pas_variant) && pj.picks[2].structure === "before-after" && pj.picks.map((x) => x.engine).join() === "refrain-break,reversal,before-after", pk.stdout.slice(0, 300));
      const pkl = node("story.mjs", ["pick", "--truth", ptruth, "--format", "launch", "--seed", "k", "--shape", "ladder"]);
      let pjl = {}; try { pjl = JSON.parse(pkl.stdout); } catch {}
      ok("ladder: pick --shape ladder forces the ladder for all three", pjl.shape === "ladder" && (pjl.picks || []).length === 3 && pjl.picks.every((x) => x.structure === "ladder" && /Sure|Bold|Wild/.test(x.ladder_variant)), pkl.stdout.slice(0, 300));
      const pkp = node("story.mjs", ["pick", "--truth", ptruth, "--format", "launch", "--seed", "k", "--shape", "pas"]);
      let pjp = {}; try { pjp = JSON.parse(pkp.stdout); } catch {}
      ok("pas: pick --shape pas forces the viewer-first pas shape for all three, with its rule (hook, agitate, meet, benefits, proof, cta)", pjp.shape === "pas" && (pjp.picks || []).length === 3 && pjp.picks.every((x) => x.structure === "pas" && /Sure|Bold|Wild/.test(x.pas_variant)) && /meet/.test(pjp.shape_rule || "") && /cta/.test(pjp.shape_rule || ""), pkp.stdout.slice(0, 300));
      const pk2 = node("story.mjs", ["pick", "--truth", ptruth, "--format", "launch", "--seed", "k", "--feature", "Sites", "--scope", "single-task"]);
      let pj2 = {}; try { pj2 = JSON.parse(pk2.stdout); } catch {}
      ok("ladder: pick with --feature (one feature named) keeps the scenario shape", pj2.shape === "scenario" && !(pj2.picks || []).some((x) => x.structure), pk2.stdout.slice(0, 200));
      // G13, the story's scope matches the claim (S3 niche diagnosis, run6): a universal claim ("any question becomes a tool") is told as
      // the range of its uses. Fixtures: run6's three ChatGPT pitches (domains added) and the "Ask anything" ladder, on the corrected truth sheet.
      {
        const SD = path.join(HERE, "tests", "fixtures", "story-scope");
        const st = path.join(SD, "truth.md");
        const g13 = (name) => { const r = node("story.mjs", ["check", "--pitch", path.join(SD, `pitch-${name}.json`), "--truth", st, "--length", "30"]); let j = {}; try { j = JSON.parse(r.stdout); } catch {} return { g: (j.gates || []).find((x) => x.id === "G13") || { pass: null, reasons: [r.stderr.slice(0, 200)] }, w: j.warnings || [] }; };
        const wild = g13("Wild"), bold = g13("Bold"), sure = g13("Sure"), ask = g13("ask-anything");
        const wr = wild.g.reasons.join(" | ");
        ok("scope: G13 fails run6's Wild (one dinner: areas 3 < 4, one scenario over 35%, an \"I\" chain and callbacks, the opening is one use's set-up, a retell with no range)", wild.g.pass === false && ["areas:", "dominance:", "persona:", "hook-scenario:", "retell:"].every((k) => wr.includes(k)) && wild.g.S_max > 0.45, wr);
        ok("scope: G13 fails run6's Bold (the receipt opening and its benefits are one scenario over 35%)", bold.g.pass === false && /dominance:/.test(bold.g.reasons.join(" ")) && /hook-scenario:/.test(bold.g.reasons.join(" ")), bold.g.reasons.join(" | "));
        ok("scope: G13 passes run6's Sure (4 areas, the largest use 23%) with a warning (near the 25% aim, the hero is the longest use)", sure.g.pass === true && sure.g.S_max <= 0.25 && sure.w.some((w) => /dominance:|hero:/.test(w)), sure.g.reasons.join(" | ") + " // " + sure.w.join(" | "));
        ok("scope: G13 passes the \"Ask anything\" ladder (7 areas, no use over 16%, P = 0, every promise clause shown)", ask.g.pass === true && ask.g.D >= 4 && ask.g.S_max <= 0.2 && ask.g.P === 0 && !ask.w.some((w) => /coverage:|dominance:|reach/.test(w)), ask.g.reasons.join(" | ") + " // " + ask.w.join(" | "));
        const trio = path.join(sd, "scope-trio.json");
        fs.writeFileSync(trio, JSON.stringify({ pitches: ["Sure", "Bold", "Wild"].map((l) => JSON.parse(fs.readFileSync(path.join(SD, `pitch-${l}.json`), "utf8"))) }));
        let tj = {}; try { tj = JSON.parse(node("story.mjs", ["check", "--pitch", trio, "--truth", st, "--length", "30"]).stdout); } catch {}
        ok("scope: the portfolio fails two scripts that collapse onto one scenario (Bold and Wild are both the dinner bill)", ((tj.portfolio || {}).reasons || []).some((x) => /^collapse:/.test(x) && /The box you type into/.test(x)), JSON.stringify(tj.portfolio || {}).slice(0, 300));
        let up = {}; try { up = JSON.parse(node("story.mjs", ["pick", "--truth", st, "--seed", "a"]).stdout); } catch {}
        ok("scope: pick on a universal claim gives the three plot engines (ladder, pas, before-after: no coin flip), a menu with no user-protagonist device, and each slot leading with different areas of life", up.claim_scope === "universal" && (up.picks || []).length === 3 && up.picks.map((x) => x.shape).join() === "ladder,pas,before-after" && (up.menu || []).length >= 6 && up.menu.every((x) => x.axes.protagonist !== "user") && up.picks.every((x) => (x.lead_domains || []).length) && new Set(up.picks.map((x) => x.lead_domains[0])).size === 3 && /Universal claim/.test(up.scope_rule || ""), JSON.stringify((up.picks || []).map((x) => [x.shape, x.lead_domains])));
        const old = path.join(sd, "truth-no-scope.json");
        fs.writeFileSync(old, JSON.stringify({ ...JSON.parse(fs.readFileSync(ptruth, "utf8")), claim_scope: undefined, use_domains: undefined }));
        const ref = node("story.mjs", ["pick", "--truth", old, "--format", "launch", "--seed", "k"]);
        ok("scope: pick refuses a launch truth sheet without a Claim scope (regenerate it)", ref.status !== 0 && /no Claim scope/.test(ref.stderr), ref.stderr.slice(0, 200));
        const uniFeat = node("story.mjs", ["pick", "--truth", ptruth, "--format", "launch", "--seed", "k", "--feature", "Sites", "--scope", "universal"]);
        let uf = {}; try { uf = JSON.parse(uniFeat.stdout); } catch {}
        ok("scope: one named feature with a universal claim keeps the breadth shapes (a ladder leads even when it is the only feature; the trio is ladder, pas, before-after)", uf.shape === "mixed" && (uf.picks || [])[0].shape === "ladder", uniFeat.stdout.slice(0, 200) + uniFeat.stderr.slice(0, 200));
        const tmpl = path.join(sd, "truth-template.md");
        node("story.mjs", ["truth", "--out", tmpl, "--force"]);
        const tt = fs.existsSync(tmpl) ? fs.readFileSync(tmpl, "utf8") : "";
        ok("scope: the truth template asks for the Claim scope (scope, clauses, audience) and 8 to 12 ranked Use moments", /## Claim scope/.test(tt) && /clauses:/.test(tt) && /## Use moments/.test(tt) && /most universal first/.test(tt) && !/a receipt, a changelog/.test(tt), tt.slice(0, 200));
        // the moves carrier must be what every rung shares, never a scenario's noun
        const ml = await import(path.join(HERE, "lib", "moves-lib.mjs"));
        const wp = JSON.parse(fs.readFileSync(path.join(SD, "pitch-Wild.json"), "utf8"));
        const car = (short) => ml.validateMoves({ carrier: { what: short, short, family: "data", beats: [1, 2, 3, 4, 5], why: "x" } }, { beats: wp.beats, productFirst: true, shape: "pas", productName: "ChatGPT" }).errors.filter((e) => /carrier-scenario/.test(e));
        // the S1 shapes: OpenAI's own Intelligent UI film is an intercut (five people, five areas of life, one enemy, one turn line, a collage)
        const icr = node("story.mjs", ["check", "--pitch", path.join(SD, "pitch-intercut.json"), "--truth", st, "--length", "30"]);
        let icj = {}; try { icj = JSON.parse(icr.stdout); } catch {}
        const icg = (id) => (icj.gates || []).find((x) => x.id === id) || { pass: null, reasons: [] };
        ok("shapes: an intercut pitch (5 threads in 5 areas, one enemy, one turn, a collage) passes its G10 and G13", icg("G10").pass === true && icg("G10").shape === "intercut" && icg("G13").pass === true && icg("G13").D >= 4, icg("G10").reasons.concat(icg("G13").reasons).join(" | "));
        const icBad = path.join(sd, "intercut-bad.json");
        const icp = JSON.parse(fs.readFileSync(path.join(SD, "pitch-intercut.json"), "utf8"));
        fs.writeFileSync(icBad, JSON.stringify({ ...icp, beats: icp.beats.filter((b) => b.role !== "turn").map((b) => (b.role === "thread" ? { ...b, ui: [] } : b)) }));
        let ibj = {}; try { ibj = JSON.parse(node("story.mjs", ["check", "--pitch", icBad, "--truth", st, "--length", "30"]).stdout); } catch {}
        const ibg = (ibj.gates || []).find((x) => x.id === "G10") || { pass: null, reasons: [] };
        ok("shapes: G10 fails an intercut with no turn line and threads with no real UI cause and effect", ibg.pass === false && /turn: 0/.test(ibg.reasons.join(" ")) && /cause and effect/.test(ibg.reasons.join(" ")), ibg.reasons.join(" | "));
        let fp = {}; try { fp = JSON.parse(node("story.mjs", ["pick", "--truth", st, "--seed", "a", "--format-id", "feature-reveal"]).stdout); } catch {}
        ok("shapes: pick follows the format's ranked shapes for the claim's scope (a universal feature launch: ladder, intercut, hero + strip), each with its beats", (fp.picks || []).map((x) => x.shape).join() === "ladder,intercut,hero-strip" && /Intercut parallel uses/.test(fp.shape_rule || "") && fp.picks[1].shape_rule, JSON.stringify((fp.picks || []).map((x) => x.shape)) + (fp.shapes_by || ""));
        const fc = node("formats.mjs", ["check"]);
        let fcj = {}; try { fcj = JSON.parse(fc.stdout); } catch {}
        ok("shapes: formats.mjs check finds every story shape it names in story.mjs (none pending)", Array.isArray(fcj.shapes_pending) && fcj.shapes_pending.length === 0, JSON.stringify(fcj.shapes_pending));
        ok("scope: moves check refuses a carrier named for one scenario (the receipt's guest count) and accepts the composer's caret", car("the receipt's guest count").length === 1 && car("the composer's blinking caret").length === 0, JSON.stringify([car("the receipt's guest count"), car("the composer's blinking caret")]));
      }


      // G11, every line shows: a motion that MEANS each line, built from the product UI or the actor, words and UI touching
      {
        const sh = (b, rows) => b.map((x) => ({ ...x, shows: rows(x) }));
        const showAll = (b, f = {}) => sh(b, (x) => (String(x.on_screen || "").trim() ? [showRow(x.on_screen, f)] : []));
        const actor = { what: "the review cursor", does: "rides under every line and opens each next view" };
        const g11 = (extra = {}, drop = []) => run10l({ actor, beats: showAll(lbeats()), ...extra }, drop);
        const why11 = (r) => gof(r, "G11").reasons.join(" | ");
        const g1 = g11();
        ok("shows: a ladder with an actor and a show row per line (bound to its line, with handoffs) passes G11", gof(g1, "G11").pass === true, why11(g1));
        const g2 = g11({ beats: lbeats() });
        ok("shows: G11 fails beats with on-screen words and no shows (no-shows)", gof(g2, "G11").pass === false && /no-shows/.test(why11(g2)), why11(g2));
        const g3 = g11({}, ["actor"]);
        ok("shows: G11 fails a launch pitch with no actor (no-actor)", gof(g3, "G11").pass === false && /no-actor/.test(why11(g3)), why11(g3));
        const g4 = g11({ beats: sh(lbeats(), (x) => [{ ...showRow(x.on_screen), show: "match cut to scene 3" }]) });
        ok("shows: G11 fails a label-only show", gof(g4, "G11").pass === false && /show-label-only/.test(why11(g4)), why11(g4));
        const g5 = g11({ beats: sh(lbeats(), (x) => [{ ...showRow(x.on_screen), show: "a cursor glides over" }]) });
        ok("shows: G11 fails a show under 8 words (show-short)", gof(g5, "G11").pass === false && /show-short/.test(why11(g5)), why11(g5));
        const g6 = g11({ beats: sh(lbeats(), (x) => [{ ...showRow(x.on_screen), show: "A soft glow drifts across the dark background while smooth particles float around slowly" }]) });
        ok("shows: G11 fails a show that shares no word with its line (show-unbound: it would fit any line)", gof(g6, "G11").pass === false && /show-unbound/.test(why11(g6)), why11(g6));
        const g6b = g11({ beats: sh(lbeats(), (x) => [{ ...showRow(x.on_screen), highlight: "glow", show: "A soft glow drifts across the dark background while smooth particles float around slowly" }]) });
        ok("shows: a show that names the line's highlight word is bound", !/show-unbound/.test(why11(g6b)), why11(g6b));
        const g7 = g11({ beats: sh(lbeats(), (x) => [showRow(x.on_screen, { built_from: "type" })]) });
        ok("shows: G11 fails a product film where under 60% of the shows come from the UI or the actor (show-off-product)", gof(g7, "G11").pass === false && /show-off-product/.test(why11(g7)), why11(g7));
        const g8 = g11({ beats: sh(lbeats(), (x) => [showRow(x.on_screen, { handoff: "" })]) });
        ok("shows: G11 wants a handoff on every row except the film's last (no-handoff)", gof(g8, "G11").pass === false && /no-handoff/.test(why11(g8)) && (why11(g8).match(/no-handoff/g) || []).length === 5, why11(g8));
        const g9 = g11({ beats: sh(lbeats(), (x) => [showRow(x.on_screen, { show: `The review cursor sits beside "${x.on_screen}" while the Lintel thread scrolls past quietly` })]) });
        ok("shows: no touching verb and no in-place change are warnings, not errors", gof(g9, "G11").pass === true && /no-touch/.test(g9.stdout) && /no-swap/.test(g9.stdout), why11(g9));
        const el = path.join(sd, "t11-explainer.json");
        fs.writeFileSync(el, JSON.stringify({ title: "Review, four ways", logline: "One verb, four real uses, all in Lintel.", aim, approach: "Review is the refrain; each rung is a different real use in the Lintel window, escalating to done-for-you.", device: "escalation", beats: lbeats(), scores }));
        const ex = node("story.mjs", ["check", "--pitch", el, "--format", "explainer"]);
        let exj = {}; try { exj = JSON.parse(ex.stdout); } catch {}
        ok("shows: off a launch, promo or brand film the show column only warns (no G11 gate)", !(exj.gates || []).some((x) => x.id === "G11") && (exj.warnings || []).some((w) => /no-shows/.test(w)) && (exj.warnings || []).some((w) => /no-actor/.test(w)), ex.stdout.slice(0, 300) + ex.stderr);
      }

      // G12, viewer first: the viewer is addressed early, a benefit per use, proof, a concrete cta, one line per 1.5-2.5 s (pas: the reveal after the pain)
      {
        const claimsF = path.join(sd, "claims-proof.json"), claimsNo = path.join(sd, "claims-noproof.json");
        fs.writeFileSync(claimsF, JSON.stringify([{ id: "c1", claim: "2,400 teams review with Lintel", source: "site" }, { id: "c2", claim: "Lintel reviews pull requests", source: "site" }]));
        fs.writeFileSync(claimsNo, JSON.stringify({ claims: [{ id: "c2", claim: "Lintel reviews pull requests", source: "site" }] }));
        const row = (line, extra = {}) => ({ line, show: `The review cursor rides under "${line}" and the words swap in place`, built_from: "product UI", handoff: "the line becomes the next one", ...extra });
        const BEN = ["You close a review before standup", "You never lose a thread at work", "You catch the bug before it ships", "You ship by Friday"];
        const cta = { line: "Get Lintel", action: "Download", where: "lintel.example/get" };
        const proof = { line: "2,400 teams review with Lintel", claim: "c1" };
        const lines = [["Review with Lintel", "Your pull request waits.", "Again?"], ["Review one diff", "You skim, you approve."], ["Review longer threads", "You answer in one place."], ["Review it for security", "You catch it early."], ["Review and get it done", "You merge before lunch."], ["Review anything", "You get your day back."]];
        const gb = (o = {}) => lbeats().map((b, i) => ({ ...b, ...(b.role === "rung" ? { benefit: BEN[i - 1] } : {}), shows: lines[i].map((l, j) => row(j === 0 ? b.on_screen : l)) }));
        const g12 = (extra = {}, drop = [], more = ["--claims", claimsF]) => run10l({ beats: gb(), proof, cta, ...extra }, drop, more);
        const why12 = (r) => gof(r, "G12").reasons.join(" | ");
        const ok12 = g12();
        ok("viewer first: a ladder with you early, a benefit per rung, proof, a concrete cta and a line every 1.8 s passes G12", gof(ok12, "G12").pass === true && !/slogan-copy|toy-demos/.test(ok12.stdout), why12(ok12) + ok12.stdout.slice(0, 200));
        const nv = g12({ beats: gb().map((b) => ({ ...b, shows: b.shows.map((r, j) => (j ? { ...r, line: "Diffs, reviewed." } : r)) })) });
        ok("viewer first: G12 fails a film that never addresses the viewer in the first 25% (not-viewer-first)", gof(nv, "G12").pass === false && /not-viewer-first/.test(why12(nv)), why12(nv));
        const nb = g12({ beats: gb().map((b, i) => (i === 2 ? { ...b, benefit: "Faster diffs" } : i === 3 ? { ...b, benefit: undefined } : b)) });
        ok("viewer first: G12 fails a rung with no benefit, or one not in viewer language (no-benefit)", gof(nb, "G12").pass === false && (why12(nb).match(/no-benefit/g) || []).length === 2, why12(nb));
        const lb12 = g12({ beats: gb().map((b, i) => (i === 1 ? { ...b, benefit: "You close a review before standup and never open another tab again today" } : b)) });
        ok("viewer first: a benefit over 12 words is no-benefit", /no-benefit.*words \(12 at most\)/.test(why12(lb12)), why12(lb12));
        const np = g12({}, ["proof"]);
        ok("viewer first: G12 fails a film with no proof when research/claims.json holds a number claim (no-proof)", gof(np, "G12").pass === false && /no-proof/.test(why12(np)) && /c1/.test(why12(np)), why12(np));
        const np2 = g12({}, ["proof"], ["--claims", claimsNo]);
        ok("viewer first: no proof is only a warning when the claims hold no number, adoption, rating or customer claim", gof(np2, "G12").pass === true && /no-proof: the film has no proof and research\/claims\.json holds no/.test(np2.stdout), why12(np2));
        const nc = path.join(sd, "ghost-research"); fs.mkdirSync(path.join(nc, "story"), { recursive: true }); fs.mkdirSync(path.join(nc, "research"), { recursive: true });
        fs.copyFileSync(ptruth, path.join(nc, "story", "truth.json")); fs.writeFileSync(path.join(nc, "research", "claims.json"), JSON.stringify([{ claim: "4.8 stars on the store", source: "store" }]));
        const fl2 = path.join(sd, "t12-auto.json"); fs.writeFileSync(fl2, JSON.stringify({ title: "Review, four ways", logline: "One verb, four real uses, all in Lintel.", aim, approach: "Review is the refrain.", device: "escalation", shape: "ladder", refrain, beats: gb(), cta, scores, first_4s: "x", clear_by_s4: true }));
        const au = node("story.mjs", ["check", "--pitch", fl2, "--truth", path.join(nc, "story", "truth.json")]);
        ok("viewer first: with no --claims, G12 reads <truth dir>/../research/claims.json (a rating claim makes the missing proof an error)", /no-proof/.test(gof(au, "G12").reasons.join(" ")) && gof(au, "G12").pass === false, gof(au, "G12").reasons.join(" | "));
        const wc1 = g12({ cta: { line: "Get Lintel", action: "Learn more", where: "lintel.example/get" } }), wc2 = g12({ cta: { line: "Get Lintel", action: "Download", where: "soon" } }), wc3 = g12({}, ["cta"]);
        ok("viewer first: G12 fails a cta with no concrete verb, no place, or no cta at all (weak-cta)", [wc1, wc2, wc3].every((r) => gof(r, "G12").pass === false && /weak-cta/.test(why12(r))), [wc1, wc2, wc3].map(why12).join(" || "));
        const sp = g12({ beats: lbeats().map((b, i) => (b.role === "rung" ? { ...b, benefit: BEN[i - 1] } : b)) });
        ok("viewer first: G12 fails a film with one line per 5 s (sparse-lines: 30 s over 6 lines)", gof(sp, "G12").pass === false && /sparse-lines: 30 s over 6/.test(why12(sp)), why12(sp));
        const sl = g12({ beats: gb().map((b) => ({ ...b, shows: ["Calm reviews", "Quiet threads", "Smaller diffs", "Less noise"].slice(0, b.shows.length).map((l) => row(l)) })) });
        ok("viewer first: slogan copy (most lines have no verb and no pronoun) is a warning, not an error", /slogan-copy/.test(sl.stdout) && !/slogan-copy/.test(why12(sl)), sl.stdout.slice(0, 100));
        const toy = g12({ beats: gb().map((b) => (b.benefit ? { ...b, benefit: "You get faster diffs" } : b)) });
        ok("viewer first: every use a demo with no life situation in any benefit is the warning toy-demos (not an error)", /toy-demos/.test(toy.stdout) && !/toy-demos/.test(why12(toy)) && !/toy-demos/.test(ok12.stdout), toy.stdout.slice(0, 100));
        // a brand film is not held to G12 (it applies to launch and promo, and to any pas pitch)
        const bgj = (() => { try { return JSON.parse(cg.stdout); } catch { return {}; } })();
        ok("viewer first: a brand-format film has no G12 gate", !(bgj.gates || []).some((x) => x.id === "G12"), cg.stdout.slice(0, 100));

        // pas: hook, agitate, meet, 2-4 benefits, proof, cta; the reveal not before 20%
        const pb = (name, role, on_screen, duration_s, more = {}) => ({ ...lb(name, role, on_screen, duration_s, more), shows: (more.rows || [on_screen]).map((l) => row(l)) });
        const pasBeats = () => [
          pb("Pain", "hook", "Your inbox never sleeps.", 4, { rows: ["Your inbox never sleeps.", "Forty threads before breakfast."], changes: ["a new thread lands"] }),
          pb("Woah", "agitate", "Woah.", 3, { rows: ["Woah.", "You are a really busy person."], changes: ["the stack wobbles"] }),
          pb("Meet", "meet", "Meet Lintel.", 4, { rows: ["Meet Lintel.", "One window for every review."], picture: "the Lintel mark lands as the window opens", changes: ["the mark lands"] }),
          pb("Benefit 1", "benefit", "Reviews, done in place.", 4, { rows: ["Reviews, done in place.", "Apply it, then move on."], benefit: BEN[0], ui: ["click Apply → the change lands in the diff"], changes: ["the diff folds"] }),
          pb("Benefit 2", "benefit", "Threads that stay put.", 4, { rows: ["Threads that stay put.", "Nothing slips by."], benefit: BEN[1], ui: ["open a thread → the comments stack in the Lintel pane"], changes: ["the thread pins"] }),
          pb("Benefit 3", "benefit", "Bugs, caught early.", 4, { rows: ["Bugs, caught early.", "Before they ship."], benefit: BEN[2], ui: ["type audit → the Lintel findings appear"], changes: ["the findings tick in"] }),
          pb("Proof", "proof", "2,400 teams review with Lintel.", 4, { rows: ["2,400 teams review with Lintel.", "Join them."], changes: ["the count ticks up"] }),
          pb("Join", "cta", "Get Lintel.", 4, { rows: ["Get Lintel.", "lintel.example/get"], changes: ["the button wipes in"] }),
        ];
        const pasRun = (extra = {}, drop = [], more = ["--claims", claimsF]) => run10l({ title: "Your review day", logline: "Lintel clears your review queue before standup.", shape: "pas", beats: pasBeats(), proof, cta, tempo: { ideas: 8, change_every_s: 2, longest_hold_s: 4, source: "house" }, last_line: "Get Lintel", end_line_largest: true, actor: { what: "the review cursor", does: "rides under every line" }, ...extra }, [...drop, "refrain"], more);
        const pg = pasRun();
        ok("pas: hook, agitate, meet at 23%, three benefits with a real UI behaviour each, proof and a concrete cta pass G7, G9, G10 and G12", ["G7", "G9", "G10", "G12"].every((id) => gof(pg, id).pass === true) && gof(pg, "G10").shape === "pas", ["G7", "G9", "G10", "G12"].map((id) => id + ": " + gof(pg, id).reasons.join(" | ")).join(" || "));
        const pe = pasRun({ beats: pasBeats().map((b, i) => (i === 0 ? { ...b, duration_s: 1.5 } : i === 1 ? { ...b, duration_s: 1 } : b)) });
        ok("pas: G12 fails a reveal before 20% of the film (reveal-too-early)", gof(pe, "G12").pass === false && /reveal-too-early/.test(gof(pe, "G12").reasons.join(" ")), gof(pe, "G12").reasons.join(" | "));
        const po = pasRun({ beats: pasBeats().filter((b) => b.role !== "agitate") });
        ok("pas: the agitate beat is optional", gof(po, "G10").pass === true, gof(po, "G10").reasons.join(" | "));
        const pn = pasRun({ beats: pasBeats().filter((b) => b.name !== "Meet") });
        ok("pas: G10 fails a film with no meet beat", gof(pn, "G10").pass === false && /meet: 0 beats/.test(gof(pn, "G10").reasons.join(" ")), gof(pn, "G10").reasons.join(" | "));
        const pone = pasRun({ beats: pasBeats().filter((b) => b.name !== "Benefit 2" && b.name !== "Benefit 3") });
        ok("pas: G10 wants two to four benefit beats", gof(pone, "G10").pass === false && /benefit beats: 1/.test(gof(pone, "G10").reasons.join(" ")), gof(pone, "G10").reasons.join(" | "));
        const pui = pasRun({ beats: pasBeats().map((b) => (b.name === "Benefit 1" ? { ...b, ui: [] } : b)) });
        ok("pas: G10 fails a benefit beat with no UI cause and effect", gof(pui, "G10").pass === false && /benefit beat\(s\) without a ui cause and effect/.test(gof(pui, "G10").reasons.join(" ")), gof(pui, "G10").reasons.join(" | "));
        const ppo = pasRun({ beats: [...pasBeats().slice(0, 3), pasBeats()[6], ...pasBeats().slice(3, 6), pasBeats()[7]] });
        ok("pas: G10 wants the order hook, agitate, meet, benefits, proof, cta", gof(ppo, "G10").pass === false && /order:/.test(gof(ppo, "G10").reasons.join(" ")), gof(ppo, "G10").reasons.join(" | "));
        const pnv = pasRun({ beats: pasBeats().map((b) => ({ ...b, on_screen: b.on_screen.replace("Your inbox never sleeps.", "Inboxes never sleep."), shows: b.shows.map((r) => ({ ...r, line: r.line.replace("Your inbox never sleeps.", "Inboxes never sleep.").replace("You are a really busy person.", "Busy people everywhere.") })) })), });
        ok("pas: not-viewer-first when the first 25% never says you", gof(pnv, "G12").pass === false && /not-viewer-first/.test(gof(pnv, "G12").reasons.join(" ")), gof(pnv, "G12").reasons.join(" | "));
        const pimp = node("story.mjs", ["check", "--pitch", (() => { const fl = path.join(sd, "t12-pas-only.json"); fs.writeFileSync(fl, JSON.stringify({ title: "Your review day", logline: "Lintel clears your review queue before standup.", aim, approach: "Starts with your day.", device: "escalation", shape: "pas", beats: pasBeats(), proof, cta, scores, first_4s: "x", clear_by_s4: true })); return fl; })(), "--claims", claimsF]);
        ok("pas: a pas pitch is held to G12 even with no launch format or truth sheet", (JSON.parse(pimp.stdout).gates || []).some((x) => x.id === "G12" && x.pass === true), pimp.stdout.slice(0, 200));
      }
    }
    // the museum script of the real failed film is refused by the gate when run product-first
    const mu = node("story.mjs", ["check", "--pitch", path.join(sd, "script-good.json"), "--length", "45", "--narrated", "--product-first"]);
    let rmu = { gates: [] };
    try { rmu = JSON.parse(mu.stdout); } catch {}
    ok("product-first: the museum script fails G7 under --product-first", (rmu.gates.find((x) => x.id === "G7") || {}).pass === false, mu.stdout.slice(0, 300));
  }
  // lint: the references and prompts carry the product-first, brand-lock, concept-gate and turn-ending rules
  {
    const SK = path.join(HERE, "..");
    const rd = (f) => { try { return fs.readFileSync(path.join(SK, f), "utf8"); } catch { return ""; } };
    const pfmd = rd("references/product-first.md");
    ok("lint: references/product-first.md carries the rules (3 s, hero moment, 2-4 uses, end line largest, no conceits, fidelity, brand lock, concept gate)", ["within 3 s", "hero product moment", "One feature, one scenario", "2 to 4 real steps", "largest type", "museums", "cover versions", "faithfully recreated", "Brand lock", "concept gate", "clearest product story", "first_watch"].every((k) => pfmd.includes(k)), pfmd ? "missing phrase" : "file missing");
    // the skill is split into progressive guides: the phrases below live in SKILL.md and the references/workflows guides together
    const wfDir = path.join(SK, "references", "workflows");
    const wfAll = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? wfAll(path.join(d, e.name)) : e.name.endsWith(".md") ? [fs.readFileSync(path.join(d, e.name), "utf8")] : []));
    const skill = rd("SKILL.md") + "\n" + wfAll(wfDir).join("\n");
    ok("lint: SKILL.md and its guides state the product-first rule, the brand lock, the concept gate and not ending a turn with background work running", ["Launch, promo and product films are product-first", "Brand lock.", "Concept gate before the expensive work", "Never end a turn while your own background work is running", "console.mjs wait"].every((k) => skill.includes(k)) && /brand step ALWAYS runs/.test(skill) && /use_brand/.test(skill));
    const sw = rd("agents/script-writer.md"), se = rd("agents/script-editor.md"), cc = rd("agents/concept-critic.md"), ds = rd("agents/design-system-designer.md");
    ok("lint: the writers', editor's, concept critic's and design desk's prompts carry the product-first and brand-lock rules", /product_first/.test(sw) && /hero_moment/.test(sw) && /clearest product story/.test(se) && /first_watch/.test(se) && ["product_on_screen_by_3s", "hero_moment", "tone_matches_brief", "end_line_large", "on_brand", "first_watch_clear"].every((k) => cc.includes(k)) && /brand_lock/.test(ds) && /composition, layout, motion language and density only/.test(ds));
    // the brand-faithful launch pipeline is written into the skill, the design desk, the story references and the agents
    {
      const bfm = rd("references/brand-film.md"), dd = rd("references/design-desk.md"), st = rd("references/story.md"), sc = rd("references/script.md"), cr = rd("references/crew.md");
      const an = rd("agents/brand-film-analyst.md"), md = rd("agents/motion-director.md"), cr2 = rd("agents/critic.md"), fr = rd("agents/frame-designer.md");
      ok("lint: SKILL.md and its guides carry the brand-faithful launch pipeline (research with brandfilm.mjs and the analyst, grammar not outside references, simple story, style-match gate on frames and draft, motion obeys the brand)", ["Brand-faithful launch films", "brandfilm.mjs", "brand film analyst", "FILM-STYLE.md", "brandfilm.mjs compare", "after the key frames AND after the first draft render", "Paula Scher", "PRIMARY source", "flat card", "no film found"].every((k) => skill.includes(k)) && /about 3 minutes on Fast pace/.test(skill) && /at most 2 official films/.test(skill), "SKILL.md");
      ok("lint: references/brand-film.md has the pipeline and the OpenAI worked example (what went wrong, what the card says)", ["find", "fetch", "frames", "measure", "card", "compare", "OpenAI", "Bodoni", "77%", "gallery green", "Paula Scher", "dE 4.1", "primary", "Fast"].every((k) => bfm.includes(k)), "brand-film.md");
      ok("lint: the design desk reference forbids outside references for a branded film and names the FILM-STYLE citation", /film_style/.test(dd) && /Paula Scher/.test(dd) && /unbranded films only/.test(dd) && /film_style_takes/.test(dd));
      ok("lint: the story references carry the launch-film structure (hook in 1 to 3 s, reveal, demos, payoff, end card; scripts differ in emphasis and order only)", /launch-film\.md/.test(st) && /launch-film\.md/.test(sc) && /emphasis and order/.test(st) && /emphasis and order/.test(sc) && /payoff_line/.test(st) && /1 to 3 s/.test(sc));
      ok("lint: the crew reference lists the brand film analyst and the style gate", /brand-film-analyst/.test(cr) && /brandfilm\.mjs compare/.test(cr));
      ok("lint: the analyst, Motion Director, critic and frame designer prompts carry the brand film rules", /type scale/.test(an) && /Substitute/.test(an) && /contact sheets/.test(an) && /FILM-STYLE\.md` FIRST/.test(md) && /never means no 3D or hybrid scenes: it means flat-style 3D/.test(md) && /style_match/.test(cr2) && /brandfilm\.mjs" compare|brandfilm\.mjs\" compare/.test(cr2 + fr), "agents");
    }
    const ban = rd("taxonomy/devices.json");
    ok("lint: the catalog still has the conceit devices the product-first filter keeps out (so the filter is doing something)", /"museum-exhibit"/.test(ban) && /"cover-version"/.test(ban));
  }
}
// 12. anti-slop: a project full of AI-video tells fails with fixes; a clean one passes
{
  const mk = (name, html, scenes, bedSeconds) => {
    const d = path.join(TMP, "slop", name);
    fs.mkdirSync(path.join(d, "compositions"), { recursive: true });
    fs.mkdirSync(path.join(d, "assets"), { recursive: true });
    fs.writeFileSync(path.join(d, "compositions", "s1.html"), html);
    fs.writeFileSync(path.join(d, "scenes.json"), JSON.stringify({ scenes }));
    spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", `sine=frequency=330:duration=${bedSeconds}`, path.join(d, "assets", "music-bed.wav")]);
    return d;
  };
  const badHtml = `<style>.h{text-shadow:0 0 18px #0ff}.k{text-shadow:0 0 12px #f0f}.m{text-shadow:0 0 14px #0ff}.bg{background:linear-gradient(135deg,#7c3aed,#2563eb)}</style><div class="bg"><h1 class="h">Introducing Tally — seamless bookkeeping!</h1><span>00:12</span><span>120 BPM</span></div><p>It's not just an app, it's your accountant.</p><script>gsap.to(".x",{y:10,repeat:-1,yoyo:true});${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => `tl.from(".e${i}",{opacity:0,y:40,duration:0.6})`).join(";")}</script>`;
  const bad = mk("bad", badHtml, [{ title: "a", duration: 2, on_screen: "Streamline your workflow with our amazing new platform today" }, { title: "b", duration: 4 }, { title: "c", duration: 4 }, { title: "end", duration: 1, on_screen: "Tally" }], 5);
  const good = mk("good", `<style>h1{font-family:"Bricolage Grotesque"}</style><h1>Paper forgets.</h1><p>Tally reads every receipt the moment you get it.</p><script>tl.from(".h",{clipPath:"inset(0 100% 0 0)"});tl.from(".p",{scale:0.9,opacity:0});tl.fromTo(".r",{xPercent:-100},{xPercent:0});tl.from(".n",{y:30,opacity:0});tl.from(".l",{drawSVG:0});tl.from(".c",{x:-60});tl.from(".b",{rotation:-8,scale:0.8});tl.from(".t",{opacity:0})</script>`, [{ title: "Hook", duration: 2.5, on_screen: "Paper forgets." }, { title: "Year", duration: 6, on_screen: "Twelve months of paper." }, { title: "Tap", duration: 4.5, on_screen: "One tap." }, { title: "End", duration: 3, on_screen: "Tally" }], 20);
  const rb = node("slop.mjs", ["--project", bad, "--json"]);
  const rg = node("slop.mjs", ["--project", good, "--json"]);
  let jb = { findings: [] };
  try { jb = JSON.parse(rb.stdout); } catch {}
  const rules = new Set(jb.findings.map((f) => f.rule));
  ok("anti-slop: generic copy, \"not X, it's Y\", glow past its budget (uniform glow), AI gradient, corner labels, idle loops, everything fading up, unreadable text, no end hold and a looping bed are caught (exit 2)", rb.status === 2 && ["generic-copy", "not-x-its-y", "glow-uniform", "ai-gradient", "corner-micro-label", "idle-breathing", "uniform-entrances", "unreadable", "no-end-hold", "music-loop"].every((r) => rules.has(r)), [...rules].join(", ") + rb.stderr);
  ok("anti-slop: a clean project passes", rg.status === 0, rg.stdout.slice(0, 300));
  // W4: finish default-on, hero effects are budgets (glow, blur-in, particles), uniform use stays an error
  {
    const sj = (r) => { try { return JSON.parse(r.stdout).findings || []; } catch { return []; } };
    const has = (fs_, rule) => fs_.some((f) => f.rule === rule);
    const scenes4 = [{ title: "Hook", duration: 3, on_screen: "Paper forgets." }, { title: "Tap", duration: 4, on_screen: "One tap." }, { title: "Year", duration: 4, on_screen: "Every receipt." }, { title: "End", duration: 3, on_screen: "Tally" }];
    const clean = `tl.from(".h",{clipPath:"inset(0 100% 0 0)"});tl.from(".p",{scale:0.9,opacity:0});tl.fromTo(".r",{xPercent:-100},{xPercent:0});tl.from(".l",{drawSVG:0})`;
    const one = mk("w4-glow-one", `<style>h1{font-family:"Bricolage Grotesque"}.send{box-shadow:0 0 28px #0285ff}</style><h1>Paper forgets.</h1><button class="send">Send</button><script>${clean}</script>`, scenes4, 20);
    const scoreOk = path.join(one, "score.json");
    fs.writeFileSync(scoreOk, JSON.stringify({ budget: [{ effect: "glow", scene: 2, target: ".send", reason: "the one moment the answer is sent" }] }));
    const a = sj(node("slop.mjs", ["--project", one, "--score", scoreOk, "--json", "--no-text-fit"]));
    ok("slop (W4): one budgeted glow on the hero passes with no glow finding", !a.some((f) => /^glow-/.test(f.rule)), JSON.stringify(a.map((f) => f.rule)));
    const b = node("slop.mjs", ["--project", one, "--json", "--no-text-fit"]);
    ok("slop (W4): the same glow with no budget entry is a warning (glow-unbudgeted), never an error", b.status === 0 && has(sj(b), "glow-unbudgeted") && !has(sj(b), "glow-uniform"), b.stdout.slice(0, 300));
    const many = mk("w4-glow-many", `<style>h1{font-family:"Bricolage Grotesque"}.a{text-shadow:0 0 12px #0ff}.b{text-shadow:0 0 12px #0ff}.c{box-shadow:0 0 30px #0ff}.d{text-shadow:0 0 16px #0ff}</style><h1 class="a">Paper forgets.</h1><p class="b">x</p><div class="c">y</div><p class="d">z</p><script>${clean}</script>`, scenes4, 20);
    const c = node("slop.mjs", ["--project", many, "--score", scoreOk, "--json", "--no-text-fit"]);
    ok("slop (W4): glow on four elements in a 14 s film (budget 2) is uniform use: glow-uniform, exit 2, budget or not", c.status === 2 && has(sj(c), "glow-uniform"), c.stdout.slice(0, 300));
    const blur = mk("w4-blurin", `<style>h1{font-family:"Bricolage Grotesque"}</style><h1>Paper forgets.</h1><script>${clean};${[1, 2, 3].map((i) => `tl.from(".w${i}",{filter:"blur(12px)",opacity:0})`).join(";")}</script>`, scenes4, 20);
    const d = node("slop.mjs", ["--project", blur, "--json", "--no-text-fit"]);
    ok("slop (W4): blur-in on three entrances in a 14 s film is uniform (blur-in-uniform)", d.status === 2 && has(sj(d), "blur-in-uniform"), d.stdout.slice(0, 300));
    const e = sj(node("slop.mjs", ["--project", good, "--json", "--no-text-fit"]));
    ok("slop (W4): a project with no grain, soft shadow or lit ground gets the finish-missing warning (the finish layer is default-on)", has(e, "finish-missing"), JSON.stringify(e.map((f) => f.rule)));
    const r4 = path.join(TMP, "w4-run"); fs.mkdirSync(path.join(r4, "brand-film"), { recursive: true });
    fs.writeFileSync(path.join(r4, "brand-film", "grammar.json"), JSON.stringify({ measured: { finish: { layerOff: true, route: "graphic" } } }));
    const f = sj(node("slop.mjs", ["--project", good, "--run", r4, "--json", "--no-text-fit"]));
    ok("slop (W4): no finish-missing when the brand film measured no finish (finish.layerOff: the graphic route)", !has(f, "finish-missing"), JSON.stringify(f.map((x) => x.rule)));
    const { checkBudget, budgetLimit, effectOf } = await import(path.join(HERE, "lib", "budget.mjs"));
    const cb = checkBudget([{ effect: "glow", scene: 1, target: "#a", reason: "the answer lands here" }, { effect: "overshoot", scene: 2, target: "all", reason: "" }], 20);
    ok("budget (W4): lib/budget.mjs limits 2 under 30 s and 3 from 30 s, maps words to effects, and refuses an entry with no reason or an 'all' target", budgetLimit(20) === 2 && budgetLimit(45) === 3 && effectOf("a soft bloom") === "glow" && effectOf("back.out landing") === "overshoot" && cb.P.length === 2 && cb.P.some((m) => /needs a reason/.test(m)) && cb.P.some((m) => /hero only/.test(m)), JSON.stringify(cb));
  }
}
// 12b. logos are real files: the brand researcher's check needs a downloaded, valid file listed in logos.json (or a "none" with why);
//      the slop check fails a drawn lookalike, passes the asset, and passes the name in type when there is no logo
{
  const d = path.join(TMP, "logos");
  const run = path.join(d, "run"), res = path.join(run, "research", "brand"), assets = path.join(res, "assets");
  fs.mkdirSync(assets, { recursive: true });
  fs.writeFileSync(path.join(res, "DESIGN.md"), `---\nname: Tally\ncolors:\n  canvas: "#FFFFFF"   # page (source: tally.example/css)\n  ink: "#0D0D0D"      # text\n  accent: "#2F5BFF"   # brand\ntypography:\n  display: { fontFamily: "Bricolage Grotesque", fontWeight: 600 }\n  body: { fontFamily: "Inter", fontWeight: 400 }\n---\n## Logo\nA blossom mark in ink, centred, alone on the canvas.\n## Motion\nUI 150 to 250 ms.\n`);
  fs.writeFileSync(path.join(run, "research", "brand.md"), "# Tally brand\nColours from https://tally.example/app.css and https://tally.example/brand .\n");
  const chk = () => node("crew.mjs", ["check", "--run", run, "--role", "brand-researcher"], { cwd: d });
  let r = chk();
  ok("logos: a logo described only in prose (no assets, no logos.json) fails the brand researcher's check", r.status === 2 && /logos\.json is missing/.test(r.stdout), r.stdout.slice(0, 300));
  const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M50 10 C70 10 90 30 90 50 C90 70 70 90 50 90 C30 90 10 70 10 50 C10 30 30 10 50 10Z"/><path d="M30 50 L70 50"/></svg>`;
  fs.writeFileSync(path.join(assets, "mark.svg"), SVG);
  r = chk();
  ok("logos: a file on disk that logos.json doesn't list still fails", r.status === 2 && /logos\.json is missing/.test(r.stdout));
  fs.writeFileSync(path.join(assets, "logos.json"), JSON.stringify([{ file: "mark.svg", kind: "mark", source_url: "https://tally.example/logo.svg" }]));
  r = chk();
  ok("logos: a valid SVG listed in logos.json with its source passes", r.status === 0, r.stdout.slice(0, 300));
  fs.writeFileSync(path.join(assets, "mark.svg"), "<svg><g></svg>");
  r = chk();
  ok("logos: an SVG that does not parse fails", r.status === 2 && /not a valid SVG/.test(r.stdout), r.stdout.slice(0, 300));
  const png = (n) => { const b = Buffer.alloc(33); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b); b.writeUInt32BE(13, 8); b.write("IHDR", 12); b.writeUInt32BE(n, 16); b.writeUInt32BE(n, 20); return b; };
  fs.rmSync(path.join(assets, "mark.svg"));
  fs.writeFileSync(path.join(assets, "mark.png"), png(256));
  fs.writeFileSync(path.join(assets, "logos.json"), JSON.stringify([{ file: "mark.png", kind: "mark", source_url: "https://tally.example/icon.png" }]));
  r = chk();
  ok("logos: a PNG under 512 px fails", r.status === 2 && /512/.test(r.stdout), r.stdout.slice(0, 300));
  fs.writeFileSync(path.join(assets, "mark.png"), png(600));
  r = chk();
  ok("logos: a PNG of 600 px passes", r.status === 0, r.stdout.slice(0, 300));
  fs.writeFileSync(path.join(assets, "mark.png"), Buffer.from("not a png at all, just text"));
  ok("logos: a file that is not a PNG fails", chk().status === 2);
  fs.rmSync(path.join(assets, "mark.png"));
  fs.writeFileSync(path.join(assets, "logos.json"), JSON.stringify({ none: true, why: "searched the header, favicon and press page: only a raster favicon of 32 px", searched: ["https://tally.example", "https://tally.example/press"] }));
  r = chk();
  ok("logos: none with why and the URLs searched passes (with a warning)", r.status === 0 && /no official logo file/.test(r.stdout), r.stdout.slice(0, 300));
  fs.writeFileSync(path.join(assets, "logos.json"), JSON.stringify({ none: true }));
  ok("logos: none without why or searched URLs fails", chk().status === 2);

  // the scan: a built composition next to the researched files
  const mkProj = (name, html, logosJson, files = {}) => {
    const p = path.join(d, name);
    fs.mkdirSync(path.join(p, "compositions"), { recursive: true });
    fs.mkdirSync(path.join(p, "assets", "brand"), { recursive: true });
    fs.writeFileSync(path.join(p, "compositions", "end.html"), html);
    fs.writeFileSync(path.join(p, "assets", "brand", "logos.json"), JSON.stringify(logosJson));
    for (const [f, c] of Object.entries(files)) fs.writeFileSync(path.join(p, "assets", "brand", f), c);
    return p;
  };
  const slop = (p) => { const r = node("slop.mjs", ["--project", p, "--json"]); let j = { findings: [] }; try { j = JSON.parse(r.stdout); } catch {} return { r, logo: j.findings.filter((f) => f.rule === "logo-not-the-file") }; };
  const listed = [{ file: "mark.svg", kind: "mark", source_url: "https://tally.example/logo.svg" }];
  const circles = `<div class="end-card"><div class="brand-mark" id="blossom"><div style="width:40px;height:40px;border-radius:50%"></div><div style="width:40px;height:40px;border-radius:50%"></div></div><h1>Tally</h1></div>`;
  let s = slop(mkProj("logo-drawn", circles, listed, { "mark.svg": SVG }));
  ok("logos: a six-circle \"logo\" fails the slop check and names the element", s.r.status === 2 && s.logo.some((f) => f.severity === "error" && /brand-mark/.test(f.where)), JSON.stringify(s.logo));
  s = slop(mkProj("logo-svgdrawn", `<div class="end-card"><svg class="logo" viewBox="0 0 10 10"><circle cx="5" cy="5" r="2"/><circle cx="2" cy="2" r="2"/></svg></div>`, listed, { "mark.svg": SVG }));
  ok("logos: an inline <svg> logo whose paths are not the asset's fails", s.logo.some((f) => f.severity === "error"), JSON.stringify(s.logo));
  s = slop(mkProj("logo-glyph", `<div class="end-card"><div class="logo">✿</div><h1>Tally</h1></div>`, listed, { "mark.svg": SVG }));
  ok("logos: a unicode glyph standing in for the logo fails", s.logo.some((f) => f.severity === "error" && /glyph/.test(f.why)), JSON.stringify(s.logo));
  s = slop(mkProj("logo-good", `<div class="end-card"><img class="brand-mark" alt="Tally logo" src="../assets/brand/mark.svg"><h1>Tally</h1><div class="dot" style="border-radius:50%"></div></div>`, listed, { "mark.svg": SVG }));
  ok("logos: the asset <img> passes, and an unlabelled decorative circle is left alone", !s.logo.length, JSON.stringify(s.logo));
  s = slop(mkProj("logo-inline", `<div class="end-card"><svg class="logo" viewBox="0 0 100 100"><path d="M50 10 C70 10 90 30 90 50 C90 70 70 90 50 90 C30 90 10 70 10 50 C10 30 30 10 50 10Z"/><path d="M30 50 L70 50"/></svg></div>`, listed, { "mark.svg": SVG }));
  ok("logos: an inline <svg> with the asset's own path data passes", !s.logo.length, JSON.stringify(s.logo));
  s = slop(mkProj("logo-redrawn-file", `<div class="end-card"><img class="logo" src="../assets/brand/mark2.svg"></div>`, listed, { "mark.svg": SVG, "mark2.svg": SVG.replace("M30 50", "M31 50") }));
  ok("logos: an <img> of a different file (not the same bytes) fails", s.logo.some((f) => f.severity === "error" && /not the downloaded file/.test(f.why)), JSON.stringify(s.logo));
  const none = { none: true, why: "searched the header, favicon and press page: nothing official", searched: ["https://tally.example", "https://tally.example/press"] };
  s = slop(mkProj("logo-none-type", `<div class="end-card"><div class="wordmark" style="font-family:'Bricolage Grotesque'">Tally</div></div>`, none));
  ok("logos: with none, the name set in type passes", !s.logo.length && s.r.status === 0, JSON.stringify(s.logo));
  s = slop(mkProj("logo-none-drawn", circles, none));
  ok("logos: with none, a drawn symbol still fails", s.logo.some((f) => f.severity === "error"), JSON.stringify(s.logo));
}
// 13. sound: a 120 BPM track with a real ending is read right, fitted without a loop, rendered to -14 LUFS;
//     a too-short track says needs_longer; a looped bed is caught; SFX obey causality and the budget
{
  const d = path.join(TMP, "sound");
  fs.mkdirSync(d, { recursive: true });
  const J = (r) => { try { return JSON.parse(r.stdout); } catch { return {}; } };
  // kick on every beat (accented downbeats), a 17-bar chord cycle (no verbatim repeats), final hit at 40 s ringing out
  const expr = "0.5*(lt(t\\,40)*(sin(2*PI*55*t)*exp(-25*mod(t\\,0.5))*if(lt(mod(t\\,2)\\,0.5)\\,1\\,0.55)+0.12*sin(2*PI*196*pow(2\\,mod(5*floor(t/2)\\,17)/12)*t)+0.08*sin(2*PI*294*pow(2\\,mod(5*floor(t/2)\\,17)/12)*t))+gte(t\\,40)*exp(-2.2*(t-40))*(0.9*sin(2*PI*55*t)+0.3*sin(2*PI*220*t)))";
  const track = path.join(d, "track.wav");
  spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", `aevalsrc='${expr}':s=44100:d=45`, track]);
  const a = J(node("sound.mjs", ["analyze", "--track", track]));
  ok("sound: analyze reads 120 BPM, bars on the beat and the real ending at 40 s", Math.abs(a.bpm - 120) < 1 && Math.abs(a.bars?.[1] - 2) < 0.03 && a.ending?.natural && Math.abs(a.ending.hit - 40) < 0.05, JSON.stringify({ bpm: a.bpm, bars: a.bars?.slice(0, 2), ending: a.ending }));
  const f = node("sound.mjs", ["fit", "--track", track, "--film", "30", "--out", path.join(d, "plan.json")]);
  const p = J(f);
  ok("sound: fit plans 30 s within +/-1 s on bar lines, no repeat", f.status === 0 && Math.abs(p.film_duration - 30) <= 1 && !p.needs_longer && p.shape !== "repeat" && p.grid?.downbeats?.length > 10, f.stderr || JSON.stringify({ shape: p.shape, film: p.film_duration }));
  const r = J(node("sound.mjs", ["render", "--plan", path.join(d, "plan.json"), "--out", path.join(d, "bed.wav")]));
  ok("sound: render masters the bed to -14 LUFS, true peak <= -1 dBTP", Math.abs(r.lufs + 14) <= 1 && r.true_peak <= -1, JSON.stringify(r).slice(0, 200));
  const c = node("sound.mjs", ["check", "--audio", path.join(d, "bed.wav")]);
  ok("sound: check passes the fitted bed", c.status === 0, c.stdout.slice(0, 300));
  const long = J(node("sound.mjs", ["fit", "--track", track, "--film", "70"]));
  ok("sound: a 45 s track for a 70 s film says needs_longer", long.needs_longer === true, JSON.stringify({ shape: long.shape, needs_longer: long.needs_longer }));
  spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-stream_loop", "2", "-i", track, "-t", "100", path.join(d, "looped.wav")]);
  const cl = node("sound.mjs", ["check", "--audio", path.join(d, "looped.wav")]);
  ok("sound: check catches a looped bed (exit 2, audible loop)", cl.status === 2 && /audible loop/.test(cl.stdout), `exit ${cl.status}`);
  // no-sfx (a film of 15 s or more with zero cues), flat-dynamics (LRA under 2 LU), ring-out-ending (music audible > 1 s after the logo)
  {
    const nosfx = path.join(d, "sfx-none.json"), somesfx = path.join(d, "sfx-some.json");
    fs.writeFileSync(nosfx, JSON.stringify({ cues: [] }));
    fs.writeFileSync(somesfx, JSON.stringify({ cues: [{ t: 5, kind: "click" }, { t: 12, kind: "reveal" }] }));
    const bed = path.join(d, "bed.wav");
    const n1 = node("sound.mjs", ["check", "--audio", bed, "--sfx", nosfx]);
    ok("sound: check fails a 30 s film with zero SFX cues (no-sfx, exit 2)", n1.status === 2 && /"what": "no-sfx"/.test(n1.stdout), n1.stdout.slice(0, 300));
    const n2 = node("sound.mjs", ["check", "--audio", bed, "--sfx", nosfx, "--silent-by-choice", "a quiet music-only piece"]);
    ok("sound: --silent-by-choice \"<reason>\" lets a film with no SFX pass and records the reason", n2.status === 0 && /silent_by_choice/.test(n2.stdout) && !/no-sfx/.test(n2.stdout), n2.stdout.slice(0, 300));
    const n3 = node("sound.mjs", ["check", "--audio", bed, "--sfx", somesfx]);
    ok("sound: a film with SFX cues passes the no-sfx check", n3.status === 0 && !/no-sfx/.test(n3.stdout), n3.stdout.slice(0, 300));
    const n4 = node("sound.mjs", ["check", "--audio", bed]);
    ok("sound: with no --sfx at all, a 15 s+ film gets a no-sfx warning (nothing measured), not an error", n4.status === 0 && /no-sfx: no --sfx given/.test(n4.stdout), n4.stdout.slice(0, 300));
    const tone = path.join(d, "tone.wav");
    spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=f=440:d=20", "-af", "volume=0.3", tone]);
    const fd = node("sound.mjs", ["check", "--audio", tone, "--sfx", somesfx]);
    ok("sound: a bed that never moves (LRA under 2 LU) warns flat-dynamics", /flat-dynamics: loudness range/.test(fd.stdout), fd.stdout.slice(0, 400));
    const evEarly = path.join(d, "events-logo-early.json"), evEnd = path.join(d, "events-logo-end.json");
    fs.writeFileSync(evEarly, JSON.stringify({ events: [{ id: "logo", t: 12, kind: "logo" }] }));
    fs.writeFileSync(evEnd, JSON.stringify({ events: [{ id: "logo", t: 29.6, kind: "logo" }] }));
    const r1 = node("sound.mjs", ["check", "--audio", bed, "--sfx", somesfx, "--events", evEarly]);
    ok("sound: music still audible long after the logo event warns ring-out-ending", /ring-out-ending: the music is still audible/.test(r1.stdout), r1.stdout.slice(0, 400));
    const r2 = node("sound.mjs", ["check", "--audio", bed, "--sfx", somesfx, "--events", evEnd]);
    ok("sound: a logo on the last beat is not a ring-out", !/ring-out-ending/.test(r2.stdout), r2.stdout.slice(0, 400));
  }
  fs.writeFileSync(path.join(d, "scenes.json"), JSON.stringify({ narration: true, scenes: [{ title: "a", duration: 10, voiceover: "x" }, { title: "b", duration: 10, voiceover: "y" }, { title: "c", duration: 10 }] }));
  fs.writeFileSync(path.join(d, "events.json"), JSON.stringify({ events: [{ id: "fade", t: 1, kind: "fade" }, { id: "cut", t: 10, kind: "whoosh" }, { id: "l1", t: 12, kind: "land", group: "g" }, { id: "l2", t: 12.3, kind: "land", group: "g" }, { id: "l3", t: 12.6, kind: "land", group: "g" }, ...[0, 0.2, 0.4, 0.6].map((x, i) => ({ id: `c${i}`, t: 20 + x, kind: "click" }))] }));
  const sx = J(node("sound.mjs", ["sfx-plan", "--scenes", path.join(d, "scenes.json"), "--events", path.join(d, "events.json")]));
  const why = (id) => (sx.skipped || []).find((s) => s.event === id)?.why || "";
  const inWin = (sx.cues || []).filter((q) => q.t >= 20 && q.t < 21).length;
  ok("sfx-plan: no sound for a fade, no whoosh on an ordinary cut, stagger keeps first+last, <= 3 per second, never ahead of the picture", /not a causal/.test(why("fade")) && /ordinary transition/.test(why("cut")) && /stagger/.test(why("l2")) && inWin <= 3 && (sx.cues || []).every((q) => q.start + (q.sync_point || 0) >= q.t - 0.001 && q.start + (q.sync_point || 0) <= q.t + 0.034), JSON.stringify(sx.skipped).slice(0, 400));
}

// 14. the crew: plan, prompt files, the score's checks, the score written into a storyboard, local search
//     and inventory (no secrets), a motion strip of a composition
{
  const ws = path.join(TMP, "crew-ws");
  const run = path.join(ws, ".rasanai", "r1");
  fs.mkdirSync(run, { recursive: true });
  const C = (a) => spawnSync(process.execPath, [path.join(HERE, "crew.mjs"), ...a], { encoding: "utf8", env, cwd: ws, timeout: 180000 });
  const J2 = (r) => { try { return JSON.parse(r.stdout); } catch { return {}; } };
  const plan = J2(C(["plan", "--run", run, "--route", "product-launch-video", "--subject", "Tally", "--url", "https://tally.example", "--public", "--scenes", "4", "--length", "20"]));
  const roles = (plan.phases || []).flatMap((p) => p.members);
  ok("crew: a 20 s launch takes the direct path: the brand film analyst in place of the precedent researcher, three writers, a score (the plan), ONE film builder and the critics; no scene animators, no seam pass", plan.phases && !roles.some((m) => m.startsWith("precedent-researcher")) && ["product-researcher", "brand-researcher", "brand-film-analyst", "research-lead", "script-writer:Bold", "script-editor", "motion-director:score", "film-builder:film", "critic:film-1"].every((r) => roles.some((m) => m.startsWith(r))) && !roles.some((m) => /^scene-animator|motion-director:seams|film-builder:lead/.test(m)), JSON.stringify(roles));
  for (const r of ["r-deep", "r-60", "r-45"]) fs.mkdirSync(path.join(ws, ".rasanai", r), { recursive: true });
  const deep = J2(C(["plan", "--run", path.join(ws, ".rasanai", "r-deep"), "--route", "product-launch-video", "--subject", "Tally", "--public", "--scenes", "4", "--length", "20", "--deep"]));
  const droles = (deep.phases || []).flatMap((p) => p.members), dph = (deep.phases || []).map((p) => p.phase);
  ok("crew: --deep keeps the long path: a lead builder for the carriers before an animator per scene, then the seam pass", ["film-builder:lead", "scene-animator:4", "motion-director:seams"].every((r) => droles.some((m) => m.startsWith(r))) && dph.indexOf("lead") >= 0 && dph.indexOf("lead") < dph.indexOf("animate") && dph.indexOf("animate") < dph.indexOf("seams"), JSON.stringify(dph));
  const long60 = J2(C(["plan", "--run", path.join(ws, ".rasanai", "r-60"), "--route", "product-launch-video", "--subject", "Tally", "--scenes", "8", "--length", "60"]));
  ok("crew: a 60 s film keeps parallel animators; a 45 s one has one builder", (long60.phases || []).some((p) => p.phase === "animate") && (J2(C(["plan", "--run", path.join(ws, ".rasanai", "r-45"), "--route", "general-video", "--subject", "Tally", "--scenes", "5", "--length", "45"])).phases || []).some((p) => p.phase === "build"), JSON.stringify((long60.phases || []).map((p) => p.phase)));
  const lean = J2(C(["plan", "--run", path.join(ws, ".rasanai", "r1"), "--route", "product-launch-video", "--subject", "Tally", "--scenes", "4", "--lean"]));
  ok("crew: --lean drops the precedent, the writers' room and the extra critics", !(lean.phases || []).flatMap((p) => p.members).some((m) => /precedent|script-|critic:(motion|frames)/.test(m)), JSON.stringify(lean.phases && lean.phases.map((p) => p.members)));
  C(["plan", "--run", run, "--route", "product-launch-video", "--subject", "Tally", "--public", "--scenes", "4", "--length", "20"]);
  // the concept gate: a Sonnet-tier critic between the look and the motion score, six questions, evidence and exact fixes
  {
    const phs = (plan.phases || []).map((p) => p.phase);
    ok("crew: the plan has a concept-gate phase after the story and before the score", phs.includes("concept-gate") && phs.indexOf("concept-gate") < phs.indexOf("score") && phs.indexOf("concept-gate") > phs.indexOf("design-systems"), phs.join(","));
    C(["plan", "--run", run, "--route", "product-launch-video", "--subject", "Tally", "--public", "--scenes", "4", "--length", "20"]);
    // the script editor cannot be skipped: no concept critic until story/edit-notes.json passes (S3 niche diagnosis)
    const early = C(["brief", "--run", run, "--role", "concept-critic", "--key", "concept-1"]);
    ok("crew: the concept critic is refused until the script editor has passed (the editor cannot be skipped)", early.status !== 0 && /script editor has not passed/.test(early.stderr + early.stdout), (early.stdout + early.stderr).slice(0, 300));
    {
      const panel = (n) => ["a student", "a parent", "a retiree", "a nurse", "a shop owner", "an office worker"].map((who, i) => ({ who, sees_self: i < n, wants_to_be: true, beat: 2 }));
      const en = path.join(run, "story", "edit-notes.json");
      fs.mkdirSync(path.dirname(en), { recursive: true });
      const notes = (recPanel) => ({ pitches: [{ id: "sure", label: "Sure", verdict: "ship", score: 7, strongest: "the range", notes: [], recognition: panel(6) }, { id: "wild", label: "Wild", verdict: "ship", score: 7, strongest: "one dinner", notes: [], recognition: panel(recPanel) }], recommended: "wild", why: "x", first_watch: "the real composer by 1 s, every ask becomes a tool by 10 s, then they try it" });
      fs.writeFileSync(en, JSON.stringify(notes(2)));
      const niche = C(["check", "--run", run, "--role", "script-editor"]);
      ok("crew: the editor may not recommend a script the recognition panel fails (2/6 see themselves) while another passes", niche.status !== 0 && /recognition panel/.test(niche.stdout), niche.stdout.slice(0, 300));
      fs.writeFileSync(en, JSON.stringify(notes(6)));
      const fine = C(["check", "--run", run, "--role", "script-editor"]);
      ok("crew: the editor's notes with a full recognition panel pass, and unlock the concept critic", fine.status === 0, fine.stdout.slice(0, 300));
    }
    const cb = J2(C(["brief", "--run", run, "--role", "concept-critic", "--key", "concept-1"]));
    const promptFile = cb.prompt_file || cb.file || cb.prompt || "";
    const ptxt = promptFile && fs.existsSync(path.resolve(ws, promptFile)) ? fs.readFileSync(path.resolve(ws, promptFile), "utf8") : JSON.stringify(cb);
    ok("crew: the concept critic brief carries product_first, the six questions and a faster model", /product_first/.test(ptxt) && /first_watch_clear/.test(ptxt) && /faster model/.test(JSON.stringify(cb)), JSON.stringify(cb).slice(0, 300));
    const cf = path.join(run, "story", "concept-check.json");
    fs.mkdirSync(path.dirname(cf), { recursive: true });
    const ans = (okv) => Object.fromEntries(["product_on_screen_by_3s", "hero_moment", "tone_matches_brief", "end_line_large", "on_brand", "first_watch_clear", "one_feature_one_scenario", "scope_matches_claim"].map((k) => [k, okv ? { ok: true, evidence: "beat 1, S_max 0.2, D 4" } : { ok: false, evidence: "beat 1", fix: "open on the real UI" }]));
    fs.writeFileSync(cf, JSON.stringify({ verdict: "pass", answers: ans(false), summary: "x" }));
    const bad = C(["check", "--run", run, "--role", "concept-critic", "--key", "concept-1"]);
    fs.writeFileSync(cf, JSON.stringify({ verdict: "pass", answers: ans(true), summary: "6 of 6" }));
    const good = C(["check", "--run", run, "--role", "concept-critic", "--key", "concept-1"]);
    ok("crew: concept-critic check refuses a pass with failed answers and accepts a complete pass", bad.status !== 0 && /not ok but the verdict is pass/.test(bad.stdout + bad.stderr) && good.status === 0, (bad.stdout + good.stdout).slice(0, 300));
    // the brand-faithful launch pipeline: brand film research phase, the analyst role and its check, the style-match gates
    {
      const bp = J2(C(["plan", "--run", run, "--route", "product-launch-video", "--subject", "ChatGPT for Mac", "--brand", "OpenAI", "--kind", "launch", "--scenes", "4", "--length", "30", "--pace", "fast", "--deep"]));
      // the same branded launch on the direct path: product + brand research and the brand film only, no Look desk (the
      // look is the brand's, decided), the moments, the plan, ONE builder, the animatic from the draft, no key frames
      fs.mkdirSync(path.join(ws, ".rasanai", "r-bdirect"), { recursive: true });
      const dp = J2(C(["plan", "--run", path.join(ws, ".rasanai", "r-bdirect"), "--route", "product-launch-video", "--subject", "ChatGPT for Mac", "--brand", "OpenAI", "--kind", "launch", "--scenes", "4", "--length", "30", "--pace", "fast"]));
      const dph = (dp.phases || []).map((x) => x.phase), dm = (dp.phases || []).flatMap((x) => x.members);
      ok("short film flow: a 30 s branded launch plans brief research (product + brand + brand film only), the story, the Look decided from the brand, the concept gate, moments, the styleframes (one designer, the juror, the styleframes call), the plan, one builder and an animatic from the draft; no design desk, no key frames after the score, no screens or precedent researcher", ["research", "brand-film", "story", "look-auto", "concept-gate", "styleframes", "style-match-boards", "frames-jury", "styleframes-call", "moments", "score", "build", "animatic-draft", "style-match-draft"].every((x) => dph.includes(x)) && dph.indexOf("styleframes") < dph.indexOf("score") && !dph.some((x) => /^(design-research|design-systems|keyframes|keyframes-review|style-match-keyframes|animate|seams|lead)$/.test(x)) && !dm.some((m) => /screens-researcher|precedent-researcher|^frame-designer|scene-animator/.test(m)) && dph.indexOf("moments") < dph.indexOf("score") && dph.indexOf("build") < dph.indexOf("animatic-draft"), dph.join(","));
      const bph = (bp.phases || []).map((p) => p.phase), bm = (bp.phases || []).flatMap((p) => p.members);
      const planF = JSON.parse(fs.readFileSync(path.join(run, "crew", "plan.json"), "utf8"));
      const ph = (n) => (planF.phases || []).find((p) => p.phase === n) || {};
      ok("crew: a branded launch film plans the brand-film phase (brandfilm.mjs steps + the Sonnet brand-film-analyst) before the design systems", bph.includes("brand-film") && bph.indexOf("brand-film") < bph.indexOf("design-systems") && bm.some((m) => m.startsWith("brand-film-analyst") && /fast/.test(m)) && /brandfilm\.mjs frames/.test(JSON.stringify(ph("brand-film").director_steps)) && /3 minutes/.test(ph("brand-film").when), bph.join(","));
      ok("crew: the style-match gate (brandfilm.mjs compare) is planned after the boards and after the first draft", bph.includes("style-match-boards") && bph.indexOf("style-match-boards") > bph.indexOf("boards") && bph.indexOf("style-match-boards") < Math.max(bph.indexOf("animate"), bph.indexOf("build")) && bph.includes("style-match-draft") && bph.indexOf("style-match-draft") < bph.indexOf("review-film") && /compare --ref/.test(ph("style-match-boards").gate) && /compare --ref/.test(ph("style-match-draft").gate), bph.join(","));
      const un = J2(C(["plan", "--run", path.join(ws, ".rasanai", "r-unbranded"), "--route", "faceless-explainer", "--subject", "tides", "--scenes", "4"]));
      ok("crew: an unbranded explainer has no brand-film phase or style-match gate", !(un.phases || []).some((p) => /brand-film|style-match/.test(p.phase)), JSON.stringify((un.phases || []).map((p) => p.phase)));
      const fb = J2(C(["brief", "--run", run, "--role", "brand-film-analyst"]));
      const fbt = fb.prompt ? fs.readFileSync(path.join(ws, fb.prompt), "utf8") : "";
      ok("crew: the brand-film-analyst brief names the card, the contact sheets, the checklist and a faster model", /Role: brand film analyst/.test(fbt) && /FILM-STYLE\.md/.test(fbt) && /contact sheets/.test(fbt) && /type scale/.test(fbt) && /faster model/.test(JSON.stringify(fb)), JSON.stringify(fb).slice(0, 200));
      const mb = J2(C(["brief", "--run", run, "--role", "motion-director", "--key", "score"]));
      const mbt = mb.prompt ? fs.readFileSync(path.join(ws, mb.prompt), "utf8") : "";
      ok("crew: a branded launch film skips the outside-reference design researcher and the precedent researcher (the brand film covers both) and waits for the brand film card instead", !bph.includes("design-research") && !bm.some((m) => m.startsWith("precedent-researcher")) && /FILM-STYLE\.md\) is accepted/.test(ph("design-systems").when), bph.join(","));
      ok("crew: the Motion Director brief lists FILM-STYLE.md first among its inputs and says flat keeps 3D but in the flat style (no blur, grain or glow)", /brand_film/.test(mbt) && mbt.indexOf("FILM-STYLE.md: the brand film") > -1 && mbt.indexOf("FILM-STYLE.md: the brand film") < mbt.indexOf("design system (its Motion") && /flat style/.test(mbt) && /Brand-flat 3D/.test(mbt) && /READ \S*FILM-STYLE\.md\S* FIRST|READ FIRST/.test(mbt), mbt.slice(mbt.indexOf("Dispatch"), mbt.indexOf("Dispatch") + 600));
      const bfd = path.join(run, "brand-film");
      fs.mkdirSync(bfd, { recursive: true });
      const card = { version: 1, brand: "OpenAI", source: "Refreshed.", measured: { palette: [{ hex: "#fafafa", share: 0.77 }, { hex: "#0a0a0a", share: 0.04 }], background: { overall: "#fafafa" } }, slots: { typefaces: "", motif: "", layout: "", motionVocabulary: "", photographyStyle: "", endCard: "", notes: "" }, filled: false };
      fs.writeFileSync(path.join(bfd, "FILM-STYLE.json"), JSON.stringify(card));
      fs.writeFileSync(path.join(bfd, "FILM-STYLE.md"), "# Film style: OpenAI\n\n## Slots\n- Typefaces:\n- Motif:\n");
      const ea = C(["check", "--run", run, "--role", "brand-film-analyst"]);
      ok("crew: brand-film-analyst check refuses an unfilled card (empty slots, missing checklist items, no source)", ea.status === 2 && /slots\.typefaces/.test(ea.stdout) && /says nothing about/.test(ea.stdout), ea.stdout.slice(0, 300));
      const full = { ...card, filled: true, slots: { typefaces: "OpenAI Sans, Light to Bold; two size classes (huge statements, tiny labels). Substitute: Inter", motif: "the dot: dot, circle, outline circle, dot grid, dot", layout: "one element at a time, centred, huge whitespace", motionVocabulary: "flat: no 3D, no blur, no grain; scale, morph, draw-on, cut on the beat", photographyStyle: "real bright photography full bleed or framed on white", endCard: "the mark alone, big, on white, held 3 s", tempo: "11 ideas in 110 s, about 10 s per idea; a change every 3 s; longest hold 6 s; breathes before the payoff", notes: "never a dark ground" } };
      fs.writeFileSync(path.join(bfd, "FILM-STYLE.json"), JSON.stringify(full));
      fs.writeFileSync(path.join(bfd, "FILM-STYLE.md"), "# Film style: OpenAI\n\nSources: Refreshed. (110 s, primary)\n\n## Slots\n- Canvas and palette: near-white canvas 77%, black ink, colour under 5% (palette shares)\n- Typefaces and type scale: OpenAI Sans, statement and label sizes. Substitute: Inter\n- Layout and grid: centred, whitespace\n- Motif: the dot\n- Motion vocabulary: scale, morph, draw-on; never 3D, blur or grain\n- Photography and illustration: real photography\n- Cut rate and transitions: calm holds and bursts; hard cuts and morphs\n- Tempo: 11 ideas, a change every 3 s, longest hold 6 s\n- End card: the mark alone\n");
      const eb = C(["check", "--run", run, "--role", "brand-film-analyst"]);
      ok("crew: brand-film-analyst check accepts a filled card (all eleven checklist items, sources, slots)", eb.status === 0, eb.stdout.slice(0, 400));
      ok("crew (W4): a card that lists bans instead of Seen / Not seen, with no measured Finish line, is told to rewrite them (warnings)", /Not seen \(allowed on a budget\)/.test(eb.stdout) && /no ..?Finish:..? line/.test(eb.stdout), eb.stdout.slice(0, 600));
      fs.writeFileSync(path.join(bfd, "FILM-STYLE.json"), JSON.stringify({ ...full, slots: { ...full.slots, motionVocabulary: "Seen: scale, morph, draw-on, cut on the beat, soft defocus exits. Not seen (allowed on a budget): glow, overshoot, blur-in" } }));
      fs.writeFileSync(path.join(bfd, "FILM-STYLE.md"), fs.readFileSync(path.join(bfd, "FILM-STYLE.md"), "utf8").replace("- Motion vocabulary: scale, morph, draw-on; never 3D, blur or grain\n", "- Motion vocabulary: Seen: scale, morph, draw-on. Not seen (allowed on a budget): glow, overshoot\n- Finish: grain 0, ground chroma 0, no soft shadow. Route: graphic\n"));
      const ec = C(["check", "--run", run, "--role", "brand-film-analyst"]);
      ok("crew (W4): a Seen / Not seen card with a Finish line passes with none of those warnings", ec.status === 0 && !/allowed on a budget|Finish:..? line|never used/.test(ec.stdout), ec.stdout.slice(0, 600));
      const sc = path.join(run, "motion", "score.json");
      fs.mkdirSync(path.dirname(sc), { recursive: true });
      fs.writeFileSync(sc, JSON.stringify({ scenes: [{ n: 1, space: "3d" }] }));
      const mdf = C(["check", "--run", run, "--role", "motion-director", "--key", "score"]);
      ok("crew: motion-director check refuses a score without the film card citation and 3D scenes under a flat card", /FILM-STYLE|film_style/.test(mdf.stdout) && /flat/.test(mdf.stdout), mdf.stdout.slice(0, 400));
      fs.rmSync(bfd, { recursive: true, force: true });
      fs.rmSync(sc, { force: true });
      C(["plan", "--run", run, "--route", "product-launch-video", "--subject", "Tally", "--public", "--scenes", "4", "--length", "20", "--no-brand-film"]);
    }
  }

  const br = J2(C(["brief", "--run", run, "--role", "brand-researcher"]));
  const prompt = br.prompt ? fs.readFileSync(path.join(ws, br.prompt), "utf8") : "";
  ok("crew: brief writes a self-contained prompt (crew rules, the role, inputs, outputs, its check)", /never ask the user/i.test(prompt) && /Role: brand researcher/.test(prompt) && /## Dispatch context/.test(prompt) && /research\/brand\/DESIGN\.md/.test(prompt) && /crew\.mjs" check/.test(prompt) && /run_in_background: true/.test(br.dispatch || "") && /Show off/.test(prompt), (br.prompt || "") + prompt.slice(-300));
  const fail = C(["check", "--run", run, "--role", "brand-researcher"]);
  ok("crew: check refuses missing work (exit 2, says what)", fail.status === 2 && /DESIGN\.md is missing/.test(fail.stdout), fail.stdout.slice(0, 200));
  // a good score for 4 scenes, then the same score broken three ways
  fs.writeFileSync(path.join(run, "scenes.json"), JSON.stringify({ message: "m", scenes: [3, 4, 2.5, 3].map((d, i) => ({ title: `S${i + 1}`, duration: d, visual: "v" })) }));
  const H = { x: 960, y: 540, scale: 1, opacity: 1, direction: "left", speed: 400 };
  const good = {
    duration: 12.5, brand: "Tally", feature: { name: "Receipt scan", url: "https://tally.example/scan", viewer: "a freelancer at month end", task: "file a receipt", before: "receipts fade in a drawer", after: "filed the moment it is shot" }, ground: "#ffffff", ink: "#111111", current: "left", brandReveal: "s3",
    spine: "the receipt", motif: { what: "the total", scenes: [1, 2, 4] }, showreel: [{ scene: 2, t: 3.8, what: "the receipt folds into the ledger row" }, { scene: 3, t: 0.4, what: "the push-through reveal" }], rhythm: "fast-SLOW-fast-hold", signature: { seam: "2>3", technique: "push-through", why: "the reveal" },
    video_direction: { palette: "p", motion_grammar: "g", holds: "h", negative: ["no drift"] },
    depth: { plan: "2D film; the reveal (scene 3) lifts the ledger into depth" },
    scenes: [3, 4, 2.5, 3].map((d, i) => ({ n: i + 1, id: `s${i + 1}`, start: [0, 3, 7, 9.5][i], end: [3, 7, 9.5, 12.5][i], line: `Line ${i + 1}`, picture: `the receipt does thing ${i + 1}`, ...(i < 2 ? { exit: "carrier", carrier: "the receipt" } : {}), title: `S${i + 1}`, duration: d, energy: [2, 3, 5, 2][i], layout: ["full-bleed", "split", "centered", "asymmetric 60/40"][i], camera: "T1 lean-in",
      space: i === 2 ? "hybrid" : "2d",
      ...(i === 2 ? { camera3d: { lens_mm: 50, fstop: 2.8, moves: [{ t0: 0, t1: 0.3, move: "locked" }, { t0: 0.3, t1: 1.6, move: "arc 28° right", ease: "power3.inOut" }] }, light: "three-point, key upper-left", materials: "ledger = panel with the real screenshot" } : {}),
      shots: [{ t0: 0, t1: d / 2, on_screen: "a", moves: "rises", primary: "a" }, { t0: d / 2, t1: d, on_screen: "b", moves: "holds", primary: "b" }],
      entrances: [{ element: "a", type: "cut-in" }, { element: "b", type: ["mask-rise", "type-on", "scale-from-origin", "draw-on"][i] }], events: [{ t: 0.5, what: "tap", sound: "tap" }] })),
    seams: [{ from: 1, to: 2, kind: "shared-element", element: "receipt", out: H, in: H, why: "w" }, { from: 2, to: 3, kind: "signature", why: "w" }, { from: 3, to: 4, kind: "cut", why: "w" }],
  };
  fs.mkdirSync(path.join(run, "motion"), { recursive: true });
  fs.writeFileSync(path.join(run, "motion", "score.md"), "# score\n");
  const put = (s) => fs.writeFileSync(path.join(run, "motion", "score.json"), JSON.stringify(s));
  put(good);
  const g = C(["check", "--run", run, "--role", "motion-director", "--key", "score"]);
  ok("crew: a complete score is accepted", g.status === 0, g.stdout.slice(0, 400));
  const smd = fs.readFileSync(path.join(run, "motion", "score.md"), "utf8");
  ok("plan: check writes score.md from score.json (feature, world, beats with line, picture and exit)", /generated from motion\/score\.json/.test(smd) && /\*\*Feature:\*\* Receipt scan/.test(smd) && /ground #ffffff/.test(smd) && /### s2 · 3-7 s/.test(smd) && /\*\*Exit:\*\* carrier: the receipt/.test(smd), smd.slice(0, 400));
  const noplan = JSON.parse(JSON.stringify(good));
  for (const k of ["ground", "current", "brandReveal", "feature"]) delete noplan[k];
  noplan.scenes.forEach((x) => { delete x.picture; delete x.exit; delete x.carrier; });
  noplan.scenes[2].start = 6;
  put(noplan);
  const np = C(["check", "--run", run, "--role", "motion-director", "--key", "score"]);
  ok("plan: a direct film's score must carry the plan (ground, current, one brandReveal, the feature, start/end that follow the durations, pictures, two carried seams)", np.status === 2 && ["ground missing", "current missing", "brandReveal must name exactly one", "feature {", "start/end", "need line", "carry at least 2"].every((w) => np.stdout.includes(w)), np.stdout.slice(0, 600));
  put(good);

  // a ladder film (the chosen script's shape) carries a refrain, not a feature block; a scenario film still must
  fs.mkdirSync(path.join(run, "story"), { recursive: true });
  const chosenP = path.join(run, "story", "chosen.json");
  const nofeat = JSON.parse(JSON.stringify(good));
  delete nofeat.feature;
  put(nofeat);
  fs.writeFileSync(chosenP, JSON.stringify({ shape: "ladder", beats: [{ role: "open" }, { role: "rung" }, { role: "rung" }, { role: "close" }] }));
  const ladF = C(["check", "--run", run, "--role", "motion-director", "--key", "score"]);
  ok("crew: a ladder film's score needs no feature block", ladF.status === 0 && !/feature \{/.test(ladF.stdout), ladF.stdout.slice(0, 400));
  fs.writeFileSync(chosenP, JSON.stringify({ shape: "scenario", feature: { name: "Receipt scan" }, beats: [{ role: "hook" }, { role: "proof" }, { role: "turn" }, { role: "cta" }] }));
  const sf = C(["check", "--run", run, "--role", "motion-director", "--key", "score"]);
  ok("crew: a scenario film's score still needs its feature block", sf.status === 2 && /feature \{ name, url, viewer, task, before, after \}/.test(sf.stdout), sf.stdout.slice(0, 400));
  // show-unscored: every show row of the chosen script is realised in a shot (warning each; an error past 30%)
  const rowsOf = (n) => [1, 2, 3, 4].slice(0, n).map((i) => ({ line: `Line ${i}`, show: "x", built_from: "product UI", handoff: "h" }));
  const shownScore = (lines) => { const o = JSON.parse(JSON.stringify(nofeat)); o.scenes.forEach((x, i) => { x.shots[0].on_screen = lines[i] ? `${lines[i]} appears` : "a"; }); return o; };
  fs.writeFileSync(chosenP, JSON.stringify({ shape: "ladder", beats: [{ role: "open", shows: rowsOf(1) }, { role: "rung", shows: [rowsOf(2)[1]] }, { role: "rung", shows: [rowsOf(3)[2]] }, { role: "close", shows: [rowsOf(4)[3]] }] }));
  put(shownScore(["Line 1", "Line 2", "Line 3", "Line 4"]));
  const so0 = C(["check", "--run", run, "--role", "motion-director", "--key", "score"]);
  ok("crew: a score that realises every show row has no show-unscored", so0.status === 0 && !/show-unscored/.test(so0.stdout), so0.stdout.slice(0, 400));
  put(shownScore(["Line 1", "Line 2", "Line 3", null]));
  const so1 = C(["check", "--run", run, "--role", "motion-director", "--key", "score"]);
  ok("crew: one of four show rows unscored is a show-unscored warning, not an error", so1.status === 0 && /show-unscored: the line .{1,2}Line 4/.test(so1.stdout), so1.stdout.slice(0, 400));
  put(shownScore(["Line 1", "Line 2", null, null]));
  const so2 = C(["check", "--run", run, "--role", "motion-director", "--key", "score"]);
  ok("crew: more than 30% of show rows unscored is a show-unscored error (exit 2)", so2.status === 2 && /2 of 4 show rows are not realised/.test(so2.stdout), so2.stdout.slice(0, 400));
  fs.rmSync(chosenP, { force: true });
  const bad = JSON.parse(JSON.stringify(good));
  delete bad.seams[0].in.speed;
  bad.showreel = [];
  bad.scenes[1].duration = 6;
  bad.scenes.forEach((s) => (s.energy = 3));
  put(bad);
  const b = C(["check", "--run", run, "--role", "motion-director", "--key", "score"]);
  ok("crew: the score check catches a half-stated handoff, a changed duration, a flat energy curve and no showreel moments", b.status === 2 && /in: missing speed/.test(b.stdout) && /scenes\.json says 4s/.test(b.stdout) && /no peak/.test(b.stdout) && /showreel names 0/.test(b.stdout), b.stdout.slice(0, 500));
  // moments are placed, not slotted: a picked moment no beat uses warns moment-unplaced; placed or dropped with a reason is quiet
  fs.mkdirSync(path.join(run, "references", "moments"), { recursive: true });
  fs.writeFileSync(path.join(run, "references", "moments", "credits.json"), JSON.stringify({ moments: [{ id: "M900", place: "opening" }] }));
  const mu = JSON.parse(JSON.stringify(good));
  put(mu);
  ok("crew: a picked moment on no beat warns moment-unplaced", /moment-unplaced: the picked moment M900/.test(C(["check", "--run", run, "--role", "motion-director", "--key", "score"]).stdout));
  mu.moments_placed = [{ id: "M900", beat: 1, take: "a click zooms into the field", why: "builds the first ask" }];
  put(mu);
  ok("crew: a placed moment is not warned", !/moment-unplaced/.test(C(["check", "--run", run, "--role", "motion-director", "--key", "score"]).stdout));
  delete mu.moments_placed; mu.moments_dropped = [{ id: "M900", why: "no beat has a click" }];
  put(mu);
  ok("crew: a dropped moment with a reason is not warned", !/moment-unplaced/.test(C(["check", "--run", run, "--role", "motion-director", "--key", "score"]).stdout));
  fs.rmSync(path.join(run, "references"), { recursive: true, force: true });
  // space: a 4-scene film with no depth (and no reason) is refused; a 3D scene without its camera, light and materials too
  const flat = JSON.parse(JSON.stringify(good));
  flat.scenes.forEach((x) => { x.space = "2d"; delete x.camera3d; delete x.light; delete x.materials; });
  delete flat.depth;
  put(flat);
  const fl = C(["check", "--run", run, "--role", "motion-director", "--key", "score"]);
  ok("crew: a 4-scene score with no depth plan and no 3D scene is refused (the push into space)", fl.status === 2 && /depth: say where 3D goes/.test(fl.stdout) && /no 3D or hybrid scene/.test(fl.stdout), fl.stdout.slice(0, 400));
  flat.depth = { none_because: "a strict Swiss print style: depth would break the grid" };
  put(flat);
  ok("crew: a flat film is accepted when depth.none_because says why", C(["check", "--run", run, "--role", "motion-director", "--key", "score"]).status === 0);
  const no3 = JSON.parse(JSON.stringify(good));
  delete no3.scenes[2].camera3d; delete no3.scenes[2].light;
  no3.showreel = [{ scene: 1, t: 1, what: "a" }, { scene: 2, t: 1, what: "b" }];
  put(no3);
  const n3 = C(["check", "--run", run, "--role", "motion-director", "--key", "score"]);
  ok("crew: a 3D scene needs its lens, camera legs and light, and a 3D film needs a 3D showreel moment", n3.status === 2 && /camera3d\.lens_mm/.test(n3.stdout) && /light is missing/.test(n3.stdout) && /none of its showreel moments is in a 3D/.test(n3.stdout), n3.stdout.slice(0, 500));
  put(good);
  // 3D is a technique for any show: a flat brand restricts the STYLE of 3D (flat-3d-style); a film of 20 s or more needs a 3D moment (no-3d-moment)
  {
    const bfd3 = path.join(run, "brand-film");
    fs.mkdirSync(bfd3, { recursive: true });
    fs.writeFileSync(path.join(bfd3, "FILM-STYLE.json"), JSON.stringify({ version: 1, brand: "OpenAI", slots: { motionVocabulary: "flat: no blur, no grain, no glow; 3D style: matte or unlit materials, clean even light" }, filled: true }));
    const fs3 = JSON.parse(JSON.stringify(good));
    fs3.film_style = "brand-film/FILM-STYLE.md";
    const d3 = fs3.scenes.findIndex((x) => x.space === "3d" || x.space === "hybrid");
    const flatOk = (o) => { o.scenes.forEach((x) => { if (x.space === "3d" || x.space === "hybrid") { x.materials = "MeshBasicMaterial dots in #0a0a0a, matte"; x.light = "clean even ambient, no rim"; if (x.camera3d) { delete x.camera3d.fstop; delete x.camera3d.motionBlur; } } }); };
    flatOk(fs3);
    put(fs3);
    const f3a = C(["check", "--run", run, "--role", "motion-director", "--key", "score"]);
    ok("crew: a flat-brand score with a basic-material 3D scene passes (a flat card restricts the style of 3D, not its use)", d3 > -1 && !/flat-3d-style|no 3D or hybrid/.test(f3a.stdout), f3a.stdout.slice(0, 400));
    const f3b = JSON.parse(JSON.stringify(fs3));
    f3b.scenes[d3].materials = "chrome glass with bloom"; f3b.scenes[d3].camera3d = { ...(f3b.scenes[d3].camera3d || {}), fstop: 2.8 };
    put(f3b);
    const f3c = C(["check", "--run", run, "--role", "motion-director", "--key", "score"]);
    ok("crew: a flat-brand 3D scene with unbudgeted bloom fails flat-3d-style (a hero effect needs a budget entry)", f3c.status === 2 && /flat-3d-style: bloom/.test(f3c.stdout), f3c.stdout.slice(0, 400));
    // W4: brand lock is palette and tone, never depth or camera: an fstop passes whatever the `Depth blur:` line says; budgeted bloom passes; chrome is a tone warning
    {
      const withCard = (line) => { fs.writeFileSync(path.join(bfd3, "FILM-STYLE.md"), `# FILM-STYLE\n\n- Canvas: flat white\n- ${line}\n`); };
      const fsty = JSON.parse(JSON.stringify(fs3)); fsty.scenes[d3].camera3d = { ...(fsty.scenes[d3].camera3d || {}), fstop: 2.8 };
      put(fsty);
      withCard("Depth blur: not seen in these films");
      const bl1 = C(["check", "--run", run, "--role", "motion-director", "--key", "score"]);
      ok("crew (W4): an fstop in a flat brand's 3D scene passes even when the card's Depth blur line says not seen (depth is craft, not brand)", !/flat-3d-style/.test(bl1.stdout), bl1.stdout.slice(0, 400));
      const bud = JSON.parse(JSON.stringify(fsty)); bud.scenes[d3].materials = "MeshBasicMaterial dots, matte, a soft bloom on the hero dot"; bud.budget = [{ effect: "glow", scene: bud.scenes[d3].n, target: "#hero-dot", reason: "the one dot that answers the question" }]; put(bud);
      const bl2 = C(["check", "--run", run, "--role", "motion-director", "--key", "score"]);
      ok("crew (W4): bloom in a flat brand's 3D scene passes when the score budgets it for that scene (hero, reason)", !/flat-3d-style/.test(bl2.stdout) && !/budget:/.test(bl2.stdout), bl2.stdout.slice(0, 400));
      bud.budget = [1, 2, 3].map(() => ({ effect: "glow", scene: bud.scenes[d3].n, target: "all", reason: "x" })); put(bud);
      const bl3 = C(["check", "--run", run, "--role", "motion-director", "--key", "score"]);
      ok("crew (W4): a budget that targets everything, has no reason or runs past 2-3 per film is refused (budget: ...)", bl3.status === 2 && /budget: glow .*needs a reason/.test(bl3.stdout) && /a budget is for the hero only/.test(bl3.stdout) && /glow is used 3 times; at most 2/.test(bl3.stdout), bl3.stdout.slice(0, 600));
      const chr = JSON.parse(JSON.stringify(fsty)); chr.scenes[d3].materials = "chrome glass"; put(chr);
      const bl4 = C(["check", "--run", run, "--role", "motion-director", "--key", "score"]);
      ok("crew (W4): chrome or glass on a flat brand is a tone warning, not a refusal", !/flat-3d-style/.test(bl4.stdout.split(/warn/i)[0]) && /flat-3d-style: .*chrome/.test(bl4.stdout), bl4.stdout.slice(0, 600));
      put(fs3);
    }
    fs.rmSync(bfd3, { recursive: true, force: true });
    // a 25 s film (every duration doubled, in scenes.json and the score)
    const ssPath = path.join(run, "scenes.json");
    const had = fs.readFileSync(ssPath, "utf8");
    fs.writeFileSync(ssPath, JSON.stringify({ message: "m", scenes: [6, 8, 5, 6].map((d, i) => ({ title: `S${i + 1}`, duration: d, visual: "v" })) }));
    const n24 = JSON.parse(JSON.stringify(good));
    n24.scenes.forEach((x, i) => { x.space = "2d"; delete x.camera3d; delete x.light; delete x.materials; x.duration *= 2; x.start *= 2; x.end *= 2; x.shots.forEach((h) => { h.t0 *= 2; h.t1 *= 2; }); });
    n24.showreel = [{ scene: 1, t: 1, what: "a" }, { scene: 2, t: 1, what: "b" }];
    n24.duration = 25;
    n24.depth = { plan: "all flat" };
    put(n24);
    const m24 = C(["check", "--run", run, "--role", "motion-director", "--key", "score"]);
    ok("crew: a 25 s film with no 3D or hybrid scene fails no-3d-moment", m24.status === 2 && /no-3d-moment/.test(m24.stdout), m24.stdout.slice(0, 500));
    n24.depth = { none_because: 'the line "Twelve months of paper." is a flat ledger: depth would hurt it' };
    put(n24);
    const m24b = C(["check", "--run", run, "--role", "motion-director", "--key", "score"]);
    ok("crew: depth.none_because quoting the script line (20+ chars) clears no-3d-moment", !/no-3d-moment/.test(m24b.stdout), m24b.stdout.slice(0, 500));
    n24.depth = { none_because: "flat is nicer here and so on and so on" };
    put(n24);
    ok("crew: a none_because that quotes no script line does not clear no-3d-moment", /no-3d-moment/.test(C(["check", "--run", run, "--role", "motion-director", "--key", "score"]).stdout));
    // sound and motion variety: warnings (never errors) for the music arc, unsounded seams, repeated or thin mechanics, flat type, no punctuation cut
    {
      const v = JSON.parse(JSON.stringify(n24));
      v.depth = { none_because: 'the line "Twelve months of paper." is a flat ledger: depth would hurt it' };
      const chk = (o) => { put(o); return C(["check", "--run", run, "--role", "motion-director", "--key", "score"]); };
      const w0 = chk(v);
      ok("crew: a 25 s score with no music_arc and no type_scale warns (music-arc-missing, flat-type; mechanics-thin needs 4+ named mechanics) and still passes", w0.status === 0 && ["music-arc-missing", "flat-type"].every((k) => w0.stdout.includes(k)), w0.stdout.slice(0, 600));
      v.music_arc = { intro_until: 5, drop_at: 9, break: [16, 18], payoff_at: 19, button_at: 25 };
      v.type_scale = { small_px: 28, large_px: 220 };
      v.scenes.forEach((x, i) => x.shots.forEach((h, j) => { h.mechanic = `mech-${i}-${j}`; }));
      const w1 = chk(v);
      ok("crew: a music_arc, a 3x type scale and varied mechanics clear music-arc-missing, flat-type and mechanics-thin (mechanic-repeat no longer exists)", w1.status === 0 && !/music-arc-missing|music-arc-order|flat-type|mechanics-thin|mechanic-repeat/.test(w1.stdout), w1.stdout.slice(0, 600));
      v.music_arc = { intro_until: 5, drop_at: 9, break: null, payoff_at: 8, button_at: 25 };
      ok("crew: a music_arc out of order (payoff before the drop) warns music-arc-order; break may be null", /music-arc-order/.test(chk(v).stdout) && !/music-arc-missing/.test(chk(v).stdout));
      v.music_arc = { intro_until: 5, drop_at: 9, payoff_at: 19, button_at: 25 };
      ok("crew: a music_arc without its break key (null for none) is music-arc-missing", /music-arc-missing/.test(chk(v).stdout));
      v.music_arc = { intro_until: 5, drop_at: 9, break: null, payoff_at: 19, button_at: 25 };
      v.type_scale = { small_px: 60, large_px: 120 };
      ok("crew: large type under 3x the small is the warning flat-type", /flat-type: the largest type is 2x/.test(chk(v).stdout));
      v.type_scale = { small_px: 28, large_px: 220 };
      v.scenes.forEach((x) => x.shots.forEach((h) => { h.mechanic = "slide-in"; }));
      const w2 = chk(v);
      ok("crew: one mechanic on every line is the one-trick film: it warns mechanics-thin only (a refrain may repeat; no mechanic-repeat)", !/mechanic-repeat/.test(w2.stdout) && /mechanics-thin: 1 distinct/.test(w2.stdout) && w2.status === 0, w2.stdout.slice(0, 400));
      v.scenes.forEach((x, i) => x.shots.forEach((h, j) => { h.mechanic = `mech-${i}-${j}`; }));
      v.scenes.forEach((x) => { x.events = [{ t: 1, what: "a thing moves" }]; });
      const w3 = chk(v);
      ok("crew: seams with motion and no sound event warn seam-unsounded", /seam-unsounded: 2 of 2/.test(w3.stdout), w3.stdout.slice(0, 400));
      v.seams.forEach((sm) => { if (sm.kind !== "cut") sm.sound = "whoosh"; });
      ok("crew: a sound on the seam (seam.sound) clears seam-unsounded", !/seam-unsounded/.test(chk(v).stdout));
      ok("crew: no hard cut on the turn seam into the reveal warns no-punctuation (signature into s3 = brandReveal)", /no-punctuation: the emotional turn \(2>3\)/.test(chk(v).stdout));
      v.seams[1].kind = "smash-cut"; delete v.seams[1].element;
      const w4 = chk(v);
      ok("crew: a smash-cut on the turn seam clears no-punctuation", !/no-punctuation/.test(w4.stdout) && w4.status === 0, w4.stdout.slice(0, 400));
    }
    fs.writeFileSync(ssPath, had);
    put(good);
  }
  // the score into a storyboard written by scenes.mjs (parsed by the workflow's parser when installed), twice: same file
  const proj = path.join(ws, "videos", "tally");
  const sj = path.join(ws, "scenes-in.json");
  fs.writeFileSync(sj, JSON.stringify({ title: "T", message: "m", aspect: "16:9", narration: false, scenes: [3, 4, 2.5, 3].map((d, i) => ({ title: `S${i + 1}`, on_screen: `Line ${i + 1}`, visual: "v", duration: d })) }));
  const sc = node("scenes.mjs", ["--scenes", sj, "--route", "product-launch-video", "--out", proj]);
  fs.writeFileSync(path.join(proj, "BRIEF.md"), "---\nworkflow: product-launch-video\n---\n\n## Customizations\n\n- x\n");
  fs.writeFileSync(path.join(proj, "DISPATCH.md"), "# RasanAI dispatch addendum (entire video)\n\n## Motion contract\n\n" + "- a duplicated craft rule\n".repeat(200));
  fs.writeFileSync(path.join(proj, "DIRECTION.md"), "# Direction\n\nhold 2-3 s; cut hard\n");
  const s1 = C(["storyboard", "--run", run, "--project", proj]);
  const t1 = fs.existsSync(path.join(proj, "STORYBOARD.md")) ? fs.readFileSync(path.join(proj, "STORYBOARD.md"), "utf8") : "";
  C(["storyboard", "--run", run, "--project", proj]);
  const t2 = fs.existsSync(path.join(proj, "STORYBOARD.md")) ? fs.readFileSync(path.join(proj, "STORYBOARD.md"), "utf8") : "";
  ok("crew: storyboard writes the score as the visual design (video direction, shots, handoffs, transition_in), idempotent", sc.status === 0 && s1.status === 0 && t1 === t2 && /## Video direction/.test(t1) && /handoff_in: receipt · x 960/.test(t1) && /Scene 2 \(1\.5–3\.0s\)/.test(t1) && (t1.match(/^- transition_in: cut$/gm) || []).length === 4 && /Visual design \(done\)/.test(fs.readFileSync(path.join(proj, "BRIEF.md"), "utf8")), (s1.stderr || s1.stdout).slice(0, 300));
  {
    const bm = fs.existsSync(path.join(proj, "BUILD.md")) ? fs.readFileSync(path.join(proj, "BUILD.md"), "utf8") : "";
    const dp = fs.readFileSync(path.join(proj, "DISPATCH.md"), "utf8"), dr = fs.readFileSync(path.join(proj, "DIRECTION.md"), "utf8");
    ok("plan: storyboard writes BUILD.md from the plan (one author, beat times, carriers, the one brand reveal, momentum, the gate) and MOTION-SCORE.md is the generated plan", /ONE author/.test(bm) && /s2 3-7 s/.test(bm) && /carriers/.test(bm) && /beat `s3`/.test(bm) && /0\.8 s/.test(bm) && /motion-gate\.mjs/.test(bm) && /generated from motion\/score\.json/.test(fs.readFileSync(path.join(proj, "MOTION-SCORE.md"), "utf8")), bm.slice(0, 300));
    ok("plan: on a direct film DISPATCH.md is a short pointer to the plan (no duplicated craft rules) and DIRECTION.md says the plan wins", /The plan wins/.test(dp) && !/duplicated craft rule/.test(dp) && Buffer.byteLength(dp) < 3000 && /The plan wins/.test(dr) && /^- picture: the receipt does thing 2$/m.test(t1) && /^- exit: carrier \(carrier: the receipt\)$/m.test(t1), dp.slice(0, 300));
    // the builder's required reading: the plan, BUILD.md, the packets' role, DISPATCH and frame.md stay small
    const bb = J2(C(["brief", "--run", run, "--role", "film-builder", "--key", "film", "--project", proj]));
    ok("plan: the film builder's brief is self-contained and small (about 20 KB, no 40 KB craft references)", bb.ok && bb.bytes < 28000 && !/: `[^`]*references\/(craft|vocabulary|launch-film)\.md`/.test(fs.readFileSync(path.join(ws, bb.prompt), "utf8")), JSON.stringify(bb).slice(0, 300));
  }
  ok("crew: storyboard carries each scene's space, and a 3D scene's lens, camera legs, light and materials", /^- space: hybrid \(build with Rasan3D/m.test(t1) && /^- camera3d: 50 mm f\/2\.8; 0\.0–0\.3s locked; 0\.3–1\.6s arc 28° right \(power3\.inOut\)/m.test(t1) && /^- light: three-point/m.test(t1) && (t1.match(/^- space: 2d$/gm) || []).length === 3 && /depth \(2D \/ 3D\): 2D film/.test(t1), t1.slice(0, 400));
  // local search finds the project by its git remote and package name; the inventory lists files, never secrets
  const home2 = path.join(TMP, "fakehome");
  const p1 = path.join(home2, "code", "tally-web");
  fs.mkdirSync(path.join(p1, ".git"), { recursive: true });
  fs.mkdirSync(path.join(p1, "src", "locales"), { recursive: true });
  fs.mkdirSync(path.join(p1, "public"), { recursive: true });
  fs.writeFileSync(path.join(p1, ".git", "config"), '[remote "origin"]\n\turl = git@github.com:acme/tally.git\n');
  fs.writeFileSync(path.join(p1, "package.json"), JSON.stringify({ name: "web", scripts: { dev: "vite" }, devDependencies: { vite: "5" } }));
  fs.writeFileSync(path.join(p1, "README.md"), "# Tally\n");
  fs.writeFileSync(path.join(p1, "src", "locales", "en.json"), '{"cta":"Snap a receipt"}');
  fs.writeFileSync(path.join(p1, "public", "logo.svg"), "<svg/>");
  fs.writeFileSync(path.join(p1, ".env"), "KEY=secret");
  fs.writeFileSync(path.join(p1, "tailwind.config.js"), "module.exports={}");
  const Rs = (a) => spawnSync(process.execPath, [path.join(HERE, "research.mjs"), ...a], { encoding: "utf8", env, cwd: ws });
  const lf = J2(Rs(["local-find", "--name", "Tally", "--roots", path.join(home2, "code")]));
  ok("research: local-find matches a project by its git remote and README title", (lf.candidates || []).some((c) => c.dir.endsWith("tally-web") && c.why.includes("git remote") && c.why.includes("README title")), JSON.stringify(lf).slice(0, 300));
  const invF = path.join(run, "research", "local", "inv.json");
  Rs(["local-inventory", "--dir", p1, "--out", invF]);
  const inv = fs.existsSync(invF) ? JSON.parse(fs.readFileSync(invF, "utf8")) : {};
  ok("research: local-inventory lists strings, tokens, logos and dev scripts, and skips secrets", inv.strings && inv.strings.length === 1 && inv.tokens.length === 1 && inv.logos.length === 1 && inv.secrets_skipped === 1 && inv.dev_scripts && inv.dev_scripts.dev === "vite" && !JSON.stringify(inv).includes(".env"), JSON.stringify(inv).slice(0, 300));
  if (!quick) {
    const comp = path.join(proj, "compositions", "frames", "01-s1.html");
    fs.mkdirSync(path.dirname(comp), { recursive: true });
    fs.writeFileSync(comp, `<template><div id="root" data-composition-id="01-s1" data-start="0" data-duration="2" data-width="640" data-height="360" style="position:relative;width:640px;height:360px;background:#fff"><div id="box" style="position:absolute;left:40px;top:140px;width:80px;height:80px;background:#e33"></div></div><script>window.__timelines=window.__timelines||{};var tl=gsap.timeline({paused:true});tl.fromTo("#box",{x:0},{x:440,duration:2,ease:"none"});window.__timelines["01-s1"]=tl;</script></template>`);
    const st = J2(C(["strip", "--file", comp, "--at", "0,1,2", "--out", path.join(run, "crew", "strip.png")]));
    ok("crew: strip renders a composition at chosen times into a labelled sheet", st.ok && st.frames === 3 && fs.existsSync(path.join(run, "crew", "strip.png")), JSON.stringify(st).slice(0, 200));
  }
}

// 15. 3D
if (!quick) {
  const proj = path.join(TMP, "three-proj");
  fs.mkdirSync(path.join(proj, "compositions", "frames"), { recursive: true });
  fs.writeFileSync(path.join(proj, "hyperframes.json"), "{}");
  const S3 = (a) => spawnSync(process.execPath, [path.join(HERE, "stage3d.mjs"), ...a], { encoding: "utf8", env, cwd: TMP, timeout: 300000 });
  const J3 = (r) => { try { return JSON.parse(r.stdout); } catch { return {}; } };
  const sc = J3(S3(["scaffold", "--project", proj, "--frame", "02-depth", "--duration", "3"]));
  const file = path.join(proj, "compositions", "frames", "02-depth.html");
  ok("3d: scaffold writes a HyperFrames frame (one template, r3- ids, the runtime path) and installs the runtime", sc.ok && /^<template>/.test(fs.readFileSync(file, "utf8")) && /id="r3-02-depth-gl"/.test(fs.readFileSync(file, "utf8")) && fs.existsSync(path.join(proj, "assets", "three", "rasan3d.js")) && fs.existsSync(path.join(proj, "assets", "three", "three.core.min.js")) && fs.existsSync(path.join(proj, "assets", "three", "addons", "loaders", "GLTFLoader.js")), JSON.stringify(sc).slice(0, 200));
  const clean = J3(S3(["check", "--project", proj, "--json"]));
  ok("3d: the scaffolded scene builds, renders the same pixels for the same time, and passes the gate", clean.status === "clean" && clean.files && clean.files[0].stages[0] && clean.files[0].stages[0].deterministic === true, JSON.stringify(clean).slice(0, 500));
  // planted: Math.random in pose (not seek-safe), a constant-speed spin, an ease outside motion.md
  const bad = fs.readFileSync(file, "utf8").replace("pose(t, k) {", "pose(t, k) {\n        k.objects.marker.position.x = 1.9 + Math.random() * 0.4;\n        k.objects.marker.rotation.y = k.at(t, [[0, 0], [3, 6, \"none\"]]);").replace(/02-depth/g, "03-bad");
  fs.writeFileSync(path.join(proj, "compositions", "frames", "03-bad.html"), bad);
  fs.writeFileSync(path.join(proj, "motion.md"), '---\neasing: {"enter":"expo.out","exit":"power2.in","move":"expo.inOut"}\n---\n');
  const r = S3(["check", "--project", proj, "--file", path.join(proj, "compositions", "frames", "03-bad.html"), "--json"]);
  const bj = J3(r);
  const rules = (bj.findings || []).map((f) => f.rule);
  ok("3d: the gate catches nondeterminism, a linear drift and an ease outside motion.md (exit 2)", r.status === 2 && rules.includes("not-seek-safe") && rules.includes("nondeterministic-random") && rules.includes("linear-drift") && rules.includes("ease-outside-set"), JSON.stringify(rules));
  fs.rmSync(path.join(proj, "motion.md"));
  const st = spawnSync(process.execPath, [path.join(HERE, "crew.mjs"), "strip", "--file", file, "--at", "0,1.5,2.9", "--out", path.join(TMP, "three-strip.png")], { encoding: "utf8", env, cwd: TMP, timeout: 300000 });
  const sj = J3(st);
  ok("3d: a strip of a 3D scene waits for the build and renders every frame", sj.ok && sj.frames === 3 && fs.existsSync(path.join(TMP, "three-strip.png")), (st.stderr || st.stdout).slice(0, 300));
  const kf = path.join(TMP, "frames3d");
  fs.mkdirSync(kf, { recursive: true });
  S3(["install", "--dest", kf]);
  S3(["scaffold", "--standalone", "--frame", "4", "--duration", "4", "--out", path.join(kf, "4.html")]);
  const ds = node("design.mjs", ["stills", "--dir", kf]);
  const png = path.join(kf, "4.png");
  ok("3d: a key frame drawn in 3D renders with design.mjs stills", ds.status === 0 && fs.existsSync(png) && fs.statSync(png).size > 20000, (ds.stderr || ds.stdout).slice(0, 300));
}

// 16. 3D specimens in the style library: presets.js + presets3d.js mount real Rasan3D scenes
if (!quick) {
  const { serve } = await import("./lib/stage3d.mjs");
  const { launch } = await import("./lib/cdp.mjs");
  const SK = path.join(HERE, "..");
  const srv = await serve(SK);
  const b = await launch({ width: 1000, height: 600, timeoutMs: 180000 });
  try {
    const lib = JSON.parse(fs.readFileSync(path.join(SK, "taxonomy", "presets", "dimensional.json"), "utf8")).presets;
    const pick = ["glass-3d", "point-cloud-3d"].map((id) => lib.find((p) => p.id === id));
    const sheet = path.join(SK, `.selftest-3d-${process.pid}.html`);
    fs.writeFileSync(sheet, `<!doctype html><html><head><meta charset="utf-8"><script src="/console/presets.js"></script><script src="/console/presets3d.js"></script></head><body style="margin:0"><div id="o"></div><script>
window.__errs=[];addEventListener("error",function(e){window.__errs.push(String(e.message))});addEventListener("unhandledrejection",function(e){window.__errs.push("rejection: "+(e.reason&&e.reason.message||e.reason))});
var d=${JSON.stringify(pick)};RasaPresets3D.base="/stage3d/";document.head.insertAdjacentHTML("beforeend","<style>"+RasaPresets.css+"</style>");RasaPresets.loadFonts(d);
d.forEach(function(p){var w=document.createElement("div");w.style.cssText="width:400px;height:225px;overflow:hidden";w.innerHTML='<div style="width:1600px;height:900px;transform:scale(.25);transform-origin:0 0">'+RasaPresets.render(p,{headline:"Tax season. Again."})+'</div>';document.getElementById("o").appendChild(w);RasaPresets3D.mount(w.querySelector(".rp-stage"),p,{headline:"Tax season. Again."})});
window.__ready=Promise.all([RasaPresets3D.whenAll(),document.fonts.ready]).then(function(){return true});
</script></body></html>`);
    await b.open(`${srv.url}/${path.basename(sheet)}`);
    await b.eval("window.__ready", { await: true });
    const r = await b.eval(`(function(){return [].map.call(document.querySelectorAll(".rp-stage"),function(st){var c=st.querySelector("canvas");if(!c)return{canvas:false};
      var t=document.createElement("canvas");t.width=64;t.height=36;var x=t.getContext("2d");x.drawImage(c,0,0,64,36);var px=x.getImageData(0,0,64,36).data,n=px.length/4,m=[0,0,0],i,k;
      for(i=0;i<px.length;i+=4)for(k=0;k<3;k++)m[k]+=px[i+k]/n;var v=0;for(i=0;i<px.length;i+=4)for(k=0;k<3;k++)v+=Math.pow(px[i+k]-m[k],2)/(n*3);return{canvas:true,variance:Math.round(v)}});})()`);
    const errs = await b.eval("window.__errs");
    const exc = (b.logs || []).filter((l) => l.startsWith("exception"));
    ok("3d specimens: glass-3d and point-cloud-3d mount real canvases that are not blank, no page exceptions", r.length === 2 && r.every((x) => x.canvas && x.variance > 40) && !errs.length && !exc.length, JSON.stringify(r) + " " + errs.join("; ") + exc.join("; ") + (b.logs || []).slice(0, 3).join("; "));
    fs.rmSync(sheet, { force: true });
  } finally {
    await b.close();
    await srv.close();
    for (const f of fs.readdirSync(SK)) if (f.startsWith(".selftest-3d-")) fs.rmSync(path.join(SK, f), { force: true });
  }
}

// 17. lyric videos: the treatment gate and the crew's song route, word timings and the music runtime, the film finish
{
  const ws = path.join(TMP, "lyr-ws");
  const run = path.join(ws, ".rasanai", "r1");
  const lyd = path.join(ws, "fx");
  for (const d of [path.join(run, "music"), path.join(run, "story"), lyd]) fs.mkdirSync(d, { recursive: true });
  const J = (r) => { try { return JSON.parse(r.stdout); } catch { return {}; } };
  const C = (a) => spawnSync(process.execPath, [path.join(HERE, "crew.mjs"), ...a], { encoding: "utf8", env, cwd: ws, timeout: 180000 });
  const T = (a) => spawnSync(process.execPath, [path.join(HERE, "treatment.mjs"), ...a], { encoding: "utf8", env, cwd: ws, timeout: 60000 });
  const words = (text, s, e) => text.split(" ").map((w, i, a) => ({ w, start: +(s + ((e - s) * i) / a.length).toFixed(2), end: +(s + ((e - s) * (i + 1)) / a.length).toFixed(2), conf: 0.9 }));
  const SONG = [["Wake up in the static", 1, 3.5], ["Count the cost of every sheep", 11, 14], ["Paper walls are thinning out", 16, 20], ["Burn it all down", 26, 30], ["Ash is just a rough draft", 42, 46], ["Burn it all down", 54, 58], ["Quiet after the smoke", 60.2, 63]];
  const lyr = { source: "fixture", lines: SONG.map(([t, s, e], i) => ({ i, text: t, start: s, end: e, words: words(t, s, e) })) };
  const beats = Array.from({ length: 129 }, (_, i) => i * 0.5);
  const aud = { duration: 64, bpm: 120, beat_period: 0.5, beats, downbeats: beats.filter((_, i) => i % 4 === 0), sections: [["intro", 0, 8], ["verse", 8, 24], ["chorus", 24, 40], ["verse", 40, 52], ["chorus", 52, 60], ["outro", 60, 64]].map(([name, start, end]) => ({ name, start, end })), fps: 100, onsets: { kick: beats.map((t) => [t, 0.8]) } };
  const F = (n, o) => { const f = path.join(lyd, n); fs.writeFileSync(f, JSON.stringify(o)); return f; };
  const lf = F("lyrics.json", lyr), af = F("audio.json", aud);
  fs.writeFileSync(path.join(run, "music", "lyrics.json"), JSON.stringify(lyr));
  fs.writeFileSync(path.join(run, "music", "audio.json"), JSON.stringify(aud));

  // the plan: three treatment writers, no script writers or editor
  const plan = J(C(["plan", "--run", run, "--route", "music-to-video", "--subject", "Song", "--length", "64"]));
  const mem = (plan.phases || []).flatMap((p) => p.members).map((m) => m.replace(/ \(.*$/, ""));
  ok("crew: music-to-video plans three treatment writers and no script writer or editor", ["treatment-writer:Sure", "treatment-writer:Bold", "treatment-writer:Wild"].every((m) => mem.includes(m)) && !mem.some((m) => /script-/.test(m)), JSON.stringify(mem));
  const br = J(C(["brief", "--run", run, "--role", "treatment-writer", "--key", "Bold"]));
  const prompt = br.prompt ? fs.readFileSync(path.join(ws, br.prompt), "utf8") : "";
  ok("crew: a treatment writer's brief lists the lyrics, the audio, the playbook, the skeleton command and its two outputs", /music\/lyrics\.json/.test(prompt) && /music\/audio\.json/.test(prompt) && /lyric-video\.md/.test(prompt) && /treatment\.mjs" skeleton/.test(prompt) && /treatment-Bold\.json/.test(prompt) && /TREATMENT-Bold\.md/.test(prompt), prompt.slice(0, 200));

  // the treatment gate: a skeleton, filled, passes; each planted fault is refused
  const skf = path.join(lyd, "skeleton.json");
  const sk = J(T(["skeleton", "--lyrics", lf, "--audio", af, "--label", "Bold", "--out", skf]));
  const skel = JSON.parse(fs.readFileSync(skf, "utf8"));
  const unfilled = T(["check", "--treatment", skf, "--lyrics", lf, "--audio", af]);
  ok("treatment: skeleton lays out a plate per section (hooks apart, starts on downbeats) and an unfilled one is refused", sk.plates === 6 && sk.hooks === 2 && skel.plates.every((p) => aud.downbeats.includes(p.start)) && unfilled.status === 2, JSON.stringify(sk) + unfilled.status);
  const PL = [
    ["Static", "weather-station printout", "2d", 2, "light", "A paper strip chart of static scrolls under a pen; the orange pen trace wakes into the first sung word and holds it like a tuning mark.", "The words are the pen trace itself, drawn as it sings.", "Wake up: the pen jumps from flat line to a letterform"],
    ["The ledger", "tax form", "2d", 3, "dark", "A tax form fills in by itself: each sheep is a line item, the sum column grows, a rubber stamp lands on every count and the spark rides the totals line.", "Words are typed into the form's boxes as they are sung.", "Count the cost: the sheep become a column of line items | Paper walls: the form's margins thin into tracing paper"],
    ["Fuse", "fuse wire diagram", "3d", 5, "dark", "A wiring diagram lifts into depth: a fuse wire runs through the frame as the camera follows the spark along it, sparks shedding to the beat on every kick.", "Each word is a wire label that lights when sung.", "Burn it all down: the fuse is lit and the first wire burns through"],
    ["Seed packet", "seed packet label", "2d", 3, "light", "A seed packet with a drawn label sits on bone paper; ash sifts into it and the spark becomes the sun printed on the front, the packet crinkling as it opens.", "The line is printed on the packet and the planting date.", "Ash is a rough draft: the ash turns into the seed inside the packet"],
    ["Fuse again", "fuse wire diagram", "hybrid", 5, "dark", "The wiring diagram again, but the camera now sits inside the wire, the fuse shortens past the lens and the whole frame detonates into white paper on the last beat.", "Wire labels light word by word, larger and faster than the first time.", "Burn it all down: the fuse is already short, the wire runs into the camera and detonates"],
    ["Placard", "museum placard", "2d", 1, "light", "A small museum placard on a wall beside a charred wire, tiny type, a gallery's soft shadow, the last word printed after the last note and the spark gone out.", "The line is the placard's text, set in engraved caps.", "Quiet after the smoke: the placard reads the film as an artefact"],
  ];
  const fill = (sk0) => {
    const t = JSON.parse(JSON.stringify(sk0));
    t.song = { title: "Fixture", artist: "Nobody" };
    t.concept = { title: "The Burn Chart", text: "A deadpan field manual of one orange spark: it writes the first lyric, rides a form's totals, burns as a fuse and ends as a museum placard, every line a pun on the document it is printed in.", pun_engine: "Each lyric line is read as an instruction printed on a different technical document, then carried out literally." };
    t.style_bible = { palette: { ground: "#0A0A0B", paper: "#EEE9DF", neutrals: ["#5E5B57"], accent: { name: "ember", hex: "#FF4D12", used_for: "the spark and the sung word, nothing else" }, rare: null }, type: [{ role: "voice", family: "Space Grotesk", use: "the lyrics" }, { role: "machine", family: "JetBrains Mono", use: "labels" }], signal: "spark", tone: "Deadpan: a safety manual that is on fire and never says so.", banned: ["neon glow", "particle storms", "centred subtitles"] };
    t.motifs = [{ id: "spark", name: "the spark", description: "A single orange point that writes, rides and burns through every document" }, { id: "paper", name: "the paper", description: "The bone sheet each document is printed on, which tears and chars" }];
    t.recurring_idioms = [{ idiom: "fuse wire diagram", why: "the hook; each return runs closer and shorter" }];
    t.show_off = "The fuse leaves the diagram, runs through the camera and detonates the page on the last beat; the placard at the end hangs on the same wall.";
    t.plates.forEach((p, i) => {
      const [title, idiom, space, energy, ground, visual, integ, ideas] = PL[i];
      Object.assign(p, { title, idiom, space, energy, ground, visual, lyric_integration: integ, motifs: i === 1 || i === 3 ? ["spark", "paper"] : ["spark"] });
      const id = ideas.split(" | ");
      p.lines.forEach((l, k) => { l.idea = id[k] || id[0]; });
      if (i === 2) p.lines[0].change = "baseline: the fuse is lit";
      if (i === 4) { p.change = "the fuse is shorter and the camera is inside the wire"; p.lines[0].change = "the fuse is shorter, the camera inside the wire, detonates"; }
    });
    return t;
  };
  const filled = fill(skel);
  const tf = F("treatment-Bold.json", filled);
  const good = T(["check", "--treatment", tf, "--lyrics", lf, "--audio", af]);
  ok("treatment: a filled skeleton passes check (exit 0)", good.status === 0, good.stdout.slice(0, 600));
  const mutants = [
    ["a dropped lyric line", (t) => { t.plates[1].lines.pop(); }, /not in any plate/],
    ["a third plate in the same idiom", (t) => { t.plates[0].idiom = t.plates[1].idiom = t.plates[3].idiom = "tax form"; }, /used in 3 plates/],
    ["a hook return with no change", (t) => { delete t.plates[4].lines[0].change; }, /occurrence 2 of 2/],
    ["a second hue", (t) => { t.style_bible.palette.neutrals.push("#2255FF"); }, /second hue/],
    ["an off-grid cut", (t) => { t.plates[2].start = 26.3; t.plates[1].end = 26.3; }, /off the beat grid/],
    ["no 3D in a song over 60 s", (t) => { t.plates.forEach((p) => (p.space = "2d")); }, /3d or hybrid plate/],
  ];
  const miss = [];
  for (const [name, mut, re] of mutants) {
    const t = JSON.parse(JSON.stringify(filled));
    mut(t);
    const r = T(["check", "--treatment", F("mut.json", t), "--lyrics", lf, "--audio", af]);
    if (!(r.status === 2 && re.test(r.stdout))) miss.push(`${name}: exit ${r.status} ${r.stdout.slice(0, 160)}`);
  }
  ok(`treatment: ${mutants.length} planted faults are each refused with exit 2 (dropped line, third idiom, hook with no change, second hue, off-grid cut, no 3D over 60 s)`, !miss.length, miss.join(" | "));
  const scf = path.join(lyd, "scenes.json");
  const sc = T(["scenes", "--treatment", tf, "--lyrics", lf, "--out", scf]);
  const scj = fs.existsSync(scf) ? JSON.parse(fs.readFileSync(scf, "utf8")) : { scenes: [] };
  const s2 = scj.scenes[2] || {};
  ok("treatment: scenes carries each plate's id, idiom, space, energy, window, lines and motifs, with the plate's duration", sc.status === 0 && scj.scenes.length === 6 && s2.plate === "plate-3" && s2.idiom === "fuse wire diagram" && s2.space === "3d" && s2.energy === 5 && s2.start === 26 && s2.end === 42 && s2.duration === 16 && JSON.stringify(s2.lines) === "[3]" && s2.motifs.includes("spark"), sc.stdout.slice(0, 200) + JSON.stringify(s2).slice(0, 300));

  // crew check for treatment writers
  const ck = () => C(["check", "--run", run, "--role", "treatment-writer", "--key", "Bold"]);
  fs.writeFileSync(path.join(run, "story", "treatment-Bold.json"), JSON.stringify(filled));
  const noMd = ck();
  ok("crew: check treatment-writer refuses a missing TREATMENT .md (exit 2)", noMd.status === 2 && /TREATMENT-Bold\.md/.test(noMd.stdout), noMd.stdout.slice(0, 300));
  const md = "# The Burn Chart\n\n" + "A deadpan field manual of one orange spark across six documents. ".repeat(8);
  fs.writeFileSync(path.join(run, "story", "TREATMENT-Bold.md"), md);
  fs.writeFileSync(path.join(run, "story", "treatment-Bold.json"), JSON.stringify(skel));
  const badT = ck();
  ok("crew: check treatment-writer refuses a treatment that fails treatment.mjs check (exit 2)", badT.status === 2 && /rewrite/.test(badT.stdout), badT.stdout.slice(0, 300));
  fs.writeFileSync(path.join(run, "story", "treatment-Bold.json"), JSON.stringify(filled));
  const goodT = ck();
  ok("crew: check treatment-writer accepts a valid treatment with its words (exit 0)", goodT.status === 0, goodT.stdout.slice(0, 300));

  // a lyric run: the scene animator's brief carries the plate's words and lyric_video; the score may not contradict the plates
  fs.writeFileSync(path.join(run, "story", "chosen-treatment.json"), JSON.stringify(filled));
  fs.copyFileSync(scf, path.join(run, "scenes.json"));
  const pj = path.join(ws, "videos", "song");
  fs.mkdirSync(path.join(pj, "compositions", "frames"), { recursive: true });
  const ab = J(C(["brief", "--run", run, "--role", "scene-animator", "--key", "3", "--project", pj]));
  const ap = ab.prompt ? fs.readFileSync(path.join(ws, ab.prompt), "utf8") : "";
  ok("crew: a lyric run's scene-animator brief carries the plate's words, lyric_video and the karaoke rules", /\*\*lyric_video\*\*: true/.test(ap) && /Your plate's words/.test(ap) && /"Burn"|"Burn it all down"|\["Burn"/.test(ap) && /gsapWords/.test(ap), JSON.stringify([/\*\*lyric_video\*\*: true/.test(ap), /Your plate's words/.test(ap), /"Burn"/.test(ap), /gsapWords/.test(ap), ab.ok, ab.error]));
  const H = { x: 960, y: 540, scale: 1, opacity: 1, direction: "left", speed: 400 };
  const spaceOf = (t, i) => (i === 2 ? "3d" : "2d");
  const score = (mut) => {
    const s = {
      spine: "the orange spark", motif: { what: "the spark", scenes: [1, 2, 3, 4, 5, 6] }, showreel: [{ scene: 3, t: 1, what: "the fuse runs through the lens" }, { scene: 5, t: 1, what: "the detonation" }], rhythm: "slow-fast", signature: { seam: "2>3", technique: "push-through", why: "w" },
      video_direction: { palette: "p", motion_grammar: "g", holds: "h", negative: ["no drift"] }, depth: { plan: "the fuse goes deep in 3 and 5" },
      scenes: PL.map((p, i) => ({ n: i + 1, title: p[0], duration: skel.plates[i].end - skel.plates[i].start, energy: p[3], layout: ["full-bleed", "split", "centered", "asymmetric 60/40", "full-bleed", "split"][i], camera: "T1", space: p[2],
        ...(p[2] !== "2d" ? { camera3d: { lens_mm: 50, fstop: 2.8, moves: [{ t0: 0, t1: 1, move: "locked" }, { t0: 1, t1: 6, move: "arc", ease: "power3.inOut" }] }, light: "key upper-left", materials: "wire" } : {}),
        shots: [{ t0: 0, t1: 4, on_screen: "a", moves: "rises", primary: "a" }], entrances: [{ element: "a", type: "cut-in" }], events: [] })),
      seams: [1, 2, 3, 4, 5].map((n) => ({ from: n, to: n + 1, kind: "cut", why: "w" })),
    };
    mut(s);
    return s;
  };
  fs.mkdirSync(path.join(run, "motion"), { recursive: true });
  fs.writeFileSync(path.join(run, "motion", "score.md"), "# score\n");
  const putScore = (s) => fs.writeFileSync(path.join(run, "motion", "score.json"), JSON.stringify(s));
  const warnsOf = () => J(C(["check", "--run", run, "--role", "motion-director", "--key", "score"])).warnings || [];
  putScore(score(() => {}));
  const w0 = warnsOf().filter((w) => /plate/.test(w));
  putScore(score((s) => { s.scenes[2].space = "2d"; delete s.scenes[2].camera3d; s.scenes[3].energy = 1; }));
  const w1 = warnsOf();
  ok("crew: checkScore stays quiet when the score follows the plates and warns when it changes a plate's space or energy", !w0.length && w1.some((w) => /scene 3 \(plate plate-3\).*space "3d".*"2d"/.test(w)) && w1.some((w) => /scene 4 \(plate plate-4\).*energy is 3.*says 1/.test(w)), JSON.stringify([w0, w1]).slice(0, 500));

  // word timings: check reports the right median; audio finds the tempo and the downbeats of a click track; align runs when it can
  const Lx = (starts) => ({ lines: [{ i: 0, text: "one two three four five", words: starts.slice(0, 5).map((t, k) => ({ w: ["one", "two", "three", "four", "five"][k], start: t, end: t + 0.3 })) }, { i: 1, text: "six seven eight nine", words: starts.slice(5).map((t, k) => ({ w: ["six", "seven", "eight", "nine"][k], start: t, end: t + 0.3 })) }] });
  const truthS = [1, 1.5, 2, 2.5, 3, 4, 4.5, 5, 5.5];
  const errMs = [20, 40, 50, 60, 60, 60, 70, 90, 250];
  const lc = J(node("lyrics.mjs", ["check", "--lyrics", F("got.json", Lx(truthS.map((t, k) => +(t + errMs[k] / 1000).toFixed(3)))), "--truth", F("truth.json", Lx(truthS))], { cwd: ws }));
  ok("lyrics: check matches the words in order and reports the right median start error (60 ms of 9 words, worst 250 ms)", lc.matched === 9 && lc.start_error_ms?.median === 60 && lc.worst?.[0]?.err_ms === 250 && lc.within_80ms === 0.78, JSON.stringify(lc).slice(0, 300));
  const click = path.join(lyd, "click.wav");
  spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", "aevalsrc='gte(t\\,0.3)*(0.6*sin(2*PI*55*t)*exp(-25*mod(t-0.3\\,0.5))*if(lt(mod(t-0.3\\,2)\\,0.5)\\,1\\,0.55)+0.15*sin(2*PI*3000*t)*exp(-200*mod(t-0.3\\,0.25)))':s=44100:d=24", click]);
  const au = node("lyrics.mjs", ["audio", "--track", click, "--no-stems", "--out", path.join(lyd, "click.json")], { cwd: ws });
  const cj = fs.existsSync(path.join(lyd, "click.json")) ? JSON.parse(fs.readFileSync(path.join(lyd, "click.json"), "utf8")) : {};
  const dgap = (cj.downbeats || []).slice(1).map((t, i) => t - cj.downbeats[i]);
  ok("lyrics: audio finds 120 BPM, beats on the kicks and a downbeat every 2 s on the accent", au.status === 0 && Math.abs(cj.bpm - 120) < 1 && cj.beats?.length >= 46 && Math.abs(cj.beats[0] - 0.3) < 0.04 && Math.abs(cj.downbeats?.[0] - 0.3) < 0.05 && dgap.length > 8 && dgap.every((g) => Math.abs(g - 2) < 0.06) && cj.onsets?.kick?.length >= 40 && cj.rms?.length > 2000, au.stderr.slice(0, 200) + JSON.stringify({ bpm: cj.bpm, d: cj.downbeats?.slice(0, 3) }));
  const wh = J(node("lyrics.mjs", ["models"], { cwd: ws }));
  const canAlign = !!wh.whisper && (wh.models || []).length > 0 && spawnSync("say", ["-v", "?"], { encoding: "utf8" }).status === 0;
  if (canAlign) {
    const sp = path.join(lyd, "say.aiff");
    spawnSync("say", ["-o", sp, "Wake up in the static. Count the cost of every sheep."]);
    spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-i", sp, "-ar", "44100", path.join(lyd, "say.wav")]);
    fs.writeFileSync(path.join(lyd, "say.txt"), "Wake up in the static\nCount the cost of every sheep\n");
    const al = node("lyrics.mjs", ["align", "--track", path.join(lyd, "say.wav"), "--lyrics", path.join(lyd, "say.txt"), "--no-stems", "--out", path.join(lyd, "say.json")], { cwd: ws });
    const sj2 = fs.existsSync(path.join(lyd, "say.json")) ? JSON.parse(fs.readFileSync(path.join(lyd, "say.json"), "utf8")) : { lines: [] };
    const ws2 = sj2.lines.flatMap((l) => l.words);
    ok("lyrics: align times the words of a spoken track to the user's text (2 lines, 11 words, in order, inside the clip)", al.status === 0 && sj2.lines.length === 2 && ws2.length === 11 && ws2.every((w, k) => w.end > w.start && (k === 0 || w.start >= ws2[k - 1].start)) && ws2[0].start < 1 && ws2[10].end < 6, al.stderr.slice(0, 300));
  } else ok("lyrics: align not run here (needs whisper-cli with a model and a speech sample from macOS say); models lists what is installed", wh.whisper !== undefined && Array.isArray(wh.models));

  // the music runtime in a page: install ships it, get() is by text (straight or curly quotes), gsapWords starts each word on its sung start
  {
    const { install } = await import("./lib/stage3d.mjs");
    const { serve } = await import("./lib/stage3d.mjs");
    const { launch } = await import("./lib/cdp.mjs");
    const proj = path.join(TMP, "lyr-page");
    fs.mkdirSync(proj, { recursive: true });
    install(proj);
    ok("stage3d install ships rasan-music.js beside rasan3d.js", fs.existsSync(path.join(proj, "assets", "three", "rasan-music.js")) && fs.existsSync(path.join(proj, "assets", "three", "rasan3d.js")));
    const LY = { lines: [{ i: 0, text: "I’m upping my “P(doom)”", start: 10, end: 12.2, words: [{ w: "I’m", start: 10, end: 10.4 }, { w: "upping", start: 10.5, end: 10.9 }, { w: "my", start: 11, end: 11.2 }, { w: "“P(doom)”", start: 11.5, end: 12.2 }] }, { i: 1, text: "Burn it all down", start: 20, end: 22, words: words("Burn it all down", 20, 22) }] };
    fs.writeFileSync(path.join(proj, "index.html"), `<!doctype html><html><head><meta charset="utf-8"></head><body><div id="l">${LY.lines[0].words.map((w, k) => `<span class="w" id="w${k}">${w.w}</span>`).join(" ")}</div>
<script src="/__rasanai/gsap.min.js"></script><script src="assets/three/rasan-music.js"></script><script>
RasanMusic.load(${JSON.stringify(LY)}, ${JSON.stringify(aud)});
var A = RasanMusic.lyrics.get("I'm upping my \\"P(doom)\\""), B = RasanMusic.lyrics.get("i’m UPPING"), nth = RasanMusic.lyrics.get("burn it", 0), miss = false;
try { RasanMusic.lyrics.get("no such line"); } catch (e) { miss = true; }
var tl = gsap.timeline({ paused: true });
var starts = RasanMusic.gsapWords(tl, A, document.querySelectorAll("#l .w"), { from: { opacity: 0 }, to: { opacity: 1 }, duration: 0.3, ease: "none" });
var kids = tl.getChildren().map(function (c) { return [+c.startTime().toFixed(3), +c.duration().toFixed(3)]; });
var op = function (t) { tl.seek(t, false); return [0, 1, 2, 3].map(function (k) { return +getComputedStyle(document.getElementById("w" + k)).opacity; }); };
var before = op(10.25), mid = op(10.6), after = op(12.5), W = A.words[3];
window.__r = { same: A === B, i: A.i, nth: nth.i, miss: miss, starts: starts, kids: kids, before: before, mid: mid, after: after,
  prog: [RasanMusic.wordProgress(W, 11.4), RasanMusic.wordProgress(W, 11.85), RasanMusic.wordProgress(W, 12.4)],
  beat: [RasanMusic.audio.lastBeatBefore(9.9), RasanMusic.audio.lastDownbeatBefore(25.9), RasanMusic.audio.beatAt(1.25)], line: RasanMusic.lyrics.lineAt(20.5).i };
</script></body></html>`);
    const srv = await serve(proj);
    const b = await launch({ width: 400, height: 200, timeoutMs: 60000 });
    try {
      await b.open(`${srv.url}/index.html`);
      const r = await b.eval("window.__r");
      const exc = (b.logs || []).filter((l) => l.startsWith("exception"));
      ok("music runtime: get() finds a line by its text across straight and curly quotes (and throws for a missing one)", r && r.same && r.i === 0 && r.nth === 1 && r.miss, JSON.stringify(r) + exc.join(";"));
      ok("music runtime: gsapWords tweens each word at its sung start with the duration given; before it a word is hidden", r && JSON.stringify(r.starts) === "[10,10.5,11,11.5]" && JSON.stringify(r.kids) === "[[10,0.3],[10.5,0.3],[11,0.3],[11.5,0.3]]" && r.before[0] > 0.8 && r.before[1] === 0 && r.mid[1] > 0.3 && r.mid[2] === 0 && r.after.every((o) => o === 1), JSON.stringify(r));
      ok("music runtime: wordProgress runs 0..1 over the word, and beat and downbeat lookups snap to the grid", r && r.prog[0] === 0 && Math.abs(r.prog[1] - 0.5) < 0.01 && r.prog[2] === 1 && r.beat[0] === 9.5 && r.beat[1] === 24 && Math.abs(r.beat[2] - 2.5) < 1e-9 && r.line === 1, JSON.stringify(r.prog) + JSON.stringify(r.beat));
    } finally {
      await b.close();
      await srv.close();
    }
  }

  // the film finish: the grade leaves a flat patch at the centre within 1 level and adds grain; blur averages sub-frames
  {
    const flat = path.join(lyd, "flat.mp4");
    spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=0x3366cc:s=160x90:r=30:d=1", "-vf", "scale=out_color_matrix=bt709:out_range=limited,format=yuv420p", "-c:v", "libx264", "-crf", "12", "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-color_range", "tv", flat]);
    const graded = path.join(lyd, "graded.mp4");
    const g = node("finish.mjs", ["grade", "--in", flat, "--out", graded, "--probe", "60,25,40,40"], { cwd: ws });
    const gj = J(g);
    const grainStd = (f) => {
      const r = spawnSync("ffmpeg", ["-loglevel", "error", "-i", f, "-vf", "crop=40:40:60:25,format=gray", "-frames:v", "1", "-f", "rawvideo", "-"], { maxBuffer: 1 << 24 });
      const a = [...r.stdout];
      const m = a.reduce((x, y) => x + y, 0) / a.length;
      return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length);
    };
    const sb = grainStd(flat), sa = grainStd(graded);
    ok("finish: grade keeps a flat colour patch at the centre within 1 level and adds grain", g.status === 0 && gj.probe?.delta?.every((d) => Math.abs(d) <= 1) && gj.input_frames === gj.frames && sa > sb + 0.6, (g.stderr || "").slice(0, 200) + JSON.stringify({ probe: gj.probe, sb, sa }));
    if (!quick) {
      const bp = path.join(lyd, "blur-proj");
      fs.mkdirSync(bp, { recursive: true });
      fs.copyFileSync(path.join(HERE, "vendor", "gsap.min.js"), path.join(bp, "gsap.min.js"));
      fs.writeFileSync(path.join(bp, "hyperframes.json"), "{}");
      fs.writeFileSync(path.join(bp, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><script src="gsap.min.js"></script></head><body style="margin:0;background:#111"><div id="root" data-composition-id="main" data-start="0" data-duration="1" data-width="320" data-height="180" style="position:relative;width:320px;height:180px;background:#111;overflow:hidden"><div id="b" style="position:absolute;left:0;top:70px;width:40px;height:40px;background:#f60"></div></div><script>window.__timelines=window.__timelines||{};var tl=gsap.timeline({paused:true});tl.to("#b",{x:260,duration:1,ease:"none"},0);window.__timelines["main"]=tl;</script></body></html>`);
      const t0 = Date.now();
      const bl = node("finish.mjs", ["blur", "--project", bp, "--out", path.join(lyd, "blur.mp4"), "--samples", "8"], { cwd: ws });
      const bj = J(bl);
      let partial = 0;
      if (bl.status === 0) {
        const raw = spawnSync("ffmpeg", ["-loglevel", "error", "-i", path.join(lyd, "blur.mp4"), "-vf", "select=eq(n\\,15),crop=320:2:0:90,format=rgb24", "-frames:v", "1", "-f", "rawvideo", "-"], { maxBuffer: 1 << 24 }).stdout;
        for (let x = 0; x < 320 * 3; x += 3) if (raw[x] > 40 && raw[x] < 215) partial++;
      }
      ok(`finish: blur averages sub-frames (8 samples): 30 frames out, a moving card smeared into soft edges (${Math.round((Date.now() - t0) / 1000)} s)`, bl.status === 0 && bj.frames?.expected === 30 && bj.frames?.got === 30 && partial >= 3, (bl.stderr || "").slice(0, 300) + bl.stdout.slice(0, 200) + partial);
    }
  }
}

// 18. the design desk
{
  const ws = path.join(TMP, "desk-ws");
  const run = path.join(ws, ".rasanai", "r1");
  fs.mkdirSync(run, { recursive: true });
  const offline = { ...env, RASANAI_OFFLINE: "1" };
  const D = (a, o = {}) => spawnSync(process.execPath, [path.join(HERE, "design.mjs"), ...a], { encoding: "utf8", env: offline, cwd: ws, timeout: 120000, ...o });
  const C = (a) => spawnSync(process.execPath, [path.join(HERE, "crew.mjs"), ...a], { encoding: "utf8", env: { ...offline }, cwd: ws, timeout: 120000 });
  const L = (a) => spawnSync(process.execPath, [path.join(HERE, "library.mjs"), ...a], { encoding: "utf8", env, cwd: ws, timeout: 60000 });
  const J3 = (r) => { try { return JSON.parse(r.stdout); } catch { return {}; } };
  // library
  const ix = J3(L(["index"]));
  ok("library: index builds from the entries' frontmatter (systems and motion, no duplicates)", ix.ok && ix.systems >= 20 && ix.motion >= 5, JSON.stringify(ix).slice(0, 300));
  const sr = J3(L(["search", "--q", "paper receipts ledger finance", "--limit", "6"]));
  ok("library: search ranks entries for the words (ids, scores, why)", sr.ok && sr.results.length >= 1 && sr.results[0].score >= sr.results[sr.results.length - 1].score && sr.results.every((r) => r.id && r.path), JSON.stringify(sr).slice(0, 200));
  const s3 = J3(L(["search", "--q", "camera lens corridor", "--space", "3d", "--type", "motion"]));
  ok("library: --space 3d and --type motion narrow the search", s3.results.length >= 1 && s3.results.every((r) => r.type === "motion" && r.space !== "2d"));
  const sh1 = J3(L(["show", "saul-bass"]));
  ok("library: show returns an entry's tokens and sections; an unknown id exits 1", sh1.ok && sh1.tokens && sh1.tokens.palette && Object.keys(sh1.sections).length >= 3 && L(["show", "no-such-entry"]).status === 1);
  // the example system
  const EX = path.join(HERE, "..", "references", "design-desk-example", "Sure");
  // a small specimen page of our own (a layout, a palette, a display face), so fixtures can differ in composition
  const genSpec = ({ canvas, ink, accent, face, layout, text = "Every receipt, counted.", ease = "power4.out", throws = false, tl = true, dur = 0 }) => `<!doctype html><html><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=${face.replace(/ /g, "+")}:wght@700&display=swap" rel="stylesheet"><script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"></script><style>*{margin:0;box-sizing:border-box}html,body{width:1600px;height:900px;overflow:hidden;background:${canvas}}#root{position:relative;width:1600px;height:900px;background:${canvas};color:${ink};font-family:"${face}",sans-serif}h1{position:absolute;font-size:120px;font-weight:700;line-height:1;${layout === "L" ? "left:80px;top:80px;width:600px" : layout === "B" ? "left:80px;bottom:60px;width:1400px" : "right:60px;top:380px;width:560px;text-align:right;font-size:70px"}}.bars i{position:absolute;background:${ink};${layout === "L" ? "right:0;top:0;bottom:0;width:560px" : layout === "B" ? "left:0;right:0;top:0;height:420px" : "left:0;top:0;bottom:0;width:700px"}}.m{position:absolute;background:${accent};width:140px;height:60px;${layout === "L" ? "left:80px;bottom:80px" : layout === "B" ? "right:80px;bottom:80px" : "left:760px;top:120px"}}</style></head><body><div id="root" data-width="1600" data-height="900"><div class="bars"><i></i></div><h1 id="h">${text}</h1><div class="m" id="m"></div></div><script>${throws ? "nope.missing();" : ""}${tl ? `var tl=gsap.timeline({paused:true});tl.from("#h",{opacity:0,duration:.4,ease:"${ease}"}).from("#m",{scaleX:0,duration:.3,ease:"${ease}"})${dur ? `.to("#m",{opacity:1,duration:${dur},ease:"${ease}"})` : ""};window.__specimen={tl:tl};tl.progress(1);` : ""}</script></body></html>`;
  const copyTo = (dst, edit = {}) => {
    fs.mkdirSync(dst, { recursive: true });
    for (const f of ["DESIGN.md", "recipe.json", "blend.json", "specimen.html"]) {
      if (f === "specimen.html" && edit.nospec) continue;
      let t = fs.readFileSync(path.join(EX, f), "utf8");
      for (const [a, b, only] of edit.subs || []) if (!only || only === f) t = t.split(a).join(b);
      if (edit.raw && edit.raw[f] !== undefined) t = edit.raw[f];
      fs.writeFileSync(path.join(dst, f), t);
    }
    return dst;
  };
  const chk = (dir) => D(["check-system", "--dir", dir, "--offline"]);
  const good = copyTo(path.join(run, "design", "Sure"));
  const gr = chk(good);
  ok("design gate: the worked example system passes (canvas/ink/accent, contrast, real fonts, 4 references, motion and camera numbers)", gr.status === 0, gr.stdout.slice(0, 500));
  const T = path.join(TMP, "desk-bad");
  const refuse = (name, edit, re) => { const r = chk(copyTo(path.join(T, name), edit)); ok(`design gate refuses ${name}`, r.status === 2 && re.test(r.stdout), r.stdout.slice(0, 400)); };
  refuse("Inter for everything", { subs: [["Bricolage Grotesque", "Inter"], ["IBM Plex Sans", "Inter"]] }, /generic type/);
  refuse("low contrast ink", { subs: [["#10231c", "#9aa8a0"]] }, /needs 4\.5:1/);
  refuse("a purple-blue gradient", { subs: [["#d4392b", "#6d4cff"], ["Don't use a gradient, a glow", "Use a gradient from violet to blue, a glow"]] }, /purple-blue gradient/);
  refuse("the Claude look (cream, rust, italic serif)", { subs: [["#e9efe6", "#f4ece0"], ["Bricolage Grotesque", "Fraunces"], ["#d4392b", "#c4623a"], ['"bodyWeight": 400', '"bodyWeight": 400, "italic": true', "recipe.json"]] }, /Claude look/);
  refuse("a blend of one reference", { raw: { "blend.json": JSON.stringify({ ...JSON.parse(fs.readFileSync(path.join(EX, "blend.json"), "utf8")), references: [{ id: "saul-bass", traits: ["x"], why: "y" }] }) } }, /cites 1 library references/);
  refuse("a reference that is not in the library", { subs: [["banknote-guilloche", "made-up-style-of-1999", "blend.json"]] }, /not in the library/);
  refuse("a system with no Motion and camera section", { subs: [["## Motion and camera", "## Notes", "DESIGN.md"]] }, /Motion and camera/);
  refuse("motion written as adjectives (no timings, eases or camera)", { raw: { "DESIGN.md": fs.readFileSync(path.join(EX, "DESIGN.md"), "utf8").replace(/## Motion and camera[\s\S]*?(?=## Do's)/, "## Motion and camera\n\nSmooth, elegant and cinematic.\n\n") } }, /names 0 timings/);
  refuse("a recipe that disagrees with the DESIGN.md", { subs: [['"accent": "#d4392b"', '"accent": "#2b39d4"', "recipe.json"]] }, /differs from DESIGN\.md/);
  refuse("an invalid recipe vocabulary", { subs: [['"layout": "record"', '"layout": "hero-with-gradient"', "recipe.json"]] }, /layout/);
  refuse("invalid JSON", { raw: { "blend.json": "{ not json" } }, /not valid JSON/);
  refuse("a 3D system without a lens", { subs: [['"name": "Counting House",', '"name": "Counting House", "three": {"base": "glass-3d"},', "recipe.json"], ["24 mm lens", "wide lens", "DESIGN.md"], ["50 mm", "tight", "DESIGN.md"]] }, /lens in mm/);
  // the specimen gate: the example's own page passes (above); each of these fails for its own reason
  const sp = (name, edit, re, extra = []) => { const r = D(["check-system", "--dir", copyTo(path.join(T, name), edit), "--offline", ...extra]); ok(`specimen gate refuses ${name}`, r.status === 2 && re.test(r.stdout), r.stdout.slice(0, 500)); };
  sp("a missing specimen.html", { nospec: true }, /specimen\.html is missing/);
  sp("a specimen with a page error", { raw: { "specimen.html": genSpec({ canvas: "#e9efe6", ink: "#10231c", accent: "#d4392b", face: "Bricolage Grotesque", layout: "L", throws: true }) } }, /page error/);
  sp("a specimen off the system's palette", { raw: { "specimen.html": genSpec({ canvas: "#2244aa", ink: "#8822aa", accent: "#d4392b", face: "Bricolage Grotesque", layout: "L" }) } }, /off the system's palette|canvas and surface cover/);
  sp("a specimen flooded with the accent", { subs: [["#e9efe6", "#d4392b", "specimen.html"]] }, /accent covers/);
  sp("a specimen whose headline is not the first line", { subs: [["Every receipt,", "Hello there", "specimen.html"]] }, /does not carry the story's first line/, ["--hook", "Every receipt, counted."]);
  sp("a specimen with no timeline", { raw: { "specimen.html": genSpec({ canvas: "#e9efe6", ink: "#10231c", accent: "#d4392b", face: "Bricolage Grotesque", layout: "L", tl: false }) } }, /window\.__specimen/);
  sp("a specimen timeline longer than 5 s", { raw: { "specimen.html": genSpec({ canvas: "#e9efe6", ink: "#10231c", accent: "#d4392b", face: "Bricolage Grotesque", layout: "L", dur: 5.5 }) } }, /5 s at most/);
  ok("specimen gate: a 4.5 s moving sketch is accepted (the cap is 5 s)", D(["check-system", "--dir", copyTo(path.join(T, "a 4.5 s specimen"), { raw: { "specimen.html": genSpec({ canvas: "#e9efe6", ink: "#10231c", accent: "#d4392b", face: "Bricolage Grotesque", layout: "L", dur: 3.8 }) } }), "--offline"]).status === 0);
  sp("a specimen easing outside the system's motion section", { raw: { "specimen.html": genSpec({ canvas: "#e9efe6", ink: "#10231c", accent: "#d4392b", face: "Bricolage Grotesque", layout: "L", ease: "bounce.out" }) } }, /doesn't name/);
  const sj = JSON.parse(D(["check-system", "--dir", good, "--offline"]).stdout);
  ok("specimen gate: the example's specimen is rendered to specimen.png and its colour shares are reported (accent rationed, canvas leading)", fs.existsSync(path.join(good, "specimen.png")) && sj.system.specimen && sj.system.specimen.share.canvas > 0.2 && sj.system.specimen.share.accent > 0 && sj.system.specimen.share.accent < 0.08, JSON.stringify(sj.system.specimen));
  // three systems: a near-duplicate fails; three distinct ones pass
  const bold = { subs: [["#e9efe6", "#101418"], ["#10231c", "#eef2f0"], ["#d4392b", "#f5b700"], ["#1f6f54", "#4cc9a0"], ["#f7faf4", "#1b2128"], ["#5d6f66", "#9aa7a0"], ["#b8c6bb", "#2a323a"], ["Bricolage Grotesque", "Space Grotesk"], ["IBM Plex Sans", "DM Sans"], ["Counting House", "Night Audit"], ['"layout": "record"', '"layout": "data"', "recipe.json"], ['"motion": "snap"', '"motion": "slide"', "recipe.json"], ["financial-times-graphics", "airport-wayfinding", "blend.json"], ["banknote-guilloche", "transit-map-beck", "blend.json"], ["The FT's paper-and-chart restraint, banknote engraving and Saul Bass's one hot accent, for receipts that become trusted numbers.", "Departure-board data rows and one amber signal, for receipts that read as a live reconciliation.", "blend.json"], ["The story turns a crumpled receipt into an audited number: a ledger desk with a single stamp is that moment, and nothing in the category looks like it.", "The story is a night shift matching every receipt: a dark board where each line turns green is the proof.", "blend.json"]] };
  const wild = { subs: [["#e9efe6", "#f2d16b"], ["#10231c", "#1a0f2e"], ["#d4392b", "#e0245e"], ["#1f6f54", "#3b2a8c"], ["#f7faf4", "#fff3c4"], ["#5d6f66", "#5c4a6e"], ["#b8c6bb", "#d9b94a"], ["Bricolage Grotesque", "Syne"], ["IBM Plex Sans", "Work Sans"], ["Counting House", "Stamp Duty"], ['"layout": "record"', '"layout": "poster"', "recipe.json"], ['"motion": "snap"', '"motion": "pop"', "recipe.json"], ["financial-times-graphics", "constructivism", "blend.json"], ["banknote-guilloche", "de-stijl", "blend.json"], ["The FT's paper-and-chart restraint, banknote engraving and Saul Bass's one hot accent, for receipts that become trusted numbers.", "Primary blocks and a stamped number shouting 312, for receipts that finally get counted.", "blend.json"], ["The story turns a crumpled receipt into an audited number: a ledger desk with a single stamp is that moment, and nothing in the category looks like it.", "The story is a count that lands as a poster: one huge figure and a stamp, loud and certain.", "blend.json"]] };
  copyTo(path.join(run, "design", "Bold"), { ...bold, raw: { "specimen.html": genSpec({ canvas: "#101418", ink: "#eef2f0", accent: "#f5b700", face: "Space Grotesk", layout: "B" }) } });
  copyTo(path.join(run, "design", "Wild"), { ...wild, raw: { "specimen.html": genSpec({ canvas: "#f2d16b", ink: "#1a0f2e", accent: "#e0245e", face: "Syne", layout: "R" }) } });
  const trio = D(["check-systems", "--run", run, "--offline"]);
  ok("design gate: three distinct systems pass check-systems (palette, display face, layout, motion differ)", trio.status === 0, trio.stdout.slice(0, 600));
  copyTo(path.join(run, "design", "Bold"), { subs: [["Counting House", "Counting House Two"]] });
  const dup = D(["check-systems", "--run", run, "--offline"]);
  ok("design gate: a near-duplicate pair is refused (too alike, same references)", dup.status === 2 && /too alike/.test(dup.stdout) && /exactly the same references/.test(dup.stdout) && /same layout recoloured/.test(dup.stdout), dup.stdout.slice(0, 500));
  // the same composition in other colours scores near 1 on layout; a different composition scores low
  {
    const { decodePng, layoutSimilarity } = await import("./lib/png.mjs");
    const A = decodePng(path.join(run, "design", "Sure", "specimen.png")), Bimg = decodePng(path.join(run, "design", "Wild", "specimen.png"));
    const recol = { ...A, rgb: A.rgb.map((v) => 255 - v) };
    ok("design gate: layout similarity sees a recoloured (inverted) copy as the same layout and a different composition as different", layoutSimilarity(A, recol) > 0.9 && layoutSimilarity(A, Bimg) < 0.85, `${layoutSimilarity(A, recol).toFixed(2)} / ${layoutSimilarity(A, Bimg).toFixed(2)}`);
  }
  copyTo(path.join(run, "design", "Bold"), { ...bold, raw: { "specimen.html": genSpec({ canvas: "#101418", ink: "#eef2f0", accent: "#f5b700", face: "Space Grotesk", layout: "B" }) } });
  // a brand: Sure must be the brand
  const brandMd = path.join(TMP, "brand.md");
  fs.writeFileSync(brandMd, '---\nname: "Tally"\ncolors:\n  canvas: "#ffffff"   # page background\n  ink: "#101010"      # text\n  accent: "#0a7d4b"   # brand accent\ntypography:\n  display:\n    fontFamily: Manrope\n    fontWeight: 700\n  body:\n    fontFamily: Manrope\n    fontWeight: 400\nrounded:\n  md: 8px\n---\n## Overview\nTally is a bookkeeping app.\n');
  const br = D(["check-system", "--dir", good, "--brand", brandMd, "--offline"]);
  ok("design gate: with a brand DESIGN.md, Sure must be the brand (its colours and display face)", br.status === 2 && /must be the brand extended/.test(br.stdout) && /display face Manrope/.test(br.stdout), br.stdout.slice(0, 400));
  // the brand lock: the brand holds for ALL three (not only Sure), and the Look refuses an off-brand set
  {
    const brB = D(["check-system", "--dir", path.join(run, "design", "Bold"), "--brand", brandMd, "--offline"]);
    ok("brand lock: Bold must stay inside the brand's palette and type too (not only Sure)", brB.status === 2 && /Bold: brand lock/.test(brB.stdout), brB.stdout.slice(0, 400));
    fs.writeFileSync(path.join(run, "decisions.json"), JSON.stringify({ subject: "Tally", brand: brandMd, use_brand: true }));
    const lockPl = D(["look-payload", "--run", run, "--hook", "Tax season. Again.", "--recommended", "bold"]);
    ok("brand lock: look-payload refuses to push (or recommend) an off-brand look", lockPl.status !== 0 && /brand lock/.test(lockPl.stdout + lockPl.stderr), (lockPl.stdout + lockPl.stderr).slice(0, 300));
    const lockSys = D(["check-systems", "--run", run, "--offline"]);
    ok("brand lock: check-systems applies the brand from the run's decisions", lockSys.status === 2 && /brand lock/.test(lockSys.stdout), lockSys.stdout.slice(0, 300));
    fs.writeFileSync(path.join(run, "decisions.json"), JSON.stringify({ subject: "Tally", use_brand: false, brand: brandMd }));
    const freed = D(["check-systems", "--run", run, "--offline"]);
    ok("brand lock: use_brand false lifts it", !/brand lock/.test(freed.stdout), freed.stdout.slice(0, 300));
    // the brand film grammar: a branded launch look must cite the card, use its palette and type, carry no outside references
    {
      const bd = path.join(run, "design", "Bold"), bj = path.join(bd, "blend.json"), saved = fs.readFileSync(bj, "utf8"), bdm = fs.readFileSync(path.join(bd, "DESIGN.md"), "utf8");
      const cardDir = path.join(run, "brand-film");
      fs.mkdirSync(cardDir, { recursive: true });
      fs.writeFileSync(path.join(run, "decisions.json"), JSON.stringify({ subject: "Tally", route: "product-launch-video", brand: brandMd, use_brand: true }));
      const film = (c) => (D(["check-system", "--dir", bd, "--brand", brandMd, "--offline"]).stdout.match(/[^"]*film style[^"]*/g) || []).join(" | ");
      const noCard = film();
      ok("film style: a branded launch look with no FILM-STYLE card is refused", /needs the brand's film grammar card/.test(noCard), noCard.slice(0, 300));
      const writeCard = (pal, typefaces, motion) => fs.writeFileSync(path.join(cardDir, "FILM-STYLE.json"), JSON.stringify({ version: 1, brand: "Tally", measured: { palette: pal.map((h) => ({ hex: h, share: 0.2 })), background: { overall: pal[0] } }, slots: { typefaces, motif: "a dot", layout: "centred", motionVocabulary: motion, photographyStyle: "none", endCard: "the mark" }, filled: true }));
      writeCard(["#101418", "#eef2f0", "#f5b700"], "Space Grotesk. Substitute: Space Grotesk", "scale, morph, cut on the beat");
      const uncited = film();
      ok("film style: a look that does not cite FILM-STYLE.md, has no film_style_takes and still blends library references is refused", /must cite the card/.test(uncited) && /film_style_takes/.test(uncited) && /blend\.references must be empty/.test(uncited), uncited.slice(0, 500));
      const bl = JSON.parse(saved);
      fs.writeFileSync(bj, JSON.stringify({ ...bl, references: [], film_style: "brand-film/FILM-STYLE.md", film_style_takes: ["palette", "type", "motion vocabulary"] }));
      const cited = film();
      ok("film style: a look that cites the card, has no outside references and uses the card's palette and type passes the film-style checks", cited === "", cited.slice(0, 400));
      writeCard(["#ffffff", "#888888", "#cc0000"], "Space Grotesk", "scale");
      const offp = film();
      ok("film style: a canvas, ink or accent that is not on the card's palette is refused (dE)", /canvas #101418 is not a colour of the brand film's card/.test(offp), offp.slice(0, 400));
      writeCard(["#101418", "#eef2f0", "#f5b700"], "OpenAI Sans. Substitute: Inter", "scale");
      const offt = film();
      ok("film style: a display face that is not in the card's typefaces is refused", /display face Space Grotesk is not in the card's typefaces/.test(offt), offt.slice(0, 400));
      fs.writeFileSync(path.join(bd, "DESIGN.md"), bdm.replace(/## Motion and camera\n/, "## Motion and camera\nA slow dolly with motion blur and film grain on every move. "));
      writeCard(["#101418", "#eef2f0", "#f5b700"], "Space Grotesk", "flat: no 3D, no blur, no grain; scale, morph");
      const flat = film();
      ok("film style (W4): a flat card no longer refuses a dolly, motion blur or grain in the Motion and camera section (brand lock is palette, type, logo, UI and tone)", !/motion is flat/.test(flat) && !/film style: .*(dolly|motion blur|grain)/.test(flat), flat.slice(0, 400));
      writeCard(["#101418", "#eef2f0", "#f5b700"], "OpenAI Sans. Substitute: Inter", "flat: no 3D, no blur, no grain; scale, morph");
      const lpl = D(["look-payload", "--run", run, "--hook", "Tax season. Again.", "--recommended", "bold"]);
      ok("film style: look-payload refuses to push a branded look that leaves the card's grammar", lpl.status !== 0 && /film style|brand lock/.test(lpl.stdout + lpl.stderr), (lpl.stdout + lpl.stderr).slice(0, 300));
      fs.writeFileSync(bj, saved); fs.writeFileSync(path.join(bd, "DESIGN.md"), bdm);
      fs.rmSync(cardDir, { recursive: true, force: true });
    }
    fs.rmSync(path.join(run, "decisions.json"), { force: true });
  }
  // the motion grammar gate (fixture library): each look binds ONE grammar as grammar.json; three looks, three grammars
  {
    const GFX = path.join(HERE, "tests", "fixtures", "grammars");
    const GL = { ...offline, RASANAI_GRAMMAR_LIBRARY: GFX };
    const DG = (a) => D(a, { env: GL });
    const GM = (a) => spawnSync(process.execPath, [path.join(HERE, "grammar.mjs"), ...a], { encoding: "utf8", env: GL, cwd: ws, timeout: 60000 });
    const run2 = path.join(ws, ".rasanai", "r2");
    for (const l of ["Sure", "Bold", "Wild"]) fs.cpSync(path.join(run, "design", l), path.join(run2, "design", l), { recursive: true });
    const sys = (l) => path.join(run2, "design", l);
    const nog = DG(["check-system", "--dir", sys("Sure"), "--offline"]);
    ok("grammar (design): with a grammar library, a look without grammar.json is refused (grammar-missing)", nog.status === 2 && /grammar-missing: design\/Sure\/grammar\.json/.test(nog.stdout), nog.stdout.slice(0, 300));
    ok("grammar (design): with no grammar library, a look without grammar.json still passes (back-compat)", chk(sys("Sure")).status === 0);
    const w1 = GM(["write", "--run", run2, "--id", "alpha-grid", "--label", "Sure"]);
    const okS = DG(["check-system", "--dir", sys("Sure"), "--offline"]);
    ok("grammar (design): grammar.mjs write --label puts the grammar in design/Sure/ and check-system accepts it (info.grammar)", w1.status === 0 && okS.status === 0 && JSON.parse(okS.stdout).system.grammar === "alpha-grid", okS.stdout.slice(0, 300));
    const gb = JSON.parse(fs.readFileSync(path.join(GFX, "beta-glow.json"), "utf8"));
    const bad = { ...gb }; delete bad.flat_ok; bad.techniques = bad.techniques.slice(0, 3);
    fs.writeFileSync(path.join(sys("Bold"), "grammar.json"), JSON.stringify(bad));
    const inv = DG(["check-system", "--dir", sys("Bold"), "--offline"]);
    ok("grammar (design): a grammar that breaks the schema is refused (grammar-invalid names flat_ok and the technique count)", inv.status === 2 && /grammar-invalid: flat_ok/.test(inv.stdout) && /grammar-invalid: techniques has 3/.test(inv.stdout), inv.stdout.slice(0, 400));
    fs.writeFileSync(path.join(sys("Bold"), "grammar.json"), JSON.stringify(gb));
    GM(["write", "--run", run2, "--id", "alpha-grid", "--label", "Wild"]);
    const rep3 = DG(["check-systems", "--run", run2, "--offline"]);
    ok("grammar (design): two looks on the same grammar are refused by check-systems (grammar-repeat)", rep3.status === 2 && /grammar-repeat: Sure and Wild both use the grammar \\?"alpha-grid/.test(rep3.stdout), rep3.stdout.slice(0, 400));
    GM(["write", "--run", run2, "--id", "gamma-dots", "--label", "Wild"]);
    const tri = DG(["check-systems", "--run", run2, "--offline"]);
    ok("grammar (design): three looks on three different grammars pass check-systems", tri.status === 0 && !/grammar-/.test(tri.stdout), tri.stdout.slice(0, 500));
    // a flat brand film refuses a grammar that needs glow or 3D
    fs.mkdirSync(path.join(run2, "brand-film"), { recursive: true });
    fs.writeFileSync(path.join(run2, "decisions.json"), JSON.stringify({ subject: "Tally", route: "product-launch-video", brand: brandMd, use_brand: true }));
    fs.writeFileSync(path.join(run2, "brand-film", "FILM-STYLE.json"), JSON.stringify({ version: 1, brand: "Tally", measured: { palette: ["#101418", "#eef2f0", "#f5b700"].map((h) => ({ hex: h, share: 0.2 })), background: { overall: "#101418" } }, slots: { typefaces: "Space Grotesk", motif: "a dot", layout: "centred", motionVocabulary: "flat: no 3D, no blur, no grain; scale, morph", photographyStyle: "none", endCard: "the mark" }, filled: true }));
    const flatB = DG(["check-system", "--dir", sys("Bold"), "--brand", brandMd, "--offline"]);
    const flatS = DG(["check-system", "--dir", sys("Sure"), "--brand", brandMd, "--offline"]);
    ok("grammar (design): a flat brand film refuses a flat_ok:false grammar (grammar-not-flat) and accepts a flat one", /grammar-not-flat: Bold/.test(flatB.stdout) && !/grammar-not-flat/.test(flatS.stdout), flatB.stdout.slice(0, 300));
    fs.rmSync(path.join(run2, "brand-film"), { recursive: true, force: true }); fs.rmSync(path.join(run2, "decisions.json"), { force: true });
    const dec2 = path.join(run2, "decisions.json");
    fs.writeFileSync(dec2, JSON.stringify({ subject: "Tally", picks: {} }));
    const cs2 = DG(["choose-system", "--run", run2, "--label", "Wild", "--decisions", dec2]);
    ok("grammar (design): choose-system carries the look's grammar to look/grammar.json (the score is checked against it)", cs2.status === 0 && JSON.parse(fs.readFileSync(path.join(run2, "look", "grammar.json"), "utf8")).id === "gamma-dots", cs2.stdout.slice(0, 200) + cs2.stderr.slice(0, 200));
  }
  // the Look payload, choose, motion.md, DIRECTION.md
  const pl = D(["look-payload", "--run", run, "--hook", "Tax season. Again.", "--recommended", "bold"]);
  const pj = J3(pl);
  ok("look-payload: exactly the three bespoke systems with name, blend, why and a live recipe (no preset gallery)", pl.status === 0 && pj.styles.length === 3 && pj.recommended === "bold" && pj.styles.every((x) => x.name && x.blend && x.why && x.style.recipe.palette.canvas && x.references.length >= 2) && !pj.gallery && !pj.presets && pj.styles.every((x) => /specimen\.html$/.test(x.specimen || "") && /specimen\.png$/.test(x.poster || "")), pl.stdout.slice(0, 300));
  const dec = path.join(run, "decisions.json");
  fs.writeFileSync(dec, JSON.stringify({ subject: "Tally", picks: {} }));
  const cs = D(["choose-system", "--run", run, "--label", "Bold", "--decisions", dec]);
  const dj = JSON.parse(fs.readFileSync(dec, "utf8"));
  ok("choose-system: the chosen DESIGN.md becomes the film's look (look/DESIGN.md, look/frame.md, decisions.look, the system's taxonomy picks)", cs.status === 0 && fs.existsSync(path.join(run, "look", "frame.md")) && /Night Audit|Space Grotesk/.test(fs.readFileSync(path.join(run, "look", "frame.md"), "utf8")) && dj.look.system === "Bold" && dj.picks["visual-style"] && dj.design_system.references.length >= 2 && fs.readFileSync(path.join(run, "look", "DESIGN.md"), "utf8").includes("#101418"), cs.stdout.slice(0, 300) + cs.stderr.slice(0, 200));
  const mm = node("motion-md.mjs", ["write", "--design-system", path.join(run, "design", "Bold"), "--out", path.join(run, "motion.md")]);
  ok("motion-md: write --design-system lays the system's contract on its motion language (eases, scale, stagger, bans)", mm.status === 0 && /"enter":"power4\.out"/.test(fs.readFileSync(path.join(run, "motion.md"), "utf8")) && /Bespoke motion language/.test(fs.readFileSync(path.join(run, "motion.md"), "utf8")), mm.stderr.slice(0, 300));
  const dr = node("direction.mjs", ["compile", "--decisions", dec, "--out", path.join(run, "direction")], { cwd: ws });
  ok("direction: compile carries the bespoke system's blend and its Motion and camera section into DIRECTION.md", dr.status === 0 && /The bespoke design system: Night Audit/.test(fs.readFileSync(path.join(run, "direction", "DIRECTION.md"), "utf8")) && /power4\.out/.test(fs.readFileSync(path.join(run, "direction", "DIRECTION.md"), "utf8")), dr.stderr.slice(0, 300) + dr.stdout.slice(0, 200));
  // the console draws bespoke recipes inline: no gallery, no 403
  const html = fs.readFileSync(path.join(HERE, "..", "console", "index.html"), "utf8");
  ok("console: the Look step has no style browser (no 'Browse all', no gallery overlay); tiles draw each system's own recipe", !/Browse all/.test(html) && !/galleryOverlay/.test(html) && /New blends near this one/.test(html) && /s\.style \|\| null/.test(html));
  ok("console: RasaPresets3D draws a bespoke system through its three.base family", /function keyOf\(preset\)/.test(fs.readFileSync(path.join(HERE, "..", "console", "presets3d.js"), "utf8")));
  // the crew
  const pln = J3(C(["plan", "--run", run, "--route", "product-launch-video", "--subject", "Tally", "--scenes", "4", "--model", "sonnet"]));
  const members = (pln.phases || []).flatMap((x) => x.members);
  ok("crew: the plan includes the design researcher (during the Brief) and three design-system designers (Sure, Bold, Wild) after the story", members.includes("design-researcher (inherit)") && ["Sure", "Bold", "Wild"].every((k) => members.includes(`design-system-designer:${k} (inherit)`)) && pln.phases.findIndex((x) => x.phase === "design-systems") > pln.phases.findIndex((x) => x.phase === "story"), JSON.stringify(members));
  const lyr = J3(C(["plan", "--run", path.join(ws, ".rasanai", "r2"), "--route", "music-to-video", "--subject", "Song", "--model", "sonnet"])) ;
  fs.mkdirSync(path.join(ws, ".rasanai", "r2"), { recursive: true });
  const lyr2 = J3(C(["plan", "--run", path.join(ws, ".rasanai", "r2"), "--route", "music-to-video", "--subject", "Song", "--model", "sonnet"]));
  ok("crew: a lyric video plans one design-system designer (from the chosen treatment), not three", (lyr2.phases || []).flatMap((x) => x.members).filter((m) => /design-system-designer/.test(m)).length === 1);
  const bd = J3(C(["brief", "--run", run, "--role", "design-system-designer", "--key", "Bold"]));
  const bp = bd.prompt ? fs.readFileSync(path.join(ws, bd.prompt), "utf8") : "";
  ok("crew: a design-system designer's brief names its stance, the library commands, its three outputs and the gate", /Role: design system designer/.test(bp) && /Bold: push it/.test(bp) && /library\.mjs/.test(bp) && /design\/Bold\/DESIGN\.md/.test(bp) && /design\/Bold\/blend\.json/.test(bp) && /check-system --dir/.test(bp) && /Show off/.test(bp), bp.slice(0, 200));
  ok("crew: check design-system-designer runs the system gate and the sibling comparison", C(["check", "--run", run, "--role", "design-system-designer", "--key", "Bold"]).status === 0 && C(["check", "--run", run, "--role", "design-system-designer", "--key", "Sure"]).status === 0);
  copyTo(path.join(run, "design", "Wild"), { subs: [["Counting House", "Counting House Three"]] });
  const sib = C(["check", "--run", run, "--role", "design-system-designer", "--key", "Wild"]);
  ok("crew: a designer whose system is a copy of a sibling's fails the later one (too alike)", sib.status === 2 && /too alike/.test(sib.stdout), sib.stdout.slice(0, 300));
  // the design researcher's gate
  const dro = C(["check", "--run", run, "--role", "design-researcher"]);
  ok("crew: check design-researcher refuses missing work (exit 2)", dro.status === 2 && /design\.md is missing/.test(dro.stdout));
  const ids = J3(L(["ids"])).ids;
  const mot = J3(L(["search", "--type", "motion", "--limit", "3"])).results.map((r) => r.id);
  const refs = [...new Set([...mot.slice(0, 2), ...ids])].slice(0, 9).map((id) => ({ id, type: mot.includes(id) ? "motion" : "system", why: "fits the subject because its ledger paper logic carries", traits: ["t"], space: "both" }));
  fs.mkdirSync(path.join(run, "research"), { recursive: true });
  fs.writeFileSync(path.join(run, "research", "design.md"), "## The subject's visual world\nx https://a.example/1 https://a.example/2\n## Clichés to avoid\nx\n## Audience\nx\n## Materials, places, eras\nx https://a.example/3\n## Library references\nx\n## Sources\nhttps://a.example/4\n");
  fs.writeFileSync(path.join(run, "research", "design-refs.json"), JSON.stringify({ subject: "Tally", world: { visual_culture: "v", cliches_to_avoid: ["a", "b", "c"], materials: ["paper"] }, references: refs, sources: [] }));
  const drg = C(["check", "--run", run, "--role", "design-researcher"]);
  ok("crew: check design-researcher accepts a world note with sources, clichés and 9 real library references", drg.status === 0, drg.stdout.slice(0, 400));
  fs.writeFileSync(path.join(run, "research", "design-refs.json"), JSON.stringify({ subject: "Tally", world: { cliches_to_avoid: ["a", "b", "c"], materials: ["p"] }, references: [...refs.slice(0, 6), { id: "invented-style", why: "x" }] }));
  const drb = C(["check", "--run", run, "--role", "design-researcher"]);
  ok("crew: check design-researcher refuses a shortlist with a made-up id or fewer than 8", drb.status === 2 && /not in the library/.test(drb.stdout) && /shortlists 7/.test(drb.stdout), drb.stdout.slice(0, 300));
}

// 19. model profiles, adaptive prompts, and the finish opt-out for stepped scenes
{
  const ws = path.join(TMP, "models-ws");
  const run = path.join(ws, ".rasanai", "r1");
  fs.mkdirSync(run, { recursive: true });
  const M = await import(path.join(HERE, "lib", "models.mjs"));
  const { profileFor, detectModel, tierFor } = M;
  ok("models: profiles", profileFor("claude-opus-5-5").key === "claude-opus" && profileFor("claude-sonnet-5-5").tier === "strong" && profileFor("claude-haiku-4-5").tier === "fast" && profileFor("gpt-5.6-sol").key === "gpt-frontier" && profileFor("gpt-5-codex").harness === "codex" && profileFor("whatever").key === "other");
  ok("models: detect", detectModel({ RASANAI_MODEL: "gpt-5.6-sol" }).harness === "codex" && detectModel({ ANTHROPIC_MODEL: "claude-opus-5-5" }).harness === "claude-code" && detectModel({}).model === "unknown");
  ok("models: tiers (gathering may run fast; judging never)", tierFor("scene-animator", profileFor("haiku")).ok === false && tierFor("local-scout", profileFor("haiku")).ok === true && tierFor("critic", profileFor("gpt-5-mini")).ok === false);
  const C = (a) => spawnSync(process.execPath, [path.join(HERE, "crew.mjs"), ...a], { encoding: "utf8", env, cwd: ws, timeout: 120000 });
  const J4 = (r) => { try { return JSON.parse(r.stdout); } catch { return {}; } };
  const proj = path.join(ws, "videos", "t");
  fs.mkdirSync(path.join(proj, ".hyperframes", "frame-packets"), { recursive: true });
  const pl = J4(C(["plan", "--run", run, "--route", "product-launch-video", "--subject", "Tally", "--scenes", "2", "--project", proj, "--model", "gpt-5.6-sol"]));
  ok("crew: plan records the model and harness", pl.model === "gpt-5.6-sol" && pl.harness === "codex", JSON.stringify(pl).slice(0, 200));
  fs.mkdirSync(path.join(run, "motion"), { recursive: true });
  const score = { spine: "s", scenes: [{ n: 1, title: "a", duration: 3, space: "2d", entrances: [{ type: "cut-in" }], shots: [] }, { n: 2, title: "b", duration: 3, space: "2d", entrances: [], shots: [] }] };
  fs.writeFileSync(path.join(run, "motion", "score.json"), JSON.stringify(score));
  const brief = (model) => { const r = J4(C(["brief", "--run", run, "--role", "scene-animator", "--key", "1", "--project", proj, "--model", model])); return { r, text: r.prompt ? fs.readFileSync(path.join(ws, r.prompt), "utf8") : "" }; };
  const gp = brief("gpt-5.6-sol"), so = brief("sonnet"), op = brief("opus");
  const same = (t) => /## Dispatch context/.test(t) && /crew\.mjs" check --run/.test(t) && /Show off/.test(t);
  ok("models: the same job, dispatch context, check command and show-off ask reach every model", same(gp.text) && same(so.text) && same(op.text));
  ok("models: GPT gets the contract first and the strict creative loop (reel-quality worked example, self-critique against the critic rubric, no clarifying questions, whole files)", /^You are running as a crew member under Codex/.test(gp.text) && /\*\*Start here\.\*\*/.test(gp.text) && /A reel-quality scene, worked/.test(gp.text) && /Self-critique before you hand back/.test(gp.text) && /at least 50% of the frame height/.test(gp.text) && /Never ask a clarifying question/.test(gp.text) && /Write each output file in full/.test(gp.text), gp.text.slice(0, 200));
  ok("models: Sonnet gets the checklist and improvement passes; Opus the open ask; they differ", /Improvement pass 1/.test(so.text) && !/Improvement pass/.test(op.text) && so.text !== op.text && gp.text !== op.text && !/A reel-quality scene, worked/.test(so.text + op.text));
  ok("models: Claude-only wording is neutralised for others", !/Opus is genuinely good|Opus-level/.test(gp.text + so.text));
  const fd = J4(C(["brief", "--run", run, "--role", "frame-designer", "--key", "1-2", "--model", "gpt-5.6-sol"]));
  ok("models: GPT frame designers also get the reel-quality key frame and the self-critique", /reel-quality key frame, worked/.test(fs.readFileSync(path.join(ws, fd.prompt), "utf8")));
  ok("dispatch: Codex gets `codex exec -m <model> ... -s danger-full-access`, Claude Code gets Agent(... run_in_background: true)", /^codex exec -m gpt-5\.6-sol/.test(gp.r.dispatch || "") && /-s danger-full-access/.test(gp.r.dispatch) && /^Agent\(/.test(so.r.dispatch || "") && /run_in_background: true/.test(so.r.dispatch), `${gp.r.dispatch} | ${so.r.dispatch}`);
  const gather = J4(C(["brief", "--run", run, "--role", "brand-researcher", "--model", "opus"]));
  ok("dispatch: a gathering role on a Claude model may use a faster model", /model: "sonnet"/.test(gather.dispatch || ""), gather.dispatch);
  const mk = spawnSync(process.execPath, [path.join(HERE, "crew.mjs"), "model", "--kv"], { encoding: "utf8", env: { ...env, RASANAI_MODEL: "gpt-5.6-sol" }, cwd: ws });
  ok("crew.mjs model --kv prints MODEL= and HARNESS= (setup.sh passes them on)", /MODEL=gpt-5\.6-sol/.test(mk.stdout) && /HARNESS=codex/.test(mk.stdout));
  ok("models: every addendum a profile names exists", ["claude-opus", "claude-sonnet", "claude-haiku", "gpt", "other"].every((n) => fs.existsSync(path.join(HERE, "..", "agents", "_models", `${n}.md`))));
  // the finish opt-out: stepped scenes are rendered from the centre sub-frame, not averaged
  const { sharpRanges, graphWithSharp } = await import(path.join(HERE, "lib", "sharp.mjs"));
  const fp = path.join(ws, "fin");
  fs.mkdirSync(path.join(fp, "compositions", "frames"), { recursive: true });
  fs.writeFileSync(path.join(fp, "index.html"), '<div data-composition-id="root"><div id="s1" data-composition-id="a" data-composition-src="compositions/frames/a.html" data-start="0" data-duration="4"></div><div id="s2" data-composition-id="b" data-composition-src="compositions/frames/b.html" data-start="4" data-duration="3"></div><div id="s3" data-composition-id="c" data-composition-src="compositions/frames/c.html" data-start="7" data-duration="2" data-finish-blur="off"></div><div id="s4" data-composition-id="d" data-composition-src="compositions/frames/d.html" data-start="9" data-duration="5"></div></div>');
  for (const [n, a] of [["a", ""], ["b", ' data-finish-blur="off"'], ["c", ""], ["d", ""]]) fs.writeFileSync(path.join(fp, "compositions", "frames", `${n}.html`), `<template><div data-composition-id="${n}"${a}></div></template>`);
  const rg = sharpRanges(fp, { sharp: "20-22", "sharp-scenes": "1" });
  ok("finish: sharp windows come from data-finish-blur=\"off\" on a frame root or a clip, --sharp seconds and --sharp-scenes", rg.some((r) => r[0] === 4 && r[1] === 7) && rg.some((r) => r[0] === 7 && r[1] === 9) && rg.some((r) => r[0] === 20) && rg.some((r) => r[0] === 0 && r[1] === 4) && !rg.some((r) => r[0] === 9), JSON.stringify(rg));
  ok("finish: --no-auto-sharp ignores the markup", sharpRanges(fp, { "no-auto-sharp": true }).length === 0);
  const ft = path.join(ws, "fin-test");
  fs.mkdirSync(ft, { recursive: true });
  const FF = (a) => spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...a], { encoding: "utf8" });
  const src = path.join(ft, "over.mp4");
  const mk2 = FF(["-f", "lavfi", "-i", "color=c=black:s=320x180:r=240:d=2", "-f", "lavfi", "-i", "color=c=white:s=20x60:r=240:d=2", "-filter_complex", "[0][1]overlay=x='mod(t*600,300)':y=60", "-pix_fmt", "yuv420p", src]);
  if (mk2.status !== 0) ok("finish: sharp windows leave the centre sub-frame unaveraged (needs ffmpeg)", false, mk2.stderr.slice(0, 200));
  else {
    const N = 8, fps = 30;
    const chain = [`tpad=start=2:start_mode=clone:stop=2:stop_mode=clone`, `tmix=frames=5:weights='0.5 1 1 1 0.5'`, `trim=start_frame=4`, `setpts=PTS-STARTPTS`, `select='not(mod(n,${N}))'`, `setpts=N/(${fps}*TB)`].join(",");
    const g = graphWithSharp("[0:v]", chain, { N, fps, ranges: [[1, 2, "scene"]] }) + `,fps=${fps}[out]`;
    const out = path.join(ft, "out.mp4");
    const r = FF(["-i", src, "-filter_complex", g, "-map", "[out]", out]);
    const distinct = (n) => { const x = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", out, "-vf", `format=gray,select='eq(n,${n})',crop=320:2:0:90`, "-frames:v", "1", "-f", "rawvideo", "-"], { maxBuffer: 1 << 20 }); return new Set(x.stdout).size; };
    ok("finish: inside a sharp window the frame is the centre sub-frame (hard edge), outside it the shutter averages (soft edge); frame count unchanged", r.status === 0 && distinct(45) <= 3 && distinct(15) >= 8, `${r.stderr.slice(0, 200)} sharp ${distinct(45)} blurred ${distinct(15)}`);
  }
}

// 20. image generation and presenter films
{
  const ws = path.join(TMP, "presenter-ws");
  const run = path.join(ws, ".rasanai", "r1");
  fs.mkdirSync(path.join(run, "presenter"), { recursive: true });
  const C = (a, e = {}) => spawnSync(process.execPath, [path.join(HERE, "crew.mjs"), ...a], { encoding: "utf8", env: { ...env, ...e }, cwd: ws, timeout: 180000 });
  const J = (r) => { try { return JSON.parse(r.stdout); } catch { return {}; } };
  const plan = J(C(["plan", "--run", run, "--route", "presenter", "--subject", "Founder talk"]));
  const mem = (plan.phases || []).flatMap((p) => p.members).map((m) => m.replace(/ \(.*$/, ""));
  ok("presenter: the crew plans three visual writers, a design system each and no script writer or editor", ["visual-writer:Sure", "visual-writer:Bold", "visual-writer:Wild"].every((m) => mem.includes(m)) && mem.includes("design-system-designer:Bold") && !mem.some((m) => /script-/.test(m)), JSON.stringify(mem));
  ok("presenter: the plan has a phase for the graphics' animators", (plan.phases || []).some((p) => p.phase === "animate-graphics"), JSON.stringify((plan.phases || []).map((p) => p.phase)));
  const br = J(C(["brief", "--run", run, "--role", "visual-writer", "--key", "Bold"], { RASANAI_IMAGEGEN: "off" }));
  const prompt = br.prompt ? fs.readFileSync(path.join(ws, br.prompt), "utf8") : "";
  ok("presenter: a visual writer's brief writes a prompt with the playbook, the beats, the key facts, its output, the check and the show-off ask", /Role: visual writer/.test(prompt) && /references\/presenter\.md/.test(prompt) && /presenter\/beats\.json/.test(prompt) && /presenter\/key\.json/.test(prompt) && /plan-Bold\.json/.test(prompt) && /presenter\.mjs" check/.test(prompt) && /Show off/.test(prompt) && /imagegen\*\*: off/.test(prompt), prompt.slice(0, 300));
  ok("presenter: the writer's brief names the dispatch (Agent call)", /Agent\(/.test(br.dispatch || "") || /codex exec/.test(br.dispatch || ""), String(br.dispatch).slice(0, 120));
  const none = C(["check", "--run", run, "--role", "visual-writer", "--key", "Bold"]);
  ok("presenter: crew check refuses a missing plan (exit 2, names the file)", none.status === 2 && /plan-Bold\.json is missing/.test(none.stdout), none.stdout.slice(0, 200));
  fs.writeFileSync(path.join(run, "presenter", "plan-Bold.json"), "{ not json");
  ok("presenter: crew check refuses a plan that is not JSON", C(["check", "--run", run, "--role", "visual-writer", "--key", "Bold"]).status === 2);
  fs.writeFileSync(path.join(run, "presenter", "plan-Bold.json"), JSON.stringify({ version: 1, beats: [] }));
  ok("presenter: crew check refuses a plan with no beats", C(["check", "--run", run, "--role", "visual-writer", "--key", "Bold"]).status === 2);
  if (fs.existsSync(path.join(HERE, "presenter.mjs"))) {
    fs.writeFileSync(path.join(run, "presenter", "plan-Bold.json"), JSON.stringify({ version: 1, clip: "talk.mp4", aspect: "16:9", angle: "Bold", title: "T", idea: "I", style: { lock: "x", avoid: "text" }, beats: [{ id: "b1", start: 0, end: 4, say: "Hello there.", layout: "presenter-full", plate: { id: "p1", kind: "generated", prompt: "A stunning breathtaking 8k epic masterpiece", camera: "push-in", why: "w" }, graphics: [], transition_in: "cut" }] }));
    const bad = C(["check", "--run", run, "--role", "visual-writer", "--key", "Bold"]);
    ok("presenter: crew check runs presenter.mjs check and refuses a plan with slop words (exit 2)", bad.status === 2 && /presenter\.mjs check says rewrite/.test(bad.stdout), bad.stdout.slice(0, 300));
  } else console.log("note  presenter: presenter.mjs is not there yet, the plan-content check is skipped");

  // the design system gate wants "## Imagery" on a presenter run (and only there)
  const dd = path.join(run, "design", "Bold");
  fs.mkdirSync(dd, { recursive: true });
  fs.writeFileSync(path.join(dd, "DESIGN.md"), "---\nname: T\ncolors:\n  canvas: \"#101010\"\n---\n## Overview\nx\n");
  const g = (cwd) => node("design.mjs", ["check-system", "--dir", cwd, "--offline"]);
  const withP = g(dd);
  ok("presenter: design.mjs check-system requires ## Imagery on a presenter run", /Imagery/.test(withP.stdout), withP.stdout.slice(0, 200));
  fs.writeFileSync(path.join(dd, "DESIGN.md"), fs.readFileSync(path.join(dd, "DESIGN.md"), "utf8") + "\n## Imagery\n35mm photograph, warm tungsten key from frame left, clay and ochre in the light, ink in the shadows, soft grain, shallow depth of field, one calm third of the frame left empty for a person, never text, logos or people looking at camera.\n");
  const withI = g(dd);
  ok("presenter: a 25+ word ## Imagery section satisfies it", !/Imagery/.test(withI.stdout), withI.stdout.slice(0, 200));
  const run2 = path.join(ws, ".rasanai", "r2", "design", "Bold");
  fs.mkdirSync(run2, { recursive: true });
  fs.writeFileSync(path.join(run2, "DESIGN.md"), "---\nname: T\n---\n## Overview\nx\n");
  ok("presenter: other routes do not need ## Imagery", !/Imagery/.test(g(run2).stdout));

  // the scripts' own tests, each with the same helpers; absent files are a note, never a failure
  for (const name of ["imagegen", "presenter", "brandfilm", "motion-gate", "moments", "textfit", "chrome-lint", "frame-gate", "frames", "camera", "lessons", "sound-payoff", "carry", "notes", "variety", "rhythm", "sound-shape", "decisions", "sound-fixes", "gate-fixes", "plumbing", "boldness", "ab-learn", "echo-camera", "ui", "one-memory", "deliver", "orbs", "styles", "preferences", "series", "remote", "regression", "skill-routing", "events", "reads", "custom-style", "stage2d", "original-score", "evidence", "quick-film", "canon3d"]) {
    const f = path.join(HERE, "tests", `${name}.mjs`);
    if (!fs.existsSync(f)) { console.log(`note  ${name}: scripts/tests/${name}.mjs is not there yet, skipped`); continue; }
    try {
      const mod = await import(f);
      await mod.default({ ok, node, tmp: TMP, env });
    } catch (e) {
      ok(`${name}: tests ran`, false, String((e && e.stack) || e).split("\n").slice(0, 4).join(" | "));
    }
  }
}

// 21. the Moves pass: label-only detection, the pack, the inventor's and the juror's gates, the payload, choose / record,
//     the crew's phases and score accounting, and (with Chrome and ffmpeg) a rough rendered from a fixture page
{
  const FX = path.join(HERE, "tests", "fixtures", "moves");
  const ws = path.join(TMP, "moves-ws");
  const run = path.join(ws, ".rasanai", "r1");
  fs.mkdirSync(path.join(run, "story"), { recursive: true });
  const menv = { ...env, RASANAI_MOVES_LIBRARY: path.join(FX, "library") };
  const M = (a, e = {}) => spawnSync(process.execPath, [path.join(HERE, "moves.mjs"), ...a], { encoding: "utf8", env: { ...menv, ...e }, cwd: ws, timeout: 180000 });
  const C = (a) => spawnSync(process.execPath, [path.join(HERE, "crew.mjs"), ...a], { encoding: "utf8", env: menv, cwd: ws, timeout: 180000 });
  const J = (r) => { try { return JSON.parse(r.stdout); } catch { return {}; } };
  const rj = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
  const wj = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o, null, 2)); };
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const { isLabelOnly, validateMoves } = await import(path.join(HERE, "lib", "moves-lib.mjs"));

  // label-only truth table
  const lab = [["match cut to scene 3", true], ["Iris wipe to the next scene", true], ["a smooth zoom transition into the product", true], ["morph", true], ["the o of Your fills orange and grows a pupil", false], ["the status dot swells until it is the Approve button's cap", false]];
  ok("moves: isLabelOnly truth table (a technique name alone is a label; an object doing something is not)", lab.every(([t, want]) => isLabelOnly(t) === want), JSON.stringify(lab.map(([t]) => isLabelOnly(t))));

  const good = rj(path.join(FX, "moves-Bold.good.json"));
  const pitch = rj(path.join(FX, "pitch-Bold.json"));
  const GOOD = path.join(FX, "moves-Bold.good.json"), PITCH = path.join(FX, "pitch-Bold.json");
  const g = M(["check", "--file", GOOD, "--pitch", PITCH, "--product-first"]);
  ok("moves: a good moves file for a 4-beat pitch passes check (exit 0, no errors), also as a product-first film", g.status === 0 && J(g).ok === true && J(g).errors.length === 0, g.stdout.slice(0, 400));
  const bad = (name, mut, re, extra = []) => {
    const o = clone(good);
    mut(o);
    const f = path.join(TMP, `moves-bad-${name.replace(/\W+/g, "-")}.json`);
    wj(f, o);
    const r = M(["check", "--file", f, "--pitch", PITCH, ...extra]);
    ok(`moves: check refuses ${name} (exit 2)`, r.status === 2 && (J(r).errors || []).some((e) => re.test(e)), r.stdout.slice(0, 300));
  };
  const lo = M(["check", "--file", path.join(FX, "moves-Bold.labelonly.json"), "--pitch", PITCH]);
  ok("moves: the label-only fixture fails with 'only a label' on the move and on the bridge (exit 2)", lo.status === 2 && J(lo).errors.filter((e) => /only a label/.test(e)).length === 2, lo.stdout.slice(0, 300));
  bad("a card whose move is a label", (o) => { o.cards[2].move = "match-cut to scene 4"; }, /m3: the move is only a label/);
  bad("a ledger that misses a beat boundary", (o) => { o.ledger.pop(); }, /ledger: 3 rows for 4 beats/);
  bad("a missing bridge at a boundary", (o) => { o.bridges = o.bridges.filter((b) => b.from !== 2); }, /boundary 2>3 has no bridge/);
  bad("5 candidates", (o) => { o.candidates = o.candidates.slice(0, 5); }, /candidates: 5/);
  bad("a missing bolder diff", (o) => { o.bolder.forEach((b) => delete b.changed); }, /bolder: 0 complete rows/);
  bad("a carrier that covers under half the beats", (o) => { o.carrier.beats = [2]; }, /carrier\.beats covers 1 of 4/);
  bad("an empty ledger constant", (o) => { o.ledger[1].constant = ""; }, /ledger row 2: constant is empty/);
  bad("hero ids that are not cards", (o) => { o.heroes = ["m1", "m99"]; }, /"m99" is not a card id/);
  bad("a card that repeats an obvious idea", (o) => { o.cards[4].title = "Match cut to the next scene"; }, /banned obvious idea/);
  bad("a product-first hero whose resolves_to is not a real surface", (o) => { o.cards[0].resolves_to = "a spinning galaxy of light"; }, /resolves_to must be a real UI label/, ["--product-first"]);
  bad("a product-first hero with no resolves_to", (o) => { delete o.cards[0].resolves_to; }, /hero m1: on a product film every hero needs resolves_to/, ["--product-first"]);
  ok("moves: a product-first hero's origin no longer needs a product word (resolves_to carries it)", (() => { const o = clone(good); o.cards[0].origin = "a spinning galaxy of light"; return !validateMoves(o, { beats: pitch.beats, productFirst: true, uiLabels: pitch.ui_labels, productName: pitch.product }).errors.length; })());
  bad("a card without scale", (o) => { delete o.cards[3].scale; }, /m4: missing scale/);
  bad("a card with an unknown scale", (o) => { o.cards[3].scale = "huge"; }, /m4: scale "huge"/);
  bad("no hero that is full-frame (no-full-frame-hero)", (o) => { o.cards[0].scale = "large"; }, /no-full-frame-hero/);
  bad("a full-frame hero with a non type/shape generator (no-full-frame-hero)", (o) => { o.cards[0].generator = "G9"; }, /no-full-frame-hero/);
  bad("a sparse chain (chain-sparse)", (o) => { o.chain = o.chain.slice(0, 6); }, /chain-sparse: chain has 6 entries for a 16 s film \(11 at least/);
  bad("a chain with a gap over 3 s (chain-gap)", (o) => { o.chain[4].t = 5.2; o.chain[5].t = 5.4; }, /chain-gap: \d/);
  bad("a chain that stops 4 s before the end (chain-gap)", (o) => { o.chain = o.chain.map((e, i) => ({ ...e, t: i + 0.5 })); }, /chain-gap/);
  bad("no chain at all", (o) => { delete o.chain; }, /chain-sparse/);
  ok("moves: a hero at scale detail and a mostly-detail set only warn", (() => { const o = clone(good); o.cards[1].scale = "detail"; o.cards[2].scale = "detail"; o.cards[3].scale = "detail"; const r = validateMoves(o, { beats: pitch.beats }); return !r.errors.length && r.warnings.some((w) => /hero m2: scale is "detail"/.test(w)) && r.warnings.some((w) => /more than half/.test(w)); })());
  bad("a product-first card with a conceit word", (o) => { o.cards[4].move = "the badge is hung in a museum case and falls out of its frame"; }, /conceit word "museum"/, ["--product-first"]);
  bad("a hero card without a plain line", (o) => { delete o.cards[0].plain; }, /hero m1: missing plain/);
  bad("a hero plain line over 140 characters", (o) => { o.cards[0].plain = "The dot grows ".repeat(12); }, /hero m1: plain is \d+ characters/);
  bad("a hero plain line with a timing", (o) => { o.cards[0].plain = "At 7.0 to 7.3 the dot turns into the button"; }, /hero m1: plain has a timing/);
  bad("a hero plain line with a pixel size", (o) => { o.cards[1].plain = "The dot grows to 28 px and slides over"; }, /hero m2: plain has a timing/);
  bad("a missing carrier.short", (o) => { delete o.carrier.short; }, /carrier\.short is missing/);
  bad("a missing carrier.family (carrier-family)", (o) => { delete o.carrier.family; }, /carrier-family: carrier\.family is missing/);
  bad("an unknown carrier.family (carrier-family)", (o) => { o.carrier.family = "particle"; }, /carrier-family: carrier\.family "particle" is not one of/);
  ok("moves: a carrier.family that differs from the pack's assigned family is carrier-family; the assigned one passes", validateMoves(good, { beats: pitch.beats, pack: { family: "line" } }).errors.some((e) => /carrier-family: .*"glyph" but your pack assigned "line"/.test(e)) && !validateMoves(good, { beats: pitch.beats, pack: { family: "glyph" } }).errors.length);
  bad("a carrier.short over 8 words", (o) => { o.carrier.short = "the one orange status dot that travels through every single beat"; }, /carrier\.short is 11 words/);
  ok("moves: a non-hero card without plain only warns", (() => { const o = clone(good); delete o.cards[3].plain; const r = validateMoves(o, { beats: pitch.beats }); return !r.errors.some((e) => /plain/.test(e)) && r.warnings.some((w) => /m4: no plain line/.test(w)); })());
  const dup = clone(good); dup.cards[5].generator = dup.cards[4].generator; dup.cards[5].origin = dup.cards[4].origin;
  ok("moves: two cards with the same generator and origin warn (not an error)", validateMoves(dup, { beats: pitch.beats }).warnings.some((w) => /same mechanism/.test(w)));
  // the shows: a beat whose lines carry show rows needs at least one card (card.beat, or a seam touching the beat)
  {
    const shown = pitch.beats.map((b) => ({ ...b, shows: [{ line: b.on_screen || "x", show: "s", built_from: "actor", handoff: "h" }] }));
    const cardBeats = new Set(good.cards.map((c) => Number(c.beat)).filter(Boolean));
    const lone = clone(good); lone.cards.forEach((c) => { c.beat = 1; delete c.seam; });
    const uncarded = validateMoves(lone, { beats: shown }).warnings.filter((w) => /show-uncarded/.test(w));
    ok("moves: show-uncarded warns for each beat with show rows and no card (never an error)", uncarded.length === shown.length - 1 && /beat 2/.test(uncarded[0]) && !validateMoves(lone, { beats: shown }).errors.some((e) => /show-uncarded/.test(e)), JSON.stringify(uncarded) + [...cardBeats]);
    ok("moves: no show-uncarded when the beats carry no shows", !validateMoves(lone, { beats: pitch.beats }).warnings.some((w) => /show-uncarded/.test(w)));
    const every = clone(good); every.cards.forEach((c, i) => { c.beat = (i % shown.length) + 1; delete c.seam; });
    ok("moves: no show-uncarded when every beat has a card", !validateMoves(every, { beats: shown }).warnings.some((w) => /show-uncarded/.test(w)));
  }

  // a ladder film: the heroes are the joins between rungs (no-join-hero); a G6 legible fail is a valid verdict entry
  {
    const ladderBeats = pitch.beats.map((b, i) => ({ ...b, role: ["open", "rung", "rung", "close"][i] }));
    const lad = (o) => validateMoves(o, { beats: ladderBeats, shape: "ladder" });
    ok("moves: a ladder film whose heroes' seams cross a rung boundary passes (m1 2>3 is rung to rung)", !lad(good).errors.some((e) => /no-join-hero/.test(e)), JSON.stringify(lad(good).errors));
    const inDemo = clone(good); inDemo.cards[0].seam = "2>2"; inDemo.cards[1].seam = undefined; inDemo.cards[1].beat = 3;
    ok("moves: a ladder film whose hero seams stay inside a demo or touch no rung is no-join-hero", lad(inDemo).errors.some((e) => /no-join-hero/.test(e)));
    const openClose = clone(good); openClose.cards[0].seam = "1>4"; openClose.cards[1].seam = "4>4";
    ok("moves: a seam between the open and the close crosses no rung boundary (no-join-hero)", lad(openClose).errors.some((e) => /no-join-hero/.test(e)));
    ok("moves: a scenario or untyped film is not held to no-join-hero", !validateMoves(inDemo, { beats: ladderBeats, shape: "scenario" }).errors.some((e) => /no-join-hero/.test(e)) && !validateMoves(inDemo, { beats: pitch.beats }).errors.some((e) => /no-join-hero/.test(e)));
    const { pitchShape } = await import(path.join(HERE, "lib", "moves-lib.mjs"));
    ok("moves: pitchShape reads the explicit shape, else the beat roles", pitchShape({ shape: "ladder" }) === "ladder" && pitchShape({ beats: ladderBeats }) === "ladder" && pitchShape({ feature: { name: "x" }, beats: [] }) === "scenario" && pitchShape({ beats: pitch.beats }) === null);
    const lf = path.join(TMP, "moves-ladder-pitch.json"); wj(lf, { ...pitch, shape: "ladder", beats: ladderBeats });
    wj(path.join(TMP, "moves-ladder-bad.json"), inDemo);
    const cr2 = M(["check", "--file", path.join(TMP, "moves-ladder-bad.json"), "--pitch", lf]);
    ok("moves: moves.mjs check reads the pitch's shape and refuses a ladder with no join hero (exit 2)", cr2.status === 2 && (J(cr2).errors || []).some((e) => /no-join-hero/.test(e)), cr2.stdout.slice(0, 300));
  }

  // the pack: deterministic, reference moves first, product-first takes a choreography constraint, earlier heroes are banned
  const pk = (label, extra = [], e = {}) => { const r = M(["pack", "--run", run, "--label", label, ...extra], e); return { r, f: path.join(run, "story", `moves-pack-${label}.json`) }; };
  const p1 = pk("Bold", ["--seed", "7"]); const t1 = fs.readFileSync(p1.f, "utf8");
  const p2 = pk("Bold", ["--seed", "7"]); const t2 = fs.readFileSync(p2.f, "utf8");
  const pa = JSON.parse(t1);
  ok("moves: pack prints its path, is deterministic for run + label + seed, and has 3 exemplars, all 20 generators, a stimulus and the banned list", p1.r.status === 0 && /moves-pack-Bold\.json/.test(p1.r.stdout) && t1 === t2 && pa.exemplars.length === 3 && pa.generators.length === 20 && new Set(pa.generators.map((x) => x.id)).size === 20 && typeof pa.stimulus === "string" && pa.stimulus_kind === "stimulus" && pa.banned.length >= 2, p1.r.stderr + t1.slice(0, 200));
  ok("moves: the pack carries the house bar first, as its own key (not an exemplar), with the 'the bar, never the content' instruction", pa.bar && pa.bar.id === "fx-house-bar" && /the bar, never the content/.test(pa.bar.instruction) && /never reuse an eye, a pupil, a slit/.test(pa.bar.instruction) && Object.keys(pa)[3] === "bar" && !pa.exemplars.some((x) => x.id === "fx-house-bar") && Array.isArray(pa.bar.ledger), JSON.stringify(Object.keys(pa)));
  const varies = [1, 2, 3, 4, 5, 6].map((n) => { pk("Bold", ["--seed", String(n)]); return fs.readFileSync(p1.f, "utf8"); });
  ok("moves: pack changes with the seed (generator order and exemplars)", new Set(varies).size > 1);
  pk("Wild", ["--seed", "7"]);
  ok("moves: pack differs by label", JSON.stringify(rj(path.join(run, "story", "moves-pack-Wild.json")).generators) !== JSON.stringify(pa.generators));
  const fams = (seed, runDir = run) => ["Sure", "Bold", "Wild"].map((l) => { const r = M(["pack", "--run", runDir, "--label", l, "--seed", String(seed)]); return r.status === 0 ? rj(path.join(runDir, "story", `moves-pack-${l}.json`)) : {}; });
  const famIds = ["glyph", "component", "line", "object", "mark", "data"];
  const f7 = fams(7), f7b = fams(7);
  ok("moves: pack assigns each of the three labels a DIFFERENT carrier family (a known id, with a description and examples), deterministically", new Set(f7.map((p) => p.family)).size === 3 && f7.every((p) => famIds.includes(p.family) && typeof p.family_description === "string" && p.family_description && Array.isArray(p.family_examples) && p.family_examples.length >= 3) && JSON.stringify(f7.map((p) => p.family)) === JSON.stringify(f7b.map((p) => p.family)), JSON.stringify(f7.map((p) => p.family)));
  ok("moves: the three families stay distinct across seeds and runs, and the assignment varies", (() => { const seen = new Set(); for (let n = 1; n <= 12; n++) { const fs3 = fams(n).map((p) => p.family); if (new Set(fs3).size !== 3) return false; seen.add(fs3.join()); } const r2 = path.join(ws, ".rasanai", "r2"); fs.mkdirSync(path.join(r2, "story"), { recursive: true }); for (let n = 1; n <= 4; n++) { const fs3 = fams(n, r2).map((p) => p.family); if (new Set(fs3).size !== 3) return false; seen.add(fs3.join()); } return seen.size > 1; })());
  ok("moves: pack has no brand_motif without a brand film card or DESIGN.md motif", !("brand_motif" in f7[0]));
  const r3 = path.join(ws, ".rasanai", "r3"); fs.mkdirSync(path.join(r3, "brand-film"), { recursive: true });
  wj(path.join(r3, "brand-film", "FILM-STYLE.json"), { motif: "a single dot that becomes rings, a grid, letterforms" });
  const f3 = fams(7, r3);
  ok("moves: a brand film card's motif is noted as brand_motif in every pack (secondary anywhere, carrier only for glyph or mark)", f3.every((p) => /single dot/.test((p.brand_motif || {}).motif || "") && /only the label whose family is glyph or mark/.test(p.brand_motif.rule)), JSON.stringify(f3[0].brand_motif));
  const pf = pk("Bold", ["--seed", "7", "--product-first"]); const pfj = rj(pf.f);
  ok("moves: a product-first pack carries a choreography constraint instead of a stimulus", pfj.stimulus_kind === "choreography" && rj(path.join(FX, "library", "choreography.json")).includes(pfj.stimulus) && !/unverified/.test(JSON.stringify(pfj.exemplars)), pfj.stimulus);
  wj(path.join(run, "research", "reference-moves.json"), [{ id: "ref1", title: "The user's cat-eye clip", move: "a circle becomes a pupil" }]);
  const pr = rj(pk("Bold", ["--seed", "7"]).f);
  ok("moves: reference moves from the user's clip come first among the exemplars", pr.exemplars.length === 3 && pr.exemplars[0].id === "ref1" && pr.exemplars[0].source === "reference" && pr.exemplars.slice(1).every((x) => x.source === "library"), JSON.stringify(pr.exemplars.map((x) => x.id)));
  fs.rmSync(path.join(run, "research", "reference-moves.json"));
  ok("moves: pack without a library fails clearly (exit 1)", (() => { const r = M(["pack", "--run", run, "--label", "Bold"], { RASANAI_MOVES_LIBRARY: path.join(TMP, "no-such-library") }); return r.status === 1 && /moves library file not found/.test(r.stderr); })());

  // the run: three pitches, three moves files, a verdict
  const SHORTS = { Sure: "a receipt photo", Bold: "an orange status dot", Wild: "a ruled progress underline" };
  const packs = Object.fromEntries(["Sure", "Bold", "Wild"].map((l, i) => { M(["pack", "--run", run, "--label", l, "--seed", "7"]); return [l, rj(path.join(run, "story", `moves-pack-${l}.json`))]; }));
  const mvOf = (l) => { const o = { ...clone(good), label: l }; o.carrier.family = packs[l].family; o.carrier.short = SHORTS[l]; return o; };
  for (const l of ["Sure", "Bold", "Wild"]) {
    wj(path.join(run, "story", `pitch-${l}.json`), { ...pitch, label: l });
    wj(path.join(run, "story", `moves-${l}.json`), mvOf(l));
  }
  ok("moves: check refuses a moves file whose carrier.family is not the pack's assigned one (carrier-family, beside the pack)", (() => { const o = mvOf("Bold"); o.carrier.family = famIds.find((x) => x !== packs.Bold.family); const f = path.join(run, "story", "moves-Bold.json"); wj(f, o); const r = M(["check", "--file", f, "--pitch", path.join(run, "story", "pitch-Bold.json")]); wj(f, mvOf("Bold")); return r.status === 2 && J(r).errors.some((e) => /carrier-family: .*pack assigned/.test(e)); })());
  const setOk = M(["check-set", "--run", run]);
  ok("moves: check-set passes three different carrier families and distinct carriers (no warnings)", setOk.status === 0 && J(setOk).ok && J(setOk).warnings.length === 0, setOk.stdout.slice(0, 300));
  const setWith = (mut) => { const keep = ["Sure", "Bold", "Wild"].map((l) => mvOf(l)); const m = keep.map((o) => clone(o)); mut(m); m.forEach((o) => wj(path.join(run, "story", `moves-${o.label}.json`), o)); const r = M(["check-set", "--run", run]); keep.forEach((o) => wj(path.join(run, "story", `moves-${o.label}.json`), o)); return r; };
  const rep = setWith((m) => { m[2].carrier.family = m[0].carrier.family; });
  ok("moves: check-set errors carrier-repeat when two moves files share a carrier family (exit 2)", rep.status === 2 && J(rep).errors.some((e) => /carrier-repeat: Sure and Wild both use/.test(e)), rep.stdout.slice(0, 300));
  const sim = setWith((m) => { m[0].carrier.short = "the orange receipt"; });
  ok("moves: check-set warns carrier-similar (not an error) when two carrier names share a content word", sim.status === 0 && J(sim).warnings.some((w) => /carrier-similar: Sure's .* and Bold's .* share "orange"/.test(w)), sim.stdout.slice(0, 300));
  ok("moves: a shared stopword alone ('the', 'a', 'an') is not carrier-similar", setOk.status === 0 && !J(setOk).warnings.length);
  const chk = C(["check", "--run", run, "--role", "move-inventor", "--key", "Bold"]);
  ok("moves: crew check move-inventor accepts the good file and refuses a bad one", chk.status === 0 && (() => { const o = clone(good); o.candidates = []; wj(path.join(run, "story", "moves-Wild.json"), { ...o, label: "Wild" }); const r = C(["check", "--run", run, "--role", "move-inventor", "--key", "Wild"]); wj(path.join(run, "story", "moves-Wild.json"), mvOf("Wild")); return r.status === 2 && /candidates: 0/.test(r.stdout); })(), chk.stdout.slice(0, 300));
  const ids = good.cards.map((c) => c.id);
  const FRAME = "the dot lands exactly on the Approve button cap";
  const rd2 = (a, b, win, extra = {}) => [{ a, b, first: "a", winner: win[0], frame: FRAME, ...(extra.first || {}) }, { a, b, first: "b", winner: win[1], frame: FRAME, ...(extra.second || {}) }];
  const ROUNDS = [...rd2("m3", "m1", ["m3", "m3"]), ...rd2("m1", "m2", ["m1", "m1"])];
  const verdict = { pitches: Object.fromEntries(["Sure", "Bold", "Wild"].map((l) => [l, { cards: ids.map((id, i) => (i < 3 ? { id, pass: true, fails: [], evidence: `quoted: ${id}` } : { id, pass: false, fails: ["G2"], evidence: "the move is a label" })), ranking: ["m3", "m1", "m2"], rounds: ROUNDS, hero: "m3", why: "the N bar is a letter and a headline at once", denial: [], set: { full_frame: true, evidence: "m1: the dot fills the frame as the Approve cap" } }])), best_overall: { label: "Bold", id: "m3", why: "the bridge frame is concrete" } };
  const vf = path.join(run, "story", "moves-verdict.json");
  wj(vf, verdict);
  const cv = M(["check-verdict", "--run", run]);
  ok("moves: a complete verdict passes check-verdict, also through crew check move-juror", cv.status === 0 && J(cv).ok && C(["check", "--run", run, "--role", "move-juror"]).status === 0, cv.stdout.slice(0, 300));
  const vbad = (name, mut, re) => { const v = clone(verdict); mut(v); wj(vf, v); const r = M(["check-verdict", "--run", run]); wj(vf, verdict); ok(`moves: check-verdict refuses ${name}`, r.status === 2 && (J(r).errors || []).some((e) => re.test(e)), r.stdout.slice(0, 300)); };
  vbad("a ranking with a card that failed", (v) => { v.pitches.Sure.ranking = ["m4", "m1"]; }, /did not pass/);
  vbad("a hero that is not ranking[0]", (v) => { v.pitches.Wild.hero = "m1"; }, /hero must be ranking\[0\]/);
  vbad("a fail with no gate id", (v) => { v.pitches.Bold.cards[4].fails = []; }, /needs at least one gate id/);
  vbad("a card left unjudged", (v) => { v.pitches.Bold.cards.pop(); }, /card m6 was not judged/);
  vbad("a pitch with no set gate", (v) => { delete v.pitches.Sure.set; }, /Sure: set is missing/);
  vbad("set.full_frame false while the label is not in denial", (v) => { v.pitches.Bold.set = { full_frame: false, evidence: "every passing card is a detail inside the UI" }; }, /Bold: set\.full_frame is false.*must be in denial/);
  ok("moves: set.full_frame false is fine when the label is in denial[]", (() => { const v = clone(verdict); v.pitches.Bold.set = { full_frame: false, evidence: "all small" }; v.pitches.Bold.denial = ["Bold"]; wj(vf, v); const r = M(["check-verdict", "--run", run]); wj(vf, verdict); return r.status === 0 && J(r).ok; })());
  ok("moves: a card failed on G6 legible (a puzzle, a move that needs explaining) is a valid verdict entry; an unknown gate G7 is not", (() => { const v = clone(verdict); v.pitches.Bold.cards.find((c) => c.id === "m4").fails = ["G6"]; wj(vf, v); const r = M(["check-verdict", "--run", run]); const v2 = clone(verdict); v2.pitches.Bold.cards.find((c) => c.id === "m4").fails = ["G7"]; wj(vf, v2); const r2 = M(["check-verdict", "--run", run]); wj(vf, verdict); return r.status === 0 && J(r).ok && r2.status === 2 && (J(r2).errors || []).some((e) => /G1 to G6/.test(e)); })());
  vbad("a missing label", (v) => { delete v.pitches.Wild; }, /Wild: missing/);
  // the pairwise rounds: every consecutive pair of the ranking, in both presentation orders
  vbad("no rounds at all (rounds-missing)", (v) => { delete v.pitches.Sure.rounds; }, /Sure: rounds-missing: m3 > m1/);
  vbad("a pair judged in only one presentation order (rounds-missing)", (v) => { v.pitches.Bold.rounds = v.pitches.Bold.rounds.filter((r, i) => i !== 3); }, /Bold: rounds-missing: m1 > m2 needs two rounds in both presentation orders/);
  vbad("two rounds that both show the same card first (rounds-missing)", (v) => { v.pitches.Bold.rounds[1].first = "a"; }, /Bold: rounds-missing: m3 > m1/);
  vbad("the lower-ranked card winning both rounds (rounds-inconsistent)", (v) => { v.pitches.Wild.rounds[2].winner = "m2"; v.pitches.Wild.rounds[3].winner = "m2"; }, /Wild: rounds-inconsistent: m1 > m2: m2 won both rounds/);
  vbad("a round whose winner is not one of the pair (rounds-inconsistent)", (v) => { v.pitches.Sure.rounds[0].winner = "m9"; }, /Sure: rounds-inconsistent: m3 > m1: a round's winner is not one of the pair/);
  vbad("a round frame under 8 words (rounds-frame)", (v) => { v.pitches.Bold.rounds[2].frame = "the dot is nicer"; }, /Bold: rounds-frame: round 3 \(m1 vs m2\)/);
  vbad("a split pair without the riskier tiebreak (rounds-inconsistent)", (v) => { v.pitches.Sure.rounds[1].winner = "m1"; }, /Sure: rounds-inconsistent: m3 > m1: the pair split/);
  vbad("a split pair whose tiebreak names the lower-ranked card as riskier (rounds-inconsistent)", (v) => { v.pitches.Sure.rounds[1].winner = "m1"; v.pitches.Sure.rounds[1].tiebreak = "riskier"; v.pitches.Sure.rounds[1].riskier = "m1"; }, /Sure: rounds-inconsistent: m3 > m1: the tiebreak names m1/);
  ok("moves: a split pair is allowed with tiebreak riskier on the second round and the riskier card ranked higher", (() => { const v = clone(verdict); v.pitches.Sure.rounds[1].winner = "m1"; v.pitches.Sure.rounds[1].tiebreak = "riskier"; v.pitches.Sure.rounds[1].riskier = "m3"; wj(vf, v); const r = M(["check-verdict", "--run", run]); wj(vf, verdict); return r.status === 0 && J(r).ok; })());
  ok("moves: rounds may be recorded in any array order and extra rounds are fine", (() => { const v = clone(verdict); v.pitches.Sure.rounds = [...v.pitches.Sure.rounds].reverse().concat(rd2("m3", "m2", ["m3", "m3"])); wj(vf, v); const r = M(["check-verdict", "--run", run]); wj(vf, verdict); return r.status === 0 && J(r).ok; })());
  ok("moves: check-verdict also carries carrier-repeat from the set check, and crew check move-juror too", (() => { const o = mvOf("Wild"); o.carrier.family = packs.Sure.family; wj(path.join(run, "story", "moves-Wild.json"), o); const r = M(["check-verdict", "--run", run]); const c = C(["check", "--run", run, "--role", "move-juror"]); wj(path.join(run, "story", "moves-Wild.json"), mvOf("Wild")); return r.status === 2 && J(r).errors.some((e) => /carrier-repeat/.test(e)) && c.status === 2 && /carrier-repeat/.test(c.stdout); })());

  // the payload: the carrier and up to 3 moves per story, a move with a rough first, media paths relative to the workspace
  const rd = path.join(run, "story", "moves", "Bold-m1");
  fs.mkdirSync(rd, { recursive: true });
  for (const n of ["rough.mp4", "strip.png", "poster.png"]) fs.writeFileSync(path.join(rd, n), "x");
  const stories = [{ id: "a", angle: "Sure", title: "A" }, { id: "b", angle: "Bold", title: "B" }, { id: "c", angle: "Wild", title: "C" }, { id: "d", angle: "Other", title: "D" }];
  const sf = path.join(run, "story", "stories.json");
  wj(sf, { stories });
  const pl = M(["payload", "--run", run, "--stories", sf]);
  const pj = (() => { try { return JSON.parse(pl.stdout); } catch { return []; } })();
  const bold = pj.find((x) => x.id === "b") || {};
  ok("moves: payload adds carrier and moves[] (max 3, a move with a rough first, one-line text, workspace-relative media, beat 1-based)", pl.status === 0 && pj.length === 4 && bold.carrier === "an orange status dot" && bold.moves.length === 3 && bold.moves[0].id === "m1" && bold.moves[0].video === path.join(".rasanai", "r1", "story", "moves", "Bold-m1", "rough.mp4") && bold.moves[0].strip && bold.moves[0].poster && bold.moves[1].id === "m3" && !bold.moves[1].video && bold.moves[0].beat === 2 && bold.moves.every((m) => m.move.length <= 140 && !/\n/.test(m.move) && m.title && m.says) && !pj[3].moves && !pj[3].carrier, pl.stdout.slice(0, 500));
  ok("moves: payload carries scale per move (m1 full-frame, m3 large)", bold.moves.find((m) => m.id === "m1").scale === "full-frame" && bold.moves.find((m) => m.id === "m3").scale === "large", JSON.stringify(bold.moves.map((m) => [m.id, m.scale])));
  {
    // moves files written before `plain` / `carrier.short`: the payload falls back (says, then a shortened move; the carrier cut at the first comma)
    const old = clone(good); old.label = "Bold"; delete old.carrier.short; old.carrier.what = "the turmeric play triangle from the counter of the logo, carried as cursor, play glyph and playhead";
    old.cards.forEach((c) => delete c.plain); old.cards[0].says = ""; old.cards[0].move = "7.0 to 7.3 the pointer's tail retracts and it rotates +28 degrees back to an upright play triangle, scaling 16 px to 28 px";
    wj(path.join(run, "story", "moves-Bold.json"), old);
    const fb = JSON.parse(M(["payload", "--run", run, "--stories", sf]).stdout).find((x) => x.id === "b");
    ok("moves: payload falls back without plain / carrier.short (carrier cut at the first comma, move = says, else a shortened move with no timings)", fb.carrier === "the turmeric play triangle" && fb.moves.every((m) => m.move && !/\d+(\.\d+)?\s*(to|s\b|px)/.test(m.move)) && fb.moves.some((m) => m.move === "the form becomes the problem it creates"), JSON.stringify(fb.moves.map((m) => m.move)));
    const withPlain = clone(good); withPlain.label = "Bold"; withPlain.cards[0].plain = "A plain line for the chooser."; wj(path.join(run, "story", "moves-Bold.json"), withPlain);
    const wp = JSON.parse(M(["payload", "--run", run, "--stories", sf]).stdout).find((x) => x.id === "b");
    ok("moves: payload uses plain over says and move", wp.moves.some((m) => m.move === "A plain line for the chooser."));
    wj(path.join(run, "story", "moves-Bold.json"), mvOf("Bold"));
  }
  ok("moves: payload keeps the stories untouched otherwise (a story without moves is returned as is)", JSON.stringify(pj[3]) === JSON.stringify(stories[3]));

  // choose and record
  const ch = M(["choose", "--run", run, "--label", "bold"]);
  const mj = fs.existsSync(path.join(run, "story", "moves.json")) ? rj(path.join(run, "story", "moves.json")) : {};
  ok("moves: choose writes story/moves.json with the verdict's ranking and heroes", ch.status === 0 && mj.label === "Bold" && JSON.stringify(mj.heroes) === '["m3","m1","m2"]' && JSON.stringify(mj.ranking) === '["m3","m1","m2"]' && mj.cards.length === 6, ch.stdout + ch.stderr);
  const rc = M(["record", "--run", run]);
  const led = path.join(TMP, "home", "moves-ledger.json");
  const lj = fs.existsSync(led) ? rj(led) : [];
  ok("moves: record appends the chosen heroes {date, run, title, generator, carrier} to the ledger (again: no duplicates)", rc.status === 0 && lj.length === 3 && lj.every((e) => e.date && e.run === "r1" && e.title && e.generator && e.carrier === "an orange dot") && (M(["record", "--run", run]), rj(led).length === 3));
  const after = rj(pk("Bold", ["--seed", "7"]).f);
  ok("moves: the next pack bans the earlier heroes (the last 12 of the ledger)", after.banned.length === rj(path.join(FX, "library", "banned.json")).length + 3 && after.banned.some((b) => /The dot swells into Approve/i.test(b.cliche)), JSON.stringify(after.banned.slice(-3)));

  // the crew: plan order, the roles, briefs, the score accounting
  const plan = J(C(["plan", "--run", run, "--route", "product-launch-video", "--subject", "Tally", "--scenes", "4", "--length", "16"]));
  const phs = (plan.phases || []).map((x) => x.phase);
  const iS = phs.indexOf("story"), iM = phs.indexOf("moves"), iJ = phs.indexOf("moves-jury"), iR = phs.indexOf("moves-roughs"), iE = phs.indexOf("story-edit");
  ok("moves: the plan runs story < moves < moves-jury < moves-roughs < story-edit", iS >= 0 && iS < iM && iM < iJ && iJ < iR && iR < iE, phs.join(","));
  const mem = (n) => (plan.phases.find((x) => x.phase === n) || { members: [] }).members;
  ok("moves: three inventors (Opus-tier), one juror and three sketchers (fast) are dispatched", ["Sure", "Bold", "Wild"].every((l) => mem("moves").some((m) => m.startsWith(`move-inventor:${l} (inherit)`)) && mem("moves-roughs").some((m) => m.startsWith(`move-sketcher:${l} (fast)`))) && mem("moves-jury").length === 1 && /^move-juror \(fast\)/.test(mem("moves-jury")[0]), JSON.stringify([mem("moves"), mem("moves-jury"), mem("moves-roughs")]));
  const noMoves = (route, extra = []) => (J(C(["plan", "--run", (() => { const d = path.join(ws, ".rasanai", `r-${route}${extra.join("")}`); fs.mkdirSync(d, { recursive: true }); return d; })(), "--route", route, "--subject", "x", "--scenes", "4", ...extra])).phases || []).map((x) => x.phase);
  ok("moves: no Moves pass for lean, reels and lyric videos", !noMoves("faceless-explainer", ["--lean"]).includes("moves") && !noMoves("reel").includes("moves") && !noMoves("music-to-video").includes("moves") && noMoves("faceless-explainer").includes("moves"));
  {
    C(["plan", "--run", run, "--route", "product-launch-video", "--subject", "Tally", "--scenes", "4", "--length", "16"]);
    const ib = J(C(["brief", "--run", run, "--role", "move-inventor", "--key", "Bold"]));
    const it = ib.prompt ? fs.readFileSync(path.join(ws, ib.prompt), "utf8") : "";
    ok("moves: the inventor's brief names its pack command, check command, pack and the method, carries product_first and the show-off ask", /moves\.mjs" pack --run \S+ --label Bold --product-first/.test(it) && /moves-pack-Bold\.json/.test(it) && /references\/moves\.md/.test(it) && /product_first/.test(it) && /Do every step of the method/.test(it) && /moves-Bold\.json/.test(it), it.slice(0, 200));
    // the shows: the writer, the inventor and the motion director read the showcases README and two reference films chosen by film kind
    const txt = (role, key) => { const b = J(C(["brief", "--run", run, "--role", role, ...(key ? ["--key", key] : [])])); return b.prompt ? fs.readFileSync(path.join(ws, b.prompt), "utf8") : ""; };
    const showRe = (a, b) => new RegExp(`showcases[\\\\/]README\\.md[\\s\\S]*${a}\\.json[\\s\\S]*${b}\\.json`);
    ok("shows: a launch run's script-writer, move-inventor and motion-director briefs carry the showcases README, sovra-fm-launch and kinso-launch", [txt("script-writer", "Bold"), it, txt("motion-director", "score")].every((t) => showRe("sovra-fm-launch", "kinso-launch").test(t)), txt("script-writer", "Bold").slice(-500));
    const jb = J(C(["brief", "--run", run, "--role", "move-juror"]));
    const sb = J(C(["brief", "--run", run, "--role", "move-sketcher", "--key", "Bold"]));
    const st = sb.prompt ? fs.readFileSync(path.join(ws, sb.prompt), "utf8") : "";
    ok("moves: the juror's brief lists the three moves files and the verdict; the sketcher's names its hero's folder and the render and check commands", /moves-verdict\.json/.test(fs.readFileSync(path.join(ws, jb.prompt), "utf8")) && /Bold-m3/.test(st) && /moves\.mjs" rough --dir/.test(st) && /check-rough/.test(st), st.slice(0, 200));
  }
  // the score accounting: moves.json is there (choose wrote it); a score that ignores it, drops without a reason, or bridges with a label fails
  const sc = path.join(run, "motion", "score.json");
  const score = (moves, seams) => wj(sc, { spine: "s", moves, scenes: [1, 2, 3, 4].map((n) => ({ n, duration: 4 })), seams });
  const msgs = () => { const r = C(["check", "--run", run, "--role", "motion-director", "--key", "score"]); return r.stdout; };
  score([{ id: "m3", status: "used", scene: 1 }], []);
  const t1x = msgs();
  ok("moves: a score that leaves a hero out of score.moves fails with moves-unaccounted (m1 and m2 named)", /moves-unaccounted: hero move m1/.test(t1x) && /moves-unaccounted: hero move m2/.test(t1x) && !/hero move m3/.test(t1x), t1x.slice(0, 200));
  score([{ id: "m3", status: "used", scene: 1 }, { id: "m1", status: "dropped", scene: 2 }, { id: "m2", status: "dropped", scene: 3, why: "the cursor lives in the demo scene only" }], []);
  const t2x = msgs();
  ok("moves: a dropped hero needs a why of 12+ characters", /hero move m1 is dropped without a why/.test(t2x) && !/hero move m2 is dropped/.test(t2x), t2x.slice(0, 200));
  const hand = { x: 0, y: 0, scale: 1, opacity: 1, direction: 0, speed: 0 };
  const seamsOf = (bridge) => [{ from: 1, to: 2, kind: "match-cut", element: "dot", out: hand, in: hand, why: "w", ...(bridge ? { bridge } : {}) }, { from: 2, to: 3, kind: "cut" }, { from: 3, to: 4, kind: "cut" }];
  const full = [{ id: "m3", status: "used", scene: 1 }, { id: "m1", status: "used", scene: 2, seam: "2>3" }, { id: "m2", status: "used", scene: 3 }];
  score(full, seamsOf("iris wipe to the next scene"));
  ok("moves: a continuity seam whose bridge is a label fails with seam-label-bridge", /seam-label-bridge: seam 1>2/.test(msgs()));
  score(full, seamsOf(""));
  const t4 = C(["check", "--run", run, "--role", "motion-director", "--key", "score"]);
  ok("moves: a continuity seam with no bridge is a warning (seam-no-bridge), not an error", /seam-no-bridge/.test(J(t4).warnings.join("|")) && !/seam-no-bridge|moves-/.test((J(t4).problems || []).join("|")));
  score(full, seamsOf("at 0.8 s the orange dot is both the toolbar status dot and the headline bar's left end"));
  const t5 = msgs();
  ok("moves: a used hero, accounted for, and a concrete bridge raise no moves error", !/moves-|seam-label-bridge/.test(t5), t5.slice(0, 300));
  // the direct path (45 s or less): the same Moves phases are planned, and the one film builder gets the carrier and the hero cards
  ok("moves: the direct path (a 16 s film, ONE film builder) plans the moves phases between the story and the editor", !phs.includes("animate") && !phs.includes("lead") && mem("story").length === 3 && mem("moves").length === 3 && mem("moves-roughs").length === 3 && mem("moves-jury").length === 1 && (plan.phases.find((x) => x.phase === "score") || {}).members.some((m) => m.startsWith("motion-director:score")) && mem("build").some((m) => m.startsWith("film-builder:film")), JSON.stringify([plan.direct, phs]));
  {
    const fb = J(C(["brief", "--run", run, "--role", "film-builder", "--key", "film", "--project", "videos/tally"]));
    const ft = fb.prompt ? fs.readFileSync(path.join(ws, fb.prompt), "utf8") : "";
    ok("moves: the film builder's brief carries story/moves.json, the carrier it builds and every used hero card as its motion target", /story\/moves\.json/.test(ft) && /Your motion target \(the Moves pass\)/.test(ft) && /the carrier you build/.test(ft) && /"id": "m3"/.test(ft) && /"id": "m1"/.test(ft) && /"id": "m2"/.test(ft), ft.slice(0, 300));
  }
  fs.renameSync(path.join(run, "story", "moves.json"), path.join(run, "story", "moves.off"));
  score([], seamsOf("iris wipe to the next scene"));
  ok("moves: without story/moves.json the score check is unchanged (no moves error, no bridge check)", !/moves-|seam-label-bridge|seam-no-bridge/.test(msgs()));
  fs.renameSync(path.join(run, "story", "moves.off"), path.join(run, "story", "moves.json"));
  // the animator's brief: the card and its rough are its motion target
  if (fs.existsSync(path.join(HERE, "..", "agents", "scene-animator.md"))) {
    const proj = path.join(ws, "videos", "t");
    fs.mkdirSync(path.join(proj, ".hyperframes", "frame-packets"), { recursive: true });
    score(full, seamsOf("at 0.8 s the orange dot is both the toolbar status dot and the headline bar's left end"));
    const ab = J(C(["brief", "--run", run, "--role", "scene-animator", "--key", "2", "--project", proj]));
    const at = ab.prompt ? fs.readFileSync(path.join(ws, ab.prompt), "utf8") : "";
    ok("moves: a scene-animator brief inlines the move card placed in its scene and the rough's paths (its motion target)", /Your motion target/.test(at) && /"id": "m1"/.test(at) && /Bold-m1\/rough\.mp4/.test(at) && !/"id": "m2"/.test(at), at.slice(-300));
  }

  // a rough rendered for real (headless Chrome and ffmpeg; skipped with a note when either is missing)
  const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0 && spawnSync("ffprobe", ["-version"]).status === 0;
  const hasChrome = spawnSync(process.execPath, ["-e", `import(${JSON.stringify(path.join(HERE, "lib", "common.mjs"))}).then((m)=>m.chromePath())`], { env: menv }).status === 0;
  if (!hasFfmpeg || !hasChrome) console.log(`skip  moves rough render (${!hasFfmpeg ? "no ffmpeg" : "no Chrome"})`);
  else {
    const rdir = path.join(run, "story", "moves", "Bold-m3");
    fs.mkdirSync(rdir, { recursive: true });
    fs.copyFileSync(path.join(FX, "rough", "rough.html"), path.join(rdir, "rough.html"));
    const pre = M(["check-rough", "--dir", rdir]);
    ok("moves: check-rough refuses a folder with only rough.html (the render is missing)", pre.status === 2 && /rough\.mp4 is missing/.test(pre.stdout));
    const rr = M(["rough", "--dir", rdir]);
    const rrj = J(rr);
    ok("moves: rough renders rough.mp4, strip.png and poster.png from a fixture page (1280x720, 2.4 s, 15 fps, H.264 yuv420p)", rr.status === 0 && rrj.ok && ["rough.mp4", "strip.png", "poster.png"].every((n) => fs.existsSync(path.join(rdir, n)) && fs.statSync(path.join(rdir, n)).size > 1000) && rrj.size === "1280x720" && rrj.duration === 2.4, rr.stdout.slice(0, 300) + rr.stderr.slice(0, 300));
    const probe = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name,pix_fmt,width,height", "-of", "csv=p=0", path.join(rdir, "rough.mp4")], { encoding: "utf8" }).stdout.trim();
    ok("moves: the rough is H.264 in yuv420p", /^h264,1280,720,yuv420p/.test(probe), probe);
    const cr = M(["check-rough", "--dir", rdir]);
    ok("moves: check-rough accepts it (right length, frames differ) and the crew's move-sketcher check agrees", cr.status === 0 && J(cr).motion.max > 1 && C(["check", "--run", run, "--role", "move-sketcher", "--key", "Bold"]).status === 0, cr.stdout.slice(0, 300));
    // the poster is the frame at the bridge (1.4 s): the dot is big there, not at the start
    const frameGray = (f) => spawnSync("ffmpeg", ["-v", "error", "-i", f, "-vf", "scale=64:36,format=gray", "-f", "rawvideo", "-"], { maxBuffer: 1 << 24 }).stdout;
    const still = (t) => spawnSync("ffmpeg", ["-v", "error", "-ss", String(t), "-i", path.join(rdir, "rough.mp4"), "-frames:v", "1", "-vf", "scale=64:36,format=gray", "-f", "rawvideo", "-"], { maxBuffer: 1 << 24 }).stdout;
    const dark = (b) => b.reduce((a, v) => a + (v < 200 ? 1 : 0), 0);
    ok("moves: the strip shows motion and the poster is the bridge frame (the carrier is large there)", dark(frameGray(path.join(rdir, "poster.png"))) > dark(still(0)) * 3, `${dark(frameGray(path.join(rdir, "poster.png")))} vs ${dark(still(0))}`);
    // a blank page and a page without the contract
    const bdir = path.join(run, "story", "moves", "Wild-x");
    fs.mkdirSync(bdir, { recursive: true });
    fs.writeFileSync(path.join(bdir, "rough.html"), "<html><body style='background:#fff'><script>window.__move={tl:{seek(){},pause(){},duration(){return 2}},duration:2}</script></body></html>");
    const br = M(["rough", "--dir", bdir]);
    const bc = M(["check-rough", "--dir", bdir]);
    ok("moves: a rough that never moves renders but check-rough calls it blank or still (exit 2)", br.status === 0 && bc.status === 2 && /blank|still/.test(bc.stdout), br.stdout.slice(0, 200) + bc.stdout.slice(0, 200));
    fs.writeFileSync(path.join(bdir, "rough.html"), "<html><body>no contract</body></html>");
    const nc = M(["rough", "--dir", bdir]);
    ok("moves: a page without window.__move is refused with the contract named (exit 2)", nc.status === 2 && /window\.__move/.test(nc.stdout), nc.stdout.slice(0, 200));
    fs.writeFileSync(path.join(bdir, "rough.html"), "<html><body><script>var tl=gsap.timeline({paused:true});tl.to('body',{x:1,duration:9});window.__move={tl:tl,duration:9}</script></body></html>");
    const lg = M(["rough", "--dir", bdir]);
    ok("moves: a rough longer than 4.5 s is refused (exit 2)", lg.status === 2 && /1\.5 to 4\.5 s/.test(lg.stdout), lg.stdout.slice(0, 200));
  }
}

// 22. motion grammars: the CLI, the score's grammar rules, the builders' briefs (the design desk's grammar.json gate is in 18)
{
  const GFX = path.join(HERE, "tests", "fixtures", "grammars");
  const genv = { ...env, RASANAI_GRAMMAR_LIBRARY: GFX };
  const ws = path.join(TMP, "gram-ws");
  const run = path.join(ws, ".rasanai", "r1");
  fs.mkdirSync(path.join(run, "story"), { recursive: true });
  const GM = (a, e = {}) => spawnSync(process.execPath, [path.join(HERE, "grammar.mjs"), ...a], { encoding: "utf8", env: { ...genv, ...e }, cwd: ws, timeout: 60000 });
  const C = (a, e = {}) => spawnSync(process.execPath, [path.join(HERE, "crew.mjs"), ...a], { encoding: "utf8", env: { ...genv, ...e }, cwd: ws, timeout: 120000 });
  const J = (r) => { try { return JSON.parse(r.stdout); } catch { return {}; } };
  const rj = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
  const wj = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o, null, 2)); };
  const AG = path.join(GFX, "alpha-grid.json");

  const ls = J(GM(["list"]));
  ok("grammar: list names the library's grammars with flat_ok, fits and the technique count", ls.grammars && ls.grammars.length === 3 && ls.grammars.every((g) => g.id && typeof g.flat_ok === "boolean" && g.techniques >= 8), JSON.stringify(ls).slice(0, 200));
  const sh = J(GM(["show", "beta-glow"]));
  ok("grammar: show prints the whole grammar; an unknown id exits 1", sh.id === "beta-glow" && sh.techniques.length === 9 && sh.flat_ok === false && GM(["show", "nope"]).status === 1);
  ok("grammar: with no library folder, list is empty and pick says so (exit 1)", J(GM(["list"], { RASANAI_GRAMMAR_LIBRARY: path.join(TMP, "none") })).grammars.length === 0 && GM(["pick", "--run", run], { RASANAI_GRAMMAR_LIBRARY: path.join(TMP, "none") }).status === 1);
  // the schema
  const chk = (mut) => { const o = rj(AG); mut(o); const f = path.join(TMP, `gram-${Math.random().toString(36).slice(2)}.json`); wj(f, o); return GM(["check", "--file", f]); };
  ok("grammar: check passes a good grammar (exit 0)", GM(["check", "--file", AG]).status === 0);
  const bads = [["no ground_motion", (o) => { delete o.ground_motion; }, /ground_motion/], ["no word-choreo technique", (o) => { o.techniques = o.techniques.filter((t) => t.id !== "word-choreo"); }, /word-choreo/], ["no flat_ok", (o) => { delete o.flat_ok; }, /flat_ok/], ["5 techniques", (o) => { o.techniques = o.techniques.slice(0, 5); }, /techniques has 5/], ["a duplicate technique id", (o) => { o.techniques[1].id = o.techniques[0].id; }, /duplicate technique id/], ["a technique with no build route", (o) => { delete o.techniques[2].route; }, /route is missing/], ["no frame_device.moves", (o) => { delete o.frame_device.moves; }, /frame_device\.moves/], ["a non-kebab id", (o) => { o.id = "Alpha Grid"; }, /kebab-case/], ["no palette accent", (o) => { delete o.palette.accent; }, /palette\.accent/], ["no density", (o) => { delete o.density; }, /density\.change_every_s/], ["no do list", (o) => { o.do = []; }, /do needs/]];
  ok("grammar: check refuses " + bads.map((b) => b[0]).join(", ") + " (exit 2, the field named)", bads.every(([, m, re]) => { const r = chk(m); return r.status === 2 && (J(r).errors || []).some((e) => re.test(e)); }));
  // pick: story shape, flat, exclude, count, deterministic
  wj(path.join(run, "decisions.json"), { subject: "Tally", route: "product-launch-video" });
  const p1 = J(GM(["pick", "--run", run, "--count", "3"]));
  ok("grammar: pick ranks the grammars that fit a launch ladder first, with a why", p1.picks.length === 3 && p1.picks[0].score >= 1 && p1.picks[2].id === "gamma-dots" && /launch ladder/.test(p1.picks[0].why) && JSON.stringify(J(GM(["pick", "--run", run, "--count", "3"]))) === JSON.stringify(p1), JSON.stringify(p1).slice(0, 300));
  const p2 = J(GM(["pick", "--run", run, "--flat"]));
  ok("grammar: pick --flat drops the grammars that need glow or 3D (flat_ok false) and says which", p2.flat === true && p2.picks.every((x) => x.flat_ok) && !p2.picks.some((x) => x.id === "beta-glow") && p2.dropped_not_flat.includes("beta-glow"), JSON.stringify(p2).slice(0, 300));
  const p3 = J(GM(["pick", "--run", run, "--exclude", "alpha-grid,gamma-dots", "--count", "1"]));
  ok("grammar: pick --exclude and --count narrow the suggestions", p3.picks.length === 1 && p3.picks[0].id === "beta-glow");
  wj(path.join(run, "brand-film", "FILM-STYLE.json"), { slots: { motionVocabulary: "flat: no 3D, no blur", typefaces: "x" } });
  ok("grammar: pick turns --flat on by itself when the run's FILM-STYLE card says flat", J(GM(["pick", "--run", run])).flat === true);
  fs.rmSync(path.join(run, "brand-film"), { recursive: true, force: true });
  // write: into look/, with a label, with --out; the brand palette overrides, the devices stay
  const w = GM(["write", "--run", run, "--id", "alpha-grid"]);
  const lg = fs.existsSync(path.join(run, "look", "grammar.json")) ? rj(path.join(run, "look", "grammar.json")) : {};
  ok("grammar: write copies the grammar to look/grammar.json (no internal fields), palette unchanged without a brand", w.status === 0 && lg.id === "alpha-grid" && lg.palette.accent === "#d4392b" && !("_file" in lg) && GM(["check", "--file", path.join(run, "look", "grammar.json")]).status === 0);
  const w2 = GM(["write", "--run", run, "--id", "beta-glow", "--label", "Bold"]);
  const w3 = GM(["write", "--run", run, "--id", "beta-glow", "--out", path.join(TMP, "gram-out", "g.json")]);
  ok("grammar: write --label goes to design/<label>/grammar.json, --out to the path; an unknown id exits 1", w2.status === 0 && fs.existsSync(path.join(run, "design", "Bold", "grammar.json")) && w3.status === 0 && fs.existsSync(path.join(TMP, "gram-out", "g.json")) && GM(["write", "--run", run, "--id", "nope"]).status === 1);
  const brandMd2 = path.join(TMP, "gram-brand.md");
  fs.writeFileSync(brandMd2, '---\nname: "Tally"\ncolors:\n  canvas: "#ffffff"\n  ink: "#101010"\n  accent: "#0a7d4b"\ntypography:\n  display:\n    fontFamily: Manrope\n    fontWeight: 700\n  body:\n    fontFamily: Manrope\n    fontWeight: 400\nrounded:\n  md: 8px\n---\n## Overview\nTally.\n');
  const w4 = J(GM(["write", "--run", run, "--id", "alpha-grid", "--brand", brandMd2, "--out", path.join(TMP, "gram-out", "b.json")]));
  const bg = rj(path.join(TMP, "gram-out", "b.json"));
  ok("grammar: write merges a brand DESIGN.md: its canvas, ink and accent replace the palette, the frame device and techniques stay", w4.ok && bg.palette.ground === "#ffffff" && bg.palette.accent === "#0a7d4b" && /overrides/.test(bg.palette.note) && JSON.stringify(bg.techniques) === JSON.stringify(rj(AG).techniques) && JSON.stringify(bg.frame_device) === JSON.stringify(rj(AG).frame_device), JSON.stringify(w4));
  wj(path.join(run, "decisions.json"), { subject: "Tally", route: "product-launch-video", brand: brandMd2, use_brand: true });
  GM(["write", "--run", run, "--id", "alpha-grid"]);
  ok("grammar: write finds the brand in the run's decisions.json", rj(path.join(run, "look", "grammar.json")).palette.accent === "#0a7d4b");
  fs.rmSync(path.join(run, "decisions.json"), { force: true });
  GM(["write", "--run", run, "--id", "alpha-grid"]);

  // the score's grammar rules (crew check): grammar-missing, technique-unknown, technique-thin (a one-trick film), frame-device-missing
  const sc = path.join(run, "motion", "score.json");
  const fd = "the rules re-divide to frame the product";
  const beats = (techs, dev = fd) => techs.map((t, i) => ({ n: i + 1, duration: 4, ...(t ? { technique: t } : {}), ...(dev ? { frame_device: dev } : {}) }));
  const score = (o) => wj(sc, { spine: "s", seams: [], ...o });
  const out = () => { const r = C(["check", "--run", run, "--role", "motion-director", "--key", "score"]); return { p: (J(r).problems || []).join(" | "), w: (J(r).warnings || []).join(" | ") }; };
  const six = ["grid-a", "grid-b", "grid-c", "grid-d", "grid-e", "grid-f"];
  score({ grammar: "alpha-grid", scenes: beats(six) });
  let r0 = out();
  ok("grammar (score): a score that names the grammar, a distinct technique and a frame_device per beat raises no grammar error or warning", !/grammar-|technique-|frame-device-/.test(r0.p + r0.w), (r0.p + r0.w).slice(0, 400));
  score({ scenes: beats(six) });
  r0 = out();
  ok("grammar (score): no score.grammar is grammar-missing (error)", /grammar-missing: score\.grammar is not set/.test(r0.p), r0.p.slice(0, 300));
  score({ grammar: "alpha-grid", scenes: beats(["grid-a", "grid-zz", "grid-c", "", "grid-e", "grid-f"]) });
  r0 = out();
  ok("grammar (score): a technique that is not in the grammar, or none, is technique-unknown (scene named)", /technique-unknown: scene 2 technique "grid-zz"/.test(r0.p) && /technique-unknown: scene 4 names no technique/.test(r0.p), r0.p.slice(0, 400));
  score({ grammar: "alpha-grid", scenes: beats(["grid-a", "grid-b", "grid-b", "grid-d", "grid-e", "grid-f"]) });
  r0 = out();
  ok("grammar (score): the same technique on consecutive beats is allowed (a refrain): no technique-repeat, no error", !/technique-repeat/.test(r0.p + r0.w) && !/technique-/.test(r0.p), (r0.p + r0.w).slice(0, 300));
  score({ grammar: "alpha-grid", scenes: beats(["grid-a", "grid-b", "grid-a", "grid-b", "grid-a", "grid-b"]) });
  r0 = out();
  ok("grammar (score): a film of 4+ beats that spends 2 or fewer distinct techniques is a warning (technique-thin), never an error", /technique-thin: 2 distinct/.test(r0.w) && !/technique-thin/.test(r0.p), r0.w.slice(0, 300));
  score({ grammar: "alpha-grid", scenes: beats(["grid-a", "grid-b", "grid-c"]) });
  ok("grammar (score): a 3-beat film never warns technique-thin (the floor starts at 4 beats)", !/technique-thin/.test(out().w));
  score({ grammar: "alpha-grid", scenes: beats(six).map((s, i) => (i === 2 ? { ...s, frame_device: "" } : s)) });
  r0 = out();
  ok("grammar (score): a beat without frame_device is frame-device-missing (error)", /frame-device-missing: scene 3/.test(r0.p), r0.p.slice(0, 300));
  score({ grammar: "beta-glow", scenes: beats(six) });
  ok("grammar (score): score.grammar that is not the file's id is a warning", /score\.grammar is "beta-glow" but look\/grammar\.json is "alpha-grid"/.test(out().w));
  fs.writeFileSync(path.join(run, "look", "grammar.json"), "{ nope");
  score({ grammar: "alpha-grid", scenes: beats(six) });
  ok("grammar (score): a look/grammar.json that is not JSON is an error (grammar-invalid)", /grammar-invalid/.test(out().p));
  fs.rmSync(path.join(run, "look", "grammar.json"));
  score({ scenes: beats([null, null, null, null, null, null], "") });
  r0 = out();
  ok("grammar (score): with no look/grammar.json there are no grammar errors at all (back-compat)", !/grammar-|technique-|frame-device-/.test(r0.p + r0.w), (r0.p + r0.w).slice(0, 300));

  // SPEC 8: continuity, a living ground, brand recurrence, video UI, type rhythm, signal colour (all warnings)
  {
    fs.writeFileSync(path.join(run, "decisions.json"), JSON.stringify({ route: "product-launch-video", subject: "Tally" }));
    const shotsOf = (moves, on = "the inbox screen") => [{ t0: 0, t1: 5, on_screen: on, moves, primary: "the screen" }];
    const mk = (i, over = {}) => ({ n: i + 1, id: `s${i + 1}`, duration: 5, picture: "the inbox UI on screen", line: "Mail is slow", shots: shotsOf("the cursor moves to the button and clicks"), ...over });
    const seamsOf = (n, extra = {}) => Array.from({ length: n - 1 }, (_, i) => ({ from: i + 1, to: i + 2, kind: "cut", why: "the next beat", ...extra }));
    const bad = (over = {}) => ({ brand: "Tally", scenes: Array.from({ length: 6 }, (_, i) => mk(i)), seams: seamsOf(6), lines_type: [30, 31, 29], ...over });
    score(bad());
    let q = out();
    const names = ["no-overlap", "no-living-ground", "brand-once", "ui-unstaged", "cursor-led", "type-rhythm-flat", "no-accent-signal"];
    ok("score (SPEC 8): a 30 s launch score with sequential seams, no ground motion, one flat type size, no accent, a cursor-driven unstaged UI and no brand mid-film raises every continuity warning", names.every((n) => new RegExp(`${n}:`).test(q.w)) && !names.some((n) => new RegExp(`${n}:`).test(q.p)), q.w.slice(0, 600));
    const good = () => ({
      brand: "Tally", ground_motion: "the gradient ground drifts all the time", accent: { colour: "#d4392b", marks: "the key word and the dot" }, lines_type: [18, 40, 120, 18],
      scenes: Array.from({ length: 6 }, (_, i) => mk(i, { line: i === 1 || i === 4 ? "Tally finds it" : "Mail is slow", shots: shotsOf("the card builds, rows stage in, then the highlight steps down the rows") })),
      seams: seamsOf(6, { overlap_s: 0.4 }),
    });
    score(good());
    q = out();
    ok("score (SPEC 8): overlapping seams, ground_motion, accent, rhythmic type, the brand in two beats and a staged product that acts raise none of them", !names.some((n) => new RegExp(`${n}:`).test(q.w + q.p)), q.w.slice(0, 500));
    score({ ...good(), seams: seamsOf(6, { out_leaves: 0.3, in_arrives: 0.5 }) });
    ok("score (SPEC 8): a seam's in_arrives after out_leaves is no-overlap; in_arrives before it is not", /no-overlap: seams? 1>2/.test(out().w));
    score({ ...good(), seams: seamsOf(6, { out_leaves: 0.3, in_arrives: -0.2 }) });
    ok("score (SPEC 8): in_arrives before out_leaves is overlap", !/no-overlap/.test(out().w));
    const short = (o) => ({ ...o, scenes: o.scenes.map((x) => ({ ...x, duration: 2, shots: [{ ...x.shots[0], t1: 2 }] })) });
    const { ground_motion: _gm, ...noGm } = bad();
    score(short(bad()));
    ok("score (SPEC 8): no-living-ground and brand-once apply only to films long enough (a 12 s score raises neither)", !/no-living-ground|brand-once/.test(out().w));
    score({ ...good(), breaths: [[1, 2.5], [3, 3.5], [4, 4.5]] });
    ok("score (SPEC 8): more than two breaths, or one over 1 s, is breaths-invalid", /breaths-invalid/.test(out().w));
    score({ ...good(), breaths: [[1, 1.8]] });
    ok("score (SPEC 8): one declared breath under 1 s is fine", !/breaths-invalid/.test(out().w));
    fs.rmSync(path.join(run, "decisions.json"), { force: true });
  }

  // the builders' briefs: the grammar file is an input; the film builder and the animator get the techniques the score names inlined
  GM(["write", "--run", run, "--id", "alpha-grid"]);
  C(["plan", "--run", run, "--route", "product-launch-video", "--subject", "Tally", "--scenes", "4", "--length", "16"]);
  const proj = path.join(ws, "videos", "t");
  fs.mkdirSync(path.join(proj, ".hyperframes", "frame-packets"), { recursive: true });
  score({ grammar: "alpha-grid", scenes: beats(["grid-c", "grid-f", "grid-a", "grid-h"], "rules slide to frame the screen") });
  const brief = (role, key, extra = [], e = {}) => { const b = J(C(["brief", "--run", run, "--role", role, "--key", key, ...extra], e)); return b.prompt ? fs.readFileSync(path.join(ws, b.prompt), "utf8") : ""; };
  const fbt = brief("film-builder", "film", ["--project", "videos/t"]);
  ok("grammar (brief): the film builder gets look/grammar.json as an input and the named techniques (and only those) with their routes inlined", /motion grammar \(the film's ONE grammar/.test(fbt) && /## The film's motion grammar/.test(fbt) && ["grid-c", "grid-f", "grid-a", "grid-h"].every((t) => fbt.includes(`"id": "${t}"`)) && !fbt.includes('"id": "grid-b"') && /GSAP on absolutely positioned divs: grid-c/.test(fbt), fbt.slice(-300));
  const abt = brief("scene-animator", "2", ["--project", "videos/t"]);
  ok("grammar (brief): a scene animator gets its beat's technique and frame_device, not the other beats' techniques", /## The film's motion grammar/.test(abt) && abt.includes('"id": "grid-f"') && !abt.includes('"id": "grid-c"') && /rules slide to frame the screen/.test(abt), abt.slice(-300));
  const mdt = brief("motion-director", "score");
  ok("grammar (brief): the Motion Director's brief names the grammar rules (score.grammar, technique, frame_device) and its input", /look\/grammar\.json/.test(mdt) && /technique-thin/.test(mdt) && !/technique-repeat/.test(mdt) && /frame_device/.test(mdt), mdt.slice(0, 200));
  const dst = brief("design-system-designer", "Bold");
  ok("grammar (brief): the design system designer is told to bind ONE grammar per look (design/Bold/grammar.json, three different grammars, the moving specimen)", /design\/Bold\/grammar\.json/.test(dst) && /three different grammars/.test(dst) && /grammar\.mjs/.test(dst) && /window\.__specimen/.test(dst), dst.slice(0, 200));
  const mit = brief("move-inventor", "Bold");
  ok("grammar (brief): the move inventor reads the grammar when the run has one", /motion grammar \(the film's one grammar/.test(mit));
  fs.rmSync(path.join(run, "look", "grammar.json"));
  ok("grammar (brief): with no grammar file the builders' and the designer's briefs are unchanged (no grammar section, no grammar output)", !/## The film's motion grammar|motion grammar \((?:THE|the) film/i.test(brief("film-builder", "film", ["--project", "videos/t"]) + brief("scene-animator", "2", ["--project", "videos/t"]) + brief("motion-director", "score")) && !/design\/Bold\/grammar\.json/.test(brief("design-system-designer", "Bold", [], { RASANAI_GRAMMAR_LIBRARY: path.join(TMP, "none") })));
}

// shape: the RasanShape kit (runtime, flubber licence, install, check, the demo page headless, the character language)
{
  const RT = path.join(HERE, "..", "runtime");
  ok("shape: the runtime and vendored flubber ship with its MIT licence", fs.existsSync(path.join(RT, "rasan-shape.js")) && fs.existsSync(path.join(RT, "vendor", "flubber.min.js")) && /MIT License/.test(fs.readFileSync(path.join(RT, "vendor", "FLUBBER-LICENSE.txt"), "utf8")) && /Noah Veltman/.test(fs.readFileSync(path.join(RT, "vendor", "FLUBBER-LICENSE.txt"), "utf8")));
  const sp = path.join(TMP, "shape-proj");
  fs.mkdirSync(path.join(sp, "compositions"), { recursive: true });
  fs.writeFileSync(path.join(sp, "compositions", "a.html"), `<template><script src="gsap.min.js"></script><script>const tl=gsap.timeline({paused:true});RasanShape.morph(tl,"#p","#q",{at:0});window.__timelines.a=tl</script></template>`);
  const sc0 = node("shape.mjs", ["check", "--project", sp, "--json"]);
  ok("shape (check): a composition that calls RasanShape without the runtime fails (runtime-missing, runtime-not-loaded, flubber-missing)", sc0.status === 2 && /runtime-missing/.test(sc0.stdout) && /flubber-missing/.test(sc0.stdout), sc0.stdout.slice(0, 300));
  const si = node("shape.mjs", ["install", "--project", sp]);
  ok("shape (install): copies rasan-shape.js, flubber.min.js and the licence into assets/rasan-shape/", si.status === 0 && ["rasan-shape.js", "flubber.min.js", "LICENSE-flubber.txt"].every((f) => fs.existsSync(path.join(sp, "assets", "rasan-shape", f))), si.stderr);
  fs.writeFileSync(path.join(sp, "compositions", "a.html"), `<template><script src="gsap.min.js"></script><script src="../assets/rasan-shape/flubber.min.js"></script><script src="../assets/rasan-shape/rasan-shape.js"></script><script>const tl=gsap.timeline({paused:true});RasanShape.morph(tl,"#p","#q",{at:0});window.__timelines.a=tl</script></template>`);
  const sc1 = node("shape.mjs", ["check", "--project", sp]);
  ok("shape (check): with the runtime installed and loaded after GSAP the composition is clean", sc1.status === 0, sc1.stdout);
  fs.writeFileSync(path.join(sp, "compositions", "b.js"), `RasanShape.scatter(tl, chars, { seed: Math.random() })`);
  const sc2 = node("shape.mjs", ["check", "--project", sp]);
  ok("shape (check): Math.random next to a RasanShape call is an error", sc2.status === 2 && /nondeterministic/.test(sc2.stdout));
  // the character motion language: written, accepted by obey (back.out, small elastic, steps, short smear tweens), and still catches a fade-up-slide
  const cd = path.join(TMP, "shape-char");
  fs.mkdirSync(cd, { recursive: true });
  node("motion-md.mjs", ["write", "--language", "character", "--out", path.join(cd, "motion.md")]);
  fs.writeFileSync(path.join(cd, "index.html"), `<html><head>${gsap}</head><body><div id="root" data-composition-id="m"><div id="a">A</div><div id="b">B</div></div><script>const tl=gsap.timeline({paused:true});
tl.from("#a",{scale:0.4,duration:0.28,ease:"back.out(1.4)"},0);tl.to("#a",{scaleX:1.2,duration:0.08,ease:"power2.out"},0.5);tl.to("#b",{x:200,duration:0.45,ease:"steps(6)"},0.2);tl.to("#b",{rotation:8,duration:0.45,ease:"elastic.out(0.8,0.5)"},0.9);window.__timelines["m"]=tl;tl.seek(0);</script></body></html>`);
  const co = node("obey.mjs", ["--project", cd]);
  ok("shape (character): obey accepts back.out, small elastic.out, steps(n) and short anticipation tweens under the character language", co.status === 0 && /0 error\(s\)/.test(co.stdout), co.stdout.slice(0, 300));
  fs.writeFileSync(path.join(cd, "index.html"), fs.readFileSync(path.join(cd, "index.html"), "utf8").replace('tl.from("#a"', 'tl.from("#b",{y:150,autoAlpha:0,duration:0.28,ease:"back.out(1.4)"},1.4);tl.from("#a"'));
  const cb = node("obey.mjs", ["--project", cd]);
  ok("shape (character): the character language still bans fade-up-slide", cb.status === 2 && /banned:fade-up-slide/.test(cb.stdout), cb.stdout.slice(0, 300));
  // the demo page, headless: every function changes the frame over time and is identical when the same time is seeked twice
  const dd = path.join(TMP, "shape-demo");
  const sd = node("shape.mjs", ["demo", "--out", dd]);
  let dr = null; try { dr = JSON.parse(sd.stdout); } catch {}
  if (!dr) console.log("skip  shape (demo): could not run (" + (sd.stderr || sd.stdout).slice(0, 200).replace(/\n/g, " ") + ")");
  else {
    ok("shape (demo): the page builds with no console errors", !(dr.errors || []).length, (dr.errors || []).join(" | "));
    for (const c of dr.cells) ok(`shape (demo): ${c.id} changes over time and is identical when seeked to the same time twice`, c.changes && c.seek_identical, JSON.stringify(c));
    ok("shape (demo): the whole frame is pixel-identical on a second seek and differs across times", dr.page_identical && dr.page_changes);
    ok("shape (demo): the strip is written", !!dr.strip && fs.existsSync(path.join(dd, "strip.png")), dr.strip_note || "");
  }
}

// art. the art department: art.mjs treat / cutout / trace / hand on small fixtures, plan / make (the unavailable path) / check, the crew's art phase, role check and the layer and pose-board warnings
{
  const ws = path.join(TMP, "art-ws");
  const run = path.join(ws, ".rasanai", "r1");
  const fx = path.join(TMP, "art-fx");
  fs.mkdirSync(fx, { recursive: true });
  fs.mkdirSync(path.join(run, "story"), { recursive: true });
  fs.mkdirSync(path.join(run, "look"), { recursive: true });
  const AR = (a, e = {}) => spawnSync(process.execPath, [path.join(HERE, "art.mjs"), ...a], { encoding: "utf8", env: { ...env, RASANAI_CUTOUT: "flood", ...e }, cwd: ws, timeout: 120000 });
  const C = (a, e = {}) => spawnSync(process.execPath, [path.join(HERE, "crew.mjs"), ...a], { encoding: "utf8", env: { ...env, ...e }, cwd: ws, timeout: 120000 });
  const J = (r) => { try { return JSON.parse(r.stdout); } catch { return {}; } };
  const wj = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o, null, 2)); };
  const png = (name, lavfi) => { const f = path.join(fx, name); spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", lavfi, "-frames:v", "1", f]); return f; };
  const px = (f, x, y) => { const r = spawnSync("ffmpeg", ["-v", "error", "-i", f, "-vf", `crop=1:1:${x}:${y}`, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgba", "-"]); return r.stdout.length === 4 ? [...r.stdout] : null; };
  const size = (f) => { const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", f], { encoding: "utf8" }); return r.stdout.trim(); };
  const block = png("block.png", "color=c=0xeeeeee:s=160x120,drawbox=x=40:y=30:w=70:h=60:color=0xcc3333:t=fill,drawbox=x=60:y=45:w=30:h=30:color=0x222222:t=fill");
  ok("art: ffmpeg made the fixture picture", fs.existsSync(block) && size(block) === "160x120");

  // vendored files and their licence notes
  const V = path.join(HERE, "vendor");
  ok("art: imagetracerjs is vendored with its Unlicense header and the vendor README names both vendored sources", /Unlicense/.test(fs.readFileSync(path.join(V, "imagetracer.js"), "utf8").slice(0, 600)) && /imagetracerjs/.test(fs.readFileSync(path.join(V, "README.md"), "utf8")) && /Hershey/.test(fs.readFileSync(path.join(V, "README.md"), "utf8")));
  ok("art: the Hershey fonts are vendored (script and simplex) with the attribution notice", ["script", "simplex"].every((f) => { try { const j = JSON.parse(fs.readFileSync(path.join(V, "hershey", `${f}.json`), "utf8")); return j.glyphs["A"] && j.glyphs["a"] && /Hershey/.test(j.license); } catch { return false; } }) && /Bureau of Standards/.test(fs.readFileSync(path.join(V, "hershey", "README.md"), "utf8")));

  // treat
  const T = (op, extra = []) => { const o = path.join(fx, `t-${op}.png`); const r = AR(["treat", "--in", block, "--out", o, "--op", op, ...extra]); return { r, o }; };
  const tr = {};
  for (const op of ["gradient-map", "duotone", "halftone", "dither", "pixelate", "xray", "grade"]) tr[op] = T(op, op === "halftone" || op === "pixelate" ? ["--cell", "8"] : []);
  ok("art treat: every op writes a picture of the input's size (gradient-map, duotone, halftone, dither, pixelate, xray, grade)", Object.values(tr).every(({ r, o }) => r.status === 0 && size(o) === "160x120"), Object.entries(tr).filter(([, v]) => v.r.status !== 0).map(([k, v]) => k + ": " + v.r.stderr).join("; "));
  const gm = T("gradient-map", ["--colors", "#000000,#ff0000"]);
  const gdark = px(gm.o, 75, 60), glight = px(gm.o, 5, 5);
  ok("art treat: gradient-map maps luma onto the palette ramp (dark centre toward the first colour, light ground toward the last)", gdark && glight && gdark[0] < 60 && gdark[1] === 0 && glight[0] > 200 && glight[1] === 0 && glight[2] === 0, JSON.stringify([gdark, glight]));
  const dt = T("dither", ["--colors", "#101010,#f0f0f0"]);
  const dpx = [px(dt.o, 3, 3), px(dt.o, 75, 60), px(dt.o, 50, 40)];
  ok("art treat: dither paints only the palette's colours", dpx.every((p) => p && ((p[0] === 16 && p[1] === 16) || (p[0] === 240 && p[1] === 240))), JSON.stringify(dpx));
  const pxl = T("pixelate", ["--cell", "8"]);
  ok("art treat: pixelate is stepped (every pixel in an 8-pixel cell has one colour) and differs from the input", JSON.stringify(px(pxl.o, 40, 32)) === JSON.stringify(px(pxl.o, 47, 39)) && !fs.readFileSync(pxl.o).equals(fs.readFileSync(block)));
  const ht = T("halftone", ["--cell", "8", "--colors", "#000000,#ffffff"]);
  const htv = new Set(); for (let i = 0; i < 16; i++) htv.add(px(ht.o, 40 + i, 33)[0]);
  ok("art treat: halftone makes dots (the ink-to-paper values vary along a row of the dark block)", htv.size > 2);
  ok("art treat: xray inverts luma (the dark centre is lighter than the light ground)", px(tr.xray.o, 75, 60)[0] + px(tr.xray.o, 75, 60)[1] > px(tr.xray.o, 5, 5)[0] + px(tr.xray.o, 5, 5)[1]);
  ok("art treat: an unknown op or a bad colour is refused (exit 1, named)", AR(["treat", "--in", block, "--out", path.join(fx, "x.png"), "--op", "sepia"]).status === 1 && /--op must be one of/.test(AR(["treat", "--in", block, "--out", path.join(fx, "x.png"), "--op", "sepia"]).stderr) && AR(["treat", "--in", block, "--out", path.join(fx, "x.png"), "--op", "duotone", "--colors", "red,blue"]).status === 1);

  // cutout: flood-fill on a plain ground, trimmed; a busy ground is refused, never guessed
  const cutf = path.join(fx, "cut.png");
  const cr = AR(["cutout", "--in", block, "--out", cutf]);
  const cj = J(cr);
  ok("art cutout: a plain ground is flood-filled away and the picture is trimmed to its content (70x60 of 160x120), alpha at the edges removed", cr.status === 0 && cj.method === "flood-fill" && size(cutf) === "70x60" && px(cutf, 35, 30)[3] === 255, cr.stdout + cr.stderr);
  const busy = png("busy.png", "testsrc2=size=160x120:rate=1");
  const br = AR(["cutout", "--in", busy, "--out", path.join(fx, "busy-cut.png")]);
  ok("art cutout: a busy ground is refused (exit 2) with the reason and what to do", br.status === 2 && /ground is not plain/.test(br.stderr));

  // trace: vendored imagetracerjs -> real <path>s
  const svgf = path.join(fx, "trace.svg"), linef = path.join(fx, "line.svg");
  const tj = J(AR(["trace", "--in", block, "--out", svgf, "--colors", "4"]));
  const svg = fs.existsSync(svgf) ? fs.readFileSync(svgf, "utf8") : "";
  ok("art trace: a flat picture becomes an SVG with real <path> elements, each with an id and a fill", tj.ok && tj.paths >= 2 && (svg.match(/<path id="t\d+" d="M /g) || []).length === tj.paths && /fill="rgb\(/.test(svg) && /viewBox="0 0 160 120"/.test(svg), svg.slice(0, 200));
  const lj = J(AR(["trace", "--in", block, "--out", linef, "--lineart"]));
  const lsvg = fs.existsSync(linef) ? fs.readFileSync(linef, "utf8") : "";
  ok("art trace: --lineart gives outlines (stroke, fill none) ready for draw-on, with no white paper shapes", lj.ok && lj.paths >= 1 && /fill="none" stroke="#111111"/.test(lsvg) && !/rgb\(255,\s*255,\s*255\)/.test(lsvg), lsvg.slice(0, 200));

  // hand: Hershey single-stroke paths, one per stroke, in writing order
  const hf = path.join(fx, "hand.svg");
  const hj = J(AR(["hand", "--text", "Hi", "--font", "simplex", "--out", hf]));
  const hs = fs.existsSync(hf) ? fs.readFileSync(hf, "utf8") : "";
  const ids = [...hs.matchAll(/<path id="s(\d+)" data-glyph="(.)" d="(M[^"]+)"/g)];
  ok("art hand: 'Hi' in Hershey Simplex is 5 strokes (H: 3, i: 2), one <path> each, in order s001.., glyph named", hj.ok && hj.strokes === 5 && ids.length === 5 && ids.map((m) => m[1]).join() === "001,002,003,004,005" && ids.slice(0, 3).every((m) => m[2] === "H") && ids[3][2] === "i", JSON.stringify(hj) + hs.slice(0, 200));
  ok("art hand: the SVG has a viewBox that holds every stroke, round caps and no fill", /viewBox="-?\d+ -?\d+ \d+ \d+"/.test(hs) && /stroke-linecap="round"/.test(hs) && /fill="none"/.test(hs));
  const hs2f = path.join(fx, "hand2.svg");
  const hj2 = J(AR(["hand", "--text", "Sibhi\\nlove", "--out", hs2f, "--size", "80", "--color", "#ff3b1f"]));
  const hs2 = fs.existsSync(hs2f) ? fs.readFileSync(hs2f, "utf8") : "";
  ok("art hand: the default script font writes two lines, takes the colour and size, and an unknown character is skipped, not fatal", hj2.ok && hj2.strokes >= 9 && /stroke="#ff3b1f"/.test(hs2) && J(AR(["hand", "--text", "a☃b", "--out", path.join(fx, "h3.svg")])).skipped === 1);
  ok("art hand: empty text is refused (exit 1)", AR(["hand", "--out", path.join(fx, "h4.svg")]).status === 1);

  // plan / make (the unavailable path) / check
  fs.writeFileSync(path.join(run, "look", "DESIGN.md"), "---\nname: x\ncolors:\n  ground: \"#f4f1ea\"\n  ink: \"#111111\"\n  hot: \"#ff3b1f\"\n---\n## Overview\nx\n## Imagery\nFlat risograph illustration, two inks on cream paper, soft grain, no gradients, one bold outline weight.\n");
  const shows = (extra = []) => ({ beats: [
    { id: "b1", name: "open", on_screen: "A sloppy sketch", shows: [{ line: "A sloppy sketch", show: "A hand-drawn paper airplane is drawn on and flies off", built_from: "object", handoff: "h" }, { line: "Words only", show: "The words type in on the ground", built_from: "type", handoff: "h" }] },
    { id: "b2", name: "turn", on_screen: "Sign here", shows: [{ line: "Sign here", show: "A handwritten signature draws on, stroke by stroke", built_from: "object", handoff: "h" }, { line: "The lily", show: "A cut-out photo of a lily with a hot gradient map swaps in", built_from: "photo", handoff: "h" }, ...extra] }] });
  wj(path.join(run, "story", "chosen.json"), shows());
  const pl = J(AR(["plan", "--run", run]));
  const pj = JSON.parse(fs.readFileSync(path.join(run, "art", "plan.json"), "utf8"));
  ok("art plan: the plan lists the shows built from an object or a photo (3 here), skips type-only shows, and has a kind, prompt, treatments and used_by per asset", pl.ok && pj.assets.length === 3 && pj.assets.every((a) => a.id && a.kind && a.prompt && Array.isArray(a.treatments) && a.used_by.length) && !pj.assets.some((a) => /Words only/.test(a.used_by.join())), JSON.stringify(pj.assets.map((a) => [a.id, a.kind])));
  const kinds = Object.fromEntries(pj.assets.map((a) => [a.used_by[0].split(": ")[1], a.kind]));
  ok("art plan: a signature is handwriting, a photo is a photo with a cut-out and gradient-map treatment, a drawn object is an illustration", kinds["Sign here"] === "handwriting" && kinds["The lily"] === "photo" && pj.assets.find((a) => a.kind === "photo").treatments.join() === "cutout,gradient-map" && kinds["A sloppy sketch"] === "illustration", JSON.stringify(kinds));
  ok("art plan: one style block from the look (palette from DESIGN.md, the Imagery words as the rendering style, line weight, lighting)", pj.style.palette.includes("#ff3b1f") && /risograph/.test(pj.style.rendering) && pj.style.line_weight && pj.style.lighting && pj.style.avoid);
  ok("art plan: an existing plan is kept (the agent's edits survive) unless --force", J(AR(["plan", "--run", run])).kept === true && J(AR(["plan", "--run", run, "--force"])).kept === undefined);
  const mk = AR(["make", "--run", run], { RASANAI_IMAGEGEN: "off" });
  const mj = J(mk);
  const af = path.join(run, "art", "assets.json");
  const A = fs.existsSync(af) ? JSON.parse(fs.readFileSync(af, "utf8")) : {};
  ok("art make: with image generation unavailable it says so (stderr), makes the handwriting itself, and writes a todo list with a reason and the prompt for the rest (exit 0, nothing silent)", mk.status === 0 && /image generation is unavailable \(off/.test(mk.stderr) && mj.imagegen === "off" && A.assets.length === 1 && A.assets[0].kind === "handwriting" && fs.existsSync(path.join(run, A.assets[0].path)) && A.todo.length === 2 && A.todo.every((t) => /unavailable/.test(t.reason) && t.prompt), mk.stdout + mk.stderr);
  let ck = AR(["check", "--run", run]);
  ok("art check: made assets and explicit todos (with a reason) pass; the todos are warnings; every object/photo show maps to an asset", ck.status === 0 && J(ck).ok && J(ck).todo === 2 && J(ck).warnings.filter((w) => /todo/.test(w)).length === 2, ck.stdout + ck.stderr);
  const A0 = JSON.parse(JSON.stringify(A));
  wj(af, { ...A0, todo: A0.todo.slice(1) });
  ck = AR(["check", "--run", run]);
  ok("art check: an asset neither made nor a todo fails (exit 1, the asset and the command named)", ck.status === 1 && /not made and not a todo/.test(ck.stderr));
  wj(af, { ...A0, todo: A0.todo.map((t) => ({ ...t, reason: "" })) });
  ok("art check: a todo with no reason fails", AR(["check", "--run", run]).status === 1 && /needs a reason/.test(AR(["check", "--run", run]).stderr));
  wj(af, A0);
  wj(path.join(run, "story", "chosen.json"), shows([{ line: "The unmapped chair", show: "A chair drawn on", built_from: "object", handoff: "h" }]));
  ck = AR(["check", "--run", run]);
  ok("art check: a show built from an object or photo that no asset names is show-unmapped", ck.status === 1 && /show-unmapped: beat 2 "The unmapped chair"/.test(ck.stderr), ck.stderr);
  wj(path.join(run, "story", "chosen.json"), shows());
  // style: generated assets must share one anchor; sizes must fit
  const smallf = path.join(run, "art", "assets", "b1-a-sloppy-sketch.png");
  fs.mkdirSync(path.dirname(smallf), { recursive: true });
  spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=0xcccccc:s=120x120", "-frames:v", "1", smallf]);
  const sk = pj.assets.find((a) => a.kind === "illustration"), pk = pj.assets.find((a) => a.kind === "photo");
  const ent = (a, anchor, f) => ({ id: a.id, kind: a.kind, path: path.relative(run, f), source: "imagegen", anchor, prompt: a.prompt, used_by: a.used_by });
  wj(af, { ...A0, anchor: sk.id, todo: A0.todo.filter((t) => t.id !== sk.id), assets: [...A0.assets, ent(sk, sk.id, smallf)] });
  ck = AR(["check", "--run", run]);
  ok("art check: an illustration of 120x120 is smaller than the 768 px it needs (a problem), one anchor is fine", ck.status === 1 && /b1-a-sloppy-sketch: 120x120 is smaller than the 768px/.test(ck.stderr) && !/style-split/.test(ck.stderr), ck.stderr);
  const pf = path.join(run, "art", "assets", "photo.png");
  spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=0xcccccc:s=900x900", "-frames:v", "1", pf]);
  const bigk = path.join(run, "art", "assets", "sk-big.png");
  spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=0xcccccc:s=900x900", "-frames:v", "1", bigk]);
  wj(af, { ...A0, anchor: sk.id, todo: [], assets: [...A0.assets, ent(sk, sk.id, bigk), ent(pk, "some-other-anchor", pf)] });
  ck = AR(["check", "--run", run]);
  ok("art check: generated assets that follow different anchors are style-split (exit 1, the anchors named)", ck.status === 1 && /style-split: generated assets follow 2 different anchors/.test(ck.stderr), ck.stderr);
  wj(af, { ...A0, anchor: sk.id, todo: [], assets: [...A0.assets, ent(sk, sk.id, bigk), ent(pk, sk.id, pf)] });
  ck = AR(["check", "--run", run]);
  ok("art check: one shared anchor and big enough pictures pass", ck.status === 0, ck.stderr);
  const badplan = JSON.parse(JSON.stringify(pj)); badplan.style.palette = []; badplan.style.lighting = ""; wj(path.join(run, "art", "plan.json"), badplan);
  ok("art check: an empty style (palette, lighting) is style-missing", /style-missing: plan\.style\.palette/.test(AR(["check", "--run", run]).stderr) && /style-missing: plan\.style\.lighting/.test(AR(["check", "--run", run]).stderr));
  wj(path.join(run, "art", "plan.json"), pj);

  // the crew: the art phase, the role's brief and check, layers-thin, the pose boards and the 24 fps strips
  C(["plan", "--run", run, "--route", "product-launch-video", "--subject", "Tally", "--scenes", "4", "--length", "16"]);
  const phases = (JSON.parse(fs.readFileSync(path.join(run, "crew", "plan.json"), "utf8")).phases || []).map((p) => p.phase);
  ok("art crew: the plan has an art phase after the concept gate and before the score (all scene routes)", phases.indexOf("art") > phases.indexOf("concept-gate") && phases.indexOf("art") < phases.indexOf("score") && phases.indexOf("art") > -1, phases.join());
  C(["plan", "--run", run, "--route", "product-launch-video", "--subject", "Tally", "--scenes", "4", "--length", "16", "--lean"]);
  ok("art crew: --lean skips the art phase", !(JSON.parse(fs.readFileSync(path.join(run, "crew", "plan.json"), "utf8")).phases || []).some((p) => p.phase === "art"));
  const bj = J(C(["brief", "--run", run, "--role", "art-director", "--key", "art"]));
  const bt = bj.prompt ? fs.readFileSync(path.join(ws, bj.prompt), "utf8") : "";
  ok("art crew: the art-director's brief lists the script, the look and the plan as inputs, the check command, and carries the dare (art a studio would sign)", /art\.mjs[^\n]* check --run/.test(bt) && /chosen\.json/.test(bt) && /DESIGN\.md/.test(bt) && /art a studio would sign/i.test(bt) && /no stock-looking images/i.test(bt), bt.slice(0, 300));
  ok("art crew: the Motion Director's, the film builder's and the animators' briefs get art/assets.json and ART.md once the art folder exists", ["motion-director:score", "film-builder:film", "scene-animator:2"].every((rk) => { const [role, key] = rk.split(":"); const b = J(C(["brief", "--run", run, "--role", role, "--key", key, "--project", "videos/t"])); const t = b.prompt ? fs.readFileSync(path.join(ws, b.prompt), "utf8") : ""; return /art\/assets\.json/.test(t) && /ART\.md/.test(t); }));
  const chk = (role, extra = []) => { const r = C(["check", "--run", run, "--role", role, ...extra]); return { status: r.status, p: (J(r).problems || []).join(" | "), w: (J(r).warnings || []).join(" | ") }; };
  fs.rmSync(path.join(run, "art", "ART.md"), { force: true });
  let cr0 = chk("art-director");
  ok("art crew: check --role art-director runs art.mjs check (its problems come back, prefixed) and wants ART.md and the contact sheet", /art\/ART\.md is missing/.test(cr0.p) && /art\/sheet\.png is missing/.test(cr0.w), JSON.stringify(cr0));
  wj(af, A0);
  fs.writeFileSync(path.join(run, "art", "ART.md"), "# The world\n\nFlat risograph prints on cream paper: two inks, hot orange and black, one bold outline weight, soft paper grain, no gradients and no glow. Every picture is drawn by the same hand, objects as simple silhouettes, photos cut out and graded hot.\n\n## Assets\n\n- b2-sign-here: signature, Hershey script.\n");
  spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=0xcccccc:s=64x64", "-frames:v", "1", path.join(run, "art", "sheet.png")]);
  cr0 = chk("art-director");
  ok("art crew: an art folder that passes art.mjs check, with ART.md and a sheet, is accepted (todos stay warnings)", cr0.status === 0 && /art: asset .* todo/.test(cr0.w), JSON.stringify(cr0));
  // layers-thin
  const sc = path.join(run, "motion", "score.json");
  const shotsOf = (layers) => layers.map((l, i) => ({ t0: i * 2, t1: i * 2 + 2, on_screen: "x", moves: "y", ...(l == null ? {} : { layers: l }) }));
  const scoreOf = (grammar, layers) => wj(sc, { spine: "s", ...(grammar ? { grammar } : {}), seams: [], scenes: [{ n: 1, duration: 8, shots: shotsOf(layers) }] });
  scoreOf("specimen-sheet", [2, 3, 2, 3]);
  let m = chk("motion-director", ["--key", "score"]);
  ok("art crew: layers-thin warns when the median shot of a showcase-grammar film has under 4 layers (and says how many)", /layers-thin: the median shot has 2\.5 independently timed layer/.test(m.w), m.w.slice(0, 300));
  scoreOf("specimen-sheet", [6, 8, 5, 9]);
  m = chk("motion-director", ["--key", "score"]);
  ok("art crew: 5 to 10 layers is not layers-thin", !/layers-thin/.test(m.w));
  scoreOf("alpha-grid", [1, 1, 1, 1]);
  m = chk("motion-director", ["--key", "score"]);
  ok("art crew: other grammars are not held to a layer count", !/layers-thin/.test(m.w));
  scoreOf("pixel-collage", [null, null, null, null]);
  m = chk("motion-director", ["--key", "score"]);
  ok("art crew: a showcase film whose shots declare no layers is told to (layers-thin: no shot declares layers)", /layers-thin: no shot declares layers/.test(m.w));
  // pose boards and 24 fps strips for hero moves
  const pjdir = path.join(ws, "videos", "t");
  fs.mkdirSync(path.join(pjdir, "compositions", "frames"), { recursive: true });
  wj(sc, { spine: "s", seams: [], moves: [{ id: "m1", status: "used", scene: 1 }, { id: "m2", status: "used", scene: 1 }, { id: "m3", status: "dropped", scene: 2, why: "not this film at all" }], scenes: [{ n: 1, duration: 4, shots: [] }] });
  let fb = chk("film-builder", ["--key", "film", "--project", "videos/t"]);
  ok("art crew: film-builder check warns no-pose-board and hero-not-stripped for each hero move that is used (not the dropped one)", /no-pose-board: hero move m1 has no boards\/m1\.png/.test(fb.w) && /no-pose-board: hero move m2/.test(fb.w) && /hero-not-stripped: no 24 fps strip of hero move m1/.test(fb.w) && !/m3/.test(fb.w), fb.w.slice(0, 400));
  fs.mkdirSync(path.join(run, "boards"), { recursive: true }); fs.writeFileSync(path.join(run, "boards", "m1.png"), "x");
  fs.mkdirSync(path.join(run, "crew", "builder"), { recursive: true }); fs.writeFileSync(path.join(run, "crew", "builder", "m1-strip24.png"), "x");
  fb = chk("film-builder", ["--key", "film", "--project", "videos/t"]);
  ok("art crew: a boards/<id>.png and a strip file named with the move id clear both warnings for that move", !/no-pose-board: hero move m1/.test(fb.w) && !/hero-not-stripped: no 24 fps strip of hero move m1/.test(fb.w) && /no-pose-board: hero move m2/.test(fb.w), fb.w.slice(0, 400));
  fs.rmSync(path.join(run, "art"), { recursive: true, force: true });
}

// sfx. the vendored GSAP plugins and the CC0 SFX library: licences and headers, index integrity, and sfx-plan picking from the library with variety
{
  const V = path.join(HERE, "vendor");
  const plugins = ["SplitText", "ScrambleTextPlugin", "DrawSVGPlugin", "MorphSVGPlugin", "MotionPathPlugin", "CustomEase", "CustomBounce", "CustomWiggle", "InertiaPlugin", "Physics2DPlugin", "EasePack"];
  const gv = (fs.readFileSync(path.join(V, "gsap.min.js"), "utf8").match(/GSAP (\d+\.\d+\.\d+)/) || [])[1];
  const bad = plugins.filter((p) => {
    const f = path.join(V, "gsap-plugins", p + ".min.js");
    if (!fs.existsSync(f)) return true;
    const t = fs.readFileSync(f, "utf8");
    return !t.includes(" " + gv) || !/standard-license/.test(t.slice(0, 600));
  });
  ok("sfx: every GSAP plugin is vendored at the core's version with its licence header (" + plugins.length + ", GSAP " + gv + ")", !bad.length && !!gv, bad.join(", "));
  ok("sfx: gsap-plugins.min.js bundles them and parses", fs.existsSync(path.join(V, "gsap-plugins.min.js")) && spawnSync(process.execPath, ["--check", path.join(V, "gsap-plugins.min.js")]).status === 0);
  const L = path.join(HERE, "..", "library", "sfx");
  const idx = JSON.parse(fs.readFileSync(path.join(L, "index.json"), "utf8")).files;
  const cats = new Set(idx.map((e) => e.category));
  const need = ["click", "press", "select", "land", "drop", "snap", "whoosh", "riser", "impact", "stinger", "tick", "notification", "swipe", "type"];
  ok("sfx: the index covers every category and each entry has licence, source and a measured sync point", need.every((c) => cats.has(c)) && idx.every((e) => e.licence === "CC0-1.0" && /^https:/.test(e.source) && Number.isFinite(e.sync_point) && fs.existsSync(path.join(L, e.file)) && !/\.generated/.test(e.source)), need.filter((c) => !cats.has(c)).join(","));
  const bytes = idx.reduce((n, e) => n + fs.statSync(path.join(L, e.file)).size, 0);
  ok("sfx: the library stays under 8 MB and has no harsh entry (" + Math.round(bytes / 1024) + " KB, " + idx.length + " files)", bytes < 8e6 && idx.every((e) => e.pct_above_5k <= 35), "");
  ok("sfx: CREDITS and the licence copies are there", fs.existsSync(path.join(L, "CREDITS.md")) && fs.existsSync(path.join(L, "LICENSES", "uisfx-LICENSE-AUDIO.txt")) && fs.existsSync(path.join(L, "atomcut-motion-essentials", "pack.json")));
  const d = path.join(TMP, "sfx");
  fs.mkdirSync(d, { recursive: true });
  const ev = [{ t: 1, kind: "click", size: "small" }, { t: 3, kind: "click", size: "small" }, { t: 5, kind: "click", size: "small" }, { t: 7, kind: "click", size: "small" }, { t: 9, kind: "snap", size: "medium" }, { t: 11, kind: "toast", size: "small" }, { t: 14, kind: "reveal", size: "large" }, { t: 16, kind: "whoosh", size: "large", signature: true }];
  fs.writeFileSync(path.join(d, "scenes.json"), JSON.stringify({ narrated: false, scenes: [{ duration: 10, title: "a" }, { duration: 10, title: "b" }] }));
  fs.writeFileSync(path.join(d, "events.json"), JSON.stringify(ev));
  const run = (extra) => { try { return JSON.parse(node("sound.mjs", ["sfx-plan", "--scenes", path.join(d, "scenes.json"), "--events", path.join(d, "events.json"), ...extra]).stdout); } catch { return { cues: [] }; } };
  const p = run(["--pack", "studio"]);
  const clicks = p.cues.filter((c) => c.kind === "click");
  ok("sfx: sfx-plan takes its samples from the library, one uisfx pack for the UI sounds (--pack studio)", p.cues.length >= 3 && clicks.length >= 2 && p.cues.every((c) => c.source === "rasan-sfx" && c.file && fs.existsSync(c.file)) && clicks.every((c) => c.pack === "uisfx-studio"), JSON.stringify(p.cues.map((c) => [c.kind, c.sample])));
  ok("sfx: hits and whooshes come from the FX packs, with a measured sync point", p.cues.some((c) => c.kind === "reveal") && p.cues.filter((c) => c.kind === "reveal" || c.kind === "whoosh").every((c) => /^(atomcut|kenney)/.test(c.pack) && c.sync_point != null), JSON.stringify(p.cues.map((c) => [c.kind, c.pack])));
  ok("sfx: no file repeats in a row", p.cues.every((c, i) => !i || c.sample !== p.cues[i - 1].sample) && new Set(clicks.map((c) => c.sample)).size === clicks.length, JSON.stringify(clicks.map((c) => c.sample)));
  const o = run(["--no-library"]);
  ok("sfx: --no-library keeps the old media-use path (no rasan-sfx sources)", o.cues.every((c) => c.source !== "rasan-sfx"));
}

// sources. source modes and the footage desk: research.mjs sources classifies (footage, brand kit, code, document, mixed) from names and sizes; lib/lang.mjs never
// lets an English-only model silently translate; reel scan scales its frames to the clip; story.mjs gates product-first by source and adds GF; footage.mjs ingest, shots,
// bites and the three checks (log, selects, paper edit); crew.mjs plan --sources, the footage roles' briefs and checks. Fixtures are tiny ffmpeg-made clips.
{
  const SRC = path.join(TMP, "sources");
  const sx = (args, o = {}) => node("research.mjs", args, o);
  const ff = (a) => spawnSync("ffmpeg", ["-v", "error", "-y", ...a], { encoding: "utf8" });
  const hasFF = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" }).status === 0;
  if (!hasFF) ok("sources: ffmpeg is installed (skipping the footage fixtures)", false, "ffmpeg missing");
  else {
    const shoot = path.join(SRC, "shoot");
    fs.mkdirSync(path.join(shoot, "Brand"), { recursive: true });
    fs.mkdirSync(path.join(shoot, "CARD1", "PRIVATE", "M4ROOT"), { recursive: true });
    // a 2-shot clip with a tone, a phone-vertical clip, and nested camera-card footage
    ff(["-f", "lavfi", "-i", "testsrc2=s=320x180:r=15", "-f", "lavfi", "-i", "smptebars=s=320x180:r=15", "-f", "lavfi", "-i", "sine=f=440:d=4", "-filter_complex", "[0:v]trim=duration=2,setpts=PTS-STARTPTS[a];[1:v]trim=duration=2,setpts=PTS-STARTPTS[b];[a][b]concat=n=2:v=1:a=0[v]", "-map", "[v]", "-map", "2:a", "-t", "4", "-pix_fmt", "yuv420p", "-c:a", "aac", path.join(shoot, "A001_interview.mp4")]);
    ff(["-f", "lavfi", "-i", "testsrc2=s=180x320:r=15:d=3", "-pix_fmt", "yuv420p", path.join(shoot, "B002_phone.mp4")]);
    ff(["-f", "lavfi", "-i", "color=c=teal:s=320x180:r=15:d=2", "-pix_fmt", "yuv420p", path.join(shoot, "CARD1", "PRIVATE", "M4ROOT", "C0003.mp4")]);
    fs.writeFileSync(path.join(shoot, "Brand", "Brand Guidelines.pdf"), "%PDF-1.4\n");
    fs.writeFileSync(path.join(shoot, "Brand", "Brand Sans.otf"), "x");
    const sj = path.join(SRC, "sources.json");
    const r1 = sx(["sources", "--paths", shoot, "--out", sj]);
    let S = {};
    try { S = JSON.parse(fs.readFileSync(sj, "utf8")); } catch {}
    const fsrc = (S.sources || []).find((x) => x.kind === "footage") || {};
    ok("sources: a shoot folder with a Brand subfolder is footage mode, spine footage, case own-brand-film, footage-writers, product-first off", r1.status === 0 && S.mode === "footage" && S.spine === "footage" && S.case === "own-brand-film" && S.story_pass === "footage-writers" && S.product_first === false, r1.stdout.slice(0, 300) + r1.stderr);
    ok("sources: it counts clips (the nested camera card too), reads the vertical phone clip and the interview from names and ffprobe, and finds the brand kit", fsrc.clips === 3 && fsrc.hints && fsrc.hints.phone_vertical === 1 && (S.sources || []).some((x) => x.kind === "assets" && x.fonts === 1 && x.pdf.length === 1) && /3 clips/.test((S.chips || []).join(" ")), JSON.stringify(S.sources).slice(0, 400));
    ok("sources: the desks follow the sources (footage logger and selects producer, brand kit builder in place of the web brand researcher)", (S.desks || []).some((d) => d.roles.includes("footage-logger")) && (S.desks || []).some((d) => d.roles.includes("brand-kit-builder")) && !(S.desks || []).some((d) => d.roles.includes("brand-researcher")), JSON.stringify(S.desks));
    const sjm = path.join(SRC, "sources-mixed.json");
    sx(["sources", "--paths", shoot, "--url", "https://slowpour.pt", "--out", sjm]);
    const M = JSON.parse(fs.readFileSync(sjm, "utf8"));
    ok("sources: footage plus a site is mixed, public, spine still footage", M.mode === "mixed" && M.public === true && M.spine === "footage", JSON.stringify([M.mode, M.public, M.spine]));
    const code = path.join(SRC, "app");
    fs.mkdirSync(code, { recursive: true });
    fs.writeFileSync(path.join(code, "package.json"), "{}");
    const sjc = path.join(SRC, "sources-code.json");
    sx(["sources", "--paths", code, "--out", sjc]);
    const C = JSON.parse(fs.readFileSync(sjc, "utf8"));
    ok("sources: an approved codebase alone is local mode, spine code, case own-unreleased-product, and product-first applies", C.mode === "local" && C.spine === "code" && C.case === "own-unreleased-product" && C.product_first === true && C.story_pass === "script-writers", JSON.stringify([C.mode, C.spine, C.case, C.product_first]));
    const pdf = path.join(SRC, "report-2026.pdf");
    fs.writeFileSync(pdf, "%PDF-1.4\n");
    const sjd = path.join(SRC, "sources-doc.json");
    sx(["sources", "--paths", pdf, "--out", sjd]);
    const Dd = JSON.parse(fs.readFileSync(sjd, "utf8"));
    ok("sources: a PDF report is document mode and not product-first", Dd.spine === "document" && Dd.case === "data-report" && Dd.product_first === false, JSON.stringify([Dd.spine, Dd.case]));
    ok("sources: no paths, url or code is refused", sx(["sources", "--out", path.join(SRC, "x.json")]).status !== 0);

    // language: lib/lang.mjs
    const L = await import(path.join(HERE, "lib", "lang.mjs"));
    const emptyModels = path.join(SRC, "no-models");
    fs.mkdirSync(emptyModels, { recursive: true });
    const enOnly = path.join(SRC, "en-models");
    fs.mkdirSync(enOnly, { recursive: true });
    fs.writeFileSync(path.join(enOnly, "ggml-small.en.bin"), "x");
    const withEnv = (dir, fn) => { const prev = process.env.RASANAI_WHISPER_MODELS; process.env.RASANAI_WHISPER_MODELS = dir; try { return fn(); } finally { if (prev === undefined) delete process.env.RASANAI_WHISPER_MODELS; else process.env.RASANAI_WHISPER_MODELS = prev; } };
    const d1 = withEnv(enOnly, () => L.decideLanguage({ file: "x", lang: "auto" }));
    ok("lang: with only an English-only model the language is NOT assumed verified: it says so and warns that such a model translates", d1.lang === "en" && d1.verified === false && /translates other languages/.test(d1.warning || ""), JSON.stringify(d1));
    const d2 = withEnv(enOnly, () => L.decideLanguage({ file: "x", lang: "es" }));
    ok("lang: --lang es with no multilingual model is blocked (never silently small.en, never a download)", d2.blocked && /multilingual/.test(d2.blocked) && d2.model === null, JSON.stringify(d2));
    const d3 = withEnv(enOnly, () => L.decideLanguage({ file: "x", lang: "auto", tag: "tam" }));
    ok("lang: an audio stream tagged in another language is blocked too when only English models exist", !!d3.blocked && d3.lang === "ta", JSON.stringify(d3));
    const d4 = withEnv(enOnly, () => L.decideLanguage({ file: "x", lang: "en" }));
    ok("lang: --lang en uses the English model and is verified", d4.verified === true && d4.model && /small\.en/.test(d4.model.name), JSON.stringify(d4));
    ok("lang: an English transcript of foreign speech is caught (non-English letters, no English function words); real English passes", L.englishLooks("Bonjour, je m'appelle Léa et j'ai ouvert un café à Lisbonne il y a dix ans, très petit").ok === false && L.englishLooks("Hello my name is Maya and I opened a small cafe in Lisbon about ten years ago").ok === true);
    const wj = L.wordsFromWhisperJson({ transcription: [{ text: "", offsets: { from: 0, to: 50 }, tokens: [{ text: "[_BEG_]", p: 0.99 }] }, { text: " Hello", offsets: { from: 50, to: 400 }, tokens: [{ text: " Hello", p: 0.9 }] }, { text: " there.", offsets: { from: 400, to: 900 }, tokens: [{ text: " there", p: 0.5 }, { text: ".", p: 0.7 }] }, { text: "[MUSIC]", offsets: { from: 900, to: 1000 }, tokens: [] }] }, 10);
    ok("lang: whisper's word JSON becomes {text,start,end,conf} words shifted by the window offset, skipping markers", wj.length === 2 && wj[0].text === "Hello" && wj[0].start === 10.05 && wj[1].end === 10.9 && wj[1].conf === 0.6, JSON.stringify(wj));

    // reel scan: frames scale with the clip, and no silent English-only transcription of other languages
    const raw = path.join(SRC, "raw");
    fs.mkdirSync(raw, { recursive: true });
    ff(["-f", "lavfi", "-i", "testsrc2=s=160x90:r=5:d=75", "-f", "lavfi", "-i", "sine=f=300:d=75", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", path.join(raw, "long.mp4")]);
    ff(["-f", "lavfi", "-i", "testsrc2=s=160x90:r=5:d=2", "-pix_fmt", "yuv420p", path.join(raw, "short.mp4")]);
    const envM = { ...env, RASANAI_WHISPER_MODELS: emptyModels };
    const sc = spawnSync(process.execPath, [path.join(HERE, "reel.mjs"), "scan", "--footage", raw, "--run", path.join(SRC, "rrun"), "--lang", "es"], { encoding: "utf8", env: envM, cwd: TMP, timeout: 120000 });
    let F = { clips: [] };
    try { F = JSON.parse(fs.readFileSync(path.join(SRC, "rrun", "footage", "footage.json"), "utf8")); } catch {}
    const lg = F.clips.find((c) => c.id === "long") || {}, sh = F.clips.find((c) => c.id === "short") || {};
    ok("reel scan: a 75 s clip gets 13 frames (one per ~6 s) and a 2 s clip 8, not 8 for everything", sc.status === 0 && (lg.sheet_times || []).length === 13 && (sh.sheet_times || []).length === 8 && lg.sheet_grid === "6x3", JSON.stringify([(lg.sheet_times || []).length, lg.sheet_grid, (sh.sheet_times || []).length]) + sc.stderr);
    ok("reel scan: --lang es with no multilingual model does not transcribe (no silent English model), says why, and downloads nothing", /multilingual/.test(lg.transcript_error || "") && !lg.transcript && (F.warnings || []).some((w) => /multilingual/.test(w)), JSON.stringify([lg.transcript_error, F.warnings]));
    const sc2 = spawnSync(process.execPath, [path.join(HERE, "reel.mjs"), "scan", "--footage", raw, "--run", path.join(SRC, "rrun2")], { encoding: "utf8", env: envM, cwd: TMP, timeout: 120000 });
    let F2 = { clips: [] };
    try { F2 = JSON.parse(fs.readFileSync(path.join(SRC, "rrun2", "footage", "footage.json"), "utf8")); } catch {}
    ok("reel scan: with no whisper model at all it transcribes nothing and tells the Director (never an automatic download)", sc2.status === 0 && F2.clips.every((c) => !c.transcript) && F2.clips.some((c) => /no whisper model/.test(c.transcript_error || "")), JSON.stringify(F2.clips.map((c) => c.transcript_error)));

    // footage.mjs: ingest, shots, bites
    const run = path.join(SRC, "run");
    const fx = (args, o = {}) => node("footage.mjs", args, o);
    const g1 = fx(["ingest", "--footage", shoot, "--run", run]);
    const ING = JSON.parse(fs.readFileSync(path.join(run, "footage", "ingest.json"), "utf8"));
    ok("footage ingest: reads every clip (nested camera card too), fingerprints them, rotation-aware sizes, bins", g1.status === 0 && ING.clips.length === 3 && ING.clips.every((c) => c.fingerprint && c.fingerprint.length === 16) && ING.clips.find((c) => c.id === "b002-phone").height === 320 && ING.bins.length >= 2, g1.stdout.slice(0, 300) + g1.stderr);
    ok("footage ingest: a variable frame rate and log colour are flagged from the probe, not assumed (none here)", ING.clips.every((c) => c.vfr === false) && ING.clips.every((c) => ["rec709", "unknown"].includes(c.color)), JSON.stringify(ING.clips.map((c) => [c.vfr, c.color])));
    // dual-system audio: a longer separate recording that contains the clip's sound 3 s in
    const sync = path.join(SRC, "sync");
    fs.mkdirSync(sync, { recursive: true });
    const E = "sin(2*PI*220*t)*abs(sin(2*PI*1.3*t)*sin(2*PI*0.71*t+1))"; // an irregular pulsing tone: speech-like loudness changes to correlate on
    ff(["-f", "lavfi", "-i", "testsrc2=s=160x90:r=10:d=4", "-f", "lavfi", "-i", `aevalsrc=${E}:d=4:s=16000`, "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", path.join(sync, "A001.mp4")]);
    ff(["-f", "lavfi", "-i", "aevalsrc=sin(2*PI*180*t)*abs(sin(2*PI*0.9*t)*sin(2*PI*2.3*t)):d=3:s=16000", "-f", "lavfi", "-i", `aevalsrc=${E}:d=4:s=16000`, "-filter_complex", "[0][1]concat=n=2:v=0:a=1", "-ar", "16000", path.join(sync, "REC001.wav")]);
    const g1b = fx(["ingest", "--footage", sync, "--run", path.join(SRC, "run-sync")]);
    const ING2 = JSON.parse(fs.readFileSync(path.join(SRC, "run-sync", "footage", "ingest.json"), "utf8"));
    const sy = (ING2.sync || [])[0];
    ok("footage ingest: a separate recorder's audio is matched to its clip by cross-correlation (offset about 3 s)", g1b.status === 0 && sy && Math.abs(sy.offset_s - 3) < 0.1 && sy.audio === "REC001.wav", JSON.stringify(ING2.sync) + g1b.stderr);
    const g2 = fx(["shots", "--run", run]);
    const SH = JSON.parse(fs.readFileSync(path.join(run, "footage", "shots.json"), "utf8"));
    const inter = SH.clips.find((c) => c.clip === "a001-interview") || { shots: [] };
    ok("footage shots: finds the cut in the 2-shot clip (scdet), a keyframe and a strip per shot, quality numbers", g2.status === 0 && inter.shots.length === 2 && Math.abs(inter.shots[0].out - 2) < 0.3 && inter.shots.every((s) => s.keyframe && fs.existsSync(path.resolve(TMP, s.keyframe)) && s.quality && s.quality.samples > 0), g2.stdout.slice(0, 300) + g2.stderr);
    ok("footage shots: a single-take clip is one shot", (SH.clips.find((c) => c.clip === "b002-phone") || { shots: [] }).shots.length === 1);
    const g3 = fx(["vision", "--run", run]);
    ok("footage vision: runs on-device through swift when it can, or skips with a reason and exits 0 (optional)", g3.status === 0 && /"ok": true/.test(g3.stdout), g3.stdout.slice(0, 200) + g3.stderr);

    // words + selects + paper edit, built by hand over the real ingest and shots
    const WR = path.join(run, "footage");
    const words = [["I", 0.2], ["opened", 0.5], ["a", 0.8], ["small", 1.0], ["cafe", 1.4], ["in", 1.8], ["Lisbon", 2.0], ["and", 2.9], ["we", 3.1], ["still", 3.3], ["pour", 3.6], ["every", 3.9], ["cup", 4.2], ["by", 4.5], ["hand", 4.7]].map(([text, start]) => ({ text, start, end: Math.round((start + 0.25) * 100) / 100, conf: 0.9, speaker: "S1" }));
    fs.mkdirSync(path.join(WR, "transcripts"), { recursive: true });
    fs.writeFileSync(path.join(WR, "transcripts", "a001-interview.words.json"), JSON.stringify(words));
    // the interview clip is 4 s: stretch the fixture's story onto a longer clip by editing ingest, so the bites sit inside it
    ING.clips.find((c) => c.id === "a001-interview").duration = 30;
    fs.writeFileSync(path.join(WR, "ingest.json"), JSON.stringify(ING));
    const bt = fx(["bites", "--run", run]);
    const BC = JSON.parse(fs.readFileSync(path.join(WR, "bites-candidates.json"), "utf8"));
    ok("footage bites: sentences come from the word timings with in = first start - 0.08 and out = last end + 0.12", bt.status === 0 && BC.candidates.length >= 1 && Math.abs(BC.candidates[0].in - 0.12) < 0.02, JSON.stringify(BC.candidates[0]));
    const bite = (id, a, b, text, extra = {}) => ({ id, speaker: "Maya Costa", clip: "a001-interview", in: a, out: b, text, rating: 5, themes: ["origin"], jobs: ["hook"], ...extra });
    const sel = {
      bites: [bite("b01", 0.12, 2.37, "I opened a small cafe in Lisbon"), bite("b02", 2.82, 4.97, "and we still pour every cup by hand", { rating: 4, jobs: ["button"] }), bite("b03", 0.5, 2.37, "opened a small cafe in Lisbon", { rating: 3 }), bite("bad", 1.1, 2.37, "small cafe in Lisbon"), bite("wrongtext", 0.12, 2.37, "we sell tractors across the whole of Europe")],
      moments: [{ id: "m01", shot: "a001-interview-s01", jobs: ["hook"], rating: 5, why: "the colour" }, { id: "m02", shot: "b002-phone-s01", jobs: ["texture"], rating: 4, why: "x" }],
      themes: [], people: [], gaps: [], story_candidates: [{ shape: "journey", spine: ["b01", "b02", "nope"], why: "x" }],
    };
    fs.writeFileSync(path.join(WR, "selects.json"), JSON.stringify(sel));
    fs.writeFileSync(path.join(WR, "SELECTS.md"), "# Selects\n\n## Looked at\n- strips\n");
    const cs = fx(["check-selects", "--run", run, "--min-good", "2"]);
    const csj = JSON.parse(cs.stdout || "{}");
    const csp = (csj.problems || []).join(" | ");
    ok("footage check-selects: a bite that cuts inside a word, text that is not in the transcript and a story candidate citing a missing id are all named", cs.status === 2 && /bite bad: in 1\.1 lands inside the word "small"/.test(csp) && /bite wrongtext: its text does not match the transcript/.test(csp) && /cites nope/.test(csp), csp.slice(0, 500));
    sel.bites = sel.bites.filter((b) => !["bad", "wrongtext"].includes(b.id));
    sel.story_candidates = [{ shape: "journey", spine: ["b01", "b02"], why: "x" }];
    fs.writeFileSync(path.join(WR, "selects.json"), JSON.stringify(sel));
    ok("footage check-selects: clean selects pass", fx(["check-selects", "--run", run, "--min-good", "2"]).status === 0, fx(["check-selects", "--run", run, "--min-good", "2"]).stdout.slice(0, 300));
    const lowRated = fx(["check-selects", "--run", run, "--min-good", "8"]);
    ok("footage check-selects: fewer than 8 rated 4+ is refused (a body of material needs a real choice)", lowRated.status === 2 && /rated 4\+/.test(lowRated.stdout), lowRated.stdout.slice(0, 200));
    // log
    const logRow = (s, extra = {}) => ({ shot: s.id, clip: "x", in: s.in, out: s.out, size: "CU", move: "static", subject: "a thing", role: ["broll"], usable: [s.in, s.out], quality: "good", ...extra });
    const allShots = SH.clips.flatMap((c) => c.shots);
    const bin = ING.clips[0].bin;
    const binShots = SH.clips.filter((c) => c.bin === bin).flatMap((c) => c.shots);
    fs.writeFileSync(path.join(WR, `log-${bin}.json`), JSON.stringify([logRow(binShots[0], { size: "HUGE" })]));
    const cl = fx(["check-log", "--run", run]);
    ok("footage check-log: unlogged shots, a size outside the enum and a missing gold are reported", cl.status === 2 && /not logged/.test(cl.stdout) && /HUGE/.test(cl.stdout), cl.stdout.slice(0, 400));
    fs.writeFileSync(path.join(WR, `log-${bin}.json`), JSON.stringify(binShots.map((s) => logRow(s, { gold: s === binShots[0], gold_why: "the colour" }))));
    const others = SH.clips.filter((c) => c.bin !== bin).flatMap((c) => c.shots);
    const bins = [...new Set(SH.clips.map((c) => c.bin))];
    for (const b of bins.filter((x) => x !== bin)) fs.writeFileSync(path.join(WR, `log-${b}.json`), JSON.stringify(SH.clips.filter((c) => c.bin === b).flatMap((c) => c.shots).map((s) => logRow(s))));
    const cl2 = fx(["check-log", "--run", run]);
    ok("footage check-log: every shot logged with valid rows passes", cl2.status === 0, cl2.stdout.slice(0, 400));
    ok("footage merge-log: log-<bin> files merge into log.json", fx(["merge-log", "--run", run]).status === 0 && JSON.parse(fs.readFileSync(path.join(WR, "log.json"), "utf8")).length === allShots.length);
    // paper edit
    const paper = (extra = {}) => ({ label: "Sure", title: "One grinder", logline: "A cafe grown one cup at a time", shape: "journey", aim: { takeaway: "t", feel: "f", action: "a", audience: "u" }, length_s: 4.4,
      spine: [{ bite: "b01", job: "hook" }, { bite: "b02", job: "button" }], broll_map: [], graphics: [], gaps_used: [], frankenbites: [], ...extra });
    const pf = path.join(run, "story", "paper-Sure.json");
    fs.mkdirSync(path.dirname(pf), { recursive: true });
    const cp = (p, len = 4.4) => { fs.writeFileSync(pf, JSON.stringify(p)); return fx(["check-paper", "--run", run, "--paper", pf, "--length", String(len)]); };
    const good = cp(paper());
    ok("footage check-paper: a clean two-bite paper edit passes and reports its length and hook", good.status === 0 && JSON.parse(good.stdout).stats.hook === "b01", good.stdout.slice(0, 400));
    const joined = cp(paper({ spine: [{ bite: "b01", cleanups: ["1.0-1.4"], job: "hook" }, { bite: "b02", job: "button" }] }));
    const jp = (JSON.parse(joined.stdout).problems || []).join(" | ");
    ok("footage check-paper: a join with no meaning note and no covering b-roll is refused (the uncovered join, the missing frankenbite note)", joined.status === 2 && /no frankenbites entry with a meaning_note/.test(jp) && /is not covered/.test(jp), jp.slice(0, 400));
    const covered = cp(paper({ spine: [{ bite: "b01", cleanups: ["1.0-1.4"], job: "hook" }, { bite: "b02", job: "button" }], frankenbites: [{ bite: "b01", joins: 1, meaning_note: "removes a repeated word; meaning unchanged" }], broll_map: [{ over: "b01", at: [0.5, 2.5], shot: "b002-phone-s01", job: "cover", covers_join: "1.0-1.4" }] }), 3.9);
    ok("footage check-paper: the same join covered by b-roll with a meaning note passes", covered.status === 0, covered.stdout.slice(0, 500));
    const cardFirst = cp(paper({ spine: [{ card: { text: "Lisbon, 2019", duration: 2.5 }, job: "context" }, { bite: "b01", job: "hook" }, { bite: "b02", job: "button" }] }), 6.9);
    ok("footage check-paper: opening on a card (no cold open) is refused: the hook is the strongest real moment", cardFirst.status === 2 && /opens on a card/.test(cardFirst.stdout), cardFirst.stdout.slice(0, 300));
    const weakHook = cp(paper({ spine: [{ bite: "b03", job: "hook" }, { bite: "b02", job: "button" }] }), 4.0);
    ok("footage check-paper: a hook rated under 4 is refused", weakHook.status === 2 && /the hook b03 is rated 3/.test(weakHook.stdout), weakHook.stdout.slice(0, 300));
    const wrongLen = cp(paper(), 10);
    ok("footage check-paper: a spine more than 8% off the target length is refused", wrongLen.status === 2 && /for a 10 s film/.test(wrongLen.stdout), wrongLen.stdout.slice(0, 300));
    const badIds = cp(paper({ spine: [{ bite: "b01", job: "hook" }, { bite: "ghost", job: "button" }], broll_map: [{ over: "b01", at: [0, 0.5], shot: "no-such-shot", job: "illustrate" }] }));
    ok("footage check-paper: ids that are not in selects.json or shots.json, and b-roll under 1.2 s, are named", badIds.status === 2 && /ghost/.test(badIds.stdout) && /no-such-shot/.test(badIds.stdout), badIds.stdout.slice(0, 400));
    const reuse = cp(paper({ broll_map: [0, 1, 2].map((i) => ({ over: "b01", at: [i, i + 1.0], shot: "b002-phone-s01", job: "illustrate" })) }));
    ok("footage check-paper: b-roll under 1.2 s and a shot used three times are refused", reuse.status === 2 && /1\.2 s at least/.test(reuse.stdout) && /used 3 times/.test(reuse.stdout), reuse.stdout.slice(0, 400));
    fs.writeFileSync(path.join(WR, "approvals.json"), JSON.stringify({ people: [{ name: "Maya Costa", ok: false }] }));
    const blocked = cp(paper());
    ok("footage check-paper: a person unticked in approvals.json cannot appear", blocked.status === 2 && /unticked in approvals\.json/.test(blocked.stdout), blocked.stdout.slice(0, 300));
    fs.rmSync(path.join(WR, "approvals.json"), { force: true });

    // story.mjs: product-first only by source; GF for footage
    const fpitch = (extra = {}, first = { bite: "b01" }) => ({ title: "One grinder", logline: "A cafe grown one cup at a time", device: "rewind", aim: { takeaway: "Slow Pour pours every cup by hand.", feel: "Calm", action: "Visit", audience: "Locals" }, approach: "Starts on the pour, then the founder's own words carry it.", scores: { originality: 4, clarity: 4, fit: 5, memorability: 4, feasibility: 5 },
      beats: [{ name: "The pour", on_screen: "", visual: "the pour", duration_s: 8, ...first }, { name: "Why", on_screen: "", visual: "Maya", duration_s: 10, bite: "b02" }, { name: "Title", on_screen: "Slow Pour", visual: "card", duration_s: 3 }, { name: "Street", on_screen: "", visual: "street", duration_s: 9, moment: "m02" }], ...extra });
    const stDir = path.join(SRC, "story");
    fs.mkdirSync(stDir, { recursive: true });
    const gates = (p, argv) => { const f = path.join(stDir, `p-${Math.random().toString(36).slice(2)}.json`); fs.writeFileSync(f, JSON.stringify(p)); const r = node("story.mjs", ["check", "--pitch", f, ...argv]); let j = { gates: [] }; try { j = JSON.parse(r.stdout); } catch {} return { r, ids: j.gates.map((g) => g.id), g: (id) => j.gates.find((x) => x.id === id), j }; };
    const noSrc = gates(fpitch(), ["--format", "launch"]);
    ok("story: with no source mode, a launch format still gets the product-first gates (G7 and G12), as before", noSrc.ids.includes("G7") && noSrc.ids.includes("G12") && !noSrc.ids.includes("GF"), noSrc.ids.join());
    const fm = gates(fpitch(), ["--format", "launch", "--source-mode", "footage", "--selects", path.join(WR, "selects.json")]);
    ok("story: a footage spine drops the product-first gates (G7, G9, G10, G11, G12) and runs GF instead", !["G7", "G9", "G10", "G11", "G12"].some((x) => fm.ids.includes(x)) && fm.ids.includes("GF"), fm.ids.join());
    ok("story: GF passes a film that opens on a rated 4+ bite, is mostly footage, has one card", fm.g("GF") && fm.g("GF").pass === true, JSON.stringify(fm.g("GF")));
    const fsrcFile = gates(fpitch(), ["--format", "launch", "--sources", sj, "--selects", path.join(WR, "selects.json")]);
    ok("story: --sources <sources.json> works like --source-mode", fsrcFile.ids.includes("GF") && !fsrcFile.ids.includes("G7"), fsrcFile.ids.join());
    const cardOpen = gates(fpitch({}, { bite: "", moment: "", kind: "card" }), ["--source-mode", "footage", "--selects", path.join(WR, "selects.json")]);
    ok("story: GF refuses a film that opens on a card", cardOpen.g("GF") && cardOpen.g("GF").pass === false && /opens on a card/.test(cardOpen.g("GF").reasons.join(" ")), JSON.stringify(cardOpen.g("GF")));
    const weak = gates(fpitch({}, { bite: "b03" }), ["--source-mode", "footage", "--selects", path.join(WR, "selects.json")]);
    ok("story: GF refuses a hook rated under 4 in selects.json", weak.g("GF") && /rated 3/.test(weak.g("GF").reasons.join(" ")), JSON.stringify(weak.g("GF")));
    const cardy = gates(fpitch({ beats: [{ name: "a", bite: "b01", duration_s: 4, visual: "x" }, { name: "c1", on_screen: "One", duration_s: 4, visual: "card" }, { name: "c2", on_screen: "Two", duration_s: 4, visual: "card" }, { name: "c3", on_screen: "Three", duration_s: 4, visual: "card" }] }), ["--source-mode", "footage", "--selects", path.join(WR, "selects.json")]);
    ok("story: GF refuses a film that is mostly cards (footage share and one card per 12 s)", cardy.g("GF") && cardy.g("GF").pass === false && /card beats|only \d+% of the film is footage/.test(cardy.g("GF").reasons.join(" ")), JSON.stringify(cardy.g("GF")));
    const forced = gates(fpitch(), ["--format", "launch", "--source-mode", "footage", "--product-first"]);
    ok("story: an explicit --product-first still forces the product-first gates on a footage spine", forced.ids.includes("G7") && !forced.ids.includes("GF"), forced.ids.join());
    const codeSpine = gates(fpitch(), ["--format", "launch", "--sources", sjc]);
    ok("story: a code spine keeps the product-first gates", codeSpine.ids.includes("G7") && !codeSpine.ids.includes("GF"), codeSpine.ids.join());

    // crew: plan --sources, the roles, the order
    const crun = path.join(SRC, "crew-run");
    fs.mkdirSync(path.join(crun, "footage"), { recursive: true });
    fs.copyFileSync(path.join(run, "footage", "ingest.json"), path.join(crun, "footage", "ingest.json"));
    const pl = node("crew.mjs", ["plan", "--run", crun, "--route", "reel", "--subject", "Slow Pour", "--sources", sj, "--length", "60"], { cwd: TMP });
    let PJ = { phases: [] };
    try { PJ = JSON.parse(pl.stdout); } catch {}
    const ph = (n) => PJ.phases.find((x) => x.phase === n);
    ok("crew plan --sources: a footage spine adds footage-audit, footage-log (a logger per bin), selects and footage writers instead of script writers and the Moves pass", pl.status === 0 && ph("footage-audit") && ph("footage-log").members.length === bins.length && ph("selects") && ph("story").members.every((m) => /^footage-writer:/.test(m)) && !ph("moves"), pl.stdout.slice(0, 400) + pl.stderr);
    ok("crew plan --sources: the researchers come from the sources (the brand kit builder, a light product check), not from the route", ph("research").members.some((m) => /^brand-kit-builder/.test(m)) && !ph("research").members.some((m) => /^brand-researcher/.test(m)), JSON.stringify(ph("research")));
    const ds = PJ.phases.findIndex((x) => x.phase === "design-systems"), st = PJ.phases.findIndex((x) => x.phase === "story"), cut = PJ.phases.findIndex((x) => x.phase === "cut");
    ok("crew plan: a reel's order is Story, Look (design-systems), Cut, and the Look phase no longer says it comes after the cut", st >= 0 && ds > st && cut > ds && !/after the cut \(reel\)/.test(ph("design-systems").when), PJ.phases.map((x) => x.phase).join());
    ok("crew plan: a footage spine turns product-first off in the briefs (no product_first line in the dispatch context)", !/\*\*product_first\*\*/.test((() => { node("crew.mjs", ["brief", "--run", crun, "--role", "script-editor"], { cwd: TMP }); try { return fs.readFileSync(path.join(crun, "crew", "prompts", "script-editor.md"), "utf8"); } catch { return ""; } })()));
    fs.mkdirSync(path.join(SRC, "crew-plain"), { recursive: true });
    const plain = node("crew.mjs", ["plan", "--run", path.join(SRC, "crew-plain"), "--route", "reel", "--subject", "x"], { cwd: TMP });
    ok("crew plan: without --sources a reel plans as before (script writers, no footage desk)", (() => { try { const j = JSON.parse(plain.stdout); return j.phases.some((x) => x.phase === "story" && x.members.every((m) => /^script-writer/.test(m))) && !j.phases.some((x) => x.phase === "footage-audit"); } catch { return false; } })(), plain.stdout.slice(0, 200) + plain.stderr);
    const cb = (role, key) => node("crew.mjs", ["brief", "--run", crun, "--role", role, ...(key ? ["--key", key] : [])], { cwd: TMP });
    const b1 = cb("footage-logger", bin), b2 = cb("selects-producer"), b3 = cb("footage-writer", "Bold"), b4 = cb("brand-kit-builder");
    ok("crew brief: the four footage roles write prompts with their inputs and outputs (the logger's bin, the writer's gate)", [b1, b2, b3, b4].every((b) => b.status === 0) && /log-/.test(fs.readFileSync(path.join(crun, "crew", "prompts", `footage-logger-${bin}.md`), "utf8")) && /check-paper/.test(fs.readFileSync(path.join(crun, "crew", "prompts", "footage-writer-Bold.md"), "utf8")) && /KIT\.md/.test(fs.readFileSync(path.join(crun, "crew", "prompts", "brand-kit-builder.md"), "utf8")), [b1, b2, b3, b4].map((b) => b.stderr).join(" "));
    ok("crew brief: the footage writer and selects producer get a show-off ask", /Show off/.test(fs.readFileSync(path.join(crun, "crew", "prompts", "footage-writer-Bold.md"), "utf8")) && /Show off/.test(fs.readFileSync(path.join(crun, "crew", "prompts", "selects-producer.md"), "utf8")));
    const chk = (role, key) => node("crew.mjs", ["check", "--run", crun, "--role", role, ...(key ? ["--key", key] : [])], { cwd: TMP });
    // the crew run reuses the footage folder of `run`
    fs.cpSync(path.join(run, "footage"), path.join(crun, "footage"), { recursive: true });
    fs.mkdirSync(path.join(crun, "story"), { recursive: true });
    const c1 = chk("footage-logger", bin);
    ok("crew check footage-logger: log rows pass the log check, and LOG-<bin>.md must say what was looked at", c1.status === 2 && /LOG-.*\.md is missing/.test(c1.stdout), c1.stdout.slice(0, 300));
    fs.writeFileSync(path.join(crun, "footage", `LOG-${bin}.md`), "# Log\n\n## Looked at\n- strips\n");
    ok("crew check footage-logger: accepted with the log and its Looked at list", chk("footage-logger", bin).status === 0, chk("footage-logger", bin).stdout.slice(0, 300));
    ok("crew check selects-producer: accepted when selects.json and SELECTS.md pass", (() => { fs.writeFileSync(path.join(crun, "footage", "SELECTS.md"), "# S\n\n## Looked at\n- c\n"); const o = node("crew.mjs", ["check", "--run", crun, "--role", "selects-producer"], { cwd: TMP }); return o.status === 0 || /rated 4\+/.test(o.stdout); })());
    fs.writeFileSync(path.join(crun, "story", "paper-Sure.json"), JSON.stringify(paper()));
    const cw = chk("footage-writer", "Sure");
    ok("crew check footage-writer: runs check-paper and wants PAPER-<L>.md", cw.status === 2 && /PAPER-Sure\.md is missing/.test(cw.stdout) && !/spine/.test(cw.stdout.replace(/spine: \[\]/, "")), cw.stdout.slice(0, 400));
    // brand kit
    const bk = path.join(crun, "research", "brand");
    fs.mkdirSync(path.join(bk, "assets"), { recursive: true });
    const bkc = chk("brand-kit-builder");
    ok("crew check brand-kit-builder: a missing DESIGN.md is refused", bkc.status === 2 && /DESIGN\.md is missing/.test(bkc.stdout), bkc.stdout.slice(0, 200));
    fs.writeFileSync(path.join(bk, "DESIGN.md"), `---\nname: Slow Pour\ncolors:\n  canvas: "#F6EFE4"   # page (source: Brand Guidelines.pdf p.14)\n  ink: "#1E1A16"      # text (source: Brand Guidelines.pdf p.14)\n  accent: "#C2410C"   # source: Brand Guidelines.pdf p.15\ntypography:\n  display: { fontFamily: "Brand Sans", fontWeight: 700 }\n  body: { fontFamily: "Brand Sans", fontWeight: 400 }\n---\n## Overview\nWarm.\n## Logo\nmark.svg\n## Motion\nslow\n`);
    fs.writeFileSync(path.join(bk, "assets", "mark.svg"), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>');
    fs.writeFileSync(path.join(bk, "assets", "logos.json"), JSON.stringify([{ file: "mark.svg", kind: "mark", source: { file: "Brand/Logos.zip/mark.svg", page: null } }]));
    fs.writeFileSync(path.join(crun, "research", "brand.md"), "# Where it came from\nBrand Guidelines.pdf p.14-15\n");
    const bkc2 = chk("brand-kit-builder");
    ok("crew check brand-kit-builder: still wants the staged fonts (or a declared substitute) and KIT.md with the forbidden uses", bkc2.status === 2 && /fonts\/ has no font file/.test(bkc2.stdout) && /KIT\.md is missing/.test(bkc2.stdout) && !/source_url/.test(bkc2.stdout), bkc2.stdout.slice(0, 500));
    fs.mkdirSync(path.join(bk, "fonts"), { recursive: true });
    fs.writeFileSync(path.join(bk, "fonts", "BrandSans.otf"), "x");
    fs.writeFileSync(path.join(bk, "KIT.md"), "# Kit\n\n- Forbidden: never animate the mark's parts; never place it on the accent.\n");
    const bkc3 = chk("brand-kit-builder");
    ok("crew check brand-kit-builder: a kit with file-cited colours, a logo sourced to the user's file, staged fonts and KIT.md is accepted (no source_url demanded)", bkc3.status === 0, bkc3.stdout.slice(0, 500));
  }
}

// motion (W7): the fluent contract, obey's mix rules and budgets, RasanMotion, the fluency gate (scripts/tests/motion.mjs)
try { await (await import(path.join(HERE, "tests", "motion.mjs"))).default({ ok, node, tmp: TMP, quick }); }
catch (e) { ok("motion: tests ran", false, String((e && e.stack) || e).split("\n").slice(0, 4).join(" | ")); }

// formats (W11): the "What are you making?" picker: formats.json check, match, resolve, the brief payload, the console picker, story.mjs's format_shapes (scripts/tests/formats.mjs)
try { await (await import(path.join(HERE, "tests", "formats.mjs"))).default({ ok, node, tmp: TMP, quick }); }
catch (e) { ok("formats: tests ran", false, String((e && e.stack) || e).split("\n").slice(0, 4).join(" | ")); }

// plates (W13): abstract plates: the recipe, the palette lock, the procedural plate, make on an abstract row, flowGround + plateTransition determinism (scripts/tests/plates.mjs)
try { await (await import(path.join(HERE, "tests", "plates.mjs"))).default({ ok, node, tmp: TMP, quick }); }
catch (e) { ok("plates: tests ran", false, String((e && e.stack) || e).split("\n").slice(0, 4).join(" | ")); }

// music. the source chain, the measured quality gate, the catalog schema, the brief from the arc, credits; all offline (fixtures, a local mock of the AI vendor)
{
  const crypto = (await import("node:crypto")).default, http = (await import("node:http")).default, { spawn } = await import("node:child_process");
  const lib = await import(new URL("./lib/music-lib.mjs", import.meta.url).href);
  const d = path.join(TMP, "music");
  fs.mkdirSync(d, { recursive: true });
  const J = (r) => { try { return JSON.parse(r.stdout); } catch { return {}; } };
  // catalog: the shipped one validates, holds the 64 seed tracks, and keeps its host policy (Mixkit never mirrored, never auto-fetched)
  const catFile = path.join(HERE, "..", "library", "music", "catalog.json");
  const cat = JSON.parse(fs.readFileSync(catFile, "utf8"));
  const errs = lib.validateCatalog(cat);
  ok("music: library/music/catalog.json validates (https urls, licences without NC / ND / SA, credit lines, checksums)", errs.length === 0, errs.slice(0, 3).join("; "));
  const fma = cat.tracks.filter((t) => t.source === "fma"), mk = cat.tracks.filter((t) => t.source === "mixkit");
  ok("music: the seed list is 27 CC0 / CC BY tracks (self-hostable, checksummed, auto fetch) plus 37 Mixkit (upstream only, fetched on pick, never mirrored)", cat.tracks.length === 64 && fma.length === 27 && mk.length === 37 && fma.every((t) => t.fetch === "auto" && t.mirror_ok && /^[0-9a-f]{64}$/.test(t.sha256) && /^CC/.test(t.licence)) && mk.every((t) => t.fetch === "on-pick" && t.mirror_ok === false && t.host === "upstream" && !t.requires_credit), `${fma.length} ${mk.length}`);
  ok("music: CC BY tracks carry a credit line with the licence, Ketsa's names Ketsa.uk, CC0 needs none", fma.filter((t) => t.requires_credit).every((t) => /licensed under CC BY/.test(t.credit) && t.credit.includes(t.page)) && fma.filter((t) => t.artist === "Ketsa").every((t) => /Ketsa\.uk/.test(t.credit)) && fma.filter((t) => /CC0/.test(t.licence)).every((t) => !t.requires_credit));
  const bad = JSON.parse(JSON.stringify(cat));
  bad.tracks[0].licence = "CC BY-NC 4.0";
  bad.tracks[1].ending = "wobble";
  bad.tracks[30].fetch = "auto";
  bad.tracks[2].url = "http://x/y.mp3";
  const be = lib.validateCatalog(bad);
  ok("music: a catalog with an NC licence, a bad ending, an auto-fetched Mixkit track or a non-https url is refused", be.some((e) => /NC/.test(e)) && be.some((e) => /ending/.test(e)) && be.some((e) => /Mixkit/.test(e)) && be.some((e) => /https/.test(e)), be.join("; "));

  // the gate on ffmpeg-made signals: a clean stereo bass-and-body noise passes; each defect trips its own gate
  const N = (c, s, a) => `anoisesrc=c=${c}:s=${s}:a=${a}:r=44100:d=8`;
  const wide = `${N("brown", 1, 0.5)}[b];${N("pink", 2, 0.12)}[p];${N("pink", 3, 0.2)}[nl];${N("pink", 4, 0.2)}[nr];[b][p]amix=inputs=2:normalize=0`;
  const stereo = (core) => `${core}[m];[m]asplit[a][c];[a][c]join=inputs=2:channel_layout=stereo[o]`;
  const fx = {
    good: `${wide}[m];[m]asplit[m1][m2];[m1][nl]amix=inputs=2:normalize=0[L];[m2][nr]amix=inputs=2:normalize=0[R];[L][R]join=inputs=2:channel_layout=stereo[o]`,
    thin: stereo(`${N("pink", 2, 0.3)}[p];[p]highpass=f=400`),
    dull: stereo(`${N("brown", 1, 0.5)}[b];${N("pink", 2, 0.12)}[p];[b][p]amix=inputs=2:normalize=0,lowpass=f=9000,lowpass=f=9000`),
    phasey: `${N("brown", 1, 0.5)}[b];${N("pink", 2, 0.12)}[p];[b][p]amix=inputs=2:normalize=0[m];[m]asplit[a][c];[c]volume=-1[c2];[a][c2]join=inputs=2:channel_layout=stereo[o]`,
    squashed: `${wide},volume=24dB,asoftclip=type=hard:threshold=0.4[m];[m]asplit[m1][m2];[m1][nl]amix=inputs=2:normalize=0[L];[m2][nr]amix=inputs=2:normalize=0[R];[L][R]join=inputs=2:channel_layout=stereo[o]`,
    harsh: stereo(`${N("pink", 2, 0.3)}[p];[p]highpass=f=2000,lowpass=f=6000[h];${N("brown", 1, 0.08)}[b];[h][b]amix=inputs=2:normalize=0`),
  };
  const gates = {};
  for (const [k, fc] of Object.entries(fx)) {
    const f = path.join(d, `${k}.wav`);
    spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-filter_complex", fc, "-map", "[o]", "-t", "8", "-ar", "44100", f]);
    try { gates[k] = lib.gateTrack(lib.qualityFeatures(f, {})).map((r) => r.gate); } catch (e) { gates[k] = [`error: ${e.message}`]; }
  }
  ok("music: the gate passes a clean wide stereo bed (bass, body, air, side-mid about -12 dB)", gates.good && gates.good.length === 0, JSON.stringify(gates.good));
  ok("music: the gate rejects no low end (sub), a 9 kHz lowpass (air / bandwidth), phasey stereo (phase), clipping (squashed) and a harsh 2-6 kHz mid (presence)", gates.thin?.includes("sub") && gates.dull?.some((g) => g === "air" || g === "bandwidth") && gates.phasey?.includes("phase") && gates.squashed?.includes("squashed") && gates.harsh?.includes("presence"), JSON.stringify(gates));
  const sc = lib.scoreTrack({ sub: -8, presence: -15, air: -25, hf: -40, side_mid: -11, crest: 13, lra: 3.5 }, { family: "editorial" });
  const sw = lib.scoreTrack({ sub: -8, presence: -7, air: -25, hf: -40, side_mid: -11, crest: 13, lra: 3.5 }, { family: "editorial" });
  ok("music: the soft score is 90+ inside the references' band and falls when the mids turn harsh; a title with 'remix' costs 10", sc.score >= 85 && sw.score < sc.score - 10 && lib.scoreTrack({ sub: -8, presence: -15, air: -25, hf: -40, side_mid: -11, crest: 13, lra: 3.5 }, { title: "Foo (Minimal Electro Mix)" }).score < lib.scoreTrack({ sub: -8, presence: -15, air: -25, hf: -40, side_mid: -11, crest: 13, lra: 3.5 }, { title: "Foo" }).score, `${sc.score} ${sw.score}`);
  const gres = node("music.mjs", ["gate", "--track", path.join(d, "phasey.wav")]);
  const gcli = J(gres);
  ok("music: music.mjs gate --track prints the measured features, the rejects and pass: false", gcli.pass === false && gcli.rejects?.some((r) => r.gate === "phase") && typeof gcli.quality?.sub === "number", JSON.stringify(gcli).slice(0, 200) + ` status=${gres.status} signal=${gres.signal} error=${gres.error && gres.error.message} stdout=${String(gres.stdout || "").slice(0, 300)} stderr=${String(gres.stderr || "").slice(0, 400)}`);

  // the source chain: keys absent, present, and the order
  const ids = (c) => c.filter((x) => x.on).map((x) => x.id).join(",");
  const none = lib.sourceChain({}, {});
  const el = lib.sourceChain({ RASANAI_ELEVENLABS_API_KEY: "k" }, {});
  const both = lib.sourceChain({ RASANAI_ELEVENLABS_API_KEY: "k", RASANAI_STABILITY_API_KEY: "s", RASANAI_EPIDEMIC_TOKEN: "t" }, { user: true });
  ok("music: with no keys the chain is the catalog, HeyGen, ccMixter, Openverse (AI drops out silently)", ids(none) === "catalog,heygen,ccmixter,openverse" && none.find((x) => x.id === "ai").on === false, ids(none));
  ok("music: with an ElevenLabs key the AI source comes before the catalog; the user's track comes before everything", ids(el) === "ai,catalog,heygen,ccmixter,openverse" && ids(both).startsWith("user,ai,epidemic-connect,catalog") && both.find((x) => x.id === "ai").vendors.join() === "elevenlabs,stable-audio", ids(el) + " | " + ids(both));
  ok("music: Openverse is last with the strictest threshold; Jamendo, Freesound and Higgsfield are not in the chain", none[none.length - 1].id === "openverse" && lib.THRESHOLD.openverse > lib.THRESHOLD.ccmixter && lib.THRESHOLD.ccmixter > lib.THRESHOLD.catalog && !JSON.stringify(none).match(/jamendo|freesound|higgsfield|bensound/i));
  ok("music: a borrowed key never works: only RASANAI_* variables count (ELEVENLABS_API_KEY alone leaves the AI source off)", lib.sourceChain({ ELEVENLABS_API_KEY: "k", STABILITY_API_KEY: "s" }, {}).find((x) => x.id === "ai").on === false);
  const cliOff = J(node("music.mjs", ["chain"]));
  ok("music: music.mjs chain reads the environment of the process (no key: AI off)", Array.isArray(cliOff) && cliOff.find((x) => x.id === "ai")?.on === false);

  // the user's library notes
  ok("music: Artlist is fine, Epidemic files are blocked (use Epidemic Connect), Musicbed warns, Bensound is blocked, Connect is fine", lib.licenceNote("artlist").status === "ok" && lib.licenceNote("epidemic").status === "block" && /Connect/.test(lib.licenceNote("epidemic").note) && lib.licenceNote("musicbed").status === "warn" && lib.licenceNote("bensound").status === "block" && lib.licenceNote("epidemic-connect").status === "ok");
  // the brief from the arc
  const arc = { intro_until: 5, drop_at: 9.2, break: [20.4, 21.8], payoff_at: 22, button_at: 27 };
  const pr = lib.buildPrompt({ film: 28, bpm: 120, family: { text: "dry minimal electronic, clean kick" }, arc, narrated: true });
  const tot = pr.sections.reduce((a, s) => a + s.duration_ms, 0);
  ok("music: the brief names the structure in seconds (intro, build, drop at the reveal, break, payoff, hard ending), bar-exact, no vocals, no fade-out", /DROP/.test(pr.text) && /break/i.test(pr.text) && /hard ending/.test(pr.text) && /No vocals/.test(pr.text) && /space at 1-4 kHz/.test(pr.text) && pr.sections.every((s) => Math.abs((s.t1 - s.t0) / pr.bar_s - Math.round((s.t1 - s.t0) / pr.bar_s)) < 1e-6) && tot >= 28000 && lib.elevenPlan(pr, "x").sections.length === pr.sections.length, JSON.stringify(pr.sections.map((s) => [s.name, s.t0, s.t1])));
  ok("music: no arc given falls back to a default arc and says so", lib.readArc(null, 30).derived === true && lib.readArc(JSON.stringify(arc), 30).derived === false);

  // credits
  const cc = lib.creditsText({ title: "Bright Dawns", credit: fma.find((t) => t.title === "Bright Dawns").credit, requires_credit: true });
  const c0 = lib.creditsText({ title: "WOLF", artist: "HoliznaCC0", license: "CC0 1.0", requires_credit: false });
  ok("music: a CC BY pick gets a paste-ready description line (title, author, source, licence); CC0 and the user's own track get none", /Bright Dawns/.test(cc.description) && /CC BY 4\.0/.test(cc.description) && c0.description === "" && /No credit required/.test(c0.credits) && lib.creditsText({ origin: "user", title: "x" }).description === "" && lib.creditsText(null).credits === "No music.\n");

  // the whole run offline: a fixture catalog whose files are local (mirror), a wrong checksum, a Mixkit-style on-pick track, the ledger and the credits
  const expr = "0.5*(lt(t\\,40)*(sin(2*PI*55*t)*exp(-25*mod(t\\,0.5))*if(lt(mod(t\\,2)\\,0.5)\\,1\\,0.55)+0.12*sin(2*PI*196*pow(2\\,mod(5*floor(t/2)\\,17)/12)*t)+0.08*sin(2*PI*294*pow(2\\,mod(5*floor(t/2)\\,17)/12)*t))+gte(t\\,40)*exp(-2.2*(t-40))*(0.9*sin(2*PI*55*t)+0.3*sin(2*PI*220*t)))";
  const beat = path.join(d, "beat.wav");
  spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", `aevalsrc='${expr}':s=44100:d=45`, beat]);
  const sha = (f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
  const tr = (id, extra) => ({ id, title: id, artist: "Fixture Artist", family: ["editorial"], bpm: 120, duration: 45, ending: "ring-out", strong_from: 0, licence: "CC BY 4.0", licence_url: "https://creativecommons.org/licenses/by/4.0/", requires_credit: true, credit: `Music: "${id}" by Fixture Artist (https://example.com/${id}), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)`, page: `https://example.com/${id}`, url: `https://example.invalid/${id}.mp3`, sha256: sha(beat), source: "fma", host: "self", fetch: "auto", mirror_ok: true, mirror: beat, commercial_ok: true, ads_ok: true, checked_on: "2026-10-12", listened: false, ...extra });
  const fixCat = { version: 1, tracks: [tr("fx-good"), tr("fx-wrongsum", { sha256: "0".repeat(64), artist: "Other Artist" }), tr("fx-mixkit", { source: "mixkit", host: "upstream", fetch: "on-pick", mirror_ok: false, mirror: null, requires_credit: false, credit: null, licence: "Mixkit Stock Music Free License", licence_url: "https://mixkit.co/license/#musicFree", url: "https://assets.mixkit.co/music/1/1.mp3", sha256: null, artist: "Mixkit Artist", family: ["editorial"] })] };
  const fixFile = path.join(d, "catalog-fixture.json");
  fs.writeFileSync(fixFile, JSON.stringify(fixCat));
  ok("music: the fixture catalog itself validates", lib.validateCatalog(fixCat).length === 0, lib.validateCatalog(fixCat).join("; "));
  const run1 = path.join(d, "run1");
  const nodeEnv = (script, a, extra = {}) => spawnSync(process.execPath, [path.join(HERE, script), ...a], { encoding: "utf8", env: { ...env, ...extra }, cwd: TMP, timeout: 240000 });
  const r1 = nodeEnv("music.mjs", ["--run", run1, "--film", "20", "--sources", "catalog", "--format", "launch", "--intents", "dry minimal electronic bass, synth arpeggio, 120 BPM|dry minimal electronic drums, plucked synth, 120 BPM", "--count", "2", "--no-preview"], { RASANAI_MUSIC_CATALOG: fixFile });
  const m1 = J(r1);
  const o1 = (m1.options || []).find((o) => o.id === "fx-good");
  ok("music: the catalog source fetches the listed file, verifies its checksum, analyses and fits it (BPM, ending, fit, quality, licence, credit)", !!o1 && Math.abs(o1.bpm - 120) < 1 && !!o1.fit && typeof o1.score === "number" && o1.requires_credit === true && /CC BY 4\.0/.test(o1.license) && /fx-good/.test(o1.credit || ""), r1.stderr + JSON.stringify(m1).slice(0, 300));
  ok("music: a file whose checksum does not match is dropped with a note, never shown", !(m1.options || []).some((o) => o.id === "fx-wrongsum") && (m1.notes || []).some((n) => /checksum mismatch/.test(n)) && !fs.existsSync(path.join(run1, "music", "fx-wrongsum.mp3")), JSON.stringify(m1.notes));
  ok("music: a Mixkit-style (on-pick) track is only suggested, never fetched, until the user picks it", (m1.suggestions || []).some((s) => s.id === "fx-mixkit" && s.needs_pick) && !fs.existsSync(path.join(run1, "music", "fx-mixkit.mp3")) && !(m1.options || []).some((o) => o.id === "fx-mixkit"), JSON.stringify(m1.suggestions));
  const led = (() => { try { return JSON.parse(fs.readFileSync(path.join(run1, "music", "LICENSES.json"), "utf8")); } catch { return []; } })();
  const row = led.find((l) => l.id === "fx-good") || {};
  ok("music: LICENSES.json records origin, licence url, credit, checksum and the check date; CREDITS.txt and description.txt are written", row.origin === "catalog" && /creativecommons/.test(row.licence_url || "") && /fx-good/.test(row.credit || "") && row.sha256 === sha(beat) && /^\d{4}-/.test(row.checked_on || "") && fs.existsSync(path.join(run1, "music", "CREDITS.txt")) && fs.existsSync(path.join(run1, "music", "description.txt")), JSON.stringify(row).slice(0, 200));
  const cr = J(nodeEnv("music.mjs", ["credits", "--run", run1, "--pick", "fx-good", "--description", path.join(d, "desc.txt")]));
  nodeEnv("music.mjs", ["credits", "--run", run1, "--pick", "fx-good", "--description", path.join(d, "desc.txt")]);
  ok("music: credits --pick writes CREDITS.txt, description.txt and appends the credit line to the film's description once", cr.requires_credit === true && /fx-good/.test(fs.readFileSync(path.join(run1, "music", "CREDITS.txt"), "utf8")) && fs.readFileSync(path.join(d, "desc.txt"), "utf8").match(/Music:/g).length === 1);

  // the user's own track first, with library notes; an Epidemic file is refused with the Connect advice
  const mine = J(nodeEnv("music.mjs", ["--run", path.join(d, "run2"), "--film", "20", "--track", beat, "--library", "artlist", "--declared", "Artlist Pro, licence 123", "--no-preview"], { RASANAI_MUSIC_CATALOG: fixFile }));
  ok("music: --track puts the user's track first with its licence declaration and the Artlist note, and stops the chain there", mine.options?.[0]?.origin === "user" && /Artlist Pro/.test(mine.options[0].license) && mine.options.length === 1 && /AI services/.test(JSON.stringify(mine.library_note)) && mine.chain?.[0]?.on === true, JSON.stringify(mine).slice(0, 300));
  const epi = J(nodeEnv("music.mjs", ["--run", path.join(d, "run3"), "--film", "20", "--track", beat, "--library", "epidemic", "--sources", "user", "--no-preview"]));
  ok("music: an Epidemic Sound file is blocked (their licence forbids third-party AI tools) and the advice names Epidemic Connect", epi.options?.[0]?.blocked === true && epi.options[0].usable === false && /Connect/.test(epi.options[0].problems?.[0] || "") && epi.recommended === null, JSON.stringify(epi).slice(0, 300));
  ok("music: a folder with stems finds the full mix and lists the stems", (() => { const sd = path.join(d, "stemdir"); fs.mkdirSync(sd, { recursive: true }); fs.copyFileSync(beat, path.join(sd, "Track Full Mix.wav")); fs.copyFileSync(beat, path.join(sd, "Track Drums.wav")); fs.copyFileSync(beat, path.join(sd, "Track Bass.wav")); const t = lib.findUserTrack(sd); return /Full Mix/.test(t.mix) && t.stems.drums?.length === 1 && t.stems.bass?.length === 1; })());

  // AI generation, with the vendor mocked by a local server: the key comes from the user's env, the prompt is written from the arc, the take is retimed and fitted
  const reqs = [];
  const srv = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      reqs.push({ url: req.url, key: req.headers["xi-api-key"], body });
      res.writeHead(200, { "content-type": "audio/mpeg" });
      res.end(fs.readFileSync(beat));
    });
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const arcFile = path.join(d, "arc.json");
  fs.writeFileSync(arcFile, JSON.stringify({ music_arc: { intro_until: 4, drop_at: 8, break: null, payoff_at: 14, button_at: 18 } }));
  const aiRun = await new Promise((resolve) => {
    const p = spawn(process.execPath, [path.join(HERE, "music.mjs"), "--run", path.join(d, "run4"), "--film", "20", "--sources", "ai", "--arc", arcFile, "--intents", "dry minimal electronic bass, synth arpeggio, 119 BPM", "--count", "2", "--no-preview"], { env: { ...env, RASANAI_ELEVENLABS_API_KEY: "user-key-1", RASANAI_ELEVENLABS_API_BASE: base }, cwd: TMP });
    let out = "";
    p.stdout.on("data", (c) => (out += c));
    p.on("close", () => resolve(out));
  });
  srv.close();
  const ai = (() => { try { return JSON.parse(aiRun); } catch { return {}; } })();
  const aiOpt = (ai.options || [])[0];
  ok("music: with a user key the AI source generates to the arc: one request per mood with the user's key, a composition plan of bar-exact sections, never the key of anyone else", reqs.length >= 1 && reqs.every((q) => q.key === "user-key-1" && /\/v1\/music/.test(q.url)) && (() => { const b = JSON.parse(reqs[0].body); return Array.isArray(b.composition_plan?.sections) && b.composition_plan.sections.length >= 4 && b.composition_plan.sections.some((s) => s.section_name === "drop"); })(), JSON.stringify(reqs.map((q) => q.url)));
  ok("music: the generated take is analysed, retimed onto the asked BPM (within 3%), fitted and recorded with its prompt and vendor", aiOpt?.origin === "ai:elevenlabs/music_v1" && !!aiOpt.retimed && Math.abs(aiOpt.bpm - 119) < 1 && !!aiOpt.fit && /DROP/.test(JSON.parse(fs.readFileSync(path.join(d, "run4", "music", "LICENSES.json"), "utf8"))[0]?.generation?.prompt || ""), JSON.stringify(aiOpt || ai).slice(0, 300));
  const noKey = J(nodeEnv("music.mjs", ["--run", path.join(d, "run5"), "--film", "20", "--sources", "ai,catalog", "--no-preview", "--intents", "dry minimal electronic bass, synth arpeggio, 120 BPM"], { RASANAI_MUSIC_CATALOG: fixFile, RASANAI_ELEVENLABS_API_KEY: "", RASANAI_STABILITY_API_KEY: "" }));
  ok("music: without a key the AI source says nothing and the catalog answers", noKey.chain?.find((c) => c.id === "ai")?.on === false && (noKey.options || []).some((o) => o.origin === "catalog") && !(noKey.notes || []).some((n) => /AI generation/.test(n)), JSON.stringify(noKey.notes));
}

// precedent lookup (adapted from motionmaxxing): offline, ranked, provenance-labelled, a bad beat is refused
{
  const pj = node("moments.mjs", ["precedent", "--beat", "hook", "--content", "type", "--q", "word bleed", "--limit", "4", "--json"]);
  let pr = {}; try { pr = JSON.parse(pj.stdout); } catch {}
  const sc = (pr.results || []).map((r) => r.score);
  ok("precedent: a known beat returns ranked results, each labelled model-decoded and unverified, offline with no manifest or cache", pj.status === 0 && pr.total >= 700 && pr.results?.length === 4 && sc.every((v, i) => !i || sc[i - 1] >= v) && pr.results.every((r) => r.beat === "hook" && /model-decoded precedent \(motionmaxxing\), unverified: a hint, not a rule/.test(r.provenance)), pj.stdout.slice(0, 300) + pj.stderr);
  const pt = node("moments.mjs", ["precedent", "--beat", "proof", "--content", "ui"]);
  ok("precedent: the text form prints compact hints with the label; a bad --beat or no filter exits non-zero", pt.status === 0 && /unverified: a hint, not a rule/.test(pt.stdout) && node("moments.mjs", ["precedent", "--beat", "nope"]).status !== 0 && node("moments.mjs", ["precedent"]).status !== 0, pt.stdout.slice(0, 200));
  ok("precedent: the third-party licence, notice and data ship in the skill", ["LICENSE", "NOTICE", "README.md", "moments.jsonl"].every((f) => fs.existsSync(path.join(HERE, "..", "third_party", "motionmaxxing", f))) && /Apache License/.test(fs.readFileSync(path.join(HERE, "..", "third_party", "motionmaxxing", "LICENSE"), "utf8")));
}

fs.rmSync(TMP, { recursive: true, force: true });
console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
