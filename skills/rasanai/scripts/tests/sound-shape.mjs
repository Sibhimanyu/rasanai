// sound.mjs check, the film's shape, on synthetic audio made with ffmpeg lavfi: `no-breath` (a flat 25 s bed, one break in a long film, two
// breaks, one break in a short film, a gap in the tail that does not count) and `no-split-edits` (a VO that stops and starts on every cut
// is flagged and lists where a split edit fits; a J-cut and an L-cut pass; the same from word timings; no VO stem is a skip).
// export default async function ({ ok, node, tmp }).
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export default async function ({ ok, node, tmp }) {
  if (spawnSync("ffmpeg", ["-version"], { encoding: "utf8" }).status !== 0) { console.log("note  sound-shape: ffmpeg is not available, skipped"); return; }
  const dir = fs.mkdtempSync(path.join(tmp, "shape-"));
  const mk = (name, expr, d) => {
    const f = path.join(dir, name + ".wav");
    spawnSync("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", `aevalsrc='(${expr})*(sin(2*PI*220*t)+0.6*sin(2*PI*330*t))*0.3':s=44100:d=${d}`, f]);
    return f;
  };
  const gaps = (list) => list.map(([a, b]) => `between(t,${a},${b})`).join("+");
  const bed = (list) => (list.length ? `0.5*(1-min(1,${gaps(list)}))` : "0.5");
  const check = (f, extra = []) => {
    const r = node("sound.mjs", ["check", "--audio", f, ...extra]);
    let j = {}; try { j = JSON.parse(r.stdout); } catch {}
    return { j, w: (j.warnings || []).join(" | "), s: j.measures?.shape };
  };

  // no-breath
  const flat = check(mk("flat25", bed([]), 25));
  ok("sound shape: a flat 25 s bed is no-breath, with the numbers", /no-breath/.test(flat.w) && flat.s?.breaks?.found?.length === 0 && flat.s.breaks.need === 2, flat.w);
  const one = check(mk("one25", bed([[8, 8.5]]), 25));
  ok("sound shape: one break in a 25 s film is still no-breath (needs 2)", /no-breath/.test(one.w) && one.s?.breaks?.found?.length === 1, one.w + JSON.stringify(one.s?.breaks));
  const two = check(mk("two25", bed([[8, 8.5], [15, 15.4]]), 25));
  ok("sound shape: two breaks in a 25 s film pass", !/no-breath/.test(two.w) && two.s?.breaks?.found?.length === 2, two.w + JSON.stringify(two.s?.breaks));
  const tail = check(mk("tail25", bed([[8, 8.5], [24.0, 24.6]]), 25));
  ok("sound shape: a gap in the tail does not count as a break", /no-breath/.test(tail.w) && tail.s?.breaks?.found?.length === 1, JSON.stringify(tail.s?.breaks));
  const head = check(mk("head25", bed([[0, 0.45], [8, 8.5]]), 25));
  ok("sound shape: a gap in the first 0.5 s does not count as a break", /no-breath/.test(head.w) && head.s?.breaks?.found?.length === 1, JSON.stringify(head.s?.breaks));
  const short = check(mk("short10", bed([[5, 5.4]]), 10));
  ok("sound shape: one break is enough for a short film", !/no-breath/.test(short.w) && short.s?.breaks?.need === 1, short.w);
  const shortFlat = check(mk("short10flat", bed([]), 10));
  ok("sound shape: a flat short film is no-breath (needs 1)", /no-breath/.test(shortFlat.w), shortFlat.w);

  // no-split-edits: five 4 s scenes, cuts at 4, 8, 12, 16
  const scenes = path.join(dir, "scenes.json");
  fs.writeFileSync(scenes, JSON.stringify({ scenes: [1, 2, 3, 4, 5].map((n) => ({ n, title: `S${n}`, duration_s: 4, voiceover: "words" })) }));
  const vo = (list, name) => mk(name, `min(1,${gaps(list)})`, 20);
  const mix = mk("mix20", bed([[6, 6.4], [13, 13.4]]), 20);
  // every phrase sits inside its scene, 0.5 s clear of both cuts
  const steps = check(mix, ["--vo", vo([[0.5, 3.4], [4.5, 7.4], [8.5, 11.4], [12.5, 15.4], [16.5, 19.4]], "vo-steps"), "--scenes", scenes]);
  ok("sound shape: a VO that stops on every cut is no-split-edits, listing where one would fit", /no-split-edits/.test(steps.w) && steps.s?.split_edits?.count === 0 && /would fit at 4 s/.test(steps.w), steps.w + JSON.stringify(steps.s?.split_edits));
  // J at 4 (phrase starts 3.2 and runs on), L at 12 (phrase from 9 ends 12.7)
  const split = check(mix, ["--vo", vo([[0.5, 2.9], [3.2, 7.0], [7.5, 8.0], [9.0, 12.7], [14.5, 19.0]], "vo-split"), "--scenes", scenes]);
  ok("sound shape: a J-cut and an L-cut pass, with the cuts named", !/no-split-edits/.test(split.w) && split.s?.split_edits?.count >= 2 && split.s.split_edits.j_cuts.includes(4) && split.s.split_edits.l_cuts.includes(12), split.w + JSON.stringify(split.s?.split_edits));
  // the same from word timings (scene-relative, no stem): "two" 3.2-3.9 runs into "three" at 4.0 (a J-cut at 4), "six" 11.0-12.7 crosses 12
  const meta = path.join(dir, "audio_meta.json");
  fs.writeFileSync(meta, JSON.stringify({ voices: [
    { frame: 1, words: [{ text: "one", start: 0.5, end: 1.0 }, { text: "two", start: 3.2, end: 3.9 }] },
    { frame: 2, words: [{ text: "three", start: 0.0, end: 0.6 }, { text: "four", start: 0.7, end: 3.0 }] },
    { frame: 3, words: [{ text: "five", start: 0.2, end: 0.8 }, { text: "six", start: 3.0, end: 4.7 }] },
    { frame: 4, words: [{ text: "seven", start: 1.0, end: 1.5 }] },
  ] }));
  const words = check(mix, ["--narrated", "--words", meta, "--scenes", scenes]);
  ok("sound shape: word timings give the phrases (a J-cut at 4, a split at 12)", words.s?.split_edits?.from === "word timings" && words.s.split_edits.count >= 2 && words.s.split_edits.j_cuts.includes(4), words.w + JSON.stringify(words.s?.split_edits));
  const noVo = check(mix, ["--narrated", "--scenes", scenes]);
  ok("sound shape: a narrated film with no VO stem or word timings skips the split-edit check, no warning", noVo.s?.split_edits?.skipped && !/no-split-edits/.test(noVo.w), JSON.stringify(noVo.s?.split_edits));
  const silent = check(mix, ["--scenes", scenes]);
  ok("sound shape: an unnarrated film is not asked for split edits", silent.s?.split_edits == null && !/no-split-edits/.test(silent.w), silent.w);
  const fewCuts = path.join(dir, "few.json");
  fs.writeFileSync(fewCuts, JSON.stringify({ scenes: [{ duration_s: 10 }, { duration_s: 10 }] }));
  const few = check(mix, ["--vo", vo([[0.5, 9.5], [10.5, 19]], "vo-few"), "--scenes", fewCuts]);
  ok("sound shape: under 4 cuts the split-edit check skips with the count", /needs 4/.test(few.s?.split_edits?.skipped || "") && !/no-split-edits/.test(few.w), JSON.stringify(few.s?.split_edits));
  ok("sound shape: both are warnings only, never a problem", [flat, steps].every((r) => (r.j.problems || []).every((p) => !/breath|split/i.test(p.what))), JSON.stringify(steps.j.problems));
}
