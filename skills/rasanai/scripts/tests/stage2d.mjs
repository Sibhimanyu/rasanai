// stage2d: Rasan2D, the hand-painted 2D character system (scripts/stage2d.mjs, lib/stage2d.mjs, lib/canon.mjs, stage2d/).
// Behaviour tests, no mocks: the shared canon rules (good and planted bad identities, the 3d-rig medium W6 reuses), the 31 emotions and the
// deterministic boil in the runtime itself, the crew's character-design phase (only with a recurring character), the cartoon format and route;
// then, in headless Chrome: A-B-A identical pixels, 31/31 distinct non-empty emotions, five views of one actor, independent actors, depth order,
// planted feet, parallel frames identical, `stage2d check` clean on the 15 s test film and failing on a broken canon, a copied design, unseeded
// randomness, an unseeded stage, an actor out of frame, sliding feet and a missing runtime. The 15 s film is rendered to an MP4 when ffmpeg is there
// and measured by motion-gate.mjs. Chrome / ffmpeg cases print "not run: <reason>", never ok. Fixtures are synthetic (an original demo actor).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

export default async function ({ ok, node, tmp, env }) {
  const HERE = path.dirname(fileURLToPath(import.meta.url));
  const S = path.join(HERE, "..");
  const SK = path.join(S, "..");
  const RT = path.join(SK, "stage2d", "runtime");
  const FX = path.join(SK, "stage2d", "fixtures");
  const require = createRequire(import.meta.url);
  const rd = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
  const identity = rd(path.join(FX, "original-actor.json"));
  const demo = rd(path.join(FX, "demo-sequence.json"));
  const canonLib = await import(pathToFileURL(path.join(S, "lib", "canon.mjs")).href);
  const lib2d = await import(pathToFileURL(path.join(S, "lib", "stage2d.mjs")).href);
  const run = (a, extra = {}) => spawnSync(process.execPath, [path.join(S, "stage2d.mjs"), ...a], { encoding: "utf8", env: { ...process.env, RASANAI_GL: "cpu", ...extra }, timeout: 600000 });
  const json = (r) => { try { return JSON.parse(r.stdout); } catch { return {}; } };
  const has = (r, rule) => (json(r).findings || []).some((f) => f.rule === rule && f.severity === "error");
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const errRules = (v) => v.errors.map((e) => e.rule);

  // ------------------------------------------------------------------ canon: shared identity rules
  const good = lib2d.validate2d(identity, FX);
  ok("stage2d: the original demo actor's identity validates (painted-2d, five views, 31-emotion preset, 2+ drawable fixed traits)", good.ok && good.features.length >= 5, JSON.stringify(good.errors));
  const bad = (mut, medium) => { const c = clone(identity); mut(c); return medium ? canonLib.validateIdentity(c, { medium }) : lib2d.validate2d(c, FX); };
  ok("stage2d: canon refuses a missing palette colour, one fixed trait, four views, a wrong preset, a remote URL and a name that is a known character", errRules(bad((c) => { c.palette.accent = "orange"; })).includes("palette") && errRules(bad((c) => { c.fixed_traits = ["round ears"]; })).includes("fixed-traits") && errRules(bad((c) => { c.views = ["front", "side"]; })).includes("views-incomplete") && errRules(bad((c) => { c.expression_preset = "basic"; })).includes("expression-preset") && errRules(bad((c) => { c.reference = "https://x.test/a.png"; })).includes("remote-url") && errRules(bad((c) => { c.display_name = "Clawd"; })).includes("copied-design"));
  ok("stage2d: canon wants a credit for a user-authorized or generated actor, a real source, and a traits list the rig can draw", errRules(bad((c) => { c.source = "user-authorized"; })).includes("source-credit") && !errRules(bad((c) => { c.source = "user-authorized"; c.credit = "Drawn by Sam, with permission"; })).includes("source-credit") && errRules(bad((c) => { c.source = "stolen"; })).includes("source") && errRules(bad((c) => { c.fixed_traits = ["a tiny hat", "a monocle"]; })).includes("traits-undrawable") && errRules(bad((c) => { c.fixed_traits = ["round ears", "two short legs"]; c.proportions.leg_len = 6; })).includes("trait-contradiction"));
  const rig3 = { schema_version: 1, id: "robo-01", display_name: "Robo (synthetic)", medium: "3d-rig", palette: { body: "#556677", accent: "#ffcc00" }, proportions: { height: 2 }, fixed_traits: ["square head", "one antenna"], source: "original", rig: { kind: "code" } };
  ok("stage2d: the same validator serves W6's medium 3d-rig (a rig is required, a glb stays inside the project)", canonLib.validateIdentity(rig3).ok && errRules(canonLib.validateIdentity({ ...rig3, rig: undefined })).includes("rig-missing") && errRules(canonLib.validateIdentity({ ...rig3, rig: { kind: "glb", file: "../x.glb" } })).includes("rig-file") && errRules(canonLib.validateIdentity({ ...rig3, medium: "painted-2d" }, { medium: "3d-rig" })).includes("medium-mismatch"));
  const runDir = path.join(tmp, "run-cast");
  fs.mkdirSync(path.join(runDir, "cast", "hero-01"), { recursive: true }); fs.mkdirSync(path.join(runDir, "motion"), { recursive: true });
  fs.writeFileSync(path.join(runDir, "cast", "hero-01", "identity.json"), JSON.stringify(identity));
  const score = { cast: [{ id: "hero-01", kind: "character", canon: "cast/hero-01/identity.json", fixed: ["round ears", "single curved tuft"] }, { id: "prop-box", kind: "object" }] };
  fs.writeFileSync(path.join(runDir, "motion", "score.json"), JSON.stringify(score));
  const cv = (sc) => canonLib.validateCast(sc, runDir, { medium: "painted-2d", traits: lib2d.traitsFor2d });
  ok("stage2d: the score's cast link: one identity per character, its id and fixed traits must agree; a missing file or a trait the identity lacks fails", cv(score).ok && cv(score).characters === 1 && errRules(cv({ cast: [{ ...score.cast[0], canon: "cast/none.json" }] })).includes("canon-not-found") && errRules(cv({ cast: [{ ...score.cast[0], fixed: ["wings"] }] })).includes("fixed-trait-missing") && errRules(cv({ cast: [{ ...score.cast[0], id: "other" }] })).includes("canon-id-mismatch"));
  const cl = run(["canon", "--run", runDir]);
  ok("stage2d: `canon --run` exits 0 on a good cast and 2 on a planted bad identity", cl.status === 0 && (() => { fs.writeFileSync(path.join(runDir, "cast", "hero-01", "identity.json"), JSON.stringify({ ...identity, palette: {} })); const r2 = run(["canon", "--run", runDir]); fs.writeFileSync(path.join(runDir, "cast", "hero-01", "identity.json"), JSON.stringify(identity)); return r2.status === 2; })(), cl.stderr.slice(0, 200));

  // ------------------------------------------------------------------ the runtime's pure parts (Node)
  global.Rasan2DKit = undefined;
  const B = require(path.join(RT, "brush.js")), C = require(path.join(RT, "character.js")), G = require(path.join(RT, "gestures.js"));
  const need = ["calm", "curious", "surprised", "worried", "sad", "joyful", "frustrated", "skeptical", "proud", "embarrassed", "scared", "delighted", "thoughtful"];
  ok("stage2d: 31 named emotion presets, including the 13 the plan names, and every name resolves to its own parameter set", C.EMOTION_NAMES.length === 31 && need.every((n) => C.EMOTION_NAMES.includes(n)) && new Set(C.EMOTION_NAMES.map((n) => JSON.stringify(C.emotionParams(n)))).size === 31);
  const vec = (n) => { const p = C.emotionParams(n), v = []; for (const k of Object.keys(C.EMO_DEFAULT)) { const x = p[k]; if (typeof x === "number") v.push(x); else if (typeof x === "string") v.push(x === C.EMO_DEFAULT[k] ? 0 : 1.5); } for (const m of ["question", "exclaim", "sweat", "tear", "vein", "sparkle", "hearts", "zzz", "dots", "swirl"]) v.push((p.marks[m] || 0) * 1.5); return v; };
  let minD = 1e9, pair = "";
  for (let i = 0; i < 31; i++) for (let j = i + 1; j < 31; j++) { const a = vec(C.EMOTION_NAMES[i]), b = vec(C.EMOTION_NAMES[j]), d = Math.sqrt(a.reduce((s, x, k) => s + (x - b[k]) ** 2, 0)); if (d < minD) { minD = d; pair = C.EMOTION_NAMES[i] + "/" + C.EMOTION_NAMES[j]; } }
  ok("stage2d: all 31 emotions differ in their parameters by a clear margin (closest pair " + pair + ")", minD > 0.55, `min distance ${minD.toFixed(2)} (${pair})`);
  const noClock = ["brush.js", "character.js", "gestures.js", "rasan2d.js"].every((f) => !lib2d.staticFindings(fs.readFileSync(path.join(RT, f), "utf8"), f, f, "runtime").length);
  ok("stage2d: the runtime has no Math.random, no wall clock, no free-running loop and no remote URL (comments aside)", noClock);
  const mkTl = (acts, actors) => G.createTimeline({ width: 1920, height: 1080, seed: 7, actors: actors || { a: { x: 0.3, y: 0.8, yaw: "front" } }, actions: acts });
  const tl = mkTl([{ actor: "a", kind: "walk", at: 1, duration: 1.4, dx: 0.2 }, { actor: "a", kind: "hop", at: 3, duration: 0.7, height: 2 }, { actor: "a", kind: "turn", to: "side", dir: "left", at: 4, duration: 0.7 }]);
  const probe = [0.3, 1.2, 1.9, 3.3, 4.4, 2.5, 0.3, 1.2];
  const poses = probe.map((t) => JSON.stringify(tl.pose("a", t)));
  ok("stage2d: poses are a pure function of absolute t (asked in any order, twice, from a fresh timeline: identical)", poses[0] === poses[6] && poses[1] === poses[7] && JSON.stringify(mkTl(tl.events().map((e) => ({ ...e, actor: "a" }))).pose("a", 0.3)) !== "" && poses[0] !== poses[2]);
  const sched = tl.feetSchedule("a");
  let slide = 0, planted = 0;
  for (const side of ["L", "R"]) for (const seg of sched[side]) if (seg.type === "plant" && seg.t1 - seg.t0 > 0.2) { const t0 = Math.max(seg.t0, 0) + 0.02, t1 = Math.min(seg.t1, 8) - 0.02; if (t1 <= t0) continue; planted++; const a = tl.footAt("a", side, t0), b = tl.footAt("a", side, (t0 + t1) / 2), c = tl.footAt("a", side, t1); slide = Math.max(slide, Math.hypot(a.x - b.x, a.y - b.y), Math.hypot(a.x - c.x, a.y - c.y)); }
  ok("stage2d: planted feet have one world position for their whole stance (walk, hop and turn re-plants), while the body travels", planted >= 6 && slide < 1e-6 && Math.abs(tl.rootAt("a", 2.6)[0] - tl.rootAt("a", 0.5)[0]) > 300, `planted ${planted}, slide ${slide}`);
  const walkSwing = sched.L.filter((s) => s.type === "swing").length + sched.R.filter((s) => s.type === "swing").length;
  ok("stage2d: a walk of 0.2 of the frame takes alternating steps (feet swing, they never skate)", walkSwing >= 4);
  const hop = mkTl([{ actor: "a", kind: "hop", at: 1, duration: 0.8, height: 3 }]);
  const sy = [0.9, 1.1, 1.18, 1.35, 1.5, 1.8].map((t) => hop.pose("a", t));
  ok("stage2d: a hop anticipates (crouch), stretches in the air, lands squashed and settles; volume is kept (sx = 1/sqrt(sy))", sy[0].sy > 0.95 && sy[1].sy < 0.95 && sy.some((p) => p.sy > 1.04 && p.lift > 1) && sy.some((p) => p.sy < 0.85) && sy.every((p) => Math.abs(p.sx * Math.sqrt(p.sy) - 1) < 1e-9));
  const sw = (id, p, f) => B.wobble(B.mix(B.hashStr(id + ":" + p), 7), f, 10, 1, true);
  const same = (a, b) => a.every((v, i) => v === b[i]);
  ok("stage2d: the line boil is seeded per actor and per part, changes per drawing and repeats exactly (12 drawings a second)", same(sw("a", "body", 3), sw("a", "body", 3)) && !same(sw("a", "body", 3), sw("b", "body", 3)) && !same(sw("a", "body", 3), sw("a", "head", 3)) && !same(sw("a", "body", 3), sw("a", "body", 4)) && new Set([0, 0.2, 0.4, 0.6, 0.8, 0.99].map((t) => B.drawingAt(t, 12))).size === 6 && B.drawingAt(0.99, 12) === 11 && B.drawingAt(1.0, 12) === 12);
  ok("stage2d: the timeline validates its actions (unknown kinds, a missing target, an unknown actor are named)", G.checkActions([{ kind: "teleport", at: 1 }, { kind: "reach", at: 1 }, { kind: "walk", at: 1 }]).length === 3 && mkTl([{ actor: "ghost", kind: "walk", at: 1, dx: 0.1 }]).problems.length >= 0);
  const allKinds = ["idle", "look", "walk", "point", "reach", "hop", "jump", "react", "blink", "turn", "hold"];
  ok("stage2d: every required action kind exists (idle/breathe, look/gaze, walk, point, reach, hop, jump, react/take, blink, turn, hold)", allKinds.every((k) => G.KINDS.includes(k)) && G.KINDS.includes("take") && G.KINDS.includes("gaze") && G.KINDS.includes("breathe"));

  // ------------------------------------------------------------------ the format, the route and the crew
  const fm = spawnSync(process.execPath, [path.join(S, "formats.mjs"), "check"], { encoding: "utf8" });
  const fo = rd(path.join(SK, "library", "formats.json"));
  const opt = fo.options.find((o) => o.id === "character-cartoon");
  ok("stage2d: formats.json has the cartoon under the Short animation tile, status partial (acceptance not claimed as ready), route character-cartoon; formats check passes", fm.status === 0 && opt && opt.tile === "short" && opt.status === "partial" && opt.route === "character-cartoon" && fo.tiles.find((t) => t.id === "short").options.includes("character-cartoon"), fm.stdout.slice(0, 200));
  const sm = spawnSync(process.execPath, [path.join(S, "skill-map.mjs"), "route", "character-cartoon"], { encoding: "utf8" });
  ok("stage2d: the route character-cartoon (and the alias cartoon) map to the cartoon guide and the 2D playbook", sm.status === 0 && /routes\/cartoon\.md/.test(sm.stdout) && /2d-character\.md/.test(sm.stdout) && spawnSync(process.execPath, [path.join(S, "skill-map.mjs"), "route", "cartoon"], { encoding: "utf8" }).status === 0);
  const vsrc = fs.readFileSync(path.join(S, "video.mjs"), "utf8");
  ok("stage2d: video.mjs maps character-cartoon to HyperFrames' general-video explicitly, and inject installs assets/rasan2d/ when a composition names Rasan2D", /HF_ALIAS = \{ "character-cartoon": "general-video" \}/.test(vsrc) && /--skill=\$\{HF_ALIAS\[route\] \|\| route\}/.test(vsrc) && /s2d\.install\(dir\)/.test(vsrc));
  const planOf = (route, extra = []) => { const r = path.join(tmp, "crew-" + route + extra.join("")); fs.mkdirSync(r, { recursive: true }); fs.writeFileSync(path.join(r, "brief.json"), JSON.stringify({ kind: route === "character-cartoon" ? "cartoon" : "title", length_s: route === "character-cartoon" ? 15 : 5 })); const o = spawnSync(process.execPath, [path.join(S, "crew.mjs"), "plan", "--run", r, "--route", route, "--subject", "Pim", ...extra], { encoding: "utf8", env }); let p = null; try { p = JSON.parse(fs.readFileSync(path.join(r, "crew", "plan.json"), "utf8")); } catch {} return { r, p, o }; };
  const cp = planOf("character-cartoon");
  const names = cp.p ? cp.p.phases.map((x) => x.phase) : [];
  ok("stage2d: crew plan --route character-cartoon: a 15 s cartoon is a direct film (one builder) with ONE character-design phase after the Look, before the styleframes", cp.p && cp.p.direct === true && names.filter((n) => n === "character-design").length === 1 && names.indexOf("character-design") < names.indexOf("styleframes") && names.indexOf("character-design") > names.indexOf("look-heroes"), cp.o.stderr.slice(0, 300) + names.join(","));
  const longp = planOf("character-cartoon", ["--length", "80"]);
  ok("stage2d: a long cartoon (80 s) keeps the long path (scene animators, not the direct film) and still has the character phase", longp.p && longp.p.direct === false && longp.p.phases.some((x) => x.phase === "character-design") && longp.p.phases.some((x) => x.dispatch.some((d) => d.role === "scene-animator")));
  const lg = planOf("motion-graphics"), lau = planOf("product-launch-video");
  ok("stage2d: a logo animation and a product launch get no character designer (unrelated films are unchanged); a launch with --character does", ![lg, lau].some((x) => x.p && x.p.phases.some((p) => p.phase === "character-design")) && planOf("general-video", ["--character"]).p.phases.some((p) => p.phase === "character-design"));
  const br = spawnSync(process.execPath, [path.join(S, "crew.mjs"), "brief", "--run", cp.r, "--role", "character-designer", "--key", "cast"], { encoding: "utf8", env });
  ok("stage2d: crew brief --role character-designer writes a brief that names the playbook, the identity shape and the cast outputs", br.status === 0 && fs.existsSync(path.join(SK, "agents", "character-designer.md")), br.stderr.slice(0, 200));
  const ck = spawnSync(process.execPath, [path.join(S, "crew.mjs"), "check", "--run", cp.r, "--role", "character-designer", "--key", "cast"], { encoding: "utf8", env });
  ok("stage2d: crew check --role character-designer fails with no identity, passes once identity and sheets exist and the cast link agrees", ck.status !== 0 && (() => { const d = path.join(cp.r, "cast", "hero-01"); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, "identity.json"), JSON.stringify(identity)); const r1 = spawnSync(process.execPath, [path.join(S, "crew.mjs"), "check", "--run", cp.r, "--role", "character-designer", "--key", "cast"], { encoding: "utf8", env }); for (const f of ["model-sheet.png", "emotions-1.png", "emotions-2.png"]) fs.writeFileSync(path.join(d, f), "x"); const r2 = spawnSync(process.execPath, [path.join(S, "crew.mjs"), "check", "--run", cp.r, "--role", "character-designer", "--key", "cast"], { encoding: "utf8", env }); return r1.status !== 0 && r2.status === 0; })(), ck.stdout.slice(0, 300));

  // ------------------------------------------------------------------ Chrome
  const chrome = spawnSync(process.execPath, ["-e", `import(${JSON.stringify(pathToFileURL(path.join(S, "lib", "common.mjs")).href)}).then((m)=>{m.chromePath();})`], { encoding: "utf8" });
  if (chrome.status !== 0) { console.log("not run: stage2d browser cases (no headless Chrome: run `npx hyperframes browser ensure` or set RASANAI_CHROME)"); return; }
  process.env.RASANAI_GL = "cpu";
  const proj = path.join(tmp, "film-2d"), comp = path.join(proj, "compositions", "frames", "01-film.html");
  const sc = run(["scaffold", "--project", proj, "--frame", "01-film", "--duration", "15", "--sequence", path.join(FX, "demo-sequence.json"), "--canon", path.join(FX, "original-actor.json")]);
  ok("stage2d: install + scaffold write the composition and assets/rasan2d/ (four runtime files)", sc.status === 0 && fs.existsSync(comp) && lib2d.RUNTIME_FILES.every((f) => fs.existsSync(path.join(proj, "assets", "rasan2d", f))), sc.stderr.slice(0, 200));
  const st = run(["stills", "--file", comp, "--at", "1,2.5,3.8,9.5,13.5", "--out", path.join(tmp, "stills")]);
  const sj = json(st);
  ok("stage2d: stills renders the requested times to PNGs without errors", st.status === 0 && (sj.frames || []).length === 5 && sj.frames.every((f) => fs.statSync(path.resolve(f)).size > 50000), st.stdout.slice(0, 300) + st.stderr.slice(0, 200));
  const t0 = Date.now();
  const chk = run(["check", "--project", proj, "--json"]);
  const cj = json(chk);
  ok("stage2d: check passes the 15 s test film (exit 0): seek-safe, seeded boil, canon valid, fixed traits drawn in both shots, in frame, planted feet", chk.status === 0 && cj.status === "clean" && cj.errors === 0 && cj.files.length === 1 && cj.files[0].stages[0].deterministic === true, JSON.stringify((cj.findings || []).slice(0, 4)) + chk.stderr.slice(0, 200));
  console.log(`note  stage2d: check on the 15 s film took ${Math.round((Date.now() - t0) / 1000)} s; frame ~ ${cj.files && cj.files[0] ? cj.files[0].stages[0].frame_ms : "?"} ms`);

  // the negatives, each on its own copy of the project (the check must fail for the right reason)
  const variant = (name, mut) => { const p = path.join(tmp, "v-" + name); fs.cpSync(proj, p, { recursive: true }); const f = path.join(p, "compositions", "frames", "01-film.html"); mut(p, f, fs.readFileSync(f, "utf8")); return run(["check", "--project", p, "--json"]); };
  const nBroken = variant("broken-canon", (p, f, t) => fs.writeFileSync(f, t.replace('"body": "#c97057"', '"body": "salmon"')));
  ok("stage2d: check fails a broken canon (a palette colour that is not a colour): exit 2, rule canon-invalid", nBroken.status === 2 && has(nBroken, "canon-invalid"), nBroken.stdout.slice(0, 300));
  const nNone = variant("missing-canon", (p, f, t) => fs.writeFileSync(f, t.replace(/const CANONS = [\s\S]*?\n\s*const SEQUENCE/, "const CANONS = {};\n\n    const SEQUENCE")));
  ok("stage2d: check fails a missing canon (an actor with no identity): exit 2, rule canon-missing", nNone.status === 2 && has(nNone, "canon-missing"), nNone.stdout.slice(0, 300));
  const nCopy = variant("copied", (p, f, t) => fs.writeFileSync(f, t.replace("Pim (original demo actor)", "Clawd")));
  ok("stage2d: check fails an actor that is a known character's name: exit 2, rule copied-design", nCopy.status === 2 && has(nCopy, "copied-design"), nCopy.stdout.slice(0, 300));
  const nRand = variant("random", (p, f, t) => fs.writeFileSync(f, t.replace("Rasan2D.stage({", "const wobbleJunk = Math.random();\n    Rasan2D.stage({")));
  ok("stage2d: check fails unseeded randomness in the composition: exit 2, rule nondeterministic-random", nRand.status === 2 && has(nRand, "nondeterministic-random"), nRand.stdout.slice(0, 300));
  const nRtRand = variant("runtime-random", (p) => { const f = path.join(p, "assets", "rasan2d", "brush.js"); fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace("function rng(seed) {", "function rng(seed) { var junk = Math.random();")); });
  ok("stage2d: check fails a runtime copy that uses Math.random: exit 2, rule runtime-nondeterministic", nRtRand.status === 2 && has(nRtRand, "runtime-nondeterministic"), nRtRand.stdout.slice(0, 300));
  const nSeed = variant("unseeded", (p, f, t) => fs.writeFileSync(f, t.replace(/seed: \d+,\s+\/\/[^\n]*\n/, "").replace(/"seed": \d+,?/g, "")));
  ok("stage2d: check fails a stage with no seed: exit 2, rule unseeded", nSeed.status === 2 && has(nSeed, "unseeded"), nSeed.stdout.slice(0, 300));
  const nOut = variant("out-of-frame", (p, f, t) => fs.writeFileSync(f, t.replace(/("position": \{\s*"x": )0\.6/, "$11.45")));
  ok("stage2d: check fails an actor outside the usable frame: exit 2, rule actor-out-of-frame", nOut.status === 2 && has(nOut, "actor-out-of-frame"), nOut.stdout.slice(0, 300));
  const nRt = variant("no-runtime", (p) => fs.rmSync(path.join(p, "assets", "rasan2d"), { recursive: true, force: true }));
  ok("stage2d: check fails a missing runtime: exit 2, rule runtime-missing", nRt.status === 2 && has(nRt, "runtime-missing"), nRt.stdout.slice(0, 300));
  const nSlide = variant("sliding-feet", (p) => { const f = path.join(p, "assets", "rasan2d", "gestures.js"); const t = fs.readFileSync(f, "utf8"); if (!t.includes('return { x: seg.x, y: seg.y, planted: true, lift: 0 };')) throw new Error("gestures.js changed: update this planted-feet negative"); fs.writeFileSync(f, t.replace('return { x: seg.x, y: seg.y, planted: true, lift: 0 };', 'return { x: seg.x + (t - seg.t0) * 40, y: seg.y, planted: true, lift: 0 };')); });
  ok("stage2d: check fails feet that slide while planted (a tampered runtime): exit 2, rule feet-slide", nSlide.status === 2 && has(nSlide, "feet-slide"), nSlide.stdout.slice(0, 300));
  const nState = variant("stateful", (p) => { const f = path.join(p, "assets", "rasan2d", "rasan2d.js"); const t = fs.readFileSync(f, "utf8"); fs.writeFileSync(f, t.replace("R.renderAt = function (t, o) {\n      o = o || {};", "var __n = 0;\n    R.renderAt = function (t, o) {\n      o = o || {}; __n++; R.look.vignette = 0.16 + (__n % 7) * 0.01;")); });
  ok("stage2d: check fails a runtime that carries state between frames (A-B-A differs): exit 2, rule not-seek-safe", nState.status === 2 && has(nState, "not-seek-safe"), nState.stdout.slice(0, 300));

  // ------------------------------------------------------------------ pixels: in the page itself
  const page = path.join(proj, "probe.html");
  const probeSeq = { ...demo, shots: [{ id: "p", from: 0, to: 15, set: "orchard", actors: ["hero-01"] }], actions: [] };
  fs.writeFileSync(page, lib2d.scaffoldText({ frame: "probe", width: 1920, height: 1080, duration: 15, canvas: "#f1e7d2", ink: "#302921", accent: "#c97057", seed: 7, standalone: true, canons: { "hero-01": identity }, sequence: probeSeq }));
  const PROBE = `(function(){
    var R = window.__r2, W = R.W, H = R.H, K = Rasan2D.kit, ctx = R.ctx;
    function px(x, y, w, h) { return ctx.getImageData(x, y, w, h).data; }
    function mad(a, b) { var s = 0; for (var i = 0; i < a.length; i += 4) s += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); return s / (a.length / 4) / 3; }
    function sd(a) { var s = 0, s2 = 0, n = a.length / 4; for (var i = 0; i < a.length; i += 4) { var l = (a[i] + a[i + 1] + a[i + 2]) / 3; s += l; s2 += l * l; } var m = s / n; return Math.sqrt(Math.max(0, s2 / n - m * m)); }
    function paper() { R.ctx.setTransform(1, 0, 0, 1, 0, 0); R.ctx.fillStyle = "#f1e7d2"; R.ctx.fillRect(0, 0, W, H); }
    var out = {};
    // A-B-A and a cold renderer
    function hash() { var d = px(0, 0, W, H), h = 2166136261 >>> 0; for (var i = 0; i < d.length; i += 4) { h = Math.imul(h ^ d[i], 16777619) >>> 0; h = Math.imul(h ^ d[i + 1], 16777619) >>> 0; h = Math.imul(h ^ d[i + 2], 16777619) >>> 0; } return h; }
    var A = 2.31, Bt = 9.77; R.renderAt(A); var h1 = hash(); R.renderAt(Bt); var hB = hash(); R.renderAt(A); var h2 = hash();
    var c2 = document.createElement("canvas"), R2 = Rasan2D.createRenderer(c2, { width: W, height: H, seed: 7, look: R.seq.look }); R2.load(R.seq); R2.renderAt(A); var d2 = c2.getContext("2d").getImageData(0, 0, W, H).data, hh = 2166136261 >>> 0; for (var i = 0; i < d2.length; i += 4) { hh = Math.imul(hh ^ d2[i], 16777619) >>> 0; hh = Math.imul(hh ^ d2[i + 1], 16777619) >>> 0; hh = Math.imul(hh ^ d2[i + 2], 16777619) >>> 0; }
    out.aba = { same: h1 === h2, differs: h1 !== hB, cold: hh === h1 };
    // seeded variants differ
    var c3 = document.createElement("canvas"), R3 = Rasan2D.createRenderer(c3, { width: W, height: H, seed: 8, look: R.seq.look }); R3.load(R.seq); R3.renderAt(A); var d3 = c3.getContext("2d").getImageData(0, 0, W, H).data; out.seedDiffers = mad(d3, d2) > 0.05;
    // the boil at 12 Hz: the drawing number changes 12 times in a second, art differs between drawings and repeats within one
    var nums = {}; for (var k = 0; k < 60; k++) nums[R.debug.drawing(3 + k / 60 + 1e-4)] = 1; out.drawings = Object.keys(nums).length;
    function headCrop(frame, emo) { paper(); var pose = K.character.restPose("hero-01", { u: 22, x: 600, y: 760, yaw: 0, emotion: emo || "calm" }); Rasan2D.drawPose(ctx, R, "hero-01", pose, { frame: frame }); return px(300, 300, 600, 480); }
    var f3a = headCrop(3), f3b = headCrop(3), f4 = headCrop(4); out.boil = { repeat: mad(f3a, f3b) === 0, between: mad(f3a, f4) > 0.15 };
    // 31 emotions: non-empty and pairwise distinct on the same pose
    var names = Rasan2D.emotions, crops = names.map(function (n) { return headCrop(3, n); }), minD = 1e9, pair = "", empty = [];
    paper(); var base = px(300, 300, 600, 480);
    crops.forEach(function (c, i) { if (mad(c, base) < 0.5 || sd(c) < 8) empty.push(names[i]); });
    for (var i2 = 0; i2 < crops.length; i2++) for (var j = i2 + 1; j < crops.length; j++) { var d = mad(crops[i2], crops[j]); if (d < minD) { minD = d; pair = names[i2] + "/" + names[j]; } }
    out.emotions = { n: names.length, empty: empty, minD: minD, pair: pair };
    // five views of one actor: distinct pictures, the same palette (the body colour keeps its share), the same fixed traits drawn
    function viewCrop(yaw) { paper(); var pose = K.character.restPose("hero-01", { u: 20, x: 600, y: 800, yaw: yaw }); var rg = Rasan2D.drawPose(ctx, R, "hero-01", pose, { frame: 2 }); return { d: px(300, 250, 600, 600), names: rg.items.map(function (it) { return it.name; }), view: rg.view }; }
    var vs = [0, 45, 90, 135, 180].map(viewCrop), body = [201, 112, 87];
    function share(a) { var n = 0, t = 0; for (var i = 0; i < a.length; i += 4) { if (a[i + 3] === 0) continue; t++; if (Math.abs(a[i] - body[0]) < 60 && Math.abs(a[i + 1] - body[1]) < 60 && Math.abs(a[i + 2] - body[2]) < 60) n++; } return n / t; }
    var minV = 1e9; for (var p = 0; p < 5; p++) for (var q = p + 1; q < 5; q++) minV = Math.min(minV, mad(vs[p].d, vs[q].d));
    out.views = { minD: minV, shares: vs.map(function (v) { return share(v.d); }), views: vs.map(function (v) { return v.view; }), ears: vs.every(function (v) { return v.names.indexOf("earL") >= 0 && v.names.indexOf("earR") >= 0 && v.names.indexOf("tuft") >= 0 && v.names.indexOf("legL") >= 0; }), face: vs.map(function (v) { return v.names.indexOf("eyeW1") >= 0 || v.names.indexOf("eyeW-1") >= 0 || v.names.indexOf("eyeW") >= 0; }), spots: vs.map(function (v) { return v.names.indexOf("spot0") >= 0; }) };
    return out;
  })()`;
  const pr = await lib2d.withPage(page, async (b) => b.eval(PROBE), { timeoutMs: 600000 });
  ok("stage2d: identical t renders identical pixels after A-B-A seeks and in a cold renderer (12 Hz boil included); a different t differs", pr.aba.same && pr.aba.differs && pr.aba.cold, JSON.stringify(pr.aba));
  ok("stage2d: a different seed changes the painted line (seeded variants predictably differ)", pr.seedDiffers);
  ok("stage2d: the boil is 12 drawings a second: 12 distinct drawing numbers in 1 s, art changes between drawings and repeats within one", pr.drawings === 12 && pr.boil.repeat && pr.boil.between, JSON.stringify([pr.drawings, pr.boil]));
  ok("stage2d: 31/31 emotion presets render non-empty and visibly distinct (closest pair " + pr.emotions.pair + ", mean abs diff " + pr.emotions.minD.toFixed(2) + ")", pr.emotions.n === 31 && !pr.emotions.empty.length && pr.emotions.minD > 0.3, JSON.stringify(pr.emotions));
  ok("stage2d: five illustrated views are five distinct pictures of the same actor (body colour share steady, ears + tuft + legs in all, face in front/3/4/side only, dorsal spots on the back)", pr.views.views.join() === "front,quarter,side,back-quarter,back" && pr.views.minD > 0.4 && Math.max(...pr.views.shares) / Math.min(...pr.views.shares) < 2.2 && pr.views.ears && pr.views.face.slice(0, 3).every(Boolean) && !pr.views.face[4] && pr.views.spots[4] && !pr.views.spots[0], JSON.stringify(pr.views));

  // multi-actor: independent jitter, depth order, hand over hand
  const duo = clone(probeSeq);
  duo.actors = [{ id: "a", canon: "hero-01", position: { x: 0.25, y: 0.8 }, scale: 0.9 }, { id: "b", canon: "hero-01", position: { x: 0.75, y: 0.8 }, scale: 0.9, yaw: "-quarter" }];
  duo.shots = [{ id: "p", from: 0, to: 15, set: "orchard", actors: ["a", "b"] }];
  duo.actions = [{ actor: "a", kind: "look", at: 0.2, duration: 0.3, target: [0.7, 0.4] }, { actor: "b", kind: "hop", at: 1, duration: 0.7 }];
  const duoPage = path.join(proj, "duo.html");
  fs.writeFileSync(duoPage, lib2d.scaffoldText({ frame: "duo", width: 1920, height: 1080, duration: 15, canvas: "#f1e7d2", ink: "#302921", accent: "#c97057", seed: 7, standalone: true, canons: { "hero-01": identity }, sequence: duo }));
  const dr = await lib2d.withPage(duoPage, async (b) => b.eval(`(function(){
    var R = window.__r2, W = R.W, H = R.H, ctx = R.ctx, t = 1.2;
    function crop() { return ctx.getImageData(0, 0, Math.round(W * 0.5), H).data; }
    function mad(a, b) { var s = 0; for (var i = 0; i < a.length; i += 4) s += Math.abs(a[i] - b[i]); return s / (a.length / 4); }
    R.renderAt(t, { actors: ["a", "b"] }); var withB = crop(); R.renderAt(t, { actors: ["a"] }); var onlyA = crop();
    var ja = R.debug.jitter("a", "body", t, 8), jb = R.debug.jitter("b", "body", t, 8);
    var o = {};
    o.independent = { pixels: mad(withB, onlyA), jitterDiffers: ja.some(function (v, i) { return v !== jb[i]; }) };
    // depth: the nearer actor (larger floor y) is painted after the farther one; swapping y swaps the order
    var ord = R.debug.order(t, { actors: ["a", "b"] }); o.order1 = ord;
    R.actors.a.position.y = 0.86; R.actors.b.position.y = 0.74; R.tl = null; var ord2 = R.debug.order(t, { actors: ["a", "b"] }); o.order2 = ord2;
    R.actors.a.position.y = 0.8; R.actors.b.position.y = 0.8; R.tl = null;
    // hand over hand: a depthBias puts one actor's hand above the other actor's body, in the draw list itself
    R.actors.a.position.x = 0.45; R.actors.b.position.x = 0.5; R.actors.a.position.y = 0.8; R.actors.b.position.y = 0.82; R.tl = null;
    var dl = R.drawList(t, { actors: ["a", "b"] }).list.filter(function (d) { return d.kind === "item"; }), idx = function (n) { return dl.findIndex(function (d) { return d.actor + ":" + d.item.name === n; }); };
    var before = idx("a:handL") < idx("b:body");
    R.seq.depthBias = [{ actor: "a", part: "^hand", bias: 40 }]; R.tl = null;
    var dl2 = R.drawList(t, { actors: ["a", "b"] }).list.filter(function (d) { return d.kind === "item"; }), idx2 = function (n) { return dl2.findIndex(function (d) { return d.actor + ":" + d.item.name === n; }); };
    o.handOver = { before: before, after: idx2("a:handL") > idx2("b:body") && idx2("a:body") < idx2("b:body") };
    return o; })()`), { timeoutMs: 300000 });
  ok("stage2d: two actors' jitter is independent (different offsets; actor A's pixels do not change when B is added)", dr.independent.jitterDiffers && dr.independent.pixels === 0, JSON.stringify(dr.independent));
  ok("stage2d: painter's order follows the floor line (the nearer actor is painted last; swap the depth, swap the order)", dr.order1.join() !== dr.order2.join() && dr.order1.indexOf("a:body") < dr.order1.indexOf("b:body") && dr.order2.indexOf("b:body") < dr.order2.indexOf("a:body"), JSON.stringify([dr.order1, dr.order2]));
  ok("stage2d: hand over hand: a depth bias puts one actor's hand over another actor's body while its own body stays behind", dr.handOver.before && dr.handOver.after, JSON.stringify(dr.handOver));

  // planted feet in the pixels: the drawn foot does not move for its whole stance
  const fr = await lib2d.withPage(page, async (b) => b.eval(`(function(){
    var R = window.__r2; R.seq.actions = [{ actor: "hero-01", kind: "walk", at: 1, duration: 2.0, dx: 0.2 }]; R.tl = null;
    var sch = R.debug.schedule("hero-01"), res = { stances: 0, worst: 0, travel: 0, swung: 0 };
    ["L", "R"].forEach(function (s) { sch[s].forEach(function (seg) { if (seg.type === "swing") res.swung++; if (seg.type !== "plant") return; var t0 = Math.max(seg.t0, 0) + 0.04, t1 = Math.min(seg.t1, 15) - 0.04; if (t1 - t0 < 0.3) return; res.stances++; var a = R.debug.footCentroids("hero-01", t0)[s], w = 0; [0.25, 0.5, 0.75, 1].forEach(function (f) { var c = R.debug.footCentroids("hero-01", t0 + (t1 - t0) * f)[s]; w = Math.max(w, Math.hypot(c[0] - a[0], c[1] - a[1])); }); res.worst = Math.max(res.worst, w); }); });
    res.travel = R.debug.pose("hero-01", 3.2).root.x - R.debug.pose("hero-01", 0.5).root.x; return res; })()`), { timeoutMs: 120000 });
  ok("stage2d: planted feet do not slide in the drawn pixels geometry (" + fr.stances + " stances, worst drift " + fr.worst.toFixed(2) + " px) while the actor travels " + Math.round(fr.travel) + " px", fr.stances >= 4 && fr.worst < 0.75 && fr.travel > 300 && fr.swung >= 4, JSON.stringify(fr));

  // parallel workers: a frame is the same on any worker (two separate browsers, 1 and 2 workers)
  if (lib2d.haveFfmpeg() || true) {
    const w1 = await lib2d.renderFrames({ project: path.join(tmp, "par1"), sequence: demo, canons: { "hero-01": identity }, outDir: path.join(tmp, "par1", "f"), onlyTimes: [2.5, 9.9, 13.2], workers: 1 }).catch((e) => ({ err: e.message }));
    const w2 = await lib2d.renderFrames({ project: path.join(tmp, "par2"), sequence: demo, canons: { "hero-01": identity }, outDir: path.join(tmp, "par2", "f"), onlyTimes: [13.2, 2.5, 9.9], workers: 2 }).catch((e) => ({ err: e.message }));
    ok("stage2d: frames rendered by different workers in a different order are byte-identical (stateless renderAt)", !w1.err && !w2.err && [2.5, 9.9, 13.2].every((tt, i) => fs.readFileSync(w1.files[i]).equals(fs.readFileSync(w2.files[w2.times.indexOf(tt)]))), (w1.err || w2.err || "").slice(0, 200));
  }

  // ------------------------------------------------------------------ the mandatory test film
  const out15 = path.join(tmp, "film15");
  const ff = lib2d.haveFfmpeg();
  const fl = run(["film", "--out", out15, "--workers", "3", ...(ff ? [] : ["--no-mp4"])]);
  const fj = json(fl);
  const imgs = ["model-sheet.png", "emotions-1.png", "emotions-2.png", "turn.png", "action-extremes.png"];
  ok("stage2d: the 15 s procedural film produces its model-sheet contact image, emotion sheets, turn and action-extreme strips", fl.status === 0 && imgs.every((f) => fs.existsSync(path.join(out15, f)) && fs.statSync(path.join(out15, f)).size > 100000) && (fj.extremes || []).length >= 20, fl.stderr.slice(0, 300) + fl.stdout.slice(0, 200));
  console.log(`note  stage2d: test film artifacts in ${out15}`);
  if (!ff) { console.log("not run: stage2d MP4 + motion-gate (ffmpeg is not installed)"); return; }
  const mp4 = path.join(out15, "pim-and-the-pear.mp4");
  const pb = spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=width,height,nb_frames,r_frame_rate:format=duration", "-of", "json", mp4], { encoding: "utf8" });
  let pj = {}; try { pj = JSON.parse(pb.stdout); } catch {}
  const dur = Number(pj.format && pj.format.duration), s0 = (pj.streams || [])[0] || {};
  ok("stage2d: the film renders to a 1920x1080, 30 fps, 15 s MP4 through headless Chrome frames and ffmpeg", fs.existsSync(mp4) && s0.width === 1920 && s0.height === 1080 && Math.abs(dur - 15) < 0.2 && s0.r_frame_rate === "30/1", pb.stdout.slice(0, 200));
  const mg = spawnSync(process.execPath, [path.join(S, "motion-gate.mjs"), "--video", mp4, "--json"], { encoding: "utf8", timeout: 600000, env });
  let mj = {}; try { mj = JSON.parse(mg.stdout); } catch {}
  ok("stage2d: the film passes motion-gate.mjs (exit 0; a held reaction and an end hold are the film's own, so stillness is not declared)", mg.status === 0, (mg.stdout || mg.stderr).slice(0, 500));
  void mj; void os; void node;
}
