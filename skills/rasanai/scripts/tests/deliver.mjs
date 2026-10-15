// selftest section "deliver": `video.mjs deliver` (the package: film, poster from the score's hero beat, .srt held >= 1.8 s, CREDITS, build.sh,
// NOTE.md quoting the gates, "Missing" instead of invention) and `voice.mjs verify` (whisper transcript vs script: line WER, a misheard name,
// caption hold >= max(1.8 s, speech + 0.6 s), exit 1 + a downgrade when whisper is absent). Synthetic project and run; the speech is macOS `say`.
// export default async function ({ ok, tmp }).
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export default async function ({ ok, tmp }) {
  const work = fs.mkdtempSync(path.join(tmp, "deliver-"));
  const sh = (script, args, o = {}) => spawnSync(process.execPath, [path.join(HERE, script), ...args], { encoding: "utf8", cwd: work, timeout: 300000, ...o });
  const js = (r) => { try { return JSON.parse(r.stdout); } catch { return {}; } };
  const W = (f, t) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, typeof t === "string" ? t : JSON.stringify(t, null, 2)); };
  const proj = path.join(work, "videos", "demo"), run = path.join(work, ".rasanai", "run1");
  const clip = (f, d, bar) => spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", `color=c=${bar}:s=320x180:d=${d}:r=10`, "-f", "lavfi", "-i", `sine=f=300:d=${d}`, "-pix_fmt", "yuv420p", "-shortest", f]);
  fs.mkdirSync(path.join(proj, "renders"), { recursive: true });
  clip(path.join(proj, "renders", "draft-1.mp4"), 6, "red");
  clip(path.join(proj, "renders", "FINAL.mp4"), 6, "blue");
  if (!fs.existsSync(path.join(proj, "renders", "FINAL.mp4"))) { ok("deliver: ffmpeg made the test render", false, "ffmpeg missing?"); return; }
  W(path.join(proj, "hyperframes.json"), {});
  W(path.join(proj, "package.json"), { scripts: { render: "npx --yes hyperframes@0.8.155 render" } });
  W(path.join(proj, "audio_meta.json"), { voices: [{ frame: 2, words: [{ text: "Meet", start: 0, end: 0.3 }, { text: "Kinso.", start: 0.3, end: 0.8 }, { text: "It", start: 1.2, end: 1.4 }, { text: "splits", start: 1.4, end: 1.8 }, { text: "bills.", start: 1.8, end: 2.3 }] }] });
  W(path.join(run, "session.json"), { title: "demo", steps: { music: { decision: "B", decisions_history: [{ decision: "A", replaced_by: "B", because: "A was flat", at: "x" }] } } });
  W(path.join(run, "brief.json"), { narration: "a warm voice" });
  W(path.join(run, "motion", "score.json"), { scenes: [{ n: 1, id: "hook", start: 0, duration: 2, energy: 2 }, { n: 2, id: "hero", start: 2, duration: 3, energy: 5, peak_t: 1.5 }] });
  W(path.join(run, "crew", "motion-gate.json"), { ok: true, verdict: "pass", measured: { coverage: 0.91, longest_still_s: 0.4 }, findings: [{ severity: "warning", check: "creep", at: 1, message: "slow drift" }] });
  W(path.join(run, "crew", "critic-film-2.json"), { round: 2, verdict: "ship", scores: { design: 8 }, findings: [] });
  W(path.join(run, "music", "CREDITS.txt"), 'Music: "Tune" by Someone, CC BY 4.0');
  W(path.join(run, "downgrades.jsonl"), JSON.stringify({ t: "2026-10-01T00:00:00Z", what: "voice", instead: "default voice", why: "no heygen" }) + "\n");

  const out = path.join(work, "out");
  const r = sh("video.mjs", ["deliver", "--run", run, "--project", proj, "--out", out]);
  const j = js(r);
  const has = (f) => fs.existsSync(path.join(out, f));
  ok("deliver: writes the film, poster, srt, CREDITS, build.sh and NOTE.md", r.status === 0 && ["demo.mp4", "poster.jpg", "demo.srt", "CREDITS.txt", "build.sh", "NOTE.md"].every(has), r.stdout + r.stderr);
  ok("deliver: the final is the newest finished render, not the draft", j.render === path.join("renders", "FINAL.mp4") && j.draft === false, JSON.stringify(j.render));
  ok("deliver: the poster is cut at the score's hero beat peak (2 + 1.5 s)", j.poster && j.poster.t === 3.5 && /hero/.test(j.poster.why), JSON.stringify(j.poster));
  const srt = has("demo.srt") ? fs.readFileSync(path.join(out, "demo.srt"), "utf8") : "";
  ok("deliver: the srt is on film time (beat 2 starts at 2 s) and every cue is held 1.8 s or more", /00:00:02,000 --> 00:00:03,\d+/.test(srt) && !/-->\s*00:00:02,[0-7]/.test(srt) && /Meet Kinso\./.test(srt), srt);
  const note = has("NOTE.md") ? fs.readFileSync(path.join(out, "NOTE.md"), "utf8") : "";
  ok("deliver: NOTE.md quotes the motion gate, the critic, the swapped decision and the downgrade", /verdict: pass/.test(note) && /coverage 0\.91/.test(note) && /slow drift/.test(note) && /critic-film round 2: verdict ship/.test(note) && /A was flat/.test(note) && /no heygen/.test(note), note);
  ok("deliver: NOTE.md lists what is not on disk instead of inventing it (slop, obey, sound)", /## Missing/.test(note) && /slop gate: no/.test(note) && /sound check: no/.test(note) && /obey \(motion contract\): no/.test(note), note);
  const cr = has("CREDITS.txt") ? fs.readFileSync(path.join(out, "CREDITS.txt"), "utf8") : "";
  ok("deliver: CREDITS.txt carries the music licence", /"Tune" by Someone, CC BY 4\.0/.test(cr), cr);
  const bs = has("build.sh") ? fs.readFileSync(path.join(out, "build.sh"), "utf8") : "";
  ok("deliver: build.sh is executable, pins hyperframes and re-renders the project", /npx --yes hyperframes@0\.8\.155 render/.test(bs) && /demo\.mp4/.test(bs) && (fs.statSync(path.join(out, "build.sh")).mode & 0o100) !== 0 && spawnSync("bash", ["-n", path.join(out, "build.sh")]).status === 0, bs);

  // unnarrated: no srt, said so
  const proj2 = path.join(work, "videos", "quiet"); fs.cpSync(proj, proj2, { recursive: true }); fs.rmSync(path.join(proj2, "audio_meta.json"));
  W(path.join(run, "brief.json"), { narration: "none" });
  const r2 = sh("video.mjs", ["deliver", "--run", run, "--project", proj2, "--out", path.join(work, "out2")]);
  ok("deliver: an unnarrated film gets no .srt and NOTE.md says why", r2.status === 0 && !fs.existsSync(path.join(work, "out2", "quiet.srt")) && /unnarrated film has no speech/.test(fs.readFileSync(path.join(work, "out2", "NOTE.md"), "utf8")), r2.stdout + r2.stderr);
  const r3 = sh("video.mjs", ["deliver", "--run", path.join(work, "nope"), "--project", proj]);
  ok("deliver: a missing run is exit 1 with a reason", r3.status === 1 && /does not look like a run/.test(r3.stderr), r3.stderr);

  // ---- voice.mjs verify (needs whisper-cli, a model and macOS say)
  const haveWhisper = spawnSync("which", ["whisper-cli"]).status === 0 && fs.existsSync(path.join(process.env.HOME || "", ".cache", "hyperframes", "whisper", "models")) && spawnSync("which", ["say"]).status === 0;
  const vo = path.join(work, "vo.wav");
  if (haveWhisper) { spawnSync("say", ["-o", path.join(work, "a.aiff"), "Meet Kinso. Kinso splits the bill for five people, in one tap. Dessert is on me."]); spawnSync("ffmpeg", ["-v", "error", "-y", "-i", path.join(work, "a.aiff"), "-ar", "16000", vo]); }
  if (!haveWhisper || !fs.existsSync(vo)) { ok("voice verify: skipped (no whisper-cli / model / say on this machine)", true); }
  else {
    const lines = ["Meet Kinso.", "Kinso splits the bill for five people, in one tap.", "Dessert is on me."];
    W(path.join(work, "lines.json"), lines);
    const v1 = sh("voice.mjs", ["verify", "--audio", vo, "--script", path.join(work, "lines.json"), "--names", "Kinso"]);
    ok("voice verify: the script as spoken is clean, exit 0", v1.status === 0 && js(v1).ok === true && js(v1).lines.length === 3 && js(v1).lines.every((l) => l.wer <= 0.1), v1.stdout + v1.stderr);
    W(path.join(work, "bad.json"), ["Meet Kinso.", "Kinso divides the dinner check among six strangers tonight.", "Dessert is on me."]);
    const v2 = sh("voice.mjs", ["verify", "--audio", vo, "--script", path.join(work, "bad.json")]);
    ok("voice verify: a line the voice did not say is an error line-wer (exit 2)", v2.status === 2 && js(v2).findings.some((f) => f.check === "line-wer" && f.severity === "error" && f.line === 2), v2.stdout + v2.stderr);
    W(path.join(work, "name.json"), ["Meet Kinsho.", "Kinsho splits the bill for five people, in one tap.", "Dessert is on me."]);
    const v3 = sh("voice.mjs", ["verify", "--audio", vo, "--script", path.join(work, "name.json"), "--names", "Kinsho"]);
    ok("voice verify: a misheard --names word is an error name-misheard (exit 2)", v3.status === 2 && js(v3).findings.some((f) => f.check === "name-misheard"), v3.stdout + v3.stderr);
    W(path.join(work, "caps.json"), [{ text: "Meet Kinso.", start: 0, end: 1.0 }, { text: "Kinso splits the bill for five people, in one tap.", start: 1.2, end: 6.0 }, { text: "Dessert is on me.", start: 6, end: 8 }]);
    const v4 = sh("voice.mjs", ["verify", "--audio", vo, "--script", path.join(work, "lines.json"), "--captions", path.join(work, "caps.json")]);
    const jc = js(v4);
    ok("voice verify: a caption shown 1.0 s is caption-too-short, long enough ones pass (exit 2)", v4.status === 2 && jc.findings.filter((f) => f.check === "caption-too-short").length === 1 && /Meet Kinso/.test(jc.findings.find((f) => f.check === "caption-too-short").message) && jc.captions.checked, v4.stdout + v4.stderr);
    // whisper absent: exit 1 and a downgrade row
    const v5 = sh("voice.mjs", ["verify", "--audio", vo, "--script", path.join(work, "lines.json"), "--run", run], { env: { ...process.env, PATH: "/usr/bin:/bin" } });
    const dg = fs.readFileSync(path.join(run, "downgrades.jsonl"), "utf8");
    ok("voice verify: no whisper-cli is exit 1 'could not run' and a downgrade is logged", v5.status === 1 && /could not run/.test(v5.stderr) && /narration check by transcription/.test(dg), v5.stderr + dg);
  }
}
