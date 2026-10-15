// selftest section "ab-learn": the blind A/B (crew.mjs ab: seeded X/Y shuffle, strips, a brief that never says which is newer, check
// maps the verdict back to keep / revert) and learning after a film (lessons.mjs --source self, the separate "Claude's own notes"
// block, the retrospective role's check). Uses two tiny ffmpeg clips; RASANAI_HOME is a temp dir.
// export default async function ({ ok, tmp }).
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export default async function ({ ok, tmp }) {
  const work = fs.mkdtempSync(path.join(tmp, "ab-learn-"));
  const home = path.join(work, "home");
  const env = { ...process.env, RASANAI_HOME: home, RASANAI_MODEL: "claude-opus-5-5" };
  const sh = (script, args) => spawnSync(process.execPath, [path.join(HERE, script), ...args], { encoding: "utf8", env, cwd: work, timeout: 180000 });
  const js = (r) => { try { return JSON.parse(r.stdout); } catch { return {}; } };
  const run = path.join(work, "run");
  fs.mkdirSync(path.join(run, "crew"), { recursive: true });

  // two 6 s clips with names that would give the order away if they reached the brief
  const clip = (name, color) => spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", `color=c=${color}:s=320x180:d=6:r=10`, "-pix_fmt", "yuv420p", path.join(work, name)]);
  clip("draft-old.mp4", "red"); clip("final-new.mp4", "blue");
  const A = path.join(work, "draft-old.mp4"), B = path.join(work, "final-new.mp4");
  if (!fs.existsSync(A) || !fs.existsSync(B)) { ok("ab-learn: ffmpeg made the two test clips", false, "ffmpeg missing?"); return; }

  const ab = (seed, n) => sh("crew.mjs", ["ab", "--run", run, "--a", A, "--b", B, "--seed", seed, "--n", String(n)]);
  const r1 = ab("seed-one", 1);
  ok("ab-learn: crew.mjs ab runs and writes the record, the strips and the juror's brief", r1.status === 0 && js(r1).ok && fs.existsSync(path.join(run, "crew", "ab-1.json")) && fs.existsSync(path.join(run, "crew", "ab-1", "strips", "rows.png")) && fs.existsSync(path.join(run, "crew", "ab-1", "strips", "phone-X.png")) && fs.existsSync(path.join(run, "crew", "ab-1", "strips", "phone-Y.png")) && fs.existsSync(path.join(run, "crew", "prompts", "ab-juror-1.md")), r1.stdout + r1.stderr);
  const rec = (n) => JSON.parse(fs.readFileSync(path.join(run, "crew", `ab-${n}.json`), "utf8"));
  const brief = fs.readFileSync(path.join(run, "crew", "prompts", "ab-juror-1.md"), "utf8");
  ok("ab-learn: the order is recorded (X and Y are one each of prev and new)", [rec(1).order.X, rec(1).order.Y].sort().join() === "new,prev", JSON.stringify(rec(1).order));
  const dispatchPart = brief.slice(brief.indexOf("## Dispatch context"), brief.indexOf("## How you work"));
  ok("ab-learn: the brief has no hint of which film is newer (no file names, no order, no 'newer')", !/draft-old|final-new|\.mp4|"new"|"prev"|ab-1\.json/.test(dispatchPart) && !/\b(newer|older|newest)\b/i.test(dispatchPart.replace(/never told|never be told/g, "")) && /X on a phone/.test(dispatchPart), dispatchPart);
  const orders = new Set(["a", "b", "c", "d", "e", "f", "g", "h"].map((s, i) => { ab(`s-${s}`, 10 + i); return rec(10 + i).order.X; }));
  ok("ab-learn: the shuffle is seeded and varies: the same seed gives the same order, different seeds give both", orders.size === 2 && (ab("seed-one", 2), rec(2).order.X === rec(1).order.X), [...orders].join());

  // the verdict maps back: the new version wins when the juror picks the slot it was shuffled into
  const verdict = (n, pick, extra = {}) => fs.writeFileSync(path.join(run, "crew", `ab-${n}-verdict.json`), JSON.stringify({ pick, reasons: ["boldness: at 3 s X fills the frame, Y does not", "ending: at 5.8 s Y holds a clean card"], scores: { X: { boldness: 7, readability: 7, ending: 6, rhythm: 7 }, Y: { boldness: 5, readability: 7, ending: 7, rhythm: 6 } }, loses_on: "Y has the cleaner ending", ...extra }));
  const chk = (n) => sh("crew.mjs", ["check", "--run", run, "--role", "ab-juror", "--key", String(n)]);
  const none = chk(1);
  ok("ab-learn: check refuses a missing verdict", none.status === 2 && /verdict.json is missing/.test(none.stdout), none.stdout);
  const newSlot = rec(1).order.X === "new" ? "X" : "Y", prevSlot = newSlot === "X" ? "Y" : "X";
  verdict(1, newSlot);
  const keep = chk(1);
  ok("ab-learn: picking the new version's slot prints keep", keep.status === 0 && js(keep).result === "keep" && rec(1).verdict.result === "keep", keep.stdout);
  verdict(1, prevSlot);
  const rev = chk(1);
  ok("ab-learn: picking the previous version's slot prints revert (and the record keeps it)", rev.status === 0 && js(rev).result === "revert" && /LOST/.test(js(rev).next) && rec(1).verdict.winner === "prev", rev.stdout);
  verdict(1, "X", { reasons: ["X is the newer one and cleaner overall", "ending: X holds"] });
  ok("ab-learn: a reason that guesses the order is refused", chk(1).status === 2);
  verdict(1, "tie");
  ok("ab-learn: no tie: pick must be X or Y", chk(1).status === 2);

  // lessons: source
  const les = (...a) => sh("lessons.mjs", a);
  const s1 = js(les("add", "--rule", "Give the ending its own change of scale", "--quote", "ab-2 loses_on", "--kind", "taste", "--area", "motion", "--source", "self"));
  ok("ab-learn: lessons add --source self stores source self; the default is user", s1.source === "self" && js(les("add", "--rule", "Cut on the beat", "--quote", "q", "--kind", "taste", "--area", "sound")).source === "user", JSON.stringify(s1));
  ok("ab-learn: a self lesson can never be a gate; a bad source is refused", les("add", "--rule", "x1", "--quote", "q", "--kind", "error", "--area", "type", "--source", "self", "--gate", "text.statement_min_h=0.05").status !== 0 && les("add", "--rule", "x2", "--kind", "error", "--area", "type", "--source", "robot").status !== 0);
  const bl = les("brief", "--role", "critic").stdout;
  ok("ab-learn: brief lists Claude's own notes apart and below the user's", /Standing notes from the user's past films/.test(bl) && /Claude's own notes from past films/.test(bl) && bl.indexOf("Cut on the beat") < bl.indexOf("Claude's own notes") && bl.indexOf("Claude's own notes") < bl.indexOf("change of scale"), bl);
  ok("ab-learn: list shows the source", /\bself\b.*change of scale/.test(les("list").stdout) && /\buser\b.*Cut on the beat/.test(les("list").stdout), les("list").stdout);
  const only = js(les("add", "--rule", "Only claude says this", "--kind", "taste", "--area", "story", "--source", "self"));
  les("drop", "--id", only.id);
  ok("ab-learn: a self lesson drops like any other", !les("list").stdout.includes("Only claude says this"));
  ok("ab-learn: the user saying a self rule makes it theirs", js(les("add", "--rule", "give the ending its own change of scale", "--quote", "the ending is flat", "--kind", "taste", "--area", "motion")).source === "user");

  // the retrospective role
  const retro = (o) => { fs.writeFileSync(path.join(run, "crew", "retrospective.json"), JSON.stringify(o)); return sh("crew.mjs", ["check", "--run", run, "--role", "retrospective"]); };
  const good = { rule: "Keep the giant type a fix round enlarged: shrinking it to clear a finding lost the A/B", area: "type", kind: "error", quote: "ab-2 loses_on: X sets the word at a quarter the size" };
  const rg = retro({ lessons: [good] });
  ok("ab-learn: retrospective check passes one rule and prints the lessons.mjs add --source self line", rg.status === 0 && /--source self/.test((js(rg).record || [])[0] || ""), rg.stdout);
  ok("ab-learn: retrospective refuses three rules, an empty answer without a reason, a bad area and a rule already known",
    retro({ lessons: [good, { ...good, rule: "b rule" }, { ...good, rule: "c rule" }] }).status === 2 && retro({ lessons: [] }).status === 2 && retro({ lessons: [{ ...good, area: "vibes" }] }).status === 2 && retro({ lessons: [{ ...good, rule: "Cut on the beat" }] }).status === 2);
  ok("ab-learn: retrospective allows none with a reason", retro({ lessons: [], none_because: "no round lost, no finding repeated" }).status === 0);
}
