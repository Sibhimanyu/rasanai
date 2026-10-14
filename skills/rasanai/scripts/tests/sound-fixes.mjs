// The FILM-E sound and slop fixes: one SFX budget read by slop and sound.mjs (the music bed is never an SFX), sfx-plan that
// ranks before it spends (typing burst = one cue, spread over the film, a signature whoosh kept where the music hits), the
// payoff check that also reports the score's music_arc.payoff_at, and narrow-rhythm that leaves out reading-bound shots.
// export default async function ({ ok, node, tmp }).
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { SFX_BUDGET, sfxMode, sfxLimit, sfxOver } from "../lib/audio.mjs";

export default async function ({ ok, node, tmp }) {
  const dir = fs.mkdtempSync(path.join(tmp, "soundfix-"));
  const J = (r) => { try { return JSON.parse(r.stdout); } catch { return {}; } };

  // ---- the one budget
  ok("sfx budget: one table; unnarrated 25 in 30 s, narrated 15, reel 30", sfxLimit("unnarrated", 30) === 25 && sfxLimit("narrated", 30) === 15 && sfxLimit("reel", 30) === 30 && SFX_BUDGET.unnarrated.perSec === 1 / 1.2);
  ok("sfx budget: sfxMode and sfxOver (one over the limit is rounding, two is overload)", sfxMode({ narrated: true }) === "narrated" && sfxMode({ format: "reel" }) === "reel" && !sfxOver(26, "unnarrated", 30) && sfxOver(27, "unnarrated", 30));

  // ---- slop: the bed is not an SFX; the limit is sound.mjs's
  const proj = (name, n, extra = "") => {
    const p = path.join(dir, name); fs.mkdirSync(p, { recursive: true });
    const tags = ['<audio id="el-bed" src="assets/music-bed.wav" data-start="0"></audio>', ...Array.from({ length: n }, (_, i) => `<audio id="el-sfx-${i}" src="assets/sfx/rasa/uisfx-minimal-click.wav" data-start="${i}"></audio>`)];
    fs.writeFileSync(path.join(p, "index.html"), `<!doctype html><html><body><div id="root" data-composition-id="main" data-width="1920" data-height="1080" data-duration="30">${tags.join("\n")}${extra}</div></body></html>`);
    return p;
  };
  const slop = (p, more = []) => J(node("slop.mjs", ["--project", p, "--film", "30", "--no-text-fit", "--json", ...more]));
  const rules = (j) => (j.findings || []).map((f) => f.rule);
  ok("slop: 24 SFX and a bed in 30 s pass the shared unnarrated budget (the bed is not counted)", !rules(slop(proj("p24", 24))).includes("sfx-overload"), JSON.stringify(rules(slop(proj("p24b", 24)))));
  ok("slop: 28 SFX in 30 s is sfx-overload, with the budget in the message", (slop(proj("p28", 28)).findings || []).some((f) => f.rule === "sfx-overload" && /25 in 30 s/.test(f.why)));
  ok("slop: a narrated film (voice source) gets the narrated budget", rules(slop(proj("pvo", 18, '<audio id="el-vo" src="assets/voice-1.mp3" data-start="0"></audio>'))).includes("sfx-overload"));

  // ---- slop: narrow-rhythm leaves out reading-bound shots
  const scn = (rows) => { const f = path.join(dir, `scenes-${Math.random().toString(36).slice(2)}.json`); fs.writeFileSync(f, JSON.stringify({ scenes: rows.map(([d, t], i) => ({ title: `s${i + 1}`, duration_s: d, on_screen: t })) })); return f; };
  const four = "one two three four";
  const rh = (rows) => rules(slop(proj("rh" + Math.random().toString(36).slice(2), 3), ["--scenes", scn(rows)]));
  ok("slop: five reading-bound shots (4 words, 1.9-2.0 s) are not a narrow rhythm", !rh([[1.9, four], [2.0, four], [1.9, four], [2.0, four], [1.95, four], [3, ""]]).includes("narrow-rhythm"));
  ok("slop: five free shots in a narrow band are still narrow-rhythm", rh([[1.9, ""], [2.0, ""], [1.9, ""], [2.0, ""], [1.95, ""], [3, ""]]).includes("narrow-rhythm"));

  // ---- ffmpeg-based: sfx-plan and the payoff arc
  if (spawnSync("ffmpeg", ["-version"], { encoding: "utf8" }).status !== 0) { console.log("note  sound-fixes: ffmpeg is not available, sfx-plan and payoff parts skipped"); return; }
  const wav = (name, expr, d = 30) => { const f = path.join(dir, name + ".wav"); spawnSync("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", `aevalsrc='(${expr})*(sin(2*PI*220*t)+0.6*sin(2*PI*330*t))*0.3':s=44100:d=${d}`, f]); return f; };

  const tl = path.join(dir, "timeline.json");
  fs.writeFileSync(tl, JSON.stringify({ total_s: 30, narrated: false, scenes: [{ n: 1, title: "a", start_s: 0, duration_s: 10 }, { n: 2, title: "b", start_s: 10, duration_s: 10 }, { n: 3, title: "c", start_s: 20, duration_s: 10 }] }));
  // 40 key events in the first 3 s (a typing burst), then one click per ~3 s across the film
  const ev = [];
  for (let i = 0; i < 40; i++) ev.push({ id: `k${i}`, t: 0.2 + i * 0.07, kind: "type" });
  for (let i = 0; i < 8; i++) ev.push({ id: `c${i}`, t: 4 + i * 3.4, kind: "click" });
  const evf = path.join(dir, "events.json"); fs.writeFileSync(evf, JSON.stringify(ev));
  const plan = J(node("sound.mjs", ["sfx-plan", "--scenes", tl, "--events", evf]));
  const cues = plan.cues || [];
  ok("sfx-plan: a 40-key typing burst is one cue", cues.filter((c) => c.kind === "type").length === 1 && (plan.skipped || []).some((s) => /typing burst/.test(s.why)), `${cues.length} cues`);
  ok("sfx-plan: the clicks across the film all get a cue (nothing starves behind the burst)", cues.filter((c) => c.kind === "click").length === 8, cues.map((c) => c.kind + c.t).join(" "));

  // a dense run of clicks competes with later ones: the plan spreads
  const dense = [];
  for (let i = 0; i < 40; i++) dense.push({ id: `d${i}`, t: 0.5 + i * 0.25, kind: "click" });
  for (let i = 0; i < 6; i++) dense.push({ id: `e${i}`, t: 12 + i * 3, kind: "click" });
  fs.writeFileSync(evf, JSON.stringify(dense));
  const p2 = J(node("sound.mjs", ["sfx-plan", "--scenes", tl, "--events", evf])).cues || [];
  ok("sfx-plan: ranks before it spends: the late clicks are not crowded out by the early dense run", p2.filter((c) => c.t >= 12).length >= 4, p2.map((c) => c.t).join(" "));

  // a signature whoosh where the bed hits is kept; the same whoosh undeclared is dropped (ordinary transition)
  const bed = wav("hitbed", "0.15+0.85*lt(mod(t,5),0.08)");
  const wh = (sig) => { fs.writeFileSync(evf, JSON.stringify([{ id: "w", t: 10, kind: "whoosh", ...(sig ? { signature: true } : {}) }, { id: "n1", t: 3.3, kind: "none" }, { id: "n2", t: 6, kind: "none" }])); return (J(node("sound.mjs", ["sfx-plan", "--scenes", tl, "--events", evf, "--bed", bed])).cues || []).filter((c) => c.kind === "whoosh").length; };
  ok("sfx-plan: a declared signature whoosh is kept where the music hits", wh(true) === 1);
  ok("sfx-plan: an undeclared whoosh is still dropped", wh(false) === 0);

  // ---- sound.mjs check: the score's music_arc.payoff_at
  const flat = wav("flat", "0.5", 10);
  const score = path.join(dir, "score.json"); fs.writeFileSync(score, JSON.stringify({ music_arc: { payoff_at: 7 } }));
  const chk = (extra) => J(node("sound.mjs", ["check", "--audio", flat, ...extra]));
  const both = chk(["--payoff", "4", "--score", score]);
  ok("check: the reveal and the arc payoff are both reported when they differ", both.measures?.payoff?.at === 4 && both.measures?.payoff?.arc?.at === 7 && both.measures.payoff.arc.from === "score music_arc.payoff_at", JSON.stringify(both.measures?.payoff));
  ok("check: the arc payoff's warnings are tagged", (both.warnings || []).some((w) => /^arc payoff \(7/.test(w)), (both.warnings || []).join(" | "));
  const only = chk(["--score", score]);
  ok("check: with no other payoff time the score's music_arc.payoff_at is the payoff", only.measures?.payoff?.at === 7 && !only.measures.payoff.arc, JSON.stringify(only.measures?.payoff));
  const same = chk(["--payoff", "7", "--score", score]);
  ok("check: an arc payoff equal to the checked one is not reported twice", same.measures?.payoff?.at === 7 && !same.measures.payoff.arc);
  const planf = path.join(dir, "plan.json"); fs.writeFileSync(planf, JSON.stringify({ moments: { reveal: { t: 4 } }, music_arc: { payoff_at: 7 } }));
  const viaPlan = chk(["--plan", planf]);
  ok("check: the plan's own music_arc is read too (reveal checked, arc reported)", viaPlan.measures?.payoff?.at === 4 && viaPlan.measures.payoff.arc?.at === 7, JSON.stringify(viaPlan.measures?.payoff));
}
