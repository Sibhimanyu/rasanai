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
// 17. lyric videos: the treatment gate and the crew's song route, lyrics.mjs (check, audio, align when whisper is there), the RasanMusic runtime in a page, the film finish (grade, blur)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "rasa-selftest-"));
const env = { ...process.env, RASANAI_HOME: path.join(TMP, "home"), RASANAI_MODEL: "claude-opus-5-5" };
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
ok("custom function ease caught", rules.includes("custom-ease@#c"), rules.join(", "));
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

// 11. story: the device catalog validates; pick returns three devices that differ (family, protagonist, visual world,
//     >= 5 of 7 axes), deterministically per seed; check ships a concept pitch and rejects the cliche arc
{
  const v = node("story.mjs", ["validate"]);
  let vj = {};
  try { vj = JSON.parse(v.stdout); } catch {}
  ok("story: device catalog validates (60+ narrative devices)", v.status === 0 && vj.devices >= 60, v.stdout.slice(0, 300) + v.stderr);
  const sd = path.join(TMP, "story");
  fs.mkdirSync(sd, { recursive: true });
  const truth = path.join(sd, "truth.json");
  fs.writeFileSync(truth, JSON.stringify({ product: { name: "Lintel" }, tags: ["ai", "devtool"], format: { format: "brand", length: "36" }, tone: ["deadpan"], transformation: "from PRs that wait to PRs already reviewed", emotional_truth: "the guilty LGTM", enemy: ["the review queue"], objects: ["the diff", "the LGTM comment", "the pager alert", "the review badge", "conflict markers", "the CI checkmark", "the nit: prefix", "the blame gutter"], forms: ["pull request", "review thread", "commit log", "incident postmortem", "changelog"], words: ["Lintel", "LGTM", "Apply suggestion"], proof: ["Reviews a 400-line PR in under 90 seconds (brief)"], competitors: ["Rival"], cliche: ["hook", "montage", "introducing", "f1", "f2", "f3"] }));
  const picks = ["a", "b", "c"].map((s) => node("story.mjs", ["pick", "--truth", truth, "--seed", s]));
  const P = picks.map((r) => { try { return JSON.parse(r.stdout); } catch { return { picks: [], distance: { matrix: [] } }; } });
  const differ = P.every((r) => r.picks.length === 3 && ["family", "protagonist", "visual_world"].every((k) => new Set(r.picks.map((p) => p.axes[k])).size === 3) && r.distance.matrix.flat().every((d) => d === null || d >= 5));
  const again = node("story.mjs", ["pick", "--truth", truth, "--seed", "a"]);
  ok("story: pick gives Sure/Bold/Wild that differ (family, protagonist, visual world, >= 5 of 7 axes); same seed, same picks", differ && P[0].picks.map((p) => p.label).join() === "Sure,Bold,Wild" && again.stdout === picks[0].stdout, picks.map((r) => r.stderr).join(" "));
  const beat = (name, on_screen, duration_s, extra = {}) => ({ name, on_screen, visual: `${name}, in the review thread`, duration_s, ...extra });
  const scores = { originality: 4, clarity: 4, fit: 5, memorability: 4, feasibility: 5 };
  const aim = { takeaway: "Lintel reads every line so nothing slips through at 2 am.", feel: "Relieved", action: "Install Lintel on one repo", audience: "Engineers who approve pull requests" };
  const good = { title: "The unread line", aim, approach: "Starts at the 2 am outage, then rewinds to the one line nobody read.", logline: "A 2 am outage rewinds to the one line nobody read.", device: "rewind", beats: [beat("The pager alert", "02:14 · checkout-api down", 4), beat("Rewind the postmortem", "deploy ← merge", 7), beat("The LGTM comment un-types", "LGTM · 11:04 pm", 6), beat("The diff, unread", "one hunk", 6), beat("Lintel reads it", "Apply suggestion", 6, { turn: true }), beat("The pager stays dark", "Lintel reads every line.", 7)], first_4s: "A pager alert that plays backwards", clear_by_s4: true, swap_test: { competitor: "Rival", result: "breaks", why: "the LGTM and the comment label are Lintel's own" }, grounded_claims: [], honest_demo: true, build: { hardest_shot: "the reverse scrub", needs_live_action: false }, scores };
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
    for (const sd2 of ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l"]) {
      let r = {};
      try { r = JSON.parse(node("story.mjs", ["pick", "--truth", ptruth, "--seed", sd2]).stdout); } catch {}
      (r.picks || []).forEach((x) => seen.add(x.id));
    }
    ok("product-first: pick for a launch film never offers a conceit device (museum, metaphor, cover version, invented world...) across 12 seeds", seen.size >= 6 && ![...seen].some((id) => CONCEIT.has(id)), [...seen].join(","));
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
    ok("lint: references/product-first.md carries the rules (3 s, hero moment, 2-4 uses, end line largest, no conceits, fidelity, brand lock, concept gate)", ["within 3 s", "hero product moment", "2 to 4 real uses", "largest type", "museums", "cover versions", "faithfully recreated", "Brand lock", "concept gate", "clearest product story", "first_watch"].every((k) => pfmd.includes(k)), pfmd ? "missing phrase" : "file missing");
    const skill = rd("SKILL.md");
    ok("lint: SKILL.md states the product-first rule, the brand lock, the concept gate and not ending a turn with background work running", ["Launch, promo and product films are product-first", "Brand lock.", "Concept gate before the expensive work", "Never end a turn while your own background work is running", "console.mjs wait"].every((k) => skill.includes(k)) && /brand step ALWAYS runs/.test(skill) && /use_brand/.test(skill));
    const sw = rd("agents/script-writer.md"), se = rd("agents/script-editor.md"), cc = rd("agents/concept-critic.md"), ds = rd("agents/design-system-designer.md");
    ok("lint: the writers', editor's, concept critic's and design desk's prompts carry the product-first and brand-lock rules", /product_first/.test(sw) && /hero_moment/.test(sw) && /clearest product story/.test(se) && /first_watch/.test(se) && ["product_on_screen_by_3s", "hero_moment", "tone_matches_brief", "end_line_large", "on_brand", "first_watch_clear"].every((k) => cc.includes(k)) && /brand_lock/.test(ds) && /composition, layout, motion language and density only/.test(ds));
    // the brand-faithful launch pipeline is written into the skill, the design desk, the story references and the agents
    {
      const bfm = rd("references/brand-film.md"), dd = rd("references/design-desk.md"), st = rd("references/story.md"), sc = rd("references/script.md"), cr = rd("references/crew.md");
      const an = rd("agents/brand-film-analyst.md"), md = rd("agents/motion-director.md"), cr2 = rd("agents/critic.md"), fr = rd("agents/frame-designer.md");
      ok("lint: SKILL.md carries the brand-faithful launch pipeline (research with brandfilm.mjs and the analyst, grammar not outside references, simple story, style-match gate on frames and draft, motion obeys the brand)", ["Brand-faithful launch films", "brandfilm.mjs", "brand film analyst", "FILM-STYLE.md", "brandfilm.mjs compare", "after the key frames AND after the first draft render", "Paula Scher", "PRIMARY source", "flat card", "no film found"].every((k) => skill.includes(k)) && /about 3 minutes on Fast pace/.test(skill) && /at most 2 official films/.test(skill), "SKILL.md");
      ok("lint: references/brand-film.md has the pipeline and the OpenAI worked example (what went wrong, what the card says)", ["find", "fetch", "frames", "measure", "card", "compare", "OpenAI", "Bodoni", "77%", "gallery green", "Paula Scher", "dE 4.1", "primary", "Fast"].every((k) => bfm.includes(k)), "brand-film.md");
      ok("lint: the design desk reference forbids outside references for a branded film and names the FILM-STYLE citation", /film_style/.test(dd) && /Paula Scher/.test(dd) && /unbranded films only/.test(dd) && /film_style_takes/.test(dd));
      ok("lint: the story references carry the launch-film structure (hook in 1 to 3 s, reveal, demos, payoff, end card; scripts differ in emphasis and order only)", /launch-film\.md/.test(st) && /launch-film\.md/.test(sc) && /emphasis and order/.test(st) && /emphasis and order/.test(sc) && /payoff_line/.test(st) && /1 to 3 s/.test(sc));
      ok("lint: the crew reference lists the brand film analyst and the style gate", /brand-film-analyst/.test(cr) && /brandfilm\.mjs compare/.test(cr));
      ok("lint: the analyst, Motion Director, critic and frame designer prompts carry the brand film rules", /type scale/.test(an) && /Substitute/.test(an) && /contact sheets/.test(an) && /FILM-STYLE\.md` FIRST/.test(md) && /no 3D or hybrid scenes/.test(md) && /style_match/.test(cr2) && /brandfilm\.mjs" compare|brandfilm\.mjs\" compare/.test(cr2 + fr), "agents");
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
  const badHtml = `<style>.h{text-shadow:0 0 18px #0ff}.k{text-shadow:0 0 12px #f0f}.bg{background:linear-gradient(135deg,#7c3aed,#2563eb)}</style><div class="bg"><h1 class="h">Introducing Tally — seamless bookkeeping!</h1><span>00:12</span><span>120 BPM</span></div><p>It's not just an app, it's your accountant.</p><script>gsap.to(".x",{y:10,repeat:-1,yoyo:true});${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => `tl.from(".e${i}",{opacity:0,y:40,duration:0.6})`).join(";")}</script>`;
  const bad = mk("bad", badHtml, [{ title: "a", duration: 4, on_screen: "Streamline your workflow with our amazing new platform today" }, { title: "b", duration: 4 }, { title: "c", duration: 4 }, { title: "end", duration: 1, on_screen: "Tally" }], 5);
  const good = mk("good", `<style>h1{font-family:"Bricolage Grotesque"}</style><h1>Paper forgets.</h1><p>Tally reads every receipt the moment you get it.</p><script>tl.from(".h",{clipPath:"inset(0 100% 0 0)"});tl.from(".p",{scale:0.9,opacity:0});tl.fromTo(".r",{xPercent:-100},{xPercent:0});tl.from(".n",{y:30,opacity:0});tl.from(".l",{drawSVG:0});tl.from(".c",{x:-60});tl.from(".b",{rotation:-8,scale:0.8});tl.from(".t",{opacity:0})</script>`, [{ title: "Hook", duration: 2.5, on_screen: "Paper forgets." }, { title: "Year", duration: 6, on_screen: "Twelve months of paper." }, { title: "Tap", duration: 4.5, on_screen: "One tap." }, { title: "End", duration: 3, on_screen: "Tally" }], 20);
  const rb = node("slop.mjs", ["--project", bad, "--json"]);
  const rg = node("slop.mjs", ["--project", good, "--json"]);
  let jb = { findings: [] };
  try { jb = JSON.parse(rb.stdout); } catch {}
  const rules = new Set(jb.findings.map((f) => f.rule));
  ok("anti-slop: generic copy, \"not X, it's Y\", neon glow, AI gradient, corner labels, idle loops, everything fading up, unreadable text, no end hold and a looping bed are caught (exit 2)", rb.status === 2 && ["generic-copy", "not-x-its-y", "neon-glow-text", "ai-gradient", "corner-labels", "idle-breathing", "uniform-entrances", "unreadable", "no-end-hold", "music-loop"].every((r) => rules.has(r)), [...rules].join(", ") + rb.stderr);
  ok("anti-slop: a clean project passes", rg.status === 0, rg.stdout.slice(0, 300));
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
  ok("crew: a public product gets the full desk (the brand film analyst in place of the precedent researcher), three writers, a score, an animator per scene and the critics", !roles.some((m) => m.startsWith("precedent-researcher")) && ["product-researcher", "brand-researcher", "screens-researcher", "brand-film-analyst", "research-lead", "script-writer:Bold", "script-editor", "motion-director:score", "scene-animator:4", "motion-director:seams", "critic:film-1"].every((r) => roles.some((m) => m.startsWith(r))), JSON.stringify(roles));
  const lean = J2(C(["plan", "--run", path.join(ws, ".rasanai", "r1"), "--route", "product-launch-video", "--subject", "Tally", "--scenes", "4", "--lean"]));
  ok("crew: --lean drops the precedent, the writers' room and the extra critics", !(lean.phases || []).flatMap((p) => p.members).some((m) => /precedent|script-|critic:(motion|frames)/.test(m)), JSON.stringify(lean.phases && lean.phases.map((p) => p.members)));
  C(["plan", "--run", run, "--route", "product-launch-video", "--subject", "Tally", "--public", "--scenes", "4", "--length", "20"]);
  // the concept gate: a Sonnet-tier critic between the look and the motion score, six questions, evidence and exact fixes
  {
    const phs = (plan.phases || []).map((p) => p.phase);
    ok("crew: the plan has a concept-gate phase after the story and before the score", phs.includes("concept-gate") && phs.indexOf("concept-gate") < phs.indexOf("score") && phs.indexOf("concept-gate") > phs.indexOf("design-systems"), phs.join(","));
    C(["plan", "--run", run, "--route", "product-launch-video", "--subject", "Tally", "--public", "--scenes", "4", "--length", "20"]);
    const cb = J2(C(["brief", "--run", run, "--role", "concept-critic", "--key", "concept-1"]));
    const promptFile = cb.prompt_file || cb.file || cb.prompt || "";
    const ptxt = promptFile && fs.existsSync(path.resolve(ws, promptFile)) ? fs.readFileSync(path.resolve(ws, promptFile), "utf8") : JSON.stringify(cb);
    ok("crew: the concept critic brief carries product_first, the six questions and a faster model", /product_first/.test(ptxt) && /first_watch_clear/.test(ptxt) && /faster model/.test(JSON.stringify(cb)), JSON.stringify(cb).slice(0, 300));
    const cf = path.join(run, "story", "concept-check.json");
    fs.mkdirSync(path.dirname(cf), { recursive: true });
    const ans = (okv) => Object.fromEntries(["product_on_screen_by_3s", "hero_moment", "tone_matches_brief", "end_line_large", "on_brand", "first_watch_clear"].map((k) => [k, okv ? { ok: true, evidence: "beat 1" } : { ok: false, evidence: "beat 1", fix: "open on the real UI" }]));
    fs.writeFileSync(cf, JSON.stringify({ verdict: "pass", answers: ans(false), summary: "x" }));
    const bad = C(["check", "--run", run, "--role", "concept-critic", "--key", "concept-1"]);
    fs.writeFileSync(cf, JSON.stringify({ verdict: "pass", answers: ans(true), summary: "6 of 6" }));
    const good = C(["check", "--run", run, "--role", "concept-critic", "--key", "concept-1"]);
    ok("crew: concept-critic check refuses a pass with failed answers and accepts a complete pass", bad.status !== 0 && /not ok but the verdict is pass/.test(bad.stdout + bad.stderr) && good.status === 0, (bad.stdout + good.stdout).slice(0, 300));
    // the brand-faithful launch pipeline: brand film research phase, the analyst role and its check, the style-match gates
    {
      const bp = J2(C(["plan", "--run", run, "--route", "product-launch-video", "--subject", "ChatGPT for Mac", "--brand", "OpenAI", "--kind", "launch", "--scenes", "4", "--length", "30", "--pace", "fast"]));
      const bph = (bp.phases || []).map((p) => p.phase), bm = (bp.phases || []).flatMap((p) => p.members);
      const planF = JSON.parse(fs.readFileSync(path.join(run, "crew", "plan.json"), "utf8"));
      const ph = (n) => (planF.phases || []).find((p) => p.phase === n) || {};
      ok("crew: a branded launch film plans the brand-film phase (brandfilm.mjs steps + the Sonnet brand-film-analyst) before the design systems", bph.includes("brand-film") && bph.indexOf("brand-film") < bph.indexOf("design-systems") && bm.some((m) => m.startsWith("brand-film-analyst") && /fast/.test(m)) && /brandfilm\.mjs frames/.test(JSON.stringify(ph("brand-film").director_steps)) && /3 minutes/.test(ph("brand-film").when), bph.join(","));
      ok("crew: the style-match gate (brandfilm.mjs compare) is planned after the key frames and after the first draft", bph.includes("style-match-keyframes") && bph.indexOf("style-match-keyframes") > bph.indexOf("keyframes") && bph.indexOf("style-match-keyframes") < bph.indexOf("animate") && bph.includes("style-match-draft") && bph.indexOf("style-match-draft") < bph.indexOf("review-film") && /compare --ref/.test(ph("style-match-keyframes").gate) && /compare --ref/.test(ph("style-match-draft").gate), bph.join(","));
      const un = J2(C(["plan", "--run", path.join(ws, ".rasanai", "r-unbranded"), "--route", "faceless-explainer", "--subject", "tides", "--scenes", "4"]));
      ok("crew: an unbranded explainer has no brand-film phase or style-match gate", !(un.phases || []).some((p) => /brand-film|style-match/.test(p.phase)), JSON.stringify((un.phases || []).map((p) => p.phase)));
      const fb = J2(C(["brief", "--run", run, "--role", "brand-film-analyst"]));
      const fbt = fb.prompt ? fs.readFileSync(path.join(ws, fb.prompt), "utf8") : "";
      ok("crew: the brand-film-analyst brief names the card, the contact sheets, the checklist and a faster model", /Role: brand film analyst/.test(fbt) && /FILM-STYLE\.md/.test(fbt) && /contact sheets/.test(fbt) && /type scale/.test(fbt) && /faster model/.test(JSON.stringify(fb)), JSON.stringify(fb).slice(0, 200));
      const mb = J2(C(["brief", "--run", run, "--role", "motion-director", "--key", "score"]));
      const mbt = mb.prompt ? fs.readFileSync(path.join(ws, mb.prompt), "utf8") : "";
      ok("crew: a branded launch film skips the outside-reference design researcher and the precedent researcher (the brand film covers both) and waits for the brand film card instead", !bph.includes("design-research") && !bm.some((m) => m.startsWith("precedent-researcher")) && /FILM-STYLE\.md\) is accepted/.test(ph("design-systems").when), bph.join(","));
      ok("crew: the Motion Director brief lists FILM-STYLE.md first among its inputs and says flat means no 3D, blur or grain", /brand_film/.test(mbt) && mbt.indexOf("FILM-STYLE.md: the brand film") > -1 && mbt.indexOf("FILM-STYLE.md: the brand film") < mbt.indexOf("design system (its Motion") && /no 3D, no blur, no grain/.test(mbt) && /READ \S*FILM-STYLE\.md\S* FIRST|READ FIRST/.test(mbt), mbt.slice(mbt.indexOf("Dispatch"), mbt.indexOf("Dispatch") + 600));
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
    spine: "the receipt", motif: { what: "the total", scenes: [1, 2, 4] }, showreel: [{ scene: 2, t: 3.8, what: "the receipt folds into the ledger row" }, { scene: 3, t: 0.4, what: "the push-through reveal" }], rhythm: "fast-SLOW-fast-hold", signature: { seam: "2>3", technique: "push-through", why: "the reveal" },
    video_direction: { palette: "p", motion_grammar: "g", holds: "h", negative: ["no drift"] },
    depth: { plan: "2D film; the reveal (scene 3) lifts the ledger into depth" },
    scenes: [3, 4, 2.5, 3].map((d, i) => ({ n: i + 1, title: `S${i + 1}`, duration: d, energy: [2, 3, 5, 2][i], layout: ["full-bleed", "split", "centered", "asymmetric 60/40"][i], camera: "T1 lean-in",
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
  const bad = JSON.parse(JSON.stringify(good));
  delete bad.seams[0].in.speed;
  bad.showreel = [];
  bad.scenes[1].duration = 6;
  bad.scenes.forEach((s) => (s.energy = 3));
  put(bad);
  const b = C(["check", "--run", run, "--role", "motion-director", "--key", "score"]);
  ok("crew: the score check catches a half-stated handoff, a changed duration, a flat energy curve and no showreel moments", b.status === 2 && /in: missing speed/.test(b.stdout) && /scenes\.json says 4s/.test(b.stdout) && /no peak/.test(b.stdout) && /showreel names 0/.test(b.stdout), b.stdout.slice(0, 500));
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
  // the score into a storyboard written by scenes.mjs (parsed by the workflow's parser when installed), twice: same file
  const proj = path.join(ws, "videos", "tally");
  const sj = path.join(ws, "scenes-in.json");
  fs.writeFileSync(sj, JSON.stringify({ title: "T", message: "m", aspect: "16:9", narration: false, scenes: [3, 4, 2.5, 3].map((d, i) => ({ title: `S${i + 1}`, on_screen: `Line ${i + 1}`, visual: "v", duration: d })) }));
  const sc = node("scenes.mjs", ["--scenes", sj, "--route", "product-launch-video", "--out", proj]);
  fs.writeFileSync(path.join(proj, "BRIEF.md"), "---\nworkflow: product-launch-video\n---\n\n## Customizations\n\n- x\n");
  const s1 = C(["storyboard", "--run", run, "--project", proj]);
  const t1 = fs.existsSync(path.join(proj, "STORYBOARD.md")) ? fs.readFileSync(path.join(proj, "STORYBOARD.md"), "utf8") : "";
  C(["storyboard", "--run", run, "--project", proj]);
  const t2 = fs.existsSync(path.join(proj, "STORYBOARD.md")) ? fs.readFileSync(path.join(proj, "STORYBOARD.md"), "utf8") : "";
  ok("crew: storyboard writes the score as the visual design (video direction, shots, handoffs, transition_in), idempotent", sc.status === 0 && s1.status === 0 && t1 === t2 && /## Video direction/.test(t1) && /handoff_in: receipt · x 960/.test(t1) && /Scene 2 \(1\.5–3\.0s\)/.test(t1) && (t1.match(/^- transition_in: cut$/gm) || []).length === 4 && /Visual design \(done\)/.test(fs.readFileSync(path.join(proj, "BRIEF.md"), "utf8")), (s1.stderr || s1.stdout).slice(0, 300));
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
  const genSpec = ({ canvas, ink, accent, face, layout, text = "Every receipt, counted.", ease = "power4.out", throws = false, tl = true }) => `<!doctype html><html><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=${face.replace(/ /g, "+")}:wght@700&display=swap" rel="stylesheet"><script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"></script><style>*{margin:0;box-sizing:border-box}html,body{width:1600px;height:900px;overflow:hidden;background:${canvas}}#root{position:relative;width:1600px;height:900px;background:${canvas};color:${ink};font-family:"${face}",sans-serif}h1{position:absolute;font-size:120px;font-weight:700;line-height:1;${layout === "L" ? "left:80px;top:80px;width:600px" : layout === "B" ? "left:80px;bottom:60px;width:1400px" : "right:60px;top:380px;width:560px;text-align:right;font-size:70px"}}.bars i{position:absolute;background:${ink};${layout === "L" ? "right:0;top:0;bottom:0;width:560px" : layout === "B" ? "left:0;right:0;top:0;height:420px" : "left:0;top:0;bottom:0;width:700px"}}.m{position:absolute;background:${accent};width:140px;height:60px;${layout === "L" ? "left:80px;bottom:80px" : layout === "B" ? "right:80px;bottom:80px" : "left:760px;top:120px"}}</style></head><body><div id="root" data-width="1600" data-height="900"><div class="bars"><i></i></div><h1 id="h">${text}</h1><div class="m" id="m"></div></div><script>${throws ? "nope.missing();" : ""}${tl ? `var tl=gsap.timeline({paused:true});tl.from("#h",{opacity:0,duration:.4,ease:"${ease}"}).from("#m",{scaleX:0,duration:.3,ease:"${ease}"});window.__specimen={tl:tl};tl.progress(1);` : ""}</script></body></html>`;
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
      ok("film style: a flat card refuses a Motion and camera section that adds a dolly, motion blur or grain", /motion is flat/.test(flat), flat.slice(0, 400));
      const lpl = D(["look-payload", "--run", run, "--hook", "Tax season. Again.", "--recommended", "bold"]);
      ok("film style: look-payload refuses to push a branded look that leaves the card's grammar", lpl.status !== 0 && /film style|brand lock/.test(lpl.stdout + lpl.stderr), (lpl.stdout + lpl.stderr).slice(0, 300));
      fs.writeFileSync(bj, saved); fs.writeFileSync(path.join(bd, "DESIGN.md"), bdm);
      fs.rmSync(cardDir, { recursive: true, force: true });
    }
    fs.rmSync(path.join(run, "decisions.json"), { force: true });
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
  for (const name of ["imagegen", "presenter", "brandfilm"]) {
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

fs.rmSync(TMP, { recursive: true, force: true });
console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
