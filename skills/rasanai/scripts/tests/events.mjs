// events: the derived film-event manifest (events.mjs, lib/film-events.mjs). Deterministic and byte-identical export, stable ids, order by time / kind precedence / id,
// scene-local to film time exactly once, frame = round(at_s * fps) beside the original float, invalid input refused (NaN, negative, impossible duration, unknown kind,
// duplicate ids, words out of bounds, missing scene ids), a missing optional source recorded as missing, stale sha256 refused, a hand edit overwritten with a warning,
// no network, and the consumers (sound sfx-plan, music tempo, subtitles, the delivery metadata) reading the manifest only when given it. Fixtures are synthetic (tests/fixtures/events).
// export default async function ({ ok, node, tmp }).
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(HERE, "fixtures", "events", "run");
const LIB = await import("../lib/film-events.mjs");

export default async function ({ ok, node, tmp }) {
  const J = (r) => { try { return JSON.parse(r.stdout); } catch { return {}; } };
  const readJ = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
  let n = 0;
  const fresh = (name) => { const d = path.join(tmp, `events-${++n}-${name || "run"}`); fs.cpSync(FIX, d, { recursive: true }); return d; };
  const exportRun = (d, extra = []) => node("events.mjs", ["export", "--run", d, ...extra]);
  const checkRun = (d, extra = []) => node("events.mjs", ["check", "--run", d, ...extra]);
  const bytes = (f) => fs.readFileSync(f);
  const baseScore = () => readJ(path.join(FIX, "motion", "score.json"));
  const mk = (over = {}, extra = {}) => LIB.derive({ score: { ...baseScore(), ...over }, scorePath: "motion/score.json", scoreSha: "0".repeat(64), audioMeta: null, sfxPlan: null, ...extra });
  const withScene = (fn) => { const s = baseScore(); fn(s); return s; };

  // ---- determinism, ids, order
  const a = fresh("a"), b = fresh("b");
  const ra = exportRun(a), rb = exportRun(b);
  const ma = path.join(a, "motion", "events.json"), mb = path.join(b, "motion", "events.json");
  ok("events: export passes (exit 0, JSON on stdout) on the synthetic 30 s fixture", ra.status === 0 && J(ra).ok === true && J(ra).events > 10, ra.stdout + ra.stderr);
  ok("events: the same inputs in another folder give a byte-identical manifest", Buffer.compare(bytes(ma), bytes(mb)) === 0);
  exportRun(a);
  ok("events: exporting again is byte-identical (regeneration is deterministic)", Buffer.compare(bytes(ma), bytes(mb)) === 0);
  const M = readJ(ma);
  const rev = (o) => (Array.isArray(o) ? o.map(rev) : o && typeof o === "object" ? Object.fromEntries(Object.keys(o).reverse().map((k) => [k, rev(o[k])])) : o);
  const m2 = LIB.derive({ score: JSON.parse(JSON.stringify(rev(baseScore()))), scorePath: "motion/score.json", scoreSha: "x", audioMeta: rev(readJ(path.join(FIX, "motion", "audio_meta.json"))), sfxPlan: rev(readJ(path.join(FIX, "motion", "sfx-plan.json"))) }).manifest;
  ok("events: ids are stable for equivalent source data (the same score with every key re-ordered gives the same ids, times and kinds)", !!m2 && JSON.stringify(m2.events.map((e) => [e.id, e.at_s, e.kind])) === JSON.stringify(M.events.map((e) => [e.id, e.at_s, e.kind])));
  let sorted = true;
  for (let i = 1; i < M.events.length; i++) if (LIB.compareEvents(M.events[i - 1], M.events[i]) > 0) sorted = false;
  ok("events: events are sorted by time, then kind precedence, then id", sorted && M.events.length > 10);
  const at95 = M.events.filter((e) => Math.abs(e.at_s - 9.5) < 1e-9).map((e) => e.kind);
  ok("events: at the same instant a music cue precedes the picture hit (kind precedence)", at95.indexOf("music_cue") >= 0 && at95.indexOf("music_cue") < at95.indexOf("visual_hit"), JSON.stringify(at95));
  const ids = M.events.map((e) => e.id);
  ok("events: every id is unique and non-empty", new Set(ids).size === ids.length && ids.every(Boolean));

  // ---- scene-local to film time exactly once; frame beside the float
  const hit = M.events.find((e) => e.id === "e-reveal"), word = M.events.find((e) => e.kind === "word_start" && e.word === "reveal");
  ok("events: a scene-local time becomes film time once (scene 'reveal' starts at 9 s, t 0.5 -> 9.5, never 18.5 or 0.5)", hit.at_s === 9.5 && hit.scene_t_s === 0.5 && word.at_s === 9.48 && word.scene_t_s === 0.48, JSON.stringify([hit, word]));
  ok("events: frame = round(at_s * fps) and the original float stays (9.48 s -> frame 284, at_s 9.48)", word.frame === Math.round(9.48 * 30) && word.frame === 284 && word.at_s === 9.48 && M.fps === 30);
  const f30 = mk({ fps: 24 }).manifest;
  ok("events: another fps changes the frame index, not the seconds", f30.events.find((e) => e.id === "e-reveal").frame === 228 && f30.events.find((e) => e.id === "e-reveal").at_s === 9.5);
  const withHit = mk({}, {}).manifest;
  const odd = LIB.derive({ score: withScene((s) => { s.scenes[0].events = [{ id: "odd", t: 1.0049, what: "synthetic" }]; }), scorePath: "p", scoreSha: "s" }).manifest.events.find((e) => e.id === "odd");
  ok("events: the original float is kept, only the frame is an integer (1.0049 s -> frame 30)", odd.at_s === 1.0049 && odd.frame === 30 && !!withHit);

  // ---- rejections (each names what is wrong)
  const bad = (name, over, re, extra) => { const r = mk(over, extra); ok(`events: ${name} is rejected`, !r.manifest && r.problems.some((p) => re.test(p)), JSON.stringify(r.problems)); return r; };
  bad("a NaN event time", withScene((s) => { s.scenes[0].events[0].t = "abc"; }), /not a number/);
  bad("a null event time", withScene((s) => { s.scenes[0].events[0].t = null; }), /not a number/);
  bad("a negative event time", withScene((s) => { s.scenes[0].events[0].t = -0.2; }), /negative/);
  bad("a scene-local time past its scene (a film time written as a scene time)", withScene((s) => { s.scenes[0].events[0].t = 20; }), /past scene "open"/);
  bad("a zero scene duration", withScene((s) => { s.scenes[1].duration = 0; delete s.scenes[1].end; }), /impossible duration/);
  bad("a negative scene duration", withScene((s) => { s.scenes[1].duration = -3; delete s.scenes[1].end; }), /impossible duration/);
  bad("an impossible film duration", { duration: -1 }, /duration .* impossible/);
  bad("a scene that runs past the film", { duration: 25 }, /past the film/);
  bad("an fps of zero", { fps: 0 }, /fps/);
  bad("a duplicate event id", withScene((s) => { s.scenes[0].events[0].id = "e-reveal"; }), /duplicate event id "e-reveal"/);
  bad("a duplicate scene id", withScene((s) => { s.scenes[2].id = "open"; }), /duplicate scene id/);
  bad("a scene with no id and no n", withScene((s) => { delete s.scenes[1].id; delete s.scenes[1].n; }), /no id/);
  bad("a seam that points at a scene that is not there", withScene((s) => { s.seams[0].to = 9; }), /references scene 9/);
  const am = readJ(path.join(FIX, "motion", "audio_meta.json"));
  bad("a word out of bounds (starts 40 s into a 12 s scene)", {}, /out of bounds/, { audioMeta: { voices: [{ frame: 2, words: [{ text: "late", start: 40 }] }] } });
  bad("a word with a negative start", {}, /negative/, { audioMeta: { voices: [{ frame: 2, words: [{ text: "early", start: -1 }] }] } });
  bad("a word timed against a scene that is missing", {}, /references scene 7/, { audioMeta: { voices: [{ frame: 7, words: am.voices[0].words }] } });
  bad("an sfx cue that names a missing scene", {}, /references scene 9/, { sfxPlan: { cues: [{ event: "x", kind: "key", t: 2, scene: 9 }] } });
  bad("an sfx cue with a NaN time", {}, /not a number/, { sfxPlan: { cues: [{ event: "x", kind: "key", t: "soon", scene: 1 }] } });
  const manifestBad = (name, edit, re) => { const m = JSON.parse(JSON.stringify(M)); edit(m); const p = LIB.validate(m); ok(`events: a manifest with ${name} is invalid`, p.some((x) => re.test(x)), JSON.stringify(p)); };
  manifestBad("an unsupported kind", (m) => { m.events[1].kind = "explosion"; }, /unsupported kind "explosion"/);
  manifestBad("a duplicate id", (m) => { m.events[2].id = m.events[1].id; }, /duplicate id/);
  manifestBad("a NaN at_s", (m) => { m.events[2].at_s = NaN; m.events[2].at_s = "x"; }, /not a number/);
  manifestBad("a negative at_s", (m) => { m.events[0].at_s = -1; }, /negative/);
  manifestBad("a reference to a missing scene", (m) => { m.events[1].scene = "nope"; }, /missing|not in scenes/);
  manifestBad("a word outside its scene", (m) => { const w = m.events.find((e) => e.kind === "word_start"); w.at_s = 2; w.frame = 60; }, /outside its scene/);
  manifestBad("a frame that is not round(at_s * fps)", (m) => { m.events[1].frame += 3; }, /round\(at_s \* fps\)/);
  manifestBad("events out of order", (m) => { const t = m.events[1]; m.events[1] = m.events[2]; m.events[2] = t; }, /out of order/);
  manifestBad("a wrong schema version", (m) => { m.schema_version = 7; }, /schema_version/);
  ok("events: the CLI exits 2 and prints the problem on stderr for an invalid score (and writes nothing)", (() => {
    const d = fresh("bad"); const s = readJ(path.join(d, "motion", "score.json")); s.scenes[0].events[0].t = -2; fs.writeFileSync(path.join(d, "motion", "score.json"), JSON.stringify(s));
    const r = exportRun(d); return r.status === 2 && /problem: .*negative/.test(r.stderr) && J(r).ok === false && !fs.existsSync(path.join(d, "motion", "events.json"));
  })());
  ok("events: exit 1 (unable) for a missing run, a missing score and a missing named file", (() => {
    const e1 = node("events.mjs", ["export", "--run", path.join(tmp, "no-such-run")]);
    const d = path.join(tmp, "events-empty"); fs.mkdirSync(d, { recursive: true });
    const e2 = node("events.mjs", ["export", "--run", d]);
    const e3 = exportRun(fresh("nf"), ["--audio-meta", path.join(tmp, "nope.json")]);
    const e4 = node("events.mjs", ["check", "--run", fresh("nomanifest")]);
    return [e1, e2, e3, e4].every((r) => r.status === 1 && /unable/.test(r.stderr));
  })());

  // ---- missing optional sources are recorded, never invented
  const d0 = fresh("bare"); fs.rmSync(path.join(d0, "motion", "audio_meta.json")); fs.rmSync(path.join(d0, "motion", "sfx-plan.json"));
  const r0 = exportRun(d0), M0 = readJ(path.join(d0, "motion", "events.json"));
  ok("events: without audio_meta or an sfx plan both are recorded as missing", r0.status === 0 && M0.source.audio_meta.status === "missing" && M0.source.audio_meta.path === null && M0.source.sfx_plan.status === "missing");
  ok("events: no word is invented without alignments (no word_start events)", !M0.events.some((e) => e.kind === "word_start"));
  ok("events: the spoken-word target is reported as no-alignment, with no measured error made up", M0.sync.length === 1 && M0.sync[0].status === "no-alignment" && M0.sync[0].word_event === null);
  ok("events: with no sfx plan the foley is only what the score itself says has a sound (origin score), nothing extra", M0.events.filter((e) => e.kind === "foley_hit").every((e) => e.origin === "score" && e.of) && M0.events.filter((e) => e.kind === "foley_hit").length === 2);
  const noSound = mk({}, {}).manifest;
  ok("events: a score with no hits and no sound has no hit or foley events", (() => { const m = LIB.derive({ score: withScene((s) => { s.scenes.forEach((x) => { delete x.events; }); delete s.seams; delete s.music_arc; }), scorePath: "p", scoreSha: "s" }).manifest; return m && m.events.every((e) => e.kind === "scene_start") && m.events.length === 3; })() && !!noSound);

  // ---- the 30 s acceptance: picture hit, foley hit and spoken word within one frame (or a measured diagnostic)
  const syn = M.sync[0], eventTime = (id) => M.events.find((e) => e.id === id).at_s;
  ok("events: 30 s fixture: picture hit 9.5, foley 9.51 and the word 'reveal' 9.48 agree within one video frame", syn.status === "aligned" && syn.within_one_frame === true && syn.max_err_frames < 1 && Math.abs(eventTime("e-reveal") - eventTime("foley-e-reveal")) * 30 < 1 && Math.abs(eventTime("e-reveal") - eventTime(syn.word_event)) * 30 < 1, JSON.stringify(syn));
  const off = readJ(path.join(FIX, "motion", "audio_meta.json")); off.voices[0].words[1].start = 0.25; // 9.25 s: 7.5 frames early
  const dOff = fresh("offsync"); fs.writeFileSync(path.join(dOff, "motion", "audio_meta.json"), JSON.stringify(off));
  const rOff = exportRun(dOff), sOff = J(rOff).sync?.[0];
  ok("events: a word 0.25 s off the hit is a diagnostic with the measured error (warning, exit 0), not a silent pass", rOff.status === 0 && sOff?.within_one_frame === false && sOff.max_err_frames > 7 && sOff.max_err_s === 0.26 && /sync-off: "e-reveal".*7\.\d+ frames/.test(rOff.stderr), rOff.stderr + JSON.stringify(sOff));

  // ---- staleness, hand edits
  const ds = fresh("stale"); exportRun(ds);
  ok("events: check passes on a fresh export (sources unchanged)", checkRun(ds).status === 0 && J(checkRun(ds)).freshness === "fresh");
  const sc = readJ(path.join(ds, "motion", "score.json")); sc.scenes[0].events[0].t = 2; fs.writeFileSync(path.join(ds, "motion", "score.json"), JSON.stringify(sc, null, 2));
  const stale = checkRun(ds);
  ok("events: the score changed after the export: check refuses the outdated manifest (exit 2, stale, names the file)", stale.status === 2 && J(stale).freshness === "stale" && /stale: score motion\/score\.json changed/.test(stale.stderr), stale.stderr);
  const dAud = fresh("stale-audio"); exportRun(dAud); fs.appendFileSync(path.join(dAud, "motion", "audio_meta.json"), "\n");
  ok("events: a changed audio_meta (a word alignment source) is stale too", checkRun(dAud).status === 2 && /audio_meta/.test(checkRun(dAud).stderr));
  const dApp = fresh("appeared"); fs.rmSync(path.join(dApp, "motion", "sfx-plan.json")); exportRun(dApp); fs.copyFileSync(path.join(FIX, "motion", "sfx-plan.json"), path.join(dApp, "motion", "sfx-plan.json"));
  ok("events: a source that was missing and now exists makes the manifest stale", checkRun(dApp).status === 2 && /now exists/.test(checkRun(dApp).stderr));
  const mt = path.join(ds, "motion", "events.json");
  const loaded = LIB.loadManifest(mt, { run: ds });
  ok("events: loadManifest (every consumer's door) refuses a stale manifest", loaded.ok === false && loaded.stale === true && /stale/.test(loaded.error));
  exportRun(ds);
  const good = bytes(mt);
  const dd = JSON.parse(good.toString()); dd.events.find((e) => e.id === "e-reveal").at_s = 12; dd.events.find((e) => e.id === "e-reveal").frame = 360;
  dd.events.sort(LIB.compareEvents);
  fs.writeFileSync(mt, JSON.stringify(dd, null, 2) + "\n");
  const chk = checkRun(ds);
  ok("events: a hand-edited events.json (sources unchanged) fails check as edited by hand", chk.status === 2 && /edited by hand/.test(chk.stderr), chk.stderr);
  const regen = exportRun(ds);
  ok("events: regenerating overwrites the hand edit with a clear warning and restores the exact bytes", regen.status === 0 && /overwritten/.test(regen.stderr) && /hand edit/.test(regen.stderr) && Buffer.compare(bytes(mt), good) === 0, regen.stderr);
  const regen2 = exportRun(ds);
  ok("events: a regenerate with nothing edited has no overwrite warning", regen2.status === 0 && !/overwritten/.test(regen2.stderr));

  // ---- diff
  const dfOk = node("events.mjs", ["diff", "--a", ma, "--b", mb]);
  ok("events: diff of identical manifests exits 0, identical true", dfOk.status === 0 && J(dfOk).identical === true);
  const mv = JSON.parse(fs.readFileSync(ma, "utf8")); const x = mv.events.find((e) => e.id === "hit-open-1"); x.at_s = 1.5; x.frame = 45; mv.events.sort(LIB.compareEvents); fs.writeFileSync(path.join(tmp, "events-moved.json"), JSON.stringify(mv));
  const dfMv = node("events.mjs", ["diff", "--a", ma, "--b", path.join(tmp, "events-moved.json")]);
  ok("events: diff reports a moved event with the delta in seconds and frames (exit 2)", dfMv.status === 2 && J(dfMv).moved?.[0]?.id === "hit-open-1" && J(dfMv).moved[0].delta_s === 0.3 && J(dfMv).moved[0].delta_frames === 9, dfMv.stdout);
  ok("events: diff exit 1 when a file is missing", node("events.mjs", ["diff", "--a", ma, "--b", path.join(tmp, "nothing.json")]).status === 1);

  // ---- no network, no API
  const guard = path.join(tmp, "no-network.cjs");
  fs.writeFileSync(guard, `const net=require("net"),dns=require("dns"),http=require("http"),https=require("https"),log=[];const boom=(n)=>function(){log.push(n);require("fs").writeFileSync(${JSON.stringify(path.join(tmp, "network-calls.txt"))},log.join(","));throw new Error("network blocked: "+n)};net.Socket.prototype.connect=boom("net.connect");dns.lookup=boom("dns.lookup");http.request=boom("http.request");https.request=boom("https.request");globalThis.fetch=boom("fetch");`);
  const dn = fresh("net");
  const rn = spawnSync(process.execPath, ["--require", guard, path.join(HERE, "..", "events.mjs"), "export", "--run", dn], { encoding: "utf8" });
  const rc = spawnSync(process.execPath, ["--require", guard, path.join(HERE, "..", "events.mjs"), "check", "--run", dn], { encoding: "utf8" });
  ok("events: export and check run with every network call blocked (none were attempted)", rn.status === 0 && rc.status === 0 && !fs.existsSync(path.join(tmp, "network-calls.txt")), rn.stderr + rc.stderr);

  // ---- legacy scores behave as before (no manifest: nothing reads one, nothing changes)
  const dl = fresh("legacy");
  const sfxLegacy = J(node("sound.mjs", ["sfx-plan", "--scenes", path.join(dl, "motion", "score.json"), "--no-library"]));
  ok("events: a legacy run with no manifest still plans sfx the old way (no events.json involved, nothing read or written)", Array.isArray(sfxLegacy.cues) && !fs.existsSync(path.join(dl, "motion", "events.json")));

  // ---- consumers
  const dc = fresh("consume"); exportRun(dc);
  const man = path.join(dc, "motion", "events.json");
  const sfx = J(node("sound.mjs", ["sfx-plan", "--scenes", path.join(dc, "motion", "score.json"), "--events", man, "--no-library"]));
  const manIds = new Set(readJ(man).events.map((e) => e.id)), manTimes = new Set(readJ(man).events.map((e) => e.at_s));
  const skippedIds = (sfx.skipped || []).map((x) => x.event);
  ok("sound: sfx-plan --events <manifest> plans cues at the manifest's picture times (9.5 s reveal, 29 s logo), under the unchanged budget", (sfx.cues || []).length >= 2 && sfx.cues.every((c) => manTimes.has(c.t) && manIds.has(c.event)) && sfx.cues.some((c) => c.t === 9.5) && sfx.cues.some((c) => c.t === 29), JSON.stringify(sfx.cues?.map((c) => [c.event, c.kind, c.t])) + (sfx.error || ""));
  ok("sound: the manifest's sounded seam reaches the planner by its id and is judged by the existing rules (an ordinary transition gets no whoosh)", skippedIds.includes("seam-reveal-close") && !(sfx.cues || []).some((c) => c.event === "seam-reveal-close"), JSON.stringify(sfx.skipped));
  ok("sound: the cue keeps its event id and scene number (the same ids as the manifest)", (sfx.cues || []).some((c) => c.event === "e-reveal" && c.scene === 2 && c.kind === "reveal"));
  const sOld = J(node("sound.mjs", ["sfx-plan", "--scenes", path.join(dc, "motion", "score.json"), "--events", (() => { const f = path.join(tmp, "legacy-events.json"); fs.writeFileSync(f, JSON.stringify({ events: [{ t: 2, kind: "click" }, { t: 5, kind: "pop" }] })); return f; })(), "--no-library"]));
  ok("sound: a legacy events.json is read as before (its own ids e1/e2, its own times)", (sOld.cues || []).length >= 1 && sOld.cues.every((c) => /^e[12]$/.test(c.event) && [2, 5].includes(c.t)), JSON.stringify(sOld.cues?.map((c) => [c.event, c.t])));
  const sc2 = readJ(path.join(dc, "motion", "score.json")); sc2.scenes[0].events[0].t = 2; fs.writeFileSync(path.join(dc, "motion", "score.json"), JSON.stringify(sc2, null, 2));
  const sStale = node("sound.mjs", ["sfx-plan", "--scenes", path.join(dc, "motion", "score.json"), "--events", man, "--no-library"]);
  ok("sound: a stale manifest is refused (non-zero exit, 'stale' in the message), not used", sStale.status !== 0 && /stale/.test(sStale.stderr + sStale.stdout), sStale.stderr);

  // crew.mjs check (the score role): only a run that has a manifest is checked against it; the score's other checks are untouched
  {
    const warnOf = (d) => { const j = J(node("crew.mjs", ["check", "--role", "motion-director", "--run", d])); return (j.warnings || []).filter((w) => /^events-/.test(w)); };
    const dg = fresh("crew-legacy"), df = fresh("crew-fresh"), dx = fresh("crew-stale"), dz = fresh("crew-offsync");
    exportRun(df); exportRun(dx); exportRun(dz);
    const sx2 = readJ(path.join(dx, "motion", "score.json")); sx2.scenes[0].events[0].t = 2; fs.writeFileSync(path.join(dx, "motion", "score.json"), JSON.stringify(sx2, null, 2));
    const off2 = readJ(path.join(dz, "motion", "audio_meta.json")); off2.voices[0].words[1].start = 0.25; fs.writeFileSync(path.join(dz, "motion", "audio_meta.json"), JSON.stringify(off2)); // the manifest is now stale too: re-export it
    exportRun(dz);
    ok("crew: a legacy score (no events.json) gets no events warning", warnOf(dg).length === 0, JSON.stringify(warnOf(dg)));
    ok("crew: a fresh manifest that derives cleanly adds no warning", warnOf(df).length === 0, JSON.stringify(warnOf(df)));
    ok("crew: a stale manifest is a warning naming the export command (the score's own result is otherwise unchanged)", warnOf(dx).some((w) => /^events-manifest: .*stale.*events\.mjs export/.test(w)), JSON.stringify(warnOf(dx)));
    ok("crew: a hit, foley and word more than a frame apart is an events-sync warning with the measured frames", warnOf(dz).some((w) => /^events-sync: sync-off: "e-reveal".*frames/.test(w)), JSON.stringify(warnOf(dz)));
  }

  // subtitles: the delivery module's word source
  const dw = fresh("words"); exportRun(dw);
  const DL = await import("../lib/deliver.mjs");
  const mw = LIB.presentManifest(dw).manifest;
  const fw = DL.filmWords(dw, [], mw), fwLegacy = DL.filmWords(dw, [], null);
  ok("subtitles: word times come from the manifest when given one (9.48 s 'reveal'), and are empty with no manifest and no audio_meta in the project (legacy path unchanged)", fw.words.some((w) => w.text === "reveal" && w.start === 9.48) && /events\.json/.test(fw.source) && fwLegacy.words.length === 0 && fwLegacy.source === null);
  const pm = LIB.publicManifest(M);
  const pmText = JSON.stringify(pm);
  ok("deliver: the public manifest carries ids, times, frames, kinds and words but no score free text and no local path", !/synthetic key press|synthetic logo/.test(pmText) && !/\/Users\/|\/home\/|\/tmp\/|\/var\//.test(pmText) && pm.events.every((e) => !("attrs" in e)) && pm.source.score === "motion/score.json" && pm.events.some((e) => e.sound === "reveal"));
  const extSrc = LIB.publicManifest({ ...M, source: { ...M.source, score: "/Users/someone/private/score.json", audio_meta: { path: "../../secret.json", sha256: "a", status: "present" } } });
  ok("deliver: an absolute or escaping source path is never exported", extSrc.source.score === "motion/score.json" && extSrc.source.audio_meta.path === null);

  // video.mjs deliver: the manifest rides along in the build metadata only when the run has a fresh one
  if (spawnSync("ffmpeg", ["-version"]).status !== 0) ok("deliver: film-events.json in the delivery folder (not run: ffmpeg missing)", true);
  else {
    const mkProject = (name) => {
      const proj = path.join(tmp, name, "videos", "demo"); fs.mkdirSync(path.join(proj, "renders"), { recursive: true });
      spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=blue:s=320x180:d=3:r=10", "-f", "lavfi", "-i", "sine=f=300:d=3", "-pix_fmt", "yuv420p", "-shortest", path.join(proj, "renders", "FINAL.mp4")]);
      fs.writeFileSync(path.join(proj, "hyperframes.json"), "{}");
      return proj;
    };
    const withRun = fresh("deliver-run"), noRun = fresh("deliver-legacy");
    exportRun(withRun); fs.writeFileSync(path.join(withRun, "session.json"), "{}"); fs.writeFileSync(path.join(noRun, "session.json"), "{}");
    const o1 = path.join(tmp, "deliver-out-1"), o2 = path.join(tmp, "deliver-out-2");
    const d1 = J(node("video.mjs", ["deliver", "--run", withRun, "--project", mkProject("dp1"), "--out", o1])), d2 = J(node("video.mjs", ["deliver", "--run", noRun, "--project", mkProject("dp2"), "--out", o2]));
    const fe = path.join(o1, "film-events.json"), pub = fs.existsSync(fe) ? fs.readFileSync(fe, "utf8") : "";
    ok("deliver: a run with a fresh manifest gets film-events.json in the folder (files.events), the subtitles come from its words", d1.ok === true && d1.files?.events === "film-events.json" && !!pub && fs.existsSync(path.join(o1, "demo.srt")) && /reveal/.test(fs.readFileSync(path.join(o1, "demo.srt"), "utf8")), JSON.stringify(d1).slice(0, 300));
    ok("deliver: film-events.json carries no private local path and no score free text", !!pub && !/\/Users\/|\/var\/|\/private\/|\/tmp\//.test(pub) && !/synthetic key press|synthetic logo/.test(pub) && JSON.parse(pub).source.score === "motion/score.json" && !(d1.leaks || []).length, pub.slice(0, 200));
    ok("deliver: a legacy run with no manifest delivers exactly as before (no film-events.json, no srt invented)", d2.ok === true && !d2.files?.events && !fs.existsSync(path.join(o2, "film-events.json")));
  }

  // music: the tempo hits come from the manifest (needs ffmpeg for a tiny user track; no network: --sources user)
  const ff = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" });
  if (ff.status !== 0) ok("music: --hits from the manifest (not run: ffmpeg missing)", true);
  else {
    const track = path.join(tmp, "events-track.wav");
    spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=220:duration=45", track]);
    const dm = fresh("music"); exportRun(dm);
    const runM = (d, extra = []) => node("music.mjs", ["--run", d, "--film", "30", "--track", track, "--library", "other", "--declared", "synthetic fixture", "--sources", "user", "--no-preview", ...extra]);
    const rm = runM(dm), jm = J(rm);
    const hitsFile = path.join(dm, "music", "hits.json");
    const hj = fs.existsSync(hitsFile) ? readJ(hitsFile) : null;
    const want = new Set(LIB.hitTimes(M).filter((h) => h.t > 0 && h.t <= 30).map((h) => h.t)).size; // 1.2, 9, 9.5, 21, 29, 30 (the 9.5 drop, break end and hit are one time)
    ok("music: with a fresh motion/events.json the tempo is scanned from the manifest's hit times (hits.json has every one of them)", rm.status === 0 && !!hj && hj.hits === want && /film-event manifest/.test(JSON.stringify(jm.notes || jm)), (rm.stderr || "").slice(0, 200) + JSON.stringify(hj).slice(0, 200));
    const dm2 = fresh("music-legacy"); // a legacy run: the score alone (its seams carry no times), as before
    const rm2 = runM(dm2), hj2 = fs.existsSync(path.join(dm2, "music", "hits.json")) ? readJ(path.join(dm2, "music", "hits.json")) : null;
    ok("music: a legacy run with no manifest does not read one (its hit list is the score's, as before)", rm2.status === 0 && !/film-event manifest/.test(rm2.stdout) && !!hj2 && hj2.hits === 3, JSON.stringify(hj2).slice(0, 120)); // the arc's drop 9.5, payoff 21 and button 30 only
    const sc3 = readJ(path.join(dm, "motion", "score.json")); sc3.scenes[1].events[0].t = 1; fs.writeFileSync(path.join(dm, "motion", "score.json"), JSON.stringify(sc3, null, 2));
    const rm3 = runM(dm, ["--events", path.join(dm, "motion", "events.json")]);
    ok("music: --events with a stale manifest is refused (exit non-zero)", rm3.status !== 0 && /stale/.test(rm3.stderr + rm3.stdout), rm3.stderr);
  }
}
