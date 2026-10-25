// canon3d. a recurring 3D actor with an enforceable on-model canon (scripts/tests/canon3d.mjs; stage3d/character-rig.js, lib/canon3d.mjs, lib/canon.mjs, canon.mjs).
// Behaviour tests, no mocks. Pure: the 3d-rig identity rules (good, planted bad, strict vs shape-only), the seal, the scene contract's cast-canon
// warnings for cast states, the seek-safe actions (A-B-A, the five reusable actions, a walk that arrives, a hop that lands), the visual metric on
// synthetic masks (pass / uncertain / fail), the crew's character role for a 3D cast. In headless Chrome with software GL: the model sheet (one actor, four
// views and five actions), the SAME actor in two separately rendered 3D scenes (a walk and a look; a point, two hops, a prop in the hand and a permitted
// outfit swap) with no palette, silhouette, accessory or face drift, A-B-A and two independent renders identical, a prop that stays on the hand point,
// `stage3d.mjs check` still clean, and the planted failures: a stretched body, a hidden scarf, a removed ear, a recoloured body, a forbidden swap, a stale
// identity copy, a modified shared rig, a non-uniform scale; while a uniform scale and every pose are not false failures; an uncertain view goes to the
// frame juror, tagged. Chrome cases print "not run: <reason>", never ok. The actor is an ORIGINAL SYNTHETIC fixture (stage3d/templates/original-actor-3d.json).
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

export default async function ({ ok, node, tmp, env }) {
  const HERE = path.dirname(fileURLToPath(import.meta.url));
  const S = path.join(HERE, "..");
  const SK = path.join(S, "..");
  const require = createRequire(import.meta.url);
  const rd = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const imp = (f) => import(pathToFileURL(path.join(S, "lib", f)).href);
  const canonLib = await imp("canon.mjs"), c3 = await imp("canon3d.mjs"), contract = await imp("scene-contract.mjs");
  const rig = require(path.join(SK, "stage3d", "character-rig.js"));
  const FIX = path.join(SK, "stage3d", "templates", "original-actor-3d.json");
  const fixture = rd(FIX);
  const cli = (a, extra = {}) => spawnSync(process.execPath, [path.join(S, "canon.mjs"), ...a], { encoding: "utf8", env: { ...process.env, RASANAI_GL: "cpu", ...extra }, timeout: 900000 });
  const json = (r) => { try { return JSON.parse(r.stdout); } catch { return {}; } };
  const rules = (r, sev = "error") => (json(r).findings || []).filter((f) => f.severity === sev).map((f) => f.rule);
  const errRules = (v) => v.errors.map((e) => e.rule);
  const strict = (id, dir) => canonLib.validateIdentity(id, { medium: "3d-rig", strict: true, baseDir: dir, traits: c3.traitsFor3d });
  const mk = (mut) => { const c = clone(fixture); mut(c); return c; };

  // ------------------------------------------------------------------ the canon: one identity.json for both media
  const good = strict(fixture, path.dirname(FIX));
  ok("canon3d: the original synthetic fixture validates strictly as a 3d-rig actor (7 fixed traits the rig draws, no errors)", good.ok && good.features.length === 7, JSON.stringify(good.errors));
  ok("canon3d: the painted 2D fixture still validates and the shape-only 3d-rig of W5 (no builder, no camera) still passes: W6 added strictness, not new requirements for W5", canonLib.validateIdentity(rd(path.join(SK, "stage2d", "fixtures", "original-actor.json")), { medium: "painted-2d" }).ok && canonLib.validateIdentity({ schema_version: 1, id: "robo-01", display_name: "Robo (synthetic)", medium: "3d-rig", palette: { body: "#556677", accent: "#ffcc00" }, proportions: { height: 2 }, fixed_traits: ["square head", "one antenna"], source: "original", rig: { kind: "code" } }).ok);
  const bad = (name, m, rule) => ok(`canon3d: the canon refuses ${name} (${rule})`, errRules(strict(mk(m))).includes(rule), JSON.stringify(errRules(strict(mk(m)))));
  bad("no camera_reference (the on-model views need it)", (c) => { delete c.camera_reference; }, "camera-reference");
  bad("no materials", (c) => { delete c.materials; }, "materials");
  bad("no attachment points for the hand", (c) => { c.attachments = ["head_top"]; }, "attachments");
  bad("an unknown rig builder", (c) => { c.rig.builder = "mystery"; }, "rig-builder");
  bad("a body colour that may be swapped", (c) => { c.palette_swappable = ["body"]; }, "palette-swappable");
  bad("an outfit that changes a locked colour", (c) => { c.outfits[0].colors.leaf = "#112233"; }, "outfit-locked");
  bad("an action kind the adapter lacks", (c) => { c.actions.push("teleport"); }, "actions");
  bad("a glb with no file", (c) => { c.rig = { kind: "glb" }; }, "rig-file");
  bad("a name that is a known character", (c) => { c.display_name = "Pikachu"; }, "copied-design");
  bad("a remote model sheet", (c) => { c.model_sheet = "https://example.com/pomo.png"; }, "remote-url");
  bad("fewer than two fixed traits the rig draws", (c) => { c.fixed_traits = ["tall hat", "silver boots", "round ears"]; }, "traits-undrawable");
  ok("canon3d: a glb rig validates but is flagged blocked (the adapter needs the unmerged rigged-actor API; it refuses to build one)", (() => { const v = strict(mk((c) => { c.rig = { kind: "glb", file: "assets/models/x.glb" }; }), tmp); return v.warnings.some((w) => w.rule === "rig-glb-blocked"); })());
  ok("canon3d: without strict, the missing 3D fields are warnings (the same identity.json is checked at design time before everything is written)", (() => { const c = clone(fixture); delete c.camera_reference; delete c.materials; const v = canonLib.validateIdentity(c, { medium: "3d-rig", baseDir: tmp }); return v.ok && v.warnings.some((w) => w.rule === "camera-reference") && v.warnings.some((w) => w.rule === "materials"); })());
  // the seal: a changed body ratio, fixed trait, material or locked colour after sealing is a decision, not drift; a swappable colour is free
  const sealed = clone(fixture); sealed.rig_hash = canonLib.rigAssetHash(sealed);
  ok("canon3d: a sealed canon validates; a changed proportion, a dropped fixed trait, a new material or a changed locked colour breaks the seal; an outfit colour and the notes do not", strict(sealed).ok
    && errRules(strict({ ...sealed, proportions: { ...sealed.proportions, body_w: 11 } })).includes("rig-hash-changed")
    && errRules(strict({ ...sealed, fixed_traits: sealed.fixed_traits.slice(1) })).includes("rig-hash-changed")
    && errRules(strict({ ...sealed, materials: { ...sealed.materials, body: "ceramic" } })).includes("rig-hash-changed")
    && errRules(strict({ ...sealed, palette: { ...sealed.palette, body: "#e8a360" } })).includes("rig-hash-changed")
    && strict({ ...sealed, palette: { ...sealed.palette, scarf: "#123456" }, notes: "edited" }).ok);

  // ------------------------------------------------------------------ the score's link and the scene contract (the existing cast-canon warnings)
  const mkRun = (name, identity, score) => {
    const r = path.join(tmp, name);
    fs.mkdirSync(path.join(r, "cast", identity.id), { recursive: true }); fs.mkdirSync(path.join(r, "motion"), { recursive: true });
    fs.writeFileSync(path.join(r, "cast", identity.id, "identity.json"), JSON.stringify(identity, null, 2));
    fs.writeFileSync(path.join(r, "motion", "score.json"), JSON.stringify(score));
    return r;
  };
  const cast = [{ id: "pomo-3d", kind: "character", canon: "cast/pomo-3d/identity.json", fixed: ["round ears", "leaf sprout", "striped scarf"] }, { id: "ball", kind: "object" }];
  const scenes = (inn, out) => [{ n: 1, id: "meadow", duration: 6, space: "3d", cast_state: { in: { "pomo-3d": inn }, out: { "pomo-3d": out || inn } } }, { n: 2, id: "hilltop", duration: 6, space: "3d" }];
  const rcast = mkRun("run-cast", sealed, { cast, scenes: scenes({ where: "0.3,0.8", facing: "front" }) });
  const vc = canonLib.validateCast({ cast }, rcast, { traitsByMedium: { "3d-rig": c3.traitsFor3d } });
  ok("canon3d: score.cast -> identity.json: the actor's id and fixed traits agree (one source of truth), the medium comes from the identity", vc.ok && vc.characters === 1 && vc.rows[0].medium === "3d-rig" && !canonLib.validateCast({ cast: [{ ...cast[0], fixed: ["a silver crown"] }] }, rcast).ok);
  const warn = (inn, out) => contract.sceneContractChecks({ cast, scenes: scenes(inn, out) }, { run: rcast }).W;
  ok("canon3d: the scene contract's cast-canon rules read a clean 3D cast with no new warning", !warn({ where: "0.3,0.8", facing: "front", outfit: "winter", action: "walk" }).some((w) => /^cast-canon/.test(w)), JSON.stringify(warn({ where: "0.3,0.8", outfit: "winter", action: "walk" })));
  ok("canon3d: ...and warns, under the same cast-canon names, on a scene that edits identity (palette, a dropped trait, a recolour the canon forbids, an unlisted outfit, an action the rig lacks)", (() => {
    const w = warn({ where: "0.3,0.8", palette: { body: "#fff" }, without: ["leaf sprout"], colors: { body: "#f00" }, outfit: "tuxedo", action: "moonwalk" });
    return /cast-canon-drift: scene 1 cast_state\.in\.pomo-3d sets palette/.test(w.join("\n")) && /drops the fixed trait "leaf sprout"/.test(w.join("\n")) && /recolours body/.test(w.join("\n")) && /outfit "tuxedo"/.test(w.join("\n")) && /cast-canon-action: .*"moonwalk"/.test(w.join("\n"));
  })());
  ok("canon3d: a broken identity on disk is reported by the contract as cast-canon-invalid (and a missing one stays cast-canon-not-found)", (() => {
    const r = mkRun("run-badid", { ...sealed, palette: { body: "red", accent: "#fff" } }, { cast, scenes: scenes({}) });
    const w = contract.sceneContractChecks({ cast, scenes: scenes({}) }, { run: r }).W.join("\n");
    return /cast-canon-invalid: cast pomo-3d \(3d-rig\): palette/.test(w) && /cast-canon-not-found/.test(contract.sceneContractChecks({ cast, scenes: scenes({}) }, { run: path.join(tmp, "nowhere") }).W.join("\n"));
  })());

  // ------------------------------------------------------------------ actions: pure functions of t
  const spec = { start: { x: -0.8, z: 0, yaw: 0 }, actions: [{ kind: "look", at: 0.3, duration: 1.6, target: [0.6, 0.7, 1.5] }, { kind: "walk", at: 2, duration: 2.2, to: [0.8, 0.2] }, { kind: "hop", at: 4.5, duration: 1.2, height: 0.25, count: 2 }, { kind: "react", at: 6, duration: 1.2, emotion: "joyful" }, { kind: "point", at: 7.5, duration: 1.5, target: [-1, 0.6, 0.5], hand: "l" }] };
  const at = (t, sp = spec) => rig.channelsAt(t, sp, fixture, 3);
  const probe = [0.9, 3.1, 5, 6.5, 8, 3.1, 0.9, 5];
  const res = probe.map((t) => JSON.stringify(at(t)));
  ok("canon3d: poses are a pure function of absolute t and the spec: A-B-A-C asked in any order, twice, give identical channels", res[0] === res[6] && res[1] === res[5] && res[2] === res[7] && res[0] !== res[1], "");
  ok("canon3d: five reusable actions exist (look, point, hop, react, walk), plus turn and carry; each moves the actor away from idle", ["look", "point", "hop", "react", "walk"].every((k) => rig.KINDS.includes(k)) && rig.KINDS.includes("turn") && rig.KINDS.includes("carry")
    && Math.abs(at(1.1).headYaw) > 0.2 && Math.abs(at(3.1).legL) > 0.05 && at(4.9).y > 0.05 && at(6.6).squint > 0.3 && at(8.2).armL[1] > -0.6, JSON.stringify([at(1.1).headYaw, at(3.1).legL, at(4.9).y, at(6.6).squint, at(8.2).armL]));
  ok("canon3d: a walk arrives where it was told, facing its travel, and stays there; a hop leaves the ground, squashes on the landing and returns to rest", (() => {
    const a = at(4.6, { actions: spec.actions.slice(1, 2).concat([]), start: spec.start });
    const hopSq = [4.55, 4.9, 5.0, 5.12, 5.4].map((t) => at(t).sy);
    return Math.abs(a.x - 0.8) < 1e-6 && Math.abs(a.z - 0.2) < 1e-6 && Math.abs(Math.sin(a.yaw) - Math.sin(Math.atan2(1.6, 0.2))) < 1e-6 && at(5.7).y < 1e-6 && Math.min(...hopSq) < 0.9 && Math.max(...hopSq) > 1.04;
  })());
  ok("canon3d: blinks come from a seeded schedule (the same seed, the same blinks; another seed differs) and nothing reads the clock", (() => {
    const bl = (seed) => Array.from({ length: 300 }, (_, i) => rig.channelsAt(i / 30, { actions: [] }, fixture, seed).blink > 0.5 ? 1 : 0).join("");
    return bl(3) === bl(3) && bl(3) !== bl(4) && bl(3).includes("1");
  })());
  ok("canon3d: a bad action spec is refused by name (unknown kind, a missing target, an unknown emotion, overlapping walks)", (() => {
    const e = rig.validateActions({ actions: [{ kind: "teleport", at: 1, duration: 1 }, { kind: "point", at: 1, duration: 1 }, { kind: "react", at: 1, duration: 1, emotion: "smug" }, { kind: "walk", at: 2, duration: 2, to: [1, 1] }, { kind: "walk", at: 3, duration: 2, to: [0, 0] }] });
    return e.length === 4 && /teleport/.test(e[0]) && /target/.test(e[1]) && /emotion/.test(e[2]) && /overlap/.test(e[3] + e[4]);
  })());
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const src = strip(fs.readFileSync(path.join(SK, "stage3d", "character-rig.js"), "utf8"));
  ok("canon3d: the adapter has no Math.random, no wall clock, no free-running loop, no second WebGLRenderer, no AnimationMixer clock and no remote URL (comments aside)", !/Math\.random\s*\(|Date\.now|performance\.now|new Date\s*\(|requestAnimationFrame|setAnimationLoop|new\s+(?:THREE\.|T\.)?WebGLRenderer|AnimationMixer|https?:\/\//.test(src));
  ok("canon3d: loadCharacter refuses a glb rig by naming the missing upstream API, and an unknown builder", (() => { try { rig.loadCharacter({ ...fixture, rig: { kind: "glb", file: "a.glb" } }, { THREE: {}, material() {} }); return false; } catch (e) { return /unmerged upstream Sibhimanyu\/rasan-3d/.test(e.message); } })());

  // ------------------------------------------------------------------ the visual metric on synthetic masks
  const mask = (w, h, fn, rgb = [232, 163, 95]) => { const b = Buffer.alloc(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; if (fn(x, y)) { b[i] = rgb[0]; b[i + 1] = rgb[1]; b[i + 2] = rgb[2]; b[i + 3] = 255; } } return { w, h, rgba: b.toString("base64") }; };
  const egg = (cw, ch, scx = 1, scy = 1) => (x, y) => { const dx = (x - cw / 2) / (cw * 0.3 * scx), dy = (y - ch / 2) / (ch * 0.4 * scy); return dx * dx + dy * dy < 1 || (Math.abs(x - cw / 2) < 14 * scx && y > ch * 0.78 && y < ch * 0.95); };
  const plateN = c3.normalizeView(mask(240, 320, egg(240, 320)));
  const cmp = (v) => c3.compareViews(plateN, c3.normalizeView(v));
  ok("canon3d: the metric: the same silhouette passes (IoU 1), a recoloured one fails on palette, a stretched one fails on aspect and IoU, an empty frame fails, a slight change is UNCERTAIN (not a pass, not a fail)", (() => {
    const same = cmp(mask(240, 320, egg(240, 320)));
    const wide = cmp(mask(240, 320, egg(240, 320, 1.0, 0.82)));
    const recol = cmp(mask(240, 320, egg(240, 320), [60, 120, 220]));
    const empty = cmp(mask(240, 320, () => false));
    const slight = cmp(mask(240, 320, egg(240, 320, 1.0, 0.94)));
    return same.verdict === "pass" && same.metrics.iou === 1 && wide.verdict === "fail" && recol.verdict === "fail" && recol.metrics.palette > 0.15 && empty.verdict === "fail" && slight.verdict === "uncertain" && /between the pass line/.test(slight.reasons.join(" "));
  })(), "");
  ok("canon3d: thresholds are recorded (and written into every plate): IoU 0.985 / 0.93, aspect 0.03 / 0.08, region 0.02 / 0.08, palette 0.02 / 0.15", c3.THRESHOLDS.iou.pass === 0.985 && c3.THRESHOLDS.iou.fail === 0.93 && c3.THRESHOLDS.palette.fail === 0.15);

  // ------------------------------------------------------------------ CLI without a browser
  const cl = cli(["validate", "--file", FIX]);
  ok("canon3d: `canon.mjs validate` exits 0 on the fixture and 2 on a planted bad identity", cl.status === 0 && (() => { const f = path.join(tmp, "bad-id.json"); fs.writeFileSync(f, JSON.stringify(mk((c) => { delete c.camera_reference; }))); return cli(["validate", "--file", f]).status === 2; })());
  const work = path.join(tmp, "w6-run"); fs.mkdirSync(path.join(work, "cast", "pomo-3d"), { recursive: true }); fs.mkdirSync(path.join(work, "motion"), { recursive: true });
  fs.copyFileSync(FIX, path.join(work, "cast", "pomo-3d", "identity.json"));
  fs.writeFileSync(path.join(work, "motion", "score.json"), JSON.stringify({ cast, scenes: [{ n: 1, id: "meadow", duration: 6, space: "3d" }, { n: 2, id: "hilltop", duration: 6, space: "3d" }] }));
  const sl = cli(["seal", "--run", work, "--id", "pomo-3d"]);
  ok("canon3d: `canon.mjs seal` stamps rig_hash into the identity and the sealed file validates", sl.status === 0 && /^[0-9a-f]{64}$/.test(rd(path.join(work, "cast", "pomo-3d", "identity.json")).rig_hash) && cli(["validate", "--file", path.join(work, "cast", "pomo-3d", "identity.json")]).status === 0);
  const idFile = path.join(work, "cast", "pomo-3d", "identity.json");
  const tamperId = (mut) => { const o = rd(idFile); mut(o); fs.writeFileSync(idFile, JSON.stringify(o, null, 2)); };
  const sealedText = fs.readFileSync(idFile, "utf8");
  tamperId((o) => { o.proportions.body_w = 11.5; });
  const bodyChanged = cli(["check", "--run", work, "--json"]);
  ok("canon3d: `check` exits 2 when the sealed body is changed (rig-hash-changed), before any browser is needed", bodyChanged.status === 2 && rules(bodyChanged).includes("rig-hash-changed"), bodyChanged.stdout.slice(0, 300));
  fs.writeFileSync(idFile, sealedText);
  const noChar = mkRun("run-nochar", sealed, { cast: [{ id: "ball", kind: "object" }], scenes: [] });
  ok("canon3d: `check` on a run with no recurring character is a clean no-op (exit 0)", cli(["check", "--run", noChar, "--json"]).status === 0 && json(cli(["check", "--run", noChar, "--json"])).status === "no-characters");

  // ------------------------------------------------------------------ the crew: the character role only for a declared 3D actor; canon before scene animators
  const planOf = (name, length, withCast, extra = []) => {
    const r = path.join(tmp, name); fs.mkdirSync(path.join(r, "motion"), { recursive: true });
    fs.writeFileSync(path.join(r, "brief.json"), JSON.stringify({ kind: "title", length_s: length }));
    if (withCast) { fs.mkdirSync(path.join(r, "cast", "pomo-3d"), { recursive: true }); fs.copyFileSync(idFile, path.join(r, "cast", "pomo-3d", "identity.json")); }
    fs.writeFileSync(path.join(r, "motion", "score.json"), JSON.stringify(withCast ? { cast, scenes: [] } : { cast: [], scenes: [] }));
    const o = spawnSync(process.execPath, [path.join(S, "crew.mjs"), "plan", "--run", r, "--route", "general-video", "--subject", "Pomo", ...extra], { encoding: "utf8", env });
    let p = null; try { p = JSON.parse(fs.readFileSync(path.join(r, "crew", "plan.json"), "utf8")); } catch { /* none */ }
    return { r, p, o };
  };
  const cp = planOf("crew-3d", 15, true), cl80 = planOf("crew-3d-long", 80, true), cn = planOf("crew-none", 15, false);
  const ph = (x) => (x.p ? x.p.phases.filter((p) => p.phase === "character-design") : []);
  ok("canon3d: crew plan: a declared 3D actor gets ONE character-design phase whose steps are canon.mjs (validate, seal, sheet, plate), before the hero frames; a film with no cast gets none", ph(cp).length === 1 && cp.p.character3d === true && ph(cp)[0].director_steps.some((s) => /canon\.mjs seal/.test(s)) && /BEFORE any scene animator/.test(ph(cn).length ? "" : ph(cp)[0].then) && ph(cn).length === 0, cp.o.stderr.slice(0, 200));
  ok("canon3d: a long film keeps its scene animators and the same single character phase (the lead builder owns the shared rig; animators reference it)", cl80.p && cl80.p.direct === false && ph(cl80).length === 1 && /lead builder owns the shared rig/.test(ph(cl80)[0].then) && cl80.p.phases.some((x) => x.dispatch.some((d) => d.role === "scene-animator")));
  const br = spawnSync(process.execPath, [path.join(S, "crew.mjs"), "brief", "--run", cp.r, "--role", "character-designer", "--key", "cast"], { encoding: "utf8", env });
  const brText = br.status === 0 && br.stdout ? (() => { try { const j = JSON.parse(br.stdout); return fs.readFileSync(path.resolve(j.prompt || ""), "utf8"); } catch { return br.stdout; } })() : "";
  const ctxPart = brText.slice(brText.indexOf("**seal_cmd**"));
  ok("canon3d: crew brief --role character-designer for a 3D cast: the agent file has a 3D section, and the dispatch context names canon.mjs seal / plate, the 3D contract and the 3d-rig fixture (not the 2D playbook or stage2d.mjs)", br.status === 0 && /When the actor is 3D/.test(brText) && /canon\.mjs.* seal --run/.test(ctxPart) && /canon\.mjs.* plate --run/.test(ctxPart) && /references\/3d\.md/.test(ctxPart) && /original-actor-3d\.json/.test(ctxPart) && !/2d-character\.md|stage2d/.test(ctxPart), (br.stderr || "") + ctxPart.slice(0, 300));
  const sa = spawnSync(process.execPath, [path.join(S, "crew.mjs"), "brief", "--run", cn.r, "--role", "scene-animator", "--key", "1", "--project", path.join(tmp, "p-none")], { encoding: "utf8", env });
  const gapRun = planOf("crew-gap", 15, true); fs.rmSync(path.join(gapRun.r, "cast"), { recursive: true });
  const sg = spawnSync(process.execPath, [path.join(S, "crew.mjs"), "brief", "--run", gapRun.r, "--role", "scene-animator", "--key", "1", "--project", path.join(tmp, "p-gap")], { encoding: "utf8", env });
  ok("canon3d: no scene animator is briefed before the canon is written (a cast character with no identity.json stops the brief); a film with no cast is not affected", sg.status !== 0 && /canon of pomo-3d is not written yet/.test(sg.stderr + sg.stdout) && !/canon of .* is not written yet/.test(sa.stderr + sa.stdout));
  const dcheck = (r) => spawnSync(process.execPath, [path.join(S, "crew.mjs"), "check", "--run", r, "--role", "character-designer", "--key", "cast"], { encoding: "utf8", env });
  const unsealedRun = planOf("crew-unsealed", 15, true); const uf = path.join(unsealedRun.r, "cast", "pomo-3d", "identity.json"); const uo = rd(uf); delete uo.rig_hash; fs.writeFileSync(uf, JSON.stringify(uo));
  const noSheet = dcheck(unsealedRun.r);
  fs.writeFileSync(path.join(unsealedRun.r, "cast", "pomo-3d", "model-sheet.png"), "x"); fs.writeFileSync(path.join(unsealedRun.r, "cast", "pomo-3d", "canon-plate.json"), "{}");
  const unsealed = dcheck(unsealedRun.r);
  fs.copyFileSync(idFile, uf);
  const sealedOk = dcheck(unsealedRun.r);
  ok("canon3d: crew check --role character-designer holds a 3D actor to its sheet, its plate and its seal, and passes once all three exist", noSheet.status !== 0 && /model-sheet\.png is missing|canon-plate\.json is missing/.test(noSheet.stdout + noSheet.stderr) && unsealed.status !== 0 && /not sealed/.test(unsealed.stdout + unsealed.stderr) && sealedOk.status === 0, (sealedOk.stdout + sealedOk.stderr).slice(0, 300));

  // ------------------------------------------------------------------ Chrome: render the actor
  const chrome = spawnSync(process.execPath, ["-e", `import(${JSON.stringify(pathToFileURL(path.join(S, "lib", "common.mjs")).href)}).then((m)=>{m.chromePath();})`], { encoding: "utf8" });
  if (chrome.status !== 0) { console.log("not run: canon3d browser cases (no headless Chrome: run `npx hyperframes browser ensure` or set RASANAI_CHROME)"); return; }
  process.env.RASANAI_GL = "cpu";
  const t0 = Date.now();
  const sheet = path.join(work, "cast", "pomo-3d", "model-sheet.png");
  const sh = cli(["sheet", "--canon", idFile, "--out", sheet]);
  ok("canon3d: canon.mjs sheet renders the model sheet: four views and look / point / hop / react / walk of one actor (1200 x 640 PNG, not blank)", sh.status === 0 && fs.statSync(sheet).size > 60000 && json(sh).width === 1200 && json(sh).height === 640, sh.stderr.slice(0, 300));
  console.log(`note  canon3d: model sheet took ${Math.round((Date.now() - t0) / 1000)} s; look at ${sheet}`);
  const pl = cli(["plate", "--run", work, "--id", "pomo-3d"]);
  const plate = fs.existsSync(path.join(work, "cast", "pomo-3d", "canon-plate.json")) ? rd(path.join(work, "cast", "pomo-3d", "canon-plate.json")) : null;
  ok("canon3d: canon.mjs plate records the front and quarter silhouettes, the rig hash, the identity digest and the thresholds", pl.status === 0 && plate && plate.rig_hash === rd(idFile).rig_hash && plate.views.front && plate.views.quarter && !plate.views.front.empty && plate.thresholds.iou.pass === 0.985, pl.stderr.slice(0, 300));

  // two scenes of one film: different set, camera, light and actions; the same sealed actor
  const proj = path.join(tmp, "film-3d");
  const spec1 = { start: { x: -0.8, z: 0, yaw: 0 }, actions: [{ kind: "look", at: 0.3, duration: 1.6, target: [0.6, 0.7, 1.5] }, { kind: "walk", at: 2, duration: 2.2, to: [0.8, 0.2] }, { kind: "react", at: 4.4, duration: 1.4, emotion: "joyful" }] };
  const spec2 = { start: { x: 0.6, z: 0, yaw: -35 }, actions: [{ kind: "carry", at: 0, duration: 2.4, hand: "r" }, { kind: "point", at: 0.5, duration: 2, target: [-1.2, 0.7, 0.4], hand: "l" }, { kind: "hop", at: 2.8, duration: 1.1, height: 0.3, count: 2 }, { kind: "react", at: 4.4, duration: 1.4, emotion: "surprised" }] };
  const cam2 = { pos: [[0, [-0.9, 0.7, 3.0]], [2, [-0.5, 0.64, 2.8], "power2.inOut"]], target: [[0, [0.1, 0.46, 0]]], lens: [[0, 40]] };
  fs.mkdirSync(proj, { recursive: true });
  const w1 = path.join(tmp, "spec1.json"), w2 = path.join(tmp, "spec2.json"), wc = path.join(tmp, "cam2.json");
  fs.writeFileSync(w1, JSON.stringify(spec1)); fs.writeFileSync(w2, JSON.stringify(spec2)); fs.writeFileSync(wc, JSON.stringify(cam2));
  const sc1 = cli(["scaffold", "--project", proj, "--frame", "01-meadow", "--duration", "6", "--canon", idFile, "--spec", w1, "--canvas", "#cfe3c6"]);
  const sc2 = cli(["scaffold", "--project", proj, "--frame", "02-hilltop", "--duration", "6", "--canon", idFile, "--spec", w2, "--camera", wc, "--canvas", "#f0d9b5"]);
  const f1 = path.join(proj, "compositions", "frames", "01-meadow.html"), f2 = path.join(proj, "compositions", "frames", "02-hilltop.html");
  fs.writeFileSync(f2, fs.readFileSync(f2, "utf8").replace("k.scene.add(rig.group);", `k.scene.add(rig.group);
        rig.setOutfit("winter");                                   // a permitted swap: palette_swappable lists the scarf, outfits lists winter
        const ball = new k.THREE.Mesh(new k.THREE.SphereGeometry(0.05, 24, 16), k.material("plastic", { color: "#e0463b" }));
        rig.attachProp(ball, "hand_r", { from: 0, to: 2.4 });      // a prop rides the stable hand point`));
  ok("canon3d: canon.mjs scaffold writes two scene compositions that draw the actor from the sealed canon and installs assets/three/character-rig.js", sc1.status === 0 && sc2.status === 0 && fs.existsSync(path.join(proj, "assets", "three", "character-rig.js")) && /"rig_hash"/.test(fs.readFileSync(f1, "utf8")), sc1.stderr.slice(0, 200) + sc2.stderr.slice(0, 200));
  const lib3 = await imp("stage3d.mjs");
  const pix = (f) => lib3.withComposition(f, "check", async (b, { ready }) => ({ errors: ready.errors, ...(await b.eval(`(function(){
    var s = Object.keys(window.__rasan3d.stages).map(function(k){ return window.__rasan3d.stages[k]; })[0];
    function hash(){ var c = s.canvas, d = s.ctx2d.getImageData(0, 0, c.width, c.height).data, h = 2166136261 >>> 0; for (var i = 0; i < d.length; i++) { h = Math.imul(h ^ d[i], 16777619) >>> 0; } return h; }
    function at(t){ window.__r3seek(t); return hash(); }
    var A = 1.3, B = 3.6, a1 = at(A), b1 = at(B), a2 = at(A);
    var r = window.__rasanCharacters[Object.keys(window.__rasanCharacters)[0]], S = SPEC, T = window.THREE, hands = [], gaps = [], balls = r.attach.hand_r.children;
    [0.4, 3.0, 3.35].forEach(function(t){ r.poseAt(t, S); r.group.updateMatrixWorld(true); var hp = r.attach.hand_r.getWorldPosition(new T.Vector3()); hands.push(hp.toArray()); if (balls[0]) gaps.push(balls[0].getWorldPosition(new T.Vector3()).distanceTo(hp)); });
    var travelled = Math.hypot(hands[0][0] - hands[2][0], hands[0][1] - hands[2][1], hands[0][2] - hands[2][2]);
    return { a1: a1, a2: a2, b1: b1, balls: balls.length, gaps: gaps, travelled: travelled, visibleAfter: (function(){ r.poseAt(3.0, S); return balls[0] ? balls[0].visible : null; })() };
  })()`)) }));
  const sA = await pix(f1), sB = await pix(f2), sA2 = await pix(f1), sB2 = await pix(f2);
  ok("canon3d: A-B-A seeks return identical pixels in both scenes, and a different time differs", sA.a1 === sA.a2 && sB.a1 === sB.a2 && sA.a1 !== sA.b1 && sB.a1 !== sB.b1 && !(sA.errors || []).length && !(sB.errors || []).length, JSON.stringify([sA.a1, sA.a2, sA.b1, sB.errors]));
  ok("canon3d: two independent renders (two separate browsers) of each scene give identical pixels at the same time", sA.a1 === sA2.a1 && sA.b1 === sA2.b1 && sB.a1 === sB2.a1 && sB.b1 === sB2.b1, JSON.stringify([sA.a1, sA2.a1, sB.a1, sB2.a1]));
  ok("canon3d: a prop attached to hand_r stays exactly on the hand point while the hand travels, and the carry window hides it afterwards", sB.balls === 1 && sB.gaps.length === 3 && sB.gaps.every((g) => g < 1e-6) && sB.travelled > 0.05 && sB.visibleAfter === false, JSON.stringify([sB.gaps, sB.travelled, sB.visibleAfter]));
  const st = spawnSync(process.execPath, [path.join(S, "stage3d.mjs"), "check", "--project", proj, "--json"], { encoding: "utf8", env: { ...process.env, RASANAI_GL: "cpu" }, timeout: 900000 });
  const stj = json(st);
  ok("canon3d: the existing `stage3d.mjs check` is unchanged and clean on both character scenes (seek-safe, no errors)", st.status === 0 && stj.errors === 0 && stj.files.length === 2 && stj.files.every((f) => f.stages.every((s) => s.deterministic)), st.stdout.slice(0, 300));
  const t1 = Date.now();
  const good3 = cli(["check", "--run", work, "--project", proj, "--json"]);
  const gj = json(good3);
  const vis = (gj.report && gj.report.scenes || []).filter((x) => x.verdict);
  ok("canon3d: THE ACCEPTANCE CASE: the same rig id in two separately rendered 3D scenes with different actions, cameras and light: on-model check exit 0, every front and quarter view passes against the canon plate (6 comparisons incl. the canon's own render)", good3.status === 0 && gj.status === "clean" && vis.length === 6 && vis.every((x) => x.verdict === "pass") && (gj.errors || 0) === 0, good3.stdout.slice(0, 600));
  console.log(`note  canon3d: on-model check of 2 scenes took ${Math.round((Date.now() - t1) / 1000)} s; metrics: ${vis.map((x) => `${x.scene == null ? "canon" : "s" + x.scene}/${x.view} iou ${x.metrics.iou} pal ${x.metrics.palette}`).join("; ")}`);
  const act = (gj.report.scenes || []).filter((x) => x.actors).flatMap((x) => x.actors);
  const m1 = act[0] && act[0].measured, m2 = act[1] && act[1].measured;
  const sameRatios = m1 && m2 && Object.keys(m1.ratios).length >= 7 && Object.keys(m1.ratios).every((k) => Math.abs(m1.ratios[k] - m2.ratios[k]) < 1e-6);
  const diffCols = m1 && m2 ? Object.keys(m1.colours).filter((k) => m1.colours[k] !== m2.colours[k]).sort() : [];
  ok("canon3d: no undocumented drift between the scenes: every proportion identical, every part colour identical except the scarf and its tail, which scene 2 swapped through the canon's own winter outfit (recorded on the rig)", sameRatios && diffCols.join() === "scarf,scarfTail" && m2.swapped.scarf === "#c2453b" && !Object.keys(m1.swapped).length && m1.attach.includes("hand_r") && m2.attach.includes("hand_r"), JSON.stringify([diffCols, m2 && m2.swapped]));

  // the negatives: each on its own copy of scene 2 (the check must fail for the right reason), plus the permitted changes that must NOT fail
  const variant = (name, mut, extra = []) => {
    const p = path.join(tmp, "v-" + name); fs.cpSync(proj, p, { recursive: true });
    const f = path.join(p, "compositions", "frames", "02-hilltop.html"); mut(p, f, fs.readFileSync(f, "utf8"));
    return cli(["check", "--run", work, "--project", p, "--scene", "2", "--json", ...extra]);
  };
  const inject = (code) => (p, f, t) => fs.writeFileSync(f, t.replace("rig.attachProp(ball", `${code}\n        rig.attachProp(ball`));
  const nBody = variant("body-ratio", inject("rig.parts.body.scale.x *= 1.3;"));
  ok("canon3d: a deliberately changed body ratio (the body 30% wider) is caught: exit 2, proportion-drift on every ratio of the live rig; the silhouette metric alone does NOT pass it (half the body hides behind the head and arms: uncertain, with a review image), which is why the structural read is the enforcement", nBody.status === 2 && rules(nBody).includes("proportion-drift") && (json(nBody).report.scenes || []).some((x) => x.verdict && x.verdict !== "pass") && rules(nBody, "review").includes("needs-frame-juror"), nBody.stdout.slice(0, 400));
  const nScarf = variant("scarf-hidden", inject("rig.parts.scarf.visible = false;"));
  ok("canon3d: a hidden signature accessory (the scarf) is caught: exit 2, fixed-trait-missing", nScarf.status === 2 && rules(nScarf).includes("fixed-trait-missing") && (json(nScarf).findings || []).some((f) => /striped scarf/.test(f.message)), nScarf.stdout.slice(0, 400));
  const nEar = variant("ear-removed", inject("rig.parts.earL.removeFromParent();"));
  ok("canon3d: a removed fixed feature (an ear) is caught: exit 2, fixed-trait-missing for 'round ears'", nEar.status === 2 && (json(nEar).findings || []).some((f) => f.rule === "fixed-trait-missing" && /round ears/.test(f.message)), nEar.stdout.slice(0, 400));
  const nCol = variant("recoloured", inject('rig.parts.body.material = rig.parts.body.material.clone(); rig.parts.body.material.color.set("#5f8fd8");'));
  ok("canon3d: a recoloured body (a locked palette key) is caught: exit 2, palette-drift on the live material; the picture's palette metric moves too (not a pass)", nCol.status === 2 && rules(nCol).includes("palette-drift") && (json(nCol).report.scenes || []).some((x) => x.verdict && x.verdict !== "pass" && x.metrics && x.metrics.palette > 0.02), nCol.stdout.slice(0, 400));
  const nSwap = variant("forbidden-swap", inject('rig.setColors({ body: "#ff0000" });'));
  ok("canon3d: a colour swap the canon does not permit is refused by the rig itself (the scene fails to build): exit 2, build-failed", nSwap.status === 2 && rules(nSwap).includes("build-failed"), nSwap.stdout.slice(0, 400));
  const nStale = variant("stale-copy", (p, f, t) => fs.writeFileSync(f, t.replace('"body_w":10,', '"body_w":11,')));
  ok("canon3d: a scene that carries a modified copy of the identity is caught: exit 2, identity-stale (digest) and proportion-drift against the run's file", nStale.status === 2 && rules(nStale).includes("identity-stale") && rules(nStale).includes("proportion-drift"), nStale.stdout.slice(0, 400));
  const nRig = variant("rig-modified", (p) => { const f = path.join(p, "assets", "three", "character-rig.js"); fs.writeFileSync(f, fs.readFileSync(f, "utf8") + "\n// a scene animator edited the shared rig\n"); });
  ok("canon3d: a scene animator's edit of the shared rig file is caught: exit 2, shared-rig-modified", nRig.status === 2 && rules(nRig).includes("shared-rig-modified"), nRig.stdout.slice(0, 400));
  const nNon = variant("non-uniform-scale", inject("rig.group.scale.set(1.25, 1, 1);"));
  ok("canon3d: stretching the whole actor along one axis is caught: exit 2 (proportion-drift, silhouette-drift)", nNon.status === 2 && rules(nNon).includes("proportion-drift") && rules(nNon).includes("silhouette-drift"), nNon.stdout.slice(0, 400));
  const pUni = variant("uniform-scale", inject("rig.group.scale.setScalar(1.4);"));
  ok("canon3d: a permitted change is NOT a false failure: scaling the whole actor uniformly (and, in the same scene, every pose, a prop and the winter outfit) still exits 0", pUni.status === 0 && !rules(pUni).length && (json(pUni).report.scenes || []).filter((x) => x.verdict).every((x) => x.verdict === "pass"), pUni.stdout.slice(0, 400));
  const unc = variant("uncertain", (p) => { const rf = path.join(work, "cast", "pomo-3d", "canon-plate.json"); const o = rd(rf); o.thresholds.palette = { pass: -1, fail: 0.5 }; fs.writeFileSync(rf, JSON.stringify(o)); });
  const uj = json(unc);
  fs.writeFileSync(path.join(work, "cast", "pomo-3d", "canon-plate.json"), JSON.stringify(plate));
  ok("canon3d: an UNCERTAIN view is not an error and not a pass: exit 0, status needs-review, a review finding tagged needs-frame-juror with an image for the frame juror, and the metric is labelled 'never proof of identity'", unc.status === 0 && uj.status === "needs-review" && (uj.findings || []).some((f) => f.severity === "review" && f.rule === "needs-frame-juror" && f.image && fs.existsSync(path.join(work, f.image))) && (uj.report.scenes || []).some((x) => /never proof/.test(x.proof || "")), unc.stdout.slice(0, 400));
  const stalePlate = (() => { const o = rd(path.join(work, "cast", "pomo-3d", "canon-plate.json")); o.rig_hash = "0".repeat(64); const p2 = path.join(work, "cast", "pomo-3d", "canon-plate.json"); fs.writeFileSync(p2, JSON.stringify(o)); const r = cli(["check", "--run", work, "--json"]); fs.writeFileSync(p2, JSON.stringify(plate)); return r; })();
  ok("canon3d: a plate made for another rig is refused: exit 2, plate-stale", stalePlate.status === 2 && rules(stalePlate).includes("plate-stale"), stalePlate.stdout.slice(0, 300));
  const missingPlate = (() => { const p2 = path.join(work, "cast", "pomo-3d", "canon-plate.json"); fs.rmSync(p2); const r = cli(["check", "--run", work, "--json"]); fs.writeFileSync(p2, JSON.stringify(plate)); return r; })();
  ok("canon3d: with no plate the check still runs (against a fresh render of the canon) and says so as a warning, never as a silent pass", missingPlate.status === 0 && rules(missingPlate, "warning").includes("plate-missing"), missingPlate.stdout.slice(0, 300));
  ok("canon3d: a scene check by number (--scene 1) checks only that scene", (() => { const r = cli(["check", "--run", work, "--project", proj, "--scene", "1", "--json"]); const j = json(r); return r.status === 0 && (j.report.scenes || []).filter((x) => x.file).every((x) => x.scene === 1); })());
  console.log(`note  canon3d: browser cases took ${Math.round((Date.now() - t0) / 1000)} s in total`);
}
