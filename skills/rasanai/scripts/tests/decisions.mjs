// selftest section "decisions": the append-only decision log (a changed decision needs --because, the old call is kept
// in decisions_history) and no silent downgrades (lib/downgrade.mjs -> downgrades.jsonl -> session.downgrades).
// export default async function ({ ok, tmp }). Spawns console.mjs itself with its own env (headless: no server).
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export default async function ({ ok, tmp }) {
  const run = path.join(tmp, "decisions-run");
  fs.mkdirSync(run, { recursive: true });
  const env = { ...process.env, RASANAI_CONSOLE_HEADLESS: "1" };
  delete env.RASANAI_RUN;
  const con = (a, e = {}) => spawnSync(process.execPath, [path.join(HERE, "console.mjs"), ...a, "--run", run], { encoding: "utf8", env: { ...env, ...e }, timeout: 60000 });
  const sess = () => JSON.parse(fs.readFileSync(path.join(run, "session.json"), "utf8"));
  const push = (decision, more = []) => con(["push", "--step", "music", "--status", "done", "--data", JSON.stringify({ decision }), ...more]);

  const p1 = push("Track A: warm, 100 BPM");
  ok("decisions: a first decision is never refused", p1.status === 0 && sess().steps.music.decision === "Track A: warm, 100 BPM", p1.stderr);
  const p2 = push("Track A: warm, 100 BPM");
  ok("decisions: an identical re-push is fine and adds no history", p2.status === 0 && !sess().steps.music.decisions_history, p2.stderr);
  const p3 = push("Track B: sparse, 90 BPM");
  ok("decisions: a changed decision without --because is refused (exit 2) and nothing changes", p3.status === 2 && /--because/.test(p3.stderr) && sess().steps.music.decision === "Track A: warm, 100 BPM", p3.stderr);
  const p4 = push("Track B: sparse, 90 BPM", ["--because", "A fights the narration"]);
  const h = (sess().steps.music.decisions_history || []);
  ok("decisions: with --because the change goes through and the old call is kept (decision, at, replaced_by, because)", p4.status === 0 && sess().steps.music.decision === "Track B: sparse, 90 BPM" && h.length === 1 && h[0].decision === "Track A: warm, 100 BPM" && h[0].replaced_by === "Track B: sparse, 90 BPM" && h[0].because === "A fights the narration" && !!h[0].at, p4.stderr + JSON.stringify(h));
  const p5 = push("Track C", ["--because", "short"]);
  ok("decisions: a --because under 8 characters does not count", p5.status === 2, p5.stderr);
  const p6 = con(["push", "--step", "music", "--status", "done", "--data", JSON.stringify({ decision: "Track C: none", because: "the film breathes without it" })]);
  const h2 = sess().steps.music.decisions_history || [];
  ok("decisions: data.because works too, history grows, and survives a re-push of the step", p6.status === 0 && h2.length === 2 && !("because" in sess().steps.music) && push("Track C: none").status === 0 && (sess().steps.music.decisions_history || []).length === 2, p6.stderr);
  const page = fs.readFileSync(path.join(HERE, "..", "console", "index.html"), "utf8");
  ok("decisions: the drawer shows the history struck through and a 'Working without' group", /decisions_history/.test(page) && /Working without/.test(page) && /h\("s"/.test(page));

  // ---- downgrades
  const dg = await import(path.join(HERE, "lib", "downgrade.mjs"));
  const none = dg.noteDowngrade({ what: "x", instead: "y" });
  ok("downgrade: no run (no arg, no RASANAI_RUN) is skipped silently, never a crash", none === null || typeof none === "object");
  const row = dg.noteDowngrade({ run, what: "image generation", instead: "procedural plates", why: "Codex is not signed in", impact: "plates are abstract" });
  const lines = fs.readFileSync(path.join(run, "downgrades.jsonl"), "utf8").trim().split("\n");
  ok("downgrade: noteDowngrade appends one JSON row to <run>/downgrades.jsonl", !!row && lines.length === 1 && JSON.parse(lines[0]).what === "image generation");
  const viaEnv = spawnSync(process.execPath, ["-e", `import(${JSON.stringify(path.join(HERE, "lib", "downgrade.mjs"))}).then(m => m.noteDowngrade({ what: "a curated track", instead: "no track", why: "offline" }))`], { env: { ...env, RASANAI_RUN: run }, encoding: "utf8" });
  ok("downgrade: the run is found from RASANAI_RUN", viaEnv.status === 0 && fs.readFileSync(path.join(run, "downgrades.jsonl"), "utf8").trim().split("\n").length === 2, viaEnv.stderr);
  push("Track C: none");
  push("Track C: none");
  const d = sess().downgrades || [];
  const feed = (sess().activity || []).filter((a) => /^Working without/.test(a.msg));
  ok("downgrade: push merges unseen rows into session.downgrades once (no duplicates on repeated pushes), with a feed line each", d.length === 2 && feed.length === 2 && /Working without image generation: using procedural plates because Codex is not signed in/.test(feed[0].msg), JSON.stringify({ d: d.length, feed: feed.map((f) => f.msg) }));
  const cli = con(["downgrade", "--what", "WebGL", "--instead", "a CSS specimen", "--why", "no GPU in this session", "--impact", "no real 3D"]);
  const cj = (() => { try { return JSON.parse(cli.stdout); } catch { return {}; } })();
  ok("downgrade: console.mjs downgrade logs one by hand and merges it", cli.status === 0 && cj.downgrades === 3 && (sess().downgrades || []).some((g) => g.what === "WebGL" && g.impact === "no real 3D"), cli.stdout + cli.stderr);
  const bad = con(["downgrade", "--what", "x"]);
  ok("downgrade: the CLI wants --what, --instead and --why", bad.status !== 0);
}
