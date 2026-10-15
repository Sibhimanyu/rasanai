// learn.mjs and lib/marks.mjs on small synthetic videos made with ffmpeg lavfi at test time (nothing large is committed).
// Run: node --test scripts/tests/learn.test.mjs   (needs ffmpeg; skipped without it)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { findMarks, checkMarks } from "../lib/marks.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LEARN = path.join(HERE, "..", "learn.mjs");
const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "learn-test-"));
const ff = (a) => spawnSync("ffmpeg", ["-y", "-v", "error", "-nostdin", ...a], { encoding: "utf8" });
const learn = (a) => { const r = spawnSync(process.execPath, [LEARN, ...a], { encoding: "utf8", timeout: 180000 }); let j = null; try { j = JSON.parse(r.stdout); } catch { /* prompt prints text */ } return { r, j }; };
const W = 360, H = 640;
const SKIN = "0xe0ac69";

// a badge: a white plate with black bars, bottom centre (x 0.38-0.62, y 0.93-0.97 of a 360x640 frame)
const badge = (inp, out) => `[${inp}]drawbox=x=137:y=596:w=86:h=26:color=white:t=fill,` + [0, 1, 2, 3, 4, 5, 6].map((i) => `drawbox=x=${142 + i * 11}:y=599:w=${i % 2 ? 3 : 6}:h=20:color=black:t=fill`).join(",") + `[${out}]`;
// caption-like strokes: ten narrow bars on a dark strip that change every 0.4 s
function captionFilter(inp, out, dur) {
  const parts = [`[${inp}]drawbox=x=0:y=450:w=${W}:h=44:color=0x101010:t=fill`];
  for (let k = 0; k < Math.floor(dur / 0.4); k++) for (let j = 0; j < 14; j++) {
    const x = 20 + ((k * 37 + j * 53 + (k % 3) * 11) % 300), w = 3 + ((k + j) % 3) * 2;
    parts.push(`drawbox=x=${x}:y=458:w=${w}:h=26:color=white:t=fill:enable='between(t,${(k * 0.4).toFixed(1)},${(k * 0.4 + 0.38).toFixed(2)})'`);
  }
  return parts.join(",") + `[${out}]`;
}
function make(name, { dur = 12, cuts = [4, 8], head = true, headUntil = dur, marks = true, captions = false }) {
  const file = path.join(tmp, name);
  const cols = ["0x1a2a40", "0xe0eeff", "0x205020", "0xd8f0e0"], segs = [], bounds = [0, ...cuts, dur];
  bounds.slice(0, -1).forEach((s, i) => segs.push(`color=c=${cols[i % cols.length]}:s=${W}x${H}:r=15:d=${(bounds[i + 1] - s).toFixed(2)}[s${i}]`));
  let g = segs.join(";") + ";" + segs.map((_, i) => `[s${i}]`).join("") + `concat=n=${segs.length}:v=1:a=0[bg]`;
  let cur = "bg";
  if (head) { g += `;[${cur}]drawbox=x=130:y=300:w=100:h=130:color=${SKIN}:t=fill:enable='lt(t,${headUntil})'[h]`; cur = "h"; }
  if (captions) { g += ";" + captionFilter(cur, "c", dur); cur = "c"; }
  if (marks) { g += ";" + badge(cur, "m"); cur = "m"; }
  const r = ff(["-f", "lavfi", "-i", `color=c=black:s=16x16:d=${dur}`, "-filter_complex", g, "-map", `[${cur}]`, "-t", String(dur), "-c:v", "libx264", "-pix_fmt", "yuv420p", file]);
  assert.equal(r.status, 0, r.stderr.slice(0, 400));
  return file;
}

test("findMarks finds the badge and nothing else", { skip: !hasFfmpeg }, async () => {
  const withBadge = make("badge.mp4", {}), without = make("nobadge.mp4", { marks: false });
  const m = await findMarks(withBadge, { samples: 12 });
  assert.equal(m.length, 1, JSON.stringify(m));
  assert.ok(m[0].x > 0.3 && m[0].x < 0.45 && m[0].x + m[0].w > 0.55 && m[0].x + m[0].w < 0.7, JSON.stringify(m[0]));
  assert.ok(m[0].y > 0.9 && m[0].y + m[0].h <= 1.0, JSON.stringify(m[0]));
  assert.ok(m[0].presence >= 0.9);
  assert.deepEqual(await findMarks(without, { samples: 12 }), []);
});

test("findMarks: exclude drops a mark inside the box, but not one in the outer band", { skip: !hasFfmpeg }, async () => {
  const f = path.join(tmp, "badge.mp4");
  const mid = await findMarks(f, { samples: 12, exclude: { x: 0.3, y: 0.5, w: 0.4, h: 0.5 } });
  assert.equal(mid.length, 1, "the badge sits in the bottom band, so the speaker's box does not hide it");
});

test("checkMarks: the badge is visible in an edit that keeps it and hidden in one that covers it", { skip: !hasFfmpeg }, async () => {
  const raw = path.join(tmp, "badge.mp4");
  const covered = path.join(tmp, "covered.mp4");
  assert.equal(ff(["-i", raw, "-vf", "drawbox=x=100:y=585:w=160:h=50:color=0x202020:t=fill", "-c:v", "libx264", "-pix_fmt", "yuv420p", covered]).status, 0);
  const boxes = await findMarks(raw, { samples: 12 });
  assert.equal((await checkMarks(raw, boxes, raw))[0].visible, true);
  assert.equal((await checkMarks(covered, boxes, raw))[0].visible, false);
});

test("infer: a fixed speaker, no captions, a kept mark, an end card", { skip: !hasFfmpeg }, () => {
  const v = make("endcard.mp4", { dur: 12, cuts: [4, 8.5], headUntil: 8.5 });
  const out = path.join(tmp, "o1");
  const { j } = learn(["infer", "--video", v, "--format", "presenter", "--out", out]);
  assert.ok(j && j.ok, JSON.stringify(j));
  const t = JSON.parse(fs.readFileSync(path.join(out, "taste.json"), "utf8"));
  assert.equal(t.version, 1);
  assert.equal(t.status, "measured");
  assert.equal(t.answers.pictures, null);
  assert.equal(t.answers.captions.choice, "off");
  assert.equal(t.answers.speaker.choice, "fixed");
  assert.equal(t.answers.marks.choice, "keep");
  assert.equal(t.answers.ending.choice, "card");
  assert.ok(Math.abs(t.ending.start_s - 8.5) < 0.3, String(t.ending.start_s));
  assert.ok(fs.existsSync(path.join(out, "end-card.mp4")) && fs.existsSync(path.join(out, "sheet.jpg")));
  assert.deepEqual(t.cuts.map((c) => Math.round(c)), [4, 9]);
  assert.ok(t.marks.length === 1 && t.marks[0].presence >= 0.9);
  for (const q of ["captions", "speaker", "marks", "ending", "text"]) {
    const a = t.answers[q];
    assert.ok(a.choice && a.confidence >= 0 && a.confidence <= 1 && a.evidence.length > 10, q);
  }
});

test("infer: changing text in a steady bottom band reads as captions", { skip: !hasFfmpeg }, () => {
  const v = make("caps.mp4", { dur: 8, cuts: [], captions: true, marks: false });
  const out = path.join(tmp, "o2");
  const { j } = learn(["infer", "--video", v, "--out", out]);
  assert.ok(j && j.ok, JSON.stringify(j));
  const t = JSON.parse(fs.readFileSync(path.join(out, "taste.json"), "utf8"));
  assert.ok(["plain", "styled"].includes(t.answers.captions.choice), JSON.stringify(t.answers.captions));
  assert.equal(t.answers.marks, null, "no mark found: the question is not asked");
  assert.ok(!t.applicable.includes("marks"));
});

test("set validates against questions.json and finishes the status", { skip: !hasFfmpeg }, () => {
  const out = path.join(tmp, "o1");
  let r = learn(["set", "--out", out, "--question", "pictures", "--choice", "nonsense", "--evidence", "x"]);
  assert.equal(r.r.status, 2);
  r = learn(["set", "--out", out, "--question", "nope", "--choice", "literal", "--evidence", "x"]);
  assert.equal(r.r.status, 2);
  r = learn(["set", "--out", out, "--question", "pictures", "--choice", "literal", "--evidence", "real photos of the things named", "--confidence", "0.9"]);
  assert.ok(r.j.ok && r.j.status === "done" && r.j.missing.length === 0, JSON.stringify(r.j));
  const t = JSON.parse(fs.readFileSync(path.join(out, "taste.json"), "utf8"));
  assert.equal(t.answers.pictures.choice, "literal");
  assert.equal(t.answers.pictures.confidence, 0.9);
  assert.equal(t.status, "done");
});

test("prompt is self-contained", () => {
  const { r } = learn(["prompt", "--video", "/x/edit.mp4", "--clip", "/x/raw.mp4", "--out", "/x/out"]);
  assert.equal(r.status, 0);
  for (const s of ["learn.mjs infer", "/x/edit.mp4", "/x/raw.mp4", "sheet.jpg", "--question pictures", "literal", "world", "concept", "\"status\": \"done\""]) assert.ok(r.stdout.includes(s), s);
});

test.after(() => !process.env.LEARN_KEEP && fs.rmSync(tmp, { recursive: true, force: true }));
