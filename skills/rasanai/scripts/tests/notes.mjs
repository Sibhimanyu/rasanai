// Notes are answered: after `apply`, a push of animatic/render with a higher version is refused (exit 2) until the applied
// notes are resolved with a --note; --force "<reason>" overrides and is logged. Headless console, no server, no window.
// export default async function ({ ok, tmp, env }).
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const CONSOLE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "console.mjs");

export default async function ({ ok, tmp, env }) {
  const run = path.join(tmp, "notes-run");
  const henv = { ...env, RASANAI_CONSOLE_HEADLESS: "1" };
  const c = (...a) => spawnSync(process.execPath, [CONSOLE, ...a], { encoding: "utf8", env: henv, cwd: tmp, timeout: 30000 });
  const J = () => JSON.parse(fs.readFileSync(path.join(run, "session.json"), "utf8"));
  const act = (id, step, type, value, note = "") => fs.appendFileSync(path.join(run, "actions.jsonl"), JSON.stringify({ id, ts: new Date().toISOString(), step, type, value, note, source: "console" }) + "\n");
  const push = (step, v, ...x) => c("push", "--run", run, "--step", step, "--data", JSON.stringify({ version: v, video: "a.mp4" }), ...x);
  c("serve", "--run", run, "--root", tmp);
  ok("notes: the first push (version 1) is never refused", push("render", 1).status === 0);
  act("n1", "render", "comment", { t: 2, scope: "scene" }, "logo too small");
  act("n2", "render", "comment", { t: 5, scope: "scene" }, "slower here");
  act("n3", "render", "comment", { t: 7, scope: "scene" }, "not applied");
  for (const id of ["n1", "n2", "n3"]) c("wait", "--run", run, "--step", "render", "--timeout", "5");
  act("ap1", "render", "apply", { ids: ["n1", "n2"] });
  c("wait", "--run", run, "--step", "render", "--timeout", "5");
  ok("notes: wait records the applied ids", JSON.stringify(J().applied) === JSON.stringify(["n1", "n2"]), JSON.stringify(J().applied));
  const same = push("render", 1);
  ok("notes: a push without a higher version is not refused", same.status === 0, same.stderr);
  const r = push("render", 2);
  ok("notes: version+1 with applied notes unanswered is refused (exit 2) naming them", r.status === 2 && /n1, n2/.test(r.stderr) && /resolve/.test(r.stderr) && !/n3/.test(r.stderr) && J().steps.render.version === 1, r.stderr);
  ok("notes: the animatic is guarded too", (() => { c("push", "--run", run, "--step", "animatic", "--data", '{"version":1}'); return push("animatic", 2).status === 2; })());
  ok("notes: another step is not guarded", c("push", "--run", run, "--step", "look", "--data", '{"version":3}').status === 0);
  c("resolve", "--run", run, "--ids", "n1,n2");
  ok("notes: resolving without --note still refuses", push("render", 2).status === 2);
  c("resolve", "--run", run, "--ids", "n1", "--note", "bigger logo");
  ok("notes: one note still unanswered still refuses", push("render", 2).status === 2);
  c("resolve", "--run", run, "--ids", "n2", "--note", "eased the move");
  const good = push("render", 2);
  ok("notes: every applied note resolved with a note lets the revision through (n3, never applied, did not block)", good.status === 0 && J().steps.render.version === 2, good.stderr);
  act("ap2", "render", "apply", { ids: ["n3"] });
  c("wait", "--run", run, "--step", "render", "--timeout", "5");
  const bare = c("push", "--run", run, "--step", "render", "--data", '{"version":3}', "--force");
  ok("notes: --force needs a reason", bare.status !== 0 && J().steps.render.version === 2, bare.stderr);
  const forced = push("render", 3, "--force", "the reporter withdrew it");
  const s = J();
  ok("notes: --force \"<reason>\" overrides and logs the reason", forced.status === 0 && s.steps.render.version === 3 && s.forced && s.forced[0].reason === "the reporter withdrew it" && s.forced[0].ids[0] === "n3" && s.activity.some((x) => /unanswered: the reporter withdrew it/.test(x.msg)), JSON.stringify(s.forced));
  ok("notes: the next revision is clear", push("render", 4).status === 0);
}
