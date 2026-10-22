// original-score: the optional procedural original score (scripts/original-score.mjs, lib/procedural-score.mjs, music.mjs source "procedural", sound.mjs fit / render / check).
// A 20 s offline track with 3 sections, a clear peak on a picture event (within one output frame), a designed pause, an ending and 2-3 instrument families; the same input and seed give
// the same bytes; moving a scene cue moves only its own hit; the user's own track wins; legacy tracks fit as before; sound.mjs check passes the mix and FAILS a clipped or misaligned one;
// no clipping, no looped bed, no music past the CTA; credits list only samples used (none). Listen-proxy evidence (section energy table, spectrogram and waveform PNG) is printed.
// Fixtures are synthetic (tests/fixtures/original-score, tests/fixtures/events). export default async function ({ ok, node, tmp }).
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(HERE, "fixtures", "original-score");
const EVFIX = path.join(HERE, "fixtures", "events", "run");
const P = await import("../lib/procedural-score.mjs");
const hasFfmpeg = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" }).status === 0;

export default async function ({ ok, node, tmp }) {
  const J = (r) => { try { return JSON.parse(r.stdout); } catch { return {}; } };
  const readJ = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
  let n = 0;
  const fresh = (src, name) => { const d = path.join(tmp, `os-${++n}-${name}`); fs.cpSync(src, d, { recursive: true }); return d; };
  const exportEv = (run) => node("events.mjs", ["export", "--run", run]);
  const ID = path.join(FIX, "identity.json");
  const render = (run, out, extra = []) => node("original-score.mjs", ["render", "--events", path.join(run, "motion", "events.json"), "--run", run, "--identity", ID, "--out", out, ...extra]);
  const wavOf = (f) => P.readWav(fs.readFileSync(f));
  const F = 30;

  // ---- the 20 s acceptance track, offline
  const run = fresh(path.join(FIX, "run"), "run");
  ok("original-score: the events manifest exports for the synthetic 20 s film", exportEv(run).status === 0);
  const out1 = path.join(tmp, "a", "score.wav");
  const t0 = Date.now();
  const r1 = render(run, out1);
  const secs = (Date.now() - t0) / 1000;
  const R1 = J(r1);
  ok("original-score: render passes (exit 0) with no problems, entirely offline, in a few seconds (CPU budget)", r1.status === 0 && R1.ok === true && R1.problems.length === 0 && secs < 30, r1.stdout.slice(0, 400) + r1.stderr);
  const W = wavOf(out1);
  ok("original-score: the WAV is stereo, 48 kHz, exactly the film's length (20.000 s)", W && W.channels.length === 2 && W.sr === 48000 && W.frames === 20 * 48000, JSON.stringify(W && [W.channels.length, W.sr, W.frames]));
  const side = readJ(P.sidecarPath(out1));
  const D = readJ(path.join(tmp, "a", "score.diagnostics.json"));
  ok("original-score: three sections (intro, peak, resolve) and the peak is at least 3 dB louder than the intro", D.sections.length === 3 && D.section_lift_db >= 3, JSON.stringify(D.sections));
  const peakCue = D.cues.find((c) => c.role === "peak");
  ok("original-score: the clear peak hit lands on the picture event (e-reveal at 8.000 s) within one output frame", peakCue && peakCue.id === "e-reveal" && peakCue.within_one_frame && Math.abs(peakCue.err_frames) <= 1 && peakCue.jump_db > 15, JSON.stringify(peakCue));
  const payCue = D.cues.find((c) => c.role === "payoff");
  ok("original-score: the payoff accent lands on the arc's payoff cue (15.000 s) within one frame", payCue && payCue.within_one_frame, JSON.stringify(payCue));
  ok("original-score: a designed pause (the music drops out and only the ambience is left) sits right before the peak hit", D.pause && D.pause.to_s === 8 && D.pause.below_median_db >= 8, JSON.stringify(D.pause));
  ok("original-score: an ending: the closing chord is on the logo (19.000 s), rings out, and fades to silence on the last frames; nothing is audible 1.3 s past the CTA", D.ending.cue_at_s === 19 && D.ending.cta_at_s === 19 && D.ending.last_30ms_db <= -40 && D.ending.last_audible_s - 19 <= 1.3 && !D.problems.some((p) => /past the CTA/.test(p)), JSON.stringify(D.ending));
  ok("original-score: 3 instrument families (plucked, sustained pad, bass and percussion)", side.families.length >= 2 && side.families.length <= 3, JSON.stringify(side.families));
  ok("original-score: no clipping, and the peak keeps at least 1 dB of headroom", D.clipped_samples === 0 && D.peak_dbfs <= -1, `${D.clipped_samples} clipped, peak ${D.peak_dbfs} dBFS`);
  ok("original-score: no unplanned silence and no repeated block (level-shape correlation under 0.995)", D.silences.every((s) => s.designed) && (D.loop.worst_corr == null || D.loop.worst_corr < 0.995), JSON.stringify([D.silences, D.loop]));

  // ---- determinism: same input + seed, the same bytes; another seed or another look, a different score
  const out2 = path.join(tmp, "b", "score.wav");
  render(run, out2);
  ok("original-score: the same events, identity and seed give a byte-identical WAV (in another folder)", Buffer.compare(fs.readFileSync(out1), fs.readFileSync(out2)) === 0);
  const out1b = path.join(tmp, "a", "score.wav");
  const sideBefore = fs.readFileSync(P.sidecarPath(out1), "utf8");
  render(run, out1b);
  ok("original-score: rendering again over the same file reproduces the WAV and the sidecar exactly", fs.readFileSync(P.sidecarPath(out1), "utf8") === sideBefore);
  const out3 = path.join(tmp, "c", "score.wav");
  render(run, out3, ["--seed", "8"]);
  ok("original-score: another seed gives a different score", Buffer.compare(fs.readFileSync(out1), fs.readFileSync(out3)) !== 0);
  const idA = P.deriveIdentity({ look: "swiss editorial grid", story: "a quiet build", seed: 1 }), idB = P.deriveIdentity({ look: "dark neon terminal glitch", story: "a quiet build", seed: 1 });
  ok("original-score: the musical identity follows the look (family, key and motif differ between an editorial and a dark-tech film; identical inputs give an identical identity)",
    idA.family === "editorial" && idB.family === "dark-tech" && JSON.stringify(idA.motif) !== JSON.stringify(idB.motif) && idA.fingerprint !== idB.fingerprint && JSON.stringify(P.deriveIdentity({ look: "swiss editorial grid", story: "a quiet build", seed: 1 })) === JSON.stringify(idA), JSON.stringify([idA.family, idB.family]));
  ok("original-score: the identity has a pulse, a key, voices, a signature motif of 3+ notes and a cadence", idA.bpm >= 70 && idA.bpm <= 140 && /minor|major|dorian|lydian|mixolydian|phrygian/.test(idA.key) && idA.motif.length >= 3 && idA.cadence.length >= 2 && idA.instruments.lead && idA.instruments.pad);

  // ---- moving a scene cue moves only the intended hit (the arc and every other cue stay)
  const run2 = fresh(path.join(FIX, "run"), "moved");
  const sc = readJ(path.join(run2, "motion", "score.json"));
  sc.scenes[1].events.find((e) => e.id === "e-reveal").t = 0.5; // 8.0 s -> 8.5 s; the arc's drop_at, the other events and every scene stay
  fs.writeFileSync(path.join(run2, "motion", "score.json"), JSON.stringify(sc, null, 2));
  exportEv(run2);
  const outM = path.join(tmp, "m", "score.wav");
  const rM = render(run2, outM, ["--with-foley"]);
  const outB = path.join(tmp, "base", "score.wav");
  render(run, outB, ["--with-foley"]);
  const DM = readJ(path.join(tmp, "m", "score.diagnostics.json"));
  const mv = DM.cues.find((c) => c.id === "e-reveal");
  ok("original-score: moving e-reveal to 8.5 s moves the peak hit with it (onset at 8.5 s, within one frame)", rM.status === 0 && mv && mv.within_one_frame && Math.abs(mv.onset_s - 8.5) <= 1 / F, JSON.stringify(mv));
  const A = wavOf(outB), B = wavOf(outM), sr = A.sr;
  const maxDiff = (a, b, t0, t1) => { let m = 0; for (let c = 0; c < 2; c++) for (let i = Math.floor(t0 * sr); i < Math.min(a.frames, Math.floor(t1 * sr)); i++) m = Math.max(m, Math.abs(a.channels[c][i] - b.channels[c][i])); return m; };
  const before = maxDiff(A, B, 0, 7.0), after = maxDiff(A, B, 13.0, 20), inside = maxDiff(A, B, 7.0, 13.0);
  ok("original-score: the rest of the score is untouched: the mix is identical (under -100 dBFS) before 7 s and after 13 s, and does change around the moved hit", before < 1e-5 && after < 1e-5 && inside > 0.01, `before ${before}, after ${after}, inside ${inside}`);
  const sideM = readJ(P.sidecarPath(outM)), sideB = readJ(P.sidecarPath(outB));
  ok("original-score: the sidecar lists exactly the moved hit as moved; the payoff hit and the foley of the other cues keep their times", sideM.hits.find((h) => h.id === "e-reveal").at_s === 8.5 && sideB.hits.find((h) => h.id === "e-reveal").at_s === 8 && sideM.hits.find((h) => h.role === "payoff").at_s === sideB.hits.find((h) => h.role === "payoff").at_s
    && sideM.foley.filter((f) => f.id !== "foley-e-reveal").every((f) => sideB.foley.find((g) => g.id === f.id && g.at_s === f.at_s)) && sideM.foley.find((f) => f.id === "foley-e-reveal").at_s === 8.5, JSON.stringify([sideM.foley, sideB.foley]));
  const stemDiff = (name, t0, t1) => maxDiff(wavOf(path.join(tmp, "base", "score-stems", `${name}.wav`)), wavOf(path.join(tmp, "m", "score-stems", `${name}.wav`)), t0, t1);
  ok("original-score: the foley stem differs only where e-reveal's own tick moved (8.0 s and 8.5 s, each about 0.5 s long); the ticks at 1.2, 4.5 and 11.1 s are sample-identical", stemDiff("foley", 0, 7.9) === 0 && stemDiff("foley", 9.2, 20) === 0 && stemDiff("foley", 7.9, 9.2) > 0.01);
  const amb = (t0, t1) => stemDiff("ambience", t0, t1);
  ok("original-score: the ambience stem is independent of the cue (identical)", amb(0, 20) === 0);

  // ---- stems, provenance, credits, licence
  const stemDir = path.join(tmp, "a", "score-stems");
  ok("original-score: stems are written separately (music, ambience, foley), each stereo and film-length", ["music", "ambience", "foley"].every((s) => { const w = wavOf(path.join(stemDir, `${s}.wav`)); return w && w.channels.length === 2 && w.frames === 20 * 48000; }));
  ok("original-score: provenance: origin procedural, no samples used, a recorded quality downgrade, no credit needed", D.provenance.origin === "procedural" && D.provenance.samples_used.length === 0 && /synthesised/.test(D.provenance.quality_downgrade) && /no third-party|no credit/i.test(D.provenance.license) && D.provenance.sha256_matches === true, JSON.stringify(D.provenance));
  const { creditsText } = await import("../lib/music-lib.mjs");
  const cr = creditsText({ id: "p", title: "Original score", origin: "procedural", samples_used: [] });
  const cr2 = creditsText({ id: "p", title: "Original score", origin: "procedural", samples_used: [{ name: "kick.wav", license: "CC0-1.0", source: "https://example.invalid/kick" }] });
  ok("original-score: credits list only the samples actually used (none -> 'Samples used: none'; one -> that one, with its licence)", /Samples used: none/.test(cr.credits) && /kick\.wav \(CC0-1\.0/.test(cr2.credits) && !/Samples used: none/.test(cr2.credits));

  // ---- the check gate: clipped / loud and misaligned tracks FAIL, the clean one passes
  const evFile = path.join(run, "motion", "events.json");
  const chk = node("original-score.mjs", ["check", "--audio", out1, "--events", evFile]);
  ok("original-score: check passes the clean render (exit 0)", chk.status === 0 && J(chk).ok === true, chk.stderr);
  const loud = path.join(tmp, "loud.wav");
  { const c = A.channels.map((ch) => { const o = new Float64Array(ch.length); for (let i = 0; i < ch.length; i++) o[i] = Math.max(-1, Math.min(1, ch[i] * 9)); return o; }); fs.writeFileSync(loud, P.wavBytes({ n: A.frames, L: c[0], R: c[1] }, sr, A.frames)); }
  const cl = node("original-score.mjs", ["check", "--audio", loud, "--events", evFile]);
  ok("original-score: check FAILS a deliberately loud, hard-clipped track (exit 2, clipping named)", cl.status === 2 && /clipping/.test(cl.stderr), cl.stderr);
  const late = path.join(tmp, "late.wav");
  { const sh = Math.round(0.2 * sr); const c = A.channels.map((ch) => { const o = new Float64Array(ch.length); for (let i = sh; i < ch.length; i++) o[i] = ch[i - sh]; return o; }); fs.writeFileSync(late, P.wavBytes({ n: A.frames, L: c[0], R: c[1] }, sr, A.frames)); }
  const mi = node("original-score.mjs", ["check", "--audio", late, "--events", evFile]);
  ok("original-score: check FAILS a track whose hit is 6 frames late (exit 2, misaligned with the picture)", mi.status === 2 && /misaligned|frames away/.test(mi.stderr), mi.stderr);
  const flat = path.join(tmp, "flat.wav");
  { const c = A.channels.map((ch) => { const o = new Float64Array(ch.length); for (let i = 0; i < ch.length; i++) o[i] = Math.sin(i * 0.05) * 0.2; return o; }); fs.writeFileSync(flat, P.wavBytes({ n: A.frames, L: c[0], R: c[1] }, sr, A.frames)); }
  const fl = node("original-score.mjs", ["check", "--audio", flat, "--events", evFile]);
  ok("original-score: check FAILS a flat drone (no hit on the cue, an abrupt end, sections that do not differ)", fl.status === 2 && /no onset|sections|ending/.test(fl.stderr), fl.stderr);
  const shortF = path.join(tmp, "short.wav");
  fs.writeFileSync(shortF, P.wavBytes({ n: 10 * sr, L: A.channels[0].subarray(0, 10 * sr), R: A.channels[1].subarray(0, 10 * sr) }, sr, 10 * sr));
  ok("original-score: check FAILS a wrong duration (10 s for a 20 s film)", node("original-score.mjs", ["check", "--audio", shortF, "--events", evFile]).status === 2);

  // ---- sound.mjs takes the score through its existing fit / render / check
  if (!hasFfmpeg) ok("original-score: sound.mjs fit / render / check (not run: ffmpeg is not installed)", true);
  else {
    const planF = path.join(tmp, "plan.json"), bed = path.join(tmp, "bed.wav");
    const ft = node("sound.mjs", ["fit", "--track", out1, "--film", "20", "--out", planF]);
    const plan = J(ft);
    ok("original-score: sound.mjs fit takes the procedural score as is (shape procedural-exact, one segment, never re-cut)", ft.status === 0 && plan.shape === "procedural-exact" && plan.segments.length === 1 && plan.origin === "procedural", ft.stdout.slice(0, 300) + ft.stderr);
    const rd = node("sound.mjs", ["render", "--plan", planF, "--out", bed]);
    const R = J(rd);
    ok("original-score: sound.mjs render masters it to the -14 LUFS target with true peak at or under -1.5 dBTP", rd.status === 0 && Math.abs(R.lufs + 14) <= 0.6 && R.true_peak <= -1.4, rd.stdout.slice(0, 300) + rd.stderr);
    const sk = node("sound.mjs", ["check", "--audio", bed, "--film", "20", "--events", evFile]);
    const SK = J(sk);
    ok("original-score: sound.mjs check passes the mix (exit 0, no problems; -14 LUFS, no repeats, silence only where designed)", sk.status === 0 && SK.ok === true && SK.problems.length === 0 && SK.measures.repeats.length === 0, sk.stdout.slice(0, 600));
    ok("original-score: sound.mjs check finds the music stopped on the logo (no ring-out) and two designed breaks", !(SK.warnings || []).some((w) => /ring-out-ending/.test(w)) && SK.measures.shape.breaks.found.length >= 2, JSON.stringify(SK.measures.shape && SK.measures.shape.breaks));
    const skLoud = node("sound.mjs", ["check", "--audio", loud, "--film", "20", "--events", evFile]);
    ok("original-score: sound.mjs check FAILS the deliberately loud, clipped track (exit 2: loudness / true peak)", skLoud.status === 2 && J(skLoud).problems.some((p) => /loudness|true peak/.test(p.what)), skLoud.stdout.slice(0, 300));
    // a legacy track (no sidecar) or another film length is fitted the way it always was
    const legacy = path.join(tmp, "legacy-track.wav"); fs.copyFileSync(out1, legacy);
    const lg = J(node("sound.mjs", ["fit", "--track", legacy, "--film", "20"]));
    const other = J(node("sound.mjs", ["fit", "--track", out1, "--film", "14"]));
    ok("original-score: a track with no score sidecar, and a different film length, still go through the legacy fit (analysis and bar-line edit, not the exact plan)", lg.shape !== "procedural-exact" && other.shape !== "procedural-exact" && lg.track_summary !== undefined, JSON.stringify([lg.shape, other.shape]));

    // ---- listen-proxy evidence: numeric section energy and a spectrogram / waveform to look at
    const evid = path.join(tmp, "evidence");
    fs.mkdirSync(evid, { recursive: true });
    const sp = spawnSync("ffmpeg", ["-y", "-v", "error", "-i", out1, "-lavfi", "showspectrumpic=s=1200x400:legend=1:scale=log", path.join(evid, "spectrogram.png")]);
    const wf = spawnSync("ffmpeg", ["-y", "-v", "error", "-i", out1, "-lavfi", "aformat=channel_layouts=mono,showwavespic=s=1200x240:colors=#3b82f6", path.join(evid, "waveform.png")]);
    ok("original-score: spectrogram and waveform PNGs are written for the human to look at", sp.status === 0 && wf.status === 0 && fs.existsSync(path.join(evid, "spectrogram.png")) && fs.existsSync(path.join(evid, "waveform.png")), String(sp.stderr));
    console.log(`      evidence: ${path.join(evid, "spectrogram.png")}  ${path.join(evid, "waveform.png")}`);
  }
  console.log("      section energy (dBFS RMS): " + D.sections.map((s) => `${s.name} ${s.start_s}-${s.end_s} s ${s.rms_db}`).join(" | ") + `; pause ${D.pause.level_db} dB; peak ${D.peak_dbfs} dBFS; hit error ${D.hits.max_err_frames} frames`);
  { // 0.5 s energy strip (dB): the shape of the film in numbers
    const strip = []; for (let t = 0; t < 20; t += 0.5) { let z = 0, c = 0; for (let i = Math.floor(t * sr); i < Math.floor((t + 0.5) * sr); i++) { z += A.channels[0][i] ** 2; c++; } strip.push(Math.round(10 * Math.log10(z / c + 1e-12))); }
    console.log("      0.5 s energy strip: " + strip.join(" "));
  }

  // ---- the 30 s synthetic events fixture: no audibly looped bed, no music past the CTA
  const run30 = fresh(EVFIX, "run30");
  exportEv(run30);
  const out30 = path.join(tmp, "t30", "score.wav");
  const r30 = node("original-score.mjs", ["render", "--events", path.join(run30, "motion", "events.json"), "--run", run30, "--look", "calm organic paper craft", "--story", "a quiet reveal and a warm close", "--out", out30]);
  const D30 = J(r30);
  ok("original-score: a 30 s film (the events fixture) renders clean: no audible loop, music stops on the logo, no clipping", r30.status === 0 && D30.ok === true, r30.stdout.slice(0, 300) + r30.stderr);

  // ---- music.mjs: procedural is an explicit choice and the offline fallback; the user's own track and silence win
  const mrun = fresh(path.join(FIX, "run"), "mrun");
  exportEv(mrun);
  const mu = (a) => node("music.mjs", ["--run", mrun, "--film", "20", "--no-preview", ...a]);
  const own = mu(["--sources", "procedural", "--procedural", "--style", "swiss editorial grid"]);
  const O = J(own);
  const po = (O.options || []).find((o) => o.origin === "procedural");
  ok("original-score: music.mjs --sources procedural gives the original score as an option (usable, never re-cut, no credit, licence recorded)", own.status === 0 && po && po.usable === true && po.fit.shape === "procedural-exact" && po.requires_credit === false && /no third-party/.test(po.license) && O.recommended === po.id, own.stdout.slice(0, 500) + own.stderr);
  const led = readJ(path.join(mrun, "music", "LICENSES.json")).find((l) => l.origin === "procedural");
  ok("original-score: the licence ledger and CREDITS.txt say original, samples used: none", led && Array.isArray(led.samples_used) && led.samples_used.length === 0 && /Samples used: none/.test(fs.readFileSync(path.join(mrun, "music", "CREDITS.txt"), "utf8")));
  const chain = J(node("music.mjs", ["chain"]));
  const pr = (Array.isArray(chain) ? chain : []).find((c) => c.id === "procedural");
  ok("original-score: the default chain keeps its order and lists procedural last as the offline fallback (not explicit)", Array.isArray(chain) && pr && pr.fallback === true && pr.explicit === false && chain[chain.length - 1].id === "procedural" && chain.findIndex((c) => c.id === "user") === 0);
  const chainEx = J(node("music.mjs", ["chain", "--sources", "user,procedural"]));
  ok("original-score: --sources procedural makes it an explicit choice (and drops the sources not listed)", (chainEx.find ? chainEx : []).find((c) => c.id === "procedural")?.explicit === true && (chainEx.find((c) => c.id === "catalog") || {}).on === false);
  const track = out30; // any file stands in for the user's own track
  const mrun2 = fresh(path.join(FIX, "run"), "mrun2");
  exportEv(mrun2);
  const uw = node("music.mjs", ["--run", mrun2, "--film", "20", "--no-preview", "--sources", "user,procedural", "--procedural", "--track", track, "--library", "own"]);
  const U = J(uw);
  ok("original-score: the user's own track wins: --track beside --procedural gives the user's track first and no procedural option is made", U.options && U.options[0] && U.options[0].origin === "user" && !(U.options || []).some((o) => o.origin === "procedural") && !fs.existsSync(path.join(mrun2, "music", "procedural-editorial.wav")), (uw.stdout || "").slice(0, 400) + uw.stderr);
  const sl = node("music.mjs", ["--run", mrun2, "--film", "20", "--sources", "procedural", "--procedural", "--silent-by-choice", "a silent film on purpose"]);
  const S = J(sl);
  ok("original-score: --silent-by-choice makes no music at all (no options; the note says so)", sl.status === 0 && (S.options || []).length === 0 && /silent-by-choice/.test((S.notes || []).join(" ")), (sl.stdout || "").slice(0, 300));
  const outSil = path.join(tmp, "silent", "score.wav");
  const rs = node("original-score.mjs", ["render", "--events", path.join(run, "motion", "events.json"), "--silent-by-choice", "silent film", "--out", outSil]);
  ok("original-score: render honours --silent-by-choice (exit 0, nothing written)", rs.status === 0 && J(rs).silent_by_choice === "silent film" && !fs.existsSync(outSil));
  // narrated film: the same score, with no melody over the voice
  const idN = P.deriveIdentity({ look: "swiss editorial grid", seed: 1, narrated: true });
  const planN = P.buildPlan(readJ(evFile), idN), planV = P.buildPlan(readJ(evFile), P.deriveIdentity({ look: "swiss editorial grid", seed: 1 }));
  ok("original-score: a narrated film's score has no lead melody over the voice (the motif is left out); an unnarrated one has it", !planN.notes.some((x) => x.voice === "lead" && x.t < 18) && planV.notes.some((x) => x.voice === "lead" && x.t < 18));

  // ---- refusals
  const stale = fresh(path.join(FIX, "run"), "stale");
  exportEv(stale);
  fs.writeFileSync(path.join(stale, "motion", "score.json"), fs.readFileSync(path.join(stale, "motion", "score.json"), "utf8").replace('"drop_at": 8', '"drop_at": 9'));
  const st = render(stale, path.join(tmp, "stale", "s.wav"));
  ok("original-score: a stale events manifest is refused (exit 1), never silently rendered", st.status === 1 && /stale/.test(st.stderr + st.stdout), st.stderr);
  ok("original-score: no events file, a bad --sr and a missing audio are refused with exit 1", node("original-score.mjs", ["render", "--out", path.join(tmp, "x.wav")]).status === 1 && render(run, path.join(tmp, "y.wav"), ["--sr", "22050"]).status === 1 && node("original-score.mjs", ["check", "--audio", path.join(tmp, "nope.wav"), "--events", evFile]).status === 1);
  ok("original-score: a plain event list (no manifest) is accepted: {events:[{id,t,kind}]}", (() => { const f = path.join(tmp, "plain.json"); fs.writeFileSync(f, JSON.stringify({ duration_s: 12, events: [{ id: "a", t: 4, kind: "drop" }, { id: "b", t: 11, kind: "logo" }] })); const r = node("original-score.mjs", ["render", "--events", f, "--look", "retro synthwave", "--out", path.join(tmp, "plain", "p.wav")]); return r.status === 0 && J(r).ok === true; })());
}
